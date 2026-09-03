import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { MulterError } from "multer";
import { DuplicateSaleError } from "../services/sales.service";
import { UnitConversionError } from "../lib/units";
import { DuplicateReceivingError } from "../services/inventory-receiving/inventoryReceiving.service";

export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<any>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export class NotFoundError extends Error {}
export class BadRequestError extends Error {}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.flatten() });
  }
  if (err instanceof DuplicateSaleError || err instanceof DuplicateReceivingError) {
    return res.status(409).json({ error: err.message });
  }
  if (err instanceof UnitConversionError || err instanceof BadRequestError) {
    return res.status(400).json({ error: err.message });
  }
  if (err instanceof MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? "File is too large (max 20MB)" : err.message;
    return res.status(400).json({ error: message });
  }
  if (err instanceof NotFoundError) {
    return res.status(404).json({ error: err.message });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") return res.status(404).json({ error: "Record not found" });
    if (err.code === "P2002") return res.status(409).json({ error: "Duplicate record", meta: err.meta });
    return res.status(400).json({ error: "Database error", code: err.code });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ error: message });
}
