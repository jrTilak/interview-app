import { Box } from "@chakra-ui/react";
import { CreatorAppShell } from "@/components/layouts/app-shell";
import { PageHeader } from "@/components/molecules/page-header";
import { CreateInterviewForm } from "./create-interview-form";

/** Renders the focused interview creation workflow. */
export function CreateInterviewScreen() {
	return (
		<CreatorAppShell title="New interview">
			<PageHeader description="Set the brief, timing, and topics to explore." />
			<Box mt="10">
				<CreateInterviewForm />
			</Box>
		</CreatorAppShell>
	);
}
