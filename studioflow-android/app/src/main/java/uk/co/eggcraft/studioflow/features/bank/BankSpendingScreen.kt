package uk.co.eggcraft.studioflow.features.bank

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import uk.co.eggcraft.studioflow.data.model.StudioBankConnection
import uk.co.eggcraft.studioflow.data.model.StudioBankTransaction
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

// Bank Spending — read-only mirror of the web bank feed (owner-only).
// Connecting a bank, categorising and receipts stay on the web app.

private enum class BankPeriodView { Month, Year }

private val CATEGORY_PALETTE = listOf(
    Color(0xFF2563EB), Color(0xFF0E7A55), Color(0xFFB45309), Color(0xFF7C3AED), Color(0xFFBE185D), Color(0xFF0F766E),
    Color(0xFFB91C1C), Color(0xFF4D7C0F), Color(0xFFA21CAF), Color(0xFF1D4ED8), Color(0xFF92400E), Color(0xFF6B7280)
)
private val UNCATEGORISED_COLOR = Color(0xFF5B6EE8)
private const val UNCATEGORISED_KEY = "__uncategorized__"

private fun categoryColor(name: String): Color {
    var hash = 0L
    for (ch in name) hash = (hash * 31 + ch.code) and 0xFFFFFFFFL
    return CATEGORY_PALETTE[(hash % CATEGORY_PALETTE.size).toInt()]
}

private data class TxTypeMeta(val label: String, val color: Color, val translate: Boolean)

private fun txTypeMeta(type: String): TxTypeMeta? = when (type) {
    "PURCHASE", "POS" -> TxTypeMeta("Card", Color(0xFF2563EB), true)
    "DIRECT_DEBIT" -> TxTypeMeta("DD", Color(0xFF7C3AED), false)
    "STANDING_ORDER" -> TxTypeMeta("SO", Color(0xFF0E7A55), false)
    "TRANSFER" -> TxTypeMeta("Transfer", Color(0xFF0F766E), true)
    "BILL_PAYMENT" -> TxTypeMeta("Bill", Color(0xFFB45309), true)
    "ATM" -> TxTypeMeta("ATM", Color(0xFFBE185D), false)
    "CASH" -> TxTypeMeta("Cash", Color(0xFFBE185D), true)
    "FEE_CHARGE" -> TxTypeMeta("Fee", Color(0xFFB91C1C), true)
    "INTEREST" -> TxTypeMeta("Interest", Color(0xFF16A34A), true)
    "CREDIT" -> TxTypeMeta("Incoming", Color(0xFF16A34A), true)
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

private fun displayDate(iso: String, locale: Locale): String {
    return try {
        val date = SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(iso) ?: return iso
        SimpleDateFormat("d MMM yyyy", locale).format(date)
    } catch (_: Exception) { iso }
}

@Composable
fun BankSpendingScreen(state: StudioFlowUiState) {
    val lang = LocalStudioLanguage.current
    val t: (String) -> String = { studioT(it, lang) }
    val locale = studioLocale(lang)
    val hideNumbers = LocalHideSensitiveNumbers.current
    val decimalSeparator = state.workspaceSettings.selectedDecimalSeparator
    val compact = LocalConfiguration.current.screenWidthDp < 700

    val now = remember { Calendar.getInstance() }
    var view by rememberSaveable { mutableStateOf(BankPeriodView.Month) }
    var selectedYear by rememberSaveable { mutableIntStateOf(now.get(Calendar.YEAR)) }
    var selectedMonth by rememberSaveable { mutableIntStateOf(now.get(Calendar.MONTH) + 1) }
    var page by rememberSaveable { mutableIntStateOf(1) }
    var pageSize by rememberSaveable { mutableIntStateOf(10) }
    var showAllCategories by rememberSaveable { mutableStateOf(false) }

    val transactions = state.bankTransactions
    val connections = state.bankConnections
    val linked = connections.filter { it.isLinked }
    val isOwner = state.workspace?.canViewBankFeed == true
    val currencyCode = transactions.firstOrNull()?.currency ?: "GBP"
    val fmt: (Double, String?) -> String = { value, code -> money(value, code ?: currencyCode, decimalSeparator, hideNumbers) }

    val periodTransactions = transactions.filter { tx ->
        tx.year == selectedYear && (view == BankPeriodView.Year || tx.month == selectedMonth)
    }
    val spentTotal = periodTransactions.filter { it.amount < 0 }.sumOf { abs(it.amount) }
    val incomingTotal = periodTransactions.filter { it.amount > 0 }.sumOf { it.amount }
    val previousSpent = run {
        var y = selectedYear; var m = selectedMonth
        if (view == BankPeriodView.Year) y -= 1 else if (m == 1) { m = 12; y -= 1 } else m -= 1
        transactions.filter { it.amount < 0 && it.year == y && (view == BankPeriodView.Year || it.month == m) }.sumOf { abs(it.amount) }
    }
    val delta = if (previousSpent > 0) (spentTotal - previousSpent) / previousSpent * 100 else null
    val categoryRows = periodTransactions.filter { it.amount < 0 }
        .groupBy { it.effectiveCategory.ifBlank { UNCATEGORISED_KEY } }
        .map { (name, rows) -> Triple(name, rows.sumOf { abs(it.amount) }, 0.0) }
        .map { (name, amount, _) -> Triple(name, amount, amount / maxOf(spentTotal, 0.01) * 100) }
        .sortedByDescending { it.second }
    val pageCount = maxOf(1, ceil(periodTransactions.size / pageSize.toDouble()).toInt())
    val safePage = page.coerceIn(1, pageCount)
    val paged = periodTransactions.drop((safePage - 1) * pageSize).take(pageSize)

    val isCurrentPeriod = run {
        val y = now.get(Calendar.YEAR); val m = now.get(Calendar.MONTH) + 1
        if (view == BankPeriodView.Year) selectedYear >= y else selectedYear > y || (selectedYear == y && selectedMonth >= m)
    }
    val periodLabel = if (view == BankPeriodView.Year) selectedYear.toString() else {
        val cal = Calendar.getInstance().apply { set(selectedYear, selectedMonth - 1, 1) }
        SimpleDateFormat("LLLL yyyy", locale).format(cal.time).replaceFirstChar { it.uppercase(locale) }
    }
    fun stepPeriod(deltaStep: Int) {
        if (view == BankPeriodView.Year) selectedYear += deltaStep else {
            var m = selectedMonth + deltaStep
            if (m < 1) { m = 12; selectedYear -= 1 } else if (m > 12) { m = 1; selectedYear += 1 }
            selectedMonth = m
        }
        page = 1
    }

    LazyColumn(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(if (compact) 14.dp else 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Surface(shape = RoundedCornerShape(12.dp), tonalElevation = 1.dp) {
                    Box(Modifier.size(42.dp), contentAlignment = Alignment.Center) {
                        Icon(Icons.Filled.AccountBalance, contentDescription = null)
                    }
                }
                Column {
                    Text(t("Bank Spending"), fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
                    Text(t("Read-only Open Banking feed — NivaDesk can never move money."), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (!isOwner) {
            item { Text(t("Bank connections are managed by the workspace owner."), fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            return@LazyColumn
        }
        if (connections.isNotEmpty()) {
            item {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    connections.forEach { connection -> ConnectionPill(connection, t, locale) }
                }
            }
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(selected = view == BankPeriodView.Month, onClick = { view = BankPeriodView.Month; page = 1 }, label = { Text(t("Monthly")) })
                FilterChip(selected = view == BankPeriodView.Year, onClick = { view = BankPeriodView.Year; page = 1 }, label = { Text(t("Yearly")) })
                Spacer(Modifier.weight(1f))
                IconButton(onClick = { stepPeriod(-1) }) { Icon(Icons.Filled.ChevronLeft, contentDescription = t("Previous period")) }
                Text(periodLabel, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                IconButton(onClick = { stepPeriod(1) }, enabled = !isCurrentPeriod) { Icon(Icons.Filled.ChevronRight, contentDescription = t("Next period")) }
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
            val tiles = listOf(
                StatTileSpec("${t("Total spent")} — $periodLabel", fmt(spentTotal, null),
                    delta?.let { "${if (it <= 0) "↓" else "↑"}${String.format(Locale.UK, "%.0f", abs(it))}% ${t(if (view == BankPeriodView.Year) "vs last year" else "vs last month")}" },
                    if ((delta ?: 0.0) <= 0) Color(0xFF16A34A) else Color(0xFFDC2626), Color(0xFFDC2626)),
                StatTileSpec("${t("Incoming")} — $periodLabel", "+" + fmt(incomingTotal, null), t("Total inflow this period"), null, Color(0xFF16A34A)),
                StatTileSpec(t("Transactions"), periodTransactions.size.toString(), "${periodTransactions.count { it.hasReceipt }} ${t("with receipt")}", null, Color(0xFF2563EB)),
                StatTileSpec(t("Connected accounts"), linked.sumOf { it.accountCount }.toString(),
                    linked.firstOrNull()?.lastSyncedAtMillis?.let { "${t("Last sync")} ${SimpleDateFormat("d MMM HH:mm", locale).format(Date(it))}" }, null, Color(0xFF7C3AED))
            )
            if (compact) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    tiles.chunked(2).forEach { pair ->
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { pair.forEach { StatTile(it, Modifier.weight(1f)) } }
                    }
                }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) { tiles.forEach { StatTile(it, Modifier.weight(1f)) } }
            }
        }
        item {
            Surface(shape = RoundedCornerShape(14.dp), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("$periodLabel ${t("spending mix")}", fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
                    if (categoryRows.isEmpty()) Text(t("No spending in this period."), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    (if (showAllCategories) categoryRows else categoryRows.take(5)).forEach { (name, amount, share) ->
                        val isUn = name == UNCATEGORISED_KEY
                        CategoryRow(if (isUn) t("Uncategorised") else t(name), if (isUn) UNCATEGORISED_COLOR else categoryColor(name), fmt(amount, null), share)
                    }
                    if (categoryRows.size > 5) {
                        TextButton(onClick = { showAllCategories = !showAllCategories }, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                            Text(if (showAllCategories) "${t("Show less")} ←" else "${t("View category breakdown")} →", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
        item {
            Surface(shape = RoundedCornerShape(14.dp), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                Column {
                    Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(t("Recent transactions"), fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
                        Spacer(Modifier.weight(1f))
                        Text("${periodTransactions.size} ${t("transactions")}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    HorizontalDivider()
                    if (paged.isEmpty()) {
                        Text(t("No transactions in this period."), Modifier.padding(20.dp), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    paged.forEach { tx ->
                        TransactionRow(tx, t, compact, fmt(abs(tx.amount), tx.currency), displayDate(tx.bookingDate, locale))
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                    }
                    Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("${t("Showing")} ${paged.size} / ${periodTransactions.size}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
    }
}

private data class StatTileSpec(val title: String, val value: String, val detail: String?, val detailColor: Color?, val tint: Color)

@Composable
private fun StatTile(spec: StatTileSpec, modifier: Modifier) {
    Surface(modifier = modifier, shape = RoundedCornerShape(14.dp), tonalElevation = 1.dp) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(spec.title, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(spec.value, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (!spec.detail.isNullOrBlank()) {
                    Text(spec.detail, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = spec.detailColor ?: MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Box(Modifier.size(30.dp).background(spec.tint.copy(alpha = 0.12f), CircleShape))
        }
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
private fun ConnectionPill(connection: StudioBankConnection, t: (String) -> String, locale: Locale) {
    Surface(shape = RoundedCornerShape(14.dp), tonalElevation = 1.dp) {
        Row(Modifier.padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (connection.providerLogo.isNotBlank()) {
                AsyncImage(model = connection.providerLogo, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.size(30.dp))
            } else {
                Icon(Icons.Filled.AccountBalance, contentDescription = null, modifier = Modifier.size(26.dp))
            }
            Column {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(connection.providerName.ifBlank { t("Bank") }.uppercase(), fontWeight = FontWeight.ExtraBold, fontSize = 13.sp)
                    Box(Modifier.size(6.dp).background(if (connection.isLinked) Color(0xFF16A34A) else Color(0xFFF59E0B), CircleShape))
                    Text(if (connection.isLinked) t("Connected") else t("Waiting for bank consent…"), fontSize = 11.sp, fontWeight = FontWeight.Bold,
                        color = if (connection.isLinked) Color(0xFF16A34A) else Color(0xFFB45309))
                }
                connection.lastSyncedAtMillis?.let {
                    Text("${t("Last sync")} ${SimpleDateFormat("d MMM yyyy HH:mm", locale).format(Date(it))}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun TransactionRow(tx: StudioBankTransaction, t: (String) -> String, compact: Boolean, amountText: String, dateText: String) {
    val merchant = tx.merchant
    val initials = merchant.split(" ").filter { it.isNotBlank() }.take(2).mapNotNull { it.firstOrNull()?.uppercaseChar() }.joinToString("").ifBlank { "•" }
    val category = tx.effectiveCategory
    val catColor = if (category.isBlank()) MaterialTheme.colorScheme.onSurfaceVariant else categoryColor(category)
    Row(Modifier.padding(horizontal = 14.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(30.dp).background(categoryColor(merchant).copy(alpha = 0.15f), CircleShape), contentAlignment = Alignment.Center) {
            Text(initials, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(merchant.ifBlank { "—" }, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (tx.hasReceipt) Icon(Icons.Filled.AttachFile, contentDescription = null, modifier = Modifier.size(12.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                if (tx.linkedOrderLabel.isNotBlank()) Text("⛓ ${tx.linkedOrderLabel}", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFF2563EB), maxLines = 1)
                if (tx.pandleConfirmed) Text("Pandle ✓", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFF16A34A))
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(dateText, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Box(Modifier.background(catColor.copy(alpha = 0.14f), RoundedCornerShape(999.dp)).padding(horizontal = 7.dp, vertical = 2.dp)) {
                    Text(if (category.isBlank()) t("Uncategorised") else t(category), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = catColor)
                }
                if (compact) TypeBadge(tx.txType, t)
            }
        }
        if (!compact) TypeBadge(tx.txType, t)
        Text(
            (if (tx.amount < 0) "−" else "+") + amountText,
            fontSize = 13.sp, fontWeight = FontWeight.ExtraBold,
            color = if (tx.amount < 0) Color(0xFFDC2626) else Color(0xFF16A34A)
        )
    }
}

@Composable
private fun TypeBadge(type: String, t: (String) -> String) {
    val meta = txTypeMeta(type) ?: return
    Box(Modifier.background(meta.color.copy(alpha = 0.14f), RoundedCornerShape(999.dp)).padding(horizontal = 6.dp, vertical = 2.dp)) {
        Text(if (meta.translate) t(meta.label) else meta.label, fontSize = 9.5.sp, fontWeight = FontWeight.ExtraBold, color = meta.color)
    }
}
