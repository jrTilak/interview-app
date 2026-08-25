"""Local Ollama-backed interview LLM HTTP service.

Run natively from this directory with::

    uvicorn main:app --host 0.0.0.0 --port 8003 --workers 1
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import threading
import time
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager, contextmanager, suppress
from difflib import SequenceMatcher
from typing import Any, TypeVar

import requests
from fastapi import FastAPI, HTTPException, Response
from models import (
    CompleteQuestionsAction,
    EndInterviewAction,
    InterviewMoveResponse,
    InterviewTask,
    InterviewTurnRequest,
    InterviewTurnResponse,
    StructuredInterviewTask,
    StructureRequest,
    StructureResponse,
)
from prompts import (
    FALLBACK_QUESTION_TEMPLATES,
    interview_fallback_question,
    interview_move_prompt,
    recent_transcript_turns,
    structure_prompt,
)
from pydantic import BaseModel, ValidationError

LOGGER = logging.getLogger("uvicorn.error")


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


def _keep_alive_value() -> str | int:
    """Parse numeric Ollama keep-alive values while preserving durations."""

    raw_value = os.getenv("OLLAMA_KEEP_ALIVE", "-1").strip() or "-1"
    try:
        return int(raw_value)
    except ValueError:
        return raw_value


OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").strip().rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:4b").strip() or "qwen3:4b"
OLLAMA_TIMEOUT_SECONDS = _positive_float("OLLAMA_TIMEOUT_SECONDS", 110)
OLLAMA_HEALTH_TIMEOUT_SECONDS = _positive_float("OLLAMA_HEALTH_TIMEOUT_SECONDS", 3)
OLLAMA_NUM_CTX = _positive_int("OLLAMA_NUM_CTX", 8_192)
OLLAMA_KEEP_ALIVE = _keep_alive_value()


def _api_url(operation: str) -> str:
    """Build an Ollama API URL while accepting a base ending in `/api`."""

    base = OLLAMA_URL
    if base.endswith("/api/generate"):
        base = base.removesuffix("/api/generate")
    if base.endswith("/api"):
        return f"{base}/{operation}"
    return f"{base}/api/{operation}"


OLLAMA_GENERATE_URL = _api_url("generate")
OLLAMA_PS_URL = _api_url("ps")

STRUCTURE_MAX_TOKENS = 4_000
TURN_MAX_TOKENS = 128
PRELOAD_MAX_TOKENS = 1
STRUCTURE_TEMPERATURE = 0.0
TURN_TEMPERATURE = 0.4
READINESS_RETRY_SECONDS = 5
GENERIC_TOPIC_WORDS = frozenset(
    {
        "about",
        "approach",
        "candidate",
        "could",
        "discuss",
        "explore",
        "follow",
        "from",
        "guidance",
        "practical",
        "probe",
        "question",
        "reasoning",
        "relevant",
        "should",
        "thinking",
        "topic",
        "understand",
        "useful",
        "what",
        "when",
        "where",
        "which",
        "with",
        "would",
        "ways",
        "why",
        "your",
    }
)
QUESTION_LIKE_PREFIX = re.compile(
    r"^(?:what|why|how|when|where|who|which|can|could|would|should|do|does|did|"
    r"is|are|was|were|have|has|had|tell|describe|explain|discuss|share|walk|please)\b",
    re.IGNORECASE,
)
INTERROGATIVE_LEAD_IN = re.compile(
    r"^(?:what|why|how|when|where|who|which)\s+"
    r"(?:(?:is|are|was|were|do|does|did|can|could|would|should|have|has)\s+)?"
    r"(?:you\s+)?",
    re.IGNORECASE,
)
SPOKEN_LEAD_IN = re.compile(
    r"^(?:(?:can|could|would|should|will)\s+you\s+|"
    r"(?:please\s+)?(?:tell me about|walk me through|describe|explain|discuss|share)\s+)",
    re.IGNORECASE,
)
AUXILIARY_LEAD_IN = re.compile(
    r"^(?:is|are|was|were|do|does|did|can|could|would|should|will|have|has|had)\s+"
    r"(?:you\s+)?",
    re.IGNORECASE,
)
EVALUATIVE_OBJECTIVE_PREFIX = re.compile(
    r"^(?:assess|evaluate|grade|score|test)\b", re.IGNORECASE
)
CONTINUATION_INVITATION = re.compile(
    r"\b(?:continue|go on|tell me more|say more|share more|expand|elaborate|"
    r"walk me through|take your time|keep going)\b",
    re.IGNORECASE,
)
QUESTION_CLAUSE_LEAD = re.compile(
    r"\b(?:what|why|how|when|where|who|which|can|could|would|should|do|does|did|"
    r"is|are|was|were|have|has|had)\b",
    re.IGNORECASE,
)

# Ollama can queue requests, but parallel generations make a local model
# unpredictably slow. The Docker image deliberately uses one Uvicorn worker so
# this process-wide, non-blocking gate admits exactly one generation at a time.
generation_gate = threading.Lock()
model_ready = threading.Event()

# Ollama compiles JSON Schema length constraints into grammar repetitions. Large
# application limits (for example, a 4,000-character prompt) can exceed the
# grammar compiler's safety limit even though the schema itself is valid. The
# generated payload is still validated against the complete Pydantic model
# below, so these constraints do not need to be duplicated in Ollama's grammar.
OLLAMA_GRAMMAR_SIZE_KEYWORDS = frozenset(
    {"maxItems", "maxLength", "minItems", "minLength"}
)


def _ollama_format_schema(response_type: type[BaseModel]) -> dict[str, Any]:
    """Return a JSON Schema that Ollama can compile into a bounded grammar."""

    def without_size_constraints(value: Any) -> Any:
        if isinstance(value, dict):
            return {
                key: without_size_constraints(candidate)
                for key, candidate in value.items()
                if key not in OLLAMA_GRAMMAR_SIZE_KEYWORDS
            }
        if isinstance(value, list):
            return [without_size_constraints(candidate) for candidate in value]
        return value

    schema = without_size_constraints(response_type.model_json_schema())
    if not isinstance(schema, dict):  # Defensive: Pydantic always returns a mapping.
        raise TypeError("Response model JSON Schema must be an object")
    return schema


def _provider_failure_summary(error: requests.RequestException) -> str:
    """Return bounded Ollama diagnostics for service logs, never HTTP clients."""

    response = error.response
    if response is None:
        return type(error).__name__

    summary = f"HTTP {response.status_code}"
    try:
        payload = response.json()
    except (requests.JSONDecodeError, ValueError):
        return summary

    provider_error = payload.get("error") if isinstance(payload, dict) else None
    if not isinstance(provider_error, str) or not provider_error.strip():
        return summary

    # Keep logs single-line and bounded. Ollama's `error` field contains the
    # actionable provider failure without echoing the request prompt.
    printable = "".join(
        character if character.isprintable() else " " for character in provider_error
    )
    normalized = " ".join(printable.split())
    return f"{summary}: {normalized[:500]}"


def _provider_milliseconds(value: object) -> str:
    """Format Ollama's nanosecond duration fields for operational logs."""

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return f"{value / 1_000_000:.1f}"
    return "unknown"


def _looks_like_spoken_question(value: str) -> bool:
    normalized = " ".join(value.split())
    return "?" in normalized or bool(QUESTION_LIKE_PREFIX.match(normalized))


def _declarative_topic_label(value: str) -> str:
    """Remove common spoken-question lead-ins from a private topic label."""

    label = " ".join(value.split()).rstrip(" ?!.")
    for _ in range(2):
        updated = INTERROGATIVE_LEAD_IN.sub("", label, count=1)
        updated = SPOKEN_LEAD_IN.sub("", updated, count=1)
        updated = AUXILIARY_LEAD_IN.sub("", updated, count=1)
        if updated == label:
            break
        label = updated.strip()
    if _looks_like_spoken_question(label):
        label = f"Topic: {label.rstrip(' ?!.')}"
    return label or "Interview topic"


def _preload_model() -> bool:
    """Load the model and warm the live prompt prefix and output grammar."""

    preload_prompt = interview_move_prompt(
        title="Technical interview",
        description="A practical professional conversation",
        candidate_name="Candidate",
        candidate_variation_key="preload-contract",
        current_topic={
            "title": "Relevant experience",
            "prompt": "Practical decisions, reasoning, and trade-offs",
            "objective": "Explore the candidate's practical reasoning",
            "followUpGuidance": "Probe one concrete decision when useful",
        },
        next_topic={
            "title": "Working approach",
            "prompt": "Collaboration, adaptation, and reflection",
            "objective": "Explore how the candidate approaches their work",
            "followUpGuidance": None,
        },
        recent_turns=[],
        remaining_time=900,
        topic_turn_count=0,
        opening=True,
    )

    try:
        with generation_gate:
            response = requests.post(
                OLLAMA_GENERATE_URL,
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": preload_prompt,
                    "stream": False,
                    "think": False,
                    "format": _ollama_format_schema(InterviewMoveResponse),
                    "keep_alive": OLLAMA_KEEP_ALIVE,
                    "options": {
                        "temperature": TURN_TEMPERATURE,
                        "num_ctx": OLLAMA_NUM_CTX,
                        "num_predict": PRELOAD_MAX_TOKENS,
                    },
                },
                timeout=OLLAMA_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
        model_ready.set()
        LOGGER.info("Preloaded Ollama model %r and warmed live prompt", OLLAMA_MODEL)
        return True
    except requests.RequestException as error:
        model_ready.clear()
        LOGGER.warning(
            "Could not preload Ollama model %r (%s)",
            OLLAMA_MODEL,
            _provider_failure_summary(error),
        )
        return False


async def _maintain_model_readiness() -> None:
    """Retry a failed preload without blocking the readiness endpoint."""

    while True:
        await asyncio.sleep(READINESS_RETRY_SECONDS)
        if not model_ready.is_set():
            await asyncio.to_thread(_preload_model)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    await asyncio.to_thread(_preload_model)
    readiness_task = asyncio.create_task(_maintain_model_readiness())
    try:
        yield
    finally:
        readiness_task.cancel()
        with suppress(asyncio.CancelledError):
            await readiness_task


app = FastAPI(title="Local LLM Interview Service", lifespan=lifespan)

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
    """Return whether the configured model was loaded and remains reachable."""

    if not model_ready.is_set():
        return False

    try:
        response = requests.get(
            OLLAMA_PS_URL,
            timeout=OLLAMA_HEALTH_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        names = _installed_model_names(response.json())
        ready = any(_model_name_matches(name) for name in names)
        if not ready:
            model_ready.clear()
        return ready
    except (requests.RequestException, TypeError, ValueError):
        model_ready.clear()
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
    temperature: float,
) -> ResponseModel:
    """Run one bounded Ollama generation and validate its structured output."""

    format_schema = _ollama_format_schema(response_type)
    with _generation_admission():
        started_at = time.monotonic()
        try:
            response = requests.post(
                OLLAMA_GENERATE_URL,
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "think": False,
                    "format": format_schema,
                    "keep_alive": OLLAMA_KEEP_ALIVE,
                    "options": {
                        "temperature": temperature,
                        "num_ctx": OLLAMA_NUM_CTX,
                        "num_predict": max_tokens,
                    },
                },
                timeout=OLLAMA_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            model_ready.set()
        except requests.Timeout as error:
            model_ready.clear()
            LOGGER.warning("Ollama generation timed out")
            raise HTTPException(
                status_code=504,
                detail="Local language model timed out.",
            ) from error
        except requests.RequestException as error:
            model_ready.clear()
            LOGGER.warning(
                "Ollama generation request failed (%s)",
                _provider_failure_summary(error),
            )
            raise HTTPException(
                status_code=502,
                detail="Local language model is unavailable.",
            ) from error

        try:
            payload = response.json()
            if isinstance(payload, dict):
                LOGGER.info(
                    "Ollama %s completed in %.2fs "
                    "(prompt tokens=%s, output tokens=%s, "
                    "provider total/load/prompt/eval ms=%s/%s/%s/%s)",
                    response_type.__name__,
                    time.monotonic() - started_at,
                    payload.get("prompt_eval_count", "unknown"),
                    payload.get("eval_count", "unknown"),
                    _provider_milliseconds(payload.get("total_duration")),
                    _provider_milliseconds(payload.get("load_duration")),
                    _provider_milliseconds(payload.get("prompt_eval_duration")),
                    _provider_milliseconds(payload.get("eval_duration")),
                )
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
    )
    generated = _generate_structured(
        prompt=prompt,
        response_type=StructureResponse,
        max_tokens=STRUCTURE_MAX_TOKENS,
        temperature=STRUCTURE_TEMPERATURE,
    )
    normalized_tasks = []
    for task in generated.tasks:
        title = (
            _declarative_topic_label(task.title)
            if _looks_like_spoken_question(task.title)
            else task.title
        )
        objective = task.objective
        if objective and EVALUATIVE_OBJECTIVE_PREFIX.match(objective):
            objective = EVALUATIVE_OBJECTIVE_PREFIX.sub("Explore", objective, count=1)

        seed = " ".join(task.prompt.split())
        if _looks_like_spoken_question(seed):
            # A small model can ignore the private-boundary instruction and emit
            # a speakable question. Store a declarative scope assembled from
            # validated fields instead, so no candidate receives that wording.
            scope = objective if objective and "?" not in objective else None
            seed = f"{title}: {scope}" if scope else title

        normalized_tasks.append(
            StructuredInterviewTask(
                title=title[:160].rstrip(),
                prompt=seed[:4_000].rstrip(),
                objective=objective[:2_000].rstrip() if objective else None,
                followUpGuidance=task.followUpGuidance,
            )
        )
    return StructureResponse(tasks=normalized_tasks)


def _end_turn(*, text: str, reason: str) -> InterviewTurnResponse:
    return InterviewTurnResponse(
        text=text,
        actions=[EndInterviewAction(type="end_interview", reason=reason)],
    )


def _active_topics(
    tasks: list[InterviewTask],
) -> tuple[InterviewTask | None, InterviewTask | None]:
    incomplete = [task for task in tasks if not task.completed]
    current = incomplete[0] if incomplete else None
    following = incomplete[1] if len(incomplete) > 1 else None
    return current, following


def _provider_topic(task: InterviewTask | None) -> dict[str, object] | None:
    if task is None:
        return None
    return {
        "title": task.title,
        "prompt": task.prompt,
        "objective": task.objective,
        "followUpGuidance": task.followUpGuidance,
    }


def _topic_question(
    request: InterviewTurnRequest,
    topic: InterviewTask,
    *,
    variation_offset: int = 0,
) -> str:
    title = _declarative_topic_label(topic.title) or "this topic"
    return interview_fallback_question(
        variation_key=request.candidateVariationKey,
        topic_title=title,
        topic_turn_count=topic.turnCount,
        variation_offset=variation_offset,
    )


def _engages_topic(text: str, topic: InterviewTask) -> bool:
    """Conservatively check that a generated question references its boundary."""

    boundary = " ".join(
        value
        for value in (
            topic.title,
            topic.prompt,
            topic.objective,
            topic.followUpGuidance,
        )
        if value
    ).casefold()
    terms = {
        term
        for term in re.findall(r"[a-z0-9]+", boundary)
        if len(term) >= 3 and term not in GENERIC_TOPIC_WORDS
    }
    if not terms:
        return True
    spoken_terms = set(re.findall(r"[a-z0-9]+", text.casefold()))
    for boundary_term in terms:
        for spoken_term in spoken_terms:
            if boundary_term == spoken_term:
                return True
            shorter, longer = sorted((boundary_term, spoken_term), key=len)
            if len(shorter) >= 4 and longer.startswith(shorter):
                return True
            shared_prefix = 0
            for boundary_character, spoken_character in zip(
                boundary_term, spoken_term, strict=False
            ):
                if boundary_character != spoken_character:
                    break
                shared_prefix += 1
            if shared_prefix >= 6 and shared_prefix / len(shorter) >= 0.6:
                # Covers ordinary morphology such as structure/structuring,
                # accessibility/accessible, and navigation/navigate without
                # accepting weak three- or four-letter coincidences.
                return True
    return False


def _current_topic_fallback(
    request: InterviewTurnRequest,
    current_topic: InterviewTask,
    recent_turns: list[dict[str, str]],
    *,
    opening: bool,
) -> str:
    if opening:
        title = request.title.rstrip(".!? ") or request.title
        interview_label = (
            title if title.casefold().endswith("interview") else f"{title} interview"
        )
        prefix = f"Hello {request.candidateName}. Welcome to the {interview_label}."
    else:
        prefix = f"Let us explore {current_topic.title}."

    question = _topic_question(request, current_topic)
    for variation_offset in range(len(FALLBACK_QUESTION_TEMPLATES)):
        candidate = _topic_question(
            request,
            current_topic,
            variation_offset=variation_offset,
        )
        if not _repeats_recent_assistant_question(candidate, recent_turns):
            question = candidate
            break
    return f"{prefix} {question}"


def _completion_fallback(
    request: InterviewTurnRequest, next_topic: InterviewTask | None
) -> str:
    if next_topic is None:
        return "Thank you for sharing your perspective. That concludes the interview."
    return (
        f"Thank you. Let us move to {next_topic.title}. "
        f"{_topic_question(request, next_topic)}"
    )


def _repeats_recent_assistant_question(
    text: str, recent_turns: list[dict[str, str]]
) -> bool:
    """Detect repeated question clauses even after a conversational preface."""

    def question_clauses(value: str) -> set[str]:
        question_end = value.rfind("?")
        if question_end < 0:
            return set()

        question_text = value[: question_end + 1]
        clause_starts = {0}
        clause_starts.update(
            match.start() for match in QUESTION_CLAUSE_LEAD.finditer(question_text)
        )
        return {
            normalized
            for start in clause_starts
            if (
                normalized := " ".join(
                    re.findall(r"[a-z0-9]+", question_text[start:].casefold())
                )
            )
        }

    generated_clauses = question_clauses(text)
    if not generated_clauses:
        return False
    for turn in recent_turns:
        if turn.get("role") != "assistant":
            continue
        for generated_clause in generated_clauses:
            for previous_clause in question_clauses(turn.get("text", "")):
                if generated_clause == previous_clause:
                    return True
                if (
                    min(len(generated_clause), len(previous_clause)) >= 24
                    and SequenceMatcher(None, generated_clause, previous_clause).ratio()
                    >= 0.9
                ):
                    return True
    return False


def _clean_interview_move(
    generated: InterviewMoveResponse,
    request: InterviewTurnRequest,
    current_topic: InterviewTask,
    next_topic: InterviewTask | None,
    recent_turns: list[dict[str, str]],
    *,
    opening: bool,
) -> InterviewTurnResponse:
    """Enforce topic progression while keeping ordinary dialogue model-owned."""

    complete = generated.completeCurrentTopic
    text = " ".join(generated.text.split())
    question_count = text.count("?")

    if current_topic.turnCount == 0 and (
        complete or question_count != 1 or not _engages_topic(text, current_topic)
    ):
        # An opening may engage the current boundary but must never skip it.
        complete = False
        text = _current_topic_fallback(
            request,
            current_topic,
            recent_turns,
            opening=opening,
        )
    elif current_topic.turnCount >= 2 and not complete:
        # Never relabel a current-topic follow-up as a transition. Substitute a
        # server-owned move that actually matches the forced progression.
        complete = True
        text = _completion_fallback(request, next_topic)

    if complete:
        if next_topic is not None and (
            text.count("?") != 1 or not _engages_topic(text, next_topic)
        ):
            # Moving forward must visibly engage the next boundary with one
            # clear question, not an ambiguous statement or a question stack.
            text = _completion_fallback(request, next_topic)
        elif next_topic is None and "?" in text:
            # A final completion ends immediately, so it cannot leave a
            # question awaiting an answer.
            text = _completion_fallback(request, None)
    elif (
        text.count("?") > 1
        or (text.count("?") == 1 and not _engages_topic(text, current_topic))
        or _repeats_recent_assistant_question(text, recent_turns)
    ):
        text = _current_topic_fallback(
            request,
            current_topic,
            recent_turns,
            opening=opening,
        )
    elif "?" not in text and not CONTINUATION_INVITATION.search(text):
        # A reflection without a question is allowed occasionally, but the
        # listening state must never leave the candidate with conversational
        # dead air.
        reflection = text.rstrip(" .!?;,:")
        text = f"{reflection}. Please continue." if reflection else "Please continue."

    actions: list[CompleteQuestionsAction | EndInterviewAction] = []
    if complete:
        actions.append(
            CompleteQuestionsAction(
                type="complete_questions",
                questionIds=[current_topic.id],
            )
        )
        if next_topic is None:
            actions.append(
                EndInterviewAction(
                    type="end_interview",
                    reason="The final interview topic is complete.",
                )
            )

    return InterviewTurnResponse(text=text, actions=actions)


@app.post("/interview/turn", response_model=InterviewTurnResponse)
def interview_turn(request: InterviewTurnRequest) -> InterviewTurnResponse:
    if request.mustEnd:
        return _end_turn(
            text="Thank you for your time. The interview has reached its time limit.",
            reason="The server requires the interview to end.",
        )

    current_topic, next_topic = _active_topics(request.tasks)
    if current_topic is None:
        return _end_turn(
            text="Thank you for your time. That concludes the interview.",
            reason="All interview tasks have been completed.",
        )

    recent_turns = recent_transcript_turns(request.transcript)
    opening = len(recent_turns) == 0
    current_topic_data = _provider_topic(current_topic)
    if current_topic_data is None:  # Defensive; current_topic is known above.
        raise TypeError("Current interview topic is required")
    prompt = interview_move_prompt(
        title=request.title,
        description=request.description,
        candidate_name=request.candidateName,
        candidate_variation_key=request.candidateVariationKey,
        current_topic=current_topic_data,
        next_topic=_provider_topic(next_topic),
        recent_turns=recent_turns,
        remaining_time=request.remainingTime,
        topic_turn_count=current_topic.turnCount,
        opening=opening,
    )
    generated = _generate_structured(
        prompt=prompt,
        response_type=InterviewMoveResponse,
        max_tokens=TURN_MAX_TOKENS,
        temperature=TURN_TEMPERATURE,
    )
    return _clean_interview_move(
        generated,
        request,
        current_topic,
        next_topic,
        recent_turns,
        opening=opening,
    )
