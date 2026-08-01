import { useCallback, useEffect, useState } from "react";

export type InterviewFullscreenState = {
	active: boolean;
	error: string | null;
	pending: boolean;
	supported: boolean;
	violations: number;
};

/** Detects the standards-based Fullscreen API required by the interview room. */
export function canUseInterviewFullscreen(target = document): boolean {
	return (
		target.fullscreenEnabled !== false &&
		typeof target.documentElement.requestFullscreen === "function"
	);
}

/** Enters element fullscreen from a user gesture and asks the browser to hide navigation UI. */
export async function requestInterviewFullscreen(
	target = document,
): Promise<void> {
	if (!canUseInterviewFullscreen(target)) {
		throw new Error(
			"Fullscreen is unavailable. Use a recent desktop Chrome or Edge browser.",
		);
	}
	await target.documentElement.requestFullscreen({ navigationUI: "hide" });
}

/** Releases application fullscreen when the candidate leaves the live route. */
export async function exitInterviewFullscreen(
	target = document,
): Promise<void> {
	if (target.fullscreenElement && typeof target.exitFullscreen === "function") {
		await target.exitFullscreen();
	}
}

/** Observes fullscreen exits so the live route can hide every interview detail. */
export function useInterviewFullscreen(): InterviewFullscreenState & {
	enter: () => Promise<void>;
} {
	const [state, setState] = useState<InterviewFullscreenState>(() => ({
		active: Boolean(document.fullscreenElement),
		error: null,
		pending: false,
		supported: canUseInterviewFullscreen(),
		violations: 0,
	}));

	useEffect(() => {
		const handleChange = () => {
			const active = Boolean(document.fullscreenElement);
			setState((current) => ({
				...current,
				active,
				error: null,
				pending: false,
				violations:
					current.active && !active
						? current.violations + 1
						: current.violations,
			}));
		};
		const handleError = () => {
			setState((current) => ({
				...current,
				active: false,
				error:
					"The browser did not allow fullscreen. Try again from this button.",
				pending: false,
			}));
		};
		document.addEventListener("fullscreenchange", handleChange);
		document.addEventListener("fullscreenerror", handleError);
		return () => {
			document.removeEventListener("fullscreenchange", handleChange);
			document.removeEventListener("fullscreenerror", handleError);
		};
	}, []);

	useEffect(
		() => () => {
			void exitInterviewFullscreen().catch(() => undefined);
		},
		[],
	);

	const enter = useCallback(async () => {
		setState((current) => ({ ...current, error: null, pending: true }));
		try {
			await requestInterviewFullscreen();
			setState((current) => ({
				...current,
				active: Boolean(document.fullscreenElement),
				pending: false,
			}));
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "The browser did not allow fullscreen.";
			setState((current) => ({
				...current,
				active: false,
				error: message,
				pending: false,
			}));
			throw error;
		}
	}, []);

	return { ...state, enter };
}
