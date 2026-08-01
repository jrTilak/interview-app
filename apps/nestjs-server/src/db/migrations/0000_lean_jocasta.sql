CREATE TYPE "public"."interview_attempt_end_reason" AS ENUM('AI_COMPLETED', 'TIME_LIMIT');--> statement-breakpoint
CREATE TYPE "public"."interview_attempt_state" AS ENUM('READY', 'ASSISTANT_SPEAKING', 'LISTENING', 'PROCESSING', 'ENDING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."question_progress_state" AS ENUM('PENDING', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."interview_turn_role" AS ENUM('ASSISTANT', 'CANDIDATE');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" uuid NOT NULL,
	"client_request_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text,
	"raw_questions" text NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"share_code" varchar(32) NOT NULL,
	CONSTRAINT "interview_duration_minutes_check" CHECK ("interview"."duration_minutes" between 5 and 120)
);
--> statement-breakpoint
CREATE TABLE "interview_question" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"interview_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" varchar(160) NOT NULL,
	"prompt" text NOT NULL,
	"objective" text,
	"follow_up_guidance" text,
	CONSTRAINT "interview_question_position_check" CHECK ("interview_question"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "attempt_question_progress" (
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"state" "question_progress_state" DEFAULT 'PENDING' NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "attempt_question_progress_attempt_id_question_id_pk" PRIMARY KEY("attempt_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "interview_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"interview_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"state" "interview_attempt_state" DEFAULT 'READY' NOT NULL,
	"started_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"end_reason" "interview_attempt_end_reason",
	"version" integer DEFAULT 0 NOT NULL,
	"camera_active" boolean DEFAULT false NOT NULL,
	"screen_active" boolean DEFAULT false NOT NULL,
	"microphone_active" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_turn" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"role" "interview_turn_role" NOT NULL,
	"text" text NOT NULL,
	"client_turn_id" uuid,
	CONSTRAINT "interview_turn_sequence_check" CHECK ("interview_turn"."sequence" > 0)
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview" ADD CONSTRAINT "interview_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_question" ADD CONSTRAINT "interview_question_interview_id_interview_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interview"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_question_progress" ADD CONSTRAINT "attempt_question_progress_attempt_id_interview_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."interview_attempt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_question_progress" ADD CONSTRAINT "attempt_question_progress_question_id_interview_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."interview_question"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_attempt" ADD CONSTRAINT "interview_attempt_interview_id_interview_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interview"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_attempt" ADD CONSTRAINT "interview_attempt_candidate_id_user_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_turn" ADD CONSTRAINT "interview_turn_attempt_id_interview_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."interview_attempt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_provider_account_idx" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_owner_request_unique" ON "interview" USING btree ("created_by_id","client_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_share_code_unique" ON "interview" USING btree ("share_code");--> statement-breakpoint
CREATE INDEX "interview_owner_created_idx" ON "interview" USING btree ("created_by_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_question_position_unique" ON "interview_question" USING btree ("interview_id","position");--> statement-breakpoint
CREATE INDEX "interview_question_interview_idx" ON "interview_question" USING btree ("interview_id");--> statement-breakpoint
CREATE INDEX "attempt_question_question_idx" ON "attempt_question_progress" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_attempt_candidate_unique" ON "interview_attempt" USING btree ("interview_id","candidate_id");--> statement-breakpoint
CREATE INDEX "interview_attempt_candidate_idx" ON "interview_attempt" USING btree ("candidate_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_turn_sequence_unique" ON "interview_turn" USING btree ("attempt_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_turn_client_turn_unique" ON "interview_turn" USING btree ("attempt_id","client_turn_id");