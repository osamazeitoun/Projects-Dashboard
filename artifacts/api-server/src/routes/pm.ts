import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  milestones,
  milestoneEntryCompanies,
  milestoneImpacts,
  projectCompanies,
  changeEvents,
  changeEventEvents,
  projects,
  companies,
  notificationDeliveries,
  users,
} from "@workspace/db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  CreateChangeEventBody,
  CreateChangeEventParams,
  TransitionChangeEventBody,
  TransitionChangeEventParams,
  EditChangeEventBody,
  EditChangeEventParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import {
  getEffectiveProjectAccess,
  getProjectIdForMilestone,
  getProjectIdForChangeEvent,
  listPmProjectIds,
} from "../middlewares/permissions";
import { sendChangeEventNotifications } from "../services/notifications";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.use(requireAuth);

async function requirePmAccess(
  req: Request,
  res: Response,
  projectId: number,
): Promise<boolean> {
  const access = await getEffectiveProjectAccess(req.auth_ctx!.userId, projectId);
  if (!access) {
    res.status(403).json({ error: "No access to this project" });
    return false;
  }
  if (!(access.isAdmin || access.isPm)) {
    res.status(403).json({ error: "PM access required" });
    return false;
  }
  return true;
}


const STAGE_INFO = [
  { code: "ST1_PRE_DESIGN_CONCEPT", name: "Pre-design and Concept", order: 1 },
  { code: "ST2_DESIGN_DEVELOPMENT", name: "Design Development", order: 2 },
  { code: "ST3_AUTHORITY_APPROVALS", name: "Authority Approvals and NOCs", order: 3 },
  { code: "ST4_DETAILED_DESIGN_TENDER", name: "Detailed Design and Tender", order: 4 },
  { code: "ST5_CONSTRUCTION_SHELL_CORE", name: "Construction – Shell and Core", order: 5 },
  { code: "ST6_CONSTRUCTION_MEP_BLOCKWORK", name: "Construction – MEP / Blockwork", order: 6 },
  { code: "ST7_INTERIOR_FITOUT", name: "Interior Fit-Out", order: 7 },
  { code: "ST8_EXTERNAL_WORKS_FINAL_MEP", name: "External Works / Final MEP", order: 8 },
  { code: "ST9_COMPLETION_SNAGGING_HANDOVER", name: "Completion and Handover", order: 9 },
  { code: "ST10_CLIENT_HANDOVER_DLP", name: "Client Handover and DLP", order: 10 },
] as const;

const stageNameByCode = new Map(STAGE_INFO.map((s) => [s.code, s.name]));
const stageOrderByCode = new Map(STAGE_INFO.map((s) => [s.code, s.order]));

const OVERDUE_DAYS = 3;

function isoOrNull(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

type LatestDelivery = {
  status: "Sent" | "Failed";
  channel: "email" | "log";
  attemptedAt: Date;
  errorMessage: string | null;
  recipientEmail: string;
};

async function getLatestDeliveriesByImpactId(
  impactIds: number[],
): Promise<{ latest: Map<number, LatestDelivery>; counts: Map<number, number> }> {
  if (impactIds.length === 0) {
    return { latest: new Map(), counts: new Map() };
  }
  const rows = await db
    .select({
      id: notificationDeliveries.id,
      milestoneImpactId: notificationDeliveries.milestoneImpactId,
      status: notificationDeliveries.status,
      channel: notificationDeliveries.channel,
      attemptedAt: notificationDeliveries.attemptedAt,
      errorMessage: notificationDeliveries.errorMessage,
      recipientEmail: notificationDeliveries.recipientEmail,
    })
    .from(notificationDeliveries)
    .where(inArray(notificationDeliveries.milestoneImpactId, impactIds))
    .orderBy(desc(notificationDeliveries.attemptedAt));

  const latest = new Map<number, LatestDelivery>();
  const counts = new Map<number, number>();
  for (const r of rows) {
    counts.set(r.milestoneImpactId, (counts.get(r.milestoneImpactId) ?? 0) + 1);
    if (!latest.has(r.milestoneImpactId)) {
      latest.set(r.milestoneImpactId, {
        status: r.status as "Sent" | "Failed",
        channel: r.channel as "email" | "log",
        attemptedAt: r.attemptedAt,
        errorMessage: r.errorMessage,
        recipientEmail: r.recipientEmail,
      });
    }
  }
  return { latest, counts };
}

function deriveContact(companyName: string): { name: string; email: string } {
  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 12) || "contact";
  return {
    name: `${companyName.split(" ")[0]} PM Lead`,
    email: `pm@${slug}.com`,
  };
}

router.get("/projects", async (req, res) => {
  const accessibleIds = await listPmProjectIds(req.auth_ctx!.userId);
  if (accessibleIds.length === 0) return res.json([]);

  const projectRows = await db
    .select()
    .from(projects)
    .where(inArray(projects.id, accessibleIds))
    .orderBy(asc(projects.id));

  const counts = await db
    .select({
      projectId: projects.id,
      companyCount: sql<number>`COUNT(DISTINCT ${projectCompanies.id})`,
      milestoneCount: sql<number>`COUNT(DISTINCT ${milestones.id})`,
    })
    .from(projects)
    .leftJoin(projectCompanies, eq(projectCompanies.projectId, projects.id))
    .leftJoin(milestones, eq(milestones.projectId, projects.id))
    .where(inArray(projects.id, accessibleIds))
    .groupBy(projects.id);

  const countMap = new Map(counts.map((c) => [c.projectId, c]));

  return res.json(
    projectRows.map((p) => {
      const c = countMap.get(p.id);
      return {
        id: p.id,
        name: p.name,
        code: p.code,
        companyCount: Number(c?.companyCount ?? 0),
        milestoneCount: Number(c?.milestoneCount ?? 0),
      };
    }),
  );
});

router.get("/projects/:projectId/pm-summary", async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: "Invalid projectId" });
  if (!(await requirePmAccess(req, res, projectId))) return;

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const [gc] = await db
    .select({ name: companies.name })
    .from(projectCompanies)
    .innerJoin(companies, eq(companies.id, projectCompanies.companyId))
    .where(and(eq(projectCompanies.projectId, projectId), eq(companies.type, "MainContractor")))
    .limit(1);

  const allMilestones = await db.select().from(milestones).where(eq(milestones.projectId, projectId));

  const stages = STAGE_INFO.map((s) => {
    const ms = allMilestones.filter((m) => m.stageCode === s.code);
    return {
      stageCode: s.code,
      name: s.name,
      order: s.order,
      milestoneCount: ms.length,
      atRiskCount: ms.filter((m) => m.status === "AtRisk" || m.status === "Delayed").length,
      completedCount: ms.filter((m) => m.status === "Completed").length,
    };
  });

  const atRiskMilestoneCount = allMilestones.filter((m) => m.status === "AtRisk").length;
  const delayedMilestoneCount = allMilestones.filter((m) => m.status === "Delayed").length;
  const completedMilestoneCount = allMilestones.filter((m) => m.status === "Completed").length;
  const keyOutputCount = allMilestones.filter((m) => m.isKeyOutput).length;

  const openChangeEvents = await db
    .select({ id: changeEvents.id })
    .from(changeEvents)
    .innerJoin(milestones, eq(milestones.id, changeEvents.milestoneId))
    .where(
      and(
        eq(milestones.projectId, projectId),
        sql`${changeEvents.status} NOT IN ('PMApproved', 'Cancelled', 'ClientRejected')`,
      ),
    );

  const pendingImpacts = await db
    .select({ id: milestoneImpacts.id, notifiedAt: milestoneImpacts.notifiedAt })
    .from(milestoneImpacts)
    .innerJoin(milestones, eq(milestones.id, milestoneImpacts.milestoneId))
    .where(and(eq(milestones.projectId, projectId), eq(milestoneImpacts.responseStatus, "Pending")));

  const overdueCutoff = new Date(Date.now() - OVERDUE_DAYS * 24 * 60 * 60 * 1000);
  const overdueResponseCount = pendingImpacts.filter((p) => p.notifiedAt < overdueCutoff).length;

  // Recent activity: latest 8 change events + responses
  const recentEvents = await db
    .select({
      id: changeEvents.id,
      initiatedAt: changeEvents.initiatedAt,
      milestoneId: changeEvents.milestoneId,
      milestoneCode: milestones.code,
      milestoneName: milestones.name,
      changeReason: changeEvents.changeReason,
    })
    .from(changeEvents)
    .innerJoin(milestones, eq(milestones.id, changeEvents.milestoneId))
    .where(eq(milestones.projectId, projectId))
    .orderBy(desc(changeEvents.initiatedAt))
    .limit(8);

  const recentResponses = await db
    .select({
      id: milestoneImpacts.id,
      respondedAt: milestoneImpacts.respondedAt,
      changeEventId: milestoneImpacts.changeEventId,
      milestoneId: milestoneImpacts.milestoneId,
      milestoneCode: milestones.code,
      milestoneName: milestones.name,
      companyName: companies.name,
      impactRiskLevel: milestoneImpacts.impactRiskLevel,
    })
    .from(milestoneImpacts)
    .innerJoin(milestones, eq(milestones.id, milestoneImpacts.milestoneId))
    .innerJoin(projectCompanies, eq(projectCompanies.id, milestoneImpacts.projectCompanyId))
    .innerJoin(companies, eq(companies.id, projectCompanies.companyId))
    .where(
      and(
        eq(milestones.projectId, projectId),
        sql`${milestoneImpacts.respondedAt} IS NOT NULL`,
      ),
    )
    .orderBy(desc(milestoneImpacts.respondedAt))
    .limit(8);

  const activity = [
    ...recentEvents.map((e) => ({
      id: `ce-${e.id}`,
      kind: "ChangeEventOpened" as const,
      at: e.initiatedAt.toISOString(),
      summary: `Change event opened on ${e.milestoneCode}: ${e.changeReason}`,
      milestoneId: e.milestoneId,
      milestoneCode: e.milestoneCode,
      changeEventId: e.id,
      companyName: null,
    })),
    ...recentResponses.map((r) => ({
      id: `imp-${r.id}`,
      kind: "ImpactResponded" as const,
      at: (r.respondedAt as Date).toISOString(),
      summary: `${r.companyName} responded on ${r.milestoneCode}${r.impactRiskLevel ? ` (${r.impactRiskLevel} risk)` : ""}`,
      milestoneId: r.milestoneId,
      milestoneCode: r.milestoneCode,
      changeEventId: r.changeEventId,
      companyName: r.companyName,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 10);

  return res.json({
    projectId: project.id,
    projectName: project.name,
    projectCode: project.code,
    gcCompanyName: gc?.name ?? "General Contractor",
    totalMilestones: allMilestones.length,
    atRiskMilestoneCount,
    delayedMilestoneCount,
    completedMilestoneCount,
    openChangeEventCount: openChangeEvents.length,
    pendingResponseCount: pendingImpacts.length,
    overdueResponseCount,
    keyOutputCount,
    stages,
    recentActivity: activity,
  });
});

async function getMilestoneCompanies(milestoneIds: number[]) {
  if (milestoneIds.length === 0) return new Map<number, Array<{ projectCompanyId: number; companyId: number; name: string; role: string }>>();
  const rows = await db
    .select({
      milestoneId: milestoneEntryCompanies.milestoneId,
      projectCompanyId: milestoneEntryCompanies.projectCompanyId,
      companyId: companies.id,
      name: companies.name,
      role: projectCompanies.roleOnProject,
    })
    .from(milestoneEntryCompanies)
    .innerJoin(projectCompanies, eq(projectCompanies.id, milestoneEntryCompanies.projectCompanyId))
    .innerJoin(companies, eq(companies.id, projectCompanies.companyId))
    .where(sql`${milestoneEntryCompanies.milestoneId} IN ${milestoneIds}`);
  const map = new Map<number, typeof rows>();
  for (const r of rows) {
    const arr = map.get(r.milestoneId) ?? [];
    arr.push(r);
    map.set(r.milestoneId, arr);
  }
  return map;
}

router.get("/projects/:projectId/milestones", async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: "Invalid projectId" });
  if (!(await requirePmAccess(req, res, projectId))) return;

  const ms = await db
    .select()
    .from(milestones)
    .where(eq(milestones.projectId, projectId))
    .orderBy(asc(milestones.currentDate));

  const ids = ms.map((m) => m.id);
  const companyMap = await getMilestoneCompanies(ids);

  // Count open change events + pending impacts per milestone
  const ceCounts = ids.length
    ? await db
        .select({
          milestoneId: changeEvents.milestoneId,
          openCount: sql<number>`COUNT(CASE WHEN ${changeEvents.status} NOT IN ('PMApproved','Cancelled','ClientRejected') THEN 1 END)`,
        })
        .from(changeEvents)
        .where(sql`${changeEvents.milestoneId} IN ${ids}`)
        .groupBy(changeEvents.milestoneId)
    : [];
  const ceCountMap = new Map(ceCounts.map((c) => [c.milestoneId, Number(c.openCount)]));

  const pendingCounts = ids.length
    ? await db
        .select({
          milestoneId: milestoneImpacts.milestoneId,
          pending: sql<number>`COUNT(*)`,
        })
        .from(milestoneImpacts)
        .where(
          and(
            sql`${milestoneImpacts.milestoneId} IN ${ids}`,
            eq(milestoneImpacts.responseStatus, "Pending"),
          ),
        )
        .groupBy(milestoneImpacts.milestoneId)
    : [];
  const pendingCountMap = new Map(pendingCounts.map((c) => [c.milestoneId, Number(c.pending)]));

  return res.json(
    ms.map((m) => {
      const cos = companyMap.get(m.id) ?? [];
      const owning = cos.filter((c) => c.role === m.ownerRole);
      const contributors = cos.filter((c) => c.role !== m.ownerRole);
      return {
        id: m.id,
        code: m.code,
        name: m.name,
        stageCode: m.stageCode,
        stageName: stageNameByCode.get(m.stageCode) ?? m.stageCode,
        stageOrder: stageOrderByCode.get(m.stageCode) ?? 0,
        status: m.status,
        ownerRole: m.ownerRole,
        currentDate: m.currentDate.toISOString(),
        baselineDate: m.baselineDate.toISOString(),
        previousDate: isoOrNull(m.previousDate),
        isKeyOutput: m.isKeyOutput,
        criticalFlag: m.criticalFlag,
        isPaymentTrigger: m.isPaymentTrigger,
        owningCompanies: owning.map(({ projectCompanyId, companyId, name, role }) => ({
          projectCompanyId,
          companyId,
          name,
          role,
        })),
        contributorCompanies: contributors.map(({ projectCompanyId, companyId, name, role }) => ({
          projectCompanyId,
          companyId,
          name,
          role,
        })),
        openChangeEventCount: ceCountMap.get(m.id) ?? 0,
        pendingResponseCount: pendingCountMap.get(m.id) ?? 0,
      };
    }),
  );
});

router.get("/milestones/:milestoneId/detail", async (req, res) => {
  const milestoneId = Number(req.params.milestoneId);
  if (!Number.isFinite(milestoneId)) return res.status(400).json({ error: "Invalid milestoneId" });

  const projectId = await getProjectIdForMilestone(milestoneId);
  if (!projectId) return res.status(404).json({ error: "Milestone not found" });
  if (!(await requirePmAccess(req, res, projectId))) return;

  const [m] = await db.select().from(milestones).where(eq(milestones.id, milestoneId)).limit(1);
  if (!m) return res.status(404).json({ error: "Milestone not found" });

  const companyMap = await getMilestoneCompanies([m.id]);
  const cos = companyMap.get(m.id) ?? [];
  const owning = cos.filter((c) => c.role === m.ownerRole);
  const contributors = cos.filter((c) => c.role !== m.ownerRole);

  const events = await db
    .select()
    .from(changeEvents)
    .where(eq(changeEvents.milestoneId, milestoneId))
    .orderBy(desc(changeEvents.initiatedAt));

  const eventIds = events.map((e) => e.id);
  const impacts = eventIds.length
    ? await db
        .select({
          id: milestoneImpacts.id,
          changeEventId: milestoneImpacts.changeEventId,
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
        .where(sql`${milestoneImpacts.changeEventId} IN ${eventIds}`)
    : [];

  const { latest: latestByImpactDetail, counts: countsByImpactDetail } =
    await getLatestDeliveriesByImpactId(impacts.map((i) => i.id));

  // Outstanding companies for the latest open event: those involved in milestone who haven't responded.
  const latestOpen = events.find((e) => !["PMApproved", "Cancelled", "ClientRejected"].includes(e.status));
  const outstandingCompanies: typeof cos = [];
  if (latestOpen) {
    const respondedPcIds = new Set(
      impacts
        .filter((i) => i.changeEventId === latestOpen.id && i.responseStatus !== "Pending")
        .map((i) => i.projectCompanyId),
    );
    const involvedPcIds = new Set(
      impacts.filter((i) => i.changeEventId === latestOpen.id).map((i) => i.projectCompanyId),
    );
    for (const pcId of involvedPcIds) {
      if (!respondedPcIds.has(pcId)) {
        const co = cos.find((c) => c.projectCompanyId === pcId);
        if (co) outstandingCompanies.push(co);
      }
    }
  }

  return res.json({
    id: m.id,
    code: m.code,
    name: m.name,
    description: m.description,
    stageCode: m.stageCode,
    stageName: stageNameByCode.get(m.stageCode) ?? m.stageCode,
    stageOrder: stageOrderByCode.get(m.stageCode) ?? 0,
    status: m.status,
    ownerRole: m.ownerRole,
    baselineDate: m.baselineDate.toISOString(),
    currentDate: m.currentDate.toISOString(),
    previousDate: isoOrNull(m.previousDate),
    isKeyOutput: m.isKeyOutput,
    criticalFlag: m.criticalFlag,
    isPaymentTrigger: m.isPaymentTrigger,
    changeReasonLatest: m.changeReasonLatest,
    owningCompanies: owning.map(({ projectCompanyId, companyId, name, role }) => ({
      projectCompanyId,
      companyId,
      name,
      role,
    })),
    contributorCompanies: contributors.map(({ projectCompanyId, companyId, name, role }) => ({
      projectCompanyId,
      companyId,
      name,
      role,
    })),
    changeEvents: events.map((e) => ({
      id: e.id,
      initiatedAt: e.initiatedAt.toISOString(),
      oldDate: e.oldDate.toISOString(),
      proposedNewDate: e.proposedNewDate.toISOString(),
      changeReason: e.changeReason,
      status: e.status,
      impacts: impacts
        .filter((i) => i.changeEventId === e.id)
        .map((i) => {
          const d = latestByImpactDetail.get(i.id) ?? null;
          return {
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
            lastDeliveryStatus: d?.status ?? null,
            lastDeliveryChannel: d?.channel ?? null,
            lastDeliveryAt: d ? d.attemptedAt.toISOString() : null,
            lastDeliveryError: d?.errorMessage ?? null,
            deliveryAttemptCount: countsByImpactDetail.get(i.id) ?? 0,
            recipientEmail: d?.recipientEmail ?? null,
          };
        }),
    })),
    outstandingCompanies: outstandingCompanies.map(({ projectCompanyId, companyId, name, role }) => ({
      projectCompanyId,
      companyId,
      name,
      role,
    })),
  });
});

router.get("/projects/:projectId/companies", async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: "Invalid projectId" });
  if (!(await requirePmAccess(req, res, projectId))) return;

  const pcs = await db
    .select({
      projectCompanyId: projectCompanies.id,
      companyId: companies.id,
      name: companies.name,
      type: companies.type,
      roleOnProject: projectCompanies.roleOnProject,
    })
    .from(projectCompanies)
    .innerJoin(companies, eq(companies.id, projectCompanies.companyId))
    .where(eq(projectCompanies.projectId, projectId))
    .orderBy(asc(companies.name));

  // Milestone counts per project_company
  const allMs = await db.select().from(milestones).where(eq(milestones.projectId, projectId));
  const entries = await db
    .select({
      projectCompanyId: milestoneEntryCompanies.projectCompanyId,
      milestoneId: milestoneEntryCompanies.milestoneId,
    })
    .from(milestoneEntryCompanies)
    .innerJoin(milestones, eq(milestones.id, milestoneEntryCompanies.milestoneId))
    .where(eq(milestones.projectId, projectId));

  const msById = new Map(allMs.map((m) => [m.id, m]));

  // Impact stats per project_company
  const impacts = await db
    .select({
      projectCompanyId: milestoneImpacts.projectCompanyId,
      responseStatus: milestoneImpacts.responseStatus,
      notifiedAt: milestoneImpacts.notifiedAt,
      respondedAt: milestoneImpacts.respondedAt,
    })
    .from(milestoneImpacts)
    .innerJoin(milestones, eq(milestones.id, milestoneImpacts.milestoneId))
    .where(eq(milestones.projectId, projectId));

  const overdueCutoff = new Date(Date.now() - OVERDUE_DAYS * 24 * 60 * 60 * 1000);

  return res.json(
    pcs.map((pc) => {
      const myEntries = entries.filter((e) => e.projectCompanyId === pc.projectCompanyId);
      let owned = 0;
      let contributor = 0;
      for (const e of myEntries) {
        const ms = msById.get(e.milestoneId);
        if (!ms) continue;
        if (ms.ownerRole === pc.roleOnProject) owned += 1;
        else contributor += 1;
      }
      const myImpacts = impacts.filter((i) => i.projectCompanyId === pc.projectCompanyId);
      const pending = myImpacts.filter((i) => i.responseStatus === "Pending");
      const responded = myImpacts.filter((i) => i.respondedAt);
      const overdue = pending.filter((i) => i.notifiedAt < overdueCutoff).length;
      const responseHours = responded
        .map((i) => (i.respondedAt!.getTime() - i.notifiedAt.getTime()) / 3600000)
        .filter((h) => h >= 0);
      const avgResponseHours = responseHours.length
        ? responseHours.reduce((a, b) => a + b, 0) / responseHours.length
        : null;

      let responsiveness: "Responsive" | "Slow" | "NonResponding" | "NoData";
      if (myImpacts.length === 0) responsiveness = "NoData";
      else if (overdue > 0) responsiveness = "NonResponding";
      else if (avgResponseHours !== null && avgResponseHours > 48) responsiveness = "Slow";
      else if (pending.length > responded.length) responsiveness = "Slow";
      else responsiveness = "Responsive";

      const contact = deriveContact(pc.name);

      return {
        projectCompanyId: pc.projectCompanyId,
        companyId: pc.companyId,
        name: pc.name,
        type: pc.type,
        roleOnProject: pc.roleOnProject,
        ownedMilestoneCount: owned,
        contributorMilestoneCount: contributor,
        primaryContactName: contact.name,
        primaryContactEmail: contact.email,
        totalImpacts: myImpacts.length,
        pendingImpacts: pending.length,
        respondedImpacts: responded.length,
        overdueImpacts: overdue,
        avgResponseHours,
        responsiveness,
      };
    }),
  );
});

router.get("/projects/:projectId/change-events", async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: "Invalid projectId" });
  if (!(await requirePmAccess(req, res, projectId))) return;

  const events = await db
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
    })
    .from(changeEvents)
    .innerJoin(milestones, eq(milestones.id, changeEvents.milestoneId))
    .where(eq(milestones.projectId, projectId))
    .orderBy(desc(changeEvents.initiatedAt));

  const eventIds = events.map((e) => e.id);
  const counts = eventIds.length
    ? await db
        .select({
          changeEventId: milestoneImpacts.changeEventId,
          total: sql<number>`COUNT(*)`,
          pending: sql<number>`COUNT(CASE WHEN ${milestoneImpacts.responseStatus} = 'Pending' THEN 1 END)`,
          responded: sql<number>`COUNT(CASE WHEN ${milestoneImpacts.respondedAt} IS NOT NULL THEN 1 END)`,
        })
        .from(milestoneImpacts)
        .where(sql`${milestoneImpacts.changeEventId} IN ${eventIds}`)
        .groupBy(milestoneImpacts.changeEventId)
    : [];
  const countMap = new Map(counts.map((c) => [c.changeEventId, c]));

  return res.json(
    events.map((e) => {
      const c = countMap.get(e.id);
      const total = Number(c?.total ?? 0);
      const responded = Number(c?.responded ?? 0);
      const pending = Number(c?.pending ?? 0);
      let rollupStatus: "Pending" | "PartiallyResponded" | "FullyResponded";
      if (total === 0 || responded === 0) rollupStatus = "Pending";
      else if (responded < total) rollupStatus = "PartiallyResponded";
      else rollupStatus = "FullyResponded";
      return {
        id: e.id,
        milestoneId: e.milestoneId,
        milestoneCode: e.milestoneCode,
        milestoneName: e.milestoneName,
        stageCode: e.stageCode,
        stageName: stageNameByCode.get(e.stageCode) ?? e.stageCode,
        initiatedAt: e.initiatedAt.toISOString(),
        oldDate: e.oldDate.toISOString(),
        proposedNewDate: e.proposedNewDate.toISOString(),
        changeReason: e.changeReason,
        status: e.status,
        impactedCompanyCount: total,
        respondedCount: responded,
        pendingCount: pending,
        rollupStatus,
      };
    }),
  );
});

router.get("/change-events/:changeEventId/detail", async (req, res) => {
  const id = Number(req.params.changeEventId);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid changeEventId" });

  const projectId = await getProjectIdForChangeEvent(id);
  if (!projectId) return res.status(404).json({ error: "Change event not found" });
  if (!(await requirePmAccess(req, res, projectId))) return;

  const detail = await loadChangeEventDetailResponse(id);
  if (!detail) return res.status(404).json({ error: "Change event not found" });
  return res.json(detail);
});

router.post("/change-events/:changeEventId/resend-notifications", async (req, res) => {
  const id = Number(req.params.changeEventId);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid changeEventId" });

  const projectId = await getProjectIdForChangeEvent(id);
  if (!projectId) return res.status(404).json({ error: "Change event not found" });
  if (!(await requirePmAccess(req, res, projectId))) return;

  const rawImpactIds = Array.isArray(req.body?.impactIds) ? req.body.impactIds : undefined;
  let impactIds: number[] | undefined;
  if (rawImpactIds) {
    impactIds = rawImpactIds.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n));
    if (impactIds && impactIds.length > 0) {
      const owned = await db
        .select({ id: milestoneImpacts.id })
        .from(milestoneImpacts)
        .where(
          and(
            eq(milestoneImpacts.changeEventId, id),
            inArray(milestoneImpacts.id, impactIds),
          ),
        );
      if (owned.length !== impactIds.length) {
        return res
          .status(400)
          .json({ error: "One or more impactIds do not belong to this change event" });
      }
    }
  }

  let results;
  try {
    results = await sendChangeEventNotifications({
      changeEventId: id,
      impactIds,
      triggeredByUserId: req.auth_ctx!.userId,
    });
  } catch (err) {
    logger.error({ err, changeEventId: id }, "resend-notifications: unexpected failure");
    return res.status(500).json({ error: "Failed to send notifications" });
  }

  const sent = results.filter((r) => r.status === "Sent").length;
  const failed = results.length - sent;

  return res.json({
    changeEventId: id,
    attempted: results.length,
    sent,
    failed,
    results: results.map((r) => ({
      impactId: r.impactId,
      projectCompanyId: r.projectCompanyId,
      companyName: r.companyName,
      recipientEmail: r.recipientEmail,
      status: r.status,
      channel: r.channel,
      errorMessage: r.errorMessage,
    })),
  });
});

router.post("/milestones/:milestoneId/change-events", async (req, res) => {
  const paramsParsed = CreateChangeEventParams.safeParse(req.params);
  if (!paramsParsed.success) {
    return res.status(400).json({ error: "Invalid milestoneId" });
  }
  const bodyParsed = CreateChangeEventBody.safeParse(req.body);
  if (!bodyParsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid request body: " + bodyParsed.error.message });
  }
  const { milestoneId } = paramsParsed.data;
  const body = bodyParsed.data;

  const projectId = await getProjectIdForMilestone(milestoneId);
  if (!projectId) return res.status(404).json({ error: "Milestone not found" });
  if (!(await requirePmAccess(req, res, projectId))) return;

  const [m] = await db
    .select()
    .from(milestones)
    .where(eq(milestones.id, milestoneId))
    .limit(1);
  if (!m) return res.status(404).json({ error: "Milestone not found" });

  const proposedNewDate = new Date(body.proposedNewDate);
  if (Number.isNaN(proposedNewDate.getTime())) {
    return res.status(400).json({ error: "Invalid proposedNewDate" });
  }
  if (proposedNewDate.getTime() === m.currentDate.getTime()) {
    return res
      .status(400)
      .json({ error: "Proposed date must differ from current date" });
  }

  // Validate that the supplied project_company ids actually belong to this project
  const projectPcs = await db
    .select({ id: projectCompanies.id })
    .from(projectCompanies)
    .where(
      and(
        eq(projectCompanies.projectId, projectId),
        inArray(projectCompanies.id, body.impactedProjectCompanyIds),
      ),
    );
  const validPcIds = new Set(projectPcs.map((p) => p.id));
  if (validPcIds.size !== body.impactedProjectCompanyIds.length) {
    return res
      .status(400)
      .json({ error: "One or more companies are not on this project" });
  }

  const userId = req.auth_ctx!.userId;
  const oldDate = m.currentDate;
  const now = new Date();

  const created = await db.transaction(async (tx) => {
    const [ev] = await tx
      .insert(changeEvents)
      .values({
        milestoneId,
        initiatedByUserId: userId,
        oldDate,
        proposedNewDate,
        changeReason: body.changeReason,
        status: "Draft",
      })
      .returning();

    if (body.impactedProjectCompanyIds.length > 0) {
      await tx.insert(milestoneImpacts).values(
        body.impactedProjectCompanyIds.map((pcId) => ({
          changeEventId: ev.id,
          milestoneId,
          projectCompanyId: pcId,
          oldDate,
          newDate: proposedNewDate,
          notifiedAt: now,
          responseStatus: "Pending" as const,
        })),
      );
    }

    return ev;
  });

  // Deliver real notifications to impacted companies. Per-company failures are
  // recorded in notification_deliveries and surfaced to the PM via the change-event
  // detail; we never fail the whole create just because email delivery failed.
  try {
    await sendChangeEventNotifications({
      changeEventId: created.id,
      triggeredByUserId: userId,
    });
  } catch (err) {
    logger.error(
      { err, changeEventId: created.id },
      "createChangeEvent: notification batch failed (continuing)",
    );
  }

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
    .where(eq(milestoneImpacts.changeEventId, created.id))
    .orderBy(asc(companies.name));

  const { latest: latestByImpactNew, counts: countsByImpactNew } =
    await getLatestDeliveriesByImpactId(impacts.map((i) => i.id));

  const timeline = await loadChangeEventTimeline(
    created.id,
    created.initiatedAt,
    created.initiatedByUserId,
    created.clientDecisionAt,
    created.clientUserId,
    created.status,
  );

  return res.status(201).json({
    id: created.id,
    milestoneId: m.id,
    milestoneCode: m.code,
    milestoneName: m.name,
    stageCode: m.stageCode,
    stageName: stageNameByCode.get(m.stageCode) ?? m.stageCode,
    initiatedAt: created.initiatedAt.toISOString(),
    oldDate: created.oldDate.toISOString(),
    proposedNewDate: created.proposedNewDate.toISOString(),
    changeReason: created.changeReason,
    status: created.status,
    clientComment: created.clientComment,
    clientDecisionAt: isoOrNull(created.clientDecisionAt),
    impacts: impacts.map((i) => {
      const d = latestByImpactNew.get(i.id) ?? null;
      return {
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
        lastDeliveryStatus: d?.status ?? null,
        lastDeliveryChannel: d?.channel ?? null,
        lastDeliveryAt: d ? d.attemptedAt.toISOString() : null,
        lastDeliveryError: d?.errorMessage ?? null,
        deliveryAttemptCount: countsByImpactNew.get(i.id) ?? 0,
        recipientEmail: d?.recipientEmail ?? null,
      };
    }),
    timeline,
  });
});

async function loadChangeEventTimeline(
  changeEventId: number,
  initiatedAt: Date,
  initiatedByUserId: number | null,
  clientDecisionAt: Date | null,
  clientUserId: number | null,
  status: typeof changeEvents.$inferSelect.status,
) {
  const rows = await db
    .select({
      id: changeEventEvents.id,
      eventType: changeEventEvents.eventType,
      occurredAt: changeEventEvents.occurredAt,
      actorUserId: changeEventEvents.actorUserId,
      actorEmail: users.email,
      comment: changeEventEvents.comment,
    })
    .from(changeEventEvents)
    .leftJoin(users, eq(users.id, changeEventEvents.actorUserId))
    .where(eq(changeEventEvents.changeEventId, changeEventId))
    .orderBy(asc(changeEventEvents.occurredAt), asc(changeEventEvents.id));

  const initiatorEmail = initiatedByUserId
    ? (
        await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, initiatedByUserId))
          .limit(1)
      )[0]?.email ?? null
    : null;

  type Entry = {
    id: string;
    eventType:
      | "Opened"
      | "SentForClientReview"
      | "ClientApproved"
      | "ClientRejected"
      | "PMApproved"
      | "Cancelled";
    occurredAt: Date;
    actorUserId: number | null;
    actorEmail: string | null;
    comment: string | null;
  };

  const entries: Entry[] = [
    {
      id: `init-${changeEventId}`,
      eventType: "Opened",
      occurredAt: initiatedAt,
      actorUserId: initiatedByUserId,
      actorEmail: initiatorEmail,
      comment: null,
    },
    ...rows.map(
      (r): Entry => ({
        id: `evt-${r.id}`,
        eventType: r.eventType,
        occurredAt: r.occurredAt,
        actorUserId: r.actorUserId,
        actorEmail: r.actorEmail ?? null,
        comment: r.comment,
      }),
    ),
  ];

  // Backfill client decision for change events that pre-date the events table.
  if (
    clientDecisionAt &&
    (status === "ClientApproved" ||
      status === "ClientRejected" ||
      status === "PMApproved")
  ) {
    const decisionType =
      status === "ClientRejected" ? "ClientRejected" : "ClientApproved";
    const alreadyHas = entries.some(
      (e) =>
        (e.eventType === "ClientApproved" || e.eventType === "ClientRejected") &&
        Math.abs(e.occurredAt.getTime() - clientDecisionAt.getTime()) < 1000,
    );
    if (!alreadyHas) {
      const clientEmail = clientUserId
        ? (
            await db
              .select({ email: users.email })
              .from(users)
              .where(eq(users.id, clientUserId))
              .limit(1)
          )[0]?.email ?? null
        : null;
      entries.push({
        id: `cdec-${changeEventId}`,
        eventType: decisionType,
        occurredAt: clientDecisionAt,
        actorUserId: clientUserId,
        actorEmail: clientEmail,
        comment: null,
      });
    }
  }

  entries.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  return entries.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    occurredAt: e.occurredAt.toISOString(),
    actorUserId: e.actorUserId,
    actorEmail: e.actorEmail,
    comment: e.comment,
  }));
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
      initiatedByUserId: changeEvents.initiatedByUserId,
      oldDate: changeEvents.oldDate,
      proposedNewDate: changeEvents.proposedNewDate,
      changeReason: changeEvents.changeReason,
      status: changeEvents.status,
      clientComment: changeEvents.clientComment,
      clientUserId: changeEvents.clientUserId,
      clientDecisionAt: changeEvents.clientDecisionAt,
    })
    .from(changeEvents)
    .innerJoin(milestones, eq(milestones.id, changeEvents.milestoneId))
    .where(eq(changeEvents.id, id))
    .limit(1);
  if (!ev) return null;

  const timeline = await loadChangeEventTimeline(
    ev.id,
    ev.initiatedAt,
    ev.initiatedByUserId,
    ev.clientDecisionAt,
    ev.clientUserId,
    ev.status,
  );

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

  const { latest: latestByImpact, counts: countsByImpact } =
    await getLatestDeliveriesByImpactId(impacts.map((i) => i.id));

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
    impacts: impacts.map((i) => {
      const d = latestByImpact.get(i.id) ?? null;
      return {
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
        lastDeliveryStatus: d?.status ?? null,
        lastDeliveryChannel: d?.channel ?? null,
        lastDeliveryAt: d ? d.attemptedAt.toISOString() : null,
        lastDeliveryError: d?.errorMessage ?? null,
        deliveryAttemptCount: countsByImpact.get(i.id) ?? 0,
        recipientEmail: d?.recipientEmail ?? null,
      };
    }),
    timeline,
  };
}

router.post("/change-events/:changeEventId/transition", async (req, res) => {
  const paramsParsed = TransitionChangeEventParams.safeParse(req.params);
  if (!paramsParsed.success) {
    return res.status(400).json({ error: "Invalid changeEventId" });
  }
  const bodyParsed = TransitionChangeEventBody.safeParse(req.body);
  if (!bodyParsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid request body: " + bodyParsed.error.message });
  }
  const { changeEventId } = paramsParsed.data;
  const { action, clientComment } = bodyParsed.data;

  const projectId = await getProjectIdForChangeEvent(changeEventId);
  if (!projectId) return res.status(404).json({ error: "Change event not found" });
  if (!(await requirePmAccess(req, res, projectId))) return;

  const [ev] = await db
    .select()
    .from(changeEvents)
    .where(eq(changeEvents.id, changeEventId))
    .limit(1);
  if (!ev) return res.status(404).json({ error: "Change event not found" });

  // Determine next status from action + current state.
  let nextStatus: typeof ev.status;
  switch (action) {
    case "send":
      if (ev.status !== "Draft") {
        return res
          .status(400)
          .json({ error: `Cannot send a change event in status ${ev.status}` });
      }
      nextStatus = "SentForClientReview";
      break;
    case "client_approve":
      if (ev.status !== "SentForClientReview") {
        return res.status(400).json({
          error: `Cannot record a client decision on a change event in status ${ev.status}`,
        });
      }
      nextStatus = "ClientApproved";
      break;
    case "client_reject":
      if (ev.status !== "SentForClientReview") {
        return res.status(400).json({
          error: `Cannot record a client decision on a change event in status ${ev.status}`,
        });
      }
      nextStatus = "ClientRejected";
      break;
    case "pm_approve":
      if (ev.status !== "ClientApproved") {
        return res.status(400).json({
          error: `PM approval requires the client to have approved first (current status: ${ev.status})`,
        });
      }
      nextStatus = "PMApproved";
      break;
    case "cancel":
      if (ev.status === "PMApproved" || ev.status === "Cancelled") {
        return res
          .status(400)
          .json({ error: `Cannot cancel a change event in status ${ev.status}` });
      }
      nextStatus = "Cancelled";
      break;
    default:
      return res.status(400).json({ error: "Unknown action" });
  }

  const now = new Date();
  const isClientDecision = action === "client_approve" || action === "client_reject";
  const trimmedComment = clientComment?.trim();

  await db.transaction(async (tx) => {
    const updates: Partial<typeof changeEvents.$inferInsert> = {
      status: nextStatus,
    };
    if (isClientDecision) {
      updates.clientDecisionAt = now;
      updates.clientUserId = req.auth_ctx!.userId;
      if (trimmedComment !== undefined && trimmedComment.length > 0) {
        updates.clientComment = trimmedComment;
      }
    } else if (trimmedComment !== undefined && trimmedComment.length > 0) {
      // Allow PMs to append/replace a client comment when acting on behalf.
      updates.clientComment = trimmedComment;
    }

    await tx.update(changeEvents).set(updates).where(eq(changeEvents.id, changeEventId));

    await tx.insert(changeEventEvents).values({
      changeEventId,
      eventType: nextStatus,
      actorUserId: req.auth_ctx!.userId,
      comment:
        trimmedComment !== undefined && trimmedComment.length > 0
          ? trimmedComment
          : null,
      occurredAt: now,
    });

    if (nextStatus === "PMApproved") {
      await tx
        .update(milestones)
        .set({
          previousDate: ev.oldDate,
          currentDate: ev.proposedNewDate,
          changeReasonLatest: ev.changeReason,
        })
        .where(eq(milestones.id, ev.milestoneId));
    }
  });

  const detail = await loadChangeEventDetailResponse(changeEventId);
  if (!detail) return res.status(404).json({ error: "Change event not found" });
  return res.json(detail);
});

router.patch("/change-events/:changeEventId", async (req, res) => {
  const paramsParsed = EditChangeEventParams.safeParse(req.params);
  if (!paramsParsed.success) {
    return res.status(400).json({ error: "Invalid changeEventId" });
  }
  const bodyParsed = EditChangeEventBody.safeParse(req.body);
  if (!bodyParsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid request body: " + bodyParsed.error.message });
  }
  const { changeEventId } = paramsParsed.data;
  const body = bodyParsed.data;

  const projectId = await getProjectIdForChangeEvent(changeEventId);
  if (!projectId) return res.status(404).json({ error: "Change event not found" });
  if (!(await requirePmAccess(req, res, projectId))) return;

  const [ev] = await db
    .select()
    .from(changeEvents)
    .where(eq(changeEvents.id, changeEventId))
    .limit(1);
  if (!ev) return res.status(404).json({ error: "Change event not found" });

  if (
    ev.status === "Cancelled" ||
    ev.status === "PMApproved" ||
    ev.status === "ClientApproved" ||
    ev.status === "ClientRejected"
  ) {
    return res
      .status(400)
      .json({ error: "This change event is closed and can no longer be edited." });
  }

  const existingImpacts = await db
    .select()
    .from(milestoneImpacts)
    .where(eq(milestoneImpacts.changeEventId, changeEventId));

  const anyResponses = existingImpacts.some(
    (i) => i.responseStatus !== "Pending" || i.respondedAt !== null,
  );
  if (anyResponses) {
    return res.status(400).json({
      error: "Responses have already come in. The change event can no longer be edited.",
    });
  }

  const [m] = await db
    .select()
    .from(milestones)
    .where(eq(milestones.id, ev.milestoneId))
    .limit(1);
  if (!m) return res.status(404).json({ error: "Milestone not found" });

  const proposedNewDate = new Date(body.proposedNewDate);
  if (Number.isNaN(proposedNewDate.getTime())) {
    return res.status(400).json({ error: "Invalid proposedNewDate" });
  }
  if (proposedNewDate.getTime() === m.currentDate.getTime()) {
    return res
      .status(400)
      .json({ error: "Proposed date must differ from current date" });
  }

  const projectPcs = await db
    .select({ id: projectCompanies.id })
    .from(projectCompanies)
    .where(
      and(
        eq(projectCompanies.projectId, projectId),
        inArray(projectCompanies.id, body.impactedProjectCompanyIds),
      ),
    );
  const validPcIds = new Set(projectPcs.map((p) => p.id));
  if (validPcIds.size !== body.impactedProjectCompanyIds.length) {
    return res
      .status(400)
      .json({ error: "One or more companies are not on this project" });
  }

  const requestedPcIds = new Set(body.impactedProjectCompanyIds);
  const existingByPc = new Map(existingImpacts.map((i) => [i.projectCompanyId, i]));
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(changeEvents)
      .set({
        proposedNewDate,
        changeReason: body.changeReason,
      })
      .where(eq(changeEvents.id, changeEventId));

    const toRemove = existingImpacts
      .filter((i) => !requestedPcIds.has(i.projectCompanyId))
      .map((i) => i.id);
    if (toRemove.length > 0) {
      await tx.delete(milestoneImpacts).where(inArray(milestoneImpacts.id, toRemove));
    }

    const toAdd = body.impactedProjectCompanyIds.filter((pcId) => !existingByPc.has(pcId));
    if (toAdd.length > 0) {
      await tx.insert(milestoneImpacts).values(
        toAdd.map((pcId) => ({
          changeEventId,
          milestoneId: ev.milestoneId,
          projectCompanyId: pcId,
          oldDate: ev.oldDate,
          newDate: proposedNewDate,
          notifiedAt: now,
          responseStatus: "Pending" as const,
        })),
      );
    }

    const toKeep = existingImpacts
      .filter((i) => requestedPcIds.has(i.projectCompanyId))
      .map((i) => i.id);
    if (toKeep.length > 0) {
      await tx
        .update(milestoneImpacts)
        .set({ newDate: proposedNewDate })
        .where(inArray(milestoneImpacts.id, toKeep));
    }
  });

  const detail = await loadChangeEventDetailResponse(changeEventId);
  if (!detail) return res.status(404).json({ error: "Change event not found" });
  return res.json(detail);
});

export default router;
