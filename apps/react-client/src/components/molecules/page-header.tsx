import { Box, Flex, Heading, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

type PageHeaderProps = {
	action?: ReactNode;
	description: string;
	eyebrow: string;
	title: string;
};

/** Aligns page identity and its primary action to the workspace grid. */
export function PageHeader({
	action,
	description,
	eyebrow,
	title,
}: PageHeaderProps) {
	return (
		<Flex align="flex-end" gap="8" justify="space-between">
			<Box>
				<Text
					color="cobalt"
					fontFamily="mono"
					fontSize="xs"
					fontWeight="700"
					letterSpacing="0.1em"
					textTransform="uppercase"
				>
					{eyebrow}
				</Text>
				<Heading fontSize="4xl" letterSpacing="-0.035em" mt="2">
					{title}
				</Heading>
				<Text color="muted" maxW="2xl" mt="2">
					{description}
				</Text>
			</Box>
			{action}
		</Flex>
	);
}
