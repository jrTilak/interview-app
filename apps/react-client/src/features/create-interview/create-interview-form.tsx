import { Box, Button, Grid, NativeSelect, Stack, Text } from "@chakra-ui/react";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import { useRef } from "react";
import {
	FieldShell,
	TextAreaInput,
	TextInput,
} from "@/components/atoms/form-field";
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
					description: `${interview.questionCount} questions are ready to share.`,
					title: "Interview structured",
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
			<Grid gap="10" templateColumns="minmax(0, 1fr) 280px">
				<Stack gap="6">
					<form.Field name="title">
						{(field) => (
							<FieldShell
								error={firstFormError(field.state.meta.errors)}
								label="Interview title"
								required
							>
								<TextInput
									autoFocus
									maxLength={160}
									name={field.name}
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
									placeholder="Frontend engineer · final round"
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
								<TextAreaInput
									maxLength={2000}
									minH="28"
									name={field.name}
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
									placeholder="Role level, project context, and the tone to maintain…"
									value={field.state.value}
								/>
							</FieldShell>
						)}
					</form.Field>
					<form.Field name="durationMinutes">
						{(field) => (
							<FieldShell
								error={firstFormError(field.state.meta.errors)}
								hint="This becomes a hard server-side deadline."
								label="Duration"
								required
							>
								<NativeSelect.Root>
									<NativeSelect.Field
										bg="surface"
										borderColor="line"
										h="12"
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
					<form.Field name="rawQuestions">
						{(field) => (
							<FieldShell
								error={firstFormError(field.state.meta.errors)}
								hint="Write freely. The AI turns these notes into ordered tasks; candidates never see this raw text."
								label="Question notes"
								required
							>
								<TextAreaInput
									fontFamily="mono"
									fontSize="sm"
									maxLength={20_000}
									minH="72"
									name={field.name}
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
									placeholder={[
										"Ask for a concise introduction.",
										"Discuss React rendering and one difficult bug.",
										"Ask how they would test a realtime feature.",
									].join("\n")}
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
								bg="forest"
								color="paper"
								disabled={!canSubmit || createInterview.isPending}
								h="12"
								loading={isSubmitting || createInterview.isPending}
								loadingText="Structuring question set…"
								px="6"
								type="submit"
							>
								Structure interview
								<ArrowRight aria-hidden="true" size={17} />
							</Button>
						)}
					</form.Subscribe>
				</Stack>

				<Box borderColor="line" borderLeftWidth="1px" pl="7">
					<Sparkles aria-hidden="true" color="#2447F2" size={22} />
					<Text fontFamily="display" fontSize="xl" fontWeight="700" mt="5">
						What happens next
					</Text>
					<Stack color="muted" fontSize="sm" gap="5" lineHeight="1.6" mt="5">
						<Text>
							1. Notes are converted to structured, ordered interview tasks.
						</Text>
						<Text>
							2. The task list and your original notes remain creator-only.
						</Text>
						<Text>
							3. A secure link is created for authenticated candidates.
						</Text>
					</Stack>
					<Box bg="surface" borderColor="line" borderWidth="1px" mt="8" p="4">
						<Text fontFamily="mono" fontSize="xs" fontWeight="700">
							SAFE RETRY
						</Text>
						<Text color="muted" fontSize="sm" mt="2">
							If the network fails, retrying this draft reuses its idempotency
							key and will not create a duplicate.
						</Text>
					</Box>
				</Box>
			</Grid>
		</form>
	);
}
