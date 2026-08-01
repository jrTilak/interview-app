import { MicrophoneStartEventSchema } from "./interview-realtime.protocol.js";

const identity = {
	attemptId: "f0c765b0-a9fe-4a67-bf75-a63486949831",
	turnId: "19ad8c03-9e89-4d23-b393-d3cd6a654900",
};

describe("interview realtime protocol", () => {
	it("normalizes parameterized supported audio MIME values", () => {
		const parsed = MicrophoneStartEventSchema.parse({
			...identity,
			mimeType: "Audio/OGG; codecs=opus",
		});

		expect(parsed.mimeType).toBe("audio/ogg");
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

	it("rejects unsupported browser WebM audio", () => {
		expect(() =>
			MicrophoneStartEventSchema.parse({
				...identity,
				mimeType: "audio/webm;codecs=opus",
			}),
		).toThrow();
	});
});
