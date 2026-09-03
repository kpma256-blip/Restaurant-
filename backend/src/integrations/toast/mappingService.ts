import { prisma } from "../../lib/prisma";
import { fetchToastMenuItems } from "./menus";

/**
 * Pulls the live Toast menu and upserts a ToastMenuItemMapping row per item
 * (creating unmapped placeholders for anything new, leaving existing
 * mappings/ignores untouched). Call this before an order sync so new Toast
 * items show up as "unmapped" rather than silently failing to import.
 */
export async function syncToastMenu(): Promise<{ created: number; updated: number; total: number }> {
  const items = await fetchToastMenuItems();
  let created = 0;
  let updated = 0;

  for (const item of items) {
    const existing = await prisma.toastMenuItemMapping.findUnique({ where: { toastGuid: item.guid } });
    if (existing) {
      await prisma.toastMenuItemMapping.update({
        where: { toastGuid: item.guid },
        data: { toastName: item.name, toastCategory: item.category },
      });
      updated++;
    } else {
      await prisma.toastMenuItemMapping.create({
        data: { toastGuid: item.guid, toastName: item.name, toastCategory: item.category },
      });
      created++;
    }
  }

  return { created, updated, total: items.length };
}

export async function listUnmappedToastItems() {
  return prisma.toastMenuItemMapping.findMany({
    where: { internalMenuItemId: null, isIgnored: false },
    orderBy: { toastName: "asc" },
  });
}

export async function mapToastItem(toastGuid: string, internalMenuItemId: string) {
  return prisma.toastMenuItemMapping.update({
    where: { toastGuid },
    data: { internalMenuItemId, isIgnored: false },
  });
}

export async function ignoreToastItem(toastGuid: string) {
  return prisma.toastMenuItemMapping.update({ where: { toastGuid }, data: { isIgnored: true, internalMenuItemId: null } });
}

export async function mapToastModifier(toastModifierGuid: string, toastModifierName: string, internalModifierId: string) {
  return prisma.toastModifierMapping.upsert({
    where: { toastModifierGuid },
    create: { toastModifierGuid, toastModifierName, internalModifierId },
    update: { internalModifierId, toastModifierName },
  });
}

export async function listAllMappings() {
  return prisma.toastMenuItemMapping.findMany({
    include: { internalMenuItem: true },
    orderBy: { toastName: "asc" },
  });
}
