CREATE TYPE "public"."change_event_status" AS ENUM('Draft', 'SentForClientReview', 'ClientApproved', 'ClientRejected', 'PMApproved', 'Cancelled');--> statement-breakpoint
CREATE TYPE "public"."company_type" AS ENUM('Consultant', 'MainContractor', 'Subcontractor', 'Supplier', 'Client', 'Internal');--> statement-breakpoint
CREATE TYPE "public"."impact_response_status" AS ENUM('Pending', 'Submitted', 'Reviewed', 'Closed');--> statement-breakpoint
CREATE TYPE "public"."impact_risk_level" AS ENUM('None', 'Low', 'Medium', 'High');--> statement-breakpoint
CREATE TYPE "public"."impact_risk_type" AS ENUM('Time', 'Cost', 'Quality', 'Scope', 'Resources', 'Authority', 'Other');--> statement-breakpoint
CREATE TYPE "public"."milestone_status" AS ENUM('Planned', 'OnTrack', 'AtRisk', 'Delayed', 'Completed');--> statement-breakpoint
CREATE TYPE "public"."project_assignment_role" AS ENUM('admin', 'pm', 'contractor_lead', 'contractor_member', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."stage_code" AS ENUM('ST1_PRE_DESIGN_CONCEPT', 'ST2_DESIGN_DEVELOPMENT', 'ST3_AUTHORITY_APPROVALS', 'ST4_DETAILED_DESIGN_TENDER', 'ST5_CONSTRUCTION_SHELL_CORE', 'ST6_CONSTRUCTION_MEP_BLOCKWORK', 'ST7_INTERIOR_FITOUT', 'ST8_EXTERNAL_WORKS_FINAL_MEP', 'ST9_COMPLETION_SNAGGING_HANDOVER', 'ST10_CLIENT_HANDOVER_DLP');--> statement-breakpoint
CREATE TYPE "public"."user_company_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TABLE "change_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"milestone_id" integer NOT NULL,
	"initiated_by_user_id" integer,
	"initiated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"old_date" timestamp with time zone NOT NULL,
	"proposed_new_date" timestamp with time zone NOT NULL,
	"change_reason" text NOT NULL,
	"status" "change_event_status" DEFAULT 'Draft' NOT NULL,
	"client_user_id" integer,
	"client_decision_at" timestamp with time zone,
	"client_comment" text
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "company_type" NOT NULL,
	"default_role" text
);
--> statement-breakpoint
CREATE TABLE "milestone_entry_companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"milestone_id" integer NOT NULL,
	"project_company_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestone_impacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"change_event_id" integer NOT NULL,
	"milestone_id" integer NOT NULL,
	"project_company_id" integer NOT NULL,
	"old_date" timestamp with time zone NOT NULL,
	"new_date" timestamp with time zone NOT NULL,
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"impact_risk_level" "impact_risk_level",
	"impact_risk_type" "impact_risk_type",
	"main_risk_issue" text,
	"detailed_comment" text,
	"response_status" "impact_response_status" DEFAULT 'Pending' NOT NULL,
	"pm_resolution_note" text
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"stage_code" "stage_code" NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"owner_role" text NOT NULL,
	"baseline_date" timestamp with time zone NOT NULL,
	"current_date" timestamp with time zone NOT NULL,
	"previous_date" timestamp with time zone,
	"status" "milestone_status" DEFAULT 'Planned' NOT NULL,
	"critical_flag" boolean DEFAULT false NOT NULL,
	"is_key_output" boolean DEFAULT false NOT NULL,
	"is_payment_trigger" boolean DEFAULT false NOT NULL,
	"change_reason_latest" text,
	"predecessor_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"procore_task_id" text
);
--> statement-breakpoint
CREATE TABLE "project_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"company_id" integer,
	"role" "project_assignment_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" integer
);
--> statement-breakpoint
CREATE TABLE "project_companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"role_on_project" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"role" "user_company_role" DEFAULT 'member' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
ALTER TABLE "change_events" ADD CONSTRAINT "change_events_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_entry_companies" ADD CONSTRAINT "milestone_entry_companies_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_entry_companies" ADD CONSTRAINT "milestone_entry_companies_project_company_id_project_companies_id_fk" FOREIGN KEY ("project_company_id") REFERENCES "public"."project_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_impacts" ADD CONSTRAINT "milestone_impacts_change_event_id_change_events_id_fk" FOREIGN KEY ("change_event_id") REFERENCES "public"."change_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_impacts" ADD CONSTRAINT "milestone_impacts_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_impacts" ADD CONSTRAINT "milestone_impacts_project_company_id_project_companies_id_fk" FOREIGN KEY ("project_company_id") REFERENCES "public"."project_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_companies" ADD CONSTRAINT "project_companies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_companies" ADD CONSTRAINT "project_companies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;