"""Local faster-whisper speech-to-text HTTP service.

Run natively from this directory with::

    uvicorn stt_service:app --host 0.0.0.0 --port 8002 --workers 1
"""

from __future__ import annotations

import asyncio
import io
import logging
import os
import threading
import time
import wave
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from math import gcd
from pathlib import Path
from typing import Annotated

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile
from faster_whisper import WhisperModel
from scipy.signal import resample_poly

LOGGER = logging.getLogger(__name__)

MODEL_SIZE = os.getenv("WHISPER_MODEL", "small").strip() or "small"
DEVICE = os.getenv("WHISPER_DEVICE", "cpu").strip() or "cpu"
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8").strip() or "int8"
TARGET_SAMPLE_RATE = 16_000
MIN_INPUT_SAMPLE_RATE = 8_000
MAX_INPUT_SAMPLE_RATE = 192_000
MAX_AUDIO_BYTES = int(os.getenv("STT_MAX_AUDIO_BYTES", str(10 * 1024 * 1024)))
MAX_AUDIO_SECONDS = int(os.getenv("STT_MAX_AUDIO_SECONDS", "180"))
TRANSCRIPTION_TIMEOUT_SECONDS = float(os.getenv("STT_TIMEOUT_SECONDS", "45"))
SLOW_TRANSCRIPTION_SECONDS = 15
SUPPORTED_MIME_TYPES = {"audio/wav", "audio/wave", "audio/x-wav", "audio/l16"}
SCRIPT_DIR = Path(__file__).resolve().parent


class AudioValidationError(ValueError):
    """Raised when caller-provided audio does not satisfy the service contract."""


model: WhisperModel | None = None

# faster-whisper inference is blocking. Admission is deliberately process-wide,
# non-blocking, and happens before the upload is read or decoded. The container
# runs exactly one Uvicorn worker so this gate covers the whole service instance.
transcription_gate = threading.Lock()

# A timed-out or disconnected caller must not release the gate while its native
# inference thread is still running. Strong references keep those tasks alive;
# their completion callback releases admission only when the worker really ends.
inference_tasks: set[asyncio.Task[str]] = set()


def model_directory() -> Path | None:
    """Return the optional model cache directory, independent of process cwd."""

    configured = os.environ.get("STT_MODEL_DIR", "").strip()
    return Path(configured).expanduser().resolve() if configured else None


def model_source() -> str:
    """Prefer an explicitly configured or predownloaded model directory."""

    configured_model = Path(MODEL_SIZE).expanduser()
    if configured_model.is_dir():
        return str(configured_model.resolve())

    models = model_directory()
    bundled_model = models / MODEL_SIZE if models is not None else None
    if bundled_model is not None and bundled_model.is_dir():
        return str(bundled_model)
    return MODEL_SIZE


def load_model() -> None:
    """Load the configured model once, leaving readiness degraded on failure."""

    global model
    model = None
    models = model_directory()
    try:
        if models is not None:
            models.mkdir(parents=True, exist_ok=True)
        model = WhisperModel(
            model_source(),
            device=DEVICE,
            compute_type=COMPUTE_TYPE,
            download_root=str(models) if models is not None else None,
            num_workers=1,
        )
        LOGGER.info(
            "Loaded Whisper model %r on %s (%s)",
            MODEL_SIZE,
            DEVICE,
            COMPUTE_TYPE,
        )
    except Exception:
        LOGGER.exception("Failed to load Whisper model %r", MODEL_SIZE)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Load the model during startup and release its reference on shutdown."""

    global model
    load_model()
    try:
        yield
    finally:
        model = None


app = FastAPI(title="Local Whisper STT Service", lifespan=lifespan)


def _normalize_mime_type(value: str | None) -> str:
    return (value or "").split(";", 1)[0].strip().lower()


def _validate_sample_rate(sample_rate: int) -> None:
    if sample_rate < MIN_INPUT_SAMPLE_RATE or sample_rate > MAX_INPUT_SAMPLE_RATE:
        raise AudioValidationError(
            f"Audio sample rate must be between {MIN_INPUT_SAMPLE_RATE} and "
            f"{MAX_INPUT_SAMPLE_RATE} Hz."
        )


def _decode_wav(audio_bytes: bytes) -> tuple[np.ndarray, int]:
    """Decode a complete mono/stereo uncompressed PCM16 WAV in memory."""

    if len(audio_bytes) < 44:
        raise AudioValidationError("WAV data is missing or truncated.")

    try:
        with wave.open(io.BytesIO(audio_bytes), "rb") as wav_file:
            channels = wav_file.getnchannels()
            sample_width = wav_file.getsampwidth()
            sample_rate = wav_file.getframerate()
            compression = wav_file.getcomptype()
            frame_count = wav_file.getnframes()
            frames = wav_file.readframes(frame_count)
    except (EOFError, wave.Error) as error:
        raise AudioValidationError("Invalid WAV audio.") from error

    if channels not in (1, 2):
        raise AudioValidationError("WAV must contain one or two channels.")
    if sample_width != 2:
        raise AudioValidationError("WAV must use 16-bit PCM.")
    if compression != "NONE":
        raise AudioValidationError("WAV must use uncompressed PCM.")
    _validate_sample_rate(sample_rate)
    if frame_count <= 0 or not frames:
        raise AudioValidationError("WAV contains no audio frames.")

    expected_bytes = frame_count * channels * sample_width
    if len(frames) != expected_bytes or len(frames) % (channels * sample_width):
        raise AudioValidationError("WAV audio frames are truncated.")

    audio = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
    if channels == 2:
        audio = audio.reshape(-1, channels).mean(axis=1)
    return audio, sample_rate


def _decode_pcm(
    audio_bytes: bytes,
    sample_rate: int | None,
    channels: int | None,
) -> tuple[np.ndarray, int]:
    """Decode this application's signed little-endian PCM16 convention."""

    if sample_rate is None or channels is None:
        raise AudioValidationError("Raw PCM requires sample_rate_hz and channels.")
    _validate_sample_rate(sample_rate)
    if channels not in (1, 2):
        raise AudioValidationError("Raw PCM must contain one or two channels.")
    if len(audio_bytes) % (2 * channels) != 0:
        raise AudioValidationError("Raw PCM has incomplete 16-bit samples.")

    audio = np.frombuffer(audio_bytes, dtype="<i2").astype(np.float32) / 32768.0
    if channels == 2:
        audio = audio.reshape(-1, channels).mean(axis=1)
    return audio, sample_rate


def _prepare_audio(
    audio_bytes: bytes,
    mime_type: str,
    sample_rate: int | None,
    channels: int | None,
) -> np.ndarray:
    """Validate, downmix, and resample one bounded candidate turn."""

    if mime_type == "audio/l16":
        audio, native_rate = _decode_pcm(audio_bytes, sample_rate, channels)
    else:
        audio, native_rate = _decode_wav(audio_bytes)

    duration = len(audio) / native_rate
    if duration <= 0:
        raise AudioValidationError("Audio contains no samples.")
    if duration > MAX_AUDIO_SECONDS:
        raise AudioValidationError(
            f"Audio duration exceeds {MAX_AUDIO_SECONDS} seconds."
        )

    if native_rate != TARGET_SAMPLE_RATE:
        factor = gcd(TARGET_SAMPLE_RATE, native_rate)
        audio = resample_poly(
            audio,
            TARGET_SAMPLE_RATE // factor,
            native_rate // factor,
        )
    return np.asarray(audio, dtype=np.float32)


def _transcribe_waveform(waveform: np.ndarray) -> str:
    active_model = model
    if active_model is None:
        raise RuntimeError("Whisper model is not loaded")
    segments, _ = active_model.transcribe(
        waveform,
        language="en",
        vad_filter=True,
        beam_size=5,
    )
    return " ".join(segment.text.strip() for segment in segments).strip()


def _finish_inference(task: asyncio.Task[str]) -> None:
    """Consume a background result and release admission after real completion."""

    try:
        if not task.cancelled():
            task.exception()
    finally:
        inference_tasks.discard(task)
        transcription_gate.release()


def _start_inference(waveform: np.ndarray) -> asyncio.Task[str]:
    task = asyncio.create_task(
        asyncio.to_thread(_transcribe_waveform, waveform),
        name="local-stt-inference",
    )
    inference_tasks.add(task)
    task.add_done_callback(_finish_inference)
    return task


@app.get("/health")
@app.get("/status")
def health(response: Response) -> dict[str, object]:
    """Report readiness; an unloaded model is an HTTP-level failure."""

    ready = model is not None
    response.status_code = 200 if ready else 503
    return {
        "status": "ok" if ready else "degraded",
        "model": MODEL_SIZE,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
    }


@app.post("/transcribe")
async def transcribe(
    audio: Annotated[UploadFile, File()],
    sample_rate_hz: Annotated[int | None, Form()] = None,
    channels: Annotated[int | None, Form()] = None,
) -> dict[str, str]:
    """Transcribe one completed answer without storing or queueing audio."""

    if model is None:
        raise HTTPException(status_code=503, detail="Whisper model is not loaded.")

    mime_type = _normalize_mime_type(audio.content_type)
    if mime_type not in SUPPORTED_MIME_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported audio type.")

    if not transcription_gate.acquire(blocking=False):
        raise HTTPException(
            status_code=503,
            detail="Transcription service is busy.",
            headers={"Retry-After": "1"},
        )

    # Until inference starts, this request owns the gate and must release it on
    # validation/read failures. Once a task exists, its callback owns release.
    inference_started = False
    started_at = time.monotonic()
    try:
        if audio.size is not None and audio.size > MAX_AUDIO_BYTES:
            raise HTTPException(
                status_code=413,
                detail="Audio exceeds the maximum byte limit.",
            )
        audio_bytes = await audio.read(MAX_AUDIO_BYTES + 1)
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Audio must not be empty.")
        if len(audio_bytes) > MAX_AUDIO_BYTES:
            raise HTTPException(
                status_code=413,
                detail="Audio exceeds the maximum byte limit.",
            )

        try:
            waveform = _prepare_audio(
                audio_bytes,
                mime_type,
                sample_rate_hz,
                channels,
            )
        except AudioValidationError as error:
            raise HTTPException(status_code=422, detail=str(error)) from None

        inference = _start_inference(waveform)
        inference_started = True
        try:
            text = await asyncio.wait_for(
                asyncio.shield(inference),
                timeout=TRANSCRIPTION_TIMEOUT_SECONDS,
            )
        except TimeoutError:
            raise HTTPException(
                status_code=504,
                detail="Transcription timed out.",
            ) from None
    except HTTPException:
        raise
    except asyncio.CancelledError:
        raise
    except Exception:
        LOGGER.exception("Transcription request failed")
        raise HTTPException(status_code=500, detail="Transcription failed.") from None
    finally:
        if not inference_started:
            transcription_gate.release()

    elapsed = time.monotonic() - started_at
    if elapsed > SLOW_TRANSCRIPTION_SECONDS:
        LOGGER.warning("Transcription took %.1f seconds", elapsed)
    return {"text": text}
