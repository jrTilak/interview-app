import { Box, chakra, Flex, Text } from "@chakra-ui/react";
import { VideoOff } from "lucide-react";
import { useEffect, useRef } from "react";
import type { FaceDetectionSnapshot } from "@/shared/media/face-detection";

type MediaPreviewProps = {
	faceDetection?: FaceDetectionSnapshot;
	label: string;
	stream: MediaStream | null;
};

const Video = chakra("video");

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
		<Box
			bg="forest"
			borderRadius="lg"
			minH="40"
			overflow="hidden"
			position="relative"
		>
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
					color="rgba(244,242,236,0.55)"
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
					<svg
						aria-hidden="true"
						preserveAspectRatio="xMidYMid slice"
						style={{
							inset: 0,
							pointerEvents: "none",
							position: "absolute",
						}}
						viewBox={`0 0 ${faceDetection.width} ${faceDetection.height}`}
					>
						{faceDetection.boxes.map((box) => (
							<rect
								fill="none"
								height={box.height}
								key={`${box.x}-${box.y}-${box.width}-${box.height}`}
								rx="14"
								stroke={
									faceDetection.status === "single" ? "#8BE28B" : "#FF776F"
								}
								strokeWidth="7"
								width={box.width}
								x={box.x}
								y={box.y}
							/>
						))}
					</svg>
				)}
			{faceDetection && faceDetection.status !== "disabled" && (
				<Text
					bg={
						faceDetection.status === "single"
							? "success"
							: faceDetection.status === "initializing"
								? "rgba(17,24,21,0.82)"
								: "danger"
					}
					color="white"
					fontSize="2xs"
					fontWeight="700"
					letterSpacing="0.05em"
					px="2.5"
					py="1.5"
					position="absolute"
					right="2"
					top="2"
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
				</Text>
			)}
			<Text
				bg="rgba(17,24,21,0.85)"
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
