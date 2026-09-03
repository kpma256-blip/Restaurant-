import { Router } from "express";
import { allUnits } from "../lib/units";
import { asyncHandler } from "../middleware/errorHandler";

export const unitsRouter = Router();

unitsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await allUnits());
  })
);
