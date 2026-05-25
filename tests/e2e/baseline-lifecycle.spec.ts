import { test, expect } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  users,
  companies,
  projects,
  projectCompanies,
  userCompanies,
  projectAssignments,
  milestones,
  milestoneEntryCompanies,
  scheduleBaselines,
} from "@workspace/db";

const DEV_CLERK_ID = "dev-bypass-user";
const DEV_EMAIL = "dev@local.test";

interface Seed {
  projectId: number;
  milestoneId: number;
  adminCompanyId: number;
  contractorCompanyId: number;
  clientCompanyId: number;
  tag: string;
}

async function ensureDevUser(): Promise<number> {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, DEV_CLERK_ID))
    .limit(1);
  if (existing.length > 0) return existing[0].id;
  const [u] = await db
    .insert(users)
    .values({ clerkUserId: DEV_CLERK_ID, email: DEV_EMAIL })
    .returning();
  return u.id;
}

async function seedProject(): Promise<Seed> {
  const tag = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const devUserId = await ensureDevUser();

  const [adminCo, contractorCo, clientCo] = await db
    .insert(companies)
    .values([
      { name: `${tag} Consultant Co`, type: "Consultant" },
      { name: `${tag} Contractor Co`, type: "MainContractor" },
      { name: `${tag} Client Co`, type: "Client" },
    ])
    .returning();

  const [project] = await db
    .insert(projects)
    .values([{ name: `${tag} Project`, code: `${tag}-P` }])
    .returning();

  const [_pmPc, contractorPc, _clientPc] = await db
    .insert(projectCompanies)
    .values([
      {
        projectId: project.id,
        companyId: adminCo.id,
        roleOnProject: "ArchConsultant",
      },
      {
        projectId: project.id,
        companyId: contractorCo.id,
        roleOnProject: "MainContractor",
      },
      {
        projectId: project.id,
        companyId: clientCo.id,
        roleOnProject: "Client",
      },
    ])
    .returning();

  // Make the dev-bypass user an admin on the client co (for client approval)
  // and an explicit PM on the project (for PM perspective).
  await db
    .insert(userCompanies)
    .values([
      { userId: devUserId, companyId: adminCo.id, role: "admin" },
      { userId: devUserId, companyId: clientCo.id, role: "admin" },
    ]);
  await db.insert(projectAssignments).values({
    userId: devUserId,
    projectId: project.id,
    role: "pm",
    companyId: null,
    createdByUserId: devUserId,
  });

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
      code: `${tag}-MS1`,
      name: `${tag} Milestone`,
      ownerRole: "MainContractor",
      baselineDate: future,
      currentDate: future,
    })
    .returning();

  await db.insert(milestoneEntryCompanies).values({
    milestoneId: milestone.id,
    projectCompanyId: contractorPc.id,
  });

  return {
    projectId: project.id,
    milestoneId: milestone.id,
    adminCompanyId: adminCo.id,
    contractorCompanyId: contractorCo.id,
    clientCompanyId: clientCo.id,
    tag,
  };
}

async function teardown(seed: Seed): Promise<void> {
  await db.delete(projects).where(eq(projects.id, seed.projectId));
  await db
    .delete(companies)
    .where(
      inArray(companies.id, [
        seed.adminCompanyId,
        seed.contractorCompanyId,
        seed.clientCompanyId,
      ]),
    );
}

test.describe("Schedule baseline lifecycle (UI)", () => {
  let seed: Seed;

  test.beforeEach(async () => {
    seed = await seedProject();
  });

  test.afterEach(async () => {
    if (seed) await teardown(seed);
  });

  test("PM submits the schedule for client baseline approval", async ({
    page,
  }) => {
    // PmSchedule reads the active project id from localStorage
    await page.addInitScript(
      ([key, id]) => window.localStorage.setItem(key, String(id)),
      ["milestones.pmProjectId", seed.projectId] as const,
    );
    await page.goto(`/pm/schedule`);

    // Draft banner with the submit CTA must render
    const submitButton = page.getByRole("button", {
      name: /Submit for Baseline/i,
    });
    await expect(submitButton).toBeVisible();

    await submitButton.click();

    // Confirm dialog
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/Note to client/i).fill("Please review.");
    await dialog
      .getByRole("button", { name: /Submit for approval/i })
      .click();

    // After success the banner flips to "Awaiting client baseline approval"
    await expect(
      page.getByText(/Awaiting client baseline approval/i),
    ).toBeVisible();

    // DB confirms a Pending baseline + project status flipped
    const baselines = await db
      .select()
      .from(scheduleBaselines)
      .where(eq(scheduleBaselines.projectId, seed.projectId));
    expect(baselines).toHaveLength(1);
    expect(baselines[0].status).toBe("Pending");

    const proj = await db
      .select()
      .from(projects)
      .where(eq(projects.id, seed.projectId))
      .limit(1);
    expect(proj[0].scheduleStatus).toBe("PendingBaseline");
  });

  test("Client approves a pending baseline", async ({ page }) => {
    // Seed straight to PendingBaseline by inserting a baseline row, mirroring
    // what the submit endpoint does (snapshot the one seeded milestone).
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    const snapshot = [
      {
        milestoneId: seed.milestoneId,
        code: `${seed.tag}-MS1`,
        name: `${seed.tag} Milestone`,
        stageCode: "ST5_CONSTRUCTION_SHELL_CORE",
        stageName: "ST5 Construction Shell & Core",
        ownerRole: "MainContractor",
        baselineDate: future.toISOString(),
        currentDate: future.toISOString(),
        isKeyOutput: false,
        criticalFlag: false,
        isPaymentTrigger: false,
        predecessorIds: [],
      },
    ];
    const [baseline] = await db
      .insert(scheduleBaselines)
      .values({
        projectId: seed.projectId,
        status: "Pending",
        submittedByUserId: await ensureDevUser(),
        submissionNote: "Awaiting approval",
        snapshot,
      })
      .returning();
    await db
      .update(projects)
      .set({ scheduleStatus: "PendingBaseline" })
      .where(eq(projects.id, seed.projectId));

    await page.goto(`/client/baseline-review/${baseline.id}`);

    const approveButton = page.getByRole("button", {
      name: /Approve baseline/i,
    });
    await expect(approveButton).toBeVisible();
    await approveButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/Comment/i).fill("Looks good.");
    await dialog.getByRole("button", { name: /^Approve$/ }).click();

    // Success toast + redirect to /client inbox
    await expect(
      page.getByText("Baseline approved", { exact: true }),
    ).toBeVisible();
    await page.waitForURL(/\/client(\/|$)/);

    // DB confirms approval applied
    const rows = await db
      .select()
      .from(scheduleBaselines)
      .where(eq(scheduleBaselines.id, baseline.id))
      .limit(1);
    expect(rows[0].status).toBe("Approved");

    const proj = await db
      .select()
      .from(projects)
      .where(eq(projects.id, seed.projectId))
      .limit(1);
    expect(proj[0].scheduleStatus).toBe("Baselined");
    expect(proj[0].baselinedAt).not.toBeNull();
  });
});
