import { ChakraProvider } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { PwaStatus } from "@/components/molecules/pwa-status";
import { AppToaster } from "@/shared/lib/toaster";
import { system } from "@/theme/system";
import { QueryProvider } from "./query-provider";

/** Composes the design system, server-state cache, PWA status, and toasts. */
export function AppProvider({ children }: { children: ReactNode }) {
	return (
		<ChakraProvider value={system}>
			<QueryProvider>
				{children}
				<PwaStatus />
				<AppToaster />
			</QueryProvider>
		</ChakraProvider>
	);
}
