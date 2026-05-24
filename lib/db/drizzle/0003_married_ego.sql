CREATE TYPE "public"."change_event_event_type" AS ENUM('Opened', 'SentForClientReview', 'ClientApproved', 'ClientRejected', 'PMApproved', 'Cancelled');--> statement-breakpoint
CREATE TABLE "change_event_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"change_event_id" integer NOT NULL,
	"event_type" "change_event_event_type" NOT NULL,
	"actor_user_id" integer,
	"comment" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "change_event_events" ADD CONSTRAINT "change_event_events_change_event_id_change_events_id_fk" FOREIGN KEY ("change_event_id") REFERENCES "public"."change_events"("id") ON DELETE cascade ON UPDATE no action;