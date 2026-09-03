import { toastRequest } from "./client";
import { ToastOrder } from "./types";

/**
 * GET /orders/v2/orders — bulk order retrieval by date range. Toast paginates
 * with a page/pageSize (or cursor, depending on API version) query — this
 * loops pages until an empty page comes back. Verify the exact pagination
 * contract against current docs; adjust here only (nowhere else depends on
 * pagination mechanics).
 */
export async function fetchToastOrders(startDate: Date, endDate: Date): Promise<ToastOrder[]> {
  const all: ToastOrder[] = [];
  let page = 1;
  const pageSize = 100;

  for (;;) {
    const batch = await toastRequest<ToastOrder[]>({
      method: "GET",
      url: "/orders/v2/orders",
      params: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        page,
        pageSize,
      },
    });
    if (!batch || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < pageSize) break;
    page++;
  }

  return all;
}

export async function fetchToastOrderByGuid(guid: string): Promise<ToastOrder> {
  return toastRequest<ToastOrder>({ method: "GET", url: `/orders/v2/orders/${guid}` });
}
