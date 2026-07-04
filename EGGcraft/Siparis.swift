import Foundation
import FirebaseFirestore

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
