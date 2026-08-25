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

  // A per-unit cost can legitimately be finer than a penny: £6.25 of shipping
  // spread over 20 pieces is £0.3125 each, and rounding that to £0.31 loses 5p
  // off the line. Four places keeps the arithmetic exact; screens still format
  // to two.
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
    ["sku", ["sku", "code", "part number", "part no"]],
    ["onHand", ["on hand", "onhand", "qty", "quantity", "stock", "count", "amount"]],
    ["unit", ["unit", "units", "uom"]],
    ["lowStockAt", ["reorder at", "reorder", "min", "minimum", "low stock"]],
    ["purchasePrice", ["purchase price", "price", "cost", "unit price", "unit cost", "buy price"]],
    ["location", ["location", "where", "shelf", "bin", "storage"]],
    ["supplierName", ["supplier", "vendor", "from", "bought from"]],
    ["purchaseDate", ["purchase date", "date", "bought", "acquired"]],
    ["notes", ["notes", "note", "comment", "comments"]]
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
    await requireInventoryAccess(request);
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
          written += 1;
        }
        tx.set(ref, { inventoryCounter: counter }, { merge: true });
      });
    }

    return { ok: true, imported: written };
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
        if (existing.status === "received") {
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

  const receivePurchase = onCall({ region: REGION }, async (request) => {
    const { uid, companyId } = await requireInventoryAccess(request, { write: true });
    const purchaseId = clean(request.data && request.data.purchaseId, "", 80);
    if (!purchaseId) throw new HttpsError("invalid-argument", "purchaseId is required.");
    const now = Date.now();

    const ref = purchasesRef(companyId).doc(purchaseId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "Purchase not found.");
    const purchase = snap.data() || {};
    if (purchase.status === "received") return { ok: true, alreadyReceived: true };

    const itemIds = Array.isArray(purchase.itemIds) ? purchase.itemIds : [];
    const batch = db().batch();
    itemIds.forEach((itemId) => {
      batch.set(itemsRef(companyId).doc(itemId), {
        status: "available",
        updatedAtMs: now,
        updatedByUid: uid
      }, { merge: true });
    });
    batch.set(ref, { status: "received", receivedAtMs: now, updatedAtMs: now, updatedByUid: uid }, { merge: true });
    await batch.commit();

    return { ok: true, received: itemIds.length };
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
    if (purchase.status === "received") {
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
        status: totalReserved > 0 ? "reserved" : "available",
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
        status: ["used", "sold", "archived"].includes(String(item.status))
          ? item.status
          : (totalReserved > 0 ? "reserved" : "available"),
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
      return {
        id: doc.id,
        number: item.number || "",
        name: item.name || "",
        category: item.category || "",
        trackingType: item.trackingType || "unique",
        unit: (item.quantity || {}).unit || "",
        status: item.status || "available",
        quantity,
        unitCost,
        lineCost
      };
    });

    return { ok: true, orderId, items, totalCost: total };
  });

  return {
    saveInventoryItem,
    setInventoryItemStatus,
    deleteInventoryItem,
    listInventoryItems,
    getInventorySummary,
    importOpeningStock,
    parseOpeningStock,
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
    _internal: { normalizeItemInput, costSummary, allocateExtras, purchaseTotals, splitDelimited, guessMapping, spreadsheetNumber, STATUS_TRANSITIONS, DEFAULT_CATEGORIES }
  };
}

module.exports = { createInventoryFunctions };
