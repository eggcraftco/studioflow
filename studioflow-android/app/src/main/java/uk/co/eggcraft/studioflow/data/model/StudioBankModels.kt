package uk.co.eggcraft.studioflow.data.model

import com.google.firebase.Timestamp

// Bank feed (Open Banking) — server-written, owner-only collections mirrored
// read-only on Android. Connecting, categorising and receipts stay on the web.

data class StudioBankTransaction(
    val id: String,
    val amount: Double,            // signed: negative = money out
    val currency: String,
    val bookingDate: String,       // "YYYY-MM-DD"
    val description: String,
    val counterparty: String,
    val category: String,
    val categoryAuto: String,
    val txType: String,
    val status: String,
    val hasReceipt: Boolean,
    val receiptPath: String,
    val receiptName: String,
    val receiptNotNeeded: Boolean,
    val linkedOrderId: String,
    val linkedOrderLabel: String,
    val vatCode: String,
    val note: String,
    val pandleConfirmed: Boolean,
    /** Set when this payment has been matched to a purchase, so a row can show
     *  what it actually bought and the matcher can skip rows already spoken for. */
    val purchaseId: String = "",
    val purchaseNumber: String = ""
) {
    val effectiveCategory: String get() = category.ifBlank { categoryAuto }
    val merchant: String get() = counterparty.ifBlank { description }
    val year: Int get() = bookingDate.take(4).toIntOrNull() ?: 0
    val month: Int get() = bookingDate.drop(5).take(2).toIntOrNull() ?: 0
    val isSpending: Boolean get() = amount < 0
}

/** Categorisation rule: "merchant contains keyword → category". */
data class StudioBankRule(val id: String, val keyword: String, val category: String)

/**
 * A payee the owner grouped by hand: every merchant key in [keys] counts as the
 * same payment, and the feed treats it as recurring on [cadence] even when the
 * automatic detector would not.
 */
data class StudioBankVendor(val id: String, val name: String, val keys: List<String>, val cadence: BankCadence)

/**
 * A receipt uploaded before its payment reached the feed; the server attaches it
 * after a sync (or "Match now") once a single confident match exists.
 */
data class StudioBankWaitingReceipt(
    val id: String,
    val storagePath: String,
    val fileName: String,
    val amount: Double,
    val date: String,
    val source: String,
    val createdAtMillis: Long?
) {
    val ageDays: Int get() = createdAtMillis?.let { ((System.currentTimeMillis() - it) / 86_400_000L).toInt().coerceAtLeast(0) } ?: 0
}

fun bankRuleFromDocument(id: String, data: Map<String, Any?>): StudioBankRule = StudioBankRule(
    id = id,
    keyword = ((data["keyword"] as? String) ?: "").lowercase(),
    category = (data["category"] as? String) ?: ""
)

fun bankVendorFromDocument(id: String, data: Map<String, Any?>): StudioBankVendor = StudioBankVendor(
    id = id,
    name = (data["name"] as? String) ?: "",
    keys = (data["keys"] as? List<*>)?.mapNotNull { (it as? String)?.trim()?.lowercase()?.ifBlank { null } } ?: emptyList(),
    cadence = when ((data["cadence"] as? String)?.lowercase()) {
        "weekly" -> BankCadence.Weekly
        "yearly" -> BankCadence.Yearly
        else -> BankCadence.Monthly
    }
)

fun bankWaitingReceiptFromDocument(id: String, data: Map<String, Any?>): StudioBankWaitingReceipt = StudioBankWaitingReceipt(
    id = id,
    storagePath = (data["storagePath"] as? String) ?: "",
    fileName = (data["fileName"] as? String) ?: "receipt",
    amount = (data["amount"] as? Number)?.toDouble() ?: 0.0,
    date = ((data["date"] as? String) ?: "").take(10),
    source = (data["source"] as? String) ?: "web",
    createdAtMillis = (data["createdAt"] as? Timestamp)?.toDate()?.time
)

data class StudioBankConnection(
    val id: String,
    val providerName: String,
    val providerLogo: String,
    val status: String,
    val accountCount: Int,
    val lastSyncedAtMillis: Long?,
    /** Server-written consent health: "ok", "needs_reconsent" or "error". */
    val syncState: String = "ok"
) {
    val isLinked: Boolean get() = status == "linked"
    val needsReconnect: Boolean get() = isLinked && syncState == "needs_reconsent"
    val isSyncFailing: Boolean get() = isLinked && syncState != "ok"
}

fun bankTransactionFromDocument(id: String, data: Map<String, Any?>): StudioBankTransaction {
    val pandle = data["pandle"] as? Map<*, *>
    return StudioBankTransaction(
        id = id,
        amount = (data["amount"] as? Number)?.toDouble() ?: 0.0,
        currency = (data["currency"] as? String)?.ifBlank { "GBP" } ?: "GBP",
        bookingDate = ((data["bookingDate"] as? String) ?: "").take(10),
        description = (data["description"] as? String) ?: "",
        counterparty = (data["counterparty"] as? String) ?: "",
        category = (data["category"] as? String) ?: "",
        categoryAuto = (data["categoryAuto"] as? String) ?: "",
        txType = ((data["txType"] as? String) ?: "").uppercase(),
        status = (data["status"] as? String) ?: "booked",
        hasReceipt = !((data["receiptPath"] as? String).isNullOrBlank()),
        receiptPath = (data["receiptPath"] as? String) ?: "",
        receiptName = (data["receiptName"] as? String) ?: "",
        receiptNotNeeded = (data["receiptNotNeeded"] as? Boolean) ?: false,
        linkedOrderId = (data["linkedOrderId"] as? String) ?: "",
        linkedOrderLabel = (data["linkedOrderLabel"] as? String) ?: "",
        vatCode = ((data["vatCode"] as? String) ?: "").uppercase(),
        note = (data["note"] as? String) ?: "",
        pandleConfirmed = (pandle?.get("status") as? String) == "confirmed",
        purchaseId = (data["purchaseId"] as? String) ?: "",
        purchaseNumber = (data["purchaseNumber"] as? String) ?: ""
    )
}

fun bankConnectionFromDocument(id: String, data: Map<String, Any?>): StudioBankConnection {
    return StudioBankConnection(
        id = id,
        providerName = (data["providerName"] as? String) ?: "",
        providerLogo = (data["providerLogo"] as? String) ?: "",
        status = (data["status"] as? String) ?: "",
        accountCount = (data["accounts"] as? List<*>)?.size ?: 0,
        lastSyncedAtMillis = (data["lastSyncedAt"] as? Timestamp)?.toDate()?.time,
        syncState = (data["syncState"] as? String) ?: "ok"
    )
}
