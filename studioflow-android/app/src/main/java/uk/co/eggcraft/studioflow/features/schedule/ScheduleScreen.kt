package uk.co.eggcraft.studioflow.features.schedule

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForwardIos
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBackIosNew
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Done
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.LocalShipping
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
import androidx.compose.ui.input.pointer.pointerInput
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
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var rangeOffset by rememberSaveable { mutableIntStateOf(0) }
    var zoom by rememberSaveable { mutableDoubleStateOf(1.0) }
    var statusFilter by rememberSaveable { mutableStateOf(ScheduleStatusFilter.All) }
    var sortMode by rememberSaveable { mutableStateOf(ScheduleSortMode.Smart) }
    var viewMode by rememberSaveable { mutableStateOf(ScheduleViewMode.Weekly) }
    var anchorToCurrentDate by rememberSaveable { mutableStateOf(false) }
    var searchOpen by rememberSaveable { mutableStateOf(false) }
    var searchText by rememberSaveable { mutableStateOf("") }
    var statusMenuOpen by rememberSaveable { mutableStateOf(false) }
    var sortMenuOpen by rememberSaveable { mutableStateOf(false) }
    var viewMenuOpen by rememberSaveable { mutableStateOf(false) }
    val visibleOrders = remember(state.orders, statusFilter, sortMode, searchText) {
        scheduleVisibleOrders(state.orders, statusFilter, sortMode, searchText)
    }
    val locale = uk.co.eggcraft.studioflow.language.studioLocale(lang)
    val range = remember(visibleOrders, rangeOffset, viewMode, anchorToCurrentDate, locale) {
        ScheduleRange.from(
            orders = visibleOrders,
            rangeOffset = rangeOffset,
            viewMode = viewMode,
            anchorDate = if (anchorToCurrentDate) Date() else null,
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
        if (useDesktopTimeline) {
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
                    anchorToCurrentDate = next == ScheduleStatusFilter.ThisWeek
                    rangeOffset = 0
                },
                onSortModeChange = { sortMode = it },
                onViewModeChange = { next ->
                    viewMode = next
                    anchorToCurrentDate = true
                    rangeOffset = 0
                },
                onSearchChange = {
                    searchText = it
                    rangeOffset = 0
                },
                onPreviousRange = { rangeOffset -= 1 },
                onNextRange = { rangeOffset += 1 },
                onResetRange = {
                    anchorToCurrentDate = true
                    rangeOffset = 0
                },
                onZoomChange = { zoom = it.coerceIn(0.45, 2.20) },
                onMoveOrder = { order, days -> moveScheduleOrder(order, days, onUpdateOrderFields) },
                onResizeLeading = { order, days -> resizeScheduleOrderLeading(order, days, onUpdateOrderFields) },
                onResizeTrailing = { order, days -> resizeScheduleOrderTrailing(order, days, onUpdateOrderFields) }
            )
        } else {
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
                                    anchorToCurrentDate = item == ScheduleStatusFilter.ThisWeek
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
                                Icon(Icons.Filled.Close, contentDescription = t("Clear search"))
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
                        ScheduleViewMode.menuOptions.forEach { item ->
                            DropdownMenuItem(
                                text = { Text(item.label, fontWeight = FontWeight.Bold) },
                                onClick = {
                                    viewMode = item
                                    anchorToCurrentDate = true
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
                ArrowButton(Icons.AutoMirrored.Filled.ArrowForwardIos) { rangeOffset += 1 }
                Surface(
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    onClick = {
                        anchorToCurrentDate = true
                        rangeOffset = 0
                    }
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
            Row(
                modifier = Modifier
                    .padding(horizontal = 16.dp)
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                ScheduleViewMode.menuOptions.forEach { item ->
                    ScheduleQuickAction(
                        label = item.label,
                        active = anchorToCurrentDate && viewMode == item && rangeOffset == 0
                    ) {
                        viewMode = item
                        anchorToCurrentDate = true
                        rangeOffset = 0
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
                    text = if (canEditSchedule) {
                        "Drag blocks to\nmove dates. Pull\nedges to resize."
                    } else {
                        "Read-only\nschedule view."
                    },
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.SemiBold,
                    lineHeight = 17.sp
                )
            }
        }
            }
        }
    }
}

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
    onMoveOrder: (StudioOrder, Int) -> Unit,
    onResizeLeading: (StudioOrder, Int) -> Unit,
    onResizeTrailing: (StudioOrder, Int) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        Surface(color = MaterialTheme.colorScheme.surface, shadowElevation = 1.dp) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 22.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(t("Schedule"), fontSize = 24.sp, fontWeight = FontWeight.ExtraBold)
                    Text(
                        "See who is doing what and when.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.SemiBold
                    )
                }
                ScheduleDesktopControls(
                    allOrders = allOrders,
                    rangeTitle = range.title,
                    zoom = zoom,
                    statusFilter = statusFilter,
                    sortMode = sortMode,
                    viewMode = viewMode,
                    searchText = searchText,
                    onStatusFilterChange = onStatusFilterChange,
                    onSortModeChange = onSortModeChange,
                    onViewModeChange = onViewModeChange,
                    onSearchChange = onSearchChange,
                    onPreviousRange = onPreviousRange,
                    onNextRange = onNextRange,
                    onResetRange = onResetRange,
                    onZoomChange = onZoomChange
                )
                SchedulePlanNotice()
            }
        }
        ScheduleTimelineBoard(
            range = range,
            visibleOrders = visibleOrders,
            zoom = zoom,
            canEditSchedule = canEditSchedule,
            onMoveOrder = onMoveOrder,
            onResizeLeading = onResizeLeading,
            onResizeTrailing = onResizeTrailing,
            modifier = Modifier.weight(1f)
        )
        ScheduleTimelineFooter(visibleOrders = visibleOrders, canEditSchedule = canEditSchedule)
    }
}

@Composable
private fun ScheduleDesktopControls(
    allOrders: List<StudioOrder>,
    rangeTitle: String,
    zoom: Double,
    statusFilter: ScheduleStatusFilter,
    sortMode: ScheduleSortMode,
    viewMode: ScheduleViewMode,
    searchText: String,
    onStatusFilterChange: (ScheduleStatusFilter) -> Unit,
    onSortModeChange: (ScheduleSortMode) -> Unit,
    onViewModeChange: (ScheduleViewMode) -> Unit,
    onSearchChange: (String) -> Unit,
    onPreviousRange: () -> Unit,
    onNextRange: () -> Unit,
    onResetRange: () -> Unit,
    onZoomChange: (Double) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var statusMenuOpen by rememberSaveable { mutableStateOf(false) }
    var sortMenuOpen by rememberSaveable { mutableStateOf(false) }
    var viewMenuOpen by rememberSaveable { mutableStateOf(false) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(modifier = Modifier.width(188.dp)) {
            ScheduleDesktopControl(
                label = if (statusFilter == ScheduleStatusFilter.All) t("Filter by Status") else statusFilter.label,
                icon = Icons.Outlined.FilterList,
                modifier = Modifier.fillMaxWidth(),
                onClick = { statusMenuOpen = true }
            )
            DropdownMenu(expanded = statusMenuOpen, onDismissRequest = { statusMenuOpen = false }) {
                ScheduleStatusFilter.values().forEach { item ->
                    DropdownMenuItem(
                        text = { Text(item.menuLabel(allOrders), fontWeight = FontWeight.Bold) },
                        onClick = {
                            onStatusFilterChange(item)
                            statusMenuOpen = false
                        }
                    )
                }
            }
        }
        Box(modifier = Modifier.width(138.dp)) {
            ScheduleDesktopControl(
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
                            onSortModeChange(item)
                            sortMenuOpen = false
                        }
                    )
                }
            }
        }
        OutlinedTextField(
            value = searchText,
            onValueChange = onSearchChange,
            modifier = Modifier.width(310.dp),
            singleLine = true,
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
            placeholder = { Text(t("Search Tasks")) }
        )
        Spacer(modifier = Modifier.width(12.dp))
        ArrowButton(Icons.Filled.ArrowBackIosNew, onClick = onPreviousRange)
        ArrowButton(Icons.AutoMirrored.Filled.ArrowForwardIos, onClick = onNextRange)
        Surface(
            modifier = Modifier.width(260.dp),
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surfaceVariant,
            onClick = onResetRange
        ) {
            Text(
                rangeTitle,
                modifier = Modifier.padding(horizontal = 18.dp, vertical = 14.dp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                fontSize = 16.sp,
                fontWeight = FontWeight.ExtraBold
            )
        }
        ScheduleDesktopZoomControls(zoom = zoom, onZoomChange = onZoomChange)
        Box(modifier = Modifier.width(176.dp)) {
            ScheduleDesktopControl(
                label = viewMode.label,
                icon = Icons.Filled.DateRange,
                modifier = Modifier.fillMaxWidth(),
                onClick = { viewMenuOpen = true }
            )
            DropdownMenu(expanded = viewMenuOpen, onDismissRequest = { viewMenuOpen = false }) {
                ScheduleViewMode.menuOptions.forEach { item ->
                    DropdownMenuItem(
                        text = { Text(item.label, fontWeight = FontWeight.Bold) },
                        onClick = {
                            onViewModeChange(item)
                            viewMenuOpen = false
                        }
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

@Composable
private fun ScheduleDesktopZoomControls(zoom: Double, onZoomChange: (Double) -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
        Row(modifier = Modifier.padding(horizontal = 8.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { onZoomChange(zoom - 0.15) }, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Filled.Remove, contentDescription = "Zoom out", tint = StudioBlue)
            }
            Text("${(zoom * 100).roundToInt()}%", modifier = Modifier.width(48.dp), fontWeight = FontWeight.ExtraBold, fontSize = 13.sp)
            IconButton(onClick = { onZoomChange(zoom + 0.15) }, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Filled.Add, contentDescription = "Zoom in", tint = StudioBlue)
            }
            IconButton(onClick = { onZoomChange(1.0) }, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Filled.Refresh, contentDescription = "Reset zoom", tint = StudioBlue)
            }
        }
    }
}

@Composable
private fun SchedulePlanNotice() {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFE2E2E2))
    ) {
        Row(modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Surface(shape = RoundedCornerShape(8.dp), color = Color(0xFFD12EF2).copy(alpha = 0.12f)) {
                Icon(Icons.Filled.People, contentDescription = null, tint = Color(0xFFD12EF2), modifier = Modifier.padding(6.dp).size(22.dp))
            }
            Text(
                "Team includes shared schedule planning for the whole workspace.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.ExtraBold
            )
        }
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
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val horizontalState = rememberScrollState()
    val verticalState = rememberScrollState()
    val baseDayWidth = scheduleTimelineBaseDayWidth(range.days.size)
    val dayWidth = (baseDayWidth * zoom).coerceAtLeast(18.0).dp
    val timelineOrders = remember(visibleOrders, range) {
        visibleOrders
            .filter { timelineMetrics(it, range) != null }
            .sortedWith(compareBy<StudioOrder> { it.isClosed }.thenBy { orderStartDate(it) }.thenBy { deliveryDueDate(it) })
    }
    val timelineWidth = dayWidth * range.days.size.toFloat()
    Surface(modifier = modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.background) {
        if (timelineOrders.isEmpty()) {
            Column(
                modifier = Modifier.fillMaxSize().padding(32.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(Icons.Filled.DateRange, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f), modifier = Modifier.size(44.dp))
                Spacer(modifier = Modifier.height(12.dp))
                Text("No orders in this schedule range.", fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                Text("Use the arrows, filters or search to find scheduled work.", color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
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
                    ScheduleTimelineTitleRow(range = range, orderCount = timelineOrders.size)
                    ScheduleTimelineDayHeader(range = range, dayWidth = dayWidth)
                    timelineOrders.forEach { order ->
                        ScheduleTimelineRow(
                            order = order,
                            range = range,
                            dayWidth = dayWidth,
                            timelineWidth = timelineWidth,
                            canEditSchedule = canEditSchedule,
                            selected = !order.isClosed && order.remainingDays <= 7,
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

@Composable
private fun ScheduleTimelineTitleRow(range: ScheduleRange, orderCount: Int) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp
    ) {
        Row(modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(range.title, modifier = Modifier.weight(1f), fontSize = 16.sp, fontWeight = FontWeight.ExtraBold)
            Text("$orderCount orders", color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun ScheduleTimelineDayHeader(range: ScheduleRange, dayWidth: Dp) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(modifier = Modifier.fillMaxWidth().height(72.dp)) {
        range.days.forEach { day ->
            val today = isSameScheduleDay(day.date, Date())
            Box(
                modifier = Modifier
                    .width(dayWidth)
                    .fillMaxSize()
                    .background(if (today) StudioBlue.copy(alpha = 0.08f) else MaterialTheme.colorScheme.surface)
                    .border(1.dp, Color(0xFFE5E5E5)),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(day.weekday, color = if (today) StudioBlue else MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
                    Text(day.day, color = if (today) StudioBlue else MaterialTheme.colorScheme.onSurface, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                }
            }
        }
    }
}

@Composable
private fun ScheduleTimelineRow(
    order: StudioOrder,
    range: ScheduleRange,
    dayWidth: Dp,
    timelineWidth: Dp,
    canEditSchedule: Boolean,
    selected: Boolean,
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

    Box(
        modifier = Modifier
            .width(timelineWidth)
            .height(68.dp)
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, Color(0xFFE5E5E5))
    ) {
        Row(modifier = Modifier.fillMaxSize()) {
            range.days.forEach { day ->
                Box(
                    modifier = Modifier
                        .width(dayWidth)
                        .fillMaxSize()
                        .background(if (isSameScheduleDay(day.date, Date())) StudioBlue.copy(alpha = 0.04f) else Color.Transparent)
                        .border(1.dp, Color(0xFFEAEAEA))
                )
            }
        }
        Surface(
            modifier = Modifier
                .offset { IntOffset(moveOffset.roundToInt(), 0) }
                .offset(x = blockX, y = 8.dp)
                .width(blockWidth)
                .height(52.dp)
                .pointerInput(order.id, canEditSchedule, dayWidth) {
                    if (!canEditSchedule) return@pointerInput
                    var dragTotal = 0f
                    detectHorizontalDragGestures(
                        onDragCancel = {
                            dragTotal = 0f
                            moveOffset = 0f
                        },
                        onDragEnd = {
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
            color = tone.copy(alpha = if (orderIsLate(order)) 0.18f else 0.13f),
            border = androidx.compose.foundation.BorderStroke(if (selected) 2.dp else 1.dp, if (selected) StudioBlue.copy(alpha = 0.86f) else tone.copy(alpha = 0.46f)),
            tonalElevation = 1.dp
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
                if (canEditSchedule) {
                    Icon(Icons.Outlined.FilterList, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.70f), modifier = Modifier.size(17.dp))
                }
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
                    }
                }
                val countdown = timelineCountdownText(order)
                if (countdown.isNotBlank()) {
                    Surface(shape = RoundedCornerShape(9.dp), color = tone.copy(alpha = 0.16f)) {
                        Text(countdown, modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp), color = tone, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold)
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
    Box(
        modifier = Modifier
            .width(18.dp)
            .height(52.dp)
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
    val previewUrl = remember(order.id, order.designLink, order.clientFiles) {
        order.designLink.trim().ifBlank {
            order.clientFiles.firstOrNull {
                isScheduleClientImage(it.contentType, it.fileName) && it.downloadUrl.isNotBlank()
            }?.downloadUrl.orEmpty()
        }
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
private fun ScheduleTimelineFooter(visibleOrders: List<StudioOrder>, canEditSchedule: Boolean) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(color = MaterialTheme.colorScheme.surface, shadowElevation = 1.dp) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 22.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(28.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            FooterMetric("${visibleOrders.size} orders", Icons.Filled.Inventory2)
            FooterMetric("${visibleOrders.count { orderIsLate(it) }} Late", Icons.Filled.Warning)
            FooterMetric("${visibleOrders.count { orderIsReadyToShip(it) }} Ready to Ship", Icons.Filled.Inventory2)
            Text(
                if (canEditSchedule) "Drag blocks to move dates. Pull the edges to resize." else t("Read-only schedule view."),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.SemiBold
            )
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
private fun ArrowButton(icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
        IconButton(onClick = onClick, modifier = Modifier.size(52.dp)) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface)
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

@Composable
private fun FooterMetric(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold, lineHeight = 16.sp)
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
            val title = if (rangeDayCount == 1) {
                rangeFormatter(locale).format(start)
            } else {
                "${rangeFormatter(locale).format(start)} - ${rangeFormatter(locale).format(endCalendar.time)}"
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
    All("All statuses"),
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

private enum class ScheduleViewMode(val label: String, val dayCount: Int, val monthCount: Int = 0) {
    Weekly("Weekly", 7),
    Monthly("Monthly", 31, monthCount = 1),
    ThreeMonths("3 Months", 92, monthCount = 3),
    SixMonths("6 Months", 184, monthCount = 6),
    Yearly("Yearly", 366);

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
