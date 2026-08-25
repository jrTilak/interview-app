import { Box, Flex, Heading, Text } from "@chakra-ui/react";
import { MonitorX } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Brand } from "@/components/atoms/brand";

export type DesktopSignals = {
	coarsePointer: boolean;
	maxTouchPoints: number;
	platform: string;
	userAgent: string;
	viewportWidth: number;
};

export type DesktopBlockReason = "device" | "viewport" | null;

/** Classifies mobile/tablet devices separately from narrow desktop windows. */
export function getDesktopBlockReason(
	signals: DesktopSignals,
): DesktopBlockReason {
	const mobileUserAgent =
		/android|ipad|iphone|ipod|mobile|silk|tablet|webos/i.test(
			signals.userAgent,
		);
	const disguisedIpad =
		/Mac/i.test(signals.platform) && signals.maxTouchPoints > 1;
	if (mobileUserAgent || disguisedIpad || signals.coarsePointer)
		return "device";
	if (signals.viewportWidth < 1100) return "viewport";
	return null;
}

function readSignals(): DesktopSignals {
	return {
		coarsePointer: window.matchMedia("(pointer: coarse)").matches,
		maxTouchPoints: navigator.maxTouchPoints,
		platform: navigator.platform,
		userAgent: navigator.userAgent,
		viewportWidth: window.innerWidth,
	};
}

/** Prevents routes, protected queries, and media initialization off desktop. */
export function DesktopOnlyGuard({ children }: { children: ReactNode }) {
	const [reason, setReason] = useState<DesktopBlockReason>(() =>
		getDesktopBlockReason(readSignals()),
	);

	useEffect(() => {
		const pointer = window.matchMedia("(pointer: coarse)");
		const update = () => setReason(getDesktopBlockReason(readSignals()));
		window.addEventListener("resize", update);
		pointer.addEventListener("change", update);
		return () => {
			window.removeEventListener("resize", update);
			pointer.removeEventListener("change", update);
		};
	}, []);

	if (!reason) return children;

	const isDevice = reason === "device";
	return (
		<Flex
			bg="paper"
			direction="column"
			justify="space-between"
			minH="100dvh"
			p={{ base: "6", md: "10" }}
		>
			<Brand />
			<Box borderTopColor="line" borderTopWidth="1px" maxW="2xl" pt="8">
				<Box color="cobalt" w="fit-content">
					<MonitorX aria-hidden="true" size={36} />
				</Box>
				<Text
					color="cobalt"
					fontFamily="mono"
					fontSize="xs"
					fontWeight="700"
					letterSpacing="0.1em"
					mt="7"
					textTransform="uppercase"
				>
					Desktop workspace only
				</Text>
				<Heading
					fontSize={{ base: "4xl", md: "6xl" }}
					letterSpacing="-0.045em"
					lineHeight="0.96"
					mt="4"
				>
					{isDevice ? "Continue on a computer." : "Give the room more space."}
				</Heading>
				<Text color="muted" fontSize="lg" lineHeight="1.6" mt="6">
					{isDevice
						? "Interview Desk requires a desktop browser for screen sharing, camera framing, and reliable interview audio. Phones and tablets are not supported."
						: "Widen this desktop window to at least 1100 pixels. Your session has not started and no media was requested."}
				</Text>
			</Box>
			<Text color="muted" fontFamily="mono" fontSize="xs">
				Minimum workspace · 1100 px
			</Text>
		</Flex>
	);
}
