import { PDFParse } from "pdf-parse";
import { recognizeImages } from "../ocr/ocr.service";
import { parseInvoiceLine, extractInvoiceNumber, extractInvoiceDate, extractSupplierGuess } from "./lineParser";
import { ParsedInvoice, ParsedInvoiceItem } from "./types";

export * from "./types";

// Below this many non-whitespace characters, a "text-based" PDF extraction
// is almost certainly a scanned image with no real text layer (or a blank
// page) rather than a thin invoice — fall back to OCR.
const MIN_TEXT_LENGTH_BEFORE_OCR = 40;

function isLikelyNoiseLine(line: string): boolean {
  const l = line.trim().toLowerCase();
  if (!l) return true;
  if (/^(subtotal|total|tax|thank you|page \d|invoice|date|terms|remit|ship to|bill to)/i.test(l)) return true;
  return false;
}

/**
 * Parses a supplier invoice / receipt / packing slip PDF into structured
 * data, using the PDF's embedded text when present and falling back to
 * OCR (fully offline, see ../ocr) for scanned documents. Never touches the
 * database — routes/receiving.routes.ts is responsible for turning the
 * (reviewed, possibly-edited) result into inventory transactions.
 *
 * Not tied to any one supplier's layout — see lineParser.ts for the
 * generic heuristic this relies on.
 */
export async function parseInvoicePdf(fileBuffer: Buffer): Promise<ParsedInvoice> {
  const parser = new PDFParse({ data: fileBuffer });
  let rawText: string;
  let usedOcr = false;
  let ocrConfidence: number | null = null;

  try {
    const textResult = await parser.getText();
    rawText = textResult.text ?? "";

    if (rawText.replace(/\s/g, "").length < MIN_TEXT_LENGTH_BEFORE_OCR) {
      const screenshots = await parser.getScreenshot();
      const ocrResults = await recognizeImages(screenshots.pages.map((p) => Buffer.from(p.data)));
      rawText = ocrResults.map((r) => r.text).join("\n");
      ocrConfidence = ocrResults.length
        ? ocrResults.reduce((s, r) => s + r.confidence, 0) / ocrResults.length
        : null;
      usedOcr = true;
    }
  } finally {
    await parser.destroy();
  }

  const lines = rawText.split("\n");
  const items: ParsedInvoiceItem[] = [];
  for (const line of lines) {
    if (isLikelyNoiseLine(line)) continue;
    const parsed = parseInvoiceLine(line);
    // Require at least a description plus one real number — a line with
    // neither a price nor a quantity isn't a usable item row.
    if (parsed && (parsed.quantity != null || parsed.unitPrice != null || parsed.totalPrice != null)) {
      items.push(parsed);
    }
  }

  return {
    supplierGuess: extractSupplierGuess(rawText),
    invoiceNumber: extractInvoiceNumber(rawText),
    invoiceDate: extractInvoiceDate(rawText),
    items,
    usedOcr,
    ocrConfidence,
    rawText,
  };
}
