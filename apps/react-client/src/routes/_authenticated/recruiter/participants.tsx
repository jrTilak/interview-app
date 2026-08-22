import { createFileRoute } from "@tanstack/react-router";
import { RecruiterParticipantsScreen } from "@/features/recruiter-participants";

export const Route = createFileRoute("/_authenticated/recruiter/participants")({
	component: RecruiterParticipantsScreen,
});
