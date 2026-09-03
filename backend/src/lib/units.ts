import { prisma } from "./prisma";

export class UnitConversionError extends Error {}

export interface UnitRow {
  code: string;
  name: string;
  dimension: string;
  toBaseFactor: number;
  isBaseUnit: boolean;
}

let unitCache: Map<string, UnitRow> | null = null;

/** Units rarely change; cache them in-process and invalidate on write. */
export async function loadUnits(): Promise<Map<string, UnitRow>> {
  if (unitCache) return unitCache;
  const rows = await prisma.unit.findMany();
  unitCache = new Map(rows.map((r) => [r.code, r as UnitRow]));
  return unitCache;
}

export function invalidateUnitCache(): void {
  unitCache = null;
}

async function getUnit(code: string): Promise<UnitRow> {
  const units = await loadUnits();
  const unit = units.get(code);
  if (!unit) throw new UnitConversionError(`Unknown unit "${code}"`);
  return unit;
}

/**
 * Convert a quantity between two standard (non-"case") units. Both units
 * must belong to the same dimension (WEIGHT, VOLUME, or COUNT) — you cannot
 * convert oz to ml, for example.
 */
export async function convert(quantity: number, fromCode: string, toCode: string): Promise<number> {
  if (fromCode === toCode) return quantity;
  if (fromCode === "case" || toCode === "case") {
    throw new UnitConversionError(
      `"case" conversions require product context — use convertForProduct() instead`
    );
  }
  const [from, to] = await Promise.all([getUnit(fromCode), getUnit(toCode)]);
  if (from.dimension !== to.dimension) {
    throw new UnitConversionError(
      `Cannot convert "${fromCode}" (${from.dimension}) to "${toCode}" (${to.dimension}) — incompatible units`
    );
  }
  const inBase = quantity * from.toBaseFactor;
  return inBase / to.toBaseFactor;
}

/**
 * Convert a quantity expressed in `fromCode` into a product's canonical
 * inventory unit (product.inventoryUnitCode). Handles "case" using the
 * product's own caseSize — a case is defined as N of the product's
 * inventory-units, product-specific, so there is no global case factor.
 */
export async function convertForProduct(
  quantity: number,
  fromCode: string,
  product: { inventoryUnitCode: string; caseSize: number | null }
): Promise<number> {
  if (fromCode === "case") {
    if (!product.caseSize) {
      throw new UnitConversionError(
        `Product has no caseSize configured — cannot convert from "case"`
      );
    }
    return quantity * product.caseSize;
  }
  return convert(quantity, fromCode, product.inventoryUnitCode);
}

/** Inverse of convertForProduct: express an inventory-unit quantity as "case" count. */
export async function convertInventoryToCase(
  quantityInInventoryUnit: number,
  product: { caseSize: number | null }
): Promise<number> {
  if (!product.caseSize) {
    throw new UnitConversionError(`Product has no caseSize configured — cannot convert to "case"`);
  }
  return quantityInInventoryUnit / product.caseSize;
}

export async function allUnits(): Promise<UnitRow[]> {
  const map = await loadUnits();
  return Array.from(map.values());
}
