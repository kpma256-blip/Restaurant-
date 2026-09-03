import { ToastOrder } from "./types";

// This is the POS-agnostic shape the rest of the system deals with. If a
// second POS is added later, it only needs its own normalizer producing
// this same shape — nothing downstream (sync service, sales.service,
// inventory ledger) changes.
export interface NormalizedSaleItem {
  externalItemId: string;
  posMenuItemGuid: string;
  name: string;
  quantity: number;
  unitPrice: number;
  modifiers: { name: string; posModifierGuid?: string }[];
}

export interface NormalizedSale {
  externalOrderId: string;
  saleDate: Date;
  checkNumber?: string;
  items: NormalizedSaleItem[];
}

/** Converts one raw Toast order into the internal normalized sale shape, dropping voided orders/selections. */
export function normalizeToastOrder(order: ToastOrder): NormalizedSale | null {
  if (order.voided) return null;

  const saleDate = order.closedDate ? new Date(order.closedDate) : order.openedDate ? new Date(order.openedDate) : new Date();

  const items: NormalizedSaleItem[] = [];
  for (const check of order.checks ?? []) {
    for (const selection of check.selections ?? []) {
      if (selection.voided) continue;
      if (!selection.itemGuid) continue; // e.g. a special/discount line with no menu item
      items.push({
        externalItemId: selection.guid,
        posMenuItemGuid: selection.itemGuid,
        name: selection.displayName ?? "Unknown item",
        quantity: selection.quantity ?? 1,
        unitPrice: selection.price ?? 0,
        modifiers: (selection.modifiers ?? []).map((m) => ({
          name: m.displayName ?? "Modifier",
          posModifierGuid: m.guid,
        })),
      });
    }
  }

  if (items.length === 0) return null;

  return {
    externalOrderId: order.guid,
    saleDate,
    checkNumber: order.checks?.[0]?.guid,
    items,
  };
}
