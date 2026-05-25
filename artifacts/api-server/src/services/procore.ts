import { logger } from "../lib/logger";
import {
  getActiveToken,
  getActiveTokenRow,
  getConnectedByEmail,
  checkOAuthEnv,
} from "./procore-oauth";

/**
 * Resolve credential scope: a specific local companyId (admin's company)
 * means "use that company's OAuth connection only"; undefined means "no
 * user context — fall back to any usable token", used by the background
 * re-sync at server boot.
 */
export type ProcoreCallerCompany = number | undefined;

/**
 * Procore HTTP client + sync data shapes.
 *
 * Credentials are resolved in this order on every request:
 *   1. The most-recently connected OAuth refresh token (per-company), auto-
 *      refreshed before expiry. Stored encrypted in `procore_oauth_tokens`.
 *      Set up by an admin via the "Connect Procore" button on /admin/procore.
 *   2. Legacy env-var fallback (PROCORE_ACCESS_TOKEN + PROCORE_COMPANY_ID)
 *      so existing installs keep working without rotation.
 *   3. Demo mode (PROCORE_DEMO_MODE=1) for previewing the UI with fixtures.
 *
 * Env vars:
 *   PROCORE_ACCESS_TOKEN     - bearer access token (fallback)
 *   PROCORE_BASE_URL         - default https://api.procore.com
 *   PROCORE_COMPANY_ID       - Procore company id (fallback)
 *   PROCORE_DEMO_MODE        - if "1", serve fixture data instead of HTTP
 *   PROCORE_RESYNC_INTERVAL_MINUTES - background re-sync cadence
 *
 * OAuth-only env vars (see ./procore-oauth.ts):
 *   PROCORE_CLIENT_ID, PROCORE_CLIENT_SECRET,
 *   PROCORE_OAUTH_REDIRECT_URI, PROCORE_TOKEN_ENCRYPTION_KEY
 */

export type ProcoreConnectionSource = "oauth" | "env" | "demo" | "none";

export type ProcoreConnectionStatus = {
  connected: boolean;
  demoMode: boolean;
  baseUrl: string;
  companyId: string | null;
  /** A human-readable reason if not connected. */
  error: string | null;
  resyncIntervalMinutes: number;
  /** Which credential the runtime is currently using. */
  source: ProcoreConnectionSource;
  /** Email of the user who linked the active OAuth connection, if any. */
  connectedByEmail: string | null;
  /** Procore display name of the linked Procore user, if any. */
  connectedProcoreUser: string | null;
  /** When the active OAuth connection was authorised (ISO string). */
  connectedAt: string | null;
  /** When the access token was last refreshed (ISO string). */
  lastRefreshedAt: string | null;
  /** Whether OAuth is fully configured on the server (independent of whether anyone has connected). */
  oauthConfigured: boolean;
  /** Missing env vars when oauthConfigured is false. */
  oauthMissingEnv: string[];
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

type ResolvedAuth = {
  token: string;
  companyId: string;
  baseUrl: string;
  source: "oauth" | "env";
};

/** Resolve the credential to use for the next outbound Procore call. */
async function resolveAuth(
  callerCompanyId?: ProcoreCallerCompany,
): Promise<ResolvedAuth | null> {
  try {
    const oauth = await getActiveToken(callerCompanyId);
    if (oauth) {
      const cid =
        oauth.procoreCompanyId ||
        process.env.PROCORE_COMPANY_ID ||
        "";
      if (!cid) {
        logProcore("warn", "OAuth connection has no procoreCompanyId and PROCORE_COMPANY_ID is unset");
      }
      return {
        token: oauth.accessToken,
        companyId: cid,
        baseUrl: oauth.baseUrl,
        source: "oauth",
      };
    }
  } catch (e) {
    logProcore("warn", "Procore OAuth token unusable, attempting env fallback", {
      err: e instanceof Error ? e.message : String(e),
    });
  }
  const cfg = getProcoreConfig();
  if (cfg.token && cfg.companyId) {
    return {
      token: cfg.token,
      companyId: cfg.companyId,
      baseUrl: cfg.baseUrl,
      source: "env",
    };
  }
  return null;
}

export async function getConnectionStatus(
  callerCompanyId?: ProcoreCallerCompany,
): Promise<ProcoreConnectionStatus> {
  const cfg = getProcoreConfig();
  const envCheck = checkOAuthEnv();
  const base: Pick<
    ProcoreConnectionStatus,
    "resyncIntervalMinutes" | "oauthConfigured" | "oauthMissingEnv"
  > = {
    resyncIntervalMinutes: cfg.resyncIntervalMinutes,
    oauthConfigured: envCheck.ok,
    oauthMissingEnv: envCheck.missing,
  };

  if (cfg.demoMode) {
    return {
      ...base,
      connected: true,
      demoMode: true,
      baseUrl: cfg.baseUrl,
      companyId: cfg.companyId || "demo",
      error: null,
      source: "demo",
      connectedByEmail: null,
      connectedProcoreUser: null,
      connectedAt: null,
      lastRefreshedAt: null,
    };
  }

  // Try OAuth row first (read-only — does not refresh, just reports).
  try {
    const row = await getActiveTokenRow(callerCompanyId);
    if (row) {
      const email = await getConnectedByEmail(row.connectedByUserId);
      return {
        ...base,
        connected: true,
        demoMode: false,
        baseUrl: row.baseUrl,
        companyId: row.procoreCompanyId || cfg.companyId || null,
        error: null,
        source: "oauth",
        connectedByEmail: email,
        connectedProcoreUser: row.procoreUserName ?? row.procoreUserEmail,
        connectedAt: row.connectedAt.toISOString(),
        lastRefreshedAt: row.lastRefreshedAt?.toISOString() ?? null,
      };
    }
  } catch (e) {
    logProcore("warn", "Failed reading procore_oauth_tokens row for status", {
      err: e instanceof Error ? e.message : String(e),
    });
  }

  // Fall back to env-var credential.
  const envErrors: string[] = [];
  if (!cfg.token) envErrors.push("PROCORE_ACCESS_TOKEN is not set");
  if (!cfg.companyId) envErrors.push("PROCORE_COMPANY_ID is not set");
  if (envErrors.length === 0) {
    return {
      ...base,
      connected: true,
      demoMode: false,
      baseUrl: cfg.baseUrl,
      companyId: cfg.companyId,
      error: null,
      source: "env",
      connectedByEmail: null,
      connectedProcoreUser: null,
      connectedAt: null,
      lastRefreshedAt: null,
    };
  }

  return {
    ...base,
    connected: false,
    demoMode: false,
    baseUrl: cfg.baseUrl,
    companyId: cfg.companyId || null,
    error: envErrors.join("; "),
    source: "none",
    connectedByEmail: null,
    connectedProcoreUser: null,
    connectedAt: null,
    lastRefreshedAt: null,
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

async function procoreFetch<T>(
  path: string,
  query?: Record<string, string | number>,
  auth?: ResolvedAuth,
): Promise<T> {
  const resolved = auth ?? (await resolveAuth());
  if (!resolved) {
    throw new ProcoreNotConnectedError(
      "no OAuth connection and PROCORE_ACCESS_TOKEN/PROCORE_COMPANY_ID not set",
    );
  }
  if (!resolved.companyId) {
    throw new ProcoreNotConnectedError("no Procore company id available");
  }
  const url = new URL(resolved.baseUrl + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  }
  // One light retry on 429 / 5xx.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${resolved.token}`,
          "Procore-Company-Id": resolved.companyId,
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

export async function listProcoreProjects(
  callerCompanyId?: ProcoreCallerCompany,
): Promise<ProcoreProjectSummary[]> {
  const cfg = getProcoreConfig();
  if (cfg.demoMode) {
    return DEMO_PROJECTS.map((p) => p.project);
  }
  const auth = await resolveAuth(callerCompanyId);
  if (!auth) {
    throw new ProcoreNotConnectedError(
      "no OAuth connection and PROCORE_ACCESS_TOKEN/PROCORE_COMPANY_ID not set",
    );
  }
  type Row = { id: number; name: string; project_number?: string | null };
  const rows = await procoreFetch<Row[]>(
    "/rest/v1.0/projects",
    { company_id: auth.companyId },
    auth,
  );
  return rows.map((r) => ({
    procoreProjectId: String(r.id),
    name: r.name,
    code: r.project_number ?? null,
  }));
}

export async function getProcoreProjectSnapshot(
  procoreProjectId: string,
  callerCompanyId?: ProcoreCallerCompany,
): Promise<ProcoreProjectSnapshot> {
  const cfg = getProcoreConfig();
  if (cfg.demoMode) {
    const found = DEMO_PROJECTS.find((p) => p.project.procoreProjectId === procoreProjectId);
    if (!found) throw new ProcoreApiError(404, `Unknown demo project ${procoreProjectId}`);
    return found;
  }

  const auth = await resolveAuth(callerCompanyId);
  if (!auth) {
    throw new ProcoreNotConnectedError(
      "no OAuth connection and PROCORE_ACCESS_TOKEN/PROCORE_COMPANY_ID not set",
    );
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
    procoreFetch<ProjectRow>(`/rest/v1.0/projects/${idNum}`, { company_id: auth.companyId }, auth),
    procoreFetch<VendorRow[]>(`/rest/v1.0/projects/${idNum}/vendors`, { company_id: auth.companyId }, auth),
    procoreFetch<UserRow[]>(`/rest/v1.0/projects/${idNum}/users`, { company_id: auth.companyId }, auth),
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

export const _procoreInternals = { DEMO_PROJECTS, procoreFetch, resolveAuth };

export function logProcore(level: "info" | "warn" | "error", msg: string, extra?: object) {
  logger[level]({ procore: true, ...(extra ?? {}) }, msg);
}
