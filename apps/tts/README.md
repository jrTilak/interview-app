# Local TTS Service

Converts interviewer text (from the LLM) into spoken audio. This service
does not generate any interview content — it only speaks the exact text
it is given.

Built with [Piper](https://github.com/rhasspy/piper) (offline neural TTS)
wrapped in FastAPI.

## Setup

1. **Install Python dependencies**
   ```
   pip install -r requirements.txt
   ```

2. **Download the voice model** (not included in this repo — see .gitignore)
   ```
   python -m piper.download_voices en_US-lessac-medium
   ```
   This downloads two files, `en_US-lessac-medium.onnx` and
   `en_US-lessac-medium.onnx.json`, into your current folder. Place both
   directly inside this `app/tts/` folder.

3. **Run the service**
   ```
   uvicorn tts_service:app --host 0.0.0.0 --port 8001
   ```
   On startup you should see a log confirming the voice model loaded.
   If you don't, the `.onnx` files are probably missing or misnamed —
   re-check step 2.

## Endpoints

### `GET /health`
Returns which voices are currently loaded. Use this first to confirm the
service is actually ready before calling `/synthesize`.

```json
{
  "status": "ok",
  "voices_loaded": ["professional-default"],
  "voices_configured": ["professional-default"]
}
```

### `POST /synthesize`
Converts text to speech and returns a WAV audio file.

**Request body:**
```json
{
  "text": "Hello Maya. Let us begin with your recent project.",
  "voice": "professional-default"
}
```

**Response:** raw audio bytes, `Content-Type: audio/wav`, mono, 16-bit,
resampled to 24kHz to match the existing Gemini audio path — no
conversion needed on the NestJS side.

**Error responses (400):**
- Empty `text`
- Unknown `voice` name (must match a key in `VOICE_MODELS` inside
  `tts_service.py`)

## Testing locally

Use Postman or curl against `http://127.0.0.1:8001/synthesize` — see the
service spec doc for expected behavior (reject empty text, consistent
volume/speed, no audio stored after the request finishes, etc).

## Adding more voices

Edit the `VOICE_MODELS` dictionary at the top of `tts_service.py`:
```python
VOICE_MODELS = {
    "professional-default": "en_US-lessac-medium.onnx",
    "warm-female": "en_US-amy-medium.onnx",
}
```
Then download the corresponding model with
`python -m piper.download_voices <voice-name>` and place the files in
this folder. Restart the service to pick up the new voice.

## Notes

- The model loads once at server startup, not per-request — this is
  intentional for performance; do not change this pattern.
- No audio is written to disk during synthesis — everything happens in
  memory and is discarded after the response is sent.
- This service is stateless and does not depend on NestJS or Flutter —
  it can be tested fully standalone via Postman/curl before any
  integration work.
