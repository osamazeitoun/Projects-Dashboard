import {
  db,
  pool,
  projects,
  companies,
  projectCompanies,
  milestones,
  milestoneEntryCompanies,
  changeEvents,
  milestoneImpacts,
} from "@workspace/db";

async function main() {
  console.log("Resetting demo data...");

  await db.delete(milestoneImpacts);
  await db.delete(changeEvents);
  await db.delete(milestoneEntryCompanies);
  await db.delete(milestones);
  await db.delete(projectCompanies);
  await db.delete(companies);
  await db.delete(projects);

  await db.execute(`ALTER SEQUENCE projects_id_seq RESTART WITH 1`);
  await db.execute(`ALTER SEQUENCE companies_id_seq RESTART WITH 1`);
  await db.execute(`ALTER SEQUENCE project_companies_id_seq RESTART WITH 1`);
  await db.execute(`ALTER SEQUENCE milestones_id_seq RESTART WITH 1`);
  await db.execute(
    `ALTER SEQUENCE milestone_entry_companies_id_seq RESTART WITH 1`,
  );
  await db.execute(`ALTER SEQUENCE change_events_id_seq RESTART WITH 1`);
  await db.execute(`ALTER SEQUENCE milestone_impacts_id_seq RESTART WITH 1`);

  const [project] = await db
    .insert(projects)
    .values({ name: "Marina Vista Tower", code: "MVT-001" })
    .returning();

  const insertedCompanies = await db
    .insert(companies)
    .values([
      { name: "Northline Developments", type: "Client", defaultRole: "Client" },
      {
        name: "Atelier Borden Architects",
        type: "Consultant",
        defaultRole: "ArchConsultant",
      },
      {
        name: "Mercato MEP Engineers",
        type: "Consultant",
        defaultRole: "MEPConsultant",
      },
      {
        name: "Halcyon Construction Co.",
        type: "MainContractor",
        defaultRole: "MainContractor",
      },
      {
        name: "Vantage Interiors",
        type: "Subcontractor",
        defaultRole: "InteriorContractor",
      },
    ])
    .returning();

  const [clientCo, archCo, mepCo, gcCo, intCo] = insertedCompanies;

  const insertedPc = await db
    .insert(projectCompanies)
    .values([
      { projectId: project.id, companyId: clientCo.id, roleOnProject: "Client" },
      {
        projectId: project.id,
        companyId: archCo.id,
        roleOnProject: "ArchConsultant",
      },
      {
        projectId: project.id,
        companyId: mepCo.id,
        roleOnProject: "MEPConsultant",
      },
      {
        projectId: project.id,
        companyId: gcCo.id,
        roleOnProject: "MainContractor",
      },
      {
        projectId: project.id,
        companyId: intCo.id,
        roleOnProject: "InteriorContractor",
      },
    ])
    .returning();

  const pcByCompanyId = new Map(insertedPc.map((pc) => [pc.companyId, pc]));

  const now = new Date();
  const days = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return d;
  };

  type SeedMilestone = {
    stageCode:
      | "ST1_PRE_DESIGN_CONCEPT"
      | "ST2_DESIGN_DEVELOPMENT"
      | "ST3_AUTHORITY_APPROVALS"
      | "ST4_DETAILED_DESIGN_TENDER"
      | "ST5_CONSTRUCTION_SHELL_CORE"
      | "ST6_CONSTRUCTION_MEP_BLOCKWORK"
      | "ST7_INTERIOR_FITOUT"
      | "ST8_EXTERNAL_WORKS_FINAL_MEP"
      | "ST9_COMPLETION_SNAGGING_HANDOVER"
      | "ST10_CLIENT_HANDOVER_DLP";
    code: string;
    name: string;
    ownerRole: string;
    offsetDays: number;
    status:
      | "Planned"
      | "OnTrack"
      | "AtRisk"
      | "Delayed"
      | "Completed";
    isKeyOutput?: boolean;
    criticalFlag?: boolean;
    isPaymentTrigger?: boolean;
    entryCompanyIds: number[];
  };

  const archPcId = pcByCompanyId.get(archCo.id)!.id;
  const mepPcId = pcByCompanyId.get(mepCo.id)!.id;
  const gcPcId = pcByCompanyId.get(gcCo.id)!.id;
  const intPcId = pcByCompanyId.get(intCo.id)!.id;
  const clientPcId = pcByCompanyId.get(clientCo.id)!.id;

  const seedMilestones: SeedMilestone[] = [
    {
      stageCode: "ST1_PRE_DESIGN_CONCEPT",
      code: "M-010",
      name: "Project Brief Approved",
      ownerRole: "Client",
      offsetDays: -180,
      status: "Completed",
      entryCompanyIds: [clientPcId, archPcId],
    },
    {
      stageCode: "ST2_DESIGN_DEVELOPMENT",
      code: "M-020",
      name: "Schematic Design Sign-off",
      ownerRole: "ArchConsultant",
      offsetDays: -90,
      status: "Completed",
      isKeyOutput: true,
      entryCompanyIds: [archPcId, mepPcId, clientPcId],
    },
    {
      stageCode: "ST2_DESIGN_DEVELOPMENT",
      code: "M-025",
      name: "MEP Concept Coordinated",
      ownerRole: "MEPConsultant",
      offsetDays: -45,
      status: "Completed",
      entryCompanyIds: [mepPcId, archPcId],
    },
    {
      stageCode: "ST3_AUTHORITY_APPROVALS",
      code: "M-030",
      name: "Building Permit Issued",
      ownerRole: "ArchConsultant",
      offsetDays: 12,
      status: "AtRisk",
      isKeyOutput: true,
      criticalFlag: true,
      entryCompanyIds: [archPcId, clientPcId],
    },
    {
      stageCode: "ST3_AUTHORITY_APPROVALS",
      code: "M-031",
      name: "Civil Defence NOC",
      ownerRole: "MEPConsultant",
      offsetDays: 24,
      status: "Planned",
      entryCompanyIds: [mepPcId],
    },
    {
      stageCode: "ST4_DETAILED_DESIGN_TENDER",
      code: "M-040",
      name: "IFC Drawings Released",
      ownerRole: "ArchConsultant",
      offsetDays: 30,
      status: "OnTrack",
      isKeyOutput: true,
      entryCompanyIds: [archPcId, mepPcId, gcPcId],
    },
    {
      stageCode: "ST4_DETAILED_DESIGN_TENDER",
      code: "M-045",
      name: "Main Contractor Awarded",
      ownerRole: "Client",
      offsetDays: 55,
      status: "Planned",
      isKeyOutput: true,
      isPaymentTrigger: true,
      entryCompanyIds: [gcPcId, clientPcId],
    },
    {
      stageCode: "ST5_CONSTRUCTION_SHELL_CORE",
      code: "M-050",
      name: "Site Mobilisation Complete",
      ownerRole: "MainContractor",
      offsetDays: 75,
      status: "Planned",
      entryCompanyIds: [gcPcId],
    },
    {
      stageCode: "ST5_CONSTRUCTION_SHELL_CORE",
      code: "M-055",
      name: "Substructure Cast Complete",
      ownerRole: "MainContractor",
      offsetDays: 140,
      status: "Planned",
      criticalFlag: true,
      entryCompanyIds: [gcPcId],
    },
    {
      stageCode: "ST6_CONSTRUCTION_MEP_BLOCKWORK",
      code: "M-060",
      name: "MEP Rough-in Level 5",
      ownerRole: "MEPConsultant",
      offsetDays: 210,
      status: "Planned",
      entryCompanyIds: [mepPcId, gcPcId],
    },
    {
      stageCode: "ST6_CONSTRUCTION_MEP_BLOCKWORK",
      code: "M-065",
      name: "Blockwork Top-Out",
      ownerRole: "MainContractor",
      offsetDays: 235,
      status: "Planned",
      entryCompanyIds: [gcPcId],
    },
    {
      stageCode: "ST7_INTERIOR_FITOUT",
      code: "M-070",
      name: "Interior Fit-out Mock-up Approved",
      ownerRole: "InteriorContractor",
      offsetDays: 260,
      status: "Planned",
      entryCompanyIds: [intPcId, archPcId, clientPcId],
    },
    {
      stageCode: "ST7_INTERIOR_FITOUT",
      code: "M-075",
      name: "Joinery Installation Complete",
      ownerRole: "InteriorContractor",
      offsetDays: 295,
      status: "Planned",
      entryCompanyIds: [intPcId],
    },
    {
      stageCode: "ST8_EXTERNAL_WORKS_FINAL_MEP",
      code: "M-080",
      name: "Final MEP Commissioning",
      ownerRole: "MEPConsultant",
      offsetDays: 320,
      status: "Planned",
      entryCompanyIds: [mepPcId, gcPcId],
    },
    {
      stageCode: "ST8_EXTERNAL_WORKS_FINAL_MEP",
      code: "M-085",
      name: "Landscape Practical Completion",
      ownerRole: "MainContractor",
      offsetDays: 335,
      status: "Planned",
      entryCompanyIds: [gcPcId],
    },
    {
      stageCode: "ST9_COMPLETION_SNAGGING_HANDOVER",
      code: "M-090",
      name: "Completion Certificate Issued",
      ownerRole: "ArchConsultant",
      offsetDays: 350,
      status: "Planned",
      isKeyOutput: true,
      criticalFlag: true,
      entryCompanyIds: [archPcId, gcPcId, clientPcId],
    },
    {
      stageCode: "ST9_COMPLETION_SNAGGING_HANDOVER",
      code: "M-095",
      name: "Snagging Closed",
      ownerRole: "MainContractor",
      offsetDays: 360,
      status: "Planned",
      entryCompanyIds: [gcPcId, archPcId],
    },
    {
      stageCode: "ST10_CLIENT_HANDOVER_DLP",
      code: "M-100",
      name: "Client Handover",
      ownerRole: "Client",
      offsetDays: 370,
      status: "Planned",
      isKeyOutput: true,
      isPaymentTrigger: true,
      entryCompanyIds: [clientPcId, gcPcId, archPcId],
    },
    {
      stageCode: "ST10_CLIENT_HANDOVER_DLP",
      code: "M-110",
      name: "DLP End / Final Sign-off",
      ownerRole: "Client",
      offsetDays: 735,
      status: "Planned",
      isKeyOutput: true,
      entryCompanyIds: [clientPcId, gcPcId],
    },
  ];

  for (const m of seedMilestones) {
    const baseline = days(m.offsetDays - 7);
    const previous =
      m.code === "M-030" || m.code === "M-040" ? days(m.offsetDays - 14) : null;
    const [inserted] = await db
      .insert(milestones)
      .values({
        projectId: project.id,
        stageCode: m.stageCode,
        code: m.code,
        name: m.name,
        ownerRole: m.ownerRole,
        baselineDate: baseline,
        currentDate: days(m.offsetDays),
        previousDate: previous,
        status: m.status,
        criticalFlag: m.criticalFlag ?? false,
        isKeyOutput: m.isKeyOutput ?? false,
        isPaymentTrigger: m.isPaymentTrigger ?? false,
        changeReasonLatest:
          m.code === "M-030"
            ? "Authority requested additional fire-safety review"
            : null,
        predecessorIds: [],
      })
      .returning();

    if (m.entryCompanyIds.length > 0) {
      await db.insert(milestoneEntryCompanies).values(
        m.entryCompanyIds.map((projectCompanyId) => ({
          milestoneId: inserted.id,
          projectCompanyId,
        })),
      );
    }
  }

  const allMilestones = await db.select().from(milestones);
  const findMs = (code: string) => allMilestones.find((x) => x.code === code)!;

  const permit = findMs("M-030");
  const ifc = findMs("M-040");

  const [permitChange] = await db
    .insert(changeEvents)
    .values({
      milestoneId: permit.id,
      oldDate: days(-2),
      proposedNewDate: days(12),
      changeReason:
        "Civil Defence requested additional fire-safety review before issuing permit.",
      status: "PMApproved",
      clientDecisionAt: new Date(),
      clientComment: "Approved with note to expedite NOC review.",
    })
    .returning();

  const [ifcChange] = await db
    .insert(changeEvents)
    .values({
      milestoneId: ifc.id,
      oldDate: days(16),
      proposedNewDate: days(30),
      changeReason:
        "Structural revisions for podium transfer slab require coordinated MEP updates.",
      status: "SentForClientReview",
    })
    .returning();

  await db.insert(milestoneImpacts).values([
    {
      changeEventId: permitChange.id,
      milestoneId: permit.id,
      projectCompanyId: archPcId,
      oldDate: days(-2),
      newDate: days(12),
      notifiedAt: days(-1),
      responseStatus: "Pending",
    },
    {
      changeEventId: ifcChange.id,
      milestoneId: ifc.id,
      projectCompanyId: archPcId,
      oldDate: days(16),
      newDate: days(30),
      notifiedAt: now,
      responseStatus: "Pending",
    },
    {
      changeEventId: ifcChange.id,
      milestoneId: ifc.id,
      projectCompanyId: mepPcId,
      oldDate: days(16),
      newDate: days(30),
      notifiedAt: now,
      responseStatus: "Pending",
    },
    {
      changeEventId: ifcChange.id,
      milestoneId: ifc.id,
      projectCompanyId: gcPcId,
      oldDate: days(16),
      newDate: days(30),
      notifiedAt: now,
      responseStatus: "Submitted",
      respondedAt: now,
      impactRiskLevel: "Medium",
      impactRiskType: "Time",
      mainRiskIssue: "Crew resequencing required if IFC slips further.",
      detailedComment:
        "We can absorb a 2-week shift but will need updated coordination drawings to avoid rework on podium MEP.",
    },
  ]);

  console.log("Seed complete.");
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
