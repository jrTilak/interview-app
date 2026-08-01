import { createFileRoute } from "@tanstack/react-router";
import { InterviewDetailScreen } from "@/features/interview-detail";

export const Route = createFileRoute(
	"/_authenticated/interviews/owned/$interviewId",
)({ component: InterviewDetailRoute });

function InterviewDetailRoute() {
	const { interviewId } = Route.useParams();
	return <InterviewDetailScreen interviewId={interviewId} />;
}
