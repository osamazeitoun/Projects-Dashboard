import { Router, type IRouter } from "express";
import healthRouter from "./health";
import milestonesRouter from "./milestones";
import pmRouter from "./pm";

const router: IRouter = Router();

router.use(healthRouter);
router.use(milestonesRouter);
router.use(pmRouter);

export default router;
