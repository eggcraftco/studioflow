package uk.co.eggcraft.studioflow.features.orders

import android.app.Activity
import android.content.Context
import android.content.ClipData
import android.content.ClipDescription
import android.content.ContextWrapper
import android.content.Intent
import android.graphics.BitmapFactory
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.provider.CalendarContract
import android.provider.OpenableColumns
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.foundation.draganddrop.dragAndDropSource
import androidx.compose.foundation.draganddrop.dragAndDropTarget
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.RemoveCircle
import androidx.compose.material.icons.filled.RestartAlt
import androidx.compose.material.icons.automirrored.filled.CallMerge
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Launch
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material.icons.filled.Height
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.automirrored.filled.ArrowBackIos
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material3.IconButton
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Percent
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.TableChart
import androidx.compose.material.icons.filled.Timeline
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draganddrop.DragAndDropEvent
import androidx.compose.ui.draganddrop.DragAndDropTarget
import androidx.compose.ui.draganddrop.DragAndDropTransferData
import androidx.compose.ui.draganddrop.toAndroidDragEvent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.viewinterop.AndroidView
import coil.compose.AsyncImage
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.net.URL
import org.json.JSONArray
import org.json.JSONObject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlin.math.abs
import kotlin.math.roundToInt
import uk.co.eggcraft.studioflow.data.firebase.StudioFlowRepository
import uk.co.eggcraft.studioflow.data.model.OrderDetailCardId
import uk.co.eggcraft.studioflow.data.model.OrderDetailCardLayout
import uk.co.eggcraft.studioflow.data.model.STUDIO_PRIMARY_SPECIAL_NOTE_ID
import uk.co.eggcraft.studioflow.data.model.StudioBillingPlan
import uk.co.eggcraft.studioflow.data.model.StudioEstimateRecord
import uk.co.eggcraft.studioflow.data.model.parseEstimateRecord
import uk.co.eggcraft.studioflow.data.model.StudioClientFile
import uk.co.eggcraft.studioflow.data.model.StudioHeadingItem
import uk.co.eggcraft.studioflow.data.model.StudioLibraryFile
import uk.co.eggcraft.studioflow.data.model.StudioPortalAutoUpdates
import uk.co.eggcraft.studioflow.data.model.StudioPortalVisibility
import uk.co.eggcraft.studioflow.data.model.StudioCompanyNumber
import uk.co.eggcraft.studioflow.data.model.StudioOrder
import uk.co.eggcraft.studioflow.data.model.StudioQuickReminderTemplate
import uk.co.eggcraft.studioflow.data.model.StudioScheduleReminder
import uk.co.eggcraft.studioflow.data.model.StudioTeamMember
import uk.co.eggcraft.studioflow.data.model.StudioTodoItem
import uk.co.eggcraft.studioflow.data.model.StudioWorkspace
import uk.co.eggcraft.studioflow.data.model.StudioWorkspaceSettings
import uk.co.eggcraft.studioflow.data.model.StudioWorkSession
import uk.co.eggcraft.studioflow.features.shell.LocalHideSensitiveNumbers
import uk.co.eggcraft.studioflow.features.shell.privateCurrencyText
import uk.co.eggcraft.studioflow.ui.theme.StudioBlue
import uk.co.eggcraft.studioflow.ui.theme.StudioGreen
import uk.co.eggcraft.studioflow.ui.theme.StudioRed
import uk.co.eggcraft.studioflow.ui.theme.StudioWarningOrange

private val LocalDetailCardsUnlocked = compositionLocalOf { false }
private val LocalOrderCardActions = compositionLocalOf<OrderCardCustomizationActions?> { null }
private val LocalOrderHeadingEditorActions = compositionLocalOf<OrderHeadingEditorActions?> { null }
private val LocalUnifiedBoardVerticalScroll = compositionLocalOf { false }
private val LocalKeepOrderCardVisible = compositionLocalOf<(OrderDetailCardId) -> Unit> { {} }
private val LocalCurrencySymbol = compositionLocalOf { "£" }
private val LocalDecimalSeparator = compositionLocalOf { "." }
private const val StudioCardDragMime = "application/x-studioflow-card"
private const val OrderWorkspaceLayoutKey = "__workspaceLayoutV1"
private const val MaxDesktopCardColumns = 8
private const val DesktopViewportColumnWidth = 390f
private const val OrderDetailPrefsName = "studioflow_order_detail_layout"
private const val WorkspaceCardsLockedKey = "workspaceCardsLockedV1"
private const val OrderHeaderShowDeliveryTimeKey = "orderDetailHeaderShowDeliveryTime"
private const val OrderHeaderShowUpcomingScheduleKey = "orderDetailHeaderShowUpcomingSchedule"
private const val OrderHeaderShowOrderValueKey = "orderDetailHeaderShowOrderValue"
private const val CardResizeDragSensitivity = 1f

private fun scrollWheelDeltaToPixels(delta: Float, stepPx: Float): Float {
    if (delta == 0f) return 0f
    return if (abs(delta) <= 3f) delta * stepPx else delta
}

private fun orderCardsLockedPreferenceKey(workspaceId: String?, userId: String): String {
    val workspacePart = workspaceId?.trim()?.ifBlank { null } ?: "workspace"
    val userPart = userId.trim().ifBlank { "anonymous" }
    return "$WorkspaceCardsLockedKey:$workspacePart:$userPart"
}

private data class OrderCardCustomizationActions(
    val cardId: OrderDetailCardId,
    val orderId: String,
    val isPhoneLayout: Boolean,
    val columnIndex: Int,
    val columnCount: Int,
    val columnWidth: Int,
    val layout: OrderDetailCardLayout,
    val onColumnResizeStart: () -> Unit,
    val onColumnResizeBy: (Float) -> Unit,
    val onColumnResizeFinish: () -> Unit,
    val onCardDragStart: (OrderDetailCardId) -> Unit,
    val onCardDragEnd: () -> Unit,
    val onCardResizeStart: () -> Unit = {},
    val onCardResizeFinish: () -> Unit = {},
    val onSaveLayout: (OrderDetailCardLayout) -> Unit
)

private data class OrderHeadingEditorActions(
    val workspaceSettings: StudioWorkspaceSettings,
    val onSave: (Map<String, Any?>, String) -> Unit,
    val orderExtraNoteSections: List<StudioHeadingItem> = emptyList(),
    val onSavePerOrderNoteExtras: ((List<StudioHeadingItem>) -> Unit)? = null,
    // Per-order Financial headings (seed the editor from the order, fall back to workspace).
    val orderFinancialExpenseItems: List<StudioHeadingItem> = emptyList(),
    val orderFinancialRemainingItems: List<StudioHeadingItem> = emptyList(),
    val orderFinancialBaseCostLabel: String = "Cost (Base)",
    // expense, remaining, baseLabel, showBaseCost, setAsDefault
    val onSavePerOrderFinancial: ((List<StudioHeadingItem>, List<StudioHeadingItem>, String, Boolean, Boolean) -> Unit)? = null
)

private data class OrderHeadingEditorConfig(
    val title: String,
    val subtitle: String,
    val groups: List<OrderHeadingEditorGroup> = emptyList(),
    val fields: List<OrderHeadingEditorField> = emptyList(),
    val toggles: List<OrderHeadingEditorToggle> = emptyList(),
    // When non-null, the dialog shows an editable company-invoice-numbers list
    // (VAT/EORI/company no.) and merges them into the save as companyNumbersJSON.
    val companyNumbers: List<StudioCompanyNumber>? = null,
    val saveMessage: String,
    val buildUpdates: (OrderHeadingEditorDraft) -> Map<String, Any?>
)

private data class OrderHeadingEditorGroup(
    val key: String,
    val title: String,
    val description: String,
    val addLabel: String,
    val emptyText: String,
    val items: List<StudioHeadingItem>,
    val lockedFirstId: String? = null,
    val minimumCount: Int = 0
)

private data class OrderHeadingEditorField(
    val key: String,
    val label: String,
    val value: String,
    val fallback: String
)

private data class OrderHeadingEditorToggle(
    val key: String,
    val label: String,
    val value: Boolean
)

private data class OrderHeadingEditorDraft(
    val groups: Map<String, List<StudioHeadingItem>>,
    val fields: Map<String, String>,
    val toggles: Map<String, Boolean>
)

private data class OrderHeaderDetailsState(
    val showDeliveryTime: Boolean,
    val showUpcomingSchedule: Boolean,
    val showOrderValue: Boolean,
    val setShowDeliveryTime: (Boolean) -> Unit,
    val setShowUpcomingSchedule: (Boolean) -> Unit,
    val setShowOrderValue: (Boolean) -> Unit
)

private data class SavedCardLayoutProfile(
    val id: String,
    val name: String,
    val snapshotJSON: String
)

private data class TeamCardLayoutProfile(
    val userId: String,
    val displayName: String,
    val subtitle: String,
    val snapshotJSON: String,
    val isMine: Boolean
)

@Composable
fun OrderDetailScreen(
    order: StudioOrder,
    workspace: StudioWorkspace?,
    workspaceSettings: StudioWorkspaceSettings,
    teamMembers: List<StudioTeamMember>,
    statusOptions: List<String>,
    onBack: () -> Unit,
    onAssignOrder: (StudioOrder, StudioTeamMember?) -> Unit,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onSaveOrderCardLayout: (StudioOrder, String) -> Unit = { _, _ -> },
    onResetOrderCardLayout: (StudioOrder) -> Unit = {},
    onUploadClientFile: (StudioOrder, ByteArray, String, String) -> Unit,
    onUploadPreviewImage: (StudioOrder, ByteArray, String, String) -> Unit,
    onRefreshLiveTracking: (StudioOrder) -> Unit,
    onRenameClientFile: (StudioOrder, String, String) -> Unit,
    onDeleteClientFile: (StudioOrder, String) -> Unit,
    currentUserId: String = "",
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit = { _, _ -> },
    showBack: Boolean = true,
    allOrders: List<StudioOrder> = emptyList(),
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val access = workspace?.memberAccess
    fun allowed(key: String): Boolean = access?.allows(key) != false && workspaceSettings.showsCard(key)
    val canSeeFinancial = workspace?.canSeeFinancialData == true && allowed("cardFinancial")
    val canAssign = workspace?.let {
        it.isOwner || it.memberAccess.manageProjectAssignments
    } == true
    val canEditWorkflow = workspace?.let {
        (it.isOwner || it.role in setOf("admin", "member", "workflow")) && it.memberAccess.orders
    } == true
    val canEditFinance = workspace?.let {
        (it.isOwner || it.role in setOf("admin", "member")) && it.memberAccess.financialInfo
    } == true
    val canAssignTasks = workspace?.billingPlan == StudioBillingPlan.TeamMonthly && teamMembers.isNotEmpty()
    val financeAdvancedEnabled = workspace?.billingPlan == StudioBillingPlan.ProMonthly || workspace?.billingPlan == StudioBillingPlan.TeamMonthly
    // Mirror the Mac rule for who can manage Client Files: Pro/Team plan AND an
    // order-edit role (with Orders access) AND the Client Files member-access flag.
    // (Android previously only checked the plan, so it was too permissive.)
    val canManageClientFiles = financeAdvancedEnabled && canEditWorkflow && (access?.allows("clientFiles") != false)
    val canManageCardLayout = workspace?.let {
        it.isOwner || (it.role in setOf("admin", "member", "workflow") && it.memberAccess.orders)
    } == true
    val orderLayoutSnapshotJson = order.customFields[OrderWorkspaceLayoutKey].orEmpty()
    val independentOrderLayout = remember(order.id, orderLayoutSnapshotJson) {
        orderLayoutSnapshotJson
            .trim()
            .takeIf { it.isNotBlank() }
            ?.let { orderDetailCardLayoutFromSnapshotJSON(it) }
    }
    // Order-TYPE layout (e.g. every repair order opens with the repair cards
    // forward). Same precedence as web + server: independent per-order layout >
    // TYPE snapshot > user's workspace profile > shared snapshot > default.
    // Display-only — it is applied via effectiveWorkspaceSettings exactly like
    // the independent layout and is never uploaded anywhere.
    val typeOrderLayout = remember(order.id, order.orderType, workspaceSettings.typeWorkspaceSnapshotsJSON) {
        orderTypeCardLayoutFromSnapshotsJSON(workspaceSettings.typeWorkspaceSnapshotsJSON, order.orderType)
    }
    val effectiveWorkspaceSettings = remember(workspaceSettings, independentOrderLayout, typeOrderLayout) {
        (independentOrderLayout ?: typeOrderLayout)?.let { workspaceSettings.copy(orderCardLayout = it) }
            ?: workspaceSettings
    }
    fun allowedCard(cardId: OrderDetailCardId): Boolean {
        return when (cardId) {
            OrderDetailCardId.Financial -> canSeeFinancial
            else -> allowed(cardId.accessKey)
        }
    }
    var locallyVisibleCards by remember(order.id) { mutableStateOf(emptySet<OrderDetailCardId>()) }
    fun isLayoutCardVisible(layout: OrderDetailCardLayout, cardId: OrderDetailCardId): Boolean {
        return layout.isVisible(cardId) || cardId in locallyVisibleCards
    }
    fun saveCardLayout(nextLayout: OrderDetailCardLayout) {
        locallyVisibleCards = locallyVisibleCards.filter { nextLayout.isVisible(it) }.toSet()
        val snapshotJSON = nextLayout.toWorkspaceSnapshotJSON()
        if (independentOrderLayout != null || typeOrderLayout != null) {
            // Guarded like the independent per-order layout: while a TYPE layout
            // is displayed, an edit must not be re-saved into the user's profile
            // or the shared snapshot (that would clobber them with the type
            // layout). The edit lands on the order itself, which then wins over
            // the type snapshot — display resolution stays intact.
            onSaveOrderCardLayout(order, snapshotJSON)
            return
        }
        val updates = mutableMapOf<String, Any?>("sharedWorkspaceSnapshotJSON" to snapshotJSON)
        val profilesJSON = upsertWorkspaceUserProfileJSON(
            existingJSON = workspaceSettings.workspaceUserProfilesJSON,
            userId = currentUserId,
            workspace = workspace,
            snapshotJSON = snapshotJSON
        )
        if (profilesJSON != null) updates["workspaceUserProfilesJSON"] = profilesJSON
        onUpdateWorkspaceSettings(updates, "Card layout saved.")
    }

    CompositionLocalProvider(
        LocalCurrencySymbol provides workspaceSettings.selectedCurrency.ifBlank { "£" },
        LocalDecimalSeparator provides workspaceSettings.selectedDecimalSeparator,
        LocalKeepOrderCardVisible provides { cardId ->
            locallyVisibleCards = locallyVisibleCards + cardId
        },
        LocalOrderHeadingEditorActions provides remember(workspaceSettings, order.id, order.customFields) {
            OrderHeadingEditorActions(
                workspaceSettings = workspaceSettings,
                onSave = onUpdateWorkspaceSettings,
                orderExtraNoteSections = perOrderExtraNoteSections(order),
                onSavePerOrderNoteExtras = { items -> savePerOrderExtraNoteSections(order, items, onUpdateOrderFields) },
                orderFinancialExpenseItems = orderFinancialItems(order, ORDER_EXPENSE_ITEMS_KEY, "Cost", workspaceSettings.financialExpenseItems),
                orderFinancialRemainingItems = orderFinancialItems(order, ORDER_REMAINING_ITEMS_KEY, "Pending", workspaceSettings.financialRemainingItems),
                orderFinancialBaseCostLabel = orderBaseCostLabelValue(order, workspaceSettings.financialBaseCostLabel),
                onSavePerOrderFinancial = { expense, remaining, baseLabel, showBaseCost, setAsDefault ->
                    val cleanedBase = baseLabel.trim().take(120).ifBlank { "Cost (Base)" }
                    // Per-order list + base label onto the order (backend moves amount keys on rename).
                    onUpdateOrderFields(order, mapOf("details" to mapOf("customFields" to mapOf(
                        ORDER_EXPENSE_ITEMS_KEY to genericHeadingItemsJsonForOrder(expense),
                        ORDER_REMAINING_ITEMS_KEY to genericHeadingItemsJsonForOrder(remaining),
                        ORDER_BASE_COST_LABEL_KEY to cleanedBase
                    ))))
                    // Only the show-base-cost toggle is workspace-wide; the lists become the
                    // new-order default only when the user ticked "Set as default".
                    val workspaceUpdates = mutableMapOf<String, Any?>("financialShowBaseCost" to showBaseCost)
                    if (setAsDefault) {
                        workspaceUpdates["financialExpenseItemsJSON"] = genericHeadingItemsJsonForOrder(expense)
                        workspaceUpdates["financialRemainingItemsJSON"] = genericHeadingItemsJsonForOrder(remaining)
                        workspaceUpdates["financialBaseCostLabel"] = cleanedBase
                    }
                    onUpdateWorkspaceSettings(workspaceUpdates, "Financial headings saved.")
                }
            )
        }
    ) {
        BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val useBoardLayout = !showBack && maxWidth >= 520.dp
        if (useBoardLayout) {
            DesktopOrderDetailBoard(
                order = order,
                workspace = workspace,
                workspaceSettings = effectiveWorkspaceSettings,
                teamMembers = teamMembers,
                statusOptions = statusOptions,
                canAssign = canAssign,
                canEditWorkflow = canEditWorkflow,
                canEditFinance = canEditFinance,
                canSeeFinancial = canSeeFinancial,
                canAssignTasks = canAssignTasks,
                financeAdvancedEnabled = financeAdvancedEnabled,
                onAssignOrder = onAssignOrder,
                onUpdateOrderFields = onUpdateOrderFields,
                onUploadClientFile = onUploadClientFile,
                onUploadPreviewImage = onUploadPreviewImage,
                onRefreshLiveTracking = onRefreshLiveTracking,
                onRenameClientFile = onRenameClientFile,
                onDeleteClientFile = onDeleteClientFile,
                canManageCardLayout = canManageCardLayout,
                locallyVisibleCards = locallyVisibleCards,
                isOrderIndependentLayout = independentOrderLayout != null,
                onDetachOrderLayout = {
                    onSaveOrderCardLayout(order, effectiveWorkspaceSettings.orderCardLayout.toWorkspaceSnapshotJSON())
                },
                onResetOrderLayout = { onResetOrderCardLayout(order) },
                onSaveCardLayout = ::saveCardLayout,
                currentUserId = currentUserId,
                onSaveWorkspaceProfilesJSON = { profilesJSON, message ->
                    onUpdateWorkspaceSettings(mapOf("workspaceUserProfilesJSON" to profilesJSON), message)
                },
                onUpdateWorkspaceSettings = onUpdateWorkspaceSettings,
                modifier = Modifier.fillMaxSize()
            )
            return@BoxWithConstraints
        }

        val phoneLayout = effectiveWorkspaceSettings.orderCardLayout
        val visiblePhoneCards = phoneLayout.phoneOrder
            .filter { cardId -> allowedCard(cardId) && isLayoutCardVisible(phoneLayout, cardId) }
        val hiddenPhoneCards = OrderDetailCardId.DefaultOrder
            .filter { cardId -> allowedCard(cardId) && !isLayoutCardVisible(phoneLayout, cardId) }
        var resizingPhoneCard by remember(order.id) { mutableStateOf(false) }
        var draggingPhoneCard by remember(order.id) { mutableStateOf<OrderDetailCardId?>(null) }
        var phoneCardProfilesOpen by remember(order.id) { mutableStateOf(false) }
        val phoneCtx = LocalContext.current
        val phoneLockPrefs = remember(phoneCtx) {
            phoneCtx.getSharedPreferences(OrderDetailPrefsName, Context.MODE_PRIVATE)
        }
        val phoneLockKey = remember(workspace?.id, currentUserId) {
            orderCardsLockedPreferenceKey(workspace?.id, currentUserId)
        }
        var phoneCardsUnlocked by remember(phoneLockKey) {
            mutableStateOf(!phoneLockPrefs.getBoolean(phoneLockKey, false))
        }
        val effectivePhoneCardsUnlocked = phoneCardsUnlocked && canManageCardLayout
        var phoneCompactView by remember {
            mutableStateOf(phoneLockPrefs.getBoolean("phoneOrderCompactViewV1", false))
        }
        fun setPhoneCompactView(value: Boolean) {
            phoneCompactView = value
            phoneLockPrefs.edit().putBoolean("phoneOrderCompactViewV1", value).apply()
        }
        val phoneListState = androidx.compose.foundation.lazy.rememberLazyListState()
        val compactScrollScope = androidx.compose.runtime.rememberCoroutineScope()
        // Delivery push tapped: bring the requested card (Shipping & Tracking)
        // into view once this order's phone card list is on screen.
        LaunchedEffect(order.id, visiblePhoneCards) {
            val pendingCard = uk.co.eggcraft.studioflow.services.StudioMessageRouteHolder.consumePendingOrderCard()
            if (pendingCard.isNotBlank()) {
                val target = OrderDetailCardId.entries.firstOrNull { it.raw.equals(pendingCard, ignoreCase = true) }
                val cardIndex = target?.let { visiblePhoneCards.indexOf(it) } ?: -1
                if (cardIndex >= 0) {
                    val headerItems = 1 + if (hiddenPhoneCards.isNotEmpty() && effectivePhoneCardsUnlocked) 1 else 0
                    kotlinx.coroutines.delay(400)
                    phoneListState.animateScrollToItem(headerItems + cardIndex)
                }
            }
        }
        LazyColumn(
            state = phoneListState,
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            userScrollEnabled = !resizingPhoneCard
        ) {
            item {
                DetailTopBar(
                    order = order,
                    workspaceSettings = effectiveWorkspaceSettings,
                    canSeeFinancial = canSeeFinancial,
                    financeAdvancedEnabled = financeAdvancedEnabled,
                    onBack = onBack,
                    showBack = showBack,
                    canManageCardLayout = canManageCardLayout,
                    cardsUnlocked = phoneCardsUnlocked,
                    onCardsUnlockedChange = { next ->
                        phoneCardsUnlocked = next
                        phoneLockPrefs.edit().putBoolean(phoneLockKey, !next).apply()
                    },
                    compactView = phoneCompactView,
                    onCompactViewChange = { setPhoneCompactView(it) },
                    onOpenCardProfiles = if (canManageCardLayout && currentUserId.isNotBlank()) {
                        { phoneCardProfilesOpen = true }
                    } else {
                        null
                    }
                )
            }
            item { ShopifyOrderSourceStrip(order = order) }
            if (hiddenPhoneCards.isNotEmpty() && effectivePhoneCardsUnlocked) {
                item {
                    HiddenCardsBar(
                        hiddenCards = hiddenPhoneCards,
                        onShowCard = { cardId ->
                            saveCardLayout(phoneLayout.withCardVisibility(cardId, true))
                        }
                    )
                }
            }
            if (phoneCompactView) {
                visiblePhoneCards.filter { phoneCardHasContent(order, it) }.forEach { cardId ->
                    item(key = "compact_" + cardId.raw) {
                        PhoneCompactCardRow(
                            cardId = cardId,
                            order = order,
                            onOpen = {
                                setPhoneCompactView(false)
                                val cardIndex = visiblePhoneCards.indexOf(cardId)
                                if (cardIndex >= 0) {
                                    val headerItems = 1 + if (hiddenPhoneCards.isNotEmpty() && effectivePhoneCardsUnlocked) 1 else 0
                                    compactScrollScope.launch {
                                        kotlinx.coroutines.delay(250)
                                        phoneListState.animateScrollToItem(headerItems + cardIndex)
                                    }
                                }
                            }
                        )
                    }
                }
            } else {
            visiblePhoneCards.forEach { cardId ->
                item(key = cardId.raw) {
                    OrderLayoutCardFrame(
                        cardId = cardId,
                        cardsUnlocked = effectivePhoneCardsUnlocked,
                        isDragging = draggingPhoneCard == cardId,
                        customizationActions = OrderCardCustomizationActions(
                            cardId = cardId,
                            orderId = order.id,
                            isPhoneLayout = true,
                            columnIndex = -1,
                            columnCount = 0,
                            columnWidth = 0,
                            layout = phoneLayout,
                            onColumnResizeStart = {},
                            onColumnResizeBy = {},
                            onColumnResizeFinish = {},
                            onCardDragStart = { dragged -> draggingPhoneCard = dragged },
                            onCardDragEnd = { draggingPhoneCard = null },
                            onCardResizeStart = { resizingPhoneCard = true },
                            onCardResizeFinish = { resizingPhoneCard = false },
                            onSaveLayout = ::saveCardLayout
                        ),
                        onDragEnd = { draggingPhoneCard = null },
                        onDropCard = { dragged, insertAfter ->
                            if (dragged != cardId) {
                                saveCardLayout(
                                    if (insertAfter) {
                                        phoneLayout.movePhoneCardAfter(dragged, cardId)
                                    } else {
                                        phoneLayout.movePhoneCardBefore(dragged, cardId)
                                    }
                                )
                            }
                        }
                    ) {
                        OrderDetailCardContent(
                            cardId = cardId,
                            order = order,
                            workspaceSettings = effectiveWorkspaceSettings,
                            statusOptions = statusOptions,
                            teamMembers = teamMembers,
                            canEditWorkflow = canEditWorkflow,
                            canEditFinance = canEditFinance,
                            canSeeFinancial = canSeeFinancial,
                            canAssignTasks = canAssignTasks,
                            financeAdvancedEnabled = financeAdvancedEnabled,
                            canManageClientFiles = canManageClientFiles,
                            onUpdateOrderFields = onUpdateOrderFields,
                            onUploadClientFile = onUploadClientFile,
                            onUploadPreviewImage = onUploadPreviewImage,
                            onRefreshLiveTracking = onRefreshLiveTracking,
                            onRenameClientFile = onRenameClientFile,
                            onDeleteClientFile = onDeleteClientFile,
                            onUpdateWorkspaceSettings = onUpdateWorkspaceSettings
                        )
                    }
                }
            }
            }
            item {
                Spacer(modifier = Modifier.height(18.dp))
            }
        }
        if (phoneCardProfilesOpen) {
            CardLayoutProfilesDialog(
                profilesJSON = workspaceSettings.workspaceUserProfilesJSON,
                currentUserId = currentUserId,
                workspace = workspace,
                orderId = order.id,
                cardLayout = phoneLayout,
                isOrderIndependentLayout = independentOrderLayout != null,
                currentSnapshotJSON = phoneLayout.toWorkspaceSnapshotJSON(),
                onDismiss = { phoneCardProfilesOpen = false },
                onLoadLayout = { nextLayout ->
                    saveCardLayout(nextLayout)
                    phoneCardProfilesOpen = false
                },
                onApplyLayout = ::saveCardLayout,
                onDetachOrderLayout = {
                    onSaveOrderCardLayout(order, phoneLayout.toWorkspaceSnapshotJSON())
                    phoneCardProfilesOpen = false
                },
                onResetOrderLayout = {
                    onResetOrderCardLayout(order)
                    phoneCardProfilesOpen = false
                },
                onSaveProfilesJSON = { profilesJSON, message ->
                    onUpdateWorkspaceSettings(mapOf("workspaceUserProfilesJSON" to profilesJSON), message)
                }
            )
        }
    }
    }
}

// "Used" cards only: compact mode hides cards with no real content.
private fun phoneCardHasContent(order: StudioOrder, cardId: OrderDetailCardId): Boolean = when (cardId) {
    OrderDetailCardId.Summary -> true
    OrderDetailCardId.CustomerPortal -> order.customerPortal.active
    OrderDetailCardId.Preview -> order.designLink.isNotBlank() || order.designName.isNotBlank()
    OrderDetailCardId.RepairIntake -> order.orderType == "repair" ||
        order.repairIntake?.let { it.fields.isNotEmpty() || it.condition.isNotEmpty() || it.requestedWork.isNotEmpty() } == true
    OrderDetailCardId.Estimate -> order.estimates.isNotEmpty()
    OrderDetailCardId.Customer -> order.customerName.isNotBlank()
    OrderDetailCardId.Materials -> order.invBool1 || order.invBool2 || order.invBool3 || order.invBool4 || order.invNotes.isNotBlank()
    OrderDetailCardId.Priority -> order.priority != "Normal" || order.risk != "None"
    OrderDetailCardId.Delivery -> order.deliveryTime > 0
    OrderDetailCardId.Notes -> order.notes.isNotBlank()
    OrderDetailCardId.ClientFiles -> order.clientFiles.isNotEmpty()
    OrderDetailCardId.Todo -> order.todoItems.isNotEmpty()
    OrderDetailCardId.WorkTime -> order.workSessions.isNotEmpty()
    OrderDetailCardId.Financial -> order.paidAmount != 0.0 || order.remainingAmount != 0.0
    OrderDetailCardId.Status -> order.status.isNotBlank()
    OrderDetailCardId.Shipping -> order.isDispatched || order.isDelivered || order.trackingNumber.isNotBlank()
    OrderDetailCardId.Schedule -> order.scheduleReminders.isNotEmpty()
    OrderDetailCardId.HistoryLog -> order.historyLog.isNotEmpty()
    OrderDetailCardId.InvoiceItems -> order.lineItems.isNotEmpty()
}

@Composable
private fun phoneCompactSummary(order: StudioOrder, cardId: OrderDetailCardId, t: (String) -> String): String = when (cardId) {
    OrderDetailCardId.Summary -> listOf(order.designName, t(order.status)).filter { it.isNotBlank() }.joinToString(" • ")
    OrderDetailCardId.CustomerPortal -> if (order.customerPortal.active) t("Portal active") else t("Customer Portal")
    OrderDetailCardId.Preview -> order.designName.ifBlank { t("Preview") }
    OrderDetailCardId.RepairIntake -> order.repairIntake?.fields?.get("itemType").orEmpty().ifBlank { t("Repair Intake & Item") }
    OrderDetailCardId.Estimate -> order.estimates.firstOrNull()?.number.orEmpty().ifBlank { t("Estimate & Approval") }
    OrderDetailCardId.Customer -> order.customerName
    OrderDetailCardId.Materials -> "${listOf(order.invBool1, order.invBool2, order.invBool3, order.invBool4).count { it }}/4"
    OrderDetailCardId.InvoiceItems -> "${order.lineItems.size}"
    OrderDetailCardId.Priority -> listOf(t(order.priority), if (order.risk == "None") "" else t(order.risk)).filter { it.isNotBlank() }.joinToString(" • ")
    OrderDetailCardId.Delivery -> "${order.deliveryTime} " + t("days")
    OrderDetailCardId.Notes -> order.notes.lineSequence().firstOrNull().orEmpty()
    OrderDetailCardId.ClientFiles -> "${order.clientFiles.size}"
    OrderDetailCardId.Todo -> "${order.todoItems.count { it.isDone }}/${order.todoItems.size}"
    OrderDetailCardId.WorkTime -> {
        val total = order.workSessions.sumOf { it.durationSeconds }
        val hours = total / 3600
        val minutes = (total % 3600) / 60
        if (hours > 0) "${hours}h ${minutes}m" else "${minutes}m"
    }
    OrderDetailCardId.Financial -> t("Paid") + " ${money(order.paidAmount)} • " + t("Remaining") + " ${money(order.remainingAmount)}"
    OrderDetailCardId.Status -> t(order.status)
    OrderDetailCardId.Shipping -> when {
        order.isDelivered -> t("Delivered")
        order.trackingNumber.isNotBlank() -> "${order.courier} ${order.trackingNumber}".trim()
        order.isDispatched -> t("Dispatched")
        else -> t("Not dispatched")
    }
    OrderDetailCardId.Schedule -> "${order.scheduleReminders.size}"
    OrderDetailCardId.HistoryLog -> "${order.historyLog.size}"
}

@Composable
private fun PhoneCompactCardRow(
    cardId: OrderDetailCardId,
    order: StudioOrder,
    onOpen: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        onClick = onOpen,
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp)
        ) {
            Text(
                t(cardId.title),
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(0.46f)
            )
            Text(
                phoneCompactSummary(order, cardId, t),
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = androidx.compose.ui.text.style.TextAlign.End,
                modifier = Modifier.weight(0.54f)
            )
        }
    }
}

@Composable
private fun DetailTopBar(
    order: StudioOrder,
    workspaceSettings: StudioWorkspaceSettings,
    canSeeFinancial: Boolean,
    financeAdvancedEnabled: Boolean,
    onBack: () -> Unit,
    showBack: Boolean,
    canManageCardLayout: Boolean,
    cardsUnlocked: Boolean = false,
    onCardsUnlockedChange: (Boolean) -> Unit = {},
    compactView: Boolean = false,
    onCompactViewChange: ((Boolean) -> Unit)? = null,
    onOpenCardProfiles: (() -> Unit)?,
    onMergeOrder: (() -> Unit)? = null
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val context = LocalContext.current
    val headerDetails = rememberOrderHeaderDetailsState()
    var actionsOpen by remember { mutableStateOf(false) }
    val exportInvoice = rememberInvoiceExporter(workspaceSettings)
    val exportOrderPdf = rememberOrderPdfExporter(workspaceSettings, canSeeFinancial, financeAdvancedEnabled)

    @Composable
    fun ActionsMenuButton() {
        Box {
            HeaderActionsMenuButton(onClick = { actionsOpen = true })
            OrderHeaderActionsMenu(
                expanded = actionsOpen,
                onDismiss = { actionsOpen = false },
                canCustomize = canManageCardLayout && onOpenCardProfiles != null,
                canSeeFinancial = canSeeFinancial,
                headerDetails = headerDetails,
                onCustomize = {
                    actionsOpen = false
                    onOpenCardProfiles?.invoke()
                },
                onExportPdf = {
                    actionsOpen = false
                    exportOrderPdf(order)
                },
                onInvoicePdf = {
                    actionsOpen = false
                    exportInvoice(order)
                },
                onMergeOrder = onMergeOrder?.let { cb ->
                    {
                        actionsOpen = false
                        cb()
                    }
                }
            )
        }
    }

    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        val tabletHeader = maxWidth >= 600.dp
        if (tabletHeader) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 54.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                if (showBack) {
                    TextButton(onClick = onBack) {
                        Text(t("Orders"), color = StudioBlue, fontWeight = FontWeight.ExtraBold)
                    }
                }
                Text(
                    text = order.displayCustomerName.ifBlank { "New Project" },
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 22.sp
                )
                OrderHeaderBadges(
                    order = order,
                    canSeeFinancial = canSeeFinancial,
                    headerDetails = headerDetails,
                    compact = true,
                    modifier = Modifier
                        .widthIn(max = 260.dp)
                        .horizontalScroll(rememberScrollState())
                )
                ActionsMenuButton()
            }
        } else {
            // Android phone: no back link row (system back button handles it).
            Column(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = order.displayCustomerName.ifBlank { "New Project" },
                        modifier = Modifier.weight(1f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 28.sp,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    if (onCompactViewChange != null) {
                        IconButton(
                            onClick = { onCompactViewChange(!compactView) },
                            modifier = Modifier
                                .size(40.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(
                                    if (compactView) StudioBlue.copy(alpha = 0.14f)
                                    else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.72f)
                                )
                        ) {
                            Icon(
                                imageVector = if (compactView) Icons.Filled.KeyboardArrowDown else Icons.Filled.KeyboardArrowUp,
                                contentDescription = if (compactView) "Full View" else "Compact View",
                                tint = if (compactView) StudioBlue else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                    if (canManageCardLayout) {
                        IconButton(
                            onClick = { onCardsUnlockedChange(!cardsUnlocked) },
                            modifier = Modifier
                                .size(40.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.72f))
                        ) {
                            Icon(
                                imageVector = if (cardsUnlocked) Icons.Filled.LockOpen else Icons.Filled.Lock,
                                contentDescription = if (cardsUnlocked) "Lock cards" else "Unlock cards",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                    IconButton(
                        onClick = { actionsOpen = true },
                        modifier = Modifier
                            .size(40.dp)
                            .clip(CircleShape)
                            .background(StudioBlue)
                    ) {
                        Icon(
                            imageVector = Icons.Filled.MoreHoriz,
                            contentDescription = t("Actions"),
                            tint = androidx.compose.ui.graphics.Color.White,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                    OrderHeaderActionsMenu(
                        expanded = actionsOpen,
                        onDismiss = { actionsOpen = false },
                        canCustomize = canManageCardLayout && onOpenCardProfiles != null,
                        canSeeFinancial = canSeeFinancial,
                        headerDetails = headerDetails,
                        showHeaderDetailToggles = false,
                        onCustomize = {
                            actionsOpen = false
                            onOpenCardProfiles?.invoke()
                        },
                        onExportPdf = {
                            actionsOpen = false
                            exportOrderPdf(order)
                        },
                        onInvoicePdf = {
                            actionsOpen = false
                            exportInvoice(order)
                        },
                        onMergeOrder = onMergeOrder?.let { cb ->
                            {
                                actionsOpen = false
                                cb()
                            }
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun DetailHero(
    order: StudioOrder,
    assignee: String,
    canAssign: Boolean,
    teamMembers: List<StudioTeamMember>,
    onAssignOrder: (StudioOrder, StudioTeamMember?) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 2.dp
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            DetailHeroPreview(order = order)
            Spacer(modifier = Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = order.displayCustomerName,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    fontSize = 21.sp,
                    fontWeight = FontWeight.ExtraBold
                )
                if (order.designName.isNotBlank()) {
                    Text(
                        text = order.designName,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    StatusPill(order.designStatus, statusColor(order.designStatus))
                    StatusPill(order.status, statusColor(order.status))
                }
                if (assignee.isNotBlank()) {
                    Text(
                        text = "Assigned to $assignee",
                        color = StudioBlue,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            if (canAssign) {
                AssignmentMenuForDetail(order = order, teamMembers = teamMembers, onAssignOrder = onAssignOrder)
            }
        }
    }
}

@Composable
private fun DetailHeroPreview(order: StudioOrder) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    // Preview is only the dedicated preview image (designLink), like Mac/Web.
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
            .size(76.dp)
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
            Text("SF", color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.ExtraBold)
        }
    }
}

@Composable
private fun DesktopOrderDetailBoard(
    order: StudioOrder,
    workspace: StudioWorkspace?,
    workspaceSettings: StudioWorkspaceSettings,
    teamMembers: List<StudioTeamMember>,
    statusOptions: List<String>,
    canAssign: Boolean,
    canEditWorkflow: Boolean,
    canEditFinance: Boolean,
    canSeeFinancial: Boolean,
    canAssignTasks: Boolean,
    financeAdvancedEnabled: Boolean,
    onAssignOrder: (StudioOrder, StudioTeamMember?) -> Unit,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onUploadClientFile: (StudioOrder, ByteArray, String, String) -> Unit,
    onUploadPreviewImage: (StudioOrder, ByteArray, String, String) -> Unit,
    onRefreshLiveTracking: (StudioOrder) -> Unit,
    onRenameClientFile: (StudioOrder, String, String) -> Unit,
    onDeleteClientFile: (StudioOrder, String) -> Unit,
    canManageCardLayout: Boolean,
    locallyVisibleCards: Set<OrderDetailCardId> = emptySet(),
    isOrderIndependentLayout: Boolean,
    onDetachOrderLayout: () -> Unit,
    onResetOrderLayout: () -> Unit,
    onSaveCardLayout: (OrderDetailCardLayout) -> Unit,
    currentUserId: String,
    onSaveWorkspaceProfilesJSON: (String, String) -> Unit,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit = { _, _ -> },
    onMergeOrder: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val access = workspace?.memberAccess
    val canManageClientFiles = financeAdvancedEnabled && canEditWorkflow && (access?.allows("clientFiles") != false)
    fun allowed(key: String): Boolean = access?.allows(key) != false && workspaceSettings.showsCard(key)
    fun allowedCard(cardId: OrderDetailCardId): Boolean {
        return when (cardId) {
            OrderDetailCardId.Financial -> canSeeFinancial
            else -> allowed(cardId.accessKey)
        }
    }
    val context = LocalContext.current
    val cardsLockPreferences = remember(context) {
        context.getSharedPreferences(OrderDetailPrefsName, Context.MODE_PRIVATE)
    }
    val cardsLockedPreferenceKey = remember(workspace?.id, currentUserId) {
        orderCardsLockedPreferenceKey(workspace?.id, currentUserId)
    }
    var cardsUnlocked by remember(cardsLockedPreferenceKey) {
        mutableStateOf(!cardsLockPreferences.getBoolean(cardsLockedPreferenceKey, false))
    }
    var cardProfilesOpen by remember(order.id) { mutableStateOf(false) }
    var resizingColumnIndex by remember(order.id) { mutableStateOf<Int?>(null) }
    var resizeColumnBaseWidth by remember(order.id) { mutableStateOf(0) }
    var resizeColumnDeltaDp by remember(order.id) { mutableStateOf(0f) }
    var draggingBoardCard by remember(order.id) { mutableStateOf<OrderDetailCardId?>(null) }
    fun isLayoutCardVisible(layout: OrderDetailCardLayout, cardId: OrderDetailCardId): Boolean {
        return layout.isVisible(cardId) || cardId in locallyVisibleCards
    }
    LaunchedEffect(draggingBoardCard) {
        val activeDrag = draggingBoardCard ?: return@LaunchedEffect
        delay(30_000)
        if (draggingBoardCard == activeDrag) draggingBoardCard = null
    }

    BoxWithConstraints(
        modifier = modifier
            .background(MaterialTheme.colorScheme.background)
    ) {
        val boardMaxWidth = maxWidth
        val minColumnHeight = maxOf(520, (maxHeight.value - 180f).roundToInt())
        val density = LocalDensity.current
        val layout = workspaceSettings.orderCardLayout
        Column(modifier = Modifier.fillMaxSize()) {
            DesktopOrderHeader(
                order = order,
                workspace = workspace,
                workspaceSettings = workspaceSettings,
                canAssign = canAssign,
                canEditWorkflow = canEditWorkflow,
                canEditFinance = canEditFinance,
                canSeeFinancial = canSeeFinancial,
                financeAdvancedEnabled = financeAdvancedEnabled,
                cardsUnlocked = cardsUnlocked && canManageCardLayout,
                onCardsUnlockedChange = {
                    if (canManageCardLayout) {
                        cardsUnlocked = it
                        cardsLockPreferences
                            .edit()
                            .putBoolean(cardsLockedPreferenceKey, !it)
                            .apply()
                        if (!it) draggingBoardCard = null
                    }
                },
                canManageCardLayout = canManageCardLayout,
                isOrderIndependentLayout = isOrderIndependentLayout,
                cardLayout = layout,
                teamMembers = teamMembers,
                onAssignOrder = onAssignOrder,
                onUpdateOrderFields = onUpdateOrderFields,
                onDetachOrderLayout = onDetachOrderLayout,
                onResetOrderLayout = onResetOrderLayout,
                onSaveCardLayout = onSaveCardLayout,
                onOpenCardProfiles = { cardProfilesOpen = true },
                currentUserId = currentUserId,
                onSaveWorkspaceProfilesJSON = onSaveWorkspaceProfilesJSON,
                onMergeOrder = onMergeOrder
            )
            ShopifyOrderSourceStrip(order = order)
            CompositionLocalProvider(
                LocalDetailCardsUnlocked provides (cardsUnlocked && canManageCardLayout),
                LocalUnifiedBoardVerticalScroll provides true
            ) {
                val lastVisibleColumnIndex = layout.columns.indices.lastOrNull { columnIndex ->
                    layout.columns[columnIndex].any { cardId -> allowedCard(cardId) && isLayoutCardVisible(layout, cardId) }
                } ?: -1
                val visibleColumnCount = (lastVisibleColumnIndex + 1)
                    .coerceAtLeast(1)
                    .coerceAtMost(MaxDesktopCardColumns)
                val viewportColumnCount = maxOf(
                    OrderDetailCardId.DefaultColumns.size,
                    ((boardMaxWidth.value + 40f) / DesktopViewportColumnWidth).toInt().coerceAtLeast(1)
                ).coerceAtMost(MaxDesktopCardColumns)
                val availableColumnCount = maxOf(
                    layout.columns.size,
                    viewportColumnCount,
                    visibleColumnCount
                ).coerceAtMost(MaxDesktopCardColumns)
                val columnCount = (if (draggingBoardCard != null) {
                    maxOf(availableColumnCount, visibleColumnCount + 1)
                } else {
                    visibleColumnCount
                })
                    .coerceAtMost(MaxDesktopCardColumns)
                val hiddenCards = OrderDetailCardId.DefaultOrder
                    .filter { cardId -> allowedCard(cardId) && !isLayoutCardVisible(layout, cardId) }
                if (hiddenCards.isNotEmpty() && cardsUnlocked && canManageCardLayout) {
                    HiddenCardsBar(
                        hiddenCards = hiddenCards,
                        onShowCard = { cardId ->
                            onSaveCardLayout(layout.withCardVisibility(cardId, true))
                        }
                    )
                }
                val boardHorizontalScroll = rememberScrollState()
                val boardVerticalScroll = rememberScrollState()
                val edgeScrollStepPx = with(density) { 22.dp.toPx() }
                val mouseWheelStepPx = with(density) { 84.dp.toPx() }
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .horizontalScroll(boardHorizontalScroll, enabled = false)
                        .pointerInput(boardHorizontalScroll, boardVerticalScroll, mouseWheelStepPx) {
                            awaitPointerEventScope {
                                while (true) {
                                    val event = awaitPointerEvent()
                                    if (event.type != PointerEventType.Scroll) continue

                                    var consumed = false
                                    event.changes.forEach { change ->
                                        val scrollDelta = change.scrollDelta
                                        val horizontalDelta = scrollWheelDeltaToPixels(scrollDelta.x, mouseWheelStepPx)
                                        val verticalDelta = scrollWheelDeltaToPixels(scrollDelta.y, mouseWheelStepPx)
                                        if (horizontalDelta != 0f) {
                                            consumed = boardHorizontalScroll.dispatchRawDelta(horizontalDelta) != 0f || consumed
                                        }
                                        if (verticalDelta != 0f) {
                                            consumed = boardVerticalScroll.dispatchRawDelta(verticalDelta) != 0f || consumed
                                        }
                                    }
                                    if (consumed) {
                                        event.changes.forEach { it.consume() }
                                    }
                                }
                            }
                        }
                        .pointerInput(boardHorizontalScroll, boardVerticalScroll, draggingBoardCard, resizingColumnIndex) {
                            detectDragGestures { change, dragAmount ->
                                if (draggingBoardCard != null || resizingColumnIndex != null || change.isConsumed) {
                                    return@detectDragGestures
                                }
                                val consumedX = boardHorizontalScroll.dispatchRawDelta(-dragAmount.x)
                                val consumedY = boardVerticalScroll.dispatchRawDelta(-dragAmount.y)
                                if (consumedX != 0f || consumedY != 0f) {
                                    change.consume()
                                }
                            }
                        }
                ) {
                    Row(
                        modifier = Modifier
                            .verticalScroll(boardVerticalScroll, enabled = false)
                            .padding(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                        verticalAlignment = Alignment.Top
                    ) {
                        for (columnIndex in 0 until columnCount) {
                            val savedColumnWidth = layout.columnWidths
                                .getOrNull(columnIndex)
                                ?.coerceIn(260, 800)
                                ?: when {
                                    boardMaxWidth >= 1500.dp -> 340
                                    boardMaxWidth >= 720.dp -> 310
                                    else -> 286
                                }
                            val columnWidth = if (resizingColumnIndex == columnIndex) {
                                (resizeColumnBaseWidth + resizeColumnDeltaDp).coerceIn(260f, 800f).roundToInt()
                            } else {
                                savedColumnWidth
                            }
                            val columnCards = layout.columns
                                .getOrElse(columnIndex) { emptyList() }
                                .filter { cardId -> allowedCard(cardId) && isLayoutCardVisible(layout, cardId) }
                            val visibleCardHeights = columnCards.sumOf { cardId ->
                                layout.savedHeightFor(cardId, order.id) ?: defaultRenderedCardHeight(cardId)
                            }
                            val visibleGapHeights = if (draggingBoardCard != null) {
                                columnCards.size * 30
                            } else {
                                columnCards.size * 12
                            }
                            val bottomDropZoneHeight = if (columnCards.isEmpty()) {
                                minColumnHeight
                            } else {
                                maxOf(80, minColumnHeight - visibleCardHeights - visibleGapHeights)
                            }
                            DesktopColumn(
                                widthDp = columnWidth,
                                minHeightDp = minColumnHeight,
                                resizable = cardsUnlocked && canManageCardLayout,
                                isResizing = resizingColumnIndex == columnIndex,
                                onResizeStart = {
                                    resizingColumnIndex = columnIndex
                                    resizeColumnBaseWidth = columnWidth
                                    resizeColumnDeltaDp = 0f
                                },
                                onResizeBy = { dragPixels ->
                                    resizeColumnDeltaDp += with(density) { dragPixels.toDp().value }
                                },
                                onResizeEnd = {
                                    val finalWidth = (resizeColumnBaseWidth + resizeColumnDeltaDp)
                                        .coerceIn(260f, 800f)
                                        .roundToInt()
                                    onSaveCardLayout(layout.withColumnWidth(columnIndex, finalWidth))
                                    resizingColumnIndex = null
                                    resizeColumnBaseWidth = 0
                                    resizeColumnDeltaDp = 0f
                                },
                                onResizeCancel = {
                                    resizingColumnIndex = null
                                    resizeColumnBaseWidth = 0
                                    resizeColumnDeltaDp = 0f
                                }
                            ) {
                                columnCards.forEach { cardId ->
                                    if (draggingBoardCard != null) {
                                        CardInsertionDropZone(
                                            enabled = cardsUnlocked && canManageCardLayout,
                                            onDragEnd = { draggingBoardCard = null },
                                            onDropCard = { dragged ->
                                                if (dragged != cardId) {
                                                    onSaveCardLayout(layout.moveDesktopCardBefore(dragged, columnIndex, cardId))
                                                }
                                            }
                                        )
                                    }
                                    OrderLayoutCardFrame(
                                        cardId = cardId,
                                        cardsUnlocked = cardsUnlocked && canManageCardLayout,
                                        isDragging = draggingBoardCard == cardId,
                                        customizationActions = OrderCardCustomizationActions(
                                            cardId = cardId,
                                            orderId = order.id,
                                            isPhoneLayout = false,
                                            columnIndex = columnIndex,
                                            columnCount = columnCount,
                                            columnWidth = columnWidth,
                                            layout = layout,
                                            onColumnResizeStart = {
                                                resizingColumnIndex = columnIndex
                                                resizeColumnBaseWidth = columnWidth
                                                resizeColumnDeltaDp = 0f
                                            },
                                            onColumnResizeBy = { dragPixels ->
                                                resizeColumnDeltaDp += with(density) { dragPixels.toDp().value }
                                            },
                                            onColumnResizeFinish = {
                                                resizingColumnIndex = null
                                                resizeColumnBaseWidth = 0
                                                resizeColumnDeltaDp = 0f
                                            },
                                            onCardDragStart = { dragged -> draggingBoardCard = dragged },
                                            onCardDragEnd = { draggingBoardCard = null },
                                            onSaveLayout = onSaveCardLayout
                                        ),
                                        onDragEnd = { draggingBoardCard = null },
                                        onDropCard = { dragged, insertAfter ->
                                            if (dragged != cardId) {
                                                onSaveCardLayout(
                                                    if (insertAfter) {
                                                        layout.moveDesktopCardAfter(dragged, columnIndex, cardId)
                                                    } else {
                                                        layout.moveDesktopCardBefore(dragged, columnIndex, cardId)
                                                    }
                                                )
                                            }
                                        }
                                    ) {
                                        OrderDetailCardContent(
                                            cardId = cardId,
                                            order = order,
                                            workspaceSettings = workspaceSettings,
                                            statusOptions = statusOptions,
                                            teamMembers = teamMembers,
                                            canEditWorkflow = canEditWorkflow,
                                            canEditFinance = canEditFinance,
                                            canSeeFinancial = canSeeFinancial,
                                            canAssignTasks = canAssignTasks,
                                            financeAdvancedEnabled = financeAdvancedEnabled,
                                            canManageClientFiles = canManageClientFiles,
                                            onUpdateOrderFields = onUpdateOrderFields,
                                            onUploadClientFile = onUploadClientFile,
                                            onUploadPreviewImage = onUploadPreviewImage,
                                            onRefreshLiveTracking = onRefreshLiveTracking,
                                            onRenameClientFile = onRenameClientFile,
                                            onDeleteClientFile = onDeleteClientFile,
                                            onUpdateWorkspaceSettings = onUpdateWorkspaceSettings
                                        )
                                    }
                                }
                                ColumnDropZone(
                                    enabled = cardsUnlocked && canManageCardLayout,
                                    hasCards = columnCards.isNotEmpty(),
                                    heightDp = bottomDropZoneHeight,
                                    onDragEnd = { draggingBoardCard = null },
                                    onDropCard = { dragged ->
                                        onSaveCardLayout(layout.moveDesktopCardToColumnEnd(dragged, columnIndex))
                                    }
                                )
                            }
                        }
                    }
                    if (draggingBoardCard != null && cardsUnlocked && canManageCardLayout) {
                        BoardEdgeScrollDropZone(
                            modifier = Modifier
                                .align(Alignment.CenterStart)
                                .fillMaxHeight()
                                .width(54.dp),
                            enabled = boardHorizontalScroll.value > 0,
                            onDragEnd = { draggingBoardCard = null },
                            onScrollStep = { boardHorizontalScroll.dispatchRawDelta(-edgeScrollStepPx) },
                            onDropCard = { dragged ->
                                onSaveCardLayout(layout.moveDesktopCardToColumnEnd(dragged, 0))
                            }
                        )
                        BoardEdgeScrollDropZone(
                            modifier = Modifier
                                .align(Alignment.CenterEnd)
                                .fillMaxHeight()
                                .width(54.dp),
                            enabled = boardHorizontalScroll.value < boardHorizontalScroll.maxValue,
                            onDragEnd = { draggingBoardCard = null },
                            onScrollStep = { boardHorizontalScroll.dispatchRawDelta(edgeScrollStepPx) },
                            onDropCard = { dragged ->
                                onSaveCardLayout(layout.moveDesktopCardToColumnEnd(dragged, (columnCount - 1).coerceAtLeast(0)))
                            }
                        )
                    }
                }
            }
            if (cardProfilesOpen) {
                CardLayoutProfilesDialog(
                    profilesJSON = workspaceSettings.workspaceUserProfilesJSON,
                    currentUserId = currentUserId,
                    workspace = workspace,
                    orderId = order.id,
                    cardLayout = layout,
                    isOrderIndependentLayout = isOrderIndependentLayout,
                    currentSnapshotJSON = layout.toWorkspaceSnapshotJSON(),
                    onDismiss = { cardProfilesOpen = false },
                    onLoadLayout = { nextLayout ->
                        onSaveCardLayout(nextLayout)
                        cardProfilesOpen = false
                    },
                    onApplyLayout = onSaveCardLayout,
                    onDetachOrderLayout = {
                        onDetachOrderLayout()
                        cardProfilesOpen = false
                    },
                    onResetOrderLayout = {
                        onResetOrderLayout()
                        cardProfilesOpen = false
                    },
                    onSaveProfilesJSON = onSaveWorkspaceProfilesJSON
                )
            }
        }
    }
}

@Composable
private fun DesktopOrderHeader(
    order: StudioOrder,
    workspace: StudioWorkspace?,
    workspaceSettings: StudioWorkspaceSettings,
    canAssign: Boolean,
    canEditWorkflow: Boolean,
    canEditFinance: Boolean,
    canSeeFinancial: Boolean,
    financeAdvancedEnabled: Boolean,
    cardsUnlocked: Boolean,
    onCardsUnlockedChange: (Boolean) -> Unit,
    canManageCardLayout: Boolean,
    isOrderIndependentLayout: Boolean,
    cardLayout: OrderDetailCardLayout,
    teamMembers: List<StudioTeamMember>,
    onAssignOrder: (StudioOrder, StudioTeamMember?) -> Unit,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onDetachOrderLayout: () -> Unit,
    onResetOrderLayout: () -> Unit,
    onSaveCardLayout: (OrderDetailCardLayout) -> Unit,
    onOpenCardProfiles: () -> Unit,
    currentUserId: String,
    onSaveWorkspaceProfilesJSON: (String, String) -> Unit,
    onMergeOrder: (() -> Unit)? = null
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val context = LocalContext.current
    val headerDetails = rememberOrderHeaderDetailsState()
    var actionsOpen by remember { mutableStateOf(false) }

    @Composable
    fun HeaderBadges() {
        OrderHeaderBadges(
            order = order,
            canSeeFinancial = canSeeFinancial,
            headerDetails = headerDetails
        )
    }

    @Composable
    fun HeaderActions() {
        val exportInvoice = rememberInvoiceExporter(workspaceSettings)
        val exportOrderPdf = rememberOrderPdfExporter(workspaceSettings, canSeeFinancial, financeAdvancedEnabled)
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            HeaderLockPill(
                cardsUnlocked = cardsUnlocked,
                canManageCardLayout = canManageCardLayout,
                onCardsUnlockedChange = onCardsUnlockedChange
            )
            Box {
                HeaderActionsMenuButton(onClick = { actionsOpen = true })
                OrderHeaderActionsMenu(
                    expanded = actionsOpen,
                    onDismiss = { actionsOpen = false },
                    canCustomize = canManageCardLayout && currentUserId.isNotBlank(),
                    canSeeFinancial = canSeeFinancial,
                    headerDetails = headerDetails,
                    onCustomize = {
                        actionsOpen = false
                        onOpenCardProfiles()
                    },
                    onExportPdf = {
                        actionsOpen = false
                        exportOrderPdf(order)
                    },
                    onInvoicePdf = {
                        actionsOpen = false
                        exportInvoice(order)
                    },
                    onMergeOrder = onMergeOrder?.let { cb ->
                        {
                            actionsOpen = false
                            cb()
                        }
                    }
                )
            }
        }
    }

    Surface(
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp
    ) {
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 58.dp)
                .padding(horizontal = 24.dp, vertical = 8.dp)
        ) {
            val narrowHeader = maxWidth < 760.dp
            val compactHeader = maxWidth < 1100.dp
            if (narrowHeader) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            text = order.displayCustomerName.ifBlank { "New Project" },
                            modifier = Modifier.weight(1f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.ExtraBold
                        )
                        HeaderActions()
                    }
                    HeaderBadges()
                }
            } else if (compactHeader) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        text = order.displayCustomerName.ifBlank { "New Project" },
                        modifier = Modifier.weight(1f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                    HeaderBadges()
                    HeaderActions()
                }
            } else {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 42.dp)
                ) {
                    Text(
                        text = order.displayCustomerName.ifBlank { "New Project" },
                        modifier = Modifier
                            .align(Alignment.CenterStart)
                            .widthIn(max = 440.dp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                    Box(modifier = Modifier.align(Alignment.Center)) {
                        HeaderBadges()
                    }
                    Box(modifier = Modifier.align(Alignment.CenterEnd)) {
                        HeaderActions()
                    }
                }
            }
        }
    }
}

@Composable
private fun rememberOrderHeaderDetailsState(): OrderHeaderDetailsState {
    val context = LocalContext.current
    val prefs = remember(context) {
        context.getSharedPreferences(OrderDetailPrefsName, Context.MODE_PRIVATE)
    }
    var showDeliveryTime by remember {
        mutableStateOf(prefs.getBoolean(OrderHeaderShowDeliveryTimeKey, true))
    }
    var showUpcomingSchedule by remember {
        mutableStateOf(prefs.getBoolean(OrderHeaderShowUpcomingScheduleKey, true))
    }
    var showOrderValue by remember {
        mutableStateOf(prefs.getBoolean(OrderHeaderShowOrderValueKey, true))
    }
    fun save(key: String, value: Boolean) {
        prefs.edit().putBoolean(key, value).apply()
    }
    return OrderHeaderDetailsState(
        showDeliveryTime = showDeliveryTime,
        showUpcomingSchedule = showUpcomingSchedule,
        showOrderValue = showOrderValue,
        setShowDeliveryTime = { value ->
            showDeliveryTime = value
            save(OrderHeaderShowDeliveryTimeKey, value)
        },
        setShowUpcomingSchedule = { value ->
            showUpcomingSchedule = value
            save(OrderHeaderShowUpcomingScheduleKey, value)
        },
        setShowOrderValue = { value ->
            showOrderValue = value
            save(OrderHeaderShowOrderValueKey, value)
        }
    )
}

@Composable
private fun OrderHeaderBadges(
    order: StudioOrder,
    canSeeFinancial: Boolean,
    headerDetails: OrderHeaderDetailsState,
    modifier: Modifier = Modifier,
    compact: Boolean = false
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val nextSchedule = remember(order.scheduleReminders) { nextHeaderScheduleReminder(order) }
    val hasVisibleBadge = (headerDetails.showUpcomingSchedule && nextSchedule != null) ||
        headerDetails.showDeliveryTime ||
        (headerDetails.showOrderValue && canSeeFinancial)
    if (!hasVisibleBadge) return

    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(if (compact) 6.dp else 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (headerDetails.showUpcomingSchedule && nextSchedule != null) {
            HeaderMetricPill(
                label = "${nextSchedule.title.ifBlank { "Reminder" }} · ${scheduleRelativeLabel(nextSchedule)}",
                color = scheduleStatusColor(nextSchedule),
                icon = Icons.Filled.Info,
                compact = compact
            )
        }
        if (headerDetails.showDeliveryTime) {
            HeaderMetricPill(
                label = deliveryLongLabel(order),
                color = deliveryColor(order),
                icon = Icons.Filled.DateRange,
                compact = compact
            )
        }
        if (headerDetails.showOrderValue && canSeeFinancial) {
            HeaderMetricPill(
                label = money(order.orderValue),
                color = StudioGreen,
                iconText = LocalCurrencySymbol.current,
                compact = compact
            )
        }
    }
}

@Composable
private fun HeaderMetricPill(
    label: String,
    color: Color,
    icon: ImageVector? = null,
    iconText: String? = null,
    compact: Boolean = false
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = color.copy(alpha = 0.13f),
        border = BorderStroke(1.dp, color.copy(alpha = 0.22f))
    ) {
        Row(
            modifier = Modifier.padding(
                horizontal = if (compact) 9.dp else 13.dp,
                vertical = if (compact) 6.dp else 7.dp
            ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(if (compact) 6.dp else 8.dp)
        ) {
            if (iconText != null) {
                Text(
                    text = iconText,
                    color = color,
                    fontSize = if (compact) 12.sp else 13.sp,
                    fontWeight = FontWeight.ExtraBold
                )
            } else if (icon != null) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = color,
                    modifier = Modifier.size(if (compact) 14.dp else 15.dp)
                )
            }
            Text(
                text = label,
                color = color,
                fontSize = if (compact) 12.sp else 14.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1
            )
        }
    }
}

@Composable
private fun HeaderLockPill(
    cardsUnlocked: Boolean,
    canManageCardLayout: Boolean,
    onCardsUnlockedChange: (Boolean) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val label = if (cardsUnlocked) t("Cards Unlocked") else t("Cards Locked")
    val textColor = MaterialTheme.colorScheme.onSurfaceVariant
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.72f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        onClick = {
            if (canManageCardLayout) onCardsUnlockedChange(!cardsUnlocked)
        }
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 13.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(
                imageVector = Icons.Filled.LockOpen,
                contentDescription = null,
                modifier = Modifier.size(15.dp),
                tint = textColor
            )
            Text(
                text = label,
                color = textColor,
                fontSize = 13.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1
            )
        }
    }
}

@Composable
private fun HeaderActionsMenuButton(onClick: () -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surface,
        onClick = onClick
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 4.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp)
        ) {
            Icon(
                imageVector = Icons.Filled.MoreHoriz,
                contentDescription = null,
                modifier = Modifier.size(18.dp)
            )
            Text(
                text = t("Actions"),
                fontSize = 14.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1
            )
            Icon(
                imageVector = Icons.Filled.KeyboardArrowDown,
                contentDescription = null,
                modifier = Modifier.size(17.dp)
            )
        }
    }
}

@Composable
private fun OrderHeaderActionsMenu(
    expanded: Boolean,
    onDismiss: () -> Unit,
    canCustomize: Boolean,
    canSeeFinancial: Boolean,
    headerDetails: OrderHeaderDetailsState,
    onCustomize: () -> Unit,
    onExportPdf: () -> Unit,
    onInvoicePdf: () -> Unit = {},
    onMergeOrder: (() -> Unit)? = null,
    showHeaderDetailToggles: Boolean = true
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        if (showHeaderDetailToggles) {
            Text(
                text = "Order Header Details",
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
                fontWeight = FontWeight.ExtraBold
            )
            HeaderDetailsToggleMenuItem(
                label = "Delivery Time",
                checked = headerDetails.showDeliveryTime,
                onToggle = { headerDetails.setShowDeliveryTime(!headerDetails.showDeliveryTime) }
            )
            HeaderDetailsToggleMenuItem(
                label = "Upcoming Schedule",
                checked = headerDetails.showUpcomingSchedule,
                onToggle = { headerDetails.setShowUpcomingSchedule(!headerDetails.showUpcomingSchedule) }
            )
            if (canSeeFinancial) {
                HeaderDetailsToggleMenuItem(
                    label = "Order Value",
                    checked = headerDetails.showOrderValue,
                    onToggle = { headerDetails.setShowOrderValue(!headerDetails.showOrderValue) }
                )
            }
            HorizontalDivider(modifier = Modifier.padding(vertical = 6.dp))
        }
        DropdownMenuItem(
            text = { Text(t("Customize")) },
            leadingIcon = { Icon(Icons.Filled.Settings, contentDescription = null) },
            enabled = canCustomize,
            onClick = onCustomize
        )
        HorizontalDivider(modifier = Modifier.padding(vertical = 6.dp))
        DropdownMenuItem(
            text = { Text(t("Export PDF")) },
            leadingIcon = { Icon(Icons.Filled.Description, contentDescription = null) },
            onClick = onExportPdf
        )
        if (canSeeFinancial) {
            DropdownMenuItem(
                text = { Text(t("Invoice PDF")) },
                leadingIcon = { Icon(Icons.Filled.PictureAsPdf, contentDescription = null) },
                onClick = onInvoicePdf
            )
        }
    }
}

@Composable
private fun HeaderDetailsToggleMenuItem(label: String, checked: Boolean, onToggle: () -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    DropdownMenuItem(
        text = { Text(label) },
        leadingIcon = {
            Text(
                text = if (checked) "✓" else "○",
                color = StudioBlue,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 15.sp
            )
        },
        onClick = onToggle
    )
}

@Composable
private fun CardLayoutProfilesDialog(
    profilesJSON: String,
    currentUserId: String,
    workspace: StudioWorkspace?,
    orderId: String,
    cardLayout: OrderDetailCardLayout,
    isOrderIndependentLayout: Boolean,
    currentSnapshotJSON: String,
    onDismiss: () -> Unit,
    onLoadLayout: (OrderDetailCardLayout) -> Unit,
    onApplyLayout: (OrderDetailCardLayout) -> Unit,
    onDetachOrderLayout: () -> Unit,
    onResetOrderLayout: () -> Unit,
    onSaveProfilesJSON: (String, String) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var profiles by remember(profilesJSON, currentUserId, currentSnapshotJSON) {
        mutableStateOf(
            savedCardLayoutProfilesForCurrentUser(
                existingJSON = profilesJSON,
                userId = currentUserId,
                currentSnapshotJSON = currentSnapshotJSON
            )
        )
    }
    val teamProfiles = remember(profilesJSON, currentUserId) {
        teamCardLayoutProfilesForDisplay(profilesJSON, currentUserId)
    }
    val followedTeamUserId = remember(profilesJSON, currentUserId) {
        currentWorkspaceProfileSyncSourceUserId(profilesJSON, currentUserId)
    }
    val followedTeamProfile = remember(teamProfiles, followedTeamUserId) {
        teamProfiles.firstOrNull { it.userId == followedTeamUserId }
    }
    var workingLayout by remember(cardLayout) { mutableStateOf(cardLayout) }
    val workingSnapshotJSON = workingLayout.toWorkspaceSnapshotJSON()

    fun persist(nextProfiles: List<SavedCardLayoutProfile>, message: String) {
        val cleanProfiles = normalizedSavedCardLayoutProfiles(nextProfiles, workingSnapshotJSON)
        profiles = cleanProfiles
        val updatedJSON = upsertSavedCardLayoutProfilesJSON(
            existingJSON = profilesJSON,
            userId = currentUserId,
            workspace = workspace,
            savedProfiles = cleanProfiles,
            activeSnapshotJSON = workingSnapshotJSON
        )
        if (updatedJSON != null) onSaveProfilesJSON(updatedJSON, message)
    }

    fun loadTeamProfile(profile: TeamCardLayoutProfile) {
        val layout = orderDetailCardLayoutFromSnapshotJSON(profile.snapshotJSON) ?: return
        workingLayout = layout
        if (!profile.isMine) {
            val ownSnapshotJSON = currentWorkspaceProfileSnapshotJSON(profilesJSON, currentUserId)
                .ifBlank { workingSnapshotJSON }
            val updatedJSON = upsertSavedCardLayoutProfilesJSON(
                existingJSON = profilesJSON,
                userId = currentUserId,
                workspace = workspace,
                savedProfiles = profiles,
                activeSnapshotJSON = ownSnapshotJSON,
                syncSourceUserId = profile.userId
            )
            if (updatedJSON != null) {
                onSaveProfilesJSON(updatedJSON, "Synced with team card profile: ${profile.displayName}")
            }
            onDismiss()
            return
        }
        onLoadLayout(layout)
    }

    fun loadPersonalProfile(profile: SavedCardLayoutProfile) {
        val layout = orderDetailCardLayoutFromSnapshotJSON(profile.snapshotJSON) ?: return
        workingLayout = layout
        val updatedJSON = upsertSavedCardLayoutProfilesJSON(
            existingJSON = profilesJSON,
            userId = currentUserId,
            workspace = workspace,
            savedProfiles = profiles,
            activeSnapshotJSON = profile.snapshotJSON
        )
        if (updatedJSON != null) {
            onSaveProfilesJSON(updatedJSON, "${profile.name.trim().ifBlank { t("Card profile") }} loaded.")
        }
        onLoadLayout(layout)
    }

    fun stopFollowingTeamProfile() {
        val ownSnapshotJSON = currentWorkspaceProfileSnapshotJSON(profilesJSON, currentUserId)
            .ifBlank { workingSnapshotJSON }
        val updatedJSON = upsertSavedCardLayoutProfilesJSON(
            existingJSON = profilesJSON,
            userId = currentUserId,
            workspace = workspace,
            savedProfiles = profiles,
            activeSnapshotJSON = ownSnapshotJSON
        )
        if (updatedJSON != null) {
            onSaveProfilesJSON(updatedJSON, "Team card sync stopped.")
        }
        val ownLayout = orderDetailCardLayoutFromSnapshotJSON(ownSnapshotJSON)
        if (ownLayout != null) {
            workingLayout = ownLayout
            onLoadLayout(ownLayout)
        } else {
            onDismiss()
        }
    }

    fun applyWorkingLayout(nextLayout: OrderDetailCardLayout) {
        workingLayout = nextLayout
        onApplyLayout(nextLayout)
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(t("Workspace Customization"), fontWeight = FontWeight.ExtraBold)
                Text(
                    "Choose which blocks are visible and manage the layout for this order.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 680.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                if (followedTeamProfile != null) {
                    Surface(
                        shape = RoundedCornerShape(18.dp),
                        color = StudioGreen.copy(alpha = 0.10f),
                        border = BorderStroke(1.dp, StudioGreen.copy(alpha = 0.20f))
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Surface(
                                modifier = Modifier.size(38.dp),
                                shape = RoundedCornerShape(13.dp),
                                color = StudioGreen.copy(alpha = 0.14f)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        Icons.Filled.Person,
                                        contentDescription = null,
                                        tint = StudioGreen,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    "Following ${followedTeamProfile.displayName}",
                                    fontWeight = FontWeight.ExtraBold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    "This board uses their latest card layout. Manual card changes switch back to your own profile.",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    fontSize = 12.sp
                                )
                            }
                            TextButton(onClick = { stopFollowingTeamProfile() }) {
                                Text(t("Use mine"))
                            }
                        }
                    }
                }
                Surface(
                    shape = RoundedCornerShape(18.dp),
                    color = if (isOrderIndependentLayout) StudioWarningOrange.copy(alpha = 0.10f) else StudioBlue.copy(alpha = 0.08f),
                    border = BorderStroke(
                        1.dp,
                        if (isOrderIndependentLayout) StudioWarningOrange.copy(alpha = 0.22f) else StudioBlue.copy(alpha = 0.16f)
                    )
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Surface(
                                modifier = Modifier.size(38.dp),
                                shape = RoundedCornerShape(13.dp),
                                color = if (isOrderIndependentLayout) StudioWarningOrange.copy(alpha = 0.14f) else StudioBlue.copy(alpha = 0.14f)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        Icons.Filled.Settings,
                                        contentDescription = null,
                                        tint = if (isOrderIndependentLayout) StudioWarningOrange else StudioBlue,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    "Workspace Customization",
                                    fontWeight = FontWeight.ExtraBold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    if (isOrderIndependentLayout) "This order has its own layout" else "This order uses the shared layout",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    fontSize = 12.sp
                                )
                            }
                        }
                        Text(
                            if (isOrderIndependentLayout) {
                                "Changes here affect only this order. Other orders continue using the shared layout."
                            } else {
                                "Changes here update the shared layout for normal orders. You can separate this order whenever needed."
                            },
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 12.sp
                        )
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            if (isOrderIndependentLayout) {
                                Button(onClick = { onApplyLayout(workingLayout) }) {
                                    Text(t("Save this order"))
                                }
                                TextButton(onClick = onResetOrderLayout) {
                                    Text(t("Rejoin shared"))
                                }
                            } else {
                                Button(onClick = onDetachOrderLayout) {
                                    Text(t("Make independent"))
                                }
                                TextButton(onClick = { onApplyLayout(workingLayout) }) {
                                    Text(t("Save shared"))
                                }
                            }
                        }
                        HorizontalDivider()
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                "Board cleanup",
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 13.sp
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                TextButton(
                                    enabled = OrderDetailCardId.DefaultOrder.any { !workingLayout.isVisible(it) },
                                    onClick = { applyWorkingLayout(workingLayout.withAllCardsVisible()) }
                                ) {
                                    Text(t("Restore hidden"))
                                }
                                TextButton(
                                    onClick = { applyWorkingLayout(workingLayout.withAllCardsAutoHeight(orderId)) }
                                ) {
                                    Text(t("Auto-size cards"))
                                }
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                TextButton(
                                    onClick = { applyWorkingLayout(workingLayout.withDefaultColumnWidths()) }
                                ) {
                                    Text(t("Reset columns"))
                                }
                                TextButton(
                                    onClick = { applyWorkingLayout(workingLayout.withDefaultDesktopBoard(orderId)) }
                                ) {
                                    Text(t("Reset board"))
                                }
                            }
                        }
                    }
                }
                Surface(
                    shape = RoundedCornerShape(18.dp),
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                t("Layout Profiles"),
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 17.sp
                            )
                            Text(
                                t("Save and load different card layout presets for this order area."),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontSize = 12.sp
                            )
                        }
                        TextButton(
                            onClick = {
                                val nextIndex = profiles.size + 1
                                persist(
                                    profiles + SavedCardLayoutProfile(
                                        id = UUID.randomUUID().toString(),
                                        name = "Profile $nextIndex",
                                        snapshotJSON = workingSnapshotJSON
                                    ),
                                    t("Card profile added.")
                                )
                            }
                        ) {
                            Text("+ Add")
                        }
                    }
                }
                profiles.forEachIndexed { index, profile ->
                    val parsedLayout = remember(profile.snapshotJSON) {
                        orderDetailCardLayoutFromSnapshotJSON(profile.snapshotJSON)
                    }
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.48f),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                    ) {
                        Column(
                            modifier = Modifier.padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Surface(
                                    modifier = Modifier.size(36.dp),
                                    shape = RoundedCornerShape(12.dp),
                                    color = StudioBlue.copy(alpha = 0.12f)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            Icons.Filled.TableChart,
                                            contentDescription = null,
                                            tint = StudioBlue,
                                            modifier = Modifier.size(18.dp)
                                        )
                                    }
                                }
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        profile.name.ifBlank { "Profile ${index + 1}" },
                                        fontWeight = FontWeight.ExtraBold,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        "${orderDetailCardLayoutFromSnapshotJSON(profile.snapshotJSON)?.columns?.sumOf { it.size } ?: 0} cards",
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        fontSize = 12.sp
                                    )
                                }
                            }
                            OutlinedTextField(
                                value = profile.name,
                                onValueChange = { value ->
                                    profiles = profiles.toMutableList().also { next ->
                                        next[index] = profile.copy(name = value.take(48))
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                                label = { Text(t("Profile name")) }
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Button(
                                    onClick = {
                                        val next = profiles.toMutableList()
                                        next[index] = profile.copy(
                                            name = profile.name.trim().ifBlank { "Profile ${index + 1}" },
                                            snapshotJSON = workingSnapshotJSON
                                        )
                                        persist(next, t("Card profile saved."))
                                    }
                                ) {
                                    Text(t("Save"))
                                }
                                TextButton(
                                    enabled = parsedLayout != null,
                                    onClick = { loadPersonalProfile(profile) }
                                ) {
                                    Text(t("Load"))
                                }
                                TextButton(
                                    enabled = profiles.size > 1,
                                    onClick = {
                                        val next = profiles.toMutableList().also { it.removeAt(index) }
                                        persist(next, t("Card profile deleted."))
                                    }
                                ) {
                                    Text(t("Delete"), color = if (profiles.size > 1) StudioRed else MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
                if (teamProfiles.isNotEmpty()) {
                    HorizontalDivider()
                    Text(
                        "Team Card Profiles",
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 15.sp
                    )
                    Text(
                        "Load another team member's current card layout into this Android board.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp
                    )
                    teamProfiles.forEach { profile ->
                        val parsedLayout = remember(profile.snapshotJSON) {
                            orderDetailCardLayoutFromSnapshotJSON(profile.snapshotJSON)
                        }
                        Surface(
                            shape = RoundedCornerShape(16.dp),
                            color = if (profile.isMine) StudioBlue.copy(alpha = 0.08f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f),
                            border = BorderStroke(
                                1.dp,
                                if (profile.isMine) StudioBlue.copy(alpha = 0.18f) else MaterialTheme.colorScheme.outlineVariant
                            )
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Surface(
                                    modifier = Modifier.size(36.dp),
                                    shape = RoundedCornerShape(12.dp),
                                    color = StudioBlue.copy(alpha = 0.12f)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            Icons.Filled.Person,
                                            contentDescription = null,
                                            tint = StudioBlue,
                                            modifier = Modifier.size(18.dp)
                                        )
                                    }
                                }
                                Column(modifier = Modifier.weight(1f)) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Text(
                                            profile.displayName,
                                            fontWeight = FontWeight.ExtraBold,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                        if (profile.isMine) {
                                            Surface(
                                                shape = RoundedCornerShape(999.dp),
                                                color = StudioBlue.copy(alpha = 0.12f)
                                            ) {
                                                Text(
                                                    "Mine",
                                                    modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                                                    color = StudioBlue,
                                                    fontSize = 10.sp,
                                                    fontWeight = FontWeight.ExtraBold
                                                )
                                            }
                                        } else if (profile.userId == followedTeamUserId) {
                                            Surface(
                                                shape = RoundedCornerShape(999.dp),
                                                color = StudioGreen.copy(alpha = 0.14f)
                                            ) {
                                                Text(
                                                    "Following",
                                                    modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                                                    color = StudioGreen,
                                                    fontSize = 10.sp,
                                                    fontWeight = FontWeight.ExtraBold
                                                )
                                            }
                                        }
                                    }
                                    Text(
                                        profile.subtitle,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        fontSize = 12.sp,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        "${parsedLayout?.columns?.sumOf { it.size } ?: 0} cards",
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        fontSize = 11.sp
                                    )
                                }
                                TextButton(
                                    enabled = parsedLayout != null,
                                    onClick = { loadTeamProfile(profile) }
                                ) {
                                    Text(if (profile.isMine) "Load" else "Sync")
                                }
                            }
                        }
                    }
                }
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = StudioGreen.copy(alpha = 0.13f)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 9.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Filled.CheckCircle,
                            contentDescription = null,
                            tint = StudioGreen,
                            modifier = Modifier.size(17.dp)
                        )
                        Text(
                            if (followedTeamProfile != null) "Using synced team card profile" else "Using your card profile",
                            color = StudioGreen,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.ExtraBold
                        )
                    }
                }
                HorizontalDivider()
                Text(
                    t("Workspace Blocks"),
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 15.sp
                )
                Text(
                    "Show or hide the cards you want to see in the order detail workspace.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp
                )
                OrderDetailCardId.DefaultOrder.forEach { cardId ->
                    val roleAllowsCard = workspace?.memberAccess?.let { access ->
                        access.allows(cardId.accessKey) && (cardId != OrderDetailCardId.Financial || access.financialInfo)
                    } != false
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = if (roleAllowsCard) {
                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f)
                        } else {
                            StudioWarningOrange.copy(alpha = 0.08f)
                        },
                        border = BorderStroke(
                            1.dp,
                            if (roleAllowsCard) MaterialTheme.colorScheme.outlineVariant else StudioWarningOrange.copy(alpha = 0.22f)
                        )
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Surface(
                                modifier = Modifier.size(34.dp),
                                shape = RoundedCornerShape(11.dp),
                                color = orderDetailCardAccent(cardId).copy(alpha = 0.12f)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        orderDetailCardIcon(cardId),
                                        contentDescription = null,
                                        tint = orderDetailCardAccent(cardId),
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    cardId.title,
                                    fontWeight = FontWeight.ExtraBold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    when {
                                        !roleAllowsCard -> "Locked by role permissions"
                                        workingLayout.isVisible(cardId) -> "Visible in this board"
                                        else -> "Hidden from this board"
                                    },
                                    color = if (roleAllowsCard) MaterialTheme.colorScheme.onSurfaceVariant else StudioWarningOrange,
                                    fontSize = 12.sp
                                )
                            }
                            Switch(
                                checked = workingLayout.isVisible(cardId),
                                enabled = roleAllowsCard,
                                onCheckedChange = { visible ->
                                    applyWorkingLayout(workingLayout.withCardVisibility(cardId, visible))
                                }
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = onDismiss) {
                Text(t("Done"))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(t("Close"))
            }
        }
    )
}

@Composable
private fun DesktopColumn(
    widthDp: Int,
    minHeightDp: Int,
    resizable: Boolean,
    isResizing: Boolean,
    onResizeStart: () -> Unit,
    onResizeBy: (Float) -> Unit,
    onResizeEnd: () -> Unit,
    onResizeCancel: () -> Unit,
    content: @Composable ColumnScope.() -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Box(
        modifier = Modifier
            .width(widthDp.dp)
            .heightIn(min = minHeightDp.dp)
    ) {
        Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = minHeightDp.dp)
                    .padding(end = if (resizable) 14.dp else 0.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            content = content
        )
        if (resizable) {
            Box(
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .fillMaxHeight()
                    .width(28.dp)
                    .pointerInput(widthDp) {
                        detectDragGestures(
                            onDragStart = { onResizeStart() },
                            onDrag = { change, dragAmount ->
                                change.consume()
                                onResizeBy(dragAmount.x)
                            },
                            onDragEnd = { onResizeEnd() },
                            onDragCancel = { onResizeCancel() }
                        )
                    },
                contentAlignment = Alignment.CenterEnd
            ) {
                Surface(
                    modifier = Modifier
                        .width(if (isResizing) 4.dp else 2.dp)
                        .fillMaxHeight(),
                    shape = RoundedCornerShape(999.dp),
                    color = if (isResizing) StudioBlue.copy(alpha = 0.65f) else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)
                ) {}
            }
        }
    }
}

@Composable
private fun BoardQuickActionsStrip(
    visibleCardCount: Int,
    hiddenCardCount: Int,
    columnCount: Int,
    cardsUnlocked: Boolean,
    canManageCardLayout: Boolean,
    isOrderIndependentLayout: Boolean,
    onCustomizeCards: () -> Unit,
    onShowAllCards: () -> Unit,
    onAutoSizeCards: () -> Unit,
    onResetColumns: () -> Unit,
    onResetBoard: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        BoardInfoPill("$visibleCardCount visible", StudioGreen)
        BoardInfoPill("$hiddenCardCount hidden", if (hiddenCardCount > 0) StudioWarningOrange else MaterialTheme.colorScheme.onSurfaceVariant)
        BoardInfoPill("$columnCount columns", StudioBlue)
        BoardInfoPill(if (isOrderIndependentLayout) "Order Layout" else "Shared Layout", if (isOrderIndependentLayout) StudioWarningOrange else StudioBlue)
        if (canManageCardLayout && cardsUnlocked) {
            BoardActionChip("Customize cards", onCustomizeCards)
            if (hiddenCardCount > 0) {
                BoardActionChip("Show hidden", onShowAllCards)
            }
            BoardActionChip("Auto-size", onAutoSizeCards)
            BoardActionChip("Reset columns", onResetColumns)
            BoardActionChip("Reset board", onResetBoard)
        } else {
            BoardInfoPill(if (canManageCardLayout) t("Cards locked") else "Layout read-only", MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun BoardInfoPill(label: String, color: Color) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = color.copy(alpha = 0.10f),
        border = BorderStroke(1.dp, color.copy(alpha = 0.18f))
    ) {
        Text(
            label,
            modifier = Modifier.padding(horizontal = 11.dp, vertical = 7.dp),
            color = color,
            fontSize = 12.sp,
            fontWeight = FontWeight.ExtraBold,
            maxLines = 1
        )
    }
}

@Composable
private fun BoardActionChip(label: String, onClick: () -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = StudioBlue.copy(alpha = 0.10f),
        border = BorderStroke(1.dp, StudioBlue.copy(alpha = 0.20f)),
        onClick = onClick
    ) {
        Text(
            label,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
            color = StudioBlue,
            fontSize = 12.sp,
            fontWeight = FontWeight.ExtraBold,
            maxLines = 1
        )
    }
}

@Composable
private fun HiddenCardsBar(
    hiddenCards: List<OrderDetailCardId>,
    onShowCard: (OrderDetailCardId) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            "Hidden cards",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 12.sp,
            fontWeight = FontWeight.ExtraBold
        )
        hiddenCards.forEach { cardId ->
            Surface(
                shape = RoundedCornerShape(999.dp),
                color = StudioBlue.copy(alpha = 0.10f),
                border = BorderStroke(1.dp, StudioBlue.copy(alpha = 0.18f)),
                onClick = { onShowCard(cardId) }
            ) {
                Text(
                    "Show ${cardId.title}",
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                    color = StudioBlue,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun OrderLayoutCardFrame(
    cardId: OrderDetailCardId,
    cardsUnlocked: Boolean,
    isDragging: Boolean = false,
    customizationActions: OrderCardCustomizationActions? = null,
    onDragEnd: () -> Unit = {},
    onDropCard: (OrderDetailCardId, Boolean) -> Unit,
    content: @Composable () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var isDropTarget by remember(cardId) { mutableStateOf(false) }
    var dropAfter by remember(cardId) { mutableStateOf(true) }
    var cardHeightPx by remember(cardId) { mutableStateOf(0) }
    fun updateDropPlacement(event: DragAndDropEvent): Boolean {
        val nextDropAfter = cardHeightPx <= 0 || event.toAndroidDragEvent().y > cardHeightPx / 2f
        dropAfter = nextDropAfter
        return nextDropAfter
    }
    val dropTarget = remember(cardId, cardsUnlocked, cardHeightPx) {
        object : DragAndDropTarget {
            override fun onEntered(event: DragAndDropEvent) {
                if (cardsUnlocked && draggedCardFromEvent(event) != cardId) {
                    isDropTarget = true
                    updateDropPlacement(event)
                }
            }

            override fun onMoved(event: DragAndDropEvent) {
                if (isDropTarget) updateDropPlacement(event)
            }

            override fun onExited(event: DragAndDropEvent) {
                isDropTarget = false
                dropAfter = true
            }

            override fun onEnded(event: DragAndDropEvent) {
                isDropTarget = false
                dropAfter = true
                onDragEnd()
            }

            override fun onDrop(event: DragAndDropEvent): Boolean {
                val dragged = draggedCardFromEvent(event) ?: return false
                val insertAfter = updateDropPlacement(event)
                isDropTarget = false
                dropAfter = true
                if (!cardsUnlocked || dragged == cardId) {
                    onDragEnd()
                    return false
                }
                onDropCard(dragged, insertAfter)
                onDragEnd()
                return true
            }
        }
    }
    val dropModifier = if (cardsUnlocked) {
        Modifier.dragAndDropTarget(
            shouldStartDragAndDrop = { event -> acceptsCardDrag(event) },
            target = dropTarget
        )
    } else {
        Modifier
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .graphicsLayer {
                alpha = if (isDragging) 0.58f else 1f
                scaleX = if (isDragging) 0.985f else 1f
                scaleY = if (isDragging) 0.985f else 1f
            }
            .onSizeChanged { size -> cardHeightPx = size.height }
            .clip(RoundedCornerShape(16.dp))
            .border(
                BorderStroke(
                    width = if (isDropTarget) 2.dp else 0.dp,
                    color = if (isDropTarget) StudioBlue else Color.Transparent
                ),
                RoundedCornerShape(16.dp)
            )
            .padding(if (isDropTarget) 2.dp else 0.dp)
            .then(dropModifier)
    ) {
        CompositionLocalProvider(
            LocalDetailCardsUnlocked provides cardsUnlocked,
            LocalOrderCardActions provides customizationActions
        ) {
            content()
        }
        if (isDropTarget) {
            Surface(
                modifier = Modifier
                    .align(if (dropAfter) Alignment.BottomCenter else Alignment.TopCenter)
                    .fillMaxWidth()
                    .height(5.dp),
                shape = RoundedCornerShape(999.dp),
                color = StudioBlue.copy(alpha = 0.78f)
            ) {}
        }
    }
}

@Composable
private fun BoardEdgeScrollDropZone(
    modifier: Modifier,
    enabled: Boolean,
    onDragEnd: () -> Unit = {},
    onScrollStep: () -> Unit,
    onDropCard: ((OrderDetailCardId) -> Unit)? = null
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var isActive by remember { mutableStateOf(false) }
    val latestOnScrollStep by rememberUpdatedState(onScrollStep)
    val latestOnDropCard by rememberUpdatedState(onDropCard)

    LaunchedEffect(isActive, enabled) {
        while (isActive && enabled) {
            latestOnScrollStep()
            delay(16)
        }
    }

    val target = remember(enabled) {
        object : DragAndDropTarget {
            override fun onEntered(event: DragAndDropEvent) {
                if (!enabled) return
                isActive = true
                latestOnScrollStep()
            }

            override fun onMoved(event: DragAndDropEvent) {
                if (enabled) latestOnScrollStep()
            }

            override fun onExited(event: DragAndDropEvent) {
                isActive = false
            }

            override fun onEnded(event: DragAndDropEvent) {
                isActive = false
                onDragEnd()
            }

            override fun onDrop(event: DragAndDropEvent): Boolean {
                val dragged = draggedCardFromEvent(event)
                isActive = false
                if (!enabled || dragged == null) return false
                latestOnDropCard?.invoke(dragged) ?: return false
                onDragEnd()
                return true
            }
        }
    }
    Box(
        modifier = modifier
            .dragAndDropTarget(
                shouldStartDragAndDrop = { event -> enabled && acceptsCardDrag(event) },
                target = target
            )
            .background(
                if (isActive) StudioBlue.copy(alpha = 0.06f) else Color.Transparent
            )
    )
}

@Composable
private fun ColumnDropZone(
    enabled: Boolean,
    hasCards: Boolean,
    heightDp: Int,
    onDragEnd: () -> Unit = {},
    onDropCard: (OrderDetailCardId) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var isDropTarget by remember { mutableStateOf(false) }
    val target = remember(enabled) {
        object : DragAndDropTarget {
            override fun onEntered(event: DragAndDropEvent) {
                if (enabled) isDropTarget = true
            }

            override fun onExited(event: DragAndDropEvent) {
                isDropTarget = false
            }

            override fun onEnded(event: DragAndDropEvent) {
                isDropTarget = false
                onDragEnd()
            }

            override fun onDrop(event: DragAndDropEvent): Boolean {
                val dragged = draggedCardFromEvent(event) ?: return false
                isDropTarget = false
                if (!enabled) {
                    onDragEnd()
                    return false
                }
                onDropCard(dragged)
                onDragEnd()
                return true
            }
        }
    }
    if (!enabled && hasCards) return
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .height(heightDp.coerceAtLeast(if (hasCards) 34 else 78).dp)
            .dragAndDropTarget(
                shouldStartDragAndDrop = { event -> enabled && acceptsCardDrag(event) },
                target = target
            ),
        shape = RoundedCornerShape(14.dp),
        color = when {
            isDropTarget -> StudioBlue.copy(alpha = 0.10f)
            hasCards -> Color.Transparent
            else -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
        },
        border = BorderStroke(
            1.dp,
            when {
                isDropTarget -> StudioBlue.copy(alpha = 0.65f)
                hasCards -> Color.Transparent
                else -> MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)
            }
        )
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                if (isDropTarget) t("Drop card here") else if (hasCards) "" else "Empty column",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@Composable
private fun CardInsertionDropZone(
    enabled: Boolean,
    onDragEnd: () -> Unit = {},
    onDropCard: (OrderDetailCardId) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    if (!enabled) return
    var isDropTarget by remember { mutableStateOf(false) }
    val target = remember(enabled) {
        object : DragAndDropTarget {
            override fun onEntered(event: DragAndDropEvent) {
                if (enabled) isDropTarget = true
            }

            override fun onExited(event: DragAndDropEvent) {
                isDropTarget = false
            }

            override fun onEnded(event: DragAndDropEvent) {
                isDropTarget = false
                onDragEnd()
            }

            override fun onDrop(event: DragAndDropEvent): Boolean {
                val dragged = draggedCardFromEvent(event) ?: return false
                isDropTarget = false
                if (!enabled) {
                    onDragEnd()
                    return false
                }
                onDropCard(dragged)
                onDragEnd()
                return true
            }
        }
    }
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .height(if (isDropTarget) 30.dp else 6.dp)
            .dragAndDropTarget(
                shouldStartDragAndDrop = { event -> enabled && acceptsCardDrag(event) },
                target = target
            ),
        shape = RoundedCornerShape(999.dp),
        color = if (isDropTarget) StudioBlue.copy(alpha = 0.12f) else Color.Transparent,
        border = BorderStroke(
            width = if (isDropTarget) 1.dp else 0.dp,
            color = if (isDropTarget) StudioBlue.copy(alpha = 0.65f) else Color.Transparent
        )
    ) {
        if (isDropTarget) {
            Box(contentAlignment = Alignment.Center) {
                Text(
                    "Drop card above",
                    color = StudioBlue,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.ExtraBold
                )
            }
        }
    }
}

@Composable
private fun OrderDetailCardContent(
    cardId: OrderDetailCardId,
    order: StudioOrder,
    workspaceSettings: StudioWorkspaceSettings,
    statusOptions: List<String>,
    teamMembers: List<StudioTeamMember>,
    canEditWorkflow: Boolean,
    canEditFinance: Boolean,
    canSeeFinancial: Boolean,
    canAssignTasks: Boolean,
    financeAdvancedEnabled: Boolean,
    canManageClientFiles: Boolean,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onUploadClientFile: (StudioOrder, ByteArray, String, String) -> Unit,
    onUploadPreviewImage: (StudioOrder, ByteArray, String, String) -> Unit,
    onRefreshLiveTracking: (StudioOrder) -> Unit,
    onRenameClientFile: (StudioOrder, String, String) -> Unit,
    onDeleteClientFile: (StudioOrder, String) -> Unit,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit = { _, _ -> }
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    when (cardId) {
        OrderDetailCardId.CustomerPortal -> CustomerPortalCard(
            order = order,
            canEdit = canEditWorkflow
        )
        OrderDetailCardId.RepairIntake -> RepairIntakeCard(
            order = order,
            workspaceSettings = workspaceSettings,
            canEditWorkflow = canEditWorkflow,
            canManageClientFiles = canManageClientFiles,
            onUpdateOrderFields = onUpdateOrderFields,
            onUpdateWorkspaceSettings = onUpdateWorkspaceSettings,
            onUploadClientFile = onUploadClientFile
        )
        OrderDetailCardId.Estimate -> EstimateCard(
            order = order,
            workspaceSettings = workspaceSettings,
            canSeeFinancial = canSeeFinancial,
            canEdit = canEditWorkflow
        )
        OrderDetailCardId.Preview -> DesktopPreviewCard(
            order = order,
            canEditPreview = canEditWorkflow,
            onUpdateOrderFields = onUpdateOrderFields,
            onUploadPreviewImage = onUploadPreviewImage
        )
        OrderDetailCardId.Summary -> SummaryCard(
            order = order,
            workspaceSettings = workspaceSettings,
            canSeeFinancial = canSeeFinancial,
            canEditWorkflow = canEditWorkflow,
            onUpdateOrderFields = onUpdateOrderFields
        )
        OrderDetailCardId.Customer -> {
            if (canEditWorkflow) {
                CustomerContactEditCard(
                    order = order,
                    workspaceSettings = workspaceSettings,
                    onUpdateOrderFields = onUpdateOrderFields,
                    onUpdateWorkspaceSettings = onUpdateWorkspaceSettings
                )
            } else {
                CustomerCard(order = order, workspaceSettings = workspaceSettings)
            }
        }
        OrderDetailCardId.InvoiceItems -> InvoiceItemsCard(
            order = order,
            workspaceSettings = workspaceSettings,
            canEdit = canEditWorkflow,
            onUpdateWorkspaceSettings = onUpdateWorkspaceSettings,
            onUpdateOrderFields = onUpdateOrderFields
        )
        OrderDetailCardId.Materials -> MaterialsInventoryCard(
            order = order,
            workspaceSettings = workspaceSettings,
            canEditWorkflow = canEditWorkflow,
            onUpdateOrderFields = onUpdateOrderFields,
            onUpdateWorkspaceSettings = onUpdateWorkspaceSettings
        )
        OrderDetailCardId.Priority -> PriorityRiskCard(
            order = order,
            workspaceSettings = workspaceSettings,
            canEditWorkflow = canEditWorkflow,
            onUpdateOrderFields = onUpdateOrderFields,
            onUpdateWorkspaceSettings = onUpdateWorkspaceSettings
        )
        OrderDetailCardId.Delivery -> TimelineDeliveryCard(
            order = order,
            canEditWorkflow = canEditWorkflow,
            onUpdateOrderFields = onUpdateOrderFields
        )
        OrderDetailCardId.Notes -> DesktopNotesCard(
            order = order,
            workspaceSettings = workspaceSettings,
            canEditWorkflow = canEditWorkflow,
            onUpdateOrderFields = onUpdateOrderFields
        )
        OrderDetailCardId.ClientFiles -> DesktopClientFilesCard(
            order = order,
            clientFilesEnabled = canManageClientFiles,
            onUpdateOrderFields = onUpdateOrderFields,
            onUploadClientFile = onUploadClientFile,
            onRenameClientFile = onRenameClientFile,
            onDeleteClientFile = onDeleteClientFile
        )
        OrderDetailCardId.Todo -> DesktopTodoCard(
            order = order,
            teamMembers = teamMembers,
            canAssignTasks = canAssignTasks,
            onUpdateOrderFields = onUpdateOrderFields
        )
        OrderDetailCardId.WorkTime -> DesktopWorkTimeCard(order = order, onUpdateOrderFields = onUpdateOrderFields)
        OrderDetailCardId.Financial -> FinancialCard(
            order = order,
            workspaceSettings = workspaceSettings,
            canEditFinance = canEditFinance,
            advancedEnabled = financeAdvancedEnabled,
            onUpdateOrderFields = onUpdateOrderFields,
            onUpdateWorkspaceSettings = onUpdateWorkspaceSettings
        )
        OrderDetailCardId.Status -> {
            if (canEditWorkflow) {
                WorkflowEditCard(
                    order = order,
                    workspaceSettings = workspaceSettings,
                    statusOptions = statusOptions,
                    onUpdateOrderFields = onUpdateOrderFields,
                    onUpdateWorkspaceSettings = onUpdateWorkspaceSettings
                )
            } else {
                ProductionStatusCard(order = order, workspaceSettings = workspaceSettings)
            }
        }
        OrderDetailCardId.Shipping -> ShippingCard(
            order = order,
            canEditWorkflow = canEditWorkflow,
            onUpdateOrderFields = onUpdateOrderFields,
            onRefreshLiveTracking = onRefreshLiveTracking
        )
        OrderDetailCardId.Schedule -> DesktopScheduleAlertsCard(
            order = order,
            workspaceSettings = workspaceSettings,
            onUpdateOrderFields = onUpdateOrderFields
        )
        OrderDetailCardId.HistoryLog -> DesktopHistoryLogCard(order = order, workspaceSettings = workspaceSettings)
    }
}

@Composable
private fun DesktopPreviewCard(
    order: StudioOrder,
    canEditPreview: Boolean,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onUploadPreviewImage: (StudioOrder, ByteArray, String, String) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val previewUrl = order.designLink.trim()
    val latestImageFile = order.clientFiles.firstOrNull {
        isClientFileImage(it.contentType, it.fileName) && it.downloadUrl.isNotBlank()
    }
    val displayPreviewUrl = previewUrl.ifBlank { latestImageFile?.downloadUrl.orEmpty() }
    val usingLatestClientImage = previewUrl.isBlank() && displayPreviewUrl.isNotBlank()
    var previewBitmap by remember(displayPreviewUrl) { mutableStateOf<android.graphics.Bitmap?>(null) }
    var imageFailed by remember(displayPreviewUrl) { mutableStateOf(false) }
    var linkEditing by remember(order.id) { mutableStateOf(false) }
    var linkDraft by remember(order.id, previewUrl) { mutableStateOf(previewUrl) }
    var actionMenuOpen by remember(order.id) { mutableStateOf(false) }
    val previewImagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri != null) {
            val fileName = displayNameForUri(context, uri)
            val contentType = context.contentResolver.getType(uri).orEmpty()
            val bytes = readBytesForUri(context, uri)
            if (bytes != null) onUploadPreviewImage(order, bytes, fileName, contentType)
        }
    }

    LaunchedEffect(previewUrl, linkEditing) {
        if (!linkEditing) linkDraft = previewUrl
    }

    LaunchedEffect(displayPreviewUrl) {
        previewBitmap = null
        imageFailed = false
        if (displayPreviewUrl.startsWith("http://") || displayPreviewUrl.startsWith("https://")) {
            previewBitmap = withContext(Dispatchers.IO) {
                runCatching {
                    URL(displayPreviewUrl).openStream().use { stream -> BitmapFactory.decodeStream(stream) }
                }.getOrNull()
            }
            imageFailed = previewBitmap == null
        }
    }

    DetailCard(title = t("Preview")) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(310.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.78f)),
            contentAlignment = Alignment.Center
        ) {
            val bitmap = previewBitmap
            if (bitmap != null) {
                Image(
                    bitmap = bitmap.asImageBitmap(),
                    contentDescription = "Order preview",
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )
                if (usingLatestClientImage) {
                    Surface(
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .padding(10.dp),
                        shape = RoundedCornerShape(999.dp),
                        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                    ) {
                        Text(
                            "Latest client image",
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.ExtraBold
                        )
                    }
                }
            } else {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(
                        imageVector = Icons.Filled.PhotoLibrary,
                        contentDescription = null,
                        modifier = Modifier.size(42.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.82f)
                    )
                    Text(
                        text = when {
                            displayPreviewUrl.isBlank() -> t("No preview image provided.")
                            imageFailed -> "Preview link is not an image."
                            else -> "Loading preview..."
                        },
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.ExtraBold,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                }
            }
            Box(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(14.dp)
            ) {
                Surface(
                    modifier = Modifier.size(48.dp),
                    shape = RoundedCornerShape(999.dp),
                    color = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
                    tonalElevation = 3.dp,
                    onClick = { actionMenuOpen = true }
                ) {
                    Icon(
                        imageVector = Icons.Filled.MoreHoriz,
                        contentDescription = "Preview image actions",
                        modifier = Modifier.padding(11.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                DropdownMenu(expanded = actionMenuOpen, onDismissRequest = { actionMenuOpen = false }) {
                    DropdownMenuItem(
                        text = { Text(if (previewUrl.isBlank()) t("Upload Image") else "Replace Image") },
                        leadingIcon = { Icon(Icons.Filled.PhotoLibrary, contentDescription = null) },
                        enabled = canEditPreview,
                        onClick = {
                            actionMenuOpen = false
                            uk.co.eggcraft.studioflow.features.shell.AppLockGuard.suppressNextLockOnce(); previewImagePicker.launch("image/*")
                        }
                    )
                    DropdownMenuItem(
                        text = { Text(if (previewUrl.isBlank()) "Paste Link" else "Edit Link") },
                        leadingIcon = { Icon(Icons.Filled.Description, contentDescription = null) },
                        enabled = canEditPreview,
                        onClick = {
                            actionMenuOpen = false
                            linkDraft = previewUrl
                            linkEditing = true
                        }
                    )
                    DropdownMenuItem(
                        text = { Text(t("Use Latest Client Image")) },
                        leadingIcon = { Icon(Icons.Filled.TableChart, contentDescription = null) },
                        enabled = canEditPreview && latestImageFile != null && latestImageFile.downloadUrl != previewUrl,
                        onClick = {
                            actionMenuOpen = false
                            if (latestImageFile != null) {
                                onUpdateOrderFields(order, mapOf("details" to mapOf("designLink" to latestImageFile.downloadUrl)))
                            }
                        }
                    )
                    DropdownMenuItem(
                        text = { Text(t("Open Image")) },
                        enabled = displayPreviewUrl.isNotBlank(),
                        onClick = {
                            actionMenuOpen = false
                            if (displayPreviewUrl.isNotBlank()) uriHandler.openUri(displayPreviewUrl)
                        }
                    )
                    DropdownMenuItem(
                        text = { Text(t("Remove Image"), color = StudioRed) },
                        leadingIcon = { Icon(Icons.Filled.Delete, contentDescription = null, tint = StudioRed) },
                        enabled = canEditPreview && previewUrl.isNotBlank(),
                        onClick = {
                            actionMenuOpen = false
                            onUpdateOrderFields(order, mapOf("details" to mapOf("designLink" to "")))
                        }
                    )
                }
            }
        }
        if (linkEditing) {
            OutlinedTextField(
                value = linkDraft,
                onValueChange = { linkDraft = it },
                label = { Text(t("Paste photo link...")) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                Button(
                    onClick = {
                        onUpdateOrderFields(order, mapOf("details" to mapOf("designLink" to linkDraft.trim())))
                        linkEditing = false
                    },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text(t("Save Link"), fontWeight = FontWeight.ExtraBold)
                }
                TextButton(
                    onClick = {
                        linkDraft = previewUrl
                        linkEditing = false
                    },
                    modifier = Modifier.weight(1f)
                ) {
                    Text(t("Cancel"), fontWeight = FontWeight.ExtraBold)
                }
            }
        }
    }
}

// What the customer was quoted, and the evidence of what they agreed to. Read
// only: estimates are created and decided on the server, and a revision never
// edits its predecessor.
//
// Survives card disposal so scrolling the card out of view and back does not
// re-run a billed callable. Process-lifetime only; it holds nothing the user
// could not already see on the card.
private val estimateRecordCache = java.util.concurrent.ConcurrentHashMap<String, StudioEstimateRecord>()

private fun cacheEstimateRecord(key: String, record: StudioEstimateRecord) {
    if (estimateRecordCache.size > 32) estimateRecordCache.clear()
    estimateRecordCache[key] = record
}

@Composable
private fun EstimateCard(
    order: StudioOrder,
    workspaceSettings: StudioWorkspaceSettings,
    canSeeFinancial: Boolean,
    canEdit: Boolean
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val current = order.estimates.firstOrNull { it.status != "superseded" } ?: order.estimates.firstOrNull()
    val context = androidx.compose.ui.platform.LocalContext.current
    val scope = rememberCoroutineScope()
    val exportEstimate = rememberEstimateExporter(workspaceSettings)

    // Keyed so it refires after Send or Revoke changes the status, and not on
    // every recomposition. The phone layout hosts this card in a LazyColumn,
    // which disposes it on scroll — hence the cache, or the card re-fetched and
    // visibly re-flowed every time it came back into view.
    val recordCacheKey = listOf(
        order.id,
        current?.id.orEmpty(),
        current?.status.orEmpty(),
        current?.linkState.orEmpty()
    ).joinToString("|")
    var record by remember(recordCacheKey) { mutableStateOf(estimateRecordCache[recordCacheKey]) }
    var busy by remember(order.id) { mutableStateOf(false) }
    var notice by remember(order.id) { mutableStateOf("") }
    LaunchedEffect(recordCacheKey) {
        if (record != null) return@LaunchedEffect
        val estimateId = current?.id
        if (estimateId.isNullOrBlank()) {
            record = null
            return@LaunchedEffect
        }
        val loaded = runCatching { loadEstimateRecord(order.companyId, order.id, estimateId) }.getOrNull()
        if (loaded != null) {
            cacheEstimateRecord(recordCacheKey, loaded)
        } else {
            notice = t("The estimate details could not be loaded.")
        }
        record = loaded
    }

    DetailCard(title = t("Estimate & Approval")) {
        if (!canSeeFinancial) {
            Text(
                text = t("Hidden on this workspace role."),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            return@DetailCard
        }
        if (current == null) {
            Text(
                text = t("No estimate yet."),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (canEdit) {
                TextButton(
                    enabled = !busy,
                    onClick = {
                        if (order.lineItems.isEmpty()) {
                            notice = t("Add invoice items first — the estimate is built from them.")
                            return@TextButton
                        }
                        busy = true; notice = ""
                        scope.launch {
                            val ok = runCatching { createEstimateForOrder(order, null) }.isSuccess
                            busy = false
                            notice = if (ok) t("New estimate created from the invoice items.") else t("The estimate could not be created.")
                        }
                    }
                ) { Text(t("Create estimate")) }
            }
            if (notice.isNotBlank()) {
                Text(
                    text = notice,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            return@DetailCard
        }

        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = current.number.ifBlank { "#${current.version}" },
                style = MaterialTheme.typography.titleSmall
            )
            Spacer(modifier = Modifier.weight(1f))
            val tone = when (current.status) {
                "approved" -> Color(0xFF14804A)
                "declined" -> Color(0xFFB42318)
                "superseded" -> MaterialTheme.colorScheme.onSurfaceVariant
                else -> StudioBlue
            }
            Surface(shape = RoundedCornerShape(8.dp), color = tone.copy(alpha = 0.14f)) {
                Text(
                    text = t(estimateStatusTitle(current.status)),
                    color = tone,
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                )
            }
        }

        Spacer(modifier = Modifier.height(10.dp))
        // Line items come from the record, never from the order document.
        record?.lineItems?.forEach { line ->
            EstimateAmountRow(line.name.ifBlank { "-" }, line.lineTotal, workspaceSettings)
        }
        if (!record?.lineItems.isNullOrEmpty()) Spacer(modifier = Modifier.height(4.dp))
        EstimateAmountRow(t("Subtotal"), current.subtotal, workspaceSettings)
        if (current.taxType != "Profit" && current.taxRate > 0.0001) {
            EstimateAmountRow("${t("VAT")} (${current.taxRate.toInt()}%)", current.taxAmount, workspaceSettings)
        }
        EstimateAmountRow(t("Total"), current.total, workspaceSettings, bold = true)

        if (current.decidedAtMs > 0L) {
            Spacer(modifier = Modifier.height(10.dp))
            val stamp = java.text.SimpleDateFormat("dd/MM/yy HH:mm", java.util.Locale.getDefault())
                .format(java.util.Date(current.decidedAtMs))
            EstimateDetailRow(
                t(if (current.status == "declined") "Declined by" else "Approved by"),
                current.decidedBy.ifBlank { "—" }
            )
            EstimateDetailRow(t(if (current.status == "declined") "Declined at" else "Approved at"), stamp)
            EstimateDetailRow(t("Approval Method"), t("Customer Portal"))
            val signatureUrl = record?.approval?.signatureDownloadUrl.orEmpty()
            if (signatureUrl.isNotBlank()) {
                Text(
                    text = t("Customer Signature"),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                AsyncImage(
                    model = signatureUrl,
                    contentDescription = t("Customer Signature"),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(64.dp)
                        .background(Color.White, RoundedCornerShape(8.dp))
                        .padding(4.dp),
                    contentScale = ContentScale.Fit
                )
            } else if (current.hasSignature) {
                EstimateDetailRow(t("Customer Signature"), t("Signed"))
            }
        }

        if (notice.isNotBlank()) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = notice,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        Spacer(modifier = Modifier.height(10.dp))
        // Printing is reading: anyone who can see the card can take a copy.
        TextButton(onClick = { exportEstimate(order, record) }, enabled = record != null) {
            Text(t("View Estimate PDF"))
        }

        if (canEdit) {
            if (current.decidedAtMs == 0L && current.status != "superseded") {
                TextButton(
                    enabled = !busy,
                    onClick = {
                        busy = true; notice = ""
                        scope.launch {
                            val url = runCatching { sendEstimateForOrder(order, current.id) }.getOrNull().orEmpty()
                            busy = false
                            if (url.isNotBlank()) {
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                                clipboard.setPrimaryClip(android.content.ClipData.newPlainText("NivaDesk", url))
                                notice = t("Link copied. Send it to your customer.")
                            } else {
                                notice = t("The link could not be created.")
                            }
                        }
                    }
                ) { Text(t(if (current.linkState == "active") "Copy link again" else "Send to customer")) }
            }
            if (current.linkState == "active" && current.decidedAtMs == 0L) {
                TextButton(
                    enabled = !busy,
                    onClick = {
                        busy = true
                        scope.launch {
                            runCatching { revokeEstimateLinkForOrder(order, current.id) }
                            busy = false
                            notice = t("Link revoked.")
                        }
                    }
                ) { Text(t("Revoke link")) }
            }
            TextButton(
                enabled = !busy,
                onClick = {
                    if (order.lineItems.isEmpty()) {
                        notice = t("Add invoice items first — the estimate is built from them.")
                        return@TextButton
                    }
                    busy = true; notice = ""
                    scope.launch {
                        val ok = runCatching {
                            createEstimateForOrder(order, current.id.takeIf { current.status != "superseded" })
                        }.isSuccess
                        busy = false
                        notice = if (ok) t("New estimate created from the invoice items.") else t("The estimate could not be created.")
                    }
                }
            ) { Text(t("Create new estimate")) }
        }

        val history = order.estimates.filter { it.id != current.id }
        if (history.isNotEmpty()) {
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = t("Estimate History"),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            history.forEach { row ->
                EstimateDetailRow(
                    row.number.ifBlank { "#${row.version}" },
                    t(estimateStatusTitle(row.status))
                )
            }
        }
    }
}

private fun estimateStatusTitle(status: String): String = when (status) {
    "sent" -> "Sent"
    "viewed" -> "Viewed"
    "approved" -> "Approved"
    "declined" -> "Declined"
    "superseded" -> "Superseded"
    else -> "Draft"
}

@Composable
private fun EstimateAmountRow(label: String, value: Double, settings: StudioWorkspaceSettings, bold: Boolean = false) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = pdfMoney(value, settings),
            style = if (bold) MaterialTheme.typography.titleSmall else MaterialTheme.typography.bodyMedium
        )
    }
    Spacer(modifier = Modifier.height(5.dp))
}

@Composable
private fun EstimateDetailRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.weight(1f))
        Text(text = value, style = MaterialTheme.typography.bodyMedium)
    }
    Spacer(modifier = Modifier.height(5.dp))
}

// The customer's own item, taken in for repair. Never stock: the server stamps
// customerOwned so nothing downstream can mistake it for inventory.
@Composable
private fun CustomerPortalCard(
    order: StudioOrder,
    canEdit: Boolean
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val scope = rememberCoroutineScope()
    val functions = com.google.firebase.functions.FirebaseFunctions.getInstance("europe-west2")

    val portal = order.customerPortal
    var busy by remember(order.id) { mutableStateOf(false) }
    var notice by remember(order.id) { mutableStateOf("") }
    // Optimistic so a tap responds at once; the order listener confirms it.
    var shows by remember(order.id, portal.visibility) { mutableStateOf(portal.visibility) }
    var auto by remember(order.id, portal.autoUpdates) { mutableStateOf(portal.autoUpdates) }
    val portalUrl = if (portal.token.isBlank()) "" else "https://nivadesk.app/track/${portal.token}"

    fun savePreferences(nextShows: StudioPortalVisibility, nextAuto: StudioPortalAutoUpdates) {
        shows = nextShows
        auto = nextAuto
        scope.launch {
            runCatching {
                functions.getHttpsCallable("saveOrderPortalSettings").call(
                    mapOf(
                        "companyId" to order.companyId,
                        "orderId" to order.id,
                        "visibility" to mapOf(
                            "status" to nextShows.status,
                            "estimate" to nextShows.estimate,
                            "payments" to nextShows.payments,
                            "photos" to nextShows.photos,
                            "expectedDate" to nextShows.expectedDate
                        ),
                        "autoUpdates" to mapOf(
                            "enabled" to nextAuto.enabled,
                            "email" to nextAuto.email,
                            "sms" to nextAuto.sms
                        )
                    )
                ).await()
            }.onFailure { notice = t("The portal settings could not be saved.") }
        }
    }

    DetailCard(title = t("Customer Portal")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = t("Portal Access"),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.ExtraBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.weight(1f))
            Text(
                text = if (portal.active) t("Active") else t("Off"),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.ExtraBold,
                color = if (portal.active) StudioGreen else MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        if (portal.active && portalUrl.isNotBlank()) {
            Text(
                text = portalUrl,
                style = MaterialTheme.typography.bodySmall,
                color = StudioBlue,
                maxLines = 1
            )
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(onClick = {
                    val clipboard = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE)
                        as android.content.ClipboardManager
                    clipboard.setPrimaryClip(android.content.ClipData.newPlainText("portal", portalUrl))
                    notice = t("Link copied. Send it to your customer.")
                }) { Text(t("Copy Link")) }
                TextButton(onClick = {
                    uk.co.eggcraft.studioflow.features.shell.AppLockGuard.suppressNextLockOnce()
                    uriHandler.openUri(portalUrl)
                }) { Text(t("Open Portal")) }
            }
        } else {
            Text(
                text = t("No portal link yet. Create one and send it to your customer — they can open it without signing in."),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        if (canEdit) {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(
                    enabled = !busy,
                    onClick = {
                        busy = true; notice = ""
                        scope.launch {
                            val ok = runCatching {
                                functions.getHttpsCallable("createOrderPortalLink")
                                    .call(mapOf("companyId" to order.companyId, "orderId" to order.id)).await()
                            }.isSuccess
                            busy = false
                            notice = if (ok) t("Portal link created.") else t("The portal link could not be created.")
                        }
                    }
                ) { Text(if (portal.active) t("Create a fresh link") else t("Create portal link")) }
                if (portal.active) {
                    TextButton(
                        enabled = !busy,
                        onClick = {
                            busy = true; notice = ""
                            scope.launch {
                                val ok = runCatching {
                                    functions.getHttpsCallable("revokeOrderPortalLink")
                                        .call(mapOf("companyId" to order.companyId, "orderId" to order.id)).await()
                                }.isSuccess
                                busy = false
                                notice = if (ok) t("Portal turned off. The customer's link no longer opens.")
                                    else t("The portal link could not be turned off.")
                            }
                        }
                    ) { Text(t("Turn off")) }
                }
            }
        }

        if (notice.isNotBlank()) {
            Text(
                text = notice,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        HorizontalDivider()

        Text(
            text = t("Customer Sees"),
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.ExtraBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        PortalSeesRow(t("Repair status"), shows.status, canEdit) { savePreferences(shows.copy(status = !shows.status), auto) }
        PortalSeesRow(t("Estimate & approval"), shows.estimate, canEdit) { savePreferences(shows.copy(estimate = !shows.estimate), auto) }
        PortalSeesRow(t("Payment & invoices"), shows.payments, canEdit) { savePreferences(shows.copy(payments = !shows.payments), auto) }
        PortalSeesRow(t("Photos & updates"), shows.photos, canEdit) { savePreferences(shows.copy(photos = !shows.photos), auto) }
        PortalSeesRow(t("Expected completion"), shows.expectedDate, canEdit) { savePreferences(shows.copy(expectedDate = !shows.expectedDate), auto) }
        Text(
            text = t("Internal notes, costs, supplier and profit are never shown, whatever is switched on here."),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        HorizontalDivider()

        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = t("Automatic Updates"),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.ExtraBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.weight(1f))
            Switch(
                checked = auto.enabled,
                enabled = canEdit,
                onCheckedChange = { savePreferences(shows, auto.copy(enabled = it)) }
            )
        }
        Text(
            text = t("Sent when the order's status moves — estimate ready, work started, ready for collection."),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(t("Email"), style = MaterialTheme.typography.bodySmall)
            TextButton(
                enabled = canEdit && auto.enabled,
                onClick = { savePreferences(shows, auto.copy(email = !auto.email)) }
            ) { Text(if (auto.email) t("ON") else t("OFF"), fontWeight = FontWeight.ExtraBold) }
            Text(t("SMS"), style = MaterialTheme.typography.bodySmall)
            Text(
                text = t("OFF"),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.ExtraBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Text(
            text = t("SMS is not connected yet — email only for now."),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun PortalSeesRow(title: String, isOn: Boolean, enabled: Boolean, onToggle: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled) { onToggle() }
            .padding(vertical = 3.dp)
    ) {
        Icon(
            imageVector = if (isOn) Icons.Filled.CheckCircle else Icons.Filled.Close,
            contentDescription = null,
            tint = if (isOn) StudioGreen else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(16.dp)
        )
        Text(
            text = title,
            style = MaterialTheme.typography.bodySmall,
            color = if (isOn) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun RepairIntakeCard(
    order: StudioOrder,
    workspaceSettings: StudioWorkspaceSettings,
    canEditWorkflow: Boolean,
    canManageClientFiles: Boolean = false,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit = { _, _ -> },
    onUploadClientFile: (StudioOrder, ByteArray, String, String) -> Unit = { _, _, _, _ -> }
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val intake = order.repairIntake
    val configuredRows = workspaceSettings.repairIntakeFields.filter { it.id.isNotBlank() && it.title.isNotBlank() }
    // Nothing configured yet means the workspace has never touched these rows, so
    // the trade it signed up as picks them — a phone shop should not start on
    // Hallmark and Stones.
    val rows = configuredRows.ifEmpty {
        uk.co.eggcraft.studioflow.data.model.StudioRepairIntakePresets
            .fieldsForBusinessType(workspaceSettings.businessType)
    }

    fun commit(
        fields: Map<String, String> = intake?.fields.orEmpty(),
        condition: List<String> = intake?.condition.orEmpty(),
        requestedWork: List<String> = intake?.requestedWork.orEmpty()
    ) {
        val isoFormat = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
        isoFormat.timeZone = java.util.TimeZone.getTimeZone("UTC")
        val receivedAt = java.util.Date(intake?.receivedAtMillis?.takeIf { it > 0L } ?: System.currentTimeMillis())
        onUpdateOrderFields(
            order,
            mapOf(
                "details" to mapOf(
                    "orderType" to "repair",
                    "repairIntake" to mapOf(
                        "fields" to fields,
                        "condition" to condition,
                        "requestedWork" to requestedWork,
                        "customerInstructions" to intake?.customerInstructions.orEmpty(),
                        "receivedAt" to isoFormat.format(receivedAt),
                        "receivedByUid" to intake?.receivedByUid.orEmpty(),
                        "receivedByName" to intake?.receivedByName.orEmpty()
                    )
                )
            )
        )
    }

    DetailCard(title = t("Repair Intake & Item")) {
        // Different trades take in different things. Rows can still be renamed
        // one by one in Settings; this swaps the whole set for a closer start.
        if (canEditWorkflow) {
            var templateMenuOpen by remember { mutableStateOf(false) }
            val presets = uk.co.eggcraft.studioflow.data.model.StudioRepairIntakePresets
            val suggestedId = presets.presetIdForBusinessType(workspaceSettings.businessType)
            val currentId = presets.matchingPresetId(rows)
            val currentLabel = presets.preset(currentId)?.label?.let(t) ?: t("Custom rows")
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = t("Intake template"),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.width(8.dp))
                Box {
                    TextButton(onClick = { templateMenuOpen = true }) { Text(currentLabel) }
                    DropdownMenu(expanded = templateMenuOpen, onDismissRequest = { templateMenuOpen = false }) {
                        presets.all.forEach { preset ->
                            DropdownMenuItem(
                                text = { Text(t(preset.label) + if (preset.id == suggestedId) " ★" else "") },
                                onClick = {
                                    templateMenuOpen = false
                                    // Ids carry the stored values, so switching
                                    // template keeps anything already recorded
                                    // under a row the new set also has.
                                    val json = org.json.JSONArray().apply {
                                        preset.fields.forEach { field ->
                                            put(org.json.JSONObject().put("id", field.id).put("title", field.title))
                                        }
                                    }.toString()
                                    onUpdateWorkspaceSettings(
                                        mapOf("repairIntakeFieldsJSON" to json),
                                        "Intake template saved."
                                    )
                                }
                            )
                        }
                    }
                }
            }
        }

        rows.forEach { row ->
            OrderTextRow(
                label = t(row.title),
                value = intake?.fields?.get(row.id).orEmpty(),
                enabled = canEditWorkflow,
                onValueChange = { next ->
                    val fields = intake?.fields.orEmpty().toMutableMap()
                    if (next.isBlank()) fields.remove(row.id) else fields[row.id] = next
                    commit(fields = fields)
                }
            )
        }

        Spacer(modifier = Modifier.height(6.dp))

        OrderLinesRow(
            label = t("Condition"),
            lines = intake?.condition.orEmpty(),
            enabled = canEditWorkflow,
            onLinesChange = { commit(condition = it) }
        )

        OrderLinesRow(
            label = t("Requested Work"),
            lines = intake?.requestedWork.orEmpty(),
            enabled = canEditWorkflow,
            onLinesChange = { commit(requestedWork = it) }
        )

        // Photos of what the customer actually handed over. They ride on this
        // order's client files, so every order has its own set and the client-file
        // permission governs them too. Four across at most, and small.
        RepairIntakePhotoStrip(
            order = order,
            canManageClientFiles = canManageClientFiles,
            onUploadClientFile = onUploadClientFile
        )

        Spacer(modifier = Modifier.height(6.dp))

        val received = intake?.receivedAtMillis?.takeIf { it > 0L }
        Text(
            text = t("Received") + ": " + (received?.let {
                java.text.SimpleDateFormat("d MMM yyyy · HH:mm", java.util.Locale.getDefault()).format(java.util.Date(it))
            } ?: "—"),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = t("Received By") + ": " + intake?.receivedByName.orEmpty().ifBlank { "—" },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun RepairIntakePhotoStrip(
    order: StudioOrder,
    canManageClientFiles: Boolean,
    onUploadClientFile: (StudioOrder, ByteArray, String, String) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val fileOpenScope = rememberCoroutineScope()
    var previewFile by remember(order.id) { mutableStateOf<StudioClientFile?>(null) }

    val photos = order.clientFiles.filter { file ->
        // The preview card mirrors the design mock-up into client files. That is a
        // picture of what we are making, not of what came in.
        isClientFileImage(file.contentType, file.fileName) &&
            !(file.downloadUrl.isNotBlank() && file.downloadUrl == order.designLink)
    }

    previewFile?.let { pf ->
        ClientFilePreviewDialog(
            file = pf,
            isCurrentPreview = pf.downloadUrl.isNotBlank() && pf.downloadUrl == order.designLink,
            onUseAsPreview = { previewFile = null },
            onDismiss = { previewFile = null },
            onOpenExternal = {
                if (pf.downloadUrl.isNotBlank()) fileOpenScope.launch {
                    uk.co.eggcraft.studioflow.features.shell.AppLockGuard.suppressNextLockOnce()
                    uriHandler.openUri(createSharedFileLink(pf.downloadUrl))
                }
            }
        )
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null && canManageClientFiles) {
            val fileName = displayNameForUri(context, uri)
            val contentType = context.contentResolver.getType(uri).orEmpty()
            val bytes = readBytesForUri(context, uri)
            if (bytes != null) onUploadClientFile(order, bytes, fileName, contentType)
        }
    }

    Spacer(modifier = Modifier.height(6.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = t("Intake Photos"),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.weight(1f))
        if (canManageClientFiles) {
            TextButton(onClick = { picker.launch(arrayOf("image/*")) }) { Text(t("Add photos")) }
        }
    }

    if (photos.isEmpty()) {
        Text(
            text = "—",
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.SemiBold
        )
    } else {
        val shown = photos.take(4)
        val extra = photos.size - shown.size
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            shown.forEachIndexed { index, photo ->
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(max = 64.dp)
                        .aspectRatio(1f)
                        .clip(RoundedCornerShape(8.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .clickable { previewFile = photo },
                    contentAlignment = Alignment.Center
                ) {
                    coil.compose.AsyncImage(
                        model = photo.downloadUrl,
                        contentDescription = photo.fileName,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                    if (extra > 0 && index == shown.lastIndex) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(Color.Black.copy(alpha = 0.45f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("+$extra", color = Color.White, fontWeight = FontWeight.ExtraBold)
                        }
                    }
                }
            }
            // Keeps four columns' worth of width so a single photo stays a
            // thumbnail instead of stretching across the card.
            repeat(4 - shown.size) { Spacer(modifier = Modifier.weight(1f)) }
        }
    }
}

@Composable
private fun OrderTextRow(
    label: String,
    value: String,
    enabled: Boolean,
    onValueChange: (String) -> Unit
) {
    var draft by remember(value) { mutableStateOf(value) }
    OutlinedTextField(
        value = draft,
        onValueChange = { draft = it },
        label = { Text(label) },
        enabled = enabled,
        singleLine = false,
        modifier = Modifier
            .fillMaxWidth()
            .onFocusChanged { state -> if (!state.isFocused && draft != value) onValueChange(draft) }
    )
    Spacer(modifier = Modifier.height(6.dp))
}

// The two lists a jeweller writes at the counter, edited as plain lines.
@Composable
private fun OrderLinesRow(
    label: String,
    lines: List<String>,
    enabled: Boolean,
    onLinesChange: (List<String>) -> Unit
) {
    val joined = lines.joinToString("\n")
    var draft by remember(joined) { mutableStateOf(joined) }
    OutlinedTextField(
        value = draft,
        onValueChange = { draft = it },
        label = { Text(label) },
        enabled = enabled,
        minLines = 3,
        modifier = Modifier
            .fillMaxWidth()
            .onFocusChanged { state ->
                if (!state.isFocused && draft != joined) {
                    onLinesChange(draft.split("\n").map { it.trim() }.filter { it.isNotBlank() })
                }
            }
    )
    Spacer(modifier = Modifier.height(6.dp))
}

@Composable
private fun DesktopNotesCard(
    order: StudioOrder,
    workspaceSettings: StudioWorkspaceSettings,
    canEditWorkflow: Boolean,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val keepOrderCardVisible = LocalKeepOrderCardVisible.current
    val globals = normalizedSpecialNoteSections(workspaceSettings.specialNoteSections)
    // Local optimistic state — survives rapid clicks even before Firestore round-trip completes.
    var localExtras by remember(order.id) { mutableStateOf(perOrderExtraNoteSections(order)) }
    var lastLocalWriteJson by remember(order.id) { mutableStateOf<String?>(null) }
    val remoteExtrasJson = order.customFields[ORDER_EXTRA_NOTE_SECTIONS_KEY].orEmpty()
    LaunchedEffect(order.id, remoteExtrasJson) {
        // Adopt remote only if it matches our last write (round-trip confirmed) — otherwise keep local optimistic.
        // Also adopt remote if we've never written locally (initial load or remote change from another device).
        val remote = perOrderExtraNoteSections(order)
        val remoteIds = remote.map { it.id }.toSet()
        val localIds = localExtras.map { it.id }.toSet()
        if (lastLocalWriteJson == null) {
            // No local write yet — adopt remote.
            if (remoteIds != localIds) localExtras = remote
        } else if (remoteExtrasJson == lastLocalWriteJson) {
            // Round-trip matches our last write — clear flag, accept remote (which equals local).
            localExtras = remote
            lastLocalWriteJson = null
        } else if (remote.size >= localExtras.size && remoteIds.containsAll(localIds)) {
            // Remote has at least everything local has — possibly a peer added more. Adopt.
            localExtras = remote
            lastLocalWriteJson = null
        }
        // Otherwise: remote is stale (shorter / missing items) — keep local optimistic.
    }
    val globalIds = globals.map { it.id }.toSet()
    val mergedExtras = localExtras.filter { it.id !in globalIds }
    val sections = globals + mergedExtras
    val perOrderIds = mergedExtras.map { it.id }.toSet()
    val minimumNotesHeight = (340 + mergedExtras.size * 120).coerceAtMost(760)
    val commitExtras: (List<StudioHeadingItem>) -> Unit = { next ->
        keepOrderCardVisible(OrderDetailCardId.Notes)
        localExtras = next
        val cleaned = next.filter { it.id.isNotBlank() && it.title.isNotBlank() && !it.id.equals(STUDIO_PRIMARY_SPECIAL_NOTE_ID, ignoreCase = true) }
        lastLocalWriteJson = if (cleaned.isEmpty()) "" else org.json.JSONArray().apply {
            cleaned.forEach { put(org.json.JSONObject().put("id", it.id).put("title", it.title)) }
        }.toString()
        savePerOrderExtraNoteSections(order, next, onUpdateOrderFields)
    }
    DetailCard(
        title = "Notes",
        minimumHeightOverride = minimumNotesHeight,
        headerAction = if (canEditWorkflow) {
            {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = StudioBlue.copy(alpha = 0.12f),
                    onClick = {
                        val next = localExtras + StudioHeadingItem(java.util.UUID.randomUUID().toString(), "Special Note ${globals.size + localExtras.size + 1}")
                        commitExtras(next)
                    }
                ) {
                    Icon(
                        imageVector = Icons.Filled.Add,
                        contentDescription = t("Add note field to this order"),
                        modifier = Modifier.padding(5.dp).size(15.dp),
                        tint = StudioBlue
                    )
                }
            }
        } else null
    ) {
        sections.forEachIndexed { index, section ->
            if (index > 0) HorizontalDivider()
            SpecialNoteSectionEditor(
                order = order,
                section = section,
                canEditWorkflow = canEditWorkflow,
                isPerOrderExtra = section.id in perOrderIds,
                onUpdateOrderFields = onUpdateOrderFields,
                onRenameExtra = { newTitle ->
                    val next = localExtras.map { if (it.id == section.id) it.copy(title = newTitle) else it }
                    commitExtras(next)
                },
                onRemoveExtra = {
                    val next = localExtras.filter { it.id != section.id }
                    commitExtras(next)
                }
            )
        }
    }
}

private const val ORDER_EXTRA_NOTE_SECTIONS_KEY = "orderExtraNoteSectionsJSON"

private fun perOrderExtraNoteSections(order: StudioOrder): List<StudioHeadingItem> {
    val raw = order.customFields[ORDER_EXTRA_NOTE_SECTIONS_KEY]?.trim().orEmpty()
    if (raw.isEmpty()) return emptyList()
    return try {
        val arr = org.json.JSONArray(raw)
        (0 until arr.length()).mapNotNull { i ->
            val obj = arr.optJSONObject(i) ?: return@mapNotNull null
            val id = obj.optString("id").trim()
            val title = obj.optString("title").trim()
            if (id.isBlank() || title.isBlank() || id.equals(STUDIO_PRIMARY_SPECIAL_NOTE_ID, ignoreCase = true)) null
            else StudioHeadingItem(id, title)
        }
    } catch (_: Throwable) { emptyList() }
}

private fun savePerOrderExtraNoteSections(
    order: StudioOrder,
    sections: List<StudioHeadingItem>,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    val cleaned = sections.filter { it.id.isNotBlank() && it.title.isNotBlank() && !it.id.equals(STUDIO_PRIMARY_SPECIAL_NOTE_ID, ignoreCase = true) }
    val json = if (cleaned.isEmpty()) "" else org.json.JSONArray().apply {
        cleaned.forEach { put(org.json.JSONObject().put("id", it.id).put("title", it.title)) }
    }.toString()
    onUpdateOrderFields(order, mapOf("details" to mapOf("customFields" to mapOf(ORDER_EXTRA_NOTE_SECTIONS_KEY to json))))
}

@Composable
private fun SpecialNoteSectionEditor(
    order: StudioOrder,
    section: StudioHeadingItem,
    canEditWorkflow: Boolean,
    isPerOrderExtra: Boolean = false,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onRenameExtra: (String) -> Unit = {},
    onRemoveExtra: () -> Unit = {}
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val sourceValue = specialNoteValue(order, section)
    var draft by remember(order.id, section.id, sourceValue) { mutableStateOf(sourceValue) }
    val isPrimary = section.id.equals(STUDIO_PRIMARY_SPECIAL_NOTE_ID, ignoreCase = true)
    val labelColor = MaterialTheme.colorScheme.onSurfaceVariant
    val noteBg = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.03f)

    // Auto-save draft (debounced) on change
    LaunchedEffect(draft, order.id, section.id) {
        if (!canEditWorkflow) return@LaunchedEffect
        if (draft == sourceValue) return@LaunchedEffect
        delay(700)
        if (draft == sourceValue) return@LaunchedEffect
        val details = if (isPrimary) mapOf("notes" to draft) else mapOf("specialNotes" to mapOf(section.id to draft))
        onUpdateOrderFields(order, mapOf("details" to details))
    }

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (isPerOrderExtra && canEditWorkflow) {
            var titleDraft by remember(section.id, section.title) { mutableStateOf(section.title) }
            // Auto-save title (debounced)
            LaunchedEffect(titleDraft, section.id) {
                if (titleDraft == section.title) return@LaunchedEffect
                delay(600)
                if (titleDraft != section.title && titleDraft.isNotBlank()) onRenameExtra(titleDraft)
            }
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                BasicTextField(
                    value = titleDraft,
                    onValueChange = { titleDraft = it },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    textStyle = LocalTextStyle.current.copy(
                        fontSize = 11.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = labelColor,
                        letterSpacing = 0.6.sp
                    ),
                    cursorBrush = androidx.compose.ui.graphics.SolidColor(MaterialTheme.colorScheme.primary)
                )
                IconButton(onClick = onRemoveExtra, modifier = Modifier.size(28.dp)) {
                    Icon(Icons.Filled.Close, contentDescription = "Remove section", tint = labelColor, modifier = Modifier.size(16.dp))
                }
            }
        } else {
            Text(
                text = section.title.uppercase(),
                fontSize = 11.sp,
                fontWeight = FontWeight.ExtraBold,
                color = labelColor,
                letterSpacing = 0.6.sp
            )
        }
        Surface(
            shape = RoundedCornerShape(10.dp),
            color = noteBg,
            modifier = Modifier.fillMaxWidth()
        ) {
            BasicTextField(
                value = draft,
                onValueChange = { draft = it },
                enabled = canEditWorkflow,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                textStyle = LocalTextStyle.current.copy(
                    fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.onSurface
                ),
                cursorBrush = androidx.compose.ui.graphics.SolidColor(MaterialTheme.colorScheme.primary),
                decorationBox = { inner ->
                    Box(modifier = Modifier.heightIn(min = 64.dp)) {
                        if (draft.isEmpty()) {
                            Text(
                                t("Add note here…"),
                                color = labelColor.copy(alpha = 0.7f),
                                fontSize = 14.sp
                            )
                        }
                        inner()
                    }
                }
            )
        }
    }
}

@Composable
private fun DesktopClientFilesCard(
    order: StudioOrder,
    clientFilesEnabled: Boolean,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onUploadClientFile: (StudioOrder, ByteArray, String, String) -> Unit,
    onRenameClientFile: (StudioOrder, String, String) -> Unit,
    onDeleteClientFile: (StudioOrder, String) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val fileOpenScope = rememberCoroutineScope()
    var clientPreviewFile by remember(order.id) { mutableStateOf<StudioClientFile?>(null) }
    clientPreviewFile?.let { pf ->
        ClientFilePreviewDialog(
            file = pf,
            isCurrentPreview = pf.downloadUrl.isNotBlank() && pf.downloadUrl == order.designLink,
            onUseAsPreview = {
                if (isClientFileImage(pf.contentType, pf.fileName) && pf.downloadUrl.isNotBlank()) {
                    onUpdateOrderFields(order, mapOf("details" to mapOf("designLink" to pf.downloadUrl)))
                    clientPreviewFile = null
                }
            },
            onDismiss = { clientPreviewFile = null },
            onOpenExternal = { if (pf.downloadUrl.isNotBlank()) fileOpenScope.launch { uk.co.eggcraft.studioflow.features.shell.AppLockGuard.suppressNextLockOnce(); uriHandler.openUri(createSharedFileLink(pf.downloadUrl)) } }
        )
    }
    var renameFileId by remember(order.id) { mutableStateOf("") }
    var renameText by remember(order.id) { mutableStateOf("") }
    var deleteFileId by remember(order.id) { mutableStateOf("") }
    if (deleteFileId.isNotBlank()) {
        val target = order.clientFiles.firstOrNull { it.id == deleteFileId }
        AlertDialog(
            onDismissRequest = { deleteFileId = "" },
            title = { Text(t("Delete file?")) },
            text = { Text(target?.fileName ?: "") },
            confirmButton = {
                TextButton(onClick = {
                    onDeleteClientFile(order, deleteFileId)
                    deleteFileId = ""
                }) { Text(t("Delete"), color = StudioRed, fontWeight = FontWeight.ExtraBold) }
            },
            dismissButton = {
                TextButton(onClick = { deleteFileId = "" }) { Text(t("Cancel")) }
            }
        )
    }
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null && clientFilesEnabled) {
            val fileName = displayNameForUri(context, uri)
            val contentType = context.contentResolver.getType(uri).orEmpty()
            val bytes = readBytesForUri(context, uri)
            if (bytes != null) onUploadClientFile(order, bytes, fileName, contentType)
        }
    }

    DetailCard(title = t("Client Files")) {
        ClientFileDropUploadArea(
            order = order,
            enabled = clientFilesEnabled,
            onUploadClientFile = onUploadClientFile
        ) {
            Text(
                "PDF, image, PSD and PSB files for this order. Visible to workspace members who can open this order.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                fontWeight = FontWeight.SemiBold
            )

            if (clientFilesEnabled) {
                Button(
                    onClick = { uk.co.eggcraft.studioflow.features.shell.AppLockGuard.suppressNextLockOnce(); filePicker.launch(arrayOf("*/*")) },
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text(t("Upload File"), fontWeight = FontWeight.ExtraBold)
                }
            } else {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(40.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.56f)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 11.dp, vertical = 7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(7.dp)
                    ) {
                        Icon(
                            Icons.Filled.Lock,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(12.dp)
                        )
                        Text(
                            t("Client Files available on Pro"),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 11.sp
                        )
                        Spacer(modifier = Modifier.weight(1f))
                        Text("Pro", color = StudioBlue, fontWeight = FontWeight.ExtraBold, fontSize = 10.sp)
                    }
                }
            }

            if (order.clientFiles.isEmpty()) {
                DetailListRow("No client files yet.", "Upload PDFs, images, PSD or PSB files that belong to this client order.", MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    order.clientFiles.forEach { file ->
                        ClientFileRowCard(
                            file = file,
                            enabled = clientFilesEnabled,
                            isCurrentPreview = file.downloadUrl.isNotBlank() && file.downloadUrl == order.designLink,
                            onPreview = { if (file.downloadUrl.isNotBlank()) clientPreviewFile = file },
                            onDownload = { downloadClientFile(context, file) },
                            onOpenExternal = { if (file.downloadUrl.isNotBlank()) fileOpenScope.launch { uk.co.eggcraft.studioflow.features.shell.AppLockGuard.suppressNextLockOnce(); uriHandler.openUri(createSharedFileLink(file.downloadUrl)) } },
                            onUseAsPreview = {
                                if (isClientFileImage(file.contentType, file.fileName) && file.downloadUrl.isNotBlank()) {
                                    onUpdateOrderFields(order, mapOf("details" to mapOf("designLink" to file.downloadUrl)))
                                }
                            },
                            onRename = {
                                renameFileId = file.id
                                renameText = file.fileName
                            },
                            onDelete = { deleteFileId = file.id }
                        )
                        if (renameFileId == file.id) {
                            OutlinedTextField(
                                value = renameText,
                                onValueChange = { renameText = it },
                                label = { Text(t("File name")) },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                                Button(
                                    onClick = {
                                        onRenameClientFile(order, file.id, renameText.trim())
                                        renameFileId = ""
                                    },
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(10.dp)
                                ) {
                                    Text(t("Save"), fontWeight = FontWeight.ExtraBold)
                                }
                                TextButton(
                                    onClick = { renameFileId = "" },
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text(t("Cancel"), fontWeight = FontWeight.ExtraBold)
                                }
                            }
                        }
                    }
                }
                Text(
                    t("Allowed: PDF, JPG, PNG, HEIC, HEIF, WEBP, PSD and PSB. The size limit follows Settings > Safety & Uploads."),
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
                    fontSize = 11.sp,
                    lineHeight = 15.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }
        LibraryFilesForOrderStrip(order = order)
    }
}

// Read-only strip of Files-library records shared with this order. Sharing is
// managed from the Files screen's Library tab; nothing here touches any
// order-save path.
@Composable
private fun LibraryFilesForOrderStrip(order: StudioOrder) {
    if (order.companyId.isBlank() || order.id.isBlank()) return
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repository = remember { StudioFlowRepository() }
    var libraryFiles by remember(order.id) { mutableStateOf<List<StudioLibraryFile>>(emptyList()) }

    LaunchedEffect(order.id) {
        libraryFiles = try { repository.libraryFiles(order.companyId, "order:${order.id}") }
        catch (failure: Exception) { emptyList() }
    }

    if (libraryFiles.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        Text(t("From the Files library"), fontWeight = FontWeight.ExtraBold, fontSize = 13.sp)
        libraryFiles.forEach { file ->
            val link = file.links.firstOrNull { it.kind == "order" && it.id == order.id }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f))
                    .clickable(enabled = file.storagePath.isNotBlank()) {
                        scope.launch {
                            runCatching {
                                val url = repository.libraryFileUrl(file.storagePath)
                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                            }
                        }
                    }
                    .padding(10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        (link?.displayName.orEmpty().ifBlank { file.displayName }).ifBlank { file.fileName },
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        listOf(
                            fileSizeLabel(file.fileSize),
                            if (file.updatedAtMs > 0) shortDateOrDash(Date(file.updatedAtMs)) else ""
                        ).filter { it.isNotBlank() }.joinToString(" · "),
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                when (link?.audience) {
                    "portal" -> Text(t("Client portal"), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = StudioBlue)
                    "internal" -> Text(
                        t("Internal only"),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}


@Composable
private fun ClientFileDropUploadArea(
    order: StudioOrder,
    enabled: Boolean = true,
    onUploadClientFile: (StudioOrder, ByteArray, String, String) -> Unit,
    content: @Composable ColumnScope.() -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val context = LocalContext.current
    var isDropTarget by remember(order.id) { mutableStateOf(false) }
    val dropTarget = remember(order.id, context, enabled, onUploadClientFile) {
        object : DragAndDropTarget {
            override fun onEntered(event: DragAndDropEvent) {
                if (enabled && acceptsClientFileDrag(event)) isDropTarget = true
            }

            override fun onExited(event: DragAndDropEvent) {
                isDropTarget = false
            }

            override fun onEnded(event: DragAndDropEvent) {
                isDropTarget = false
            }

            override fun onDrop(event: DragAndDropEvent): Boolean {
                isDropTarget = false
                if (!enabled) return false
                val uris = clientFileUrisFromEvent(event)
                if (uris.isEmpty()) return false
                runCatching { context.findActivity()?.requestDragAndDropPermissions(event.toAndroidDragEvent()) }
                val uploadedCount = uris.count { uri ->
                    uploadClientFileFromUri(
                        context = context,
                        order = order,
                        uri = uri,
                        onUploadClientFile = onUploadClientFile
                    )
                }
                if (uploadedCount == 0) {
                    Toast.makeText(context, "Selected file could not be read.", Toast.LENGTH_SHORT).show()
                }
                return uploadedCount > 0
            }
        }
    }
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .dragAndDropTarget(
                shouldStartDragAndDrop = { event -> enabled && acceptsClientFileDrag(event) },
                target = dropTarget
            ),
        shape = RoundedCornerShape(13.dp),
        color = if (isDropTarget) StudioBlue.copy(alpha = 0.10f) else Color.Transparent,
        border = BorderStroke(
            width = if (isDropTarget) 1.dp else 0.dp,
            color = if (isDropTarget) StudioBlue.copy(alpha = 0.55f) else Color.Transparent
        )
    ) {
        Column(
            modifier = Modifier.padding(if (isDropTarget) 10.dp else 0.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            content = content
        )
    }
}

@Composable
private fun DesktopTodoCard(
    order: StudioOrder,
    teamMembers: List<StudioTeamMember>,
    canAssignTasks: Boolean,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var newTaskTitle by remember(order.id) { mutableStateOf("") }
    var newTaskPriority by remember(order.id) { mutableStateOf("Normal") }
    var newTaskHasDue by remember(order.id) { mutableStateOf(false) }
    var newTaskAssigneeId by remember(order.id) { mutableStateOf("") }
    val openCount = order.todoItems.count { !it.isDone }
        .takeIf { order.todoItems.isNotEmpty() }
        ?: (order.todoCount - order.completedTodoCount).coerceAtLeast(0)
    val doneCount = order.todoItems.count { it.isDone }
        .takeIf { order.todoItems.isNotEmpty() }
        ?: order.completedTodoCount
    val overdueCount = order.todoItems.count { item ->
        !item.isDone && item.dueAt?.before(Date()) == true
    }
    val selectedAssignee = teamMembers.firstOrNull { it.id == newTaskAssigneeId }

    DetailCard(title = t("To Do")) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
        ) {
            Column(
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                    TodoCountTile(modifier = Modifier.weight(1f), label = "Open", value = openCount, color = StudioBlue)
                    TodoCountTile(modifier = Modifier.weight(1f), label = "Overdue", value = overdueCount, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    TodoCountTile(modifier = Modifier.weight(1f), label = "Done", value = doneCount, color = StudioGreen)
                }
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.58f)
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                            OutlinedTextField(
                                value = newTaskTitle,
                                onValueChange = { newTaskTitle = it },
                                placeholder = { Text(t(t("Add a task..."))) },
                                singleLine = true,
                                textStyle = TextStyle(
                                    color = MaterialTheme.colorScheme.onSurface,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.SemiBold
                                ),
                                shape = RoundedCornerShape(10.dp),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedContainerColor = MaterialTheme.colorScheme.surface,
                                    unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                                    focusedBorderColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f),
                                    unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f),
                                    cursorColor = StudioBlue
                                ),
                                modifier = Modifier
                                    .weight(1f)
                                    .height(56.dp)
                            )
                            Button(
                                onClick = {
                                    val title = newTaskTitle.trim()
                                    if (title.isNotBlank()) {
                                        val patch = mutableMapOf<String, Any?>(
                                            "action" to "add",
                                            "title" to title,
                                            "priority" to newTaskPriority
                                        )
                                        if (canAssignTasks && selectedAssignee != null) {
                                            patch["assignedToUid"] = selectedAssignee.id
                                            patch["assignedToEmail"] = selectedAssignee.email
                                        }
                                        if (newTaskHasDue) {
                                            todoDueDateFromDays("1")?.let { patch["dueDate"] = it }
                                        }
                                        onUpdateOrderFields(order, mapOf("todo" to patch))
                                        newTaskTitle = ""
                                        newTaskPriority = "Normal"
                                        newTaskHasDue = false
                                        newTaskAssigneeId = ""
                                    }
                                },
                                modifier = Modifier.size(width = 82.dp, height = 56.dp),
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Text("+", fontSize = 26.sp, fontWeight = FontWeight.Light)
                            }
                        }
                        TodoComposerSelectRow(
                            label = "Assign",
                            value = if (canAssignTasks) selectedAssignee?.label ?: "Unassigned" else "Unavailable",
                            options = listOf("Unassigned") + teamMembers.filter { !it.isOwner }.map { it.label },
                            enabled = canAssignTasks,
                            onSelect = { selected ->
                                newTaskAssigneeId = teamMembers.firstOrNull { it.label == selected }?.id.orEmpty()
                            }
                        )
                        TodoComposerSelectRow(
                            label = "Priority",
                            value = newTaskPriority,
                            options = listOf("Low", "Normal", "High", "Urgent"),
                            enabled = true,
                            onSelect = { newTaskPriority = it }
                        )
                        TodoDueSwitchRow(checked = newTaskHasDue, onCheckedChange = { newTaskHasDue = it })
                    }
                }
                if (order.todoItems.isEmpty()) {
                    TodoEmptyState()
                } else {
                    val visibleTodoItems = order.todoItems.take(3)
                    visibleTodoItems.forEach { item ->
                        TodoCompactItemRow(
                            item = item,
                            teamMembers = teamMembers,
                            onToggle = {
                                onUpdateOrderFields(order, mapOf("todo" to mapOf("action" to "toggle", "taskId" to item.id, "isDone" to !item.isDone)))
                            },
                            onDelete = {
                                onUpdateOrderFields(order, mapOf("todo" to mapOf("action" to "delete", "taskId" to item.id)))
                            }
                        )
                    }
                    if (order.todoItems.size > visibleTodoItems.size) {
                        InfoRow("More Tasks", "+${order.todoItems.size - visibleTodoItems.size}")
                    }
                }
            }
        }
    }
}

@Composable
private fun TodoCountTile(modifier: Modifier, label: String, value: Int, color: Color) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = modifier.height(84.dp),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.48f),
        border = BorderStroke(1.dp, color.copy(alpha = 0.22f))
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 13.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                label,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 13.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                value.toString(),
                color = color,
                fontSize = 24.sp,
                fontWeight = FontWeight.ExtraBold
            )
        }
    }
}

@Composable
private fun TodoComposerSelectRow(
    label: String,
    value: String,
    options: List<String>,
    enabled: Boolean,
    onSelect: (String) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var expanded by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(
            label,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 13.sp,
            fontWeight = FontWeight.ExtraBold,
            modifier = Modifier.width(84.dp)
        )
        Box(modifier = Modifier.weight(1f)) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(40.dp),
                shape = RoundedCornerShape(9.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = if (enabled) 0.86f else 0.42f),
                onClick = { if (enabled) expanded = true }
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        value,
                        modifier = Modifier.weight(1f),
                        color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Icon(
                        imageVector = Icons.Filled.KeyboardArrowDown,
                        contentDescription = null,
                        modifier = Modifier.size(17.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                options.distinct().forEach { option ->
                    DropdownMenuItem(
                        text = { Text(option, fontWeight = if (option == value) FontWeight.ExtraBold else FontWeight.Normal) },
                        onClick = {
                            expanded = false
                            onSelect(option)
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun TodoDueSwitchRow(checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(
            "Due",
            color = MaterialTheme.colorScheme.onSurface,
            fontSize = 13.sp,
            fontWeight = FontWeight.ExtraBold,
            modifier = Modifier.width(54.dp)
        )
        CompactTodoSwitch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun CompactTodoSwitch(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val activeColor = StudioBlue
    val inactiveColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f)
    Surface(
        modifier = Modifier.size(width = 44.dp, height = 26.dp),
        shape = RoundedCornerShape(13.dp),
        color = if (checked) activeColor else inactiveColor,
        border = BorderStroke(1.dp, if (checked) activeColor.copy(alpha = 0.35f) else MaterialTheme.colorScheme.outline.copy(alpha = 0.12f)),
        onClick = { onCheckedChange(!checked) }
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(3.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (checked) Spacer(modifier = Modifier.weight(1f))
            Surface(
                modifier = Modifier.size(20.dp),
                shape = RoundedCornerShape(10.dp),
                color = Color.White,
                shadowElevation = 1.dp
            ) {}
            if (!checked) Spacer(modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun TodoEmptyState() {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .height(160.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector = Icons.Filled.CheckCircle,
            contentDescription = null,
            modifier = Modifier.size(44.dp),
            tint = StudioGreen.copy(alpha = 0.72f)
        )
        Spacer(modifier = Modifier.height(14.dp))
        Text(
            "No tasks here",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 15.sp,
            fontWeight = FontWeight.ExtraBold
        )
    }
}

@Composable
private fun TodoCompactItemRow(
    item: StudioTodoItem,
    teamMembers: List<StudioTeamMember>,
    onToggle: () -> Unit,
    onDelete: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val tone = if (item.isDone) StudioGreen else priorityColor(item.priority)
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.46f)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Surface(
                modifier = Modifier.size(28.dp),
                shape = RoundedCornerShape(14.dp),
                color = tone.copy(alpha = 0.12f),
                border = BorderStroke(1.dp, tone.copy(alpha = 0.35f)),
                onClick = onToggle
            ) {
                Icon(
                    imageVector = Icons.Filled.CheckCircle,
                    contentDescription = null,
                    modifier = Modifier.padding(5.dp),
                    tint = tone
                )
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    item.title.ifBlank { "To Do" },
                    color = MaterialTheme.colorScheme.onSurface,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    listOf(
                        if (item.isDone) "Done" else "Open",
                        item.priority,
                        item.dueAt?.let { shortDate(it) }.orEmpty(),
                        taskAssigneeLabel(item, teamMembers)
                    ).filter { it.isNotBlank() }.joinToString(" · ").ifBlank { "No details" },
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            TextButton(onClick = onDelete) {
                Text(t("Delete"), color = StudioRed, fontWeight = FontWeight.ExtraBold)
            }
        }
    }
}

@Composable
private fun DesktopWorkTimeCard(order: StudioOrder, onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var workTitle by remember(order.id) { mutableStateOf("Work session") }

    DetailCard(title = t("Work Time")) {
        WorkTimeCardBody(
            order = order,
            workTitle = workTitle,
            onWorkTitleChange = { workTitle = it },
            onUpdateOrderFields = onUpdateOrderFields
        )
    }
}

@Composable
private fun WorkTimeCardBody(
    order: StudioOrder,
    workTitle: String,
    onWorkTitleChange: (String) -> Unit,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val activeSession = order.workSessions.firstOrNull { it.endedAt == null }
    var nowMillis by remember(activeSession?.id) { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(activeSession?.id) {
        while (activeSession != null) {
            nowMillis = System.currentTimeMillis()
            delay(1000)
        }
    }
    val totalSeconds = order.workSessions.sumOf { it.effectiveDurationSeconds(nowMillis) }

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(15.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.65f))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            WorkTimeTotalPanel(totalSeconds = totalSeconds)
            activeSession?.let { session ->
                WorkTimeActivePanel(session = session, nowMillis = nowMillis)
            }
            WorkTimeComposerRow(
                workTitle = workTitle,
                activeSession = activeSession,
                onWorkTitleChange = onWorkTitleChange,
                onUpdateOrderFields = onUpdateOrderFields,
                order = order
            )
            if (order.workSessions.isEmpty()) {
                WorkTimeEmptyState()
            } else {
                WorkTimeSessionGroups(
                    sessions = order.workSessions.take(6),
                    activeSession = activeSession,
                    nowMillis = nowMillis,
                    onUpdateOrderFields = onUpdateOrderFields,
                    order = order
                )
                if (order.workSessions.size > 6) {
                    InfoRow("More Sessions", "+${order.workSessions.size - 6}")
                }
            }
        }
    }
}

@Composable
private fun WorkTimeTotalPanel(totalSeconds: Int) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = StudioBlue.copy(alpha = 0.10f)
    ) {
        Column(modifier = Modifier.padding(horizontal = 18.dp, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                t("Total Work Time"),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 13.sp,
                fontWeight = FontWeight.ExtraBold
            )
            Text(
                durationLabel(totalSeconds),
                color = StudioBlue,
                fontSize = 32.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun WorkTimeActivePanel(session: StudioWorkSession, nowMillis: Long) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = StudioGreen.copy(alpha = 0.10f)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 13.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Surface(
                modifier = Modifier.size(28.dp),
                shape = RoundedCornerShape(999.dp),
                color = Color.Transparent,
                border = BorderStroke(2.dp, StudioGreen.copy(alpha = 0.85f))
            ) {
                Icon(
                    imageVector = Icons.Filled.Timeline,
                    contentDescription = null,
                    modifier = Modifier.padding(5.dp),
                    tint = StudioGreen
                )
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    session.title.ifBlank { t("Work session") },
                    color = MaterialTheme.colorScheme.onSurface,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    "Started ${workSessionTimeLabel(session.startedAt)}",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Text(
                durationLabel(session.effectiveDurationSeconds(nowMillis)),
                color = StudioGreen,
                fontSize = 16.sp,
                fontWeight = FontWeight.ExtraBold
            )
        }
    }
}

@Composable
private fun WorkTimeComposerRow(
    workTitle: String,
    activeSession: StudioWorkSession?,
    onWorkTitleChange: (String) -> Unit,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    order: StudioOrder
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        OutlinedTextField(
            value = workTitle,
            onValueChange = { onWorkTitleChange(it.take(80)) },
            placeholder = { Text(t("Work title...")) },
            singleLine = true,
            textStyle = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
            shape = RoundedCornerShape(10.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = MaterialTheme.colorScheme.surface,
                unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                focusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
                unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
                cursorColor = StudioBlue
            ),
            modifier = Modifier
                .weight(1f)
                .height(54.dp)
        )
        WorkTimeActionButton(
            label = if (activeSession == null) "Start" else "Stop",
            icon = if (activeSession == null) Icons.Filled.PlayArrow else Icons.Filled.Stop,
            tone = if (activeSession == null) StudioGreen else StudioRed,
            onClick = {
                if (activeSession == null) {
                    onUpdateOrderFields(
                        order,
                        mapOf("workTime" to mapOf("action" to "start", "title" to workTitle.trim().ifBlank { t("Work session") }))
                    )
                } else {
                    onUpdateOrderFields(order, mapOf("workTime" to mapOf("action" to "stop", "sessionId" to activeSession.id)))
                }
            }
        )
    }
}

@Composable
private fun WorkTimeActionButton(label: String, icon: ImageVector, tone: Color, onClick: () -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = Modifier
            .width(108.dp)
            .height(50.dp),
        shape = RoundedCornerShape(10.dp),
        color = tone,
        onClick = onClick
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(19.dp), tint = Color.White)
            Spacer(modifier = Modifier.width(8.dp))
            Text(label, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold)
        }
    }
}

@Composable
private fun WorkTimeSessionGroups(
    sessions: List<StudioWorkSession>,
    activeSession: StudioWorkSession?,
    nowMillis: Long,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    order: StudioOrder
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val groups = sessions.groupBy { workSessionDateKey(it.startedAt) }
    groups.forEach { (_, groupSessions) ->
        val groupDate = workSessionDateLabel(groupSessions.firstOrNull()?.startedAt)
        val groupTotal = groupSessions.sumOf { it.effectiveDurationSeconds(nowMillis) }
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                groupDate,
                modifier = Modifier.weight(1f),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 13.sp,
                fontWeight = FontWeight.ExtraBold
            )
            Text(
                durationLabel(groupTotal),
                color = StudioBlue,
                fontSize = 13.sp,
                fontWeight = FontWeight.ExtraBold
            )
        }
        groupSessions.forEach { session ->
            WorkTimeSessionRow(
                session = session,
                activeSession = activeSession,
                nowMillis = nowMillis,
                onStop = {
                    onUpdateOrderFields(order, mapOf("workTime" to mapOf("action" to "stop", "sessionId" to session.id)))
                },
                onContinue = {
                    onUpdateOrderFields(
                        order,
                        mapOf("workTime" to mapOf("action" to "continue", "sessionId" to session.id, "title" to session.title))
                    )
                },
                onDelete = {
                    onUpdateOrderFields(order, mapOf("workTime" to mapOf("action" to "delete", "sessionId" to session.id)))
                }
            )
        }
    }
}

@Composable
private fun WorkTimeSessionRow(
    session: StudioWorkSession,
    activeSession: StudioWorkSession?,
    nowMillis: Long,
    onStop: () -> Unit,
    onContinue: () -> Unit,
    onDelete: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val isRunning = session.endedAt == null
    val canContinue = !isRunning && activeSession == null
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(13.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Surface(
                modifier = Modifier.size(34.dp),
                shape = RoundedCornerShape(999.dp),
                color = StudioGreen.copy(alpha = if (canContinue || isRunning) 0.14f else 0.08f),
                onClick = { if (canContinue) onContinue() }
            ) {
                Icon(
                    imageVector = Icons.Filled.PlayArrow,
                    contentDescription = if (canContinue) "Continue work session" else null,
                    modifier = Modifier.padding(7.dp),
                    tint = if (canContinue || isRunning) StudioGreen else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.45f)
                )
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    session.title.ifBlank { t("Work session") },
                    color = MaterialTheme.colorScheme.onSurface,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    workSessionRangeLabel(session),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            WorkTimeDurationChip(durationLabel(session.effectiveDurationSeconds(nowMillis)))
            if (isRunning) {
                Surface(
                    modifier = Modifier.size(34.dp),
                    shape = RoundedCornerShape(8.dp),
                    color = StudioRed,
                    onClick = onStop
                ) {
                    Icon(
                        imageVector = Icons.Filled.Stop,
                        contentDescription = "Stop work session",
                        modifier = Modifier.padding(8.dp),
                        tint = Color.White
                    )
                }
            } else if (canContinue) {
                Surface(
                    modifier = Modifier.size(34.dp),
                    shape = RoundedCornerShape(8.dp),
                    color = StudioGreen.copy(alpha = 0.14f),
                    onClick = onContinue
                ) {
                    Icon(
                        imageVector = Icons.Filled.PlayArrow,
                        contentDescription = "Continue work session",
                        modifier = Modifier.padding(8.dp),
                        tint = StudioGreen
                    )
                }
            } else {
                Spacer(modifier = Modifier.size(34.dp))
            }
            Surface(
                modifier = Modifier.size(34.dp),
                shape = RoundedCornerShape(8.dp),
                color = Color.Transparent,
                onClick = onDelete
            ) {
                Icon(
                    imageVector = Icons.Filled.Delete,
                    contentDescription = "Delete work session",
                    modifier = Modifier.padding(7.dp),
                    tint = StudioRed
                )
            }
        }
    }
}

@Composable
private fun WorkTimeDurationChip(label: String) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = StudioGreen.copy(alpha = 0.12f)
    ) {
        Text(
            label,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            color = StudioGreen,
            fontSize = 14.sp,
            fontWeight = FontWeight.ExtraBold,
            maxLines = 1
        )
    }
}

@Composable
private fun WorkTimeEmptyState() {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
    ) {
        Column(
            modifier = Modifier.padding(vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(Icons.Filled.Timeline, contentDescription = null, modifier = Modifier.size(34.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(t("No work sessions yet."), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold)
        }
    }
}

@Composable
private fun DesktopScheduleAlertsCard(
    order: StudioOrder,
    workspaceSettings: StudioWorkspaceSettings,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val templates = quickReminderTemplates(workspaceSettings)
    val firstTemplate = templates.firstOrNull()
    var title by remember(order.id, firstTemplate?.id) { mutableStateOf(firstTemplate?.title ?: t("Follow up customer")) }
    var dueDays by remember(order.id, firstTemplate?.id) { mutableStateOf((firstTemplate?.days ?: 1).toString()) }
    var dueHours by remember(order.id, firstTemplate?.id) { mutableStateOf((firstTemplate?.hours ?: 0).toString()) }
    var priority by remember(order.id, firstTemplate?.id) { mutableStateOf(firstTemplate?.priority ?: "Normal") }
    var notify by remember(order.id, firstTemplate?.id) { mutableStateOf(firstTemplate?.notify ?: true) }
    var note by remember(order.id) { mutableStateOf("") }

    DetailCard(title = t("Schedule & Alerts")) {
        ChoiceRow(
            label = "Quick Reminder",
            value = title,
            options = templates.map { it.title },
            onSelect = { selected ->
                val template = templates.firstOrNull { it.title == selected }
                title = selected
                if (template != null) {
                    dueDays = template.days.toString()
                    dueHours = template.hours.toString()
                    priority = template.priority
                    notify = template.notify
                }
            }
        )
        OutlinedTextField(
            value = title,
            onValueChange = { title = it },
            label = { Text(t("Reminder title")) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedTextField(
                value = dueDays,
                onValueChange = { dueDays = it.filter { char -> char.isDigit() }.take(3) },
                label = { Text(t("Days")) },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
            OutlinedTextField(
                value = dueHours,
                onValueChange = { dueHours = it.filter { char -> char.isDigit() }.take(2) },
                label = { Text(t("Hours")) },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
            ToggleChip(
                label = if (notify) "Notify" else "Silent",
                active = notify,
                modifier = Modifier.weight(0.82f)
            ) {
                notify = !notify
            }
        }
        ChoiceRow(
            label = "Priority",
            value = priority,
            options = listOf("Low", "Normal", "High", "Urgent"),
            onSelect = { priority = it }
        )
        OutlinedTextField(
            value = note,
            onValueChange = { note = it },
            label = { Text(t("Optional note")) },
            modifier = Modifier
                .fillMaxWidth()
                .height(74.dp)
        )
        Button(
            onClick = {
                val cleanTitle = title.trim()
                if (cleanTitle.isNotBlank()) {
                    onUpdateOrderFields(
                        order,
                        mapOf(
                            "schedule" to mapOf(
                                "action" to "add",
                                "title" to cleanTitle,
                                "dueAt" to scheduleDueAtFromParts(dueDays, dueHours),
                                "priority" to priority,
                                "notify" to notify,
                                "note" to note.trim()
                            )
                        )
                    )
                    title = t("Follow up customer")
                    dueDays = "1"
                    priority = "Normal"
                    notify = true
                    note = ""
                }
            },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(10.dp)
        ) {
            Text(t("Add Reminder"), fontWeight = FontWeight.ExtraBold)
        }
        val reminders = order.scheduleReminders
        if (reminders.isEmpty()) {
            DetailListRow("No reminders yet.", "Add a quick reminder to keep this order moving.", MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            val visibleReminders = reminders.take(3)
            visibleReminders.forEach { reminder ->
                ScheduleReminderRow(order = order, reminder = reminder, onUpdateOrderFields = onUpdateOrderFields)
            }
            if (reminders.size > visibleReminders.size) {
                InfoRow("More Reminders", "+${reminders.size - visibleReminders.size}")
            }
        }
    }
}

@Composable
private fun ScheduleReminderRow(
    order: StudioOrder,
    reminder: StudioScheduleReminder,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val done = reminder.status.equals("Done", ignoreCase = true)
    DetailListRow(
        title = reminder.title,
        subtitle = listOf(
            if (done) "Done" else "Pending",
            reminder.priority,
            shortDateOrDash(reminder.dueAt),
            if (reminder.notify) "Notify" else "Silent",
            reminder.note
        ).filter { it.isNotBlank() }.joinToString(" · "),
        tone = if (done) StudioGreen else priorityColor(reminder.priority)
    )
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
        TextButton(
            onClick = { onUpdateOrderFields(order, mapOf("schedule" to mapOf("action" to "complete", "reminderId" to reminder.id))) },
            enabled = !done,
            modifier = Modifier.weight(1f)
        ) {
            Text(t("Done"), fontWeight = FontWeight.ExtraBold)
        }
        TextButton(
            onClick = { onUpdateOrderFields(order, mapOf("schedule" to mapOf("action" to "snooze", "reminderId" to reminder.id, "hours" to 24))) },
            enabled = !done,
            modifier = Modifier.weight(1f)
        ) {
            Text(t("Snooze"), fontWeight = FontWeight.ExtraBold)
        }
        TextButton(
            onClick = { onUpdateOrderFields(order, mapOf("schedule" to mapOf("action" to "delete", "reminderId" to reminder.id))) },
            modifier = Modifier.weight(1f)
        ) {
            Text(t("Delete"), color = StudioRed, fontWeight = FontWeight.ExtraBold)
        }
    }
}

@Composable
private fun DesktopHistoryLogCard(order: StudioOrder, workspaceSettings: StudioWorkspaceSettings) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val exportHistoryPdf = rememberHistoryLogPdfExporter(workspaceSettings)
    DetailCard(
        title = "History / Log",
        extraMenuItems = listOf(
            DetailCardMenuAction("Export history PDF", Icons.Filled.PictureAsPdf) {
                exportHistoryPdf(order)
            }
        )
    ) {
        if (order.historyLog.isEmpty()) {
            DetailListRow("No changes recorded yet", "", MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            val visibleHistoryItems = order.historyLog.take(3)
            visibleHistoryItems.forEach { item ->
                DetailListRow(
                    title = item.title,
                    subtitle = listOf(item.oldValue, item.newValue, shortDateOrDash(item.createdAt)).filter { it.isNotBlank() }.joinToString(" -> "),
                    tone = StudioBlue
                )
            }
            if (order.historyLog.size > visibleHistoryItems.size) {
                InfoRow("More Changes", "+${order.historyLog.size - visibleHistoryItems.size}")
            }
        }
    }
}

@Composable
private fun CustomerContactEditCard(
    order: StudioOrder,
    workspaceSettings: StudioWorkspaceSettings,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit = { _, _ -> }
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var customerName by remember(order.id) { mutableStateOf(order.displayCustomerName) }
    var designName by remember(order.id) { mutableStateOf(order.designName) }
    var watchRef by remember(order.id) { mutableStateOf(order.watchRef) }
    var designLink by remember(order.id) { mutableStateOf(order.designLink) }
    var email by remember(order.id) { mutableStateOf(order.emailAddress) }
    var phone by remember(order.id) { mutableStateOf(order.whatsappNumber) }
    var instagram by remember(order.id) { mutableStateOf(order.instagramUsername) }
    var address by remember(order.id, order.customFields) { mutableStateOf(customFieldValue(order, "communicationAddress")) }
    var customerNotes by remember(order.id, order.customFields) { mutableStateOf(customFieldValue(order, "communicationCustomerNotes")) }
    val channelLabels = remember(workspaceSettings.communicationChannelLabels) { communicationChannelLabels(workspaceSettings) }
    var channels by remember(order.id, order.communication, channelLabels) { mutableStateOf(order.communication.ifEmpty { channelLabels.take(1) }) }
    val configuredCustomFields = remember(workspaceSettings.customFields) { cleanCustomFieldTitles(workspaceSettings.customFields) }
    var customFieldDrafts by remember(order.id, order.customFields, configuredCustomFields) {
        mutableStateOf(configuredCustomFields.associateWith { customFieldValue(order, it) })
    }
    var channelDrafts by remember(order.id, order.customFields, channelLabels) {
        mutableStateOf(channelLabels.associateWith { label -> customFieldValue(order, communicationChannelCustomKey(label)) })
    }

    DetailCard(title = t("Customer & Communication")) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
        ) {
            Column(
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                CustomerInlineTextRow(
                    label = t("Customer Name"),
                    value = customerName,
                    onValueChange = { customerName = it },
                    singleLine = true
                )
                CustomerInlineTextRow(
                    label = workspaceSettings.designNameLabel.ifBlank { "Design Name" },
                    value = designName,
                    onValueChange = { designName = it },
                    singleLine = true,
                    onLabelRename = { onUpdateWorkspaceSettings(mapOf("designNameLabel" to it), "Heading renamed.") }
                )
                CustomerInlineTextRow(
                    label = "Reference",
                    value = watchRef,
                    onValueChange = { watchRef = it },
                    singleLine = true
                )
                if (designLink.isNotBlank()) {
                    CustomerInlineTextRow(
                        label = "Design Link",
                        value = designLink,
                        onValueChange = { designLink = it },
                        singleLine = true
                    )
                }
                if (workspaceSettings.communicationShowEmail && email.isNotBlank()) {
                    CustomerInlineTextRow(
                        label = "Email",
                        value = email,
                        onValueChange = { email = it },
                        singleLine = true
                    )
                }
                if (workspaceSettings.communicationShowAddress && address.isNotBlank()) {
                    CustomerInlineTextRow(
                        label = "Address",
                        value = address,
                        onValueChange = { address = it },
                        minHeight = 72.dp
                    )
                }
                if (configuredCustomFields.isNotEmpty()) {
                    configuredCustomFields.forEach { fieldTitle ->
                        CustomerInlineTextRow(
                            label = fieldTitle,
                            value = customFieldDrafts[fieldTitle].orEmpty(),
                            onValueChange = { nextValue ->
                                customFieldDrafts = customFieldDrafts.toMutableMap().also { it[fieldTitle] = nextValue }
                            },
                            singleLine = true
                        )
                    }
                }
                HorizontalRule()
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(
                        imageVector = Icons.Filled.Description,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = StudioBlue
                    )
                    Text(
                        t("Communication"),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                }
                if (workspaceSettings.communicationShowTelephone) {
                    CustomerInlineTextRow(
                        label = "Telephone",
                        value = phone,
                        onValueChange = { phone = it },
                        singleLine = true
                    )
                }
                if (workspaceSettings.communicationShowChannel) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            FinanceRowLabel(t("Channel"), modifier = Modifier.weight(0.34f))
                            Row(
                                modifier = Modifier
                                    .weight(0.66f)
                                    .horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                channelLabels.forEach { channel ->
                                    CustomerChannelChip(
                                        label = channel,
                                        active = channels.any { it.equals(channel, ignoreCase = true) },
                                        modifier = Modifier.widthIn(min = 82.dp, max = 124.dp)
                                    ) {
                                        channels = toggleListValue(channels, channel)
                                    }
                                }
                            }
                        }
                        channelLabels
                            .filter { label -> channels.any { it.equals(label, ignoreCase = true) } }
                            .forEach { channel ->
                                CommunicationChannelValueField(
                                    channel = channel,
                                    email = email,
                                    phone = phone,
                                    instagram = instagram,
                                    address = address,
                                    customValue = channelDrafts[channel].orEmpty(),
                                    onEmail = { email = it },
                                    onPhone = { phone = it },
                                    onInstagram = { instagram = it },
                                    onAddress = { address = it },
                                    onCustom = { nextValue ->
                                        channelDrafts = channelDrafts.toMutableMap().also { it[channel] = nextValue }
                                    }
                                )
                            }
                    }
                }
                if (workspaceSettings.communicationShowCustomerNotes) {
                    Text(
                        t("Customer Notes"),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                    CustomerNotesBox(
                        value = customerNotes,
                        onValueChange = { customerNotes = it }
                    )
                }
            }
        }
        Button(
            onClick = {
                val customFieldPayload = customFieldDrafts.mapValues { it.value.trim() }.toMutableMap()
                channelDrafts.forEach { (label, value) ->
                    if (communicationChannelKind(label) == CommunicationChannelKind.Custom) {
                        customFieldPayload[communicationChannelCustomKey(label)] = value.trim()
                    }
                }
                onUpdateOrderFields(
                    order,
                    mapOf(
                        "details" to mapOf(
                            "customerName" to customerName.trim().ifBlank { "New Project" },
                            "designName" to designName.trim(),
                            "watchRef" to watchRef.trim(),
                            "designLink" to designLink.trim(),
                            "emailAddress" to email.trim(),
                            "whatsappNumber" to phone.trim(),
                            "instagramUsername" to instagram.trim(),
                            "address" to address.trim(),
                            "customerNotes" to customerNotes.trim(),
                            "customFields" to customFieldPayload,
                            "communication" to channels.distinct()
                        )
                    )
                )
            },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(10.dp)
        ) {
            Text(t("Save Customer & Communication"), fontWeight = FontWeight.ExtraBold)
        }
    }
}

@Composable
private fun CustomerInlineTextRow(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    singleLine: Boolean = false,
    minHeight: Dp = 48.dp,
    onLabelRename: ((String) -> Unit)? = null
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        FinanceRowLabel(label, modifier = Modifier.weight(0.38f), onRename = onLabelRename)
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = singleLine,
            textStyle = TextStyle(
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold
            ),
            shape = RoundedCornerShape(10.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.72f),
                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.72f),
                focusedBorderColor = Color.Transparent,
                unfocusedBorderColor = Color.Transparent,
                cursorColor = StudioBlue
            ),
            modifier = Modifier
                .weight(0.62f)
                .height(minHeight)
        )
    }
}

@Composable
private fun CustomerNotesBox(value: String, onValueChange: (String) -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        placeholder = {
            Text(
                t("Add customer note..."),
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.45f),
                fontWeight = FontWeight.SemiBold
            )
        },
        textStyle = TextStyle(
            color = MaterialTheme.colorScheme.onSurface,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold
        ),
        shape = RoundedCornerShape(12.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
            focusedBorderColor = Color.Transparent,
            unfocusedBorderColor = Color.Transparent,
            cursorColor = StudioBlue
        ),
        modifier = Modifier
            .fillMaxWidth()
            .height(132.dp)
    )
}

@Composable
private fun CustomerChannelChip(
    label: String,
    active: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = modifier.height(36.dp),
        shape = RoundedCornerShape(18.dp),
        color = if (active) StudioBlue.copy(alpha = 0.14f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.58f),
        border = BorderStroke(1.dp, if (active) StudioBlue.copy(alpha = 0.28f) else Color.Transparent),
        onClick = onClick
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize().padding(horizontal = 8.dp)) {
            Text(
                label,
                color = if (active) StudioBlue else MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 11.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun CommunicationChannelValueField(
    channel: String,
    email: String,
    phone: String,
    instagram: String,
    address: String,
    customValue: String,
    onEmail: (String) -> Unit,
    onPhone: (String) -> Unit,
    onInstagram: (String) -> Unit,
    onAddress: (String) -> Unit,
    onCustom: (String) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    when (communicationChannelKind(channel)) {
        CommunicationChannelKind.Email -> CustomerInlineTextRow(
            label = channel,
            value = email,
            onValueChange = onEmail,
            singleLine = true
        )
        CommunicationChannelKind.Phone -> CustomerInlineTextRow(
            label = channel,
            value = phone,
            onValueChange = onPhone,
            singleLine = true
        )
        CommunicationChannelKind.Instagram -> CustomerInlineTextRow(
            label = channel,
            value = instagram,
            onValueChange = onInstagram,
            singleLine = true
        )
        CommunicationChannelKind.Address -> CustomerInlineTextRow(
            label = channel,
            value = address,
            onValueChange = onAddress,
            minHeight = 72.dp
        )
        CommunicationChannelKind.Custom -> CustomerInlineTextRow(
            label = channel,
            value = customValue,
            onValueChange = onCustom,
            singleLine = true
        )
    }
}

@Composable
private fun WorkflowEditCard(
    order: StudioOrder,
    workspaceSettings: StudioWorkspaceSettings,
    statusOptions: List<String>,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit = { _, _ -> }
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val statuses = statusOptions.ifEmpty {
        listOf("Not Yet", "In Progress", "Pending", "Ready", "Done", "Cancelled", "Design", "Painting", "Shipped")
    }
    var deliveryTime by remember(order.id, order.deliveryTime) { mutableStateOf(order.deliveryTime.coerceAtLeast(1).toString()) }
    var courier by remember(order.id) { mutableStateOf(order.courier) }
    var trackingNumber by remember(order.id) { mutableStateOf(order.trackingNumber) }
    var notes by remember(order.id) { mutableStateOf(order.notes) }
    var riskReason by remember(order.id) { mutableStateOf(order.riskReason.takeUnless { it == "-" }.orEmpty()) }
    var invNotes by remember(order.id) { mutableStateOf(order.invNotes) }
    var statusNotes by remember(order.id, order.customFields) { mutableStateOf(customFieldValue(order, "status::notesSupplier")) }
    val materialLabels = materialDefaultCheckLabels(workspaceSettings)
    val extraStatusSteps = workspaceSettings.customSteps.drop(2).map { it.trim() }.filter { it.isNotBlank() }
    val statusToggles = workspaceSettings.customToggles.map { it.trim() }.filter { it.isNotBlank() }
    val designLabel = workspaceSettings.customSteps.getOrNull(0)?.ifBlank { "Design" } ?: "Design"
    val productionLabel = workspaceSettings.customSteps.getOrNull(1)?.ifBlank { "Production" } ?: "Production"

    DetailCard(title = "Workflow Controls") {
        ChoiceRow(
            label = designLabel,
            value = order.designStatus.ifBlank { "Not Yet" },
            options = statuses,
            onSelect = { onUpdateOrderFields(order, mapOf("designStatus" to it)) },
            onLabelRename = { newLabel -> onUpdateWorkspaceSettings(mapOf("customStepsJSON" to titleArrayJsonForOrder(listOf(newLabel, productionLabel) + extraStatusSteps)), "Heading renamed.") }
        )
        ChoiceRow(
            label = productionLabel,
            value = order.status.ifBlank { "Not Yet" },
            options = statuses,
            onSelect = { onUpdateOrderFields(order, mapOf("paintingStatus" to it)) },
            onLabelRename = { newLabel -> onUpdateWorkspaceSettings(mapOf("customStepsJSON" to titleArrayJsonForOrder(listOf(designLabel, newLabel) + extraStatusSteps)), "Heading renamed.") }
        )
        extraStatusSteps.forEachIndexed { extraIndex, step ->
            ChoiceRow(
                label = step,
                value = statusStepValue(order, step),
                options = statuses,
                onSelect = { onUpdateOrderFields(order, mapOf("details" to mapOf("extraStatuses" to mapOf(step to it)))) },
                onLabelRename = { newLabel -> onUpdateWorkspaceSettings(mapOf("customStepsJSON" to titleArrayJsonForOrder(listOf(designLabel, productionLabel) + extraStatusSteps.toMutableList().also { it[extraIndex] = newLabel })), "Heading renamed.") }
            )
        }
        if (statusToggles.isNotEmpty()) {
            Text(t("Production Toggles"), color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold, fontSize = 12.sp)
            statusToggles.forEach { toggle ->
                YesNoChoiceRow(toggle, statusToggleValue(order, toggle)) {
                    onUpdateOrderFields(order, mapOf("details" to mapOf("customToggles" to mapOf(toggle to it))))
                }
            }
        }
        if (workspaceSettings.showStatusNotesSupplier) {
            OutlinedTextField(
                value = statusNotes,
                onValueChange = { statusNotes = it },
                label = { Text(workspaceSettings.statusNotesSupplierLabel.ifBlank { "Notes / Supplier" }) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(92.dp)
            )
            TextButton(
                onClick = { onUpdateOrderFields(order, mapOf("details" to mapOf("statusNotesSupplier" to statusNotes))) }
            ) {
                Text(t("Save Status Notes"), fontWeight = FontWeight.ExtraBold)
            }
        }
    }
}

@Composable
private fun ChoiceRow(label: String, value: String, options: List<String>, onSelect: (String) -> Unit, onLabelRename: ((String) -> Unit)? = null) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var expanded by remember { mutableStateOf(false) }
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        FinanceRowLabel(label, modifier = Modifier.weight(0.42f), onRename = onLabelRename)
        Box(modifier = Modifier.weight(0.58f)) {
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = MaterialTheme.colorScheme.surfaceVariant,
                onClick = { expanded = true }
            ) {
                Text(
                    text = value,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    color = StudioBlue,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                options.distinct().forEach { option ->
                    DropdownMenuItem(
                        text = { Text(option, fontWeight = if (option == value) FontWeight.ExtraBold else FontWeight.Normal) },
                        onClick = {
                            expanded = false
                            onSelect(option)
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun ToggleChip(label: String, active: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(10.dp),
        color = if (active) StudioBlue.copy(alpha = 0.15f) else MaterialTheme.colorScheme.surfaceVariant,
        border = BorderStroke(1.dp, if (active) StudioBlue.copy(alpha = 0.35f) else Color.Transparent),
        onClick = onClick
    ) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 9.dp),
            color = if (active) StudioBlue else MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 12.sp,
            fontWeight = FontWeight.ExtraBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun YesNoChoiceRow(label: String, value: Boolean, onChange: (Boolean) -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = label,
            modifier = Modifier.weight(1f),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            ToggleChip(label = "Yes", active = value, modifier = Modifier.width(76.dp)) { onChange(true) }
            ToggleChip(label = "No", active = !value, modifier = Modifier.width(76.dp)) { onChange(false) }
        }
    }
}

@Composable
private fun MoneyField(label: String, value: String, onValueChange: (String) -> Unit, modifier: Modifier = Modifier) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        modifier = modifier
    )
}

@Composable
private fun HorizontalRule() {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .height(1.dp),
        color = MaterialTheme.colorScheme.outlineVariant
    ) {}
}

@Composable
private fun SummaryCard(
    order: StudioOrder,
    workspaceSettings: StudioWorkspaceSettings,
    canSeeFinancial: Boolean,
    canEditWorkflow: Boolean = false,
    onUpdateOrderFields: ((StudioOrder, Map<String, Any?>) -> Unit)? = null
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val step1 = summaryStepLabel(workspaceSettings.summaryStep1, workspaceSettings, 0)
    val step2 = summaryStepLabel(workspaceSettings.summaryStep2, workspaceSettings, 1)
    val value1 = summaryStepValue(order, workspaceSettings, step1)
    val value2 = summaryStepValue(order, workspaceSettings, step2)
    DetailCard(title = t("Order Summary")) {
        // A custom order is something we make; a repair is the customer's own item,
        // left with us. Choosing Repair is what brings the intake card out.
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = t("Order Type"),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.weight(1f))
            val isRepair = order.orderType == "repair"
            if (canEditWorkflow && onUpdateOrderFields != null) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    onClick = {
                        onUpdateOrderFields(
                            order,
                            mapOf("details" to mapOf("orderType" to if (isRepair) "custom" else "repair"))
                        )
                    }
                ) {
                    Text(
                        text = t(if (isRepair) "Repair / Service" else "Custom Order"),
                        style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                    )
                }
            } else {
                Text(
                    text = t(if (isRepair) "Repair / Service" else "Custom Order"),
                    style = MaterialTheme.typography.labelLarge
                )
            }
        }
        Spacer(modifier = Modifier.height(10.dp))
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
        ) {
            Column(
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.Top
                ) {
                    SummaryValueBlock(
                        modifier = Modifier.weight(1.05f),
                        label = if (canSeeFinancial) "Order Value" else "Customer",
                        value = if (canSeeFinancial) money(order.orderValue) else order.displayCustomerName.ifBlank { "-" },
                        valueColor = if (canSeeFinancial) StudioGreen else MaterialTheme.colorScheme.onSurface
                    )
                    Column(
                        modifier = Modifier.weight(0.95f),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        SummaryStatusLine(label = step1, value = value1, tone = statusColor(value1))
                        SummaryStatusLine(label = step2, value = value2, tone = statusColor(value2))
                    }
                }
                HorizontalRule()
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    SummaryDateBlock(
                        modifier = Modifier.weight(1f),
                        label = "Placed On",
                        value = shortDate(order.paymentDate),
                        valueColor = MaterialTheme.colorScheme.onSurface
                    )
                    SummaryDateBlock(
                        modifier = Modifier.weight(1f),
                        label = "Delivery In",
                        value = deliveryLabel(order),
                        valueColor = deliveryColor(order)
                    )
                }
                if (order.watchRef.isNotBlank()) {
                    HorizontalRule()
                    InfoRow("Watch Ref", order.watchRef)
                }
            }
        }
    }
}

@Composable
private fun InvoiceItemsCard(
    order: StudioOrder,
    workspaceSettings: StudioWorkspaceSettings,
    canEdit: Boolean,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val exportInvoice = rememberInvoiceExporter(workspaceSettings)
    var footerNote by remember(order.invoiceNote) { mutableStateOf(order.invoiceNote) }
    var footerExpanded by remember(order.invoiceNote) { mutableStateOf(order.invoiceNote.isNotBlank()) }
    val currencySymbol = workspaceSettings.selectedCurrency.ifBlank { "£" }
    fun numText(v: Double) = if (v % 1.0 == 0.0) v.toInt().toString() else v.toString()
    // Editable line-item rows as (name, qtyText, priceText) — string-based for smooth
    // numeric editing; converted to a lineItems patch on Save (backend computes totals).
    var rows by remember(order.id, order.lineItems) {
        mutableStateOf(order.lineItems.map { Triple(it.name, numText(it.quantity), numText(it.unitPrice)) })
    }
    fun persistRows(current: List<Triple<String, String, String>>) {
        val list = current.map { (n, q, p) ->
            mapOf("name" to n, "quantity" to (q.toDoubleOrNull() ?: 0.0), "unitPrice" to (p.toDoubleOrNull() ?: 0.0))
        }
        onUpdateOrderFields(order, mapOf("details" to mapOf("lineItems" to list)))
    }

    DetailCard(title = t("Invoice Items")) {
        if (canEdit) {
            rows.forEachIndexed { index, row ->
                Column(modifier = Modifier.fillMaxWidth().padding(top = 6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = row.first,
                            onValueChange = { v -> rows = rows.toMutableList().also { it[index] = it[index].copy(first = v) } },
                            label = { Text(t("Item")) },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        IconButton(onClick = {
                            val next = rows.toMutableList().also { it.removeAt(index) }
                            rows = next
                            persistRows(next)
                        }) {
                            Text("✕", color = StudioRed, fontSize = 16.sp)
                        }
                    }
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
                    ) {
                        OutlinedTextField(
                            value = row.second,
                            onValueChange = { v -> rows = rows.toMutableList().also { it[index] = it[index].copy(second = v) } },
                            label = { Text(t("Qty")) },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.width(90.dp)
                        )
                        OutlinedTextField(
                            value = row.third,
                            onValueChange = { v -> rows = rows.toMutableList().also { it[index] = it[index].copy(third = v) } },
                            label = { Text(currencySymbol) },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.weight(1f)
                        )
                        Text(
                            pdfMoney((row.second.toDoubleOrNull() ?: 0.0) * (row.third.toDoubleOrNull() ?: 0.0), workspaceSettings),
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 13.sp
                        )
                    }
                }
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
            ) {
                TextButton(onClick = { rows = rows + Triple("", "1", "0") }) {
                    Text("+ " + t("Add Item"))
                }
                Spacer(modifier = Modifier.weight(1f))
                TextButton(onClick = { persistRows(rows) }) {
                    Text(t("Save"))
                }
            }
            InfoRow(t("Total"), pdfMoney(rows.sumOf { (_, q, p) -> (q.toDoubleOrNull() ?: 0.0) * (p.toDoubleOrNull() ?: 0.0) }, workspaceSettings))
        } else {
            if (order.lineItems.isEmpty()) {
                InfoRow(t("Invoice Items"), "-")
            } else {
                order.lineItems.forEach { item ->
                    val q = if (item.quantity == 1.0) "" else " ×" + (if (item.quantity % 1.0 == 0.0) item.quantity.toInt().toString() else String.format("%.2f", item.quantity))
                    InfoRow(item.name.ifBlank { "-" } + q, pdfMoney(item.lineTotal, workspaceSettings))
                }
                InfoRow(t("Total"), pdfMoney(order.lineItemsTotal, workspaceSettings))
            }
        }


        if (canEdit) {
            Spacer(modifier = Modifier.height(10.dp))
            TextButton(onClick = { footerExpanded = !footerExpanded }) {
                Text(
                    (if (footerExpanded) "− " else "+ ") + t("Invoice Note"),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
            if (footerExpanded) {
                OutlinedTextField(
                    value = footerNote,
                    onValueChange = { footerNote = it },
                    placeholder = { Text(t("Thank-you note or message for this invoice")) },
                    minLines = 3,
                    modifier = Modifier.fillMaxWidth()
                )
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = { onUpdateOrderFields(order, mapOf("details" to mapOf("invoiceNote" to footerNote.trim()))) }) {
                        Text(t("Save"))
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))
        Button(onClick = { exportInvoice(order) }, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Filled.Description, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text(t("Invoice PDF"))
        }
    }
}

@Composable
private fun CustomerCard(order: StudioOrder, workspaceSettings: StudioWorkspaceSettings) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val channelLabels = communicationChannelLabels(workspaceSettings)
    DetailCard(title = t("Customer & Communication")) {
        InfoRow(t("Customer Name"), order.displayCustomerName)
        InfoRow("Design Name", order.designName.ifBlank { "-" })
        InfoRow("Design Link", order.designLink.ifBlank { "-" })
        if (workspaceSettings.communicationShowEmail) InfoRow("Email", order.emailAddress.ifBlank { "-" })
        if (workspaceSettings.communicationShowTelephone) InfoRow("Telephone", order.whatsappNumber.ifBlank { "-" })
        if (workspaceSettings.communicationShowAddress) InfoRow("Address", customFieldValue(order, "communicationAddress").ifBlank { "-" })
        if (workspaceSettings.communicationShowChannel) {
            InfoRow(t("Channel"), order.communication.joinToString(" · ").ifBlank { "-" })
            channelLabels.filter { label -> order.communication.any { it.equals(label, ignoreCase = true) } }.forEach { channel ->
                InfoRow(channel, communicationChannelDisplayValue(order, channel).ifBlank { "-" })
            }
        }
        if (workspaceSettings.communicationShowCustomerNotes) {
            InfoRow(t("Customer Notes"), customFieldValue(order, "communicationCustomerNotes").ifBlank { "-" })
        }
        orderedCustomFieldsForDisplay(order.customFields, workspaceSettings.customFields).forEach { (key, value) ->
            InfoRow(key, value.ifBlank { "-" })
        }
    }
}

@Composable
private fun TimelineDeliveryCard(
    order: StudioOrder,
    canEditWorkflow: Boolean,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val context = LocalContext.current
    var deliveryDays by remember(order.id, order.deliveryTime) { mutableStateOf(order.deliveryTime.coerceAtLeast(1)) }
    var createdDateText by remember(order.id, order.paymentDate) { mutableStateOf(longDate(order.paymentDate)) }
    val previewDueDate = remember(order.paymentDate, deliveryDays) {
        Date(order.paymentDate.time + deliveryDays.coerceAtLeast(1) * DAY_MS)
    }
    fun saveTimeline(nextDays: Int = deliveryDays) {
        val cleanDays = nextDays.coerceIn(1, 730)
        deliveryDays = cleanDays
        val details = mutableMapOf<String, Any?>("deliveryTime" to cleanDays)
        dateInputToISODate(createdDateText)?.let { details["paymentDate"] = it }
        onUpdateOrderFields(order, mapOf("details" to details))
    }

    DetailCard(title = "Timeline & Delivery") {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
        ) {
            Column(
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                    TimelineDateTile(
                        modifier = Modifier.weight(1f),
                        label = "Created Date",
                        value = shortDate(order.paymentDate),
                        accent = StudioBlue
                    )
                    TimelineDateTile(
                        modifier = Modifier.weight(1f),
                        label = "Delivery Due",
                        value = shortDate(previewDueDate),
                        accent = StudioRed
                    )
                }
                TimelineRemainingPanel(order = order)
                TimelineCalendarAction(onClick = { openDeliveryCalendarEvent(context, order) })
                HorizontalRule()
                TimelineDeliveryDaysRow(
                    days = deliveryDays,
                    canEdit = canEditWorkflow,
                    onChange = { next -> saveTimeline(next) }
                )
                TimelineCreatedDateRow(
                    value = createdDateText,
                    canEdit = canEditWorkflow,
                    onValueChange = { createdDateText = it },
                    onSave = { saveTimeline() }
                )
            }
        }
    }
}

@Composable
private fun TimelineDateTile(modifier: Modifier, label: String, value: String, accent: Color) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = modifier.height(86.dp),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.62f)
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 13.dp),
            verticalArrangement = Arrangement.spacedBy(9.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(
                    imageVector = Icons.Filled.TableChart,
                    contentDescription = null,
                    modifier = Modifier.size(15.dp),
                    tint = accent
                )
                Text(
                    label,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Text(
                value,
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 17.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun TimelineRemainingPanel(order: StudioOrder) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val tone = deliveryColor(order)
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .height(88.dp),
        shape = RoundedCornerShape(14.dp),
        color = tone.copy(alpha = 0.10f)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(13.dp)
        ) {
            Surface(shape = RoundedCornerShape(18.dp), color = tone) {
                Icon(
                    imageVector = Icons.Filled.Timeline,
                    contentDescription = null,
                    modifier = Modifier.padding(7.dp).size(16.dp),
                    tint = Color.White
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    "Time Remaining",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.ExtraBold
                )
                Text(
                    deliveryLongLabel(order),
                    color = tone,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.ExtraBold
                )
            }
        }
    }
}

@Composable
private fun TimelineCalendarAction(onClick: () -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f)
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                color = StudioRed.copy(alpha = 0.10f),
                onClick = onClick
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 11.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(9.dp)
                ) {
                    Icon(
                        imageVector = Icons.Filled.TableChart,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = StudioRed
                    )
                    Text(
                        "Add to Calendar",
                        color = StudioRed,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                }
            }
            Text(
                "Creates an all-day Android Calendar event from the created date to the delivery due date.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                fontWeight = FontWeight.SemiBold
            )
        }
    }
}

@Composable
private fun TimelineDeliveryDaysRow(days: Int, canEdit: Boolean, onChange: (Int) -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        FinanceRowLabel("Delivery Time", modifier = Modifier.weight(1f))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                TimelineStepperButton("+", enabled = canEdit) { onChange(days + 1) }
                TimelineStepperButton("-", enabled = canEdit) { onChange(days - 1) }
            }
            Surface(
                shape = RoundedCornerShape(18.dp),
                color = StudioRed.copy(alpha = 0.10f)
            ) {
                Text(
                    "${days.coerceAtLeast(1)} days",
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    color = StudioRed,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.ExtraBold
                )
            }
        }
    }
}

@Composable
private fun TimelineStepperButton(label: String, enabled: Boolean, onClick: () -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = Modifier.size(width = 30.dp, height = 24.dp),
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = if (enabled) 0.82f else 0.36f),
        onClick = { if (enabled) onClick() }
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
            Text(
                label,
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 16.sp,
                fontWeight = FontWeight.ExtraBold,
                lineHeight = 16.sp
            )
        }
    }
}

@Composable
private fun TimelineCreatedDateRow(
    value: String,
    canEdit: Boolean,
    onValueChange: (String) -> Unit,
    onSave: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        FinanceRowLabel("Created Date", modifier = Modifier.weight(0.42f))
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            enabled = canEdit,
            singleLine = true,
            textStyle = TextStyle(
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold
            ),
            shape = RoundedCornerShape(10.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.56f),
                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.56f),
                disabledContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.32f),
                focusedBorderColor = Color.Transparent,
                unfocusedBorderColor = Color.Transparent,
                disabledBorderColor = Color.Transparent,
                cursorColor = StudioBlue
            ),
            modifier = Modifier
                .weight(0.45f)
                .height(48.dp)
        )
        TextButton(onClick = onSave, enabled = canEdit, modifier = Modifier.weight(0.25f)) {
            Text(t("Save"), fontWeight = FontWeight.ExtraBold)
        }
    }
}

@Composable
private fun PriorityRiskCard(
    order: StudioOrder,
    workspaceSettings: StudioWorkspaceSettings,
    canEditWorkflow: Boolean,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit = { _, _ -> }
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var riskReason by remember(order.id) {
        mutableStateOf(order.riskReason.takeUnless { it == "-" }.orEmpty())
    }
    DetailCard(title = "Priority / Risk") {
        if (canEditWorkflow) {
            ChoiceRow(
                label = workspaceSettings.priorityCardLabel.ifBlank { "Priority" },
                value = order.priority.ifBlank { "Normal" },
                options = priorityOptions(),
                onSelect = { onUpdateOrderFields(order, mapOf("details" to mapOf("priority" to it))) },
                onLabelRename = { onUpdateWorkspaceSettings(mapOf("priorityCardLabel" to it), "Heading renamed.") }
            )
            ChoiceRow(
                label = workspaceSettings.riskCardLabel.ifBlank { "Risk" },
                value = order.risk.ifBlank { "None" },
                options = riskOptions(),
                onSelect = { onUpdateOrderFields(order, mapOf("details" to mapOf("risk" to it))) },
                onLabelRename = { onUpdateWorkspaceSettings(mapOf("riskCardLabel" to it), "Heading renamed.") }
            )
            if (order.risk.ifBlank { "None" } != "None") {
                OutlinedTextField(
                    value = riskReason,
                    onValueChange = { riskReason = it },
                    label = { Text(t("Reason / blocker note")) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(92.dp)
                )
                TextButton(
                    onClick = {
                        onUpdateOrderFields(order, mapOf("details" to mapOf("riskReason" to riskReason.trim().ifBlank { "-" })))
                    }
                ) {
                    Text(t("Save Risk Reason"), fontWeight = FontWeight.ExtraBold)
                }
            }
        } else {
            InfoRow("Priority", order.priority.ifBlank { "Normal" }, priorityColor(order.priority))
            InfoRow("Risk", order.risk.ifBlank { "None" }, riskColor(order.risk))
            if (order.riskReason.isNotBlank() && order.riskReason != "-") {
                InfoRow("Risk Reason", order.riskReason)
            }
        }
    }
}

@Composable
private fun MaterialsInventoryCard(
    order: StudioOrder,
    workspaceSettings: StudioWorkspaceSettings,
    canEditWorkflow: Boolean,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit = { _, _ -> }
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var invNotes by remember(order.id) { mutableStateOf(order.invNotes) }
    val materialLabels = materialDefaultCheckLabels(workspaceSettings)
    val notesLabel = workspaceSettings.materialsNotesSupplierLabel.ifBlank { "Notes / Supplier" }
    LaunchedEffect(canEditWorkflow, invNotes, order.invNotes) {
        if (canEditWorkflow && invNotes != order.invNotes) {
            delay(650)
            onUpdateOrderFields(order, mapOf("details" to mapOf("invNotes" to invNotes)))
        }
    }

    DetailCard(title = t("Materials & Inventory")) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.62f))
        ) {
            Column(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(15.dp)
            ) {
                materialLabels.forEachIndexed { index, label ->
                    MaterialsYesNoRow(
                        label = label,
                        value = materialDefaultToggleValue(order, index, label),
                        enabled = canEditWorkflow,
                        onChange = {
                            onUpdateOrderFields(order, materialDefaultTogglePayload(index, label, it))
                        },
                        onLabelRename = { newLabel -> onUpdateWorkspaceSettings(mapOf("materialsDefaultChecksJSON" to titleArrayJsonForOrder(materialLabels.toMutableList().also { it[index] = newLabel })), "Heading renamed.") }
                    )
                }
                workspaceSettings.materialsToggles.forEach { label ->
                    MaterialsYesNoRow(
                        label = label,
                        value = order.customToggles["materials::$label"] == true,
                        enabled = canEditWorkflow,
                        onChange = {
                            onUpdateOrderFields(order, mapOf("details" to mapOf("materialsToggles" to mapOf(label to it))))
                        }
                    )
                }
                if (order.companyId.isNotBlank() && order.id.isNotBlank()) {
                    HorizontalRule()
                    uk.co.eggcraft.studioflow.features.inventory.OrderStockSection(
                        workspaceId = order.companyId,
                        orderId = order.id,
                        currencySymbol = workspaceSettings.selectedCurrency,
                        canEdit = canEditWorkflow,
                        onUseAsBaseCost = { total ->
                            onUpdateOrderFields(order, mapOf("finance" to mapOf("watchPurchasePrice" to total)))
                        }
                    )
                }
                if (workspaceSettings.showMaterialsNotesSupplier) {
                    HorizontalRule()
                    Text(
                        notesLabel,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                    if (canEditWorkflow) {
                        OutlinedTextField(
                            value = invNotes,
                            onValueChange = { invNotes = it.take(1500) },
                            placeholder = { Text(t(t("Add notes or supplier details..."))) },
                            textStyle = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
                            shape = RoundedCornerShape(10.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.75f),
                                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.75f),
                                focusedBorderColor = Color.Transparent,
                                unfocusedBorderColor = Color.Transparent,
                                cursorColor = StudioBlue
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(132.dp)
                        )
                    } else {
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(112.dp),
                            shape = RoundedCornerShape(10.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.75f)
                        ) {
                            Text(
                                order.invNotes.ifBlank { "No notes or supplier details." },
                                modifier = Modifier.padding(14.dp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold,
                                lineHeight = 18.sp
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MaterialsYesNoRow(
    label: String,
    value: Boolean,
    enabled: Boolean,
    onChange: (Boolean) -> Unit,
    onLabelRename: ((String) -> Unit)? = null
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        FinanceRowLabel(label, modifier = Modifier.weight(1f), onRename = onLabelRename)
        MaterialsBinaryChip(
            label = "Yes",
            active = value,
            activeColor = StudioGreen,
            enabled = enabled,
            onClick = { onChange(true) }
        )
        MaterialsBinaryChip(
            label = "No",
            active = !value,
            activeColor = StudioRed,
            enabled = enabled,
            onClick = { onChange(false) }
        )
    }
}

@Composable
private fun MaterialsBinaryChip(
    label: String,
    active: Boolean,
    activeColor: Color,
    enabled: Boolean,
    onClick: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = Modifier
            .width(66.dp)
            .height(42.dp),
        shape = RoundedCornerShape(10.dp),
        color = if (active) activeColor.copy(alpha = 0.12f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.58f),
        border = BorderStroke(1.dp, if (active) activeColor.copy(alpha = 0.48f) else Color.Transparent),
        onClick = { if (enabled) onClick() }
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
            Text(
                label,
                color = if (active) activeColor else MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 14.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1
            )
        }
    }
}

@Composable
private fun PriorityMaterialsCard(order: StudioOrder) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    DetailCard(title = "Priority, Risk & Materials") {
        InfoRow("Priority", order.priority.ifBlank { "Normal" }, priorityColor(order.priority))
        InfoRow("Risk", order.risk.ifBlank { "None" }, riskColor(order.risk))
        if (order.riskReason.isNotBlank() && order.riskReason != "-") {
            InfoRow("Risk Reason", order.riskReason)
        }
        Spacer(modifier = Modifier.height(6.dp))
        BooleanRow("Inventory 1", order.invBool1)
        BooleanRow("Inventory 2", order.invBool2)
        BooleanRow("Inventory 3", order.invBool3)
        BooleanRow("Inventory 4", order.invBool4)
        if (order.invNotes.isNotBlank()) InfoRow("Inventory Notes", order.invNotes)
    }
}

@Composable
private fun FinancialCard(
    order: StudioOrder,
    workspaceSettings: StudioWorkspaceSettings,
    canEditFinance: Boolean,
    advancedEnabled: Boolean,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit = { _, _ -> }
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var paidAmount by remember(order.id, order.paidAmount) { mutableStateOf(decimalText(order.paidAmount)) }
    var remainingAmount by remember(order.id, order.remainingAmount) { mutableStateOf(decimalText(order.remainingAmount)) }
    var baseCost by remember(order.id, order.watchPurchasePrice) { mutableStateOf(decimalText(order.watchPurchasePrice)) }
    var deliveryCost by remember(order.id, order.deliveryCost) { mutableStateOf(decimalText(order.deliveryCost)) }
    var taxRate by remember(order.id, order.taxRate) { mutableStateOf(decimalText(order.taxRate)) }
    var paymentMethod by remember(order.id, order.paymentMethod) { mutableStateOf(order.paymentMethod.ifBlank { "Card" }) }
    val revenueTaxLabel = workspaceSettings.taxRuleNameRevenue.ifBlank { "Revenue" }
    val profitTaxLabel = workspaceSettings.taxRuleNameProfit.ifBlank { "Profit" }
    var taxType by remember(order.id, order.taxType) {
        mutableStateOf(if (order.taxType == "Profit") "Profit" else "Revenue")
    }
    val remainingItems = remember(order.id, order.customFields, workspaceSettings.financialRemainingItems) {
        orderFinancialItems(order, ORDER_REMAINING_ITEMS_KEY, "Pending", workspaceSettings.financialRemainingItems)
    }
    val expenseItems = remember(order.id, order.customFields, workspaceSettings.financialExpenseItems) {
        orderFinancialItems(order, ORDER_EXPENSE_ITEMS_KEY, "Cost", workspaceSettings.financialExpenseItems)
    }
    val baseCostLabelValue = remember(order.id, order.customFields, workspaceSettings.financialBaseCostLabel) {
        orderBaseCostLabelValue(order, workspaceSettings.financialBaseCostLabel)
    }
    var customRemainingInputs by remember(order.id, order.customFields, remainingItems) {
        mutableStateOf(remainingItems.associate { it.title to decimalText(financialCustomValue(order, "financialRemaining::", it.title)) })
    }
    var customExpenseInputs by remember(order.id, order.customFields, expenseItems) {
        mutableStateOf(expenseItems.associate { it.title to decimalText(financialCustomValue(order, "financialExpense::", it.title)) })
    }
    val finalProfit = financialFinalProfit(order, workspaceSettings)
    val outstandingPayment = order.remainingAmount + remainingItems.sumOf { financialCustomValue(order, "financialRemaining::", it.title) }
    val fullPaymentReceived = outstandingPayment <= 0.009
    var showPaymentForm by remember(order.id) { mutableStateOf(false) }
    var paymentAmountInput by remember(order.id) { mutableStateOf("") }
    var paymentMethodInput by remember(order.id) { mutableStateOf("Deposit") }
    var paymentNoteInput by remember(order.id) { mutableStateOf("") }

    fun recordPayment() {
        val amt = parseDecimal(paymentAmountInput, 0.0)
        if (amt <= 0.0) return
        onUpdateOrderFields(
            order,
            mapOf("finance" to mapOf("recordPayment" to mapOf(
                "amount" to amt,
                "method" to paymentMethodInput,
                "note" to paymentNoteInput.trim()
            )))
        )
        paymentAmountInput = ""
        paymentNoteInput = ""
        showPaymentForm = false
    }

    fun deletePayment(paymentId: String) {
        onUpdateOrderFields(order, mapOf("finance" to mapOf("deletePaymentId" to paymentId)))
    }

    fun saveFinance(markFullPayment: Boolean = false) {
        val parsedPaid = parseDecimal(paidAmount, order.paidAmount)
        val currentOrderValue = order.paidAmount + order.remainingAmount
        val finance = mutableMapOf<String, Any?>(
            "paidAmount" to parsedPaid,
            "watchPurchasePrice" to parseDecimal(baseCost, order.watchPurchasePrice)
        )
        // Raise the order value when the paid amount exceeds it, so the backend
        // does not clamp paidAmount back down (mirrors the web client).
        if (parsedPaid > currentOrderValue) {
            finance["orderValue"] = parsedPaid
        }
        if (advancedEnabled) {
            finance["remainingAmount"] = parseDecimal(remainingAmount, order.remainingAmount)
            finance["deliveryCost"] = parseDecimal(deliveryCost, order.deliveryCost)
            finance["taxRate"] = parseDecimal(taxRate, order.taxRate)
            finance["taxType"] = taxType
            finance["paymentMethod"] = paymentMethod.trim().ifBlank { "Card" }
            finance["financialRemainingValues"] = remainingItems.associate { item ->
                item.title to parseDecimal(customRemainingInputs[item.title].orEmpty(), financialCustomValue(order, "financialRemaining::", item.title))
            }
            finance["financialExpenseValues"] = expenseItems.associate { item ->
                item.title to parseDecimal(customExpenseInputs[item.title].orEmpty(), financialCustomValue(order, "financialExpense::", item.title))
            }
            if (markFullPayment) {
                finance["fullPaymentReceived"] = true
                finance["financialRemainingValues"] = remainingItems.associate { it.title to 0.0 }
            }
        }
        onUpdateOrderFields(order, mapOf("finance" to finance))
    }

    // Per-order heading edits (rename keeps the id so the backend moves the amount).
    fun renameExpenseItem(id: String, newTitle: String) {
        if (newTitle.trim().isBlank()) return
        saveOrderFinancialList(order, ORDER_EXPENSE_ITEMS_KEY, expenseItems.map { if (it.id == id) it.copy(title = newTitle.trim().take(120)) else it }, onUpdateOrderFields)
    }
    fun removeExpenseItem(id: String) {
        saveOrderFinancialList(order, ORDER_EXPENSE_ITEMS_KEY, expenseItems.filterNot { it.id == id }, onUpdateOrderFields)
    }
    fun addExpenseItem() {
        saveOrderFinancialList(order, ORDER_EXPENSE_ITEMS_KEY, expenseItems + StudioHeadingItem(java.util.UUID.randomUUID().toString(), nextFinancialDefaultTitle(expenseItems, t("Spending"))), onUpdateOrderFields)
    }
    fun renameRemainingItem(id: String, newTitle: String) {
        if (newTitle.trim().isBlank()) return
        saveOrderFinancialList(order, ORDER_REMAINING_ITEMS_KEY, remainingItems.map { if (it.id == id) it.copy(title = newTitle.trim().take(120)) else it }, onUpdateOrderFields)
    }
    fun removeRemainingItem(id: String) {
        saveOrderFinancialList(order, ORDER_REMAINING_ITEMS_KEY, remainingItems.filterNot { it.id == id }, onUpdateOrderFields)
    }
    fun addRemainingItem() {
        saveOrderFinancialList(order, ORDER_REMAINING_ITEMS_KEY, remainingItems + StudioHeadingItem(java.util.UUID.randomUUID().toString(), nextFinancialDefaultTitle(remainingItems, t("Remaining"))), onUpdateOrderFields)
    }

    DetailCard(title = t("Financial Info")) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
        ) {
            Column(
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                FinanceMoneyInlineRow(
                    label = "Paid",
                    value = paidAmount,
                    onValueChange = { paidAmount = cleanDecimalInput(it) },
                    valueColor = StudioGreen,
                    enabled = canEditFinance,
                    onCommit = { saveFinance() }
                )
                FinanceMoneyInlineRow(
                    label = "Remaining",
                    value = remainingAmount,
                    onValueChange = { remainingAmount = cleanDecimalInput(it) },
                    valueColor = StudioGreen,
                    enabled = canEditFinance && advancedEnabled,
                    onCommit = { saveFinance() }
                )
                if (advancedEnabled) {
                    remainingItems.forEach { item ->
                        FinanceMoneyInlineRow(
                            label = item.title,
                            value = customRemainingInputs[item.title].orEmpty(),
                            onValueChange = { value ->
                                customRemainingInputs = customRemainingInputs.toMutableMap().also { map ->
                                    map[item.title] = cleanDecimalInput(value)
                                }
                            },
                            valueColor = StudioGreen,
                            enabled = canEditFinance,
                            onCommit = { saveFinance() },
                            onLabelRename = if (canEditFinance) ({ newTitle: String -> renameRemainingItem(item.id, newTitle) }) else null,
                            onRemove = if (canEditFinance) ({ removeRemainingItem(item.id) }) else null
                        )
                    }
                    if (canEditFinance) {
                        FinanceAddHeadingButton(label = t("Remaining")) { addRemainingItem() }
                    }
                }
                if (advancedEnabled) {
                    FinanceYesNoInlineRow(
                        label = "Full Payment\nReceived?",
                        value = fullPaymentReceived,
                        enabled = canEditFinance && !fullPaymentReceived,
                        onChange = { selected ->
                            if (selected) saveFinance(markFullPayment = true)
                        }
                    )
                    FinanceSelectInlineRow(
                        label = "Payment Method",
                        value = paymentMethod,
                        options = listOf("Card", "Cash", "Bank Transfer", "PayPal", "Apple Pay", "Other"),
                        enabled = canEditFinance,
                        onSelect = { selected ->
                            paymentMethod = selected
                            onUpdateOrderFields(order, mapOf("finance" to mapOf("paymentMethod" to selected)))
                        }
                    )
                    PaymentLedgerSection(
                        order = order,
                        canEditFinance = canEditFinance,
                        showForm = showPaymentForm,
                        amountInput = paymentAmountInput,
                        methodInput = paymentMethodInput,
                        noteInput = paymentNoteInput,
                        onToggleForm = { showPaymentForm = !showPaymentForm },
                        onAmountChange = { paymentAmountInput = cleanDecimalInput(it) },
                        onMethodChange = { paymentMethodInput = it },
                        onNoteChange = { paymentNoteInput = it },
                        onAdd = { recordPayment() },
                        onDelete = { deletePayment(it) },
                        onEditNote = { paymentId, note ->
                            onUpdateOrderFields(
                                order,
                                mapOf("finance" to mapOf("updatePaymentNote" to mapOf("id" to paymentId, "note" to note)))
                            )
                        }
                    )
                }
                HorizontalRule()
                if (workspaceSettings.financialShowBaseCost || !advancedEnabled) {
                    FinanceMoneyInlineRow(
                        label = baseCostLabelValue,
                        value = baseCost,
                        onValueChange = { baseCost = cleanDecimalInput(it) },
                        valueColor = StudioRed,
                        enabled = canEditFinance,
                        onCommit = { saveFinance() },
                        onLabelRename = if (canEditFinance) ({ newLabel: String -> setOrderBaseCostLabel(order, newLabel, onUpdateOrderFields) }) else null
                    )
                }
                if (advancedEnabled) {
                    expenseItems.forEach { item ->
                        FinanceMoneyInlineRow(
                            label = item.title,
                            value = customExpenseInputs[item.title].orEmpty(),
                            onValueChange = { value ->
                                customExpenseInputs = customExpenseInputs.toMutableMap().also { map ->
                                    map[item.title] = cleanDecimalInput(value)
                                }
                            },
                            valueColor = StudioRed,
                            enabled = canEditFinance,
                            onCommit = { saveFinance() },
                            onLabelRename = if (canEditFinance) ({ newTitle: String -> renameExpenseItem(item.id, newTitle) }) else null,
                            onRemove = if (canEditFinance) ({ removeExpenseItem(item.id) }) else null
                        )
                    }
                    if (canEditFinance) {
                        FinanceAddHeadingButton(label = t("Spending")) { addExpenseItem() }
                    }
                    FinanceDisplayInlineRow(
                        label = "Platform Fee",
                        value = money(order.paymentFee),
                        valueColor = StudioRed,
                        muted = true
                    )
                    FinanceMoneyInlineRow(
                        label = "Shipping Cost",
                        value = deliveryCost,
                        onValueChange = { deliveryCost = cleanDecimalInput(it) },
                        valueColor = StudioRed,
                        enabled = canEditFinance,
                        onCommit = { saveFinance() }
                    )
                    HorizontalRule()
                    FinanceSelectInlineRow(
                        label = "VAT Rule",
                        value = if (taxType == "Profit") profitTaxLabel else revenueTaxLabel,
                        options = listOf(revenueTaxLabel, profitTaxLabel),
                        enabled = canEditFinance,
                        onSelect = { selected ->
                            taxType = if (selected == profitTaxLabel) "Profit" else "Revenue"
                            onUpdateOrderFields(
                                order,
                                mapOf("finance" to mapOf("taxType" to if (selected == profitTaxLabel) "Profit" else "Revenue"))
                            )
                        }
                    )
                    FinanceMoneyInlineRow(
                        label = "VAT Rate (%)",
                        value = taxRate,
                        onValueChange = { taxRate = cleanDecimalInput(it) },
                        valueColor = StudioRed,
                        enabled = canEditFinance,
                        showCurrency = false,
                        dangerSurface = true,
                        onCommit = { saveFinance() }
                    )
                    FinanceDisplayInlineRow(
                        label = "VAT Amount",
                        value = money(order.taxAmount),
                        valueColor = StudioRed,
                        muted = true
                    )
                    HorizontalRule()
                } else {
                    FinanceDisplayInlineRow(
                        label = "Basic Balance",
                        value = money(parseDecimal(paidAmount, order.paidAmount) - parseDecimal(baseCost, order.watchPurchasePrice)),
                        valueColor = StudioGreen,
                        muted = false
                    )
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(40.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.56f)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 11.dp, vertical = 7.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(7.dp)
                        ) {
                            Icon(Icons.Filled.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(12.dp))
                            Text(t("Advanced finance"), color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold, fontSize = 11.sp)
                            Spacer(modifier = Modifier.weight(1f))
                            Text("Pro", color = StudioBlue, fontWeight = FontWeight.ExtraBold, fontSize = 10.sp)
                        }
                    }
                    HorizontalRule()
                }
                if (advancedEnabled) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            t("Order Value"),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.weight(1f)
                        )
                        Text(
                            money(order.paidAmount + order.remainingAmount),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                    if (workspaceSettings.corporationTaxEnabled) {
                        val corporationTax = kotlin.math.round(maxOf(0.0, finalProfit) * workspaceSettings.corporationTaxRate) / 100.0
                        FinanceDisplayInlineRow(
                            label = t("Profit before Corporation Tax"),
                            value = money(finalProfit),
                            valueColor = MaterialTheme.colorScheme.onSurface,
                            muted = false
                        )
                        FinanceDisplayInlineRow(
                            label = "${t("Corporation Tax")} (${workspaceSettings.corporationTaxRate.toInt()}%, ${t("est.")})",
                            value = money(corporationTax),
                            valueColor = StudioRed,
                            muted = true
                        )
                        FinanceFinalProfitRow(finalProfit = finalProfit - corporationTax, label = t("Net Profit (after CT)"))
                    } else {
                        FinanceFinalProfitRow(finalProfit = finalProfit)
                    }
                }
            }
        }
    }
}

@Composable
private fun PaymentLedgerSection(
    order: StudioOrder,
    canEditFinance: Boolean,
    showForm: Boolean,
    amountInput: String,
    methodInput: String,
    noteInput: String,
    onToggleForm: () -> Unit,
    onAmountChange: (String) -> Unit,
    onMethodChange: (String) -> Unit,
    onNoteChange: (String) -> Unit,
    onAdd: () -> Unit,
    onDelete: (String) -> Unit,
    onEditNote: (String, String) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val dateFormatter = remember(lang) {
        java.text.SimpleDateFormat("dd MMM yyyy", uk.co.eggcraft.studioflow.language.studioLocale(lang))
    }
    // Per-entry note editing — works for every ledger entry, including payments
    // that arrived automatically from the WooCommerce/Shopify webhooks.
    var editingNoteId by remember(order.id) { mutableStateOf<String?>(null) }
    var editingNoteText by remember(order.id) { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                t("Payments"),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold
            )
            if (order.payments.isNotEmpty()) {
                Spacer(modifier = Modifier.width(6.dp))
                Surface(shape = RoundedCornerShape(999.dp), color = StudioGreen.copy(alpha = 0.18f)) {
                    Text(
                        "${order.payments.size}",
                        modifier = Modifier.padding(horizontal = 7.dp, vertical = 1.dp),
                        color = StudioGreen,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                }
            }
            Spacer(modifier = Modifier.weight(1f))
            if (canEditFinance) {
                Text(
                    if (showForm) t("Close") else "+ ${t("Add Payment")}",
                    color = StudioGreen,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.clickable { onToggleForm() }
                )
            }
        }
        if (showForm) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedTextField(
                    value = amountInput,
                    onValueChange = onAmountChange,
                    label = { Text(t("Amount")) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth()
                )
                FinanceSelectInlineRow(
                    label = "Method",
                    value = methodInput,
                    options = listOf("Deposit", "Card", "Cash", "Bank Transfer", "PayPal", "Apple Pay", "Final", "Other"),
                    enabled = true,
                    onSelect = onMethodChange
                )
                OutlinedTextField(
                    value = noteInput,
                    onValueChange = onNoteChange,
                    label = { Text(t("Note")) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = StudioGreen,
                    modifier = Modifier.clickable { onAdd() }
                ) {
                    Text(
                        t("Add"),
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp
                    )
                }
            }
        }
        order.payments.forEach { payment ->
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = StudioGreen.copy(alpha = 0.08f)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = StudioGreen, modifier = Modifier.size(14.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(money(payment.amount), fontSize = 13.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                        if (editingNoteId == payment.id) {
                            OutlinedTextField(
                                value = editingNoteText,
                                onValueChange = { editingNoteText = it },
                                label = { Text(t("Note")) },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 4.dp)) {
                                Text(
                                    t("Save"),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = StudioGreen,
                                    modifier = Modifier.clickable {
                                        onEditNote(payment.id, editingNoteText.trim())
                                        editingNoteId = null
                                    }
                                )
                                Text(
                                    t("Cancel"),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.clickable { editingNoteId = null }
                                )
                            }
                        } else {
                            val meta = buildList {
                                payment.date?.let { add(dateFormatter.format(it)) }
                                if (payment.method.isNotBlank()) add(payment.method)
                                if (payment.note.isNotBlank()) add(payment.note)
                            }.joinToString("  ·  ")
                            if (meta.isNotBlank()) {
                                Text(meta, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                    if (canEditFinance && editingNoteId != payment.id) {
                        Icon(
                            Icons.Filled.Edit,
                            contentDescription = "Edit payment note",
                            tint = StudioBlue.copy(alpha = 0.75f),
                            modifier = Modifier.size(16.dp).clickable {
                                editingNoteText = payment.note
                                editingNoteId = payment.id
                            }
                        )
                        Icon(
                            Icons.Filled.Delete,
                            contentDescription = "Remove payment",
                            tint = StudioRed.copy(alpha = 0.7f),
                            modifier = Modifier.size(16.dp).clickable { onDelete(payment.id) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun FinanceMoneyInlineRow(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    valueColor: Color,
    enabled: Boolean,
    showCurrency: Boolean = true,
    dangerSurface: Boolean = false,
    onCommit: () -> Unit = {},
    onLabelRename: ((String) -> Unit)? = null,
    onRemove: (() -> Unit)? = null
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val currencySymbol = LocalCurrencySymbol.current
    val decimalSeparator = LocalDecimalSeparator.current
    val hideSensitiveNumbers = LocalHideSensitiveNumbers.current
    val focusManager = LocalFocusManager.current
    var isFocused by remember { mutableStateOf(false) }
    var skipNextBlurCommit by remember { mutableStateOf(false) }
    fun commitAndClearFocus() {
        onCommit()
        skipNextBlurCommit = true
        focusManager.clearFocus()
    }
    val displayValue = when {
        hideSensitiveNumbers -> "••••"
        isFocused -> value
        else -> formattedDecimalInput(value, decimalSeparator)
    }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        FinanceRowLabel(label, modifier = Modifier.weight(0.42f), onRename = onLabelRename)
        OutlinedTextField(
            value = displayValue,
            onValueChange = { next -> if (!hideSensitiveNumbers) onValueChange(next) },
            enabled = enabled && !hideSensitiveNumbers,
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Decimal,
                imeAction = ImeAction.Done
            ),
            keyboardActions = KeyboardActions(
                onDone = {
                    commitAndClearFocus()
                }
            ),
            textStyle = TextStyle(
                color = valueColor,
                fontSize = 15.sp,
                fontWeight = FontWeight.ExtraBold
            ),
            prefix = if (showCurrency) {
                {
                    Text(
                        currencySymbol,
                        color = valueColor,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                }
            } else {
                null
            },
            shape = RoundedCornerShape(10.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = if (dangerSurface) StudioRed.copy(alpha = 0.06f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.75f),
                unfocusedContainerColor = if (dangerSurface) StudioRed.copy(alpha = 0.06f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.75f),
                disabledContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f),
                focusedBorderColor = Color.Transparent,
                unfocusedBorderColor = Color.Transparent,
                disabledBorderColor = Color.Transparent,
                cursorColor = valueColor,
                focusedTextColor = valueColor,
                unfocusedTextColor = valueColor,
                disabledTextColor = valueColor.copy(alpha = 0.45f)
            ),
            modifier = Modifier
                .weight(0.58f)
                .height(48.dp)
                .onFocusChanged { focusState ->
                    if (isFocused && !focusState.isFocused) {
                        if (skipNextBlurCommit) {
                            skipNextBlurCommit = false
                        } else {
                            onCommit()
                        }
                    }
                    if (!isFocused && focusState.isFocused && isZeroLikeDecimalInput(value)) {
                        onValueChange("")
                    }
                    isFocused = focusState.isFocused
                }
                .onPreviewKeyEvent { event ->
                    if (event.type == KeyEventType.KeyUp && event.key == Key.Enter) {
                        commitAndClearFocus()
                        true
                    } else {
                        false
                    }
                }
        )
        if (onRemove != null) {
            IconButton(
                onClick = onRemove,
                enabled = enabled,
                modifier = Modifier.size(30.dp)
            ) {
                Icon(
                    imageVector = Icons.Filled.RemoveCircle,
                    contentDescription = t("Remove"),
                    tint = StudioRed.copy(alpha = 0.55f),
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}

@Composable
private fun FinanceAddHeadingButton(label: String, onClick: () -> Unit) {
    TextButton(
        onClick = onClick,
        contentPadding = PaddingValues(horizontal = 6.dp, vertical = 4.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(Icons.Filled.Add, contentDescription = null, tint = StudioBlue, modifier = Modifier.size(18.dp))
            Text(label, color = StudioBlue, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
        }
    }
}

@Composable
private fun FinanceDisplayInlineRow(
    label: String,
    value: String,
    valueColor: Color,
    muted: Boolean = false
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        FinanceRowLabel(label, modifier = Modifier.weight(0.42f))
        Surface(
            modifier = Modifier
                .weight(0.58f)
                .height(48.dp),
            shape = RoundedCornerShape(10.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = if (muted) 0.32f else 0.75f)
        ) {
            Box(modifier = Modifier.fillMaxSize().padding(horizontal = 14.dp), contentAlignment = Alignment.CenterStart) {
                Text(
                    value,
                    color = valueColor,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun FinanceSelectInlineRow(
    label: String,
    value: String,
    options: List<String>,
    enabled: Boolean,
    onSelect: (String) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var expanded by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        FinanceRowLabel(label, modifier = Modifier.weight(0.42f))
        Box(modifier = Modifier.weight(0.58f)) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                shape = RoundedCornerShape(10.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = if (enabled) 0.75f else 0.38f),
                onClick = { if (enabled) expanded = true }
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        value,
                        modifier = Modifier.weight(1f),
                        color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.ExtraBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Icon(
                        imageVector = Icons.Filled.KeyboardArrowDown,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                options.distinct().forEach { option ->
                    DropdownMenuItem(
                        text = { Text(option, fontWeight = if (option == value) FontWeight.ExtraBold else FontWeight.Normal) },
                        onClick = {
                            expanded = false
                            onSelect(option)
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun FinanceYesNoInlineRow(
    label: String,
    value: Boolean,
    enabled: Boolean,
    onChange: (Boolean) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        FinanceRowLabel(label, modifier = Modifier.weight(0.58f))
        Row(
            modifier = Modifier.weight(0.42f),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            FinanceBinaryChip(
                label = "Yes",
                active = value,
                activeColor = StudioGreen,
                enabled = enabled,
                modifier = Modifier.weight(1f),
                onClick = { onChange(true) }
            )
            FinanceBinaryChip(
                label = "No",
                active = !value,
                activeColor = StudioRed,
                enabled = enabled,
                modifier = Modifier.weight(1f),
                onClick = { onChange(false) }
            )
        }
    }
}

@Composable
private fun FinanceBinaryChip(
    label: String,
    active: Boolean,
    activeColor: Color,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = modifier.height(42.dp),
        shape = RoundedCornerShape(10.dp),
        color = if (active) activeColor.copy(alpha = 0.12f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
        border = BorderStroke(1.dp, if (active) activeColor.copy(alpha = 0.42f) else Color.Transparent),
        onClick = { if (enabled) onClick() }
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize().padding(horizontal = 6.dp)) {
            Text(
                label,
                color = if (active) activeColor else MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 13.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun FinanceFinalProfitRow(finalProfit: Double, label: String? = null) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            label ?: t("Final Profit"),
            modifier = Modifier.weight(1f),
            color = MaterialTheme.colorScheme.onSurface,
            fontSize = 15.sp,
            fontWeight = FontWeight.ExtraBold
        )
        Text(
            money(finalProfit),
            color = if (finalProfit >= 0) StudioGreen else StudioRed,
            fontSize = 20.sp,
            fontWeight = FontWeight.ExtraBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun FinanceRowLabel(label: String, modifier: Modifier = Modifier, onRename: ((String) -> Unit)? = null) {
    val labelColor = MaterialTheme.colorScheme.onSurfaceVariant
    if (onRename == null) {
        Text(
            label,
            modifier = modifier,
            color = labelColor,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            lineHeight = 17.sp,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
        return
    }
    // Inline-rename: long-press the heading to edit it in place; Done or losing
    // focus commits, an unchanged/blank value is ignored. Mirrors the Mac/web apps.
    var editing by remember(label) { mutableStateOf(false) }
    var draft by remember(label) { mutableStateOf(label) }
    val focusRequester = remember { FocusRequester() }
    fun commit() {
        if (!editing) return
        editing = false
        val cleaned = draft.trim()
        if (cleaned.isNotEmpty() && cleaned != label) onRename(cleaned)
    }
    if (editing) {
        LaunchedEffect(Unit) { focusRequester.requestFocus() }
        BasicTextField(
            value = draft,
            onValueChange = { draft = it },
            singleLine = true,
            textStyle = androidx.compose.ui.text.TextStyle(
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold
            ),
            cursorBrush = androidx.compose.ui.graphics.SolidColor(MaterialTheme.colorScheme.primary),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { commit() }),
            modifier = modifier
                .focusRequester(focusRequester)
                .onFocusChanged { if (!it.isFocused) commit() }
        )
    } else {
        Text(
            label,
            modifier = modifier.pointerInput(label) {
                detectTapGestures(onLongPress = { draft = label; editing = true })
            },
            color = labelColor,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            lineHeight = 17.sp,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun ProductionStatusCard(order: StudioOrder, workspaceSettings: StudioWorkspaceSettings) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val extraStatusSteps = workspaceSettings.customSteps.drop(2).map { it.trim() }.filter { it.isNotBlank() }
    val statusToggles = workspaceSettings.customToggles.map { it.trim() }.filter { it.isNotBlank() }
    DetailCard(title = t("Production Status")) {
        val designLabel = workspaceSettings.customSteps.getOrNull(0)?.ifBlank { "Design" } ?: "Design"
        val productionLabel = workspaceSettings.customSteps.getOrNull(1)?.ifBlank { "Production" } ?: "Production"
        InfoRow(designLabel, order.designStatus.ifBlank { "Not Yet" }, statusColor(order.designStatus))
        InfoRow(productionLabel, order.status.ifBlank { "Not Yet" }, statusColor(order.status))
        extraStatusSteps.forEach { step ->
            val value = statusStepValue(order, step)
            InfoRow(step, value, statusColor(value))
        }
        if (statusToggles.isNotEmpty()) {
            HorizontalRule()
            statusToggles.forEach { toggle ->
                BooleanRow(toggle, statusToggleValue(order, toggle))
            }
        }
        if (workspaceSettings.showStatusNotesSupplier) {
            HorizontalRule()
            InfoRow(
                workspaceSettings.statusNotesSupplierLabel.ifBlank { "Notes / Supplier" },
                customFieldValue(order, "status::notesSupplier").ifBlank { "-" }
            )
        }
    }
}

@Composable
private fun ShippingCard(
    order: StudioOrder,
    canEditWorkflow: Boolean,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onRefreshLiveTracking: (StudioOrder) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val uriHandler = LocalUriHandler.current
    var courier by remember(order.id) { mutableStateOf(order.courier.ifBlank { "Auto Detect" }) }
    var trackingNumber by remember(order.id) { mutableStateOf(order.trackingNumber) }
    val savedTrackingNumber = order.trackingNumber.trim()

    DetailCard(title = t("Shipping & Tracking")) {
        if (canEditWorkflow) {
            YesNoChoiceRow("Dispatched", order.isDispatched) { value ->
                onUpdateOrderFields(
                    order,
                    mapOf("details" to mapOf("isDispatched" to value, "isDelivered" to if (value) order.isDelivered else false))
                )
            }
            YesNoChoiceRow("Delivered", order.isDelivered) { value ->
                onUpdateOrderFields(
                    order,
                    mapOf("details" to mapOf("isDelivered" to value, "isDispatched" to if (value) true else order.isDispatched))
                )
            }
            ChoiceRow(
                label = "Courier",
                value = courier.ifBlank { "Auto Detect" },
                options = listOf("Auto Detect", "Royal Mail", "DHL", "FedEx", "UPS"),
                onSelect = { courier = it }
            )
            OutlinedTextField(
                value = trackingNumber,
                onValueChange = { trackingNumber = it.take(160) },
                label = { Text(t("Tracking No.")) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                Button(
                    onClick = {
                        onUpdateOrderFields(
                            order,
                            mapOf("details" to mapOf("courier" to courier.trim(), "trackingNumber" to trackingNumber.trim()))
                        )
                    },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text(t("Save Shipping"), fontWeight = FontWeight.ExtraBold)
                }
                TextButton(
                    onClick = { onRefreshLiveTracking(order) },
                    enabled = savedTrackingNumber.isNotBlank(),
                    modifier = Modifier.weight(1f)
                ) {
                    Text(t("Refresh Live Status"), fontWeight = FontWeight.ExtraBold)
                }
            }
        } else {
            BooleanRow("Dispatched", order.isDispatched)
            BooleanRow("Delivered", order.isDelivered)
            InfoRow("Courier", order.courier.ifBlank { "-" })
            InfoRow("Tracking No.", order.trackingNumber.ifBlank { "-" })
        }

        if (savedTrackingNumber.isNotBlank()) {
            LiveTrackingPanel(order = order)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                TextButton(
                    onClick = {
                        runCatching { uriHandler.openUri(trackingOpenUrl(order)) }
                    },
                    modifier = Modifier.weight(1f)
                ) {
                    Text(t("Open Tracking"), fontWeight = FontWeight.ExtraBold)
                }
                TextButton(
                    onClick = { onRefreshLiveTracking(order) },
                    enabled = canEditWorkflow,
                    modifier = Modifier.weight(1f)
                ) {
                    Text(t("Check Again"), fontWeight = FontWeight.ExtraBold)
                }
            }
        } else {
            DetailListRow(
                "No tracking number yet.",
                "Add a courier and tracking number to enable live status.",
                MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        InfoRow("Estimated Delivery", shortDate(dueDate(order)))
    }
}

@Composable
private fun LiveTrackingPanel(order: StudioOrder) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val status = trackingDisplayStatus(order)
    val supportStatus = trackingValue(order, "trackingSupportStatus")
    val statusColor = trackingSupportColor(supportStatus, trackingStatusColor(status))
    val carrier = trackingValue(order, "carrier").takeUnless { it == "Auto Detect" }.orEmpty()
    val checkpoint = trackingValue(order, "checkpoint")
    val location = trackingValue(order, "location")
    val supportMessage = trackingSupportMessage(trackingValue(order, "supportMessage"), trackingValue(order, "supportMessageKey"))
    val error = trackingValue(order, "error")
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = statusColor.copy(alpha = 0.08f),
        border = BorderStroke(1.dp, statusColor.copy(alpha = 0.22f))
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(
                    modifier = Modifier
                        .size(9.dp)
                        .clip(RoundedCornerShape(50))
                        .background(statusColor)
                )
                Text(
                    status,
                    color = statusColor,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                Text(
                    "17TRACK",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.ExtraBold,
                    modifier = Modifier
                        .clip(RoundedCornerShape(7.dp))
                        .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f))
                        .padding(horizontal = 7.dp, vertical = 3.dp)
                )
            }
            HorizontalRule()
            if (supportStatus.isNotBlank() && !supportStatus.equals("active", ignoreCase = true)) {
                TrackingInfoRow("Tracking Support", trackingSupportLabel(supportStatus))
            }
            TrackingInfoRow(t("Carrier"), carrier.ifBlank { order.courier.ifBlank { "-" } })
            TrackingInfoRow("Last Update", trackingValue(order, "lastUpdate").ifBlank { "-" })
            TrackingInfoRow("Estimated Delivery", trackingValue(order, "eta").ifBlank { "-" })
            TrackingInfoRow("Latest Checkpoint", listOf(checkpoint, location).filter { it.isNotBlank() }.joinToString(" · ").ifBlank { "-" })
            trackingValue(order, "lastCheckedAt").takeIf { it.isNotBlank() }?.let {
                Text(
                    "Last checked by system: ${formatTrackingDisplayDate(it)}",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 10.sp,
                    lineHeight = 14.sp
                )
            }
            if (supportMessage.isNotBlank()) {
                Text(
                    supportMessage,
                    color = statusColor,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    lineHeight = 15.sp
                )
            }
            if (error.isNotBlank()) {
                Text(
                    error,
                    color = StudioRed,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    lineHeight = 15.sp
                )
            }
        }
    }
}

@Composable
private fun TrackingInfoRow(label: String, value: String) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top, modifier = Modifier.fillMaxWidth()) {
        Text(
            label,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.width(112.dp)
        )
        Text(
            value.ifBlank { "-" },
            color = MaterialTheme.colorScheme.onSurface,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            lineHeight = 16.sp,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun NotesCard(order: StudioOrder) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    DetailCard(title = t("Notes")) {
        Text(
            text = order.notes.ifBlank { t("No special notes provided.") },
            color = if (order.notes.isBlank()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.SemiBold,
            fontSize = 13.sp,
            lineHeight = 18.sp
        )
    }
}

@Composable
private fun OperationsCard(
    order: StudioOrder,
    access: uk.co.eggcraft.studioflow.data.model.WorkspaceMemberAccess?,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onUploadClientFile: (StudioOrder, ByteArray, String, String) -> Unit,
    onRenameClientFile: (StudioOrder, String, String) -> Unit,
    onDeleteClientFile: (StudioOrder, String) -> Unit,
    teamMembers: List<StudioTeamMember>,
    canAssignTasks: Boolean,
    workspaceSettings: StudioWorkspaceSettings
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    fun allowed(key: String): Boolean = access?.allows(key) != false && workspaceSettings.showsCard(key)
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val fileOpenScope = rememberCoroutineScope()
    var clientPreviewFile by remember(order.id) { mutableStateOf<StudioClientFile?>(null) }
    clientPreviewFile?.let { pf ->
        ClientFilePreviewDialog(
            file = pf,
            isCurrentPreview = pf.downloadUrl.isNotBlank() && pf.downloadUrl == order.designLink,
            onUseAsPreview = {
                if (isClientFileImage(pf.contentType, pf.fileName) && pf.downloadUrl.isNotBlank()) {
                    onUpdateOrderFields(order, mapOf("details" to mapOf("designLink" to pf.downloadUrl)))
                    clientPreviewFile = null
                }
            },
            onDismiss = { clientPreviewFile = null },
            onOpenExternal = { if (pf.downloadUrl.isNotBlank()) fileOpenScope.launch { uk.co.eggcraft.studioflow.features.shell.AppLockGuard.suppressNextLockOnce(); uriHandler.openUri(createSharedFileLink(pf.downloadUrl)) } }
        )
    }
    var newTaskTitle by remember(order.id) { mutableStateOf("") }
    var newTaskNote by remember(order.id) { mutableStateOf("") }
    var newTaskPriority by remember(order.id) { mutableStateOf("Normal") }
    var newTaskDueDays by remember(order.id) { mutableStateOf("") }
    var newTaskAssigneeId by remember(order.id) { mutableStateOf("") }
    var editingTaskId by remember(order.id) { mutableStateOf("") }
    var editingTaskTitle by remember(order.id) { mutableStateOf("") }
    var editingTaskNote by remember(order.id) { mutableStateOf("") }
    var editingTaskPriority by remember(order.id) { mutableStateOf("Normal") }
    var editingTaskDueDays by remember(order.id) { mutableStateOf("") }
    var editingTaskAssigneeId by remember(order.id) { mutableStateOf("") }
    var workTitle by remember(order.id) { mutableStateOf("Work session") }
    var renameFileId by remember(order.id) { mutableStateOf("") }
    var renameText by remember(order.id) { mutableStateOf("") }
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) {
            val fileName = displayNameForUri(context, uri)
            val contentType = context.contentResolver.getType(uri).orEmpty()
            val bytes = readBytesForUri(context, uri)
            if (bytes != null) {
                onUploadClientFile(order, bytes, fileName, contentType)
            }
        }
    }

    DetailCard(title = "Files, To Do & Work Time") {
        if (allowed("cardClientFiles")) {
            Text(t("Client Files"), fontWeight = FontWeight.ExtraBold)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                Button(
                    onClick = { uk.co.eggcraft.studioflow.features.shell.AppLockGuard.suppressNextLockOnce(); filePicker.launch(arrayOf("*/*")) },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text(t("Upload File"), fontWeight = FontWeight.ExtraBold)
                }
                TextButton(
                    onClick = {
                        val firstFile = order.clientFiles.firstOrNull { it.downloadUrl.isNotBlank() }
                        if (firstFile != null) clientPreviewFile = firstFile
                    },
                    enabled = order.clientFiles.any { it.downloadUrl.isNotBlank() },
                    modifier = Modifier.weight(1f)
                ) {
                    Text(t("Open Latest"), fontWeight = FontWeight.ExtraBold)
                }
            }
            if (order.clientFiles.isEmpty()) {
                InfoRow("Files", "No files uploaded")
            } else {
                order.clientFiles.take(3).forEach { file ->
                    DetailListRow(
                        title = file.fileName,
                        subtitle = listOf(fileSizeLabel(file.fileSize), shortDateOrDash(file.uploadedAt)).filter { it.isNotBlank() }.joinToString(" · "),
                        tone = StudioBlue
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        TextButton(
                            onClick = { if (file.downloadUrl.isNotBlank()) clientPreviewFile = file },
                            enabled = file.downloadUrl.isNotBlank(),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(t("Open"), fontWeight = FontWeight.ExtraBold)
                        }
                        TextButton(
                            onClick = {
                                if (isClientFileImage(file.contentType, file.fileName) && file.downloadUrl.isNotBlank()) {
                                    onUpdateOrderFields(order, mapOf("details" to mapOf("designLink" to file.downloadUrl)))
                                }
                            },
                            enabled = isClientFileImage(file.contentType, file.fileName) && file.downloadUrl.isNotBlank(),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(t("Use Preview"), fontWeight = FontWeight.ExtraBold)
                        }
                        TextButton(
                            onClick = {
                                renameFileId = file.id
                                renameText = file.fileName
                            },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(t("Rename"), fontWeight = FontWeight.ExtraBold)
                        }
                    }
                    if (renameFileId == file.id) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                            OutlinedTextField(
                                value = renameText,
                                onValueChange = { renameText = it },
                                label = { Text(t("File name")) },
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                            Button(
                                onClick = {
                                    onRenameClientFile(order, file.id, renameText.trim())
                                    renameFileId = ""
                                },
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Text(t("Save"))
                            }
                            TextButton(
                                onClick = {
                                    onDeleteClientFile(order, file.id)
                                    renameFileId = ""
                                }
                            ) {
                                Text(t("Delete"), color = StudioRed, fontWeight = FontWeight.ExtraBold)
                            }
                        }
                    }
                }
                if (order.clientFiles.size > 3) InfoRow("More Files", "+${order.clientFiles.size - 3}")
            }
        }
        if (allowed("cardTodo")) {
            HorizontalRule()
            Text(t("To Do"), fontWeight = FontWeight.ExtraBold)
            InfoRow("Progress", "${order.completedTodoCount}/${order.todoCount} completed")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedTextField(
                    value = newTaskTitle,
                    onValueChange = { newTaskTitle = it },
                    label = { Text(t("New task")) },
                    singleLine = true,
                    modifier = Modifier.weight(1f)
                )
                Button(
                    onClick = {
                        val title = newTaskTitle.trim()
                        if (title.isNotBlank()) {
                            val patch = mutableMapOf<String, Any?>(
                                "action" to "add",
                                "title" to title,
                                "note" to newTaskNote.trim(),
                                "priority" to newTaskPriority
                            )
                            val selectedAssignee = teamMembers.firstOrNull { it.id == newTaskAssigneeId }
                            if (canAssignTasks && selectedAssignee != null) {
                                patch["assignedToUid"] = selectedAssignee.id
                                patch["assignedToEmail"] = selectedAssignee.email
                            }
                            todoDueDateFromDays(newTaskDueDays)?.let { patch["dueDate"] = it }
                            onUpdateOrderFields(order, mapOf("todo" to patch))
                            newTaskTitle = ""
                            newTaskNote = ""
                            newTaskPriority = "Normal"
                            newTaskDueDays = ""
                            newTaskAssigneeId = ""
                        }
                    },
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text("Add", fontWeight = FontWeight.ExtraBold)
                }
            }
            OutlinedTextField(
                value = newTaskNote,
                onValueChange = { newTaskNote = it },
                label = { Text(t("Task note")) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            ChoiceRow(
                label = "Priority",
                value = newTaskPriority,
                options = listOf("Low", "Normal", "High", "Urgent"),
                onSelect = { newTaskPriority = it }
            )
            if (canAssignTasks) {
                TodoAssigneeMenu(
                    label = "Assign",
                    selectedMemberId = newTaskAssigneeId,
                    teamMembers = teamMembers,
                    onSelect = { newTaskAssigneeId = it?.id.orEmpty() }
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = newTaskDueDays,
                    onValueChange = { newTaskDueDays = it.filter { char -> char.isDigit() }.take(3) },
                    label = { Text(t("Due in days")) },
                    singleLine = true,
                    modifier = Modifier.weight(1f)
                )
                TextButton(onClick = { newTaskDueDays = "" }, modifier = Modifier.weight(0.55f)) {
                    Text(t("No Due"), fontWeight = FontWeight.ExtraBold)
                }
            }
            order.todoItems.take(4).forEach { item ->
                DetailListRow(
                    title = item.title.ifBlank { "To Do" },
                    subtitle = listOf(
                        if (item.isDone) "Done" else "Open",
                        item.priority,
                        item.dueAt?.let { shortDate(it) }.orEmpty(),
                        taskAssigneeLabel(item, teamMembers)
                    ).filter { it.isNotBlank() }.joinToString(" · "),
                    tone = if (item.isDone) StudioGreen else priorityColor(item.priority)
                )
                if (item.note.isNotBlank()) {
                    Text(item.note, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 16.sp)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                    TextButton(
                        onClick = {
                            onUpdateOrderFields(
                                order,
                                mapOf("todo" to mapOf("action" to "toggle", "taskId" to item.id, "isDone" to !item.isDone))
                            )
                        },
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(if (item.isDone) "Reopen" else "Done", fontWeight = FontWeight.ExtraBold)
                    }
                    TextButton(
                        onClick = {
                            editingTaskId = item.id
                            editingTaskTitle = item.title
                            editingTaskNote = item.note
                            editingTaskPriority = item.priority.ifBlank { "Normal" }
                            editingTaskDueDays = daysUntilText(item.dueAt)
                            editingTaskAssigneeId = taskAssignee(item, teamMembers)?.id.orEmpty()
                        },
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(t("Edit"), fontWeight = FontWeight.ExtraBold)
                    }
                    TextButton(
                        onClick = { onUpdateOrderFields(order, mapOf("todo" to mapOf("action" to "move", "taskId" to item.id, "move" to "up"))) },
                        modifier = Modifier.weight(0.78f)
                    ) {
                        Text("Up", fontWeight = FontWeight.ExtraBold)
                    }
                    TextButton(
                        onClick = { onUpdateOrderFields(order, mapOf("todo" to mapOf("action" to "move", "taskId" to item.id, "move" to "down"))) },
                        modifier = Modifier.weight(0.9f)
                    ) {
                        Text(t("Down"), fontWeight = FontWeight.ExtraBold)
                    }
                }
                if (editingTaskId == item.id) {
                    OutlinedTextField(
                        value = editingTaskTitle,
                        onValueChange = { editingTaskTitle = it },
                        label = { Text(t("Task title")) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = editingTaskNote,
                        onValueChange = { editingTaskNote = it },
                        label = { Text(t("Task note")) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(84.dp)
                    )
                    ChoiceRow(
                        label = "Priority",
                        value = editingTaskPriority,
                        options = listOf("Low", "Normal", "High", "Urgent"),
                        onSelect = { editingTaskPriority = it }
                    )
                    if (canAssignTasks) {
                        TodoAssigneeMenu(
                            label = "Assign",
                            selectedMemberId = editingTaskAssigneeId,
                            teamMembers = teamMembers,
                            onSelect = { editingTaskAssigneeId = it?.id.orEmpty() }
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = editingTaskDueDays,
                            onValueChange = { editingTaskDueDays = it.filter { char -> char.isDigit() }.take(3) },
                            label = { Text(t("Due in days")) },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        TextButton(onClick = { editingTaskDueDays = "" }, modifier = Modifier.weight(0.55f)) {
                            Text(t("Clear"), fontWeight = FontWeight.ExtraBold)
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        Button(
                            onClick = {
                                val title = editingTaskTitle.trim()
                                if (title.isNotBlank()) {
                                    val selectedAssignee = teamMembers.firstOrNull { it.id == editingTaskAssigneeId }
                                    val patch = mutableMapOf<String, Any?>(
                                        "action" to "update",
                                        "taskId" to item.id,
                                        "title" to title,
                                        "note" to editingTaskNote.trim(),
                                        "priority" to editingTaskPriority,
                                        "dueDate" to (todoDueDateFromDays(editingTaskDueDays) ?: "")
                                    )
                                    if (canAssignTasks) {
                                        patch["assignedToUid"] = selectedAssignee?.id.orEmpty()
                                        patch["assignedToEmail"] = selectedAssignee?.email.orEmpty()
                                    }
                                    onUpdateOrderFields(
                                        order,
                                        mapOf("todo" to patch)
                                    )
                                    editingTaskId = ""
                                }
                            },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Text(t("Save Task"), fontWeight = FontWeight.ExtraBold)
                        }
                        TextButton(
                            onClick = {
                                onUpdateOrderFields(order, mapOf("todo" to mapOf("action" to "delete", "taskId" to item.id)))
                                editingTaskId = ""
                            },
                            modifier = Modifier.weight(0.85f)
                        ) {
                            Text(t("Delete"), color = StudioRed, fontWeight = FontWeight.ExtraBold)
                        }
                    }
                }
            }
            if (order.todoItems.size > 4) InfoRow("More Tasks", "+${order.todoItems.size - 4}")
        }
        if (allowed("cardWorkTime")) {
            HorizontalRule()
            Text(t("Work Time"), fontWeight = FontWeight.ExtraBold)
            WorkTimeCardBody(
                order = order,
                workTitle = workTitle,
                onWorkTitleChange = { workTitle = it },
                onUpdateOrderFields = onUpdateOrderFields
            )
        }
        if (allowed("cardHistoryLog")) {
            HorizontalRule()
            Text(t("History / Log"), fontWeight = FontWeight.ExtraBold)
            if (order.historyLog.isEmpty()) {
                InfoRow("Log", "No changes recorded yet")
            } else {
                order.historyLog.take(5).forEach { item ->
                    DetailListRow(
                        title = item.title,
                        subtitle = listOf(item.oldValue, item.newValue, shortDateOrDash(item.createdAt)).filter { it.isNotBlank() }.joinToString(" -> "),
                        tone = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

// A card-specific entry pinned to the top of the card's "..." menu (e.g. the
// History/Log card's PDF export). Label goes through t() at render time.
private data class DetailCardMenuAction(
    val label: String,
    val icon: ImageVector,
    val onClick: () -> Unit
)

@Composable
private fun DetailCard(
    title: String,
    headerAction: (@Composable () -> Unit)? = null,
    minimumHeightOverride: Int? = null,
    extraMenuItems: List<DetailCardMenuAction> = emptyList(),
    content: @Composable ColumnScope.() -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val cardsUnlocked = LocalDetailCardsUnlocked.current
    val cardActions = LocalOrderCardActions.current
    val headingEditorActions = LocalOrderHeadingEditorActions.current
    val useUnifiedBoardScroll = LocalUnifiedBoardVerticalScroll.current
    val headerCardId = cardActions?.cardId ?: orderDetailCardIdForTitle(title)
    val headingEditorConfig = remember(
        headerCardId,
        headingEditorActions?.workspaceSettings,
        headingEditorActions?.orderExtraNoteSections,
        headingEditorActions?.orderFinancialExpenseItems to headingEditorActions?.orderFinancialRemainingItems,
        headingEditorActions?.orderFinancialBaseCostLabel
    ) {
        orderHeadingEditorConfig(
            headerCardId,
            headingEditorActions?.workspaceSettings,
            headingEditorActions?.orderExtraNoteSections.orEmpty(),
            headingEditorActions?.orderFinancialExpenseItems.orEmpty(),
            headingEditorActions?.orderFinancialRemainingItems.orEmpty(),
            headingEditorActions?.orderFinancialBaseCostLabel ?: "Cost (Base)"
        )
    }
    val cardColorName = cardActions?.layout?.cardColors?.get(cardActions.cardId).orEmpty()
    val cardTint = studioCardThemeColor(cardColorName)
    val headerAccent = cardTint ?: orderDetailCardAccent(headerCardId)
    val savedHeight = cardActions?.layout?.savedHeightFor(cardActions.cardId, cardActions.orderId)
    val density = LocalDensity.current
    val contentScrollState = rememberScrollState()
    var renderedCardHeightDp by remember(title, cardActions?.orderId) { mutableStateOf<Int?>(null) }
    var dragBaseHeight by remember(title, cardActions?.orderId) { mutableStateOf<Int?>(null) }
    var dragHeightDelta by remember(title, cardActions?.orderId) { mutableStateOf(0f) }
    var dragBaseWidth by remember(title, cardActions?.orderId) { mutableStateOf<Int?>(null) }
    var dragWidthDelta by remember(title, cardActions?.orderId) { mutableStateOf(0f) }
    var dragHadHeightChange by remember(title, cardActions?.orderId) { mutableStateOf(false) }
    val minimumCardHeight = maxOf(minimumRenderedCardHeight(headerCardId), minimumHeightOverride ?: 0)
    val desktopDefaultHeight = if (cardActions != null && !cardActions.isPhoneLayout) {
        defaultRenderedCardHeight(cardActions.cardId)
    } else {
        null
    }
    val displayedHeight = (dragBaseHeight?.let { baseHeight ->
        (baseHeight + dragHeightDelta).coerceIn(minimumCardHeight.toFloat(), 1200f).toInt()
    } ?: savedHeight ?: desktopDefaultHeight)
        ?.coerceAtLeast(minimumCardHeight)
    var menuOpen by remember(title) { mutableStateOf(false) }
    var colorMenuOpen by remember(title) { mutableStateOf(false) }
    var sizeMenuOpen by remember(title) { mutableStateOf(false) }
    var collapsed by remember(title) { mutableStateOf(false) }
    var headingEditorOpen by remember(title) { mutableStateOf(false) }
    // Workspace-wide colour meanings override (companySettings.cardColorMeaningsJSON).
    val cardColorMeaningsJSON = headingEditorActions?.workspaceSettings?.cardColorMeaningsJSON
    val dragHandleModifier = if (cardsUnlocked && cardActions != null) {
        Modifier.dragAndDropSource { _ ->
            cardActions.onCardDragStart(cardActions.cardId)
            cardTransferData(cardActions.cardId)
        }
    } else {
        Modifier
    }
    val cardHeightModifier = when {
        collapsed -> Modifier
        displayedHeight != null -> Modifier.height(displayedHeight.dp)
        else -> Modifier
    }
    Surface(
        modifier = cardHeightModifier.onSizeChanged { size ->
            renderedCardHeightDp = with(density) { size.height.toDp().value }.roundToInt()
        },
        shape = RoundedCornerShape(14.dp),
        color = cardTint?.copy(alpha = 0.13f) ?: MaterialTheme.colorScheme.surface,
        tonalElevation = 0.dp,
        shadowElevation = if (cardTint == null) 1.dp else 0.dp,
        border = BorderStroke(
            1.dp,
            cardTint?.copy(alpha = 0.42f) ?: MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.72f)
        )
    ) {
        Column(
            modifier = Modifier.padding(15.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(
                    imageVector = Icons.Filled.DragHandle,
                    contentDescription = "Drag card",
                    modifier = Modifier
                        .then(dragHandleModifier)
                        .size(22.dp)
                        .padding(2.dp),
                    tint = if (cardsUnlocked) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.outlineVariant
                )
                Surface(
                    shape = RoundedCornerShape(7.dp),
                    color = headerAccent.copy(alpha = 0.12f)
                ) {
                    Icon(
                        imageVector = orderDetailCardIcon(headerCardId),
                        contentDescription = null,
                        modifier = Modifier
                            .padding(5.dp)
                            .size(15.dp),
                        tint = headerAccent
                    )
                }
                Text(
                    text = title,
                    modifier = Modifier.weight(1f),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                val meaningLabel = orderCardColorMeaning(cardColorName, cardColorMeaningsJSON)
                if (cardTint != null && meaningLabel != null) {
                    Surface(shape = RoundedCornerShape(999.dp), color = cardTint) {
                        Text(
                            text = t(meaningLabel),
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                            color = Color.White,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.ExtraBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
                headerAction?.invoke()
                Box {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = Color.Transparent,
                        onClick = { menuOpen = true }
                    ) {
                        Icon(
                            imageVector = Icons.Filled.MoreHoriz,
                            contentDescription = "Card actions",
                            modifier = Modifier
                                .padding(5.dp)
                                .size(18.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        val actions = cardActions
                        extraMenuItems.forEach { item ->
                            DropdownMenuItem(
                                text = { Text(t(item.label)) },
                                leadingIcon = { Icon(item.icon, contentDescription = null) },
                                onClick = {
                                    menuOpen = false
                                    item.onClick()
                                }
                            )
                        }
                        if (extraMenuItems.isNotEmpty()) {
                            HorizontalDivider(modifier = Modifier.padding(vertical = 6.dp))
                        }
                        DropdownMenuItem(
                            text = { Text(t("Hide Block")) },
                            leadingIcon = { Icon(Icons.Filled.VisibilityOff, contentDescription = null) },
                            enabled = actions != null && cardsUnlocked,
                            onClick = {
                                if (actions != null) {
                                    actions.onSaveLayout(actions.layout.withCardVisibility(actions.cardId, false))
                                }
                                menuOpen = false
                            }
                        )
                        DropdownMenuItem(
                            text = { Text(t("Edit Block Headings")) },
                            leadingIcon = {
                                Text(
                                    "Aa",
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            },
                            enabled = headingEditorConfig != null,
                            onClick = {
                                if (headingEditorConfig != null) {
                                    headingEditorOpen = true
                                }
                                menuOpen = false
                            }
                        )
                        HorizontalDivider(modifier = Modifier.padding(vertical = 6.dp))
                        // Position — the same moves the web menu offers: up/down in
                        // this card's flow, and across columns on the column board.
                        // All routes reuse the exact mutation helpers + save pipeline
                        // that drag-and-drop uses.
                        DropdownMenuItem(
                            text = { Text(t("Move up")) },
                            leadingIcon = { Icon(Icons.Filled.KeyboardArrowUp, contentDescription = null) },
                            enabled = actions != null && cardsUnlocked,
                            onClick = {
                                if (actions != null) {
                                    actions.onSaveLayout(
                                        if (actions.isPhoneLayout) {
                                            actions.layout.movePhoneCardBy(actions.cardId, -1)
                                        } else {
                                            actions.layout.moveDesktopCardWithinColumn(actions.cardId, actions.columnIndex, -1)
                                        }
                                    )
                                }
                                menuOpen = false
                            }
                        )
                        DropdownMenuItem(
                            text = { Text(t("Move down")) },
                            leadingIcon = { Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null) },
                            enabled = actions != null && cardsUnlocked,
                            onClick = {
                                if (actions != null) {
                                    actions.onSaveLayout(
                                        if (actions.isPhoneLayout) {
                                            actions.layout.movePhoneCardBy(actions.cardId, 1)
                                        } else {
                                            actions.layout.moveDesktopCardWithinColumn(actions.cardId, actions.columnIndex, 1)
                                        }
                                    )
                                }
                                menuOpen = false
                            }
                        )
                        if (actions != null && !actions.isPhoneLayout) {
                            DropdownMenuItem(
                                text = { Text(t("Move left")) },
                                leadingIcon = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = null) },
                                enabled = cardsUnlocked && actions.columnIndex > 0,
                                onClick = {
                                    if (actions.columnIndex > 0) {
                                        actions.onSaveLayout(
                                            actions.layout.moveDesktopCardToColumnEnd(actions.cardId, actions.columnIndex - 1)
                                        )
                                    }
                                    menuOpen = false
                                }
                            )
                            DropdownMenuItem(
                                text = { Text(t("Move right")) },
                                leadingIcon = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null) },
                                enabled = cardsUnlocked && actions.columnIndex + 1 < MaxDesktopCardColumns,
                                onClick = {
                                    if (actions.columnIndex + 1 < MaxDesktopCardColumns) {
                                        actions.onSaveLayout(
                                            actions.layout.moveDesktopCardToColumnEnd(actions.cardId, actions.columnIndex + 1)
                                        )
                                    }
                                    menuOpen = false
                                }
                            )
                        }
                        HorizontalDivider(modifier = Modifier.padding(vertical = 6.dp))
                        DropdownMenuItem(
                            text = { Text(t("Card size")) },
                            leadingIcon = { Icon(Icons.Filled.Height, contentDescription = null) },
                            trailingIcon = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null) },
                            enabled = actions != null && cardsUnlocked,
                            onClick = {
                                menuOpen = false
                                sizeMenuOpen = true
                            }
                        )
                        DropdownMenuItem(
                            text = { Text(t("Color")) },
                            leadingIcon = { Icon(Icons.Filled.Palette, contentDescription = null) },
                            trailingIcon = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null) },
                            enabled = actions != null && cardsUnlocked,
                            onClick = {
                                menuOpen = false
                                colorMenuOpen = true
                            }
                        )
                        HorizontalDivider(modifier = Modifier.padding(vertical = 6.dp))
                        // One tap returns the card to how it started: automatic
                        // height, no colour. Position is left alone — reset must
                        // never scatter someone's board. (Same rule as web.)
                        DropdownMenuItem(
                            text = { Text(t("Reset")) },
                            leadingIcon = { Icon(Icons.Filled.RestartAlt, contentDescription = null) },
                            enabled = actions != null && cardsUnlocked,
                            onClick = {
                                if (actions != null) {
                                    actions.onSaveLayout(
                                        actions.layout
                                            .withCardAutoHeight(actions.cardId, actions.orderId)
                                            .withCardColor(actions.cardId, "Default")
                                    )
                                }
                                menuOpen = false
                            }
                        )
                    }
                    DropdownMenu(expanded = sizeMenuOpen, onDismissRequest = { sizeMenuOpen = false }) {
                        val actions = cardActions
                        val storedHeight = actions?.layout?.savedHeightFor(actions.cardId, actions.orderId)
                        // The three fixed steps shared with web/iOS (220/380/560),
                        // stored through the exact same pipeline the drag-resize
                        // uses — including the per-order vs shared height choice.
                        listOf("S" to 220, "M" to 380, "L" to 560).forEach { (label, height) ->
                            DropdownMenuItem(
                                text = { Text(label) },
                                leadingIcon = {
                                    Icon(
                                        Icons.Filled.CheckCircle,
                                        contentDescription = null,
                                        tint = if (storedHeight == height) StudioBlue else Color.Transparent
                                    )
                                },
                                enabled = actions != null && cardsUnlocked,
                                onClick = {
                                    if (actions != null) {
                                        actions.onSaveLayout(actions.layout.withCardHeight(actions.cardId, actions.orderId, height))
                                    }
                                    sizeMenuOpen = false
                                }
                            )
                        }
                        HorizontalDivider(modifier = Modifier.padding(vertical = 6.dp))
                        // Clears the stored height so the card goes back to sizing
                        // itself from its content — the per-card version of the
                        // board-level Auto-size.
                        DropdownMenuItem(
                            text = { Text(t("Fit content")) },
                            leadingIcon = {
                                Icon(
                                    Icons.Filled.CheckCircle,
                                    contentDescription = null,
                                    tint = if (storedHeight == null) StudioBlue else Color.Transparent
                                )
                            },
                            enabled = actions != null && cardsUnlocked,
                            onClick = {
                                if (actions != null) {
                                    actions.onSaveLayout(actions.layout.withCardAutoHeight(actions.cardId, actions.orderId))
                                }
                                sizeMenuOpen = false
                            }
                        )
                        if (actions != null && !actions.isPhoneLayout) {
                            // Give every card in this card's column this card's
                            // current effective height (desktop board only).
                            DropdownMenuItem(
                                text = { Text(t("Match column")) },
                                leadingIcon = {
                                    Icon(
                                        Icons.Filled.CheckCircle,
                                        contentDescription = null,
                                        tint = Color.Transparent
                                    )
                                },
                                enabled = cardsUnlocked,
                                onClick = {
                                    val targetHeight = displayedHeight
                                        ?: renderedCardHeightDp
                                        ?: defaultRenderedCardHeight(actions.cardId)
                                    val column = actions.layout.columns.getOrNull(actions.columnIndex).orEmpty()
                                    var nextLayout = actions.layout
                                    column.forEach { member ->
                                        nextLayout = nextLayout.withCardHeight(member, actions.orderId, targetHeight)
                                    }
                                    actions.onSaveLayout(nextLayout)
                                    sizeMenuOpen = false
                                }
                            )
                        }
                    }
                    DropdownMenu(expanded = colorMenuOpen, onDismissRequest = { colorMenuOpen = false }) {
                        val actions = cardActions
                        val selectedColorName = actions?.layout?.cardColors?.get(actions.cardId) ?: t("Default")
                        listOf(
                            "Default" to t("Default"),
                            "Red" to t("Red"),
                            "Orange" to t("Orange"),
                            "Yellow" to t("Yellow"),
                            "Green" to t("Green"),
                            "Blue" to t("Blue"),
                            "Purple" to t("Purple"),
                            "Pink" to "Pink"
                        ).forEach { (canonicalColorName, colorName) ->
                            val meaningLabel = orderCardColorMeaning(canonicalColorName, cardColorMeaningsJSON)
                            DropdownMenuItem(
                                text = {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                        Text(colorName)
                                        if (meaningLabel != null) {
                                            Text(
                                                text = t(meaningLabel),
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Bold
                                            )
                                        }
                                    }
                                },
                                leadingIcon = { CardColorSwatch(colorName, selectedColorName == colorName) },
                                enabled = actions != null && cardsUnlocked,
                                onClick = {
                                    if (actions != null) {
                                        actions.onSaveLayout(actions.layout.withCardColor(actions.cardId, colorName))
                                    }
                                    colorMenuOpen = false
                                }
                            )
                        }
                    }
                }
            }
            if (collapsed) {
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant
                ) {
                    Text(
                        "Collapsed",
                        modifier = Modifier.padding(horizontal = 11.dp, vertical = 9.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            } else {
                if (displayedHeight != null) {
                    val fixedContentModifier = Modifier
                        .weight(1f, fill = true)
                        .fillMaxWidth()
                        .then(
                            if (useUnifiedBoardScroll) {
                                Modifier.clip(RoundedCornerShape(10.dp))
                            } else {
                                Modifier.verticalScroll(contentScrollState)
                            }
                        )
                    Column(
                        modifier = fixedContentModifier,
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        content()
                    }
                } else {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        content()
                    }
                }
                val resizeActions = if (cardsUnlocked && cardActions != null) cardActions else null
                val canResizeCard = resizeActions != null
                val latestResizeActions by rememberUpdatedState(resizeActions)
                val latestDisplayedHeight by rememberUpdatedState(displayedHeight)
                val latestRenderedCardHeightDp by rememberUpdatedState(renderedCardHeightDp)
                val resizeModifier = if (resizeActions != null) {
                    Modifier.pointerInput(resizeActions.cardId, resizeActions.orderId) {
                        detectDragGestures(
                            onDragStart = {
                                val actions = latestResizeActions
                                if (actions != null) {
                                    dragBaseHeight = latestDisplayedHeight ?: latestRenderedCardHeightDp ?: defaultRenderedCardHeight(actions.cardId)
                                    dragHeightDelta = 0f
                                    dragHadHeightChange = false
                                    actions.onCardResizeStart()
                                }
                            },
                            onDrag = { change, dragAmount ->
                                val actions = latestResizeActions
                                if (actions != null && dragBaseHeight != null) {
                                    change.consume()
                                    val verticalDelta = with(density) { dragAmount.y.toDp().value } * CardResizeDragSensitivity
                                    if (abs(verticalDelta) > 0.1f) {
                                        dragHadHeightChange = true
                                    }
                                    dragHeightDelta += verticalDelta
                                }
                            },
                            onDragEnd = {
                                val actions = latestResizeActions
                                if (dragHadHeightChange || abs(dragHeightDelta) >= 1f) {
                                    val cardId = actions?.cardId
                                    val minimumHeight = minimumRenderedCardHeight(cardId)
                                    val baseHeight = dragBaseHeight
                                        ?: latestDisplayedHeight
                                        ?: latestRenderedCardHeightDp
                                        ?: cardId?.let(::defaultRenderedCardHeight)
                                        ?: minimumHeight
                                    val finalHeight = (baseHeight + dragHeightDelta).coerceIn(minimumHeight.toFloat(), 1200f).toInt()
                                    if (actions != null) {
                                        actions.onSaveLayout(
                                            actions.layout.withCardHeight(actions.cardId, actions.orderId, finalHeight)
                                        )
                                    }
                                }
                                dragBaseHeight = null
                                dragHeightDelta = 0f
                                dragHadHeightChange = false
                                actions?.onCardResizeFinish()
                            },
                            onDragCancel = {
                                val actions = latestResizeActions
                                dragBaseHeight = null
                                dragHeightDelta = 0f
                                dragHadHeightChange = false
                                actions?.onCardResizeFinish()
                            }
                        )
                    }
                } else {
                    Modifier
                }
                val columnResizeActions = if (resizeActions?.isPhoneLayout == false) resizeActions else null
                val canResizeColumn = columnResizeActions != null
                val latestColumnResizeActions by rememberUpdatedState(columnResizeActions)
                val cornerResizeModifier = if (columnResizeActions != null) {
                    Modifier.pointerInput(columnResizeActions.cardId, columnResizeActions.orderId) {
                        detectDragGestures(
                            onDragStart = {
                                val actions = latestColumnResizeActions
                                if (actions != null) {
                                    dragBaseHeight = latestDisplayedHeight ?: latestRenderedCardHeightDp ?: defaultRenderedCardHeight(actions.cardId)
                                    dragHeightDelta = 0f
                                    dragHadHeightChange = false
                                    dragBaseWidth = actions.columnWidth
                                    dragWidthDelta = 0f
                                    actions.onColumnResizeStart()
                                }
                            },
                            onDrag = { change, dragAmount ->
                                val actions = latestColumnResizeActions
                                if (actions != null && dragBaseHeight != null) {
                                    change.consume()
                                    dragHeightDelta += with(density) { dragAmount.y.toDp().value } * CardResizeDragSensitivity
                                    if (abs(dragAmount.y) > 0.1f) {
                                        dragHadHeightChange = true
                                    }
                                    dragWidthDelta += with(density) { dragAmount.x.toDp().value } * CardResizeDragSensitivity
                                    actions.onColumnResizeBy(dragAmount.x * CardResizeDragSensitivity)
                                }
                            },
                            onDragEnd = {
                                val actions = latestColumnResizeActions
                                if (actions != null) {
                                    val minimumHeight = minimumRenderedCardHeight(actions.cardId)
                                    val baseHeight = dragBaseHeight ?: latestDisplayedHeight ?: latestRenderedCardHeightDp ?: defaultRenderedCardHeight(actions.cardId)
                                    val finalHeight = (baseHeight + dragHeightDelta).coerceIn(minimumHeight.toFloat(), 1200f).toInt()
                                    val baseWidth = dragBaseWidth ?: actions.columnWidth
                                    val finalWidth = (baseWidth + dragWidthDelta).coerceIn(260f, 800f).roundToInt()
                                    actions.onSaveLayout(
                                        actions.layout
                                            .withCardHeight(actions.cardId, actions.orderId, finalHeight)
                                            .withColumnWidth(actions.columnIndex, finalWidth)
                                    )
                                    actions.onColumnResizeFinish()
                                }
                                dragBaseHeight = null
                                dragHeightDelta = 0f
                                dragHadHeightChange = false
                                dragBaseWidth = null
                                dragWidthDelta = 0f
                            },
                            onDragCancel = {
                                val actions = latestColumnResizeActions
                                actions?.onColumnResizeFinish()
                                dragBaseHeight = null
                                dragHeightDelta = 0f
                                dragHadHeightChange = false
                                dragBaseWidth = null
                                dragWidthDelta = 0f
                            }
                        )
                    }
                } else {
                    Modifier
                }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(if (canResizeCard) 44.dp else 12.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .fillMaxHeight()
                            .then(resizeModifier),
                        contentAlignment = Alignment.Center
                    ) {
                        Surface(
                            modifier = Modifier
                                .width(if (canResizeCard) 72.dp else 40.dp)
                                .height(if (canResizeCard) 5.dp else 3.dp),
                            shape = RoundedCornerShape(999.dp),
                            color = when {
                                dragBaseHeight != null && dragBaseWidth == null -> headerAccent.copy(alpha = 0.65f)
                                canResizeCard -> MaterialTheme.colorScheme.outlineVariant
                                else -> MaterialTheme.colorScheme.surfaceVariant
                            }
                        ) {}
                    }
                    Surface(
                        modifier = Modifier
                            .align(Alignment.CenterEnd)
                            .size(24.dp)
                            .then(cornerResizeModifier),
                        shape = RoundedCornerShape(8.dp),
                        color = when {
                            dragBaseHeight != null && dragBaseWidth != null -> headerAccent.copy(alpha = 0.16f)
                            canResizeColumn -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.75f)
                            else -> Color.Transparent
                        }
                    ) {
                        Icon(
                            imageVector = Icons.Filled.DragHandle,
                            contentDescription = "Resize card and column",
                            modifier = Modifier
                                .padding(5.dp)
                                .size(14.dp),
                            tint = if (canResizeColumn) MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f) else Color.Transparent
                        )
                    }
                }
            }
        }
    }
    if (headingEditorOpen && headingEditorActions != null && headingEditorConfig != null) {
        OrderBlockHeadingEditorDialog(
            config = headingEditorConfig,
            onDismiss = { headingEditorOpen = false },
            onSave = { updates, message ->
                if (updates["__financialPerOrder__"] == true) {
                    // Financial headings route to the order (per-order), not workspace.
                    @Suppress("UNCHECKED_CAST")
                    val expense = updates["__financialExpenseItems__"] as? List<StudioHeadingItem> ?: emptyList()
                    @Suppress("UNCHECKED_CAST")
                    val remaining = updates["__financialRemainingItems__"] as? List<StudioHeadingItem> ?: emptyList()
                    val baseLabel = updates["__financialBaseCostLabel__"] as? String ?: "Cost (Base)"
                    val showBaseCost = updates["__financialShowBaseCost__"] as? Boolean ?: true
                    val setAsDefault = updates["__financialSetAsDefault__"] as? Boolean ?: false
                    headingEditorActions.onSavePerOrderFinancial?.invoke(expense, remaining, baseLabel, showBaseCost, setAsDefault)
                } else {
                    @Suppress("UNCHECKED_CAST")
                    val perOrderExtras = updates["__perOrderNoteExtras__"] as? List<StudioHeadingItem>
                    val cleanedUpdates = updates.filterKeys { it != "__perOrderNoteExtras__" }
                    if (cleanedUpdates.isNotEmpty()) {
                        headingEditorActions.onSave(cleanedUpdates, message)
                    }
                    if (perOrderExtras != null) {
                        headingEditorActions.onSavePerOrderNoteExtras?.invoke(perOrderExtras)
                    }
                }
                headingEditorOpen = false
            }
        )
    }
}

@Composable
private fun OrderBlockHeadingEditorDialog(
    config: OrderHeadingEditorConfig,
    onDismiss: () -> Unit,
    onSave: (Map<String, Any?>, String) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var groupValues by remember(config.title) {
        mutableStateOf(config.groups.associate { it.key to it.items })
    }
    var fieldValues by remember(config.title) {
        mutableStateOf(config.fields.associate { it.key to it.value })
    }
    var toggleValues by remember(config.title) {
        mutableStateOf(config.toggles.associate { it.key to it.value })
    }
    var companyNumbers by remember(config.title) { mutableStateOf(config.companyNumbers ?: emptyList()) }
    val scrollState = rememberScrollState()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(config.title, fontWeight = FontWeight.ExtraBold) },
        text = {
            Column(
                modifier = Modifier
                    .heightIn(max = 540.dp)
                    .verticalScroll(scrollState),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Text(
                    text = config.subtitle,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 13.sp
                )
                config.fields.forEach { field ->
                    OutlinedTextField(
                        value = fieldValues[field.key].orEmpty(),
                        onValueChange = { value -> fieldValues = fieldValues + (field.key to value) },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text(field.label) },
                        singleLine = true
                    )
                }
                config.toggles.forEach { toggle ->
                    Surface(
                        shape = RoundedCornerShape(13.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp, vertical = 9.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Text(
                                text = toggle.label,
                                modifier = Modifier.weight(1f),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Switch(
                                checked = toggleValues[toggle.key] ?: false,
                                onCheckedChange = { checked -> toggleValues = toggleValues + (toggle.key to checked) }
                            )
                        }
                    }
                }
                config.groups.forEach { group ->
                    val items = groupValues[group.key].orEmpty()
                    OrderHeadingEditorGroupView(
                        group = group,
                        items = items,
                        onItemsChange = { next -> groupValues = groupValues + (group.key to next) }
                    )
                }
                if (config.companyNumbers != null) {
                    Text(
                        t("Company invoice numbers"),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    companyNumbers.forEachIndexed { index, item ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            OutlinedTextField(
                                value = item.title,
                                onValueChange = { v -> companyNumbers = companyNumbers.toMutableList().also { it[index] = it[index].copy(title = v) } },
                                label = { Text(t("Label")) },
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            OutlinedTextField(
                                value = item.value,
                                onValueChange = { v -> companyNumbers = companyNumbers.toMutableList().also { it[index] = it[index].copy(value = v) } },
                                label = { Text(t("Number / value")) },
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(onClick = { companyNumbers = companyNumbers.toMutableList().also { it.removeAt(index) } }) {
                                Text("✕", color = StudioRed, fontSize = 16.sp)
                            }
                        }
                    }
                    TextButton(onClick = { companyNumbers = companyNumbers + StudioCompanyNumber("New Number", "") }) {
                        Text("+ " + t("Add"))
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val draft = OrderHeadingEditorDraft(
                        groups = groupValues,
                        fields = fieldValues,
                        toggles = toggleValues
                    )
                    val updates = config.buildUpdates(draft).toMutableMap()
                    if (config.companyNumbers != null) {
                        val json = org.json.JSONArray().also { arr ->
                            companyNumbers.forEach { arr.put(org.json.JSONObject().put("title", it.title).put("value", it.value)) }
                        }.toString()
                        updates["companyNumbersJSON"] = json
                    }
                    onSave(updates, config.saveMessage)
                }
            ) {
                Text(t("Save"))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(t("Cancel"))
            }
        }
    )
}

@Composable
private fun OrderHeadingEditorGroupView(
    group: OrderHeadingEditorGroup,
    items: List<StudioHeadingItem>,
    onItemsChange: (List<StudioHeadingItem>) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        shape = RoundedCornerShape(15.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.36f)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(9.dp)
        ) {
            Text(group.title, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
            if (group.description.isNotBlank()) {
                Text(group.description, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            }
            if (items.isEmpty()) {
                Text(
                    group.emptyText,
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.72f), RoundedCornerShape(11.dp))
                        .padding(11.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp
                )
            }
            items.forEachIndexed { index, item ->
                val canDelete = item.id != group.lockedFirstId && items.size > group.minimumCount
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = "${index + 1}",
                        modifier = Modifier
                            .size(26.dp)
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.10f), RoundedCornerShape(8.dp))
                            .padding(top = 4.dp),
                        color = MaterialTheme.colorScheme.primary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                    OutlinedTextField(
                        value = item.title,
                        onValueChange = { value ->
                            onItemsChange(items.toMutableList().also { it[index] = item.copy(title = value) })
                        },
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                    TextButton(
                        enabled = index > 0,
                        onClick = { onItemsChange(items.movedHeadingItem(index, index - 1)) }
                    ) {
                        Text("Up")
                    }
                    TextButton(
                        enabled = index < items.lastIndex,
                        onClick = { onItemsChange(items.movedHeadingItem(index, index + 1)) }
                    ) {
                        Text(t("Down"))
                    }
                    TextButton(
                        enabled = canDelete,
                        onClick = { onItemsChange(items.toMutableList().also { it.removeAt(index) }) }
                    ) {
                        Text(t("Delete"))
                    }
                }
            }
            TextButton(
                onClick = {
                    val title = group.addLabel.removePrefix("Add ").ifBlank { t("Heading") }
                    onItemsChange(
                        items + StudioHeadingItem(
                            id = newOrderHeadingId(title, items.size),
                            title = "$title ${items.size + 1}"
                        )
                    )
                }
            ) {
                Text(group.addLabel)
            }
        }
    }
}

private fun orderHeadingEditorConfig(
    cardId: OrderDetailCardId?,
    settings: StudioWorkspaceSettings?,
    perOrderExtraNoteSections: List<StudioHeadingItem> = emptyList(),
    orderFinancialExpenseItems: List<StudioHeadingItem> = emptyList(),
    orderFinancialRemainingItems: List<StudioHeadingItem> = emptyList(),
    orderFinancialBaseCostLabel: String = "Cost (Base)"
): OrderHeadingEditorConfig? {
    if (cardId == null || settings == null) return null
    return when (cardId) {
        OrderDetailCardId.Summary -> OrderHeadingEditorConfig(
            title = "Edit Summary Headings",
            subtitle = "Choose the two production status rows shown inside Order Summary.",
            fields = listOf(
                OrderHeadingEditorField("summaryStep1", "Summary row 1", settings.summaryStep1, "Design"),
                OrderHeadingEditorField("summaryStep2", "Summary row 2", settings.summaryStep2, "Painting")
            ),
            saveMessage = "Order summary headings saved.",
            buildUpdates = { draft ->
                mapOf(
                    "summaryStep1" to cleanOrderHeadingField(draft.fields["summaryStep1"], "Design"),
                    "summaryStep2" to cleanOrderHeadingField(draft.fields["summaryStep2"], "Painting")
                )
            }
        )
        OrderDetailCardId.Financial -> OrderHeadingEditorConfig(
            title = "Edit Financial Headings",
            subtitle = "Add spending headings and extra remaining or pending headings for this order. Tick \"Set as default\" to also apply them to new orders.",
            fields = listOf(
                OrderHeadingEditorField("financialBaseCostLabel", "Base cost heading", orderFinancialBaseCostLabel, "Cost (Base)")
            ),
            toggles = listOf(
                OrderHeadingEditorToggle("financialShowBaseCost", "Show base cost field", settings.financialShowBaseCost),
                OrderHeadingEditorToggle("__financialSetAsDefault__", "Set as default for new orders", false)
            ),
            groups = listOf(
                OrderHeadingEditorGroup(
                    key = "expense",
                    title = "Spending / Cost Headings",
                    description = "Spending rows shown under this order's financial card.",
                    addLabel = "Add Spending",
                    emptyText = "No spending headings yet.",
                    items = normalizedFinancialItems(orderFinancialExpenseItems, "Cost")
                ),
                OrderHeadingEditorGroup(
                    key = "remaining",
                    title = "Remaining / Pending Headings",
                    description = "Remaining or pending rows shown under this order's financial card.",
                    addLabel = "Add Remaining",
                    emptyText = "No remaining headings yet.",
                    items = normalizedFinancialItems(orderFinancialRemainingItems, "Pending")
                )
            ),
            saveMessage = "Financial headings saved.",
            buildUpdates = { draft ->
                // Routed to onSavePerOrderFinancial by the dialog dispatcher (per-order,
                // not workspace). Values are passed through the marker keys below.
                mapOf(
                    "__financialPerOrder__" to true,
                    "__financialExpenseItems__" to normalizedFinancialItems(draft.groups["expense"].orEmpty(), "Cost"),
                    "__financialRemainingItems__" to normalizedFinancialItems(draft.groups["remaining"].orEmpty(), "Pending"),
                    "__financialBaseCostLabel__" to cleanOrderHeadingField(draft.fields["financialBaseCostLabel"], "Cost (Base)"),
                    "__financialShowBaseCost__" to (draft.toggles["financialShowBaseCost"] ?: true),
                    "__financialSetAsDefault__" to (draft.toggles["__financialSetAsDefault__"] ?: false)
                )
            }
        )
        OrderDetailCardId.Status -> OrderHeadingEditorConfig(
            title = "Edit Production Status Headings",
            subtitle = "Edit the status dropdown headings, extra Yes / No checks, and small order card badge labels.",
            fields = listOf(
                OrderHeadingEditorField("summaryStep1", "Summary row 1", settings.summaryStep1, "Design"),
                OrderHeadingEditorField("summaryStep2", "Summary row 2", settings.summaryStep2, "Painting"),
                OrderHeadingEditorField("orderListStep1", "Small card badge 1", settings.orderListStep1, settings.summaryStep1.ifBlank { "Design" }),
                OrderHeadingEditorField("orderListStep2", "Small card badge 2", settings.orderListStep2, settings.summaryStep2.ifBlank { "Painting" }),
                OrderHeadingEditorField("statusNotesSupplierLabel", "Notes / Supplier heading", settings.statusNotesSupplierLabel, "Notes / Supplier")
            ),
            toggles = listOf(
                OrderHeadingEditorToggle("showStatusNotesSupplier", "Show Notes / Supplier field", settings.showStatusNotesSupplier)
            ),
            groups = listOf(
                OrderHeadingEditorGroup(
                    key = "steps",
                    title = "Status Dropdown Headings",
                    description = "These values appear in the production status dropdowns.",
                    addLabel = "Add Step",
                    emptyText = "At least one production step is required.",
                    items = headingItemsFromTitles(settings.customSteps, "status-step"),
                    minimumCount = 1
                ),
                OrderHeadingEditorGroup(
                    key = "toggles",
                    title = "Extra Yes / No Checks",
                    description = "Optional switches shown in the Production Status card.",
                    addLabel = "Add Yes / No",
                    emptyText = "No extra Yes / No checks yet.",
                    items = headingItemsFromTitles(settings.customToggles, "status-toggle")
                )
            ),
            saveMessage = "Production status headings saved.",
            buildUpdates = { draft ->
                val stepTitles = normalizeOrderTitleList(draft.groups["steps"].orEmpty().map { it.title }, listOf("Design", "Painting"))
                val summary1 = cleanOrderHeadingField(draft.fields["summaryStep1"], stepTitles.firstOrNull() ?: "Design")
                val summary2 = cleanOrderHeadingField(draft.fields["summaryStep2"], stepTitles.getOrNull(1) ?: summary1)
                mapOf(
                    "customStepsJSON" to titleArrayJsonForOrder(stepTitles),
                    "customTogglesJSON" to titleArrayJsonForOrder(draft.groups["toggles"].orEmpty().map { it.title }),
                    "showStatusNotesSupplier" to (draft.toggles["showStatusNotesSupplier"] ?: false),
                    "statusNotesSupplierLabel" to cleanOrderHeadingField(draft.fields["statusNotesSupplierLabel"], "Notes / Supplier"),
                    "summaryStep1" to summary1,
                    "summaryStep2" to summary2,
                    "orderListStep1" to cleanOrderHeadingField(draft.fields["orderListStep1"], summary1),
                    "orderListStep2" to cleanOrderHeadingField(draft.fields["orderListStep2"], summary2)
                )
            }
        )
        OrderDetailCardId.Customer -> OrderHeadingEditorConfig(
            title = "Edit Customer & Communication Headings",
            subtitle = "Edit customer custom fields, contact field visibility, and channel button names.",
            toggles = listOf(
                OrderHeadingEditorToggle("communicationShowTelephone", "Show telephone", settings.communicationShowTelephone),
                OrderHeadingEditorToggle("communicationShowEmail", "Show email", settings.communicationShowEmail),
                OrderHeadingEditorToggle("communicationShowAddress", "Show address", settings.communicationShowAddress),
                OrderHeadingEditorToggle("communicationShowChannel", "Show channel buttons", settings.communicationShowChannel),
                OrderHeadingEditorToggle("communicationShowCustomerNotes", "Show customer notes", settings.communicationShowCustomerNotes)
            ),
            groups = listOf(
                OrderHeadingEditorGroup(
                    key = "customFields",
                    title = "Customer & Design Fields",
                    description = "Extra text fields inside the Customer & Communication card.",
                    addLabel = "Add Heading",
                    emptyText = "No custom customer fields yet.",
                    items = headingItemsFromTitles(settings.customFields, "customer-field")
                ),
                OrderHeadingEditorGroup(
                    key = "channels",
                    title = "Channel Button Names",
                    description = "Names for Instagram, WhatsApp, TikTok or any other channel buttons.",
                    addLabel = "Add Channel",
                    emptyText = "No channel buttons yet.",
                    items = headingItemsFromTitles(settings.communicationChannelLabels, "channel")
                )
            ),
            saveMessage = "Customer and communication headings saved.",
            buildUpdates = { draft ->
                mapOf(
                    "customFieldsJSON" to titleArrayJsonForOrder(draft.groups["customFields"].orEmpty().map { it.title }),
                    "communicationShowTelephone" to (draft.toggles["communicationShowTelephone"] ?: true),
                    "communicationShowEmail" to (draft.toggles["communicationShowEmail"] ?: true),
                    "communicationShowAddress" to (draft.toggles["communicationShowAddress"] ?: true),
                    "communicationShowChannel" to (draft.toggles["communicationShowChannel"] ?: true),
                    "communicationShowCustomerNotes" to (draft.toggles["communicationShowCustomerNotes"] ?: true),
                    "communicationChannelLabelsJSON" to stringArrayJsonForOrder(draft.groups["channels"].orEmpty().map { it.title })
                )
            }
        )
        OrderDetailCardId.Notes -> {
            val normalizedGlobals = normalizeSpecialNoteSectionsForOrder(settings.specialNoteSections)
            val globalIds = normalizedGlobals.map { it.id }.toSet()
            val extras = perOrderExtraNoteSections.filter { it.id !in globalIds }
            val originalGlobalIds = normalizedGlobals.map { it.id }.toSet()
            val originalPerOrderIds = extras.map { it.id }.toSet()
            OrderHeadingEditorConfig(
                title = "Edit Notes Headings",
                subtitle = "Add, remove, or rename note fields. New ones are added to this order only.",
                groups = listOf(
                    OrderHeadingEditorGroup(
                        key = "notes",
                        title = "Special Note Fields",
                        description = "The first Special Notes field is kept as the primary shared notes field.",
                        addLabel = "Add Note Field",
                        emptyText = "No special note fields yet.",
                        items = normalizedGlobals + extras,
                        lockedFirstId = STUDIO_PRIMARY_SPECIAL_NOTE_ID,
                        minimumCount = 1
                    )
                ),
                saveMessage = "Notes headings saved.",
                buildUpdates = { draft ->
                    val allItems = draft.groups["notes"].orEmpty()
                    val globalsOnly = mutableListOf<StudioHeadingItem>()
                    val perOrderOnly = mutableListOf<StudioHeadingItem>()
                    for (item in allItems) {
                        when {
                            item.id in originalPerOrderIds -> perOrderOnly.add(item)
                            item.id in originalGlobalIds || item.id.equals(STUDIO_PRIMARY_SPECIAL_NOTE_ID, ignoreCase = true) -> globalsOnly.add(item)
                            else -> perOrderOnly.add(item) // New item → per-order
                        }
                    }
                    val json = specialNoteSectionsJsonForOrder(globalsOnly)
                    mapOf(
                        "specialNoteSectionsJSON" to json,
                        "specialNoteSectionsJSONV1" to json,
                        "__perOrderNoteExtras__" to perOrderOnly
                    )
                }
            )
        }
        OrderDetailCardId.Materials -> OrderHeadingEditorConfig(
            title = "Edit Materials Headings",
            subtitle = "Edit default material checks, extra Yes / No checks, and the Notes / Supplier field.",
            fields = listOf(
                OrderHeadingEditorField("materialsNotesSupplierLabel", "Notes / Supplier heading", settings.materialsNotesSupplierLabel, "Notes / Supplier")
            ),
            toggles = listOf(
                OrderHeadingEditorToggle("showMaterialsNotesSupplier", "Show Notes / Supplier field", settings.showMaterialsNotesSupplier)
            ),
            groups = listOf(
                OrderHeadingEditorGroup(
                    key = "defaultChecks",
                    title = "Default Material Checks",
                    description = "Main material rows shown in Materials & Inventory.",
                    addLabel = "Add Material Check",
                    emptyText = "At least one material check is required.",
                    items = headingItemsFromTitles(settings.materialsDefaultChecks, "material-check"),
                    minimumCount = 1
                ),
                OrderHeadingEditorGroup(
                    key = "toggles",
                    title = "Extra Yes / No Checks",
                    description = "Optional switches shown in the Materials & Inventory card.",
                    addLabel = "Add Yes / No",
                    emptyText = "No extra Yes / No checks yet.",
                    items = headingItemsFromTitles(settings.materialsToggles, "material-toggle")
                )
            ),
            saveMessage = "Materials headings saved.",
            buildUpdates = { draft ->
                val defaultChecks = normalizeOrderTitleList(draft.groups["defaultChecks"].orEmpty().map { it.title }, listOf("Material Check 1"))
                val padded = defaultChecks + listOf("Item", "Item", "Item", "Materials Ready")
                mapOf(
                    "materialsDefaultChecksJSON" to titleArrayJsonForOrder(defaultChecks),
                    "invLabel1" to padded[0],
                    "invLabel2" to padded[1],
                    "invLabel3" to padded[2],
                    "invLabel4" to padded[3],
                    "materialsTogglesJSON" to titleArrayJsonForOrder(draft.groups["toggles"].orEmpty().map { it.title }),
                    "showMaterialsNotesSupplier" to (draft.toggles["showMaterialsNotesSupplier"] ?: true),
                    "materialsNotesSupplierLabel" to cleanOrderHeadingField(draft.fields["materialsNotesSupplierLabel"], "Notes / Supplier")
                )
            }
        )
        OrderDetailCardId.Schedule -> OrderHeadingEditorConfig(
            title = "Edit Quick Reminder Headings",
            subtitle = "Edit the shortcut titles shown in Schedule & Alerts. Existing timing and priority are preserved where possible.",
            groups = listOf(
                OrderHeadingEditorGroup(
                    key = "reminders",
                    title = "Quick Reminders",
                    description = "Saved reminder shortcuts for the Schedule & Alerts card.",
                    addLabel = "Add Reminder",
                    emptyText = "No quick reminders yet.",
                    items = settings.scheduleQuickReminders.map { StudioHeadingItem(it.id, it.title) }
                )
            ),
            saveMessage = "Quick reminder headings saved.",
            buildUpdates = { draft ->
                mapOf(
                    "scheduleQuickRemindersJSON" to quickReminderTemplatesJsonForOrder(
                        draft.groups["reminders"].orEmpty(),
                        settings.scheduleQuickReminders
                    )
                )
            }
        )
        OrderDetailCardId.InvoiceItems -> OrderHeadingEditorConfig(
            title = "Invoice Items",
            subtitle = "Company invoice numbers (VAT, EORI, company no.) shown on the invoice PDF. Saved for your whole workspace.",
            companyNumbers = settings.companyNumbers,
            saveMessage = "Invoice numbers saved.",
            buildUpdates = { emptyMap() }
        )
        else -> null
    }
}

private fun List<StudioHeadingItem>.movedHeadingItem(from: Int, to: Int): List<StudioHeadingItem> {
    if (from !in indices || to !in indices || from == to) return this
    return toMutableList().also { list ->
        val item = list.removeAt(from)
        list.add(to, item)
    }
}

private fun newOrderHeadingId(label: String, index: Int): String {
    val slug = label
        .lowercase(Locale.UK)
        .replace(Regex("[^a-z0-9]+"), "-")
        .trim('-')
        .ifBlank { "heading" }
    return "android-$slug-${System.currentTimeMillis()}-$index".take(80)
}

private fun cleanOrderHeadingField(value: String?, fallback: String): String {
    return value.orEmpty().trim().take(120).ifBlank { fallback }
}

private fun normalizeOrderTitleList(values: List<String>, fallback: List<String> = emptyList()): List<String> {
    val cleaned = values
        .map { it.trim().take(120) }
        .filter { it.isNotBlank() }
        .distinctBy { it.lowercase(Locale.UK) }
        .take(40)
    return cleaned.ifEmpty { fallback }
}

private fun headingItemsFromTitles(values: List<String>, idPrefix: String): List<StudioHeadingItem> {
    return normalizeOrderTitleList(values).mapIndexed { index, title ->
        StudioHeadingItem("$idPrefix-$index-${title.lowercase(Locale.UK).take(18)}", title)
    }
}

private fun normalizeHeadingItemsForOrder(values: List<StudioHeadingItem>): List<StudioHeadingItem> {
    val cleaned = mutableListOf<StudioHeadingItem>()
    values.forEachIndexed { index, item ->
        val title = item.title.trim().take(120)
        if (title.isBlank()) return@forEachIndexed
        val id = item.id.trim().take(80).ifBlank { newOrderHeadingId(title, index) }
        if (cleaned.none { existing -> existing.id.equals(id, ignoreCase = true) }) {
            cleaned.add(StudioHeadingItem(id, title))
        }
    }
    return cleaned.take(40)
}

private fun normalizeSpecialNoteSectionsForOrder(values: List<StudioHeadingItem>): List<StudioHeadingItem> {
    val cleaned = normalizeHeadingItemsForOrder(values).toMutableList()
    val primaryIndex = cleaned.indexOfFirst { it.id.equals(STUDIO_PRIMARY_SPECIAL_NOTE_ID, ignoreCase = true) }
    val primary = if (primaryIndex >= 0) {
        cleaned.removeAt(primaryIndex).copy(id = STUDIO_PRIMARY_SPECIAL_NOTE_ID)
    } else {
        StudioHeadingItem(STUDIO_PRIMARY_SPECIAL_NOTE_ID, "Special Notes")
    }
    cleaned.add(0, primary.copy(title = primary.title.ifBlank { "Special Notes" }))
    return cleaned.take(40)
}

private fun titleArrayJsonForOrder(values: List<String>): String {
    return JSONArray().also { array ->
        normalizeOrderTitleList(values).forEach { title ->
            array.put(JSONObject().put("title", title))
        }
    }.toString()
}

private fun stringArrayJsonForOrder(values: List<String>): String {
    return JSONArray().also { array ->
        normalizeOrderTitleList(values).forEach { title -> array.put(title) }
    }.toString()
}

private fun genericHeadingItemsJsonForOrder(values: List<StudioHeadingItem>): String {
    return JSONArray().also { array ->
        normalizeHeadingItemsForOrder(values).forEach { item ->
            array.put(JSONObject().put("id", item.id).put("title", item.title))
        }
    }.toString()
}

private fun specialNoteSectionsJsonForOrder(values: List<StudioHeadingItem>): String {
    return JSONArray().also { array ->
        normalizeSpecialNoteSectionsForOrder(values).forEach { item ->
            array.put(JSONObject().put("id", item.id).put("title", item.title))
        }
    }.toString()
}

private fun quickReminderTemplatesJsonForOrder(
    values: List<StudioHeadingItem>,
    existing: List<StudioQuickReminderTemplate>
): String {
    val byId = existing.associateBy { it.id }
    val byTitle = existing.associateBy { it.title.trim().lowercase(Locale.UK) }
    val normalized = normalizeHeadingItemsForOrder(values)
    return JSONArray().also { array ->
        normalized.forEachIndexed { index, item ->
            val existingTemplate = byId[item.id] ?: byTitle[item.title.trim().lowercase(Locale.UK)]
            val template = existingTemplate ?: StudioQuickReminderTemplate(
                id = item.id.ifBlank { "quick-reminder-$index" },
                title = item.title,
                days = 1,
                hours = 0,
                priority = "Normal",
                notify = true
            )
            array.put(
                JSONObject()
                    .put("id", item.id.ifBlank { template.id })
                    .put("title", item.title)
                    .put("days", template.days.coerceIn(0, 365))
                    .put("hours", template.hours.coerceIn(0, 23))
                    .put("priority", template.priority.ifBlank { "Normal" })
                    .put("notify", template.notify)
            )
        }
    }.toString()
}

/**
 * Resolves the layout the workspace saved for one order TYPE (e.g. "repair")
 * out of companySettings.typeWorkspaceSnapshotsJSON — a JSON map
 * { orderType: workspaceSnapshot } with the sharedWorkspaceSnapshotJSON shape.
 * Read-side only: callers must apply the result for display and never write it
 * back into a profile or the shared snapshot.
 */
private fun orderTypeCardLayoutFromSnapshotsJSON(raw: String, orderType: String): OrderDetailCardLayout? {
    if (raw.isBlank() || orderType.isBlank()) return null
    val map = runCatching { JSONObject(raw) }.getOrNull() ?: return null
    val snapshot = orderLayoutObject(map.opt(orderType)) ?: return null
    return orderDetailCardLayoutFromSnapshotJSON(snapshot.toString())
}

private fun orderDetailCardLayoutFromSnapshotJSON(raw: String): OrderDetailCardLayout? {
    val snapshot = runCatching { JSONObject(raw) }.getOrNull() ?: return null
    val columns = orderLayoutCardColumns(snapshot.opt("kartYerlesimi"))
        ?: orderLayoutCardColumns(snapshot.opt("columns"))
    val fallbackOrder = orderLayoutCardOrder(snapshot.opt("cardOrder")) ?: columns?.flatten()
    val phoneOrder = orderLayoutCardOrder(snapshot.opt("phoneKartSirasi"))
        ?: orderLayoutCardOrder(snapshot.opt("mobileCardOrder"))
        ?: orderLayoutCardOrder(snapshot.opt("phoneCardOrder"))
        ?: fallbackOrder
    val normalizedColumns = columns ?: fallbackOrder?.let { orderLayoutColumnsFromOrder(it) }
    val colors = orderLayoutCardStringMap(snapshot.opt("kartRenkleri")) +
        orderLayoutCardStringMap(snapshot.opt("cardColors"))
    val heights = orderLayoutCardIntMap(snapshot.opt("kartYukseklikleri")) +
        orderLayoutCardIntMap(snapshot.opt("cardHeights"))
    val orderHeights = orderLayoutOrderCardIntMap(snapshot.opt("orderKartYukseklikleri")) +
        orderLayoutOrderCardIntMap(snapshot.opt("orderCardHeights"))

    return OrderDetailCardLayout.normalized(
        columns = normalizedColumns,
        phoneOrder = phoneOrder,
        columnWidths = orderLayoutIntList(snapshot.opt("sutunGenislikleri"))
            ?: orderLayoutIntList(snapshot.opt("columnWidths"))
            ?: emptyList(),
        cardColors = colors,
        cardHeights = heights,
        orderCardHeights = orderHeights,
        visibility = orderLayoutCardBoolMap(snapshot.opt("visibility"))
    )
}

private fun orderLayoutColumnsFromOrder(cards: List<OrderDetailCardId>): List<List<OrderDetailCardId>> {
    return listOf(
        cards.take(2),
        cards.drop(2).take(5),
        cards.drop(7)
    )
}

private fun orderLayoutArray(value: Any?): JSONArray? {
    return when (value) {
        is JSONArray -> value
        is String -> runCatching { JSONArray(value) }.getOrNull()
        else -> null
    }
}

private fun orderLayoutObject(value: Any?): JSONObject? {
    return when (value) {
        is JSONObject -> value
        is String -> runCatching { JSONObject(value) }.getOrNull()
        else -> null
    }
}

private fun orderLayoutCardOrder(value: Any?): List<OrderDetailCardId>? {
    val array = orderLayoutArray(value) ?: return null
    val seen = linkedSetOf<OrderDetailCardId>()
    val cards = mutableListOf<OrderDetailCardId>()
    for (index in 0 until array.length()) {
        val card = OrderDetailCardId.fromRaw(array.optString(index))
        if (card != null && seen.add(card)) cards.add(card)
    }
    return cards.ifEmpty { null }
}

private fun orderLayoutCardColumns(value: Any?): List<List<OrderDetailCardId>>? {
    val array = orderLayoutArray(value) ?: return null
    val columns = mutableListOf<List<OrderDetailCardId>>()
    val seen = linkedSetOf<OrderDetailCardId>()
    for (columnIndex in 0 until array.length()) {
        val rawColumn = orderLayoutArray(array.opt(columnIndex))
        val column = mutableListOf<OrderDetailCardId>()
        if (rawColumn != null) {
            for (cardIndex in 0 until rawColumn.length()) {
                val card = OrderDetailCardId.fromRaw(rawColumn.optString(cardIndex))
                if (card != null && seen.add(card)) column.add(card)
            }
        }
        columns.add(column)
    }
    return columns.takeIf { it.isNotEmpty() }
}

private fun orderLayoutIntList(value: Any?): List<Int>? {
    val array = orderLayoutArray(value) ?: return null
    val values = mutableListOf<Int>()
    for (index in 0 until array.length()) {
        val number = when (val rawValue = array.opt(index)) {
            is Number -> rawValue.toInt()
            is String -> rawValue.toDoubleOrNull()?.toInt()
            else -> null
        }
        if (number != null) values.add(number)
    }
    return values.ifEmpty { null }
}

private fun orderLayoutCardStringMap(value: Any?): Map<OrderDetailCardId, String> {
    val objectValue = orderLayoutObject(value) ?: return emptyMap()
    val result = mutableMapOf<OrderDetailCardId, String>()
    objectValue.keys().forEach { key ->
        val card = OrderDetailCardId.fromRaw(key)
        val stringValue = objectValue.optString(key).trim()
        if (card != null && stringValue.isNotBlank()) result[card] = stringValue
    }
    return result
}

private fun orderLayoutCardBoolMap(value: Any?): Map<OrderDetailCardId, Boolean> {
    val objectValue = orderLayoutObject(value) ?: return emptyMap()
    val result = mutableMapOf<OrderDetailCardId, Boolean>()
    objectValue.keys().forEach { key ->
        val card = OrderDetailCardId.fromRaw(key)
        if (card != null) result[card] = objectValue.optBoolean(key, true)
    }
    return result
}

private fun orderLayoutCardIntMap(value: Any?): Map<OrderDetailCardId, Int> {
    val objectValue = orderLayoutObject(value) ?: return emptyMap()
    val result = mutableMapOf<OrderDetailCardId, Int>()
    objectValue.keys().forEach { key ->
        val card = OrderDetailCardId.fromRaw(key)
        val number = orderLayoutNumberToInt(objectValue.opt(key))
        if (card != null && number != null) result[card] = number
    }
    return result
}

private fun orderLayoutOrderCardIntMap(value: Any?): Map<String, Map<OrderDetailCardId, Int>> {
    val objectValue = orderLayoutObject(value) ?: return emptyMap()
    val result = mutableMapOf<String, Map<OrderDetailCardId, Int>>()
    objectValue.keys().forEach { orderId ->
        val heights = orderLayoutCardIntMap(objectValue.opt(orderId))
        if (orderId.isNotBlank() && heights.isNotEmpty()) result[orderId] = heights
    }
    return result
}

private fun orderLayoutNumberToInt(value: Any?): Int? {
    return when (value) {
        is Number -> value.toInt()
        is String -> value.toDoubleOrNull()?.toInt()
        else -> null
    }
}

private fun cardTransferData(cardId: OrderDetailCardId): DragAndDropTransferData {
    return DragAndDropTransferData(
        clipData = ClipData(
            ClipDescription("NivaDesk card", arrayOf(StudioCardDragMime, ClipDescription.MIMETYPE_TEXT_PLAIN)),
            ClipData.Item(cardId.raw)
        )
    )
}

@Composable
private fun CardColorSwatch(colorName: String, selected: Boolean) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val swatchColor = studioCardThemeColor(colorName) ?: MaterialTheme.colorScheme.surfaceVariant
    Surface(
        modifier = Modifier.size(18.dp),
        shape = RoundedCornerShape(5.dp),
        color = swatchColor.copy(alpha = if (colorName == "Default") 0.65f else 0.82f),
        border = BorderStroke(
            width = if (selected) 2.dp else 1.dp,
            color = if (selected) StudioBlue else MaterialTheme.colorScheme.outlineVariant
        )
    ) {
        if (selected) {
            Box(contentAlignment = Alignment.Center) {
                Surface(
                    modifier = Modifier.size(6.dp),
                    shape = RoundedCornerShape(3.dp),
                    color = MaterialTheme.colorScheme.surface
                ) {}
            }
        }
    }
}

private fun acceptsCardDrag(event: DragAndDropEvent): Boolean {
    val description = event.toAndroidDragEvent().clipDescription ?: return false
    return description.hasMimeType(StudioCardDragMime) ||
        description.hasMimeType(ClipDescription.MIMETYPE_TEXT_PLAIN)
}

private fun draggedCardFromEvent(event: DragAndDropEvent): OrderDetailCardId? {
    val clipData = event.toAndroidDragEvent().clipData ?: return null
    for (index in 0 until clipData.itemCount) {
        val card = OrderDetailCardId.fromRaw(clipData.getItemAt(index).text?.toString())
        if (card != null) return card
    }
    return null
}

private fun OrderDetailCardLayout.movePhoneCardAfter(
    dragged: OrderDetailCardId,
    target: OrderDetailCardId
): OrderDetailCardLayout {
    if (dragged == target) return this
    val nextOrder = phoneOrder.toMutableList()
    if (!nextOrder.remove(dragged)) nextOrder.add(dragged)
    val targetIndex = nextOrder.indexOf(target).takeIf { it >= 0 } ?: nextOrder.lastIndex
    nextOrder.add((targetIndex + 1).coerceIn(0, nextOrder.size), dragged)
    return OrderDetailCardLayout.normalized(
        columns = columns,
        phoneOrder = nextOrder,
        columnWidths = columnWidths,
        cardColors = cardColors,
        cardHeights = cardHeights,
        orderCardHeights = orderCardHeights,
        visibility = visibility
    )
}

private fun OrderDetailCardLayout.movePhoneCardBefore(
    dragged: OrderDetailCardId,
    target: OrderDetailCardId
): OrderDetailCardLayout {
    if (dragged == target) return this
    val nextOrder = phoneOrder.toMutableList()
    if (!nextOrder.remove(dragged)) nextOrder.add(dragged)
    val targetIndex = nextOrder.indexOf(target).takeIf { it >= 0 } ?: 0
    nextOrder.add(targetIndex.coerceIn(0, nextOrder.size), dragged)
    return OrderDetailCardLayout.normalized(
        columns = columns,
        phoneOrder = nextOrder,
        columnWidths = columnWidths,
        cardColors = cardColors,
        cardHeights = cardHeights,
        orderCardHeights = orderCardHeights,
        visibility = visibility
    )
}

private fun OrderDetailCardLayout.movePhoneCardBy(
    cardId: OrderDetailCardId,
    delta: Int
): OrderDetailCardLayout {
    val currentIndex = phoneOrder.indexOf(cardId).takeIf { it >= 0 } ?: return this
    return movePhoneCardToIndex(cardId, currentIndex + delta)
}

private fun OrderDetailCardLayout.movePhoneCardToIndex(
    cardId: OrderDetailCardId,
    targetIndex: Int
): OrderDetailCardLayout {
    val nextOrder = phoneOrder.toMutableList()
    if (!nextOrder.remove(cardId)) return this
    val cleanIndex = targetIndex.coerceIn(0, nextOrder.size)
    nextOrder.add(cleanIndex, cardId)
    return OrderDetailCardLayout.normalized(
        columns = columns,
        phoneOrder = nextOrder,
        columnWidths = columnWidths,
        cardColors = cardColors,
        cardHeights = cardHeights,
        orderCardHeights = orderCardHeights,
        visibility = visibility
    )
}

private fun OrderDetailCardLayout.moveDesktopCardAfter(
    dragged: OrderDetailCardId,
    targetColumn: Int,
    target: OrderDetailCardId
): OrderDetailCardLayout {
    if (dragged == target) return this
    val nextColumns = columns.map { it.toMutableList() }.toMutableList()
    nextColumns.forEach { it.remove(dragged) }
    while (nextColumns.size <= targetColumn) nextColumns.add(mutableListOf())
    val column = nextColumns[targetColumn]
    val targetIndex = column.indexOf(target).takeIf { it >= 0 } ?: column.lastIndex
    column.add((targetIndex + 1).coerceIn(0, column.size), dragged)
    return OrderDetailCardLayout.normalized(
        columns = nextColumns,
        phoneOrder = phoneOrder,
        columnWidths = columnWidths,
        cardColors = cardColors,
        cardHeights = cardHeights,
        orderCardHeights = orderCardHeights,
        visibility = visibility
    )
}

private fun OrderDetailCardLayout.moveDesktopCardBefore(
    dragged: OrderDetailCardId,
    targetColumn: Int,
    target: OrderDetailCardId
): OrderDetailCardLayout {
    if (dragged == target) return this
    val nextColumns = columns.map { it.toMutableList() }.toMutableList()
    nextColumns.forEach { it.remove(dragged) }
    while (nextColumns.size <= targetColumn) nextColumns.add(mutableListOf())
    val column = nextColumns[targetColumn]
    val targetIndex = column.indexOf(target).takeIf { it >= 0 } ?: 0
    column.add(targetIndex.coerceIn(0, column.size), dragged)
    return OrderDetailCardLayout.normalized(
        columns = nextColumns,
        phoneOrder = phoneOrder,
        columnWidths = columnWidths,
        cardColors = cardColors,
        cardHeights = cardHeights,
        orderCardHeights = orderCardHeights,
        visibility = visibility
    )
}

private fun OrderDetailCardLayout.moveDesktopCardWithinColumn(
    cardId: OrderDetailCardId,
    columnIndex: Int,
    delta: Int
): OrderDetailCardLayout {
    val column = columns.getOrNull(columnIndex) ?: return this
    val currentIndex = column.indexOf(cardId).takeIf { it >= 0 } ?: return this
    return moveDesktopCardToColumnIndex(cardId, columnIndex, currentIndex + delta)
}

private fun OrderDetailCardLayout.moveDesktopCardToColumnIndex(
    cardId: OrderDetailCardId,
    targetColumn: Int,
    targetIndex: Int
): OrderDetailCardLayout {
    val nextColumns = columns.map { it.toMutableList() }.toMutableList()
    nextColumns.forEach { it.remove(cardId) }
    while (nextColumns.size <= targetColumn) nextColumns.add(mutableListOf())
    val column = nextColumns[targetColumn]
    column.add(targetIndex.coerceIn(0, column.size), cardId)
    return OrderDetailCardLayout.normalized(
        columns = nextColumns,
        phoneOrder = phoneOrder,
        columnWidths = columnWidths,
        cardColors = cardColors,
        cardHeights = cardHeights,
        orderCardHeights = orderCardHeights,
        visibility = visibility
    )
}

private fun OrderDetailCardLayout.moveDesktopCardToColumnEnd(
    dragged: OrderDetailCardId,
    targetColumn: Int
): OrderDetailCardLayout {
    val nextColumns = columns.map { it.toMutableList() }.toMutableList()
    nextColumns.forEach { it.remove(dragged) }
    while (nextColumns.size <= targetColumn) nextColumns.add(mutableListOf())
    nextColumns[targetColumn].add(dragged)
    return OrderDetailCardLayout.normalized(
        columns = nextColumns,
        phoneOrder = phoneOrder,
        columnWidths = columnWidths,
        cardColors = cardColors,
        cardHeights = cardHeights,
        orderCardHeights = orderCardHeights,
        visibility = visibility
    )
}

private fun OrderDetailCardLayout.withCardVisibility(
    cardId: OrderDetailCardId,
    visible: Boolean
): OrderDetailCardLayout {
    val nextVisibility = visibility.toMutableMap()
    nextVisibility[cardId] = visible
    return OrderDetailCardLayout.normalized(
        columns = columns,
        phoneOrder = phoneOrder,
        columnWidths = columnWidths,
        cardColors = cardColors,
        cardHeights = cardHeights,
        orderCardHeights = orderCardHeights,
        visibility = nextVisibility
    )
}

private fun OrderDetailCardLayout.withCardColor(
    cardId: OrderDetailCardId,
    colorName: String
): OrderDetailCardLayout {
    val nextColors = cardColors.toMutableMap()
    if (colorName == "Default") {
        nextColors.remove(cardId)
    } else {
        nextColors[cardId] = colorName
    }
    return OrderDetailCardLayout.normalized(
        columns = columns,
        phoneOrder = phoneOrder,
        columnWidths = columnWidths,
        cardColors = nextColors,
        cardHeights = cardHeights,
        orderCardHeights = orderCardHeights,
        visibility = visibility
    )
}

private fun OrderDetailCardLayout.adjustColumnWidth(
    columnIndex: Int,
    delta: Int
): OrderDetailCardLayout {
    val nextWidths = columnWidths.toMutableList()
    while (nextWidths.size <= columnIndex) nextWidths.add(350)
    nextWidths[columnIndex] = (nextWidths[columnIndex] + delta).coerceIn(260, 800)
    return OrderDetailCardLayout.normalized(
        columns = columns,
        phoneOrder = phoneOrder,
        columnWidths = nextWidths,
        cardColors = cardColors,
        cardHeights = cardHeights,
        orderCardHeights = orderCardHeights,
        visibility = visibility
    )
}

private fun OrderDetailCardLayout.withColumnWidth(
    columnIndex: Int,
    width: Int
): OrderDetailCardLayout {
    val nextWidths = columnWidths.toMutableList()
    while (nextWidths.size <= columnIndex) nextWidths.add(350)
    nextWidths[columnIndex] = width.coerceIn(260, 800)
    return OrderDetailCardLayout.normalized(
        columns = columns,
        phoneOrder = phoneOrder,
        columnWidths = nextWidths,
        cardColors = cardColors,
        cardHeights = cardHeights,
        orderCardHeights = orderCardHeights,
        visibility = visibility
    )
}

private fun OrderDetailCardLayout.withDefaultColumnWidth(columnIndex: Int): OrderDetailCardLayout {
    val nextWidths = columnWidths.toMutableList()
    while (nextWidths.size <= columnIndex) nextWidths.add(350)
    nextWidths[columnIndex] = 350
    return OrderDetailCardLayout.normalized(
        columns = columns,
        phoneOrder = phoneOrder,
        columnWidths = nextWidths,
        cardColors = cardColors,
        cardHeights = cardHeights,
        orderCardHeights = orderCardHeights,
        visibility = visibility
    )
}

private fun OrderDetailCardLayout.withDefaultColumnWidths(): OrderDetailCardLayout {
    val widthCount = columns.size.coerceAtLeast(OrderDetailCardId.DefaultColumns.size)
    return OrderDetailCardLayout.normalized(
        columns = columns,
        phoneOrder = phoneOrder,
        columnWidths = List(widthCount) { 350 },
        cardColors = cardColors,
        cardHeights = cardHeights,
        orderCardHeights = orderCardHeights,
        visibility = visibility
    )
}

private fun OrderDetailCardLayout.withAllCardsVisible(): OrderDetailCardLayout {
    return OrderDetailCardLayout.normalized(
        columns = columns,
        phoneOrder = phoneOrder,
        columnWidths = columnWidths,
        cardColors = cardColors,
        cardHeights = cardHeights,
        orderCardHeights = orderCardHeights,
        visibility = OrderDetailCardId.DefaultOrder.associateWith { true }
    )
}

private fun OrderDetailCardLayout.withAllCardsAutoHeight(orderId: String): OrderDetailCardLayout {
    val nextOrderHeights = orderCardHeights.toMutableMap()
    nextOrderHeights.remove(orderId.trim())
    return OrderDetailCardLayout.normalized(
        columns = columns,
        phoneOrder = phoneOrder,
        columnWidths = columnWidths,
        cardColors = cardColors,
        cardHeights = emptyMap(),
        orderCardHeights = nextOrderHeights,
        visibility = visibility
    )
}

private fun OrderDetailCardLayout.withDefaultDesktopBoard(orderId: String): OrderDetailCardLayout {
    val nextOrderHeights = orderCardHeights.toMutableMap()
    nextOrderHeights.remove(orderId.trim())
    return OrderDetailCardLayout.normalized(
        columns = OrderDetailCardId.DefaultColumns,
        phoneOrder = phoneOrder,
        columnWidths = List(OrderDetailCardId.DefaultColumns.size) { 350 },
        cardColors = emptyMap(),
        cardHeights = emptyMap(),
        orderCardHeights = nextOrderHeights,
        visibility = OrderDetailCardId.DefaultOrder.associateWith { true }
    )
}

private fun OrderDetailCardLayout.savedHeightFor(
    cardId: OrderDetailCardId,
    orderId: String
): Int? {
    val cleanOrderId = orderId.trim()
    val orderHeight = if (cleanOrderId.isNotBlank()) {
        orderCardHeights[cleanOrderId]?.get(cardId)
    } else {
        null
    }
    return orderHeight ?: cardHeights[cardId]
}

private fun OrderDetailCardLayout.adjustCardHeight(
    cardId: OrderDetailCardId,
    orderId: String,
    delta: Int
): OrderDetailCardLayout {
    val currentHeight = savedHeightFor(cardId, orderId) ?: defaultRenderedCardHeight(cardId)
    return withCardHeight(cardId, orderId, currentHeight + delta)
}

private fun OrderDetailCardLayout.withCardHeight(
    cardId: OrderDetailCardId,
    orderId: String,
    height: Int
): OrderDetailCardLayout {
    val cleanHeight = height.coerceIn(minimumRenderedCardHeight(cardId), 1200)
    val nextHeights = cardHeights.toMutableMap()
    val nextOrderHeights = orderCardHeights.toMutableMap()
    val cleanOrderId = orderId.trim()
    if (cleanOrderId.isNotBlank()) {
        val perOrder = nextOrderHeights[cleanOrderId]?.toMutableMap() ?: mutableMapOf()
        perOrder[cardId] = cleanHeight
        nextOrderHeights[cleanOrderId] = perOrder
    } else {
        nextHeights[cardId] = cleanHeight
    }

    return OrderDetailCardLayout.normalized(
        columns = columns,
        phoneOrder = phoneOrder,
        columnWidths = columnWidths,
        cardColors = cardColors,
        cardHeights = nextHeights,
        orderCardHeights = nextOrderHeights,
        visibility = visibility
    )
}

private fun OrderDetailCardLayout.withCardAutoHeight(
    cardId: OrderDetailCardId,
    orderId: String
): OrderDetailCardLayout {
    val nextHeights = cardHeights.toMutableMap()
    nextHeights.remove(cardId)

    val nextOrderHeights = orderCardHeights.toMutableMap()
    val cleanOrderId = orderId.trim()
    if (cleanOrderId.isNotBlank()) {
        val perOrder = nextOrderHeights[cleanOrderId]?.toMutableMap()
        perOrder?.remove(cardId)
        if (perOrder.isNullOrEmpty()) {
            nextOrderHeights.remove(cleanOrderId)
        } else {
            nextOrderHeights[cleanOrderId] = perOrder
        }
    }

    return OrderDetailCardLayout.normalized(
        columns = columns,
        phoneOrder = phoneOrder,
        columnWidths = columnWidths,
        cardColors = cardColors,
        cardHeights = nextHeights,
        orderCardHeights = nextOrderHeights,
        visibility = visibility
    )
}

private fun defaultCardHeight(cardId: OrderDetailCardId): Int {
    return when (cardId) {
        OrderDetailCardId.Preview -> 430
        OrderDetailCardId.CustomerPortal -> 480
        OrderDetailCardId.Summary -> 260
        OrderDetailCardId.RepairIntake -> 520
        OrderDetailCardId.Estimate -> 520
        OrderDetailCardId.Customer -> 620
        OrderDetailCardId.InvoiceItems -> 460
        OrderDetailCardId.Materials -> 430
        OrderDetailCardId.Priority -> 200
        OrderDetailCardId.Delivery -> 520
        OrderDetailCardId.Notes -> 220
        OrderDetailCardId.ClientFiles -> 360
        OrderDetailCardId.Todo -> 520
        OrderDetailCardId.WorkTime -> 520
        OrderDetailCardId.HistoryLog -> 360
        OrderDetailCardId.Financial -> 640
        OrderDetailCardId.Status -> 260
        OrderDetailCardId.Shipping -> 260
        OrderDetailCardId.Schedule -> 390
    }
}

private fun defaultRenderedCardHeight(cardId: OrderDetailCardId): Int {
    return defaultCardHeight(cardId).coerceAtLeast(minimumRenderedCardHeight(cardId))
}

private fun minimumRenderedCardHeight(cardId: OrderDetailCardId?): Int {
    return when (cardId) {
        OrderDetailCardId.Preview -> 300
        OrderDetailCardId.CustomerPortal -> 360
        OrderDetailCardId.Summary -> 250
        OrderDetailCardId.RepairIntake -> 360
        OrderDetailCardId.Estimate -> 340
        OrderDetailCardId.Customer -> 430
        OrderDetailCardId.InvoiceItems -> 300
        OrderDetailCardId.Materials -> 390
        OrderDetailCardId.Priority -> 220
        OrderDetailCardId.Delivery -> 420
        OrderDetailCardId.Notes -> 220
        OrderDetailCardId.ClientFiles -> 310
        OrderDetailCardId.Todo -> 380
        OrderDetailCardId.WorkTime -> 390
        OrderDetailCardId.Financial -> 640
        OrderDetailCardId.Status -> 260
        OrderDetailCardId.Shipping -> 260
        OrderDetailCardId.Schedule -> 360
        OrderDetailCardId.HistoryLog -> 240
        null -> 160
    }
}

private fun orderDetailCardIdForTitle(title: String): OrderDetailCardId? {
    val compact = title
        .replace("&", "")
        .replace("/", "")
        .replace(",", "")
        .replace(" ", "")
        .lowercase(Locale.ROOT)
    return when {
        compact.contains("preview") -> OrderDetailCardId.Preview
        compact.contains("ordersummary") -> OrderDetailCardId.Summary
        compact.contains("customer") -> OrderDetailCardId.Customer
        compact.contains("material") -> OrderDetailCardId.Materials
        compact.contains("priority") || compact.contains("risk") -> OrderDetailCardId.Priority
        compact.contains("timeline") || compact.contains("delivery") -> OrderDetailCardId.Delivery
        compact.contains("notes") -> OrderDetailCardId.Notes
        compact.contains("clientfiles") || compact.contains("files") -> OrderDetailCardId.ClientFiles
        compact.contains("todo") -> OrderDetailCardId.Todo
        compact.contains("worktime") -> OrderDetailCardId.WorkTime
        compact.contains("financial") -> OrderDetailCardId.Financial
        compact.contains("productionstatus") || compact == "workflowcontrols" -> OrderDetailCardId.Status
        compact.contains("shipping") || compact.contains("tracking") -> OrderDetailCardId.Shipping
        compact.contains("schedule") || compact.contains("alerts") -> OrderDetailCardId.Schedule
        compact.contains("history") || compact.contains("log") -> OrderDetailCardId.HistoryLog
        else -> null
    }
}

private fun orderDetailCardIcon(cardId: OrderDetailCardId?): ImageVector {
    return when (cardId) {
        OrderDetailCardId.Preview -> Icons.Filled.PhotoLibrary
        OrderDetailCardId.CustomerPortal -> Icons.Filled.Person
        OrderDetailCardId.RepairIntake -> Icons.Filled.Inventory2
        OrderDetailCardId.Estimate -> Icons.Filled.Description
        OrderDetailCardId.Summary -> Icons.Filled.Description
        OrderDetailCardId.Customer -> Icons.Filled.Person
        OrderDetailCardId.InvoiceItems -> Icons.Filled.Description
        OrderDetailCardId.Materials -> Icons.Filled.Storage
        OrderDetailCardId.Priority -> Icons.Filled.Security
        OrderDetailCardId.Delivery -> Icons.Filled.Timeline
        OrderDetailCardId.Notes -> Icons.Filled.Description
        OrderDetailCardId.ClientFiles -> Icons.Filled.TableChart
        OrderDetailCardId.Todo -> Icons.Filled.CheckCircle
        OrderDetailCardId.WorkTime -> Icons.Filled.Timeline
        OrderDetailCardId.Financial -> Icons.Filled.Percent
        OrderDetailCardId.Status -> Icons.Filled.Palette
        OrderDetailCardId.Shipping -> Icons.Filled.ShoppingCart
        OrderDetailCardId.Schedule -> Icons.Filled.Info
        OrderDetailCardId.HistoryLog -> Icons.Filled.Info
        null -> Icons.Filled.Settings
    }
}

private fun orderDetailCardAccent(cardId: OrderDetailCardId?): Color {
    return when (cardId) {
        OrderDetailCardId.Preview -> StudioBlue
        OrderDetailCardId.CustomerPortal -> StudioBlue
        OrderDetailCardId.RepairIntake -> Color(0xFFE08A2E)
        OrderDetailCardId.Estimate -> Color(0xFF1D9E75)
        OrderDetailCardId.Summary -> Color(0xFF5B6CFF)
        OrderDetailCardId.Customer -> Color(0xFF00A3A3)
        OrderDetailCardId.InvoiceItems -> Color(0xFF1D9E75)
        OrderDetailCardId.Materials -> Color(0xFF7C8A00)
        OrderDetailCardId.Priority -> StudioRed
        OrderDetailCardId.Delivery -> StudioWarningOrange
        OrderDetailCardId.Notes -> Color(0xFF8E4DFF)
        OrderDetailCardId.ClientFiles -> Color(0xFF5E7CE2)
        OrderDetailCardId.Todo -> StudioBlue
        OrderDetailCardId.WorkTime -> Color(0xFF7A6A00)
        OrderDetailCardId.Financial -> StudioGreen
        OrderDetailCardId.Status -> Color(0xFF9A6A00)
        OrderDetailCardId.Shipping -> Color(0xFF5C6B7A)
        OrderDetailCardId.Schedule -> Color(0xFF6F7DFF)
        OrderDetailCardId.HistoryLog -> Color(0xFF77808F)
        null -> Color(0xFF8A8F98)
    }
}

// Fixed defaults, shared verbatim with web (CARD_COLOR_MEANINGS) and iOS.
private val OrderCardDefaultColorMeanings: Map<String, String> = mapOf(
    "Red" to "Urgent",
    "Orange" to "Waiting on customer",
    "Yellow" to "Needs review",
    "Green" to "Approved",
    "Blue" to "In production",
    "Purple" to "Finance",
    "Pink" to "Special"
)

// The label shown on a coloured card's chip. The workspace can override each
// colour via companySettings.cardColorMeaningsJSON (written by the web's
// "Manage colour labels" editor): an empty string hides the chip for that
// colour, a missing key keeps the default above.
private fun orderCardColorMeaning(colorName: String?, cardColorMeaningsJSON: String?): String? {
    val cleanColorName = colorName?.takeIf { it.isNotBlank() } ?: return null
    val defaultMeaning = OrderCardDefaultColorMeanings[cleanColorName] ?: return null
    val json = cardColorMeaningsJSON?.trim().orEmpty()
    if (json.isBlank()) return defaultMeaning
    return try {
        val parsed = JSONObject(json)
        if (parsed.has(cleanColorName)) {
            parsed.optString(cleanColorName).trim().take(40).ifBlank { null }
        } else {
            defaultMeaning
        }
    } catch (_: Exception) {
        defaultMeaning
    }
}

private fun studioCardThemeColor(colorName: String?): Color? {
    return when (colorName) {
        "Red" -> Color(0xFFFF3D3D)
        "Orange" -> StudioWarningOrange
        "Yellow" -> Color(0xFFFFD11F)
        "Green" -> Color(0xFF2ECC61)
        "Blue" -> Color(0xFF3385FF)
        "Purple" -> Color(0xFF9E61FF)
        "Pink" -> Color(0xFFFF3D9E)
        else -> null
    }
}

private fun OrderDetailCardLayout.toWorkspaceSnapshotJSON(): String {
    val columnsJSON = JSONArray()
    columns.forEach { column ->
        val columnJSON = JSONArray()
        column.forEach { card -> columnJSON.put(card.raw) }
        columnsJSON.put(columnJSON)
    }
    val phoneJSON = JSONArray()
    phoneOrder.forEach { card -> phoneJSON.put(card.raw) }
    val widthJSON = JSONArray()
    columnWidths.forEach { widthJSON.put(it) }
    val colorJSON = JSONObject()
    cardColors.forEach { (card, color) -> colorJSON.put(card.raw, color) }
    val heightJSON = JSONObject()
    cardHeights.forEach { (card, height) -> heightJSON.put(card.raw, height) }
    val orderHeightJSON = JSONObject()
    orderCardHeights.forEach { (orderId, heights) ->
        val perOrderJSON = JSONObject()
        heights.forEach { (card, height) -> perOrderJSON.put(card.raw, height) }
        if (perOrderJSON.length() > 0) orderHeightJSON.put(orderId, perOrderJSON)
    }
    val visibilityJSON = JSONObject()
    visibility.forEach { (card, visible) -> visibilityJSON.put(card.raw, visible) }

    return JSONObject()
        .put("version", 1)
        .put("sutunGenislikleri", widthJSON)
        .put("kartYerlesimi", columnsJSON)
        .put("phoneKartSirasi", phoneJSON)
        .put("kartYukseklikleri", heightJSON)
        .put("orderKartYukseklikleri", orderHeightJSON)
        .put("kartRenkleri", colorJSON)
        .put("visibility", visibilityJSON)
        .toString()
}

private fun savedCardLayoutProfilesForCurrentUser(
    existingJSON: String,
    userId: String,
    currentSnapshotJSON: String
): List<SavedCardLayoutProfile> {
    if (userId.isBlank()) return emptyList()
    val profiles = runCatching { JSONArray(existingJSON) }.getOrDefault(JSONArray())
    var currentProfile: JSONObject? = null
    for (index in 0 until profiles.length()) {
        val profile = profiles.optJSONObject(index) ?: continue
        if (profile.optString("userId") == userId) {
            currentProfile = profile
            break
        }
    }

    val savedArray = currentProfile?.opt("savedProfiles")?.let(::orderLayoutArray)
    val savedProfiles = mutableListOf<SavedCardLayoutProfile>()
    if (savedArray != null) {
        for (index in 0 until savedArray.length()) {
            val profile = savedArray.optJSONObject(index) ?: continue
            val snapshot = profile.optString("snapshotJSON").trim()
            if (snapshot.isBlank()) continue
            savedProfiles.add(
                SavedCardLayoutProfile(
                    id = uuidStringOrNew(profile.optString("id")),
                    name = profile.optString("name").trim().ifBlank { "Profile ${index + 1}" },
                    snapshotJSON = snapshot
                )
            )
        }
    }

    val fallbackSnapshot = currentProfile
        ?.optString("snapshotJSON")
        ?.trim()
        ?.ifBlank { currentSnapshotJSON }
        ?: currentSnapshotJSON
    return normalizedSavedCardLayoutProfiles(
        profiles = savedProfiles.ifEmpty {
            listOf(
                SavedCardLayoutProfile(
                    id = UUID.randomUUID().toString(),
                    name = "Profile 1",
                    snapshotJSON = fallbackSnapshot
                )
            )
        },
        fallbackSnapshotJSON = fallbackSnapshot
    )
}

private fun normalizedSavedCardLayoutProfiles(
    profiles: List<SavedCardLayoutProfile>,
    fallbackSnapshotJSON: String
): List<SavedCardLayoutProfile> {
    val clean = profiles
        .take(20)
        .mapIndexedNotNull { index, profile ->
            val snapshot = profile.snapshotJSON.trim().ifBlank { fallbackSnapshotJSON.trim() }
            if (snapshot.isBlank()) return@mapIndexedNotNull null
            SavedCardLayoutProfile(
                id = uuidStringOrNew(profile.id),
                name = profile.name.trim().ifBlank { "Profile ${index + 1}" }.take(48),
                snapshotJSON = snapshot
            )
        }
    return clean.ifEmpty {
        fallbackSnapshotJSON.trim().takeIf { it.isNotBlank() }?.let { snapshot ->
            listOf(
                SavedCardLayoutProfile(
                    id = UUID.randomUUID().toString(),
                    name = "Profile 1",
                    snapshotJSON = snapshot
                )
            )
        } ?: emptyList()
    }
}

private fun teamCardLayoutProfilesForDisplay(
    existingJSON: String,
    currentUserId: String
): List<TeamCardLayoutProfile> {
    val profiles = runCatching { JSONArray(existingJSON) }.getOrDefault(JSONArray())
    val result = mutableListOf<TeamCardLayoutProfile>()
    val seen = linkedSetOf<String>()
    for (index in 0 until profiles.length()) {
        val profile = profiles.optJSONObject(index) ?: continue
        val userId = profile.optString("userId").trim()
        val snapshot = profile.optString("snapshotJSON").trim()
        if (userId.isBlank() || snapshot.isBlank() || !seen.add(userId)) continue
        val displayName = profile.optString("displayName").trim()
            .ifBlank { profile.optString("email").trim() }
            .ifBlank { userId }
        val email = profile.optString("email").trim()
        val role = profile.optString("role").trim().ifBlank { "member" }
        val subtitle = listOf(email, role.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.UK) else it.toString() })
            .filter { it.isNotBlank() }
            .joinToString(" • ")
        result.add(
            TeamCardLayoutProfile(
                userId = userId,
                displayName = displayName,
                subtitle = subtitle.ifBlank { role },
                snapshotJSON = snapshot,
                isMine = currentUserId.isNotBlank() && userId == currentUserId
            )
        )
    }
    return result.sortedWith(
        compareByDescending<TeamCardLayoutProfile> { it.isMine }
            .thenBy { it.displayName.lowercase(Locale.UK) }
    )
}

private fun upsertSavedCardLayoutProfilesJSON(
    existingJSON: String,
    userId: String,
    workspace: StudioWorkspace?,
    savedProfiles: List<SavedCardLayoutProfile>,
    activeSnapshotJSON: String,
    syncSourceUserId: String = ""
): String? {
    if (userId.isBlank()) return null
    val profiles = runCatching { JSONArray(existingJSON) }.getOrDefault(JSONArray())
    var targetIndex = -1
    var targetProfile: JSONObject? = null
    for (index in 0 until profiles.length()) {
        val profile = profiles.optJSONObject(index) ?: continue
        if (profile.optString("userId") == userId) {
            targetIndex = index
            targetProfile = profile
            break
        }
    }

    val profile = targetProfile ?: JSONObject()
    profile.put("id", uuidStringOrNew(profile.optString("id")))
    profile.put("userId", userId)
    if (profile.optString("displayName").isBlank()) {
        profile.put("displayName", workspace?.accountDisplayName.orEmpty())
    }
    if (profile.optString("email").isBlank()) {
        profile.put("email", workspace?.ownerEmail.orEmpty())
    }
    profile.put("role", workspace?.role.orEmpty())
    profile.put("snapshotJSON", activeSnapshotJSON)
    val cleanSyncSource = syncSourceUserId.trim().takeIf { it.isNotBlank() && it != userId }
    if (cleanSyncSource == null) {
        profile.remove("syncSourceUserId")
    } else {
        profile.put("syncSourceUserId", cleanSyncSource)
    }
    profile.put("updatedAt", System.currentTimeMillis() / 1000.0)

    val savedArray = JSONArray()
    normalizedSavedCardLayoutProfiles(savedProfiles, activeSnapshotJSON).forEach { savedProfile ->
        savedArray.put(
            JSONObject()
                .put("id", uuidStringOrNew(savedProfile.id))
                .put("name", savedProfile.name)
                .put("snapshotJSON", savedProfile.snapshotJSON)
        )
    }
    profile.put("savedProfiles", savedArray)

    if (targetIndex >= 0) {
        profiles.put(targetIndex, profile)
    } else {
        profiles.put(profile)
    }
    return profiles.toString()
}

private fun currentWorkspaceProfileSyncSourceUserId(
    existingJSON: String,
    currentUserId: String
): String {
    if (currentUserId.isBlank()) return ""
    val profiles = runCatching { JSONArray(existingJSON) }.getOrDefault(JSONArray())
    for (index in 0 until profiles.length()) {
        val profile = profiles.optJSONObject(index) ?: continue
        if (profile.optString("userId") == currentUserId) {
            return profile.optString("syncSourceUserId").trim()
        }
    }
    return ""
}

private fun currentWorkspaceProfileSnapshotJSON(
    existingJSON: String,
    currentUserId: String
): String {
    if (currentUserId.isBlank()) return ""
    val profiles = runCatching { JSONArray(existingJSON) }.getOrDefault(JSONArray())
    for (index in 0 until profiles.length()) {
        val profile = profiles.optJSONObject(index) ?: continue
        if (profile.optString("userId") == currentUserId) {
            return profile.optString("snapshotJSON").trim()
        }
    }
    return ""
}

private fun uuidStringOrNew(raw: String): String {
    val clean = raw.trim()
    return runCatching { UUID.fromString(clean).toString() }.getOrNull()
        ?: UUID.randomUUID().toString()
}

private fun upsertWorkspaceUserProfileJSON(
    existingJSON: String,
    userId: String,
    workspace: StudioWorkspace?,
    snapshotJSON: String
): String? {
    if (userId.isBlank()) return null
    val profiles = runCatching { JSONArray(existingJSON) }.getOrDefault(JSONArray())
    var updated = false
    for (index in 0 until profiles.length()) {
        val profile = profiles.optJSONObject(index) ?: continue
        if (profile.optString("userId") == userId) {
            profile.put("id", uuidStringOrNew(profile.optString("id")))
            profile.put("snapshotJSON", snapshotJSON)
            profile.remove("syncSourceUserId")
            profile.put("updatedAt", System.currentTimeMillis() / 1000.0)
            profiles.put(index, profile)
            updated = true
            break
        }
    }
    if (!updated) {
        profiles.put(
            JSONObject()
                .put("id", UUID.randomUUID().toString())
                .put("userId", userId)
                .put("displayName", workspace?.accountDisplayName.orEmpty())
                .put("email", workspace?.ownerEmail.orEmpty())
                .put("role", workspace?.role.orEmpty())
                .put("snapshotJSON", snapshotJSON)
                .put("updatedAt", System.currentTimeMillis() / 1000.0)
                .put("savedProfiles", JSONArray())
        )
    }
    return profiles.toString()
}

@Composable
private fun SummaryValueBlock(
    modifier: Modifier = Modifier,
    label: String,
    value: String,
    valueColor: Color
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.78f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f))
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 11.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(
                text = label,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = value.ifBlank { "-" },
                color = valueColor,
                fontSize = 18.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun SummaryStatusLine(label: String, value: String, tone: Color) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            modifier = Modifier.weight(1f),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        StatusPill(value, tone)
    }
}

@Composable
private fun SummaryDateBlock(
    modifier: Modifier = Modifier,
    label: String,
    value: String,
    valueColor: Color
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(13.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.72f)
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(5.dp)
        ) {
            Text(
                text = label,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = value.ifBlank { "-" },
                color = valueColor,
                fontSize = 14.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String, valueColor: Color = MaterialTheme.colorScheme.onSurface) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.Top
    ) {
        Text(
            text = label,
            modifier = Modifier.weight(0.42f),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
        Text(
            text = value,
            modifier = Modifier.weight(0.58f),
            color = valueColor,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun DetailListRow(title: String, subtitle: String, tone: Color) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
        Row(
            modifier = Modifier.padding(horizontal = 11.dp, vertical = 9.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(9.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(10.dp)
                    .background(tone, RoundedCornerShape(999.dp))
                    .padding(top = 2.dp)
            )
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    text = title.ifBlank { "-" },
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.ExtraBold
                )
                if (subtitle.isNotBlank()) {
                    Text(
                        text = subtitle,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}

@Composable
private fun BooleanRow(label: String, value: Boolean) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    InfoRow(label, yesNo(value), if (value) StudioGreen else MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun StatusPill(label: String, color: Color) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = color.copy(alpha = 0.15f),
        border = BorderStroke(1.dp, color.copy(alpha = 0.22f))
    ) {
        Text(
            text = label.ifBlank { "Not Yet" },
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp),
            color = color,
            fontWeight = FontWeight.ExtraBold,
            fontSize = 10.sp,
            maxLines = 1
        )
    }
}

@Composable
private fun AssignmentMenuForDetail(
    order: StudioOrder,
    teamMembers: List<StudioTeamMember>,
    onAssignOrder: (StudioOrder, StudioTeamMember?) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var expanded by remember { mutableStateOf(false) }
    Button(
        onClick = { expanded = true },
        shape = RoundedCornerShape(9.dp),
        modifier = Modifier.height(34.dp)
    ) {
        Text(t("Assign"), fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
        DropdownMenuItem(
            text = { Text(t("Unassigned")) },
            onClick = {
                expanded = false
                onAssignOrder(order, null)
            }
        )
        teamMembers.filter { it.role != "owner" }.forEach { member ->
            DropdownMenuItem(
                text = { Text(member.label) },
                onClick = {
                    expanded = false
                    onAssignOrder(order, member)
                }
            )
        }
    }
}

@Composable
private fun TodoAssigneeMenu(
    label: String,
    selectedMemberId: String,
    teamMembers: List<StudioTeamMember>,
    onSelect: (StudioTeamMember?) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var expanded by remember { mutableStateOf(false) }
    val selectedMember = teamMembers.firstOrNull { it.id == selectedMemberId }
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        FinanceRowLabel(label, modifier = Modifier.weight(0.42f))
        Box(modifier = Modifier.weight(0.58f)) {
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = MaterialTheme.colorScheme.surfaceVariant,
                onClick = { expanded = true }
            ) {
                Text(
                    text = selectedMember?.label ?: "Unassigned",
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    color = if (selectedMember == null) MaterialTheme.colorScheme.onSurfaceVariant else StudioBlue,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                DropdownMenuItem(
                    text = { Text(t("Unassigned")) },
                    onClick = {
                        expanded = false
                        onSelect(null)
                    }
                )
                teamMembers.filter { !it.isOwner }.forEach { member ->
                    DropdownMenuItem(
                        text = { Text(member.label) },
                        onClick = {
                            expanded = false
                            onSelect(member)
                        }
                    )
                }
            }
        }
    }
}

private fun assigneeLabelForDetail(order: StudioOrder, members: List<StudioTeamMember>): String {
    val member = members.firstOrNull { it.id == order.assignedToUid }
        ?: members.firstOrNull { it.email.equals(order.assignedToEmail, ignoreCase = true) }
    return member?.label ?: uk.co.eggcraft.studioflow.data.model.emailName(order.assignedToEmail)
}

private fun taskAssignee(item: StudioTodoItem, members: List<StudioTeamMember>): StudioTeamMember? {
    return members.firstOrNull { it.id == item.assignedToUid }
        ?: members.firstOrNull { it.email.equals(item.assignedToEmail, ignoreCase = true) }
}

private fun taskAssigneeLabel(item: StudioTodoItem, members: List<StudioTeamMember>): String {
    return taskAssignee(item, members)?.label
        ?: uk.co.eggcraft.studioflow.data.model.emailName(item.assignedToEmail)
}

private fun displayNameForUri(context: Context, uri: Uri): String {
    return runCatching {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (index >= 0) cursor.getString(index).orEmpty() else ""
                } else {
                    ""
                }
            }.orEmpty()
    }.getOrDefault("")
        .ifBlank { uri.lastPathSegment.orEmpty().substringAfterLast("/") }
        .ifBlank { "Client file" }
}

private fun readBytesForUri(context: Context, uri: Uri): ByteArray? {
    runCatching {
        context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    return runCatching {
        context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
    }.getOrNull()
}

private tailrec fun Context.findActivity(): Activity? {
    return when (this) {
        is Activity -> this
        is ContextWrapper -> baseContext.findActivity()
        else -> null
    }
}

private fun acceptsClientFileDrag(event: DragAndDropEvent): Boolean {
    val androidEvent = event.toAndroidDragEvent()
    if (androidEvent.clipDescription?.hasMimeType(ClipDescription.MIMETYPE_TEXT_URILIST) == true) {
        return true
    }
    return clientFileUrisFromEvent(event).isNotEmpty()
}

private fun clientFileUrisFromEvent(event: DragAndDropEvent): List<Uri> {
    val clipData = event.toAndroidDragEvent().clipData ?: return emptyList()
    return (0 until clipData.itemCount).mapNotNull { index ->
        clipData.getItemAt(index).uri
    }
}

private fun uploadClientFileFromUri(
    context: Context,
    order: StudioOrder,
    uri: Uri,
    onUploadClientFile: (StudioOrder, ByteArray, String, String) -> Unit
): Boolean {
    val bytes = readBytesForUri(context, uri) ?: return false
    val fileName = displayNameForUri(context, uri)
    val contentType = context.contentResolver.getType(uri).orEmpty()
    onUploadClientFile(order, bytes, fileName, contentType)
    return true
}

private fun isClientFileImage(contentType: String, fileName: String): Boolean {
    val cleanType = contentType.lowercase()
    val extension = fileName.substringAfterLast(".", "").lowercase()
    return cleanType.startsWith("image/") || extension in setOf("jpg", "jpeg", "png", "webp", "heic", "heif")
}

// Rebrands a raw Firebase Storage download URL as a nivadesk.app viewer link.
// Use ONLY for opening/sharing links (so the address shows nivadesk.app);
// inline previews and the "use as preview" raw URL stay unchanged.
internal fun maskFileUrl(raw: String): String {
    return try {
        val uri = android.net.Uri.parse(raw)
        if (uri.host != "firebasestorage.googleapis.com") return raw
        val path = uri.path ?: return raw // Uri.path is percent-decoded
        val idx = path.indexOf("/o/")
        if (idx < 0) return raw
        val beforeO = path.substring(0, idx)
        val storagePath = path.substring(idx + 3)
        if (!beforeO.startsWith("/v0/b/")) return raw
        val bucket = beforeO.removePrefix("/v0/b/")
        val token = uri.getQueryParameter("token") ?: return raw
        if (bucket.isEmpty() || storagePath.isEmpty()) return raw
        val segments = storagePath.split("/").joinToString("/") { android.net.Uri.encode(it) }
        "https://nivadesk.app/f/$segments?b=${android.net.Uri.encode(bucket)}&t=${android.net.Uri.encode(token)}"
    } catch (e: Exception) {
        raw
    }
}

// Creates a short, clean nivadesk.app link (company id + token hidden) via a
// server-side mapping. Falls back to the path-based masked URL on any failure.
// The estimate card talks to the server directly rather than threading four new
// callbacks down through the screen: order.companyId is all the auth needs.
internal suspend fun loadEstimateRecord(companyId: String, orderId: String, estimateId: String): StudioEstimateRecord? {
    val result = com.google.firebase.functions.FirebaseFunctions.getInstance("europe-west2")
        .getHttpsCallable("getOrderEstimateRecord")
        .call(mapOf("companyId" to companyId, "orderId" to orderId, "estimateId" to estimateId))
        .await()
    return parseEstimateRecord((result.getData() as? Map<*, *>)?.get("record"))
}

internal suspend fun createEstimateForOrder(order: StudioOrder, supersedesId: String?): Unit {
    val lines = order.lineItems.map {
        mapOf("name" to it.name, "quantity" to it.quantity, "unitPrice" to it.unitPrice, "lineTotal" to it.lineTotal)
    }
    val payload = mutableMapOf<String, Any>(
        "companyId" to order.companyId,
        "orderId" to order.id,
        "lineItems" to lines,
        "taxRate" to order.taxRate,
        "taxType" to order.taxType
    )
    if (!supersedesId.isNullOrBlank()) payload["supersedesId"] = supersedesId
    com.google.firebase.functions.FirebaseFunctions.getInstance("europe-west2")
        .getHttpsCallable("createOrderEstimate").call(payload).await()
}

// Returns the customer's link. There is no outbound email to customers, so the
// caller copies it and the jeweller sends it themselves.
internal suspend fun sendEstimateForOrder(order: StudioOrder, estimateId: String): String {
    val result = com.google.firebase.functions.FirebaseFunctions.getInstance("europe-west2")
        .getHttpsCallable("sendOrderEstimate")
        .call(mapOf("companyId" to order.companyId, "orderId" to order.id, "estimateId" to estimateId))
        .await()
    return (result.getData() as? Map<*, *>)?.get("url") as? String ?: ""
}

internal suspend fun revokeEstimateLinkForOrder(order: StudioOrder, estimateId: String) {
    com.google.firebase.functions.FirebaseFunctions.getInstance("europe-west2")
        .getHttpsCallable("revokeOrderEstimateLink")
        .call(mapOf("companyId" to order.companyId, "orderId" to order.id, "estimateId" to estimateId))
        .await()
}

internal suspend fun createSharedFileLink(rawUrl: String): String {
    if (rawUrl.isBlank()) return rawUrl
    return try {
        val result = com.google.firebase.functions.FirebaseFunctions.getInstance("europe-west2")
            .getHttpsCallable("nvCreateFileLink")
            .call(mapOf("url" to rawUrl))
            .await()
        val data = result.getData() as? Map<*, *>
        val id = data?.get("id") as? String
        if (!id.isNullOrBlank()) {
            val ext = (data["ext"] as? String)?.takeIf { it.isNotBlank() }?.let { ".$it" } ?: ""
            "https://nivadesk.app/f/$id$ext"
        } else {
            maskFileUrl(rawUrl)
        }
    } catch (e: Exception) {
        maskFileUrl(rawUrl)
    }
}

// In-app client file viewer (matches the Mac preview sheet): images render inline
// with Coil, PDFs via the Google Docs viewer, other types show a fallback. The
// "Open externally" button uses the short branded nivadesk.app link.
@Composable
internal fun ClientFilePreviewDialog(
    file: StudioClientFile,
    isCurrentPreview: Boolean = false,
    onUseAsPreview: (() -> Unit)? = null,
    onDismiss: () -> Unit,
    onOpenExternal: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val isImage = isClientFileImage(file.contentType, file.fileName)
    val isPdf = file.contentType.lowercase().contains("pdf") || file.fileName.lowercase().endsWith(".pdf")
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(modifier = Modifier.fillMaxSize(), color = Color(0xFF101012)) {
            Column(modifier = Modifier.fillMaxSize()) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 6.dp, top = 8.dp, bottom = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        file.fileName,
                        color = Color.White,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 15.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Filled.Close, contentDescription = t("Close"), tint = Color.White)
                    }
                }
                Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    when {
                        isImage && file.downloadUrl.isNotBlank() -> {
                            AsyncImage(
                                model = file.downloadUrl,
                                contentDescription = file.fileName,
                                contentScale = ContentScale.Fit,
                                modifier = Modifier.fillMaxSize()
                            )
                        }
                        isPdf && file.downloadUrl.isNotBlank() -> {
                            AndroidView(
                                modifier = Modifier.fillMaxSize(),
                                factory = { ctx ->
                                    android.webkit.WebView(ctx).apply {
                                        settings.javaScriptEnabled = true
                                        settings.loadWithOverviewMode = true
                                        settings.useWideViewPort = true
                                        webViewClient = android.webkit.WebViewClient()
                                        loadUrl("https://docs.google.com/gview?embedded=1&url=" + android.net.Uri.encode(file.downloadUrl))
                                    }
                                }
                            )
                        }
                        else -> {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(10.dp),
                                modifier = Modifier.padding(28.dp)
                            ) {
                                Icon(Icons.Filled.Description, contentDescription = null, tint = Color.White.copy(alpha = 0.7f), modifier = Modifier.size(46.dp))
                                Text(t("Preview is not available for this file type."), color = Color.White.copy(alpha = 0.8f), fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                Text(t("Use Open to view this file in another app."), color = Color.White.copy(alpha = 0.55f), fontSize = 11.sp)
                            }
                        }
                    }
                }
                Row(modifier = Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (isImage && onUseAsPreview != null) {
                        Button(
                            onClick = onUseAsPreview,
                            enabled = !isCurrentPreview,
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = if (isCurrentPreview) StudioGreen else StudioBlue)
                        ) {
                            Icon(Icons.Filled.Image, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(if (isCurrentPreview) t("Used in Preview") else t("Use in Preview"), fontWeight = FontWeight.ExtraBold, maxLines = 1)
                        }
                    }
                    OutlinedButton(
                        onClick = onOpenExternal,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text(t("Open"), fontWeight = FontWeight.ExtraBold)
                    }
                }
            }
        }
    }
}

private fun downloadClientFile(context: Context, file: StudioClientFile) {
    if (file.downloadUrl.isBlank()) return
    try {
        val request = android.app.DownloadManager.Request(android.net.Uri.parse(file.downloadUrl))
            .setTitle(file.fileName)
            .setDescription("NivaDesk")
            .setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(android.os.Environment.DIRECTORY_DOWNLOADS, file.fileName)
        if (file.contentType.isNotBlank()) request.setMimeType(file.contentType)
        val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as android.app.DownloadManager
        manager.enqueue(request)
        android.widget.Toast.makeText(context, "Downloading ${file.fileName}", android.widget.Toast.LENGTH_SHORT).show()
    } catch (e: Exception) {
        android.widget.Toast.makeText(context, "Download failed", android.widget.Toast.LENGTH_SHORT).show()
    }
}

// Mac-style client file row: thumbnail (image preview / file-type icon), name +
// size·date + uploader, and compact action icons on the right.
@Composable
private fun ClientFileRowCard(
    file: StudioClientFile,
    enabled: Boolean,
    isCurrentPreview: Boolean,
    onPreview: () -> Unit,
    onDownload: () -> Unit,
    onOpenExternal: () -> Unit,
    onUseAsPreview: () -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var menuOpen by remember { mutableStateOf(false) }
    val isImage = isClientFileImage(file.contentType, file.fileName)
    val isPdf = file.contentType.lowercase().contains("pdf") || file.fileName.lowercase().endsWith(".pdf")
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled && file.downloadUrl.isNotBlank()) { onPreview() },
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
    ) {
        Row(
            modifier = Modifier.padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (isPdf) StudioRed.copy(alpha = 0.14f) else MaterialTheme.colorScheme.surface),
                contentAlignment = Alignment.Center
            ) {
                if (isImage && file.downloadUrl.isNotBlank()) {
                    AsyncImage(
                        model = file.downloadUrl,
                        contentDescription = file.fileName,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    Icon(
                        if (isPdf) Icons.Filled.PictureAsPdf else Icons.Filled.Description,
                        contentDescription = null,
                        tint = if (isPdf) StudioRed else StudioBlue,
                        modifier = Modifier.size(24.dp)
                    )
                }
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(file.fileName, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurface)
                Text(
                    listOf(fileSizeLabel(file.fileSize), shortDateOrDash(file.uploadedAt)).filter { it.isNotBlank() }.joinToString(" · "),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold
                )
                if (file.uploadedByEmail.isNotBlank()) {
                    Text(file.uploadedByEmail, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f), fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            if (enabled) {
                IconButton(onClick = onDownload, modifier = Modifier.size(36.dp), enabled = file.downloadUrl.isNotBlank()) {
                    Icon(Icons.Filled.Download, contentDescription = t("Download"), tint = StudioBlue, modifier = Modifier.size(19.dp))
                }
                IconButton(onClick = onOpenExternal, modifier = Modifier.size(36.dp), enabled = file.downloadUrl.isNotBlank()) {
                    Icon(Icons.Filled.Launch, contentDescription = t("Open"), tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
                }
                Box {
                    IconButton(onClick = { menuOpen = true }, modifier = Modifier.size(36.dp)) {
                        Icon(Icons.Filled.MoreVert, contentDescription = t("More"), tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        if (isImage && file.downloadUrl.isNotBlank()) {
                            DropdownMenuItem(
                                text = { Text(if (isCurrentPreview) t("Used in Preview") else t("Use in Preview"), fontWeight = FontWeight.SemiBold) },
                                leadingIcon = { Icon(Icons.Filled.Image, contentDescription = null, tint = if (isCurrentPreview) StudioGreen else StudioBlue) },
                                enabled = !isCurrentPreview,
                                onClick = { menuOpen = false; onUseAsPreview() }
                            )
                        }
                        DropdownMenuItem(
                            text = { Text(t("Rename"), fontWeight = FontWeight.SemiBold) },
                            leadingIcon = { Icon(Icons.Filled.Edit, contentDescription = null) },
                            onClick = { menuOpen = false; onRename() }
                        )
                        DropdownMenuItem(
                            text = { Text(t("Delete"), color = StudioRed, fontWeight = FontWeight.SemiBold) },
                            leadingIcon = { Icon(Icons.Filled.Delete, contentDescription = null, tint = StudioRed) },
                            onClick = { menuOpen = false; onDelete() }
                        )
                    }
                }
            }
        }
    }
}

private fun openDeliveryCalendarEvent(context: Context, order: StudioOrder) {
    val start = order.paymentDate.time
    val end = dueDate(order).time + DAY_MS
    val title = "NivaDesk: ${order.displayCustomerName}"
    val description = listOfNotNull(
        order.designName.takeIf { it.isNotBlank() },
        "Order value: ${order.orderValue}",
        "Delivery in: ${deliveryLabel(order)}"
    ).joinToString("\n")
    val intent = Intent(Intent.ACTION_INSERT)
        .setData(CalendarContract.Events.CONTENT_URI)
        .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, start)
        .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, end)
        .putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, true)
        .putExtra(CalendarContract.Events.TITLE, title)
        .putExtra(CalendarContract.Events.DESCRIPTION, description)
    orderCalendarLocation(order).takeIf { it.isNotBlank() }?.let { location ->
        intent.putExtra(CalendarContract.Events.EVENT_LOCATION, location)
    }
    runCatching { context.startActivity(intent) }
}

private fun orderCalendarLocation(order: StudioOrder): String {
    val keys = listOf("address", "location", "postcode", "post code", "city")
    return order.customFields.entries.firstOrNull { entry ->
        keys.any { key -> entry.key.contains(key, ignoreCase = true) }
    }?.value.orEmpty()
}

private fun trackingCustomKey(key: String): String = "tracking::$key"

private fun cleanTrackingNumber(value: String): String {
    return value.trim().replace(Regex("\\s+"), "")
}

private fun trackingValue(order: StudioOrder, key: String): String {
    val currentNumber = cleanTrackingNumber(order.trackingNumber)
    val storedNumber = cleanTrackingNumber(order.customFields[trackingCustomKey("trackingNumber")].orEmpty())
    if (key != "trackingNumber" && storedNumber.isNotBlank() && storedNumber != currentNumber) {
        return ""
    }
    return order.customFields[trackingCustomKey(key)].orEmpty()
        .ifBlank { if (key == "trackingNumber") order.trackingNumber else "" }
}

private fun trackingDisplayStatus(order: StudioOrder): String {
    return trackingValue(order, "statusText")
        .ifBlank { trackingValue(order, "status") }
        .ifBlank { "Not Registered" }
}

private fun trackingStatusColor(status: String): Color {
    val lowered = status.lowercase(Locale.ROOT)
    return when {
        "delivered" in lowered -> StudioGreen
        "exception" in lowered || "failed" in lowered || "expired" in lowered || "error" in lowered -> StudioRed
        "out for delivery" in lowered || "pickup" in lowered -> StudioWarningOrange
        "transit" in lowered || "inforeceived" in lowered || "register" in lowered -> StudioBlue
        "not found" in lowered || "pending" in lowered -> MaterialThemeColorFallback
        else -> StudioBlue
    }
}

private val MaterialThemeColorFallback = Color(0xFF8E8E93)

private fun trackingSupportColor(supportStatus: String, fallback: Color): Color {
    return when (supportStatus.trim().lowercase(Locale.ROOT)) {
        "active", "" -> fallback
        "waiting" -> StudioBlue
        "limited", "carrier_required", "unsupported" -> StudioWarningOrange
        "error" -> StudioRed
        else -> fallback
    }
}

private fun trackingSupportLabel(value: String): String {
    return when (value.trim().lowercase(Locale.ROOT)) {
        "active" -> "Active"
        "waiting" -> "Waiting"
        "limited" -> "Limited support"
        "carrier_required" -> "Carrier required"
        "unsupported" -> "Unsupported"
        "error" -> "Error"
        else -> value
    }
}

private fun trackingSupportMessage(message: String, key: String): String {
    return when (key.trim().lowercase(Locale.ROOT)) {
        "checking_support" -> "Checking 17TRACK support for this tracking number."
        "carrier_required_message" -> "Carrier could not be auto-detected. Choose the courier and refresh live status again."
        "registered_waiting" -> "Registered with 17TRACK and waiting for the next carrier update."
        "royal_mail_limited" -> "Royal Mail live updates can be limited for this service."
        "fedex_limited" -> "FedEx may need extra carrier details before full tracking is available."
        "token_missing" -> "Live tracking is not configured on the server yet."
        "courier_not_mapped" -> "This courier is not mapped for live tracking yet."
        else -> message
    }
}

private fun trackingOpenUrl(order: StudioOrder): String {
    return trackingValue(order, "trackingUrl").ifBlank {
        "https://www.17track.net/en/track-details?nums=${Uri.encode(cleanTrackingNumber(order.trackingNumber))}"
    }
}

private fun formatTrackingDisplayDate(value: String): String {
    val trimmed = value.trim()
    if (trimmed.isBlank()) return ""
    val patterns = listOf("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", "yyyy-MM-dd'T'HH:mm:ss'Z'")
    for (pattern in patterns) {
        val parsed = runCatching {
            SimpleDateFormat(pattern, Locale.UK).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }.parse(trimmed)
        }.getOrNull()
        if (parsed != null) return SimpleDateFormat("dd/MM/yy HH:mm", Locale.UK).format(parsed)
    }
    return trimmed
}

private const val DAY_MS = 24L * 60L * 60L * 1000L
private const val HOUR_MS = 60L * 60L * 1000L

private fun todoDueDateFromDays(daysText: String): String? {
    val days = daysText.toIntOrNull()?.coerceIn(0, 365) ?: return null
    return SimpleDateFormat("yyyy-MM-dd", Locale.UK).format(Date(System.currentTimeMillis() + days * DAY_MS))
}

private fun scheduleDueAtFromParts(daysText: String, hoursText: String): String {
    val days = daysText.toIntOrNull()?.coerceIn(0, 365) ?: 1
    val hours = hoursText.toIntOrNull()?.coerceIn(0, 23) ?: 0
    val date = Date(System.currentTimeMillis() + days * DAY_MS + hours * HOUR_MS)
    return SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.UK).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }.format(date)
}

private fun daysUntilText(date: Date?): String {
    if (date == null) return ""
    val today = System.currentTimeMillis() / DAY_MS
    val dueDay = date.time / DAY_MS
    return (dueDay - today).coerceAtLeast(0).toString()
}

private fun customFieldValue(order: StudioOrder, key: String): String {
    val target = key.trim().lowercase()
    return order.customFields.entries.firstOrNull { it.key.trim().lowercase() == target }?.value.orEmpty()
}

// Per-order spending / remaining headings + base-cost label. Each order keeps its own
// list in customFields (orderExpenseItemsJSON / orderRemainingItemsJSON), falling back to
// the workspace template when absent. Amounts stay keyed by title (financialExpense:: /
// financialRemaining::); the backend moves the amount key on rename and clears it on
// remove (it sees these per-order keys via updateWebOrder).
private const val ORDER_EXPENSE_ITEMS_KEY = "orderExpenseItemsJSON"
private const val ORDER_REMAINING_ITEMS_KEY = "orderRemainingItemsJSON"
private const val ORDER_BASE_COST_LABEL_KEY = "orderBaseCostLabel"

private fun orderFinancialItems(
    order: StudioOrder,
    key: String,
    autoPrefix: String,
    workspace: List<StudioHeadingItem>
): List<StudioHeadingItem> {
    val raw = order.customFields[key]?.trim().orEmpty()
    if (raw.isEmpty()) return normalizedFinancialItems(workspace, autoPrefix)
    return try {
        val arr = org.json.JSONArray(raw)
        val parsed = (0 until arr.length()).mapNotNull { i ->
            val obj = arr.optJSONObject(i) ?: return@mapNotNull null
            val title = obj.optString("title").trim()
            if (title.isBlank()) return@mapNotNull null
            StudioHeadingItem(obj.optString("id").trim().ifBlank { title }, title)
        }
        normalizedFinancialItems(parsed, autoPrefix)
    } catch (_: Throwable) {
        normalizedFinancialItems(workspace, autoPrefix)
    }
}

private fun orderBaseCostLabelValue(order: StudioOrder, workspaceLabel: String): String {
    val own = order.customFields[ORDER_BASE_COST_LABEL_KEY]?.trim().orEmpty()
    return own.ifBlank { workspaceLabel.ifBlank { "Cost (Base)" } }
}

// Persist a per-order heading list onto the order. The backend follows the edit on the
// keyed amounts (rename moves, remove clears), so the client only writes the list.
private fun saveOrderFinancialList(
    order: StudioOrder,
    key: String,
    items: List<StudioHeadingItem>,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    val json = genericHeadingItemsJsonForOrder(items)
    onUpdateOrderFields(order, mapOf("details" to mapOf("customFields" to mapOf(key to json))))
}

private fun setOrderBaseCostLabel(
    order: StudioOrder,
    label: String,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    onUpdateOrderFields(order, mapOf("details" to mapOf("customFields" to mapOf(ORDER_BASE_COST_LABEL_KEY to label.trim().take(120)))))
}

private fun nextFinancialDefaultTitle(existing: List<StudioHeadingItem>, base: String): String {
    val titles = existing.map { it.title.trim().lowercase() }.toSet()
    if (!titles.contains(base.lowercase())) return base
    var n = 2
    while (titles.contains("$base $n".lowercase())) n++
    return "$base $n"
}

private fun normalizedFinancialItems(values: List<StudioHeadingItem>, autoPrefix: String): List<StudioHeadingItem> {
    val cleaned = mutableListOf<StudioHeadingItem>()
    values.forEach { item ->
        val title = item.title.trim().take(120)
        if (!isUsableFinancialTitle(title, autoPrefix)) return@forEach
        val id = item.id.trim().take(80).ifBlank { title }
        if (cleaned.none { existing -> existing.title.equals(title, ignoreCase = true) }) {
            cleaned.add(StudioHeadingItem(id, title))
        }
    }
    return cleaned.take(40)
}

private fun isUsableFinancialTitle(title: String, autoPrefix: String): Boolean {
    val cleaned = title.trim()
    if (cleaned.isBlank()) return false
    val marker = "$autoPrefix "
    if (!cleaned.startsWith(marker)) return true
    return cleaned.removePrefix(marker).any { !it.isDigit() }
}

private fun financialCustomKey(prefix: String, title: String): String = prefix + title.trim()

private fun financialCustomValue(order: StudioOrder, prefix: String, title: String): Double {
    return parseCurrencyLike(customFieldValue(order, financialCustomKey(prefix, title)))
}

private fun parseCurrencyLike(raw: String): Double {
    val cleaned = raw
        .replace(",", "")
        .filter { it.isDigit() || it == '.' }
    return cleaned.toDoubleOrNull()?.coerceAtLeast(0.0) ?: 0.0
}

private fun financialCustomTotal(order: StudioOrder, prefix: String, items: List<StudioHeadingItem>): Double {
    return items.sumOf { financialCustomValue(order, prefix, it.title) }
}

private fun financialFinalProfit(order: StudioOrder, settings: StudioWorkspaceSettings): Double {
    val expenseItems = orderFinancialItems(order, ORDER_EXPENSE_ITEMS_KEY, "Cost", settings.financialExpenseItems)
    val baseCost = if (settings.financialShowBaseCost) order.watchPurchasePrice else 0.0
    return order.orderValue -
        baseCost -
        financialCustomTotal(order, "financialExpense::", expenseItems) -
        order.deliveryCost -
        order.paymentFee -
        order.taxAmount
}

private fun toggleListValue(values: List<String>, value: String): List<String> {
    val exists = values.any { it.equals(value, ignoreCase = true) }
    return if (exists) {
        values.filterNot { it.equals(value, ignoreCase = true) }
    } else {
        values + value
    }
}

private fun decimalText(value: Double): String {
    return if (value % 1.0 == 0.0) value.toInt().toString() else String.format(Locale.UK, "%.2f", value)
}

private fun cleanDecimalInput(value: String): String {
    val filtered = value.filter { it.isDigit() || it == '.' }
    val firstDot = filtered.indexOf('.')
    return if (firstDot < 0) {
        val digits = filtered.take(9)
        digits.trimStart('0').ifBlank { if (digits.isNotEmpty()) "0" else "" }
    } else {
        val whole = filtered.take(firstDot).take(9)
        val cleanWhole = whole.trimStart('0').ifBlank { "0" }
        val fraction = filtered.drop(firstDot + 1).filter { it != '.' }.take(2)
        "$cleanWhole.$fraction"
    }
}

private fun parseDecimal(value: String, fallback: Double): Double {
    val clean = value.trim().replace(",", "")
    if (clean.isBlank() || clean == ".") return 0.0
    return clean.toDoubleOrNull()?.coerceAtLeast(0.0) ?: fallback
}

private fun isZeroLikeDecimalInput(value: String): Boolean {
    return value.trim().replace(",", "").toDoubleOrNull() == 0.0
}

private fun formattedDecimalInput(value: String, decimalSeparator: String): String {
    val clean = value.trim().replace(",", "")
    if (clean.isBlank() || clean == ".") return ""
    val parsed = clean.toDoubleOrNull() ?: return value
    val formatted = String.format(Locale.UK, "%,.2f", parsed)
    return if (decimalSeparator == ",") {
        formatted.replace(",", "_").replace(".", ",").replace("_", ".")
    } else {
        formatted
    }
}

@Composable
private fun money(value: Double): String {
    if (LocalHideSensitiveNumbers.current) {
        return privateCurrencyText(LocalCurrencySymbol.current)
    }
    val formatted = String.format(Locale.UK, "%,.2f", value)
    return LocalCurrencySymbol.current + if (LocalDecimalSeparator.current == ",") {
        formatted.replace(",", "_").replace(".", ",").replace("_", ".")
    } else {
        formatted
    }
}

private fun shortDate(date: Date): String {
    return SimpleDateFormat("dd/MM/yy", Locale.UK).format(date)
}

private fun longDate(date: Date): String {
    return SimpleDateFormat("dd/MM/yyyy", Locale.UK).format(date)
}

private fun dateInputToISODate(value: String): String? {
    val clean = value.trim()
    val patterns = listOf("dd/MM/yyyy", "dd/MM/yy", "yyyy-MM-dd")
    patterns.forEach { pattern ->
        val formatter = SimpleDateFormat(pattern, Locale.UK).apply { isLenient = false }
        val parsed = runCatching { formatter.parse(clean) }.getOrNull()
        if (parsed != null) {
            return SimpleDateFormat("yyyy-MM-dd", Locale.UK).format(parsed)
        }
    }
    return null
}

private fun shortDateOrDash(date: Date?): String {
    return date?.let { shortDate(it) }.orEmpty()
}

private fun fileSizeLabel(bytes: Long): String {
    if (bytes <= 0L) return ""
    val mb = bytes / 1024.0 / 1024.0
    return if (mb >= 1.0) {
        String.format(Locale.UK, "%.1f MB", mb)
    } else {
        "${(bytes / 1024L).coerceAtLeast(1L)} KB"
    }
}

private fun durationLabel(seconds: Int): String {
    val clean = seconds.coerceAtLeast(0)
    val hours = clean / 3600
    val minutes = (clean % 3600) / 60
    return when {
        hours > 0 -> "${hours}h ${minutes}m"
        minutes > 0 -> "${minutes}m"
        else -> "${clean}s"
    }
}

private fun StudioWorkSession.effectiveDurationSeconds(nowMillis: Long): Int {
    if (endedAt != null) return durationSeconds.coerceAtLeast(0)
    val liveSeconds = startedAt?.let { ((nowMillis - it.time) / 1000L).coerceAtLeast(0L).toInt() } ?: 0
    return durationSeconds.coerceAtLeast(liveSeconds)
}

private fun workSessionTimeLabel(date: Date?): String {
    return date?.let { SimpleDateFormat("HH:mm", Locale.UK).format(it) } ?: "--:--"
}

private fun workSessionDateKey(date: Date?): String {
    return date?.let { SimpleDateFormat("yyyy-MM-dd", Locale.UK).format(it) } ?: "no-date"
}

private fun workSessionDateLabel(date: Date?): String {
    return date?.let { SimpleDateFormat("d MMM yyyy", Locale.UK).format(it) } ?: "No date"
}

private fun workSessionRangeLabel(session: StudioWorkSession): String {
    val started = workSessionTimeLabel(session.startedAt)
    val ended = session.endedAt?.let(::workSessionTimeLabel) ?: "Running"
    return "$started -> $ended"
}

private fun dueDate(order: StudioOrder): Date {
    return Date(order.paymentDate.time + order.deliveryTime.coerceAtLeast(1) * DAY_MS)
}

private fun deliveryLabel(order: StudioOrder): String {
    val days = order.remainingDays
    return when {
        days > 0 -> "${days}d"
        days == 0 -> "Today"
        else -> "${-days}d late"
    }
}

private fun deliveryLongLabel(order: StudioOrder): String {
    val days = order.remainingDays
    return when {
        days > 0 -> "$days days"
        days == 0 -> "Today"
        else -> "${-days} days late"
    }
}

private fun deliveryColor(order: StudioOrder): Color {
    val days = order.remainingDays
    return when {
        days < 0 -> StudioRed
        days <= 7 -> StudioRed
        days <= 14 -> StudioWarningOrange
        else -> StudioGreen
    }
}

private fun nextHeaderScheduleReminder(order: StudioOrder): StudioScheduleReminder? {
    val now = System.currentTimeMillis()
    return order.scheduleReminders
        .filterNot { it.status.equals("Done", ignoreCase = true) }
        .sortedWith(
            compareBy<StudioScheduleReminder> { reminder ->
                val dueAt = reminder.dueAt?.time ?: Long.MAX_VALUE
                if (dueAt < now) 0 else 1
            }.thenBy { it.dueAt?.time ?: Long.MAX_VALUE }
        )
        .firstOrNull()
}

private fun scheduleRelativeLabel(reminder: StudioScheduleReminder): String {
    if (reminder.status.equals("Done", ignoreCase = true)) return "Done"
    val dueAt = reminder.dueAt ?: return "-"
    val seconds = (dueAt.time - System.currentTimeMillis()) / 1000L
    if (seconds < 0) {
        val hours = (-seconds) / 3600L
        return when {
            hours < 1 -> "Due now"
            hours < 24 -> "Overdue ${hours}h"
            else -> "Overdue ${(hours / 24L).coerceAtLeast(1L)}d"
        }
    }
    val hours = seconds / 3600L
    return when {
        hours < 1 -> "Due soon"
        hours < 24 -> "In ${hours}h"
        else -> "In ${(hours / 24L).coerceAtLeast(1L)}d"
    }
}

private fun scheduleStatusColor(reminder: StudioScheduleReminder): Color {
    if (reminder.status.equals("Done", ignoreCase = true)) return StudioGreen
    val dueAt = reminder.dueAt ?: return Color.Gray
    val hours = (dueAt.time - System.currentTimeMillis()) / (60.0 * 60.0 * 1000.0)
    return when {
        hours < 0 -> StudioRed
        hours <= 24.0 -> StudioWarningOrange
        else -> StudioBlue
    }
}

private fun priorityColor(priority: String): Color {
    return when (priority.trim().lowercase()) {
        "urgent" -> StudioRed
        "high" -> StudioWarningOrange
        "low" -> StudioBlue
        else -> StudioGreen
    }
}

private fun riskColor(risk: String): Color {
    return when (risk.trim().lowercase()) {
        "blocked", "overdue" -> StudioRed
        "waiting" -> StudioWarningOrange
        else -> StudioGreen
    }
}

private fun priorityOptions(): List<String> = listOf("Low", "Normal", "High", "Urgent")

private fun riskOptions(): List<String> = listOf("None", "Waiting", "Blocked", "Overdue")

private fun statusColor(status: String): Color {
    return when (status.trim().lowercase()) {
        "done", "completed", "delivered" -> StudioGreen
        "cancelled", "canceled", "failed" -> StudioRed
        "urgent", "late", "overdue" -> StudioRed
        "in progress", "processing", "production" -> StudioBlue
        "not yet", "" -> StudioWarningOrange
        else -> StudioBlue
    }
}

private fun yesNo(value: Boolean): String = if (value) "Yes" else "No"

private fun invoiceMoney(value: Double, currency: String, decimalSeparator: String): String {
    val formatted = String.format(java.util.Locale.UK, "%,.2f", value)
    val out = if (decimalSeparator == ",") formatted.replace(",", "_").replace(".", ",").replace("_", ".") else formatted
    return "$currency$out"
}

private fun escapeInvoiceHtml(value: String): String =
    value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;")

// Customer-facing invoice (VAT only; never Corporation Tax/costs/profit). Mirrors
// the web/Mac invoice. Margin scheme hides the VAT line; zero-rated shows Export.
private fun buildInvoiceHtml(order: StudioOrder, settings: StudioWorkspaceSettings, invoiceNumber: String): String {
    val currency = settings.selectedCurrency.ifBlank { "£" }
    val dec = settings.selectedDecimalSeparator
    fun m(v: Double) = invoiceMoney(v, currency, dec)
    // Invoice total: when the user added named line items, the invoice bills
    // exactly those items — the order's paid/remaining figures stay off the
    // invoice entirely. Orders without line items keep the classic order value.
    val orderValue = if (order.hasLineItems) order.lineItemsTotal else order.paidAmount + order.remainingAmount
    val isMargin = order.taxType == "Profit"
    val isZero = order.taxRate <= 0.0001
    // Line-item invoices recompute VAT on the item total with the order's rate
    // (same total*rate/100 convention as the Finance card).
    val vat = if (order.hasLineItems) vatFromGross(order.taxRate, orderValue) else order.taxAmount
    val subtotal = if (isMargin) orderValue else orderValue - vat
    val business = escapeInvoiceHtml(settings.appSubtitle.ifBlank { "NivaDesk" })
    val logo = settings.appLogoUrl.trim()
    val footer = settings.invoiceFooterNote.trim()
    val nums = settings.companyNumbers.filter { it.value.isNotBlank() }
        .joinToString("") { "<div>${escapeInvoiceHtml(it.title)}: ${escapeInvoiceHtml(it.value)}</div>" }
    val date = order.paymentDate?.let { java.text.SimpleDateFormat("d MMM yyyy", java.util.Locale.getDefault()).format(it) } ?: ""
    val desc = escapeInvoiceHtml(order.designName.ifBlank { order.displayCustomerName })
    val vatRow = when {
        isMargin -> "<div class=\"muted-note\">VAT under margin scheme (not shown separately)</div>"
        isZero -> "<div class=\"trow\"><span>VAT (Zero-rated / Export)</span><strong>${m(0.0)}</strong></div>"
        else -> "<div class=\"trow\"><span>VAT (${order.taxRate.toInt()}%)</span><strong>${m(vat)}</strong></div>"
    }
    val fmtQty = { q: Double -> if (q % 1.0 == 0.0) q.toInt().toString() else String.format(java.util.Locale.UK, "%.2f", q) }
    val itemRows = if (order.hasLineItems) {
        order.lineItems.joinToString("") { item ->
            val qtyLine = if (item.quantity != 1.0) "<div style=\"font-size:10px;color:#6b7280;\">${fmtQty(item.quantity)} × ${m(item.unitPrice)}</div>" else ""
            "<tr><td>${escapeInvoiceHtml(item.name.ifBlank { "-" })}$qtyLine</td><td class=\"r\">${m(item.lineTotal)}</td></tr>"
        }
    } else {
        "<tr><td>$desc</td><td class=\"r\">${m(subtotal)}</td></tr>"
    }
    return """<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
@page { size: A4; margin: 14mm; }
body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1c1c1e; margin: 0; }
.wrap { padding: 16px; }
header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
.biz img { max-width: 220px; max-height: 60px; object-fit: contain; display: block; margin-bottom: 6px; }
.biz .name { font-weight: 800; font-size: 16px; }
.biz .nums { color: #6b7280; font-size: 11px; margin-top: 4px; line-height: 1.5; }
.inv { text-align: right; }
.inv .title { font-size: 28px; font-weight: 900; color: rgba(0,0,0,0.35); letter-spacing: 1px; }
.inv .meta { font-size: 12px; margin-top: 4px; color: #374151; }
hr { border: none; border-top: 1px solid #e5e7eb; margin: 16px 0; }
.bill .label { font-size: 10px; font-weight: 800; letter-spacing: 1px; color: #6b7280; }
.bill .who { font-weight: 700; font-size: 13px; margin-top: 4px; }
.bill .email { color: #6b7280; font-size: 11px; }
table { width: 100%; border-collapse: collapse; margin-top: 16px; }
th { text-align: left; font-size: 11px; background: #f3f4f6; padding: 9px 12px; }
th.r, td.r { text-align: right; }
td { padding: 11px 12px; font-size: 12px; border-bottom: 1px solid #eee; }
.totals { margin-top: 14px; margin-left: auto; width: 280px; }
.trow { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; }
.trow.total { border-top: 1px solid #d1d5db; margin-top: 4px; padding-top: 8px; font-size: 15px; font-weight: 800; }
.muted-note { font-size: 10px; color: #6b7280; padding: 4px 0; }
.due { color: #dc2626; } .paid { color: #16a34a; }
footer { margin-top: 26px; border-top: 1px solid #e5e7eb; padding-top: 12px; color: #6b7280; font-size: 11px; white-space: pre-wrap; }
.credit { text-align: center; color: #9ca3af; font-size: 9px; margin-top: 16px; }
</style></head><body><div class="wrap">
<header>
  <div class="biz">
    ${if (logo.isNotBlank()) "<img src=\"${escapeInvoiceHtml(logo)}\" alt=\"\" />" else ""}
    <div class="name">$business</div>
    <div class="nums">$nums</div>
  </div>
  <div class="inv">
    <div class="title">INVOICE</div>
    <div class="meta">Invoice No: ${escapeInvoiceHtml(invoiceNumber.ifBlank { "-" })}</div>
    <div class="meta">Date: ${escapeInvoiceHtml(date)}</div>
  </div>
</header>
<hr/>
<div class="bill">
  <div class="label">BILL TO</div>
  <div class="who">${escapeInvoiceHtml(order.displayCustomerName)}</div>
  ${if (order.emailAddress.isNotBlank()) "<div class=\"email\">${escapeInvoiceHtml(order.emailAddress)}</div>" else ""}
</div>
<table><thead><tr><th>Description</th><th class="r">Amount</th></tr></thead>
<tbody>$itemRows</tbody></table>
<div class="totals">
  <div class="trow"><span>Subtotal</span><strong>${m(subtotal)}</strong></div>
  $vatRow
  <div class="trow total"><span>TOTAL</span><strong>${m(orderValue)}</strong></div>
</div>
${if (footer.isNotBlank()) "<footer>${escapeInvoiceHtml(footer)}</footer>" else ""}
<div class="credit">Generated with NivaDesk</div>
</div></body></html>"""
}

/** Builds the invoice PDF (assigns number from server, downloads logo, renders) and returns the file. */
private suspend fun buildInvoiceFile(context: Context, order: StudioOrder, settings: StudioWorkspaceSettings): File {
    // 1) Assign / fetch the invoice number from the server counter.
    var number = order.invoiceNumber
    if (number.isBlank()) {
        number = try {
            val result = com.google.firebase.functions.FirebaseFunctions.getInstance("europe-west2")
                .getHttpsCallable("assignInvoiceNumber")
                .call(mapOf("companyId" to order.companyId, "orderId" to order.id))
                .await()
            ((result.getData() as? Map<*, *>)?.get("invoiceNumber") as? String).orEmpty()
        } catch (e: Exception) {
            ""
        }
    }

    // 2) Download the workspace logo (off the main thread) if present.
    val logoBitmap = withContext(kotlinx.coroutines.Dispatchers.IO) {
        val url = settings.appLogoUrl.trim()
        if (url.isBlank()) null else runCatching {
            val conn = (java.net.URL(url).openConnection() as java.net.HttpURLConnection).apply {
                connectTimeout = 8000
                readTimeout = 8000
                instanceFollowRedirects = true
            }
            conn.inputStream.use { android.graphics.BitmapFactory.decodeStream(it) }
        }.getOrNull()
    }

    // 3) Render the invoice PDF to a cache file.
    return withContext(kotlinx.coroutines.Dispatchers.IO) {
        createInvoicePdfFile(context, order, settings, number, logoBitmap)
    }
}

/**
 * Returns a callback that builds the invoice PDF and opens the system "Save as" document
 * picker so the user can store it anywhere (Downloads, Drive, a Chromebook folder, etc.).
 * Falls back to the share sheet if no document picker is available.
 */
/**
 * Builds the estimate PDF. Deliberately never calls assignInvoiceNumber:
 * estimates carry their own counter, and burning a real invoice number on a
 * quote that may never be accepted is exactly what that counter avoids.
 */
private suspend fun buildEstimateFile(
    context: Context,
    order: StudioOrder,
    settings: StudioWorkspaceSettings,
    estimate: StudioEstimateRecord
): File {
    val bitmaps = withContext(kotlinx.coroutines.Dispatchers.IO) {
        fun fetch(url: String): android.graphics.Bitmap? {
            if (url.isBlank()) return null
            return runCatching {
                val conn = (java.net.URL(url).openConnection() as java.net.HttpURLConnection).apply {
                    connectTimeout = 8000
                    readTimeout = 8000
                    instanceFollowRedirects = true
                }
                conn.inputStream.use { android.graphics.BitmapFactory.decodeStream(it) }
            }.getOrNull()
        }
        fetch(settings.appLogoUrl.trim()) to fetch(estimate.approval?.signatureDownloadUrl.orEmpty())
    }
    return withContext(kotlinx.coroutines.Dispatchers.IO) {
        createInvoicePdfFile(
            context, order, settings, estimate.number, bitmaps.first,
            estimate = estimate, signature = bitmaps.second
        )
    }
}

@Composable
private fun rememberEstimateExporter(
    settings: StudioWorkspaceSettings
): (StudioOrder, StudioEstimateRecord?) -> Unit {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var pendingFile by remember { mutableStateOf<File?>(null) }

    val saveLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/pdf")
    ) { uri: Uri? ->
        val file = pendingFile
        pendingFile = null
        if (uri == null || file == null) return@rememberLauncherForActivityResult
        scope.launch {
            val ok = withContext(kotlinx.coroutines.Dispatchers.IO) {
                runCatching {
                    context.contentResolver.openOutputStream(uri)?.use { out ->
                        file.inputStream().use { it.copyTo(out) }
                    }
                }.isSuccess
            }
            Toast.makeText(context, if (ok) "Estimate saved." else "Could not save estimate.", Toast.LENGTH_SHORT).show()
        }
    }

    return { order, estimate ->
        scope.launch {
            if (estimate == null) {
                Toast.makeText(context, "The estimate is still loading.", Toast.LENGTH_SHORT).show()
                return@launch
            }
            try {
                val file = buildEstimateFile(context, order, settings, estimate)
                pendingFile = file
                try {
                    uk.co.eggcraft.studioflow.features.shell.AppLockGuard.suppressNextLockOnce()
                    saveLauncher.launch(file.name)
                } catch (e: Exception) {
                    pendingFile = null
                    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                    val shareIntent = Intent(Intent.ACTION_SEND).apply {
                        type = "application/pdf"
                        putExtra(Intent.EXTRA_STREAM, uri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    context.startActivity(Intent.createChooser(shareIntent, "Estimate PDF"))
                }
            } catch (e: Exception) {
                Toast.makeText(context, "Estimate failed: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }
}

@Composable
private fun rememberInvoiceExporter(settings: StudioWorkspaceSettings): (StudioOrder) -> Unit {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var pendingFile by remember { mutableStateOf<File?>(null) }

    val saveLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/pdf")
    ) { uri: Uri? ->
        val file = pendingFile
        pendingFile = null
        if (uri == null || file == null) return@rememberLauncherForActivityResult
        scope.launch {
            val ok = withContext(kotlinx.coroutines.Dispatchers.IO) {
                runCatching {
                    context.contentResolver.openOutputStream(uri)?.use { out ->
                        file.inputStream().use { it.copyTo(out) }
                    }
                }.isSuccess
            }
            Toast.makeText(
                context,
                if (ok) "Invoice saved." else "Could not save invoice.",
                Toast.LENGTH_SHORT
            ).show()
        }
    }

    return { order ->
        scope.launch {
            try {
                val file = buildInvoiceFile(context, order, settings)
                pendingFile = file
                try {
                    uk.co.eggcraft.studioflow.features.shell.AppLockGuard.suppressNextLockOnce()
                    saveLauncher.launch(file.name)
                } catch (e: Exception) {
                    // No document picker (rare) -> fall back to sharing.
                    pendingFile = null
                    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                    val shareIntent = Intent(Intent.ACTION_SEND).apply {
                        type = "application/pdf"
                        putExtra(Intent.EXTRA_STREAM, uri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    context.startActivity(Intent.createChooser(shareIntent, "Invoice PDF"))
                }
            } catch (e: Exception) {
                Toast.makeText(context, "Invoice failed: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }
}

/**
 * Returns a callback that builds the order PDF and opens the system "Save as" document
 * picker so it can be saved to the computer (Downloads, Drive, a Chromebook folder, etc.).
 * Falls back to the share sheet if no document picker is available.
 */
@Composable
private fun rememberOrderPdfExporter(
    settings: StudioWorkspaceSettings,
    canSeeFinancial: Boolean,
    advancedFinanceEnabled: Boolean
): (StudioOrder) -> Unit {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var pendingFile by remember { mutableStateOf<File?>(null) }

    val saveLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/pdf")
    ) { uri: Uri? ->
        val file = pendingFile
        pendingFile = null
        if (uri == null || file == null) return@rememberLauncherForActivityResult
        scope.launch {
            val ok = withContext(kotlinx.coroutines.Dispatchers.IO) {
                runCatching {
                    context.contentResolver.openOutputStream(uri)?.use { out ->
                        file.inputStream().use { it.copyTo(out) }
                    }
                }.isSuccess
            }
            Toast.makeText(
                context,
                if (ok) "PDF saved." else "Could not save PDF.",
                Toast.LENGTH_SHORT
            ).show()
        }
    }

    return { order ->
        scope.launch {
            try {
                val logoBitmap = withContext(kotlinx.coroutines.Dispatchers.IO) {
                    val url = settings.appLogoUrl.trim()
                    if (url.isBlank()) null else runCatching {
                        val conn = (java.net.URL(url).openConnection() as java.net.HttpURLConnection).apply {
                            connectTimeout = 8000; readTimeout = 8000; instanceFollowRedirects = true
                        }
                        conn.inputStream.use { android.graphics.BitmapFactory.decodeStream(it) }
                    }.getOrNull()
                }
                val file = withContext(kotlinx.coroutines.Dispatchers.IO) {
                    createOrderPdfFile(context, order, settings, canSeeFinancial, advancedFinanceEnabled, logoBitmap)
                }
                pendingFile = file
                try {
                    uk.co.eggcraft.studioflow.features.shell.AppLockGuard.suppressNextLockOnce()
                    saveLauncher.launch(file.name)
                } catch (e: Exception) {
                    pendingFile = null
                    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                    val shareIntent = Intent(Intent.ACTION_SEND).apply {
                        type = "application/pdf"
                        putExtra(Intent.EXTRA_STREAM, uri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    context.startActivity(Intent.createChooser(shareIntent, "Export PDF"))
                }
            } catch (e: Exception) {
                Toast.makeText(context, "PDF export failed: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }
}

/**
 * Returns a callback that builds the History/Log PDF and opens the system
 * "Save as" document picker, falling back to the share sheet — the exact same
 * plumbing the whole-order Export PDF and Invoice PDF use.
 */
@Composable
private fun rememberHistoryLogPdfExporter(
    settings: StudioWorkspaceSettings
): (StudioOrder) -> Unit {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var pendingFile by remember { mutableStateOf<File?>(null) }

    val saveLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/pdf")
    ) { uri: Uri? ->
        val file = pendingFile
        pendingFile = null
        if (uri == null || file == null) return@rememberLauncherForActivityResult
        scope.launch {
            val ok = withContext(kotlinx.coroutines.Dispatchers.IO) {
                runCatching {
                    context.contentResolver.openOutputStream(uri)?.use { out ->
                        file.inputStream().use { it.copyTo(out) }
                    }
                }.isSuccess
            }
            Toast.makeText(
                context,
                if (ok) "History PDF saved." else "Could not save the history PDF.",
                Toast.LENGTH_SHORT
            ).show()
        }
    }

    return { order ->
        scope.launch {
            try {
                val file = withContext(kotlinx.coroutines.Dispatchers.IO) {
                    createHistoryLogPdfFile(context, order, settings)
                }
                pendingFile = file
                try {
                    uk.co.eggcraft.studioflow.features.shell.AppLockGuard.suppressNextLockOnce()
                    saveLauncher.launch(file.name)
                } catch (e: Exception) {
                    // No document picker (rare) -> fall back to sharing.
                    pendingFile = null
                    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                    val shareIntent = Intent(Intent.ACTION_SEND).apply {
                        type = "application/pdf"
                        putExtra(Intent.EXTRA_STREAM, uri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    context.startActivity(Intent.createChooser(shareIntent, "History PDF"))
                }
            } catch (e: Exception) {
                Toast.makeText(context, "History PDF failed: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }
}

// The order's FULL history log on paper: title with the order reference, then
// one row per entry (timestamp, field, old -> new), paginated as needed. The
// entries carry no author field on any platform, so none is printed.
private fun createHistoryLogPdfFile(
    context: Context,
    order: StudioOrder,
    settings: StudioWorkspaceSettings
): File {
    val pageWidth = 595
    val pageHeight = 842
    val margin = 42f
    val document = PdfDocument()
    var pageNumber = 1
    var page = document.startPage(PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageNumber).create())
    var canvas = page.canvas
    canvas.drawColor(0xFFFFFFFF.toInt())

    val rightX = pageWidth - margin
    val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0x59000000; textSize = 26f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    val namePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF111827.toInt(); textSize = 16f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    val mutedPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF6B7280.toInt(); textSize = 10.5f }
    val entryTitlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF111827.toInt(); textSize = 12f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    val entryValuePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF374151.toInt(); textSize = 11f }
    val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFE5E7EB.toInt(); strokeWidth = 1f }
    val creditPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF8E8E93.toInt(); textSize = 10f; textAlign = Paint.Align.CENTER
    }

    fun drawRight(text: String, x: Float, yy: Float, paint: Paint) {
        val old = paint.textAlign
        paint.textAlign = Paint.Align.RIGHT
        canvas.drawText(text, x, yy, paint)
        paint.textAlign = old
    }

    var y = margin + 6f

    fun startNextPage() {
        canvas.drawText("Generated automatically from NivaDesk", pageWidth / 2f, pageHeight - margin + 6f, creditPaint)
        document.finishPage(page)
        pageNumber += 1
        page = document.startPage(PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageNumber).create())
        canvas = page.canvas
        canvas.drawColor(0xFFFFFFFF.toInt())
        y = margin + 6f
    }

    fun ensureSpace(needed: Float) {
        if (y + needed > pageHeight - margin - 26f) startNextPage()
    }

    // ---------- Header: business name + doc title + order reference ----------
    canvas.drawText(settings.appSubtitle.ifBlank { "NivaDesk" }, margin, y + 12f, namePaint)
    drawRight("HISTORY LOG", rightX, y + 20f, titlePaint)
    y += 40f
    val orderName = order.displayCustomerName.trim()
        .ifBlank { order.designName.trim() }
        .ifBlank { "Order" }
    canvas.drawText(orderName, margin, y, entryTitlePaint)
    y += 16f
    val referenceLine = listOf(
        "Order: ${order.id.take(8)}",
        "Design Name: ${order.designName.trim().ifBlank { "-" }}",
        "Total Logs: ${order.historyLog.size}"
    ).joinToString("    ")
    canvas.drawText(referenceLine, margin, y, mutedPaint)
    y += 10f
    canvas.drawLine(margin, y, rightX, y, linePaint)
    y += 22f

    // ---------- One row per history entry ----------
    val timestampFormat = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.UK)
    val timestampWidth = 96f
    val titleWidth = rightX - margin - timestampWidth - 8f
    if (order.historyLog.isEmpty()) {
        canvas.drawText("No changes recorded yet", margin, y, mutedPaint)
        y += 16f
    } else {
        order.historyLog.forEach { item ->
            val titleLines = pdfWrappedLines(item.title.trim().ifBlank { "Updated" }, entryTitlePaint, titleWidth)
            val changeText = "${item.oldValue.trim().ifBlank { "-" }} → ${item.newValue.trim().ifBlank { "-" }}"
            val changeLines = pdfWrappedLines(changeText, entryValuePaint, rightX - margin - 12f)
            val rowHeight = titleLines.size * 15f + changeLines.size * 14f + 16f
            ensureSpace(rowHeight)
            drawRight(item.createdAt?.let { timestampFormat.format(it) } ?: "-", rightX, y, mutedPaint)
            titleLines.forEach { line ->
                canvas.drawText(line, margin, y, entryTitlePaint)
                y += 15f
            }
            changeLines.forEach { line ->
                canvas.drawText(line, margin + 12f, y, entryValuePaint)
                y += 14f
            }
            y += 6f
            canvas.drawLine(margin, y - 2f, rightX, y - 2f, linePaint)
            y += 10f
        }
    }

    // ---------- Footer ----------
    canvas.drawText("Generated automatically from NivaDesk", pageWidth / 2f, pageHeight - margin + 6f, creditPaint)
    document.finishPage(page)

    val exportDir = File(context.cacheDir, "exports").apply { mkdirs() }
    val file = File(exportDir, "${pdfSafeFileName(order.displayCustomerName)}_History_${order.id.take(8)}.pdf")
    try {
        file.outputStream().use { document.writeTo(it) }
        return file
    } finally {
        document.close()
    }
}

private fun createInvoicePdfFile(
    context: Context,
    order: StudioOrder,
    settings: StudioWorkspaceSettings,
    invoiceNumber: String,
    logo: android.graphics.Bitmap?,
    // When set, this prints as an estimate: the figures frozen on the record,
    // not the order's current ones, plus the approval and the signature.
    estimate: StudioEstimateRecord? = null,
    signature: android.graphics.Bitmap? = null
): File {
    val pageWidth = 595
    val pageHeight = 842
    val margin = 42f
    val document = PdfDocument()
    var pageNumber = 1
    var page = document.startPage(PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageNumber).create())
    var canvas = page.canvas
    canvas.drawColor(0xFFFFFFFF.toInt())

    val rightX = pageWidth - margin
    val currency = settings.selectedCurrency.ifBlank { "£" }
    fun money(v: Double) = pdfMoney(v, settings)

    val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0x59000000; textSize = 30f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    val namePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF111827.toInt(); textSize = 16f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF6B7280.toInt(); textSize = 10f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    val mutedPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF6B7280.toInt(); textSize = 11f }
    val bodyPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF111827.toInt(); textSize = 12f }
    val bodyBold = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF111827.toInt(); textSize = 12f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    val totalPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF111827.toInt(); textSize = 16f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFE5E7EB.toInt(); strokeWidth = 1f }
    val rightAlign = Paint.Align.RIGHT

    fun drawRight(text: String, x: Float, yy: Float, paint: Paint) {
        val old = paint.textAlign
        paint.textAlign = rightAlign
        canvas.drawText(text, x, yy, paint)
        paint.textAlign = old
    }

    var y = margin + 6f

    // A long estimate does not fit one sheet. Without this the item list, the
    // total and the signature were simply drawn off the bottom of the paper.
    fun startNextPage() {
        document.finishPage(page)
        pageNumber += 1
        page = document.startPage(PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageNumber).create())
        canvas = page.canvas
        canvas.drawColor(0xFFFFFFFF.toInt())
        y = margin + 6f
    }

    fun ensureSpace(needed: Float) {
        if (y + needed > pageHeight - margin - 26f) startNextPage()
    }
    val headerTop = y

    // Logo + business name (left column)
    if (logo != null && logo.width > 0 && logo.height > 0) {
        val maxW = 150f
        val maxH = 56f
        val scale = minOf(maxW / logo.width, maxH / logo.height)
        val w = logo.width * scale
        val h = logo.height * scale
        canvas.drawBitmap(
            logo,
            null,
            android.graphics.RectF(margin, y, margin + w, y + h),
            Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
        )
        y += h + 10f
    }
    canvas.drawText(settings.appSubtitle.ifBlank { "NivaDesk" }, margin, y + 4f, namePaint)
    y += 18f
    settings.companyNumbers
        .filter { it.title.isNotBlank() && it.value.isNotBlank() }
        .forEach { num ->
            canvas.drawText("${num.title}: ${num.value}", margin, y + 8f, mutedPaint)
            y += 14f
        }

    // INVOICE title + meta (right column)
    drawRight(if (estimate != null) "ESTIMATE" else "INVOICE", rightX, headerTop + 26f, titlePaint)
    drawRight(
        if (estimate != null) "Estimate No: ${estimate.number.ifBlank { "-" }}"
        else "Invoice No: ${invoiceNumber.ifBlank { "-" }}",
        rightX, headerTop + 46f, mutedPaint
    )
    val dateStr = when {
        estimate != null && estimate.createdAtMs > 0L -> pdfDate(Date(estimate.createdAtMs))
        else -> order.paymentDate?.let { pdfDate(it) } ?: pdfDate(Date())
    }
    drawRight("Date: $dateStr", rightX, headerTop + 62f, mutedPaint)
    if (estimate != null && estimate.validUntilMs > 0L) {
        drawRight("Valid until: ${pdfDate(Date(estimate.validUntilMs))}", rightX, headerTop + 78f, mutedPaint)
    }

    y = maxOf(y, headerTop + 80f)
    canvas.drawLine(margin, y, rightX, y, linePaint)
    y += 26f

    // Bill to (left) + Ship to (right) — addresses gated by PDF Export Settings
    val billTop = y
    canvas.drawText("BILL TO", margin, y, labelPaint)
    y += 16f
    canvas.drawText(order.displayCustomerName.ifBlank { "Customer" }, margin, y, bodyBold)
    y += 16f
    val billingAddress = (order.customFields["communicationAddress"]
        ?: order.customFields["Address"] ?: "").trim()
    if (settings.pdfShowAddress && billingAddress.isNotBlank()) {
        pdfWrappedLines(billingAddress, mutedPaint, 230f).forEach { line ->
            canvas.drawText(line, margin, y, mutedPaint); y += 14f
        }
    }
    if (order.emailAddress.isNotBlank()) {
        canvas.drawText(order.emailAddress, margin, y, mutedPaint)
        y += 14f
    }
    if (settings.pdfShowAddress && order.whatsappNumber.isNotBlank()) {
        canvas.drawText(order.whatsappNumber, margin, y, mutedPaint)
        y += 14f
    }
    val billBottom = y

    // Ship to (right column)
    val shipLine = listOf(
        order.shippingStreetAddress, order.shippingCity,
        order.shippingPostalCode, order.shippingCountry
    ).filter { it.isNotBlank() }.joinToString(", ")
    var shipBottom = billTop
    if (settings.pdfShowShippingAddress && shipLine.isNotBlank()) {
        val shipX = margin + 280f
        var sy = billTop
        canvas.drawText("SHIP TO", shipX, sy, labelPaint)
        sy += 16f
        canvas.drawText(order.shippingName.ifBlank { order.displayCustomerName }, shipX, sy, bodyBold)
        sy += 16f
        pdfWrappedLines(shipLine, mutedPaint, 230f).forEach { line ->
            canvas.drawText(line, shipX, sy, mutedPaint); sy += 14f
        }
        if (order.shippingPhone.isNotBlank()) {
            canvas.drawText(order.shippingPhone, shipX, sy, mutedPaint); sy += 14f
        }
        shipBottom = sy
    }

    y = maxOf(billBottom, shipBottom) + 12f

    // Line item table. Same rule as the HTML/web/Mac invoices: line items drive
    // the invoice total (VAT recomputed on it); paid/remaining stay off the invoice.
    val printedTaxRate = estimate?.taxRate ?: order.taxRate
    val isMargin = (estimate?.taxType ?: order.taxType) == "Profit"
    val isZero = printedTaxRate <= 0.0001
    val orderValue = estimate?.total
        ?: if (order.hasLineItems) order.lineItemsTotal else order.paidAmount + order.remainingAmount
    val vat = estimate?.taxAmount
        ?: if (order.hasLineItems) vatFromGross(order.taxRate, orderValue) else order.taxAmount
    val subtotal = estimate?.subtotal ?: if (isMargin) orderValue else orderValue - vat

    val tableHeaderBg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFF3F4F6.toInt() }
    ensureSpace(70f)
    canvas.drawRect(margin, y, rightX, y + 24f, tableHeaderBg)
    canvas.drawText("Description", margin + 10f, y + 16f, labelPaint)
    drawRight("Amount", rightX - 10f, y + 16f, labelPaint)
    y += 24f
    val printedLines = estimate?.lineItems?.map { Triple(it.name, it.quantity, it.lineTotal to it.unitPrice) }
        ?: order.lineItems.map { Triple(it.name, it.quantity, it.lineTotal to it.unitPrice) }
    if (if (estimate != null) printedLines.isNotEmpty() else order.hasLineItems) {
        printedLines.forEach { entry ->
            ensureSpace(52f)
            val item = object {
                val name = entry.first
                val quantity = entry.second
                val lineTotal = entry.third.first
                val unitPrice = entry.third.second
            }
            canvas.drawText(item.name.ifBlank { "-" }, margin + 10f, y + 18f, bodyPaint)
            drawRight(money(item.lineTotal), rightX - 10f, y + 18f, bodyPaint)
            y += 20f
            if (item.quantity != 1.0) {
                val q = if (item.quantity % 1.0 == 0.0) item.quantity.toInt().toString() else String.format("%.2f", item.quantity)
                canvas.drawText("$q × ${money(item.unitPrice)}", margin + 16f, y + 12f, mutedPaint)
                y += 16f
            }
            y += 6f
            canvas.drawLine(margin, y, rightX, y, linePaint)
            y += 8f
        }
    } else {
        val desc = order.designName.ifBlank { order.displayCustomerName.ifBlank { "Order" } }
        canvas.drawText(desc, margin + 10f, y + 18f, bodyPaint)
        drawRight(money(subtotal), rightX - 10f, y + 18f, bodyPaint)
        y += 28f
        canvas.drawLine(margin, y, rightX, y, linePaint)
    }
    y += 22f

    // Totals (right block) — kept whole rather than split across a page break.
    ensureSpace(90f)
    val totalsLeft = rightX - 250f
    fun totalRow(label: String, value: String, valuePaint: Paint, labelPaintUse: Paint = bodyPaint) {
        canvas.drawText(label, totalsLeft, y, labelPaintUse)
        drawRight(value, rightX, y, valuePaint)
        y += 20f
    }
    totalRow("Subtotal", money(subtotal), bodyPaint)
    when {
        isMargin -> { canvas.drawText("VAT under margin scheme (not shown separately)", totalsLeft, y, mutedPaint); y += 18f }
        isZero -> totalRow("VAT (Zero-rated / Export)", money(0.0), bodyPaint)
        else -> totalRow("VAT (${printedTaxRate.toInt()}%)", money(vat), bodyPaint)
    }
    canvas.drawLine(totalsLeft, y - 4f, rightX, y - 4f, linePaint)
    y += 8f
    totalRow("TOTAL", money(orderValue), totalPaint, totalPaint)
    y += 18f

    val approval = estimate?.approval
    if (approval != null && approval.decidedAtMs > 0L) {
        ensureSpace(if (signature != null) 190f else 110f)
        y += 8f
        val stamp = java.text.SimpleDateFormat("dd/MM/yy HH:mm", java.util.Locale.getDefault())
            .format(Date(approval.decidedAtMs))
        val declined = approval.decision == "declined"
        canvas.drawText(if (declined) "DECLINED" else "APPROVED", margin + 2f, y + 14f, labelPaint)
        y += 26f
        canvas.drawText("${if (declined) "Declined by" else "Approved by"}: ${approval.approvedByName.ifBlank { "-" }}", margin + 2f, y, bodyPaint)
        y += 16f
        if (approval.approvedByEmail.isNotBlank()) {
            canvas.drawText("Email: ${approval.approvedByEmail}", margin + 2f, y, bodyPaint); y += 16f
        }
        canvas.drawText("${if (declined) "Declined at" else "Approved at"}: $stamp", margin + 2f, y, bodyPaint)
        y += 16f
        canvas.drawText("Approval method: Customer Portal", margin + 2f, y, bodyPaint)
        y += 16f
        if (approval.declineReason.isNotBlank()) {
            pdfWrappedLines(approval.declineReason, bodyPaint, rightX - margin).forEach { line ->
                canvas.drawText(line, margin + 2f, y, bodyPaint); y += 14f
            }
        }
        if (signature != null) {
            canvas.drawText("Customer signature:", margin + 2f, y, mutedPaint)
            y += 8f
            val dest = android.graphics.RectF(margin + 2f, y, margin + 162f, y + 62f)
            canvas.drawBitmap(signature, null, dest, null)
            y += 70f
        }
    }

    if (estimate != null && estimate.terms.isNotBlank()) {
        y += 6f
        pdfWrappedLines(estimate.terms, mutedPaint, rightX - margin).forEach { line ->
            canvas.drawText(line, margin + 2f, y, mutedPaint); y += 13f
        }
    }

    // Per-order invoice note (customer-facing "Notes" box)
    val invoiceNote = if (estimate != null) "" else order.invoiceNote.trim()
    if (invoiceNote.isNotBlank()) {
        y += 8f
        val boxTop = y
        canvas.drawText("NOTES", margin + 12f, y + 18f, labelPaint)
        var ny = y + 34f
        pdfWrappedLines(invoiceNote, bodyPaint, rightX - margin - 24f).forEach { line ->
            canvas.drawText(line, margin + 12f, ny, bodyPaint)
            ny += 15f
        }
        val boxBottom = ny + 2f
        val boxStroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0x22000000; style = Paint.Style.STROKE; strokeWidth = 1f
        }
        canvas.drawRoundRect(android.graphics.RectF(margin, boxTop, rightX, boxBottom), 10f, 10f, boxStroke)
        y = boxBottom + 14f
    }

    // Footer note
    val footer = settings.invoiceFooterNote.trim()
    if (footer.isNotBlank()) {
        ensureSpace(48f)
        canvas.drawLine(margin, y, rightX, y, linePaint)
        y += 18f
        pdfWrappedLines(footer, mutedPaint, rightX - margin).forEach { line ->
            canvas.drawText(line, margin, y, mutedPaint)
            y += 15f
        }
    }

    val creditPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF9CA3AF.toInt(); textSize = 9f; textAlign = Paint.Align.CENTER
    }
    canvas.drawText("Generated with NivaDesk", pageWidth / 2f, pageHeight - margin, creditPaint)

    document.finishPage(page)
    val exportDir = File(context.cacheDir, "exports").apply { mkdirs() }
    val safeNo = pdfSafeFileName(invoiceNumber.ifBlank { order.displayCustomerName })
    // The page says ESTIMATE and the toast says Estimate; the file should agree.
    val file = File(exportDir, "${if (estimate != null) "Estimate" else "Invoice"}_${safeNo}.pdf")
    try {
        file.outputStream().use { document.writeTo(it) }
        return file
    } finally {
        document.close()
    }
}

private fun shareOrderPdf(
    context: Context,
    order: StudioOrder,
    settings: StudioWorkspaceSettings,
    canSeeFinancial: Boolean,
    advancedFinanceEnabled: Boolean
) {
    runCatching {
        val file = createOrderPdfFile(context, order, settings, canSeeFinancial, advancedFinanceEnabled)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = "application/pdf"
            putExtra(Intent.EXTRA_SUBJECT, "${order.displayCustomerName} NivaDesk PDF")
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(shareIntent, "Export PDF"))
    }.onFailure {
        Toast.makeText(context, "PDF export failed.", Toast.LENGTH_SHORT).show()
    }
}

private fun createOrderPdfFile(
    context: Context,
    order: StudioOrder,
    settings: StudioWorkspaceSettings,
    canSeeFinancial: Boolean,
    advancedFinanceEnabled: Boolean,
    logo: android.graphics.Bitmap? = null
): File {
    val pageWidth = 595
    val pageHeight = 842
    val margin = 40f
    val gap = 30f
    val colW = (pageWidth - margin * 2 - gap) / 2f
    val rightColX = margin + colW + gap

    val document = PdfDocument()
    val page = document.startPage(PdfDocument.PageInfo.Builder(pageWidth, pageHeight, 1).create())
    val canvas = page.canvas
    canvas.drawColor(0xFFFFFFFF.toInt())

    val cPrimary = 0xFF1C1C1E.toInt()
    val cGreen = 0xFF16A34A.toInt()
    val cRed = 0xFFDC2626.toInt()
    val cOrange = 0xFFF59E0B.toInt()
    val cGray = 0xFF8E8E93.toInt()

    val sectionTitlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = cGray; textSize = 11f; letterSpacing = 0.08f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = cPrimary; textSize = 11.5f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    val valuePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = cPrimary; textSize = 11.5f }
    val mutedPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = cGray; textSize = 12f }
    val jobSheetPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0x4D8E8E93; textSize = 28f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFE5E7EB.toInt(); strokeWidth = 1f }
    val cardBg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFF3F3F5.toInt() }

    fun money(v: Double) = pdfMoney(v, settings)
    fun drawRight(text: String, x: Float, yy: Float, paint: Paint) {
        val old = paint.textAlign
        paint.textAlign = Paint.Align.RIGHT
        canvas.drawText(text, x, yy, paint)
        paint.textAlign = old
    }

    // ---------- Header ----------
    var headerBottom = margin + 18f
    if (logo != null && logo.width > 0 && logo.height > 0) {
        val h = 50f
        val w = logo.width * (h / logo.height)
        canvas.drawBitmap(
            logo, null,
            android.graphics.RectF(margin, margin, margin + w, margin + h),
            Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
        )
        canvas.drawText(settings.appSubtitle.ifBlank { "NivaDesk" }, margin, margin + h + 14f, mutedPaint)
        headerBottom = margin + h + 20f
    } else {
        canvas.drawText(settings.appSubtitle.ifBlank { "NivaDesk" }, margin, margin + 16f, mutedPaint)
        headerBottom = margin + 26f
    }
    drawRight("JOB SHEET", pageWidth - margin, margin + 30f, jobSheetPaint)
    val dividerY = headerBottom + 10f
    canvas.drawLine(margin, dividerY, pageWidth - margin, dividerY, linePaint)
    val bodyTop = dividerY + 22f

    // ---------- Card renderer ----------
    val innerPad = 14f
    val labelW = 108f
    val rowGap = 8f
    val lineH = 15f
    val valueW = colW - innerPad * 2 - labelW - 4f

    fun drawCard(colX: Float, startY: Float, title: String, rows: List<Triple<String, String, Int>>): Float {
        if (rows.isEmpty()) return startY
        canvas.drawText(title.uppercase(Locale.UK), colX, startY + 9f, sectionTitlePaint)
        val cardTop = startY + 16f
        val wrapped = rows.map { r ->
            r to pdfWrappedLines(r.second.ifBlank { "-" }, valuePaint, valueW)
        }
        var contentH = 0f
        wrapped.forEachIndexed { i, (_, lines) ->
            contentH += maxOf(lineH, lines.size * lineH)
            if (i < wrapped.size - 1) contentH += rowGap
        }
        val cardH = contentH + innerPad * 2
        canvas.drawRoundRect(
            android.graphics.RectF(colX, cardTop, colX + colW, cardTop + cardH), 8f, 8f, cardBg
        )
        var ty = cardTop + innerPad + 10f
        wrapped.forEach { (r, lines) ->
            canvas.drawText(r.first, colX + innerPad, ty, labelPaint)
            val vp = Paint(valuePaint).apply { color = r.third }
            lines.forEachIndexed { idx, line -> canvas.drawText(line, colX + innerPad + labelW, ty + idx * lineH, vp) }
            ty += maxOf(lineH, lines.size * lineH) + rowGap
        }
        return cardTop + cardH + 22f
    }

    // ---------- Left column ----------
    var leftY = bodyTop

    if (settings.pdfShowCustomer) {
        val rows = mutableListOf(
            Triple("Customer Name:", order.displayCustomerName.ifBlank { "-" }, cPrimary),
            Triple("Design Name:", order.designName.ifBlank { "-" }, cPrimary)
        )
        order.lineItems.forEach { item ->
            val q = if (item.quantity == 1.0) "" else "×" + (if (item.quantity % 1.0 == 0.0) item.quantity.toInt().toString() else String.format("%.2f", item.quantity))
            rows.add(Triple("  • " + item.name.ifBlank { "-" }, q, cPrimary))
        }
        settings.customFields.map { it.trim() }.filter { it.isNotBlank() }.forEach { title ->
            rows.add(Triple("$title:", order.customFields[title]?.ifBlank { "-" } ?: "-", cPrimary))
        }
        rows.add(Triple("Placed On:", pdfDate(order.paymentDate), cPrimary))
        leftY = drawCard(margin, leftY, "Customer & Design", rows)
    }

    if (settings.pdfShowPriority) {
        val rows = mutableListOf(
            Triple("Priority:", order.priority.ifBlank { "Normal" }, cPrimary),
            Triple("Risk:", order.risk.ifBlank { "None" }, cPrimary)
        )
        if (order.risk != "None" && order.riskReason.isNotBlank() && order.riskReason != "-") {
            rows.add(Triple("Reason:", order.riskReason, cPrimary))
        }
        leftY = drawCard(margin, leftY, "Priority / Risk", rows)
    }

    if (settings.pdfShowMaterials) {
        val rows = mutableListOf<Triple<String, String, Int>>()
        materialDefaultCheckLabels(settings).forEachIndexed { index, label ->
            rows.add(Triple("$label:", yesNo(materialDefaultToggleValue(order, index, label)), cPrimary))
        }
        settings.materialsToggles.map { it.trim() }.filter { it.isNotBlank() }.forEach { label ->
            rows.add(Triple("$label:", yesNo(order.customToggles["materials::$label"] == true), cPrimary))
        }
        if (settings.showMaterialsNotesSupplier && order.invNotes.isNotBlank()) {
            rows.add(Triple(settings.materialsNotesSupplierLabel.ifBlank { "Notes / Supplier" } + ":", order.invNotes, cPrimary))
        }
        leftY = drawCard(margin, leftY, "Materials & Inventory", rows)
    }

    if (settings.pdfShowContact) {
        val rows = mutableListOf(
            Triple("Email:", order.emailAddress.ifBlank { "-" }, cPrimary)
        )
        communicationChannelLabels(settings).forEach { label ->
            val value = communicationChannelDisplayValue(order, label)
            if (value.isNotBlank()) rows.add(Triple("$label:", value, cPrimary))
        }
        normalizedSpecialNoteSections(settings.specialNoteSections).forEach { section ->
            val value = specialNoteValue(order, section)
            if (value.isNotBlank()) rows.add(Triple(section.title + ":", value, cPrimary))
        }
        leftY = drawCard(margin, leftY, "Contact & Notes", rows)
    }

    if (settings.pdfShowAddress) {
        val billing = customFieldValue(order, "communicationAddress").ifBlank { customFieldValue(order, "Address") }.ifBlank { "-" }
        val rows = listOf(
            Triple("Address:", billing, cPrimary),
            Triple("Telephone:", order.whatsappNumber.ifBlank { "-" }, cPrimary)
        )
        leftY = drawCard(margin, leftY, "Billing Address", rows)
    }

    // ---------- Right column ----------
    var rightY = bodyTop

    val showFinCustomer = canSeeFinancial && settings.pdfShowFinCustomer
    val showFinInternal = canSeeFinancial && advancedFinanceEnabled && settings.pdfShowFinInternal
    if (showFinCustomer || showFinInternal) {
        val rows = mutableListOf<Triple<String, String, Int>>()
        if (showFinCustomer) {
            rows.add(Triple("Paid:", money(order.paidAmount), cGreen))
            rows.add(Triple("Remaining:", money(order.remainingAmount), cOrange))
            if (settings.pdfShowPaymentMethod) {
                rows.add(Triple("Payment Method:", order.paymentMethod.ifBlank { "Card" }, cPrimary))
            }
        }
        if (showFinInternal) {
            rows.add(Triple("Platform Fee:", money(order.paymentFee), cRed))
            rows.add(Triple("Watch Cost:", money(order.watchPurchasePrice), cRed))
            rows.add(Triple("Shipping Cost:", money(order.deliveryCost), cRed))
            rows.add(Triple("VAT Amount:", money(order.taxAmount), cRed))
            val profitAfterVat = financialFinalProfit(order, settings)
            if (settings.corporationTaxEnabled) {
                val ct = kotlin.math.round(maxOf(0.0, profitAfterVat) * settings.corporationTaxRate) / 100.0
                rows.add(Triple("Profit before Corp. Tax:", money(profitAfterVat), cPrimary))
                rows.add(Triple("Corp. Tax (${settings.corporationTaxRate.toInt()}%):", money(ct), cRed))
                rows.add(Triple("Net Profit (CT):", money(profitAfterVat - ct), cGreen))
            } else {
                rows.add(Triple("Final Profit:", money(profitAfterVat), cGreen))
            }
        }
        rightY = drawCard(rightColX, rightY, "Financial Info", rows)
    }

    if (settings.pdfShowStatus) {
        val rows = mutableListOf(
            Triple("Delivery Time:", "${order.deliveryTime} days", cPrimary)
        )
        settings.customSteps.map { it.trim() }.filter { it.isNotBlank() }.forEachIndexed { index, step ->
            val value = when (index) {
                0 -> order.designStatus
                1 -> order.status
                else -> order.extraStatuses[step] ?: "Not Yet"
            }
            rows.add(Triple("$step:", value, cPrimary))
        }
        settings.customToggles.map { it.trim() }.filter { it.isNotBlank() }.forEach { label ->
            rows.add(Triple("$label:", yesNo(order.customToggles[label] == true), cPrimary))
        }
        rightY = drawCard(rightColX, rightY, "Production Status", rows)
    }

    if (settings.pdfShowShipping) {
        val rows = listOf(
            Triple("Dispatched:", yesNo(order.isDispatched), cPrimary),
            Triple("Courier:", order.courier.ifBlank { "-" }, cPrimary),
            Triple("Tracking No.:", order.trackingNumber.ifBlank { "-" }, cPrimary)
        )
        rightY = drawCard(rightColX, rightY, "Shipping & Tracking", rows)
    }

    if (settings.pdfShowShippingAddress) {
        val shipLine = listOf(order.shippingStreetAddress, order.shippingCity, order.shippingPostalCode, order.shippingCountry)
            .filter { it.isNotBlank() }.joinToString(", ")
        val rows = listOf(
            Triple("Recipient:", order.shippingName.ifBlank { order.customerName }, cPrimary),
            Triple("Address:", shipLine.ifBlank { "-" }, cPrimary),
            Triple("Shipping Phone:", order.shippingPhone.ifBlank { "-" }, cPrimary)
        )
        rightY = drawCard(rightColX, rightY, "Shipping Address", rows)
    }

    // ---------- Footer ----------
    val creditPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = cGray; textSize = 10f; textAlign = Paint.Align.CENTER
    }
    canvas.drawText("Generated automatically from NivaDesk", pageWidth / 2f, pageHeight - margin + 6f, creditPaint)

    document.finishPage(page)

    val exportDir = File(context.cacheDir, "exports").apply { mkdirs() }
    val file = File(exportDir, "${pdfSafeFileName(order.displayCustomerName)}_${order.id.take(8)}.pdf")
    try {
        file.outputStream().use { document.writeTo(it) }
        return file
    } finally {
        document.close()
    }
}

private fun pdfMoney(value: Double, settings: StudioWorkspaceSettings): String {
    val formatted = String.format(Locale.UK, "%,.2f", value)
    val localized = if (settings.selectedDecimalSeparator == ",") {
        formatted.replace(",", "_").replace(".", ",").replace("_", ".")
    } else {
        formatted
    }
    return settings.selectedCurrency.ifBlank { "£" } + localized
}

private fun pdfDate(date: Date): String {
    return SimpleDateFormat("dd/MM/yy", Locale.UK).format(date)
}

private fun pdfSafeFileName(value: String): String {
    return value
        .trim()
        .ifBlank { "NivaDesk_Order" }
        .replace(Regex("[^A-Za-z0-9._-]+"), "_")
        .take(80)
}

private fun pdfWrappedLines(text: String, paint: Paint, maxWidth: Float): List<String> {
    val result = mutableListOf<String>()
    text.replace("\r", "")
        .split('\n')
        .forEach { rawLine ->
            val words = rawLine.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
            if (words.isEmpty()) {
                result.add("")
            } else {
                var current = ""
                words.forEach { word ->
                    val candidate = if (current.isBlank()) word else "$current $word"
                    if (paint.measureText(candidate) <= maxWidth || current.isBlank()) {
                        current = candidate
                    } else {
                        result.add(current)
                        current = word
                    }
                }
                if (current.isNotBlank()) result.add(current)
            }
        }
    return result.ifEmpty { listOf("-") }
}

private fun normalizedSpecialNoteSections(values: List<StudioHeadingItem>): List<StudioHeadingItem> {
    val cleaned = mutableListOf<StudioHeadingItem>()
    values.forEach { item ->
        val title = item.title.trim().take(120)
        if (title.isBlank()) return@forEach
        val id = item.id.trim().take(80)
        if (id.isNotBlank() && cleaned.none { existing -> existing.id.equals(id, ignoreCase = true) }) {
            cleaned.add(StudioHeadingItem(id, title))
        }
    }
    val primaryIndex = cleaned.indexOfFirst { it.id.equals(STUDIO_PRIMARY_SPECIAL_NOTE_ID, ignoreCase = true) }
    val primary = if (primaryIndex >= 0) {
        cleaned.removeAt(primaryIndex).copy(id = STUDIO_PRIMARY_SPECIAL_NOTE_ID)
    } else {
        StudioHeadingItem(STUDIO_PRIMARY_SPECIAL_NOTE_ID, "Special Notes")
    }
    cleaned.add(0, primary.copy(title = primary.title.ifBlank { "Special Notes" }))
    return cleaned.take(40)
}

private fun specialNoteValue(order: StudioOrder, section: StudioHeadingItem): String {
    if (section.id.equals(STUDIO_PRIMARY_SPECIAL_NOTE_ID, ignoreCase = true)) return order.notes
    val canonicalKey = specialNoteCustomFieldKey(section.id)
    return order.customFields.entries
        .firstOrNull { (key, _) -> key.equals(canonicalKey, ignoreCase = true) }
        ?.value
        .orEmpty()
}

private fun specialNoteCustomFieldKey(id: String): String {
    return "specialNote::${id.trim().uppercase(Locale.US)}"
}

private enum class CommunicationChannelKind {
    Email,
    Phone,
    Instagram,
    Address,
    Custom
}

private fun communicationChannelLabels(settings: StudioWorkspaceSettings): List<String> {
    return settings.communicationChannelLabels
        .map { it.trim().take(120) }
        .filter { it.isNotBlank() }
        .distinctBy { it.lowercase(Locale.UK) }
        .ifEmpty { listOf("Instagram", "WhatsApp", "TikTok") }
}

private fun communicationChannelKind(channel: String): CommunicationChannelKind {
    val normalized = channel.trim().lowercase(Locale.UK).replace("-", " ")
    return when (normalized) {
        "email", "e mail" -> CommunicationChannelKind.Email
        "whatsapp", "whats app", "telephone", "phone", "mobile" -> CommunicationChannelKind.Phone
        "instagram", "instagram username" -> CommunicationChannelKind.Instagram
        "address", "shipping address", "adres" -> CommunicationChannelKind.Address
        else -> CommunicationChannelKind.Custom
    }
}

private fun communicationChannelCustomKey(channel: String): String {
    return "communicationChannel::${channel.trim()}"
}

private fun communicationChannelDisplayValue(order: StudioOrder, channel: String): String {
    return when (communicationChannelKind(channel)) {
        CommunicationChannelKind.Email -> order.emailAddress
        CommunicationChannelKind.Phone -> order.whatsappNumber
        CommunicationChannelKind.Instagram -> order.instagramUsername
        CommunicationChannelKind.Address -> customFieldValue(order, "communicationAddress")
        CommunicationChannelKind.Custom -> customFieldValue(order, communicationChannelCustomKey(channel))
    }
}

private fun quickReminderTemplates(settings: StudioWorkspaceSettings): List<StudioQuickReminderTemplate> {
    val configured = settings.scheduleQuickReminders
        .map { item ->
            item.copy(
                title = item.title.trim().take(120),
                days = item.days.coerceIn(0, 365),
                hours = item.hours.coerceIn(0, 23),
                priority = reminderPriority(item.priority)
            )
        }
        .filter { it.title.isNotBlank() }
        .distinctBy { it.title.lowercase(Locale.UK) }
    return configured.ifEmpty {
        listOf(
            StudioQuickReminderTemplate("default-follow-up", "Follow up customer", 1, 0),
            StudioQuickReminderTemplate("default-update", "Send design update", 1, 0),
            StudioQuickReminderTemplate("default-approval", "Ask for approval", 2, 0),
            StudioQuickReminderTemplate("default-payment", "Check payment", 2, 0),
            StudioQuickReminderTemplate("default-delivery", "Check delivery status", 0, 12)
        )
    }
}

private fun reminderPriority(value: String): String {
    return when (value.trim().lowercase(Locale.UK)) {
        "low" -> "Low"
        "high" -> "High"
        "urgent" -> "Urgent"
        else -> "Normal"
    }
}

private fun materialDefaultCheckLabels(settings: StudioWorkspaceSettings): List<String> {
    return settings.materialsDefaultChecks
        .map { it.trim() }
        .filter { it.isNotBlank() }
        .ifEmpty { listOf("Dial Sourced", "Dial Received", "Watch Received", "Materials Ready") }
}

private fun materialDefaultToggleValue(order: StudioOrder, index: Int, label: String): Boolean {
    return when (index) {
        0 -> order.invBool1
        1 -> order.invBool2
        2 -> order.invBool3
        3 -> order.invBool4
        else -> order.customToggles["materialsDefault::$label"] == true
    }
}

private fun materialDefaultTogglePayload(index: Int, label: String, value: Boolean): Map<String, Any?> {
    val details = when (index) {
        0 -> mapOf("invBool1" to value)
        1 -> mapOf("invBool2" to value)
        2 -> mapOf("invBool3" to value)
        3 -> mapOf("invBool4" to value)
        else -> mapOf("materialsDefaultToggles" to mapOf(label to value))
    }
    return mapOf("details" to details)
}

private fun statusStepValue(order: StudioOrder, label: String): String {
    return order.extraStatuses.entries
        .firstOrNull { (key, _) -> key.equals(label, ignoreCase = true) || key.removePrefix("statusStep::").equals(label, ignoreCase = true) }
        ?.value
        ?.ifBlank { "Not Yet" }
        ?: "Not Yet"
}

private fun statusToggleValue(order: StudioOrder, label: String): Boolean {
    return order.customToggles.entries.firstOrNull { (key, _) ->
        key.equals(label, ignoreCase = true) || key.removePrefix("statusToggle::").equals(label, ignoreCase = true)
    }?.value == true
}

private fun summaryStepLabel(raw: String, settings: StudioWorkspaceSettings, fallbackIndex: Int): String {
    val cleaned = raw.trim()
    if (cleaned.isNotBlank()) return cleaned
    return settings.customSteps.getOrNull(fallbackIndex)?.trim()?.takeIf { it.isNotBlank() }
        ?: if (fallbackIndex == 0) "Design" else "Production"
}

private fun summaryStepValue(order: StudioOrder, settings: StudioWorkspaceSettings, label: String): String {
    val cleaned = label.trim()
    val designLabel = settings.customSteps.getOrNull(0)?.trim().orEmpty().ifBlank { "Design" }
    val productionLabel = settings.customSteps.getOrNull(1)?.trim().orEmpty().ifBlank { "Production" }
    return when {
        cleaned.equals(designLabel, ignoreCase = true) || cleaned.equals("Design", ignoreCase = true) -> order.designStatus.ifBlank { "Not Yet" }
        cleaned.equals(productionLabel, ignoreCase = true) ||
            cleaned.equals("Production", ignoreCase = true) ||
            cleaned.equals("Painting", ignoreCase = true) -> order.status.ifBlank { "Not Yet" }
        else -> statusStepValue(order, cleaned)
    }
}

private fun <T> visibleCustomFields(fields: Map<String, T>): Map<String, T> {
    val internalKeys = setOf("scheduleAlertItemsV1", "reminderItemsV1", "communicationAddress", "communicationCustomerNotes", "Source")
    return fields.toSortedMap().filterKeys { key ->
        val cleaned = key.trim()
        // "Shopify *" keys feed the source strip at the top of the screen —
        // hide them here so they don't double up as raw rows in the Customer card.
        cleaned.isNotBlank() && !cleaned.startsWith("__") && "::" !in cleaned &&
            cleaned !in internalKeys && !cleaned.startsWith("Shopify ")
    }
}

private fun cleanCustomFieldTitles(titles: List<String>): List<String> {
    return titles
        .map { it.trim() }
        .filter { it.isNotBlank() }
        .distinctBy { it.lowercase(Locale.UK) }
}

private fun orderedCustomFieldsForDisplay(fields: Map<String, String>, configuredTitles: List<String>): List<Pair<String, String>> {
    val visibleFields = visibleCustomFields(fields)
    val consumed = mutableSetOf<String>()
    val configuredRows = cleanCustomFieldTitles(configuredTitles).map { title ->
        consumed.add(title.lowercase(Locale.UK))
        title to customFieldValue(fields, title)
    }
    val extraRows = visibleFields.entries
        .filter { it.key.lowercase(Locale.UK) !in consumed }
        .map { it.key to it.value }
    return configuredRows + extraRows
}

private fun customFieldValue(fields: Map<String, String>, key: String): String {
    val target = key.trim().lowercase(Locale.UK)
    if (target.isBlank()) return ""
    return fields.entries.firstOrNull { it.key.trim().lowercase(Locale.UK) == target }?.value.orEmpty()
}

// Green source strip shown when an order came from the official Shopify app
// (customFields["Source"] == "Shopify"). Mirrors web/Mac: store · order no ·
// payment · original amount on currency mismatch · fulfilment · admin link.
// The raw "Shopify *" custom fields are hidden from the Customer card by
// visibleCustomFields so this strip is their only surface.
private val ShopifySymbolToCode = mapOf(
    "£" to "GBP", "$" to "USD", "€" to "EUR", "₺" to "TRY", "¥" to "JPY",
    "AED" to "AED", "CAD" to "CAD", "AUD" to "AUD", "CHF" to "CHF"
)
private val ShopifyCodeToSymbol = mapOf(
    "GBP" to "£", "USD" to "$", "EUR" to "€", "TRY" to "₺", "JPY" to "¥"
)

@Composable
private fun ShopifyOrderSourceStrip(order: StudioOrder) {
    val fields = order.customFields
    if ((fields["Source"] ?: "").trim() != "Shopify") return
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val uriHandler = LocalUriHandler.current
    val green = Color(0xFF2E7D32)

    val storeName = (fields["Shopify Store"] ?: "").trim()
        .ifBlank { (fields["Shopify Domain"] ?: "").trim() }
        .ifBlank { "Shopify" }
    val orderNumber = (fields["Shopify Order Number"] ?: "").trim()
    val paymentStatus = (fields["Shopify Status"] ?: "").trim()

    // Amounts import as raw numbers (never converted); show the original when
    // the store charged in a different currency than the workspace displays.
    val orderCurrency = (fields["Shopify Currency"] ?: "").trim().uppercase()
    val workspaceCode = ShopifySymbolToCode[LocalCurrencySymbol.current.trim()] ?: ""
    val shopifyTotal = (fields["Shopify Total"] ?: "").trim()
    val originalAmount =
        if (orderCurrency.isNotEmpty() && shopifyTotal.isNotEmpty() && workspaceCode.isNotEmpty() && orderCurrency != workspaceCode) {
            "${ShopifyCodeToSymbol[orderCurrency] ?: ""}$shopifyTotal $orderCurrency"
        } else ""

    val domain = (fields["Shopify Domain"] ?: "").trim()
    val shopifyOrderId = (fields["Shopify Order ID"] ?: "").trim()
    val adminUrl = if (domain.isNotEmpty() && shopifyOrderId.isNotEmpty()) {
        "https://admin.shopify.com/store/${domain.removeSuffix(".myshopify.com")}/orders/$shopifyOrderId"
    } else ""

    Surface(
        shape = RoundedCornerShape(10.dp),
        color = green.copy(alpha = 0.08f),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 12.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Surface(shape = RoundedCornerShape(999.dp), color = green.copy(alpha = 0.16f)) {
                Text(
                    "Shopify",
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = green,
                    fontWeight = FontWeight.Bold
                )
            }
            Text(storeName, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
            if (orderNumber.isNotEmpty()) {
                Text("· $orderNumber", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (paymentStatus.isNotEmpty()) {
                Text("· ${t("Payment")}: $paymentStatus", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (originalAmount.isNotEmpty()) {
                Text("· $originalAmount", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
            }
            Text(
                "· ${if (order.isDispatched) t("Fulfilled") else t("Unfulfilled")}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (adminUrl.isNotEmpty()) {
                Text(
                    "${t("View in Shopify")} ↗",
                    style = MaterialTheme.typography.bodySmall,
                    color = green,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clickable { uriHandler.openUri(adminUrl) }
                )
            }
        }
    }
}

// VAT sits INSIDE the price the customer pays, so it is extracted from the
// gross rather than added on top: £1,450 at 20% is £241.67 of VAT on £1,208.33,
// not £290. Mirrors vatFromGrossAmount() in functions/index.js — the invoice,
// the estimate and the Finance card must all agree with the server.
private fun vatFromGross(taxRate: Double, grossAmount: Double): Double {
    if (taxRate <= 0.0 || grossAmount <= 0.0) return 0.0
    return (grossAmount * taxRate) / (100.0 + taxRate)
}
