# Local text-to-speech service guide

## Status and boundary

The repository includes an optional FastAPI/Piper service in `apps/tts`. It converts the exact interviewer sentence to audio; it does not generate content, transcribe candidates, manage interviews, or store audio.

Gemini remains the default for all three AI ports. Selecting local TTS changes only speech synthesis—the Gemini LLM still handles interview structuring and turns, while STT keeps its independently configured provider.

## Docker Compose

Export a valid `GEMINI_API_KEY`, then run from the repository root:

```bash
TTS_PROVIDER=local docker compose --profile local-tts up --build --wait
```

To run both local speech providers while retaining the Gemini LLM:

```bash
STT_PROVIDER=local TTS_PROVIDER=local docker compose --profile local-stt --profile local-tts up --build --wait
```

The `local-tts` profile builds `apps/tts/Dockerfile`, starts one Uvicorn worker, and publishes `http://127.0.0.1:18082` by default. Compose connects the backend to the service at `http://tts:8001`. The image health check calls `/health` and becomes healthy only after the configured voice is loaded.

The backend has no hard dependency on the profiled container. Consequently, ordinary `docker compose up --build --wait` remains backward-compatible and uses Gemini TTS. Do not set `TTS_PROVIDER=local` unless the local service is running and reachable.

Check the profiled service directly with:

```bash
curl --fail http://127.0.0.1:18082/health
```

Override the published host port with `TTS_PORT`; the container and Compose-network port remain `8001`.

## Native setup

Python 3.12 or newer is required. From the repository root:

```bash
cd apps/tts
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
mkdir -p models
python -m piper.download_voices --download-dir models en_US-lessac-medium
export TTS_MODEL_DIR="$PWD/models"
uvicorn tts_service:app --host 127.0.0.1 --port 8001 --workers 1
```

`TTS_MODEL_DIR` must contain the downloaded `.onnx` and `.onnx.json` files. If it is omitted, the service looks beside `tts_service.py`, independently of the shell's working directory.

Configure the native NestJS process with:

```dotenv
TTS_PROVIDER=local
LOCAL_TTS_URL=http://127.0.0.1:8001
LOCAL_TTS_VOICE=professional-default
LOCAL_TTS_TIMEOUT_MS=45000
```

Use exactly one Uvicorn worker. Each worker loads its own model, increasing startup time and memory use, while this service is intended for the project's single-server deployment.

## Provider configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `TTS_PROVIDER` | `gemini` | Select `gemini` or `local`. |
| `LOCAL_TTS_URL` | `http://127.0.0.1:8001` natively; `http://tts:8001` in Compose | Local service base URL. |
| `LOCAL_TTS_VOICE` | `professional-default` | Voice key sent to `/synthesize`. |
| `LOCAL_TTS_TIMEOUT_MS` | `45000` | Request timeout in milliseconds; accepted range is `1000`–`120000`. |
| `TTS_PORT` | `18082` | Compose host port only. |

The provider selection is explicit. If the selected local service is unavailable, times out, rejects a voice, or returns invalid audio, the request fails with a provider-neutral error; the backend never silently retries with Gemini.

## HTTP contract

`GET /health` returns the configured and loaded voice names. It reports an unavailable status until at least one model is loaded.

`POST /synthesize` accepts:

```json
{
  "text": "Hello Maya. Let us begin with your recent project.",
  "voice": "professional-default"
}
```

It returns a complete `audio/wav` body: RIFF/WAVE PCM format 1, mono, 24 kHz, and 16-bit. `X-Sample-Rate`, `X-Channels`, and `X-Bit-Depth` describe the same format. The backend validates the body and any supplied metadata headers before sending the complete WAV to the browser. Empty text, more than 4,000 characters, and unknown voices are rejected. Generated audio stays in memory and is not persisted.

## Image size, startup, and licensing

The `en_US-lessac-medium` model is roughly 63 MB. Docker downloads it while building and includes it in the image, so no model download is required at container runtime; the complete image is larger because it also contains Python, Piper, NumPy, and SciPy. The first build therefore needs network access and may take longer, and each new container has a short cold start while Piper loads the model. Compose `--wait` accounts for that through the image health check.

Piper is provided under the GPL-3.0-or-later license. The Lessac voice model and its source dataset have their own [model-card and dataset terms](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/lessac/medium/MODEL_CARD). Review the Piper license and the Lessac model/dataset licenses before commercial use or distributing an image that contains them; repository integration does not establish that a planned use is license-compatible.
