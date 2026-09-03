export interface ParsedInvoiceItem {
  rawDescription: string;
  quantity: number | null;
  unitCode: string | null;
  /** The unit text as it appeared on the invoice, even if we couldn't map it to a known Unit — shown to the reviewer. */
  unitRawText: string | null;
  unitPrice: number | null;
  totalPrice: number | null;
}

export interface ParsedInvoice {
  supplierGuess: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null; // ISO date, best-effort
  items: ParsedInvoiceItem[];
  usedOcr: boolean;
  ocrConfidence: number | null;
  rawText: string;
}
