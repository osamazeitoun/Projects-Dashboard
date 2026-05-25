import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  milestones,
  milestoneImpacts,
  milestoneEntryCompanies,
  projectCompanies,
  changeEvents,
  projects,
  companies,
  baselineNotificationDeliveries,
  scheduleBaselines,
  users,
} from "@workspace/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  GetClientReviewDetailParams,
  SubmitClientDecisionBody,
  SubmitClientDecisionParams,
  GetBaselineReviewDetailParams,
  SubmitBaselineDecisionParams,
  SubmitBaselineDecisionBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import {
  getProjectIdForChangeEvent,
  listClientProjectIds,
  requireClientAccess,
} from "../middlewares/permissions";
import { sendBaselineDecisionNotifications } from "../services/notifications";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.use(requireAuth);

// Stages are now editable globally — see lib/stages.ts.
import { stageNameByCode } from "../lib/stages";

function isoOrNull(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

async function loadChangeEventDetailResponse(id: number) {
  const [ev] = await db
    .select({
      id: changeEvents.id,
      editKind: changeEvents.editKind,
      milestoneId: changeEvents.milestoneId,
      milestoneCode: milestones.code,
      milestoneName: milestones.name,
      stageCode: milestones.stageCode,
      initiatedAt: changeEvents.initiatedAt,
      oldDate: changeEvents.oldDate,
      proposedNewDate: changeEvents.proposedNewDate,
      proposedChanges: changeEvents.proposedChanges,
      changeReason: changeEvents.changeReason,
      status: changeEvents.status,
      clientComment: changeEvents.clientComment,
      clientDecisionAt: changeEvents.clientDecisionAt,
    })
    .from(changeEvents)
    .innerJoin(milestones, eq(milestones.id, changeEvents.milestoneId))
    .where(eq(changeEvents.id, id))
    .limit(1);
  if (!ev) return null;

  const impacts = await db
    .select({
      id: milestoneImpacts.id,
      projectCompanyId: milestoneImpacts.projectCompanyId,
      companyName: companies.name,
      companyRole: projectCompanies.roleOnProject,
      responseStatus: milestoneImpacts.responseStatus,
      notifiedAt: milestoneImpacts.notifiedAt,
      respondedAt: milestoneImpacts.respondedAt,
      impactRiskLevel: milestoneImpacts.impactRiskLevel,
      impactRiskType: milestoneImpacts.impactRiskType,
      mainRiskIssue: milestoneImpacts.mainRiskIssue,
      detailedComment: milestoneImpacts.detailedComment,
    })
    .from(milestoneImpacts)
    .innerJoin(projectCompanies, eq(projectCompanies.id, milestoneImpacts.projectCompanyId))
    .innerJoin(companies, eq(companies.id, projectCompanies.companyId))
    .where(eq(milestoneImpacts.changeEventId, id))
    .orderBy(asc(companies.name));

  return {
    id: ev.id,
    editKind: ev.editKind,
    milestoneId: ev.milestoneId,
    milestoneCode: ev.milestoneCode,
    milestoneName: ev.milestoneName,
    stageCode: ev.stageCode,
    stageName: stageNameByCode.get(ev.stageCode) ?? ev.stageCode,
    initiatedAt: ev.initiatedAt.toISOString(),
    oldDate: isoOrNull(ev.oldDate),
    proposedNewDate: isoOrNull(ev.proposedNewDate),
    proposedChanges: ev.proposedChanges ?? null,
    changeReason: ev.changeReason,
    status: ev.status,
    clientComment: ev.clientComment,
    clientDecisionAt: isoOrNull(ev.clientDecisionAt),
    impacts: impacts.map((i) => ({
      id: i.id,
      projectCompanyId: i.projectCompanyId,
      companyName: i.companyName,
      companyRole: i.companyRole,
      responseStatus: i.responseStatus,
      notifiedAt: i.notifiedAt.toISOString(),
      respondedAt: isoOrNull(i.respondedAt),
      impactRiskLevel: i.impactRiskLevel,
      impactRiskType: i.impactRiskType,
      mainRiskIssue: i.mainRiskIssue,
      detailedComment: i.detailedComment,
    })),
  };
}

router.get("/me/portfolio", async (req: Request, res: Response) => {
  const ctx = req.auth_ctx!;
  const projectIds = await listClientProjectIds(ctx.userId);
  if (projectIds.length === 0) return res.json([]);

  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      code: projects.code,
      scheduleStatus: projects.scheduleStatus,
    })
    .from(projects)
    .where(inArray(projects.id, projectIds))
    .orderBy(asc(projects.name));

  const milestoneRows = await db
    .select({
      id: milestones.id,
      projectId: milestones.projectId,
      currentDate: milestones.currentDate,
    })
    .from(milestones)
    .where(inArray(milestones.projectId, projectIds));

  const milestoneIds = milestoneRows.map((m) => m.id);
  const milestoneById = new Map(milestoneRows.map((m) => [m.id, m]));

  type CompanyOnMilestone = {
    milestoneId: number;
    projectCompanyId: number;
    companyId: number;
    name: string;
    role: string;
  };
  let companyRows: CompanyOnMilestone[] = [];
  if (milestoneIds.length > 0) {
    companyRows = await db
      .select({
        milestoneId: milestoneEntryCompanies.milestoneId,
        projectCompanyId: projectCompanies.id,
        companyId: companies.id,
        name: companies.name,
        role: projectCompanies.roleOnProject,
      })
      .from(milestoneEntryCompanies)
      .innerJoin(
        projectCompanies,
        eq(projectCompanies.id, milestoneEntryCompanies.projectCompanyId),
      )
      .innerJoin(companies, eq(companies.id, projectCompanies.companyId))
      .where(inArray(milestoneEntryCompanies.milestoneId, milestoneIds));
  }

  type Bucket = {
    projectId: number;
    startDate: Date | null;
    endDate: Date | null;
    companies: Map<
      number,
      {
        projectCompanyId: number;
        companyId: number;
        name: string;
        role: string;
        entry: Date;
        exit: Date;
      }
    >;
    milestoneCount: number;
  };
  const buckets = new Map<number, Bucket>();
  for (const p of projectRows) {
    buckets.set(p.id, {
      projectId: p.id,
      startDate: null,
      endDate: null,
      companies: new Map(),
      milestoneCount: 0,
    });
  }
  for (const m of milestoneRows) {
    const b = buckets.get(m.projectId);
    if (!b) continue;
    b.milestoneCount += 1;
    if (!b.startDate || m.currentDate < b.startDate) b.startDate = m.currentDate;
    if (!b.endDate || m.currentDate > b.endDate) b.endDate = m.currentDate;
  }
  for (const c of companyRows) {
    const m = milestoneById.get(c.milestoneId);
    if (!m) continue;
    const b = buckets.get(m.projectId);
    if (!b) continue;
    const existing = b.companies.get(c.projectCompanyId);
    if (!existing) {
      b.companies.set(c.projectCompanyId, {
        projectCompanyId: c.projectCompanyId,
        companyId: c.companyId,
        name: c.name,
        role: c.role,
        entry: m.currentDate,
        exit: m.currentDate,
      });
    } else {
      if (m.currentDate < existing.entry) existing.entry = m.currentDate;
      if (m.currentDate > existing.exit) existing.exit = m.currentDate;
    }
  }

  return res.json(
    projectRows.map((p) => {
      const b = buckets.get(p.id)!;
      return {
        id: p.id,
        name: p.name,
        code: p.code,
        scheduleStatus: p.scheduleStatus,
        startDate: isoOrNull(b.startDate),
        endDate: isoOrNull(b.endDate),
        milestoneCount: b.milestoneCount,
        companies: Array.from(b.companies.values())
          .sort((a, z) => a.entry.getTime() - z.entry.getTime())
          .map((c) => ({
            projectCompanyId: c.projectCompanyId,
            companyId: c.companyId,
            name: c.name,
            role: c.role,
            entryDate: c.entry.toISOString(),
            exitDate: c.exit.toISOString(),
          })),
      };
    }),
  );
});

router.get("/me/client-reviews", async (req: Request, res: Response) => {
  const ctx = req.auth_ctx!;
  const projectIds = await listClientProjectIds(ctx.userId);
  if (projectIds.length === 0) return res.json([]);

  const rows = await db
    .select({
      id: changeEvents.id,
      editKind: changeEvents.editKind,
      projectId: projects.id,
      projectName: projects.name,
      projectCode: projects.code,
      milestoneId: milestones.id,
      milestoneCode: milestones.code,
      milestoneName: milestones.name,
      stageCode: milestones.stageCode,
      initiatedAt: changeEvents.initiatedAt,
      oldDate: changeEvents.oldDate,
      proposedNewDate: changeEvents.proposedNewDate,
      proposedChanges: changeEvents.proposedChanges,
      changeReason: changeEvents.changeReason,
      status: changeEvents.status,
    })
    .from(changeEvents)
    .innerJoin(milestones, eq(milestones.id, changeEvents.milestoneId))
    .innerJoin(projects, eq(projects.id, milestones.projectId))
    .where(
      and(
        eq(changeEvents.status, "SentForClientReview"),
        inArray(milestones.projectId, projectIds),
      ),
    )
    .orderBy(asc(changeEvents.initiatedAt));

  return res.json(
    rows.map((r) => ({
      ...r,
      stageName: stageNameByCode.get(r.stageCode) ?? r.stageCode,
      initiatedAt: r.initiatedAt.toISOString(),
      oldDate: isoOrNull(r.oldDate),
      proposedNewDate: isoOrNull(r.proposedNewDate),
      proposedChanges: r.proposedChanges ?? null,
    })),
  );
});

router.get(
  "/me/client-reviews/:changeEventId",
  async (req: Request, res: Response) => {
    const parsed = GetClientReviewDetailParams.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid changeEventId" });
    }
    const { changeEventId } = parsed.data;
    const projectId = await getProjectIdForChangeEvent(changeEventId);
    if (!projectId) {
      return res.status(404).json({ error: "Change event not found" });
    }
    if (!(await requireClientAccess(req, res, projectId))) return;

    const detail = await loadChangeEventDetailResponse(changeEventId);
    if (!detail) return res.status(404).json({ error: "Change event not found" });
    return res.json(detail);
  },
);

router.post(
  "/me/client-reviews/:changeEventId/decision",
  async (req: Request, res: Response) => {
    const paramsParsed = SubmitClientDecisionParams.safeParse(req.params);
    if (!paramsParsed.success) {
      return res.status(400).json({ error: "Invalid changeEventId" });
    }
    const bodyParsed = SubmitClientDecisionBody.safeParse(req.body);
    if (!bodyParsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid request body: " + bodyParsed.error.message });
    }
    const { changeEventId } = paramsParsed.data;
    const { decision, comment } = bodyParsed.data;

    const projectId = await getProjectIdForChangeEvent(changeEventId);
    if (!projectId) {
      return res.status(404).json({ error: "Change event not found" });
    }
    if (!(await requireClientAccess(req, res, projectId))) return;

    const [ev] = await db
      .select()
      .from(changeEvents)
      .where(eq(changeEvents.id, changeEventId))
      .limit(1);
    if (!ev) return res.status(404).json({ error: "Change event not found" });

    if (ev.status !== "SentForClientReview") {
      return res.status(400).json({
        error: `Cannot record a client decision on a change event in status ${ev.status}`,
      });
    }

    const trimmedComment = comment?.trim();
    if (decision === "reject" && (!trimmedComment || trimmedComment.length === 0)) {
      return res
        .status(400)
        .json({ error: "A comment is required when rejecting a change event." });
    }

    const nextStatus = decision === "approve" ? "ClientApproved" : "ClientRejected";

    await db
      .update(changeEvents)
      .set({
        status: nextStatus,
        clientDecisionAt: new Date(),
        clientUserId: req.auth_ctx!.userId,
        ...(trimmedComment && trimmedComment.length > 0
          ? { clientComment: trimmedComment }
          : {}),
      })
      .where(eq(changeEvents.id, changeEventId));

    const detail = await loadChangeEventDetailResponse(changeEventId);
    if (!detail) return res.status(404).json({ error: "Change event not found" });
    return res.json(detail);
  },
);

// ---------------------------------------------------------------------------
// Baseline review (client-facing)
// ---------------------------------------------------------------------------

async function loadBaselineDetail(baselineId: number) {
  const [b] = await db
    .select({
      id: scheduleBaselines.id,
      projectId: scheduleBaselines.projectId,
      projectName: projects.name,
      projectCode: projects.code,
      status: scheduleBaselines.status,
      submittedAt: scheduleBaselines.submittedAt,
      submittedByUserId: scheduleBaselines.submittedByUserId,
      submissionNote: scheduleBaselines.submissionNote,
      decidedAt: scheduleBaselines.decidedAt,
      decidedByUserId: scheduleBaselines.decidedByUserId,
      decisionComment: scheduleBaselines.decisionComment,
      snapshot: scheduleBaselines.snapshot,
    })
    .from(scheduleBaselines)
    .innerJoin(projects, eq(projects.id, scheduleBaselines.projectId))
    .where(eq(scheduleBaselines.id, baselineId))
    .limit(1);
  if (!b) return null;
  const userIds = [b.submittedByUserId, b.decidedByUserId].filter(
    (x): x is number => x !== null,
  );
  let emailById = new Map<number, string | null>();
  if (userIds.length > 0) {
    const userRows = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, userIds));
    emailById = new Map(userRows.map((u) => [u.id, u.email]));
  }
  const ms = (b.snapshot as Array<Record<string, unknown>>) ?? [];
  const deliveries = await loadBaselineDecisionDeliveries(baselineId);
  return {
    id: b.id,
    projectId: b.projectId,
    projectName: b.projectName,
    projectCode: b.projectCode,
    status: b.status,
    submittedAt: b.submittedAt.toISOString(),
    submittedByUserId: b.submittedByUserId,
    submittedByEmail: b.submittedByUserId ? emailById.get(b.submittedByUserId) ?? null : null,
    submissionNote: b.submissionNote,
    decidedAt: isoOrNull(b.decidedAt),
    decidedByUserId: b.decidedByUserId,
    decidedByEmail: b.decidedByUserId ? emailById.get(b.decidedByUserId) ?? null : null,
    decisionComment: b.decisionComment,
    milestoneCount: ms.length,
    milestones: ms,
    decisionDeliveries: deliveries,
  };
}

export async function loadBaselineDecisionDeliveries(baselineId: number) {
  const rows = await db
    .select({
      id: baselineNotificationDeliveries.id,
      recipientUserId: baselineNotificationDeliveries.recipientUserId,
      recipientEmail: baselineNotificationDeliveries.recipientEmail,
      channel: baselineNotificationDeliveries.channel,
      status: baselineNotificationDeliveries.status,
      subject: baselineNotificationDeliveries.subject,
      errorMessage: baselineNotificationDeliveries.errorMessage,
      attemptedAt: baselineNotificationDeliveries.attemptedAt,
      triggeredByUserId: baselineNotificationDeliveries.triggeredByUserId,
    })
    .from(baselineNotificationDeliveries)
    .where(eq(baselineNotificationDeliveries.baselineId, baselineId))
    .orderBy(asc(baselineNotificationDeliveries.attemptedAt));

  const userIds = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.recipientUserId, r.triggeredByUserId])
        .filter((x): x is number => x !== null),
    ),
  );
  let emailById = new Map<number, string | null>();
  if (userIds.length > 0) {
    const userRows = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, userIds));
    emailById = new Map(userRows.map((u) => [u.id, u.email]));
  }

  return rows.map((r) => ({
    id: r.id,
    recipientUserId: r.recipientUserId,
    recipientEmail: r.recipientEmail,
    recipientUserEmail: r.recipientUserId
      ? emailById.get(r.recipientUserId) ?? null
      : null,
    channel: r.channel,
    status: r.status,
    subject: r.subject,
    errorMessage: r.errorMessage,
    attemptedAt: r.attemptedAt.toISOString(),
    triggeredByUserId: r.triggeredByUserId,
    triggeredByEmail: r.triggeredByUserId
      ? emailById.get(r.triggeredByUserId) ?? null
      : null,
  }));
}

router.get("/me/baseline-reviews", async (req: Request, res: Response) => {
  const ctx = req.auth_ctx!;
  const projectIds = await listClientProjectIds(ctx.userId);
  if (projectIds.length === 0) return res.json([]);

  const rows = await db
    .select({
      id: scheduleBaselines.id,
      projectId: scheduleBaselines.projectId,
      projectName: projects.name,
      projectCode: projects.code,
      status: scheduleBaselines.status,
      submittedAt: scheduleBaselines.submittedAt,
      submittedByUserId: scheduleBaselines.submittedByUserId,
      submissionNote: scheduleBaselines.submissionNote,
      snapshot: scheduleBaselines.snapshot,
    })
    .from(scheduleBaselines)
    .innerJoin(projects, eq(projects.id, scheduleBaselines.projectId))
    .where(
      and(
        eq(scheduleBaselines.status, "Pending"),
        inArray(scheduleBaselines.projectId, projectIds),
      ),
    )
    .orderBy(desc(scheduleBaselines.submittedAt));

  const submitterIds = rows
    .map((r) => r.submittedByUserId)
    .filter((x): x is number => x !== null);
  let emailById = new Map<number, string | null>();
  if (submitterIds.length > 0) {
    const userRows = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, submitterIds));
    emailById = new Map(userRows.map((u) => [u.id, u.email]));
  }

  return res.json(
    rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      projectName: r.projectName,
      projectCode: r.projectCode,
      status: r.status,
      submittedAt: r.submittedAt.toISOString(),
      submittedByEmail: r.submittedByUserId ? emailById.get(r.submittedByUserId) ?? null : null,
      submissionNote: r.submissionNote,
      milestoneCount: Array.isArray(r.snapshot) ? r.snapshot.length : 0,
    })),
  );
});

router.get("/me/baseline-reviews/:baselineId", async (req: Request, res: Response) => {
  const parsed = GetBaselineReviewDetailParams.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: "Invalid baselineId" });
  const { baselineId } = parsed.data;
  const [b] = await db
    .select({ projectId: scheduleBaselines.projectId })
    .from(scheduleBaselines)
    .where(eq(scheduleBaselines.id, baselineId))
    .limit(1);
  if (!b) return res.status(404).json({ error: "Baseline not found" });
  if (!(await requireClientAccess(req, res, b.projectId))) return;
  const detail = await loadBaselineDetail(baselineId);
  if (!detail) return res.status(404).json({ error: "Baseline not found" });
  return res.json(detail);
});

router.post(
  "/me/baseline-reviews/:baselineId/decision",
  async (req: Request, res: Response) => {
    const p = SubmitBaselineDecisionParams.safeParse(req.params);
    if (!p.success) return res.status(400).json({ error: "Invalid baselineId" });
    const body = SubmitBaselineDecisionBody.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: "Invalid body: " + body.error.message });
    }
    const { baselineId } = p.data;
    const { decision, comment } = body.data;

    const [b] = await db
      .select()
      .from(scheduleBaselines)
      .where(eq(scheduleBaselines.id, baselineId))
      .limit(1);
    if (!b) return res.status(404).json({ error: "Baseline not found" });
    if (!(await requireClientAccess(req, res, b.projectId))) return;
    if (b.status !== "Pending") {
      return res.status(400).json({
        error: `Cannot decide on a baseline in status ${b.status}.`,
      });
    }
    const trimmed = comment?.trim();
    if (decision === "reject" && (!trimmed || trimmed.length === 0)) {
      return res
        .status(400)
        .json({ error: "A comment is required when rejecting a baseline." });
    }

    const now = new Date();
    const nextStatus = decision === "approve" ? "Approved" : "Rejected";

    await db.transaction(async (tx) => {
      await tx
        .update(scheduleBaselines)
        .set({
          status: nextStatus,
          decidedAt: now,
          decidedByUserId: req.auth_ctx!.userId,
          decisionComment: trimmed && trimmed.length > 0 ? trimmed : null,
        })
        .where(eq(scheduleBaselines.id, baselineId));
      if (decision === "approve") {
        await tx
          .update(projects)
          .set({ scheduleStatus: "Baselined", baselinedAt: now })
          .where(eq(projects.id, b.projectId));
      } else {
        await tx
          .update(projects)
          .set({ scheduleStatus: "Draft" })
          .where(eq(projects.id, b.projectId));
      }
    });

    try {
      await sendBaselineDecisionNotifications({
        baselineId,
        deciderUserId: req.auth_ctx!.userId,
      });
    } catch (err) {
      logger.error(
        { err, baselineId },
        "baseline-decision: failed to enqueue PM notifications",
      );
    }

    const detail = await loadBaselineDetail(baselineId);
    if (!detail) return res.status(404).json({ error: "Baseline not found" });
    return res.json(detail);
  },
);

export default router;
