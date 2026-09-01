import SwiftUI

/// The Apple half of studioflow-web/lib/studioflow/onboardingWizard.ts.
///
/// Five steps, asked in the order `onboardingStepOrder` lists them. Connecting a
/// store comes second, because someone who already has their work somewhere else
/// should be able to bring it in before answering questions about it.
///
/// The step about the work is six dropdowns in two columns. Every one of those
/// answers is a one-of-a-list, and a page of chips and radio cards spends a
/// screenful of scrolling saying so; a tidy grid of controls asks the same six
/// questions in a quarter of the height.
///
/// There is no Skip. Every step is answerable instead: "I'll set this up later"
/// is a real choice, not an escape hatch, so nobody is trapped and nobody is
/// nagged. Back moves between steps.

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

/// The plans the sign-up wizard may put a trial on. Mirrors the web list and
/// the server's TRIAL_SELECTABLE_PLANS.
enum OnboardingTrialPlan: String, CaseIterable {
    case starter = "lifetime_lite"
    case pro = "pro_monthly"
    case team = "team_monthly"

    var title: String {
        switch self {
        case .starter: return "NivaDesk Starter"
        case .pro: return "NivaDesk Pro"
        case .team: return "NivaDesk Team"
        }
    }

    var summary: String {
        switch self {
        case .starter: return "One person, the essentials."
        case .pro: return "One studio, everything in it."
        case .team: return "Shared work, roles and permissions."
        }
    }

    /// Amount only. The period is translated and joined at render — "£9 / month"
    /// is English, and this screen is read in twelve languages.
    var amount: String {
        switch self {
        case .starter: return "£9"
        case .pro: return "£19"
        case .team: return "£49"
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

/// Raw values are the ids the web wizard writes, and they have to stay
/// identical: the same workspace is read back by four platforms.
enum OnboardingBusinessAge: String, CaseIterable {
    case starting
    case underOneYear = "under_1"
    case oneToThreeYears = "1_3"
    case threeToTenYears = "3_10"
    case overTenYears = "over_10"

    var label: String {
        switch self {
        case .starting: return "Just starting out"
        case .underOneYear: return "Less than a year"
        case .oneToThreeYears: return "1–3 years"
        case .threeToTenYears: return "3–10 years"
        case .overTenYears: return "More than 10 years"
        }
    }
}

enum OnboardingInventoryExperience: String, CaseIterable {
    case noStock = "no_stock"
    // Not `case none`: an enum case of that name shadows `Optional.none` at
    // every use site, and this one is held in an Optional.
    case newToIt = "none"
    case someOfIt = "some"
    case confident

    var label: String {
        switch self {
        case .noStock: return "I don't hold stock"
        case .newToIt: return "New to it"
        case .someOfIt: return "I track some of it"
        case .confident: return "I track it closely"
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

/// The cases stay because saved workspaces already carry them; `offered` is what
/// the wizard actually shows. It showed all five, and not one of them did
/// anything — onboardingStartChoice is written by all three platforms and read
/// by none, so "Create my first order" created no order, "Explore a sample
/// workspace" had no sample data to explore, and "Import a spreadsheet" had no
/// importer to open. Four promises the product could not keep.
enum OnboardingStart: String, CaseIterable {
    case firstOrder = "first_order"
    case sample
    case spreadsheet
    case empty
    case later

    static let offered: [OnboardingStart] = [.later]

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
    /// The workspace's language, guessed from the device and changed right here.
    var language: String = studioLanguageForDeviceLocale()
    var timeZone: String = TimeZone.current.identifier
    /// Kept as a list because `businessType` reads the first entry and saved
    /// workspaces carry an array; the question itself is now one choice.
    var workKinds: [OnboardingWorkKind] = []
    var workflow: OnboardingWorkflow = .madeToOrder
    var teamSize: OnboardingTeamSize = .solo
    var volume: OnboardingVolume?
    var businessAge: OnboardingBusinessAge?
    var inventoryExperience: OnboardingInventoryExperience?
    /// Their own words. Not used to set anything up — asked because knowing what
    /// brought someone is the difference between guessing at marketing and
    /// measuring it, and a list of channels we thought of first would only ever
    /// collect the ones we thought of.
    var heardFrom: String = ""
    var mainGoal: OnboardingGoal?
    /// What they typed when the goal is "Something else". Their words, not ours.
    var otherGoal: String = ""
    var extraGoals: [OnboardingGoal] = []
    /// Pre-picked: it is the only row, and making someone tick the one choice
    /// there is before Next will let them through is a ritual, not a question.
    var start: OnboardingStart? = .later
    /// The plan the last step confirmed. nil until that step is reached.
    var plan: OnboardingTrialPlan?

    var businessType: String {
        workKinds.first?.businessType ?? "General Small Business"
    }

    /// What the answers imply, and what the last step shows as chosen. Same rule
    /// as the server's automaticTrialPlanFor: a workspace that says it has a
    /// team gets the plan that covers one, because trialling Pro would hide the
    /// very features they came for.
    var recommendedPlan: OnboardingTrialPlan {
        teamSize.seats > 1 ? .team : .pro
    }

    var chosenPlan: OnboardingTrialPlan { plan ?? recommendedPlan }

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
// `body` that builds five steps' worth of rows, fields and pickers inline.

private extension View {
    /// The card an option row is drawn on. Shared, because the "Something else"
    /// row cannot be a Button — it holds a text field — and a hand-copied
    /// approximation of the rows above it would drift the first time either is
    /// touched.
    func onboardingRowSurface(isOn: Bool) -> some View {
        padding(11)
            .background(
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .fill(isOn ? Color.accentColor.opacity(0.08) : Color.gray.opacity(0.06))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .stroke(isOn ? Color.accentColor.opacity(0.55) : Color.gray.opacity(0.20), lineWidth: 1)
            )
    }
}

private struct OnboardingRadio: View {
    let isOn: Bool

    var body: some View {
        Image(systemName: isOn ? "largecircle.fill.circle" : "circle")
            .font(.system(size: 16))
            .foregroundColor(isOn ? Color.accentColor : Color.secondary.opacity(0.6))
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
                OnboardingRadio(isOn: isOn)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.system(size: 13.5, weight: .semibold))
                    if !detail.isEmpty {
                        Text(detail).font(.system(size: 12)).foregroundColor(.secondary)
                    }
                }
                Spacer(minLength: 0)
            }
            .onboardingRowSurface(isOn: isOn)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// A short grey label above, the question itself inside the control.
///
/// With the whole question as the label the rows came out at different heights
/// — "How familiar are you with stock tracking?" wraps where "Team size" does
/// not — and a grid of controls that do not line up reads as untidy however
/// carefully it is spaced.
private struct OnboardingFieldLabel: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 12, weight: .bold))
            .foregroundColor(.secondary)
    }
}

/// A dropdown whose answer is required, so it opens already showing one.
private struct OnboardingPickerField<Value: Hashable>: View {
    let label: String
    let options: [Value]
    let title: (Value) -> String
    @Binding var selection: Value

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            OnboardingFieldLabel(text: label)
            Picker("", selection: $selection) {
                ForEach(options, id: \.self) { option in
                    Text(title(option)).tag(option)
                }
            }
            .labelsHidden()
            .pickerStyle(.menu)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// A dropdown that may go unanswered: the question sits in the empty row, so
/// the control says what it is asking before anything is picked.
private struct OnboardingOptionalPickerField<Value: Hashable>: View {
    let label: String
    let placeholder: String
    let options: [Value]
    let title: (Value) -> String
    @Binding var selection: Value?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            OnboardingFieldLabel(text: label)
            Picker("", selection: $selection) {
                Text(placeholder).tag(Value?.none)
                ForEach(options, id: \.self) { option in
                    Text(title(option)).tag(Value?.some(option))
                }
            }
            .labelsHidden()
            .pickerStyle(.menu)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct OnboardingTextEntryField: View {
    let label: String
    let placeholder: String
    /// What the server keeps. Clamped as it is typed rather than silently cut on
    /// save, so nobody writes a paragraph and loses the end of it.
    let limit: Int
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            OnboardingFieldLabel(text: label)
            TextField(placeholder, text: Binding(
                get: { text },
                set: { text = String($0.prefix(limit)) }
            ))
            .textFieldStyle(.roundedBorder)
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
    @AppStorage("seciliDil") private var seciliDil: String = "English"

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                OnboardingFieldLabel(text: t("Country", lang: lang))
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
                OnboardingFieldLabel(text: t("Currency", lang: lang))
                Picker("", selection: $answers.currency) {
                    ForEach(onboardingCurrencies, id: \.code) { entry in
                        Text(entry.label).tag(entry.code)
                    }
                }
                .labelsHidden()
                .pickerStyle(.menu)
            }
            VStack(alignment: .leading, spacing: 6) {
                // Picked here rather than hunted for in Settings afterwards, and
                // applied the moment it changes so the rest of the setup already
                // reads in it.
                OnboardingFieldLabel(text: t("Language", lang: lang))
                Picker("", selection: $answers.language) {
                    ForEach(studioSupportedLanguages, id: \.self) { name in
                        Text(name).tag(name)
                    }
                }
                .labelsHidden()
                .pickerStyle(.menu)
                .onChange(of: answers.language) { newValue in
                    seciliDil = newValue
                }
            }
            VStack(alignment: .leading, spacing: 6) {
                OnboardingFieldLabel(text: t("Time zone", lang: lang))
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

    /// One choice, stored as a list of one: `businessType` reads the first entry
    /// and the saved shape is read back by the other three platforms.
    private var workKind: Binding<OnboardingWorkKind?> {
        Binding(
            get: { answers.workKinds.first },
            set: { picked in answers.workKinds = picked.map { [$0] } ?? [] }
        )
    }

    var body: some View {
        // Two columns where there is room for them, one on a phone. Six controls
        // stacked full width is a page of scrolling to answer six one-word
        // questions.
        LazyVGrid(
            columns: [GridItem(.adaptive(minimum: 230), spacing: 14, alignment: .topLeading)],
            alignment: .leading,
            spacing: 14
        ) {
            OnboardingOptionalPickerField(
                label: t("What you make", lang: lang),
                placeholder: t("What do you mostly make?", lang: lang),
                options: OnboardingWorkKind.allCases,
                title: { t($0.label, lang: lang) },
                selection: workKind
            )
            OnboardingPickerField(
                label: t("How you work", lang: lang),
                options: OnboardingWorkflow.allCases,
                title: { t($0.label, lang: lang) },
                selection: $answers.workflow
            )
            OnboardingPickerField(
                label: t("Team size", lang: lang),
                options: OnboardingTeamSize.allCases,
                title: { t($0.label, lang: lang) },
                selection: $answers.teamSize
            )
            OnboardingOptionalPickerField(
                label: t("Monthly orders", lang: lang),
                placeholder: t("How many a month?", lang: lang),
                options: OnboardingVolume.allCases,
                title: { t($0.label, lang: lang) },
                selection: $answers.volume
            )
            OnboardingOptionalPickerField(
                label: t("Business age", lang: lang),
                placeholder: t("How long in business?", lang: lang),
                options: OnboardingBusinessAge.allCases,
                title: { t($0.label, lang: lang) },
                selection: $answers.businessAge
            )
            OnboardingOptionalPickerField(
                label: t("Stock tracking", lang: lang),
                placeholder: t("How well do you track it?", lang: lang),
                options: OnboardingInventoryExperience.allCases,
                title: { t($0.label, lang: lang) },
                selection: $answers.inventoryExperience
            )
            // Typed, not chosen: a list of the channels we thought of first only
            // ever collects the channels we thought of first.
            OnboardingTextEntryField(
                label: t("How did you find us?", lang: lang),
                placeholder: t("A search, a friend, an advert…", lang: lang),
                limit: 200,
                text: $answers.heardFrom
            )
            Text(t("This helps us suggest the right setup. It won't affect your trial.", lang: lang))
                .font(.system(size: 11))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// The last row, and the only one that takes their own words.
///
/// The field is INSIDE the row: a box that appears underneath would push the
/// rest of the list down the moment the row is picked. A TextField cannot live
/// in a Button's label — the button swallows the taps — so the row draws its own
/// radio and card, and only the heading is tappable.
private struct OnboardingOwnGoalRow: View {
    let title: String
    let placeholder: String
    let isOn: Bool
    @Binding var text: String
    let select: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Button(action: select) {
                HStack(alignment: .top, spacing: 11) {
                    OnboardingRadio(isOn: isOn)
                    Text(title).font(.system(size: 13.5, weight: .semibold))
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if isOn {
                TextField(placeholder, text: Binding(
                    get: { text },
                    set: { text = String($0.prefix(200)) }
                ))
                .textFieldStyle(.roundedBorder)
                .padding(.leading, 27)
            }
        }
        .onboardingRowSurface(isOn: isOn)
    }
}

private struct OnboardingStepGoal: View {
    @Binding var answers: OnboardingAnswers
    let lang: String

    /// One question, one list, one answer.
    ///
    /// Picking a goal used to open a second question underneath it — "Anything
    /// else?", with a row of chips — so the screen grew a new section the moment
    /// you touched it, and what it collected was never read by the preset
    /// engine. All ten are listed now, and the wall of choices "Show more goals"
    /// was hiding turns out to be four extra rows.
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(OnboardingGoal.allCases, id: \.self) { goal in
                if goal == .other {
                    OnboardingOwnGoalRow(
                        title: t(goal.label, lang: lang),
                        placeholder: t("In your own words", lang: lang),
                        isOn: answers.mainGoal == goal,
                        text: $answers.otherGoal
                    ) {
                        answers.mainGoal = goal
                    }
                } else {
                    OnboardingOptionRow(
                        title: t(goal.label, lang: lang),
                        detail: "",
                        isOn: answers.mainGoal == goal
                    ) {
                        answers.mainGoal = goal
                    }
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


/// The last step: the plan the answers imply, and the two alternatives.
///
/// The trial already started at sign-up on Pro — sign-up cannot know the team
/// size, the questions come after — so this step confirms which plan the
/// fortnight should be spent on. Choosing here never changes when it ends.
private struct OnboardingStepPlan: View {
    @Binding var answers: OnboardingAnswers
    let lang: String

    /// Written in the workspace language, not the device locale: the rest of the
    /// card is translated and a English month name beside it reads as a bug.
    private var trialEndsLabel: String {
        let ends = Date().addingTimeInterval(14 * 24 * 60 * 60)
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: localeIdentifier(forLanguage: lang))
        formatter.setLocalizedDateFormatFromTemplate("d MMMM")
        return formatter.string(from: ends)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(OnboardingTrialPlan.allCases, id: \.self) { plan in
                let selected = answers.chosenPlan == plan
                Button {
                    answers.plan = plan
                } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                            .foregroundColor(selected ? .accentColor : .secondary)
                            .font(.system(size: 15))
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 8) {
                                Text(t(plan.title, lang: lang))
                                    .font(.system(size: 15, weight: .bold))
                                if plan == answers.recommendedPlan {
                                    Text(t("Recommended for your answers", lang: lang))
                                        .font(.system(size: 10.5, weight: .bold))
                                        .padding(.horizontal, 8).padding(.vertical, 3)
                                        .background(Color.accentColor.opacity(0.14))
                                        .foregroundColor(.accentColor)
                                        .clipShape(Capsule())
                                }
                            }
                            Text(t(plan.summary, lang: lang))
                                .font(.system(size: 12.5)).foregroundColor(.secondary)
                            // One sentence, not three fragments: the free period,
                            // the date it ends and the price after it are one
                            // thought, and splitting them breaks word order in
                            // half the languages we ship.
                            Text(t("Free until {date}, then {price}.", lang: lang)
                                .replacingOccurrences(of: "{date}", with: trialEndsLabel)
                                .replacingOccurrences(of: "{price}", with: "\(plan.amount) / \(t("month", lang: lang))"))
                                .font(.system(size: 12.5, weight: .semibold))
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 15).padding(.vertical, 13)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 13)
                            .strokeBorder(selected ? Color.accentColor : Color.secondary.opacity(0.25),
                                          lineWidth: selected ? 1.8 : 1.2)
                    )
                }
                .buttonStyle(.plain)
            }
            Text(t("We picked this from your answers — you told us how many people work with you and what you need first. Change it here, or later in Settings; nothing is charged today.", lang: lang))
                .font(.system(size: 12)).foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
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
                ForEach(OnboardingStart.offered, id: \.self) { option in
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

/// The order the five steps are asked in.
///
/// They used to be numbers, checked as `case 4` in four separate switches, so
/// moving one meant editing every one of them and hoping none was missed. The
/// step is named now and the order lives here: to reorder the wizard, reorder
/// this list.
enum OnboardingStepKey: String, CaseIterable {
    case basics
    case bringWork
    case goal
    case work
    case plan
}

let onboardingStepOrder: [OnboardingStepKey] = [.basics, .bringWork, .goal, .work, .plan]

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

    private var totalSteps: Int { onboardingStepOrder.count }

    private var stepKey: OnboardingStepKey {
        onboardingStepOrder[min(max(step, 1), totalSteps) - 1]
    }

    private var title: String {
        switch stepKey {
        case .basics: return t("Workspace basics", lang: lang)
        case .bringWork: return t("Bring your work in", lang: lang)
        case .goal: return t("What should NivaDesk help with first?", lang: lang)
        case .work: return t("Tell us about your work", lang: lang)
        case .plan: return t("Your plan", lang: lang)
        }
    }

    private var subtitle: String {
        switch stepKey {
        case .basics: return t("We've suggested these from your location. You can change them now or later in Settings.", lang: lang)
        case .bringWork: return t("Pick how you'd like to start. You can do any of the others later.", lang: lang)
        case .goal: return t("Your answer decides what your dashboard and first tasks show.", lang: lang)
        case .work: return t("This sets up your order cards, production stages and labels.", lang: lang)
        case .plan: return t("Your 14 days are free on any of these. Nothing is charged until they end, and you can change plan at any time.", lang: lang)
        }
    }

    private var canContinue: Bool {
        switch stepKey {
        case .basics: return !answers.country.isEmpty && !answers.currency.isEmpty
        case .bringWork: return answers.start != nil
        case .goal: return answers.mainGoal != nil
        case .work: return !answers.workKinds.isEmpty
        // The plan step arrives with a recommendation already chosen.
        case .plan: return true
        }
    }

    private var continueLabel: String {
        if saving { return t("Setting up…", lang: lang) }
        return step == totalSteps ? t("Open my workspace", lang: lang) : t("Continue", lang: lang)
    }

    @ViewBuilder
    private var stepBody: some View {
        switch stepKey {
        case .basics: OnboardingStepBasics(answers: $answers, lang: lang)
        case .bringWork:
            OnboardingStepStart(answers: $answers, lang: lang, saving: saving) { integration in
                onConnect(answers, integration)
            }
        case .goal: OnboardingStepGoal(answers: $answers, lang: lang)
        case .work: OnboardingStepWork(answers: $answers, lang: lang)
        case .plan: OnboardingStepPlan(answers: $answers, lang: lang)
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
