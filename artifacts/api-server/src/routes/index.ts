import { Router, type IRouter } from "express";
import healthRouter from "./health";
import leadsRouter from "./leads";
import scriptsRouter from "./scripts";
import campaignsRouter from "./campaigns";
import callsRouter from "./calls";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(leadsRouter);
router.use(scriptsRouter);
router.use(campaignsRouter);
router.use(callsRouter);
router.use(dashboardRouter);

export default router;
