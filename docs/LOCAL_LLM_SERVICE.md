# Local LLM service guide

## Status and boundary

The repository includes an optional FastAPI/Qwen service in
`apps/local-llm-service`. It structures creator notes and generates the next
spoken interviewer turn through Ollama. NestJS remains responsible for users,
timing, task state, transcripts, audio, WebSockets, action validation, and
database writes.

The LLM, STT, and TTS providers are selected independently. Gemini remains the
default, while `LLM_PROVIDER=local` selects this service without changing either
speech provider. Provider failures never silently cross-fallback.

## Docker Compose

To use local Qwen for interview structuring and turns while retaining Gemini
speech, run from the repository root:

```bash
GEMINI_API_KEY=your-google-api-key LLM_PROVIDER=local \
  docker compose --profile local-llm up --build --wait
```

To run the complete application without a real Gemini key or Google API calls:

```bash
LLM_PROVIDER=local STT_PROVIDER=local TTS_PROVIDER=local \
  docker compose --profile local-llm --profile local-stt --profile local-tts \
  up --build --wait
```

The equivalent pnpm shortcut is:

```bash
pnpm docker:up:local
```

The `local-llm` profile performs three ordered operations:

1. `ollama` starts and passes its server health check.
2. `ollama-pull` downloads the configured model if it is missing.
3. `local-llm` starts after the pull completes and reports ready only when
   Ollama is reachable and the configured model is installed.

The backend reaches the service at `http://local-llm:8003`. Its loopback-only
host endpoint is `http://127.0.0.1:18084` by default. Ollama itself is available
only inside the Compose network.

Check readiness directly with:

```bash
curl --fail http://127.0.0.1:18084/health
```

The first start downloads about 5.2 GB for `qwen3:8b`. Ollama stores the model
in the `interview-ollama-data` named volume. Ordinary restarts and
`docker compose down` retain it; `docker compose down --volumes` removes the
model cache together with PostgreSQL data.

The backend intentionally has no hard dependency on profiled AI services, so
ordinary `docker compose up --build --wait` remains a valid Gemini-only stack.
Do not select `LLM_PROVIDER=local` unless the local service is running.

## Native setup

Install Ollama and start its server in one shell:

```bash
ollama serve
```

Download the model once from another shell:

```bash
ollama pull qwen3:8b
```

In another shell, from the repository root:

```bash
cd apps/local-llm-service
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install --requirement requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8003 --workers 1
```

Configure native NestJS with:

```dotenv
LLM_PROVIDER=local
LOCAL_LLM_URL=http://127.0.0.1:8003
LOCAL_LLM_TIMEOUT_MS=120000
```

Use one Uvicorn worker. The service admits one generation at a time so local
model requests do not pile up and exhaust memory.

## Configuration

Backend selection:

| Variable | Default | Purpose |
| --- | --- | --- |
| `LLM_PROVIDER` | `gemini` | Select `gemini` or `local`. |
| `LOCAL_LLM_URL` | `http://127.0.0.1:8003` natively; `http://local-llm:8003` in Compose | Local service base URL. |
| `LOCAL_LLM_TIMEOUT_MS` | `120000` | Backend request timeout in milliseconds. |
| `LLM_PORT` | `18084` | Compose host port only. |

Ollama and service tuning:

| Variable | Default | Purpose |
| --- | --- | --- |
| `OLLAMA_MODEL` | `qwen3:8b` | Model pulled and used for generation. |
| `OLLAMA_IMAGE_TAG` | `latest` | Ollama container image tag. |
| `OLLAMA_TIMEOUT_SECONDS` | `110` | Service-to-Ollama timeout, leaving the backend a response margin. |
| `OLLAMA_HEALTH_TIMEOUT_SECONDS` | `3` | Ollama readiness request timeout. |
| `OLLAMA_NUM_CTX` | `8192` | Context tokens allocated per generation. |
| `OLLAMA_KEEP_ALIVE` | `10m` | Time the model remains loaded after a request. |

Changing `OLLAMA_MODEL` causes the model-pull container to fetch that model into
the same persistent volume. A custom or fine-tuned model must be available to
the Ollama server under the configured name.

## HTTP contract and readiness

`POST /questions/structure` accepts an interview title, optional description,
and raw creator notes. It returns 1–30 ordered tasks containing only `title`,
`prompt`, `objective`, and `followUpGuidance`.

`POST /interview/turn` accepts the candidate name, current task, bounded text
transcript, remaining seconds, and the server-owned `mustEnd` flag. It returns
speakable `text` plus only these action shapes:

```json
{ "type": "complete_questions", "questionIds": ["known-task-id"] }
```

```json
{ "type": "end_interview", "reason": "Short reason" }
```

NestJS validates the returned text and action IDs again before changing durable
state. The service treats transcript and creator text as data, disables Qwen
thinking for lower latency, requests schema-constrained JSON, and bounds context
and output size.

`GET /health` returns HTTP 200 only when Ollama responds and the configured model
is installed; otherwise it returns HTTP 503. Readiness does not permanently warm
the model, so the first interview request after startup or keep-alive expiry can
still have a model-loading delay.

## Model size, hardware, platform, and licensing

The default Ollama `qwen3:8b` artifact is an 8.19-billion-parameter Q4_K_M model
of about 5.2 GB. The upstream tag supports a larger context window, but this
service defaults to 8,192 tokens to keep local memory and latency bounded.

Allow roughly 8 GB of free memory for Ollama alone. About 16 GB of total system
RAM is a practical minimum for running Qwen together with PostgreSQL, NestJS,
the web client, Whisper, and Piper. CPU-only execution is supported but response
latency varies substantially by processor; slower systems may exceed the
configured timeout.

The supplied Compose path is CPU-oriented and portable. NVIDIA or AMD GPU use
requires the matching host drivers, container runtime, device mappings, and—for
AMD—the appropriate Ollama image. Docker-hosted Ollama on macOS does not provide
the same Metal acceleration as native Ollama, so native Ollama is normally the
better-performing macOS option.

Qwen3 model weights are distributed under Apache-2.0 according to the
[Qwen3 project](https://github.com/QwenLM/Qwen3) and
[Ollama model page](https://ollama.com/library/qwen3%3A8b). Ollama and Python
dependencies retain their own licenses. Review and preserve the relevant notices
before redistributing model weights or container images.
