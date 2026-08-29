package uk.co.eggcraft.studioflow.features.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Note
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Calculate
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Percent
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.DocumentScanner
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.PersonAddAlt
import androidx.compose.material.icons.filled.AddShoppingCart
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uk.co.eggcraft.studioflow.data.model.bankDetectRecurring
import uk.co.eggcraft.studioflow.data.model.StudioInventorySummary
import uk.co.eggcraft.studioflow.data.model.StudioKeepNote
import uk.co.eggcraft.studioflow.data.model.StudioOrder
import uk.co.eggcraft.studioflow.features.production.ProductionStage
import uk.co.eggcraft.studioflow.features.production.ProductionStageKind
import uk.co.eggcraft.studioflow.features.production.resolveProductionStage
import uk.co.eggcraft.studioflow.features.shell.StudioFlowUiState
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * The eleven card bodies, drawn from the reference sheet.
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
    /** Phone layout: the wide cards stack their figures instead of lining them up. */
    compact: Boolean = false,
    t: (String) -> String,
    onNewOrder: () -> Unit,
    onOpenSection: (String) -> Unit
) {
    when (id) {
        HomeCardId.GettingStarted -> HomeGettingStartedBody(size, state, inventory, t)
        HomeCardId.QuickActions -> HomeQuickActionsBody(size, access, t, onNewOrder, onOpenSection)
        HomeCardId.RecentActivity -> HomeRecentActivityBody(size, state, t)
        HomeCardId.Money -> HomeMoneyBody(size, state, compact, t)
        HomeCardId.Banking -> HomeBankingBody(size, state, compact, t)
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

fun homeDueDate(paymentDate: Date, deliveryTime: Int): Date =
    Date(paymentDate.time + deliveryTime.coerceAtLeast(0) * 24L * 60L * 60L * 1000L)

private fun startOfToday(): Date = Calendar.getInstance().apply {
    set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
    set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
}.time

private fun dayLabel(date: Date, t: (String) -> String): String {
    val days = (date.time - startOfToday().time) / 86_400_000L
    return when {
        days == 0L -> t("Today")
        days == 1L -> t("Tomorrow")
        days < 0L -> t("Overdue")
        else -> SimpleDateFormat("d MMM", Locale.getDefault()).format(date)
    }
}

private fun relative(date: Date?, t: (String) -> String): String {
    if (date == null) return ""
    val minutes = ((Date().time - date.time) / 60_000L).coerceAtLeast(1L)
    if (minutes < 60) return "$minutes ${t("min ago")}"
    if (date >= startOfToday()) return "${minutes / 60}h"
    return SimpleDateFormat("d MMM", Locale.getDefault()).format(date)
}

// ------------------------------------------------------------ Getting started

private data class SetupStep(
    val id: String, val label: String, val blurb: String,
    val destination: String, val cta: String, val done: Boolean
)

@Composable
private fun HomeGettingStartedBody(
    size: HomeCardSize,
    state: StudioFlowUiState,
    inventory: StudioInventorySummary?,
    t: (String) -> String
) {
    val inventoryCount = (inventory?.uniqueCount ?: 0) + (inventory?.quantityCount ?: 0)
    val fromStore = state.orders.any {
        !it.customFields["Shopify Status"].isNullOrBlank() || !it.customFields["WooCommerce Status"].isNullOrBlank()
    }
    val steps = listOf(
        SetupStep("profile", "Set up business profile", "Name, currency and tax so every document reads right.", "Settings", "Open settings", true),
        SetupStep("customer", "Add your first customer", "Orders, notes and files all hang off a customer.", "Customers", "Add customer", state.customers.isNotEmpty()),
        SetupStep("order", "Create your first order", "The record everything else in NivaDesk attaches to.", "Orders", "Create order", state.orders.isNotEmpty()),
        SetupStep("shop", "Connect your shop", "Bring Shopify or WooCommerce orders in automatically.", "Settings", "Connect shop", fromStore),
        SetupStep("inventory", "Add an inventory item", "Track what you own, what is reserved and what is low.", "Inventory", "Add item", inventoryCount > 0),
        SetupStep("bank", "Connect your bank", "Read-only. Spending arrives and you categorise it.", "BankSpending", "Connect bank", state.bankTransactions.isNotEmpty())
    )
    val done = steps.filter { it.done }
    val next = steps.firstOrNull { !it.done }
    val todo = steps.filter { !it.done && it.id != next?.id }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // The count belongs at every size: the bar alone says "some", and the
        // sheet always pairs it with how many of how many.
        Text(
            t("{done} of {total} complete")
                .replace("{done}", done.size.toString())
                .replace("{total}", steps.size.toString()),
            fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        HomeProgressBar(done.size.toFloat() / steps.size)

        when (size) {
            HomeCardSize.OneByOne -> {
                if (next != null) {
                    HomeEyebrow(t("Next step"), strong = false)
                    HomeNextPanel(next, t, "compact")
                } else Text(t("All set — nice work."), fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                // One remaining item at 1x1: the panel above it is the point, and a
                // second row pushed the footer link out of the card.
                todo.take(1).forEach { HomeCheckRow(t(it.label), "todo") }
            }
            HomeCardSize.TwoByOne -> Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Column(Modifier.weight(1f)) {
                    HomeEyebrow(t("Completed"))
                    done.take(3).forEach { HomeCheckRow(t(it.label), "done") }
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (next != null) HomeNextPanel(next, t, "inline")
                    todo.take(2).forEach { HomeCheckRow(t(it.label), "todo") }
                }
            }
            HomeCardSize.TwoByTwo -> {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.weight(1f)) {
                        HomePanel {
                            HomeEyebrow(t("Your checklist"))
                            steps.forEach {
                                HomeCheckRow(t(it.label),
                                    if (it.done) "done" else if (it.id == next?.id) "current" else "todo")
                            }
                        }
                    }
                    Box(Modifier.weight(1f)) {
                        if (next != null) HomeNextPanel(next, t, "large")
                        else HomePanel { Text(t("All set — nice work."), fontSize = 12.sp) }
                    }
                }
                Row(
                    Modifier
                        .fillMaxWidth()
                        .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f), RoundedCornerShape(12.dp))
                        .padding(horizontal = 11.dp, vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Box(Modifier.size(30.dp).background(HomeTone.accent.copy(alpha = 0.10f), CircleShape),
                        contentAlignment = Alignment.Center) {
                        Icon(Icons.Filled.Lightbulb, null, Modifier.size(16.dp), HomeTone.accent)
                    }
                    Column {
                        Text(t("Your setup adapts to you"), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        Text(t("Steps change with your plan, permissions and workflow."),
                            fontSize = 10.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

/** The recommendation — blue enough to be the obvious next thing, calm enough
 *  that it is not a payment prompt (§15). */
@Composable
private fun HomeNextPanel(step: SetupStep, t: (String) -> String, style: String) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(HomeTone.accent.copy(alpha = 0.07f), RoundedCornerShape(12.dp))
            .padding(horizontal = 11.dp, vertical = 9.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        if (style == "large") Text(t("Recommended next"), fontSize = 11.sp,
            fontWeight = FontWeight.Bold, color = HomeTone.accent)
        if (style == "inline") Text(t("Up next"), fontSize = 11.sp,
            fontWeight = FontWeight.Bold, color = HomeTone.accent)
        Text(t(step.label), fontSize = 13.5.sp, fontWeight = FontWeight.ExtraBold,
            maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(t(step.blurb), fontSize = 11.sp, maxLines = 2, overflow = TextOverflow.Ellipsis,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            t(if (style == "inline") "Continue" else step.cta),
            fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White,
            modifier = Modifier
                .then(if (style == "large") Modifier.fillMaxWidth() else Modifier)
                .background(HomeTone.accent, RoundedCornerShape(9.dp))
                .padding(horizontal = 16.dp, vertical = 8.dp)
        )
    }
}

// ------------------------------------------------------------- Quick actions

private data class QuickAction(
    val label: String, val destination: String, val icon: ImageVector,
    val tone: Color, val group: String, val primary: Boolean = false
)

@Composable
private fun HomeQuickActionsBody(
    size: HomeCardSize,
    access: HomeAccess,
    t: (String) -> String,
    onNewOrder: () -> Unit,
    onOpenSection: (String) -> Unit
) {
    // An action the role cannot perform is hidden and the grid closes up behind
    // it (§6).
    val actions = buildList {
        if (access.orders) add(QuickAction("New order", "", Icons.Filled.AddShoppingCart, HomeTone.accent, "Create", true))
        if (access.customers) add(QuickAction("Add customer", "Customers", Icons.Filled.PersonAddAlt, HomeTone.teal, "Create"))
        if (access.notes) add(QuickAction("Add note", "Notes", Icons.AutoMirrored.Filled.Note, HomeTone.amber, "Create"))
        if (access.files) add(QuickAction("Upload file", "Files", Icons.Filled.UploadFile, HomeTone.purple, "Capture"))
        if (access.orders) add(QuickAction("Add inventory item", "Inventory", Icons.Filled.Inventory2, HomeTone.purple, "Create"))
        if (access.bankFeed) add(QuickAction("Scan receipt", "BankSpending", Icons.Filled.DocumentScanner, HomeTone.orange, "Capture"))
        // NivaDesk has no manual expense form: spending arrives from the read-only
        // bank feed and becomes an expense when it is categorised. Until one
        // exists this lands on the review queue, where that actually happens.
        if (access.bankFeed) add(QuickAction("Add expense", "BankSpending", Icons.Filled.CreditCard, HomeTone.accent, "Finance & communication"))
        add(QuickAction("Generate AI reply", "Messages", Icons.Filled.AutoAwesome, HomeTone.green, "Finance & communication"))
    }
    val fire: (QuickAction) -> Unit = { if (it.destination.isEmpty()) onNewOrder() else onOpenSection(it.destination) }

    when (size) {
        HomeCardSize.OneByOne -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            actions.take(4).chunked(2).forEach { pair ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    pair.forEach { ActionTile(it, t, Modifier.weight(1f)) { fire(it) } }
                    if (pair.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
        HomeCardSize.TwoByOne -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            actions.take(6).chunked(2).forEach { pair ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    pair.forEach { ActionRow(it, t, Modifier.weight(1f)) { fire(it) } }
                    if (pair.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
        HomeCardSize.TwoByTwo -> Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
            listOf("Create", "Capture", "Finance & communication").forEach { group ->
                val rows = actions.filter { it.group == group }
                if (rows.isNotEmpty()) {
                    HomeEyebrow(t(group))
                    rows.chunked(2).forEach { pair ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            pair.forEach { ActionRow(it, t, Modifier.weight(1f)) { fire(it) } }
                            if (pair.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(Icons.Filled.Info, null, Modifier.size(12.dp), MaterialTheme.colorScheme.onSurfaceVariant)
                Text(t("Actions follow your permissions"), fontSize = 10.5.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun ActionTile(action: QuickAction, t: (String) -> String, modifier: Modifier, tap: () -> Unit) {
    Column(
        modifier
            .background(
                if (action.primary) HomeTone.accent else action.tone.copy(alpha = 0.11f),
                RoundedCornerShape(12.dp)
            )
            .clickable { tap() }
            .padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(7.dp)
    ) {
        Icon(action.icon, null, Modifier.size(25.dp), if (action.primary) Color.White else action.tone)
        Text(t(action.label), fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            color = if (action.primary) Color.White else action.tone)
    }
}

@Composable
private fun ActionRow(action: QuickAction, t: (String) -> String, modifier: Modifier, tap: () -> Unit) {
    Row(
        modifier
            .background(if (action.primary) HomeTone.accent else Color.Transparent, RoundedCornerShape(12.dp))
            .border(
                1.dp,
                if (action.primary) Color.Transparent else MaterialTheme.colorScheme.outline.copy(alpha = 0.25f),
                RoundedCornerShape(12.dp)
            )
            .clickable { tap() }
            .padding(horizontal = 10.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(9.dp)
    ) {
        Icon(action.icon, null, Modifier.size(16.dp), if (action.primary) Color.White else action.tone)
        Text(t(action.label), fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            color = if (action.primary) Color.White else MaterialTheme.colorScheme.onSurface)
    }
}

// ----------------------------------------------------------- Recent activity

/** Event type to colour. The title always names the event, so colour only
 *  speeds up scanning — it never carries the meaning on its own (§20). */
private fun activityTone(type: String): Color {
    val key = type.lowercase()
    return when {
        key.contains("payment") -> HomeTone.green
        key.contains("order") -> HomeTone.purple
        key.contains("production") || key.contains("status") -> HomeTone.accent
        key.contains("file") -> HomeTone.amber
        key.contains("inventory") -> HomeTone.orange
        key.contains("customer") -> HomeTone.teal
        key.contains("schedule") -> HomeTone.accent
        else -> HomeTone.slate
    }
}

@Composable
private fun HomeRecentActivityBody(size: HomeCardSize, state: StudioFlowUiState, t: (String) -> String) {
    // Only what the signed-in user is a recipient of — activity never widens
    // what someone can see (§12).
    val limit = when (size) {
        HomeCardSize.OneByOne -> 3; HomeCardSize.TwoByOne -> 5; HomeCardSize.TwoByTwo -> 8
    }
    val rows = state.activityNotifications.take(limit)
    if (rows.isEmpty()) {
        Text(t("Nothing here yet."), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    if (size == HomeCardSize.TwoByTwo) {
        val today = rows.filter { (it.createdAt ?: Date(0)) >= startOfToday() }
        val earlier = rows.filter { (it.createdAt ?: Date(0)) < startOfToday() }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (today.isNotEmpty()) {
                HomeEyebrow(t("Today"))
                today.forEach { ActivityRow(it.type, it.title, it.message, it.senderName, it.createdAt, t, true) }
            }
            if (earlier.isNotEmpty()) {
                HomeEyebrow(t("Earlier"))
                earlier.forEach { ActivityRow(it.type, it.title, it.message, it.senderName, it.createdAt, t, true) }
            }
            Text(t("Only activity you have permission to view is shown"), fontSize = 10.5.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    } else {
        Column { rows.forEach { ActivityRow(it.type, it.title, it.message, it.senderName, it.createdAt, t, false) } }
    }
}

@Composable
private fun ActivityRow(
    type: String, title: String, message: String, actor: String,
    createdAt: Date?, t: (String) -> String, showActor: Boolean
) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Box(Modifier.size(24.dp).background(activityTone(type), CircleShape))
        Column(Modifier.weight(1f)) {
            Text(title.ifEmpty { t("Update") }, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (message.isNotEmpty()) {
                Text(message, fontSize = 10.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (showActor && actor.isNotEmpty()) HomeChip(actor, HomeTone.slate)
        Text(relative(createdAt, t), fontSize = 10.5.sp, maxLines = 1,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

// --------------------------------------------------------------------- Money

@Composable
private fun HomeMoneyBody(size: HomeCardSize, state: StudioFlowUiState, compact: Boolean, t: (String) -> String) {
    // The commercial result, never the bank feed's transaction list (§7).
    val orders = state.orders.filter { !it.isDeleted && it.countsTowardBalance }
    if (orders.isEmpty()) {
        Text(t("Nothing here yet."), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    val revenue = orders.sumOf { it.orderValue }
    val received = orders.sumOf { it.paidAmount }
    val outstanding = orders.sumOf { it.remainingAmount + it.customRemainingTotal }
    val costs = orders.sumOf { it.watchPurchasePrice }
    val fees = orders.sumOf { it.paymentFee }
    val shipping = orders.sumOf { it.deliveryCost }
    val vat = orders.sumOf { it.taxAmount }
    val profit = orders.sumOf { it.netProfit }

    when (size) {
        HomeCardSize.OneByOne -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(t("Net profit"), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(money(profit, state), fontSize = 24.sp, fontWeight = FontWeight.ExtraBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
                color = if (profit >= 0) HomeTone.green else HomeTone.red)
            HomeSplitPair(
                t("Revenue"), money(revenue, state), HomeTone.green,
                t("Outstanding"), money(outstanding, state), HomeTone.accent
            )
        }
        HomeCardSize.TwoByOne -> if (compact) {
            // Four tiles across a phone leaves every label and every figure
            // truncated. The sheet stacks them two by two instead, and ends with
            // what share of revenue survives as profit.
            val margin = if (revenue > 0) (profit / revenue).toFloat().coerceIn(0f, 1f) else 0f
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    BankFigure(t("Revenue"), money(revenue, state), HomeTone.green, Modifier.weight(1f))
                    Box(Modifier.width(1.dp).height(34.dp)
                        .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)))
                    BankFigure(t("Payments received"), money(received, state), HomeTone.green, Modifier.weight(1f))
                }
                Spacer(Modifier.height(9.dp))
                HomeDivider()
                Spacer(Modifier.height(9.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    BankFigure(t("Outstanding"), money(outstanding, state), HomeTone.accent, Modifier.weight(1f))
                    Box(Modifier.width(1.dp).height(34.dp)
                        .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)))
                    BankFigure(t("Net profit"), money(profit, state),
                        if (profit >= 0) HomeTone.green else HomeTone.red, Modifier.weight(1f))
                }
                Spacer(Modifier.weight(1f))
                Row(verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("${(margin * 100).toInt()}%", fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Box(Modifier.weight(1f)) { HomeProgressBar(margin, tint = HomeTone.green) }
                    Text(t("Profit of revenue"), fontSize = 11.sp, maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        } else Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                HomeMetricTile(t("Revenue"), money(revenue, state), HomeTone.green, modifier = Modifier.weight(1f))
                HomeMetricTile(t("Payments received"), money(received, state), HomeTone.green, modifier = Modifier.weight(1f))
                HomeMetricTile(t("Outstanding"), money(outstanding, state), HomeTone.accent, modifier = Modifier.weight(1f))
                HomeMetricTile(t("Net profit"), money(profit, state), if (profit >= 0) HomeTone.green else HomeTone.red, modifier = Modifier.weight(1f))
            }
            HomeDivider()
            Row {
                listOf(
                    Triple(t("Costs"), costs, true),
                    Triple(t("Platform fees"), fees, true),
                    Triple(t("Shipping"), shipping, true)
                ).forEach { (label, value, minus) ->
                    Column(Modifier.weight(1f).padding(end = 8.dp)) {
                        Text((if (minus) "− " else "") + label, fontSize = 10.5.sp, maxLines = 1,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(money(value, state), fontSize = 12.sp, fontWeight = FontWeight.Bold,
                            color = HomeTone.orange, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        HomeCardSize.TwoByTwo -> if (compact) {
            // On a phone the two panels cannot sit side by side — half a phone
            // turns the chart into a spike and truncates every cost. They each
            // take the full width, and the tiles pair up so their figures read.
            // The card is a square, so the content fits the square: the fixed
            // pieces are slim and the chart is the flexible one, absorbing
            // whatever height is left instead of pushing the rest out.
            Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    SlimTile(t("Revenue"), money(revenue, state), HomeTone.green,
                        Icons.AutoMirrored.Filled.TrendingUp, Modifier.weight(1f))
                    SlimTile(t("Received"), money(received, state), HomeTone.green,
                        Icons.Filled.CheckCircle, Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    SlimTile(t("Outstanding"), money(outstanding, state), HomeTone.accent,
                        Icons.Filled.Schedule, Modifier.weight(1f))
                    SlimTile(t("Net profit"), money(profit, state), HomeTone.green,
                        Icons.Filled.PieChart, Modifier.weight(1f))
                }
                Column(
                    Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f), RoundedCornerShape(11.dp))
                        .padding(horizontal = 9.dp, vertical = 6.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    HomeEyebrow(t("Revenue & profit"))
                    RevenueChart(orders, t, compact = true)
                }
                Row(
                    Modifier
                        .fillMaxWidth()
                        .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f), RoundedCornerShape(11.dp))
                        .padding(horizontal = 3.dp, vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    CostCell(HomeTone.orange, Icons.Filled.ShoppingBag, t("Costs"), money(costs, state), Modifier.weight(1f))
                    CostDivider()
                    CostCell(HomeTone.purple, Icons.Filled.Percent, t("Fees"), money(fees, state), Modifier.weight(1f))
                    CostDivider()
                    CostCell(HomeTone.amber, Icons.Filled.Calculate, t("VAT"), money(vat, state), Modifier.weight(1f))
                    CostDivider()
                    CostCell(HomeTone.accent, Icons.Filled.LocalShipping, t("Shipping"), money(shipping, state), Modifier.weight(1f))
                }
            }
        } else {
            val margin = if (revenue > 0) (profit / revenue).toFloat() else 0f
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    HomeMetricTile(t("Revenue"), money(revenue, state), HomeTone.green, modifier = Modifier.weight(1f))
                    HomeMetricTile(t("Payments received"), money(received, state), HomeTone.green, modifier = Modifier.weight(1f))
                    HomeMetricTile(t("Outstanding"), money(outstanding, state), HomeTone.accent, modifier = Modifier.weight(1f))
                    HomeMetricTile(t("Net profit"), money(profit, state), HomeTone.green, modifier = Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.weight(1f)) {
                        HomePanel {
                            HomeEyebrow(t("Revenue & profit"))
                            RevenueChart(orders, t)
                        }
                    }
                    Box(Modifier.weight(1f)) {
                        HomePanel {
                            HomeEyebrow(t("Cost breakdown"))
                            HomeCostRow(HomeTone.orange, t("Costs"), money(costs, state))
                            HomeCostRow(HomeTone.purple, t("Platform fees"), money(fees, state))
                            HomeCostRow(HomeTone.accent, t("Shipping"), money(shipping, state))
                        }
                    }
                }
                Row(
                    Modifier
                        .fillMaxWidth()
                        .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f), RoundedCornerShape(12.dp))
                        .padding(horizontal = 11.dp, vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    HomeEyebrow(t("Margin"))
                    Box(Modifier.weight(1f)) { HomeProgressBar(margin) }
                    Text("${(margin * 100).toInt()}%", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold)
                }
            }
        }
    }
}

/** Revenue and profit over the last twelve weeks, from the orders themselves. */
@Composable
private fun RevenueChart(orders: List<StudioOrder>, t: (String) -> String, compact: Boolean = false) {
    val weeks = 12
    val revenue = DoubleArray(weeks)
    val profit = DoubleArray(weeks)
    val now = Date().time
    orders.forEach { order ->
        val ago = ((now - order.paymentDate.time) / (7L * 24 * 3600 * 1000)).toInt()
        if (ago in 0 until weeks) {
            revenue[weeks - 1 - ago] += order.orderValue
            profit[weeks - 1 - ago] += order.netProfit
        }
    }
    if (revenue.all { it == 0.0 }) {
        Text(t("Not enough history yet."), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ChartKey(HomeTone.accent, t("Revenue"))
            ChartKey(HomeTone.green, t("Net profit"))
        }
        HomeSeriesChart(
            listOf(revenue.toList() to HomeTone.accent, profit.toList() to HomeTone.green),
            fillFirst = true, compact = compact
        )
    }
}

@Composable
private fun ChartKey(colour: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        Box(Modifier.width(14.dp).height(2.5.dp).background(colour, RoundedCornerShape(2.dp)))
        Text(label, fontSize = 10.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

// ------------------------------------------------------------------- Banking

@Composable
private fun HomeBankingBody(size: HomeCardSize, state: StudioFlowUiState, compact: Boolean, t: (String) -> String) {
    // How the bank work is going — never a second copy of Money's totals (§7).
    val transactions = state.bankTransactions
    if (transactions.isEmpty()) {
        Text(t("Nothing here yet."), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    val monthPrefix = SimpleDateFormat("yyyy-MM", Locale.UK).format(Date())
    val thisMonth = transactions.filter { it.bookingDate.startsWith(monthPrefix) }
    val incoming = thisMonth.filter { it.amount > 0 }.sumOf { it.amount }
    val spent = thisMonth.filter { it.amount < 0 }.sumOf { -it.amount }
    val toReview = transactions.count { it.category.isBlank() }
    val missing = transactions.count { it.amount < 0 && !it.hasReceipt }

    if (size == HomeCardSize.OneByOne && compact) {
        // The phone square: what left the account, ruled off above and below, with
        // what came in against the receipts still owed. No sync line here — the
        // header already carries the promise, and a square has no row to spare.
        Column(Modifier.fillMaxSize()) {
            HomeDivider()
            Spacer(Modifier.weight(1f))
            Text(t("Spent this month"), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("−" + money(spent, state), fontSize = 26.sp, fontWeight = FontWeight.ExtraBold,
                color = HomeTone.red, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.weight(1f))
            HomeDivider()
            Row(Modifier.padding(top = 9.dp), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column {
                    Text(t("Incoming"), fontSize = 10.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("+" + money(incoming, state), fontSize = 13.sp,
                        fontWeight = FontWeight.ExtraBold, color = HomeTone.green,
                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (missing > 0) {
                    Box(Modifier.width(1.dp).height(30.dp)
                        .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)))
                    Row(
                        Modifier
                            .background(HomeTone.orange.copy(alpha = 0.14f), RoundedCornerShape(999.dp))
                            .padding(horizontal = 7.dp, vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(5.dp)
                    ) {
                        Icon(Icons.Filled.Warning, null, Modifier.size(11.dp), HomeTone.orange)
                        Text(receiptWarning(missing, t), fontSize = 10.sp,
                            fontWeight = FontWeight.SemiBold, color = HomeTone.orange,
                            maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        return
    }

    if (size == HomeCardSize.OneByOne) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SyncLine(state, t)
            Text(t("Spent this month"), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("−" + money(spent, state), fontSize = 24.sp, fontWeight = FontWeight.ExtraBold,
                color = HomeTone.red, maxLines = 1, overflow = TextOverflow.Ellipsis)
            HomeSplitPair(
                t("Incoming"), "+" + money(incoming, state), HomeTone.green,
                t("missing receipts"), "$missing", if (missing > 0) HomeTone.red else Color.Unspecified
            )
        }
        return
    }

    if (size == HomeCardSize.TwoByOne && compact) {
        // The phone wide card: three figures ruled apart, one recent counterparty
        // across the full width, and the repeat cost against the year to date. No
        // side column — half a phone truncates both.
        val fixed = bankMonthlyFixed(state)
        val (yearIn, yearOut) = yearTotals(state)
        val top = state.bankTransactions.firstOrNull()
        Column(Modifier.fillMaxSize()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                BankFigure(t("Incoming this month"), "+" + money(incoming, state), HomeTone.green, Modifier.weight(1f))
                Box(Modifier.width(1.dp).height(34.dp)
                    .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)))
                BankFigure(t("Spent this month"), "−" + money(spent, state), HomeTone.red, Modifier.weight(1f))
                Box(Modifier.width(1.dp).height(34.dp)
                    .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)))
                BankFigure(t("Missing receipts"), "$missing",
                    if (missing > 0) HomeTone.orange else MaterialTheme.colorScheme.onSurface, Modifier.weight(1f))
            }
            Spacer(Modifier.height(8.dp)); HomeDivider(); Spacer(Modifier.height(8.dp))
            if (top != null) {
                val name = top.counterparty.ifEmpty { top.description }
                Row(verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                    Box(Modifier.size(24.dp).background(HomeTone.accent, CircleShape),
                        contentAlignment = Alignment.Center) {
                        Text(name.take(1).uppercase(), fontSize = 11.sp,
                            fontWeight = FontWeight.ExtraBold, color = Color.White)
                    }
                    Text(name, fontSize = 12.sp, maxLines = 1,
                        overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text((if (top.amount < 0) "−" else "+") + money(kotlin.math.abs(top.amount), state),
                        fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1,
                        color = if (top.amount < 0) HomeTone.red else HomeTone.green)
                }
                Spacer(Modifier.height(8.dp)); HomeDivider(); Spacer(Modifier.height(8.dp))
            }
            Row(verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                if (fixed > 0) {
                    Box(Modifier.size(20.dp).background(HomeTone.accent.copy(alpha = 0.12f), CircleShape),
                        contentAlignment = Alignment.Center) {
                        Text("£", fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, color = HomeTone.accent)
                    }
                    Text(t("Fixed ≈ {amount}/month").replace("{amount}", money(fixed, state)),
                        fontSize = 10.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Spacer(Modifier.weight(1f))
                Text(t("This year"), fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("${t("In")} ${money(yearIn, state)}", fontSize = 10.sp,
                    fontWeight = FontWeight.Bold, color = HomeTone.green, maxLines = 1)
                Text("${t("Out")} ${money(yearOut, state)}", fontSize = 10.sp,
                    fontWeight = FontWeight.Bold, color = HomeTone.red, maxLines = 1)
            }
        }
        return
    }

    if (size == HomeCardSize.TwoByOne) {
        // As the sheet draws it: three figures across the top, then the last few
        // counterparties beside what is paid on repeat.
        val fixed = bankMonthlyFixed(state)
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                BankFigure(t("Incoming this month"), "+" + money(incoming, state), HomeTone.green, Modifier.weight(1f))
                Box(Modifier.width(1.dp).height(32.dp)
                    .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)))
                BankFigure(t("Spent this month"), "−" + money(spent, state), HomeTone.red, Modifier.weight(1f))
                Box(Modifier.width(1.dp).height(32.dp)
                    .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)))
                BankFigure(t("missing receipts"), "$missing",
                    if (missing > 0) HomeTone.orange else MaterialTheme.colorScheme.onSurface, Modifier.weight(1f))
            }
            HomeDivider()
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(Modifier.weight(1.6f)) {
                    HomeEyebrow(t("Recent transactions"))
                    state.bankTransactions.take(3).forEach { tx ->
                        val name = tx.counterparty.ifEmpty { tx.description }
                        Row(Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically) {
                            Text(name, fontSize = 12.sp, maxLines = 1,
                                overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                            Text((if (tx.amount < 0) "−" else "+") + money(kotlin.math.abs(tx.amount), state),
                                fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1,
                                color = if (tx.amount < 0) HomeTone.red else HomeTone.green)
                        }
                    }
                }
                Box(Modifier.width(1.dp).height(70.dp)
                    .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    if (fixed > 0) {
                        Row(verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Box(Modifier.size(22.dp).background(HomeTone.accent.copy(alpha = 0.12f), CircleShape),
                                contentAlignment = Alignment.Center) {
                                Text("£", fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = HomeTone.accent)
                            }
                            Text(t("Fixed ≈ {amount}/month").replace("{amount}", money(fixed, state)),
                                fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    SyncLine(state, t)
                }
            }
        }
        return
    }

    // The fourth tile is what the workspace pays on repeat, as the sheet has it —
    // the review queue is already the card's link.
    val fixedTotal = bankMonthlyFixed(state)
    Column(
        if (compact) Modifier.fillMaxSize() else Modifier,
        verticalArrangement = Arrangement.spacedBy(if (compact) 7.dp else 10.dp)
    ) {
        SyncLine(state, t)
        if (compact) {
            // Four across a phone truncates every label and every figure. Two by
            // two gives each one half the width.
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                SlimTile(t("Incoming this month"), "+" + money(incoming, state), HomeTone.green,
                    Icons.Filled.ArrowDownward, Modifier.weight(1f))
                SlimTile(t("Spent this month"), "−" + money(spent, state), HomeTone.orange,
                    Icons.Filled.ArrowUpward, Modifier.weight(1f))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                SlimTile(t("Missing receipts"), "$missing",
                    if (missing > 0) HomeTone.red else HomeTone.accent,
                    Icons.Filled.ReceiptLong, Modifier.weight(1f))
                SlimTile(t("Fixed"), if (fixedTotal > 0) "≈ " + money(fixedTotal, state) else "—",
                    HomeTone.accent, Icons.Filled.CalendarMonth, Modifier.weight(1f))
            }
        } else Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            HomeMetricTile(t("Incoming this month"), "+" + money(incoming, state), HomeTone.green,
                modifier = Modifier.weight(1f), icon = Icons.Filled.ArrowDownward)
            HomeMetricTile(t("Spent this month"), "−" + money(spent, state), HomeTone.orange,
                modifier = Modifier.weight(1f), icon = Icons.Filled.ArrowUpward)
            HomeMetricTile(t("Missing receipts"), "$missing",
                if (missing > 0) HomeTone.red else HomeTone.accent,
                modifier = Modifier.weight(1f), icon = Icons.Filled.ReceiptLong)
            HomeMetricTile(t("Fixed"), if (fixedTotal > 0) "≈ " + money(fixedTotal, state) else "—",
                HomeTone.accent, modifier = Modifier.weight(1f), icon = Icons.Filled.CalendarMonth)
        }
        if (size == HomeCardSize.TwoByTwo && compact) {
            // The phone square: both panels take the full width and stack, and
            // the chart is the flexible one. Side by side each got half a phone
            // and truncated everything in it.
            val (yIn, yOut) = yearTotals(state)
            Column(
                Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f), RoundedCornerShape(11.dp))
                    .padding(horizontal = 9.dp, vertical = 6.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                HomeEyebrow(t("Bank activity"))
                BankChart(state, t, compact = true)
            }
            Column(
                Modifier
                    .fillMaxWidth()
                    .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f), RoundedCornerShape(11.dp))
                    .padding(horizontal = 9.dp, vertical = 6.dp)
            ) {
                HomeEyebrow(t("Recent transactions"))
                state.bankTransactions.take(2).forEach { tx ->
                    val name = tx.counterparty.ifEmpty { tx.description }
                    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(Modifier.size(20.dp).background(HomeTone.accent, CircleShape),
                            contentAlignment = Alignment.Center) {
                            Text(name.take(1).uppercase(), fontSize = 10.sp,
                                fontWeight = FontWeight.ExtraBold, color = Color.White)
                        }
                        Text(name, fontSize = 11.sp, maxLines = 1,
                            overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        Text((if (tx.amount < 0) "−" else "+") + money(kotlin.math.abs(tx.amount), state),
                            fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1,
                            color = if (tx.amount < 0) HomeTone.red else HomeTone.green)
                    }
                }
                Spacer(Modifier.height(3.dp))
                HomeDivider()
                Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("${t("This year")}:", fontSize = 10.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("${t("In")} ${money(yIn, state)}", fontSize = 10.sp,
                        fontWeight = FontWeight.Bold, color = HomeTone.green, maxLines = 1)
                    Text("·", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("${t("Out")} ${money(yOut, state)}", fontSize = 10.sp,
                        fontWeight = FontWeight.Bold, color = HomeTone.red, maxLines = 1)
                }
            }
        } else if (size == HomeCardSize.TwoByTwo) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.weight(1f)) {
                    HomePanel {
                        HomeEyebrow(t("Bank activity"))
                        BankChart(state, t)
                    }
                }
                Box(Modifier.weight(1f)) {
                    HomePanel {
                        HomeEyebrow(t("Recent transactions"))
                        transactions.take(3).forEach { tx ->
                            val name = tx.counterparty.ifEmpty { tx.description }
                            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                                Box(Modifier.size(22.dp).background(HomeTone.accent.copy(alpha = 0.14f), CircleShape),
                                    contentAlignment = Alignment.Center) {
                                    Text(name.take(1).uppercase(), fontSize = 11.sp,
                                        fontWeight = FontWeight.ExtraBold, color = HomeTone.accent)
                                }
                                Text(name, fontSize = 12.sp, maxLines = 1,
                                    overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                                Text((if (tx.amount < 0) "−" else "+") + money(kotlin.math.abs(tx.amount), state),
                                    fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1,
                                    color = if (tx.amount < 0) HomeTone.orange else HomeTone.green)
                            }
                        }
                    }
                }
            }
            if (missing > 0 && !compact) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .background(HomeTone.orange.copy(alpha = 0.09f), RoundedCornerShape(12.dp))
                        .padding(horizontal = 11.dp, vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Box(Modifier.size(26.dp).background(HomeTone.orange, CircleShape),
                        contentAlignment = Alignment.Center) {
                        Text("!", fontSize = 15.sp, fontWeight = FontWeight.Black, color = Color.White)
                    }
                    Column {
                        Text(t("{count} transactions need a receipt").replace("{count}", "$missing"),
                            fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        Text(t("We couldn't find a receipt for {count} transactions.").replace("{count}", "$missing"),
                            fontSize = 10.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Spacer(Modifier.weight(1f))
                    Text("${t("Go to banking")}  →", fontSize = 12.sp,
                        fontWeight = FontWeight.Bold, color = HomeTone.accent, maxLines = 1)
                }
            }
        } else {
            ReadOnlyNote(t, short = false)
        }
    }
}

/** A tile sized for a square phone card: one line of label over one of figure,
 *  with a small mark beside them. The desktop tile is twice this tall. */
@Composable
private fun SlimTile(label: String, value: String, tone: Color, icon: ImageVector, modifier: Modifier) {
    Row(
        modifier
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f), RoundedCornerShape(11.dp))
            .padding(horizontal = 7.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Box(Modifier.size(20.dp).background(tone.copy(alpha = 0.14f), CircleShape),
            contentAlignment = Alignment.Center) {
            Icon(icon, null, Modifier.size(11.dp), tone)
        }
        Column {
            Text(label, fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = tone,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** One of the four costs across the bottom of the phone 2x2: a filled disc with
 *  its mark, the label above the figure. */
@Composable
private fun CostCell(colour: Color, icon: ImageVector, label: String, value: String, modifier: Modifier) {
    Row(modifier.padding(horizontal = 5.dp), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        Box(Modifier.size(21.dp).background(colour, CircleShape), contentAlignment = Alignment.Center) {
            Icon(icon, null, Modifier.size(11.dp), Color.White)
        }
        Column {
            Text(label, fontSize = 8.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 1,
                overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun CostDivider() {
    Box(Modifier.width(1.dp).height(32.dp)
        .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)))
}

/** One of the three figures across the top of the 2x1 Banking card. */
@Composable
private fun BankFigure(label: String, value: String, tone: Color, modifier: Modifier) {
    Column(modifier.padding(horizontal = 10.dp)) {
        Text(label, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = tone,
            maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** What the workspace pays every month on repeat, by the same rule the Banking
 *  screen uses — detected from the feed plus the owner's own vendors. */
private fun bankMonthlyFixed(state: StudioFlowUiState): Double =
    bankDetectRecurring(state.bankTransactions, state.bankVendors)
        .filter { it.active }
        .sumOf { it.monthlyEquivalent }

/** "1 receipt missing" reads wrong in the plural and the other way round in
 *  every language that inflects, so the two are separate strings. */
private fun receiptWarning(count: Int, t: (String) -> String): String =
    t(if (count == 1) "{count} receipt missing" else "{count} receipts missing")
        .replace("{count}", "$count")

/**
 * How fresh the feed is. The real signal is the connection's own lastSyncedAt —
 * a live snapshot only says the listener fired, not that the bank handed
 * anything over, which is what made "Connected" misleading in the first place.
 */
fun homeSyncLabel(state: StudioFlowUiState, t: (String) -> String): String {
    // The elvis has to bind to the whole expression, so the type is non-null
    // afterwards — declaring it Long? kept the null in play past the return.
    val newest = state.bankConnections.mapNotNull { it.lastSyncedAtMillis }.maxOrNull()
        ?: return t("Never synced")
    val millis = Date().time - newest
    val days = (millis / 86_400_000L).toInt()
    val hours = (millis / 3_600_000L).toInt()
    return when {
        days >= 1 -> t("Last synced {n} days ago").replace("{n}", "$days")
        hours >= 1 -> t("Last synced {n}h ago").replace("{n}", "$hours")
        else -> t("Last synced just now")
    }
}

/** Money in and out since 1 January. */
private fun yearTotals(state: StudioFlowUiState): Pair<Double, Double> {
    val prefix = SimpleDateFormat("yyyy-", Locale.UK).format(Date())
    val rows = state.bankTransactions.filter { it.bookingDate.startsWith(prefix) }
    return rows.filter { it.amount > 0 }.sumOf { it.amount } to
        rows.filter { it.amount < 0 }.sumOf { -it.amount }
}

@Composable
private fun SyncLine(state: StudioFlowUiState, t: (String) -> String) {
    val newest: Long? = state.bankConnections.mapNotNull { it.lastSyncedAtMillis }.maxOrNull()
    val unhealthy = state.bankConnections.any { it.isLinked && it.syncState != "ok" }
    val days = newest?.let { ((Date().time - it) / 86_400_000L).toInt() } ?: 0
    val stale = newest == null || days >= 2 || unhealthy
    val label = homeSyncLabel(state, t)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Icon(
            if (stale) Icons.Filled.Warning else Icons.Filled.Sync,
            contentDescription = null,
            modifier = Modifier.size(13.dp),
            tint = if (stale) HomeTone.orange else MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(label, fontSize = 11.sp,
            color = if (stale) HomeTone.orange else MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** The read-only promise is part of the card, not a footnote: this feed can
 *  never move money and the card should keep saying so (§7). */
@Composable
private fun ReadOnlyNote(t: (String) -> String, short: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        Text(
            t("Read-only"), fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, color = HomeTone.orange,
            modifier = Modifier
                .border(1.dp, HomeTone.orange, RoundedCornerShape(999.dp))
                .padding(horizontal = 8.dp, vertical = 2.dp)
        )
        Text(
            t(if (short) "NivaDesk never moves money." else "Read-only bank connection. NivaDesk never moves money."),
            fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun BankChart(state: StudioFlowUiState, t: (String) -> String, compact: Boolean = false) {
    val weeks = 12
    val incoming = DoubleArray(weeks)
    val spent = DoubleArray(weeks)
    val parser = SimpleDateFormat("yyyy-MM-dd", Locale.UK)
    val now = Date().time
    state.bankTransactions.forEach { tx ->
        val date = runCatching { parser.parse(tx.bookingDate) }.getOrNull() ?: return@forEach
        val ago = ((now - date.time) / (7L * 24 * 3600 * 1000)).toInt()
        if (ago in 0 until weeks) {
            if (tx.amount >= 0) incoming[weeks - 1 - ago] += tx.amount
            else spent[weeks - 1 - ago] += -tx.amount
        }
    }
    if (incoming.all { it == 0.0 } && spent.all { it == 0.0 }) {
        Text(t("Not enough history yet."), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ChartKey(HomeTone.green, t("Incoming"))
            ChartKey(HomeTone.orange, t("Spent"))
        }
        HomeSeriesChart(
            listOf(incoming.toList() to HomeTone.green, spent.toList() to HomeTone.orange),
            fillFirst = true, compact = compact
        )
    }
}

// ----------------------------------------------------------------- Inventory

@Composable
private fun HomeInventoryBody(
    size: HomeCardSize, state: StudioFlowUiState,
    inventory: StudioInventorySummary?, inventoryFailed: Boolean, t: (String) -> String
) {
    if (inventoryFailed) {
        Text(t("This could not be loaded."), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    val summary = inventory ?: run {
        Text(t("Loading…"), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant); return
    }
    if (size == HomeCardSize.OneByOne) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(t("total value"), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(money(summary.totalValue, state), fontSize = 24.sp, fontWeight = FontWeight.ExtraBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
            HomeSplitPair(
                t("low stock"), "${summary.lowStockCount}", if (summary.lowStockCount > 0) HomeTone.orange else Color.Unspecified,
                t("incoming"), "${summary.incomingCount}", HomeTone.green
            )
        }
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            HomeMetricTile(t("total value"), money(summary.totalValue, state), HomeTone.accent, modifier = Modifier.weight(1f))
            HomeMetricTile(t("Unique items"), "${summary.uniqueCount}", HomeTone.accent, money(summary.uniqueValue, state), Modifier.weight(1f))
            HomeMetricTile(t("Quantity stock"), "${summary.quantityCount}", HomeTone.accent, money(summary.quantityValue, state), Modifier.weight(1f))
            HomeMetricTile(t("low stock"), "${summary.lowStockCount}",
                if (summary.lowStockCount > 0) HomeTone.orange else HomeTone.accent, modifier = Modifier.weight(1f))
        }
        if (size == HomeCardSize.TwoByTwo) {
            // Unique and quantity are different things and the split is the point (§8).
            val total = summary.uniqueValue + summary.quantityValue
            val share = if (total > 0) (summary.uniqueValue / total).toFloat() else 0f
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.weight(1f)) {
                    HomePanel {
                        HomeEyebrow(t("Inventory value"))
                        Row(verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            HomeDonut(share)
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                DonutKey(HomeTone.accent, t("Unique items"), money(summary.uniqueValue, state), share)
                                DonutKey(HomeTone.accent.copy(alpha = 0.35f), t("Quantity stock"),
                                    money(summary.quantityValue, state), 1f - share)
                            }
                        }
                    }
                }
                Box(Modifier.weight(1f)) {
                    HomePanel {
                        HomeEyebrow(t("Stock status"))
                        HomeCostRow(HomeTone.orange, t("Reserved"), money(summary.reservedValue, state))
                        HomeCostRow(HomeTone.accent, t("incoming"), money(summary.incomingValue, state))
                        HomeCostRow(HomeTone.red, t("low stock"), "${summary.lowStockCount}")
                    }
                }
            }
        } else {
            HomeCostRow(HomeTone.orange, t("Reserved"), money(summary.reservedValue, state))
            HomeCostRow(HomeTone.accent, t("incoming"), money(summary.incomingValue, state))
        }
    }
}

@Composable
private fun DonutKey(colour: Color, label: String, value: String, percent: Float) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            Box(Modifier.size(9.dp).background(colour, CircleShape))
            Text(label, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Text(value, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        }
        Text(String.format(Locale.UK, "%.1f%%", percent * 100), fontSize = 10.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 16.dp))
    }
}

// ----------------------------------------------------------------- Customers

@Composable
private fun HomeCustomersBody(size: HomeCardSize, state: StudioFlowUiState, t: (String) -> String) {
    val customers = state.customers
    if (customers.isEmpty()) {
        Text(t("Nothing here yet."), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    val activeNames = liveOrders(state).map { it.customerName.lowercase() }.toSet()
    val withActive = customers.count { activeNames.contains(it.name.lowercase()) }
    val orderCounts = state.orders.filter { !it.isDeleted }.groupingBy { it.customerName.lowercase() }.eachCount()
    val returning = customers.count { (orderCounts[it.name.lowercase()] ?: 0) > 1 }
    val monthStart = Calendar.getInstance().apply { set(Calendar.DAY_OF_MONTH, 1) }.time
    val newThisMonth = state.orders
        .filter { !it.isDeleted && it.paymentDate >= monthStart }
        .map { it.customerName.lowercase() }.toSet()
        .count { (orderCounts[it] ?: 0) <= 1 }
    val existing = (customers.size - newThisMonth - returning).coerceAtLeast(0)

    if (size == HomeCardSize.OneByOne) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(t("customers"), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("${customers.size}", fontSize = 26.sp, fontWeight = FontWeight.ExtraBold)
            HomeSplitPair(
                t("active orders"), "$withActive", HomeTone.green,
                t("Latest"), customers.firstOrNull()?.name ?: "—"
            )
        }
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            HomeMetricTile(t("Total customers"), "${customers.size}", HomeTone.accent, modifier = Modifier.weight(1f))
            HomeMetricTile(t("New this month"), "$newThisMonth", HomeTone.green, modifier = Modifier.weight(1f))
            HomeMetricTile(t("Returning customers"), "$returning", HomeTone.purple, modifier = Modifier.weight(1f))
            HomeMetricTile(t("Customers with active orders"), "$withActive", HomeTone.teal, modifier = Modifier.weight(1f))
        }
        HomeMixBar(listOf(
            Triple(t("New this month"), newThisMonth, HomeTone.green),
            Triple(t("Returning"), returning, HomeTone.purple),
            Triple(t("Existing"), existing, HomeTone.teal)
        ))
        if (size == HomeCardSize.TwoByTwo) {
            HomePanel {
                HomeEyebrow(t("Recent customers"))
                customers.take(3).forEach { customer ->
                    val active = activeNames.contains(customer.name.lowercase())
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                        Box(Modifier.size(22.dp).background(HomeTone.accent.copy(alpha = 0.14f), CircleShape),
                            contentAlignment = Alignment.Center) {
                            Text(customer.name.take(1).uppercase(), fontSize = 11.sp,
                                fontWeight = FontWeight.ExtraBold, color = HomeTone.accent)
                        }
                        Text(customer.name, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        HomeChip(if (active) t("Active customer") else t("No open orders"),
                            if (active) HomeTone.green else HomeTone.slate)
                    }
                }
            }
            // §11 and §19: a member sees only the customers their role allows, and
            // the card says so rather than looking like the whole directory.
            Text(t("Only customers you have permission to view are shown"), fontSize = 10.5.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// -------------------------------------------------------- Orders & production

/** A stage's colour follows its kind, not its position — a workspace may define
 *  any number of lanes and an index-keyed palette runs out. */
private fun stageTone(kind: ProductionStageKind): Color = when (kind) {
    ProductionStageKind.Ready -> HomeTone.green
    ProductionStageKind.Active -> HomeTone.accent
    ProductionStageKind.Blocked -> HomeTone.red
    ProductionStageKind.Review -> HomeTone.purple
    ProductionStageKind.ShipReady -> HomeTone.green
    ProductionStageKind.Done -> HomeTone.slate
}

@Composable
private fun HomeOrdersProductionBody(
    size: HomeCardSize, state: StudioFlowUiState,
    stages: List<ProductionStage>, t: (String) -> String
) {
    val live = liveOrders(state)
    if (live.isEmpty()) {
        Text(t("Nothing here yet."), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    // The stage is derived from the order's own steps against the workspace's own
    // stages — the same rule the Production screen applies, never a second one.
    val steps = state.workspaceSettings.customSteps
        .map { it.trim() }.filter { it.isNotEmpty() }
        .map { it.lowercase() to it }
        .ifEmpty { listOf("design" to "Design", "painting" to "Painting") }
    val resolved = live.map { it to resolveProductionStage(it, stages, steps) }
    val late = live.filter { homeDueDate(it.paymentDate, it.deliveryTime).before(Date()) }
    val shipReadyIds = stages.filter { it.kind == ProductionStageKind.ShipReady }.map { it.id }.toSet()

    if (size == HomeCardSize.OneByOne) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(t("active orders"), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("${live.size}", fontSize = 26.sp, fontWeight = FontWeight.ExtraBold, color = HomeTone.accent)
            HomeSplitPair(
                t("Overdue"), "${late.size}", if (late.isEmpty()) Color.Unspecified else HomeTone.orange,
                t("Ready to ship"), "${resolved.count { it.second.stageId in shipReadyIds }}", HomeTone.green
            )
        }
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (size == HomeCardSize.TwoByTwo) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                HomeMetricTile(t("active orders"), "${live.size}", HomeTone.accent, modifier = Modifier.weight(1f))
                HomeMetricTile(t("Overdue"), "${late.size}",
                    if (late.isEmpty()) HomeTone.accent else HomeTone.orange, modifier = Modifier.weight(1f))
            }
        }
        HomeEyebrow(t("Production flow"))
        Row(Modifier.fillMaxWidth()) {
            stages.forEach { stage ->
                val count = resolved.count { it.second.stageId == stage.id }
                val tone = stageTone(stage.kind)
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Box(Modifier.size(26.dp).background(tone.copy(alpha = 0.16f), CircleShape))
                    Text(t(stage.title), fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("$count", fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, color = tone)
                }
            }
        }
        if (size == HomeCardSize.TwoByTwo) {
            HomePanel {
                HomeEyebrow(t("Priority orders"))
                (late + live.filterNot { o -> late.any { it.id == o.id } }).take(3).forEach { order ->
                    val due = homeDueDate(order.paymentDate, order.deliveryTime)
                    val overdue = due.before(Date())
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        Text(order.customerName.ifEmpty { order.designName }, fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold, maxLines = 1,
                            overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        if (overdue) {
                            val days = ((Date().time - due.time) / 86_400_000L).toInt()
                            HomeChip(if (days > 0) t("{days}d late").replace("{days}", "$days") else t("Overdue"),
                                HomeTone.red)
                        }
                    }
                }
            }
        }
    }
}

// ------------------------------------------------------------------ Schedule

@Composable
private fun HomeScheduleBody(size: HomeCardSize, state: StudioFlowUiState, t: (String) -> String) {
    // Dates and deadlines only — never a second copy of production status (§10).
    val upcoming = liveOrders(state)
        .map { it to homeDueDate(it.paymentDate, it.deliveryTime) }
        .sortedBy { it.second }
    if (upcoming.isEmpty()) {
        Text(t("Nothing here yet."), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    if (size == HomeCardSize.OneByOne) {
        Column {
            upcoming.take(3).forEach { (order, due) ->
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    Text(order.customerName.ifEmpty { order.designName }, fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold, maxLines = 1,
                        overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text(dayLabel(due, t), fontSize = 11.sp, fontWeight = FontWeight.Bold,
                        color = if (due.before(startOfToday())) HomeTone.red
                        else MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        return
    }
    val week = weekDays()
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (size == HomeCardSize.TwoByOne) {
            Row(Modifier.fillMaxWidth()) {
                week.forEach { day ->
                    val count = upcoming.count { sameDay(it.second, day) }
                    val isToday = sameDay(day, Date())
                    Column(
                        Modifier
                            .weight(1f)
                            .background(if (isToday) HomeTone.accent.copy(alpha = 0.09f) else Color.Transparent,
                                RoundedCornerShape(9.dp))
                            .padding(vertical = 6.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(SimpleDateFormat("EEE", Locale.getDefault()).format(day), fontSize = 10.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(SimpleDateFormat("d", Locale.getDefault()).format(day),
                            fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        Text(if (count > 0) "$count" else " ", fontSize = 10.5.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = if (count > 0) HomeTone.accent else Color.Transparent)
                    }
                }
            }
        } else {
            HomeEyebrow(t("Weekly timeline"))
            // The bars are read-only on purpose: dragging a date here would fight
            // the gesture that moves the card itself (§10).
            Column(
                Modifier
                    .fillMaxWidth()
                    .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f), RoundedCornerShape(12.dp))
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Row {
                    Spacer(Modifier.width(80.dp))
                    week.forEach { day ->
                        Text(SimpleDateFormat("EEE d", Locale.getDefault()).format(day),
                            fontSize = 9.sp, modifier = Modifier.weight(1f),
                            color = if (sameDay(day, Date())) HomeTone.accent
                            else MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                val start = week.first().time
                val span = (week.last().time + 86_400_000L - start).toFloat()
                val palette = listOf(HomeTone.accent, HomeTone.green, HomeTone.purple, HomeTone.amber, HomeTone.teal)
                upcoming.take(5).forEachIndexed { index, (order, due) ->
                    val from = ((order.paymentDate.time - start) / span).coerceIn(0f, 1f)
                    val to = ((due.time - start) / span).coerceIn(0f, 1f)
                    val overdue = due.before(startOfToday())
                    val tone = if (overdue) HomeTone.red else palette[index % palette.size]
                    Row(verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(order.customerName.ifEmpty { order.designName }, fontSize = 10.5.sp,
                            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.width(80.dp))
                        Row(Modifier.weight(1f).height(16.dp)) {
                            if (minOf(from, to) > 0f) Spacer(Modifier.weight(minOf(from, to)))
                            Box(
                                Modifier
                                    .weight(maxOf(0.04f, kotlin.math.abs(to - from)))
                                    .height(16.dp)
                                    .background(tone.copy(alpha = 0.18f), RoundedCornerShape(6.dp))
                                    .border(1.dp, tone, RoundedCornerShape(6.dp))
                            )
                            val rest = 1f - maxOf(from, to)
                            if (rest > 0f) Spacer(Modifier.weight(rest))
                        }
                    }
                }
            }
            HomeEyebrow(t("Upcoming deadlines"))
        }
        Row {
            upcoming.take(3).forEachIndexed { index, (order, due) ->
                if (index > 0) {
                    Box(Modifier.width(1.dp).height(30.dp)
                        .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)))
                }
                val overdue = due.before(startOfToday())
                val tone = if (overdue) HomeTone.red else HomeTone.green
                Row(Modifier.weight(1f).padding(horizontal = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.size(24.dp).background(tone.copy(alpha = 0.16f), CircleShape))
                    Column {
                        Text(dayLabel(due, t), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = tone)
                        Text(order.customerName.ifEmpty { order.designName }, fontSize = 10.5.sp,
                            maxLines = 1, overflow = TextOverflow.Ellipsis,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

/** The visible week, Monday first, so the strip and the timeline agree. */
private fun weekDays(): List<Date> {
    val calendar = Calendar.getInstance().apply {
        time = startOfToday()
        val weekday = get(Calendar.DAY_OF_WEEK)
        add(Calendar.DAY_OF_YEAR, -((weekday + 5) % 7))
    }
    return (0 until 7).map {
        val day = calendar.time
        calendar.add(Calendar.DAY_OF_YEAR, 1)
        day
    }
}

private fun sameDay(a: Date, b: Date): Boolean {
    val fa = SimpleDateFormat("yyyyMMdd", Locale.UK)
    return fa.format(a) == fa.format(b)
}

// --------------------------------------------------------------------- Files

@Composable
private fun HomeFilesBody(size: HomeCardSize, state: StudioFlowUiState, t: (String) -> String) {
    // One file, linked to as many records as it belongs to — the card counts
    // files, never copies (§14).
    val files = state.orders.filter { !it.isDeleted }.flatMap { order -> order.clientFiles.map { order to it } }
    if (files.isEmpty()) {
        Text(t("Nothing here yet."), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    val used = files.sumOf { it.second.fileSize }
    if (size == HomeCardSize.OneByOne) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(t("Total files"), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("${files.size}", fontSize = 26.sp, fontWeight = FontWeight.ExtraBold, color = HomeTone.accent)
            HomeSplitPair(
                t("Storage"), fileSize(used.toDouble()),
                rightLabel = t("File library"), rightValue = "${files.size}"
            )
        }
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            HomeMetricTile(t("Total files"), "${files.size}", HomeTone.accent, modifier = Modifier.weight(1f))
            HomeMetricTile(t("Storage"), fileSize(used.toDouble()), HomeTone.green, modifier = Modifier.weight(1f))
        }
        HomePanel {
            HomeEyebrow(t("Recent files"))
            files.take(if (size == HomeCardSize.TwoByTwo) 5 else 3).forEach { (order, file) ->
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                    Box(
                        Modifier
                            .size(width = 17.dp, height = 21.dp)
                            .background(fileTone(file.fileName).copy(alpha = 0.16f), RoundedCornerShape(3.dp))
                            .border(1.dp, fileTone(file.fileName).copy(alpha = 0.5f), RoundedCornerShape(3.dp))
                    )
                    Text(file.fileName, fontSize = 12.sp, maxLines = 1,
                        overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    HomeChip(order.customerName.ifEmpty { t("Order") })
                }
            }
        }
        if (size == HomeCardSize.TwoByTwo) {
            Text(t("One file, multiple links — no duplicates."), fontSize = 10.5.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun fileSize(bytes: Double): String = when {
    bytes >= 1e9 -> String.format(Locale.UK, "%.1f GB", bytes / 1e9)
    bytes >= 1e6 -> String.format(Locale.UK, "%.1f MB", bytes / 1e6)
    bytes >= 1e3 -> "${(bytes / 1e3).toInt()} KB"
    else -> "${bytes.toInt()} B"
}

private fun fileTone(name: String): Color {
    val lower = name.lowercase()
    return when {
        lower.endsWith(".pdf") -> HomeTone.red
        lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".heic") -> HomeTone.green
        else -> HomeTone.slate
    }
}

// --------------------------------------------------------------------- Notes

@Composable
private fun HomeNotesBody(size: HomeCardSize, state: StudioFlowUiState, t: (String) -> String) {
    // Notes only. Not files, not AI replies (§13). Pinned first.
    val live = state.keepNotes.filter { !it.isDeleted && !it.isArchived }
    if (live.isEmpty()) {
        Text(t("Nothing here yet."), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    val pinned = live.filter { it.isPinned }
    val recent = live.filterNot { it.isPinned }.sortedByDescending { it.updatedAt?.time ?: 0L }
    if (size == HomeCardSize.TwoByTwo) {
        Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
            if (pinned.isNotEmpty()) {
                HomeEyebrow(t("Pinned"))
                NoteGrid(pinned.take(2), t)
            }
            HomeEyebrow(t("Recent"))
            NoteGrid(recent.take(if (pinned.isEmpty()) 4 else 2), t)
        }
    } else {
        NoteGrid((pinned + recent).take(if (size == HomeCardSize.OneByOne) 2 else 2), t)
    }
}

@Composable
private fun NoteGrid(notes: List<StudioKeepNote>, t: (String) -> String) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        notes.chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                pair.forEach { NoteTile(it, t, Modifier.weight(1f)) }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

/** A note keeps its own colour — that is the note's, not the card's. */
@Composable
private fun NoteTile(note: StudioKeepNote, t: (String) -> String, modifier: Modifier) {
    Column(
        modifier
            .background(noteColour(note.colorName), RoundedCornerShape(12.dp))
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
            .padding(horizontal = 10.dp, vertical = 9.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(note.title.ifEmpty { t("Untitled note") }, fontSize = 12.sp,
            fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (note.text.isNotEmpty()) {
            Text(note.text, fontSize = 11.sp, maxLines = 2, overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (note.linkedOrderLabel.isNotEmpty()) HomeChip(note.linkedOrderLabel, HomeTone.slate)
    }
}

private fun noteColour(name: String): Color = when (name.lowercase()) {
    "yellow" -> Color(0xFFFEF7E0)
    "blue" -> Color(0xFFE5F0FD)
    "green" -> Color(0xFFE7F6EC)
    "red" -> Color(0xFFFDEAEA)
    "purple" -> Color(0xFFF1ECFD)
    "orange" -> Color(0xFFFDEEE0)
    else -> Color.Transparent
}
