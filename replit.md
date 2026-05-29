# Projects-Dashboard

A construction project-management dashboard: contractors, project managers, and
clients each get a role-scoped view of project milestones, schedule baselines,
and change events, with data synced from Procore.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — build + run the API server (listens on `$PORT`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run test` — API unit/integration tests (needs `DATABASE_URL`)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (helmet, CORS allowlist, rate limiting, Clerk auth)
- Frontend: React 19 + Vite (deployed separately from the API)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (ESM bundle via `artifacts/api-server/build.mjs`)

## Where things live

- `artifacts/api-server/` — Express API.
  - `src/app.ts` — middleware stack (security headers, CORS, rate limit, health probes, Clerk, error handler).
  - `src/index.ts` — server bootstrap + background Procore re-sync loop.
  - `src/middlewares/auth.ts` — `requireAuth`, JIT user provisioning, workspace/role resolution, dev-auth bypass.
  - `src/middlewares/permissions.ts` — role/project-company access checks (source of truth for "who can do what").
  - `src/routes/` — `admin`, `pm`, `client`, `milestones`, `health` route groups.
  - `src/services/` — Procore client, OAuth, sync, and notifications.
- `artifacts/milestones/` — React + Vite frontend (pages under `src/pages/{admin,pm,client}`).
- `lib/db/` — Drizzle schema + client. **DB schema source of truth:** `lib/db/src/schema/`.
- `lib/api-spec/openapi.yaml` — **API contract source of truth.** `lib/api-zod` and `lib/api-client-react` are generated from it via Orval.
- `scripts/` — operational scripts (`seed.ts`, `post-merge.sh`).

## Architecture decisions

- **Access is assignment-driven.** A plain `user_companies.role='member'` grants no
  project scope on its own; an explicit `project_assignments` row (or company-admin
  membership on a participating company) is required. See `getProjectCompanyIdsForUser`.
- **Workspaces = (company, project) pairs.** The active workspace is held in the
  `active_workspace` cookie and re-validated on every request in `requireAuth`.
- **Bootstrap admin via env.** The first login matching `INITIAL_ADMIN_EMAIL` is
  auto-linked to `DEFAULT_COMPANY_IDS` and promoted to admin; everyone else starts
  with no access until an admin invites them.
- **Procore tokens are encrypted at rest** (`PROCORE_TOKEN_ENCRYPTION_KEY`); access
  tokens are refreshed transparently and a background loop re-syncs linked projects.
- **Health probes bypass auth.** `/api/healthz` (liveness) and `/api/readyz`
  (readiness, pings the DB) are mounted before Clerk and the rate limiter.

## Environment variables

**Required**

- `DATABASE_URL` — Postgres connection string.
- `PORT` — port to listen on (the process throws if unset).
- `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` — required for real authentication.

**Security / production hardening**

- `NODE_ENV` — set to `production` in deploys. The `start` script defaults it to
  `production` when unset. Controls log format and the dev-auth fail-safe.
- `CORS_ALLOWED_ORIGINS` — comma-separated browser origins allowed to send
  credentialed cross-origin requests (e.g. `https://app.example.com`). **In
  production an empty list rejects all cross-origin browser requests** — set this
  to your frontend origin(s).
- `RATE_LIMIT_WINDOW_MS` (default `900000`), `RATE_LIMIT_MAX` (default `600`) —
  request rate-limit window and cap.
- `DEV_AUTH_ENABLED` / `VITE_DEV_AUTH` — dev-only auth bypass (grants admin on every
  company without Clerk). **Ignored when `NODE_ENV=production`**; leaving them on in
  a deploy is a no-op and logs an error.

**Bootstrap / access**

- `INITIAL_ADMIN_EMAIL` — email auto-promoted to admin on first login.
- `DEFAULT_COMPANY_IDS` — companies the bootstrap admin is linked to (default `2,3,4`).

**Procore integration**

- `PROCORE_CLIENT_ID`, `PROCORE_CLIENT_SECRET`, `PROCORE_OAUTH_REDIRECT_URI`,
  `PROCORE_TOKEN_ENCRYPTION_KEY` — required for the OAuth flow.
  `PROCORE_OAUTH_REDIRECT_URI` must exactly match the Procore app config and point
  at the **deployed** host's `/api/admin/procore/oauth/callback`.
- `PROCORE_BASE_URL` (sandbox vs prod), `PROCORE_ACCESS_TOKEN` (legacy fallback),
  `PROCORE_DEMO_MODE`, `PROCORE_RESYNC_INTERVAL_MINUTES`,
  `PROCORE_OAUTH_SUCCESS_REDIRECT`, `APP_BASE_URL`.

**Notifications (optional):** `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
`SMTP_PASS`, `SMTP_FROM`.

## Pre-deploy checklist

1. `NODE_ENV=production` (default in `start`); confirm `DEV_AUTH_ENABLED` /
   `VITE_DEV_AUTH` are unset or known to be ignored.
2. `CLERK_SECRET_KEY` + `CLERK_PUBLISHABLE_KEY` set.
3. `CORS_ALLOWED_ORIGINS` set to the production frontend origin(s).
4. `PROCORE_OAUTH_REDIRECT_URI` updated from the `*.replit.dev` dev URL to the
   production host, and matched in the Procore app config.
5. `DATABASE_URL` points at the production DB and schema is pushed/migrated.
6. `pnpm run build` is green.

## Gotchas

- The frontend is deployed **separately** from the API, so cross-origin CORS rules
  apply — `CORS_ALLOWED_ORIGINS` must be correct or the SPA can't call the API.
- Integration tests under `artifacts/api-server` require a reachable `DATABASE_URL`;
  the pure-logic `permissions.test.ts` does not.
- Regenerate codegen (`@workspace/api-spec run codegen`) after editing
  `lib/api-spec/openapi.yaml`; never hand-edit files under `*/generated/`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
