import { Router, type IRouter, type Request, type Response } from "express";
import {
  RespondToImpactParams,
  RespondToImpactBody,
  SetActiveWorkspaceBody,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  milestones,
  milestoneEntryCompanies,
  milestoneImpacts,
  projectCompanies,
  changeEvents,
  projects,
  companies,
  userCompanies,
} from "@workspace/db";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  requireAuth,
  getProjectCompanyIdsForUser,
  listWorkspacesForUser,
  ACTIVE_WORKSPACE_COOKIE,
} from "../middlewares/auth";
import {
  isCompanyAdmin,
  listAccessibleProjectIds,
  listClientProjectIds,
  getEffectiveProjectAccess,
} from "../middlewares/permissions";
import { projectAssignments } from "@workspace/db";

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

async function buildMeResponse(ctx: NonNullable<Request["auth_ctx"]>) {
  const [memberships, accessibleProjectIds, admin, assignments, clientProjectIds] =
    await Promise.all([
      db
        .select({
          companyId: companies.id,
          companyName: companies.name,
          role: userCompanies.role,
        })
        .from(userCompanies)
        .innerJoin(companies, eq(userCompanies.companyId, companies.id))
        .where(eq(userCompanies.userId, ctx.userId)),
      listAccessibleProjectIds(ctx.userId),
      isCompanyAdmin(ctx.userId),
      db
        .select({
          projectId: projectAssignments.projectId,
          role: projectAssignments.role,
        })
        .from(projectAssignments)
        .where(eq(projectAssignments.userId, ctx.userId)),
      listClientProjectIds(ctx.userId),
    ]);

  const activeWorkspace = ctx.workspaces.find(
    (w) =>
      w.companyId === ctx.activeCompanyId &&
      w.projectId === ctx.activeProjectId,
  );

  const pmSet = new Set<number>();
  const contractorSet = new Set<number>();
  const adminSet = new Set<number>();
  for (const a of assignments) {
    if (a.role === "pm") pmSet.add(a.projectId);
    if (a.role === "admin") adminSet.add(a.projectId);
    if (a.role === "contractor_lead" || a.role === "contractor_member")
      contractorSet.add(a.projectId);
  }
  // Company-admin implicitly gets admin + pm capabilities on every accessible
  // project so the admin UI bootstrap user actually sees something.
  if (admin) {
    for (const id of accessibleProjectIds) {
      adminSet.add(id);
      pmSet.add(id);
    }
  }

  return {
    userId: ctx.userId,
    clerkUserId: ctx.clerkUserId,
    email: ctx.email,
    companies: memberships,
    workspaces: ctx.workspaces,
    activeProjectId: ctx.activeProjectId,
    activeProjectName: activeWorkspace?.projectName ?? null,
    activeProjectCode: activeWorkspace?.projectCode ?? null,
    activeCompanyId: ctx.activeCompanyId,
    activeCompanyName: activeWorkspace?.companyName ?? null,
    isCompanyAdmin: admin,
    hasAnyAccess: accessibleProjectIds.length > 0,
    pmProjectIds: Array.from(pmSet),
    contractorProjectIds: Array.from(contractorSet),
    adminProjectIds: Array.from(adminSet),
    clientProjectIds,
  };
}

router.get("/me", requireAuth, async (req: Request, res: Response) => {
  return res.json(await buildMeResponse(req.auth_ctx!));
});

router.post(
  "/me/active-workspace",
  requireAuth,
  async (req: Request, res: Response) => {
    const parsed = SetActiveWorkspaceBody.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid request body: " + parsed.error.message });
    }
    const { companyId, projectId } = parsed.data;

    // Re-fetch workspaces from the DB rather than trusting the ones already on
    // ctx, so we're authoritative about access here.
    const workspaces = await listWorkspacesForUser(req.auth_ctx!.userId);
    const match = workspaces.find(
      (w) => w.companyId === companyId && w.projectId === projectId,
    );
    if (!match) {
      return res
        .status(400)
        .json({ error: "Workspace not accessible to this user" });
    }

    res.cookie(ACTIVE_WORKSPACE_COOKIE, `${companyId}:${projectId}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 1000 * 60 * 60 * 24 * 365,
    });

    const updatedCtx = {
      ...req.auth_ctx!,
      workspaces,
      activeCompanyId: companyId,
      activeProjectId: projectId,
    };
    return res.json(await buildMeResponse(updatedCtx));
  },
);

async function requireActiveProject(
  req: Request,
  res: Response,
): Promise<{ projectId: number; pcIds: number[] } | null> {
  const ctx = req.auth_ctx!;
  if (!ctx.activeProjectId) {
    res.status(404).json({ error: "No project accessible to this user" });
    return null;
  }
  const pcIds = await getProjectCompanyIdsForUser(
    ctx.userId,
    ctx.activeProjectId,
    ctx.activeCompanyId,
  );
  return { projectId: ctx.activeProjectId, pcIds };
}

router.get("/me/summary", requireAuth, async (req, res) => {
  const ctx = req.auth_ctx!;
  if (!ctx.activeProjectId) {
    return res.status(404).json({ error: "No project accessible to this user" });
  }
  const projectId = ctx.activeProjectId;

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const access = await getEffectiveProjectAccess(ctx.userId, projectId);
  if (!access) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const allMilestones = await db
    .select()
    .from(milestones)
    .where(eq(milestones.projectId, projectId));

  const pcIds = await getProjectCompanyIdsForUser(
    ctx.userId,
    projectId,
    ctx.activeCompanyId,
  );
  // Admins and PMs see project-wide stage counts; contractor-scoped users
  // only see counts derived from their own project_company membership.
  const seesProjectWide = access.isAdmin || access.isPm;

  const entries =
    pcIds.length === 0
      ? []
      : await db
          .select({
            milestoneId: milestoneEntryCompanies.milestoneId,
            projectCompanyId: milestoneEntryCompanies.projectCompanyId,
          })
          .from(milestoneEntryCompanies)
          .innerJoin(
            milestones,
            eq(milestoneEntryCompanies.milestoneId, milestones.id),
          )
          .where(
            and(
              eq(milestones.projectId, projectId),
              inArray(milestoneEntryCompanies.projectCompanyId, pcIds),
            ),
          );

  const companyMilestoneIds = new Set(entries.map((e) => e.milestoneId));

  const stages = STAGE_INFO.map((s) => {
    const stageMilestones = allMilestones.filter((m) => m.stageCode === s.code);
    const scoped = seesProjectWide
      ? stageMilestones
      : stageMilestones.filter((m) => companyMilestoneIds.has(m.id));
    return {
      stageCode: s.code,
      name: s.name,
      order: s.order,
      milestoneCount: scoped.length,
      keyOutputCount: scoped.filter((m) => m.isKeyOutput).length,
      companyMilestoneCount: stageMilestones.filter((m) =>
        companyMilestoneIds.has(m.id),
      ).length,
    };
  });

  const now = new Date();
  let upcomingCount = 0;
  let pendingCount = 0;

  if (pcIds.length > 0) {
    upcomingCount = allMilestones.filter(
      (m) => companyMilestoneIds.has(m.id) && m.currentDate > now,
    ).length;

    const pending = await db
      .select({ id: milestoneImpacts.id })
      .from(milestoneImpacts)
      .innerJoin(milestones, eq(milestoneImpacts.milestoneId, milestones.id))
      .where(
        and(
          eq(milestones.projectId, projectId),
          eq(milestoneImpacts.responseStatus, "Pending"),
          inArray(milestoneImpacts.projectCompanyId, pcIds),
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

router.get("/me/milestones/upcoming", requireAuth, async (req, res) => {
  const ctx = await requireActiveProject(req, res);
  if (!ctx) return;
  const { projectId, pcIds } = ctx;
  if (pcIds.length === 0) return res.json([]);

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
});

router.get("/me/impacts/pending", requireAuth, async (req, res) => {
  const ctx = await requireActiveProject(req, res);
  if (!ctx) return;
  const { projectId, pcIds } = ctx;
  if (pcIds.length === 0) return res.json([]);

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
        sql`${changeEvents.status} <> 'Cancelled'`,
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
});

router.post("/impacts/:impactId/respond", requireAuth, async (req, res) => {
  const ctx = req.auth_ctx!;
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

  const [impact] = await db
    .select()
    .from(milestoneImpacts)
    .where(eq(milestoneImpacts.id, impactId))
    .limit(1);
  if (!impact) {
    return res.status(404).json({ error: "Impact not found" });
  }

  // Authorization: the user must have a project-scoped assignment (or be a
  // company admin on a company that participates in the project) covering
  // the project_company this impact belongs to. Plain company membership is
  // NOT sufficient — an explicit assignment is required.
  const [pcRow] = await db
    .select()
    .from(projectCompanies)
    .where(eq(projectCompanies.id, impact.projectCompanyId))
    .limit(1);
  if (!pcRow) {
    return res.status(404).json({ error: "Impact not found" });
  }

  const access = await getEffectiveProjectAccess(ctx.userId, pcRow.projectId);
  if (!access) {
    return res.status(403).json({ error: "No access to this project" });
  }
  const canRespond =
    access.isAdmin ||
    (access.isContractor &&
      access.projectCompanyIds.includes(impact.projectCompanyId));
  if (!canRespond) {
    return res
      .status(403)
      .json({ error: "Impact is outside your assigned scope" });
  }

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
