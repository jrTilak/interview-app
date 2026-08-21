# syntax=docker/dockerfile:1.7

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TTS_MODEL_DIR=/models

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir --requirement requirements.txt \
    && mkdir --parents /models \
    && python -m piper.download_voices \
        --download-dir /models \
        en_US-lessac-medium \
    && groupadd --system tts \
    && useradd --system --gid tts --home-dir /nonexistent --shell /usr/sbin/nologin tts

COPY --chown=tts:tts tts_service.py ./

USER tts
EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=2).read()"]

CMD ["uvicorn", "tts_service:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
