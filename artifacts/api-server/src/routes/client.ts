import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  milestones,
  milestoneImpacts,
  projectCompanies,
  changeEvents,
  projects,
  companies,
} from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  GetClientReviewDetailParams,
  SubmitClientDecisionBody,
  SubmitClientDecisionParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import {
  getProjectIdForChangeEvent,
  listClientProjectIds,
  requireClientAccess,
} from "../middlewares/permissions";

const router: IRouter = Router();

router.use(requireAuth);

const STAGE_INFO = [
  { code: "ST1_PRE_DESIGN_CONCEPT", name: "Pre-design and Concept" },
  { code: "ST2_DESIGN_DEVELOPMENT", name: "Design Development" },
  { code: "ST3_AUTHORITY_APPROVALS", name: "Authority Approvals and NOCs" },
  { code: "ST4_DETAILED_DESIGN_TENDER", name: "Detailed Design and Tender" },
  { code: "ST5_CONSTRUCTION_SHELL_CORE", name: "Construction – Shell and Core" },
  { code: "ST6_CONSTRUCTION_MEP_BLOCKWORK", name: "Construction – MEP / Blockwork" },
  { code: "ST7_INTERIOR_FITOUT", name: "Interior Fit-Out" },
  { code: "ST8_EXTERNAL_WORKS_FINAL_MEP", name: "External Works / Final MEP" },
  { code: "ST9_COMPLETION_SNAGGING_HANDOVER", name: "Completion and Handover" },
  { code: "ST10_CLIENT_HANDOVER_DLP", name: "Client Handover and DLP" },
] as const;

const stageNameByCode = new Map(STAGE_INFO.map((s) => [s.code, s.name]));

function isoOrNull(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

async function loadChangeEventDetailResponse(id: number) {
  const [ev] = await db
    .select({
      id: changeEvents.id,
      milestoneId: changeEvents.milestoneId,
      milestoneCode: milestones.code,
      milestoneName: milestones.name,
      stageCode: milestones.stageCode,
      initiatedAt: changeEvents.initiatedAt,
      oldDate: changeEvents.oldDate,
      proposedNewDate: changeEvents.proposedNewDate,
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
    milestoneId: ev.milestoneId,
    milestoneCode: ev.milestoneCode,
    milestoneName: ev.milestoneName,
    stageCode: ev.stageCode,
    stageName: stageNameByCode.get(ev.stageCode) ?? ev.stageCode,
    initiatedAt: ev.initiatedAt.toISOString(),
    oldDate: ev.oldDate.toISOString(),
    proposedNewDate: ev.proposedNewDate.toISOString(),
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

router.get("/me/client-reviews", async (req: Request, res: Response) => {
  const ctx = req.auth_ctx!;
  const projectIds = await listClientProjectIds(ctx.userId);
  if (projectIds.length === 0) return res.json([]);

  const rows = await db
    .select({
      id: changeEvents.id,
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
      oldDate: r.oldDate.toISOString(),
      proposedNewDate: r.proposedNewDate.toISOString(),
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

export default router;
