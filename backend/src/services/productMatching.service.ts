import { prisma } from "../lib/prisma";

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/** 0 (no similarity) to 1 (identical), blending whole-string edit distance with token overlap so word-order and extra words (sizes, packaging) matter less than for a plain Levenshtein ratio. */
export function similarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const maxLen = Math.max(na.length, nb.length);
  const editRatio = 1 - levenshtein(na, nb) / maxLen;

  const tokensA = new Set(na.split(" ").filter((t) => t.length > 1));
  const tokensB = new Set(nb.split(" ").filter((t) => t.length > 1));
  let overlap = 0;
  for (const t of tokensA) if (tokensB.has(t)) overlap++;
  const union = new Set([...tokensA, ...tokensB]).size;
  const jaccard = union > 0 ? overlap / union : 0;

  return editRatio * 0.4 + jaccard * 0.6;
}

export interface MatchResult {
  productId: string | null;
  productName: string | null;
  confidence: number; // 0-1
  source: "ALIAS" | "FUZZY" | "NONE";
}

const FUZZY_MATCH_THRESHOLD = 0.35;

/**
 * Resolves what internal Product an invoice line's raw text refers to.
 * Checks previously-confirmed SupplierProductAlias rows first (exact,
 * high-confidence — a person already confirmed this exact text once for
 * this supplier), then falls back to fuzzy name matching against all
 * active products.
 */
export async function matchInvoiceItem(rawDescription: string, supplierId: string | null): Promise<MatchResult> {
  const normalized = normalizeText(rawDescription);
  if (!normalized) return { productId: null, productName: null, confidence: 0, source: "NONE" };

  if (supplierId) {
    const alias = await prisma.supplierProductAlias.findUnique({
      where: { supplierId_normalizedText: { supplierId, normalizedText: normalized } },
      include: { product: true },
    });
    if (alias) {
      return { productId: alias.productId, productName: alias.product.name, confidence: 1, source: "ALIAS" };
    }
  }
  // Also check supplier-less aliases (e.g. confirmed during a manual upload with no supplier detected).
  const globalAlias = await prisma.supplierProductAlias.findFirst({
    where: { supplierId: null, normalizedText: normalized },
    include: { product: true },
  });
  if (globalAlias) {
    return { productId: globalAlias.productId, productName: globalAlias.product.name, confidence: 0.95, source: "ALIAS" };
  }

  const products = await prisma.product.findMany({ where: { isActive: true }, select: { id: true, name: true } });
  let best: { id: string; name: string; score: number } | null = null;
  for (const p of products) {
    const score = similarity(rawDescription, p.name);
    if (!best || score > best.score) best = { id: p.id, name: p.name, score };
  }

  if (best && best.score >= FUZZY_MATCH_THRESHOLD) {
    return { productId: best.id, productName: best.name, confidence: best.score, source: "FUZZY" };
  }
  return { productId: null, productName: null, confidence: 0, source: "NONE" };
}

/** Called when a person confirms (or corrects) a match on the review screen — remembers it for next time. */
export async function rememberSupplierProductAlias(rawDescription: string, supplierId: string | null, productId: string): Promise<void> {
  const normalizedText = normalizeText(rawDescription);
  if (!normalizedText) return;

  // Not a plain upsert: Prisma's compound-unique `where` type requires a
  // non-null value for every key field, even though supplierId is nullable
  // in the schema (a null-supplier "global" alias is intentional — see
  // matchInvoiceItem's fallback lookup above) — so this looks it up manually instead.
  if (supplierId) {
    await prisma.supplierProductAlias.upsert({
      where: { supplierId_normalizedText: { supplierId, normalizedText } },
      update: { productId, rawText: rawDescription },
      create: { supplierId, normalizedText, rawText: rawDescription, productId },
    });
    return;
  }

  const existing = await prisma.supplierProductAlias.findFirst({ where: { supplierId: null, normalizedText } });
  if (existing) {
    await prisma.supplierProductAlias.update({ where: { id: existing.id }, data: { productId, rawText: rawDescription } });
  } else {
    await prisma.supplierProductAlias.create({ data: { supplierId: null, normalizedText, rawText: rawDescription, productId } });
  }
}
