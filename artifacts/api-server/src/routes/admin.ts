import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  companies,
  projects,
  projectCompanies,
  projectCompanyRoles,
  projectAssignments,
  userCompanies,
  users,
} from "@workspace/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  requireAuth,
} from "../middlewares/auth";
import {
  requireCompanyAdmin,
  listAdminCompanyIds,
} from "../middlewares/permissions";

const router: IRouter = Router();

// Public-to-authed users: listing roles is allowed for any authenticated
// user so that PM and contractor views can resolve role labels. Mutations
// below still require company admin via per-route middleware.
router.get(
  "/admin/project-company-roles",
  requireAuth,
  async (_req: Request, res: Response) => {
    const rows = await db
      .select({
        id: projectCompanyRoles.id,
        key: projectCompanyRoles.key,
        label: projectCompanyRoles.label,
        isBuiltIn: projectCompanyRoles.isBuiltIn,
      })
      .from(projectCompanyRoles)
      .orderBy(asc(projectCompanyRoles.isBuiltIn), asc(projectCompanyRoles.label));

    const refCounts = await db
      .select({
        roleKey: projectCompanies.roleOnProject,
        count: sql<number>`COUNT(*)`,
      })
      .from(projectCompanies)
      .groupBy(projectCompanies.roleOnProject);
    const countByKey = new Map(
      refCounts.map((r) => [r.roleKey, Number(r.count)]),
    );

    return res.json(
      rows.map((r) => ({
        id: r.id,
        key: r.key,
        label: r.label,
        isBuiltIn: r.isBuiltIn,
        referenceCount: countByKey.get(r.key) ?? 0,
      })),
    );
  },
);

router.use(requireAuth, requireCompanyAdmin);

async function getAdminCompanyIds(req: Request): Promise<number[]> {
  return listAdminCompanyIds(req.auth_ctx!.userId);
}

router.get("/admin/projects", async (req: Request, res: Response) => {
  const adminCompanyIds = await getAdminCompanyIds(req);
  if (adminCompanyIds.length === 0) return res.json([]);

  const projectRows = await db
    .selectDistinct({ id: projects.id, name: projects.name, code: projects.code })
    .from(projects)
    .innerJoin(projectCompanies, eq(projectCompanies.projectId, projects.id))
    .where(inArray(projectCompanies.companyId, adminCompanyIds))
    .orderBy(asc(projects.name));

  const projectIds = projectRows.map((p) => p.id);
  if (projectIds.length === 0) return res.json([]);

  const contractorCounts = await db
    .select({
      projectId: projectCompanies.projectId,
      count: sql<number>`COUNT(*)`,
    })
    .from(projectCompanies)
    .where(inArray(projectCompanies.projectId, projectIds))
    .groupBy(projectCompanies.projectId);
  const contractorMap = new Map(
    contractorCounts.map((c) => [c.projectId, Number(c.count)]),
  );

  const assignmentRows = await db
    .select({
      projectId: projectAssignments.projectId,
      role: projectAssignments.role,
      userId: projectAssignments.userId,
    })
    .from(projectAssignments)
    .where(inArray(projectAssignments.projectId, projectIds));

  const pmCountMap = new Map<number, number>();
  const memberSetMap = new Map<number, Set<number>>();
  for (const a of assignmentRows) {
    if (a.role === "pm") {
      pmCountMap.set(a.projectId, (pmCountMap.get(a.projectId) ?? 0) + 1);
    }
    const set = memberSetMap.get(a.projectId) ?? new Set<number>();
    set.add(a.userId);
    memberSetMap.set(a.projectId, set);
  }

  return res.json(
    projectRows.map((p) => ({
      projectId: p.id,
      projectName: p.name,
      projectCode: p.code,
      pmCount: pmCountMap.get(p.id) ?? 0,
      contractorCompanyCount: contractorMap.get(p.id) ?? 0,
      memberCount: memberSetMap.get(p.id)?.size ?? 0,
    })),
  );
});

async function loadProjectIfAdmin(
  req: Request,
  res: Response,
  projectId: number,
) {
  const adminCompanyIds = await getAdminCompanyIds(req);
  if (adminCompanyIds.length === 0) {
    res.status(403).json({ error: "Not a company admin" });
    return null;
  }
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }

  // The admin's company must be on the project to manage it.
  const participation = await db
    .select({ id: projectCompanies.id })
    .from(projectCompanies)
    .where(
      and(
        eq(projectCompanies.projectId, projectId),
        inArray(projectCompanies.companyId, adminCompanyIds),
      ),
    )
    .limit(1);
  if (participation.length === 0) {
    res.status(403).json({ error: "Project not in your company's scope" });
    return null;
  }

  return { project, adminCompanyIds };
}

router.get(
  "/admin/projects/:projectId",
  async (req: Request, res: Response) => {
    const projectId = Number(req.params.projectId);
    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: "Invalid projectId" });
    }
    const ctx = await loadProjectIfAdmin(req, res, projectId);
    if (!ctx) return;
    const { project, adminCompanyIds } = ctx;

    const assignments = await db
      .select({
        assignmentId: projectAssignments.id,
        userId: projectAssignments.userId,
        email: users.email,
        role: projectAssignments.role,
        companyId: projectAssignments.companyId,
        companyName: companies.name,
      })
      .from(projectAssignments)
      .innerJoin(users, eq(users.id, projectAssignments.userId))
      .leftJoin(companies, eq(companies.id, projectAssignments.companyId))
      .where(eq(projectAssignments.projectId, projectId))
      .orderBy(asc(projectAssignments.role), asc(users.email));

    const contractorCompanies = await db
      .select({
        projectCompanyId: projectCompanies.id,
        companyId: companies.id,
        companyName: companies.name,
        roleOnProject: projectCompanies.roleOnProject,
      })
      .from(projectCompanies)
      .innerJoin(companies, eq(companies.id, projectCompanies.companyId))
      .where(eq(projectCompanies.projectId, projectId))
      .orderBy(asc(companies.name));

    const onProjectCompanyIds = contractorCompanies.map((c) => c.companyId);

    const availableCompanies = await db
      .select({
        companyId: companies.id,
        companyName: companies.name,
        type: companies.type,
      })
      .from(companies)
      .orderBy(asc(companies.name));

    // Users available to assign on this project: all users in any company
    // the admin manages OR that already participates on this project.
    const inScopeCompanyIds = Array.from(
      new Set([...adminCompanyIds, ...onProjectCompanyIds]),
    );
    const availableUsers = inScopeCompanyIds.length
      ? await db
          .select({
            userId: users.id,
            email: users.email,
            companyRole: userCompanies.role,
            companyId: companies.id,
            companyName: companies.name,
          })
          .from(userCompanies)
          .innerJoin(users, eq(users.id, userCompanies.userId))
          .innerJoin(companies, eq(companies.id, userCompanies.companyId))
          .where(inArray(userCompanies.companyId, inScopeCompanyIds))
          .orderBy(asc(companies.name), asc(users.email))
      : [];

    return res.json({
      projectId: project.id,
      projectName: project.name,
      projectCode: project.code,
      assignments,
      contractorCompanies,
      availableCompanies,
      availableUsers,
    });
  },
);

const upsertAssignmentSchema = z.object({
  userId: z.number().int().positive(),
  role: z.enum([
    "admin",
    "pm",
    "contractor_lead",
    "contractor_member",
    "viewer",
  ]),
  companyId: z.number().int().positive().nullish(),
});

router.post(
  "/admin/projects/:projectId/assignments",
  async (req: Request, res: Response) => {
    const projectId = Number(req.params.projectId);
    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: "Invalid projectId" });
    }
    const parsed = upsertAssignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid body: " + parsed.error.message });
    }
    const ctx = await loadProjectIfAdmin(req, res, projectId);
    if (!ctx) return;

    const { userId, role, companyId } = parsed.data;
    const { adminCompanyIds } = ctx;

    // Confirm the user exists AND belongs to a company in the admin's scope
    // (either an admin-managed company or a company already participating on
    // this project). This prevents an admin from assigning arbitrary, out-of-
    // tenant users whose ids happen to be guessable.
    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) return res.status(400).json({ error: "User not found" });

    const projectCompanyIds = await db
      .select({ companyId: projectCompanies.companyId })
      .from(projectCompanies)
      .where(eq(projectCompanies.projectId, projectId));
    const inScopeCompanyIds = Array.from(
      new Set([...adminCompanyIds, ...projectCompanyIds.map((p) => p.companyId)]),
    );
    if (inScopeCompanyIds.length === 0) {
      return res.status(403).json({ error: "User is not in your scope" });
    }
    const [userInScope] = await db
      .select({ id: userCompanies.id })
      .from(userCompanies)
      .where(
        and(
          eq(userCompanies.userId, userId),
          inArray(userCompanies.companyId, inScopeCompanyIds),
        ),
      )
      .limit(1);
    if (!userInScope) {
      return res.status(403).json({ error: "User is not in your scope" });
    }

    // For contractor roles, require a companyId that participates in the project.
    let resolvedCompanyId: number | null = companyId ?? null;
    if (role === "contractor_lead" || role === "contractor_member") {
      if (!resolvedCompanyId) {
        return res
          .status(400)
          .json({ error: "companyId is required for contractor roles" });
      }
      const [pc] = await db
        .select({ id: projectCompanies.id })
        .from(projectCompanies)
        .where(
          and(
            eq(projectCompanies.projectId, projectId),
            eq(projectCompanies.companyId, resolvedCompanyId),
          ),
        )
        .limit(1);
      if (!pc) {
        return res
          .status(400)
          .json({ error: "Company is not on this project" });
      }
    }

    // Upsert: a (user, project) gets at most one row.
    const [existing] = await db
      .select()
      .from(projectAssignments)
      .where(
        and(
          eq(projectAssignments.userId, userId),
          eq(projectAssignments.projectId, projectId),
        ),
      )
      .limit(1);

    let row;
    if (existing) {
      [row] = await db
        .update(projectAssignments)
        .set({ role, companyId: resolvedCompanyId })
        .where(eq(projectAssignments.id, existing.id))
        .returning();
    } else {
      [row] = await db
        .insert(projectAssignments)
        .values({
          userId,
          projectId,
          role,
          companyId: resolvedCompanyId,
          createdByUserId: req.auth_ctx!.userId,
        })
        .returning();
    }

    const companyName = resolvedCompanyId
      ? (
          await db
            .select({ name: companies.name })
            .from(companies)
            .where(eq(companies.id, resolvedCompanyId))
            .limit(1)
        )[0]?.name ?? null
      : null;

    return res.json({
      assignmentId: row.id,
      userId: row.userId,
      email: user.email,
      role: row.role,
      companyId: row.companyId,
      companyName,
    });
  },
);

router.delete(
  "/admin/projects/:projectId/assignments/:assignmentId",
  async (req: Request, res: Response) => {
    const projectId = Number(req.params.projectId);
    const assignmentId = Number(req.params.assignmentId);
    if (!Number.isFinite(projectId) || !Number.isFinite(assignmentId)) {
      return res.status(400).json({ error: "Invalid id" });
    }
    const ctx = await loadProjectIfAdmin(req, res, projectId);
    if (!ctx) return;

    const result = await db
      .delete(projectAssignments)
      .where(
        and(
          eq(projectAssignments.id, assignmentId),
          eq(projectAssignments.projectId, projectId),
        ),
      )
      .returning({ id: projectAssignments.id });
    if (result.length === 0) {
      return res.status(404).json({ error: "Assignment not found" });
    }
    return res.status(204).send();
  },
);

const addContractorSchema = z.object({
  companyId: z.number().int().positive(),
  roleOnProject: z.string().min(1),
});

function slugifyRoleLabel(label: string): string {
  const cleaned = label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

const createRoleSchema = z.object({
  label: z.string().trim().min(1).max(80),
});

router.post(
  "/admin/project-company-roles",
  async (req: Request, res: Response) => {
    const parsed = createRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid body: " + parsed.error.message });
    }
    const label = parsed.data.label.trim();
    const key = slugifyRoleLabel(label);
    if (!key) {
      return res
        .status(400)
        .json({ error: "Label must contain letters or numbers" });
    }

    const [existingLabel] = await db
      .select({ id: projectCompanyRoles.id })
      .from(projectCompanyRoles)
      .where(eq(projectCompanyRoles.label, label))
      .limit(1);
    if (existingLabel) {
      return res.status(400).json({ error: "A role with this label already exists" });
    }
    const [existingKey] = await db
      .select({ id: projectCompanyRoles.id })
      .from(projectCompanyRoles)
      .where(eq(projectCompanyRoles.key, key))
      .limit(1);
    if (existingKey) {
      return res
        .status(400)
        .json({ error: "A role with a conflicting key already exists" });
    }

    const [inserted] = await db
      .insert(projectCompanyRoles)
      .values({ key, label, isBuiltIn: false })
      .returning();

    return res.json({
      id: inserted.id,
      key: inserted.key,
      label: inserted.label,
      isBuiltIn: inserted.isBuiltIn,
      referenceCount: 0,
    });
  },
);

router.delete(
  "/admin/project-company-roles/:id",
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }
    const [role] = await db
      .select()
      .from(projectCompanyRoles)
      .where(eq(projectCompanyRoles.id, id))
      .limit(1);
    if (!role) return res.status(404).json({ error: "Role not found" });
    if (role.isBuiltIn) {
      return res.status(400).json({ error: "Built-in roles cannot be deleted" });
    }
    const [ref] = await db
      .select({ id: projectCompanies.id })
      .from(projectCompanies)
      .where(eq(projectCompanies.roleOnProject, role.key))
      .limit(1);
    if (ref) {
      return res
        .status(400)
        .json({ error: "Role is in use and cannot be deleted" });
    }
    await db
      .delete(projectCompanyRoles)
      .where(eq(projectCompanyRoles.id, id));
    return res.status(204).send();
  },
);

router.post(
  "/admin/projects/:projectId/contractors",
  async (req: Request, res: Response) => {
    const projectId = Number(req.params.projectId);
    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: "Invalid projectId" });
    }
    const parsed = addContractorSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid body: " + parsed.error.message });
    }
    const ctx = await loadProjectIfAdmin(req, res, projectId);
    if (!ctx) return;
    const { companyId, roleOnProject } = parsed.data;

    const [roleRow] = await db
      .select({ key: projectCompanyRoles.key })
      .from(projectCompanyRoles)
      .where(eq(projectCompanyRoles.key, roleOnProject))
      .limit(1);
    if (!roleRow) {
      return res.status(400).json({ error: "Unknown role on project" });
    }

    const [co] = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!co) return res.status(400).json({ error: "Company not found" });

    const [existing] = await db
      .select({ id: projectCompanies.id })
      .from(projectCompanies)
      .where(
        and(
          eq(projectCompanies.projectId, projectId),
          eq(projectCompanies.companyId, companyId),
        ),
      )
      .limit(1);
    if (existing) {
      return res
        .status(400)
        .json({ error: "Company already on this project" });
    }

    const [inserted] = await db
      .insert(projectCompanies)
      .values({ projectId, companyId, roleOnProject })
      .returning();

    return res.json({
      projectCompanyId: inserted.id,
      companyId: co.id,
      companyName: co.name,
      roleOnProject: inserted.roleOnProject,
    });
  },
);

router.delete(
  "/admin/projects/:projectId/contractors/:projectCompanyId",
  async (req: Request, res: Response) => {
    const projectId = Number(req.params.projectId);
    const projectCompanyId = Number(req.params.projectCompanyId);
    if (!Number.isFinite(projectId) || !Number.isFinite(projectCompanyId)) {
      return res.status(400).json({ error: "Invalid id" });
    }
    const ctx = await loadProjectIfAdmin(req, res, projectId);
    if (!ctx) return;

    const result = await db
      .delete(projectCompanies)
      .where(
        and(
          eq(projectCompanies.id, projectCompanyId),
          eq(projectCompanies.projectId, projectId),
        ),
      )
      .returning({ id: projectCompanies.id });
    if (result.length === 0) {
      return res.status(404).json({ error: "Project company not found" });
    }
    return res.status(204).send();
  },
);

export default router;
