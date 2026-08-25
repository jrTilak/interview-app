import { createFileRoute } from "@tanstack/react-router";
import { InterviewParticipantsScreen } from "@/features/interview-participants";

export const Route = createFileRoute(
	"/_authenticated/interviews/owned/$interviewId_/participants",
)({ component: InterviewParticipantsRoute });

function InterviewParticipantsRoute() {
	const { interviewId } = Route.useParams();
	return <InterviewParticipantsScreen interviewId={interviewId} />;
}
