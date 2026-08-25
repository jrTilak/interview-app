import {
	Avatar,
	Box,
	Link as ChakraLink,
	Flex,
	Heading,
	IconButton,
	SegmentGroup,
	Text,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
	BriefcaseBusiness,
	ClipboardList,
	FilePlus2,
	History,
	Link2,
	LogOut,
} from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { Brand } from "@/components/atoms/brand";
import { useSignOut } from "@/shared/api/modules/auth/hooks";
import type { AuthSession } from "@/shared/api/modules/auth/lib";
import { sessionQueryOptions } from "@/shared/api/modules/auth/queries";
import { parseError } from "@/shared/lib/parse-error";
import { toaster } from "@/shared/lib/toaster";
import { useInterviewRoomStore } from "@/stores/interview-room.store";
import {
	useWorkspaceModeStore,
	type WorkspaceMode,
} from "@/stores/workspace-mode.store";

type AppShellProps = {
	children: ReactNode;
	session: Exclude<AuthSession, null>;
	title: string;
};

/** Loads the protected session before rendering a workspace page. */
export function CreatorAppShell({
	children,
	title,
}: {
	children: ReactNode;
	title: string;
}) {
	const session = useQuery(sessionQueryOptions());
	if (!session.data) return null;
	return (
		<AppShell session={session.data} title={title}>
			{children}
		</AppShell>
	);
}

const interviewNavigation = [
	{ icon: History, label: "My interviews", to: "/dashboard" as const },
	{ icon: Link2, label: "Join with link", to: "/join" as const },
];

const recruiterNavigation = [
	{
		icon: ClipboardList,
		label: "Interviews",
		to: "/recruiter/interviews" as const,
	},
	{ icon: FilePlus2, label: "Create", to: "/interviews/new" as const },
];

/** Renders mode-aware navigation around one focused page. */
export function AppShell({ children, session, title }: AppShellProps) {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const router = useRouter();
	const logout = useSignOut();
	const resetRoom = useInterviewRoomStore((state) => state.reset);
	const mode = useWorkspaceModeStore((state) => state.mode);
	const setMode = useWorkspaceModeStore((state) => state.setMode);
	const routeMode: WorkspaceMode | null =
		pathname === "/dashboard" || pathname === "/join"
			? "interview"
			: pathname.startsWith("/recruiter/") ||
					pathname === "/interviews/new" ||
					pathname.startsWith("/interviews/owned/")
				? "recruiter"
				: null;
	const activeMode = routeMode ?? mode;
	const navigation =
		activeMode === "recruiter" ? recruiterNavigation : interviewNavigation;

	useEffect(() => {
		if (routeMode) setMode(routeMode);
	}, [routeMode, setMode]);

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

	const switchMode = (next: WorkspaceMode) => {
		setMode(next);
		void router.navigate({
			to: next === "recruiter" ? "/recruiter/interviews" : "/dashboard",
		});
	};

	return (
		<Flex bg="canvas" h="100dvh" overflow="hidden">
			<Flex
				aria-label="Application sidebar"
				as="aside"
				bg="forest"
				color="paper"
				direction="column"
				h="100dvh"
				justify="space-between"
				left="0"
				position="fixed"
				px="5"
				py="6"
				top="0"
				w="236px"
				zIndex="1"
			>
				<Box>
					<Brand inverted />
					<SegmentGroup.Root
						aria-label="Workspace mode"
						mt="9"
						onValueChange={({ value }) => {
							if (value === "interview" || value === "recruiter") {
								switchMode(value);
							}
						}}
						size="sm"
						value={activeMode}
						w="full"
					>
						<SegmentGroup.Indicator />
						<SegmentGroup.Item flex="1" value="interview">
							<History aria-hidden="true" size={14} />
							<SegmentGroup.ItemText>Interview</SegmentGroup.ItemText>
							<SegmentGroup.ItemHiddenInput />
						</SegmentGroup.Item>
						<SegmentGroup.Item flex="1" value="recruiter">
							<BriefcaseBusiness aria-hidden="true" size={14} />
							<SegmentGroup.ItemText>Recruiter</SegmentGroup.ItemText>
							<SegmentGroup.ItemHiddenInput />
						</SegmentGroup.Item>
					</SegmentGroup.Root>

					<Box as="nav" aria-label="Primary" mt="7">
						{navigation.map(({ icon: Icon, label, to }) => {
							const active =
								pathname === to ||
								(to === "/recruiter/interviews" &&
									pathname.startsWith("/interviews/owned/"));
							return (
								<ChakraLink
									aria-current={active ? "page" : undefined}
									asChild
									key={to}
									layerStyle="sidebar-navigation"
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

				<Box>
					<Flex
						align="center"
						borderColor="paper/14"
						borderTopWidth="1px"
						gap="3"
						pt="5"
					>
						<Avatar.Root colorPalette="highlight" shape="square" size="sm">
							<Avatar.Fallback name={session.user.name} />
						</Avatar.Root>
						<Box minW="0">
							<Text fontSize="sm" fontWeight="650" truncate>
								{session.user.name}
							</Text>
							<Text color="paper/48" fontSize="xs" truncate>
								{session.user.email}
							</Text>
						</Box>
						<IconButton
							aria-label="Sign out"
							color="paper/65"
							disabled={logout.isPending}
							ml="auto"
							onClick={() => void handleLogout()}
							size="sm"
							variant="ghost"
						>
							<LogOut aria-hidden="true" size={16} />
						</IconButton>
					</Flex>
				</Box>
			</Flex>

			<Flex direction="column" h="100dvh" ml="236px" w="calc(100% - 236px)">
				<Flex
					align="center"
					as="header"
					bg="surface"
					borderBottomColor="line"
					borderBottomWidth="1px"
					flexShrink="0"
					h="16"
					px="9"
				>
					<Heading as="h1" fontSize="md">
						{title}
					</Heading>
				</Flex>

				<Box as="main" flex="1" minH="0" overflowX="hidden" overflowY="auto">
					<Box animationStyle="enter-up" maxW="1500px" mx="auto" px="9" py="8">
						{children}
					</Box>
				</Box>
			</Flex>
		</Flex>
	);
}
