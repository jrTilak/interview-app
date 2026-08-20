"""


Run:
    uvicorn tts_service:app --host 0.0.0.0 --port 8001

Endpoints:
    POST /synthesize   -> returns audio bytes (WAV)
    GET  /health        -> confirms voice model is loaded
"""

from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel, Field
from piper import PiperVoice
import wave
import io
import time
import numpy as np
from scipy.signal import resample_poly

TARGET_SAMPLE_RATE = 24000  


VOICE_MODELS = {
    "professional-default": "en_US-lessac-medium.onnx",
   
}

MAX_TEXT_LENGTH = 2000  
DEFAULT_TIMEOUT_SECONDS = 15


def resample_wav_bytes(wav_bytes: bytes, target_rate: int) -> bytes:
    """
    Takes raw WAV bytes (mono, 16-bit PCM) at whatever native rate Piper
    produced, and returns new WAV bytes resampled to target_rate.
    If already at target_rate, returns the input unchanged.
    """
    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        n_channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        native_rate = wf.getframerate()
        frames = wf.readframes(wf.getnframes())

    if native_rate == target_rate:
        return wav_bytes 


    audio = np.frombuffer(frames, dtype=np.int16)


    if n_channels > 1:
        audio = audio.reshape(-1, n_channels)

  
    from math import gcd
    g = gcd(target_rate, native_rate)
    up = target_rate // g
    down = native_rate // g

    resampled = resample_poly(audio, up, down, axis=0)
    resampled = np.clip(resampled, -32768, 32767).astype(np.int16)


    out_buffer = io.BytesIO()
    with wave.open(out_buffer, "wb") as out_wf:
        out_wf.setnchannels(n_channels)
        out_wf.setsampwidth(sampwidth)
        out_wf.setframerate(target_rate)
        out_wf.writeframes(resampled.tobytes())

    out_buffer.seek(0)
    return out_buffer.read()


loaded_voices: dict[str, PiperVoice] = {}

app = FastAPI(title="Local TTS Service")


@app.on_event("startup")
def load_models():
    for voice_name, model_path in VOICE_MODELS.items():
        try:
            loaded_voices[voice_name] = PiperVoice.load(model_path)
            print(f"Loaded voice '{voice_name}' from {model_path}")
        except Exception as e:
           
            print(f"FAILED to load voice '{voice_name}': {e}")



class SynthesizeRequest(BaseModel):
    text: str = Field(..., description="Exact text to speak")
    voice: str = Field(default="professional-default", description="Voice name")



@app.get("/health")
def health():
    return {
        "status": "ok" if loaded_voices else "degraded",
        "voices_loaded": list(loaded_voices.keys()),
        "voices_configured": list(VOICE_MODELS.keys()),
    }



@app.post("/synthesize")
def synthesize(req: SynthesizeRequest):
    # --- Reject empty text ---
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="Text must not be empty.")

    # --- Reject text over max length ---
    if len(req.text) > MAX_TEXT_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Text exceeds maximum length of {MAX_TEXT_LENGTH} characters.",
        )

    # --- Reject unknown voice ---
    if req.voice not in loaded_voices:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown voice '{req.voice}'. Available: {list(loaded_voices.keys())}",
        )

    voice = loaded_voices[req.voice]

    # --- Generate audio, with a basic timeout guard ---
    start = time.time()
    try:
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav_file:
            voice.synthesize_wav(req.text, wav_file)
        buffer.seek(0)
        audio_bytes = buffer.read()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {e}")

    elapsed = time.time() - start
    if elapsed > DEFAULT_TIMEOUT_SECONDS:
 
        print(f"WARNING: synthesis took {elapsed:.1f}s, exceeding {DEFAULT_TIMEOUT_SECONDS}s")

    # --- Reject if somehow empty output ---
    if not audio_bytes or len(audio_bytes) < 44:  # 44 bytes = bare WAV header, no data
        raise HTTPException(status_code=500, detail="Synthesis produced empty audio.")

    # --- Resample to the target rate (24kHz) so NestJS never has to convert ---
    try:
        audio_bytes = resample_wav_bytes(audio_bytes, TARGET_SAMPLE_RATE)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Resampling failed: {e}")

    return Response(
        content=audio_bytes,
        media_type="audio/wav",
        headers={
            "X-Sample-Rate": str(TARGET_SAMPLE_RATE),
            "X-Channels": "1",
            "X-Bit-Depth": "16",
        },
    )

    # Note: no audio is written to disk anywhere in this flow — generated
    # entirely in memory and discarded after the response is sent, matching
    # "do not store generated interview audio after the request finishes."
