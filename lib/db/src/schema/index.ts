import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";

export const stageCodeEnum = pgEnum("stage_code", [
  "ST1_PRE_DESIGN_CONCEPT",
  "ST2_DESIGN_DEVELOPMENT",
  "ST3_AUTHORITY_APPROVALS",
  "ST4_DETAILED_DESIGN_TENDER",
  "ST5_CONSTRUCTION_SHELL_CORE",
  "ST6_CONSTRUCTION_MEP_BLOCKWORK",
  "ST7_INTERIOR_FITOUT",
  "ST8_EXTERNAL_WORKS_FINAL_MEP",
  "ST9_COMPLETION_SNAGGING_HANDOVER",
  "ST10_CLIENT_HANDOVER_DLP",
]);

export const milestoneStatusEnum = pgEnum("milestone_status", [
  "Planned",
  "OnTrack",
  "AtRisk",
  "Delayed",
  "Completed",
]);

export const companyTypeEnum = pgEnum("company_type", [
  "Consultant",
  "MainContractor",
  "Subcontractor",
  "Supplier",
  "Client",
  "Internal",
]);

export const changeEventStatusEnum = pgEnum("change_event_status", [
  "Draft",
  "SentForClientReview",
  "ClientApproved",
  "ClientRejected",
  "PMApproved",
  "Cancelled",
]);

export const impactRiskLevelEnum = pgEnum("impact_risk_level", [
  "None",
  "Low",
  "Medium",
  "High",
]);

export const impactRiskTypeEnum = pgEnum("impact_risk_type", [
  "Time",
  "Cost",
  "Quality",
  "Scope",
  "Resources",
  "Authority",
  "Other",
]);

export const impactResponseStatusEnum = pgEnum("impact_response_status", [
  "Pending",
  "Submitted",
  "Reviewed",
  "Closed",
]);

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull(),
});

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: companyTypeEnum("type").notNull(),
  defaultRole: text("default_role"),
});

export const projectCompanies = pgTable("project_companies", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  roleOnProject: text("role_on_project").notNull(),
});

export const milestones = pgTable("milestones", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  stageCode: stageCodeEnum("stage_code").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  ownerRole: text("owner_role").notNull(),
  baselineDate: timestamp("baseline_date", { withTimezone: true }).notNull(),
  currentDate: timestamp("current_date", { withTimezone: true }).notNull(),
  previousDate: timestamp("previous_date", { withTimezone: true }),
  status: milestoneStatusEnum("status").notNull().default("Planned"),
  criticalFlag: boolean("critical_flag").notNull().default(false),
  isKeyOutput: boolean("is_key_output").notNull().default(false),
  isPaymentTrigger: boolean("is_payment_trigger").notNull().default(false),
  changeReasonLatest: text("change_reason_latest"),
  predecessorIds: jsonb("predecessor_ids").notNull().default([]),
  procoreTaskId: text("procore_task_id"),
});

export const milestoneEntryCompanies = pgTable("milestone_entry_companies", {
  id: serial("id").primaryKey(),
  milestoneId: integer("milestone_id")
    .notNull()
    .references(() => milestones.id, { onDelete: "cascade" }),
  projectCompanyId: integer("project_company_id")
    .notNull()
    .references(() => projectCompanies.id, { onDelete: "cascade" }),
});

export const changeEvents = pgTable("change_events", {
  id: serial("id").primaryKey(),
  milestoneId: integer("milestone_id")
    .notNull()
    .references(() => milestones.id, { onDelete: "cascade" }),
  initiatedByUserId: integer("initiated_by_user_id"),
  initiatedAt: timestamp("initiated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  oldDate: timestamp("old_date", { withTimezone: true }).notNull(),
  proposedNewDate: timestamp("proposed_new_date", { withTimezone: true }).notNull(),
  changeReason: text("change_reason").notNull(),
  status: changeEventStatusEnum("status").notNull().default("Draft"),
  clientUserId: integer("client_user_id"),
  clientDecisionAt: timestamp("client_decision_at", { withTimezone: true }),
  clientComment: text("client_comment"),
});

export const milestoneImpacts = pgTable("milestone_impacts", {
  id: serial("id").primaryKey(),
  changeEventId: integer("change_event_id")
    .notNull()
    .references(() => changeEvents.id, { onDelete: "cascade" }),
  milestoneId: integer("milestone_id")
    .notNull()
    .references(() => milestones.id, { onDelete: "cascade" }),
  projectCompanyId: integer("project_company_id")
    .notNull()
    .references(() => projectCompanies.id, { onDelete: "cascade" }),
  oldDate: timestamp("old_date", { withTimezone: true }).notNull(),
  newDate: timestamp("new_date", { withTimezone: true }).notNull(),
  notifiedAt: timestamp("notified_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  impactRiskLevel: impactRiskLevelEnum("impact_risk_level"),
  impactRiskType: impactRiskTypeEnum("impact_risk_type"),
  mainRiskIssue: text("main_risk_issue"),
  detailedComment: text("detailed_comment"),
  responseStatus: impactResponseStatusEnum("response_status")
    .notNull()
    .default("Pending"),
  pmResolutionNote: text("pm_resolution_note"),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userCompanies = pgTable("user_companies", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
});

export type User = typeof users.$inferSelect;
export type UserCompany = typeof userCompanies.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;
export type ChangeEvent = typeof changeEvents.$inferSelect;
export type MilestoneImpact = typeof milestoneImpacts.$inferSelect;
