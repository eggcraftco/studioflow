package uk.co.eggcraft.studioflow.features.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import android.net.ConnectivityManager
import android.net.Network
import androidx.compose.ui.platform.LocalConfiguration
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

private const val CARD_UNIT_HEIGHT = 190
private const val CARD_GAP = 12

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
    val repository = remember { StudioFlowRepository() }
    val workspaceId = state.workspace?.id.orEmpty()
    val userId = state.user?.uid.orEmpty()

    var layout by remember { mutableStateOf(HomeLayout.standard) }
    // The layout as the server last accepted it, so a failed save can be undone.
    var lastSaved by remember { mutableStateOf(HomeLayout.standard) }
    var customising by remember { mutableStateOf(false) }
    var saveFailed by remember { mutableStateOf(false) }
    var renaming by remember { mutableStateOf<HomeCardId?>(null) }
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

    val configuration = LocalConfiguration.current
    // §17: phone is a single column of full-width cards; tablets get two, wide
    // tablets three. A shrunken desktop grid is explicitly not wanted.
    val columnCount = when {
        configuration.screenWidthDp >= 840 -> 3
        configuration.screenWidthDp >= 600 -> 2
        else -> 1
    }
    val gridWidth = configuration.screenWidthDp - 32
    val unit = (gridWidth - CARD_GAP * (columnCount - 1)) / columnCount
    val rows = HomeGridLayout.rowCount(visible, columnCount)

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

        Box(
            Modifier
                .fillMaxWidth()
                .height((rows * CARD_UNIT_HEIGHT + (rows - 1).coerceAtLeast(0) * CARD_GAP).dp)
        ) {
            HomeGridLayout.slots(visible, columnCount).forEach { slot ->
                val width = minOf(slot.placement.size.columns, columnCount)
                val cardWidth = unit * width + CARD_GAP * (width - 1)
                val cardHeight = CARD_UNIT_HEIGHT * slot.placement.size.rows +
                    CARD_GAP * (slot.placement.size.rows - 1)
                val definition = HomeCards.definition(slot.placement.id) ?: return@forEach
                Box(
                    Modifier
                        .offset(
                            x = ((unit + CARD_GAP) * slot.column).dp,
                            y = ((CARD_UNIT_HEIGHT + CARD_GAP) * slot.row).dp
                        )
                        .width(cardWidth.dp)
                        .height(cardHeight.dp)
                ) {
                    HomeCardShell(
                        definition = definition,
                        placement = slot.placement,
                        customising = customising,
                        t = t,
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
                            t = t,
                            onNewOrder = onNewOrder,
                            onOpenSection = onOpenSection
                        )
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
    t: (String) -> String,
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
    Card(
        Modifier.fillMaxSize(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = if (customising) 4.dp else 1.dp)
    ) {
        Column(Modifier.fillMaxSize()) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(start = 12.dp, end = 4.dp, top = 10.dp, bottom = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    placement.heading.ifEmpty { t(definition.title) },
                    fontSize = 13.sp, fontWeight = FontWeight.Bold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                    color = if (placement.tone == HomeCardTone.Standard)
                        MaterialTheme.colorScheme.onSurface else homeToneColor(placement.tone)
                )
                Box {
                    // §17 asks for at least 44dp of touch target; the glyph stays small.
                    Box(
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
                    .padding(horizontal = 12.dp)
            ) { content() }
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

fun homeDueDate(paymentDate: Date, deliveryTime: Int): Date =
    Date(paymentDate.time + deliveryTime.coerceAtLeast(0) * 24L * 60L * 60L * 1000L)
