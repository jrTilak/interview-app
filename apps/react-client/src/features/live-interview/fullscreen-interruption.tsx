import { Box, Button, Flex, Heading, Stack, Text } from "@chakra-ui/react";
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
			role="alert"
		>
			<Flex align="center" justify="space-between">
				<Brand inverted />
				<Text color="accent" fontFamily="mono" fontSize="xs" fontWeight="700">
					INTERVIEW VIEW LOCKED
				</Text>
			</Flex>

			<Box
				borderTopColor="rgba(244,242,236,0.28)"
				borderTopWidth="1px"
				maxW="3xl"
				pt="9"
			>
				<ShieldAlert aria-hidden="true" color="#D6FF4B" size={38} />
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
				<Heading
					fontFamily="display"
					fontSize="6xl"
					letterSpacing="-0.045em"
					lineHeight="0.98"
					mt="4"
				>
					{audioOnly
						? "Enable interview audio."
						: interrupted
							? "Return before continuing."
							: "Enter the focused interview view."}
				</Heading>
				<Text
					color="rgba(244,242,236,0.72)"
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
					<Flex
						borderColor="rgba(244,242,236,0.25)"
						borderYWidth="1px"
						gap="8"
						mt="7"
						py="4"
					>
						<Text fontFamily="mono" fontSize="sm">
							Fullscreen exits · {violations}
						</Text>
						<Text color="rgba(244,242,236,0.65)" fontSize="sm">
							Interview content remains concealed until restored.
						</Text>
					</Flex>
				)}

				<Stack align="flex-start" gap="3" mt="8">
					<Button
						bg="accent"
						color="forest"
						disabled={!supported || pending}
						h="12"
						loading={pending}
						loadingText="Opening fullscreen…"
						onClick={onEnter}
						px="6"
					>
						<Expand aria-hidden="true" size={17} />
						{audioOnly
							? "Enable audio and continue"
							: interrupted
								? "Return to fullscreen"
								: "Enter fullscreen"}
					</Button>
					{!supported && (
						<Text color="#FFB7B2" fontSize="sm">
							Fullscreen is unavailable. Use a recent desktop Chrome or Edge
							browser.
						</Text>
					)}
					{error && (
						<Text color="#FFB7B2" fontSize="sm">
							{error}
						</Text>
					)}
				</Stack>
			</Box>

			<Text color="rgba(244,242,236,0.55)" fontFamily="mono" fontSize="xs">
				Browser safety controls remain available · fullscreen cannot be made
				inescapable
			</Text>
		</Flex>
	);
}
