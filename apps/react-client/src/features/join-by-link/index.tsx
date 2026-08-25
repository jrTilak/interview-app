import {
	Box,
	Button,
	Card,
	Field,
	Flex,
	Heading,
	Input,
} from "@chakra-ui/react";
import { UuidSchema } from "@interview-desk/validations";
import { useRouter } from "@tanstack/react-router";
import { ArrowRight, Link2 } from "lucide-react";
import { useState } from "react";
import { CreatorAppShell } from "@/components/layouts/app-shell";
import { PageHeader } from "@/components/molecules/page-header";

function readInterviewId(value: string): string | null {
	const trimmed = value.trim();
	const id = UuidSchema.safeParse(trimmed);
	if (id.success) return id.data;
	try {
		const url = new URL(trimmed);
		const match = url.pathname.match(/\/interviews\/([^/]+)(?:\/|$)/);
		const linkedId = UuidSchema.safeParse(match?.[1]);
		return linkedId.success ? linkedId.data : null;
	} catch {
		return null;
	}
}

/** Opens a candidate lobby from either a complete link or an interview ID. */
export function JoinByLinkScreen() {
	const [value, setValue] = useState("");
	const [error, setError] = useState<string | null>(null);
	const router = useRouter();

	const open = async () => {
		const interviewId = readInterviewId(value);
		if (!interviewId) {
			setError("Paste a valid interview link or ID.");
			return;
		}
		setError(null);
		await router.navigate({
			params: { shareCode: interviewId },
			to: "/interviews/$shareCode",
		});
	};

	return (
		<CreatorAppShell title="Join with a link">
			<PageHeader description="Open the device check before entering an interview." />
			<Card.Root mt="8" w="full">
				<Card.Body>
					<Flex align="center" gap="4">
						<Flex
							align="center"
							bg="softAccent"
							color="cobalt"
							h="14"
							justify="center"
							w="14"
						>
							<Link2 aria-hidden="true" size={23} />
						</Flex>
						<Heading fontSize="xl">Interview link</Heading>
					</Flex>
					<Box
						as="form"
						mt="5"
						onSubmit={(event) => {
							event.preventDefault();
							void open();
						}}
						w="full"
					>
						<Field.Root invalid={Boolean(error)} w="full">
							<Field.Label srOnly>Interview link or ID</Field.Label>
							<Flex gap="3" w="full">
								<Input
									autoFocus
									flex="1"
									minW="0"
									onChange={(event) => setValue(event.target.value)}
									placeholder="https://…/interviews/…"
									value={value}
								/>
								<Button flexShrink="0" type="submit">
									Continue <ArrowRight aria-hidden="true" size={16} />
								</Button>
							</Flex>
							{error && <Field.ErrorText>{error}</Field.ErrorText>}
						</Field.Root>
					</Box>
				</Card.Body>
			</Card.Root>
		</CreatorAppShell>
	);
}
