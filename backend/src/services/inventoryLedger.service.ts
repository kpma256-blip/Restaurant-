import { Prisma, Product } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { convertForProduct } from "../lib/units";
import { TransactionType } from "../lib/constants";

type Tx = Prisma.TransactionClient;

export interface ApplyTransactionInput {
  productId: string;
  type: TransactionType;
  /** Signed quantity in `unitCode` — positive adds stock, negative removes it. */
  quantity: number;
  unitCode: string;
  /** Cost per `unitCode`, if known (e.g. a purchase unit cost). Only meaningful for positive/PURCHASE movements. */
  unitCost?: number | null;
  reason?: string | null;
  notes?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  userId?: string | null;
  /** When the movement actually happened (defaults to now). Used to backdate
   *  purchases/sales/waste so historical reports reflect real dates instead
   *  of "when this got entered". Pass transactions for a product in
   *  chronological order when backdating so previousQuantity/newQuantity
   *  read as a sensible walk. */
  occurredAt?: Date;
}

/** Convert a per-unit cost rate from one unit to another (same dimension, or via product.caseSize for "case"). */
async function convertRateForProduct(
  rate: number,
  fromCode: string,
  product: Pick<Product, "inventoryUnitCode" | "caseSize">
): Promise<number> {
  if (fromCode === product.inventoryUnitCode) return rate;
  // rate_to = rate_from / conversionFactor(from -> to quantity)
  const factor = await convertForProduct(1, fromCode, product);
  if (factor === 0) return rate;
  return rate / factor;
}

/**
 * THE single choke point for every inventory-affecting event in the system.
 * Every call appends one immutable row to InventoryTransaction (the ledger /
 * source of truth) and then updates Product's cached projection
 * (currentQuantity, lastCost, avgCost) inside the same DB transaction, so
 * the cache can never drift out of sync with the ledger it is derived from.
 *
 * Pass `externalTx` to fold this into a larger atomic operation (e.g. a
 * sale that touches several ingredients at once).
 */
export async function applyInventoryTransaction(
  input: ApplyTransactionInput,
  externalTx?: Tx
): Promise<{ transaction: Prisma.InventoryTransactionGetPayload<{}>; product: Product }> {
  const run = async (tx: Tx) => {
    const product = await tx.product.findUniqueOrThrow({ where: { id: input.productId } });

    const normalizedQty = await convertForProduct(input.quantity, input.unitCode, product);
    const previousQuantity = product.currentQuantity;
    const newQuantity = previousQuantity + normalizedQty;

    let normalizedUnitCost: number | null = null;
    let lastCost = product.lastCost;
    let avgCost = product.avgCost;

    if (input.unitCost != null && input.unitCost >= 0) {
      normalizedUnitCost = await convertRateForProduct(input.unitCost, input.unitCode, product);
      if (normalizedQty > 0) {
        // Weighted average cost, recomputed on every incoming movement that
        // carries a cost (purchases; adjustments may also carry one).
        const currentValue = previousQuantity * product.avgCost;
        const incomingValue = normalizedQty * normalizedUnitCost;
        const combinedQty = previousQuantity + normalizedQty;
        avgCost = combinedQty > 0 ? (currentValue + incomingValue) / combinedQty : normalizedUnitCost;
        lastCost = normalizedUnitCost;
      }
    }

    const totalCost = normalizedUnitCost != null ? normalizedUnitCost * Math.abs(normalizedQty) : null;

    const transaction = await tx.inventoryTransaction.create({
      data: {
        productId: input.productId,
        type: input.type,
        quantity: normalizedQty,
        unitCode: input.unitCode,
        originalQuantity: input.quantity,
        previousQuantity,
        newQuantity,
        unitCost: normalizedUnitCost,
        totalCost,
        reason: input.reason ?? null,
        notes: input.notes ?? null,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        userId: input.userId ?? null,
        ...(input.occurredAt ? { createdAt: input.occurredAt } : {}),
      },
    });

    const updatedProduct = await tx.product.update({
      where: { id: input.productId },
      data: { currentQuantity: newQuantity, lastCost, avgCost },
    });

    return { transaction, product: updatedProduct };
  };

  return externalTx ? run(externalTx) : prisma.$transaction((tx) => run(tx));
}

/** Sums the ledger directly — the authoritative current balance, bypassing the cache. */
export async function getLedgerBalance(productId: string, asOf?: Date): Promise<number> {
  const where: Prisma.InventoryTransactionWhereInput = { productId };
  if (asOf) where.createdAt = { lte: asOf };
  const result = await prisma.inventoryTransaction.aggregate({
    where,
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}

/**
 * Recomputes a product's cached currentQuantity from the ledger and corrects
 * it if it has drifted (it shouldn't, since applyInventoryTransaction keeps
 * them in lockstep — this exists as an auditability/self-healing guarantee).
 */
export async function reconcileProduct(productId: string): Promise<{ before: number; after: number; corrected: boolean }> {
  const [product, ledgerBalance] = await Promise.all([
    prisma.product.findUniqueOrThrow({ where: { id: productId } }),
    getLedgerBalance(productId),
  ]);
  const before = product.currentQuantity;
  const corrected = Math.abs(before - ledgerBalance) > 1e-9;
  if (corrected) {
    await prisma.product.update({ where: { id: productId }, data: { currentQuantity: ledgerBalance } });
  }
  return { before, after: ledgerBalance, corrected };
}

export async function reconcileAllProducts(): Promise<Array<{ productId: string; before: number; after: number; corrected: boolean }>> {
  const products = await prisma.product.findMany({ select: { id: true } });
  const results = [];
  for (const p of products) {
    results.push({ productId: p.id, ...(await reconcileProduct(p.id)) });
  }
  return results;
}
