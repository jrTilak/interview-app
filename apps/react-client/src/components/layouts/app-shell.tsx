import {
	Box,
	Button,
	Link as ChakraLink,
	Flex,
	Heading,
	IconButton,
	Text,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
	BriefcaseBusiness,
	ClipboardList,
	FilePlus2,
	FlaskConical,
	History,
	Link2,
	LogOut,
	UsersRound,
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
};

/** Loads the protected session before rendering a workspace page. */
export function CreatorAppShell({ children }: { children: ReactNode }) {
	const session = useQuery(sessionQueryOptions());
	if (!session.data) return null;
	return <AppShell session={session.data}>{children}</AppShell>;
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
	{
		icon: UsersRound,
		label: "Participants",
		to: "/recruiter/participants" as const,
	},
	{ icon: FilePlus2, label: "Create", to: "/interviews/new" as const },
];

/** Renders mode-aware navigation around one focused page. */
export function AppShell({ children, session }: AppShellProps) {
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
		<Flex bg="canvas" minH="100dvh">
			<Flex
				bg="forest"
				color="paper"
				direction="column"
				justify="space-between"
				minH="100dvh"
				position="sticky"
				px="5"
				py="6"
				top="0"
				w="236px"
			>
				<Box>
					<Brand inverted />
					<Flex
						bg="rgba(255,255,255,0.08)"
						borderRadius="lg"
						gap="1"
						mt="9"
						p="1"
					>
						<ModeButton
							active={activeMode === "interview"}
							icon={History}
							label="Interview"
							onClick={() => switchMode("interview")}
						/>
						<ModeButton
							active={activeMode === "recruiter"}
							icon={BriefcaseBusiness}
							label="Recruiter"
							onClick={() => switchMode("recruiter")}
						/>
					</Flex>

					<Box as="nav" aria-label="Primary" mt="7">
						{navigation.map(({ icon: Icon, label, to }) => {
							const active =
								pathname === to ||
								(to === "/recruiter/interviews" &&
									pathname.startsWith("/interviews/owned/"));
							return (
								<ChakraLink
									_hover={{ bg: "rgba(255,255,255,0.08)" }}
									asChild
									bg={active ? "accent" : "transparent"}
									borderRadius="md"
									color={active ? "forest" : "rgba(255,255,255,0.82)"}
									display="flex"
									fontSize="sm"
									fontWeight="650"
									gap="3"
									key={to}
									mb="1"
									px="3"
									py="2.5"
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

				<Box>
					<ChakraLink
						_hover={{ color: "paper" }}
						asChild
						color="rgba(255,255,255,0.55)"
						display="flex"
						fontSize="xs"
						gap="2"
						mb="5"
						px="2"
						textDecoration="none"
					>
						<Link to="/__flags__">
							<FlaskConical aria-hidden="true" size={14} />
							Dev flags
						</Link>
					</ChakraLink>
					<Flex
						align="center"
						borderColor="rgba(255,255,255,0.14)"
						borderTopWidth="1px"
						gap="3"
						pt="5"
					>
						<Flex
							align="center"
							bg="accent"
							borderRadius="md"
							color="forest"
							fontSize="sm"
							fontWeight="800"
							h="9"
							justify="center"
							w="9"
						>
							{session.user.name.slice(0, 1).toUpperCase()}
						</Flex>
						<Box minW="0">
							<Text fontSize="sm" fontWeight="650" truncate>
								{session.user.name}
							</Text>
							<Text color="rgba(255,255,255,0.48)" fontSize="xs" truncate>
								{session.user.email}
							</Text>
						</Box>
						<IconButton
							aria-label="Sign out"
							color="rgba(255,255,255,0.65)"
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

			<Box flex="1" minW="0">
				<Flex
					align="center"
					bg="surface"
					borderBottomColor="line"
					borderBottomWidth="1px"
					h="16"
					justify="space-between"
					px="9"
				>
					<Heading fontFamily="display" fontSize="md">
						{activeMode === "recruiter"
							? "Recruiter workspace"
							: "Interview workspace"}
					</Heading>
					<Text color="muted" fontSize="xs">
						{activeMode === "recruiter" ? "Build & manage" : "Take & review"}
					</Text>
				</Flex>
				<Box className="enter-up" maxW="1500px" mx="auto" px="9" py="8">
					{children}
				</Box>
			</Box>
		</Flex>
	);
}

function ModeButton({
	active,
	icon: Icon,
	label,
	onClick,
}: {
	active: boolean;
	icon: typeof History;
	label: string;
	onClick: () => void;
}) {
	return (
		<Button
			aria-pressed={active}
			bg={active ? "paper" : "transparent"}
			color={active ? "forest" : "rgba(255,255,255,0.62)"}
			flex="1"
			fontSize="xs"
			gap="1.5"
			h="9"
			onClick={onClick}
			px="2"
			variant="ghost"
		>
			<Icon aria-hidden="true" size={14} />
			{label}
		</Button>
	);
}
