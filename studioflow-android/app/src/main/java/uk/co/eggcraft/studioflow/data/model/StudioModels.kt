package uk.co.eggcraft.studioflow.data.model

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentSnapshot
import org.json.JSONArray
import java.util.Date
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import kotlin.math.ceil

enum class StudioBillingPlan(val raw: String, val title: String, val teamMemberLimit: Int, val storageLimitMb: Int) {
    Demo("demo", "Free Demo", 1, 50),
    LifetimeLite("lifetime_lite", "NivaDesk Lite", 1, 250),
    ProMonthly("pro_monthly", "NivaDesk Pro", 1, 10240),
    TeamMonthly("team_monthly", "NivaDesk Team", 10, 51200);

    companion object {
        fun fromRaw(value: String?): StudioBillingPlan {
            return entries.firstOrNull { it.raw == value } ?: Demo
        }
    }
}

data class WorkspaceMemberAccess(
    val orders: Boolean = true,
    val dashboard: Boolean = true,
    val schedule: Boolean = true,
    val customers: Boolean = true,
    val quickReply: Boolean = true,
    val settings: Boolean = true,
    val teamAccess: Boolean = true,
    val clientFiles: Boolean = true,
    val financialInfo: Boolean = true,
    val exportData: Boolean = true,
    val assignedProjectsOnly: Boolean = false,
    val manageProjectAssignments: Boolean = false,
    val cardPreview: Boolean = true,
    val cardSummary: Boolean = true,
    val cardCustomer: Boolean = true,
    val cardMaterials: Boolean = true,
    val cardPriority: Boolean = true,
    val cardDelivery: Boolean = true,
    val cardNotes: Boolean = true,
    val cardClientFiles: Boolean = true,
    val cardTodo: Boolean = true,
    val cardWorkTime: Boolean = true,
    val cardFinancial: Boolean = true,
    val cardStatus: Boolean = true,
    val cardShipping: Boolean = true,
    val cardSchedule: Boolean = true,
    val cardHistoryLog: Boolean = true
) {
    fun allows(key: String): Boolean {
        return when (key) {
            "assignedProjectsOnly" -> assignedProjectsOnly
            "manageProjectAssignments" -> manageProjectAssignments
            "orders" -> orders
            "dashboard" -> dashboard
            "schedule" -> schedule
            "customers" -> customers
            "quickReply" -> quickReply
            "settings" -> settings
            "teamAccess" -> teamAccess
            "clientFiles" -> clientFiles
            "financialInfo" -> financialInfo
            "exportData" -> exportData
            "cardPreview" -> cardPreview
            "cardSummary" -> cardSummary
            "cardCustomer" -> cardCustomer
            "cardMaterials" -> cardMaterials
            "cardPriority" -> cardPriority
            "cardDelivery" -> cardDelivery
            "cardNotes" -> cardNotes
            "cardClientFiles" -> cardClientFiles
            "cardTodo" -> cardTodo
            "cardWorkTime" -> cardWorkTime
            "cardFinancial" -> cardFinancial
            "cardStatus" -> cardStatus
            "cardShipping" -> cardShipping
            "cardSchedule" -> cardSchedule
            "cardHistoryLog" -> cardHistoryLog
            else -> true
        }
    }
}

data class StudioWorkspace(
    val id: String,
    val name: String,
    val ownerUid: String,
    val role: String,
    val roleLabel: String,
    val billingPlan: StudioBillingPlan,
    val memberAccess: WorkspaceMemberAccess,
    val accountDisplayName: String = "",
    val accountPhotoUrl: String = "",
    val ownerEmail: String = ""
) {
    val isOwner: Boolean get() = role == "owner"
    val canSeeFinancialData: Boolean get() = memberAccess.financialInfo
    val shouldShowOnlyAssignedProjects: Boolean get() = memberAccess.assignedProjectsOnly
}

data class StudioCompanyNumber(
    val title: String,
    val value: String
)

data class QuickReplyTemplateItem(
    val id: String,
    val title: String,
    val desc: String
)

const val STUDIO_PRIMARY_SPECIAL_NOTE_ID = "00000000-0000-0000-0000-000000000101"

data class StudioHeadingItem(
    val id: String,
    val title: String
)

data class StudioQuickReminderTemplate(
    val id: String,
    val title: String,
    val days: Int = 1,
    val hours: Int = 0,
    val priority: String = "Normal",
    val notify: Boolean = true
)

enum class OrderDetailCardId(val raw: String, val accessKey: String, val title: String) {
    Preview("preview", "cardPreview", "Preview"),
    Summary("summary", "cardSummary", "Order Summary"),
    Customer("customer", "cardCustomer", "Customer & Communication"),
    Materials("materials", "cardMaterials", "Materials & Inventory"),
    Priority("priority", "cardPriority", "Priority / Risk"),
    Delivery("delivery", "cardDelivery", "Timeline & Delivery"),
    Notes("notes", "cardNotes", "Notes"),
    ClientFiles("clientFiles", "cardClientFiles", "Client Files"),
    Todo("todo", "cardTodo", "To Do"),
    WorkTime("workTime", "cardWorkTime", "Work Time"),
    Financial("financial", "cardFinancial", "Financial Info"),
    Status("status", "cardStatus", "Production Status"),
    Shipping("shipping", "cardShipping", "Shipping & Tracking"),
    Schedule("schedule", "cardSchedule", "Schedule & Alerts"),
    HistoryLog("historyLog", "cardHistoryLog", "History / Log");

    companion object {
        val DefaultColumns: List<List<OrderDetailCardId>> = listOf(
            listOf(Preview, Summary, Customer),
            listOf(Notes, ClientFiles, Status),
            listOf(Todo, WorkTime, Schedule),
            listOf(Delivery, HistoryLog, Financial),
            listOf(Shipping, Materials, Priority)
        )
        val DefaultOrder: List<OrderDetailCardId> = listOf(
            Preview, Summary, Customer, Materials, Delivery, Notes, ClientFiles,
            Priority, Todo, WorkTime, Financial, Status, Shipping, Schedule, HistoryLog
        )

        fun fromRaw(value: String?): OrderDetailCardId? {
            val clean = value?.trim().orEmpty()
            if (clean.isBlank()) return null
            val compact = clean
                .replace("-", "")
                .replace("_", "")
                .replace(" ", "")
                .lowercase(Locale.ROOT)
            return when (compact) {
                "preview", "cardpreview" -> Preview
                "summary", "ordersummary", "cardsummary" -> Summary
                "customer", "contact", "communication", "customercontact", "customercommunication", "cardcustomer" -> Customer
                "materials", "inventory", "materialsinventory", "cardmaterials" -> Materials
                "priority", "risk", "priorityrisk", "cardpriority" -> Priority
                "delivery", "timeline", "timelinedelivery", "carddelivery" -> Delivery
                "notes", "customernotes", "specialnotes", "cardnotes" -> Notes
                "clientfiles", "files", "cardclientfiles" -> ClientFiles
                "todo", "tasks", "cardtodo" -> Todo
                "worktime", "time", "cardworktime" -> WorkTime
                "financial", "finance", "financialinfo", "cardfinancial" -> Financial
                "status", "productionstatus", "cardstatus" -> Status
                "shipping", "tracking", "shippingtracking", "cardshipping" -> Shipping
                "schedule", "schedulealerts", "cardschedule" -> Schedule
                "history", "historylog", "log", "cardhistorylog" -> HistoryLog
                else -> entries.firstOrNull { it.raw == clean }
            }
        }
    }
}

data class OrderDetailCardLayout(
    val columns: List<List<OrderDetailCardId>> = OrderDetailCardId.DefaultColumns,
    val phoneOrder: List<OrderDetailCardId> = OrderDetailCardId.DefaultOrder,
    val columnWidths: List<Int> = List(OrderDetailCardId.DefaultColumns.size) { 350 },
    val cardColors: Map<OrderDetailCardId, String> = emptyMap(),
    val cardHeights: Map<OrderDetailCardId, Int> = emptyMap(),
    val orderCardHeights: Map<String, Map<OrderDetailCardId, Int>> = emptyMap(),
    val visibility: Map<OrderDetailCardId, Boolean> = OrderDetailCardId.DefaultOrder.associateWith { true }
) {
    fun isVisible(cardId: OrderDetailCardId): Boolean = visibility[cardId] != false

    companion object {
        private const val MinCardHeight = 160
        private const val MaxCardHeight = 1200

        fun normalized(
            columns: List<List<OrderDetailCardId>>?,
            phoneOrder: List<OrderDetailCardId>?,
            columnWidths: List<Int> = emptyList(),
            cardColors: Map<OrderDetailCardId, String> = emptyMap(),
            cardHeights: Map<OrderDetailCardId, Int> = emptyMap(),
            orderCardHeights: Map<String, Map<OrderDetailCardId, Int>> = emptyMap(),
            visibility: Map<OrderDetailCardId, Boolean> = emptyMap()
        ): OrderDetailCardLayout {
            val minimumColumnCount = OrderDetailCardId.DefaultColumns.size
            val seenColumns = linkedSetOf<OrderDetailCardId>()
            val cleanColumns = columns
                ?.map { column ->
                    column.mapNotNull { card ->
                        if (seenColumns.add(card)) card else null
                    }
                }
                ?.toMutableList()
                ?: mutableListOf()

            if (cleanColumns.isEmpty()) {
                cleanColumns.addAll(OrderDetailCardId.DefaultColumns.map { it.toMutableList() })
                seenColumns.addAll(OrderDetailCardId.DefaultOrder)
            } else {
                val missing = OrderDetailCardId.DefaultOrder.filterNot { it in seenColumns }
                if (missing.isNotEmpty()) cleanColumns[cleanColumns.lastIndex] = cleanColumns.last() + missing
            }
            while (cleanColumns.size < minimumColumnCount) cleanColumns.add(emptyList())

            val normalizedPhoneOrder = buildList {
                val seenPhone = linkedSetOf<OrderDetailCardId>()
                listOfNotNull(phoneOrder, cleanColumns.flatten(), OrderDetailCardId.DefaultOrder).flatten().forEach { card ->
                    if (seenPhone.add(card)) add(card)
                }
            }

            val cleanWidths = columnWidths
                .map { it.coerceIn(260, 800) }
                .toMutableList()
            while (cleanWidths.size < cleanColumns.size.coerceAtLeast(minimumColumnCount)) cleanWidths.add(350)

            val cleanVisibility = OrderDetailCardId.DefaultOrder.associateWith { true }.toMutableMap()
            cleanVisibility.putAll(visibility)

            val cleanHeights = cardHeights
                .mapValues { (_, height) -> height.coerceIn(MinCardHeight, MaxCardHeight) }
                .filterValues { it > 0 }

            val cleanOrderHeights = orderCardHeights.mapNotNull { (orderId, heights) ->
                val cleanOrderId = orderId.trim()
                val cleanCardHeights = heights
                    .mapValues { (_, height) -> height.coerceIn(MinCardHeight, MaxCardHeight) }
                    .filterValues { it > 0 }
                if (cleanOrderId.isBlank() || cleanCardHeights.isEmpty()) null else cleanOrderId to cleanCardHeights
            }.toMap()

            return OrderDetailCardLayout(
                columns = cleanColumns,
                phoneOrder = normalizedPhoneOrder,
                columnWidths = cleanWidths,
                cardColors = cardColors,
                cardHeights = cleanHeights,
                orderCardHeights = cleanOrderHeights,
                visibility = cleanVisibility
            )
        }
    }
}

data class StudioWorkspaceSettings(
    val appTheme: String = "Light",
    val appSubtitle: String = "Bespoke Hand-Paint...",
    val appLogoUrl: String = "",
    val selectedLanguage: String = "English",
    val selectedCurrency: String = "£",
    val selectedDecimalSeparator: String = ".",
    val feePercentage: Double = 3.0,
    val defaultTaxRate: Double = 20.0,
    val taxCalculationType: String = "Revenue",
    val taxMilestoneEnabled: Boolean = false,
    val taxMilestoneDate: Double = 0.0,
    val taxRuleNameRevenue: String = "Standard Tax (Services/New)",
    val taxRuleNameProfit: String = "Margin Scheme (2nd Hand)",
    val dashShowRevenue: Boolean = true,
    val dashShowPending: Boolean = true,
    val dashShowCost: Boolean = true,
    val dashShowFee: Boolean = true,
    val dashShowShipping: Boolean = true,
    val dashShowTax: Boolean = true,
    val dashShowProfit: Boolean = true,
    val replyMode: String = "AI",
    val quickReplyPoliteness: String = "Warm",
    val quickReplyLength: String = "Short",
    val openAIKey: String = "",
    val aiKnowledgeBase: String = "",
    val quickReplyProducts: List<QuickReplyTemplateItem> = listOf(
        QuickReplyTemplateItem("default-product-1", "Service / Product 1", "Price starts at $100.")
    ),
    val quickReplyRules: List<QuickReplyTemplateItem> = listOf(
        QuickReplyTemplateItem("default-rule-1", "Delivery Rule", "We usually deliver within 3-5 business days.")
    ),
    val businessType: String = "Photography Studio",
    val businessDescriptionPrompt: String = "This business offers professional photography services for individuals, families, events, brands, and products.\nCustomers should provide their name, contact details, preferred date, location, type of shoot, style preferences, deadline, and any special requests.\nThe process includes enquiry, consultation, quote, deposit payment, shoot planning, editing, client review, final delivery and follow-up.",
    val businessOnboardingCompleted: Boolean = false,
    val activeStatuses: List<String> = listOf("Not Yet", "In Progress", "Pending", "Ready", "Done", "Cancelled", "Design", "Painting", "Shipped"),
    val customSteps: List<String> = listOf("Design", "Painting"),
    val customToggles: List<String> = emptyList(),
    val customFields: List<String> = emptyList(),
    val communicationShowTelephone: Boolean = true,
    val communicationShowEmail: Boolean = true,
    val communicationShowAddress: Boolean = true,
    val communicationShowChannel: Boolean = true,
    val communicationShowCustomerNotes: Boolean = true,
    val communicationChannelLabels: List<String> = listOf("Instagram", "WhatsApp", "TikTok"),
    val specialNoteSections: List<StudioHeadingItem> = listOf(
        StudioHeadingItem(STUDIO_PRIMARY_SPECIAL_NOTE_ID, "Special Notes")
    ),
    val financialExpenseItems: List<StudioHeadingItem> = emptyList(),
    val financialRemainingItems: List<StudioHeadingItem> = emptyList(),
    val financialShowBaseCost: Boolean = true,
    val financialBaseCostLabel: String = "Cost (Base)",
    val materialsDefaultChecks: List<String> = listOf("Dial Sourced", "Dial Received", "Watch Received", "Materials Ready"),
    val materialsToggles: List<String> = emptyList(),
    val showStatusNotesSupplier: Boolean = false,
    val statusNotesSupplierLabel: String = "Notes / Supplier",
    val showMaterialsNotesSupplier: Boolean = true,
    val materialsNotesSupplierLabel: String = "Notes / Supplier",
    val scheduleQuickReminders: List<StudioQuickReminderTemplate> = listOf(
        StudioQuickReminderTemplate("default-follow-up", "Follow up customer", 1, 0),
        StudioQuickReminderTemplate("default-update", "Send design update", 1, 0),
        StudioQuickReminderTemplate("default-approval", "Ask for approval", 2, 0),
        StudioQuickReminderTemplate("default-payment", "Check payment", 2, 0),
        StudioQuickReminderTemplate("default-materials", "Check materials", 3, 0),
        StudioQuickReminderTemplate("default-shipping", "Check delivery status", 0, 12)
    ),
    val summaryStep1: String = "Design",
    val summaryStep2: String = "Painting",
    val orderListStep1: String = "Design",
    val orderListStep2: String = "Painting",
    val pdfShowCustomer: Boolean = true,
    val pdfShowContact: Boolean = true,
    val pdfShowPreview: Boolean = true,
    val pdfShowMaterials: Boolean = true,
    val pdfShowPriority: Boolean = true,
    val pdfShowFinCustomer: Boolean = true,
    val pdfShowPaymentMethod: Boolean = true,
    val pdfShowFinInternal: Boolean = false,
    val pdfShowStatus: Boolean = true,
    val pdfShowShipping: Boolean = true,
    val companyNumbers: List<StudioCompanyNumber> = listOf(
        StudioCompanyNumber("VAT Number", ""),
        StudioCompanyNumber("EORI Number", ""),
        StudioCompanyNumber("Company No.", "")
    ),
    val showCardPreview: Boolean = true,
    val showCardSummary: Boolean = true,
    val showCardCustomer: Boolean = true,
    val showCardCustomerNotes: Boolean = false,
    val showCardDelivery: Boolean = true,
    val showCardPriority: Boolean = true,
    val showCardMaterials: Boolean = false,
    val showCardCommunication: Boolean = true,
    val showCardNotes: Boolean = true,
    val showCardClientFiles: Boolean = true,
    val showCardTodo: Boolean = true,
    val showCardWorkTime: Boolean = true,
    val showCardFinancial: Boolean = true,
    val showCardStatus: Boolean = true,
    val showCardShipping: Boolean = true,
    val showCardSchedule: Boolean = true,
    val showCardHistoryLog: Boolean = true,
    val uploadSafetyRequirePolicyAcceptance: Boolean = true,
    val uploadSafetyMaxFileSizeMB: Int = 10,
    val orderCardShowPreviewImage: Boolean = true,
    val orderCardShowDeliveryTime: Boolean = true,
    val orderCardShowDesignName: Boolean = true,
    val orderCardShowOrderValue: Boolean = true,
    val orderCardShowUpcomingSchedule: Boolean = true,
    val orderCardShowStatusBadges: Boolean = true,
    val ordersSidebarWidth: Double = 380.0,
    val ordersSidebarVisible: Boolean = true,
    val workspaceUserProfilesJSON: String = "",
    val sharedWorkspaceSnapshotJSON: String = "",
    val orderCardLayout: OrderDetailCardLayout = OrderDetailCardLayout()
) {
    fun showsCard(key: String): Boolean {
        return when (key) {
            "cardPreview" -> showCardPreview
            "cardSummary" -> showCardSummary
            "cardCustomer" -> showCardCustomer || showCardCommunication
            "cardMaterials" -> showCardMaterials
            "cardPriority" -> showCardPriority
            "cardDelivery" -> showCardDelivery
            "cardNotes" -> showCardNotes || showCardCustomerNotes
            "cardClientFiles" -> showCardClientFiles
            "cardTodo" -> showCardTodo
            "cardWorkTime" -> showCardWorkTime
            "cardFinancial" -> showCardFinancial
            "cardStatus" -> showCardStatus
            "cardShipping" -> showCardShipping
            "cardSchedule" -> showCardSchedule
            "cardHistoryLog" -> showCardHistoryLog
            else -> true
        }
    }
}

data class StudioTeamMember(
    val id: String,
    val email: String,
    val displayName: String,
    val photoUrl: String,
    val role: String,
    val roleLabel: String = role,
    val access: WorkspaceMemberAccess = WorkspaceMemberAccess(),
    val isOwner: Boolean = role == "owner"
) {
    val label: String
        get() = displayName.trim().ifEmpty { emailName(email).ifEmpty { id } }
}

data class StudioJoinRequest(
    val id: String,
    val requesterUid: String,
    val requesterEmail: String,
    val requesterDisplayName: String,
    val requesterPhotoUrl: String,
    val status: String,
    val createdAt: Date?
) {
    val label: String
        get() = requesterDisplayName.trim().ifEmpty { emailName(requesterEmail).ifEmpty { requesterUid } }
}


data class StudioSupportTicket(
    val id: String,
    val ticketType: String,
    val companyId: String,
    val companyName: String,
    val createdByUid: String,
    val createdByEmail: String,
    val createdByName: String,
    val title: String,
    val message: String,
    val category: String,
    val priority: String,
    val status: String,
    val platform: String,
    val appVersion: String,
    val deviceInfo: String,
    val language: String,
    val createdAt: Date?,
    val updatedAt: Date?,
    val lastMessageAt: Date?
) {
    val senderLabel: String
        get() = createdByName.trim().ifEmpty { emailName(createdByEmail).ifEmpty { createdByUid } }

    val isWorkspaceTicket: Boolean
        get() = ticketType == "workspace"
}

data class StudioSupportTicketMessage(
    val id: String,
    val message: String,
    val createdByUid: String,
    val createdByEmail: String,
    val createdByName: String,
    val senderRole: String,
    val createdAt: Date?
) {
    val senderLabel: String
        get() = createdByName.trim().ifEmpty { emailName(createdByEmail).ifEmpty { createdByUid } }
}

data class StudioSupportTicketListResult(
    val tickets: List<StudioSupportTicket>,
    val canManage: Boolean
)

data class StudioMessageThread(
    val id: String = "team",
    val companyId: String = "",
    val type: String = "team",
    val title: String = "Team Chat",
    val memberUids: List<String> = emptyList(),
    val memberEmails: List<String> = emptyList(),
    val lastMessageText: String = "",
    val lastMessageAt: Date? = null,
    val lastMessageByUid: String = "",
    val lastMessageByName: String = "",
    val lastMessageByPhotoURL: String = "",
    val readBy: Map<String, Date> = emptyMap(),
    val mutedUntilBy: Map<String, Date> = emptyMap(),
    val pinnedMessageIds: List<String> = emptyList(),
    val isUnread: Boolean = false
) {
    val isTeamThread: Boolean get() = id == "team" || type == "team"
    val isDirectThread: Boolean get() = type == "direct"
    val isGroupThread: Boolean get() = type == "group"

    fun displayTitle(currentUid: String, teamMembers: List<StudioMessageTeamMember>): String {
        val clean = title.trim()
        if (clean.isNotBlank()) return clean
        if (isTeamThread) return "Team Chat"
        if (isDirectThread) {
            val otherUid = memberUids.firstOrNull { it.trim() != currentUid.trim() && it.isNotBlank() }
            val member = teamMembers.firstOrNull { it.id == otherUid }
            return member?.name?.ifBlank { member.email }?.ifBlank { "Direct Message" } ?: "Direct Message"
        }
        return "Conversation"
    }

    fun mutedAt(uid: String): Date? = mutedUntilBy[uid]
    fun isMutedFor(uid: String): Boolean {
        val until = mutedUntilBy[uid] ?: return false
        return until.time > System.currentTimeMillis()
    }
}

data class StudioMessageItem(
    val id: String = "",
    val threadId: String = "",
    val text: String = "",
    val senderUid: String = "",
    val senderEmail: String = "",
    val senderName: String = "",
    val senderPhotoURL: String = "",
    val createdAt: Date? = null,
    val type: String = "text",
    val fileName: String = "",
    val fileURL: String = "",
    val fileType: String = "",
    val fileSize: Long = 0L,
    val deletedForEveryone: Boolean = false,
    val deletedByUid: String = "",
    val deletedAt: Date? = null,
    val pinned: Boolean = false,
    val pinnedByUid: String = "",
    val pinnedByName: String = "",
    val pinnedAt: Date? = null,
    val replyToMessageId: String = "",
    val replyToText: String = "",
    val replyToSenderName: String = "",
    val replyToSenderUid: String = "",
    val replyToFileName: String = "",
    val replyToType: String = "",
    val reactions: Map<String, Map<String, String>> = emptyMap(),
    val mentionedUids: List<String> = emptyList(),
    val edited: Boolean = false,
    val editedAt: Date? = null,
    val editedByUid: String = ""
) {
    val isImageAttachment: Boolean
        get() = fileURL.isNotBlank() && fileType.lowercase(Locale.UK).startsWith("image/")

    val isFileAttachment: Boolean
        get() = fileURL.isNotBlank() && !isImageAttachment

    val isDeleted: Boolean get() = deletedForEveryone || type == "deleted"

    fun senderLabel(): String = senderName.trim().ifEmpty { emailName(senderEmail).ifEmpty { senderUid } }
}

data class StudioMessageTeamMember(
    val id: String,
    val email: String = "",
    val name: String = "",
    val photoURL: String = ""
) {
    val label: String get() = name.trim().ifEmpty { emailName(email).ifEmpty { id } }
}

data class StudioActivityNotification(
    val id: String,
    val companyId: String = "",
    val type: String = "update",
    val title: String = "Notification",
    val message: String = "",
    val route: String = "",
    val orderId: String = "",
    val ticketId: String = "",
    val ticketType: String = "",
    val threadId: String = "",
    val messageId: String = "",
    val senderUid: String = "",
    val senderName: String = "",
    val senderEmail: String = "",
    val senderPhotoURL: String = "",
    val priority: String = "",
    val status: String = "",
    val source: String = "",
    val recipientUids: List<String> = emptyList(),
    val recipientEmails: List<String> = emptyList(),
    val readBy: Map<String, Date> = emptyMap(),
    val dismissedBy: Map<String, Date> = emptyMap(),
    val createdAt: Date? = null
) {
    fun isUnread(uid: String, email: String): Boolean {
        val cleanUid = uid.trim()
        val cleanEmail = email.trim().lowercase()
        if (cleanUid.isNotEmpty() && readBy.containsKey(cleanUid)) return false
        if (cleanEmail.isNotEmpty() && readBy.containsKey(cleanEmail)) return false
        return true
    }

    fun isDismissed(uid: String, email: String): Boolean {
        val cleanUid = uid.trim()
        val cleanEmail = email.trim().lowercase()
        if (cleanUid.isNotEmpty() && dismissedBy.containsKey(cleanUid)) return true
        if (cleanEmail.isNotEmpty() && dismissedBy.containsKey(cleanEmail)) return true
        return false
    }

    fun isVisible(uid: String, email: String): Boolean {
        val cleanUid = uid.trim()
        val cleanEmail = email.trim().lowercase()
        if (recipientUids.isEmpty() && recipientEmails.isEmpty()) return true
        if (cleanUid.isNotEmpty() && recipientUids.contains(cleanUid)) return true
        if (cleanEmail.isNotEmpty() && recipientEmails.map { it.lowercase() }.contains(cleanEmail)) return true
        return false
    }
}

data class StudioMessageTypingUser(
    val id: String,
    val name: String = "",
    val email: String = "",
    val photoURL: String = "",
    val updatedAt: Date? = null
)


data class StudioCustomRole(
    val id: String,
    val name: String,
    val baseRole: String,
    val access: WorkspaceMemberAccess
)

data class StudioTeamAccessSnapshot(
    val members: List<StudioTeamMember> = emptyList(),
    val customRoles: List<StudioCustomRole> = emptyList()
)

data class StudioClientFile(
    val id: String,
    val fileName: String,
    val downloadUrl: String,
    val contentType: String,
    val fileSize: Long,
    val uploadedByEmail: String,
    val uploadedAt: Date?,
    val note: String
)

data class StudioTodoItem(
    val id: String,
    val title: String,
    val note: String,
    val assignedToUid: String,
    val assignedToEmail: String,
    val dueAt: Date?,
    val priority: String,
    val isDone: Boolean
)

data class StudioWorkSession(
    val id: String,
    val title: String,
    val startedAt: Date?,
    val endedAt: Date?,
    val durationSeconds: Int,
    val createdByEmail: String
)

data class StudioHistoryLogItem(
    val id: String,
    val createdAt: Date?,
    val title: String,
    val oldValue: String,
    val newValue: String
)

data class StudioScheduleReminder(
    val id: String,
    val title: String,
    val note: String,
    val dueAt: Date?,
    val priority: String,
    val status: String,
    val notify: Boolean,
    val type: String,
    val completedAt: Date?
)

data class StudioOrder(
    val id: String,
    val companyId: String,
    val customerName: String,
    val designName: String,
    val designLink: String,
    val watchRef: String,
    val paymentDate: Date,
    val deliveryTime: Int,
    val paidAmount: Double,
    val remainingAmount: Double,
    val watchPurchasePrice: Double,
    val paymentFee: Double,
    val deliveryCost: Double,
    val taxAmount: Double,
    val taxRate: Double,
    val taxType: String,
    val paymentMethod: String,
    val status: String,
    val designStatus: String,
    val priority: String,
    val risk: String,
    val riskReason: String,
    val emailAddress: String,
    val instagramUsername: String,
    val whatsappNumber: String,
    val notes: String,
    val communication: List<String>,
    val trackingNumber: String,
    val courier: String,
    val isDispatched: Boolean,
    val isDelivered: Boolean,
    val invBool1: Boolean,
    val invBool2: Boolean,
    val invBool3: Boolean,
    val invBool4: Boolean,
    val invNotes: String,
    val extraStatuses: Map<String, String>,
    val customFields: Map<String, String>,
    val customToggles: Map<String, Boolean>,
    val scheduleReminders: List<StudioScheduleReminder>,
    val clientFiles: List<StudioClientFile>,
    val todoItems: List<StudioTodoItem>,
    val workSessions: List<StudioWorkSession>,
    val historyLog: List<StudioHistoryLogItem>,
    val clientFileCount: Int,
    val todoCount: Int,
    val completedTodoCount: Int,
    val workSessionCount: Int,
    val assignedToUid: String,
    val assignedToEmail: String
) {
    val displayCustomerName: String
        get() {
            val cleaned = customerName.trim()
            return if (cleaned.isEmpty() || cleaned in setOf("New Order", "New Project", "Yeni Siparis", "Yeni Sipariş", "Yeni Proje")) {
                "New Project"
            } else {
                cleaned
            }
        }

    val isClosed: Boolean get() = status == "Done" || status == "Cancelled"

    val orderValue: Double get() = paidAmount + remainingAmount

    val netProfit: Double get() = orderValue - watchPurchasePrice - paymentFee - deliveryCost - taxAmount

    val remainingDays: Int
        get() {
            val due = Date(paymentDate.time + deliveryTime.coerceAtLeast(1) * 24L * 60L * 60L * 1000L)
            val diff = due.time - Date().time
            return ceil(diff / (24.0 * 60.0 * 60.0 * 1000.0)).toInt()
        }

    companion object {
        fun fromDocument(document: DocumentSnapshot): StudioOrder {
            val clientFiles = parseClientFiles(document.get("clientFiles"))
            val todoItems = parseTodoItems(document.get("todoItems"))
            val workSessions = parseWorkSessions(document.get("workSessions"))
            val historyLog = parseHistoryLog(document.get("historyLog"))
            val customFields = stringMap(document.get("customFields"))
            return StudioOrder(
                id = document.id,
                companyId = document.getString("companyId").orEmpty(),
                customerName = document.getString("customerName").orEmpty(),
                designName = document.getString("designName").orEmpty(),
                designLink = document.getString("designLink").orEmpty(),
                watchRef = document.getString("watchRef").orEmpty(),
                paymentDate = document.getTimestamp("paymentDate")?.toDate() ?: Date(),
                deliveryTime = document.getLong("deliveryTime")?.toInt() ?: 1,
                paidAmount = document.getDouble("paidAmount") ?: 0.0,
                remainingAmount = document.getDouble("remainingAmount") ?: 0.0,
                watchPurchasePrice = document.getDouble("watchPurchasePrice") ?: 0.0,
                paymentFee = document.getDouble("paymentFee") ?: 0.0,
                deliveryCost = document.getDouble("deliveryCost") ?: 0.0,
                taxAmount = document.getDouble("taxAmount") ?: 0.0,
                taxRate = document.getDouble("taxRate") ?: 0.0,
                taxType = document.getString("taxType").orEmpty(),
                paymentMethod = document.getString("paymentMethod").orEmpty().ifEmpty { "Card" },
                status = document.getString("status").orEmpty().ifEmpty { "Not Yet" },
                designStatus = document.getString("designStatus").orEmpty().ifEmpty { "Not Yet" },
                priority = document.getString("priority").orEmpty().ifEmpty { "Normal" },
                risk = document.getString("risk").orEmpty().ifEmpty { "None" },
                riskReason = document.getString("riskReason").orEmpty().ifEmpty { "-" },
                emailAddress = document.getString("emailAddress").orEmpty(),
                instagramUsername = document.getString("instagramUsername").orEmpty(),
                whatsappNumber = document.getString("whatsappNumber").orEmpty(),
                notes = document.getString("notes").orEmpty(),
                communication = stringList(document.get("communication")),
                trackingNumber = document.getString("trackingNumber").orEmpty(),
                courier = document.getString("courier").orEmpty().ifEmpty { "Auto Detect" },
                isDispatched = document.getBoolean("isDispatched") ?: false,
                isDelivered = document.getBoolean("isDelivered") ?: false,
                invBool1 = document.getBoolean("invBool1") ?: false,
                invBool2 = document.getBoolean("invBool2") ?: false,
                invBool3 = document.getBoolean("invBool3") ?: false,
                invBool4 = document.getBoolean("invBool4") ?: false,
                invNotes = document.getString("invNotes").orEmpty(),
                extraStatuses = stringMap(document.get("extraStatuses")),
                customFields = customFields,
                customToggles = boolMap(document.get("customToggles")),
                scheduleReminders = parseScheduleReminders(customFields),
                clientFiles = clientFiles,
                todoItems = todoItems,
                workSessions = workSessions,
                historyLog = historyLog,
                clientFileCount = clientFiles.size,
                todoCount = todoItems.size,
                completedTodoCount = todoItems.count { it.isDone },
                workSessionCount = workSessions.size,
                assignedToUid = document.getString("assignedToUid").orEmpty(),
                assignedToEmail = document.getString("assignedToEmail").orEmpty()
            )
        }
    }
}

private fun stringList(value: Any?): List<String> {
    return (value as? List<*>)?.mapNotNull { it as? String }.orEmpty()
}

private fun stringMap(value: Any?): Map<String, String> {
    val map = value as? Map<*, *> ?: return emptyMap()
    return map.mapNotNull { (key, rawValue) ->
        val name = key as? String ?: return@mapNotNull null
        name to (rawValue as? String).orEmpty()
    }.toMap()
}

private fun boolMap(value: Any?): Map<String, Boolean> {
    val map = value as? Map<*, *> ?: return emptyMap()
    return map.mapNotNull { (key, rawValue) ->
        val name = key as? String ?: return@mapNotNull null
        name to (rawValue as? Boolean ?: false)
    }.toMap()
}

private fun parseClientFiles(value: Any?): List<StudioClientFile> {
    return mapItems(value).mapIndexed { index, item ->
        StudioClientFile(
            id = stringAny(item["id"], "client-file-$index"),
            fileName = stringAny(item["fileName"], "Client file"),
            downloadUrl = stringAny(item["downloadURL"] ?: item["downloadUrl"], ""),
            contentType = stringAny(item["contentType"], ""),
            fileSize = longAny(item["fileSize"], 0),
            uploadedByEmail = stringAny(item["uploadedByEmail"], ""),
            uploadedAt = dateAny(item["uploadedAt"]),
            note = stringAny(item["note"], "")
        )
    }.sortedByDescending { it.uploadedAt?.time ?: 0L }
}

private fun parseTodoItems(value: Any?): List<StudioTodoItem> {
    return mapItems(value).mapIndexed { index, item ->
        StudioTodoItem(
            id = stringAny(item["id"], "todo-$index"),
            title = stringAny(item["title"], "To Do"),
            note = stringAny(item["note"], ""),
            assignedToUid = stringAny(item["assignedToUid"], ""),
            assignedToEmail = stringAny(item["assignedToEmail"], ""),
            dueAt = dateAny(item["dueAt"]),
            priority = stringAny(item["priority"], "Normal"),
            isDone = boolAny(item["isDone"], false)
        )
    }
}

private fun parseWorkSessions(value: Any?): List<StudioWorkSession> {
    return mapItems(value).mapIndexed { index, item ->
        StudioWorkSession(
            id = stringAny(item["id"], "work-session-$index"),
            title = stringAny(item["title"], "Work session"),
            startedAt = dateAny(item["startedAt"]),
            endedAt = dateAny(item["endedAt"]),
            durationSeconds = longAny(item["durationSeconds"], 0).toInt(),
            createdByEmail = stringAny(item["createdByEmail"], "")
        )
    }.sortedByDescending { it.startedAt?.time ?: 0L }
}

private fun parseHistoryLog(value: Any?): List<StudioHistoryLogItem> {
    return mapItems(value).mapIndexed { index, item ->
        StudioHistoryLogItem(
            id = stringAny(item["id"], "history-$index"),
            createdAt = dateAny(item["createdAt"]),
            title = stringAny(item["title"], "Updated"),
            oldValue = stringAny(item["oldValue"], ""),
            newValue = stringAny(item["newValue"], "")
        )
    }.sortedByDescending { it.createdAt?.time ?: 0L }
}

private const val SCHEDULE_ITEMS_CUSTOM_KEY = "__scheduleAlertItemsV1"
private const val SWIFT_REFERENCE_MS = 978_307_200_000L

private fun parseScheduleReminders(customFields: Map<String, String>): List<StudioScheduleReminder> {
    val raw = customFields[SCHEDULE_ITEMS_CUSTOM_KEY]
        ?: customFields["scheduleAlertItemsV1"]
        ?: customFields["reminderItemsV1"]
        ?: return emptyList()
    val array = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
    return List(array.length()) { index -> array.optJSONObject(index) }
        .mapIndexedNotNull { index, item ->
            item ?: return@mapIndexedNotNull null
            StudioScheduleReminder(
                id = stringAny(item.opt("id"), "schedule-$index"),
                title = stringAny(item.opt("title"), "Reminder"),
                note = stringAny(item.opt("note"), ""),
                dueAt = scheduleDateAny(item.opt("dueAt")),
                priority = stringAny(item.opt("priority"), "Normal"),
                status = stringAny(item.opt("status"), "Pending"),
                notify = item.opt("notify").let { if (it == null) true else boolAny(it, true) },
                type = stringAny(item.opt("type"), "Manual"),
                completedAt = scheduleDateAny(item.opt("completedAt"))
            )
        }
        .sortedWith(compareBy<StudioScheduleReminder> { it.status == "Done" }.thenBy { it.dueAt?.time ?: Long.MAX_VALUE })
}

private fun scheduleDateAny(value: Any?): Date? {
    if (value == null || value == org.json.JSONObject.NULL) return null
    return when (value) {
        is Date -> value
        is Timestamp -> value.toDate()
        is Number -> {
            val raw = value.toDouble()
            if (raw > 10_000_000_000.0) {
                Date(raw.toLong())
            } else {
                Date((raw * 1000.0).toLong() + SWIFT_REFERENCE_MS)
            }
        }
        is String -> parseDateString(value)
        else -> null
    }
}

private fun parseDateString(value: String): Date? {
    val raw = value.trim()
    if (raw.isBlank()) return null
    val numeric = raw.toDoubleOrNull()
    if (numeric != null) return scheduleDateAny(numeric)
    val formats = listOf(
        "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
        "yyyy-MM-dd'T'HH:mm:ss'Z'",
        "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
        "yyyy-MM-dd'T'HH:mm:ssXXX",
        "yyyy-MM-dd"
    )
    return formats.firstNotNullOfOrNull { pattern ->
        runCatching {
            SimpleDateFormat(pattern, Locale.UK).apply {
                if (pattern.endsWith("'Z'")) timeZone = TimeZone.getTimeZone("UTC")
            }.parse(raw)
        }.getOrNull()
    }
}

private fun mapItems(value: Any?): List<Map<*, *>> {
    return when (value) {
        is List<*> -> value.mapNotNull { it as? Map<*, *> }
        is Map<*, *> -> value.values.mapNotNull { it as? Map<*, *> }
        else -> emptyList()
    }
}

private fun stringAny(value: Any?, fallback: String): String {
    return when (value) {
        is String -> value.trim()
        is Map<*, *> -> stringAny(value["uuidString"] ?: value["id"], fallback)
        null -> ""
        else -> value.toString().trim()
    }.ifEmpty { fallback }
}

private fun boolAny(value: Any?, fallback: Boolean): Boolean {
    return value as? Boolean ?: fallback
}

private fun longAny(value: Any?, fallback: Long): Long {
    return when (value) {
        is Long -> value
        is Int -> value.toLong()
        is Double -> value.toLong()
        is Float -> value.toLong()
        is String -> value.toLongOrNull()
        else -> null
    } ?: fallback
}

private fun dateAny(value: Any?): Date? {
    return when (value) {
        is Timestamp -> value.toDate()
        is Date -> value
        is Long -> Date(value)
        is Double -> Date(value.toLong())
        is Map<*, *> -> {
            val seconds = longAny(value["seconds"] ?: value["_seconds"], Long.MIN_VALUE)
            if (seconds == Long.MIN_VALUE) null else Date(seconds * 1000L)
        }
        else -> null
    }
}

private fun mapListCount(value: Any?): Int {
    return (value as? List<*>)?.size ?: (value as? Map<*, *>)?.size ?: 0
}

private fun completedTodoCount(value: Any?): Int {
    val items = value as? List<*> ?: return 0
    return items.count { item -> (item as? Map<*, *>)?.get("isDone") as? Boolean == true }
}

fun timestampOrNull(value: Any?): Date? {
    return (value as? Timestamp)?.toDate()
}

fun emailName(email: String): String {
    return email.trim()
        .substringBefore("@")
        .replace(".", " ")
        .replace("_", " ")
        .replace("-", " ")
        .split(" ")
        .filter { it.isNotBlank() }
        .joinToString(" ") { part -> part.lowercase().replaceFirstChar { it.uppercase() } }
}
