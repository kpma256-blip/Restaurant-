import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma";
import { applyInventoryTransaction } from "../services/inventoryLedger.service";
import { createReceiving, DuplicateReceivingError } from "../services/inventory-receiving/inventoryReceiving.service";
import { matchInvoiceItem, rememberSupplierProductAlias, similarity } from "../services/productMatching.service";
import { parseInvoiceLine, extractInvoiceNumber, extractInvoiceDate } from "../services/invoice-parser/lineParser";

describe("invoice line parsing", () => {
  it("extracts quantity, unit, and price from a typical invoice line", () => {
    const result = parseInvoiceLine("CHK BRST BNLSS 40LB 40 lb $4.25");
    expect(result?.rawDescription).toBe("CHK BRST BNLSS 40LB");
    expect(result?.quantity).toBe(40);
    expect(result?.unitCode).toBe("lb");
    expect(result?.unitPrice).toBe(4.25);
  });

  it("prefers qty*unitPrice reconciliation when a 3rd (total) number is present and inconsistent", () => {
    const result = parseInvoiceLine("Roma Tomatoes 10 lb 2.50 30.00"); // 10*2.5=25, not 30 -> distrust unit price
    expect(result?.quantity).toBe(10);
    expect(result?.totalPrice).toBe(30);
    expect(result?.unitPrice).toBe(3); // corrected to total/qty
  });

  it("returns null for a line with no numbers (not an item row)", () => {
    expect(parseInvoiceLine("Thank you for your business")).toBeNull();
  });

  it("extracts an invoice number", () => {
    expect(extractInvoiceNumber("Sysco Foods — Invoice #987654")).toBe("987654");
  });

  it("extracts a date in MM/DD/YYYY form", () => {
    const iso = extractInvoiceDate("Date: 09/03/2026");
    expect(iso).toBe(new Date(Date.UTC(2026, 8, 3)).toISOString());
  });
});

describe("product matching + alias memory", () => {
  it("similarity scores identical normalized strings as 1", () => {
    expect(similarity("Chicken Breast", "chicken breast")).toBe(1);
  });

  it("similarity scores unrelated strings low", () => {
    expect(similarity("Chicken Breast", "Dish Soap")).toBeLessThan(0.2);
  });

  it("falls back to NONE when nothing matches well and no alias exists", async () => {
    const result = await matchInvoiceItem("XYZ-NONSENSE-CODE-999", null);
    expect(result.source).toBe("NONE");
    expect(result.productId).toBeNull();
  });

  it("remembers a confirmed match and returns it as an ALIAS on the next lookup", async () => {
    const category = await prisma.category.upsert({ where: { name: "Meat" }, update: {}, create: { name: "Meat" } });
    const product = await prisma.product.create({
      data: { name: `Alias Test Product ${Date.now()}`, categoryId: category.id, inventoryUnitCode: "lb", costUnitCode: "lb" },
    });

    const before = await matchInvoiceItem("WEIRD SKU 123", null);
    expect(before.source).toBe("NONE");

    await rememberSupplierProductAlias("WEIRD SKU 123", null, product.id);

    const after = await matchInvoiceItem("weird   sku 123", null); // different casing/whitespace, still normalizes the same
    expect(after.source).toBe("ALIAS");
    expect(after.productId).toBe(product.id);
    expect(after.confidence).toBeGreaterThan(0.9);

    await prisma.supplierProductAlias.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
  });
});

describe("receiving: duplicate invoice file prevention", () => {
  let productId: string;

  beforeAll(async () => {
    const category = await prisma.category.upsert({ where: { name: "Meat" }, update: {}, create: { name: "Meat" } });
    const product = await prisma.product.create({
      data: { name: `Receiving Test Product ${Date.now()}`, categoryId: category.id, inventoryUnitCode: "lb", costUnitCode: "lb" },
    });
    productId = product.id;
    await applyInventoryTransaction({ productId, type: "PURCHASE", quantity: 10, unitCode: "lb", unitCost: 1, referenceType: "MANUAL" });
  });

  afterAll(async () => {
    await prisma.purchaseItem.deleteMany({ where: { productId } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId } });
    await prisma.product.delete({ where: { id: productId } });
  });

  it("creates a receiving with an invoice file hash, then refuses to create a second one with the same hash", async () => {
    const fakeHash = `test-hash-${Date.now()}`;

    const first = await createReceiving({
      purchaseDate: new Date(),
      sourceType: "PDF_UPLOAD",
      items: [{ productId, quantity: 5, unitCode: "lb", unitCost: 2 }],
      invoiceFile: { originalName: "invoice.pdf", mimeType: "application/pdf", storagePath: "receiving/test/invoice.pdf", hash: fakeHash },
    });
    expect(first.items).toHaveLength(1);

    const productAfterFirst = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(productAfterFirst.currentQuantity).toBe(15); // 10 + 5

    await expect(
      createReceiving({
        purchaseDate: new Date(),
        sourceType: "PDF_UPLOAD",
        items: [{ productId, quantity: 5, unitCode: "lb", unitCost: 2 }],
        invoiceFile: { originalName: "invoice.pdf", mimeType: "application/pdf", storagePath: "receiving/test/invoice2.pdf", hash: fakeHash },
      })
    ).rejects.toThrow(DuplicateReceivingError);

    // Inventory must NOT have been double-counted.
    const productAfterDuplicateAttempt = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(productAfterDuplicateAttempt.currentQuantity).toBe(15);

    await prisma.purchase.delete({ where: { id: first.id } });
  });
});
