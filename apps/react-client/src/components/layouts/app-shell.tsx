import {
	Box,
	Button,
	Link as ChakraLink,
	Flex,
	Heading,
	Text,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { FilePlus2, LayoutList, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { Brand } from "@/components/atoms/brand";
import { useSignOut } from "@/shared/api/modules/auth/hooks";
import type { AuthSession } from "@/shared/api/modules/auth/lib";
import { sessionQueryOptions } from "@/shared/api/modules/auth/queries";
import { parseError } from "@/shared/lib/parse-error";
import { toaster } from "@/shared/lib/toaster";
import { useInterviewRoomStore } from "@/stores/interview-room.store";

type AppShellProps = {
	children: ReactNode;
	session: Exclude<AuthSession, null>;
};

/** Loads the protected session before rendering a creator workspace page. */
export function CreatorAppShell({ children }: { children: ReactNode }) {
	const session = useQuery(sessionQueryOptions());
	if (!session.data) return null;
	return <AppShell session={session.data}>{children}</AppShell>;
}

const navigation = [
	{ icon: LayoutList, label: "Interviews", to: "/dashboard" as const },
	{ icon: FilePlus2, label: "Create new", to: "/interviews/new" as const },
];

/** Renders the creator workspace navigation around one focused page. */
export function AppShell({ children, session }: AppShellProps) {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const router = useRouter();
	const logout = useSignOut();
	const resetRoom = useInterviewRoomStore((state) => state.reset);

	const handleLogout = async () => {
		try {
			await logout.mutateAsync();
			resetRoom();
			await router.invalidate();
			await router.navigate({
				replace: true,
				search: { redirect: undefined },
				to: "/login",
			});
		} catch (error) {
			toaster.error({
				description: parseError(error, "Unable to sign out."),
				title: "Sign out failed",
			});
		}
	};

	return (
		<Flex bg="paper" minH="100dvh">
			<Flex
				bg="forest"
				color="paper"
				direction="column"
				justify="space-between"
				minH="100dvh"
				position="sticky"
				px="6"
				py="7"
				top="0"
				w="248px"
			>
				<Box>
					<Brand inverted />
					<Box as="nav" aria-label="Primary" mt="12">
						{navigation.map(({ icon: Icon, label, to }) => {
							const active =
								pathname === to ||
								(to === "/dashboard" &&
									pathname.startsWith("/interviews/owned/"));
							return (
								<ChakraLink
									_hover={{ bg: "rgba(244,242,236,0.08)" }}
									asChild
									bg={active ? "accent" : "transparent"}
									color={active ? "forest" : "paper"}
									display="flex"
									fontSize="sm"
									fontWeight="600"
									gap="3"
									key={to}
									mb="1"
									px="3"
									py="3"
									textDecoration="none"
								>
									<Link to={to}>
										<Icon aria-hidden="true" size={17} />
										{label}
									</Link>
								</ChakraLink>
							);
						})}
					</Box>
				</Box>
				<Box borderColor="rgba(244,242,236,0.22)" borderTopWidth="1px" pt="5">
					<Text fontSize="sm" fontWeight="600" truncate>
						{session.user.name}
					</Text>
					<Text color="rgba(244,242,236,0.6)" fontSize="xs" mt="1" truncate>
						{session.user.email}
					</Text>
					<Button
						_hover={{ bg: "rgba(244,242,236,0.08)" }}
						color="paper"
						disabled={logout.isPending}
						justifyContent="flex-start"
						mt="4"
						onClick={() => void handleLogout()}
						px="0"
						variant="ghost"
						w="full"
					>
						<LogOut aria-hidden="true" size={16} />
						{logout.isPending ? "Signing out…" : "Sign out"}
					</Button>
				</Box>
			</Flex>
			<Box flex="1" minW="0">
				<Flex
					align="center"
					borderBottomColor="line"
					borderBottomWidth="1px"
					h="16"
					justify="space-between"
					px="10"
				>
					<Heading fontFamily="display" fontSize="md">
						Creator workspace
					</Heading>
					<Flex align="center" gap="2">
						<Box bg="success" h="2" w="2" />
						<Text color="muted" fontFamily="mono" fontSize="xs">
							Session active
						</Text>
					</Flex>
				</Flex>
				<Box className="enter-up" px="10" py="9">
					{children}
				</Box>
			</Box>
		</Flex>
	);
}
