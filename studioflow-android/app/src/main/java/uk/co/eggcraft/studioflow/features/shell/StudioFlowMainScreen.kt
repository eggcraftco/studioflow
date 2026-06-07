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
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.automirrored.filled.Note
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Folder
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
import uk.co.eggcraft.studioflow.data.model.StudioBillingPlan
import uk.co.eggcraft.studioflow.data.model.StudioCustomRole
import uk.co.eggcraft.studioflow.data.model.StudioJoinRequest
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
import uk.co.eggcraft.studioflow.features.settings.standardWorkflowTemplate
import uk.co.eggcraft.studioflow.ui.theme.StudioBlue
import uk.co.eggcraft.studioflow.ui.theme.StudioGreen
import uk.co.eggcraft.studioflow.ui.theme.StudioRed
import uk.co.eggcraft.studioflow.ui.theme.StudioWarningOrange

enum class StudioSection(val title: String, val icon: ImageVector, val accessKey: String) {
    Dashboard("Dashboard", Icons.Filled.Dashboard, "dashboard"),
    Orders("Orders", Icons.AutoMirrored.Outlined.ListAlt, "orders"),
    Schedule("Schedule", Icons.Filled.Schedule, "schedule"),
    Customers("Customers", Icons.Filled.People, "customers"),
    Files("Files", Icons.Filled.Folder, "clientFiles"),
    Messages("Messages", Icons.AutoMirrored.Filled.Chat, "messages"),
    Notifications("Notifications", Icons.Filled.Notifications, "notifications"),
    Notes("Notes", Icons.AutoMirrored.Filled.Note, "notes"),
    QuickReply("Quick Reply", Icons.Outlined.AutoAwesome, "quickReply"),
    Settings("Settings", Icons.Filled.Settings, "settings")
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
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit,
    onUpdateWorkspaceBillingPlan: (StudioBillingPlan) -> Unit,
    googlePlanOffers: List<StudioGooglePlanOffer> = emptyList(),
    googleBillingPurchasing: Boolean = false,
    onLoadGooglePlayProducts: () -> Unit = {},
    onPurchaseGooglePlan: (android.app.Activity, StudioGooglePlanOffer) -> Unit = { _, _ -> },
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
        StudioSection.Dashboard,
        StudioSection.Schedule,
        StudioSection.Customers,
        StudioSection.Files,
        StudioSection.Messages,
        StudioSection.Notes,
        StudioSection.QuickReply,
        StudioSection.Settings
    )
    val availableSections = preferredSectionOrder.filter { item ->
        val planAllowsSection = item != StudioSection.Messages ||
            state.workspace?.billingPlan == StudioBillingPlan.TeamMonthly
        planAllowsSection && (state.workspace?.memberAccess?.allows(item.accessKey) ?: true)
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
    val openOrdersFromLogo = {
        settingsStartKey = null
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
            BoxWithConstraints(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background)
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
                    focusedCustomerName = focusedCustomerName,
                    onOpenCustomerFromOrder = { order ->
                        focusedCustomerName = order.displayCustomerName
                        settingsStartKey = null
                        section = StudioSection.Customers
                    },
                    settingsInitialSectionKey = settingsStartKey,
                    onUpdateWorkspaceSettings = onUpdateWorkspaceSettings,
                    onUpdateWorkspaceBillingPlan = onUpdateWorkspaceBillingPlan,
                    googlePlanOffers = googlePlanOffers,
                    googleBillingPurchasing = googleBillingPurchasing,
                    onLoadGooglePlayProducts = onLoadGooglePlayProducts,
                    onPurchaseGooglePlan = onPurchaseGooglePlan,
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
                    focusedCustomerName = focusedCustomerName,
                    onOpenCustomerFromOrder = { order ->
                        focusedCustomerName = order.displayCustomerName
                        settingsStartKey = null
                        section = StudioSection.Customers
                    },
                    settingsInitialSectionKey = settingsStartKey,
                    onUpdateWorkspaceSettings = onUpdateWorkspaceSettings,
                    onUpdateWorkspaceBillingPlan = onUpdateWorkspaceBillingPlan,
                    googlePlanOffers = googlePlanOffers,
                    googleBillingPurchasing = googleBillingPurchasing,
                    onLoadGooglePlayProducts = onLoadGooglePlayProducts,
                    onPurchaseGooglePlan = onPurchaseGooglePlan,
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
        AnimatedVisibility(
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
    var businessPrompt by rememberSaveable {
        mutableStateOf(state.workspaceSettings.businessDescriptionPrompt.ifBlank { onboardingPromptSeed("Photography Studio") })
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
                                Text(businessType, fontWeight = FontWeight.Black)
                            }
                            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                                businessTypes.forEach { type ->
                                    DropdownMenuItem(
                                        text = { Text(type) },
                                        onClick = {
                                            businessType = type
                                            if (businessPrompt.isBlank()) businessPrompt = onboardingPromptSeed(type)
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
                        onValueChange = { businessPrompt = it },
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

private fun onboardingPromptSeed(type: String): String {
    return when (type) {
        "Custom Art Studio" -> "We create custom artwork commissions. We need customer details, design theme, reference images, approval stages, deposit, production stages, final review and shipping."
        "Photography Studio" -> "We manage photo shoots. We need client details, shoot type, location, date, package, booking deposit, selection, editing, delivery and follow-up notes."
        "Repair Service" -> "We repair customer items. We need model, serial number, issue reported, diagnostics, quote approval, parts order, repair, testing and collection or shipping."
        "Handmade Products" -> "We make custom products. We need product type, size, colour, material, customer approval, production, packaging, shipping and balance payment."
        else -> "Describe this business here, including customer information needed, workflow stages, approval steps, materials, shipping, appointments, deposits and delivery."
    }
}

@Composable
private fun StudioSectionContent(
    activeSection: StudioSection?,
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
    focusedCustomerName: String,
    onOpenCustomerFromOrder: (StudioOrder) -> Unit,
    settingsInitialSectionKey: String?,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit,
    onUpdateWorkspaceBillingPlan: (StudioBillingPlan) -> Unit,
    googlePlanOffers: List<StudioGooglePlanOffer> = emptyList(),
    googleBillingPurchasing: Boolean = false,
    onLoadGooglePlayProducts: () -> Unit = {},
    onPurchaseGooglePlan: (android.app.Activity, StudioGooglePlanOffer) -> Unit = { _, _ -> },
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
                onOpenCustomerFromOrder = onOpenCustomerFromOrder,
                onUpdateWorkspaceSettings = onUpdateWorkspaceSettings
            )
            StudioSection.Schedule -> ScheduleScreen(
                state = state,
                onUpdateOrderFields = onUpdateOrderFields,
                onAssignOrder = onAssignOrder,
                onDeleteOrder = onDeleteOrder,
                onOpenCustomerFromOrder = onOpenCustomerFromOrder,
                onUpdateWorkspaceSettings = onUpdateWorkspaceSettings
            )
            StudioSection.Customers -> CustomersScreen(state = state, focusedCustomerName = focusedCustomerName)
            StudioSection.Files -> uk.co.eggcraft.studioflow.features.files.ClientFilesScreen(
                state = state,
                onDeleteClientFile = onDeleteClientFile
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
                onRefreshInvites = onRefreshKeepInvites
            )
            StudioSection.QuickReply -> QuickReplyScreen(
                state = state,
                onUpdateWorkspaceSettings = onUpdateWorkspaceSettings
            )
            StudioSection.Settings -> SettingsScreen(
                state = state,
                initialSectionKey = settingsInitialSectionKey,
                requireDeviceUnlock = requireDeviceUnlock,
                onSetRequireDeviceUnlock = onSetRequireDeviceUnlock,
                onSignOut = onSignOut,
                onUpdateWorkspaceSettings = onUpdateWorkspaceSettings,
                onUpdateWorkspaceBillingPlan = onUpdateWorkspaceBillingPlan,
                googlePlanOffers = googlePlanOffers,
                googleBillingPurchasing = googleBillingPurchasing,
                onLoadGooglePlayProducts = onLoadGooglePlayProducts,
                onPurchaseGooglePlan = onPurchaseGooglePlan,
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
    val monthNet = remember(orders) { orders.netForCurrentMonth() }
    val yearNet = remember(orders) { orders.netForCurrentYear() }

    Surface(modifier = modifier, color = MaterialTheme.colorScheme.surface, shadowElevation = 1.dp) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 10.dp),
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
                    label = "Month Net",
                    value = formatNetPounds(monthNet, currency, decimalSeparator, hideSensitiveNumbers),
                    compact = compact
                )
                Surface(
                    modifier = Modifier
                        .width(1.dp)
                        .height(if (compact) 30.dp else 34.dp),
                    color = MaterialTheme.colorScheme.outlineVariant
                ) {}
                TopMetric(
                    label = "Year Net",
                    value = formatNetPounds(yearNet, currency, decimalSeparator, hideSensitiveNumbers),
                    compact = compact
                )
            }
            Row(
                modifier = Modifier
                    .weight(1f)
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
                shape = RoundedCornerShape(14.dp),
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
                    DropdownMenuItem(
                        text = { Text(t("Sign Out"), fontWeight = FontWeight.Bold) },
                        leadingIcon = { Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null) },
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
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = if (compact) 10.sp else 12.sp, fontWeight = FontWeight.Bold)
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

private fun List<StudioOrder>.netForCurrentMonth(): Double {
    val now = Calendar.getInstance()
    val currentYear = now.get(Calendar.YEAR)
    val currentMonth = now.get(Calendar.MONTH)
    return sumOf { order ->
        val calendar = Calendar.getInstance().apply { time = order.paymentDate }
        if (calendar.get(Calendar.YEAR) == currentYear && calendar.get(Calendar.MONTH) == currentMonth) order.netProfit else 0.0
    }
}

private fun List<StudioOrder>.netForCurrentYear(): Double {
    val currentYear = Calendar.getInstance().get(Calendar.YEAR)
    return sumOf { order ->
        val calendar = Calendar.getInstance().apply { time = order.paymentDate }
        if (calendar.get(Calendar.YEAR) == currentYear) order.netProfit else 0.0
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
        HeaderCloudState.Offline -> Icons.Filled.CloudOff
        HeaderCloudState.Saving -> Icons.Filled.CloudUpload
        HeaderCloudState.Saved -> Icons.Filled.CloudDone
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
                                    Text(item.title, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
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
                    DropdownMenuItem(
                        text = { Text(t("Sign Out"), fontWeight = FontWeight.Bold) },
                        leadingIcon = { Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null) },
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
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = container,
        border = BorderStroke(1.dp, border),
        shadowElevation = 1.dp
    ) {
        IconButton(onClick = onClick, modifier = Modifier.size(size)) {
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
