import { ChakraProvider } from "@chakra-ui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { system } from "@/theme/system";
import {
	type AttemptHistoryRow,
	AttemptHistoryTable,
} from "./attempt-history-table";

const rows: AttemptHistoryRow[] = [
	{
		completedQuestionCount: 3,
		createdAt: "2026-08-03T08:00:00.000Z",
		endedAt: "2026-08-03T08:15:00.000Z",
		endReason: "TIME_LIMIT",
		id: "attempt-2",
		primary: "Ada Lovelace",
		secondary: "ada@example.com",
		startedAt: "2026-08-03T08:01:00.000Z",
		state: "COMPLETED",
		totalQuestionCount: 5,
	},
	{
		completedQuestionCount: 1,
		createdAt: "2026-08-03T09:00:00.000Z",
		endedAt: null,
		endReason: null,
		id: "attempt-3",
		primary: "Attempt 2",
		startedAt: "2026-08-03T09:01:00.000Z",
		state: "LISTENING",
		totalQuestionCount: 5,
	},
];

function renderTable(tableRows: AttemptHistoryRow[]) {
	return render(
		<ChakraProvider value={system}>
			<AttemptHistoryTable
				emptyMessage="No attempts have been recorded."
				rows={tableRows}
			/>
		</ChakraProvider>,
	);
}

afterEach(cleanup);

describe("AttemptHistoryTable", () => {
	it("shows participant identity, state, topic progress, and end reason", () => {
		renderTable(rows);

		expect(
			screen.getByRole("table", { name: "Interview attempts" }),
		).toBeInTheDocument();
		expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
		expect(screen.getByText("ada@example.com")).toBeInTheDocument();
		expect(screen.getByText("3 / 5")).toBeInTheDocument();
		expect(screen.getByText("Completed")).toBeInTheDocument();
		expect(screen.getByText("Time limit reached")).toBeInTheDocument();
		expect(screen.getByText("In progress")).toBeInTheDocument();
	});

	it("renders a clear empty state without an empty table", () => {
		renderTable([]);

		expect(
			screen.getByText("No attempts have been recorded."),
		).toBeInTheDocument();
		expect(screen.queryByRole("table")).not.toBeInTheDocument();
	});
});
