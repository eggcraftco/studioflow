import Foundation
import FirebaseFirestore

// VAT sits INSIDE the price the customer pays, so it is extracted from the
// gross rather than added on top: £1,450 at 20% is £241.67 of VAT on £1,208.33,
// not £290. Mirrors vatFromGrossAmount() in functions/index.js — the invoice,
// the estimate and the Finance card must all agree with the server.
func kdvBrutten(_ taxRate: Double, _ brutTutar: Double) -> Double {
    guard taxRate > 0, brutTutar > 0 else { return 0 }
    return (brutTutar * taxRate) / (100.0 + taxRate)
}

struct OrderHistoryLogItem: Identifiable, Codable, Equatable {
    var id: UUID = UUID()
    var createdAt: Date = Date()
    var title: String
    var oldValue: String
    var newValue: String
}

// Structured payment ledger entry. Each customer payment (deposit, instalment,
// final balance) is recorded so the order keeps a full history of how many times
// and how much the customer paid — even after "Full Payment Received" aggregates
// everything into paidAmount.
struct PaymentEntry: Identifiable, Codable, Equatable {
    var id: UUID = UUID()
    var amount: Double
    var date: Date = Date()
    var method: String = ""   // optional: "Deposit", "Card", "Cash", "Final"...
    var note: String = ""     // optional free text
    var createdByUid: String = ""
    var createdByEmail: String = ""
}

// One billable line on an order's invoice: a product/service with quantity and price.
// Prices are gross (VAT-inclusive), so the lines sum toward the same VAT-inclusive order
// total used everywhere else. `id` is a String to match the backend (crypto.randomUUID()).
struct LineItem: Identifiable, Codable, Equatable {
    var id: String = UUID().uuidString
    var name: String = ""
    var quantity: Double = 1
    var unitPrice: Double = 0
    var lineTotal: Double = 0
}



struct OrderToDoItem: Identifiable, Codable, Equatable {
    var id: UUID = UUID()
    var title: String
    var note: String = ""
    var assignedToUid: String = ""
    var assignedToEmail: String = ""
    var dueAt: Date? = nil
    var priority: String = "Normal"
    var isDone: Bool = false
    var createdAt: Date = Date()
    var createdByUid: String = ""
    var createdByEmail: String = ""
    var completedAt: Date? = nil
    var completedByUid: String = ""
    var completedByEmail: String = ""
}

struct OrderWorkSessionItem: Identifiable, Codable, Equatable {
    var id: UUID = UUID()
    var title: String = "Work session"
    var startedAt: Date = Date()
    var endedAt: Date? = nil
    var durationSeconds: Int = 0
    var createdAt: Date = Date()
    var createdByUid: String = ""
    var createdByEmail: String = ""
    var source: String = "app"
}

struct ClientFileItem: Identifiable, Codable, Equatable {
    var id: UUID = UUID()
    var fileName: String
    var downloadURL: String
    var storagePath: String = ""
    var contentType: String
    var fileSize: Int64
    var uploadedByUid: String
    var uploadedByEmail: String
    var uploadedAt: Date = Date()
    var source: String = "client_file"
    var note: String = ""
    var isPendingUpload: Bool = false
    var localFilePath: String = ""
    var pendingQueueId: String = ""
}

// The customer's own item, handed in for repair. This is not stock: `customerOwned`
// is stamped by the server so nothing downstream can mistake it for inventory.
struct RepairIntake: Codable, Equatable {
    // Keyed by the field id the workspace configured (itemType, metal, hallmark…),
    // so renaming or adding a row never needs a model change.
    var fields: [String: String] = [:]
    var condition: [String] = []
    var requestedWork: [String] = []
    var customerInstructions: String = ""
    var receivedAt: Date = Date()
    var receivedByUid: String = ""
    var receivedByName: String = ""
    var customerOwned: Bool = true
}

// The customer's own view of this order: one link, no login. Which parts they
// see is a per-order choice, enforced on the server — the portal projection reads
// only what these flags allow, so internal notes, costs, supplier and profit are
// never read rather than filtered out.
struct CustomerPortalVisibility: Codable, Equatable {
    var status: Bool = true
    var estimate: Bool = true
    var payments: Bool = true
    var photos: Bool = true
    var expectedDate: Bool = true
}

struct CustomerPortalAutoUpdates: Codable, Equatable {
    var enabled: Bool = true
    var email: Bool = true
    // No SMS provider is connected yet; the preference is stored so it starts
    // working the day one is.
    var sms: Bool = false
}

// One revision of what the customer was quoted. The full document and the
// approval evidence live in a subcollection the client cannot read; this is the
// row the card shows. Times are epoch milliseconds, not Date: the whole array is
// decoded with try?, so a single element that fails to read would blank the lot.
struct OrderEstimateSummary: Codable, Equatable, Identifiable {
    var id: String = ""
    var number: String = ""
    var version: Int = 1
    var status: String = "draft"
    var total: Double = 0
    var subtotal: Double = 0
    var taxAmount: Double = 0
    var taxRate: Double = 0
    var taxType: String = ""
    var itemCount: Int = 0
    var createdAtMs: Double = 0
    var sentAtMs: Double = 0
    var viewedAtMs: Double = 0
    var decidedAtMs: Double = 0
    var decidedBy: String = ""
    var decisionMethod: String = ""
    var hasSignature: Bool = false
    var supersedesId: String = ""
    var supersededById: String = ""
    var linkState: String = "none"
}

// The authoritative estimate, fetched from getOrderEstimateRecord. The summary
// above is a display index on the order document and a workspace member can
// write to it; this comes from a subcollection no client can touch, so it is
// what the card and the PDF show.
//
// Deliberately not Codable: it never goes back to Firestore, it arrives as the
// untyped dictionary a callable hands back, and hand-parsing means one odd
// field cannot blank the whole record the way a decoding failure would.
struct OrderEstimateApproval: Equatable {
    var decision: String = ""
    var method: String = ""
    var decidedAtMs: Double = 0
    var approvedByName: String = ""
    var approvedByEmail: String = ""
    var declineReason: String = ""
    var signatureDownloadUrl: String = ""

    init(dictionary: [String: Any]) {
        decision = dictionary["decision"] as? String ?? ""
        method = dictionary["method"] as? String ?? ""
        decidedAtMs = (dictionary["decidedAtMs"] as? NSNumber)?.doubleValue ?? 0
        approvedByName = dictionary["approvedByName"] as? String ?? ""
        approvedByEmail = dictionary["approvedByEmail"] as? String ?? ""
        declineReason = dictionary["declineReason"] as? String ?? ""
        signatureDownloadUrl = dictionary["signatureDownloadUrl"] as? String ?? ""
    }
}

struct OrderEstimateRecord: Equatable {
    var estimateId: String = ""
    var number: String = ""
    var version: Int = 1
    var status: String = "draft"
    var currency: String = ""
    var lineItems: [LineItem] = []
    var subtotal: Double = 0
    var taxRate: Double = 0
    var taxType: String = ""
    var taxAmount: Double = 0
    var total: Double = 0
    var terms: String = ""
    var notes: String = ""
    var validUntilMs: Double = 0
    var createdAtMs: Double = 0
    var replacesNumber: String = ""
    var customerNameSnapshot: String = ""
    var approval: OrderEstimateApproval?

    init?(dictionary: [String: Any]?) {
        guard let dictionary else { return nil }
        estimateId = dictionary["estimateId"] as? String ?? ""
        number = dictionary["number"] as? String ?? ""
        version = (dictionary["version"] as? NSNumber)?.intValue ?? 1
        status = dictionary["status"] as? String ?? "draft"
        currency = dictionary["currency"] as? String ?? ""
        // Whole quantities come back as integers, so read every number through
        // NSNumber rather than casting straight to Double.
        lineItems = (dictionary["lineItems"] as? [[String: Any]] ?? []).map { raw in
            var item = LineItem()
            item.id = raw["id"] as? String ?? UUID().uuidString
            item.name = raw["name"] as? String ?? ""
            item.quantity = (raw["quantity"] as? NSNumber)?.doubleValue ?? 0
            item.unitPrice = (raw["unitPrice"] as? NSNumber)?.doubleValue ?? 0
            item.lineTotal = (raw["lineTotal"] as? NSNumber)?.doubleValue ?? 0
            return item
        }
        subtotal = (dictionary["subtotal"] as? NSNumber)?.doubleValue ?? 0
        taxRate = (dictionary["taxRate"] as? NSNumber)?.doubleValue ?? 0
        taxType = dictionary["taxType"] as? String ?? ""
        taxAmount = (dictionary["taxAmount"] as? NSNumber)?.doubleValue ?? 0
        total = (dictionary["total"] as? NSNumber)?.doubleValue ?? 0
        terms = dictionary["terms"] as? String ?? ""
        notes = dictionary["notes"] as? String ?? ""
        validUntilMs = (dictionary["validUntilMs"] as? NSNumber)?.doubleValue ?? 0
        createdAtMs = (dictionary["createdAtMs"] as? NSNumber)?.doubleValue ?? 0
        replacesNumber = dictionary["replacesNumber"] as? String ?? ""
        customerNameSnapshot = dictionary["customerNameSnapshot"] as? String ?? ""
        if let rawApproval = dictionary["approval"] as? [String: Any] {
            approval = OrderEstimateApproval(dictionary: rawApproval)
        }
    }
}

/// Why a job stopped, as written on the order by the server. `reason` is a code
/// so the wording can be translated; `note` is the operator's own words.
struct OrderProductionBlocker: Codable, Equatable {
    var reason: String
    var note: String?
    var atMs: Double?
    var byUid: String?
    var byName: String?
}

struct Siparis: Identifiable, Codable {
    @DocumentID var id: String?
    
    // Workspace ownership stamp
    var companyId: String = "test_studio_123"
    
    var paymentMethod: String = "Card"
    var customerName: String
    var paymentDate: Date
    var paidAmount: Double
    var remainingAmount: Double
    var watchPurchasePrice: Double
    var watchRef: String
    var deliveryTime: Int
    var designName: String
    var designLink: String
    var communication: [String]
    var emailAddress: String
    var instagramUsername: String
    var whatsappNumber: String
    var notes: String
    // Per-order customer-facing note shown under "Notes" on the Invoice PDF (optional so
    // existing orders decode; distinct from the workspace-wide invoiceFooterNote/payment terms).
    var invoiceNote: String?
    // Shipping (delivery) address — separate from the customer's billing address.
    // Populated from WooCommerce / online-store orders, editable per order.
    // Optional so existing orders without these keys still decode.
    var shippingName: String?
    var shippingStreetAddress: String?
    var shippingCity: String?
    var shippingPostalCode: String?
    var shippingCountry: String?
    var shippingPhone: String?
    var designStatus: String
    var status: String
    var isDispatched: Bool
    var trackingNumber: String
    var courier: String
    var isDelivered: Bool
    var paymentFee: Double
    var deliveryCost: Double
    var taxType: String = "" // "Profit" veya "Revenue"
    var extraStatuses: [String: String]?
    // Production board. Only these two are stored; the stage itself is derived
    // from the steps above (see ProductionModels.swift), so the board and the
    // order can never disagree. Optional so existing orders still decode.
    var productionStageOverride: String?
    var productionBlocker: OrderProductionBlocker?
    var taxRate: Double = 0.0    // Tax rate applied to the order (%)
    var invBool1: Bool = false
        var invBool2: Bool = false
        var invBool3: Bool = false
        var invBool4: Bool = false
        var invNotes: String = ""
        var taxAmount: Double = 0.0  // Tax amount charged
    var priority: String = "Normal"
        var risk: String = "None"
        var riskReason: String = "-"
    var customFields: [String: String]?
        var customToggles: [String: Bool]?
    var historyLog: [OrderHistoryLogItem]?
    var clientFiles: [ClientFileItem]?
    var todoItems: [OrderToDoItem]?
    var workSessions: [OrderWorkSessionItem]?
    var payments: [PaymentEntry]?
    // Itemized invoice lines. Optional so existing single-design orders still decode; when
    // present, their sum drives the order total (see lineItemsTotal / hasLineItems).
    var lineItems: [LineItem]?
    var invoiceNumber: String = ""
    // "custom" (something we make) or "repair" (something the customer brought in).
    var orderType: String = "custom"
    // Present only on repair orders. Optional so every existing order still decodes.
    var repairIntake: RepairIntake?
    // Estimate revisions, newest first. Server-written: the client only reads.
    var estimates: [OrderEstimateSummary]?
    var estimateStatus: String = ""
    // Plaintext lives on the order — a document only workspace members can read —
    // so Copy Link keeps working. The public lookup collection holds only its hash.
    var portalToken: String = ""
    var portalTokenId: String = ""
    var portalVisibility: CustomerPortalVisibility?
    var portalAutoUpdates: CustomerPortalAutoUpdates?
    var assignedToUid: String = ""
    var assignedToEmail: String = ""
    // Trash / soft-delete: when true the order is hidden from all normal views and
    // lives in the Trash for 30 days before a backend job purges it permanently.
    var isDeleted: Bool = false
    var deletedAt: Date? = nil
    // Total of the order's custom "Remaining" receivables (customFields keyed
    // financialRemaining::<title>). Counts toward the sales total exactly like
    // remainingAmount, on every platform.
    var customRemainingTotal: Double {
        (customFields ?? [:]).reduce(0.0) { acc, entry in
            guard entry.key.hasPrefix("financialRemaining::") else { return acc }
            let cleaned = entry.value.replacingOccurrences(of: ",", with: "")
            return acc + (Double(cleaned) ?? 0)
        }
    }

    // Order value: classic paid+remaining plus custom receivables.
    var salesTotal: Double { paidAmount + remainingAmount + customRemainingTotal }

    // Computed net profit
    var netKar: Double {
        return salesTotal - watchPurchasePrice - paymentFee - deliveryCost
    }

    // Itemized billing helpers. When the order has line items their gross sum is the order
    // total (the user chose "items drive the total"); otherwise the classic paid+remaining total.
    var hasLineItems: Bool { !(lineItems ?? []).isEmpty }
    var lineItemsTotal: Double {
        (lineItems ?? []).reduce(0) { $0 + $1.lineTotal }
    }

    // A cancelled or refunded order owes nothing and earned nothing: the single
    // canonical rule shared by the customers page and every dashboard money
    // aggregate (mirrors orderCountsTowardBalance in the web's firestore.ts).
    var countsTowardBalance: Bool {
        if status.lowercased().contains("cancel") { return false }
        let shopify = (customFields?["Shopify Status"] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return shopify != "refunded"
    }
}

// The empty initializer lives in an extension so Swift keeps generating the long
// memberwise initializer; the import system depends on it.
extension Siparis {
    init() {
        self.id = nil
        self.companyId = "test_studio_123"
        self.customerName = "New Project"
        self.paymentDate = Date()
        self.paidAmount = 0.0
        self.remainingAmount = 0.0
        self.watchPurchasePrice = 0.0
        self.watchRef = ""
        self.deliveryTime = 45
        self.designName = ""
        self.designLink = ""
        self.communication = []
        self.emailAddress = ""
        self.instagramUsername = ""
        self.whatsappNumber = ""
        self.notes = ""
        self.designStatus = "Not Yet"
        self.status = "Not Yet"
        self.isDispatched = false
        self.trackingNumber = ""
        self.courier = "Auto Detect"
        self.isDelivered = false
        self.paymentFee = 0.0
        self.deliveryCost = 0.0
        self.extraStatuses = [:]
        self.historyLog = []
        self.clientFiles = []
        self.todoItems = []
        self.workSessions = []
        self.payments = []
        self.invoiceNumber = ""
        self.assignedToUid = ""
        self.assignedToEmail = ""
    }
}

// Shared model for Schedule & Alerts.
// Keep this outside SiparisDetayView so ContentView and other screens can decode the same schedule data.
struct ScheduleAlertItem: Codable, Identifiable, Equatable {
    var id: UUID = UUID()
    var title: String
    var note: String
    var dueAt: Date
    var priority: String
    var status: String = "Pending"
    var notify: Bool = true
    var type: String = "Manual"
    var createdAt: Date = Date()
    var completedAt: Date? = nil
    var notificationSent: Bool = false
}

struct ScheduleQuickReminderItem: Codable, Identifiable, Equatable {
    var id: UUID = UUID()
    var title: String
    var days: Int = 1
    var hours: Int = 0
    var priority: String = "Normal"
    var notify: Bool = true
}
