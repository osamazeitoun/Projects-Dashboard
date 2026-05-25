import { db, procoreOAuthTokens, users, type ProcoreOAuthToken } from "@workspace/db";
import { desc, eq, isNull } from "drizzle-orm";
import {
  decryptSecret,
  encryptSecret,
  hasEncryptionKey,
} from "../lib/encryption";
import { logger } from "../lib/logger";

/**
 * Procore OAuth 2.0 helper. Procore uses the standard Authorization Code
 * grant; we keep the refresh token (encrypted) so an admin only has to
 * approve once. Access tokens are short-lived (~2h) and are refreshed
 * transparently a minute before they expire.
 *
 * Required env vars (only for OAuth; the existing PROCORE_ACCESS_TOKEN
 * env-var path keeps working as a fallback for installs that don't use
 * OAuth yet):
 *   PROCORE_CLIENT_ID
 *   PROCORE_CLIENT_SECRET
 *   PROCORE_OAUTH_REDIRECT_URI  - must exactly match Procore app config
 *   PROCORE_TOKEN_ENCRYPTION_KEY - 32-byte secret (hex/base64/passphrase)
 */

export type OAuthEnvCheck = { ok: boolean; missing: string[] };

export function getOAuthConfig() {
  const baseUrl = (process.env.PROCORE_BASE_URL || "https://api.procore.com").replace(/\/$/, "");
  return {
    clientId: process.env.PROCORE_CLIENT_ID || "",
    clientSecret: process.env.PROCORE_CLIENT_SECRET || "",
    redirectUri: process.env.PROCORE_OAUTH_REDIRECT_URI || "",
    baseUrl,
  };
}

export function checkOAuthEnv(): OAuthEnvCheck {
  const c = getOAuthConfig();
  const missing: string[] = [];
  if (!c.clientId) missing.push("PROCORE_CLIENT_ID");
  if (!c.clientSecret) missing.push("PROCORE_CLIENT_SECRET");
  if (!c.redirectUri) missing.push("PROCORE_OAUTH_REDIRECT_URI");
  if (!hasEncryptionKey()) missing.push("PROCORE_TOKEN_ENCRYPTION_KEY");
  return { ok: missing.length === 0, missing };
}

export function buildAuthorizeUrl(state: string): string {
  const c = getOAuthConfig();
  const u = new URL(c.baseUrl + "/oauth/authorize");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", c.clientId);
  u.searchParams.set("redirect_uri", c.redirectUri);
  u.searchParams.set("state", state);
  return u.toString();
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  created_at?: number;
};

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const c = getOAuthConfig();
  const res = await fetch(c.baseUrl + "/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Procore token endpoint ${res.status}: ${txt.slice(0, 300)}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const c = getOAuthConfig();
  return postToken({
    grant_type: "authorization_code",
    code,
    client_id: c.clientId,
    client_secret: c.clientSecret,
    redirect_uri: c.redirectUri,
  });
}

export async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  const c = getOAuthConfig();
  return postToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: c.clientId,
    client_secret: c.clientSecret,
  });
}

export async function fetchProcoreMe(
  accessToken: string,
  baseUrl: string,
): Promise<{ id?: number; email?: string; name?: string } | null> {
  try {
    const res = await fetch(baseUrl + "/rest/v1.0/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      id?: number;
      login?: string;
      email_address?: string;
      name?: string;
    };
    return {
      id: body.id,
      email: body.email_address ?? body.login ?? undefined,
      name: body.name,
    };
  } catch (e) {
    logger.warn({ err: e }, "Failed to fetch Procore /me");
    return null;
  }
}

export async function fetchFirstProcoreCompanyId(
  accessToken: string,
  baseUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(baseUrl + "/rest/v1.0/companies", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Array<{ id: number }>;
    if (!Array.isArray(body) || body.length === 0) return null;
    return String(body[0].id);
  } catch (e) {
    logger.warn({ err: e }, "Failed to list Procore companies");
    return null;
  }
}

export type StoredOAuthToken = {
  id: number;
  companyId: number | null;
  baseUrl: string;
  procoreCompanyId: string | null;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  procoreUserId: string | null;
  procoreUserName: string | null;
  procoreUserEmail: string | null;
  connectedByUserId: number | null;
  connectedAt: Date;
  lastRefreshedAt: Date | null;
};

function rowToToken(r: ProcoreOAuthToken): StoredOAuthToken {
  return {
    id: r.id,
    companyId: r.companyId,
    baseUrl: r.baseUrl,
    procoreCompanyId: r.procoreCompanyId,
    accessToken: decryptSecret(r.accessTokenEnc),
    refreshToken: decryptSecret(r.refreshTokenEnc),
    expiresAt: r.accessTokenExpiresAt,
    procoreUserId: r.procoreUserId,
    procoreUserName: r.procoreUserName,
    procoreUserEmail: r.procoreUserEmail,
    connectedByUserId: r.connectedByUserId,
    connectedAt: r.connectedAt,
    lastRefreshedAt: r.lastRefreshedAt,
  };
}

export async function saveTokens(opts: {
  companyId: number | null;
  tokens: TokenResponse;
  procoreUser: { id?: number; name?: string; email?: string } | null;
  procoreCompanyId: string | null;
  connectedByUserId: number;
}): Promise<StoredOAuthToken> {
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + (opts.tokens.expires_in || 7200) * 1000,
  );
  const baseUrl = getOAuthConfig().baseUrl;
  // One connection per local company at a time: clear any previous row
  // before inserting the new one. We don't put a unique index on companyId
  // because a NULL companyId (install-global) row should be allowed too.
  if (opts.companyId != null) {
    await db
      .delete(procoreOAuthTokens)
      .where(eq(procoreOAuthTokens.companyId, opts.companyId));
  }
  const [row] = await db
    .insert(procoreOAuthTokens)
    .values({
      companyId: opts.companyId,
      baseUrl,
      procoreCompanyId: opts.procoreCompanyId,
      accessTokenEnc: encryptSecret(opts.tokens.access_token),
      refreshTokenEnc: encryptSecret(opts.tokens.refresh_token),
      accessTokenExpiresAt: expiresAt,
      scope: opts.tokens.scope ?? null,
      procoreUserId:
        opts.procoreUser?.id != null ? String(opts.procoreUser.id) : null,
      procoreUserName: opts.procoreUser?.name ?? null,
      procoreUserEmail: opts.procoreUser?.email ?? null,
      connectedByUserId: opts.connectedByUserId,
      lastRefreshedAt: now,
    })
    .returning();
  return rowToToken(row);
}

/**
 * Look up the active OAuth token row.
 *
 * When `companyId` is provided, scope strictly to that local company's
 * connection (including the install-global NULL row as a fallback if no
 * company-specific row exists). When omitted, return the most recently
 * connected row across all companies — used only by user-less background
 * jobs that need any usable credential.
 */
export async function getActiveTokenRow(
  companyId?: number,
): Promise<ProcoreOAuthToken | null> {
  if (companyId != null) {
    const [scoped] = await db
      .select()
      .from(procoreOAuthTokens)
      .where(eq(procoreOAuthTokens.companyId, companyId))
      .orderBy(desc(procoreOAuthTokens.connectedAt))
      .limit(1);
    if (scoped) return scoped;
    // Fall back to install-global (companyId = NULL) row if present.
    const [global] = await db
      .select()
      .from(procoreOAuthTokens)
      .where(isNull(procoreOAuthTokens.companyId))
      .orderBy(desc(procoreOAuthTokens.connectedAt))
      .limit(1);
    return global ?? null;
  }
  const [row] = await db
    .select()
    .from(procoreOAuthTokens)
    .orderBy(desc(procoreOAuthTokens.connectedAt))
    .limit(1);
  return row ?? null;
}

/**
 * Return a usable OAuth token, refreshing it via the refresh_token grant
 * if it expires within the next 60s. Returns null when no row is stored.
 * Throws when refresh fails (e.g. refresh token revoked).
 *
 * `companyId` scopes the lookup as in `getActiveTokenRow`.
 */
export async function getActiveToken(
  companyId?: number,
): Promise<StoredOAuthToken | null> {
  const row = await getActiveTokenRow(companyId);
  if (!row) return null;
  let token = rowToToken(row);
  const skewMs = 60_000;
  if (token.expiresAt.getTime() - Date.now() < skewMs) {
    const refreshed = await refreshTokens(token.refreshToken);
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + (refreshed.expires_in || 7200) * 1000,
    );
    const [updated] = await db
      .update(procoreOAuthTokens)
      .set({
        accessTokenEnc: encryptSecret(refreshed.access_token),
        // Procore rotates refresh tokens on refresh; fall back to the
        // existing one if the response omits it.
        refreshTokenEnc: encryptSecret(
          refreshed.refresh_token || token.refreshToken,
        ),
        accessTokenExpiresAt: expiresAt,
        scope: refreshed.scope ?? row.scope,
        lastRefreshedAt: now,
      })
      .where(eq(procoreOAuthTokens.id, row.id))
      .returning();
    token = rowToToken(updated);
    logger.info(
      { procore: true, rowId: row.id },
      "Refreshed Procore OAuth access token",
    );
  }
  return token;
}

/**
 * Disconnect Procore for a specific local company (or install-global when
 * `companyId` is null). Only deletes rows owned by that company so admins
 * cannot accidentally revoke a sibling company's connection.
 */
export async function deleteTokensForCompany(
  companyId: number | null,
): Promise<number> {
  const where =
    companyId == null
      ? isNull(procoreOAuthTokens.companyId)
      : eq(procoreOAuthTokens.companyId, companyId);
  const deleted = await db
    .delete(procoreOAuthTokens)
    .where(where)
    .returning({ id: procoreOAuthTokens.id });
  return deleted.length;
}

export async function getConnectedByEmail(
  userId: number | null,
): Promise<string | null> {
  if (userId == null) return null;
  const [u] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return u?.email ?? null;
}
