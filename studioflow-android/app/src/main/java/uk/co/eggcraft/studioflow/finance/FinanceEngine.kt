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

    const val VERSION = 3

    const val REMAINING_PREFIX = "financialRemaining::"
    const val EXPENSE_PREFIX = "financialExpense::"

    const val METHOD_STANDARD = "standard"
    const val METHOD_MARGIN = "margin"
    const val METHOD_NONE = "none"

    data class Line(val title: String, val amount: Double)

    data class Block(
        val engineVersion: Int,
        val method: String,
        val taxRate: Double,
        val pricesIncludeVat: Boolean,
        val vatRegistered: Boolean,
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
        defaultVatMethod = normalizeVatMethod(settings.vatMethod ?: settings.taxCalculationType, METHOD_STANDARD),
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
        val revenue = if (fromLineItems) {
            order.lineItemTotals.sum()
        } else {
            order.paidAmount + order.remainingAmount + receivablesTotal
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
            Math.abs(round2(order.paymentFee))
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

        val rate = order.taxRate?.let { percentage(it, resolved.defaultTaxRate) } ?: resolved.defaultTaxRate

        // The margin scheme's base is the selling price less the purchase price
        // and nothing else — not the fee, not the shipping, not the expenses.
        val vatBase = when (method) {
            METHOD_STANDARD -> revenue
            METHOD_MARGIN -> maxOf(grossMargin, 0.0)
            else -> 0.0
        }

        val vatDue = if (resolved.vatRegistered && method != METHOD_NONE && rate > 0 && vatBase > 0) {
            if (resolved.pricesIncludeVat) round2(vatBase * rate / (100.0 + rate))
            else round2(vatBase * rate / 100.0)
        } else 0.0

        val netProfit = revenue - vatDue - directCost - platformFee - order.deliveryCost - expensesTotal - order.refundedAmount

        return Block(
            engineVersion = VERSION,
            method = method,
            taxRate = rate,
            pricesIncludeVat = resolved.pricesIncludeVat,
            vatRegistered = resolved.vatRegistered,
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
            customerTotal = round2(if (resolved.pricesIncludeVat) revenue else revenue + vatDue),
            fromLineItems = fromLineItems,
            orphanKeys = receivableOrphans.map { REMAINING_PREFIX + it } + expenseOrphans.map { EXPENSE_PREFIX + it },
            receivableLines = receivableLines,
            expenseLines = expenseLines
        )
    }
}
