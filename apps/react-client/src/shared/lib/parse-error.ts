import { isAxiosError } from "axios";

type MessageShape = { message?: unknown };

/** Returns a safe user-facing message from API and validation failures. */
export function parseError(error: unknown, fallback: string): string {
	if (isAxiosError(error)) {
		const responseData = error.response?.data as MessageShape | undefined;
		if (typeof responseData?.message === "string") {
			return responseData.message;
		}
		if (!error.response) {
			return "The server is unreachable. Check your connection and try again.";
		}
	}

	if (
		typeof error === "object" &&
		error !== null &&
		"message" in error &&
		typeof (error as MessageShape).message === "string"
	) {
		return (error as { message: string }).message;
	}

	return fallback;
}

/** Extracts the first message from TanStack Form's Standard Schema issues. */
export function firstFormError(errors: readonly unknown[]): string | null {
	for (const error of errors) {
		if (typeof error === "string") return error;
		if (
			typeof error === "object" &&
			error !== null &&
			"message" in error &&
			typeof (error as MessageShape).message === "string"
		) {
			return (error as { message: string }).message;
		}
	}
	return null;
}
