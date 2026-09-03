import Foundation

/// Mac and iPhone's mirror of the Finance Engine.
///
/// The server stamps every order with a `finance` block and that block is what
/// the apps SHOW. This exists for the one thing the block cannot do: while
/// somebody is typing into the finance card the figures have to move before the
/// write has been made, and a preview computed by a different rule than the
/// engine's makes the number jump when the server's answer arrives.
///
/// A faithful port of `functions/finance/engine.js`, held to the same golden
/// vectors — `scripts/check-finance-vectors-swift.sh` compiles this file and
/// runs `functions/finance/vectors.json` through it, so the two cannot drift
/// apart quietly.
///
/// Do not change a formula here. Change `functions/finance/engine.js`, add a
/// vector, then port it across. Specification: `docs/finance-engine.md`.
enum NDFinanceEngine {

    static let version = 2

    static let remainingPrefix = "financialRemaining::"
    static let expensePrefix = "financialExpense::"

    static let methodStandard = "standard"
    static let methodMargin = "margin"
    static let methodNone = "none"

    struct Line: Equatable {
        let title: String
        let amount: Double
    }

    struct Block: Equatable {
        let engineVersion: Int
        let method: String
        let taxRate: Double
        let pricesIncludeVat: Bool
        let vatRegistered: Bool
        let revenue: Double
        let receivablesTotal: Double
        let directCost: Double
        let grossMargin: Double
        let platformFee: Double
        let deliveryCost: Double
        let otherExpenses: Double
        let refunded: Double
        let vatBase: Double
        let vatDue: Double
        let netProfit: Double
        let customerTotal: Double
        let fromLineItems: Bool
        let orphanKeys: [String]
        let receivableLines: [Line]
        let expenseLines: [Line]
    }

    /// What the engine reads off an order.
    struct Input {
        var paidAmount: Double = 0
        var remainingAmount: Double = 0
        var watchPurchasePrice: Double = 0
        var deliveryCost: Double = 0
        var refundedAmount: Double = 0
        /// `nil` means "the order does not say", and the workspace rate applies.
        var taxRate: Double? = nil
        var taxType: String = ""
        var lineItemTotals: [Double] = []
        var customFields: [String: String] = [:]
    }

    /// What the engine reads off the workspace. Every field is optional so an
    /// absent setting falls back to today's behaviour rather than to zero.
    struct Settings {
        var feePercentage: Double? = nil
        var defaultTaxRate: Double? = nil
        var vatRegistered: Bool? = nil
        var pricesIncludeVat: Bool? = nil
        var vatMethod: String? = nil
        var taxCalculationType: String? = nil
        var taxMilestoneEnabled: Bool? = nil
        var taxMilestoneDateSeconds: Double? = nil
    }

    // MARK: - Reading a stored amount

    /// Reads a money value at full precision, keeping its sign. Our own clients
    /// write a plain dot decimal, so that shape is taken at face value; anything
    /// else came from a text field on some platform and gets the same
    /// last-separator-wins reading the input fields use.
    static func readAmount(_ raw: String?) -> Double {
        let text = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty { return 0 }
        if text.range(of: "^-?[0-9]+(\\.[0-9]+)?$", options: .regularExpression) != nil {
            return Double(text) ?? 0
        }

        var kept = ""
        for character in text {
            if character.isNumber {
                kept.append(character)
            } else if character == "," || character == "." {
                kept.append(character)
            } else if character == "-" && kept.isEmpty {
                kept.append(character)
            }
        }
        guard kept.contains(where: { $0.isNumber }) else { return 0 }

        let negative = kept.hasPrefix("-")
        var body = kept.replacingOccurrences(of: "-", with: "")
        let hasComma = body.contains(",")
        let hasDot = body.contains(".")

        if hasComma && hasDot {
            let lastComma = body.range(of: ",", options: .backwards)!.lowerBound
            let lastDot = body.range(of: ".", options: .backwards)!.lowerBound
            let decimal: Character = lastComma > lastDot ? "," : "."
            let grouping: Character = decimal == "," ? "." : ","
            body = body.replacingOccurrences(of: String(grouping), with: "")
            if decimal == "," {
                if let first = body.range(of: ",") {
                    body = body.replacingCharacters(in: first, with: ".")
                }
            }
        } else if hasComma || hasDot {
            let separator: Character = hasComma ? "," : "."
            let occurrences = body.filter { $0 == separator }.count
            if occurrences > 1 {
                body = body.replacingOccurrences(of: String(separator), with: "")
            } else {
                let parts = body.split(separator: separator, omittingEmptySubsequences: false)
                let before = String(parts.first ?? "")
                let after = parts.count > 1 ? String(parts[1]) : ""
                // A thousands group is exactly three digits behind one to three
                // that do not start with a zero, so "0.750" is three quarters.
                let grouped = after.count == 3 && !before.isEmpty && before.count <= 3 && !before.hasPrefix("0")
                body = grouped ? before + after : "\(before).\(after)"
            }
        }

        guard let value = Double(body), value.isFinite else { return 0 }
        return negative ? -value : value
    }

    /// Two decimal places, away from zero, applied once at the output.
    static func round2(_ value: Double) -> Double {
        guard value.isFinite else { return 0 }
        let rounded = (abs(value) * 100).rounded() / 100
        return value < 0 ? -rounded : rounded
    }

    private static func percentage(_ raw: Double?, fallback: Double) -> Double {
        guard let number = raw, number.isFinite, number >= 0 else { return fallback }
        return min((number * 100).rounded() / 100, 100)
    }

    // MARK: - The VAT method

    /// `Revenue` is the standard scheme and `Profit` is the margin scheme.
    static func normalizeVatMethod(_ raw: String?, fallback: String = methodStandard) -> String {
        let text = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if text.isEmpty { return fallback }
        if text == methodStandard || text == "revenue" || text.contains("standard") { return methodStandard }
        if text == methodMargin || text == "profit" || text.contains("margin") { return methodMargin }
        if text == methodNone || text.contains("no vat") || text == "novat" || text == "exempt" { return methodNone }
        return fallback
    }

    private struct Resolved {
        let feePercentage: Double
        let defaultTaxRate: Double
        let vatRegistered: Bool
        let pricesIncludeVat: Bool
        let defaultVatMethod: String
        let taxMilestoneEnabled: Bool
        let taxMilestoneDateSeconds: Double
    }

    private static func resolve(_ settings: Settings) -> Resolved {
        Resolved(
            feePercentage: percentage(settings.feePercentage, fallback: 3),
            defaultTaxRate: percentage(settings.defaultTaxRate, fallback: 20),
            vatRegistered: settings.vatRegistered ?? true,
            pricesIncludeVat: settings.pricesIncludeVat ?? true,
            defaultVatMethod: normalizeVatMethod(settings.vatMethod ?? settings.taxCalculationType),
            taxMilestoneEnabled: settings.taxMilestoneEnabled ?? false,
            taxMilestoneDateSeconds: settings.taxMilestoneDateSeconds ?? 0
        )
    }

    // MARK: - Custom amount lines

    private static func headingTitles(_ raw: String?) -> Set<String> {
        let text = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let data = text.data(using: .utf8) else { return [] }
        guard let parsed = try? JSONSerialization.jsonObject(with: data),
              let rows = parsed as? [[String: Any]] else { return [] }
        var titles = Set<String>()
        for row in rows {
            let title = String(describing: row["title"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if !title.isEmpty && row["title"] is String { titles.insert(title) }
        }
        return titles
    }

    /// Every stored key counts. The heading list decides the order and the label
    /// a screen shows, never whether an amount is money — dropping an amount
    /// whose heading was renamed made a total quietly smaller than its own rows.
    static func customLineTotal(
        _ customFields: [String: String],
        prefix: String,
        headingKey: String
    ) -> (total: Double, lines: [Line], orphans: [String]) {
        let allowed = headingTitles(customFields[headingKey])
        var lines: [Line] = []
        var orphans: [String] = []
        var total: Double = 0

        for (key, raw) in customFields {
            guard key.hasPrefix(prefix) else { continue }
            let title = String(key.dropFirst(prefix.count))
            guard !title.isEmpty else { continue }
            let amount = readAmount(raw)
            total += amount
            lines.append(Line(title: title, amount: amount))
            if !allowed.isEmpty && !allowed.contains(title) { orphans.append(title) }
        }

        return (total, lines.sorted { $0.title < $1.title }, orphans.sorted())
    }

    // MARK: - The engine

    /// Computes every money figure for one order. A port; do not diverge.
    static func compute(order: Input, settings: Settings, paymentDateMs: Double? = nil) -> Block {
        let resolved = resolve(settings)

        let receivables = customLineTotal(order.customFields, prefix: remainingPrefix, headingKey: "orderRemainingItemsJSON")
        let expenses = customLineTotal(order.customFields, prefix: expensePrefix, headingKey: "orderExpenseItemsJSON")

        let fromLineItems = !order.lineItemTotals.isEmpty
        let revenue = fromLineItems
            ? order.lineItemTotals.reduce(0, +)
            : order.paidAmount + order.remainingAmount + receivables.total

        let directCost = order.watchPurchasePrice
        let grossMargin = revenue - directCost
        let platformFee = round2(revenue * resolved.feePercentage / 100)

        let own = normalizeVatMethod(order.taxType, fallback: "")
        let method: String
        if !own.isEmpty {
            method = own
        } else if resolved.taxMilestoneEnabled, let paymentDateMs {
            method = paymentDateMs / 1000 >= resolved.taxMilestoneDateSeconds ? methodStandard : methodMargin
        } else {
            method = resolved.defaultVatMethod
        }

        let rate = order.taxRate.map { percentage($0, fallback: resolved.defaultTaxRate) } ?? resolved.defaultTaxRate

        // The margin scheme's base is the selling price less the purchase price
        // and nothing else — not the fee, not the shipping, not the expenses.
        var vatBase: Double = 0
        if method == methodStandard { vatBase = revenue }
        else if method == methodMargin { vatBase = max(grossMargin, 0) }

        var vatDue: Double = 0
        if resolved.vatRegistered && method != methodNone && rate > 0 && vatBase > 0 {
            vatDue = resolved.pricesIncludeVat
                ? round2(vatBase * rate / (100 + rate))
                : round2(vatBase * rate / 100)
        }

        let netProfit = revenue - vatDue - directCost - platformFee - order.deliveryCost - expenses.total - order.refundedAmount

        return Block(
            engineVersion: version,
            method: method,
            taxRate: rate,
            pricesIncludeVat: resolved.pricesIncludeVat,
            vatRegistered: resolved.vatRegistered,
            revenue: round2(revenue),
            receivablesTotal: round2(receivables.total),
            directCost: round2(directCost),
            grossMargin: round2(grossMargin),
            platformFee: platformFee,
            deliveryCost: round2(order.deliveryCost),
            otherExpenses: round2(expenses.total),
            refunded: round2(order.refundedAmount),
            vatBase: round2(vatBase),
            vatDue: vatDue,
            netProfit: round2(netProfit),
            customerTotal: round2(resolved.pricesIncludeVat ? revenue : revenue + vatDue),
            fromLineItems: fromLineItems,
            orphanKeys: receivables.orphans.map { remainingPrefix + $0 } + expenses.orphans.map { expensePrefix + $0 },
            receivableLines: receivables.lines,
            expenseLines: expenses.lines
        )
    }
}
