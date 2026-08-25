# Interview Desk

Interview Desk is a voice interview platform for recruiters and candidates.

## Frontend

The React client provides separate recruiter and interview workspaces.

## Backend

The NestJS server manages authentication, interviews, realtime sessions, PostgreSQL, and local AI services.

## Run

```bash
docker compose up --build --wait
```

Open `http://localhost:18080`.

## NVIDIA GPU

The GPU overlay automatically uses the NVIDIA GPUs available to Docker. The
default `qwen3:4b` model supports GPUs with less VRAM; set `OLLAMA_MODEL` to a
larger model when the target GPU has enough memory.

```bash
docker run --rm --gpus all ubuntu nvidia-smi
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build --wait
```

Linux Docker Engine requires the NVIDIA Container Toolkit. On Windows, use an
up-to-date NVIDIA Windows driver and Docker Desktop's WSL 2 Linux-container
backend; Docker Desktop provides the container-side GPU integration.
