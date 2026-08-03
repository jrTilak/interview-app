# Local text-to-speech service guide

## Purpose

The local TTS service converts the exact interviewer sentence into audio the browser can play. It does not generate interview content; it only speaks text produced by the LLM.

## What it receives

Each request contains:

- the exact text to speak
- an optional voice name or voice setting
- a cancellation or timeout signal from the server

Example conceptual request:

```json
{
  "text": "Hello Maya. Let us begin with your recent project.",
  "voice": "professional-default"
}
```

## What it returns

Return one complete audio result with:

- audio bytes
- the correct MIME type
- sample rate and channel count when useful

For the first version, mono PCM WAV is recommended because browsers can decode it reliably. Mono 24 kHz, 16-bit WAV matches the current Gemini path, but another clear format is acceptable if the NestJS adapter converts it.

The current application does not need audio streaming. Generate the full utterance, then return it once so the browser plays one smooth audio source.

## Required behavior

- Speak exactly the supplied text without adding or removing words.
- Use a calm, natural, professional interviewer voice.
- Keep volume and speaking speed consistent between turns.
- Return valid, non-empty audio with truthful format metadata.
- Reject empty text or an unknown voice with a clear error.
- Respect cancellation, timeouts, and a maximum text length.
- Do not store generated interview audio after the request finishes.

## How to deliver it

Run it as a separate local process or container. A simple HTTP operation such as `/synthesize` and a `/health` check are sufficient. Returning binary audio with metadata headers is preferred; returning base64 and metadata in JSON is also acceptable initially.

It is ready when the output plays smoothly in a normal browser/audio player, its duration is reasonable for the text, repeated turns have consistent volume, invalid input fails cleanly, and the health check confirms the voice model is loaded.
