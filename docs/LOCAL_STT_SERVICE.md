# Local speech-to-text service

`apps/stt` transcribes one completed candidate turn using faster-whisper. It retains no audio and makes no interview decisions.

## Docker

The default image embeds the `small` model and exposes readiness on port 18083:

```bash
docker compose up --build --wait stt
curl --fail http://127.0.0.1:18083/health
```

## Native setup

```bash
python3.12 -m venv apps/stt/.venv
apps/stt/.venv/bin/python -m pip install --requirement apps/stt/requirements.txt
apps/stt/.venv/bin/uvicorn stt_service:app \
  --app-dir apps/stt --host 127.0.0.1 --port 8002 --workers 1
```

Configure NestJS with `LOCAL_STT_URL` and `LOCAL_STT_TIMEOUT_MS`. Service settings include `WHISPER_MODEL`, `WHISPER_DEVICE`, `WHISPER_COMPUTE_TYPE`, `STT_MAX_AUDIO_BYTES`, `STT_MAX_AUDIO_SECONDS`, and `STT_TIMEOUT_SECONDS`.

`POST /transcribe` accepts mono/stereo PCM16 WAV or the application's signed little-endian `audio/l16` convention with sample-rate/channel fields. The browser sends mono 16 kHz `audio/l16`. Only one transcription runs per worker; concurrent work is rejected rather than queued.

See [`apps/stt/README.md`](../apps/stt/README.md) for the full contract, model layout, and tests.
