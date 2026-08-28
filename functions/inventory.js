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
const ITEM_STATUSES = ["available", "partiallyReserved", "reserved", "incoming", "used", "sold", "removed", "archived"];
const OWNERSHIPS = ["business", "customer"];
const DEFAULT_CATEGORIES = [
  "Watches", "Dials", "Movements", "Bracelets", "Straps",
  "Parts", "Consumables", "Packaging", "Tools", "Other"
];

// Categories used to be this list and nothing else, which meant a jeweller was
// stuck filing rings under "Watches". They are now the workspace's own, kept in
// companySettings as an ordered list.
//
// An item still stores its category as the TITLE, not an id. That keeps a CSV
// export readable and an import matchable by the word a human typed — so a
// rename has to rewrite the items that used the old title, which is exactly
// what renameCategoryOnItems below does. The id exists only so the settings
// screen can follow a row across a rename.
const DEFAULT_CATEGORY_ICONS = {
  Watches: "⌚",
  Dials: "◎",
  Movements: "⚙",
  Bracelets: "➰",
  Straps: "➰",
  Parts: "⚒",
  Consumables: "⚗",
  Packaging: "▧",
  Tools: "✄",
  Other: "▪"
};

const CATEGORY_FALLBACK = "Other";
const MAX_CATEGORIES = 40;

// Where an item may go next. Written down rather than left to the client so a
// stale screen cannot walk an item backwards out of "sold".
const STATUS_TRANSITIONS = {
  incoming: ["available", "removed", "archived"],
  available: ["reserved", "partiallyReserved", "used", "sold", "incoming", "removed", "archived"],
  partiallyReserved: ["available", "reserved", "used", "sold", "removed", "archived"],
  reserved: ["available", "partiallyReserved", "used", "sold", "removed", "archived"],
  used: ["available", "archived"],
  sold: ["archived"],
  // A stocktake can write "removed" (a unique item counted as gone); an
  // accidental removal must be restorable.
  removed: ["available", "archived"],
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

  // A per-unit cost can legitimately be finer than a penny: £6.25 of shipping
  // spread over 20 pieces is £0.3125 each, and rounding that to £0.31 loses 5p
  // off the line. Four places keeps the arithmetic exact; screens still format
  // to two.
  /**
   * A movement is signed: stock arrives and stock leaves. roundUnitMoney floors
   * at zero because a cost cannot be negative, which is right for money and
   * quietly wrong for a delta — using it here once swallowed every outward
   * movement, so the ledger only ever showed things arriving.
   */
  function roundSigned(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round(number * 10000) / 10000;
  }

  function roundUnitMoney(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round(Math.max(0, number) * 10000) / 10000;
  }

  function cleanAdditionalCosts(value) {
    const rows = Array.isArray(value) ? value.slice(0, 20) : [];
    return rows
      .map((row) => ({
        label: clean(row && row.label, "", 60),
        amount: roundUnitMoney(row && row.amount)
      }))
      .filter((row) => row.label || row.amount > 0);
  }

  // The one place the money is added up, so every screen agrees.
  function costSummary(purchasePrice, additionalCosts) {
    const price = cleanMoney(purchasePrice);
    const extras = cleanAdditionalCosts(additionalCosts);
    const extrasTotal = roundUnitMoney(extras.reduce((sum, row) => sum + row.amount, 0));
    return {
      purchasePrice: price,
      additionalCosts: extras,
      additionalCostsTotal: extrasTotal,
      internalTotalCost: roundUnitMoney(price + extrasTotal)
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
      // Photos are storage paths, not URLs — a path is permanent, a download
      // URL expires. A form that does not send the field leaves the photos
      // alone; sending an empty array is how they are deliberately cleared.
      // Without that distinction, every name edit would silently wipe them.
      photos: input.photos === undefined && existing
        ? (Array.isArray(existing.photos) ? existing.photos : [])
        : (Array.isArray(input.photos) ? input.photos.slice(0, 12) : [])
            .map((path) => clean(path, "", 600))
            .filter(Boolean),
      // Key-present semantics, same as customer segments: a form that does not
      // send tags leaves them alone; sending an empty array clears them.
      tags: input.tags === undefined && existing
        ? (Array.isArray(existing.tags) ? existing.tags : [])
        : (Array.isArray(input.tags) ? input.tags.slice(0, 20) : [])
            .map((tag) => clean(tag, "", 30))
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

  // -------------------------------------------------------------------------
  // The movement ledger
  //
  // An inventory that only knows what it has today can answer "what is on the
  // shelf" and nothing else. It cannot say what went out last month, which
  // parts have not moved in a year, or why the count changed — and those are
  // the questions a workshop actually asks at year end.
  //
  // So every change to a quantity writes a line here: what moved, by how much,
  // what it was worth, and what caused it. The lines are only ever appended;
  // correcting a mistake writes another line rather than editing this one, the
  // way a ledger works and a spreadsheet does not.
  // -------------------------------------------------------------------------

  const movementsRef = (companyId) =>
    db().collection("companies").doc(String(companyId)).collection("inventoryMovements");

  const MOVEMENT_KINDS = [
    "openingStock",   // counted in when the workspace started using inventory
    "purchase",       // a received purchase put it on the shelf
    "adjustment",     // someone corrected the number by hand
    "stocktake",      // a physical count corrected it
    "used",           // consumed on a job
    "sold",           // sold on
    "removed",        // archived or deleted
    "moved",          // relocated — zero quantity change, but the trail matters
    "returned",       // sent back to the supplier
    "damaged",        // broken — the reason matters, not just the number
    "lost",           // gone without explanation
    "wastage"         // normal consumption loss (fire)
  ];

  /**
   * Appends one line to the ledger. Takes the writer (a transaction or a batch)
   * so the movement lands with the change that caused it — a stock figure that
   * moved without a line, or a line without the move, would both be lies.
   */
  function recordMovement(writer, companyId, {
    item, itemId, kind, delta, unitCost, at, uid, email, ref = "", note = ""
  }) {
    if (!MOVEMENT_KINDS.includes(kind)) return;
    const amount = roundSigned(delta);
    // A relocation changes no quantity but must still leave a trail — the
    // report's ask ("old and new location visible in History"). Every other
    // zero-delta line is still dropped as noise.
    if (amount === 0 && kind !== "moved") return;
    const cost = roundUnitMoney(unitCost);
    // Stamped on the item at the same moment, so "nothing has happened to this
    // for six months" is a fact the report can read without walking the ledger.
    // Deliberately NOT stamped for "moved": shuffling a box between shelves
    // must not hide the item from the dead-stock report.
    if (itemId && kind !== "moved") {
      writer.set(itemsRef(companyId).doc(String(itemId)),
        { lastMovementAtMs: Number(at) || Date.now() }, { merge: true });
    }
    writer.set(movementsRef(companyId).doc(), {
      companyId,
      itemId: String(itemId || ""),
      itemName: clean(item && item.name, "", 160),
      itemNumber: clean(item && item.number, "", 40),
      category: clean(item && item.category, "", 60),
      trackingType: clean(item && item.trackingType, "unique", 20),
      kind,
      delta: amount,
      unitCost: cost,
      // What this movement did to the value on the shelf.
      valueDelta: roundMoney(cost * amount),
      ref: clean(ref, "", 200),
      note: clean(note, "", 300),
      at: Number(at) || Date.now(),
      byUid: String(uid || ""),
      byEmail: String(email || "")
    });
  }

  // The write itself, callable-free: the ChatGPT tool creates items through the
  // same transaction (numbering, ledger movement, reservations) rather than a
  // second, thinner path that would drift from this one.
  async function saveItemForWorkspace({ companyId, uid, email, itemId = "", input }) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new HttpsError("invalid-argument", "item is required.");
    }
    const now = Date.now();

    return db().runTransaction(async (tx) => {
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
      const heldReservations = existing ? cleanReservations(existing.reservations) : [];
      const heldReserved = fields.trackingType === "unique"
        ? 0
        : roundMoney(heldReservations.reduce((sum, row) => sum + row.quantity, 0));

      tx.set(ref, {
        ...fields,
        companyId,
        number,
        status,
        reservedForOrderId: existing ? existing.reservedForOrderId || "" : "",
        // The reservations are the record of what orders are holding; the
        // reserved count is only a running total of them. An edit form does not
        // send either, so both are carried over rather than rebuilt from input —
        // otherwise saving a name change would hand out stock twice.
        reservations: heldReservations,
        reservedOrderIds: heldReservations.map((row) => row.orderId),
        quantity: { ...fields.quantity, reserved: heldReserved },
        source: existing ? existing.source || "manual" : clean(input.source, "manual", 40),
        createdAtMs: existing ? existing.createdAtMs || now : now,
        createdByUid: existing ? existing.createdByUid || uid : uid,
        createdByEmail: existing ? existing.createdByEmail || email : email,
        updatedAtMs: now,
        updatedByUid: uid
      }, { merge: true });

      // A new item arriving, or someone correcting a count by hand, both move
      // stock. The ledger records the change, not the resulting number.
      const before = existing
        ? (existing.trackingType === "unique" ? 1 : cleanQuantity((existing.quantity || {}).onHand))
        : 0;
      const after = fields.trackingType === "unique" ? 1 : fields.quantity.onHand;
      recordMovement(tx, companyId, {
        item: { ...fields, number },
        itemId: ref.id,
        kind: existing ? "adjustment" : "openingStock",
        delta: roundSigned(after - before),
        unitCost: fields.valuationCost,
        at: now, uid, email,
        note: existing ? "Corrected by hand" : ""
      });

      // Relocations get their own ledger line (from → to), otherwise a move
      // is invisible in History.
      const previousLocation = existing ? clean(existing.location, "", 80) : "";
      if (existing && previousLocation !== fields.location) {
        recordMovement(tx, companyId, {
          item: { ...fields, number },
          itemId: ref.id,
          kind: "moved",
          delta: 0,
          unitCost: 0,
          at: now, uid, email,
          note: `${previousLocation || "—"} → ${fields.location || "—"}`
        });
      }

      return { itemId: ref.id, number };
    });
  }

  const saveInventoryItem = onCall({ region: REGION }, async (request) => {
    const { uid, email, companyId } = await requireInventoryAccess(request, { write: true });
    const itemId = clean(request.data && request.data.itemId, "", 80);
    const result = await saveItemForWorkspace({
      companyId,
      uid,
      email,
      itemId,
      input: request.data && request.data.item
    });
    return { ok: true, ...result };
  });

  const setInventoryItemStatus = onCall({ region: REGION }, async (request) => {
    const { uid, email, companyId } = await requireInventoryAccess(request, { write: true });
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
      const now = Date.now();
      tx.set(ref, {
        status,
        // Reserving points at an order; anything else lets it go.
        reservedForOrderId: status === "reserved" ? orderId : "",
        updatedAtMs: now,
        updatedByUid: uid
      }, { merge: true });

      // Only some status changes move stock. Reserving does not — the part is
      // still on the shelf, just spoken for. Using, selling or archiving does.
      const LEAVES_THE_SHELF = { used: "used", sold: "sold", removed: "removed", archived: "removed" };
      const wasOnShelf = !Object.keys(LEAVES_THE_SHELF).includes(from);
      const nowOff = Object.keys(LEAVES_THE_SHELF).includes(status);
      if (wasOnShelf !== nowOff) return;
      const onHand = String(item.trackingType) === "unique"
        ? 1
        : cleanQuantity((item.quantity || {}).onHand);
      recordMovement(tx, companyId, {
        item, itemId,
        kind: nowOff ? LEAVES_THE_SHELF[status] : "adjustment",
        delta: nowOff ? -onHand : onHand,
        unitCost: item.valuationCost,
        at: now, uid, email,
        ref: orderId,
        note: nowOff ? "" : "Put back on the shelf"
      });
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
    // Cursor pagination: a workshop past 500 items used to fall silently off
    // the end of the list. The cursor is the last row's sort key; the document
    // id breaks ties so two items saved in the same millisecond cannot make a
    // row repeat or vanish between pages.
    const cursor = request.data && request.data.cursor && typeof request.data.cursor === "object"
      ? request.data.cursor
      : null;
    // Both orderings descend: mixing directions with __name__ would demand a
    // composite index, and matching them is what Firestore does implicitly.
    let query = itemsRef(companyId)
      .orderBy("updatedAtMs", "desc")
      .orderBy(admin.firestore.FieldPath.documentId(), "desc");
    if (cursor && Number.isFinite(Number(cursor.updatedAtMs)) && cursor.id) {
      query = query.startAfter(Number(cursor.updatedAtMs), String(cursor.id));
    }
    const snap = await query.limit(limit).get();
    const docs = snap.docs;
    const last = docs.length > 0 ? docs[docs.length - 1] : null;
    const { categories: workspaceCategories, defaultCategory } = await loadCategories(companyId);
    return {
      ok: true,
      items: docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) })),
      categories: workspaceCategories.filter((row) => !row.archived).map((row) => row.title),
      categoryDetails: workspaceCategories,
      defaultCategory,
      hasMore: docs.length === limit,
      cursor: last && docs.length === limit
        ? { updatedAtMs: Number((last.data() || {}).updatedAtMs) || 0, id: last.id }
        : null
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

      if (["sold", "used", "removed"].includes(status)) return; // no longer on the shelf

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
      if (status === "reserved" || status === "partiallyReserved") {
        summary.reservedCount += 1;
        // Only what is actually promised counts as reserved value — 3 of 10
        // held must not read as all 10.
        const reservedQty = isUnique ? 1 : Number((item.quantity || {}).reserved) || 0;
        summary.reservedValue = roundMoney(summary.reservedValue + (isUnique ? lineValue : roundMoney(value * reservedQty)));
      }
    });

    // Monthly change, from the ledger: the net value that moved in the last 30
    // days against the value that was there before it. Honest by construction:
    // suppressed (changeAvailable=false) when the ledger is younger than the
    // window or the read hit its cap — "we were not watching yet" must never
    // print as "+0.0%". Pure revaluations never enter the ledger, so a
    // price-only edit does not move this number.
    const windowMs = 30 * 24 * 60 * 60 * 1000;
    const fromMs = Date.now() - windowMs;
    try {
      const [windowSnap, earliestSnap] = await Promise.all([
        movementsRef(companyId).where("at", ">=", fromMs).limit(3000).get(),
        movementsRef(companyId).orderBy("at", "asc").limit(1).get()
      ]);
      const ledgerStartsMs = earliestSnap.empty
        ? 0
        : Number((earliestSnap.docs[0].data() || {}).at) || 0;
      let netValue30d = 0;
      windowSnap.docs.forEach((doc) => {
        netValue30d += Number((doc.data() || {}).valueDelta) || 0;
      });
      netValue30d = roundMoney(netValue30d);
      const baseline = roundMoney(summary.totalValue - netValue30d);
      const changeAvailable = ledgerStartsMs > 0
        && ledgerStartsMs <= fromMs
        && windowSnap.size < 3000
        && baseline > 0;
      summary.monthlyChange = {
        available: changeAvailable,
        netValue30d,
        pct: changeAvailable ? Math.round((netValue30d / baseline) * 1000) / 10 : 0,
        ledgerStartsMs
      };
    } catch (error) {
      console.warn("inventory monthly change failed:", error && error.message ? error.message : error);
      summary.monthlyChange = { available: false, netValue30d: 0, pct: 0, ledgerStartsMs: 0 };
    }

    return { ok: true, summary };
  });

  // Opening stock: what is on the shelf today, without reconstructing years of
  // bank history to justify it. Items land marked so a later reconciliation can
  // tell them apart from things bought through NivaDesk.
  // -------------------------------------------------------------------------
  // Reading a spreadsheet
  //
  // Splitting delimited text is fiddly in exactly the ways that bite: a name
  // like `Strap, brown` inside quotes, a doubled quote meaning a literal one, a
  // paste out of Excel that is tab-separated, a European export using
  // semicolons and commas for decimals. Writing that three times — once per
  // platform — is three chances for one of them to be subtly wrong, so it is
  // written once, here, and every client asks.
  // -------------------------------------------------------------------------

  const OPENING_STOCK_ALIASES = [
    ["name", ["name", "item", "item name", "description", "product", "title"]],
    ["trackingType", ["type", "tracking", "tracking type", "kind"]],
    ["category", ["category", "group"]],
    ["brand", ["brand", "make", "manufacturer"]],
    ["model", ["model"]],
    ["reference", ["reference", "ref", "ref."]],
    ["serialNumber", ["serial", "serial number", "serial no", "serialno"]],
    ["sku", ["sku", "code", "part number", "part no", "barcode", "ean", "upc"]],
    ["onHand", ["on hand", "onhand", "qty", "quantity", "stock", "count", "amount"]],
    ["unit", ["unit", "units", "uom"]],
    ["lowStockAt", ["reorder at", "reorder", "min", "minimum", "low stock"]],
    ["purchasePrice", ["purchase price", "price", "cost", "unit price", "unit cost", "buy price"]],
    ["location", ["location", "where", "shelf", "bin", "storage"]],
    ["supplierName", ["supplier", "vendor", "from", "bought from"]],
    ["purchaseDate", ["purchase date", "date", "bought", "acquired"]],
    ["notes", ["notes", "note", "comment", "comments"]],
    // Listed after name on purpose: "description" maps to the name column when
    // the sheet has no name header, and to its own field when it has both.
    ["ownership", ["ownership", "owner", "owned by"]],
    ["condition", ["condition", "state", "grade"]],
    ["year", ["year", "yr"]],
    ["description", ["description", "details", "desc", "long description"]]
  ];

  function splitDelimited(text) {
    const source = String(text || "").replace(/\r\n?/g, "\n").trim();
    if (!source) return [];

    // The delimiter is detected from the header line rather than assumed.
    const firstLine = source.split("\n")[0];
    const candidates = [
      ["\t", (firstLine.match(/\t/g) || []).length],
      [",", (firstLine.match(/,/g) || []).length],
      [";", (firstLine.match(/;/g) || []).length]
    ].sort((a, b) => b[1] - a[1]);
    const delimiter = candidates[0][1] > 0 ? candidates[0][0] : ",";

    const rows = [];
    let cell = "";
    let row = [];
    let quoted = false;

    for (let i = 0; i < source.length; i += 1) {
      const char = source[i];
      if (quoted) {
        if (char === '"') {
          if (source[i + 1] === '"') { cell += '"'; i += 1; }
          else quoted = false;
        } else cell += char;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === delimiter) { row.push(cell); cell = ""; continue; }
      if (char === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
      cell += char;
    }
    row.push(cell);
    rows.push(row);

    return rows
      .map((cells) => cells.map((value) => value.trim()))
      .filter((cells) => cells.some((value) => value !== ""));
  }

  function guessMapping(headers) {
    const used = new Set();
    return headers.map((header) => {
      const needle = String(header || "").trim().toLowerCase()
        .replace(/[_-]+/g, " ").replace(/\s+/g, " ");
      if (!needle) return "";
      const match = OPENING_STOCK_ALIASES.find(
        ([key, aliases]) => !used.has(key) && aliases.includes(needle)
      );
      if (!match) return "";
      used.add(match[0]);
      return match[0];
    });
  }

  /**
   * Money and counts out of a spreadsheet arrive as "£1,250.00" or "1.250,00".
   * Whichever separator comes last is the decimal point; the other groups.
   */
  function spreadsheetNumber(raw) {
    const cleaned = String(raw == null ? "" : raw).replace(/[^\d.,-]/g, "").trim();
    if (!cleaned) return 0;
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    const normalized = lastComma > lastDot
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
    const value = Number(normalized);
    return Number.isFinite(value) ? value : 0;
  }

  /**
   * Answers one question: what would this list become?
   *
   * The preview a person approves and the rows that get written come out of
   * this same call, so the screen cannot promise one thing and the import do
   * another. Skip reasons come back as codes — the words belong to whichever
   * language the client is in.
   */
  const parseOpeningStock = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireInventoryAccess(request);
    const data = request.data || {};
    // 400k of text is far more than 500 rows of stock and keeps one paste from
    // becoming a denial of service.
    const text = String(data.text || "").slice(0, 400000);
    const rows = splitDelimited(text);
    const width = rows.length > 0 ? Math.max(...rows.map((cells) => cells.length)) : 0;
    // Ragged rows are normal in exports; pad so every client indexes safely.
    const grid = rows.map((cells) => {
      const padded = cells.slice(0, width);
      while (padded.length < width) padded.push("");
      return padded;
    });
    const headers = grid.length > 0 ? grid[0] : [];
    const guessed = guessMapping(headers);

    const hasHeader = data.hasHeader !== false;
    const mapping = Array.isArray(data.mapping) && data.mapping.length === width
      ? data.mapping.map((key) => String(key || ""))
      : guessed;
    const defaultType = TRACKING_TYPES.includes(String(data.defaultType))
      ? String(data.defaultType)
      : "quantity";
    const overrides = (data.typeOverrides && typeof data.typeOverrides === "object")
      ? data.typeOverrides
      : {};

    const body = hasHeader ? grid.slice(1) : grid;
    const nameColumn = mapping.indexOf("name");
    const items = [];
    const skipped = [];

    if (nameColumn >= 0) {
      body.forEach((cells, rowIndex) => {
        const pick = (key) => {
          const index = mapping.indexOf(key);
          return index >= 0 ? String(cells[index] || "").trim() : "";
        };
        const typeCell = pick("trackingType").toLowerCase();
        const override = TRACKING_TYPES.includes(String(overrides[rowIndex]))
          ? String(overrides[rowIndex])
          : "";
        const trackingType = override
          || (typeCell.startsWith("u") ? "unique"
            : typeCell.startsWith("q") ? "quantity"
            : defaultType);
        const isUnique = trackingType === "unique";

        const raw = {
          name: pick("name"),
          category: pick("category") || "Other",
          trackingType,
          brand: pick("brand"),
          model: pick("model"),
          reference: pick("reference"),
          serialNumber: pick("serialNumber"),
          sku: pick("sku"),
          location: pick("location"),
          supplierName: pick("supplierName"),
          purchaseDate: pick("purchaseDate"),
          notes: pick("notes"),
          ownership: pick("ownership").toLowerCase().startsWith("c") ? "customer" : "business",
          condition: pick("condition"),
          year: pick("year"),
          description: pick("description"),
          unit: isUnique ? "" : pick("unit"),
          onHand: isUnique ? 1 : spreadsheetNumber(pick("onHand")),
          lowStockAt: isUnique ? 0 : spreadsheetNumber(pick("lowStockAt")),
          purchasePrice: spreadsheetNumber(pick("purchasePrice")),
          additionalCosts: []
        };

        // Why a row cannot become an item, said in terms of what is missing.
        const reason = !raw.name ? "noName"
          : (!isUnique && !(raw.onHand > 0)) ? "noAmount"
          : "";
        if (reason) {
          skipped.push({ rowIndex, name: raw.name, reason });
          return;
        }
        // Returned in the shape importOpeningStock takes, so the rows the
        // person approved are the exact rows that get written — not a
        // normalized view of them that has to be translated back.
        const costs = costSummary(raw.purchasePrice, raw.additionalCosts);
        items.push({
          ...raw,
          rowIndex,
          // For the preview only: what this line is worth on the shelf.
          lineValue: roundMoney(costs.internalTotalCost * (isUnique ? 1 : raw.onHand))
        });
      });
    }

    // Duplicate pre-scan: a sheet exported twice should not become the same
    // stock twice. A row that carries a SKU or a serial is checked against what
    // is already on the shelf, and comes back marked — the import policy
    // (create / update / skip) is the person's call, made with that knowledge.
    const needsScan = items.some((row) => row.sku || row.serialNumber);
    if (needsScan) {
      const shelf = await itemsRef(companyId)
        .select("sku", "serialNumber", "number").limit(5000).get();
      const bySku = new Map();
      const bySerial = new Map();
      shelf.docs.forEach((doc) => {
        const data = doc.data() || {};
        const sku = String(data.sku || "").trim().toLowerCase();
        const serial = String(data.serialNumber || "").trim().toLowerCase();
        if (sku && !bySku.has(sku)) bySku.set(sku, { id: doc.id, number: data.number || "" });
        if (serial && !bySerial.has(serial)) bySerial.set(serial, { id: doc.id, number: data.number || "" });
      });
      items.forEach((row) => {
        const serial = String(row.serialNumber || "").trim().toLowerCase();
        const sku = String(row.sku || "").trim().toLowerCase();
        const hit = (serial && bySerial.get(serial)) || (sku && bySku.get(sku)) || null;
        if (hit) {
          row.existingItemId = hit.id;
          row.existingNumber = hit.number;
          row.matchedBy = serial && bySerial.get(serial) ? "serialNumber" : "sku";
        }
      });
    }

    return {
      ok: true,
      grid,
      width,
      headers,
      mapping,
      guessedMapping: guessed,
      fields: OPENING_STOCK_ALIASES.map(([key]) => key),
      items,
      skipped,
      duplicates: items.filter((row) => row.existingItemId).length,
      maxRows: 500
    };
  });

  const importOpeningStock = onCall({ region: REGION }, async (request) => {
    const { uid, email, companyId } = await requireInventoryAccess(request, { write: true });
    const rows = Array.isArray(request.data && request.data.items)
      ? request.data.items.slice(0, 500)
      : [];
    if (rows.length === 0) throw new HttpsError("invalid-argument", "No items to import.");
    const openingDate = clean(request.data && request.data.openingDate, "", 40);
    // What to do with a row parseOpeningStock matched to existing stock:
    // create it anyway (the old behaviour), skip it, or update the existing
    // item so the sheet becomes the truth.
    const policy = ["create", "skip", "update"].includes(String(request.data && request.data.duplicatePolicy))
      ? String(request.data.duplicatePolicy)
      : "create";
    const now = Date.now();

    let written = 0;
    let updated = 0;
    let skippedDuplicates = 0;
    let conflicts = 0;
    // Chunked so one oversized import cannot exceed a transaction's limits.
    for (let start = 0; start < rows.length; start += 100) {
      const chunk = rows.slice(start, start + 100);
      // eslint-disable-next-line no-await-in-loop
      await db().runTransaction(async (tx) => {
        const ref = companyRef(companyId);
        const snap = await tx.get(ref);
        // Firestore wants every read before any write, so the docs an update
        // policy will touch are all read up front.
        const existingSnaps = new Map();
        if (policy === "update") {
          for (const row of chunk) {
            const existingId = clean(row && row.existingItemId, "", 80);
            if (existingId && !existingSnaps.has(existingId)) {
              // eslint-disable-next-line no-await-in-loop
              existingSnaps.set(existingId, await tx.get(itemsRef(companyId).doc(existingId)));
            }
          }
        }
        let counter = Number((snap.exists ? snap.data() || {} : {}).inventoryCounter) || 0;
        for (const row of chunk) {
          const existingId = clean(row && row.existingItemId, "", 80);
          if (existingId && policy === "skip") { skippedDuplicates += 1; continue; }

          if (existingId && policy === "update") {
            const existingSnap = existingSnaps.get(existingId);
            if (!existingSnap || !existingSnap.exists) { conflicts += 1; continue; }
            const existing = existingSnap.data() || {};
            const fields = normalizeItemInput(row, existing);
            if (!fields.name) continue;
            const isUnique = String(existing.trackingType) === "unique";
            const oldOnHand = isUnique ? 1 : cleanQuantity((existing.quantity || {}).onHand);
            const newOnHand = isUnique ? 1 : fields.quantity.onHand;
            const reserved = cleanQuantity((existing.quantity || {}).reserved);
            // A sheet cannot pull the shelf below what orders already hold.
            if (!isUnique && newOnHand < reserved) { conflicts += 1; continue; }
            tx.set(existingSnap.ref, {
              ...fields,
              // The sheet updates what a thing IS; what has HAPPENED to it —
              // number, status, reservations, provenance — stays untouched.
              trackingType: existing.trackingType,
              quantity: isUnique
                ? existing.quantity
                : { ...(existing.quantity || {}), onHand: newOnHand, unit: fields.quantity.unit || (existing.quantity || {}).unit || "" },
              updatedAtMs: now,
              updatedByUid: uid
            }, { merge: true });
            const delta = roundSigned(newOnHand - oldOnHand);
            if (!isUnique && delta !== 0) {
              recordMovement(tx, companyId, {
                item: { ...existing, ...fields },
                itemId: existingSnap.id,
                kind: "adjustment",
                delta,
                unitCost: fields.valuationCost,
                at: now, uid, email,
                note: "Import update"
              });
            }
            updated += 1;
            continue;
          }

          const fields = normalizeItemInput(row, null);
          if (!fields.name) continue;
          counter += 1;
          const itemDoc = itemsRef(companyId).doc();
          tx.set(itemDoc, {
            ...fields,
            // A row that carries its own date keeps it; otherwise the opening
            // date stands in, so no imported item ends up dateless on screen.
            purchaseDate: fields.purchaseDate || openingDate,
            companyId,
            number: `INV-${String(counter).padStart(5, "0")}`,
            status: "available",
            reservedForOrderId: "",
            reservations: [],
            reservedOrderIds: [],
            source: "openingStock",
            openingStockDate: openingDate,
            createdAtMs: now,
            createdByUid: uid,
            createdByEmail: email,
            updatedAtMs: now,
            updatedByUid: uid
          });
          recordMovement(tx, companyId, {
            item: { ...fields, number: `INV-${String(counter).padStart(5, "0")}` },
            itemId: itemDoc.id,
            kind: "openingStock",
            delta: fields.trackingType === "unique" ? 1 : fields.quantity.onHand,
            unitCost: fields.valuationCost,
            at: now, uid, email,
            note: openingDate
          });
          written += 1;
        }
        tx.set(ref, { inventoryCounter: counter }, { merge: true });
      });
    }

    return { ok: true, imported: written, updated, skippedDuplicates, conflicts };
  });

  // -------------------------------------------------------------------------
  // Valuation and reporting
  //
  // Two different questions, and it matters that they are answered differently.
  //
  // "What is my stock worth" is answered from the shelf: every item, at what it
  // cost. That is the figure an accountant asks for at year end.
  //
  // "What happened to my stock" can only be answered from the ledger, and only
  // for the period the ledger covers. A workspace that started keeping
  // inventory last week cannot be told what moved last year, and this says so
  // rather than quietly reporting zero.
  // -------------------------------------------------------------------------

  const DEAD_STOCK_DAYS = 180;

  const getInventoryReport = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireInventoryAccess(request);
    const now = Date.now();
    const fromMs = Number(request.data && request.data.fromMs) || (now - 30 * 24 * 3600 * 1000);
    const toMs = Number(request.data && request.data.toMs) || now;

    const [itemSnap, movementSnap, earliestSnap] = await Promise.all([
      itemsRef(companyId).limit(2000).get(),
      movementsRef(companyId).where("at", ">=", fromMs).where("at", "<=", toMs).limit(3000).get(),
      movementsRef(companyId).orderBy("at", "asc").limit(1).get()
    ]);

    // ---- What it is worth, right now ----
    const byCategory = new Map();
    const byLocation = new Map();
    let totalValue = 0;
    let onShelfCount = 0;
    const lowStock = [];
    const deadStock = [];
    let customerOwnedCount = 0;

    itemSnap.docs.forEach((doc) => {
      const item = doc.data() || {};
      if (String(item.ownership) === "customer") { customerOwnedCount += 1; return; }
      const status = String(item.status || "available");
      const isUnique = String(item.trackingType) === "unique";
      const onHand = isUnique ? 1 : cleanQuantity((item.quantity || {}).onHand);
      // Sold, used and archived things are history, not stock.
      if (["sold", "used", "archived", "removed"].includes(status)) return;
      const value = roundMoney(roundUnitMoney(item.valuationCost) * onHand);

      // Incoming stock is paid for but not on the shelf; it is counted
      // separately rather than folded into what the workshop can reach.
      if (status !== "incoming") {
        totalValue = roundMoney(totalValue + value);
        onShelfCount += 1;
        const category = clean(item.category, "Other", 60) || "Other";
        const location = clean(item.location, "", 80) || "—";
        byCategory.set(category, roundMoney((byCategory.get(category) || 0) + value));
        byLocation.set(location, roundMoney((byLocation.get(location) || 0) + value));
      }

      const lowAt = cleanQuantity(item.lowStockAt);
      if (!isUnique && lowAt > 0 && onHand <= lowAt) {
        lowStock.push({
          itemId: doc.id, number: item.number || "", name: item.name || "",
          onHand, lowStockAt: lowAt, unit: (item.quantity || {}).unit || "",
          supplierName: item.supplierName || ""
        });
      }

      // Money sitting still. Judged on the last time anything happened to the
      // item, falling back to when it arrived.
      const lastTouched = Number(item.lastMovementAtMs) || Number(item.createdAtMs) || 0;
      const idleDays = lastTouched > 0 ? Math.floor((now - lastTouched) / 86400000) : null;
      if (status === "available" && idleDays !== null && idleDays >= DEAD_STOCK_DAYS && value > 0) {
        deadStock.push({
          itemId: doc.id, number: item.number || "", name: item.name || "",
          category: item.category || "", value, idleDays
        });
      }
    });

    // ---- What happened, over the period ----
    const byKind = {};
    let inValue = 0;
    let outValue = 0;
    movementSnap.docs.forEach((doc) => {
      const movement = doc.data() || {};
      const kind = String(movement.kind || "adjustment");
      const delta = Number(movement.delta) || 0;
      const value = Number(movement.valueDelta) || 0;
      const entry = byKind[kind] || { kind, lines: 0, delta: 0, value: 0 };
      entry.lines += 1;
      entry.delta = roundSigned(entry.delta + delta);
      entry.value = roundMoney(entry.value + value);
      byKind[kind] = entry;
      if (value >= 0) inValue = roundMoney(inValue + value);
      else outValue = roundMoney(outValue + value);
    });

    const earliest = earliestSnap.docs[0];
    const ledgerStartsMs = earliest ? Number((earliest.data() || {}).at) || 0 : 0;

    return {
      ok: true,
      generatedAtMs: now,
      fromMs, toMs,
      valuation: {
        totalValue,
        onShelfCount,
        customerOwnedCount,
        byCategory: [...byCategory.entries()]
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value),
        byLocation: [...byLocation.entries()]
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
      },
      movement: {
        // The ledger cannot answer for time before it existed. Saying when it
        // starts is the difference between "nothing moved" and "we were not
        // watching yet".
        ledgerStartsMs,
        coversWholePeriod: ledgerStartsMs > 0 && ledgerStartsMs <= fromMs,
        lines: movementSnap.size,
        truncated: movementSnap.size >= 3000,
        inValue,
        outValue,
        netValue: roundMoney(inValue + outValue),
        byKind: Object.values(byKind).sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      },
      lowStock: lowStock.sort((a, b) => a.onHand - b.onHand).slice(0, 100),
      deadStock: deadStock.sort((a, b) => b.value - a.value).slice(0, 100),
      deadStockAfterDays: DEAD_STOCK_DAYS
    };
  });

  const listInventoryMovements = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireInventoryAccess(request);
    const itemId = clean(request.data && request.data.itemId, "", 80);
    let query = movementsRef(companyId);
    if (itemId) query = query.where("itemId", "==", itemId);
    const snap = await query.orderBy("at", "desc").limit(300).get();
    return {
      ok: true,
      movements: snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    };
  });

  // -------------------------------------------------------------------------
  // Stocktake
  //
  // Walking the shelves with a clipboard is the only thing that tells a
  // workshop the truth. The system says 200 spring bars; you count 187. The
  // thirteen are the point — breakage, a part used without being logged, a
  // miscount last year. Editing the number to 187 answers the question and
  // destroys it, so a count is a record: what the system expected, what a
  // person counted, when, and by whom.
  //
  // A count is also a session, not an event. Forty things take an afternoon,
  // so counts are saved as they are made and nothing is applied until the
  // whole thing is committed — and then all of it lands together.
  // -------------------------------------------------------------------------

  const stocktakesRef = (companyId) =>
    db().collection("companies").doc(String(companyId)).collection("stocktakes");

  async function nextStocktakeNumber(tx, companyId) {
    const ref = companyRef(companyId);
    const snap = await tx.get(ref);
    const next = (Number((snap.exists ? snap.data() || {} : {}).stocktakeCounter) || 0) + 1;
    tx.set(ref, { stocktakeCounter: next }, { merge: true });
    return `CNT-${String(next).padStart(4, "0")}`;
  }

  /**
   * Opens a count over everything on the shelf, optionally narrowed to one
   * location or category — nobody counts the whole workshop at once.
   *
   * The expected figures are frozen here rather than read at commit time. A
   * count is a statement about a moment; if the shelf moves underneath it, the
   * difference belongs to the count, not to whatever the number happens to be
   * an hour later.
   */
  const startStocktake = onCall({ region: REGION }, async (request) => {
    const { uid, email, companyId } = await requireInventoryAccess(request, { write: true });
    const location = clean(request.data && request.data.location, "", 80);
    const category = clean(request.data && request.data.category, "", 60);
    const note = clean(request.data && request.data.note, "", 300);
    const now = Date.now();

    const snap = await itemsRef(companyId).limit(2000).get();
    const lines = [];
    snap.docs.forEach((doc) => {
      const item = doc.data() || {};
      // Things already sold, used or archived are not on the shelf to be
      // counted, and a customer's own property is not the workshop's to count.
      if (["sold", "used", "archived"].includes(String(item.status))) return;
      if (String(item.ownership) === "customer") return;
      if (location && clean(item.location, "", 80) !== location) return;
      if (category && clean(item.category, "", 60) !== category) return;
      const isUnique = String(item.trackingType) === "unique";
      lines.push({
        itemId: doc.id,
        number: clean(item.number, "", 40),
        name: clean(item.name, "", 160),
        category: clean(item.category, "", 60),
        location: clean(item.location, "", 80),
        trackingType: isUnique ? "unique" : "quantity",
        unit: clean((item.quantity || {}).unit, "", 12),
        expected: isUnique ? 1 : cleanQuantity((item.quantity || {}).onHand),
        unitCost: roundUnitMoney(item.valuationCost),
        counted: null,
        note: ""
      });
    });

    if (lines.length === 0) {
      throw new HttpsError("failed-precondition", "There is nothing on the shelf to count.");
    }

    const result = await db().runTransaction(async (tx) => {
      const number = await nextStocktakeNumber(tx, companyId);
      const ref = stocktakesRef(companyId).doc();
      tx.set(ref, {
        companyId,
        number,
        status: "open",
        location, category, note,
        lines,
        startedAtMs: now,
        startedByUid: uid,
        startedByEmail: email,
        committedAtMs: 0,
        updatedAtMs: now
      });
      return { stocktakeId: ref.id, number, lines: lines.length };
    });

    return { ok: true, ...result };
  });

  /** Saves what has been counted so far. A count is an afternoon, not a click. */
  const saveStocktakeCounts = onCall({ region: REGION }, async (request) => {
    const { uid, companyId } = await requireInventoryAccess(request, { write: true });
    const stocktakeId = clean(request.data && request.data.stocktakeId, "", 80);
    if (!stocktakeId) throw new HttpsError("invalid-argument", "stocktakeId is required.");
    const counts = (request.data && request.data.counts) || {};
    const notes = (request.data && request.data.notes) || {};

    const ref = stocktakesRef(companyId).doc(stocktakeId);
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError("not-found", "Stocktake not found.");
      const stocktake = snap.data() || {};
      if (stocktake.status !== "open") {
        throw new HttpsError("failed-precondition", "This count is already closed.");
      }
      const lines = (Array.isArray(stocktake.lines) ? stocktake.lines : []).map((line) => {
        const raw = counts[line.itemId];
        // Undefined means "not counted yet"; null clears a count already made.
        const counted = raw === undefined ? line.counted
          : raw === null || raw === "" ? null
          : cleanQuantity(raw);
        const note = notes[line.itemId] === undefined
          ? line.note
          : clean(notes[line.itemId], "", 200);
        return { ...line, counted, note };
      });
      tx.set(ref, { lines, updatedAtMs: Date.now(), updatedByUid: uid }, { merge: true });
    });

    return { ok: true };
  });

  /**
   * Applies the count. Every line that differs adjusts its item and writes one
   * ledger line saying a physical count moved it; lines nobody counted are left
   * exactly alone, because "not counted" is not "counted as zero".
   */
  const commitStocktake = onCall({ region: REGION }, async (request) => {
    const { uid, email, companyId } = await requireInventoryAccess(request, { write: true });
    const stocktakeId = clean(request.data && request.data.stocktakeId, "", 80);
    if (!stocktakeId) throw new HttpsError("invalid-argument", "stocktakeId is required.");
    const now = Date.now();

    const ref = stocktakesRef(companyId).doc(stocktakeId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "Stocktake not found.");
    const stocktake = snap.data() || {};
    if (stocktake.status !== "open") {
      throw new HttpsError("failed-precondition", "This count is already closed.");
    }

    const lines = Array.isArray(stocktake.lines) ? stocktake.lines : [];
    const changed = lines.filter(
      (line) => line.counted !== null && line.counted !== undefined
        && roundSigned(line.counted) !== roundSigned(line.expected)
    );

    // Read every affected item up front: a count taken this afternoon is
    // applied to the shelf as it is now, and the two can differ.
    const itemSnaps = await Promise.all(
      changed.map((line) => itemsRef(companyId).doc(line.itemId).get()));

    const batch = db().batch();
    let valueDelta = 0;
    const overPromised = [];

    itemSnaps.forEach((itemSnap, index) => {
      const line = changed[index];
      if (!itemSnap.exists) return;
      const item = itemSnap.data() || {};
      const isUnique = String(item.trackingType) === "unique";
      const counted = roundUnitMoney(line.counted);
      const delta = roundSigned(counted - roundUnitMoney(line.expected));

      if (isUnique) {
        // A unique thing is there or it is not. Counting zero means it is gone.
        if (counted <= 0) {
          batch.set(itemSnap.ref, {
            status: "removed", updatedAtMs: now, updatedByUid: uid
          }, { merge: true });
        }
      } else {
        batch.set(itemSnap.ref, {
          quantity: { ...(item.quantity || {}), onHand: counted },
          updatedAtMs: now, updatedByUid: uid
        }, { merge: true });
        // Counting below what orders are already holding is not an error to
        // refuse — the shelf is the truth — but somebody has to be told which
        // promises no longer have stock behind them.
        const reserved = cleanQuantity((item.quantity || {}).reserved);
        if (reserved > counted) {
          overPromised.push({
            itemId: itemSnap.id,
            name: clean(item.name, "", 160),
            number: clean(item.number, "", 40),
            counted,
            reserved,
            orderIds: cleanReservations(item.reservations).map((row) => row.orderId)
          });
        }
      }

      recordMovement(batch, companyId, {
        item, itemId: itemSnap.id,
        kind: "stocktake",
        delta,
        unitCost: item.valuationCost,
        at: now, uid, email,
        ref: stocktakeId,
        note: clean(line.note, "", 200) || clean(stocktake.number, "", 40)
      });
      valueDelta = roundMoney(valueDelta + roundMoney(roundUnitMoney(item.valuationCost) * delta));
    });

    batch.set(ref, {
      status: "committed",
      committedAtMs: now,
      committedByUid: uid,
      committedByEmail: email,
      adjustedLines: changed.length,
      valueDelta,
      overPromised,
      updatedAtMs: now
    }, { merge: true });
    await batch.commit();

    return {
      ok: true,
      adjusted: changed.length,
      counted: lines.filter((line) => line.counted !== null && line.counted !== undefined).length,
      total: lines.length,
      valueDelta,
      overPromised
    };
  });

  const listStocktakes = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireInventoryAccess(request);
    const snap = await stocktakesRef(companyId).orderBy("startedAtMs", "desc").limit(60).get();
    return {
      ok: true,
      stocktakes: snap.docs.map((doc) => {
        const data = doc.data() || {};
        const lines = Array.isArray(data.lines) ? data.lines : [];
        // The list does not need every line, only the shape of the count.
        return {
          id: doc.id,
          number: data.number || "",
          status: data.status || "open",
          location: data.location || "",
          category: data.category || "",
          note: data.note || "",
          startedAtMs: data.startedAtMs || 0,
          committedAtMs: data.committedAtMs || 0,
          startedByEmail: data.startedByEmail || "",
          lineCount: lines.length,
          countedCount: lines.filter((line) => line.counted !== null && line.counted !== undefined).length,
          adjustedLines: data.adjustedLines || 0,
          valueDelta: data.valueDelta || 0
        };
      })
    };
  });

  const getStocktake = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireInventoryAccess(request);
    const stocktakeId = clean(request.data && request.data.stocktakeId, "", 80);
    if (!stocktakeId) throw new HttpsError("invalid-argument", "stocktakeId is required.");
    const snap = await stocktakesRef(companyId).doc(stocktakeId).get();
    if (!snap.exists) throw new HttpsError("not-found", "Stocktake not found.");
    return { ok: true, stocktake: { id: snap.id, ...(snap.data() || {}) } };
  });

  const cancelStocktake = onCall({ region: REGION }, async (request) => {
    const { uid, companyId } = await requireInventoryAccess(request, { write: true });
    const stocktakeId = clean(request.data && request.data.stocktakeId, "", 80);
    if (!stocktakeId) throw new HttpsError("invalid-argument", "stocktakeId is required.");
    const ref = stocktakesRef(companyId).doc(stocktakeId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "Stocktake not found.");
    if ((snap.data() || {}).status === "committed") {
      throw new HttpsError(
        "failed-precondition",
        "A committed count cannot be cancelled — it already changed the shelf."
      );
    }
    // Abandoned rather than deleted: that somebody started a count and walked
    // away is itself worth being able to see.
    await ref.set({
      status: "cancelled", updatedAtMs: Date.now(), updatedByUid: uid
    }, { merge: true });
    return { ok: true };
  });

  // -------------------------------------------------------------------------
  // Purchases and suppliers
  //
  // A purchase is the missing middle. A bank row says "£2,450 left the account
  // and went to Vintage Watch Company"; a purchase says what that money bought,
  // how many, and what the shipping was. Without it, inventory and banking can
  // only be joined by guesswork.
  //
  // Buying is not receiving. A purchase can be placed while the goods are still
  // with a courier, so its lines enter inventory as `incoming` and only become
  // `available` when the purchase is marked received. A workshop that counts
  // things it has paid for but cannot touch will start a job it cannot finish.
  // -------------------------------------------------------------------------

  const purchasesRef = (companyId) =>
    db().collection("companies").doc(String(companyId)).collection("purchases");
  const suppliersRef = (companyId) =>
    db().collection("companies").doc(String(companyId)).collection("suppliers");
  const bankTxRef = (companyId) =>
    db().collection("companies").doc(String(companyId)).collection("bankTransactions");

  function cleanPurchaseLines(value) {
    const rows = Array.isArray(value) ? value.slice(0, 60) : [];
    return rows
      .map((row) => {
        const trackingType = TRACKING_TYPES.includes(String(row && row.trackingType))
          ? String(row.trackingType)
          : "unique";
        const quantity = trackingType === "unique" ? 1 : cleanQuantity(row && row.quantity);
        return {
          itemId: clean(row && row.itemId, "", 80),
          name: clean(row && row.name, "", 160),
          category: clean(row && row.category, "Other", 60) || "Other",
          trackingType,
          quantity,
          unit: trackingType === "unique" ? "" : clean(row && row.unit, "", 12),
          unitPrice: cleanMoney(row && row.unitPrice),
          reference: clean(row && row.reference, "", 80),
          serialNumber: clean(row && row.serialNumber, "", 80),
          location: clean(row && row.location, "", 80)
        };
      })
      .filter((row) => row.name && row.quantity > 0);
  }

  // Shipping and fees are spread across the lines by value, never folded into a
  // line's unit price. The purchase price of an item has to survive intact — it
  // is the figure the VAT margin scheme is computed from — so the share each
  // line carries is recorded as a separate cost against it.
  function allocateExtras(lines, extrasTotal) {
    const goods = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    if (extrasTotal <= 0 || goods <= 0) return lines.map(() => 0);
    let allocated = 0;
    const shares = lines.map((line, index) => {
      if (index === lines.length - 1) return roundMoney(extrasTotal - allocated);
      const share = roundMoney((line.unitPrice * line.quantity / goods) * extrasTotal);
      allocated = roundMoney(allocated + share);
      return share;
    });
    return shares;
  }

  function purchaseTotals(lines, shipping, otherCosts) {
    const goods = roundMoney(lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0));
    const ship = cleanMoney(shipping);
    const other = cleanMoney(otherCosts);
    return { goodsTotal: goods, shipping: ship, otherCosts: other, total: roundMoney(goods + ship + other) };
  }

  const savePurchase = onCall({ region: REGION }, async (request) => {
    const { uid, email, companyId } = await requireInventoryAccess(request, { write: true });
    const purchaseId = clean(request.data && request.data.purchaseId, "", 80);
    const input = request.data && request.data.purchase;
    if (!input || typeof input !== "object") {
      throw new HttpsError("invalid-argument", "purchase is required.");
    }

    const lines = cleanPurchaseLines(input.lines);
    if (lines.length === 0) throw new HttpsError("invalid-argument", "Add at least one line.");
    const totals = purchaseTotals(lines, input.shipping, input.otherCosts);
    const shares = allocateExtras(lines, roundMoney(totals.shipping + totals.otherCosts));
    const now = Date.now();

    const result = await db().runTransaction(async (tx) => {
      const ref = purchaseId ? purchasesRef(companyId).doc(purchaseId) : purchasesRef(companyId).doc();
      let existing = null;
      if (purchaseId) {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError("not-found", "Purchase not found.");
        existing = snap.data() || {};
        if (existing.status === "received" || existing.status === "partiallyReceived") {
          throw new HttpsError(
            "failed-precondition",
            "A received purchase cannot be edited — the stock it created is already on the shelf."
          );
        }
      }

      // Firestore requires every read in a transaction to happen before every
      // write, so the workspace doc is read once here and both counters come
      // out of it. Reading it again after the first write throws.
      const companySnap = await tx.get(companyRef(companyId));
      const companyCounters = companySnap.exists ? companySnap.data() || {} : {};

      let number;
      let counter = null;
      if (existing) {
        number = existing.number;
      } else {
        const nextPurchase = (Number(companyCounters.purchaseCounter) || 0) + 1;
        number = `PUR-${String(nextPurchase).padStart(4, "0")}`;
        counter = Number(companyCounters.inventoryCounter) || 0;
        tx.set(companyRef(companyId), { purchaseCounter: nextPurchase }, { merge: true });
      }

      // Each line becomes an inventory item straight away, held as `incoming`
      // so it is visible and countable without pretending it is in the drawer.
      const createdItemIds = [];

      lines.forEach((line, index) => {
        if (existing) return; // editing an unreceived purchase leaves its items alone
        counter += 1;
        const itemRef = itemsRef(companyId).doc();
        // The share is what this LINE carries. Every money field on an item is
        // per unit, so a counted line divides it by the quantity — adding the
        // whole share to each piece would multiply it by the count.
        const perUnitShare = line.trackingType === "unique"
          ? shares[index]
          : (line.quantity > 0 ? shares[index] / line.quantity : 0);
        const extras = perUnitShare > 0
          ? [{ label: "Shipping & fees (allocated)", amount: perUnitShare }]
          : [];
        const fields = normalizeItemInput({
          name: line.name,
          category: line.category,
          trackingType: line.trackingType,
          reference: line.reference,
          serialNumber: line.serialNumber,
          location: line.location,
          unit: line.unit,
          onHand: line.trackingType === "unique" ? 1 : line.quantity,
          purchasePrice: line.unitPrice,
          additionalCosts: extras,
          supplierName: clean(input.supplierName, "", 160),
          purchaseDate: clean(input.purchaseDate, "", 40)
        }, null);
        tx.set(itemRef, {
          ...fields,
          companyId,
          number: `INV-${String(counter).padStart(5, "0")}`,
          status: "incoming",
          reservedForOrderId: "",
          reservations: [],
          reservedOrderIds: [],
          purchaseId: ref.id,
          purchaseNumber: number,
          source: "purchase",
          createdAtMs: now,
          createdByUid: uid,
          createdByEmail: email,
          updatedAtMs: now,
          updatedByUid: uid
        });
        createdItemIds.push(itemRef.id);
      });

      if (counter !== null) tx.set(companyRef(companyId), { inventoryCounter: counter }, { merge: true });

      tx.set(ref, {
        companyId,
        number,
        supplierName: clean(input.supplierName, "", 160),
        supplierId: clean(input.supplierId, "", 80),
        purchaseDate: clean(input.purchaseDate, "", 40),
        reference: clean(input.reference, "", 80),
        notes: clean(input.notes, "", 2000),
        lines: lines.map((line, index) => ({ ...line, allocatedExtras: shares[index] })),
        ...totals,
        status: existing ? existing.status : "ordered",
        itemIds: existing ? existing.itemIds || [] : createdItemIds,
        bankTransactionId: existing ? existing.bankTransactionId || "" : "",
        receiptPath: existing ? existing.receiptPath || "" : "",
        receivedAtMs: existing ? existing.receivedAtMs || 0 : 0,
        createdAtMs: existing ? existing.createdAtMs || now : now,
        createdByUid: existing ? existing.createdByUid || uid : uid,
        updatedAtMs: now,
        updatedByUid: uid
      }, { merge: true });

      return { purchaseId: ref.id, number, total: totals.total, itemsCreated: createdItemIds.length };
    });

    return { ok: true, ...result };
  });

  // Goods arrive in boxes, not in purchase orders. Six of the ten cases can be
  // on the shelf while four are still with the courier — so receiving works
  // per line and per quantity, and the purchase says "partiallyReceived" until
  // the last piece lands. Without a lines payload it receives everything still
  // outstanding, which is exactly what the old one-click receive did.
  const receivePurchase = onCall({ region: REGION }, async (request) => {
    const { uid, email, companyId } = await requireInventoryAccess(request, { write: true });
    const purchaseId = clean(request.data && request.data.purchaseId, "", 80);
    if (!purchaseId) throw new HttpsError("invalid-argument", "purchaseId is required.");
    const requestedRaw = Array.isArray(request.data && request.data.lines) ? request.data.lines : null;
    const now = Date.now();
    const ref = purchasesRef(companyId).doc(purchaseId);

    const outcome = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError("not-found", "Purchase not found.");
      const purchase = snap.data() || {};
      if (purchase.status === "received") return { alreadyReceived: true };

      const lines = Array.isArray(purchase.lines) ? purchase.lines : [];
      const itemIds = Array.isArray(purchase.itemIds) ? purchase.itemIds : [];

      // What should arrive now, per line index. No payload = everything left.
      const arriving = new Map();
      if (requestedRaw) {
        for (const row of requestedRaw.slice(0, 60)) {
          const index = Number(row && row.index);
          if (!Number.isInteger(index) || index < 0 || index >= lines.length) {
            throw new HttpsError("invalid-argument", "Unknown purchase line.");
          }
          const line = lines[index];
          const already = cleanQuantity(line.receivedQuantity);
          const ordered = String(line.trackingType) === "unique" ? 1 : cleanQuantity(line.quantity);
          const remaining = roundMoney(ordered - already);
          const wanted = String(line.trackingType) === "unique"
            ? remaining
            : (row && row.quantity !== undefined ? cleanQuantity(row.quantity) : remaining);
          if (wanted <= 0) continue;
          if (wanted > remaining) {
            throw new HttpsError("failed-precondition", `Only ${remaining} of "${line.name}" is still outstanding.`);
          }
          arriving.set(index, wanted);
        }
      } else {
        lines.forEach((line, index) => {
          const already = cleanQuantity(line.receivedQuantity);
          const ordered = String(line.trackingType) === "unique" ? 1 : cleanQuantity(line.quantity);
          const remaining = roundMoney(ordered - already);
          if (remaining > 0) arriving.set(index, remaining);
        });
      }
      if (arriving.size === 0) return { received: 0 };

      const itemSnaps = new Map();
      for (const index of arriving.keys()) {
        const itemId = itemIds[index];
        if (!itemId) continue;
        itemSnaps.set(index, await tx.get(itemsRef(companyId).doc(itemId)));
      }

      const nextLines = lines.map((line, index) => {
        if (!arriving.has(index)) return line;
        const already = cleanQuantity(line.receivedQuantity);
        return { ...line, receivedQuantity: roundMoney(already + arriving.get(index)) };
      });
      const fullyReceived = nextLines.every((line) => {
        const ordered = String(line.trackingType) === "unique" ? 1 : cleanQuantity(line.quantity);
        return cleanQuantity(line.receivedQuantity) >= ordered;
      });

      let receivedNow = 0;
      for (const [index, amount] of arriving) {
        receivedNow = roundMoney(receivedNow + amount);
        const itemSnap = itemSnaps.get(index);
        if (!itemSnap || !itemSnap.exists) continue;
        const item = itemSnap.data() || {};
        const line = nextLines[index];
        const isUnique = String(item.trackingType) === "unique";
        if (isUnique) {
          tx.set(itemSnap.ref, { status: "available", updatedAtMs: now, updatedByUid: uid }, { merge: true });
        } else {
          // The item was created with the full ordered count; from the first
          // arrival onward its onHand says what is actually on the shelf and
          // its incoming carries the rest.
          const ordered = cleanQuantity(line.quantity);
          const receivedSoFar = cleanQuantity(line.receivedQuantity);
          tx.set(itemSnap.ref, {
            status: "available",
            quantity: {
              ...(item.quantity || {}),
              onHand: receivedSoFar,
              incoming: roundMoney(Math.max(0, ordered - receivedSoFar))
            },
            updatedAtMs: now,
            updatedByUid: uid
          }, { merge: true });
        }
        recordMovement(tx, companyId, {
          item, itemId: itemSnap.id,
          kind: "purchase",
          delta: isUnique ? 1 : roundSigned(amount),
          unitCost: item.valuationCost,
          at: now, uid, email,
          ref: purchaseId,
          note: clean(purchase.number, "", 40)
        });
      }

      tx.set(ref, {
        lines: nextLines,
        status: fullyReceived ? "received" : "partiallyReceived",
        receivedAtMs: fullyReceived ? now : Number(purchase.receivedAtMs) || 0,
        updatedAtMs: now,
        updatedByUid: uid
      }, { merge: true });

      return { received: receivedNow, status: fullyReceived ? "received" : "partiallyReceived" };
    });

    return { ok: true, ...outcome };
  });

  const listPurchases = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireInventoryAccess(request);
    const snap = await purchasesRef(companyId).orderBy("createdAtMs", "desc").limit(300).get();
    return { ok: true, purchases: snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) })) };
  });

  const deletePurchase = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireInventoryAccess(request, { write: true });
    const purchaseId = clean(request.data && request.data.purchaseId, "", 80);
    if (!purchaseId) throw new HttpsError("invalid-argument", "purchaseId is required.");
    const ref = purchasesRef(companyId).doc(purchaseId);
    const snap = await ref.get();
    if (!snap.exists) return { ok: true };
    const purchase = snap.data() || {};
    if (purchase.status === "received" || purchase.status === "partiallyReceived") {
      throw new HttpsError(
        "failed-precondition",
        "A received purchase cannot be deleted — its stock is on the shelf."
      );
    }
    // The incoming items exist only because of this purchase, so they go with it.
    const itemIds = Array.isArray(purchase.itemIds) ? purchase.itemIds : [];
    const batch = db().batch();
    itemIds.forEach((itemId) => batch.delete(itemsRef(companyId).doc(itemId)));
    batch.delete(ref);
    await batch.commit();
    return { ok: true };
  });

  // Matching, never creating. A bank row is a merchant, a date and a total; it
  // cannot know that £1,382.40 at eBay was one dial, one bracelet and postage.
  // So the purchase is written by a person and the payment is attached to it.
  const linkPurchaseToBankTransaction = onCall({ region: REGION }, async (request) => {
    const { uid, companyId } = await requireInventoryAccess(request, { write: true });
    const purchaseId = clean(request.data && request.data.purchaseId, "", 80);
    const transactionId = clean(request.data && request.data.transactionId, "", 200);
    if (!purchaseId) throw new HttpsError("invalid-argument", "purchaseId is required.");

    const purchaseRef = purchasesRef(companyId).doc(purchaseId);
    const purchaseSnap = await purchaseRef.get();
    if (!purchaseSnap.exists) throw new HttpsError("not-found", "Purchase not found.");
    const purchase = purchaseSnap.data() || {};
    const now = Date.now();

    // Unlinking: clear both sides so neither screen keeps claiming a match.
    if (!transactionId) {
      const previous = clean(purchase.bankTransactionId, "", 200);
      const batch = db().batch();
      if (previous) batch.set(bankTxRef(companyId).doc(previous), { purchaseId: "", purchaseNumber: "" }, { merge: true });
      batch.set(purchaseRef, { bankTransactionId: "", updatedAtMs: now, updatedByUid: uid }, { merge: true });
      await batch.commit();
      return { ok: true, linked: false };
    }

    const txSnap = await bankTxRef(companyId).doc(transactionId).get();
    if (!txSnap.exists) throw new HttpsError("not-found", "Bank transaction not found.");
    const transaction = txSnap.data() || {};
    const alreadyOn = clean(transaction.purchaseId, "", 80);
    if (alreadyOn && alreadyOn !== purchaseId) {
      throw new HttpsError("failed-precondition", "That payment is already matched to another purchase.");
    }

    const paid = Math.abs(Number(transaction.amount) || 0);
    const batch = db().batch();
    batch.set(bankTxRef(companyId).doc(transactionId), {
      purchaseId,
      purchaseNumber: clean(purchase.number, "", 40)
    }, { merge: true });
    batch.set(purchaseRef, {
      bankTransactionId: transactionId,
      updatedAtMs: now,
      updatedByUid: uid
    }, { merge: true });
    await batch.commit();

    // Reported, not enforced: a deposit or a part payment is a real thing, and
    // refusing the match would just push the user back to a spreadsheet.
    const difference = roundMoney(paid - (Number(purchase.total) || 0));
    return { ok: true, linked: true, paid, purchaseTotal: Number(purchase.total) || 0, difference };
  });

  const saveSupplier = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireInventoryAccess(request, { write: true });
    const supplierId = clean(request.data && request.data.supplierId, "", 80);
    const input = request.data && request.data.supplier;
    const name = clean(input && input.name, "", 160);
    if (!name) throw new HttpsError("invalid-argument", "A supplier name is required.");
    const ref = supplierId ? suppliersRef(companyId).doc(supplierId) : suppliersRef(companyId).doc();
    await ref.set({
      companyId,
      name,
      email: clean(input && input.email, "", 240),
      phone: clean(input && input.phone, "", 60),
      website: clean(input && input.website, "", 240),
      notes: clean(input && input.notes, "", 2000),
      // The paperwork fields: what an invoice or a customs form asks for.
      code: clean(input && input.code, "", 40),
      address: clean(input && input.address, "", 500),
      vatNumber: clean(input && input.vatNumber, "", 40),
      currency: clean(input && input.currency, "", 8),
      updatedAtMs: Date.now()
    }, { merge: true });
    return { ok: true, supplierId: ref.id };
  });

  // Supplier totals are counted from the purchases rather than stored on the
  // supplier, so they cannot drift away from what was actually bought.
  const listSuppliers = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireInventoryAccess(request);
    const [supplierSnap, purchaseSnap] = await Promise.all([
      suppliersRef(companyId).limit(500).get(),
      purchasesRef(companyId).limit(1000).get()
    ]);

    const stats = new Map();
    purchaseSnap.docs.forEach((doc) => {
      const purchase = doc.data() || {};
      const key = clean(purchase.supplierName, "", 160).toLowerCase();
      if (!key) return;
      // The key is lower-cased so "Royal Mail" and "royal mail" are one supplier,
      // but the name shown must keep the spelling the user actually typed.
      const entry = stats.get(key)
        || { total: 0, count: 0, lastDate: "", matched: 0, lines: 0, displayName: clean(purchase.supplierName, "", 160) };
      entry.total = roundMoney(entry.total + (Number(purchase.total) || 0));
      entry.count += 1;
      entry.lines += Array.isArray(purchase.lines) ? purchase.lines.length : 0;
      if (clean(purchase.bankTransactionId, "", 200)) entry.matched += 1;
      const date = clean(purchase.purchaseDate, "", 40);
      if (date > entry.lastDate) entry.lastDate = date;
      stats.set(key, entry);
    });

    const saved = supplierSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
    const savedKeys = new Set(saved.map((row) => String(row.name || "").toLowerCase()));
    // A supplier you have bought from but never filled in a card for still
    // belongs in the list — it is the purchases that make it real.
    const implied = [...stats.entries()]
      .filter(([key]) => !savedKeys.has(key))
      .map(([key, entry]) => ({ id: "", name: entry.displayName || key, implied: true }));

    return {
      ok: true,
      suppliers: [...saved, ...implied].map((row) => ({
        ...row,
        stats: stats.get(String(row.name || "").toLowerCase()) || { total: 0, count: 0, lastDate: "", matched: 0, lines: 0 }
      }))
    };
  });

  // -------------------------------------------------------------------------
  // Reserving stock for an order
  //
  // Reserved is not consumed. A part set aside for a job is still physically on
  // the shelf and still an asset; it just is not available to promise twice.
  // Consuming it is a separate, later act.
  // -------------------------------------------------------------------------

  function cleanReservations(value) {
    const rows = Array.isArray(value) ? value : [];
    return rows
      .map((row) => ({
        orderId: clean(row && row.orderId, "", 200),
        quantity: cleanQuantity(row && row.quantity),
        createdAtMs: Number(row && row.createdAtMs) || 0
      }))
      .filter((row) => row.orderId && row.quantity > 0);
  }

  // "3 of 10 held" is not the same fact as "all 10 held" — the status now
  // says which (the report's partiallyReserved ask). Off-the-shelf statuses
  // are never resurrected here.
  function reservationStatus(item, totalReserved, onHandOverride) {
    const current = String(item.status || "available");
    if (["used", "sold", "removed", "archived", "incoming"].includes(current)) return current;
    if (String(item.trackingType) === "unique") return totalReserved > 0 ? "reserved" : "available";
    const onHand = onHandOverride !== undefined ? onHandOverride : cleanQuantity((item.quantity || {}).onHand);
    if (totalReserved <= 0) return "available";
    return totalReserved >= onHand ? "reserved" : "partiallyReserved";
  }

  const reserveInventoryForOrder = onCall({ region: REGION }, async (request) => {
    const { uid, companyId } = await requireInventoryAccess(request, { write: true });
    const itemId = clean(request.data && request.data.itemId, "", 80);
    const orderId = clean(request.data && request.data.orderId, "", 200);
    const requested = cleanQuantity(request.data && request.data.quantity);
    if (!itemId || !orderId) throw new HttpsError("invalid-argument", "itemId and orderId are required.");

    const ref = itemsRef(companyId).doc(itemId);
    const now = Date.now();

    const outcome = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError("not-found", "Inventory item not found.");
      const item = snap.data() || {};
      if (String(item.ownership) === "customer") {
        throw new HttpsError("failed-precondition", "A customer's own item is not stock and cannot be reserved.");
      }
      if (["sold", "used", "archived"].includes(String(item.status))) {
        throw new HttpsError("failed-precondition", "That item is no longer available to reserve.");
      }

      const isUnique = String(item.trackingType) === "unique";
      const existing = cleanReservations(item.reservations);
      const others = existing.filter((row) => row.orderId !== orderId);

      if (isUnique) {
        if (others.length > 0) {
          throw new HttpsError("failed-precondition", "That item is already reserved for another order.");
        }
        tx.set(ref, {
          status: "reserved",
          reservedForOrderId: orderId,
          reservations: [{ orderId, quantity: 1, createdAtMs: now }],
          reservedOrderIds: [orderId],
          updatedAtMs: now,
          updatedByUid: uid
        }, { merge: true });
        return { reserved: 1 };
      }

      const onHand = cleanQuantity((item.quantity || {}).onHand);
      const reservedElsewhere = others.reduce((sum, row) => sum + row.quantity, 0);
      const free = roundMoney(onHand - reservedElsewhere);
      if (requested <= 0) throw new HttpsError("invalid-argument", "Enter how much to reserve.");
      if (requested > free) {
        throw new HttpsError(
          "failed-precondition",
          `Only ${free} available to reserve — ${reservedElsewhere} is already promised to other orders.`
        );
      }

      const next = [...others, { orderId, quantity: requested, createdAtMs: now }];
      const totalReserved = roundMoney(next.reduce((sum, row) => sum + row.quantity, 0));
      tx.set(ref, {
        reservations: next,
        reservedOrderIds: next.map((row) => row.orderId),
        quantity: { ...(item.quantity || {}), reserved: totalReserved },
        status: reservationStatus(item, totalReserved),
        updatedAtMs: now,
        updatedByUid: uid
      }, { merge: true });
      return { reserved: requested, remaining: roundMoney(free - requested) };
    });

    return { ok: true, ...outcome };
  });

  const releaseInventoryFromOrder = onCall({ region: REGION }, async (request) => {
    const { uid, companyId } = await requireInventoryAccess(request, { write: true });
    const itemId = clean(request.data && request.data.itemId, "", 80);
    const orderId = clean(request.data && request.data.orderId, "", 200);
    if (!itemId || !orderId) throw new HttpsError("invalid-argument", "itemId and orderId are required.");
    const ref = itemsRef(companyId).doc(itemId);
    const now = Date.now();

    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError("not-found", "Inventory item not found.");
      const item = snap.data() || {};
      const next = cleanReservations(item.reservations).filter((row) => row.orderId !== orderId);
      const totalReserved = roundMoney(next.reduce((sum, row) => sum + row.quantity, 0));
      const isUnique = String(item.trackingType) === "unique";
      tx.set(ref, {
        reservations: next,
        reservedOrderIds: next.map((row) => row.orderId),
        reservedForOrderId: isUnique ? "" : clean(item.reservedForOrderId, "", 200),
        quantity: isUnique ? item.quantity : { ...(item.quantity || {}), reserved: totalReserved },
        // Releasing puts it back on the shelf, but never resurrects something
        // already used or sold.
        status: reservationStatus(item, totalReserved),
        updatedAtMs: now,
        updatedByUid: uid
      }, { merge: true });
    });

    return { ok: true };
  });

  // What an order is actually holding, and what it cost. This is the number the
  // Financial card can trust instead of a hand-typed material cost.
  const getOrderInventory = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireInventoryAccess(request);
    const orderId = clean(request.data && request.data.orderId, "", 200);
    if (!orderId) throw new HttpsError("invalid-argument", "orderId is required.");

    const snap = await itemsRef(companyId)
      .where("reservedOrderIds", "array-contains", orderId)
      .limit(200)
      .get();

    let total = 0;
    const items = snap.docs.map((doc) => {
      const item = doc.data() || {};
      const reservation = cleanReservations(item.reservations).find((row) => row.orderId === orderId);
      const quantity = reservation ? reservation.quantity : 0;
      const unitCost = Number(item.valuationCost) || 0;
      const lineCost = String(item.trackingType) === "unique"
        ? unitCost
        : roundMoney(unitCost * quantity);
      total = roundMoney(total + lineCost);
      const onHand = String(item.trackingType) === "unique" ? 1 : cleanQuantity((item.quantity || {}).onHand);
      return {
        id: doc.id,
        number: item.number || "",
        name: item.name || "",
        category: item.category || "",
        trackingType: item.trackingType || "unique",
        unit: (item.quantity || {}).unit || "",
        status: item.status || "available",
        quantity,
        onHand,
        location: clean(item.location, "", 80),
        unitCost,
        lineCost
      };
    });

    return { ok: true, orderId, items, totalCost: total };
  });

  // Iade / hasar / kayıp / fire: stock leaving the shelf with its REASON on
  // the ledger — "adjustment" used to swallow all four, and the difference is
  // exactly what a stocktake argument needs. A unique item goes as a whole
  // (status "removed", kind tells why); a quantity item can lose part of the
  // pile, but never what is promised to orders — release first.
  const LOSS_KINDS = ["returned", "damaged", "lost", "wastage"];
  const recordInventoryLoss = onCall({ region: REGION }, async (request) => {
    const { uid, email, companyId } = await requireInventoryAccess(request, { write: true });
    const itemId = clean(request.data && request.data.itemId, "", 80);
    const kind = clean(request.data && request.data.kind, "", 20);
    const note = clean(request.data && request.data.note, "", 300);
    const orderRef = clean(request.data && request.data.orderId, "", 200);
    if (!itemId || !LOSS_KINDS.includes(kind)) {
      throw new HttpsError("invalid-argument", "itemId and a valid kind (returned/damaged/lost/wastage) are required.");
    }

    const ref = itemsRef(companyId).doc(itemId);
    const now = Date.now();
    const outcome = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError("not-found", "Inventory item not found.");
      const item = snap.data() || {};
      if (["sold", "used", "removed", "archived"].includes(String(item.status))) {
        throw new HttpsError("failed-precondition", "That item has already left the shelf.");
      }

      const isUnique = String(item.trackingType) === "unique";
      if (isUnique) {
        if (cleanReservations(item.reservations).length > 0) {
          throw new HttpsError("failed-precondition", "That item is reserved for an order — release it first.");
        }
        tx.set(ref, {
          status: "removed",
          reservedForOrderId: "",
          updatedAtMs: now,
          updatedByUid: uid
        }, { merge: true });
        recordMovement(tx, companyId, {
          item, itemId: ref.id, kind,
          delta: -1,
          unitCost: Number(item.valuationCost) || 0,
          at: now, uid, email, ref: orderRef, note
        });
        return { removed: 1 };
      }

      const quantity = cleanQuantity(request.data && request.data.quantity);
      if (quantity <= 0) throw new HttpsError("invalid-argument", "Enter how much was lost.");
      const onHand = cleanQuantity((item.quantity || {}).onHand);
      const reserved = roundMoney(cleanReservations(item.reservations).reduce((sum, row) => sum + row.quantity, 0));
      if (quantity > onHand) {
        throw new HttpsError("failed-precondition", `Only ${onHand} on hand.`);
      }
      const nextOnHand = roundMoney(onHand - quantity);
      if (nextOnHand < reserved) {
        throw new HttpsError(
          "failed-precondition",
          `${reserved} is promised to orders — release reservations before recording this loss.`
        );
      }
      tx.set(ref, {
        quantity: { ...(item.quantity || {}), onHand: nextOnHand },
        status: reservationStatus(item, reserved, nextOnHand),
        updatedAtMs: now,
        updatedByUid: uid
      }, { merge: true });
      recordMovement(tx, companyId, {
        item, itemId: ref.id, kind,
        delta: roundSigned(-quantity),
        unitCost: Number(item.valuationCost) || 0,
        at: now, uid, email, ref: orderRef, note
      });
      return { lost: quantity, remaining: nextOnHand };
    });

    return { ok: true, ...outcome };
  });

  // ---------------------------------------------------------------------------
  // Hierarchical locations
  //
  // "Safe A / Drawer 3" is one string on the item — deliberately: every client
  // that only knows free-text locations keeps working. The tree lives in its
  // own collection and OWNS those strings: renaming or re-parenting a location
  // rewrites the paths of its whole subtree and of every item standing in it.
  // No ledger lines are written for that — renaming a shelf moves no goods.
  // ---------------------------------------------------------------------------

  const locationsRef = (companyId) =>
    db().collection("companies").doc(String(companyId)).collection("inventoryLocations");
  const LOCATION_MAX_DEPTH = 4;
  const LOCATION_SEPARATOR = " / ";

  function locationPathOf(name, parentPath) {
    return parentPath ? `${parentPath}${LOCATION_SEPARATOR}${name}` : name;
  }

  // ---------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------

  const settingsRef = (companyId) => db().collection("companySettings").doc(String(companyId));

  function categoryIdFrom(value, fallback) {
    const slug = String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
    return slug || fallback;
  }

  function defaultCategories() {
    return DEFAULT_CATEGORIES.map((title) => ({
      id: categoryIdFrom(title, "category"),
      title,
      icon: DEFAULT_CATEGORY_ICONS[title] || DEFAULT_CATEGORY_ICONS.Other,
      archived: false
    }));
  }

  // Never throws and never returns an empty list: the Inventory screen has to
  // render even if a stale client wrote nonsense here.
  function categoriesFromSettings(data = {}) {
    const raw = Array.isArray(data.inventoryCategories) ? data.inventoryCategories : [];
    const rows = [];
    const seen = new Set();
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const title = clean(entry.title, "", 60);
      if (!title) continue;
      let id = categoryIdFrom(entry.id || title, `category_${rows.length + 1}`);
      while (seen.has(id)) id = `${id}_${rows.length + 1}`;
      seen.add(id);
      rows.push({
        id,
        title,
        icon: clean(entry.icon, "", 8) || DEFAULT_CATEGORY_ICONS[title] || DEFAULT_CATEGORY_ICONS.Other,
        archived: entry.archived === true
      });
    }
    if (rows.length === 0) return defaultCategories();
    // Somewhere to put items whose category is deleted, always.
    if (!rows.some((row) => row.title.toLowerCase() === CATEGORY_FALLBACK.toLowerCase())) {
      rows.push({ id: categoryIdFrom(CATEGORY_FALLBACK, "other"), title: CATEGORY_FALLBACK, icon: DEFAULT_CATEGORY_ICONS.Other, archived: false });
    }
    return rows;
  }

  async function loadCategories(companyId) {
    const snap = await settingsRef(companyId).get();
    const data = snap.exists ? snap.data() || {} : {};
    return {
      categories: categoriesFromSettings(data),
      defaultCategory: clean(data.inventoryDefaultCategory, "", 60)
    };
  }

  // Items carry the category TITLE, so a rename has to travel to them. Done in
  // batches because a workshop can hold thousands of rows.
  async function renameCategoryOnItems(companyId, fromTitle, toTitle) {
    const from = String(fromTitle || "").trim();
    const to = String(toTitle || "").trim();
    if (!from || !to || from === to) return 0;
    const snap = await itemsRef(companyId).where("category", "==", from).get();
    let moved = 0;
    let batch = db().batch();
    let pending = 0;
    for (const doc of snap.docs) {
      batch.set(doc.ref, { category: to, updatedAtMs: Date.now() }, { merge: true });
      moved += 1;
      pending += 1;
      if (pending >= 400) { await batch.commit(); batch = db().batch(); pending = 0; }
    }
    if (pending > 0) await batch.commit();
    return moved;
  }

  async function countItemsInCategory(companyId, title) {
    const snap = await itemsRef(companyId).where("category", "==", String(title || "")).get();
    return snap.size;
  }

  const listInventoryCategories = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireInventoryAccess(request);
    const { categories, defaultCategory } = await loadCategories(companyId);
    // Counts drive the "this category still holds 12 items" warning before a
    // delete, so they are worth the read.
    const snap = await itemsRef(companyId).select("category").get();
    const counts = new Map();
    snap.docs.forEach((doc) => {
      const title = String((doc.data() || {}).category || "");
      counts.set(title, (counts.get(title) || 0) + 1);
    });
    return {
      ok: true,
      categories: categories.map((row) => ({ ...row, itemCount: counts.get(row.title) || 0 })),
      defaultCategory,
      // Titles held by items but no longer on the list — otherwise those items
      // would be invisible to every filter on the screen.
      orphans: [...counts.keys()]
        .filter((title) => title && !categories.some((row) => row.title === title))
        .map((title) => ({ title, itemCount: counts.get(title) || 0 }))
    };
  });

  // One write for the whole list: rename, re-icon, reorder, archive and add all
  // arrive together, and every rename is carried to the items that used it.
  const saveInventoryCategories = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireInventoryAccess(request, { write: true });
    const incoming = Array.isArray(request.data && request.data.categories) ? request.data.categories : [];
    if (incoming.length === 0) throw new HttpsError("invalid-argument", "Inventory needs at least one category.");
    if (incoming.length > MAX_CATEGORIES) {
      throw new HttpsError("invalid-argument", `A workspace is capped at ${MAX_CATEGORIES} categories.`);
    }

    const next = categoriesFromSettings({ inventoryCategories: incoming });
    const lowered = next.map((row) => row.title.toLowerCase());
    const duplicate = lowered.find((title, index) => lowered.indexOf(title) !== index);
    if (duplicate) {
      throw new HttpsError("failed-precondition", `Two categories cannot both be called "${duplicate}". Merge them instead.`);
    }

    const { categories: previous } = await loadCategories(companyId);
    const previousById = new Map(previous.map((row) => [row.id, row]));
    let movedItems = 0;
    for (const row of next) {
      const before = previousById.get(row.id);
      if (!before || before.title === row.title) continue;
      movedItems += await renameCategoryOnItems(companyId, before.title, row.title);
    }

    const defaultCategory = clean(request.data && request.data.defaultCategory, "", 60);
    await settingsRef(companyId).set({
      inventoryCategories: next,
      inventoryDefaultCategory: next.some((row) => row.title === defaultCategory) ? defaultCategory : "",
      inventoryCategoriesUpdatedAtMs: Date.now()
    }, { merge: true });

    return { ok: true, categories: next, renamedItems: movedItems };
  });

  // A category with items in it is never dropped on the floor. The caller has
  // to say where those items go first.
  const deleteInventoryCategory = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireInventoryAccess(request, { write: true });
    const categoryId = clean(request.data && request.data.categoryId, "", 80);
    const disposition = String((request.data && request.data.disposition) || "");
    const moveToId = clean(request.data && request.data.moveToId, "", 80);
    if (!categoryId) throw new HttpsError("invalid-argument", "Which category?");

    const { categories, defaultCategory } = await loadCategories(companyId);
    const target = categories.find((row) => row.id === categoryId);
    if (!target) throw new HttpsError("not-found", "Category not found.");
    if (categories.filter((row) => !row.archived).length <= 1 && disposition !== "archive") {
      throw new HttpsError("failed-precondition", "Inventory needs at least one category.");
    }

    const held = await countItemsInCategory(companyId, target.title);

    if (disposition === "archive") {
      const next = categories.map((row) => (row.id === categoryId ? { ...row, archived: true } : row));
      await settingsRef(companyId).set({ inventoryCategories: next, inventoryCategoriesUpdatedAtMs: Date.now() }, { merge: true });
      return { ok: true, categories: next, archived: true, itemsMoved: 0 };
    }

    let destination = "";
    if (disposition === "move") {
      const moveTo = categories.find((row) => row.id === moveToId);
      if (!moveTo) throw new HttpsError("invalid-argument", "Choose a category to move these items into.");
      if (moveTo.id === categoryId) throw new HttpsError("invalid-argument", "Pick a different category.");
      destination = moveTo.title;
    } else if (disposition === "other") {
      const other = categories.find((row) => row.title.toLowerCase() === CATEGORY_FALLBACK.toLowerCase() && row.id !== categoryId);
      destination = other ? other.title : CATEGORY_FALLBACK;
    } else if (held > 0) {
      // No disposition and the category is not empty: refuse rather than
      // silently orphan the items.
      throw new HttpsError(
        "failed-precondition",
        `"${target.title}" still holds ${held} item${held === 1 ? "" : "s"}. Move them, archive the category, or send them to Other.`
      );
    }

    const itemsMoved = destination ? await renameCategoryOnItems(companyId, target.title, destination) : 0;
    let next = categories.filter((row) => row.id !== categoryId);
    if (next.length === 0) next = defaultCategories();
    await settingsRef(companyId).set({
      inventoryCategories: next,
      inventoryDefaultCategory: defaultCategory === target.title ? "" : defaultCategory,
      inventoryCategoriesUpdatedAtMs: Date.now()
    }, { merge: true });

    return { ok: true, categories: next, archived: false, itemsMoved };
  });

  // Merge is delete-with-a-destination said plainly, because "Bracelets into
  // Straps" is what a workshop actually asks for.
  const mergeInventoryCategories = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireInventoryAccess(request, { write: true });
    const fromId = clean(request.data && request.data.fromId, "", 80);
    const intoId = clean(request.data && request.data.intoId, "", 80);
    if (!fromId || !intoId || fromId === intoId) {
      throw new HttpsError("invalid-argument", "Choose two different categories.");
    }
    const { categories, defaultCategory } = await loadCategories(companyId);
    const from = categories.find((row) => row.id === fromId);
    const into = categories.find((row) => row.id === intoId);
    if (!from || !into) throw new HttpsError("not-found", "Category not found.");

    const itemsMoved = await renameCategoryOnItems(companyId, from.title, into.title);
    const next = categories.filter((row) => row.id !== fromId);
    await settingsRef(companyId).set({
      inventoryCategories: next,
      inventoryDefaultCategory: defaultCategory === from.title ? into.title : defaultCategory,
      inventoryCategoriesUpdatedAtMs: Date.now()
    }, { merge: true });

    return { ok: true, categories: next, itemsMoved, into: into.title };
  });

  async function loadAllLocations(companyId) {
    const snap = await locationsRef(companyId).limit(500).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  }

  const listInventoryLocations = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireInventoryAccess(request);
    const rows = await loadAllLocations(companyId);
    rows.sort((a, b) => String(a.path || "").localeCompare(String(b.path || "")));
    return { ok: true, locations: rows };
  });

  const saveInventoryLocation = onCall({ region: REGION }, async (request) => {
    const { uid, companyId } = await requireInventoryAccess(request, { write: true });
    const locationId = clean(request.data && request.data.locationId, "", 80);
    const name = clean(request.data && request.data.name, "", 60).replace(/\s*\/\s*/g, "-");
    const parentId = clean(request.data && request.data.parentId, "", 80);
    if (!name) throw new HttpsError("invalid-argument", "A location name is required.");

    // The whole tree is small by design (≤500 nodes); reading it once makes
    // cycle checks, sibling-name checks and subtree rewrites plain code.
    const all = await loadAllLocations(companyId);
    const byId = new Map(all.map((row) => [row.id, row]));
    const existing = locationId ? byId.get(locationId) : null;
    if (locationId && !existing) throw new HttpsError("not-found", "Location not found.");

    let parent = null;
    if (parentId) {
      parent = byId.get(parentId);
      if (!parent) throw new HttpsError("not-found", "Parent location not found.");
      // A location cannot move under itself or any of its own descendants.
      let cursor = parent;
      while (cursor) {
        if (locationId && cursor.id === locationId) {
          throw new HttpsError("failed-precondition", "A location cannot sit inside itself.");
        }
        cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
      }
      if ((Number(parent.depth) || 1) + 1 > LOCATION_MAX_DEPTH) {
        throw new HttpsError("failed-precondition", `Locations nest at most ${LOCATION_MAX_DEPTH} levels deep.`);
      }
    }

    const clash = all.find((row) =>
      row.id !== locationId
      && String(row.parentId || "") === parentId
      && String(row.name || "").toLowerCase() === name.toLowerCase());
    if (clash) throw new HttpsError("already-exists", "A sibling location already has that name.");

    const parentPath = parent ? String(parent.path || parent.name) : "";
    const newPath = locationPathOf(name, parentPath);
    const newDepth = parent ? (Number(parent.depth) || 1) + 1 : 1;
    const now = Date.now();
    const ref = locationId ? locationsRef(companyId).doc(locationId) : locationsRef(companyId).doc();
    const oldPath = existing ? String(existing.path || existing.name) : "";

    await ref.set({
      companyId,
      name,
      parentId,
      path: newPath,
      depth: newDepth,
      updatedAtMs: now,
      updatedByUid: uid,
      ...(existing ? {} : { createdAtMs: now, createdByUid: uid })
    }, { merge: true });

    let renamedDescendants = 0;
    let relabelledItems = 0;
    if (existing && oldPath && oldPath !== newPath) {
      // Subtree first: every descendant's path starts with the old path.
      const prefix = oldPath + LOCATION_SEPARATOR;
      const batch = db().batch();
      all.forEach((row) => {
        if (row.id === locationId) return;
        const rowPath = String(row.path || "");
        if (!rowPath.startsWith(prefix)) return;
        const rewritten = newPath + LOCATION_SEPARATOR + rowPath.slice(prefix.length);
        batch.set(locationsRef(companyId).doc(row.id), { path: rewritten, updatedAtMs: now }, { merge: true });
        renamedDescendants += 1;
      });
      await batch.commit();

      // Items: exact match or standing somewhere inside the subtree. String
      // rewrite only — a shelf rename moves no goods, so no ledger lines.
      const itemsSnap = await itemsRef(companyId).select("location").limit(5000).get();
      const touched = itemsSnap.docs.filter((doc) => {
        const value = String((doc.data() || {}).location || "");
        return value === oldPath || value.startsWith(prefix);
      });
      for (let start = 0; start < touched.length; start += 400) {
        const chunk = touched.slice(start, start + 400);
        const itemBatch = db().batch();
        chunk.forEach((doc) => {
          const value = String((doc.data() || {}).location || "");
          const rewritten = value === oldPath ? newPath : newPath + LOCATION_SEPARATOR + value.slice(prefix.length);
          itemBatch.set(doc.ref, { location: rewritten, updatedAtMs: now }, { merge: true });
          relabelledItems += 1;
        });
        // eslint-disable-next-line no-await-in-loop
        await itemBatch.commit();
      }
    }

    return { ok: true, locationId: ref.id, path: newPath, renamedDescendants, relabelledItems };
  });

  const deleteInventoryLocation = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireInventoryAccess(request, { write: true });
    const locationId = clean(request.data && request.data.locationId, "", 80);
    if (!locationId) throw new HttpsError("invalid-argument", "locationId is required.");
    const all = await loadAllLocations(companyId);
    const target = all.find((row) => row.id === locationId);
    if (!target) return { ok: true };
    if (all.some((row) => String(row.parentId || "") === locationId)) {
      throw new HttpsError("failed-precondition", "That location has locations inside it — delete or move them first.");
    }
    const path = String(target.path || target.name);
    const itemsSnap = await itemsRef(companyId).select("location").limit(5000).get();
    const inUse = itemsSnap.docs.some((doc) => String((doc.data() || {}).location || "") === path);
    if (inUse) {
      throw new HttpsError("failed-precondition", "Stock is standing in that location — move it first.");
    }
    await locationsRef(companyId).doc(locationId).delete();
    return { ok: true };
  });

  // ---------------------------------------------------------------------------
  // Recipes (BOM)
  //
  // "One strap job = 1 buckle + 20cm leather + 2 screws." A recipe is that
  // list, written once. Applying it to an order reserves EVERY line in one
  // transaction — all or nothing, so a half-reserved job cannot exist.
  // Costing needs no layers here: every purchase batch is already its own
  // item document carrying its own cost.
  // ---------------------------------------------------------------------------

  const recipesRef = (companyId) =>
    db().collection("companies").doc(String(companyId)).collection("inventoryRecipes");

  function cleanRecipeLines(value) {
    const rows = Array.isArray(value) ? value.slice(0, 30) : [];
    return rows
      .map((row) => ({
        itemId: clean(row && row.itemId, "", 80),
        quantity: cleanQuantity(row && row.quantity)
      }))
      .filter((row) => row.itemId && row.quantity > 0);
  }

  const listInventoryRecipes = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireInventoryAccess(request);
    const snap = await recipesRef(companyId).limit(200).get();
    const recipes = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
    recipes.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    return { ok: true, recipes };
  });

  const saveInventoryRecipe = onCall({ region: REGION }, async (request) => {
    const { uid, companyId } = await requireInventoryAccess(request, { write: true });
    const recipeId = clean(request.data && request.data.recipeId, "", 80);
    const input = request.data && request.data.recipe;
    const name = clean(input && input.name, "", 120);
    const lines = cleanRecipeLines(input && input.lines);
    if (!name) throw new HttpsError("invalid-argument", "A recipe name is required.");
    if (lines.length === 0) throw new HttpsError("invalid-argument", "A recipe needs at least one line.");
    const now = Date.now();
    const ref = recipeId ? recipesRef(companyId).doc(recipeId) : recipesRef(companyId).doc();
    await ref.set({
      companyId,
      name,
      notes: clean(input && input.notes, "", 500),
      lines,
      updatedAtMs: now,
      updatedByUid: uid
    }, { merge: true });
    return { ok: true, recipeId: ref.id };
  });

  const deleteInventoryRecipe = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireInventoryAccess(request, { write: true });
    const recipeId = clean(request.data && request.data.recipeId, "", 80);
    if (!recipeId) throw new HttpsError("invalid-argument", "recipeId is required.");
    await recipesRef(companyId).doc(recipeId).delete();
    return { ok: true };
  });

  // All-or-nothing: every capacity check runs before any write, inside one
  // transaction, so failing on line 3 leaves lines 1 and 2 untouched.
  const applyRecipeToOrder = onCall({ region: REGION }, async (request) => {
    const { uid, companyId } = await requireInventoryAccess(request, { write: true });
    const recipeId = clean(request.data && request.data.recipeId, "", 80);
    const orderId = clean(request.data && request.data.orderId, "", 200);
    const multiplierRaw = cleanQuantity(request.data && request.data.multiplier);
    const multiplier = multiplierRaw > 0 ? Math.min(multiplierRaw, 100) : 1;
    if (!recipeId || !orderId) throw new HttpsError("invalid-argument", "recipeId and orderId are required.");
    const now = Date.now();

    const outcome = await db().runTransaction(async (tx) => {
      const recipeSnap = await tx.get(recipesRef(companyId).doc(recipeId));
      if (!recipeSnap.exists) throw new HttpsError("not-found", "Recipe not found.");
      const recipe = recipeSnap.data() || {};
      const lines = cleanRecipeLines(recipe.lines);
      if (lines.length === 0) throw new HttpsError("failed-precondition", "That recipe has no lines.");

      // Read every component first (Firestore: all reads before any write).
      const snaps = new Map();
      for (const line of lines) {
        if (!snaps.has(line.itemId)) {
          // eslint-disable-next-line no-await-in-loop
          snaps.set(line.itemId, await tx.get(itemsRef(companyId).doc(line.itemId)));
        }
      }

      // Pass 1: every line must fit, or nothing happens.
      const plans = [];
      for (const line of lines) {
        const snap = snaps.get(line.itemId);
        if (!snap || !snap.exists) {
          throw new HttpsError("failed-precondition", "A recipe line points at an item that no longer exists.");
        }
        const item = snap.data() || {};
        const itemName = clean(item.name, "item", 160);
        if (String(item.ownership) === "customer") {
          throw new HttpsError("failed-precondition", `"${itemName}" is a customer's own item and cannot be reserved.`);
        }
        if (["sold", "used", "archived", "removed"].includes(String(item.status))) {
          throw new HttpsError("failed-precondition", `"${itemName}" is no longer available to reserve.`);
        }
        const isUnique = String(item.trackingType) === "unique";
        const reservations = cleanReservations(item.reservations);
        const others = reservations.filter((row) => row.orderId !== orderId);
        const mine = reservations.find((row) => row.orderId === orderId);
        const wanted = isUnique ? 1 : roundMoney(line.quantity * multiplier);
        if (isUnique) {
          if (others.length > 0) {
            throw new HttpsError("failed-precondition", `"${itemName}" is already reserved for another order.`);
          }
        } else {
          const onHand = cleanQuantity((item.quantity || {}).onHand);
          const reservedElsewhere = others.reduce((sum, row) => sum + row.quantity, 0);
          const free = roundMoney(onHand - reservedElsewhere);
          const alreadyMine = mine ? mine.quantity : 0;
          if (roundMoney(alreadyMine + wanted) > free) {
            throw new HttpsError(
              "failed-precondition",
              `Not enough "${itemName}" — ${roundMoney(free - alreadyMine)} free, the recipe needs ${wanted}.`
            );
          }
        }
        plans.push({ snap, item, isUnique, others, mine, wanted });
      }

      // Pass 2: everything fits — write all the reservations.
      for (const plan of plans) {
        if (plan.isUnique) {
          tx.set(plan.snap.ref, {
            status: "reserved",
            reservedForOrderId: orderId,
            reservations: [{ orderId, quantity: 1, createdAtMs: now }],
            reservedOrderIds: [orderId],
            updatedAtMs: now,
            updatedByUid: uid
          }, { merge: true });
          continue;
        }
        const merged = plan.mine
          ? [...plan.others, { orderId, quantity: roundMoney(plan.mine.quantity + plan.wanted), createdAtMs: plan.mine.createdAtMs || now }]
          : [...plan.others, { orderId, quantity: plan.wanted, createdAtMs: now }];
        const totalReserved = roundMoney(merged.reduce((sum, row) => sum + row.quantity, 0));
        tx.set(plan.snap.ref, {
          reservations: merged,
          reservedOrderIds: merged.map((row) => row.orderId),
          quantity: { ...(plan.item.quantity || {}), reserved: totalReserved },
          status: reservationStatus(plan.item, totalReserved),
          updatedAtMs: now,
          updatedByUid: uid
        }, { merge: true });
      }
      return { reservedLines: plans.length, recipeName: clean(recipe.name, "", 120) };
    });

    return { ok: true, ...outcome };
  });

  // ---------------------------------------------------------------------------
  // Consuming and swapping reserved stock
  //
  // Reserving promised the part; consuming is the moment it actually goes into
  // the job. Only what THIS order holds can be consumed — consumption without a
  // reservation would bypass the double-promise guard reserving exists for.
  // ---------------------------------------------------------------------------

  const consumeInventoryForOrder = onCall({ region: REGION }, async (request) => {
    const { uid, email, companyId } = await requireInventoryAccess(request, { write: true });
    const itemId = clean(request.data && request.data.itemId, "", 80);
    const orderId = clean(request.data && request.data.orderId, "", 200);
    if (!itemId || !orderId) throw new HttpsError("invalid-argument", "itemId and orderId are required.");

    const ref = itemsRef(companyId).doc(itemId);
    const now = Date.now();
    const outcome = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError("not-found", "Inventory item not found.");
      const item = snap.data() || {};
      const reservations = cleanReservations(item.reservations);
      const mine = reservations.find((row) => row.orderId === orderId);
      if (!mine) throw new HttpsError("failed-precondition", "Nothing is reserved for this order on that item.");

      const isUnique = String(item.trackingType) === "unique";
      if (isUnique) {
        tx.set(ref, {
          status: "used",
          reservations: [],
          reservedOrderIds: [],
          reservedForOrderId: "",
          updatedAtMs: now,
          updatedByUid: uid
        }, { merge: true });
        recordMovement(tx, companyId, {
          item, itemId: ref.id, kind: "used",
          delta: -1,
          unitCost: Number(item.valuationCost) || 0,
          at: now, uid, email, ref: orderId, note: ""
        });
        return { consumed: 1 };
      }

      // Default is the whole reservation; a smaller quantity consumes part and
      // leaves the rest still promised to this order.
      const requested = cleanQuantity(request.data && request.data.quantity);
      const consuming = requested > 0 ? requested : mine.quantity;
      if (consuming > mine.quantity) {
        throw new HttpsError("failed-precondition", `Only ${mine.quantity} is reserved for this order.`);
      }
      const onHand = cleanQuantity((item.quantity || {}).onHand);
      if (consuming > onHand) {
        throw new HttpsError("failed-precondition", `Only ${onHand} on hand.`);
      }

      const keptMine = roundMoney(mine.quantity - consuming);
      const next = reservations
        .map((row) => (row.orderId === orderId ? { ...row, quantity: keptMine } : row))
        .filter((row) => row.quantity > 0);
      const totalReserved = roundMoney(next.reduce((sum, row) => sum + row.quantity, 0));
      const nextOnHand = roundMoney(onHand - consuming);
      tx.set(ref, {
        reservations: next,
        reservedOrderIds: next.map((row) => row.orderId),
        quantity: { ...(item.quantity || {}), onHand: nextOnHand, reserved: totalReserved },
        status: reservationStatus(item, totalReserved, nextOnHand),
        updatedAtMs: now,
        updatedByUid: uid
      }, { merge: true });
      recordMovement(tx, companyId, {
        item, itemId: ref.id, kind: "used",
        delta: roundSigned(-consuming),
        unitCost: Number(item.valuationCost) || 0,
        at: now, uid, email, ref: orderId, note: ""
      });
      return { consumed: consuming, remaining: nextOnHand, stillReserved: keptMine };
    });

    return { ok: true, ...outcome };
  });

  // Wrong part picked, right one found: one transaction moves the promise so
  // there is no moment where the order holds both or neither.
  const swapInventoryForOrder = onCall({ region: REGION }, async (request) => {
    const { uid, companyId } = await requireInventoryAccess(request, { write: true });
    const orderId = clean(request.data && request.data.orderId, "", 200);
    const fromItemId = clean(request.data && request.data.fromItemId, "", 80);
    const toItemId = clean(request.data && request.data.toItemId, "", 80);
    if (!orderId || !fromItemId || !toItemId) {
      throw new HttpsError("invalid-argument", "orderId, fromItemId and toItemId are required.");
    }
    if (fromItemId === toItemId) throw new HttpsError("invalid-argument", "Pick a different item to swap to.");

    const fromRef = itemsRef(companyId).doc(fromItemId);
    const toRef = itemsRef(companyId).doc(toItemId);
    const now = Date.now();

    const outcome = await db().runTransaction(async (tx) => {
      const [fromSnap, toSnap] = await Promise.all([tx.get(fromRef), tx.get(toRef)]);
      if (!fromSnap.exists || !toSnap.exists) throw new HttpsError("not-found", "Inventory item not found.");
      const fromItem = fromSnap.data() || {};
      const toItem = toSnap.data() || {};

      const fromReservations = cleanReservations(fromItem.reservations);
      const mine = fromReservations.find((row) => row.orderId === orderId);
      if (!mine) throw new HttpsError("failed-precondition", "Nothing is reserved for this order on that item.");

      if (String(toItem.ownership) === "customer") {
        throw new HttpsError("failed-precondition", "A customer's own item is not stock and cannot be reserved.");
      }
      if (["sold", "used", "archived", "removed"].includes(String(toItem.status))) {
        throw new HttpsError("failed-precondition", "That item is no longer available to reserve.");
      }

      const toIsUnique = String(toItem.trackingType) === "unique";
      const toReservations = cleanReservations(toItem.reservations).filter((row) => row.orderId !== orderId);
      const requested = cleanQuantity(request.data && request.data.quantity);
      const wanted = toIsUnique ? 1 : (requested > 0 ? requested : mine.quantity);

      if (toIsUnique) {
        if (toReservations.length > 0) {
          throw new HttpsError("failed-precondition", "That item is already reserved for another order.");
        }
      } else {
        const toOnHand = cleanQuantity((toItem.quantity || {}).onHand);
        const reservedElsewhere = toReservations.reduce((sum, row) => sum + row.quantity, 0);
        const free = roundMoney(toOnHand - reservedElsewhere);
        if (wanted <= 0) throw new HttpsError("invalid-argument", "Enter how much to reserve.");
        if (wanted > free) {
          throw new HttpsError(
            "failed-precondition",
            `Only ${free} available to reserve — ${reservedElsewhere} is already promised to other orders.`
          );
        }
      }

      // Release side.
      const fromNext = fromReservations.filter((row) => row.orderId !== orderId);
      const fromReserved = roundMoney(fromNext.reduce((sum, row) => sum + row.quantity, 0));
      const fromIsUnique = String(fromItem.trackingType) === "unique";
      tx.set(fromRef, {
        reservations: fromNext,
        reservedOrderIds: fromNext.map((row) => row.orderId),
        reservedForOrderId: fromIsUnique ? "" : clean(fromItem.reservedForOrderId, "", 200),
        quantity: fromIsUnique ? fromItem.quantity : { ...(fromItem.quantity || {}), reserved: fromReserved },
        status: reservationStatus(fromItem, fromReserved),
        updatedAtMs: now,
        updatedByUid: uid
      }, { merge: true });

      // Reserve side.
      if (toIsUnique) {
        tx.set(toRef, {
          status: "reserved",
          reservedForOrderId: orderId,
          reservations: [{ orderId, quantity: 1, createdAtMs: now }],
          reservedOrderIds: [orderId],
          updatedAtMs: now,
          updatedByUid: uid
        }, { merge: true });
      } else {
        const toNext = [...toReservations, { orderId, quantity: wanted, createdAtMs: now }];
        const toReserved = roundMoney(toNext.reduce((sum, row) => sum + row.quantity, 0));
        tx.set(toRef, {
          reservations: toNext,
          reservedOrderIds: toNext.map((row) => row.orderId),
          quantity: { ...(toItem.quantity || {}), reserved: toReserved },
          status: reservationStatus(toItem, toReserved),
          updatedAtMs: now,
          updatedByUid: uid
        }, { merge: true });
      }
      return { released: mine.quantity, reserved: wanted };
    });

    return { ok: true, ...outcome };
  });

  return {
    saveInventoryItem,
    setInventoryItemStatus,
    deleteInventoryItem,
    listInventoryItems,
    getInventorySummary,
    importOpeningStock,
    parseOpeningStock,
    startStocktake,
    saveStocktakeCounts,
    commitStocktake,
    listStocktakes,
    getStocktake,
    cancelStocktake,
    getInventoryReport,
    listInventoryMovements,
    savePurchase,
    receivePurchase,
    listPurchases,
    deletePurchase,
    linkPurchaseToBankTransaction,
    saveSupplier,
    listSuppliers,
    reserveInventoryForOrder,
    releaseInventoryFromOrder,
    getOrderInventory,
    recordInventoryLoss,
    listInventoryCategories,
    saveInventoryCategories,
    deleteInventoryCategory,
    mergeInventoryCategories,
    listInventoryLocations,
    saveInventoryLocation,
    deleteInventoryLocation,
    listInventoryRecipes,
    saveInventoryRecipe,
    deleteInventoryRecipe,
    applyRecipeToOrder,
    consumeInventoryForOrder,
    swapInventoryForOrder,
    _internal: { saveItemForWorkspace, itemsRef, normalizeItemInput, costSummary, allocateExtras, purchaseTotals, splitDelimited, guessMapping, spreadsheetNumber, roundSigned, roundUnitMoney, STATUS_TRANSITIONS, DEFAULT_CATEGORIES, categoriesFromSettings, defaultCategories }
  };
}

module.exports = { createInventoryFunctions };
