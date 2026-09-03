import { toastRequest } from "./client";
import { ToastMenuItem, ToastMenusResponse } from "./types";

export interface FlatToastMenuItem {
  guid: string;
  name: string;
  category: string;
  price?: number;
}

function flattenItems(response: ToastMenusResponse): FlatToastMenuItem[] {
  const items: FlatToastMenuItem[] = [];
  const walk = (groups: ToastMenusResponse["menus"][number]["groups"], category: string) => {
    for (const group of groups ?? []) {
      for (const item of group.items ?? []) {
        items.push({ guid: item.guid, name: item.name, category: group.name, price: item.price });
      }
      if (group.subgroups) walk(group.subgroups, group.name);
    }
  };
  for (const menu of response.menus ?? []) walk(menu.groups, menu.name);
  return items;
}

/** GET /menus/v2/menus — full menu structure for the connected restaurant. */
export async function fetchToastMenuItems(): Promise<FlatToastMenuItem[]> {
  const response = await toastRequest<ToastMenusResponse>({ method: "GET", url: "/menus/v2/menus" });
  return flattenItems(response);
}
