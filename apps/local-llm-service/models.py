from pydantic import BaseModel
from typing import Optional, List


# -----------------------------
# Question Structuring
# -----------------------------

class StructureRequest(BaseModel):
    title: str
    description: Optional[str] = None
    notes: str


class InterviewTask(BaseModel):
    id: Optional[str] = None
    title: str
    prompt: str
    objective: Optional[str] = None
    followUpGuidance: Optional[str] = None
    completed: bool = False


class StructureResponse(BaseModel):
    tasks: List[InterviewTask]


# -----------------------------
# Interview Turn
# -----------------------------

class CompleteQuestionsAction(BaseModel):
    type: str = "complete_questions"
    questionIds: List[str]


class EndInterviewAction(BaseModel):
    type: str = "end_interview"
    reason: str


class InterviewTurnRequest(BaseModel):
    title: str
    description: Optional[str] = None
    candidateName: str
    tasks: List[InterviewTask]
    transcript: str
    remainingTime: int
    mustEnd: bool = False


class InterviewTurnResponse(BaseModel):
    text: str
    actions: List[dict]