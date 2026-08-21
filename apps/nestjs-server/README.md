# NestJS interview server

This package owns authentication, interview definitions, candidate attempts, realtime media coordination, and the AI provider adapters. It follows a feature-module structure and keeps external AI SDK and HTTP details behind application ports. Gemini provides the LLM; STT and TTS independently use Gemini by default or opt-in local faster-whisper and Piper services.

## Run the complete Docker stack

From the repository root:

```bash
GEMINI_API_KEY=your-google-api-key docker compose up --build --wait
```

This builds the frontend and backend images, starts PostgreSQL, waits for dependencies to become healthy, and applies the checked-in Drizzle migrations from the backend process. Open the PWA on port 18080; the API remains directly available on port 18081. No host Node.js installation or manual migration command is needed beyond Docker and Compose. `docker compose down` stops the stack without deleting PostgreSQL data. The root `pnpm docker:*` scripts are optional convenience aliases.

The local speech containers are not part of the default profile. Export `GEMINI_API_KEY`, then select and start either provider independently, or run both:

```bash
STT_PROVIDER=local docker compose --profile local-stt up --build --wait
TTS_PROVIDER=local docker compose --profile local-tts up --build --wait
STT_PROVIDER=local TTS_PROVIDER=local docker compose --profile local-stt --profile local-tts up --build --wait
```

Compose gives the backend `LOCAL_STT_URL=http://stt:8002` and `LOCAL_TTS_URL=http://tts:8001`, publishing their health endpoints at `http://127.0.0.1:18083/health` and `http://127.0.0.1:18082/health`. It intentionally does not make the backend depend on either profiled service, so the default Gemini-only stack remains valid. Selecting a local provider without its healthy service causes that request to fail; there is no silent cross-provider fallback.

The STT image build downloads Whisper `small` into `/models/small`; that default cache is baked into a Docker image layer and is not shadowed by a named volume. The TTS image embeds its Lessac voice the same way. `--wait` accounts for the model-loading cold starts through each image's readiness health check. See the [local STT](../../docs/LOCAL_STT_SERVICE.md) and [local TTS](../../docs/LOCAL_TTS_SERVICE.md) guides for native setup and compatibility details.

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
- `GEMINI_API_KEY`: Google Gemini API key; still required for the LLM even when both speech providers are local
- `STT_PROVIDER`: `gemini` (default) or `local`
- `LOCAL_STT_URL`: local service base URL; native default `http://127.0.0.1:8002`, overridden to `http://stt:8002` by Compose
- `LOCAL_STT_TIMEOUT_MS`: local transcription request timeout, default `45000` (accepted range `1000`–`120000`)
- `TTS_PROVIDER`: `gemini` (default) or `local`
- `LOCAL_TTS_URL`: local service base URL; native default `http://127.0.0.1:8001`, overridden to `http://tts:8001` by Compose
- `LOCAL_TTS_VOICE`: service voice name, default `professional-default`
- `LOCAL_TTS_TIMEOUT_MS`: local synthesis request timeout, default `45000` (accepted range `1000`–`120000`)
- `AUDIO_SILENCE_MS`: missing-chunk fallback that closes a started mic turn
- `AUDIO_MAX_BYTES` and `MEDIA_MAX_CHUNK_BYTES`: in-memory safety limits

Production WebSocket handshakes must include an allowed `Origin`. Authentication uses the Better Auth HTTP-only session cookie.

Email addresses are self-asserted in this phase: signup uses email/password, but verification mail is deliberately excluded. Raw microphone bytes are adapted in memory for the configured STT provider (wrapped as WAV for Gemini or uploaded directly as multipart PCM to local STT), discarded after transcription, and only the resulting text transcript is persisted.

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
| `GET /interviews/:id/attempts` | List metadata for every participant attempt on an owned interview |
| `GET /shared-interviews/:shareCode` | Read candidate-safe link metadata |
| `POST /shared-interviews/:shareCode/attempts` | Resume the active attempt or create one allowed by the interview policy |
| `GET /interview-attempts` | List the candidate's interviews with every attempt grouped as history |
| `GET /interview-attempts/:id` | Reconnect with durable state/transcript |

`POST /interviews` requires a client-generated UUID in `clientRequestId`. `allowMultipleAttempts` defaults to `false` and is fixed when the interview is created. Retrying the same ID returns the original interview without a second Gemini call, including concurrent identical requests handled by one server process. Expensive creation is limited per user and only one distinct structuring request may run for that user at a time. A provider or transaction failure leaves no partial interview.

Joining always resumes an existing nonterminal attempt. After a completed or failed attempt, the server creates a fresh one only when `allowMultipleAttempts` is enabled; otherwise it returns a conflict. A partial unique database index and locked creation transaction prevent two active attempts for the same interview/candidate. History endpoints expose identity, state, timestamps, and question counts only—no scoring, analysis, hidden questions, or other candidates' transcripts.

Password reset, email verification mail, social login, account/profile mutation, and account deletion are intentionally disabled.

## Realtime

Connect Socket.IO to namespace `/interviews` with credentials enabled, join the attempt, then start it. See [the full protocol](../../docs/REALTIME_PROTOCOL.md) for schemas, acknowledgements, and binary flow.

The gateway accepts supported buffered audio (`wav`, `mpeg`/`mp3`, `aiff`, `aac`, `ogg`, `flac`, `m4a`, or linear PCM `l16`). MIME types are normalized, so parameters such as `audio/ogg; codecs=opus` are accepted. Provider capabilities are narrower: Gemini accepts the listed buffered formats after PCM-to-WAV wrapping, while local STT accepts only uncompressed 16-bit PCM WAV or the application's signed little-endian `audio/l16` convention. The current client is compatible because it sends mono 16 kHz `audio/l16` with sample-rate/channel metadata. WebM is unsupported by either adapter.

`microphone:end` is the reliable turn boundary. The inactivity fallback means no new chunks arrived; it does not perform acoustic voice-activity detection inside continuously streamed compressed audio.

One attempt has one transient microphone owner at a time, even when the candidate opens multiple tabs. Camera/screen data is accepted only while the attempt is active and the corresponding media flag is enabled. Per-chunk, per-turn, rolling traffic, connection, and aggregate in-memory limits protect the single-server process.

## AI provider selection and replacement

Set `STT_PROVIDER=local` and/or `TTS_PROVIDER=local` to bind the corresponding port to its local HTTP adapter; otherwise that port stays bound to Gemini. These switches are independent, provider selection happens at server startup, and failures never fall back silently. Interview structuring and turn generation always use the Gemini LLM. Run native services at their configured URLs or use the Compose profiles above.

Implement one or more interfaces in `src/modules/ai/ai.ports.ts`:

- `InterviewLlmPort`
- `SpeechToTextPort`
- `TextToSpeechPort`

Bind additional implementations to `INTERVIEW_LLM`, `SPEECH_TO_TEXT`, or `TEXT_TO_SPEECH` in the AI module. Interview services and the gateway do not import provider-specific classes.

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
