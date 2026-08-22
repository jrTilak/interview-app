# Local LLM service

`apps/local-llm-service` is a bounded FastAPI bridge to Ollama. It structures recruiter notes and generates later interviewer turns; NestJS remains authoritative for users, timing, task state, transcripts, and actions.

## Docker

The default stack starts Ollama, pulls `qwen3:8b` into a persistent volume, and waits for the bridge to become ready:

```bash
docker compose up --build --wait
curl --fail http://127.0.0.1:18084/health
```

The first pull is about 5.2 GB. CPU inference works without special host configuration but is hardware-dependent; allow roughly 8 GB of free memory for Ollama.

## Native setup

```bash
ollama pull qwen3:8b
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
| `OLLAMA_MODEL` | `qwen3:8b` |
| `OLLAMA_TIMEOUT_SECONDS` | `110` |
| `OLLAMA_HEALTH_TIMEOUT_SECONDS` | `3` |
| `OLLAMA_NUM_CTX` | `8192` |
| `OLLAMA_KEEP_ALIVE` | `10m` |

The service preloads the model during lifespan startup with an empty generation and the configured keep-alive. It admits one real generation at a time, validates structured JSON, bounds request/response sizes, and returns controlled provider errors.

Endpoints are `GET /health`, `POST /questions/structure`, and `POST /interview/turn`. See [`apps/local-llm-service/README.md`](../apps/local-llm-service/README.md) for payload examples and tests.
