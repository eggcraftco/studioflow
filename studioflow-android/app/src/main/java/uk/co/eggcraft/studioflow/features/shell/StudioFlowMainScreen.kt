package uk.co.eggcraft.studioflow.features.shell

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.ListAlt
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Calendar
import java.util.Locale
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
import uk.co.eggcraft.studioflow.ui.theme.StudioBlue
import uk.co.eggcraft.studioflow.ui.theme.StudioGreen

enum class StudioSection(val title: String, val icon: ImageVector, val accessKey: String) {
    Dashboard("Dashboard", Icons.Filled.Dashboard, "dashboard"),
    Orders("Orders", Icons.Outlined.ListAlt, "orders"),
    Schedule("Schedule", Icons.Filled.Schedule, "schedule"),
    Customers("Customers", Icons.Filled.People, "customers"),
    QuickReply("Quick Reply", Icons.Outlined.AutoAwesome, "quickReply"),
    Settings("Settings", Icons.Filled.Settings, "settings")
}

@Composable
fun StudioFlowMainScreen(
    state: StudioFlowUiState,
    requireDeviceUnlock: Boolean,
    onSetRequireDeviceUnlock: (Boolean) -> Unit,
    onSignOut: () -> Unit,
    onCreateOrder: () -> Unit,
    onAssignOrder: (StudioOrder, StudioTeamMember?) -> Unit,
    onUpdateOrderFields: (StudioOrder, Map<String, Any?>) -> Unit,
    onUploadClientFile: (StudioOrder, ByteArray, String, String) -> Unit,
    onUploadPreviewImage: (StudioOrder, ByteArray, String, String) -> Unit,
    onRefreshLiveTracking: (StudioOrder) -> Unit,
    onRenameClientFile: (StudioOrder, String, String) -> Unit,
    onDeleteClientFile: (StudioOrder, String) -> Unit,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit,
    onUpdateWorkspaceBillingPlan: (StudioBillingPlan) -> Unit,
    onRecalculateFinancialSettings: (Map<String, Any?>) -> Unit,
    onUpdateAccountProfile: (String, String) -> Unit,
    onUploadAccountAvatar: (ByteArray, String) -> Unit,
    onRemoveAccountAvatar: () -> Unit,
    onUploadWorkspaceLogo: (ByteArray, String, Boolean) -> Unit,
    onRemoveWorkspaceLogo: () -> Unit,
    onChangeAccountEmail: (String) -> Unit,
    onSendPasswordResetEmail: () -> Unit,
    onRequestWorkspaceAccess: (String) -> Unit,
    onApproveJoinRequest: (StudioJoinRequest, String) -> Unit,
    onDeclineJoinRequest: (StudioJoinRequest) -> Unit,
    onUpdateTeamMemberRole: (StudioTeamMember, String) -> Unit,
    onUpdateTeamMemberAccess: (StudioTeamMember, WorkspaceMemberAccess) -> Unit,
    onRemoveTeamMember: (StudioTeamMember) -> Unit,
    onSaveCustomRole: (String, String, String, WorkspaceMemberAccess) -> Unit,
    onDeleteCustomRole: (StudioCustomRole) -> Unit,
    onImportBackup: (String) -> Unit,
    onDeleteWorkspaceData: () -> Unit
) {
    var section by rememberSaveable { mutableStateOf(StudioSection.Orders) }
    val preferredSectionOrder = listOf(
        StudioSection.Orders,
        StudioSection.Dashboard,
        StudioSection.Schedule,
        StudioSection.Customers,
        StudioSection.QuickReply,
        StudioSection.Settings
    )
    val availableSections = preferredSectionOrder.filter { item ->
        state.workspace?.memberAccess?.allows(item.accessKey) ?: true
    }
    val activeSection = section.takeIf { it in availableSections } ?: availableSections.firstOrNull()

    LaunchedEffect(availableSections, section) {
        if (section !in availableSections && availableSections.isNotEmpty()) {
            section = availableSections.first()
        }
    }

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
                    workspaceName = state.workspace?.name ?: "EGGcraft",
                    orders = state.orders,
                    creatingOrder = state.creatingOrder,
                    sections = availableSections,
                    selectedSection = activeSection,
                    onSelectSection = { section = it },
                    onCreateOrder = onCreateOrder,
                    onSignOut = onSignOut,
                    compact = containerWidth < 1500.dp,
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
                    onUploadClientFile = onUploadClientFile,
                    onUploadPreviewImage = onUploadPreviewImage,
                    onRefreshLiveTracking = onRefreshLiveTracking,
                    onRenameClientFile = onRenameClientFile,
                    onDeleteClientFile = onDeleteClientFile,
                    onUpdateWorkspaceSettings = onUpdateWorkspaceSettings,
                    onUpdateWorkspaceBillingPlan = onUpdateWorkspaceBillingPlan,
                    onRecalculateFinancialSettings = onRecalculateFinancialSettings,
                    onUpdateAccountProfile = onUpdateAccountProfile,
                    onUploadAccountAvatar = onUploadAccountAvatar,
                    onRemoveAccountAvatar = onRemoveAccountAvatar,
                    onUploadWorkspaceLogo = onUploadWorkspaceLogo,
                    onRemoveWorkspaceLogo = onRemoveWorkspaceLogo,
                    onChangeAccountEmail = onChangeAccountEmail,
                    onSendPasswordResetEmail = onSendPasswordResetEmail,
                    onRequestWorkspaceAccess = onRequestWorkspaceAccess,
                    onApproveJoinRequest = onApproveJoinRequest,
                    onDeclineJoinRequest = onDeclineJoinRequest,
                    onUpdateTeamMemberRole = onUpdateTeamMemberRole,
                    onUpdateTeamMemberAccess = onUpdateTeamMemberAccess,
                    onRemoveTeamMember = onRemoveTeamMember,
                    onSaveCustomRole = onSaveCustomRole,
                    onDeleteCustomRole = onDeleteCustomRole,
                    onImportBackup = onImportBackup,
                    onDeleteWorkspaceData = onDeleteWorkspaceData,
                    modifier = Modifier.weight(1f)
                )
            }
        } else {
            Column(modifier = Modifier.fillMaxSize()) {
                StudioMobileHeader(
                    workspaceName = state.workspace?.name ?: "EGGcraft",
                    creatingOrder = state.creatingOrder,
                    onCreateOrder = onCreateOrder,
                    onSignOut = onSignOut,
                    sections = availableSections,
                    onSelectSection = { section = it }
                )
                StudioSectionContent(
                    activeSection = activeSection,
                    state = state,
                    requireDeviceUnlock = requireDeviceUnlock,
                    onSetRequireDeviceUnlock = onSetRequireDeviceUnlock,
                    onSignOut = onSignOut,
                    onAssignOrder = onAssignOrder,
                    onUpdateOrderFields = onUpdateOrderFields,
                    onUploadClientFile = onUploadClientFile,
                    onUploadPreviewImage = onUploadPreviewImage,
                    onRefreshLiveTracking = onRefreshLiveTracking,
                    onRenameClientFile = onRenameClientFile,
                    onDeleteClientFile = onDeleteClientFile,
                    onUpdateWorkspaceSettings = onUpdateWorkspaceSettings,
                    onUpdateWorkspaceBillingPlan = onUpdateWorkspaceBillingPlan,
                    onRecalculateFinancialSettings = onRecalculateFinancialSettings,
                    onUpdateAccountProfile = onUpdateAccountProfile,
                    onUploadAccountAvatar = onUploadAccountAvatar,
                    onRemoveAccountAvatar = onRemoveAccountAvatar,
                    onUploadWorkspaceLogo = onUploadWorkspaceLogo,
                    onRemoveWorkspaceLogo = onRemoveWorkspaceLogo,
                    onChangeAccountEmail = onChangeAccountEmail,
                    onSendPasswordResetEmail = onSendPasswordResetEmail,
                    onRequestWorkspaceAccess = onRequestWorkspaceAccess,
                    onApproveJoinRequest = onApproveJoinRequest,
                    onDeclineJoinRequest = onDeclineJoinRequest,
                    onUpdateTeamMemberRole = onUpdateTeamMemberRole,
                    onUpdateTeamMemberAccess = onUpdateTeamMemberAccess,
                    onRemoveTeamMember = onRemoveTeamMember,
                    onSaveCustomRole = onSaveCustomRole,
                    onDeleteCustomRole = onDeleteCustomRole,
                    onImportBackup = onImportBackup,
                    onDeleteWorkspaceData = onDeleteWorkspaceData,
                    modifier = Modifier.weight(1f)
                )
            }
        }
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
    onUploadClientFile: (StudioOrder, ByteArray, String, String) -> Unit,
    onUploadPreviewImage: (StudioOrder, ByteArray, String, String) -> Unit,
    onRefreshLiveTracking: (StudioOrder) -> Unit,
    onRenameClientFile: (StudioOrder, String, String) -> Unit,
    onDeleteClientFile: (StudioOrder, String) -> Unit,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit,
    onUpdateWorkspaceBillingPlan: (StudioBillingPlan) -> Unit,
    onRecalculateFinancialSettings: (Map<String, Any?>) -> Unit,
    onUpdateAccountProfile: (String, String) -> Unit,
    onUploadAccountAvatar: (ByteArray, String) -> Unit,
    onRemoveAccountAvatar: () -> Unit,
    onUploadWorkspaceLogo: (ByteArray, String, Boolean) -> Unit,
    onRemoveWorkspaceLogo: () -> Unit,
    onChangeAccountEmail: (String) -> Unit,
    onSendPasswordResetEmail: () -> Unit,
    onRequestWorkspaceAccess: (String) -> Unit,
    onApproveJoinRequest: (StudioJoinRequest, String) -> Unit,
    onDeclineJoinRequest: (StudioJoinRequest) -> Unit,
    onUpdateTeamMemberRole: (StudioTeamMember, String) -> Unit,
    onUpdateTeamMemberAccess: (StudioTeamMember, WorkspaceMemberAccess) -> Unit,
    onRemoveTeamMember: (StudioTeamMember) -> Unit,
    onSaveCustomRole: (String, String, String, WorkspaceMemberAccess) -> Unit,
    onDeleteCustomRole: (StudioCustomRole) -> Unit,
    onImportBackup: (String) -> Unit,
    onDeleteWorkspaceData: () -> Unit,
    modifier: Modifier = Modifier
) {
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
                onUploadClientFile = onUploadClientFile,
                onUploadPreviewImage = onUploadPreviewImage,
                onRefreshLiveTracking = onRefreshLiveTracking,
                onRenameClientFile = onRenameClientFile,
                onDeleteClientFile = onDeleteClientFile,
                onUpdateWorkspaceSettings = onUpdateWorkspaceSettings
            )
            StudioSection.Schedule -> ScheduleScreen(
                state = state,
                onUpdateOrderFields = onUpdateOrderFields
            )
            StudioSection.Customers -> CustomersScreen(state = state)
            StudioSection.QuickReply -> QuickReplyScreen(
                state = state,
                onUpdateWorkspaceSettings = onUpdateWorkspaceSettings
            )
            StudioSection.Settings -> SettingsScreen(
                state = state,
                requireDeviceUnlock = requireDeviceUnlock,
                onSetRequireDeviceUnlock = onSetRequireDeviceUnlock,
                onSignOut = onSignOut,
                onUpdateWorkspaceSettings = onUpdateWorkspaceSettings,
                onUpdateWorkspaceBillingPlan = onUpdateWorkspaceBillingPlan,
                onRecalculateFinancialSettings = onRecalculateFinancialSettings,
                onUpdateAccountProfile = onUpdateAccountProfile,
                onUploadAccountAvatar = onUploadAccountAvatar,
                onRemoveAccountAvatar = onRemoveAccountAvatar,
                onUploadWorkspaceLogo = onUploadWorkspaceLogo,
                onRemoveWorkspaceLogo = onRemoveWorkspaceLogo,
                onChangeAccountEmail = onChangeAccountEmail,
                onSendPasswordResetEmail = onSendPasswordResetEmail,
                onRequestWorkspaceAccess = onRequestWorkspaceAccess,
                onApproveJoinRequest = onApproveJoinRequest,
                onDeclineJoinRequest = onDeclineJoinRequest,
                onUpdateTeamMemberRole = onUpdateTeamMemberRole,
                onUpdateTeamMemberAccess = onUpdateTeamMemberAccess,
                onRemoveTeamMember = onRemoveTeamMember,
                onSaveCustomRole = onSaveCustomRole,
                onDeleteCustomRole = onDeleteCustomRole,
                onImportBackup = onImportBackup,
                onDeleteWorkspaceData = onDeleteWorkspaceData
            )
            null -> NoSectionAccessScreen()
        }
    }
}

@Composable
private fun StudioLargeTopBar(
    workspaceName: String,
    orders: List<StudioOrder>,
    creatingOrder: Boolean,
    sections: List<StudioSection>,
    selectedSection: StudioSection?,
    onSelectSection: (StudioSection) -> Unit,
    onCreateOrder: () -> Unit,
    onSignOut: () -> Unit,
    compact: Boolean,
    modifier: Modifier = Modifier
) {
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
            Text(
                text = workspaceName.ifBlank { "EGGcraft" },
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = Color(0xFFB98224),
                fontFamily = FontFamily.Serif,
                fontSize = if (compact) 28.sp else 34.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.width(if (compact) 146.dp else 180.dp)
            )
            if (!compact) {
                TopMetric(label = "Month Net", value = formatNetPounds(monthNet))
                Surface(
                    modifier = Modifier
                        .width(1.dp)
                        .height(32.dp),
                    color = MaterialTheme.colorScheme.outlineVariant
                ) {}
                TopMetric(label = "Year Net", value = formatNetPounds(yearNet))
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
                        onClick = { onSelectSection(item) }
                    )
                }
            }
            HeaderIconButton(icon = Icons.Filled.Visibility, contentDescription = "View")
            HeaderIconButton(
                icon = Icons.Filled.CloudDone,
                contentDescription = "Cloud saved",
                tint = StudioGreen,
                container = StudioGreen.copy(alpha = 0.14f)
            )
            Button(
                onClick = onCreateOrder,
                enabled = !creatingOrder,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.height(42.dp),
                contentPadding = PaddingValues(horizontal = if (compact) 10.dp else 14.dp, vertical = 0.dp)
            ) {
                Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(17.dp))
                Spacer(modifier = Modifier.width(5.dp))
                Text(if (creatingOrder) "Adding..." else "Add Project", fontSize = 13.sp, fontWeight = FontWeight.ExtraBold)
            }
            Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                IconButton(onClick = { menuOpen = true }, modifier = Modifier.size(40.dp)) {
                    Icon(Icons.Filled.Menu, contentDescription = "Menu", tint = MaterialTheme.colorScheme.onSurface)
                }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    DropdownMenuItem(
                        text = { Text("Sign Out", fontWeight = FontWeight.Bold) },
                        leadingIcon = { Icon(Icons.Filled.Logout, contentDescription = null) },
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
private fun TopMetric(label: String, value: String) {
    Column(modifier = Modifier.width(96.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        Text(value, color = StudioGreen, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun TopNavItem(section: StudioSection, selected: Boolean, onClick: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = if (selected) StudioBlue.copy(alpha = 0.14f) else Color.Transparent,
        border = BorderStroke(1.dp, if (selected) StudioBlue.copy(alpha = 0.18f) else Color.Transparent),
        onClick = onClick
    ) {
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
                section.title,
                color = if (selected) StudioBlue else MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 13.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1
            )
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

private fun formatNetPounds(value: Double): String {
    return "£" + String.format(Locale.UK, "%,.2f", value)
}

@Composable
private fun StudioLargeSidebar(
    workspaceName: String,
    workspaceMeta: String,
    creatingOrder: Boolean,
    sections: List<StudioSection>,
    selectedSection: StudioSection?,
    onSelectSection: (StudioSection) -> Unit,
    onCreateOrder: () -> Unit,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(modifier = modifier, color = MaterialTheme.colorScheme.surface, shadowElevation = 2.dp) {
        Column(
            modifier = Modifier
                .fillMaxHeight()
                .padding(horizontal = 16.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = workspaceName.ifBlank { "EGGcraft" },
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = Color(0xFFB98224),
                fontFamily = FontFamily.Serif,
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold
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
                HeaderIconButton(icon = Icons.Filled.Visibility, contentDescription = "View")
                HeaderIconButton(
                    icon = Icons.Filled.CloudDone,
                    contentDescription = "Cloud saved",
                    tint = StudioGreen,
                    container = StudioGreen.copy(alpha = 0.14f)
                )
            }
            Button(
                onClick = onCreateOrder,
                enabled = !creatingOrder,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(if (creatingOrder) "Adding..." else "Add Project", fontWeight = FontWeight.ExtraBold)
            }
            Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.weight(1f)) {
                sections.forEach { item ->
                    SidebarItem(
                        section = item,
                        selected = item == selectedSection,
                        onClick = { onSelectSection(item) }
                    )
                }
            }
            SidebarAction(
                label = "Sign Out",
                icon = Icons.Filled.Logout,
                onClick = onSignOut
            )
        }
    }
}

@Composable
private fun SidebarItem(section: StudioSection, selected: Boolean, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = if (selected) StudioBlue.copy(alpha = 0.14f) else Color.Transparent,
        onClick = onClick
    ) {
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
                section.title,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = if (selected) StudioBlue else MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.ExtraBold
            )
        }
    }
}

@Composable
private fun SidebarAction(label: String, icon: ImageVector, onClick: () -> Unit) {
    Surface(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, onClick = onClick) {
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
    creatingOrder: Boolean,
    onCreateOrder: () -> Unit,
    onSignOut: () -> Unit,
    sections: List<StudioSection>,
    onSelectSection: (StudioSection) -> Unit
) {
    var menuOpen by rememberSaveable { mutableStateOf(false) }

    Surface(
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(start = 16.dp, end = 12.dp, top = 18.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = workspaceName.ifBlank { "EGGcraft" },
                modifier = Modifier.weight(1f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = Color(0xFFB98224),
                fontFamily = FontFamily.Serif,
                fontSize = 27.sp,
                fontWeight = FontWeight.Bold
            )
            HeaderIconButton(icon = Icons.Filled.Visibility, contentDescription = "View")
            Spacer(modifier = Modifier.width(5.dp))
            HeaderIconButton(
                icon = Icons.Filled.CloudDone,
                contentDescription = "Cloud saved",
                tint = StudioGreen,
                container = StudioGreen.copy(alpha = 0.14f)
            )
            Spacer(modifier = Modifier.width(5.dp))
            Button(
                onClick = onCreateOrder,
                enabled = !creatingOrder,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.height(40.dp),
                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 0.dp)
            ) {
                Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text(if (creatingOrder) "Adding..." else "Add Project", fontSize = 13.sp, fontWeight = FontWeight.ExtraBold)
            }
            Spacer(modifier = Modifier.width(5.dp))
            Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                IconButton(onClick = { menuOpen = true }, modifier = Modifier.size(38.dp)) {
                    Icon(Icons.Filled.Menu, contentDescription = "Menu", tint = MaterialTheme.colorScheme.onSurface)
                }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    sections.forEach { item ->
                        DropdownMenuItem(
                            text = { Text(item.title, fontWeight = FontWeight.Bold) },
                            leadingIcon = { Icon(item.icon, contentDescription = null, tint = StudioBlue) },
                            onClick = {
                                menuOpen = false
                                onSelectSection(item)
                            }
                        )
                    }
                    DropdownMenuItem(
                        text = { Text("Sign Out", fontWeight = FontWeight.Bold) },
                        leadingIcon = { Icon(Icons.Filled.Settings, contentDescription = null) },
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
        Text("No sections available", fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            "Your current role does not have access to any mobile sections yet.",
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun HeaderIconButton(
    icon: ImageVector,
    contentDescription: String,
    tint: Color = MaterialTheme.colorScheme.onSurfaceVariant,
    container: Color = MaterialTheme.colorScheme.surfaceVariant
) {
    Surface(shape = RoundedCornerShape(12.dp), color = container) {
        IconButton(onClick = {}, modifier = Modifier.size(38.dp)) {
            Icon(icon, contentDescription = contentDescription, tint = tint)
        }
    }
}

@Composable
fun SectionHeader(
    title: String,
    subtitle: String,
    trailingIcon: ImageVector? = null
) {
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
        Row(modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Search, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(modifier = Modifier.width(10.dp))
            Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 18.sp)
        }
    }
}
