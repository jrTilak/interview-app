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
- Replaceable LLM, speech-to-text, and text-to-speech ports, currently backed by independent Gemini adapters
- Unit, component, REST/Socket.IO E2E, and Chromium browser coverage

The deliberately excluded scope is recorded in [Implementation status](docs/IMPLEMENTATION_STATUS.md).

## Requirements

- Node.js 22.22.1 or newer
- pnpm 11 or newer
- Docker with Compose, or a PostgreSQL 18-compatible database
- A Google Gemini API key for real AI interview turns

## Start the complete app with Docker

Start the frontend, backend, PostgreSQL, and automatic database migrations with one command:

```bash
GEMINI_API_KEY=your-google-api-key docker compose up --build --wait
```

Open `http://localhost:18080`. The API is also published at `http://localhost:18081`; its application and authentication references are at `/api-docs` and `/auth-docs`. The frontend container proxies `/api` and `/socket.io` to the backend, so browser sessions stay same-origin.

If pnpm is installed, `pnpm docker:up`, `pnpm docker:logs`, and `pnpm docker:down` are convenience wrappers. Database data remains in the named Compose volume after shutdown.

Published ports bind to `127.0.0.1` by default. Before public deployment, set strong `BETTER_AUTH_SECRET` and `POSTGRES_PASSWORD` values, configure `BETTER_AUTH_URL`, `APP_WEB_URL`, and `API_CORS_ORIGINS`, then explicitly change the bind addresses. The server starts with a placeholder Gemini key for UI inspection, but interview creation and AI turns need a real key.

## Native development

```bash
pnpm install
cp apps/nestjs-server/.env.example apps/nestjs-server/.env
docker compose up -d --wait postgres
pnpm db:migrate
pnpm dev
```

Set a random `BETTER_AUTH_SECRET` of at least 32 characters and a real `GEMINI_API_KEY` in `apps/nestjs-server/.env`. Vite serves the app at `http://localhost:5173` and proxies API/realtime traffic to NestJS at `http://localhost:3000`. See the app-specific runbooks for provider and proxy overrides.

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
| `pnpm docker:up` | Build and start the complete stack |
| `pnpm docker:down` | Stop the stack while retaining database data |
| `pnpm docker:logs` | Follow application container logs |
| `pnpm api:generate` | Regenerate Orval clients from the running server |
| `pnpm build` | Build all production packages |
| `pnpm test` | Run workspace unit and component tests |
| `pnpm test:e2e:web` | Run desktop Chromium journeys |
| `pnpm test:e2e:docker` | Run isolated server REST/Socket.IO E2E tests |
| `pnpm db:generate` / `pnpm db:migrate` | Generate or apply Drizzle migrations |
| `pnpm audit --prod` | Audit production dependencies |
