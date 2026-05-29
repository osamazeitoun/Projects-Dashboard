# Projects-Dashboard

A construction project-management dashboard. Contractors, project managers, and
clients each get a role-scoped view of project milestones, schedule baselines,
and change events, with data kept in sync from Procore.

- **Stack:** pnpm workspaces · Node 24 · TypeScript 5.9 · Express 5 · React 19 +
  Vite · PostgreSQL + Drizzle ORM · Clerk (auth) · Zod (`zod/v4`) · Orval (API
  codegen from OpenAPI).
- **Operational docs, env vars, and the pre-deploy checklist:** see
  [`replit.md`](./replit.md).

## Quick start

```sh
pnpm install
pnpm --filter @workspace/db run push        # apply schema to your DATABASE_URL
pnpm --filter @workspace/api-server run dev  # API on $PORT
```

Required env to boot: `DATABASE_URL`, `PORT`. For real auth also set
`CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY`; for local development without
Clerk, set `DEV_AUTH_ENABLED=1` and `VITE_DEV_AUTH=1` (both are ignored in
production — see `replit.md`).

## Common commands

- `pnpm run typecheck` — typecheck every package
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-server run test` — API tests (needs `DATABASE_URL`)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks + Zod
  schemas from the OpenAPI spec
