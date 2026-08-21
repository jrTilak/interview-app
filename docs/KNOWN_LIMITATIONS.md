# Known limitations

The current release is a final-year-project interview demonstration, not a production proctoring platform. The following presentation-relevant limitations are intentional or low impact:

- Browser fullscreen can always be exited by the candidate. The client can only detect that exit and block the interview view until fullscreen is restored; it cannot prevent operating-system shortcuts or another display from being used.
- Some client session and query state is cached in memory. Switching accounts in the same tab should work, but an unusual interrupted logout or stale session transition may require a page refresh.
- Camera and screen-share chunks are authorized, bounded, and discarded by the server. They are not recorded or analyzed, so the system does not provide production-grade identity checks, cheating detection, or proctor review.
- Realtime attempt ownership and media coordination are process-local. Horizontal scaling requires sticky routing, distributed leases, and a shared Socket.IO adapter.
- The interview flow records transcripts and task completion only. Candidate scoring, answer evaluation, reports, and post-interview analysis are outside the current scope.
- Creator participant history is intentionally unpaginated, and the dashboard loads it once per owned interview. This is acceptable for project-sized presentation data; pagination and a creator-wide aggregate endpoint can be added later if the dataset grows.
- The optional local Whisper STT service is CPU/int8 and English-only, accepts PCM16 WAV or `audio/l16`, and runs one transcription at a time. It rejects concurrent work instead of queueing it, and slower CPUs may exceed the configured timeout after the model-loading cold start.
- The optional local Qwen LLM runs one generation at a time. Its default model download is about 5.2 GB, needs substantial memory, and can have noticeable first-turn or CPU-only latency. GPU acceleration requires platform-specific Ollama configuration.
- The optional Piper TTS service supports one bundled `professional-default` voice and one synthesis at a time. It rejects concurrent synthesis instead of queueing it, requires Python 3.12+ when run natively, and has a model-loading cold start.
