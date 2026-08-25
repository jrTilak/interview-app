import {
	Box,
	Button,
	Card,
	Field,
	Flex,
	Heading,
	Input,
} from "@chakra-ui/react";
import { useRouter } from "@tanstack/react-router";
import { ArrowRight, Link2 } from "lucide-react";
import { useState } from "react";
import { CreatorAppShell } from "@/components/layouts/app-shell";
import { PageHeader } from "@/components/molecules/page-header";

const SHARE_CODE_PATTERN = /^[A-Za-z0-9_-]{32}$/;

function readShareCode(value: string): string | null {
	const trimmed = value.trim();
	if (SHARE_CODE_PATTERN.test(trimmed)) return trimmed;
	try {
		const url = new URL(trimmed);
		const match = url.pathname.match(
			/\/interviews\/([A-Za-z0-9_-]{32})(?:\/|$)/,
		);
		return match?.[1] ?? null;
	} catch {
		return null;
	}
}

/** Opens a candidate lobby from either a complete link or a share code. */
export function JoinByLinkScreen() {
	const [value, setValue] = useState("");
	const [error, setError] = useState<string | null>(null);
	const router = useRouter();

	const open = async () => {
		const shareCode = readShareCode(value);
		if (!shareCode) {
			setError("Paste a valid interview link or 32-character code.");
			return;
		}
		setError(null);
		await router.navigate({
			params: { shareCode },
			to: "/interviews/$shareCode",
		});
	};

	return (
		<CreatorAppShell>
			<PageHeader
				description="Open the device check before entering an interview."
				eyebrow="Interview mode"
				title="Join with a link"
			/>
			<Card.Root mt="8">
				<Card.Body>
					<Flex align="center" gap="8">
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
						<Box flex="1">
							<Heading fontSize="xl">Interview link</Heading>
							<form
								onSubmit={(event) => {
									event.preventDefault();
									void open();
								}}
							>
								<Field.Root invalid={Boolean(error)} mt="4">
									<Field.Label srOnly>Interview link or code</Field.Label>
									<Flex gap="3">
										<Input
											autoFocus
											onChange={(event) => setValue(event.target.value)}
											placeholder="https://…/interviews/…"
											value={value}
										/>
										<Button type="submit">
											Continue <ArrowRight aria-hidden="true" size={16} />
										</Button>
									</Flex>
									{error && <Field.ErrorText>{error}</Field.ErrorText>}
								</Field.Root>
							</form>
						</Box>
					</Flex>
				</Card.Body>
			</Card.Root>
		</CreatorAppShell>
	);
}
