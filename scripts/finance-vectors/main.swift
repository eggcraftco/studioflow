import Foundation

// Runs the Finance Engine's golden vectors through the Swift mirror.
// Swift only allows top-level statements in a file called main.swift, which is
// why this lives in its own folder. Compiled with EGGcraft/FinanceEngine.swift by
// scripts/check-finance-vectors-swift.sh — never part of the app.

let vectorsPath = CommandLine.arguments.count > 1
    ? CommandLine.arguments[1]
    : "functions/finance/vectors.json"

guard let data = FileManager.default.contents(atPath: vectorsPath),
      let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
    print("could not read \(vectorsPath)")
    exit(1)
}

if (root["engineVersion"] as? Int) != NDFinanceEngine.version {
    print("the vector file and the Swift mirror disagree on the engine version")
    exit(1)
}

func stringMap(_ raw: Any?) -> [String: String] {
    guard let dictionary = raw as? [String: Any] else { return [:] }
    var out: [String: String] = [:]
    for (key, value) in dictionary {
        if let text = value as? String { out[key] = text }
        else if let number = value as? NSNumber { out[key] = number.stringValue }
    }
    return out
}


/// Money the way the engine reads it.
///
/// A vector may store an amount as a JSON number OR as text, because order
/// fields on this platform have been text for years and `readAmount` is part of
/// the engine's contract. A runner that understood only numbers reported 0 for
/// a string and stayed green while the mirror was right — a green suite that
/// proves nothing is worse than a red one. Strings go through the mirror's own
/// `readAmount`, which is what the app does with a Firestore string.
func money(_ raw: Any?) -> Double {
    if let number = raw as? NSNumber, !(number is NSNull) {
        // CFBoolean also bridges to NSNumber; a boolean is not an amount.
        if CFGetTypeID(number) == CFBooleanGetTypeID() { return 0 }
        return number.doubleValue
    }
    if let text = raw as? String { return NDFinanceEngine.readAmount(text) }
    return 0
}

/// Strictly a JSON boolean. The server demands `=== true`, so a 1 is not a yes.
func flag(_ raw: Any?) -> Bool? {
    guard let number = raw as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() else { return nil }
    return number.boolValue
}

func inputFrom(_ order: [String: Any]) -> NDFinanceEngine.Input {
    var input = NDFinanceEngine.Input()
    input.paidAmount = money(order["paidAmount"])
    input.remainingAmount = money(order["remainingAmount"])
    input.watchPurchasePrice = money(order["watchPurchasePrice"])
    input.deliveryCost = money(order["deliveryCost"])
    input.refundedAmount = money(order["refundedAmount"])
    input.paymentFee = money(order["paymentFee"])
    input.platformFeeKnown = flag(order["platformFeeKnown"]) ?? false
    input.taxRate = order.keys.contains("taxRate") ? money(order["taxRate"]) : nil
    input.taxType = order["taxType"] as? String ?? ""
    // What the shop said about the tax it charged. `taxAmountKnown` is the gate:
    // without it a `taxAmount` is NivaDesk's own figure, computed from the rate,
    // and reading it back as a shop's answer would replace the engine with a
    // stale copy of itself. `taxIncludedInPrice` is read the same way `taxRate`
    // is — absent means the order does not say, and the workspace setting
    // stands, which is not the same thing as the order saying `false`.
    input.taxAmountKnown = flag(order["taxAmountKnown"]) ?? false
    input.taxAmount = money(order["taxAmount"])
    input.taxResponsibility = order["taxResponsibility"] as? String
    input.taxIncludedInPrice = order.keys.contains("taxIncludedInPrice")
        ? flag(order["taxIncludedInPrice"])
        : nil
    input.customFields = stringMap(order["customFields"])
    if let items = order["lineItems"] as? [[String: Any]] {
        // Every object counts, even one whose lineTotal is missing or text —
        // the server counts the ITEM and reads its total with readAmount, so a
        // runner that dropped such a line would disagree about `fromLineItems`
        // and about which revenue rule applies.
        input.lineItemTotals = items.map { money($0["lineTotal"]) }
    }
    return input
}

// The other half of the same trap. A new EXPECTED key with no case in `figure`
// is caught below, loudly. A new INPUT key that nothing above reads is not
// caught by anything: the mirror computes the order as if the field were never
// there, agrees with itself, and prints PASS while disagreeing with the server.
// So the reader states what it reads, and a vector carrying anything else is a
// failure rather than a quiet omission.
let readOrderKeys: Set<String> = [
    "paidAmount", "remainingAmount", "watchPurchasePrice", "deliveryCost", "refundedAmount",
    "paymentFee", "platformFeeKnown", "taxRate", "taxType", "taxAmountKnown", "taxAmount",
    "taxResponsibility", "taxIncludedInPrice", "customFields", "lineItems"
]

let readSettingsKeys: Set<String> = [
    "feePercentage", "defaultTaxRate", "vatRegistered", "pricesIncludeVat", "vatMethod",
    "taxCalculationType", "taxMilestoneEnabled", "taxMilestoneDate"
]

// Fields a vector carries ON PURPOSE for the engine to ignore. Hiding the Base
// Cost in the card settings used to remove it from the profit; two vectors set
// the flag to prove it no longer does, so "nothing reads it" is the correct
// answer here and not an omission.
let ignoredSettingsKeys: Set<String> = ["financialShowBaseCost"]

func settingsFrom(_ raw: [String: Any]) -> NDFinanceEngine.Settings {
    var settings = NDFinanceEngine.Settings()
    settings.feePercentage = (raw["feePercentage"] as? NSNumber)?.doubleValue
    settings.defaultTaxRate = (raw["defaultTaxRate"] as? NSNumber)?.doubleValue
    settings.vatRegistered = raw["vatRegistered"] as? Bool
    settings.pricesIncludeVat = raw["pricesIncludeVat"] as? Bool
    settings.vatMethod = raw["vatMethod"] as? String
    settings.taxCalculationType = raw["taxCalculationType"] as? String
    settings.taxMilestoneEnabled = raw["taxMilestoneEnabled"] as? Bool
    settings.taxMilestoneDateSeconds = (raw["taxMilestoneDate"] as? NSNumber)?.doubleValue
    return settings
}

func figure(_ block: NDFinanceEngine.Block, _ field: String) -> Any? {
    switch field {
    case "revenue": return block.revenue
    case "receivablesTotal": return block.receivablesTotal
    case "directCost": return block.directCost
    case "grossMargin": return block.grossMargin
    case "platformFee": return block.platformFee
    case "deliveryCost": return block.deliveryCost
    case "otherExpenses": return block.otherExpenses
    case "refunded": return block.refunded
    case "vatBase": return block.vatBase
    case "vatDue": return block.vatDue
    case "netProfit": return block.netProfit
    case "customerTotal": return block.customerTotal
    case "taxRate": return block.taxRate
    case "method": return block.method
    case "vatRegistered": return block.vatRegistered
    case "pricesIncludeVat": return block.pricesIncludeVat
    case "fromLineItems": return block.fromLineItems
    case "platformFeeKnown": return block.platformFeeKnown
    case "taxAmountKnown": return block.taxAmountKnown
    case "taxResponsibility": return block.taxResponsibility
    case "taxIncludedInPrice": return block.taxIncludedInPrice
    case "platformCollectedTax": return block.platformCollectedTax
    case "taxNeedsReview": return block.taxNeedsReview
    case "orphanKeys": return block.orphanKeys
    // Every key a vector can expect needs a case here. A missing one is not a
    // compile error and not a failure — the guard below turns it into a loud
    // "the mirror does not expose this figure", which is the whole point: a key
    // that silently fell through would let the mirror disagree with the server
    // and still print PASS.
    default: return nil
    }
}

var failures = 0
let cases = root["cases"] as? [[String: Any]] ?? []
for testCase in cases {
    let name = testCase["name"] as? String ?? "?"
    let paymentDateMs = ((testCase["options"] as? [String: Any])?["paymentDateMs"] as? NSNumber)?.doubleValue
    let order = testCase["order"] as? [String: Any] ?? [:]
    let settings = testCase["settings"] as? [String: Any] ?? [:]
    let block = NDFinanceEngine.compute(
        order: inputFrom(order),
        settings: settingsFrom(settings),
        paymentDateMs: paymentDateMs
    )
    var wrong: [String] = []
    for key in order.keys.sorted() where !readOrderKeys.contains(key) {
        wrong.append("order.\(key): the vector sets this field and the runner never reads it")
    }
    for key in settings.keys.sorted() where !readSettingsKeys.contains(key) && !ignoredSettingsKeys.contains(key) {
        wrong.append("settings.\(key): the vector sets this field and the runner never reads it")
    }
    for (field, expected) in (testCase["expect"] as? [String: Any] ?? [:]) {
        guard let actual = figure(block, field) else {
            wrong.append("\(field): the mirror does not expose this figure")
            continue
        }
        if let expectedList = expected as? [String] {
            if (actual as? [String]) != expectedList { wrong.append("\(field): \(actual) != \(expectedList)") }
        } else if let expectedBool = expected as? Bool, !(expected is NSNumber && !(expected is Bool)) , (actual is Bool) {
            if (actual as? Bool) != expectedBool { wrong.append("\(field): \(actual) != \(expectedBool)") }
        } else if let expectedText = expected as? String {
            if (actual as? String) != expectedText { wrong.append("\(field): \(actual) != \(expectedText)") }
        } else if let expectedNumber = expected as? NSNumber {
            let got = (actual as? Double) ?? 0
            if abs(got - expectedNumber.doubleValue) >= 0.005 { wrong.append("\(field): \(got) != \(expectedNumber.doubleValue)") }
        }
    }
    if wrong.isEmpty {
        print("PASS  \(name)")
    } else {
        failures += 1
        print("FAIL  \(name)\n        \(wrong.joined(separator: "\n        "))")
    }
}

if failures > 0 {
    print("\n❌ \(failures) of \(cases.count) vectors differ between the server engine and the Swift mirror")
    exit(1)
}
print("\n✅ SWIFT FINANCE MIRROR GEÇTİ (\(cases.count) vektör)")
