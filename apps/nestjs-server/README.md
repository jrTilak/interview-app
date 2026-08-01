# NestJS interview server

This package owns authentication, interview definitions, candidate attempts, realtime media coordination, and the three AI provider adapters. It follows a feature-module structure and keeps external AI SDK details behind application ports.

## Run the complete Docker stack

From the repository root:

```bash
GEMINI_API_KEY=your-google-api-key docker compose up --build --wait
```

This builds the frontend and backend images, starts PostgreSQL, waits for dependencies to become healthy, and applies the checked-in Drizzle migrations from the backend process. Open the PWA on port 18080; the API remains directly available on port 18081. No host Node.js installation or manual migration command is needed beyond Docker and Compose. `docker compose down` stops all three services without deleting PostgreSQL data. The root `pnpm docker:*` scripts are optional convenience aliases.

All published ports bind to `127.0.0.1` by default. Set the frontend/backend bind addresses, strong database/auth secrets, the public `BETTER_AUTH_URL`, and exact CORS origins before deliberately exposing the service to another machine. The Compose backend health check calls `/api/ready`, which verifies both the NestJS process and its PostgreSQL connection.

Automatic migrations are controlled by `DB_AUTO_MIGRATE`; Compose enables them, while native and independently deployed servers default to `false` so migrations remain an explicit deployment decision.

## Environment

Copy `.env.example` to `.env`. Important values are:

- `BETTER_AUTH_SECRET`: random value of at least 32 characters
- `BETTER_AUTH_URL`: public origin serving `/api/auth`; this is the frontend/nginx origin in Compose and port 3000 for direct native development
- `APP_WEB_URL`: client origin used to build share URLs
- `API_CORS_ORIGINS`: comma-separated exact client origins; local development defaults trust both `localhost:5173` and `127.0.0.1:5173`
- `DB_*`: PostgreSQL connection values
- `DB_AUTO_MIGRATE`: apply checked-in migrations during startup; enabled by Docker Compose only
- `GEMINI_API_KEY`: Google Gemini API key
- `AUDIO_SILENCE_MS`: missing-chunk fallback that closes a started mic turn
- `AUDIO_MAX_BYTES` and `MEDIA_MAX_CHUNK_BYTES`: in-memory safety limits

Production WebSocket handshakes must include an allowed `Origin`. Authentication uses the Better Auth HTTP-only session cookie.

Email addresses are self-asserted in this phase: signup uses email/password, but verification mail is deliberately excluded. Raw microphone bytes are adapted in memory for the configured STT provider (wrapped as WAV for Gemini), discarded after transcription, and only the resulting text transcript is persisted.

## HTTP API

All paths below are under `/api`. Better Auth responses use its native response shape; successful application endpoints use `{ "message": "...", "data": ... }`.

| Method and path | Purpose |
| --- | --- |
| `POST /auth/sign-up/email` | Email/password signup |
| `POST /auth/sign-in/email` | Email/password login |
| `POST /auth/sign-out` | End the session |
| `GET /auth/get-session` | Read the session |
| `POST /interviews` | AI-structure and atomically create an interview |
| `GET /interviews` | List interviews owned by the creator |
| `GET /interviews/:id` | Read creator-only raw and structured questions |
| `GET /shared-interviews/:shareCode` | Read candidate-safe link metadata |
| `POST /shared-interviews/:shareCode/attempts` | Create or resume a candidate attempt |
| `GET /interview-attempts/:id` | Reconnect with durable state/transcript |

`POST /interviews` requires a client-generated UUID in `clientRequestId`. Retrying the same ID returns the original interview without a second Gemini call, including concurrent identical requests handled by one server process. Expensive creation is limited per user and only one distinct structuring request may run for that user at a time. A provider or transaction failure leaves no partial interview.

Password reset, email verification mail, social login, account/profile mutation, and account deletion are intentionally disabled.

## Realtime

Connect Socket.IO to namespace `/interviews` with credentials enabled, join the attempt, then start it. See [the full protocol](../../docs/REALTIME_PROTOCOL.md) for schemas, acknowledgements, and binary flow.

The server accepts supported buffered audio (`wav`, `mpeg`/`mp3`, `aiff`, `aac`, `ogg`, `flac`, `m4a`, or linear PCM `l16`). MIME types are normalized, so parameters such as `audio/ogg; codecs=opus` are accepted. Linear PCM uses the application's signed 16-bit little-endian wire convention and must include its sample rate; the Gemini adapter wraps the completed bytes in memory as a valid WAV input. Browser `MediaRecorder` commonly emits WebM, which Gemini's buffered transcription path does not accept here; the client must record/encode a supported type or a future media service must transcode it.

`microphone:end` is the reliable turn boundary. The inactivity fallback means no new chunks arrived; it does not perform acoustic voice-activity detection inside continuously streamed compressed audio.

One attempt has one transient microphone owner at a time, even when the candidate opens multiple tabs. Camera/screen data is accepted only while the attempt is active and the corresponding media flag is enabled. Per-chunk, per-turn, rolling traffic, connection, and aggregate in-memory limits protect the single-server process.

## Replace Gemini later

Implement one or more interfaces in `src/modules/ai/ai.ports.ts`:

- `InterviewLlmPort`
- `SpeechToTextPort`
- `TextToSpeechPort`

Bind the implementation to `INTERVIEW_LLM`, `SPEECH_TO_TEXT`, or `TEXT_TO_SPEECH` in the AI module. Interview services and the gateway do not import Gemini classes.

## Database and production

```bash
pnpm --filter @interview-app/nestjs-server db:migrate
pnpm --filter @interview-app/nestjs-server build
pnpm --filter @interview-app/nestjs-server start:prod
```

Run migrations as a deployment step before starting the process. Realtime work is coordinated durably through attempt state, but live room broadcasts, in-flight AI work guards, rate limits, and transient audio buffers are process-local; run one server instance for this phase. Add distributed work leases, sticky connections, and a shared Socket.IO adapter before horizontally scaling. A session is authenticated during the Socket.IO handshake; logout/revocation takes effect for a new connection, so reconnect after changing session state.

## API references

With `SWAGGER_ENABLE=true`:

- `/api-docs` and `/api-docs.json`: application API
- `/auth-docs` and `/auth-docs.json`: Better Auth API
