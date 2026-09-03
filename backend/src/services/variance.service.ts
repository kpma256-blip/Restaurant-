import { prisma } from "../lib/prisma";
import { VARIANCE_INVESTIGATION_THRESHOLD_PCT } from "../lib/constants";

export interface ProductVarianceBreakdown {
  productId: string;
  productName: string;
  unitCode: string;
  periodStart: string;
  periodEnd: string;
  beginningInventory: number;
  purchases: number;
  theoreticalConsumption: number; // negative
  recordedWaste: number; // negative
  adjustments: number;
  theoreticalEndingInventory: number;
  physicalEndingInventory: number | null;
  physicalCountDate: string | null;
  variance: number | null; // physical - theoretical
  variancePct: number | null;
  requiresInvestigation: boolean;
}

const NON_THEORETICAL_TYPES = ["PHYSICAL_COUNT"];

/**
 * The core "theoretical vs actual" calculation the whole system is built
 * around:
 *
 *   Beginning inventory
 *   + Purchases
 *   + Theoretical consumption from sales (already negative)
 *   + Recorded waste (already negative)
 *   +/- Adjustments
 *   = Theoretical ending inventory
 *
 *   Theoretical ending inventory vs Physical ending inventory = Variance
 *
 * "Beginning inventory" is the ledger balance strictly before periodStart —
 * i.e. it already reflects any prior physical count, which is exactly how a
 * physical count is meant to re-baseline the next period. Physical-count
 * transactions that fall INSIDE the period are excluded from the
 * theoretical roll-forward (they're the answer we're checking against, not
 * an input to it) and are instead surfaced via the latest completed
 * InventoryCount for the product.
 */
export async function calculateProductVariance(
  productId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<ProductVarianceBreakdown> {
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

  // If a physical count landed inside this period, the theoretical
  // roll-forward must stop AT the count's date, not at periodEnd — a
  // count is a snapshot at one moment, and sales/purchases that happened
  // AFTER it are not yet reflected in that physical number. Comparing a
  // count taken mid-period against a theoretical total computed all the
  // way to periodEnd would compare two different points in time. So we
  // find the count first and, if present, treat its date as the effective
  // end of the roll-forward window.
  const latestCountItem = await prisma.inventoryCountItem.findFirst({
    where: {
      productId,
      physicalQuantity: { not: null },
      count: { status: "COMPLETED", countDate: { gte: periodStart, lte: periodEnd } },
    },
    orderBy: { count: { countDate: "desc" } },
    include: { count: true },
  });
  const effectiveEnd = latestCountItem?.count.countDate ?? periodEnd;

  const beginningAgg = await prisma.inventoryTransaction.aggregate({
    where: { productId, createdAt: { lt: periodStart } },
    _sum: { quantity: true },
  });
  const beginningInventory = beginningAgg._sum.quantity ?? 0;

  const periodTx = await prisma.inventoryTransaction.findMany({
    where: { productId, createdAt: { gte: periodStart, lte: effectiveEnd } },
  });

  const sumByTypes = (types: string[]) =>
    periodTx.filter((t) => types.includes(t.type)).reduce((s, t) => s + t.quantity, 0);

  const purchases = sumByTypes(["PURCHASE"]);
  const theoreticalConsumption = sumByTypes(["SALE"]);
  const recordedWaste = sumByTypes(["WASTE"]);
  const adjustments = sumByTypes(
    periodTx
      .map((t) => t.type)
      .filter((t) => !["PURCHASE", "SALE", "WASTE", ...NON_THEORETICAL_TYPES].includes(t))
  );

  const theoreticalEndingInventory = beginningInventory + purchases + theoreticalConsumption + recordedWaste + adjustments;

  const physicalEndingInventory = latestCountItem?.physicalQuantity ?? null;
  const variance = physicalEndingInventory != null ? physicalEndingInventory - theoreticalEndingInventory : null;
  const variancePct =
    variance != null
      ? theoreticalEndingInventory !== 0
        ? (variance / theoreticalEndingInventory) * 100
        : variance !== 0
        ? 100
        : 0
      : null;

  return {
    productId,
    productName: product.name,
    unitCode: product.inventoryUnitCode,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    beginningInventory,
    purchases,
    theoreticalConsumption,
    recordedWaste,
    adjustments,
    theoreticalEndingInventory,
    physicalEndingInventory,
    physicalCountDate: latestCountItem?.count.countDate.toISOString() ?? null,
    variance,
    variancePct,
    requiresInvestigation: variancePct != null && Math.abs(variancePct) > VARIANCE_INVESTIGATION_THRESHOLD_PCT,
  };
}

export async function calculateAllVariances(periodStart: Date, periodEnd: Date): Promise<ProductVarianceBreakdown[]> {
  const products = await prisma.product.findMany({ where: { isActive: true }, select: { id: true } });
  const results = await Promise.all(products.map((p) => calculateProductVariance(p.id, periodStart, periodEnd)));
  return results.sort((a, b) => Math.abs(b.variance ?? 0) - Math.abs(a.variance ?? 0));
}
