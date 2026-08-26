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
    case available, reserved, incoming, used, sold, archived

    var label: String {
        switch self {
        case .available: return "Available"
        case .reserved: return "Reserved"
        case .incoming: return "Incoming"
        case .used: return "Used"
        case .sold: return "Sold"
        case .archived: return "Archived"
        }
    }
}

let inventoryCategories = [
    "Watches", "Dials", "Movements", "Bracelets", "Straps",
    "Parts", "Consumables", "Packaging", "Tools", "Other"
]

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
    /// a target: reserving must go through reserveInventoryForOrder, which
    /// writes the reservation arrays — a bare status flip would promise the
    /// item to no order at all.
    var allowedNextStatuses: [InventoryStatus] {
        switch status {
        case .available: return [.used, .sold, .incoming, .archived]
        case .reserved: return [.available, .used, .sold, .archived]
        case .incoming: return [.available, .archived]
        case .used: return [.available, .archived]
        case .sold: return [.archived]
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
    var kindLabel: String {
        switch kind {
        case "openingStock": return "Opening stock"
        case "purchase": return "Purchase"
        case "adjustment": return "Adjustment"
        case "stocktake": return "Stocktake"
        case "used": return "Used"
        case "sold": return "Sold"
        case "removed": return "Removed"
        default: return kind
        }
    }
}

/// One file from the central library, as listLibraryFiles returns it. The
/// server sends more fields than this; the panel only needs enough to name a
/// file, size it, date it and open it.
struct LibraryFile: Identifiable, Equatable {
    let id: String
    let displayName: String
    let fileSize: Int64
    let storagePath: String
    let updatedAtMs: Double

    init?(_ raw: [String: Any]) {
        guard let id = raw["id"] as? String else { return nil }
        self.id = id
        displayName = raw["displayName"] as? String ?? ""
        fileSize = (raw["fileSize"] as? NSNumber)?.int64Value ?? 0
        storagePath = raw["storagePath"] as? String ?? ""
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

struct Purchase: Identifiable, Equatable {
    let id: String
    var number: String
    var supplierName: String
    var purchaseDate: String
    var reference: String
    var lineCount: Int
    var goodsTotal: Double
    var shipping: Double
    var otherCosts: Double
    var total: Double
    var isReceived: Bool
    var bankTransactionId: String

    init?(_ raw: [String: Any]) {
        guard let id = raw["id"] as? String else { return nil }
        self.id = id
        number = raw["number"] as? String ?? ""
        supplierName = raw["supplierName"] as? String ?? ""
        purchaseDate = raw["purchaseDate"] as? String ?? ""
        reference = raw["reference"] as? String ?? ""
        lineCount = (raw["lines"] as? [[String: Any]])?.count ?? 0
        goodsTotal = (raw["goodsTotal"] as? NSNumber)?.doubleValue ?? 0
        shipping = (raw["shipping"] as? NSNumber)?.doubleValue ?? 0
        otherCosts = (raw["otherCosts"] as? NSNumber)?.doubleValue ?? 0
        total = (raw["total"] as? NSNumber)?.doubleValue ?? 0
        isReceived = (raw["status"] as? String ?? "") == "received"
        bankTransactionId = raw["bankTransactionId"] as? String ?? ""
    }
}

struct Supplier: Identifiable, Equatable {
    var id: String
    var name: String
    var email: String
    var phone: String
    var website: String
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

    init?(_ raw: [String: Any]) {
        guard let id = raw["id"] as? String else { return nil }
        self.id = id
        number = raw["number"] as? String ?? ""
        name = raw["name"] as? String ?? ""
        trackingType = InventoryTrackingType(rawValue: raw["trackingType"] as? String ?? "") ?? .unique
        unit = raw["unit"] as? String ?? ""
        quantity = (raw["quantity"] as? NSNumber)?.doubleValue ?? 0
        lineCost = (raw["lineCost"] as? NSNumber)?.doubleValue ?? 0
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
        payload = raw
    }
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
        let raw = try await inventoryCall("listInventoryItems", ["limit": 500])
        return (raw["items"] as? [[String: Any]] ?? []).compactMap(InventoryItem.init)
    }

    func loadInventorySummary() async throws -> InventorySummary {
        let raw = try await inventoryCall("getInventorySummary")
        return InventorySummary(raw["summary"] as? [String: Any] ?? [:])
    }

    func saveInventoryItem(_ item: [String: Any], itemId: String = "") async throws {
        _ = try await inventoryCall("saveInventoryItem", ["itemId": itemId, "item": item])
    }

    func setInventoryItemStatus(_ itemId: String, status: InventoryStatus) async throws {
        _ = try await inventoryCall("setInventoryItemStatus", ["itemId": itemId, "status": status.rawValue])
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

    func receivePurchase(_ purchaseId: String) async throws {
        _ = try await inventoryCall("receivePurchase", ["purchaseId": purchaseId])
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

    @discardableResult
    func importOpeningStock(items: [[String: Any]], openingDate: String) async throws -> Int {
        let raw = try await inventoryCall(
            "importOpeningStock", ["items": items, "openingDate": openingDate])
        return (raw["imported"] as? NSNumber)?.intValue ?? 0
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
}
