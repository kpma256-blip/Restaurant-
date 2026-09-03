import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, BadRequestError, NotFoundError } from "../middleware/errorHandler";
import { applyInventoryTransaction, getLedgerBalance } from "../services/inventoryLedger.service";
import { createReceiving } from "../services/inventory-receiving/inventoryReceiving.service";
import { WASTE_REASONS } from "../lib/constants";

export const inventoryRouter = Router();

// ---------------------------------------------------------------------------
// Receiving
// ---------------------------------------------------------------------------

const receiveSchema = z.object({
  purchaseDate: z.coerce.date().default(() => new Date()),
  supplierId: z.string().optional(),
  invoiceNumber: z.string().optional(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().positive(),
        unitCode: z.string().min(1),
        unitCost: z.number().min(0).optional(),
      })
    )
    .min(1),
});

// Kept for backward compatibility (existing callers/tests) — delegates to
// the same inventory-receiving service that powers the newer /api/receiving
// endpoints (see routes/receiving.routes.ts), so there's exactly one code
// path that actually creates a Purchase + ledger transactions.
inventoryRouter.post(
  "/receive",
  asyncHandler(async (req, res) => {
    const body = receiveSchema.parse(req.body);
    const result = await createReceiving({
      purchaseDate: body.purchaseDate,
      supplierId: body.supplierId ?? null,
      invoiceNumber: body.invoiceNumber ?? null,
      notes: body.notes ?? null,
      sourceType: "MANUAL",
      items: body.items,
      userId: req.userId ?? null,
    });
    res.status(201).json(result);
  })
);

inventoryRouter.get(
  "/purchases",
  asyncHandler(async (req, res) => {
    const { from, to } = req.query as Record<string, string | undefined>;
    const purchases = await prisma.purchase.findMany({
      where: {
        ...(from || to
          ? { purchaseDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
      },
      include: { items: { include: { product: true } }, supplier: true },
      orderBy: { purchaseDate: "desc" },
    });
    res.json(purchases);
  })
);

// ---------------------------------------------------------------------------
// Waste
// ---------------------------------------------------------------------------

const wasteSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().positive(),
  unitCode: z.string().min(1),
  reason: z.enum(WASTE_REASONS),
  wasteDate: z.coerce.date().default(() => new Date()),
  notes: z.string().optional(),
});

inventoryRouter.post(
  "/waste",
  asyncHandler(async (req, res) => {
    const body = wasteSchema.parse(req.body);

    const result = await prisma.$transaction(async (tx) => {
      const waste = await tx.wasteRecord.create({
        data: {
          productId: body.productId,
          quantity: body.quantity,
          unitCode: body.unitCode,
          reason: body.reason,
          wasteDate: body.wasteDate,
          notes: body.notes,
          userId: req.userId ?? null,
        },
      });

      await applyInventoryTransaction(
        {
          productId: body.productId,
          type: "WASTE",
          quantity: -body.quantity,
          unitCode: body.unitCode,
          reason: body.reason,
          notes: body.notes,
          referenceType: "WASTE",
          referenceId: waste.id,
          userId: req.userId ?? null,
          occurredAt: body.wasteDate,
        },
        tx
      );

      return waste;
    });

    res.status(201).json(result);
  })
);

inventoryRouter.get(
  "/waste",
  asyncHandler(async (req, res) => {
    const { from, to, productId } = req.query as Record<string, string | undefined>;
    const records = await prisma.wasteRecord.findMany({
      where: {
        ...(productId ? { productId } : {}),
        ...(from || to
          ? { wasteDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
      },
      include: { product: true, user: true },
      orderBy: { wasteDate: "desc" },
    });
    res.json(records);
  })
);

// ---------------------------------------------------------------------------
// Adjustments (quick add/remove without receiving or waste workflow)
// ---------------------------------------------------------------------------

const adjustSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number(), // can be positive or negative
  unitCode: z.string().min(1),
  reason: z.string().optional(),
  adjustedAt: z.coerce.date().default(() => new Date()),
});

inventoryRouter.post(
  "/adjust",
  asyncHandler(async (req, res) => {
    const body = adjustSchema.parse(req.body);

    const product = await prisma.product.findUnique({ where: { id: body.productId } });
    if (!product) throw new NotFoundError("Product not found");

    const result = await applyInventoryTransaction(
      {
        productId: body.productId,
        type: "ADJUSTMENT",
        quantity: body.quantity,
        unitCode: body.unitCode,
        reason: body.reason || null,
        referenceType: "ADJUSTMENT",
        referenceId: null,
        userId: req.userId ?? null,
        occurredAt: body.adjustedAt,
      }
    );

    res.status(201).json(result);
  })
);

// ---------------------------------------------------------------------------
// Physical inventory counts
// ---------------------------------------------------------------------------

inventoryRouter.get(
  "/counts",
  asyncHandler(async (_req, res) => {
    const counts = await prisma.inventoryCount.findMany({
      include: { items: true, countedByUser: true },
      orderBy: { countDate: "desc" },
    });
    res.json(counts);
  })
);

inventoryRouter.get(
  "/counts/:id",
  asyncHandler(async (req, res) => {
    const count = await prisma.inventoryCount.findUnique({
      where: { id: req.params.id },
      include: { items: { include: { product: true, unit: true } }, countedByUser: true },
    });
    if (!count) throw new NotFoundError("Count not found");
    res.json(count);
  })
);

const createCountSchema = z.object({
  countDate: z.coerce.date().default(() => new Date()),
  notes: z.string().optional(),
  productIds: z.array(z.string()).optional(), // omit = count every active product
});

inventoryRouter.post(
  "/counts",
  asyncHandler(async (req, res) => {
    const body = createCountSchema.parse(req.body);
    const products = await prisma.product.findMany({
      where: { isActive: true, ...(body.productIds ? { id: { in: body.productIds } } : {}) },
    });

    const count = await prisma.$transaction(async (tx) => {
      const created = await tx.inventoryCount.create({
        data: {
          countDate: body.countDate,
          notes: body.notes,
          countedByUserId: req.userId ?? null,
          status: "OPEN",
        },
      });

      for (const product of products) {
        const theoretical = await getLedgerBalance(product.id, body.countDate);
        await tx.inventoryCountItem.create({
          data: {
            countId: created.id,
            productId: product.id,
            theoreticalQuantity: theoretical,
            unitCode: product.inventoryUnitCode,
          },
        });
      }

      return tx.inventoryCount.findUniqueOrThrow({ where: { id: created.id }, include: { items: { include: { product: true } } } });
    });

    res.status(201).json(count);
  })
);

const setPhysicalSchema = z.object({ physicalQuantity: z.number() });

inventoryRouter.patch(
  "/counts/:countId/items/:itemId",
  asyncHandler(async (req, res) => {
    const body = setPhysicalSchema.parse(req.body);
    const item = await prisma.inventoryCountItem.findUnique({ where: { id: req.params.itemId } });
    if (!item || item.countId !== req.params.countId) throw new NotFoundError("Count item not found");

    const varianceQty = body.physicalQuantity - item.theoreticalQuantity;
    const variancePct =
      item.theoreticalQuantity !== 0 ? (varianceQty / item.theoreticalQuantity) * 100 : varianceQty !== 0 ? 100 : 0;

    const updated = await prisma.inventoryCountItem.update({
      where: { id: item.id },
      data: { physicalQuantity: body.physicalQuantity, varianceQty, variancePct },
    });
    res.json(updated);
  })
);

inventoryRouter.post(
  "/counts/:id/complete",
  asyncHandler(async (req, res) => {
    const count = await prisma.inventoryCount.findUnique({ where: { id: req.params.id }, include: { items: true } });
    if (!count) throw new NotFoundError("Count not found");
    if (count.status === "COMPLETED") throw new BadRequestError("Count already completed");

    const uncounted = count.items.filter((i) => i.physicalQuantity == null);
    if (uncounted.length > 0 && req.query.allowPartial !== "true") {
      throw new BadRequestError(
        `${uncounted.length} item(s) have no physical count entered yet. Enter a value for every item, or resubmit with ?allowPartial=true to skip them.`
      );
    }

    await prisma.$transaction(async (tx) => {
      for (const item of count.items) {
        if (item.physicalQuantity == null) continue;
        const varianceQty = item.physicalQuantity - item.theoreticalQuantity;
        if (Math.abs(varianceQty) > 1e-9) {
          await applyInventoryTransaction(
            {
              productId: item.productId,
              type: "PHYSICAL_COUNT",
              quantity: varianceQty,
              unitCode: item.unitCode,
              reason: "Physical count",
              notes: `Count adjustment: theoretical ${item.theoreticalQuantity.toFixed(3)} -> physical ${item.physicalQuantity.toFixed(3)}`,
              referenceType: "COUNT",
              referenceId: count.id,
              userId: req.userId ?? null,
              occurredAt: count.countDate,
            },
            tx
          );
        }
      }
      await tx.inventoryCount.update({ where: { id: count.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    });

    const fresh = await prisma.inventoryCount.findUniqueOrThrow({
      where: { id: count.id },
      include: { items: { include: { product: true } } },
    });
    res.json(fresh);
  })
);
