// Canonical value lists for the string fields SQLite can't store as real
// enums (see prisma/schema.prisma). Postgres deployments could restore real
// enums, but keeping these as validated strings keeps both connectors
// identical, so this list is the single source of truth either way.

export const UNIT_DIMENSIONS = ["WEIGHT", "VOLUME", "COUNT"] as const;
export type UnitDimension = (typeof UNIT_DIMENSIONS)[number];

export const USER_ROLES = ["ADMIN", "MANAGER", "STAFF"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const SALE_SOURCES = ["MANUAL", "TOAST"] as const;
export type SaleSource = (typeof SALE_SOURCES)[number];

export const WASTE_REASONS = [
  "SPOILED",
  "DAMAGED",
  "DROPPED",
  "EXPIRED",
  "OVERPRODUCTION",
  "STAFF_MEAL",
  "OTHER",
] as const;
export type WasteReason = (typeof WASTE_REASONS)[number];

export const COUNT_STATUSES = ["OPEN", "COMPLETED"] as const;
export type CountStatus = (typeof COUNT_STATUSES)[number];

// Every inventory-affecting event is one of these. This list IS the ledger's
// vocabulary — nothing moves stock outside of it.
export const TRANSACTION_TYPES = [
  "PURCHASE",
  "SALE",
  "WASTE",
  "ADJUSTMENT",
  "PHYSICAL_COUNT",
  "TRANSFER",
  "STAFF_MEAL",
  "CORRECTION",
  "OTHER",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TOAST_SYNC_TRIGGERS = ["MANUAL", "SCHEDULED", "WEBHOOK", "HISTORICAL"] as const;
export type ToastSyncTrigger = (typeof TOAST_SYNC_TRIGGERS)[number];

export const TOAST_SYNC_STATUSES = ["SUCCESS", "PARTIAL", "FAILED", "RUNNING"] as const;
export type ToastSyncStatus = (typeof TOAST_SYNC_STATUSES)[number];

// Variance beyond this absolute percentage is flagged as "requires
// investigation" throughout the dashboard/reports/alerts.
export const VARIANCE_INVESTIGATION_THRESHOLD_PCT = 10;

// Waste in a single week beyond this percentage of that product's
// beginning+received inventory is flagged as "unusually high" in alerts.
export const HIGH_WASTE_THRESHOLD_PCT = 8;
