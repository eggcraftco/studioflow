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
    var invoiceNumber: String = ""
    var assignedToUid: String = ""
    var assignedToEmail: String = ""
    // Computed net profit
    var netKar: Double {
        return (paidAmount + remainingAmount) - watchPurchasePrice - paymentFee - deliveryCost
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
