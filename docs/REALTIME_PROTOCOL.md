# Realtime interview protocol

## Connection and ordering

Connect a Socket.IO client to namespace `/interviews` with the Better Auth cookie and an allowed `Origin`. The normal sequence is:

1. Create or resume an attempt over REST.
2. Emit `attempt:join` and wait for its acknowledgement.
3. Subscribe to server events before emitting `attempt:start`.
4. Buffer assistant audio through `assistant:turn:end`, then play the complete utterance once while displaying subtitles.
5. When state becomes `LISTENING`, open one mic turn, send ordered binary chunks, then explicitly close it.
6. Repeat until `attempt:ended`.

Every client event returns an acknowledgement:

```ts
type Ack<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; retryable: boolean } };
```

Failures are also emitted as `attempt:error`. UUIDs used as `turnId` must be newly generated for each candidate turn; replaying a completed `turnId` is safely ignored.

The session is verified once during the WebSocket handshake. At most three concurrent sockets are accepted for one user on a server instance. Reconnect after logout or any session change so the new handshake observes it.

The client may periodically emit `connection:ping` with `{ probeId: uuid }`. Its acknowledgement echoes the UUID and adds an ISO `serverTime`. The client measures local round-trip duration around that acknowledgement; the probe requires the handshake session but does not require joining an attempt, query interview state, or persist a sample.

## Client-to-server events

| Event | Payload | Notes |
| --- | --- | --- |
| `connection:ping` | `{ probeId: uuid }` | Authenticated state-free latency probe; ack returns `{ probeId, serverTime }` |
| `attempt:join` | `{ attemptId: uuid }` | Authorizes ownership, joins a private room, emits `attempt:snapshot` |
| `attempt:start` | `{ attemptId: uuid, commandId: uuid }` | Idempotently starts or resumes the interviewer |
| `microphone:start` | `{ attemptId, turnId, mimeType, sampleRateHz?, channels? }` | Allowed only in `LISTENING`; channels defaults to 1 |
| `microphone:chunk` | `{ attemptId, turnId, sequence, data }` | `data` must be non-empty binary; sequence starts at 0 with no gaps; one turn accepts at most 32,768 chunks |
| `microphone:end` | `{ attemptId, turnId, lastSequence }` | Explicit, preferred turn boundary |
| `media:status` | `{ attemptId, cameraActive, screenActive, microphoneActive }` | Persists flags only |
| `camera:chunk` | `{ attemptId, sequence, mimeType, data }` | Bounded, authorized, immediately discarded |
| `screen:chunk` | `{ attemptId, sequence, mimeType, data }` | Bounded, authorized, immediately discarded |

Supported socket STT MIME types are `audio/wav`, `audio/mpeg`, `audio/mp3`, `audio/aiff`, `audio/aac`, `audio/ogg`, `audio/flac`, `audio/m4a`, and `audio/l16`. In this application, socket `audio/l16` means raw signed 16-bit little-endian PCM and requires `sampleRateHz`; the React client sends mono 16 kHz audio. The Gemini adapter wraps a completed PCM turn in a RIFF/WAV container and sends it as `audio/wav`, because raw L16 is not a supported Gemini transcription input. Browser WebM microphone audio is not accepted by the current buffered-STT adapter; encode a supported format in the client or add a transcoding provider behind the STT port.

The server also closes a mic turn after `AUDIO_SILENCE_MS` with no chunks, including a started turn that received no audio. This is a network/chunk inactivity fallback, not acoustic silence detection. The client should perform voice-activity detection or stop sending and emit `microphone:end` when the speaker finishes. Only one socket may own the active mic turn for an attempt.

Camera and screen chunks are accepted only for an active interview when their respective `media:status` flag is true. They are rate/size checked and discarded. Microphone turns have per-chunk, per-turn, and process-wide aggregate memory limits; disposable media also has a rolling traffic limit.

## Server-to-client events

| Event | Important payload fields |
| --- | --- |
| `attempt:snapshot` | Full state, timestamps, media flags, and persisted text turns |
| `attempt:state` | Same reconnect-safe snapshot after a transition |
| `assistant:turn:start` | `{ turnId }` |
| `assistant:subtitle` | `{ turnId, text, isFinal: true }` |
| `assistant:audio:chunk` | `{ turnId, sequence, mimeType, sampleRateHz?, channels?, data }` |
| `assistant:turn:end` | `{ turnId }` |
| `candidate:transcript` | `{ turnId, text, isFinal: true }` |
| `attempt:ended` | `{ reason: "AI_COMPLETED" | "TIME_LIMIT", endedAt }` |
| `attempt:error` | `{ code, message, retryable }` |

TTS uses one non-streaming Gemini `generateContent` request per assistant utterance. The server validates the completed, size-limited mono 24 kHz signed little-endian PCM response, wraps it as `audio/wav`, and emits one `assistant:audio:chunk`. The browser waits through `assistant:turn:end`, native-decodes the complete WAV once, and plays exactly one audio source with a playback-oriented Web Audio context. Camera and screen `MediaRecorder` encoders pause during this playback and resume after drain, cancellation, or failure; their device tracks are not stopped. Subtitle text is emitted before audio, so an audio-provider failure leaves the interview usable via text.

## Reconnection

Call `GET /api/interview-attempts/:id`, reconnect, and emit `attempt:join`. If the durable state is `ASSISTANT_SPEAKING` or `ENDING`, `attempt:start` replays the persisted last assistant utterance rather than creating a second transcript. If it is `LISTENING`, the client may open a new mic turn. Completed attempts cannot be restarted or mutated.

Mic bytes are intentionally transient and scoped to one socket. A disconnect during a mic turn drops that incomplete server buffer; the client must cancel its local controller and start a new `turnId` after reconnecting. A direct live-route restore also requires a fresh user gesture before Web Audio playback and realtime orchestration begin.
