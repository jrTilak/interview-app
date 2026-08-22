# Architecture

## System topology

```text
Browser PWA
  ├─ HTTP /api + auth cookie ───────┐
  └─ Socket.IO /interviews ─────────┤
                                    v
                              NestJS server ─── PostgreSQL
                                ├─ LLM port ─── local FastAPI ─── Ollama/Qwen
                                ├─ STT port ─── faster-whisper FastAPI
                                └─ TTS port ─── Piper FastAPI
```

nginx serves the production PWA and proxies API and WebSocket traffic to NestJS, preserving a same-origin session. Compose starts the local model services as required dependencies and waits for their readiness checks before the backend becomes healthy.

## Client

TanStack Router defines separate pages for candidate history, joining by link, recruiter interviews, participants, creation, editing, details, the candidate lobby, and the live room. A small persistent workspace-mode store changes the navigation between Interview and Recruiter modes; authorization still comes from server ownership checks, not the toggle.

TanStack Query owns server state. Zustand holds only small UI/realtime state. Raw media is never placed in either store or durable browser storage.

The lobby acquires camera, microphone, and a monitor screen share. MediaPipe face detection runs entirely in the browser using a bundled model and WASM runtime. One stabilized face is required when the relevant global flags are active. The live page can pause microphone/audio/media encoders when zero or multiple faces are detected, and sends only the stabilized count for optional server-side termination.

## Server modules

- `auth`: Better Auth sessions and protected routes
- `database`: Drizzle/PostgreSQL persistence and migrations
- `interviews`: recruiter CRUD, structuring, ownership, sharing, and participant history
- `interview-attempts`: attempt lifecycle, transcripts, deadlines, question progress, and realtime rooms
- `ai`: provider-neutral ports and local HTTP adapters
- `dev-flags`: one process-wide in-memory flag snapshot gated by `DEV_TOOLS_ENABLED`

All HTTP input and realtime events cross strict Zod boundaries. Candidate-safe endpoints never expose raw recruiter notes, objectives, follow-up guidance, or another candidate's transcript.

## Interview flow

1. The recruiter submits notes. The local LLM structures them into persisted questions.
2. The candidate opens a share link and passes camera, microphone, one-face, and monitor-share checks.
3. The client creates/resumes an attempt, enters application fullscreen, connects to its Socket.IO room, and reports media/integrity status.
4. The server starts the attempt and immediately composes the opening from trusted candidate/interview data plus the first persisted prompt. This avoids a cold model generation on the critical first-question path.
5. Local TTS returns a complete WAV; the browser decodes and plays it once.
6. The browser captures a mono 16 kHz PCM candidate turn. Local STT returns text; later interviewer turns come from the local LLM.
7. The server owns task completion, hard deadlines, terminal state, and durable transcript snapshots.

The local LLM service preloads the configured model during application startup and keeps it resident for a configurable duration. This reduces later-turn cold starts without making server correctness depend on warm state.

## Integrity and media

Browser screen-capture hints request a monitor and reject the result unless `displaySurface` is `monitor` when whole-screen enforcement is enabled. Application fullscreen is a separate requirement; exiting it conceals interview content until the candidate re-enters.

Camera/screen streaming is off by default. Development flags may enable bounded disposable chunks to the server. They are authenticated, rate/size limited, and discarded after validation. Face detection stays client-side; only a count is reported.

Global flags intentionally affect the whole server process, not one account. They reset at restart and must remain disabled in untrusted environments.

## Scaling and replacement

The application depends on `InterviewLlmPort`, `SpeechToTextPort`, and `TextToSpeechPort`; another local model or internal service can implement those contracts without changing domain services.

Live buffers, room broadcasts, flags, connection limits, and work guards are currently process-local. Horizontal scaling needs sticky routing, distributed leases/limits, shared flags, and a shared Socket.IO adapter.
