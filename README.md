# Interview App

A desktop-first interview platform with local language, speech-to-text, and text-to-speech services. Recruiters create and manage structured interviews; candidates join a link, complete a realtime voice interview, and review their attempt history.

## Highlights

- Separate Interview and Recruiter workspaces after login
- Recruiter interview create, read, edit, delete, sharing, and participant history
- Candidate link entry, device preflight, attempt resume, and grouped history
- Local Qwen/Ollama interview generation, faster-whisper transcription, and Piper speech
- Immediate deterministic opening question while the local model is kept warm for later turns
- Client-side face detection with visible outlines and configurable pause/termination rules
- Monitor-only screen sharing and required application fullscreen
- Global development flags at `/__flags__` for integrity and media-streaming demos
- NestJS, React, PostgreSQL, Socket.IO, strict Zod boundaries, and OpenAPI references

See [Implementation status](docs/IMPLEMENTATION_STATUS.md) and [Known limitations](docs/KNOWN_LIMITATIONS.md) for the exact current scope.

## Requirements

- Node.js 22.22.1 or newer
- pnpm 11 or newer
- Docker with Compose for the recommended setup
- About 16 GB of system RAM for the complete local model stack
- Python 3.12 or newer only when running the model services natively

## Docker setup

The default Compose stack is fully local and includes the frontend, backend, PostgreSQL, Ollama/Qwen, faster-whisper, and Piper:

```bash
docker compose up --build --wait
```

Open `http://localhost:18080`. The API is available at `http://localhost:18081`; application and authentication references are at `/api-docs` and `/auth-docs`.

The first build downloads the configured Ollama model and embeds the speech models. Model and database data are retained in named volumes. Published ports bind to `127.0.0.1` by default.

Useful endpoints:

| Service | URL |
| --- | --- |
| Web app | `http://127.0.0.1:18080` |
| API | `http://127.0.0.1:18081` |
| Local TTS health | `http://127.0.0.1:18082/health` |
| Local STT health | `http://127.0.0.1:18083/health` |
| Local LLM health | `http://127.0.0.1:18084/health` |

Before public deployment, set strong `BETTER_AUTH_SECRET` and `POSTGRES_PASSWORD` values, configure the public URLs/CORS origins, and explicitly choose any non-loopback bind addresses.

## Native development

```bash
pnpm install
cp apps/nestjs-server/.env.example apps/nestjs-server/.env
docker compose up -d --wait postgres ollama ollama-pull local-llm stt tts
pnpm db:migrate
pnpm dev
```

Vite serves the app at `http://localhost:5173` and proxies API/realtime traffic to NestJS at `http://localhost:3000`. The server environment defaults to native service URLs on ports 8001–8003.

The development flags API is enabled by the example environment. Changes made at `/__flags__` are process-wide, affect connected users, and reset when the server restarts. Keep `DEV_TOOLS_ENABLED=false` outside controlled development/demo environments.

## Verify

```bash
pnpm lint
pnpm typecheck
pnpm typecheck:test
pnpm build
pnpm test
pnpm test:e2e:docker
pnpm test:e2e:web
```

## Documentation

- [Web client](apps/react-client/README.md)
- [Server](apps/nestjs-server/README.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Realtime protocol](docs/REALTIME_PROTOCOL.md)
- [Local LLM](docs/LOCAL_LLM_SERVICE.md)
- [Local STT](docs/LOCAL_STT_SERVICE.md)
- [Local TTS](docs/LOCAL_TTS_SERVICE.md)

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start NestJS and Vite in watch mode |
| `pnpm dev:server` / `pnpm dev:web` | Start one development process |
| `pnpm docker:up` | Build and start the complete local stack |
| `pnpm docker:down` | Stop the stack while retaining named-volume data |
| `pnpm docker:logs` | Follow application and model-service logs |
| `pnpm api:generate` | Regenerate Orval clients from a running server |
| `pnpm build` | Build all production packages |
| `pnpm test` | Run workspace unit and component tests |
| `pnpm test:e2e:web` | Run desktop Chromium journeys |
| `pnpm test:e2e:docker` | Run isolated REST/Socket.IO tests |
| `pnpm db:generate` / `pnpm db:migrate` | Generate or apply Drizzle migrations |
