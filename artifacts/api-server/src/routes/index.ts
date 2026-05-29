import { Router, type IRouter } from "express";
import milestonesRouter from "./milestones";
import pmRouter from "./pm";
import adminRouter from "./admin";
import clientRouter from "./client";

// NOTE: the health/readiness router is mounted earlier in app.ts (before auth
// and rate limiting) so probes never depend on Clerk and are never throttled.
const router: IRouter = Router();

router.use(milestonesRouter);
router.use(pmRouter);
router.use(adminRouter);
router.use(clientRouter);

export default router;
