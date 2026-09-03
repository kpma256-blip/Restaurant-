import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { convert } from "../lib/units";
import { applyInventoryTransaction } from "./inventoryLedger.service";
import { effectiveUnitCost } from "./costing.service";

export class DuplicateSaleError extends Error {
  constructor(public source: string, public externalOrderId: string) {
    super(`Sale already imported: source=${source} externalOrderId=${externalOrderId}`);
  }
}

export interface SaleModifierInput {
  name: string;
  toastModifierGuid?: string | null;
}

export interface SaleItemInput {
  menuItemId: string;
  quantity: number;
  unitPrice?: number;
  modifiers?: SaleModifierInput[];
  externalItemId?: string | null;
}

export interface RecordSaleInput {
  saleDate: Date;
  source?: "MANUAL" | "TOAST";
  externalOrderId?: string | null;
  checkNumber?: string | null;
  note?: string | null;
  userId?: string | null;
  items: SaleItemInput[];
}

interface ConsumptionLine {
  productId: string;
  quantity: number; // in product.inventoryUnitCode, positive
}

/**
 * Resolves how much of each ingredient one sale-item line consumes: the
 * base recipe times quantity sold, plus every attached modifier's
 * ingredient deltas (also times quantity sold — a modifier on a line
 * applies to every unit on that line, matching how a POS reports it).
 */
async function resolveConsumption(item: SaleItemInput): Promise<{ lines: ConsumptionLine[]; cost: number }> {
  const menuItem = await prisma.menuItem.findUnique({
    where: { id: item.menuItemId },
    include: {
      recipe: { include: { ingredients: { include: { product: true } } } },
      modifiers: { include: { ingredients: { include: { product: true } }, toastMapping: true } },
    },
  });
  if (!menuItem) throw new Error(`Menu item ${item.menuItemId} not found`);

  const byProduct = new Map<string, number>();
  let cost = 0;

  if (menuItem.recipe) {
    for (const ing of menuItem.recipe.ingredients) {
      const qty = (await convert(ing.quantity, ing.unitCode, ing.product.inventoryUnitCode)) * item.quantity;
      byProduct.set(ing.productId, (byProduct.get(ing.productId) ?? 0) + qty);
      cost += qty * effectiveUnitCost(ing.product);
    }
  }

  for (const mod of item.modifiers ?? []) {
    const matched = menuItem.modifiers.find(
      (m) => (mod.toastModifierGuid && m.toastMapping?.toastModifierGuid === mod.toastModifierGuid) || m.name === mod.name
    );
    if (!matched) continue; // unmapped modifier — no ingredient impact known yet
    for (const ing of matched.ingredients) {
      const qty = (await convert(ing.quantity, ing.unitCode, ing.product.inventoryUnitCode)) * item.quantity;
      byProduct.set(ing.productId, (byProduct.get(ing.productId) ?? 0) + qty);
      cost += qty * effectiveUnitCost(ing.product);
    }
  }

  return { lines: Array.from(byProduct.entries()).map(([productId, quantity]) => ({ productId, quantity })), cost };
}

/**
 * Records a sale and atomically deducts every ingredient it consumes from
 * inventory via the ledger. Works identically whether the sale came from
 * the manual entry screen or the Toast sync service — both funnel through
 * this one function, which is what keeps POS integrations swappable.
 *
 * Idempotent for POS-sourced sales: if (source, externalOrderId) already
 * exists, throws DuplicateSaleError instead of double-deducting inventory.
 */
export async function recordSale(input: RecordSaleInput) {
  const source = input.source ?? "MANUAL";

  if (source !== "MANUAL" && input.externalOrderId) {
    const existing = await prisma.sale.findUnique({
      where: { source_externalOrderId: { source, externalOrderId: input.externalOrderId } },
    });
    if (existing) throw new DuplicateSaleError(source, input.externalOrderId);
  }

  // Resolve consumption + line pricing before opening the DB transaction.
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: input.items.map((i) => i.menuItemId) } },
  });
  const menuItemById = new Map(menuItems.map((m) => [m.id, m]));

  const resolved = await Promise.all(input.items.map((item) => resolveConsumption(item)));

  const totalAmount = input.items.reduce((sum, item, idx) => {
    const price = item.unitPrice ?? menuItemById.get(item.menuItemId)?.sellingPrice ?? 0;
    return sum + price * item.quantity;
  }, 0);

  try {
    return await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          saleDate: input.saleDate,
          source,
          externalOrderId: input.externalOrderId ?? null,
          checkNumber: input.checkNumber ?? null,
          note: input.note ?? null,
          totalAmount,
          createdByUserId: input.userId ?? null,
        },
      });

      const aggregatedConsumption = new Map<string, number>();

      for (let i = 0; i < input.items.length; i++) {
        const item = input.items[i];
        const menuItem = menuItemById.get(item.menuItemId);
        const price = item.unitPrice ?? menuItem?.sellingPrice ?? 0;

        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            menuItemId: item.menuItemId,
            menuItemNameSnapshot: menuItem?.name ?? "Unknown item",
            quantity: item.quantity,
            unitPrice: price,
            modifiersJson: item.modifiers?.length ? JSON.stringify(item.modifiers) : null,
            externalItemId: item.externalItemId ?? null,
            ingredientCost: resolved[i].cost,
          },
        });

        for (const line of resolved[i].lines) {
          aggregatedConsumption.set(line.productId, (aggregatedConsumption.get(line.productId) ?? 0) + line.quantity);
        }
      }

      for (const [productId, quantity] of aggregatedConsumption.entries()) {
        const product = await tx.product.findUniqueOrThrow({ where: { id: productId } });
        await applyInventoryTransaction(
          {
            productId,
            type: "SALE",
            quantity: -quantity,
            unitCode: product.inventoryUnitCode,
            reason: "Sale",
            referenceType: "SALE",
            referenceId: sale.id,
            userId: input.userId ?? null,
            occurredAt: input.saleDate,
          },
          tx
        );
      }

      return tx.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { items: true } });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DuplicateSaleError(source, input.externalOrderId ?? "");
    }
    throw err;
  }
}
