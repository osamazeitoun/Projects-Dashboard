import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import {
  db,
  users,
  userCompanies,
  companies,
  projectCompanies,
  projects,
  projectAssignments,
} from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";

export interface WorkspaceOption {
  companyId: number;
  companyName: string;
  projectId: number;
  projectName: string;
  projectCode: string;
}

export interface AuthContext {
  userId: number;
  clerkUserId: string;
  email: string | null;
  companyIds: number[];
  workspaces: WorkspaceOption[];
  activeProjectId: number | null;
  activeCompanyId: number | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth_ctx?: AuthContext;
    }
  }
}

export const ACTIVE_WORKSPACE_COOKIE = "active_workspace";

// Companies the bootstrap admin (INITIAL_ADMIN_EMAIL) is auto-linked to so
// they have somewhere to assign people from on first login. Regular users
// start with NO company memberships and NO project access — an admin must
// invite them via the Admin Console.
const DEFAULT_COMPANY_IDS = (process.env.DEFAULT_COMPANY_IDS ?? "2,3,4")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

async function ensureBootstrapAdminMemberships(
  userId: number,
  email: string | null,
): Promise<void> {
  const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL?.toLowerCase();
  if (!initialAdminEmail || !email) return;
  if (email.toLowerCase() !== initialAdminEmail) return;
  if (DEFAULT_COMPANY_IDS.length === 0) return;
  const existingCompanies = await db
    .select({ id: companies.id })
    .from(companies)
    .where(inArray(companies.id, DEFAULT_COMPANY_IDS));
  if (existingCompanies.length === 0) return;

  const alreadyLinked = await db
    .select({ companyId: userCompanies.companyId })
    .from(userCompanies)
    .where(
      and(
        eq(userCompanies.userId, userId),
        inArray(
          userCompanies.companyId,
          existingCompanies.map((c) => c.id),
        ),
      ),
    );
  const linkedSet = new Set(alreadyLinked.map((r) => r.companyId));
  const toLink = existingCompanies.filter((c) => !linkedSet.has(c.id));
  if (toLink.length === 0) return;
  await db.insert(userCompanies).values(
    toLink.map((c) => ({
      userId,
      companyId: c.id,
      role: "member" as const,
    })),
  );
}

async function jitProvisionUser(
  clerkUserId: string,
): Promise<{ id: number; email: string | null; isNew: boolean }> {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  if (existing.length > 0) {
    return { id: existing[0].id, email: existing[0].email, isNew: false };
  }

  let email: string | null = null;
  try {
    const u = await clerkClient.users.getUser(clerkUserId);
    email =
      u.primaryEmailAddress?.emailAddress ??
      u.emailAddresses?.[0]?.emailAddress ??
      null;
  } catch {
    // Best-effort; user can be created without email.
  }

  const [inserted] = await db
    .insert(users)
    .values({ clerkUserId, email })
    .returning();

  return { id: inserted.id, email, isNew: true };
}

/**
 * Bootstrap: if the signed-in user's email matches INITIAL_ADMIN_EMAIL,
 * promote them to company admin on every company they are linked to (which
 * includes the default companies we just linked via
 * `ensureBootstrapAdminMemberships`). No promotion happens for any other
 * user — regular users start with no access until an admin assigns them.
 */
async function bootstrapInitialAdmin(
  userId: number,
  email: string | null,
): Promise<void> {
  const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL?.toLowerCase();
  if (!initialAdminEmail || !email) return;
  if (email.toLowerCase() !== initialAdminEmail) return;

  const myMemberships = await db
    .select({ id: userCompanies.id, role: userCompanies.role })
    .from(userCompanies)
    .where(eq(userCompanies.userId, userId));
  const promoteIds = myMemberships
    .filter((m) => m.role !== "admin")
    .map((m) => m.id);
  if (promoteIds.length === 0) return;
  await db
    .update(userCompanies)
    .set({ role: "admin" })
    .where(inArray(userCompanies.id, promoteIds));
}

/**
 * A workspace is a (company, project) pair the user can act on behalf of.
 * Derived from `project_assignments` rows that pin a companyId (contractor
 * roles), plus an admin's company on every project that company participates
 * in. PM / viewer roles do not create a contractor-style workspace because
 * they don't act on behalf of a specific contractor company.
 */
export async function listWorkspacesForUser(
  userId: number,
): Promise<WorkspaceOption[]> {
  const [assignedRows, adminMemberships] = await Promise.all([
    db
      .select({
        companyId: projectAssignments.companyId,
        projectId: projectAssignments.projectId,
      })
      .from(projectAssignments)
      .where(eq(projectAssignments.userId, userId)),
    db
      .select({ companyId: userCompanies.companyId })
      .from(userCompanies)
      .where(
        and(eq(userCompanies.userId, userId), eq(userCompanies.role, "admin")),
      ),
  ]);

  const pairs = new Set<string>();
  const candidatePcFilter: Array<{ companyId: number; projectId: number }> = [];

  for (const a of assignedRows) {
    if (a.companyId == null) continue;
    const key = `${a.companyId}:${a.projectId}`;
    if (pairs.has(key)) continue;
    pairs.add(key);
    candidatePcFilter.push({ companyId: a.companyId, projectId: a.projectId });
  }

  const adminCompanyIds = adminMemberships.map((m) => m.companyId);
  if (adminCompanyIds.length > 0) {
    const adminPcs = await db
      .select({
        companyId: projectCompanies.companyId,
        projectId: projectCompanies.projectId,
      })
      .from(projectCompanies)
      .where(inArray(projectCompanies.companyId, adminCompanyIds));
    for (const pc of adminPcs) {
      const key = `${pc.companyId}:${pc.projectId}`;
      if (pairs.has(key)) continue;
      pairs.add(key);
      candidatePcFilter.push({ companyId: pc.companyId, projectId: pc.projectId });
    }
  }

  if (candidatePcFilter.length === 0) return [];

  const allCompanyIds = Array.from(new Set(candidatePcFilter.map((p) => p.companyId)));
  const allProjectIds = Array.from(new Set(candidatePcFilter.map((p) => p.projectId)));

  const rows = await db
    .select({
      companyId: companies.id,
      companyName: companies.name,
      projectId: projects.id,
      projectName: projects.name,
      projectCode: projects.code,
    })
    .from(projectCompanies)
    .innerJoin(companies, eq(projectCompanies.companyId, companies.id))
    .innerJoin(projects, eq(projectCompanies.projectId, projects.id))
    .where(
      and(
        inArray(projectCompanies.companyId, allCompanyIds),
        inArray(projectCompanies.projectId, allProjectIds),
      ),
    )
    .orderBy(asc(companies.name), asc(projects.name));

  return rows.filter((r) => pairs.has(`${r.companyId}:${r.projectId}`));
}

function parseWorkspaceCookie(
  raw: string | undefined,
): { companyId: number; projectId: number } | null {
  if (!raw) return null;
  const m = /^(\d+):(\d+)$/.exec(raw);
  if (!m) return null;
  const companyId = Number(m[1]);
  const projectId = Number(m[2]);
  if (!Number.isFinite(companyId) || !Number.isFinite(projectId)) return null;
  return { companyId, projectId };
}

const DEV_AUTH_ENABLED = process.env.DEV_AUTH_ENABLED === "1";
const DEV_AUTH_CLERK_ID = "dev-bypass-user";
const DEV_AUTH_EMAIL = "dev@local.test";

/**
 * Dev mode only: link the bypass user to every demo company and promote
 * them to admin so they can see every perspective (Contractor / PM / Admin)
 * without going through Clerk sign-up.
 */
async function ensureDevBypassMemberships(userId: number): Promise<void> {
  const allCompanies = await db.select({ id: companies.id }).from(companies);
  if (allCompanies.length === 0) return;

  const alreadyLinked = await db
    .select({ id: userCompanies.id, companyId: userCompanies.companyId })
    .from(userCompanies)
    .where(eq(userCompanies.userId, userId));
  const linkedIds = new Set(alreadyLinked.map((r) => r.companyId));
  const toLink = allCompanies.filter((c) => !linkedIds.has(c.id));
  if (toLink.length > 0) {
    await db.insert(userCompanies).values(
      toLink.map((c) => ({
        userId,
        companyId: c.id,
        role: "admin" as const,
      })),
    );
  }
  if (alreadyLinked.length > 0) {
    await db
      .update(userCompanies)
      .set({ role: "admin" })
      .where(
        inArray(
          userCompanies.id,
          alreadyLinked.map((r) => r.id),
        ),
      );
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  let clerkUserId: string | null | undefined;
  if (process.env.API_TEST_AUTH === "1") {
    const header = req.headers["x-test-clerk-id"];
    clerkUserId = Array.isArray(header) ? header[0] : header;
  }
  if (!clerkUserId) {
    const auth = getAuth(req);
    clerkUserId = auth?.userId;
  }
  if (!clerkUserId && DEV_AUTH_ENABLED) {
    clerkUserId = DEV_AUTH_CLERK_ID;
  }
  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const isDevBypass =
      DEV_AUTH_ENABLED && clerkUserId === DEV_AUTH_CLERK_ID;
    let userId: number;
    let email: string | null;
    if (isDevBypass) {
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.clerkUserId, DEV_AUTH_CLERK_ID))
        .limit(1);
      if (existing.length > 0) {
        userId = existing[0].id;
        email = existing[0].email;
      } else {
        const [inserted] = await db
          .insert(users)
          .values({ clerkUserId: DEV_AUTH_CLERK_ID, email: DEV_AUTH_EMAIL })
          .returning();
        userId = inserted.id;
        email = inserted.email;
      }
      await ensureDevBypassMemberships(userId);
    } else {
      const provisioned = await jitProvisionUser(clerkUserId);
      userId = provisioned.id;
      email = provisioned.email;
      await ensureBootstrapAdminMemberships(userId, email);
      await bootstrapInitialAdmin(userId, email);
    }

    const memberships = await db
      .select({ companyId: userCompanies.companyId })
      .from(userCompanies)
      .where(eq(userCompanies.userId, userId));
    const companyIds = memberships.map((m) => m.companyId);

    const workspaces = await listWorkspacesForUser(userId);

    // Prefer the user's last selected workspace from the cookie when it is
    // still valid. Otherwise fall back to the first available workspace so
    // the app keeps working out of the box.
    let activeProjectId: number | null = null;
    let activeCompanyId: number | null = companyIds[0] ?? null;

    const cookieChoice = parseWorkspaceCookie(
      req.cookies?.[ACTIVE_WORKSPACE_COOKIE],
    );
    const matchesCookie =
      cookieChoice &&
      workspaces.find(
        (w) =>
          w.companyId === cookieChoice.companyId &&
          w.projectId === cookieChoice.projectId,
      );
    if (matchesCookie) {
      activeCompanyId = matchesCookie.companyId;
      activeProjectId = matchesCookie.projectId;
    } else if (workspaces.length > 0) {
      activeCompanyId = workspaces[0].companyId;
      activeProjectId = workspaces[0].projectId;
    }

    req.auth_ctx = {
      userId,
      clerkUserId,
      email,
      companyIds,
      workspaces,
      activeProjectId,
      activeCompanyId,
    };
    next();
  } catch (err) {
    req.log?.error?.({ err }, "Failed to resolve auth context");
    res.status(500).json({ error: "Failed to resolve auth context" });
  }
}

/**
 * Returns the project_company ids the user can act on behalf of for the
 * given project. Source of truth is `project_assignments` (contractor
 * roles whose companyId pins them to a project_company) plus an admin's
 * company membership when their company participates in the project.
 *
 * Plain `user_companies.role='member'` does NOT grant project_company
 * scope on its own — an explicit assignment is required.
 */
export async function getProjectCompanyIdsForUser(
  userId: number,
  projectId: number,
  activeCompanyId?: number | null,
): Promise<number[]> {
  const [assignedCompanies, adminMemberships] = await Promise.all([
    db
      .select({ companyId: projectAssignments.companyId })
      .from(projectAssignments)
      .where(
        and(
          eq(projectAssignments.userId, userId),
          eq(projectAssignments.projectId, projectId),
        ),
      ),
    db
      .select({ companyId: userCompanies.companyId })
      .from(userCompanies)
      .where(
        and(eq(userCompanies.userId, userId), eq(userCompanies.role, "admin")),
      ),
  ]);

  const allowedCompanyIds = new Set<number>();
  for (const a of assignedCompanies) {
    if (a.companyId != null) allowedCompanyIds.add(a.companyId);
  }
  for (const m of adminMemberships) allowedCompanyIds.add(m.companyId);

  if (allowedCompanyIds.size === 0) return [];

  const companyFilter =
    activeCompanyId != null && allowedCompanyIds.has(activeCompanyId)
      ? [activeCompanyId]
      : Array.from(allowedCompanyIds);

  const rows = await db
    .select({ id: projectCompanies.id })
    .from(projectCompanies)
    .where(
      and(
        eq(projectCompanies.projectId, projectId),
        inArray(projectCompanies.companyId, companyFilter),
      ),
    );
  return rows.map((r) => r.id);
}
