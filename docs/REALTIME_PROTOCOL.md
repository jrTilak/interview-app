# Realtime interview protocol

Connect Socket.IO to namespace `/interviews` with the Better Auth session cookie and an allowed `Origin`. Every client event is schema-validated and acknowledged as either `{ ok: true, data }` or `{ ok: false, error }`.

## Client events

| Event | Required payload | Purpose |
| --- | --- | --- |
| `connection:ping` | `probeId` UUID | Measure authenticated round-trip latency |
| `attempt:join` | `attemptId` UUID | Authorize and join one room |
| `attempt:start` | `attemptId`, `commandId` UUIDs | Idempotently start a ready attempt |
| `media:status` | `attemptId` and three active booleans | Persist camera/mic/screen status |
| `integrity:status` | `attemptId`, `detectedFaceCount` 0–10 | Apply global integrity termination flags |
| `microphone:start` | attempt/turn IDs, MIME type, optional format metadata | Claim the microphone and begin a turn |
| `microphone:chunk` | attempt/turn IDs, sequence, bytes | Append ordered audio |
| `microphone:end` | attempt/turn IDs, last sequence | Close and process a complete turn |
| `microphone:cancel` | attempt/turn IDs | Drop a partial turn during integrity pause |
| `camera:chunk` | attempt ID, sequence, MIME type, bytes | Optional disposable camera transport |
| `screen:chunk` | attempt ID, sequence, MIME type, bytes | Optional disposable monitor transport |

The client must join before any attempt-scoped event. Only one socket owns an attempt's microphone at once. Audio sequences are contiguous and size/time bounded. The current browser sends mono 16 kHz signed little-endian `audio/l16`; the complete buffered turn is discarded after transcription.

Camera/screen events are accepted only during an active attempt, when the corresponding media state and global stream flag are active. Chunks are authenticated, bounded, and discarded after validation.

## Server events

| Event | Purpose |
| --- | --- |
| `attempt:snapshot` | Current durable state after joining |
| `attempt:state` | Authoritative attempt/transcript/media snapshot |
| `assistant:turn:start` | Begin one assistant utterance |
| `assistant:subtitle` | Current assistant subtitle text |
| `assistant:audio:chunk` | Ordered WAV bytes |
| `assistant:turn:end` | Marks the complete playable utterance |
| `candidate:transcript` | Final text for a candidate turn |
| `attempt:ended` | Final reason and timestamp |
| `attempt:error` | Stable code, safe message, and retryability |

The server emits subtitle text before synthesis begins. The opening and later interviewer subtitles come from the preloaded resident local LLM, constrained by server-owned topic boundaries. Later turns follow transcription and use at most four recent dialogue turns for contextual acknowledgments and personalized questions.

Topic progression is authoritative server state. A persisted `turnCount` prevents the opening from completing its topic, allows at most one same-topic follow-up or conversational move, and forces a bridge afterward. The model provider never chooses IDs; the bridge maps its bounded completion signal to the current topic, and the server validates completion and decides final/deadline endings.

## Integrity behavior

Face detection runs in the browser. A stabilized count is reported on connection and whenever it changes. Pause flags stop/cancel microphone capture, suspend assistant playback, and pause optional media encoders locally. Termination flags call the authoritative server transition to `FAILED`, clear the deadline timer and partial audio, broadcast a final snapshot, and emit `INTEGRITY_TERMINATED`.

Development flags are process-wide and can change while rooms are active. The client refreshes them periodically.

## Errors and reconnects

Validation, authentication, conflicts, limits, and provider failures map to stable realtime errors without internal exception details. A reconnect joins the room again and receives the durable attempt snapshot. The server owns deadlines and terminal state, so disconnecting cannot extend an interview.
