import { Router, type IRouter } from "express";
import {
  GetCompanyUpcomingMilestonesParams,
  GetCompanyPendingImpactsParams,
  GetProjectSummaryParams,
  RespondToImpactParams,
  RespondToImpactBody,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  milestones,
  milestoneEntryCompanies,
  milestoneImpacts,
  projectCompanies,
  changeEvents,
  projects,
} from "@workspace/db";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";

const router: IRouter = Router();

const STAGE_INFO = [
  { code: "ST1_PRE_DESIGN_CONCEPT", name: "Pre-design and Concept", order: 1 },
  {
    code: "ST2_DESIGN_DEVELOPMENT",
    name: "Design Development (Architecture, Structure, MEP)",
    order: 2,
  },
  {
    code: "ST3_AUTHORITY_APPROVALS",
    name: "Authority Approvals and NOCs",
    order: 3,
  },
  {
    code: "ST4_DETAILED_DESIGN_TENDER",
    name: "Detailed Design, Tender Documents and Contractor Award",
    order: 4,
  },
  {
    code: "ST5_CONSTRUCTION_SHELL_CORE",
    name: "Construction – Shell and Core",
    order: 5,
  },
  {
    code: "ST6_CONSTRUCTION_MEP_BLOCKWORK",
    name: "Construction – MEP Rough-in, Blockwork and Exterior",
    order: 6,
  },
  { code: "ST7_INTERIOR_FITOUT", name: "Interior Fit-Out and Finishes", order: 7 },
  {
    code: "ST8_EXTERNAL_WORKS_FINAL_MEP",
    name: "External Works, Landscape and Final MEP",
    order: 8,
  },
  {
    code: "ST9_COMPLETION_SNAGGING_HANDOVER",
    name: "Completion Certificate, Snagging and Authority Handover",
    order: 9,
  },
  {
    code: "ST10_CLIENT_HANDOVER_DLP",
    name: "Client Handover and Defects Liability",
    order: 10,
  },
] as const;

const stageNameByCode = new Map(STAGE_INFO.map((s) => [s.code, s.name]));

router.get("/projects/:projectId/summary", async (req, res) => {
  const parsed = GetProjectSummaryParams.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid params" });
  }
  const { projectId } = parsed.data;

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const allMilestones = await db
    .select()
    .from(milestones)
    .where(eq(milestones.projectId, projectId));

  // For dashboard counts we don't have a companyId in this route — but the
  // dashboard hardcodes a single company. We aggregate raw stage counts here;
  // company-scoped counts come from the entries join.
  const entries = await db
    .select({
      milestoneId: milestoneEntryCompanies.milestoneId,
      projectCompanyId: milestoneEntryCompanies.projectCompanyId,
    })
    .from(milestoneEntryCompanies)
    .innerJoin(
      milestones,
      eq(milestoneEntryCompanies.milestoneId, milestones.id),
    )
    .where(eq(milestones.projectId, projectId));

  const companyId = Number(req.query.companyId ?? NaN);
  const hasCompanyFilter = Number.isFinite(companyId);

  // Find project_company id for this company on this project, if filter set.
  let companyPcIds: number[] = [];
  if (hasCompanyFilter) {
    const pcs = await db
      .select({ id: projectCompanies.id })
      .from(projectCompanies)
      .where(
        and(
          eq(projectCompanies.projectId, projectId),
          eq(projectCompanies.companyId, companyId),
        ),
      );
    companyPcIds = pcs.map((p) => p.id);
  }

  const companyMilestoneIds = new Set(
    entries
      .filter((e) => companyPcIds.includes(e.projectCompanyId))
      .map((e) => e.milestoneId),
  );

  const stages = STAGE_INFO.map((s) => {
    const stageMilestones = allMilestones.filter((m) => m.stageCode === s.code);
    return {
      stageCode: s.code,
      name: s.name,
      order: s.order,
      milestoneCount: stageMilestones.length,
      keyOutputCount: stageMilestones.filter((m) => m.isKeyOutput).length,
      companyMilestoneCount: stageMilestones.filter((m) =>
        companyMilestoneIds.has(m.id),
      ).length,
    };
  });

  const now = new Date();

  let upcomingCount = 0;
  let pendingCount = 0;

  if (hasCompanyFilter && companyPcIds.length > 0) {
    const upcoming = allMilestones.filter(
      (m) => companyMilestoneIds.has(m.id) && m.currentDate > now,
    );
    upcomingCount = upcoming.length;

    const pending = await db
      .select({ id: milestoneImpacts.id })
      .from(milestoneImpacts)
      .innerJoin(milestones, eq(milestoneImpacts.milestoneId, milestones.id))
      .where(
        and(
          eq(milestones.projectId, projectId),
          eq(milestoneImpacts.responseStatus, "Pending"),
          inArray(milestoneImpacts.projectCompanyId, companyPcIds),
        ),
      );
    pendingCount = pending.length;
  }

  return res.json({
    projectId: project.id,
    projectName: project.name,
    projectCode: project.code,
    stages,
    upcomingMilestoneCount: upcomingCount,
    pendingImpactCount: pendingCount,
  });
});

router.get(
  "/company/:companyId/projects/:projectId/milestones/upcoming",
  async (req, res) => {
    const parsed = GetCompanyUpcomingMilestonesParams.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid params" });
    }
    const { companyId, projectId } = parsed.data;

    const pcs = await db
      .select({ id: projectCompanies.id })
      .from(projectCompanies)
      .where(
        and(
          eq(projectCompanies.projectId, projectId),
          eq(projectCompanies.companyId, companyId),
        ),
      );
    if (pcs.length === 0) {
      return res.json([]);
    }
    const pcIds = pcs.map((p) => p.id);

    const rows = await db
      .selectDistinct({
        id: milestones.id,
        code: milestones.code,
        name: milestones.name,
        stageCode: milestones.stageCode,
        currentDate: milestones.currentDate,
        baselineDate: milestones.baselineDate,
        previousDate: milestones.previousDate,
        status: milestones.status,
        isKeyOutput: milestones.isKeyOutput,
        criticalFlag: milestones.criticalFlag,
        ownerRole: milestones.ownerRole,
      })
      .from(milestones)
      .innerJoin(
        milestoneEntryCompanies,
        eq(milestoneEntryCompanies.milestoneId, milestones.id),
      )
      .where(
        and(
          eq(milestones.projectId, projectId),
          inArray(milestoneEntryCompanies.projectCompanyId, pcIds),
          gte(milestones.currentDate, sql`now()`),
        ),
      )
      .orderBy(asc(milestones.currentDate));

    return res.json(
      rows.map((r) => ({
        ...r,
        stageName: stageNameByCode.get(r.stageCode) ?? r.stageCode,
        currentDate: r.currentDate.toISOString(),
        baselineDate: r.baselineDate.toISOString(),
        previousDate: r.previousDate ? r.previousDate.toISOString() : null,
      })),
    );
  },
);

router.get(
  "/company/:companyId/projects/:projectId/impacts/pending",
  async (req, res) => {
    const parsed = GetCompanyPendingImpactsParams.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid params" });
    }
    const { companyId, projectId } = parsed.data;

    const pcs = await db
      .select({ id: projectCompanies.id })
      .from(projectCompanies)
      .where(
        and(
          eq(projectCompanies.projectId, projectId),
          eq(projectCompanies.companyId, companyId),
        ),
      );
    if (pcs.length === 0) {
      return res.json([]);
    }
    const pcIds = pcs.map((p) => p.id);

    const rows = await db
      .select({
        id: milestoneImpacts.id,
        milestoneId: milestoneImpacts.milestoneId,
        milestoneName: milestones.name,
        milestoneCode: milestones.code,
        stageCode: milestones.stageCode,
        oldDate: milestoneImpacts.oldDate,
        newDate: milestoneImpacts.newDate,
        changeReason: changeEvents.changeReason,
        changeEventStatus: changeEvents.status,
        notifiedAt: milestoneImpacts.notifiedAt,
        responseStatus: milestoneImpacts.responseStatus,
        isKeyOutput: milestones.isKeyOutput,
      })
      .from(milestoneImpacts)
      .innerJoin(
        changeEvents,
        eq(milestoneImpacts.changeEventId, changeEvents.id),
      )
      .innerJoin(milestones, eq(milestoneImpacts.milestoneId, milestones.id))
      .where(
        and(
          eq(milestones.projectId, projectId),
          eq(milestoneImpacts.responseStatus, "Pending"),
          inArray(milestoneImpacts.projectCompanyId, pcIds),
        ),
      )
      .orderBy(desc(milestoneImpacts.notifiedAt));

    return res.json(
      rows.map((r) => ({
        ...r,
        stageName: stageNameByCode.get(r.stageCode) ?? r.stageCode,
        oldDate: r.oldDate.toISOString(),
        newDate: r.newDate.toISOString(),
        notifiedAt: r.notifiedAt.toISOString(),
      })),
    );
  },
);

router.post("/impacts/:impactId/respond", async (req, res) => {
  const paramsParsed = RespondToImpactParams.safeParse(req.params);
  if (!paramsParsed.success) {
    return res.status(400).json({ error: "Invalid impactId" });
  }
  const bodyParsed = RespondToImpactBody.safeParse(req.body);
  if (!bodyParsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid request body: " + bodyParsed.error.message });
  }
  const { impactId } = paramsParsed.data;
  const body = bodyParsed.data;

  const [updated] = await db
    .update(milestoneImpacts)
    .set({
      impactRiskLevel: body.impactRiskLevel,
      impactRiskType: body.impactRiskType,
      mainRiskIssue: body.mainRiskIssue,
      detailedComment: body.detailedComment ?? null,
      responseStatus: "Submitted",
      respondedAt: new Date(),
    })
    .where(eq(milestoneImpacts.id, impactId))
    .returning();

  if (!updated) {
    return res.status(404).json({ error: "Impact not found" });
  }

  return res.json({
    ...updated,
    oldDate: updated.oldDate.toISOString(),
    newDate: updated.newDate.toISOString(),
    notifiedAt: updated.notifiedAt.toISOString(),
    respondedAt: updated.respondedAt
      ? updated.respondedAt.toISOString()
      : null,
  });
});

export default router;
