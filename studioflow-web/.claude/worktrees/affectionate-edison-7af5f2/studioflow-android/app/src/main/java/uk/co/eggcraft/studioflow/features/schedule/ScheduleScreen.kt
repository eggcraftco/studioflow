package uk.co.eggcraft.studioflow.features.schedule

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.material3.HorizontalDivider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForwardIos
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBackIosNew
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.material.icons.filled.Done
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.FilterList
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import uk.co.eggcraft.studioflow.data.model.StudioOrder
import uk.co.eggcraft.studioflow.features.shell.SectionHeader
import uk.co.eggcraft.studioflow.features.shell.StudioFlowUiState
import uk.co.eggcraft.studioflow.ui.theme.StudioBlue
import uk.co.eggcraft.studioflow.ui.theme.StudioGreen
import uk.co.eggcraft.studioflow.ui.theme.StudioRed
import uk.co.eggcraft.studioflow.ui.theme.StudioWarningOrange

@Composable
fun ScheduleScreen(
    state: StudioFlowUiState,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onAssignOrder: (StudioOrder, uk.co.eggcraft.studioflow.data.model.StudioTeamMember?) -> Unit = { _, _ -> },
    onDeleteOrder: (StudioOrder) -> Unit = {},
    onOpenCustomerFromOrder: (StudioOrder) -> Unit = {},
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit = { _, _ -> }
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var rangeOffset by rememberSaveable { mutableIntStateOf(0) }
    var zoom by rememberSaveable { mutableDoubleStateOf(1.0) }
    var statusFilter by rememberSaveable { mutableStateOf(ScheduleStatusFilter.All) }
    var sortMode by rememberSaveable { mutableStateOf(ScheduleSortMode.Smart) }
    var viewMode by rememberSaveable { mutableStateOf(ScheduleViewMode.Weekly) }
    // The date the visible window is built around. 0 means "no explicit anchor" (fall back
    // to the earliest open order). "Today" parks it on now; "Jump to selected" parks it on
    // the selected order's start date, exactly like the web toolbar.
    var anchorMillis by rememberSaveable { mutableStateOf(0L) }
    var searchText by rememberSaveable { mutableStateOf("") }
    var statusMenuOpen by rememberSaveable { mutableStateOf(false) }
    var sortMenuOpen by rememberSaveable { mutableStateOf(false) }
    var selectedScheduleOrderId by rememberSaveable { mutableStateOf<String?>(null) }
    // Bumped on every "Jump to selected" so the timeline scroller can bring the bar into view.
    var jumpTick by remember { mutableIntStateOf(0) }
    val visibleOrders = remember(state.orders, statusFilter, sortMode, searchText) {
        scheduleVisibleOrders(state.orders, statusFilter, sortMode, searchText)
    }
    // Mirrors the web: an explicit pick wins, otherwise the first order in the filtered list.
    val selectedOrder = visibleOrders.firstOrNull { it.id == selectedScheduleOrderId }
        ?: visibleOrders.firstOrNull()
    val locale = uk.co.eggcraft.studioflow.language.studioLocale(lang)
    val range = remember(visibleOrders, rangeOffset, viewMode, anchorMillis, locale) {
        ScheduleRange.from(
            orders = visibleOrders,
            rangeOffset = rangeOffset,
            viewMode = viewMode,
            anchorDate = if (anchorMillis > 0L) Date(anchorMillis) else null,
            locale = locale
        )
    }
    val canEditSchedule = state.workspace?.let { workspace ->
        (workspace.isOwner || workspace.role in setOf("admin", "member", "workflow")) &&
            workspace.memberAccess.orders &&
            workspace.memberAccess.schedule
    } == true
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        val useDesktopTimeline = maxWidth >= 840.dp
        // Share the SAME resizable sidebar width as the Orders screen. The width lives
        // in the synced workspace setting (ordersSidebarWidth), so resizing here or in
        // Orders — on any platform — keeps the panel the same size everywhere.
        val density = LocalDensity.current
        val cloudSidebarWidth = state.workspaceSettings.ordersSidebarWidth.toFloat()
        val minSidebarWidth = 320f
        val maxSidebarWidth = (maxWidth.value * 0.56f).coerceIn(minSidebarWidth, 760f)
        var sidebarWidthOverride by remember { mutableStateOf(Float.NaN) }
        var resizingSidebar by remember { mutableStateOf(false) }
        var resizeBaseWidth by remember { mutableStateOf(0f) }
        var resizeDeltaDp by remember { mutableStateOf(0f) }
        LaunchedEffect(cloudSidebarWidth) {
            if (!resizingSidebar) sidebarWidthOverride = Float.NaN
        }
        val sidebarWidth = (if (sidebarWidthOverride.isNaN()) cloudSidebarWidth else sidebarWidthOverride)
            .coerceIn(minSidebarWidth, maxSidebarWidth)
        if (useDesktopTimeline) {
            Row(modifier = Modifier.fillMaxSize()) {
                uk.co.eggcraft.studioflow.features.orders.OrderListSidebarPane(
                    state = state,
                    selectedOrderId = selectedScheduleOrderId,
                    onOpenOrder = { selectedScheduleOrderId = it.id },
                    onAssignOrder = onAssignOrder,
                    onUpdateOrderFields = onUpdateOrderFields,
                    onDeleteOrder = onDeleteOrder,
                    onOpenCustomerFromOrder = onOpenCustomerFromOrder,
                    onUpdateWorkspaceSettings = onUpdateWorkspaceSettings,
                    modifier = Modifier
                        .width(sidebarWidth.dp)
                        .fillMaxHeight()
                )
                uk.co.eggcraft.studioflow.features.orders.OrderListResizeHandle(
                    active = resizingSidebar,
                    onResizeStart = {
                        resizingSidebar = true
                        resizeBaseWidth = sidebarWidth
                        resizeDeltaDp = 0f
                    },
                    onResizeBy = { dragPixels ->
                        val deltaDp = with(density) { dragPixels.toDp().value }
                        resizeDeltaDp += deltaDp
                        sidebarWidthOverride = (resizeBaseWidth + resizeDeltaDp).coerceIn(minSidebarWidth, maxSidebarWidth)
                    },
                    onResizeEnd = {
                        resizingSidebar = false
                        val synced = sidebarWidth.coerceIn(minSidebarWidth, maxSidebarWidth)
                        onUpdateWorkspaceSettings(
                            mapOf("ordersSidebarWidth" to synced.toDouble()),
                            "Order list width synced."
                        )
                        resizeBaseWidth = 0f
                        resizeDeltaDp = 0f
                    },
                    onResizeCancel = {
                        resizingSidebar = false
                        resizeBaseWidth = 0f
                        resizeDeltaDp = 0f
                    }
                )
                ScheduleDesktopTimelineScreen(
                    allOrders = state.orders,
                visibleOrders = visibleOrders,
                range = range,
                zoom = zoom,
                statusFilter = statusFilter,
                sortMode = sortMode,
                viewMode = viewMode,
                searchText = searchText,
                canEditSchedule = canEditSchedule,
                onStatusFilterChange = { next ->
                    statusFilter = next
                    anchorMillis = if (next == ScheduleStatusFilter.ThisWeek) System.currentTimeMillis() else 0L
                    rangeOffset = 0
                },
                onSortModeChange = { sortMode = it },
                onViewModeChange = { next ->
                    viewMode = next
                    anchorMillis = System.currentTimeMillis()
                    rangeOffset = 0
                },
                onSearchChange = {
                    searchText = it
                    rangeOffset = 0
                },
                onPreviousRange = { rangeOffset -= 1 },
                onNextRange = { rangeOffset += 1 },
                onResetRange = {
                    anchorMillis = System.currentTimeMillis()
                    rangeOffset = 0
                },
                onZoomChange = { zoom = it.coerceIn(0.45, 2.20) },
                jumpTarget = selectedOrder,
                onJumpToSelected = {
                    selectedOrder?.let { order ->
                        selectedScheduleOrderId = order.id
                        anchorMillis = orderStartDate(order).time
                        rangeOffset = 0
                        jumpTick += 1
                    }
                },
                jumpTick = jumpTick,
                onMoveOrder = { order, days -> moveScheduleOrder(order, days, onUpdateOrderFields) },
                onResizeLeading = { order, days -> resizeScheduleOrderLeading(order, days, onUpdateOrderFields) },
                onResizeTrailing = { order, days -> resizeScheduleOrderTrailing(order, days, onUpdateOrderFields) },
                selectedOrderId = selectedScheduleOrderId,
                onSelectOrder = { selectedScheduleOrderId = it.id },
                modifier = Modifier.weight(1f).fillMaxHeight()
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
        item {
            SectionHeader(title = t("Schedule"), subtitle = t("See who is doing what and when."))
        }
        // One control row, phone shape: the search field carries its own magnifier and
        // placeholder (no label above it), then the value-only status and sort controls.
        item {
            OutlinedTextField(
                value = searchText,
                onValueChange = {
                    searchText = it
                    rangeOffset = 0
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                singleLine = true,
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, tint = StudioBlue) },
                trailingIcon = {
                    if (searchText.isNotBlank()) {
                        IconButton(onClick = { searchText = "" }) {
                            Icon(Icons.Filled.Close, contentDescription = t("Clear search"))
                        }
                    }
                },
                placeholder = { Text(t("Search orders")) }
            )
        }
        item {
            Row(modifier = Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(modifier = Modifier.weight(1f)) {
                    ScheduleControl(
                        label = "${t(statusFilter.label)} · ${visibleOrders.size}",
                        icon = Icons.Outlined.FilterList,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { statusMenuOpen = true }
                    )
                    DropdownMenu(expanded = statusMenuOpen, onDismissRequest = { statusMenuOpen = false }) {
                        ScheduleStatusFilter.values().forEach { item ->
                            DropdownMenuItem(
                                text = { Text("${t(item.label)} (${state.orders.count { o -> item.matches(o) }})", fontWeight = FontWeight.Bold) },
                                onClick = {
                                    statusFilter = item
                                    anchorMillis = if (item == ScheduleStatusFilter.ThisWeek) System.currentTimeMillis() else 0L
                                    rangeOffset = 0
                                    statusMenuOpen = false
                                }
                            )
                        }
                    }
                }
                Box(modifier = Modifier.weight(1f)) {
                    ScheduleControl(
                        label = t(sortMode.label),
                        icon = Icons.Outlined.AutoAwesome,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { sortMenuOpen = true }
                    )
                    DropdownMenu(expanded = sortMenuOpen, onDismissRequest = { sortMenuOpen = false }) {
                        ScheduleSortMode.values().forEach { item ->
                            DropdownMenuItem(
                                text = { Text(t(item.label), fontWeight = FontWeight.Bold) },
                                onClick = {
                                    sortMode = item
                                    sortMenuOpen = false
                                }
                            )
                        }
                    }
                }
            }
        }
        item {
            Row(modifier = Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                SchedulePeriodGroup(
                    rangeTitle = range.title,
                    onPrevious = { rangeOffset -= 1 },
                    onNext = { rangeOffset += 1 },
                    modifier = Modifier.weight(1f)
                )
                ScheduleToolbarButton(
                    label = t("Today"),
                    onClick = {
                        anchorMillis = System.currentTimeMillis()
                        rangeOffset = 0
                    }
                )
            }
        }
        // The old "Range" dropdown is gone: the segmented control carries the value itself.
        item {
            ScheduleRangeSegments(
                selected = viewMode,
                onSelect = { next ->
                    viewMode = next
                    anchorMillis = System.currentTimeMillis()
                    rangeOffset = 0
                },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                stretch = true
            )
        }
        item {
            SchedulePeriodHeader(
                rangeTitle = "",
                orders = visibleOrders,
                modifier = Modifier.padding(horizontal = 16.dp)
            )
        }
        item {
            ScheduleAgendaHint(modifier = Modifier.padding(horizontal = 16.dp))
        }
        if (visibleOrders.isEmpty()) {
            item {
                ScheduleAgendaEmpty(modifier = Modifier.padding(horizontal = 16.dp, vertical = 28.dp))
            }
        } else {
            items(visibleOrders, key = { it.id }) { order ->
                ScheduleAgendaCard(
                    order = order,
                    onClick = { uk.co.eggcraft.studioflow.services.StudioMessageRouteHolder.setPendingOrderRoute(order.id) },
                    modifier = Modifier.padding(horizontal = 16.dp)
                )
            }
        }
        if (!canEditSchedule) {
            item {
                Text(
                    text = t("Read-only schedule view."),
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
        item { Spacer(modifier = Modifier.height(8.dp)) }
            }
        }
    }
}

// ===== Team Schedule (member × day) — mirrors the Mac/web layout =====

private fun teamMemberInitials(name: String): String {
    val parts = name.trim().split(" ").filter { it.isNotBlank() }.take(2)
    val letters = parts.mapNotNull { it.firstOrNull()?.toString() }.joinToString("")
    return letters.ifBlank { "?" }.uppercase()
}

@Composable
private fun TeamAvatar(name: String, size: Dp) {
    Box(
        modifier = Modifier.size(size).clip(CircleShape).background(StudioBlue.copy(alpha = 0.14f)),
        contentAlignment = Alignment.Center
    ) {
        Text(teamMemberInitials(name), color = StudioBlue, fontSize = (size.value * 0.34f).sp, fontWeight = FontWeight.ExtraBold)
    }
}

@Composable
private fun TeamCard(content: @Composable ColumnScope.() -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.18f))
    ) {
        Column(modifier = Modifier.padding(14.dp), content = content)
    }
}

@Composable
fun TeamScheduleScreen(
    state: StudioFlowUiState,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val locale = uk.co.eggcraft.studioflow.language.studioLocale(lang)
    val teamPlan = state.workspace?.billingPlan == uk.co.eggcraft.studioflow.data.model.StudioBillingPlan.TeamMonthly

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 4.dp)) {
            Text("Team Schedule".let { t("Team Schedule") }, fontSize = 26.sp, fontWeight = FontWeight.ExtraBold)
            Text(t("See each team member's assigned work."), color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
        }

        if (!teamPlan) {
            Column(
                modifier = Modifier.fillMaxSize().padding(40.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(Icons.Filled.Groups, contentDescription = null, tint = Color(0xFFD12EF2), modifier = Modifier.size(44.dp))
                Spacer(modifier = Modifier.height(12.dp))
                Text(t("Team Schedule"), fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
                Spacer(modifier = Modifier.height(6.dp))
                Text(t("Team Schedule is part of the Team plan. Upgrade to see assigned work across your whole team."), color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            }
            return@Column
        }

        var rangeOffset by rememberSaveable { mutableIntStateOf(0) }
        var statusFilter by rememberSaveable { mutableStateOf(ScheduleStatusFilter.All) }
        var sortMode by rememberSaveable { mutableStateOf(ScheduleSortMode.Smart) }
        var viewMode by rememberSaveable { mutableStateOf(ScheduleViewMode.Weekly) }
        var anchorToCurrentDate by rememberSaveable { mutableStateOf(false) }
        var searchText by rememberSaveable { mutableStateOf("") }
        var selectedOrderId by remember { mutableStateOf<String?>(null) }
        var hiddenMemberIds by remember { mutableStateOf(setOf<String>()) }
        var membersLimit by rememberSaveable { mutableIntStateOf(8) }
        var statusMenuOpen by remember { mutableStateOf(false) }
        var sortMenuOpen by remember { mutableStateOf(false) }
        var fStatusMenuOpen by remember { mutableStateOf(false) }
        var fSortMenuOpen by remember { mutableStateOf(false) }

        val visibleOrders = remember(state.orders, statusFilter, sortMode, searchText) {
            scheduleVisibleOrders(state.orders, statusFilter, sortMode, searchText)
        }
        val range = remember(visibleOrders, rangeOffset, viewMode, anchorToCurrentDate, locale) {
            ScheduleRange.from(visibleOrders, rangeOffset, viewMode, if (anchorToCurrentDate) Date() else null, locale)
        }
        val members = state.teamMembers
        val visibleMembers = members.filter { it.id !in hiddenMemberIds }
        fun ordersFor(memberId: String) = visibleOrders.filter { it.assignedToUid.trim() == memberId && timelineMetrics(it, range) != null }
        val unassigned = visibleOrders.filter { it.assignedToUid.isBlank() && timelineMetrics(it, range) != null }
        fun memberActive(memberId: String) = state.orders.count { it.assignedToUid.trim() == memberId && !it.isClosed }
        fun memberLate(memberId: String) = state.orders.count { it.assignedToUid.trim() == memberId && orderIsLate(it) }
        val maxActive = (members.maxOfOrNull { memberActive(it.id) } ?: 1).coerceAtLeast(1)
        val totalActive = members.sumOf { memberActive(it.id) }
        val upcoming = state.orders.filter { !it.isClosed }.sortedBy { deliveryDueDate(it) }.take(7)
        val selectedOrder = state.orders.firstOrNull { it.id == selectedOrderId }

        val baseDayWidth = scheduleTimelineBaseDayWidth(range.days.size)
        val dayWidth = baseDayWidth.coerceAtLeast(18.0).dp
        val timelineWidth = dayWidth * range.days.size.toFloat()

        // Same one-row shape as the Schedule toolbar: a search field that carries its own
        // placeholder, value-only status and sort controls, then the period group.
        @Composable
        fun ControlsRow(modifier: Modifier = Modifier) {
            Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = searchText,
                    onValueChange = { searchText = it; rangeOffset = 0 },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                    trailingIcon = {
                        if (searchText.isNotBlank()) {
                            IconButton(onClick = { searchText = "" }) { Icon(Icons.Filled.Close, contentDescription = t("Clear search")) }
                        }
                    },
                    placeholder = { Text(t("Search orders"), maxLines = 1, overflow = TextOverflow.Ellipsis) }
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.weight(1f)) {
                        ScheduleControl(label = t(statusFilter.label), icon = Icons.Outlined.FilterList, modifier = Modifier.fillMaxWidth(), onClick = { statusMenuOpen = true })
                        DropdownMenu(expanded = statusMenuOpen, onDismissRequest = { statusMenuOpen = false }) {
                            ScheduleStatusFilter.values().forEach { item ->
                                DropdownMenuItem(text = { Text("${t(item.label)} (${state.orders.count { o -> item.matches(o) }})", fontWeight = FontWeight.Bold) }, onClick = { statusFilter = item; anchorToCurrentDate = item == ScheduleStatusFilter.ThisWeek; rangeOffset = 0; statusMenuOpen = false })
                            }
                        }
                    }
                    Box(modifier = Modifier.weight(1f)) {
                        ScheduleControl(label = t(sortMode.label), icon = Icons.Outlined.AutoAwesome, modifier = Modifier.fillMaxWidth(), onClick = { sortMenuOpen = true })
                        DropdownMenu(expanded = sortMenuOpen, onDismissRequest = { sortMenuOpen = false }) {
                            ScheduleSortMode.values().forEach { item -> DropdownMenuItem(text = { Text(t(item.label), fontWeight = FontWeight.Bold) }, onClick = { sortMode = item; sortMenuOpen = false }) }
                        }
                    }
                }
            }
        }

        @Composable
        fun RangeRow(modifier: Modifier = Modifier) {
            Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    SchedulePeriodGroup(
                        rangeTitle = range.title,
                        onPrevious = { rangeOffset -= 1 },
                        onNext = { rangeOffset += 1 },
                        modifier = Modifier.weight(1f)
                    )
                    ScheduleToolbarButton(label = t("Today"), onClick = { anchorToCurrentDate = true; rangeOffset = 0 })
                }
                ScheduleRangeSegments(
                    selected = viewMode,
                    onSelect = { next -> viewMode = next; anchorToCurrentDate = true; rangeOffset = 0 },
                    modifier = Modifier.fillMaxWidth(),
                    stretch = true
                )
                SchedulePeriodHeader(rangeTitle = "", orders = visibleOrders)
            }
        }

        @Composable
        fun WorkloadCard() {
            TeamCard {
                Text(t("Workload"), fontSize = 15.sp, fontWeight = FontWeight.ExtraBold)
                Spacer(modifier = Modifier.height(8.dp))
                members.forEach { member ->
                    val count = memberActive(member.id)
                    val late = memberLate(member.id)
                    Column(modifier = Modifier.padding(vertical = 5.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TeamAvatar(member.label, 20.dp)
                            Text(member.label, modifier = Modifier.weight(1f), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("$count", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Box(modifier = Modifier.fillMaxWidth().height(7.dp).clip(RoundedCornerShape(999.dp)).background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))) {
                            Box(modifier = Modifier.fillMaxHeight().fillMaxWidth(fraction = (count.toFloat() / maxActive).coerceIn(0.05f, 1f)).clip(RoundedCornerShape(999.dp)).background(if (late > 0) StudioWarningOrange else StudioBlue))
                        }
                    }
                }
                Spacer(modifier = Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(t("Total active work"), modifier = Modifier.weight(1f), fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("$totalActive", fontSize = 12.5.sp, fontWeight = FontWeight.ExtraBold)
                }
            }
        }

        @Composable
        fun UpcomingCard() {
            TeamCard {
                Text(t("Upcoming"), fontSize = 15.sp, fontWeight = FontWeight.ExtraBold)
                Spacer(modifier = Modifier.height(6.dp))
                if (upcoming.isEmpty()) {
                    Text(t("No upcoming work."), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else upcoming.forEachIndexed { i, order ->
                    if (i > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.16f))
                    Row(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable { selectedOrderId = order.id }.padding(vertical = 7.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                        Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(scheduleColor(order)))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(order.displayCustomerName, fontSize = 12.5.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            val assignee = members.firstOrNull { it.id == order.assignedToUid }?.label ?: t("Unassigned")
                            Text(assignee, fontSize = 10.5.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        if (timelineCountdownText(order).isNotBlank()) Text(timelineCountdownText(order), fontSize = 10.5.sp, fontWeight = FontWeight.ExtraBold, color = if (orderIsLate(order)) StudioWarningOrange else MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }

        @Composable
        fun SelectedCard() {
            TeamCard {
                Text(t("Selected Item"), fontSize = 15.sp, fontWeight = FontWeight.ExtraBold)
                Spacer(modifier = Modifier.height(8.dp))
                val order = selectedOrder
                if (order == null) {
                    Text(t("Select a job to see its details."), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(modifier = Modifier.width(5.dp).height(38.dp).clip(RoundedCornerShape(3.dp)).background(scheduleColor(order)))
                        Column {
                            Text(order.displayCustomerName, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            if (order.designName.isNotBlank()) Text(order.designName, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    @Composable fun DetailRow(label: String, value: String, tint: Color) {
                        Row(modifier = Modifier.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(label, modifier = Modifier.weight(1f), fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(value, fontSize = 11.5.sp, fontWeight = FontWeight.ExtraBold, color = tint, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    DetailRow(t("Status"), scheduleStatusLabel(order), statusColorForScheduleValue(scheduleStatusLabel(order)))
                    DetailRow(t("Schedule"), "${scheduleDateFormatter(locale).format(orderStartDate(order))} → ${scheduleDateFormatter(locale).format(deliveryDueDate(order))}", MaterialTheme.colorScheme.onSurface)
                    if (timelineCountdownText(order).isNotBlank()) DetailRow(t("Due"), timelineCountdownText(order), if (orderIsLate(order)) StudioWarningOrange else MaterialTheme.colorScheme.onSurface)
                    DetailRow(t("Assigned to"), members.firstOrNull { it.id == order.assignedToUid }?.label ?: t("Unassigned"), MaterialTheme.colorScheme.onSurface)
                    Spacer(modifier = Modifier.height(8.dp))
                    Surface(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(10.dp), color = StudioBlue, onClick = { uk.co.eggcraft.studioflow.services.StudioMessageRouteHolder.setPendingOrderRoute(order.id) }) {
                        Text(t("Open Order"), modifier = Modifier.padding(vertical = 9.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center, color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 12.5.sp)
                    }
                }
            }
        }

        @Composable
        fun MembersFilterCard() {
            val filtersActive = statusFilter != ScheduleStatusFilter.All || sortMode != ScheduleSortMode.Smart || hiddenMemberIds.isNotEmpty() || searchText.isNotBlank()
            TeamCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(t("Filters"), modifier = Modifier.weight(1f), fontSize = 15.sp, fontWeight = FontWeight.ExtraBold)
                    if (filtersActive) Text(t("Clear all"), modifier = Modifier.clickable { statusFilter = ScheduleStatusFilter.All; sortMode = ScheduleSortMode.Smart; hiddenMemberIds = emptySet(); searchText = "" }, color = StudioBlue, fontSize = 11.5.sp, fontWeight = FontWeight.ExtraBold)
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(t("Status"), fontSize = 10.5.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(modifier = Modifier.height(4.dp))
                Box {
                    ScheduleControl(label = if (statusFilter == ScheduleStatusFilter.All) t("Filter by Status") else statusFilter.label, icon = Icons.Outlined.FilterList, modifier = Modifier.fillMaxWidth(), onClick = { fStatusMenuOpen = true })
                    DropdownMenu(expanded = fStatusMenuOpen, onDismissRequest = { fStatusMenuOpen = false }) {
                        ScheduleStatusFilter.values().forEach { item -> DropdownMenuItem(text = { Text("${t(item.label)} (${state.orders.count { o -> item.matches(o) }})", fontWeight = FontWeight.Bold) }, onClick = { statusFilter = item; anchorToCurrentDate = item == ScheduleStatusFilter.ThisWeek; rangeOffset = 0; fStatusMenuOpen = false }) }
                    }
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(t("Sort"), fontSize = 10.5.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(modifier = Modifier.height(4.dp))
                Box {
                    ScheduleControl(label = sortMode.label, icon = Icons.Outlined.AutoAwesome, modifier = Modifier.fillMaxWidth(), onClick = { fSortMenuOpen = true })
                    DropdownMenu(expanded = fSortMenuOpen, onDismissRequest = { fSortMenuOpen = false }) {
                        ScheduleSortMode.values().forEach { item -> DropdownMenuItem(text = { Text(item.label, fontWeight = FontWeight.Bold) }, onClick = { sortMode = item; fSortMenuOpen = false }) }
                    }
                }
                Spacer(modifier = Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(t("Members"), modifier = Modifier.weight(1f), fontSize = 10.5.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (hiddenMemberIds.isNotEmpty()) Text(t("All"), modifier = Modifier.clickable { hiddenMemberIds = emptySet() }, color = StudioBlue, fontSize = 10.5.sp, fontWeight = FontWeight.ExtraBold)
                }
                Spacer(modifier = Modifier.height(4.dp))
                members.take(membersLimit).forEach { member ->
                    val on = member.id !in hiddenMemberIds
                    Row(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable { hiddenMemberIds = if (on) hiddenMemberIds + member.id else hiddenMemberIds - member.id }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(if (on) Icons.Filled.CheckCircle else Icons.Outlined.Circle, contentDescription = null, tint = if (on) StudioBlue else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f), modifier = Modifier.size(18.dp))
                        TeamAvatar(member.label, 20.dp)
                        Text(member.label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                if (members.size > membersLimit) {
                    Surface(modifier = Modifier.fillMaxWidth().padding(top = 4.dp), shape = RoundedCornerShape(9.dp), color = StudioBlue.copy(alpha = 0.08f), onClick = { membersLimit += 8 }) {
                        Text("${t("Load more")} (${members.size - membersLimit})", modifier = Modifier.padding(vertical = 7.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center, color = StudioBlue, fontWeight = FontWeight.ExtraBold, fontSize = 11.5.sp)
                    }
                }
            }
        }

        @Composable
        fun MemberGrid(modifier: Modifier = Modifier) {
            val hScroll = rememberScrollState()
            val labelW = 190.dp
            Surface(modifier = modifier.fillMaxSize(), shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surface, border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.18f))) {
                Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                    // header
                    Row {
                        Box(modifier = Modifier.width(labelW).height(56.dp).background(MaterialTheme.colorScheme.surface), contentAlignment = Alignment.CenterStart) {
                            Text(range.title, modifier = Modifier.padding(horizontal = 12.dp), fontSize = 13.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        Row(modifier = Modifier.horizontalScroll(hScroll)) {
                            range.days.forEach { day ->
                                val today = isSameScheduleDay(day.date, Date())
                                Column(modifier = Modifier.width(dayWidth).height(56.dp).background(MaterialTheme.colorScheme.surface), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                                    Text(day.weekday, color = if (today) StudioBlue else MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                                    if (today) {
                                        Box(modifier = Modifier.size(22.dp).clip(CircleShape).background(StudioBlue), contentAlignment = Alignment.Center) {
                                            Text(day.day, color = Color.White, fontSize = 11.5.sp, fontWeight = FontWeight.ExtraBold)
                                        }
                                    } else {
                                        Text(day.day, color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold)
                                    }
                                }
                            }
                        }
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.16f))
                    val rows: List<Pair<StudioTeamMemberRow, List<StudioOrder>>> = visibleMembers.map { StudioTeamMemberRow(it) to ordersFor(it.id) } + if (unassigned.isNotEmpty()) listOf(StudioTeamMemberRow(null) to unassigned) else emptyList()
                    rows.forEach { (rowMember, list) ->
                        val rowH = (maxOf(1, list.size) * 64).dp
                        Row(modifier = Modifier.height(rowH)) {
                            Column(modifier = Modifier.width(labelW).fillMaxHeight().padding(horizontal = 12.dp), verticalArrangement = Arrangement.Center) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    if (rowMember.member != null) TeamAvatar(rowMember.member.label, 28.dp) else Box(modifier = Modifier.size(28.dp).clip(CircleShape).background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f)), contentAlignment = Alignment.Center) { Text("?", color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.ExtraBold) }
                                    Column {
                                        Text(rowMember.member?.label ?: t("Unassigned"), fontSize = 13.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        if (rowMember.member != null) Text("${memberActive(rowMember.member.id)} ${t("jobs")}", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
                                    }
                                }
                            }
                            Box(modifier = Modifier.horizontalScroll(hScroll).width(timelineWidth).fillMaxHeight()) {
                                // Today's accent line, carried down behind every member row.
                                Row(modifier = Modifier.fillMaxSize()) {
                                    range.days.forEach { day ->
                                        Box(modifier = Modifier.width(dayWidth).fillMaxHeight()) {
                                            if (isSameScheduleDay(day.date, Date())) {
                                                Box(modifier = Modifier.align(Alignment.Center).width(2.dp).fillMaxHeight().background(StudioBlue.copy(alpha = 0.35f)))
                                            }
                                        }
                                    }
                                }
                                list.forEachIndexed { i, order ->
                                    val metrics = timelineMetrics(order, range) ?: return@forEachIndexed
                                    val barX = dayWidth * metrics.offsetDays.toFloat()
                                    val barW = (dayWidth * metrics.durationDays.toFloat()) - 6.dp
                                    val tone = statusColorForScheduleValue(scheduleStatusLabel(order))
                                    Surface(
                                        modifier = Modifier.offset(x = barX, y = (i * 64 + 6).dp).width(barW.coerceAtLeast(120.dp)).height(52.dp).clickable { selectedOrderId = order.id },
                                        shape = RoundedCornerShape(10.dp),
                                        color = scheduleColor(order).copy(alpha = 0.16f),
                                        border = androidx.compose.foundation.BorderStroke(if (order.id == selectedOrderId) 2.dp else 1.dp, if (order.id == selectedOrderId) StudioBlue else scheduleColor(order).copy(alpha = 0.5f))
                                    ) {
                                        Column(modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalArrangement = Arrangement.Center) {
                                            Text(order.displayCustomerName, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                            Text(scheduleStatusLabel(order), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = tone, maxLines = 1)
                                        }
                                    }
                                }
                            }
                        }
                        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.16f))
                    }
                }
            }
        }

        BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
            val wide = maxWidth >= 840.dp
            if (wide) {
                Column(modifier = Modifier.fillMaxSize()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        ControlsRow(Modifier.fillMaxWidth())
                        Spacer(modifier = Modifier.height(10.dp))
                        RangeRow(Modifier.fillMaxWidth())
                    }
                    Row(modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        Column(modifier = Modifier.width(248.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            MembersFilterCard()
                        }
                        MemberGrid(modifier = Modifier.weight(1f).padding(bottom = 16.dp))
                        Column(modifier = Modifier.width(300.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            UpcomingCard()
                            SelectedCard()
                            WorkloadCard()
                        }
                    }
                }
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    item { ControlsRow(Modifier.fillMaxWidth()) }
                    item { RangeRow(Modifier.fillMaxWidth()) }
                    visibleMembers.forEach { member ->
                        val list = ordersFor(member.id)
                        item(key = "head-${member.id}") {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 6.dp)) {
                                TeamAvatar(member.label, 34.dp)
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(member.label, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(member.roleLabel, fontSize = 10.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
                                }
                                Text("${list.size} ${t("jobs")}", fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        if (list.isEmpty()) {
                            item(key = "empty-${member.id}") { Text(t("No assigned work in this range."), fontSize = 11.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold) }
                        } else items(list, key = { "${member.id}-${it.id}" }) { order ->
                            ScheduleAgendaCard(order = order, onClick = { uk.co.eggcraft.studioflow.services.StudioMessageRouteHolder.setPendingOrderRoute(order.id) })
                        }
                    }
                    if (unassigned.isNotEmpty()) {
                        item(key = "head-unassigned") {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 6.dp)) {
                                Box(modifier = Modifier.size(34.dp).clip(CircleShape).background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f)), contentAlignment = Alignment.Center) { Text("?", fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                Text(t("Unassigned"), modifier = Modifier.weight(1f), fontSize = 14.sp, fontWeight = FontWeight.ExtraBold)
                                Text("${unassigned.size} ${t("jobs")}", fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        items(unassigned, key = { "unassigned-${it.id}" }) { order ->
                            ScheduleAgendaCard(order = order, onClick = { uk.co.eggcraft.studioflow.services.StudioMessageRouteHolder.setPendingOrderRoute(order.id) })
                        }
                    }
                }
            }
        }
    }
}

private data class StudioTeamMemberRow(val member: uk.co.eggcraft.studioflow.data.model.StudioTeamMember?)

@Composable
private fun ScheduleDesktopTimelineScreen(
    allOrders: List<StudioOrder>,
    visibleOrders: List<StudioOrder>,
    range: ScheduleRange,
    zoom: Double,
    statusFilter: ScheduleStatusFilter,
    sortMode: ScheduleSortMode,
    viewMode: ScheduleViewMode,
    searchText: String,
    canEditSchedule: Boolean,
    onStatusFilterChange: (ScheduleStatusFilter) -> Unit,
    onSortModeChange: (ScheduleSortMode) -> Unit,
    onViewModeChange: (ScheduleViewMode) -> Unit,
    onSearchChange: (String) -> Unit,
    onPreviousRange: () -> Unit,
    onNextRange: () -> Unit,
    onResetRange: () -> Unit,
    onZoomChange: (Double) -> Unit,
    jumpTarget: StudioOrder?,
    onJumpToSelected: () -> Unit,
    jumpTick: Int,
    onMoveOrder: (StudioOrder, Int) -> Unit,
    onResizeLeading: (StudioOrder, Int) -> Unit,
    onResizeTrailing: (StudioOrder, Int) -> Unit,
    selectedOrderId: String?,
    onSelectOrder: (StudioOrder) -> Unit,
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    BoxWithConstraints(
        modifier = modifier
            .fillMaxHeight()
            .background(MaterialTheme.colorScheme.background)
    ) {
        // The timeline scroller sits inside 18.dp of padding, so this is what a viewer
        // actually sees. It drives both the live "N days" readout and the Fit button.
        val viewportWidth = maxWidth - 36.dp
        val baseDayWidth = scheduleTimelineBaseDayWidth(range.days.size)
        val dayWidth = (baseDayWidth * zoom).coerceAtLeast(18.0)
        val daysOnScreen = (viewportWidth.value / dayWidth).roundToInt().coerceAtLeast(1)
        Column(modifier = Modifier.fillMaxSize()) {
            Surface(color = MaterialTheme.colorScheme.surface, shadowElevation = 1.dp) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 22.dp, vertical = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(t("Schedule"), fontSize = 24.sp, fontWeight = FontWeight.ExtraBold)
                        Text(
                            t("See who is doing what and when."),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                    ScheduleDesktopControls(
                        allOrders = allOrders,
                        rangeTitle = range.title,
                        zoom = zoom,
                        daysOnScreen = daysOnScreen,
                        statusFilter = statusFilter,
                        sortMode = sortMode,
                        viewMode = viewMode,
                        searchText = searchText,
                        canJumpToSelected = jumpTarget != null,
                        onStatusFilterChange = onStatusFilterChange,
                        onSortModeChange = onSortModeChange,
                        onViewModeChange = onViewModeChange,
                        onSearchChange = onSearchChange,
                        onPreviousRange = onPreviousRange,
                        onNextRange = onNextRange,
                        onResetRange = onResetRange,
                        onJumpToSelected = onJumpToSelected,
                        onZoomChange = onZoomChange,
                        // Fit picks the zoom that puts the whole range in the viewport; the
                        // caller still clamps it, and the 18.dp day floor keeps long ranges legible.
                        onFit = {
                            val span = (range.days.size.coerceAtLeast(1)) * baseDayWidth
                            if (span > 0) onZoomChange((viewportWidth.value - 34.0) / span)
                        }
                    )
                    ScheduleTipLine(
                        note = if (canEditSchedule) {
                            t("Team includes shared schedule planning for the whole workspace.")
                        } else {
                            t("Read-only schedule view.")
                        },
                        showGuide = canEditSchedule
                    )
                }
            }
            // Period + counts stay pinned here, above the horizontally scrolling timeline.
            SchedulePeriodHeader(
                rangeTitle = range.title,
                orders = visibleOrders,
                modifier = Modifier.padding(start = 18.dp, end = 18.dp, top = 12.dp)
            )
            ScheduleTimelineBoard(
                range = range,
                visibleOrders = visibleOrders,
                zoom = zoom,
                canEditSchedule = canEditSchedule,
                onMoveOrder = onMoveOrder,
                onResizeLeading = onResizeLeading,
                onResizeTrailing = onResizeTrailing,
                selectedOrderId = selectedOrderId,
                onSelectOrder = onSelectOrder,
                jumpTarget = jumpTarget,
                jumpTick = jumpTick,
                modifier = Modifier.weight(1f)
            )
        }
    }
}

// One control row, in the order the web toolbar reads: search, status, sort, the period
// group, the width group, then the segmented range. No labels above the controls — each
// control shows its own value, which is what the label used to say twice.
@Composable
private fun ScheduleDesktopControls(
    allOrders: List<StudioOrder>,
    rangeTitle: String,
    zoom: Double,
    daysOnScreen: Int,
    statusFilter: ScheduleStatusFilter,
    sortMode: ScheduleSortMode,
    viewMode: ScheduleViewMode,
    searchText: String,
    canJumpToSelected: Boolean,
    onStatusFilterChange: (ScheduleStatusFilter) -> Unit,
    onSortModeChange: (ScheduleSortMode) -> Unit,
    onViewModeChange: (ScheduleViewMode) -> Unit,
    onSearchChange: (String) -> Unit,
    onPreviousRange: () -> Unit,
    onNextRange: () -> Unit,
    onResetRange: () -> Unit,
    onJumpToSelected: () -> Unit,
    onZoomChange: (Double) -> Unit,
    onFit: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var statusMenuOpen by rememberSaveable { mutableStateOf(false) }
    var sortMenuOpen by rememberSaveable { mutableStateOf(false) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        OutlinedTextField(
            value = searchText,
            onValueChange = onSearchChange,
            modifier = Modifier.width(268.dp),
            singleLine = true,
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
            placeholder = { Text(t("Search orders"), maxLines = 1, overflow = TextOverflow.Ellipsis) }
        )
        Box(modifier = Modifier.width(168.dp)) {
            ScheduleDesktopControl(
                label = t(statusFilter.label),
                icon = Icons.Outlined.FilterList,
                modifier = Modifier.fillMaxWidth(),
                onClick = { statusMenuOpen = true }
            )
            DropdownMenu(expanded = statusMenuOpen, onDismissRequest = { statusMenuOpen = false }) {
                ScheduleStatusFilter.values().forEach { item ->
                    DropdownMenuItem(
                        text = { Text("${t(item.label)} (${allOrders.count { o -> item.matches(o) }})", fontWeight = FontWeight.Bold) },
                        onClick = {
                            onStatusFilterChange(item)
                            statusMenuOpen = false
                        }
                    )
                }
            }
        }
        Box(modifier = Modifier.width(158.dp)) {
            ScheduleDesktopControl(
                label = t(sortMode.label),
                icon = Icons.Outlined.AutoAwesome,
                modifier = Modifier.fillMaxWidth(),
                onClick = { sortMenuOpen = true }
            )
            DropdownMenu(expanded = sortMenuOpen, onDismissRequest = { sortMenuOpen = false }) {
                ScheduleSortMode.values().forEach { item ->
                    DropdownMenuItem(
                        text = { Text(t(item.label), fontWeight = FontWeight.Bold) },
                        onClick = {
                            onSortModeChange(item)
                            sortMenuOpen = false
                        }
                    )
                }
            }
        }
        SchedulePeriodGroup(
            rangeTitle = rangeTitle,
            onPrevious = onPreviousRange,
            onNext = onNextRange,
            modifier = Modifier.width(262.dp)
        )
        ScheduleToolbarButton(label = t("Today"), onClick = onResetRange)
        if (canJumpToSelected) {
            ScheduleToolbarIconButton(
                icon = Icons.Filled.MyLocation,
                contentDescription = t("Jump to selected order"),
                onClick = onJumpToSelected
            )
        }
        ScheduleWidthGroup(zoom = zoom, daysOnScreen = daysOnScreen, onZoomChange = onZoomChange)
        ScheduleToolbarButton(label = t("Fit"), onClick = onFit)
        ScheduleRangeSegments(selected = viewMode, onSelect = onViewModeChange)
    }
}

// `‹  <period text>  ›` — the arrows sit inside the same pill as the period text so the
// three read as one control instead of three loose buttons.
@Composable
private fun SchedulePeriodGroup(
    rangeTitle: String,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(modifier = modifier, shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
        Row(
            modifier = Modifier.padding(horizontal = 4.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onPrevious, modifier = Modifier.size(40.dp)) {
                Icon(Icons.Filled.ArrowBackIosNew, contentDescription = t("Previous range"), tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(16.dp))
            }
            Text(
                rangeTitle,
                modifier = Modifier.weight(1f),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                fontSize = 15.sp,
                fontWeight = FontWeight.ExtraBold
            )
            IconButton(onClick = onNext, modifier = Modifier.size(40.dp)) {
                Icon(Icons.AutoMirrored.Filled.ArrowForwardIos, contentDescription = t("Next range"), tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(16.dp))
            }
        }
    }
}

@Composable
private fun ScheduleToolbarButton(label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(modifier = modifier, shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, onClick = onClick) {
        Text(
            label,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            maxLines = 1,
            fontSize = 14.sp,
            fontWeight = FontWeight.ExtraBold
        )
    }
}

@Composable
private fun ScheduleToolbarIconButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    onClick: () -> Unit
) {
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
        IconButton(onClick = onClick, modifier = Modifier.size(48.dp)) {
            Icon(icon, contentDescription = contentDescription, tint = StudioBlue, modifier = Modifier.size(20.dp))
        }
    }
}

// The segmented range control replaces the old "Range" dropdown: Week | Month | 3M | 6M | Year.
@Composable
private fun ScheduleRangeSegments(
    selected: ScheduleViewMode,
    onSelect: (ScheduleViewMode) -> Unit,
    modifier: Modifier = Modifier,
    stretch: Boolean = false
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(modifier = modifier, shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
        Row(modifier = Modifier.padding(3.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            ScheduleViewMode.menuOptions.forEach { option ->
                val active = option == selected
                Surface(
                    modifier = if (stretch) Modifier.weight(1f) else Modifier,
                    shape = RoundedCornerShape(10.dp),
                    color = if (active) MaterialTheme.colorScheme.surface else Color.Transparent,
                    tonalElevation = if (active) 2.dp else 0.dp,
                    onClick = { onSelect(option) }
                ) {
                    Text(
                        t(option.shortLabel),
                        modifier = Modifier.padding(horizontal = 13.dp, vertical = 11.dp),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        color = if (active) StudioBlue else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                }
            }
        }
    }
}

@Composable
private fun ScheduleDesktopControl(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    modifier: Modifier,
    onClick: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(modifier = modifier, shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, onClick = onClick) {
        Row(modifier = Modifier.padding(horizontal = 14.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = StudioBlue, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(9.dp))
            Text(label, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
            Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// The width group reads in days, not per cent: "how many days fit on screen right now".
// The −/+ steps and the [0.45, 2.20] clamp are unchanged — only the readout is new.
@Composable
private fun ScheduleWidthGroup(zoom: Double, daysOnScreen: Int, onZoomChange: (Double) -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
        Row(modifier = Modifier.padding(horizontal = 6.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { onZoomChange(zoom - 0.15) }, enabled = zoom > 0.45 + 0.001, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Filled.Remove, contentDescription = t("Zoom out"), tint = StudioBlue)
            }
            Text(
                "$daysOnScreen ${t("days")}",
                modifier = Modifier.width(66.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                maxLines = 1,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 13.sp
            )
            IconButton(onClick = { onZoomChange(zoom + 0.15) }, enabled = zoom < 2.20 - 0.001, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Filled.Add, contentDescription = t("Zoom in"), tint = StudioBlue)
            }
            IconButton(onClick = { onZoomChange(1.0) }, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Filled.Refresh, contentDescription = t("Reset zoom"), tint = StudioBlue)
            }
        }
    }
}

// One quiet line: the plan/team note, and — when the viewer can actually edit — a single
// "ⓘ How moving and resizing works" link that expands the explanation on demand.
@Composable
private fun ScheduleTipLine(note: String, showGuide: Boolean, modifier: Modifier = Modifier) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var expanded by rememberSaveable { mutableStateOf(false) }
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            if (showGuide) {
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .clickable { expanded = !expanded }
                        .padding(horizontal = 4.dp, vertical = 3.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(Icons.Filled.Info, contentDescription = null, tint = StudioBlue, modifier = Modifier.size(16.dp))
                    Text(
                        t("How moving and resizing works"),
                        color = StudioBlue,
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.ExtraBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            Text(
                note,
                modifier = Modifier.weight(1f),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        if (showGuide && expanded) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                color = StudioBlue.copy(alpha = 0.06f),
                border = androidx.compose.foundation.BorderStroke(1.dp, StudioBlue.copy(alpha = 0.18f))
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(t("Three ways to move an order"), fontSize = 13.sp, fontWeight = FontWeight.ExtraBold)
                    Text(
                        t("Drag the bar to move the whole order, its left edge to change the start date, its right edge to change the delivery date."),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        t("Got it"),
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .clickable { expanded = false }
                            .padding(horizontal = 4.dp, vertical = 3.dp),
                        color = StudioBlue,
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                }
            }
        }
    }
}

// "<period>" left, "N orders · N late · N ready to ship" right. Lives outside the
// horizontal scroller so the counts stay put while the timeline pans sideways.
@Composable
private fun SchedulePeriodHeader(rangeTitle: String, orders: List<StudioOrder>, modifier: Modifier = Modifier) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val late = orders.count { orderIsLate(it) }
    val ready = orders.count { orderIsReadyToShip(it) }
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Blank title where the period already reads out right above (phone, team grid) —
        // the counts still hold the right-hand edge.
        if (rangeTitle.isBlank()) {
            Spacer(modifier = Modifier.weight(1f))
        } else {
            Text(rangeTitle, modifier = Modifier.weight(1f), fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(
            "${orders.size} ${t("orders")} · $late ${t("late")} · $ready ${t("ready to ship")}",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 12.5.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

// Phone-friendly vertical agenda. The wide drag-and-drop Gantt timeline is hard to
// use on a narrow phone, so on phone we show each scheduled order as a tappable card
// (tap opens the order detail) and point power users to the web / Mac app.
@Composable
private fun ScheduleAgendaCard(
    order: StudioOrder,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val locale = uk.co.eggcraft.studioflow.language.studioLocale(lang)
    val tint = scheduleColor(order)
    val statusTone = statusColorForScheduleValue(scheduleStatusLabel(order))
    val countdown = timelineCountdownText(order)
    val late = orderIsLate(order)
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.18f)),
        onClick = onClick
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(modifier = Modifier.width(5.dp).height(46.dp).clip(RoundedCornerShape(3.dp)).background(tint))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(order.displayCustomerName, modifier = Modifier.weight(1f, fill = false), maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold)
                    Spacer(modifier = Modifier.weight(1f))
                    Surface(shape = RoundedCornerShape(999.dp), color = statusTone.copy(alpha = 0.14f)) {
                        Text(scheduleStatusLabel(order), modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp), color = statusTone, fontSize = 10.5.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1)
                    }
                }
                if (order.designName.isNotBlank()) {
                    Text(order.designName, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Icon(Icons.Filled.DateRange, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(14.dp))
                    Text(
                        "${scheduleDateFormatter(locale).format(orderStartDate(order))} → ${scheduleDateFormatter(locale).format(deliveryDueDate(order))}",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1
                    )
                    if (countdown.isNotBlank()) {
                        Icon(if (late) Icons.Filled.Warning else Icons.Filled.Schedule, contentDescription = null, tint = if (late) StudioWarningOrange else MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(14.dp))
                        Text(countdown, color = if (late) StudioWarningOrange else MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.5.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1)
                    }
                }
            }
            Icon(Icons.AutoMirrored.Filled.ArrowForwardIos, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f), modifier = Modifier.size(13.dp))
        }
    }
}

@Composable
private fun ScheduleAgendaHint(modifier: Modifier = Modifier) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = StudioBlue.copy(alpha = 0.06f),
        border = androidx.compose.foundation.BorderStroke(1.dp, StudioBlue.copy(alpha = 0.18f))
    ) {
        Row(modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Surface(shape = RoundedCornerShape(8.dp), color = StudioBlue.copy(alpha = 0.12f)) {
                Icon(Icons.Filled.Info, contentDescription = null, tint = StudioBlue, modifier = Modifier.padding(6.dp).size(20.dp))
            }
            Text(
                t("This is a quick agenda view. Open NivaDesk on a bigger screen for the full drag-and-drop timeline."),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@Composable
private fun ScheduleAgendaEmpty(modifier: Modifier = Modifier) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Icon(Icons.Filled.DateRange, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f), modifier = Modifier.size(34.dp))
        Text(t("No orders in this schedule range."), fontWeight = FontWeight.ExtraBold)
        Text(t("Use the arrows, filters or search to find scheduled work."), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun ScheduleTimelineBoard(
    range: ScheduleRange,
    visibleOrders: List<StudioOrder>,
    zoom: Double,
    canEditSchedule: Boolean,
    onMoveOrder: (StudioOrder, Int) -> Unit,
    onResizeLeading: (StudioOrder, Int) -> Unit,
    onResizeTrailing: (StudioOrder, Int) -> Unit,
    selectedOrderId: String? = null,
    onSelectOrder: (StudioOrder) -> Unit = {},
    jumpTarget: StudioOrder? = null,
    jumpTick: Int = 0,
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val horizontalState = rememberScrollState()
    val verticalState = rememberScrollState()
    val density = LocalDensity.current
    val baseDayWidth = scheduleTimelineBaseDayWidth(range.days.size)
    val dayWidth = (baseDayWidth * zoom).coerceAtLeast(18.0).dp
    val timelineOrders = remember(visibleOrders, range) {
        visibleOrders
            .filter { timelineMetrics(it, range) != null }
            .sortedWith(compareBy<StudioOrder> { it.isClosed }.thenBy { orderStartDate(it) }.thenBy { deliveryDueDate(it) })
    }
    val timelineWidth = dayWidth * range.days.size.toFloat()
    // "Jump to selected" re-anchors the range in the caller; here we bring the bar itself
    // into view, so the order lands on screen rather than just inside the window.
    LaunchedEffect(jumpTick) {
        if (jumpTick <= 0) return@LaunchedEffect
        val target = jumpTarget ?: return@LaunchedEffect
        val metrics = timelineMetrics(target, range) ?: return@LaunchedEffect
        val targetPx = with(density) { (dayWidth * metrics.offsetDays.toFloat()).toPx() }
        runCatching { horizontalState.animateScrollTo(targetPx.roundToInt().coerceAtLeast(0)) }
    }
    Surface(modifier = modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.background) {
        if (timelineOrders.isEmpty()) {
            Column(
                modifier = Modifier.fillMaxSize().padding(32.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(Icons.Filled.DateRange, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f), modifier = Modifier.size(44.dp))
                Spacer(modifier = Modifier.height(12.dp))
                Text(t("No orders in this schedule range."), fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                Text(t("Use the arrows, filters or search to find scheduled work."), color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
            }
        } else {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .horizontalScroll(horizontalState)
                    .verticalScroll(verticalState)
                    .padding(18.dp)
            ) {
                Column(modifier = Modifier.width(timelineWidth)) {
                    ScheduleTimelineDayHeader(range = range, dayWidth = dayWidth)
                    timelineOrders.forEach { order ->
                        ScheduleTimelineRow(
                            order = order,
                            range = range,
                            dayWidth = dayWidth,
                            timelineWidth = timelineWidth,
                            canEditSchedule = canEditSchedule,
                            selected = !order.isClosed && order.remainingDays <= 7,
                            isPicked = order.id == selectedOrderId,
                            onPick = { onSelectOrder(order) },
                            onMoveOrder = onMoveOrder,
                            onResizeLeading = onResizeLeading,
                            onResizeTrailing = onResizeTrailing
                        )
                    }
                }
            }
        }
    }
}

// Today is a filled accent circle around the day number with an accent line running down
// the grid — a marker you can find at a glance, instead of a whole tinted column.
@Composable
private fun ScheduleTimelineDayHeader(range: ScheduleRange, dayWidth: Dp) {
    Row(modifier = Modifier.fillMaxWidth().height(72.dp)) {
        range.days.forEach { day ->
            val today = isSameScheduleDay(day.date, Date())
            Box(
                modifier = Modifier
                    .width(dayWidth)
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.surface)
                    .border(1.dp, scheduleGridColor()),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(day.weekday, color = if (today) StudioBlue else MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
                    if (today) {
                        Box(
                            modifier = Modifier.size(26.dp).clip(CircleShape).background(StudioBlue),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(day.day, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold)
                        }
                    } else {
                        Text(day.day, color = MaterialTheme.colorScheme.onSurface, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                    }
                }
                if (today) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .width(2.dp)
                            .height(9.dp)
                            .background(StudioBlue.copy(alpha = 0.35f))
                    )
                }
            }
        }
    }
}

// Grab / grabbing / resize cursors for pointer devices (Chromebook, DeX, tablet
// + mouse) so dragging an order on the timeline feels like the Mac/web: open
// hand on hover, closed hand while moving, left–right arrows on the resize edges.
@Composable
private fun rememberSchedulePointerIcon(type: Int): PointerIcon {
    val context = LocalContext.current
    return remember(context, type) { PointerIcon(android.view.PointerIcon.getSystemIcon(context, type)) }
}

@Composable
private fun ScheduleTimelineRow(
    order: StudioOrder,
    range: ScheduleRange,
    dayWidth: Dp,
    timelineWidth: Dp,
    canEditSchedule: Boolean,
    selected: Boolean,
    isPicked: Boolean = false,
    onPick: () -> Unit = {},
    onMoveOrder: (StudioOrder, Int) -> Unit,
    onResizeLeading: (StudioOrder, Int) -> Unit,
    onResizeTrailing: (StudioOrder, Int) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val metrics = timelineMetrics(order, range) ?: return
    val tone = scheduleColor(order)
    val statusTone = statusColorForScheduleValue(scheduleStatusLabel(order))
    val blockX = dayWidth * metrics.offsetDays.toFloat() + 7.dp
    val rawWidth = dayWidth * metrics.durationDays.toFloat() - 14.dp
    val maxWidth = timelineWidth - blockX - 7.dp
    val blockWidth = maxOf(132.dp, minOf(rawWidth, maxWidth))
    var moveOffset by remember(order.id) { mutableFloatStateOf(0f) }
    var isMoving by remember(order.id) { mutableStateOf(false) }
    val grabIcon = rememberSchedulePointerIcon(android.view.PointerIcon.TYPE_GRAB)
    val grabbingIcon = rememberSchedulePointerIcon(android.view.PointerIcon.TYPE_GRABBING)

    Box(
        modifier = Modifier
            .width(timelineWidth)
            .height(68.dp)
            .background(if (isPicked) StudioBlue.copy(alpha = 0.06f) else MaterialTheme.colorScheme.surface)
            .border(1.dp, scheduleGridColor())
            .clickable { onPick() }
    ) {
        Row(modifier = Modifier.fillMaxSize()) {
            val cellGrid = scheduleGridColor()
            range.days.forEach { day ->
                Box(
                    modifier = Modifier
                        .width(dayWidth)
                        .fillMaxSize()
                        .border(1.dp, cellGrid)
                ) {
                    // The accent line under today's circle, carried down every row.
                    if (isSameScheduleDay(day.date, Date())) {
                        Box(
                            modifier = Modifier
                                .align(Alignment.Center)
                                .width(2.dp)
                                .fillMaxHeight()
                                .background(StudioBlue.copy(alpha = 0.35f))
                        )
                    }
                }
            }
        }
        Surface(
            modifier = Modifier
                .offset { IntOffset(moveOffset.roundToInt(), 0) }
                .offset(x = blockX, y = 8.dp)
                .width(blockWidth)
                .height(52.dp)
                .then(if (canEditSchedule) Modifier.pointerHoverIcon(if (isMoving) grabbingIcon else grabIcon) else Modifier)
                .pointerInput(order.id, canEditSchedule, dayWidth) {
                    if (!canEditSchedule) return@pointerInput
                    var dragTotal = 0f
                    detectHorizontalDragGestures(
                        onDragStart = { isMoving = true },
                        onDragCancel = {
                            isMoving = false
                            dragTotal = 0f
                            moveOffset = 0f
                        },
                        onDragEnd = {
                            isMoving = false
                            val deltaDays = (dragTotal / dayWidth.toPx()).roundToInt().coerceIn(-365, 365)
                            if (deltaDays != 0) onMoveOrder(order, deltaDays)
                            dragTotal = 0f
                            moveOffset = 0f
                        }
                    ) { change, dragAmount ->
                        change.consume()
                        dragTotal += dragAmount
                        moveOffset = dragTotal.coerceIn(-dayWidth.toPx() * 6, dayWidth.toPx() * 6)
                    }
                },
            shape = RoundedCornerShape(13.dp),
            color = tone.copy(alpha = if (isPicked) 0.24f else if (orderIsLate(order)) 0.18f else 0.13f),
            border = androidx.compose.foundation.BorderStroke(
                if (isPicked) 2.5.dp else if (selected) 2.dp else 1.dp,
                if (isPicked) StudioBlue else if (selected) StudioBlue.copy(alpha = 0.86f) else tone.copy(alpha = 0.46f)
            ),
            tonalElevation = if (isPicked) 3.dp else 1.dp
        ) {
            Row(
                modifier = Modifier.fillMaxSize().padding(horizontal = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(9.dp)
            ) {
                ScheduleResizeHandle(
                    tint = tone,
                    visible = canEditSchedule,
                    dayWidth = dayWidth,
                    onDelta = { onResizeLeading(order, it) }
                )
                ScheduleTimelineThumbnail(order = order)
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(order.displayCustomerName, maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold)
                        Text("• ${order.designName.ifBlank { "-" }}", maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Surface(shape = RoundedCornerShape(999.dp), color = statusTone.copy(alpha = 0.14f)) {
                            Text(scheduleStatusLabel(order), modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp), color = statusTone, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
                        }
                        Text(
                            "${scheduleDateFormatter(uk.co.eggcraft.studioflow.language.studioLocale(lang)).format(orderStartDate(order))} → ${scheduleDateFormatter(uk.co.eggcraft.studioflow.language.studioLocale(lang)).format(deliveryDueDate(order))}",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        // Inline remaining-days (matches the web schedule bar) instead of a large separate badge.
                        val countdown = timelineCountdownText(order)
                        if (countdown.isNotBlank()) {
                            Text(countdown, color = tone, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
                        }
                    }
                }
                ScheduleResizeHandle(
                    tint = tone,
                    visible = canEditSchedule,
                    dayWidth = dayWidth,
                    onDelta = { onResizeTrailing(order, it) }
                )
            }
        }
    }
}

@Composable
private fun ScheduleResizeHandle(
    tint: Color,
    visible: Boolean,
    dayWidth: Dp,
    onDelta: (Int) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    if (!visible) {
        Spacer(modifier = Modifier.width(1.dp))
        return
    }
    val resizeIcon = rememberSchedulePointerIcon(android.view.PointerIcon.TYPE_HORIZONTAL_DOUBLE_ARROW)
    Box(
        modifier = Modifier
            .width(18.dp)
            .height(52.dp)
            .pointerHoverIcon(resizeIcon)
            .pointerInput(dayWidth) {
                var dragTotal = 0f
                detectHorizontalDragGestures(
                    onDragCancel = { dragTotal = 0f },
                    onDragEnd = {
                        val deltaDays = (dragTotal / dayWidth.toPx()).roundToInt().coerceIn(-365, 365)
                        if (deltaDays != 0) onDelta(deltaDays)
                        dragTotal = 0f
                    }
                ) { change, dragAmount ->
                    change.consume()
                    dragTotal += dragAmount
                }
            },
        contentAlignment = Alignment.Center
    ) {
        Box(modifier = Modifier.width(3.dp).height(28.dp).background(tint.copy(alpha = 0.72f), RoundedCornerShape(999.dp)))
    }
}

@Composable
private fun ScheduleTimelineThumbnail(order: StudioOrder) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    // Preview is only the dedicated preview image (designLink), like Mac/Web.
    val previewUrl = remember(order.id, order.designLink) {
        order.designLink.trim()
    }
    var bitmap by remember(previewUrl) { mutableStateOf<android.graphics.Bitmap?>(null) }
    androidx.compose.runtime.LaunchedEffect(previewUrl) {
        bitmap = null
        if (previewUrl.startsWith("http://") || previewUrl.startsWith("https://")) {
            bitmap = withContext(Dispatchers.IO) {
                runCatching {
                    URL(previewUrl).openStream().use { stream -> BitmapFactory.decodeStream(stream) }
                }.getOrNull()
            }
        }
    }
    Box(
        modifier = Modifier
            .size(38.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center
    ) {
        val previewBitmap = bitmap
        if (previewBitmap != null) {
            Image(
                bitmap = previewBitmap.asImageBitmap(),
                contentDescription = t("Order preview"),
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )
        } else {
            Icon(imageVector = Icons.Filled.Image, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f), modifier = Modifier.size(18.dp))
        }
    }
}

@Composable
private fun ScheduleControl(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    modifier: Modifier,
    onClick: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(modifier = modifier, shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, onClick = onClick) {
        Row(modifier = Modifier.padding(horizontal = 14.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = StudioBlue)
            Spacer(modifier = Modifier.width(10.dp))
            Text(label, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
            Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}


@Composable
private fun ScheduleQuickAction(label: String, active: Boolean, onClick: () -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = if (active) StudioBlue.copy(alpha = 0.14f) else MaterialTheme.colorScheme.surfaceVariant,
        border = if (active) androidx.compose.foundation.BorderStroke(1.dp, StudioBlue.copy(alpha = 0.28f)) else null,
        onClick = onClick
    ) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 13.dp, vertical = 8.dp),
            color = if (active) StudioBlue else MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 13.sp,
            fontWeight = FontWeight.ExtraBold
        )
    }
}

@Composable
private fun ScheduleGrid(
    range: ScheduleRange,
    zoom: Double,
    visibleDayCount: Int,
    canEditSchedule: Boolean,
    onMoveOrder: (StudioOrder, Int) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = Modifier.padding(top = 14.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp
    ) {
        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(0.dp)) {
            Text(range.title, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(bottom = 12.dp))
            BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
                val daysPerViewport = visibleDayCount.coerceIn(1, range.days.size)
                val dayWidth = maxWidth / daysPerViewport.toFloat()
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                ) {
                    range.days.forEach { day ->
                        DayColumn(
                            day = day,
                            zoom = zoom,
                            canEditSchedule = canEditSchedule,
                            onMoveOrder = onMoveOrder,
                            modifier = Modifier.width(dayWidth)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DayColumn(
    day: DayBucket,
    zoom: Double,
    canEditSchedule: Boolean,
    onMoveOrder: (StudioOrder, Int) -> Unit,
    modifier: Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Column(
        modifier = modifier
            .height((360 * zoom).coerceIn(260.0, 620.0).toInt().dp)
            .border(1.dp, scheduleGridColor())
    ) {
        Box(modifier = Modifier.fillMaxWidth().height(80.dp), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(day.weekday, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
                Text(day.day, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
            }
        }
        val maxOrders = when {
            zoom >= 1.55 -> 5
            zoom >= 1.1 -> 4
            else -> 3
        }
        day.orders.take(maxOrders).forEach { order ->
            var dragOffset by remember(order.id) { mutableFloatStateOf(0f) }
            Surface(
                modifier = Modifier
                    .offset { IntOffset(dragOffset.roundToInt(), 0) }
                    .pointerInput(order.id, canEditSchedule) {
                        if (!canEditSchedule) return@pointerInput
                        var dragTotal = 0f
                        detectHorizontalDragGestures(
                            onDragCancel = {
                                dragTotal = 0f
                                dragOffset = 0f
                            },
                            onDragEnd = {
                                val dayDelta = (dragTotal / 90f).roundToInt().coerceIn(-30, 30)
                                if (dayDelta != 0) onMoveOrder(order, dayDelta)
                                dragTotal = 0f
                                dragOffset = 0f
                            }
                        ) { change, dragAmount ->
                            change.consume()
                            dragTotal += dragAmount
                            dragOffset = dragTotal.coerceIn(-180f, 180f)
                        }
                    }
                    .padding(horizontal = 8.dp, vertical = 4.dp)
                    .fillMaxWidth(),
                shape = RoundedCornerShape(8.dp),
                color = if (order.remainingDays < 0) StudioRed.copy(alpha = 0.12f) else StudioGreen.copy(alpha = 0.13f)
            ) {
                Column(modifier = Modifier.padding(8.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = order.displayCustomerName,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "${order.remainingDays}d · ${order.status.ifBlank { t("Open") }}",
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        fontSize = 10.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
        if (day.orders.size > maxOrders) {
            Text(
                text = "+${day.orders.size - maxOrders} more",
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@Composable
private fun ScheduleBoardSummary(
    columns: List<ScheduleBoardColumnSpec>,
    canEditSchedule: Boolean,
    onMoveOrder: (StudioOrder, Int) -> Unit,
    onResizeTrailing: (StudioOrder, Int) -> Unit,
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(Icons.Filled.DateRange, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Column(modifier = Modifier.weight(1f)) {
                    Text(t("Schedule Board"), fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
                    Text(
                        "Mac-style planning lanes for the current filters.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.SemiBold
                    )
                }
                Surface(shape = RoundedCornerShape(999.dp), color = StudioBlue.copy(alpha = 0.12f)) {
                    Text(
                        text = "${columns.sumOf { it.orders.size }} items",
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                        color = StudioBlue,
                        fontWeight = FontWeight.ExtraBold
                    )
                }
            }

            BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
                val availableWidth = maxWidth
                val boardColumnWidth = if (availableWidth >= 1200.dp) 300.dp else 270.dp
                if (availableWidth >= 720.dp) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        columns.forEach { column ->
                            ScheduleBoardColumn(
                                column = column,
                                canEditSchedule = canEditSchedule,
                                onMoveOrder = onMoveOrder,
                                onResizeTrailing = onResizeTrailing,
                                modifier = Modifier.width(boardColumnWidth)
                            )
                        }
                    }
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        columns.forEach { column ->
                            ScheduleBoardColumn(
                                column = column,
                                canEditSchedule = canEditSchedule,
                                onMoveOrder = onMoveOrder,
                                onResizeTrailing = onResizeTrailing,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ScheduleBoardColumn(
    column: ScheduleBoardColumnSpec,
    canEditSchedule: Boolean,
    onMoveOrder: (StudioOrder, Int) -> Unit,
    onResizeTrailing: (StudioOrder, Int) -> Unit,
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.66f)
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Surface(shape = RoundedCornerShape(10.dp), color = column.color.copy(alpha = 0.14f)) {
                    Icon(
                        column.icon,
                        contentDescription = null,
                        tint = column.color,
                        modifier = Modifier
                            .padding(8.dp)
                            .size(18.dp)
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(column.title, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("${column.orders.size} orders", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }

            if (column.orders.isEmpty()) {
                Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface.copy(alpha = 0.78f)) {
                    Text(
                        t("No orders in this lane"),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            } else {
                column.orders.forEach { order ->
                    ScheduleBoardOrderCard(
                        order = order,
                        accent = column.color,
                        canEditSchedule = canEditSchedule,
                        onMoveOrder = onMoveOrder,
                        onResizeTrailing = onResizeTrailing
                    )
                }
            }
        }
    }
}

@Composable
private fun ScheduleBoardOrderCard(
    order: StudioOrder,
    accent: Color,
    canEditSchedule: Boolean,
    onMoveOrder: (StudioOrder, Int) -> Unit,
    onResizeTrailing: (StudioOrder, Int) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var dragOffset by remember(order.id) { mutableFloatStateOf(0f) }
    Surface(
        modifier = Modifier
            .offset { IntOffset(dragOffset.roundToInt(), 0) }
            .pointerInput(order.id, canEditSchedule) {
                if (!canEditSchedule) return@pointerInput
                var dragTotal = 0f
                detectHorizontalDragGestures(
                    onDragCancel = {
                        dragTotal = 0f
                        dragOffset = 0f
                    },
                    onDragEnd = {
                        val dayDelta = (dragTotal / 90f).roundToInt().coerceIn(-30, 30)
                        if (dayDelta != 0) onMoveOrder(order, dayDelta)
                        dragTotal = 0f
                        dragOffset = 0f
                    }
                ) { change, dragAmount ->
                    change.consume()
                    dragTotal += dragAmount
                    dragOffset = dragTotal.coerceIn(-180f, 180f)
                }
            },
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .background(accent, RoundedCornerShape(999.dp))
                )
                Text(
                    order.displayCustomerName,
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    fontWeight = FontWeight.ExtraBold
                )
                Surface(shape = RoundedCornerShape(999.dp), color = deliveryUrgencyColor(order).copy(alpha = 0.14f)) {
                    Text(
                        "${order.remainingDays}d",
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        color = deliveryUrgencyColor(order),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                }
            }
            Text(
                order.designName.ifBlank { "-" },
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.Bold
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.DateRange, contentDescription = null, modifier = Modifier.size(15.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    scheduleDateFormatter(uk.co.eggcraft.studioflow.language.studioLocale(lang)).format(deliveryDueDate(order)),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
                Text("•", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    scheduleStatusLabel(order),
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = accent,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.ExtraBold
                )
            }
            if (order.assignedToEmail.isNotBlank()) {
                Surface(shape = RoundedCornerShape(10.dp), color = StudioBlue.copy(alpha = 0.10f)) {
                    Text(
                        "Assigned to ${displayAssigneeName(order.assignedToEmail)}",
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        color = StudioBlue,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
            if (canEditSchedule) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        ScheduleMiniAction(t("Earlier"), modifier = Modifier.weight(1f)) { onMoveOrder(order, -1) }
                        ScheduleMiniAction(t("Later"), modifier = Modifier.weight(1f)) { onMoveOrder(order, 1) }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        ScheduleMiniAction("Shorter", modifier = Modifier.weight(1f)) { onResizeTrailing(order, -1) }
                        ScheduleMiniAction(t("Longer"), modifier = Modifier.weight(1f)) { onResizeTrailing(order, 1) }
                    }
                }
            }
        }
    }
}

@Composable
private fun ScheduleMiniAction(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(999.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        onClick = onClick
    ) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
            fontSize = 11.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = FontWeight.ExtraBold
        )
    }
}

private data class ScheduleRange(
    val title: String,
    val days: List<DayBucket>,
    val start: Date,
    val endExclusive: Date
) {
    companion object {
        fun from(
            orders: List<StudioOrder>,
            rangeOffset: Int,
            viewMode: ScheduleViewMode,
            anchorDate: Date? = null,
            locale: Locale = Locale.UK
        ): ScheduleRange {
            val calendar = Calendar.getInstance(locale)
            val anchor = anchorDate
                ?: orders.filter { !it.isClosed }.minByOrNull { deliveryDueDate(it) }?.let { deliveryDueDate(it) }
                ?: Date()
            calendar.time = anchor
            calendar.firstDayOfWeek = Calendar.MONDAY
            calendar.set(Calendar.HOUR_OF_DAY, 0)
            calendar.set(Calendar.MINUTE, 0)
            calendar.set(Calendar.SECOND, 0)
            calendar.set(Calendar.MILLISECOND, 0)
            when (viewMode) {
                ScheduleViewMode.Weekly -> {
                    calendar.set(Calendar.DAY_OF_WEEK, Calendar.MONDAY)
                    calendar.add(Calendar.DAY_OF_MONTH, rangeOffset * viewMode.dayCount)
                }
                ScheduleViewMode.Monthly,
                ScheduleViewMode.ThreeMonths,
                ScheduleViewMode.SixMonths -> {
                    calendar.set(Calendar.DAY_OF_MONTH, 1)
                    calendar.add(Calendar.MONTH, rangeOffset * viewMode.monthCount)
                }
                ScheduleViewMode.Yearly -> {
                    calendar.set(Calendar.DAY_OF_YEAR, 1)
                    calendar.add(Calendar.YEAR, rangeOffset)
                }
            }
            val start = calendar.time
            val rangeDayCount = when (viewMode) {
                ScheduleViewMode.Monthly -> calendar.getActualMaximum(Calendar.DAY_OF_MONTH)
                ScheduleViewMode.ThreeMonths,
                ScheduleViewMode.SixMonths -> {
                    val end = Calendar.getInstance(locale).apply {
                        time = start
                        add(Calendar.MONTH, viewMode.monthCount)
                    }
                    scheduleDaysBetween(start, end.time).coerceAtLeast(1)
                }
                ScheduleViewMode.Yearly -> {
                    val end = Calendar.getInstance(locale).apply {
                        time = start
                        add(Calendar.YEAR, 1)
                    }
                    scheduleDaysBetween(start, end.time).coerceAtLeast(1)
                }
                ScheduleViewMode.Weekly -> viewMode.dayCount
            }
            val days = (0 until rangeDayCount).map {
                val dayCalendar = Calendar.getInstance(locale)
                dayCalendar.time = start
                dayCalendar.add(Calendar.DAY_OF_MONTH, it)
                val dayStart = dayCalendar.time
                dayCalendar.add(Calendar.DAY_OF_MONTH, 1)
                val dayEnd = dayCalendar.time
                DayBucket(
                    date = dayStart,
                    weekday = SimpleDateFormat("EEE", locale).format(dayStart),
                    day = SimpleDateFormat("d", locale).format(dayStart),
                    orders = orders.filter { order ->
                        val due = deliveryDueDate(order)
                        due >= dayStart && due < dayEnd
                    }
                )
            }
            val endCalendar = Calendar.getInstance(locale)
            endCalendar.time = start
            endCalendar.add(Calendar.DAY_OF_MONTH, rangeDayCount - 1)
            // Period text mirrors the web toolbar: a month view names the month, a year
            // view names the year, everything else spells out the first and last day.
            val title = when {
                viewMode == ScheduleViewMode.Monthly -> SimpleDateFormat("MMM yyyy", locale).format(start)
                viewMode == ScheduleViewMode.Yearly -> SimpleDateFormat("yyyy", locale).format(start)
                rangeDayCount == 1 -> rangeFormatter(locale).format(start)
                else -> "${rangeFormatter(locale).format(start)} - ${rangeFormatter(locale).format(endCalendar.time)}"
            }
            val endExclusiveCalendar = Calendar.getInstance(locale).apply {
                time = start
                add(Calendar.DAY_OF_MONTH, rangeDayCount)
            }
            return ScheduleRange(title, days, start, endExclusiveCalendar.time)
        }
    }
}

private data class DayBucket(val date: Date, val weekday: String, val day: String, val orders: List<StudioOrder>)

private data class TimelineMetrics(val offsetDays: Int, val durationDays: Int)

private fun scheduleTimelineBaseDayWidth(dayCount: Int): Double {
    return when {
        dayCount <= 7 -> 168.0
        dayCount <= 31 -> 118.0
        dayCount <= 95 -> 58.0
        dayCount <= 190 -> 38.0
        else -> 28.0
    }
}

private data class ScheduleBoardColumnSpec(
    val title: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val color: Color,
    val orders: List<StudioOrder>
)

private enum class ScheduleStatusFilter(val label: String) {
    All("All"),
    ThisWeek("This Week"),
    Active("Active"),
    WaitingCustomer("Waiting Customer"),
    InProduction("In Production"),
    ReadyToShip("Ready to ship"),
    Late("Late Orders"),
    Completed("Completed"),
    Cancelled("Cancelled");

    fun matches(order: StudioOrder): Boolean {
        return when (this) {
            All -> true
            ThisWeek -> orderIsDueThisWeek(order)
            Active -> !orderIsCompleted(order) && !orderIsCancelled(order)
            WaitingCustomer -> orderNeedsCustomerReply(order)
            InProduction -> orderIsInProduction(order)
            ReadyToShip -> orderIsReadyToShip(order)
            Late -> orderIsLate(order)
            Completed -> orderIsCompleted(order)
            Cancelled -> orderIsCancelled(order)
        }
    }

}

private enum class ScheduleSortMode(val label: String) {
    Smart("Smart sort"),
    DeliveryDue("Delivery due"),
    CreatedDate("Recent first"),
    Customer("Customer");

    fun sort(orders: List<StudioOrder>): List<StudioOrder> {
        return when (this) {
            Smart -> orders.sortedWith(
                compareBy<StudioOrder> { it.isClosed }
                    .thenBy { it.remainingDays >= 0 }
                    .thenBy { deliveryDueDate(it) }
                    .thenBy { it.displayCustomerName.lowercase(Locale.ROOT) }
            )
            DeliveryDue -> orders.sortedBy { deliveryDueDate(it) }
            CreatedDate -> orders.sortedByDescending { it.paymentDate }
            Customer -> orders.sortedBy { it.displayCustomerName.lowercase(Locale.ROOT) }
        }
    }
}

// `shortLabel` is what the segmented range control shows (Week | Month | 3M | 6M | Year),
// matching the web toolbar; `label` stays the long name used in menus and accessibility.
private enum class ScheduleViewMode(val label: String, val shortLabel: String, val dayCount: Int, val monthCount: Int = 0) {
    Weekly("Weekly", "Week", 7),
    Monthly("Monthly", "Month", 31, monthCount = 1),
    ThreeMonths("3 Months", "3M", 92, monthCount = 3),
    SixMonths("6 Months", "6M", 184, monthCount = 6),
    Yearly("Yearly", "Year", 366);

    companion object {
        val menuOptions = listOf(Weekly, Monthly, ThreeMonths, SixMonths, Yearly)
    }
}

private fun scheduleVisibleOrders(
    orders: List<StudioOrder>,
    statusFilter: ScheduleStatusFilter,
    sortMode: ScheduleSortMode,
    searchText: String
): List<StudioOrder> {
    val query = searchText.trim().lowercase(Locale.ROOT)
    val filtered = orders
        .asSequence()
        .filter { statusFilter.matches(it) }
        .filter { order -> query.isBlank() || order.matchesScheduleQuery(query) }
        .toList()
    return sortMode.sort(filtered)
}

private fun moveScheduleOrder(
    order: StudioOrder,
    dayDelta: Int,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    if (dayDelta == 0) return
    val nextDate = addScheduleDays(order.paymentDate, dayDelta.coerceIn(-365, 365))
    onUpdateOrderFields(
        order,
        mapOf(
            "details" to mapOf(
                "paymentDate" to schedulePatchDateFormatter.format(nextDate)
            )
        )
    )
}

private fun resizeScheduleOrderLeading(
    order: StudioOrder,
    dayDelta: Int,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    if (dayDelta == 0) return
    val currentDuration = order.deliveryTime.coerceAtLeast(1)
    val clampedDelta = dayDelta.coerceIn(-365, currentDuration - 1)
    if (clampedDelta == 0) return
    val nextStartDate = addScheduleDays(order.paymentDate, clampedDelta)
    val nextDeliveryTime = (currentDuration - clampedDelta).coerceIn(1, 730)
    onUpdateOrderFields(
        order,
        mapOf(
            "details" to mapOf(
                "paymentDate" to schedulePatchDateFormatter.format(nextStartDate),
                "deliveryTime" to nextDeliveryTime
            )
        )
    )
}

private fun resizeScheduleOrderTrailing(
    order: StudioOrder,
    dayDelta: Int,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    if (dayDelta == 0) return
    val nextDeliveryTime = (order.deliveryTime.coerceAtLeast(1) + dayDelta).coerceIn(1, 730)
    if (nextDeliveryTime == order.deliveryTime.coerceAtLeast(1)) return
    onUpdateOrderFields(
        order,
        mapOf(
            "details" to mapOf(
                "deliveryTime" to nextDeliveryTime
            )
        )
    )
}

private fun scheduleBoardColumns(orders: List<StudioOrder>): List<ScheduleBoardColumnSpec> {
    return listOf(
        ScheduleBoardColumnSpec(
            title = "Waiting Customer",
            icon = Icons.Filled.DateRange,
            color = Color(0xFFFF9800),
            orders = orders.filter { orderNeedsCustomerReply(it) }
        ),
        ScheduleBoardColumnSpec(
            title = "In Production",
            icon = Icons.Filled.Inventory2,
            color = StudioGreen,
            orders = orders.filter { orderIsInProduction(it) }
        ),
        ScheduleBoardColumnSpec(
            title = "Ready to Ship",
            icon = Icons.Filled.LocalShipping,
            color = StudioBlue,
            orders = orders.filter { orderIsReadyToShip(it) }
        ),
        ScheduleBoardColumnSpec(
            title = "Late Orders",
            icon = Icons.Filled.Warning,
            color = StudioRed,
            orders = orders.filter { orderIsLate(it) }
        ),
        ScheduleBoardColumnSpec(
            title = "Completed",
            icon = Icons.Filled.Done,
            color = Color(0xFF8E8E93),
            orders = orders.filter { orderIsCompleted(it) || orderIsCancelled(it) }
        )
    )
}

private fun StudioOrder.matchesScheduleQuery(query: String): Boolean {
    return listOf(
        displayCustomerName,
        designName,
        instagramUsername,
        emailAddress,
        assignedToEmail,
        status,
        designStatus,
        priority,
        risk
    ).any { value -> value.lowercase(Locale.ROOT).contains(query) }
}

private fun scheduleOrderTexts(order: StudioOrder): List<String> {
    return buildList {
        add(order.status)
        add(order.designStatus)
        add(order.priority)
        add(order.risk)
        add(order.riskReason)
        add(order.notes)
        add(order.designName)
        add(order.watchRef)
        addAll(order.communication)
        addAll(order.extraStatuses.keys)
        addAll(order.extraStatuses.values)
        addAll(order.customFields.keys)
        addAll(order.customFields.values)
    }
        .map { it.trim().lowercase(Locale.ROOT) }
        .filter { it.isNotBlank() }
}

private fun schedulePrimaryStatus(order: StudioOrder): String {
    return order.status.trim().lowercase(Locale.ROOT)
}

private fun orderIsCancelled(order: StudioOrder): Boolean {
    val status = schedulePrimaryStatus(order)
    return status.contains("cancelled") || status.contains("canceled") || status.contains("refunded")
}

private fun orderIsCompleted(order: StudioOrder): Boolean {
    if (order.isDelivered) return true
    val status = schedulePrimaryStatus(order)
    return status == "done" || status == "completed" || status == "delivered" || status.contains("complete")
}

private fun orderIsLate(order: StudioOrder): Boolean {
    return !orderIsCompleted(order) && !orderIsCancelled(order) && !order.isDispatched && deliveryDueDate(order) < Date()
}

private fun orderIsDueThisWeek(order: StudioOrder): Boolean {
    val calendar = Calendar.getInstance(Locale.UK)
    calendar.firstDayOfWeek = Calendar.MONDAY
    calendar.time = Date()
    calendar.set(Calendar.HOUR_OF_DAY, 0)
    calendar.set(Calendar.MINUTE, 0)
    calendar.set(Calendar.SECOND, 0)
    calendar.set(Calendar.MILLISECOND, 0)
    calendar.set(Calendar.DAY_OF_WEEK, Calendar.MONDAY)
    val weekStart = calendar.time
    calendar.add(Calendar.DAY_OF_MONTH, 7)
    val weekEnd = calendar.time
    val due = deliveryDueDate(order)
    return due >= weekStart && due < weekEnd
}

private fun orderNeedsCustomerReply(order: StudioOrder): Boolean {
    val terms = listOf(
        "waiting for customer",
        "needs reply",
        "reply needed",
        "waiting for approval",
        "client approval",
        "customer approval"
    )
    return scheduleOrderTexts(order).any { text -> terms.any { text.contains(it) } }
}

private fun orderIsReadyToShip(order: StudioOrder): Boolean {
    if (orderIsCompleted(order) || orderIsCancelled(order) || order.isDispatched) return false
    val readyTerms = listOf(
        "ready to ship",
        "ready for shipping",
        "ready for pickup",
        "ready for collection",
        "delivery ready",
        "packed",
        "packaging ready"
    )
    return scheduleOrderTexts(order).any { text -> readyTerms.any { text.contains(it) } }
}

private fun orderIsInProduction(order: StudioOrder): Boolean {
    if (orderIsCompleted(order) || orderIsCancelled(order) || orderNeedsCustomerReply(order) || orderIsReadyToShip(order)) return false
    val productionTerms = listOf(
        "in progress",
        "painting",
        "production",
        "making",
        "sourcing",
        "quality check",
        "revision",
        "draft",
        "preparation"
    )
    val texts = scheduleOrderTexts(order)
    return texts.any { text -> productionTerms.any { text.contains(it) } } || order.status.equals("Not Yet", ignoreCase = true)
}

private fun scheduleStatusLabel(order: StudioOrder): String {
    return when {
        orderIsCancelled(order) -> "Cancelled"
        orderIsLate(order) -> "Late"
        orderIsCompleted(order) -> "Completed"
        orderNeedsCustomerReply(order) -> "Waiting Customer"
        orderIsReadyToShip(order) -> "Ready to Ship"
        orderIsInProduction(order) -> "In Production"
        order.priority.contains("urgent", ignoreCase = true) -> "Urgent"
        else -> order.status.ifBlank { "Normal" }
    }
}

private fun deliveryUrgencyColor(order: StudioOrder): Color {
    return when {
        orderIsLate(order) -> StudioRed
        order.remainingDays <= 7 -> StudioRed
        order.remainingDays <= 14 -> StudioWarningOrange
        else -> StudioGreen
    }
}

@Composable
private fun scheduleGridColor(): Color {
    val isDark = MaterialTheme.colorScheme.surface.luminance() < 0.5f
    return if (isDark) Color.White.copy(alpha = 0.06f) else Color(0xFFE5E5E5)
}

private fun scheduleColor(order: StudioOrder): Color {
    return when {
        orderIsCancelled(order) -> Color(0xFF8E8E93)
        orderIsLate(order) -> StudioRed
        orderIsCompleted(order) -> StudioGreen
        orderNeedsCustomerReply(order) -> Color(0xFFFF9500)
        order.remainingDays <= 7 -> StudioRed
        order.remainingDays <= 14 -> StudioWarningOrange
        else -> StudioGreen
    }
}

private fun statusColorForScheduleValue(status: String): Color {
    val clean = status.trim().lowercase(Locale.ROOT)
    return when {
        clean.contains("cancel") -> Color(0xFF8E8E93)
        clean.contains("late") -> StudioRed
        clean.contains("complete") || clean.contains("done") || clean.contains("deliver") -> StudioGreen
        clean.contains("wait") || clean.contains("not yet") -> Color(0xFFFF3B30)
        clean.contains("production") || clean.contains("progress") -> Color(0xFFFF9500)
        else -> StudioBlue
    }
}

private fun timelineCountdownText(order: StudioOrder): String {
    return when {
        orderIsCompleted(order) || orderIsCancelled(order) -> ""
        order.remainingDays < 0 -> "${kotlin.math.abs(order.remainingDays)}d late"
        order.remainingDays == 0 -> "Today"
        else -> "${order.remainingDays}d"
    }
}

private fun displayAssigneeName(email: String): String {
    val clean = email.trim()
    return clean.substringBefore("@").replace(".", " ").replace("_", " ").ifBlank { clean }
}

private fun orderStartDate(order: StudioOrder): Date = startOfScheduleDay(order.paymentDate)

private fun deliveryDueDate(order: StudioOrder): Date {
    return addScheduleDays(orderStartDate(order), order.deliveryTime.coerceAtLeast(1))
}

private fun addScheduleDays(date: Date, days: Int): Date {
    val calendar = Calendar.getInstance(Locale.UK)
    calendar.time = date
    calendar.add(Calendar.DAY_OF_MONTH, days)
    return calendar.time
}

private fun timelineMetrics(order: StudioOrder, range: ScheduleRange): TimelineMetrics? {
    val start = orderStartDate(order)
    val end = deliveryDueDate(order)
    val clippedStart = maxDate(start, range.start)
    val clippedEnd = minDate(end, range.endExclusive)
    if (!clippedEnd.after(clippedStart)) return null
    return TimelineMetrics(
        offsetDays = scheduleDaysBetween(range.start, clippedStart).coerceAtLeast(0),
        durationDays = scheduleDaysBetween(clippedStart, clippedEnd).coerceAtLeast(1)
    )
}

private fun startOfScheduleDay(date: Date): Date {
    val calendar = Calendar.getInstance(Locale.UK)
    calendar.time = date
    calendar.set(Calendar.HOUR_OF_DAY, 0)
    calendar.set(Calendar.MINUTE, 0)
    calendar.set(Calendar.SECOND, 0)
    calendar.set(Calendar.MILLISECOND, 0)
    return calendar.time
}

private fun scheduleDaysBetween(start: Date, end: Date): Int {
    return ((startOfScheduleDay(end).time - startOfScheduleDay(start).time) / DAY_MS).toInt()
}

private fun isSameScheduleDay(left: Date, right: Date): Boolean {
    return startOfScheduleDay(left).time == startOfScheduleDay(right).time
}

private fun maxDate(left: Date, right: Date): Date = if (left.after(right)) left else right

private fun minDate(left: Date, right: Date): Date = if (left.before(right)) left else right

private fun isScheduleClientImage(contentType: String, fileName: String): Boolean {
    val cleanType = contentType.lowercase(Locale.ROOT)
    val cleanName = fileName.lowercase(Locale.ROOT)
    return cleanType.startsWith("image/") ||
        cleanName.endsWith(".png") ||
        cleanName.endsWith(".jpg") ||
        cleanName.endsWith(".jpeg") ||
        cleanName.endsWith(".webp") ||
        cleanName.endsWith(".gif")
}

private const val DAY_MS = 24L * 60L * 60L * 1000L
private fun rangeFormatter(locale: Locale): SimpleDateFormat = SimpleDateFormat("MMM d", locale)
private fun scheduleDateFormatter(locale: Locale): SimpleDateFormat = SimpleDateFormat("dd/MM/yy", locale)
private val schedulePatchDateFormatter = SimpleDateFormat("yyyy-MM-dd", Locale.US)
