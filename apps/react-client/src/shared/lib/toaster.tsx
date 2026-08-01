import {
	Box,
	CloseButton,
	type CreateToasterReturn,
	createToaster,
	Portal,
	Stack,
	Toast,
	Toaster,
} from "@chakra-ui/react";

export const toaster: CreateToasterReturn = createToaster({
	max: 3,
	pauseOnPageIdle: true,
	placement: "bottom-end",
});

/** Mounts the global zero-radius Chakra notification viewport. */
export function AppToaster() {
	return (
		<Portal>
			<Toaster insetInline="5" toaster={toaster}>
				{(toast) => (
					<Toast.Root
						bg="forest"
						borderColor="accent"
						borderLeftWidth="3px"
						color="paper"
						minW="sm"
					>
						<Toast.Indicator />
						<Stack flex="1" gap="1" maxW="100%">
							{toast.title && <Toast.Title>{toast.title}</Toast.Title>}
							{toast.description && (
								<Toast.Description>{toast.description}</Toast.Description>
							)}
						</Stack>
						{toast.action && (
							<Toast.ActionTrigger>{toast.action.label}</Toast.ActionTrigger>
						)}
						{toast.meta?.closable && (
							<Toast.CloseTrigger asChild>
								<CloseButton color="paper" size="sm" />
							</Toast.CloseTrigger>
						)}
						<Box aria-hidden="true" />
					</Toast.Root>
				)}
			</Toaster>
		</Portal>
	);
}
