import { ParsedInvoiceItem } from "./types";

/**
 * Maps common invoice unit abbreviations to this system's Unit codes
 * (see prisma/seed.ts). Deliberately not exhaustive — anything not
 * recognized is still shown to the reviewer as `unitRawText`, just without
 * a pre-selected unit, since guessing wrong is worse than asking.
 */
const UNIT_ALIASES: Record<string, string> = {
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  oz: "oz", ounce: "oz", ounces: "oz",
  g: "g", gram: "g", grams: "g",
  kg: "kg", kilogram: "kg", kilograms: "kg",
  ml: "ml", milliliter: "ml", milliliters: "ml",
  l: "L", liter: "L", liters: "L", litre: "L", litres: "L",
  pt: "pt", pint: "pt", pints: "pt",
  qt: "qt", quart: "qt", quarts: "qt",
  gal: "gal", gallon: "gal", gallons: "gal",
  ea: "each", each: "each",
  dz: "dozen", dozen: "dozen",
  cs: "case", case: "case", cases: "case", cse: "case",
};

const UNIT_PATTERN = new RegExp(`\\b(${Object.keys(UNIT_ALIASES).join("|")})\\b`, "i");
const MONEY_TOKEN = /^\$?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?$/;
const NUMBER_TOKEN = /^\d+(?:\.\d+)?$/;

function toNumber(token: string): number {
  return Number(token.replace(/[$,]/g, ""));
}

/**
 * Best-effort parse of one invoice/receipt line into a structured item.
 * Real invoices vary wildly in column layout, so this is heuristic, not
 * exact — every field it produces is editable on the review screen before
 * anything touches inventory (see routes/receiving.routes.ts).
 *
 * Strategy: tokenize the line, pull out the unit word (if any known one is
 * present) and every numeric/money-looking token, then assign quantity /
 * unit price / total price by position among the numeric tokens. Everything
 * before the first numeric/unit token is treated as the description.
 */
export function parseInvoiceLine(line: string): ParsedInvoiceItem | null {
  const trimmed = line.trim().replace(/\s{2,}/g, "  ");
  if (trimmed.length < 3) return null;

  const tokens = trimmed.split(/\s+/);
  const numericIdx: number[] = [];
  let unitIdx = -1;
  let unitRawText: string | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (MONEY_TOKEN.test(t) || NUMBER_TOKEN.test(t)) {
      numericIdx.push(i);
    } else if (unitIdx === -1 && UNIT_PATTERN.test(t)) {
      unitIdx = i;
      unitRawText = t;
    }
  }

  // Nothing numeric at all — this line isn't an item row (header, address, etc).
  if (numericIdx.length === 0) return null;

  const descriptionEnd = Math.min(unitIdx === -1 ? tokens.length : unitIdx, numericIdx[0]);
  const rawDescription = tokens.slice(0, descriptionEnd).join(" ").replace(/[-:]+$/, "").trim();
  if (!rawDescription) return null;

  const numbers = numericIdx.map((i) => toNumber(tokens[i]));

  let quantity: number | null = null;
  let unitPrice: number | null = null;
  let totalPrice: number | null = null;

  if (numbers.length === 1) {
    // Only one number on the line — most likely a price (common on simple receipts).
    unitPrice = numbers[0];
  } else if (numbers.length === 2) {
    [quantity, unitPrice] = numbers;
  } else {
    // 3+ numbers: assume qty, unit price, ..., total (last one).
    quantity = numbers[0];
    unitPrice = numbers[1];
    totalPrice = numbers[numbers.length - 1];
  }

  // Sanity check: if we have all three and they don't roughly reconcile,
  // the unit price is more often the mis-extracted one on real invoices
  // (e.g. a SKU/code got parsed as a number) — trust qty * total instead.
  if (quantity != null && unitPrice != null && totalPrice != null && quantity > 0) {
    const expected = quantity * unitPrice;
    if (Math.abs(expected - totalPrice) > Math.max(1, totalPrice * 0.15)) {
      unitPrice = Math.round((totalPrice / quantity) * 10000) / 10000;
    }
  }

  return {
    rawDescription,
    quantity,
    unitCode: unitRawText ? UNIT_ALIASES[unitRawText.toLowerCase()] ?? null : null,
    unitRawText,
    unitPrice,
    totalPrice,
  };
}

const INVOICE_NUMBER_PATTERN = /invoice\s*#?\s*:?\s*#?\s*([A-Za-z0-9-]{3,})/i;
const DATE_PATTERNS = [
  /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/, // MM/DD/YYYY or M/D/YY
  /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, // YYYY-MM-DD
];

export function extractInvoiceNumber(text: string): string | null {
  const m = text.match(INVOICE_NUMBER_PATTERN);
  return m ? m[1] : null;
}

export function extractInvoiceDate(text: string): string | null {
  for (const pattern of DATE_PATTERNS) {
    const m = text.match(pattern);
    if (!m) continue;
    let year: number, month: number, day: number;
    if (pattern === DATE_PATTERNS[0]) {
      month = Number(m[1]);
      day = Number(m[2]);
      year = Number(m[3]);
      if (year < 100) year += 2000;
    } else {
      year = Number(m[1]);
      month = Number(m[2]);
      day = Number(m[3]);
    }
    const date = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

const COLUMN_HEADER_LINE = /^\s*(item|description|qty|quantity|unit|price)\b.*\b(qty|quantity|unit|price)\b/i;

/**
 * The letterhead/company name is almost always the very first line — this
 * strips a trailing "— Invoice #12345" (or similar) from it rather than
 * discarding the whole line just because it mentions "invoice". Falls back
 * to scanning a few more lines for boilerplate we skipped (a bare "Date:"
 * line, a table header row, etc).
 */
export function extractSupplierGuess(text: string): string | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 8)) {
    if (line.length < 3 || line.length > 80) continue;
    if (COLUMN_HEADER_LINE.test(line)) continue;
    if (/^(date|page \d|order #|bill to|ship to|remit to)\b/i.test(line)) continue;
    if (NUMBER_TOKEN.test(line) || MONEY_TOKEN.test(line)) continue;

    const stripped = line
      .replace(/[—–-]?\s*invoice\s*#?\s*:?\s*[a-z0-9-]*\s*$/i, "")
      .replace(/[—–,-]\s*$/, "")
      .trim();
    if (stripped.length >= 3) return stripped;
  }
  return null;
}
