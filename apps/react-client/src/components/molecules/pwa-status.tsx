import { useRegisterSW } from "virtual:pwa-register/react";
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { useInterviewRoomStore } from "@/stores/interview-room.store";

/** Reports connectivity and safely defers service-worker reloads during a room. */
export function PwaStatus() {
	const joinedAttemptId = useInterviewRoomStore(
		(state) => state.connection.joinedAttemptId,
	);
	const [online, setOnline] = useState(navigator.onLine);
	const {
		needRefresh: [needRefresh, setNeedRefresh],
		updateServiceWorker,
	} = useRegisterSW();

	useEffect(() => {
		const markOnline = () => setOnline(true);
		const markOffline = () => setOnline(false);
		window.addEventListener("online", markOnline);
		window.addEventListener("offline", markOffline);
		return () => {
			window.removeEventListener("online", markOnline);
			window.removeEventListener("offline", markOffline);
		};
	}, []);

	if (!online) {
		return (
			<Box
				bg="danger"
				color="white"
				fontSize="sm"
				left="0"
				position="fixed"
				py="2"
				textAlign="center"
				top="0"
				w="full"
				zIndex="toast"
			>
				Connection lost. Interviews require an active network connection.
			</Box>
		);
	}

	if (!needRefresh) return null;

	return (
		<Flex
			align="center"
			bg="forest"
			borderLeftColor="accent"
			borderLeftWidth="3px"
			bottom="5"
			color="paper"
			gap="5"
			maxW="lg"
			p="4"
			position="fixed"
			right="5"
			zIndex="toast"
		>
			<Text flex="1" fontSize="sm">
				{joinedAttemptId
					? "An update is ready. It will wait until you leave this interview."
					: "A new Interview Desk version is ready."}
			</Text>
			{!joinedAttemptId && (
				<Button
					bg="accent"
					color="forest"
					onClick={() => void updateServiceWorker(true)}
					size="sm"
				>
					Reload
				</Button>
			)}
			<Button
				color="paper"
				onClick={() => setNeedRefresh(false)}
				size="sm"
				variant="ghost"
			>
				Later
			</Button>
		</Flex>
	);
}
