# NestJS interview server

This package owns authentication, interview definitions, candidate attempts, realtime coordination, and provider-neutral model ports. The active implementations call the repository's local Qwen/Ollama, faster-whisper, and Piper HTTP services.

## Run

From the repository root, the recommended command starts every dependency and applies checked-in migrations:

```bash
docker compose up --build --wait
```

For native development, copy `.env.example` to `.env`, start PostgreSQL and the three local model services, then run:

```bash
pnpm db:migrate
pnpm dev:server
```

Important environment values:

- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `APP_WEB_URL`
- `API_CORS_ORIGINS` and `SWAGGER_ENABLE`
- `DB_*` and `DB_AUTO_MIGRATE`
- `LOCAL_LLM_URL` / `LOCAL_LLM_TIMEOUT_MS`
- `LOCAL_STT_URL` / `LOCAL_STT_TIMEOUT_MS`
- `LOCAL_TTS_URL` / `LOCAL_TTS_VOICE` / `LOCAL_TTS_TIMEOUT_MS`
- `AUDIO_SILENCE_MS`, `AUDIO_MAX_BYTES`, and `MEDIA_MAX_CHUNK_BYTES`
- `DEV_TOOLS_ENABLED`, which gates the global development-flags API

Production WebSocket handshakes must include an allowed origin. Authentication uses the Better Auth HTTP-only session cookie.

## HTTP API

All application paths are under `/api`. Successful responses use `{ "message": "...", "data": ... }`.

| Method and path | Purpose |
| --- | --- |
| `POST /auth/sign-up/email` | Create an account |
| `POST /auth/sign-in/email` | Sign in |
| `POST /auth/sign-out` | End the session |
| `GET /auth/get-session` | Read the session |
| `POST /interviews` | Structure and create an interview |
| `GET /interviews` | List interviews owned by the user |
| `GET /interviews/:id` | Read an owned interview |
| `PATCH /interviews/:id` | Edit interview metadata and attempt policy |
| `DELETE /interviews/:id` | Delete an interview with no attempt history |
| `GET /interviews/:id/attempts` | List participant attempts |
| `GET /shared-interviews/:shareCode` | Read candidate-safe link metadata |
| `POST /shared-interviews/:shareCode/attempts` | Resume or create an allowed attempt |
| `GET /interview-attempts` | List the candidate's grouped history |
| `GET /interview-attempts/:id` | Read a reconnect snapshot |
| `GET/PATCH /__flags__` | Read/update global dev flags when enabled |

Interview creation is idempotent through `clientRequestId`, rate-limited, and persisted atomically. Delete is rejected once any candidate attempt exists so history is never orphaned.

## Realtime and local services

Connect Socket.IO to `/interviews` with credentials, join an attempt, and then start it. The first assistant message is composed from server-owned interview data and emitted immediately; later turns use the local LLM. Completed candidate PCM is sent to local STT, and completed assistant text is sent to local TTS.

Media bytes are bounded and accepted only when their corresponding global stream flag is enabled. Camera and screen chunks are currently discarded after validation. Face counts—not video frames—drive optional integrity termination.

The domain depends on `InterviewLlmPort`, `SpeechToTextPort`, and `TextToSpeechPort`. New self-hosted or service-backed implementations can replace the local HTTP adapters by changing bindings in `src/modules/ai/ai.module.ts`; domain and gateway code remain provider-neutral.

See [Realtime protocol](../../docs/REALTIME_PROTOCOL.md) for event details.

## Verify

```bash
pnpm --filter @interview-app/nestjs-server build
pnpm --filter @interview-app/nestjs-server typecheck:test
pnpm --filter @interview-app/nestjs-server test
pnpm test:e2e:docker
```

With `SWAGGER_ENABLE=true`, API references are available at `/api-docs` and `/auth-docs`.
