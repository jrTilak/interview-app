import { Badge, Box, chakra, Flex, Text } from "@chakra-ui/react";
import { VideoOff } from "lucide-react";
import { useEffect, useRef } from "react";
import type { FaceDetectionSnapshot } from "@/shared/media/face-detection";

type MediaPreviewProps = {
	faceDetection?: FaceDetectionSnapshot;
	label: string;
	stream: MediaStream | null;
};

const Video = chakra("video");
const DetectionOverlay = chakra("svg");
const FaceBox = chakra("rect");

/** Attaches a local MediaStream to a muted, non-recording preview element. */
export function MediaPreview({
	faceDetection,
	label,
	stream,
}: MediaPreviewProps) {
	const video = useRef<HTMLVideoElement>(null);

	useEffect(() => {
		if (!video.current) return;
		video.current.srcObject = stream;
		if (stream) void video.current.play().catch(() => undefined);
		return () => {
			if (video.current) video.current.srcObject = null;
		};
	}, [stream]);

	return (
		<Box bg="forest" minH="40" overflow="hidden" position="relative">
			{stream ? (
				<Video
					autoPlay
					h="full"
					inset="0"
					muted
					objectFit="cover"
					playsInline
					position="absolute"
					ref={video}
					w="full"
				/>
			) : (
				<Flex
					align="center"
					color="paper/55"
					direction="column"
					gap="3"
					inset="0"
					justify="center"
					position="absolute"
				>
					<VideoOff aria-hidden="true" size={22} />
					<Text fontSize="xs">Not connected</Text>
				</Flex>
			)}
			{stream &&
				faceDetection &&
				faceDetection.width > 0 &&
				faceDetection.height > 0 && (
					<DetectionOverlay
						aria-hidden="true"
						inset="0"
						pointerEvents="none"
						position="absolute"
						preserveAspectRatio="xMidYMid slice"
						viewBox={`0 0 ${faceDetection.width} ${faceDetection.height}`}
					>
						{faceDetection.boxes.map((box) => (
							<FaceBox
								fill="none"
								height={box.height}
								key={`${box.x}-${box.y}-${box.width}-${box.height}`}
								stroke={
									faceDetection.status === "single" ? "success" : "danger"
								}
								strokeWidth="7"
								width={box.width}
								x={box.x}
								y={box.y}
							/>
						))}
					</DetectionOverlay>
				)}
			{faceDetection && faceDetection.status !== "disabled" && (
				<Badge
					colorPalette={
						faceDetection.status === "single"
							? "green"
							: faceDetection.status === "initializing"
								? "gray"
								: "red"
					}
					position="absolute"
					right="2"
					top="2"
					variant="solid"
				>
					{faceDetection.status === "single"
						? "1 FACE"
						: faceDetection.status === "multiple"
							? `${faceDetection.count} FACES`
							: faceDetection.status === "no-face"
								? "NO FACE"
								: faceDetection.status === "error"
									? "DETECTOR ERROR"
									: "CHECKING"}
				</Badge>
			)}
			<Text
				bg="forest/85"
				bottom="0"
				color="paper"
				fontFamily="mono"
				fontSize="2xs"
				left="0"
				letterSpacing="0.08em"
				px="3"
				py="2"
				position="absolute"
				textTransform="uppercase"
			>
				{label}
			</Text>
		</Box>
	);
}
