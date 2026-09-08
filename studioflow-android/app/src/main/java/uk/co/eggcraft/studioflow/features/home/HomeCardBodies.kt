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
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Calculate
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.automirrored.filled.ListAlt
import androidx.compose.material.icons.filled.Percent
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.DocumentScanner
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.Link
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
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uk.co.eggcraft.studioflow.data.firebase.StudioFlowRepository
import uk.co.eggcraft.studioflow.data.model.bankDetectRecurring
import uk.co.eggcraft.studioflow.data.model.StudioInventoryItem
import uk.co.eggcraft.studioflow.data.model.StudioInventorySummary
import uk.co.eggcraft.studioflow.data.model.StudioKeepNote
import uk.co.eggcraft.studioflow.data.model.StudioOrder
import uk.co.eggcraft.studioflow.features.production.ProductionStage
import uk.co.eggcraft.studioflow.features.production.ProductionStageKind
import uk.co.eggcraft.studioflow.features.production.resolveProductionStage
import uk.co.eggcraft.studioflow.features.shell.StudioFlowUiState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.material3.HorizontalDivider
import java.text.SimpleDateFormat
import uk.co.eggcraft.studioflow.features.dashboard.adjustedDashboardNetProfit
import uk.co.eggcraft.studioflow.features.dashboard.dashboardCustomExpenseTotal
import uk.co.eggcraft.studioflow.data.model.StudioClientFile
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
    /** Only populated when a 2x2 stock card asked for it. */
    inventoryItems: List<StudioInventoryItem> = emptyList(),
    stages: List<ProductionStage>,
    /** Phone layout: the wide cards stack their figures instead of lining them up. */
    compact: Boolean = false,
    /** The range the card's totals cover; only the money cards read it. */
    period: HomeCardPeriod = HomeCardPeriod.Month,
    t: (String) -> String,
    /** Opens the Quick Create form. Creating nothing is the point: the tile
     *  used to write an empty project straight into the workspace. */
    onStartNewOrder: () -> Unit,
    onOpenSection: (String) -> Unit,
    /** Getting started only: the steps this member has waved off, and the way to
     *  wave one off. */
    setupSkipped: List<String> = emptyList(),
    onSkipSetupStep: ((String) -> Unit)? = null,
    onRestoreSetupSkipped: (() -> Unit)? = null,
    /** Getting started only: this workspace's own steps, from the server. Null
     *  while the call is in flight and after one that failed. */
    setupChecklist: StudioFlowRepository.StudioSetupChecklist? = null
) {
    when (id) {
        HomeCardId.GettingStarted ->
            HomeGettingStartedBody(size, state, inventory, t, setupSkipped, onSkipSetupStep,
                onRestoreSetupSkipped, setupChecklist, onOpenSection)
        HomeCardId.QuickActions -> HomeQuickActionsBody(size, access, t, onStartNewOrder, onOpenSection)
        HomeCardId.RecentActivity -> HomeRecentActivityBody(size, state, t)
        HomeCardId.Money -> HomeMoneyBody(size, state, compact, period, t)
        HomeCardId.Banking -> HomeBankingBody(size, state, compact, t)
        HomeCardId.Inventory -> HomeInventoryBody(size, state, inventory, inventoryFailed, inventoryItems, compact, t)
        HomeCardId.Customers -> HomeCustomersBody(size, state, compact, t)
        HomeCardId.OrdersProduction -> HomeOrdersProductionBody(size, state, stages, compact, t)
        HomeCardId.Schedule -> HomeScheduleBody(size, state, t)
        HomeCardId.Files -> HomeFilesBody(size, state, compact, t)
        HomeCardId.Notes -> HomeNotesBody(size, state, compact, { onOpenSection("Notes") }, t)
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

/** The sheet's schedule card is a week, not a list: every order gets a bar on
 *  the days it occupies, read against today's column. Compose has no grid that
 *  spans columns, so the track measures itself and the bars are placed by day
 *  width — the same arithmetic the web grid does for free. */
@Composable
private fun HomeWeekTimeline(
    days: List<Date>,
    entries: List<Pair<StudioOrder, Date>>,
    t: (String) -> String,
    /** The deadlines still ahead, spelled out under the week. Empty on the wide
     *  card, which has no room for a second section. */
    ahead: List<Pair<StudioOrder, Date>> = emptyList(),
    /** The big card has room for the day it is read against, a fourth bar and
     *  the dates underneath. */
    large: Boolean = false,
) {
    val todayIndex = days.indexOfFirst { sameDay(it, Date()) }
    val today = startOfToday()
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val nameWidth = if (maxWidth > 420.dp) 140.dp else 96.dp
        val cell = (maxWidth - nameWidth) / 7
        Column {
            Row(Modifier.padding(bottom = if (large) 8.dp else 4.dp), verticalAlignment = Alignment.Bottom) {
                Spacer(Modifier.width(nameWidth))
                days.forEachIndexed { index, day ->
                    val isToday = index == todayIndex
                    Column(Modifier.width(cell), horizontalAlignment = Alignment.CenterHorizontally) {
                        // The big card marks today the way the sheet does —
                        // solid, with the word under it. The wide card has no
                        // height for either and tints the column instead.
                        Column(
                            Modifier
                                // A day column is about 34dp wide and the mark
                                // needs more than that: let it take its own width
                                // and sit over its neighbours rather than wrap.
                                .wrapContentWidth(unbounded = true)
                                .background(
                                    if (large && isToday) HomeTone.accent else Color.Transparent,
                                    RoundedCornerShape(9.dp)
                                )
                                .padding(
                                    horizontal = if (large && isToday) 9.dp else 0.dp,
                                    vertical = if (large && isToday) 3.dp else 0.dp
                                ),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            val ink = if (isToday) {
                                if (large) Color.White else HomeTone.accent
                            } else MaterialTheme.colorScheme.onSurfaceVariant
                            Text(SimpleDateFormat("EEE", Locale.getDefault()).format(day),
                                fontSize = if (large) 10.5.sp else 9.5.sp,
                                fontWeight = if (isToday) FontWeight.Bold else FontWeight.Normal,
                                color = ink)
                            Text(SimpleDateFormat("d", Locale.getDefault()).format(day),
                                fontSize = if (large) 13.sp else 11.5.sp, fontWeight = FontWeight.Bold,
                                color = if (isToday && large) Color.White
                                else if (isToday) HomeTone.accent
                                else MaterialTheme.colorScheme.onSurface)
                        }
                        if (large && isToday) {
                            Text(t("Today"), fontSize = 9.5.sp, color = HomeTone.accent,
                                modifier = Modifier.padding(top = 2.dp))
                        }
                    }
                }
            }
            HorizontalDivider(
                Modifier.padding(start = if (large) 0.dp else nameWidth),
                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)
            )
            if (large) {
                Box(Modifier.padding(vertical = 6.dp)) { HomeEyebrow(t("Weekly timeline")) }
            }
            Box(Modifier.weight(1f)) {
                if (large) {
                    // A line at the head of every day column, so a bar can be
                    // read back to the day it starts on.
                    Row(Modifier.fillMaxSize()) {
                        Spacer(Modifier.width(nameWidth))
                        repeat(7) {
                            Box(Modifier.width(cell).fillMaxHeight()) {
                                Box(Modifier.width(1.dp).fillMaxHeight()
                                    .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f)))
                            }
                        }
                    }
                } else if (todayIndex >= 0) {
                    Box(
                        Modifier
                            .offset(x = nameWidth + cell * todayIndex)
                            .width(cell)
                            .fillMaxHeight()
                            .background(HomeTone.accent.copy(alpha = 0.07f), RoundedCornerShape(8.dp))
                    )
                }
                Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    entries.forEach { (order, due) ->
                        val (label, tone) = homeDueChip(order.paymentDate, due, t)
                        val name = order.customerName.ifEmpty { order.designName }
                        val ref = order.watchRef.trim()
                        val placed = homeWeekBarColumns(order.paymentDate, due, days)
                        // The section below spells out the dates, so up here only
                        // the bars that need doing something about carry a word.
                        val urgent = placed.third || (startOfDay(due).time - today.time) / 86_400_000L <= 1L
                        Box(Modifier.weight(1f)) {
                            Row(Modifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    if (ref.isEmpty()) name
                                    else "${if (ref.startsWith("#")) ref else "#" + ref} $name",
                                    fontSize = 10.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.75f),
                                    modifier = Modifier.width(nameWidth - 8.dp).padding(end = 8.dp)
                                )
                                Box(Modifier.fillMaxWidth()) {
                                    HomeWeekBar(
                                        label = if (large && !urgent) "" else label,
                                        tone = tone, dashed = placed.third,
                                        modifier = Modifier
                                            .offset(x = cell * placed.first)
                                            // A bar narrower than its own chip
                                            // grows to fit the word, and grows
                                            // leftward at the last column so it
                                            // stays on the card.
                                            .width(
                                                if (large && !urgent) cell * (placed.second - placed.first + 1)
                                                else maxOf(54.dp, cell * (placed.second - placed.first + 1))
                                            )
                                    )
                                }
                            }
                            if (large) {
                                Box(
                                    Modifier
                                        .align(Alignment.BottomStart)
                                        .padding(start = nameWidth)
                                        .fillMaxWidth()
                                        .height(1.dp)
                                        .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
                                )
                            }
                        }
                    }
                }
            }
            if (large && ahead.isNotEmpty()) {
                HorizontalDivider(
                    Modifier.padding(top = 6.dp),
                    color = MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)
                )
                Box(Modifier.padding(vertical = 6.dp)) { HomeEyebrow(t("Upcoming")) }
                HomeUpcomingRow(ahead, t)
            }
        }
    }
}

/** The next deadlines, spelled out: the timeline says when in the week, this
 *  says which day and whose order. */
@Composable
private fun HomeUpcomingRow(entries: List<Pair<StudioOrder, Date>>, t: (String) -> String) {
    Row {
        entries.forEachIndexed { index, (order, due) ->
            if (index > 0) {
                Box(Modifier.width(1.dp).height(30.dp)
                    .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)))
            }
            val (label, tone) = homeDueChip(order.paymentDate, due, t)
            val name = order.customerName.ifEmpty { order.designName }
            val ref = order.watchRef.trim()
            Row(
                Modifier.weight(1f).padding(start = if (index == 0) 0.dp else 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(9.dp)
            ) {
                Box(
                    Modifier.size(30.dp).background(tone.copy(alpha = 0.12f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Filled.CalendarMonth, null, Modifier.size(16.dp), tone)
                }
                Column {
                    Text(label, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = tone,
                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        if (ref.isEmpty()) name
                        else "${if (ref.startsWith("#")) ref else "#" + ref} $name",
                        fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

/** Which columns a bar covers, and whether the deadline fell before this week —
 *  then there is no span to draw and the chip stands on its own. */
private fun homeWeekBarColumns(paymentDate: Date, due: Date, days: List<Date>): Triple<Int, Int, Boolean> {
    val weekStart = startOfDay(days.first()).time
    val column = { date: Date -> ((startOfDay(date).time - weekStart) / 86_400_000L).toInt() }
    val from = maxOf(0, column(paymentDate))
    val to = column(due)
    val end = minOf(maxOf(to, from), 6)
    val start = if (end == 6) minOf(from, 5) else minOf(from, 6)
    return Triple(start, end, to < 0)
}

@Composable
private fun HomeWeekBar(label: String, tone: Color, dashed: Boolean, modifier: Modifier = Modifier) {
    Row(
        modifier
            .height(18.dp)
            .background(if (dashed) Color.Transparent else tone.copy(alpha = 0.10f), RoundedCornerShape(7.dp))
            .border(
                BorderStroke(1.dp, tone.copy(alpha = 0.5f)),
                RoundedCornerShape(7.dp)
            )
            .padding(horizontal = 6.dp),
        horizontalArrangement = Arrangement.End,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, fontSize = 9.5.sp, fontWeight = FontWeight.Bold, color = tone,
            maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** "24–30 Aug", or "28 Aug – 3 Sep" when the visible week straddles two months. */
fun homeWeekRangeLabel(): String {
    val week = weekDays()
    val start = week.first()
    val end = week.last()
    val monthOf = { d: Date -> Calendar.getInstance().apply { time = d }.get(Calendar.MONTH) }
    val dayOf = { d: Date -> Calendar.getInstance().apply { time = d }.get(Calendar.DAY_OF_MONTH) }
    val long = SimpleDateFormat("d MMM", Locale.getDefault())
    return if (monthOf(start) == monthOf(end)) "${dayOf(start)}\u2013${long.format(end)}"
    else "${long.format(start)} \u2013 ${long.format(end)}"
}

private fun startOfDay(date: Date): Date = Calendar.getInstance().apply {
    time = date
    set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
    set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
}.time

/** The chip answers "when", never "how far along" — production status stays out
 *  of this card (§10). A start still ahead of us beats the deadline, because
 *  nothing is late on an order that has not begun yet. A weekday on its own only
 *  reads unambiguously inside the coming week; past that it takes a date. */
private fun homeDueChip(paymentDate: Date, due: Date, t: (String) -> String): Pair<String, Color> {
    val today = startOfToday().time
    val startsIn = (startOfDay(paymentDate).time - today) / 86_400_000L
    if (startsIn in 1L..6L) {
        val day = SimpleDateFormat("EEE", Locale.getDefault()).format(paymentDate)
        return t("Starts {day}").replace("{day}", day) to HomeTone.purple
    }
    val days = (startOfDay(due).time - today) / 86_400_000L
    return when {
        days < 0L -> t("Overdue") to HomeTone.red
        days == 0L -> t("Due today") to HomeTone.red
        days == 1L -> t("Tomorrow") to HomeTone.orange
        else -> SimpleDateFormat("d MMM", Locale.getDefault()).format(due) to HomeTone.accent
    }
}

/** The sheet names the row after the order. A workspace that never gave the
 *  order a reference has only the customer, and then that is the name. */
private fun homeOrderReference(ref: String, name: String, t: (String) -> String, withWord: Boolean): String {
    if (ref.isEmpty()) return name
    val hash = if (ref.startsWith("#")) ref else "#" + ref
    return if (withWord) "${t("Order")} $hash" else hash
}

/** A phone 1x1 is a 174dp square with a header on top: the sheet's one-line row
 *  — reference, customer and chip side by side — fits two of the three, so the
 *  customer drops to a second line rather than pushing the chip off the card. */
@Composable
private fun HomeDueRow(reference: String, name: String, chip: String, tone: Color) {
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(reference, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1,
                overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(8.dp))
            HomeChip(chip, tone)
        }
        if (name.isNotEmpty()) {
            Text(name, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

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

/**
 * Where a server-named step sends somebody.
 *
 * The server names the ACTION ("bank", "inventory") rather than a screen,
 * because the four clients do not share one — these are this app's sections,
 * and they are the same destinations the web map uses. An action with no
 * section here resolves to nothing and the step stays inert rather than
 * offering a button that goes nowhere.
 */
private fun setupStepDestination(action: String): String = when (action) {
    "integrations" -> "Settings"
    "new_order" -> "Orders"
    "new_customer" -> "Customers"
    "bank" -> "BankSpending"
    "inventory" -> "Inventory"
    "assistant" -> "QuickReply"
    else -> ""
}

@Composable
private fun HomeGettingStartedBody(
    size: HomeCardSize,
    state: StudioFlowUiState,
    inventory: StudioInventorySummary?,
    t: (String) -> String,
    skipped: List<String> = emptyList(),
    onSkip: ((String) -> Unit)? = null,
    /** "Skip for now" is only true if a skipped step can come back. */
    onRestoreSkipped: (() -> Unit)? = null,
    /** This workspace's own steps, from getSetupChecklist. */
    checklist: StudioFlowRepository.StudioSetupChecklist? = null,
    /** What makes a step a step rather than a sentence about one. */
    onOpenSection: ((String) -> Unit)? = null
) {
    val inventoryCount = (inventory?.uniqueCount ?: 0) + (inventory?.quantityCount ?: 0)
    val fromStore = state.orders.any {
        !it.customFields["Shopify Status"].isNullOrBlank() || !it.customFields["WooCommerce Status"].isNullOrBlank()
    }
    // The fallback, for a call that has not answered yet or could not: the same
    // six steps for everybody, which is exactly why it is not the list we ask
    // for. "Set up business profile" used to be hardcoded ticked here — the
    // card congratulated a workspace that had never opened Settings — so it now
    // reads a real completion.
    //
    // The STRICT completion, not the tolerant one the wizard's gate uses. The
    // tolerant read is true for anyone who pressed Skip, because a Skip stamps
    // the workspace with the completed-at date and deliberately never writes
    // the boolean — so the fallback list ticked "Set up business profile" for
    // exactly the people who had refused to do it. The server does not: its own
    // checklist marks that step done on `businessOnboardingCompleted === true`
    // and nothing else, and this is the fallback for the server's list, so it
    // has to agree with it or it tells a different story when the call is slow.
    val localSteps = listOf(
        SetupStep("profile", "Set up business profile", "Name, currency and tax so every document reads right.", "Settings", "Open settings", state.workspaceSettings.businessOnboardingWizardCompleted),
        SetupStep("customer", "Add your first customer", "Orders, notes and files all hang off a customer.", "Customers", "Add customer", state.customers.isNotEmpty()),
        SetupStep("order", "Create your first order", "The record everything else in NivaDesk attaches to.", "Orders", "Create order", state.orders.isNotEmpty()),
        SetupStep("shop", "Connect your shop", "Import orders automatically from Shopify or WooCommerce.", "Settings", "Connect shop", fromStore),
        SetupStep("inventory", "Add an inventory item", "Track what you own, what is reserved and what is low.", "Inventory", "Add item", inventoryCount > 0),
        SetupStep("bank", "Connect your bank", "Read-only. Spending arrives and you categorise it.", "BankSpending", "Connect bank", state.bankTransactions.isNotEmpty())
    )
    // The server's list is built from the goal this workspace chose and from the
    // same requirements table activation is measured against, so the checklist
    // and the measurement cannot drift apart. Its steps carry their own words;
    // the CTA is a plain "Continue" because the step's name is already on the
    // row above the panel.
    val allSteps = checklist?.steps?.map { step ->
        SetupStep(
            step.key, step.title, step.detail,
            setupStepDestination(step.action), "Continue", step.done
        )
    } ?: localSteps
    // Skips are recorded against step ids. The server names its steps
    // differently ("order_created", not "order"), so a step waved off under the
    // local list is simply not one of these — nothing is hidden by accident.
    val steps = allSteps.filter { it.id !in skipped }
    if (steps.isEmpty()) return
    val done = steps.filter { it.done }
    // The step to push somebody at has to be one they can get to. The server's
    // first line ("Tell us what you'd like help with") is a statement with no
    // destination, so it is passed over unless it is all that is left.
    val next = steps.firstOrNull { !it.done && it.destination.isNotEmpty() }
        ?: steps.firstOrNull { !it.done }
    val todo = steps.filter { !it.done && it.id != next?.id }
    fun opener(step: SetupStep): (() -> Unit)? {
        if (onOpenSection == null || step.destination.isEmpty()) return null
        return { onOpenSection(step.destination) }
    }

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
                    // The square spends itself on the one thing to do next and
                    // the way past it, not on a list of what is still open —
                    // that list is the wall §15 says never to put here.
                    HomeNextPanel(next, t, "compact", opener(next))
                    if (onSkip != null) HomeSkipText(t("Skip for now")) { onSkip(next.id) }
                } else HomeAllSetNote(skipped, onRestoreSkipped, t)
            }
            // The one thing to do next on the left, what is left after it on the
            // right. The Completed list that used to hold the left column is
            // gone: a card whose job is to move you forward spent half itself on
            // work already finished.
            HomeCardSize.TwoByOne -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (next != null) {
                        HomeNextPanel(next, t, "inline", opener(next))
                        if (onSkip != null) HomeSkipText(t("Skip for now")) { onSkip(next.id) }
                    } else HomeAllSetNote(skipped, onRestoreSkipped, t)
                }
                Box(Modifier.width(1.dp).fillMaxHeight()
                    .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)))
                Column(Modifier.weight(1f)) {
                    todo.take(3).forEach { HomeCheckRow(t(it.label), "todo", onClick = opener(it)) }
                }
            }
            HomeCardSize.TwoByTwo -> {
                // One column, not two: side by side the list had about half the
                // width and every label was cut to "Set up business pro…" — a
                // checklist you cannot read is not a checklist. The heading goes
                // on a phone, where six readable rows matter more; the card is
                // already titled "Getting started".
                BoxWithConstraints {
                    val roomForHeading = maxWidth > 420.dp
                    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        if (roomForHeading) HomeEyebrow(t("Your checklist"))
                        Column(verticalArrangement = Arrangement.spacedBy(if (roomForHeading) 3.dp else 2.dp)) {
                            steps.forEach {
                                HomeCheckRow(
                                    t(it.label),
                                    if (it.done) "done" else if (it.id == next?.id) "current" else "todo",
                                    boxed = true,
                                    onClick = opener(it)
                                )
                            }
                        }
                        if (next != null) {
                            HomeNextPanel(next, t, "large", opener(next))
                            if (onSkip != null) {
                                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                                    HomeSkipText(t("Skip for now")) { onSkip(next.id) }
                                }
                            }
                        } else HomePanel { HomeAllSetNote(skipped, onRestoreSkipped, t) }
                    }
                }
            }
        }
    }
}

/** The recommendation — blue enough to be the obvious next thing, calm enough
 *  that it is not a payment prompt (§15). */
/** The way past a step that is not for this workshop. */
@Composable
private fun HomeSkipText(label: String, onClick: () -> Unit) {
    Text(label, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold,
        color = HomeTone.accent, modifier = Modifier.clickable(onClick = onClick))
}

/** The end of the checklist, and the way back into it. "Skip for now" has to be
 *  true: without a way to bring a skipped step back, "now" is a promise the card
 *  does not keep, and there is nothing left to do here. */
@Composable
private fun HomeAllSetNote(skipped: List<String>, onRestore: (() -> Unit)?, t: (String) -> String) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(t("All set — nice work."), fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (skipped.isNotEmpty() && onRestore != null) {
            HomeSkipText(t("{count} skipped").replace("{count}", skipped.size.toString()), onRestore)
        }
    }
}

/**
 * [onClick] is the difference between a recommendation and a button. The panel
 * computed the right next step and drew it, tint and all, with nothing behind
 * it — so the whole panel is the target now, not just the pill: at 1x1 the pill
 * is about 22dp tall, which is half a finger.
 *
 * A step with no destination gets null and loses the pill entirely. A button
 * that does nothing is worse than no button.
 */
@Composable
private fun HomeNextPanel(step: SetupStep, t: (String) -> String, style: String, onClick: (() -> Unit)? = null) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(HomeTone.accent.copy(alpha = 0.07f))
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(
                horizontal = if (style == "compact") 10.dp else 11.dp,
                vertical = if (style == "compact") 7.dp else 9.dp
            ),
        verticalArrangement = Arrangement.spacedBy(if (style == "compact") 5.dp else 6.dp)
    ) {
        // No heading here: the big card's list above already names this step and
        // colours it blue, so the panel repeating it was the same words twice.
        // The wide card's "Up next" label goes: a single tinted panel under a
        // progress bar does not need to be told it is what comes next, and the
        // line that says why earns the space instead.
        if (style != "large") {
            Text(t(step.label), fontSize = if (style == "compact") 12.5.sp else 13.5.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        // The square gives up the line that explains why: measured, the step's
        // own name plus its blurb runs past the bottom of a 174dp card in
        // German. The page the button opens explains itself.
        if (style != "compact") {
            Text(t(step.blurb), fontSize = 11.sp, maxLines = 2, overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (onClick != null) {
            Text(
                // The square has no width for "Connect your shop" twice — the panel's
                // heading already named the step, so the button just moves.
                t(if (style == "large") step.cta else "Continue"),
                fontSize = if (style == "compact") 11.sp else 12.sp,
                fontWeight = FontWeight.Bold, color = Color.White,
                modifier = Modifier
                    .then(if (style == "compact") Modifier else Modifier.fillMaxWidth())
                    .background(HomeTone.accent, RoundedCornerShape(9.dp))
                    .padding(
                        horizontal = if (style == "compact") 11.dp else 16.dp,
                        vertical = if (style == "compact") 4.dp else 8.dp
                    )
            )
        }
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
    /** Opens the Quick Create form. Creating nothing is the point: the tile
     *  used to write an empty project straight into the workspace. */
    onStartNewOrder: () -> Unit,
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
    val fire: (QuickAction) -> Unit = { if (it.destination.isEmpty()) onStartNewOrder() else onOpenSection(it.destination) }

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
// What an activity row looks like, from the notification type the SERVER
// writes — eighteen of them.
//
// Android was a step behind the other two: it had the colours and drew a bare
// coloured circle with nothing in it, which is the empty-avatar look the
// reference sheet replaces. And the colour chain itself dropped the types that
// matter most in a real workspace — estimate_decision, both bank_ ones,
// shared_note, the ticket ones, team — onto grey.
//
// Same order as the web table in
// studioflow-web/components/home/HomeCardBodies.tsx and the Swift one in
// EGGcraft/HomeCardBodies.swift; checked against the server's list by
// functions/test/qa/home-activity-looks.test.js. Money first, so
// woocommerce_payment is not read as an order.
private data class ActivityLook(val tone: Color, val icon: ImageVector)

private val ACTIVITY_LOOKS: List<Pair<List<String>, ActivityLook>> = listOf(
    listOf("payment", "refund", "invoice_paid") to ActivityLook(HomeTone.green, Icons.Filled.CreditCard),
    listOf("bank_") to ActivityLook(HomeTone.teal, Icons.Filled.AccountBalance),
    listOf("estimate") to ActivityLook(HomeTone.purple, Icons.Filled.CheckCircle),
    listOf("delivery", "dispatch", "shipped") to ActivityLook(HomeTone.accent, Icons.Filled.LocalShipping),
    listOf("production", "status", "stage") to ActivityLook(HomeTone.accent, Icons.Filled.Settings),
    listOf("deletion", "deleted") to ActivityLook(HomeTone.slate, Icons.AutoMirrored.Filled.Chat),
    listOf("order") to ActivityLook(HomeTone.purple, Icons.Filled.ShoppingCart),
    listOf("note") to ActivityLook(HomeTone.amber, Icons.AutoMirrored.Filled.Note),
    listOf("ticket", "support", "direct", "message", "reply") to ActivityLook(HomeTone.slate, Icons.AutoMirrored.Filled.Chat),
    listOf("team", "member", "invite") to ActivityLook(HomeTone.teal, Icons.Filled.Group),
    listOf("file", "upload", "document") to ActivityLook(HomeTone.amber, Icons.Filled.InsertDriveFile),
    listOf("inventory", "stock") to ActivityLook(HomeTone.orange, Icons.Filled.Inventory2),
    listOf("customer") to ActivityLook(HomeTone.teal, Icons.Filled.Person),
    listOf("schedule", "reminder") to ActivityLook(HomeTone.accent, Icons.Filled.CalendarMonth)
)

private fun activityLook(type: String): ActivityLook {
    val key = type.lowercase()
    return ACTIVITY_LOOKS.firstOrNull { (keys, _) -> keys.any { key.contains(it) } }?.second
        ?: ActivityLook(HomeTone.slate, Icons.Filled.Schedule)
}

private fun activityTone(type: String): Color = activityLook(type).tone

@Composable
private fun HomeRecentActivityBody(size: HomeCardSize, state: StudioFlowUiState, t: (String) -> String) {
    // Only what the signed-in user is a recipient of — activity never widens
    // what someone can see (§12).
    val limit = when (size) {
        // Six on a wide card, not five: it is two columns of three now, and an
        // odd number left the second column short so the card looked like it
        // had run out of events.
        HomeCardSize.OneByOne -> 3; HomeCardSize.TwoByOne -> 6; HomeCardSize.TwoByTwo -> 8
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
                today.forEach { ActivityRow(it.type, it.title, it.message, it.senderName, it.createdAt, t, true, size) }
            }
            if (earlier.isNotEmpty()) {
                HomeEyebrow(t("Earlier"))
                earlier.forEach { ActivityRow(it.type, it.title, it.message, it.senderName, it.createdAt, t, true, size) }
            }
            Text(t("Only activity you have permission to view is shown"), fontSize = 10.5.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    } else if (size == HomeCardSize.TwoByOne) {
        // Two columns, as the reference sheet draws the wide card: split rather
        // than stretched, so each row keeps its full width for the title
        // instead of spending it on whitespace.
        val half = (rows.size + 1) / 2
        Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
            Column(Modifier.weight(1f)) {
                rows.take(half).forEach { ActivityRow(it.type, it.title, it.message, it.senderName, it.createdAt, t, false, size) }
            }
            Column(Modifier.weight(1f)) {
                rows.drop(half).forEach { ActivityRow(it.type, it.title, it.message, it.senderName, it.createdAt, t, false, size) }
            }
        }
    } else {
        Column { rows.forEach { ActivityRow(it.type, it.title, it.message, it.senderName, it.createdAt, t, false, size) } }
    }
}

@Composable
private fun ActivityRow(
    type: String, title: String, message: String, actor: String,
    createdAt: Date?, t: (String) -> String, showActor: Boolean,
    size: HomeCardSize = HomeCardSize.TwoByOne
) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        val look = activityLook(type)
        // The reference draws the two sizes differently on purpose: a square
        // fills the disc with a white glyph, a wide card tints it and keeps the
        // glyph in the colour. One hue either way, so they cannot drift apart.
        // Solid on the square AND on the wide-open card; tinted only on 2x1.
        val solid = size != HomeCardSize.TwoByOne
        Box(
            Modifier
                .size(24.dp)
                .background(if (solid) look.tone else look.tone.copy(alpha = 0.13f), CircleShape)
                .then(
                    if (solid) Modifier
                    else Modifier.border(1.5.dp, look.tone.copy(alpha = 0.32f), CircleShape)
                ),
            contentAlignment = Alignment.Center
        ) {
            Icon(look.icon, null, Modifier.size(13.dp), if (solid) Color.White else look.tone)
        }
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
private fun HomeMoneyBody(size: HomeCardSize, state: StudioFlowUiState, compact: Boolean,
                          period: HomeCardPeriod, t: (String) -> String) {
    // The commercial result, never the bank feed's transaction list (§7). The
    // header says which window these totals cover, so they have to actually
    // cover it — same rule the Dashboard applies, against the payment date.
    val window = homePeriodRange(period)
    val orders = state.orders.filter {
        !it.isDeleted && it.countsTowardBalance &&
            !it.paymentDate.before(window.first) && !it.paymentDate.after(window.second)
    }
    if (orders.isEmpty()) {
        Text(t("Nothing here yet."), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    // The Dashboard's rule, not the raw field: `netProfit` knows nothing about
    // the workspace's extra spending, and it charges base cost even when the
    // workspace has turned that off — so Home reported a different profit from
    // the Dashboard for exactly the same orders.
    val expenseTitles = state.workspaceSettings.financialExpenseItems
    val showBaseCost = state.workspaceSettings.financialShowBaseCost
    val revenue = orders.sumOf { it.orderValue }
    val received = orders.sumOf { it.paidAmount }
    val outstanding = orders.sumOf { it.remainingAmount + it.customRemainingTotal }
    val costs = orders.sumOf {
        (if (showBaseCost) it.watchPurchasePrice else 0.0) + dashboardCustomExpenseTotal(it, expenseTitles)
    }
    val fees = orders.sumOf { it.paymentFee }
    val shipping = orders.sumOf { it.deliveryCost }
    val vat = orders.sumOf { it.taxAmount }
    val profit = orders.sumOf { adjustedDashboardNetProfit(it, expenseTitles, showBaseCost) }

    when (size) {
        // The square distributes: the headline stays under the top line and the
        // pair beneath it sits on the floor of the card (§2).
        HomeCardSize.OneByOne -> Column(Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(if (compact) 8.dp else 12.dp)) {
            Text(t("Net profit"), fontSize = if (compact) 11.sp else 13.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(money(profit, state), fontSize = if (compact) 24.sp else 32.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
                color = if (profit >= 0) HomeTone.green else HomeTone.red)
            Spacer(Modifier.weight(1f))
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
                            color = MaterialTheme.colorScheme.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
            Text(money(spent, state), fontSize = 26.sp, fontWeight = FontWeight.ExtraBold,
                color = MaterialTheme.colorScheme.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
            Text(money(spent, state), fontSize = 24.sp, fontWeight = FontWeight.ExtraBold,
                color = MaterialTheme.colorScheme.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
                BankFigure(t("Spent this month"), money(spent, state), MaterialTheme.colorScheme.onSurface, Modifier.weight(1f))
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
                        color = if (top.amount < 0) MaterialTheme.colorScheme.onSurface else HomeTone.green)
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
                    fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface, maxLines = 1)
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
                BankFigure(t("Spent this month"), money(spent, state), MaterialTheme.colorScheme.onSurface, Modifier.weight(1f))
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
                                color = if (tx.amount < 0) MaterialTheme.colorScheme.onSurface else HomeTone.green)
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
                SlimTile(t("Spent this month"), money(spent, state), HomeTone.slate,
                    Icons.Filled.ArrowUpward, Modifier.weight(1f), valueTone = MaterialTheme.colorScheme.onSurface)
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
            HomeMetricTile(t("Spent this month"), money(spent, state), HomeTone.slate,
                modifier = Modifier.weight(1f), icon = Icons.Filled.ArrowUpward, valueTone = MaterialTheme.colorScheme.onSurface)
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
                            color = if (tx.amount < 0) MaterialTheme.colorScheme.onSurface else HomeTone.green)
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
                                    color = if (tx.amount < 0) MaterialTheme.colorScheme.onSurface else HomeTone.green)
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
/**
 * The window a period covers. Same rule the Dashboard applies — from the start
 * of the month or the year to the end of today — because two definitions of
 * "this month" is one too many.
 */
private fun homePeriodRange(period: HomeCardPeriod): Pair<Date, Date> {
    val end = Calendar.getInstance().apply {
        set(Calendar.HOUR_OF_DAY, 23); set(Calendar.MINUTE, 59)
        set(Calendar.SECOND, 59); set(Calendar.MILLISECOND, 999)
    }.time
    val start = Calendar.getInstance().apply {
        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        set(Calendar.DAY_OF_MONTH, 1)
        when (period) {
            HomeCardPeriod.Month -> Unit
            HomeCardPeriod.Year -> set(Calendar.MONTH, Calendar.JANUARY)
            HomeCardPeriod.All -> timeInMillis = 0L
        }
    }.time
    return start to end
}

/** The lane row's own height, and one order row's — the 2x1 measures its list
 *  against these rather than discovering it does not fit after it has drawn. */
private const val LANES_HEIGHT = 63f
private const val ORDER_ROW_HEIGHT = 51f

/** One production stage as a figure: a coloured dot, the workspace's own name
 *  for the stage, and the count under it. Two lines' worth of name whether it
 *  needs them or not, so every figure's number sits on the same line. */
@Composable
private fun LaneFigure(title: String, count: Int, tone: Color, modifier: Modifier) {
    Column(modifier.padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Row(Modifier.height(32.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            Box(Modifier.padding(top = 4.dp).size(8.dp).background(tone, CircleShape))
            Text(title, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis,
                lineHeight = 15.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text("$count", fontSize = 25.sp, fontWeight = FontWeight.ExtraBold, color = tone, maxLines = 1)
    }
}

/** The order's own preview if it has one, its initial if it does not — a blank
 *  square beside a name reads as a failed image rather than "no picture yet". */
@Composable
private fun OrderThumb(link: String, name: String) {
    Box(
        Modifier.size(40.dp)
            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.07f), RoundedCornerShape(9.dp)),
        contentAlignment = Alignment.Center
    ) {
        if (link.isNotBlank()) {
            AsyncImage(model = link, contentDescription = null,
                modifier = Modifier.matchParentSize().clip(RoundedCornerShape(9.dp)),
                contentScale = ContentScale.Crop)
        } else {
            Text(name.take(1).uppercase(), fontSize = 15.sp, fontWeight = FontWeight.ExtraBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f))
        }
    }
}

@Composable
/** [valueTone] is the same escape hatch as [HomeMetricTile]'s: the disc keeps
 *  the category colour, the number reads as ordinary text. */
private fun SlimTile(label: String, value: String, tone: Color, icon: ImageVector, modifier: Modifier,
                     valueTone: Color? = null) {
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
            Text(value, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = valueTone ?: tone,
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

/** Three figures on a phone square give each label about 45dp, so there the name
 *  wraps rather than truncates and the box is tighter all round. */
@Composable
private fun StockFigure(label: String, value: String, tone: Color, compact: Boolean,
                        modifier: Modifier, sub: String = "") {
    Column(modifier.padding(horizontal = if (compact) 6.dp else 10.dp)) {
        Text(label, fontSize = if (compact) 9.5.sp else 11.sp,
            maxLines = if (compact) 2 else 1, overflow = TextOverflow.Ellipsis,
            lineHeight = if (compact) 11.sp else 13.sp,
            modifier = if (compact) Modifier.height(22.dp) else Modifier,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontSize = if (compact) 15.sp else 18.sp, fontWeight = FontWeight.ExtraBold,
            color = tone, maxLines = 1, overflow = TextOverflow.Ellipsis)
        // A quieter second figure under the value — what those items are worth.
        if (sub.isNotEmpty()) {
            Text(sub, fontSize = if (compact) 9.sp else 10.5.sp, maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** One of the two stock holdings that are not free shelf: what it is, how many
 *  items, and what they are worth. The name stays dark and only the figures take
 *  the tone — a whole row in one colour reads as an alert. */
@Composable
private fun Holding(
    icon: ImageVector, label: String, count: Int, value: String, tone: Color,
    t: (String) -> String, compact: Boolean, modifier: Modifier
) {
    Row(
        modifier.padding(horizontal = if (compact) 8.dp else 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(if (compact) 7.dp else 10.dp)
    ) {
        Box(
            Modifier.size(if (compact) 26.dp else 30.dp).background(tone.copy(alpha = 0.15f), CircleShape),
            contentAlignment = Alignment.Center
        ) { Icon(icon, null, Modifier.size(if (compact) 13.dp else 15.dp), tone) }
        Column(Modifier.weight(1f)) {
            Text(label, fontSize = if (compact) 11.sp else 12.5.sp, fontWeight = FontWeight.SemiBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("$count ${t("items")}", fontSize = if (compact) 9.5.sp else 11.sp,
                color = tone, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(value, fontSize = if (compact) 11.5.sp else 13.sp, fontWeight = FontWeight.ExtraBold,
            color = tone, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun StockDivider(compact: Boolean) {
    Box(
        Modifier.width(1.dp).height(if (compact) 30.dp else 34.dp)
            .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.25f))
    )
}

/** The stock mix as one bar — no legend, because the three figures above it are
 *  the legend. */
@Composable
private fun StockBar(segments: List<Pair<Int, Color>>, height: androidx.compose.ui.unit.Dp) {
    val total = segments.sumOf { it.first }.coerceAtLeast(1)
    Row(Modifier.fillMaxWidth().height(height), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        segments.forEach { (count, colour) ->
            if (count > 0) {
                Box(
                    Modifier.weight(count.toFloat() / total)
                        .fillMaxHeight()
                        .background(colour, RoundedCornerShape(999.dp))
                )
            }
        }
    }
}

/** The sheet capitalises this card's label. Done here rather than as a second
 *  dictionary entry beside "total value" — a no-op in the scripts that have no
 *  case, correct in the ones that do. */
private fun String.homeCapitalisedFirst(): String =
    replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }

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
    inventory: StudioInventorySummary?, inventoryFailed: Boolean,
    inventoryItems: List<StudioInventoryItem>, compact: Boolean, t: (String) -> String
) {
    if (inventoryFailed) {
        Text(t("This could not be loaded."), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    val summary = inventory ?: run {
        Text(t("Loading…"), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant); return
    }
    if (size == HomeCardSize.OneByOne) {
        Column(Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(if (compact) 8.dp else 12.dp)) {
            // The sheet reads: what the stock is worth, then the three counts
            // that say whether it needs attention, then the mix as one bar.
            // Reserved is the third — stock that is spoken for is not stock you
            // can sell.
            val items = summary.uniqueCount + summary.quantityCount
            val healthy = (items - summary.lowStockCount - summary.incomingCount - summary.reservedCount)
                .coerceAtLeast(0)
            Text(t("total value").homeCapitalisedFirst(), fontSize = if (compact) 10.5.sp else 13.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(money(summary.totalValue, state), fontSize = if (compact) 20.sp else 32.sp,
                fontWeight = FontWeight.ExtraBold, color = HomeTone.indigo,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.weight(1f))
            HomeDivider()
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                StockFigure(t("low stock"), "${summary.lowStockCount}",
                    if (summary.lowStockCount > 0) HomeTone.red else Color.Unspecified,
                    compact, Modifier.weight(1f))
                StockDivider(compact)
                StockFigure(t("incoming"), "${summary.incomingCount}",
                    if (summary.incomingCount > 0) HomeTone.orange else Color.Unspecified,
                    compact, Modifier.weight(1f))
                StockDivider(compact)
                StockFigure(t("Reserved"), "${summary.reservedCount}",
                    if (summary.reservedCount > 0) HomeTone.orange else Color.Unspecified,
                    compact, Modifier.weight(1f))
            }
            if (items > 0) {
                StockBar(
                    listOf(
                        healthy to HomeTone.green,
                        summary.incomingCount to HomeTone.orange,
                        summary.lowStockCount to HomeTone.red,
                        summary.reservedCount to HomeTone.slate
                    ),
                    if (compact) 6.dp else 9.dp
                )
            }
        }
        return
    }
    if (size == HomeCardSize.TwoByOne) {
        // The sheet's wide card: what the stock is worth and how it splits,
        // ruled apart, then the two holdings that are not free stock — reserved
        // against orders, and what is still on its way. Both carry their count
        // AND their value; a bare amount does not say how much of the shelf it
        // is.
        Column(Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(if (compact) 6.dp else 10.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                StockFigure(t("total value"), money(summary.totalValue, state), HomeTone.indigo,
                    compact, Modifier.weight(1.4f))
                StockDivider(compact)
                StockFigure(t("Unique items"), "${summary.uniqueCount}", Color.Unspecified,
                    compact, Modifier.weight(1f), sub = money(summary.uniqueValue, state))
                StockDivider(compact)
                StockFigure(t("Quantity stock"), "${summary.quantityCount}", Color.Unspecified,
                    compact, Modifier.weight(1f), sub = money(summary.quantityValue, state))
                StockDivider(compact)
                StockFigure(t("low stock"), "${summary.lowStockCount}",
                    if (summary.lowStockCount > 0) HomeTone.red else Color.Unspecified,
                    compact, Modifier.weight(0.7f))
            }
            Spacer(Modifier.weight(1f))
            HomeDivider()
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Holding(Icons.Filled.ShoppingCart, t("Reserved"), summary.reservedCount,
                    money(summary.reservedValue, state), HomeTone.orange, t, compact, Modifier.weight(1f))
                StockDivider(compact)
                Holding(Icons.Filled.LocalShipping, t("incoming"), summary.incomingCount,
                    money(summary.incomingValue, state), HomeTone.green, t, compact, Modifier.weight(1f))
            }
        }
        return
    }

    // The sheet's big card: the four figures, then how the value splits, then
    // what actually needs a decision — worst first, because a card that only
    // counts problems cannot be acted on.
    val total = summary.uniqueValue + summary.quantityValue
    val share = if (total > 0) (summary.uniqueValue / total).toFloat() else 0f
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(if (compact) 6.dp else 10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(if (compact) 5.dp else 10.dp)) {
            StockTile(t("total value"), money(summary.totalValue, state), HomeTone.indigo,
                compact, Modifier.weight(1f))
            StockTile(t("Unique items"), "${summary.uniqueCount}", HomeTone.accent,
                compact, Modifier.weight(1f), sub = money(summary.uniqueValue, state))
            StockTile(t("Quantity stock"), "${summary.quantityCount}", HomeTone.accent,
                compact, Modifier.weight(1f), sub = money(summary.quantityValue, state))
            StockTile(t("low stock"), "${summary.lowStockCount}",
                if (summary.lowStockCount > 0) HomeTone.red else HomeTone.accent,
                compact, Modifier.weight(1f))
        }
        HomePanel(compact = compact) {
            Row(verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(if (compact) 10.dp else 16.dp)) {
                HomeDonut(share, diameter = if (compact) 46.dp else 74.dp)
                StockFigure(t("Unique items"), money(summary.uniqueValue, state), Color.Unspecified,
                    compact, Modifier.weight(1f))
                StockDivider(compact)
                StockFigure(t("Quantity stock"), money(summary.quantityValue, state), Color.Unspecified,
                    compact, Modifier.weight(1f))
            }
        }
        HomePanel(compact = compact) {
            HomeEyebrow(t("Needs attention"))
            val attention = stockAttention(inventoryItems)
            if (attention.isEmpty()) {
                Text(t("Nothing here yet."), fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                attention.forEachIndexed { index, entry ->
                    AttentionRow(entry.first, entry.second, t, compact)
                    if (index < attention.lastIndex) HomeDivider()
                }
            }
        }
        Spacer(Modifier.weight(1f))
    }
}

/** One of the four figures across the top of the stock card: the name above the
 *  number, because side by side in a phone tile the name collapses to "t…". */
@Composable
private fun StockTile(
    label: String, value: String, tone: Color, compact: Boolean,
    modifier: Modifier, sub: String = ""
) {
    Column(
        modifier
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f),
                RoundedCornerShape(if (compact) 9.dp else 12.dp))
            .padding(horizontal = if (compact) 5.dp else 10.dp, vertical = if (compact) 6.dp else 9.dp),
        verticalArrangement = Arrangement.spacedBy(1.dp)
    ) {
        Text(label, fontSize = if (compact) 8.5.sp else 11.sp, maxLines = 2,
            overflow = TextOverflow.Ellipsis, lineHeight = if (compact) 10.sp else 13.sp,
            modifier = if (compact) Modifier.height(20.dp) else Modifier,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontSize = if (compact) 12.sp else 17.sp, fontWeight = FontWeight.ExtraBold,
            color = tone, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (sub.isNotEmpty() && !compact) {
            Text(sub, fontSize = 10.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** Worst first: nothing on the shelf, then spoken for, then still on its way.
 *  The counts above say how many; this says which. */
private fun stockAttention(items: List<StudioInventoryItem>): List<Pair<StudioInventoryItem, String>> =
    items.mapNotNull { item ->
        when {
            item.lowStockAt > 0 && item.onHand <= item.lowStockAt -> item to "low"
            item.reserved > 0 -> item to "reserved"
            item.incoming > 0 -> item to "incoming"
            else -> null
        }
    }.sortedBy { listOf("low", "reserved", "incoming").indexOf(it.second) }.take(3)

@Composable
private fun AttentionRow(
    item: StudioInventoryItem, kind: String, t: (String) -> String, compact: Boolean
) {
    val label = when (kind) {
        "low" -> t("Low stock")
        "reserved" -> t("Reserved")
        else -> t("Incoming")
    }
    val tone = if (kind == "low") HomeTone.red else HomeTone.orange
    Row(
        Modifier.fillMaxWidth().padding(vertical = if (compact) 2.dp else 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(if (compact) 7.dp else 10.dp)
    ) {
        Box(Modifier.size(if (compact) 22.dp else 28.dp)) {
            OrderThumb(item.photos.firstOrNull().orEmpty(), item.name)
        }
        Text(item.name, fontSize = if (compact) 11.sp else 12.5.sp, fontWeight = FontWeight.SemiBold,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        HomeChip(label, tone)
        Text(item.location.ifEmpty { "—" }, fontSize = if (compact) 10.sp else 11.5.sp,
            maxLines = 1, overflow = TextOverflow.Ellipsis,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
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
private fun HomeCustomersBody(size: HomeCardSize, state: StudioFlowUiState, compact: Boolean, t: (String) -> String) {
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
        Column(Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(if (compact) 8.dp else 12.dp)) {
            Text(t("customers"), fontSize = if (compact) 11.sp else 13.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("${customers.size}", fontSize = if (compact) 26.sp else 34.sp, fontWeight = FontWeight.ExtraBold)
            Spacer(Modifier.weight(1f))
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

@Composable
private fun StageDivider() {
    Box(Modifier.width(1.dp).height(32.dp)
        .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)))
}

private data class Quad(val label: String, val count: Int, val tone: Color, val icon: ImageVector)

/** The whole board as one bar: a segment per stage, sized by how many sit in it.
 *  The counts above name every stage, so the bar is the shape of the work rather
 *  than the only place the split is stated (§20). */
@Composable
private fun StageBar(stages: List<ProductionStage>, resolved: List<Pair<StudioOrder, uk.co.eggcraft.studioflow.features.production.ResolvedProductionStage>>) {
    val counts = stages.map { stage -> stage to resolved.count { it.second.stageId == stage.id } }
        .filter { it.second > 0 }
    val total = maxOf(1, counts.sumOf { it.second })
    Row(
        Modifier.fillMaxWidth().height(7.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        counts.forEach { (stage, count) ->
            Box(
                Modifier
                    .weight(count.toFloat() / total)
                    .fillMaxHeight()
                    .background(stageTone(stage.kind), RoundedCornerShape(999.dp))
            )
        }
    }
}

/** A stage's colour follows its kind, not its position — a workspace may define
 *  any number of lanes and an index-keyed palette runs out. */
/** The mark for each lane. Finished work is not a bottleneck, so the flow leaves
 *  the Done lane out — the card is about what still needs a decision. */
private fun stageSymbol(kind: ProductionStageKind): ImageVector = when (kind) {
    ProductionStageKind.Ready -> Icons.Filled.CheckCircle
    ProductionStageKind.Active -> Icons.Filled.Build
    ProductionStageKind.Blocked -> Icons.Filled.Schedule
    ProductionStageKind.Review -> Icons.Filled.Search
    ProductionStageKind.ShipReady -> Icons.Filled.LocalShipping
    ProductionStageKind.Done -> Icons.Filled.CheckCircle
}

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
    stages: List<ProductionStage>, compact: Boolean, t: (String) -> String
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
        // The sheet reads top to bottom: how many are live, then how they are
        // split, then the split as one bar. The wide-screen square has room for
        // each count's name; on a phone the label would not survive the width,
        // so the mark carries it instead.
        val readyIds = stages.filter { it.kind == ProductionStageKind.Ready }.map { it.id }.toSet()
        val activeIds = stages.filter { it.kind == ProductionStageKind.Active }.map { it.id }.toSet()
        val counts = listOf(
            Quad(t("Ready"), resolved.count { it.second.stageId in readyIds }, HomeTone.green, Icons.Filled.CheckCircle),
            Quad(t("In production"), resolved.count { it.second.stageId in activeIds }, HomeTone.accent, Icons.Filled.Build),
            Quad(t("Ready to ship"), resolved.count { it.second.stageId in shipReadyIds }, HomeTone.green, Icons.Filled.LocalShipping),
            Quad(t("Overdue"), late.size, if (late.isEmpty()) HomeTone.slate else HomeTone.red, Icons.Filled.Schedule)
        )
        Column(Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(if (compact) 8.dp else 12.dp)) {
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("${live.size}", fontSize = if (compact) 30.sp else 38.sp,
                    fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(t("active orders"), fontSize = if (compact) 12.sp else 14.sp, maxLines = 1,
                    overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(bottom = 4.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.weight(1f))
            Row(horizontalArrangement = Arrangement.spacedBy(if (compact) 5.dp else 8.dp)) {
                counts.forEach { entry ->
                    Column(
                        Modifier
                            .weight(1f)
                            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f),
                                RoundedCornerShape(if (compact) 9.dp else 12.dp))
                            .padding(vertical = if (compact) 5.dp else 10.dp, horizontal = 3.dp)
                            .semantics { contentDescription = "${entry.label}: ${entry.count}" },
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(if (compact) 2.dp else 5.dp)
                    ) {
                        if (!compact) {
                            Text(entry.label, fontSize = 11.sp, maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text("${entry.count}", fontSize = if (compact) 14.sp else 23.sp,
                            fontWeight = FontWeight.ExtraBold, color = entry.tone, maxLines = 1)
                        Icon(entry.icon, null, Modifier.size(if (compact) 12.dp else 16.dp), entry.tone)
                    }
                }
            }
            Spacer(Modifier.weight(1f))
            StageBar(stages, resolved)
        }
        return
    }
    if (size == HomeCardSize.TwoByOne && compact) {
        // The sheet gives the wide phone card four counts and then the orders that
        // need a decision. Six stage circles with their names underneath truncated
        // every name on a phone.
        val readyIds = stages.filter { it.kind == ProductionStageKind.Ready }.map { it.id }.toSet()
        val activeIds = stages.filter { it.kind == ProductionStageKind.Active }.map { it.id }.toSet()
        val priority = (late + live.filterNot { o -> late.any { it.id == o.id } }).take(2)
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                BankFigure(t("Ready"), "${resolved.count { it.second.stageId in readyIds }}",
                    HomeTone.green, Modifier.weight(1f))
                StageDivider()
                BankFigure(t("In production"), "${resolved.count { it.second.stageId in activeIds }}",
                    HomeTone.accent, Modifier.weight(1f))
                StageDivider()
                BankFigure(t("Ready to ship"), "${resolved.count { it.second.stageId in shipReadyIds }}",
                    HomeTone.green, Modifier.weight(1f))
                StageDivider()
                BankFigure(t("Overdue"), "${late.size}",
                    if (late.isEmpty()) MaterialTheme.colorScheme.onSurface else HomeTone.red, Modifier.weight(1f))
            }
            Spacer(Modifier.height(8.dp)); HomeDivider(); Spacer(Modifier.height(4.dp))
            priority.forEach { order ->
                val stage = stages.firstOrNull { st -> st.id == resolved.first { it.first.id == order.id }.second.stageId }
                val due = homeDueDate(order.paymentDate, order.deliveryTime)
                val overdue = due.before(Date())
                Row(Modifier.fillMaxWidth().padding(vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(order.customerName.ifEmpty { order.designName }, fontSize = 12.sp,
                            fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (order.designName.isNotEmpty()) {
                            Text(order.designName, fontSize = 10.5.sp, maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    if (overdue) {
                        val days = ((Date().time - due.time) / 86_400_000L).toInt()
                        HomeChip(if (days > 0) t("{days}d late").replace("{days}", "$days") else t("Overdue"),
                            HomeTone.red)
                    }
                    if (stage != null) HomeChip(t(stage.title), stageTone(stage.kind))
                }
            }
        }
        return
    }

    if (size == HomeCardSize.TwoByOne) {
        // The sheet's wide card: the stages as figures ruled apart, then the
        // orders that actually need a decision. Done is left out — finished work
        // is not a bottleneck, and its lane only narrowed the five that are.
        val lanes = stages.filter { it.kind != ProductionStageKind.Done }
        val priority = (late + live.filterNot { o -> late.any { it.id == o.id } }).take(3)
        // How many orders fit is the card's business, not a guess: a 2x1 is two
        // squares wide by ONE tall, and that one square is as short as 185dp in a
        // half-width window. The lanes are the card's job; the list gives up rows
        // until it fits.
        BoxWithConstraints(Modifier.fillMaxSize()) {
        val roomForRows = ((maxHeight.value - LANES_HEIGHT - 12f) / ORDER_ROW_HEIGHT).toInt()
        val shown = priority.take(roomForRows.coerceIn(0, 3))
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                lanes.forEachIndexed { index, stage ->
                    if (index > 0) {
                        Box(Modifier.width(1.dp).height(46.dp)
                            .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)))
                    }
                    LaneFigure(t(stage.title), resolved.count { it.second.stageId == stage.id },
                        stageTone(stage.kind), Modifier.weight(1f))
                }
            }
            if (shown.isNotEmpty()) HomeDivider()
            shown.forEachIndexed { index, order ->
                val stage = stages.firstOrNull { st -> st.id == resolved.first { it.first.id == order.id }.second.stageId }
                val due = homeDueDate(order.paymentDate, order.deliveryTime)
                val overdue = due.before(Date())
                val name = order.customerName.ifEmpty { order.designName }
                Row(Modifier.fillMaxWidth().padding(vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OrderThumb(order.designLink, name)
                    Text(name, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold,
                        maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text(order.designName, fontSize = 13.sp, maxLines = 1,
                        overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (overdue) {
                        val days = ((Date().time - due.time) / 86_400_000L).toInt()
                        HomeChip(if (days > 0) t("{days}d late").replace("{days}", "$days") else t("Overdue"),
                            HomeTone.red)
                    }
                    if (stage != null) HomeChip(t(stage.title), stageTone(stage.kind))
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, Modifier.size(16.dp),
                        MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f))
                }
                if (index < shown.lastIndex) HomeDivider()
            }
            Spacer(Modifier.weight(1f))
        }
        }
        return
    }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (size == HomeCardSize.TwoByTwo) {
            Row(horizontalArrangement = Arrangement.spacedBy(if (compact) 7.dp else 8.dp)) {
                if (compact) {
                    // The square has no room for the tall tile; the slim one
                    // carries the same two figures in half the height.
                    SlimTile(t("Active orders"), "${live.size}", HomeTone.accent,
                        Icons.AutoMirrored.Filled.ListAlt, Modifier.weight(1f))
                    SlimTile(t("Overdue"), "${late.size}",
                        if (late.isEmpty()) HomeTone.accent else HomeTone.red,
                        Icons.Filled.Schedule, Modifier.weight(1f))
                } else {
                    HomeMetricTile(t("Active orders"), "${live.size}", HomeTone.accent,
                        modifier = Modifier.weight(1f), icon = Icons.AutoMirrored.Filled.ListAlt)
                    HomeMetricTile(t("Overdue"), "${late.size}",
                        if (late.isEmpty()) HomeTone.accent else HomeTone.red,
                        modifier = Modifier.weight(1f), icon = Icons.Filled.Schedule)
                }
            }
        }
        HomeEyebrow(t("Production flow"))
        // Done is left out: finished work is not a bottleneck, and on a phone the
        // sixth lane was what pushed every name into an ellipsis.
        Row(Modifier.fillMaxWidth()) {
            stages.filter { it.kind != ProductionStageKind.Done }.forEach { stage ->
                val count = resolved.count { it.second.stageId == stage.id }
                val tone = stageTone(stage.kind)
                Column(Modifier.weight(1f).padding(horizontal = 1.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Box(Modifier.size(if (compact) 24.dp else 28.dp)
                        .background(tone.copy(alpha = 0.16f), CircleShape),
                        contentAlignment = Alignment.Center) {
                        Icon(stageSymbol(stage.kind), null,
                            Modifier.size(if (compact) 12.dp else 14.dp), tone)
                    }
                    Text(t(stage.title), fontSize = if (compact) 8.5.sp else 10.sp,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("$count", fontSize = if (compact) 13.sp else 15.sp,
                        fontWeight = FontWeight.ExtraBold, color = tone)
                }
            }
        }
        if (size == HomeCardSize.TwoByTwo) {
            // The panel is the flexible piece: the flow above it is a fixed
            // height and so are the tiles, so this is what gives when the
            // square runs short.
            HomePanel(compact = compact) {
                HomeEyebrow(t("Priority orders"))
                (late + live.filterNot { o -> late.any { it.id == o.id } })
                    .take(if (compact) 2 else 3).forEach { order ->
                    val due = homeDueDate(order.paymentDate, order.deliveryTime)
                    val overdue = due.before(Date())
                    val stage = stages.firstOrNull { st -> st.id == resolved.first { it.first.id == order.id }.second.stageId }
                    Row(Modifier.fillMaxWidth().padding(vertical = if (compact) 2.dp else 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Column(Modifier.weight(1f)) {
                            Text(order.customerName.ifEmpty { order.designName },
                                fontSize = if (compact) 11.5.sp else 12.sp,
                                fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            // One line on the square: the second was what tipped
                            // the content past the card.
                            if (!compact && order.designName.isNotEmpty()) {
                                Text(order.designName, fontSize = 10.sp, maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        if (stage != null) HomeChip(t(stage.title), stageTone(stage.kind))
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
        BoxWithConstraints {
            // The word "Order" costs a third of a phone row, and the "#1094"
            // beside it says the same thing on a card already headed Schedule.
            val roomForTheWord = maxWidth > 220.dp
            Column {
                val rows = upcoming.take(3)
                rows.forEachIndexed { index, (order, due) ->
                    val (label, tone) = homeDueChip(order.paymentDate, due, t)
                    val name = order.customerName.ifEmpty { order.designName }
                    val ref = order.watchRef.trim()
                    HomeDueRow(
                        reference = homeOrderReference(ref, name, t, roomForTheWord),
                        name = if (ref.isEmpty()) "" else name,
                        chip = label, tone = tone
                    )
                    if (index < rows.size - 1) {
                        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
                    }
                }
            }
        }
        return
    }
    val week = weekDays()
    // "Upcoming" is what is still ahead. The timeline already carries the late
    // ones, and repeating them would spend the section on old news.
    val ahead = upcoming.filter { !it.second.before(startOfToday()) }.take(2)
    HomeWeekTimeline(
        week,
        upcoming.take(if (size == HomeCardSize.TwoByOne) 3 else 4),
        t,
        ahead = if (size == HomeCardSize.TwoByOne) emptyList() else ahead,
        large = size != HomeCardSize.TwoByOne
    )
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
private fun HomeFilesBody(size: HomeCardSize, state: StudioFlowUiState, compact: Boolean, t: (String) -> String) {
    // One file, linked to as many records as it belongs to — the card counts
    // files, never copies (§14).
    val files = state.orders.filter { !it.isDeleted }.flatMap { order -> order.clientFiles.map { order to it } }
    if (files.isEmpty()) {
        Text(t("Nothing here yet."), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    val used = files.sumOf { it.second.fileSize }
    val limitBytes = (state.workspace?.effectiveStorageLimitMB ?: 0L) * 1024 * 1024
    val pct = if (limitBytes > 0) ((used.toDouble() / limitBytes) * 100).toInt().coerceAtMost(100) else 0

    @Composable
    fun quota() {
        if (limitBytes <= 0) return
        Column(verticalArrangement = Arrangement.spacedBy(if (compact) 3.dp else 5.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${fileSize(used.toDouble())} ${t("of")} ${fileSize(limitBytes.toDouble())}",
                    fontSize = if (compact) 10.5.sp else 12.5.sp, maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.weight(1f))
                Text("$pct%", fontSize = if (compact) 10.5.sp else 12.5.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = if (pct >= 90) HomeTone.red else HomeTone.accent)
            }
            HomeProgressBar(pct / 100f, tint = if (pct >= 90) HomeTone.red else HomeTone.accent)
        }
    }

    if (size == HomeCardSize.OneByOne) {
        // The square asks the same question as the wide card — how full is this
        // workspace, and what landed recently. "File library" was the file count
        // again under a second name.
        Column(Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(if (compact) 4.dp else 8.dp)) {
            quota()
            if (!compact) HomeEyebrow(t("Recent"))
            files.take(2).forEach { (order, file) -> FileRow(file, order, t, compact, stacked = true) }
            Spacer(Modifier.weight(1f))
        }
        return
    }
    if (size == HomeCardSize.TwoByOne) {
        // The sheet leads with how full the workspace is, not how many bytes it
        // holds: a size on its own says nothing without the plan's ceiling.
        Column(Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(if (compact) 5.dp else 9.dp)) {
            quota()
            // The eyebrow goes first on a phone — the card is called Files and
            // the rows are plainly the recent ones, so it was the line carrying
            // the least.
            if (!compact) HomeEyebrow(t("Recent files"))
            files.take(3).forEach { (order, file) -> FileRow(file, order, t, compact) }
            Spacer(Modifier.weight(1f))
        }
        return
    }

    // The sheet's three figures: how many, how full, and how many are floating
    // free. The last is the only one that asks for anything to be done, so it
    // gets the banner and the way to do it. Every file here comes FROM an order,
    // so none are unlinked — the figure stays honest at zero rather than
    // counting the wrong thing.
    val unlinked = files.filter { it.first.id.isEmpty() }
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(if (compact) 6.dp else 10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(if (compact) 5.dp else 10.dp)) {
            StockTile(t("files"), "${files.size}", HomeTone.accent, compact, Modifier.weight(1f))
            StockTile(t("Storage"), if (limitBytes > 0) "$pct%" else fileSize(used.toDouble()),
                if (pct >= 90) HomeTone.red else HomeTone.green, compact, Modifier.weight(1f),
                sub = if (limitBytes > 0) "${fileSize(used.toDouble())} ${t("of")} ${fileSize(limitBytes.toDouble())}" else "")
            StockTile(t("Unlinked"), "${unlinked.size}",
                if (unlinked.isEmpty()) HomeTone.accent else HomeTone.orange, compact, Modifier.weight(1f))
        }
        HomePanel(compact = compact) {
            HomeEyebrow(t("Recent files"))
            files.take(4).forEach { (order, file) -> FileRow(file, order, t, compact) }
        }
        if (unlinked.isNotEmpty()) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(HomeTone.orange.copy(alpha = 0.12f), RoundedCornerShape(11.dp))
                    .border(1.dp, HomeTone.orange.copy(alpha = 0.28f), RoundedCornerShape(11.dp))
                    .padding(horizontal = if (compact) 9.dp else 12.dp, vertical = if (compact) 6.dp else 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(if (compact) 7.dp else 9.dp)
            ) {
                Icon(Icons.Filled.Link, null, Modifier.size(if (compact) 13.dp else 15.dp), HomeTone.orange)
                Text(t("{count} files are not linked to a record.").replace("{count}", "${unlinked.size}"),
                    fontSize = if (compact) 10.5.sp else 12.sp, fontWeight = FontWeight.SemiBold,
                    color = HomeTone.orange, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f))
                Text(t("Review"), fontSize = if (compact) 10.sp else 11.5.sp,
                    fontWeight = FontWeight.ExtraBold, color = HomeTone.orange)
            }
        }
        Spacer(Modifier.weight(1f))
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
private fun HomeNotesBody(
    size: HomeCardSize, state: StudioFlowUiState, compact: Boolean,
    /** Opens the Notes tab — the same route the + in the header takes. */
    onNewNote: () -> Unit, t: (String) -> String
) {
    // Notes only. Not files, not AI replies (§13). Pinned first.
    val live = state.keepNotes.filter { !it.isDeleted && !it.isArchived }
    if (live.isEmpty()) {
        Text(t("Nothing here yet."), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    val pinned = live.filter { it.isPinned }
    val recent = live.filterNot { it.isPinned }.sortedByDescending { it.updatedAt?.time ?: 0L }
    if (size == HomeCardSize.TwoByTwo) {
        Column(verticalArrangement = Arrangement.spacedBy(if (compact) 5.dp else 7.dp)) {
            // The sheet opens this card with somewhere to start typing. A
            // button, not a field: the composer lives on the Notes screen and
            // two places to draft the same note is one too many.
            Box(
                Modifier
                    .fillMaxWidth()
                    .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.3f),
                        RoundedCornerShape(if (compact) 9.dp else 11.dp))
                    .clickable(onClick = onNewNote)
                    .padding(horizontal = if (compact) 10.dp else 12.dp,
                        vertical = if (compact) 6.dp else 9.dp)
            ) {
                Text(t("Take a note…"), fontSize = if (compact) 11.sp else 12.5.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (pinned.isNotEmpty()) {
                HomeEyebrow(t("Pinned"))
                NoteGrid(pinned.take(2), t, compact)
            }
            HomeEyebrow(t("Recent"))
            // Rows rather than tiles: at this size the title and the one fact
            // beside it are what fit, and a row fits three where a tile fits two.
            Column(verticalArrangement = Arrangement.spacedBy(if (compact) 4.dp else 6.dp)) {
                recent.take(if (pinned.isEmpty()) 5 else 3).forEach { note ->
                    NoteRow(note, t, compact)
                }
            }
        }
    } else {
        // Three across on the wide card, as the sheet lays them out.
        val columns = if (size == HomeCardSize.OneByOne) 1 else 3
        NoteGrid((pinned + recent).take(if (columns == 1) 2 else 3), t, compact, columns = columns)
    }
}

@Composable
private fun NoteGrid(
    notes: List<StudioKeepNote>, t: (String) -> String, compact: Boolean, columns: Int = 2
) {
    val gap = if (compact) 5.dp else 8.dp
    Column(verticalArrangement = Arrangement.spacedBy(gap)) {
        notes.chunked(columns).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                pair.forEach { NoteTile(it, t, compact, Modifier.weight(1f)) }
                repeat(columns - pair.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

/** A note keeps its own colour — that is the note's, not the card's. */
@Composable
private fun NoteTile(note: StudioKeepNote, t: (String) -> String, compact: Boolean, modifier: Modifier) {
    val radius = RoundedCornerShape(if (compact) 10.dp else 12.dp)
    Box(modifier) {
        Column(
            Modifier
                .fillMaxWidth()
                .background(noteColour(note.colorName), radius)
                .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f), radius)
                .padding(horizontal = if (compact) 8.dp else 10.dp, vertical = if (compact) 4.dp else 9.dp),
            // Two notes in a 162dp square leave about 46dp each, so the body
            // drops to one line and the type comes down.
            verticalArrangement = Arrangement.spacedBy(if (compact) 1.dp else 4.dp)
        ) {
            Text(note.title.ifEmpty { t("Untitled note") },
                fontSize = if (compact) 11.sp else 12.sp,
                fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                // Only a pinned note pays for the pin's corner: reserving it on
                // every note would cost the unpinned ones a word for nothing.
                modifier = Modifier.padding(end = if (note.isPinned) 14.dp else 0.dp))
            if (note.text.isNotEmpty()) {
                Text(note.text, fontSize = if (compact) 9.sp else 11.sp,
                    maxLines = if (compact) 1 else 2, overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            val chip = note.linkedOrderLabel.ifEmpty { note.linkedCustomerName }
            if (chip.isNotEmpty()) HomeChip(chip, noteAccent(note.colorName))
        }
        // Top right, out of the title's way — the sheet marks the corner rather
        // than pushing the heading along.
        if (note.isPinned) {
            Icon(
                Icons.Filled.PushPin, null,
                Modifier.align(Alignment.TopEnd)
                    .padding(top = if (compact) 5.dp else 8.dp, end = if (compact) 6.dp else 9.dp)
                    .size(if (compact) 10.dp else 12.dp),
                noteAccent(note.colorName)
            )
        }
    }
}

/** The sheet's file row: what kind it is, its name, what it is attached to, and
 *  when it arrived — the last is what a person actually asks about an upload. */
@Composable
private fun FileRow(
    file: StudioClientFile, order: StudioOrder, t: (String) -> String, compact: Boolean,
    /** On a square the name and the chip cannot share a line — 162dp leaves the
     *  name about 55dp beside a chip, which is not a filename any more. */
    stacked: Boolean = false
) {
    val tone = fileTone(file.fileName)
    val ext = file.fileName.substringAfterLast('.', "").take(4).uppercase()
    Row(
        Modifier.fillMaxWidth().padding(vertical = if (compact) 2.dp else 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(if (compact) 7.dp else 10.dp)
    ) {
        Box(
            Modifier
                .size(if (compact) 20.dp else 28.dp)
                .background(tone.copy(alpha = 0.14f), RoundedCornerShape(if (compact) 5.dp else 7.dp)),
            contentAlignment = Alignment.Center
        ) {
            Text(ext, fontSize = if (compact) 6.5.sp else 8.sp, fontWeight = FontWeight.ExtraBold, color = tone)
        }
        val link = order.designName.ifEmpty { order.customerName }
        if (stacked) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(file.fileName, fontSize = if (compact) 9.5.sp else 12.sp,
                    fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (link.isNotEmpty()) HomeChip(link, HomeTone.accent)
            }
        } else {
            Text(file.fileName, fontSize = if (compact) 10.5.sp else 12.5.sp,
                fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f))
            if (link.isNotEmpty()) HomeChip(link, HomeTone.accent)
            Text(agoLabel(file.uploadedAt, t), fontSize = if (compact) 9.5.sp else 11.5.sp,
                maxLines = 1, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** "Just now" / "5 min ago" / "Today" / "Yesterday" / the date. */
private fun agoLabel(when_: Date?, t: (String) -> String): String {
    if (when_ == null) return ""
    val mins = ((Date().time - when_.time) / 60000L).toInt()
    if (mins < 1) return t("Just now")
    if (mins < 60) return "$mins ${t("min ago")}"
    val days = ((startOfToday().time - when_.time) / 86_400_000L).toInt()
    if (days <= 0) return t("Today")
    if (days == 1) return t("Yesterday")
    return SimpleDateFormat("d MMM", Locale.getDefault()).format(when_)
}

/** What a note is about, and the one fact worth showing beside it: when it is
 *  due, or what it is attached to. Derived from the note — never invented. */
@Composable
private fun NoteRow(note: StudioKeepNote, t: (String) -> String, compact: Boolean) {
    val accent = noteAccent(note.colorName)
    val due = note.reminderDate
    val meta: Triple<ImageVector, String, Boolean> = when {
        due != null -> Triple(Icons.Filled.CalendarMonth, dayLabel(due, t), due.before(startOfToday()))
        note.linkedOrderLabel.isNotEmpty() -> Triple(Icons.Filled.DocumentScanner, note.linkedOrderLabel, false)
        note.linkedCustomerName.isNotEmpty() -> Triple(Icons.Filled.PersonAddAlt, note.linkedCustomerName, false)
        else -> Triple(Icons.Filled.Edit, "", false)
    }
    Row(
        Modifier
            .fillMaxWidth()
            .background(noteColour(note.colorName), RoundedCornerShape(if (compact) 9.dp else 10.dp))
            .padding(horizontal = if (compact) 8.dp else 10.dp, vertical = if (compact) 4.dp else 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(if (compact) 7.dp else 10.dp)
    ) {
        Box(
            Modifier.size(if (compact) 22.dp else 26.dp).background(accent.copy(alpha = 0.16f), CircleShape),
            contentAlignment = Alignment.Center
        ) { Icon(meta.first, null, Modifier.size(if (compact) 11.dp else 13.dp), accent) }
        Text(note.title.ifEmpty { t("Untitled note") },
            fontSize = if (compact) 11.sp else 12.5.sp, fontWeight = FontWeight.Bold,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        if (meta.second.isNotEmpty()) {
            Text(meta.second, fontSize = if (compact) 10.sp else 11.5.sp,
                fontWeight = FontWeight.SemiBold, maxLines = 1,
                color = if (meta.third) HomeTone.red else accent)
        }
    }
}

/** The chip on a coloured note takes that note's colour — grey on a tinted
 *  ground reads as disabled. */
private fun noteAccent(name: String): Color = when (name.lowercase()) {
    "yellow" -> Color(0xFF8A6100)
    "blue" -> Color(0xFF1D4ED8)
    "green" -> Color(0xFF15803D)
    "red" -> Color(0xFFB91C1C)
    "purple" -> Color(0xFF6D28D9)
    "orange" -> Color(0xFF9A3412)
    else -> HomeTone.slate
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
