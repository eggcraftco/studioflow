package uk.co.eggcraft.studioflow.features.shell

import android.content.Context
import android.graphics.BitmapFactory
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.automirrored.filled.Note
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.automirrored.outlined.ListAlt
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.foundation.layout.offset
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uk.co.eggcraft.studioflow.R
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import com.google.firebase.firestore.FieldValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import uk.co.eggcraft.studioflow.billing.StudioGooglePlanOffer
import uk.co.eggcraft.studioflow.billing.StudioGoogleStorageOffer
import uk.co.eggcraft.studioflow.data.model.StudioBillingPlan
import uk.co.eggcraft.studioflow.data.model.StudioCustomRole
import uk.co.eggcraft.studioflow.data.model.StudioJoinRequest
import uk.co.eggcraft.studioflow.data.model.StudioCustomer
import uk.co.eggcraft.studioflow.data.model.StudioCustomerPrefsPatch
import uk.co.eggcraft.studioflow.data.model.StudioOrder
import uk.co.eggcraft.studioflow.data.model.StudioTeamMember
import uk.co.eggcraft.studioflow.data.model.WorkspaceMemberAccess
import uk.co.eggcraft.studioflow.features.customers.CustomersScreen
import uk.co.eggcraft.studioflow.features.dashboard.DashboardScreen
import uk.co.eggcraft.studioflow.features.orders.OrdersScreen
import uk.co.eggcraft.studioflow.features.quickreply.QuickReplyScreen
import uk.co.eggcraft.studioflow.features.schedule.ScheduleScreen
import uk.co.eggcraft.studioflow.features.settings.SettingsScreen
import uk.co.eggcraft.studioflow.features.settings.smartWorkflowTemplateUpdates
import androidx.compose.material.icons.filled.Handyman
import androidx.compose.material.icons.filled.Inventory2
import uk.co.eggcraft.studioflow.features.settings.standardWorkflowTemplate
import uk.co.eggcraft.studioflow.ui.theme.StudioBlue
import uk.co.eggcraft.studioflow.ui.theme.StudioGreen
import uk.co.eggcraft.studioflow.ui.theme.StudioRed
import uk.co.eggcraft.studioflow.ui.theme.StudioWarningOrange

enum class StudioSection(val title: String, val icon: ImageVector, val accessKey: String) {
    Dashboard("Dashboard", Icons.Filled.Dashboard, "dashboard"),
    BankSpending("Bank", Icons.Filled.AccountBalance, "dashboard"),
    Orders("Orders", Icons.AutoMirrored.Outlined.ListAlt, "orders"),
    Production("Production", Icons.Filled.Handyman, "orders"),
    Inventory("Inventory", Icons.Filled.Inventory2, "orders"),
    Schedule("Schedule", Icons.Filled.Schedule, "schedule"),
    TeamSchedule("Team Schedule", Icons.Filled.Groups, "schedule"),
    Customers("Customers", Icons.Filled.People, "customers"),
    Files("Files", Icons.Filled.Folder, "clientFiles"),
    Messages("Messages", Icons.AutoMirrored.Filled.Chat, "messages"),
    Notifications("Notifications", Icons.Filled.Notifications, "notifications"),
    Notes("Notes", Icons.AutoMirrored.Filled.Note, "notes"),
    QuickReply("AI Replies", Icons.Outlined.AutoAwesome, "quickReply"),
    Settings("Settings", Icons.Filled.Settings, "settings"),
    Insights("Insights", Icons.Filled.Dashboard, "insights")
}

private enum class HeaderCloudState {
    Connecting,
    Saving,
    Saved,
    Offline,
    Error
}

private data class HeaderCloudStatus(
    val state: HeaderCloudState,
    val message: String,
    val lastSavedAtMillis: Long
)

private const val HeaderPrefsName = "studioflow_header"
private const val HideSensitiveNumbersKey = "hideSensitiveNumbers"

@Composable
fun StudioFlowMainScreen(
    state: StudioFlowUiState,
    requireDeviceUnlock: Boolean,
    onSetRequireDeviceUnlock: (Boolean) -> Unit,
    onSignOut: () -> Unit,
    onCreateOrder: () -> Unit,
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
    onRestoreOrder: (StudioOrder) -> Unit,
    onCreateCustomer: (String, String, String, String, String, String, String, String, String) -> Unit,
    onUpdateCustomer: (StudioCustomer) -> Unit,
    onUpdateCustomerPrefs: (StudioCustomer, StudioCustomerPrefsPatch) -> Unit = { _, _ -> },
    onResyncCustomer: (StudioCustomer) -> Unit,
    onUploadCustomerPhoto: (StudioCustomer, ByteArray, String) -> Unit,
    onDeleteCustomer: (String) -> Unit,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit,
    onUpdateWorkspaceBillingPlan: (StudioBillingPlan) -> Unit,
    googlePlanOffers: List<StudioGooglePlanOffer> = emptyList(),
    googleStorageOffers: List<StudioGoogleStorageOffer> = emptyList(),
    googleBillingPurchasing: Boolean = false,
    onLoadGooglePlayProducts: () -> Unit = {},
    onPurchaseGooglePlan: (android.app.Activity, StudioGooglePlanOffer) -> Unit = { _, _ -> },
    onPurchaseGoogleStorageAddon: (android.app.Activity, StudioGoogleStorageOffer) -> Unit = { _, _ -> },
    onRestoreGooglePlayPurchases: () -> Unit = {},
    onRecalculateFinancialSettings: (Map<String, Any?>) -> Unit,
    onUpdateAccountProfile: (String, String) -> Unit,
    onUploadAccountAvatar: (ByteArray, String) -> Unit,
    onRemoveAccountAvatar: () -> Unit,
    onUploadWorkspaceLogo: (ByteArray, String, Boolean) -> Unit,
    onRemoveWorkspaceLogo: () -> Unit,
    onChangeAccountEmail: (String) -> Unit,
    onSendPasswordResetEmail: () -> Unit,
    onRequestWorkspaceAccess: (String) -> Unit,
    onSwitchWorkspace: (String) -> Unit,
    onApproveJoinRequest: (StudioJoinRequest, String) -> Unit,
    onDeclineJoinRequest: (StudioJoinRequest) -> Unit,
    onUpdateTeamMemberRole: (StudioTeamMember, String) -> Unit,
    onUpdateTeamMemberAccess: (StudioTeamMember, WorkspaceMemberAccess) -> Unit,
    onRemoveTeamMember: (StudioTeamMember) -> Unit,
    onSaveCustomRole: (String, String, String, WorkspaceMemberAccess) -> Unit,
    onDeleteCustomRole: (StudioCustomRole) -> Unit,
    onImportBackup: (String) -> Unit,
    onConfirmImportBackup: (Boolean) -> Unit,
    onCancelImportBackup: () -> Unit,
    onDeleteWorkspaceData: () -> Unit,
    onSelectMessageThread: (String) -> Unit,
    onMarkMessageThreadRead: (String) -> Unit,
    onSendMessage: (String, List<String>) -> Unit,
    onSendMessageWithAttachment: (ByteArray, String, String, String, List<String>) -> Unit,
    onEditMessage: (String, String) -> Unit,
    onDeleteMessageForMe: (String) -> Unit,
    onDeleteMessageForEveryone: (String) -> Unit,
    onToggleReaction: (String, String) -> Unit,
    onTogglePin: (String, Boolean) -> Unit,
    onSetReplyingToMessage: (uk.co.eggcraft.studioflow.data.model.StudioMessageItem?) -> Unit,
    onComposerTextChanged: () -> Unit,
    onSetMessageSearchQuery: (String) -> Unit,
    onSetMessageAttachmentFilter: (String) -> Unit,
    onToggleThreadArchive: (String) -> Unit,
    onToggleSavedMessage: (String, String) -> Unit,
    onSetForwardingMessage: (uk.co.eggcraft.studioflow.data.model.StudioMessageItem?) -> Unit,
    onForwardMessageToThread: (String) -> Unit,
    onCreateDirectMessageThread: (String) -> Unit,
    onCreateGroupMessageThread: (List<String>, String) -> Unit,
    onAddMembersToThread: (String, List<String>) -> Unit,
    onRenameThread: (String, String) -> Unit,
    onLeaveThread: (String) -> Unit,
    onSetThreadMute: (String, String) -> Unit,
    onLoadDraft: (String, String) -> String,
    onSaveDraft: (String, String, String) -> Unit,
    onSetActivityNotificationSearch: (String) -> Unit,
    onSetActivityNotificationReadFilter: (String) -> Unit,
    onSetActivityNotificationTypeFilter: (String) -> Unit,
    onMarkActivityNotificationRead: (String) -> Unit,
    onMarkAllActivityNotificationsRead: () -> Unit,
    onDismissActivityNotifications: (List<String>) -> Unit,
    onReviewOrderDeletion: (String, Boolean) -> Unit,
    onOpenActivityNotification: (uk.co.eggcraft.studioflow.data.model.StudioActivityNotification) -> Unit,
    onSetKeepNotesSearch: (String) -> Unit,
    onSetKeepNotesSection: (String) -> Unit,
    onSaveKeepNote: (uk.co.eggcraft.studioflow.data.model.StudioKeepNote) -> Unit,
    onDeleteKeepNote: (String) -> Unit,
    onUploadKeepNoteImage: (uk.co.eggcraft.studioflow.data.model.StudioKeepNote, ByteArray, String, String) -> Unit,
    onInviteKeepCollab: (uk.co.eggcraft.studioflow.data.model.StudioKeepNote, String, String) -> Unit,
    onRemoveKeepCollab: (String, String, String) -> Unit,
    onAcceptKeepInvite: (String) -> Unit,
    onDeclineKeepInvite: (String) -> Unit,
    onRefreshKeepInvites: () -> Unit,
    onSaveMessageWorkspaceSettings: (uk.co.eggcraft.studioflow.data.model.StudioMessageWorkspaceSettings) -> Unit,
    onReloadMessageWorkspaceSettings: () -> Unit,
    onConsumePendingActivityNavigation: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var section by rememberSaveable { mutableStateOf(StudioSection.Orders) }
    var settingsStartKey by rememberSaveable { mutableStateOf<String?>(null) }
    var focusedCustomerName by rememberSaveable { mutableStateOf("") }
    var isNotificationDrawerOpen by rememberSaveable { mutableStateOf(false) }
    val preferredSectionOrder = listOf(
        StudioSection.Orders,
        StudioSection.Production,
        StudioSection.Inventory,
        StudioSection.Dashboard,
        StudioSection.BankSpending,
        StudioSection.Schedule,
        StudioSection.TeamSchedule,
        StudioSection.Notes,
        StudioSection.Customers,
        StudioSection.Files,
        StudioSection.Messages,
        StudioSection.QuickReply,
        StudioSection.Settings,
        StudioSection.Insights
    )
    val availableSections = preferredSectionOrder.filter { item ->
        val planAllowsSection = item != StudioSection.Messages ||
            state.workspace?.billingPlan == StudioBillingPlan.TeamMonthly
        val menuAllowsSection = item != StudioSection.QuickReply ||
            (state.workspace?.quickReplyMenuEnabled ?: true)
        val adminAllowsSection = item != StudioSection.Insights || mainScreenIsNivaDeskAdmin()
        if (item == StudioSection.Insights) {
            adminAllowsSection
        } else if (item == StudioSection.BankSpending) {
            // Bank feed reads are owner-only in Firestore rules, and the feature
            // itself starts at Pro.
            (state.workspace?.billingPlan?.allowsBankFeed ?: false) && (
                state.workspace?.isOwner == true ||
                    (state.workspace?.memberAccess?.bankFeed == true && (state.workspace?.canSeeFinancialData ?: true))
            )
        } else {
            planAllowsSection && menuAllowsSection &&
                (state.workspace?.memberAccess?.allows(item.accessKey) ?: true)
        }
    }
    val activeSection = section.takeIf { it in availableSections } ?: availableSections.firstOrNull()

    // System back: if not on the home section (Orders), go home instead of exiting.
    val homeSection = if (StudioSection.Orders in availableSections) StudioSection.Orders else availableSections.firstOrNull()
    BackHandler(enabled = homeSection != null && activeSection != homeSection) {
        settingsStartKey = null
        section = homeSection!!
    }
    val context = LocalContext.current
    val headerPrefs = remember(context) {
        context.getSharedPreferences(HeaderPrefsName, Context.MODE_PRIVATE)
    }
    var hideSensitiveNumbers by rememberSaveable {
        mutableStateOf(headerPrefs.getBoolean(HideSensitiveNumbersKey, false))
    }
    val networkAvailable by rememberNetworkAvailable()
    var lastCloudSavedAt by rememberSaveable { mutableStateOf(0L) }
    val cloudState = cloudStateFor(state, networkAvailable)

    LaunchedEffect(cloudState, state.orders.size, state.workspaceSettings) {
        if (cloudState == HeaderCloudState.Saved) {
            lastCloudSavedAt = System.currentTimeMillis()
        }
    }

    val cloudStatus = HeaderCloudStatus(
        state = cloudState,
        message = cloudMessageFor(state, cloudState),
        lastSavedAtMillis = lastCloudSavedAt
    )
    val toggleSensitiveNumbers = {
        val next = !hideSensitiveNumbers
        hideSensitiveNumbers = next
        headerPrefs.edit().putBoolean(HideSensitiveNumbersKey, next).apply()
    }
    // Incremented on every logo tap so OrdersScreen also closes an open order
    // detail — just switching `section` is a no-op when Orders is already the
    // active section on phone.
    var ordersResetToListKey by rememberSaveable { mutableStateOf(0) }
    val openOrdersFromLogo = {
        settingsStartKey = null
        ordersResetToListKey += 1
        section = when {
            StudioSection.Orders in availableSections -> StudioSection.Orders
            availableSections.isNotEmpty() -> availableSections.first()
            else -> section
        }
    }
    val openAccount = {
        settingsStartKey = "account"
        if (StudioSection.Settings in availableSections) {
            section = StudioSection.Settings
        }
    }
    val showWorkspaceOnboarding = state.workspace != null &&
        !state.loading &&
        state.orders.isEmpty() &&
        !state.workspaceSettings.businessOnboardingCompleted &&
        state.workspace.memberAccess.settings &&
        state.workspace.role.trim().lowercase(Locale.UK) in setOf("owner", "admin")

    LaunchedEffect(availableSections, section) {
        if (section !in availableSections && availableSections.isNotEmpty()) {
            section = availableSections.first()
        }
    }

    // Delivery push tapped: switch to the Orders section; OrdersScreen consumes
    // the pending order id and opens that order's detail.
    LaunchedEffect(Unit) {
        uk.co.eggcraft.studioflow.services.StudioMessageRouteHolder.pendingOrderId.collect { id ->
            if (id.isNotBlank() && StudioSection.Orders in availableSections) {
                section = StudioSection.Orders
            }
        }
    }

    // Launcher shortcut ("New note"): switch to the Notes section; NotesScreen
    // consumes the flag and opens a fresh note editor.
    LaunchedEffect(Unit) {
        uk.co.eggcraft.studioflow.services.StudioMessageRouteHolder.pendingNewNote.collect { pending ->
            if (pending && StudioSection.Notes in availableSections) {
                settingsStartKey = null
                section = StudioSection.Notes
            }
        }
    }

    // Notes widget tap: land on the Notes section (list only, no editor).
    LaunchedEffect(Unit) {
        uk.co.eggcraft.studioflow.services.StudioMessageRouteHolder.pendingOpenNotes.collect { pending ->
            if (pending && uk.co.eggcraft.studioflow.services.StudioMessageRouteHolder.consumePendingOpenNotes() &&
                StudioSection.Notes in availableSections
            ) {
                settingsStartKey = null
                section = StudioSection.Notes
            }
        }
    }

    // Banking "View in Inventory" (purchase-linked transaction): land on the
    // Inventory section.
    LaunchedEffect(Unit) {
        uk.co.eggcraft.studioflow.services.StudioMessageRouteHolder.pendingOpenInventory.collect { pending ->
            if (pending && uk.co.eggcraft.studioflow.services.StudioMessageRouteHolder.consumePendingOpenInventory() &&
                StudioSection.Inventory in availableSections
            ) {
                settingsStartKey = null
                section = StudioSection.Inventory
            }
        }
    }

    LaunchedEffect(state.pendingActivityNavigation) {
        val pending = state.pendingActivityNavigation ?: return@LaunchedEffect
        when (pending) {
            is uk.co.eggcraft.studioflow.features.shell.PendingActivityNavigation.Messages -> {
                if (StudioSection.Messages in availableSections) {
                    settingsStartKey = null
                    section = StudioSection.Messages
                    isNotificationDrawerOpen = false
                }
            }
            is uk.co.eggcraft.studioflow.features.shell.PendingActivityNavigation.Orders -> {
                if (StudioSection.Orders in availableSections) {
                    settingsStartKey = null
                    section = StudioSection.Orders
                    isNotificationDrawerOpen = false
                }
            }
            is uk.co.eggcraft.studioflow.features.shell.PendingActivityNavigation.Support -> {
                if (StudioSection.Settings in availableSections) {
                    settingsStartKey = "support"
                    section = StudioSection.Settings
                    isNotificationDrawerOpen = false
                }
            }
        }
        onConsumePendingActivityNavigation()
    }

    CompositionLocalProvider(LocalHideSensitiveNumbers provides hideSensitiveNumbers) {
        if (showWorkspaceOnboarding) {
            WorkspaceOnboardingScreen(
                state = state,
                onUpdateWorkspaceSettings = onUpdateWorkspaceSettings
            )
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background)
            ) {
            if (state.workspace?.billingPlan == StudioBillingPlan.Demo &&
                state.workspace.isOwner &&
                activeSection != StudioSection.Settings
            ) {
                DemoPlanUpgradeBanner(
                    companyId = state.workspace.id,
                    onViewPlans = {
                        settingsStartKey = "plan"
                        if (StudioSection.Settings in availableSections) {
                            section = StudioSection.Settings
                        }
                    }
                )
            }
            BoxWithConstraints(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
            ) {
        val useTopNavigation = maxWidth >= 840.dp
        val containerWidth = maxWidth
        if (useTopNavigation) {
            Column(modifier = Modifier.fillMaxSize()) {
                StudioLargeTopBar(
                    workspaceName = state.workspace?.name ?: "NivaDesk",
                    workspaceLogoUrl = state.workspaceSettings.appLogoUrl,
                    orders = state.orders,
                    currency = state.workspaceSettings.selectedCurrency.ifBlank { "£" },
                    decimalSeparator = state.workspaceSettings.selectedDecimalSeparator,
                    hideSensitiveNumbers = hideSensitiveNumbers,
                    showFinancialMetrics = state.workspace?.canSeeFinancialData == true,
                    cloudStatus = cloudStatus,
                    creatingOrder = state.creatingOrder,
                    sections = availableSections,
                    selectedSection = activeSection,
                    onSelectSection = {
                        settingsStartKey = null
                        section = it
                    },
                    onLogoClick = openOrdersFromLogo,
                    onToggleSensitiveNumbers = toggleSensitiveNumbers,
                    onCreateOrder = onCreateOrder,
                    onOpenAccount = openAccount,
                    onSignOut = onSignOut,
                    compact = containerWidth < 1500.dp,
                    notificationUnreadCount = state.activityNotificationUnreadCount,
                    messageUnreadCount = state.messageUnreadCount,
                    onOpenNotifications = { isNotificationDrawerOpen = true },
                    modifier = Modifier
                        .fillMaxWidth()
                )
                StudioSectionContent(
                    activeSection = activeSection,
                    ordersResetToListKey = ordersResetToListKey,
                    state = state,
                    requireDeviceUnlock = requireDeviceUnlock,
                    onSetRequireDeviceUnlock = onSetRequireDeviceUnlock,
                    onSignOut = onSignOut,
                    onAssignOrder = onAssignOrder,
                    onUpdateOrderFields = onUpdateOrderFields,
                    onSaveOrderCardLayout = onSaveOrderCardLayout,
                    onResetOrderCardLayout = onResetOrderCardLayout,
                    onUploadClientFile = onUploadClientFile,
                    onUploadPreviewImage = onUploadPreviewImage,
                    onRefreshLiveTracking = onRefreshLiveTracking,
                    onRenameClientFile = onRenameClientFile,
                    onDeleteClientFile = onDeleteClientFile,
                    onDeleteOrder = onDeleteOrder,
                    onRestoreOrder = onRestoreOrder,
                    focusedCustomerName = focusedCustomerName,
                    onOpenCustomerFromOrder = { order ->
                        focusedCustomerName = order.displayCustomerName
                        settingsStartKey = null
                        section = StudioSection.Customers
                    },
                    onCreateOrder = onCreateOrder,
                    onCreateCustomer = onCreateCustomer,
                    onUpdateCustomer = onUpdateCustomer,
                    onUpdateCustomerPrefs = onUpdateCustomerPrefs,
                    onResyncCustomer = onResyncCustomer,
                    onUploadCustomerPhoto = onUploadCustomerPhoto,
                    onDeleteCustomer = onDeleteCustomer,
                    onOpenOrderFromFiles = { order ->
                        // Open the tapped project's order detail (mirrors the Mac
                        // hub). Reuse the existing pending-order route OrdersScreen
                        // consumes on entry; card = "" so it opens at the top
                        // instead of jumping to the shipping card.
                        order.id?.let {
                            uk.co.eggcraft.studioflow.services.StudioMessageRouteHolder
                                .setPendingOrderRoute(it, card = "")
                        }
                        settingsStartKey = null
                        section = StudioSection.Orders
                    },
                    settingsInitialSectionKey = settingsStartKey,
                    onUpdateWorkspaceSettings = onUpdateWorkspaceSettings,
                    onUpdateWorkspaceBillingPlan = onUpdateWorkspaceBillingPlan,
                    googlePlanOffers = googlePlanOffers,
                    googleStorageOffers = googleStorageOffers,
                    googleBillingPurchasing = googleBillingPurchasing,
                    onLoadGooglePlayProducts = onLoadGooglePlayProducts,
                    onPurchaseGooglePlan = onPurchaseGooglePlan,
                    onPurchaseGoogleStorageAddon = onPurchaseGoogleStorageAddon,
                    onRestoreGooglePlayPurchases = onRestoreGooglePlayPurchases,
                    onRecalculateFinancialSettings = onRecalculateFinancialSettings,
                    onUpdateAccountProfile = onUpdateAccountProfile,
                    onUploadAccountAvatar = onUploadAccountAvatar,
                    onRemoveAccountAvatar = onRemoveAccountAvatar,
                    onUploadWorkspaceLogo = onUploadWorkspaceLogo,
                    onRemoveWorkspaceLogo = onRemoveWorkspaceLogo,
                    onChangeAccountEmail = onChangeAccountEmail,
                    onSendPasswordResetEmail = onSendPasswordResetEmail,
                    onRequestWorkspaceAccess = onRequestWorkspaceAccess,
                    onSwitchWorkspace = onSwitchWorkspace,
                    onApproveJoinRequest = onApproveJoinRequest,
                    onDeclineJoinRequest = onDeclineJoinRequest,
                    onUpdateTeamMemberRole = onUpdateTeamMemberRole,
                    onUpdateTeamMemberAccess = onUpdateTeamMemberAccess,
                    onRemoveTeamMember = onRemoveTeamMember,
                    onSaveCustomRole = onSaveCustomRole,
                    onDeleteCustomRole = onDeleteCustomRole,
                    onImportBackup = onImportBackup,
                    onConfirmImportBackup = onConfirmImportBackup,
                    onCancelImportBackup = onCancelImportBackup,
                    onDeleteWorkspaceData = onDeleteWorkspaceData,
                    onSelectMessageThread = onSelectMessageThread,
                    onMarkMessageThreadRead = onMarkMessageThreadRead,
                    onSendMessage = onSendMessage,
                    onSendMessageWithAttachment = onSendMessageWithAttachment,
                    onEditMessage = onEditMessage,
                    onDeleteMessageForMe = onDeleteMessageForMe,
                    onDeleteMessageForEveryone = onDeleteMessageForEveryone,
                    onToggleReaction = onToggleReaction,
                    onTogglePin = onTogglePin,
                    onSetReplyingToMessage = onSetReplyingToMessage,
                    onComposerTextChanged = onComposerTextChanged,
                    onSetMessageSearchQuery = onSetMessageSearchQuery,
                    onSetMessageAttachmentFilter = onSetMessageAttachmentFilter,
                    onToggleThreadArchive = onToggleThreadArchive,
                    onToggleSavedMessage = onToggleSavedMessage,
                    onSetForwardingMessage = onSetForwardingMessage,
                    onForwardMessageToThread = onForwardMessageToThread,
                    onCreateDirectMessageThread = onCreateDirectMessageThread,
                    onCreateGroupMessageThread = onCreateGroupMessageThread,
                    onAddMembersToThread = onAddMembersToThread,
                    onRenameThread = onRenameThread,
                    onLeaveThread = onLeaveThread,
                    onSetThreadMute = onSetThreadMute,
                    onLoadDraft = onLoadDraft,
                    onSaveDraft = onSaveDraft,
                    onSetActivityNotificationSearch = onSetActivityNotificationSearch,
                    onSetActivityNotificationReadFilter = onSetActivityNotificationReadFilter,
                    onSetActivityNotificationTypeFilter = onSetActivityNotificationTypeFilter,
                    onMarkActivityNotificationRead = onMarkActivityNotificationRead,
                    onMarkAllActivityNotificationsRead = onMarkAllActivityNotificationsRead,
                    onDismissActivityNotifications = onDismissActivityNotifications,
                    onReviewOrderDeletion = onReviewOrderDeletion,
                    onOpenActivityNotification = onOpenActivityNotification,
                    onSetKeepNotesSearch = onSetKeepNotesSearch,
                    onSetKeepNotesSection = onSetKeepNotesSection,
                    onSaveKeepNote = onSaveKeepNote,
                    onDeleteKeepNote = onDeleteKeepNote,
                    onUploadKeepNoteImage = onUploadKeepNoteImage,
                    onInviteKeepCollab = onInviteKeepCollab,
                    onRemoveKeepCollab = onRemoveKeepCollab,
                    onAcceptKeepInvite = onAcceptKeepInvite,
                    onDeclineKeepInvite = onDeclineKeepInvite,
                    onRefreshKeepInvites = onRefreshKeepInvites,
                    onSaveMessageWorkspaceSettings = onSaveMessageWorkspaceSettings,
                    onReloadMessageWorkspaceSettings = onReloadMessageWorkspaceSettings,
                    modifier = Modifier.weight(1f)
                )
            }
        } else {
            Column(modifier = Modifier.fillMaxSize()) {
                StudioMobileHeader(
                    workspaceName = state.workspace?.name ?: "NivaDesk",
                    workspaceLogoUrl = state.workspaceSettings.appLogoUrl,
                    hideSensitiveNumbers = hideSensitiveNumbers,
                    cloudStatus = cloudStatus,
                    creatingOrder = state.creatingOrder,
                    onToggleSensitiveNumbers = toggleSensitiveNumbers,
                    onCreateOrder = onCreateOrder,
                    onSignOut = onSignOut,
                    sections = availableSections,
                    onLogoClick = openOrdersFromLogo,
                    onSelectSection = {
                        settingsStartKey = null
                        section = it
                    },
                    onOpenAccount = openAccount,
                    notificationUnreadCount = state.activityNotificationUnreadCount,
                    messageUnreadCount = state.messageUnreadCount,
                    notesReminderCount = state.keepNotes.count {
                        !it.isDeleted && !it.isArchived && it.reminderDate != null && it.reminderDate.before(java.util.Date())
                    },
                    onOpenNotifications = { isNotificationDrawerOpen = true }
                )
                StudioSectionContent(
                    activeSection = activeSection,
                    ordersResetToListKey = ordersResetToListKey,
                    state = state,
                    requireDeviceUnlock = requireDeviceUnlock,
                    onSetRequireDeviceUnlock = onSetRequireDeviceUnlock,
                    onSignOut = onSignOut,
                    onAssignOrder = onAssignOrder,
                    onUpdateOrderFields = onUpdateOrderFields,
                    onSaveOrderCardLayout = onSaveOrderCardLayout,
                    onResetOrderCardLayout = onResetOrderCardLayout,
                    onUploadClientFile = onUploadClientFile,
                    onUploadPreviewImage = onUploadPreviewImage,
                    onRefreshLiveTracking = onRefreshLiveTracking,
                    onRenameClientFile = onRenameClientFile,
                    onDeleteClientFile = onDeleteClientFile,
                    onDeleteOrder = onDeleteOrder,
                    onRestoreOrder = onRestoreOrder,
                    focusedCustomerName = focusedCustomerName,
                    onOpenCustomerFromOrder = { order ->
                        focusedCustomerName = order.displayCustomerName
                        settingsStartKey = null
                        section = StudioSection.Customers
                    },
                    onCreateOrder = onCreateOrder,
                    onCreateCustomer = onCreateCustomer,
                    onUpdateCustomer = onUpdateCustomer,
                    onUpdateCustomerPrefs = onUpdateCustomerPrefs,
                    onResyncCustomer = onResyncCustomer,
                    onUploadCustomerPhoto = onUploadCustomerPhoto,
                    onDeleteCustomer = onDeleteCustomer,
                    onOpenOrderFromFiles = { order ->
                        // Open the tapped project's order detail (mirrors the Mac
                        // hub). Reuse the existing pending-order route OrdersScreen
                        // consumes on entry; card = "" so it opens at the top
                        // instead of jumping to the shipping card.
                        order.id?.let {
                            uk.co.eggcraft.studioflow.services.StudioMessageRouteHolder
                                .setPendingOrderRoute(it, card = "")
                        }
                        settingsStartKey = null
                        section = StudioSection.Orders
                    },
                    settingsInitialSectionKey = settingsStartKey,
                    onUpdateWorkspaceSettings = onUpdateWorkspaceSettings,
                    onUpdateWorkspaceBillingPlan = onUpdateWorkspaceBillingPlan,
                    googlePlanOffers = googlePlanOffers,
                    googleStorageOffers = googleStorageOffers,
                    googleBillingPurchasing = googleBillingPurchasing,
                    onLoadGooglePlayProducts = onLoadGooglePlayProducts,
                    onPurchaseGooglePlan = onPurchaseGooglePlan,
                    onPurchaseGoogleStorageAddon = onPurchaseGoogleStorageAddon,
                    onRestoreGooglePlayPurchases = onRestoreGooglePlayPurchases,
                    onRecalculateFinancialSettings = onRecalculateFinancialSettings,
                    onUpdateAccountProfile = onUpdateAccountProfile,
                    onUploadAccountAvatar = onUploadAccountAvatar,
                    onRemoveAccountAvatar = onRemoveAccountAvatar,
                    onUploadWorkspaceLogo = onUploadWorkspaceLogo,
                    onRemoveWorkspaceLogo = onRemoveWorkspaceLogo,
                    onChangeAccountEmail = onChangeAccountEmail,
                    onSendPasswordResetEmail = onSendPasswordResetEmail,
                    onRequestWorkspaceAccess = onRequestWorkspaceAccess,
                    onSwitchWorkspace = onSwitchWorkspace,
                    onApproveJoinRequest = onApproveJoinRequest,
                    onDeclineJoinRequest = onDeclineJoinRequest,
                    onUpdateTeamMemberRole = onUpdateTeamMemberRole,
                    onUpdateTeamMemberAccess = onUpdateTeamMemberAccess,
                    onRemoveTeamMember = onRemoveTeamMember,
                    onSaveCustomRole = onSaveCustomRole,
                    onDeleteCustomRole = onDeleteCustomRole,
                    onImportBackup = onImportBackup,
                    onConfirmImportBackup = onConfirmImportBackup,
                    onCancelImportBackup = onCancelImportBackup,
                    onDeleteWorkspaceData = onDeleteWorkspaceData,
                    onSelectMessageThread = onSelectMessageThread,
                    onMarkMessageThreadRead = onMarkMessageThreadRead,
                    onSendMessage = onSendMessage,
                    onSendMessageWithAttachment = onSendMessageWithAttachment,
                    onEditMessage = onEditMessage,
                    onDeleteMessageForMe = onDeleteMessageForMe,
                    onDeleteMessageForEveryone = onDeleteMessageForEveryone,
                    onToggleReaction = onToggleReaction,
                    onTogglePin = onTogglePin,
                    onSetReplyingToMessage = onSetReplyingToMessage,
                    onComposerTextChanged = onComposerTextChanged,
                    onSetMessageSearchQuery = onSetMessageSearchQuery,
                    onSetMessageAttachmentFilter = onSetMessageAttachmentFilter,
                    onToggleThreadArchive = onToggleThreadArchive,
                    onToggleSavedMessage = onToggleSavedMessage,
                    onSetForwardingMessage = onSetForwardingMessage,
                    onForwardMessageToThread = onForwardMessageToThread,
                    onCreateDirectMessageThread = onCreateDirectMessageThread,
                    onCreateGroupMessageThread = onCreateGroupMessageThread,
                    onAddMembersToThread = onAddMembersToThread,
                    onRenameThread = onRenameThread,
                    onLeaveThread = onLeaveThread,
                    onSetThreadMute = onSetThreadMute,
                    onLoadDraft = onLoadDraft,
                    onSaveDraft = onSaveDraft,
                    onSetActivityNotificationSearch = onSetActivityNotificationSearch,
                    onSetActivityNotificationReadFilter = onSetActivityNotificationReadFilter,
                    onSetActivityNotificationTypeFilter = onSetActivityNotificationTypeFilter,
                    onMarkActivityNotificationRead = onMarkActivityNotificationRead,
                    onMarkAllActivityNotificationsRead = onMarkAllActivityNotificationsRead,
                    onDismissActivityNotifications = onDismissActivityNotifications,
                    onReviewOrderDeletion = onReviewOrderDeletion,
                    onOpenActivityNotification = onOpenActivityNotification,
                    onSetKeepNotesSearch = onSetKeepNotesSearch,
                    onSetKeepNotesSection = onSetKeepNotesSection,
                    onSaveKeepNote = onSaveKeepNote,
                    onDeleteKeepNote = onDeleteKeepNote,
                    onUploadKeepNoteImage = onUploadKeepNoteImage,
                    onInviteKeepCollab = onInviteKeepCollab,
                    onRemoveKeepCollab = onRemoveKeepCollab,
                    onAcceptKeepInvite = onAcceptKeepInvite,
                    onDeclineKeepInvite = onDeclineKeepInvite,
                    onRefreshKeepInvites = onRefreshKeepInvites,
                    onSaveMessageWorkspaceSettings = onSaveMessageWorkspaceSettings,
                    onReloadMessageWorkspaceSettings = onReloadMessageWorkspaceSettings,
                    modifier = Modifier.weight(1f)
                )
            }
        }

        // Right-side Notification drawer overlay (Mac-style — floating cards, no dim, no surface)
        val drawerWidthDp = if (maxWidth >= 600.dp) 400.dp else maxWidth
        if (isNotificationDrawerOpen) {
            // Click-outside-to-close: transparent catcher covers area LEFT of drawer
            Row(modifier = Modifier.fillMaxSize()) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .clickable(
                            indication = null,
                            interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }
                        ) { isNotificationDrawerOpen = false }
                )
                Spacer(modifier = Modifier.width(drawerWidthDp))
            }
        }
        // Fully qualified: the outer Column (demo-banner wrapper) would otherwise
        // make this resolve to the ColumnScope.AnimatedVisibility extension.
        androidx.compose.animation.AnimatedVisibility(
            visible = isNotificationDrawerOpen,
            enter = slideInHorizontally(initialOffsetX = { it }),
            exit = slideOutHorizontally(targetOffsetX = { it }),
            modifier = Modifier
                .fillMaxHeight()
                .width(drawerWidthDp)
                .align(Alignment.TopEnd)
        ) {
            uk.co.eggcraft.studioflow.features.notifications.NotificationsScreen(
                state = state,
                onSetSearch = onSetActivityNotificationSearch,
                onSetReadFilter = onSetActivityNotificationReadFilter,
                onSetTypeFilter = onSetActivityNotificationTypeFilter,
                onMarkRead = onMarkActivityNotificationRead,
                onMarkAllRead = onMarkAllActivityNotificationsRead,
                onDismiss = onDismissActivityNotifications,
                onReviewOrderDeletion = onReviewOrderDeletion,
                onOpen = { item ->
                    onOpenActivityNotification(item)
                },
                onClose = { isNotificationDrawerOpen = false }
            )
        }
        }
        }
        }
    }
}

// First-launch guidance: Play Store installs land on the Free Demo plan and
// often don't discover Settings → Plan & Access on their own. Mirrors iOS: the
// X never fully hides the banner — it collapses to a one-line strip that
// expands back on tap. Collapsed state is stored per companyId so it never
// bleeds into a different account on this device.
@Composable
private fun DemoPlanUpgradeBanner(
    companyId: String,
    onViewPlans: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val context = LocalContext.current
    val prefs = remember(context) {
        context.getSharedPreferences("demo_plan_banner", Context.MODE_PRIVATE)
    }
    var collapsedCompanyId by rememberSaveable {
        mutableStateOf(prefs.getString("collapsedCompanyId", "") ?: "")
    }
    val setCollapsed: (Boolean) -> Unit = { collapsed ->
        collapsedCompanyId = if (collapsed) companyId else ""
        prefs.edit().putString("collapsedCompanyId", collapsedCompanyId).apply()
    }
    val isCollapsed = companyId.isNotBlank() && collapsedCompanyId == companyId

    Surface(color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        if (isCollapsed) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { setCollapsed(false) }
                    .padding(vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Text("✨", fontSize = 10.sp)
                Spacer(modifier = Modifier.width(5.dp))
                Text(t("Free"), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                Text("  ·  ", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(t("View plans"), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
                Spacer(modifier = Modifier.width(4.dp))
                Icon(
                    Icons.Filled.KeyboardArrowDown,
                    contentDescription = null,
                    modifier = Modifier.size(13.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text("✨", fontSize = 16.sp)
                Column(modifier = Modifier.weight(1f)) {
                    Text(t("You're on the Free plan."), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Text(
                        t("Choose a plan in Plan & Access to unlock more orders, storage and team features."),
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Button(onClick = onViewPlans, contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)) {
                    Text(t("View plans"), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
                IconButton(onClick = { setCollapsed(true) }, modifier = Modifier.size(28.dp)) {
                    Icon(
                        Icons.Filled.Close,
                        contentDescription = t("Close"),
                        modifier = Modifier.size(15.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
private fun WorkspaceOnboardingScreen(
    state: StudioFlowUiState,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var businessType by rememberSaveable {
        mutableStateOf(state.workspaceSettings.businessType.ifBlank { "Photography Studio" })
    }
    var businessPromptEdited by rememberSaveable { mutableStateOf(false) }
    var businessPrompt by rememberSaveable {
        mutableStateOf(
            state.workspaceSettings.businessDescriptionPrompt
                .takeIf { it.isNotBlank() && !isOnboardingPromptSeed(it) && it != onboardingDefaultModelPrompt }
                ?: onboardingPromptSeed(state.workspaceSettings.businessType.ifBlank { "Photography Studio" }, lang)
        )
    }
    var menuOpen by remember { mutableStateOf(false) }
    val businessTypes = listOf(
        "Custom Art Studio",
        "Freelancer / Designer",
        "Repair Service",
        "Handmade Products",
        "Photography Studio",
        "Tailor / Alteration Studio",
        "Jewellery Studio",
        "Agency / Creative Studio",
        "Food / Bakery / Catering",
        "Beauty / Clinic / Wellness",
        "Consultancy / Professional Service",
        "General Small Business",
        "Other / Prompt Based"
    )
    val saving = state.settingsSaving
    val scrollState = rememberScrollState()

    fun completionUpdates(action: String): Map<String, Any?> {
        return mapOf(
            "businessOnboardingCompletedAt" to FieldValue.serverTimestamp(),
            "businessOnboardingCompletedAction" to action,
            "businessOnboardingCompletedBy" to (state.user?.uid ?: "")
        )
    }

    fun saveSmartTemplate() {
        onUpdateWorkspaceSettings(
            smartWorkflowTemplateUpdates(businessPrompt, businessType) + completionUpdates("smart"),
            "Workspace setup completed."
        )
    }

    fun saveStandardTemplate() {
        onUpdateWorkspaceSettings(
            standardWorkflowTemplate(businessType) + completionUpdates("standard"),
            "Workspace setup completed."
        )
    }

    fun skipSetup() {
        onUpdateWorkspaceSettings(completionUpdates("skip"), "Workspace setup skipped.")
    }

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF121212))
            .verticalScroll(scrollState),
        contentAlignment = Alignment.TopCenter
    ) {
        val isCompact = maxWidth < 720.dp
        val cardWidth = if (isCompact) maxWidth else 760.dp
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = cardWidth)
                .padding(horizontal = if (isCompact) 18.dp else 42.dp, vertical = 34.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(22.dp)
        ) {
            Surface(
                modifier = Modifier.size(if (isCompact) 88.dp else 110.dp),
                shape = RoundedCornerShape(28.dp),
                color = Color.Transparent
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.linearGradient(
                                listOf(Color(0xFF4B83F5), Color(0xFFD42FE5))
                            )
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Outlined.AutoAwesome,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(46.dp)
                    )
                }
            }

            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    "Set up your workspace",
                    color = Color(0xFFF4F4F5),
                    fontSize = if (isCompact) 34.sp else 48.sp,
                    fontWeight = FontWeight.Black,
                    lineHeight = if (isCompact) 38.sp else 52.sp
                )
                Text(
                    "Choose your business type first. NivaDesk can then prepare useful workflow steps, fields, card labels and statuses before you create your first order.",
                    color = Color(0xFF9D9DA3),
                    fontSize = 18.sp,
                    lineHeight = 25.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(28.dp),
                color = Color(0xFF1B1B1C),
                shadowElevation = 16.dp
            ) {
                Column(
                    modifier = Modifier.padding(if (isCompact) 20.dp else 28.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Business Type", color = Color(0xFFA3A3A8), fontWeight = FontWeight.Black)
                        Box {
                            Button(
                                onClick = { menuOpen = true },
                                enabled = !saving,
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF343437), contentColor = Color.White),
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Text(t(businessType), fontWeight = FontWeight.Black)
                            }
                            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                                businessTypes.forEach { type ->
                                    DropdownMenuItem(
                                        text = { Text(t(type)) },
                                        onClick = {
                                            businessType = type
                                            if (!businessPromptEdited || isOnboardingPromptSeed(businessPrompt)) {
                                                businessPrompt = onboardingPromptSeed(type, lang)
                                                businessPromptEdited = false
                                            }
                                            menuOpen = false
                                        }
                                    )
                                }
                            }
                        }
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.AutoAwesome, contentDescription = null, tint = Color(0xFFCC2FE1))
                            Text("Optional smart description", color = Color(0xFFF4F4F5), fontWeight = FontWeight.Black, fontSize = 18.sp)
                        }
                        Text(
                            "You can describe how your work flows, what information you collect from customers, approvals, materials, appointments, deposits, shipping or delivery. If you leave this empty, NivaDesk will use the standard template for the selected business type.",
                            color = Color(0xFFA3A3A8),
                            fontSize = 16.sp,
                            lineHeight = 22.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }

                    OutlinedTextField(
                        value = businessPrompt,
                        onValueChange = { businessPrompt = it; businessPromptEdited = true },
                        enabled = !saving,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(if (isCompact) 230.dp else 180.dp),
                        placeholder = {
                            Text(
                                "Example: We create custom painted watch dials. We need watch model, dial size, artwork theme, client approval, deposit, painting stage, curing, final photos and shipping.",
                                color = Color(0xFF7A7A80)
                            )
                        },
                        shape = RoundedCornerShape(14.dp)
                    )

                    Button(
                        onClick = ::saveSmartTemplate,
                        enabled = !saving,
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFCC2FE1), contentColor = Color.White),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Text(if (saving) "Saving..." else "Smart Customize", fontWeight = FontWeight.Black, fontSize = 17.sp)
                    }
                    Button(
                        onClick = ::saveStandardTemplate,
                        enabled = !saving,
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1D2A38), contentColor = StudioBlue),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Text("Use Standard Template", fontWeight = FontWeight.Black, fontSize = 17.sp)
                    }
                    TextButton(
                        onClick = ::skipSetup,
                        enabled = !saving,
                        modifier = Modifier.align(Alignment.CenterHorizontally)
                    ) {
                        Text("Skip for now", color = Color(0xFF9D9DA3), fontWeight = FontWeight.Black)
                    }
                }
            }

            Text(
                "You can change this later from Settings > Workflow > Business Type.",
                color = Color(0xFF9D9DA3),
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

// Localized business-description seeds: language name -> business type -> seed
// text. "_default" is the generic placeholder for that language. Keyed by the
// same language names the rest of the app uses (LocalStudioLanguage).
private val businessPromptSeeds: Map<String, Map<String, String>> = mapOf(
    "English" to mapOf(
        "Custom Art Studio" to "We create custom artwork commissions. We need customer details, design theme, reference images, approval stages, deposit, production stages, final review and shipping.",
        "Freelancer / Designer" to "We deliver design and freelance projects. We need project brief, scope, reference files, revision rounds, client approval, deadline, final files and balance payment.",
        "Repair Service" to "We repair customer items. We need model, serial number, issue reported, diagnostics, quote approval, parts order, repair, testing and collection or shipping.",
        "Handmade Products" to "We make custom products. We need product type, size, colour, material, customer approval, production, packaging, shipping and balance payment.",
        "Photography Studio" to "We manage photo shoots. We need client details, shoot type, location, date, package, booking deposit, selection, editing, delivery and follow-up notes.",
        "Tailor / Alteration Studio" to "We tailor and alter garments. We need garment type, measurements, fabric details, fitting appointments, alteration notes, deposit, final fitting and collection date.",
        "Jewellery Studio" to "We create custom jewellery. We need metal, stone, size, design sketch, customer approval, deposit, casting, setting, polishing, quality check and delivery.",
        "Agency / Creative Studio" to "We run creative client projects. We need project brief, deliverables, timeline, team assignment, draft versions, client feedback rounds, approval, launch and invoicing.",
        "Food / Bakery / Catering" to "We prepare custom food orders. We need event date, servings, flavours, dietary notes, design reference, deposit, preparation, decoration and delivery or pickup.",
        "Beauty / Clinic / Wellness" to "We manage client appointments and treatments. We need client details, treatment type, consultation notes, appointment date, payment, aftercare and follow-up reminders.",
        "Consultancy / Professional Service" to "We deliver consultancy engagements. We need client details, scope, proposal, contract, milestones, meetings, deliverables, review and invoicing.",
        "General Small Business" to "We handle customer orders. We need customer details, order items, pricing, deposit, preparation, quality check, delivery or pickup and balance payment.",
        "_default" to "Describe this business here, including customer information needed, workflow stages, approval steps, materials, shipping, appointments, deposits and delivery."
    ),
    "Türkçe" to mapOf(
        "Custom Art Studio" to "Özel sanat çalışmaları/komisyonlar üretiyoruz. Müşteri bilgileri, tasarım teması, referans görseller, onay aşamaları, depozito, üretim aşamaları, son değerlendirme ve kargo gerekiyor.",
        "Freelancer / Designer" to "Tasarım ve serbest çalışma projeleri teslim ediyoruz. Proje özeti, kapsam, referans dosyalar, revizyon turları, müşteri onayı, teslim tarihi, son dosyalar ve bakiye ödemesi gerekiyor.",
        "Repair Service" to "Müşteri ürünlerini tamir ediyoruz. Model, seri numarası, bildirilen sorun, arıza tespiti, fiyat onayı, parça siparişi, tamir, test ve teslim alma veya kargo gerekiyor.",
        "Handmade Products" to "Özel ürünler yapıyoruz. Ürün türü, ölçü, renk, malzeme, müşteri onayı, üretim, paketleme, kargo ve bakiye ödemesi gerekiyor.",
        "Photography Studio" to "Fotoğraf çekimleri yönetiyoruz. Müşteri bilgileri, çekim türü, lokasyon, tarih, paket, rezervasyon depozitosu, seçim, düzenleme, teslimat ve takip notları gerekiyor.",
        "Tailor / Alteration Studio" to "Kıyafet dikiyor ve tadilat yapıyoruz. Kıyafet türü, ölçüler, kumaş bilgileri, prova randevuları, tadilat notları, depozito, son prova ve teslim alma tarihi gerekiyor.",
        "Jewellery Studio" to "Özel takı üretiyoruz. Metal, taş, ölçü, tasarım çizimi, müşteri onayı, depozito, döküm, taş kakma, parlatma, kalite kontrol ve teslimat gerekiyor.",
        "Agency / Creative Studio" to "Yaratıcı müşteri projeleri yürütüyoruz. Proje özeti, çıktılar, zaman planı, ekip ataması, taslak sürümleri, müşteri geri bildirim turları, onay, lansman ve faturalama gerekiyor.",
        "Food / Bakery / Catering" to "Özel yemek siparişleri hazırlıyoruz. Etkinlik tarihi, kişi sayısı, lezzetler, diyet notları, tasarım referansı, depozito, hazırlık, süsleme ve teslimat veya teslim alma gerekiyor.",
        "Beauty / Clinic / Wellness" to "Müşteri randevularını ve uygulamaları yönetiyoruz. Müşteri bilgileri, uygulama türü, danışma notları, randevu tarihi, ödeme, bakım sonrası ve takip hatırlatmaları gerekiyor.",
        "Consultancy / Professional Service" to "Danışmanlık hizmetleri sunuyoruz. Müşteri bilgileri, kapsam, teklif, sözleşme, kilometre taşları, toplantılar, çıktılar, değerlendirme ve faturalama gerekiyor.",
        "General Small Business" to "Müşteri siparişlerini yönetiyoruz. Müşteri bilgileri, sipariş kalemleri, fiyatlandırma, depozito, hazırlık, kalite kontrol, teslimat veya teslim alma ve bakiye ödemesi gerekiyor.",
        "_default" to "Bu işi burada anlatın: müşteriden gereken bilgiler, iş akışı aşamaları, onay adımları, malzemeler, kargo, randevular, depozitolar ve teslimat süreçleri."
    ),
    "Deutsch" to mapOf(
        "Custom Art Studio" to "Wir erstellen individuelle Kunstwerke für Kundinnen und Kunden. Wichtig sind Referenzen, Konzeptfreigabe, Materialien, Produktionsschritte, Prüfung, finale Freigabe und Lieferung.",
        "Freelancer / Designer" to "Wir liefern Design- und Freelance-Projekte. Wir benötigen Projektbriefing, Umfang, Referenzdateien, Korrekturrunden, Kundenfreigabe, Termin, finale Dateien und Restzahlung.",
        "Repair Service" to "Wir reparieren Kundenartikel. Wir benötigen Modell, Seriennummer, Fehlerbeschreibung, Diagnose, Ersatzteile, Kundenfreigabe, Reparatur, Test, Garantiehinweise und Abholung oder Versand.",
        "Handmade Products" to "Wir fertigen individuelle Produkte. Wir benötigen Produktart, Größe, Farbe, Material, Kundenfreigabe, Produktion, Verpackung, Versand und Restzahlung.",
        "Photography Studio" to "Wir organisieren Fotoshootings. Wir benötigen Shooting-Art, Ort, Datum, Paket, Vertrag, Anzahlung, Shooting, Bearbeitung, Retusche und digitale Lieferung.",
        "Tailor / Alteration Studio" to "Wir schneidern und ändern Kleidung. Wir benötigen Kleidungsart, Maße, Stoffdetails, Anprobetermine, Änderungsnotizen, Anzahlung, finale Anprobe und Abholdatum.",
        "Jewellery Studio" to "Wir fertigen individuellen Schmuck. Wir benötigen Metall, Stein, Größe, Designskizze, Kundenfreigabe, Anzahlung, Guss, Fassung, Politur, Qualitätskontrolle und Lieferung.",
        "Agency / Creative Studio" to "Wir betreuen kreative Kundenprojekte. Wir benötigen Projektbriefing, Liefergegenstände, Zeitplan, Teamzuweisung, Entwurfsversionen, Feedbackrunden, Freigabe, Launch und Rechnungsstellung.",
        "Food / Bakery / Catering" to "Wir bereiten individuelle Essensbestellungen zu. Wir benötigen Veranstaltungsdatum, Portionen, Geschmacksrichtungen, Ernährungshinweise, Designreferenz, Anzahlung, Zubereitung, Dekoration und Lieferung oder Abholung.",
        "Beauty / Clinic / Wellness" to "Wir verwalten Kundentermine und Behandlungen. Wir benötigen Kundendaten, Behandlungsart, Beratungsnotizen, Termin, Zahlung, Nachsorge und Folgeerinnerungen.",
        "Consultancy / Professional Service" to "Wir erbringen Beratungsleistungen. Wir benötigen Kundendaten, Umfang, Angebot, Vertrag, Meilensteine, Meetings, Liefergegenstände, Prüfung und Rechnungsstellung.",
        "General Small Business" to "Wir bearbeiten Kundenbestellungen. Wir benötigen Kundendaten, Bestellpositionen, Preise, Anzahlung, Vorbereitung, Qualitätskontrolle, Lieferung oder Abholung und Restzahlung.",
        "_default" to "Beschreiben Sie dieses Geschäft: benötigte Kundendaten, Workflow-Schritte, Freigaben, Materialien, Versand, Termine, Anzahlungen und Lieferung."
    ),
    "Français" to mapOf(
        "Custom Art Studio" to "Nous créons des œuvres personnalisées pour les clients. Nous avons besoin de références, validation du concept, matériaux, étapes de production, revue, validation finale et livraison.",
        "Freelancer / Designer" to "Nous réalisons des projets de design et freelance. Nous avons besoin du brief, du périmètre, des fichiers de référence, des cycles de révision, de la validation client, de l'échéance, des fichiers finaux et du solde.",
        "Repair Service" to "Nous réparons des articles clients. Nous avons besoin du modèle, numéro de série, description du problème, diagnostic, pièces, validation client, réparation, test, garantie et retrait ou expédition.",
        "Handmade Products" to "Nous fabriquons des produits personnalisés. Nous avons besoin du type de produit, taille, couleur, matériau, validation client, production, emballage, expédition et solde.",
        "Photography Studio" to "Nous gérons des séances photo. Nous avons besoin du type de séance, lieu, date, forfait, contrat, acompte, prise de vue, édition, retouche et livraison numérique.",
        "Tailor / Alteration Studio" to "Nous confectionnons et retouchons des vêtements. Nous avons besoin du type de vêtement, mesures, détails du tissu, rendez-vous d'essayage, notes de retouche, acompte, essayage final et date de retrait.",
        "Jewellery Studio" to "Nous créons des bijoux personnalisés. Nous avons besoin du métal, pierre, taille, croquis, validation client, acompte, fonte, sertissage, polissage, contrôle qualité et livraison.",
        "Agency / Creative Studio" to "Nous menons des projets créatifs clients. Nous avons besoin du brief, des livrables, du planning, de l'attribution d'équipe, des versions de brouillon, des retours client, de la validation, du lancement et de la facturation.",
        "Food / Bakery / Catering" to "Nous préparons des commandes alimentaires personnalisées. Nous avons besoin de la date de l'événement, du nombre de parts, des saveurs, des notes diététiques, de la référence de design, de l'acompte, de la préparation, de la décoration et de la livraison ou du retrait.",
        "Beauty / Clinic / Wellness" to "Nous gérons les rendez-vous et soins clients. Nous avons besoin des informations client, du type de soin, des notes de consultation, de la date de rendez-vous, du paiement, des soins post et des rappels de suivi.",
        "Consultancy / Professional Service" to "Nous réalisons des missions de conseil. Nous avons besoin des informations client, du périmètre, de la proposition, du contrat, des jalons, des réunions, des livrables, de la revue et de la facturation.",
        "General Small Business" to "Nous traitons les commandes clients. Nous avons besoin des informations client, des articles, du tarif, de l'acompte, de la préparation, du contrôle qualité, de la livraison ou du retrait et du solde.",
        "_default" to "Décrivez l’activité ici : informations client nécessaires, étapes du workflow, validations, matériaux, expédition, rendez-vous, acomptes et livraison."
    ),
    "Italiano" to mapOf(
        "Custom Art Studio" to "Creiamo opere d’arte personalizzate per i clienti. Servono riferimenti, approvazione del concept, materiali, fasi di produzione, revisione, approvazione finale e consegna.",
        "Freelancer / Designer" to "Realizziamo progetti di design e freelance. Servono brief, ambito, file di riferimento, cicli di revisione, approvazione del cliente, scadenza, file finali e saldo.",
        "Repair Service" to "Ripariamo articoli dei clienti. Servono modello, numero di serie, descrizione del problema, diagnosi, pezzi, approvazione del cliente, riparazione, test, garanzia e ritiro o spedizione.",
        "Handmade Products" to "Realizziamo prodotti personalizzati. Servono tipo di prodotto, taglia, colore, materiale, approvazione del cliente, produzione, imballaggio, spedizione e saldo.",
        "Photography Studio" to "Gestiamo servizi fotografici. Servono tipo di shooting, luogo, data, pacchetto, contratto, deposito, shooting, editing, ritocco e consegna digitale.",
        "Tailor / Alteration Studio" to "Confezioniamo e modifichiamo capi. Servono tipo di capo, misure, dettagli del tessuto, appuntamenti di prova, note di modifica, acconto, prova finale e data di ritiro.",
        "Jewellery Studio" to "Creiamo gioielli personalizzati. Servono metallo, pietra, misura, bozzetto, approvazione del cliente, acconto, fusione, incastonatura, lucidatura, controllo qualità e consegna.",
        "Agency / Creative Studio" to "Gestiamo progetti creativi per i clienti. Servono brief, deliverable, tempistiche, assegnazione del team, bozze, cicli di feedback, approvazione, lancio e fatturazione.",
        "Food / Bakery / Catering" to "Prepariamo ordini alimentari personalizzati. Servono data dell'evento, porzioni, gusti, note dietetiche, riferimento del design, acconto, preparazione, decorazione e consegna o ritiro.",
        "Beauty / Clinic / Wellness" to "Gestiamo appuntamenti e trattamenti dei clienti. Servono dati del cliente, tipo di trattamento, note di consulenza, data dell'appuntamento, pagamento, post-trattamento e promemoria di follow-up.",
        "Consultancy / Professional Service" to "Forniamo servizi di consulenza. Servono dati del cliente, ambito, proposta, contratto, milestone, riunioni, deliverable, revisione e fatturazione.",
        "General Small Business" to "Gestiamo gli ordini dei clienti. Servono dati del cliente, articoli, prezzi, acconto, preparazione, controllo qualità, consegna o ritiro e saldo.",
        "_default" to "Descrivi qui l’attività: informazioni cliente necessarie, fasi del workflow, approvazioni, materiali, spedizione, appuntamenti, depositi e consegna."
    ),
    "Español (Spanish)" to mapOf(
        "Custom Art Studio" to "Creamos obras personalizadas para clientes. Necesitamos referencias, aprobación del concepto, materiales, etapas de producción, revisión, aprobación final y entrega.",
        "Freelancer / Designer" to "Realizamos proyectos de diseño y freelance. Necesitamos brief, alcance, archivos de referencia, rondas de revisión, aprobación del cliente, fecha límite, archivos finales y pago restante.",
        "Repair Service" to "Reparamos artículos de clientes. Necesitamos modelo, número de serie, descripción del problema, diagnóstico, piezas, aprobación del cliente, reparación, pruebas, garantía y recogida o envío.",
        "Handmade Products" to "Fabricamos productos personalizados. Necesitamos tipo de producto, talla, color, material, aprobación del cliente, producción, empaquetado, envío y pago restante.",
        "Photography Studio" to "Gestionamos sesiones fotográficas. Necesitamos tipo de sesión, ubicación, fecha, paquete, contrato, depósito, sesión, edición, retoque y entrega digital.",
        "Tailor / Alteration Studio" to "Confeccionamos y arreglamos prendas. Necesitamos tipo de prenda, medidas, detalles de la tela, citas de prueba, notas de arreglo, depósito, prueba final y fecha de recogida.",
        "Jewellery Studio" to "Creamos joyas personalizadas. Necesitamos metal, piedra, talla, boceto, aprobación del cliente, depósito, fundición, engaste, pulido, control de calidad y entrega.",
        "Agency / Creative Studio" to "Llevamos proyectos creativos de clientes. Necesitamos brief, entregables, cronograma, asignación de equipo, versiones de borrador, rondas de feedback, aprobación, lanzamiento y facturación.",
        "Food / Bakery / Catering" to "Preparamos pedidos de comida personalizados. Necesitamos fecha del evento, raciones, sabores, notas dietéticas, referencia de diseño, depósito, preparación, decoración y entrega o recogida.",
        "Beauty / Clinic / Wellness" to "Gestionamos citas y tratamientos de clientes. Necesitamos datos del cliente, tipo de tratamiento, notas de consulta, fecha de la cita, pago, cuidados posteriores y recordatorios de seguimiento.",
        "Consultancy / Professional Service" to "Prestamos servicios de consultoría. Necesitamos datos del cliente, alcance, propuesta, contrato, hitos, reuniones, entregables, revisión y facturación.",
        "General Small Business" to "Gestionamos los pedidos de clientes. Necesitamos datos del cliente, artículos, precios, depósito, preparación, control de calidad, entrega o recogida y pago restante.",
        "_default" to "Describe este negocio: información necesaria del cliente, etapas del workflow, aprobaciones, materiales, envío, citas, depósitos y entrega."
    ),
    "Português" to mapOf(
        "Custom Art Studio" to "Criamos obras personalizadas para clientes. Precisamos de referências, aprovação do conceito, materiais, etapas de produção, revisão, aprovação final e entrega.",
        "Freelancer / Designer" to "Realizamos projetos de design e freelance. Precisamos de brief, âmbito, ficheiros de referência, rondas de revisão, aprovação do cliente, prazo, ficheiros finais e pagamento restante.",
        "Repair Service" to "Reparamos artigos de clientes. Precisamos de modelo, número de série, descrição do problema, diagnóstico, peças, aprovação do cliente, reparação, teste, garantia e recolha ou envio.",
        "Handmade Products" to "Fazemos produtos personalizados. Precisamos de tipo de produto, tamanho, cor, material, aprovação do cliente, produção, embalagem, envio e pagamento restante.",
        "Photography Studio" to "Gerimos sessões fotográficas. Precisamos do tipo de sessão, local, data, pacote, contrato, depósito, sessão, edição, retoque e entrega digital.",
        "Tailor / Alteration Studio" to "Confecionamos e ajustamos roupas. Precisamos do tipo de peça, medidas, detalhes do tecido, marcações de prova, notas de ajuste, depósito, prova final e data de recolha.",
        "Jewellery Studio" to "Criamos joias personalizadas. Precisamos de metal, pedra, tamanho, esboço, aprovação do cliente, depósito, fundição, cravação, polimento, controlo de qualidade e entrega.",
        "Agency / Creative Studio" to "Gerimos projetos criativos de clientes. Precisamos de brief, entregáveis, cronograma, atribuição de equipa, versões de rascunho, rondas de feedback, aprovação, lançamento e faturação.",
        "Food / Bakery / Catering" to "Preparamos encomendas de comida personalizadas. Precisamos da data do evento, doses, sabores, notas dietéticas, referência de design, depósito, preparação, decoração e entrega ou recolha.",
        "Beauty / Clinic / Wellness" to "Gerimos marcações e tratamentos de clientes. Precisamos dos dados do cliente, tipo de tratamento, notas de consulta, data da marcação, pagamento, cuidados pós e lembretes de acompanhamento.",
        "Consultancy / Professional Service" to "Prestamos serviços de consultoria. Precisamos dos dados do cliente, âmbito, proposta, contrato, marcos, reuniões, entregáveis, revisão e faturação.",
        "General Small Business" to "Gerimos as encomendas dos clientes. Precisamos dos dados do cliente, artigos, preços, depósito, preparação, controlo de qualidade, entrega ou recolha e pagamento restante.",
        "_default" to "Descreva este negócio: informações do cliente, etapas do workflow, aprovações, materiais, envio, marcações, depósitos e entrega."
    ),
    "Русский (Russian)" to mapOf(
        "Custom Art Studio" to "Мы создаём индивидуальные художественные работы для клиентов. Нужны референсы, утверждение концепции, материалы, этапы производства, проверка, финальное утверждение и доставка.",
        "Freelancer / Designer" to "Мы выполняем дизайн- и фриланс-проекты. Нужны бриф, объём работ, референс-файлы, раунды правок, утверждение клиента, срок, финальные файлы и остаток оплаты.",
        "Repair Service" to "Мы ремонтируем вещи клиентов. Нужны модель, серийный номер, описание проблемы, диагностика, запчасти, согласование стоимости, ремонт, тестирование, гарантия и самовывоз или доставка.",
        "Handmade Products" to "Мы изготавливаем индивидуальные изделия. Нужны тип изделия, размер, цвет, материал, утверждение клиента, производство, упаковка, доставка и остаток оплаты.",
        "Photography Studio" to "Мы проводим фотосессии. Нужны тип съёмки, локация, дата, пакет, договор, предоплата, съёмка, обработка, ретушь и цифровая доставка.",
        "Tailor / Alteration Studio" to "Мы шьём и подгоняем одежду. Нужны тип изделия, мерки, детали ткани, примерки, заметки по переделке, предоплата, финальная примерка и дата выдачи.",
        "Jewellery Studio" to "Мы создаём индивидуальные украшения. Нужны металл, камень, размер, эскиз, утверждение клиента, предоплата, литьё, закрепка, полировка, контроль качества и доставка.",
        "Agency / Creative Studio" to "Мы ведём креативные проекты клиентов. Нужны бриф, результаты, график, распределение команды, версии черновиков, раунды правок, утверждение, запуск и выставление счёта.",
        "Food / Bakery / Catering" to "Мы готовим индивидуальные заказы еды. Нужны дата мероприятия, число порций, вкусы, диетические пометки, референс дизайна, предоплата, приготовление, оформление и доставка или самовывоз.",
        "Beauty / Clinic / Wellness" to "Мы ведём записи и процедуры клиентов. Нужны данные клиента, тип процедуры, заметки консультации, дата записи, оплата, постуход и напоминания о визите.",
        "Consultancy / Professional Service" to "Мы оказываем консалтинговые услуги. Нужны данные клиента, объём, предложение, договор, этапы, встречи, результаты, проверка и выставление счёта.",
        "General Small Business" to "Мы обрабатываем заказы клиентов. Нужны данные клиента, позиции заказа, цены, предоплата, подготовка, контроль качества, доставка или самовывоз и остаток оплаты.",
        "_default" to "Опишите бизнес: какие данные нужны от клиента, этапы работы, согласования, материалы, доставка, встречи, предоплаты и финальная выдача."
    ),
    "日本語 (Japanese)" to mapOf(
        "Custom Art Studio" to "お客様向けにカスタムアートを制作します。参考資料、コンセプト承認、材料、制作工程、確認、最終承認、納品が重要です。",
        "Freelancer / Designer" to "デザイン・フリーランス案件を納品します。ブリーフ、範囲、参考ファイル、修正回数、クライアント承認、納期、最終ファイル、残金が必要です。",
        "Repair Service" to "お客様の品物を修理します。モデル、シリアル番号、不具合内容、診断、部品注文、顧客承認、修理、テスト、保証、受け取りまたは配送が必要です。",
        "Handmade Products" to "カスタム製品を作ります。製品タイプ、サイズ、色、素材、顧客承認、製作、梱包、配送、残金が必要です。",
        "Photography Studio" to "写真撮影を管理します。撮影タイプ、場所、日付、プラン、契約、前金、撮影、編集、レタッチ、デジタル納品が必要です。",
        "Tailor / Alteration Studio" to "衣服の仕立てと直しを行います。衣服タイプ、採寸、生地の詳細、フィッティング予約、直しメモ、前金、最終フィッティング、受け取り日が必要です。",
        "Jewellery Studio" to "カスタムジュエリーを制作します。金属、石、サイズ、デザイン画、顧客承認、前金、鋳造、石留め、研磨、品質チェック、納品が必要です。",
        "Agency / Creative Studio" to "クリエイティブな案件を進めます。ブリーフ、成果物、スケジュール、チーム割り当て、ドラフト版、フィードバック、承認、ローンチ、請求が必要です。",
        "Food / Bakery / Catering" to "カスタムフードの注文を準備します。イベント日、人数、フレーバー、食事制限メモ、デザイン参考、前金、調理、デコレーション、配送または受け取りが必要です。",
        "Beauty / Clinic / Wellness" to "お客様の予約と施術を管理します。顧客情報、施術タイプ、カウンセリングメモ、予約日、支払い、アフターケア、フォローアップのリマインドが必要です。",
        "Consultancy / Professional Service" to "コンサルティング業務を提供します。顧客情報、範囲、提案、契約、マイルストーン、打ち合わせ、成果物、レビュー、請求が必要です。",
        "General Small Business" to "お客様の注文を処理します。顧客情報、注文項目、価格、前金、準備、品質チェック、配送または受け取り、残金が必要です。",
        "_default" to "このビジネスを説明してください。必要な顧客情報、ワークフロー、承認、材料、配送、予約、前金、納品について書いてください。"
    ),
    "中文 (Chinese)" to mapOf(
        "Custom Art Studio" to "我们为客户制作定制艺术作品。需要参考资料、概念确认、材料、制作阶段、审核、最终确认和交付。",
        "Freelancer / Designer" to "我们交付设计与自由职业项目。需要项目简报、范围、参考文件、修改轮次、客户确认、截止日期、最终文件和尾款。",
        "Repair Service" to "我们维修客户物品。需要型号、序列号、问题描述、诊断、零件订购、客户确认、维修、测试、保修说明以及取件或配送。",
        "Handmade Products" to "我们制作定制产品。需要产品类型、尺寸、颜色、材料、客户确认、生产、包装、配送和尾款。",
        "Photography Studio" to "我们管理摄影拍摄。需要拍摄类型、地点、日期、套餐、合同、定金、拍摄、编辑、修图和数字交付。",
        "Tailor / Alteration Studio" to "我们裁制和修改服装。需要服装类型、尺寸、面料细节、试衣预约、修改备注、定金、最终试衣和取件日期。",
        "Jewellery Studio" to "我们制作定制珠宝。需要金属、宝石、尺寸、设计草图、客户确认、定金、铸造、镶嵌、抛光、质检和交付。",
        "Agency / Creative Studio" to "我们承接创意客户项目。需要项目简报、交付物、时间表、团队分配、草稿版本、反馈轮次、确认、上线和开票。",
        "Food / Bakery / Catering" to "我们准备定制餐饮订单。需要活动日期、份数、口味、饮食备注、设计参考、定金、制作、装饰和配送或自取。",
        "Beauty / Clinic / Wellness" to "我们管理客户预约和护理。需要客户信息、护理类型、咨询备注、预约日期、付款、术后护理和回访提醒。",
        "Consultancy / Professional Service" to "我们提供咨询服务。需要客户信息、范围、方案、合同、里程碑、会议、交付物、评审和开票。",
        "General Small Business" to "我们处理客户订单。需要客户信息、订单项目、价格、定金、准备、质检、配送或自取和尾款。",
        "_default" to "请描述此业务，包括所需客户信息、工作流程阶段、确认步骤、材料、配送、预约、定金和交付。"
    ),
    "العربية (Arabic)" to mapOf(
        "Custom Art Studio" to "ننشئ أعمالاً فنية مخصصة للعملاء. نحتاج إلى مراجع، موافقة على الفكرة، مواد، مراحل إنتاج، مراجعة، موافقة نهائية وتسليم.",
        "Freelancer / Designer" to "ننفذ مشاريع تصميم وعمل حر. نحتاج إلى الموجز، النطاق، ملفات المرجع، جولات التعديل، موافقة العميل، الموعد النهائي، الملفات النهائية والدفعة المتبقية.",
        "Repair Service" to "نصلح أغراض العملاء. نحتاج إلى الموديل، الرقم التسلسلي، وصف المشكلة، التشخيص، طلب القطع، موافقة العميل، الإصلاح، الاختبار، الضمان والاستلام أو الشحن.",
        "Handmade Products" to "نصنع منتجات مخصصة. نحتاج إلى نوع المنتج، المقاس، اللون، الخامة، موافقة العميل، الإنتاج، التغليف، الشحن والدفعة المتبقية.",
        "Photography Studio" to "ندير جلسات تصوير. نحتاج إلى نوع الجلسة، الموقع، التاريخ، الباقة، العقد، العربون، التصوير، التحرير، التنقيح والتسليم الرقمي.",
        "Tailor / Alteration Studio" to "نخيط ونعدّل الملابس. نحتاج إلى نوع القطعة، المقاسات، تفاصيل القماش، مواعيد القياس، ملاحظات التعديل، العربون، القياس النهائي وتاريخ الاستلام.",
        "Jewellery Studio" to "نصنع مجوهرات مخصصة. نحتاج إلى المعدن، الحجر، المقاس، رسم التصميم، موافقة العميل، العربون، السباكة، التركيب، التلميع، فحص الجودة والتسليم.",
        "Agency / Creative Studio" to "ندير مشاريع إبداعية للعملاء. نحتاج إلى الموجز، المخرجات، الجدول الزمني، توزيع الفريق، نسخ المسودة، جولات الملاحظات، الموافقة، الإطلاق والفوترة.",
        "Food / Bakery / Catering" to "نحضّر طلبات طعام مخصصة. نحتاج إلى تاريخ المناسبة، عدد الحصص، النكهات، ملاحظات غذائية، مرجع التصميم، العربون، التحضير، التزيين والتسليم أو الاستلام.",
        "Beauty / Clinic / Wellness" to "ندير مواعيد وعلاجات العملاء. نحتاج إلى بيانات العميل، نوع العلاج، ملاحظات الاستشارة، تاريخ الموعد، الدفع، العناية اللاحقة وتذكيرات المتابعة.",
        "Consultancy / Professional Service" to "نقدّم خدمات استشارية. نحتاج إلى بيانات العميل، النطاق، العرض، العقد، المراحل، الاجتماعات، المخرجات، المراجعة والفوترة.",
        "General Small Business" to "نعالج طلبات العملاء. نحتاج إلى بيانات العميل، عناصر الطلب، الأسعار، العربون، التحضير، فحص الجودة، التسليم أو الاستلام والدفعة المتبقية.",
        "_default" to "صف هذا النشاط هنا: معلومات العميل المطلوبة، مراحل العمل، الموافقات، المواد، الشحن، المواعيد، العربون والتسليم."
    ),
    "हिन्दी (Hindi)" to mapOf(
        "Custom Art Studio" to "हम ग्राहकों के लिए कस्टम आर्टवर्क बनाते हैं। हमें रेफरेंस, कॉन्सेप्ट approval, सामग्री, production stages, review, final approval और delivery चाहिए।",
        "Freelancer / Designer" to "हम design और freelance projects deliver करते हैं। हमें brief, scope, reference files, revision rounds, client approval, deadline, final files और balance payment चाहिए।",
        "Repair Service" to "हम ग्राहक के items repair करते हैं। हमें model, serial number, issue, diagnostics, parts order, customer approval, repair, testing, warranty और pickup या shipping चाहिए।",
        "Handmade Products" to "हम custom products बनाते हैं। हमें product type, size, colour, material, customer approval, production, packaging, shipping और balance payment चाहिए।",
        "Photography Studio" to "हम photo shoots manage करते हैं। हमें shoot type, location, date, package, contract, deposit, shooting, editing, retouching और digital delivery चाहिए।",
        "Tailor / Alteration Studio" to "हम कपड़े सिलते और alter करते हैं। हमें garment type, measurements, fabric details, fitting appointments, alteration notes, deposit, final fitting और collection date चाहिए।",
        "Jewellery Studio" to "हम custom jewellery बनाते हैं। हमें metal, stone, size, design sketch, customer approval, deposit, casting, setting, polishing, quality check और delivery चाहिए।",
        "Agency / Creative Studio" to "हम creative client projects चलाते हैं। हमें brief, deliverables, timeline, team assignment, draft versions, feedback rounds, approval, launch और invoicing चाहिए।",
        "Food / Bakery / Catering" to "हम custom food orders तैयार करते हैं। हमें event date, servings, flavours, dietary notes, design reference, deposit, preparation, decoration और delivery या pickup चाहिए।",
        "Beauty / Clinic / Wellness" to "हम client appointments और treatments manage करते हैं। हमें client details, treatment type, consultation notes, appointment date, payment, aftercare और follow-up reminders चाहिए।",
        "Consultancy / Professional Service" to "हम consultancy services देते हैं। हमें client details, scope, proposal, contract, milestones, meetings, deliverables, review और invoicing चाहिए।",
        "General Small Business" to "हम customer orders संभालते हैं। हमें customer details, order items, pricing, deposit, preparation, quality check, delivery या pickup और balance payment चाहिए।",
        "_default" to "इस business को यहाँ describe करें: customer information, workflow stages, approval steps, materials, shipping, appointments, deposits और delivery."
    )
)

internal fun onboardingPromptSeed(type: String, language: String = "English"): String {
    if (type == "Other / Prompt Based") return ""
    val english = businessPromptSeeds.getValue("English")
    val table = businessPromptSeeds[language] ?: english
    return table[type] ?: english[type] ?: table["_default"] ?: english.getValue("_default")
}

internal val onboardingBusinessTypeNames = listOf(
    "Custom Art Studio",
    "Freelancer / Designer",
    "Repair Service",
    "Handmade Products",
    "Photography Studio",
    "Tailor / Alteration Studio",
    "Jewellery Studio",
    "Agency / Creative Studio",
    "Food / Bakery / Catering",
    "Beauty / Clinic / Wellness",
    "Consultancy / Professional Service",
    "General Small Business"
)

private val onboardingDefaultModelPrompt = uk.co.eggcraft.studioflow.data.model.StudioWorkspaceSettings().businessDescriptionPrompt

internal fun isOnboardingPromptSeed(prompt: String): Boolean {
    val trimmed = prompt.trim()
    if (trimmed.isEmpty()) return true
    // Counts as an auto-seed (safe to refresh) if it matches any industry's seed
    // — or generic default — in any supported language.
    return businessPromptSeeds.values.any { table -> table.values.any { it == trimmed } }
}

@Composable
private fun StudioSectionContent(
    activeSection: StudioSection?,
    ordersResetToListKey: Int = 0,
    state: StudioFlowUiState,
    requireDeviceUnlock: Boolean,
    onSetRequireDeviceUnlock: (Boolean) -> Unit,
    onSignOut: () -> Unit,
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
    onRestoreOrder: (StudioOrder) -> Unit,
    focusedCustomerName: String,
    onOpenCustomerFromOrder: (StudioOrder) -> Unit,
    onCreateOrder: () -> Unit,
    onCreateCustomer: (String, String, String, String, String, String, String, String, String) -> Unit,
    onUpdateCustomer: (StudioCustomer) -> Unit,
    onUpdateCustomerPrefs: (StudioCustomer, StudioCustomerPrefsPatch) -> Unit = { _, _ -> },
    onResyncCustomer: (StudioCustomer) -> Unit,
    onUploadCustomerPhoto: (StudioCustomer, ByteArray, String) -> Unit,
    onDeleteCustomer: (String) -> Unit,
    onOpenOrderFromFiles: (StudioOrder) -> Unit,
    settingsInitialSectionKey: String?,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit,
    onUpdateWorkspaceBillingPlan: (StudioBillingPlan) -> Unit,
    googlePlanOffers: List<StudioGooglePlanOffer> = emptyList(),
    googleStorageOffers: List<StudioGoogleStorageOffer> = emptyList(),
    googleBillingPurchasing: Boolean = false,
    onLoadGooglePlayProducts: () -> Unit = {},
    onPurchaseGooglePlan: (android.app.Activity, StudioGooglePlanOffer) -> Unit = { _, _ -> },
    onPurchaseGoogleStorageAddon: (android.app.Activity, StudioGoogleStorageOffer) -> Unit = { _, _ -> },
    onRestoreGooglePlayPurchases: () -> Unit = {},
    onRecalculateFinancialSettings: (Map<String, Any?>) -> Unit,
    onUpdateAccountProfile: (String, String) -> Unit,
    onUploadAccountAvatar: (ByteArray, String) -> Unit,
    onRemoveAccountAvatar: () -> Unit,
    onUploadWorkspaceLogo: (ByteArray, String, Boolean) -> Unit,
    onRemoveWorkspaceLogo: () -> Unit,
    onChangeAccountEmail: (String) -> Unit,
    onSendPasswordResetEmail: () -> Unit,
    onRequestWorkspaceAccess: (String) -> Unit,
    onSwitchWorkspace: (String) -> Unit,
    onApproveJoinRequest: (StudioJoinRequest, String) -> Unit,
    onDeclineJoinRequest: (StudioJoinRequest) -> Unit,
    onUpdateTeamMemberRole: (StudioTeamMember, String) -> Unit,
    onUpdateTeamMemberAccess: (StudioTeamMember, WorkspaceMemberAccess) -> Unit,
    onRemoveTeamMember: (StudioTeamMember) -> Unit,
    onSaveCustomRole: (String, String, String, WorkspaceMemberAccess) -> Unit,
    onDeleteCustomRole: (StudioCustomRole) -> Unit,
    onImportBackup: (String) -> Unit,
    onConfirmImportBackup: (Boolean) -> Unit,
    onCancelImportBackup: () -> Unit,
    onDeleteWorkspaceData: () -> Unit,
    onSelectMessageThread: (String) -> Unit,
    onMarkMessageThreadRead: (String) -> Unit,
    onSendMessage: (String, List<String>) -> Unit,
    onSendMessageWithAttachment: (ByteArray, String, String, String, List<String>) -> Unit,
    onEditMessage: (String, String) -> Unit,
    onDeleteMessageForMe: (String) -> Unit,
    onDeleteMessageForEveryone: (String) -> Unit,
    onToggleReaction: (String, String) -> Unit,
    onTogglePin: (String, Boolean) -> Unit,
    onSetReplyingToMessage: (uk.co.eggcraft.studioflow.data.model.StudioMessageItem?) -> Unit,
    onComposerTextChanged: () -> Unit,
    onSetMessageSearchQuery: (String) -> Unit,
    onSetMessageAttachmentFilter: (String) -> Unit,
    onToggleThreadArchive: (String) -> Unit,
    onToggleSavedMessage: (String, String) -> Unit,
    onSetForwardingMessage: (uk.co.eggcraft.studioflow.data.model.StudioMessageItem?) -> Unit,
    onForwardMessageToThread: (String) -> Unit,
    onCreateDirectMessageThread: (String) -> Unit,
    onCreateGroupMessageThread: (List<String>, String) -> Unit,
    onAddMembersToThread: (String, List<String>) -> Unit,
    onRenameThread: (String, String) -> Unit,
    onLeaveThread: (String) -> Unit,
    onSetThreadMute: (String, String) -> Unit,
    onLoadDraft: (String, String) -> String,
    onSaveDraft: (String, String, String) -> Unit,
    onSetActivityNotificationSearch: (String) -> Unit,
    onSetActivityNotificationReadFilter: (String) -> Unit,
    onSetActivityNotificationTypeFilter: (String) -> Unit,
    onMarkActivityNotificationRead: (String) -> Unit,
    onMarkAllActivityNotificationsRead: () -> Unit,
    onDismissActivityNotifications: (List<String>) -> Unit,
    onReviewOrderDeletion: (String, Boolean) -> Unit,
    onOpenActivityNotification: (uk.co.eggcraft.studioflow.data.model.StudioActivityNotification) -> Unit,
    onSetKeepNotesSearch: (String) -> Unit,
    onSetKeepNotesSection: (String) -> Unit,
    onSaveKeepNote: (uk.co.eggcraft.studioflow.data.model.StudioKeepNote) -> Unit,
    onDeleteKeepNote: (String) -> Unit,
    onUploadKeepNoteImage: (uk.co.eggcraft.studioflow.data.model.StudioKeepNote, ByteArray, String, String) -> Unit,
    onInviteKeepCollab: (uk.co.eggcraft.studioflow.data.model.StudioKeepNote, String, String) -> Unit,
    onRemoveKeepCollab: (String, String, String) -> Unit,
    onAcceptKeepInvite: (String) -> Unit,
    onDeclineKeepInvite: (String) -> Unit,
    onRefreshKeepInvites: () -> Unit,
    onSaveMessageWorkspaceSettings: (uk.co.eggcraft.studioflow.data.model.StudioMessageWorkspaceSettings) -> Unit,
    onReloadMessageWorkspaceSettings: () -> Unit,
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Column(modifier = modifier.fillMaxSize()) {
        when (activeSection) {
            StudioSection.Dashboard -> DashboardScreen(
                state = state,
                onUpdateWorkspaceSettings = onUpdateWorkspaceSettings
            )
            StudioSection.Orders -> OrdersScreen(
                state = state,
                onAssignOrder = onAssignOrder,
                onUpdateOrderFields = onUpdateOrderFields,
                onSaveOrderCardLayout = onSaveOrderCardLayout,
                onResetOrderCardLayout = onResetOrderCardLayout,
                onUploadClientFile = onUploadClientFile,
                onUploadPreviewImage = onUploadPreviewImage,
                onRefreshLiveTracking = onRefreshLiveTracking,
                onRenameClientFile = onRenameClientFile,
                onDeleteClientFile = onDeleteClientFile,
                onDeleteOrder = onDeleteOrder,
                onRestoreOrder = onRestoreOrder,
                onOpenCustomerFromOrder = onOpenCustomerFromOrder,
                onUpdateWorkspaceSettings = onUpdateWorkspaceSettings,
                onCreateOrder = onCreateOrder,
                resetToListKey = ordersResetToListKey
            )
            StudioSection.Schedule -> ScheduleScreen(
                state = state,
                onUpdateOrderFields = onUpdateOrderFields,
                onAssignOrder = onAssignOrder,
                onDeleteOrder = onDeleteOrder,
                onOpenCustomerFromOrder = onOpenCustomerFromOrder,
                onUpdateWorkspaceSettings = onUpdateWorkspaceSettings
            )
            StudioSection.TeamSchedule -> uk.co.eggcraft.studioflow.features.schedule.TeamScheduleScreen(
                state = state,
                onUpdateOrderFields = onUpdateOrderFields
            )
            StudioSection.Customers -> CustomersScreen(
                state = state,
                focusedCustomerName = focusedCustomerName,
                onCreateCustomer = onCreateCustomer,
                onUpdateCustomer = onUpdateCustomer,
                onUpdateCustomerPrefs = onUpdateCustomerPrefs,
                onResyncCustomer = onResyncCustomer,
                onUploadCustomerPhoto = onUploadCustomerPhoto,
                onDeleteCustomer = onDeleteCustomer,
                onOpenOrder = onOpenOrderFromFiles
            )
            StudioSection.Files -> uk.co.eggcraft.studioflow.features.files.ClientFilesScreen(
                state = state,
                onUploadClientFile = onUploadClientFile,
                onRenameClientFile = onRenameClientFile,
                onDeleteClientFile = onDeleteClientFile,
                onOpenOrder = onOpenOrderFromFiles
            )
            StudioSection.Notifications -> uk.co.eggcraft.studioflow.features.notifications.NotificationsScreen(
                state = state,
                onSetSearch = onSetActivityNotificationSearch,
                onSetReadFilter = onSetActivityNotificationReadFilter,
                onSetTypeFilter = onSetActivityNotificationTypeFilter,
                onMarkRead = onMarkActivityNotificationRead,
                onMarkAllRead = onMarkAllActivityNotificationsRead,
                onDismiss = onDismissActivityNotifications,
                onReviewOrderDeletion = onReviewOrderDeletion,
                onOpen = onOpenActivityNotification
            )
            StudioSection.Messages -> uk.co.eggcraft.studioflow.features.messages.MessagesScreen(
                state = state,
                onSelectThread = onSelectMessageThread,
                onMarkThreadRead = onMarkMessageThreadRead,
                onSendMessage = onSendMessage,
                onSendMessageWithAttachment = onSendMessageWithAttachment,
                onEditMessage = onEditMessage,
                onDeleteMessageForMe = onDeleteMessageForMe,
                onDeleteMessageForEveryone = onDeleteMessageForEveryone,
                onToggleReaction = onToggleReaction,
                onTogglePin = onTogglePin,
                onSetReplyingToMessage = onSetReplyingToMessage,
                onComposerTextChanged = onComposerTextChanged,
                onSetMessageSearchQuery = onSetMessageSearchQuery,
                onSetMessageAttachmentFilter = onSetMessageAttachmentFilter,
                onToggleThreadArchive = onToggleThreadArchive,
                onToggleSavedMessage = onToggleSavedMessage,
                onSetForwardingMessage = onSetForwardingMessage,
                onForwardMessageToThread = onForwardMessageToThread,
                onCreateDirectMessageThread = onCreateDirectMessageThread,
                onCreateGroupMessageThread = onCreateGroupMessageThread,
                onAddMembersToThread = onAddMembersToThread,
                onRenameThread = onRenameThread,
                onLeaveThread = onLeaveThread,
                onSetThreadMute = onSetThreadMute,
                onLoadDraft = onLoadDraft,
                onSaveDraft = onSaveDraft
            )
            StudioSection.BankSpending -> uk.co.eggcraft.studioflow.features.bank.BankSpendingScreen(state = state)
            StudioSection.Production -> uk.co.eggcraft.studioflow.features.production.ProductionScreen(
                state = state,
                onOpenOrder = { order ->
                    // The board never becomes a second place to edit an order;
                    // it hands off to Orders. The shell already watches this
                    // flow and switches section, so setting it is the whole job.
                    uk.co.eggcraft.studioflow.services.StudioMessageRouteHolder
                        .setPendingOrderRoute(order.id, card = "status")
                }
            )
            StudioSection.Inventory -> uk.co.eggcraft.studioflow.features.inventory.InventoryScreen(state = state)
            StudioSection.Notes -> uk.co.eggcraft.studioflow.features.notes.NotesScreen(
                state = state,
                onSetSearch = onSetKeepNotesSearch,
                onSetSection = onSetKeepNotesSection,
                onSave = onSaveKeepNote,
                onDelete = onDeleteKeepNote,
                onUploadImage = onUploadKeepNoteImage,
                onInviteCollab = onInviteKeepCollab,
                onRemoveCollab = onRemoveKeepCollab,
                onAcceptInvite = onAcceptKeepInvite,
                onDeclineInvite = onDeclineKeepInvite,
                onRefreshInvites = onRefreshKeepInvites,
                onUpdateOrderFields = onUpdateOrderFields
            )
            StudioSection.QuickReply -> QuickReplyScreen(
                state = state,
                onUpdateWorkspaceSettings = onUpdateWorkspaceSettings
            )
            StudioSection.Insights -> uk.co.eggcraft.studioflow.features.settings.AdminInsightsHubScreen()
            StudioSection.Settings -> SettingsScreen(
                state = state,
                initialSectionKey = settingsInitialSectionKey,
                requireDeviceUnlock = requireDeviceUnlock,
                onSetRequireDeviceUnlock = onSetRequireDeviceUnlock,
                onSignOut = onSignOut,
                onUpdateWorkspaceSettings = onUpdateWorkspaceSettings,
                onUpdateWorkspaceBillingPlan = onUpdateWorkspaceBillingPlan,
                googlePlanOffers = googlePlanOffers,
                googleStorageOffers = googleStorageOffers,
                googleBillingPurchasing = googleBillingPurchasing,
                onLoadGooglePlayProducts = onLoadGooglePlayProducts,
                onPurchaseGooglePlan = onPurchaseGooglePlan,
                onPurchaseGoogleStorageAddon = onPurchaseGoogleStorageAddon,
                onRestoreGooglePlayPurchases = onRestoreGooglePlayPurchases,
                onRecalculateFinancialSettings = onRecalculateFinancialSettings,
                onUpdateAccountProfile = onUpdateAccountProfile,
                onUploadAccountAvatar = onUploadAccountAvatar,
                onRemoveAccountAvatar = onRemoveAccountAvatar,
                onUploadWorkspaceLogo = onUploadWorkspaceLogo,
                onRemoveWorkspaceLogo = onRemoveWorkspaceLogo,
                onChangeAccountEmail = onChangeAccountEmail,
                onSendPasswordResetEmail = onSendPasswordResetEmail,
                onRequestWorkspaceAccess = onRequestWorkspaceAccess,
                onSwitchWorkspace = onSwitchWorkspace,
                onApproveJoinRequest = onApproveJoinRequest,
                onDeclineJoinRequest = onDeclineJoinRequest,
                onUpdateTeamMemberRole = onUpdateTeamMemberRole,
                onUpdateTeamMemberAccess = onUpdateTeamMemberAccess,
                onRemoveTeamMember = onRemoveTeamMember,
                onSaveCustomRole = onSaveCustomRole,
                onDeleteCustomRole = onDeleteCustomRole,
                onImportBackup = onImportBackup,
                onConfirmImportBackup = onConfirmImportBackup,
                onCancelImportBackup = onCancelImportBackup,
                onDeleteWorkspaceData = onDeleteWorkspaceData,
                onSaveMessageWorkspaceSettings = onSaveMessageWorkspaceSettings,
                onReloadMessageWorkspaceSettings = onReloadMessageWorkspaceSettings
            )
            null -> NoSectionAccessScreen()
        }
    }
}

@Composable
private fun StudioLargeTopBar(
    workspaceName: String,
    workspaceLogoUrl: String,
    orders: List<StudioOrder>,
    currency: String,
    decimalSeparator: String,
    hideSensitiveNumbers: Boolean,
    showFinancialMetrics: Boolean,
    cloudStatus: HeaderCloudStatus,
    creatingOrder: Boolean,
    sections: List<StudioSection>,
    selectedSection: StudioSection?,
    onSelectSection: (StudioSection) -> Unit,
    onLogoClick: () -> Unit,
    onToggleSensitiveNumbers: () -> Unit,
    onCreateOrder: () -> Unit,
    onOpenAccount: () -> Unit,
    onSignOut: () -> Unit,
    compact: Boolean,
    notificationUnreadCount: Int = 0,
    messageUnreadCount: Int = 0,
    onOpenNotifications: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var menuOpen by rememberSaveable { mutableStateOf(false) }
    val monthMargin = remember(orders) { orders.grossMarginForCurrentMonth() }
    val yearMargin = remember(orders) { orders.grossMarginForCurrentYear() }

    Surface(modifier = modifier, color = MaterialTheme.colorScheme.surface, shadowElevation = 1.dp) {
        // Two rows like the Mac app: header (logo/metrics/actions) on top, the
        // section navigation on its own full-width row below so it never gets
        // squeezed into a narrow horizontally-scrolling strip.
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 10.dp)
        ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            WorkspaceHeaderLogo(
                workspaceName = workspaceName,
                logoUrl = workspaceLogoUrl,
                compact = compact,
                onClick = onLogoClick,
                modifier = Modifier
                    .width(if (compact) 156.dp else 230.dp)
                    .height(if (compact) 42.dp else 52.dp)
            )
            if (showFinancialMetrics) {
                TopMetric(
                    label = "Month Margin",
                    value = formatNetPounds(monthMargin, currency, decimalSeparator, hideSensitiveNumbers),
                    compact = compact
                )
                Surface(
                    modifier = Modifier
                        .width(1.dp)
                        .height(if (compact) 30.dp else 34.dp),
                    color = MaterialTheme.colorScheme.outlineVariant
                ) {}
                TopMetric(
                    label = "Year Margin",
                    value = formatNetPounds(yearMargin, currency, decimalSeparator, hideSensitiveNumbers),
                    compact = compact
                )
            }
            Spacer(modifier = Modifier.weight(1f))
            HeaderPrivacyButton(
                hideSensitiveNumbers = hideSensitiveNumbers,
                onToggle = onToggleSensitiveNumbers,
                size = if (compact) 46.dp else 56.dp,
                iconSize = if (compact) 26.dp else 30.dp
            )
            HeaderCloudSyncButton(
                status = cloudStatus,
                size = if (compact) 46.dp else 56.dp,
                iconSize = if (compact) 27.dp else 31.dp
            )
            HeaderNotificationButton(
                unreadCount = notificationUnreadCount,
                onClick = onOpenNotifications,
                size = if (compact) 46.dp else 56.dp,
                iconSize = if (compact) 26.dp else 30.dp
            )
            HeaderAddProjectButton(
                creatingOrder = creatingOrder,
                onCreateOrder = onCreateOrder,
                compact = compact
            )
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.92f),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                shadowElevation = 1.dp
            ) {
                IconButton(onClick = { menuOpen = true }, modifier = Modifier.size(if (compact) 44.dp else 50.dp)) {
                    Icon(Icons.Filled.Menu, contentDescription = t("Menu"), tint = MaterialTheme.colorScheme.onSurface)
                }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    DropdownMenuItem(
                        text = { Text(t("Account"), fontWeight = FontWeight.Bold) },
                        leadingIcon = { Icon(Icons.Filled.AccountCircle, contentDescription = null) },
                        onClick = {
                            menuOpen = false
                            onOpenAccount()
                        }
                    )
                    HorizontalDivider(modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
                    DropdownMenuItem(
                        text = { Text(t("Sign Out"), fontWeight = FontWeight.Bold, color = StudioRed) },
                        leadingIcon = { Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null, tint = StudioRed) },
                        onClick = {
                            menuOpen = false
                            onSignOut()
                        }
                    )
                }
            }
        }
        Spacer(modifier = Modifier.height(10.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            sections.forEach { item ->
                TopNavItem(
                    section = item,
                    selected = item == selectedSection,
                    badgeCount = when (item) {
                        StudioSection.Notifications -> notificationUnreadCount
                        StudioSection.Messages -> messageUnreadCount
                        else -> 0
                    },
                    onClick = { onSelectSection(item) }
                )
            }
        }
        }
    }
}

@Composable
private fun WorkspaceHeaderLogo(
    workspaceName: String,
    logoUrl: String,
    compact: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val cleanLogoUrl = logoUrl.trim()
    var bitmap by remember(cleanLogoUrl) { mutableStateOf<android.graphics.Bitmap?>(null) }

    LaunchedEffect(cleanLogoUrl) {
        bitmap = null
        if (cleanLogoUrl.startsWith("http://") || cleanLogoUrl.startsWith("https://")) {
            bitmap = withContext(Dispatchers.IO) {
                runCatching {
                    URL(cleanLogoUrl).openStream().use { stream -> BitmapFactory.decodeStream(stream) }
                }.getOrNull()
            }
        }
    }

    Box(
        modifier = modifier
            .clickable(onClick = onClick),
        contentAlignment = Alignment.CenterStart
    ) {
        val logoBitmap = bitmap
        if (logoBitmap != null) {
            Image(
                bitmap = logoBitmap.asImageBitmap(),
                contentDescription = "${workspaceName.ifBlank { "Workspace" }} logo",
                modifier = Modifier.fillMaxSize(),
                alignment = Alignment.CenterStart,
                contentScale = ContentScale.Fit
            )
        } else {
            NivaDeskHeaderLogoFallback(
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}

@Composable
private fun NivaDeskHeaderLogoFallback(
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Box(
        modifier = modifier,
        contentAlignment = Alignment.CenterStart
    ) {
        Image(
            painter = painterResource(id = R.drawable.nivadesk_logo_lockup),
            contentDescription = "NivaDesk",
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Fit
        )
    }
}

@Composable
private fun TopMetric(label: String, value: String, compact: Boolean) {
    Column(modifier = Modifier.width(if (compact) 86.dp else 112.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
        Text(t(label), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = if (compact) 10.sp else 12.sp, fontWeight = FontWeight.Bold)
        Text(value, color = StudioGreen, fontSize = if (compact) 12.sp else 15.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun TopNavItem(section: StudioSection, selected: Boolean, badgeCount: Int = 0, onClick: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = if (selected) StudioBlue.copy(alpha = 0.14f) else Color.Transparent,
        border = BorderStroke(1.dp, if (selected) StudioBlue.copy(alpha = 0.18f) else Color.Transparent),
        onClick = onClick
    ) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(7.dp)
        ) {
            Icon(
                section.icon,
                contentDescription = null,
                tint = if (selected) StudioBlue else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(17.dp)
            )
            Text(
                t(section.title),
                color = if (selected) StudioBlue else MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 13.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1
            )
            if (badgeCount > 0) {
                Surface(color = StudioRed, shape = RoundedCornerShape(50)) {
                    Text(
                        if (badgeCount > 99) "99+" else badgeCount.toString(),
                        color = Color.White,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp)
                    )
                }
            }
        }
    }
}

private fun List<StudioOrder>.grossMarginForCurrentMonth(): Double {
    val now = Calendar.getInstance()
    val currentYear = now.get(Calendar.YEAR)
    val currentMonth = now.get(Calendar.MONTH)
    return sumOf { order ->
        val calendar = Calendar.getInstance().apply { time = order.paymentDate }
        if (calendar.get(Calendar.YEAR) == currentYear && calendar.get(Calendar.MONTH) == currentMonth) order.grossMargin else 0.0
    }
}

private fun List<StudioOrder>.grossMarginForCurrentYear(): Double {
    val currentYear = Calendar.getInstance().get(Calendar.YEAR)
    return sumOf { order ->
        val calendar = Calendar.getInstance().apply { time = order.paymentDate }
        if (calendar.get(Calendar.YEAR) == currentYear) order.grossMargin else 0.0
    }
}

private fun formatNetPounds(value: Double, currency: String, decimalSeparator: String, hideNumbers: Boolean): String {
    if (hideNumbers) return privateCurrencyText(currency)
    val formatted = String.format(Locale.UK, "%,.2f", value)
    val localized = if (decimalSeparator == ",") {
        formatted.replace(",", "_").replace(".", ",").replace("_", ".")
    } else {
        formatted
    }
    return currency + localized
}

@Composable
private fun rememberNetworkAvailable(): State<Boolean> {
    val context = LocalContext.current
    val connectivityManager = remember(context) {
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    }
    val networkAvailable = remember {
        mutableStateOf(connectivityManager.currentlyHasInternet())
    }

    DisposableEffect(connectivityManager) {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                networkAvailable.value = true
            }

            override fun onLost(network: Network) {
                networkAvailable.value = connectivityManager.currentlyHasInternet()
            }

            override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
                networkAvailable.value = networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            }
        }
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        connectivityManager.registerNetworkCallback(request, callback)
        onDispose {
            runCatching { connectivityManager.unregisterNetworkCallback(callback) }
        }
    }

    return networkAvailable
}

private fun ConnectivityManager.currentlyHasInternet(): Boolean {
    val network = activeNetwork ?: return false
    val capabilities = getNetworkCapabilities(network) ?: return false
    return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
}

private fun cloudStateFor(state: StudioFlowUiState, networkAvailable: Boolean): HeaderCloudState {
    return when {
        !networkAvailable -> HeaderCloudState.Offline
        state.errorMessage.isNotBlank() -> HeaderCloudState.Error
        state.loading || state.workspace == null -> HeaderCloudState.Connecting
        state.settingsSaving || state.creatingOrder -> HeaderCloudState.Saving
        else -> HeaderCloudState.Saved
    }
}

private fun cloudMessageFor(state: StudioFlowUiState, cloudState: HeaderCloudState): String {
    return when (cloudState) {
        HeaderCloudState.Offline -> "Offline. You can keep viewing saved data; new changes will wait for connection."
        HeaderCloudState.Connecting -> "Connecting to cloud..."
        HeaderCloudState.Saving -> state.settingsMessage.ifBlank { "Saving latest changes to cloud..." }
        HeaderCloudState.Saved -> state.settingsMessage.ifBlank { "Saved to cloud." }
        HeaderCloudState.Error -> state.errorMessage.ifBlank { "There was a problem syncing your changes." }
    }
}

private fun cloudTitle(state: HeaderCloudState): String {
    return when (state) {
        HeaderCloudState.Offline -> "Offline mode"
        HeaderCloudState.Connecting -> "Connecting to cloud"
        HeaderCloudState.Saving -> "Saving to cloud"
        HeaderCloudState.Saved -> "Saved to cloud"
        HeaderCloudState.Error -> "Cloud sync issue"
    }
}

private fun cloudSubtitle(status: HeaderCloudStatus): String {
    val lastSaved = if (status.state == HeaderCloudState.Saved && status.lastSavedAtMillis > 0L) {
        "\nLast sync: " + SimpleDateFormat("dd/MM/yy HH:mm", Locale.UK).format(Date(status.lastSavedAtMillis))
    } else {
        ""
    }
    return status.message + lastSaved
}

private fun cloudTone(state: HeaderCloudState): Color {
    return when (state) {
        HeaderCloudState.Offline,
        HeaderCloudState.Saving -> StudioWarningOrange
        HeaderCloudState.Saved -> StudioGreen
        HeaderCloudState.Error -> StudioRed
        HeaderCloudState.Connecting -> StudioBlue
    }
}

private fun cloudIcon(state: HeaderCloudState): ImageVector {
    return when (state) {
        HeaderCloudState.Offline -> Icons.Outlined.CloudOff
        HeaderCloudState.Saving -> Icons.Outlined.CloudUpload
        HeaderCloudState.Saved -> Icons.Outlined.CloudDone
        HeaderCloudState.Error -> Icons.Filled.Error
        HeaderCloudState.Connecting -> Icons.Filled.Sync
    }
}

@Composable
private fun StudioLargeSidebar(
    workspaceName: String,
    workspaceMeta: String,
    hideSensitiveNumbers: Boolean,
    cloudStatus: HeaderCloudStatus,
    creatingOrder: Boolean,
    sections: List<StudioSection>,
    selectedSection: StudioSection?,
    onSelectSection: (StudioSection) -> Unit,
    onToggleSensitiveNumbers: () -> Unit,
    onCreateOrder: () -> Unit,
    onSignOut: () -> Unit,
    notificationUnreadCount: Int = 0,
    messageUnreadCount: Int = 0,
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(modifier = modifier, color = MaterialTheme.colorScheme.surface, shadowElevation = 2.dp) {
        Column(
            modifier = Modifier
                .fillMaxHeight()
                .padding(horizontal = 16.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            NivaDeskHeaderLogoFallback(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(58.dp)
            )
            if (workspaceMeta.isNotBlank()) {
                Text(
                    text = workspaceMeta,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                HeaderPrivacyButton(
                    hideSensitiveNumbers = hideSensitiveNumbers,
                    onToggle = onToggleSensitiveNumbers,
                    size = 54.dp,
                    iconSize = 29.dp
                )
                HeaderCloudSyncButton(
                    status = cloudStatus,
                    size = 54.dp,
                    iconSize = 30.dp
                )
            }
            HeaderAddProjectButton(
                creatingOrder = creatingOrder,
                onCreateOrder = onCreateOrder,
                compact = false,
                modifier = Modifier.fillMaxWidth()
            )
            Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.weight(1f)) {
                sections.forEach { item ->
                    SidebarItem(
                        section = item,
                        selected = item == selectedSection,
                        badgeCount = when (item) {
                            StudioSection.Notifications -> notificationUnreadCount
                            StudioSection.Messages -> messageUnreadCount
                            else -> 0
                        },
                        onClick = { onSelectSection(item) }
                    )
                }
            }
            SidebarAction(
                label = t("Sign Out"),
                icon = Icons.AutoMirrored.Filled.Logout,
                onClick = onSignOut
            )
        }
    }
}

@Composable
private fun SidebarItem(section: StudioSection, selected: Boolean, badgeCount: Int = 0, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = if (selected) StudioBlue.copy(alpha = 0.14f) else Color.Transparent,
        onClick = onClick
    ) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Icon(
                section.icon,
                contentDescription = null,
                tint = if (selected) StudioBlue else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(22.dp)
            )
            Text(
                t(section.title),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = if (selected) StudioBlue else MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.ExtraBold,
                modifier = Modifier.weight(1f, fill = false)
            )
            if (badgeCount > 0) {
                Spacer(modifier = Modifier.weight(1f))
                Surface(
                    color = StudioRed,
                    shape = RoundedCornerShape(50)
                ) {
                    Text(
                        if (badgeCount > 99) "99+" else badgeCount.toString(),
                        color = Color.White,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun SidebarAction(label: String, icon: ImageVector, onClick: () -> Unit) {
    Surface(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, onClick = onClick) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(label, fontWeight = FontWeight.ExtraBold)
        }
    }
}

@Composable
private fun StudioMobileHeader(
    workspaceName: String,
    workspaceLogoUrl: String,
    hideSensitiveNumbers: Boolean,
    cloudStatus: HeaderCloudStatus,
    creatingOrder: Boolean,
    onToggleSensitiveNumbers: () -> Unit,
    onCreateOrder: () -> Unit,
    onSignOut: () -> Unit,
    sections: List<StudioSection>,
    onLogoClick: () -> Unit,
    onSelectSection: (StudioSection) -> Unit,
    onOpenAccount: () -> Unit,
    notificationUnreadCount: Int = 0,
    messageUnreadCount: Int = 0,
    notesReminderCount: Int = 0,
    onOpenNotifications: () -> Unit = {}
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var menuOpen by rememberSaveable { mutableStateOf(false) }

    Surface(
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(start = 16.dp, end = 12.dp, top = 12.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            WorkspaceHeaderLogo(
                workspaceName = workspaceName,
                logoUrl = workspaceLogoUrl,
                compact = true,
                onClick = onLogoClick,
                modifier = Modifier
                    .weight(1f)
                    .height(42.dp)
            )
            HeaderPrivacyButton(
                hideSensitiveNumbers = hideSensitiveNumbers,
                onToggle = onToggleSensitiveNumbers,
                size = 46.dp,
                iconSize = 26.dp
            )
            Spacer(modifier = Modifier.width(8.dp))
            HeaderCloudSyncButton(
                status = cloudStatus,
                size = 46.dp,
                iconSize = 27.dp
            )
            Spacer(modifier = Modifier.width(8.dp))
            HeaderAddProjectButton(
                creatingOrder = creatingOrder,
                onCreateOrder = onCreateOrder,
                compact = true
            )
            Spacer(modifier = Modifier.width(8.dp))
            Box {
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.92f),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    shadowElevation = 1.dp
                ) {
                    IconButton(onClick = { menuOpen = true }, modifier = Modifier.size(46.dp)) {
                        Icon(Icons.Filled.Menu, contentDescription = t("Menu"), tint = MaterialTheme.colorScheme.onSurface)
                    }
                }
                if (notificationUnreadCount > 0) {
                    Surface(
                        color = StudioRed,
                        shape = RoundedCornerShape(50),
                        border = BorderStroke(1.5.dp, MaterialTheme.colorScheme.surface),
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .offset(x = 6.dp, y = (-6).dp)
                    ) {
                        Text(
                            text = if (notificationUnreadCount > 99) "99+" else notificationUnreadCount.toString(),
                            color = Color.White,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.ExtraBold,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp)
                        )
                    }
                }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    sections.forEach { item ->
                        val badge = when (item) {
                            StudioSection.Notifications -> notificationUnreadCount
                            StudioSection.Messages -> messageUnreadCount
                            StudioSection.Notes -> notesReminderCount
                            else -> 0
                        }
                        DropdownMenuItem(
                            text = {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(t(item.title), fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                                    if (badge > 0) {
                                        Surface(color = StudioRed, shape = RoundedCornerShape(50)) {
                                            Text(
                                                if (badge > 99) "99+" else badge.toString(),
                                                color = Color.White,
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.Bold,
                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                            )
                                        }
                                    }
                                }
                            },
                            leadingIcon = { Icon(item.icon, contentDescription = null, tint = StudioBlue) },
                            onClick = {
                                menuOpen = false
                                onSelectSection(item)
                            }
                        )
                    }
                    DropdownMenuItem(
                        text = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(t("Notifications"), fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                                if (notificationUnreadCount > 0) {
                                    Surface(color = StudioRed, shape = RoundedCornerShape(50)) {
                                        Text(
                                            if (notificationUnreadCount > 99) "99+" else notificationUnreadCount.toString(),
                                            color = Color.White,
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                }
                            }
                        },
                        leadingIcon = { Icon(Icons.Filled.Notifications, contentDescription = null, tint = StudioBlue) },
                        onClick = {
                            menuOpen = false
                            onOpenNotifications()
                        }
                    )
                    DropdownMenuItem(
                        text = { Text(t("Account"), fontWeight = FontWeight.Bold) },
                        leadingIcon = { Icon(Icons.Filled.AccountCircle, contentDescription = null, tint = StudioBlue) },
                        onClick = {
                            menuOpen = false
                            onOpenAccount()
                        }
                    )
                    HorizontalDivider(modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
                    DropdownMenuItem(
                        text = { Text(t("Sign Out"), fontWeight = FontWeight.Bold, color = StudioRed) },
                        leadingIcon = { Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null, tint = StudioRed) },
                        onClick = {
                            menuOpen = false
                            onSignOut()
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun NoSectionAccessScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
        Text("No sections available", fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            "Your current role does not have access to any mobile sections yet.",
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun HeaderPrivacyButton(
    hideSensitiveNumbers: Boolean,
    onToggle: () -> Unit,
    size: Dp,
    iconSize: Dp
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    HeaderIconButton(
        icon = if (hideSensitiveNumbers) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
        contentDescription = if (hideSensitiveNumbers) t("Show prices") else t("Hide prices"),
        tint = if (hideSensitiveNumbers) StudioWarningOrange else MaterialTheme.colorScheme.onSurfaceVariant,
        container = if (hideSensitiveNumbers) {
            StudioWarningOrange.copy(alpha = 0.16f)
        } else {
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.92f)
        },
        border = if (hideSensitiveNumbers) {
            StudioWarningOrange.copy(alpha = 0.34f)
        } else {
            MaterialTheme.colorScheme.outlineVariant
        },
        size = size,
        iconSize = iconSize,
        onClick = onToggle
    )
}

@Composable
private fun HeaderNotificationButton(
    unreadCount: Int,
    onClick: () -> Unit,
    size: Dp,
    iconSize: Dp
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Box {
        HeaderIconButton(
            icon = Icons.Filled.Notifications,
            contentDescription = t("Notifications"),
            tint = StudioBlue,
            container = StudioBlue.copy(alpha = 0.12f),
            border = StudioBlue.copy(alpha = 0.24f),
            size = size,
            iconSize = iconSize,
            onClick = onClick
        )
        if (unreadCount > 0) {
            Surface(
                color = StudioRed,
                shape = RoundedCornerShape(50),
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(2.dp)
            ) {
                Text(
                    if (unreadCount > 99) "99+" else unreadCount.toString(),
                    color = Color.White,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp)
                )
            }
        }
    }
}

@Composable
private fun HeaderCloudSyncButton(
    status: HeaderCloudStatus,
    size: Dp,
    iconSize: Dp
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var open by rememberSaveable { mutableStateOf(false) }
    val tone = cloudTone(status.state)
    Box {
        HeaderIconButton(
            icon = cloudIcon(status.state),
            contentDescription = cloudTitle(status.state),
            tint = tone,
            container = tone.copy(alpha = 0.12f),
            border = tone.copy(alpha = 0.24f),
            size = size,
            iconSize = iconSize,
            onClick = { open = true }
        )
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            Column(
                modifier = Modifier
                    .widthIn(min = 230.dp, max = 320.dp)
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    cloudTitle(status.state),
                    color = tone,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 15.sp
                )
                Text(
                    cloudSubtitle(status),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    lineHeight = 17.sp
                )
            }
        }
    }
}

@Composable
private fun HeaderIconButton(
    icon: ImageVector,
    contentDescription: String,
    tint: Color = MaterialTheme.colorScheme.onSurfaceVariant,
    container: Color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.92f),
    border: Color = MaterialTheme.colorScheme.outlineVariant,
    size: Dp = 54.dp,
    iconSize: Dp = 29.dp,
    onClick: () -> Unit = {}
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    // Flat, crisp circle: a shadowElevation + border + CircleShape combo can leave a
    // faint seam on the outer ring, so we draw the border on a clipped Box instead.
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(container)
            .border(1.dp, border, CircleShape)
    ) {
        IconButton(onClick = onClick, modifier = Modifier.fillMaxSize()) {
            Icon(
                icon,
                contentDescription = contentDescription,
                tint = tint,
                modifier = Modifier.size(iconSize)
            )
        }
    }
}

@Composable
private fun HeaderAddProjectButton(
    creatingOrder: Boolean,
    onCreateOrder: () -> Unit,
    compact: Boolean,
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Button(
        onClick = onCreateOrder,
        enabled = !creatingOrder,
        shape = RoundedCornerShape(if (compact) 15.dp else 18.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = StudioGreen,
            contentColor = Color.White,
            disabledContainerColor = StudioGreen.copy(alpha = 0.45f),
            disabledContentColor = Color.White.copy(alpha = 0.85f)
        ),
        modifier = modifier
            .height(if (compact) 46.dp else 56.dp)
            .widthIn(min = if (compact) 126.dp else 168.dp),
        contentPadding = PaddingValues(horizontal = if (compact) 12.dp else 18.dp, vertical = 0.dp)
    ) {
        Text(
            text = if (creatingOrder) "Adding..." else "+ Add Project",
            fontSize = if (compact) 15.sp else 19.sp,
            fontWeight = FontWeight.ExtraBold,
            maxLines = 1
        )
    }
}

@Composable
fun SectionHeader(
    title: String,
    subtitle: String,
    trailingIcon: ImageVector? = null
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title, fontSize = 24.sp, fontWeight = FontWeight.ExtraBold)
            Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
        }
        if (trailingIcon != null) {
            Surface(shape = RoundedCornerShape(12.dp), color = StudioBlue.copy(alpha = 0.12f)) {
                IconButton(onClick = {}, modifier = Modifier.size(48.dp)) {
                    Icon(trailingIcon, contentDescription = null, tint = StudioBlue)
                }
            }
        }
    }
}

@Composable
fun SearchBarLike(text: String = "Search...") {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surfaceVariant
    ) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
        Row(modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Search, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(modifier = Modifier.width(10.dp))
            Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 18.sp)
        }
    }
}


private fun mainScreenIsNivaDeskAdmin(): Boolean {
    val email = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.email
        ?.trim()?.lowercase() ?: return false
    return email == "nivadesk@gmail.com" || email == "eggcraftco@gmail.com" || email == "contact@eggcraft.co.uk"
}
