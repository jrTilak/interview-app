ALTER TYPE "public"."interview_turn_role" RENAME VALUE 'ASSISTANT' TO 'assistant';--> statement-breakpoint
ALTER TYPE "public"."interview_turn_role" RENAME VALUE 'CANDIDATE' TO 'candidate';--> statement-breakpoint
ALTER TABLE "interview_turn" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interview_turn" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interview_turn" ADD CONSTRAINT "interview_turn_time_range_check" CHECK ("interview_turn"."ended_at" is null or ("interview_turn"."started_at" is not null and "interview_turn"."ended_at" >= "interview_turn"."started_at"));
