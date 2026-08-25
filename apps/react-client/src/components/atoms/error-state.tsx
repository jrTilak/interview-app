import { Alert, Button } from "@chakra-ui/react";

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
		<Alert.Root role="alert" status="error" variant="surface">
			<Alert.Indicator />
			<Alert.Content>
				<Alert.Title>{title}</Alert.Title>
				<Alert.Description>{description}</Alert.Description>
			</Alert.Content>
			{onRetry && (
				<Button
					colorPalette="red"
					onClick={onRetry}
					size="sm"
					variant="outline"
				>
					Try again
				</Button>
			)}
		</Alert.Root>
	);
}
