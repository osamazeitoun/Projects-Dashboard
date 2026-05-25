ALTER TABLE "schedule_baselines" ADD COLUMN "pm_acknowledged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "schedule_baselines" ADD COLUMN "pm_acknowledged_by_user_id" integer;