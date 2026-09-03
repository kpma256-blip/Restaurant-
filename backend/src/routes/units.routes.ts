import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";

export const unitsRouter = Router();

unitsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { active } = req.query;
    const units = await prisma.unit.findMany({
      where: active === "true" ? { isActive: true } : undefined,
      orderBy: [{ dimension: "asc" }, { name: "asc" }],
    });
    res.json(units);
  })
);

const createSchema = z.object({
  code: z.string().min(1).max(20).regex(/^[a-z0-9]+$/, "Code must be lowercase alphanumeric"),
  name: z.string().min(1).max(100),
  dimension: z.enum(["WEIGHT", "VOLUME", "COUNT"]),
  toBaseFactor: z.number().positive(),
});

unitsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    // Check if code already exists
    const existing = await prisma.unit.findUnique({ where: { code: data.code } });
    if (existing) {
      res.status(400).json({ error: `Unit code "${data.code}" already exists` });
      return;
    }
    const unit = await prisma.unit.create({
      data: { ...data, isCustom: true, isActive: true },
    });
    res.status(201).json(unit);
  })
);

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

unitsRouter.patch(
  "/:code",
  asyncHandler(async (req, res) => {
    const { code } = req.params;
    const data = updateSchema.parse(req.body);
    const unit = await prisma.unit.update({ where: { code }, data });
    res.json(unit);
  })
);
