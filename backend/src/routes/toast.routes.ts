import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, BadRequestError } from "../middleware/errorHandler";
import {
  getToastStatus,
  connectToast,
  disconnectToast,
  runOrderSync,
} from "../integrations/toast/syncService";
import {
  listUnmappedToastItems,
  listAllMappings,
  mapToastItem,
  ignoreToastItem,
  mapToastModifier,
  syncToastMenu,
} from "../integrations/toast/mappingService";

export const toastRouter = Router();

toastRouter.get(
  "/status",
  asyncHandler(async (_req, res) => {
    res.json(await getToastStatus());
  })
);

const connectSchema = z.object({
  environment: z.enum(["sandbox", "production"]).default("sandbox"),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  restaurantGuid: z.string().min(1),
});

toastRouter.post(
  "/connect",
  asyncHandler(async (req, res) => {
    const body = connectSchema.parse(req.body);
    const result = await connectToast(body);
    if (!result.connected) return res.status(400).json({ error: result.error });
    res.json(await getToastStatus());
  })
);

toastRouter.post(
  "/disconnect",
  asyncHandler(async (_req, res) => {
    await disconnectToast();
    res.json(await getToastStatus());
  })
);

const autoSyncSchema = z.object({
  autoSyncEnabled: z.boolean().optional(),
  autoSyncIntervalMinutes: z.number().min(5).max(1440).optional(),
});

toastRouter.patch(
  "/settings",
  asyncHandler(async (req, res) => {
    const body = autoSyncSchema.parse(req.body);
    const connection = await prisma.toastConnection.findFirst({ orderBy: { createdAt: "desc" } });
    if (!connection) throw new BadRequestError("Connect Toast before changing sync settings");
    await prisma.toastConnection.update({ where: { id: connection.id }, data: body });
    res.json(await getToastStatus());
  })
);

const syncNowSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

toastRouter.post(
  "/sync",
  asyncHandler(async (req, res) => {
    const body = syncNowSchema.parse(req.body ?? {});
    const endDate = body.endDate ?? new Date();
    const startDate = body.startDate ?? new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    const result = await runOrderSync({ trigger: "MANUAL", startDate, endDate });
    res.json(result);
  })
);

const historicalImportSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  confirm: z.literal(true),
});

// Historical sales import — requires an explicit `confirm: true` so the
// frontend must show a confirmation step before applying historical sales
// to inventory (per the required workflow: select a range, confirm, then
// import). Idempotent like any other sync — safe to re-run.
toastRouter.post(
  "/import-historical",
  asyncHandler(async (req, res) => {
    const body = historicalImportSchema.parse(req.body);
    const result = await runOrderSync({ trigger: "HISTORICAL", startDate: body.startDate, endDate: body.endDate });
    res.json(result);
  })
);

toastRouter.get(
  "/sync-logs",
  asyncHandler(async (_req, res) => {
    const logs = await prisma.toastSyncLog.findMany({ orderBy: { startedAt: "desc" }, take: 50 });
    res.json(
      logs.map((l) => ({
        ...l,
        errors: l.errorLog ? JSON.parse(l.errorLog) : [],
      }))
    );
  })
);

toastRouter.get(
  "/menu-items",
  asyncHandler(async (_req, res) => {
    res.json(await listAllMappings());
  })
);

toastRouter.get(
  "/unmapped",
  asyncHandler(async (_req, res) => {
    res.json(await listUnmappedToastItems());
  })
);

toastRouter.post(
  "/refresh-menu",
  asyncHandler(async (_req, res) => {
    res.json(await syncToastMenu());
  })
);

const mapItemSchema = z.object({ internalMenuItemId: z.string().min(1) });

toastRouter.post(
  "/menu-items/:toastGuid/map",
  asyncHandler(async (req, res) => {
    const body = mapItemSchema.parse(req.body);
    res.json(await mapToastItem(req.params.toastGuid, body.internalMenuItemId));
  })
);

toastRouter.post(
  "/menu-items/:toastGuid/ignore",
  asyncHandler(async (req, res) => {
    res.json(await ignoreToastItem(req.params.toastGuid));
  })
);

const mapModifierSchema = z.object({
  toastModifierName: z.string().min(1),
  internalModifierId: z.string().min(1),
});

toastRouter.post(
  "/modifiers/:toastModifierGuid/map",
  asyncHandler(async (req, res) => {
    const body = mapModifierSchema.parse(req.body);
    res.json(await mapToastModifier(req.params.toastModifierGuid, body.toastModifierName, body.internalModifierId));
  })
);
