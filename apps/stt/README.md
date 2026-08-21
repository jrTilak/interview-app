# Local Whisper STT Service

Standalone offline speech-to-text service for one completed candidate answer.

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Start it with:

```bash
uvicorn stt_service:app --host 0.0.0.0 --port 8002
```

The first startup downloads the configured Whisper model. The default is
`small`; set `WHISPER_MODEL=base` for lower memory use or `WHISPER_MODEL=medium`
for higher accuracy.

## API

`GET /status` reports whether the model loaded.

`POST /transcribe` accepts a multipart upload named `audio`. WAV uploads must
be mono or stereo 16-bit PCM. Raw `audio/l16` uploads must also include
`sample_rate_hz` and `channels` form fields. The response is always:

```json
{"text":"spoken words"}
```

Audio is decoded and discarded in memory; it is never written to disk.

## Demo
```
curl -X POST http://127.0.0.1:8002/transcribe `
  -F "audio=@C:\path\to\speech.wav;type=audio/wav"
```
