# Local LLM service

This FastAPI service connects the interview backend to a local Ollama model. It
structures creator notes and generates the next spoken interviewer turn. NestJS
continues to own users, timing, task state, transcripts, audio, and WebSockets.

## Requirements

- Python 3.12
- Ollama running locally or as a Compose service
- The configured model installed in Ollama (default: `qwen3:8b`)

The Python image does not contain the model. Pull it once into Ollama's model
store before native use:

```bash
ollama pull qwen3:8b
```

The default Q4 model download is about 5.2 GB. A Compose model-pull initializer
can perform this download automatically and retain it in an Ollama volume.

## Native setup

From this directory:

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install --requirement requirements.txt
.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8003 --workers 1
```

Keep one Uvicorn worker. The service admits one generation at a time so parallel
requests cannot overload the local model; another request receives `503` with a
short `Retry-After` value.

Readiness is available at `GET /health`. It returns `200` only when Ollama is
reachable and the configured model appears in Ollama's installed-model list;
otherwise it returns `503`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama base URL; `/api` is optional |
| `OLLAMA_MODEL` | `qwen3:8b` | Installed Ollama model or fine-tuned model name |
| `OLLAMA_TIMEOUT_SECONDS` | `110` | Provider timeout, leaving NestJS a response margin |
| `OLLAMA_HEALTH_TIMEOUT_SECONDS` | `3` | Readiness-check timeout |
| `OLLAMA_NUM_CTX` | `8192` | Context tokens allocated for a generation |
| `OLLAMA_KEEP_ALIVE` | `10m` | How long Ollama keeps the model loaded |

For a custom or fine-tuned model, create/import it in Ollama and set
`OLLAMA_MODEL` to that installed name. No application code change is required.

## HTTP contract

### Structure creator notes

`POST /questions/structure`

```json
{
  "title": "Backend Engineer",
  "description": "A practical technical interview",
  "notes": "Ask about API design and testing"
}
```

The response contains `tasks` with only `title`, `prompt`, `objective`, and
`followUpGuidance`. It never adds attempt IDs or completion state.

### Generate an interview turn

`POST /interview/turn`

```json
{
  "title": "Backend Engineer",
  "description": "A practical technical interview",
  "candidateName": "Alex",
  "tasks": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "position": 1,
      "title": "API design",
      "prompt": "How would you design this API?",
      "objective": null,
      "followUpGuidance": null,
      "completed": false
    }
  ],
  "transcript": "",
  "remainingTime": 600,
  "mustEnd": false
}
```

The response contains speakable `text` and validated actions. Task completion
uses the current NestJS contract: the task is marked complete in the same turn
in which its question is asked. `mustEnd=true` or no incomplete task produces a
deterministic closing response without calling Ollama.

Requests and generated fields are length-bounded. Ollama receives JSON-serialized
application data, a JSON output schema, `think=false`, deterministic temperature,
and bounded context/output settings. Provider failures return generic gateway
errors without exposing internal details.

## Docker

Build the service image from the repository root:

```bash
docker build --tag interview-local-llm apps/local-llm-service
```

The container expects Ollama at `http://ollama:11434` by default and exposes the
service on port `8003`. The project Compose configuration is responsible for the
Ollama container, persistent model volume, and one-time model pull.

## Tests

The focused contract suite uses `unittest` and provider doubles, so it does not
download or run Qwen:

```bash
PYTHONPATH=apps/local-llm-service \
python -m unittest discover -s apps/local-llm-service -p 'test_*.py' -v
```
