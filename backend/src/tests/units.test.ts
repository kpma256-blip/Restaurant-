import { describe, expect, it } from "vitest";
import { convert, convertForProduct, UnitConversionError } from "../lib/units";

// These tests read the Unit table, so they run against the seeded dev
// database (backend/prisma/dev.db) — run `npm run seed` first if empty.

describe("unit conversion", () => {
  it("converts pounds to ounces (1 lb = 16 oz)", async () => {
    const oz = await convert(1, "lb", "oz");
    expect(oz).toBeCloseTo(16, 5);
  });

  it("converts ounces back to pounds", async () => {
    const lb = await convert(16, "oz", "lb");
    expect(lb).toBeCloseTo(1, 5);
  });

  it("converts kilograms to grams", async () => {
    expect(await convert(2, "kg", "g")).toBeCloseTo(2000, 6);
  });

  it("converts liters to milliliters", async () => {
    expect(await convert(1.5, "L", "ml")).toBeCloseTo(1500, 6);
  });

  it("converts dozen to each", async () => {
    expect(await convert(2, "dozen", "each")).toBeCloseTo(24, 6);
  });

  it("is a no-op for identical units", async () => {
    expect(await convert(42, "lb", "lb")).toBe(42);
  });

  it("refuses to convert across dimensions", async () => {
    await expect(convert(1, "lb", "ml")).rejects.toThrow(UnitConversionError);
  });

  it("converts case to a product's inventory unit using its caseSize", async () => {
    const product = { inventoryUnitCode: "each", caseSize: 500 };
    const result = await convertForProduct(4, "case", product);
    expect(result).toBeCloseTo(2000, 6); // 4 cases * 500 each/case
  });

  it("throws when converting from case without a caseSize configured", async () => {
    const product = { inventoryUnitCode: "each", caseSize: null };
    await expect(convertForProduct(1, "case", product)).rejects.toThrow(UnitConversionError);
  });

  it("converts a recipe quantity (oz) into a product's inventory unit (lb)", async () => {
    const product = { inventoryUnitCode: "lb", caseSize: null };
    // 6 oz of chicken per sandwich -> lb
    const result = await convertForProduct(6, "oz", product);
    expect(result).toBeCloseTo(6 / 16, 6);
  });
});
