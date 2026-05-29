import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cookieParser from "cookie-parser";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import path from "node:path";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import healthRouter from "./routes/health";
import { logger } from "./lib/logger";
import { refreshStageCache } from "./lib/stages";

// Populate the in-memory stage cache at boot so route handlers can use
// synchronous `.get()` lookups. Built-in stages are seeded if missing.
refreshStageCache().catch((err) => {
  logger.error({ err }, "Failed to initialise stage cache");
});

const isProduction = process.env.NODE_ENV === "production";

// Only the dev bypass and integration tests should escape rate limiting.
const skipRateLimit =
  process.env.NODE_ENV === "test" || process.env.API_TEST_AUTH === "1";

// Comma-separated allowlist of browser origins permitted to send credentialed
// (cookie-bearing) cross-origin requests, e.g.
// "https://app.example.com,https://admin.example.com". In production an empty
// list means only same-origin / non-browser requests are allowed.
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions: CorsOptions = {
  credentials: true,
  origin(origin, callback) {
    // Requests with no Origin header (same-origin, curl, server-to-server)
    // are always allowed.
    if (!origin) return callback(null, true);
    // Outside production we stay permissive for local dev convenience.
    if (!isProduction) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
};

const app: Express = express();

// Behind Replit's reverse proxy: trust the first hop so client IPs (used by
// the rate limiter) and secure-cookie handling resolve correctly.
app.set("trust proxy", 1);

if (isProduction && allowedOrigins.length === 0) {
  logger.warn(
    "CORS_ALLOWED_ORIGINS is empty in production; credentialed cross-origin " +
      "requests will be rejected. Set it to your frontend origin(s).",
  );
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Security response headers. The API serves JSON only (the SPA is deployed
// separately), so the restrictive cross-origin resource policy is safe.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
  }),
);

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health & readiness probes are mounted before auth and rate limiting so
// platform health checks never depend on Clerk being reachable and are never
// throttled.
app.use("/api", healthRouter);

// Optionally serve the built SPA from the same origin as the API. Off by
// default (Replit serves the client separately); enable with SERVE_CLIENT=1
// for single-service hosts like a Render preview. CLIENT_DIST overrides the
// path to the Vite build output. Mounted before auth/rate-limiting so static
// assets and deep links load without depending on Clerk.
if (process.env.SERVE_CLIENT === "1") {
  const clientDist = path.resolve(
    process.cwd(),
    process.env.CLIENT_DIST ?? "artifacts/milestones/dist/public",
  );
  const indexHtml = path.join(clientDist, "index.html");
  app.use(express.static(clientDist));
  // SPA fallback: serve index.html for any non-API GET so client-side routing
  // works on hard refresh / deep links. The regex excludes /api so those fall
  // through to the API router below.
  app.get(/^(?!\/api(?:\/|$)).*/, (_req: Request, res: Response) => {
    res.sendFile(indexHtml);
  });
  logger.info({ clientDist }, "Serving SPA from API origin (SERVE_CLIENT=1)");
}

// Coarse request rate limiting to blunt brute-force and abuse. Tune via
// RATE_LIMIT_WINDOW_MS / RATE_LIMIT_MAX. Disabled under tests/dev bypass.
app.use(
  rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60_000),
    limit: Number(process.env.RATE_LIMIT_MAX ?? 600),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => skipRateLimit,
  }),
);

// Clerk auth middleware. Only mounted when a secret key is configured so the
// app can also run in dev-auth mode (DEV_AUTH_ENABLED=1) with no Clerk account
// at all — requireAuth tolerates the missing middleware in that case.
if (process.env.CLERK_SECRET_KEY) {
  app.use(
    clerkMiddleware((req) => ({
      publishableKey: publishableKeyFromHost(
        getClerkProxyHost(req) ?? "",
        process.env.CLERK_PUBLISHABLE_KEY,
      ),
    })),
  );
}

app.use("/api", router);

// Final 404 for unmatched API routes.
app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Centralised error handler: log the full error server-side but never leak
// internals (stack traces, messages) to clients in production.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) return;
  const isCorsRejection =
    err instanceof Error &&
    err.message.startsWith("Origin not allowed by CORS");
  const status = isCorsRejection ? 403 : 500;
  req.log?.error?.({ err }, "Unhandled request error");
  const message = isCorsRejection
    ? "Origin not allowed"
    : isProduction
      ? "Internal server error"
      : err instanceof Error
        ? err.message
        : "Internal server error";
  res.status(status).json({ error: message });
});

export default app;
