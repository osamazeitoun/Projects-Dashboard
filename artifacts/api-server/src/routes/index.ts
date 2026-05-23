import { Router, type IRouter } from "express";
import healthRouter from "./health";
import milestonesRouter from "./milestones";

const router: IRouter = Router();

router.use(healthRouter);
router.use(milestonesRouter);

export default router;
