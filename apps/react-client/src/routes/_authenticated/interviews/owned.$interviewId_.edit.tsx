import { createFileRoute } from "@tanstack/react-router";
import { EditInterviewScreen } from "@/features/edit-interview";

export const Route = createFileRoute(
	"/_authenticated/interviews/owned/$interviewId_/edit",
)({
	component: EditInterviewRoute,
});

function EditInterviewRoute() {
	const { interviewId } = Route.useParams();
	return <EditInterviewScreen interviewId={interviewId} />;
}
