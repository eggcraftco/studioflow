package uk.co.eggcraft.studioflow.features.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uk.co.eggcraft.studioflow.data.model.StudioInventorySummary
import uk.co.eggcraft.studioflow.data.model.StudioOrder
import uk.co.eggcraft.studioflow.features.production.ProductionStage
import uk.co.eggcraft.studioflow.features.production.resolveProductionStage
import uk.co.eggcraft.studioflow.features.production.ProductionStageKind
import uk.co.eggcraft.studioflow.features.shell.StudioFlowUiState
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * The eleven card bodies.
 *
 * A size is not a crop. 1x1 answers one question, 2x1 adds the breakdown that
 * makes the number actionable, and 2x2 adds the list you would otherwise open
 * the full screen to read (§2).
 */
@Composable
fun HomeCardBody(
    id: HomeCardId,
    size: HomeCardSize,
    state: StudioFlowUiState,
    access: HomeAccess,
    inventory: StudioInventorySummary?,
    inventoryFailed: Boolean,
    stages: List<ProductionStage>,
    t: (String) -> String,
    onNewOrder: () -> Unit,
    onOpenSection: (String) -> Unit
) {
    when (id) {
        HomeCardId.GettingStarted -> HomeGettingStartedBody(size, state, inventory, t)
        HomeCardId.QuickActions -> HomeQuickActionsBody(size, access, t, onNewOrder, onOpenSection)
        HomeCardId.RecentActivity -> HomeRecentActivityBody(size, state, t)
        HomeCardId.Money -> HomeMoneyBody(size, state, t)
        HomeCardId.Banking -> HomeBankingBody(size, state, t)
        HomeCardId.Inventory -> HomeInventoryBody(size, state, inventory, inventoryFailed, t)
        HomeCardId.Customers -> HomeCustomersBody(size, state, t)
        HomeCardId.OrdersProduction -> HomeOrdersProductionBody(size, state, stages, t)
        HomeCardId.Schedule -> HomeScheduleBody(size, state, t)
        HomeCardId.Files -> HomeFilesBody(size, state, t)
        HomeCardId.Notes -> HomeNotesBody(size, state, t)
    }
}

// ---------------------------------------------------------------- helpers

private fun money(value: Double, state: StudioFlowUiState): String {
    val symbol = state.workspaceSettings.selectedCurrency.ifEmpty { "£" }
    val decimal = state.workspaceSettings.selectedDecimalSeparator.ifEmpty { "." }
    val formatted = String.format(Locale.UK, "%.2f", value)
    return symbol + if (decimal == ",") formatted.replace(".", ",") else formatted
}

private fun liveOrders(state: StudioFlowUiState): List<StudioOrder> =
    state.orders.filter { !it.isDeleted && !it.isDelivered && it.countsTowardBalance }

private fun relativeLabel(date: Date?, t: (String) -> String): String {
    if (date == null) return ""
    val minutes = ((Date().time - date.time) / 60000L).coerceAtLeast(0L)
    if (minutes < 60) return "${minutes.coerceAtLeast(1)} ${t("min ago")}"
    return SimpleDateFormat("d MMM", Locale.getDefault()).format(date)
}

private fun dueLabel(date: Date, t: (String) -> String): String {
    val today = Calendar.getInstance().apply {
        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }.time
    val days = (date.time - today.time) / (24L * 60L * 60L * 1000L)
    if (days == 0L) return t("Today")
    return SimpleDateFormat("d MMM", Locale.getDefault()).format(date)
}

// ---------------------------------------------------------- Getting started

@Composable
private fun HomeGettingStartedBody(
    size: HomeCardSize,
    state: StudioFlowUiState,
    inventory: StudioInventorySummary?,
    t: (String) -> String
) {
    val inventoryCount = (inventory?.uniqueCount ?: 0) + (inventory?.quantityCount ?: 0)
    val steps = listOf(
        "Set up business profile" to true,
        "Add your first customer" to state.customers.isNotEmpty(),
        "Create your first order" to state.orders.isNotEmpty(),
        "Add an inventory item" to (inventoryCount > 0),
        "Connect your bank" to state.bankTransactions.isNotEmpty(),
        "Upload your first file" to state.orders.any { it.clientFiles.isNotEmpty() }
    )
    val done = steps.count { it.second }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            t("{done} of {total} complete")
                .replace("{done}", done.toString())
                .replace("{total}", steps.size.toString()),
            fontSize = 10.sp, fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        HomeProgress(done.toFloat() / steps.size)
        // Never blocking, never a payment prompt (§15).
        val next = steps.firstOrNull { !it.second }
        if (next != null) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(Color(0x142563EB), RoundedCornerShape(8.dp))
                    .padding(8.dp)
            ) {
                Text(t("Up next").uppercase(), fontSize = 8.sp,
                    fontWeight = FontWeight.ExtraBold, color = Color(0xFF2563EB))
                Text(t(next.first), fontSize = 13.sp, fontWeight = FontWeight.Bold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        } else {
            HomeCardNote(t("All set — nice work."))
        }
        if (size != HomeCardSize.OneByOne) {
            steps.take(if (size == HomeCardSize.TwoByTwo) 6 else 3).forEach { step ->
                Text(
                    (if (step.second) "✓ " else "○ ") + t(step.first),
                    fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    textDecoration = if (step.second) TextDecoration.LineThrough else TextDecoration.None,
                    color = if (step.second) MaterialTheme.colorScheme.onSurfaceVariant
                    else MaterialTheme.colorScheme.onSurface
                )
            }
        }
    }
}

// ------------------------------------------------------------ Quick actions

@Composable
private fun HomeQuickActionsBody(
    size: HomeCardSize,
    access: HomeAccess,
    t: (String) -> String,
    onNewOrder: () -> Unit,
    onOpenSection: (String) -> Unit
) {
    // An action the role cannot perform is hidden and the grid closes up
    // behind it (§6).
    val actions = buildList {
        if (access.orders) add(Triple("New order", "", true))
        if (access.customers) add(Triple("Add customer", "Customers", false))
        if (access.notes) add(Triple("Add note", "Notes", false))
        if (access.files) add(Triple("Upload file", "Files", false))
        if (access.orders) add(Triple("Add inventory item", "Inventory", false))
        if (access.bankFeed) add(Triple("Review spending", "BankSpending", false))
        if (access.bankFeed) add(Triple("Add receipt", "BankSpending", false))
        add(Triple("AI reply", "Messages", false))
    }
    val limit = when (size) {
        HomeCardSize.OneByOne -> 4
        HomeCardSize.TwoByOne -> 6
        HomeCardSize.TwoByTwo -> 8
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        actions.take(limit).chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                pair.forEach { action ->
                    Text(
                        t(action.first),
                        fontSize = 10.sp, fontWeight = FontWeight.Bold,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                        textAlign = TextAlign.Center,
                        color = if (action.third) Color.White else MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier
                            .weight(1f)
                            .background(
                                if (action.third) Color(0xFF2563EB)
                                else MaterialTheme.colorScheme.surfaceVariant,
                                RoundedCornerShape(8.dp)
                            )
                            .clickable {
                                if (action.second.isEmpty()) onNewOrder() else onOpenSection(action.second)
                            }
                            .padding(vertical = 8.dp)
                    )
                }
                if (pair.size == 1) Column(Modifier.weight(1f)) {}
            }
        }
    }
}

// ----------------------------------------------------------- Recent activity

@Composable
private fun HomeRecentActivityBody(size: HomeCardSize, state: StudioFlowUiState, t: (String) -> String) {
    // Only what the signed-in user is a recipient of — activity never widens
    // what someone can see (§12).
    val rows = state.activityNotifications.take(
        when (size) {
            HomeCardSize.OneByOne -> 3
            HomeCardSize.TwoByOne -> 4
            HomeCardSize.TwoByTwo -> 8
        }
    )
    if (rows.isEmpty()) {
        HomeCardNote(t("Nothing here yet."))
    } else {
        Column {
            rows.forEach { item ->
                HomeRow(item.title.ifEmpty { t("Update") }, relativeLabel(item.createdAt, t))
            }
        }
    }
}

// -------------------------------------------------------------------- Money

@Composable
private fun HomeMoneyBody(size: HomeCardSize, state: StudioFlowUiState, t: (String) -> String) {
    // The commercial result, never the bank feed's transaction list (§7).
    val orders = state.orders.filter { !it.isDeleted && it.countsTowardBalance }
    if (orders.isEmpty()) {
        HomeCardNote(t("Nothing here yet."))
        return
    }
    val revenue = orders.sumOf { it.orderValue }
    val received = orders.sumOf { it.paidAmount }
    val outstanding = orders.sumOf { it.remainingAmount + it.customRemainingTotal }
    val profit = orders.sumOf { it.netProfit }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (size == HomeCardSize.OneByOne) {
            Text(money(profit, state), fontSize = 20.sp, fontWeight = FontWeight.ExtraBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(t("Net profit"), fontSize = 9.sp, fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("${t("Outstanding")}: ${money(outstanding, state)}",
                fontSize = 10.sp, fontWeight = FontWeight.Bold,
                color = if (outstanding > 0) Color(0xFFB45309) else MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                HomeStat(t("Revenue"), money(revenue, state))
                HomeStat(t("Payments received"), money(received, state))
                HomeStat(t("Outstanding"), money(outstanding, state),
                    if (outstanding > 0) Color(0xFFB45309) else Color.Unspecified)
                HomeStat(t("Net profit"), money(profit, state),
                    if (profit >= 0) Color(0xFF16A34A) else Color(0xFFDC2626))
            }
            if (size == HomeCardSize.TwoByTwo) {
                HorizontalDivider()
                Text(t("Cost breakdown"), fontSize = 9.sp, fontWeight = FontWeight.ExtraBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                HomeRow(t("Costs"), money(revenue - profit, state))
                HomeRow(t("Platform fees"), money(orders.sumOf { it.paymentFee }, state))
                HomeRow(t("Shipping"), money(orders.sumOf { it.deliveryCost }, state))
            }
        }
    }
}

// ------------------------------------------------------------------ Banking

@Composable
private fun HomeBankingBody(size: HomeCardSize, state: StudioFlowUiState, t: (String) -> String) {
    // How the bank work is going — never a second copy of Money's totals (§7).
    val transactions = state.bankTransactions
    if (transactions.isEmpty()) {
        HomeCardNote(t("Nothing here yet."))
        return
    }
    val toReview = transactions.count { it.category.isBlank() }
    val missingReceipts = transactions.count { !it.hasReceipt && it.amount < 0 }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (size == HomeCardSize.OneByOne) {
            Text("$toReview", fontSize = 24.sp, fontWeight = FontWeight.ExtraBold,
                color = if (toReview > 0) Color(0xFFB45309) else MaterialTheme.colorScheme.onSurface)
            Text(t("to review"), fontSize = 9.sp, fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("$missingReceipts ${t("missing receipts")}", fontSize = 10.sp, fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                HomeStat(t("to review"), "$toReview",
                    if (toReview > 0) Color(0xFFB45309) else Color.Unspecified)
                HomeStat(t("missing receipts"), "$missingReceipts",
                    if (missingReceipts > 0) Color(0xFFB45309) else Color.Unspecified)
                HomeStat(t("Transactions"), "${transactions.size}")
            }
            if (size == HomeCardSize.TwoByTwo) {
                HorizontalDivider()
                transactions.take(4).forEach { transaction ->
                    HomeRow(
                        transaction.counterparty.ifEmpty { transaction.description },
                        money(transaction.amount, state),
                        if (transaction.amount < 0) Color(0xFFDC2626) else Color(0xFF16A34A)
                    )
                }
            }
        }
        Text(t("Read-only bank connection. NivaDesk never moves money."),
            fontSize = 8.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

// ---------------------------------------------------------------- Inventory

@Composable
private fun HomeInventoryBody(
    size: HomeCardSize,
    state: StudioFlowUiState,
    inventory: StudioInventorySummary?,
    inventoryFailed: Boolean,
    t: (String) -> String
) {
    if (inventoryFailed) {
        HomeCardNote(t("This could not be loaded."))
        return
    }
    val summary = inventory ?: run {
        HomeCardNote(t("Loading…"))
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (size == HomeCardSize.OneByOne) {
            Text(money(summary.totalValue, state), fontSize = 20.sp, fontWeight = FontWeight.ExtraBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(t("total value"), fontSize = 9.sp, fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("${summary.lowStockCount} ${t("low stock")}", fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (summary.lowStockCount > 0) Color(0xFFB45309)
                    else MaterialTheme.colorScheme.onSurfaceVariant)
                Text("${summary.incomingCount} ${t("incoming")}", fontSize = 10.sp,
                    fontWeight = FontWeight.Bold, color = Color(0xFF16A34A))
            }
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                HomeStat(t("total value"), money(summary.totalValue, state))
                HomeStat(t("low stock"), "${summary.lowStockCount}",
                    if (summary.lowStockCount > 0) Color(0xFFB45309) else Color.Unspecified)
                HomeStat(t("Reserved"), "${summary.reservedCount}")
                HomeStat(t("incoming"), "${summary.incomingCount}", Color(0xFF16A34A))
            }
            if (size == HomeCardSize.TwoByTwo) {
                HorizontalDivider()
                // Unique and quantity are different things and stay apart (§8).
                HomeRow(t("Unique items"), "${summary.uniqueCount}")
                HomeRow(t("Quantity stock"), "${summary.quantityCount}")
                HomeRow(t("Customer owned"), "${summary.customerOwnedCount}")
                HomeRow(t("Reserved"), money(summary.reservedValue, state))
            }
        }
    }
}

// ---------------------------------------------------------------- Customers

@Composable
private fun HomeCustomersBody(size: HomeCardSize, state: StudioFlowUiState, t: (String) -> String) {
    val customers = state.customers
    if (customers.isEmpty()) {
        HomeCardNote(t("Nothing here yet."))
        return
    }
    val activeNames = liveOrders(state).map { it.customerName.lowercase() }.toSet()
    val owing = state.orders
        .filter { !it.isDeleted && it.countsTowardBalance && (it.remainingAmount + it.customRemainingTotal) > 0 }
        .map { it.customerName.lowercase() }
        .toSet()
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (size == HomeCardSize.OneByOne) {
            Text("${customers.size}", fontSize = 24.sp, fontWeight = FontWeight.ExtraBold)
            Text(t("customers"), fontSize = 9.sp, fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("${activeNames.size} ${t("active orders")}", fontSize = 10.sp,
                fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                HomeStat(t("customers"), "${customers.size}")
                HomeStat(t("active orders"), "${activeNames.size}")
                HomeStat(t("Outstanding"), "${owing.size}",
                    if (owing.isEmpty()) Color.Unspecified else Color(0xFFB45309))
            }
            if (size == HomeCardSize.TwoByTwo) {
                HorizontalDivider()
                customers.take(4).forEach { customer ->
                    HomeRow(
                        customer.name,
                        if (activeNames.contains(customer.name.lowercase())) t("active orders") else "—"
                    )
                }
            }
        }
    }
}

// -------------------------------------------------------- Orders & production

@Composable
private fun HomeOrdersProductionBody(
    size: HomeCardSize,
    state: StudioFlowUiState,
    stages: List<ProductionStage>,
    t: (String) -> String
) {
    val live = liveOrders(state)
    if (live.isEmpty()) {
        HomeCardNote(t("Nothing here yet."))
        return
    }
    // The stage is never stored — it is derived from the order's own steps, by
    // the one rule every screen shares.
    val steps = state.workspaceSettings.customSteps
        .map { it.trim() }
        .filter { it.isNotEmpty() }
        .map { it.lowercase() to it }
        .ifEmpty { listOf("design" to "Design", "painting" to "Painting") }
    val resolved = live.map { it to resolveProductionStage(it, stages, steps) }
    val blockedIds = stages.filter { it.kind == ProductionStageKind.Blocked }.map { it.id }.toSet()
    val blocked = resolved.count { it.second.stageId in blockedIds }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (size == HomeCardSize.OneByOne) {
            Text("${live.size}", fontSize = 24.sp, fontWeight = FontWeight.ExtraBold)
            Text(t("active orders"), fontSize = 9.sp, fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("$blocked ${t("Blocked")}", fontSize = 10.sp, fontWeight = FontWeight.Bold,
                color = if (blocked > 0) Color(0xFFDC2626) else MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            // The stage distribution is the card — the KPI row above it must not
            // repeat the same numbers (§9).
            stages.take(if (size == HomeCardSize.TwoByTwo) 6 else 3).forEach { stage ->
                val count = resolved.count { it.second.stageId == stage.id }
                HomeRow(stage.title, "$count",
                    if (stage.kind == ProductionStageKind.Blocked && count > 0) Color(0xFFDC2626)
                    else Color.Unspecified)
            }
            if (size == HomeCardSize.TwoByTwo) {
                HorizontalDivider()
                Text(t("At risk"), fontSize = 9.sp, fontWeight = FontWeight.ExtraBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                val late = resolved.filter {
                    homeDueDate(it.first.paymentDate, it.first.deliveryTime).before(Date())
                }.take(3)
                if (late.isEmpty()) {
                    HomeCardNote(t("All set — nice work."))
                } else {
                    late.forEach { HomeRow(it.first.customerName, it.second.currentStep, Color(0xFFDC2626)) }
                }
            }
        }
    }
}

// ----------------------------------------------------------------- Schedule

@Composable
private fun HomeScheduleBody(size: HomeCardSize, state: StudioFlowUiState, t: (String) -> String) {
    // Dates and deadlines only — never a second copy of production status (§10).
    val upcoming = liveOrders(state)
        .map { it to homeDueDate(it.paymentDate, it.deliveryTime) }
        .sortedBy { it.second }
    if (upcoming.isEmpty()) {
        HomeCardNote(t("Nothing here yet."))
        return
    }
    val limit = when (size) {
        HomeCardSize.OneByOne -> 3
        HomeCardSize.TwoByOne -> 4
        HomeCardSize.TwoByTwo -> 7
    }
    Column {
        upcoming.take(limit).forEach { entry ->
            HomeRow(
                entry.first.customerName,
                dueLabel(entry.second, t),
                if (entry.second.before(Date())) Color(0xFFDC2626) else Color.Unspecified
            )
        }
    }
}

// -------------------------------------------------------------------- Files

@Composable
private fun HomeFilesBody(size: HomeCardSize, state: StudioFlowUiState, t: (String) -> String) {
    // One file, linked to as many records as it belongs to — the card counts
    // files, not copies (§14).
    val files = state.orders
        .filter { !it.isDeleted }
        .flatMap { order -> order.clientFiles.map { order to it } }
    if (files.isEmpty()) {
        HomeCardNote(t("Nothing here yet."))
        return
    }
    if (size == HomeCardSize.OneByOne) {
        Column {
            Text("${files.size}", fontSize = 24.sp, fontWeight = FontWeight.ExtraBold)
            Text(t("Files"), fontSize = 9.sp, fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    } else {
        Column {
            files.take(if (size == HomeCardSize.TwoByTwo) 7 else 4).forEach { entry ->
                HomeRow(entry.second.fileName, entry.first.customerName)
            }
        }
    }
}

// -------------------------------------------------------------------- Notes

@Composable
private fun HomeNotesBody(size: HomeCardSize, state: StudioFlowUiState, t: (String) -> String) {
    // Notes only. Not files, not AI replies (§13). Pinned first.
    val notes = state.keepNotes
        .filter { !it.isDeleted && !it.isArchived }
        .sortedWith(compareByDescending<uk.co.eggcraft.studioflow.data.model.StudioKeepNote> { it.isPinned }
            .thenByDescending { it.updatedAt?.time ?: 0L })
    if (notes.isEmpty()) {
        HomeCardNote(t("Nothing here yet."))
        return
    }
    val limit = when (size) {
        HomeCardSize.OneByOne -> 3
        HomeCardSize.TwoByOne -> 4
        HomeCardSize.TwoByTwo -> 7
    }
    Column {
        notes.take(limit).forEach { note ->
            HomeRow(
                note.title.ifEmpty { note.text.take(40) },
                if (note.isPinned) "📌" else note.linkedOrderLabel
            )
        }
    }
}
