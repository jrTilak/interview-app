import { createFileRoute } from "@tanstack/react-router";
import { RecruiterInterviewsScreen } from "@/features/recruiter-interviews";

export const Route = createFileRoute("/_authenticated/recruiter/interviews")({
	component: RecruiterInterviewsScreen,
});
