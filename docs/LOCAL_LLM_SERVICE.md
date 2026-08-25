# Local LLM service

`apps/local-llm-service` is a bounded FastAPI bridge to Ollama. It structures
recruiter notes into ordered topic seeds and generates personalized, natural
interviewer dialogue inside those boundaries. NestJS remains authoritative for
users, timing, persisted topic progress, transcripts, and terminal state.

## Docker

The default CPU stack starts Ollama, pulls `qwen3:4b` into a persistent volume, and waits for the bridge to become ready:

```bash
docker compose up --build --wait
curl --fail http://127.0.0.1:18084/health
```

The first pull is about 2.5 GB. CPU inference works without special host configuration but is hardware-dependent; allow roughly 5 GB of free memory for Ollama.

For NVIDIA acceleration, install the NVIDIA Container Toolkit on the host and
start `pnpm docker:up:gpu`. The overlay selects `qwen3:8b`, gives Ollama access
to all NVIDIA GPUs, enables Flash Attention and a `q8_0` KV cache, and limits
Ollama to one loaded model and one parallel generation. Ollama decides the
actual GPU offload.

Compose pins Ollama `0.32.15` by default for reproducible runtime behavior. Set
`OLLAMA_IMAGE_TAG` only when intentionally testing another release.

## Native setup

```bash
ollama pull qwen3:4b
python3.12 -m venv apps/local-llm-service/.venv
apps/local-llm-service/.venv/bin/python -m pip install \
  --requirement apps/local-llm-service/requirements.txt
apps/local-llm-service/.venv/bin/uvicorn main:app \
  --app-dir apps/local-llm-service --host 127.0.0.1 --port 8003 --workers 1
```

Configure NestJS with `LOCAL_LLM_URL` and `LOCAL_LLM_TIMEOUT_MS`.

| Service variable | Default |
| --- | --- |
| `OLLAMA_URL` | `http://127.0.0.1:11434` |
| `OLLAMA_MODEL` | `qwen3:4b` |
| `OLLAMA_TIMEOUT_SECONDS` | `110` |
| `OLLAMA_HEALTH_TIMEOUT_SECONDS` | `3` |
| `OLLAMA_NUM_CTX` | `8192` |
| `OLLAMA_KEEP_ALIVE` | `-1` |

The service preloads the model during startup with a representative live-turn
prompt, the production JSON grammar, and only one output token. This warms the
model, prompt prefix, and grammar before a candidate starts. Readiness remains
degraded until that load succeeds; transient preload failures are retried in the
background, and readiness verifies that the model is still resident. The
dedicated stack keeps it loaded by default to avoid an idle-time reload. The
service admits one real generation at a time, validates
structured JSON, bounds request/response sizes, and returns controlled provider
errors.

At creation time, each stored `prompt` is a private topic seed rather than a
fixed question. For live turns, the bridge sends the current boundary, the next
boundary, and at most four recent assistant/candidate turns to a compact output
contract. The resident model generates the personalized opening and later exact
spoken words. NestJS also supplies an opaque attempt-scoped variation key; only
its derived presentation cue reaches the prompt, never candidate or attempt
IDs. The model can acknowledge an answer naturally and may use at most one
same-topic follow-up or conversational move before bridging to the next topic.

Ollama returns only spoken `text` and `completeCurrentTopic`; it never controls
IDs. The bridge maps completion to the current server-supplied ID. NestJS
persists `turnCount`, prevents an opening from completing a topic, enforces the
maximum follow-up, and authoritatively decides forced progression and final or
deadline endings. Existing `/questions/structure` and internal `question*`
names remain unchanged for API/database compatibility.

Provider timing and token counts are written to service logs. The dedicated
service keeps its one model resident with `OLLAMA_KEEP_ALIVE=-1` and admits one
generation at a time. Leave CPU thread selection automatic: the reference CPU
was fastest at Ollama's automatic six-thread choice, with no gain at ten threads
and a slowdown at sixteen.
Use `OLLAMA_MODEL=qwen3:8b` on CPU only when its quality benefit is worth the
additional latency and memory use.

If an API request reports that the local model is unavailable while health is
green, inspect both provider logs with
`docker compose logs --tail=200 local-llm ollama`. The bridge records the
upstream failure type or HTTP status without exposing the provider response to
clients.

Endpoints are `GET /health`, `POST /questions/structure`, and `POST /interview/turn`. See [`apps/local-llm-service/README.md`](../apps/local-llm-service/README.md) for payload examples and tests.
