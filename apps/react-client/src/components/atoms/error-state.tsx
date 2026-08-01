import { Box, Button, Heading, Text } from "@chakra-ui/react";

type ErrorStateProps = {
	description: string;
	onRetry?: () => void;
	title?: string;
};

/** Renders an honest recoverable error with an optional retry action. */
export function ErrorState({
	description,
	onRetry,
	title = "Something went wrong",
}: ErrorStateProps) {
	return (
		<Box borderColor="line" borderTopWidth="1px" py="10" role="alert">
			<Heading fontFamily="display" fontSize="2xl">
				{title}
			</Heading>
			<Text color="muted" mt="2" maxW="xl">
				{description}
			</Text>
			{onRetry && (
				<Button mt="5" onClick={onRetry} variant="outline">
					Try again
				</Button>
			)}
		</Box>
	);
}
