package uk.co.eggcraft.studioflow.finance

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Android's finance mirror against the server's own golden vectors.
 *
 * Five implementations used to answer "what did this order earn" and they
 * disagreed by hundreds of pounds on the same order. There is one definition
 * now, in functions/finance/engine.js, and the server stamps its answer onto
 * every order. Android shows that block — but it also has to compute the same
 * figures while somebody is typing, and two implementations of the same
 * arithmetic drift.
 *
 * So this reads the SAME file the server test reads,
 * functions/finance/vectors.json, and runs every case through FinanceEngine. If
 * a formula here starts to differ from the server's, this fails rather than a
 * customer's accounts.
 */
class FinanceEngineVectorsTest {

    private fun repoRoot(): File {
        // The test runs with the module directory as the working directory.
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            if (File(dir, "functions/finance/vectors.json").isFile) return dir
            dir = dir.parentFile
        }
        throw IllegalStateException("functions/finance/vectors.json not found above ${File("").absolutePath}")
    }

    // --- a small JSON reader, so the mirror needs no dependency of its own ---

    private class Json(private val text: String) {
        private var at = 0
        fun parse(): Any? { skip(); val value = value(); skip(); return value }
        private fun skip() { while (at < text.length && text[at].isWhitespace()) at++ }
        private fun value(): Any? {
            skip()
            return when (text[at]) {
                '{' -> obj()
                '[' -> arr()
                '"' -> str()
                't' -> { at += 4; true }
                'f' -> { at += 5; false }
                'n' -> { at += 4; null }
                else -> num()
            }
        }
        private fun obj(): Map<String, Any?> {
            val map = LinkedHashMap<String, Any?>()
            at++ // {
            skip()
            if (text[at] == '}') { at++; return map }
            while (true) {
                skip(); val key = str(); skip(); at++ // :
                map[key] = value(); skip()
                if (text[at] == ',') { at++; continue }
                at++ // }
                return map
            }
        }
        private fun arr(): List<Any?> {
            val list = mutableListOf<Any?>()
            at++ // [
            skip()
            if (text[at] == ']') { at++; return list }
            while (true) {
                list.add(value()); skip()
                if (text[at] == ',') { at++; continue }
                at++ // ]
                return list
            }
        }
        private fun str(): String {
            val out = StringBuilder()
            at++ // opening quote
            while (text[at] != '"') {
                if (text[at] == '\\') {
                    at++
                    when (val escape = text[at]) {
                        'n' -> out.append('\n'); 't' -> out.append('\t'); 'r' -> out.append('\r')
                        'b' -> out.append('\b'); 'f' -> out.append('')
                        'u' -> { out.append(text.substring(at + 1, at + 5).toInt(16).toChar()); at += 4 }
                        else -> out.append(escape)
                    }
                } else {
                    out.append(text[at])
                }
                at++
            }
            at++ // closing quote
            return out.toString()
        }
        private fun num(): Double {
            val start = at
            while (at < text.length && (text[at].isDigit() || text[at] in "-+.eE")) at++
            return text.substring(start, at).toDouble()
        }
    }

    private fun asMap(value: Any?): Map<String, Any?> =
        @Suppress("UNCHECKED_CAST") (value as? Map<String, Any?> ?: emptyMap())

    private fun double(value: Any?): Double? = (value as? Double)

    /**
     * Money the way the engine reads it.
     *
     * A vector may store an amount as a JSON number OR as text, because order
     * fields on this platform have been text for years and `readAmount` is part
     * of the engine's contract. A runner that understood only numbers read 0 for
     * a string and stayed green while the mirror was right — a green suite that
     * proves nothing is worse than a red one. Strings go through the mirror's
     * own readAmount, which is what the app does with a Firestore string.
     */
    private fun money(value: Any?): Double = when (value) {
        is Double -> value
        is Number -> value.toDouble()
        is String -> FinanceEngine.readAmount(value)
        else -> 0.0
    }

    private fun inputFrom(order: Map<String, Any?>): FinanceEngine.Input {
        val custom = asMap(order["customFields"]).mapValues { (_, raw) ->
            when (raw) {
                is String -> raw
                is Double -> if (raw == Math.floor(raw)) raw.toLong().toString() else raw.toString()
                else -> raw?.toString().orEmpty()
            }
        }
        // Every object counts, even one whose lineTotal is missing or text — the
        // server counts the ITEM and reads its total with readAmount, so a
        // runner that dropped such a line would disagree about `fromLineItems`
        // and therefore about which revenue rule applies.
        val lineItems = (order["lineItems"] as? List<*>).orEmpty().map { item ->
            money(asMap(item)["lineTotal"])
        }
        return FinanceEngine.Input(
            paidAmount = money(order["paidAmount"]),
            remainingAmount = money(order["remainingAmount"]),
            watchPurchasePrice = money(order["watchPurchasePrice"]),
            deliveryCost = money(order["deliveryCost"]),
            refundedAmount = money(order["refundedAmount"]),
            paymentFee = money(order["paymentFee"]),
            platformFeeKnown = order["platformFeeKnown"] == true,
            taxRate = if (order.containsKey("taxRate")) money(order["taxRate"]) else null,
            taxType = order["taxType"] as? String ?: "",
            // The tax a shop actually charged, and whose it is.
            //
            // A vector input that is not read here is not tested: the mirror
            // would compute the case with the field missing, quietly agree with
            // itself, and the suite would stay green while a real Etsy order
            // came out wrong. `taxAmountKnown` is the whole gate — a stored
            // `taxAmount` on a manual order is NivaDesk's own figure, so
            // without the flag the rate still rules and this must carry the
            // flag through exactly as the vectors write it.
            taxAmountKnown = order["taxAmountKnown"] == true,
            taxAmount = money(order["taxAmount"]),
            // Left as the raw string the shop sent — "seller", "marketplace"
            // and the rest are the engine's to normalise, not this runner's. A
            // synonym translated here would test the translation instead of the
            // mirror.
            taxResponsibility = order["taxResponsibility"] as? String ?: "",
            // Nullable on purpose. Absent means the shop did not say, which is
            // not the same as "no": it falls back to the workspace's own
            // pricesIncludeVat. A plain Boolean defaulting to false would answer
            // for the shop and make every silent order look tax-exclusive.
            taxIncludedInPrice = order["taxIncludedInPrice"] as? Boolean,
            lineItemTotals = lineItems,
            customFields = custom
        )
    }

    private fun settingsFrom(settings: Map<String, Any?>) = FinanceEngine.Settings(
        feePercentage = double(settings["feePercentage"]),
        defaultTaxRate = double(settings["defaultTaxRate"]),
        vatRegistered = settings["vatRegistered"] as? Boolean,
        pricesIncludeVat = settings["pricesIncludeVat"] as? Boolean,
        vatMethod = settings["vatMethod"] as? String,
        taxCalculationType = settings["taxCalculationType"] as? String,
        taxMilestoneEnabled = settings["taxMilestoneEnabled"] as? Boolean,
        taxMilestoneDateSeconds = double(settings["taxMilestoneDate"])
    )

    /**
     * Resolves an expected key to the figure the mirror produced.
     *
     * Every key a vector expects has to appear here, and the `else` throws for
     * exactly that reason: a key nobody mapped would otherwise be skipped, the
     * case would count as passed, and the suite would stay green over a figure
     * no one ever compared. The vectors are the only thing holding four
     * implementations to the same arithmetic, so a missing branch is a hole in
     * the net rather than an omission.
     */
    private fun figure(block: FinanceEngine.Block, field: String): Any? = when (field) {
        "revenue" -> block.revenue
        "receivablesTotal" -> block.receivablesTotal
        "directCost" -> block.directCost
        "grossMargin" -> block.grossMargin
        "platformFee" -> block.platformFee
        "deliveryCost" -> block.deliveryCost
        "otherExpenses" -> block.otherExpenses
        "refunded" -> block.refunded
        "vatBase" -> block.vatBase
        "vatDue" -> block.vatDue
        "netProfit" -> block.netProfit
        "customerTotal" -> block.customerTotal
        "taxRate" -> block.taxRate
        "method" -> block.method
        "vatRegistered" -> block.vatRegistered
        "pricesIncludeVat" -> block.pricesIncludeVat
        "fromLineItems" -> block.fromLineItems
        "platformFeeKnown" -> block.platformFeeKnown
        // Where the tax figure came from and whose it is. `platformCollectedTax`
        // is money the customer paid that the studio never declares, and
        // `taxNeedsReview` is the engine refusing to guess when nobody has said
        // — both are reported beside VAT due rather than folded into it, so a
        // mirror could get vatDue right and still be wrong about the return.
        "taxAmountKnown" -> block.taxAmountKnown
        "taxResponsibility" -> block.taxResponsibility
        "taxIncludedInPrice" -> block.taxIncludedInPrice
        "platformCollectedTax" -> block.platformCollectedTax
        "taxNeedsReview" -> block.taxNeedsReview
        "orphanKeys" -> block.orphanKeys
        else -> throw IllegalArgumentException("the vectors expect a figure the mirror does not expose: $field")
    }

    @Test
    fun `the mirror produces the server's numbers for every golden vector`() {
        val file = File(repoRoot(), "functions/finance/vectors.json")
        val root = asMap(Json(file.readText()).parse())

        assertEquals(
            "the vector file and the Android mirror disagree on the engine version",
            FinanceEngine.VERSION.toDouble(),
            double(root["engineVersion"]) ?: -1.0,
            0.0
        )

        val cases = (root["cases"] as? List<*>).orEmpty()
        // The floor is the real count, not a number set when the file was
        // smaller: at 15 a parser fault could silently skip seventeen vectors
        // and the suite would still call itself green.
        assertTrue("expected every vector to be read, got ${cases.size}", cases.size >= 36)

        val failures = mutableListOf<String>()
        for (raw in cases) {
            val case = asMap(raw)
            val name = case["name"] as? String ?: "?"
            val paymentDateMs = double(asMap(case["options"])["paymentDateMs"])?.toLong()
            val block = FinanceEngine.compute(
                inputFrom(asMap(case["order"])),
                settingsFrom(asMap(case["settings"])),
                paymentDateMs
            )
            for ((field, expected) in asMap(case["expect"])) {
                val actual = figure(block, field)
                when (expected) {
                    is Double -> if (Math.abs((actual as Double) - expected) >= 0.005) {
                        failures.add("$name -> $field: $actual != $expected")
                    }
                    is List<*> -> if (actual != expected) failures.add("$name -> $field: $actual != $expected")
                    else -> if (actual != expected) failures.add("$name -> $field: $actual != $expected")
                }
            }
        }

        assertTrue(
            "the Android mirror has drifted from the server engine:\n" + failures.joinToString("\n"),
            failures.isEmpty()
        )
    }

    @Test
    fun `hiding the base cost cannot change a figure, because the engine never sees that setting`() {
        val order = FinanceEngine.Input(paidAmount = 1000.0, watchPurchasePrice = 400.0, taxRate = 20.0)
        val settings = FinanceEngine.Settings(feePercentage = 3.0, taxCalculationType = "Profit")
        assertEquals(FinanceEngine.compute(order, settings), FinanceEngine.compute(order, settings))
        assertEquals(400.0, FinanceEngine.compute(order, settings).directCost, 0.005)
    }

    @Test
    fun `an expected key the runner cannot resolve fails loudly instead of passing quietly`() {
        // The one failure this file cannot survive. When the engine gains a
        // field and the vectors start expecting it, a runner that shrugged at
        // the unknown name would report a green suite over a figure it never
        // compared — the worst possible answer, because it is indistinguishable
        // from agreement. So the net is checked here rather than trusted.
        val block = FinanceEngine.compute(FinanceEngine.Input(paidAmount = 100.0), FinanceEngine.Settings())
        try {
            figure(block, "aFieldTheEngineHasNotGrownYet")
            throw AssertionError("the runner accepted an expected key it cannot resolve")
        } catch (expected: IllegalArgumentException) {
            assertTrue(expected.message.orEmpty().contains("aFieldTheEngineHasNotGrownYet"))
        }
    }

    @Test
    fun `a pasted thousands separator is read as the person meant it`() {
        assertEquals(1234.56, FinanceEngine.readAmount("1,234.56"), 0.0005)
        assertEquals(1234.56, FinanceEngine.readAmount("1.234,56"), 0.0005)
        assertEquals(12.5, FinanceEngine.readAmount("12,50"), 0.0005)
        assertEquals(0.75, FinanceEngine.readAmount("0.750"), 0.0005)
        assertEquals(-50.0, FinanceEngine.readAmount("-50"), 0.0005)
        assertEquals(12.345, FinanceEngine.readAmount("12.345"), 0.0005)
        assertEquals(0.0, FinanceEngine.readAmount(""), 0.0005)
    }
}
