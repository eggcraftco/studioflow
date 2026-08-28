import Foundation
import FirebaseFirestore

// Pure computation shared by the Banking screens — a port of the web app's
// lib/studioflow/bankInsights.ts plus the small helpers that live in
// app/bank/page.tsx, so Mac/iPhone show the same recurring spends, duplicates,
// category/rule/order suggestions as nivadesk.app.

// MARK: - Extra models

/// Owner-defined payee: merges the bank names that mean the same vendor and can
/// mark the payment as repeating even when the dates wander (payroll, rent paid
/// by hand). Automatic detection can never infer either of those.
struct StudioBankVendor: Identifiable, Equatable {
    let id: String
    let name: String
    let keys: [String]
    let cadence: BankRecurringCadence

    init(id: String, data: [String: Any]) {
        self.id = id
        name = (data["name"] as? String) ?? ""
        keys = ((data["keys"] as? [Any]) ?? []).compactMap { ($0 as? String)?.lowercased() }
        cadence = BankRecurringCadence(rawValue: (data["cadence"] as? String) ?? "monthly") ?? .monthly
    }
}

struct StudioBankRule: Identifiable, Equatable {
    let id: String
    let keyword: String
    let category: String

    init(id: String, data: [String: Any]) {
        self.id = id
        keyword = ((data["keyword"] as? String) ?? "").lowercased()
        category = (data["category"] as? String) ?? ""
    }
}

/// Workspace-defined category record (rename/deactivate/default VAT), written
/// server-side by bankSaveCategory. Category MANAGEMENT stays web-only — the
/// native apps only merge the active names into their pickers.
struct StudioBankCategoryRecord: Identifiable, Equatable {
    let id: String
    let name: String
    let type: String
    let defaultVatCode: String
    let active: Bool

    init(id: String, data: [String: Any]) {
        self.id = id
        name = (data["name"] as? String) ?? ""
        type = (data["type"] as? String) ?? "expense"
        defaultVatCode = ((data["defaultVatCode"] as? String) ?? "").uppercased()
        active = (data["active"] as? Bool) ?? true
    }
}

/// A receipt uploaded before its payment reached the feed; the server attaches
/// it after a sync (or "Match now") once a single confident match exists.
struct StudioBankWaitingReceipt: Identifiable, Equatable {
    let id: String
    let storagePath: String
    let fileName: String
    let amount: Double
    let date: String
    let source: String
    let createdAt: Date?

    init(id: String, data: [String: Any]) {
        self.id = id
        storagePath = (data["storagePath"] as? String) ?? ""
        fileName = (data["fileName"] as? String) ?? "receipt"
        amount = (data["amount"] as? NSNumber)?.doubleValue ?? 0
        date = String(((data["date"] as? String) ?? "").prefix(10))
        source = (data["source"] as? String) ?? "web"
        createdAt = (data["createdAt"] as? Timestamp)?.dateValue()
    }

    var ageDays: Int {
        guard let createdAt else { return 0 }
        return max(0, Int(Date().timeIntervalSince(createdAt) / 86400))
    }
}

// MARK: - Constants (mirror the web page)

let bankCategories: [String] = ["Materials", "Equipment", "Shipping", "Software", "Subscriptions", "Fees", "Marketing", "Travel", "Utilities", "Rent", "Staff", "Tax", "Other"]

/// Every pickable category: presets + the workspace's own active records +
/// whatever the feed already uses. A deactivated record drops out of the
/// pickers but keeps colouring existing rows (mirrors the web categoryOptions).
func bankCategoryOptions(custom: [StudioBankCategoryRecord], inUse: [String]) -> [String] {
    var list = bankCategories
    for record in custom where !record.name.isEmpty {
        if record.active {
            if !list.contains(record.name) { list.append(record.name) }
        } else {
            list.removeAll { $0 == record.name }
        }
    }
    for name in inUse where !name.isEmpty && !list.contains(name) { list.append(name) }
    return list
}

/// NivaDesk's own VAT treatments — the accounting connector translates them
/// per provider at push time, nothing here is a Pandle code. Zero-rated and
/// exempt are different VAT-return boxes, so they are separate on purpose.
let bankVatCodes: [(code: String, label: String)] = [
    ("ST", "Standard rate (20%)"), ("RR", "Reduced rate (5%)"), ("ZR", "Zero-rated (0%)"), ("EX", "Exempt"),
    ("OS", "Outside scope"), ("NR", "No VAT receipt"), ("RC", "Reverse charge"), ("IM", "Import VAT"),
    ("MX", "Mixed / split VAT"), ("NV", "No VAT")
]
func bankVatLabel(_ code: String) -> String { bankVatCodes.first { $0.code == code }?.label ?? code }

/// What an incoming payment actually is (field `incomingKind`, "" = not
/// classified yet). Labels are t()'d at render time; order mirrors the web
/// drawer's "Match to" select.
let bankIncomingKinds: [(code: String, label: String)] = [
    ("order_payment", "Order payment"), ("invoice", "Invoice"), ("deposit", "Deposit"),
    ("refund_received", "Refund received"), ("owner_contribution", "Owner contribution"),
    ("loan", "Loan"), ("transfer", "Transfer between own accounts"), ("other_income", "Other income")
]
func bankIncomingKindLabel(_ code: String) -> String { bankIncomingKinds.first { $0.code == code }?.label ?? code }

/// Money in, but not revenue — once marked, these leave the Incoming total
/// (mirrors the web's exclusion list).
let bankNonRevenueIncomingKinds: Set<String> = ["transfer", "owner_contribution", "loan"]

/// Where a transaction stands on its way to the accountant (field
/// `reviewStatus`, absent = unreviewed). Labels are t()'d at render time.
let bankReviewStatuses: [(code: String, label: String)] = [
    ("unreviewed", "Unreviewed"), ("needs_info", "Needs information"), ("ready", "Ready for accounting"),
    ("synced", "Synced"), ("confirmed", "Confirmed in accounting"), ("sync_error", "Sync error"), ("ignored", "Ignored")
]
func bankReviewStatusLabel(_ code: String) -> String { bankReviewStatuses.first { $0.code == code }?.label ?? bankReviewStatuses[0].label }

/// Pandle's default nominal mapping — used until the workspace saves its own.
let bankDefaultCategoryTax: [String: String] = [
    "Materials": "ST", "Equipment": "ST", "Shipping": "ST", "Software": "ST", "Subscriptions": "ST",
    "Fees": "NV", "Marketing": "ST", "Travel": "ST", "Utilities": "ST", "Rent": "EX", "Staff": "NV", "Tax": "NV", "Other": "ST"
]

enum BankRecurringCadence: String { case weekly, monthly, yearly }

/// high = 4+ agreeing payments with stable amounts; medium = detected;
/// low = owner-marked with little history (mirrors the web's RecurringSpend).
enum BankRecurringConfidence: String { case high, medium, low }

struct BankRecurringSpend: Identifiable, Equatable {
    var id: String { key }
    let key: String
    let merchant: String
    /// Set when the group comes from an owner-defined vendor rather than detection.
    let vendorId: String?
    let cadence: BankRecurringCadence
    let typicalAmount: Double
    let currency: String
    let occurrences: Int
    let lastDate: String
    let nextExpected: String
    let active: Bool
    let monthlyEquivalent: Double
    let priceChange: (previous: Double, current: Double)?
    // Report §23 fields: when the pattern was first seen, how much the amount
    // wanders, roughly which day it lands on, and how sure we are.
    let firstDate: String
    let amountMin: Double
    let amountMax: Double
    /// For monthly patterns: the typical day-of-month payments land on (1-31).
    let expectedDayOfMonth: Int?
    let confidence: BankRecurringConfidence

    var manual: Bool { vendorId != nil }

    static func == (a: BankRecurringSpend, b: BankRecurringSpend) -> Bool {
        a.key == b.key && a.typicalAmount == b.typicalAmount && a.occurrences == b.occurrences && a.active == b.active && a.lastDate == b.lastDate && a.vendorId == b.vendorId
    }
}

struct BankCategorySuggestion: Equatable {
    enum Source { case history, keyword }
    let category: String
    let confidence: Double
    let source: Source
    let keyword: String
}

struct BankOrderLinkSuggestion: Equatable {
    let orderId: String
    let label: String
    let confidence: Double
}

// MARK: - Helpers

private let bankDayMs: Double = 86_400

private func bankParseDay(_ value: String) -> Double {
    let parts = value.split(separator: "-").compactMap { Int($0) }
    guard parts.count >= 3 else { return 0 }
    var components = DateComponents(); components.year = parts[0]; components.month = parts[1]; components.day = parts[2]
    return Calendar.current.date(from: components)?.timeIntervalSince1970 ?? 0
}

private func bankIsoDay(_ time: TimeInterval) -> String {
    let formatter = DateFormatter(); formatter.dateFormat = "yyyy-MM-dd"; formatter.locale = Locale(identifier: "en_US_POSIX")
    return formatter.string(from: Date(timeIntervalSince1970: time))
}

private func bankMedian(_ values: [Double]) -> Double {
    guard !values.isEmpty else { return 0 }
    let sorted = values.sorted()
    let mid = sorted.count / 2
    return sorted.count % 2 == 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/// "ADOBE *8123" and "ADOBE *9911" group together: first three words, digit-heavy tokens dropped.
func bankRecurringMerchantKey(_ tx: StudioBankTransaction) -> String {
    let base = (tx.counterparty.isEmpty ? tx.description : tx.counterparty).trimmingCharacters(in: .whitespaces).lowercased()
    guard !base.isEmpty else { return "" }
    let words = base.split(whereSeparator: { $0.isWhitespace }).map(String.init)
        .filter { word in word.range(of: #"\d{3,}"#, options: .regularExpression) == nil }
        .prefix(3)
    return words.joined(separator: " ")
}

/// Rule keyword for a merchant: skips card-network prefixes that every foreign payment carries.
func bankSuggestRuleKeyword(_ tx: StudioBankTransaction) -> String {
    let base = (tx.counterparty.isEmpty ? tx.description : tx.counterparty).trimmingCharacters(in: .whitespaces).lowercased()
    let noise: Set<String> = ["int'l", "intl", "pos", "card", "crd", "payment", "paypal"]
    let parts = base.split(whereSeparator: { " *,/".contains($0) }).map(String.init)
    let word = parts.first { part in part.filter { $0.isLetter }.count >= 3 && !noise.contains(part) } ?? base
    let cleaned = word.unicodeScalars.filter { CharacterSet.letters.contains($0) || CharacterSet.decimalDigits.contains($0) || ". -".unicodeScalars.contains($0) }
    return String(String.UnicodeScalarView(cleaned)).prefix(60).description
}

private func bankCadence(forInterval days: Double) -> BankRecurringCadence? {
    if days >= 5.5 && days <= 8.5 { return .weekly }
    if days >= 24 && days <= 38 { return .monthly }
    if days >= 330 && days <= 400 { return .yearly }
    return nil
}

private func bankCadenceDays(_ cadence: BankRecurringCadence) -> Double {
    switch cadence { case .weekly: return 7; case .monthly: return 30.44; case .yearly: return 365.25 }
}
private func bankMonthlyFactor(_ cadence: BankRecurringCadence) -> Double {
    switch cadence { case .weekly: return 4.345; case .monthly: return 1; case .yearly: return 1.0 / 12 }
}

// MARK: - Recurring

/// merchant key → vendor, so aliases collapse into one group everywhere.
func bankVendorKeyMap(_ vendors: [StudioBankVendor]) -> [String: StudioBankVendor] {
    var map: [String: StudioBankVendor] = [:]
    for vendor in vendors { for key in vendor.keys { map[key] = vendor } }
    return map
}

func bankDetectRecurring(_ transactions: [StudioBankTransaction], vendors: [StudioBankVendor] = []) -> [BankRecurringSpend] {
    let byKey = bankVendorKeyMap(vendors)
    var groups: [String: [(tx: StudioBankTransaction, time: Double)]] = [:]
    for tx in transactions where tx.amount < 0 && !tx.bookingDate.isEmpty {
        let rawKey = bankRecurringMerchantKey(tx)
        guard rawKey.count >= 3 else { continue }
        // Aliases collapse: every bank name the owner grouped shares one bucket.
        let key = byKey[rawKey]?.id ?? rawKey
        groups[key, default: []].append((tx, bankParseDay(tx.bookingDate)))
    }
    var results: [BankRecurringSpend] = []
    let now = Date().timeIntervalSince1970
    for (key, entries) in groups {
        let vendor = vendors.first { $0.id == key }
        // An owner-marked vendor is taken at its word: one payment is enough and
        // the gap/amount tests are skipped, because payroll is paid by hand.
        guard entries.count >= (vendor != nil ? 1 : 3) else { continue }
        let sorted = entries.sorted { $0.time < $1.time }
        var unique: [(tx: StudioBankTransaction, time: Double)] = []
        for entry in sorted where unique.last?.time != entry.time { unique.append(entry) }
        guard unique.count >= (vendor != nil ? 1 : 3) else { continue }
        let intervals = (1..<unique.count).map { (unique[$0].time - unique[$0 - 1].time) / bankDayMs }
        guard let cadence = vendor?.cadence ?? bankCadence(forInterval: bankMedian(intervals)) else { continue }
        let expected = bankCadenceDays(cadence)
        if vendor == nil {
            let agreeing = intervals.filter { bankCadence(forInterval: $0) == cadence }.count
            guard Double(agreeing) / Double(intervals.count) >= 0.6 else { continue }
        }
        let amounts = unique.map { abs($0.tx.amount) }
        let typical = bankMedian(amounts)
        if vendor == nil {
            let stable = amounts.filter { abs($0 - typical) <= typical * 0.3 }.count
            guard Double(stable) / Double(amounts.count) >= 0.6 else { continue }
        }
        let last = unique[unique.count - 1]
        let previousTypical = bankMedian(Array(amounts.dropLast()))
        let lastAmount = amounts[amounts.count - 1]
        let priceChange: (Double, Double)? = previousTypical > 0 && abs(lastAmount - previousTypical) >= max(0.5, previousTypical * 0.05)
            ? (previousTypical, lastAmount) : nil
        // Report §23: how sure we are — an owner-marked vendor with little
        // history is a guess; 4+ payments with stable amounts is near-certain.
        let stableCount = amounts.filter { abs($0 - typical) <= typical * 0.3 }.count
        let confidence: BankRecurringConfidence = vendor != nil && unique.count < 3
            ? .low
            : unique.count >= 4 && Double(stableCount) / Double(amounts.count) >= 0.8 ? .high : .medium
        // Monthly patterns: the most frequent day-of-month across the payments.
        var expectedDayOfMonth: Int? = nil
        if cadence == .monthly {
            var dayCounts: [Int: Int] = [:]
            var order: [Int] = []
            for entry in unique {
                let day = Calendar.current.component(.day, from: Date(timeIntervalSince1970: entry.time))
                if dayCounts[day] == nil { order.append(day) }
                dayCounts[day, default: 0] += 1
            }
            // Strictly-greater keeps the first-seen day on ties, matching the
            // web's stable sort over Map insertion order.
            var best: Int? = nil
            for day in order where best == nil || dayCounts[day]! > dayCounts[best!]! { best = day }
            expectedDayOfMonth = best
        }
        results.append(BankRecurringSpend(
            key: key,
            merchant: vendor.map { $0.name.isEmpty ? last.tx.merchant : $0.name } ?? (last.tx.counterparty.isEmpty ? last.tx.description : last.tx.counterparty),
            vendorId: vendor?.id,
            cadence: cadence,
            typicalAmount: typical,
            currency: last.tx.currency.isEmpty ? "GBP" : last.tx.currency,
            occurrences: unique.count,
            lastDate: last.tx.bookingDate,
            nextExpected: bankIsoDay(last.time + expected * bankDayMs),
            // Hand-paid vendors get a longer grace period before they read as stopped.
            active: now - last.time <= expected * bankDayMs * (vendor != nil ? 2.4 : 1.6),
            monthlyEquivalent: typical * bankMonthlyFactor(cadence),
            priceChange: priceChange,
            firstDate: unique[0].tx.bookingDate,
            amountMin: amounts.min() ?? typical,
            amountMax: amounts.max() ?? typical,
            expectedDayOfMonth: expectedDayOfMonth,
            confidence: confidence
        ))
    }
    return results.sorted { $0.monthlyEquivalent > $1.monthlyEquivalent }
}

// MARK: - Duplicates

func bankDetectDuplicates(_ transactions: [StudioBankTransaction]) -> Set<String> {
    var flagged = Set<String>()
    var byKey: [String: [StudioBankTransaction]] = [:]
    for tx in transactions where tx.amount < 0 && !tx.bookingDate.isEmpty {
        byKey["\(bankRecurringMerchantKey(tx))|\(String(format: "%.2f", abs(tx.amount)))", default: []].append(tx)
    }
    for list in byKey.values where list.count >= 2 {
        let sorted = list.sorted { $0.bookingDate < $1.bookingDate }
        for index in 1..<sorted.count {
            let gap = (bankParseDay(sorted[index].bookingDate) - bankParseDay(sorted[index - 1].bookingDate)) / bankDayMs
            if gap <= 2 { flagged.insert(sorted[index - 1].id); flagged.insert(sorted[index].id) }
        }
    }
    return flagged
}

// MARK: - Category suggestions

private let bankCategoryKeywords: [(category: String, words: [String])] = [
    ("Software", ["adobe", "openai", "anthropic", "google*gsuite", "gsuite", "google workspace", "microsoft", "eset", "akismet", "github", "notion", "figma", "canva", "dropbox", "icloud", "apple.com/bill", "zoom", "slack", "1password", "cloudflare", "godaddy", "hostinger", "ionos"]),
    ("Subscriptions", ["shopify", "squarespace", "wix", "spotify", "netflix", "cookieyes", "creem.io", "patreon", "membership", "subscription"]),
    ("Shipping", ["royal mail", "dhl", "ups", "fedex", "evri", "hermes", "parcelforce", "parcel2go", "dpd", "click and drop", "postage"]),
    ("Fees", ["stripe", "paypal", "non-sterling", "transaction fee", "bank charge", "sumup", "square", "klarna", "wise"]),
    ("Marketing", ["facebk", "facebook", "meta ads", "google ads", "adwords", "instagram", "mailchimp", "linkedin", "etsy ads", "tiktok"]),
    ("Travel", ["uber", "trainline", "tfl", "national rail", "easyjet", "ryanair", "british airways", "bp ", "shell ", "esso", "texaco", "parking", "ringgo", "just park"]),
    ("Utilities", ["octopus", "edf", "british gas", "eon", "ovo", "thames water", "vodafone", "ee ltd", "o2 ", "three", "bt group", "virgin media", "sky "]),
    ("Tax", ["hmrc"]),
    ("Rent", ["rent", "lovespace", "storage", "wework", "regus"]),
    ("Materials", ["cousinsuk", "cousins uk", "amazon", "amzn", "ebay", "screwfix", "toolstation", "hobbycraft", "b&q", "wickes", "ikea"]),
    ("Equipment", ["apple store", "currys", "argos"])
]

func bankSuggestCategory(_ tx: StudioBankTransaction, history: [StudioBankTransaction]) -> BankCategorySuggestion? {
    guard tx.amount < 0 else { return nil }
    let key = bankRecurringMerchantKey(tx)
    if !key.isEmpty {
        var counts: [String: Int] = [:]
        for other in history where !other.category.isEmpty && other.id != tx.id && bankRecurringMerchantKey(other) == key {
            counts[other.category, default: 0] += 1
        }
        if let best = counts.max(by: { $0.value < $1.value }) {
            return BankCategorySuggestion(category: best.key, confidence: min(0.97, 0.8 + Double(best.value) * 0.05), source: .history, keyword: key.split(separator: " ").first.map(String.init) ?? key)
        }
    }
    let haystack = "\(tx.counterparty) \(tx.description)".lowercased()
    for group in bankCategoryKeywords {
        if let hit = group.words.first(where: { haystack.contains($0) }) {
            return BankCategorySuggestion(category: group.category, confidence: 0.7, source: .keyword, keyword: hit.trimmingCharacters(in: .whitespaces))
        }
    }
    return nil
}

// MARK: - Order link suggestions

private let bankOrderUnrelatedCategories: Set<String> = ["Subscriptions", "Software", "Fees", "Rent", "Utilities", "Tax", "Staff", "Marketing"]

private func bankWords(_ text: String) -> Set<String> {
    Set(text.lowercased().split(whereSeparator: { !$0.isLetter && !$0.isNumber }).map(String.init).filter { $0.count >= 4 })
}

func bankRankOrders(for tx: StudioBankTransaction, orders: [Siparis]) -> [(order: Siparis, score: Int)] {
    guard !tx.bookingDate.isEmpty else { return orders.map { ($0, 0) } }
    let txTime = bankParseDay(tx.bookingDate)
    let words = bankWords("\(tx.counterparty) \(tx.description)")
    let open = orders.filter { order in
        if order.status.lowercased().contains("cancel") { return false }
        let days = (txTime - order.paymentDate.timeIntervalSince1970) / bankDayMs
        return days >= -7 && days <= 60
    }
    let openIds = Set(open.compactMap(\.id))
    let ranked: [(order: Siparis, score: Int)] = orders.map { order in
        var score = 0
        if let id = order.id, openIds.contains(id) {
            let days = abs((txTime - order.paymentDate.timeIntervalSince1970) / bankDayMs)
            score = days <= 7 ? 30 : days <= 14 ? 20 : days <= 30 ? 10 : 5
            if open.count == 1 { score += 25 } else if open.count <= 3 { score += 15 }
        }
        let overlap = bankWords("\(order.customerName) \(order.designName)").intersection(words).count
        score += min(2, overlap) * 30
        return (order, score)
    }
    return ranked.sorted { a, b in
        if a.score != b.score { return a.score > b.score }
        return a.order.paymentDate > b.order.paymentDate
    }
}

func bankSuggestOrderLink(for tx: StudioBankTransaction, orders: [Siparis]) -> BankOrderLinkSuggestion? {
    guard tx.amount < 0, !tx.bookingDate.isEmpty else { return nil }
    if bankOrderUnrelatedCategories.contains(tx.effectiveCategory) { return nil }
    guard let best = bankRankOrders(for: tx, orders: orders).first, best.score >= 40, let id = best.order.id else { return nil }
    let label = !best.order.designName.isEmpty && best.order.designName != "Untitled design"
        ? "\(best.order.customerName) · \(best.order.designName)" : best.order.customerName
    return BankOrderLinkSuggestion(orderId: id, label: label, confidence: min(0.95, Double(best.score) / 100))
}

/// Which file badge to draw for an attached receipt.
enum BankReceiptKind { case pdf, image, doc, file }
func bankReceiptKind(_ name: String) -> BankReceiptKind {
    let ext = (name.split(separator: ".").last.map(String.init) ?? "").lowercased()
    if ext == "pdf" { return .pdf }
    if ["png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "bmp", "tif", "tiff"].contains(ext) { return .image }
    if ["doc", "docx", "xls", "xlsx", "csv", "txt", "rtf", "odt", "pages", "numbers"].contains(ext) { return .doc }
    return .file
}
