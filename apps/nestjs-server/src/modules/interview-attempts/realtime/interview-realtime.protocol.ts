import z from "zod";
import {
	normalizeAudioMimeType,
	TRANSCRIPTION_AUDIO_MIME_TYPES,
} from "../../ai/audio-formats.js";

const AttemptCommandSchema = z
	.object({
		attemptId: z.uuid(),
		commandId: z.uuid(),
	})
	.strict();

export const ConnectionPingEventSchema = z
	.object({ probeId: z.uuid() })
	.strict();

export const AttemptJoinEventSchema = z
	.object({ attemptId: z.uuid() })
	.strict();

export const AttemptStartEventSchema = AttemptCommandSchema;

export const MicrophoneStartEventSchema = z
	.object({
		attemptId: z.uuid(),
		turnId: z.uuid(),
		mimeType: z
			.string()
			.transform(normalizeAudioMimeType)
			.refine((value) => TRANSCRIPTION_AUDIO_MIME_TYPES.has(value), {
				message: "Audio type is not supported by the transcription provider",
			}),
		sampleRateHz: z.number().int().min(8_000).max(96_000).optional(),
		channels: z.number().int().min(1).max(2).default(1),
	})
	.strict()
	.superRefine((value, context) => {
		if (value.mimeType === "audio/l16" && value.sampleRateHz === undefined) {
			context.addIssue({
				code: "custom",
				path: ["sampleRateHz"],
				message: "Raw linear PCM audio requires a sample rate",
			});
		}
	});

export const MicrophoneChunkEventSchema = z
	.object({
		attemptId: z.uuid(),
		turnId: z.uuid(),
		sequence: z.number().int().nonnegative(),
		data: z.unknown(),
	})
	.strict();

export const MicrophoneEndEventSchema = z
	.object({
		attemptId: z.uuid(),
		turnId: z.uuid(),
		lastSequence: z.number().int().nonnegative(),
	})
	.strict();

export const MicrophoneCancelEventSchema = z
	.object({
		attemptId: z.uuid(),
		turnId: z.uuid(),
	})
	.strict();

export const IntegrityStatusEventSchema = z
	.object({
		attemptId: z.uuid(),
		detectedFaceCount: z.number().int().min(0).max(10),
	})
	.strict();

export const MediaStatusEventSchema = z
	.object({
		attemptId: z.uuid(),
		cameraActive: z.boolean(),
		screenActive: z.boolean(),
		microphoneActive: z.boolean(),
	})
	.strict();

export const DisposableMediaChunkEventSchema = z
	.object({
		attemptId: z.uuid(),
		sequence: z.number().int().nonnegative(),
		mimeType: z.string().trim().min(1).max(100),
		data: z.unknown(),
	})
	.strict();

export type MicrophoneStartEvent = z.infer<typeof MicrophoneStartEventSchema>;

export type ConnectionPingAckData = {
	probeId: z.infer<typeof ConnectionPingEventSchema>["probeId"];
	serverTime: string;
};

export type BufferedCandidateAudio = MicrophoneStartEvent & {
	bytes: Uint8Array;
};

export type RealtimeErrorPayload = {
	code: string;
	message: string;
	retryable: boolean;
};

export type InterviewEventEmitter = (event: string, payload: unknown) => void;
