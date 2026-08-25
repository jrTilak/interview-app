import { Box, Flex, Grid, Heading, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { Brand } from "@/components/atoms/brand";

type AuthLayoutProps = {
	children: ReactNode;
	description: string;
	eyebrow: string;
	title: string;
};

/** Frames a focused authentication form beside restrained product context. */
export function AuthLayout({
	children,
	description,
	eyebrow,
	title,
}: AuthLayoutProps) {
	return (
		<Grid minH="100dvh" templateColumns="minmax(0, 1.2fr) minmax(420px, 0.8fr)">
			<Flex
				bg="forest"
				color="paper"
				direction="column"
				justify="space-between"
				minH="100dvh"
				p="12"
			>
				<Brand inverted />
				<Box maxW="2xl">
					<Text
						color="accent"
						fontFamily="mono"
						fontSize="xs"
						fontWeight="700"
						letterSpacing="0.12em"
						textTransform="uppercase"
					>
						Live interview workspace
					</Text>
					<Heading fontSize="5xl" letterSpacing="-0.04em" lineHeight="1" mt="5">
						Clear topics. Natural conversation. One focused room.
					</Heading>
					<Grid
						borderColor="paper/25"
						borderTopWidth="1px"
						gap="6"
						mt="10"
						pt="6"
						templateColumns="repeat(3, 1fr)"
					>
						{[
							["01", "Create"],
							["02", "Share"],
							["03", "Interview"],
						].map(([index, label]) => (
							<Box key={index}>
								<Text color="accent" fontFamily="mono" fontSize="xs">
									{index}
								</Text>
								<Text fontSize="sm" mt="2">
									{label}
								</Text>
							</Box>
						))}
					</Grid>
				</Box>
				<Text color="paper/62" fontFamily="mono" fontSize="xs">
					Desktop PWA · Realtime audio · Session protected
				</Text>
			</Flex>
			<Flex align="center" bg="paper" justify="center" p="12">
				<Box animationStyle="enter-up" maxW="md" w="full">
					<Text
						color="cobalt"
						fontFamily="mono"
						fontSize="xs"
						fontWeight="700"
						letterSpacing="0.12em"
						textTransform="uppercase"
					>
						{eyebrow}
					</Text>
					<Heading fontSize="4xl" letterSpacing="-0.035em" mt="3">
						{title}
					</Heading>
					<Text color="muted" lineHeight="1.6" mt="3">
						{description}
					</Text>
					<Box mt="9">{children}</Box>
				</Box>
			</Flex>
		</Grid>
	);
}
