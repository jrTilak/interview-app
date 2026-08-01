# Implementation status

## Complete now

- pnpm workspace and NestJS 11 ESM server
- Multi-stage backend Docker image and one-command PostgreSQL/backend Compose stack
- Optional automatic startup migrations with service health checks
- PostgreSQL/Drizzle schema and generated migration
- Better Auth email/password signup, login, logout, and sessions
- Strictly disabled password-reset/account-management/social-login scope
- Idempotent, creator-owned interview creation
- Per-user creation quotas and same-request single-flight protection
- Gemini structured question conversion with validated output and atomic persistence
- Unguessable authenticated share links with candidate-safe previews
- One resumable interview attempt per authenticated candidate
- Durable state, deadlines, asked-question progress, and text transcript
- Authenticated Socket.IO namespace with strict event validation
- Ordered/bounded in-memory candidate audio turns and inactivity fallback
- Single microphone ownership per attempt and bounded per-process media traffic
- Independent Gemini LLM, buffered STT, and streaming TTS adapters
- First-turn greeting with candidate name and interview context
- Natural interviewer prompt that does not teach, score, correct, or expose answers
- Server-validated mark-question/end-interview tools and no-repeat progress
- Active-task-only model context so future questions and candidate email stay private
- Subtitle and TTS audio streaming to the client
- Camera/screen acceptance with immediate discard
- Reconnection snapshots and replay-safe client turn IDs
- Scalar/OpenAPI references for domain and authentication APIs
- Unit and PostgreSQL-backed REST/Socket.IO E2E coverage
- Test-code type checking and a clean production dependency audit

## Intentionally not part of this phase

- React client
- Interview scoring, analysis, reports, recommendations, or ideal answers
- User profile editing or account-management UI
- Email delivery, verification, and forgot-password flow
- Recording or storing camera, screen, or raw microphone media
- Human observer dashboard
- Multiple attempts by the same candidate for one interview link

## Later integration work

- Replace any Gemini adapter independently with local LLM/STT/TTS services
- Add an audio transcoder or client encoder if the browser emits WebM
- Add real acoustic/client-side VAD; the server currently uses explicit end plus no-chunk timeout
- Add a shared Socket.IO adapter, sticky routing, and distributed work leases before multi-instance scaling
- Add observability and deployment configuration for the selected production environment

These later items are extension points, not blockers for the current single-server final-year-project interview flow.
