import { Box, Button, Heading, Text } from "@chakra-ui/react";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	Link,
	Outlet,
} from "@tanstack/react-router";
import { Brand } from "@/components/atoms/brand";
import { parseError } from "@/shared/lib/parse-error";

export type RouterContext = { queryClient: QueryClient };

export const Route = createRootRouteWithContext<RouterContext>()({
	component: Outlet,
	errorComponent: ({ error, reset }) => (
		<Box bg="paper" minH="100dvh" p="10">
			<Brand />
			<Box borderTopColor="line" borderTopWidth="1px" maxW="2xl" mt="16" pt="8">
				<Text color="cobalt" fontFamily="mono" fontSize="xs">
					ROUTE ERROR
				</Text>
				<Heading fontSize="4xl" mt="3">
					This workspace could not be opened.
				</Heading>
				<Text color="muted" mt="3">
					{parseError(error, "Try loading this page again.")}
				</Text>
				<Button mt="6" onClick={reset} variant="outline">
					Try again
				</Button>
			</Box>
		</Box>
	),
	notFoundComponent: () => (
		<Box bg="paper" minH="100dvh" p="10">
			<Brand />
			<Box borderTopColor="line" borderTopWidth="1px" maxW="2xl" mt="16" pt="8">
				<Text color="cobalt" fontFamily="mono" fontSize="xs">
					404 · NOT FOUND
				</Text>
				<Heading fontSize="4xl" mt="3">
					That interview route does not exist.
				</Heading>
				<Button asChild mt="6" variant="outline">
					<Link to="/">Return to Interview Desk</Link>
				</Button>
			</Box>
		</Box>
	),
});
