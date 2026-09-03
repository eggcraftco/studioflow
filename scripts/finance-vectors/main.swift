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

func inputFrom(_ order: [String: Any]) -> NDFinanceEngine.Input {
    var input = NDFinanceEngine.Input()
    input.paidAmount = (order["paidAmount"] as? NSNumber)?.doubleValue ?? 0
    input.remainingAmount = (order["remainingAmount"] as? NSNumber)?.doubleValue ?? 0
    input.watchPurchasePrice = (order["watchPurchasePrice"] as? NSNumber)?.doubleValue ?? 0
    input.deliveryCost = (order["deliveryCost"] as? NSNumber)?.doubleValue ?? 0
    input.refundedAmount = (order["refundedAmount"] as? NSNumber)?.doubleValue ?? 0
    input.paymentFee = (order["paymentFee"] as? NSNumber)?.doubleValue ?? 0
    input.platformFeeKnown = (order["platformFeeKnown"] as? NSNumber)?.boolValue ?? false
    input.taxRate = order.keys.contains("taxRate") ? (order["taxRate"] as? NSNumber)?.doubleValue : nil
    input.taxType = order["taxType"] as? String ?? ""
    input.customFields = stringMap(order["customFields"])
    if let items = order["lineItems"] as? [[String: Any]] {
        input.lineItemTotals = items.compactMap { ($0["lineTotal"] as? NSNumber)?.doubleValue }
    }
    return input
}

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
    case "orphanKeys": return block.orphanKeys
    default: return nil
    }
}

var failures = 0
let cases = root["cases"] as? [[String: Any]] ?? []
for testCase in cases {
    let name = testCase["name"] as? String ?? "?"
    let paymentDateMs = ((testCase["options"] as? [String: Any])?["paymentDateMs"] as? NSNumber)?.doubleValue
    let block = NDFinanceEngine.compute(
        order: inputFrom(testCase["order"] as? [String: Any] ?? [:]),
        settings: settingsFrom(testCase["settings"] as? [String: Any] ?? [:]),
        paymentDateMs: paymentDateMs
    )
    var wrong: [String] = []
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
