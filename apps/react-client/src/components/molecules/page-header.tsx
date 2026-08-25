import { Box, Grid, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

type PageHeaderProps = {
	action?: ReactNode;
	description: string;
};

/** Aligns supporting page context and its primary action. */
export function PageHeader({ action, description }: PageHeaderProps) {
	return (
		<Grid alignItems="center" gap="8" templateColumns="1fr minmax(0, 2fr) 1fr">
			<Text
				color="muted"
				gridColumn="2"
				justifySelf="center"
				maxW="2xl"
				textAlign="center"
			>
				{description}
			</Text>
			{action && (
				<Box gridColumn="3" justifySelf="end">
					{action}
				</Box>
			)}
		</Grid>
	);
}
