import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

// Mirrors functions/inventory.js. The money rules live on the server — this file
// only carries shapes and the call plumbing, so there is one place that decides
// what a thing cost.

export type InventoryTrackingType = "unique" | "quantity";
export type InventoryStatus = "available" | "reserved" | "incoming" | "used" | "sold" | "archived";
export type InventoryOwnership = "business" | "customer";

export const INVENTORY_STATUSES: InventoryStatus[] = [
  "available", "reserved", "incoming", "used", "sold", "archived"
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
