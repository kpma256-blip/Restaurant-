import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, NotFoundError } from "../middleware/errorHandler";
import { calculateMenuItemCost, calculateAllMenuItemCosts } from "../services/costing.service";

export const menuItemsRouter = Router();

menuItemsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const menuItems = await prisma.menuItem.findMany({
      where: req.query.includeInactive === "true" ? {} : { isActive: true },
      include: {
        recipe: { include: { ingredients: { include: { product: true, unit: true } } } },
        modifiers: { include: { ingredients: { include: { product: true, unit: true } } } },
        toastMapping: true,
      },
      orderBy: { name: "asc" },
    });
    res.json(menuItems);
  })
);

menuItemsRouter.get(
  "/costs",
  asyncHandler(async (_req, res) => {
    res.json(await calculateAllMenuItemCosts());
  })
);

menuItemsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const menuItem = await prisma.menuItem.findUnique({
      where: { id: req.params.id },
      include: {
        recipe: { include: { ingredients: { include: { product: true, unit: true } } } },
        modifiers: { include: { ingredients: { include: { product: true, unit: true } } } },
        toastMapping: true,
      },
    });
    if (!menuItem) throw new NotFoundError("Menu item not found");
    const cost = await calculateMenuItemCost(menuItem.id);
    res.json({ ...menuItem, cost });
  })
);

const ingredientSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().positive(),
  unitCode: z.string().min(1),
});

const modifierSchema = z.object({
  name: z.string().min(1),
  ingredients: z.array(ingredientSchema).default([]),
});

const createMenuItemSchema = z.object({
  name: z.string().min(1),
  sellingPrice: z.number().positive(),
  categoryLabel: z.string().optional(),
  ingredients: z.array(ingredientSchema).default([]),
  modifiers: z.array(modifierSchema).default([]),
});

menuItemsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createMenuItemSchema.parse(req.body);

    const menuItem = await prisma.$transaction(async (tx) => {
      const created = await tx.menuItem.create({
        data: { name: body.name, sellingPrice: body.sellingPrice, categoryLabel: body.categoryLabel },
      });

      if (body.ingredients.length > 0) {
        await tx.recipe.create({
          data: {
            menuItemId: created.id,
            ingredients: { create: body.ingredients },
          },
        });
      }

      for (const mod of body.modifiers) {
        await tx.modifier.create({
          data: {
            menuItemId: created.id,
            name: mod.name,
            ingredients: { create: mod.ingredients },
          },
        });
      }

      return tx.menuItem.findUniqueOrThrow({
        where: { id: created.id },
        include: { recipe: { include: { ingredients: true } }, modifiers: { include: { ingredients: true } } },
      });
    });

    res.status(201).json(menuItem);
  })
);

const updateMenuItemSchema = z.object({
  name: z.string().min(1).optional(),
  sellingPrice: z.number().positive().optional(),
  categoryLabel: z.string().optional(),
  isActive: z.boolean().optional(),
});

menuItemsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = updateMenuItemSchema.parse(req.body);
    res.json(await prisma.menuItem.update({ where: { id: req.params.id }, data }));
  })
);

// Replace a menu item's full ingredient list (base recipe).
const replaceRecipeSchema = z.object({ ingredients: z.array(ingredientSchema) });

menuItemsRouter.put(
  "/:id/recipe",
  asyncHandler(async (req, res) => {
    const body = replaceRecipeSchema.parse(req.body);
    const menuItem = await prisma.menuItem.findUnique({ where: { id: req.params.id }, include: { recipe: true } });
    if (!menuItem) throw new NotFoundError("Menu item not found");

    const recipe = await prisma.$transaction(async (tx) => {
      if (menuItem.recipe) {
        await tx.recipeIngredient.deleteMany({ where: { recipeId: menuItem.recipe.id } });
        return tx.recipe.update({
          where: { id: menuItem.recipe.id },
          data: { ingredients: { create: body.ingredients } },
          include: { ingredients: { include: { product: true } } },
        });
      }
      return tx.recipe.create({
        data: { menuItemId: menuItem.id, ingredients: { create: body.ingredients } },
        include: { ingredients: { include: { product: true } } },
      });
    });

    res.json(recipe);
  })
);

menuItemsRouter.post(
  "/:id/modifiers",
  asyncHandler(async (req, res) => {
    const body = modifierSchema.parse(req.body);
    const modifier = await prisma.modifier.create({
      data: { menuItemId: req.params.id, name: body.name, ingredients: { create: body.ingredients } },
      include: { ingredients: { include: { product: true } } },
    });
    res.status(201).json(modifier);
  })
);

menuItemsRouter.delete(
  "/modifiers/:modifierId",
  asyncHandler(async (req, res) => {
    await prisma.modifier.delete({ where: { id: req.params.modifierId } });
    res.status(204).end();
  })
);
