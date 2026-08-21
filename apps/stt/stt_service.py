"""Local Whisper speech-to-text service.

Run:
    uvicorn stt_service:app --host 0.0.0.0 --port 8002

Endpoints:
    POST /transcribe -> accepts one audio upload and returns JSON text
    GET /status      -> confirms the Whisper model is loaded
"""

from __future__ import annotations

import asyncio
import io
import os
import time
import wave
from math import gcd

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from faster_whisper import WhisperModel
from scipy.signal import resample_poly

MODEL_SIZE = os.getenv("WHISPER_MODEL", "small")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
TARGET_SAMPLE_RATE = 16_000
MAX_AUDIO_BYTES = int(os.getenv("STT_MAX_AUDIO_BYTES", str(10 * 1024 * 1024)))
MAX_AUDIO_SECONDS = int(os.getenv("STT_MAX_AUDIO_SECONDS", "180"))
TRANSCRIPTION_TIMEOUT_SECONDS = int(os.getenv("STT_TIMEOUT_SECONDS", "45"))
SUPPORTED_MIME_TYPES = {"audio/wav", "audio/wave", "audio/x-wav", "audio/l16"}

model: WhisperModel | None = None
transcription_lock = asyncio.Lock()
app = FastAPI(title="Local Whisper STT Service")


def _normalize_mime_type(value: str | None) -> str:
    return (value or "").split(";", 1)[0].strip().lower()


def _decode_wav(audio_bytes: bytes) -> tuple[np.ndarray, int]:
    try:
        with wave.open(io.BytesIO(audio_bytes), "rb") as wav_file:
            channels = wav_file.getnchannels()
            sample_width = wav_file.getsampwidth()
            sample_rate = wav_file.getframerate()
            frames = wav_file.readframes(wav_file.getnframes())
    except (wave.Error, EOFError) as error:
        raise HTTPException(status_code=422, detail=f"Invalid WAV audio: {error}") from error
    if channels < 1 or channels > 2:
        raise HTTPException(status_code=422, detail="WAV must contain one or two channels.")
    if sample_width != 2:
        raise HTTPException(status_code=422, detail="WAV must use 16-bit PCM.")
    if sample_rate < 1:
        raise HTTPException(status_code=422, detail="WAV sample rate is invalid.")
    audio = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
    if channels == 2:
        audio = audio.reshape(-1, channels).mean(axis=1)
    return audio, sample_rate


def _decode_pcm(audio_bytes: bytes, sample_rate: int | None, channels: int | None) -> tuple[np.ndarray, int]:
    if sample_rate is None or channels is None:
        raise HTTPException(status_code=422, detail="Raw PCM requires sample_rate_hz and channels.")
    if sample_rate < 1 or sample_rate > 192_000 or channels not in (1, 2):
        raise HTTPException(status_code=422, detail="Raw PCM format is invalid.")
    if len(audio_bytes) % (2 * channels) != 0:
        raise HTTPException(status_code=422, detail="Raw PCM has incomplete 16-bit samples.")
    audio = np.frombuffer(audio_bytes, dtype="<i2").astype(np.float32) / 32768.0
    if channels == 2:
        audio = audio.reshape(-1, channels).mean(axis=1)
    return audio, sample_rate


def _prepare_audio(audio_bytes: bytes, mime_type: str, sample_rate: int | None, channels: int | None) -> np.ndarray:
    if mime_type == "audio/l16":
        audio, native_rate = _decode_pcm(audio_bytes, sample_rate, channels)
    else:
        audio, native_rate = _decode_wav(audio_bytes)
    duration = len(audio) / native_rate
    if duration <= 0 or duration > MAX_AUDIO_SECONDS:
        raise HTTPException(status_code=413, detail=f"Audio duration must be between 0 and {MAX_AUDIO_SECONDS} seconds.")
    if native_rate != TARGET_SAMPLE_RATE:
        factor = gcd(TARGET_SAMPLE_RATE, native_rate)
        audio = resample_poly(audio, TARGET_SAMPLE_RATE // factor, native_rate // factor)
    return np.asarray(audio, dtype=np.float32)


def _transcribe_waveform(waveform: np.ndarray) -> str:
    if model is None:
        raise RuntimeError("Whisper model is not loaded")
    segments, _ = model.transcribe(waveform, language="en", vad_filter=True, beam_size=5)
    return " ".join(segment.text.strip() for segment in segments).strip()


@app.on_event("startup")
def load_model() -> None:
    global model
    try:
        model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)
        print(f"Loaded Whisper model '{MODEL_SIZE}' on {DEVICE} ({COMPUTE_TYPE})")
    except Exception as error:
        print(f"FAILED to load Whisper model '{MODEL_SIZE}': {error}")


@app.get("/status")
def status() -> dict[str, object]:
    return {"status": "ok" if model is not None else "degraded", "model": MODEL_SIZE, "device": DEVICE}


@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    sample_rate_hz: int | None = Form(None),
    channels: int | None = Form(None),
) -> dict[str, str]:
    if model is None:
        raise HTTPException(status_code=503, detail="Whisper model is not loaded.")
    mime_type = _normalize_mime_type(audio.content_type)
    if mime_type not in SUPPORTED_MIME_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported audio type: {mime_type or 'missing'}")
    audio_bytes = await audio.read(MAX_AUDIO_BYTES + 1)
    if len(audio_bytes) == 0:
        raise HTTPException(status_code=400, detail="Audio must not be empty.")
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio exceeds the maximum byte limit.")
    waveform = _prepare_audio(audio_bytes, mime_type, sample_rate_hz, channels)
    started = time.monotonic()
    try:
        async with transcription_lock:
            text = await asyncio.wait_for(
                asyncio.to_thread(_transcribe_waveform, waveform),
                timeout=TRANSCRIPTION_TIMEOUT_SECONDS,
            )
    except asyncio.TimeoutError as error:
        raise HTTPException(status_code=504, detail="Transcription timed out.") from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {error}") from error
    elapsed = time.monotonic() - started
    if elapsed > TRANSCRIPTION_TIMEOUT_SECONDS:
        print(f"WARNING: transcription took {elapsed:.1f}s")
    return {"text": text}
