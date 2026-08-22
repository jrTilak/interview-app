# Implementation status

## Implemented

- Email/password authentication and guarded desktop routes
- Interview and Recruiter workspaces with compact multipage navigation
- Recruiter create, list, detail, edit, delete, sharing, and participant history
- Candidate join-by-link, preflight, resume, live room, and grouped attempt history
- Local Qwen/Ollama question structuring and follow-up generation
- Local faster-whisper transcription and Piper WAV synthesis
- Immediate server-composed opening question and model preloading
- Durable attempts, transcripts, task progress, deadlines, reconnect snapshots, and terminal states
- Fullscreen concealment plus monitor-only screen sharing
- Client-side face detection, outlines, start gate, pause behavior, and optional termination
- Process-wide development flags and optional disposable camera/screen transport
- REST, Socket.IO, unit/component, and desktop Chromium test coverage

## Intentionally outside the current scope

- Automated scoring, ranking, answer evaluation, or recruiter reports
- Recorded proctoring video/audio or human proctor review
- Production identity verification and liveness/anti-spoofing
- Password reset, verified email delivery, social login, and account administration
- Horizontal realtime scaling
- Mobile/tablet interview UI

The integrity controls are demonstration safeguards, not a production invigilation guarantee. See [Known limitations](KNOWN_LIMITATIONS.md).
