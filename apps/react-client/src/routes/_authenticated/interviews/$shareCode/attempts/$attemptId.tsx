import { createFileRoute } from "@tanstack/react-router";
import { LiveInterviewScreen } from "@/features/live-interview";

export const Route = createFileRoute(
	"/_authenticated/interviews/$shareCode/attempts/$attemptId",
)({ component: LiveInterviewRoute });

function LiveInterviewRoute() {
	const { attemptId, shareCode } = Route.useParams();
	return <LiveInterviewScreen attemptId={attemptId} shareCode={shareCode} />;
}
