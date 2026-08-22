import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WorkspaceMode = "interview" | "recruiter";

type WorkspaceModeState = {
	mode: WorkspaceMode;
	setMode: (mode: WorkspaceMode) => void;
};

/** Keeps the lightweight workspace mode on this browser only. */
export const useWorkspaceModeStore = create<WorkspaceModeState>()(
	persist(
		(set) => ({
			mode: "interview",
			setMode: (mode) => set({ mode }),
		}),
		{ name: "interview-desk-workspace-mode" },
	),
);
