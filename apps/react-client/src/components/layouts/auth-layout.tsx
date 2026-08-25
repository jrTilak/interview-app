import { Box, Flex, Grid, Heading } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { Brand } from "@/components/atoms/brand";
import { AuthProductPreview } from "@/components/molecules/auth-product-preview";

type AuthLayoutProps = {
	children: ReactNode;
	title: string;
};

/** Frames a focused authentication form beside restrained product context. */
export function AuthLayout({ children, title }: AuthLayoutProps) {
	return (
		<Grid minH="100dvh" templateColumns="minmax(0, 1.2fr) minmax(420px, 0.8fr)">
			<Flex bg="forest" color="paper" direction="column" minH="100dvh" p="12">
				<Brand inverted />
				<AuthProductPreview />
			</Flex>
			<Flex align="center" bg="paper" justify="center" p="12">
				<Box animationStyle="enter-up" maxW="md" w="full">
					<Heading fontSize="4xl" letterSpacing="-0.035em">
						{title}
					</Heading>
					<Box mt="9">{children}</Box>
				</Box>
			</Flex>
		</Grid>
	);
}
