import { db, projectStages, milestones } from "@workspace/db";
import { asc, sql } from "drizzle-orm";

export type StageRow = {
  id: number;
  code: string;
  label: string;
  displayOrder: number;
  isBuiltIn: boolean;
};

const BUILT_IN_STAGES: Array<{ code: string; label: string }> = [
  { code: "ST1_PRE_DESIGN_CONCEPT", label: "Pre-design and Concept" },
  { code: "ST2_DESIGN_DEVELOPMENT", label: "Design Development" },
  { code: "ST3_AUTHORITY_APPROVALS", label: "Authority Approvals and NOCs" },
  { code: "ST4_DETAILED_DESIGN_TENDER", label: "Detailed Design and Tender" },
  { code: "ST5_CONSTRUCTION_SHELL_CORE", label: "Construction – Shell and Core" },
  { code: "ST6_CONSTRUCTION_MEP_BLOCKWORK", label: "Construction – MEP / Blockwork" },
  { code: "ST7_INTERIOR_FITOUT", label: "Interior Fit-Out" },
  { code: "ST8_EXTERNAL_WORKS_FINAL_MEP", label: "External Works / Final MEP" },
  { code: "ST9_COMPLETION_SNAGGING_HANDOVER", label: "Completion and Handover" },
  { code: "ST10_CLIENT_HANDOVER_DLP", label: "Client Handover and DLP" },
];

/**
 * Process-level cache of stages. Routes import these directly and call
 * `.get(code)` synchronously. The cache is populated at boot via
 * `refreshStageCache()` and re-populated after every stage mutation.
 */
export const stageNameByCode = new Map<string, string>();
export const stageOrderByCode = new Map<string, number>();
export const stageInfo: Array<{ code: string; name: string; order: number }> = [];

let seeded = false;

export async function ensureBuiltInStagesSeeded(): Promise<void> {
  if (seeded) return;
  for (let i = 0; i < BUILT_IN_STAGES.length; i++) {
    const s = BUILT_IN_STAGES[i];
    await db
      .insert(projectStages)
      .values({
        code: s.code,
        label: s.label,
        displayOrder: i + 1,
        isBuiltIn: true,
      })
      .onConflictDoNothing({ target: projectStages.code });
  }
  seeded = true;
}

export async function listStageRows(): Promise<StageRow[]> {
  const rows = await db
    .select({
      id: projectStages.id,
      code: projectStages.code,
      label: projectStages.label,
      displayOrder: projectStages.displayOrder,
      isBuiltIn: projectStages.isBuiltIn,
    })
    .from(projectStages)
    .orderBy(asc(projectStages.displayOrder), asc(projectStages.id));
  return rows;
}

export async function refreshStageCache(): Promise<StageRow[]> {
  await ensureBuiltInStagesSeeded();
  const rows = await listStageRows();
  stageNameByCode.clear();
  stageOrderByCode.clear();
  stageInfo.length = 0;
  for (const r of rows) {
    stageNameByCode.set(r.code, r.label);
    stageOrderByCode.set(r.code, r.displayOrder);
    stageInfo.push({ code: r.code, name: r.label, order: r.displayOrder });
  }
  return rows;
}

export async function getMilestoneCountsByStageCode(): Promise<Map<string, number>> {
  const rows = await db
    .select({
      stageCode: milestones.stageCode,
      count: sql<number>`COUNT(*)`,
    })
    .from(milestones)
    .groupBy(milestones.stageCode);
  return new Map(rows.map((r) => [r.stageCode, Number(r.count)]));
}
