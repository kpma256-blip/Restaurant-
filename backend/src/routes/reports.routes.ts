import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { calculateAllVariances } from "../services/variance.service";
import { calculateInventoryValuation, effectiveUnitCost } from "../services/costing.service";
import { convert } from "../lib/units";

export const reportsRouter = Router();

function parseRange(req: { query: any }) {
  const to = req.query.to ? new Date(req.query.to as string) : new Date();
  const from = req.query.from ? new Date(req.query.from as string) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

function bucketKey(date: Date, granularity: "daily" | "weekly" | "monthly"): string {
  if (granularity === "monthly") return date.toISOString().slice(0, 7); // YYYY-MM
  if (granularity === "weekly") {
    const d = new Date(date);
    const dayNum = (d.getUTCDay() + 6) % 7; // Monday = 0
    d.setUTCDate(d.getUTCDate() - dayNum);
    return d.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10); // daily
}

// 1/2/3: Inventory usage (theoretical consumption from sales + waste), bucketed by day/week/month.
reportsRouter.get(
  "/usage",
  asyncHandler(async (req, res) => {
    const { from, to } = parseRange(req);
    const granularity = (req.query.granularity as "daily" | "weekly" | "monthly") ?? "daily";
    const categoryId = req.query.categoryId as string | undefined;

    const transactions = await prisma.inventoryTransaction.findMany({
      where: {
        type: { in: ["SALE", "WASTE"] },
        createdAt: { gte: from, lte: to },
        ...(categoryId ? { product: { categoryId } } : {}),
      },
      include: { product: { include: { category: true } } },
    });

    const buckets = new Map<string, { date: string; salesUsage: number; waste: number; products: Map<string, number> }>();
    for (const tx of transactions) {
      const key = bucketKey(tx.createdAt, granularity);
      if (!buckets.has(key)) buckets.set(key, { date: key, salesUsage: 0, waste: 0, products: new Map() });
      const bucket = buckets.get(key)!;
      if (tx.type === "SALE") bucket.salesUsage += Math.abs(tx.quantity);
      if (tx.type === "WASTE") bucket.waste += Math.abs(tx.quantity);
      bucket.products.set(tx.product.name, (bucket.products.get(tx.product.name) ?? 0) + Math.abs(tx.quantity));
    }

    const rows = Array.from(buckets.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((b) => ({
        date: b.date,
        salesUsage: b.salesUsage,
        waste: b.waste,
        totalUsage: b.salesUsage + b.waste,
        byProduct: Array.from(b.products.entries()).map(([name, qty]) => ({ name, quantity: qty })),
      }));

    res.json({ granularity, from, to, rows });
  })
);

// 4: Food cost report — revenue vs ingredient cost over the period, daily trend + totals.
reportsRouter.get(
  "/food-cost",
  asyncHandler(async (req, res) => {
    const { from, to } = parseRange(req);
    const sales = await prisma.sale.findMany({ where: { saleDate: { gte: from, lte: to } }, include: { items: true } });

    const byDay = new Map<string, { date: string; revenue: number; ingredientCost: number }>();
    let revenue = 0;
    let ingredientCost = 0;
    for (const sale of sales) {
      const key = sale.saleDate.toISOString().slice(0, 10);
      const saleCost = sale.items.reduce((s, i) => s + i.ingredientCost, 0);
      revenue += sale.totalAmount;
      ingredientCost += saleCost;
      if (!byDay.has(key)) byDay.set(key, { date: key, revenue: 0, ingredientCost: 0 });
      const bucket = byDay.get(key)!;
      bucket.revenue += sale.totalAmount;
      bucket.ingredientCost += saleCost;
    }

    res.json({
      from,
      to,
      revenue,
      ingredientCost,
      foodCostPercentage: revenue > 0 ? (ingredientCost / revenue) * 100 : null,
      trend: Array.from(byDay.values())
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({ ...d, foodCostPercentage: d.revenue > 0 ? (d.ingredientCost / d.revenue) * 100 : null })),
    });
  })
);

// 5 & 9: Theoretical vs actual usage / product variance report.
reportsRouter.get(
  "/variance",
  asyncHandler(async (req, res) => {
    const { from, to } = parseRange(req);
    const categoryId = req.query.categoryId as string | undefined;
    let variances = await calculateAllVariances(from, to);
    if (categoryId) {
      const productIds = new Set((await prisma.product.findMany({ where: { categoryId }, select: { id: true } })).map((p) => p.id));
      variances = variances.filter((v) => productIds.has(v.productId));
    }
    res.json(variances);
  })
);

// 6: Waste report.
reportsRouter.get(
  "/waste",
  asyncHandler(async (req, res) => {
    const { from, to } = parseRange(req);
    const categoryId = req.query.categoryId as string | undefined;
    const records = await prisma.wasteRecord.findMany({
      where: { wasteDate: { gte: from, lte: to }, ...(categoryId ? { product: { categoryId } } : {}) },
      include: { product: { include: { category: true } }, user: true },
      orderBy: { wasteDate: "desc" },
    });

    const byReason = new Map<string, number>();
    let totalValue = 0;
    for (const r of records) {
      const qtyInInventoryUnit = await convert(r.quantity, r.unitCode, r.product.inventoryUnitCode);
      const value = qtyInInventoryUnit * effectiveUnitCost(r.product);
      totalValue += value;
      byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + value);
    }

    res.json({
      from,
      to,
      totalValue,
      byReason: Array.from(byReason.entries()).map(([reason, value]) => ({ reason, value })),
      records,
    });
  })
);

// 7: Inventory purchases report.
reportsRouter.get(
  "/purchases",
  asyncHandler(async (req, res) => {
    const { from, to } = parseRange(req);
    const categoryId = req.query.categoryId as string | undefined;
    const purchases = await prisma.purchase.findMany({
      where: { purchaseDate: { gte: from, lte: to } },
      include: { items: { include: { product: { include: { category: true } } } }, supplier: true },
      orderBy: { purchaseDate: "desc" },
    });

    const filtered = categoryId
      ? purchases.map((p) => ({ ...p, items: p.items.filter((i) => i.product.categoryId === categoryId) })).filter((p) => p.items.length > 0)
      : purchases;

    const totalCost = filtered.reduce((s, p) => s + p.items.reduce((si, i) => si + i.totalCost, 0), 0);
    res.json({ from, to, totalCost, purchases: filtered });
  })
);

// 8: Inventory valuation report.
reportsRouter.get(
  "/valuation",
  asyncHandler(async (req, res) => {
    res.json(await calculateInventoryValuation(req.query.categoryId as string | undefined));
  })
);

// 10: Menu item profitability.
reportsRouter.get(
  "/menu-profitability",
  asyncHandler(async (req, res) => {
    const { from, to } = parseRange(req);
    const saleItems = await prisma.saleItem.findMany({
      where: { sale: { saleDate: { gte: from, lte: to } } },
      include: { menuItem: true },
    });

    const byMenuItem = new Map<
      string,
      { menuItemId: string | null; name: string; unitsSold: number; revenue: number; ingredientCost: number }
    >();
    for (const item of saleItems) {
      const key = item.menuItemId ?? item.menuItemNameSnapshot;
      if (!byMenuItem.has(key)) {
        byMenuItem.set(key, { menuItemId: item.menuItemId, name: item.menuItemNameSnapshot, unitsSold: 0, revenue: 0, ingredientCost: 0 });
      }
      const bucket = byMenuItem.get(key)!;
      bucket.unitsSold += item.quantity;
      bucket.revenue += item.unitPrice * item.quantity;
      bucket.ingredientCost += item.ingredientCost;
    }

    const rows = Array.from(byMenuItem.values())
      .map((b) => ({
        ...b,
        grossProfit: b.revenue - b.ingredientCost,
        foodCostPercentage: b.revenue > 0 ? (b.ingredientCost / b.revenue) * 100 : null,
      }))
      .sort((a, b) => b.grossProfit - a.grossProfit);

    res.json({ from, to, rows });
  })
);
