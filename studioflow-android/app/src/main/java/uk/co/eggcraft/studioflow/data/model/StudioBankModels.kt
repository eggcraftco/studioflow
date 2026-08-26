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
    val purchaseNumber: String = "",
    // ---- The permanent, read-only bank layer (server-written, never edited) ----
    val accountId: String = "",
    val provider: String = "",                 // "truelayer"
    val providerTransactionId: String = "",
    val providerReference: String = "",
    val firstImportedAtMillis: Long? = null,   // first time the sync saw it
    val importedAtMillis: Long? = null,        // last time the sync touched it
    // ---- NivaDesk's own enrichment ----
    val reviewStatus: String = "",             // absent = unreviewed
    /** Keyword of the rule that auto-applied [categoryAuto] — longest keyword wins server-side. */
    val categoryAutoRule: String = "",
    val vatCodeAuto: String = "",              // rule-applied VAT
    val pandleStatus: String = "",             // "confirmed" / "matched" / "error"
    val pandleBankTransactionId: String = "",
    val pandleLastError: String = "",
    // ---- B2 slice: splits, incoming classification, Files-library receipt ----
    /** One payment split into several categories/orders; empty = not split. */
    val splits: List<StudioBankSplitLine> = emptyList(),
    /** What an incoming payment actually is ("order_payment", "transfer"…; "" = unclassified). */
    val incomingKind: String = "",
    /** Set when this incoming payment is matched to one payment entry on the linked order. */
    val linkedPaymentId: String = "",
    /** Set when the receipt references a central Files-library record instead of an upload. */
    val receiptFileRecordId: String = ""
) {
    val effectiveCategory: String get() = category.ifBlank { categoryAuto }
    val merchant: String get() = counterparty.ifBlank { description }
    val year: Int get() = bookingDate.take(4).toIntOrNull() ?: 0
    val month: Int get() = bookingDate.drop(5).take(2).toIntOrNull() ?: 0
    val isSpending: Boolean get() = amount < 0

    /** Where the row stands on its way to the accountant. A confirmed Pandle
     *  push implies "confirmed" even on rows saved before review statuses existed. */
    val effectiveReviewStatus: String
        get() = reviewStatus.ifBlank { if (pandleStatus == "confirmed") "confirmed" else "unreviewed" }
}

/** One line of a split transaction — amounts sum exactly to the payment. */
data class StudioBankSplitLine(
    val amount: Double,
    val category: String,
    val vatCode: String = "",
    val note: String = "",
    val orderId: String = "",
    val orderLabel: String = ""
)

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

/** One account inside a connection — used to show a friendly name for a
 *  transaction's accountId in the read-only bank-data panel. */
data class StudioBankAccount(val id: String, val name: String, val currency: String)

data class StudioBankConnection(
    val id: String,
    val providerName: String,
    val providerLogo: String,
    val status: String,
    val accountCount: Int,
    val lastSyncedAtMillis: Long?,
    /** Server-written consent health: "ok", "needs_reconsent", "error" or "disconnected". */
    val syncState: String = "ok",
    /** When the 90-day Open Banking consent lapses — the bank stops sharing after this. */
    val consentExpiresAtMillis: Long? = null,
    val accounts: List<StudioBankAccount> = emptyList()
) {
    val isLinked: Boolean get() = status == "linked"
    /** Consent revoked on purpose — the connection is kept only so its imported data stays owned. */
    val isDisconnected: Boolean get() = status == "disconnected"
    val needsReconnect: Boolean get() = isLinked && syncState == "needs_reconsent"
    val isSyncFailing: Boolean get() = isLinked && syncState != "ok"
}

/** One line of the connection audit trail (owner-only, served by the
 *  bankListAuditLog callable): every sync, connect, disconnect and purge the
 *  server recorded, so "did it actually sync?" has an answer on the phone. */
data class StudioBankAuditEntry(
    val id: String,
    val atMs: Long,
    val kind: String,        // "sync" | "connected" | "disconnected" | "purged"
    val ok: Boolean,
    val bank: String,
    val imported: Int,
    val error: String
) {
    companion object {
        fun from(raw: Map<*, *>): StudioBankAuditEntry? {
            val id = raw["id"] as? String ?: return null
            return StudioBankAuditEntry(
                id = id,
                atMs = (raw["atMs"] as? Number)?.toLong() ?: 0L,
                kind = raw["kind"] as? String ?: "",
                ok = raw["ok"] != false,
                bank = raw["bank"] as? String ?: "",
                imported = (raw["imported"] as? Number)?.toInt() ?: 0,
                error = raw["error"] as? String ?: ""
            )
        }
    }
}

/** A workspace-defined category record (rename/deactivate/default VAT).
 *  Server-written via bankSaveCategory on the web; Android only reads it to
 *  merge active custom names into the category pickers. */
data class StudioBankCategory(
    val id: String,
    val name: String,
    val type: String,            // "expense" / "income" / "transfer"
    val defaultVatCode: String,
    val active: Boolean
)

fun bankCategoryFromDocument(id: String, data: Map<String, Any?>): StudioBankCategory = StudioBankCategory(
    id = id,
    name = (data["name"] as? String) ?: "",
    type = ((data["type"] as? String) ?: "expense").let { if (it in listOf("expense", "income", "transfer")) it else "expense" },
    defaultVatCode = ((data["defaultVatCode"] as? String) ?: "").uppercase(),
    active = (data["active"] as? Boolean) != false
)

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
        purchaseNumber = (data["purchaseNumber"] as? String) ?: "",
        accountId = (data["accountId"] as? String) ?: "",
        provider = (data["provider"] as? String) ?: "",
        providerTransactionId = (data["providerTransactionId"] as? String) ?: "",
        providerReference = (data["providerReference"] as? String) ?: "",
        firstImportedAtMillis = (data["firstImportedAt"] as? Timestamp)?.toDate()?.time,
        importedAtMillis = (data["importedAt"] as? Timestamp)?.toDate()?.time,
        reviewStatus = (data["reviewStatus"] as? String) ?: "",
        categoryAutoRule = (data["categoryAutoRule"] as? String) ?: "",
        vatCodeAuto = ((data["vatCodeAuto"] as? String) ?: "").uppercase(),
        pandleStatus = (pandle?.get("status") as? String) ?: "",
        pandleBankTransactionId = (pandle?.get("bankTransactionId") as? String) ?: "",
        pandleLastError = (pandle?.get("lastError") as? String) ?: "",
        splits = (data["splits"] as? List<*>)?.mapNotNull { entry ->
            val row = entry as? Map<*, *> ?: return@mapNotNull null
            StudioBankSplitLine(
                amount = (row["amount"] as? Number)?.toDouble() ?: 0.0,
                category = (row["category"] as? String) ?: "",
                vatCode = ((row["vatCode"] as? String) ?: "").uppercase(),
                note = (row["note"] as? String) ?: "",
                orderId = (row["orderId"] as? String) ?: "",
                orderLabel = (row["orderLabel"] as? String) ?: ""
            )
        } ?: emptyList(),
        incomingKind = (data["incomingKind"] as? String) ?: "",
        linkedPaymentId = (data["linkedPaymentId"] as? String) ?: "",
        receiptFileRecordId = (data["receiptFileRecordId"] as? String) ?: ""
    )
}

fun bankConnectionFromDocument(id: String, data: Map<String, Any?>): StudioBankConnection {
    val accounts = (data["accounts"] as? List<*>)?.mapNotNull { entry ->
        val row = entry as? Map<*, *> ?: return@mapNotNull null
        StudioBankAccount(
            id = (row["id"] as? String) ?: "",
            name = (row["name"] as? String) ?: "",
            currency = (row["currency"] as? String) ?: ""
        )
    } ?: emptyList()
    return StudioBankConnection(
        id = id,
        providerName = (data["providerName"] as? String) ?: "",
        providerLogo = (data["providerLogo"] as? String) ?: "",
        status = (data["status"] as? String) ?: "",
        accountCount = accounts.size,
        lastSyncedAtMillis = (data["lastSyncedAt"] as? Timestamp)?.toDate()?.time,
        syncState = (data["syncState"] as? String) ?: "ok",
        consentExpiresAtMillis = (data["consentExpiresAt"] as? Timestamp)?.toDate()?.time,
        accounts = accounts
    )
}
