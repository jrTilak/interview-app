# Task status

## Complete

- [x] Local-only LLM, STT, and TTS application ports and services
- [x] Compose startup/readiness for Ollama/Qwen, faster-whisper, and Piper
- [x] Resident model preload/keep-alive and personalized model-generated opening
- [x] Topic-boundary generation with server-enforced turn counts and bounded natural follow-ups
- [x] Email/password sessions, guarded routes, ownership, and candidate-safe sharing
- [x] Recruiter CRUD, participant history, and protected deletion
- [x] Separate Interview and Recruiter workspaces with multipage navigation
- [x] Candidate history and join-by-link workflow
- [x] Realtime attempt lifecycle, PCM turns, transcripts, deadlines, and reconnects
- [x] Fullscreen concealment and monitor-only screen-share validation
- [x] Client-side face detector, outlines, start gate, pause, and termination report
- [x] Process-wide development flags with optional camera/screen streaming
- [x] Optional NVIDIA GPU profile with Flash Attention and bounded model concurrency
- [x] Unit, component, REST/Socket.IO, and browser journey coverage

## Future production work

- [ ] Shared leases, flags, limits, and Socket.IO adapter for horizontal scaling
- [ ] Pagination for large recruiter/participant histories
- [ ] Verified email and account recovery
- [ ] Production liveness/identity controls if the product requires proctoring
- [ ] Optional scoring/report workflows with an explicit fairness and review design
- [ ] Multi-candidate load/capacity testing and production hardware sizing
