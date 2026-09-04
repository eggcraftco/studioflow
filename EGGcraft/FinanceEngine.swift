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

    static let version = 4

    static let remainingPrefix = "financialRemaining::"
    static let expensePrefix = "financialExpense::"

    static let methodStandard = "standard"
    static let methodMargin = "margin"
    static let methodNone = "none"

    // Whose tax is it. A shop tells us what tax it charged; it does not tell us
    // whether that tax is the studio's to declare, and conflating the two gets
    // the VAT return wrong in one direction or the other.
    //
    //   merchant  the studio charged it and the studio declares it. A Shopify,
    //             WooCommerce or Square sale is normally this — those platforms
    //             help calculate the tax, they do not remit it for you.
    //   platform  the marketplace collected it and remits it itself. It belongs
    //             on the order so the totals add up, and NOT in the VAT due.
    //   unknown   nobody has said. The engine refuses to guess: the amount is
    //             shown, left out of VAT due, and the order is marked for review.
    //
    // Deliberately per order, not per channel — Etsy collects and remits in some
    // jurisdictions and leaves the seller responsible in others, so "it is an
    // Etsy order" is not an answer.
    static let taxMerchant = "merchant"
    static let taxPlatform = "platform"
    static let taxUnknown = "unknown"

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
        /// Where the tax figure came from and whose it is, so a screen can say
        /// "Platform collected tax" rather than showing a VAT total that
        /// quietly disagrees with what the customer paid.
        let taxAmountKnown: Bool
        let taxResponsibility: String
        let taxIncludedInPrice: Bool
        /// Tax a marketplace collected and remits itself: real money the
        /// customer paid, reported beside VAT due rather than inside it.
        let platformCollectedTax: Double
        /// A known tax amount nobody has claimed. Shown, left out of VAT due.
        let taxNeedsReview: Bool
        let revenue: Double
        let receivablesTotal: Double
        let directCost: Double
        let grossMargin: Double
        let platformFee: Double
        let platformFeeKnown: Bool
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
        var paymentFee: Double = 0
        /// Set only by a connector that was told the platform's real commission.
        var platformFeeKnown: Bool = false
        /// `nil` means "the order does not say", and the workspace rate applies.
        var taxRate: Double? = nil
        var taxType: String = ""
        /// Set only by a connector the shop told what tax it charged. Every
        /// channel mapper writes `taxRate: 0` because no shop API returns a
        /// rate, so without this flag a Shopify, Etsy or Square sale reported no
        /// VAT at all while the real figure sat in `taxAmount` — and a shop that
        /// said "no tax" was indistinguishable from a field nobody filled in.
        var taxAmountKnown: Bool = false
        /// The shop's own figure, read at its magnitude and never re-derived
        /// into a rate: on a mixed basket a back-derived rate is a fiction.
        var taxAmount: Double = 0
        /// merchant | platform | unknown. `nil` means the order does not say,
        /// which reads as unknown — the engine will not guess whose tax it is.
        var taxResponsibility: String? = nil
        /// Whether the tax sits inside the price or is added on top. A shop
        /// knows this per order and says so; `nil` leaves the workspace's own
        /// setting standing, which is how every order behaved before.
        var taxIncludedInPrice: Bool? = nil
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

    /// Reads whose tax it is, accepting the words the connectors use for each.
    /// Anything unrecognised is `unknown` rather than a guess in either
    /// direction, because guessing wrong overstates a VAT return one way or
    /// understates it the other and neither is recoverable from the number.
    static func normalizeTaxResponsibility(_ raw: String?, fallback: String = taxUnknown) -> String {
        let text = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if text.isEmpty { return fallback }
        if text == taxMerchant || text == "seller" || text == "self" { return taxMerchant }
        if text == taxPlatform || text == "marketplace" || text == "facilitator" { return taxPlatform }
        return taxUnknown
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
            // `??` fires on nil only; the server's `||` also falls through on
            // an empty string, and a workspace that stored `vatMethod: ""`
            // beside a real `taxCalculationType` would otherwise take the
            // standard scheme here and the margin scheme on the server.
            defaultVatMethod: normalizeVatMethod(
                (settings.vatMethod?.isEmpty == false ? settings.vatMethod : nil) ?? settings.taxCalculationType
            ),
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

        // An order that carries invoice lines is worth what its lines say.
        //
        // Without lines the sale is measured from the money instead, and that is
        // where a refund used to be counted twice. Linking a bank refund to an
        // order lowers `paidAmount` AND raises `refundedAmount`, so the sale
        // shrank by the refund and then the profit line subtracted it again — a
        // £1,000 sale refunded £200 came out £200 short. Adding the refund back
        // here restores what the sale was WORTH, which is what an invoice-line
        // order reports, and the single subtraction below then takes it off
        // exactly once. Orders with line items are unchanged.
        let fromLineItems = !order.lineItemTotals.isEmpty
        let revenue = fromLineItems
            ? order.lineItemTotals.reduce(0, +)
            : order.paidAmount + order.remainingAmount + receivables.total + order.refundedAmount

        let directCost = order.watchPurchasePrice
        let grossMargin = revenue - directCost
        // What the sale actually cost to take, when the shop told us. The
        // percentage is a stand-in for a number only the platform knows; where
        // a connector has the real figure, using the estimate is a second,
        // disagreeing definition of the same cost. `platformFeeKnown` is what
        // tells a real fee of zero apart from a field nobody filled in — every
        // existing writer of `paymentFee` puts the estimate there, so a number
        // alone proves nothing.
        let platformFee = order.platformFeeKnown
            ? round2(abs(order.paymentFee))
            : round2(revenue * resolved.feePercentage / 100)

        let own = normalizeVatMethod(order.taxType, fallback: "")
        let method: String
        if !own.isEmpty {
            method = own
        } else if resolved.taxMilestoneEnabled, let paymentDateMs {
            method = paymentDateMs / 1000 >= resolved.taxMilestoneDateSeconds ? methodStandard : methodMargin
        } else {
            method = resolved.defaultVatMethod
        }

        let storedRate = order.taxRate.map { percentage($0, fallback: resolved.defaultTaxRate) } ?? resolved.defaultTaxRate
        // A channel order carries `taxRate: 0` as a placeholder, not as an
        // answer: no shop API returns a rate, so the mappers write zero and
        // send the real figure in `taxAmount` instead. Once the amount is known
        // that zero holds no information, and reading it as "zero-rated" would
        // zero the margin scheme's VAT too — a calculation no shop can do for us.
        let rate = order.taxAmountKnown && storedRate == 0 ? resolved.defaultTaxRate : storedRate

        // The margin scheme's base is the selling price less the purchase price
        // and nothing else — not the fee, not the shipping, not the expenses.
        var vatBase: Double = 0
        if method == methodStandard { vatBase = revenue }
        else if method == methodMargin { vatBase = max(grossMargin, 0) }

        // The tax the shop itself charged, when it told us. A known amount is
        // used as the amount — see `taxAmountKnown` on the input for why a rate
        // cannot be recovered from it.
        let taxAmountKnown = order.taxAmountKnown
        let knownTaxAmount = taxAmountKnown ? abs(order.taxAmount) : 0
        let taxResponsibility = taxAmountKnown
            ? normalizeTaxResponsibility(order.taxResponsibility)
            : taxMerchant
        let taxInsidePrice = taxAmountKnown && order.taxIncludedInPrice != nil
            ? order.taxIncludedInPrice!
            : resolved.pricesIncludeVat

        // Tax a marketplace collected and remits itself is real money the
        // customer paid and belongs on the order, but it is not the studio's to
        // declare, so it is reported beside VAT due rather than inside it. An
        // unknown responsibility is treated the same way and flagged.
        let merchantOwnsTax = taxResponsibility == taxMerchant
        let platformCollectedTax = taxAmountKnown && !merchantOwnsTax ? round2(knownTaxAmount) : 0
        let taxNeedsReview = taxAmountKnown && taxResponsibility == taxUnknown

        var vatDue: Double = 0
        if resolved.vatRegistered && method != methodNone {
            if taxAmountKnown {
                // The shop's own figure, never re-derived. Only the studio's own
                // share of it reaches VAT due; the margin scheme is a NivaDesk-side
                // calculation a shop knows nothing about, so a known amount does
                // not apply there and the rate is used instead.
                if merchantOwnsTax && method == methodStandard {
                    vatDue = round2(knownTaxAmount)
                } else if merchantOwnsTax && vatBase > 0 && rate > 0 {
                    vatDue = taxInsidePrice
                        ? round2(vatBase * rate / (100 + rate))
                        : round2(vatBase * rate / 100)
                }
            } else if rate > 0 && vatBase > 0 {
                vatDue = resolved.pricesIncludeVat
                    // VAT sits inside the price the customer pays: £120 at 20% is £20.
                    ? round2(vatBase * rate / (100 + rate))
                    // Quoted without VAT, so it is added on top and the customer pays more.
                    : round2(vatBase * rate / 100)
            }
        }

        let netProfit = revenue - vatDue - directCost - platformFee - order.deliveryCost - expenses.total - order.refundedAmount

        return Block(
            engineVersion: version,
            method: method,
            taxRate: rate,
            pricesIncludeVat: resolved.pricesIncludeVat,
            vatRegistered: resolved.vatRegistered,
            taxAmountKnown: taxAmountKnown,
            taxResponsibility: taxResponsibility,
            taxIncludedInPrice: taxInsidePrice,
            platformCollectedTax: platformCollectedTax,
            taxNeedsReview: taxNeedsReview,
            revenue: round2(revenue),
            receivablesTotal: round2(receivables.total),
            directCost: round2(directCost),
            grossMargin: round2(grossMargin),
            platformFee: platformFee,
            platformFeeKnown: order.platformFeeKnown,
            deliveryCost: round2(order.deliveryCost),
            otherExpenses: round2(expenses.total),
            refunded: round2(order.refundedAmount),
            vatBase: round2(vatBase),
            vatDue: vatDue,
            netProfit: round2(netProfit),
            // What the customer is asked to pay. Identical to revenue when the
            // price already includes the tax. Tax the marketplace collected is
            // money the customer paid too, so it counts here even though it
            // never reaches the studio's VAT return.
            customerTotal: round2(taxInsidePrice ? revenue : revenue + vatDue + platformCollectedTax),
            fromLineItems: fromLineItems,
            orphanKeys: receivables.orphans.map { remainingPrefix + $0 } + expenses.orphans.map { expensePrefix + $0 },
            receivableLines: receivables.lines,
            expenseLines: expenses.lines
        )
    }
}
