CREATE TYPE "public"."baseline_notification_status" AS ENUM('Sent', 'Skipped', 'Failed');--> statement-breakpoint
CREATE TABLE "baseline_notification_deliveries" (
"id" serial PRIMARY KEY NOT NULL,
"baseline_id" integer NOT NULL,
"recipient_user_id" integer,
"recipient_email" text NOT NULL,
"channel" "notification_channel" NOT NULL,
"status" "baseline_notification_status" NOT NULL,
"subject" text NOT NULL,
"error_message" text,
"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
"triggered_by_user_id" integer
);
--> statement-breakpoint
ALTER TABLE "baseline_notification_deliveries" ADD CONSTRAINT "baseline_notification_deliveries_baseline_id_schedule_baselines_id_fk" FOREIGN KEY ("baseline_id") REFERENCES "public"."schedule_baselines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baseline_notification_deliveries" ADD CONSTRAINT "baseline_notification_deliveries_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baseline_notification_deliveries" ADD CONSTRAINT "baseline_notification_deliveries_triggered_by_user_id_users_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
