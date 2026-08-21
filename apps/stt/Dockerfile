# syntax=docker/dockerfile:1.7

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    STT_MODEL_DIR=/models \
    WHISPER_MODEL=small \
    WHISPER_DEVICE=cpu \
    WHISPER_COMPUTE_TYPE=int8

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir --requirement requirements.txt \
    && mkdir --parents /models/small \
    && python -c "from faster_whisper.utils import download_model; download_model('small', output_dir='/models/small')" \
    && groupadd --system stt \
    && useradd --system --gid stt --home-dir /nonexistent --shell /usr/sbin/nologin stt \
    && chown --recursive stt:stt /models

COPY --chown=stt:stt stt_service.py ./

USER stt
EXPOSE 8002

HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8002/health', timeout=2).read()"]

CMD ["uvicorn", "stt_service:app", "--host", "0.0.0.0", "--port", "8002", "--workers", "1"]
