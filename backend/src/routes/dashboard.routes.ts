import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { calculateInventoryValuation, effectiveUnitCost } from "../services/costing.service";
import { calculateAllVariances } from "../services/variance.service";
import { getAlerts } from "../services/alerts.service";
import { stockStatus } from "./products.routes";

export const dashboardRouter = Router();

dashboardRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [products, valuation, variances, alerts, weekTx, weekSales] = await Promise.all([
      prisma.product.findMany({ where: { isActive: true }, include: { category: true } }),
      calculateInventoryValuation(),
      calculateAllVariances(weekAgo, now),
      getAlerts(),
      prisma.inventoryTransaction.findMany({ where: { createdAt: { gte: weekAgo, lte: now } }, include: { product: true } }),
      prisma.sale.findMany({ where: { saleDate: { gte: weekAgo, lte: now } }, include: { items: true } }),
    ]);

    const lowStockItems = products
      .map((p) => ({ ...p, status: stockStatus(p) }))
      .filter((p) => p.status !== "green")
      .sort((a, b) => a.currentQuantity / (a.parLevel || 1) - b.currentQuantity / (b.parLevel || 1));

    const negativeInventoryItems = products.filter((p) => p.currentQuantity < 0);

    const valueOf = (tx: (typeof weekTx)[number]) => tx.totalCost ?? Math.abs(tx.quantity) * effectiveUnitCost(tx.product);

    const inventoryReceivedThisWeek = weekTx.filter((t) => t.type === "PURCHASE").reduce((s, t) => s + valueOf(t), 0);
    const consumedFromSales = weekTx.filter((t) => t.type === "SALE").reduce((s, t) => s + valueOf(t), 0);
    const wasteValue = weekTx.filter((t) => t.type === "WASTE").reduce((s, t) => s + valueOf(t), 0);
    const inventoryConsumedThisWeek = consumedFromSales + wasteValue;

    const weekRevenue = weekSales.reduce((s, sale) => s + sale.totalAmount, 0);
    const weekIngredientCost = weekSales.reduce((s, sale) => s + sale.items.reduce((si, i) => si + i.ingredientCost, 0), 0);
    const foodCostPercentage = weekRevenue > 0 ? (weekIngredientCost / weekRevenue) * 100 : null;

    const countedVariances = variances.filter((v) => v.variance != null);
    const inventoryVarianceValue = countedVariances.reduce((s, v) => {
      const product = products.find((p) => p.id === v.productId);
      return s + (v.variance ?? 0) * (product ? effectiveUnitCost(product) : 0);
    }, 0);

    res.json({
      asOf: now.toISOString(),
      currentInventoryValue: valuation.total,
      lowStockItems: lowStockItems.slice(0, 25),
      negativeInventoryItems,
      largestVariances: variances.filter((v) => v.variance != null).slice(0, 10),
      foodUsageValueThisWeek: consumedFromSales,
      wasteValueThisWeek: wasteValue,
      estimatedFoodCostThisWeek: weekIngredientCost,
      actualVsTheoreticalUsage: countedVariances.slice(0, 10),
      inventoryReceivedThisWeek,
      inventoryConsumedThisWeek,
      inventoryVarianceValue,
      foodCostPercentage,
      weekRevenue,
      alerts,
      alertCounts: {
        critical: alerts.filter((a) => a.severity === "critical").length,
        warning: alerts.filter((a) => a.severity === "warning").length,
      },
    });
  })
);
