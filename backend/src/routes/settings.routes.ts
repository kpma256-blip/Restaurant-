import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { invalidateSettingsCache } from "../lib/settingsCache";

export const settingsRouter = Router();

const SINGLETON_ID = "singleton";

async function getOrCreateSettings() {
  const existing = await prisma.settings.findUnique({ where: { id: SINGLETON_ID } });
  if (existing) return existing;
  return prisma.settings.create({ data: { id: SINGLETON_ID } });
}

settingsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await getOrCreateSettings());
  })
);

const updateSchema = z.object({
  restaurantName: z.string().min(1).optional(),
  address: z.string().nullable().optional(),
  timezone: z.string().optional(),
  currency: z.string().optional(),

  defaultInventoryUnitCode: z.string().optional(),
  lowStockNotify: z.boolean().optional(),
  varianceThresholdPct: z.number().min(0).max(100).optional(),
  countRequiresFullList: z.boolean().optional(),

  costMethod: z.enum(["WEIGHTED_AVERAGE", "LAST_COST"]).optional(),
  foodCostTargetPct: z.number().min(0).max(100).optional(),

  notifyLowStock: z.boolean().optional(),
  notifyHighVariance: z.boolean().optional(),
  notifyFailedToastSync: z.boolean().optional(),
  notifyUnmappedToast: z.boolean().optional(),
});

settingsRouter.patch(
  "/",
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    await getOrCreateSettings(); // ensures the row exists before update
    const updated = await prisma.settings.update({ where: { id: SINGLETON_ID }, data });
    invalidateSettingsCache();
    res.json(updated);
  })
);
