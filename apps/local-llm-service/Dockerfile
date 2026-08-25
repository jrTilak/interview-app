# syntax=docker/dockerfile:1.7

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OLLAMA_URL=http://ollama:11434 \
    OLLAMA_MODEL=qwen3:4b

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir --requirement requirements.txt \
    && groupadd --system llm \
    && useradd --system --gid llm --home-dir /nonexistent --shell /usr/sbin/nologin llm

COPY --chown=llm:llm main.py models.py prompts.py ./

USER llm
EXPOSE 8003

HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8003/health', timeout=3).read()"]

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8003", "--workers", "1"]
