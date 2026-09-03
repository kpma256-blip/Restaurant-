export type StockStatus = "green" | "yellow" | "red";

export interface Category {
  id: string;
  name: string;
  description?: string | null;
  sortOrder: number;
}

export interface Unit {
  code: string;
  name: string;
  dimension: "WEIGHT" | "VOLUME" | "COUNT";
  toBaseFactor: number;
  isBaseUnit: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

export interface Product {
  id: string;
  name: string;
  sku?: string | null;
  categoryId: string;
  category?: Category;
  inventoryUnitCode: string;
  costUnitCode: string;
  caseSize?: number | null;
  parLevel: number;
  reorderLevel: number;
  currentQuantity: number;
  lastCost: number;
  avgCost: number;
  effectiveUnitCost?: number;
  inventoryValue?: number;
  supplierId?: string | null;
  supplier?: Supplier | null;
  isActive: boolean;
  status?: StockStatus;
}

export interface RecipeIngredient {
  id: string;
  productId: string;
  product?: Product;
  quantity: number;
  unitCode: string;
}

export interface ModifierIngredient extends RecipeIngredient {}

export interface Modifier {
  id: string;
  menuItemId: string;
  name: string;
  ingredients: ModifierIngredient[];
  toastMapping?: { toastModifierGuid: string; toastModifierName: string } | null;
}

export interface Recipe {
  id: string;
  menuItemId: string;
  yieldQuantity: number;
  notes?: string | null;
  ingredients: RecipeIngredient[];
}

export interface MenuItem {
  id: string;
  name: string;
  sellingPrice: number;
  categoryLabel?: string | null;
  isActive: boolean;
  recipe?: Recipe | null;
  modifiers: Modifier[];
  toastMapping?: { toastGuid: string; toastName: string } | null;
}

export interface MenuItemCost {
  menuItemId: string;
  name: string;
  sellingPrice: number;
  recipeCost: number;
  foodCostPct: number | null;
  grossProfit: number;
  lines: { productId: string; productName: string; quantity: number; unitCode: string; cost: number }[];
}

export interface InventoryTransaction {
  id: string;
  productId: string;
  type: string;
  quantity: number;
  unitCode: string;
  originalQuantity: number;
  previousQuantity: number;
  newQuantity: number;
  unitCost?: number | null;
  totalCost?: number | null;
  reason?: string | null;
  notes?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  userId?: string | null;
  user?: { name: string } | null;
  createdAt: string;
}

export interface WasteRecord {
  id: string;
  productId: string;
  product?: Product;
  quantity: number;
  unitCode: string;
  reason: string;
  wasteDate: string;
  notes?: string | null;
  user?: { name: string } | null;
}

export interface InventoryCountItem {
  id: string;
  countId: string;
  productId: string;
  product?: Product;
  theoreticalQuantity: number;
  physicalQuantity: number | null;
  unitCode: string;
  varianceQty: number | null;
  variancePct: number | null;
}

export interface InventoryCount {
  id: string;
  countDate: string;
  status: "OPEN" | "COMPLETED";
  notes?: string | null;
  countedByUser?: { name: string } | null;
  completedAt?: string | null;
  items: InventoryCountItem[];
}

export interface Sale {
  id: string;
  saleDate: string;
  source: "MANUAL" | "TOAST";
  externalOrderId?: string | null;
  totalAmount: number;
  items: {
    id: string;
    menuItemId?: string | null;
    menuItemNameSnapshot: string;
    quantity: number;
    unitPrice: number;
    ingredientCost: number;
  }[];
}

export interface Alert {
  type: string;
  severity: "critical" | "warning" | "info";
  productId?: string;
  productName?: string;
  message: string;
  value?: number | null;
}

export interface VarianceBreakdown {
  productId: string;
  productName: string;
  unitCode: string;
  periodStart: string;
  periodEnd: string;
  beginningInventory: number;
  purchases: number;
  theoreticalConsumption: number;
  recordedWaste: number;
  adjustments: number;
  theoreticalEndingInventory: number;
  physicalEndingInventory: number | null;
  physicalCountDate: string | null;
  variance: number | null;
  variancePct: number | null;
  requiresInvestigation: boolean;
}

export interface DashboardData {
  asOf: string;
  currentInventoryValue: number;
  lowStockItems: Product[];
  negativeInventoryItems: Product[];
  largestVariances: VarianceBreakdown[];
  foodUsageValueThisWeek: number;
  wasteValueThisWeek: number;
  estimatedFoodCostThisWeek: number;
  actualVsTheoreticalUsage: VarianceBreakdown[];
  inventoryReceivedThisWeek: number;
  inventoryConsumedThisWeek: number;
  inventoryVarianceValue: number;
  foodCostPercentage: number | null;
  weekRevenue: number;
  alerts: Alert[];
  alertCounts: { critical: number; warning: number };
}

export interface ToastStatus {
  connected: boolean;
  environment: string;
  restaurantGuid: string | null;
  clientId: string | null;
  autoSyncEnabled: boolean;
  autoSyncIntervalMinutes: number;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncLog: any;
  unmappedItemCount: number;
  totalOrdersSynced: number;
  totalOrdersFailed: number;
  totalInventoryTransactions: number;
}

export interface ToastMenuItemMapping {
  id: string;
  toastGuid: string;
  toastName: string;
  toastCategory?: string | null;
  internalMenuItemId?: string | null;
  internalMenuItem?: MenuItem | null;
  isIgnored: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface ProductMatch {
  productId: string | null;
  productName: string | null;
  confidence: number;
  source: "ALIAS" | "FUZZY" | "NONE";
}

export interface ParsedInvoiceItem {
  rawDescription: string;
  quantity: number | null;
  unitCode: string | null;
  unitRawText: string | null;
  unitPrice: number | null;
  totalPrice: number | null;
  match: ProductMatch;
}

export interface ParsedInvoiceResponse {
  draftId: string;
  draftStoragePath: string;
  fileHash: string;
  duplicateOf: { purchaseId: string; purchaseDate: string } | null;
  supplierGuess: string | null;
  supplierId: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  usedOcr: boolean;
  ocrConfidence: number | null;
  items: ParsedInvoiceItem[];
}

export interface ReceivingListItem {
  id: string;
  purchaseDate: string;
  supplier: string | null;
  invoiceNumber: string | null;
  itemCount: number;
  totalCost: number;
  sourceType: "MANUAL" | "PDF_UPLOAD";
  hasInvoiceFile: boolean;
  createdBy: string | null;
}

export interface ReceivingDetail {
  id: string;
  purchaseDate: string;
  invoiceNumber: string | null;
  notes: string | null;
  totalCost: number;
  sourceType: string;
  supplier: Supplier | null;
  createdByUser: { name: string } | null;
  invoiceFileOriginalName: string | null;
  invoiceFileStoragePath: string | null;
  items: {
    id: string;
    productId: string;
    product: Product;
    quantity: number;
    unitCode: string;
    unitCost: number;
    totalCost: number;
    rawDescription: string | null;
  }[];
}

export interface AppSettings {
  id: string;
  restaurantName: string;
  address?: string | null;
  timezone: string;
  currency: string;
  defaultInventoryUnitCode: string;
  lowStockNotify: boolean;
  varianceThresholdPct: number;
  countRequiresFullList: boolean;
  costMethod: "WEIGHTED_AVERAGE" | "LAST_COST";
  foodCostTargetPct: number;
  notifyLowStock: boolean;
  notifyHighVariance: boolean;
  notifyFailedToastSync: boolean;
  notifyUnmappedToast: boolean;
}
