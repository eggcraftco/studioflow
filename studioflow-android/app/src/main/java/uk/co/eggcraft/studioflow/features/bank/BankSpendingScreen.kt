package uk.co.eggcraft.studioflow.features.bank

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.PriorityHigh
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryScrollableTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uk.co.eggcraft.studioflow.data.firebase.BankIncomingMatchResult
import uk.co.eggcraft.studioflow.data.firebase.BankOcrResult
import uk.co.eggcraft.studioflow.data.firebase.StudioFlowRepository
import uk.co.eggcraft.studioflow.data.model.BANK_CATEGORIES
import uk.co.eggcraft.studioflow.data.model.BANK_INCOMING_KINDS
import uk.co.eggcraft.studioflow.data.model.BANK_NON_REVENUE_INCOMING_KINDS
import uk.co.eggcraft.studioflow.data.model.BANK_REVIEW_STATUSES
import uk.co.eggcraft.studioflow.data.model.BANK_VAT_CODES
import uk.co.eggcraft.studioflow.data.model.BankCadence
import uk.co.eggcraft.studioflow.data.model.BankReceiptKind
import uk.co.eggcraft.studioflow.data.model.BankConfidence
import uk.co.eggcraft.studioflow.data.model.BankRecurringSpend
import uk.co.eggcraft.studioflow.data.model.StudioBankAccount
import uk.co.eggcraft.studioflow.data.model.StudioBankAuditEntry
import uk.co.eggcraft.studioflow.data.model.StudioBankConnection
import uk.co.eggcraft.studioflow.data.model.StudioBankRule
import uk.co.eggcraft.studioflow.data.model.StudioBankTransaction
import uk.co.eggcraft.studioflow.data.model.StudioBankWaitingReceipt
import uk.co.eggcraft.studioflow.data.model.StudioLibraryFile
import uk.co.eggcraft.studioflow.data.model.bankDetectDuplicates
import uk.co.eggcraft.studioflow.data.model.bankDetectRecurring
import uk.co.eggcraft.studioflow.data.model.bankEffectiveVat
import uk.co.eggcraft.studioflow.data.model.bankIncomingKindLabel
import uk.co.eggcraft.studioflow.data.model.bankIsoDay
import uk.co.eggcraft.studioflow.data.model.bankRankOrders
import uk.co.eggcraft.studioflow.data.model.bankReceiptKind
import uk.co.eggcraft.studioflow.data.model.bankRecurringMerchantKey
import uk.co.eggcraft.studioflow.data.model.bankReviewStatusLabel
import uk.co.eggcraft.studioflow.data.model.bankRuleStats
import uk.co.eggcraft.studioflow.data.model.bankStartOfWeek
import uk.co.eggcraft.studioflow.data.model.bankSuggestCategory
import uk.co.eggcraft.studioflow.data.model.bankSuggestOrderLink
import uk.co.eggcraft.studioflow.data.model.bankSuggestRuleKeyword
import uk.co.eggcraft.studioflow.data.model.bankSuggestedRules
import uk.co.eggcraft.studioflow.data.model.bankUpcoming
import uk.co.eggcraft.studioflow.data.model.bankVatLabel
import uk.co.eggcraft.studioflow.features.shell.LocalHideSensitiveNumbers
import uk.co.eggcraft.studioflow.features.shell.StudioFlowUiState
import uk.co.eggcraft.studioflow.features.shell.privateCurrencyText
import uk.co.eggcraft.studioflow.language.LocalStudioLanguage
import uk.co.eggcraft.studioflow.language.studioLocale
import uk.co.eggcraft.studioflow.language.studioT
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.ceil

// Banking — the whole feature, mirroring nivadesk.app/bank and the Mac app:
// Overview / Transactions / Recurring / Receipts / Rules, with the same
// heuristics (data/model/BankInsights.kt) and the same Cloud Functions for
// every write. Owner actions go straight to the repository (all callables are
// owner-checked server-side and results arrive back through the existing
// Firestore listeners), so the screen stays self-contained.

private enum class BankTab(val title: String) {
    Overview("Overview"), Transactions("Transactions"), Recurring("Recurring"), Receipts("Receipts"), Rules("Rules")
}

private enum class BankPeriodView { Week, Month, Year }
private enum class BankFlow { All, Attention, Incoming, Spending }
private enum class BankReceiptFilter { All, Missing, Matched }

private val CATEGORY_PALETTE = listOf(
    Color(0xFF2563EB), Color(0xFF0E7A55), Color(0xFFB45309), Color(0xFF7C3AED), Color(0xFFBE185D), Color(0xFF0F766E),
    Color(0xFFB91C1C), Color(0xFF4D7C0F), Color(0xFFA21CAF), Color(0xFF1D4ED8), Color(0xFF92400E), Color(0xFF6B7280)
)
private val UNCATEGORISED_COLOR = Color(0xFF5B6EE8)
private const val UNCATEGORISED_KEY = "__uncategorized__"
private val GREEN = Color(0xFF16A34A)
private val RED = Color(0xFFDC2626)
private val AMBER = Color(0xFFB45309)
private val PURPLE = Color(0xFF7C3AED)
private val BLUE = Color(0xFF2563EB)

private fun categoryColor(name: String): Color {
    var hash = 0L
    for (ch in name) hash = (hash * 31 + ch.code) and 0xFFFFFFFFL
    return CATEGORY_PALETTE[(hash % CATEGORY_PALETTE.size).toInt()]
}

/** Chip/dot colour per review status — same palette as the web table. */
private fun reviewStatusColor(code: String): Color = when (code) {
    "needs_info" -> Color(0xFFB45309)
    "ready" -> Color(0xFF2563EB)
    "synced" -> Color(0xFF0E7A55)
    "confirmed" -> Color(0xFF16A34A)
    "sync_error" -> Color(0xFFDC2626)
    "ignored" -> Color(0xFF9CA3AF)
    else -> Color(0xFF6B7280)  // unreviewed
}

private data class TxTypeMeta(val label: String, val color: Color, val translate: Boolean)

private fun txTypeMeta(type: String): TxTypeMeta? = when (type) {
    "PURCHASE", "POS" -> TxTypeMeta("Card", BLUE, true)
    "DIRECT_DEBIT" -> TxTypeMeta("DD", PURPLE, false)
    "STANDING_ORDER" -> TxTypeMeta("SO", Color(0xFF0E7A55), false)
    "TRANSFER" -> TxTypeMeta("Transfer", Color(0xFF0F766E), true)
    "BILL_PAYMENT" -> TxTypeMeta("Bill", Color(0xFFB45309), true)
    "ATM" -> TxTypeMeta("ATM", Color(0xFFBE185D), false)
    "CASH" -> TxTypeMeta("Cash", Color(0xFFBE185D), true)
    "FEE_CHARGE" -> TxTypeMeta("Fee", Color(0xFFB91C1C), true)
    "INTEREST" -> TxTypeMeta("Interest", GREEN, true)
    "CREDIT" -> TxTypeMeta("Incoming", GREEN, true)
    "DEBIT" -> TxTypeMeta("Payment", Color(0xFF6B7280), true)
    else -> null
}

private fun currencySymbol(code: String): String = when (code.uppercase()) {
    "GBP" -> "£"; "EUR" -> "€"; "USD" -> "$"; "TRY" -> "₺"; "JPY" -> "¥"
    else -> if (code.isBlank()) "£" else "$code "
}

private fun money(value: Double, currencyCode: String, decimalSeparator: String, hideNumbers: Boolean): String {
    val symbol = currencySymbol(currencyCode)
    if (hideNumbers) return privateCurrencyText(symbol)
    val formatted = String.format(Locale.UK, "%,.2f", value)
    return symbol + if (decimalSeparator == ",") formatted.replace(",", "_").replace(".", ",").replace("_", ".") else formatted
}

private fun displayDate(iso: String, locale: Locale, short: Boolean = false): String = try {
    val date = SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(iso)
    if (date == null) iso else SimpleDateFormat(if (short) "d MMM" else "d MMM yyyy", locale).format(date)
} catch (_: Exception) { iso }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BankSpendingScreen(state: StudioFlowUiState) {
    val lang = LocalStudioLanguage.current
    val t: (String) -> String = { studioT(it, lang) }
    val locale = studioLocale(lang)
    val hideNumbers = LocalHideSensitiveNumbers.current
    val decimalSeparator = state.workspaceSettings.selectedDecimalSeparator
    val compact = LocalConfiguration.current.screenWidthDp < 700
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val scope = rememberCoroutineScope()
    val repository = remember { StudioFlowRepository() }
    val workspaceId = state.workspace?.id.orEmpty()
    val isOwner = state.workspace?.isOwner == true
    val canView = state.workspace?.canViewBankFeed == true

    var tab by rememberSaveable { mutableStateOf(BankTab.Overview) }
    var view by rememberSaveable { mutableStateOf(BankPeriodView.Month) }
    val now = remember { Calendar.getInstance() }
    var selectedYear by rememberSaveable { mutableIntStateOf(now.get(Calendar.YEAR)) }
    var selectedMonth by rememberSaveable { mutableIntStateOf(now.get(Calendar.MONTH) + 1) }
    var weekStartMillis by rememberSaveable { mutableStateOf(bankStartOfWeek(Date()).time) }
    var page by rememberSaveable { mutableIntStateOf(1) }
    var pageSize by rememberSaveable { mutableIntStateOf(10) }
    var showAllCategories by rememberSaveable { mutableStateOf(false) }
    var flow by rememberSaveable { mutableStateOf(BankFlow.All) }
    // Accounting-review pile filter ("" = off): a review status, or the two
    // synthetic piles "missing_receipt" / "missing_vat" — same keys as the web.
    var reviewFilter by rememberSaveable { mutableStateOf("") }
    var search by rememberSaveable { mutableStateOf("") }
    var receiptFilter by rememberSaveable { mutableStateOf(BankReceiptFilter.All) }
    var selectedTxId by rememberSaveable { mutableStateOf<String?>(null) }
    var ruleSearch by rememberSaveable { mutableStateOf("") }
    var previewRuleId by rememberSaveable { mutableStateOf<String?>(null) }
    var showNewRule by rememberSaveable { mutableStateOf(false) }
    var newRuleKeyword by rememberSaveable { mutableStateOf("") }
    var newRuleCategory by rememberSaveable { mutableStateOf("") }
    var assignWaitingId by rememberSaveable { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf<String?>(null) }
    var status by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var ocr by remember { mutableStateOf<BankOcrResult?>(null) }
    var pendingAttachTxId by remember { mutableStateOf<String?>(null) }
    // Connection audit trail (owner-only): fetched lazily on first open, null
    // until then so the card can say "Loading…" honestly.
    var auditOpen by remember { mutableStateOf(false) }
    var auditEntries by remember { mutableStateOf<List<StudioBankAuditEntry>?>(null) }
    // Candidates returned by bankMatchIncomingToOrder("suggest") for the open sheet.
    var incomingSuggest by remember { mutableStateOf<BankIncomingMatchResult?>(null) }

    val transactions = state.bankTransactions
    val connections = state.bankConnections
    val rules = state.bankRules
    val waiting = state.bankWaitingReceipts
    val categoryTax = state.bankCategoryTax
    val customCategories = state.bankCustomCategories
    // Every pickable category: presets + the workspace's own active records +
    // whatever the feed already uses. A deactivated record drops out of the
    // pickers but keeps colouring existing rows.
    val categoryOptions = remember(customCategories, transactions, rules) {
        val set = LinkedHashSet(BANK_CATEGORIES)
        customCategories.forEach { if (it.active) set.add(it.name) else set.remove(it.name) }
        transactions.forEach { tx -> tx.effectiveCategory.takeIf { it.isNotBlank() }?.let(set::add) }
        rules.forEach { rule -> rule.category.takeIf { it.isNotBlank() }?.let(set::add) }
        set.toList()
    }
    val linked = connections.filter { it.isLinked }
    val currencyCode = transactions.firstOrNull()?.currency ?: "GBP"
    val fmt: (Double, String?) -> String = { value, code -> money(value, code ?: currencyCode, decimalSeparator, hideNumbers) }

    /** Runs an owner action, keeping the busy/status/error strip honest. */
    fun run(key: String, block: suspend () -> String?) {
        busy = key; error = null
        scope.launch {
            runCatching { block() }
                .onSuccess { status = it; busy = null }
                .onFailure { error = it.message ?: "Something went wrong."; busy = null }
        }
    }

    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        val target = pendingAttachTxId
        pendingAttachTxId = null
        if (uri == null) return@rememberLauncherForActivityResult
        val resolver = context.contentResolver
        val type = resolver.getType(uri) ?: "application/octet-stream"
        val name = uri.lastPathSegment?.substringAfterLast('/')?.ifBlank { null } ?: "receipt"
        run(if (target.isNullOrBlank()) "ocr" else "receipt-$target") {
            val bytes = withContext(Dispatchers.IO) { resolver.openInputStream(uri)?.use { it.readBytes() } } ?: error("Could not read the file.")
            if (target.isNullOrBlank()) {
                ocr = repository.bankMatchReceipt(workspaceId, bytes, name, type)
                null
            } else {
                repository.bankAttachReceipt(workspaceId, target, bytes, name, type)
                t("Invoice attached.")
            }
        }
    }

    // ---- Derived data -------------------------------------------------------

    val periodLabel: String
    val inRange: (String) -> Boolean
    val inPrevious: (String) -> Boolean
    val isCurrentPeriod: Boolean
    when (view) {
        BankPeriodView.Year -> {
            inRange = { it.take(4).toIntOrNull() == selectedYear }
            inPrevious = { it.take(4).toIntOrNull() == selectedYear - 1 }
            periodLabel = selectedYear.toString()
            isCurrentPeriod = selectedYear >= now.get(Calendar.YEAR)
        }
        BankPeriodView.Month -> {
            val prefix = String.format(Locale.UK, "%04d-%02d", selectedYear, selectedMonth)
            val prevYear = if (selectedMonth == 1) selectedYear - 1 else selectedYear
            val prevMonth = if (selectedMonth == 1) 12 else selectedMonth - 1
            val prevPrefix = String.format(Locale.UK, "%04d-%02d", prevYear, prevMonth)
            inRange = { it.startsWith(prefix) }
            inPrevious = { it.startsWith(prevPrefix) }
            val cal = Calendar.getInstance().apply { set(selectedYear, selectedMonth - 1, 1) }
            periodLabel = SimpleDateFormat("LLLL yyyy", locale).format(cal.time).replaceFirstChar { it.uppercase(locale) }
            isCurrentPeriod = selectedYear > now.get(Calendar.YEAR) ||
                (selectedYear == now.get(Calendar.YEAR) && selectedMonth >= now.get(Calendar.MONTH) + 1)
        }
        BankPeriodView.Week -> {
            val start = Date(weekStartMillis)
            val endCal = Calendar.getInstance().apply { time = start; add(Calendar.DAY_OF_MONTH, 6) }
            val prevCal = Calendar.getInstance().apply { time = start; add(Calendar.DAY_OF_MONTH, -7) }
            val prevEndCal = Calendar.getInstance().apply { time = start; add(Calendar.DAY_OF_MONTH, -1) }
            val startIso = bankIsoDay(start); val endIso = bankIsoDay(endCal.time)
            val prevStartIso = bankIsoDay(prevCal.time); val prevEndIso = bankIsoDay(prevEndCal.time)
            inRange = { it in startIso..endIso }
            inPrevious = { it in prevStartIso..prevEndIso }
            val short = SimpleDateFormat("d MMM", locale)
            periodLabel = "${short.format(start)} – ${short.format(endCal.time)}"
            isCurrentPeriod = bankStartOfWeek(Date()).time == weekStartMillis
        }
    }

    fun stepPeriod(delta: Int) {
        when (view) {
            BankPeriodView.Year -> if (delta < 0 || selectedYear < now.get(Calendar.YEAR)) selectedYear += delta
            BankPeriodView.Month -> {
                var m = selectedMonth + delta
                var y = selectedYear
                if (m < 1) { m = 12; y -= 1 } else if (m > 12) { m = 1; y += 1 }
                val future = y > now.get(Calendar.YEAR) || (y == now.get(Calendar.YEAR) && m > now.get(Calendar.MONTH) + 1)
                if (!future) { selectedMonth = m; selectedYear = y }
            }
            BankPeriodView.Week -> {
                val next = Calendar.getInstance().apply { timeInMillis = weekStartMillis; add(Calendar.DAY_OF_MONTH, delta * 7) }
                if (next.timeInMillis <= System.currentTimeMillis()) weekStartMillis = next.timeInMillis
            }
        }
        page = 1
    }

    val visible = transactions.filter { inRange(it.bookingDate) }
    val spending = visible.filter { it.isSpending }
    val spentTotal = spending.sumOf { abs(it.amount) }
    val previousSpent = transactions.filter { it.isSpending && inPrevious(it.bookingDate) }.sumOf { abs(it.amount) }
    // Transfers between the owner's own accounts, owner contributions and loans
    // are money in, but not revenue — once marked, they leave this total.
    val incomingTotal = visible.filter { it.amount > 0 && it.incomingKind !in BANK_NON_REVENUE_INCOMING_KINDS }.sumOf { it.amount }
    val incomingCount = visible.count { it.amount > 0 }
    val delta = if (previousSpent > 0) (spentTotal - previousSpent) / previousSpent * 100 else null
    val vendors = state.bankVendors
    val recurring = remember(transactions, vendors) { bankDetectRecurring(transactions, vendors) }
    val recurringKeys = remember(recurring) { recurring.map { it.key }.toSet() }
    val duplicates = remember(visible) { bankDetectDuplicates(visible) }
    val activeRecurring = recurring.filter { it.active }
    val cancelledRecurring = recurring.filter { !it.active }
    val recurringMonthly = activeRecurring.sumOf { it.monthlyEquivalent }
    val priceChanged = recurring.count { it.active && it.priceChange != null }
    val uncategorised = spending.filter { it.effectiveCategory.isBlank() }
    val missingReceipt = spending.filter { !it.hasReceipt && !it.receiptNotNeeded }
    val matchedReceipts = spending.count { it.hasReceipt }
    val notNeededReceipts = spending.count { !it.hasReceipt && it.receiptNotNeeded }
    val brokenConnections = connections.count { it.isSyncFailing }
    val suggestions = remember(visible, transactions) {
        visible.filter { it.isSpending && it.effectiveCategory.isBlank() }
            .mapNotNull { tx -> bankSuggestCategory(tx, transactions)?.let { tx.id to it } }.toMap()
    }
    val orderSuggestions = remember(visible, state.orders) {
        visible.filter { it.isSpending && it.linkedOrderId.isBlank() }
            .mapNotNull { tx -> bankSuggestOrderLink(tx, state.orders)?.let { tx.id to it } }.toMap()
    }
    val suggested = remember(transactions, rules) { bankSuggestedRules(transactions, rules) }
    val upcoming = remember(recurring) { bankUpcoming(recurring) }
    val autoApplied = visible.count { it.isSpending && it.category.isBlank() && it.categoryAuto.isNotBlank() }
    val categoryRows = spending.groupBy { it.effectiveCategory.ifBlank { UNCATEGORISED_KEY } }
        .map { (name, rows) -> Triple(name, rows.sumOf { abs(it.amount) }, 0.0) }
        .map { (name, amount, _) -> Triple(name, amount, amount / maxOf(spentTotal, 0.01) * 100) }
        .sortedByDescending { it.second }
    val attentionTotal = uncategorised.size + missingReceipt.size + duplicates.size + priceChanged + cancelledRecurring.size + waiting.size + brokenConnections
    // The accountant's worklist for the selected period — same six piles as the web Overview.
    val reviewReady = visible.count { it.effectiveReviewStatus == "ready" }
    val reviewNeedsInfo = visible.count { it.effectiveReviewStatus == "needs_info" }
    val reviewMissingVat = spending.count { it.effectiveCategory.isNotBlank() && bankEffectiveVat(it, categoryTax).isBlank() }
    val reviewSyncErrors = visible.count { it.effectiveReviewStatus == "sync_error" }
    val reviewConfirmed = visible.count { it.effectiveReviewStatus == "confirmed" }

    val filtered = visible.filter { tx ->
        when (reviewFilter) {
            "" -> Unit
            "missing_receipt" -> if (!(tx.isSpending && !tx.hasReceipt && !tx.receiptNotNeeded)) return@filter false
            "missing_vat" -> if (!(tx.isSpending && tx.effectiveCategory.isNotBlank() && bankEffectiveVat(tx, categoryTax).isBlank())) return@filter false
            else -> if (tx.effectiveReviewStatus != reviewFilter) return@filter false
        }
        when (flow) {
            BankFlow.Incoming -> if (tx.amount <= 0) return@filter false
            BankFlow.Spending -> if (tx.amount >= 0) return@filter false
            BankFlow.Attention -> if (!(tx.isSpending && (tx.effectiveCategory.isBlank() || (!tx.hasReceipt && !tx.receiptNotNeeded) || duplicates.contains(tx.id)))) return@filter false
            BankFlow.All -> Unit
        }
        val needle = search.trim().lowercase()
        needle.isBlank() || "${tx.counterparty} ${tx.description}".lowercase().contains(needle)
    }
    val pageCount = maxOf(1, ceil(filtered.size / pageSize.toDouble()).toInt())
    val safePage = page.coerceIn(1, pageCount)
    val paged = filtered.drop((safePage - 1) * pageSize).take(pageSize)
    val selectedTx = transactions.firstOrNull { it.id == selectedTxId }

    // ---- UI -----------------------------------------------------------------

    LazyColumn(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(if (compact) 14.dp else 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(Modifier.weight(1f)) {
                    Text(t("Banking"), fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
                    Text(t("Read-only Open Banking feed — NivaDesk can never move money."), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (isOwner && linked.isNotEmpty()) {
                    IconButton(onClick = { pendingAttachTxId = ""; pickFile.launch("*/*") }, enabled = busy != "ocr") {
                        Icon(Icons.Filled.AttachFile, contentDescription = t("Match a receipt"))
                    }
                    IconButton(onClick = { run("sync") { repository.bankSync(workspaceId); t("Transactions refreshed.") } }, enabled = busy != "sync") {
                        Icon(Icons.Filled.Refresh, contentDescription = t("Refresh"))
                    }
                }
            }
        }
        status?.let { item { Text(it, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = GREEN) } }
        error?.let { item { Text(it, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = RED) } }
        if (!canView) {
            item { Text(t("Bank connections are managed by the workspace owner."), fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            return@LazyColumn
        }
        ocr?.let { current ->
            item {
                OcrCard(
                    ocr = current, t = t, locale = locale, fmt = fmt, isOwner = isOwner, busy = busy,
                    onAttach = { candidate ->
                        run("ocr-assign") {
                            repository.bankAssignInboxReceipt(workspaceId, current.inboxPath, candidate.transactionId, current.fileName)
                            ocr = null; t("Invoice attached.")
                        }
                    },
                    onKeepWaiting = {
                        run("ocr-queue") {
                            repository.bankQueueInboxReceipt(workspaceId, current.inboxPath, current.fileName, current.amount, current.date)
                            ocr = null; tab = BankTab.Receipts
                            t("Receipt saved — it will be attached when the payment reaches the bank.")
                        }
                    },
                    onDismiss = { scope.launch { repository.bankDiscardInboxUpload(current.inboxPath) }; ocr = null }
                )
            }
        }
        item {
            PrimaryScrollableTabRow(selectedTabIndex = BankTab.entries.indexOf(tab), edgePadding = 0.dp) {
                BankTab.entries.forEach { entry ->
                    Tab(selected = tab == entry, onClick = { tab = entry; selectedTxId = null },
                        text = { Text(t(entry.title), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1) })
                }
            }
        }
        if (connections.isNotEmpty()) {
            item {
                Surface(shape = RoundedCornerShape(14.dp), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                    Column {
                        connections.forEach { ConnectionRow(it, t, locale, isOwner, uriHandler::openUri) }
                        if (isOwner) {
                            // The trail the server leaves on every sync, connect,
                            // disconnect and purge — owner-only like the callable.
                            Text(
                                "🕑 ${t("Activity")}",
                                fontSize = 12.sp, fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier
                                    .clickable {
                                        if (auditOpen) {
                                            auditOpen = false
                                        } else {
                                            auditOpen = true
                                            if (auditEntries == null) {
                                                scope.launch {
                                                    auditEntries = runCatching { repository.bankAuditLog(workspaceId, 15) }
                                                        .getOrDefault(emptyList())
                                                }
                                            }
                                        }
                                    }
                                    .padding(horizontal = 14.dp, vertical = 8.dp)
                            )
                        }
                    }
                }
            }
            if (isOwner && auditOpen) {
                item {
                    BankAuditTrailCard(entries = auditEntries, t = t, locale = locale)
                }
            }
        }
        if (transactions.isEmpty()) {
            item {
                Surface(shape = RoundedCornerShape(14.dp), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                    Text(
                        if (linked.isEmpty()) t("Connect your business bank in the web app to see spending here.") else t("No transactions imported yet."),
                        modifier = Modifier.padding(36.dp), fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            return@LazyColumn
        }
        item {
            PeriodRow(view, periodLabel, isCurrentPeriod, t, onView = { view = it; page = 1 }, onStep = ::stepPeriod)
        }

        when (tab) {
            BankTab.Overview -> {
                item {
                    // How the Overview numbers are counted — same caption as the web.
                    Text(
                        t("Figures follow the transaction date; pending payments are included. Incoming marked as transfer, owner contribution or loan is not counted as revenue."),
                        fontSize = 10.sp, lineHeight = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                item {
                    TileGrid(compact, listOf(
                        StatTileSpec(t("Total spent"), fmt(spentTotal, null),
                            delta?.let { "${if (it <= 0) "↓" else "↑"}${String.format(Locale.UK, "%.0f", abs(it))}% ${t(when (view) { BankPeriodView.Year -> "vs last year"; BankPeriodView.Week -> "vs last week"; else -> "vs last month" })}" },
                            if ((delta ?: 0.0) <= 0) GREEN else MaterialTheme.colorScheme.onSurfaceVariant, RED, Icons.Filled.AccountBalance),
                        StatTileSpec(t("Incoming"), "+" + fmt(incomingTotal, null), "$incomingCount ${t("payments received")}", null, GREEN, Icons.Filled.Check) { flow = BankFlow.Incoming; tab = BankTab.Transactions },
                        StatTileSpec(t("Recurring spend"), "${fmt(recurringMonthly, null)} / ${t("month")}", "${activeRecurring.size} ${t("active")} · ${cancelledRecurring.size} ${t("possibly cancelled")}", null, AMBER, Icons.Filled.Refresh) { tab = BankTab.Recurring },
                        StatTileSpec(t("Needs attention"), "$attentionTotal ${t("items")}",
                            listOfNotNull(
                                if (uncategorised.isNotEmpty()) "${uncategorised.size} ${t("uncategorised")}" else null,
                                if (missingReceipt.isNotEmpty()) "${missingReceipt.size} ${t("missing receipts")}" else null,
                                if (waiting.isNotEmpty()) "${waiting.size} ${t("receipts waiting for the bank")}" else null,
                                if (brokenConnections > 0) "$brokenConnections ${t("bank connection needs reconnecting")}" else null
                            ).take(2).joinToString(" · ").ifBlank { t("Everything is reviewed.") },
                            null, if (attentionTotal > 0) AMBER else GREEN, Icons.Filled.Warning) { flow = BankFlow.Attention; tab = BankTab.Transactions }
                    ))
                }
                item {
                    Card {
                        CardTitle(t("Spending mix"))
                        if (categoryRows.isEmpty()) Text(t("No spending in this period."), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        (if (showAllCategories) categoryRows else categoryRows.take(5)).forEach { (name, amount, share) ->
                            val isUn = name == UNCATEGORISED_KEY
                            CategoryRow(if (isUn) t("Uncategorised") else t(name), if (isUn) UNCATEGORISED_COLOR else categoryColor(name), fmt(amount, null), share)
                        }
                        val unShare = categoryRows.firstOrNull { it.first == UNCATEGORISED_KEY }?.third ?: 0.0
                        if (unShare > 0) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("${(100 - unShare).toInt()}% ${t("categorised")}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                TextButton(onClick = { flow = BankFlow.Attention; tab = BankTab.Transactions }, contentPadding = PaddingValues(0.dp)) {
                                    Text("${t("Categorise")} ${uncategorised.size} →", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                        if (categoryRows.size > 5) {
                            TextButton(onClick = { showAllCategories = !showAllCategories }, contentPadding = PaddingValues(0.dp)) {
                                Text(if (showAllCategories) "${t("Show less")} ←" else "${t("View category breakdown")} →", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
                item {
                    Card {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(t("Top recurring vendors"), fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, modifier = Modifier.weight(1f))
                            TextButton(onClick = { tab = BankTab.Recurring }, contentPadding = PaddingValues(0.dp)) { Text("${t("View recurring")} →", fontSize = 12.sp, fontWeight = FontWeight.Bold) }
                        }
                        if (activeRecurring.isEmpty()) Text(t("No recurring payments detected yet."), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        activeRecurring.take(5).forEach { item ->
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                Avatar(item.merchant, 26)
                                Column(Modifier.weight(1f)) {
                                    Text(item.merchant, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text("${t(cadenceLabel(item.cadence))} · ${item.occurrences}×", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Text(fmt(item.typicalAmount, item.currency), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                Text("/ ${t("month")}", fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
                item {
                    Card {
                        CardTitle(t("Receipts summary"))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                            SummaryCell(matchedReceipts.toString(), t("Receipts matched"), GREEN)
                            SummaryCell(missingReceipt.size.toString(), t("Missing receipts"), if (missingReceipt.isEmpty()) MaterialTheme.colorScheme.onSurface else RED)
                            SummaryCell(notNeededReceipts.toString(), t("No receipt needed"), MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (waiting.isNotEmpty()) {
                            TextButton(onClick = { tab = BankTab.Receipts }, contentPadding = PaddingValues(0.dp)) {
                                Text("⏳ ${waiting.size} ${t("receipts waiting for the bank")} →", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = AMBER)
                            }
                        }
                        TextButton(onClick = { tab = BankTab.Receipts }, contentPadding = PaddingValues(0.dp)) {
                            Text("${t("Review receipts")} →", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                item {
                    Card(padding = 0.dp) {
                        Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(t("Recent transactions"), fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, modifier = Modifier.weight(1f))
                            TextButton(onClick = { tab = BankTab.Transactions }, contentPadding = PaddingValues(0.dp)) { Text("${t("View all transactions")} →", fontSize = 12.sp, fontWeight = FontWeight.Bold) }
                        }
                        HorizontalDivider()
                        visible.take(6).forEach { tx ->
                            TransactionRow(tx, t, compact, fmt(abs(tx.amount), tx.currency), displayDate(tx.bookingDate, locale, compact), false, false) { selectedTxId = tx.id; tab = BankTab.Transactions }
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                        }
                    }
                }
                if (upcoming.isNotEmpty()) {
                    item {
                        Card(padding = 0.dp) {
                            Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(t("Upcoming payments & renewals"), fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, modifier = Modifier.weight(1f))
                                Text(upcoming.size.toString(), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            HorizontalDivider()
                            upcoming.take(6).forEach { item ->
                                Row(Modifier.padding(horizontal = 16.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Text("${t("around")} ${displayDate(item.nextExpected, locale, true)}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.widthIn(min = 74.dp))
                                    Column(Modifier.weight(1f)) {
                                        Text(item.merchant, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        // "Based on the last <n> monthly payments" — cadence word matches the pattern.
                                        val cadenceWord = when (item.cadence) {
                                            BankCadence.Weekly -> "weekly"
                                            BankCadence.Yearly -> "yearly"
                                            else -> "monthly"
                                        }
                                        Text("${t("Based on the last")} ${item.occurrences} ${t(cadenceWord)} ${t("payments").lowercase()}",
                                            fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    }
                                    Text(fmt(item.typicalAmount, item.currency), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }
                                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                            }
                            Text(t("These are estimates, not booked payments."),
                                Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                                fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                if (isOwner) {
                    // How ready this period is to hand to the accountant — six
                    // click-through piles, mirroring the web Overview card.
                    item {
                        Card {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(t("Accounting review"), fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
                                Text("· $periodLabel", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            val piles = listOf(
                                ReviewPileSpec(t("Ready for accounting"), reviewReady, "ready", BLUE),
                                ReviewPileSpec(t("Needs information"), reviewNeedsInfo, "needs_info", AMBER),
                                ReviewPileSpec(t("Missing receipt"), missingReceipt.size, "missing_receipt", RED),
                                ReviewPileSpec(t("Missing VAT code"), reviewMissingVat, "missing_vat", AMBER),
                                ReviewPileSpec(t("Sync error"), reviewSyncErrors, "sync_error", RED),
                                ReviewPileSpec(t("Confirmed in accounting"), reviewConfirmed, "confirmed", GREEN)
                            )
                            val perRow = if (compact) 2 else 3
                            piles.chunked(perRow).forEach { rowPiles ->
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    rowPiles.forEach { pile ->
                                        Surface(
                                            shape = RoundedCornerShape(11.dp), tonalElevation = 2.dp,
                                            modifier = Modifier.weight(1f).clickable {
                                                reviewFilter = pile.filter; flow = BankFlow.All; page = 1; tab = BankTab.Transactions
                                            }
                                        ) {
                                            Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                                Text(pile.count.toString(), fontSize = 19.sp, fontWeight = FontWeight.ExtraBold,
                                                    color = if (pile.count > 0) pile.color else MaterialTheme.colorScheme.onSurface)
                                                Text(pile.label, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                            }
                                        }
                                    }
                                    repeat(perRow - rowPiles.size) { Spacer(Modifier.weight(1f)) }
                                }
                            }
                        }
                    }
                }
            }

            BankTab.Transactions -> {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            listOf(
                                BankFlow.All to t("All"), BankFlow.Attention to t("Needs attention"),
                                BankFlow.Incoming to t("Incoming"), BankFlow.Spending to t("Spending")
                            ).forEach { (value, label) ->
                                FilterChip(selected = flow == value, onClick = { flow = value; page = 1 }, label = { Text(label, fontSize = 12.sp) })
                            }
                            if (reviewFilter.isNotBlank()) {
                                // Accounting-review pile filter — one tap clears it.
                                val reviewChipLabel = when (reviewFilter) {
                                    "missing_receipt" -> t("Missing receipt")
                                    "missing_vat" -> t("Missing VAT code")
                                    else -> t(bankReviewStatusLabel(reviewFilter))
                                }
                                FilterChip(selected = true, onClick = { reviewFilter = ""; page = 1 },
                                    label = { Text("⚑ $reviewChipLabel ✕", fontSize = 12.sp) })
                            }
                        }
                        OutlinedTextField(
                            value = search, onValueChange = { search = it; page = 1 },
                            placeholder = { Text(t("Search transactions"), fontSize = 13.sp) },
                            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                            singleLine = true, modifier = Modifier.fillMaxWidth()
                        )
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            categoryRows.take(6).forEach { (name, amount, _) ->
                                val isUn = name == UNCATEGORISED_KEY
                                Surface(shape = RoundedCornerShape(11.dp), tonalElevation = 1.dp) {
                                    Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp).widthIn(min = 104.dp)) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                                            Box(Modifier.size(7.dp).background(if (isUn) UNCATEGORISED_COLOR else categoryColor(name), CircleShape))
                                            Text(if (isUn) t("Uncategorised") else t(name), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                                        }
                                        Text(fmt(amount, null), fontSize = 14.sp, fontWeight = FontWeight.ExtraBold)
                                    }
                                }
                            }
                        }
                    }
                }
                item {
                    Card(padding = 0.dp) {
                        Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(t("Transactions"), fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, modifier = Modifier.weight(1f))
                            Text("${filtered.size} ${t("transactions")}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        HorizontalDivider()
                        if (paged.isEmpty()) Text(t("No transactions in this period."), Modifier.padding(20.dp), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        paged.forEach { tx ->
                            TransactionRow(tx, t, compact, fmt(abs(tx.amount), tx.currency), displayDate(tx.bookingDate, locale, compact),
                                duplicates.contains(tx.id), tx.isSpending && recurringKeys.contains(bankRecurringMerchantKey(tx))) { selectedTxId = tx.id }
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                        }
                        Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("${t("Showing")} ${paged.size} / ${filtered.size}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            listOf(10, 20, 30).forEach { size ->
                                FilterChip(selected = pageSize == size, onClick = { pageSize = size; page = 1 }, label = { Text(size.toString(), fontSize = 11.sp) }, modifier = Modifier.height(28.dp))
                            }
                            Spacer(Modifier.weight(1f))
                            IconButton(onClick = { page = maxOf(1, safePage - 1) }, enabled = safePage > 1) { Icon(Icons.Filled.ChevronLeft, contentDescription = null) }
                            Text("$safePage / $pageCount", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            IconButton(onClick = { page = minOf(pageCount, safePage + 1) }, enabled = safePage < pageCount) { Icon(Icons.Filled.ChevronRight, contentDescription = null) }
                        }
                    }
                }
            }

            BankTab.Recurring -> {
                item {
                    TileGrid(compact, listOf(
                        StatTileSpec(t("Recurring spend"), "${fmt(recurringMonthly, null)} / ${t("month")}", t("Monthly equivalent of active subscriptions"), null, AMBER, Icons.Filled.Refresh),
                        StatTileSpec(t("Active recurring"), activeRecurring.size.toString(), t("Paying on schedule"), null, GREEN, Icons.Filled.Check),
                        StatTileSpec(t("Possibly cancelled"), cancelledRecurring.size.toString(), t("A payment looks missed"), null, Color(0xFF6B7280), Icons.Filled.Remove),
                        StatTileSpec(t("Price changed"), priceChanged.toString(), t("Latest charge differs from usual"), null, RED, Icons.Filled.PriorityHigh)
                    ))
                }
                item {
                    Card(padding = 0.dp) {
                        Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(t("Recurring payments"), fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, modifier = Modifier.weight(1f))
                            Text(recurring.size.toString(), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        HorizontalDivider()
                        if (recurring.isEmpty()) Text(t("No recurring payments detected yet."), Modifier.padding(20.dp), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        recurring.forEach { item ->
                            RecurringRow(item, t, locale, fmt) {
                                search = if (item.manual) item.merchant else item.key
                                flow = BankFlow.Spending; tab = BankTab.Transactions
                            }
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                        }
                    }
                }
            }

            BankTab.Receipts -> {
                item {
                    TileGrid(compact, listOf(
                        StatTileSpec(t("Receipts matched"), matchedReceipts.toString(),
                            if (spending.isEmpty()) null else "${(matchedReceipts * 100 / maxOf(spending.size, 1))}% ${t("of")} ${spending.size}", null, GREEN, Icons.Filled.Check),
                        StatTileSpec(t("Missing receipts"), missingReceipt.size.toString(), null, null, RED, Icons.Filled.PriorityHigh) { receiptFilter = BankReceiptFilter.Missing },
                        StatTileSpec(t("No receipt needed"), (notNeededReceipts + incomingCount).toString(), "$incomingCount ${t("incoming")} · $notNeededReceipts ${t("marked")}", null, Color(0xFF6B7280), Icons.Filled.Remove),
                        StatTileSpec(t("Match a receipt"), t("Upload receipt"), t("Upload a photo or scan — NivaDesk reads the total and date and finds the transaction."), null, PURPLE, Icons.Filled.AttachFile) {
                            if (isOwner) { pendingAttachTxId = ""; pickFile.launch("*/*") }
                        }
                    ))
                }
                if (waiting.isNotEmpty()) {
                    item {
                        Surface(shape = RoundedCornerShape(14.dp), color = AMBER.copy(alpha = 0.08f), modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Icon(Icons.Filled.HourglassEmpty, contentDescription = null, tint = AMBER, modifier = Modifier.size(18.dp))
                                    Text("${t("Waiting for the bank")} (${waiting.size})", fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, modifier = Modifier.weight(1f))
                                    if (isOwner) {
                                        OutlinedButton(onClick = {
                                            run("waiting-match") {
                                                val matched = repository.bankMatchWaitingReceipts(workspaceId)
                                                if (matched > 0) "$matched ${t("receipts attached.")}" else t("No confident match yet — the payment may not have reached the bank.")
                                            }
                                        }, enabled = busy != "waiting-match") {
                                            Text(if (busy == "waiting-match") t("Matching…") else t("Match now"), fontSize = 12.sp)
                                        }
                                    }
                                }
                                Text(t("Attached automatically when the payment arrives in the feed."), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                waiting.forEach { item ->
                                    WaitingRow(
                                        item = item, t = t, locale = locale, fmt = fmt, isOwner = isOwner,
                                        picking = assignWaitingId == item.id,
                                        candidates = spending,
                                        onTogglePick = { assignWaitingId = if (assignWaitingId == item.id) null else item.id },
                                        onAssign = { tx ->
                                            run("waiting-${item.id}") {
                                                repository.bankAssignInboxReceipt(workspaceId, item.storagePath, tx.id, item.fileName)
                                                assignWaitingId = null; t("Invoice attached.")
                                            }
                                        },
                                        onRemove = { run("waiting-${item.id}") { repository.bankDeleteWaitingReceipt(workspaceId, item.id); null } }
                                    )
                                }
                            }
                        }
                    }
                }
                item {
                    Card(padding = 0.dp) {
                        Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(t("Receipts"), fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
                            listOf(BankReceiptFilter.All to t("All"), BankReceiptFilter.Missing to t("Missing"), BankReceiptFilter.Matched to t("Matched")).forEach { (value, label) ->
                                FilterChip(selected = receiptFilter == value, onClick = { receiptFilter = value }, label = { Text(label, fontSize = 11.sp) }, modifier = Modifier.height(30.dp))
                            }
                        }
                        HorizontalDivider()
                        val rows = spending.filter {
                            when (receiptFilter) {
                                BankReceiptFilter.All -> true
                                BankReceiptFilter.Matched -> it.hasReceipt
                                BankReceiptFilter.Missing -> !it.hasReceipt && !it.receiptNotNeeded
                            }
                        }
                        if (rows.isEmpty()) Text(t("Nothing here."), Modifier.padding(20.dp), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        rows.take(60).forEach { tx ->
                            ReceiptRow(tx, t, locale, fmt, isOwner,
                                onOpen = { selectedTxId = tx.id },
                                onAttach = { pendingAttachTxId = tx.id; pickFile.launch("*/*") },
                                onToggleNotNeeded = {
                                    run("receipt-${tx.id}") { repository.bankSetReceiptNotNeeded(workspaceId, tx.id, !tx.receiptNotNeeded); null }
                                })
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                        }
                    }
                }
            }

            BankTab.Rules -> {
                item {
                    TileGrid(compact, listOf(
                        StatTileSpec(t("Active rules"), rules.size.toString(), t("Rules running"), null, GREEN, Icons.Filled.Check),
                        StatTileSpec(t("Suggested rules"), suggested.size.toString(), t("Ready to review"), null, PURPLE, Icons.Filled.AutoAwesome),
                        StatTileSpec(t("Auto-applied"), autoApplied.toString(), "${t("Transactions auto-categorised")} · $periodLabel", null, BLUE, Icons.Filled.Bolt) { tab = BankTab.Transactions },
                        StatTileSpec(t("Needs review"), uncategorised.size.toString(), t("Recent transactions"), null, AMBER, Icons.Filled.PriorityHigh) { flow = BankFlow.Attention; tab = BankTab.Transactions }
                    ))
                }
                if (isOwner) {
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Button(onClick = { showNewRule = !showNewRule }) { Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); Text(t("New rule"), fontSize = 13.sp) }
                            OutlinedButton(onClick = {
                                run("rule-bulk") {
                                    suggested.forEach { repository.bankSaveRule(workspaceId, it.keyword, it.category) }
                                    t("Rules created.")
                                }
                            }, enabled = suggested.isNotEmpty() && busy != "rule-bulk") { Text(t("Bulk create suggested rules"), fontSize = 12.sp) }
                        }
                    }
                    if (showNewRule) {
                        item {
                            Card {
                                Text(t("New rule"), fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                OutlinedTextField(value = newRuleKeyword, onValueChange = { newRuleKeyword = it }, label = { Text(t("If merchant contains"), fontSize = 12.sp) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                                CategoryPicker(newRuleCategory, categoryOptions, t) { newRuleCategory = it }
                                if (newRuleCategory.isNotBlank()) categoryTax[newRuleCategory]?.let { Text("${t("VAT")}: ${t(bankVatLabel(it))}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedButton(onClick = { showNewRule = false }) { Text(t("Cancel"), fontSize = 12.sp) }
                                    Button(onClick = {
                                        run("rule-new") {
                                            repository.bankSaveRule(workspaceId, newRuleKeyword.trim(), newRuleCategory)
                                            newRuleKeyword = ""; newRuleCategory = ""; showNewRule = false
                                            t("Rule created.")
                                        }
                                    }, enabled = newRuleKeyword.trim().length >= 2 && newRuleCategory.isNotBlank() && busy != "rule-new") { Text(t("Create rule"), fontSize = 12.sp) }
                                }
                            }
                        }
                    }
                }
                item {
                    Card(padding = 0.dp) {
                        Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text("${t("Rules")} (${rules.size})", fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, modifier = Modifier.weight(1f))
                        }
                        OutlinedTextField(
                            value = ruleSearch, onValueChange = { ruleSearch = it },
                            placeholder = { Text(t("Search rules"), fontSize = 13.sp) },
                            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                            singleLine = true, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)
                        )
                        HorizontalDivider(Modifier.padding(top = 12.dp))
                        val needle = ruleSearch.trim().lowercase()
                        val shown = if (needle.isBlank()) rules else rules.filter { "${it.keyword} ${it.category}".lowercase().contains(needle) }
                        if (shown.isEmpty()) {
                            Text(if (rules.isEmpty()) t("No rules yet — set a category on a transaction and tick the rule box.") else t("No rules match your search."),
                                Modifier.padding(16.dp), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        shown.forEach { rule ->
                            RuleRow(rule, bankRuleStats(rule, transactions), categoryTax[rule.category], t, locale, fmt, isOwner,
                                expanded = previewRuleId == rule.id,
                                onToggle = { previewRuleId = if (previewRuleId == rule.id) null else rule.id },
                                onShowMatches = { search = rule.keyword; flow = BankFlow.Spending; tab = BankTab.Transactions },
                                onDelete = { run("rule-${rule.id}") { repository.bankDeleteRule(workspaceId, rule.id); null } })
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                        }
                    }
                }
                item {
                    Card {
                        Text("${t("Suggested rules")} (${suggested.size})", fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
                        if (suggested.isEmpty()) Text(t("No suggestions right now — categorise a few more transactions."), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        suggested.forEach { item ->
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                Avatar(item.merchant, 30)
                                Column(Modifier.weight(1f)) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        Text("${item.merchant} ${t("Rule")}", fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                                        Chip(t(item.category), categoryColor(item.category))
                                    }
                                    Text("${t("If merchant contains")} \"${item.keyword}\" · ${item.count} ${t("matches")} · ${fmt(item.total, null)}",
                                        fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                }
                                if (isOwner) {
                                    TextButton(onClick = { run("rule-${item.keyword}") { repository.bankSaveRule(workspaceId, item.keyword, item.category); t("Rule created.") } }) {
                                        Text(t("Create rule"), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // A fresh selection must never inherit the previous row's candidate list.
    LaunchedEffect(selectedTxId) { incomingSuggest = null }

    if (selectedTx != null) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(onDismissRequest = { selectedTxId = null }, sheetState = sheetState) {
            TransactionDetailSheet(
                tx = selectedTx, t = t, locale = locale, fmt = fmt, isOwner = isOwner,
                categoryTax = categoryTax, categoryOptions = categoryOptions,
                accounts = connections.flatMap { it.accounts },
                rules = rules, orders = state.orders,
                suggestion = suggestions[selectedTx.id], orderSuggestion = orderSuggestions[selectedTx.id],
                isRecurring = recurringKeys.contains(bankRecurringMerchantKey(selectedTx)) ||
                    vendors.any { it.keys.contains(bankRecurringMerchantKey(selectedTx)) },
                vendors = vendors, busy = busy,
                onMarkRecurring = { vendorId, cadence ->
                    run("vendor-${selectedTx.id}") {
                        repository.bankSaveVendor(
                            workspaceId,
                            vendorId,
                            if (vendorId.isBlank()) selectedTx.merchant else "",
                            bankRecurringMerchantKey(selectedTx),
                            cadence
                        )
                        if (vendorId.isBlank()) t("Marked as recurring.") else t("Merged with the other payments.")
                    }
                },
                onUnmarkRecurring = { vendorId ->
                    run("vendor-${selectedTx.id}") {
                        repository.bankDeleteVendor(workspaceId, vendorId, bankRecurringMerchantKey(selectedTx))
                        t("No longer treated as recurring.")
                    }
                },
                onSave = { category, vat, note, orderId, reviewStatus, createRule, keyword ->
                    run("drawer") {
                        repository.bankUpdateTransaction(workspaceId, selectedTx.id, category, vat, note, reviewStatus)
                        if (orderId != selectedTx.linkedOrderId) {
                            if (selectedTx.linkedOrderId.isNotBlank()) repository.bankLinkOrder(workspaceId, selectedTx.id, "")
                            if (orderId.isNotBlank()) repository.bankLinkOrder(workspaceId, selectedTx.id, orderId)
                        }
                        if (createRule && category.isNotBlank() && keyword.length >= 2) {
                            repository.bankSaveRule(workspaceId, keyword, category)
                            t("Category saved and rule created.")
                        } else t("Transaction saved.")
                    }
                    selectedTxId = null
                },
                onAttach = { pendingAttachTxId = selectedTx.id; pickFile.launch("*/*") },
                onOpenReceipt = { scope.launch { runCatching { uriHandler.openUri(repository.bankReceiptUrl(selectedTx.receiptPath)) } } },
                onRemoveReceipt = { run("receipt-${selectedTx.id}") { repository.bankRemoveReceipt(workspaceId, selectedTx.id); t("Invoice removed.") } },
                onToggleNotNeeded = { run("receipt-${selectedTx.id}") { repository.bankSetReceiptNotNeeded(workspaceId, selectedTx.id, it); null } },
                onSaveSplits = { lines ->
                    run("splits") {
                        repository.bankSetTransactionSplits(workspaceId, selectedTx.id, lines)
                        if (lines.isEmpty()) t("Split removed.") else t("Split saved.")
                    }
                },
                loadLibraryFiles = { repository.libraryAllFiles(workspaceId).filter { it.trashedAtMs == 0L } },
                onAttachLibraryFile = { fileId ->
                    run("receipt-pick") {
                        repository.bankAttachReceiptFromLibrary(workspaceId, selectedTx.id, fileId)
                        t("Receipt attached from Files.")
                    }
                },
                onIncomingKind = { kind ->
                    run("incoming-kind") { repository.bankSetIncomingKind(workspaceId, selectedTx.id, kind); t("Transaction saved.") }
                },
                incomingSuggest = incomingSuggest,
                onDismissSuggest = { incomingSuggest = null },
                onIncomingAction = { mode, incomingOrderId, paymentId ->
                    run("incoming") {
                        val result = repository.bankMatchIncomingToOrder(workspaceId, selectedTx.id, mode, incomingOrderId, paymentId)
                        when {
                            mode == "suggest" || result.needsChoice -> { incomingSuggest = result; null }
                            result.created -> { incomingSuggest = null; t("Payment recorded on the order.") }
                            result.linked || result.already -> { incomingSuggest = null; t("Matched to the order's existing payment — nothing was recorded twice.") }
                            result.unlinked -> { incomingSuggest = null; t("Match removed — the payment entry stays on the order.") }
                            else -> null
                        }
                    }
                },
                onOpenInventory = {
                    // Close the sheet, then let the main shell switch sections —
                    // the same pending-route pattern the Notes widget uses.
                    selectedTxId = null
                    uk.co.eggcraft.studioflow.services.StudioMessageRouteHolder.setPendingOpenInventory()
                }
            )
        }
    }

    // Status messages fade on their own so the strip does not linger.
    LaunchedEffect(status) {
        if (status != null) { kotlinx.coroutines.delay(4000); status = null }
    }
}

private fun cadenceLabel(cadence: BankCadence): String = when (cadence) {
    BankCadence.Weekly -> "Weekly"; BankCadence.Monthly -> "Monthly"; BankCadence.Yearly -> "Yearly"
}

/** One editable line of the split editor — amount kept as text while typing. */
private data class BankSplitDraft(
    val amount: String,
    val category: String,
    val vatCode: String,
    val note: String,
    val orderId: String
)

/** "Customer" or "Customer · Design" — the same label the order pickers use. */
private fun orderOptionLabel(order: uk.co.eggcraft.studioflow.data.model.StudioOrder): String =
    if (order.designName.isBlank() || order.designName == "Untitled design") order.customerName
    else "${order.customerName} · ${order.designName}"

// ---- Shared pieces ---------------------------------------------------------

@Composable
private fun Card(padding: androidx.compose.ui.unit.Dp = 16.dp, content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Surface(shape = RoundedCornerShape(14.dp), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(padding), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
    }
}

@Composable
private fun CardTitle(title: String) {
    Text(title, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
}

@Composable
private fun SummaryCell(value: String, label: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold, color = color)
        Text(label, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun Chip(text: String, color: Color) {
    Box(Modifier.background(color.copy(alpha = 0.14f), RoundedCornerShape(999.dp)).padding(horizontal = 8.dp, vertical = 2.dp)) {
        Text(text, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, color = color, maxLines = 1)
    }
}

@Composable
private fun Avatar(name: String, size: Int) {
    val initials = name.split(" ").filter { it.isNotBlank() }.take(2).mapNotNull { it.firstOrNull()?.uppercaseChar() }.joinToString("").ifBlank { "•" }
    val color = categoryColor(name)
    Box(Modifier.size(size.dp).background(color.copy(alpha = 0.15f), CircleShape), contentAlignment = Alignment.Center) {
        Text(initials, fontSize = (size * 0.36).sp, fontWeight = FontWeight.ExtraBold, color = color)
    }
}

@Composable
private fun FileBadge(name: String, size: Int = 22) {
    val (icon, color) = when (bankReceiptKind(name)) {
        BankReceiptKind.Pdf -> Icons.Filled.PictureAsPdf to RED
        BankReceiptKind.Image -> Icons.Filled.Image to BLUE
        BankReceiptKind.Doc -> Icons.Filled.Description to GREEN
        BankReceiptKind.File -> Icons.Filled.InsertDriveFile to Color(0xFF6B7280)
    }
    Box(Modifier.size(size.dp).background(color.copy(alpha = 0.12f), RoundedCornerShape(6.dp)), contentAlignment = Alignment.Center) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size((size * 0.62).dp))
    }
}

/** One pile of the Overview "Accounting review" card. */
private data class ReviewPileSpec(val label: String, val count: Int, val filter: String, val color: Color)

private data class StatTileSpec(
    val title: String,
    val value: String,
    val detail: String?,
    val detailColor: Color?,
    val tint: Color,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val onClick: (() -> Unit)? = null
)

@Composable
private fun TileGrid(compact: Boolean, tiles: List<StatTileSpec>) {
    if (compact) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            tiles.chunked(2).forEach { pair ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    pair.forEach { StatTile(it, Modifier.weight(1f)) }
                    if (pair.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
    } else {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) { tiles.forEach { StatTile(it, Modifier.weight(1f)) } }
    }
}

@Composable
private fun StatTile(spec: StatTileSpec, modifier: Modifier) {
    Surface(
        modifier = if (spec.onClick != null) modifier.clickable { spec.onClick.invoke() } else modifier,
        shape = RoundedCornerShape(14.dp), tonalElevation = 1.dp
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(spec.title, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = spec.tint, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(spec.value, fontSize = 19.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (!spec.detail.isNullOrBlank()) {
                    Text(spec.detail, fontSize = 11.sp, color = spec.detailColor ?: MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 3, overflow = TextOverflow.Ellipsis)
                }
            }
            Box(Modifier.size(30.dp).background(spec.tint.copy(alpha = 0.12f), CircleShape), contentAlignment = Alignment.Center) {
                Icon(spec.icon, contentDescription = null, tint = spec.tint, modifier = Modifier.size(16.dp))
            }
        }
    }
}

@Composable
private fun PeriodRow(view: BankPeriodView, label: String, isCurrent: Boolean, t: (String) -> String, onView: (BankPeriodView) -> Unit, onStep: (Int) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        FilterChip(selected = view == BankPeriodView.Week, onClick = { onView(BankPeriodView.Week) }, label = { Text(t("Weekly"), fontSize = 12.sp) })
        FilterChip(selected = view == BankPeriodView.Month, onClick = { onView(BankPeriodView.Month) }, label = { Text(t("Monthly"), fontSize = 12.sp) })
        FilterChip(selected = view == BankPeriodView.Year, onClick = { onView(BankPeriodView.Year) }, label = { Text(t("Yearly"), fontSize = 12.sp) })
        Spacer(Modifier.weight(1f))
        IconButton(onClick = { onStep(-1) }) { Icon(Icons.Filled.ChevronLeft, contentDescription = t("Previous period")) }
        Text(label, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
        IconButton(onClick = { onStep(1) }, enabled = !isCurrent) { Icon(Icons.Filled.ChevronRight, contentDescription = t("Next period")) }
    }
}

@Composable
private fun CategoryRow(name: String, color: Color, amount: String, share: Double) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.size(8.dp).background(color, CircleShape))
            Text(name, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(amount, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Text(String.format(Locale.UK, "%.0f%%", share), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.widthIn(min = 34.dp))
        }
        LinearProgressIndicator(
            progress = { (share / 100).toFloat().coerceIn(0f, 1f) },
            modifier = Modifier.fillMaxWidth().height(5.dp),
            color = color,
            trackColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)
        )
    }
}

@Composable
private fun ConnectionRow(connection: StudioBankConnection, t: (String) -> String, locale: Locale, isOwner: Boolean, openUri: (String) -> Unit) {
    Row(Modifier.padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        if (connection.providerLogo.isNotBlank()) {
            AsyncImage(model = connection.providerLogo, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.size(30.dp))
        } else {
            Icon(Icons.Filled.AccountBalance, contentDescription = null, modifier = Modifier.size(26.dp))
        }
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(connection.providerName.ifBlank { t("Bank") }.uppercase(), fontWeight = FontWeight.ExtraBold, fontSize = 13.sp)
                val stateColor = when {
                    connection.isDisconnected -> Color(0xFF6B7280)
                    !connection.isLinked -> Color(0xFFF59E0B)
                    connection.needsReconnect -> RED
                    connection.isSyncFailing -> AMBER
                    else -> GREEN
                }
                val stateLabel = when {
                    connection.isDisconnected -> t("Disconnected — data kept")
                    !connection.isLinked -> t("Waiting for bank consent…")
                    connection.needsReconnect -> t("Reconnect needed")
                    connection.isSyncFailing -> t("Sync failing")
                    else -> t("Connected")
                }
                Box(Modifier.size(6.dp).background(stateColor, CircleShape))
                Text(stateLabel, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = stateColor)
            }
            connection.lastSyncedAtMillis?.let {
                // Stale data hiding behind a quiet timestamp is how trust dies:
                // past 12 hours, say the age out loud (web dashboard parity).
                val ageMs = System.currentTimeMillis() - it
                if (ageMs > 12L * 60 * 60 * 1000) {
                    val hours = ageMs / (60L * 60 * 1000)
                    val ageText = if (hours < 48) "$hours ${t("hours ago")}" else "${hours / 24} ${t("days ago")}"
                    Text("${t("Last synced")} $ageText", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = AMBER)
                } else {
                    Text("${t("Last sync")} ${SimpleDateFormat("d MMM yyyy HH:mm", locale).format(Date(it))}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (connection.isLinked) {
                // 90-day Open Banking consent — amber and bold once renewal is near.
                connection.consentExpiresAtMillis?.let { expiry ->
                    val daysLeft = ceil((expiry - System.currentTimeMillis()) / 86_400_000.0).toInt()
                    val urgent = daysLeft <= 14
                    Text(
                        "${t("Consent renews by")} ${SimpleDateFormat("d MMM yyyy", locale).format(Date(expiry))}",
                        fontSize = 11.sp,
                        fontWeight = if (urgent) FontWeight.Bold else FontWeight.Normal,
                        color = if (urgent) AMBER else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            if (connection.needsReconnect) {
                Text(t("The bank stopped sharing data — reconnect on the web to resume the feed."), fontSize = 11.sp, color = RED)
            }
        }
        if (isOwner && connection.needsReconnect) {
            OutlinedButton(onClick = { openUri("https://nivadesk.app/bank") }) { Text(t("Reconnect"), fontSize = 12.sp, color = RED) }
        }
    }
}

/** The connection activity trail — one line per recorded sync/connect/
 *  disconnect/purge, newest first, with a green/red dot by outcome. Owner-only
 *  (the caller gates it and the callable re-checks server-side). */
@Composable
private fun BankAuditTrailCard(entries: List<StudioBankAuditEntry>?, t: (String) -> String, locale: Locale) {
    Surface(shape = RoundedCornerShape(14.dp), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(t("Connection activity"), fontSize = 12.5.sp, fontWeight = FontWeight.ExtraBold)
            when {
                entries == null -> Text(t("Loading…"), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                entries.isEmpty() -> Text(
                    t("Nothing recorded yet — the trail starts with the next sync."),
                    fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                else -> entries.forEach { entry ->
                    val label = when {
                        entry.kind == "sync" && entry.ok ->
                            t("Synced") + if (entry.imported > 0) " · ${entry.imported} ${t("new")}" else ""
                        entry.kind == "sync" ->
                            t("Sync failed") + if (entry.error.isNotBlank()) " — ${entry.error.take(90)}" else ""
                        entry.kind == "connected" -> t("Bank connected")
                        entry.kind == "disconnected" -> t("Disconnected — data kept")
                        entry.kind == "purged" -> t("Connection and its imported data deleted")
                        else -> entry.kind
                    }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(Modifier.size(6.dp).background(if (entry.ok) GREEN else RED, CircleShape))
                        Text(
                            SimpleDateFormat("d MMM yyyy HH:mm", locale).format(Date(entry.atMs)),
                            fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        if (entry.bank.isNotBlank()) {
                            Text(entry.bank, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        Text(label, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun TransactionRow(
    tx: StudioBankTransaction, t: (String) -> String, compact: Boolean, amountText: String, dateText: String,
    isDuplicate: Boolean, isRecurring: Boolean, onClick: () -> Unit
) {
    val category = tx.effectiveCategory
    val catColor = if (category.isBlank()) MaterialTheme.colorScheme.onSurfaceVariant else categoryColor(category)
    Row(
        Modifier.clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Avatar(tx.merchant, 30)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                // Review-status dot — only once the row left "unreviewed", same as the web table.
                val reviewStatus = tx.effectiveReviewStatus
                if (reviewStatus != "unreviewed") {
                    Box(Modifier.size(7.dp).background(reviewStatusColor(reviewStatus), CircleShape))
                }
                if (isRecurring) Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(11.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(tx.merchant.ifBlank { "—" }, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (isDuplicate) Chip(t("Duplicate?"), AMBER)
                if (tx.isSpending && tx.splits.isNotEmpty()) Chip("⑃ ${t("Split")} (${tx.splits.size})", PURPLE)
                if (tx.linkedOrderLabel.isNotBlank()) Icon(Icons.Filled.Link, contentDescription = null, modifier = Modifier.size(12.dp), tint = BLUE)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(dateText, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                txTypeMeta(tx.txType)?.let { Chip(if (it.translate) t(it.label) else it.label, it.color) }
                if (tx.isSpending) Chip(if (category.isBlank()) t("Uncategorised") else t(category), catColor)
            }
        }
        if (!compact && tx.isSpending) ReceiptStatus(tx, t)
        Column(horizontalAlignment = Alignment.End) {
            Text((if (tx.isSpending) "−" else "+") + amountText, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold, color = if (tx.isSpending) RED else GREEN)
            if (compact && tx.isSpending) {
                Icon(
                    if (tx.hasReceipt) Icons.Filled.Description else if (tx.receiptNotNeeded) Icons.Filled.Remove else Icons.Filled.AttachFile,
                    contentDescription = null, modifier = Modifier.size(11.dp),
                    tint = if (tx.hasReceipt) GREEN else if (tx.receiptNotNeeded) MaterialTheme.colorScheme.onSurfaceVariant else RED
                )
            }
        }
    }
}

@Composable
private fun ReceiptStatus(tx: StudioBankTransaction, t: (String) -> String) {
    when {
        tx.hasReceipt -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            FileBadge(tx.receiptName, 20); Text(t("Matched"), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = GREEN)
        }
        tx.receiptNotNeeded -> Text(t("Not needed"), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        else -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Icon(Icons.Filled.AttachFile, contentDescription = null, modifier = Modifier.size(13.dp), tint = RED)
            Text(t("Missing"), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = RED)
        }
    }
}

@Composable
private fun RecurringRow(item: BankRecurringSpend, t: (String) -> String, locale: Locale, fmt: (Double, String?) -> String, onClick: () -> Unit) {
    Row(
        Modifier.clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Avatar(item.merchant, 30)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(item.merchant, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (item.manual) Chip(t("Marked by you"), BLUE)
                if (!item.active) Chip(t("Possibly cancelled"), AMBER)
                item.priceChange?.let { (previous, current) ->
                    Chip("${if (current > previous) "↑" else "↓"} ${fmt(previous, item.currency)} → ${fmt(current, item.currency)}", if (current > previous) RED else GREEN)
                }
            }
            if (item.active) {
                // Web parity: "Monthly · around the 15." plus a detection detail line.
                val aroundDay = item.expectedDayOfMonth?.let { " · ${t("around the")} $it." } ?: ""
                Text("${t(cadenceLabel(item.cadence))}$aroundDay · ${t("next")} ${displayDate(item.nextExpected, locale, true)}",
                    fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                val range = if (item.amountMax - item.amountMin > 0.01)
                    " · ${fmt(item.amountMin, item.currency)}–${fmt(item.amountMax, item.currency)}" else ""
                val confidenceColor = when (item.confidence) {
                    BankConfidence.High -> GREEN
                    BankConfidence.Medium -> BLUE
                    BankConfidence.Low -> AMBER
                }
                val confidenceLabel = when (item.confidence) {
                    BankConfidence.High -> t("High")
                    BankConfidence.Medium -> t("Medium")
                    BankConfidence.Low -> t("Low")
                }
                Text(
                    buildAnnotatedString {
                        append("${t("Detected from")} ${item.occurrences} ${t("payments").lowercase()}$range · ")
                        withStyle(SpanStyle(color = confidenceColor, fontWeight = FontWeight.Bold)) {
                            append("${t("Confidence")}: $confidenceLabel")
                        }
                    },
                    fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2
                )
            } else {
                Text("${t(cadenceLabel(item.cadence))} · ${item.occurrences}× · ${t("next")} ${displayDate(item.nextExpected, locale, true)}",
                    fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(fmt(item.typicalAmount, item.currency), fontSize = 12.sp, fontWeight = FontWeight.ExtraBold)
            Text("≈ ${fmt(item.monthlyEquivalent, item.currency)} / ${t("month")}", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ReceiptRow(
    tx: StudioBankTransaction, t: (String) -> String, locale: Locale, fmt: (Double, String?) -> String, isOwner: Boolean,
    onOpen: () -> Unit, onAttach: () -> Unit, onToggleNotNeeded: () -> Unit
) {
    Row(
        Modifier.clickable(onClick = onOpen).padding(horizontal = 14.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(tx.merchant, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(displayDate(tx.bookingDate, locale, true), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("−${fmt(abs(tx.amount), tx.currency)}", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = RED)
                if (tx.effectiveCategory.isNotBlank()) Chip(t(tx.effectiveCategory), categoryColor(tx.effectiveCategory))
            }
            if (tx.hasReceipt) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    FileBadge(tx.receiptName, 18)
                    Text(tx.receiptName, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        ReceiptStatus(tx, t)
        if (isOwner && !tx.hasReceipt) {
            var menu by remember { mutableStateOf(false) }
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Filled.AttachFile, contentDescription = t("Attach"), tint = BLUE) }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(text = { Text(t("Attach")) }, onClick = { menu = false; onAttach() })
                    DropdownMenuItem(text = { Text(if (tx.receiptNotNeeded) t("Needs receipt") else t("No receipt needed")) }, onClick = { menu = false; onToggleNotNeeded() })
                }
            }
        }
    }
}

@Composable
private fun WaitingRow(
    item: StudioBankWaitingReceipt, t: (String) -> String, locale: Locale, fmt: (Double, String?) -> String, isOwner: Boolean,
    picking: Boolean, candidates: List<StudioBankTransaction>,
    onTogglePick: () -> Unit, onAssign: (StudioBankTransaction) -> Unit, onRemove: () -> Unit
) {
    val stale = item.ageDays >= 14
    Surface(shape = RoundedCornerShape(10.dp), tonalElevation = 2.dp, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                FileBadge(item.fileName, 28)
                Column(Modifier.weight(1f)) {
                    Text(item.fileName, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    val parts = listOfNotNull(
                        if (item.amount > 0) fmt(item.amount, null) else t("Amount unknown"),
                        if (item.date.isNotBlank()) displayDate(item.date, locale, true) else null,
                        if (item.source == "chatgpt") "ChatGPT" else t("Web"),
                        if (item.ageDays == 0) t("today") else "${item.ageDays} ${t("days waiting")}"
                    )
                    Text(parts.joinToString(" · "), fontSize = 11.sp, color = if (stale) RED else MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                }
                if (isOwner) {
                    TextButton(onClick = onTogglePick) { Text(if (picking) t("Cancel") else t("Assign"), fontSize = 12.sp) }
                    IconButton(onClick = onRemove) { Icon(Icons.Filled.Delete, contentDescription = t("Remove"), tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
            if (picking) {
                Column(Modifier.heightIn(max = 220.dp).verticalScrollCompat()) {
                    candidates.take(40).forEach { tx ->
                        Row(
                            Modifier.fillMaxWidth().clickable { onAssign(tx) }.padding(vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text(displayDate(tx.bookingDate, locale, true), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(56.dp))
                            Text(tx.merchant, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                            Text("−${fmt(abs(tx.amount), tx.currency)}", fontSize = 12.sp, fontWeight = FontWeight.Bold,
                                color = if (abs(abs(tx.amount) - item.amount) < 0.015) GREEN else MaterialTheme.colorScheme.onSurface)
                        }
                    }
                }
            }
        }
    }
}

private fun Modifier.verticalScrollCompat(): Modifier = this.then(Modifier)

@Composable
private fun RuleRow(
    rule: StudioBankRule, stats: Triple<Int, Double, Pair<String, String>>, taxCode: String?,
    t: (String) -> String, locale: Locale, fmt: (Double, String?) -> String, isOwner: Boolean,
    expanded: Boolean, onToggle: () -> Unit, onShowMatches: () -> Unit, onDelete: () -> Unit
) {
    val (count, total, lastAndType) = stats
    val appliesTo = when (lastAndType.second) {
        "PURCHASE", "POS" -> t("Card spending")
        "DIRECT_DEBIT" -> "${t("Direct Debit")} (DD)"
        else -> txTypeMeta(lastAndType.second)?.let { if (it.translate) t(it.label) else it.label } ?: "—"
    }
    Column(Modifier.clickable(onClick = onToggle).padding(horizontal = 14.dp, vertical = 9.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Column(Modifier.weight(1f)) {
                Text("${rule.keyword.replaceFirstChar { it.uppercase() }} ${t(rule.category)} ${t("Rule")}", fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${t("If merchant contains")} ${rule.keyword.uppercase()}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Chip(t(rule.category), categoryColor(rule.category))
            Chip(t("Active"), GREEN)
            if (isOwner) IconButton(onClick = onDelete) { Icon(Icons.Filled.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp)) }
        }
        if (expanded) {
            Surface(shape = RoundedCornerShape(9.dp), color = BLUE.copy(alpha = 0.07f), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("$count ${t("Matching transactions")} · ${fmt(total, null)}", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                    Text("${t("VAT / Tax code")}: ${taxCode?.let { t(bankVatLabel(it)) } ?: "— (${t("No VAT")})"} · ${t("Applies to")}: $appliesTo", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (lastAndType.first.isNotBlank()) Text("${t("Last used")} ${displayDate(lastAndType.first, locale, true)}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    TextButton(onClick = onShowMatches, contentPadding = PaddingValues(0.dp)) { Text("${t("View matching transactions")} →", fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                }
            }
        }
    }
}

@Composable
private fun CategoryPicker(selected: String, options: List<String>, t: (String) -> String, onSelect: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { open = true }) {
            Text(if (selected.isBlank()) "${t("Category")}…" else t(selected), fontSize = 12.sp)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(text = { Text(t("Uncategorised")) }, onClick = { onSelect(""); open = false })
            options.forEach { option ->
                DropdownMenuItem(text = { Text(t(option)) }, onClick = { onSelect(option); open = false })
            }
        }
    }
}

@Composable
private fun OcrCard(
    ocr: BankOcrResult, t: (String) -> String, locale: Locale, fmt: (Double, String?) -> String, isOwner: Boolean, busy: String?,
    onAttach: (uk.co.eggcraft.studioflow.data.firebase.BankOcrCandidate) -> Unit, onKeepWaiting: () -> Unit, onDismiss: () -> Unit
) {
    Card {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FileBadge(ocr.fileName, 24)
            Column(Modifier.weight(1f)) {
                Text(ocr.fileName, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    if (ocr.amount > 0) "${t("Detected")}: ${fmt(ocr.amount, null)}${if (ocr.date.isNotBlank()) " · ${ocr.date}" else ""}" else t("No amount detected on the receipt."),
                    fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            IconButton(onClick = onDismiss) { Icon(Icons.Filled.Close, contentDescription = null) }
        }
        if (ocr.candidates.isEmpty()) {
            Text(t("No matching transaction yet — card payments usually reach the bank feed 1–3 days later."), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        ocr.candidates.forEach { candidate ->
            Surface(shape = RoundedCornerShape(9.dp), tonalElevation = 2.dp, modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(candidate.merchant, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(displayDate(candidate.bookingDate, locale), fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text("−${fmt(abs(candidate.amount), candidate.currency)}", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = RED)
                    Text("${minOf(99, candidate.score)}%", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (isOwner) TextButton(onClick = { onAttach(candidate) }, enabled = busy != "ocr-assign") { Text(t("Attach"), fontSize = 12.sp) }
                }
            }
        }
        if (isOwner && ocr.amount > 0) {
            Button(onClick = onKeepWaiting, enabled = busy != "ocr-queue") {
                Icon(Icons.Filled.HourglassEmpty, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text(if (ocr.candidates.isEmpty()) t("Keep waiting for the bank") else t("None of these — keep waiting for the bank"), fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun TransactionDetailSheet(
    tx: StudioBankTransaction, t: (String) -> String, locale: Locale, fmt: (Double, String?) -> String, isOwner: Boolean,
    categoryTax: Map<String, String>, categoryOptions: List<String>, accounts: List<StudioBankAccount>,
    rules: List<StudioBankRule>, orders: List<uk.co.eggcraft.studioflow.data.model.StudioOrder>,
    suggestion: uk.co.eggcraft.studioflow.data.model.BankCategorySuggestion?,
    orderSuggestion: uk.co.eggcraft.studioflow.data.model.BankOrderLinkSuggestion?,
    isRecurring: Boolean,
    vendors: List<uk.co.eggcraft.studioflow.data.model.StudioBankVendor>, busy: String?,
    onMarkRecurring: (String, String) -> Unit, onUnmarkRecurring: (String) -> Unit,
    onSave: (String, String, String, String, String, Boolean, String) -> Unit,
    onAttach: () -> Unit, onOpenReceipt: () -> Unit, onRemoveReceipt: () -> Unit, onToggleNotNeeded: (Boolean) -> Unit,
    /** Sends the split lines to bankSetTransactionSplits — an empty list clears the split. */
    onSaveSplits: (List<Map<String, Any?>>) -> Unit,
    /** Lists the central Files library (already filtered of trashed records). */
    loadLibraryFiles: suspend () -> List<StudioLibraryFile>,
    onAttachLibraryFile: (String) -> Unit,
    /** Classifies the incoming payment (bankUpdateTransaction incomingKind). */
    onIncomingKind: (String) -> Unit,
    incomingSuggest: BankIncomingMatchResult?,
    onDismissSuggest: () -> Unit,
    /** (mode, orderId, paymentId) → bankMatchIncomingToOrder. */
    onIncomingAction: (String, String, String) -> Unit,
    /** "View in Inventory" on the linked-purchase row — switches to the Inventory section. */
    onOpenInventory: () -> Unit
) {
    var category by remember(tx.id) { mutableStateOf(tx.category.ifBlank { tx.categoryAuto }) }
    var vat by remember(tx.id) { mutableStateOf(tx.vatCode) }
    var note by remember(tx.id) { mutableStateOf(tx.note) }
    var orderId by remember(tx.id) { mutableStateOf(tx.linkedOrderId) }
    var review by remember(tx.id) { mutableStateOf(tx.effectiveReviewStatus) }
    var ruleKeyword by remember(tx.id) { mutableStateOf(bankSuggestRuleKeyword(tx)) }
    var bankDataOpen by remember(tx.id) { mutableStateOf(false) }
    var vatMenu by remember { mutableStateOf(false) }
    var orderMenu by remember { mutableStateOf(false) }
    var reviewMenu by remember { mutableStateOf(false) }
    var cadenceMenu by remember { mutableStateOf(false) }
    var vendorMenu by remember { mutableStateOf(false) }
    val merchantKey = remember(tx.id) { bankRecurringMerchantKey(tx) }
    val vendor = vendors.firstOrNull { it.keys.contains(merchantKey) }
    val rankedOrders = remember(tx.id, orders) { bankRankOrders(tx, orders).take(40).map { it.first } }
    val canSuggestRule = tx.isSpending && isOwner && category.isNotBlank() &&
        rules.none { "${tx.counterparty} ${tx.description}".lowercase().contains(it.keyword) }

    // Split editor draft; null = not editing (the saved lines show read-only).
    var splitRows by remember(tx.id) { mutableStateOf<List<BankSplitDraft>?>(null) }
    // Files-library receipt picker.
    val sheetScope = rememberCoroutineScope()
    var filesPickerOpen by remember(tx.id) { mutableStateOf(false) }
    var filesPickerLoading by remember { mutableStateOf(false) }
    var filesPickerError by remember { mutableStateOf<String?>(null) }
    var libraryFiles by remember { mutableStateOf<List<StudioLibraryFile>>(emptyList()) }
    var fileSearch by remember { mutableStateOf("") }
    // Incoming ↔ order payment flow.
    var incomingOrderId by remember(tx.id) { mutableStateOf("") }
    var confirmCreatePayment by remember(tx.id) { mutableStateOf(false) }

    fun openFilesPicker() {
        filesPickerOpen = true; filesPickerLoading = true; filesPickerError = null; fileSearch = ""
        sheetScope.launch {
            runCatching { loadLibraryFiles() }
                .onSuccess { libraryFiles = it; filesPickerLoading = false }
                .onFailure { filesPickerError = it.message ?: "The file library could not be loaded."; filesPickerLoading = false }
        }
    }

    fun startSplitEditor() {
        val required = abs(tx.amount)
        splitRows = if (tx.splits.isNotEmpty()) {
            tx.splits.map { BankSplitDraft(String.format(Locale.UK, "%.2f", it.amount), it.category, it.vatCode, it.note, it.orderId) }
        } else listOf(
            BankSplitDraft(String.format(Locale.UK, "%.2f", required), category, vat, "", ""),
            BankSplitDraft("0.00", "", "", "", "")
        )
    }

    Column(
        Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 18.dp).padding(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Avatar(tx.merchant, 38)
            Column(Modifier.weight(1f)) {
                Text(tx.merchant, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    txTypeMeta(tx.txType)?.let { Chip(if (it.translate) t(it.label) else it.label, it.color) }
                    Text(displayDate(tx.bookingDate, locale), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Text((if (tx.isSpending) "−" else "+") + fmt(abs(tx.amount), tx.currency), fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, color = if (tx.isSpending) RED else GREEN)
        }
        Column {
            Text(t("Raw bank description"), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(tx.description.ifBlank { "—" }, fontSize = 12.sp)
        }
        // The read-only bank layer, kept visibly apart from NivaDesk's own
        // enrichment: what the bank said never changes here.
        Surface(shape = RoundedCornerShape(10.dp), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Row(
                    Modifier.fillMaxWidth().clickable { bankDataOpen = !bankDataOpen },
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text("${t("Bank data")} · ${t("Read-only")}", fontSize = 11.sp, fontWeight = FontWeight.ExtraBold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                    Icon(if (bankDataOpen) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, contentDescription = null,
                        modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (bankDataOpen) {
                    val account = accounts.firstOrNull { it.id == tx.accountId }
                    listOf(
                        t("Bank transaction ID") to tx.providerTransactionId.ifBlank { tx.id },
                        t("Bank account") to (account?.let { "${it.name}${if (it.currency.isNotBlank()) " · ${it.currency}" else ""}" } ?: tx.accountId.ifBlank { "—" }),
                        t("Status") to if (tx.status == "pending") t("pending") else t("Booked"),
                        t("Bank reference") to tx.providerReference.ifBlank { "—" },
                        t("Open Banking provider") to if (tx.provider == "truelayer") "TrueLayer" else tx.provider.ifBlank { "—" },
                        t("First imported") to (tx.firstImportedAtMillis?.let { SimpleDateFormat("d MMM yyyy", locale).format(Date(it)) } ?: "—"),
                        t("Last updated") to (tx.importedAtMillis?.let { SimpleDateFormat("d MMM yyyy HH:mm", locale).format(Date(it)) } ?: "—")
                    ).forEach { (label, value) ->
                        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(label, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(130.dp))
                            Text(value, fontSize = 11.sp, modifier = Modifier.weight(1f))
                        }
                    }
                    Text(t("Bank data can never be edited — everything below is NivaDesk's own enrichment."),
                        fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (tx.isSpending) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(t("Bookkeeping"), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(t("Category"), fontSize = 12.sp, modifier = Modifier.width(110.dp))
                    CategoryPicker(category, (categoryOptions + listOfNotNull(category.ifBlank { null })).distinct(), t) { category = it }
                }
                if (tx.category.isBlank() && tx.categoryAuto.isNotBlank()) {
                    // categoryAutoRule names the rule keyword that applied it (longest keyword wins).
                    val ruleTrace = if (tx.categoryAutoRule.isNotBlank()) " · “${tx.categoryAutoRule}”" else ""
                    Text("⚡ ${t("Auto-applied")}: ${t(tx.categoryAuto)}$ruleTrace", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (category.isBlank() && suggestion != null) {
                    TextButton(onClick = { category = suggestion.category }, contentPadding = PaddingValues(0.dp)) {
                        Text("✦ ${t(suggestion.category)}? · ${(suggestion.confidence * 100).toInt()}%", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(t("VAT / Tax code"), fontSize = 12.sp, modifier = Modifier.width(110.dp))
                    Box {
                        OutlinedButton(onClick = { vatMenu = true }) {
                            Text(if (vat.isBlank()) "${t("Use category default")}${categoryTax[category]?.let { " (${t(bankVatLabel(it))})" } ?: ""}" else t(bankVatLabel(vat)), fontSize = 12.sp, maxLines = 1)
                        }
                        DropdownMenu(expanded = vatMenu, onDismissRequest = { vatMenu = false }) {
                            DropdownMenuItem(text = { Text(t("Use category default")) }, onClick = { vat = ""; vatMenu = false })
                            BANK_VAT_CODES.forEach { (code, label) ->
                                DropdownMenuItem(text = { Text(t(label)) }, onClick = { vat = code; vatMenu = false })
                            }
                        }
                    }
                }
                if (tx.vatCode.isBlank() && tx.vatCodeAuto.isNotBlank()) {
                    // A rule filled the VAT in — effective VAT is vatCode || vatCodeAuto || category default.
                    Text("⚡ ${t("Auto-applied")}: ${t(bankVatLabel(tx.vatCodeAuto))}", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(t("Linked order or project"), fontSize = 12.sp, modifier = Modifier.width(110.dp))
                    Box {
                        OutlinedButton(onClick = { orderMenu = true }) {
                            val label = rankedOrders.firstOrNull { it.id == orderId }?.let { order ->
                                if (order.designName.isBlank() || order.designName == "Untitled design") order.customerName else "${order.customerName} · ${order.designName}"
                            } ?: tx.linkedOrderLabel.ifBlank { t("Not linked") }
                            Text(label, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        DropdownMenu(expanded = orderMenu, onDismissRequest = { orderMenu = false }) {
                            DropdownMenuItem(text = { Text(t("Not linked")) }, onClick = { orderId = ""; orderMenu = false })
                            rankedOrders.forEach { order ->
                                DropdownMenuItem(
                                    text = { Text(if (order.designName.isBlank() || order.designName == "Untitled design") order.customerName else "${order.customerName} · ${order.designName}") },
                                    onClick = { orderId = order.id; orderMenu = false }
                                )
                            }
                        }
                    }
                }
                if (orderId.isBlank() && orderSuggestion != null) {
                    TextButton(onClick = { orderId = orderSuggestion.orderId }, contentPadding = PaddingValues(0.dp)) {
                        Text("⛓ ${t("Likely related to this order")}: ${orderSuggestion.label} (${(orderSuggestion.confidence * 100).toInt()}%)", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(t("Receipt / attachment"), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (tx.hasReceipt) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FileBadge(tx.receiptName, 28)
                        Column(Modifier.weight(1f)) {
                            Text("✓ ${t("Receipt matched")}", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = GREEN)
                            TextButton(onClick = onOpenReceipt, contentPadding = PaddingValues(0.dp)) {
                                Text(tx.receiptName.ifBlank { t("View invoice") }, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Icon(Icons.Filled.OpenInNew, contentDescription = null, modifier = Modifier.size(12.dp))
                            }
                        }
                        if (isOwner) IconButton(onClick = onRemoveReceipt) { Icon(Icons.Filled.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                } else {
                    Text(if (tx.receiptNotNeeded) t("No receipt needed") else "! ${t("Missing receipt")}", fontSize = 12.sp, fontWeight = FontWeight.Bold,
                        color = if (tx.receiptNotNeeded) MaterialTheme.colorScheme.onSurfaceVariant else RED)
                    if (isOwner) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            AssistChip(onClick = onAttach, label = { Text(t("Upload new"), fontSize = 12.sp) },
                                leadingIcon = { Icon(Icons.Filled.AttachFile, contentDescription = null, modifier = Modifier.size(16.dp)) },
                                colors = AssistChipDefaults.assistChipColors())
                            AssistChip(onClick = { openFilesPicker() }, enabled = !filesPickerLoading,
                                label = { Text(if (filesPickerLoading) t("Loading…") else t("Choose from Files"), fontSize = 12.sp) },
                                leadingIcon = { Icon(Icons.Filled.InsertDriveFile, contentDescription = null, modifier = Modifier.size(16.dp)) },
                                colors = AssistChipDefaults.assistChipColors())
                        }
                    }
                    if (filesPickerOpen) {
                        Surface(shape = RoundedCornerShape(10.dp), color = BLUE.copy(alpha = 0.06f), modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text(t("Choose from Files"), fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.weight(1f))
                                    IconButton(onClick = { filesPickerOpen = false }, modifier = Modifier.size(26.dp)) {
                                        Icon(Icons.Filled.Close, contentDescription = t("Cancel"), modifier = Modifier.size(16.dp))
                                    }
                                }
                                OutlinedTextField(
                                    value = fileSearch, onValueChange = { fileSearch = it },
                                    placeholder = { Text(t("Search files"), fontSize = 12.sp) },
                                    leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, modifier = Modifier.size(16.dp)) },
                                    singleLine = true, modifier = Modifier.fillMaxWidth()
                                )
                                filesPickerError?.let { Text(it, fontSize = 11.sp, color = RED) }
                                val needle = fileSearch.trim().lowercase()
                                val shown = libraryFiles
                                    .filter { needle.isBlank() || "${it.displayName} ${it.fileName}".lowercase().contains(needle) }
                                    .take(40)
                                Column(Modifier.heightIn(max = 220.dp).verticalScroll(rememberScrollState())) {
                                    shown.forEach { file ->
                                        Row(
                                            Modifier.fillMaxWidth().clickable(enabled = busy != "receipt-pick") {
                                                filesPickerOpen = false
                                                onAttachLibraryFile(file.id)
                                            }.padding(vertical = 5.dp),
                                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            FileBadge(file.fileName, 22)
                                            Text(file.displayName.ifBlank { file.fileName }, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        }
                                    }
                                    if (!filesPickerLoading && filesPickerError == null && shown.isEmpty()) {
                                        Text(t("The library is empty."), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                                Text(t("The file is referenced, not copied — an invoice already on a purchase is never uploaded twice."),
                                    fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                    if (isOwner) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(t("No receipt needed"), fontSize = 12.sp, modifier = Modifier.weight(1f))
                            Switch(checked = tx.receiptNotNeeded, onCheckedChange = onToggleNotNeeded)
                        }
                    }
                }
            }
            // Payment created from an Inventory purchase — mirrors the web drawer row.
            if (tx.purchaseNumber.isNotBlank()) {
                Surface(shape = RoundedCornerShape(10.dp), color = GREEN.copy(alpha = 0.07f), modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("▣ ${tx.purchaseNumber}", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = GREEN)
                        Text(t("This payment is linked to a purchase — its supplier and stock items live in Inventory."),
                            fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        TextButton(onClick = onOpenInventory, contentPadding = PaddingValues(0.dp)) {
                            Text("${t("View in Inventory")} →", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
            // ---- Split transaction: one payment, several categories/orders ----
            val editingRows = splitRows
            if (editingRows != null) {
                val required = abs(tx.amount)
                val total = editingRows.sumOf { it.amount.replace(",", ".").toDoubleOrNull() ?: 0.0 }
                val balanced = abs(total - required) <= 0.005
                Surface(shape = RoundedCornerShape(10.dp), color = BLUE.copy(alpha = 0.06f), modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("⑃ ${t("Split transaction")}", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold)
                        editingRows.forEachIndexed { index, row ->
                            Surface(shape = RoundedCornerShape(9.dp), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                                Column(Modifier.padding(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        OutlinedTextField(
                                            value = row.amount,
                                            onValueChange = { value -> splitRows = editingRows.mapIndexed { i, r -> if (i == index) r.copy(amount = value) else r } },
                                            label = { Text(t("Amount"), fontSize = 11.sp) }, singleLine = true,
                                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                            modifier = Modifier.width(110.dp)
                                        )
                                        Box(Modifier.weight(1f)) {
                                            CategoryPicker(row.category, categoryOptions, t) { value ->
                                                splitRows = editingRows.mapIndexed { i, r -> if (i == index) r.copy(category = value) else r }
                                            }
                                        }
                                        IconButton(
                                            onClick = { if (editingRows.size > 2) splitRows = editingRows.filterIndexed { i, _ -> i != index } },
                                            enabled = editingRows.size > 2
                                        ) { Icon(Icons.Filled.Delete, contentDescription = t("Remove"), modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                                    }
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        var lineVatMenu by remember { mutableStateOf(false) }
                                        Box {
                                            OutlinedButton(onClick = { lineVatMenu = true }) {
                                                Text(if (row.vatCode.isBlank()) "${t("VAT")}…" else t(bankVatLabel(row.vatCode)), fontSize = 11.sp, maxLines = 1)
                                            }
                                            DropdownMenu(expanded = lineVatMenu, onDismissRequest = { lineVatMenu = false }) {
                                                DropdownMenuItem(text = { Text("${t("VAT")}…") }, onClick = {
                                                    splitRows = editingRows.mapIndexed { i, r -> if (i == index) r.copy(vatCode = "") else r }; lineVatMenu = false
                                                })
                                                BANK_VAT_CODES.forEach { (code, label) ->
                                                    DropdownMenuItem(text = { Text(t(label)) }, onClick = {
                                                        splitRows = editingRows.mapIndexed { i, r -> if (i == index) r.copy(vatCode = code) else r }; lineVatMenu = false
                                                    })
                                                }
                                            }
                                        }
                                        var lineOrderMenu by remember { mutableStateOf(false) }
                                        Box {
                                            OutlinedButton(onClick = { lineOrderMenu = true }) {
                                                Text(
                                                    rankedOrders.firstOrNull { it.id == row.orderId }?.let { orderOptionLabel(it) } ?: t("Not linked"),
                                                    fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis
                                                )
                                            }
                                            DropdownMenu(expanded = lineOrderMenu, onDismissRequest = { lineOrderMenu = false }) {
                                                DropdownMenuItem(text = { Text(t("Not linked")) }, onClick = {
                                                    splitRows = editingRows.mapIndexed { i, r -> if (i == index) r.copy(orderId = "") else r }; lineOrderMenu = false
                                                })
                                                rankedOrders.forEach { order ->
                                                    DropdownMenuItem(text = { Text(orderOptionLabel(order)) }, onClick = {
                                                        splitRows = editingRows.mapIndexed { i, r -> if (i == index) r.copy(orderId = order.id) else r }; lineOrderMenu = false
                                                    })
                                                }
                                            }
                                        }
                                    }
                                    OutlinedTextField(
                                        value = row.note,
                                        onValueChange = { value -> splitRows = editingRows.mapIndexed { i, r -> if (i == index) r.copy(note = value) else r } },
                                        label = { Text(t("Note"), fontSize = 11.sp) }, singleLine = true, modifier = Modifier.fillMaxWidth()
                                    )
                                }
                            }
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(onClick = { splitRows = editingRows + BankSplitDraft("0.00", "", "", "", "") }, contentPadding = PaddingValues(0.dp)) {
                                Text("＋ ${t("Add line")}", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                            Spacer(Modifier.weight(1f))
                            Text("${fmt(total, tx.currency)} / ${fmt(required, tx.currency)}",
                                fontSize = 12.sp, fontWeight = FontWeight.Bold, color = if (balanced) GREEN else RED)
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = { splitRows = null }) { Text(t("Cancel"), fontSize = 12.sp) }
                            Button(onClick = {
                                val lines = editingRows
                                    .filter { (it.amount.replace(",", ".").toDoubleOrNull() ?: 0.0) > 0 || it.category.isNotBlank() }
                                    .map { row ->
                                        mapOf<String, Any?>(
                                            "amount" to (row.amount.replace(",", ".").toDoubleOrNull() ?: 0.0),
                                            "category" to row.category,
                                            "vatCode" to row.vatCode,
                                            "note" to row.note,
                                            "orderId" to row.orderId
                                        )
                                    }
                                splitRows = null
                                onSaveSplits(lines)
                            }, enabled = balanced && busy != "splits") {
                                Text(if (busy == "splits") t("Saving…") else t("Save split"), fontSize = 12.sp)
                            }
                        }
                        if (!balanced) Text(t("Split lines must add up to the exact transaction amount."), fontSize = 10.sp, color = RED)
                    }
                }
            } else if (tx.splits.isNotEmpty()) {
                Surface(shape = RoundedCornerShape(10.dp), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("⑃ ${t("Split transaction")} (${tx.splits.size})", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.weight(1f))
                            if (isOwner) {
                                TextButton(onClick = { startSplitEditor() }, contentPadding = PaddingValues(0.dp)) { Text(t("Edit"), fontSize = 12.sp, fontWeight = FontWeight.Bold) }
                                TextButton(onClick = { onSaveSplits(emptyList()) }, enabled = busy != "splits", contentPadding = PaddingValues(0.dp)) {
                                    Text(t("Remove"), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = RED)
                                }
                            }
                        }
                        tx.splits.forEach { line ->
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(fmt(line.amount, tx.currency), fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.widthIn(min = 68.dp))
                                if (line.category.isNotBlank()) Chip(t(line.category), categoryColor(line.category))
                                if (line.vatCode.isNotBlank()) Text(t(bankVatLabel(line.vatCode)), fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                if (line.orderLabel.isNotBlank()) Text("⛓ ${line.orderLabel}", fontSize = 10.sp, color = BLUE, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                                if (line.note.isNotBlank()) Text(line.note, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                            }
                        }
                    }
                }
            } else if (isOwner) {
                TextButton(onClick = { startSplitEditor() }, contentPadding = PaddingValues(0.dp)) {
                    Text("⑃ ${t("Split this transaction into several categories or orders")}", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        if (tx.amount > 0) {
            // ---- Incoming ↔ order payment: what this money actually is ----
            Surface(shape = RoundedCornerShape(10.dp), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("⇥ ${t("Match to")}", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        var kindMenu by remember { mutableStateOf(false) }
                        Box {
                            OutlinedButton(onClick = { kindMenu = true }, enabled = isOwner && busy != "incoming-kind") {
                                Text(t(bankIncomingKindLabel(tx.incomingKind)), fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            DropdownMenu(expanded = kindMenu, onDismissRequest = { kindMenu = false }) {
                                BANK_INCOMING_KINDS.forEach { (code, label) ->
                                    DropdownMenuItem(text = { Text(t(label)) }, onClick = {
                                        kindMenu = false
                                        // "Order payment" is chosen through the order flow below.
                                        if (code != "order_payment") onIncomingKind(code)
                                    })
                                }
                            }
                        }
                        if (tx.incomingKind in BANK_NON_REVENUE_INCOMING_KINDS) {
                            Text(t("Not counted as revenue."), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    if (tx.incomingKind == "order_payment" && tx.linkedPaymentId.isNotBlank()) {
                        Text("✓ ${t("Matched to the order's existing payment — nothing was recorded twice.")}", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = GREEN)
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (tx.linkedOrderLabel.isNotBlank()) Text("⛓ ${tx.linkedOrderLabel}", fontSize = 11.sp, color = BLUE, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                            if (isOwner) {
                                TextButton(onClick = { onIncomingAction("unlink", "", "") }, enabled = busy != "incoming", contentPadding = PaddingValues(0.dp)) {
                                    Text(t("Unlink"), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    } else if (isOwner) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            var incomingOrderMenu by remember { mutableStateOf(false) }
                            Box(Modifier.weight(1f)) {
                                OutlinedButton(onClick = { incomingOrderMenu = true }) {
                                    Text(
                                        rankedOrders.firstOrNull { it.id == incomingOrderId }?.let { orderOptionLabel(it) } ?: "${t("Order")}…",
                                        fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis
                                    )
                                }
                                DropdownMenu(expanded = incomingOrderMenu, onDismissRequest = { incomingOrderMenu = false }) {
                                    rankedOrders.forEach { order ->
                                        DropdownMenuItem(text = { Text(orderOptionLabel(order)) }, onClick = {
                                            incomingOrderId = order.id; incomingOrderMenu = false; onDismissSuggest()
                                        })
                                    }
                                }
                            }
                            OutlinedButton(
                                onClick = { onIncomingAction("suggest", incomingOrderId, "") },
                                enabled = incomingOrderId.isNotBlank() && busy != "incoming"
                            ) { Text(if (busy == "incoming") t("Loading…") else t("Find matching payment"), fontSize = 12.sp) }
                        }
                        if (incomingSuggest != null) {
                            incomingSuggest.candidates.forEach { candidate ->
                                Surface(shape = RoundedCornerShape(9.dp), tonalElevation = 2.dp, modifier = Modifier.fillMaxWidth()) {
                                    Row(Modifier.padding(8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Column(Modifier.weight(1f)) {
                                            Text(fmt(candidate.amount, tx.currency), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                            Text(
                                                listOfNotNull(
                                                    candidate.method.ifBlank { null },
                                                    candidate.dateMs.takeIf { it > 0 }?.let { SimpleDateFormat("d MMM yyyy", locale).format(Date(it)) }
                                                ).joinToString(" · "),
                                                fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis
                                            )
                                        }
                                        TextButton(onClick = { onIncomingAction("link", incomingOrderId, candidate.id) }, enabled = busy != "incoming") {
                                            Text("✓ ${t("Match this payment")}", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = GREEN)
                                        }
                                    }
                                }
                            }
                            if (incomingSuggest.candidates.isEmpty()) {
                                Text(t("No unmatched payment with this amount on the order."), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            TextButton(onClick = { confirmCreatePayment = true }, enabled = busy != "incoming", contentPadding = PaddingValues(0.dp)) {
                                Text("＋ ${t("Record as a new payment on this order")}", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
            if (confirmCreatePayment) {
                AlertDialog(
                    onDismissRequest = { confirmCreatePayment = false },
                    text = { Text("${t("Record a NEW payment on this order?")} (${fmt(tx.amount, tx.currency)})", fontSize = 13.sp) },
                    confirmButton = {
                        TextButton(onClick = { confirmCreatePayment = false; onIncomingAction("create", incomingOrderId, "") }) {
                            Text(t("Record as a new payment on this order"), fontWeight = FontWeight.Bold)
                        }
                    },
                    dismissButton = { TextButton(onClick = { confirmCreatePayment = false }) { Text(t("Cancel")) } }
                )
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(t("Review status"), fontSize = 12.sp, modifier = Modifier.width(110.dp))
            Box {
                OutlinedButton(onClick = { reviewMenu = true }, enabled = isOwner) {
                    Text(t(bankReviewStatusLabel(review)), fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                DropdownMenu(expanded = reviewMenu, onDismissRequest = { reviewMenu = false }) {
                    BANK_REVIEW_STATUSES.forEach { (code, label) ->
                        DropdownMenuItem(text = { Text(t(label)) }, onClick = { review = code; reviewMenu = false })
                    }
                }
            }
            Chip(t(bankReviewStatusLabel(review)), reviewStatusColor(review))
        }
        OutlinedTextField(value = note, onValueChange = { note = it }, label = { Text(t("Notes"), fontSize = 12.sp) },
            placeholder = { Text(t("Internal note for this transaction"), fontSize = 12.sp) }, enabled = isOwner, modifier = Modifier.fillMaxWidth())
        if (canSuggestRule) {
            Surface(shape = RoundedCornerShape(10.dp), color = BLUE.copy(alpha = 0.07f), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("✦ ${t("Rule suggestion")}", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    OutlinedTextField(value = ruleKeyword, onValueChange = { ruleKeyword = it }, label = { Text(t("If merchant contains"), fontSize = 11.sp) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Button(onClick = { onSave(category, vat, note, orderId, review, true, ruleKeyword.trim().lowercase()) }, enabled = busy != "drawer") {
                        Text(t("Create rule"), fontSize = 12.sp)
                    }
                }
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            if (vendor != null) {
                Text("${t("Recurring")}: ${t("Marked as recurring")} · ${t(cadenceLabel(vendor.cadence))}",
                    fontSize = 11.sp, fontWeight = FontWeight.Bold, color = GREEN)
                Text("${t("Grouped as")} “${vendor.name.ifBlank { tx.merchant }}”",
                    fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (isOwner) {
                    TextButton(onClick = { onUnmarkRecurring(vendor.id) }, enabled = busy == null, contentPadding = PaddingValues(0.dp)) {
                        Text(t("Stop treating as recurring"), fontSize = 12.sp, color = RED)
                    }
                }
            } else {
                Text("${t("Recurring")}: ${if (isRecurring) t("Part of a recurring payment") else t("This transaction doesn't appear to repeat.")}",
                    fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (isOwner && tx.isSpending) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box {
                            AssistChip(onClick = { cadenceMenu = true },
                                label = { Text(t("Mark as recurring"), fontSize = 12.sp) },
                                leadingIcon = { Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(16.dp)) })
                            DropdownMenu(expanded = cadenceMenu, onDismissRequest = { cadenceMenu = false }) {
                                listOf("weekly" to "Weekly", "monthly" to "Monthly", "yearly" to "Yearly").forEach { (value, label) ->
                                    DropdownMenuItem(text = { Text(t(label), fontSize = 13.sp) },
                                        onClick = { cadenceMenu = false; onMarkRecurring("", value) })
                                }
                            }
                        }
                        if (vendors.isNotEmpty()) {
                            Box {
                                AssistChip(onClick = { vendorMenu = true }, label = { Text(t("Same payee as"), fontSize = 12.sp) })
                                DropdownMenu(expanded = vendorMenu, onDismissRequest = { vendorMenu = false }) {
                                    vendors.forEach { item ->
                                        DropdownMenuItem(text = { Text(item.name.ifBlank { item.keys.first() }, fontSize = 13.sp) },
                                            onClick = {
                                                vendorMenu = false
                                                onMarkRecurring(item.id, when (item.cadence) {
                                                    BankCadence.Weekly -> "weekly"
                                                    BankCadence.Yearly -> "yearly"
                                                    else -> "monthly"
                                                })
                                            })
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("⇄ ${t("Activity & sync")}", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
            when (tx.pandleStatus) {
                "confirmed" -> {
                    Text("✓ ${t("Confirmed in Pandle")}", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = GREEN)
                    if (tx.pandleBankTransactionId.isNotBlank()) {
                        Text("${t("Pandle transaction ID")}: ${tx.pandleBankTransactionId}", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                "error" -> {
                    Text("! ${t("Sync error")}", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = RED)
                    if (tx.pandleLastError.isNotBlank()) {
                        Text(tx.pandleLastError, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text(t("Nothing was lost — fix the issue and sync again."), fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                "matched" -> Text(t("Matched to an existing Pandle transaction"), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = BLUE)
                else -> Text(t("Not synced to Pandle yet"), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (isOwner) {
            Button(onClick = { onSave(category, vat, note, orderId, review, false, "") }, enabled = busy != "drawer", modifier = Modifier.fillMaxWidth()) {
                Text(if (busy == "drawer") t("Saving…") else t("Save"), fontSize = 14.sp)
            }
        }
    }
}
