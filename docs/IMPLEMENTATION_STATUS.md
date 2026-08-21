# Implementation status

## Complete now

- pnpm workspace and NestJS 11 ESM server
- Multi-stage backend Docker image, one-command application Compose stack, and independent `local-stt`/`local-tts` profiles
- Optional automatic startup migrations with service health checks
- PostgreSQL/Drizzle schema and generated migration
- Better Auth email/password signup, login, logout, and sessions
- Strictly disabled password-reset/account-management/social-login scope
- Idempotent, creator-owned interview creation
- Per-user creation quotas and same-request single-flight protection
- Gemini structured question conversion with validated output and atomic persistence
- Unguessable authenticated share links with candidate-safe previews
- Creator-selected single-use or repeat-attempt interviews with one resumable active attempt per candidate
- Creator participant activity plus candidate-isolated, grouped attempt history
- Durable state, deadlines, asked-question progress, and text transcript
- Authenticated Socket.IO namespace with strict event validation
- Ordered/bounded in-memory candidate audio turns and inactivity fallback
- Single microphone ownership per attempt and bounded per-process media traffic
- Gemini LLM plus independently startup-selectable Gemini/local STT and TTS adapters
- Containerized, health-checked local STT with a build-cached Whisper `small` model and bounded PCM/WAV transcription
- Containerized, health-checked local TTS with an image-bundled Lessac voice and validated complete-WAV responses
- First-turn greeting with candidate name and interview context
- Natural interviewer prompt that does not teach, score, correct, or expose answers
- Server-validated mark-question/end-interview tools and no-repeat progress
- Active-task-only model context so future questions and candidate email stay private
- Subtitle delivery and one native-decoded complete-WAV TTS playback
- Automatic disposable video-encoder pause/resume around assistant speech
- Camera/screen acceptance with immediate discard
- Reconnection snapshots and replay-safe client turn IDs
- Scalar/OpenAPI references for domain and authentication APIs
- Unit and PostgreSQL-backed REST/Socket.IO E2E coverage
- Test-code type checking and a clean production dependency audit
- Desktop React PWA with zero-radius Chakra theme and a hard mobile/tablet gate
- Generated Orval clients, Axios cookies, TanStack Router guards, Query caching, Form validation, and ephemeral Zustand room state
- Creator dashboard, creation/detail/share flows, and authenticated candidate join flow
- Repeat-attempt creation controls, participant attempt tables, and taken-interview history
- Device preflight, disposable camera/screen transport, PCM microphone VAD, realtime subtitles, and ordered audio playback
- Required interview fullscreen, concealed exit warning/re-entry flow, and ephemeral exit count
- Authenticated realtime round-trip latency indicator
- Explicit-logout cache clearing and reconnect-safe microphone ownership
- Static-shell-only PWA caching with active-interview-safe updates
- Production frontend nginx image and one-command frontend/backend/PostgreSQL Compose stack
- Frontend unit, component, and desktop Chromium journey coverage

## Intentionally not part of this phase

- Interview scoring, analysis, reports, recommendations, or ideal answers
- User profile editing or account-management UI
- Email delivery, verification, and forgot-password flow
- Recording or storing camera, screen, or raw microphone media
- Human observer dashboard
- Inescapable kiosk controls or operating-system/browser lockdown (the Fullscreen API always preserves a user escape path)

## Later integration work

- Add a local or alternative LLM provider; local STT and TTS are already integrated as opt-in providers
- Add an audio transcoder if a future client sends WebM microphone audio
- Add server-side decoded-audio VAD as a fallback; the browser performs acoustic VAD and the server retains a chunk-inactivity timeout
- Add a shared Socket.IO adapter, sticky routing, and distributed work leases before multi-instance scaling
- Add observability and deployment configuration for the selected production environment

These later items are extension points, not blockers for the current single-server final-year-project interview flow.
