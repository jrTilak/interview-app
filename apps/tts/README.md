# Local TTS service

This service provides local, offline speech synthesis for the NestJS server.
It speaks only the text supplied by the API;
it does not generate interview content or retain audio.

The service uses the actively maintained Open Home Foundation
[Piper project](https://github.com/OHF-Voice/piper1-gpl) behind a small FastAPI
HTTP API. It loads `en_US-lessac-medium` once at startup and returns mono,
16-bit PCM WAV audio at 24 kHz, matching the backend's provider contract.

## Run natively

Python 3.12 or newer is required by the pinned NumPy and SciPy versions.

```bash
cd apps/tts
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install --requirement requirements.txt
mkdir -p models
python -m piper.download_voices \
  --download-dir models \
  en_US-lessac-medium
TTS_MODEL_DIR="$PWD/models" \
  uvicorn tts_service:app --host 0.0.0.0 --port 8001 --workers 1
```

`TTS_MODEL_DIR` must contain both `en_US-lessac-medium.onnx` and its
`en_US-lessac-medium.onnx.json` configuration. If the variable is omitted,
the service looks beside `tts_service.py`, regardless of the shell's current
directory.

## Run in a container

Build from the service directory as the Docker build context:

```bash
docker build --tag interview-local-tts apps/tts
docker run --rm --publish 8001:8001 interview-local-tts
```

The image downloads the voice into `/models` while building, runs as an
unprivileged user, and starts one Uvicorn worker. Its health check calls the
real readiness endpoint, so the container is not healthy unless a voice was
loaded successfully.

To start it with the rest of the repository, use the default Compose stack
(the host port defaults to `18082`):

```bash
docker compose up --build tts
```

## Select the provider

Start the TTS service before the NestJS server, then configure the backend:

```dotenv
LOCAL_TTS_URL=http://127.0.0.1:8001
LOCAL_TTS_VOICE=professional-default
LOCAL_TTS_TIMEOUT_MS=45000
```

Use `http://tts:8001` instead when both services run in the repository's
Docker Compose network. The backend
expects `/synthesize` to return a non-empty mono PCM16 WAV at 24 kHz and treats
any non-2xx response as a provider failure.

## HTTP contract

`GET /health` returns HTTP 200 only when at least one voice is ready. A model
load failure returns HTTP 503 with a diagnostic readiness body:

```json
{
  "status": "ok",
  "voices_loaded": ["professional-default"],
  "voices_configured": ["professional-default"]
}
```

`POST /synthesize` accepts JSON with up to 4,000 text characters:

```json
{
  "text": "Hello Maya. Let us begin with your recent project.",
  "voice": "professional-default"
}
```

A successful response has `Content-Type: audio/wav` plus
`X-Sample-Rate: 24000`, `X-Channels: 1`, and `X-Bit-Depth: 16`. Empty or too
long text and unknown voices return HTTP 400. An unloaded configured voice or
a busy synthesizer returns HTTP 503. Internal engine details are logged by the
service but are not exposed in HTTP 500 responses.

Only one synthesis runs per service process. Concurrent requests are rejected
instead of queued, which prevents work abandoned by disconnected clients from
building up. Keep `--workers 1`: each additional worker would load another
model and have an independent gate. Scale with separate one-worker service
instances if more parallel capacity is required.

## Operational and licensing notes

- Voice loading creates a noticeable cold start. Health checks cannot succeed
  until loading completes; a completed startup with no loaded voice returns
  HTTP 503.
- The downloaded model and native inference dependencies make the container
  substantially larger than the source-only service; builds also require
  network access to fetch the voice.
- Piper 1.7.0 is `GPL-3.0-or-later`. Review that license before distributing
  the image. Voice weights have separate terms; the
  [`en_US-lessac-medium` model card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/lessac/medium/MODEL_CARD)
  points to the Lessac dataset license.
- Generated audio remains in memory and is discarded after the response.

## Tests

The contract suite uses `unittest` and the production dependencies only:

```bash
python -m unittest discover -s apps/tts -p 'test_*.py' -v
```
