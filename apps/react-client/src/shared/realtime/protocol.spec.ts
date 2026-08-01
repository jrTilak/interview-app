import { describe, expect, expectTypeOf, it } from "vitest";
import type {
	AcceptedPayload,
	AssistantAudioChunkPayload,
	AttemptSnapshot,
	ConnectionPingAckData,
	ConnectionPingPayload,
	InterviewClientToServerEvents,
	InterviewServerToClientEvents,
	MicrophoneStartPayload,
	RealtimeAckCallback,
	RealtimeAcknowledgement,
} from "./protocol";

describe("realtime protocol types", () => {
	it("keeps the connection latency probe payload and acknowledgement exact", () => {
		type PingParameters = Parameters<
			InterviewClientToServerEvents["connection:ping"]
		>;

		expectTypeOf<PingParameters>().toEqualTypeOf<
			[ConnectionPingPayload, RealtimeAckCallback<ConnectionPingAckData>]
		>();
		expectTypeOf<keyof ConnectionPingPayload>().toEqualTypeOf<"probeId">();
		expectTypeOf<keyof ConnectionPingAckData>().toEqualTypeOf<
			"probeId" | "serverTime"
		>();
	});

	it("keeps microphone metadata and its acknowledgement exact", () => {
		type StartParameters = Parameters<
			InterviewClientToServerEvents["microphone:start"]
		>;

		expectTypeOf<StartParameters>().toEqualTypeOf<
			[MicrophoneStartPayload, RealtimeAckCallback<AcceptedPayload>]
		>();
	});

	it("reuses the REST snapshot for realtime state events", () => {
		type StateParameters = Parameters<
			InterviewServerToClientEvents["attempt:state"]
		>;

		expectTypeOf<StateParameters>().toEqualTypeOf<[AttemptSnapshot]>();
	});

	it("types streamed assistant audio as a binary event and narrows failed acks", () => {
		type AudioParameters = Parameters<
			InterviewServerToClientEvents["assistant:audio:chunk"]
		>;
		const acknowledgement: RealtimeAcknowledgement<AcceptedPayload> = {
			ok: false,
			error: {
				code: "INVALID_EVENT",
				message: "Realtime event validation failed",
				retryable: false,
			},
		};

		expectTypeOf<AudioParameters>().toEqualTypeOf<
			[AssistantAudioChunkPayload]
		>();
		expect(acknowledgement.ok).toBe(false);
		if (!acknowledgement.ok) {
			expect(acknowledgement.error.code).toBe("INVALID_EVENT");
		}
	});
});
