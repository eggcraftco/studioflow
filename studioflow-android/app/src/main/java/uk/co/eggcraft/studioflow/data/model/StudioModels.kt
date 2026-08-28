package uk.co.eggcraft.studioflow.data.model

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentSnapshot
import org.json.JSONArray
import java.util.Date
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import kotlin.math.ceil

enum class StudioBillingPlan(
    val raw: String,
    val title: String,
    val teamMemberLimit: Int,
    val storageLimitMb: Int,
    val accessLevel: Int
) {
    Demo("demo", "Free", 1, 50, 0),
    LifetimeLite("lifetime_lite", "NivaDesk Lite", 1, 250, 1),
    ProMonthly("pro_monthly", "NivaDesk Pro", 1, 10240, 2),
    TeamMonthly("team_monthly", "NivaDesk Team", 5, 51200, 3);

    // The bank feed is sold from Pro upwards, so it is hidden rather than shown
    // locked on Free and Lite.
    val allowsBankFeed: Boolean get() = accessLevel >= ProMonthly.accessLevel

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
    val messages: Boolean = true,
    // Posting into the team-wide thread; reading it stays under `messages`.
    val teamChat: Boolean = true,
    val notes: Boolean = true,
    val quickReply: Boolean = true,
    val settings: Boolean = true,
    val teamAccess: Boolean = true,
    val clientFiles: Boolean = true,
    val financialInfo: Boolean = true,
    val exportData: Boolean = true,
    // Bank Spending feed — off unless the owner grants it.
    val bankFeed: Boolean = false,
    val settingsGeneral: Boolean = true,
    val settingsPdf: Boolean = true,
    val settingsQuickReply: Boolean = true,
    val settingsMessageSettings: Boolean = true,
    val settingsWorkflow: Boolean = true,
    val settingsFinancial: Boolean = true,
    val settingsSafetyUploads: Boolean = true,
    val settingsData: Boolean = true,
    val settingsTeamAccess: Boolean = true,
    val settingsPlanAccess: Boolean = true,
    val settingsSupport: Boolean = true,
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
    val cardHistoryLog: Boolean = true,
    val deleteClientFiles: Boolean = true
) {
    fun allows(key: String): Boolean {
        return when (key) {
            "assignedProjectsOnly" -> assignedProjectsOnly
            "manageProjectAssignments" -> manageProjectAssignments
            "orders" -> orders
            "dashboard" -> dashboard
            "schedule" -> schedule
            "customers" -> customers
            "messages" -> messages
            "teamChat" -> teamChat
            "notes" -> notes
            "quickReply" -> quickReply
            "settings" -> settings
            "teamAccess" -> teamAccess
            "clientFiles" -> clientFiles
            "financialInfo" -> financialInfo
            "bankFeed" -> bankFeed
            "exportData" -> exportData
            "settingsGeneral" -> settingsGeneral
            "settingsPdf" -> settingsPdf
            "settingsQuickReply" -> settingsQuickReply
            "settingsMessageSettings" -> settingsMessageSettings
            "settingsWorkflow" -> settingsWorkflow
            "settingsFinancial" -> settingsFinancial
            "settingsSafetyUploads" -> settingsSafetyUploads
            "settingsData" -> settingsData
            "settingsTeamAccess" -> settingsTeamAccess
            "settingsPlanAccess" -> settingsPlanAccess
            "settingsSupport" -> settingsSupport
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
            "deleteClientFiles" -> deleteClientFiles
            else -> true
        }
    }
}

data class StudioWorkspaceOption(
    val id: String,
    val name: String,
    val role: String,
    val roleLabel: String,
    val isCurrent: Boolean
)

data class StudioWorkspace(
    val id: String,
    val name: String,
    val ownerUid: String,
    val role: String,
    val roleLabel: String,
    val billingPlan: StudioBillingPlan,
    val billingInterval: String = "",
    val storageAddonKey: String = "",
    val storageAddonMB: Long = 0,
    val teamMemberLimitEffective: Int = 0,
    val quickReplyMenuEnabled: Boolean = true,
    val memberAccess: WorkspaceMemberAccess,
    val accountDisplayName: String = "",
    val accountPhotoUrl: String = "",
    val ownerEmail: String = ""
) {
    val isOwner: Boolean get() = role == "owner"
    val canSeeFinancialData: Boolean get() = memberAccess.financialInfo
    val canViewBankFeed: Boolean get() = isOwner || memberAccess.bankFeed
    // Effective team seats (base plan + purchased seats); falls back to plan default.
    val effectiveTeamMemberLimit: Int get() = maxOf(teamMemberLimitEffective, billingPlan.teamMemberLimit)
    val teamSeatSelfServiceMax: Int get() = 10
    // Base plan storage + any active add-on.
    val effectiveStorageLimitMB: Long get() = billingPlan.storageLimitMb.toLong() + storageAddonMB
    val effectiveStorageLimitText: String get() {
        val mb = effectiveStorageLimitMB
        return if (mb >= 1024) {
            val gb = mb / 1024.0
            if (gb == gb.toLong().toDouble()) "${gb.toLong()} GB" else String.format("%.1f GB", gb)
        } else "$mb MB"
    }
    val shouldShowOnlyAssignedProjects: Boolean get() =
        memberAccess.assignedProjectsOnly && !memberAccess.manageProjectAssignments
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
    InvoiceItems("invoiceItems", "cardCustomer", "Invoice Items"),
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
    HistoryLog("historyLog", "cardHistoryLog", "History / Log"),
    RepairIntake("repairIntake", "cardSummary", "Repair Intake & Item"),
    Estimate("estimate", "cardFinancial", "Estimate & Approval"),
    CustomerPortal("customerPortal", "cardCustomer", "Customer Portal");

    companion object {
        val DefaultColumns: List<List<OrderDetailCardId>> = listOf(
            listOf(Preview, RepairIntake, Estimate, CustomerPortal, Summary, WorkTime, Shipping, Schedule, Notes),
            listOf(Customer, InvoiceItems, Materials, Delivery),
            listOf(Financial, Priority, Todo, Status, HistoryLog, ClientFiles)
        )
        val DefaultOrder: List<OrderDetailCardId> = listOf(
            Preview, RepairIntake, Estimate, CustomerPortal, Summary, WorkTime, Shipping, Schedule, Notes,
            Customer, InvoiceItems, Materials, Delivery,
            Financial, Priority, Todo, Status, HistoryLog, ClientFiles
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
                "invoiceitems", "invoiceitem", "items", "lineitems", "cardinvoiceitems" -> InvoiceItems
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
                // Must stay identical to the web and server merges: a card added
                // after this layout was saved goes where the default layout puts
                // it, not onto the tail of the last column.
                val missing = OrderDetailCardId.DefaultOrder.filterNot { it in seenColumns }
                val working = cleanColumns.map { it.toMutableList() }.toMutableList()
                for (card in missing) {
                    val defaultColumnIndex = OrderDetailCardId.DefaultColumns.indexOfFirst { card in it }
                    val targetIndex = if (defaultColumnIndex in working.indices) defaultColumnIndex else working.lastIndex
                    if (targetIndex < 0) continue
                    val target = working[targetIndex]
                    val defaultColumn = OrderDetailCardId.DefaultColumns.getOrNull(defaultColumnIndex).orEmpty()
                    val preceding = defaultColumn.take(defaultColumn.indexOf(card).coerceAtLeast(0))
                    val insertAt = when {
                        preceding.isNotEmpty() -> preceding.fold(0) { position, neighbour ->
                            val found = target.indexOf(neighbour)
                            if (found >= 0) maxOf(position, found + 1) else position
                        }
                        defaultColumn.isNotEmpty() -> 0
                        else -> target.size
                    }
                    target.add(insertAt.coerceIn(0, target.size), card)
                }
                cleanColumns.clear()
                cleanColumns.addAll(working)
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

// What a workspace takes in for repair, service or making depends entirely on the
// trade. A jeweller records Metal and Hallmark; a phone shop records IMEI and
// whether the passcode was handed over.
//
// Mirrored verbatim in functions/index.js, studioflow-web/lib/studioflow/
// repairIntakePresets.ts and EGGcraft/SiparisDetayView.swift. The field ids are
// what intake values are stored under, so they must never drift between
// platforms — only the titles are the workspace's to rename.
data class StudioRepairIntakePreset(
    val id: String,
    val label: String,
    val fields: List<StudioHeadingItem>
)

object StudioRepairIntakePresets {
    val all: List<StudioRepairIntakePreset> = listOf(
    StudioRepairIntakePreset(
        id = "general",
        label = "General Intake",
        fields = listOf(
            StudioHeadingItem("itemType", "Item Type"),
            StudioHeadingItem("brandMaker", "Brand / Maker"),
            StudioHeadingItem("model", "Model"),
            StudioHeadingItem("serialReference", "Serial / Reference"),
            StudioHeadingItem("colour", "Colour"),
            StudioHeadingItem("accessories", "Accessories Included")
        )
    ),
    StudioRepairIntakePreset(
        id = "jewellery",
        label = "Jewellery & Goldsmith",
        fields = listOf(
            StudioHeadingItem("itemType", "Item Type"),
            StudioHeadingItem("metal", "Metal"),
            StudioHeadingItem("hallmark", "Hallmark"),
            StudioHeadingItem("itemSize", "Size"),
            StudioHeadingItem("stones", "Stones"),
            StudioHeadingItem("weight", "Weight"),
            StudioHeadingItem("serialReference", "Serial / Reference")
        )
    ),
    StudioRepairIntakePreset(
        id = "watch",
        label = "Watch & Clock",
        fields = listOf(
            StudioHeadingItem("itemType", "Item Type"),
            StudioHeadingItem("brandMaker", "Brand"),
            StudioHeadingItem("model", "Model"),
            StudioHeadingItem("serialReference", "Serial / Reference"),
            StudioHeadingItem("caseSize", "Case Size"),
            StudioHeadingItem("strap", "Bracelet / Strap"),
            StudioHeadingItem("movement", "Movement")
        )
    ),
    StudioRepairIntakePreset(
        id = "electronics",
        label = "Electronics & Devices",
        fields = listOf(
            StudioHeadingItem("itemType", "Device Type"),
            StudioHeadingItem("brandMaker", "Brand"),
            StudioHeadingItem("model", "Model"),
            StudioHeadingItem("serialReference", "Serial / IMEI"),
            StudioHeadingItem("passcode", "Passcode Provided"),
            StudioHeadingItem("accessories", "Accessories Included"),
            StudioHeadingItem("warranty", "Warranty Status")
        )
    ),
    StudioRepairIntakePreset(
        id = "tailoring",
        label = "Tailoring & Alterations",
        fields = listOf(
            StudioHeadingItem("itemType", "Garment Type"),
            StudioHeadingItem("fabric", "Fabric"),
            StudioHeadingItem("itemSize", "Size"),
            StudioHeadingItem("colour", "Colour"),
            StudioHeadingItem("measurements", "Measurements"),
            StudioHeadingItem("trim", "Trim / Buttons")
        )
    ),
    StudioRepairIntakePreset(
        id = "shoeLeather",
        label = "Shoe & Leather",
        fields = listOf(
            StudioHeadingItem("itemType", "Item Type"),
            StudioHeadingItem("brandMaker", "Brand"),
            StudioHeadingItem("material", "Material"),
            StudioHeadingItem("itemSize", "Size"),
            StudioHeadingItem("colour", "Colour"),
            StudioHeadingItem("sole", "Sole Type")
        )
    ),
    StudioRepairIntakePreset(
        id = "furniture",
        label = "Furniture & Upholstery",
        fields = listOf(
            StudioHeadingItem("itemType", "Item Type"),
            StudioHeadingItem("material", "Material"),
            StudioHeadingItem("dimensions", "Dimensions"),
            StudioHeadingItem("finish", "Finish"),
            StudioHeadingItem("fabric", "Fabric"),
            StudioHeadingItem("age", "Age / Period")
        )
    ),
    StudioRepairIntakePreset(
        id = "bicycle",
        label = "Bicycle & E-Bike",
        fields = listOf(
            StudioHeadingItem("itemType", "Bike Type"),
            StudioHeadingItem("brandMaker", "Brand"),
            StudioHeadingItem("model", "Model"),
            StudioHeadingItem("frameNumber", "Frame Number"),
            StudioHeadingItem("wheelSize", "Wheel Size"),
            StudioHeadingItem("battery", "Battery / Motor")
        )
    ),
    StudioRepairIntakePreset(
        id = "automotive",
        label = "Automotive",
        fields = listOf(
            StudioHeadingItem("itemType", "Vehicle Type"),
            StudioHeadingItem("brandMaker", "Make"),
            StudioHeadingItem("model", "Model"),
            StudioHeadingItem("registration", "Registration"),
            StudioHeadingItem("vin", "VIN"),
            StudioHeadingItem("mileage", "Mileage")
        )
    ),
    StudioRepairIntakePreset(
        id = "instrument",
        label = "Musical Instruments",
        fields = listOf(
            StudioHeadingItem("itemType", "Instrument"),
            StudioHeadingItem("brandMaker", "Brand"),
            StudioHeadingItem("model", "Model"),
            StudioHeadingItem("serialReference", "Serial / Reference"),
            StudioHeadingItem("finish", "Finish"),
            StudioHeadingItem("accessories", "Case / Accessories")
        )
    )
    )

    // businessType is free text the workspace can edit after onboarding, so the
    // exact onboarding labels are matched first and the rest falls back to a
    // keyword sweep that also covers the Turkish words a user is likely to type.
    private val byBusinessType = mapOf(
        "jewellery studio" to "jewellery",
        "tailor / alteration studio" to "tailoring",
        "repair service" to "general"
    )

    private val keywords: List<Pair<String, List<String>>> = listOf(
        "jewellery" to listOf("jewel", "goldsmith", "silversmith", "kuyum", "mucevher", "mücevher", "altin", "altın"),
        "watch" to listOf("watch", "clock", "horolog", "saat"),
        "electronics" to listOf("electronic", "phone", "mobile", "computer", "laptop", "device", "elektronik", "telefon", "bilgisayar"),
        "tailoring" to listOf("tailor", "alteration", "garment", "seamstress", "terzi", "dikis", "dikiş"),
        "shoeLeather" to listOf("shoe", "cobbler", "leather", "ayakkabi", "ayakkabı", "deri", "saraciye"),
        "furniture" to listOf("furniture", "upholster", "carpent", "joinery", "mobilya", "doseme", "döşeme", "marangoz"),
        "bicycle" to listOf("bicycle", "bike", "cycle", "bisiklet"),
        "automotive" to listOf("automotive", "vehicle", "garage", "motor", "car ", "oto", "araba", "arac", "araç"),
        "instrument" to listOf("instrument", "guitar", "piano", "luthier", "muzik", "müzik", "enstruman", "enstrüman")
    )

    fun preset(id: String): StudioRepairIntakePreset? = all.firstOrNull { it.id == id.trim() }

    fun presetIdForBusinessType(businessType: String?): String {
        val raw = businessType?.trim()?.lowercase().orEmpty()
        if (raw.isEmpty()) return "general"
        byBusinessType[raw]?.let { return it }
        keywords.firstOrNull { entry -> entry.second.any { raw.contains(it) } }?.let { return it.first }
        return "general"
    }

    fun fieldsForBusinessType(businessType: String?): List<StudioHeadingItem> =
        (preset(presetIdForBusinessType(businessType)) ?: all.first()).fields

    // Which preset a stored row set came from, by exact id sequence. A renamed
    // title still counts as that preset, because ids are what identify a row.
    fun matchingPresetId(fields: List<StudioHeadingItem>): String {
        val signature = fields.joinToString("|") { it.id }
        return all.firstOrNull { it.fields.joinToString("|") { field -> field.id } == signature }?.id.orEmpty()
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
    val defaultDeliveryTime: Double = 30.0,
    val taxCalculationType: String = "Revenue",
    val taxMilestoneEnabled: Boolean = false,
    val taxMilestoneDate: Double = 0.0,
    val taxRuleNameRevenue: String = "Standard VAT (Services/New)",
    val taxRuleNameProfit: String = "Margin Scheme (2nd Hand)",
    val corporationTaxEnabled: Boolean = false,
    val corporationTaxRate: Double = 19.0,
    val invoiceFooterNote: String = "",
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
    val hasOpenAIKey: Boolean = false,
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
    // Rows on the Repair Intake card. Ids stay put so a saved value survives a
    // rename; titles are the workspace's ("Ring Size" here, "Case Size" there).
    val repairIntakeFields: List<StudioHeadingItem> = listOf(
        StudioHeadingItem("itemType", "Item Type"),
        StudioHeadingItem("metal", "Metal"),
        StudioHeadingItem("hallmark", "Hallmark"),
        StudioHeadingItem("itemSize", "Size"),
        StudioHeadingItem("stones", "Stones"),
        StudioHeadingItem("weight", "Weight"),
        StudioHeadingItem("serialReference", "Serial / Reference")
    ),
    val financialExpenseItems: List<StudioHeadingItem> = emptyList(),
    val financialRemainingItems: List<StudioHeadingItem> = emptyList(),
    val financialShowBaseCost: Boolean = true,
    val financialBaseCostLabel: String = "Cost (Base)",
    // Workspace-wide card colour meanings, stored exactly as the web writes them:
    // a JSON object of colour name ("Red".."Pink") to short label. An empty label
    // deliberately hides the chip for that colour; a missing key keeps the default.
    val cardColorMeaningsJSON: String = "",
    val designNameLabel: String = "Design Name",
    val priorityCardLabel: String = "Priority",
    val riskCardLabel: String = "Risk",
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
    // Customizable heading for the invoice items block (empty → localized "Design Name").
    val orderItemsHeading: String = "",
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
    val pdfShowAddress: Boolean = true,
    val pdfShowShippingAddress: Boolean = true,
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
    // JSON map { orderType: workspaceSnapshot } — the workspace's convention for
    // one order TYPE (e.g. repair). Read-side only on Android: resolved per order
    // in OrderDetailScreen, never written back into profiles or the shared snapshot.
    val typeWorkspaceSnapshotsJSON: String = "",
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
    val lastMessageAt: Date?,
    // Website-chat context (ticketType "website"): who is asking, from which
    // page, on which plan — filled by listMySupportTickets for support admins.
    val visitorEmail: String = "",
    val visitorPage: String = "",
    val needsHuman: Boolean = false,
    val accountUid: String = "",
    val accountEmail: String = "",
    val accountName: String = "",
    val accountCompanyName: String = "",
    val accountPlan: String = ""
) {
    val senderLabel: String
        get() = createdByName.trim().ifEmpty { emailName(createdByEmail).ifEmpty { createdByUid } }

    val isWorkspaceTicket: Boolean
        get() = ticketType == "workspace"

    val isWebsiteTicket: Boolean
        get() = ticketType == "website"
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

data class StudioMessageWorkspaceSettings(
    val directMessagesEnabled: Boolean = true,
    val groupConversationsEnabled: Boolean = true,
    val attachmentsEnabled: Boolean = true
)

data class StudioMessageTypingUser(
    val id: String,
    val name: String = "",
    val email: String = "",
    val photoURL: String = "",
    val updatedAt: Date? = null
)

/** Keep-style personal note (per-user collection). Mirrors iOS StudioKeepNote. */
data class StudioKeepNote(
    val id: String = "",
    val title: String = "",
    val text: String = "",
    val colorName: String = "default",
    val ownerUserId: String = "",
    val ownerEmail: String = "",
    val ownerName: String = "",
    val sharedWith: List<String> = emptyList(),
    val collaboratorEmails: List<String> = emptyList(),
    val activeEditorUserId: String = "",
    val activeEditorEmail: String = "",
    val activeEditorUpdatedAt: Date? = null,
    val isPinned: Boolean = false,
    val isArchived: Boolean = false,
    val isDeleted: Boolean = false,
    val labels: List<String> = emptyList(),
    val links: List<String> = emptyList(),
    val reminderDate: Date? = null,
    val manualOrder: Double = 0.0,
    val createdAt: Date? = null,
    val updatedAt: Date? = null,
    // Note classification (web parity). TYPE and VISIBILITY are separate axes:
    // a personal note can still be workspace-visible, and a team note is
    // simply a type whose default visibility is "workspace".
    val noteType: String = "personal", // "personal" | "order" | "customer" | "team"
    val linkedOrderId: String = "",
    val linkedOrderLabel: String = "",
    val linkedCustomerName: String = "",
    val visibility: String = "only_me" // "only_me" | "workspace"
) {
    val isEmpty: Boolean
        get() = title.trim().isEmpty() && text.trim().isEmpty()
}

/** Pending Keep-note collaboration invite (recipient sees Accept/Decline). */
data class StudioKeepCollaborationInvite(
    val id: String,
    val inviteId: String,
    val companyId: String,
    val noteId: String,
    val sourceUserId: String,
    val sourceEmail: String,
    val title: String,
    val text: String,
    val createdAtMillis: Long? = null
)

/** A note attached to an order (derived from order fields like notes/customerNotes/invNotes/design). */
data class StudioProjectNoteItem(
    val id: String,
    val orderId: String,
    val orderKey: String,
    val projectTitle: String,
    val customerName: String,
    val noteType: String,
    val text: String,
    val updatedAt: Date? = null
) {
    val displayProjectTitle: String
        get() = projectTitle.trim().ifBlank { customerName.trim().ifBlank { "Project" } }
}

data class StudioProjectNoteGroup(
    val id: String,
    val orderKey: String,
    val projectTitle: String,
    val customerName: String,
    val items: List<StudioProjectNoteItem>
) {
    val displayProjectTitle: String
        get() = projectTitle.trim().ifBlank { customerName.trim().ifBlank { "Project" } }

    val latestUpdatedAt: Date?
        get() = items.mapNotNull { it.updatedAt }.maxOrNull()
}


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

data class StudioPaymentEntry(
    val id: String,
    val amount: Double,
    val date: Date?,
    val method: String,
    val note: String
)

/** One billable invoice line (gross / VAT-inclusive). When an order has these, their sum
 *  drives the order total. Mirrors the Swift LineItem and the backend webhook schema. */
data class StudioLineItem(
    val id: String,
    val name: String,
    val quantity: Double,
    val unitPrice: Double,
    val lineTotal: Double
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

// The customer's own item, handed in for repair. Never stock: the server stamps
// customerOwned so nothing downstream can mistake it for inventory.
// One revision of what the customer was quoted. The full document and the
// approval evidence live in a subcollection no client can read; this is the row
// the card shows.
// The customer's own view of this order: one link, no login. Which parts they see
// is a per-order choice, enforced on the server — the portal projection reads only
// what these flags allow, so internal notes, costs, supplier and profit are never
// read rather than filtered out.
data class StudioPortalVisibility(
    val status: Boolean = true,
    val estimate: Boolean = true,
    val payments: Boolean = true,
    val photos: Boolean = true,
    val expectedDate: Boolean = true
)

data class StudioPortalAutoUpdates(
    val enabled: Boolean = true,
    val email: Boolean = true,
    // No SMS provider is connected yet; the preference is stored so it starts
    // working the day one is.
    val sms: Boolean = false
)

data class StudioCustomerPortal(
    val token: String = "",
    val active: Boolean = false,
    val visibility: StudioPortalVisibility = StudioPortalVisibility(),
    val autoUpdates: StudioPortalAutoUpdates = StudioPortalAutoUpdates()
)

data class StudioEstimateSummary(
    val id: String = "",
    val number: String = "",
    val version: Int = 1,
    val status: String = "draft",
    val total: Double = 0.0,
    val subtotal: Double = 0.0,
    val taxAmount: Double = 0.0,
    val taxRate: Double = 0.0,
    val taxType: String = "",
    val itemCount: Int = 0,
    val createdAtMs: Long = 0L,
    val decidedAtMs: Long = 0L,
    val decidedBy: String = "",
    val decisionMethod: String = "",
    val hasSignature: Boolean = false,
    val supersededById: String = "",
    val linkState: String = "none"
)

// The authoritative estimate, fetched from getOrderEstimateRecord. The summary
// is a display index on the order document that any workspace member can write
// to; this comes from a subcollection no client can reach, so it is what the
// card and the PDF show.
data class StudioEstimateLine(
    val id: String = "",
    val name: String = "",
    val quantity: Double = 0.0,
    val unitPrice: Double = 0.0,
    val lineTotal: Double = 0.0
)

data class StudioEstimateApproval(
    val decision: String = "",
    val method: String = "",
    val decidedAtMs: Long = 0L,
    val approvedByName: String = "",
    val approvedByEmail: String = "",
    val declineReason: String = "",
    val signatureDownloadUrl: String = ""
)

data class StudioEstimateRecord(
    val estimateId: String = "",
    val number: String = "",
    val version: Int = 1,
    val status: String = "draft",
    val currency: String = "",
    val lineItems: List<StudioEstimateLine> = emptyList(),
    val subtotal: Double = 0.0,
    val taxRate: Double = 0.0,
    val taxType: String = "",
    val taxAmount: Double = 0.0,
    val total: Double = 0.0,
    val terms: String = "",
    val notes: String = "",
    val validUntilMs: Long = 0L,
    val createdAtMs: Long = 0L,
    val replacesNumber: String = "",
    val approval: StudioEstimateApproval? = null
)

data class StudioRepairIntake(
    // Keyed by the field id the workspace configured (itemType, metal, hallmark…).
    val fields: Map<String, String> = emptyMap(),
    val condition: List<String> = emptyList(),
    val requestedWork: List<String> = emptyList(),
    val customerInstructions: String = "",
    val receivedAtMillis: Long = 0L,
    val receivedByUid: String = "",
    val receivedByName: String = "",
    val customerOwned: Boolean = true
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
    val shippingName: String = "",
    val shippingStreetAddress: String = "",
    val shippingCity: String = "",
    val shippingPostalCode: String = "",
    val shippingCountry: String = "",
    val shippingPhone: String = "",
    val notes: String,
    val invoiceNote: String = "",
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
    val payments: List<StudioPaymentEntry>,
    val lineItems: List<StudioLineItem> = emptyList(),
    // "custom" (something we make) or "repair" (the customer's own item, left with us).
    val orderType: String = "custom",
    val repairIntake: StudioRepairIntake? = null,
    val estimates: List<StudioEstimateSummary> = emptyList(),
    val customerPortal: StudioCustomerPortal = StudioCustomerPortal(),
    val estimateStatus: String = "",
    val invoiceNumber: String,
    val clientFileCount: Int,
    val todoCount: Int,
    val completedTodoCount: Int,
    val workSessionCount: Int,
    val assignedToUid: String,
    val assignedToEmail: String,
    // Production board. Only these two are stored; the stage itself is derived
    // from the steps above (see ProductionRules.kt), so the board and the order
    // can never disagree about where a job is.
    val productionStageOverride: String = "",
    val productionBlockerReason: String = "",
    val productionBlockerNote: String = "",
    val isDeleted: Boolean = false,
    val deletedAt: Date? = null
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

    // A cancelled or refunded order owes nothing and must not inflate a
    // customer's totals as if it were real trade — same rule as the web's
    // countsTowardBalance (status contains "cancel", or the store marked the
    // order refunded through the "Shopify Status" custom field).
    val countsTowardBalance: Boolean
        get() = !status.lowercase().contains("cancel") &&
            (customFields["Shopify Status"] ?: "").lowercase() != "refunded"

    // Total of the order's custom "Remaining" receivables (customFields keyed
    // financialRemaining::<title>). Counts toward the sales total exactly like
    // remainingAmount, on every platform.
    val customRemainingTotal: Double
        get() = customFields.entries.sumOf { (key, raw) ->
            if (key.startsWith("financialRemaining::")) raw.replace(",", "").toDoubleOrNull() ?: 0.0 else 0.0
        }

    val orderValue: Double get() = paidAmount + remainingAmount + customRemainingTotal

    val hasLineItems: Boolean get() = lineItems.isNotEmpty()
    val lineItemsTotal: Double get() = lineItems.sumOf { it.lineTotal }

    val netProfit: Double get() = orderValue - watchPurchasePrice - paymentFee - deliveryCost - taxAmount

    // The toolbar strip shows margin, not net: VAT and extra spending stay in.
    // Web and Mac compute it the same way, so all three toolbars agree.
    val grossMargin: Double get() = orderValue - watchPurchasePrice - paymentFee - deliveryCost

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
            val payments = parsePayments(document.get("payments"))
            val lineItems = parseLineItems(document.get("lineItems"))
            val customFields = stringMap(document.get("customFields"))
            val repairIntake = parseRepairIntake(document.get("repairIntake"))
            val estimates = parseEstimates(document.get("estimates"))
            val portalFlag = { source: Any?, key: String, fallback: Boolean ->
                ((source as? Map<*, *>)?.get(key) as? Boolean) ?: fallback
            }
            val portalVisibilityRaw = document.get("portalVisibility")
            val portalAutoRaw = document.get("portalAutoUpdates")
            val customerPortal = StudioCustomerPortal(
                token = document.getString("portalToken").orEmpty(),
                // A token id with no revoke stamp is what makes a link live; the
                // plaintext is only there so the workspace can copy it again.
                active = document.getString("portalTokenId").orEmpty().isNotBlank(),
                visibility = StudioPortalVisibility(
                    status = portalFlag(portalVisibilityRaw, "status", true),
                    estimate = portalFlag(portalVisibilityRaw, "estimate", true),
                    payments = portalFlag(portalVisibilityRaw, "payments", true),
                    photos = portalFlag(portalVisibilityRaw, "photos", true),
                    expectedDate = portalFlag(portalVisibilityRaw, "expectedDate", true)
                ),
                autoUpdates = StudioPortalAutoUpdates(
                    enabled = portalFlag(portalAutoRaw, "enabled", true),
                    email = portalFlag(portalAutoRaw, "email", true),
                    sms = portalFlag(portalAutoRaw, "sms", false)
                )
            )
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
                shippingName = document.getString("shippingName").orEmpty(),
                shippingStreetAddress = document.getString("shippingStreetAddress").orEmpty(),
                shippingCity = document.getString("shippingCity").orEmpty(),
                shippingPostalCode = document.getString("shippingPostalCode").orEmpty(),
                shippingCountry = document.getString("shippingCountry").orEmpty(),
                shippingPhone = document.getString("shippingPhone").orEmpty(),
                notes = document.getString("notes").orEmpty(),
                invoiceNote = document.getString("invoiceNote").orEmpty(),
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
                payments = payments,
                lineItems = lineItems,
                orderType = if (document.getString("orderType") == "repair") "repair" else "custom",
                repairIntake = repairIntake,
                estimates = estimates,
                customerPortal = customerPortal,
                estimateStatus = document.getString("estimateStatus").orEmpty(),
                invoiceNumber = document.getString("invoiceNumber") ?: "",
                clientFileCount = clientFiles.size,
                todoCount = todoItems.size,
                completedTodoCount = todoItems.count { it.isDone },
                workSessionCount = workSessions.size,
                assignedToUid = document.getString("assignedToUid").orEmpty(),
                assignedToEmail = document.getString("assignedToEmail").orEmpty(),
                productionStageOverride = document.getString("productionStageOverride").orEmpty(),
                productionBlockerReason = ((document.get("productionBlocker") as? Map<*, *>)
                    ?.get("reason") as? String).orEmpty(),
                productionBlockerNote = ((document.get("productionBlocker") as? Map<*, *>)
                    ?.get("note") as? String).orEmpty(),
                isDeleted = document.getBoolean("isDeleted") ?: false,
                deletedAt = document.getDate("deletedAt")
            )
        }
    }
}

/** A workspace customer record from the top-level `musteriler` collection (matches
 *  the Mac/iPhone and web customer directory). Editable contact details + notes. */
data class StudioCustomer(
    val id: String,
    val companyId: String = "",
    val name: String = "",
    val email: String = "",
    val phone: String = "",
    // A landline/primary number distinct from the WhatsApp-capable one. No form
    // field on Android yet, but decoded and sent on every save so an edit here
    // never wipes a number entered on the web.
    val primaryPhone: String = "",
    // The customer's OWN WhatsApp number — the store-fed "phone" stays untouched.
    val whatsappNumber: String = "",
    // Trade customers: the business the person buys for.
    val company: String = "",
    val instagram: String = "",
    val address: String = "",
    val streetAddress: String = "",
    val city: String = "",
    val postalCode: String = "",
    val country: String = "",
    // Latest per-order shipping destination — structured + combined line, editable like billing.
    val shippingAddress: String = "",
    val shippingStreetAddress: String = "",
    val shippingCity: String = "",
    val shippingPostalCode: String = "",
    val shippingCountry: String = "",
    val shippingPhone: String = "",
    val notes: String = "",
    val profileImageUrl: String = "",
    val lastContactDate: Date? = null,
    // Store-integration provenance (web parity): where the record came from
    // ("woocommerce" | "shopify" | "inbound" | ""), the store's own customer id,
    // when the store last synced it, and the raw payload the store last sent
    // (JSON string ≤6KB) so "Resync from store data" can replay it.
    val source: String = "",
    val externalCustomerId: String = "",
    val integrationSyncedAt: Date? = null,
    val integrationLastPayload: String = "",
    // Segments + contact preferences (web parity): workspace tags like "VIP",
    // preferred outreach channel (""|"phone"|"whatsapp"|"email"|"instagram"),
    // the do-not-contact flag, marketing opt-in (""|"subscribed"|"unsubscribed")
    // and the next follow-up date.
    val tags: List<String> = emptyList(),
    val preferredChannel: String = "",
    val doNotContact: Boolean = false,
    val marketingOptIn: String = "",
    val nextFollowUpDate: Date? = null
) {
    companion object {
        fun fromDocument(document: DocumentSnapshot): StudioCustomer = StudioCustomer(
            id = document.id,
            companyId = document.getString("companyId").orEmpty(),
            name = document.getString("name").orEmpty(),
            email = document.getString("email").orEmpty(),
            phone = document.getString("phone").orEmpty(),
            primaryPhone = document.getString("primaryPhone").orEmpty(),
            whatsappNumber = document.getString("whatsappNumber").orEmpty(),
            company = document.getString("company").orEmpty(),
            instagram = document.getString("instagram").orEmpty(),
            address = document.getString("address").orEmpty(),
            streetAddress = (document.getString("streetAddress")
                ?: document.getString("addressLine1")
                ?: document.getString("street")).orEmpty(),
            city = document.getString("city").orEmpty(),
            postalCode = document.getString("postalCode").orEmpty(),
            country = document.getString("country").orEmpty(),
            shippingAddress = document.getString("shippingAddress").orEmpty(),
            shippingStreetAddress = document.getString("shippingStreetAddress").orEmpty(),
            shippingCity = document.getString("shippingCity").orEmpty(),
            shippingPostalCode = document.getString("shippingPostalCode").orEmpty(),
            shippingCountry = document.getString("shippingCountry").orEmpty(),
            shippingPhone = document.getString("shippingPhone").orEmpty(),
            notes = document.getString("notes").orEmpty(),
            profileImageUrl = document.getString("profileImageUrl").orEmpty(),
            lastContactDate = document.getDate("lastContactDate"),
            source = document.getString("source").orEmpty(),
            externalCustomerId = document.getString("externalCustomerId").orEmpty(),
            integrationSyncedAt = document.getDate("integrationSyncedAt"),
            integrationLastPayload = document.getString("integrationLastPayload").orEmpty(),
            tags = stringList(document.get("tags")).map { it.trim() }.filter { it.isNotEmpty() },
            preferredChannel = document.getString("preferredChannel").orEmpty(),
            doNotContact = document.getBoolean("doNotContact") == true,
            marketingOptIn = document.getString("marketingOptIn").orEmpty(),
            nextFollowUpDate = document.getDate("nextFollowUpDate")
        )
    }
}

// A partial update for a customer's segments/contact preferences. Only the
// non-null members are sent to updateWebCustomer, matching the callable's
// key-present semantics — every omitted key stays unchanged on the server,
// so the plain contact-field autosave can never wipe these fields.
data class StudioCustomerPrefsPatch(
    val tags: List<String>? = null,
    val preferredChannel: String? = null,
    val doNotContact: Boolean? = null,
    val marketingOptIn: String? = null,
    // The follow-up date is tri-state: both unset omits the key entirely,
    // millis sets a date, clearNextFollowUp sends an explicit null so the
    // server erases the stored Timestamp.
    val nextFollowUpDateMillis: Long? = null,
    val clearNextFollowUp: Boolean = false
)

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

private fun parsePayments(value: Any?): List<StudioPaymentEntry> {
    return mapItems(value).mapIndexed { index, item ->
        StudioPaymentEntry(
            id = stringAny(item["id"], "payment-$index"),
            amount = doubleAny(item["amount"], 0.0),
            date = dateAny(item["date"]),
            method = stringAny(item["method"], ""),
            note = stringAny(item["note"], "")
        )
    }.sortedByDescending { it.date?.time ?: 0L }
}

private fun parseLineItems(value: Any?): List<StudioLineItem> {
    return mapItems(value).mapIndexed { index, item ->
        StudioLineItem(
            id = stringAny(item["id"], "item-$index"),
            name = stringAny(item["name"], ""),
            quantity = doubleAny(item["quantity"], 1.0),
            unitPrice = doubleAny(item["unitPrice"], 0.0),
            lineTotal = doubleAny(item["lineTotal"], 0.0)
        )
    }
}

// Callable payloads arrive untyped: a whole quantity comes back as an Integer,
// so every number is read through Number rather than cast straight to Double.
fun parseEstimateRecord(value: Any?): StudioEstimateRecord? {
    val map = value as? Map<*, *> ?: return null
    val approvalMap = map["approval"] as? Map<*, *>
    return StudioEstimateRecord(
        estimateId = stringAny(map["estimateId"], ""),
        number = stringAny(map["number"], ""),
        version = (map["version"] as? Number)?.toInt() ?: 1,
        status = stringAny(map["status"], "draft"),
        currency = stringAny(map["currency"], ""),
        lineItems = (map["lineItems"] as? List<*>).orEmpty().mapNotNull { raw ->
            val item = raw as? Map<*, *> ?: return@mapNotNull null
            StudioEstimateLine(
                id = stringAny(item["id"], ""),
                name = stringAny(item["name"], ""),
                quantity = (item["quantity"] as? Number)?.toDouble() ?: 0.0,
                unitPrice = (item["unitPrice"] as? Number)?.toDouble() ?: 0.0,
                lineTotal = (item["lineTotal"] as? Number)?.toDouble() ?: 0.0
            )
        },
        subtotal = (map["subtotal"] as? Number)?.toDouble() ?: 0.0,
        taxRate = (map["taxRate"] as? Number)?.toDouble() ?: 0.0,
        taxType = stringAny(map["taxType"], ""),
        taxAmount = (map["taxAmount"] as? Number)?.toDouble() ?: 0.0,
        total = (map["total"] as? Number)?.toDouble() ?: 0.0,
        terms = stringAny(map["terms"], ""),
        notes = stringAny(map["notes"], ""),
        validUntilMs = (map["validUntilMs"] as? Number)?.toLong() ?: 0L,
        createdAtMs = (map["createdAtMs"] as? Number)?.toLong() ?: 0L,
        replacesNumber = stringAny(map["replacesNumber"], ""),
        approval = approvalMap?.let {
            StudioEstimateApproval(
                decision = stringAny(it["decision"], ""),
                method = stringAny(it["method"], ""),
                decidedAtMs = (it["decidedAtMs"] as? Number)?.toLong() ?: 0L,
                approvedByName = stringAny(it["approvedByName"], ""),
                approvedByEmail = stringAny(it["approvedByEmail"], ""),
                declineReason = stringAny(it["declineReason"], ""),
                signatureDownloadUrl = stringAny(it["signatureDownloadUrl"], "")
            )
        }
    )
}

private fun parseEstimates(value: Any?): List<StudioEstimateSummary> {
    return mapItems(value).map { item ->
        StudioEstimateSummary(
            id = stringAny(item["id"], ""),
            number = stringAny(item["number"], ""),
            version = (item["version"] as? Number)?.toInt() ?: 1,
            status = stringAny(item["status"], "draft"),
            total = doubleAny(item["total"], 0.0),
            subtotal = doubleAny(item["subtotal"], 0.0),
            taxAmount = doubleAny(item["taxAmount"], 0.0),
            taxRate = doubleAny(item["taxRate"], 0.0),
            taxType = stringAny(item["taxType"], ""),
            itemCount = (item["itemCount"] as? Number)?.toInt() ?: 0,
            createdAtMs = (item["createdAtMs"] as? Number)?.toLong() ?: 0L,
            decidedAtMs = (item["decidedAtMs"] as? Number)?.toLong() ?: 0L,
            decidedBy = stringAny(item["decidedBy"], ""),
            decisionMethod = stringAny(item["decisionMethod"], ""),
            hasSignature = item["hasSignature"] == true,
            supersededById = stringAny(item["supersededById"], ""),
            linkState = stringAny(item["linkState"], "none")
        )
    }
}

private fun parseRepairIntake(value: Any?): StudioRepairIntake? {
    val map = value as? Map<*, *> ?: return null
    val fields = stringMap(map["fields"])
    val lines = { raw: Any? ->
        (raw as? List<*>).orEmpty().mapNotNull { entry ->
            when (entry) {
                is String -> entry.trim().ifBlank { null }
                is Map<*, *> -> stringAny(entry["text"], "").trim().ifBlank { null }
                else -> null
            }
        }
    }
    val received = map["receivedAt"]
    val receivedMillis = when (received) {
        is com.google.firebase.Timestamp -> received.toDate().time
        is Date -> received.time
        is Number -> received.toLong()
        else -> 0L
    }
    return StudioRepairIntake(
        fields = fields,
        condition = lines(map["condition"]),
        requestedWork = lines(map["requestedWork"]),
        customerInstructions = stringAny(map["customerInstructions"], ""),
        receivedAtMillis = receivedMillis,
        receivedByUid = stringAny(map["receivedByUid"], ""),
        receivedByName = stringAny(map["receivedByName"], ""),
        customerOwned = true
    )
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

private fun doubleAny(value: Any?, fallback: Double): Double {
    return when (value) {
        is Double -> value
        is Float -> value.toDouble()
        is Long -> value.toDouble()
        is Int -> value.toDouble()
        is String -> value.toDoubleOrNull()
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
