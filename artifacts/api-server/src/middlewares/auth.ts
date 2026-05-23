import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import {
  db,
  users,
  userCompanies,
  companies,
  projectCompanies,
  projects,
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

// Companies that any signed-in user is auto-linked to.
// This keeps the prototype demo data working while real per-company
// permissions are now enforced. Configurable via env.
const DEFAULT_COMPANY_IDS = (process.env.DEFAULT_COMPANY_IDS ?? "2,3,4")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

async function ensureDefaultCompanyMemberships(userId: number): Promise<void> {
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
      role: "member",
    })),
  );
}

async function jitProvisionUser(
  clerkUserId: string,
): Promise<{ id: number; email: string | null }> {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  if (existing.length > 0) {
    return { id: existing[0].id, email: existing[0].email };
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

  return { id: inserted.id, email };
}

export async function listWorkspacesForUser(
  userId: number,
): Promise<WorkspaceOption[]> {
  const memberships = await db
    .select({ companyId: userCompanies.companyId })
    .from(userCompanies)
    .where(eq(userCompanies.userId, userId));
  const companyIds = memberships.map((m) => m.companyId);
  if (companyIds.length === 0) return [];

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
    .where(inArray(projectCompanies.companyId, companyIds))
    .orderBy(asc(companies.name), asc(projects.name));

  return rows;
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

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const { id: userId, email } = await jitProvisionUser(clerkUserId);
    await ensureDefaultCompanyMemberships(userId);

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
 * Returns the project_company ids the active workspace has on the given
 * project. With the workspace switcher we scope to the active company
 * only, not every company the user belongs to.
 */
export async function getProjectCompanyIdsForUser(
  userId: number,
  projectId: number,
  activeCompanyId?: number | null,
): Promise<number[]> {
  const memberships = await db
    .select({ companyId: userCompanies.companyId })
    .from(userCompanies)
    .where(eq(userCompanies.userId, userId));
  const userCompanyIds = memberships.map((m) => m.companyId);
  if (userCompanyIds.length === 0) return [];

  const companyFilter =
    activeCompanyId != null && userCompanyIds.includes(activeCompanyId)
      ? [activeCompanyId]
      : userCompanyIds;

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
