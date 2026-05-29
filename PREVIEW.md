# Reviewing changes before pulling into Replit

Replit stays your runtime. This doc sets up a way to **review the code and a live
preview of a branch before you pull it into Replit**, so you only pull once
you're happy.

There are two independent pieces: **code review** (GitHub PR) and a **running
preview** (a Render deployment that mirrors Replit).

---

## 1. Code review — GitHub Pull Request

Each change is pushed to a branch and opened as a PR. Review the full diff and
comment at `github.com/osamazeitoun/projects-dashboard/pulls` — no Replit pull
needed. Claude can also watch the PR to auto-fix CI failures and review comments.

---

## 2. Live preview — Render (auto-deploys the branch)

The repo includes [`render.yaml`](./render.yaml): a single web service that
builds and serves **both** the Express API and the Vite SPA on one origin,
backed by a managed Postgres. Every push to the tracked branch redeploys and
gives you a URL like `https://milestones-preview.onrender.com`.

Why Render and not an in-session preview: Claude Code on the web runs in a
sandbox with **no inbound networking**, so a preview URL has to come from a host.
Render's free tier mirrors the Replit stack (Node + Postgres) closely.

### One-time setup

1. Push the branch to GitHub (already done by Claude).
2. At [dashboard.render.com](https://dashboard.render.com): **New → Blueprint**,
   select this repo, choose the branch. Render reads `render.yaml`.
3. Set the secret env vars (marked `sync: false`) — see the two auth options
   below.
4. **Apply / Deploy.** First build runs schema push + demo seed. After that,
   every `git push` to the branch auto-deploys.

### Auth: two options

**Option A — Real Clerk (recommended; a free dev instance is enough)**
Create an app at [dashboard.clerk.com](https://dashboard.clerk.com) and set, in
the Render dashboard:

| Var | Value |
|-----|-------|
| `CLERK_SECRET_KEY` | `sk_test_…` |
| `CLERK_PUBLISHABLE_KEY` | `pk_test_…` |
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_test_…` (same key; inlined into the build) |
| `INITIAL_ADMIN_EMAIL` | your email — the first login with it becomes admin |

**Option B — Dev-auth bypass (no Clerk account at all)**
In the Render dashboard set `NODE_ENV=development`, `DEV_AUTH_ENABLED=1`,
`VITE_DEV_AUTH=1`, and leave the Clerk keys blank. You're dropped straight into
the app as a dev admin. (The bypass is force-disabled when
`NODE_ENV=production`, by design — see `replit.md`.)

### Notes
- The build runs `pnpm --filter @workspace/scripts run seed`, so each deploy
  resets to a clean demo dataset. Remove that line from `render.yaml` if you
  want preview data to persist.
- Render's free Postgres and free web service sleep when idle and have monthly
  limits — fine for previews, not production.
- `PROCORE_DEMO_MODE=1` keeps Procore in demo mode (no real OAuth needed).

---

## 3. (Optional) Run it locally instead

The app is no longer hard-wired to Replit — `PORT`/`BASE_PATH` now default when
unset. To run locally:

```sh
cp .env.example .env          # fill in DATABASE_URL + an auth option
pnpm install
pnpm --filter @workspace/db run push
pnpm --filter @workspace/scripts run seed
pnpm --filter @workspace/api-server run dev   # API on $PORT (8080)
pnpm --filter @workspace/milestones run dev   # Vite dev server, proxies /api
```

You can pull this cloud session to your machine with `claude --teleport` and run
the above, previewing at the Vite dev URL.
