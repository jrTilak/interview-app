# Local text-to-speech service

`apps/tts` uses Piper and the bundled `en_US-lessac-medium` voice to synthesize complete mono 24 kHz PCM16 WAV responses. It retains no audio.

## Docker

```bash
docker compose up --build --wait tts
curl --fail http://127.0.0.1:18082/health
```

## Native setup

```bash
python3.12 -m venv apps/tts/.venv
apps/tts/.venv/bin/python -m pip install --requirement apps/tts/requirements.txt
apps/tts/.venv/bin/python -m piper.download_voices \
  --download-dir apps/tts/models en_US-lessac-medium
TTS_MODEL_DIR="$PWD/apps/tts/models" \
  apps/tts/.venv/bin/uvicorn tts_service:app \
  --app-dir apps/tts --host 127.0.0.1 --port 8001 --workers 1
```

Configure NestJS with `LOCAL_TTS_URL`, `LOCAL_TTS_VOICE`, and `LOCAL_TTS_TIMEOUT_MS`. `POST /synthesize` accepts bounded text plus the `professional-default` voice. Only one synthesis runs per worker; concurrent work is rejected instead of queued.

See [`apps/tts/README.md`](../apps/tts/README.md) for the full contract, licensing notes, and tests.
