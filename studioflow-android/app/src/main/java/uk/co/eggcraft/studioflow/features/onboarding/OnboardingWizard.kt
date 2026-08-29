package uk.co.eggcraft.studioflow.features.onboarding

import com.google.firebase.firestore.FieldValue

/**
 * The Android half of studioflow-web/lib/studioflow/onboardingWizard.ts.
 *
 * Four questions worth asking before someone starts work. The report's cut: ask
 * only what genuinely changes the product, and make the answers visibly change
 * it. Business age, inventory experience and "how did you find us" were dropped
 * — they help us, not the person filling the form.
 *
 * There is no Skip. Every step is answerable instead: "Start empty" and "I'll
 * set this up later" are real choices on the last step, not an escape hatch, so
 * nobody is trapped and nobody is nagged. Back moves between steps.
 */

enum class OnboardingWorkKind(val id: String, val label: String, val businessType: String) {
    WATCHES_JEWELLERY("watches_jewellery", "Watches & jewellery", "Jewellery Studio"),
    REPAIRS("repairs", "Repairs & servicing", "Repair Service"),
    LEATHER("leather", "Leather goods", "Handmade Products"),
    ART_DESIGN("art_design", "Art & custom design", "Custom Art Studio"),
    CLOTHING("clothing", "Clothing & tailoring", "Tailor / Alteration Studio"),
    FOOD("food", "Cakes & food", "Food / Bakery / Catering"),
    CERAMICS("ceramics", "Ceramics & crafts", "Handmade Products"),
    MADE_TO_ORDER("made_to_order", "General made-to-order", "General Small Business"),
    OTHER("other", "Other", "General Small Business")
}

enum class OnboardingWorkflow(val id: String, val label: String, val detail: String) {
    MADE_TO_ORDER("made_to_order", "Made to order", "I start work after a customer places an order."),
    REPAIRS("repairs", "Repairs and servicing", "Customers send or bring items for work."),
    BATCH("batch", "Batch production", "I make products in groups and sell them afterwards."),
    MIXED("mixed", "A mix of these", "My business uses more than one workflow.");

    /**
     * How a workshop works decides what its board's lanes are called. A repair
     * shop does not have a "Ready to Ship" column; it has a collection counter.
     */
    fun productionStages(): List<Map<String, Any>> = when (this) {
        REPAIRS -> listOf(
            stage("intake", "Intake", "ready", 10),
            stage("in_repair", "In Repair", "active", 10),
            stage("waiting_parts", "Waiting / Blocked", "blocked", 10),
            stage("testing", "Testing", "review", 10),
            stage("ready_for_collection", "Ready for Collection", "shipready", 10),
            stage("done", "Done", "done", 0)
        )
        BATCH -> listOf(
            stage("planned", "Planned", "ready", 10),
            stage("in_production", "In Production", "active", 10),
            stage("blocked", "Waiting / Blocked", "blocked", 10),
            stage("quality_check", "Quality Check", "review", 10),
            stage("ready_to_ship", "Ready to Ship", "shipready", 10),
            stage("done", "Done", "done", 0)
        )
        MADE_TO_ORDER, MIXED -> listOf(
            stage("queued", "Queued", "ready", 10),
            stage("in_progress", "In Progress", "active", 10),
            stage("blocked", "Waiting / Blocked", "blocked", 10),
            stage("quality_check", "Quality Check", "review", 10),
            stage("ready_to_ship", "Ready to Ship", "shipready", 10),
            stage("done", "Done", "done", 0)
        )
    }

    private fun stage(id: String, title: String, kind: String, wipLimit: Int): Map<String, Any> =
        mapOf("id" to id, "title" to title, "kind" to kind, "wipLimit" to wipLimit)
}

enum class OnboardingTeamSize(val id: String, val label: String, val seats: Int) {
    SOLO("solo", "Just me", 1),
    TWO_TO_FIVE("2_5", "2–5 people", 5),
    SIX_TO_TEN("6_10", "6–10 people", 10),
    TEN_PLUS("10_plus", "More than 10", 20)
}

enum class OnboardingVolume(val id: String, val label: String) {
    UNDER_TEN("under_10", "Fewer than 10"),
    TEN_TO_THIRTY("10_30", "10–30"),
    THIRTY_ONE_TO_HUNDRED("31_100", "31–100"),
    HUNDRED_PLUS("100_plus", "More than 100"),
    NOT_SURE("not_sure", "Not sure yet")
}

enum class OnboardingGoal(val id: String, val label: String, val isPrimary: Boolean) {
    ORDERS_CUSTOMERS("orders_customers", "Organise my orders and customers", true),
    PRODUCTION_DEADLINES("production_deadlines", "Plan production and deadlines", true),
    REPAIRS_SERVICE("repairs_service", "Track repairs and service work", true),
    ESTIMATES("estimates", "Send estimates and get approvals", true),
    INVENTORY("inventory", "Manage inventory and materials", true),
    FINANCE("finance", "Track income, expenses and profit", true),
    FILES_NOTES("files_notes", "Keep files and notes together", false),
    CONNECT_STORE("connect_store", "Connect Shopify or WooCommerce", false),
    TEAM("team", "Manage work with my team", false),
    OTHER("other", "Something else", false);

    /**
     * The starting tasks each goal turns into. The report's point: the answers
     * have to visibly change the product, or the question was just a survey.
     */
    fun startingTasks(): List<String> = when (this) {
        ORDERS_CUSTOMERS -> listOf("Create your first order", "Add a customer", "Customise your order cards")
        PRODUCTION_DEADLINES -> listOf("Choose your production stages", "Add a start and delivery date", "Open Schedule")
        REPAIRS_SERVICE -> listOf("Open a repair intake", "Record what the customer brought in", "Set a promised date")
        ESTIMATES -> listOf("Send your first estimate", "Turn an approval into an order", "Set your estimate wording")
        INVENTORY -> listOf("Add your first inventory item", "Create a location", "Reserve an item for an order")
        FILES_NOTES -> listOf("Upload a file to an order", "Write your first note", "Open the Files library")
        FINANCE -> listOf("Record a payment", "Set your tax rule", "Open the finance dashboard")
        CONNECT_STORE -> listOf("Connect your store", "Review imported orders", "Confirm customer matching")
        TEAM -> listOf("Invite a team member", "Set their permissions", "Assign the first task")
        OTHER -> listOf("Create your first order", "Add a customer", "Open your dashboard")
    }
}

enum class OnboardingStart(val id: String, val label: String, val detail: String) {
    FIRST_ORDER("first_order", "Create my first order", "Start with the thing you actually do."),
    SAMPLE("sample", "Explore a sample workspace", "Look around with example orders before adding your own."),
    SPREADSHEET("spreadsheet", "Import a spreadsheet", "Move what you already track into NivaDesk."),
    EMPTY("empty", "Start empty", "A clean workspace, set up your way."),
    LATER("later", "I'll set this up later", "Go straight to your workspace.")
}

data class OnboardingCountry(
    val code: String,
    val label: String,
    val currency: String,
    val timeZone: String
)

val onboardingCountries = listOf(
    OnboardingCountry("GB", "United Kingdom", "GBP", "Europe/London"),
    OnboardingCountry("US", "United States", "USD", "America/New_York"),
    OnboardingCountry("TR", "Türkiye", "TRY", "Europe/Istanbul"),
    OnboardingCountry("DE", "Germany", "EUR", "Europe/Berlin"),
    OnboardingCountry("FR", "France", "EUR", "Europe/Paris"),
    OnboardingCountry("IT", "Italy", "EUR", "Europe/Rome"),
    OnboardingCountry("ES", "Spain", "EUR", "Europe/Madrid"),
    OnboardingCountry("NL", "Netherlands", "EUR", "Europe/Amsterdam"),
    OnboardingCountry("IE", "Ireland", "EUR", "Europe/Dublin"),
    OnboardingCountry("PT", "Portugal", "EUR", "Europe/Lisbon"),
    OnboardingCountry("AU", "Australia", "AUD", "Australia/Sydney"),
    OnboardingCountry("CA", "Canada", "CAD", "America/Toronto"),
    OnboardingCountry("CH", "Switzerland", "CHF", "Europe/Zurich"),
    OnboardingCountry("AE", "United Arab Emirates", "AED", "Asia/Dubai"),
    OnboardingCountry("JP", "Japan", "JPY", "Asia/Tokyo"),
    OnboardingCountry("XX", "Somewhere else", "GBP", "UTC")
)

val onboardingCurrencies = listOf(
    "GBP" to "GBP (£)", "USD" to "USD ($)", "EUR" to "EUR (€)", "TRY" to "TRY (₺)",
    "JPY" to "JPY (¥)", "AUD" to "AUD (A$)", "CAD" to "CAD (C$)", "CHF" to "CHF", "AED" to "AED"
)

val onboardingTimeZones = listOf(
    "Europe/London", "Europe/Istanbul", "Europe/Berlin", "Europe/Paris", "Europe/Madrid",
    "Europe/Amsterdam", "Europe/Dublin", "Europe/Lisbon", "Europe/Rome", "Europe/Zurich",
    "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
    "America/Toronto", "Asia/Dubai", "Asia/Tokyo", "Australia/Sydney", "UTC"
)

/**
 * The accounts a workspace can genuinely connect today.
 *
 * Deliberately only these four: a logo for something we cannot actually connect
 * would cost exactly the trust the grid is here to earn.
 */
enum class OnboardingIntegration(
    val id: String,
    val brand: String,
    val detail: String,
    /** Where tapping Connect lands, once the answers are safely saved. */
    val destination: String,
    val colour: Long
) {
    SHOPIFY("shopify", "Shopify", "Import your store's orders and customers automatically.", "settings:shopify", 0xFF5E8E3E),
    WOOCOMMERCE("woocommerce", "WooCommerce", "Import your store's orders and customers automatically.", "settings:woocommerce", 0xFF7F54B3),
    BANK("bank", "Open Banking", "See what you spent and earned beside the work that earned it.", "tab:bank", 0xFF0F7B6C),
    CHATGPT("chatgpt", "ChatGPT", "Ask about your orders, and draft replies, from inside ChatGPT.", "settings:quickReply", 0xFF10A37F)
}

/** The plans the sign-up wizard may put a trial on. Mirrors the web list and
 *  the server's TRIAL_SELECTABLE_PLANS. */
enum class OnboardingTrialPlan(val raw: String, val title: String, val summary: String, val price: String) {
    STARTER("lifetime_lite", "NivaDesk Starter", "One person, the essentials.", "£9 / month"),
    PRO("pro_monthly", "NivaDesk Pro", "One studio, everything in it.", "£19 / month"),
    TEAM("team_monthly", "NivaDesk Team", "Shared work, roles and permissions.", "£49 / month")
}

data class OnboardingAnswers(
    val country: String = "GB",
    val currency: String = "GBP",
    val timeZone: String = "Europe/London",
    val workKinds: List<OnboardingWorkKind> = emptyList(),
    val workflow: OnboardingWorkflow = OnboardingWorkflow.MADE_TO_ORDER,
    val teamSize: OnboardingTeamSize = OnboardingTeamSize.SOLO,
    val volume: OnboardingVolume? = null,
    val mainGoal: OnboardingGoal? = null,
    val extraGoals: List<OnboardingGoal> = emptyList(),
    val start: OnboardingStart? = null,
    /** The plan the last step confirmed. null until that step is reached. */
    val plan: OnboardingTrialPlan? = null
) {
    /**
     * What the answers imply, and what the last step shows as chosen. Same rule
     * as the server's automaticTrialPlanFor: a workspace that says it has a team
     * gets the plan that covers one, because trialling Pro would hide the very
     * features they came for.
     */
    val recommendedPlan: OnboardingTrialPlan
        get() = if (teamSize.seats > 1) OnboardingTrialPlan.TEAM else OnboardingTrialPlan.PRO

    val chosenPlan: OnboardingTrialPlan get() = plan ?: recommendedPlan

    /**
     * The preset engine keys off a business-type phrase, so the chosen work
     * kinds are turned back into the vocabulary it already understands.
     */
    val businessType: String
        get() = workKinds.firstOrNull()?.businessType ?: "General Small Business"

    val goals: List<String>
        get() = listOfNotNull(mainGoal?.id) + extraGoals.map { it.id }
}

/**
 * Everything the wizard's answers change, as one settings patch. Seats are NOT
 * here: they belong on the COMPANY document, because that is where the trial
 * engine reads them to decide whether the fortnight should be Pro or Team.
 */
fun onboardingWizardUpdates(answers: OnboardingAnswers, userId: String): Map<String, Any?> = buildMap {
    put("selectedCountry", answers.country)
    put("selectedCurrency", answers.currency)
    put("selectedTimeZone", answers.timeZone)
    put("onboardingWorkKinds", answers.workKinds.map { it.id })
    put("onboardingWorkflow", answers.workflow.id)
    put("onboardingTeamSizeBand", answers.teamSize.id)
    put("onboardingGoals", answers.goals)
    put("onboardingStartChoice", answers.start?.id ?: "")
    put("productionStages", answers.workflow.productionStages())
    answers.mainGoal?.let { put("onboardingMainGoal", it.id) }
    answers.volume?.let { put("onboardingOrderVolume", it.id) }
    put("businessOnboardingCompleted", true)
    put("businessOnboardingCompletedAt", FieldValue.serverTimestamp())
    put("businessOnboardingCompletedAction", "wizard")
    put("businessOnboardingCompletedBy", userId)
}
