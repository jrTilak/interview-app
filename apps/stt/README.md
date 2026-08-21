# Local STT service

This optional service transcribes one completed candidate answer with
faster-whisper. It returns only recognized speech and does not retain uploaded
audio or make interview decisions.

The default `small` English-capable model runs on CPU with int8 computation.
The model is loaded once during startup, and readiness remains degraded if it
cannot be loaded.

## Run natively

Python 3.12 or newer is required by the pinned NumPy and SciPy versions.

```bash
cd apps/stt
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install --requirement requirements.txt
uvicorn stt_service:app --host 0.0.0.0 --port 8002 --workers 1
```

On the first native startup, faster-whisper downloads the configured model to
its standard Hugging Face cache. Set `STT_MODEL_DIR` to use a specific writable
cache root. If that directory contains a converted model at
`$STT_MODEL_DIR/$WHISPER_MODEL`, the service loads it directly.

Configuration variables are:

- `WHISPER_MODEL` (`small` by default), which may be a faster-whisper model
  alias, Hugging Face model ID, or local converted-model directory
- `WHISPER_DEVICE` (`cpu` by default)
- `WHISPER_COMPUTE_TYPE` (`int8` by default)
- `STT_MODEL_DIR` (optional natively; `/models` in the image)
- `STT_MAX_AUDIO_BYTES` (10 MiB by default)
- `STT_MAX_AUDIO_SECONDS` (180 seconds by default)
- `STT_TIMEOUT_SECONDS` (45 seconds by default)

## Run in a container

Build from the service directory as the Docker build context:

```bash
docker build --tag interview-local-stt apps/stt
docker run --rm --publish 8002:8002 interview-local-stt
```

The image downloads the default `small` model into `/models/small` while it is
built, runs as an unprivileged user, and starts exactly one Uvicorn worker. The
model file is about 461 MiB, so the first build needs network access and the
resulting image is substantially larger than the source-only service.

`/models` remains writable for a custom `WHISPER_MODEL`; a model not baked into
the image is downloaded there at first startup. Do not mount an empty volume at
`/models` when using the default model because it hides the baked model. A
persistent volume is useful only when intentionally downloading a custom model
at runtime.

## HTTP contract

`GET /health` returns HTTP 200 only after the model has loaded. `/status` is a
backward-compatible alias. A load failure returns HTTP 503 with a readiness
body:

```json
{
  "status": "ok",
  "model": "small",
  "device": "cpu",
  "compute_type": "int8"
}
```

`POST /transcribe` accepts a multipart upload named `audio`. WAV input must be
mono or stereo, uncompressed 16-bit PCM, and use a sample rate from 8 kHz to
192 kHz. Raw `audio/l16` uses this application's signed 16-bit little-endian
PCM convention and must include `sample_rate_hz` and `channels` form fields.

```bash
curl --fail-with-body http://127.0.0.1:8002/transcribe \
  --form 'audio=@/path/to/speech.wav;type=audio/wav'
```

A successful response contains only the transcript:

```json
{"text":"spoken words"}
```

Invalid or unsupported audio returns a controlled 4xx response. Internal model
errors are logged but are not exposed to the caller.

Only one transcription runs per service process. Concurrent requests are
rejected with HTTP 503 instead of queued. If a caller times out or disconnects,
the service remains busy until the underlying native inference actually ends;
this prevents overlapping work from accumulating. Keep `--workers 1`, because
each additional worker loads another model and has an independent gate.

FastAPI may spool larger multipart uploads to an automatically deleted
temporary file before the endpoint runs. Put a request-body limit at the proxy
or ingress when exposing this service outside its private application network.

## Compatibility and licensing

- The default image uses Python 3.12 and has CTranslate2 wheels for common
  Linux amd64 and arm64 hosts.
- The image is CPU/int8 by default. CUDA requires a compatible GPU image,
  runtime, driver, and compute type; changing only `WHISPER_DEVICE` is not a
  complete GPU setup.
- faster-whisper and the `Systran/faster-whisper-small` model are MIT-licensed.
  Their dependencies retain their own licenses.

## Tests

The focused contract suite uses `unittest` and test doubles, so it does not
download or run a real Whisper model:

```bash
python -m unittest discover -s apps/stt -p 'test_*.py' -v
```
