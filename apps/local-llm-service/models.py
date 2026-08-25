"""Validated HTTP and Ollama response contracts for the local LLM service."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

ShortText = Annotated[str, StringConstraints(min_length=1, max_length=160)]
PromptText = Annotated[str, StringConstraints(min_length=1, max_length=4_000)]
ContextText = Annotated[str, StringConstraints(min_length=1, max_length=2_000)]
LiveTurnText = Annotated[str, StringConstraints(min_length=1, max_length=600)]
TaskId = Annotated[str, StringConstraints(min_length=1, max_length=128)]


class StrictModel(BaseModel):
    """Reject unknown fields and normalize surrounding string whitespace."""

    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)


class StructureRequest(StrictModel):
    title: Annotated[str, StringConstraints(min_length=3, max_length=160)]
    description: ContextText | None = None
    notes: Annotated[str, StringConstraints(min_length=3, max_length=20_000)]


class StructuredInterviewTask(StrictModel):
    """A creator-facing task without attempt-only state."""

    title: ShortText
    prompt: PromptText
    objective: ContextText | None
    followUpGuidance: ContextText | None


class StructureResponse(StrictModel):
    tasks: Annotated[list[StructuredInterviewTask], Field(min_length=1, max_length=30)]


class InterviewTask(StructuredInterviewTask):
    """One server-owned task supplied during a live interview."""

    id: TaskId
    position: Annotated[int, Field(ge=1, le=30)] | None = None
    completed: bool = False
    turnCount: Annotated[int, Field(ge=0, le=100)]


class CompleteQuestionsAction(StrictModel):
    type: Literal["complete_questions"]
    questionIds: Annotated[list[TaskId], Field(min_length=1, max_length=30)]


class EndInterviewAction(StrictModel):
    type: Literal["end_interview"]
    reason: Annotated[str, StringConstraints(min_length=1, max_length=300)]


InterviewAction = Annotated[
    CompleteQuestionsAction | EndInterviewAction,
    Field(discriminator="type"),
]


class InterviewTurnRequest(StrictModel):
    title: Annotated[str, StringConstraints(min_length=3, max_length=160)]
    description: ContextText | None = None
    candidateName: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    candidateVariationKey: Annotated[
        str, StringConstraints(min_length=8, max_length=128)
    ]
    tasks: Annotated[list[InterviewTask], Field(max_length=30)]
    transcript: Annotated[str, StringConstraints(max_length=20_000)]
    remainingTime: Annotated[int, Field(ge=0, le=7_200)]
    mustEnd: bool = False


class InterviewTurnResponse(StrictModel):
    text: PromptText
    actions: Annotated[list[InterviewAction], Field(max_length=30)]


class InterviewMoveResponse(StrictModel):
    """Small provider-only contract without server-owned task identifiers."""

    text: LiveTurnText
    completeCurrentTopic: bool
