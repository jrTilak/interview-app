"""Local Ollama-backed interview LLM HTTP service.

Run natively from this directory with::

    uvicorn main:app --host 0.0.0.0 --port 8003 --workers 1
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager, contextmanager
from typing import TypeVar

import requests
from fastapi import FastAPI, HTTPException, Response
from models import (
    CompleteQuestionsAction,
    EndInterviewAction,
    InterviewTask,
    InterviewTurnRequest,
    InterviewTurnResponse,
    StructureRequest,
    StructureResponse,
)
from prompts import interview_prompt, structure_prompt
from pydantic import BaseModel, ValidationError

LOGGER = logging.getLogger(__name__)


def _positive_float(name: str, default: float) -> float:
    raw_value = os.getenv(name, str(default)).strip()
    try:
        value = float(raw_value)
    except ValueError as error:
        raise RuntimeError(f"{name} must be a number") from error
    if value <= 0:
        raise RuntimeError(f"{name} must be greater than zero")
    return value


def _positive_int(name: str, default: int) -> int:
    raw_value = os.getenv(name, str(default)).strip()
    try:
        value = int(raw_value)
    except ValueError as error:
        raise RuntimeError(f"{name} must be an integer") from error
    if value <= 0:
        raise RuntimeError(f"{name} must be greater than zero")
    return value


OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").strip().rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:8b").strip() or "qwen3:8b"
OLLAMA_TIMEOUT_SECONDS = _positive_float("OLLAMA_TIMEOUT_SECONDS", 110)
OLLAMA_HEALTH_TIMEOUT_SECONDS = _positive_float("OLLAMA_HEALTH_TIMEOUT_SECONDS", 3)
OLLAMA_NUM_CTX = _positive_int("OLLAMA_NUM_CTX", 8_192)
OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "10m").strip() or "10m"


def _api_url(operation: str) -> str:
    """Build an Ollama API URL while accepting a base ending in `/api`."""

    base = OLLAMA_URL
    if base.endswith("/api/generate"):
        base = base.removesuffix("/api/generate")
    if base.endswith("/api"):
        return f"{base}/{operation}"
    return f"{base}/api/{operation}"


OLLAMA_GENERATE_URL = _api_url("generate")
OLLAMA_TAGS_URL = _api_url("tags")

STRUCTURE_MAX_TOKENS = 4_000
TURN_MAX_TOKENS = 800


def _preload_model() -> None:
    """Load the configured model before traffic reaches the interview API."""

    try:
        response = requests.post(
            OLLAMA_GENERATE_URL,
            json={
                "model": OLLAMA_MODEL,
                "stream": False,
                "keep_alive": OLLAMA_KEEP_ALIVE,
            },
            timeout=OLLAMA_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        LOGGER.info("Preloaded Ollama model %r", OLLAMA_MODEL)
    except requests.RequestException:
        # Readiness and ordinary requests still report the provider failure.
        LOGGER.warning("Could not preload Ollama model %r", OLLAMA_MODEL)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    await asyncio.to_thread(_preload_model)
    yield


app = FastAPI(title="Local LLM Interview Service", lifespan=lifespan)

# Ollama can queue requests, but parallel generations make an 8B local model
# unpredictably slow. The Docker image deliberately uses one Uvicorn worker so
# this process-wide, non-blocking gate admits exactly one generation at a time.
generation_gate = threading.Lock()

ResponseModel = TypeVar("ResponseModel", bound=BaseModel)


def _installed_model_names(payload: object) -> set[str]:
    if not isinstance(payload, dict) or not isinstance(payload.get("models"), list):
        raise TypeError("Ollama tags response has an invalid shape")

    names: set[str] = set()
    for candidate in payload["models"]:
        if not isinstance(candidate, dict):
            continue
        for key in ("name", "model"):
            value = candidate.get(key)
            if isinstance(value, str) and value.strip():
                names.add(value.strip())
    return names


def _model_name_matches(installed_name: str) -> bool:
    if installed_name == OLLAMA_MODEL:
        return True
    return ":" not in OLLAMA_MODEL and installed_name == f"{OLLAMA_MODEL}:latest"


def ollama_ready() -> bool:
    """Return whether Ollama is reachable and the configured model is installed."""

    try:
        response = requests.get(
            OLLAMA_TAGS_URL,
            timeout=OLLAMA_HEALTH_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        names = _installed_model_names(response.json())
        return any(_model_name_matches(name) for name in names)
    except (requests.RequestException, TypeError, ValueError):
        return False


@app.get("/health")
@app.get("/status")
def health(response: Response) -> dict[str, object]:
    """Report readiness only when Ollama has the configured model available."""

    ready = ollama_ready()
    response.status_code = 200 if ready else 503
    return {
        "status": "ok" if ready else "degraded",
        "model": OLLAMA_MODEL,
    }


@contextmanager
def _generation_admission() -> Iterator[None]:
    if not generation_gate.acquire(blocking=False):
        raise HTTPException(
            status_code=503,
            detail="Local language model is busy.",
            headers={"Retry-After": "1"},
        )
    try:
        yield
    finally:
        generation_gate.release()


def _generate_structured(
    *,
    prompt: str,
    response_type: type[ResponseModel],
    max_tokens: int,
) -> ResponseModel:
    """Run one bounded Ollama generation and validate its structured output."""

    with _generation_admission():
        try:
            response = requests.post(
                OLLAMA_GENERATE_URL,
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "think": False,
                    "format": response_type.model_json_schema(),
                    "keep_alive": OLLAMA_KEEP_ALIVE,
                    "options": {
                        "temperature": 0,
                        "num_ctx": OLLAMA_NUM_CTX,
                        "num_predict": max_tokens,
                    },
                },
                timeout=OLLAMA_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
        except requests.Timeout as error:
            LOGGER.warning("Ollama generation timed out")
            raise HTTPException(
                status_code=504,
                detail="Local language model timed out.",
            ) from error
        except requests.RequestException as error:
            LOGGER.warning("Ollama generation request failed")
            raise HTTPException(
                status_code=502,
                detail="Local language model is unavailable.",
            ) from error

        try:
            payload = response.json()
            raw_output = payload["response"]
            if not isinstance(raw_output, str):
                raise TypeError("Ollama response text is not a string")
            return response_type.model_validate_json(raw_output)
        except (KeyError, TypeError, ValueError, ValidationError) as error:
            LOGGER.warning("Ollama returned an invalid structured response")
            raise HTTPException(
                status_code=502,
                detail="Local language model returned an invalid response.",
            ) from error


@app.post("/questions/structure", response_model=StructureResponse)
def structure_questions(request: StructureRequest) -> StructureResponse:
    prompt = structure_prompt(
        title=request.title,
        description=request.description,
        notes=request.notes,
        output_schema=StructureResponse.model_json_schema(),
    )
    return _generate_structured(
        prompt=prompt,
        response_type=StructureResponse,
        max_tokens=STRUCTURE_MAX_TOKENS,
    )


def _end_turn(*, text: str, reason: str) -> InterviewTurnResponse:
    return InterviewTurnResponse(
        text=text,
        actions=[EndInterviewAction(type="end_interview", reason=reason)],
    )


def _active_task(tasks: list[InterviewTask]) -> InterviewTask | None:
    return next((task for task in tasks if not task.completed), None)


def _clean_turn(
    generated: InterviewTurnResponse,
    active_task: InterviewTask,
    request: InterviewTurnRequest,
) -> InterviewTurnResponse:
    """Keep server-known actions and guarantee completion-on-ask progress."""

    valid_completion_ids: list[str] = []
    early_end = False
    for action in generated.actions:
        if isinstance(action, CompleteQuestionsAction):
            if (
                active_task.id in action.questionIds
                and active_task.id not in valid_completion_ids
            ):
                valid_completion_ids.append(active_task.id)
        elif isinstance(action, EndInterviewAction):
            early_end = True

    # The NestJS orchestrator marks a task complete in the same assistant turn
    # in which it is asked. If a small local model omits that action, use the
    # server-owned prompt as well as adding the action so the task cannot be
    # skipped by an unrelated generated sentence.
    completion_missing = active_task.id not in valid_completion_ids
    if completion_missing:
        valid_completion_ids.append(active_task.id)

    text = generated.text
    if early_end or completion_missing:
        text = (
            f"Hello {request.candidateName}. Welcome to the "
            f"{request.title} interview. {active_task.prompt}"
            if not request.transcript.strip()
            else active_task.prompt
        )

    return InterviewTurnResponse(
        text=text,
        actions=[
            CompleteQuestionsAction(
                type="complete_questions",
                questionIds=valid_completion_ids,
            )
        ],
    )


@app.post("/interview/turn", response_model=InterviewTurnResponse)
def interview_turn(request: InterviewTurnRequest) -> InterviewTurnResponse:
    if request.mustEnd:
        return _end_turn(
            text="Thank you for your time. The interview has reached its time limit.",
            reason="The server requires the interview to end.",
        )

    active_task = _active_task(request.tasks)
    if active_task is None:
        return _end_turn(
            text="Thank you for your time. That concludes the interview.",
            reason="All interview tasks have been completed.",
        )

    prompt = interview_prompt(
        title=request.title,
        description=request.description,
        candidate_name=request.candidateName,
        tasks=[active_task.model_dump(mode="json")],
        transcript=request.transcript,
        remaining_time=request.remainingTime,
        output_schema=InterviewTurnResponse.model_json_schema(),
    )
    generated = _generate_structured(
        prompt=prompt,
        response_type=InterviewTurnResponse,
        max_tokens=TURN_MAX_TOKENS,
    )
    return _clean_turn(generated, active_task, request)
