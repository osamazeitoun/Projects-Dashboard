import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db, users, userCompanies, companies, projectCompanies, projects } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

export interface AuthContext {
  userId: number;
  clerkUserId: string;
  email: string | null;
  companyIds: number[];
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

// Companies that any newly-provisioned user is auto-linked to.
// This keeps the prototype demo data working while real per-company
// permissions are now enforced. Configurable via env.
const DEFAULT_COMPANY_IDS = (process.env.DEFAULT_COMPANY_IDS ?? "2")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

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

  // Auto-link to default demo companies so freshly signed-up users
  // immediately see the seeded prototype data.
  if (DEFAULT_COMPANY_IDS.length > 0) {
    const existingCompanies = await db
      .select({ id: companies.id })
      .from(companies)
      .where(inArray(companies.id, DEFAULT_COMPANY_IDS));
    if (existingCompanies.length > 0) {
      await db.insert(userCompanies).values(
        existingCompanies.map((c) => ({
          userId: inserted.id,
          companyId: c.id,
          role: "member",
        })),
      );
    }
  }

  return { id: inserted.id, email };
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

    const memberships = await db
      .select({ companyId: userCompanies.companyId })
      .from(userCompanies)
      .where(eq(userCompanies.userId, userId));
    const companyIds = memberships.map((m) => m.companyId);

    // Pick an active project = first project that any of the user's
    // companies is on. This keeps the existing single-project UI working
    // while still being session-derived.
    let activeProjectId: number | null = null;
    let activeCompanyId: number | null = companyIds[0] ?? null;
    if (companyIds.length > 0) {
      const pcs = await db
        .select({
          projectId: projectCompanies.projectId,
          companyId: projectCompanies.companyId,
        })
        .from(projectCompanies)
        .innerJoin(projects, eq(projectCompanies.projectId, projects.id))
        .where(inArray(projectCompanies.companyId, companyIds))
        .orderBy(projects.id)
        .limit(1);
      if (pcs.length > 0) {
        activeProjectId = pcs[0].projectId;
        activeCompanyId = pcs[0].companyId;
      }
    }

    req.auth_ctx = {
      userId,
      clerkUserId,
      email,
      companyIds,
      activeProjectId,
      activeCompanyId,
    };
    next();
  } catch (err) {
    req.log?.error?.({ err }, "Failed to resolve auth context");
    res.status(500).json({ error: "Failed to resolve auth context" });
  }
}

export async function getProjectCompanyIdsForUser(
  userId: number,
  projectId: number,
): Promise<number[]> {
  const memberships = await db
    .select({ companyId: userCompanies.companyId })
    .from(userCompanies)
    .where(eq(userCompanies.userId, userId));
  const companyIds = memberships.map((m) => m.companyId);
  if (companyIds.length === 0) return [];

  const rows = await db
    .select({ id: projectCompanies.id })
    .from(projectCompanies)
    .where(
      and(
        eq(projectCompanies.projectId, projectId),
        inArray(projectCompanies.companyId, companyIds),
      ),
    );
  return rows.map((r) => r.id);
}
