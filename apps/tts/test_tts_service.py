"""Contract tests for the local TTS service using only unittest doubles."""

from __future__ import annotations

import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import wave

from fastapi import HTTPException, Response

import tts_service


def make_wav(
    *, channels: int = 1, sample_width: int = 2, sample_rate: int = 22_050
) -> bytes:
    """Create a short deterministic WAV for format and resampling tests."""

    frames = b"\x00" * (160 * channels * sample_width)
    output = io.BytesIO()
    with wave.open(output, "wb") as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(sample_width)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(frames)
    return output.getvalue()


class FakeVoice:
    """Small PiperVoice-compatible test double."""

    def __init__(self, wav_bytes: bytes | None = None) -> None:
        self._wav_bytes = wav_bytes or make_wav()

    def synthesize_wav(self, _text: str, wav_file: wave.Wave_write) -> None:
        with wave.open(io.BytesIO(self._wav_bytes), "rb") as source:
            wav_file.setnchannels(source.getnchannels())
            wav_file.setsampwidth(source.getsampwidth())
            wav_file.setframerate(source.getframerate())
            wav_file.writeframes(source.readframes(source.getnframes()))


class BrokenVoice:
    def synthesize_wav(self, _text: str, _wav_file: wave.Wave_write) -> None:
        raise RuntimeError("private engine detail")


class TtsServiceContractTests(unittest.TestCase):
    def setUp(self) -> None:
        tts_service.loaded_voices.clear()

    def tearDown(self) -> None:
        tts_service.loaded_voices.clear()

    def test_model_directory_defaults_to_script_directory(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(tts_service.model_directory(), tts_service.SCRIPT_DIR)

    def test_model_directory_honors_environment(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"TTS_MODEL_DIR": directory}, clear=False):
                self.assertEqual(tts_service.model_directory(), Path(directory))

    def test_load_models_uses_resolved_model_directory(self) -> None:
        voice = FakeVoice()
        with tempfile.TemporaryDirectory() as directory:
            expected = Path(directory) / "en_US-lessac-medium.onnx"
            with (
                patch.dict(os.environ, {"TTS_MODEL_DIR": directory}, clear=False),
                patch.object(tts_service.PiperVoice, "load", return_value=voice) as load,
            ):
                tts_service.load_models()

        load.assert_called_once_with(expected)
        self.assertIs(tts_service.loaded_voices["professional-default"], voice)

    def test_health_is_503_until_a_voice_is_loaded(self) -> None:
        response = Response()
        body = tts_service.health(response)

        self.assertEqual(response.status_code, 503)
        self.assertEqual(body["status"], "degraded")
        self.assertEqual(body["voices_loaded"], [])

    def test_health_is_200_when_ready(self) -> None:
        tts_service.loaded_voices["professional-default"] = FakeVoice()  # type: ignore[assignment]
        response = Response()
        body = tts_service.health(response)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(body["status"], "ok")
        self.assertEqual(body["voices_loaded"], ["professional-default"])

    def test_resampling_returns_mono_pcm16_at_24khz(self) -> None:
        output = tts_service.resample_wav_bytes(make_wav(), 24_000)

        sample_rate, frames = tts_service.validate_wav_bytes(
            output, expected_rate=24_000
        )
        self.assertEqual(sample_rate, 24_000)
        self.assertGreater(len(frames), 0)

    def test_resampling_rejects_non_mono_source(self) -> None:
        with self.assertRaisesRegex(ValueError, "mono"):
            tts_service.resample_wav_bytes(make_wav(channels=2), 24_000)

    def test_resampling_rejects_non_pcm16_source(self) -> None:
        with self.assertRaisesRegex(ValueError, "16-bit"):
            tts_service.resample_wav_bytes(make_wav(sample_width=1), 24_000)

    def test_synthesize_returns_contract_headers_and_wav(self) -> None:
        tts_service.loaded_voices["professional-default"] = FakeVoice()  # type: ignore[assignment]

        response = tts_service.synthesize(
            tts_service.SynthesizeRequest(text="Hello", voice="professional-default")
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.media_type, "audio/wav")
        self.assertEqual(response.headers["x-sample-rate"], "24000")
        self.assertEqual(response.headers["x-channels"], "1")
        self.assertEqual(response.headers["x-bit-depth"], "16")
        tts_service.validate_wav_bytes(response.body, expected_rate=24_000)

    def test_synthesize_accepts_exactly_4000_characters(self) -> None:
        tts_service.loaded_voices["professional-default"] = FakeVoice()  # type: ignore[assignment]
        response = tts_service.synthesize(
            tts_service.SynthesizeRequest(text="x" * 4_000)
        )
        self.assertEqual(response.status_code, 200)

    def test_synthesize_rejects_text_over_4000_characters(self) -> None:
        tts_service.loaded_voices["professional-default"] = FakeVoice()  # type: ignore[assignment]
        with self.assertRaises(HTTPException) as raised:
            tts_service.synthesize(tts_service.SynthesizeRequest(text="x" * 4_001))
        self.assertEqual(raised.exception.status_code, 400)

    def test_synthesize_rejects_concurrent_work_without_queueing(self) -> None:
        tts_service.loaded_voices["professional-default"] = FakeVoice()  # type: ignore[assignment]
        self.assertTrue(tts_service.synthesis_lock.acquire(blocking=False))
        try:
            with self.assertRaises(HTTPException) as raised:
                tts_service.synthesize(tts_service.SynthesizeRequest(text="Hello"))
        finally:
            tts_service.synthesis_lock.release()

        self.assertEqual(raised.exception.status_code, 503)
        self.assertEqual(raised.exception.headers, {"Retry-After": "1"})

    def test_internal_failure_is_logged_but_not_exposed(self) -> None:
        tts_service.loaded_voices["professional-default"] = BrokenVoice()  # type: ignore[assignment]

        with self.assertLogs(tts_service.LOGGER, level="ERROR"):
            with self.assertRaises(HTTPException) as raised:
                tts_service.synthesize(tts_service.SynthesizeRequest(text="Hello"))

        self.assertEqual(raised.exception.status_code, 500)
        self.assertEqual(raised.exception.detail, "Synthesis failed.")
        self.assertNotIn("private engine detail", raised.exception.detail)

        # Failure must release the gate so a later request is not stuck busy.
        tts_service.loaded_voices["professional-default"] = FakeVoice()  # type: ignore[assignment]
        self.assertEqual(
            tts_service.synthesize(tts_service.SynthesizeRequest(text="Hello")).status_code,
            200,
        )


if __name__ == "__main__":
    unittest.main()
