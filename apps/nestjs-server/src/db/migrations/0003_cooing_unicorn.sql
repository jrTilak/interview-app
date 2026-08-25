DROP INDEX "interview_owner_request_unique";--> statement-breakpoint
DROP INDEX "interview_share_code_unique";--> statement-breakpoint
ALTER TABLE "interview" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "interview" DROP COLUMN "client_request_id";--> statement-breakpoint
ALTER TABLE "interview" DROP COLUMN "share_code";