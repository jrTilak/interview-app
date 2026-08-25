import {
	ConnectionPingEventSchema,
	MicrophoneStartEventSchema,
} from "./interview-realtime.protocol.js";

const identity = {
	attemptId: "f0c765b0-a9fe-4a67-bf75-a63486949831",
	turnId: "19ad8c03-9e89-4d23-b393-d3cd6a654900",
};
const probeId = "536d1912-17b0-43f5-a08f-dc2dce239341";

describe("interview realtime protocol", () => {
	it("accepts only a strict UUID connection probe", () => {
		expect(ConnectionPingEventSchema.parse({ probeId })).toEqual({ probeId });
		expect(() =>
			ConnectionPingEventSchema.parse({ probeId: "not-a-uuid" }),
		).toThrow();
		expect(() =>
			ConnectionPingEventSchema.parse({
				probeId,
				attemptId: identity.attemptId,
			}),
		).toThrow();
	});

	it("normalizes parameterized supported audio MIME values", () => {
		const parsed = MicrophoneStartEventSchema.parse({
			...identity,
			mimeType: "Audio/X-WAV; codecs=pcm",
		});

		expect(parsed.mimeType).toBe("audio/x-wav");
		expect(parsed.channels).toBe(1);
	});

	it("requires sample-rate metadata for raw linear PCM", () => {
		expect(() =>
			MicrophoneStartEventSchema.parse({
				...identity,
				mimeType: "audio/l16",
			}),
		).toThrow();
		expect(() =>
			MicrophoneStartEventSchema.parse({
				...identity,
				mimeType: "audio/l16",
				sampleRateHz: 24_000,
			}),
		).not.toThrow();
	});

	it.each(["audio/ogg;codecs=opus", "audio/webm;codecs=opus"])(
		"rejects unsupported browser audio %s",
		(mimeType) => {
			expect(() =>
				MicrophoneStartEventSchema.parse({ ...identity, mimeType }),
			).toThrow();
		},
	);
});
