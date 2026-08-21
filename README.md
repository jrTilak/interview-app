# Interview App

A desktop-first AI interview platform built as a pnpm workspace. Creators turn raw question notes into structured interviews, share an authenticated link, and candidates complete a realtime voice interview with subtitles and continuous turn-based audio.

## What works

- Desktop React PWA with email/password signup, login, guarded routes, and session-aware caching
- Creator dashboard, AI-assisted interview creation, repeat-attempt policy, participant history, private detail view, and copyable share links
- Candidate device preflight, active-attempt resume, and grouped history for every interview taken
- Realtime Socket.IO room with latency status, camera/screen transport, acoustic turn detection, raw PCM microphone input, subtitles, and native-decoded complete-WAV playback
- Required application fullscreen with a concealed interruption screen and explicit re-entry after every exit
- NestJS API with Better Auth, strict Zod boundaries, Drizzle ORM, PostgreSQL, and OpenAPI references
- Durable transcripts, question progress, hard deadlines, reconnect snapshots, and server-controlled completion
- Independently selectable AI ports, with Gemini defaults plus local Qwen/Ollama LLM, faster-whisper STT, and Piper TTS providers
- Unit, component, REST/Socket.IO E2E, and Chromium browser coverage

The deliberately excluded scope is recorded in [Implementation status](docs/IMPLEMENTATION_STATUS.md).

## Requirements

- Node.js 22.22.1 or newer
- pnpm 11 or newer
- Docker with Compose, or a PostgreSQL 18-compatible database
- A Google Gemini API key when any AI port uses its default Gemini provider
- Python 3.12 or newer only when running local AI services natively
- About 16 GB of system RAM is recommended when running the complete local AI stack

## Start the complete app with Docker

Start the frontend, backend, PostgreSQL, and automatic database migrations with one command:

```bash
GEMINI_API_KEY=your-google-api-key docker compose up --build --wait
```

Open `http://localhost:18080`. The API is also published at `http://localhost:18081`; its application and authentication references are at `/api-docs` and `/auth-docs`. The frontend container proxies `/api` and `/socket.io` to the backend, so browser sessions stay same-origin.

If pnpm is installed, `pnpm docker:up`, `pnpm docker:logs`, and `pnpm docker:down` are convenience wrappers. Database data remains in the named Compose volume after shutdown.

Published ports bind to `127.0.0.1` by default. Before public deployment, set strong `BETTER_AUTH_SECRET` and `POSTGRES_PASSWORD` values, configure `BETTER_AUTH_URL`, `APP_WEB_URL`, and `API_CORS_ORIGINS`, then explicitly change the bind addresses. The server starts with a placeholder Gemini key for UI inspection, but the default provider path needs a real key for interviews. The all-local profile does not.

### Choose local AI providers

LLM, STT, and TTS are independently selectable. The ordinary command above keeps all three on Gemini. Enable only the local services you want:

```bash
# Local Qwen interviewer; Gemini speech still requires an API key
GEMINI_API_KEY=your-google-api-key LLM_PROVIDER=local \
  docker compose --profile local-llm up --build --wait

# Both speech providers local; the Gemini interviewer still requires an API key
GEMINI_API_KEY=your-google-api-key STT_PROVIDER=local TTS_PROVIDER=local \
  docker compose --profile local-stt --profile local-tts up --build --wait

# Run the complete system locally; no real Gemini key or Google API call is used
LLM_PROVIDER=local STT_PROVIDER=local TTS_PROVIDER=local \
  docker compose --profile local-llm --profile local-stt --profile local-tts \
  up --build --wait

# Equivalent pnpm convenience command
pnpm docker:up:local
```

The `local-llm` profile starts Ollama, downloads `qwen3:8b` once, and then starts the FastAPI LLM service. The model is about 5.2 GB and is retained in the `interview-ollama-data` volume, so later starts reuse it. `docker compose down` keeps both model and database data; `docker compose down --volumes` deletes both named volumes.

Compose publishes local LLM, TTS, and STT readiness at `http://127.0.0.1:18084/health`, `http://127.0.0.1:18082/health`, and `http://127.0.0.1:18083/health`. The LLM becomes ready only after Ollama is reachable and the configured model is installed. The STT image embeds Whisper `small` (about 461 MiB for `model.bin`, plus supporting files), while the TTS image embeds the roughly 63 MB Lessac voice. Provider failures never silently switch to Gemini.

The default Ollama container is CPU-compatible and needs no special host configuration, but Qwen response time depends heavily on the processor. Allow roughly 8 GB of free memory for Ollama and preferably 16 GB of total system RAM for the complete local stack. GPU acceleration requires an appropriate host driver and a platform-specific Ollama container configuration; on macOS, native Ollama generally provides better acceleration than Ollama inside Docker.

See the [local LLM](docs/LOCAL_LLM_SERVICE.md), [local STT](docs/LOCAL_STT_SERVICE.md), and [local TTS](docs/LOCAL_TTS_SERVICE.md) guides for native setup, provider variables, model/cache behavior, format compatibility, and licensing considerations.

## Native development

```bash
pnpm install
cp apps/nestjs-server/.env.example apps/nestjs-server/.env
docker compose up -d --wait postgres
pnpm db:migrate
pnpm dev
```

Set a random `BETTER_AUTH_SECRET` of at least 32 characters. Set a real `GEMINI_API_KEY` when using any Gemini provider. Vite serves the app at `http://localhost:5173` and proxies API/realtime traffic to NestJS at `http://localhost:3000`. See the app-specific runbooks for provider and proxy overrides.

For native local AI, run the LLM service on `http://127.0.0.1:8003`, STT on `http://127.0.0.1:8002`, and TTS on `http://127.0.0.1:8001`, then set the corresponding provider and URL variables in the server environment. Ollama must be running with `qwen3:8b` pulled before starting the LLM service. Keep each FastAPI service at one Uvicorn worker so its admission guard covers the process.

## Verify

```bash
pnpm lint
pnpm typecheck
pnpm typecheck:test
pnpm build
pnpm test
pnpm test:e2e:docker
pnpm test:e2e:web
pnpm audit --prod
```

The server Docker E2E command uses an isolated PostgreSQL instance and fake AI adapters. The browser suite builds the client, starts a local preview, mocks only the backend boundary, and exercises the product journeys in desktop Chromium.

## Documentation

- [Web client runbook](apps/react-client/README.md)
- [Server runbook](apps/nestjs-server/README.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Realtime protocol](docs/REALTIME_PROTOCOL.md)
- [Local LLM service guide](docs/LOCAL_LLM_SERVICE.md)
- [Local speech-to-text service guide](docs/LOCAL_STT_SERVICE.md)
- [Local text-to-speech service guide](docs/LOCAL_TTS_SERVICE.md)
- [Task tracker](docs/TASKS.md)
- [Implementation status](docs/IMPLEMENTATION_STATUS.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)

## Workspace commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start NestJS and Vite in watch mode |
| `pnpm dev:server` / `pnpm dev:web` | Start one development process |
| `pnpm docker:up` | Build and start the default Gemini-backed stack |
| `pnpm docker:up:local` | Build and start the complete local LLM/STT/TTS stack |
| `pnpm docker:down` | Stop every profile while retaining database and Ollama data |
| `pnpm docker:logs` | Follow application and optional local-AI container logs |
| `pnpm api:generate` | Regenerate Orval clients from the running server |
| `pnpm build` | Build all production packages |
| `pnpm test` | Run workspace unit and component tests |
| `pnpm test:e2e:web` | Run desktop Chromium journeys |
| `pnpm test:e2e:docker` | Run isolated server REST/Socket.IO E2E tests |
| `pnpm db:generate` / `pnpm db:migrate` | Generate or apply Drizzle migrations |
| `pnpm audit --prod` | Audit production dependencies |
