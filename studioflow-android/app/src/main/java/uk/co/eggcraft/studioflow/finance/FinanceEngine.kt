package uk.co.eggcraft.studioflow.finance

/**
 * Android's mirror of the Finance Engine.
 *
 * The server stamps every order with a `finance` block and that block is what
 * Android SHOWS. This exists for the one thing the block cannot do: while
 * somebody is typing into the finance card the figures have to move before the
 * write has been made, and a preview computed by a different rule than the
 * engine's makes the number jump when the server's answer arrives.
 *
 * A faithful port of functions/finance/engine.js, held to the same golden
 * vectors — FinanceEngineVectorsTest runs functions/finance/vectors.json
 * through this file, so the two cannot drift apart quietly.
 *
 * Do not change a formula here. Change functions/finance/engine.js, add a
 * vector, then port it across. Specification: docs/finance-engine.md.
 */
object FinanceEngine {

    const val VERSION = 4

    const val REMAINING_PREFIX = "financialRemaining::"
    const val EXPENSE_PREFIX = "financialExpense::"

    const val METHOD_STANDARD = "standard"
    const val METHOD_MARGIN = "margin"
    const val METHOD_NONE = "none"

    // Whose tax is it. A shop tells us what tax it charged; it does not tell us
    // whether that tax is the studio's to declare, and conflating the two gets
    // the VAT return wrong in one direction or the other.
    //
    //   merchant  the studio charged it and the studio declares it. Shopify,
    //             WooCommerce and Square sales are normally this — those
    //             platforms help calculate the tax, they do not remit it.
    //   platform  the marketplace collected it and remits it itself. It belongs
    //             on the order so the totals add up, and NOT in the VAT due.
    //   unknown   nobody has said. The engine refuses to guess: the amount is
    //             shown, left out of VAT due, and the order is marked for
    //             review.
    //
    // Deliberately per order, not per channel — Etsy collects and remits in some
    // jurisdictions and leaves the seller responsible in others, so "it is an
    // Etsy order" is not an answer.
    const val TAX_MERCHANT = "merchant"
    const val TAX_PLATFORM = "platform"
    const val TAX_UNKNOWN = "unknown"

    data class Line(val title: String, val amount: Double)

    data class Block(
        val engineVersion: Int,
        val method: String,
        val taxRate: Double,
        val pricesIncludeVat: Boolean,
        val vatRegistered: Boolean,
        /** Whether the tax figure is the shop's own or nobody filled it in. */
        val taxAmountKnown: Boolean,
        /** merchant, platform or unknown — see the constants above. */
        val taxResponsibility: String,
        /** Whether the tax sits inside the price or was added on top of it. */
        val taxIncludedInPrice: Boolean,
        /**
         * Tax a marketplace collected and remits itself. Real money the customer
         * paid, so it counts towards what they were asked for, but never the
         * studio's to declare — a screen shows it beside VAT due, not inside it.
         */
        val platformCollectedTax: Double,
        /** A shop sent a tax figure and nobody has said whose it is. */
        val taxNeedsReview: Boolean,
        val revenue: Double,
        val receivablesTotal: Double,
        val directCost: Double,
        val grossMargin: Double,
        val platformFee: Double,
        val platformFeeKnown: Boolean,
        val deliveryCost: Double,
        val otherExpenses: Double,
        val refunded: Double,
        val vatBase: Double,
        val vatDue: Double,
        val netProfit: Double,
        val customerTotal: Double,
        val fromLineItems: Boolean,
        val orphanKeys: List<String>,
        val receivableLines: List<Line> = emptyList(),
        val expenseLines: List<Line> = emptyList()
    )

    /** What the engine reads off an order. */
    data class Input(
        val paidAmount: Double = 0.0,
        val remainingAmount: Double = 0.0,
        val watchPurchasePrice: Double = 0.0,
        val deliveryCost: Double = 0.0,
        val refundedAmount: Double = 0.0,
        val paymentFee: Double = 0.0,
        /** Set only by a connector that was told the platform's real commission. */
        val platformFeeKnown: Boolean = false,
        val taxRate: Double? = null,
        val taxType: String = "",
        /**
         * Set only when the shop told us the tax it charged. Every channel
         * mapper writes `taxRate: 0` because no shop API returns a rate, so this
         * is what tells a shop that charged nothing apart from a field nobody
         * filled in — the same distinction [platformFeeKnown] makes for the fee.
         */
        val taxAmountKnown: Boolean = false,
        /** The shop's own figure, read as an absolute amount, never a rate. */
        val taxAmount: Double = 0.0,
        /** merchant, seller, self, platform, marketplace, facilitator — or blank. */
        val taxResponsibility: String = "",
        /** null when the shop did not say, and the workspace's setting stands. */
        val taxIncludedInPrice: Boolean? = null,
        val lineItemTotals: List<Double> = emptyList(),
        val customFields: Map<String, String> = emptyMap()
    )

    /** What the engine reads off the workspace. */
    data class Settings(
        val feePercentage: Double? = null,
        val defaultTaxRate: Double? = null,
        val vatRegistered: Boolean? = null,
        val pricesIncludeVat: Boolean? = null,
        val vatMethod: String? = null,
        val taxCalculationType: String? = null,
        val taxMilestoneEnabled: Boolean? = null,
        val taxMilestoneDateSeconds: Double? = null
    )

    // ----------------------------------------------------------------------
    // Reading a stored amount
    // ----------------------------------------------------------------------

    private val CANONICAL = Regex("^-?\\d+(\\.\\d+)?$")

    /**
     * Reads a money value at full precision, keeping its sign. Our own clients
     * write a plain dot decimal, so that shape is taken at face value; anything
     * else came from a text field on some platform and gets the same
     * last-separator-wins reading the input fields use.
     */
    fun readAmount(raw: String?): Double {
        val text = raw?.trim().orEmpty()
        if (text.isEmpty()) return 0.0
        if (CANONICAL.matches(text)) return text.toDoubleOrNull() ?: 0.0

        val kept = StringBuilder()
        for (character in text) {
            when {
                character.isDigit() -> kept.append(character)
                character == ',' || character == '.' -> kept.append(character)
                character == '-' && kept.isEmpty() -> kept.append(character)
            }
        }
        if (kept.none { it.isDigit() }) return 0.0

        val negative = kept.startsWith("-")
        var body = kept.toString().replace("-", "")
        val hasComma = body.contains(',')
        val hasDot = body.contains('.')

        if (hasComma && hasDot) {
            val decimal = if (body.lastIndexOf(',') > body.lastIndexOf('.')) ',' else '.'
            val grouping = if (decimal == ',') '.' else ','
            body = body.replace(grouping.toString(), "")
            if (decimal == ',') body = body.replaceFirst(",", ".")
        } else if (hasComma || hasDot) {
            val separator = if (hasComma) ',' else '.'
            val occurrences = body.count { it == separator }
            if (occurrences > 1) {
                body = body.replace(separator.toString(), "")
            } else {
                val cut = body.indexOf(separator)
                val before = body.substring(0, cut)
                val after = body.substring(cut + 1)
                // A thousands group is exactly three digits behind one to three
                // that do not start with a zero, so "0.750" is three quarters.
                val grouped = after.length == 3 && before.isNotEmpty() && before.length <= 3 && !before.startsWith("0")
                body = if (grouped) before + after else "$before.$after"
            }
        }

        val value = body.toDoubleOrNull() ?: return 0.0
        if (value.isNaN() || value.isInfinite()) return 0.0
        return if (negative) -value else value
    }

    /** Two decimal places, away from zero, applied once at the output. */
    fun round2(value: Double): Double {
        if (value.isNaN() || value.isInfinite()) return 0.0
        val rounded = Math.round(Math.abs(value) * 100.0) / 100.0
        return if (value < 0) -rounded else rounded
    }

    private fun percentage(raw: Double?, fallback: Double): Double {
        val number = raw ?: return fallback
        if (number.isNaN() || number.isInfinite() || number < 0) return fallback
        return minOf(Math.round(number * 100.0) / 100.0, 100.0)
    }

    // ----------------------------------------------------------------------
    // The VAT method
    // ----------------------------------------------------------------------

    /** `Revenue` is the standard scheme and `Profit` is the margin scheme. */
    fun normalizeVatMethod(raw: String?, fallback: String = METHOD_STANDARD): String {
        val text = raw?.trim()?.lowercase().orEmpty()
        if (text.isEmpty()) return fallback
        if (text == METHOD_STANDARD || text == "revenue" || text.contains("standard")) return METHOD_STANDARD
        if (text == METHOD_MARGIN || text == "profit" || text.contains("margin")) return METHOD_MARGIN
        if (text == METHOD_NONE || text.contains("no vat") || text == "novat" || text == "exempt") return METHOD_NONE
        return fallback
    }

    // ----------------------------------------------------------------------
    // Whose tax is it
    // ----------------------------------------------------------------------

    /**
     * Reads what a shop called the party responsible for the tax. Each platform
     * has its own word for the same two answers — a seller is a merchant and a
     * marketplace facilitator is a platform — and anything the engine does not
     * recognise becomes [TAX_UNKNOWN] rather than a guess, because guessing
     * wrong overstates a VAT return in one direction and understates it in the
     * other and neither is recoverable from the number alone.
     */
    fun normalizeTaxResponsibility(raw: String?, fallback: String = TAX_UNKNOWN): String {
        val text = raw?.trim()?.lowercase().orEmpty()
        if (text.isEmpty()) return fallback
        if (text == TAX_MERCHANT || text == "seller" || text == "self") return TAX_MERCHANT
        if (text == TAX_PLATFORM || text == "marketplace" || text == "facilitator") return TAX_PLATFORM
        return TAX_UNKNOWN
    }

    private data class Resolved(
        val feePercentage: Double,
        val defaultTaxRate: Double,
        val vatRegistered: Boolean,
        val pricesIncludeVat: Boolean,
        val defaultVatMethod: String,
        val taxMilestoneEnabled: Boolean,
        val taxMilestoneDateSeconds: Double
    )

    private fun resolve(settings: Settings): Resolved = Resolved(
        feePercentage = percentage(settings.feePercentage, 3.0),
        defaultTaxRate = percentage(settings.defaultTaxRate, 20.0),
        vatRegistered = settings.vatRegistered ?: true,
        pricesIncludeVat = settings.pricesIncludeVat ?: true,
        // `?:` fires on null only; the server's `||` also falls through on an
        // empty string, and a workspace that stored `vatMethod: ""` beside a
        // real `taxCalculationType` would otherwise take the standard scheme
        // here and the margin scheme on the server.
        defaultVatMethod = normalizeVatMethod(settings.vatMethod?.ifEmpty { null } ?: settings.taxCalculationType, METHOD_STANDARD),
        taxMilestoneEnabled = settings.taxMilestoneEnabled ?: false,
        taxMilestoneDateSeconds = settings.taxMilestoneDateSeconds ?: 0.0
    )

    // ----------------------------------------------------------------------
    // Custom amount lines
    // ----------------------------------------------------------------------

    private fun headingTitles(raw: String?): Set<String> {
        val text = raw?.trim().orEmpty()
        if (text.isEmpty()) return emptySet()
        // Only the titles are needed, and a hand parse keeps this file free of
        // a JSON dependency so the vector test can run on a plain JVM.
        val titles = mutableSetOf<String>()
        val matcher = Regex("\"title\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"")
        for (match in matcher.findAll(text)) {
            val title = match.groupValues[1]
                .replace("\\\"", "\"")
                .replace("\\\\", "\\")
                .trim()
            if (title.isNotEmpty()) titles.add(title)
        }
        return titles
    }

    /**
     * Every stored key counts. The heading list decides the order and the label
     * a screen shows, never whether an amount is money — dropping an amount
     * whose heading was renamed made a total quietly smaller than its own rows.
     */
    fun customLineTotal(
        customFields: Map<String, String>,
        prefix: String,
        headingKey: String
    ): Triple<Double, List<Line>, List<String>> {
        val allowed = headingTitles(customFields[headingKey])
        val lines = mutableListOf<Line>()
        val orphans = mutableListOf<String>()
        var total = 0.0

        for ((key, raw) in customFields) {
            if (!key.startsWith(prefix)) continue
            val title = key.substring(prefix.length)
            if (title.isEmpty()) continue
            val amount = readAmount(raw)
            total += amount
            lines.add(Line(title, amount))
            if (allowed.isNotEmpty() && !allowed.contains(title)) orphans.add(title)
        }

        return Triple(total, lines.sortedBy { it.title }, orphans.sorted())
    }

    // ----------------------------------------------------------------------
    // The engine
    // ----------------------------------------------------------------------

    /** Computes every money figure for one order. A port; do not diverge. */
    fun compute(order: Input, settings: Settings, paymentDateMs: Long? = null): Block {
        val resolved = resolve(settings)

        val (receivablesTotal, receivableLines, receivableOrphans) =
            customLineTotal(order.customFields, REMAINING_PREFIX, "orderRemainingItemsJSON")
        val (expensesTotal, expenseLines, expenseOrphans) =
            customLineTotal(order.customFields, EXPENSE_PREFIX, "orderExpenseItemsJSON")

        val fromLineItems = order.lineItemTotals.isNotEmpty()
        // An order that carries invoice lines is worth what its lines say — the
        // rule the invoice renderers on every platform already follow.
        //
        // Without lines the sale is measured from the money instead, and that is
        // where a refund used to be counted twice. Linking a bank refund to an
        // order lowers `paidAmount` AND raises `refundedAmount`, so the sale
        // shrank by the refund and then the profit line subtracted it again: a
        // £1,000 sale refunded £200 came out £200 short. Adding the refund back
        // restores what the sale was WORTH — which is what an invoice-line order
        // reports, and what the single subtraction below reduces exactly once.
        val revenue = if (fromLineItems) {
            order.lineItemTotals.sum()
        } else {
            order.paidAmount + order.remainingAmount + receivablesTotal + order.refundedAmount
        }

        val directCost = order.watchPurchasePrice
        val grossMargin = revenue - directCost
        // What the sale actually cost to take, when the shop told us. The
        // percentage is a stand-in for a number only the platform knows; where a
        // connector has the real figure, using the estimate is a second,
        // disagreeing definition of the same cost. `platformFeeKnown` is what
        // tells a real fee of zero apart from a field nobody filled in — every
        // existing writer of `paymentFee` puts the estimate there, so a number
        // alone proves nothing.
        val platformFee = if (order.platformFeeKnown) {
            round2(Math.abs(order.paymentFee))
        } else {
            round2(revenue * resolved.feePercentage / 100.0)
        }

        val own = normalizeVatMethod(order.taxType, "")
        val method = when {
            own.isNotEmpty() -> own
            resolved.taxMilestoneEnabled && paymentDateMs != null ->
                if (paymentDateMs / 1000.0 >= resolved.taxMilestoneDateSeconds) METHOD_STANDARD else METHOD_MARGIN
            else -> resolved.defaultVatMethod
        }

        val storedRate = order.taxRate?.let { percentage(it, resolved.defaultTaxRate) } ?: resolved.defaultTaxRate
        // A channel order carries `taxRate: 0` as a placeholder, not as an
        // answer: no shop API returns a rate, so the mappers write zero and send
        // the real figure in `taxAmount` instead. Once the amount is known that
        // zero holds no information, and reading it as "zero-rated" would zero
        // the margin scheme's VAT too — a calculation no shop can do for us.
        val rate = if (order.taxAmountKnown && storedRate == 0.0) resolved.defaultTaxRate else storedRate

        // The margin scheme's base is the selling price less the purchase price
        // and nothing else — not the fee, not the shipping, not the expenses.
        val vatBase = when (method) {
            METHOD_STANDARD -> revenue
            METHOD_MARGIN -> maxOf(grossMargin, 0.0)
            else -> 0.0
        }

        // The tax the shop itself charged, when it told us.
        //
        // Every channel mapper writes `taxRate: 0` because no shop API returns a
        // rate, and the gate below used to be on the rate — so a Shopify,
        // WooCommerce, Etsy, Square or website sale reported no VAT at all while
        // `taxAmount` held the real figure the customer paid. Re-deriving a rate
        // from the amount would be worse than useless on a mixed basket, so a
        // known amount is simply used as the amount.
        val taxAmountKnown = order.taxAmountKnown
        val knownTaxAmount = if (taxAmountKnown) Math.abs(order.taxAmount) else 0.0
        val taxResponsibility = if (taxAmountKnown) {
            normalizeTaxResponsibility(order.taxResponsibility)
        } else {
            TAX_MERCHANT
        }

        // Whether the tax sits inside the price or is added to it. A shop knows
        // this per order and says so; without a shop's answer the workspace's own
        // setting stands, which is how every order behaved before.
        val shopSaidTaxIsInside = order.taxIncludedInPrice
        val taxInsidePrice = if (taxAmountKnown && shopSaidTaxIsInside != null) {
            shopSaidTaxIsInside
        } else {
            resolved.pricesIncludeVat
        }

        // Tax a marketplace collected and remits itself is real money the
        // customer paid and it belongs on the order, but it is not the studio's
        // to declare, so it is reported beside VAT due rather than inside it. An
        // unknown responsibility is treated the same way and flagged.
        val merchantOwnsTax = taxResponsibility == TAX_MERCHANT
        val platformCollectedTax = if (taxAmountKnown && !merchantOwnsTax) round2(knownTaxAmount) else 0.0
        val taxNeedsReview = taxAmountKnown && taxResponsibility == TAX_UNKNOWN

        var vatDue = 0.0
        if (resolved.vatRegistered && method != METHOD_NONE) {
            if (taxAmountKnown) {
                // The shop's own figure, never re-derived. Only the studio's own
                // share of it reaches VAT due; the margin scheme is a
                // NivaDesk-side calculation that a shop knows nothing about, so
                // a known amount does not apply there.
                if (merchantOwnsTax && method == METHOD_STANDARD) {
                    vatDue = round2(knownTaxAmount)
                } else if (merchantOwnsTax && vatBase > 0 && rate > 0) {
                    vatDue = if (taxInsidePrice) round2(vatBase * rate / (100.0 + rate))
                    else round2(vatBase * rate / 100.0)
                }
            } else if (rate > 0 && vatBase > 0) {
                vatDue = if (resolved.pricesIncludeVat) round2(vatBase * rate / (100.0 + rate))
                else round2(vatBase * rate / 100.0)
            }
        }

        val netProfit = revenue - vatDue - directCost - platformFee - order.deliveryCost - expensesTotal - order.refundedAmount

        return Block(
            engineVersion = VERSION,
            method = method,
            taxRate = rate,
            pricesIncludeVat = resolved.pricesIncludeVat,
            vatRegistered = resolved.vatRegistered,
            // Where the tax figure came from and whose it is, so a screen can
            // say "Platform collected tax" rather than showing a VAT total that
            // quietly disagrees with what the customer paid.
            taxAmountKnown = taxAmountKnown,
            taxResponsibility = taxResponsibility,
            taxIncludedInPrice = taxInsidePrice,
            platformCollectedTax = platformCollectedTax,
            taxNeedsReview = taxNeedsReview,
            revenue = round2(revenue),
            receivablesTotal = round2(receivablesTotal),
            directCost = round2(directCost),
            grossMargin = round2(grossMargin),
            platformFee = platformFee,
            platformFeeKnown = order.platformFeeKnown,
            deliveryCost = round2(order.deliveryCost),
            otherExpenses = round2(expensesTotal),
            refunded = round2(order.refundedAmount),
            vatBase = round2(vatBase),
            vatDue = vatDue,
            netProfit = round2(netProfit),
            // What the customer is asked to pay. Identical to revenue when the
            // price already includes the tax. Tax the marketplace collected is
            // money the customer paid too, so it counts here even though it
            // never reaches the studio's VAT return.
            customerTotal = round2(if (taxInsidePrice) revenue else revenue + vatDue + platformCollectedTax),
            fromLineItems = fromLineItems,
            orphanKeys = receivableOrphans.map { REMAINING_PREFIX + it } + expenseOrphans.map { EXPENSE_PREFIX + it },
            receivableLines = receivableLines,
            expenseLines = expenseLines
        )
    }
}
