import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { HealthCheckResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Liveness: the process is up and serving. Cheap, no dependencies.
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Readiness: the process can reach its dependencies (Postgres). Returns 503
// while the DB is unreachable so the platform stops routing traffic to an
// instance that can't serve requests.
router.get("/readyz", async (_req, res) => {
  try {
    await db.execute(sql`select 1`);
    res.json({ status: "ok", db: "up" });
  } catch (err) {
    logger.error({ err }, "Readiness check failed: database unreachable");
    res.status(503).json({ status: "unavailable", db: "down" });
  }
});

export default router;
