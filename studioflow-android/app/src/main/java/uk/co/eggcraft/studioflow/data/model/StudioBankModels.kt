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
    val hasReceipt: Boolean,
    val linkedOrderLabel: String,
    val pandleConfirmed: Boolean
) {
    val effectiveCategory: String get() = category.ifBlank { categoryAuto }
    val merchant: String get() = counterparty.ifBlank { description }
    val year: Int get() = bookingDate.take(4).toIntOrNull() ?: 0
    val month: Int get() = bookingDate.drop(5).take(2).toIntOrNull() ?: 0
}

data class StudioBankConnection(
    val id: String,
    val providerName: String,
    val providerLogo: String,
    val status: String,
    val accountCount: Int,
    val lastSyncedAtMillis: Long?
) {
    val isLinked: Boolean get() = status == "linked"
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
        hasReceipt = !((data["receiptPath"] as? String).isNullOrBlank()),
        linkedOrderLabel = (data["linkedOrderLabel"] as? String) ?: "",
        pandleConfirmed = (pandle?.get("status") as? String) == "confirmed"
    )
}

fun bankConnectionFromDocument(id: String, data: Map<String, Any?>): StudioBankConnection {
    return StudioBankConnection(
        id = id,
        providerName = (data["providerName"] as? String) ?: "",
        providerLogo = (data["providerLogo"] as? String) ?: "",
        status = (data["status"] as? String) ?: "",
        accountCount = (data["accounts"] as? List<*>)?.size ?: 0,
        lastSyncedAtMillis = (data["lastSyncedAt"] as? Timestamp)?.toDate()?.time
    )
}
