import { Box, Flex, Heading, Text } from "@chakra-ui/react";
import { AudioLines, ListChecks, Sparkles } from "lucide-react";

const highlights = [
	{
		description: "Choose what every interview should cover.",
		icon: ListChecks,
		title: "Structured topics",
	},
	{
		description: "Follow-ups respond to each candidate's answer.",
		icon: Sparkles,
		title: "Adaptive conversation",
	},
	{
		description: "Candidates respond naturally with their voice.",
		icon: AudioLines,
		title: "Voice interviews",
	},
] as const;

/** Shows what Interview Desk does without adding marketing filler. */
export function AuthProductPreview() {
	return (
		<Box maxW="2xl" my="auto" w="full">
			<Heading fontSize="5xl" letterSpacing="-0.04em" lineHeight="1">
				Focused interviews. Natural conversations.
			</Heading>
			<Text color="paper/72" fontSize="lg" lineHeight="1.6" maxW="xl" mt="5">
				Interview Desk helps you create, share, and run voice interviews that
				adapt to every candidate.
			</Text>

			<Box bg="paper" color="ink" mt="8">
				{highlights.map(({ description, icon: Icon, title }, index) => (
					<Flex
						align="center"
						borderBottomColor="line"
						borderBottomWidth={index === highlights.length - 1 ? "0" : "1px"}
						gap="4"
						key={title}
						p="5"
					>
						<Flex align="center" bg="accent" h="10" justify="center" w="10">
							<Icon aria-hidden="true" size={19} />
						</Flex>
						<Box>
							<Text fontWeight="700">{title}</Text>
							<Text color="muted" fontSize="sm">
								{description}
							</Text>
						</Box>
					</Flex>
				))}
			</Box>
		</Box>
	);
}
