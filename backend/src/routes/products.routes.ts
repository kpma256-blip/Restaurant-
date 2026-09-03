import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, NotFoundError } from "../middleware/errorHandler";
import { reconcileProduct } from "../services/inventoryLedger.service";
import { effectiveUnitCost } from "../services/costing.service";

export const productsRouter = Router();

export type StockStatus = "green" | "yellow" | "red";

export function stockStatus(p: { currentQuantity: number; parLevel: number; reorderLevel: number }): StockStatus {
  if (p.currentQuantity <= 0 || (p.reorderLevel > 0 && p.currentQuantity <= p.reorderLevel)) return "red";
  if (p.parLevel > 0 && p.currentQuantity < p.parLevel) return "yellow";
  return "green";
}

productsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { categoryId, status, search, includeInactive } = req.query as Record<string, string | undefined>;
    const products = await prisma.product.findMany({
      where: {
        ...(includeInactive === "true" ? {} : { isActive: true }),
        ...(categoryId ? { categoryId } : {}),
        ...(search ? { name: { contains: search } } : {}),
      },
      include: { category: true, inventoryUnit: true, supplier: true },
      orderBy: { name: "asc" },
    });

    const enriched = products.map((p) => ({
      ...p,
      status: stockStatus(p),
      effectiveUnitCost: effectiveUnitCost(p),
      inventoryValue: p.currentQuantity * effectiveUnitCost(p),
    }));

    const filtered = status ? enriched.filter((p) => p.status === status) : enriched;
    res.json(filtered);
  })
);

productsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { category: true, inventoryUnit: true, costUnit: true, supplier: true },
    });
    if (!product) throw new NotFoundError("Product not found");
    res.json({ ...product, status: stockStatus(product), effectiveUnitCost: effectiveUnitCost(product) });
  })
);

productsRouter.get(
  "/:id/history",
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit ?? 100);
    const transactions = await prisma.inventoryTransaction.findMany({
      where: { productId: req.params.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { user: true, unit: true },
    });
    res.json(transactions);
  })
);

productsRouter.post(
  "/:id/reconcile",
  asyncHandler(async (req, res) => {
    res.json(await reconcileProduct(req.params.id));
  })
);

const createSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  categoryId: z.string().min(1),
  inventoryUnitCode: z.string().min(1),
  costUnitCode: z.string().optional(),
  caseSize: z.number().positive().optional(),
  parLevel: z.number().min(0).default(0),
  reorderLevel: z.number().min(0).default(0),
  supplierId: z.string().optional(),
  // Optional starting balance — recorded as an ADJUSTMENT ledger entry, never
  // written directly to currentQuantity, to keep the ledger authoritative
  // from the moment a product is created.
  beginningQuantity: z.number().optional(),
  beginningCost: z.number().optional(),
});

productsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const { beginningQuantity, beginningCost, ...data } = body;

    const product = await prisma.product.create({
      data: { ...data, costUnitCode: data.costUnitCode ?? data.inventoryUnitCode },
    });

    if (beginningQuantity && beginningQuantity !== 0) {
      const { applyInventoryTransaction } = await import("../services/inventoryLedger.service");
      await applyInventoryTransaction({
        productId: product.id,
        type: "ADJUSTMENT",
        quantity: beginningQuantity,
        unitCode: product.inventoryUnitCode,
        unitCost: beginningCost ?? null,
        reason: "Correction",
        notes: "Beginning inventory balance",
        referenceType: "MANUAL",
        userId: req.userId ?? null,
      });
    }

    const fresh = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    res.status(201).json(fresh);
  })
);

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  sku: z.string().optional(),
  categoryId: z.string().optional(),
  caseSize: z.number().positive().nullable().optional(),
  parLevel: z.number().min(0).optional(),
  reorderLevel: z.number().min(0).optional(),
  supplierId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

productsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const product = await prisma.product.update({ where: { id: req.params.id }, data });
    res.json(product);
  })
);
