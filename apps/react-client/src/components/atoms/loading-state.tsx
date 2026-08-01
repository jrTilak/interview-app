import { Flex, Spinner, Text } from "@chakra-ui/react";

/** Displays a compact, accessible loading state. */
export function LoadingState({ label = "Loading" }: { label?: string }) {
	return (
		<Flex align="center" color="muted" gap="3" minH="32" role="status">
			<Spinner color="cobalt" size="sm" />
			<Text fontSize="sm">{label}</Text>
		</Flex>
	);
}
