import { before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

process.env.API_TEST_AUTH = "1";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_placeholder";
process.env.CLERK_SECRET_KEY ??= "sk_test_placeholder";

const appModule = await import("../app");
const dbModule = await import("@workspace/db");

const app = appModule.default;
const {
  db,
  users,
  companies,
  projects,
  projectCompanies,
  userCompanies,
  projectAssignments,
  milestones,
  changeEvents,
  milestoneImpacts,
} = dbModule;

const TAG = `perm-it-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

interface Seeded {
  adminUserId: number;
  adminClerkId: string;
  pmUserId: number;
  pmClerkId: string;
  contractorUserId: number;
  contractorClerkId: string;
  outsiderUserId: number;
  outsiderClerkId: string;
  adminCompanyId: number;
  contractorCompanyId: number;
  otherCompanyId: number;
  projectId: number;
  outOfScopeProjectId: number;
  contractorPcId: number;
  milestoneId: number;
  changeEventId: number;
  contractorImpactId: number;
  otherImpactId: number;
  otherPcId: number;
}

let server: Server;
let baseUrl: string;
let seeded: Seeded;

async function request(
  path: string,
  init: { method?: string; clerkId?: string; body?: unknown } = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (init.clerkId) headers["x-test-clerk-id"] = init.clerkId;
  const res = await fetch(`${baseUrl}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  let body: any = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body };
}

async function seed(): Promise<Seeded> {
  // Users
  const [adminU, pmU, conU, outU] = await db
    .insert(users)
    .values([
      { clerkUserId: `${TAG}-admin`, email: `${TAG}-admin@test.local` },
      { clerkUserId: `${TAG}-pm`, email: `${TAG}-pm@test.local` },
      { clerkUserId: `${TAG}-con`, email: `${TAG}-con@test.local` },
      { clerkUserId: `${TAG}-out`, email: `${TAG}-out@test.local` },
    ])
    .returning();

  // Companies
  const [adminCo, contractorCo, otherCo] = await db
    .insert(companies)
    .values([
      { name: `${TAG} Admin Co`, type: "Consultant" },
      { name: `${TAG} Contractor Co`, type: "MainContractor" },
      { name: `${TAG} Other Co`, type: "Subcontractor" },
    ])
    .returning();

  // Projects
  const [project, outOfScopeProject] = await db
    .insert(projects)
    .values([
      { name: `${TAG} Project A`, code: `${TAG}-A` },
      { name: `${TAG} Project B`, code: `${TAG}-B` },
    ])
    .returning();

  // Project companies (only on the in-scope project)
  const [adminPc, contractorPc, otherPc] = await db
    .insert(projectCompanies)
    .values([
      { projectId: project.id, companyId: adminCo.id, roleOnProject: "ArchConsultant" },
      { projectId: project.id, companyId: contractorCo.id, roleOnProject: "MainContractor" },
      { projectId: project.id, companyId: otherCo.id, roleOnProject: "InteriorContractor" },
    ])
    .returning();

  // user_companies: admin user is company admin on the consultant company
  await db.insert(userCompanies).values([
    { userId: adminU.id, companyId: adminCo.id, role: "admin" },
    { userId: pmU.id, companyId: adminCo.id, role: "member" },
    { userId: conU.id, companyId: contractorCo.id, role: "member" },
  ]);

  // project_assignments
  await db.insert(projectAssignments).values([
    {
      userId: pmU.id,
      projectId: project.id,
      role: "pm",
      companyId: null,
      createdByUserId: adminU.id,
    },
    {
      userId: conU.id,
      projectId: project.id,
      role: "contractor_lead",
      companyId: contractorCo.id,
      createdByUserId: adminU.id,
    },
  ]);

  // A milestone owned by MainContractor
  const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  const [milestone] = await db
    .insert(milestones)
    .values({
      projectId: project.id,
      stageCode: "ST5_CONSTRUCTION_SHELL_CORE",
      code: `${TAG}-MS1`,
      name: `${TAG} Milestone`,
      ownerRole: "MainContractor",
      baselineDate: future,
      currentDate: future,
    })
    .returning();

  // Change event + impacts for both contractor companies
  const [ce] = await db
    .insert(changeEvents)
    .values({
      milestoneId: milestone.id,
      oldDate: future,
      proposedNewDate: new Date(future.getTime() + 1000 * 60 * 60 * 24 * 7),
      changeReason: `${TAG} reason`,
      status: "SentForClientReview",
    })
    .returning();

  const [contractorImpact, otherImpact] = await db
    .insert(milestoneImpacts)
    .values([
      {
        changeEventId: ce.id,
        milestoneId: milestone.id,
        projectCompanyId: contractorPc.id,
        oldDate: future,
        newDate: new Date(future.getTime() + 1000 * 60 * 60 * 24 * 7),
      },
      {
        changeEventId: ce.id,
        milestoneId: milestone.id,
        projectCompanyId: otherPc.id,
        oldDate: future,
        newDate: new Date(future.getTime() + 1000 * 60 * 60 * 24 * 7),
      },
    ])
    .returning();

  return {
    adminUserId: adminU.id,
    adminClerkId: adminU.clerkUserId,
    pmUserId: pmU.id,
    pmClerkId: pmU.clerkUserId,
    contractorUserId: conU.id,
    contractorClerkId: conU.clerkUserId,
    outsiderUserId: outU.id,
    outsiderClerkId: outU.clerkUserId,
    adminCompanyId: adminCo.id,
    contractorCompanyId: contractorCo.id,
    otherCompanyId: otherCo.id,
    projectId: project.id,
    outOfScopeProjectId: outOfScopeProject.id,
    contractorPcId: contractorPc.id,
    otherPcId: otherPc.id,
    milestoneId: milestone.id,
    changeEventId: ce.id,
    contractorImpactId: contractorImpact.id,
    otherImpactId: otherImpact.id,
  };
}

async function teardown(s: Seeded): Promise<void> {
  const { inArray } = await import("drizzle-orm");
  // Cascades will handle most; explicit deletes by id to be safe.
  await db
    .delete(projects)
    .where(inArray(projects.id, [s.projectId, s.outOfScopeProjectId]));
  await db
    .delete(companies)
    .where(
      inArray(companies.id, [s.adminCompanyId, s.contractorCompanyId, s.otherCompanyId]),
    );
  await db
    .delete(users)
    .where(
      inArray(users.id, [
        s.adminUserId,
        s.pmUserId,
        s.contractorUserId,
        s.outsiderUserId,
      ]),
    );
}

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
  seeded = await seed();
});

after(async () => {
  if (seeded) await teardown(seeded);
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  if (dbModule.pool) {
    await dbModule.pool.end();
  }
});

describe("permission rules (HTTP)", () => {
  it("company admin can list /api/admin/projects and sees their project", async () => {
    const res = await request("/api/admin/projects", {
      clerkId: seeded.adminClerkId,
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    const found = res.body.find((p: any) => p.projectId === seeded.projectId);
    assert.ok(found, "admin should see their own project");
  });

  it("company admin can read /api/admin/projects/:id for their project", async () => {
    const res = await request(
      `/api/admin/projects/${seeded.projectId}`,
      { clerkId: seeded.adminClerkId },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.projectId, seeded.projectId);
    assert.ok(Array.isArray(res.body.assignments));
    assert.ok(Array.isArray(res.body.contractorCompanies));
  });

  it("company admin gets 403 on an out-of-scope project under /admin", async () => {
    const res = await request(
      `/api/admin/projects/${seeded.outOfScopeProjectId}`,
      { clerkId: seeded.adminClerkId },
    );
    assert.equal(res.status, 403);
  });

  it("PM-only user gets 403 on /api/admin/projects", async () => {
    const res = await request("/api/admin/projects", {
      clerkId: seeded.pmClerkId,
    });
    assert.equal(res.status, 403);
  });

  it("contractor user gets 403 on /api/admin/projects", async () => {
    const res = await request("/api/admin/projects", {
      clerkId: seeded.contractorClerkId,
    });
    assert.equal(res.status, 403);
  });

  it("PM-only user can see /api/projects/:id/pm-summary", async () => {
    const res = await request(
      `/api/projects/${seeded.projectId}/pm-summary`,
      { clerkId: seeded.pmClerkId },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.projectId, seeded.projectId);
  });

  it("contractor user gets 403 on /api/projects/:id/pm-summary", async () => {
    const res = await request(
      `/api/projects/${seeded.projectId}/pm-summary`,
      { clerkId: seeded.contractorClerkId },
    );
    assert.equal(res.status, 403);
  });

  it("out-of-scope project returns 403 (not 404) on pm-summary", async () => {
    const res = await request(
      `/api/projects/${seeded.outOfScopeProjectId}/pm-summary`,
      { clerkId: seeded.pmClerkId },
    );
    assert.equal(res.status, 403);
  });

  it("outsider (no memberships, no assignments) gets 403 on pm-summary", async () => {
    const res = await request(
      `/api/projects/${seeded.projectId}/pm-summary`,
      { clerkId: seeded.outsiderClerkId },
    );
    assert.equal(res.status, 403);
  });

  it("contractor can respond to their own impact", async () => {
    const res = await request(
      `/api/impacts/${seeded.contractorImpactId}/respond`,
      {
        method: "POST",
        clerkId: seeded.contractorClerkId,
        body: {
          impactRiskLevel: "Low",
          impactRiskType: "Time",
          mainRiskIssue: "test",
        },
      },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.responseStatus, "Submitted");
  });

  it("contractor gets 403 responding to another company's impact", async () => {
    const res = await request(
      `/api/impacts/${seeded.otherImpactId}/respond`,
      {
        method: "POST",
        clerkId: seeded.contractorClerkId,
        body: {
          impactRiskLevel: "Low",
          impactRiskType: "Time",
          mainRiskIssue: "test",
        },
      },
    );
    assert.equal(res.status, 403);
  });

  it("PM cannot respond to a contractor's impact (PM is not a contractor)", async () => {
    const res = await request(
      `/api/impacts/${seeded.otherImpactId}/respond`,
      {
        method: "POST",
        clerkId: seeded.pmClerkId,
        body: {
          impactRiskLevel: "Low",
          impactRiskType: "Time",
          mainRiskIssue: "test",
        },
      },
    );
    assert.equal(res.status, 403);
  });

  it("requests with no auth header are 401", async () => {
    const res = await request("/api/me");
    assert.equal(res.status, 401);
  });
});
