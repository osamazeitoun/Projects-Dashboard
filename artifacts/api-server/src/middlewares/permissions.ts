import type { Request, Response, NextFunction } from "express";
import {
  db,
  userCompanies,
  projectAssignments,
  projectCompanies,
  projects,
  milestones,
  changeEvents,
  milestoneImpacts,
  companies,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

export type ProjectRole =
  | "admin"
  | "pm"
  | "contractor_lead"
  | "contractor_member"
  | "viewer";

export interface EffectiveProjectAccess {
  projectId: number;
  roles: ProjectRole[];
  /** companyIds the user is acting on behalf of for this project (from assignments + memberships) */
  companyIds: number[];
  /** project_companies.id rows scoped to those companyIds */
  projectCompanyIds: number[];
  isAdmin: boolean;
  isPm: boolean;
  isContractor: boolean;
  isViewerOnly: boolean;
}

export interface ResolveProjectAccessInput {
  projectId: number;
  companyMemberships: Array<{ companyId: number; role: "admin" | "member" }>;
  assignments: Array<{ role: ProjectRole; companyId: number | null }>;
  projectCompanyRows: Array<{ id: number; companyId: number }>;
}

/**
 * Pure function that resolves effective access from raw rows. Kept separate
 * from the DB-fetching `getEffectiveProjectAccess` so it can be unit tested
 * without a database.
 *
 * Rules:
 *  - `user_companies.role = 'admin'` on a company that participates in the
 *    project grants implicit `admin` project role for that company.
 *  - Otherwise role(s) come from `project_assignments`.
 *  - Plain company membership (role='member') alone does NOT grant access.
 *  - For contractor roles, the assignment's companyId pins which
 *    project_companies the user can act on.
 */
export function resolveProjectAccess(
  input: ResolveProjectAccessInput,
): EffectiveProjectAccess | null {
  const { projectId, companyMemberships, assignments, projectCompanyRows } =
    input;

  const pcByCompany = new Map<number, number[]>();
  for (const pc of projectCompanyRows) {
    const arr = pcByCompany.get(pc.companyId) ?? [];
    arr.push(pc.id);
    pcByCompany.set(pc.companyId, arr);
  }
  const projectCompanyIdSet = new Set(projectCompanyRows.map((p) => p.id));

  const roles = new Set<ProjectRole>();
  const companyIdSet = new Set<number>();

  for (const m of companyMemberships) {
    if (m.role === "admin" && pcByCompany.has(m.companyId)) {
      roles.add("admin");
      companyIdSet.add(m.companyId);
    }
  }

  for (const a of assignments) {
    roles.add(a.role);
    if (a.companyId != null) companyIdSet.add(a.companyId);
  }

  if (roles.size === 0 && companyIdSet.size === 0) {
    return null;
  }

  const collected: number[] = [];
  for (const cid of companyIdSet) {
    const ids = pcByCompany.get(cid) ?? [];
    for (const id of ids) collected.push(id);
  }
  const projectCompanyIds = Array.from(new Set(collected)).filter((id) =>
    projectCompanyIdSet.has(id),
  );

  const isAdmin = roles.has("admin");
  const isPm = roles.has("pm");
  const isContractor =
    roles.has("contractor_lead") || roles.has("contractor_member");
  const isViewerOnly =
    !isAdmin && !isPm && !isContractor && roles.has("viewer");

  return {
    projectId,
    roles: Array.from(roles),
    companyIds: Array.from(companyIdSet),
    projectCompanyIds,
    isAdmin,
    isPm,
    isContractor,
    isViewerOnly,
  };
}

/**
 * Resolve the effective access a user has on a single project.
 * Returns null if the user has no assignment and no company on that project
 * (in which case they should see 403).
 *
 * Rules:
 *  - A `user_companies.role = 'admin'` on a company that participates in the
 *    project grants implicit `admin` project role.
 *  - Otherwise, the role(s) come from `project_assignments` rows for (user,
 *    project).
 *  - For contractor roles, the companyId on the assignment scopes which
 *    project_companies the user can act on.
 */
export async function getEffectiveProjectAccess(
  userId: number,
  projectId: number,
): Promise<EffectiveProjectAccess | null> {
  const [companyMemberships, assignments, projectCompanyRows] =
    await Promise.all([
      db
        .select({ companyId: userCompanies.companyId, role: userCompanies.role })
        .from(userCompanies)
        .where(eq(userCompanies.userId, userId)),
      db
        .select({
          role: projectAssignments.role,
          companyId: projectAssignments.companyId,
        })
        .from(projectAssignments)
        .where(
          and(
            eq(projectAssignments.userId, userId),
            eq(projectAssignments.projectId, projectId),
          ),
        ),
      db
        .select({
          id: projectCompanies.id,
          companyId: projectCompanies.companyId,
        })
        .from(projectCompanies)
        .where(eq(projectCompanies.projectId, projectId)),
    ]);

  return resolveProjectAccess({
    projectId,
    companyMemberships: companyMemberships.map((m) => ({
      companyId: m.companyId,
      role: m.role as "admin" | "member",
    })),
    assignments: assignments.map((a) => ({
      role: a.role as ProjectRole,
      companyId: a.companyId,
    })),
    projectCompanyRows,
  });
}

/**
 * Return all projectIds the user has any access to. Access is granted via:
 *  - an explicit `project_assignments` row, OR
 *  - being a company admin on a company that participates in the project.
 *
 * Plain `user_companies` membership (role='member') does NOT grant project
 * access on its own — the user must be explicitly assigned by an admin.
 */
export async function listAccessibleProjectIds(
  userId: number,
): Promise<number[]> {
  const [adminMemberships, assignments] = await Promise.all([
    db
      .select({ companyId: userCompanies.companyId })
      .from(userCompanies)
      .where(
        and(eq(userCompanies.userId, userId), eq(userCompanies.role, "admin")),
      ),
    db
      .select({ projectId: projectAssignments.projectId })
      .from(projectAssignments)
      .where(eq(projectAssignments.userId, userId)),
  ]);

  const adminCompanyIds = adminMemberships.map((m) => m.companyId);
  const fromAdminCompanies =
    adminCompanyIds.length === 0
      ? []
      : await db
          .select({ projectId: projectCompanies.projectId })
          .from(projectCompanies)
          .where(inArray(projectCompanies.companyId, adminCompanyIds));

  const set = new Set<number>();
  for (const r of fromAdminCompanies) set.add(r.projectId);
  for (const a of assignments) set.add(a.projectId);
  return Array.from(set);
}

/**
 * Return projectIds where the user has PM-or-admin capability — i.e. can use
 * the PM perspective for the project. Excludes contractor-only and
 * viewer-only access.
 */
export async function listPmProjectIds(userId: number): Promise<number[]> {
  const [adminMemberships, pmAssignments] = await Promise.all([
    db
      .select({ companyId: userCompanies.companyId })
      .from(userCompanies)
      .where(
        and(eq(userCompanies.userId, userId), eq(userCompanies.role, "admin")),
      ),
    db
      .select({ projectId: projectAssignments.projectId })
      .from(projectAssignments)
      .where(
        and(
          eq(projectAssignments.userId, userId),
          inArray(projectAssignments.role, ["pm", "admin"] as const),
        ),
      ),
  ]);

  const adminCompanyIds = adminMemberships.map((m) => m.companyId);
  const fromAdminCompanies =
    adminCompanyIds.length === 0
      ? []
      : await db
          .select({ projectId: projectCompanies.projectId })
          .from(projectCompanies)
          .where(inArray(projectCompanies.companyId, adminCompanyIds));

  const set = new Set<number>();
  for (const r of fromAdminCompanies) set.add(r.projectId);
  for (const a of pmAssignments) set.add(a.projectId);
  return Array.from(set);
}

/**
 * Return projectIds where the user has client-side standing — i.e. they
 * have an assignment (or are a company admin) on a company of type 'Client'
 * that participates in the project. These are the projects on which the
 * user can approve/reject change events as the client.
 */
export async function listClientProjectIds(userId: number): Promise<number[]> {
  const [adminMemberships, assignedCompanies] = await Promise.all([
    db
      .select({ companyId: userCompanies.companyId })
      .from(userCompanies)
      .where(
        and(eq(userCompanies.userId, userId), eq(userCompanies.role, "admin")),
      ),
    db
      .select({
        projectId: projectAssignments.projectId,
        companyId: projectAssignments.companyId,
      })
      .from(projectAssignments)
      .where(eq(projectAssignments.userId, userId)),
  ]);

  const set = new Set<number>();

  const adminCompanyIds = adminMemberships.map((m) => m.companyId);
  if (adminCompanyIds.length > 0) {
    const rows = await db
      .select({ projectId: projectCompanies.projectId })
      .from(projectCompanies)
      .innerJoin(companies, eq(companies.id, projectCompanies.companyId))
      .where(
        and(
          inArray(projectCompanies.companyId, adminCompanyIds),
          eq(companies.type, "Client"),
        ),
      );
    for (const r of rows) set.add(r.projectId);
  }

  const candidatePairs = assignedCompanies.filter(
    (a): a is { projectId: number; companyId: number } => a.companyId != null,
  );
  if (candidatePairs.length > 0) {
    const companyIds = Array.from(
      new Set(candidatePairs.map((p) => p.companyId)),
    );
    const clientCompanyRows = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(inArray(companies.id, companyIds), eq(companies.type, "Client")));
    const clientCompanyIds = new Set(clientCompanyRows.map((r) => r.id));
    for (const a of candidatePairs) {
      if (clientCompanyIds.has(a.companyId)) set.add(a.projectId);
    }
  }

  return Array.from(set);
}

/**
 * Helper for routes: require the user has client-side standing on the
 * given project (admin/assignment via a Client-type company). Returns
 * true if allowed; otherwise responds 401/403 and returns false.
 */
export async function requireClientAccess(
  req: Request,
  res: Response,
  projectId: number,
): Promise<boolean> {
  const ctx = req.auth_ctx;
  if (!ctx) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  const ids = await listClientProjectIds(ctx.userId);
  if (!ids.includes(projectId)) {
    res.status(403).json({ error: "Client access required for this project" });
    return false;
  }
  return true;
}

/**
 * True if the user is a company admin on any company. Used to gate
 * `/admin` endpoints + the admin UI link.
 */
export async function isCompanyAdmin(userId: number): Promise<boolean> {
  const rows = await db
    .select({ id: userCompanies.id })
    .from(userCompanies)
    .where(and(eq(userCompanies.userId, userId), eq(userCompanies.role, "admin")))
    .limit(1);
  return rows.length > 0;
}

/** Return all companyIds the user is a member of (any role). */
export async function listUserCompanyIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ companyId: userCompanies.companyId })
    .from(userCompanies)
    .where(eq(userCompanies.userId, userId));
  return rows.map((r) => r.companyId);
}

/** Return all companyIds where the user has `admin` role. */
export async function listAdminCompanyIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ companyId: userCompanies.companyId })
    .from(userCompanies)
    .where(and(eq(userCompanies.userId, userId), eq(userCompanies.role, "admin")));
  return rows.map((r) => r.companyId);
}

/**
 * Express middleware factory: requires the authed user to be a company
 * admin on at least one company. Use on /admin/*.
 */
export async function requireCompanyAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const ctx = req.auth_ctx;
  if (!ctx) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const admin = await isCompanyAdmin(ctx.userId);
  if (!admin) {
    res.status(403).json({ error: "Company admin required" });
    return;
  }
  next();
}

/**
 * Helper for routes: require that the user has access to the given project,
 * returning the resolved access object or sending a 403/404 and returning
 * null. The caller should `return` if it gets null.
 */
export async function requireProjectAccess(
  req: Request,
  res: Response,
  projectId: number,
): Promise<EffectiveProjectAccess | null> {
  const ctx = req.auth_ctx;
  if (!ctx) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const access = await getEffectiveProjectAccess(ctx.userId, projectId);
  if (!access) {
    res.status(403).json({ error: "No access to this project" });
    return null;
  }
  return access;
}

/** Lookup the projectId for a milestone, change event, or impact. */
export async function getProjectIdForMilestone(
  milestoneId: number,
): Promise<number | null> {
  const [row] = await db
    .select({ projectId: milestones.projectId })
    .from(milestones)
    .where(eq(milestones.id, milestoneId))
    .limit(1);
  return row?.projectId ?? null;
}

export async function getProjectIdForChangeEvent(
  changeEventId: number,
): Promise<number | null> {
  const [row] = await db
    .select({ projectId: milestones.projectId })
    .from(changeEvents)
    .innerJoin(milestones, eq(milestones.id, changeEvents.milestoneId))
    .where(eq(changeEvents.id, changeEventId))
    .limit(1);
  return row?.projectId ?? null;
}

export async function getProjectAndPcForImpact(
  impactId: number,
): Promise<{ projectId: number; projectCompanyId: number } | null> {
  const [row] = await db
    .select({
      projectId: milestones.projectId,
      projectCompanyId: milestoneImpacts.projectCompanyId,
    })
    .from(milestoneImpacts)
    .innerJoin(milestones, eq(milestones.id, milestoneImpacts.milestoneId))
    .where(eq(milestoneImpacts.id, impactId))
    .limit(1);
  return row ?? null;
}

/** Confirm a project actually exists. */
export async function projectExists(projectId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return !!row;
}
