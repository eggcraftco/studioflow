import Foundation
import FirebaseFunctions
import FirebaseStorage

// Inventory on Mac and iPhone. Mirrors functions/inventory.js and the web app:
// the money rules, the item numbering and the status lifecycle all live on the
// server, so this file carries shapes and call plumbing only. Two screens that
// each do their own arithmetic will eventually disagree, and the one a person
// is looking at will be the wrong one.


/// Inventory money, formatted the way the rest of the app formats money:
/// grouped thousands and the user's decimal separator. `String(format:)`
/// ignored both, so £6,210.00 came out as "£6210.00".
func inventoryMoney(_ symbol: String, _ value: Double) -> String {
    let separator = UserDefaults.standard.string(forKey: "seciliOndalik") ?? "."
    return symbol + formatFiyat(value, ondalik: separator)
}

enum InventoryTrackingType: String, CaseIterable, Codable {
    case unique
    case quantity

    var label: String {
        switch self {
        case .unique: return "Unique"
        case .quantity: return "Quantity"
        }
    }
}

enum InventoryOwnership: String, Codable {
    case business
    case customer
}

enum InventoryStatus: String, CaseIterable, Codable {
    // "reserved" means fully promised; "partiallyReserved" is a quantity item
    // with some — not all — of its stock promised to orders. Unique items
    // never get partial. "removed" is where a recorded loss leaves a unique
    // item: gone for a reason, not sold and not archived.
    case available, reserved, partiallyReserved, incoming, used, sold, removed, archived

    var label: String {
        switch self {
        case .available: return "Available"
        case .reserved: return "Reserved"
        case .partiallyReserved: return "Partially Reserved"
        case .incoming: return "Incoming"
        case .used: return "Used"
        case .sold: return "Sold"
        case .removed: return "Removed"
        case .archived: return "Archived"
        }
    }
}

/// The starting point for a brand-new workspace only. The live list belongs to
/// the workspace (Inventory → Categories on web) and arrives with the item
/// list; this is the fallback for the first paint before that lands.
let inventoryCategories = [
    "Watches", "Dials", "Movements", "Bracelets", "Straps",
    "Parts", "Consumables", "Packaging", "Tools", "Other"
]

/// One of the workspace's own categories. An item stores the TITLE, so a rename
/// is carried to the items server-side; the id only lets an editor follow a row
/// across a rename.
struct InventoryCategory: Identifiable, Equatable {
    let id: String
    var title: String
    var icon: String
    var archived: Bool
    var itemCount: Int

    init?(_ raw: [String: Any]) {
        guard let title = (raw["title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !title.isEmpty else { return nil }
        self.id = (raw["id"] as? String) ?? title.lowercased()
        self.title = title
        self.icon = (raw["icon"] as? String) ?? ""
        self.archived = (raw["archived"] as? Bool) ?? false
        self.itemCount = (raw["itemCount"] as? NSNumber)?.intValue ?? 0
    }
}

struct InventoryAdditionalCost: Identifiable, Equatable {
    let id = UUID()
    var label: String
    var amount: Double
}

/// One reservation row on an item — the server writes these; every reserved
/// unit names the order it is promised to.
struct InventoryReservation: Equatable {
    let orderId: String
    let quantity: Double
    let createdAtMs: Double

    init?(_ raw: [String: Any]) {
        guard let orderId = raw["orderId"] as? String, !orderId.isEmpty else { return nil }
        self.orderId = orderId
        quantity = (raw["quantity"] as? NSNumber)?.doubleValue ?? 0
        createdAtMs = (raw["createdAtMs"] as? NSNumber)?.doubleValue ?? 0
    }
}

struct InventoryItem: Identifiable, Equatable {
    let id: String
    var number: String
    var name: String
    var category: String
    var trackingType: InventoryTrackingType
    var ownership: InventoryOwnership
    var status: InventoryStatus
    var brand: String
    var model: String
    var reference: String
    var serialNumber: String
    var year: String
    var condition: String
    var sku: String
    var location: String
    var supplierName: String
    var purchaseDate: String
    var notes: String
    var onHand: Double
    var reserved: Double
    var unit: String
    var lowStockAt: Double
    var purchasePrice: Double
    var additionalCostsTotal: Double
    var internalTotalCost: Double
    var valuationCost: Double
    var photos: [String]
    var description: String
    var currentValueEst: Double
    var additionalCosts: [InventoryAdditionalCost]
    var reservations: [InventoryReservation]
    var purchaseId: String
    var purchaseNumber: String
    var updatedAtMs: Double
    var tags: [String]

    init?(_ raw: [String: Any]) {
        guard let id = raw["id"] as? String else { return nil }
        self.id = id
        number = raw["number"] as? String ?? ""
        name = raw["name"] as? String ?? ""
        category = raw["category"] as? String ?? "Other"
        trackingType = InventoryTrackingType(rawValue: raw["trackingType"] as? String ?? "") ?? .unique
        ownership = InventoryOwnership(rawValue: raw["ownership"] as? String ?? "") ?? .business
        status = InventoryStatus(rawValue: raw["status"] as? String ?? "") ?? .available
        brand = raw["brand"] as? String ?? ""
        model = raw["model"] as? String ?? ""
        reference = raw["reference"] as? String ?? ""
        serialNumber = raw["serialNumber"] as? String ?? ""
        year = raw["year"] as? String ?? ""
        condition = raw["condition"] as? String ?? ""
        sku = raw["sku"] as? String ?? ""
        location = raw["location"] as? String ?? ""
        supplierName = raw["supplierName"] as? String ?? ""
        purchaseDate = raw["purchaseDate"] as? String ?? ""
        notes = raw["notes"] as? String ?? ""
        let quantity = raw["quantity"] as? [String: Any] ?? [:]
        onHand = (quantity["onHand"] as? NSNumber)?.doubleValue ?? 0
        reserved = (quantity["reserved"] as? NSNumber)?.doubleValue ?? 0
        unit = quantity["unit"] as? String ?? ""
        lowStockAt = (raw["lowStockAt"] as? NSNumber)?.doubleValue ?? 0
        purchasePrice = (raw["purchasePrice"] as? NSNumber)?.doubleValue ?? 0
        additionalCostsTotal = (raw["additionalCostsTotal"] as? NSNumber)?.doubleValue ?? 0
        internalTotalCost = (raw["internalTotalCost"] as? NSNumber)?.doubleValue ?? 0
        valuationCost = (raw["valuationCost"] as? NSNumber)?.doubleValue ?? 0
        photos = (raw["photos"] as? [String]) ?? []
        description = raw["description"] as? String ?? ""
        currentValueEst = (raw["currentValueEst"] as? NSNumber)?.doubleValue ?? 0
        additionalCosts = (raw["additionalCosts"] as? [[String: Any]] ?? []).map {
            InventoryAdditionalCost(
                label: $0["label"] as? String ?? "",
                amount: ($0["amount"] as? NSNumber)?.doubleValue ?? 0
            )
        }
        reservations = (raw["reservations"] as? [[String: Any]] ?? []).compactMap(InventoryReservation.init)
        purchaseId = raw["purchaseId"] as? String ?? ""
        purchaseNumber = raw["purchaseNumber"] as? String ?? ""
        updatedAtMs = (raw["updatedAtMs"] as? NSNumber)?.doubleValue ?? 0
        tags = (raw["tags"] as? [String]) ?? []
    }

    /// A unique item is one object, whatever a stale record happens to say.
    var displayOnHand: Double { trackingType == .unique ? 1 : onHand }

    /// The same rule the server uses for the totals, so a row and the header
    /// can never disagree.
    var lineValue: Double {
        guard ownership != .customer else { return 0 }
        return trackingType == .unique ? valuationCost : valuationCost * displayOnHand
    }

    var isLowStock: Bool {
        trackingType == .quantity && lowStockAt > 0 && displayOnHand <= lowStockAt
    }

    /// What can honestly be promised to a new order. Something sold, used up or
    /// archived is out of the story whatever the count says — the server refuses
    /// to reserve it, so offering it would only be a dead end.
    var freeToReserve: Double {
        if [.sold, .used, .archived].contains(status) { return 0 }
        if trackingType == .unique { return status == .available ? 1 : 0 }
        return max(0, onHand - reserved)
    }

    /// The server's STATUS_TRANSITIONS, mirrored so no button or menu entry is
    /// offered that the callable would refuse. "reserved" is deliberately never
    /// a target — and neither is "partiallyReserved": reserving must go through
    /// reserveInventoryForOrder, which writes the reservation arrays — a bare
    /// status flip would promise the item to no order at all.
    var allowedNextStatuses: [InventoryStatus] {
        switch status {
        case .available: return [.used, .sold, .incoming, .archived]
        case .reserved: return [.available, .used, .sold, .archived]
        case .partiallyReserved: return [.available, .used, .sold, .archived]
        case .incoming: return [.available, .archived]
        case .used: return [.available, .archived]
        case .sold: return [.archived]
        case .removed: return [.available, .archived]
        case .archived: return [.available]
        }
    }

    /// EVERY field the server's saveInventoryItem expects, mirroring the web's
    /// inventoryItemToInput. The server rebuilds the WHOLE document from this
    /// input (normalizeItemInput) — reservations, status and number are carried
    /// over server-side, but any field left out of the payload is blanked. So
    /// even a location-only edit must send everything.
    var inventoryItemInput: [String: Any] {
        [
            "name": name, "category": category,
            "trackingType": trackingType.rawValue, "ownership": ownership.rawValue,
            "brand": brand, "model": model, "reference": reference,
            "serialNumber": serialNumber, "year": year, "condition": condition,
            "description": description, "sku": sku, "location": location,
            "supplierName": supplierName, "purchaseDate": purchaseDate, "notes": notes,
            "photos": photos,
            // Key-present semantics on the server: a payload without "tags"
            // leaves them alone, [] clears them. The full-input path always
            // sends them so edits round-trip.
            "tags": tags,
            "onHand": trackingType == .quantity ? onHand : 1,
            "unit": trackingType == .quantity ? unit : "",
            "lowStockAt": lowStockAt,
            "purchasePrice": purchasePrice,
            "additionalCosts": additionalCosts.map { ["label": $0.label, "amount": $0.amount] },
            "currentValueEst": currentValueEst
        ]
    }
}

/// One line of the movement ledger, as listInventoryMovements returns it.
struct InventoryMovement: Identifiable, Equatable {
    let id: String
    let kind: String
    let delta: Double
    let valueDelta: Double
    let at: Double
    let byEmail: String
    let note: String

    init?(_ raw: [String: Any]) {
        guard let id = raw["id"] as? String else { return nil }
        self.id = id
        kind = raw["kind"] as? String ?? ""
        delta = (raw["delta"] as? NSNumber)?.doubleValue ?? 0
        valueDelta = (raw["valueDelta"] as? NSNumber)?.doubleValue ?? 0
        at = (raw["at"] as? NSNumber)?.doubleValue ?? 0
        byEmail = raw["byEmail"] as? String ?? ""
        note = raw["note"] as? String ?? ""
    }

    /// The same words the web item panel uses for its history list, so the
    /// translation table needs one entry per kind, not one per platform.
    /// A recorded loss writes a ledger line whose kind IS the reason —
    /// returned, damaged, lost or wastage — so the answer to "where did that
    /// stock go" reads straight off the history.
    var kindLabel: String {
        switch kind {
        case "openingStock": return "Opening stock"
        case "purchase": return "Purchase"
        case "adjustment": return "Adjustment"
        case "stocktake": return "Stocktake"
        case "used": return "Used"
        case "sold": return "Sold"
        case "removed": return "Removed"
        case "moved": return "Moved"
        case "returned": return "Returned to supplier"
        case "damaged": return "Damaged"
        case "lost": return "Lost"
        case "wastage": return "Wastage"
        default: return kind
        }
    }
}

/// One link a library file carries — the record it points at and how the
/// client portal is allowed to see it. Links are the whole design: the bytes
/// live once, everything else points.
struct LibraryFileLink: Equatable {
    let kind: String
    let id: String
    let label: String
    let audience: String
    let displayName: String

    init(_ raw: [String: Any]) {
        kind = raw["kind"] as? String ?? ""
        id = raw["id"] as? String ?? ""
        label = raw["label"] as? String ?? ""
        audience = raw["audience"] as? String ?? "team"
        displayName = raw["displayName"] as? String ?? ""
    }
}

/// One line of a library file's history, as the server recorded it.
struct LibraryFileActivity: Equatable {
    let atMs: Double
    let byEmail: String
    let action: String
    let detail: String

    init(_ raw: [String: Any]) {
        atMs = (raw["atMs"] as? NSNumber)?.doubleValue ?? 0
        byEmail = raw["byEmail"] as? String ?? ""
        action = raw["action"] as? String ?? ""
        detail = raw["detail"] as? String ?? ""
    }
}

/// One file from the central library, as listLibraryFiles returns it. The
/// server sends more fields than this; the screens only need enough to name a
/// file, size it, date it, open it and show where it points.
struct LibraryFile: Identifiable, Equatable {
    let id: String
    let fileName: String
    let displayName: String
    let fileSize: Int64
    let storagePath: String
    let links: [LibraryFileLink]
    let linkKinds: [String]
    let clientPortalVisible: Bool
    let activity: [LibraryFileActivity]
    let trashedAtMs: Double
    let updatedAtMs: Double

    init?(_ raw: [String: Any]) {
        guard let id = raw["id"] as? String else { return nil }
        self.id = id
        fileName = raw["fileName"] as? String ?? ""
        displayName = raw["displayName"] as? String ?? ""
        fileSize = (raw["fileSize"] as? NSNumber)?.int64Value ?? 0
        storagePath = raw["storagePath"] as? String ?? ""
        links = (raw["links"] as? [[String: Any]] ?? []).map(LibraryFileLink.init)
        linkKinds = raw["linkKinds"] as? [String] ?? []
        clientPortalVisible = (raw["clientPortalVisible"] as? Bool) ?? false
        activity = (raw["activity"] as? [[String: Any]] ?? []).map(LibraryFileActivity.init)
        trashedAtMs = (raw["trashedAtMs"] as? NSNumber)?.doubleValue ?? 0
        updatedAtMs = (raw["updatedAtMs"] as? NSNumber)?.doubleValue ?? 0
    }
}

/// What the shelf value did over the last 30 days. `available` is false while
/// the ledger is younger than the window — a percentage computed over a period
/// the ledger does not cover would be an invented number.
struct InventoryMonthlyChange {
    var available: Bool = false
    var netValue30d: Double = 0
    var pct: Double = 0
    var ledgerStartsMs: Double = 0

    init() {}

    init(_ raw: [String: Any]) {
        available = (raw["available"] as? Bool) ?? false
        netValue30d = (raw["netValue30d"] as? NSNumber)?.doubleValue ?? 0
        pct = (raw["pct"] as? NSNumber)?.doubleValue ?? 0
        ledgerStartsMs = (raw["ledgerStartsMs"] as? NSNumber)?.doubleValue ?? 0
    }
}

struct InventorySummary {
    var totalValue: Double = 0
    var uniqueCount: Int = 0
    var uniqueValue: Double = 0
    var quantityCount: Int = 0
    var quantityValue: Double = 0
    var reservedValue: Double = 0
    var reservedCount: Int = 0
    var incomingCount: Int = 0
    var incomingValue: Double = 0
    var lowStockCount: Int = 0
    var customerOwnedCount: Int = 0
    var monthlyChange = InventoryMonthlyChange()

    init(_ raw: [String: Any]) {
        totalValue = (raw["totalValue"] as? NSNumber)?.doubleValue ?? 0
        uniqueCount = (raw["uniqueCount"] as? NSNumber)?.intValue ?? 0
        uniqueValue = (raw["uniqueValue"] as? NSNumber)?.doubleValue ?? 0
        quantityCount = (raw["quantityCount"] as? NSNumber)?.intValue ?? 0
        quantityValue = (raw["quantityValue"] as? NSNumber)?.doubleValue ?? 0
        reservedValue = (raw["reservedValue"] as? NSNumber)?.doubleValue ?? 0
        reservedCount = (raw["reservedCount"] as? NSNumber)?.intValue ?? 0
        incomingCount = (raw["incomingCount"] as? NSNumber)?.intValue ?? 0
        incomingValue = (raw["incomingValue"] as? NSNumber)?.doubleValue ?? 0
        lowStockCount = (raw["lowStockCount"] as? NSNumber)?.intValue ?? 0
        customerOwnedCount = (raw["customerOwnedCount"] as? NSNumber)?.intValue ?? 0
        monthlyChange = InventoryMonthlyChange(raw["monthlyChange"] as? [String: Any] ?? [:])
    }
}

struct PurchaseLine: Identifiable, Equatable {
    let id = UUID()
    var name: String = ""
    var category: String = "Other"
    var trackingType: InventoryTrackingType = .unique
    var quantity: Double = 1
    var unit: String = ""
    var unitPrice: Double = 0
    var reference: String = ""
    var serialNumber: String = ""
    var location: String = ""

    var payload: [String: Any] {
        [
            "name": name, "category": category, "trackingType": trackingType.rawValue,
            "quantity": trackingType == .unique ? 1 : quantity,
            "unit": trackingType == .unique ? "" : unit,
            "unitPrice": unitPrice, "reference": reference,
            "serialNumber": serialNumber, "location": location
        ]
    }
}

/// One purchase line as the server returned it — just enough to receive a
/// delivery against: what was ordered and how much of it has already landed.
/// The index is the line's identity; receivePurchase addresses lines by it.
struct PurchaseReceiptLine: Identifiable, Equatable {
    let index: Int
    var id: Int { index }
    var name: String
    var trackingType: InventoryTrackingType
    var quantity: Double
    var unit: String
    /// How much has actually landed. Absent on purchases from before slice I3,
    /// which is the same thing as nothing having been counted in yet.
    var receivedQuantity: Double

    init(index: Int, _ raw: [String: Any]) {
        self.index = index
        name = raw["name"] as? String ?? ""
        trackingType = InventoryTrackingType(rawValue: raw["trackingType"] as? String ?? "") ?? .unique
        quantity = (raw["quantity"] as? NSNumber)?.doubleValue ?? 0
        unit = raw["unit"] as? String ?? ""
        receivedQuantity = (raw["receivedQuantity"] as? NSNumber)?.doubleValue ?? 0
    }

    var ordered: Double { trackingType == .unique ? 1 : quantity }
    /// What the courier still owes on this line, rounded the way the server
    /// rounds so "0.1 left" never lingers from floating-point dust.
    var outstanding: Double { max(0, ((ordered - receivedQuantity) * 100).rounded() / 100) }
}

struct Purchase: Identifiable, Equatable {
    let id: String
    var number: String
    var supplierName: String
    var purchaseDate: String
    var reference: String
    var lines: [PurchaseReceiptLine]
    var goodsTotal: Double
    var shipping: Double
    var otherCosts: Double
    var total: Double
    /// "ordered" → "partiallyReceived" → "received"; the middle stop arrived
    /// with slice I3, when a delivery could finally land in pieces.
    var status: String
    var bankTransactionId: String

    var lineCount: Int { lines.count }
    var isReceived: Bool { status == "received" }
    var isPartiallyReceived: Bool { status == "partiallyReceived" }

    init?(_ raw: [String: Any]) {
        guard let id = raw["id"] as? String else { return nil }
        self.id = id
        number = raw["number"] as? String ?? ""
        supplierName = raw["supplierName"] as? String ?? ""
        purchaseDate = raw["purchaseDate"] as? String ?? ""
        reference = raw["reference"] as? String ?? ""
        lines = (raw["lines"] as? [[String: Any]] ?? []).enumerated()
            .map { PurchaseReceiptLine(index: $0.offset, $0.element) }
        goodsTotal = (raw["goodsTotal"] as? NSNumber)?.doubleValue ?? 0
        shipping = (raw["shipping"] as? NSNumber)?.doubleValue ?? 0
        otherCosts = (raw["otherCosts"] as? NSNumber)?.doubleValue ?? 0
        total = (raw["total"] as? NSNumber)?.doubleValue ?? 0
        status = raw["status"] as? String ?? ""
        bankTransactionId = raw["bankTransactionId"] as? String ?? ""
    }
}

struct Supplier: Identifiable, Equatable {
    var id: String
    var name: String
    var email: String
    var phone: String
    var website: String
    var notes: String
    // The paperwork fields: what an invoice or a customs form asks for.
    var code: String
    var address: String
    var vatNumber: String
    var currency: String
    var isImplied: Bool
    var spent: Double
    var purchaseCount: Int
    var lineCount: Int
    var lastDate: String
    var matchedCount: Int

    init(_ raw: [String: Any]) {
        id = raw["id"] as? String ?? ""
        name = raw["name"] as? String ?? ""
        email = raw["email"] as? String ?? ""
        phone = raw["phone"] as? String ?? ""
        website = raw["website"] as? String ?? ""
        notes = raw["notes"] as? String ?? ""
        code = raw["code"] as? String ?? ""
        address = raw["address"] as? String ?? ""
        vatNumber = raw["vatNumber"] as? String ?? ""
        currency = raw["currency"] as? String ?? ""
        isImplied = (raw["implied"] as? Bool) ?? false
        let stats = raw["stats"] as? [String: Any] ?? [:]
        spent = (stats["total"] as? NSNumber)?.doubleValue ?? 0
        purchaseCount = (stats["count"] as? NSNumber)?.intValue ?? 0
        lineCount = (stats["lines"] as? NSNumber)?.intValue ?? 0
        lastDate = stats["lastDate"] as? String ?? ""
        matchedCount = (stats["matched"] as? NSNumber)?.intValue ?? 0
    }

    /// A supplier row's id is empty when it exists only because a purchase names
    /// it — the buying is what makes a supplier real, the card is extra detail.
    var listKey: String { id.isEmpty ? "implied-\(name)" : id }
}

struct OrderStockLine: Identifiable, Equatable {
    let id: String
    var number: String
    var name: String
    var trackingType: InventoryTrackingType
    var unit: String
    var quantity: Double
    var lineCost: Double
    /// The whole shelf, not just this order's share — "5 / 15 pcs" is what
    /// stops a partial reserve reading like the whole spool. nil when the
    /// server predates slice I1 (an older cached response).
    var onHand: Double?
    var location: String

    init?(_ raw: [String: Any]) {
        guard let id = raw["id"] as? String else { return nil }
        self.id = id
        number = raw["number"] as? String ?? ""
        name = raw["name"] as? String ?? ""
        trackingType = InventoryTrackingType(rawValue: raw["trackingType"] as? String ?? "") ?? .unique
        unit = raw["unit"] as? String ?? ""
        quantity = (raw["quantity"] as? NSNumber)?.doubleValue ?? 0
        lineCost = (raw["lineCost"] as? NSNumber)?.doubleValue ?? 0
        onHand = (raw["onHand"] as? NSNumber)?.doubleValue
        location = raw["location"] as? String ?? ""
    }
}

/// One row of a pasted list, as the server read it. The payload is handed back
/// to the import untouched, so what the preview shows is what gets written.
struct OpeningStockRow: Identifiable {
    let id = UUID()
    let rowIndex: Int
    let name: String
    let category: String
    let trackingType: InventoryTrackingType
    let onHand: Double
    let unit: String
    let purchasePrice: Double
    let location: String
    let lineValue: Double
    /// Set when the server pre-scanned the shelf and found this row already
    /// there — matched by serial number first, then SKU. The badge and the
    /// duplicate-policy picker both key off this.
    let existingItemId: String
    let existingNumber: String
    let matchedBy: String
    /// The raw dictionary the server returned; passed straight to the import.
    let payload: [String: Any]

    init?(_ raw: [String: Any]) {
        guard let name = raw["name"] as? String else { return nil }
        rowIndex = (raw["rowIndex"] as? NSNumber)?.intValue ?? 0
        self.name = name
        category = raw["category"] as? String ?? "Other"
        trackingType = InventoryTrackingType(rawValue: raw["trackingType"] as? String ?? "") ?? .quantity
        onHand = (raw["onHand"] as? NSNumber)?.doubleValue ?? 0
        unit = raw["unit"] as? String ?? ""
        purchasePrice = (raw["purchasePrice"] as? NSNumber)?.doubleValue ?? 0
        location = raw["location"] as? String ?? ""
        lineValue = (raw["lineValue"] as? NSNumber)?.doubleValue ?? 0
        existingItemId = raw["existingItemId"] as? String ?? ""
        existingNumber = raw["existingNumber"] as? String ?? ""
        matchedBy = raw["matchedBy"] as? String ?? ""
        payload = raw
    }

    var matchesExistingStock: Bool { !existingItemId.isEmpty }
}

/// A row that cannot become an item, and the reason as a code — the words
/// belong to whichever language the app is in.
struct OpeningStockSkip: Identifiable {
    let id = UUID()
    let name: String
    let reason: String

    var message: String {
        reason == "noName"
            ? "No name — this row cannot become an item."
            : "No amount on hand — a counted item needs one."
    }
}

struct OpeningStockRead {
    var grid: [[String]] = []
    var headers: [String] = []
    var mapping: [String] = []
    var items: [OpeningStockRow] = []
    var skipped: [OpeningStockSkip] = []
    var maxRows: Int = 500

    var bodyRows: [[String]] { grid.count > 1 ? Array(grid.dropFirst()) : [] }
}

/// The fields a pasted column can be pointed at. The aliases that guess this
/// automatically live on the server; these are only the menu labels.
let openingStockFields: [(key: String, label: String)] = [
    ("name", "Name"), ("trackingType", "Type"), ("category", "Category"),
    ("brand", "Brand"), ("model", "Model"), ("reference", "Reference"),
    ("serialNumber", "Serial number"), ("sku", "SKU"), ("onHand", "On hand"),
    ("unit", "Unit"), ("lowStockAt", "Reorder at"), ("purchasePrice", "Purchase price"),
    ("location", "Location"), ("supplierName", "Supplier"),
    ("purchaseDate", "Purchase date"), ("notes", "Notes")
]

enum MovementKind: String {
    case openingStock, purchase, adjustment, stocktake, used, sold, removed
    // Loss reasons write their own ledger kinds; "moved" is a location change
    // with a delta of zero. A report that dropped these rows would quietly
    // understate what left the shelf.
    case returned, damaged, lost, wastage, moved

    /// The label a person reads. English here; the app translates it.
    var label: String {
        switch self {
        case .openingStock: return "Opening stock"
        case .purchase:     return "Purchases received"
        case .adjustment:   return "Corrected by hand"
        case .stocktake:    return "Stocktake"
        case .used:         return "Used on jobs"
        case .sold:         return "Sold"
        case .removed:      return "Removed"
        case .returned:     return "Returned to supplier"
        case .damaged:      return "Damaged"
        case .lost:         return "Lost"
        case .wastage:      return "Wastage"
        case .moved:        return "Moved"
        }
    }
}

struct StocktakeLine: Identifiable, Equatable {
    var id: String { itemId }
    let itemId: String
    let number: String
    let name: String
    let category: String
    let location: String
    let trackingType: InventoryTrackingType
    let unit: String
    let expected: Double
    let unitCost: Double
    /// nil means nobody has counted this yet — which is not "counted as zero".
    var counted: Double?

    init?(_ raw: [String: Any]) {
        guard let itemId = raw["itemId"] as? String else { return nil }
        self.itemId = itemId
        number = raw["number"] as? String ?? ""
        name = raw["name"] as? String ?? ""
        category = raw["category"] as? String ?? ""
        location = raw["location"] as? String ?? ""
        trackingType = InventoryTrackingType(rawValue: raw["trackingType"] as? String ?? "") ?? .quantity
        unit = raw["unit"] as? String ?? ""
        expected = (raw["expected"] as? NSNumber)?.doubleValue ?? 0
        unitCost = (raw["unitCost"] as? NSNumber)?.doubleValue ?? 0
        counted = (raw["counted"] as? NSNumber)?.doubleValue
    }
}

struct OverPromisedItem: Identifiable {
    let id = UUID()
    let name: String
    let counted: Double
    let reserved: Double
    let orderIds: [String]

    init(_ raw: [String: Any]) {
        name = raw["name"] as? String ?? ""
        counted = (raw["counted"] as? NSNumber)?.doubleValue ?? 0
        reserved = (raw["reserved"] as? NSNumber)?.doubleValue ?? 0
        orderIds = (raw["orderIds"] as? [String]) ?? []
    }
}

struct StocktakeSummary: Identifiable, Equatable {
    let id: String
    let number: String
    let status: String
    let location: String
    let category: String
    let startedAtMs: Double
    let startedByEmail: String
    let lineCount: Int
    let countedCount: Int
    let adjustedLines: Int
    let valueDelta: Double

    init?(_ raw: [String: Any]) {
        guard let id = raw["id"] as? String else { return nil }
        self.id = id
        number = raw["number"] as? String ?? ""
        status = raw["status"] as? String ?? "open"
        location = raw["location"] as? String ?? ""
        category = raw["category"] as? String ?? ""
        startedAtMs = (raw["startedAtMs"] as? NSNumber)?.doubleValue ?? 0
        startedByEmail = raw["startedByEmail"] as? String ?? ""
        lineCount = (raw["lineCount"] as? NSNumber)?.intValue ?? 0
        countedCount = (raw["countedCount"] as? NSNumber)?.intValue ?? 0
        adjustedLines = (raw["adjustedLines"] as? NSNumber)?.intValue ?? 0
        valueDelta = (raw["valueDelta"] as? NSNumber)?.doubleValue ?? 0
    }
}

struct InventoryReport {
    var totalValue: Double = 0
    var onShelfCount: Int = 0
    var byCategory: [(name: String, value: Double)] = []
    var inValue: Double = 0
    var outValue: Double = 0
    var byKind: [(kind: MovementKind, lines: Int, value: Double)] = []
    var ledgerStartsMs: Double = 0
    var coversWholePeriod: Bool = true
    var lowStock: [(name: String, number: String, onHand: Double, lowStockAt: Double, unit: String)] = []
    var deadStock: [(name: String, number: String, value: Double, idleDays: Int)] = []
    var deadStockAfterDays: Int = 180

    init(_ raw: [String: Any]) {
        let valuation = raw["valuation"] as? [String: Any] ?? [:]
        totalValue = (valuation["totalValue"] as? NSNumber)?.doubleValue ?? 0
        onShelfCount = (valuation["onShelfCount"] as? NSNumber)?.intValue ?? 0
        byCategory = (valuation["byCategory"] as? [[String: Any]] ?? []).map {
            (name: $0["name"] as? String ?? "", value: ($0["value"] as? NSNumber)?.doubleValue ?? 0)
        }
        let movement = raw["movement"] as? [String: Any] ?? [:]
        inValue = (movement["inValue"] as? NSNumber)?.doubleValue ?? 0
        outValue = (movement["outValue"] as? NSNumber)?.doubleValue ?? 0
        ledgerStartsMs = (movement["ledgerStartsMs"] as? NSNumber)?.doubleValue ?? 0
        coversWholePeriod = (movement["coversWholePeriod"] as? Bool) ?? true
        byKind = (movement["byKind"] as? [[String: Any]] ?? []).compactMap { entry in
            guard let kind = MovementKind(rawValue: entry["kind"] as? String ?? "") else { return nil }
            return (kind: kind,
                    lines: (entry["lines"] as? NSNumber)?.intValue ?? 0,
                    value: (entry["value"] as? NSNumber)?.doubleValue ?? 0)
        }
        lowStock = (raw["lowStock"] as? [[String: Any]] ?? []).map {
            (name: $0["name"] as? String ?? "", number: $0["number"] as? String ?? "",
             onHand: ($0["onHand"] as? NSNumber)?.doubleValue ?? 0,
             lowStockAt: ($0["lowStockAt"] as? NSNumber)?.doubleValue ?? 0,
             unit: $0["unit"] as? String ?? "")
        }
        deadStock = (raw["deadStock"] as? [[String: Any]] ?? []).map {
            (name: $0["name"] as? String ?? "", number: $0["number"] as? String ?? "",
             value: ($0["value"] as? NSNumber)?.doubleValue ?? 0,
             idleDays: ($0["idleDays"] as? NSNumber)?.intValue ?? 0)
        }
        deadStockAfterDays = (raw["deadStockAfterDays"] as? NSNumber)?.intValue ?? 180
    }
}

struct InventoryError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

/// Where the last page of the item list ended. Handed back to the server
/// verbatim; the pair is the server's sort key (updatedAt desc, then id), so
/// the client never invents its own idea of "next".
struct InventoryListCursor: Equatable {
    let updatedAtMs: Double
    let id: String
}

/// One page of the item list. `cursor` is nil when the shelf has been read to
/// the end — its presence IS the "there is more" signal.
struct InventoryListPage {
    let items: [InventoryItem]
    let cursor: InventoryListCursor?
    /// The workspace's own categories, served alongside the page so every
    /// picker on this screen shows the same words the web does.
    var categories: [InventoryCategory] = []
    var defaultCategory: String = ""
}

/// One node of the location tree ("Safe A / Drawer 3"). The tree lives
/// server-side and OWNS the location strings on items: renaming a node
/// rewrites its subtree and every item standing in it. Items still carry one
/// plain string, so free-typed locations keep working everywhere.
struct InventoryLocation: Identifiable, Equatable {
    let id: String
    let name: String
    let parentId: String
    let path: String
    let depth: Int

    init?(_ raw: [String: Any]) {
        guard let id = raw["id"] as? String, !id.isEmpty else { return nil }
        self.id = id
        name = raw["name"] as? String ?? ""
        parentId = raw["parentId"] as? String ?? ""
        path = raw["path"] as? String ?? (raw["name"] as? String ?? "")
        depth = max(1, (raw["depth"] as? NSNumber)?.intValue ?? 1)
    }
}

/// One line of a recipe: this part, this much of it. Only the id travels —
/// the name, unit and availability are read off the live item at draw time,
/// so a renamed part never leaves a stale name inside a recipe.
struct InventoryRecipeLine: Equatable {
    var itemId: String
    var quantity: Double

    init(itemId: String, quantity: Double) {
        self.itemId = itemId
        self.quantity = quantity
    }

    init?(_ raw: [String: Any]) {
        guard let itemId = raw["itemId"] as? String, !itemId.isEmpty else { return nil }
        self.itemId = itemId
        quantity = (raw["quantity"] as? NSNumber)?.doubleValue ?? 0
    }
}

/// A job's parts list, written once — "1 buckle + 20cm leather + 2 screws".
/// Applying it to an order reserves every line in ONE server transaction,
/// all or nothing; this client only writes the lists and shows refusals.
struct InventoryRecipe: Identifiable, Equatable {
    let id: String
    let name: String
    let notes: String
    let lines: [InventoryRecipeLine]

    init?(_ raw: [String: Any]) {
        guard let id = raw["id"] as? String, !id.isEmpty else { return nil }
        self.id = id
        name = raw["name"] as? String ?? ""
        notes = raw["notes"] as? String ?? ""
        lines = (raw["lines"] as? [[String: Any]] ?? []).compactMap(InventoryRecipeLine.init)
    }
}

extension FirebaseManager {

    /// Every inventory callable is workspace-scoped and role-checked server-side,
    /// so the active companyId travels with each call — same contract as the web.
    @discardableResult
    func inventoryCall(_ name: String, _ data: [String: Any] = [:]) async throws -> [String: Any] {
        guard !currentCompanyId.isEmpty else { throw InventoryError(message: "No workspace selected.") }
        var payload = data
        payload["companyId"] = currentCompanyId
        do {
            let result = try await Functions.functions(region: "europe-west2").httpsCallable(name).call(payload)
            return result.data as? [String: Any] ?? [:]
        } catch {
            throw InventoryError(message: error.localizedDescription)
        }
    }

    func loadInventoryItems() async throws -> [InventoryItem] {
        try await loadInventoryItemsPage().items
    }

    /// One page of the item list — 500 rows, then a cursor. A workshop past
    /// 500 items used to fall silently off the end of the list; the server now
    /// hands back a cursor and the screen fetches the next page on request.
    func loadInventoryItemsPage(cursor: InventoryListCursor? = nil) async throws -> InventoryListPage {
        var payload: [String: Any] = ["limit": 500]
        if let cursor {
            payload["cursor"] = ["updatedAtMs": cursor.updatedAtMs, "id": cursor.id]
        }
        let raw = try await inventoryCall("listInventoryItems", payload)
        let items = (raw["items"] as? [[String: Any]] ?? []).compactMap(InventoryItem.init)
        var next: InventoryListCursor?
        if raw["hasMore"] as? Bool == true,
           let tail = raw["cursor"] as? [String: Any],
           let id = tail["id"] as? String, !id.isEmpty {
            next = InventoryListCursor(
                updatedAtMs: (tail["updatedAtMs"] as? NSNumber)?.doubleValue ?? 0, id: id)
        }
        let categories = (raw["categoryDetails"] as? [[String: Any]] ?? []).compactMap(InventoryCategory.init)
        return InventoryListPage(
            items: items,
            cursor: next,
            categories: categories,
            defaultCategory: raw["defaultCategory"] as? String ?? "")
    }

    // MARK: - Categories
    //
    // A workshop names what it keeps. Renaming here renames it on every item,
    // because the server carries the new title across — see
    // functions/inventory.js. Removing one always says where its items go.

    func loadInventoryCategories() async throws -> (categories: [InventoryCategory], defaultCategory: String, orphans: [(title: String, count: Int)]) {
        let raw = try await inventoryCall("listInventoryCategories")
        let rows = (raw["categories"] as? [[String: Any]] ?? []).compactMap(InventoryCategory.init)
        let orphans = (raw["orphans"] as? [[String: Any]] ?? []).compactMap { entry -> (String, Int)? in
            guard let title = entry["title"] as? String, !title.isEmpty else { return nil }
            return (title, (entry["itemCount"] as? NSNumber)?.intValue ?? 0)
        }
        return (rows, raw["defaultCategory"] as? String ?? "", orphans)
    }

    @discardableResult
    func saveInventoryCategories(_ categories: [InventoryCategory], defaultCategory: String) async throws -> [InventoryCategory] {
        let payload: [String: Any] = [
            "categories": categories.map { ["id": $0.id, "title": $0.title, "icon": $0.icon, "archived": $0.archived] },
            "defaultCategory": defaultCategory
        ]
        let raw = try await inventoryCall("saveInventoryCategories", payload)
        return (raw["categories"] as? [[String: Any]] ?? []).compactMap(InventoryCategory.init)
    }

    /// `disposition` is "move" (with `moveToId`), "archive" or "other". Without
    /// one the server refuses to remove a category that still holds items.
    @discardableResult
    func deleteInventoryCategory(_ categoryId: String, disposition: String, moveToId: String = "") async throws -> Int {
        var payload: [String: Any] = ["categoryId": categoryId, "disposition": disposition]
        if disposition == "move" { payload["moveToId"] = moveToId }
        let raw = try await inventoryCall("deleteInventoryCategory", payload)
        return (raw["itemsMoved"] as? NSNumber)?.intValue ?? 0
    }

    @discardableResult
    func mergeInventoryCategories(from: String, into: String) async throws -> Int {
        let raw = try await inventoryCall("mergeInventoryCategories", ["fromId": from, "intoId": into])
        return (raw["itemsMoved"] as? NSNumber)?.intValue ?? 0
    }

    func loadInventorySummary() async throws -> InventorySummary {
        let raw = try await inventoryCall("getInventorySummary")
        return InventorySummary(raw["summary"] as? [String: Any] ?? [:])
    }

    /// Returns the id the server settled on — a fresh one for a create, the
    /// same one back for an edit. The item form needs it: photo storage paths
    /// are keyed by item id, so photos picked while the item did not yet exist
    /// can only be uploaded once this hands the id over.
    @discardableResult
    func saveInventoryItem(_ item: [String: Any], itemId: String = "") async throws -> String {
        let raw = try await inventoryCall("saveInventoryItem", ["itemId": itemId, "item": item])
        return raw["itemId"] as? String ?? itemId
    }

    func setInventoryItemStatus(_ itemId: String, status: InventoryStatus) async throws {
        _ = try await inventoryCall("setInventoryItemStatus", ["itemId": itemId, "status": status.rawValue])
    }

    /// Records stock leaving for a reason — returned, damaged, lost or
    /// wastage. The reason is the point: the ledger line this writes is the
    /// answer to "where did that stock go" months later. The server owns the
    /// rules (a unique item moves to "removed" and is refused while reserved;
    /// a quantity loss may not cut into stock promised to orders).
    func recordInventoryLoss(itemId: String, kind: String, quantity: Double?, note: String) async throws {
        var payload: [String: Any] = ["itemId": itemId, "kind": kind]
        if let quantity { payload["quantity"] = quantity }
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { payload["note"] = trimmed }
        _ = try await inventoryCall("recordInventoryLoss", payload)
    }

    /// The movement ledger for one item, newest first. companyId travels via
    /// inventoryCall like every other inventory callable.
    func loadInventoryMovements(itemId: String) async throws -> [InventoryMovement] {
        let raw = try await inventoryCall("listInventoryMovements", ["itemId": itemId])
        return (raw["movements"] as? [[String: Any]] ?? []).compactMap(InventoryMovement.init)
    }

    /// The central library files linked to one record, e.g.
    /// "inventoryItem:<itemId>". companyId travels via inventoryCall like
    /// every other workspace-scoped callable.
    func loadLibraryFiles(linkKey: String) async throws -> [LibraryFile] {
        let raw = try await inventoryCall("listLibraryFiles", ["linkKey": linkKey])
        return (raw["files"] as? [[String: Any]] ?? []).compactMap(LibraryFile.init)
    }

    /// The whole library, or only its trash. The server returns one or the
    /// other, never a mix, so the Trash view re-fetches instead of filtering.
    func loadLibraryFiles(trashed: Bool = false) async throws -> [LibraryFile] {
        let raw = try await inventoryCall("listLibraryFiles", trashed ? ["trashed": true] : [:])
        return (raw["files"] as? [[String: Any]] ?? []).compactMap(LibraryFile.init)
    }

    func renameLibraryFile(fileId: String, displayName: String) async throws {
        _ = try await inventoryCall("renameLibraryFile", ["fileId": fileId, "displayName": displayName])
    }

    /// Sharing writes a link with an audience, never a copy — removing the
    /// share later removes only the link.
    func shareLibraryFileWithOrder(fileId: String, orderId: String, visibility: String, displayName: String) async throws {
        _ = try await inventoryCall(
            "shareLibraryFileWithOrder",
            ["fileId": fileId, "orderId": orderId, "visibility": visibility, "displayName": displayName]
        )
    }

    func trashLibraryFile(fileId: String) async throws {
        _ = try await inventoryCall("trashLibraryFile", ["fileId": fileId])
    }

    func restoreLibraryFile(fileId: String) async throws {
        _ = try await inventoryCall("restoreLibraryFile", ["fileId": fileId])
    }

    /// Library files store storage paths, not URLs — same reasoning as item
    /// photos: a path is permanent where a download URL expires.
    func libraryFileURL(_ path: String) async throws -> URL {
        try await Storage.storage().reference(withPath: path).downloadURL()
    }

    func loadPurchases() async throws -> [Purchase] {
        let raw = try await inventoryCall("listPurchases")
        return (raw["purchases"] as? [[String: Any]] ?? []).compactMap(Purchase.init)
    }

    func savePurchase(_ purchase: [String: Any]) async throws {
        _ = try await inventoryCall("savePurchase", ["purchase": purchase])
    }

    /// Without `lines` this receives everything still outstanding. With them it
    /// receives per line and per quantity — each entry is ["index": Int] for a
    /// unique line or ["index": Int, "quantity": Double] for a counted one —
    /// and the purchase stays partiallyReceived until the last piece lands.
    func receivePurchase(_ purchaseId: String, lines: [[String: Any]]? = nil) async throws {
        var payload: [String: Any] = ["purchaseId": purchaseId]
        if let lines { payload["lines"] = lines }
        _ = try await inventoryCall("receivePurchase", payload)
    }

    func deletePurchase(_ purchaseId: String) async throws {
        _ = try await inventoryCall("deletePurchase", ["purchaseId": purchaseId])
    }

    /// Returns the difference between what was paid and what the purchase came
    /// to. A deposit or a part payment is a real thing, so this is reported
    /// rather than refused.
    @discardableResult
    func matchPurchasePayment(_ purchaseId: String, transactionId: String) async throws -> Double {
        let raw = try await inventoryCall(
            "linkPurchaseToBankTransaction",
            ["purchaseId": purchaseId, "transactionId": transactionId]
        )
        return (raw["difference"] as? NSNumber)?.doubleValue ?? 0
    }

    func loadSuppliers() async throws -> [Supplier] {
        let raw = try await inventoryCall("listSuppliers")
        return (raw["suppliers"] as? [[String: Any]] ?? []).map(Supplier.init)
    }

    func saveSupplier(_ supplier: [String: Any], supplierId: String = "") async throws {
        _ = try await inventoryCall("saveSupplier", ["supplierId": supplierId, "supplier": supplier])
    }

    // MARK: Hierarchical locations

    /// The whole tree, path-sorted by the server ("Safe A" before
    /// "Safe A / Drawer 3"), so the list draws in tree order as-is.
    func listInventoryLocations() async throws -> [InventoryLocation] {
        let raw = try await inventoryCall("listInventoryLocations")
        return (raw["locations"] as? [[String: Any]] ?? []).compactMap(InventoryLocation.init)
    }

    /// Creates (empty `locationId`) or renames/moves a node. The server owns
    /// every guard — sibling name clashes, cycles, the 4-level depth cap — and
    /// a rename cascades into the subtree's paths AND the location strings of
    /// items standing there, with no ledger lines (a shelf rename moves no goods).
    func saveInventoryLocation(name: String, parentId: String, locationId: String = "") async throws {
        _ = try await inventoryCall(
            "saveInventoryLocation",
            ["locationId": locationId, "name": name, "parentId": parentId])
    }

    /// Refused server-side while child locations or standing stock remain —
    /// the refusal text is the user-facing message.
    func deleteInventoryLocation(_ locationId: String) async throws {
        _ = try await inventoryCall("deleteInventoryLocation", ["locationId": locationId])
    }

    // MARK: Recipes (BOM)

    /// Every recipe, name-sorted by the server.
    func listInventoryRecipes() async throws -> [InventoryRecipe] {
        let raw = try await inventoryCall("listInventoryRecipes")
        return (raw["recipes"] as? [[String: Any]] ?? []).compactMap(InventoryRecipe.init)
    }

    /// Creates (empty `recipeId`) or rewrites a recipe. The server owns the
    /// guards — at most 30 lines, every quantity above zero — and its readable
    /// refusals are the user-facing message.
    func saveInventoryRecipe(
        name: String, notes: String, lines: [InventoryRecipeLine], recipeId: String = ""
    ) async throws {
        _ = try await inventoryCall(
            "saveInventoryRecipe",
            ["recipeId": recipeId,
             "recipe": ["name": name, "notes": notes,
                        "lines": lines.map { ["itemId": $0.itemId, "quantity": $0.quantity] }]])
    }

    func deleteInventoryRecipe(_ recipeId: String) async throws {
        _ = try await inventoryCall("deleteInventoryRecipe", ["recipeId": recipeId])
    }

    /// Reserves EVERY line of the recipe for the order in one server
    /// transaction — all or nothing. A failure comes back as a readable
    /// message naming the part that did not fit; show it verbatim.
    func applyRecipeToOrder(recipeId: String, orderId: String, multiplier: Double) async throws {
        _ = try await inventoryCall(
            "applyRecipeToOrder",
            ["recipeId": recipeId, "orderId": orderId, "multiplier": multiplier])
    }

    /// Asks the server what a pasted list would become. The preview and the
    /// import come out of the same call, so the screen cannot promise one thing
    /// and the write do another.
    func readOpeningStock(
        text: String,
        hasHeader: Bool,
        mapping: [String],
        defaultType: InventoryTrackingType,
        typeOverrides: [Int: InventoryTrackingType]
    ) async throws -> OpeningStockRead {
        var payload: [String: Any] = [
            "text": text,
            "hasHeader": hasHeader,
            "defaultType": defaultType.rawValue
        ]
        if !mapping.isEmpty { payload["mapping"] = mapping }
        if !typeOverrides.isEmpty {
            payload["typeOverrides"] = Dictionary(
                uniqueKeysWithValues: typeOverrides.map { (String($0.key), $0.value.rawValue) })
        }
        let raw = try await inventoryCall("parseOpeningStock", payload)
        var read = OpeningStockRead()
        read.grid = (raw["grid"] as? [[String]]) ?? []
        read.headers = (raw["headers"] as? [String]) ?? []
        read.mapping = (raw["mapping"] as? [String]) ?? []
        read.items = (raw["items"] as? [[String: Any]] ?? []).compactMap(OpeningStockRow.init)
        read.skipped = (raw["skipped"] as? [[String: Any]] ?? []).map {
            OpeningStockSkip(name: $0["name"] as? String ?? "", reason: $0["reason"] as? String ?? "")
        }
        read.maxRows = (raw["maxRows"] as? NSNumber)?.intValue ?? 500
        return read
    }

    /// Writes the previewed rows. `duplicatePolicy` travels only when the
    /// preview matched existing stock — "skip", "update" or "create"; the
    /// server owns what each means. The done-count is created + updated, same
    /// as the web: both are rows the sheet genuinely landed.
    @discardableResult
    func importOpeningStock(
        items: [[String: Any]], openingDate: String, duplicatePolicy: String? = nil
    ) async throws -> Int {
        var payload: [String: Any] = ["items": items, "openingDate": openingDate]
        if let duplicatePolicy { payload["duplicatePolicy"] = duplicatePolicy }
        let raw = try await inventoryCall("importOpeningStock", payload)
        return ((raw["imported"] as? NSNumber)?.intValue ?? 0)
            + ((raw["updated"] as? NSNumber)?.intValue ?? 0)
    }

    // MARK: Item photos
    //
    // Stored as storage paths, not URLs — a path is permanent where a download
    // URL expires. Screens resolve paths only when they draw.

    func inventoryPhotoURL(_ path: String) async throws -> URL {
        try await Storage.storage().reference(withPath: path).downloadURL()
    }

    /// Uploads one photo and returns the storage path to put in `photos`.
    func uploadInventoryPhoto(itemId: String, data: Data, fileName: String) async throws -> String {
        let safe = fileName.map { $0.isLetter || $0.isNumber || "._-".contains($0) ? $0 : "_" }
        let name = String(String(safe).suffix(80))
        let path = "companies/\(currentCompanyId)/inventory_photos/\(itemId)/\(Int(Date().timeIntervalSince1970 * 1000))-\(name.isEmpty ? "photo.jpg" : name)"
        let meta = StorageMetadata()
        meta.contentType = "image/jpeg"
        _ = try await Storage.storage().reference(withPath: path).putDataAsync(data, metadata: meta)
        return path
    }

    /// Saves the photo list — riding on the FULL item payload, because the
    /// server rebuilds the whole document from the input and blanks any field
    /// that does not travel (photos are the one field it carries over, nothing
    /// else is).
    func saveInventoryPhotos(item: InventoryItem, photos: [String]) async throws {
        var input = item.inventoryItemInput
        input["photos"] = photos
        _ = try await inventoryCall("saveInventoryItem", ["itemId": item.id, "item": input])
    }

    // MARK: Stocktake and reporting

    func startStocktake(location: String, category: String) async throws -> String {
        let raw = try await inventoryCall(
            "startStocktake", ["location": location, "category": category])
        return raw["stocktakeId"] as? String ?? ""
    }

    func loadStocktakes() async throws -> [StocktakeSummary] {
        let raw = try await inventoryCall("listStocktakes")
        return (raw["stocktakes"] as? [[String: Any]] ?? []).compactMap(StocktakeSummary.init)
    }

    func loadStocktakeLines(_ stocktakeId: String) async throws -> [StocktakeLine] {
        let raw = try await inventoryCall("getStocktake", ["stocktakeId": stocktakeId])
        let stocktake = raw["stocktake"] as? [String: Any] ?? [:]
        return (stocktake["lines"] as? [[String: Any]] ?? []).compactMap(StocktakeLine.init)
    }

    func saveStocktakeCounts(_ stocktakeId: String, counts: [String: Any]) async throws {
        _ = try await inventoryCall(
            "saveStocktakeCounts", ["stocktakeId": stocktakeId, "counts": counts])
    }

    /// Returns how many lines were adjusted, what that did to the value, and any
    /// items now promising more than the shelf holds.
    func commitStocktake(_ stocktakeId: String) async throws -> (adjusted: Int, valueDelta: Double, overPromised: [OverPromisedItem]) {
        let raw = try await inventoryCall("commitStocktake", ["stocktakeId": stocktakeId])
        return (
            adjusted: (raw["adjusted"] as? NSNumber)?.intValue ?? 0,
            valueDelta: (raw["valueDelta"] as? NSNumber)?.doubleValue ?? 0,
            overPromised: (raw["overPromised"] as? [[String: Any]] ?? []).map(OverPromisedItem.init)
        )
    }

    func cancelStocktake(_ stocktakeId: String) async throws {
        _ = try await inventoryCall("cancelStocktake", ["stocktakeId": stocktakeId])
    }

    func loadInventoryReport(fromMs: Double, toMs: Double) async throws -> InventoryReport {
        let raw = try await inventoryCall("getInventoryReport", ["fromMs": fromMs, "toMs": toMs])
        return InventoryReport(raw)
    }

    func loadOrderStock(orderId: String) async throws -> (lines: [OrderStockLine], total: Double) {
        let raw = try await inventoryCall("getOrderInventory", ["orderId": orderId])
        let lines = (raw["items"] as? [[String: Any]] ?? []).compactMap(OrderStockLine.init)
        return (lines, (raw["totalCost"] as? NSNumber)?.doubleValue ?? 0)
    }

    func reserveStock(itemId: String, orderId: String, quantity: Double) async throws {
        _ = try await inventoryCall(
            "reserveInventoryForOrder",
            ["itemId": itemId, "orderId": orderId, "quantity": quantity]
        )
    }

    func releaseStock(itemId: String, orderId: String) async throws {
        _ = try await inventoryCall("releaseInventoryFromOrder", ["itemId": itemId, "orderId": orderId])
    }

    /// Consuming is the moment the promised part actually goes into the job.
    /// No quantity means the whole reservation; a smaller quantity leaves the
    /// rest still promised to this order. The server refuses when nothing is
    /// reserved here — consumption without a reservation would bypass the
    /// double-promise guard reserving exists for.
    func consumeStock(itemId: String, orderId: String, quantity: Double? = nil) async throws {
        var payload: [String: Any] = ["itemId": itemId, "orderId": orderId]
        if let quantity { payload["quantity"] = quantity }
        _ = try await inventoryCall("consumeInventoryForOrder", payload)
    }

    /// Releases the old item and reserves the new one in ONE server
    /// transaction, so the order is never left holding neither. Same capacity
    /// rules as reserving.
    func swapStock(orderId: String, fromItemId: String, toItemId: String, quantity: Double) async throws {
        _ = try await inventoryCall(
            "swapInventoryForOrder",
            ["orderId": orderId, "fromItemId": fromItemId, "toItemId": toItemId, "quantity": quantity]
        )
    }
}
