# Local speech-to-text service guide

## Purpose

The local STT service converts one completed candidate answer from audio into plain text. It must not answer the candidate or make interview decisions.

## What it receives

Each request contains:

- the complete audio bytes for one candidate turn
- the audio MIME type, such as `audio/wav` or `audio/l16`
- sample rate and channel count when the bytes are raw PCM
- a cancellation or timeout signal from the server

The current browser produces mono 16 kHz signed 16-bit little-endian PCM. The future service may accept that directly, or the NestJS adapter can wrap/convert it before sending. Supporting WAV is the simplest minimum requirement.

## What it returns

Return only the spoken words as one text string:

```json
{ "text": "I used a queue to process the background jobs." }
```

Return an empty string when there is no intelligible speech. Do not add speaker labels, explanations, corrections, summaries, or punctuation commentary.

## Required behavior

- Transcribe the candidate faithfully, including imperfect answers.
- Work with normal laptop microphone noise and short pauses.
- Reject unsupported or corrupt audio with a clear error.
- Place a reasonable limit on audio duration and byte size.
- Do not store raw audio after the request finishes.
- Finish within the server's configured timeout.

Silence detection and turn timing are not this service's job. The client/server decides when the candidate has stopped speaking and sends one complete turn.

## How to deliver it

Run it as a separate local process or container. A simple HTTP upload operation such as `/transcribe` plus `/health` is enough. Binary audio upload is preferred, although base64 inside JSON is acceptable for an early version; the NestJS adapter can translate either format later.

It is ready when clear speech is transcribed correctly, silence returns empty text, corrupt audio returns a controlled error, two simultaneous demo requests do not crash it, and its health check confirms the model is loaded.
