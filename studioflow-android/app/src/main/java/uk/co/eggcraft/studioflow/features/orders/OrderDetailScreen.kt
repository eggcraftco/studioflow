package uk.co.eggcraft.studioflow.features.orders

import android.content.Context
import android.content.ClipData
import android.content.ClipDescription
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
import androidx.compose.foundation.border
import androidx.compose.foundation.draganddrop.dragAndDropSource
import androidx.compose.foundation.draganddrop.dragAndDropTarget
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Percent
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.TableChart
import androidx.compose.material.icons.filled.Timeline
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.net.URL
import org.json.JSONArray
import org.json.JSONObject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.roundToInt
import uk.co.eggcraft.studioflow.data.model.OrderDetailCardId
import uk.co.eggcraft.studioflow.data.model.OrderDetailCardLayout
import uk.co.eggcraft.studioflow.data.model.STUDIO_PRIMARY_SPECIAL_NOTE_ID
import uk.co.eggcraft.studioflow.data.model.StudioBillingPlan
import uk.co.eggcraft.studioflow.data.model.StudioHeadingItem
import uk.co.eggcraft.studioflow.data.model.StudioOrder
import uk.co.eggcraft.studioflow.data.model.StudioQuickReminderTemplate
import uk.co.eggcraft.studioflow.data.model.StudioScheduleReminder
import uk.co.eggcraft.studioflow.data.model.StudioTeamMember
import uk.co.eggcraft.studioflow.data.model.StudioTodoItem
import uk.co.eggcraft.studioflow.data.model.StudioWorkspace
import uk.co.eggcraft.studioflow.data.model.StudioWorkspaceSettings
import uk.co.eggcraft.studioflow.ui.theme.StudioBlue
import uk.co.eggcraft.studioflow.ui.theme.StudioGreen
import uk.co.eggcraft.studioflow.ui.theme.StudioRed
import uk.co.eggcraft.studioflow.ui.theme.StudioWarningOrange

private val LocalDetailCardsUnlocked = compositionLocalOf { false }
private val LocalOrderCardActions = compositionLocalOf<OrderCardCustomizationActions?> { null }
private val LocalUnifiedBoardVerticalScroll = compositionLocalOf { false }
private val LocalCurrencySymbol = compositionLocalOf { "£" }
private val LocalDecimalSeparator = compositionLocalOf { "." }
private const val StudioCardDragMime = "application/x-studioflow-card"

private data class OrderCardCustomizationActions(
    val cardId: OrderDetailCardId,
    val orderId: String,
    val columnIndex: Int,
    val columnCount: Int,
    val columnWidth: Int,
    val layout: OrderDetailCardLayout,
    val onColumnResizeStart: () -> Unit,
    val onColumnResizeBy: (Float) -> Unit,
    val onColumnResizeFinish: () -> Unit,
    val onSaveLayout: (OrderDetailCardLayout) -> Unit
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
    onUploadClientFile: (StudioOrder, ByteArray, String, String) -> Unit,
    onUploadPreviewImage: (StudioOrder, ByteArray, String, String) -> Unit,
    onRefreshLiveTracking: (StudioOrder) -> Unit,
    onRenameClientFile: (StudioOrder, String, String) -> Unit,
    onDeleteClientFile: (StudioOrder, String) -> Unit,
    currentUserId: String = "",
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit = { _, _ -> },
    showBack: Boolean = true,
    modifier: Modifier = Modifier
) {
    val access = workspace?.memberAccess
    fun allowed(key: String): Boolean = access?.allows(key) != false && workspaceSettings.showsCard(key)
    val canSeeFinancial = workspace?.canSeeFinancialData == true && allowed("cardFinancial")
    val canAssign = workspace?.let {
        it.isOwner || (it.role in setOf("admin", "member") && it.memberAccess.manageProjectAssignments)
    } == true
    val canEditWorkflow = workspace?.let {
        (it.isOwner || it.role in setOf("admin", "member", "workflow")) && it.memberAccess.orders
    } == true
    val canEditFinance = workspace?.let {
        (it.isOwner || it.role in setOf("admin", "member")) && it.memberAccess.financialInfo
    } == true
    val canAssignTasks = workspace?.billingPlan == StudioBillingPlan.TeamMonthly && teamMembers.isNotEmpty()
    val financeAdvancedEnabled = workspace?.billingPlan != StudioBillingPlan.Demo
    val canManageCardLayout = workspace?.let { it.isOwner || it.role in setOf("admin", "member") } == true
    fun allowedCard(cardId: OrderDetailCardId): Boolean {
        return when (cardId) {
            OrderDetailCardId.Financial -> canSeeFinancial
            else -> allowed(cardId.accessKey)
        }
    }
    fun saveCardLayout(nextLayout: OrderDetailCardLayout) {
        val snapshotJSON = nextLayout.toWorkspaceSnapshotJSON()
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
        LocalDecimalSeparator provides workspaceSettings.selectedDecimalSeparator
    ) {
        BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val useBoardLayout = !showBack && maxWidth >= 520.dp
        if (useBoardLayout) {
            DesktopOrderDetailBoard(
                order = order,
                workspace = workspace,
                workspaceSettings = workspaceSettings,
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
                onSaveCardLayout = ::saveCardLayout,
                modifier = Modifier.fillMaxSize()
            )
            return@BoxWithConstraints
        }

        val visiblePhoneCards = workspaceSettings.orderCardLayout.phoneOrder
            .filter { cardId -> allowedCard(cardId) && workspaceSettings.orderCardLayout.isVisible(cardId) }
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                DetailTopBar(
                    order = order,
                    workspaceSettings = workspaceSettings,
                    canSeeFinancial = canSeeFinancial,
                    financeAdvancedEnabled = financeAdvancedEnabled,
                    onBack = onBack,
                    showBack = showBack
                )
            }
            item {
                DetailHero(
                    order = order,
                    assignee = assigneeLabelForDetail(order, teamMembers),
                    canAssign = canAssign,
                    teamMembers = teamMembers,
                    onAssignOrder = onAssignOrder
                )
            }
            visiblePhoneCards.forEach { cardId ->
                item(key = cardId.raw) {
                    OrderLayoutCardFrame(
                        cardId = cardId,
                        cardsUnlocked = canManageCardLayout,
                        onDropCard = { dragged ->
                            if (dragged != cardId) {
                                saveCardLayout(workspaceSettings.orderCardLayout.movePhoneCardAfter(dragged, cardId))
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
                            onUpdateOrderFields = onUpdateOrderFields,
                            onUploadClientFile = onUploadClientFile,
                            onUploadPreviewImage = onUploadPreviewImage,
                            onRefreshLiveTracking = onRefreshLiveTracking,
                            onRenameClientFile = onRenameClientFile,
                            onDeleteClientFile = onDeleteClientFile
                        )
                    }
                }
            }
            item {
                Spacer(modifier = Modifier.height(18.dp))
            }
        }
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
    showBack: Boolean
) {
    val context = LocalContext.current
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (showBack) {
            TextButton(onClick = onBack) {
                Text("Orders", color = StudioBlue, fontWeight = FontWeight.ExtraBold)
            }
        }
        TextButton(
            onClick = {
                shareOrderPdf(
                    context = context,
                    order = order,
                    settings = workspaceSettings,
                    canSeeFinancial = canSeeFinancial,
                    advancedFinanceEnabled = financeAdvancedEnabled
                )
            }
        ) {
            Icon(Icons.Filled.Description, contentDescription = null, tint = StudioBlue)
            Spacer(modifier = Modifier.width(4.dp))
            Text("PDF", color = StudioBlue, fontWeight = FontWeight.ExtraBold)
        }
        Column(modifier = Modifier.weight(1f), horizontalAlignment = Alignment.End) {
            Text(
                text = order.displayCustomerName,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 18.sp
            )
            Text(
                text = order.designName.ifBlank { "New Project" },
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.SemiBold,
                fontSize = 12.sp
            )
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
    onSaveCardLayout: (OrderDetailCardLayout) -> Unit,
    modifier: Modifier = Modifier
) {
    val access = workspace?.memberAccess
    fun allowed(key: String): Boolean = access?.allows(key) != false && workspaceSettings.showsCard(key)
    fun allowedCard(cardId: OrderDetailCardId): Boolean {
        return when (cardId) {
            OrderDetailCardId.Financial -> canSeeFinancial
            else -> allowed(cardId.accessKey)
        }
    }
    var cardsUnlocked by remember(order.id) { mutableStateOf(true) }
    var resizingColumnIndex by remember(order.id) { mutableStateOf<Int?>(null) }
    var resizeColumnBaseWidth by remember(order.id) { mutableStateOf(0) }
    var resizeColumnDeltaDp by remember(order.id) { mutableStateOf(0f) }

    BoxWithConstraints(
        modifier = modifier
            .background(MaterialTheme.colorScheme.background)
    ) {
        val boardMaxWidth = maxWidth
        val density = LocalDensity.current
        val layout = workspaceSettings.orderCardLayout
        Column(modifier = Modifier.fillMaxSize()) {
            DesktopOrderHeader(
                order = order,
                workspaceSettings = workspaceSettings,
                canAssign = canAssign,
                canEditWorkflow = canEditWorkflow,
                canEditFinance = canEditFinance,
                canSeeFinancial = canSeeFinancial,
                financeAdvancedEnabled = financeAdvancedEnabled,
                cardsUnlocked = cardsUnlocked && canManageCardLayout,
                onCardsUnlockedChange = { if (canManageCardLayout) cardsUnlocked = it },
                canManageCardLayout = canManageCardLayout,
                cardLayout = layout,
                teamMembers = teamMembers,
                onAssignOrder = onAssignOrder,
                onUpdateOrderFields = onUpdateOrderFields,
                onSaveCardLayout = onSaveCardLayout
            )
            CompositionLocalProvider(
                LocalDetailCardsUnlocked provides (cardsUnlocked && canManageCardLayout),
                LocalUnifiedBoardVerticalScroll provides true
            ) {
                val columnCount = layout.columns.size.coerceAtLeast(3).coerceAtMost(8)
                val hiddenCards = OrderDetailCardId.DefaultOrder
                    .filter { cardId -> allowedCard(cardId) && !layout.isVisible(cardId) }
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
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .horizontalScroll(boardHorizontalScroll)
                ) {
                    Row(
                        modifier = Modifier
                            .verticalScroll(boardVerticalScroll)
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
                                .filter { cardId -> allowedCard(cardId) && layout.isVisible(cardId) }
                            DesktopColumn(
                                widthDp = columnWidth,
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
                                    CardInsertionDropZone(
                                        enabled = cardsUnlocked && canManageCardLayout,
                                        onDropCard = { dragged ->
                                            if (dragged != cardId) {
                                                onSaveCardLayout(layout.moveDesktopCardBefore(dragged, columnIndex, cardId))
                                            }
                                        }
                                    )
                                    OrderLayoutCardFrame(
                                        cardId = cardId,
                                        cardsUnlocked = cardsUnlocked && canManageCardLayout,
                                        customizationActions = OrderCardCustomizationActions(
                                            cardId = cardId,
                                            orderId = order.id,
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
                                            onSaveLayout = onSaveCardLayout
                                        ),
                                        onDropCard = { dragged ->
                                            if (dragged != cardId) {
                                                onSaveCardLayout(layout.moveDesktopCardAfter(dragged, columnIndex, cardId))
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
                                            onUpdateOrderFields = onUpdateOrderFields,
                                            onUploadClientFile = onUploadClientFile,
                                            onUploadPreviewImage = onUploadPreviewImage,
                                            onRefreshLiveTracking = onRefreshLiveTracking,
                                            onRenameClientFile = onRenameClientFile,
                                            onDeleteClientFile = onDeleteClientFile
                                        )
                                    }
                                }
                                ColumnDropZone(
                                    enabled = cardsUnlocked && canManageCardLayout,
                                    hasCards = columnCards.isNotEmpty(),
                                    onDropCard = { dragged ->
                                        onSaveCardLayout(layout.moveDesktopCardToColumnEnd(dragged, columnIndex))
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DesktopOrderHeader(
    order: StudioOrder,
    workspaceSettings: StudioWorkspaceSettings,
    canAssign: Boolean,
    canEditWorkflow: Boolean,
    canEditFinance: Boolean,
    canSeeFinancial: Boolean,
    financeAdvancedEnabled: Boolean,
    cardsUnlocked: Boolean,
    onCardsUnlockedChange: (Boolean) -> Unit,
    canManageCardLayout: Boolean,
    cardLayout: OrderDetailCardLayout,
    teamMembers: List<StudioTeamMember>,
    onAssignOrder: (StudioOrder, StudioTeamMember?) -> Unit,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onSaveCardLayout: (OrderDetailCardLayout) -> Unit
) {
    val context = LocalContext.current
    var actionsOpen by remember { mutableStateOf(false) }
    val hiddenCardCount = OrderDetailCardId.DefaultOrder.count { cardLayout.isVisible(it).not() }
    Surface(
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 18.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = order.displayCustomerName,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.ExtraBold
                )
                Text(
                    text = order.designName.ifBlank { order.watchRef.ifBlank { "New Project" } },
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
            }
            StatusPill(deliveryLabel(order), deliveryColor(order))
            if (canSeeFinancial) StatusPill(money(order.orderValue), StudioGreen)
            if (canAssign) {
                AssignmentMenuForDetail(order = order, teamMembers = teamMembers, onAssignOrder = onAssignOrder)
            }
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = if (cardsUnlocked) StudioGreen.copy(alpha = 0.12f) else MaterialTheme.colorScheme.surfaceVariant,
                border = BorderStroke(1.dp, if (cardsUnlocked) StudioGreen.copy(alpha = 0.22f) else MaterialTheme.colorScheme.outlineVariant),
                onClick = { onCardsUnlockedChange(!cardsUnlocked) }
            ) {
                Text(
                    if (cardsUnlocked) "Cards Unlocked" else "Cards Locked",
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    color = if (cardsUnlocked) StudioGreen else MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.ExtraBold
                )
            }
            Box {
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    onClick = { actionsOpen = true }
                ) {
                    Text(
                        "Actions",
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                }
                DropdownMenu(expanded = actionsOpen, onDismissRequest = { actionsOpen = false }) {
                    DropdownMenuItem(
                        text = { Text("Export PDF") },
                        onClick = {
                            actionsOpen = false
                            shareOrderPdf(
                                context = context,
                                order = order,
                                settings = workspaceSettings,
                                canSeeFinancial = canSeeFinancial,
                                advancedFinanceEnabled = financeAdvancedEnabled
                            )
                        }
                    )
                    if (canManageCardLayout) {
                        DropdownMenuItem(
                            text = { Text("Restore all hidden cards") },
                            enabled = cardsUnlocked && hiddenCardCount > 0,
                            onClick = {
                                actionsOpen = false
                                onSaveCardLayout(cardLayout.withAllCardsVisible())
                            }
                        )
                        DropdownMenuItem(
                            text = { Text("Auto-size all cards") },
                            enabled = cardsUnlocked,
                            onClick = {
                                actionsOpen = false
                                onSaveCardLayout(cardLayout.withAllCardsAutoHeight(order.id))
                            }
                        )
                        DropdownMenuItem(
                            text = { Text("Reset column widths") },
                            enabled = cardsUnlocked,
                            onClick = {
                                actionsOpen = false
                                onSaveCardLayout(cardLayout.withDefaultColumnWidths())
                            }
                        )
                        DropdownMenuItem(
                            text = { Text("Reset board layout") },
                            enabled = cardsUnlocked,
                            onClick = {
                                actionsOpen = false
                                onSaveCardLayout(cardLayout.withDefaultDesktopBoard(order.id))
                            }
                        )
                    }
                    if (canEditWorkflow) {
                        DropdownMenuItem(
                            text = { Text("Mark design and painting done") },
                            onClick = {
                                actionsOpen = false
                                onUpdateOrderFields(order, mapOf("designStatus" to "Done", "paintingStatus" to "Done"))
                            }
                        )
                        DropdownMenuItem(
                            text = { Text("Cancel project") },
                            onClick = {
                                actionsOpen = false
                                onUpdateOrderFields(order, mapOf("designStatus" to "Cancelled", "paintingStatus" to "Cancelled"))
                            }
                        )
                        DropdownMenuItem(
                            text = { Text("Mark dispatched") },
                            onClick = {
                                actionsOpen = false
                                onUpdateOrderFields(order, mapOf("details" to mapOf("isDispatched" to true, "isDelivered" to false)))
                            }
                        )
                        DropdownMenuItem(
                            text = { Text("Mark delivered") },
                            onClick = {
                                actionsOpen = false
                                onUpdateOrderFields(order, mapOf("details" to mapOf("isDispatched" to true, "isDelivered" to true)))
                            }
                        )
                    }
                    if (canEditFinance) {
                        DropdownMenuItem(
                            text = { Text("Mark full payment received") },
                            onClick = {
                                actionsOpen = false
                                onUpdateOrderFields(order, mapOf("finance" to mapOf("fullPaymentReceived" to true)))
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DesktopColumn(
    widthDp: Int,
    resizable: Boolean,
    isResizing: Boolean,
    onResizeStart: () -> Unit,
    onResizeBy: (Float) -> Unit,
    onResizeEnd: () -> Unit,
    onResizeCancel: () -> Unit,
    content: @Composable ColumnScope.() -> Unit
) {
    Box(
        modifier = Modifier
            .width(widthDp.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(end = if (resizable) 10.dp else 0.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            content = content
        )
        if (resizable) {
            Box(
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .fillMaxHeight()
                    .width(18.dp)
                    .pointerInput(widthDp) {
                        detectHorizontalDragGestures(
                            onDragStart = { onResizeStart() },
                            onHorizontalDrag = { change, dragAmount ->
                                change.consume()
                                onResizeBy(dragAmount)
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
private fun HiddenCardsBar(
    hiddenCards: List<OrderDetailCardId>,
    onShowCard: (OrderDetailCardId) -> Unit
) {
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
    customizationActions: OrderCardCustomizationActions? = null,
    onDropCard: (OrderDetailCardId) -> Unit,
    content: @Composable () -> Unit
) {
    var isDropTarget by remember(cardId) { mutableStateOf(false) }
    val dropTarget = remember(cardId, cardsUnlocked) {
        object : DragAndDropTarget {
            override fun onEntered(event: DragAndDropEvent) {
                if (cardsUnlocked && draggedCardFromEvent(event) != cardId) isDropTarget = true
            }

            override fun onExited(event: DragAndDropEvent) {
                isDropTarget = false
            }

            override fun onEnded(event: DragAndDropEvent) {
                isDropTarget = false
            }

            override fun onDrop(event: DragAndDropEvent): Boolean {
                val dragged = draggedCardFromEvent(event) ?: return false
                isDropTarget = false
                if (!cardsUnlocked || dragged == cardId) return false
                onDropCard(dragged)
                return true
            }
        }
    }
    val dragModifier = if (cardsUnlocked) {
        Modifier.dragAndDropSource { _ -> cardTransferData(cardId) }
    } else {
        Modifier
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
            .then(dragModifier)
    ) {
        CompositionLocalProvider(LocalOrderCardActions provides customizationActions) {
            content()
        }
    }
}

@Composable
private fun ColumnDropZone(
    enabled: Boolean,
    hasCards: Boolean,
    onDropCard: (OrderDetailCardId) -> Unit
) {
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
            }

            override fun onDrop(event: DragAndDropEvent): Boolean {
                val dragged = draggedCardFromEvent(event) ?: return false
                isDropTarget = false
                if (!enabled) return false
                onDropCard(dragged)
                return true
            }
        }
    }
    if (!enabled && hasCards) return
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .height(if (hasCards) 34.dp else 78.dp)
            .dragAndDropTarget(
                shouldStartDragAndDrop = { event -> enabled && acceptsCardDrag(event) },
                target = target
            ),
        shape = RoundedCornerShape(14.dp),
        color = if (isDropTarget) StudioBlue.copy(alpha = 0.10f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
        border = BorderStroke(
            1.dp,
            if (isDropTarget) StudioBlue.copy(alpha = 0.65f) else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)
        )
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                if (isDropTarget) "Drop card here" else if (hasCards) "" else "Empty column",
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
    onDropCard: (OrderDetailCardId) -> Unit
) {
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
            }

            override fun onDrop(event: DragAndDropEvent): Boolean {
                val dragged = draggedCardFromEvent(event) ?: return false
                isDropTarget = false
                if (!enabled) return false
                onDropCard(dragged)
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
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onUploadClientFile: (StudioOrder, ByteArray, String, String) -> Unit,
    onUploadPreviewImage: (StudioOrder, ByteArray, String, String) -> Unit,
    onRefreshLiveTracking: (StudioOrder) -> Unit,
    onRenameClientFile: (StudioOrder, String, String) -> Unit,
    onDeleteClientFile: (StudioOrder, String) -> Unit
) {
    when (cardId) {
        OrderDetailCardId.Preview -> DesktopPreviewCard(
            order = order,
            canEditPreview = canEditWorkflow,
            onUpdateOrderFields = onUpdateOrderFields,
            onUploadPreviewImage = onUploadPreviewImage
        )
        OrderDetailCardId.Summary -> SummaryCard(
            order = order,
            workspaceSettings = workspaceSettings,
            canSeeFinancial = canSeeFinancial
        )
        OrderDetailCardId.Customer -> {
            if (canEditWorkflow) {
                CustomerContactEditCard(
                    order = order,
                    workspaceSettings = workspaceSettings,
                    onUpdateOrderFields = onUpdateOrderFields
                )
            } else {
                CustomerCard(order = order, workspaceSettings = workspaceSettings)
            }
        }
        OrderDetailCardId.Materials -> MaterialsInventoryCard(
            order = order,
            workspaceSettings = workspaceSettings,
            canEditWorkflow = canEditWorkflow,
            onUpdateOrderFields = onUpdateOrderFields
        )
        OrderDetailCardId.Priority -> PriorityRiskCard(
            order = order,
            canEditWorkflow = canEditWorkflow,
            onUpdateOrderFields = onUpdateOrderFields
        )
        OrderDetailCardId.Delivery -> TimelineDeliveryCard(order = order)
        OrderDetailCardId.Notes -> DesktopNotesCard(
            order = order,
            workspaceSettings = workspaceSettings,
            canEditWorkflow = canEditWorkflow,
            onUpdateOrderFields = onUpdateOrderFields
        )
        OrderDetailCardId.ClientFiles -> DesktopClientFilesCard(
            order = order,
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
            onUpdateOrderFields = onUpdateOrderFields
        )
        OrderDetailCardId.Status -> {
            if (canEditWorkflow) {
                WorkflowEditCard(
                    order = order,
                    workspaceSettings = workspaceSettings,
                    statusOptions = statusOptions,
                    onUpdateOrderFields = onUpdateOrderFields
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
        OrderDetailCardId.HistoryLog -> DesktopHistoryLogCard(order = order)
    }
}

@Composable
private fun DesktopPreviewCard(
    order: StudioOrder,
    canEditPreview: Boolean,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onUploadPreviewImage: (StudioOrder, ByteArray, String, String) -> Unit
) {
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

    DetailCard(title = "Preview") {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(210.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
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
                Text(
                    text = when {
                        displayPreviewUrl.isBlank() -> "No preview image provided."
                        imageFailed -> "Preview link is not an image."
                        else -> "Loading preview..."
                    },
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
        if (linkEditing) {
            OutlinedTextField(
                value = linkDraft,
                onValueChange = { linkDraft = it },
                label = { Text("Paste photo link...") },
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
                    Text("Save Link", fontWeight = FontWeight.ExtraBold)
                }
                TextButton(
                    onClick = {
                        linkDraft = previewUrl
                        linkEditing = false
                    },
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Cancel", fontWeight = FontWeight.ExtraBold)
                }
            }
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                TextButton(
                    onClick = { if (displayPreviewUrl.isNotBlank()) uriHandler.openUri(displayPreviewUrl) },
                    enabled = displayPreviewUrl.isNotBlank(),
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Open", fontWeight = FontWeight.ExtraBold)
                }
                TextButton(
                    onClick = { previewImagePicker.launch("image/*") },
                    enabled = canEditPreview,
                    modifier = Modifier.weight(1f)
                ) {
                    Text(if (previewUrl.isBlank()) "Upload Image" else "Replace Image", fontWeight = FontWeight.ExtraBold)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                TextButton(
                    onClick = {
                        if (latestImageFile != null) {
                            onUpdateOrderFields(order, mapOf("details" to mapOf("designLink" to latestImageFile.downloadUrl)))
                        }
                    },
                    enabled = canEditPreview && latestImageFile != null && latestImageFile.downloadUrl != previewUrl,
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Use Latest", fontWeight = FontWeight.ExtraBold)
                }
                TextButton(
                    onClick = {
                        linkDraft = previewUrl
                        linkEditing = true
                    },
                    enabled = canEditPreview,
                    modifier = Modifier.weight(1f)
                ) {
                    Text(if (previewUrl.isBlank()) "Paste Link" else "Edit Link", fontWeight = FontWeight.ExtraBold)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                TextButton(
                    onClick = {
                        onUpdateOrderFields(order, mapOf("details" to mapOf("designLink" to "")))
                    },
                    enabled = canEditPreview && previewUrl.isNotBlank(),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Remove", color = StudioRed, fontWeight = FontWeight.ExtraBold)
                }
            }
        }
    }
}

@Composable
private fun DesktopNotesCard(
    order: StudioOrder,
    workspaceSettings: StudioWorkspaceSettings,
    canEditWorkflow: Boolean,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    val sections = normalizedSpecialNoteSections(workspaceSettings.specialNoteSections)
    DetailCard(title = "Notes") {
        sections.forEachIndexed { index, section ->
            if (index > 0) HorizontalDivider()
            SpecialNoteSectionEditor(
                order = order,
                section = section,
                canEditWorkflow = canEditWorkflow,
                onUpdateOrderFields = onUpdateOrderFields
            )
        }
    }
}

@Composable
private fun SpecialNoteSectionEditor(
    order: StudioOrder,
    section: StudioHeadingItem,
    canEditWorkflow: Boolean,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    val sourceValue = specialNoteValue(order, section)
    var draft by remember(order.id, section.id, sourceValue) { mutableStateOf(sourceValue) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(section.title, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(
            value = draft,
            onValueChange = { draft = it },
            label = { Text(section.title) },
            enabled = canEditWorkflow,
            modifier = Modifier
                .fillMaxWidth()
                .height(118.dp)
        )
        if (canEditWorkflow) {
            Button(
                onClick = {
                    val details = if (section.id.equals(STUDIO_PRIMARY_SPECIAL_NOTE_ID, ignoreCase = true)) {
                        mapOf("notes" to draft)
                    } else {
                        mapOf("specialNotes" to mapOf(section.id to draft))
                    }
                    onUpdateOrderFields(order, mapOf("details" to details))
                },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp)
            ) {
                Text("Save ${section.title}", fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun DesktopClientFilesCard(
    order: StudioOrder,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onUploadClientFile: (StudioOrder, ByteArray, String, String) -> Unit,
    onRenameClientFile: (StudioOrder, String, String) -> Unit,
    onDeleteClientFile: (StudioOrder, String) -> Unit
) {
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    var renameFileId by remember(order.id) { mutableStateOf("") }
    var renameText by remember(order.id) { mutableStateOf("") }
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) {
            val fileName = displayNameForUri(context, uri)
            val contentType = context.contentResolver.getType(uri).orEmpty()
            val bytes = readBytesForUri(context, uri)
            if (bytes != null) onUploadClientFile(order, bytes, fileName, contentType)
        }
    }

    DetailCard(title = "Client Files") {
        Text(
            "PDF, image, PSD and PSB files for this order. Visible to workspace members who can open this order.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            fontWeight = FontWeight.SemiBold
        )
        Button(
            onClick = { filePicker.launch(arrayOf("*/*")) },
            shape = RoundedCornerShape(10.dp)
        ) {
            Text("Upload File", fontWeight = FontWeight.ExtraBold)
        }
        if (order.clientFiles.isEmpty()) {
            DetailListRow("No client files yet.", "Upload PDFs, images, PSD or PSB files that belong to this client order.", MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            order.clientFiles.take(5).forEach { file ->
                DetailListRow(
                    title = file.fileName,
                    subtitle = listOf(fileSizeLabel(file.fileSize), shortDateOrDash(file.uploadedAt)).filter { it.isNotBlank() }.joinToString(" · "),
                    tone = StudioBlue
                )
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                    TextButton(
                        onClick = { if (file.downloadUrl.isNotBlank()) uriHandler.openUri(file.downloadUrl) },
                        enabled = file.downloadUrl.isNotBlank(),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Open", fontWeight = FontWeight.ExtraBold)
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
                        Text("Preview", fontWeight = FontWeight.ExtraBold)
                    }
                    TextButton(
                        onClick = {
                            renameFileId = file.id
                            renameText = file.fileName
                        },
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Rename", fontWeight = FontWeight.ExtraBold)
                    }
                }
                if (renameFileId == file.id) {
                    OutlinedTextField(
                        value = renameText,
                        onValueChange = { renameText = it },
                        label = { Text("File name") },
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
                            Text("Save", fontWeight = FontWeight.ExtraBold)
                        }
                        TextButton(
                            onClick = {
                                onDeleteClientFile(order, file.id)
                                renameFileId = ""
                            },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Delete", color = StudioRed, fontWeight = FontWeight.ExtraBold)
                        }
                    }
                }
            }
            if (order.clientFiles.size > 5) InfoRow("More Files", "+${order.clientFiles.size - 5}")
        }
    }
}

@Composable
private fun DesktopTodoCard(
    order: StudioOrder,
    teamMembers: List<StudioTeamMember>,
    canAssignTasks: Boolean,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    var newTaskTitle by remember(order.id) { mutableStateOf("") }
    var newTaskPriority by remember(order.id) { mutableStateOf("Normal") }
    var newTaskDueDays by remember(order.id) { mutableStateOf("") }
    var newTaskAssigneeId by remember(order.id) { mutableStateOf("") }

    DetailCard(title = "To Do") {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            MetricTile(modifier = Modifier.weight(1f), label = "Open", value = (order.todoCount - order.completedTodoCount).coerceAtLeast(0).toString(), color = StudioBlue)
            MetricTile(modifier = Modifier.weight(1f), label = "Done", value = order.completedTodoCount.toString(), color = StudioGreen)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedTextField(
                value = newTaskTitle,
                onValueChange = { newTaskTitle = it },
                label = { Text("Add a task...") },
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
                        newTaskPriority = "Normal"
                        newTaskDueDays = ""
                        newTaskAssigneeId = ""
                    }
                },
                shape = RoundedCornerShape(10.dp)
            ) {
                Text("+", fontWeight = FontWeight.ExtraBold)
            }
        }
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
        OutlinedTextField(
            value = newTaskDueDays,
            onValueChange = { newTaskDueDays = it.filter { char -> char.isDigit() }.take(3) },
            label = { Text("Due in days") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        if (order.todoItems.isEmpty()) {
            DetailListRow("No tasks here", "", StudioGreen)
        } else {
            order.todoItems.take(5).forEach { item ->
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
                if (canAssignTasks) {
                    TodoAssigneeMenu(
                        label = "Assign",
                        selectedMemberId = taskAssignee(item, teamMembers)?.id.orEmpty(),
                        teamMembers = teamMembers,
                        onSelect = { member ->
                            onUpdateOrderFields(
                                order,
                                mapOf(
                                    "todo" to mapOf(
                                        "action" to "update",
                                        "taskId" to item.id,
                                        "assignedToUid" to member?.id.orEmpty(),
                                        "assignedToEmail" to member?.email.orEmpty()
                                    )
                                )
                            )
                        }
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                    TextButton(
                        onClick = { onUpdateOrderFields(order, mapOf("todo" to mapOf("action" to "toggle", "taskId" to item.id, "isDone" to !item.isDone))) },
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(if (item.isDone) "Reopen" else "Done", fontWeight = FontWeight.ExtraBold)
                    }
                    TextButton(
                        onClick = { onUpdateOrderFields(order, mapOf("todo" to mapOf("action" to "move", "taskId" to item.id, "move" to "up"))) },
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Up", fontWeight = FontWeight.ExtraBold)
                    }
                    TextButton(
                        onClick = { onUpdateOrderFields(order, mapOf("todo" to mapOf("action" to "move", "taskId" to item.id, "move" to "down"))) },
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Down", fontWeight = FontWeight.ExtraBold)
                    }
                    TextButton(
                        onClick = { onUpdateOrderFields(order, mapOf("todo" to mapOf("action" to "move", "taskId" to item.id, "move" to "top"))) },
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Top", fontWeight = FontWeight.ExtraBold)
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                    TextButton(
                        onClick = { onUpdateOrderFields(order, mapOf("todo" to mapOf("action" to "move", "taskId" to item.id, "move" to "bottom"))) },
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Bottom", fontWeight = FontWeight.ExtraBold)
                    }
                    TextButton(
                        onClick = { onUpdateOrderFields(order, mapOf("todo" to mapOf("action" to "delete", "taskId" to item.id))) },
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Delete", color = StudioRed, fontWeight = FontWeight.ExtraBold)
                    }
                }
            }
        }
    }
}

@Composable
private fun DesktopWorkTimeCard(order: StudioOrder, onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit) {
    var workTitle by remember(order.id) { mutableStateOf("Work session") }
    val activeSession = order.workSessions.firstOrNull { it.endedAt == null }

    DetailCard(title = "Work Time") {
        MetricTile(
            modifier = Modifier.fillMaxWidth(),
            label = "Total Work Time",
            value = durationLabel(order.workSessions.sumOf { it.durationSeconds }),
            color = StudioBlue
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedTextField(
                value = workTitle,
                onValueChange = { workTitle = it },
                label = { Text("Work title...") },
                singleLine = true,
                enabled = activeSession == null,
                modifier = Modifier.weight(1f)
            )
            Button(
                onClick = {
                    if (activeSession == null) {
                        onUpdateOrderFields(order, mapOf("workTime" to mapOf("action" to "start", "title" to workTitle.trim().ifBlank { "Work session" })))
                    } else {
                        onUpdateOrderFields(order, mapOf("workTime" to mapOf("action" to "stop", "sessionId" to activeSession.id)))
                    }
                },
                shape = RoundedCornerShape(10.dp)
            ) {
                Text(if (activeSession == null) "Start" else "Stop", fontWeight = FontWeight.ExtraBold)
            }
        }
        if (order.workSessions.isEmpty()) {
            DetailListRow("No work sessions yet.", "", MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            order.workSessions.take(4).forEach { session ->
                DetailListRow(
                    title = session.title.ifBlank { "Work session" },
                    subtitle = listOf(
                        session.startedAt?.let { shortDate(it) }.orEmpty(),
                        if (session.endedAt == null) "Running" else durationLabel(session.durationSeconds),
                        uk.co.eggcraft.studioflow.data.model.emailName(session.createdByEmail)
                    ).filter { it.isNotBlank() }.joinToString(" · "),
                    tone = if (session.endedAt == null) StudioGreen else MaterialTheme.colorScheme.onSurfaceVariant
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    TextButton(
                        onClick = { onUpdateOrderFields(order, mapOf("workTime" to mapOf("action" to "continue", "sessionId" to session.id, "title" to session.title))) },
                        enabled = activeSession == null && session.endedAt != null,
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Continue", fontWeight = FontWeight.ExtraBold)
                    }
                    TextButton(
                        onClick = { onUpdateOrderFields(order, mapOf("workTime" to mapOf("action" to "delete", "sessionId" to session.id))) },
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Delete", color = StudioRed, fontWeight = FontWeight.ExtraBold)
                    }
                }
            }
        }
    }
}

@Composable
private fun DesktopScheduleAlertsCard(
    order: StudioOrder,
    workspaceSettings: StudioWorkspaceSettings,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    val templates = quickReminderTemplates(workspaceSettings)
    val firstTemplate = templates.firstOrNull()
    var title by remember(order.id, firstTemplate?.id) { mutableStateOf(firstTemplate?.title ?: "Follow up customer") }
    var dueDays by remember(order.id, firstTemplate?.id) { mutableStateOf((firstTemplate?.days ?: 1).toString()) }
    var dueHours by remember(order.id, firstTemplate?.id) { mutableStateOf((firstTemplate?.hours ?: 0).toString()) }
    var priority by remember(order.id, firstTemplate?.id) { mutableStateOf(firstTemplate?.priority ?: "Normal") }
    var notify by remember(order.id, firstTemplate?.id) { mutableStateOf(firstTemplate?.notify ?: true) }
    var note by remember(order.id) { mutableStateOf("") }

    DetailCard(title = "Schedule & Alerts") {
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
            label = { Text("Reminder title") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedTextField(
                value = dueDays,
                onValueChange = { dueDays = it.filter { char -> char.isDigit() }.take(3) },
                label = { Text("Days") },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
            OutlinedTextField(
                value = dueHours,
                onValueChange = { dueHours = it.filter { char -> char.isDigit() }.take(2) },
                label = { Text("Hours") },
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
            label = { Text("Optional note") },
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
                    title = "Follow up customer"
                    dueDays = "1"
                    priority = "Normal"
                    notify = true
                    note = ""
                }
            },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(10.dp)
        ) {
            Text("Add Reminder", fontWeight = FontWeight.ExtraBold)
        }
        val reminders = order.scheduleReminders
        if (reminders.isEmpty()) {
            DetailListRow("No reminders yet.", "Add a quick reminder to keep this order moving.", MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            reminders.take(5).forEach { reminder ->
                ScheduleReminderRow(order = order, reminder = reminder, onUpdateOrderFields = onUpdateOrderFields)
            }
            if (reminders.size > 5) InfoRow("More Reminders", "+${reminders.size - 5}")
        }
    }
}

@Composable
private fun ScheduleReminderRow(
    order: StudioOrder,
    reminder: StudioScheduleReminder,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
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
            Text("Done", fontWeight = FontWeight.ExtraBold)
        }
        TextButton(
            onClick = { onUpdateOrderFields(order, mapOf("schedule" to mapOf("action" to "snooze", "reminderId" to reminder.id, "hours" to 24))) },
            enabled = !done,
            modifier = Modifier.weight(1f)
        ) {
            Text("Snooze", fontWeight = FontWeight.ExtraBold)
        }
        TextButton(
            onClick = { onUpdateOrderFields(order, mapOf("schedule" to mapOf("action" to "delete", "reminderId" to reminder.id))) },
            modifier = Modifier.weight(1f)
        ) {
            Text("Delete", color = StudioRed, fontWeight = FontWeight.ExtraBold)
        }
    }
}

@Composable
private fun DesktopHistoryLogCard(order: StudioOrder) {
    DetailCard(title = "History / Log") {
        if (order.historyLog.isEmpty()) {
            DetailListRow("No changes recorded yet", "", MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            order.historyLog.take(8).forEach { item ->
                DetailListRow(
                    title = item.title,
                    subtitle = listOf(item.oldValue, item.newValue, shortDateOrDash(item.createdAt)).filter { it.isNotBlank() }.joinToString(" -> "),
                    tone = StudioBlue
                )
            }
        }
    }
}

@Composable
private fun CustomerContactEditCard(
    order: StudioOrder,
    workspaceSettings: StudioWorkspaceSettings,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    var customerName by remember(order.id, order.customerName) { mutableStateOf(order.displayCustomerName) }
    var designName by remember(order.id, order.designName) { mutableStateOf(order.designName) }
    var watchRef by remember(order.id, order.watchRef) { mutableStateOf(order.watchRef) }
    var designLink by remember(order.id, order.designLink) { mutableStateOf(order.designLink) }
    var email by remember(order.id, order.emailAddress) { mutableStateOf(order.emailAddress) }
    var phone by remember(order.id, order.whatsappNumber) { mutableStateOf(order.whatsappNumber) }
    var instagram by remember(order.id, order.instagramUsername) { mutableStateOf(order.instagramUsername) }
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

    DetailCard(title = "Customer & Contact Controls") {
        OutlinedTextField(
            value = customerName,
            onValueChange = { customerName = it },
            label = { Text("Customer Name") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = designName,
            onValueChange = { designName = it },
            label = { Text("Design Name") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = watchRef,
            onValueChange = { watchRef = it },
            label = { Text("Reference") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = designLink,
            onValueChange = { designLink = it },
            label = { Text("Preview / Design Link") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        if (workspaceSettings.communicationShowEmail || workspaceSettings.communicationShowTelephone) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                if (workspaceSettings.communicationShowEmail) {
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it },
                        label = { Text("Email") },
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                }
                if (workspaceSettings.communicationShowTelephone) {
                    OutlinedTextField(
                        value = phone,
                        onValueChange = { phone = it },
                        label = { Text("Phone") },
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }
        if (workspaceSettings.communicationShowAddress) {
            OutlinedTextField(
                value = address,
                onValueChange = { address = it },
                label = { Text("Address") },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(96.dp)
            )
        }
        if (configuredCustomFields.isNotEmpty()) {
            HorizontalRule()
            configuredCustomFields.forEach { fieldTitle ->
                OutlinedTextField(
                    value = customFieldDrafts[fieldTitle].orEmpty(),
                    onValueChange = { nextValue ->
                        customFieldDrafts = customFieldDrafts.toMutableMap().also { it[fieldTitle] = nextValue }
                    },
                    label = { Text(fieldTitle) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
        if (workspaceSettings.communicationShowChannel) {
            Text("Communication Channels", color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold, fontSize = 12.sp)
            channelLabels.chunked(3).forEach { rowChannels ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    rowChannels.forEach { channel ->
                        ToggleChip(
                            label = channel,
                            active = channels.any { it.equals(channel, ignoreCase = true) },
                            modifier = Modifier.weight(1f)
                        ) {
                            channels = toggleListValue(channels, channel)
                        }
                    }
                    repeat(3 - rowChannels.size) {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
            channelLabels.filter { label -> channels.any { it.equals(label, ignoreCase = true) } }.forEach { channel ->
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
                    onCustom = { value -> channelDrafts = channelDrafts.toMutableMap().also { it[channel] = value } }
                )
            }
        }
        if (workspaceSettings.communicationShowCustomerNotes) {
            OutlinedTextField(
                value = customerNotes,
                onValueChange = { customerNotes = it },
                label = { Text("Customer Notes") },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(96.dp)
            )
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
            Text("Save Customer & Contact", fontWeight = FontWeight.ExtraBold)
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
    when (communicationChannelKind(channel)) {
        CommunicationChannelKind.Email -> OutlinedTextField(
            value = email,
            onValueChange = onEmail,
            label = { Text(channel) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        CommunicationChannelKind.Phone -> OutlinedTextField(
            value = phone,
            onValueChange = onPhone,
            label = { Text(channel) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        CommunicationChannelKind.Instagram -> OutlinedTextField(
            value = instagram,
            onValueChange = onInstagram,
            label = { Text(channel) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        CommunicationChannelKind.Address -> OutlinedTextField(
            value = address,
            onValueChange = onAddress,
            label = { Text(channel) },
            modifier = Modifier
                .fillMaxWidth()
                .height(84.dp)
        )
        CommunicationChannelKind.Custom -> OutlinedTextField(
            value = customValue,
            onValueChange = onCustom,
            label = { Text(channel) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@Composable
private fun WorkflowEditCard(
    order: StudioOrder,
    workspaceSettings: StudioWorkspaceSettings,
    statusOptions: List<String>,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    val statuses = statusOptions.ifEmpty {
        listOf("Not Yet", "In Progress", "Pending", "Ready", "Done", "Cancelled", "Design", "Painting", "Shipped")
    }
    var deliveryTime by remember(order.id, order.deliveryTime) { mutableStateOf(order.deliveryTime.coerceAtLeast(1).toString()) }
    var courier by remember(order.id, order.courier) { mutableStateOf(order.courier) }
    var trackingNumber by remember(order.id, order.trackingNumber) { mutableStateOf(order.trackingNumber) }
    var notes by remember(order.id, order.notes) { mutableStateOf(order.notes) }
    var riskReason by remember(order.id, order.riskReason) { mutableStateOf(order.riskReason.takeUnless { it == "-" }.orEmpty()) }
    var invNotes by remember(order.id, order.invNotes) { mutableStateOf(order.invNotes) }
    var statusNotes by remember(order.id, order.customFields) { mutableStateOf(customFieldValue(order, "status::notesSupplier")) }
    val materialLabels = materialDefaultCheckLabels(workspaceSettings)
    val extraStatusSteps = workspaceSettings.customSteps.drop(2).map { it.trim() }.filter { it.isNotBlank() }
    val statusToggles = workspaceSettings.customToggles.map { it.trim() }.filter { it.isNotBlank() }
    val designLabel = workspaceSettings.customSteps.getOrNull(0)?.ifBlank { "Design" } ?: "Design"
    val productionLabel = workspaceSettings.customSteps.getOrNull(1)?.ifBlank { "Production" } ?: "Production"

    DetailCard(title = "Workflow Controls") {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            Button(
                onClick = {
                    onUpdateOrderFields(
                        order,
                        mapOf("designStatus" to "Done", "paintingStatus" to "Done")
                    )
                },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(10.dp)
            ) {
                Text("Mark Done", fontWeight = FontWeight.ExtraBold)
            }
            TextButton(
                onClick = {
                    onUpdateOrderFields(
                        order,
                        mapOf("designStatus" to "Cancelled", "paintingStatus" to "Cancelled")
                    )
                },
                modifier = Modifier.weight(1f)
            ) {
                Text("Cancel", color = StudioRed, fontWeight = FontWeight.ExtraBold)
            }
        }
        ChoiceRow(
            label = designLabel,
            value = order.designStatus.ifBlank { "Not Yet" },
            options = statuses,
            onSelect = { onUpdateOrderFields(order, mapOf("designStatus" to it)) }
        )
        ChoiceRow(
            label = productionLabel,
            value = order.status.ifBlank { "Not Yet" },
            options = statuses,
            onSelect = { onUpdateOrderFields(order, mapOf("paintingStatus" to it)) }
        )
        extraStatusSteps.forEach { step ->
            ChoiceRow(
                label = step,
                value = statusStepValue(order, step),
                options = statuses,
                onSelect = { onUpdateOrderFields(order, mapOf("details" to mapOf("extraStatuses" to mapOf(step to it)))) }
            )
        }
        if (statusToggles.isNotEmpty()) {
            Text("Production Toggles", color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold, fontSize = 12.sp)
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
                Text("Save Status Notes", fontWeight = FontWeight.ExtraBold)
            }
        }
        HorizontalRule()
        ChoiceRow(
            label = "Priority",
            value = order.priority.ifBlank { "Normal" },
            options = priorityOptions(),
            onSelect = { onUpdateOrderFields(order, mapOf("details" to mapOf("priority" to it))) }
        )
        ChoiceRow(
            label = "Risk",
            value = order.risk.ifBlank { "None" },
            options = riskOptions(),
            onSelect = { onUpdateOrderFields(order, mapOf("details" to mapOf("risk" to it))) }
        )
        OutlinedTextField(
            value = riskReason,
            onValueChange = { riskReason = it },
            label = { Text("Risk Reason") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        TextButton(
            onClick = {
                onUpdateOrderFields(order, mapOf("details" to mapOf("riskReason" to riskReason.trim().ifBlank { "-" })))
            }
        ) {
            Text("Save Risk Reason", fontWeight = FontWeight.ExtraBold)
        }
        Text("Materials & Inventory", color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold, fontSize = 12.sp)
        materialLabels.forEachIndexed { index, label ->
            YesNoChoiceRow(label, materialDefaultToggleValue(order, index, label)) {
                onUpdateOrderFields(order, materialDefaultTogglePayload(index, label, it))
            }
        }
        workspaceSettings.materialsToggles.forEach { label ->
            YesNoChoiceRow(label, order.customToggles["materials::$label"] == true) {
                onUpdateOrderFields(order, mapOf("details" to mapOf("materialsToggles" to mapOf(label to it))))
            }
        }
        if (workspaceSettings.showMaterialsNotesSupplier) {
            OutlinedTextField(
                value = invNotes,
                onValueChange = { invNotes = it },
                label = { Text(workspaceSettings.materialsNotesSupplierLabel.ifBlank { "Notes / Supplier" }) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(92.dp)
            )
            TextButton(
                onClick = { onUpdateOrderFields(order, mapOf("details" to mapOf("invNotes" to invNotes))) }
            ) {
                Text("Save Materials Notes", fontWeight = FontWeight.ExtraBold)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = deliveryTime,
                onValueChange = { input -> deliveryTime = input.filter { it.isDigit() }.take(3) },
                label = { Text("Delivery days") },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
            Button(
                onClick = {
                    val next = deliveryTime.toIntOrNull()?.coerceIn(1, 365) ?: order.deliveryTime.coerceAtLeast(1)
                    deliveryTime = next.toString()
                    onUpdateOrderFields(order, mapOf("details" to mapOf("deliveryTime" to next)))
                },
                shape = RoundedCornerShape(10.dp)
            ) {
                Text("Save")
            }
        }
        OutlinedTextField(
            value = courier,
            onValueChange = { courier = it },
            label = { Text("Courier") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = trackingNumber,
            onValueChange = { trackingNumber = it },
            label = { Text("Tracking Number") },
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
                Text("Save Shipping", fontWeight = FontWeight.ExtraBold)
            }
            TextButton(
                onClick = {
                    onUpdateOrderFields(
                        order,
                        mapOf("details" to mapOf("isDispatched" to true, "isDelivered" to false))
                    )
                },
                modifier = Modifier.weight(1f)
            ) {
                Text("Dispatched", fontWeight = FontWeight.ExtraBold)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            TextButton(
                onClick = { onUpdateOrderFields(order, mapOf("details" to mapOf("isDispatched" to false))) },
                modifier = Modifier.weight(1f)
            ) {
                Text("Not Dispatched", fontWeight = FontWeight.ExtraBold)
            }
            TextButton(
                onClick = {
                    onUpdateOrderFields(
                        order,
                        mapOf("details" to mapOf("isDelivered" to !order.isDelivered, "isDispatched" to true))
                    )
                },
                modifier = Modifier.weight(1f)
            ) {
                Text(if (order.isDelivered) "Mark Undelivered" else "Delivered", fontWeight = FontWeight.ExtraBold)
            }
        }
        OutlinedTextField(
            value = notes,
            onValueChange = { notes = it },
            label = { Text("Notes") },
            modifier = Modifier
                .fillMaxWidth()
                .height(120.dp)
        )
        Button(
            onClick = { onUpdateOrderFields(order, mapOf("details" to mapOf("notes" to notes))) },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(10.dp)
        ) {
            Text("Save Notes", fontWeight = FontWeight.ExtraBold)
        }
    }
}

@Composable
private fun ChoiceRow(label: String, value: String, options: List<String>, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = label,
            modifier = Modifier.weight(0.42f),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
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
    canSeeFinancial: Boolean
) {
    val step1 = summaryStepLabel(workspaceSettings.summaryStep1, workspaceSettings, 0)
    val step2 = summaryStepLabel(workspaceSettings.summaryStep2, workspaceSettings, 1)
    val value1 = summaryStepValue(order, workspaceSettings, step1)
    val value2 = summaryStepValue(order, workspaceSettings, step2)
    DetailCard(title = "Order Summary") {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MetricTile(
                modifier = Modifier.weight(1f),
                label = if (canSeeFinancial) "Order Value" else "Customer",
                value = if (canSeeFinancial) money(order.orderValue) else order.displayCustomerName,
                color = if (canSeeFinancial) StudioGreen else MaterialTheme.colorScheme.onSurface
            )
            MetricTile(modifier = Modifier.weight(1f), label = step1, value = value1, color = statusColor(value1))
        }
        Spacer(modifier = Modifier.height(10.dp))
        InfoRow(step2, value2, statusColor(value2))
        InfoRow("Placed On", shortDate(order.paymentDate))
        InfoRow("Delivery In", deliveryLabel(order), deliveryColor(order))
        if (order.watchRef.isNotBlank()) InfoRow("Watch Ref", order.watchRef)
    }
}

@Composable
private fun CustomerCard(order: StudioOrder, workspaceSettings: StudioWorkspaceSettings) {
    val channelLabels = communicationChannelLabels(workspaceSettings)
    DetailCard(title = "Customer & Communication") {
        InfoRow("Customer Name", order.displayCustomerName)
        InfoRow("Design Name", order.designName.ifBlank { "-" })
        InfoRow("Design Link", order.designLink.ifBlank { "-" })
        if (workspaceSettings.communicationShowEmail) InfoRow("Email", order.emailAddress.ifBlank { "-" })
        if (workspaceSettings.communicationShowTelephone) InfoRow("Telephone", order.whatsappNumber.ifBlank { "-" })
        if (workspaceSettings.communicationShowAddress) InfoRow("Address", customFieldValue(order, "communicationAddress").ifBlank { "-" })
        if (workspaceSettings.communicationShowChannel) {
            InfoRow("Channel", order.communication.joinToString(" · ").ifBlank { "-" })
            channelLabels.filter { label -> order.communication.any { it.equals(label, ignoreCase = true) } }.forEach { channel ->
                InfoRow(channel, communicationChannelDisplayValue(order, channel).ifBlank { "-" })
            }
        }
        if (workspaceSettings.communicationShowCustomerNotes) {
            InfoRow("Customer Notes", customFieldValue(order, "communicationCustomerNotes").ifBlank { "-" })
        }
        orderedCustomFieldsForDisplay(order.customFields, workspaceSettings.customFields).forEach { (key, value) ->
            InfoRow(key, value.ifBlank { "-" })
        }
    }
}

@Composable
private fun TimelineDeliveryCard(order: StudioOrder) {
    val context = LocalContext.current
    DetailCard(title = "Timeline & Delivery") {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MetricTile(modifier = Modifier.weight(1f), label = "Placed", value = shortDate(order.paymentDate), color = MaterialTheme.colorScheme.onSurface)
            MetricTile(modifier = Modifier.weight(1f), label = "Due", value = shortDate(dueDate(order)), color = deliveryColor(order))
        }
        Spacer(modifier = Modifier.height(10.dp))
        Button(
            onClick = { openDeliveryCalendarEvent(context, order) },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(10.dp)
        ) {
            Text("Add to Calendar", fontWeight = FontWeight.ExtraBold)
        }
        Text(
            "Creates an Android Calendar event from the created date to the delivery due date.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 12.sp,
            lineHeight = 16.sp
        )
        InfoRow("Delivery Time", "${order.deliveryTime.coerceAtLeast(1)} days")
        InfoRow("Delivery In", deliveryLabel(order), deliveryColor(order))
        InfoRow("Priority", order.priority.ifBlank { "Normal" }, priorityColor(order.priority))
        InfoRow("Dispatched", yesNo(order.isDispatched))
    }
}

@Composable
private fun PriorityRiskCard(
    order: StudioOrder,
    canEditWorkflow: Boolean,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    var riskReason by remember(order.id, order.riskReason) {
        mutableStateOf(order.riskReason.takeUnless { it == "-" }.orEmpty())
    }
    DetailCard(title = "Priority / Risk") {
        if (canEditWorkflow) {
            ChoiceRow(
                label = "Priority",
                value = order.priority.ifBlank { "Normal" },
                options = priorityOptions(),
                onSelect = { onUpdateOrderFields(order, mapOf("details" to mapOf("priority" to it))) }
            )
            ChoiceRow(
                label = "Risk",
                value = order.risk.ifBlank { "None" },
                options = riskOptions(),
                onSelect = { onUpdateOrderFields(order, mapOf("details" to mapOf("risk" to it))) }
            )
            if (order.risk.ifBlank { "None" } != "None") {
                OutlinedTextField(
                    value = riskReason,
                    onValueChange = { riskReason = it },
                    label = { Text("Reason / blocker note") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(92.dp)
                )
                TextButton(
                    onClick = {
                        onUpdateOrderFields(order, mapOf("details" to mapOf("riskReason" to riskReason.trim().ifBlank { "-" })))
                    }
                ) {
                    Text("Save Risk Reason", fontWeight = FontWeight.ExtraBold)
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
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    var invNotes by remember(order.id, order.invNotes) { mutableStateOf(order.invNotes) }
    val materialLabels = materialDefaultCheckLabels(workspaceSettings)
    val notesLabel = workspaceSettings.materialsNotesSupplierLabel.ifBlank { "Notes / Supplier" }

    DetailCard(title = "Materials & Inventory") {
        materialLabels.forEachIndexed { index, label ->
            val checked = materialDefaultToggleValue(order, index, label)
            if (canEditWorkflow) {
                YesNoChoiceRow(label, checked) {
                    onUpdateOrderFields(order, materialDefaultTogglePayload(index, label, it))
                }
            } else {
                BooleanRow(label, checked)
            }
        }
        if (workspaceSettings.materialsToggles.isNotEmpty()) {
            HorizontalRule()
            workspaceSettings.materialsToggles.forEach { label ->
                val checked = order.customToggles["materials::$label"] == true
                if (canEditWorkflow) {
                    YesNoChoiceRow(label, checked) {
                        onUpdateOrderFields(order, mapOf("details" to mapOf("materialsToggles" to mapOf(label to it))))
                    }
                } else {
                    BooleanRow(label, checked)
                }
            }
        }
        if (workspaceSettings.showMaterialsNotesSupplier) {
            HorizontalRule()
            if (canEditWorkflow) {
                OutlinedTextField(
                    value = invNotes,
                    onValueChange = { invNotes = it },
                    label = { Text(notesLabel) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(92.dp)
                )
                TextButton(
                    onClick = { onUpdateOrderFields(order, mapOf("details" to mapOf("invNotes" to invNotes))) }
                ) {
                    Text("Save $notesLabel", fontWeight = FontWeight.ExtraBold)
                }
            } else {
                InfoRow(notesLabel, order.invNotes.ifBlank { "-" })
            }
        }
    }
}

@Composable
private fun PriorityMaterialsCard(order: StudioOrder) {
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
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit
) {
    var paidAmount by remember(order.id, order.paidAmount) { mutableStateOf(decimalText(order.paidAmount)) }
    var remainingAmount by remember(order.id, order.remainingAmount) { mutableStateOf(decimalText(order.remainingAmount)) }
    var baseCost by remember(order.id, order.watchPurchasePrice) { mutableStateOf(decimalText(order.watchPurchasePrice)) }
    var platformFee by remember(order.id, order.paymentFee) { mutableStateOf(decimalText(order.paymentFee)) }
    var deliveryCost by remember(order.id, order.deliveryCost) { mutableStateOf(decimalText(order.deliveryCost)) }
    var taxRate by remember(order.id, order.taxRate) { mutableStateOf(decimalText(order.taxRate)) }
    var paymentMethod by remember(order.id, order.paymentMethod) { mutableStateOf(order.paymentMethod.ifBlank { "Card" }) }
    val revenueTaxLabel = workspaceSettings.taxRuleNameRevenue.ifBlank { "Revenue" }
    val profitTaxLabel = workspaceSettings.taxRuleNameProfit.ifBlank { "Profit" }
    var taxType by remember(order.id, order.taxType, revenueTaxLabel, profitTaxLabel) {
        mutableStateOf(if (order.taxType == "Profit") profitTaxLabel else revenueTaxLabel)
    }
    val remainingItems = remember(workspaceSettings.financialRemainingItems) {
        normalizedFinancialItems(workspaceSettings.financialRemainingItems, "Pending")
    }
    val expenseItems = remember(workspaceSettings.financialExpenseItems) {
        normalizedFinancialItems(workspaceSettings.financialExpenseItems, "Cost")
    }
    var customRemainingInputs by remember(order.id, order.customFields, remainingItems) {
        mutableStateOf(remainingItems.associate { it.title to decimalText(financialCustomValue(order, "financialRemaining::", it.title)) })
    }
    var customExpenseInputs by remember(order.id, order.customFields, expenseItems) {
        mutableStateOf(expenseItems.associate { it.title to decimalText(financialCustomValue(order, "financialExpense::", it.title)) })
    }
    val finalProfit = financialFinalProfit(order, workspaceSettings)
    val outstandingPayment = order.remainingAmount + remainingItems.sumOf { financialCustomValue(order, "financialRemaining::", it.title) }

    DetailCard(title = "Financial Info") {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MetricTile(modifier = Modifier.weight(1f), label = "Paid", value = money(order.paidAmount), color = StudioGreen)
            MetricTile(modifier = Modifier.weight(1f), label = "Remaining", value = money(outstandingPayment), color = StudioWarningOrange)
        }
        Spacer(modifier = Modifier.height(10.dp))
        if (remainingItems.isNotEmpty()) {
            remainingItems.forEach { item ->
                InfoRow(item.title, money(financialCustomValue(order, "financialRemaining::", item.title)), StudioWarningOrange)
            }
        }
        InfoRow("Payment Method", order.paymentMethod.ifBlank { "Card" })
        if (workspaceSettings.financialShowBaseCost || !advancedEnabled) {
            InfoRow(workspaceSettings.financialBaseCostLabel.ifBlank { "Cost (Base)" }, money(order.watchPurchasePrice), StudioRed)
        }
        expenseItems.forEach { item ->
            InfoRow(item.title, money(financialCustomValue(order, "financialExpense::", item.title)), StudioRed)
        }
        InfoRow("Platform Fee", money(order.paymentFee), StudioRed)
        InfoRow("Delivery Cost", money(order.deliveryCost), StudioRed)
        InfoRow("Tax", "${money(order.taxAmount)} (${order.taxType.ifBlank { "Tax" }})", StudioRed)
        InfoRow("Final Profit", money(finalProfit), if (finalProfit >= 0) StudioGreen else StudioRed)
        if (canEditFinance) {
            HorizontalRule()
            Text("Finance Controls", color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold, fontSize = 12.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                MoneyField("Paid", paidAmount, { paidAmount = cleanDecimalInput(it) }, Modifier.weight(1f))
                MoneyField("Remaining", remainingAmount, { remainingAmount = cleanDecimalInput(it) }, Modifier.weight(1f))
            }
            if (advancedEnabled && remainingItems.isNotEmpty()) {
                remainingItems.forEach { item ->
                    MoneyField(
                        item.title,
                        customRemainingInputs[item.title].orEmpty(),
                        { value ->
                            customRemainingInputs = customRemainingInputs.toMutableMap().also { map ->
                                map[item.title] = cleanDecimalInput(value)
                            }
                        },
                        Modifier.fillMaxWidth()
                    )
                }
            }
            if (workspaceSettings.financialShowBaseCost || !advancedEnabled) {
                MoneyField(
                    workspaceSettings.financialBaseCostLabel.ifBlank { "Cost (Base)" },
                    baseCost,
                    { baseCost = cleanDecimalInput(it) },
                    Modifier.fillMaxWidth()
                )
            }
            if (advancedEnabled) {
                expenseItems.forEach { item ->
                    MoneyField(
                        item.title,
                        customExpenseInputs[item.title].orEmpty(),
                        { value ->
                            customExpenseInputs = customExpenseInputs.toMutableMap().also { map ->
                                map[item.title] = cleanDecimalInput(value)
                            }
                        },
                        Modifier.fillMaxWidth()
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    MoneyField("Platform Fee", platformFee, { platformFee = cleanDecimalInput(it) }, Modifier.weight(1f))
                    MoneyField("Shipping Cost", deliveryCost, { deliveryCost = cleanDecimalInput(it) }, Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    MoneyField("Tax Rate %", taxRate, { taxRate = cleanDecimalInput(it) }, Modifier.weight(1f))
                    OutlinedTextField(
                        value = paymentMethod,
                        onValueChange = { paymentMethod = it },
                        label = { Text("Payment Method") },
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                }
                ChoiceRow(
                    label = "Tax Rule",
                    value = taxType,
                    options = listOf(revenueTaxLabel, profitTaxLabel),
                    onSelect = { taxType = it }
                )
            } else {
                Text(
                    "Free/Demo keeps advanced finance locked; Paid and Base Cost remain editable.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 12.sp
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                Button(
                    onClick = {
                        val finance = mutableMapOf<String, Any?>(
                            "paidAmount" to parseDecimal(paidAmount, order.paidAmount),
                            "remainingAmount" to parseDecimal(remainingAmount, order.remainingAmount),
                            "watchPurchasePrice" to parseDecimal(baseCost, order.watchPurchasePrice)
                        )
                        if (advancedEnabled) {
                            finance["paymentFee"] = parseDecimal(platformFee, order.paymentFee)
                            finance["deliveryCost"] = parseDecimal(deliveryCost, order.deliveryCost)
                            finance["taxRate"] = parseDecimal(taxRate, order.taxRate)
                            finance["taxType"] = if (taxType == profitTaxLabel) "Profit" else "Revenue"
                            finance["paymentMethod"] = paymentMethod.trim().ifBlank { "Card" }
                            finance["financialRemainingValues"] = remainingItems.associate { item ->
                                item.title to parseDecimal(customRemainingInputs[item.title].orEmpty(), financialCustomValue(order, "financialRemaining::", item.title))
                            }
                            finance["financialExpenseValues"] = expenseItems.associate { item ->
                                item.title to parseDecimal(customExpenseInputs[item.title].orEmpty(), financialCustomValue(order, "financialExpense::", item.title))
                            }
                        }
                        onUpdateOrderFields(order, mapOf("finance" to finance))
                    },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text("Save Finance", fontWeight = FontWeight.ExtraBold)
                }
                TextButton(
                    onClick = {
                        onUpdateOrderFields(
                            order,
                            mapOf(
                                "finance" to mapOf(
                                    "fullPaymentReceived" to true,
                                    "financialRemainingValues" to remainingItems.associate { it.title to 0.0 }
                                )
                            )
                        )
                    },
                    enabled = advancedEnabled,
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Full Payment", fontWeight = FontWeight.ExtraBold)
                }
            }
        }
    }
}

@Composable
private fun ProductionStatusCard(order: StudioOrder, workspaceSettings: StudioWorkspaceSettings) {
    val extraStatusSteps = workspaceSettings.customSteps.drop(2).map { it.trim() }.filter { it.isNotBlank() }
    val statusToggles = workspaceSettings.customToggles.map { it.trim() }.filter { it.isNotBlank() }
    DetailCard(title = "Production Status") {
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
    val uriHandler = LocalUriHandler.current
    var courier by remember(order.id, order.courier) { mutableStateOf(order.courier.ifBlank { "Auto Detect" }) }
    var trackingNumber by remember(order.id, order.trackingNumber) { mutableStateOf(order.trackingNumber) }
    val savedTrackingNumber = order.trackingNumber.trim()

    DetailCard(title = "Shipping & Tracking") {
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
                label = { Text("Tracking No.") },
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
                    Text("Save Shipping", fontWeight = FontWeight.ExtraBold)
                }
                TextButton(
                    onClick = { onRefreshLiveTracking(order) },
                    enabled = savedTrackingNumber.isNotBlank(),
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Refresh Live Status", fontWeight = FontWeight.ExtraBold)
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
                    Text("Open Tracking", fontWeight = FontWeight.ExtraBold)
                }
                TextButton(
                    onClick = { onRefreshLiveTracking(order) },
                    enabled = canEditWorkflow,
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Check Again", fontWeight = FontWeight.ExtraBold)
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
            TrackingInfoRow("Carrier", carrier.ifBlank { order.courier.ifBlank { "-" } })
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
    DetailCard(title = "Notes") {
        Text(
            text = order.notes.ifBlank { "No special notes provided." },
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
    fun allowed(key: String): Boolean = access?.allows(key) != false && workspaceSettings.showsCard(key)
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
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
    val activeSession = order.workSessions.firstOrNull { it.endedAt == null }
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
            Text("Client Files", fontWeight = FontWeight.ExtraBold)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                Button(
                    onClick = { filePicker.launch(arrayOf("*/*")) },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text("Upload File", fontWeight = FontWeight.ExtraBold)
                }
                TextButton(
                    onClick = {
                        val firstFile = order.clientFiles.firstOrNull { it.downloadUrl.isNotBlank() }
                        if (firstFile != null) uriHandler.openUri(firstFile.downloadUrl)
                    },
                    enabled = order.clientFiles.any { it.downloadUrl.isNotBlank() },
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Open Latest", fontWeight = FontWeight.ExtraBold)
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
                            onClick = { if (file.downloadUrl.isNotBlank()) uriHandler.openUri(file.downloadUrl) },
                            enabled = file.downloadUrl.isNotBlank(),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Open", fontWeight = FontWeight.ExtraBold)
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
                            Text("Use Preview", fontWeight = FontWeight.ExtraBold)
                        }
                        TextButton(
                            onClick = {
                                renameFileId = file.id
                                renameText = file.fileName
                            },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Rename", fontWeight = FontWeight.ExtraBold)
                        }
                    }
                    if (renameFileId == file.id) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                            OutlinedTextField(
                                value = renameText,
                                onValueChange = { renameText = it },
                                label = { Text("File name") },
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
                                Text("Save")
                            }
                            TextButton(
                                onClick = {
                                    onDeleteClientFile(order, file.id)
                                    renameFileId = ""
                                }
                            ) {
                                Text("Delete", color = StudioRed, fontWeight = FontWeight.ExtraBold)
                            }
                        }
                    }
                }
                if (order.clientFiles.size > 3) InfoRow("More Files", "+${order.clientFiles.size - 3}")
            }
        }
        if (allowed("cardTodo")) {
            HorizontalRule()
            Text("To Do", fontWeight = FontWeight.ExtraBold)
            InfoRow("Progress", "${order.completedTodoCount}/${order.todoCount} completed")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedTextField(
                    value = newTaskTitle,
                    onValueChange = { newTaskTitle = it },
                    label = { Text("New task") },
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
                label = { Text("Task note") },
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
                    label = { Text("Due in days") },
                    singleLine = true,
                    modifier = Modifier.weight(1f)
                )
                TextButton(onClick = { newTaskDueDays = "" }, modifier = Modifier.weight(0.55f)) {
                    Text("No Due", fontWeight = FontWeight.ExtraBold)
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
                        Text("Edit", fontWeight = FontWeight.ExtraBold)
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
                        Text("Down", fontWeight = FontWeight.ExtraBold)
                    }
                }
                if (editingTaskId == item.id) {
                    OutlinedTextField(
                        value = editingTaskTitle,
                        onValueChange = { editingTaskTitle = it },
                        label = { Text("Task title") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = editingTaskNote,
                        onValueChange = { editingTaskNote = it },
                        label = { Text("Task note") },
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
                            label = { Text("Due in days") },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        TextButton(onClick = { editingTaskDueDays = "" }, modifier = Modifier.weight(0.55f)) {
                            Text("Clear", fontWeight = FontWeight.ExtraBold)
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
                            Text("Save Task", fontWeight = FontWeight.ExtraBold)
                        }
                        TextButton(
                            onClick = {
                                onUpdateOrderFields(order, mapOf("todo" to mapOf("action" to "delete", "taskId" to item.id)))
                                editingTaskId = ""
                            },
                            modifier = Modifier.weight(0.85f)
                        ) {
                            Text("Delete", color = StudioRed, fontWeight = FontWeight.ExtraBold)
                        }
                    }
                }
            }
            if (order.todoItems.size > 4) InfoRow("More Tasks", "+${order.todoItems.size - 4}")
        }
        if (allowed("cardWorkTime")) {
            HorizontalRule()
            Text("Work Time", fontWeight = FontWeight.ExtraBold)
            InfoRow("Sessions", "${order.workSessionCount}")
            InfoRow("Total", durationLabel(order.workSessions.sumOf { it.durationSeconds }))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedTextField(
                    value = workTitle,
                    onValueChange = { workTitle = it },
                    label = { Text("Timer title") },
                    singleLine = true,
                    enabled = activeSession == null,
                    modifier = Modifier.weight(1f)
                )
                Button(
                    onClick = {
                        if (activeSession == null) {
                            onUpdateOrderFields(
                                order,
                                mapOf("workTime" to mapOf("action" to "start", "title" to workTitle.trim().ifBlank { "Work session" }))
                            )
                        } else {
                            onUpdateOrderFields(
                                order,
                                mapOf("workTime" to mapOf("action" to "stop", "sessionId" to activeSession.id))
                            )
                        }
                    },
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text(if (activeSession == null) "Start" else "Stop", fontWeight = FontWeight.ExtraBold)
                }
            }
            order.workSessions.take(3).forEach { session ->
                DetailListRow(
                    title = session.title.ifBlank { "Work session" },
                    subtitle = listOf(
                        session.startedAt?.let { shortDate(it) }.orEmpty(),
                        if (session.endedAt == null) "Running" else durationLabel(session.durationSeconds),
                        uk.co.eggcraft.studioflow.data.model.emailName(session.createdByEmail)
                    ).filter { it.isNotBlank() }.joinToString(" · "),
                    tone = if (session.endedAt == null) StudioGreen else MaterialTheme.colorScheme.onSurfaceVariant
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    TextButton(
                        onClick = {
                            onUpdateOrderFields(
                                order,
                                mapOf("workTime" to mapOf("action" to "continue", "sessionId" to session.id, "title" to session.title))
                            )
                        },
                        enabled = activeSession == null && session.endedAt != null,
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Continue", fontWeight = FontWeight.ExtraBold)
                    }
                    TextButton(
                        onClick = {
                            onUpdateOrderFields(order, mapOf("workTime" to mapOf("action" to "delete", "sessionId" to session.id)))
                        },
                        modifier = Modifier.weight(0.85f)
                    ) {
                        Text("Delete", color = StudioRed, fontWeight = FontWeight.ExtraBold)
                    }
                }
            }
        }
        if (allowed("cardHistoryLog")) {
            HorizontalRule()
            Text("History / Log", fontWeight = FontWeight.ExtraBold)
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

@Composable
private fun DetailCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    val cardsUnlocked = LocalDetailCardsUnlocked.current
    val cardActions = LocalOrderCardActions.current
    val useUnifiedBoardScroll = LocalUnifiedBoardVerticalScroll.current
    val headerCardId = cardActions?.cardId ?: orderDetailCardIdForTitle(title)
    val cardColorName = cardActions?.layout?.cardColors?.get(cardActions.cardId).orEmpty()
    val cardTint = studioCardThemeColor(cardColorName)
    val headerAccent = cardTint ?: orderDetailCardAccent(headerCardId)
    val savedHeight = cardActions?.layout?.savedHeightFor(cardActions.cardId, cardActions.orderId)
    val density = LocalDensity.current
    val contentScrollState = rememberScrollState()
    var dragBaseHeight by remember(title, cardActions?.orderId) { mutableStateOf<Int?>(null) }
    var dragHeightDelta by remember(title, cardActions?.orderId) { mutableStateOf(0f) }
    var dragBaseWidth by remember(title, cardActions?.orderId) { mutableStateOf<Int?>(null) }
    var dragWidthDelta by remember(title, cardActions?.orderId) { mutableStateOf(0f) }
    val displayedHeight = dragBaseHeight?.let { baseHeight ->
        (baseHeight + dragHeightDelta).coerceIn(160f, 900f).toInt()
    } ?: savedHeight
    var menuOpen by remember(title) { mutableStateOf(false) }
    var collapsed by remember(title) { mutableStateOf(false) }
    val cardHeightModifier = when {
        collapsed -> Modifier
        displayedHeight != null && useUnifiedBoardScroll -> Modifier.heightIn(min = displayedHeight.dp)
        displayedHeight != null -> Modifier.height(displayedHeight.dp)
        else -> Modifier
    }
    Surface(
        modifier = cardHeightModifier,
        shape = RoundedCornerShape(14.dp),
        color = cardTint?.copy(alpha = 0.13f) ?: MaterialTheme.colorScheme.surface,
        tonalElevation = if (cardTint == null) 1.dp else 0.dp,
        border = BorderStroke(1.dp, cardTint?.copy(alpha = 0.42f) ?: Color.Transparent)
    ) {
        Column(
            modifier = Modifier.padding(15.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(
                    imageVector = Icons.Filled.DragHandle,
                    contentDescription = "Drag card",
                    modifier = Modifier.size(17.dp),
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
                Box {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = Color.Transparent,
                        onClick = { if (cardsUnlocked) menuOpen = true }
                    ) {
                        Icon(
                            imageVector = Icons.Filled.MoreHoriz,
                            contentDescription = "Card actions",
                            modifier = Modifier
                                .padding(5.dp)
                                .size(18.dp),
                            tint = if (cardsUnlocked) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.outlineVariant
                        )
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(
                            text = { Text(if (collapsed) "Expand card" else "Collapse card") },
                            onClick = {
                                collapsed = !collapsed
                                menuOpen = false
                            }
                        )
                        if (cardsUnlocked && cardActions != null) {
                            DropdownMenuItem(
                                text = { Text("Hide block") },
                                onClick = {
                                    cardActions.onSaveLayout(cardActions.layout.withCardVisibility(cardActions.cardId, false))
                                    menuOpen = false
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Move to previous column") },
                                enabled = cardActions.columnIndex > 0,
                                onClick = {
                                    cardActions.onSaveLayout(
                                        cardActions.layout.moveDesktopCardToColumnEnd(cardActions.cardId, cardActions.columnIndex - 1)
                                    )
                                    menuOpen = false
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Move to next column") },
                                enabled = cardActions.columnIndex < cardActions.columnCount - 1,
                                onClick = {
                                    cardActions.onSaveLayout(
                                        cardActions.layout.moveDesktopCardToColumnEnd(cardActions.cardId, cardActions.columnIndex + 1)
                                    )
                                    menuOpen = false
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Narrow column") },
                                onClick = {
                                    cardActions.onSaveLayout(cardActions.layout.adjustColumnWidth(cardActions.columnIndex, -40))
                                    menuOpen = false
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Widen column") },
                                onClick = {
                                    cardActions.onSaveLayout(cardActions.layout.adjustColumnWidth(cardActions.columnIndex, 40))
                                    menuOpen = false
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Reset column width") },
                                onClick = {
                                    cardActions.onSaveLayout(cardActions.layout.withDefaultColumnWidth(cardActions.columnIndex))
                                    menuOpen = false
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Shorter card") },
                                onClick = {
                                    cardActions.onSaveLayout(
                                        cardActions.layout.adjustCardHeight(cardActions.cardId, cardActions.orderId, -40)
                                    )
                                    menuOpen = false
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Taller card") },
                                onClick = {
                                    cardActions.onSaveLayout(
                                        cardActions.layout.adjustCardHeight(cardActions.cardId, cardActions.orderId, 40)
                                    )
                                    menuOpen = false
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Auto height") },
                                onClick = {
                                    cardActions.onSaveLayout(
                                        cardActions.layout.withCardAutoHeight(cardActions.cardId, cardActions.orderId)
                                    )
                                    menuOpen = false
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Reset card and column size") },
                                onClick = {
                                    cardActions.onSaveLayout(
                                        cardActions.layout
                                            .withCardAutoHeight(cardActions.cardId, cardActions.orderId)
                                            .withDefaultColumnWidth(cardActions.columnIndex)
                                    )
                                    menuOpen = false
                                }
                            )
                            val selectedColorName = cardActions.layout.cardColors[cardActions.cardId] ?: "Default"
                            DropdownMenuItem(
                                text = { Text("Color: Default") },
                                leadingIcon = { CardColorSwatch("Default", selectedColorName == "Default") },
                                onClick = {
                                    cardActions.onSaveLayout(cardActions.layout.withCardColor(cardActions.cardId, "Default"))
                                    menuOpen = false
                                }
                            )
                            listOf("Red", "Orange", "Yellow", "Green", "Blue", "Purple", "Pink").forEach { colorName ->
                                DropdownMenuItem(
                                    text = { Text("Color: $colorName") },
                                    leadingIcon = { CardColorSwatch(colorName, selectedColorName == colorName) },
                                    onClick = {
                                        cardActions.onSaveLayout(cardActions.layout.withCardColor(cardActions.cardId, colorName))
                                        menuOpen = false
                                    }
                                )
                            }
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
                if (displayedHeight != null && !useUnifiedBoardScroll) {
                    Column(
                        modifier = Modifier
                            .weight(1f, fill = true)
                            .fillMaxWidth()
                            .verticalScroll(contentScrollState),
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
                val resizeActions = if (cardsUnlocked) cardActions else null
                val canResizeCard = resizeActions != null
                val resizeModifier = if (resizeActions != null) {
                    Modifier.pointerInput(resizeActions.cardId, resizeActions.orderId, displayedHeight) {
                        detectVerticalDragGestures(
                            onDragStart = {
                                dragBaseHeight = displayedHeight ?: defaultCardHeight(resizeActions.cardId)
                                dragHeightDelta = 0f
                            },
                            onVerticalDrag = { change, dragAmount ->
                                change.consume()
                                dragHeightDelta += with(density) { dragAmount.toDp().value }
                            },
                            onDragEnd = {
                                val baseHeight = dragBaseHeight ?: displayedHeight ?: defaultCardHeight(resizeActions.cardId)
                                val finalHeight = (baseHeight + dragHeightDelta).coerceIn(160f, 900f).toInt()
                                resizeActions.onSaveLayout(
                                    resizeActions.layout.withCardHeight(resizeActions.cardId, resizeActions.orderId, finalHeight)
                                )
                                dragBaseHeight = null
                                dragHeightDelta = 0f
                            },
                            onDragCancel = {
                                dragBaseHeight = null
                                dragHeightDelta = 0f
                            }
                        )
                    }
                } else {
                    Modifier
                }
                val cornerResizeModifier = if (resizeActions != null) {
                    Modifier.pointerInput(resizeActions.cardId, resizeActions.orderId, displayedHeight, resizeActions.columnWidth) {
                        detectDragGestures(
                            onDragStart = {
                                dragBaseHeight = displayedHeight ?: defaultCardHeight(resizeActions.cardId)
                                dragHeightDelta = 0f
                                dragBaseWidth = resizeActions.columnWidth
                                dragWidthDelta = 0f
                                resizeActions.onColumnResizeStart()
                            },
                            onDrag = { change, dragAmount ->
                                change.consume()
                                dragHeightDelta += with(density) { dragAmount.y.toDp().value }
                                dragWidthDelta += with(density) { dragAmount.x.toDp().value }
                                resizeActions.onColumnResizeBy(dragAmount.x)
                            },
                            onDragEnd = {
                                val baseHeight = dragBaseHeight ?: displayedHeight ?: defaultCardHeight(resizeActions.cardId)
                                val finalHeight = (baseHeight + dragHeightDelta).coerceIn(160f, 900f).toInt()
                                val baseWidth = dragBaseWidth ?: resizeActions.columnWidth
                                val finalWidth = (baseWidth + dragWidthDelta).coerceIn(260f, 800f).roundToInt()
                                resizeActions.onSaveLayout(
                                    resizeActions.layout
                                        .withCardHeight(resizeActions.cardId, resizeActions.orderId, finalHeight)
                                        .withColumnWidth(resizeActions.columnIndex, finalWidth)
                                )
                                resizeActions.onColumnResizeFinish()
                                dragBaseHeight = null
                                dragHeightDelta = 0f
                                dragBaseWidth = null
                                dragWidthDelta = 0f
                            },
                            onDragCancel = {
                                resizeActions.onColumnResizeFinish()
                                dragBaseHeight = null
                                dragHeightDelta = 0f
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
                        .height(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Box(
                        modifier = Modifier
                            .width(86.dp)
                            .fillMaxHeight()
                            .then(resizeModifier),
                        contentAlignment = Alignment.Center
                    ) {
                        Surface(
                            modifier = Modifier
                                .width(42.dp)
                                .height(3.dp),
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
                            canResizeCard -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.75f)
                            else -> Color.Transparent
                        }
                    ) {
                        Icon(
                            imageVector = Icons.Filled.DragHandle,
                            contentDescription = "Resize card and column",
                            modifier = Modifier
                                .padding(5.dp)
                                .size(14.dp),
                            tint = if (canResizeCard) MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f) else Color.Transparent
                        )
                    }
                }
            }
        }
    }
}

private fun cardTransferData(cardId: OrderDetailCardId): DragAndDropTransferData {
    return DragAndDropTransferData(
        clipData = ClipData(
            ClipDescription("StudioFlow card", arrayOf(StudioCardDragMime, ClipDescription.MIMETYPE_TEXT_PLAIN)),
            ClipData.Item(cardId.raw)
        )
    )
}

@Composable
private fun CardColorSwatch(colorName: String, selected: Boolean) {
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
    val widthCount = columns.size.coerceAtLeast(3)
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
    val currentHeight = savedHeightFor(cardId, orderId) ?: defaultCardHeight(cardId)
    return withCardHeight(cardId, orderId, currentHeight + delta)
}

private fun OrderDetailCardLayout.withCardHeight(
    cardId: OrderDetailCardId,
    orderId: String,
    height: Int
): OrderDetailCardLayout {
    val cleanHeight = height.coerceIn(160, 900)
    val nextHeights = cardHeights.toMutableMap()
    nextHeights[cardId] = cleanHeight

    val nextOrderHeights = orderCardHeights.toMutableMap()
    val cleanOrderId = orderId.trim()
    if (cleanOrderId.isNotBlank()) {
        val perOrder = nextOrderHeights[cleanOrderId]?.toMutableMap() ?: mutableMapOf()
        perOrder[cardId] = cleanHeight
        nextOrderHeights[cleanOrderId] = perOrder
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
        OrderDetailCardId.Customer -> 320
        OrderDetailCardId.Delivery -> 330
        OrderDetailCardId.Todo -> 360
        OrderDetailCardId.HistoryLog -> 360
        OrderDetailCardId.Financial -> 380
        else -> 260
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
        OrderDetailCardId.Summary -> Icons.Filled.Description
        OrderDetailCardId.Customer -> Icons.Filled.Person
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
        OrderDetailCardId.Summary -> Color(0xFF5B6CFF)
        OrderDetailCardId.Customer -> Color(0xFF00A3A3)
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
            profile.put("snapshotJSON", snapshotJSON)
            profile.put("updatedAt", System.currentTimeMillis() / 1000.0)
            profiles.put(index, profile)
            updated = true
            break
        }
    }
    if (!updated) {
        profiles.put(
            JSONObject()
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
private fun MetricTile(modifier: Modifier = Modifier, label: String, value: String, color: Color) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surfaceVariant
    ) {
        Column(modifier = Modifier.padding(11.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            Text(
                value,
                color = color,
                fontSize = 16.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String, valueColor: Color = MaterialTheme.colorScheme.onSurface) {
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
    InfoRow(label, yesNo(value), if (value) StudioGreen else MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun StatusPill(label: String, color: Color) {
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
    var expanded by remember { mutableStateOf(false) }
    Button(
        onClick = { expanded = true },
        shape = RoundedCornerShape(9.dp),
        modifier = Modifier.height(34.dp)
    ) {
        Text("Assign", fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
        DropdownMenuItem(
            text = { Text("Unassigned") },
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
    var expanded by remember { mutableStateOf(false) }
    val selectedMember = teamMembers.firstOrNull { it.id == selectedMemberId }
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = label,
            modifier = Modifier.weight(0.42f),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
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
                    text = { Text("Unassigned") },
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

private fun isClientFileImage(contentType: String, fileName: String): Boolean {
    val cleanType = contentType.lowercase()
    val extension = fileName.substringAfterLast(".", "").lowercase()
    return cleanType.startsWith("image/") || extension in setOf("jpg", "jpeg", "png", "webp", "heic", "heif")
}

private fun openDeliveryCalendarEvent(context: Context, order: StudioOrder) {
    val start = order.paymentDate.time
    val end = dueDate(order).time + DAY_MS
    val title = "StudioFlow: ${order.displayCustomerName}"
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
    val expenseItems = normalizedFinancialItems(settings.financialExpenseItems, "Cost")
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
        filtered.take(9)
    } else {
        filtered.take(firstDot + 1) + filtered.drop(firstDot + 1).filter { it != '.' }.take(2)
    }
}

private fun parseDecimal(value: String, fallback: Double): Double {
    return value.toDoubleOrNull()?.coerceAtLeast(0.0) ?: fallback
}

@Composable
private fun money(value: Double): String {
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

private fun deliveryColor(order: StudioOrder): Color {
    val days = order.remainingDays
    return when {
        days < 0 -> StudioRed
        days <= 7 -> StudioWarningOrange
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
            putExtra(Intent.EXTRA_SUBJECT, "${order.displayCustomerName} StudioFlow PDF")
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
    advancedFinanceEnabled: Boolean
): File {
    val document = PdfDocument()
    val pageWidth = 595
    val pageHeight = 842
    val margin = 42f
    var pageNumber = 1
    var page = document.startPage(PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageNumber).create())
    var canvas = page.canvas
    var y = margin

    val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF111827.toInt()
        textSize = 24f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    val sectionPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF111827.toInt()
        textSize = 15f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF6B7280.toInt()
        textSize = 10.5f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    val bodyPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF111827.toInt()
        textSize = 12f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
    }
    val mutedPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF9CA3AF.toInt()
        textSize = 10f
    }
    val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFE5E7EB.toInt()
        strokeWidth = 1f
    }

    fun paintPageBackground() {
        canvas.drawColor(0xFFFFFFFF.toInt())
    }

    fun newPage() {
        document.finishPage(page)
        pageNumber += 1
        page = document.startPage(PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageNumber).create())
        canvas = page.canvas
        y = margin
        paintPageBackground()
        canvas.drawText("StudioFlow order export", margin, y, mutedPaint)
        y += 24f
    }

    fun ensureSpace(height: Float) {
        if (y + height > pageHeight - margin) newPage()
    }

    fun drawKeyValue(label: String, value: String) {
        val cleanValue = value.trim().ifBlank { "-" }
        val labelWidth = 132f
        val valueX = margin + labelWidth
        val maxValueWidth = pageWidth - margin * 2 - labelWidth
        val lines = pdfWrappedLines(cleanValue, bodyPaint, maxValueWidth)
        val rowHeight = maxOf(26f, 10f + lines.size * 16f)
        ensureSpace(rowHeight)
        canvas.drawText(label.trim(), margin, y + 13f, labelPaint)
        lines.forEachIndexed { index, line ->
            canvas.drawText(line, valueX, y + 13f + index * 16f, bodyPaint)
        }
        y += rowHeight
    }

    fun drawSection(title: String, rows: List<Pair<String, String>>) {
        val cleanRows = rows
            .map { it.first.trim() to it.second.trim() }
            .filter { it.first.isNotBlank() }
        if (cleanRows.isEmpty()) return
        ensureSpace(48f)
        y += 10f
        canvas.drawText(title, margin, y, sectionPaint)
        y += 20f
        cleanRows.forEach { (label, value) -> drawKeyValue(label, value) }
        canvas.drawLine(margin, y + 4f, pageWidth - margin, y + 4f, linePaint)
        y += 14f
    }

    paintPageBackground()
    canvas.drawText("StudioFlow Order", margin, y, titlePaint)
    y += 28f
    canvas.drawText(order.displayCustomerName, margin, y, sectionPaint)
    y += 18f
    canvas.drawText(order.designName.ifBlank { order.watchRef.ifBlank { "New Project" } }, margin, y, mutedPaint)
    y += 16f
    canvas.drawText("Generated ${pdfDate(Date())}", margin, y, mutedPaint)
    y += 14f

    if (settings.pdfShowCustomer) {
        val customRows = orderedCustomFieldsForDisplay(order.customFields, settings.customFields)
            .filter { (key, value) ->
                key.isNotBlank() &&
                    value.isNotBlank() &&
                    !key.startsWith("communication", ignoreCase = true) &&
                    !key.startsWith("financial", ignoreCase = true) &&
                    !key.startsWith("specialNote", ignoreCase = true)
            }
            .take(10)
        drawSection(
            "Customer & Design",
            listOf(
                "Customer" to order.displayCustomerName,
                "Design" to order.designName.ifBlank { "-" },
                "Watch Ref" to order.watchRef.ifBlank { "-" },
                "Placed On" to pdfDate(order.paymentDate),
                "Delivery Due" to pdfDate(dueDate(order)),
                "Delivery In" to deliveryLabel(order)
            ) + customRows
        )
    }

    if (settings.pdfShowContact) {
        val channelRows = communicationChannelLabels(settings).mapNotNull { label ->
            val value = communicationChannelDisplayValue(order, label)
            if (value.isBlank()) null else label to value
        }
        val noteRows = normalizedSpecialNoteSections(settings.specialNoteSections).mapNotNull { section ->
            val value = specialNoteValue(order, section)
            if (value.isBlank()) null else section.title to value
        }
        drawSection(
            "Contact & Notes",
            listOf(
                "Email" to order.emailAddress,
                "Instagram" to order.instagramUsername,
                "WhatsApp" to order.whatsappNumber,
                "Communication" to order.communication.joinToString(", ")
            ) + channelRows + noteRows
        )
    }

    if (settings.pdfShowPreview) {
        val previewFile = order.clientFiles.firstOrNull {
            isClientFileImage(it.contentType, it.fileName) && it.downloadUrl.isNotBlank()
        }
        drawSection(
            "Preview Image",
            listOf(
                "Preview URL" to order.designLink,
                "Client File" to (previewFile?.fileName ?: "-")
            )
        )
    }

    if (settings.pdfShowMaterials) {
        val materialRows = materialDefaultCheckLabels(settings).mapIndexed { index, label ->
            label to yesNo(materialDefaultToggleValue(order, index, label))
        }
        val extraMaterialRows = settings.materialsToggles
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .map { label -> label to yesNo(order.customToggles["materials::$label"] == true) }
        val notesRow = if (settings.showMaterialsNotesSupplier && order.invNotes.isNotBlank()) {
            listOf(settings.materialsNotesSupplierLabel.ifBlank { "Notes / Supplier" } to order.invNotes)
        } else {
            emptyList()
        }
        drawSection("Materials & Inventory", materialRows + extraMaterialRows + notesRow)
    }

    if (settings.pdfShowPriority) {
        drawSection(
            "Priority / Risk",
            listOf(
                "Priority" to order.priority.ifBlank { "Normal" },
                "Risk" to order.risk.ifBlank { "None" },
                "Risk Reason" to order.riskReason.takeUnless { it == "-" }.orEmpty()
            )
        )
    }

    if (canSeeFinancial && settings.pdfShowFinCustomer) {
        drawSection(
            "Financials: Paid & Remaining",
            listOf(
                "Order Value" to pdfMoney(order.orderValue, settings),
                "Paid" to pdfMoney(order.paidAmount, settings),
                "Remaining" to pdfMoney(order.remainingAmount, settings)
            )
        )
    }

    if (canSeeFinancial && settings.pdfShowPaymentMethod) {
        drawSection(
            "Payment Method",
            listOf(
                "Method" to order.paymentMethod.ifBlank { "Card" },
                "Full Payment Received" to yesNo(order.remainingAmount <= 0.0)
            )
        )
    }

    if (canSeeFinancial && advancedFinanceEnabled && settings.pdfShowFinInternal) {
        val remainingItems = normalizedFinancialItems(settings.financialRemainingItems, "Pending")
        val expenseItems = normalizedFinancialItems(settings.financialExpenseItems, "Cost")
        val remainingRows = remainingItems.map { item ->
            item.title to pdfMoney(financialCustomValue(order, "financialRemaining::", item.title), settings)
        }
        val expenseRows = expenseItems.map { item ->
            item.title to pdfMoney(financialCustomValue(order, "financialExpense::", item.title), settings)
        }
        drawSection(
            "Internal Financials",
            listOf(
                settings.financialBaseCostLabel.ifBlank { "Cost (Base)" } to pdfMoney(order.watchPurchasePrice, settings),
                "Delivery Cost" to pdfMoney(order.deliveryCost, settings),
                "Platform Fee" to pdfMoney(order.paymentFee, settings),
                "Tax" to pdfMoney(order.taxAmount, settings),
                "Net Profit" to pdfMoney(financialFinalProfit(order, settings), settings)
            ) + remainingRows + expenseRows
        )
    }

    if (settings.pdfShowStatus) {
        val statusRows = settings.customSteps
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .map { step -> step to statusStepValue(order, step) }
        val toggleRows = settings.customToggles
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .map { label -> label to yesNo(order.customToggles[label] == true) }
        drawSection(
            "Production Status",
            listOf(
                "Design" to order.designStatus,
                "Painting" to order.status
            ) + statusRows + toggleRows
        )
    }

    if (settings.pdfShowShipping) {
        drawSection(
            "Shipping & Tracking",
            listOf(
                "Dispatched" to yesNo(order.isDispatched),
                "Delivered" to yesNo(order.isDelivered),
                "Courier" to order.courier.ifBlank { "Auto Detect" },
                "Tracking No." to order.trackingNumber
            )
        )
    }

    val invoiceRows = settings.companyNumbers
        .filter { it.title.isNotBlank() && it.value.isNotBlank() }
        .map { it.title to it.value }
    drawSection("Company Invoice Numbers", invoiceRows)

    ensureSpace(28f)
    canvas.drawText("StudioFlow Android export respects the PDF settings for this workspace.", margin, y + 12f, mutedPaint)
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
        .ifBlank { "StudioFlow_Order" }
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
    val internalKeys = setOf("scheduleAlertItemsV1", "reminderItemsV1", "communicationAddress", "communicationCustomerNotes")
    return fields.toSortedMap().filterKeys { key ->
        val cleaned = key.trim()
        cleaned.isNotBlank() && !cleaned.startsWith("__") && "::" !in cleaned && cleaned !in internalKeys
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
