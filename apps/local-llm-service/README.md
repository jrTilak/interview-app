# Local LLM service

This FastAPI service connects the interview backend to a local Ollama model. It
structures creator notes into ordered topic boundaries and generates natural,
personalized interviewer turns within those boundaries. NestJS continues to
own users, timing, topic progress, transcripts, audio, WebSockets, and all
authoritative state transitions.

## Requirements

- Python 3.12
- Ollama running locally or as a Compose service
- The configured model installed in Ollama (default: `qwen3:4b`)

The Python image does not contain the model. Pull it once into Ollama's model
store before native use:

```bash
ollama pull qwen3:4b
```

The default Q4 model download is about 2.5 GB. A Compose model-pull initializer
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

Readiness is available at `GET /health`. It returns `200` only after Ollama has
successfully loaded the configured model and that model remains resident;
otherwise it returns `503`. A failed or unloaded model is preloaded again in
the background every five seconds.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama base URL; `/api` is optional |
| `OLLAMA_MODEL` | `qwen3:4b` | Installed Ollama model or fine-tuned model name |
| `OLLAMA_TIMEOUT_SECONDS` | `110` | Provider timeout, leaving NestJS a response margin |
| `OLLAMA_HEALTH_TIMEOUT_SECONDS` | `3` | Readiness-check timeout |
| `OLLAMA_NUM_CTX` | `8192` | Context tokens allocated for a generation |
| `OLLAMA_KEEP_ALIVE` | `-1` | Keep the dedicated model resident; set a duration to permit unloading |

For a custom or fine-tuned model, create/import it in Ollama and set
`OLLAMA_MODEL` to that installed name. No application code change is required.
Leave Ollama's CPU thread count automatic. On the reference hybrid CPU, its
automatic six-thread choice outperformed both ten and sixteen forced threads.

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

The response contains ordered topic seeds with only `title`, `prompt`,
`objective`, and `followUpGuidance`. `prompt` is a private boundary cue, not a
fixed question to read aloud. The model chooses the topic count from the brief:
it splits distinct named subjects and infers several relevant topics when the
brief is broad. The response never adds attempt IDs or completion state. The
`/questions/structure` route and internal `question*` names remain for API and
database compatibility, but these records are treated as topics.

### Generate an interview turn

`POST /interview/turn`

```json
{
  "title": "Backend Engineer",
  "description": "A practical technical interview",
  "candidateName": "Alex",
  "candidateVariationKey": "9d7f3b1480e849bcb10db60f4ccf18ad",
  "tasks": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "title": "API design",
      "prompt": "Resource modeling, validation, and trade-offs",
      "objective": "Explore practical API design reasoning",
      "followUpGuidance": "Probe failure handling when relevant",
      "completed": false,
      "turnCount": 1
    },
    {
      "id": "22222222-2222-4222-8222-222222222222",
      "title": "Testing strategy",
      "prompt": "Test boundaries, confidence, and maintenance",
      "objective": "Understand how the candidate balances test layers",
      "followUpGuidance": null,
      "completed": false,
      "turnCount": 0
    }
  ],
  "transcript": "[{\"role\":\"assistant\",\"text\":\"Tell me about an API you designed.\"},{\"role\":\"candidate\",\"text\":\"I started from the main resources and failure cases.\"}]",
  "remainingTime": 600,
  "mustEnd": false
}
```

The live request normally contains only the current and next incomplete topic.
Ollama receives those private boundaries plus at most the four most recent
assistant/candidate turns. It generates the exact next spoken move: a
personalized opening, a contextual acknowledgment, or at most one useful
same-topic follow-up/conversational move before naturally bridging to the next
topic. The opening calls the same preloaded resident model; it is not assembled
from a fixed stored question.

NestJS derives `candidateVariationKey` as an opaque, attempt-scoped hash. The
bridge uses it only to choose stable framing and delivery cues from a broad
palette; the key itself and the underlying candidate/attempt IDs are never
placed in the Ollama prompt.

The endpoint response contains speakable `text` and validated actions. The
provider-only output is `text` plus `completeCurrentTopic`; it never chooses or
emits task IDs. The bridge maps that boolean to the current server-supplied ID,
and NestJS validates it against persisted `turnCount`. NestJS prevents an
opening from completing its topic, permits no more than one same-topic
follow-up, forces progression afterward, and is authoritative for final-topic
and deadline endings. `mustEnd=true` or no incomplete topic produces a
server-defined close without another Ollama generation.

Requests and generated fields are length-bounded. Ollama receives a compact
JSON output schema, `think=false`, bounded context/output settings, and a small
amount of live-turn variation. Application size constraints are enforced after
generation instead of being expanded into Ollama grammar repetitions, which
keeps the schema compatible with Ollama's grammar compiler. Logs include
provider timing and token counts; client-facing provider failures remain
generic.

The default service keeps `qwen3:4b` resident with `OLLAMA_KEEP_ALIVE=-1` and
admits one generation at a time. The optional NVIDIA Compose overlay gives
Ollama access to every NVIDIA GPU available to Docker, enables Flash Attention
with a `q8_0` KV cache, and uses one loaded model and one parallel generation.
The model remains configurable with `OLLAMA_MODEL`; use `qwen3:8b` only when the
target GPU has enough memory. Linux Docker Engine requires the NVIDIA Container
Toolkit. Docker Desktop on Windows requires its WSL 2 backend and a current
NVIDIA Windows driver.

## Docker

Build the service image from the repository root:

```bash
docker build --tag interview-local-llm apps/local-llm-service
```

The container expects Ollama at `http://ollama:11434` by default and exposes the
service on port `8003`. The project Compose configuration is responsible for the
Ollama container, persistent model volume, and one-time model pull. Compose pins
Ollama `0.32.15` by default; set `OLLAMA_IMAGE_TAG` only when intentionally
testing another release.

## Tests

The focused contract suite uses `unittest` and provider doubles, so it does not
download or run Qwen:

```bash
PYTHONPATH=apps/local-llm-service \
python -m unittest discover -s apps/local-llm-service -p 'test_*.py' -v
```
