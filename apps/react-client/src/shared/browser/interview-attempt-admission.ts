const STARTED_ATTEMPT_KEY_PREFIX = "interview-desk:started-interview-attempt:";
const ATTEMPT_HANDOFF_KEY_PREFIX = "interview-desk:interview-attempt-handoff:";

const startedInMemory = new Set<string>();
const handoffsInMemory = new Set<string>();

function storageHas(storage: Storage, key: string): boolean {
	try {
		return storage.getItem(key) === "1";
	} catch {
		return false;
	}
}

function storageSet(storage: Storage, key: string): void {
	try {
		storage.setItem(key, "1");
	} catch {
		// The in-memory marker still protects the current page session.
	}
}

function storageRemove(storage: Storage, key: string): void {
	try {
		storage.removeItem(key);
	} catch {
		// The in-memory handoff is still consumed below.
	}
}

/** Returns whether this browser has already opened an attempt. */
export function hasStartedInterviewAttempt(attemptId: string): boolean {
	if (startedInMemory.has(attemptId)) return true;
	return storageHas(
		window.localStorage,
		`${STARTED_ATTEMPT_KEY_PREFIX}${attemptId}`,
	);
}

/** Marks a new attempt and grants its initial lobby-to-room navigation. */
export function prepareInterviewAttemptHandoff(attemptId: string): boolean {
	if (hasStartedInterviewAttempt(attemptId)) return false;

	startedInMemory.add(attemptId);
	handoffsInMemory.add(attemptId);
	storageSet(window.localStorage, `${STARTED_ATTEMPT_KEY_PREFIX}${attemptId}`);
	storageSet(
		window.sessionStorage,
		`${ATTEMPT_HANDOFF_KEY_PREFIX}${attemptId}`,
	);
	return true;
}

/** Checks whether this tab owns the initial lobby-to-room navigation. */
export function hasInterviewAttemptHandoff(attemptId: string): boolean {
	const key = `${ATTEMPT_HANDOFF_KEY_PREFIX}${attemptId}`;
	return (
		(handoffsInMemory.has(attemptId) ||
			storageHas(window.sessionStorage, key)) &&
		hasStartedInterviewAttempt(attemptId)
	);
}

/** Consumes the initial handoff after the live route has accepted it. */
export function consumeInterviewAttemptHandoff(attemptId: string): void {
	const key = `${ATTEMPT_HANDOFF_KEY_PREFIX}${attemptId}`;
	handoffsInMemory.delete(attemptId);
	storageRemove(window.sessionStorage, key);
}
