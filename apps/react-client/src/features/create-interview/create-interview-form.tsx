import {
	Box,
	Button,
	Card,
	Input,
	NativeSelect,
	Stack,
	Switch,
	Text,
	Textarea,
} from "@chakra-ui/react";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useRef } from "react";
import { FieldShell } from "@/components/atoms/form-field";
import { useCreateInterview } from "@/shared/api/modules/interviews/hooks";
import { firstFormError, parseError } from "@/shared/lib/parse-error";
import { toaster } from "@/shared/lib/toaster";
import { CreateInterviewSchema } from "./create-interview.validation";

const durationOptions = [15, 20, 30, 45, 60, 90, 120];

/** Collects raw creator notes and preserves one idempotency UUID across retries. */
export function CreateInterviewForm() {
	const createInterview = useCreateInterview();
	const requestId = useRef(crypto.randomUUID());
	const router = useRouter();
	const form = useForm({
		defaultValues: {
			allowMultipleAttempts: false,
			description: "",
			durationMinutes: 30,
			rawQuestions: "",
			title: "",
		},
		validators: { onSubmit: CreateInterviewSchema },
		async onSubmit({ value }) {
			try {
				const parsed = CreateInterviewSchema.parse(value);
				const interview = await createInterview.mutateAsync({
					...parsed,
					clientRequestId: requestId.current,
				});
				requestId.current = crypto.randomUUID();
				toaster.success({
					description: `${interview.questionCount} topics are ready to share.`,
					title: "Interview plan ready",
				});
				await router.navigate({
					params: { interviewId: interview.id },
					to: "/interviews/owned/$interviewId",
				});
			} catch (error) {
				toaster.error({
					description: parseError(
						error,
						"Your draft is still here. Try structuring it again.",
					),
					title: "Interview could not be created",
				});
			}
		},
	});

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				event.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<Card.Root maxW="820px">
				<Card.Body>
					<Stack gap="6">
						<form.Field name="title">
							{(field) => (
								<FieldShell
									error={firstFormError(field.state.meta.errors)}
									label="Interview title"
									required
								>
									<Input
										autoFocus
										maxLength={160}
										name={field.name}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
										placeholder="Frontend engineer · final round"
										size="xl"
										value={field.state.value}
									/>
								</FieldShell>
							)}
						</form.Field>
						<form.Field name="description">
							{(field) => (
								<FieldShell
									error={firstFormError(field.state.meta.errors)}
									hint="Optional context the interviewer should understand."
									label="Description"
								>
									<Textarea
										maxLength={2000}
										minH="28"
										name={field.name}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
										placeholder="Role level, project context, and the tone to maintain…"
										resize="vertical"
										value={field.state.value}
									/>
								</FieldShell>
							)}
						</form.Field>
						<form.Field name="durationMinutes">
							{(field) => (
								<FieldShell
									error={firstFormError(field.state.meta.errors)}
									label="Duration"
									required
								>
									<NativeSelect.Root>
										<NativeSelect.Field
											name={field.name}
											onBlur={field.handleBlur}
											onChange={(event) =>
												field.handleChange(Number(event.target.value))
											}
											value={field.state.value}
										>
											{durationOptions.map((minutes) => (
												<option key={minutes} value={minutes}>
													{minutes} minutes
												</option>
											))}
										</NativeSelect.Field>
										<NativeSelect.Indicator />
									</NativeSelect.Root>
								</FieldShell>
							)}
						</form.Field>
						<form.Field name="allowMultipleAttempts">
							{(field) => (
								<Switch.Root
									checked={field.state.value}
									display="flex"
									justifyContent="space-between"
									onBlur={field.handleBlur}
									onCheckedChange={({ checked }) => field.handleChange(checked)}
									w="full"
								>
									<Switch.HiddenInput name={field.name} />
									<Box pr="6">
										<Switch.Label fontWeight="700">
											Allow repeat attempts
										</Switch.Label>
										<Text color="muted" fontSize="sm" mt="1">
											Allow another attempt after completion.
										</Text>
									</Box>
									<Switch.Control mt="1">
										<Switch.Thumb />
									</Switch.Control>
								</Switch.Root>
							)}
						</form.Field>
						<form.Field name="rawQuestions">
							{(field) => (
								<FieldShell
									error={firstFormError(field.state.meta.errors)}
									hint="These private notes guide the conversation, not a fixed script."
									label="Topics to cover"
									required
								>
									<Textarea
										fontFamily="mono"
										fontSize="sm"
										maxLength={20_000}
										minH="72"
										name={field.name}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
										placeholder={[
											"Background and a recent project.",
											"React rendering and a difficult debugging experience.",
											"Testing strategy for a realtime feature.",
										].join("\n")}
										resize="vertical"
										value={field.state.value}
									/>
								</FieldShell>
							)}
						</form.Field>
						<form.Subscribe
							selector={(state) => [state.canSubmit, state.isSubmitting]}
						>
							{([canSubmit, isSubmitting]) => (
								<Button
									alignSelf="flex-start"
									disabled={!canSubmit || createInterview.isPending}
									loading={isSubmitting || createInterview.isPending}
									loadingText="Building topic plan…"
									size="xl"
									type="submit"
								>
									Create interview
									<ArrowRight aria-hidden="true" size={17} />
								</Button>
							)}
						</form.Subscribe>
					</Stack>
				</Card.Body>
			</Card.Root>
		</form>
	);
}
