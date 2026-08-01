import { createFileRoute } from "@tanstack/react-router";
import { JoinInterviewScreen } from "@/features/join-interview";

export const Route = createFileRoute("/_authenticated/interviews/$shareCode/")({
	component: JoinInterviewRoute,
});

function JoinInterviewRoute() {
	const { shareCode } = Route.useParams();
	return <JoinInterviewScreen shareCode={shareCode} />;
}
