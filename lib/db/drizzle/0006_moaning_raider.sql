CREATE TABLE "procore_oauth_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"base_url" text NOT NULL,
	"procore_company_id" text,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"access_token_expires_at" timestamp with time zone NOT NULL,
	"scope" text,
	"procore_user_id" text,
	"procore_user_name" text,
	"procore_user_email" text,
	"connected_by_user_id" integer,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_refreshed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "project_stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_built_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "milestones" ALTER COLUMN "stage_code" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "procore_company_id" text;--> statement-breakpoint
ALTER TABLE "project_assignments" ADD COLUMN "procore_sourced" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project_assignments" ADD COLUMN "procore_last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_companies" ADD COLUMN "procore_sourced" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project_companies" ADD COLUMN "procore_last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "procore_project_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "procore_project_name" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "procore_last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "procore_last_sync_error" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "procore_user_id" text;--> statement-breakpoint
ALTER TABLE "procore_oauth_tokens" ADD CONSTRAINT "procore_oauth_tokens_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procore_oauth_tokens" ADD CONSTRAINT "procore_oauth_tokens_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_stages_code_unique" ON "project_stages" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_procore_project_id_unique" ON "projects" USING btree ("procore_project_id");--> statement-breakpoint
DROP TYPE "public"."stage_code";