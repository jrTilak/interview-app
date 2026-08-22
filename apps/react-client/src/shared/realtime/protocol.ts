import type { Socket } from "socket.io-client";
import type {
	AttemptSnapshotResponseDto,
	AttemptSnapshotResponseDtoMedia,
} from "@/shared/api/generated/application/models";

export type AttemptSnapshot = AttemptSnapshotResponseDto;
export type AttemptMedia = AttemptSnapshotResponseDtoMedia;

/** Binary values Socket.IO can carry between a browser and the NestJS gateway. */
export type RealtimeBinary = ArrayBuffer | Blob | Uint8Array;

export type RealtimeErrorPayload = {
	code: string;
	message: string;
	retryable: boolean;
};

export type RealtimeAcknowledgement<T> =
	| { ok: true; data: T }
	| { ok: false; error: RealtimeErrorPayload };

export type RealtimeAckCallback<T> = (
	acknowledgement: RealtimeAcknowledgement<T>,
) => void;

export type AcceptedPayload = { accepted: true };

export type ConnectionPingPayload = { probeId: string };

export type ConnectionPingAckData = ConnectionPingPayload & {
	serverTime: string;
};

export type AttemptJoinPayload = { attemptId: string };

export type AttemptStartPayload = AttemptJoinPayload & {
	commandId: string;
};

export type MicrophoneStartPayload = AttemptJoinPayload & {
	turnId: string;
	mimeType: string;
	sampleRateHz?: number;
	channels?: number;
};

export type MicrophoneChunkPayload = AttemptJoinPayload & {
	turnId: string;
	sequence: number;
	data: RealtimeBinary;
};

export type MicrophoneEndPayload = AttemptJoinPayload & {
	turnId: string;
	lastSequence: number;
};

export type MicrophoneCancelPayload = AttemptJoinPayload & {
	turnId: string;
};

export type IntegrityStatusPayload = AttemptJoinPayload & {
	detectedFaceCount: number;
};

export type MediaStatusPayload = AttemptJoinPayload & AttemptMedia;

export type DisposableMediaChunkPayload = AttemptJoinPayload & {
	sequence: number;
	mimeType: string;
	data: RealtimeBinary;
};

export type AssistantTurnPayload = { turnId: string };

export type FinalTextPayload = AssistantTurnPayload & {
	text: string;
	isFinal: true;
};

export type AssistantAudioChunkPayload = AssistantTurnPayload & {
	sequence: number;
	mimeType: string;
	sampleRateHz?: number;
	channels?: number;
	data: RealtimeBinary;
};

export type AttemptEndedPayload = {
	reason: Exclude<AttemptSnapshot["endReason"], null>;
	endedAt: string;
};

/** Strict client emits, including the acknowledgement callback each handler returns. */
export interface InterviewClientToServerEvents {
	"connection:ping": (
		payload: ConnectionPingPayload,
		acknowledge: RealtimeAckCallback<ConnectionPingAckData>,
	) => void;
	"attempt:join": (
		payload: AttemptJoinPayload,
		acknowledge: RealtimeAckCallback<AttemptSnapshot>,
	) => void;
	"attempt:start": (
		payload: AttemptStartPayload,
		acknowledge: RealtimeAckCallback<AcceptedPayload>,
	) => void;
	"microphone:start": (
		payload: MicrophoneStartPayload,
		acknowledge: RealtimeAckCallback<AcceptedPayload>,
	) => void;
	"microphone:chunk": (
		payload: MicrophoneChunkPayload,
		acknowledge: RealtimeAckCallback<AcceptedPayload>,
	) => void;
	"microphone:end": (
		payload: MicrophoneEndPayload,
		acknowledge: RealtimeAckCallback<AcceptedPayload>,
	) => void;
	"microphone:cancel": (
		payload: MicrophoneCancelPayload,
		acknowledge: RealtimeAckCallback<AcceptedPayload>,
	) => void;
	"integrity:status": (
		payload: IntegrityStatusPayload,
		acknowledge: RealtimeAckCallback<AcceptedPayload>,
	) => void;
	"media:status": (
		payload: MediaStatusPayload,
		acknowledge: RealtimeAckCallback<AttemptMedia>,
	) => void;
	"camera:chunk": (
		payload: DisposableMediaChunkPayload,
		acknowledge: RealtimeAckCallback<AcceptedPayload>,
	) => void;
	"screen:chunk": (
		payload: DisposableMediaChunkPayload,
		acknowledge: RealtimeAckCallback<AcceptedPayload>,
	) => void;
}

/** Events broadcast by the interview room or emitted directly to one socket. */
export interface InterviewServerToClientEvents {
	"attempt:snapshot": (payload: AttemptSnapshot) => void;
	"attempt:state": (payload: AttemptSnapshot) => void;
	"assistant:turn:start": (payload: AssistantTurnPayload) => void;
	"assistant:subtitle": (payload: FinalTextPayload) => void;
	"assistant:audio:chunk": (payload: AssistantAudioChunkPayload) => void;
	"assistant:turn:end": (payload: AssistantTurnPayload) => void;
	"candidate:transcript": (payload: FinalTextPayload) => void;
	"attempt:ended": (payload: AttemptEndedPayload) => void;
	"attempt:error": (payload: RealtimeErrorPayload) => void;
}

export type InterviewSocket = Socket<
	InterviewServerToClientEvents,
	InterviewClientToServerEvents
>;
