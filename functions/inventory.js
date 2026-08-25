"use strict";

// Inventory: the physical things a workspace owns, what was paid for them, and
// which order each one is committed to.
//
// Data model (all under the workspace, server-written):
//   companies/{companyId}/inventoryItems/{itemId}
//
// Three decisions are load-bearing and easy to get wrong later:
//
// 1. TRACKING TYPE IS THE USER'S CHOICE, NOT THE CATEGORY'S.
//    A generic dial blank is stock you count; a Rolex 1601 silver dial is one
//    physical object with its own serial, condition, photos and acquisition
//    cost. Both are "dials". Deriving the type from the category would make the
//    second kind impossible to record honestly, so the type is stored per item.
//
// 2. PURCHASE PRICE AND ADDITIONAL COSTS ARE SEPARATE FIELDS.
//    Internally a workspace wants to know what a watch really cost: price plus
//    service plus shipping. But under the UK VAT margin scheme the purchase
//    price used to compute the margin is the price paid for the item alone —
//    repairs, parts and overheads do not go into it. Blending them into one
//    "cost" would destroy the number HMRC asks for, and no amount of later
//    reporting could recover it. So they are stored apart and only summed for
//    display. Whether an item qualifies for the margin scheme is a question for
//    the workspace's accountant; nothing here assumes it.
//
// 3. CUSTOMER-OWNED THINGS ARE NOT STOCK.
//    A customer's ring sitting in the safe is physically present and financially
//    none of the workspace's business. Ownership is recorded, customer-owned
//    items are valued at zero, and they never enter inventory value. The repair
//    intake card remains the record of the customer's own item; this flag exists
//    so a workspace can find such a thing by location without it ever being
//    counted as an asset.
//
// Bank transactions deliberately do NOT create inventory. A bank row carries a
// merchant, a date and a total — not what was bought, how many, or what the
// shipping was. Purchases (a later phase) are the object that carries that, and
// a bank transaction is matched to one rather than turned into one.

const REGION = "europe-west2";

const TRACKING_TYPES = ["unique", "quantity"];
const ITEM_STATUSES = ["available", "reserved", "incoming", "used", "sold", "archived"];
const OWNERSHIPS = ["business", "customer"];
const DEFAULT_CATEGORIES = [
  "Watches", "Dials", "Movements", "Bracelets", "Straps",
  "Parts", "Consumables", "Packaging", "Tools", "Other"
];

// Where an item may go next. Written down rather than left to the client so a
// stale screen cannot walk an item backwards out of "sold".
const STATUS_TRANSITIONS = {
  incoming: ["available", "archived"],
  available: ["reserved", "used", "sold", "incoming", "archived"],
  reserved: ["available", "used", "sold", "archived"],
  used: ["available", "archived"],
  sold: ["archived"],
  archived: ["available"]
};

function createInventoryFunctions({
  admin,
  onCall,
  HttpsError,
  requireWorkspace,
  cleanText,
  roundMoney
}) {
  const db = () => admin.firestore();
  const itemsRef = (companyId) =>
    db().collection("companies").doc(String(companyId)).collection("inventoryItems");
  const companyRef = (companyId) => db().collection("companies").doc(String(companyId));

  const clean = (value, fallback = "", max = 200) => cleanText(value, fallback, max);

  function cleanMoney(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return roundMoney(Math.max(0, number));
  }

  function cleanQuantity(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return 0;
    // Two decimals covers millilitres and grams without inviting float noise.
    return Math.round(number * 100) / 100;
  }

  function cleanAdditionalCosts(value) {
    const rows = Array.isArray(value) ? value.slice(0, 20) : [];
    return rows
      .map((row) => ({
        label: clean(row && row.label, "", 60),
        amount: cleanMoney(row && row.amount)
      }))
      .filter((row) => row.label || row.amount > 0);
  }

  // The one place the money is added up, so every screen agrees.
  function costSummary(purchasePrice, additionalCosts) {
    const price = cleanMoney(purchasePrice);
    const extras = cleanAdditionalCosts(additionalCosts);
    const extrasTotal = roundMoney(extras.reduce((sum, row) => sum + row.amount, 0));
    return {
      purchasePrice: price,
      additionalCosts: extras,
      additionalCostsTotal: extrasTotal,
      internalTotalCost: roundMoney(price + extrasTotal)
    };
  }

  function normalizeItemInput(input = {}, existing = null) {
    const trackingType = TRACKING_TYPES.includes(String(input.trackingType || ""))
      ? String(input.trackingType)
      : (existing ? existing.trackingType : "unique");
    const ownership = OWNERSHIPS.includes(String(input.ownership || ""))
      ? String(input.ownership)
      : (existing ? existing.ownership : "business");
    const costs = costSummary(input.purchasePrice, input.additionalCosts);

    const isUnique = trackingType === "unique";
    const quantity = isUnique
      ? { onHand: 1, reserved: 0, incoming: 0, unit: "" }
      : {
          onHand: cleanQuantity(input.onHand),
          reserved: cleanQuantity(input.reservedQuantity),
          incoming: cleanQuantity(input.incomingQuantity),
          unit: clean(input.unit, "", 12)
        };

    return {
      name: clean(input.name, "", 160),
      category: clean(input.category, "Other", 60) || "Other",
      trackingType,
      ownership,
      // A customer's property is never an asset of the business, whatever price
      // happens to be typed in.
      valuationCost: ownership === "customer" ? 0 : costs.internalTotalCost,
      brand: clean(input.brand, "", 80),
      model: clean(input.model, "", 80),
      reference: clean(input.reference, "", 80),
      serialNumber: clean(input.serialNumber, "", 80),
      year: clean(input.year, "", 12),
      condition: clean(input.condition, "", 40),
      description: clean(input.description, "", 2000),
      sku: clean(input.sku, "", 60),
      location: clean(input.location, "", 80),
      supplierName: clean(input.supplierName, "", 160),
      purchaseDate: clean(input.purchaseDate, "", 40),
      currentValueEst: cleanMoney(input.currentValueEst),
      lowStockAt: isUnique ? 0 : cleanQuantity(input.lowStockAt),
      notes: clean(input.notes, "", 2000),
      photos: (Array.isArray(input.photos) ? input.photos.slice(0, 12) : [])
        .map((url) => clean(url, "", 600))
        .filter(Boolean),
      quantity,
      ...costs
    };
  }

  // Display numbers are sequential per workspace (INV-00147), assigned in the
  // same transaction that writes the item so two devices cannot land on one.
  async function nextItemNumber(tx, companyId) {
    const ref = companyRef(companyId);
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() || {} : {};
    const next = (Number(data.inventoryCounter) || 0) + 1;
    tx.set(ref, { inventoryCounter: next }, { merge: true });
    return `INV-${String(next).padStart(5, "0")}`;
  }

  async function requireInventoryAccess(request, { write = false } = {}) {
    const context = await requireWorkspace(request, { area: "orders", write });
    return context;
  }

  const saveInventoryItem = onCall({ region: REGION }, async (request) => {
    const { uid, email, companyId } = await requireInventoryAccess(request, { write: true });
    const itemId = clean(request.data && request.data.itemId, "", 80);
    const input = request.data && request.data.item;
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new HttpsError("invalid-argument", "item is required.");
    }
    const now = Date.now();

    const result = await db().runTransaction(async (tx) => {
      let ref;
      let existing = null;
      if (itemId) {
        ref = itemsRef(companyId).doc(itemId);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError("not-found", "Inventory item not found.");
        existing = snap.data() || {};
      } else {
        ref = itemsRef(companyId).doc();
      }

      const fields = normalizeItemInput(input, existing);
      if (!fields.name) throw new HttpsError("invalid-argument", "An item name is required.");

      const number = existing ? existing.number : await nextItemNumber(tx, companyId);
      const status = existing ? existing.status : "available";

      tx.set(ref, {
        ...fields,
        companyId,
        number,
        status,
        reservedForOrderId: existing ? existing.reservedForOrderId || "" : "",
        source: existing ? existing.source || "manual" : clean(input.source, "manual", 40),
        createdAtMs: existing ? existing.createdAtMs || now : now,
        createdByUid: existing ? existing.createdByUid || uid : uid,
        createdByEmail: existing ? existing.createdByEmail || email : email,
        updatedAtMs: now,
        updatedByUid: uid
      }, { merge: true });

      return { itemId: ref.id, number };
    });

    return { ok: true, ...result };
  });

  const setInventoryItemStatus = onCall({ region: REGION }, async (request) => {
    const { uid, companyId } = await requireInventoryAccess(request, { write: true });
    const itemId = clean(request.data && request.data.itemId, "", 80);
    const status = clean(request.data && request.data.status, "", 20);
    const orderId = clean(request.data && request.data.orderId, "", 200);
    if (!itemId || !ITEM_STATUSES.includes(status)) {
      throw new HttpsError("invalid-argument", "itemId and a valid status are required.");
    }

    const ref = itemsRef(companyId).doc(itemId);
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError("not-found", "Inventory item not found.");
      const item = snap.data() || {};
      const from = ITEM_STATUSES.includes(item.status) ? item.status : "available";
      if (from !== status && !(STATUS_TRANSITIONS[from] || []).includes(status)) {
        throw new HttpsError(
          "failed-precondition",
          `An item that is ${from} cannot become ${status}.`
        );
      }
      tx.set(ref, {
        status,
        // Reserving points at an order; anything else lets it go.
        reservedForOrderId: status === "reserved" ? orderId : "",
        updatedAtMs: Date.now(),
        updatedByUid: uid
      }, { merge: true });
    });

    return { ok: true, status };
  });

  const deleteInventoryItem = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireInventoryAccess(request, { write: true });
    const itemId = clean(request.data && request.data.itemId, "", 80);
    if (!itemId) throw new HttpsError("invalid-argument", "itemId is required.");
    const ref = itemsRef(companyId).doc(itemId);
    const snap = await ref.get();
    if (!snap.exists) return { ok: true };
    const item = snap.data() || {};
    // Sold and used items are the record of what happened. Archiving keeps that
    // record; deleting it would leave an order pointing at nothing.
    if (["sold", "used"].includes(String(item.status || ""))) {
      throw new HttpsError(
        "failed-precondition",
        "An item that has been sold or used can be archived, not deleted."
      );
    }
    await ref.delete();
    return { ok: true };
  });

  const listInventoryItems = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireInventoryAccess(request);
    const limit = Math.min(Math.max(Number(request.data && request.data.limit) || 200, 1), 500);
    const snap = await itemsRef(companyId).orderBy("updatedAtMs", "desc").limit(limit).get();
    return {
      ok: true,
      items: snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) })),
      categories: DEFAULT_CATEGORIES
    };
  });

  // The header figures on the Inventory overview. Counted here rather than on
  // the client so every platform shows the same number.
  const getInventorySummary = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireInventoryAccess(request);
    const snap = await itemsRef(companyId).limit(2000).get();

    const summary = {
      totalValue: 0, uniqueCount: 0, uniqueValue: 0,
      quantityCount: 0, quantityValue: 0,
      reservedValue: 0, reservedCount: 0,
      incomingCount: 0, incomingValue: 0,
      lowStockCount: 0, customerOwnedCount: 0
    };

    snap.docs.forEach((doc) => {
      const item = doc.data() || {};
      const status = String(item.status || "available");
      if (status === "archived") return;
      if (String(item.ownership) === "customer") {
        summary.customerOwnedCount += 1;
        return; // never an asset of this business
      }
      const value = Number(item.valuationCost) || 0;
      const isUnique = String(item.trackingType) === "unique";
      const onHand = isUnique ? 1 : Number((item.quantity || {}).onHand) || 0;
      const lineValue = isUnique ? value : roundMoney(value * onHand);

      if (["sold", "used"].includes(status)) return; // no longer on the shelf

      if (status === "incoming") {
        summary.incomingCount += 1;
        summary.incomingValue = roundMoney(summary.incomingValue + lineValue);
        return;
      }

      summary.totalValue = roundMoney(summary.totalValue + lineValue);
      if (isUnique) {
        summary.uniqueCount += 1;
        summary.uniqueValue = roundMoney(summary.uniqueValue + lineValue);
      } else {
        summary.quantityCount += 1;
        summary.quantityValue = roundMoney(summary.quantityValue + lineValue);
        const lowAt = Number(item.lowStockAt) || 0;
        if (lowAt > 0 && onHand <= lowAt) summary.lowStockCount += 1;
      }
      if (status === "reserved") {
        summary.reservedCount += 1;
        summary.reservedValue = roundMoney(summary.reservedValue + lineValue);
      }
    });

    return { ok: true, summary };
  });

  // Opening stock: what is on the shelf today, without reconstructing years of
  // bank history to justify it. Items land marked so a later reconciliation can
  // tell them apart from things bought through NivaDesk.
  const importOpeningStock = onCall({ region: REGION }, async (request) => {
    const { uid, email, companyId } = await requireInventoryAccess(request, { write: true });
    const rows = Array.isArray(request.data && request.data.items)
      ? request.data.items.slice(0, 500)
      : [];
    if (rows.length === 0) throw new HttpsError("invalid-argument", "No items to import.");
    const openingDate = clean(request.data && request.data.openingDate, "", 40);
    const now = Date.now();

    let written = 0;
    // Chunked so one oversized import cannot exceed a transaction's limits.
    for (let start = 0; start < rows.length; start += 100) {
      const chunk = rows.slice(start, start + 100);
      // eslint-disable-next-line no-await-in-loop
      await db().runTransaction(async (tx) => {
        const ref = companyRef(companyId);
        const snap = await tx.get(ref);
        let counter = Number((snap.exists ? snap.data() || {} : {}).inventoryCounter) || 0;
        for (const row of chunk) {
          const fields = normalizeItemInput(row, null);
          if (!fields.name) continue;
          counter += 1;
          tx.set(itemsRef(companyId).doc(), {
            ...fields,
            companyId,
            number: `INV-${String(counter).padStart(5, "0")}`,
            status: "available",
            reservedForOrderId: "",
            source: "openingStock",
            openingStockDate: openingDate,
            createdAtMs: now,
            createdByUid: uid,
            createdByEmail: email,
            updatedAtMs: now,
            updatedByUid: uid
          });
          written += 1;
        }
        tx.set(ref, { inventoryCounter: counter }, { merge: true });
      });
    }

    return { ok: true, imported: written };
  });

  return {
    saveInventoryItem,
    setInventoryItemStatus,
    deleteInventoryItem,
    listInventoryItems,
    getInventorySummary,
    importOpeningStock,
    _internal: { normalizeItemInput, costSummary, STATUS_TRANSITIONS, DEFAULT_CATEGORIES }
  };
}

module.exports = { createInventoryFunctions };
