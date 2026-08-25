import {
	Alert,
	Box,
	Button,
	Flex,
	Heading,
	Icon,
	Stack,
	Text,
} from "@chakra-ui/react";
import { Expand, ShieldAlert } from "lucide-react";
import { Brand } from "@/components/atoms/brand";

type FullscreenInterruptionProps = {
	audioOnly?: boolean;
	error: string | null;
	onEnter: () => void;
	pending: boolean;
	supported: boolean;
	violations: number;
};

/** Hides the complete room whenever document fullscreen is not active. */
export function FullscreenInterruption({
	audioOnly = false,
	error,
	onEnter,
	pending,
	supported,
	violations,
}: FullscreenInterruptionProps) {
	const interrupted = violations > 0;
	const label = audioOnly
		? "AUDIO ACTIVATION REQUIRED"
		: interrupted
			? "FULLSCREEN EXIT DETECTED"
			: "FULLSCREEN REQUIRED";
	return (
		<Flex
			bg="forest"
			color="paper"
			direction="column"
			justify="space-between"
			minH="100dvh"
			p="10"
		>
			<Flex align="center" justify="space-between">
				<Brand inverted />
				<Text color="accent" fontFamily="mono" fontSize="xs" fontWeight="700">
					INTERVIEW VIEW LOCKED
				</Text>
			</Flex>

			<Box borderTopColor="paper/25" borderTopWidth="1px" maxW="3xl" pt="9">
				<Icon color="accent" size="2xl">
					<ShieldAlert aria-hidden="true" />
				</Icon>
				<Text
					color="accent"
					fontFamily="mono"
					fontSize="xs"
					fontWeight="700"
					letterSpacing="0.1em"
					mt="7"
				>
					{label}
				</Text>
				<Heading fontSize="6xl" lineHeight="0.98" mt="4">
					{audioOnly
						? "Enable interview audio."
						: interrupted
							? "Return before continuing."
							: "Enter the focused interview view."}
				</Heading>
				<Text
					color="paper/72"
					fontSize="lg"
					lineHeight="1.65"
					maxW="2xl"
					mt="6"
				>
					{audioOnly
						? "Your browser paused interview audio. Use the button below to enable it again before the conversation continues."
						: "The question and transcript stay hidden outside application fullscreen. Browsers always allow Escape for safety, so Interview Desk records the exit locally and requires a fresh click to restore the room. The server deadline continues."}
				</Text>

				{interrupted && !audioOnly && (
					<Flex borderColor="paper/25" borderYWidth="1px" gap="8" mt="7" py="4">
						<Text fontFamily="mono" fontSize="sm">
							Fullscreen exits · {violations}
						</Text>
						<Text color="paper/65" fontSize="sm">
							Interview content remains concealed until restored.
						</Text>
					</Flex>
				)}

				<Stack align="flex-start" gap="3" mt="8">
					<Button
						colorPalette="highlight"
						disabled={!supported || pending}
						loading={pending}
						loadingText="Opening fullscreen…"
						onClick={onEnter}
						size="lg"
					>
						<Expand aria-hidden="true" size={17} />
						{audioOnly
							? "Enable audio and continue"
							: interrupted
								? "Return to fullscreen"
								: "Enter fullscreen"}
					</Button>
					{(!supported || error) && (
						<Alert.Root role="alert" status="error" variant="solid">
							<Alert.Indicator />
							<Alert.Content>
								<Alert.Description>
									{error ??
										"Fullscreen is unavailable. Use a recent desktop Chrome or Edge browser."}
								</Alert.Description>
							</Alert.Content>
						</Alert.Root>
					)}
				</Stack>
			</Box>

			<Text color="paper/55" fontFamily="mono" fontSize="xs">
				Browser safety controls remain available · fullscreen cannot be made
				inescapable
			</Text>
		</Flex>
	);
}
