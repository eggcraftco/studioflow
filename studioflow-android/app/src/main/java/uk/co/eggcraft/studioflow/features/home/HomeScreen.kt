package uk.co.eggcraft.studioflow.features.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.zIndex
import kotlin.math.roundToInt
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import android.net.ConnectivityManager
import android.net.Network
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import kotlinx.coroutines.awaitCancellation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import uk.co.eggcraft.studioflow.data.firebase.StudioFlowRepository
import uk.co.eggcraft.studioflow.data.model.StudioInventorySummary
import uk.co.eggcraft.studioflow.features.production.ProductionStage
import uk.co.eggcraft.studioflow.features.production.defaultProductionStages
import uk.co.eggcraft.studioflow.features.shell.StudioFlowUiState
import uk.co.eggcraft.studioflow.language.LocalStudioLanguage
import uk.co.eggcraft.studioflow.language.studioT
import java.util.Calendar
import java.util.Date

/**
 * Home: the screen that answers what needs attention, what is next, and where to
 * go for the detail. It reports and hands off; it never becomes a second, smaller
 * copy of Orders, Banking, Inventory, Schedule or Files.
 */

data class HomeAccess(
    val orders: Boolean = true,
    val dashboard: Boolean = true,
    val bankFeed: Boolean = true,
    val customers: Boolean = true,
    val schedule: Boolean = true,
    val files: Boolean = true,
    val notes: Boolean = true
) {
    fun allows(card: HomeCardDefinition): Boolean = when (card.access) {
        HomeCardAccess.Always -> true
        HomeCardAccess.Orders -> orders
        HomeCardAccess.Dashboard -> dashboard
        HomeCardAccess.BankFeed -> bankFeed
        HomeCardAccess.Customers -> customers
        HomeCardAccess.Schedule -> schedule
        HomeCardAccess.Files -> files
        HomeCardAccess.Notes -> notes
    }
}

// One row's height and the gutter between cards. The grid places cards at fixed
// offsets, so the row has to be the height the tallest card actually needs — a
// row shorter than its content does not shrink the card, it clips it.
private const val CARD_UNIT_HEIGHT = 236
private const val CARD_GAP = 16

@Composable
fun HomeScreen(
    state: StudioFlowUiState,
    access: HomeAccess,
    onOpenSection: (String) -> Unit,
    onNewOrder: () -> Unit,
    modifier: Modifier = Modifier
) {
    val lang = LocalStudioLanguage.current
    val t: (String) -> String = { studioT(it, lang) }
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current
    val repository = remember { StudioFlowRepository() }
    val workspaceId = state.workspace?.id.orEmpty()
    val userId = state.user?.uid.orEmpty()

    var layout by remember { mutableStateOf(HomeLayout.standard) }
    // The layout as the server last accepted it, so a failed save can be undone.
    var lastSaved by remember { mutableStateOf(HomeLayout.standard) }
    var customising by remember { mutableStateOf(false) }
    var saveFailed by remember { mutableStateOf(false) }
    var renaming by remember { mutableStateOf<HomeCardId?>(null) }
    // Long-press drag, offered only in Customise mode: outside it a long press on
    // a card should leave the page free to scroll.
    var draggingId by remember { mutableStateOf<HomeCardId?>(null) }
    var dragOffset by remember { mutableStateOf(Offset.Zero) }
    var renameText by remember { mutableStateOf("") }
    var inventory by remember { mutableStateOf<StudioInventorySummary?>(null) }
    var inventoryFailed by remember { mutableStateOf(false) }
    var loadedAtMillis by remember { mutableStateOf(0L) }
    var reloadKey by remember { mutableStateOf(0) }
    // §18 wants an offline label rather than a card that silently shows old
    // numbers as if they were current. The Firestore listeners keep serving
    // their cache; the screen just says so.
    val context = LocalContext.current
    var offline by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        val manager = context.getSystemService(ConnectivityManager::class.java)
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { offline = false }
            override fun onLost(network: Network) { offline = true }
        }
        offline = manager?.activeNetwork == null
        runCatching { manager?.registerDefaultNetworkCallback(callback) }
        try { awaitCancellation() } finally { runCatching { manager?.unregisterNetworkCallback(callback) } }
    }
    // Stages are the workspace's own, fetched once: the Orders & production card
    // derives each order's stage from them rather than storing one.
    var stages by remember { mutableStateOf(defaultProductionStages) }

    LaunchedEffect(workspaceId, userId) {
        if (workspaceId.isBlank() || userId.isBlank()) return@LaunchedEffect
        repository.homeLayoutFlow(workspaceId, userId).collect { stored ->
            val next = HomeLayout.decode(stored)
            lastSaved = next
            layout = next
        }
    }

    LaunchedEffect(workspaceId, reloadKey) {
        if (workspaceId.isBlank()) return@LaunchedEffect
        inventory = runCatching { repository.inventorySummary(workspaceId) }
            .onFailure { inventoryFailed = true }
            .getOrNull()
        runCatching { repository.productionStages(workspaceId) }
            .getOrNull()
            ?.takeIf { it.isNotEmpty() }
            ?.let { stages = it }
        loadedAtMillis = System.currentTimeMillis()
    }

    /**
     * Optimistic (§19): the grid moves under the hand immediately and the write
     * follows. If the write fails the previous layout comes back, because a card
     * that appears to move and silently does not is worse than one that refuses.
     */
    fun commit(next: HomeLayout) {
        val previous = lastSaved
        layout = next
        saveFailed = false
        scope.launch {
            runCatching { repository.saveHomeLayout(workspaceId, next.encode()) }
                .onSuccess { lastSaved = next }
                .onFailure {
                    layout = previous
                    saveFailed = true
                }
        }
    }

    val visible = layout.cards.filter { placement ->
        HomeCards.definition(placement.id)?.let { access.allows(it) } == true
    }
    val gallery = HomeCards.all.filter { definition ->
        layout.cards.none { it.id == definition.id } && access.allows(definition)
    }

    // §17: phone is a single column of full-width cards; tablets get two, wide
    // tablets three. A shrunken desktop grid is explicitly not wanted.

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text(t("Home"), fontSize = 26.sp, fontWeight = FontWeight.ExtraBold)
                Text(homeGreeting(t, state.user?.displayName.orEmpty()),
                    fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(t("Here's what needs your attention today."),
                    fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    when {
                        offline -> t("Offline — showing the last data this device had.")
                        loadedAtMillis == 0L -> t("Loading…")
                        else -> "${t("Updated")} ${
                            ((System.currentTimeMillis() - loadedAtMillis) / 60000L).coerceAtLeast(1L)
                        } ${t("min ago")}"
                    },
                    fontSize = 10.sp,
                    maxLines = 2,
                    textAlign = TextAlign.End,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.clickable { reloadKey += 1 }
                )
                OutlinedButton(onClick = { customising = !customising }) {
                    Text(if (customising) t("Done") else t("Customise"), fontSize = 12.sp)
                }
            }
        }

        if (saveFailed) {
            Text(
                t("That change could not be saved. Your previous layout is back."),
                fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFFDC2626),
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0x14DC2626), RoundedCornerShape(10.dp))
                    .padding(10.dp)
            )
        }

        if (customising) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(Color(0x142563EB), RoundedCornerShape(10.dp))
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(t("Drag cards to rearrange. Use a card's menu to resize, recolour, rename or hide it."),
                    fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(onClick = { commit(HomeLayout.standard) }) {
                    Text(t("Reset layout"), fontSize = 12.sp)
                }
            }
        }

        // Measured, not assumed: the shell may put a navigation rail beside this
        // content on a tablet, and a grid sized from the raw screen width would
        // then run off the edge.
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val availableDp = maxWidth.value.toInt()
            // Two columns on a phone, so a pair of 1x1 cards sits side by side
            // instead of each one eating a whole screen. A 2x1 or 2x2 still fills
            // the width — it is drawn for two columns and there are exactly two.
            val columnCount = if (availableDp >= 840) 3 else 2
            val unit = (availableDp - CARD_GAP * (columnCount - 1)) / columnCount
            // On a phone the row IS the column width, so a 1x1 comes out square.
            val compact = availableDp < 600
            val rowHeight = if (compact) unit else CARD_UNIT_HEIGHT
            val rows = HomeGridLayout.rowCount(visible, columnCount)
            Box(
                Modifier
                    .fillMaxWidth()
                    .height((rows * rowHeight + (rows - 1).coerceAtLeast(0) * CARD_GAP).dp)
            ) {
            HomeGridLayout.slots(visible, columnCount).forEach { slot ->
                val width = minOf(slot.placement.size.columns, columnCount)
                val cardWidth = unit * width + CARD_GAP * (width - 1)
                val span = slot.placement.size.rows
                val cardHeight = rowHeight * span + CARD_GAP * (span - 1)
                val definition = HomeCards.definition(slot.placement.id) ?: return@forEach
                val isDragging = draggingId == slot.placement.id
                Box(
                    Modifier
                        .offset(
                            x = ((unit + CARD_GAP) * slot.column).dp +
                                (if (isDragging) with(density) { dragOffset.x.toDp() } else 0.dp),
                            y = ((rowHeight + CARD_GAP) * slot.row).dp +
                                (if (isDragging) with(density) { dragOffset.y.toDp() } else 0.dp)
                        )
                        .zIndex(if (isDragging) 1f else 0f)
                        .alpha(if (isDragging) 0.75f else 1f)
                        .width(cardWidth.dp)
                        .height(cardHeight.dp)
                        .then(
                            if (!customising) Modifier
                            else Modifier.pointerInput(slot.placement.id, columnCount, visible.size) {
                                detectDragGesturesAfterLongPress(
                                    onDragStart = {
                                        draggingId = slot.placement.id
                                        dragOffset = Offset.Zero
                                    },
                                    onDrag = { change, amount ->
                                        change.consume()
                                        dragOffset += amount
                                    },
                                    onDragEnd = {
                                        // Where the card was let go, in grid cells.
                                        val cellWidth = (unit + CARD_GAP).toFloat()
                                        val cellHeight = (CARD_UNIT_HEIGHT + CARD_GAP).toFloat()
                                        val movedColumns = (dragOffset.x / density.density / cellWidth).roundToInt()
                                        val movedRows = (dragOffset.y / density.density / cellHeight).roundToInt()
                                        val steps = movedRows * columnCount + movedColumns
                                        val index = layout.cards.indexOfFirst { it.id == slot.placement.id }
                                        if (index >= 0 && steps != 0) {
                                            val target = (index + steps).coerceIn(0, layout.cards.size - 1)
                                            if (target != index) {
                                                val reordered = layout.cards.toMutableList()
                                                reordered.add(target, reordered.removeAt(index))
                                                commit(layout.copy(cards = reordered))
                                            }
                                        }
                                        draggingId = null
                                        dragOffset = Offset.Zero
                                    },
                                    onDragCancel = {
                                        draggingId = null
                                        dragOffset = Offset.Zero
                                    }
                                )
                            }
                        )
                ) {
                    HomeCardShell(
                        definition = definition,
                        placement = slot.placement,
                        customising = customising,
                        compact = compact,
                        t = t,
                        // The sheet names the load under the title on the wide
                        // phone card.
                        subtitle = if (definition.id == HomeCardId.OrdersProduction && compact &&
                            slot.placement.size == HomeCardSize.TwoByOne)
                            t("{count} active").replace("{count}",
                                "${state.orders.count { !it.isDeleted && !it.isDelivered && it.countsTowardBalance }}")
                        else "",
                        headerPill = if (definition.id == HomeCardId.Banking && state.bankTransactions.isNotEmpty())
                            t("Read-only") else "",
                        // The sheet puts the feed's freshness on the right of the
                        // header for the wide phone card, where the body has no
                        // row to spare.
                        headerNote = if (definition.id == HomeCardId.Banking && compact &&
                            slot.placement.size == HomeCardSize.TwoByOne && state.bankTransactions.isNotEmpty())
                            homeSyncLabel(state, t) else "",
                        onOpen = { onOpenSection(definition.destination) },
                        onResize = { size -> commit(layout.copy(cards = layout.cards.map {
                            if (it.id == slot.placement.id) it.copy(size = size) else it
                        })) },
                        onTone = { tone -> commit(layout.copy(cards = layout.cards.map {
                            if (it.id == slot.placement.id) it.copy(tone = tone) else it
                        })) },
                        onRename = { renameText = slot.placement.heading; renaming = slot.placement.id },
                        onHide = { commit(HomeLayout(
                            layout.cards.filter { it.id != slot.placement.id },
                            layout.hidden + slot.placement.id
                        )) },
                        onReset = { commit(layout.copy(cards = layout.cards.map {
                            if (it.id == slot.placement.id) it.copy(
                                size = definition.defaultSize, heading = "", tone = HomeCardTone.Standard
                            ) else it
                        })) },
                        onMove = { direction ->
                            val index = layout.cards.indexOfFirst { it.id == slot.placement.id }
                            if (index >= 0) {
                                val target = (index + direction).coerceIn(0, layout.cards.size - 1)
                                val reordered = layout.cards.toMutableList()
                                reordered.add(target, reordered.removeAt(index))
                                commit(layout.copy(cards = reordered))
                            }
                        }
                    ) {
                        HomeCardBody(
                            id = slot.placement.id,
                            size = slot.placement.size,
                            state = state,
                            access = access,
                            inventory = inventory,
                            inventoryFailed = inventoryFailed,
                            stages = stages,
                            compact = compact,
                            t = t,
                            onNewOrder = onNewOrder,
                            onOpenSection = onOpenSection
                        )
                    }
                }
            }
            }
        }

        if (customising && gallery.isNotEmpty()) {
            Text(t("Add a card"), fontSize = 13.sp, fontWeight = FontWeight.Bold)
            Row(
                Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                gallery.forEach { definition ->
                    OutlinedButton(onClick = {
                        commit(HomeLayout(
                            layout.cards + HomeCardPlacement(definition.id, definition.defaultSize),
                            layout.hidden.filter { it != definition.id }
                        ))
                    }) { Text("+ " + t(definition.title), fontSize = 11.sp) }
                }
            }
        }

        Spacer(Modifier.height(24.dp))
    }

    if (renaming != null) {
        val target = renaming
        AlertDialog(
            onDismissRequest = { renaming = null },
            title = { Text(t("Edit heading")) },
            text = {
                TextField(
                    value = renameText,
                    onValueChange = { if (it.length <= 40) renameText = it },
                    label = { Text(t("Card heading")) },
                    singleLine = true
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    if (target != null) {
                        commit(layout.copy(cards = layout.cards.map {
                            if (it.id == target) it.copy(heading = renameText.trim().take(40)) else it
                        }))
                    }
                    renaming = null
                }) { Text(t("Save")) }
            },
            dismissButton = {
                TextButton(onClick = { renaming = null }) { Text(t("Cancel")) }
            }
        )
    }
}

private fun homeGreeting(t: (String) -> String, displayName: String): String {
    val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    val key = when {
        hour < 12 -> "Good morning"
        hour < 18 -> "Good afternoon"
        else -> "Good evening"
    }
    val first = displayName.trim().split(" ").firstOrNull().orEmpty()
    return if (first.isEmpty()) t(key) else "${t(key)}, $first"
}

/**
 * §4's card anatomy, identical on every platform: icon, heading, the card's own
 * body, and exactly one footer link. The ⋯ menu carries everything customisation
 * needs so the card face stays about the data.
 */
@Composable
fun HomeCardShell(
    definition: HomeCardDefinition,
    placement: HomeCardPlacement,
    customising: Boolean,
    /** Phone layout: tighter header, no footer link on a 1x1, and the whole card
     *  is the tap target instead. */
    compact: Boolean = false,
    t: (String) -> String,
    /** A short line under the title — the load this card is reporting on. */
    subtitle: String = "",
    headerPill: String = "",
    /** A quiet line on the right of the header — how fresh the feed is. */
    headerNote: String = "",
    onOpen: () -> Unit,
    onResize: (HomeCardSize) -> Unit,
    onTone: (HomeCardTone) -> Unit,
    onRename: () -> Unit,
    onHide: () -> Unit,
    onReset: () -> Unit,
    onMove: (Int) -> Unit,
    content: @Composable () -> Unit
) {
    var menuOpen by remember { mutableStateOf(false) }
    // A square phone card has no room for a footer link, and it does not need
    // one: the card itself opens the screen it summarises.
    // No footer link on a phone at any size: the sheet draws a chevron in the
    // header instead, and the card already opens the screen it summarises.
    val hidesFooter = compact
    Card(
        Modifier
            .fillMaxSize()
            .then(if (hidesFooter && !customising) Modifier.clickable { onOpen() } else Modifier),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = if (customising) 4.dp else 1.dp)
    ) {
        Column(Modifier.fillMaxSize()) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(start = 14.dp, end = 2.dp, top = 12.dp, bottom = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (customising) {
                    HomeGripDots()
                    Spacer(Modifier.width(9.dp))
                }
                HomeBadge(
                    definition.icon,
                    if (placement.tone == HomeCardTone.Standard) HomeTone.accent else homeToneColor(placement.tone),
                    definition.filledBadge,
                    size = if (compact) 30.dp else 38.dp
                )
                Spacer(Modifier.width(if (compact) 8.dp else 10.dp))
                Column {
                    Text(
                        placement.heading.ifEmpty { t(definition.title) },
                        fontSize = if (compact) 13.5.sp else 14.5.sp, fontWeight = FontWeight.ExtraBold,
                        maxLines = 1, overflow = TextOverflow.Ellipsis
                    )
                    if (subtitle.isNotEmpty()) {
                        Text(subtitle, fontSize = 10.5.sp, maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                // While customising, a phone header carries the grip and the ⋯ as
                // well; the pill is a label you read, not something you move, so
                // it stands down and gives the title its width back.
                if (headerPill.isNotEmpty() && !(compact && customising)) {
                    Spacer(Modifier.width(7.dp))
                    // The promise sits beside the title, not in a footnote.
                    // softWrap = false, or a narrow card wraps the pill one letter
                    // per line — which is exactly what it did on a phone.
                    Text(
                        headerPill, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold,
                        color = HomeTone.orange, maxLines = 1, softWrap = false,
                        modifier = Modifier
                            .background(HomeTone.orange.copy(alpha = 0.16f), RoundedCornerShape(999.dp))
                            .padding(horizontal = 8.dp, vertical = 2.dp)
                    )
                }
                Spacer(Modifier.weight(1f))
                if (headerNote.isNotEmpty() && !(compact && customising)) {
                    Text(headerNote, fontSize = 10.sp, maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.width(6.dp))
                }
                // On a phone the ⋯ costs a quarter of the card's width. It appears
                // while customising, which is when it is wanted; the rest of the
                // time the card is a tap target.
                Box(Modifier.then(if (compact && !customising) Modifier.size(0.dp) else Modifier)) {
                    // §17 asks for at least 44dp of touch target; the glyph stays small.
                    if (!compact || customising) Box(
                        Modifier
                            .size(44.dp)
                            .clickable { menuOpen = true },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            Icons.Filled.MoreHoriz,
                            contentDescription = t("Card options"),
                            modifier = Modifier.size(20.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        Text(t("Resize"), fontSize = 10.sp, fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        definition.sizes.forEach { size ->
                            DropdownMenuItem(
                                text = { Text(if (size == placement.size) "✓ ${size.label}" else size.label) },
                                onClick = { onResize(size); menuOpen = false }
                            )
                        }
                        Text(t("Choose colour"), fontSize = 10.sp, fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        HomeCardTone.entries.forEach { tone ->
                            DropdownMenuItem(
                                text = { Text(t(tone.label)) },
                                onClick = { onTone(tone); menuOpen = false }
                            )
                        }
                        DropdownMenuItem(text = { Text(t("Move up")) }, onClick = { onMove(-1); menuOpen = false })
                        DropdownMenuItem(text = { Text(t("Move down")) }, onClick = { onMove(1); menuOpen = false })
                        DropdownMenuItem(text = { Text(t("Edit heading")) }, onClick = { onRename(); menuOpen = false })
                        DropdownMenuItem(text = { Text(t("Reset card")) }, onClick = { onReset(); menuOpen = false })
                        DropdownMenuItem(text = { Text(t("Hide card")) }, onClick = { onHide(); menuOpen = false })
                    }
                }
            }
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = if (compact) 13.dp else 14.dp)
                    .padding(bottom = if (hidesFooter) 12.dp else 0.dp)
            ) { content() }
            if (!hidesFooter) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable { onOpen() }
                        .padding(horizontal = 12.dp, vertical = 9.dp),
                    horizontalArrangement = Arrangement.End
                ) {
                    Text("${t(definition.linkLabel)} →", fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold, color = Color(0xFF2563EB))
                }
            }
        }
    }
}

fun homeToneColor(tone: HomeCardTone): Color = when (tone) {
    HomeCardTone.Standard -> Color(0xFF6B7280)
    HomeCardTone.Blue -> Color(0xFF2563EB)
    HomeCardTone.Green -> Color(0xFF16A34A)
    HomeCardTone.Amber -> Color(0xFFB45309)
    HomeCardTone.Purple -> Color(0xFF7C3AED)
    HomeCardTone.Rose -> Color(0xFFE11D48)
}

@Composable
fun HomeCardNote(text: String) {
    Text(text, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
fun HomeStat(label: String, value: String, tone: Color = Color.Unspecified) {
    Column(Modifier.width(84.dp)) {
        Text(label, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, maxLines = 1,
            overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            color = if (tone == Color.Unspecified) MaterialTheme.colorScheme.onSurface else tone)
    }
}

@Composable
fun HomeRow(title: String, detail: String, tone: Color = Color.Unspecified) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1,
            overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        Text(detail, fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 1,
            color = if (tone == Color.Unspecified) MaterialTheme.colorScheme.onSurfaceVariant else tone)
    }
}

@Composable
fun HomeProgress(fraction: Float) {
    LinearProgressIndicator(
        progress = { fraction },
        modifier = Modifier.fillMaxWidth().height(6.dp),
        color = Color(0xFF2563EB)
    )
}

