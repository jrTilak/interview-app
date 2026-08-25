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
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import z from "zod";
import { ErrorState } from "@/components/atoms/error-state";
import { FieldShell } from "@/components/atoms/form-field";
import { LoadingState } from "@/components/atoms/loading-state";
import { CreatorAppShell } from "@/components/layouts/app-shell";
import { PageHeader } from "@/components/molecules/page-header";
import { useUpdateInterview } from "@/shared/api/modules/interviews/hooks";
import type { InterviewDetailsResponseDto } from "@/shared/api/modules/interviews/lib";
import { interviewDetailQueryOptions } from "@/shared/api/modules/interviews/queries";
import { firstFormError, parseError } from "@/shared/lib/parse-error";
import { toaster } from "@/shared/lib/toaster";

const EditInterviewSchema = z.object({
	allowMultipleAttempts: z.boolean(),
	description: z.string().trim().max(2_000),
	durationMinutes: z.number().int().min(5).max(120),
	title: z.string().trim().min(3).max(160),
});

const durationOptions = [15, 20, 30, 45, 60, 90, 120];

export function EditInterviewScreen({ interviewId }: { interviewId: string }) {
	const interview = useQuery(interviewDetailQueryOptions(interviewId));
	return (
		<CreatorAppShell>
			{interview.isPending && <LoadingState label="Loading interview" />}
			{interview.isError && (
				<ErrorState
					description={parseError(
						interview.error,
						"This interview could not be loaded.",
					)}
					onRetry={() => void interview.refetch()}
				/>
			)}
			{interview.data && <EditInterviewForm interview={interview.data} />}
		</CreatorAppShell>
	);
}

function EditInterviewForm({
	interview,
}: {
	interview: InterviewDetailsResponseDto;
}) {
	const update = useUpdateInterview();
	const router = useRouter();
	const form = useForm({
		defaultValues: {
			allowMultipleAttempts: interview.allowMultipleAttempts,
			description: interview.description ?? "",
			durationMinutes: interview.durationMinutes,
			title: interview.title,
		},
		validators: { onSubmit: EditInterviewSchema },
		async onSubmit({ value }) {
			try {
				const parsed = EditInterviewSchema.parse(value);
				await update.mutateAsync({
					id: interview.id,
					data: { ...parsed, description: parsed.description || null },
				});
				toaster.success({ title: "Interview updated" });
				await router.navigate({
					params: { interviewId: interview.id },
					to: "/interviews/owned/$interviewId",
				});
			} catch (error) {
				toaster.error({
					description: parseError(error, "The interview could not be updated."),
					title: "Update failed",
				});
			}
		},
	});

	return (
		<>
			<PageHeader
				description="Update the candidate-facing details and attempt policy."
				eyebrow="Recruiter mode"
				title="Edit interview"
			/>
			<Card.Root maxW="3xl" mt="8">
				<Card.Body>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void form.handleSubmit();
						}}
					>
						<Stack gap="6">
							<form.Field name="title">
								{(field) => (
									<FieldShell
										error={firstFormError(field.state.meta.errors)}
										label="Title"
										required
									>
										<Input
											autoFocus
											name={field.name}
											onBlur={field.handleBlur}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
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
										label="Description"
									>
										<Textarea
											minH="40"
											name={field.name}
											onBlur={field.handleBlur}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
											resize="vertical"
											value={field.state.value}
										/>
									</FieldShell>
								)}
							</form.Field>
							<form.Field name="durationMinutes">
								{(field) => (
									<FieldShell label="Duration">
										<NativeSelect.Root>
											<NativeSelect.Field
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
										onCheckedChange={({ checked }) =>
											field.handleChange(checked)
										}
									>
										<Switch.HiddenInput />
										<Box>
											<Switch.Label fontWeight="700">
												Repeat attempts
											</Switch.Label>
											<Text color="muted" fontSize="sm">
												Allow another attempt after completion.
											</Text>
										</Box>
										<Switch.Control>
											<Switch.Thumb />
										</Switch.Control>
									</Switch.Root>
								)}
							</form.Field>
							<Button
								alignSelf="flex-start"
								loading={update.isPending}
								type="submit"
							>
								Save changes <ArrowRight aria-hidden="true" size={16} />
							</Button>
						</Stack>
					</form>
				</Card.Body>
			</Card.Root>
		</>
	);
}
