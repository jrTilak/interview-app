# Local speech-to-text service guide

## Status and boundary

The repository includes an optional FastAPI/faster-whisper service in `apps/stt`. It transcribes one completed candidate answer and returns text; it does not decide when a turn ends, generate interviewer content, manage attempts, or retain audio.

Gemini remains the default for every AI port. Selecting local STT changes only candidate transcription. The Gemini LLM is still required, and TTS also remains Gemini unless selected independently.

## Docker Compose

Export a valid `GEMINI_API_KEY`, then run local STT from the repository root:

```bash
STT_PROVIDER=local docker compose --profile local-stt up --build --wait
```

To run both local speech providers while retaining the Gemini LLM:

```bash
STT_PROVIDER=local TTS_PROVIDER=local docker compose --profile local-stt --profile local-tts up --build --wait
```

The `local-stt` profile builds `apps/stt/Dockerfile`, starts one Uvicorn worker, and publishes `http://127.0.0.1:18083` by default. Compose connects the backend to it at `http://stt:8002`. The image health check calls `/health` and becomes healthy only after Whisper is loaded.

The backend has no hard dependency on the profiled service. Ordinary `docker compose up --build --wait` therefore stays backward-compatible and uses Gemini STT. Do not set `STT_PROVIDER=local` unless the local service is running and reachable.

Check readiness directly with:

```bash
curl --fail http://127.0.0.1:18083/health
```

Override the published host port with `STT_PORT`; the container and Compose-network port remain `8002`.

## Native setup

Python 3.12 or newer is required by the pinned dependencies. From the repository root:

```bash
cd apps/stt
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
mkdir -p models
export STT_MODEL_DIR="$PWD/models"
export WHISPER_MODEL=small
uvicorn stt_service:app --host 127.0.0.1 --port 8002 --workers 1
```

The first native start downloads the selected model into the cache rooted at `STT_MODEL_DIR`; later starts reuse it. Configure the native NestJS process with:

```dotenv
STT_PROVIDER=local
LOCAL_STT_URL=http://127.0.0.1:8002
LOCAL_STT_TIMEOUT_MS=45000
```

Use exactly one Uvicorn worker. Each worker would load another model and have an independent admission gate; the supported service instead allows one active transcription and returns HTTP 503 when busy.

## Configuration

Backend selection:

| Variable | Default | Purpose |
| --- | --- | --- |
| `STT_PROVIDER` | `gemini` | Select `gemini` or `local`. |
| `LOCAL_STT_URL` | `http://127.0.0.1:8002` natively; `http://stt:8002` in Compose | Local service base URL. |
| `LOCAL_STT_TIMEOUT_MS` | `45000` | Backend request timeout in milliseconds; accepted range is `1000`–`120000`. |
| `STT_PORT` | `18083` | Compose host port only. |

Local service tuning:

| Variable | Default | Purpose |
| --- | --- | --- |
| `WHISPER_MODEL` | `small` | faster-whisper model name or local model directory. |
| `STT_MODEL_DIR` | `/models` in the image | Model download/cache root. |
| `WHISPER_DEVICE` | `cpu` | CTranslate2 execution device. |
| `WHISPER_COMPUTE_TYPE` | `int8` | CTranslate2 compute type. |
| `STT_MAX_AUDIO_BYTES` | `10485760` | Maximum upload size. |
| `STT_MAX_AUDIO_SECONDS` | `180` | Maximum decoded duration. |
| `STT_TIMEOUT_SECONDS` | `45` | Service-side inference timeout. |

Compose forwards these tuning variables to the STT container when set. `STT_MODEL_DIR` deliberately remains the image default `/models` so the baked model is discoverable.

Provider selection is explicit. An unavailable, busy, timed-out, or malformed local response fails with a provider-neutral error; the backend never silently retries transcription with Gemini.

## HTTP and audio contract

`GET /health` (also available as `/status`) returns HTTP 200 only after the model loads, otherwise HTTP 503.

`POST /transcribe` accepts multipart form data with an `audio` file. Supported audio is deliberately limited to:

- uncompressed mono or stereo, 16-bit PCM WAV (`audio/wav`, `audio/wave`, or `audio/x-wav`); or
- signed little-endian PCM16 (`audio/l16`) with integer `sample_rate_hz` and `channels` form fields.

The current browser path is compatible: it sends mono 16 kHz `audio/l16` with both metadata fields. MP3, MPEG, AAC, AIFF, FLAC, M4A, OGG, and WebM may be accepted elsewhere in the gateway or by Gemini, but they are not accepted by the local adapter/service. WAV and raw PCM sample rates are validated, downmixed when stereo, and resampled to 16 kHz in memory.

A successful response is bounded JSON:

```json
{ "text": "I used a queue to process the background jobs." }
```

The default model is explicitly run with English (`language="en"`); multilingual or automatic language detection is not enabled. Empty speech returns an empty string. Uploaded and decoded audio is discarded after the request. FastAPI may temporarily spool a larger multipart body to an automatically deleted temporary file, so externally exposed deployments should enforce an ingress request-body limit as well.

## Model cache, cold start, and compatibility

The Docker build downloads `Systran/faster-whisper-small` into `/models/small`. Its `model.bin` is about 461 MiB, plus tokenizer/configuration files and native inference dependencies, so the resulting image and memory footprint are substantial. The default model persists in the Docker image layer and is reused when containers are recreated; there is intentionally no named `/models` volume because an empty volume would hide the baked model. Docker's build cache avoids downloading it again while the relevant layer remains valid.

Every new container still has a cold start while CTranslate2 loads the model; `docker compose ... --wait` accounts for that through readiness. A custom `WHISPER_MODEL` not baked under `/models/<name>` downloads automatically into the container's writable `/models` cache. That custom runtime cache is lost when the container is recreated unless an operator deliberately supplies a populated/persistent `/models` volume; such a volume also takes responsibility for providing the default model.

The supplied image is Linux CPU-only with `int8` compute and is suitable for amd64 and arm64 Python wheels. Performance depends heavily on the host CPU, and slow machines can exceed the 45-second timeout. GPU inference requires a separate CUDA-compatible image/runtime and an appropriate compute type. Native installations likewise require platform-compatible CTranslate2, NumPy, and SciPy wheels.

[`faster-whisper`](https://github.com/SYSTRAN/faster-whisper) and the [`Systran/faster-whisper-small` model card](https://huggingface.co/Systran/faster-whisper-small) identify MIT licensing; transitive dependencies retain their own licenses. Review the code, model, dataset provenance, and dependency licenses before commercial use or distributing the image.
