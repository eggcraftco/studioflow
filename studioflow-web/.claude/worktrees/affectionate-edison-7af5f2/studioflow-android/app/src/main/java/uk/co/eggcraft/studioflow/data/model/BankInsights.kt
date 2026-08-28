package uk.co.eggcraft.studioflow.data.model

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.min

// Pure computation shared by the Banking screen — a port of the web app's
// lib/studioflow/bankInsights.ts (and the helpers in app/bank/page.tsx), so
// Android shows the same recurring spends, duplicates and suggestions as
// nivadesk.app and the Mac app.

val BANK_CATEGORIES = listOf(
    "Materials", "Equipment", "Shipping", "Software", "Subscriptions", "Fees",
    "Marketing", "Travel", "Utilities", "Rent", "Staff", "Tax", "Other"
)

// NivaDesk's own VAT treatments — the accounting connector translates them
// per provider at push time, nothing here is a Pandle code. Zero-rated and
// exempt are different VAT-return boxes, so they are separate on purpose.
val BANK_VAT_CODES = listOf(
    "ST" to "Standard rate (20%)",
    "RR" to "Reduced rate (5%)",
    "ZR" to "Zero-rated (0%)",
    "EX" to "Exempt",
    "OS" to "Outside scope",
    "NR" to "No VAT receipt",
    "RC" to "Reverse charge",
    "IM" to "Import VAT",
    "MX" to "Mixed / split VAT",
    "NV" to "No VAT"
)

fun bankVatLabel(code: String): String = BANK_VAT_CODES.firstOrNull { it.first == code }?.second ?: code

// Where a transaction stands on its way to the accountant; "unreviewed" is
// the absent default. Labels are English source keys (t()'d at render time),
// colours live with the UI.
val BANK_REVIEW_STATUSES = listOf(
    "unreviewed" to "Unreviewed",
    "needs_info" to "Needs information",
    "ready" to "Ready for accounting",
    "synced" to "Synced",
    "confirmed" to "Confirmed in accounting",
    "sync_error" to "Sync error",
    "ignored" to "Ignored"
)

fun bankReviewStatusLabel(code: String): String =
    BANK_REVIEW_STATUSES.firstOrNull { it.first == code }?.second ?: BANK_REVIEW_STATUSES.first().second

/** Effective VAT treatment — explicit code, else the rule-applied one, else the
 *  category default. The same fallback chain the web's Accounting review uses. */
fun bankEffectiveVat(tx: StudioBankTransaction, categoryTax: Map<String, String>): String =
    tx.vatCode.ifBlank { tx.vatCodeAuto.ifBlank { categoryTax[tx.effectiveCategory] ?: "" } }

// What an incoming payment actually is (bankUpdateTransaction's incomingKind).
// Labels are English source keys, t()'d at render time — same list as the web.
val BANK_INCOMING_KINDS = listOf(
    "" to "Unclassified income",
    "order_payment" to "Order payment",
    "invoice" to "Invoice",
    "deposit" to "Deposit",
    "refund_received" to "Refund received",
    "owner_contribution" to "Owner contribution",
    "loan" to "Loan",
    "transfer" to "Transfer between own accounts",
    "other_income" to "Other income"
)

/** Money in, but not revenue — these kinds leave every Incoming total. */
val BANK_NON_REVENUE_INCOMING_KINDS = setOf("transfer", "owner_contribution", "loan")

fun bankIncomingKindLabel(code: String): String =
    BANK_INCOMING_KINDS.firstOrNull { it.first == code }?.second ?: BANK_INCOMING_KINDS.first().second

/** Pandle's default nominal mapping — used until the workspace saves its own. */
val BANK_DEFAULT_CATEGORY_TAX = mapOf(
    "Materials" to "ST", "Equipment" to "ST", "Shipping" to "ST", "Software" to "ST", "Subscriptions" to "ST",
    "Fees" to "NV", "Marketing" to "ST", "Travel" to "ST", "Utilities" to "ST", "Rent" to "EX",
    "Staff" to "NV", "Tax" to "NV", "Other" to "ST"
)

enum class BankCadence { Weekly, Monthly, Yearly }

/** High = 4+ agreeing payments with stable amounts; Medium = detected; Low = owner-marked with little history. */
enum class BankConfidence { High, Medium, Low }

data class BankRecurringSpend(
    val key: String,
    val merchant: String,
    val cadence: BankCadence,
    val typicalAmount: Double,
    val currency: String,
    val occurrences: Int,
    val lastDate: String,
    val nextExpected: String,
    val active: Boolean,
    val monthlyEquivalent: Double,
    val priceChange: Pair<Double, Double>?,  // previous → current
    val vendorId: String = "",               // set when the owner marked this payee
    // Report §23 fields (web parity): when the pattern was first seen, how much
    // the amount wanders, roughly which day it lands on, and how sure we are.
    val firstDate: String = "",
    val amountMin: Double = 0.0,
    val amountMax: Double = 0.0,
    /** For monthly patterns: the typical day-of-month payments land on (1-31). */
    val expectedDayOfMonth: Int? = null,
    val confidence: BankConfidence = BankConfidence.Medium
) {
    /** True when this row exists because the owner said so, not because the detector found a pattern. */
    val manual: Boolean get() = vendorId.isNotBlank()
}

data class BankCategorySuggestion(val category: String, val confidence: Double, val fromHistory: Boolean, val keyword: String)

data class BankOrderLinkSuggestion(val orderId: String, val label: String, val confidence: Double)

private const val DAY_MS = 86_400_000L

private fun parseDay(value: String): Long = try {
    SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(value)?.time ?: 0L
} catch (_: Exception) { 0L }

private fun isoDay(time: Long): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(time))

private fun median(values: List<Double>): Double {
    if (values.isEmpty()) return 0.0
    val sorted = values.sorted()
    val mid = sorted.size / 2
    return if (sorted.size % 2 == 0) (sorted[mid - 1] + sorted[mid]) / 2 else sorted[mid]
}

/** "ADOBE *8123" and "ADOBE *9911" group together: first three words, digit-heavy tokens dropped. */
fun bankRecurringMerchantKey(tx: StudioBankTransaction): String {
    val base = tx.merchant.trim().lowercase()
    if (base.isBlank()) return ""
    return base.split(Regex("\\s+")).filter { !Regex("\\d{3,}").containsMatchIn(it) }.take(3).joinToString(" ")
}

/** Rule keyword for a merchant: skips card-network prefixes every foreign payment carries. */
fun bankSuggestRuleKeyword(tx: StudioBankTransaction): String {
    val base = tx.merchant.trim().lowercase()
    val noise = setOf("int'l", "intl", "pos", "card", "crd", "payment", "paypal")
    val word = base.split(Regex("[\\s*,/]+")).firstOrNull { part ->
        part.count { it.isLetter() } >= 3 && part !in noise
    } ?: base
    return word.filter { it.isLetterOrDigit() || it in ". -" }.take(60)
}

private fun cadenceFor(days: Double): BankCadence? = when {
    days in 5.5..8.5 -> BankCadence.Weekly
    days in 24.0..38.0 -> BankCadence.Monthly
    days in 330.0..400.0 -> BankCadence.Yearly
    else -> null
}

private fun cadenceDays(cadence: BankCadence): Double = when (cadence) {
    BankCadence.Weekly -> 7.0; BankCadence.Monthly -> 30.44; BankCadence.Yearly -> 365.25
}

private fun monthlyFactor(cadence: BankCadence): Double = when (cadence) {
    BankCadence.Weekly -> 4.345; BankCadence.Monthly -> 1.0; BankCadence.Yearly -> 1.0 / 12
}

/** merchant key → the vendor the owner filed it under. */
fun bankVendorKeyMap(vendors: List<StudioBankVendor>): Map<String, StudioBankVendor> {
    val map = mutableMapOf<String, StudioBankVendor>()
    for (vendor in vendors) for (key in vendor.keys) if (key.isNotBlank()) map[key] = vendor
    return map
}

/**
 * Owner-marked payees ([vendors]) always show up: their aliases collapse into one
 * row, a single payment is enough, and the cadence is the one the owner picked.
 * Everything else still has to earn its place through the gap/amount gates.
 */
fun bankDetectRecurring(transactions: List<StudioBankTransaction>, vendors: List<StudioBankVendor> = emptyList()): List<BankRecurringSpend> {
    val byKey = bankVendorKeyMap(vendors)
    val groups = transactions.filter { it.isSpending && it.bookingDate.isNotBlank() }
        .groupBy { tx -> bankRecurringMerchantKey(tx).let { byKey[it]?.id ?: it } }
        .filterKeys { it.length >= 3 }

    val results = mutableListOf<BankRecurringSpend>()
    val now = System.currentTimeMillis()
    for ((key, entries) in groups) {
        val vendor = vendors.firstOrNull { it.id == key }
        val minimum = if (vendor != null) 1 else 3
        if (entries.size < minimum) continue
        val sorted = entries.sortedBy { parseDay(it.bookingDate) }
        val unique = mutableListOf<StudioBankTransaction>()
        for (tx in sorted) if (unique.isEmpty() || parseDay(unique.last().bookingDate) != parseDay(tx.bookingDate)) unique.add(tx)
        if (unique.size < minimum) continue

        val intervals = (1 until unique.size).map { (parseDay(unique[it].bookingDate) - parseDay(unique[it - 1].bookingDate)).toDouble() / DAY_MS }
        val cadence = vendor?.cadence ?: cadenceFor(median(intervals)) ?: continue
        if (vendor == null) {
            val agreeing = intervals.count { cadenceFor(it) == cadence }
            if (agreeing.toDouble() / intervals.size < 0.6) continue
        }

        val amounts = unique.map { abs(it.amount) }
        val typical = median(amounts)
        if (vendor == null) {
            val stable = amounts.count { abs(it - typical) <= typical * 0.3 }
            if (stable.toDouble() / amounts.size < 0.6) continue
        }

        val last = unique.last()
        val lastTime = parseDay(last.bookingDate)
        val expected = cadenceDays(cadence)
        val previousTypical = median(amounts.dropLast(1))
        val lastAmount = amounts.last()
        val priceChange = if (previousTypical > 0 && abs(lastAmount - previousTypical) >= maxOf(0.5, previousTypical * 0.05))
            previousTypical to lastAmount else null

        val stableCount = amounts.count { abs(it - typical) <= typical * 0.3 }
        val confidence = when {
            vendor != null && unique.size < 3 -> BankConfidence.Low
            unique.size >= 4 && stableCount.toDouble() / amounts.size >= 0.8 -> BankConfidence.High
            else -> BankConfidence.Medium
        }
        // Monthly cadence only: the most frequent day-of-month (first seen wins ties,
        // matching the web's stable sort).
        val expectedDayOfMonth = if (cadence == BankCadence.Monthly) {
            val dayCounts = LinkedHashMap<Int, Int>()
            for (tx in unique) {
                val calendar = Calendar.getInstance()
                calendar.timeInMillis = parseDay(tx.bookingDate)
                val day = calendar.get(Calendar.DAY_OF_MONTH)
                dayCounts[day] = (dayCounts[day] ?: 0) + 1
            }
            dayCounts.entries.maxByOrNull { it.value }?.key
        } else null

        results.add(
            BankRecurringSpend(
                key = key,
                merchant = vendor?.name?.ifBlank { last.merchant } ?: last.merchant,
                cadence = cadence,
                typicalAmount = typical,
                currency = last.currency.ifBlank { "GBP" },
                occurrences = unique.size,
                lastDate = last.bookingDate,
                nextExpected = isoDay(lastTime + (expected * DAY_MS).toLong()),
                active = now - lastTime <= (expected * DAY_MS * (if (vendor != null) 2.4 else 1.6)).toLong(),
                monthlyEquivalent = typical * monthlyFactor(cadence),
                priceChange = priceChange,
                vendorId = vendor?.id ?: "",
                firstDate = unique.first().bookingDate,
                amountMin = amounts.minOrNull() ?: typical,
                amountMax = amounts.maxOrNull() ?: typical,
                expectedDayOfMonth = expectedDayOfMonth,
                confidence = confidence
            )
        )
    }
    return results.sortedByDescending { it.monthlyEquivalent }
}

/** Same merchant, same amount, booked within two days — both sides get flagged. */
fun bankDetectDuplicates(transactions: List<StudioBankTransaction>): Set<String> {
    val flagged = mutableSetOf<String>()
    transactions.filter { it.isSpending && it.bookingDate.isNotBlank() }
        .groupBy { "${bankRecurringMerchantKey(it)}|${String.format(Locale.UK, "%.2f", abs(it.amount))}" }
        .values.filter { it.size >= 2 }
        .forEach { list ->
            val sorted = list.sortedBy { it.bookingDate }
            for (index in 1 until sorted.size) {
                val gap = (parseDay(sorted[index].bookingDate) - parseDay(sorted[index - 1].bookingDate)).toDouble() / DAY_MS
                if (gap <= 2) { flagged.add(sorted[index - 1].id); flagged.add(sorted[index].id) }
            }
        }
    return flagged
}

private val CATEGORY_KEYWORDS: List<Pair<String, List<String>>> = listOf(
    "Software" to listOf("adobe", "openai", "anthropic", "google*gsuite", "gsuite", "google workspace", "microsoft", "eset", "akismet", "github", "notion", "figma", "canva", "dropbox", "icloud", "apple.com/bill", "zoom", "slack", "1password", "cloudflare", "godaddy", "hostinger", "ionos"),
    "Subscriptions" to listOf("shopify", "squarespace", "wix", "spotify", "netflix", "cookieyes", "creem.io", "patreon", "membership", "subscription"),
    "Shipping" to listOf("royal mail", "dhl", "ups", "fedex", "evri", "hermes", "parcelforce", "parcel2go", "dpd", "click and drop", "postage"),
    "Fees" to listOf("stripe", "paypal", "non-sterling", "transaction fee", "bank charge", "sumup", "square", "klarna", "wise"),
    "Marketing" to listOf("facebk", "facebook", "meta ads", "google ads", "adwords", "instagram", "mailchimp", "linkedin", "etsy ads", "tiktok"),
    "Travel" to listOf("uber", "trainline", "tfl", "national rail", "easyjet", "ryanair", "british airways", "bp ", "shell ", "esso", "texaco", "parking", "ringgo", "just park"),
    "Utilities" to listOf("octopus", "edf", "british gas", "eon", "ovo", "thames water", "vodafone", "ee ltd", "o2 ", "three", "bt group", "virgin media", "sky "),
    "Tax" to listOf("hmrc"),
    "Rent" to listOf("rent", "lovespace", "storage", "wework", "regus"),
    "Materials" to listOf("cousinsuk", "cousins uk", "amazon", "amzn", "ebay", "screwfix", "toolstation", "hobbycraft", "b&q", "wickes", "ikea"),
    "Equipment" to listOf("apple store", "currys", "argos")
)

fun bankSuggestCategory(tx: StudioBankTransaction, history: List<StudioBankTransaction>): BankCategorySuggestion? {
    if (!tx.isSpending) return null
    val key = bankRecurringMerchantKey(tx)
    if (key.isNotBlank()) {
        val counts = history.filter { it.category.isNotBlank() && it.id != tx.id && bankRecurringMerchantKey(it) == key }
            .groupingBy { it.category }.eachCount()
        val best = counts.maxByOrNull { it.value }
        if (best != null) {
            return BankCategorySuggestion(best.key, min(0.97, 0.8 + best.value * 0.05), true, key.split(" ").firstOrNull() ?: key)
        }
    }
    val haystack = "${tx.counterparty} ${tx.description}".lowercase()
    for ((category, words) in CATEGORY_KEYWORDS) {
        val hit = words.firstOrNull { haystack.contains(it) }
        if (hit != null) return BankCategorySuggestion(category, 0.7, false, hit.trim())
    }
    return null
}

private val ORDER_UNRELATED_CATEGORIES = setOf("Subscriptions", "Software", "Fees", "Rent", "Utilities", "Tax", "Staff", "Marketing")

private fun words(text: String): Set<String> =
    text.lowercase().split(Regex("[^a-z0-9]+")).filter { it.length >= 4 }.toSet()

fun bankRankOrders(tx: StudioBankTransaction, orders: List<StudioOrder>): List<Pair<StudioOrder, Int>> {
    if (tx.bookingDate.isBlank()) return orders.map { it to 0 }
    val txTime = parseDay(tx.bookingDate)
    val txWords = words("${tx.counterparty} ${tx.description}")
    val open = orders.filter { order ->
        if (order.status.lowercase().contains("cancel")) return@filter false
        val days = (txTime - order.paymentDate.time).toDouble() / DAY_MS
        days >= -7 && days <= 60
    }
    val openIds = open.map { it.id }.toSet()
    return orders.map { order ->
        var score = 0
        if (openIds.contains(order.id)) {
            val days = abs((txTime - order.paymentDate.time).toDouble() / DAY_MS)
            score = if (days <= 7) 30 else if (days <= 14) 20 else if (days <= 30) 10 else 5
            if (open.size == 1) score += 25 else if (open.size <= 3) score += 15
        }
        val overlap = words("${order.customerName} ${order.designName}").count { txWords.contains(it) }
        score += min(2, overlap) * 30
        order to score
    }.sortedWith(compareByDescending<Pair<StudioOrder, Int>> { it.second }.thenByDescending { it.first.paymentDate.time })
}

fun bankSuggestOrderLink(tx: StudioBankTransaction, orders: List<StudioOrder>): BankOrderLinkSuggestion? {
    if (!tx.isSpending || tx.bookingDate.isBlank()) return null
    if (ORDER_UNRELATED_CATEGORIES.contains(tx.effectiveCategory)) return null
    val best = bankRankOrders(tx, orders).firstOrNull() ?: return null
    if (best.second < 40) return null
    val order = best.first
    val label = if (order.designName.isNotBlank() && order.designName != "Untitled design")
        "${order.customerName} · ${order.designName}" else order.customerName
    return BankOrderLinkSuggestion(order.id, label, min(0.95, best.second / 100.0))
}

/** Which file badge to draw for an attached receipt. */
enum class BankReceiptKind { Pdf, Image, Doc, File }

fun bankReceiptKind(name: String): BankReceiptKind {
    val ext = name.substringAfterLast('.', "").lowercase()
    return when {
        ext == "pdf" -> BankReceiptKind.Pdf
        ext in listOf("png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "bmp", "tif", "tiff") -> BankReceiptKind.Image
        ext in listOf("doc", "docx", "xls", "xlsx", "csv", "txt", "rtf", "odt", "pages", "numbers") -> BankReceiptKind.Doc
        else -> BankReceiptKind.File
    }
}

/** Upcoming renewals in the next 30 days, soonest first. */
fun bankUpcoming(recurring: List<BankRecurringSpend>): List<BankRecurringSpend> {
    val today = isoDay(System.currentTimeMillis())
    val horizon = isoDay(System.currentTimeMillis() + 30L * DAY_MS)
    return recurring.filter { it.active && it.nextExpected in today..horizon }.sortedBy { it.nextExpected }
}

/** Merchants categorised by hand at least twice with no rule yet. */
data class BankSuggestedRule(val keyword: String, val merchant: String, val category: String, val count: Int, val total: Double)

fun bankSuggestedRules(transactions: List<StudioBankTransaction>, rules: List<StudioBankRule>): List<BankSuggestedRule> {
    val byKeyword = linkedMapOf<String, BankSuggestedRule>()
    for (tx in transactions) {
        if (!tx.isSpending) continue
        val keyword = bankSuggestRuleKeyword(tx).lowercase()
        if (keyword.length < 3) continue
        if (rules.any { it.keyword == keyword || keyword.contains(it.keyword) }) continue
        val category = tx.category.ifBlank { bankSuggestCategory(tx, transactions)?.category ?: "" }
        if (category.isBlank()) continue
        val existing = byKeyword[keyword]
        if (existing != null && existing.category != category) continue
        byKeyword[keyword] = BankSuggestedRule(
            keyword = keyword,
            merchant = existing?.merchant ?: tx.merchant,
            category = category,
            count = (existing?.count ?: 0) + 1,
            total = (existing?.total ?: 0.0) + abs(tx.amount)
        )
    }
    return byKeyword.values.filter { it.count >= 2 }.sortedByDescending { it.count }.take(8)
}

/** Most common payment method among a rule's matches, for the "Applies to" column. */
fun bankRuleStats(rule: StudioBankRule, transactions: List<StudioBankTransaction>): Triple<Int, Double, Pair<String, String>> {
    var count = 0
    var total = 0.0
    var last = ""
    val types = mutableMapOf<String, Int>()
    for (tx in transactions) {
        if (!tx.isSpending) continue
        if (!"${tx.counterparty} ${tx.description}".lowercase().contains(rule.keyword)) continue
        count += 1
        total += abs(tx.amount)
        if (tx.bookingDate > last) last = tx.bookingDate
        types[tx.txType] = (types[tx.txType] ?: 0) + 1
    }
    return Triple(count, total, last to (types.maxByOrNull { it.value }?.key ?: ""))
}

/** Monday-based start of the week containing [date]. */
fun bankStartOfWeek(date: Date): Date {
    val calendar = Calendar.getInstance()
    calendar.time = date
    calendar.firstDayOfWeek = Calendar.MONDAY
    calendar.set(Calendar.HOUR_OF_DAY, 0); calendar.set(Calendar.MINUTE, 0)
    calendar.set(Calendar.SECOND, 0); calendar.set(Calendar.MILLISECOND, 0)
    val diff = (calendar.get(Calendar.DAY_OF_WEEK) - Calendar.MONDAY + 7) % 7
    calendar.add(Calendar.DAY_OF_MONTH, -diff)
    return calendar.time
}

fun bankIsoDay(date: Date): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(date)
