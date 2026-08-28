import SwiftUI
import Combine
import FirebaseFirestore
import PhotosUI
import UniformTypeIdentifiers

// Banking — native counterpart of nivadesk.app/bank. Same five sections
// (Overview / Transactions / Recurring / Receipts / Rules), the same heuristics
// (BankInsights.swift) and the same Cloud Functions for every write
// (BankFeedActions.swift). Layout follows the platform: segmented tabs and a
// side inspector on Mac/iPad, chip tabs and sheets on iPhone. Sub-views are
// separate structs on purpose — deeply nested SwiftUI bodies overflow the
// stack on real iPhones.

extension Notification.Name {
    /// Cross-screen link: asks ContentView to switch the app to the Inventory
    /// tab (same notification-routing pattern as studioOrderRouteRequested).
    static let studioInventoryRouteRequested = Notification.Name("studioInventoryRouteRequested")
}

// MARK: - Models

/// One line of a split spending payment: the server guarantees the amounts
/// sum exactly to the transaction and that every line has a category.
struct StudioBankSplitLine: Equatable {
    let amount: Double
    let category: String
    let vatCode: String
    let note: String
    let orderId: String
    let orderLabel: String

    init(_ raw: [String: Any]) {
        amount = (raw["amount"] as? NSNumber)?.doubleValue ?? 0
        category = (raw["category"] as? String) ?? ""
        vatCode = ((raw["vatCode"] as? String) ?? "").uppercased()
        note = (raw["note"] as? String) ?? ""
        orderId = (raw["orderId"] as? String) ?? ""
        orderLabel = (raw["orderLabel"] as? String) ?? ""
    }
}

struct StudioBankTransaction: Identifiable, Equatable {
    let id: String
    let amount: Double
    let currency: String
    let bookingDate: String   // "YYYY-MM-DD"
    let description: String
    let counterparty: String
    let category: String
    let categoryAuto: String
    /// Keyword of the rule that auto-applied the category — the audit trail
    /// behind `categoryAuto` (longest-keyword rule wins server-side).
    let categoryAutoRule: String
    let txType: String
    let status: String
    let hasReceipt: Bool
    let receiptPath: String
    let receiptName: String
    let receiptNotNeeded: Bool
    let linkedOrderId: String
    let linkedOrderLabel: String
    /// Incoming side of the ledger: what the money actually was, and — for
    /// order payments — which existing payment entry it was matched to.
    let incomingKind: String
    let linkedPaymentId: String
    /// Set when the receipt references a central Files-library record
    /// instead of a copied upload.
    let receiptFileRecordId: String
    /// A spending payment divided into several category/order lines.
    let splits: [StudioBankSplitLine]
    let vatCode: String
    let vatCodeAuto: String
    let note: String
    let reviewStatus: String
    let pandleStatus: String
    let pandleBankTransactionId: String
    let pandleLastError: String
    /// Set when this payment has been matched to a purchase, so a row can show
    /// what it actually bought and the matcher can skip rows already spoken for.
    let purchaseId: String
    let purchaseNumber: String
    // Permanent identities + the read-only bank layer shown in the detail panel.
    let accountId: String
    let provider: String
    let providerTransactionId: String
    let providerReference: String
    let firstImportedAt: Date?
    let importedAt: Date?

    init(id: String, data: [String: Any]) {
        self.id = id
        amount = (data["amount"] as? NSNumber)?.doubleValue ?? 0
        currency = (data["currency"] as? String) ?? "GBP"
        bookingDate = String(((data["bookingDate"] as? String) ?? "").prefix(10))
        description = (data["description"] as? String) ?? ""
        counterparty = (data["counterparty"] as? String) ?? ""
        category = (data["category"] as? String) ?? ""
        categoryAuto = (data["categoryAuto"] as? String) ?? ""
        categoryAutoRule = (data["categoryAutoRule"] as? String) ?? ""
        txType = ((data["txType"] as? String) ?? "").uppercased()
        status = (data["status"] as? String) ?? "booked"
        receiptPath = (data["receiptPath"] as? String) ?? ""
        hasReceipt = !receiptPath.isEmpty
        receiptName = (data["receiptName"] as? String) ?? ""
        receiptNotNeeded = (data["receiptNotNeeded"] as? Bool) ?? false
        linkedOrderId = (data["linkedOrderId"] as? String) ?? ""
        linkedOrderLabel = (data["linkedOrderLabel"] as? String) ?? ""
        incomingKind = (data["incomingKind"] as? String) ?? ""
        linkedPaymentId = (data["linkedPaymentId"] as? String) ?? ""
        receiptFileRecordId = (data["receiptFileRecordId"] as? String) ?? ""
        splits = (data["splits"] as? [[String: Any]] ?? []).map(StudioBankSplitLine.init)
        vatCode = ((data["vatCode"] as? String) ?? "").uppercased()
        vatCodeAuto = ((data["vatCodeAuto"] as? String) ?? "").uppercased()
        note = (data["note"] as? String) ?? ""
        reviewStatus = (data["reviewStatus"] as? String) ?? ""
        let pandle = data["pandle"] as? [String: Any]
        pandleStatus = (pandle?["status"] as? String) ?? ""
        pandleBankTransactionId = (pandle?["bankTransactionId"] as? String) ?? ""
        pandleLastError = (pandle?["lastError"] as? String) ?? ""
        purchaseId = (data["purchaseId"] as? String) ?? ""
        purchaseNumber = (data["purchaseNumber"] as? String) ?? ""
        accountId = (data["accountId"] as? String) ?? ""
        provider = (data["provider"] as? String) ?? ""
        providerTransactionId = (data["providerTransactionId"] as? String) ?? ""
        providerReference = (data["providerReference"] as? String) ?? ""
        firstImportedAt = (data["firstImportedAt"] as? Timestamp)?.dateValue()
        importedAt = (data["importedAt"] as? Timestamp)?.dateValue()
    }

    var effectiveCategory: String { category.isEmpty ? categoryAuto : category }
    var merchant: String { counterparty.isEmpty ? description : counterparty }
    var year: Int { Int(bookingDate.prefix(4)) ?? 0 }
    var month: Int { Int(bookingDate.dropFirst(5).prefix(2)) ?? 0 }
    var isSpending: Bool { amount < 0 }
    var pandleConfirmed: Bool { pandleStatus == "confirmed" }
    /// The field is enrichment; a confirmed Pandle push implies "confirmed"
    /// even on rows saved before review statuses existed (mirror of the web).
    var effectiveReviewStatus: String {
        if !reviewStatus.isEmpty { return reviewStatus }
        return pandleStatus == "confirmed" ? "confirmed" : "unreviewed"
    }
}

struct StudioBankAccountInfo: Equatable {
    let id: String
    let name: String
    let currency: String
}

struct StudioBankConnection: Identifiable, Equatable {
    let id: String
    let providerName: String
    let providerLogo: String
    let status: String
    let accounts: [StudioBankAccountInfo]
    let lastSyncedAt: Date?
    /// Server-written consent health: "ok", "needs_reconsent", "error" or "disconnected".
    let syncState: String
    /// When the 90-day Open Banking consent lapses (server-written at link time).
    let consentExpiresAt: Date?

    init(id: String, data: [String: Any]) {
        self.id = id
        providerName = (data["providerName"] as? String) ?? ""
        providerLogo = (data["providerLogo"] as? String) ?? ""
        status = (data["status"] as? String) ?? ""
        accounts = ((data["accounts"] as? [[String: Any]]) ?? []).map {
            StudioBankAccountInfo(id: ($0["id"] as? String) ?? "", name: ($0["name"] as? String) ?? "", currency: ($0["currency"] as? String) ?? "")
        }
        lastSyncedAt = (data["lastSyncedAt"] as? Timestamp)?.dateValue()
        syncState = (data["syncState"] as? String) ?? "ok"
        consentExpiresAt = (data["consentExpiresAt"] as? Timestamp)?.dateValue()
    }

    var accountCount: Int { accounts.count }

    var isLinked: Bool { status == "linked" }
    /// Consent revoked on purpose — the connection stays with all its imported
    /// data KEPT, and can be reconnected or purged from here.
    var isDisconnected: Bool { status == "disconnected" }
    var needsReconnect: Bool { isLinked && syncState == "needs_reconsent" }
    var isSyncFailing: Bool { isLinked && syncState != "ok" }
    /// Whole days until the consent lapses (ceil, mirror of the web).
    var consentDaysLeft: Int? {
        guard let consentExpiresAt else { return nil }
        return Int(ceil(consentExpiresAt.timeIntervalSinceNow / 86_400))
    }
}

// TrueLayer transaction_category → short badge (mirrors the web TX_TYPE_META).
func bankTxTypeMeta(_ type: String) -> (label: String, color: Color, translate: Bool)? {
    switch type {
    case "PURCHASE", "POS": return ("Card", .blue, true)
    case "DIRECT_DEBIT": return ("DD", .purple, false)
    case "STANDING_ORDER": return ("SO", .green, false)
    case "TRANSFER": return ("Transfer", .teal, true)
    case "BILL_PAYMENT": return ("Bill", .orange, true)
    case "ATM": return ("ATM", .pink, false)
    case "CASH": return ("Cash", .pink, true)
    case "FEE_CHARGE": return ("Fee", .red, true)
    case "INTEREST": return ("Interest", .green, true)
    case "CREDIT": return ("Incoming", .green, true)
    case "DEBIT": return ("Payment", .gray, true)
    default: return nil
    }
}

private let bankCategoryPalette: [Color] = [.blue, .green, .orange, .purple, .pink, .teal, .red, .mint, .indigo, .cyan, .brown, .gray]
func bankCategoryColor(_ name: String) -> Color {
    var hash: UInt32 = 0
    for scalar in name.unicodeScalars { hash = hash &* 31 &+ scalar.value }
    return bankCategoryPalette[Int(hash % UInt32(bankCategoryPalette.count))]
}
let bankUncategorisedColor = Color(red: 0.36, green: 0.43, blue: 0.91)

/// Review status chip/dot colours — the same hexes the web table uses.
func bankReviewStatusColor(_ code: String) -> Color {
    switch code {
    case "needs_info": return Color(red: 0.71, green: 0.33, blue: 0.04)   // #b45309
    case "ready": return Color(red: 0.15, green: 0.39, blue: 0.92)        // #2563eb
    case "synced": return Color(red: 0.05, green: 0.48, blue: 0.33)       // #0e7a55
    case "confirmed": return Color(red: 0.09, green: 0.64, blue: 0.29)    // #16a34a
    case "sync_error": return Color(red: 0.86, green: 0.15, blue: 0.15)   // #dc2626
    case "ignored": return Color(red: 0.61, green: 0.64, blue: 0.69)      // #9ca3af
    default: return Color(red: 0.42, green: 0.45, blue: 0.50)             // #6b7280 (unreviewed)
    }
}

/// Effective VAT treatment of a spending row: the explicit code, else the
/// rule's auto code, else the category default (mirror of the web's effectiveVat).
func bankEffectiveVat(_ tx: StudioBankTransaction, categoryTax: [String: String]) -> String {
    if !tx.vatCode.isEmpty { return tx.vatCode }
    if !tx.vatCodeAuto.isEmpty { return tx.vatCodeAuto }
    return categoryTax[tx.effectiveCategory] ?? ""
}

/// Amber used for "act soon" states — the web's #b45309.
let bankAmberColor = Color(red: 0.71, green: 0.33, blue: 0.04)

func bankCurrencySymbol(_ code: String) -> String {
    switch code.uppercased() {
    case "GBP": return "£"
    case "EUR": return "€"
    case "USD": return "$"
    case "TRY": return "₺"
    case "JPY": return "¥"
    default: return code.isEmpty ? "£" : "\(code) "
    }
}

// MARK: - Screen state

enum BankTab: String, CaseIterable, Identifiable {
    case overview, transactions, recurring, receipts, rules
    var id: String { rawValue }
    var title: String {
        switch self {
        case .overview: return "Overview"
        case .transactions: return "Transactions"
        case .recurring: return "Recurring"
        case .receipts: return "Receipts"
        case .rules: return "Rules"
        }
    }
    var icon: String {
        switch self {
        case .overview: return "chart.pie"
        case .transactions: return "list.bullet.rectangle"
        case .recurring: return "arrow.triangle.2.circlepath"
        case .receipts: return "doc.text"
        case .rules: return "wand.and.stars"
        }
    }
}

enum BankPeriodMode: String { case week, month, year }
enum BankTxFlow: String { case all, out, `in` }
enum BankTxAttention: String { case none, any, uncategorised, noReceipt, duplicate }
enum BankReceiptFilter: String { case all, missing, matched }

/// Result of an OCR upload awaiting the owner's decision.
struct BankOcrState: Equatable {
    let inboxPath: String
    let fileName: String
    let amount: Double
    let date: String
    let candidates: [BankReceiptCandidate]
}

@MainActor
final class BankScreenModel: ObservableObject {
    @Published var tab: BankTab = .overview
    @Published var period: BankPeriodMode = .month
    @Published var selectedYear: Int = Calendar.current.component(.year, from: Date())
    @Published var selectedMonth: Int = Calendar.current.component(.month, from: Date())
    @Published var weekStart: Date = BankScreenModel.startOfWeek(Date())
    @Published var txFlow: BankTxFlow = .all
    @Published var txAttention: BankTxAttention = .none
    /// Accounting-review pile applied to the transactions list: a review
    /// status code, "missing_receipt" or "missing_vat" ("" = off). Mirrors
    /// the web's txReview filter.
    @Published var txReview: String = ""
    @Published var txSearch: String = ""
    @Published var page: Int = 1
    @Published var selectedTxId: String?
    @Published var receiptFilter: BankReceiptFilter = .all
    @Published var ocr: BankOcrState?
    @Published var assignWaitingId: String?
    @Published var ruleSearch: String = ""
    @Published var previewRuleId: String?
    @Published var showNewRule = false
    @Published var newRuleKeyword = ""
    @Published var newRuleCategory = ""
    @Published var busy: String?
    @Published var status: String?
    @Published var error: String?
    /// Which transaction a picked file should attach to ("" = OCR match flow).
    @Published var pendingAttachTxId: String?

    weak var manager: FirebaseManager?

    static func startOfWeek(_ date: Date) -> Date {
        var calendar = Calendar(identifier: .iso8601); calendar.firstWeekday = 2
        let components = calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: date)
        return calendar.date(from: components) ?? date
    }

    /// Runs an owner action, keeping the busy/status/error strip honest.
    func run(_ key: String, _ work: @escaping () async throws -> String?) {
        busy = key; error = nil
        Task { [weak self] in
            do {
                let message = try await work()
                await MainActor.run { self?.status = message; self?.busy = nil }
            } catch {
                await MainActor.run { self?.error = error.localizedDescription; self?.busy = nil }
            }
        }
    }

    func stepPeriod(_ delta: Int, now: Date = Date()) {
        let calendar = Calendar.current
        switch period {
        case .year:
            let next = selectedYear + delta
            if next <= calendar.component(.year, from: now) { selectedYear = next }
        case .week:
            let next = calendar.date(byAdding: .day, value: delta * 7, to: weekStart) ?? weekStart
            if next <= now { weekStart = next }
        case .month:
            var components = DateComponents(); components.year = selectedYear; components.month = selectedMonth + delta; components.day = 1
            guard let next = calendar.date(from: components), next <= now else { return }
            selectedYear = calendar.component(.year, from: next); selectedMonth = calendar.component(.month, from: next)
        }
        page = 1
    }

    func showAttention(_ queue: BankTxAttention) {
        txAttention = queue; txFlow = .out; tab = .transactions; page = 1
    }

    /// One tap on an "Accounting review" pile — jump to the transactions list
    /// filtered to that pile (mirror of the web's openPile).
    func showReviewPile(_ filter: String) {
        txReview = filter; txAttention = .none; tab = .transactions; page = 1
    }
}

// MARK: - Derived data (computed once per render, handed to the sections)

struct BankDerived {
    let all: [StudioBankTransaction]
    let visible: [StudioBankTransaction]          // in the selected period
    let previousSpent: Double
    let spentTotal: Double
    let incomingTotal: Double
    let incomingCount: Int
    let currency: String
    let recurring: [BankRecurringSpend]
    let duplicateIds: Set<String>
    let categoryRows: [(name: String, amount: Double, share: Double)]
    let categoryTotal: Double
    let suggestions: [String: BankCategorySuggestion]
    let orderSuggestions: [String: BankOrderLinkSuggestion]
    let ruleStats: [String: (count: Int, total: Double, lastDate: String, txType: String)]
    let suggestedRules: [(keyword: String, merchant: String, category: String, count: Int, total: Double)]
    let upcoming: [BankRecurringSpend]
    let autoApplied: Int
    let periodLabel: String
    let isCurrentPeriod: Bool

    var activeRecurring: [BankRecurringSpend] { recurring.filter(\.active) }
    var cancelledRecurring: [BankRecurringSpend] { recurring.filter { !$0.active } }
    var recurringMonthly: Double { activeRecurring.reduce(0) { $0 + $1.monthlyEquivalent } }
    var recurringKeys: Set<String> { Set(recurring.map(\.key)) }

    var spending: [StudioBankTransaction] { visible.filter(\.isSpending) }
    var uncategorised: [StudioBankTransaction] { spending.filter { $0.effectiveCategory.isEmpty } }
    var missingReceipt: [StudioBankTransaction] { spending.filter { !$0.hasReceipt && !$0.receiptNotNeeded } }
    var matchedReceipts: Int { spending.filter(\.hasReceipt).count }
    var notNeededReceipts: Int { spending.filter { !$0.hasReceipt && $0.receiptNotNeeded }.count }
    var priceChanged: Int { recurring.filter { $0.active && $0.priceChange != nil }.count }

    func attentionTotal(waiting: Int, brokenConnections: Int) -> Int {
        uncategorised.count + missingReceipt.count + duplicateIds.count + priceChanged + cancelledRecurring.count + waiting + brokenConnections
    }

    static func make(transactions: [StudioBankTransaction], rules: [StudioBankRule], vendors: [StudioBankVendor], orders: [Siparis], model: BankScreenModel, lang: String) -> BankDerived {
        let calendar = Calendar.current
        let now = Date()
        let iso = DateFormatter(); iso.dateFormat = "yyyy-MM-dd"; iso.locale = Locale(identifier: "en_US_POSIX")
        let inRange: (String) -> Bool
        let inPrevious: (String) -> Bool
        let label: String
        let current: Bool
        switch model.period {
        case .year:
            inRange = { Int($0.prefix(4)) == model.selectedYear }
            inPrevious = { Int($0.prefix(4)) == model.selectedYear - 1 }
            label = String(model.selectedYear)
            current = model.selectedYear == calendar.component(.year, from: now)
        case .month:
            let prefix = String(format: "%04d-%02d", model.selectedYear, model.selectedMonth)
            let prevYear = model.selectedMonth == 1 ? model.selectedYear - 1 : model.selectedYear
            let prevMonth = model.selectedMonth == 1 ? 12 : model.selectedMonth - 1
            let prevPrefix = String(format: "%04d-%02d", prevYear, prevMonth)
            inRange = { $0.hasPrefix(prefix) }
            inPrevious = { $0.hasPrefix(prevPrefix) }
            let formatter = DateFormatter(); formatter.locale = studioLocale(lang); formatter.setLocalizedDateFormatFromTemplate("MMMM yyyy")
            var components = DateComponents(); components.year = model.selectedYear; components.month = model.selectedMonth; components.day = 1
            label = calendar.date(from: components).map { formatter.string(from: $0) } ?? prefix
            current = model.selectedYear == calendar.component(.year, from: now) && model.selectedMonth == calendar.component(.month, from: now)
        case .week:
            let start = iso.string(from: model.weekStart)
            let end = iso.string(from: calendar.date(byAdding: .day, value: 6, to: model.weekStart) ?? model.weekStart)
            let prevStart = iso.string(from: calendar.date(byAdding: .day, value: -7, to: model.weekStart) ?? model.weekStart)
            let prevEnd = iso.string(from: calendar.date(byAdding: .day, value: -1, to: model.weekStart) ?? model.weekStart)
            inRange = { $0 >= start && $0 <= end }
            inPrevious = { $0 >= prevStart && $0 <= prevEnd }
            let formatter = DateFormatter(); formatter.locale = studioLocale(lang); formatter.setLocalizedDateFormatFromTemplate("d MMM")
            label = "\(formatter.string(from: model.weekStart)) – \(formatter.string(from: calendar.date(byAdding: .day, value: 6, to: model.weekStart) ?? model.weekStart))"
            current = BankScreenModel.startOfWeek(now) == model.weekStart
        }

        let visible = transactions.filter { inRange($0.bookingDate) }
        let previous = transactions.filter { inPrevious($0.bookingDate) && $0.amount < 0 }.reduce(0) { $0 + abs($1.amount) }
        let spent = visible.filter(\.isSpending).reduce(0) { $0 + abs($1.amount) }
        // Transfers between own accounts, owner contributions and loans are
        // money in, but not revenue — once marked, they leave the Incoming
        // total (the count keeps showing every credit, mirror of the web).
        let incoming = visible.filter { $0.amount > 0 && !bankNonRevenueIncomingKinds.contains($0.incomingKind) }.reduce(0) { $0 + $1.amount }
        let recurring = bankDetectRecurring(transactions, vendors: vendors)
        let duplicates = bankDetectDuplicates(visible)

        var byCategory: [String: Double] = [:]
        for tx in visible where tx.isSpending {
            byCategory[tx.effectiveCategory.isEmpty ? "__uncategorized__" : tx.effectiveCategory, default: 0] += abs(tx.amount)
        }
        let rows = byCategory.map { (name: $0.key, amount: $0.value, share: spent > 0 ? $0.value / spent * 100 : 0) }.sorted { $0.amount > $1.amount }

        var suggestions: [String: BankCategorySuggestion] = [:]
        var orderSuggestions: [String: BankOrderLinkSuggestion] = [:]
        for tx in visible where tx.isSpending {
            if tx.effectiveCategory.isEmpty, let suggestion = bankSuggestCategory(tx, history: transactions) { suggestions[tx.id] = suggestion }
            if tx.linkedOrderId.isEmpty, let link = bankSuggestOrderLink(for: tx, orders: orders) { orderSuggestions[tx.id] = link }
        }

        var ruleStats: [String: (count: Int, total: Double, lastDate: String, txType: String)] = [:]
        for rule in rules {
            var count = 0, total = 0.0, last = "", types: [String: Int] = [:]
            for tx in transactions where tx.isSpending && "\(tx.counterparty) \(tx.description)".lowercased().contains(rule.keyword) {
                count += 1; total += abs(tx.amount); if tx.bookingDate > last { last = tx.bookingDate }
                types[tx.txType, default: 0] += 1
            }
            ruleStats[rule.id] = (count, total, last, types.max { $0.value < $1.value }?.key ?? "")
        }

        var byKeyword: [String: (keyword: String, merchant: String, category: String, count: Int, total: Double)] = [:]
        for tx in transactions where tx.isSpending {
            let keyword = bankSuggestRuleKeyword(tx).lowercased()
            guard keyword.count >= 3, !rules.contains(where: { $0.keyword == keyword || keyword.contains($0.keyword) }) else { continue }
            let category = tx.category.isEmpty ? (bankSuggestCategory(tx, history: transactions)?.category ?? "") : tx.category
            guard !category.isEmpty else { continue }
            var entry = byKeyword[keyword] ?? (keyword, tx.merchant, category, 0, 0)
            guard entry.category == category else { continue }
            entry.count += 1; entry.total += abs(tx.amount)
            byKeyword[keyword] = entry
        }
        let suggestedRules = byKeyword.values.filter { $0.count >= 2 }.sorted { $0.count > $1.count }.prefix(8).map { $0 }

        let today = iso.string(from: now)
        let horizon = iso.string(from: calendar.date(byAdding: .day, value: 30, to: now) ?? now)
        let upcoming = recurring.filter { $0.active && $0.nextExpected >= today && $0.nextExpected <= horizon }.sorted { $0.nextExpected < $1.nextExpected }
        let autoApplied = visible.filter { $0.isSpending && $0.category.isEmpty && !$0.categoryAuto.isEmpty }.count

        return BankDerived(all: transactions, visible: visible, previousSpent: previous, spentTotal: spent, incomingTotal: incoming,
                           incomingCount: visible.filter { $0.amount > 0 }.count, currency: transactions.first?.currency ?? "GBP",
                           recurring: recurring, duplicateIds: duplicates, categoryRows: rows, categoryTotal: spent,
                           suggestions: suggestions, orderSuggestions: orderSuggestions, ruleStats: ruleStats,
                           suggestedRules: suggestedRules, upcoming: upcoming, autoApplied: autoApplied, periodLabel: label, isCurrentPeriod: current)
    }
}

/// Formatting shared by every section (currency hiding, locale dates).
struct BankFormat {
    let lang: String
    let hide: Bool
    let currency: String

    func money(_ value: Double, _ code: String? = nil) -> String {
        let symbol = bankCurrencySymbol(code ?? currency)
        return hide ? "\(symbol)••••" : "\(symbol)\(value.toCurrencyString())"
    }
    func signed(_ tx: StudioBankTransaction) -> String { (tx.amount < 0 ? "−" : "+") + money(abs(tx.amount), tx.currency) }
    func date(_ iso: String, short: Bool = false) -> String {
        let parser = DateFormatter(); parser.dateFormat = "yyyy-MM-dd"; parser.locale = Locale(identifier: "en_US_POSIX")
        guard let date = parser.date(from: iso) else { return iso }
        let formatter = DateFormatter(); formatter.locale = studioLocale(lang); formatter.setLocalizedDateFormatFromTemplate(short ? "d MMM" : "d MMM yyyy")
        return formatter.string(from: date)
    }
    func time(_ date: Date) -> String {
        let formatter = DateFormatter(); formatter.locale = studioLocale(lang); formatter.dateStyle = .short; formatter.timeStyle = .short
        return formatter.string(from: date)
    }
    /// Date only, no time — used for the consent renewal deadline.
    func day(_ date: Date) -> String {
        let formatter = DateFormatter(); formatter.locale = studioLocale(lang); formatter.dateStyle = .medium; formatter.timeStyle = .none
        return formatter.string(from: date)
    }
    func t(_ key: String) -> String { EGGcraftT(key, lang) }
}

@inline(__always) func EGGcraftT(_ key: String, _ lang: String) -> String { t(key, lang: lang) }

// MARK: - Screen

struct BankSpendingView: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @EnvironmentObject var authVM: AuthViewModel
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    @AppStorage("hideSensitiveNumbers") private var hideSensitiveNumbers: Bool = false
    @AppStorage("bankTxPageSize") private var pageSize: Int = 10
    @StateObject private var model = BankScreenModel()
    @State private var photoItem: PhotosPickerItem?
    @State private var showFileImporter = false

    private var canViewFeed: Bool { authVM.isCompanyOwner || (authVM.currentWorkspaceAccess["bankFeed"] ?? false) }
    private var isOwner: Bool { authVM.isCompanyOwner }
    private var isPhone: Bool { horizontalSizeClass == .compact }
    private var cardBackground: Color { colorScheme == .dark ? Color.white.opacity(0.05) : Color.white }
    private var fmt: BankFormat { BankFormat(lang: seciliDil, hide: hideSensitiveNumbers, currency: firebaseManager.bankTransactions.first?.currency ?? "GBP") }

    var body: some View {
        let derived = BankDerived.make(transactions: firebaseManager.bankTransactions, rules: firebaseManager.bankRules,
                                       vendors: firebaseManager.bankVendors, orders: firebaseManager.siparisler, model: model, lang: seciliDil)
        let selected = firebaseManager.bankTransactions.first { $0.id == model.selectedTxId }
        let categoryOptions = bankCategoryOptions(custom: firebaseManager.bankCustomCategories,
                                                  inUse: firebaseManager.bankTransactions.map(\.effectiveCategory) + firebaseManager.bankRules.map(\.category))
        HStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: isPhone ? 12 : 16) {
                    BankHeaderView(model: model, fmt: fmt, isPhone: isPhone, isOwner: isOwner, hasBank: !firebaseManager.bankConnections.filter(\.isLinked).isEmpty,
                                   onPickPhoto: { model.pendingAttachTxId = "" }, showFileImporter: $showFileImporter, photoItem: $photoItem)
                    if let status = model.status { BankNotice(text: status, color: .green) }
                    if let error = model.error { BankNotice(text: error, color: .red) }
                    if let ocr = model.ocr { BankOcrCard(ocr: ocr, model: model, fmt: fmt, background: cardBackground, isOwner: isOwner) }
                    if !canViewFeed {
                        Text(fmt.t("Bank connections are managed by the workspace owner.")).font(.system(size: 13)).foregroundColor(.secondary)
                    } else {
                        BankTabBar(model: model, fmt: fmt, isPhone: isPhone, label: derived.periodLabel)
                        BankConnectionBar(connections: firebaseManager.bankConnections, fmt: fmt, background: cardBackground, isOwner: isOwner, model: model)
                        if firebaseManager.bankTransactions.isEmpty {
                            BankEmptyState(fmt: fmt, hasBank: !firebaseManager.bankConnections.filter(\.isLinked).isEmpty, background: cardBackground)
                        } else {
                            switch model.tab {
                            case .overview:
                                BankOverviewSection(d: derived, model: model, fmt: fmt, background: cardBackground, isPhone: isPhone,
                                                    isOwner: isOwner, categoryTax: firebaseManager.bankCategoryTax,
                                                    waiting: firebaseManager.bankWaitingReceipts.count,
                                                    brokenConnections: firebaseManager.bankConnections.filter(\.isSyncFailing).count,
                                                    suggestedRules: derived.suggestedRules.count)
                            case .transactions:
                                BankTransactionsSection(d: derived, model: model, fmt: fmt, background: cardBackground, isPhone: isPhone, isOwner: isOwner,
                                                        categoryTax: firebaseManager.bankCategoryTax, pageSize: $pageSize)
                            case .recurring:
                                BankRecurringSection(d: derived, model: model, fmt: fmt, background: cardBackground, isPhone: isPhone)
                            case .receipts:
                                BankReceiptsSection(d: derived, model: model, fmt: fmt, background: cardBackground, isPhone: isPhone, isOwner: isOwner,
                                                    waiting: firebaseManager.bankWaitingReceipts, showFileImporter: $showFileImporter, photoItem: $photoItem)
                            case .rules:
                                BankRulesSection(d: derived, rules: firebaseManager.bankRules, categoryTax: firebaseManager.bankCategoryTax, categoryOptions: categoryOptions,
                                                 model: model, fmt: fmt, background: cardBackground, isPhone: isPhone, isOwner: isOwner)
                            }
                        }
                    }
                }
                .padding(isPhone ? 14 : 20)
                .frame(maxWidth: 1180, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
            if !isPhone, let tx = selected {
                Divider()
                BankTransactionDetail(tx: tx, d: derived, model: model, fmt: fmt, isOwner: isOwner, categoryTax: firebaseManager.bankCategoryTax,
                                      categoryOptions: categoryOptions, connections: firebaseManager.bankConnections,
                                      orders: firebaseManager.siparisler, rules: firebaseManager.bankRules, vendors: firebaseManager.bankVendors,
                                      showFileImporter: $showFileImporter, photoItem: $photoItem, asSheet: false)
                    .frame(width: 380)
            }
        }
        .sheet(isPresented: Binding(get: { isPhone && selected != nil }, set: { if !$0 { model.selectedTxId = nil } })) {
            if let tx = selected {
                BankTransactionDetail(tx: tx, d: derived, model: model, fmt: fmt, isOwner: isOwner, categoryTax: firebaseManager.bankCategoryTax,
                                      categoryOptions: categoryOptions, connections: firebaseManager.bankConnections,
                                      orders: firebaseManager.siparisler, rules: firebaseManager.bankRules, vendors: firebaseManager.bankVendors,
                                      showFileImporter: $showFileImporter, photoItem: $photoItem, asSheet: true)
                    .environmentObject(firebaseManager)
            }
        }
        .fileImporter(isPresented: $showFileImporter, allowedContentTypes: [.pdf, .image]) { result in
            guard case .success(let url) = result else { return }
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            guard let data = try? Data(contentsOf: url) else { return }
            let type = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
            handlePickedFile(data: data, name: url.lastPathComponent, contentType: type)
        }
        .onChange(of: photoItem) { item in
            guard let item else { return }
            item.loadTransferable(type: Data.self) { result in
                guard case .success(let data?) = result else { return }
                DispatchQueue.main.async {
                    handlePickedFile(data: data, name: "receipt-\(Int(Date().timeIntervalSince1970)).jpg", contentType: "image/jpeg")
                    photoItem = nil
                }
            }
        }
        .onAppear {
            model.manager = firebaseManager
            firebaseManager.startBankFeedRealtime(companyId: firebaseManager.currentCompanyId, isOwner: canViewFeed)
        }
        .onChange(of: firebaseManager.currentCompanyId) { newValue in firebaseManager.startBankFeedRealtime(companyId: newValue, isOwner: canViewFeed) }
        .onChange(of: canViewFeed) { newValue in firebaseManager.startBankFeedRealtime(companyId: firebaseManager.currentCompanyId, isOwner: newValue) }
        .onChange(of: pageSize) { _ in model.page = 1 }
    }

    /// A picked photo/file either attaches to a chosen transaction or goes through OCR matching.
    private func handlePickedFile(data: Data, name: String, contentType: String) {
        let target = model.pendingAttachTxId ?? ""
        model.pendingAttachTxId = nil
        let manager = firebaseManager
        if target.isEmpty {
            model.run("ocr") {
                let (path, result) = try await manager.bankMatchReceipt(data: data, fileName: name, contentType: contentType)
                await MainActor.run { model.ocr = BankOcrState(inboxPath: path, fileName: name, amount: result.amount, date: result.date, candidates: result.candidates) }
                return nil
            }
        } else {
            model.run("receipt-\(target)") {
                try await manager.bankAttachReceipt(transactionId: target, data: data, fileName: name, contentType: contentType)
                return EGGcraftT("Invoice attached.", seciliDil)
            }
        }
    }
}

// MARK: - Header, tabs, connection bar

private struct BankHeaderView: View {
    @ObservedObject var model: BankScreenModel
    let fmt: BankFormat
    let isPhone: Bool
    let isOwner: Bool
    let hasBank: Bool
    let onPickPhoto: () -> Void
    @Binding var showFileImporter: Bool
    @Binding var photoItem: PhotosPickerItem?

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(fmt.t("Banking")).font(.system(size: isPhone ? 20 : 24, weight: .bold))
                Text(fmt.t("Read-only Open Banking feed — NivaDesk can never move money.")).font(.system(size: 12)).foregroundColor(.secondary)
            }
            Spacer()
            if isOwner && hasBank {
                Menu {
                    PhotosPicker(selection: $photoItem, matching: .images) { Label(fmt.t("Photo library"), systemImage: "photo") }
                        .simultaneousGesture(TapGesture().onEnded { onPickPhoto() })
                    Button { onPickPhoto(); showFileImporter = true } label: { Label(fmt.t("Choose a file"), systemImage: "doc") }
                } label: {
                    Label(fmt.t("Match a receipt"), systemImage: "camera.viewfinder")
                }
                .menuStyle(.borderlessButton).fixedSize()
                Button {
                    guard let manager = model.manager else { return }
                    model.run("sync") { _ = try await manager.bankSync(); return fmt.t("Transactions refreshed.") }
                } label: { Label(fmt.t("Refresh"), systemImage: "arrow.clockwise") }
                    .disabled(model.busy == "sync")
            }
        }
    }
}

private struct BankNotice: View {
    let text: String
    let color: Color
    var body: some View { Text(text).font(.system(size: 12, weight: .semibold)).foregroundColor(color) }
}

private struct BankTabBar: View {
    @ObservedObject var model: BankScreenModel
    let fmt: BankFormat
    let isPhone: Bool
    let label: String

    var body: some View {
        if isPhone {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(BankTab.allCases) { tab in
                        Button { model.tab = tab; model.selectedTxId = nil } label: {
                            Label(fmt.t(tab.title), systemImage: tab.icon)
                                .font(.system(size: 12.5, weight: .semibold)).labelStyle(.titleOnly)
                                .padding(.horizontal, 12).padding(.vertical, 7)
                                .background(model.tab == tab ? Color.accentColor : Color.gray.opacity(0.14))
                                .foregroundColor(model.tab == tab ? .white : .primary)
                                .clipShape(Capsule())
                        }.buttonStyle(.plain)
                    }
                }
            }
        } else {
            HStack(spacing: 12) {
                Picker("", selection: $model.tab) {
                    ForEach(BankTab.allCases) { tab in Text(fmt.t(tab.title)).tag(tab) }
                }
                .pickerStyle(.segmented).frame(maxWidth: 520)
                .onChange(of: model.tab) { _ in model.selectedTxId = nil }
                Spacer()
                BankPeriodControl(model: model, fmt: fmt, label: label)
            }
        }
        if isPhone { BankPeriodControl(model: model, fmt: fmt, label: label) }
    }
}

private struct BankPeriodControl: View {
    @ObservedObject var model: BankScreenModel
    let fmt: BankFormat
    let label: String

    var body: some View {
        HStack(spacing: 8) {
            Picker("", selection: $model.period) {
                Text(fmt.t("Weekly")).tag(BankPeriodMode.week)
                Text(fmt.t("Monthly")).tag(BankPeriodMode.month)
                Text(fmt.t("Yearly")).tag(BankPeriodMode.year)
            }
            .pickerStyle(.segmented).frame(maxWidth: 220)
            .onChange(of: model.period) { _ in model.page = 1 }
            Button { model.stepPeriod(-1) } label: { Image(systemName: "chevron.left") }.buttonStyle(.plain)
            Text(label).font(.system(size: 12.5, weight: .bold)).lineLimit(1).frame(minWidth: 96)
            Button { model.stepPeriod(1) } label: { Image(systemName: "chevron.right") }.buttonStyle(.plain)
        }
    }
}

private struct BankConnectionBar: View {
    let connections: [StudioBankConnection]
    let fmt: BankFormat
    let background: Color
    let isOwner: Bool
    @ObservedObject var model: BankScreenModel

    @State private var showActivity = false

    var body: some View {
        if !connections.isEmpty {
            VStack(spacing: 0) {
                ForEach(connections) { connection in
                    BankConnectionRow(connection: connection, fmt: fmt, isOwner: isOwner, model: model)
                    if connection.id != connections.last?.id { Divider().padding(.leading, 52) }
                }
                // The connection trail (§audit): syncs, failures, connects and
                // disconnects — owner-only, read on demand via a callable.
                if isOwner {
                    Divider().padding(.leading, 52)
                    Button {
                        withAnimation(.easeInOut(duration: 0.15)) { showActivity.toggle() }
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: "clock.arrow.circlepath").font(.system(size: 10, weight: .semibold))
                            Text(fmt.t("Activity")).font(.system(size: 11, weight: .bold))
                            Spacer()
                            Image(systemName: showActivity ? "chevron.up" : "chevron.down").font(.system(size: 9, weight: .semibold))
                        }
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if showActivity {
                        BankConnectionActivityList(fmt: fmt, model: model)
                    }
                }
            }
            .padding(.vertical, 4)
            .background(background).cornerRadius(14)
        }
    }
}

/// The trail itself: timestamp, bank, and what happened — "Synced · N new",
/// "Sync failed — why", connected, disconnected, purged — green/red dotted.
/// Fetched once when first opened; its own struct (real-iPhone stack guard).
private struct BankConnectionActivityList: View {
    let fmt: BankFormat
    @ObservedObject var model: BankScreenModel

    @State private var entries: [BankAuditEntry]?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(fmt.t("Connection activity")).font(.system(size: 12.5, weight: .bold))
            if let entries {
                if entries.isEmpty {
                    Text(fmt.t("Nothing recorded yet — the trail starts with the next sync."))
                        .font(.system(size: 12)).foregroundColor(.secondary)
                } else {
                    ForEach(entries) { entry in
                        BankAuditEntryRow(entry: entry, fmt: fmt)
                    }
                }
            } else {
                Text(fmt.t("Loading…")).font(.system(size: 12)).foregroundColor(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14).padding(.vertical, 10)
        .task { await load() }
    }

    private func load() async {
        guard entries == nil, let manager = model.manager else { return }
        entries = (try? await manager.bankListAuditLog(limit: 15)) ?? []
    }
}

private struct BankAuditEntryRow: View {
    let entry: BankAuditEntry
    let fmt: BankFormat

    private var label: String {
        switch entry.kind {
        case "sync":
            if entry.ok {
                return fmt.t("Synced") + (entry.imported > 0 ? " · \(entry.imported) \(fmt.t("new"))" : "")
            }
            return fmt.t("Sync failed") + (entry.error.isEmpty ? "" : " — \(entry.error.prefix(90))")
        case "connected": return fmt.t("Bank connected")
        case "disconnected": return fmt.t("Disconnected — data kept")
        case "purged": return fmt.t("Connection and its imported data deleted")
        default: return entry.kind
        }
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Circle().fill(entry.ok ? Color.green : Color.red).frame(width: 6, height: 6)
            Text(fmt.time(Date(timeIntervalSince1970: entry.atMs / 1000)))
                .font(.system(size: 11)).monospacedDigit().foregroundColor(.secondary)
                .layoutPriority(1)
            if !entry.bank.isEmpty {
                Text(entry.bank).font(.system(size: 11, weight: .bold)).lineLimit(1).layoutPriority(1)
            }
            Text(label).font(.system(size: 11)).lineLimit(1).truncationMode(.tail)
            Spacer(minLength: 0)
        }
    }
}

private struct BankConnectionRow: View {
    let connection: StudioBankConnection
    let fmt: BankFormat
    let isOwner: Bool
    @ObservedObject var model: BankScreenModel
    @Environment(\.openURL) private var openURL
    @State private var confirmDisconnect = false
    @State private var confirmPurge = false

    private var stateColor: Color {
        connection.isDisconnected ? .gray : !connection.isLinked ? .orange : connection.needsReconnect ? .red : connection.isSyncFailing ? .orange : .green
    }
    private var stateLabel: String {
        connection.isDisconnected ? fmt.t("Disconnected — data kept")
            : !connection.isLinked ? fmt.t("Waiting for bank consent…")
            : connection.needsReconnect ? fmt.t("Reconnect needed")
            : connection.isSyncFailing ? fmt.t("Sync failing") : fmt.t("Connected")
    }
    private var busy: Bool { model.busy == "delete-\(connection.id)" }

    var body: some View {
        HStack(spacing: 10) {
            if let url = URL(string: connection.providerLogo), !connection.providerLogo.isEmpty {
                AsyncImage(url: url) { image in image.resizable().scaledToFit() } placeholder: { Image(systemName: "building.columns") }
                    .frame(width: 30, height: 30).clipShape(Circle())
            } else {
                Image(systemName: "building.columns").frame(width: 30, height: 30)
            }
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(connection.providerName.isEmpty ? fmt.t("Bank") : connection.providerName.uppercased()).font(.system(size: 13, weight: .bold))
                    Circle().fill(stateColor).frame(width: 6, height: 6)
                    Text(stateLabel).font(.system(size: 11, weight: .bold)).foregroundColor(stateColor)
                }
                if let synced = connection.lastSyncedAt {
                    Text("\(fmt.t("Last sync")) \(fmt.time(synced))").font(.system(size: 11)).foregroundColor(.secondary)
                }
                // Open Banking consent lasts 90 days — surface the deadline,
                // and turn amber once renewal is two weeks out (mirror of the web).
                if connection.isLinked, let expiry = connection.consentExpiresAt {
                    let soon = (connection.consentDaysLeft ?? 0) <= 14
                    Text("\(fmt.t("Consent renews by")) \(fmt.day(expiry))")
                        .font(.system(size: 11, weight: soon ? .bold : .regular))
                        .foregroundColor(soon ? bankAmberColor : .secondary)
                }
                if connection.needsReconnect {
                    Text(fmt.t("The bank stopped sharing data — reconnect on the web to resume the feed.")).font(.system(size: 11)).foregroundColor(.red)
                }
            }
            Spacer()
            if isOwner && connection.needsReconnect, let url = URL(string: "https://nivadesk.app/bank") {
                Button { openURL(url) } label: { Label(fmt.t("Reconnect"), systemImage: "arrow.clockwise") }.tint(.red)
            }
            // Disconnect and delete are different decisions, kept apart on
            // purpose (same contract as the web): disconnecting only revokes
            // the bank consent and KEEPS everything already imported; purging
            // the data is a second, explicit step offered once disconnected.
            if isOwner && connection.isDisconnected {
                if let url = URL(string: "https://nivadesk.app/bank") {
                    Button { openURL(url) } label: { Label(fmt.t("Reconnect"), systemImage: "arrow.clockwise") }
                }
                Button(role: .destructive) { confirmPurge = true } label: { Image(systemName: "trash") }
                    .buttonStyle(.plain).foregroundColor(.secondary).disabled(busy)
                    .help(fmt.t("Delete imported data"))
                    .alert(fmt.t("Delete every imported transaction of this connection? This cannot be undone."), isPresented: $confirmPurge) {
                        Button(fmt.t("Cancel"), role: .cancel) {}
                        Button(fmt.t("Delete imported data"), role: .destructive) { deleteConnection(mode: "purge") }
                    }
            } else if isOwner && !connection.isDisconnected {
                Button(fmt.t("Disconnect account")) { confirmDisconnect = true }
                    .font(.system(size: 11)).foregroundColor(.secondary).disabled(busy)
                    .alert(fmt.t("Disconnect this bank account? Everything already imported stays in NivaDesk, and nothing in Pandle changes. You can reconnect any time."), isPresented: $confirmDisconnect) {
                        Button(fmt.t("Cancel"), role: .cancel) {}
                        Button(fmt.t("Disconnect account")) { deleteConnection(mode: "disconnect") }
                    }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .opacity(connection.isDisconnected ? 0.75 : 1)
    }

    private func deleteConnection(mode: String) {
        guard let manager = model.manager else { return }
        let id = connection.id, fmt = self.fmt
        model.run("delete-\(id)") {
            try await manager.bankDeleteConnection(connectionId: id, mode: mode)
            return mode == "purge" ? fmt.t("Connection and its imported data removed.") : fmt.t("Bank disconnected — your imported transactions were kept.")
        }
    }
}

private struct BankEmptyState: View {
    let fmt: BankFormat
    let hasBank: Bool
    let background: Color
    var body: some View {
        Text(hasBank ? fmt.t("No transactions imported yet.") : fmt.t("Connect your business bank in the web app to see spending here."))
            .font(.system(size: 13.5)).foregroundColor(.secondary).multilineTextAlignment(.center)
            .frame(maxWidth: .infinity).padding(40)
            .background(background).cornerRadius(14)
    }
}

// MARK: - Shared pieces

struct BankStatTile: View {
    let title: String
    let value: String
    let detail: String?
    let detailColor: Color
    let icon: String
    let tint: Color
    let background: Color
    var link: (label: String, action: () -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .top) {
                Text(title).font(.system(size: 12, weight: .semibold)).foregroundColor(tint)
                Spacer()
                Image(systemName: icon).font(.system(size: 12, weight: .bold)).foregroundColor(tint)
                    .frame(width: 28, height: 28).background(tint.opacity(0.12)).clipShape(Circle())
            }
            Text(value).font(.system(size: 22, weight: .bold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
            if let detail, !detail.isEmpty { Text(detail).font(.system(size: 11.5)).foregroundColor(detailColor).lineLimit(2) }
            if let link {
                Spacer(minLength: 4)
                Button(link.label + " →", action: link.action).buttonStyle(.plain).font(.system(size: 12, weight: .bold)).foregroundColor(.accentColor)
            }
        }
        .padding(14).frame(maxWidth: .infinity, minHeight: 118, alignment: .leading)
        .background(background).cornerRadius(14)
    }
}

struct BankChip: View {
    let text: String
    let color: Color
    var filled = false
    var body: some View {
        Text(text).font(.system(size: 10.5, weight: .bold))
            .padding(.horizontal, 9).padding(.vertical, 3)
            .background(filled ? color : color.opacity(0.13)).foregroundColor(filled ? .white : color)
            .clipShape(Capsule()).lineLimit(1)
    }
}

private struct BankCardTitle: View {
    let icon: String
    let title: String
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon).font(.system(size: 12, weight: .bold)).foregroundColor(.secondary)
                .frame(width: 26, height: 26).background(Color.gray.opacity(0.12)).cornerRadius(7)
            Text(title).font(.system(size: 14.5, weight: .bold))
        }
    }
}

/// File-type badge for an attached receipt (PDF / image / document / file).
struct BankFileBadge: View {
    let name: String
    var size: CGFloat = 22
    var body: some View {
        let kind = bankReceiptKind(name)
        let (icon, color): (String, Color) = {
            switch kind {
            case .pdf: return ("doc.richtext.fill", .red)
            case .image: return ("photo.fill", .blue)
            case .doc: return ("doc.text.fill", .green)
            case .file: return ("doc.fill", .gray)
            }
        }()
        return Image(systemName: icon).font(.system(size: size * 0.62)).foregroundColor(color)
            .frame(width: size, height: size).background(color.opacity(0.12)).cornerRadius(6)
    }
}

private struct BankAvatar: View {
    let name: String
    var size: CGFloat = 30
    private var initials: String {
        let parts = name.split(separator: " ").prefix(2).compactMap { $0.first }.map { String($0).uppercased() }
        return parts.isEmpty ? "•" : parts.joined()
    }
    var body: some View {
        let color = bankCategoryColor(name)
        Text(initials).font(.system(size: size * 0.36, weight: .bold)).foregroundColor(color)
            .frame(width: size, height: size).background(color.opacity(0.14)).clipShape(Circle())
    }
}

private struct BankDonut: View {
    let rows: [(name: String, amount: Double, share: Double)]
    let total: Double
    let centerValue: String
    let centerLabel: String
    var size: CGFloat = 140

    /// Cumulative start/end fractions per slice, so each arc is its own trimmed circle.
    private var slices: [(color: Color, from: CGFloat, to: CGFloat)] {
        guard total > 0 else { return [] }
        var start: CGFloat = 0
        return rows.compactMap { row in
            let fraction = CGFloat(row.amount / total)
            guard fraction > 0 else { return nil }
            let from = start
            start += fraction
            let color = row.name == "__uncategorized__" ? bankUncategorisedColor : bankCategoryColor(row.name)
            return (color, from, min(1, start))
        }
    }

    var body: some View {
        ZStack {
            Circle().stroke(Color.gray.opacity(0.15), lineWidth: 20).padding(11)
            ForEach(Array(slices.enumerated()), id: \.offset) { _, slice in
                Circle()
                    .trim(from: slice.from, to: max(slice.from, slice.to - 0.004))
                    .stroke(slice.color, style: StrokeStyle(lineWidth: 20, lineCap: .butt))
                    .rotationEffect(.degrees(-90))
                    .padding(11)
            }
            VStack(spacing: 1) {
                Text(centerValue).font(.system(size: 16, weight: .bold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
                Text(centerLabel).font(.system(size: 10.5)).foregroundColor(.secondary)
            }
            .padding(.horizontal, 24)
        }
        .frame(width: size, height: size)
    }
}

private struct BankReceiptStatus: View {
    let tx: StudioBankTransaction
    let fmt: BankFormat
    var body: some View {
        if !tx.isSpending {
            Text("—").foregroundColor(.secondary)
        } else if tx.hasReceipt {
            HStack(spacing: 5) { BankFileBadge(name: tx.receiptName, size: 20); Text(fmt.t("Matched")).font(.system(size: 11.5, weight: .bold)).foregroundColor(.green) }
        } else if tx.receiptNotNeeded {
            Text(fmt.t("Not needed")).font(.system(size: 11.5)).foregroundColor(.secondary)
        } else {
            HStack(spacing: 5) {
                Image(systemName: "paperclip").font(.system(size: 10, weight: .bold)).foregroundColor(.red)
                    .frame(width: 20, height: 20).overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(style: StrokeStyle(lineWidth: 1.2, dash: [3])).foregroundColor(.red.opacity(0.6)))
                Text(fmt.t("Missing")).font(.system(size: 11.5, weight: .bold)).foregroundColor(.red)
            }
        }
    }
}

// MARK: - Overview

private struct BankOverviewSection: View {
    let d: BankDerived
    @ObservedObject var model: BankScreenModel
    let fmt: BankFormat
    let background: Color
    let isPhone: Bool
    let isOwner: Bool
    let categoryTax: [String: String]
    let waiting: Int
    let brokenConnections: Int
    let suggestedRules: Int

    var body: some View {
        let delta: Double? = d.previousSpent > 0 ? (d.spentTotal - d.previousSpent) / d.previousSpent * 100 : nil
        let attention = d.attentionTotal(waiting: waiting, brokenConnections: brokenConnections)
        let columns = [GridItem(.adaptive(minimum: isPhone ? 150 : 215), spacing: 12)]
        // How the numbers are counted — mirrors the web Overview caption.
        Text(fmt.t("Figures follow the transaction date; pending payments are included. Incoming marked as transfer, owner contribution or loan is not counted as revenue."))
            .font(.system(size: 11))
            .foregroundColor(.primary.opacity(0.55))
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
        LazyVGrid(columns: columns, spacing: 12) {
            BankStatTile(title: fmt.t("Total spent"), value: fmt.money(d.spentTotal),
                         detail: delta.map { String(format: "%@%.0f%% %@", $0 <= 0 ? "↓" : "↑", abs($0), fmt.t(model.period == .year ? "vs last year" : model.period == .week ? "vs last week" : "vs last month")) },
                         detailColor: (delta ?? 0) <= 0 ? .green : .primary, icon: "chart.line.uptrend.xyaxis", tint: .primary, background: background)
            BankStatTile(title: fmt.t("Incoming"), value: "+\(fmt.money(d.incomingTotal))",
                         detail: "\(d.incomingCount) \(fmt.t("payments received"))", detailColor: .secondary, icon: "arrow.up.right", tint: .green, background: background,
                         link: (fmt.t("View all incoming"), { model.txFlow = .in; model.txAttention = .none; model.tab = .transactions }))
            BankStatTile(title: fmt.t("Recurring spend"), value: "\(fmt.money(d.recurringMonthly)) / \(fmt.t("month"))",
                         detail: "\(d.activeRecurring.count) \(fmt.t("active")) · \(d.cancelledRecurring.count) \(fmt.t("possibly cancelled"))", detailColor: .secondary,
                         icon: "calendar", tint: .orange, background: background, link: (fmt.t("View recurring"), { model.tab = .recurring }))
            BankStatTile(title: fmt.t("Needs attention"), value: "\(attention) \(fmt.t("items"))",
                         detail: attentionDetail(), detailColor: .secondary, icon: attention > 0 ? "exclamationmark.triangle" : "checkmark", tint: attention > 0 ? .orange : .green,
                         background: background, link: attention > 0 ? (fmt.t("Review now"), { model.showAttention(d.uncategorised.isEmpty ? .noReceipt : .uncategorised) }) : nil)
        }
        BankSpendingMixCard(d: d, model: model, fmt: fmt, background: background, isPhone: isPhone)
        if !isPhone {
            HStack(alignment: .top, spacing: 12) {
                BankTopRecurringCard(d: d, model: model, fmt: fmt, background: background)
                BankReceiptsSummaryCard(d: d, model: model, fmt: fmt, background: background, waiting: waiting)
            }
        } else {
            BankTopRecurringCard(d: d, model: model, fmt: fmt, background: background)
            BankReceiptsSummaryCard(d: d, model: model, fmt: fmt, background: background, waiting: waiting)
        }
        BankRecentCard(d: d, model: model, fmt: fmt, background: background, isPhone: isPhone)
        BankUpcomingCard(d: d, fmt: fmt, background: background)
        if isOwner {
            BankAccountingReviewCard(d: d, model: model, fmt: fmt, background: background, categoryTax: categoryTax, isPhone: isPhone)
        }
    }

    private func attentionDetail() -> String {
        var parts: [String] = []
        if !d.uncategorised.isEmpty { parts.append("\(d.uncategorised.count) \(fmt.t("uncategorised"))") }
        if !d.missingReceipt.isEmpty { parts.append("\(d.missingReceipt.count) \(fmt.t("missing receipts"))") }
        if d.priceChanged > 0 { parts.append("\(d.priceChanged) \(fmt.t("price changed"))") }
        if !d.cancelledRecurring.isEmpty { parts.append("\(d.cancelledRecurring.count) \(fmt.t("possibly cancelled"))") }
        if !d.duplicateIds.isEmpty { parts.append("\(d.duplicateIds.count) \(fmt.t("possible duplicates"))") }
        if waiting > 0 { parts.append("\(waiting) \(fmt.t("receipts waiting for the bank"))") }
        if brokenConnections > 0 { parts.append("\(brokenConnections) \(fmt.t("bank connection needs reconnecting"))") }
        if suggestedRules > 0 { parts.append("\(suggestedRules) \(fmt.t("rule suggestions"))") }
        return parts.isEmpty ? fmt.t("Everything is reviewed.") : parts.prefix(3).joined(separator: " · ")
    }
}

private struct BankSpendingMixCard: View {
    let d: BankDerived
    @ObservedObject var model: BankScreenModel
    let fmt: BankFormat
    let background: Color
    let isPhone: Bool
    @State private var showAll = false

    var body: some View {
        let rows = showAll ? d.categoryRows : Array(d.categoryRows.prefix(5))
        let unShare = d.categoryRows.first { $0.name == "__uncategorized__" }?.share ?? 0
        VStack(alignment: .leading, spacing: 10) {
            BankCardTitle(icon: "chart.pie", title: fmt.t("Spending mix"))
            if d.categoryRows.isEmpty {
                Text(fmt.t("No spending in this period.")).font(.system(size: 12.5)).foregroundColor(.secondary)
            } else {
                HStack(alignment: .center, spacing: 16) {
                    BankDonut(rows: d.categoryRows, total: d.categoryTotal, centerValue: fmt.money(d.categoryTotal), centerLabel: fmt.t("Total spent"), size: isPhone ? 120 : 140)
                    VStack(spacing: 4) {
                        ForEach(rows, id: \.name) { row in
                            HStack(spacing: 8) {
                                Circle().fill(row.name == "__uncategorized__" ? bankUncategorisedColor : bankCategoryColor(row.name)).frame(width: 8, height: 8)
                                Text(row.name == "__uncategorized__" ? fmt.t("Uncategorised") : fmt.t(row.name)).font(.system(size: 12.5)).lineLimit(1)
                                Spacer()
                                Text(fmt.money(row.amount)).font(.system(size: 12.5, weight: .bold)).monospacedDigit()
                                Text(String(format: "%.0f%%", row.share)).font(.system(size: 11.5)).foregroundColor(.secondary).frame(width: 34, alignment: .trailing)
                            }
                        }
                    }
                }
                Divider()
                HStack(spacing: 8) {
                    if unShare > 0 {
                        ProgressView(value: max(0.02, 1 - unShare / 100)).tint(.green).frame(maxWidth: 120)
                        Text("\(Int((100 - unShare).rounded()))% \(fmt.t("categorised"))").font(.system(size: 11.5)).foregroundColor(.secondary)
                        Button("\(fmt.t("Categorise")) \(d.uncategorised.count) →") { model.showAttention(.uncategorised) }
                            .buttonStyle(.plain).font(.system(size: 11.5, weight: .bold)).foregroundColor(.accentColor)
                    }
                    Spacer()
                    if d.categoryRows.count > 5 {
                        Button(showAll ? "\(fmt.t("Show less")) ←" : "\(fmt.t("View category breakdown")) →") { showAll.toggle() }
                            .buttonStyle(.plain).font(.system(size: 12, weight: .bold)).foregroundColor(.accentColor)
                    }
                }
            }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).background(background).cornerRadius(14)
    }
}

private struct BankTopRecurringCard: View {
    let d: BankDerived
    @ObservedObject var model: BankScreenModel
    let fmt: BankFormat
    let background: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                BankCardTitle(icon: "arrow.triangle.2.circlepath", title: fmt.t("Top recurring vendors"))
                Spacer()
                Button("\(fmt.t("View recurring")) →") { model.tab = .recurring }.buttonStyle(.plain).font(.system(size: 12, weight: .bold)).foregroundColor(.accentColor)
            }
            ForEach(d.activeRecurring.prefix(5)) { item in
                HStack(spacing: 10) {
                    BankAvatar(name: item.merchant, size: 26)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(item.merchant).font(.system(size: 12.5, weight: .bold)).lineLimit(1)
                        Text("\(fmt.t(item.cadence == .weekly ? "Weekly" : item.cadence == .yearly ? "Yearly" : "Monthly")) · \(item.occurrences)×").font(.system(size: 10.5)).foregroundColor(.secondary)
                    }
                    Spacer()
                    Text(fmt.money(item.typicalAmount, item.currency)).font(.system(size: 12.5, weight: .bold)).monospacedDigit()
                    Text("/ \(fmt.t("month"))").font(.system(size: 9.5)).foregroundColor(.secondary)
                }
            }
            if d.activeRecurring.isEmpty { Text(fmt.t("No recurring payments detected yet.")).font(.system(size: 12)).foregroundColor(.secondary) }
            Spacer(minLength: 0)
            HStack(spacing: 8) {
                Text("\(d.activeRecurring.count)").font(.system(size: 15, weight: .bold)).foregroundColor(.green)
                Text(fmt.t("Active recurring")).font(.system(size: 12)).foregroundColor(.secondary)
                Spacer()
                Text("\(d.cancelledRecurring.count)").font(.system(size: 15, weight: .bold)).foregroundColor(.orange)
                Text(fmt.t("Possibly cancelled")).font(.system(size: 12)).foregroundColor(.secondary)
            }
            .padding(10).background(Color.gray.opacity(0.08)).cornerRadius(10)
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).background(background).cornerRadius(14)
    }
}

private struct BankReceiptsSummaryCard: View {
    let d: BankDerived
    @ObservedObject var model: BankScreenModel
    let fmt: BankFormat
    let background: Color
    let waiting: Int
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            BankCardTitle(icon: "doc.text", title: fmt.t("Receipts summary"))
            HStack(spacing: 0) {
                summaryCell("\(d.matchedReceipts)", fmt.t("Receipts matched"), .green)
                Divider().frame(height: 40)
                summaryCell("\(d.missingReceipt.count)", fmt.t("Missing receipts"), d.missingReceipt.isEmpty ? .primary : .red)
                Divider().frame(height: 40)
                summaryCell("\(d.notNeededReceipts)", fmt.t("No receipt needed"), .secondary)
            }
            if waiting > 0 {
                Button { model.tab = .receipts } label: {
                    Label("\(waiting) \(fmt.t("receipts waiting for the bank")) →", systemImage: "hourglass").font(.system(size: 12, weight: .bold)).foregroundColor(.orange)
                }.buttonStyle(.plain)
            }
            Spacer(minLength: 0)
            VStack(alignment: .leading, spacing: 4) {
                Text(fmt.t("Keep your records complete.")).font(.system(size: 12.5, weight: .bold))
                Text(fmt.t("Match missing receipts to stay audit-ready.")).font(.system(size: 12)).foregroundColor(.secondary)
                Button("\(fmt.t("Review receipts")) →") { model.tab = .receipts }.font(.system(size: 12, weight: .bold)).padding(.top, 4)
            }
            .padding(12).frame(maxWidth: .infinity, alignment: .leading).background(Color.accentColor.opacity(0.07)).cornerRadius(10)
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).background(background).cornerRadius(14)
    }

    private func summaryCell(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.system(size: 24, weight: .bold)).foregroundColor(color)
            Text(label).font(.system(size: 11)).foregroundColor(.secondary).multilineTextAlignment(.center)
        }.frame(maxWidth: .infinity)
    }
}

private struct BankRecentCard: View {
    let d: BankDerived
    @ObservedObject var model: BankScreenModel
    let fmt: BankFormat
    let background: Color
    let isPhone: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                BankCardTitle(icon: "list.bullet.rectangle", title: fmt.t("Recent transactions"))
                Spacer()
                Button("\(fmt.t("View all transactions")) →") { model.tab = .transactions }.buttonStyle(.plain).font(.system(size: 12, weight: .bold)).foregroundColor(.accentColor)
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            Divider()
            ForEach(d.visible.prefix(6)) { tx in
                BankTransactionRow(tx: tx, fmt: fmt, compact: isPhone, isDuplicate: false, isRecurring: false, selected: false)
                    .contentShape(Rectangle())
                    .onTapGesture { model.tab = .transactions; model.selectedTxId = tx.id }
                Divider().opacity(0.5)
            }
        }
        .background(background).cornerRadius(14)
    }
}

private struct BankUpcomingCard: View {
    let d: BankDerived
    let fmt: BankFormat
    let background: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                BankCardTitle(icon: "calendar", title: fmt.t("Upcoming payments & renewals"))
                Spacer()
                Text("\(d.upcoming.count)").font(.system(size: 11, weight: .bold)).padding(.horizontal, 8).padding(.vertical, 2).background(Color.gray.opacity(0.14)).cornerRadius(7)
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            Divider()
            if d.upcoming.isEmpty {
                Text(fmt.t("Nothing expected in the next 30 days.")).font(.system(size: 12)).foregroundColor(.secondary).padding(16)
            }
            ForEach(d.upcoming.prefix(6)) { item in
                HStack(spacing: 10) {
                    // "around 12 Sep" — the date is an estimate, and says so.
                    Text("\(fmt.t("around")) \(fmt.date(item.nextExpected, short: true))")
                        .font(.system(size: 11)).foregroundColor(.secondary).frame(width: 96, alignment: .leading)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(item.merchant).font(.system(size: 12.5, weight: .bold)).lineLimit(1)
                        Text("\(fmt.t("Based on the last")) \(item.occurrences) \(fmt.t(item.cadence == .weekly ? "weekly" : item.cadence == .yearly ? "yearly" : "monthly")) \(fmt.t("payments").lowercased())")
                            .font(.system(size: 10)).foregroundColor(.secondary).lineLimit(1)
                    }
                    Spacer()
                    Text(fmt.money(item.typicalAmount, item.currency)).font(.system(size: 12.5, weight: .bold)).monospacedDigit()
                    Text("/ \(fmt.t("month"))").font(.system(size: 9.5)).foregroundColor(.secondary)
                }
                .padding(.horizontal, 16).padding(.vertical, 9)
                Divider().opacity(0.5)
            }
            if !d.upcoming.isEmpty {
                // Web parity: the estimates disclaimer under the list.
                Text(fmt.t("These are estimates, not booked payments."))
                    .font(.system(size: 10.5)).foregroundColor(.secondary)
                    .padding(.horizontal, 16).padding(.vertical, 10)
            }
        }
        .background(background).cornerRadius(14)
    }
}

/// The accountant's worklist for the selected period: how ready this period
/// is to hand over, with one tap into each pile (mirror of the web's
/// "Accounting review" card). Separate struct on purpose (stack).
private struct BankAccountingReviewCard: View {
    let d: BankDerived
    @ObservedObject var model: BankScreenModel
    let fmt: BankFormat
    let background: Color
    let categoryTax: [String: String]
    let isPhone: Bool

    private var piles: [(label: String, count: Int, filter: String, color: Color)] {
        let ready = d.visible.filter { $0.effectiveReviewStatus == "ready" }.count
        let needsInfo = d.visible.filter { $0.effectiveReviewStatus == "needs_info" }.count
        let missingVat = d.spending.filter { !$0.effectiveCategory.isEmpty && bankEffectiveVat($0, categoryTax: categoryTax).isEmpty }.count
        let syncErrors = d.visible.filter { $0.effectiveReviewStatus == "sync_error" }.count
        let confirmed = d.visible.filter { $0.effectiveReviewStatus == "confirmed" }.count
        return [
            (fmt.t("Ready for accounting"), ready, "ready", bankReviewStatusColor("ready")),
            (fmt.t("Needs information"), needsInfo, "needs_info", bankReviewStatusColor("needs_info")),
            (fmt.t("Missing receipt"), d.missingReceipt.count, "missing_receipt", bankReviewStatusColor("sync_error")),
            (fmt.t("Missing VAT code"), missingVat, "missing_vat", bankReviewStatusColor("needs_info")),
            (fmt.t("Sync error"), syncErrors, "sync_error", bankReviewStatusColor("sync_error")),
            (fmt.t("Confirmed in accounting"), confirmed, "confirmed", bankReviewStatusColor("confirmed"))
        ]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                BankCardTitle(icon: "checkmark.seal", title: fmt.t("Accounting review"))
                Text("· \(d.periodLabel)").font(.system(size: 11.5)).foregroundColor(.secondary)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: isPhone ? 104 : 130), spacing: 8)], spacing: 8) {
                ForEach(piles, id: \.filter) { pile in
                    Button { model.showReviewPile(pile.filter) } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(pile.count)").font(.system(size: 20, weight: .bold)).monospacedDigit()
                                .foregroundColor(pile.count > 0 ? pile.color : .primary)
                            Text(pile.label).font(.system(size: 11)).foregroundColor(.secondary)
                                .multilineTextAlignment(.leading).lineLimit(2)
                        }
                        .frame(maxWidth: .infinity, minHeight: 58, alignment: .topLeading)
                        .padding(10)
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.gray.opacity(0.2)))
                        .contentShape(Rectangle())
                    }.buttonStyle(.plain)
                }
            }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).background(background).cornerRadius(14)
    }
}

// MARK: - Transactions

struct BankTransactionRow: View {
    let tx: StudioBankTransaction
    let fmt: BankFormat
    let compact: Bool
    let isDuplicate: Bool
    let isRecurring: Bool
    let selected: Bool

    var body: some View {
        let category = tx.effectiveCategory
        let meta = bankTxTypeMeta(tx.txType)
        HStack(spacing: 10) {
            BankAvatar(name: tx.merchant, size: compact ? 30 : 32)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 5) {
                    if tx.effectiveReviewStatus != "unreviewed" {
                        Circle().fill(bankReviewStatusColor(tx.effectiveReviewStatus)).frame(width: 7, height: 7)
                            .accessibilityLabel(fmt.t(bankReviewStatusLabel(tx.effectiveReviewStatus)))
                    }
                    if isRecurring { Image(systemName: "arrow.triangle.2.circlepath").font(.system(size: 9)).foregroundColor(.secondary) }
                    Text(tx.merchant).font(.system(size: 13, weight: .bold)).lineLimit(1)
                    if isDuplicate { BankChip(text: fmt.t("Duplicate?"), color: .orange) }
                }
                HStack(spacing: 6) {
                    Text(fmt.date(tx.bookingDate, short: compact)).font(.system(size: 11)).foregroundColor(.secondary)
                    if tx.status == "pending" { Text("· \(fmt.t("pending"))").font(.system(size: 10.5)).foregroundColor(.secondary) }
                    if let meta { BankChip(text: meta.translate ? fmt.t(meta.label) : meta.label, color: meta.color) }
                    if tx.isSpending {
                        // A split payment shows the split badge where the
                        // category chip would sit — the lines carry the categories.
                        if !tx.splits.isEmpty {
                            BankChip(text: "⑃ \(fmt.t("Split")) (\(tx.splits.count))", color: .blue)
                        } else {
                            BankChip(text: category.isEmpty ? fmt.t("Uncategorised") : fmt.t(category), color: category.isEmpty ? .gray : bankCategoryColor(category))
                        }
                    }
                    if !tx.linkedOrderLabel.isEmpty { Image(systemName: "link").font(.system(size: 9)).foregroundColor(.accentColor) }
                }
            }
            Spacer()
            if !compact { BankReceiptStatus(tx: tx, fmt: fmt).frame(width: 96, alignment: .leading) }
            VStack(alignment: .trailing, spacing: 2) {
                Text(fmt.signed(tx)).font(.system(size: 13, weight: .bold)).monospacedDigit().foregroundColor(tx.isSpending ? .red : .green)
                if compact && tx.isSpending {
                    Image(systemName: tx.hasReceipt ? "doc.text.fill" : tx.receiptNotNeeded ? "minus.circle" : "paperclip")
                        .font(.system(size: 10)).foregroundColor(tx.hasReceipt ? .green : tx.receiptNotNeeded ? .secondary : .red)
                }
            }
        }
        .padding(.horizontal, compact ? 12 : 16).padding(.vertical, 9)
        .background(selected ? Color.accentColor.opacity(0.09) : Color.clear)
    }
}

private struct BankTransactionsSection: View {
    let d: BankDerived
    @ObservedObject var model: BankScreenModel
    let fmt: BankFormat
    let background: Color
    let isPhone: Bool
    let isOwner: Bool
    let categoryTax: [String: String]
    @Binding var pageSize: Int

    private var filtered: [StudioBankTransaction] {
        let needle = model.txSearch.trimmingCharacters(in: .whitespaces).lowercased()
        return d.visible.filter { tx in
            // Accounting-review pile filter (mirror of the web's txReview):
            // two derived piles, otherwise an effective review status match.
            switch model.txReview {
            case "": break
            case "missing_vat":
                if !(tx.isSpending && !tx.effectiveCategory.isEmpty && bankEffectiveVat(tx, categoryTax: categoryTax).isEmpty) { return false }
            case "missing_receipt":
                if !(tx.isSpending && !tx.hasReceipt && !tx.receiptNotNeeded) { return false }
            default:
                if tx.effectiveReviewStatus != model.txReview { return false }
            }
            if model.txFlow == .in && tx.amount <= 0 { return false }
            if model.txFlow == .out && tx.amount >= 0 { return false }
            switch model.txAttention {
            case .uncategorised: if !(tx.isSpending && tx.effectiveCategory.isEmpty) { return false }
            case .noReceipt: if !(tx.isSpending && !tx.hasReceipt) { return false }
            case .duplicate: if !d.duplicateIds.contains(tx.id) { return false }
            case .any: if !(tx.isSpending && (tx.effectiveCategory.isEmpty || (!tx.hasReceipt && !tx.receiptNotNeeded) || d.duplicateIds.contains(tx.id))) { return false }
            case .none: break
            }
            if !needle.isEmpty && !"\(tx.counterparty) \(tx.description)".lowercased().contains(needle) { return false }
            return true
        }
    }

    var body: some View {
        let list = filtered
        let pageCount = max(1, Int(ceil(Double(list.count) / Double(max(pageSize, 1)))))
        let page = min(model.page, pageCount)
        let paged = Array(list.dropFirst((page - 1) * pageSize).prefix(pageSize))

        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        filterChip(fmt.t("All"), active: model.txAttention == .none && model.txFlow == .all, color: .accentColor) { model.txAttention = .none; model.txFlow = .all; model.page = 1 }
                        filterChip(fmt.t("Needs attention"), active: model.txAttention != .none, color: .orange) { model.txAttention = model.txAttention == .none ? .any : .none; model.page = 1 }
                        filterChip(fmt.t("Incoming"), active: model.txAttention == .none && model.txFlow == .in, color: .green) { model.txAttention = .none; model.txFlow = .in; model.page = 1 }
                        filterChip(fmt.t("Spending"), active: model.txAttention == .none && model.txFlow == .out, color: .red) { model.txAttention = .none; model.txFlow = .out; model.page = 1 }
                    }
                }
            }
            TextField(fmt.t("Search transactions"), text: $model.txSearch)
                .textFieldStyle(.roundedBorder)
                .onChange(of: model.txSearch) { _ in model.page = 1 }
            if !d.categoryRows.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(d.categoryRows.prefix(6), id: \.name) { row in
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 5) {
                                    Circle().fill(row.name == "__uncategorized__" ? bankUncategorisedColor : bankCategoryColor(row.name)).frame(width: 7, height: 7)
                                    Text(row.name == "__uncategorized__" ? fmt.t("Uncategorised") : fmt.t(row.name)).font(.system(size: 11)).foregroundColor(.secondary).lineLimit(1)
                                }
                                Text(fmt.money(row.amount)).font(.system(size: 14, weight: .bold)).monospacedDigit()
                            }
                            .padding(.horizontal, 12).padding(.vertical, 8).frame(minWidth: 120, alignment: .leading)
                            .background(background).cornerRadius(11)
                        }
                    }
                }
            }
        }
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(fmt.t("Transactions")).font(.system(size: 14.5, weight: .bold))
                if model.txAttention != .none {
                    Button { model.txAttention = .none } label: {
                        BankChip(text: "! \(attentionLabel()) ✕", color: .orange)
                    }.buttonStyle(.plain)
                }
                if !model.txReview.isEmpty {
                    Button { model.txReview = ""; model.page = 1 } label: {
                        BankChip(text: "⚑ \(reviewLabel()) ✕", color: .blue)
                    }.buttonStyle(.plain)
                }
                Spacer()
                Text("\(list.count) \(fmt.t("transactions"))").font(.system(size: 12)).foregroundColor(.secondary)
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            Divider()
            if paged.isEmpty {
                Text(fmt.t("No transactions in this period.")).font(.system(size: 12.5)).foregroundColor(.secondary).padding(20).frame(maxWidth: .infinity)
            }
            ForEach(paged) { tx in
                BankTransactionRow(tx: tx, fmt: fmt, compact: isPhone, isDuplicate: d.duplicateIds.contains(tx.id),
                                   isRecurring: tx.isSpending && d.recurringKeys.contains(bankRecurringMerchantKey(tx)), selected: model.selectedTxId == tx.id)
                    .contentShape(Rectangle())
                    .onTapGesture { model.selectedTxId = model.selectedTxId == tx.id ? nil : tx.id }
                Divider().opacity(0.5)
            }
            HStack(spacing: 8) {
                Text("\(fmt.t("Showing")) \(paged.count) / \(list.count)").font(.system(size: 11.5)).foregroundColor(.secondary)
                Picker("", selection: $pageSize) { Text("10").tag(10); Text("20").tag(20); Text("30").tag(30) }
                    .pickerStyle(.segmented).frame(width: 120)
                Spacer()
                Button { model.page = max(1, page - 1) } label: { Image(systemName: "chevron.left") }.buttonStyle(.plain).disabled(page <= 1).opacity(page <= 1 ? 0.3 : 1)
                Text("\(page) / \(pageCount)").font(.system(size: 12, weight: .bold)).monospacedDigit()
                Button { model.page = min(pageCount, page + 1) } label: { Image(systemName: "chevron.right") }.buttonStyle(.plain).disabled(page >= pageCount).opacity(page >= pageCount ? 0.3 : 1)
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
        }
        .background(background).cornerRadius(14)
    }

    private func attentionLabel() -> String {
        switch model.txAttention {
        case .uncategorised: return fmt.t("Uncategorised")
        case .noReceipt: return fmt.t("No receipt")
        case .duplicate: return fmt.t("Possible duplicates")
        default: return fmt.t("Needs attention")
        }
    }

    private func reviewLabel() -> String {
        switch model.txReview {
        case "missing_vat": return fmt.t("Missing VAT code")
        case "missing_receipt": return fmt.t("Missing receipt")
        default: return fmt.t(bankReviewStatusLabel(model.txReview))
        }
    }

    private func filterChip(_ title: String, active: Bool, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if color != .accentColor { Circle().fill(active ? Color.white : color).frame(width: 6, height: 6) }
                Text(title).font(.system(size: 12, weight: .semibold))
            }
            .padding(.horizontal, 11).padding(.vertical, 6)
            .background(active ? color : Color.gray.opacity(0.13)).foregroundColor(active ? .white : .primary)
            .clipShape(Capsule())
        }.buttonStyle(.plain)
    }
}

// MARK: - Transaction detail (inspector on Mac, sheet on iPhone)

struct BankTransactionDetail: View {
    let tx: StudioBankTransaction
    let d: BankDerived
    @ObservedObject var model: BankScreenModel
    let fmt: BankFormat
    let isOwner: Bool
    let categoryTax: [String: String]
    let categoryOptions: [String]
    let connections: [StudioBankConnection]
    let orders: [Siparis]
    let rules: [StudioBankRule]
    let vendors: [StudioBankVendor]
    @Binding var showFileImporter: Bool
    @Binding var photoItem: PhotosPickerItem?
    let asSheet: Bool

    @State private var category = ""
    @State private var vat = ""
    @State private var review = ""
    @State private var orderId = ""
    @State private var note = ""
    @State private var ruleKeyword = ""
    @State private var showBankData = false
    @State private var showLibraryPicker = false
    @Environment(\.openURL) private var openURL

    private var pickableCategories: [String] {
        var list = categoryOptions
        if !category.isEmpty && !list.contains(category) { list.append(category) }
        return list
    }
    private var rankedOrders: [Siparis] { Array(bankRankOrders(for: tx, orders: orders.filter { $0.id != nil }).prefix(40).map(\.order)) }
    private var canSuggestRule: Bool {
        tx.isSpending && isOwner && !category.isEmpty && !rules.contains { "\(tx.counterparty) \(tx.description)".lowercased().contains($0.keyword) }
    }

    var body: some View {
        let content = Form {
            Section {
                HStack(spacing: 10) {
                    BankAvatar(name: tx.merchant, size: 38)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(tx.merchant).font(.system(size: 14, weight: .bold)).lineLimit(2)
                        HStack(spacing: 6) {
                            if let meta = bankTxTypeMeta(tx.txType) { BankChip(text: meta.translate ? fmt.t(meta.label) : meta.label, color: meta.color) }
                            Text(fmt.date(tx.bookingDate)).font(.system(size: 11)).foregroundColor(.secondary)
                        }
                    }
                    Spacer()
                    Text(fmt.signed(tx)).font(.system(size: 16, weight: .bold)).monospacedDigit().foregroundColor(tx.isSpending ? .red : .green)
                }
                LabeledContent(fmt.t("Raw bank description")) { Text(tx.description.isEmpty ? "—" : tx.description).font(.system(size: 12)).foregroundColor(.secondary).multilineTextAlignment(.trailing) }
            }
            // The read-only bank layer, kept visibly apart from NivaDesk's own
            // enrichment: what the bank said never changes here.
            Section {
                DisclosureGroup(isExpanded: $showBankData) {
                    bankDataRow(fmt.t("Bank transaction ID"), tx.providerTransactionId.isEmpty ? tx.id : tx.providerTransactionId)
                    bankDataRow(fmt.t("Bank account"), bankAccountLabel)
                    bankDataRow(fmt.t("Status"), tx.status == "pending" ? fmt.t("pending") : fmt.t("Booked"))
                    bankDataRow(fmt.t("Bank reference"), tx.providerReference.isEmpty ? "—" : tx.providerReference)
                    bankDataRow(fmt.t("Open Banking provider"), tx.provider == "truelayer" ? "TrueLayer" : (tx.provider.isEmpty ? "—" : tx.provider))
                    bankDataRow(fmt.t("First imported"), tx.firstImportedAt.map { fmt.date(bankIsoDayString($0)) } ?? "—")
                    bankDataRow(fmt.t("Last updated"), tx.importedAt.map { fmt.time($0) } ?? "—")
                    Text(fmt.t("Bank data can never be edited — everything below is NivaDesk's own enrichment."))
                        .font(.system(size: 11)).foregroundColor(.secondary)
                } label: {
                    Text("\(fmt.t("Bank data")) · \(fmt.t("Read-only"))").font(.system(size: 11.5, weight: .bold)).foregroundColor(.secondary)
                }
            }
            // Incoming money: classify it, and — for order payments — match it
            // to the payment already recorded on the order (never twice).
            if tx.amount > 0 {
                BankIncomingMatchSection(tx: tx, model: model, fmt: fmt, isOwner: isOwner, orders: orders)
            }
            if tx.isSpending {
                Section {
                    Picker(fmt.t("Category"), selection: $category) {
                        Text(fmt.t("Uncategorised")).tag("")
                        ForEach(pickableCategories, id: \.self) { Text(fmt.t($0)).tag($0) }
                    }
                    if tx.category.isEmpty, !tx.categoryAuto.isEmpty {
                        // The audit trail: which rule keyword auto-applied the category.
                        Text("⚡ \(fmt.t("Auto-applied")): \(fmt.t(tx.categoryAuto))\(tx.categoryAutoRule.isEmpty ? "" : " · \(fmt.t("Rule")) “\(tx.categoryAutoRule)”")")
                            .font(.system(size: 11)).foregroundColor(.secondary)
                    }
                    if category.isEmpty, let suggestion = d.suggestions[tx.id] {
                        Button { category = suggestion.category } label: {
                            Label("\(fmt.t(suggestion.category))? · \(Int(suggestion.confidence * 100))%", systemImage: "sparkles").font(.system(size: 12, weight: .semibold))
                        }
                    }
                    Picker(fmt.t("VAT / Tax code"), selection: $vat) {
                        Text("\(fmt.t("Use category default"))\(categoryTax[category].map { " (\(fmt.t(bankVatLabel($0))))" } ?? "")").tag("")
                        ForEach(bankVatCodes, id: \.code) { Text(fmt.t($0.label)).tag($0.code) }
                    }
                    if tx.vatCode.isEmpty, !tx.vatCodeAuto.isEmpty {
                        Text("⚡ \(fmt.t("Auto-applied")): \(fmt.t(bankVatLabel(tx.vatCodeAuto)))").font(.system(size: 11)).foregroundColor(.secondary)
                    }
                    Picker(fmt.t("Linked order or project"), selection: $orderId) {
                        Text(fmt.t("Not linked")).tag("")
                        ForEach(rankedOrders, id: \.id) { order in
                            Text(order.designName.isEmpty || order.designName == "Untitled design" ? order.customerName : "\(order.customerName) · \(order.designName)").tag(order.id ?? "")
                        }
                        if !orderId.isEmpty && !rankedOrders.contains(where: { $0.id == orderId }) { Text(tx.linkedOrderLabel.isEmpty ? fmt.t("Order") : tx.linkedOrderLabel).tag(orderId) }
                    }
                    if orderId.isEmpty, let hint = d.orderSuggestions[tx.id] {
                        Button { orderId = hint.orderId } label: {
                            Label("\(fmt.t("Likely related to this order")): \(hint.label) (\(Int(hint.confidence * 100))%)", systemImage: "link").font(.system(size: 12, weight: .semibold))
                        }
                    }
                } header: { Text(fmt.t("Bookkeeping")) }

                // Payment born from an Inventory purchase: read-only link here —
                // the supplier and stock items are managed on the purchase itself.
                if !tx.purchaseNumber.isEmpty {
                    Section {
                        HStack(spacing: 8) {
                            Text("▣ \(tx.purchaseNumber)").font(.system(size: 12.5, weight: .bold))
                            Spacer()
                            Button {
                                model.selectedTxId = nil
                                NotificationCenter.default.post(name: .studioInventoryRouteRequested, object: nil)
                            } label: {
                                Text("\(fmt.t("View in Inventory")) →").font(.system(size: 12, weight: .bold)).foregroundColor(.accentColor)
                            }
                            .buttonStyle(.plain)
                        }
                        Text(fmt.t("This payment is linked to a purchase — its supplier and stock items live in Inventory."))
                            .font(.system(size: 11)).foregroundColor(.secondary)
                    }
                }

                Section {
                    if tx.hasReceipt {
                        HStack(spacing: 8) {
                            BankFileBadge(name: tx.receiptName, size: 28)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("✓ \(fmt.t("Receipt matched"))").font(.system(size: 11.5, weight: .bold)).foregroundColor(.green)
                                Button(tx.receiptName.isEmpty ? fmt.t("View invoice") : tx.receiptName) { openReceipt() }.buttonStyle(.plain).font(.system(size: 11.5)).foregroundColor(.accentColor).lineLimit(1)
                            }
                            Spacer()
                            if isOwner { Button(role: .destructive) { removeReceipt() } label: { Image(systemName: "trash") }.buttonStyle(.plain) }
                        }
                    } else {
                        HStack {
                            Text(tx.receiptNotNeeded ? fmt.t("No receipt needed") : "! \(fmt.t("Missing receipt"))").font(.system(size: 12, weight: .bold)).foregroundColor(tx.receiptNotNeeded ? .secondary : .red)
                            Spacer()
                            if isOwner { attachMenu }
                        }
                        if isOwner {
                            // An invoice already in the central Files library is
                            // referenced, never re-uploaded.
                            Button { showLibraryPicker.toggle() } label: {
                                Label(fmt.t("Choose from Files"), systemImage: "folder").font(.system(size: 12, weight: .semibold))
                            }
                            if showLibraryPicker {
                                BankLibraryPicker(tx: tx, model: model, fmt: fmt, onClose: { showLibraryPicker = false })
                            }
                            Toggle(fmt.t("No receipt needed"), isOn: Binding(get: { tx.receiptNotNeeded }, set: { value in
                                guard let manager = model.manager else { return }
                                model.run("receipt-\(tx.id)") { try await manager.bankSetReceiptNotNeeded(transactionId: tx.id, value: value); return nil }
                            }))
                        }
                    }
                } header: { Text(fmt.t("Receipt / attachment")) }

                // One payment, several categories/orders — the split editor.
                BankSplitSection(tx: tx, model: model, fmt: fmt, isOwner: isOwner, categoryOptions: pickableCategories, orders: rankedOrders)
            }
            Section {
                Picker(fmt.t("Review status"), selection: $review) {
                    ForEach(bankReviewStatuses, id: \.code) { Text(fmt.t($0.label)).tag($0.code) }
                }
                .disabled(!isOwner)
                HStack {
                    Spacer()
                    Text(fmt.t(bankReviewStatusLabel(review)).uppercased())
                        .font(.system(size: 10, weight: .heavy))
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .background(bankReviewStatusColor(review).opacity(0.12))
                        .foregroundColor(bankReviewStatusColor(review))
                        .clipShape(Capsule())
                }
            }
            Section {
                TextField(fmt.t("Internal note for this transaction"), text: $note, axis: .vertical).lineLimit(2...5).disabled(!isOwner)
            } header: { Text(fmt.t("Notes")) }
            if canSuggestRule {
                Section {
                    HStack(spacing: 6) {
                        Text(fmt.t("If merchant contains")).font(.system(size: 12))
                        TextField("", text: $ruleKeyword).textFieldStyle(.roundedBorder).frame(maxWidth: 140).font(.system(size: 12, weight: .bold))
                        Text("→ \(fmt.t(category))").font(.system(size: 12, weight: .bold)).foregroundColor(bankCategoryColor(category))
                    }
                    Button { save(createRule: true) } label: { Label(fmt.t("Create rule"), systemImage: "wand.and.stars") }
                } header: { Text("✦ \(fmt.t("Rule suggestion"))") }
            }
            if tx.isSpending {
                Section {
                    let key = bankRecurringMerchantKey(tx)
                    let vendor = vendors.first { $0.keys.contains(key) }
                    if let vendor {
                        LabeledContent(fmt.t("Recurring")) {
                            VStack(alignment: .trailing, spacing: 2) {
                                Text("\(fmt.t("Marked as recurring")) · \(fmt.t(vendor.cadence == .weekly ? "Weekly" : vendor.cadence == .yearly ? "Yearly" : "Monthly"))")
                                    .font(.system(size: 11.5, weight: .semibold)).foregroundColor(.green)
                                Text("\(fmt.t("Grouped as")) “\(vendor.name)”").font(.system(size: 11)).foregroundColor(.secondary)
                            }
                        }
                        if isOwner {
                            Button(role: .destructive) { saveVendor(id: vendor.id, cadence: nil, remove: true) } label: { Text(fmt.t("Stop treating as recurring")).font(.system(size: 12)) }
                        }
                    } else if d.recurringKeys.contains(key) {
                        LabeledContent(fmt.t("Recurring")) {
                            Text(fmt.t("Part of a recurring payment")).font(.system(size: 11.5)).foregroundColor(.green)
                        }
                    } else {
                        LabeledContent(fmt.t("Recurring")) {
                            Text(fmt.t("This transaction doesn't appear to repeat.")).font(.system(size: 11.5)).foregroundColor(.secondary).multilineTextAlignment(.trailing)
                        }
                        if isOwner {
                            Menu {
                                Button(fmt.t("Weekly")) { saveVendor(id: "", cadence: .weekly, remove: false) }
                                Button(fmt.t("Monthly")) { saveVendor(id: "", cadence: .monthly, remove: false) }
                                Button(fmt.t("Yearly")) { saveVendor(id: "", cadence: .yearly, remove: false) }
                            } label: { Label(fmt.t("Mark as recurring"), systemImage: "arrow.triangle.2.circlepath") }
                            if !vendors.isEmpty {
                                Menu {
                                    ForEach(vendors) { item in
                                        Button(item.name) { saveVendor(id: item.id, cadence: item.cadence, remove: false) }
                                    }
                                } label: { Label(fmt.t("Same payee as"), systemImage: "person.2") }
                            }
                        }
                    }
                    LabeledContent(fmt.t("Activity & sync")) {
                        VStack(alignment: .trailing, spacing: 2) {
                            switch tx.pandleStatus {
                            case "confirmed":
                                Text("✓ \(fmt.t("Confirmed in Pandle"))").font(.system(size: 11.5)).foregroundColor(.green)
                                if !tx.pandleBankTransactionId.isEmpty {
                                    Text("\(fmt.t("Pandle transaction ID")): \(tx.pandleBankTransactionId)").font(.system(size: 10.5)).foregroundColor(.secondary)
                                }
                            case "error":
                                Text("! \(fmt.t("Sync error"))").font(.system(size: 11.5, weight: .bold)).foregroundColor(.red)
                                if !tx.pandleLastError.isEmpty {
                                    Text(tx.pandleLastError).font(.system(size: 10.5)).foregroundColor(.red).multilineTextAlignment(.trailing)
                                }
                                Text(fmt.t("Nothing was lost — fix the issue and sync again.")).font(.system(size: 10.5)).foregroundColor(.secondary).multilineTextAlignment(.trailing)
                            case "matched":
                                Text(fmt.t("Matched to an existing Pandle transaction")).font(.system(size: 11.5)).foregroundColor(.blue).multilineTextAlignment(.trailing)
                            default:
                                Text(fmt.t("Not synced to Pandle yet")).font(.system(size: 11.5)).foregroundColor(.secondary)
                            }
                        }
                    }
                }
            }
            if isOwner {
                Section {
                    Button { save(createRule: false) } label: { Text(model.busy == "drawer" ? fmt.t("Saving…") : fmt.t("Save")).frame(maxWidth: .infinity) }
                        .buttonStyle(.borderedProminent).disabled(model.busy == "drawer")
                }
            }
        }
        .formStyle(.grouped)
        .onAppear { load() }
        .onChange(of: tx.id) { _ in load() }

        if asSheet {
            NavigationStack {
                content
                    .navigationTitle(fmt.t("Transaction details"))
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button(fmt.t("Close")) { model.selectedTxId = nil } }
                    }
            }
        } else {
            VStack(spacing: 0) {
                HStack(spacing: 8) {
                    Button { model.selectedTxId = nil } label: { Image(systemName: "xmark") }.buttonStyle(.plain)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(fmt.t("Transaction details")).font(.system(size: 14, weight: .bold))
                        Text(fmt.date(tx.bookingDate)).font(.system(size: 11)).foregroundColor(.secondary)
                    }
                    Spacer()
                    Button { step(-1) } label: { Image(systemName: "chevron.up") }.buttonStyle(.plain)
                    Button { step(1) } label: { Image(systemName: "chevron.down") }.buttonStyle(.plain)
                }
                .padding(.horizontal, 14).padding(.vertical, 10)
                Divider()
                content
            }
        }
    }

    private var attachMenu: some View {
        Menu {
            PhotosPicker(selection: $photoItem, matching: .images) { Label(fmt.t("Photo library"), systemImage: "photo") }
                .simultaneousGesture(TapGesture().onEnded { model.pendingAttachTxId = tx.id })
            Button { model.pendingAttachTxId = tx.id; showFileImporter = true } label: { Label(fmt.t("Choose a file"), systemImage: "doc") }
        } label: { Label(fmt.t("Upload new"), systemImage: "paperclip").font(.system(size: 12, weight: .bold)) }
        .menuStyle(.borderlessButton).fixedSize()
    }

    private func load() {
        category = tx.category.isEmpty ? tx.categoryAuto : tx.category
        vat = tx.vatCode
        review = tx.effectiveReviewStatus
        orderId = tx.linkedOrderId
        note = tx.note
        ruleKeyword = bankSuggestRuleKeyword(tx)
        showLibraryPicker = false
    }

    /// Resolves the account name from the connection's accounts when available.
    private var bankAccountLabel: String {
        if let account = connections.flatMap(\.accounts).first(where: { $0.id == tx.accountId }) {
            return account.currency.isEmpty ? account.name : "\(account.name) · \(account.currency)"
        }
        return tx.accountId.isEmpty ? "—" : tx.accountId
    }

    private func bankIsoDayString(_ date: Date) -> String {
        let formatter = DateFormatter(); formatter.dateFormat = "yyyy-MM-dd"; formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter.string(from: date)
    }

    private func bankDataRow(_ label: String, _ value: String) -> some View {
        LabeledContent(label) {
            Text(value).font(.system(size: 11.5)).foregroundColor(.secondary).multilineTextAlignment(.trailing).textSelection(.enabled)
        }
        .font(.system(size: 11.5))
    }

    private func step(_ delta: Int) {
        let ids = d.visible.map(\.id)
        guard let index = ids.firstIndex(of: tx.id) else { return }
        let next = index + delta
        if ids.indices.contains(next) { model.selectedTxId = ids[next] }
    }

    private func save(createRule: Bool) {
        guard let manager = model.manager else { return }
        let keyword = ruleKeyword.trimmingCharacters(in: .whitespaces).lowercased()
        let category = self.category, vat = self.vat, review = self.review, orderId = self.orderId, note = self.note, tx = self.tx, fmt = self.fmt
        model.run("drawer") {
            try await manager.bankUpdateTransaction(transactionId: tx.id, category: category, vatCode: vat, note: note, reviewStatus: review)
            if orderId != tx.linkedOrderId {
                if !tx.linkedOrderId.isEmpty { try await manager.bankLinkOrder(transactionId: tx.id, orderId: "") }
                if !orderId.isEmpty { try await manager.bankLinkOrder(transactionId: tx.id, orderId: orderId) }
            }
            if createRule, !category.isEmpty, keyword.count >= 2 {
                try await manager.bankSaveRule(keyword: keyword, category: category)
                return fmt.t("Category saved and rule created.")
            }
            return fmt.t("Transaction saved.")
        }
    }

    /// Marks this payee as recurring, merges it into an existing vendor, or drops it.
    private func saveVendor(id: String, cadence: BankRecurringCadence?, remove: Bool) {
        guard let manager = model.manager else { return }
        let key = bankRecurringMerchantKey(tx), name = tx.merchant, fmt = self.fmt
        model.run("vendor-\(tx.id)") {
            if remove {
                try await manager.bankDeleteVendor(vendorId: id, key: key)
                return fmt.t("No longer treated as recurring.")
            }
            try await manager.bankSaveVendor(vendorId: id, name: id.isEmpty ? name : "", key: key, cadence: (cadence ?? .monthly).rawValue)
            return id.isEmpty ? fmt.t("Marked as recurring.") : fmt.t("Merged with the other payments.")
        }
    }

    private func openReceipt() {
        guard let manager = model.manager else { return }
        let path = tx.receiptPath
        Task {
            if let url = try? await manager.bankReceiptURL(path: path) { await MainActor.run { openURL(url) } }
        }
    }

    private func removeReceipt() {
        guard let manager = model.manager else { return }
        let id = tx.id, fmt = self.fmt
        model.run("receipt-\(id)") { try await manager.bankRemoveReceipt(transactionId: id); return fmt.t("Invoice removed.") }
    }
}

/// Picker title for an order — customer, plus the design when it says something.
func bankOrderPickTitle(_ order: Siparis) -> String {
    order.designName.isEmpty || order.designName == "Untitled design" ? order.customerName : "\(order.customerName) · \(order.designName)"
}

// MARK: - Split transaction (detail panel, spending)

/// One editable row of the split editor. Amounts stay text until Save so the
/// owner can type freely; the live total keeps the truth visible.
private struct BankSplitDraftLine: Identifiable, Equatable {
    let id = UUID()
    var amount: String
    var category: String
    var vatCode: String
    var note: String
    var orderId: String
}

/// The "Split transaction" area of the detail panel. Separate struct on
/// purpose — deeply nested SwiftUI bodies overflow the stack on real iPhones.
struct BankSplitSection: View {
    let tx: StudioBankTransaction
    @ObservedObject var model: BankScreenModel
    let fmt: BankFormat
    let isOwner: Bool
    let categoryOptions: [String]
    let orders: [Siparis]

    @State private var editing = false
    @State private var drafts: [BankSplitDraftLine] = []

    private var required: Double { abs(tx.amount) }
    private var total: Double { drafts.reduce(0) { $0 + parsedAmount($1.amount) } }
    /// Same tolerance as the server: the lines must sum EXACTLY (±0.005).
    private var balanced: Bool { abs(total - required) <= 0.005 }
    private var busy: Bool { model.busy == "splits" }

    private func parsedAmount(_ text: String) -> Double {
        Double(text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")) ?? 0
    }

    var body: some View {
        if isOwner || !tx.splits.isEmpty {
            Section {
                splitContent
                    .onChange(of: tx.id) { _ in editing = false; drafts = [] }
            } header: { Text("⑃ \(fmt.t("Split transaction"))") }
        }
    }

    @ViewBuilder private var splitContent: some View {
        if editing {
            editor
        } else if !tx.splits.isEmpty {
            summary
        } else {
            Button { startEditor() } label: {
                Label(fmt.t("Split this transaction into several categories or orders"), systemImage: "arrow.triangle.branch")
                    .font(.system(size: 12, weight: .semibold))
            }
        }
    }

    /// Saved lines: amount, category chip, VAT label, order label, note.
    private var summary: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Text("⑃ \(fmt.t("Split transaction")) (\(tx.splits.count))").font(.system(size: 12.5, weight: .bold))
                Spacer()
                if isOwner {
                    Button(fmt.t("Edit")) { startEditor() }
                        .buttonStyle(.plain).font(.system(size: 12, weight: .bold)).foregroundColor(.accentColor)
                    Button(fmt.t("Remove")) { removeSplits() }
                        .buttonStyle(.plain).font(.system(size: 12, weight: .bold)).foregroundColor(.red).disabled(busy)
                }
            }
            ForEach(Array(tx.splits.enumerated()), id: \.offset) { _, row in
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(fmt.money(row.amount, tx.currency)).font(.system(size: 12, weight: .bold)).monospacedDigit()
                        BankChip(text: fmt.t(row.category), color: bankCategoryColor(row.category))
                        if !row.vatCode.isEmpty {
                            Text(fmt.t(bankVatLabel(row.vatCode))).font(.system(size: 10.5)).foregroundColor(.secondary).lineLimit(1)
                        }
                    }
                    if !row.orderLabel.isEmpty { Text("⛓ \(row.orderLabel)").font(.system(size: 10.5)).foregroundColor(.accentColor).lineLimit(1) }
                    if !row.note.isEmpty { Text(row.note).font(.system(size: 10.5)).foregroundColor(.secondary).lineLimit(1) }
                }
            }
        }
        .padding(.vertical, 2)
    }

    private var editor: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach($drafts) { $row in
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        TextField(fmt.t("Amount"), text: $row.amount)
                            .textFieldStyle(.roundedBorder).font(.system(size: 12)).monospacedDigit().frame(width: 84)
                        Picker("", selection: $row.category) {
                            Text("\(fmt.t("Category"))…").tag("")
                            ForEach(categoryOptions, id: \.self) { Text(fmt.t($0)).tag($0) }
                        }
                        .labelsHidden().frame(maxWidth: .infinity)
                        if drafts.count > 2 {
                            Button { drafts.removeAll { $0.id == row.id } } label: { Image(systemName: "xmark.circle.fill").foregroundColor(.secondary) }
                                .buttonStyle(.plain)
                        }
                    }
                    HStack(spacing: 6) {
                        Picker("", selection: $row.vatCode) {
                            Text("\(fmt.t("VAT"))…").tag("")
                            ForEach(bankVatCodes, id: \.code) { Text(fmt.t($0.label)).tag($0.code) }
                        }
                        .labelsHidden().frame(maxWidth: .infinity)
                        Picker("", selection: $row.orderId) {
                            Text(fmt.t("Not linked")).tag("")
                            ForEach(orders, id: \.id) { order in Text(bankOrderPickTitle(order)).tag(order.id ?? "") }
                            if !row.orderId.isEmpty && !orders.contains(where: { $0.id == row.orderId }) { Text(fmt.t("Order")).tag(row.orderId) }
                        }
                        .labelsHidden().frame(maxWidth: .infinity)
                    }
                    TextField(fmt.t("Note"), text: $row.note).textFieldStyle(.roundedBorder).font(.system(size: 12))
                    Divider()
                }
            }
            Button { drafts.append(BankSplitDraftLine(amount: "0.00", category: "", vatCode: "", note: "", orderId: "")) } label: {
                Label(fmt.t("Add line"), systemImage: "plus").font(.system(size: 12, weight: .bold))
            }
            .buttonStyle(.plain).foregroundColor(.accentColor).disabled(drafts.count >= 12)
            HStack(spacing: 8) {
                // Live "total / required" — Save stays off until they match.
                Text("\(fmt.money(total, tx.currency)) / \(fmt.money(required, tx.currency))")
                    .font(.system(size: 12.5, weight: .bold)).monospacedDigit()
                    .foregroundColor(balanced ? .green : .red)
                Spacer()
                Button(fmt.t("Cancel")) { editing = false; drafts = [] }.disabled(busy)
                Button(busy ? fmt.t("Saving…") : fmt.t("Save split")) { save() }
                    .buttonStyle(.borderedProminent).disabled(!balanced || busy)
            }
            if !balanced {
                Text(fmt.t("Split lines must add up to the exact transaction amount.")).font(.system(size: 11)).foregroundColor(.red)
            }
        }
        .padding(.vertical, 4)
    }

    /// Seeds the editor: existing lines, or the full amount plus an empty line
    /// (mirror of the web's startSplitEditor).
    private func startEditor() {
        drafts = tx.splits.isEmpty
            ? [BankSplitDraftLine(amount: String(format: "%.2f", required), category: tx.effectiveCategory, vatCode: tx.vatCode, note: "", orderId: ""),
               BankSplitDraftLine(amount: "0.00", category: "", vatCode: "", note: "", orderId: "")]
            : tx.splits.map { BankSplitDraftLine(amount: String(format: "%.2f", $0.amount), category: $0.category, vatCode: $0.vatCode, note: $0.note, orderId: $0.orderId) }
        editing = true
    }

    private func save() {
        guard let manager = model.manager else { return }
        let payload: [[String: Any]] = drafts
            .filter { parsedAmount($0.amount) > 0 || !$0.category.isEmpty }
            .map { ["amount": parsedAmount($0.amount), "category": $0.category, "vatCode": $0.vatCode, "note": $0.note, "orderId": $0.orderId] }
        let txId = tx.id, fmt = self.fmt
        model.run("splits") {
            try await manager.bankSetSplits(transactionId: txId, splits: payload)
            await MainActor.run { editing = false; drafts = [] }
            return payload.isEmpty ? fmt.t("Split removed.") : fmt.t("Split saved.")
        }
    }

    private func removeSplits() {
        guard let manager = model.manager else { return }
        let txId = tx.id, fmt = self.fmt
        model.run("splits") {
            try await manager.bankSetSplits(transactionId: txId, splits: [])
            return fmt.t("Split removed.")
        }
    }
}

// MARK: - Incoming ↔ order payment (detail panel, incoming)

/// The "Match to" area for money coming in: classify the kind, and for order
/// payments match the bank line to the payment already recorded on the order
/// — or record a new one, exactly once. Separate struct on purpose (stack).
struct BankIncomingMatchSection: View {
    let tx: StudioBankTransaction
    @ObservedObject var model: BankScreenModel
    let fmt: BankFormat
    let isOwner: Bool
    let orders: [Siparis]

    @State private var kind = ""
    @State private var orderId = ""
    @State private var orderSearch = ""
    @State private var suggest: BankIncomingMatchResult?
    @State private var confirmCreate = false

    private var busy: Bool { model.busy == "incoming" }

    private var rankedOrders: [Siparis] {
        let ranked = bankRankOrders(for: tx, orders: orders.filter { $0.id != nil }).map(\.order)
        let needle = orderSearch.trimmingCharacters(in: .whitespaces).lowercased()
        let filtered = needle.isEmpty ? ranked : ranked.filter { "\($0.customerName) \($0.designName)".lowercased().contains(needle) }
        return Array(filtered.prefix(40))
    }

    var body: some View {
        Section {
            Picker(fmt.t("Match to"), selection: $kind) {
                Text(fmt.t("Unclassified income")).tag("")
                ForEach(bankIncomingKinds, id: \.code) { Text(fmt.t($0.label)).tag($0.code) }
            }
            .disabled(!isOwner || busy)
            .onAppear(perform: load)
            .onChange(of: tx.id) { _ in load() }
            .onChange(of: tx.incomingKind) { newValue in kind = newValue }
            .onChange(of: kind) { newValue in
                guard newValue != tx.incomingKind else { return }
                if newValue == "order_payment" { return } // saved through the order flow below
                saveKind(newValue)
            }
            if bankNonRevenueIncomingKinds.contains(kind) {
                Text(fmt.t("Not counted as revenue.")).font(.system(size: 11)).foregroundColor(.secondary)
            }
            if kind == "order_payment" {
                if tx.incomingKind == "order_payment", !tx.linkedPaymentId.isEmpty {
                    linkedView
                } else if isOwner {
                    matchFlow
                }
            }
        } header: { Text("⇥ \(fmt.t("Match to"))") }
    }

    private var linkedView: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("✓ \(fmt.t("Matched to the order's existing payment — nothing was recorded twice."))")
                .font(.system(size: 11.5, weight: .semibold)).foregroundColor(.green)
            if !tx.linkedOrderLabel.isEmpty {
                Text("⛓ \(tx.linkedOrderLabel)").font(.system(size: 11.5)).foregroundColor(.accentColor).lineLimit(2)
            }
            if isOwner {
                Button(fmt.t("Unlink")) { callIncoming("unlink") }
                    .buttonStyle(.plain).font(.system(size: 12, weight: .bold)).foregroundColor(.red).disabled(busy)
            }
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder private var matchFlow: some View {
        TextField(fmt.t("Search orders"), text: $orderSearch).textFieldStyle(.roundedBorder).font(.system(size: 12))
        Picker(fmt.t("Order"), selection: $orderId) {
            Text("\(fmt.t("Order"))…").tag("")
            ForEach(rankedOrders, id: \.id) { order in Text(bankOrderPickTitle(order)).tag(order.id ?? "") }
            if !orderId.isEmpty && !rankedOrders.contains(where: { $0.id == orderId }) { Text(fmt.t("Order")).tag(orderId) }
        }
        .onChange(of: orderId) { _ in suggest = nil }
        Button { callIncoming("suggest") } label: {
            Label(busy ? fmt.t("Loading…") : fmt.t("Find matching payment"), systemImage: "magnifyingglass").font(.system(size: 12, weight: .semibold))
        }
        .disabled(orderId.isEmpty || busy)
        if let suggest {
            ForEach(suggest.candidates) { candidate in
                HStack(spacing: 8) {
                    Text(fmt.money(candidate.amount, tx.currency)).font(.system(size: 12, weight: .bold)).monospacedDigit()
                    Text(candidateDetail(candidate)).font(.system(size: 11)).foregroundColor(.secondary).lineLimit(1)
                    Spacer()
                    Button("✓ \(fmt.t("Match this payment"))") { callIncoming("link", paymentId: candidate.id) }
                        .buttonStyle(.plain).font(.system(size: 11.5, weight: .bold)).foregroundColor(.green).disabled(busy)
                }
            }
            if suggest.candidates.isEmpty {
                Text(fmt.t("No unmatched payment with this amount on the order.")).font(.system(size: 11.5)).foregroundColor(.secondary)
            }
            Button { confirmCreate = true } label: {
                Label(fmt.t("Record as a new payment on this order"), systemImage: "plus").font(.system(size: 12, weight: .semibold))
            }
            .disabled(busy)
            .alert("\(fmt.t("Record a NEW payment on this order?")) (\(fmt.money(tx.amount, tx.currency)))", isPresented: $confirmCreate) {
                Button(fmt.t("Cancel"), role: .cancel) {}
                Button(fmt.t("Record as a new payment on this order")) { callIncoming("create") }
            }
        }
    }

    private func load() {
        kind = tx.incomingKind
        orderId = tx.linkedOrderId
        orderSearch = ""
        suggest = nil
    }

    private func candidateDetail(_ candidate: BankPaymentCandidate) -> String {
        var parts: [String] = []
        if !candidate.method.isEmpty { parts.append(candidate.method) }
        if candidate.dateMs > 0 {
            let formatter = DateFormatter(); formatter.dateFormat = "yyyy-MM-dd"; formatter.locale = Locale(identifier: "en_US_POSIX")
            parts.append(fmt.date(formatter.string(from: Date(timeIntervalSince1970: candidate.dateMs / 1000)), short: true))
        }
        if !candidate.note.isEmpty { parts.append(candidate.note) }
        return parts.joined(separator: " · ")
    }

    private func saveKind(_ value: String) {
        guard let manager = model.manager else { return }
        let txId = tx.id, fmt = self.fmt
        model.run("incoming") {
            try await manager.bankSetIncomingKind(transactionId: txId, kind: value)
            return fmt.t("Transaction saved.")
        }
    }

    private func callIncoming(_ mode: String, paymentId: String? = nil) {
        guard let manager = model.manager else { return }
        let txId = tx.id, orderId = self.orderId, fmt = self.fmt
        model.run("incoming") {
            let result = try await manager.bankMatchIncoming(transactionId: txId, mode: mode, orderId: orderId, paymentId: paymentId)
            return await MainActor.run { () -> String? in
                if mode == "suggest" || result.needsChoice {
                    suggest = result
                    return nil
                }
                if result.linked || result.created {
                    suggest = nil
                    return result.created ? fmt.t("Payment recorded on the order.") : fmt.t("Matched to the order's existing payment — nothing was recorded twice.")
                }
                if result.unlinked {
                    suggest = nil
                    return fmt.t("Match removed — the payment entry stays on the order.")
                }
                return nil
            }
        }
    }
}

// MARK: - Receipt from the central Files library

/// Inline picker over the workspace's Files library: the chosen invoice is
/// attached by REFERENCE (fileRecordId) — nothing is uploaded twice.
struct BankLibraryPicker: View {
    let tx: StudioBankTransaction
    @ObservedObject var model: BankScreenModel
    let fmt: BankFormat
    let onClose: () -> Void

    @State private var files: [LibraryFile] = []
    @State private var search = ""
    @State private var loading = true
    @State private var loadError = ""

    private var shown: [LibraryFile] {
        let needle = search.trimmingCharacters(in: .whitespaces).lowercased()
        let live = files.filter { $0.trashedAtMs <= 0 }
        let filtered = needle.isEmpty ? live : live.filter { "\($0.displayName) \($0.fileName)".lowercased().contains(needle) }
        return Array(filtered.prefix(40))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(fmt.t("Choose from Files")).font(.system(size: 12.5, weight: .bold))
                Spacer()
                Button(action: onClose) { Image(systemName: "xmark") }.buttonStyle(.plain)
            }
            TextField(fmt.t("Search files"), text: $search).textFieldStyle(.roundedBorder).font(.system(size: 12))
            if loading {
                Text(fmt.t("Loading…")).font(.system(size: 12)).foregroundColor(.secondary)
            } else if !loadError.isEmpty {
                Text(loadError).font(.system(size: 11.5)).foregroundColor(.red)
            } else if shown.isEmpty {
                Text(fmt.t("The library is empty.")).font(.system(size: 12)).foregroundColor(.secondary)
            } else {
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(shown) { file in
                            Button { attach(file) } label: {
                                HStack(spacing: 8) {
                                    BankFileBadge(name: file.fileName, size: 22)
                                    Text(file.displayName.isEmpty ? file.fileName : file.displayName).font(.system(size: 12)).lineLimit(1)
                                    Spacer()
                                }
                                .padding(.vertical, 4).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain).disabled(model.busy == "receipt-pick")
                        }
                    }
                }
                .frame(maxHeight: 180)
            }
            Text(fmt.t("The file is referenced, not copied — an invoice already on a purchase is never uploaded twice."))
                .font(.system(size: 10.5)).foregroundColor(.secondary)
        }
        .padding(.vertical, 4)
        .onAppear(perform: loadFiles)
    }

    private func loadFiles() {
        guard let manager = model.manager else { return }
        loading = true; loadError = ""
        Task {
            do {
                let list = try await manager.loadLibraryFiles(trashed: false)
                await MainActor.run { files = list; loading = false }
            } catch {
                await MainActor.run { loadError = error.localizedDescription; loading = false }
            }
        }
    }

    private func attach(_ file: LibraryFile) {
        guard let manager = model.manager else { return }
        let txId = tx.id, fileId = file.id, fmt = self.fmt
        model.run("receipt-pick") {
            try await manager.bankAttachLibraryReceipt(transactionId: txId, fileRecordId: fileId)
            await MainActor.run { onClose() }
            return fmt.t("Receipt attached from Files.")
        }
    }
}

// MARK: - Recurring

private struct BankRecurringSection: View {
    let d: BankDerived
    @ObservedObject var model: BankScreenModel
    let fmt: BankFormat
    let background: Color
    let isPhone: Bool

    var body: some View {
        let columns = [GridItem(.adaptive(minimum: isPhone ? 150 : 215), spacing: 12)]
        LazyVGrid(columns: columns, spacing: 12) {
            BankStatTile(title: fmt.t("Recurring spend"), value: "\(fmt.money(d.recurringMonthly)) / \(fmt.t("month"))", detail: fmt.t("Monthly equivalent of active subscriptions"), detailColor: .secondary, icon: "calendar", tint: .orange, background: background)
            BankStatTile(title: fmt.t("Active recurring"), value: "\(d.activeRecurring.count)", detail: fmt.t("Paying on schedule"), detailColor: .secondary, icon: "checkmark", tint: .green, background: background)
            BankStatTile(title: fmt.t("Possibly cancelled"), value: "\(d.cancelledRecurring.count)", detail: fmt.t("A payment looks missed"), detailColor: .secondary, icon: "pause", tint: .gray, background: background)
            BankStatTile(title: fmt.t("Price changed"), value: "\(d.priceChanged)", detail: fmt.t("Latest charge differs from usual"), detailColor: .secondary, icon: "arrow.up.arrow.down", tint: .red, background: background)
        }
        VStack(alignment: .leading, spacing: 0) {
            HStack { BankCardTitle(icon: "arrow.triangle.2.circlepath", title: fmt.t("Recurring payments")); Spacer(); Text("\(d.recurring.count)").font(.system(size: 12)).foregroundColor(.secondary) }
                .padding(.horizontal, 16).padding(.vertical, 12)
            Divider()
            if d.recurring.isEmpty { Text(fmt.t("No recurring payments detected yet.")).font(.system(size: 12.5)).foregroundColor(.secondary).padding(20) }
            ForEach(d.recurring) { item in
                BankRecurringRow(item: item, fmt: fmt, compact: isPhone, onShow: { model.txSearch = item.key; model.txAttention = .none; model.txFlow = .out; model.tab = .transactions })
                Divider().opacity(0.5)
            }
        }
        .background(background).cornerRadius(14)
    }
}

private struct BankRecurringRow: View {
    let item: BankRecurringSpend
    let fmt: BankFormat
    let compact: Bool
    let onShow: () -> Void

    /// "Monthly · around the 5. · last 12 Aug · next 12 Sep" — the web's
    /// cadence cell first line, with the dates the web keeps in own columns.
    private var cadenceLine: String {
        var line = fmt.t(item.cadence == .weekly ? "Weekly" : item.cadence == .yearly ? "Yearly" : "Monthly")
        if let day = item.expectedDayOfMonth { line += " · \(fmt.t("around the")) \(day)." }
        line += " · \(fmt.t("last")) \(fmt.date(item.lastDate, short: true)) · \(fmt.t("next")) \(fmt.date(item.nextExpected, short: true))"
        return line
    }

    /// "Detected from 6 payments · £12–£14 · Confidence: High" with the web's
    /// green/blue/amber confidence colours. Range only when the amounts wander.
    private var detailLine: Text {
        var lead = "\(fmt.t("Detected from")) \(item.occurrences) \(fmt.t("payments").lowercased())"
        if item.amountMax - item.amountMin > 0.01 {
            lead += " · \(fmt.money(item.amountMin, item.currency))–\(fmt.money(item.amountMax, item.currency))"
        }
        lead += " · "
        let label = item.confidence == .high ? "High" : item.confidence == .medium ? "Medium" : "Low"
        let color: Color = item.confidence == .high ? .green : item.confidence == .medium ? .blue : .orange
        return Text(lead).foregroundColor(.secondary)
            + Text("\(fmt.t("Confidence")): \(fmt.t(label))").foregroundColor(color).fontWeight(.bold)
    }

    var body: some View {
        HStack(spacing: 10) {
            BankAvatar(name: item.merchant, size: 30)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(item.merchant).font(.system(size: 13, weight: .bold)).lineLimit(1)
                    if item.manual { BankChip(text: fmt.t("Marked by you"), color: .accentColor) }
                if !item.active { BankChip(text: fmt.t("Possibly cancelled"), color: .orange) }
                    if let change = item.priceChange {
                        BankChip(text: "\(change.current > change.previous ? "↑" : "↓") \(fmt.money(change.previous, item.currency)) → \(fmt.money(change.current, item.currency))", color: change.current > change.previous ? .red : .green)
                    }
                }
                if item.active {
                    // Mirrors the web's two-line cadence cell (report §23):
                    // cadence + landing day, then how the pattern was detected.
                    Text(cadenceLine).font(.system(size: 11)).foregroundColor(.secondary).lineLimit(1)
                    detailLine.font(.system(size: 10.5)).lineLimit(1)
                } else {
                    Text("\(fmt.t(item.cadence == .weekly ? "Weekly" : item.cadence == .yearly ? "Yearly" : "Monthly")) · \(item.occurrences)× · \(fmt.t("last")) \(fmt.date(item.lastDate, short: true)) · \(fmt.t("next")) \(fmt.date(item.nextExpected, short: true))")
                        .font(.system(size: 11)).foregroundColor(.secondary).lineLimit(1)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 1) {
                Text(fmt.money(item.typicalAmount, item.currency)).font(.system(size: 13, weight: .bold)).monospacedDigit()
                Text("≈ \(fmt.money(item.monthlyEquivalent, item.currency)) / \(fmt.t("month"))").font(.system(size: 10)).foregroundColor(.secondary)
            }
            if !compact { Button(action: onShow) { Image(systemName: "magnifyingglass") }.buttonStyle(.plain).foregroundColor(.secondary) }
        }
        .opacity(item.active ? 1 : 0.65)
        .padding(.horizontal, compact ? 12 : 16).padding(.vertical, 9)
        .contentShape(Rectangle()).onTapGesture(perform: onShow)
    }
}

// MARK: - Receipts

private struct BankReceiptsSection: View {
    let d: BankDerived
    @ObservedObject var model: BankScreenModel
    let fmt: BankFormat
    let background: Color
    let isPhone: Bool
    let isOwner: Bool
    let waiting: [StudioBankWaitingReceipt]
    @Binding var showFileImporter: Bool
    @Binding var photoItem: PhotosPickerItem?

    private var rows: [StudioBankTransaction] {
        d.spending.filter { tx in
            switch model.receiptFilter {
            case .all: return true
            case .matched: return tx.hasReceipt
            case .missing: return !tx.hasReceipt && !tx.receiptNotNeeded
            }
        }
    }

    var body: some View {
        let columns = [GridItem(.adaptive(minimum: isPhone ? 150 : 215), spacing: 12)]
        LazyVGrid(columns: columns, spacing: 12) {
            BankStatTile(title: fmt.t("Receipts matched"), value: "\(d.matchedReceipts)", detail: d.spending.isEmpty ? nil : "\(Int(Double(d.matchedReceipts) / Double(d.spending.count) * 100))% \(fmt.t("of")) \(d.spending.count) \(fmt.t("transactions"))", detailColor: .secondary, icon: "checkmark", tint: .green, background: background)
            BankStatTile(title: fmt.t("Missing receipts"), value: "\(d.missingReceipt.count)", detail: nil, detailColor: .secondary, icon: "exclamationmark", tint: .red, background: background, link: (fmt.t("View missing"), { model.receiptFilter = .missing }))
            BankStatTile(title: fmt.t("No receipt needed"), value: "\(d.notNeededReceipts + d.incomingCount)", detail: "\(d.incomingCount) \(fmt.t("incoming")) · \(d.notNeededReceipts) \(fmt.t("marked"))", detailColor: .secondary, icon: "minus", tint: .gray, background: background)
            if isOwner {
                VStack(alignment: .leading, spacing: 6) {
                    Text(fmt.t("Match a receipt")).font(.system(size: 12, weight: .semibold)).foregroundColor(.purple)
                    Text(fmt.t("Upload a photo or scan — NivaDesk reads the total and date and finds the transaction.")).font(.system(size: 11.5)).foregroundColor(.secondary)
                    Spacer(minLength: 0)
                    Menu {
                        PhotosPicker(selection: $photoItem, matching: .images) { Label(fmt.t("Photo library"), systemImage: "photo") }
                            .simultaneousGesture(TapGesture().onEnded { model.pendingAttachTxId = "" })
                        Button { model.pendingAttachTxId = ""; showFileImporter = true } label: { Label(fmt.t("Choose a file"), systemImage: "doc") }
                    } label: { Label(model.busy == "ocr" ? fmt.t("Reading the receipt…") : fmt.t("Upload receipt"), systemImage: "camera.viewfinder").font(.system(size: 12, weight: .bold)) }
                    .menuStyle(.borderlessButton).fixedSize().disabled(model.busy == "ocr")
                }
                .padding(14).frame(maxWidth: .infinity, minHeight: 118, alignment: .leading).background(background).cornerRadius(14)
            }
        }
        if !waiting.isEmpty {
            BankWaitingCard(waiting: waiting, d: d, model: model, fmt: fmt, isOwner: isOwner, isPhone: isPhone)
        }
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Text(fmt.t("Receipts")).font(.system(size: 14.5, weight: .bold))
                Picker("", selection: $model.receiptFilter) {
                    Text(fmt.t("All")).tag(BankReceiptFilter.all)
                    Text(fmt.t("Missing")).tag(BankReceiptFilter.missing)
                    Text(fmt.t("Matched")).tag(BankReceiptFilter.matched)
                }.pickerStyle(.segmented).frame(maxWidth: 240)
                Spacer()
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            Divider()
            if rows.isEmpty { Text(fmt.t("Nothing here.")).font(.system(size: 12.5)).foregroundColor(.secondary).padding(20) }
            ForEach(rows.prefix(60)) { tx in
                BankReceiptRow(tx: tx, model: model, fmt: fmt, isOwner: isOwner, compact: isPhone, showFileImporter: $showFileImporter, photoItem: $photoItem)
                Divider().opacity(0.5)
            }
            if rows.count > 60 { Text("\(fmt.t("Showing")) 60 / \(rows.count)").font(.system(size: 11.5)).foregroundColor(.secondary).padding(12) }
        }
        .background(background).cornerRadius(14)
    }
}

private struct BankReceiptRow: View {
    let tx: StudioBankTransaction
    @ObservedObject var model: BankScreenModel
    let fmt: BankFormat
    let isOwner: Bool
    let compact: Bool
    @Binding var showFileImporter: Bool
    @Binding var photoItem: PhotosPickerItem?

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(tx.merchant).font(.system(size: 13, weight: .bold)).lineLimit(1)
                HStack(spacing: 6) {
                    Text(fmt.date(tx.bookingDate, short: compact)).font(.system(size: 11)).foregroundColor(.secondary)
                    Text("−\(fmt.money(abs(tx.amount), tx.currency))").font(.system(size: 11.5, weight: .bold)).foregroundColor(.red).monospacedDigit()
                    if !tx.effectiveCategory.isEmpty { BankChip(text: fmt.t(tx.effectiveCategory), color: bankCategoryColor(tx.effectiveCategory)) }
                }
                if tx.hasReceipt {
                    HStack(spacing: 5) { BankFileBadge(name: tx.receiptName, size: 18); Text(tx.receiptName).font(.system(size: 10.5)).foregroundColor(.secondary).lineLimit(1) }
                }
            }
            Spacer()
            BankReceiptStatus(tx: tx, fmt: fmt)
            if isOwner && !tx.hasReceipt {
                Menu {
                    PhotosPicker(selection: $photoItem, matching: .images) { Label(fmt.t("Photo library"), systemImage: "photo") }
                        .simultaneousGesture(TapGesture().onEnded { model.pendingAttachTxId = tx.id })
                    Button { model.pendingAttachTxId = tx.id; showFileImporter = true } label: { Label(fmt.t("Choose a file"), systemImage: "doc") }
                    Divider()
                    Button(tx.receiptNotNeeded ? fmt.t("Needs receipt") : fmt.t("No receipt needed")) {
                        guard let manager = model.manager else { return }
                        let value = !tx.receiptNotNeeded
                        model.run("receipt-\(tx.id)") { try await manager.bankSetReceiptNotNeeded(transactionId: tx.id, value: value); return nil }
                    }
                } label: { Image(systemName: "paperclip.circle.fill").font(.system(size: 20)).foregroundColor(.accentColor) }
                .menuStyle(.borderlessButton).fixedSize()
            } else if tx.hasReceipt {
                Button { model.selectedTxId = tx.id } label: { Image(systemName: "chevron.right").foregroundColor(.secondary) }.buttonStyle(.plain)
            }
        }
        .padding(.horizontal, compact ? 12 : 16).padding(.vertical, 9)
        .contentShape(Rectangle()).onTapGesture { model.selectedTxId = tx.id }
    }
}

private struct BankWaitingCard: View {
    let waiting: [StudioBankWaitingReceipt]
    let d: BankDerived
    @ObservedObject var model: BankScreenModel
    let fmt: BankFormat
    let isOwner: Bool
    let isPhone: Bool

    private func waitingSubtitle(_ item: StudioBankWaitingReceipt) -> String {
        var parts: [String] = [item.amount > 0 ? fmt.money(item.amount) : fmt.t("Amount unknown")]
        if !item.date.isEmpty { parts.append(fmt.date(item.date, short: true)) }
        parts.append(item.source == "chatgpt" ? "ChatGPT" : fmt.t("Web"))
        parts.append(item.ageDays == 0 ? fmt.t("today") : "\(item.ageDays) \(fmt.t("days waiting"))")
        return parts.joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "hourglass").foregroundColor(.orange)
                Text("\(fmt.t("Waiting for the bank")) (\(waiting.count))").font(.system(size: 14.5, weight: .bold))
                Spacer()
                if isOwner {
                    Button {
                        guard let manager = model.manager else { return }
                        model.run("waiting-match") {
                            let matched = try await manager.bankMatchWaitingReceipts()
                            return matched > 0 ? "\(matched) \(fmt.t("receipts attached."))" : fmt.t("No confident match yet — the payment may not have reached the bank.")
                        }
                    } label: { Label(model.busy == "waiting-match" ? fmt.t("Matching…") : fmt.t("Match now"), systemImage: "arrow.clockwise") }
                    .disabled(model.busy == "waiting-match")
                }
            }
            Text(fmt.t("Attached automatically when the payment arrives in the feed.")).font(.system(size: 11.5)).foregroundColor(.secondary)
            ForEach(waiting) { item in
                BankWaitingRow(item: item, subtitle: waitingSubtitle(item), d: d, model: model, fmt: fmt, isOwner: isOwner)
            }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.orange.opacity(0.07)).overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.orange.opacity(0.35))).cornerRadius(14)
    }
}

private struct BankWaitingRow: View {
    let item: StudioBankWaitingReceipt
    let subtitle: String
    let d: BankDerived
    @ObservedObject var model: BankScreenModel
    let fmt: BankFormat
    let isOwner: Bool

    private var picking: Bool { model.assignWaitingId == item.id }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                BankFileBadge(name: item.fileName, size: 28)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.fileName).font(.system(size: 12.5, weight: .bold)).lineLimit(1)
                    Text(subtitle).font(.system(size: 11)).foregroundColor(item.ageDays >= 14 ? .red : .secondary).lineLimit(2)
                }
                Spacer()
                if isOwner {
                    Button(picking ? fmt.t("Cancel") : fmt.t("Assign")) { model.assignWaitingId = picking ? nil : item.id }.font(.system(size: 12, weight: .bold))
                    Button(role: .destructive, action: remove) { Image(systemName: "trash") }.buttonStyle(.plain).foregroundColor(.secondary)
                }
            }
            if picking {
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(d.visible.filter(\.isSpending).prefix(40)) { tx in
                            BankWaitingPickRow(tx: tx, fmt: fmt, exact: abs(abs(tx.amount) - item.amount) < 0.015) { assign(to: tx) }
                        }
                    }
                }.frame(maxHeight: 200)
            }
        }
        .padding(10).overlay(RoundedRectangle(cornerRadius: 10).stroke(item.ageDays >= 14 ? Color.red.opacity(0.4) : Color.gray.opacity(0.2)))
    }

    private func remove() {
        guard let manager = model.manager else { return }
        let id = item.id
        model.run("waiting-\(id)") { try await manager.bankDeleteWaitingReceipt(id: id); return nil }
    }

    private func assign(to tx: StudioBankTransaction) {
        guard let manager = model.manager else { return }
        let item = self.item, fmt = self.fmt
        model.run("waiting-\(item.id)") {
            try await manager.bankAssignInboxReceipt(inboxPath: item.storagePath, transactionId: tx.id, fileName: item.fileName)
            await MainActor.run { model.assignWaitingId = nil }
            return fmt.t("Invoice attached.")
        }
    }
}

private struct BankWaitingPickRow: View {
    let tx: StudioBankTransaction
    let fmt: BankFormat
    let exact: Bool
    let onPick: () -> Void
    var body: some View {
        Button(action: onPick) {
            HStack(spacing: 8) {
                Text(fmt.date(tx.bookingDate, short: true)).font(.system(size: 11)).foregroundColor(.secondary).frame(width: 56, alignment: .leading)
                Text(tx.merchant).font(.system(size: 12, weight: .semibold)).lineLimit(1)
                Spacer()
                Text("−" + fmt.money(abs(tx.amount), tx.currency)).font(.system(size: 12, weight: .bold)).monospacedDigit().foregroundColor(exact ? .green : .primary)
            }.padding(.vertical, 5).contentShape(Rectangle())
        }.buttonStyle(.plain)
    }
}

private struct BankOcrCandidateRow: View {
    let candidate: BankReceiptCandidate
    let fmt: BankFormat
    let canAttach: Bool
    let busy: Bool
    let onAttach: () -> Void

    var body: some View {
        let name = candidate.counterparty.isEmpty ? candidate.description : candidate.counterparty
        let amount = "−" + fmt.money(abs(candidate.amount), candidate.currency)
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(.system(size: 12.5, weight: .bold)).lineLimit(1)
                Text(fmt.date(candidate.bookingDate)).font(.system(size: 10.5)).foregroundColor(.secondary)
            }
            Spacer()
            Text(amount).font(.system(size: 12.5, weight: .bold)).foregroundColor(.red).monospacedDigit()
            Text("\(min(99, candidate.score))%").font(.system(size: 10.5, weight: .bold)).foregroundColor(.secondary)
            if canAttach { Button(fmt.t("Attach"), action: onAttach).disabled(busy) }
        }
        .padding(8).overlay(RoundedRectangle(cornerRadius: 9).stroke(Color.gray.opacity(0.2)))
    }
}

private struct BankOcrCard: View {
    let ocr: BankOcrState
    @ObservedObject var model: BankScreenModel
    let fmt: BankFormat
    let background: Color
    let isOwner: Bool

    private func attach(_ candidate: BankReceiptCandidate) {
        guard let manager = model.manager else { return }
        let ocr = self.ocr, fmt = self.fmt
        model.run("ocr-assign") {
            try await manager.bankAssignInboxReceipt(inboxPath: ocr.inboxPath, transactionId: candidate.transactionId, fileName: ocr.fileName)
            await MainActor.run { model.ocr = nil }
            return fmt.t("Invoice attached.")
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                BankFileBadge(name: ocr.fileName, size: 24)
                Text(ocr.fileName).font(.system(size: 13, weight: .bold)).lineLimit(1)
                if ocr.amount > 0 {
                    Text("\(fmt.t("Detected")): \(fmt.money(ocr.amount))\(ocr.date.isEmpty ? "" : " · \(ocr.date)")").font(.system(size: 12)).foregroundColor(.secondary)
                } else {
                    Text(fmt.t("No amount detected on the receipt.")).font(.system(size: 12)).foregroundColor(.secondary)
                }
                Spacer()
                Button {
                    guard let manager = model.manager else { return }
                    let path = ocr.inboxPath
                    Task { await manager.bankDiscardInboxUpload(inboxPath: path) }
                    model.ocr = nil
                } label: { Image(systemName: "xmark") }.buttonStyle(.plain)
            }
            if ocr.candidates.isEmpty {
                Text(fmt.t("No matching transaction yet — card payments usually reach the bank feed 1–3 days later.")).font(.system(size: 12.5)).foregroundColor(.secondary)
            }
            ForEach(ocr.candidates) { candidate in
                BankOcrCandidateRow(candidate: candidate, fmt: fmt, canAttach: isOwner, busy: model.busy == "ocr-assign") { attach(candidate) }
            }
            if isOwner && ocr.amount > 0 {
                Button {
                    guard let manager = model.manager else { return }
                    model.run("ocr-queue") {
                        try await manager.bankQueueInboxReceipt(inboxPath: ocr.inboxPath, fileName: ocr.fileName, amount: ocr.amount, date: ocr.date)
                        await MainActor.run { model.ocr = nil; model.tab = .receipts }
                        return fmt.t("Receipt saved — it will be attached when the payment reaches the bank.")
                    }
                } label: {
                    Label(ocr.candidates.isEmpty ? fmt.t("Keep waiting for the bank") : fmt.t("None of these — keep waiting for the bank"), systemImage: "hourglass")
                }
                .buttonStyle(.bordered).tint(ocr.candidates.isEmpty ? .accentColor : .secondary).disabled(model.busy == "ocr-queue")
            }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading).background(background).cornerRadius(14)
    }
}

// MARK: - Rules

private struct BankRulesSection: View {
    let d: BankDerived
    let rules: [StudioBankRule]
    let categoryTax: [String: String]
    let categoryOptions: [String]
    @ObservedObject var model: BankScreenModel
    let fmt: BankFormat
    let background: Color
    let isPhone: Bool
    let isOwner: Bool

    private func ruleName(_ rule: StudioBankRule) -> String { "\(rule.keyword.prefix(1).uppercased())\(rule.keyword.dropFirst()) \(fmt.t(rule.category)) \(fmt.t("Rule"))" }
    private func appliesTo(_ txType: String) -> String {
        guard let meta = bankTxTypeMeta(txType) else { return "—" }
        if txType == "PURCHASE" || txType == "POS" { return fmt.t("Card spending") }
        if txType == "DIRECT_DEBIT" { return "\(fmt.t("Direct Debit")) (DD)" }
        return meta.translate ? fmt.t(meta.label) : meta.label
    }

    var body: some View {
        let needle = model.ruleSearch.trimmingCharacters(in: .whitespaces).lowercased()
        let shown = needle.isEmpty ? rules : rules.filter { "\($0.keyword) \($0.category) \(ruleName($0))".lowercased().contains(needle) }
        let columns = [GridItem(.adaptive(minimum: isPhone ? 150 : 215), spacing: 12)]
        LazyVGrid(columns: columns, spacing: 12) {
            BankStatTile(title: fmt.t("Active rules"), value: "\(rules.count)", detail: fmt.t("Rules running"), detailColor: .secondary, icon: "checkmark", tint: .green, background: background)
            BankStatTile(title: fmt.t("Suggested rules"), value: "\(d.suggestedRules.count)", detail: fmt.t("Ready to review"), detailColor: .secondary, icon: "sparkles", tint: .purple, background: background)
            BankStatTile(title: fmt.t("Auto-applied"), value: "\(d.autoApplied)", detail: "\(fmt.t("Transactions auto-categorised")) · \(d.periodLabel)", detailColor: .secondary, icon: "bolt", tint: .blue, background: background, link: (fmt.t("View activity"), { model.tab = .transactions }))
            BankStatTile(title: fmt.t("Needs review"), value: "\(d.uncategorised.count)", detail: fmt.t("Recent transactions"), detailColor: .secondary, icon: "exclamationmark", tint: .orange, background: background, link: (fmt.t("View transactions"), { model.showAttention(.uncategorised) }))
        }
        if isOwner {
            HStack(spacing: 8) {
                Button { model.showNewRule.toggle() } label: { Label(fmt.t("New rule"), systemImage: "plus") }.buttonStyle(.borderedProminent)
                Button {
                    guard let manager = model.manager else { return }
                    let items = d.suggestedRules
                    model.run("rule-bulk") {
                        for item in items { try await manager.bankSaveRule(keyword: item.keyword, category: item.category) }
                        return fmt.t("Rules created.")
                    }
                } label: { Label(fmt.t("Bulk create suggested rules"), systemImage: "sparkles") }.disabled(d.suggestedRules.isEmpty || model.busy == "rule-bulk")
            }
            if model.showNewRule {
                HStack(spacing: 8) {
                    Text(fmt.t("If merchant contains")).font(.system(size: 12.5))
                    TextField(fmt.t("keyword"), text: $model.newRuleKeyword).textFieldStyle(.roundedBorder).frame(maxWidth: 200)
                    Text("→").foregroundColor(.secondary)
                    Picker("", selection: $model.newRuleCategory) {
                        Text("\(fmt.t("Category"))…").tag("")
                        ForEach(categoryOptions, id: \.self) { Text(fmt.t($0)).tag($0) }
                    }.frame(maxWidth: 200)
                    if let tax = categoryTax[model.newRuleCategory], !model.newRuleCategory.isEmpty { Text("\(fmt.t("VAT")): \(fmt.t(bankVatLabel(tax)))").font(.system(size: 11)).foregroundColor(.secondary) }
                    Spacer()
                    Button(fmt.t("Create rule")) {
                        guard let manager = model.manager else { return }
                        let keyword = model.newRuleKeyword.trimmingCharacters(in: .whitespaces).lowercased(), category = model.newRuleCategory
                        model.run("rule-new") {
                            try await manager.bankSaveRule(keyword: keyword, category: category)
                            await MainActor.run { model.newRuleKeyword = ""; model.newRuleCategory = ""; model.showNewRule = false }
                            return fmt.t("Rule created.")
                        }
                    }.disabled(model.newRuleKeyword.trimmingCharacters(in: .whitespaces).count < 2 || model.newRuleCategory.isEmpty || model.busy == "rule-new")
                }
                .padding(12).background(Color.accentColor.opacity(0.06)).cornerRadius(12)
            }
        }
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Text("\(fmt.t("Rules")) (\(rules.count))").font(.system(size: 14.5, weight: .bold))
                Spacer()
                TextField(fmt.t("Search rules"), text: $model.ruleSearch).textFieldStyle(.roundedBorder).frame(maxWidth: 200)
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            Divider()
            if shown.isEmpty { Text(rules.isEmpty ? fmt.t("No rules yet — set a category on a transaction and tick the rule box.") : fmt.t("No rules match your search.")).font(.system(size: 12.5)).foregroundColor(.secondary).padding(16) }
            ForEach(shown) { rule in
                let stat = d.ruleStats[rule.id]
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(ruleName(rule)).font(.system(size: 13, weight: .bold)).lineLimit(1)
                            Text("\(fmt.t("If merchant contains")) \(rule.keyword.uppercased())").font(.system(size: 11)).foregroundColor(.secondary).lineLimit(1)
                        }
                        Spacer()
                        BankChip(text: fmt.t(rule.category), color: bankCategoryColor(rule.category))
                        if !isPhone {
                            Text(categoryTax[rule.category].map { fmt.t(bankVatLabel($0)) } ?? "— (\(fmt.t("No VAT")))").font(.system(size: 11.5)).foregroundColor(.secondary).frame(width: 90, alignment: .leading)
                            Text(appliesTo(stat?.txType ?? "")).font(.system(size: 11.5)).foregroundColor(.secondary).frame(width: 100, alignment: .leading)
                        }
                        BankChip(text: fmt.t("Active"), color: .green)
                        if isOwner {
                            Button(role: .destructive) {
                                guard let manager = model.manager else { return }
                                model.run("rule-\(rule.id)") { try await manager.bankDeleteRule(id: rule.id); return nil }
                            } label: { Image(systemName: "trash") }.buttonStyle(.plain).foregroundColor(.secondary)
                        }
                    }
                    if model.previewRuleId == rule.id, let stat {
                        HStack(spacing: 14) {
                            Label("\(stat.count) \(fmt.t("Matching transactions"))", systemImage: "number").font(.system(size: 11.5))
                            Label(fmt.money(stat.total), systemImage: "sterlingsign.circle").font(.system(size: 11.5))
                            if !stat.lastDate.isEmpty { Label("\(fmt.t("Last used")) \(fmt.date(stat.lastDate, short: true))", systemImage: "clock").font(.system(size: 11.5)) }
                            Spacer()
                            Button("\(fmt.t("View matching transactions")) →") { model.txSearch = rule.keyword; model.txAttention = .none; model.txFlow = .out; model.tab = .transactions }
                                .buttonStyle(.plain).font(.system(size: 11.5, weight: .bold)).foregroundColor(.accentColor)
                        }
                        .padding(10).background(Color.accentColor.opacity(0.06)).cornerRadius(9)
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 9)
                .contentShape(Rectangle()).onTapGesture { model.previewRuleId = model.previewRuleId == rule.id ? nil : rule.id }
                Divider().opacity(0.5)
            }
        }
        .background(background).cornerRadius(14)
        VStack(alignment: .leading, spacing: 8) {
            Text("\(fmt.t("Suggested rules")) (\(d.suggestedRules.count))").font(.system(size: 14.5, weight: .bold))
            if d.suggestedRules.isEmpty { Text(fmt.t("No suggestions right now — categorise a few more transactions.")).font(.system(size: 12)).foregroundColor(.secondary) }
            ForEach(d.suggestedRules, id: \.keyword) { item in
                HStack(spacing: 10) {
                    BankAvatar(name: item.merchant, size: 30)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) { Text("\(item.merchant) \(fmt.t("Rule"))").font(.system(size: 12.5, weight: .bold)).lineLimit(1); BankChip(text: fmt.t(item.category), color: bankCategoryColor(item.category)) }
                        Text("\(fmt.t("If merchant contains")) \"\(item.keyword)\" · \(item.count) \(fmt.t("matches")) · \(fmt.money(item.total))").font(.system(size: 11)).foregroundColor(.secondary).lineLimit(2)
                    }
                    Spacer()
                    if isOwner {
                        Button(fmt.t("Create rule")) {
                            guard let manager = model.manager else { return }
                            model.run("rule-\(item.keyword)") { try await manager.bankSaveRule(keyword: item.keyword, category: item.category); return fmt.t("Rule created.") }
                        }.font(.system(size: 12, weight: .bold))
                    }
                }
                .padding(10).overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.gray.opacity(0.2)))
            }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading).background(background).cornerRadius(14)
    }
}
