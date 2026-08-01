import { RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { DesktopOnlyGuard } from "@/components/layouts/desktop-only-guard";
import { AppProvider } from "@/provider/app-provider";
import { router } from "@/router";
import "@/styles/global.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Application root element is missing");

createRoot(rootElement).render(
	<AppProvider>
		<DesktopOnlyGuard>
			<RouterProvider router={router} />
		</DesktopOnlyGuard>
	</AppProvider>,
);
