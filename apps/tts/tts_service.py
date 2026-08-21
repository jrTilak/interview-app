"""Local Piper text-to-speech HTTP service.

Run natively from this directory with::

    uvicorn tts_service:app --host 0.0.0.0 --port 8001 --workers 1
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
import io
import logging
from math import gcd
import os
from pathlib import Path
import threading
import time
import wave

from fastapi import FastAPI, HTTPException, Response
import numpy as np
from piper import PiperVoice
from pydantic import BaseModel, Field
from scipy.signal import resample_poly


LOGGER = logging.getLogger(__name__)

TARGET_SAMPLE_RATE = 24_000
MAX_TEXT_LENGTH = 4_000
SLOW_SYNTHESIS_SECONDS = 15
SCRIPT_DIR = Path(__file__).resolve().parent

VOICE_MODELS = {
    "professional-default": "en_US-lessac-medium.onnx",
}


def model_directory() -> Path:
    """Return the configured model directory, independent of the process cwd."""

    configured = os.environ.get("TTS_MODEL_DIR", "").strip()
    return Path(configured).expanduser().resolve() if configured else SCRIPT_DIR


loaded_voices: dict[str, PiperVoice] = {}

# Piper/ONNX synthesis is blocking. A non-blocking process-wide gate guarantees
# that a disconnected request can finish without later work queuing behind it.
# The container intentionally runs exactly one worker so the gate is global for
# the service instance.
synthesis_lock = threading.Lock()


def load_models() -> None:
    """Load every configured voice once, leaving readiness degraded on failure."""

    loaded_voices.clear()
    models = model_directory()
    for voice_name, filename in VOICE_MODELS.items():
        model_path = models / filename
        try:
            loaded_voices[voice_name] = PiperVoice.load(model_path)
            LOGGER.info("Loaded voice %r from %s", voice_name, model_path)
        except Exception:
            LOGGER.exception("Failed to load voice %r from %s", voice_name, model_path)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Load models during startup and release references during shutdown."""

    load_models()
    try:
        yield
    finally:
        loaded_voices.clear()


app = FastAPI(title="Local TTS Service", lifespan=lifespan)


class SynthesizeRequest(BaseModel):
    text: str = Field(..., description="Exact text to speak")
    voice: str = Field(default="professional-default", description="Voice name")


def validate_wav_bytes(
    wav_bytes: bytes, *, expected_rate: int | None = None
) -> tuple[int, bytes]:
    """Validate and decode a non-empty, uncompressed mono PCM16 WAV."""

    if len(wav_bytes) < 44:
        raise ValueError("WAV data is missing or truncated")

    try:
        with wave.open(io.BytesIO(wav_bytes), "rb") as wav_file:
            channels = wav_file.getnchannels()
            sample_width = wav_file.getsampwidth()
            sample_rate = wav_file.getframerate()
            compression = wav_file.getcomptype()
            frame_count = wav_file.getnframes()
            frames = wav_file.readframes(frame_count)
    except (EOFError, wave.Error) as error:
        raise ValueError("Invalid WAV data") from error

    if channels != 1:
        raise ValueError(f"Expected mono WAV, received {channels} channels")
    if sample_width != 2:
        raise ValueError(
            f"Expected 16-bit PCM WAV, received {sample_width * 8}-bit samples"
        )
    if compression != "NONE":
        raise ValueError(f"Expected uncompressed PCM WAV, received {compression}")
    if sample_rate <= 0:
        raise ValueError("WAV sample rate must be positive")
    if expected_rate is not None and sample_rate != expected_rate:
        raise ValueError(
            f"Expected {expected_rate} Hz WAV, received {sample_rate} Hz"
        )
    if frame_count <= 0 or not frames:
        raise ValueError("WAV contains no audio frames")
    if len(frames) != frame_count * channels * sample_width:
        raise ValueError("WAV audio frames are truncated")

    return sample_rate, frames


def resample_wav_bytes(wav_bytes: bytes, target_rate: int) -> bytes:
    """Validate a Piper WAV and return validated mono PCM16 at target_rate."""

    if target_rate <= 0:
        raise ValueError("Target sample rate must be positive")

    native_rate, frames = validate_wav_bytes(wav_bytes)
    if native_rate == target_rate:
        output = wav_bytes
    else:
        divisor = gcd(target_rate, native_rate)
        samples = np.frombuffer(frames, dtype="<i2")
        resampled = resample_poly(
            samples,
            target_rate // divisor,
            native_rate // divisor,
        )
        pcm16 = np.clip(resampled, -32_768, 32_767).astype("<i2")

        output_buffer = io.BytesIO()
        with wave.open(output_buffer, "wb") as output_wav:
            output_wav.setnchannels(1)
            output_wav.setsampwidth(2)
            output_wav.setframerate(target_rate)
            output_wav.writeframes(pcm16.tobytes())
        output = output_buffer.getvalue()

    # Validate the actual response too, including the no-resampling path.
    validate_wav_bytes(output, expected_rate=target_rate)
    return output


@app.get("/health")
def health(response: Response) -> dict[str, object]:
    """Report readiness; an unloaded model is an HTTP-level failure."""

    ready = bool(loaded_voices)
    response.status_code = 200 if ready else 503
    return {
        "status": "ok" if ready else "degraded",
        "voices_loaded": list(loaded_voices),
        "voices_configured": list(VOICE_MODELS),
    }


@app.post("/synthesize")
def synthesize(request: SynthesizeRequest) -> Response:
    """Synthesize one request without storing or queueing generated audio."""

    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Text must not be empty.")
    if len(request.text) > MAX_TEXT_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Text exceeds maximum length of {MAX_TEXT_LENGTH} characters.",
        )
    if request.voice not in VOICE_MODELS:
        raise HTTPException(status_code=400, detail="Unknown voice.")

    voice = loaded_voices.get(request.voice)
    if voice is None:
        raise HTTPException(status_code=503, detail="Requested voice is unavailable.")

    if not synthesis_lock.acquire(blocking=False):
        raise HTTPException(
            status_code=503,
            detail="Synthesis service is busy.",
            headers={"Retry-After": "1"},
        )

    started_at = time.monotonic()
    try:
        try:
            source_buffer = io.BytesIO()
            with wave.open(source_buffer, "wb") as source_wav:
                voice.synthesize_wav(request.text, source_wav)
            audio_bytes = resample_wav_bytes(
                source_buffer.getvalue(), TARGET_SAMPLE_RATE
            )
        except Exception:
            LOGGER.exception("Synthesis failed for voice %r", request.voice)
            raise HTTPException(status_code=500, detail="Synthesis failed.") from None
    finally:
        synthesis_lock.release()

    elapsed = time.monotonic() - started_at
    if elapsed > SLOW_SYNTHESIS_SECONDS:
        LOGGER.warning(
            "Synthesis for voice %r took %.1f seconds", request.voice, elapsed
        )

    return Response(
        content=audio_bytes,
        media_type="audio/wav",
        headers={
            "X-Sample-Rate": str(TARGET_SAMPLE_RATE),
            "X-Channels": "1",
            "X-Bit-Depth": "16",
        },
    )
