import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

// Mirrors functions/inventory.js. The money rules live on the server — this file
// only carries shapes and the call plumbing, so there is one place that decides
// what a thing cost.

export type InventoryTrackingType = "unique" | "quantity";
export type InventoryStatus = "available" | "reserved" | "partiallyReserved" | "incoming" | "used" | "sold" | "removed" | "archived";
export type InventoryOwnership = "business" | "customer";

export const INVENTORY_STATUSES: InventoryStatus[] = [
  "available", "reserved", "partiallyReserved", "incoming", "used", "sold", "removed", "archived"
];

export const INVENTORY_CATEGORIES = [
  "Watches", "Dials", "Movements", "Bracelets", "Straps",
  "Parts", "Consumables", "Packaging", "Tools", "Other"
];

export type InventoryAdditionalCost = { label: string; amount: number };

export type InventoryItem = {
  id: string;
  number: string;
  name: string;
  category: string;
  trackingType: InventoryTrackingType;
  ownership: InventoryOwnership;
  status: InventoryStatus;
  brand: string;
  model: string;
  reference: string;
  serialNumber: string;
  year: string;
  condition: string;
  description: string;
  sku: string;
  location: string;
  supplierName: string;
  purchaseDate: string;
  notes: string;
  photos: string[];
  quantity: { onHand: number; reserved: number; incoming: number; unit: string };
  purchasePrice: number;
  additionalCosts: InventoryAdditionalCost[];
  additionalCostsTotal: number;
  internalTotalCost: number;
  valuationCost: number;
  currentValueEst: number;
  lowStockAt: number;
  reservedForOrderId: string;
  /** Order reservations — the server writes these; every reserved unit names its order. */
  reservations?: Array<{ orderId: string; quantity: number; createdAtMs: number }>;
  reservedOrderIds?: string[];
  /** Set when the item was created by a purchase. */
  purchaseId?: string;
  purchaseNumber?: string;
  source: string;
  updatedAtMs: number;
};

export type InventorySummary = {
  totalValue: number;
  uniqueCount: number;
  uniqueValue: number;
  quantityCount: number;
  quantityValue: number;
  reservedValue: number;
  reservedCount: number;
  incomingCount: number;
  incomingValue: number;
  lowStockCount: number;
  customerOwnedCount: number;
  /** Ledger-derived 30-day change; available=false means "not watching long enough", never fake 0%. */
  monthlyChange?: { available: boolean; netValue30d: number; pct: number; ledgerStartsMs: number };
};

// What the New Item form collects. Deliberately flat: the branching between a
// unique object and a counted material is a UI concern, and the server decides
// what each type is allowed to carry.
export type InventoryItemInput = {
  name: string;
  category: string;
  trackingType: InventoryTrackingType;
  ownership: InventoryOwnership;
  brand?: string;
  model?: string;
  reference?: string;
  serialNumber?: string;
  year?: string;
  condition?: string;
  description?: string;
  sku?: string;
  location?: string;
  supplierName?: string;
  purchaseDate?: string;
  notes?: string;
  photos?: string[];
  onHand?: number;
  unit?: string;
  lowStockAt?: number;
  purchasePrice?: number;
  additionalCosts?: InventoryAdditionalCost[];
  currentValueEst?: number;
};

function inventoryError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : "";
  if (/permission-denied|role/i.test(raw)) return "Your workspace role cannot change inventory.";
  const cleaned = raw.replace(/^[a-z-]+:\s*/i, "").trim();
  if (!cleaned || /^(internal|unknown|unavailable|not-found)$/i.test(cleaned)) return fallback;
  return cleaned;
}

async function call<T>(name: string, payload: Record<string, unknown>, fallback: string) {
  try {
    const callable = httpsCallable<Record<string, unknown>, T>(functions, name);
    const result = await callable(payload);
    return result.data;
  } catch (error) {
    throw new Error(inventoryError(error, fallback));
  }
}

export async function listInventoryItems(workspace: WorkspaceContext) {
  return call<{ ok?: boolean; items?: InventoryItem[]; categories?: string[] }>(
    "listInventoryItems",
    { companyId: workspace.id, limit: 500 },
    "Inventory could not be loaded."
  );
}

export async function getInventorySummary(workspace: WorkspaceContext) {
  return call<{ ok?: boolean; summary?: InventorySummary }>(
    "getInventorySummary",
    { companyId: workspace.id },
    "The inventory totals could not be loaded."
  );
}

// Maps a stored item back to the input the save callable expects. The server
// rebuilds the whole document from the input (reservations and status are
// carried over server-side), so any edit — even "just move it to Drawer 3" —
// must send every field or the unsent ones are blanked.
export function inventoryItemToInput(item: InventoryItem): InventoryItemInput {
  return {
    name: item.name,
    category: item.category,
    trackingType: item.trackingType,
    ownership: item.ownership,
    brand: item.brand,
    model: item.model,
    reference: item.reference,
    serialNumber: item.serialNumber,
    year: item.year,
    condition: item.condition,
    description: item.description,
    sku: item.sku,
    location: item.location,
    supplierName: item.supplierName,
    purchaseDate: item.purchaseDate,
    notes: item.notes,
    photos: item.photos,
    onHand: item.trackingType === "quantity" ? Number(item.quantity?.onHand) || 0 : 1,
    unit: item.quantity?.unit || "",
    lowStockAt: item.lowStockAt,
    purchasePrice: item.purchasePrice,
    additionalCosts: item.additionalCosts,
    currentValueEst: item.currentValueEst
  };
}

export async function saveInventoryItem(
  workspace: WorkspaceContext,
  item: InventoryItemInput,
  itemId?: string
) {
  return call<{ ok?: boolean; itemId?: string; number?: string }>(
    "saveInventoryItem",
    { companyId: workspace.id, itemId: itemId || "", item },
    "The item could not be saved."
  );
}

export async function setInventoryItemStatus(
  workspace: WorkspaceContext,
  itemId: string,
  status: InventoryStatus,
  orderId?: string
) {
  return call<{ ok?: boolean; status?: InventoryStatus }>(
    "setInventoryItemStatus",
    { companyId: workspace.id, itemId, status, orderId: orderId || "" },
    "The item status could not be changed."
  );
}

export async function deleteInventoryItem(workspace: WorkspaceContext, itemId: string) {
  return call<{ ok?: boolean }>(
    "deleteInventoryItem",
    { companyId: workspace.id, itemId },
    "The item could not be deleted."
  );
}

export async function importOpeningStock(
  workspace: WorkspaceContext,
  items: InventoryItemInput[],
  openingDate: string
) {
  return call<{ ok?: boolean; imported?: number }>(
    "importOpeningStock",
    { companyId: workspace.id, items, openingDate },
    "The opening stock could not be imported."
  );
}

// On hand for display: a unique item is one object, whatever a stale record says.
export function inventoryOnHand(item: InventoryItem) {
  return item.trackingType === "unique" ? 1 : Number(item.quantity?.onHand) || 0;
}

// Line value follows the same rule the server uses for the totals, so a row and
// the header can never disagree.
export function inventoryLineValue(item: InventoryItem) {
  if (item.ownership === "customer") return 0;
  const unitValue = Number(item.valuationCost) || 0;
  return item.trackingType === "unique"
    ? unitValue
    : Math.round(unitValue * inventoryOnHand(item) * 100) / 100;
}

export function isInventoryLowStock(item: InventoryItem) {
  if (item.trackingType !== "quantity") return false;
  const at = Number(item.lowStockAt) || 0;
  return at > 0 && inventoryOnHand(item) <= at;
}

// ---------------------------------------------------------------------------
// Purchases and suppliers
// ---------------------------------------------------------------------------

export type PurchaseStatus = "ordered" | "partiallyReceived" | "received";

export type PurchaseLine = {
  itemId: string;
  name: string;
  category: string;
  trackingType: InventoryTrackingType;
  quantity: number;
  unit: string;
  unitPrice: number;
  reference: string;
  serialNumber: string;
  location: string;
  allocatedExtras: number;
  /** How much of this line has actually landed. Absent on older purchases. */
  receivedQuantity?: number;
};

export type Purchase = {
  id: string;
  number: string;
  supplierName: string;
  supplierId: string;
  purchaseDate: string;
  reference: string;
  notes: string;
  lines: PurchaseLine[];
  goodsTotal: number;
  shipping: number;
  otherCosts: number;
  total: number;
  status: PurchaseStatus;
  itemIds: string[];
  bankTransactionId: string;
  receivedAtMs: number;
  createdAtMs: number;
};

export type PurchaseInput = {
  supplierName: string;
  supplierId?: string;
  purchaseDate: string;
  reference?: string;
  notes?: string;
  shipping?: number;
  otherCosts?: number;
  lines: Array<{
    name: string;
    category: string;
    trackingType: InventoryTrackingType;
    quantity: number;
    unit?: string;
    unitPrice: number;
    reference?: string;
    serialNumber?: string;
    location?: string;
  }>;
};

export type SupplierStats = {
  total: number;
  count: number;
  lastDate: string;
  matched: number;
  lines: number;
};

export type Supplier = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  website?: string;
  notes?: string;
  implied?: boolean;
  stats: SupplierStats;
};

export async function listPurchases(workspace: WorkspaceContext) {
  return call<{ ok?: boolean; purchases?: Purchase[] }>(
    "listPurchases",
    { companyId: workspace.id },
    "Purchases could not be loaded."
  );
}

export async function savePurchase(
  workspace: WorkspaceContext,
  purchase: PurchaseInput,
  purchaseId?: string
) {
  return call<{ ok?: boolean; purchaseId?: string; number?: string; total?: number; itemsCreated?: number }>(
    "savePurchase",
    { companyId: workspace.id, purchaseId: purchaseId || "", purchase },
    "The purchase could not be saved."
  );
}

/**
 * Without `lines` this receives everything still outstanding. With them it
 * receives per line and per quantity — the purchase stays partiallyReceived
 * until the last piece lands.
 */
export async function receivePurchase(
  workspace: WorkspaceContext,
  purchaseId: string,
  lines?: Array<{ index: number; quantity?: number }>
) {
  return call<{ ok?: boolean; received?: number; alreadyReceived?: boolean; status?: PurchaseStatus }>(
    "receivePurchase",
    { companyId: workspace.id, purchaseId, ...(lines ? { lines } : {}) },
    "The purchase could not be marked as received."
  );
}

export async function deletePurchase(workspace: WorkspaceContext, purchaseId: string) {
  return call<{ ok?: boolean }>(
    "deletePurchase",
    { companyId: workspace.id, purchaseId },
    "The purchase could not be deleted."
  );
}

export async function linkPurchaseToBankTransaction(
  workspace: WorkspaceContext,
  purchaseId: string,
  transactionId: string
) {
  return call<{ ok?: boolean; linked?: boolean; paid?: number; purchaseTotal?: number; difference?: number }>(
    "linkPurchaseToBankTransaction",
    { companyId: workspace.id, purchaseId, transactionId },
    "The payment could not be matched."
  );
}

export async function listSuppliers(workspace: WorkspaceContext) {
  return call<{ ok?: boolean; suppliers?: Supplier[] }>(
    "listSuppliers",
    { companyId: workspace.id },
    "Suppliers could not be loaded."
  );
}

export async function saveSupplier(
  workspace: WorkspaceContext,
  supplier: { name: string; email?: string; phone?: string; website?: string; notes?: string },
  supplierId?: string
) {
  return call<{ ok?: boolean; supplierId?: string }>(
    "saveSupplier",
    { companyId: workspace.id, supplierId: supplierId || "", supplier },
    "The supplier could not be saved."
  );
}

// ---------------------------------------------------------------------------
// Reserving stock for an order
// ---------------------------------------------------------------------------

export type OrderInventoryLine = {
  id: string;
  number: string;
  name: string;
  category: string;
  trackingType: InventoryTrackingType;
  unit: string;
  status: InventoryStatus;
  quantity: number;
  /** Total on the shelf, so the card can say "3 of 10" instead of a bare 3. */
  onHand: number;
  location: string;
  unitCost: number;
  lineCost: number;
};

export async function getOrderInventory(workspace: WorkspaceContext, orderId: string) {
  return call<{ ok?: boolean; items?: OrderInventoryLine[]; totalCost?: number }>(
    "getOrderInventory",
    { companyId: workspace.id, orderId },
    "The order's stock could not be loaded."
  );
}

export async function reserveInventoryForOrder(
  workspace: WorkspaceContext,
  itemId: string,
  orderId: string,
  quantity: number
) {
  return call<{ ok?: boolean; reserved?: number; remaining?: number }>(
    "reserveInventoryForOrder",
    { companyId: workspace.id, itemId, orderId, quantity },
    "The item could not be reserved."
  );
}

export async function releaseInventoryFromOrder(
  workspace: WorkspaceContext,
  itemId: string,
  orderId: string
) {
  return call<{ ok?: boolean }>(
    "releaseInventoryFromOrder",
    { companyId: workspace.id, itemId, orderId },
    "The item could not be released."
  );
}

/**
 * The moment a promised part actually goes into the job. Without a quantity it
 * consumes the whole reservation; with one it leaves the rest still promised.
 */
export async function consumeInventoryForOrder(
  workspace: WorkspaceContext,
  itemId: string,
  orderId: string,
  quantity?: number
) {
  return call<{ ok?: boolean; consumed?: number; remaining?: number; stillReserved?: number }>(
    "consumeInventoryForOrder",
    { companyId: workspace.id, itemId, orderId, ...(quantity ? { quantity } : {}) },
    "The item could not be marked as used."
  );
}

/** Release one item and reserve another in a single transaction. */
export async function swapInventoryForOrder(
  workspace: WorkspaceContext,
  orderId: string,
  fromItemId: string,
  toItemId: string,
  quantity?: number
) {
  return call<{ ok?: boolean; released?: number; reserved?: number }>(
    "swapInventoryForOrder",
    { companyId: workspace.id, orderId, fromItemId, toItemId, ...(quantity ? { quantity } : {}) },
    "The swap could not be completed."
  );
}

// How much of a counted material is free to promise to a new order: what is on
// the shelf, less what other orders are already holding.
//
// Something sold, used up or archived is out of the story whatever the count
// says — the server refuses to reserve it, so offering it here would only be a
// dead end for the person clicking.
const UNRESERVABLE: InventoryStatus[] = ["sold", "used", "archived"];

export function inventoryFreeToReserve(item: InventoryItem) {
  if (UNRESERVABLE.includes(item.status)) return 0;
  if (item.trackingType === "unique") return item.status === "available" ? 1 : 0;
  const onHand = inventoryOnHand(item);
  const reserved = Number(item.quantity?.reserved) || 0;
  return Math.max(0, Math.round((onHand - reserved) * 100) / 100);
}

// ---------------------------------------------------------------------------
// Opening stock import
//
// The point of an opening balance is that a workshop with two hundred things
// already on the shelf can start using inventory today, without typing two
// hundred forms. So this reads what people actually have: a spreadsheet.
// ---------------------------------------------------------------------------

/**
 * The fields an opening-stock row can carry. The aliases live on the server —
 * `parseOpeningStock` does the splitting and the header matching, so there is
 * one implementation of the fiddly part and every platform behaves alike.
 * These labels are only what the mapping menu shows.
 */
export const OPENING_STOCK_FIELDS = [
  { key: "name", label: "Name" },
  { key: "trackingType", label: "Type" },
  { key: "category", label: "Category" },
  { key: "brand", label: "Brand" },
  { key: "model", label: "Model" },
  { key: "reference", label: "Reference" },
  { key: "serialNumber", label: "Serial number" },
  { key: "sku", label: "SKU" },
  { key: "onHand", label: "On hand" },
  { key: "unit", label: "Unit" },
  { key: "lowStockAt", label: "Reorder at" },
  { key: "purchasePrice", label: "Purchase price" },
  { key: "location", label: "Location" },
  { key: "supplierName", label: "Supplier" },
  { key: "purchaseDate", label: "Purchase date" },
  { key: "notes", label: "Notes" }
] as const;

export type OpeningStockFieldKey = (typeof OPENING_STOCK_FIELDS)[number]["key"];

/** How many rows one import may carry. Mirrors the server's own cap. */
export const OPENING_STOCK_MAX_ROWS = 500;

export type OpeningStockSkip = {
  rowIndex: number;
  name: string;
  /** A code, not a sentence — the words belong to the reader's language. */
  reason: "noName" | "noAmount";
};

export type OpeningStockPreviewItem = InventoryItemInput & {
  rowIndex: number;
  /** What this line is worth on the shelf, worked out by the server. */
  lineValue: number;
};

export type OpeningStockRead = {
  grid: string[][];
  width: number;
  headers: string[];
  mapping: Array<OpeningStockFieldKey | "">;
  guessedMapping: Array<OpeningStockFieldKey | "">;
  items: OpeningStockPreviewItem[];
  skipped: OpeningStockSkip[];
  maxRows: number;
};

/**
 * Asks the server what this list would become. The preview a person approves
 * and the rows that get written come out of the same call, so the screen
 * cannot promise one thing and the import do another.
 */
export async function readOpeningStock(
  workspace: WorkspaceContext,
  input: {
    text: string;
    hasHeader: boolean;
    mapping?: Array<OpeningStockFieldKey | "">;
    defaultType: InventoryTrackingType;
    typeOverrides?: Record<number, InventoryTrackingType>;
  }
) {
  return call<OpeningStockRead & { ok?: boolean }>(
    "parseOpeningStock",
    { companyId: workspace.id, ...input },
    "That list could not be read."
  );
}

// ---------------------------------------------------------------------------
// The movement ledger, stocktakes and reporting
// ---------------------------------------------------------------------------

export type MovementKind =
  | "openingStock" | "purchase" | "adjustment" | "stocktake"
  | "used" | "sold" | "removed" | "moved"
  | "returned" | "damaged" | "lost" | "wastage";

export type InventoryLossKind = "returned" | "damaged" | "lost" | "wastage";

/**
 * Stock leaving for a reason that is not a sale or a job. The reason lands in
 * the ledger, so "where did 300ml of lacquer go" has an answer.
 */
export async function recordInventoryLoss(
  workspace: WorkspaceContext,
  itemId: string,
  kind: InventoryLossKind,
  options?: { quantity?: number; note?: string; orderId?: string }
) {
  return call<{ ok?: boolean; status?: InventoryStatus; onHand?: number }>(
    "recordInventoryLoss",
    { companyId: workspace.id, itemId, kind, ...options },
    "The loss could not be recorded."
  );
}

export type InventoryMovement = {
  id: string;
  itemId: string;
  itemName: string;
  itemNumber: string;
  category: string;
  trackingType: InventoryTrackingType;
  kind: MovementKind;
  delta: number;
  unitCost: number;
  valueDelta: number;
  ref: string;
  note: string;
  at: number;
  byEmail: string;
};

export type StocktakeLine = {
  itemId: string;
  number: string;
  name: string;
  category: string;
  location: string;
  trackingType: InventoryTrackingType;
  unit: string;
  expected: number;
  unitCost: number;
  /** null means nobody has counted this yet — which is not "counted as zero". */
  counted: number | null;
  note: string;
};

export type StocktakeSummary = {
  id: string;
  number: string;
  status: "open" | "committed" | "cancelled";
  location: string;
  category: string;
  note: string;
  startedAtMs: number;
  committedAtMs: number;
  startedByEmail: string;
  lineCount: number;
  countedCount: number;
  adjustedLines: number;
  valueDelta: number;
};

export type OverPromised = {
  itemId: string;
  name: string;
  number: string;
  counted: number;
  reserved: number;
  orderIds: string[];
};

export type Stocktake = StocktakeSummary & {
  lines: StocktakeLine[];
  overPromised?: OverPromised[];
};

export type InventoryReport = {
  generatedAtMs: number;
  fromMs: number;
  toMs: number;
  valuation: {
    totalValue: number;
    onShelfCount: number;
    customerOwnedCount: number;
    byCategory: Array<{ name: string; value: number }>;
    byLocation: Array<{ name: string; value: number }>;
  };
  movement: {
    /** When the ledger starts. Before this, "nothing moved" is not a fact. */
    ledgerStartsMs: number;
    coversWholePeriod: boolean;
    lines: number;
    truncated: boolean;
    inValue: number;
    outValue: number;
    netValue: number;
    byKind: Array<{ kind: MovementKind; lines: number; delta: number; value: number }>;
  };
  lowStock: Array<{
    itemId: string; number: string; name: string;
    onHand: number; lowStockAt: number; unit: string; supplierName: string;
  }>;
  deadStock: Array<{
    itemId: string; number: string; name: string;
    category: string; value: number; idleDays: number;
  }>;
  deadStockAfterDays: number;
};

export async function startStocktake(
  workspace: WorkspaceContext,
  input: { location?: string; category?: string; note?: string }
) {
  return call<{ ok?: boolean; stocktakeId?: string; number?: string; lines?: number }>(
    "startStocktake",
    { companyId: workspace.id, ...input },
    "The count could not be started."
  );
}

export async function saveStocktakeCounts(
  workspace: WorkspaceContext,
  stocktakeId: string,
  counts: Record<string, number | null>,
  notes: Record<string, string> = {}
) {
  return call<{ ok?: boolean }>(
    "saveStocktakeCounts",
    { companyId: workspace.id, stocktakeId, counts, notes },
    "The counts could not be saved."
  );
}

export async function commitStocktake(workspace: WorkspaceContext, stocktakeId: string) {
  return call<{
    ok?: boolean; adjusted?: number; counted?: number; total?: number;
    valueDelta?: number; overPromised?: OverPromised[];
  }>(
    "commitStocktake",
    { companyId: workspace.id, stocktakeId },
    "The count could not be applied."
  );
}

export async function cancelStocktake(workspace: WorkspaceContext, stocktakeId: string) {
  return call<{ ok?: boolean }>(
    "cancelStocktake",
    { companyId: workspace.id, stocktakeId },
    "The count could not be cancelled."
  );
}

export async function listStocktakes(workspace: WorkspaceContext) {
  return call<{ ok?: boolean; stocktakes?: StocktakeSummary[] }>(
    "listStocktakes",
    { companyId: workspace.id },
    "The counts could not be loaded."
  );
}

export async function getStocktake(workspace: WorkspaceContext, stocktakeId: string) {
  return call<{ ok?: boolean; stocktake?: Stocktake }>(
    "getStocktake",
    { companyId: workspace.id, stocktakeId },
    "That count could not be loaded."
  );
}

export async function getInventoryReport(
  workspace: WorkspaceContext,
  range: { fromMs?: number; toMs?: number } = {}
) {
  return call<InventoryReport & { ok?: boolean }>(
    "getInventoryReport",
    { companyId: workspace.id, ...range },
    "The report could not be built."
  );
}

export async function listInventoryMovements(workspace: WorkspaceContext, itemId?: string) {
  return call<{ ok?: boolean; movements?: InventoryMovement[] }>(
    "listInventoryMovements",
    { companyId: workspace.id, itemId: itemId || "" },
    "The movements could not be loaded."
  );
}

// ---------------------------------------------------------------------------
// Item photos
//
// Stored as storage paths, not URLs: a path is permanent where a download URL
// expires. The item's `photos` array carries the paths; screens resolve them
// to URLs when they draw.
// ---------------------------------------------------------------------------

import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/firebase/client";

export const INVENTORY_PHOTO_LIMIT = 12;

function safePhotoName(name: string) {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
  return cleaned || "photo.jpg";
}

/** Uploads one photo and returns the storage path to put in `photos`. */
export async function uploadInventoryPhoto(
  workspace: WorkspaceContext,
  itemId: string,
  file: File
) {
  const path = `companies/${workspace.id}/inventory_photos/${itemId}/${Date.now()}-${safePhotoName(file.name)}`;
  await uploadBytes(storageRef(storage, path), file);
  return path;
}

export async function inventoryPhotoUrl(path: string) {
  return getDownloadURL(storageRef(storage, path));
}

export async function deleteInventoryPhoto(path: string) {
  await deleteObject(storageRef(storage, path)).catch(() => undefined);
}
