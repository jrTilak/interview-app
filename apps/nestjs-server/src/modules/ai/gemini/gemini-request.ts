/** Builds one bounded Gemini request signal, including caller cancellation. */
export function geminiRequestOptions(
	timeoutMs: number,
	externalSignal?: AbortSignal,
) {
	const timeoutSignal = AbortSignal.timeout(timeoutMs);
	return {
		maxRetries: 1,
		fetchOptions: {
			signal: externalSignal
				? AbortSignal.any([externalSignal, timeoutSignal])
				: timeoutSignal,
		},
	};
}

/** Rejects failed, incomplete, cancelled, or otherwise unexpected interactions. */
export function assertGeminiInteractionStatus(
	status: string | undefined,
	allowRequiresAction = false,
): void {
	if (status === "completed") return;
	if (allowRequiresAction && status === "requires_action") return;
	throw new Error(
		`Gemini interaction ended with status: ${status ?? "missing"}`,
	);
}
