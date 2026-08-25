import { EmptyState, Status, Table, Text } from "@chakra-ui/react";
import { formatDateTime } from "@/shared/lib/format";

export type AttemptHistoryRow = {
	completedQuestionCount: number;
	createdAt: string;
	endedAt: string | null;
	endReason: "AI_COMPLETED" | "TIME_LIMIT" | null;
	id: string;
	primary: string;
	secondary?: string;
	startedAt: string | null;
	state:
		| "READY"
		| "ASSISTANT_SPEAKING"
		| "LISTENING"
		| "PROCESSING"
		| "ENDING"
		| "COMPLETED"
		| "FAILED";
	totalQuestionCount: number;
};

export const attemptStatePresentation: Record<
	AttemptHistoryRow["state"],
	{ colorPalette: "brand" | "gray" | "green" | "red"; label: string }
> = {
	ASSISTANT_SPEAKING: { colorPalette: "brand", label: "In progress" },
	COMPLETED: { colorPalette: "green", label: "Completed" },
	ENDING: { colorPalette: "brand", label: "Finishing" },
	FAILED: { colorPalette: "red", label: "Failed" },
	LISTENING: { colorPalette: "brand", label: "In progress" },
	PROCESSING: { colorPalette: "brand", label: "In progress" },
	READY: { colorPalette: "gray", label: "Ready" },
};

const endReasonLabel: Record<
	Exclude<AttemptHistoryRow["endReason"], null>,
	string
> = {
	AI_COMPLETED: "Finished by interviewer",
	TIME_LIMIT: "Time limit reached",
};

/** Renders the same compact attempt facts for creator and candidate histories. */
export function AttemptHistoryTable({
	emptyMessage,
	rows,
}: {
	emptyMessage: string;
	rows: AttemptHistoryRow[];
}) {
	if (rows.length === 0) {
		return (
			<EmptyState.Root size="sm">
				<EmptyState.Content>
					<EmptyState.Description>{emptyMessage}</EmptyState.Description>
				</EmptyState.Content>
			</EmptyState.Root>
		);
	}

	return (
		<Table.ScrollArea borderColor="line" borderTopWidth="1px">
			<Table.Root aria-label="Interview attempts" size="sm">
				<Table.Header>
					<Table.Row>
						<Table.ColumnHeader>Attempt</Table.ColumnHeader>
						<Table.ColumnHeader>Status</Table.ColumnHeader>
						<Table.ColumnHeader>Topics</Table.ColumnHeader>
						<Table.ColumnHeader>Started</Table.ColumnHeader>
						<Table.ColumnHeader>Finished</Table.ColumnHeader>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{rows.map((row) => {
						const status = attemptStatePresentation[row.state];
						return (
							<Table.Row key={row.id}>
								<Table.Cell minW="220px" py="4">
									<Text fontWeight="700">{row.primary}</Text>
									{row.secondary && (
										<Text color="muted" fontSize="xs" mt="1">
											{row.secondary}
										</Text>
									)}
									<Text color="muted" fontFamily="mono" fontSize="2xs" mt="1">
										Created {formatDateTime(row.createdAt)}
									</Text>
								</Table.Cell>
								<Table.Cell minW="118px">
									<Status.Root colorPalette={status.colorPalette}>
										<Status.Indicator />
										<Text fontWeight="600">{status.label}</Text>
									</Status.Root>
								</Table.Cell>
								<Table.Cell fontFamily="mono" minW="92px">
									{row.completedQuestionCount} / {row.totalQuestionCount}
								</Table.Cell>
								<Table.Cell color="muted" minW="154px">
									{row.startedAt
										? formatDateTime(row.startedAt)
										: "Not started"}
								</Table.Cell>
								<Table.Cell minW="174px">
									<Text color={row.endedAt ? "ink" : "muted"}>
										{row.endedAt ? formatDateTime(row.endedAt) : "—"}
									</Text>
									{row.endReason && (
										<Text color="muted" fontSize="xs" mt="1">
											{endReasonLabel[row.endReason]}
										</Text>
									)}
								</Table.Cell>
							</Table.Row>
						);
					})}
				</Table.Body>
			</Table.Root>
		</Table.ScrollArea>
	);
}
