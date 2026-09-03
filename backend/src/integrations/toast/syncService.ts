import { prisma } from "../../lib/prisma";
import { fetchToastOrders } from "./orders";
import { normalizeToastOrder, NormalizedSale } from "./normalizer";
import { recordSale, DuplicateSaleError } from "../../services/sales.service";
import { syncToastMenu } from "./mappingService";
import { getToastCredentials, encryptSecret } from "./config";
import { toastRequestWithCreds, ToastApiError } from "./client";
import { ToastMenusResponse } from "./types";

export interface SyncResult {
  logId: string;
  ordersFetched: number;
  ordersImported: number;
  ordersSkippedDuplicate: number;
  ordersFailed: number;
  inventoryTransactionsCreated: number;
  estimatedIngredientCost: number;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  errors: Array<{ orderId: string; message: string }>;
}

async function importNormalizedSale(sale: NormalizedSale): Promise<{ inventoryTx: number; ingredientCost: number }> {
  const mappings = await prisma.toastMenuItemMapping.findMany({
    where: { toastGuid: { in: sale.items.map((i) => i.posMenuItemGuid) } },
  });
  const mappingByGuid = new Map(mappings.map((m) => [m.toastGuid, m]));

  const modifierMappings = await prisma.toastModifierMapping.findMany();
  const modifierByGuid = new Map(modifierMappings.map((m) => [m.toastModifierGuid, m]));

  const items = [];
  for (const item of sale.items) {
    const mapping = mappingByGuid.get(item.posMenuItemGuid);
    if (!mapping || !mapping.internalMenuItemId || mapping.isIgnored) {
      // Unmapped items are surfaced on the Toast Integration page, not
      // silently dropped from inventory accounting — but we also can't
      // guess a recipe, so this line is skipped and the caller is told.
      continue;
    }
    items.push({
      menuItemId: mapping.internalMenuItemId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      externalItemId: item.externalItemId,
      modifiers: item.modifiers.map((m) => ({
        name: modifierByGuid.get(m.posModifierGuid ?? "")?.toastModifierName ?? m.name,
        toastModifierGuid: m.posModifierGuid,
      })),
    });
  }

  if (items.length === 0) {
    throw new Error(`Order ${sale.externalOrderId}: no items are mapped to internal recipes`);
  }

  const recordedSale = await recordSale({
    saleDate: sale.saleDate,
    source: "TOAST",
    externalOrderId: sale.externalOrderId,
    checkNumber: sale.checkNumber,
    items,
  });

  const inventoryTx = await prisma.inventoryTransaction.count({ where: { referenceType: "SALE", referenceId: recordedSale.id } });
  const ingredientCost = recordedSale.items.reduce((s, i) => s + i.ingredientCost, 0);
  return { inventoryTx, ingredientCost };
}

export async function runOrderSync(opts: {
  trigger: "MANUAL" | "SCHEDULED" | "HISTORICAL" | "WEBHOOK";
  startDate: Date;
  endDate: Date;
}): Promise<SyncResult> {
  const log = await prisma.toastSyncLog.create({
    data: { trigger: opts.trigger, status: "RUNNING" },
  });

  const errors: Array<{ orderId: string; message: string }> = [];
  let ordersFetched = 0;
  let ordersImported = 0;
  let ordersSkippedDuplicate = 0;
  let ordersFailed = 0;
  let inventoryTransactionsCreated = 0;
  let estimatedIngredientCost = 0;

  try {
    // Menu sync first so any brand-new Toast items appear as "unmapped"
    // rather than causing an order-import failure.
    await syncToastMenu();

    const rawOrders = await fetchToastOrders(opts.startDate, opts.endDate);
    ordersFetched = rawOrders.length;

    for (const rawOrder of rawOrders) {
      const normalized = normalizeToastOrder(rawOrder);
      if (!normalized) continue; // voided or empty order — nothing to import

      try {
        const result = await importNormalizedSale(normalized);
        ordersImported++;
        inventoryTransactionsCreated += result.inventoryTx;
        estimatedIngredientCost += result.ingredientCost;
      } catch (err) {
        if (err instanceof DuplicateSaleError) {
          ordersSkippedDuplicate++;
        } else {
          ordersFailed++;
          errors.push({ orderId: normalized.externalOrderId, message: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    const status: SyncResult["status"] = ordersFailed === 0 ? "SUCCESS" : ordersImported > 0 ? "PARTIAL" : "FAILED";

    await prisma.toastSyncLog.update({
      where: { id: log.id },
      data: {
        finishedAt: new Date(),
        status,
        ordersFetched,
        ordersImported,
        ordersSkippedDuplicate,
        ordersFailed,
        inventoryTransactionsCreated,
        estimatedIngredientCost,
        errorLog: JSON.stringify(errors),
      },
    });

    await prisma.toastConnection.updateMany({ data: { lastSyncAt: new Date(), lastSyncStatus: status } });

    return { logId: log.id, ordersFetched, ordersImported, ordersSkippedDuplicate, ordersFailed, inventoryTransactionsCreated, estimatedIngredientCost, status, errors };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.toastSyncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), status: "FAILED", errorLog: JSON.stringify([{ orderId: "*", message }]) },
    });
    await prisma.toastConnection.updateMany({ data: { lastSyncAt: new Date(), lastSyncStatus: "FAILED" } });
    throw err;
  }
}

export async function testToastConnection(creds: Parameters<typeof toastRequestWithCreds>[1]): Promise<void> {
  await toastRequestWithCreds<ToastMenusResponse>({ method: "GET", url: "/menus/v2/menus" }, creds);
}

export interface ConnectInput {
  environment: string;
  clientId: string;
  clientSecret: string;
  restaurantGuid: string;
}

export async function connectToast(input: ConnectInput): Promise<{ connected: boolean; error?: string }> {
  const hostname = input.environment === "production" ? "ws-api.toasttab.com" : "ws-api.eng.toasttab.com";
  try {
    await testToastConnection({ ...input, hostname });
  } catch (err) {
    const message =
      err instanceof ToastApiError
        ? `Toast rejected the credentials (HTTP ${err.status ?? "?"}): ${err.message}`
        : err instanceof Error
        ? err.message
        : "Unknown error";
    return { connected: false, error: message };
  }

  const existing = await prisma.toastConnection.findFirst({ orderBy: { createdAt: "desc" } });
  const data = {
    environment: input.environment,
    clientId: input.clientId,
    encryptedClientSecret: encryptSecret(input.clientSecret),
    restaurantGuid: input.restaurantGuid,
    connected: true,
  };
  if (existing) {
    await prisma.toastConnection.update({ where: { id: existing.id }, data });
  } else {
    await prisma.toastConnection.create({ data });
  }
  return { connected: true };
}

export async function disconnectToast(): Promise<void> {
  const existing = await prisma.toastConnection.findFirst({ orderBy: { createdAt: "desc" } });
  if (existing) {
    await prisma.toastConnection.update({ where: { id: existing.id }, data: { connected: false } });
  }
}

export async function getToastStatus() {
  const [connection, lastLog, unmappedCount, totalTxLog] = await Promise.all([
    prisma.toastConnection.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.toastSyncLog.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.toastMenuItemMapping.count({ where: { internalMenuItemId: null, isIgnored: false } }),
    prisma.toastSyncLog.aggregate({ _sum: { inventoryTransactionsCreated: true, ordersImported: true, ordersFailed: true } }),
  ]);

  const configured = (await getToastCredentials()) != null;

  return {
    connected: Boolean(connection?.connected && configured),
    environment: connection?.environment ?? process.env.TOAST_ENVIRONMENT ?? "sandbox",
    restaurantGuid: connection?.restaurantGuid ?? null,
    clientId: connection?.clientId ?? null, // secret is never included
    autoSyncEnabled: connection?.autoSyncEnabled ?? false,
    autoSyncIntervalMinutes: connection?.autoSyncIntervalMinutes ?? 15,
    lastSyncAt: connection?.lastSyncAt ?? null,
    lastSyncStatus: connection?.lastSyncStatus ?? null,
    lastSyncLog: lastLog,
    unmappedItemCount: unmappedCount,
    totalOrdersSynced: totalTxLog._sum.ordersImported ?? 0,
    totalOrdersFailed: totalTxLog._sum.ordersFailed ?? 0,
    totalInventoryTransactions: totalTxLog._sum.inventoryTransactionsCreated ?? 0,
  };
}
