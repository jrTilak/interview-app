# Interview App

An end-to-end AI interview platform backend built as a pnpm workspace. The current workspace contains the NestJS server; the React client and local AI services can be added as separate workspace packages later.

## What works

- Email/password signup, login, logout, and session handling through Better Auth
- Creator-owned interview creation from raw question notes
- Gemini structured-output conversion into immutable interview tasks
- Authenticated share-link preview and one resumable attempt per candidate
- Realtime Socket.IO interview state, microphone turns, subtitles, and streamed TTS audio
- Camera and screen chunks accepted, bounded, authorized, then intentionally discarded
- Durable transcripts, question progress, hard deadlines, reconnect snapshots, and AI tool-controlled completion
- Swappable LLM, speech-to-text, and text-to-speech ports with Gemini adapters
- Strict Zod validation, Drizzle ORM, PostgreSQL, OpenAPI, unit tests, and database-backed E2E tests

The deliberately excluded scope is recorded in [Implementation status](docs/IMPLEMENTATION_STATUS.md).

## Requirements

- Node.js 22.22.1 or newer
- pnpm 11 or newer
- Docker with Compose, or a PostgreSQL 18-compatible database
- A Google Gemini API key for real AI calls

## Start locally

### Complete Docker stack

Start PostgreSQL, apply migrations automatically, build the production backend image, and wait until both services are healthy:

```bash
GEMINI_API_KEY=your-google-api-key docker compose up --build --wait
```

The API is then available at `http://localhost:3000`, with application and authentication references at `/api-docs` and `/auth-docs`. If pnpm is installed, `pnpm docker:up` is the equivalent convenience command. Follow backend logs with `pnpm docker:logs` or `docker compose logs --follow backend`, and stop the stack with `pnpm docker:down` or `docker compose down`; the PostgreSQL volume is retained.

Both published ports bind to `127.0.0.1` by default. Before exposing the stack publicly, set strong `BETTER_AUTH_SECRET` and `POSTGRES_PASSWORD` values, configure `BETTER_AUTH_URL` and allowed origins, and explicitly change `BACKEND_BIND_ADDRESS` if remote access is intended. Changing `BACKEND_PORT` automatically updates the default local Better Auth URL. The server can start without a real Gemini key, but AI interview operations require one.

### Native development

```bash
pnpm install
cp apps/nestjs-server/.env.example apps/nestjs-server/.env
docker compose up -d --wait postgres
pnpm db:migrate
pnpm dev
```

Set a random `BETTER_AUTH_SECRET` of at least 32 characters and a real `GEMINI_API_KEY` in `apps/nestjs-server/.env` first. The API defaults to `http://localhost:3000`; the application and authentication reference UIs are at `/api-docs` and `/auth-docs`.

## Verify

```bash
pnpm lint
pnpm build
pnpm typecheck:test
pnpm test
pnpm test:e2e:docker
pnpm audit --prod
```

The Docker E2E command starts an isolated PostgreSQL instance on port `55432`, runs migrations and the full REST/Socket.IO flow with fake AI adapters, then removes the test database volume.

## Documentation

- [Server runbook](apps/nestjs-server/README.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Realtime protocol](docs/REALTIME_PROTOCOL.md)
- [Task tracker](docs/TASKS.md)
- [Implementation status](docs/IMPLEMENTATION_STATUS.md)

## Workspace commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start NestJS in watch mode |
| `pnpm docker:up` | Build and start the backend plus PostgreSQL, including migrations |
| `pnpm docker:down` | Stop the Docker stack while retaining database data |
| `pnpm docker:logs` | Follow backend container logs |
| `pnpm build` | Build production JavaScript |
| `pnpm test` | Run unit tests |
| `pnpm typecheck:test` | Type-check unit and E2E test code |
| `pnpm test:cov` | Run unit tests with coverage |
| `pnpm test:e2e:docker` | Run isolated PostgreSQL E2E tests |
| `pnpm audit --prod` | Audit production dependencies |
| `pnpm db:generate` | Generate a Drizzle migration after schema changes |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:studio` | Open Drizzle Studio |
