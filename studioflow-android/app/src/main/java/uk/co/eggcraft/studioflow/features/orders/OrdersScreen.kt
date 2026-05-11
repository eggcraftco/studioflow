package uk.co.eggcraft.studioflow.features.orders

import android.content.Context
import android.graphics.BitmapFactory
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Calculate
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import uk.co.eggcraft.studioflow.data.model.StudioOrder
import uk.co.eggcraft.studioflow.data.model.StudioTeamMember
import uk.co.eggcraft.studioflow.data.model.StudioWorkspace
import uk.co.eggcraft.studioflow.data.model.emailName
import uk.co.eggcraft.studioflow.features.shell.StudioFlowUiState
import uk.co.eggcraft.studioflow.ui.theme.StudioBlue
import uk.co.eggcraft.studioflow.ui.theme.StudioGreen
import uk.co.eggcraft.studioflow.ui.theme.StudioRed
import uk.co.eggcraft.studioflow.ui.theme.StudioWarningOrange

@Composable
fun OrdersScreen(
    state: StudioFlowUiState,
    onAssignOrder: (StudioOrder, StudioTeamMember?) -> Unit,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onUploadClientFile: (StudioOrder, ByteArray, String, String) -> Unit,
    onUploadPreviewImage: (StudioOrder, ByteArray, String, String) -> Unit,
    onRefreshLiveTracking: (StudioOrder) -> Unit,
    onRenameClientFile: (StudioOrder, String, String) -> Unit,
    onDeleteClientFile: (StudioOrder, String) -> Unit,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit
) {
    val workspace = state.workspace
    val context = LocalContext.current
    val ordersPrefs = remember(context, state.user?.uid, workspace?.id) {
        context.getSharedPreferences(ordersPreferenceName(state.user?.uid, workspace?.id), Context.MODE_PRIVATE)
    }
    var searchText by rememberSaveable(workspace?.id, state.user?.uid) {
        mutableStateOf(ordersPrefs.getString(OrdersSearchKey, "").orEmpty())
    }
    var filterMenuOpen by remember { mutableStateOf(false) }
    var selectedFilter by rememberSaveable(workspace?.id, state.user?.uid) {
        mutableStateOf(orderFilterFromKey(ordersPrefs.getString(OrdersFilterKey, OrderFilter.All.key)))
    }
    var selectedSortMode by rememberSaveable(workspace?.id, state.user?.uid) {
        mutableStateOf(orderSortModeFromKey(ordersPrefs.getString(OrdersSortKey, OrderSortMode.Smart.key)))
    }
    var selectedOrderId by rememberSaveable { mutableStateOf<String?>(null) }
    val selectedOrder = selectedOrderId?.let { id -> state.orders.firstOrNull { it.id == id } }
    val currentUserId = state.user?.uid.orEmpty()
    val currentUserEmail = state.user?.email.orEmpty()
    val onSearchTextChange: (String) -> Unit = { value ->
        searchText = value
        ordersPrefs.edit().putString(OrdersSearchKey, value).apply()
    }
    val onFilterSelected: (OrderFilter) -> Unit = { filter ->
        selectedFilter = filter
        ordersPrefs.edit().putString(OrdersFilterKey, filter.key).apply()
    }
    val onSortModeSelected: (OrderSortMode) -> Unit = { mode ->
        selectedSortMode = mode
        ordersPrefs.edit().putString(OrdersSortKey, mode.key).apply()
    }
    val visibleOrders = remember(
        state.orders,
        state.teamMembers,
        searchText,
        selectedFilter,
        selectedSortMode,
        currentUserId,
        currentUserEmail
    ) {
        val query = searchText.trim()
        val searched = if (query.isBlank()) {
            state.orders
        } else {
            state.orders.filter { order -> orderSearchMatches(order, state.teamMembers, query) }
        }
        selectedSortMode.sort(searched.filter { order ->
            selectedFilter.matches(order, currentUserId, currentUserEmail)
        })
    }

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val isWide = maxWidth >= 900.dp
        val containerWidth = maxWidth
        LaunchedEffect(isWide, visibleOrders, selectedOrderId) {
            if (!isWide) return@LaunchedEffect
            val stillVisible = visibleOrders.any { it.id == selectedOrderId }
            if (!stillVisible) {
                selectedOrderId = visibleOrders.firstOrNull()?.id
            }
        }
        if (isWide) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background)
            ) {
                OrderListPane(
                    state = state,
                    visibleOrders = visibleOrders,
                    selectedOrderId = selectedOrderId,
                    searchText = searchText,
                    onSearchTextChange = onSearchTextChange,
                    selectedFilter = selectedFilter,
                    selectedSortMode = selectedSortMode,
                    filterMenuOpen = filterMenuOpen,
                    onFilterMenuOpenChange = { filterMenuOpen = it },
                    onFilterSelected = onFilterSelected,
                    onSortModeSelected = onSortModeSelected,
                    onOpenOrder = { selectedOrderId = it.id },
                    wideLayout = true,
                    modifier = Modifier
                        .fillMaxHeight()
                        .width(if (containerWidth >= 1360.dp) 430.dp else 390.dp)
                )
                Surface(
                    modifier = Modifier
                        .width(1.dp)
                        .fillMaxHeight(),
                    color = MaterialTheme.colorScheme.outlineVariant
                ) {}
                if (selectedOrder != null) {
                    OrderDetailScreen(
                        order = selectedOrder,
                        workspace = workspace,
                        workspaceSettings = state.workspaceSettings,
                        teamMembers = state.teamMembers,
                        statusOptions = state.workspaceSettings.activeStatuses,
                        onBack = { selectedOrderId = null },
                        onAssignOrder = onAssignOrder,
                        onUpdateOrderFields = onUpdateOrderFields,
                        onUploadClientFile = onUploadClientFile,
                        onUploadPreviewImage = onUploadPreviewImage,
                        onRefreshLiveTracking = onRefreshLiveTracking,
                        onRenameClientFile = onRenameClientFile,
                        onDeleteClientFile = onDeleteClientFile,
                        currentUserId = state.user?.uid.orEmpty(),
                        onUpdateWorkspaceSettings = onUpdateWorkspaceSettings,
                        showBack = false,
                        modifier = Modifier.weight(1f)
                    )
                } else {
                    EmptyOrderDetailPane(modifier = Modifier.weight(1f))
                }
            }
        } else if (selectedOrder != null) {
            OrderDetailScreen(
                order = selectedOrder,
                workspace = workspace,
                workspaceSettings = state.workspaceSettings,
                teamMembers = state.teamMembers,
                statusOptions = state.workspaceSettings.activeStatuses,
                onBack = { selectedOrderId = null },
                onAssignOrder = onAssignOrder,
                onUpdateOrderFields = onUpdateOrderFields,
                onUploadClientFile = onUploadClientFile,
                onUploadPreviewImage = onUploadPreviewImage,
                onRefreshLiveTracking = onRefreshLiveTracking,
                onRenameClientFile = onRenameClientFile,
                onDeleteClientFile = onDeleteClientFile,
                currentUserId = state.user?.uid.orEmpty(),
                onUpdateWorkspaceSettings = onUpdateWorkspaceSettings
            )
        } else {
            OrderListPane(
                state = state,
                visibleOrders = visibleOrders,
                selectedOrderId = selectedOrderId,
                searchText = searchText,
                onSearchTextChange = onSearchTextChange,
                selectedFilter = selectedFilter,
                selectedSortMode = selectedSortMode,
                filterMenuOpen = filterMenuOpen,
                onFilterMenuOpenChange = { filterMenuOpen = it },
                onFilterSelected = onFilterSelected,
                onSortModeSelected = onSortModeSelected,
                onOpenOrder = { selectedOrderId = it.id },
                wideLayout = false,
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}

@Composable
private fun OrderListPane(
    state: StudioFlowUiState,
    visibleOrders: List<StudioOrder>,
    selectedOrderId: String?,
    searchText: String,
    onSearchTextChange: (String) -> Unit,
    selectedFilter: OrderFilter,
    selectedSortMode: OrderSortMode,
    filterMenuOpen: Boolean,
    onFilterMenuOpenChange: (Boolean) -> Unit,
    onFilterSelected: (OrderFilter) -> Unit,
    onSortModeSelected: (OrderSortMode) -> Unit,
    onOpenOrder: (StudioOrder) -> Unit,
    wideLayout: Boolean,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = if (wideLayout) 12.dp else 16.dp, vertical = if (wideLayout) 12.dp else 10.dp)
    ) {
        if (wideLayout) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = searchText,
                    onValueChange = onSearchTextChange,
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp),
                    singleLine = true,
                    shape = RoundedCornerShape(10.dp),
                    leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp)) },
                    placeholder = { Text("Search...", fontSize = 13.sp) }
                )
                Surface(shape = RoundedCornerShape(10.dp), color = StudioBlue.copy(alpha = 0.12f)) {
                    Icon(Icons.Filled.Tune, contentDescription = "List controls", tint = StudioBlue, modifier = Modifier.padding(12.dp).size(18.dp))
                }
            }
            Spacer(modifier = Modifier.height(10.dp))
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Orders", fontSize = 25.sp, fontWeight = FontWeight.ExtraBold)
                    Text("${state.orders.size} orders", color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
                }
                Surface(shape = RoundedCornerShape(12.dp), color = StudioBlue.copy(alpha = 0.12f)) {
                    Icon(Icons.Filled.Search, contentDescription = null, tint = StudioBlue, modifier = Modifier.padding(13.dp))
                }
            }
            Spacer(modifier = Modifier.height(10.dp))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(14.dp),
                color = MaterialTheme.colorScheme.surfaceVariant,
                onClick = { onFilterMenuOpenChange(true) }
            ) {
                Row(modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Tune, contentDescription = null, tint = StudioBlue)
                        Spacer(modifier = Modifier.width(10.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Order Filters", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            Text("${selectedFilter.label} • ${selectedSortMode.label}", fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
                        }
                        if (wideLayout) {
                            Surface(shape = CircleShape, color = MaterialTheme.colorScheme.surface) {
                                Text(
                                    text = "${visibleOrders.size}",
                                    modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.ExtraBold
                                )
                            }
                            Spacer(modifier = Modifier.width(6.dp))
                        }
                        Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    DropdownMenu(expanded = filterMenuOpen, onDismissRequest = { onFilterMenuOpenChange(false) }) {
                        DropdownMenuItem(
                            text = { Text("Filters", fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant) },
                            enabled = false,
                            onClick = {}
                        )
                        OrderFilter.entries.forEach { filter ->
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        if (selectedFilter == filter) {
                                            "[x] ${filter.menuLabel(state.orders, state.user?.uid.orEmpty(), state.user?.email.orEmpty())}"
                                        } else {
                                            filter.menuLabel(state.orders, state.user?.uid.orEmpty(), state.user?.email.orEmpty())
                                        }
                                    )
                                },
                                onClick = {
                                    onFilterSelected(filter)
                                    onFilterMenuOpenChange(false)
                                }
                            )
                        }
                        DropdownMenuItem(
                            text = { Text("Sort by", fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant) },
                            enabled = false,
                            onClick = {}
                        )
                        OrderSortMode.entries.forEach { mode ->
                            DropdownMenuItem(
                                text = { Text(if (selectedSortMode == mode) "[x] ${mode.label}" else mode.label) },
                                onClick = {
                                    onSortModeSelected(mode)
                                    onFilterMenuOpenChange(false)
                                }
                            )
                        }
                    }
                }
            }
        }
        if (!wideLayout) {
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
                value = searchText,
                onValueChange = onSearchTextChange,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                placeholder = { Text("Search...") }
            )
        }
        Spacer(modifier = Modifier.height(10.dp))
        if (state.errorMessage.isNotBlank()) {
            Text(
                text = state.errorMessage,
                color = MaterialTheme.colorScheme.error,
                fontWeight = FontWeight.Bold,
                fontSize = 12.sp,
                modifier = Modifier.padding(bottom = 8.dp)
            )
        }
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxSize()
        ) {
            items(visibleOrders, key = { it.id }) { order ->
                OrderListCard(
                    order = order,
                    teamMembers = state.teamMembers,
                    selected = selectedOrderId == order.id,
                    onOpenOrder = { onOpenOrder(order) }
                )
            }
        }
    }
}

@Composable
private fun EmptyOrderDetailPane(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxHeight()
            .background(MaterialTheme.colorScheme.background)
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Surface(shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surface, tonalElevation = 1.dp) {
            Column(
                modifier = Modifier.padding(28.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text("Select a project", fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
                Text(
                    "Choose an order from the list to edit details in this tablet and desktop layout.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

@Composable
private fun StudioTopBar(
    workspace: StudioWorkspace?,
    onSignOut: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = workspace?.name ?: "StudioFlow",
                style = MaterialTheme.typography.titleLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = listOfNotNull(workspace?.roleLabel, workspace?.billingPlan?.title).joinToString(" · "),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1
            )
        }
        TextButton(onClick = onSignOut) {
            Text("Sign Out", fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun OrderFilterStrip(
    totalCount: Int,
    visibleCount: Int,
    planName: String
) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        CompactPill(text = "Smart $visibleCount/$totalCount", active = true)
        if (planName.isNotBlank()) CompactPill(text = planName, active = false)
    }
}

@Composable
private fun CompactPill(text: String, active: Boolean) {
    val color = if (active) StudioBlue else MaterialTheme.colorScheme.onSurfaceVariant
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = if (active) StudioBlue.copy(alpha = 0.13f) else MaterialTheme.colorScheme.surfaceVariant
    ) {
        Text(
            text = text,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
            color = color,
            fontWeight = FontWeight.Bold,
            fontSize = 12.sp
        )
    }
}

@Composable
private fun OrderListCard(
    order: StudioOrder,
    teamMembers: List<StudioTeamMember>,
    selected: Boolean = false,
    onOpenOrder: () -> Unit
) {
    val assignee = assigneeLabel(order, teamMembers)
    val cardTone = when {
        order.status == "Cancelled" -> MaterialTheme.colorScheme.surface.copy(alpha = 0.70f)
        order.priority == "Urgent" -> StudioRed.copy(alpha = 0.08f)
        order.priority == "High" -> StudioWarningOrange.copy(alpha = 0.08f)
        else -> MaterialTheme.colorScheme.surface
    }
    val borderTone = when {
        selected -> StudioBlue
        order.priority == "Urgent" -> StudioRed.copy(alpha = 0.28f)
        order.priority == "High" -> StudioWarningOrange.copy(alpha = 0.28f)
        else -> Color.Transparent
    }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpenOrder)
            .alpha(if (order.status == "Cancelled") 0.62f else 1f),
        shape = RoundedCornerShape(20.dp),
        color = cardTone,
        border = BorderStroke(1.dp, borderTone),
        tonalElevation = 1.dp
    ) {
        BoxWithConstraints {
            val compact = maxWidth < 390.dp
            Row(
                modifier = Modifier.padding(horizontal = 18.dp, vertical = 18.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                PreviewBox(order = order, compact = compact)
                Spacer(modifier = Modifier.width(if (compact) 12.dp else 18.dp))
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(9.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = order.displayCustomerName,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = if (compact) 17.sp else 20.sp,
                            modifier = Modifier.weight(1f, fill = true)
                        )
                        if (!compact) {
                            Spacer(modifier = Modifier.width(8.dp))
                            AssigneeMiniBadge(order = order, teamMembers = teamMembers)
                        }
                        if (!order.isClosed && !order.isDispatched) {
                            Spacer(modifier = Modifier.width(8.dp))
                            DeliveryBadge(order = order, compact = compact)
                        }
                    }
                    if (assignee.isNotBlank()) {
                        AssignedRow(label = assignee)
                    }
                    IconDetailRow(
                        icon = Icons.Filled.Palette,
                        label = order.designName.ifBlank { order.watchRef.ifBlank { "-" } }
                    )
                    IconDetailRow(
                        icon = Icons.Filled.DateRange,
                        label = shortDate(order)
                    )
                }
                Spacer(modifier = Modifier.width(10.dp))
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    StatusLine(label = "DESI", value = order.designStatus, compact = compact)
                    StatusLine(label = "PAIN", value = order.status, compact = compact)
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = moneyAmount(order.paidAmount),
                        color = if (order.status == "Cancelled") MaterialTheme.colorScheme.onSurfaceVariant else StudioGreen,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = if (compact) 17.sp else 19.sp
                    )
                }
            }
        }
    }
}

@Composable
private fun PreviewBox(order: StudioOrder, compact: Boolean = false) {
    val previewUrl = remember(order.id, order.designLink, order.clientFiles) {
        order.designLink.trim().ifBlank {
            order.clientFiles.firstOrNull {
                isClientFileImage(it.contentType, it.fileName) && it.downloadUrl.isNotBlank()
            }?.downloadUrl.orEmpty()
        }
    }
    var bitmap by remember(previewUrl) { mutableStateOf<android.graphics.Bitmap?>(null) }

    LaunchedEffect(previewUrl) {
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
            .size(if (compact) 60.dp else 72.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center
    ) {
        val previewBitmap = bitmap
        if (previewBitmap != null) {
            Image(
                bitmap = previewBitmap.asImageBitmap(),
                contentDescription = "Order preview",
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )
        } else {
            Icon(
                imageVector = Icons.Filled.Image,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.72f),
                modifier = Modifier.size(if (compact) 26.dp else 30.dp)
            )
        }
    }
}

@Composable
private fun DeliveryBadge(order: StudioOrder, compact: Boolean = false) {
    val days = order.remainingDays
    val tone = when {
        days < 0 -> StudioRed
        days <= 7 -> StudioWarningOrange
        else -> StudioBlue
    }
    val label = when {
        days > 0 -> "${days}d"
        days == 0 -> "Today"
        else -> "${-days}d late"
    }
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = tone.copy(alpha = 0.15f),
        border = BorderStroke(1.dp, tone.copy(alpha = 0.28f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = if (compact) 7.dp else 11.dp, vertical = if (compact) 5.dp else 7.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Icon(Icons.Filled.Calculate, contentDescription = null, tint = tone, modifier = Modifier.size(if (compact) 13.dp else 17.dp))
            Text(
                text = label,
                color = tone,
                fontWeight = FontWeight.ExtraBold,
                fontSize = if (compact) 16.sp else 24.sp,
                lineHeight = if (compact) 16.sp else 24.sp
            )
        }
    }
}

@Composable
private fun AssignedRow(label: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        Box(
            modifier = Modifier
                .width(2.dp)
                .height(34.dp)
                .background(StudioBlue, RoundedCornerShape(999.dp))
        )
        Box(
            modifier = Modifier
                .size(34.dp)
                .clip(CircleShape)
                .background(StudioBlue.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center
        ) {
            Text(label.take(1).uppercase(), color = StudioBlue, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp)
        }
        Text(
            text = "Assigned to $label",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = FontWeight.SemiBold,
            fontSize = 16.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun AssigneeMiniBadge(order: StudioOrder, teamMembers: List<StudioTeamMember>) {
    Surface(shape = CircleShape, color = StudioBlue.copy(alpha = 0.13f)) {
        Box(modifier = Modifier.size(34.dp), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.Person, contentDescription = null, tint = StudioBlue, modifier = Modifier.size(22.dp))
        }
    }
}

@Composable
private fun IconDetailRow(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(15.dp))
        Text(
            text = label,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = FontWeight.SemiBold,
            fontSize = 15.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun StatusLine(label: String, value: String, compact: Boolean = false) {
    val clean = value.ifBlank { "Not Yet" }
    val tone = statusTone(clean)
    Row(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(9.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.74f), RoundedCornerShape(9.dp))
                .padding(horizontal = if (compact) 6.dp else 8.dp, vertical = if (compact) 4.dp else 5.dp)
        ) {
            Text(
                text = label,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = if (compact) 9.sp else 11.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1
            )
        }
        Box(
            modifier = Modifier
                .width(if (compact) 72.dp else 108.dp)
                .border(1.dp, tone.copy(alpha = 0.25f), RoundedCornerShape(10.dp))
                .background(tone.copy(alpha = 0.13f), RoundedCornerShape(10.dp))
                .padding(horizontal = if (compact) 7.dp else 10.dp, vertical = if (compact) 4.dp else 5.dp)
        ) {
            Text(
                text = clean,
                color = tone,
                fontSize = if (compact) 10.sp else 12.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1,
                modifier = Modifier.fillMaxWidth(),
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

private fun statusTone(status: String): Color {
    return when (status.trim().lowercase()) {
        "done", "completed", "delivered" -> StudioGreen
        "cancelled", "canceled", "failed", "late", "overdue" -> StudioRed
        "in progress", "processing", "production" -> StudioWarningOrange
        "not yet", "" -> StudioRed
        else -> StudioBlue
    }
}

private fun moneyAmount(value: Double): String {
    return "£" + String.format(Locale.UK, "%,.2f", value)
}

private fun assigneeLabel(order: StudioOrder, members: List<StudioTeamMember>): String {
    val member = members.firstOrNull { it.id == order.assignedToUid }
        ?: members.firstOrNull { it.email.equals(order.assignedToEmail, ignoreCase = true) }
    return member?.label ?: emailName(order.assignedToEmail)
}

private fun isClientFileImage(contentType: String, fileName: String): Boolean {
    val cleanType = contentType.lowercase()
    val extension = fileName.substringAfterLast(".", "").lowercase()
    return cleanType.startsWith("image/") || extension in setOf("jpg", "jpeg", "png", "webp", "heic", "heif")
}

private fun shortDate(order: StudioOrder): String {
    return SimpleDateFormat("dd/MM/yy", Locale.UK).format(order.paymentDate)
}

private enum class OrderFilter(val label: String, val key: String) {
    All("All", "all"),
    Active("Active", "active"),
    AssignedToMe("Assigned to me", "assigned_to_me"),
    Unassigned("Unassigned", "unassigned"),
    WaitingCustomer("Waiting Customer", "waiting_customer"),
    InProduction("In Production", "in_production"),
    ReadyToShip("Ready to Ship", "ready_to_ship"),
    Late("Late", "late"),
    HighPriority("High Priority", "high_priority"),
    Completed("Completed", "completed"),
    Cancelled("Cancelled", "cancelled");

    fun matches(order: StudioOrder, currentUserId: String = "", currentUserEmail: String = ""): Boolean {
        return when (this) {
            All -> true
            Active -> !orderIsCompleted(order) && !orderIsCancelled(order)
            AssignedToMe -> orderAssignedToCurrentUser(order, currentUserId, currentUserEmail)
            Unassigned -> order.assignedToUid.isBlank() && order.assignedToEmail.isBlank()
            WaitingCustomer -> orderNeedsCustomerReply(order)
            InProduction -> orderIsInProduction(order)
            ReadyToShip -> orderIsReadyToShip(order)
            Late -> orderIsLate(order)
            HighPriority -> order.priority.contains("high", ignoreCase = true) || order.priority.contains("urgent", ignoreCase = true)
            Completed -> orderIsCompleted(order)
            Cancelled -> orderIsCancelled(order)
        }
    }

    fun menuLabel(orders: List<StudioOrder>, currentUserId: String, currentUserEmail: String): String {
        return "$label (${orders.count { matches(it, currentUserId, currentUserEmail) }})"
    }
}

private enum class OrderSortMode(val label: String, val key: String) {
    Smart("Smart", "smart"),
    DeliveryDue("Delivery due", "delivery_due"),
    Recent("Recent", "recent"),
    Customer("Customer", "customer"),
    OrderValue("Order value", "order_value");

    fun sort(orders: List<StudioOrder>): List<StudioOrder> {
        return when (this) {
            Smart -> orders.sortedWith(
                compareBy<StudioOrder> { smartOrderRank(it) }
                    .thenBy { orderDeliveryDueDate(it) }
                    .thenByDescending { it.orderValue }
                    .thenBy { it.displayCustomerName.lowercase(Locale.ROOT) }
            )
            DeliveryDue -> orders.sortedWith(
                compareBy<StudioOrder> { orderIsCompleted(it) || orderIsCancelled(it) }
                    .thenBy { orderDeliveryDueDate(it) }
                    .thenBy { it.displayCustomerName.lowercase(Locale.ROOT) }
            )
            Recent -> orders.sortedByDescending { it.paymentDate }
            Customer -> orders.sortedBy { it.displayCustomerName.lowercase(Locale.ROOT) }
            OrderValue -> orders.sortedByDescending { it.orderValue }
        }
    }
}

private fun orderFilterFromKey(key: String?): OrderFilter {
    return OrderFilter.entries.firstOrNull { it.key == key } ?: OrderFilter.All
}

private fun orderSortModeFromKey(key: String?): OrderSortMode {
    return OrderSortMode.entries.firstOrNull { it.key == key } ?: OrderSortMode.Smart
}

private fun ordersPreferenceName(userId: String?, workspaceId: String?): String {
    return "studioflow_orders_${userId.orEmpty()}_${workspaceId.orEmpty()}"
}

private fun orderSearchMatches(order: StudioOrder, members: List<StudioTeamMember>, query: String): Boolean {
    val cleanQuery = query.trim().lowercase(Locale.ROOT)
    if (cleanQuery.isBlank()) return true
    return orderSearchTokens(order, members).any { it.contains(cleanQuery) }
}

private fun orderSearchTokens(order: StudioOrder, members: List<StudioTeamMember>): List<String> {
    return buildList {
        add(order.displayCustomerName)
        add(order.customerName)
        add(order.designName)
        add(order.watchRef)
        add(order.status)
        add(order.designStatus)
        add(order.priority)
        add(order.risk)
        add(order.riskReason)
        add(order.emailAddress)
        add(order.instagramUsername)
        add(order.whatsappNumber)
        add(order.trackingNumber)
        add(order.courier)
        add(order.notes)
        add(assigneeLabel(order, members))
        addAll(order.communication)
        addAll(order.extraStatuses.keys)
        addAll(order.extraStatuses.values)
        addAll(order.customFields.keys)
        addAll(order.customFields.values)
        add(moneyAmount(order.paidAmount))
        add(moneyAmount(order.orderValue))
    }
        .map { it.trim().lowercase(Locale.ROOT) }
        .filter { it.isNotBlank() }
}

private fun smartOrderRank(order: StudioOrder): Int {
    return when {
        orderIsCancelled(order) -> 90
        orderIsCompleted(order) -> 80
        orderIsLate(order) -> 0
        order.remainingDays in 0..7 && !order.isDispatched -> 10
        orderIsReadyToShip(order) -> 20
        orderIsInProduction(order) -> 30
        orderNeedsCustomerReply(order) -> 40
        order.priority.contains("urgent", ignoreCase = true) -> 45
        else -> 50
    }
}

private fun orderAssignedToCurrentUser(order: StudioOrder, currentUserId: String, currentUserEmail: String): Boolean {
    val cleanEmail = currentUserEmail.trim().lowercase(Locale.ROOT)
    return currentUserId.isNotBlank() && order.assignedToUid == currentUserId ||
        cleanEmail.isNotBlank() && order.assignedToEmail.trim().lowercase(Locale.ROOT) == cleanEmail
}

private fun orderPrimaryStatus(order: StudioOrder): String {
    return order.status.trim().lowercase(Locale.ROOT)
}

private fun orderIsCancelled(order: StudioOrder): Boolean {
    val status = orderPrimaryStatus(order)
    return status.contains("cancelled") || status.contains("canceled") || status.contains("refunded")
}

private fun orderIsCompleted(order: StudioOrder): Boolean {
    if (order.isDelivered) return true
    val status = orderPrimaryStatus(order)
    return status == "done" || status == "completed" || status == "delivered" || status.contains("complete")
}

private fun orderIsLate(order: StudioOrder): Boolean {
    return !orderIsCompleted(order) && !orderIsCancelled(order) && !order.isDispatched && orderDeliveryDueDate(order) < Date()
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
    return orderTextTokens(order).any { text -> terms.any { text.contains(it) } }
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
    return orderTextTokens(order).any { text -> readyTerms.any { text.contains(it) } }
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
    val texts = orderTextTokens(order)
    return texts.any { text -> productionTerms.any { text.contains(it) } } || order.status.equals("Not Yet", ignoreCase = true)
}

private fun orderTextTokens(order: StudioOrder): List<String> {
    return buildList {
        add(order.status)
        add(order.designStatus)
        add(order.priority)
        add(order.risk)
        add(order.riskReason)
        add(order.notes)
        add(order.designName)
        add(order.watchRef)
        add(order.courier)
        addAll(order.communication)
        addAll(order.extraStatuses.values)
        addAll(order.customFields.values)
    }
        .map { it.trim().lowercase(Locale.ROOT) }
        .filter { it.isNotBlank() }
}

private fun orderDeliveryDueDate(order: StudioOrder): Date {
    return Date(order.paymentDate.time + order.deliveryTime.coerceAtLeast(1) * OrdersDayMs)
}

private const val OrdersSearchKey = "orders_search"
private const val OrdersFilterKey = "orders_filter"
private const val OrdersSortKey = "orders_sort"
private const val OrdersDayMs = 24L * 60L * 60L * 1000L
