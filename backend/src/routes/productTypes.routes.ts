import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";

export const productTypesRouter = Router();

productTypesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const productTypes = await prisma.productType.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    });
    res.json(productTypes);
  })
);

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
});

productTypesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const productType = await prisma.productType.create({ data });
    res.status(201).json(productType);
  })
);

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

productTypesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = updateSchema.parse(req.body);
    const productType = await prisma.productType.update({ where: { id }, data });
    res.json(productType);
  })
);

productTypesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    // Check if any products use this type
    const count = await prisma.product.count({ where: { productTypeId: id } });
    if (count > 0) {
      res.status(400).json({ error: "Cannot delete product type that is in use by products. Deactivate instead." });
      return;
    }
    await prisma.productType.delete({ where: { id } });
    res.status(204).send();
  })
);
