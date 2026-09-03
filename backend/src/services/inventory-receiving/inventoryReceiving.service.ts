import { prisma } from "../../lib/prisma";
import { applyInventoryTransaction } from "../inventoryLedger.service";
import { rememberSupplierProductAlias } from "../productMatching.service";

export class DuplicateReceivingError extends Error {
  constructor(public existingPurchaseId: string) {
    super(`This invoice file has already been received (purchase ${existingPurchaseId}) — not adding it again.`);
  }
}

export interface ReceivingItemInput {
  productId: string;
  quantity: number;
  unitCode: string;
  unitCost?: number | null;
  /** Original invoice line text, when this item came from a parsed PDF — remembered as a supplier alias after saving. */
  rawDescription?: string | null;
}

export interface ReceivingInvoiceFile {
  originalName: string;
  mimeType: string;
  storagePath: string; // already in PERMANENT storage — see fileStorage.promoteDraft
  hash: string;
}

export interface CreateReceivingInput {
  purchaseDate: Date;
  supplierId?: string | null;
  invoiceNumber?: string | null;
  notes?: string | null;
  sourceType: "MANUAL" | "PDF_UPLOAD";
  items: ReceivingItemInput[];
  userId?: string | null;
  invoiceFile?: ReceivingInvoiceFile | null;
}

/**
 * THE single place that turns a receiving session — however it originated
 * (the quick multi-row form, or a reviewed/confirmed PDF invoice) — into a
 * Purchase + PurchaseItems + one PURCHASE ledger transaction per line. Both
 * routes/inventory.routes.ts (`/receive`, kept for backward compatibility)
 * and routes/receiving.routes.ts (`/confirm`) call through here, so there
 * is exactly one code path that can create a receiving record.
 */
export async function createReceiving(input: CreateReceivingInput) {
  if (input.invoiceFile?.hash) {
    const existing = await prisma.purchase.findUnique({ where: { invoiceFileHash: input.invoiceFile.hash } });
    if (existing) throw new DuplicateReceivingError(existing.id);
  }

  const totalCost = input.items.reduce((s, i) => s + (i.unitCost ?? 0) * i.quantity, 0);

  const purchase = await prisma.$transaction(async (tx) => {
    const created = await tx.purchase.create({
      data: {
        purchaseDate: input.purchaseDate,
        supplierId: input.supplierId ?? null,
        invoiceNumber: input.invoiceNumber ?? null,
        notes: input.notes ?? null,
        totalCost,
        sourceType: input.sourceType,
        createdByUserId: input.userId ?? null,
        invoiceFileOriginalName: input.invoiceFile?.originalName ?? null,
        invoiceFileStoragePath: input.invoiceFile?.storagePath ?? null,
        invoiceFileMimeType: input.invoiceFile?.mimeType ?? null,
        invoiceFileHash: input.invoiceFile?.hash ?? null,
      },
    });

    for (const item of input.items) {
      await tx.purchaseItem.create({
        data: {
          purchaseId: created.id,
          productId: item.productId,
          quantity: item.quantity,
          unitCode: item.unitCode,
          unitCost: item.unitCost ?? 0,
          totalCost: (item.unitCost ?? 0) * item.quantity,
          rawDescription: item.rawDescription ?? null,
        },
      });

      await applyInventoryTransaction(
        {
          productId: item.productId,
          type: "PURCHASE",
          quantity: item.quantity,
          unitCode: item.unitCode,
          unitCost: item.unitCost ?? null,
          reason: "Purchase",
          notes: input.notes,
          referenceType: "PURCHASE",
          referenceId: created.id,
          userId: input.userId ?? null,
          occurredAt: input.purchaseDate,
        },
        tx
      );
    }

    return created;
  });

  // Learn supplier -> product mappings for next time (outside the DB
  // transaction — this is a nice-to-have, not required for the receiving
  // itself to succeed).
  for (const item of input.items) {
    if (item.rawDescription) {
      try {
        await rememberSupplierProductAlias(item.rawDescription, input.supplierId ?? null, item.productId);
      } catch {
        // never fail a receiving because alias-learning hiccuped
      }
    }
  }

  return prisma.purchase.findUniqueOrThrow({ where: { id: purchase.id }, include: { items: { include: { product: true } }, supplier: true } });
}
