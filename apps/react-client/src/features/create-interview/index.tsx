import { CreatorAppShell } from "@/components/layouts/app-shell";
import { PageHeader } from "@/components/molecules/page-header";
import { CreateInterviewForm } from "./create-interview-form";

/** Renders the focused interview creation workflow. */
export function CreateInterviewScreen() {
	return (
		<CreatorAppShell>
			<PageHeader
				description="Set the brief, timing, and topics to explore."
				eyebrow="Recruiter mode"
				title="New interview"
			/>
			<div style={{ marginTop: "2.5rem" }}>
				<CreateInterviewForm />
			</div>
		</CreatorAppShell>
	);
}
