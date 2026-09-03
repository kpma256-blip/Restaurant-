import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma";
import { applyInventoryTransaction, reconcileProduct } from "../services/inventoryLedger.service";
import { recordSale, DuplicateSaleError } from "../services/sales.service";
import { calculateProductVariance } from "../services/variance.service";

// Integration test for the flagship "theoretical vs actual inventory"
// calculation, run against the actual services and the seeded dev database
// (backend/prisma/dev.db) — creates its own throwaway product/menu item so
// it never collides with (or disturbs) the demo data from prisma/seed.ts.
//
// Reproduces exactly the scenario from the project spec:
//   Beginning = 50 lb, +30 lb purchase, sell 40 sandwiches @ 6 oz each,
//   2 lb waste, physical count = 29 lb.

// All events below use explicit, well-separated timestamps rather than
// back-to-back `new Date()` calls, so the beginning/period-start boundary
// used by calculateProductVariance is deterministic instead of racing
// millisecond-granularity wall-clock timing.
const T = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);

describe("theoretical vs actual inventory — spec scenario", () => {
  let categoryId: string;
  let productId: string;
  let menuItemId: string;
  let recipeId: string;
  let countId: string | undefined;

  beforeAll(async () => {
    const category = await prisma.category.upsert({
      where: { name: "Meat" },
      update: {},
      create: { name: "Meat" },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        name: `Test Chicken Breast ${Date.now()}`,
        categoryId,
        inventoryUnitCode: "lb",
        costUnitCode: "lb",
        parLevel: 40,
        reorderLevel: 15,
      },
    });
    productId = product.id;

    // Beginning inventory: 50 lb @ $4/lb (matches the spec's example cost).
    await applyInventoryTransaction({
      productId,
      type: "PURCHASE",
      quantity: 50,
      unitCode: "lb",
      unitCost: 4.0,
      reason: "Purchase",
      notes: "Beginning inventory",
      referenceType: "MANUAL",
      occurredAt: T(60),
    });

    const menuItem = await prisma.menuItem.create({
      data: {
        name: `Test Chicken Sandwich ${Date.now()}`,
        sellingPrice: 14.0,
        recipe: { create: { ingredients: { create: [{ productId, quantity: 6, unitCode: "oz" }] } } },
      },
      include: { recipe: true },
    });
    menuItemId = menuItem.id;
    recipeId = menuItem.recipe!.id;
  });

  afterAll(async () => {
    if (countId) {
      await prisma.inventoryCountItem.deleteMany({ where: { countId } });
      await prisma.inventoryCount.deleteMany({ where: { id: countId } });
    }
    await prisma.inventoryTransaction.deleteMany({ where: { productId } });
    await prisma.saleItem.deleteMany({ where: { menuItemId } });
    await prisma.recipeIngredient.deleteMany({ where: { recipeId } });
    await prisma.recipe.deleteMany({ where: { id: recipeId } });
    await prisma.menuItem.deleteMany({ where: { id: menuItemId } });
    await prisma.product.deleteMany({ where: { id: productId } });
  });

  it("walks beginning -> purchase -> sale -> waste -> physical count exactly as specified", async () => {
    let product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.currentQuantity).toBe(50);

    // Purchase +30 lb
    await applyInventoryTransaction({
      productId,
      type: "PURCHASE",
      quantity: 30,
      unitCode: "lb",
      unitCost: 4.25,
      reason: "Purchase",
      referenceType: "MANUAL",
      occurredAt: T(50),
    });
    product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.currentQuantity).toBe(80);

    // The reporting period starts here — after beginning + purchase, before
    // the sale/waste/count that follow.
    const periodStart = T(40);

    // Sell 40 sandwiches, 6 oz chicken each = 240 oz = 15 lb
    const sale = await recordSale({ saleDate: T(30), items: [{ menuItemId, quantity: 40 }] });
    expect(sale.items[0].quantity).toBe(40);

    product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.currentQuantity).toBe(65); // 80 - 15

    // Waste 2 lb
    await applyInventoryTransaction({
      productId,
      type: "WASTE",
      quantity: -2,
      unitCode: "lb",
      reason: "SPOILED",
      referenceType: "WASTE",
      occurredAt: T(20),
    });
    product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.currentQuantity).toBe(63); // theoretical ending inventory

    // Physical count = 29 lb, recorded as a completed InventoryCount
    const countDate = T(10);
    const count = await prisma.inventoryCount.create({
      data: { countDate, status: "COMPLETED", completedAt: countDate },
    });
    countId = count.id;
    await prisma.inventoryCountItem.create({
      data: {
        countId: count.id,
        productId,
        theoreticalQuantity: 63,
        physicalQuantity: 29,
        unitCode: "lb",
        varianceQty: 29 - 63,
        variancePct: ((29 - 63) / 63) * 100,
      },
    });
    await applyInventoryTransaction({
      productId,
      type: "PHYSICAL_COUNT",
      quantity: 29 - 63,
      unitCode: "lb",
      reason: "Physical count",
      referenceType: "COUNT",
      referenceId: count.id,
      occurredAt: countDate,
    });

    product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.currentQuantity).toBe(29);

    // The full breakdown, independently recomputed from the ledger:
    const breakdown = await calculateProductVariance(productId, periodStart, new Date());
    expect(breakdown.beginningInventory).toBe(80); // as of periodStart (after the +30 purchase, before the sale)
    expect(breakdown.theoreticalConsumption).toBe(-15);
    expect(breakdown.recordedWaste).toBe(-2);
    expect(breakdown.theoreticalEndingInventory).toBe(63);
    expect(breakdown.physicalEndingInventory).toBe(29);
    expect(breakdown.variance).toBe(-34);
    expect(breakdown.variancePct).toBeCloseTo((-34 / 63) * 100, 6);
    expect(breakdown.requiresInvestigation).toBe(true);

    // Ledger is the source of truth: reconciling must find zero drift.
    const reconciled = await reconcileProduct(productId);
    expect(reconciled.corrected).toBe(false);
    expect(reconciled.after).toBe(29);
  });
});

describe("Toast-style sale idempotency", () => {
  let menuItemId: string;
  let productId: string;

  beforeAll(async () => {
    const category = await prisma.category.upsert({ where: { name: "Meat" }, update: {}, create: { name: "Meat" } });
    const product = await prisma.product.create({
      data: { name: `Idempotency Test Product ${Date.now()}`, categoryId: category.id, inventoryUnitCode: "each", costUnitCode: "each" },
    });
    productId = product.id;
    await applyInventoryTransaction({ productId, type: "PURCHASE", quantity: 100, unitCode: "each", unitCost: 1, referenceType: "MANUAL" });

    const menuItem = await prisma.menuItem.create({
      data: {
        name: `Idempotency Test Item ${Date.now()}`,
        sellingPrice: 5,
        recipe: { create: { ingredients: { create: [{ productId, quantity: 1, unitCode: "each" }] } } },
      },
    });
    menuItemId = menuItem.id;
  });

  afterAll(async () => {
    await prisma.inventoryTransaction.deleteMany({ where: { productId } });
    await prisma.saleItem.deleteMany({ where: { menuItemId } });
    await prisma.sale.deleteMany({ where: { source: "TOAST", externalOrderId: "toast-order-abc-123" } });
    const recipe = await prisma.recipe.findUnique({ where: { menuItemId } });
    if (recipe) {
      await prisma.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
      await prisma.recipe.delete({ where: { id: recipe.id } });
    }
    await prisma.menuItem.delete({ where: { id: menuItemId } });
    await prisma.product.delete({ where: { id: productId } });
  });

  it("never deducts inventory twice for the same Toast order GUID", async () => {
    const externalOrderId = "toast-order-abc-123";
    await recordSale({ saleDate: new Date(), source: "TOAST", externalOrderId, items: [{ menuItemId, quantity: 3 }] });

    let product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.currentQuantity).toBe(97); // 100 - 3

    // Re-syncing the same order must not double-deduct.
    await expect(
      recordSale({ saleDate: new Date(), source: "TOAST", externalOrderId, items: [{ menuItemId, quantity: 3 }] })
    ).rejects.toThrow(DuplicateSaleError);

    product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.currentQuantity).toBe(97); // unchanged
  });
});
