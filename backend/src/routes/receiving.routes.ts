import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, BadRequestError, NotFoundError } from "../middleware/errorHandler";
import { parseInvoicePdf } from "../services/invoice-parser/invoiceParser.service";
import { matchInvoiceItem } from "../services/productMatching.service";
import { createReceiving, DuplicateReceivingError } from "../services/inventory-receiving/inventoryReceiving.service";
import { saveDraft, promoteDraft, readStoredFile, sha256, deleteStoredFile } from "../lib/fileStorage";

export const receivingRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new BadRequestError("Only PDF files are supported for invoice upload"));
    }
    cb(null, true);
  },
});

// ---------------------------------------------------------------------------
// Upload + parse (no inventory change yet — review/confirm required)
// ---------------------------------------------------------------------------

receivingRouter.post(
  "/parse",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new BadRequestError("No file uploaded (expected form field \"file\")");

    const hash = sha256(req.file.buffer);
    const existingPurchase = await prisma.purchase.findUnique({ where: { invoiceFileHash: hash } });

    const parsed = await parseInvoicePdf(req.file.buffer);

    // Try to resolve the supplier the invoice mentions to an actual Supplier row.
    let supplierId: string | null = null;
    if (parsed.supplierGuess) {
      const suppliers = await prisma.supplier.findMany();
      const guess = parsed.supplierGuess.toLowerCase();
      const match = suppliers.find((s) => guess.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(guess));
      supplierId = match?.id ?? null;
    }

    const itemsWithMatches = await Promise.all(
      parsed.items.map(async (item) => {
        const match = await matchInvoiceItem(item.rawDescription, supplierId);
        return { ...item, match };
      })
    );

    const draft = saveDraft(req.file.buffer, req.file.originalname);

    res.json({
      draftId: draft.draftId,
      draftStoragePath: draft.storagePath,
      fileHash: hash,
      duplicateOf: existingPurchase
        ? { purchaseId: existingPurchase.id, purchaseDate: existingPurchase.purchaseDate }
        : null,
      supplierGuess: parsed.supplierGuess,
      supplierId,
      invoiceNumber: parsed.invoiceNumber,
      invoiceDate: parsed.invoiceDate,
      usedOcr: parsed.usedOcr,
      ocrConfidence: parsed.ocrConfidence,
      items: itemsWithMatches,
    });
  })
);

// ---------------------------------------------------------------------------
// Confirm — this is the only step that touches inventory
// ---------------------------------------------------------------------------

const confirmSchema = z.object({
  purchaseDate: z.coerce.date(),
  supplierId: z.string().optional(),
  invoiceNumber: z.string().optional(),
  notes: z.string().optional(),
  draftStoragePath: z.string().optional(),
  fileOriginalName: z.string().optional(),
  fileHash: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().positive(),
        unitCode: z.string().min(1),
        unitCost: z.number().min(0).optional(),
        rawDescription: z.string().optional(),
      })
    )
    .min(1),
});

receivingRouter.post(
  "/confirm",
  asyncHandler(async (req, res) => {
    const body = confirmSchema.parse(req.body);

    try {
      const purchase = await createReceiving({
        purchaseDate: body.purchaseDate,
        supplierId: body.supplierId ?? null,
        invoiceNumber: body.invoiceNumber ?? null,
        notes: body.notes ?? null,
        sourceType: body.draftStoragePath ? "PDF_UPLOAD" : "MANUAL",
        items: body.items,
        userId: req.userId ?? null,
        invoiceFile:
          body.draftStoragePath && body.fileHash
            ? {
                originalName: body.fileOriginalName ?? "invoice.pdf",
                mimeType: "application/pdf",
                storagePath: body.draftStoragePath, // promoted below, once we have the purchase id
                hash: body.fileHash,
              }
            : null,
      });

      // Promote the draft into permanent storage now that we have a purchase id,
      // then correct the stored path to match (draft path is temporary).
      if (body.draftStoragePath) {
        const permanentPath = promoteDraft(body.draftStoragePath, purchase.id);
        await prisma.purchase.update({ where: { id: purchase.id }, data: { invoiceFileStoragePath: permanentPath } });
        purchase.invoiceFileStoragePath = permanentPath;
      }

      res.status(201).json(purchase);
    } catch (err) {
      if (err instanceof DuplicateReceivingError) {
        return res.status(409).json({ error: err.message, existingPurchaseId: err.existingPurchaseId });
      }
      throw err;
    }
  })
);

receivingRouter.post(
  "/discard-draft",
  asyncHandler(async (req, res) => {
    const { draftStoragePath } = z.object({ draftStoragePath: z.string() }).parse(req.body);
    deleteStoredFile(draftStoragePath);
    res.status(204).end();
  })
);

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

receivingRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { from, to, supplierId } = req.query as Record<string, string | undefined>;
    const purchases = await prisma.purchase.findMany({
      where: {
        ...(supplierId ? { supplierId } : {}),
        ...(from || to
          ? { purchaseDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
      },
      include: { supplier: true, items: true, createdByUser: true },
      orderBy: { purchaseDate: "desc" },
    });

    res.json(
      purchases.map((p) => ({
        id: p.id,
        purchaseDate: p.purchaseDate,
        supplier: p.supplier?.name ?? null,
        invoiceNumber: p.invoiceNumber,
        itemCount: p.items.length,
        totalCost: p.totalCost,
        sourceType: p.sourceType,
        hasInvoiceFile: Boolean(p.invoiceFileStoragePath),
        createdBy: p.createdByUser?.name ?? null,
      }))
    );
  })
);

receivingRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const purchase = await prisma.purchase.findUnique({
      where: { id: req.params.id },
      include: { items: { include: { product: true, unit: true } }, supplier: true, createdByUser: true },
    });
    if (!purchase) throw new NotFoundError("Receiving record not found");
    res.json(purchase);
  })
);

receivingRouter.get(
  "/:id/invoice-file",
  asyncHandler(async (req, res) => {
    const purchase = await prisma.purchase.findUnique({ where: { id: req.params.id } });
    if (!purchase?.invoiceFileStoragePath) throw new NotFoundError("No invoice file stored for this receiving record");
    const buffer = readStoredFile(purchase.invoiceFileStoragePath);
    res.setHeader("Content-Type", purchase.invoiceFileMimeType ?? "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${purchase.invoiceFileOriginalName ?? "invoice.pdf"}"`);
    res.send(buffer);
  })
);
