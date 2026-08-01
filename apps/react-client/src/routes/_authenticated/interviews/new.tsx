import { createFileRoute } from "@tanstack/react-router";
import { CreateInterviewScreen } from "@/features/create-interview";

export const Route = createFileRoute("/_authenticated/interviews/new")({
	component: CreateInterviewScreen,
});
