import { prisma } from "../lib/prisma";
import { convert } from "../lib/units";

/** Effective per-unit cost for a product: weighted average if we have one, else most recent purchase cost. */
export function effectiveUnitCost(product: { avgCost: number; lastCost: number }): number {
  return product.avgCost > 0 ? product.avgCost : product.lastCost;
}

export interface IngredientCostLine {
  productId: string;
  productName: string;
  quantity: number;
  unitCode: string;
  costPerInventoryUnit: number;
  cost: number;
}

/** Cost of one recipe's ingredient list (base recipe, no modifiers), in dollars. */
export async function calculateRecipeCost(recipeId: string): Promise<{ total: number; lines: IngredientCostLine[] }> {
  const recipe = await prisma.recipe.findUniqueOrThrow({
    where: { id: recipeId },
    include: { ingredients: { include: { product: true } } },
  });

  const lines: IngredientCostLine[] = [];
  for (const ing of recipe.ingredients) {
    const qtyInInventoryUnit = await convert(ing.quantity, ing.unitCode, ing.product.inventoryUnitCode);
    const costPerInventoryUnit = effectiveUnitCost(ing.product);
    const cost = qtyInInventoryUnit * costPerInventoryUnit;
    lines.push({
      productId: ing.productId,
      productName: ing.product.name,
      quantity: ing.quantity,
      unitCode: ing.unitCode,
      costPerInventoryUnit,
      cost,
    });
  }

  return { total: lines.reduce((s, l) => s + l.cost, 0), lines };
}

export interface MenuItemCostSummary {
  menuItemId: string;
  name: string;
  sellingPrice: number;
  recipeCost: number;
  foodCostPct: number | null;
  grossProfit: number;
  lines: IngredientCostLine[];
}

export async function calculateMenuItemCost(menuItemId: string): Promise<MenuItemCostSummary> {
  const menuItem = await prisma.menuItem.findUniqueOrThrow({
    where: { id: menuItemId },
    include: { recipe: true },
  });

  let recipeCost = 0;
  let lines: IngredientCostLine[] = [];
  if (menuItem.recipe) {
    const result = await calculateRecipeCost(menuItem.recipe.id);
    recipeCost = result.total;
    lines = result.lines;
  }

  const foodCostPct = menuItem.sellingPrice > 0 ? (recipeCost / menuItem.sellingPrice) * 100 : null;

  return {
    menuItemId: menuItem.id,
    name: menuItem.name,
    sellingPrice: menuItem.sellingPrice,
    recipeCost,
    foodCostPct,
    grossProfit: menuItem.sellingPrice - recipeCost,
    lines,
  };
}

export async function calculateAllMenuItemCosts(): Promise<MenuItemCostSummary[]> {
  const menuItems = await prisma.menuItem.findMany({ where: { isActive: true }, select: { id: true } });
  return Promise.all(menuItems.map((m) => calculateMenuItemCost(m.id)));
}

/** Total dollar value of all on-hand inventory, optionally scoped to a category. */
export async function calculateInventoryValuation(categoryId?: string) {
  const products = await prisma.product.findMany({
    where: { isActive: true, ...(categoryId ? { categoryId } : {}) },
    include: { category: true },
  });

  const lines = products.map((p) => ({
    productId: p.id,
    productName: p.name,
    category: p.category.name,
    quantity: p.currentQuantity,
    unitCode: p.inventoryUnitCode,
    unitCost: effectiveUnitCost(p),
    value: p.currentQuantity * effectiveUnitCost(p),
  }));

  return {
    total: lines.reduce((s, l) => s + l.value, 0),
    lines: lines.sort((a, b) => b.value - a.value),
  };
}
