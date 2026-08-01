import { CreatorAppShell } from "@/components/layouts/app-shell";
import { PageHeader } from "@/components/molecules/page-header";
import { CreateInterviewForm } from "./create-interview-form";

/** Renders the focused interview creation workflow. */
export function CreateInterviewScreen() {
	return (
		<CreatorAppShell>
			<PageHeader
				description="Give the interviewer context and rough notes. Gemini structures them into a private task list before anything is shared."
				eyebrow="New interview"
				title="Design the conversation"
			/>
			<div style={{ marginTop: "2.5rem" }}>
				<CreateInterviewForm />
			</div>
		</CreatorAppShell>
	);
}
