package uk.co.eggcraft.studioflow.features.schedule

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBackIosNew
import androidx.compose.material.icons.filled.ArrowForwardIos
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Done
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.LocalShipping
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt
import uk.co.eggcraft.studioflow.data.model.StudioOrder
import uk.co.eggcraft.studioflow.features.shell.SectionHeader
import uk.co.eggcraft.studioflow.features.shell.StudioFlowUiState
import uk.co.eggcraft.studioflow.ui.theme.StudioBlue
import uk.co.eggcraft.studioflow.ui.theme.StudioGreen
import uk.co.eggcraft.studioflow.ui.theme.StudioRed

@Composable
fun ScheduleScreen(
    state: StudioFlowUiState,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    var rangeOffset by rememberSaveable { mutableIntStateOf(0) }
    var zoom by rememberSaveable { mutableDoubleStateOf(1.0) }
    var statusFilter by rememberSaveable { mutableStateOf(ScheduleStatusFilter.All) }
    var sortMode by rememberSaveable { mutableStateOf(ScheduleSortMode.Smart) }
    var viewMode by rememberSaveable { mutableStateOf(ScheduleViewMode.Weekly) }
    var searchOpen by rememberSaveable { mutableStateOf(false) }
    var searchText by rememberSaveable { mutableStateOf("") }
    var statusMenuOpen by rememberSaveable { mutableStateOf(false) }
    var sortMenuOpen by rememberSaveable { mutableStateOf(false) }
    var viewMenuOpen by rememberSaveable { mutableStateOf(false) }
    val visibleOrders = remember(state.orders, statusFilter, sortMode, searchText) {
        scheduleVisibleOrders(state.orders, statusFilter, sortMode, searchText)
    }
    val range = remember(visibleOrders, rangeOffset, viewMode) {
        ScheduleRange.from(visibleOrders, rangeOffset, viewMode)
    }
    val canEditSchedule = state.workspace?.let { workspace ->
        (workspace.isOwner || workspace.role in setOf("admin", "member", "workflow")) &&
            workspace.memberAccess.orders &&
            workspace.memberAccess.schedule
    } == true
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            SectionHeader(title = "Schedule", subtitle = "See who is doing what and when.")
        }
        item {
            Row(modifier = Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(modifier = Modifier.weight(1f)) {
                    ScheduleControl(
                        label = statusFilter.controlLabel(visibleOrders.size),
                        icon = Icons.Outlined.FilterList,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { statusMenuOpen = true }
                    )
                    DropdownMenu(expanded = statusMenuOpen, onDismissRequest = { statusMenuOpen = false }) {
                        ScheduleStatusFilter.values().forEach { item ->
                            DropdownMenuItem(
                                text = { Text(item.menuLabel(state.orders), fontWeight = FontWeight.Bold) },
                                onClick = {
                                    statusFilter = item
                                    rangeOffset = 0
                                    statusMenuOpen = false
                                }
                            )
                        }
                    }
                }
                Box(modifier = Modifier.weight(1f)) {
                    ScheduleControl(
                        label = sortMode.label,
                        icon = Icons.Outlined.AutoAwesome,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { sortMenuOpen = true }
                    )
                    DropdownMenu(expanded = sortMenuOpen, onDismissRequest = { sortMenuOpen = false }) {
                        ScheduleSortMode.values().forEach { item ->
                            DropdownMenuItem(
                                text = { Text(item.label, fontWeight = FontWeight.Bold) },
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
        if (searchOpen) {
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
                                Icon(Icons.Filled.Close, contentDescription = "Clear search")
                            }
                        }
                    },
                    placeholder = { Text("Search customer, design, status or assignee") }
                )
            }
        }
        item {
            Row(modifier = Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(modifier = Modifier.weight(1f)) {
                    ScheduleControl(
                        label = viewMode.label,
                        icon = Icons.Filled.DateRange,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { viewMenuOpen = true }
                    )
                    DropdownMenu(expanded = viewMenuOpen, onDismissRequest = { viewMenuOpen = false }) {
                        ScheduleViewMode.values().forEach { item ->
                            DropdownMenuItem(
                                text = { Text(item.label, fontWeight = FontWeight.Bold) },
                                onClick = {
                                    viewMode = item
                                    rangeOffset = 0
                                    viewMenuOpen = false
                                }
                            )
                        }
                    }
                }
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = if (searchOpen) StudioBlue.copy(alpha = 0.14f) else MaterialTheme.colorScheme.surfaceVariant
                ) {
                    IconButton(
                        onClick = {
                            if (searchOpen && searchText.isBlank()) {
                                searchOpen = false
                            } else if (searchOpen) {
                                searchText = ""
                            } else {
                                searchOpen = true
                            }
                        },
                        modifier = Modifier.size(54.dp)
                    ) {
                        Icon(
                            if (searchOpen && searchText.isNotBlank()) Icons.Filled.Close else Icons.Filled.Search,
                            contentDescription = "Search schedule",
                            tint = if (searchOpen) StudioBlue else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
        item {
            Row(modifier = Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                ArrowButton(Icons.Filled.ArrowBackIosNew) { rangeOffset -= 1 }
                ArrowButton(Icons.Filled.ArrowForwardIos) { rangeOffset += 1 }
                Surface(
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    onClick = { rangeOffset = 0 }
                ) {
                    Text(range.title, modifier = Modifier.padding(horizontal = 18.dp, vertical = 14.dp), fontSize = 17.sp, fontWeight = FontWeight.ExtraBold)
                }
            }
        }
        item {
            Row(modifier = Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                    Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = { zoom = (zoom - 0.15).coerceAtLeast(0.45) }, modifier = Modifier.size(34.dp)) {
                            Icon(Icons.Filled.Remove, contentDescription = "Zoom out", tint = StudioBlue)
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Text("${(zoom * 100).toInt()}%", fontWeight = FontWeight.ExtraBold)
                        Spacer(modifier = Modifier.width(10.dp))
                        IconButton(onClick = { zoom = (zoom + 0.15).coerceAtMost(2.20) }, modifier = Modifier.size(34.dp)) {
                            Icon(Icons.Filled.Add, contentDescription = "Zoom in", tint = StudioBlue)
                        }
                        Spacer(modifier = Modifier.width(4.dp))
                        IconButton(onClick = { zoom = 1.0 }, modifier = Modifier.size(34.dp)) {
                            Icon(Icons.Filled.Refresh, contentDescription = "Reset zoom", tint = StudioBlue)
                        }
                    }
                }
            }
        }
        item {
            Surface(
                modifier = Modifier.padding(horizontal = 16.dp),
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant
            ) {
                Text(
                    text = "${visibleOrders.size} scheduled orders shown · ${visibleOrders.count { orderIsLate(it) }} late · ${visibleOrders.count { orderIsReadyToShip(it) }} ready to ship",
                    modifier = Modifier.padding(14.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Bold
                )
            }
        }
        item {
            BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
                val dayCount = when {
                    maxWidth >= 1100.dp -> 7
                    maxWidth >= 720.dp -> 4
                    else -> 2
                }
            ScheduleGrid(
                range = range,
                zoom = zoom,
                visibleDayCount = dayCount.coerceAtMost(viewMode.dayCount),
                canEditSchedule = canEditSchedule,
                onMoveOrder = { order, days -> moveScheduleOrder(order, days, onUpdateOrderFields) }
            )
            }
        }
        item {
            ScheduleBoardSummary(
                columns = remember(visibleOrders) { scheduleBoardColumns(visibleOrders) },
                canEditSchedule = canEditSchedule,
                onMoveOrder = { order, days -> moveScheduleOrder(order, days, onUpdateOrderFields) },
                onResizeTrailing = { order, days -> resizeScheduleOrderTrailing(order, days, onUpdateOrderFields) },
                modifier = Modifier.padding(horizontal = 16.dp)
            )
        }
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                FooterMetric("${visibleOrders.size} orders", Icons.Filled.Inventory2)
                FooterMetric("${visibleOrders.count { orderIsLate(it) }} Late", Icons.Filled.Warning)
                FooterMetric("${visibleOrders.count { orderIsReadyToShip(it) }} Ready\nto Ship", Icons.Filled.Inventory2)
                Text(
                    text = "Use filters,\narrows and zoom\nto plan the\nvisible range.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.SemiBold,
                    lineHeight = 17.sp
                )
            }
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
private fun ArrowButton(icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
        IconButton(onClick = onClick, modifier = Modifier.size(52.dp)) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface)
        }
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
    Surface(
        modifier = Modifier.padding(top = 14.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp
    ) {
        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(0.dp)) {
            Text(range.title, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(bottom = 12.dp))
            Row(modifier = Modifier.fillMaxWidth()) {
                range.days.take(visibleDayCount.coerceIn(1, range.days.size)).forEach { day ->
                    DayColumn(
                        day = day,
                        zoom = zoom,
                        canEditSchedule = canEditSchedule,
                        onMoveOrder = onMoveOrder,
                        modifier = Modifier.weight(1f)
                    )
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
    Column(
        modifier = modifier
            .height((360 * zoom).coerceIn(260.0, 620.0).toInt().dp)
            .border(1.dp, Color(0xFFE6E6E6))
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
                        text = "${order.remainingDays}d · ${order.status.ifBlank { "Open" }}",
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
                    Text("Schedule Board", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
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
                        "No orders in this lane",
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
                    scheduleDateFormatter.format(deliveryDueDate(order)),
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
                        ScheduleMiniAction("Earlier", modifier = Modifier.weight(1f)) { onMoveOrder(order, -1) }
                        ScheduleMiniAction("Later", modifier = Modifier.weight(1f)) { onMoveOrder(order, 1) }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        ScheduleMiniAction("Shorter", modifier = Modifier.weight(1f)) { onResizeTrailing(order, -1) }
                        ScheduleMiniAction("Longer", modifier = Modifier.weight(1f)) { onResizeTrailing(order, 1) }
                    }
                }
            }
        }
    }
}

@Composable
private fun ScheduleMiniAction(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
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

@Composable
private fun FooterMetric(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold, lineHeight = 16.sp)
    }
}

private data class ScheduleRange(val title: String, val days: List<DayBucket>) {
    companion object {
        fun from(orders: List<StudioOrder>, rangeOffset: Int, viewMode: ScheduleViewMode): ScheduleRange {
            val calendar = Calendar.getInstance(Locale.UK)
            val anchor = orders.filter { !it.isClosed }.minByOrNull { deliveryDueDate(it) }?.let { deliveryDueDate(it) } ?: Date()
            calendar.time = anchor
            calendar.firstDayOfWeek = Calendar.MONDAY
            calendar.set(Calendar.HOUR_OF_DAY, 0)
            calendar.set(Calendar.MINUTE, 0)
            calendar.set(Calendar.SECOND, 0)
            calendar.set(Calendar.MILLISECOND, 0)
            if (viewMode == ScheduleViewMode.Weekly) {
                calendar.set(Calendar.DAY_OF_WEEK, Calendar.MONDAY)
            }
            calendar.add(Calendar.DAY_OF_MONTH, rangeOffset * viewMode.dayCount)
            val start = calendar.time
            val days = (0 until viewMode.dayCount).map {
                val dayCalendar = Calendar.getInstance(Locale.UK)
                dayCalendar.time = start
                dayCalendar.add(Calendar.DAY_OF_MONTH, it)
                val dayStart = dayCalendar.time
                dayCalendar.add(Calendar.DAY_OF_MONTH, 1)
                val dayEnd = dayCalendar.time
                DayBucket(
                    weekday = SimpleDateFormat("EEE", Locale.UK).format(dayStart),
                    day = SimpleDateFormat("d", Locale.UK).format(dayStart),
                    orders = orders.filter { order ->
                        val due = deliveryDueDate(order)
                        due >= dayStart && due < dayEnd
                    }
                )
            }
            val endCalendar = Calendar.getInstance(Locale.UK)
            endCalendar.time = start
            endCalendar.add(Calendar.DAY_OF_MONTH, viewMode.dayCount - 1)
            val title = if (viewMode.dayCount == 1) {
                rangeFormatter.format(start)
            } else {
                "${rangeFormatter.format(start)} - ${rangeFormatter.format(endCalendar.time)}"
            }
            return ScheduleRange(title, days)
        }
    }
}

private data class DayBucket(val weekday: String, val day: String, val orders: List<StudioOrder>)

private data class ScheduleBoardColumnSpec(
    val title: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val color: Color,
    val orders: List<StudioOrder>
)

private enum class ScheduleStatusFilter(val label: String) {
    All("All statuses"),
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
            Active -> !orderIsCompleted(order) && !orderIsCancelled(order)
            WaitingCustomer -> orderNeedsCustomerReply(order)
            InProduction -> orderIsInProduction(order)
            ReadyToShip -> orderIsReadyToShip(order)
            Late -> orderIsLate(order)
            Completed -> orderIsCompleted(order)
            Cancelled -> orderIsCancelled(order)
        }
    }

    fun controlLabel(visibleCount: Int): String {
        return when (this) {
            All -> "All statuses · $visibleCount"
            else -> "$label · $visibleCount"
        }
    }

    fun menuLabel(orders: List<StudioOrder>): String = "$label (${orders.count { matches(it) }})"
}

private enum class ScheduleSortMode(val label: String) {
    Smart("Smart"),
    DeliveryDue("Delivery due"),
    CreatedDate("Created date"),
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

private enum class ScheduleViewMode(val label: String, val dayCount: Int) {
    Day("Daily", 1),
    ThreeDays("3 Days", 3),
    Weekly("Weekly", 7)
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
        order.remainingDays <= 7 -> Color(0xFFFF9500)
        else -> StudioGreen
    }
}

private fun displayAssigneeName(email: String): String {
    val clean = email.trim()
    return clean.substringBefore("@").replace(".", " ").replace("_", " ").ifBlank { clean }
}

private fun deliveryDueDate(order: StudioOrder): Date {
    return Date(order.paymentDate.time + order.deliveryTime.coerceAtLeast(1) * DAY_MS)
}

private fun addScheduleDays(date: Date, days: Int): Date {
    val calendar = Calendar.getInstance(Locale.UK)
    calendar.time = date
    calendar.add(Calendar.DAY_OF_MONTH, days)
    return calendar.time
}

private const val DAY_MS = 24L * 60L * 60L * 1000L
private val rangeFormatter = SimpleDateFormat("MMM d", Locale.UK)
private val scheduleDateFormatter = SimpleDateFormat("dd/MM/yy", Locale.UK)
private val schedulePatchDateFormatter = SimpleDateFormat("yyyy-MM-dd", Locale.US)
