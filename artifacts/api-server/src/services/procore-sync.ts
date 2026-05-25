import { db } from "@workspace/db";
import {
  companies,
  projects,
  projectAssignments,
  projectCompanies,
  userCompanies,
  users,
} from "@workspace/db";
import { and, eq, ilike, inArray, isNotNull } from "drizzle-orm";
import {
  getProcoreProjectSnapshot,
  listProcoreProjects,
  mapProcoreJobTitleToRole,
  normalizeCompanyName,
  ProcoreNotConnectedError,
  type ProcoreProjectSnapshot,
  logProcore,
} from "./procore";

export type SyncResult = {
  projectId: number;
  procoreProjectId: string;
  status: "ok" | "error";
  error: string | null;
  createdProject: boolean;
  companiesUpserted: number;
  companiesRemoved: number;
  usersUpserted: number;
  usersRemoved: number;
};

/**
 * Look up an existing local company by Procore id first, otherwise by
 * normalized name. Returns the matched company id, or null if no match.
 */
async function findCompanyMatch(
  procoreCompanyId: string,
  name: string,
): Promise<number | null> {
  const [byProcore] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.procoreCompanyId, procoreCompanyId))
    .limit(1);
  if (byProcore) return byProcore.id;

  const normalized = normalizeCompanyName(name);
  // We don't have a normalized column; do a case-insensitive ilike on the
  // trimmed name. False positives are mitigated by stamping the procore id
  // on the matched row going forward.
  const rows = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(ilike(companies.name, name.trim()))
    .limit(5);
  for (const r of rows) {
    if (normalizeCompanyName(r.name) === normalized) return r.id;
  }
  return null;
}

async function findUserMatch(
  procoreUserId: string,
  email: string | null,
): Promise<number | null> {
  const [byProcore] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.procoreUserId, procoreUserId))
    .limit(1);
  if (byProcore) return byProcore.id;
  if (!email) return null;
  const [byEmail] = await db
    .select({ id: users.id })
    .from(users)
    .where(ilike(users.email, email))
    .limit(1);
  return byEmail?.id ?? null;
}

/**
 * Idempotently sync a single Procore project snapshot into our DB.
 * Used both for initial import and for re-syncs.
 */
export async function syncProcoreProjectFromSnapshot(
  snapshot: ProcoreProjectSnapshot,
  opts: { existingProjectId?: number } = {},
): Promise<SyncResult> {
  const now = new Date();
  let createdProject = false;

  // 1. Resolve our project row.
  let projectId: number | null = null;
  if (opts.existingProjectId) {
    const [p] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, opts.existingProjectId))
      .limit(1);
    if (!p) throw new Error(`Local project ${opts.existingProjectId} not found`);
    projectId = p.id;
  } else {
    const [byProcore] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.procoreProjectId, snapshot.project.procoreProjectId))
      .limit(1);
    if (byProcore) projectId = byProcore.id;
  }

  if (projectId == null) {
    const [inserted] = await db
      .insert(projects)
      .values({
        name: snapshot.project.name,
        code: snapshot.project.code || snapshot.project.procoreProjectId,
        procoreProjectId: snapshot.project.procoreProjectId,
        procoreProjectName: snapshot.project.name,
        procoreLastSyncedAt: now,
      })
      .returning({ id: projects.id });
    projectId = inserted.id;
    createdProject = true;
  } else {
    await db
      .update(projects)
      .set({
        procoreProjectId: snapshot.project.procoreProjectId,
        procoreProjectName: snapshot.project.name,
        procoreLastSyncedAt: now,
        procoreLastSyncError: null,
      })
      .where(eq(projects.id, projectId));
  }

  // 2. Upsert companies; track which local company ids are in scope.
  const localCompanyIdByProcoreCo = new Map<string, number>();
  for (const co of snapshot.companies) {
    let companyId = await findCompanyMatch(co.procoreCompanyId, co.name);
    if (companyId == null) {
      // Heuristic: roleOnProject like "Client" maps to companyType "Client",
      // anything else defaults to Subcontractor / MainContractor / Consultant.
      const inferredType = inferCompanyType(co.roleOnProject);
      const [created] = await db
        .insert(companies)
        .values({
          name: co.name,
          type: inferredType,
          procoreCompanyId: co.procoreCompanyId,
        })
        .returning({ id: companies.id });
      companyId = created.id;
    } else {
      // Stamp the procore id onto the matched row if it isn't set.
      await db
        .update(companies)
        .set({ procoreCompanyId: co.procoreCompanyId })
        .where(and(eq(companies.id, companyId)));
    }
    localCompanyIdByProcoreCo.set(co.procoreCompanyId, companyId);
  }

  // 3. Upsert project_companies rows for each procore company.
  const existingPcRows = await db
    .select({
      id: projectCompanies.id,
      companyId: projectCompanies.companyId,
      procoreSourced: projectCompanies.procoreSourced,
      roleOnProject: projectCompanies.roleOnProject,
    })
    .from(projectCompanies)
    .where(eq(projectCompanies.projectId, projectId));

  const pcByCompany = new Map(existingPcRows.map((r) => [r.companyId, r]));
  let companiesUpserted = 0;
  const procoreLocalCompanyIds = new Set<number>();

  for (const co of snapshot.companies) {
    const localCoId = localCompanyIdByProcoreCo.get(co.procoreCompanyId)!;
    procoreLocalCompanyIds.add(localCoId);
    const existing = pcByCompany.get(localCoId);
    if (existing) {
      await db
        .update(projectCompanies)
        .set({
          roleOnProject: co.roleOnProject,
          procoreSourced: true,
          procoreLastSyncedAt: now,
        })
        .where(eq(projectCompanies.id, existing.id));
    } else {
      await db.insert(projectCompanies).values({
        projectId,
        companyId: localCoId,
        roleOnProject: co.roleOnProject,
        procoreSourced: true,
        procoreLastSyncedAt: now,
      });
    }
    companiesUpserted++;
  }

  // 4. Remove project_companies that were sourced from Procore previously
  //    but are no longer present in the snapshot. Local-only rows
  //    (procoreSourced=false) are preserved.
  let companiesRemoved = 0;
  const stalePcIds: number[] = existingPcRows
    .filter((r) => r.procoreSourced && !procoreLocalCompanyIds.has(r.companyId))
    .map((r) => r.id);
  if (stalePcIds.length > 0) {
    const removed = await db
      .delete(projectCompanies)
      .where(inArray(projectCompanies.id, stalePcIds))
      .returning({ id: projectCompanies.id });
    companiesRemoved = removed.length;
  }

  // 5. Upsert users + project_assignments.
  let usersUpserted = 0;
  const procoreLocalUserIds = new Set<number>();

  const existingAssignments = await db
    .select({
      id: projectAssignments.id,
      userId: projectAssignments.userId,
      procoreSourced: projectAssignments.procoreSourced,
    })
    .from(projectAssignments)
    .where(eq(projectAssignments.projectId, projectId));
  const assignmentByUser = new Map(existingAssignments.map((a) => [a.userId, a]));

  for (const u of snapshot.users) {
    let userId = await findUserMatch(u.procoreUserId, u.email);
    if (userId == null) {
      if (!u.email) {
        // Cannot create a user without an email; skip with note.
        logProcore("warn", "Skipping procore user with no email", {
          procoreUserId: u.procoreUserId,
        });
        continue;
      }
      // Create a placeholder user. clerkUserId is required; we use a
      // procore-derived placeholder. When the user signs in via Clerk, the
      // sign-in handler will reconcile by email.
      const [createdUser] = await db
        .insert(users)
        .values({
          clerkUserId: `procore:${u.procoreUserId}`,
          email: u.email,
          procoreUserId: u.procoreUserId,
        })
        .returning({ id: users.id });
      userId = createdUser.id;
    } else {
      await db
        .update(users)
        .set({ procoreUserId: u.procoreUserId })
        .where(eq(users.id, userId));
    }

    procoreLocalUserIds.add(userId);

    // Map to the local companyId for this assignment.
    const localCompanyId = u.procoreCompanyId
      ? (localCompanyIdByProcoreCo.get(u.procoreCompanyId) ?? null)
      : null;

    // Ensure user is a member of that company (for in-scope visibility).
    if (localCompanyId != null) {
      const [existingMembership] = await db
        .select({ id: userCompanies.id })
        .from(userCompanies)
        .where(
          and(
            eq(userCompanies.userId, userId),
            eq(userCompanies.companyId, localCompanyId),
          ),
        )
        .limit(1);
      if (!existingMembership) {
        await db
          .insert(userCompanies)
          .values({ userId, companyId: localCompanyId, role: "member" });
      }
    }

    const role = mapProcoreJobTitleToRole(u.jobTitle);
    const existing = assignmentByUser.get(userId);
    if (existing) {
      await db
        .update(projectAssignments)
        .set({
          role,
          companyId: localCompanyId,
          procoreSourced: true,
          procoreLastSyncedAt: now,
        })
        .where(eq(projectAssignments.id, existing.id));
    } else {
      await db.insert(projectAssignments).values({
        userId,
        projectId,
        companyId: localCompanyId,
        role,
        procoreSourced: true,
        procoreLastSyncedAt: now,
      });
    }
    usersUpserted++;
  }

  // 6. Remove procore-sourced assignments no longer present.
  let usersRemoved = 0;
  const staleAssignmentIds = existingAssignments
    .filter((a) => a.procoreSourced && !procoreLocalUserIds.has(a.userId))
    .map((a) => a.id);
  if (staleAssignmentIds.length > 0) {
    const removed = await db
      .delete(projectAssignments)
      .where(inArray(projectAssignments.id, staleAssignmentIds))
      .returning({ id: projectAssignments.id });
    usersRemoved = removed.length;
  }

  return {
    projectId,
    procoreProjectId: snapshot.project.procoreProjectId,
    status: "ok",
    error: null,
    createdProject,
    companiesUpserted,
    companiesRemoved,
    usersUpserted,
    usersRemoved,
  };
}

function inferCompanyType(
  roleOnProject: string,
): "Consultant" | "MainContractor" | "Subcontractor" | "Supplier" | "Client" | "Internal" {
  const r = roleOnProject.toLowerCase();
  if (r.includes("client") || r.includes("owner")) return "Client";
  if (r.includes("main")) return "MainContractor";
  if (r.includes("consult")) return "Consultant";
  if (r.includes("suppl")) return "Supplier";
  return "Subcontractor";
}

/** Public entry: sync by procore project id (initial import or repeat). */
export async function syncProcoreProjectById(
  procoreProjectId: string,
  opts: { existingProjectId?: number; callerCompanyId?: number } = {},
): Promise<SyncResult> {
  try {
    const snapshot = await getProcoreProjectSnapshot(
      procoreProjectId,
      opts.callerCompanyId,
    );
    return await syncProcoreProjectFromSnapshot(snapshot, opts);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Unknown error during Procore sync";
    // Persist the error onto the project if we have one linked.
    const [linked] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.procoreProjectId, procoreProjectId))
      .limit(1);
    if (linked) {
      await db
        .update(projects)
        .set({ procoreLastSyncError: message })
        .where(eq(projects.id, linked.id));
    }
    if (e instanceof ProcoreNotConnectedError) {
      throw e;
    }
    return {
      projectId: linked?.id ?? -1,
      procoreProjectId,
      status: "error",
      error: message,
      createdProject: false,
      companiesUpserted: 0,
      companiesRemoved: 0,
      usersUpserted: 0,
      usersRemoved: 0,
    };
  }
}

/** Sync every Procore project visible to the connected account. */
export async function syncAllProcoreProjects(
  callerCompanyId?: number,
): Promise<SyncResult[]> {
  const list = await listProcoreProjects(callerCompanyId);
  const results: SyncResult[] = [];
  for (const p of list) {
    results.push(
      await syncProcoreProjectById(p.procoreProjectId, { callerCompanyId }),
    );
  }
  return results;
}

/** Re-sync every project that has been previously linked to Procore. */
export async function resyncAllLinkedProjects(): Promise<SyncResult[]> {
  const linked = await db
    .select({
      id: projects.id,
      procoreProjectId: projects.procoreProjectId,
    })
    .from(projects)
    .where(isNotNull(projects.procoreProjectId));
  const results: SyncResult[] = [];
  for (const p of linked) {
    if (!p.procoreProjectId) continue;
    results.push(
      await syncProcoreProjectById(p.procoreProjectId, { existingProjectId: p.id }),
    );
  }
  return results;
}
