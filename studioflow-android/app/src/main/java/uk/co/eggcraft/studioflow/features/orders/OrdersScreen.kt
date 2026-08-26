package uk.co.eggcraft.studioflow.features.orders

import android.content.Context
import android.graphics.BitmapFactory
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import androidx.compose.foundation.gestures.detectDragGestures
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
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Calculate
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.isSecondaryPressed
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import uk.co.eggcraft.studioflow.data.model.StudioOrder
import uk.co.eggcraft.studioflow.data.model.StudioTeamMember
import uk.co.eggcraft.studioflow.data.model.StudioWorkspace
import uk.co.eggcraft.studioflow.data.model.StudioWorkspaceSettings
import uk.co.eggcraft.studioflow.data.model.emailName
import uk.co.eggcraft.studioflow.features.shell.LocalHideSensitiveNumbers
import uk.co.eggcraft.studioflow.features.shell.StudioFlowUiState
import uk.co.eggcraft.studioflow.features.shell.privateCurrencyText
import uk.co.eggcraft.studioflow.ui.theme.StudioBlue
import uk.co.eggcraft.studioflow.ui.theme.StudioGreen
import uk.co.eggcraft.studioflow.ui.theme.StudioRed
import uk.co.eggcraft.studioflow.ui.theme.StudioWarningOrange

@Composable
fun OrdersScreen(
    state: StudioFlowUiState,
    onAssignOrder: (StudioOrder, StudioTeamMember?) -> Unit,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onSaveOrderCardLayout: (StudioOrder, String) -> Unit,
    onResetOrderCardLayout: (StudioOrder) -> Unit,
    onUploadClientFile: (StudioOrder, ByteArray, String, String) -> Unit,
    onUploadPreviewImage: (StudioOrder, ByteArray, String, String) -> Unit,
    onRefreshLiveTracking: (StudioOrder) -> Unit,
    onRenameClientFile: (StudioOrder, String, String) -> Unit,
    onDeleteClientFile: (StudioOrder, String) -> Unit,
    onDeleteOrder: (StudioOrder) -> Unit,
    onRestoreOrder: (StudioOrder) -> Unit = {},
    onOpenCustomerFromOrder: (StudioOrder) -> Unit,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit,
    onCreateOrder: () -> Unit = {},
    // Bumped by the top-bar logo: close any open order detail and show the list.
    resetToListKey: Int = 0
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
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
    // Logo tap returns to the order list even while a detail is open on phone.
    LaunchedEffect(resetToListKey) {
        if (resetToListKey > 0) selectedOrderId = null
    }
    var orderListVisible by rememberSaveable(workspace?.id, state.user?.uid) {
        mutableStateOf(state.workspaceSettings.ordersSidebarVisible)
    }
    val cloudListWidth = state.workspaceSettings.ordersSidebarWidth.toFloat()
    var wideListWidthPreference by rememberSaveable(workspace?.id, state.user?.uid) {
        val localWidth = ordersPrefs.getFloat(OrdersListWidthKey, Float.NaN)
        val initialWidth = if (!cloudListWidth.isNaN() && cloudListWidth > 0f) cloudListWidth else localWidth
        mutableStateOf(initialWidth)
    }
    var resizingOrderList by remember { mutableStateOf(false) }
    var resizeBaseListWidth by remember { mutableStateOf(0f) }
    var resizeListDeltaDp by remember { mutableStateOf(0f) }
    var selectedOrderIds by remember(workspace?.id, state.user?.uid) { mutableStateOf(emptySet<String>()) }
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
    LaunchedEffect(workspace?.id, state.user?.uid, cloudListWidth, resizingOrderList) {
        if (!resizingOrderList && !cloudListWidth.isNaN() && cloudListWidth > 0f) {
            wideListWidthPreference = cloudListWidth
            ordersPrefs.edit().putFloat(OrdersListWidthKey, cloudListWidth).apply()
        }
    }
    LaunchedEffect(workspace?.id, state.user?.uid, state.workspaceSettings.ordersSidebarVisible) {
        orderListVisible = state.workspaceSettings.ordersSidebarVisible
    }
    fun saveOrderListVisibility(visible: Boolean, listWidth: Float) {
        orderListVisible = visible
        onUpdateWorkspaceSettings(
            mapOf(
                "ordersSidebarVisible" to visible,
                "ordersSidebarWidth" to listWidth.coerceIn(260f, 760f).toDouble(),
                "workspaceSidebarLayoutUpdatedAt" to System.currentTimeMillis()
            ),
            if (visible) "Order list shown." else "Order list hidden."
        )
    }
    LaunchedEffect(state.orders) {
        // Delivery push route: open the order from the notification as soon as
        // it is available in the loaded order list.
        val pendingId = uk.co.eggcraft.studioflow.services.StudioMessageRouteHolder.pendingOrderId.value
        if (pendingId.isNotBlank() && state.orders.any { it.id == pendingId }) {
            uk.co.eggcraft.studioflow.services.StudioMessageRouteHolder.consumePendingOrderId()
            selectedOrderId = pendingId
        }
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
        val sourceOrders = if (selectedFilter == OrderFilter.Trash) state.deletedOrders else state.orders
        val searched = if (query.isBlank()) {
            sourceOrders
        } else {
            sourceOrders.filter { order -> orderSearchMatches(order, state.teamMembers, query) }
        }
        selectedSortMode.sort(searched.filter { order ->
            selectedFilter.matches(order, currentUserId, currentUserEmail)
        })
    }

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val isWide = maxWidth >= 900.dp
        val containerWidth = maxWidth
        val density = LocalDensity.current
        LaunchedEffect(isWide, visibleOrders, selectedOrderId) {
            if (!isWide) return@LaunchedEffect
            val stillVisible = visibleOrders.any { it.id == selectedOrderId }
            if (!stillVisible) {
                selectedOrderId = visibleOrders.firstOrNull()?.id
            }
        }
        if (isWide) {
            val defaultListWidth = if (containerWidth >= 1360.dp) 430f else 390f
            val minListWidth = 320f
            val maxListWidth = (containerWidth.value * 0.56f).coerceIn(minListWidth, 760f)
            val listPaneWidth = (if (wideListWidthPreference.isNaN()) defaultListWidth else wideListWidthPreference)
                .coerceIn(minListWidth, maxListWidth)
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background)
            ) {
                if (orderListVisible) {
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
                        selectedOrderIds = selectedOrderIds,
                        onToggleOrderSelection = { order ->
                            selectedOrderIds = if (order.id in selectedOrderIds) {
                                selectedOrderIds - order.id
                            } else {
                                selectedOrderIds + order.id
                            }
                        },
                        onClearSelection = { selectedOrderIds = emptySet() },
                        onAssignOrder = onAssignOrder,
                        onUpdateOrderFields = onUpdateOrderFields,
                        onDeleteOrder = { order ->
                            if (selectedOrderId == order.id) selectedOrderId = visibleOrders.firstOrNull { it.id != order.id }?.id
                            selectedOrderIds = selectedOrderIds - order.id
                            onDeleteOrder(order)
                        },
                        onOpenCustomerFromOrder = onOpenCustomerFromOrder,
                        onUpdateWorkspaceSettings = onUpdateWorkspaceSettings,
                        onCreateOrder = onCreateOrder,
                        wideLayout = true,
                        onToggleListVisibility = { saveOrderListVisibility(false, listPaneWidth) },
                        modifier = Modifier
                            .fillMaxHeight()
                            .width(listPaneWidth.dp)
                    )
                    OrderListResizeHandle(
                        active = resizingOrderList,
                        onResizeStart = {
                            resizingOrderList = true
                            resizeBaseListWidth = listPaneWidth
                            resizeListDeltaDp = 0f
                        },
                        onResizeBy = { dragPixels ->
                            val deltaDp = with(density) { dragPixels.toDp().value }
                            resizeListDeltaDp += deltaDp
                            wideListWidthPreference = (resizeBaseListWidth + resizeListDeltaDp)
                                .coerceIn(minListWidth, maxListWidth)
                        },
                        onResizeEnd = {
                            resizingOrderList = false
                            val savedWidth = if (wideListWidthPreference.isNaN()) listPaneWidth else wideListWidthPreference
                            val syncedWidth = savedWidth.coerceIn(minListWidth, maxListWidth)
                            ordersPrefs.edit()
                                .putFloat(OrdersListWidthKey, syncedWidth)
                                .apply()
                            onUpdateWorkspaceSettings(
                                mapOf(
                                    "ordersSidebarWidth" to syncedWidth.toDouble(),
                                    "ordersSidebarVisible" to true
                                ),
                                "Order list width synced."
                            )
                            resizeBaseListWidth = 0f
                            resizeListDeltaDp = 0f
                        },
                        onResizeCancel = {
                            resizingOrderList = false
                            resizeBaseListWidth = 0f
                            resizeListDeltaDp = 0f
                        }
                    )
                } else {
                    OrderListRevealRail(
                        visibleCount = visibleOrders.size,
                        onShow = { saveOrderListVisibility(true, listPaneWidth) }
                    )
                }
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
                        onSaveOrderCardLayout = onSaveOrderCardLayout,
                        onResetOrderCardLayout = onResetOrderCardLayout,
                        onUploadClientFile = onUploadClientFile,
                        onUploadPreviewImage = onUploadPreviewImage,
                        onRefreshLiveTracking = onRefreshLiveTracking,
                        onRenameClientFile = onRenameClientFile,
                        onDeleteClientFile = onDeleteClientFile,
                        currentUserId = state.user?.uid.orEmpty(),
                        onUpdateWorkspaceSettings = onUpdateWorkspaceSettings,
                        showBack = false,
                        allOrders = state.orders,
                        modifier = Modifier.weight(1f)
                    )
                } else {
                    EmptyOrderDetailPane(modifier = Modifier.weight(1f))
                }
            }
        } else if (selectedOrder != null) {
            androidx.activity.compose.BackHandler(enabled = true) { selectedOrderId = null }
            Column(modifier = Modifier.fillMaxSize()) {
                if (selectedOrder.isDeleted) {
                    Surface(color = StudioWarningOrange.copy(alpha = 0.12f), modifier = Modifier.fillMaxWidth()) {
                        Row(modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(t("Items in Trash are permanently deleted after 30 days."), modifier = Modifier.weight(1f), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            TextButton(onClick = { onRestoreOrder(selectedOrder); selectedOrderId = null }) { Text(t("Restore"), fontWeight = FontWeight.Bold) }
                        }
                    }
                }
                OrderDetailScreen(
                    order = selectedOrder,
                    workspace = workspace,
                    workspaceSettings = state.workspaceSettings,
                    teamMembers = state.teamMembers,
                    statusOptions = state.workspaceSettings.activeStatuses,
                    onBack = { selectedOrderId = null },
                    onAssignOrder = onAssignOrder,
                    onUpdateOrderFields = onUpdateOrderFields,
                    onSaveOrderCardLayout = onSaveOrderCardLayout,
                    onResetOrderCardLayout = onResetOrderCardLayout,
                    onUploadClientFile = onUploadClientFile,
                    onUploadPreviewImage = onUploadPreviewImage,
                    onRefreshLiveTracking = onRefreshLiveTracking,
                    onRenameClientFile = onRenameClientFile,
                    onDeleteClientFile = onDeleteClientFile,
                    currentUserId = state.user?.uid.orEmpty(),
                    onUpdateWorkspaceSettings = onUpdateWorkspaceSettings,
                    allOrders = state.orders,
                    modifier = Modifier.weight(1f)
                )
            }
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
                selectedOrderIds = selectedOrderIds,
                onToggleOrderSelection = { order ->
                    selectedOrderIds = if (order.id in selectedOrderIds) {
                        selectedOrderIds - order.id
                    } else {
                        selectedOrderIds + order.id
                    }
                },
                onClearSelection = { selectedOrderIds = emptySet() },
                onAssignOrder = onAssignOrder,
                onUpdateOrderFields = onUpdateOrderFields,
                onDeleteOrder = { order ->
                    if (selectedOrderId == order.id) selectedOrderId = null
                    selectedOrderIds = selectedOrderIds - order.id
                    onDeleteOrder(order)
                },
                onOpenCustomerFromOrder = onOpenCustomerFromOrder,
                onUpdateWorkspaceSettings = onUpdateWorkspaceSettings,
                onCreateOrder = onCreateOrder,
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
    selectedOrderIds: Set<String>,
    onToggleOrderSelection: (StudioOrder) -> Unit,
    onClearSelection: () -> Unit,
    onAssignOrder: (StudioOrder, StudioTeamMember?) -> Unit,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onDeleteOrder: (StudioOrder) -> Unit,
    onOpenCustomerFromOrder: (StudioOrder) -> Unit,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit,
    onCreateOrder: () -> Unit = {},
    wideLayout: Boolean,
    onToggleListVisibility: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
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
                if (onToggleListVisibility != null) {
                    OrderListVisibilityButton(
                        visible = true,
                        onClick = onToggleListVisibility
                    )
                }
            }
            Spacer(modifier = Modifier.height(10.dp))
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(t("Orders"), fontSize = 25.sp, fontWeight = FontWeight.ExtraBold)
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
                            Text(t("Order Filters"), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.Bold)
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
                            text = {
                                Text(
                                    "Sort orders",
                                    fontWeight = FontWeight.ExtraBold,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            },
                            enabled = false,
                            onClick = {}
                        )
                        OrderSortMode.entries.forEach { mode ->
                            val selected = selectedSortMode == mode
                            DropdownMenuItem(
                                leadingIcon = {
                                    if (selected) {
                                        Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = StudioBlue, modifier = Modifier.size(18.dp))
                                    } else {
                                        Box(modifier = Modifier.size(18.dp))
                                    }
                                },
                                text = {
                                    Text(
                                        mode.label,
                                        fontWeight = if (selected) FontWeight.ExtraBold else FontWeight.SemiBold
                                    )
                                },
                                onClick = {
                                    onSortModeSelected(mode)
                                    onFilterMenuOpenChange(false)
                                }
                            )
                        }
                        HorizontalDivider()
                        DropdownMenuItem(
                            text = {
                                Text(
                                    "Filters",
                                    fontWeight = FontWeight.ExtraBold,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            },
                            enabled = false,
                            onClick = {}
                        )
                        OrderFilter.entries.forEach { filter ->
                            val selected = selectedFilter == filter
                            DropdownMenuItem(
                                leadingIcon = {
                                    if (selected) {
                                        Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = StudioBlue, modifier = Modifier.size(18.dp))
                                    } else {
                                        Box(modifier = Modifier.size(18.dp))
                                    }
                                },
                                text = {
                                    Text(
                                        filter.menuLabel(if (filter == OrderFilter.Trash) state.deletedOrders else state.orders, state.user?.uid.orEmpty(), state.user?.email.orEmpty()),
                                        fontWeight = if (selected) FontWeight.ExtraBold else FontWeight.SemiBold
                                    )
                                },
                                onClick = {
                                    onFilterSelected(filter)
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

        val mergeScope = rememberCoroutineScope()
        var showMergeDialog by remember { mutableStateOf(false) }
        var mergePrimaryId by remember { mutableStateOf<String?>(null) }
        var merging by remember { mutableStateOf(false) }
        var mergeError by remember { mutableStateOf<String?>(null) }
        var showBulkDeleteConfirm by remember { mutableStateOf(false) }
        val selectedOrders = visibleOrders.filter { it.id in selectedOrderIds }
        val canBulkEdit = canDeleteOrderFromList(state.workspace)

        if (selectedOrderIds.isNotEmpty()) {
            Surface(
                color = StudioBlue.copy(alpha = 0.10f),
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, StudioBlue.copy(alpha = 0.30f)),
                modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(start = 12.dp, end = 6.dp, top = 2.dp, bottom = 2.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "${selectedOrderIds.size} ${t("selected")}",
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(modifier = Modifier.weight(1f))
                    TextButton(onClick = onClearSelection) { Text(t("Clear")) }
                    if (canBulkEdit && selectedOrderIds.size >= 2) {
                        TextButton(onClick = {
                            mergePrimaryId = selectedOrders.firstOrNull()?.id
                            mergeError = null
                            showMergeDialog = true
                        }) { Text("${t("Merge")} (${selectedOrderIds.size})", fontWeight = FontWeight.Bold) }
                    }
                    if (canBulkEdit) {
                        TextButton(onClick = { showBulkDeleteConfirm = true }) {
                            Text("${t("Delete")} (${selectedOrderIds.size})", color = StudioRed, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        if (showMergeDialog) {
            val primaryId = mergePrimaryId ?: selectedOrders.firstOrNull()?.id
            AlertDialog(
                onDismissRequest = { if (!merging) showMergeDialog = false },
                title = { Text(t("Merge selected orders")) },
                text = {
                    Column {
                        Text(
                            t("Pick the main order to keep. The other selected orders' payments move into it, then they move to Trash."),
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.height(12.dp))
                        Column(
                            modifier = Modifier
                                .heightIn(max = 320.dp)
                                .verticalScroll(rememberScrollState())
                        ) {
                            selectedOrders.forEach { candidate ->
                                val isPrimary = primaryId == candidate.id
                                Surface(
                                    color = if (isPrimary) StudioBlue.copy(alpha = 0.10f)
                                    else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                                    shape = RoundedCornerShape(8.dp),
                                    border = BorderStroke(
                                        if (isPrimary) 2.dp else 1.dp,
                                        if (isPrimary) StudioBlue else MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)
                                    ),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 3.dp)
                                        .clickable { mergePrimaryId = candidate.id }
                                ) {
                                    Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            if (isPrimary) "●" else "○",
                                            color = if (isPrimary) StudioBlue else MaterialTheme.colorScheme.onSurfaceVariant,
                                            fontSize = 16.sp
                                        )
                                        Spacer(Modifier.width(10.dp))
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(candidate.customerName, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                            Text(
                                                candidate.designName.ifBlank { "—" },
                                                fontSize = 12.sp,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                        if (isPrimary) Text(t("Main"), color = StudioBlue, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                                    }
                                }
                            }
                        }
                        mergeError?.let { msg ->
                            Spacer(Modifier.height(8.dp))
                            Text(msg, color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                        }
                    }
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            val primary = mergePrimaryId ?: selectedOrders.firstOrNull()?.id
                            val sourceIds = if (primary != null) selectedOrders.map { it.id }.filter { it != primary } else emptyList()
                            if (primary != null && sourceIds.isNotEmpty() && !merging) {
                                merging = true
                                mergeError = null
                                mergeScope.launch {
                                    try {
                                        com.google.firebase.functions.FirebaseFunctions.getInstance("europe-west2")
                                            .getHttpsCallable("mergeOrders")
                                            .call(
                                                mapOf(
                                                    "companyId" to (state.workspace?.id ?: ""),
                                                    "primaryOrderId" to primary,
                                                    "sourceOrderIds" to sourceIds
                                                )
                                            )
                                            .await()
                                        merging = false
                                        showMergeDialog = false
                                        onClearSelection()
                                    } catch (e: Exception) {
                                        merging = false
                                        mergeError = e.localizedMessage ?: "Could not merge the selected orders."
                                    }
                                }
                            }
                        },
                        enabled = !merging && selectedOrders.size >= 2
                    ) {
                        Text(if (merging) t("Merging…") else t("Merge"), fontWeight = FontWeight.Bold)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showMergeDialog = false }, enabled = !merging) {
                        Text(t("Cancel"))
                    }
                }
            )
        }

        if (showBulkDeleteConfirm) {
            AlertDialog(
                onDismissRequest = { showBulkDeleteConfirm = false },
                title = { Text(t("Delete")) },
                text = { Text("Move ${selectedOrderIds.size} orders to Trash?") },
                confirmButton = {
                    TextButton(onClick = {
                        showBulkDeleteConfirm = false
                        selectedOrders.forEach { onDeleteOrder(it) }
                        onClearSelection()
                    }) { Text(t("Delete"), color = StudioRed, fontWeight = FontWeight.ExtraBold) }
                },
                dismissButton = {
                    TextButton(onClick = { showBulkDeleteConfirm = false }) { Text(t("Cancel")) }
                }
            )
        }

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxSize()
        ) {
            // A genuinely empty workspace used to render nothing at all here, which
            // left a new user staring at a blank screen with no way in. Matches the
            // first-run state the iOS/macOS app already shows.
            if (state.orders.isEmpty() && !state.loading) {
                item(key = "orders-first-run") {
                    OrdersFirstRunCard(
                        creating = state.creatingOrder,
                        canCreate = state.workspace?.memberAccess?.orders == true,
                        onCreateOrder = onCreateOrder,
                        onRunBusinessSetup = {
                            onUpdateWorkspaceSettings(
                                mapOf("businessOnboardingCompleted" to false),
                                t("Business setup reopened.")
                            )
                        }
                    )
                }
            }
            items(visibleOrders, key = { it.id }) { order ->
                OrderListCard(
                    order = order,
                    workspace = state.workspace,
                    workspaceSettings = state.workspaceSettings,
                    teamMembers = state.teamMembers,
                    selected = selectedOrderId == order.id,
                    multiSelected = order.id in selectedOrderIds,
                    selectionMode = selectedOrderIds.isNotEmpty(),
                    wideLayout = wideLayout,
                    onOpenOrder = { onOpenOrder(order) },
                    onToggleOrderSelection = { onToggleOrderSelection(order) },
                    onAssignOrder = { member -> onAssignOrder(order, member) },
                    onUpdateOrderFields = { payload -> onUpdateOrderFields(order, payload) },
                    onDeleteOrder = { onDeleteOrder(order) },
                    onOpenCustomer = { onOpenCustomerFromOrder(order) },
                    onUpdateWorkspaceSettings = onUpdateWorkspaceSettings
                )
            }
        }
    }
}

/**
 * The exact same order-list sidebar used in the Orders screen, reusable from other
 * screens (e.g. the Schedule planner) so the left cards look identical everywhere.
 * Manages its own search/filter/sort/selection state internally.
 */
@Composable
internal fun OrderListSidebarPane(
    state: StudioFlowUiState,
    selectedOrderId: String?,
    onOpenOrder: (StudioOrder) -> Unit,
    onAssignOrder: (StudioOrder, StudioTeamMember?) -> Unit,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onDeleteOrder: (StudioOrder) -> Unit,
    onOpenCustomerFromOrder: (StudioOrder) -> Unit,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit,
    modifier: Modifier = Modifier
) {
    var searchText by rememberSaveable { mutableStateOf("") }
    var selectedFilter by rememberSaveable { mutableStateOf(OrderFilter.All) }
    var selectedSortMode by rememberSaveable { mutableStateOf(OrderSortMode.Smart) }
    var filterMenuOpen by remember { mutableStateOf(false) }
    var selectedOrderIds by remember { mutableStateOf(emptySet<String>()) }
    val currentUserId = state.user?.uid.orEmpty()
    val currentUserEmail = state.user?.email.orEmpty()
    val visibleOrders = remember(state.orders, state.teamMembers, searchText, selectedFilter, selectedSortMode, currentUserId, currentUserEmail) {
        val query = searchText.trim()
        val searched = if (query.isBlank()) state.orders else state.orders.filter { orderSearchMatches(it, state.teamMembers, query) }
        selectedSortMode.sort(searched.filter { selectedFilter.matches(it, currentUserId, currentUserEmail) })
    }
    OrderListPane(
        state = state,
        visibleOrders = visibleOrders,
        selectedOrderId = selectedOrderId,
        searchText = searchText,
        onSearchTextChange = { searchText = it },
        selectedFilter = selectedFilter,
        selectedSortMode = selectedSortMode,
        filterMenuOpen = filterMenuOpen,
        onFilterMenuOpenChange = { filterMenuOpen = it },
        onFilterSelected = { selectedFilter = it },
        onSortModeSelected = { selectedSortMode = it },
        onOpenOrder = onOpenOrder,
        selectedOrderIds = selectedOrderIds,
        onToggleOrderSelection = { order ->
            selectedOrderIds = if (order.id in selectedOrderIds) selectedOrderIds - order.id else selectedOrderIds + order.id
        },
        onClearSelection = { selectedOrderIds = emptySet() },
        onAssignOrder = onAssignOrder,
        onUpdateOrderFields = onUpdateOrderFields,
        onDeleteOrder = onDeleteOrder,
        onOpenCustomerFromOrder = onOpenCustomerFromOrder,
        onUpdateWorkspaceSettings = onUpdateWorkspaceSettings,
        wideLayout = true,
        modifier = modifier
    )
}

@Composable
private fun OrderListVisibilityButton(
    visible: Boolean,
    onClick: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val label = if (visible) "Hide orders list" else "Show orders list"
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = StudioBlue.copy(alpha = 0.12f),
        border = BorderStroke(1.dp, StudioBlue.copy(alpha = 0.18f)),
        onClick = onClick
    ) {
        Icon(
            imageVector = if (visible) Icons.AutoMirrored.Filled.KeyboardArrowLeft else Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = label,
            tint = StudioBlue,
            modifier = Modifier.padding(12.dp).size(18.dp)
        )
    }
}

@Composable
private fun OrderListRevealRail(
    visibleCount: Int,
    onShow: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Column(
        modifier = Modifier
            .width(52.dp)
            .fillMaxHeight()
            .background(MaterialTheme.colorScheme.surface)
            .border(
                BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f))
            )
            .padding(top = 16.dp, bottom = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        OrderListVisibilityButton(
            visible = false,
            onClick = onShow
        )
        Text(
            text = "Orders",
            modifier = Modifier.rotate(-90f).padding(top = 18.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 11.sp,
            fontWeight = FontWeight.ExtraBold,
            maxLines = 1
        )
        Spacer(modifier = Modifier.weight(1f))
        Surface(
            shape = CircleShape,
            color = StudioBlue.copy(alpha = 0.12f)
        ) {
            Text(
                text = visibleCount.toString(),
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp),
                color = StudioBlue,
                fontSize = 11.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1
            )
        }
    }
}

@Composable
internal fun OrderListResizeHandle(
    active: Boolean,
    onResizeStart: () -> Unit,
    onResizeBy: (Float) -> Unit,
    onResizeEnd: () -> Unit,
    onResizeCancel: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Box(
        modifier = Modifier
            .width(28.dp)
            .fillMaxHeight()
            .pointerInput(Unit) {
                detectDragGestures(
                    onDragStart = { onResizeStart() },
                    onDragEnd = { onResizeEnd() },
                    onDragCancel = { onResizeCancel() },
                    onDrag = { change, dragAmount ->
                        onResizeBy(dragAmount.x)
                        change.consume()
                    }
                )
            },
        contentAlignment = Alignment.Center
    ) {
        Surface(
            modifier = Modifier
                .width(if (active) 4.dp else 2.dp)
                .fillMaxHeight(),
            shape = RoundedCornerShape(999.dp),
            color = if (active) {
                StudioBlue.copy(alpha = 0.72f)
            } else {
                MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.86f)
            }
        ) {}
    }
}

@Composable
private fun OrderSortToggleRow(
    selectedSortMode: OrderSortMode,
    onSortModeSelected: (OrderSortMode) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        OrderSortToggleButton(
            label = "Smart",
            selected = selectedSortMode == OrderSortMode.Smart,
            onClick = { onSortModeSelected(OrderSortMode.Smart) },
            modifier = Modifier.weight(1f)
        )
        OrderSortToggleButton(
            label = "Recent",
            selected = selectedSortMode == OrderSortMode.Recent,
            onClick = { onSortModeSelected(OrderSortMode.Recent) },
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun OrderSortToggleButton(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        color = if (selected) StudioBlue.copy(alpha = 0.14f) else MaterialTheme.colorScheme.surfaceVariant,
        border = BorderStroke(
            1.dp,
            if (selected) StudioBlue.copy(alpha = 0.28f) else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f)
        ),
        onClick = onClick
    ) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
            color = if (selected) StudioBlue else MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = FontWeight.ExtraBold,
            fontSize = 13.sp,
            maxLines = 1
        )
    }
}

@Composable
private fun EmptyOrderDetailPane(modifier: Modifier = Modifier) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
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
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = workspace?.name ?: "NivaDesk",
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
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        CompactPill(text = "Smart $visibleCount/$totalCount", active = true)
        if (planName.isNotBlank()) CompactPill(text = planName, active = false)
    }
}

@Composable
private fun CompactPill(text: String, active: Boolean) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
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

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun OrderListCard(
    order: StudioOrder,
    workspace: StudioWorkspace?,
    workspaceSettings: StudioWorkspaceSettings,
    teamMembers: List<StudioTeamMember>,
    selected: Boolean = false,
    multiSelected: Boolean,
    selectionMode: Boolean,
    wideLayout: Boolean,
    onToggleOrderSelection: () -> Unit,
    onAssignOrder: (StudioTeamMember?) -> Unit,
    onUpdateOrderFields: (Map<String, Any?>) -> Unit,
    onDeleteOrder: () -> Unit,
    onOpenCustomer: () -> Unit,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit,
    onOpenOrder: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val assignee = assigneeLabel(order, teamMembers)
    val hideSensitiveNumbers = LocalHideSensitiveNumbers.current
    var contextMenuOpen by remember { mutableStateOf(false) }
    var assignMenuOpen by remember { mutableStateOf(false) }
    var detailsMenuOpen by remember { mutableStateOf(false) }
    var confirmDeleteOpen by remember { mutableStateOf(false) }
    val cardShape = RoundedCornerShape(20.dp)
    val stateTone = orderStateTone(order)
    val darkSurface = MaterialTheme.colorScheme.surface.luminance() < 0.5f
    val cardTone = when {
        // Theme-aware selected tint: dark blue in dark mode (matching the Mac app), light blue otherwise.
        selected -> if (darkSurface) Color(0xFF1E3354) else Color(0xFFDCEBFF)
        stateTone == OrderStateTone.Done ->
            if (darkSurface) Color(0xFF30A46C).copy(alpha = 0.10f).compositeOver(MaterialTheme.colorScheme.surface) else Color(0xFFF2FAF5)
        else -> MaterialTheme.colorScheme.surface
    }
    val borderTone = when {
        selected -> StudioBlue
        stateTone == OrderStateTone.Done ->
            if (darkSurface) Color(0xFF4CC38A).copy(alpha = 0.35f) else Color(0xFF30A46C).copy(alpha = 0.28f)
        order.priority == "Urgent" -> StudioRed.copy(alpha = 0.28f)
        order.priority == "High" -> StudioWarningOrange.copy(alpha = 0.28f)
        else -> MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.72f)
    }

    Box(modifier = Modifier.fillMaxWidth()) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .combinedClickable(
                    onClick = onOpenOrder,
                    onLongClick = {
                        if (wideLayout) onOpenOrder()
                        contextMenuOpen = true
                    }
                )
                .pointerInput(order.id) {
                    awaitPointerEventScope {
                        while (true) {
                            val event = awaitPointerEvent()
                            if (event.type == PointerEventType.Press && event.buttons.isSecondaryPressed) {
                                if (wideLayout) onOpenOrder()
                                contextMenuOpen = true
                                event.changes.forEach { it.consume() }
                            }
                        }
                    }
                }
                .alpha(if (stateTone == OrderStateTone.Cancelled) 0.55f else 1f),
            shape = cardShape,
            color = cardTone,
            contentColor = MaterialTheme.colorScheme.onSurface,
            border = BorderStroke(if (selected || multiSelected) 2.dp else 1.dp, if (multiSelected) StudioBlue else borderTone),
            tonalElevation = 0.dp,
            shadowElevation = 0.dp
        ) {
            BoxWithConstraints(
                modifier = Modifier
                    .background(cardTone)
                    .drawBehind {
                        val stripeWidth = 3.dp.toPx()
                        val stripeStart = if (layoutDirection == LayoutDirection.Rtl) size.width - stripeWidth else 0f
                        drawRect(color = stateTone.stripe, topLeft = Offset(stripeStart, 0f), size = Size(stripeWidth, size.height))
                    }
            ) {
                val compact = maxWidth < 390.dp
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = if (compact) 106.dp else 118.dp)
                        .padding(horizontal = if (compact) 18.dp else 20.dp, vertical = if (compact) 16.dp else 18.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (selectionMode || multiSelected) {
                        OrderSelectionDot(selected = multiSelected)
                        Spacer(modifier = Modifier.width(10.dp))
                    }
                    if (workspaceSettings.orderCardShowPreviewImage) {
                        PreviewBox(order = order, compact = compact)
                        Spacer(modifier = Modifier.width(if (compact) 12.dp else 18.dp))
                    }
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
                            if (workspaceSettings.orderCardShowDeliveryTime && !order.isClosed && !order.isDispatched) {
                                Spacer(modifier = Modifier.width(8.dp))
                                DeliveryBadge(order = order, compact = compact)
                            }
                        }
                        if (assignee.isNotBlank()) {
                            AssignedRow(label = assignee)
                        }
                        if (workspaceSettings.orderCardShowDesignName) {
                            IconDetailRow(
                                icon = Icons.Filled.Palette,
                                label = order.designName.ifBlank { order.watchRef.ifBlank { "-" } }
                            )
                        }
                        IconDetailRow(
                            icon = Icons.Filled.DateRange,
                            label = shortDate(order)
                        )
                        if (workspaceSettings.orderCardShowUpcomingSchedule) {
                            upcomingScheduleLabel(order)?.let { label ->
                                IconDetailRow(icon = Icons.Filled.DateRange, label = label)
                            }
                        }
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Column(
                        modifier = Modifier.heightIn(min = if (compact) 86.dp else 96.dp),
                        horizontalAlignment = Alignment.End,
                        verticalArrangement = Arrangement.SpaceBetween
                    ) {
                        if (workspaceSettings.orderCardShowStatusBadges) {
                            Column(verticalArrangement = Arrangement.spacedBy(7.dp), horizontalAlignment = Alignment.End) {
                                StatusLine(label = "DESI", value = order.designStatus, compact = compact)
                                StatusLine(label = "PAIN", value = order.status, compact = compact)
                            }
                        } else {
                            Spacer(modifier = Modifier.height(1.dp))
                        }
                        if (workspaceSettings.orderCardShowOrderValue && workspace?.canSeeFinancialData == true) {
                            // Order value = paid + outstanding; amber while a balance is due.
                            Text(
                                text = moneyAmount(order.orderValue, hideSensitiveNumbers),
                                color = when {
                                    order.status == "Cancelled" -> MaterialTheme.colorScheme.onSurfaceVariant
                                    order.remainingAmount + order.customRemainingTotal > 0.009 -> StudioWarningOrange
                                    else -> StudioGreen
                                },
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = if (compact) 17.sp else 19.sp,
                                maxLines = 1,
                                softWrap = false
                            )
                        }
                    }
                }
            }
        }
        OrderListContextMenu(
            expanded = contextMenuOpen,
            order = order,
            workspace = workspace,
            workspaceSettings = workspaceSettings,
            teamMembers = teamMembers,
            multiSelected = multiSelected,
            assignMenuOpen = assignMenuOpen,
            detailsMenuOpen = detailsMenuOpen,
            wideLayout = wideLayout,
            onDismiss = {
                contextMenuOpen = false
                assignMenuOpen = false
                detailsMenuOpen = false
            },
            onToggleSelection = {
                onToggleOrderSelection()
                contextMenuOpen = false
            },
            onToggleAssignMenu = {
                assignMenuOpen = !assignMenuOpen
                if (assignMenuOpen) detailsMenuOpen = false
            },
            onAssign = { member ->
                onAssignOrder(member)
                contextMenuOpen = false
                assignMenuOpen = false
            },
            onToggleDetailsMenu = {
                detailsMenuOpen = !detailsMenuOpen
                if (detailsMenuOpen) assignMenuOpen = false
            },
            onToggleCardSetting = { key, value ->
                val updates = mutableMapOf<String, Any?>(
                    key to value,
                    "orderCardSettingsUpdatedAt" to System.currentTimeMillis()
                )
                if (key == "orderCardShowPreviewImage" && wideLayout) {
                    val delta = if (value) 72.0 else -72.0
                    updates["ordersSidebarWidth"] = (workspaceSettings.ordersSidebarWidth + delta).coerceIn(260.0, 760.0)
                    updates["ordersSidebarVisible"] = true
                }
                onUpdateWorkspaceSettings(updates, "Order card details saved.")
            },
            onOpenCustomer = {
                onOpenCustomer()
                contextMenuOpen = false
            },
            onMarkDone = {
                onUpdateOrderFields(orderStatusPayload(order, "Done"))
                contextMenuOpen = false
            },
            onCancelOrder = {
                onUpdateOrderFields(orderStatusPayload(order, "Cancelled"))
                contextMenuOpen = false
            },
            onRequestDelete = {
                contextMenuOpen = false
                confirmDeleteOpen = true
            }
        )
        if (confirmDeleteOpen) {
            AlertDialog(
                onDismissRequest = { confirmDeleteOpen = false },
                title = { Text(if (canRequestOrderDeletionFromList(workspace)) "Request deletion?" else "Delete order?") },
                text = { Text(if (canRequestOrderDeletionFromList(workspace)) "Request deletion of \"${order.displayCustomerName}\"? The order will be removed only after owner approval." else "Delete \"${order.displayCustomerName}\"? This cannot be undone.") },
                confirmButton = {
                    TextButton(
                        onClick = {
                            confirmDeleteOpen = false
                            onDeleteOrder()
                        }
                    ) {
                        Text(if (canRequestOrderDeletionFromList(workspace)) "Send Request" else t("Delete"), color = StudioRed, fontWeight = FontWeight.ExtraBold)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { confirmDeleteOpen = false }) {
                        Text(t("Cancel"))
                    }
                }
            )
        }
    }
}

@Composable
private fun OrderListContextMenu(
    expanded: Boolean,
    order: StudioOrder,
    workspace: StudioWorkspace?,
    workspaceSettings: StudioWorkspaceSettings,
    teamMembers: List<StudioTeamMember>,
    multiSelected: Boolean,
    assignMenuOpen: Boolean,
    detailsMenuOpen: Boolean,
    wideLayout: Boolean,
    onDismiss: () -> Unit,
    onToggleSelection: () -> Unit,
    onToggleAssignMenu: () -> Unit,
    onAssign: (StudioTeamMember?) -> Unit,
    onToggleDetailsMenu: () -> Unit,
    onToggleCardSetting: (String, Boolean) -> Unit,
    onOpenCustomer: () -> Unit,
    onMarkDone: () -> Unit,
    onCancelOrder: () -> Unit,
    onRequestDelete: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val canOpenCustomer = canOpenCustomerForOrder(workspace, order)
    val canAssign = canManageOrderAssignments(workspace)
    val canEditStatus = canEditOrderStatusFromList(workspace)
    val canDelete = canDeleteOrderFromList(workspace)
    val canRequestDelete = canRequestOrderDeletionFromList(workspace)
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        DropdownMenuItem(
            text = { Text(t("Open Customer")) },
            enabled = canOpenCustomer,
            leadingIcon = { Icon(Icons.Filled.Person, contentDescription = null) },
            onClick = onOpenCustomer
        )
        HorizontalDivider()
        DropdownMenuItem(
            text = { Text(if (multiSelected) "Deselect" else "Select") },
            leadingIcon = { Icon(Icons.Filled.CheckCircle, contentDescription = null) },
            onClick = onToggleSelection
        )
        DropdownMenuItem(
            text = { Text(t("Assign Project")) },
            enabled = canAssign,
            leadingIcon = { Icon(Icons.Filled.Person, contentDescription = null) },
            trailingIcon = { Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null) },
            onClick = onToggleAssignMenu
        )
        if (assignMenuOpen && canAssign) {
            DropdownMenuItem(
                text = { Text(if (order.assignedToUid.isBlank()) "[x] Unassigned" else "Unassigned") },
                onClick = { onAssign(null) }
            )
            teamMembers.filter { !it.isOwner }.forEach { member ->
                DropdownMenuItem(
                    text = {
                        Text(
                            if (order.assignedToUid == member.id) {
                                "[x] ${member.label}"
                            } else {
                                member.label
                            }
                        )
                    },
                    onClick = { onAssign(member) }
                )
            }
        }
        HorizontalDivider()
        DropdownMenuItem(
            text = { Text(t("Order Card Details")) },
            leadingIcon = { Icon(Icons.Filled.Tune, contentDescription = null) },
            trailingIcon = { Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null) },
            onClick = onToggleDetailsMenu
        )
        if (detailsMenuOpen) {
            OrderCardDetailToggleRow("Preview Image", workspaceSettings.orderCardShowPreviewImage) {
                onToggleCardSetting("orderCardShowPreviewImage", !workspaceSettings.orderCardShowPreviewImage)
            }
            OrderCardDetailToggleRow("Delivery Time", workspaceSettings.orderCardShowDeliveryTime) {
                onToggleCardSetting("orderCardShowDeliveryTime", !workspaceSettings.orderCardShowDeliveryTime)
            }
            OrderCardDetailToggleRow("Design Name", workspaceSettings.orderCardShowDesignName) {
                onToggleCardSetting("orderCardShowDesignName", !workspaceSettings.orderCardShowDesignName)
            }
            if (workspace?.canSeeFinancialData == true) {
                OrderCardDetailToggleRow("Order Value", workspaceSettings.orderCardShowOrderValue) {
                    onToggleCardSetting("orderCardShowOrderValue", !workspaceSettings.orderCardShowOrderValue)
                }
            }
            OrderCardDetailToggleRow("Upcoming Schedule", workspaceSettings.orderCardShowUpcomingSchedule) {
                onToggleCardSetting("orderCardShowUpcomingSchedule", !workspaceSettings.orderCardShowUpcomingSchedule)
            }
            OrderCardDetailToggleRow("Production Status", workspaceSettings.orderCardShowStatusBadges) {
                onToggleCardSetting("orderCardShowStatusBadges", !workspaceSettings.orderCardShowStatusBadges)
            }
        }
        HorizontalDivider()
        DropdownMenuItem(
            text = { Text(t("Mark as Done")) },
            enabled = canEditStatus,
            leadingIcon = { Icon(Icons.Filled.CheckCircle, contentDescription = null) },
            onClick = onMarkDone
        )
        DropdownMenuItem(
            text = { Text(t("Cancel Order")) },
            enabled = canEditStatus,
            leadingIcon = { Icon(Icons.Filled.Cancel, contentDescription = null) },
            onClick = onCancelOrder
        )
        HorizontalDivider()
        DropdownMenuItem(
            text = { Text(if (canRequestDelete) "Request Deletion" else t("Delete"), color = if (canDelete || canRequestDelete) StudioRed else MaterialTheme.colorScheme.onSurfaceVariant) },
            enabled = canDelete || canRequestDelete,
            leadingIcon = { Icon(Icons.Filled.Delete, contentDescription = null, tint = if (canDelete || canRequestDelete) StudioRed else MaterialTheme.colorScheme.onSurfaceVariant) },
            onClick = onRequestDelete
        )
    }
}

@Composable
private fun OrderCardDetailToggleRow(label: String, enabled: Boolean, onClick: () -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    DropdownMenuItem(
        text = { Text(label) },
        leadingIcon = {
            Text(
                if (enabled) "[x]" else "[ ]",
                color = if (enabled) StudioBlue else MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.ExtraBold
            )
        },
        onClick = onClick
    )
}

@Composable
private fun OrderSelectionDot(selected: Boolean) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        shape = CircleShape,
        color = if (selected) StudioBlue else MaterialTheme.colorScheme.surfaceVariant,
        border = BorderStroke(1.dp, if (selected) StudioBlue else MaterialTheme.colorScheme.outlineVariant)
    ) {
        Box(modifier = Modifier.size(24.dp), contentAlignment = Alignment.Center) {
            if (selected) {
                Text("✓", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold)
            }
        }
    }
}

@Composable
private fun PreviewBox(order: StudioOrder, compact: Boolean = false) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    // The preview image is ONLY the dedicated preview (stored in designLink), matching
    // Mac and Web. Do not fall back to Client File images — those are not the preview.
    val previewUrl = remember(order.id, order.designLink) {
        order.designLink.trim()
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
private fun DeliveryBadge(
    order: StudioOrder,
    compact: Boolean = false
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val days = order.remainingDays
    val tone = when {
        days < 0 -> StudioRed
        days <= 7 -> StudioRed
        days <= 14 -> StudioWarningOrange
        else -> StudioGreen
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
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
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
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(shape = CircleShape, color = StudioBlue.copy(alpha = 0.13f)) {
        Box(modifier = Modifier.size(34.dp), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.Person, contentDescription = null, tint = StudioBlue, modifier = Modifier.size(22.dp))
        }
    }
}

@Composable
private fun IconDetailRow(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
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
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
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

private enum class OrderStateTone(val stripe: Color) {
    Late(Color(0xFFE5484D)),
    Waiting(Color(0xFFF5A623)),
    Active(Color(0xFF2F6DF6)),
    Done(Color(0xFF30A46C)),
    Cancelled(Color(0xFF8D939E))
}

private fun orderStateTone(order: StudioOrder): OrderStateTone {
    val normalizedStatus = order.status.trim().lowercase()
    if (normalizedStatus == "cancelled" || normalizedStatus == "canceled") return OrderStateTone.Cancelled
    if (normalizedStatus == "done" || normalizedStatus == "completed" || order.isDispatched) return OrderStateTone.Done
    val days = orderDueDaysRemaining(order)
    if (days != null && days < 0) return OrderStateTone.Late
    if (normalizedStatus.contains("waiting")) return OrderStateTone.Waiting
    return OrderStateTone.Active
}

private fun orderDueDaysRemaining(order: StudioOrder): Int? {
    if (order.deliveryTime <= 0) return null
    val startOfDay: Calendar.() -> Unit = {
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }
    val due = Calendar.getInstance().apply {
        time = Date(order.paymentDate.time + order.deliveryTime * 24L * 60L * 60L * 1000L)
        startOfDay()
    }
    val today = Calendar.getInstance().apply { startOfDay() }
    return Math.round((due.timeInMillis - today.timeInMillis) / (24.0 * 60.0 * 60.0 * 1000.0)).toInt()
}

private fun orderStatusPayload(order: StudioOrder, status: String): Map<String, Any?> {
    val nextExtraStatuses = order.extraStatuses.keys.associateWith { status }
    return mapOf(
        "designStatus" to status,
        "paintingStatus" to status,
        "details" to mapOf("extraStatuses" to nextExtraStatuses)
    )
}

private fun canOpenCustomerForOrder(workspace: StudioWorkspace?, order: StudioOrder): Boolean {
    val cleanName = order.displayCustomerName.trim()
    return workspace?.memberAccess?.customers == true &&
        cleanName.isNotBlank() &&
        !cleanName.equals("New Project", ignoreCase = true)
}

private fun canManageOrderAssignments(workspace: StudioWorkspace?): Boolean {
    if (workspace == null || !workspace.memberAccess.orders) return false
    return workspace.isOwner || workspace.memberAccess.manageProjectAssignments
}

private fun canEditOrderStatusFromList(workspace: StudioWorkspace?): Boolean {
    if (workspace == null || !workspace.memberAccess.orders) return false
    val role = workspace.role.lowercase(Locale.UK)
    return workspace.isOwner || role in setOf("admin", "member", "workflow", "workflowonly", "workflow_only")
}

private fun canDeleteOrderFromList(workspace: StudioWorkspace?): Boolean {
    if (workspace == null || !workspace.memberAccess.orders) return false
    val role = workspace.role.lowercase(Locale.UK)
    return workspace.isOwner || role in setOf("admin", "member")
}

private fun canRequestOrderDeletionFromList(workspace: StudioWorkspace?): Boolean {
    if (workspace == null || !workspace.memberAccess.orders) return false
    val role = workspace.role.lowercase(Locale.UK).replace("_", "").replace("-", "").replace(" ", "")
    return role == "workflow" || role == "workflowonly" || workspace.shouldShowOnlyAssignedProjects
}

private fun upcomingScheduleLabel(order: StudioOrder): String? {
    val reminder = order.scheduleReminders.firstOrNull { !it.status.equals("Done", ignoreCase = true) }
        ?: return null
    val due = reminder.dueAt?.let { shortDateForDate(it) }.orEmpty()
    return listOf(reminder.title, due).filter { it.isNotBlank() }.joinToString(" · ").takeIf { it.isNotBlank() }
}

private fun moneyAmount(value: Double, hideNumbers: Boolean = false): String {
    if (hideNumbers) return privateCurrencyText("£")
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

private fun shortDateForDate(date: Date): String {
    return SimpleDateFormat("dd/MM/yy", Locale.UK).format(date)
}

private enum class OrderFilter(val label: String, val key: String) {
    All("All", "all"),
    Active("Active", "active"),
    WaitingCustomer("Waiting Customer", "waitingCustomer"),
    InProduction("In Production", "inProduction"),
    ThisWeek("This Week", "thisWeek"),
    LateOrders("Late Orders", "lateOrders"),
    UnpaidBalance("Unpaid Balance", "unpaidBalance"),
    ReadyToShip("Ready to Ship", "readyToShip"),
    Completed("Completed", "completed"),
    Trash("Trash", "trash");

    fun matches(order: StudioOrder, currentUserId: String = "", currentUserEmail: String = ""): Boolean {
        return when (this) {
            All -> true
            Active -> !orderIsClosed(order)
            WaitingCustomer -> orderNeedsCustomerReply(order)
            InProduction -> orderIsInProduction(order)
            ThisWeek -> orderIsDueThisWeek(order)
            LateOrders -> orderIsLate(order)
            UnpaidBalance -> orderHasUnpaidBalance(order)
            ReadyToShip -> orderIsReadyToShip(order)
            Completed -> orderIsCompleted(order)
            Trash -> true
        }
    }

    fun menuLabel(orders: List<StudioOrder>, currentUserId: String, currentUserEmail: String): String {
        return "$label (${orders.count { matches(it, currentUserId, currentUserEmail) }})"
    }
}

private enum class OrderSortMode(val label: String, val key: String) {
    Smart("Smart", "smart"),
    Recent("Recent", "recent");

    fun sort(orders: List<StudioOrder>): List<StudioOrder> {
        return when (this) {
            Smart -> orders.sortedWith(
                compareBy<StudioOrder> { smartOrderSortBucket(it) }
                    .thenBy { if (orderIsActiveForSmartSorting(it)) orderDaysUntilDue(it) else 0 }
                    .thenByDescending { it.paymentDate }
            )
            Recent -> orders.sortedByDescending { it.paymentDate }
        }
    }
}

private fun orderFilterFromKey(key: String?): OrderFilter {
    return when (key) {
        "waiting_customer" -> OrderFilter.WaitingCustomer
        "in_production" -> OrderFilter.InProduction
        "ready_to_ship" -> OrderFilter.ReadyToShip
        "late" -> OrderFilter.LateOrders
        else -> OrderFilter.entries.firstOrNull { it.key == key } ?: OrderFilter.All
    }
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

private fun smartOrderSortBucket(order: StudioOrder): Int {
    return if (orderIsActiveForSmartSorting(order)) 0 else 1
}

private fun orderIsActiveForSmartSorting(order: StudioOrder): Boolean {
    return !orderIsClosed(order) && !order.isDispatched
}

private fun orderPrimaryStatus(order: StudioOrder): String {
    return order.status.trim().lowercase(Locale.ROOT)
}

private fun orderIsCancelled(order: StudioOrder): Boolean {
    val status = orderPrimaryStatus(order)
    return status == "cancel" ||
        status == "cancelled" ||
        status == "canceled" ||
        status == "refunded" ||
        status.contains("cancelled") ||
        status.contains("canceled") ||
        status.contains("cancel order") ||
        status.contains("order cancelled") ||
        status.contains("order canceled") ||
        status.contains("refunded")
}

private fun orderIsCompleted(order: StudioOrder): Boolean {
    if (order.isDelivered) return true
    val status = orderPrimaryStatus(order)
    return status == "done" ||
        status == "completed" ||
        status == "delivered" ||
        status.contains("complete") ||
        status.contains("delivered")
}

private fun orderIsClosed(order: StudioOrder): Boolean {
    return orderIsCompleted(order) || orderIsCancelled(order)
}

private fun orderIsLate(order: StudioOrder): Boolean {
    return !orderIsClosed(order) && !order.isDispatched && orderDaysUntilDue(order) < 0
}

private fun orderIsDueThisWeek(order: StudioOrder): Boolean {
    if (orderIsClosed(order)) return false
    val due = startOfDay(orderDeliveryDueDate(order))
    val weekStart = startOfWeek(Date())
    val weekEnd = Date(weekStart.time + 7 * OrdersDayMs)
    return !due.before(weekStart) && due.before(weekEnd)
}

private fun orderHasUnpaidBalance(order: StudioOrder): Boolean {
    return order.remainingAmount > 0.009 ||
        orderTextTokens(order).any { text ->
            text.contains("waiting for payment") ||
                text.contains("waiting for deposit") ||
                text.contains("awaiting payment")
        }
}

private fun orderNeedsCustomerReply(order: StudioOrder): Boolean {
    val terms = listOf(
        "waiting for customer",
        "customer waiting",
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
        "packaging ready",
        "box ready"
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
        "ready for review",
        "revision needed",
        "repair",
        "testing",
        "revision",
        "draft",
        "editing",
        "sewing",
        "casting",
        "polishing",
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

private fun orderDaysUntilDue(order: StudioOrder): Int {
    val due = startOfDay(orderDeliveryDueDate(order))
    val today = startOfDay(Date())
    return ((due.time - today.time) / OrdersDayMs).toInt()
}

private fun startOfDay(date: Date): Date {
    return Calendar.getInstance().apply {
        time = date
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }.time
}

private fun startOfWeek(date: Date): Date {
    return Calendar.getInstance().apply {
        time = startOfDay(date)
        val mondayOffset = (get(Calendar.DAY_OF_WEEK) + 5) % 7
        add(Calendar.DAY_OF_YEAR, -mondayOffset)
    }.time
}

private const val OrdersSearchKey = "orders_search"
private const val OrdersFilterKey = "orders_filter"
private const val OrdersSortKey = "orders_sort"
private const val OrdersListWidthKey = "orders_list_width_dp"
private const val OrdersDayMs = 24L * 60L * 60L * 1000L

/**
 * First-run state for a workspace with no orders. Web and iOS both show a real
 * starting point here; Android rendered an empty list and nothing else, so a new
 * user had no indication of what to do next.
 */
@Composable
private fun OrdersFirstRunCard(
    creating: Boolean,
    canCreate: Boolean,
    onCreateOrder: () -> Unit,
    onRunBusinessSetup: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.padding(20.dp)
        ) {
            Text(
                text = t("Your workspace is ready"),
                fontWeight = FontWeight.ExtraBold,
                style = MaterialTheme.typography.titleMedium
            )
            Text(
                text = t("Create your first order, or run the business setup again if you want NivaDesk to prepare workflow steps, fields and labels for you."),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (canCreate) {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = StudioGreen,
                        modifier = Modifier.clickable(enabled = !creating) { onCreateOrder() }
                    ) {
                        Text(
                            text = if (creating) t("Creating...") else t("Create First Order"),
                            color = Color.White,
                            fontWeight = FontWeight.ExtraBold,
                            style = MaterialTheme.typography.labelLarge,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 11.dp)
                        )
                    }
                }
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = StudioBlue.copy(alpha = 0.12f),
                    modifier = Modifier.clickable { onRunBusinessSetup() }
                ) {
                    Text(
                        text = t("Run Business Setup"),
                        color = StudioBlue,
                        fontWeight = FontWeight.ExtraBold,
                        style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 11.dp)
                    )
                }
            }
        }
    }
}
