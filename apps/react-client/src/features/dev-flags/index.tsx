import {
	Box,
	Button,
	Flex,
	Grid,
	Heading,
	Stack,
	Switch,
	Text,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { ErrorState } from "@/components/atoms/error-state";
import { LoadingState } from "@/components/atoms/loading-state";
import { CreatorAppShell } from "@/components/layouts/app-shell";
import { PageHeader } from "@/components/molecules/page-header";
import { useUpdateDevFlags } from "@/shared/api/modules/dev-flags/hooks";
import {
	DEFAULT_DEV_FLAGS,
	type DevFlags,
} from "@/shared/api/modules/dev-flags/lib";
import { devFlagsQueryOptions } from "@/shared/api/modules/dev-flags/queries";
import { parseError } from "@/shared/lib/parse-error";
import { toaster } from "@/shared/lib/toaster";

const groups: Array<{
	title: string;
	flags: Array<{ key: keyof DevFlags; label: string; note: string }>;
}> = [
	{
		title: "Face guard",
		flags: [
			{
				key: "faceDetectionEnabled",
				label: "Face detection",
				note: "Run the browser detector and show face outlines.",
			},
			{
				key: "requireSingleFaceToStart",
				label: "Require one face to start",
				note: "Block the lobby until exactly one face is stable.",
			},
			{
				key: "pauseOnNoFace",
				label: "Pause when face is missing",
				note: "Hide the question and stop candidate input.",
			},
			{
				key: "pauseOnMultipleFaces",
				label: "Pause for multiple faces",
				note: "Resume automatically when one face remains.",
			},
			{
				key: "terminateOnNoFace",
				label: "Terminate with no face",
				note: "End the attempt after the live detector reports zero faces.",
			},
			{
				key: "terminateOnMultipleFaces",
				label: "Terminate with multiple faces",
				note: "End the attempt after the live detector reports two or more.",
			},
		],
	},
	{
		title: "Media",
		flags: [
			{
				key: "requireWholeScreen",
				label: "Entire screen only",
				note: "Reject browser-tab and app-window capture.",
			},
			{
				key: "streamCameraToServer",
				label: "Stream camera chunks",
				note: "Send bounded camera chunks; the server discards them.",
			},
			{
				key: "streamScreenToServer",
				label: "Stream screen chunks",
				note: "Send bounded screen chunks; the server discards them.",
			},
		],
	},
];

/** Edits process-wide development behavior for every connected user. */
export function DevFlagsScreen() {
	const flags = useQuery(devFlagsQueryOptions());
	const update = useUpdateDevFlags();

	const change = async (key: keyof DevFlags, checked: boolean) => {
		try {
			await update.mutateAsync({ [key]: checked });
		} catch (error) {
			toaster.error({
				description: parseError(error, "The flag could not be changed."),
				title: "Update failed",
			});
		}
	};
	const reset = async () => {
		try {
			await update.mutateAsync(DEFAULT_DEV_FLAGS);
		} catch (error) {
			toaster.error({
				description: parseError(error, "The flags could not be reset."),
				title: "Reset failed",
			});
		}
	};

	return (
		<CreatorAppShell>
			<PageHeader
				action={
					<Button
						disabled={!flags.data || update.isPending}
						onClick={() => void reset()}
						variant="outline"
					>
						<RotateCcw aria-hidden="true" size={15} /> Reset
					</Button>
				}
				description="Global, in-memory controls for development and demos."
				eyebrow="Developer tools"
				title="Feature flags"
			/>
			<Flex
				bg="softWarning"
				borderRadius="lg"
				color="warningText"
				fontSize="sm"
				mt="6"
				p="4"
			>
				Changes affect every client connected to this server and reset when the
				server restarts.
			</Flex>

			<Box mt="7">
				{flags.isPending && <LoadingState label="Loading feature flags" />}
				{flags.isError && (
					<ErrorState
						description={parseError(
							flags.error,
							"Development tools may be disabled on this server.",
						)}
						onRetry={() => void flags.refetch()}
						title="Flags unavailable"
					/>
				)}
				{flags.data && (
					<Grid gap="6" templateColumns="repeat(2, minmax(0, 1fr))">
						{groups.map((group) => (
							<Box
								bg="surface"
								borderColor="line"
								borderRadius="xl"
								borderWidth="1px"
								key={group.title}
								p="6"
							>
								<Heading fontFamily="display" fontSize="xl">
									{group.title}
								</Heading>
								<Stack gap="0" mt="4">
									{group.flags.map((flag) => (
										<Switch.Root
											alignItems="center"
											borderTopColor="line"
											borderTopWidth="1px"
											checked={flags.data[flag.key]}
											disabled={update.isPending}
											display="flex"
											justifyContent="space-between"
											key={flag.key}
											onCheckedChange={({ checked }) =>
												void change(flag.key, checked)
											}
											py="4"
										>
											<Switch.HiddenInput />
											<Box pr="5">
												<Switch.Label fontSize="sm" fontWeight="700">
													{flag.label}
												</Switch.Label>
												<Text color="muted" fontSize="xs" mt="1">
													{flag.note}
												</Text>
											</Box>
											<Switch.Control>
												<Switch.Thumb />
											</Switch.Control>
										</Switch.Root>
									))}
								</Stack>
							</Box>
						))}
					</Grid>
				)}
			</Box>
		</CreatorAppShell>
	);
}
