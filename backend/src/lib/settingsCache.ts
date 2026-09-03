import { prisma } from "./prisma";
import { Settings } from "@prisma/client";

const SINGLETON_ID = "singleton";
const TTL_MS = 30_000;

let cached: { value: Settings; expiresAt: number } | null = null;

/** Settings are read on almost every dashboard/report/alerts request, so this caches briefly rather than hitting the DB every time. */
export async function getSettings(): Promise<Settings> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const existing = await prisma.settings.findUnique({ where: { id: SINGLETON_ID } });
  const value = existing ?? (await prisma.settings.create({ data: { id: SINGLETON_ID } }));
  cached = { value, expiresAt: Date.now() + TTL_MS };
  return value;
}

export function invalidateSettingsCache(): void {
  cached = null;
}
