import { Box, Flex, Table, Text } from "@chakra-ui/react";
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

const attemptStatePresentation: Record<
	AttemptHistoryRow["state"],
	{ color: string; label: string }
> = {
	ASSISTANT_SPEAKING: { color: "cobalt", label: "In progress" },
	COMPLETED: { color: "success", label: "Completed" },
	ENDING: { color: "cobalt", label: "Finishing" },
	FAILED: { color: "danger", label: "Failed" },
	LISTENING: { color: "cobalt", label: "In progress" },
	PROCESSING: { color: "cobalt", label: "In progress" },
	READY: { color: "muted", label: "Ready" },
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
			<Box borderColor="line" borderTopWidth="1px" color="muted" py="8">
				{emptyMessage}
			</Box>
		);
	}

	return (
		<Table.ScrollArea borderColor="line" borderTopWidth="1px">
			<Table.Root aria-label="Interview attempts" size="sm">
				<Table.Header>
					<Table.Row>
						<ColumnHeader>Attempt</ColumnHeader>
						<ColumnHeader>Status</ColumnHeader>
						<ColumnHeader>Progress</ColumnHeader>
						<ColumnHeader>Started</ColumnHeader>
						<ColumnHeader>Finished</ColumnHeader>
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
									<Flex align="center" gap="2">
										<Box bg={status.color} h="2" w="2" />
										<Text fontWeight="600">{status.label}</Text>
									</Flex>
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

function ColumnHeader({ children }: { children: React.ReactNode }) {
	return (
		<Table.ColumnHeader
			color="muted"
			fontFamily="mono"
			fontSize="2xs"
			py="3"
			textTransform="uppercase"
		>
			{children}
		</Table.ColumnHeader>
	);
}
