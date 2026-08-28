import SwiftUI

/// The Apple half of studioflow-web/lib/studioflow/onboardingWizard.ts.
///
/// Four questions worth asking before someone starts work. The report's cut: ask
/// only what genuinely changes the product, and make the answers visibly change
/// it. Business age, inventory experience and "how did you find us" were dropped
/// — they help us, not the person filling the form.
///
/// There is no Skip. Every step is answerable instead: "Start empty" and "I'll
/// set this up later" are real choices on the last step, not an escape hatch, so
/// nobody is trapped and nobody is nagged. Back moves between steps.

enum OnboardingWorkKind: String, CaseIterable {
    case watchesJewellery = "watches_jewellery"
    case repairs
    case leather
    case artDesign = "art_design"
    case clothing
    case food
    case ceramics
    case madeToOrder = "made_to_order"
    case other

    var label: String {
        switch self {
        case .watchesJewellery: return "Watches & jewellery"
        case .repairs: return "Repairs & servicing"
        case .leather: return "Leather goods"
        case .artDesign: return "Art & custom design"
        case .clothing: return "Clothing & tailoring"
        case .food: return "Cakes & food"
        case .ceramics: return "Ceramics & crafts"
        case .madeToOrder: return "General made-to-order"
        case .other: return "Other"
        }
    }

    /// The preset engine keys off a business-type phrase, so the chosen work
    /// kinds are turned back into the vocabulary it already understands.
    var businessType: String {
        switch self {
        case .watchesJewellery: return "Jewellery Studio"
        case .repairs: return "Repair Service"
        case .leather, .ceramics: return "Handmade Products"
        case .artDesign: return "Custom Art Studio"
        case .clothing: return "Tailor / Alteration Studio"
        case .food: return "Food / Bakery / Catering"
        case .madeToOrder, .other: return "General Small Business"
        }
    }
}

enum OnboardingWorkflow: String, CaseIterable {
    case madeToOrder = "made_to_order"
    case repairs
    case batch
    case mixed

    var label: String {
        switch self {
        case .madeToOrder: return "Made to order"
        case .repairs: return "Repairs and servicing"
        case .batch: return "Batch production"
        case .mixed: return "A mix of these"
        }
    }

    var detail: String {
        switch self {
        case .madeToOrder: return "I start work after a customer places an order."
        case .repairs: return "Customers send or bring items for work."
        case .batch: return "I make products in groups and sell them afterwards."
        case .mixed: return "My business uses more than one workflow."
        }
    }

    /// How a workshop works decides what its board's lanes are called. A repair
    /// shop does not have a "Ready to Ship" column; it has a collection counter.
    var productionStages: [ProductionStage] {
        switch self {
        case .repairs:
            return [
                ProductionStage(id: "intake", title: "Intake", kind: .ready, wipLimit: 10),
                ProductionStage(id: "in_repair", title: "In Repair", kind: .active, wipLimit: 10),
                ProductionStage(id: "waiting_parts", title: "Waiting / Blocked", kind: .blocked, wipLimit: 10),
                ProductionStage(id: "testing", title: "Testing", kind: .review, wipLimit: 10),
                ProductionStage(id: "ready_for_collection", title: "Ready for Collection", kind: .shipready, wipLimit: 10),
                ProductionStage(id: "done", title: "Done", kind: .done, wipLimit: 0)
            ]
        case .batch:
            return [
                ProductionStage(id: "planned", title: "Planned", kind: .ready, wipLimit: 10),
                ProductionStage(id: "in_production", title: "In Production", kind: .active, wipLimit: 10),
                ProductionStage(id: "blocked", title: "Waiting / Blocked", kind: .blocked, wipLimit: 10),
                ProductionStage(id: "quality_check", title: "Quality Check", kind: .review, wipLimit: 10),
                ProductionStage(id: "ready_to_ship", title: "Ready to Ship", kind: .shipready, wipLimit: 10),
                ProductionStage(id: "done", title: "Done", kind: .done, wipLimit: 0)
            ]
        case .madeToOrder, .mixed:
            return defaultProductionStages
        }
    }
}

enum OnboardingTeamSize: String, CaseIterable {
    case solo
    case twoToFive = "2_5"
    case sixToTen = "6_10"
    case tenPlus = "10_plus"

    var label: String {
        switch self {
        case .solo: return "Just me"
        case .twoToFive: return "2–5 people"
        case .sixToTen: return "6–10 people"
        case .tenPlus: return "More than 10"
        }
    }

    /// What the trial engine reads to decide whether the fortnight is Pro or Team.
    var seats: Int {
        switch self {
        case .solo: return 1
        case .twoToFive: return 5
        case .sixToTen: return 10
        case .tenPlus: return 20
        }
    }
}

enum OnboardingVolume: String, CaseIterable {
    case underTen = "under_10"
    case tenToThirty = "10_30"
    case thirtyOneToHundred = "31_100"
    case hundredPlus = "100_plus"
    case notSure = "not_sure"

    var label: String {
        switch self {
        case .underTen: return "Fewer than 10"
        case .tenToThirty: return "10–30"
        case .thirtyOneToHundred: return "31–100"
        case .hundredPlus: return "More than 100"
        case .notSure: return "Not sure yet"
        }
    }
}

enum OnboardingGoal: String, CaseIterable {
    case ordersCustomers = "orders_customers"
    case productionDeadlines = "production_deadlines"
    case repairsService = "repairs_service"
    case estimates
    case inventory
    case finance
    case filesNotes = "files_notes"
    case connectStore = "connect_store"
    case team
    case other

    var label: String {
        switch self {
        case .ordersCustomers: return "Organise my orders and customers"
        case .productionDeadlines: return "Plan production and deadlines"
        case .repairsService: return "Track repairs and service work"
        case .estimates: return "Send estimates and get approvals"
        case .inventory: return "Manage inventory and materials"
        case .finance: return "Track income, expenses and profit"
        case .filesNotes: return "Keep files and notes together"
        case .connectStore: return "Connect Shopify or WooCommerce"
        case .team: return "Manage work with my team"
        case .other: return "Something else"
        }
    }

    /// Six shown first, the rest behind "Show more goals" — a wall of ten
    /// choices is a wall, not a question.
    var isPrimary: Bool {
        switch self {
        case .ordersCustomers, .productionDeadlines, .repairsService,
             .estimates, .inventory, .finance:
            return true
        default:
            return false
        }
    }

    /// The starting tasks each goal turns into. The report's point: the answers
    /// have to visibly change the product, or the question was just a survey.
    var startingTasks: [String] {
        switch self {
        case .ordersCustomers:
            return ["Create your first order", "Add a customer", "Customise your order cards"]
        case .productionDeadlines:
            return ["Choose your production stages", "Add a start and delivery date", "Open Schedule"]
        case .repairsService:
            return ["Open a repair intake", "Record what the customer brought in", "Set a promised date"]
        case .estimates:
            return ["Send your first estimate", "Turn an approval into an order", "Set your estimate wording"]
        case .inventory:
            return ["Add your first inventory item", "Create a location", "Reserve an item for an order"]
        case .filesNotes:
            return ["Upload a file to an order", "Write your first note", "Open the Files library"]
        case .finance:
            return ["Record a payment", "Set your tax rule", "Open the finance dashboard"]
        case .connectStore:
            return ["Connect your store", "Review imported orders", "Confirm customer matching"]
        case .team:
            return ["Invite a team member", "Set their permissions", "Assign the first task"]
        case .other:
            return ["Create your first order", "Add a customer", "Open your dashboard"]
        }
    }
}

enum OnboardingStart: String, CaseIterable {
    case firstOrder = "first_order"
    case sample
    case spreadsheet
    case empty
    case later

    var label: String {
        switch self {
        case .firstOrder: return "Create my first order"
        case .sample: return "Explore a sample workspace"
        case .spreadsheet: return "Import a spreadsheet"
        case .empty: return "Start empty"
        case .later: return "I'll set this up later"
        }
    }

    var detail: String {
        switch self {
        case .firstOrder: return "Start with the thing you actually do."
        case .sample: return "Look around with example orders before adding your own."
        case .spreadsheet: return "Move what you already track into NivaDesk."
        case .empty: return "A clean workspace, set up your way."
        case .later: return "Go straight to your workspace."
        }
    }
}

/// The accounts a workspace can genuinely connect today.
///
/// Deliberately only these four: a logo for something we cannot actually
/// connect would cost exactly the trust the grid is here to earn.
struct OnboardingIntegration: Identifiable {
    let id: String
    let name: String
    let detail: String
    /// Where tapping Connect lands, once the answers are safely saved.
    let destination: OnboardingIntegrationDestination
    let colour: Color
}

enum OnboardingIntegrationDestination {
    case settingsSection(String)
    case tab(String)
}

let onboardingIntegrations: [OnboardingIntegration] = [
    OnboardingIntegration(
        id: "shopify",
        name: "Shopify",
        detail: "Import your store's orders and customers automatically.",
        destination: .settingsSection("Shopify Integration"),
        colour: Color(red: 0.37, green: 0.56, blue: 0.24)
    ),
    OnboardingIntegration(
        id: "woocommerce",
        name: "WooCommerce",
        detail: "Import your store's orders and customers automatically.",
        destination: .settingsSection("WooCommerce Integration"),
        colour: Color(red: 0.50, green: 0.33, blue: 0.70)
    ),
    OnboardingIntegration(
        id: "bank",
        name: "Open Banking",
        detail: "See what you spent and earned beside the work that earned it.",
        destination: .tab("BankSpending"),
        colour: Color(red: 0.06, green: 0.48, blue: 0.42)
    ),
    OnboardingIntegration(
        id: "chatgpt",
        name: "ChatGPT",
        detail: "Ask about your orders, and draft replies, from inside ChatGPT.",
        destination: .settingsSection("Quick Reply Settings"),
        colour: Color(red: 0.06, green: 0.64, blue: 0.50)
    )
]

struct OnboardingAnswers {
    var country: String = "GB"
    var currency: String = "GBP"
    var timeZone: String = TimeZone.current.identifier
    var workKinds: [OnboardingWorkKind] = []
    var workflow: OnboardingWorkflow = .madeToOrder
    var teamSize: OnboardingTeamSize = .solo
    var volume: OnboardingVolume?
    var mainGoal: OnboardingGoal?
    var extraGoals: [OnboardingGoal] = []
    var start: OnboardingStart?

    var businessType: String {
        workKinds.first?.businessType ?? "General Small Business"
    }

    var goals: [String] {
        guard let main = mainGoal else { return extraGoals.map { $0.rawValue } }
        return [main.rawValue] + extraGoals.map { $0.rawValue }
    }
}

let onboardingCountries: [(code: String, label: String, currency: String, timeZone: String)] = [
    ("GB", "United Kingdom", "GBP", "Europe/London"),
    ("US", "United States", "USD", "America/New_York"),
    ("TR", "Türkiye", "TRY", "Europe/Istanbul"),
    ("DE", "Germany", "EUR", "Europe/Berlin"),
    ("FR", "France", "EUR", "Europe/Paris"),
    ("IT", "Italy", "EUR", "Europe/Rome"),
    ("ES", "Spain", "EUR", "Europe/Madrid"),
    ("NL", "Netherlands", "EUR", "Europe/Amsterdam"),
    ("IE", "Ireland", "EUR", "Europe/Dublin"),
    ("PT", "Portugal", "EUR", "Europe/Lisbon"),
    ("AU", "Australia", "AUD", "Australia/Sydney"),
    ("CA", "Canada", "CAD", "America/Toronto"),
    ("CH", "Switzerland", "CHF", "Europe/Zurich"),
    ("AE", "United Arab Emirates", "AED", "Asia/Dubai"),
    ("JP", "Japan", "JPY", "Asia/Tokyo"),
    ("XX", "Somewhere else", "GBP", "UTC")
]

let onboardingCurrencies: [(code: String, label: String)] = [
    ("GBP", "GBP (£)"), ("USD", "USD ($)"), ("EUR", "EUR (€)"), ("TRY", "TRY (₺)"),
    ("JPY", "JPY (¥)"), ("AUD", "AUD (A$)"), ("CAD", "CAD (C$)"), ("CHF", "CHF"), ("AED", "AED")
]

let onboardingTimeZones: [String] = [
    "Europe/London", "Europe/Istanbul", "Europe/Berlin", "Europe/Paris", "Europe/Madrid",
    "Europe/Amsterdam", "Europe/Dublin", "Europe/Lisbon", "Europe/Rome", "Europe/Zurich",
    "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
    "America/Toronto", "Asia/Dubai", "Asia/Tokyo", "Australia/Sydney", "UTC"
]

// MARK: - Shared pieces
//
// Each control is its own small struct. The type checker gives up on a single
// `body` that builds four steps' worth of chips, radios and pickers inline.

private struct OnboardingChip: View {
    let title: String
    let isOn: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 13, weight: isOn ? .semibold : .regular))
                .padding(.horizontal, 13)
                .padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: 999, style: .continuous)
                        .fill(isOn ? Color.accentColor.opacity(0.16) : Color.gray.opacity(0.10))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 999, style: .continuous)
                        .stroke(isOn ? Color.accentColor : Color.gray.opacity(0.28), lineWidth: isOn ? 1.4 : 1)
                )
                .foregroundColor(isOn ? Color.accentColor : .primary)
        }
        .buttonStyle(.plain)
    }
}

private struct OnboardingOptionRow: View {
    let title: String
    let detail: String
    let isOn: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 11) {
                Image(systemName: isOn ? "largecircle.fill.circle" : "circle")
                    .font(.system(size: 16))
                    .foregroundColor(isOn ? Color.accentColor : Color.secondary.opacity(0.6))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.system(size: 13.5, weight: .semibold))
                    if !detail.isEmpty {
                        Text(detail).font(.system(size: 12)).foregroundColor(.secondary)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(11)
            .background(
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .fill(isOn ? Color.accentColor.opacity(0.08) : Color.gray.opacity(0.06))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .stroke(isOn ? Color.accentColor.opacity(0.55) : Color.gray.opacity(0.20), lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private struct OnboardingFlowChips<Item: Hashable>: View {
    let items: [Item]
    let title: (Item) -> String
    let isOn: (Item) -> Bool
    let toggle: (Item) -> Void

    var body: some View {
        // A simple wrapping row: LazyVGrid with adaptive columns keeps the chips
        // on one line where they fit and wraps where they don't.
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 8, alignment: .leading)], alignment: .leading, spacing: 8) {
            ForEach(items, id: \.self) { item in
                OnboardingChip(title: title(item), isOn: isOn(item)) { toggle(item) }
            }
        }
    }
}

private struct OnboardingHeader: View {
    let step: Int
    let total: Int
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text("\(step) / \(total)")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.secondary)
                .textCase(.uppercase)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.gray.opacity(0.18))
                    Capsule()
                        .fill(Color.accentColor)
                        .frame(width: geo.size.width * CGFloat(step) / CGFloat(total))
                }
            }
            .frame(height: 4)
            Text(title).font(.system(size: 22, weight: .bold))
            Text(subtitle).font(.system(size: 13)).foregroundColor(.secondary)
        }
    }
}

// MARK: - Steps

private struct OnboardingStepBasics: View {
    @Binding var answers: OnboardingAnswers
    let lang: String

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text(t("Country", lang: lang)).font(.system(size: 12, weight: .bold)).foregroundColor(.secondary)
                Picker("", selection: $answers.country) {
                    ForEach(onboardingCountries, id: \.code) { entry in
                        Text(t(entry.label, lang: lang)).tag(entry.code)
                    }
                }
                .labelsHidden()
                .pickerStyle(.menu)
                .onChange(of: answers.country) { newValue in
                    // Picking a country is the fastest honest guess at the other
                    // two; both stay editable right underneath.
                    guard let match = onboardingCountries.first(where: { $0.code == newValue }) else { return }
                    answers.currency = match.currency
                    answers.timeZone = match.timeZone
                }
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(t("Currency", lang: lang)).font(.system(size: 12, weight: .bold)).foregroundColor(.secondary)
                Picker("", selection: $answers.currency) {
                    ForEach(onboardingCurrencies, id: \.code) { entry in
                        Text(entry.label).tag(entry.code)
                    }
                }
                .labelsHidden()
                .pickerStyle(.menu)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(t("Time zone", lang: lang)).font(.system(size: 12, weight: .bold)).foregroundColor(.secondary)
                Picker("", selection: $answers.timeZone) {
                    ForEach(onboardingTimeZones, id: \.self) { zone in
                        Text(zone).tag(zone)
                    }
                }
                .labelsHidden()
                .pickerStyle(.menu)
            }
        }
    }
}

private struct OnboardingStepWork: View {
    @Binding var answers: OnboardingAnswers
    let lang: String

    private func toggleKind(_ kind: OnboardingWorkKind) {
        if let index = answers.workKinds.firstIndex(of: kind) {
            answers.workKinds.remove(at: index)
        } else {
            answers.workKinds.append(kind)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 8) {
                Text(t("What kind of work do you do?", lang: lang)).font(.system(size: 14, weight: .semibold))
                Text(t("Pick as many as apply.", lang: lang)).font(.system(size: 12)).foregroundColor(.secondary)
                OnboardingFlowChips(
                    items: OnboardingWorkKind.allCases,
                    title: { t($0.label, lang: lang) },
                    isOn: { answers.workKinds.contains($0) },
                    toggle: { toggleKind($0) }
                )
            }
            VStack(alignment: .leading, spacing: 8) {
                Text(t("How do you mainly work?", lang: lang)).font(.system(size: 14, weight: .semibold))
                ForEach(OnboardingWorkflow.allCases, id: \.self) { flow in
                    OnboardingOptionRow(
                        title: t(flow.label, lang: lang),
                        detail: t(flow.detail, lang: lang),
                        isOn: answers.workflow == flow
                    ) {
                        answers.workflow = flow
                    }
                }
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(t("How many people will use NivaDesk?", lang: lang)).font(.system(size: 13, weight: .semibold))
                Picker("", selection: $answers.teamSize) {
                    ForEach(OnboardingTeamSize.allCases, id: \.self) { size in
                        Text(t(size.label, lang: lang)).tag(size)
                    }
                }
                .labelsHidden()
                .pickerStyle(.menu)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(t("Roughly how many orders a month?", lang: lang)).font(.system(size: 13, weight: .semibold))
                Picker("", selection: $answers.volume) {
                    Text(t("Rather not say", lang: lang)).tag(OnboardingVolume?.none)
                    ForEach(OnboardingVolume.allCases, id: \.self) { volume in
                        Text(t(volume.label, lang: lang)).tag(OnboardingVolume?.some(volume))
                    }
                }
                .labelsHidden()
                .pickerStyle(.menu)
                Text(t("This helps us suggest the right setup. It won't affect your trial.", lang: lang))
                    .font(.system(size: 11)).foregroundColor(.secondary)
            }
        }
    }
}

private struct OnboardingStepGoal: View {
    @Binding var answers: OnboardingAnswers
    @Binding var showAllGoals: Bool
    let lang: String

    private var visibleGoals: [OnboardingGoal] {
        showAllGoals ? OnboardingGoal.allCases : OnboardingGoal.allCases.filter { $0.isPrimary }
    }

    private func toggleExtra(_ goal: OnboardingGoal) {
        if let index = answers.extraGoals.firstIndex(of: goal) {
            answers.extraGoals.remove(at: index)
        } else if answers.extraGoals.count < 2 {
            answers.extraGoals.append(goal)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(visibleGoals, id: \.self) { goal in
                OnboardingOptionRow(
                    title: t(goal.label, lang: lang),
                    detail: "",
                    isOn: answers.mainGoal == goal
                ) {
                    answers.mainGoal = goal
                    answers.extraGoals.removeAll { $0 == goal }
                }
            }
            if !showAllGoals {
                Button(t("Show more goals", lang: lang)) { showAllGoals = true }
                    .font(.system(size: 12, weight: .semibold))
                    .buttonStyle(.plain)
                    .foregroundColor(.accentColor)
            }
            if answers.mainGoal != nil {
                VStack(alignment: .leading, spacing: 8) {
                    Text(t("Anything else?", lang: lang)).font(.system(size: 13, weight: .semibold))
                    Text(t("Up to two more. Optional.", lang: lang)).font(.system(size: 11)).foregroundColor(.secondary)
                    OnboardingFlowChips(
                        items: OnboardingGoal.allCases.filter { $0 != answers.mainGoal },
                        title: { t($0.label, lang: lang) },
                        isOn: { answers.extraGoals.contains($0) },
                        toggle: { toggleExtra($0) }
                    )
                }
            }
        }
    }
}

private struct OnboardingConnectTile: View {
    let integration: OnboardingIntegration
    let lang: String
    let disabled: Bool
    let connect: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // The name set in the brand's own colour. No third-party logo files
            // are shipped: their guidelines want the real mark, unmodified, and
            // a hand-traced approximation is both worse and a trademark problem.
            Text(integration.name)
                .font(.system(size: 14, weight: .heavy))
                .foregroundColor(integration.colour)
            Text(t(integration.detail, lang: lang))
                .font(.system(size: 12))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Button(t("Connect", lang: lang)) { connect() }
                .buttonStyle(.bordered)
                .tint(integration.colour)
                .disabled(disabled)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.gray.opacity(0.06))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.gray.opacity(0.20), lineWidth: 1)
        )
    }
}

private struct OnboardingStepStart: View {
    @Binding var answers: OnboardingAnswers
    let lang: String
    let saving: Bool
    let onConnect: (OnboardingIntegration) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 8) {
                Text(t("Connect your accounts", lang: lang))
                    .font(.system(size: 14, weight: .semibold))
                Text(t("Optional. Connecting now means your workspace opens with your real work already in it.", lang: lang))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 210), spacing: 10, alignment: .top)],
                    alignment: .leading,
                    spacing: 10
                ) {
                    ForEach(onboardingIntegrations) { integration in
                        OnboardingConnectTile(
                            integration: integration,
                            lang: lang,
                            disabled: saving
                        ) {
                            onConnect(integration)
                        }
                    }
                }
                Text(t("Nothing is shared with them until you sign in on their side, and you can disconnect at any time.", lang: lang))
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text(t("Or start another way", lang: lang))
                    .font(.system(size: 14, weight: .semibold))
                ForEach(OnboardingStart.allCases, id: \.self) { option in
                    OnboardingOptionRow(
                        title: t(option.label, lang: lang),
                        detail: t(option.detail, lang: lang),
                        isOn: answers.start == option
                    ) {
                        answers.start = option
                    }
                }
            }
        }
    }
}

// MARK: - The wizard

struct OnboardingWizardView: View {
    let lang: String
    let saving: Bool
    let errorText: String
    let onFinish: (OnboardingAnswers) -> Void
    /// Saves what has been answered so far, then opens the integration. The
    /// answers have to be on disk before we navigate away, or a person who
    /// connects Shopify comes back to an empty workspace and the wizard again.
    let onConnect: (OnboardingAnswers, OnboardingIntegration) -> Void

    @State private var step: Int = 1
    @State private var answers = OnboardingAnswers()
    @State private var showAllGoals = false

    private let totalSteps = 4

    private var title: String {
        switch step {
        case 1: return t("Workspace basics", lang: lang)
        case 2: return t("Tell us about your work", lang: lang)
        case 3: return t("What should NivaDesk help with first?", lang: lang)
        default: return t("Bring your work in", lang: lang)
        }
    }

    private var subtitle: String {
        switch step {
        case 1: return t("We've suggested these from your location. You can change them now or later in Settings.", lang: lang)
        case 2: return t("This sets up your order cards, production stages and labels.", lang: lang)
        case 3: return t("Your answer decides what your dashboard and first tasks show.", lang: lang)
        default: return t("Pick how you'd like to start. You can do any of the others later.", lang: lang)
        }
    }

    private var canContinue: Bool {
        switch step {
        case 1: return !answers.country.isEmpty && !answers.currency.isEmpty
        case 2: return !answers.workKinds.isEmpty
        case 3: return answers.mainGoal != nil
        default: return answers.start != nil
        }
    }

    private var continueLabel: String {
        if saving { return t("Setting up…", lang: lang) }
        return step == totalSteps ? t("Open my workspace", lang: lang) : t("Continue", lang: lang)
    }

    @ViewBuilder
    private var stepBody: some View {
        switch step {
        case 1: OnboardingStepBasics(answers: $answers, lang: lang)
        case 2: OnboardingStepWork(answers: $answers, lang: lang)
        case 3: OnboardingStepGoal(answers: $answers, showAllGoals: $showAllGoals, lang: lang)
        default:
            OnboardingStepStart(answers: $answers, lang: lang, saving: saving) { integration in
                onConnect(answers, integration)
            }
        }
    }

    private func advance() {
        if step < totalSteps {
            step += 1
        } else {
            onFinish(answers)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                OnboardingHeader(step: step, total: totalSteps, title: title, subtitle: subtitle)
                stepBody
                if !errorText.isEmpty {
                    Text(errorText).font(.system(size: 12)).foregroundColor(.red)
                }
                Divider()
                HStack(spacing: 10) {
                    Text(t("You can change all of this later in Settings.", lang: lang))
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                    Spacer(minLength: 8)
                    // Back, never Skip: nobody should be able to walk past a
                    // question and leave the workspace guessing.
                    if step > 1 {
                        Button(t("Back", lang: lang)) { step -= 1 }
                            .buttonStyle(.bordered)
                            .disabled(saving)
                    }
                    Button { advance() } label: {
                        // Without this "Open my workspace" hyphenates into
                        // "Open my / work- / space" on a narrow iPhone footer.
                        Text(continueLabel)
                            .lineLimit(2)
                            .minimumScaleFactor(0.75)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(!canContinue || saving)
                }
            }
            .padding(26)
            .frame(maxWidth: 620, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Color.gray.opacity(0.06))
            )
            .padding(20)
            .frame(maxWidth: .infinity)
        }
    }
}

struct OnboardingReadyView: View {
    let answers: OnboardingAnswers
    let lang: String
    let onOpen: () -> Void

    /// One translated sentence with placeholders, not English fragments glued
    /// together — that word order does not survive Turkish, Japanese or Arabic.
    private var summary: String {
        let workflowLabel = t(answers.workflow.label, lang: lang)
        let rawKind = answers.workKinds.first?.label ?? ""
        // A repair shop that picked the repairs workflow would otherwise read
        // "a repairs and servicing workspace for repairs & servicing".
        let overlaps = !rawKind.isEmpty
            && rawKind.lowercased().hasPrefix(String(answers.workflow.label.lowercased().prefix(7)))
        if rawKind.isEmpty || overlaps {
            return t("We've set up your workspace for {workflow}.", lang: lang)
                .replacingOccurrences(of: "{workflow}", with: workflowLabel)
        }
        return t("We've set up your workspace for {workflow} - {kind}.", lang: lang)
            .replacingOccurrences(of: "{workflow}", with: workflowLabel)
            .replacingOccurrences(of: "{kind}", with: t(rawKind, lang: lang))
    }

    private var tasks: [String] {
        (answers.mainGoal ?? .ordersCustomers).startingTasks
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Text(t("Your workspace is ready", lang: lang)).font(.system(size: 24, weight: .bold))
                Text(summary).font(.system(size: 13)).foregroundColor(.secondary)
            }
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(tasks.enumerated()), id: \.offset) { index, task in
                    HStack(spacing: 10) {
                        Text("\(index + 1)")
                            .font(.system(size: 11, weight: .bold))
                            .frame(width: 20, height: 20)
                            .background(Circle().fill(Color.accentColor.opacity(0.14)))
                            .foregroundColor(.accentColor)
                        Text(t(task, lang: lang)).font(.system(size: 13.5))
                        Spacer(minLength: 0)
                    }
                }
            }
            Divider()
            HStack {
                Text(t("You can change all of this later in Settings.", lang: lang))
                    .font(.system(size: 11)).foregroundColor(.secondary)
                Spacer(minLength: 8)
                Button(t("Open my workspace", lang: lang)) { onOpen() }
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(26)
        .frame(maxWidth: 620, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.gray.opacity(0.06))
        )
        .padding(20)
    }
}
