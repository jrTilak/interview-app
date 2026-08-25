import {
	ATTEMPT_END_REASONS,
	ATTEMPT_STATES,
	INTERVIEW_TURN_ROLES,
} from "@interview-desk/validations";
import {
	attemptEndReason,
	attemptState,
	turnRole,
} from "#src/db/schema/index.js";
import {
	AttemptSnapshotResponseSchema,
	AttemptTurnResponseSchema,
} from "./response.dto.js";

const attemptId = "f0c765b0-a9fe-4a67-bf75-a63486949831";
const turnId = "19ad8c03-9e89-4d23-b393-d3cd6a654900";

describe("interview attempt response contracts", () => {
	it("uses the same enum values in validation and PostgreSQL", () => {
		expect(attemptState.enumValues).toEqual(ATTEMPT_STATES);
		expect(attemptEndReason.enumValues).toEqual(ATTEMPT_END_REASONS);
		expect(turnRole.enumValues).toEqual(INTERVIEW_TURN_ROLES);
	});

	it("accepts persisted conversation timing", () => {
		const turn = {
			id: turnId,
			sequence: 1,
			role: "assistant" as const,
			text: "Tell me about your experience.",
			startedAt: "2026-08-01T00:00:01.000Z",
			endedAt: "2026-08-01T00:00:03.000Z",
			createdAt: "2026-08-01T00:00:00.000Z",
		};

		expect(AttemptTurnResponseSchema.parse(turn)).toEqual(turn);
		expect(
			AttemptTurnResponseSchema.parse({
				...turn,
				role: "candidate",
				startedAt: null,
				endedAt: null,
			}),
		).toEqual({
			...turn,
			role: "candidate",
			startedAt: null,
			endedAt: null,
		});
	});

	it("keeps the snapshot contract simple and strips unrelated fields", () => {
		const snapshot = AttemptSnapshotResponseSchema.parse({
			id: attemptId,
			state: "READY",
			startedAt: null,
			deadlineAt: null,
			endedAt: null,
			endReason: null,
			media: {
				cameraActive: false,
				screenActive: false,
				microphoneActive: false,
				clientOnlyState: "ignored",
			},
			turns: [],
			providerDebug: true,
		});

		expect(snapshot).toEqual({
			id: attemptId,
			state: "READY",
			startedAt: null,
			deadlineAt: null,
			endedAt: null,
			endReason: null,
			media: {
				cameraActive: false,
				screenActive: false,
				microphoneActive: false,
			},
			turns: [],
		});
	});
});
