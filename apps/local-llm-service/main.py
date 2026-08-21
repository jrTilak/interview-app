import requests
from fastapi import FastAPI, HTTPException

from models import (
    StructureRequest,
    StructureResponse,
    InterviewTurnRequest,
    InterviewTurnResponse,
)

from prompts import (
    structure_prompt,
    interview_prompt,
)


app = FastAPI(title="Local LLM Interview Service")

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "qwen3:8b"


# ============================================================
# Health Check
# ============================================================

@app.get("/health")
def health():

    return {
        "status": "ok",
        "model": MODEL
    }


# ============================================================
# Structure Interview Questions
# ============================================================

@app.post(
    "/questions/structure",
    response_model=StructureResponse
)
def structure_questions(request: StructureRequest):

    prompt = structure_prompt(
        request.title,
        request.description,
        request.notes
    )

    try:

        response = requests.post(
            OLLAMA_URL,
            json={
                "model": MODEL,
                "prompt": prompt,
                "stream": False,
                "format": "json"
            },
            timeout=120
        )

        response.raise_for_status()

        data = response.json()

        result = StructureResponse.model_validate_json(
            data["response"]
        )

        # Make sure there is at least one task
        if not result.tasks:

            raise HTTPException(
                status_code=500,
                detail="LLM returned no interview tasks"
            )

        # Maximum allowed tasks = 30
        if len(result.tasks) > 30:

            raise HTTPException(
                status_code=500,
                detail="LLM returned more than 30 tasks"
            )

        return result

    except HTTPException:
        raise

    except requests.RequestException as e:

        raise HTTPException(
            status_code=502,
            detail=f"Could not connect to Ollama: {str(e)}"
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Invalid LLM response: {str(e)}"
        )


# ============================================================
# Generate Next Interview Turn
# ============================================================

@app.post(
    "/interview/turn",
    response_model=InterviewTurnResponse
)
def interview_turn(request: InterviewTurnRequest):

    # --------------------------------------------------------
    # If the server says the interview MUST end,
    # don't ask the LLM to decide whether to continue.
    # --------------------------------------------------------

    if request.mustEnd:

        return InterviewTurnResponse(
            text="Thank you for your time. That concludes the interview.",
            actions=[
                {
                    "type": "end_interview",
                    "reason": "The server requires the interview to end."
                }
            ]
        )

    # --------------------------------------------------------
    # If all tasks are already completed, end the interview.
    # --------------------------------------------------------

    if request.tasks and all(
        task.completed for task in request.tasks
    ):

        return InterviewTurnResponse(
            text="Thank you for your time. That concludes the interview.",
            actions=[
                {
                    "type": "end_interview",
                    "reason": "All interview tasks have been completed."
                }
            ]
        )

    # --------------------------------------------------------
    # Build prompt for Qwen
    # --------------------------------------------------------

    prompt = interview_prompt(
        title=request.title,
        description=request.description,
        candidate_name=request.candidateName,
        tasks=request.tasks,
        transcript=request.transcript,
        remaining_time=request.remainingTime,
        must_end=request.mustEnd,
    )

    try:

        # ----------------------------------------------------
        # Ask Ollama / Qwen
        # ----------------------------------------------------

        response = requests.post(
            OLLAMA_URL,
            json={
                "model": MODEL,
                "prompt": prompt,
                "stream": False,
                "format": "json"
            },
            timeout=120
        )

        response.raise_for_status()

        data = response.json()

        # ----------------------------------------------------
        # Validate LLM JSON response
        # ----------------------------------------------------

        result = InterviewTurnResponse.model_validate_json(
            data["response"]
        )

        # ----------------------------------------------------
        # Validate interviewer text
        # ----------------------------------------------------

        if not result.text or not result.text.strip():

            raise HTTPException(
                status_code=500,
                detail="LLM returned empty interviewer text"
            )

        # ----------------------------------------------------
        # Build server-side task map
        # ----------------------------------------------------

        valid_tasks = {
            task.id: task
            for task in request.tasks
            if task.id
        }

        # ----------------------------------------------------
        # Validate and clean actions
        # ----------------------------------------------------

        clean_actions = []

        for action in result.actions:

            action_type = action.get("type")

            # -----------------------------------------------
            # COMPLETE QUESTIONS
            # -----------------------------------------------

            if action_type == "complete_questions":

                question_ids = action.get(
                    "questionIds",
                    []
                )

                valid_completion_ids = []

                for question_id in question_ids:

                    # Unknown task ID
                    if question_id not in valid_tasks:
                        continue

                    # Already completed on server
                    if valid_tasks[question_id].completed:
                        continue

                    # Valid incomplete task
                    valid_completion_ids.append(
                        question_id
                    )

                # Only keep valid IDs
                if valid_completion_ids:

                    clean_actions.append(
                        {
                            "type": "complete_questions",
                            "questionIds": valid_completion_ids
                        }
                    )

            # -----------------------------------------------
            # END INTERVIEW
            # -----------------------------------------------

            elif action_type == "end_interview":

                reason = action.get(
                    "reason",
                    "The interview has ended."
                )

                clean_actions.append(
                    {
                        "type": "end_interview",
                        "reason": reason
                    }
                )

            # -----------------------------------------------
            # UNKNOWN ACTION
            # -----------------------------------------------

            else:

                raise HTTPException(
                    status_code=500,
                    detail=(
                        f"LLM returned invalid action type: "
                        f"{action_type}"
                    )
                )

        # ----------------------------------------------------
        # Replace LLM actions with validated actions
        # ----------------------------------------------------

        result.actions = clean_actions

        return result

    # --------------------------------------------------------
    # Ollama connection error
    # --------------------------------------------------------

    except requests.RequestException as e:

        raise HTTPException(
            status_code=502,
            detail=f"Could not connect to Ollama: {str(e)}"
        )

    # --------------------------------------------------------
    # FastAPI HTTP errors
    # --------------------------------------------------------

    except HTTPException:
        raise

    # --------------------------------------------------------
    # Invalid JSON / validation error
    # --------------------------------------------------------

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Invalid LLM response: {str(e)}"
        )