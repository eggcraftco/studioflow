import Foundation
import FirebaseFunctions

// Inventory on Mac and iPhone. Mirrors functions/inventory.js and the web app:
// the money rules, the item numbering and the status lifecycle all live on the
// server, so this file carries shapes and call plumbing only. Two screens that
// each do their own arithmetic will eventually disagree, and the one a person
// is looking at will be the wrong one.

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

    /// What can honestly be promised to a new order.
    var freeToReserve: Double {
        if trackingType == .unique { return status == .available ? 1 : 0 }
        return max(0, onHand - reserved)
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
