import { useRegisterSW } from "virtual:pwa-register/react";
import { Alert, Button } from "@chakra-ui/react";
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
			<Alert.Root
				left="0"
				position="fixed"
				role="alert"
				status="error"
				top="0"
				variant="solid"
				w="full"
				zIndex="toast"
			>
				<Alert.Indicator />
				<Alert.Content>
					<Alert.Description>
						Connection lost. Interviews require an active network connection.
					</Alert.Description>
				</Alert.Content>
			</Alert.Root>
		);
	}

	if (!needRefresh) return null;

	return (
		<Alert.Root
			bottom="5"
			maxW="lg"
			position="fixed"
			right="5"
			role="status"
			status="info"
			variant="solid"
			zIndex="toast"
		>
			<Alert.Indicator />
			<Alert.Content>
				<Alert.Description>
					{joinedAttemptId
						? "An update is ready. It will wait until you leave this interview."
						: "A new Interview Desk version is ready."}
				</Alert.Description>
			</Alert.Content>
			{!joinedAttemptId && (
				<Button
					colorPalette="highlight"
					onClick={() => void updateServiceWorker(true)}
					size="sm"
				>
					Reload
				</Button>
			)}
			<Button
				colorPalette="inverse"
				onClick={() => setNeedRefresh(false)}
				size="sm"
				variant="ghost"
			>
				Later
			</Button>
		</Alert.Root>
	);
}
