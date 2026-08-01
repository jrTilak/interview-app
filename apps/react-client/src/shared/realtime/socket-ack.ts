import type {
	InterviewClientToServerEvents,
	InterviewSocket,
	RealtimeAcknowledgement,
	RealtimeErrorPayload,
} from "./protocol";

export class RealtimeRequestError extends Error {
	readonly code: string;
	readonly retryable: boolean;

	constructor(payload: RealtimeErrorPayload) {
		super(payload.message);
		this.name = "RealtimeRequestError";
		this.code = payload.code;
		this.retryable = payload.retryable;
	}
}

type EventName = keyof InterviewClientToServerEvents;

/** Turns one Socket.IO acknowledgement into a bounded typed promise. */
export function emitWithAck<Result>(
	socket: InterviewSocket,
	event: EventName,
	payload: unknown,
	timeoutMs = 10_000,
): Promise<Result> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const timer = window.setTimeout(() => {
			settled = true;
			reject(
				new RealtimeRequestError({
					code: "ACK_TIMEOUT",
					message: "The interview server did not acknowledge the request.",
					retryable: true,
				}),
			);
		}, timeoutMs);

		const emit = socket.emit.bind(socket) as unknown as (
			eventName: string,
			eventPayload: unknown,
			acknowledge: (ack: RealtimeAcknowledgement<Result>) => void,
		) => void;
		emit(event, payload, (acknowledgement) => {
			if (settled) return;
			settled = true;
			window.clearTimeout(timer);
			if (acknowledgement.ok) resolve(acknowledgement.data);
			else reject(new RealtimeRequestError(acknowledgement.error));
		});
	});
}

/** Normalizes Socket.IO browser binary attachments without copying twice. */
export async function toUint8Array(
	data: ArrayBuffer | Blob | Uint8Array,
): Promise<Uint8Array> {
	if (data instanceof Uint8Array) return data;
	if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
	return new Uint8Array(data);
}
