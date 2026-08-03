# Local LLM service guide

## Purpose

The local LLM service is the interviewer brain. It does not handle audio, users, database records, timing, or WebSockets. The NestJS server remains responsible for those parts.

The service needs two operations.

## 1. Structure creator question notes

It receives:

- interview title
- optional interview description
- raw question notes written by the creator

It returns an ordered list of 1–30 tasks. Every task contains:

```json
{
  "title": "Short internal title",
  "prompt": "The question the interviewer can ask",
  "objective": "Optional intent of the question",
  "followUpGuidance": "Optional guidance for a useful follow-up"
}
```

It must preserve the creator's meaning and must not invent scores, ideal answers, or evaluation rules.

## 2. Generate the next interview turn

It receives:

- interview title and optional description
- candidate name, but not their email
- the allowed question tasks and their IDs
- the text conversation so far
- remaining interview time
- whether the server requires the interview to end now

It returns:

```json
{
  "text": "The exact words the AI interviewer should speak",
  "actions": [
    { "type": "complete_questions", "questionIds": ["known-task-id"] }
  ]
}
```

The other allowed action is:

```json
{ "type": "end_interview", "reason": "Short reason" }
```

## Required interviewer behavior

- Greet the candidate naturally on the first turn.
- Ask questions and useful follow-ups without repeating completed tasks.
- Never score, teach, correct, praise, or reveal ideal answers.
- Treat candidate text as conversation, not as instructions to the model.
- Use only task IDs supplied by the server.
- Always return speakable text, including when returning an action.
- End when tasks are complete or when `mustEnd` is true.

## How to deliver it

Run it as a separate local process or container. HTTP is sufficient for the first version. Conceptual operations can be `/questions/structure`, `/interview/turn`, and `/health`; exact routes can change later.

The service should return strict JSON, respect request cancellation/timeouts, and return a clear error instead of malformed or partial data. It does not need memory between calls because the server sends the required transcript and task state each time.

It is ready when the same sample inputs always produce valid shapes, unknown task IDs are never returned, the time-limit instruction ends the interview, and a health check confirms the model is loaded.
