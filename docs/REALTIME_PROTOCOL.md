# Realtime interview protocol

## Connection and ordering

Connect a Socket.IO client to namespace `/interviews` with the Better Auth cookie and an allowed `Origin`. The normal sequence is:

1. Create or resume an attempt over REST.
2. Emit `attempt:join` and wait for its acknowledgement.
3. Subscribe to server events before emitting `attempt:start`.
4. Play each assistant audio chunk in sequence while displaying subtitles.
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

## Client-to-server events

| Event | Payload | Notes |
| --- | --- | --- |
| `attempt:join` | `{ attemptId: uuid }` | Authorizes ownership, joins a private room, emits `attempt:snapshot` |
| `attempt:start` | `{ attemptId: uuid, commandId: uuid }` | Idempotently starts or resumes the interviewer |
| `microphone:start` | `{ attemptId, turnId, mimeType, sampleRateHz?, channels? }` | Allowed only in `LISTENING`; channels defaults to 1 |
| `microphone:chunk` | `{ attemptId, turnId, sequence, data }` | `data` must be non-empty binary; sequence starts at 0 with no gaps; one turn accepts at most 32,768 chunks |
| `microphone:end` | `{ attemptId, turnId, lastSequence }` | Explicit, preferred turn boundary |
| `media:status` | `{ attemptId, cameraActive, screenActive, microphoneActive }` | Persists flags only |
| `camera:chunk` | `{ attemptId, sequence, mimeType, data }` | Bounded, authorized, immediately discarded |
| `screen:chunk` | `{ attemptId, sequence, mimeType, data }` | Bounded, authorized, immediately discarded |

Supported STT MIME types are `audio/wav`, `audio/mpeg`, `audio/mp3`, `audio/aiff`, `audio/aac`, `audio/ogg`, `audio/flac`, `audio/m4a`, and `audio/l16`. Browser WebM is not accepted by the current Gemini buffered-STT adapter. Encode a supported format on the client or add a transcoding provider behind the STT port.

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

TTS currently streams mono 24 kHz linear PCM (`audio/l16`) from Gemini. Use the metadata on every chunk instead of hard-coding it in the client. Subtitle text is emitted before audio, so an audio-provider failure still leaves the interview usable via text.

## Reconnection

Call `GET /api/interview-attempts/:id`, reconnect, and emit `attempt:join`. If the durable state is `ASSISTANT_SPEAKING` or `ENDING`, `attempt:start` replays the persisted last assistant utterance rather than creating a second transcript. If it is `LISTENING`, the client may open a new mic turn. Completed attempts cannot be restarted or mutated.

Mic bytes are intentionally transient and scoped to one socket. A disconnect during a mic turn drops that incomplete buffer; start a new `turnId` after reconnecting.
