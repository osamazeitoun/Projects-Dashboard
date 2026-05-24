import { Router, type IRouter } from "express";
import healthRouter from "./health";
import milestonesRouter from "./milestones";
import pmRouter from "./pm";
import adminRouter from "./admin";
import clientRouter from "./client";

const router: IRouter = Router();

router.use(healthRouter);
router.use(milestonesRouter);
router.use(pmRouter);
router.use(adminRouter);
router.use(clientRouter);

export default router;
