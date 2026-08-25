import { ChakraProvider } from "@chakra-ui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { system } from "@/theme/system";
import { AuthProductPreview } from "./auth-product-preview";

afterEach(cleanup);

describe("AuthProductPreview", () => {
	it("shows a concise product summary and feature list", () => {
		render(
			<ChakraProvider value={system}>
				<AuthProductPreview />
			</ChakraProvider>,
		);

		expect(
			screen.getByRole("heading", {
				name: "Focused interviews. Natural conversations.",
			}),
		).toBeInTheDocument();
		expect(screen.getByText("Structured topics")).toBeInTheDocument();
		expect(screen.getByText("Adaptive conversation")).toBeInTheDocument();
		expect(screen.getByText("Voice interviews")).toBeInTheDocument();
		expect(screen.queryByText("01")).not.toBeInTheDocument();
	});
});
