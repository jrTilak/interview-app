import { UuidSchema } from "@interview-desk/validations";
import z from "zod";
import {
	normalizeAudioMimeType,
	TRANSCRIPTION_AUDIO_MIME_TYPES,
} from "#/modules/ai/audio-formats.js";

const AttemptEventSchema = z.object({ attemptId: UuidSchema });
const TurnEventSchema = AttemptEventSchema.extend({ turnId: UuidSchema });

export const ConnectionPingEventSchema = z.object({ probeId: UuidSchema });

export const AttemptJoinEventSchema = AttemptEventSchema;

export const AttemptStartEventSchema = AttemptEventSchema;

export const MicrophoneStartEventSchema = TurnEventSchema.extend({
	mimeType: z
		.string()
		.transform(normalizeAudioMimeType)
		.refine((value) => TRANSCRIPTION_AUDIO_MIME_TYPES.has(value), {
			message: "Audio type is not supported by the transcription provider",
		}),
	sampleRateHz: z.number().int().positive().optional(),
	channels: z.number().int().positive().default(1),
}).superRefine((value, context) => {
	if (value.mimeType === "audio/l16" && value.sampleRateHz === undefined) {
		context.addIssue({
			code: "custom",
			path: ["sampleRateHz"],
			message: "Raw linear PCM audio requires a sample rate",
		});
	}
});

export const MicrophoneChunkEventSchema = TurnEventSchema.extend({
	sequence: z.number().int().nonnegative(),
	data: z.unknown(),
});

export const MicrophoneEndEventSchema = TurnEventSchema.extend({
	lastSequence: z.number().int().nonnegative(),
});

export const MicrophoneCancelEventSchema = TurnEventSchema;

export const IntegrityStatusEventSchema = AttemptEventSchema.extend({
	detectedFaceCount: z.number().int().nonnegative(),
});

export const MediaStatusEventSchema = AttemptEventSchema.extend({
	cameraActive: z.boolean(),
	screenActive: z.boolean(),
	microphoneActive: z.boolean(),
});

export const DisposableMediaChunkEventSchema = AttemptEventSchema.extend({
	data: z.unknown(),
});

export type MicrophoneStartEvent = z.infer<typeof MicrophoneStartEventSchema>;

export type ConnectionPingAckData = {
	probeId: z.infer<typeof ConnectionPingEventSchema>["probeId"];
	serverTime: string;
};

export type BufferedCandidateAudio = MicrophoneStartEvent & {
	bytes: Uint8Array;
	startedAt: Date;
	endedAt: Date;
};

export type RealtimeErrorPayload = {
	code: string;
	message: string;
	retryable: boolean;
};

export type InterviewEventEmitter = (event: string, payload: unknown) => void;
