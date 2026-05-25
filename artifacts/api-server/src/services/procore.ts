import { logger } from "../lib/logger";

/**
 * Procore HTTP client + sync data shapes.
 *
 * We use one shared, app-level Procore credential (a personal/company access
 * token) rather than per-user OAuth. The credential is supplied via env vars
 * and is read on every call so an admin can update it without restarting.
 *
 * Env vars:
 *   PROCORE_ACCESS_TOKEN     - bearer access token
 *   PROCORE_BASE_URL         - default https://api.procore.com
 *   PROCORE_COMPANY_ID       - Procore company id to scope project listings
 *   PROCORE_DEMO_MODE        - if "1", serve fixture data instead of HTTP
 *                              (lets the admin console work end-to-end before
 *                               real credentials are provisioned)
 *   PROCORE_RESYNC_INTERVAL_MINUTES - background re-sync cadence (default 60,
 *                                     0 disables)
 */

export type ProcoreConnectionStatus = {
  connected: boolean;
  demoMode: boolean;
  baseUrl: string;
  companyId: string | null;
  /** A human-readable reason if not connected. */
  error: string | null;
  resyncIntervalMinutes: number;
};

export type ProcoreProjectSummary = {
  procoreProjectId: string;
  name: string;
  code: string | null;
};

export type ProcoreProjectCompany = {
  procoreCompanyId: string;
  name: string;
  /** Role of this company on the project (e.g. "MainContractor"). */
  roleOnProject: string;
};

export type ProcoreProjectUser = {
  procoreUserId: string;
  email: string | null;
  name: string | null;
  /** Procore company id of the company this user belongs to on the project. */
  procoreCompanyId: string | null;
  /** Free-text role/job title from Procore. */
  jobTitle: string | null;
};

export type ProcoreProjectSnapshot = {
  project: ProcoreProjectSummary;
  companies: ProcoreProjectCompany[];
  users: ProcoreProjectUser[];
};

export function getProcoreConfig() {
  const baseUrl = (process.env.PROCORE_BASE_URL || "https://api.procore.com").replace(/\/$/, "");
  const token = process.env.PROCORE_ACCESS_TOKEN || "";
  const companyId = process.env.PROCORE_COMPANY_ID || "";
  const demoMode = process.env.PROCORE_DEMO_MODE === "1";
  const intervalRaw = Number(process.env.PROCORE_RESYNC_INTERVAL_MINUTES);
  const resyncIntervalMinutes = Number.isFinite(intervalRaw) && intervalRaw >= 0 ? intervalRaw : 60;
  return { baseUrl, token, companyId, demoMode, resyncIntervalMinutes };
}

export function getConnectionStatus(): ProcoreConnectionStatus {
  const cfg = getProcoreConfig();
  if (cfg.demoMode) {
    return {
      connected: true,
      demoMode: true,
      baseUrl: cfg.baseUrl,
      companyId: cfg.companyId || "demo",
      error: null,
      resyncIntervalMinutes: cfg.resyncIntervalMinutes,
    };
  }
  const errors: string[] = [];
  if (!cfg.token) errors.push("PROCORE_ACCESS_TOKEN is not set");
  if (!cfg.companyId) errors.push("PROCORE_COMPANY_ID is not set");
  return {
    connected: errors.length === 0,
    demoMode: false,
    baseUrl: cfg.baseUrl,
    companyId: cfg.companyId || null,
    error: errors.length === 0 ? null : errors.join("; "),
    resyncIntervalMinutes: cfg.resyncIntervalMinutes,
  };
}

export class ProcoreNotConnectedError extends Error {
  constructor(reason: string) {
    super(`Procore is not connected: ${reason}`);
    this.name = "ProcoreNotConnectedError";
  }
}

export class ProcoreApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(`Procore API ${status}: ${message}`);
    this.name = "ProcoreApiError";
    this.status = status;
  }
}

async function procoreFetch<T>(path: string, query?: Record<string, string | number>): Promise<T> {
  const cfg = getProcoreConfig();
  if (!cfg.token || !cfg.companyId) {
    throw new ProcoreNotConnectedError(
      !cfg.token ? "missing PROCORE_ACCESS_TOKEN" : "missing PROCORE_COMPANY_ID",
    );
  }
  const url = new URL(cfg.baseUrl + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  }
  // One light retry on 429 / 5xx.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          "Procore-Company-Id": cfg.companyId,
          Accept: "application/json",
        },
      });
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        lastErr = new ProcoreApiError(res.status, await res.text().catch(() => "transient"));
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new ProcoreApiError(res.status, body.slice(0, 200) || res.statusText);
      }
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      if (e instanceof ProcoreApiError) throw e;
      if (e instanceof ProcoreNotConnectedError) throw e;
      // network — retry once
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Procore fetch failed");
}

/* --------------------------- demo-mode fixtures --------------------------- */

const DEMO_PROJECTS: ProcoreProjectSnapshot[] = [
  {
    project: { procoreProjectId: "pc-1001", name: "Marina Bay Tower", code: "MBT-01" },
    companies: [
      { procoreCompanyId: "pcco-200", name: "Skyline Builders", roleOnProject: "MainContractor" },
      { procoreCompanyId: "pcco-201", name: "Apex MEP Services", roleOnProject: "Subcontractor" },
      { procoreCompanyId: "pcco-202", name: "Harbor Holdings Group", roleOnProject: "Client" },
    ],
    users: [
      {
        procoreUserId: "pcu-500",
        email: "alex.morgan@skylinebuilders.example",
        name: "Alex Morgan",
        procoreCompanyId: "pcco-200",
        jobTitle: "Project Manager",
      },
      {
        procoreUserId: "pcu-501",
        email: "jordan.lee@apexmep.example",
        name: "Jordan Lee",
        procoreCompanyId: "pcco-201",
        jobTitle: "Site Lead",
      },
      {
        procoreUserId: "pcu-502",
        email: "client.lead@harborholdings.example",
        name: "Sam Harbor",
        procoreCompanyId: "pcco-202",
        jobTitle: "Client Representative",
      },
    ],
  },
  {
    project: { procoreProjectId: "pc-1002", name: "Cedar Hospital Expansion", code: "CHE-22" },
    companies: [
      { procoreCompanyId: "pcco-210", name: "Northwind Construction", roleOnProject: "MainContractor" },
      { procoreCompanyId: "pcco-211", name: "Cedar Health Trust", roleOnProject: "Client" },
    ],
    users: [
      {
        procoreUserId: "pcu-510",
        email: "pat.rivera@northwind.example",
        name: "Pat Rivera",
        procoreCompanyId: "pcco-210",
        jobTitle: "Project Manager",
      },
    ],
  },
];

/* ---------------------------- public API calls ---------------------------- */

export async function listProcoreProjects(): Promise<ProcoreProjectSummary[]> {
  const cfg = getProcoreConfig();
  if (cfg.demoMode) {
    return DEMO_PROJECTS.map((p) => p.project);
  }
  type Row = { id: number; name: string; project_number?: string | null };
  const rows = await procoreFetch<Row[]>("/rest/v1.0/projects", { company_id: cfg.companyId });
  return rows.map((r) => ({
    procoreProjectId: String(r.id),
    name: r.name,
    code: r.project_number ?? null,
  }));
}

export async function getProcoreProjectSnapshot(
  procoreProjectId: string,
): Promise<ProcoreProjectSnapshot> {
  const cfg = getProcoreConfig();
  if (cfg.demoMode) {
    const found = DEMO_PROJECTS.find((p) => p.project.procoreProjectId === procoreProjectId);
    if (!found) throw new ProcoreApiError(404, `Unknown demo project ${procoreProjectId}`);
    return found;
  }

  type ProjectRow = { id: number; name: string; project_number?: string | null };
  type VendorRow = { id: number; name: string; trade?: { name?: string } | null };
  type UserRow = {
    id: number;
    email_address?: string | null;
    name?: string | null;
    vendor?: { id?: number } | null;
    job_title?: string | null;
  };

  const idNum = Number(procoreProjectId);
  if (!Number.isFinite(idNum)) {
    throw new ProcoreApiError(400, `Invalid project id ${procoreProjectId}`);
  }

  const [proj, vendors, projectUsers] = await Promise.all([
    procoreFetch<ProjectRow>(`/rest/v1.0/projects/${idNum}`, { company_id: cfg.companyId }),
    procoreFetch<VendorRow[]>(`/rest/v1.0/projects/${idNum}/vendors`, { company_id: cfg.companyId }),
    procoreFetch<UserRow[]>(`/rest/v1.0/projects/${idNum}/users`, { company_id: cfg.companyId }),
  ]);

  return {
    project: {
      procoreProjectId: String(proj.id),
      name: proj.name,
      code: proj.project_number ?? null,
    },
    companies: vendors.map((v) => ({
      procoreCompanyId: String(v.id),
      name: v.name,
      roleOnProject: v.trade?.name || "Subcontractor",
    })),
    users: projectUsers.map((u) => ({
      procoreUserId: String(u.id),
      email: u.email_address ?? null,
      name: u.name ?? null,
      procoreCompanyId: u.vendor?.id != null ? String(u.vendor.id) : null,
      jobTitle: u.job_title ?? null,
    })),
  };
}

/** Map a free-text Procore job title onto our project assignment role enum. */
export function mapProcoreJobTitleToRole(
  jobTitle: string | null,
): "pm" | "contractor_lead" | "contractor_member" | "viewer" {
  if (!jobTitle) return "contractor_member";
  const t = jobTitle.toLowerCase();
  if (t.includes("project manager") || /\bpm\b/.test(t)) return "pm";
  if (t.includes("lead") || t.includes("superintendent") || t.includes("foreman")) {
    return "contractor_lead";
  }
  if (t.includes("client") || t.includes("owner") || t.includes("representative")) {
    return "viewer";
  }
  return "contractor_member";
}

/** Normalize a company name for fuzzy matching (case + whitespace insensitive). */
export function normalizeCompanyName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export const _procoreInternals = { DEMO_PROJECTS, procoreFetch };

export function logProcore(level: "info" | "warn" | "error", msg: string, extra?: object) {
  logger[level]({ procore: true, ...(extra ?? {}) }, msg);
}
