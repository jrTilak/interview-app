import { Box, Flex, Text } from "@chakra-ui/react";

type BrandProps = { compact?: boolean; inverted?: boolean };

/** Renders the Interview Desk wordmark without a remote image dependency. */
export function Brand({ compact = false, inverted = false }: BrandProps) {
	return (
		<Flex align="center" gap="3" aria-label="Interview Desk">
			<Box
				aria-hidden="true"
				bg={inverted ? "accent" : "forest"}
				h="8"
				position="relative"
				w="8"
			>
				<Box
					bg={inverted ? "forest" : "accent"}
					h="1.5"
					left="1.5"
					position="absolute"
					top="1.5"
					w="5"
				/>
				<Box
					bg={inverted ? "forest" : "accent"}
					h="1.5"
					left="1.5"
					position="absolute"
					top="4"
					w="3"
				/>
				<Box
					bg={inverted ? "forest" : "accent"}
					h="1.5"
					left="1.5"
					position="absolute"
					top="6"
					w="5"
				/>
			</Box>
			{!compact && (
				<Text
					color={inverted ? "paper" : "forest"}
					fontFamily="display"
					fontSize="lg"
					fontWeight="700"
					letterSpacing="-0.02em"
				>
					Interview Desk
				</Text>
			)}
		</Flex>
	);
}
