# Project task tracker

This is the living implementation checklist for the end-to-end interview platform. A checked item is implemented and covered by the verification commands in the root README.

## Foundation

- [x] Replace the Bun scaffold with a pnpm workspace
- [x] Create the NestJS 11 ESM server and feature-module structure
- [x] Add strict environment validation and safe startup/shutdown behavior
- [x] Add PostgreSQL, Drizzle schemas, and a generated migration
- [x] Add a production backend Docker image and one-command PostgreSQL/backend stack
- [x] Bundle and automatically apply migrations in the Compose deployment
- [x] Add consistent Zod validation, API responses, errors, and OpenAPI references

## Authentication

- [x] Add Better Auth email/password signup, login, logout, and session lookup
- [x] Require authenticated sessions on all interview HTTP and realtime operations
- [x] Disable social login, password reset, verification mail, and account-management routes
- [x] Document that email addresses are self-asserted in this phase because verification is out of scope

## Interview creation and sharing

- [x] Create creator-owned interviews from title, description, duration, and raw question notes
- [x] Convert raw notes into strict structured tasks through the LLM port
- [x] Validate provider output and save interviews/questions atomically
- [x] Make create requests idempotent with `clientRequestId`
- [x] Limit expensive creation requests and coalesce concurrent identical requests
- [x] Generate unguessable share codes and authenticated candidate-safe previews
- [x] Prevent candidates from seeing creator notes, hidden task details, or other attempts

## Interview execution

- [x] Create or resume one attempt per interview and candidate
- [x] Persist the attempt state, deadline, transcript, media flags, and per-question progress
- [x] Greet the candidate with their name and interview context
- [x] Give the model only the current pending task and reject unknown tool-action IDs
- [x] Prevent question repetition and refuse early completion while a task remains
- [x] Keep the interviewer neutral: no coaching, correction, scoring, or ideal answers
- [x] Enforce the hard deadline independently of model behavior
- [x] Recover safely after reconnects, duplicate commands, and retryable provider failures

## Realtime media and AI

- [x] Add an authenticated Socket.IO `/interviews` namespace
- [x] Accept bounded camera/screen chunks, authorize them, and immediately discard them
- [x] Accept ordered, bounded microphone turns with explicit end and no-chunk timeout fallback
- [x] Allow only one active microphone owner per attempt
- [x] Transcribe candidate audio, persist text, and stream subtitles plus assistant audio
- [x] Add replaceable LLM, STT, and TTS ports with separate Gemini adapters
- [x] Validate Gemini status, tool calls, structured data, audio formats, timeouts, and stream errors
- [x] Wrap socket PCM as in-memory WAV for Gemini STT and normalize live Gemini TTS audio events
- [x] Avoid sending candidate email or future hidden questions to the model

## Quality and documentation

- [x] Add focused unit tests for validation, buffering, attempt state, gateway safety, orchestration, creation limits, Gemini audio events, and WAV payloads
- [x] Add PostgreSQL-backed REST, authentication, authorization, realtime, media, and interview-flow E2E tests
- [x] Make E2E setup isolated and repeatable with Docker Compose
- [x] Add lint, build, test typecheck, dependency audit, and test commands
- [x] Document setup, architecture, API, realtime protocol, privacy, and deployment constraints
- [x] Run a real Gemini streaming-TTS-to-WAV-STT smoke test with the compiled Docker adapters

## React desktop client

- [x] Map the existing Expo-client conventions and backend HTTP/realtime contracts
- [x] Scaffold the React, Vite, pnpm-workspace, Chakra UI, and desktop PWA foundation
- [x] Generate typed application and authentication clients with Orval and Axios
- [x] Add TanStack Query caching, Router guards, Form validation, and Zustand room state
- [x] Build email signup/login/logout and authenticated application navigation
- [x] Build interview listing, creation, detail, copy-link, and shared-link join flows
- [x] Build the realtime interview room with preflight, camera/screen transport, PCM microphone VAD, audio playback, and subtitles
- [x] Hard-block mobile/tablet layouts and finish the zero-radius desktop design system
- [x] Add frontend unit/component edge-case coverage
- [x] Add desktop Chromium product-journey coverage
- [x] Document frontend setup, media/privacy boundaries, and verification
- [x] Add frontend Docker/nginx delivery and verify the full Compose stack
- [x] Recover the live interview room after transient realtime disconnects
- [x] Show authenticated realtime latency in the live interview room
- [x] Require interview fullscreen and block the question view until fullscreen is restored
- [x] Complete the expanded browser/container regression pass

## Deliberately deferred

- [ ] Harden cross-account session teardown and in-memory client cache isolation
- [ ] Replace Gemini adapters with the planned local LLM/STT/TTS services
- [ ] Add server-side decoded-audio VAD as a fallback to the browser/client acoustic VAD
- [ ] Add WebM transcoding if the chosen browser recorder cannot emit a supported STT format
- [ ] Add distributed work leases, sticky routing, and a shared Socket.IO adapter before horizontal scaling
- [ ] Add production observability and deployment configuration
