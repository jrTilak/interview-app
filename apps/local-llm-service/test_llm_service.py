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
    InterviewMoveResponse,
    InterviewTask,
    InterviewTurnRequest,
    InterviewTurnResponse,
    StructureRequest,
    StructureResponse,
)
from prompts import (
    RECENT_TRANSCRIPT_MAX_CHARACTERS,
    RECENT_TURN_LIMIT,
    interview_fallback_question,
    interview_move_prompt,
    interview_variation_style,
    recent_transcript_turns,
    structure_prompt,
)


class FakeProviderResponse:
    """Small requests.Response-compatible double for Ollama calls."""

    def __init__(self, payload: object, *, status_code: int = 200) -> None:
        self.payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise requests.HTTPError(
                f"private provider HTTP {self.status_code}", response=self
            )

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


def fallback_question(
    topic: InterviewTask,
    *,
    variation_key: str = "attempt-key-alex",
    variation_offset: int = 0,
) -> str:
    return interview_fallback_question(
        variation_key=variation_key,
        topic_title=main._declarative_topic_label(topic.title),
        topic_turn_count=topic.turnCount,
        variation_offset=variation_offset,
    )


def make_task(
    *,
    task_id: str = "11111111-1111-4111-8111-111111111111",
    title: str = "API design",
    prompt: str = "Resource modeling, validation, and trade-offs",
    turn_count: int = 1,
    completed: bool = False,
) -> InterviewTask:
    return InterviewTask(
        id=task_id,
        title=title,
        prompt=prompt,
        objective=f"Explore practical {title.lower()} reasoning",
        followUpGuidance="Probe trade-offs when relevant",
        completed=completed,
        turnCount=turn_count,
    )


def make_turn_request(
    *,
    tasks: list[InterviewTask] | None = None,
    must_end: bool = False,
    transcript: str | None = None,
    variation_key: str = "attempt-key-alex",
) -> InterviewTurnRequest:
    return InterviewTurnRequest(
        title="Backend Engineer",
        description="A practical technical interview",
        candidateName="Alex",
        candidateVariationKey=variation_key,
        tasks=(tasks if tasks is not None else [make_task()]),
        transcript=(
            json.dumps(
                [
                    {"role": "assistant", "text": "Tell me about your approach."},
                    {"role": "candidate", "text": "I would start with the API."},
                ]
            )
            if transcript is None
            else transcript
        ),
        remainingTime=600,
        mustEnd=must_end,
    )


class LlmReadinessTests(unittest.TestCase):
    def setUp(self) -> None:
        main.model_ready.clear()

    def tearDown(self) -> None:
        main.model_ready.clear()

    def test_preload_warms_the_live_prompt_contract_and_keep_alive(self) -> None:
        with patch.object(
            main.requests,
            "post",
            # A one-token preload response is intentionally not parsed or validated.
            return_value=FakeProviderResponse({"response": "{"}),
        ) as post:
            main._preload_model()

        self.assertEqual(post.call_args.args[0], main.OLLAMA_GENERATE_URL)
        provider_body = post.call_args.kwargs["json"]
        self.assertEqual(provider_body["model"], main.OLLAMA_MODEL)
        self.assertIs(provider_body["stream"], False)
        self.assertIs(provider_body["think"], False)
        self.assertEqual(
            provider_body["format"],
            main._ollama_format_schema(InterviewMoveResponse),
        )
        self.assertIn("exact next\nwords to speak", provider_body["prompt"])
        self.assertIn('"opening":true', provider_body["prompt"])
        self.assertIn('"variationStyle":', provider_body["prompt"])
        self.assertEqual(provider_body["keep_alive"], main.OLLAMA_KEEP_ALIVE)
        self.assertEqual(
            provider_body["options"],
            {
                "temperature": main.TURN_TEMPERATURE,
                "num_ctx": main.OLLAMA_NUM_CTX,
                "num_predict": main.PRELOAD_MAX_TOKENS,
            },
        )
        self.assertEqual(main.PRELOAD_MAX_TOKENS, 1)
        self.assertTrue(main.model_ready.is_set())

    def test_default_keep_alive_is_the_numeric_resident_value(self) -> None:
        self.assertEqual(main.OLLAMA_KEEP_ALIVE, -1)

    def test_failed_preload_keeps_health_degraded_even_when_model_is_listed(
        self,
    ) -> None:
        with patch.object(
            main.requests,
            "post",
            side_effect=requests.ConnectionError("private network detail"),
        ):
            self.assertFalse(main._preload_model())

        response = Response()
        with patch.object(main.requests, "get") as get:
            body = main.health(response)

        get.assert_not_called()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(body["status"], "degraded")

    def test_health_is_degraded_when_ollama_is_unreachable(self) -> None:
        main.model_ready.set()
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
        self.assertFalse(main.model_ready.is_set())

    def test_health_is_degraded_when_configured_model_is_absent(self) -> None:
        main.model_ready.set()
        response = Response()
        provider_response = FakeProviderResponse(
            {
                "models": [
                    {
                        "name": "definitely-not-configured:model",
                        "model": "definitely-not-configured:model",
                    },
                    {"name": "other:latest", "model": "other:latest"},
                ]
            }
        )

        with patch.object(main.requests, "get", return_value=provider_response):
            body = main.health(response)

        self.assertEqual(response.status_code, 503)
        self.assertEqual(body["status"], "degraded")
        self.assertEqual(body["model"], main.OLLAMA_MODEL)
        self.assertFalse(main.model_ready.is_set())

    def test_health_is_ready_when_configured_model_is_present(self) -> None:
        main.model_ready.set()
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
        request = make_turn_request(tasks=[make_task(completed=True)])

        with patch.object(main.requests, "post") as post:
            result = main.interview_turn(request)

        post.assert_not_called()
        self.assertEqual(action_dicts(result)[0]["type"], "end_interview")


class LlmPromptLatencyTests(unittest.TestCase):
    def test_question_like_titles_become_declarative_topic_labels(self) -> None:
        self.assertEqual(
            main._declarative_topic_label("Is HTML semantic?"), "HTML semantic"
        )
        self.assertEqual(
            main._declarative_topic_label("Do you use React?"), "use React"
        )
        self.assertEqual(
            main._declarative_topic_label("Could you explain caching?"), "caching"
        )

    def test_candidate_variation_is_stable_and_can_change_between_people(
        self,
    ) -> None:
        alex_style = interview_variation_style(
            variation_key="attempt-key-alex",
            topic_title="API design",
            topic_turn_count=0,
        )
        alex_retry_style = interview_variation_style(
            variation_key="attempt-key-alex",
            topic_title="API design",
            topic_turn_count=0,
        )
        candidate_styles = {
            interview_variation_style(
                variation_key=f"attempt-key-{index}",
                topic_title="API design",
                topic_turn_count=0,
            )
            for index in range(8)
        }
        fallback_questions = {
            interview_fallback_question(
                variation_key=f"attempt-key-{index}",
                topic_title="API design",
                topic_turn_count=0,
            )
            for index in range(8)
        }

        self.assertEqual(alex_style, alex_retry_style)
        self.assertGreater(len(candidate_styles), 1)
        self.assertGreater(len(fallback_questions), 1)

    def test_structure_prompt_is_compact_and_leaves_topic_count_to_the_model(
        self,
    ) -> None:
        prompt = structure_prompt(
            title="Backend Engineer",
            description="A practical interview",
            notes="Ask about API design and testing.",
        )
        normalized_prompt = " ".join(prompt.split())

        self.assertLessEqual(len(prompt), 2_000)
        self.assertIn("There is no fixed topic count", normalized_prompt)
        self.assertIn("Creator notes define the scope", normalized_prompt)
        self.assertIn("without adding adjacent skills", normalized_prompt)
        self.assertIn("Split distinct concepts", normalized_prompt)
        self.assertIn(
            '"Python, SQL, Docker" means those three topics', normalized_prompt
        )
        self.assertIn('notes are vague, such as "general role fit"', normalized_prompt)
        self.assertIn("infer several relevant topics", normalized_prompt)
        self.assertIn(
            "Use one topic only for a genuinely narrow brief",
            normalized_prompt,
        )
        self.assertIn("never a spoken question", normalized_prompt)
        self.assertIn(
            "2-4 concrete subareas or trade-offs", normalized_prompt
        )
        self.assertIn("Never reuse a sentence across fields", normalized_prompt)
        self.assertIn("FIELD_EXAMPLE", normalized_prompt)
        self.assertIn("meaning only; never copy its subject", normalized_prompt)
        self.assertIn(
            "Schema boundaries, relationships, migrations, and consistency trade-offs",
            normalized_prompt,
        )
        self.assertIn(
            "tasks containing exactly title, prompt, objective, and",
            normalized_prompt,
        )
        self.assertNotIn("Resource modeling, validation, and trade-offs", prompt)
        self.assertNotIn("How would you design this API?", prompt)
        self.assertNotIn("Prefer one boundary per explicit note", prompt)
        self.assertNotIn("$defs", prompt)
        self.assertNotIn("maxLength", prompt)

    def test_recent_dialogue_is_role_filtered_and_bounded(self) -> None:
        latest = "A" * 1_000 + "B" * 1_000
        transcript = json.dumps(
            [
                {"role": "system", "text": "discard this unknown role"},
                {"role": "candidate", "text": "discard this older answer"},
                {"role": "assistant", "text": "Q" * 2_000},
                {"role": "candidate", "text": latest},
            ]
        )

        result = recent_transcript_turns(transcript)

        self.assertLessEqual(len(result), RECENT_TURN_LIMIT)
        self.assertLessEqual(
            sum(len(turn["text"]) for turn in result),
            RECENT_TRANSCRIPT_MAX_CHARACTERS,
        )
        self.assertEqual([turn["role"] for turn in result], ["assistant", "candidate"])
        self.assertTrue(result[-1]["text"].startswith("A" * 100))
        self.assertTrue(result[-1]["text"].endswith("B" * 100))
        self.assertNotIn("older answer", json.dumps(result))

    def test_live_prompt_and_format_have_fixed_small_upper_bounds(self) -> None:
        recent_turns = recent_transcript_turns(
            json.dumps(
                [
                    {"role": "assistant", "text": "a" * 4_000},
                    {"role": "candidate", "text": "b" * 4_000},
                    {"role": "assistant", "text": "c" * 4_000},
                    {"role": "candidate", "text": "d" * 4_000},
                ]
            )
        )
        topic = {
            "title": "T" * 160,
            "prompt": "P" * 4_000,
            "objective": "O" * 2_000,
            "followUpGuidance": "G" * 2_000,
        }
        prompt = interview_move_prompt(
            title="I" * 160,
            description="D" * 2_000,
            candidate_name="C" * 200,
            candidate_variation_key="bounded-attempt-key",
            current_topic=topic,
            next_topic=topic,
            recent_turns=recent_turns,
            remaining_time=600,
            topic_turn_count=2,
            opening=False,
        )
        format_schema = json.dumps(
            main._ollama_format_schema(InterviewMoveResponse),
            separators=(",", ":"),
        )

        self.assertLessEqual(len(prompt), 10_500)
        self.assertLessEqual(len(format_schema), 400)
        self.assertEqual(main.TURN_MAX_TOKENS, 128)
        self.assertNotIn("complete_questions", prompt)
        self.assertNotIn("OUTPUT_SCHEMA", prompt)
        self.assertNotIn("11111111-1111-4111-8111-111111111111", prompt)
        self.assertIn('"seed":', prompt)
        self.assertIn('"variationStyle":', prompt)
        self.assertIn("only as a presentation cue", prompt)
        self.assertNotIn("openingPrompt", prompt)

    def test_opening_omits_the_next_private_boundary_until_it_can_advance(
        self,
    ) -> None:
        topic = {
            "title": "API design",
            "prompt": "Resource modeling and trade-offs",
            "objective": "Explore practical API design reasoning",
            "followUpGuidance": None,
        }
        next_topic = {
            "title": "SECRET_NEXT_BOUNDARY",
            "prompt": "Testing strategy and failure paths",
            "objective": "Explore testing decisions",
            "followUpGuidance": None,
        }

        opening_prompt = interview_move_prompt(
            title="Backend Engineer",
            description=None,
            candidate_name="Alex",
            candidate_variation_key="opening-attempt-key",
            current_topic=topic,
            next_topic=next_topic,
            recent_turns=[],
            remaining_time=600,
            topic_turn_count=0,
            opening=True,
        )
        bridge_prompt = interview_move_prompt(
            title="Backend Engineer",
            description=None,
            candidate_name="Alex",
            candidate_variation_key="opening-attempt-key",
            current_topic=topic,
            next_topic=next_topic,
            recent_turns=[],
            remaining_time=540,
            topic_turn_count=1,
            opening=False,
        )

        self.assertNotIn("SECRET_NEXT_BOUNDARY", opening_prompt)
        self.assertIn('"nextTopic":null', opening_prompt)
        self.assertIn("SECRET_NEXT_BOUNDARY", bridge_prompt)


class LlmOutputContractTests(unittest.TestCase):
    def test_structure_response_contains_only_nestjs_contract_fields(self) -> None:
        ollama_result = provider_generation(
            {
                "tasks": [
                    {
                        "title": "What is API design?",
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
        self.assertEqual(serialized["tasks"][0]["title"], "API design")
        self.assertEqual(
            serialized["tasks"][0]["prompt"],
            "API design: Explore API design reasoning",
        )
        self.assertEqual(
            serialized["tasks"][0]["objective"],
            "Explore API design reasoning",
        )
        self.assertNotIn("?", serialized["tasks"][0]["prompt"])
        provider_body = provider_post.call_args.kwargs["json"]
        self.assertIs(provider_body["think"], False)
        self.assertEqual(
            provider_body["format"], main._ollama_format_schema(StructureResponse)
        )
        serialized_format = json.dumps(provider_body["format"])
        for keyword in main.OLLAMA_GRAMMAR_SIZE_KEYWORDS:
            self.assertNotIn(f'"{keyword}"', serialized_format)
        self.assertIn('"additionalProperties": false', serialized_format)
        self.assertIn('"required"', serialized_format)
        task_properties = provider_body["format"]["$defs"][
            "StructuredInterviewTask"
        ]["properties"]
        self.assertIn("2-4 concrete subareas", task_properties["prompt"]["description"])
        self.assertIn(
            "not a repeat of prompt",
            task_properties["objective"]["description"],
        )
        self.assertEqual(
            provider_body["options"]["temperature"], main.STRUCTURE_TEMPERATURE
        )
        self.assertEqual(provider_body["options"]["num_ctx"], main.OLLAMA_NUM_CTX)
        self.assertEqual(
            provider_body["options"]["num_predict"], main.STRUCTURE_MAX_TOKENS
        )

    def test_structure_normalization_revalidates_maximum_length_fields(self) -> None:
        ollama_result = provider_generation(
            {
                "tasks": [
                    {
                        "title": f"Please {'X' * 152}?",
                        "prompt": "Could you explain this topic?",
                        "objective": f"Assess {'O' * 1993}",
                        "followUpGuidance": None,
                    }
                ]
            }
        )

        with patch.object(main.requests, "post", return_value=ollama_result):
            result = main.structure_questions(
                StructureRequest(
                    title="Backend Engineer",
                    description=None,
                    notes="Cover the bounded topic.",
                )
            )

        task = result.tasks[0]
        self.assertLessEqual(len(task.title), 160)
        self.assertLessEqual(len(task.prompt), 4_000)
        self.assertIsNotNone(task.objective)
        self.assertLessEqual(len(task.objective or ""), 2_000)
        self.assertNotIn("?", task.title)
        self.assertNotIn("?", task.prompt)

    def test_opening_is_model_generated_and_keeps_the_topic_active(self) -> None:
        current = make_task(turn_count=0)
        following = make_task(
            task_id="22222222-2222-4222-8222-222222222222",
            title="Testing",
            prompt="Test strategy, failure paths, and observability",
            turn_count=0,
        )
        ollama_result = provider_generation(
            {
                "text": "Hello Alex. To begin, how do you approach API resource modeling?",
                "completeCurrentTopic": False,
            }
        )

        with patch.object(
            main.requests, "post", return_value=ollama_result
        ) as provider_post:
            result = main.interview_turn(
                make_turn_request(tasks=[current, following], transcript="")
            )

        self.assertEqual(
            result.text,
            "Hello Alex. To begin, how do you approach API resource modeling?",
        )
        self.assertEqual(result.actions, [])
        provider_body = provider_post.call_args.kwargs["json"]
        self.assertEqual(
            provider_body["format"], main._ollama_format_schema(InterviewMoveResponse)
        )
        serialized_format = json.dumps(provider_body["format"])
        self.assertIn("completeCurrentTopic", serialized_format)
        self.assertNotIn("questionIds", serialized_format)
        self.assertNotIn('"actions"', serialized_format)
        self.assertEqual(provider_body["options"]["temperature"], main.TURN_TEMPERATURE)
        self.assertEqual(provider_body["options"]["num_predict"], 128)
        prompt = provider_body["prompt"]
        self.assertIn('"opening":true', prompt)
        self.assertIn('"seed":"Resource modeling', prompt)
        self.assertNotIn('"title":"Testing"', prompt)
        self.assertNotIn(current.id, prompt)
        self.assertNotIn(following.id, prompt)

    def test_opening_keeps_a_valid_morphological_paraphrase(self) -> None:
        topic = make_task(
            title="HTML accessibility",
            prompt="Semantic page markup and accessible navigation",
            turn_count=0,
        )
        spoken = (
            "Alex, how do you make page markup easier for screen readers to navigate?"
        )
        ollama_result = provider_generation(
            {"text": spoken, "completeCurrentTopic": False}
        )

        with patch.object(main.requests, "post", return_value=ollama_result):
            result = main.interview_turn(
                make_turn_request(tasks=[topic], transcript="")
            )

        self.assertEqual(result.text, spoken)
        self.assertEqual(result.actions, [])

    def test_opening_completion_violation_uses_the_current_boundary(self) -> None:
        current = make_task(turn_count=0)
        following = make_task(
            task_id="22222222-2222-4222-8222-222222222222",
            title="Testing",
            prompt="Test strategy, failure paths, and observability",
            turn_count=0,
        )
        ollama_result = provider_generation(
            {
                "text": "Let us skip ahead to testing. How would you test it?",
                "completeCurrentTopic": True,
            }
        )

        with patch.object(main.requests, "post", return_value=ollama_result):
            result = main.interview_turn(
                make_turn_request(tasks=[current, following], transcript="")
            )

        self.assertEqual(
            result.text,
            "Hello Alex. Welcome to the Backend Engineer interview. "
            f"{fallback_question(current)}",
        )
        self.assertEqual(result.actions, [])

    def test_opening_without_exactly_one_question_uses_the_current_boundary(
        self,
    ) -> None:
        current = make_task(turn_count=0)

        for text in (
            "Hello Alex. Let us begin with API design.",
            "How do you model resources? How do you validate them?",
            "What is your favorite color?",
        ):
            with self.subTest(text=text):
                ollama_result = provider_generation(
                    {"text": text, "completeCurrentTopic": False}
                )
                with patch.object(main.requests, "post", return_value=ollama_result):
                    result = main.interview_turn(
                        make_turn_request(tasks=[current], transcript="")
                    )

                self.assertEqual(
                    result.text,
                    "Hello Alex. Welcome to the Backend Engineer interview. "
                    f"{fallback_question(current)}",
                )
                self.assertEqual(result.actions, [])

    def test_count_one_can_keep_topic_open_for_a_personalized_followup(self) -> None:
        ollama_result = provider_generation(
            {
                "text": "You mentioned idempotency. How would retries affect your design?",
                "completeCurrentTopic": False,
            }
        )

        with patch.object(main.requests, "post", return_value=ollama_result):
            result = main.interview_turn(make_turn_request())

        self.assertEqual(
            result.text,
            "You mentioned idempotency. How would retries affect your design?",
        )
        self.assertEqual(result.actions, [])

    def test_count_one_replaces_a_repeated_previous_question(self) -> None:
        current = make_task(turn_count=1)
        previous_question = "How do you approach API resource modeling?"
        transcript = json.dumps(
            [
                {"role": "assistant", "text": previous_question},
                {"role": "candidate", "text": "I start from the core resources."},
            ]
        )
        ollama_result = provider_generation(
            {
                "text": (
                    "That makes sense. How do you approach API resource modelling?"
                ),
                "completeCurrentTopic": False,
            }
        )

        with patch.object(main.requests, "post", return_value=ollama_result):
            result = main.interview_turn(
                make_turn_request(tasks=[current], transcript=transcript)
            )

        self.assertEqual(
            result.text,
            f"Let us explore API design. {fallback_question(current)}",
        )
        self.assertNotIn("resource modelling", result.text)

    def test_repeated_fallback_rotates_to_a_fresh_question(self) -> None:
        variation_key = "attempt-key-1"
        current = make_task(turn_count=1)
        opening_topic = make_task(turn_count=0)
        previous_question = fallback_question(
            opening_topic,
            variation_key=variation_key,
        )
        transcript = json.dumps(
            [
                {"role": "assistant", "text": previous_question},
                {"role": "candidate", "text": "I begin with the core resources."},
            ]
        )
        ollama_result = provider_generation(
            {
                "text": f"That is helpful. {previous_question}",
                "completeCurrentTopic": False,
            }
        )

        with patch.object(main.requests, "post", return_value=ollama_result):
            result = main.interview_turn(
                make_turn_request(
                    tasks=[current],
                    transcript=transcript,
                    variation_key=variation_key,
                )
            )

        self.assertEqual(
            result.text,
            "Let us explore API design. "
            f"{fallback_question(current, variation_key=variation_key, variation_offset=1)}",
        )
        self.assertNotIn(previous_question, result.text)

    def test_count_one_allows_one_clear_conversational_invitation(self) -> None:
        ollama_result = provider_generation(
            {
                "text": (
                    "That trade-off is useful context. Take a moment to expand on "
                    "how it shaped your approach."
                ),
                "completeCurrentTopic": False,
            }
        )

        with patch.object(main.requests, "post", return_value=ollama_result):
            result = main.interview_turn(make_turn_request())

        self.assertNotIn("?", result.text)
        self.assertEqual(result.actions, [])

    def test_count_one_repairs_a_reflection_that_does_not_invite_a_response(
        self,
    ) -> None:
        ollama_result = provider_generation(
            {
                "text": "That makes sense, thank you.",
                "completeCurrentTopic": False,
            }
        )

        with patch.object(main.requests, "post", return_value=ollama_result):
            result = main.interview_turn(make_turn_request())

        self.assertEqual(
            result.text,
            "That makes sense, thank you. Please continue.",
        )
        self.assertEqual(result.actions, [])

    def test_reflection_repair_normalizes_terminal_punctuation(self) -> None:
        ollama_result = provider_generation(
            {"text": "That is helpful!", "completeCurrentTopic": False}
        )

        with patch.object(main.requests, "post", return_value=ollama_result):
            result = main.interview_turn(make_turn_request())

        self.assertEqual(result.text, "That is helpful. Please continue.")

    def test_count_one_completion_moves_naturally_and_maps_only_current_id(
        self,
    ) -> None:
        current = make_task(turn_count=1)
        following = make_task(
            task_id="22222222-2222-4222-8222-222222222222",
            title="Testing",
            prompt="Test strategy, failure paths, and observability",
            turn_count=0,
        )
        ollama_result = provider_generation(
            {
                "text": "That gives me the design context. How would you test its failure paths?",
                "completeCurrentTopic": True,
            }
        )

        with patch.object(main.requests, "post", return_value=ollama_result):
            result = main.interview_turn(make_turn_request(tasks=[current, following]))

        self.assertEqual(
            action_dicts(result),
            [{"type": "complete_questions", "questionIds": [current.id]}],
        )
        self.assertEqual(
            result.text,
            "That gives me the design context. How would you test its failure paths?",
        )

    def test_completion_with_next_requires_exactly_one_next_topic_question(
        self,
    ) -> None:
        current = make_task(turn_count=1)
        following = make_task(
            task_id="22222222-2222-4222-8222-222222222222",
            title="Testing",
            prompt="Test strategy, failure paths, and observability",
            turn_count=0,
        )

        for text in (
            "Thank you. Let us now discuss testing.",
            "How would you test it? What failures matter most?",
            "How would you refine the API resource hierarchy?",
        ):
            with self.subTest(text=text):
                ollama_result = provider_generation(
                    {"text": text, "completeCurrentTopic": True}
                )
                with patch.object(main.requests, "post", return_value=ollama_result):
                    result = main.interview_turn(
                        make_turn_request(tasks=[current, following])
                    )

                self.assertEqual(
                    result.text,
                    f"Thank you. Let us move to Testing. {fallback_question(following)}",
                )
                self.assertEqual(
                    action_dicts(result),
                    [{"type": "complete_questions", "questionIds": [current.id]}],
                )

    def test_count_two_substitutes_a_real_transition_when_completion_is_forced(
        self,
    ) -> None:
        current = make_task(turn_count=2)
        following = make_task(
            task_id="22222222-2222-4222-8222-222222222222",
            title="Testing",
            prompt="Test strategy, failure paths, and observability",
            turn_count=0,
        )
        ollama_result = provider_generation(
            {
                "text": "Can you say more about your API resource hierarchy?",
                "completeCurrentTopic": False,
            }
        )

        with patch.object(main.requests, "post", return_value=ollama_result):
            result = main.interview_turn(make_turn_request(tasks=[current, following]))

        self.assertEqual(
            result.text,
            f"Thank you. Let us move to Testing. {fallback_question(following)}",
        )
        self.assertEqual(
            action_dicts(result),
            [{"type": "complete_questions", "questionIds": [current.id]}],
        )

    def test_final_topic_completion_closes_and_uses_server_owned_actions(self) -> None:
        current = make_task(turn_count=1)
        ollama_result = provider_generation(
            {
                "text": "Thank you, Alex. That covers everything I wanted to explore today.",
                "completeCurrentTopic": True,
            }
        )

        with patch.object(main.requests, "post", return_value=ollama_result):
            result = main.interview_turn(make_turn_request(tasks=[current]))

        self.assertEqual(
            action_dicts(result),
            [
                {"type": "complete_questions", "questionIds": [current.id]},
                {
                    "type": "end_interview",
                    "reason": "The final interview topic is complete.",
                },
            ],
        )
        self.assertEqual(
            result.text,
            "Thank you, Alex. That covers everything I wanted to explore today.",
        )

    def test_final_completion_cannot_leave_an_unanswered_question(self) -> None:
        ollama_result = provider_generation(
            {
                "text": "Before we finish, can you add one more detail?",
                "completeCurrentTopic": True,
            }
        )

        with patch.object(main.requests, "post", return_value=ollama_result):
            result = main.interview_turn(make_turn_request())

        self.assertEqual(
            result.text,
            "Thank you for sharing your perspective. That concludes the interview.",
        )
        self.assertEqual(len(result.actions), 2)

    def test_turn_logs_provider_token_and_duration_metrics(self) -> None:
        ollama_result = FakeProviderResponse(
            {
                "response": json.dumps(
                    {
                        "text": "How would you handle retries?",
                        "completeCurrentTopic": False,
                    }
                ),
                "prompt_eval_count": 120,
                "eval_count": 12,
                "total_duration": 1_000_000_000,
                "load_duration": 50_000_000,
                "prompt_eval_duration": 300_000_000,
                "eval_duration": 600_000_000,
            }
        )

        with (
            patch.object(main.requests, "post", return_value=ollama_result),
            self.assertLogs(main.LOGGER, level="INFO") as captured,
        ):
            main.interview_turn(make_turn_request())

        log_output = " ".join(captured.output)
        self.assertIn("prompt tokens=120", log_output)
        self.assertIn("output tokens=12", log_output)
        self.assertIn("1000.0/50.0/300.0/600.0", log_output)

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

        missing_turn_count = make_turn_request().model_dump()
        del missing_turn_count["tasks"][0]["turnCount"]
        with self.assertRaises(ValidationError):
            InterviewTurnRequest.model_validate(missing_turn_count)

        invalid_turn_count = make_turn_request().model_dump()
        invalid_turn_count["tasks"][0]["turnCount"] = -1
        with self.assertRaises(ValidationError):
            InterviewTurnRequest.model_validate(invalid_turn_count)

    def test_turn_rejects_fields_outside_the_small_provider_contract(self) -> None:
        request = make_turn_request()
        ollama_result = provider_generation(
            {
                "text": "Let us continue.",
                "actions": [],
                "completeCurrentTopic": False,
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
        main.model_ready.set()
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
        self.assertFalse(main.model_ready.is_set())

    def test_provider_error_detail_is_logged_but_not_returned_to_client(self) -> None:
        provider_response = FakeProviderResponse(
            {
                "error": "failed to parse grammar\nrepetition exceeds sane defaults",
            },
            status_code=400,
        )

        with (
            patch.object(main.requests, "post", return_value=provider_response),
            self.assertLogs(main.LOGGER, level="WARNING") as captured,
            self.assertRaises(HTTPException) as raised,
        ):
            main.structure_questions(
                StructureRequest(
                    title="Backend Engineer",
                    description=None,
                    notes="Ask about APIs",
                )
            )

        logs = " ".join(captured.output)
        self.assertIn("HTTP 400", logs)
        self.assertIn("repetition exceeds sane defaults", logs)
        self.assertNotIn("repetition exceeds sane defaults", raised.exception.detail)

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
