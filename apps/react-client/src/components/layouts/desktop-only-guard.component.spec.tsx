import { ChakraProvider } from "@chakra-ui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { system } from "@/theme/system";
import { DesktopOnlyGuard } from "./desktop-only-guard";

type BrowserSignals = {
	coarsePointer?: boolean;
	maxTouchPoints?: number;
	platform?: string;
	userAgent?: string;
	viewportWidth?: number;
};

function installBrowserSignals({
	coarsePointer = false,
	maxTouchPoints = 0,
	platform = "Linux x86_64",
	userAgent = "Mozilla/5.0 Chrome/140",
	viewportWidth = 1440,
}: BrowserSignals = {}) {
	Object.defineProperties(window.navigator, {
		maxTouchPoints: { configurable: true, value: maxTouchPoints },
		platform: { configurable: true, value: platform },
		userAgent: { configurable: true, value: userAgent },
	});
	Object.defineProperty(window, "innerWidth", {
		configurable: true,
		value: viewportWidth,
		writable: true,
	});
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		value: vi.fn((query: string) => ({
			addEventListener: vi.fn(),
			dispatchEvent: vi.fn(() => false),
			matches: query === "(pointer: coarse)" && coarsePointer,
			media: query,
			onchange: null,
			removeEventListener: vi.fn(),
		})),
	});
}

function renderGuard(child: React.ReactNode) {
	return render(
		<ChakraProvider value={system}>
			<DesktopOnlyGuard>{child}</DesktopOnlyGuard>
		</ChakraProvider>,
	);
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("DesktopOnlyGuard rendering", () => {
	it("renders protected children at the exact minimum desktop width", () => {
		installBrowserSignals({ viewportWidth: 1100 });

		renderGuard(<main>Protected interview route</main>);

		expect(screen.getByText("Protected interview route")).toBeInTheDocument();
		expect(
			screen.queryByText("Desktop workspace only"),
		).not.toBeInTheDocument();
	});

	it("does not render protected children for a mobile device", () => {
		installBrowserSignals({
			userAgent: "Mozilla/5.0 iPhone",
			viewportWidth: 1440,
		});
		const ProtectedRoute = vi.fn(() => <main>Protected interview route</main>);

		renderGuard(<ProtectedRoute />);

		expect(ProtectedRoute).not.toHaveBeenCalled();
		expect(
			screen.queryByText("Protected interview route"),
		).not.toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: "Continue on a computer." }),
		).toBeInTheDocument();
	});

	it("shows the viewport-specific block without rendering protected children", () => {
		installBrowserSignals({ viewportWidth: 1099 });

		renderGuard(<main>Protected interview route</main>);

		expect(
			screen.queryByText("Protected interview route"),
		).not.toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: "Give the room more space." }),
		).toBeInTheDocument();
		expect(screen.getByText(/no media was requested/i)).toBeInTheDocument();
	});

	it("re-evaluates the guard when a desktop window is resized", () => {
		installBrowserSignals({ viewportWidth: 1200 });
		renderGuard(<main>Protected interview route</main>);
		expect(screen.getByText("Protected interview route")).toBeInTheDocument();

		window.innerWidth = 1099;
		fireEvent(window, new Event("resize"));
		expect(
			screen.queryByText("Protected interview route"),
		).not.toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: "Give the room more space." }),
		).toBeInTheDocument();

		window.innerWidth = 1100;
		fireEvent(window, new Event("resize"));
		expect(screen.getByText("Protected interview route")).toBeInTheDocument();
	});
});
