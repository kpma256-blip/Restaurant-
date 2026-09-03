import cron from "node-cron";
import { prisma } from "../../lib/prisma";
import { runOrderSync } from "./syncService";

let running = false;

/**
 * Checked every minute; actually syncs only when autoSyncEnabled is on and
 * autoSyncIntervalMinutes have elapsed since the last sync. Keeps the
 * "Sync Toast Now" button and the scheduled path sharing one code path
 * (runOrderSync) so behavior — including idempotency — is identical.
 */
export function startToastScheduler(): void {
  cron.schedule("* * * * *", async () => {
    if (running) return;
    try {
      const connection = await prisma.toastConnection.findFirst({ orderBy: { createdAt: "desc" } });
      if (!connection?.connected || !connection.autoSyncEnabled) return;

      const dueAt = connection.lastSyncAt
        ? new Date(connection.lastSyncAt.getTime() + connection.autoSyncIntervalMinutes * 60_000)
        : new Date(0);
      if (new Date() < dueAt) return;

      running = true;
      const startDate = connection.lastSyncAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
      await runOrderSync({ trigger: "SCHEDULED", startDate, endDate: new Date() });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[toast-scheduler] sync failed", err);
    } finally {
      running = false;
    }
  });
}
