import { Box, chakra, Flex, Text } from "@chakra-ui/react";
import { VideoOff } from "lucide-react";
import { useEffect, useRef } from "react";

type MediaPreviewProps = {
	label: string;
	stream: MediaStream | null;
};

const Video = chakra("video");

/** Attaches a local MediaStream to a muted, non-recording preview element. */
export function MediaPreview({ label, stream }: MediaPreviewProps) {
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
