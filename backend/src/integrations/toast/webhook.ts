import { Router } from "express";
import crypto from "crypto";
import { asyncHandler } from "../../middleware/errorHandler";
import { fetchToastOrderByGuid } from "./orders";
import { normalizeToastOrder } from "./normalizer";

export const toastWebhookRouter = Router();

/**
 * Toast's webhook (event notification) support is a Partner-tier feature
 * that must be requested/approved during onboarding and configured per
 * restaurant in the Toast partner portal (subscribing to order events).
 * Standard API access alone does not include webhooks — until that
 * approval is granted, rely on scheduled/manual polling sync instead (see
 * syncService.runOrderSync). This endpoint is wired up and ready for when
 * webhook access is approved; verify the exact payload shape and signing
 * scheme against the current Toast webhook docs before relying on it, and
 * update TOAST_WEBHOOK_SECRET / the signature check below to match.
 */
toastWebhookRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const secret = process.env.TOAST_WEBHOOK_SECRET;
    if (secret) {
      const signature = req.header("toast-signature");
      const expected = crypto.createHmac("sha256", secret).update(JSON.stringify(req.body)).digest("hex");
      if (!signature || signature !== expected) {
        return res.status(401).json({ error: "Invalid webhook signature" });
      }
    }

    const orderGuid: string | undefined = req.body?.guid ?? req.body?.orderGuid;
    if (!orderGuid) {
      return res.status(400).json({ error: "Webhook payload missing an order GUID" });
    }

    // Fetch the full order rather than trusting the (often partial) webhook
    // body, then import it through the same idempotent path as polling
    // sync — so a webhook delivered twice, or one that arrives after a
    // manual sync already picked up the same order, never double-deducts.
    const order = await fetchToastOrderByGuid(orderGuid);
    const normalized = normalizeToastOrder(order);
    if (!normalized) return res.status(200).json({ imported: false, reason: "voided or empty order" });

    const { runOrderSync } = await import("./syncService");
    // Re-use the polling sync for a tight window around this one order so
    // it goes through menu-mapping resolution and logging identically.
    await runOrderSync({ trigger: "WEBHOOK", startDate: normalized.saleDate, endDate: normalized.saleDate });

    res.status(200).json({ received: true });
  })
);

export async function isWebhookConfigured(): Promise<boolean> {
  return Boolean(process.env.TOAST_WEBHOOK_SECRET);
}
