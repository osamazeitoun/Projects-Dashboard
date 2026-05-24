CREATE TABLE "project_company_roles" (
        "id" serial PRIMARY KEY NOT NULL,
        "key" text NOT NULL,
        "label" text NOT NULL,
        "is_built_in" boolean DEFAULT false NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "project_company_roles_key_unique" ON "project_company_roles" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "project_company_roles_label_unique" ON "project_company_roles" USING btree ("label");--> statement-breakpoint
INSERT INTO "project_company_roles" ("key", "label", "is_built_in") VALUES
  ('Client', 'Client', true),
  ('MainContractor', 'Main Contractor', true),
  ('ArchConsultant', 'Architectural Consultant', true),
  ('MEPConsultant', 'MEP Consultant', true),
  ('InteriorContractor', 'Interior Contractor', true)
ON CONFLICT ("key") DO NOTHING;