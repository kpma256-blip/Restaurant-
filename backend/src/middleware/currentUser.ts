import { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

let systemUserId: string | null = null;

/**
 * Lightweight "who did this" resolution: trusts an X-User-Id header (set by
 * the frontend's user switcher) and falls back to a seeded system user.
 * This is intentionally minimal — full authentication/authorization is a
 * documented future item (see README "Future functionality"). It exists so
 * every InventoryTransaction, WasteRecord, Sale, etc. can still record a
 * real "user who made the change" today.
 */
export async function currentUser(req: Request, _res: Response, next: NextFunction) {
  const headerUserId = req.header("x-user-id");
  if (headerUserId) {
    req.userId = headerUserId;
    return next();
  }
  if (!systemUserId) {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    systemUserId = user?.id ?? null;
  }
  req.userId = systemUserId ?? undefined;
  next();
}
