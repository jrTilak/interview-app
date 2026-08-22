"""Focused contract tests for the local Ollama/Qwen interview service."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import requests
from fastapi import HTTPException, Response
from pydantic import ValidationError

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import main
from models import (
    InterviewTask,
    InterviewTurnRequest,
    InterviewTurnResponse,
    StructureRequest,
    StructureResponse,
)


class FakeProviderResponse:
    """Small requests.Response-compatible double for Ollama calls."""

    def __init__(self, payload: object, *, status_code: int = 200) -> None:
        self.payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise requests.HTTPError(f"private provider HTTP {self.status_code}")

    def json(self) -> object:
        return self.payload


def provider_generation(payload: object) -> FakeProviderResponse:
    return FakeProviderResponse({"response": json.dumps(payload)})


def action_dicts(result: InterviewTurnResponse) -> list[dict[str, object]]:
    """Normalize validated action models for contract assertions."""

    return [
        action.model_dump() if hasattr(action, "model_dump") else action
        for action in result.actions
    ]


def make_turn_request(
    *,
    tasks: list[InterviewTask] | None = None,
    must_end: bool = False,
) -> InterviewTurnRequest:
    return InterviewTurnRequest(
        title="Backend Engineer",
        description="A practical technical interview",
        candidateName="Alex",
        tasks=(
            tasks
            if tasks is not None
            else [
                InterviewTask(
                    id="11111111-1111-4111-8111-111111111111",
                    title="API design",
                    prompt="How would you design this API?",
                    objective="Evaluate API design reasoning",
                    followUpGuidance="Ask about failure handling",
                    completed=False,
                )
            ]
        ),
        transcript="",
        remainingTime=600,
        mustEnd=must_end,
    )


class LlmReadinessTests(unittest.TestCase):
    def test_preload_uses_an_empty_generation_and_configured_keep_alive(self) -> None:
        with patch.object(
            main.requests,
            "post",
            return_value=FakeProviderResponse({"response": ""}),
        ) as post:
            main._preload_model()

        self.assertEqual(post.call_args.args[0], main.OLLAMA_GENERATE_URL)
        self.assertEqual(
            post.call_args.kwargs["json"],
            {
                "model": main.OLLAMA_MODEL,
                "stream": False,
                "keep_alive": main.OLLAMA_KEEP_ALIVE,
            },
        )

    def test_health_is_degraded_when_ollama_is_unreachable(self) -> None:
        response = Response()
        with patch.object(
            main.requests,
            "get",
            side_effect=requests.ConnectionError("private network detail"),
        ):
            body = main.health(response)

        self.assertEqual(response.status_code, 503)
        self.assertEqual(body["status"], "degraded")
        self.assertEqual(body["model"], main.OLLAMA_MODEL)
        self.assertNotIn("private network detail", str(body))

    def test_health_is_degraded_when_configured_model_is_absent(self) -> None:
        response = Response()
        provider_response = FakeProviderResponse(
            {
                "models": [
                    {"name": "qwen3:4b", "model": "qwen3:4b"},
                    {"name": "other:latest", "model": "other:latest"},
                ]
            }
        )

        with patch.object(main.requests, "get", return_value=provider_response):
            body = main.health(response)

        self.assertEqual(response.status_code, 503)
        self.assertEqual(body["status"], "degraded")
        self.assertEqual(body["model"], main.OLLAMA_MODEL)

    def test_health_is_ready_when_configured_model_is_present(self) -> None:
        response = Response()
        provider_response = FakeProviderResponse(
            {
                "models": [
                    {
                        "name": main.OLLAMA_MODEL,
                        "model": main.OLLAMA_MODEL,
                    }
                ]
            }
        )

        with patch.object(main.requests, "get", return_value=provider_response) as get:
            body = main.health(response)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(body["status"], "ok")
        self.assertEqual(body["model"], main.OLLAMA_MODEL)
        get.assert_called_once()


class LlmDeterministicTurnTests(unittest.TestCase):
    def test_must_end_returns_closing_turn_without_calling_ollama(self) -> None:
        request = make_turn_request(must_end=True)

        with patch.object(main.requests, "post") as post:
            result = main.interview_turn(request)

        post.assert_not_called()
        self.assertTrue(result.text.strip())
        self.assertEqual(len(result.actions), 1)
        self.assertEqual(action_dicts(result)[0]["type"], "end_interview")

    def test_empty_tasks_end_interview_without_calling_ollama(self) -> None:
        request = make_turn_request(tasks=[])

        with patch.object(main.requests, "post") as post:
            result = main.interview_turn(request)

        post.assert_not_called()
        self.assertTrue(result.text.strip())
        self.assertEqual(len(result.actions), 1)
        self.assertEqual(action_dicts(result)[0]["type"], "end_interview")

    def test_all_completed_tasks_end_without_calling_ollama(self) -> None:
        request = make_turn_request(
            tasks=[
                InterviewTask(
                    id="11111111-1111-4111-8111-111111111111",
                    title="API design",
                    prompt="How would you design this API?",
                    objective=None,
                    followUpGuidance=None,
                    completed=True,
                )
            ]
        )

        with patch.object(main.requests, "post") as post:
            result = main.interview_turn(request)

        post.assert_not_called()
        self.assertEqual(action_dicts(result)[0]["type"], "end_interview")


class LlmOutputContractTests(unittest.TestCase):
    def test_structure_response_contains_only_nestjs_contract_fields(self) -> None:
        ollama_result = provider_generation(
            {
                "tasks": [
                    {
                        "title": "API design",
                        "prompt": "How would you design this API?",
                        "objective": "Evaluate API design reasoning",
                        "followUpGuidance": "Ask about failure handling",
                    }
                ]
            }
        )
        request = StructureRequest(
            title="Backend Engineer",
            description="A practical technical interview",
            notes="Ask about API design",
        )

        with patch.object(
            main.requests, "post", return_value=ollama_result
        ) as provider_post:
            result = main.structure_questions(request)

        serialized = result.model_dump()
        self.assertEqual(len(serialized["tasks"]), 1)
        self.assertEqual(
            set(serialized["tasks"][0]),
            {"title", "prompt", "objective", "followUpGuidance"},
        )
        self.assertNotIn("id", serialized["tasks"][0])
        self.assertNotIn("completed", serialized["tasks"][0])
        provider_body = provider_post.call_args.kwargs["json"]
        self.assertIs(provider_body["think"], False)
        self.assertEqual(provider_body["format"], StructureResponse.model_json_schema())
        self.assertEqual(provider_body["options"]["temperature"], 0)
        self.assertEqual(provider_body["options"]["num_ctx"], main.OLLAMA_NUM_CTX)
        self.assertEqual(
            provider_body["options"]["num_predict"], main.STRUCTURE_MAX_TOKENS
        )

    def test_turn_filters_unknown_completed_and_duplicate_question_ids(self) -> None:
        active_id = "11111111-1111-4111-8111-111111111111"
        completed_id = "22222222-2222-4222-8222-222222222222"
        unknown_id = "33333333-3333-4333-8333-333333333333"
        request = make_turn_request(
            tasks=[
                InterviewTask(
                    id=active_id,
                    title="API design",
                    prompt="How would you design this API?",
                    objective=None,
                    followUpGuidance=None,
                    completed=False,
                ),
                InterviewTask(
                    id=completed_id,
                    title="Testing",
                    prompt="How would you test it?",
                    objective=None,
                    followUpGuidance=None,
                    completed=True,
                ),
            ]
        )
        ollama_result = provider_generation(
            {
                "text": "Thank you. Let us continue.",
                "actions": [
                    {
                        "type": "complete_questions",
                        "questionIds": [
                            unknown_id,
                            completed_id,
                            active_id,
                            active_id,
                        ],
                    }
                ],
            }
        )

        with patch.object(
            main.requests, "post", return_value=ollama_result
        ) as provider_post:
            result = main.interview_turn(request)

        self.assertEqual(
            action_dicts(result),
            [{"type": "complete_questions", "questionIds": [active_id]}],
        )
        provider_prompt = provider_post.call_args.kwargs["json"]["prompt"]
        self.assertIn('"tasks": [', provider_prompt)
        self.assertNotIn("InterviewTask(", provider_prompt)

    def test_turn_uses_the_server_prompt_when_completion_action_is_missing(
        self,
    ) -> None:
        request = make_turn_request()
        ollama_result = provider_generation({"text": "Thanks.", "actions": []})

        with patch.object(main.requests, "post", return_value=ollama_result):
            result = main.interview_turn(request)

        self.assertEqual(
            result.text,
            "Hello Alex. Welcome to the Backend Engineer interview. "
            "How would you design this API?",
        )
        self.assertEqual(
            action_dicts(result),
            [
                {
                    "type": "complete_questions",
                    "questionIds": ["11111111-1111-4111-8111-111111111111"],
                }
            ],
        )

    def test_request_contracts_are_strict_and_bounded(self) -> None:
        with self.assertRaises(ValidationError):
            StructureRequest(
                title="Backend Engineer",
                description=None,
                notes="Ask about APIs",
                unexpected=True,
            )

        turn_payload = make_turn_request().model_dump()
        turn_payload["transcript"] = "x" * 20_001
        with self.assertRaises(ValidationError):
            InterviewTurnRequest.model_validate(turn_payload)

    def test_turn_rejects_malformed_complete_questions_action(self) -> None:
        request = make_turn_request()
        ollama_result = provider_generation(
            {
                "text": "Let us continue.",
                "actions": [
                    {
                        "type": "complete_questions",
                        "questionIds": "not-an-array",
                    }
                ],
            }
        )

        with (
            patch.object(main.requests, "post", return_value=ollama_result),
            self.assertRaises(HTTPException) as raised,
        ):
            main.interview_turn(request)

        self.assertEqual(raised.exception.status_code, 502)

    def test_turn_rejects_unknown_action_type(self) -> None:
        request = make_turn_request()
        ollama_result = provider_generation(
            {
                "text": "Let us continue.",
                "actions": [{"type": "run_untrusted_command"}],
            }
        )

        with (
            patch.object(main.requests, "post", return_value=ollama_result),
            self.assertRaises(HTTPException) as raised,
        ):
            main.interview_turn(request)

        self.assertEqual(raised.exception.status_code, 502)


class LlmFailureAndAdmissionTests(unittest.TestCase):
    def test_connection_error_is_sanitized(self) -> None:
        request = make_turn_request()

        with (
            patch.object(
                main.requests,
                "post",
                side_effect=requests.ConnectionError("private host and token detail"),
            ),
            self.assertRaises(HTTPException) as raised,
        ):
            main.interview_turn(request)

        self.assertEqual(raised.exception.status_code, 502)
        self.assertNotIn("private host and token detail", raised.exception.detail)

    def test_timeout_is_sanitized_and_reported_as_gateway_timeout(self) -> None:
        request = StructureRequest(
            title="Backend Engineer",
            description=None,
            notes="Ask about APIs",
        )

        with (
            patch.object(
                main.requests,
                "post",
                side_effect=requests.Timeout("private timeout detail"),
            ),
            self.assertRaises(HTTPException) as raised,
        ):
            main.structure_questions(request)

        self.assertEqual(raised.exception.status_code, 504)
        self.assertNotIn("private timeout detail", raised.exception.detail)

    def test_busy_service_rejects_generation_before_provider_call(self) -> None:
        self.assertTrue(main.generation_gate.acquire(blocking=False))
        try:
            with (
                patch.object(main.requests, "post") as post,
                self.assertRaises(HTTPException) as raised,
            ):
                main.interview_turn(make_turn_request())
        finally:
            main.generation_gate.release()

        post.assert_not_called()
        self.assertEqual(raised.exception.status_code, 503)
        self.assertEqual(raised.exception.headers, {"Retry-After": "1"})

    def test_provider_failure_releases_generation_gate(self) -> None:
        request = make_turn_request()
        with (
            patch.object(
                main.requests,
                "post",
                side_effect=requests.ConnectionError("provider failed"),
            ),
            self.assertRaises(HTTPException),
        ):
            main.interview_turn(request)

        self.assertTrue(main.generation_gate.acquire(blocking=False))
        main.generation_gate.release()


if __name__ == "__main__":
    unittest.main()
