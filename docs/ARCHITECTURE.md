# Architecture

## Runtime boundary

```text
React desktop PWA (nginx in Compose)
  |-- same-origin /api proxy + Better Auth cookie --> NestJS REST API --> PostgreSQL
  `-- same-origin /socket.io proxy ----------------> realtime gateway
                                         |
                                         v
                                interview orchestrator
                                  |-- LLM --> Gemini -----------------> Google API
                                  |-- STT --> Gemini -----------------> Google API
                                  `-- TTS --> provider selector
                                               |-- Gemini (default) --> Google API
                                               `-- local Piper ------> FastAPI service
```

NestJS is the source of truth. On each turn the model receives only the current pending task, never the future hidden list. It may propose only two narrow actions: mark that known question ID as asked and request interview completion. The server validates IDs, refuses early completion while a task remains, enforces the deadline independently, and owns every state transition.

The repository Docker Compose stack runs the frontend, backend, and PostgreSQL together on loopback-bound host ports. nginx serves the PWA and proxies same-origin API and WebSocket traffic to NestJS. PostgreSQL must pass its health check before NestJS starts; with `DB_AUTO_MIGRATE=true`, the server applies its bundled Drizzle migrations before it begins listening. The backend readiness check also queries PostgreSQL so dependency loss is reflected in container health, and the frontend waits for that readiness check. A fourth, loopback-published Piper service is available only through the `local-tts` profile. The backend does not depend on that optional service, preserving the default Gemini-only topology.

## Client boundaries

- TanStack Router owns file-based routes and session guards. Authenticated shared links preserve their target through login.
- Orval generates separate Better Auth and application clients. A small Axios boundary supplies cookies, base URLs, and consistent response errors.
- TanStack Query caches HTTP data in memory only. Zustand contains ephemeral room connection/media state and is never persisted.
- TanStack Form and Zod validate login, signup, and interview creation at the client boundary; the server remains authoritative.
- Camera and screen streams are disposable. Their encoders pause while assistant speech plays to avoid competing with audio rendering, while the live tracks remain available. Browser microphone frames are converted to mono 16 kHz signed little-endian PCM16 and ended by acoustic silence detection; the Gemini STT adapter wraps each completed turn as an in-memory WAV file.
- The PWA precaches only its static shell. API and Socket.IO paths are network-only, and updates are deferred while an interview attempt is active.
- A desktop capability gate runs before the router can issue protected API work or activate media features.
- The lobby unlocks Web Audio and application fullscreen from one user gesture. Leaving fullscreen removes the question/transcript UI until the candidate explicitly restores it; this cannot override the browser's mandatory Escape behavior.
- An authenticated, state-free Socket.IO acknowledgement probe supplies the latest round-trip latency sample without persisting monitoring history.

## Modules

- `auth`: Better Auth configuration and Nest bridge; email/password only
- `interviews`: creator ownership, idempotent creation, Gemini structuring, share preview
- `interview-attempts`: creator-selected repeat policy, one active candidate attempt, durable state/progress/transcript, and metadata-only histories
- `interview-attempts/realtime`: authenticated Socket.IO gateway and bounded ephemeral buffers
- `ai`: provider-neutral ports plus Gemini LLM/STT, Gemini TTS, and local HTTP TTS adapters; `TTS_PROVIDER` selects the TTS binding at startup
- `db`: Drizzle schema, PostgreSQL provider, lifecycle, and migrations
- `open-api`: separate application and Better Auth documents
- `common`: Zod validation, response wrapping, safe exceptions, and decorators

## Durable model

- An interview belongs to one creator and stores both the raw notes and normalized tasks.
- A cryptographically random 32-character share code locates a candidate-safe preview.
- An interview stores an immutable creation-time choice that either permits or rejects later attempts by the same candidate.
- A partial unique database constraint permits only one nonterminal attempt for each `(interview, candidate)` pair; completed and failed rows remain history.
- Per-attempt question progress prevents repetition across reconnects.
- Candidate and assistant text turns have monotonic sequence numbers. Raw audio/video is never persisted.
- A client request UUID uniquely identifies an interview create operation for safe retries.

Interview creation and question inserts share one transaction. Provider output is Zod-validated before that transaction, so a malformed/provider failure cannot leave a partial interview. Per-user quotas, one active creation per user, and same-request single-flight handling bound costly provider fan-out.

## Attempt state machine

```text
READY
  -> ASSISTANT_SPEAKING -> LISTENING -> PROCESSING
          ^                  |             |
          |                  |             `-> ASSISTANT_SPEAKING
          |                  `-- deadline -> PROCESSING
          |
          `--------------------------- generated next turn

ASSISTANT_SPEAKING -> ENDING -> COMPLETED
```

`FAILED` is reserved as a terminal operational state. Provider errors are currently retryable and preserve enough durable state for `attempt:start` to resume. A stale `PROCESSING` state can be recovered after a bounded interval, while a fresh processing state cannot be stolen by duplicate starts.

The process keeps a small in-memory running set to reject duplicate local work. Database compare-and-set transitions and unique indexes protect durable state in the supported single-instance deployment. Before horizontal production scaling, add a distributed work lease, sticky Socket.IO routing, and a shared Socket.IO adapter; live broadcasts, rate limits, and audio buffers are deliberately process-local.

## Security and privacy boundaries

- Every domain HTTP route and Socket.IO connection requires a valid Better Auth session.
- Creator/candidate ownership is checked in the database; foreign resource IDs are generally hidden as not found.
- Production Socket.IO handshakes require an explicitly allowed origin.
- Inputs are strict and bounded. Audio chunks must be ordered; total turn size and disposable media chunk size are capped.
- Connections, media-event cadence, aggregate buffered audio, and concurrent interview-creation calls are bounded per process.
- Camera/screen bytes are authorized and immediately discarded. Candidate mic bytes exist only in memory until STT returns, then are dropped.
- Only text transcripts, media-active flags, progress, and timing state persist.
- Raw microphone bytes are adapted to the configured STT provider in memory (RIFF/WAV for Gemini in this phase); candidate email and future hidden tasks do not go to the model.
- TTS is non-streaming. Gemini returns raw PCM that its adapter wraps as WAV; the local Piper service returns a validated mono 24 kHz, 16-bit PCM WAV directly. In either case, the realtime gateway emits one complete in-memory WAV and the browser native-decodes one source after the turn ends.
- Creator raw questions and hidden task details are never exposed by share preview or candidate snapshots.
- Model transcript text is treated as untrusted data, and model action IDs are restricted to server-provided task IDs.
- Unexpected HTTP failures and provider failures return provider-neutral messages.

## Provider replacement

The application depends only on `InterviewLlmPort`, `SpeechToTextPort`, and `TextToSpeechPort`. TTS already supports a startup-selected local HTTP implementation; Gemini remains the default and the only implemented LLM/STT provider. Future providers can implement the same interfaces over HTTP, gRPC, or another transport without modifying interview domain services or the realtime gateway. Provider failures do not cross-fallback silently.
