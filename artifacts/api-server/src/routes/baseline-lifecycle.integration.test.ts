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
  milestoneEntryCompanies,
  changeEvents,
  scheduleBaselines,
} = dbModule;

const TAG = `bl-it-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

interface Seeded {
  pmUserId: number;
  pmClerkId: string;
  clientUserId: number;
  clientClerkId: string;
  adminCompanyId: number;
  contractorCompanyId: number;
  clientCompanyId: number;
  projectId: number;
  pmPcId: number;
  contractorPcId: number;
  milestoneId: number;
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
  const { eq } = await import("drizzle-orm");

  // Users
  const [pmU, clientU] = await db
    .insert(users)
    .values([
      { clerkUserId: `${TAG}-pm`, email: `${TAG}-pm@test.local` },
      { clerkUserId: `${TAG}-client`, email: `${TAG}-client@test.local` },
    ])
    .returning();

  // Companies — PM is on a Consultant; client is on a Client; plus a contractor
  const [adminCo, contractorCo, clientCo] = await db
    .insert(companies)
    .values([
      { name: `${TAG} Consultant Co`, type: "Consultant" },
      { name: `${TAG} Contractor Co`, type: "MainContractor" },
      { name: `${TAG} Client Co`, type: "Client" },
    ])
    .returning();

  // Project
  const [project] = await db
    .insert(projects)
    .values([{ name: `${TAG} Project`, code: `${TAG}-P` }])
    .returning();

  // Project companies
  const [pmPc, contractorPc, _clientPc] = await db
    .insert(projectCompanies)
    .values([
      { projectId: project.id, companyId: adminCo.id, roleOnProject: "ArchConsultant" },
      { projectId: project.id, companyId: contractorCo.id, roleOnProject: "MainContractor" },
      { projectId: project.id, companyId: clientCo.id, roleOnProject: "Client" },
    ])
    .returning();

  // Memberships
  await db.insert(userCompanies).values([
    { userId: pmU.id, companyId: adminCo.id, role: "member" },
    { userId: clientU.id, companyId: clientCo.id, role: "admin" },
  ]);

  // PM assignment on the project
  await db.insert(projectAssignments).values([
    {
      userId: pmU.id,
      projectId: project.id,
      role: "pm",
      companyId: null,
      createdByUserId: pmU.id,
    },
  ]);

  // Ensure project starts in Draft (default) and has at least one milestone
  await db
    .update(projects)
    .set({ scheduleStatus: "Draft", baselinedAt: null })
    .where(eq(projects.id, project.id));

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

  await db
    .insert(milestoneEntryCompanies)
    .values([{ milestoneId: milestone.id, projectCompanyId: contractorPc.id }]);

  return {
    pmUserId: pmU.id,
    pmClerkId: pmU.clerkUserId,
    clientUserId: clientU.id,
    clientClerkId: clientU.clerkUserId,
    adminCompanyId: adminCo.id,
    contractorCompanyId: contractorCo.id,
    clientCompanyId: clientCo.id,
    projectId: project.id,
    pmPcId: pmPc.id,
    contractorPcId: contractorPc.id,
    milestoneId: milestone.id,
  };
}

async function teardown(s: Seeded): Promise<void> {
  const { inArray } = await import("drizzle-orm");
  await db.delete(projects).where(inArray(projects.id, [s.projectId]));
  await db
    .delete(companies)
    .where(
      inArray(companies.id, [s.adminCompanyId, s.contractorCompanyId, s.clientCompanyId]),
    );
  await db.delete(users).where(inArray(users.id, [s.pmUserId, s.clientUserId]));
}

async function resetProjectToDraft(): Promise<void> {
  const { eq } = await import("drizzle-orm");
  // Wipe baselines + change events to allow re-running the lifecycle.
  await db
    .delete(scheduleBaselines)
    .where(eq(scheduleBaselines.projectId, seeded.projectId));
  await db
    .delete(changeEvents)
    .where(eq(changeEvents.milestoneId, seeded.milestoneId));
  await db
    .update(projects)
    .set({ scheduleStatus: "Draft", baselinedAt: null })
    .where(eq(projects.id, seeded.projectId));
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

async function submitBaseline(clerkId: string, note = "first cut") {
  return request(`/api/projects/${seeded.projectId}/schedule/submit-baseline`, {
    method: "POST",
    clerkId,
    body: { note },
  });
}

async function decideBaseline(
  baselineId: number,
  clerkId: string,
  decision: "approve" | "reject",
  comment?: string,
) {
  return request(`/api/me/baseline-reviews/${baselineId}/decision`, {
    method: "POST",
    clerkId,
    body: comment !== undefined ? { decision, comment } : { decision },
  });
}

describe("schedule baseline lifecycle (HTTP)", () => {
  it("submit-baseline succeeds only from Draft and moves project to PendingBaseline", async () => {
    await resetProjectToDraft();

    const ok = await submitBaseline(seeded.pmClerkId);
    assert.equal(ok.status, 201);
    assert.equal(ok.body.status, "Pending");
    assert.equal(ok.body.projectId, seeded.projectId);
    assert.ok(ok.body.milestoneCount >= 1);
    assert.equal(ok.body.submittedByEmail, `${TAG}-pm@test.local`);

    const { eq } = await import("drizzle-orm");
    const [proj] = await db
      .select({ scheduleStatus: projects.scheduleStatus })
      .from(projects)
      .where(eq(projects.id, seeded.projectId));
    assert.equal(proj.scheduleStatus, "PendingBaseline");

    // Re-submitting from PendingBaseline must 409.
    const second = await submitBaseline(seeded.pmClerkId);
    assert.equal(second.status, 409);
  });

  it("approve transitions to Baselined and sets baselinedAt", async () => {
    await resetProjectToDraft();
    const submit = await submitBaseline(seeded.pmClerkId);
    assert.equal(submit.status, 201);
    const baselineId = submit.body.id as number;

    const approved = await decideBaseline(baselineId, seeded.clientClerkId, "approve");
    assert.equal(approved.status, 200);
    assert.equal(approved.body.status, "Approved");
    assert.ok(approved.body.decidedAt);
    assert.equal(approved.body.decidedByEmail, `${TAG}-client@test.local`);

    const { eq } = await import("drizzle-orm");
    const [proj] = await db
      .select({
        scheduleStatus: projects.scheduleStatus,
        baselinedAt: projects.baselinedAt,
      })
      .from(projects)
      .where(eq(projects.id, seeded.projectId));
    assert.equal(proj.scheduleStatus, "Baselined");
    assert.ok(proj.baselinedAt, "baselinedAt should be set after approval");

    // After approval, the baseline is no longer Pending — second decision must 400.
    const repeat = await decideBaseline(baselineId, seeded.clientClerkId, "approve");
    assert.equal(repeat.status, 400);
  });

  it("reject returns the project to Draft and requires a comment", async () => {
    await resetProjectToDraft();
    const submit = await submitBaseline(seeded.pmClerkId);
    const baselineId = submit.body.id as number;

    // Reject without comment is 400.
    const noComment = await decideBaseline(baselineId, seeded.clientClerkId, "reject");
    assert.equal(noComment.status, 400);

    const rejected = await decideBaseline(
      baselineId,
      seeded.clientClerkId,
      "reject",
      "missing scope",
    );
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.status, "Rejected");
    assert.equal(rejected.body.decisionComment, "missing scope");

    const { eq } = await import("drizzle-orm");
    const [proj] = await db
      .select({
        scheduleStatus: projects.scheduleStatus,
        baselinedAt: projects.baselinedAt,
      })
      .from(projects)
      .where(eq(projects.id, seeded.projectId));
    assert.equal(proj.scheduleStatus, "Draft");
    assert.equal(proj.baselinedAt, null);
  });

  it("milestone create is rejected with 409 once the schedule leaves Draft", async () => {
    await resetProjectToDraft();
    await submitBaseline(seeded.pmClerkId); // -> PendingBaseline

    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 60);
    const res = await request(
      `/api/projects/${seeded.projectId}/milestones-create`,
      {
        method: "POST",
        clerkId: seeded.pmClerkId,
        body: {
          stageCode: "ST5_CONSTRUCTION_SHELL_CORE",
          code: `${TAG}-NEW`,
          name: "Would-be milestone",
          ownerRole: "MainContractor",
          baselineDate: future.toISOString(),
        },
      },
    );
    assert.equal(res.status, 409);
  });

  it("milestone update is rejected with 409 once the schedule leaves Draft", async () => {
    await resetProjectToDraft();
    await submitBaseline(seeded.pmClerkId);

    const res = await request(`/api/milestones/${seeded.milestoneId}`, {
      method: "PATCH",
      clerkId: seeded.pmClerkId,
      body: { name: `${TAG} renamed` },
    });
    assert.equal(res.status, 409);
  });

  it("milestone delete is rejected with 409 once the schedule leaves Draft", async () => {
    await resetProjectToDraft();
    await submitBaseline(seeded.pmClerkId);

    const res = await request(`/api/milestones/${seeded.milestoneId}`, {
      method: "DELETE",
      clerkId: seeded.pmClerkId,
    });
    assert.equal(res.status, 409);
  });

  it("milestone create/update/delete are also rejected with 409 once Baselined", async () => {
    await resetProjectToDraft();
    const submit = await submitBaseline(seeded.pmClerkId);
    const baselineId = submit.body.id as number;
    const approve = await decideBaseline(baselineId, seeded.clientClerkId, "approve");
    assert.equal(approve.status, 200);

    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90);
    const create = await request(
      `/api/projects/${seeded.projectId}/milestones-create`,
      {
        method: "POST",
        clerkId: seeded.pmClerkId,
        body: {
          stageCode: "ST5_CONSTRUCTION_SHELL_CORE",
          code: `${TAG}-NEW2`,
          name: "Would-be milestone",
          ownerRole: "MainContractor",
          baselineDate: future.toISOString(),
        },
      },
    );
    assert.equal(create.status, 409);

    const update = await request(`/api/milestones/${seeded.milestoneId}`, {
      method: "PATCH",
      clerkId: seeded.pmClerkId,
      body: { name: `${TAG} renamed direct` },
    });
    assert.equal(update.status, 409);

    const del = await request(`/api/milestones/${seeded.milestoneId}`, {
      method: "DELETE",
      clerkId: seeded.pmClerkId,
    });
    assert.equal(del.status, 409);
  });

  it("/milestones/:id/edit-requests is rejected with 409 when not Baselined", async () => {
    // From Draft
    await resetProjectToDraft();
    const draftRes = await request(
      `/api/milestones/${seeded.milestoneId}/edit-requests`,
      {
        method: "POST",
        clerkId: seeded.pmClerkId,
        body: {
          proposedChanges: { name: `${TAG} new name` },
          changeReason: "fix typo",
        },
      },
    );
    assert.equal(draftRes.status, 409);

    // From PendingBaseline
    await submitBaseline(seeded.pmClerkId);
    const pendingRes = await request(
      `/api/milestones/${seeded.milestoneId}/edit-requests`,
      {
        method: "POST",
        clerkId: seeded.pmClerkId,
        body: {
          proposedChanges: { name: `${TAG} new name` },
          changeReason: "fix typo",
        },
      },
    );
    assert.equal(pendingRes.status, 409);
  });

  it("FieldEdit approval applies proposedChanges to the milestone", async () => {
    await resetProjectToDraft();
    const submit = await submitBaseline(seeded.pmClerkId);
    const baselineId = submit.body.id as number;
    const approve = await decideBaseline(baselineId, seeded.clientClerkId, "approve");
    assert.equal(approve.status, 200);

    // Create FieldEdit request (no impacted companies -> auto SentForClientReview).
    const newName = `${TAG} renamed via field edit`;
    const created = await request(
      `/api/milestones/${seeded.milestoneId}/edit-requests`,
      {
        method: "POST",
        clerkId: seeded.pmClerkId,
        body: {
          proposedChanges: { name: newName, criticalFlag: true },
          changeReason: "scope clarification",
        },
      },
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.editKind, "FieldEdit");
    assert.equal(created.body.status, "SentForClientReview");
    const changeEventId = created.body.id as number;

    // Client approves the change event.
    const clientDecision = await request(
      `/api/me/client-reviews/${changeEventId}/decision`,
      {
        method: "POST",
        clerkId: seeded.clientClerkId,
        body: { decision: "approve" },
      },
    );
    assert.equal(clientDecision.status, 200);
    assert.equal(clientDecision.body.status, "ClientApproved");

    // PM final-approves -> applyFieldEditToMilestone runs.
    const pmApprove = await request(
      `/api/change-events/${changeEventId}/transition`,
      {
        method: "POST",
        clerkId: seeded.pmClerkId,
        body: { action: "pm_approve" },
      },
    );
    assert.equal(pmApprove.status, 200);
    assert.equal(pmApprove.body.status, "PMApproved");

    const { eq } = await import("drizzle-orm");
    const [m] = await db
      .select({
        name: milestones.name,
        criticalFlag: milestones.criticalFlag,
        currentDate: milestones.currentDate,
        baselineDate: milestones.baselineDate,
        changeReasonLatest: milestones.changeReasonLatest,
      })
      .from(milestones)
      .where(eq(milestones.id, seeded.milestoneId));
    assert.equal(m.name, newName);
    assert.equal(m.criticalFlag, true);
    assert.equal(m.changeReasonLatest, "scope clarification");
    // Date fields must be untouched by a FieldEdit.
    assert.equal(
      m.currentDate.getTime(),
      m.baselineDate.getTime(),
      "FieldEdit must not change baseline/current dates",
    );
  });
});
