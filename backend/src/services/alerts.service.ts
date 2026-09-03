import { prisma } from "../lib/prisma";
import { calculateAllVariances } from "./variance.service";
import { calculateAllMenuItemCosts } from "./costing.service";
import { HIGH_WASTE_THRESHOLD_PCT } from "../lib/constants";
import { getSettings } from "../lib/settingsCache";

export type AlertSeverity = "critical" | "warning" | "info";

export interface Alert {
  type:
    | "NEGATIVE"
    | "ZERO"
    | "BELOW_REORDER"
    | "BELOW_PAR"
    | "HIGH_VARIANCE"
    | "HIGH_FOOD_COST"
    | "HIGH_WASTE";
  severity: AlertSeverity;
  productId?: string;
  productName?: string;
  message: string;
  value?: number | null;
}

export async function getAlerts(): Promise<Alert[]> {
  const alerts: Alert[] = [];

  const [products, settings] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true } }),
    getSettings(),
  ]);
  const targetFoodCostPct = settings.foodCostTargetPct;
  for (const p of products) {
    if (p.currentQuantity < 0) {
      alerts.push({
        type: "NEGATIVE",
        severity: "critical",
        productId: p.id,
        productName: p.name,
        message: `${p.name} inventory is negative (${p.currentQuantity.toFixed(2)} ${p.inventoryUnitCode}) — likely a missing purchase entry, wrong recipe quantity, or data entry error`,
        value: p.currentQuantity,
      });
    } else if (p.currentQuantity === 0) {
      alerts.push({
        type: "ZERO",
        severity: "critical",
        productId: p.id,
        productName: p.name,
        message: `${p.name} is out of stock`,
        value: 0,
      });
    } else if (p.reorderLevel > 0 && p.currentQuantity <= p.reorderLevel) {
      alerts.push({
        type: "BELOW_REORDER",
        severity: "critical",
        productId: p.id,
        productName: p.name,
        message: `${p.name} is at or below reorder level (${p.currentQuantity.toFixed(2)} / reorder ${p.reorderLevel} ${p.inventoryUnitCode}) — order now`,
        value: p.currentQuantity,
      });
    } else if (p.parLevel > 0 && p.currentQuantity < p.parLevel) {
      alerts.push({
        type: "BELOW_PAR",
        severity: "warning",
        productId: p.id,
        productName: p.name,
        message: `${p.name} is below par level (${p.currentQuantity.toFixed(2)} / par ${p.parLevel} ${p.inventoryUnitCode})`,
        value: p.currentQuantity,
      });
    }
  }

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

  const variances = await calculateAllVariances(periodStart, periodEnd);
  for (const v of variances) {
    if (v.requiresInvestigation) {
      alerts.push({
        type: "HIGH_VARIANCE",
        severity: "warning",
        productId: v.productId,
        productName: v.productName,
        message: `${v.productName} has an unusually high variance: ${v.variance?.toFixed(2)} ${v.unitCode} (${v.variancePct?.toFixed(1)}%) over the last 7 days — investigate for waste, theft, over-portioning, or entry errors`,
        value: v.variancePct,
      });
    }
  }

  const menuCosts = await calculateAllMenuItemCosts();
  for (const m of menuCosts) {
    if (m.foodCostPct != null && m.foodCostPct > targetFoodCostPct) {
      alerts.push({
        type: "HIGH_FOOD_COST",
        severity: "warning",
        productName: m.name,
        message: `${m.name} food cost is ${m.foodCostPct.toFixed(1)}% of its ${`$${m.sellingPrice.toFixed(2)}`} selling price (target < ${targetFoodCostPct}%)`,
        value: m.foodCostPct,
      });
    }
  }

  for (const v of variances) {
    const consumedBase = v.beginningInventory + v.purchases;
    if (consumedBase > 0 && v.recordedWaste < 0) {
      const wastePct = (Math.abs(v.recordedWaste) / consumedBase) * 100;
      if (wastePct > HIGH_WASTE_THRESHOLD_PCT) {
        alerts.push({
          type: "HIGH_WASTE",
          severity: "warning",
          productId: v.productId,
          productName: v.productName,
          message: `${v.productName} waste is unusually high: ${Math.abs(v.recordedWaste).toFixed(2)} ${v.unitCode} (${wastePct.toFixed(1)}% of available stock) in the last 7 days`,
          value: wastePct,
        });
      }
    }
  }

  const filtered = alerts.filter((a) => {
    if (!settings.notifyLowStock && (a.type === "BELOW_PAR" || a.type === "BELOW_REORDER" || a.type === "ZERO")) return false;
    if (!settings.notifyHighVariance && (a.type === "HIGH_VARIANCE" || a.type === "HIGH_WASTE")) return false;
    return true;
  });

  const severityRank: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return filtered.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}
