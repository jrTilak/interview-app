"""Focused contract tests for the local STT service using test doubles."""

from __future__ import annotations

import asyncio
import io
import os
import struct
import tempfile
import threading
import unittest
import wave
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
import stt_service
from fastapi import HTTPException, Response, UploadFile
from starlette.datastructures import Headers


def make_wav(
    *,
    channels: int = 1,
    sample_width: int = 2,
    sample_rate: int = 16_000,
    frame_count: int = 160,
) -> bytes:
    """Create short deterministic PCM WAV bytes."""

    frames = b"\x00" * (frame_count * channels * sample_width)
    output = io.BytesIO()
    with wave.open(output, "wb") as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(sample_width)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(frames)
    return output.getvalue()


def make_upload(data: bytes, content_type: str = "audio/wav") -> UploadFile:
    return UploadFile(
        io.BytesIO(data),
        size=len(data),
        filename="answer.wav",
        headers=Headers({"content-type": content_type}),
    )


class FakeModel:
    def __init__(self, texts: tuple[str, ...] = (" hello ", "world")) -> None:
        self.texts = texts
        self.calls: list[tuple[np.ndarray, dict[str, object]]] = []

    def transcribe(self, waveform: np.ndarray, **kwargs: object):
        self.calls.append((waveform, kwargs))
        segments = iter(SimpleNamespace(text=text) for text in self.texts)
        return segments, object()


class BrokenModel:
    def transcribe(self, _waveform: np.ndarray, **_kwargs: object):
        raise RuntimeError("private engine detail")


class BlockingModel(FakeModel):
    def __init__(self) -> None:
        super().__init__(("finished",))
        self.started = threading.Event()
        self.release = threading.Event()

    def transcribe(self, waveform: np.ndarray, **kwargs: object):
        self.started.set()
        if not self.release.wait(timeout=5):
            raise RuntimeError("test inference was not released")
        return super().transcribe(waveform, **kwargs)


class UnreadableUpload:
    content_type = "audio/wav"
    size = 100

    async def read(self, _size: int) -> bytes:
        raise AssertionError("busy request must be rejected before reading audio")


class SttServiceValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        stt_service.model = None

    def tearDown(self) -> None:
        stt_service.model = None

    def test_model_directory_is_optional_and_resolves_configured_path(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(stt_service.model_directory())

        with (
            tempfile.TemporaryDirectory() as directory,
            patch.dict(os.environ, {"STT_MODEL_DIR": directory}, clear=False),
        ):
            self.assertEqual(stt_service.model_directory(), Path(directory))

    def test_model_source_prefers_predownloaded_named_directory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            expected = Path(directory) / "small"
            expected.mkdir()
            with (
                patch.dict(os.environ, {"STT_MODEL_DIR": directory}, clear=False),
                patch.object(stt_service, "MODEL_SIZE", "small"),
            ):
                self.assertEqual(stt_service.model_source(), str(expected))

    def test_load_model_uses_pinned_single_worker_configuration(self) -> None:
        loaded = FakeModel()
        with tempfile.TemporaryDirectory() as directory:
            expected = Path(directory) / "small"
            expected.mkdir()
            with (
                patch.dict(os.environ, {"STT_MODEL_DIR": directory}, clear=False),
                patch.object(stt_service, "MODEL_SIZE", "small"),
                patch.object(
                    stt_service,
                    "WhisperModel",
                    return_value=loaded,
                ) as constructor,
            ):
                stt_service.load_model()

        constructor.assert_called_once_with(
            str(expected),
            device=stt_service.DEVICE,
            compute_type=stt_service.COMPUTE_TYPE,
            download_root=directory,
            num_workers=1,
        )
        self.assertIs(stt_service.model, loaded)

    def test_load_failure_leaves_readiness_degraded(self) -> None:
        with (
            patch.object(
                stt_service,
                "WhisperModel",
                side_effect=RuntimeError("private load failure"),
            ),
            self.assertLogs(stt_service.LOGGER, level="ERROR"),
        ):
            stt_service.load_model()

        self.assertIsNone(stt_service.model)

    def test_health_uses_http_status_for_readiness(self) -> None:
        response = Response()
        body = stt_service.health(response)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(body["status"], "degraded")

        stt_service.model = FakeModel()  # type: ignore[assignment]
        response = Response()
        body = stt_service.health(response)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(body["status"], "ok")

    def test_wav_decode_accepts_stereo_pcm16_and_downmixes(self) -> None:
        audio, sample_rate = stt_service._decode_wav(make_wav(channels=2))
        self.assertEqual(sample_rate, 16_000)
        self.assertEqual(audio.dtype, np.float32)
        self.assertEqual(audio.shape, (160,))

    def test_wav_decode_rejects_out_of_range_rate_before_resampling(self) -> None:
        wav_bytes = bytearray(make_wav())
        struct.pack_into("<I", wav_bytes, 24, stt_service.MAX_INPUT_SAMPLE_RATE + 1)

        with self.assertRaisesRegex(stt_service.AudioValidationError, "sample rate"):
            stt_service._decode_wav(bytes(wav_bytes))

    def test_wav_decode_rejects_truncated_frames(self) -> None:
        with self.assertRaisesRegex(stt_service.AudioValidationError, "truncated"):
            stt_service._decode_wav(make_wav()[:-1])

    def test_wav_decode_rejects_non_pcm16(self) -> None:
        with self.assertRaisesRegex(stt_service.AudioValidationError, "16-bit"):
            stt_service._decode_wav(make_wav(sample_width=1))

    def test_raw_pcm_requires_complete_frames_and_valid_rate(self) -> None:
        with self.assertRaisesRegex(stt_service.AudioValidationError, "incomplete"):
            stt_service._decode_pcm(b"\x00\x00\x01", 16_000, 1)
        with self.assertRaisesRegex(stt_service.AudioValidationError, "sample rate"):
            stt_service._decode_pcm(b"\x00\x00", 1, 1)

    def test_prepare_audio_resamples_to_16khz_float32(self) -> None:
        waveform = stt_service._prepare_audio(
            make_wav(sample_rate=8_000),
            "audio/wav",
            None,
            None,
        )

        self.assertEqual(waveform.dtype, np.float32)
        self.assertEqual(len(waveform), 320)


class SttServiceEndpointTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.assertFalse(
            stt_service.transcription_gate.locked(),
            "a prior test leaked the transcription gate",
        )
        self.assertFalse(stt_service.inference_tasks)
        stt_service.model = FakeModel()  # type: ignore[assignment]

    def tearDown(self) -> None:
        stt_service.model = None

    async def _wait_until_idle(self) -> None:
        for _ in range(200):
            if (
                not stt_service.transcription_gate.locked()
                and not stt_service.inference_tasks
            ):
                return
            await asyncio.sleep(0.01)
        self.fail("transcription worker did not release admission")

    async def test_transcribe_returns_only_joined_text(self) -> None:
        active_model = stt_service.model
        upload = make_upload(make_wav())
        try:
            result = await stt_service.transcribe(upload, None, None)
            await self._wait_until_idle()
        finally:
            await upload.close()

        self.assertEqual(result, {"text": "hello world"})
        self.assertIsInstance(active_model, FakeModel)
        assert isinstance(active_model, FakeModel)
        self.assertEqual(len(active_model.calls), 1)
        self.assertEqual(
            active_model.calls[0][1],
            {"language": "en", "vad_filter": True, "beam_size": 5},
        )

    async def test_busy_request_is_rejected_before_upload_read(self) -> None:
        self.assertTrue(stt_service.transcription_gate.acquire(blocking=False))
        try:
            with self.assertRaises(HTTPException) as raised:
                await stt_service.transcribe(  # type: ignore[arg-type]
                    UnreadableUpload(),
                    None,
                    None,
                )
        finally:
            stt_service.transcription_gate.release()

        self.assertEqual(raised.exception.status_code, 503)
        self.assertEqual(raised.exception.headers, {"Retry-After": "1"})

    async def test_timeout_keeps_gate_until_native_inference_finishes(self) -> None:
        blocking_model = BlockingModel()
        stt_service.model = blocking_model  # type: ignore[assignment]
        first_upload = make_upload(make_wav())
        second_upload = make_upload(make_wav())
        try:
            with (
                patch.object(stt_service, "TRANSCRIPTION_TIMEOUT_SECONDS", 0.01),
                self.assertRaises(HTTPException) as timed_out,
            ):
                await stt_service.transcribe(first_upload, None, None)

            self.assertEqual(timed_out.exception.status_code, 504)
            self.assertTrue(blocking_model.started.is_set())
            self.assertTrue(stt_service.transcription_gate.locked())

            with self.assertRaises(HTTPException) as busy:
                await stt_service.transcribe(second_upload, None, None)
            self.assertEqual(busy.exception.status_code, 503)
        finally:
            blocking_model.release.set()
            await self._wait_until_idle()
            await first_upload.close()
            await second_upload.close()

    async def test_internal_failure_is_sanitized_and_releases_gate(self) -> None:
        stt_service.model = BrokenModel()  # type: ignore[assignment]
        upload = make_upload(make_wav())
        try:
            with (
                self.assertLogs(stt_service.LOGGER, level="ERROR"),
                self.assertRaises(HTTPException) as raised,
            ):
                await stt_service.transcribe(upload, None, None)
            await self._wait_until_idle()
        finally:
            await upload.close()

        self.assertEqual(raised.exception.status_code, 500)
        self.assertEqual(raised.exception.detail, "Transcription failed.")
        self.assertNotIn("private engine detail", raised.exception.detail)

    async def test_malformed_wav_returns_controlled_422_and_releases_gate(self) -> None:
        upload = make_upload(make_wav()[:-1])
        try:
            with self.assertRaises(HTTPException) as raised:
                await stt_service.transcribe(upload, None, None)
        finally:
            await upload.close()

        self.assertEqual(raised.exception.status_code, 422)
        self.assertFalse(stt_service.transcription_gate.locked())

    async def test_oversized_upload_is_rejected_from_reported_size(self) -> None:
        upload = make_upload(b"not read")
        upload.size = stt_service.MAX_AUDIO_BYTES + 1
        try:
            with self.assertRaises(HTTPException) as raised:
                await stt_service.transcribe(upload, None, None)
        finally:
            await upload.close()

        self.assertEqual(raised.exception.status_code, 413)
        self.assertFalse(stt_service.transcription_gate.locked())


if __name__ == "__main__":
    unittest.main()
