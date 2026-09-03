import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { recordSale } from "../services/sales.service";

export const salesRouter = Router();

salesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { from, to, source } = req.query as Record<string, string | undefined>;
    const sales = await prisma.sale.findMany({
      where: {
        ...(source ? { source } : {}),
        ...(from || to ? { saleDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
      },
      include: { items: true },
      orderBy: { saleDate: "desc" },
      take: 500,
    });
    res.json(sales);
  })
);

const saleItemSchema = z.object({
  menuItemId: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0).optional(),
  modifiers: z.array(z.object({ name: z.string(), toastModifierGuid: z.string().optional() })).optional(),
});

const recordSaleSchema = z.object({
  saleDate: z.coerce.date().default(() => new Date()),
  checkNumber: z.string().optional(),
  note: z.string().optional(),
  items: z.array(saleItemSchema).min(1),
});

salesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = recordSaleSchema.parse(req.body);
    const sale = await recordSale({ ...body, source: "MANUAL", userId: req.userId ?? null });
    res.status(201).json(sale);
  })
);
