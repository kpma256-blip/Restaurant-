import { Router } from "express";
import { getAlerts } from "../services/alerts.service";
import { asyncHandler } from "../middleware/errorHandler";

export const alertsRouter = Router();

alertsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await getAlerts());
  })
);
