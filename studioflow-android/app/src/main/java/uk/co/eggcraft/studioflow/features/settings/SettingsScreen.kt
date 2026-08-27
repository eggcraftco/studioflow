package uk.co.eggcraft.studioflow.features.settings

import android.content.Intent
import android.graphics.BitmapFactory
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Backup
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Cookie
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DeleteForever
import androidx.compose.material.icons.filled.Gavel
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.PrivacyTip
import androidx.compose.material.icons.filled.Undo
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Percent
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.TableChart
import androidx.compose.material.icons.filled.Timeline
import androidx.compose.material.icons.filled.Upload
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneOffset
import androidx.compose.runtime.Composable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import uk.co.eggcraft.studioflow.BuildConfig
import uk.co.eggcraft.studioflow.R
import uk.co.eggcraft.studioflow.data.model.StudioSupportTicketMessage
import uk.co.eggcraft.studioflow.data.model.StudioSupportTicket
import uk.co.eggcraft.studioflow.data.firebase.StudioFlowRepository
import uk.co.eggcraft.studioflow.data.model.QuickReplyTemplateItem
import uk.co.eggcraft.studioflow.data.model.STUDIO_PRIMARY_SPECIAL_NOTE_ID
import uk.co.eggcraft.studioflow.data.model.StudioBillingPlan
import uk.co.eggcraft.studioflow.data.model.StudioCompanyNumber
import uk.co.eggcraft.studioflow.data.model.StudioCustomRole
import uk.co.eggcraft.studioflow.data.model.StudioHeadingItem
import uk.co.eggcraft.studioflow.data.model.StudioJoinRequest
import uk.co.eggcraft.studioflow.data.model.StudioOrder
import uk.co.eggcraft.studioflow.data.model.StudioQuickReminderTemplate
import uk.co.eggcraft.studioflow.data.model.StudioTeamMember
import uk.co.eggcraft.studioflow.data.model.StudioWorkspaceSettings
import uk.co.eggcraft.studioflow.data.model.WorkspaceMemberAccess
import uk.co.eggcraft.studioflow.features.shell.SectionHeader
import uk.co.eggcraft.studioflow.features.shell.StudioFlowUiState
import uk.co.eggcraft.studioflow.ui.theme.StudioBlue
import uk.co.eggcraft.studioflow.ui.theme.StudioGreen
import uk.co.eggcraft.studioflow.ui.theme.StudioRed
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import kotlinx.coroutines.tasks.await

private val StudioOrange = Color(0xFFFF9500)
private val StudioPurple = Color(0xFFCC2FE1)
private val DangerRed = Color(0xFFFF5A5F)

@Composable
fun SettingsScreen(
    state: StudioFlowUiState,
    initialSectionKey: String? = null,
    requireDeviceUnlock: Boolean,
    onSetRequireDeviceUnlock: (Boolean) -> Unit,
    onSignOut: () -> Unit,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit,
    onUpdateWorkspaceBillingPlan: (StudioBillingPlan) -> Unit,
    googlePlanOffers: List<uk.co.eggcraft.studioflow.billing.StudioGooglePlanOffer> = emptyList(),
    googleStorageOffers: List<uk.co.eggcraft.studioflow.billing.StudioGoogleStorageOffer> = emptyList(),
    googleBillingPurchasing: Boolean = false,
    onLoadGooglePlayProducts: () -> Unit = {},
    onPurchaseGooglePlan: (android.app.Activity, uk.co.eggcraft.studioflow.billing.StudioGooglePlanOffer) -> Unit = { _, _ -> },
    onPurchaseGoogleStorageAddon: (android.app.Activity, uk.co.eggcraft.studioflow.billing.StudioGoogleStorageOffer) -> Unit = { _, _ -> },
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
    onSaveMessageWorkspaceSettings: (uk.co.eggcraft.studioflow.data.model.StudioMessageWorkspaceSettings) -> Unit = {},
    onReloadMessageWorkspaceSettings: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var selectedKey by rememberSaveable { mutableStateOf<String?>(mapLegacySettingsKey(initialSectionKey)) }
    val currentPlan = state.workspace?.billingPlan ?: StudioBillingPlan.Demo
    val currentAccess = state.workspace?.memberAccess
    val currentRole = state.workspace?.role.orEmpty()
    val sections = rememberSettingsSections(currentPlan, currentAccess, currentRole)
    val settingsRepository = remember { StudioFlowRepository() }
    var supportUnreadCount by remember { mutableStateOf(0) }

    LaunchedEffect(state.workspace?.id) {
        val workspace = state.workspace
        if (workspace == null) {
            supportUnreadCount = 0
        } else {
            runCatching { settingsRepository.getSupportTicketUnreadSummary(workspace) }
                .onSuccess { supportUnreadCount = it.totalUnread }
                .onFailure { supportUnreadCount = 0 }
        }
    }

    LaunchedEffect(initialSectionKey) {
        if (!initialSectionKey.isNullOrBlank()) {
            selectedKey = mapLegacySettingsKey(initialSectionKey)
        }
    }
    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        val isWide = maxWidth >= 900.dp
        val containerWidth = maxWidth
        val selected = sections.firstOrNull { it.key == selectedKey } ?: if (isWide) sections.firstOrNull() else null

        if (isWide) {
            Row(modifier = Modifier.fillMaxSize()) {
                Column(
                    modifier = Modifier
                        .width(if (containerWidth >= 1200.dp) 390.dp else 340.dp)
                        .fillMaxSize()
                        .background(MaterialTheme.colorScheme.background)
                ) {
                    SectionHeader(title = t("Settings"), subtitle = "Choose a section to edit.")
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.weight(1f)) {
                        itemsIndexed(sections, key = { _, it -> it.key }) { index, section ->
                            if (index == 0 || sections[index - 1].group != section.group) {
                                SettingsGroupLabel(title = t(section.group), topPadding = if (index == 0) 0.dp else 12.dp)
                            }
                            SettingsRow(
                                section = section,
                                selected = section.key == selected?.key,
                                unreadCount = if (section.key == "support") supportUnreadCount else 0,
                                onClick = { selectedKey = section.key }
                            )
                        }
                        item { Spacer(modifier = Modifier.height(16.dp)) }
                    }
                }
                selected?.let { section ->
                    SettingsDetailScreen(
                        section = section,
                        state = state,
                        requireDeviceUnlock = requireDeviceUnlock,
                        onSetRequireDeviceUnlock = onSetRequireDeviceUnlock,
                        showBack = false,
                        onBack = { selectedKey = null },
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
                        modifier = Modifier.weight(1f)
                    )
                }
            }
            return@BoxWithConstraints
        }

        if (selected != null) {
            SettingsDetailScreen(
                section = selected,
                state = state,
                requireDeviceUnlock = requireDeviceUnlock,
                onSetRequireDeviceUnlock = onSetRequireDeviceUnlock,
                onBack = { selectedKey = null },
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
                onDeleteWorkspaceData = onDeleteWorkspaceData
            )
            return@BoxWithConstraints
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
        ) {
            SectionHeader(title = t("Settings"), subtitle = "Choose a section to edit.")
            LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.weight(1f)) {
                itemsIndexed(sections, key = { _, it -> it.key }) { index, section ->
                    if (index == 0 || sections[index - 1].group != section.group) {
                        SettingsGroupLabel(title = t(section.group), topPadding = if (index == 0) 2.dp else 14.dp)
                    }
                    SettingsRow(
                        section = section,
                        unreadCount = if (section.key == "support") supportUnreadCount else 0,
                        onClick = { selectedKey = section.key }
                    )
                }
                item { Spacer(modifier = Modifier.height(16.dp)) }
            }
        }
    }
}

@Composable
private fun rememberSettingsSections(plan: StudioBillingPlan, access: WorkspaceMemberAccess?, role: String): List<SettingsSection> = remember(plan, access, role) {
    val normalizedRole = role.lowercase().replace("_", "").replace("-", "").replace(" ", "")
    val isWorkflowOnly = normalizedRole == "workflow" || normalizedRole == "workflowonly"
    listOf(
        // Ten narrow groups, matching web and Mac: the menu sorted by what a
        // mistake there would cost. Section keys are untouched.
        SettingsSection("profileSecurity", "Profile & Security", "Your name, photo, sign-in email and password.", Icons.Filled.AccountCircle, "Personal"),
        SettingsSection("preferences", "Preferences", "Your personal theme and language.", Icons.Filled.Tune, "Personal"),
        SettingsSection("about", "About", "App version and product information.", Icons.Filled.Info, "Personal"),
        SettingsSection("branding", "Branding", "Workspace name, logo and subtitle.", Icons.Filled.Palette, "Workspace Design"),
        SettingsSection("clientDomain", "Customer Portal Domain", "Branded customer links: your subdomain and your own domain.", Icons.Filled.Language, "Workspace Design"),
        SettingsSection("pdf", "PDF Export Settings", "Invoice and PDF export options.", Icons.Filled.Description, "Workspace Design"),
        SettingsSection("workflow", "Workflow Steps", "Order steps and custom fields.", Icons.Filled.Timeline, "Workflow"),
        SettingsSection("quickReply", "Quick Reply Settings", "Quick reply templates.", Icons.Outlined.AutoAwesome, "Workflow"),
        SettingsSection("financial", "Financial Settings", "Fees, tax and calculations.", Icons.Filled.Percent, "Finance & Tax"),
        SettingsSection("team", "Team Access", "Members, roles and join requests.", Icons.Filled.People, "Team & Permissions"),
        SettingsSection("messages", "Message Settings", "Direct messages, group conversations and attachments.", Icons.AutoMirrored.Filled.Chat, "Team & Permissions"),
        SettingsSection("safety", "Safety & Uploads", "Upload rules, file limits and audit protection.", Icons.Filled.Security, "Files & Security"),
        SettingsSection("data", "Data Management", "Import, export and backup.", Icons.Filled.Storage, "Data & Backups"),
        SettingsSection("plan", "Plan & Access", "Plan, limits and feature access.", Icons.Filled.CreditCard, "Billing"),
        SettingsSection("woo", "WooCommerce Integration", "Live website orders and webhook setup.", Icons.Filled.ShoppingCart, "Integrations"),
        SettingsSection("shopify", "Shopify Integration", "Live Shopify orders and webhook setup.", Icons.Filled.ShoppingBag, "Integrations"),
        SettingsSection("inbound", "Other Platforms", "Connect any store via Zapier, Make or a custom webhook.", Icons.Filled.Link, "Integrations"),
        SettingsSection("support", "Support / Tickets", "Contact your workspace owner or NivaDesk support.", Icons.Filled.Email, "Support"),
        SettingsSection("legal", "Legal", "Privacy, terms and policy documents.", Icons.Filled.Gavel, "Support")
    ).filter { section ->
        if (isWorkflowOnly) {
            when (section.key) {
                // Keep operational tools only; hide workspace configuration.
                "profileSecurity", "preferences", "about" -> access?.settingsGeneral != false
                "pdf" -> access?.exportData != false && access?.settingsPdf != false
                "quickReply" -> access?.quickReply != false && access?.settingsQuickReply != false
                "support" -> access?.settingsSupport != false
                "team" -> access?.settingsTeamAccess != false
                "legal" -> true
                else -> false
            }
        } else {
            // Settings sidebar items mirror Mac / Web: each section is gated SOLELY
            // by its own per-section permission flag so an owner can hand out
            // individual settings screens without also enabling the broader nav
            // permission. Unknown sections default to FALSE for safety.
            when (section.key) {
                "profileSecurity", "preferences", "about" -> access?.settingsGeneral != false
                "branding" -> access?.settingsGeneral != false
                // Customer Portal Domain is owner-only, matching web (the callables
                // reject non-owners with permission-denied anyway).
                "clientDomain" -> normalizedRole == "owner"
                "workflow" -> access?.settingsWorkflow != false
                "pdf" -> access?.settingsPdf != false
                "quickReply" -> access?.settingsQuickReply != false
                "messages" -> plan.hasTeamAccess && access?.settingsMessageSettings != false
                "financial" -> plan.hasAdvancedFinance && access?.settingsFinancial != false
                "safety" -> access?.settingsSafetyUploads != false
                "data" -> access?.settingsData != false
                "woo", "shopify", "inbound" -> access?.settingsWorkflow != false
                "plan" -> access?.settingsPlanAccess != false
                "support" -> access?.settingsSupport != false
                "team" -> access?.settingsTeamAccess != false
                "legal" -> true
                else -> false
            }
        }
    }
}

// Uppercase group heading for the settings list (Account / Workspace).
@Composable
private fun SettingsGroupLabel(title: String, topPadding: androidx.compose.ui.unit.Dp = 14.dp) {
    Text(
        text = title.uppercase(),
        fontSize = 11.sp,
        fontWeight = FontWeight.Black,
        letterSpacing = 0.8.sp,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = topPadding, bottom = 2.dp, start = 6.dp)
    )
}

@Composable
private fun SettingsRow(
    section: SettingsSection,
    onClick: () -> Unit,
    selected: Boolean = false,
    unreadCount: Int = 0
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(14.dp),
        color = if (selected) StudioBlue.copy(alpha = 0.10f) else MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp,
        onClick = onClick
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            IconBubble(icon = section.icon, tint = StudioBlue, container = StudioBlue.copy(alpha = 0.12f))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(t(section.title), maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                Text(t(section.subtitle), maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
            }
            if (unreadCount > 0) {
                SupportUnreadBadge(unreadCount)
            }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun SettingsDetailScreen(
    section: SettingsSection,
    state: StudioFlowUiState,
    requireDeviceUnlock: Boolean,
    onSetRequireDeviceUnlock: (Boolean) -> Unit,
    showBack: Boolean = true,
    onBack: () -> Unit,
    onSignOut: () -> Unit,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit,
    onUpdateWorkspaceBillingPlan: (StudioBillingPlan) -> Unit,
    googlePlanOffers: List<uk.co.eggcraft.studioflow.billing.StudioGooglePlanOffer> = emptyList(),
    googleStorageOffers: List<uk.co.eggcraft.studioflow.billing.StudioGoogleStorageOffer> = emptyList(),
    googleBillingPurchasing: Boolean = false,
    onLoadGooglePlayProducts: () -> Unit = {},
    onPurchaseGooglePlan: (android.app.Activity, uk.co.eggcraft.studioflow.billing.StudioGooglePlanOffer) -> Unit = { _, _ -> },
    onPurchaseGoogleStorageAddon: (android.app.Activity, uk.co.eggcraft.studioflow.billing.StudioGoogleStorageOffer) -> Unit = { _, _ -> },
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
    onSaveMessageWorkspaceSettings: (uk.co.eggcraft.studioflow.data.model.StudioMessageWorkspaceSettings) -> Unit = {},
    onReloadMessageWorkspaceSettings: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item { DetailTopBar(section = section, onBack = onBack, showBack = showBack) }
        item {
            when (section.key) {
                "profileSecurity" -> AccountDetail(
                    state = state,
                    requireDeviceUnlock = requireDeviceUnlock,
                    onSetRequireDeviceUnlock = onSetRequireDeviceUnlock,
                    onUpdateAccountProfile = onUpdateAccountProfile,
                    onUploadAccountAvatar = onUploadAccountAvatar,
                    onRemoveAccountAvatar = onRemoveAccountAvatar,
                    onUploadWorkspaceLogo = onUploadWorkspaceLogo,
                    onRemoveWorkspaceLogo = onRemoveWorkspaceLogo,
                    onChangeAccountEmail = onChangeAccountEmail,
                    onSendPasswordResetEmail = onSendPasswordResetEmail,
                    onSignOut = onSignOut,
                    includeHeader = false,
                    includeProfile = true,
                    includeLogo = false,
                    includeSecurity = true,
                    includeWorkspaceIdentity = false
                )
                "preferences" -> Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    ThemeBrandingDetail(state, onUpdateWorkspaceSettings, showTheme = true, showBranding = false)
                    LanguageLabelsDetail(state, onUpdateWorkspaceSettings, personalOnly = true)
                }
                "about" -> AboutDetail()
                "branding" -> Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    ThemeBrandingDetail(state, onUpdateWorkspaceSettings, showTheme = false, showBranding = true)
                    AccountDetail(
                        state = state,
                        requireDeviceUnlock = false,
                        onSetRequireDeviceUnlock = {},
                        onUpdateAccountProfile = onUpdateAccountProfile,
                        onUploadAccountAvatar = onUploadAccountAvatar,
                        onRemoveAccountAvatar = onRemoveAccountAvatar,
                        onUploadWorkspaceLogo = onUploadWorkspaceLogo,
                        onRemoveWorkspaceLogo = onRemoveWorkspaceLogo,
                        onChangeAccountEmail = onChangeAccountEmail,
                        onSendPasswordResetEmail = {},
                        onSignOut = {},
                        includeHeader = false,
                        includeProfile = false,
                        includeLogo = true,
                        includeSecurity = false,
                        includeWorkspaceIdentity = false,
                        includeWorkspaceIdentityCard = true
                    )
                }
                "workflow" -> WorkflowStepsDetail(state, onUpdateWorkspaceSettings)
                "clientDomain" -> ClientDomainDetail(state)
                "pdf" -> PdfExportDetail(state, onUpdateWorkspaceSettings)
                "quickReply" -> QuickReplySettingsDetail(state, onUpdateWorkspaceSettings)
                "messages" -> MessageSettingsDetail(state, onSaveMessageWorkspaceSettings, onReloadMessageWorkspaceSettings)
                "financial" -> FinancialSettingsDetail(state, onUpdateWorkspaceSettings, onRecalculateFinancialSettings)
                "woo" -> WooCommerceDetail(state)
                "shopify" -> ShopifyDetail(state)
                "inbound" -> InboundDetail(state)
                "safety" -> SafetyUploadsDetail(state, onUpdateWorkspaceSettings)
                "data" -> DataManagementDetail(state, onImportBackup, onConfirmImportBackup, onCancelImportBackup, onDeleteWorkspaceData)
                "account" -> AccountDetail(
                    state = state,
                    requireDeviceUnlock = requireDeviceUnlock,
                    onSetRequireDeviceUnlock = onSetRequireDeviceUnlock,
                    onUpdateAccountProfile = onUpdateAccountProfile,
                    onUploadAccountAvatar = onUploadAccountAvatar,
                    onRemoveAccountAvatar = onRemoveAccountAvatar,
                    onUploadWorkspaceLogo = onUploadWorkspaceLogo,
                    onRemoveWorkspaceLogo = onRemoveWorkspaceLogo,
                    onChangeAccountEmail = onChangeAccountEmail,
                    onSendPasswordResetEmail = onSendPasswordResetEmail,
                    onSignOut = onSignOut,
                    includeHeader = false,
                    includeProfile = false,
                    includeLogo = false,
                    includeSecurity = true
                )
                "support" -> SupportTicketsDetail(state)
                "plan" -> PlanAccessDetail(
                    state = state,
                    onUpdateWorkspaceBillingPlan = onUpdateWorkspaceBillingPlan,
                    googlePlanOffers = googlePlanOffers,
                    googleStorageOffers = googleStorageOffers,
                    googleBillingPurchasing = googleBillingPurchasing,
                    onLoadGooglePlayProducts = onLoadGooglePlayProducts,
                    onPurchaseGooglePlan = onPurchaseGooglePlan,
                    onPurchaseGoogleStorageAddon = onPurchaseGoogleStorageAddon,
                    onRestoreGooglePlayPurchases = onRestoreGooglePlayPurchases
                )
                "team" -> TeamAccessDetail(
                    state = state,
                    onRequestWorkspaceAccess = onRequestWorkspaceAccess,
                    onSwitchWorkspace = onSwitchWorkspace,
                    onApproveJoinRequest = onApproveJoinRequest,
                    onDeclineJoinRequest = onDeclineJoinRequest,
                    onUpdateTeamMemberRole = onUpdateTeamMemberRole,
                    onUpdateTeamMemberAccess = onUpdateTeamMemberAccess,
                    onRemoveTeamMember = onRemoveTeamMember,
                    onSaveCustomRole = onSaveCustomRole,
                    onDeleteCustomRole = onDeleteCustomRole
                )
                "legal" -> LegalLinksDetail()
            }
        }
        item {
            StatusFooter(state)
            Spacer(modifier = Modifier.height(18.dp))
        }
    }
}

@Composable
private fun DetailTopBar(section: SettingsSection, onBack: () -> Unit, showBack: Boolean) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(color = MaterialTheme.colorScheme.surface, shadowElevation = 1.dp) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (showBack) {
                TextButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(t("Settings"), fontWeight = FontWeight.Bold)
                }
            }
            Spacer(modifier = Modifier.weight(1f))
            Icon(section.icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(22.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text(t(section.title), maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
        }
    }
}

@Composable
private fun ThemeBrandingDetail(state: StudioFlowUiState, onSave: (Map<String, Any?>, String) -> Unit, personalTheme: Boolean = true, showBranding: Boolean = false, showTheme: Boolean = true) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val settings = state.workspaceSettings
    var subtitle by rememberSaveable(settings.appSubtitle) { mutableStateOf(settings.appSubtitle) }
    val displayedTheme = when (settings.appTheme.trim()) {
        "Light" -> t("Light")
        "Dark" -> t("Dark")
        else -> t("System")
    }
    DetailColumn {
        if (showTheme) DetailCard(title = t("Theme"), icon = Icons.Filled.Palette) {
            MenuField(
                label = t("Theme"),
                value = displayedTheme,
                options = listOf(t("System"), t("Light"), t("Dark")),
                onSelect = { selected ->
                    val canonicalTheme = when (selected) {
                        t("Light") -> "Light"
                        t("Dark") -> "Dark"
                        else -> "System"
                    }
                    // Theme is ALWAYS personal — every user picks their own theme
                    // across their devices, even workspace owners. Workspace-wide
                    // theme is no longer used.
                    onSave(mapOf("personalAppTheme" to canonicalTheme), t("Theme saved."))
                }
            )
        }
        if (showBranding) DetailCard(title = t("Theme & Branding"), icon = Icons.Filled.Palette) {
            OutlinedTextField(
                value = subtitle,
                onValueChange = {
                    subtitle = it
                    onSave(mapOf("appSubtitle" to it), t("Branding saved."))
                },
                label = { Text(t("Brand Subtitle")) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )
        }
    }
}

@Composable
private fun LanguageLabelsDetail(state: StudioFlowUiState, onSave: (Map<String, Any?>, String) -> Unit, personalOnly: Boolean = false) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    DetailColumn {
        DetailCard(title = t("Language & Labels"), icon = Icons.Filled.Language) {
            MenuField(
                label = t("Select Language"),
                value = state.workspaceSettings.selectedLanguage,
                options = listOf("English", "Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"),
                // Language is ALWAYS personal — same rule as theme: each user picks
                // their own language across their devices, regardless of role.
                onSelect = { onSave(mapOf("personalSelectedLanguage" to it), "Language saved.") }
            )
        }
    }
}

@Composable
private fun GeneralSettingsDetail(
    state: StudioFlowUiState,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit,
    onUpdateAccountProfile: (String, String) -> Unit,
    onUploadAccountAvatar: (ByteArray, String) -> Unit,
    onRemoveAccountAvatar: () -> Unit,
    onUploadWorkspaceLogo: (ByteArray, String, Boolean) -> Unit,
    onRemoveWorkspaceLogo: () -> Unit,
    onChangeAccountEmail: (String) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var selected by rememberSaveable { mutableStateOf<String?>(null) }
    val workspace = state.workspace
    val settings = state.workspaceSettings
    val normalizedRole = workspace?.role.orEmpty().lowercase().replace("_", "").replace("-", "").replace(" ", "")
    val isWorkflowOnly = normalizedRole == "workflow" || normalizedRole == "workflowonly"
    val canManageWorkspaceIdentity = workspace?.isOwner == true || normalizedRole == "owner" || normalizedRole == "admin" || normalizedRole == "member"
    val title = when (selected) {
        "appearance" -> t("Appearance")
        "language" -> t("Language & Region")
        "account" -> t("Profile & Security")
        "about" -> t("About")
        else -> t("General")
    }

    DetailColumn {
        if (selected != null) {
            TextButton(onClick = { selected = null }) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text(t("General"), fontWeight = FontWeight.Bold)
            }
        }
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(18.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 1.dp
        ) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(title, fontSize = 30.sp, fontWeight = FontWeight.ExtraBold)
                Text(
                    when (selected) {
                        "appearance" -> t("Choose your personal app theme.")
                        "language" -> t("Set your personal language across NivaDesk devices.")
                        "account" -> t("Manage your profile and sign-in security in one place.")
                        "about" -> t("Version and ownership information.")
                        else -> t("Keep the everyday workspace identity settings in one quiet place.")
                    },
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }

        when (selected) {
            "appearance" -> ThemeBrandingDetail(state, onUpdateWorkspaceSettings, personalTheme = isWorkflowOnly, showBranding = canManageWorkspaceIdentity)
            "language" -> LanguageLabelsDetail(state, onUpdateWorkspaceSettings, personalOnly = isWorkflowOnly)
            "account" -> AccountDetail(
                state = state,
                requireDeviceUnlock = false,
                onSetRequireDeviceUnlock = {},
                onUpdateAccountProfile = onUpdateAccountProfile,
                onUploadAccountAvatar = onUploadAccountAvatar,
                onRemoveAccountAvatar = onRemoveAccountAvatar,
                onUploadWorkspaceLogo = onUploadWorkspaceLogo,
                onRemoveWorkspaceLogo = onRemoveWorkspaceLogo,
                onChangeAccountEmail = onChangeAccountEmail,
                onSendPasswordResetEmail = {},
                onSignOut = {},
                includeHeader = false,
                includeProfile = true,
                includeLogo = canManageWorkspaceIdentity,
                includeSecurity = true,
                includeWorkspaceIdentity = canManageWorkspaceIdentity
            )
            "about" -> AboutDetail()
            else -> {
                DetailCard(title = t("General"), icon = Icons.Filled.Settings) {
                    GeneralMenuRow(
                        icon = Icons.Filled.Palette,
                        title = t("Appearance"),
                        subtitle = settings.appTheme.ifBlank { t("System") },
                        tint = StudioPurple,
                        onClick = { selected = "appearance" }
                    )
                    GeneralDivider()
                    GeneralMenuRow(
                        icon = Icons.Filled.Language,
                        title = t("Language & Region"),
                        subtitle = settings.selectedLanguage.ifBlank { "English" },
                        tint = StudioBlue,
                        onClick = { selected = "language" }
                    )
                    GeneralDivider()
                    GeneralMenuRow(
                        icon = Icons.Filled.AccountCircle,
                        title = t("Profile & Security"),
                        subtitle = if (isWorkflowOnly) t("Personal profile and sign-in security.") else t("Profile, workspace identity and sign-in security."),
                        tint = uk.co.eggcraft.studioflow.ui.theme.StudioRed,
                        onClick = { selected = "account" }
                    )
                    GeneralDivider()
                    GeneralMenuRow(
                        icon = Icons.Filled.Info,
                        title = t("About"),
                        subtitle = "NivaDesk ${BuildConfig.VERSION_NAME}",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        onClick = { selected = "about" }
                    )
                }
            }
        }
    }
}

@Composable
private fun GeneralMenuRow(
    icon: ImageVector,
    title: String,
    subtitle: String,
    tint: Color,
    onClick: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = Color.Transparent,
        onClick = onClick
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 2.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            IconBubble(icon = icon, tint = tint, container = tint.copy(alpha = 0.12f), size = 38.dp)
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(title, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
                Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun GeneralDivider() {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    HorizontalDivider(modifier = Modifier.padding(start = 52.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f))
}

@Composable
private fun WorkflowStepsDetail(state: StudioFlowUiState, onSave: (Map<String, Any?>, String) -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val settings = state.workspaceSettings
    var statusExpanded by rememberSaveable { mutableStateOf(false) }
    var businessPrompt by rememberSaveable(settings.businessDescriptionPrompt) { mutableStateOf(settings.businessDescriptionPrompt) }
    val statusPool = listOf("Not Yet", "In Progress", t("Pending"), "Ready", "Ready to Ship", "Done", t("Cancelled"), "Design", "Painting", "Shipped")
    DetailColumn {
        DetailCard(title = t("Business Type"), icon = Icons.Filled.Business) {
            MenuField(
                label = t("Select Industry"),
                value = settings.businessType,
                options = uk.co.eggcraft.studioflow.features.shell.onboardingBusinessTypeNames +
                    "Other / Prompt Based",
                onSelect = { selectedType ->
                    // Match the onboarding screen: changing the industry refreshes the
                    // description to that industry's seed, unless the owner has typed a
                    // custom description (current text is not one of the known seeds).
                    val current = settings.businessDescriptionPrompt
                    val keepCustom = current.isNotBlank() &&
                        !uk.co.eggcraft.studioflow.features.shell.isOnboardingPromptSeed(current)
                    val updates = mutableMapOf<String, Any?>("businessType" to selectedType)
                    if (!keepCustom) {
                        val seed = uk.co.eggcraft.studioflow.features.shell.onboardingPromptSeed(selectedType, lang)
                        businessPrompt = seed
                        updates["businessDescriptionPrompt"] = seed
                    }
                    onSave(updates, t("Business type saved."))
                }
            )
            Surface(shape = RoundedCornerShape(12.dp), color = StudioPurple.copy(alpha = 0.08f)) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.AutoAwesome, contentDescription = null, tint = StudioPurple)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(t("Smart Business Description"), fontWeight = FontWeight.ExtraBold)
                        Spacer(modifier = Modifier.weight(1f))
                        TextButton(onClick = {
                            businessPrompt = ""
                            onSave(mapOf("businessDescriptionPrompt" to ""), t("Business description cleared."))
                        }) { Text(t("Clear")) }
                    }
                    Text(t("Describe what the business does and which workflow steps matter."), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    OutlinedTextField(
                        value = businessPrompt,
                        onValueChange = {
                            businessPrompt = it
                            onSave(mapOf("businessDescriptionPrompt" to it), t("Business description saved."))
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(170.dp)
                    )
                    Button(
                        onClick = { onSave(smartWorkflowTemplateUpdates(businessPrompt, settings.businessType), t("Smart template applied.")) },
                        colors = ButtonDefaults.buttonColors(containerColor = StudioPurple)
                    ) {
                        Icon(Icons.Outlined.AutoAwesome, contentDescription = null)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(t("Smart Customize"), fontWeight = FontWeight.ExtraBold)
                    }
                }
            }
            Button(onClick = { onSave(standardWorkflowTemplate(settings.businessType), t("Standard template applied.")) }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Filled.Settings, contentDescription = null)
                Spacer(modifier = Modifier.width(6.dp))
                Text(t("Apply Standard Template"), fontWeight = FontWeight.ExtraBold)
            }
        }
        DetailCard(title = t("Status Menu Options"), icon = Icons.Filled.CheckCircle) {
            Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, onClick = { statusExpanded = !statusExpanded }) {
                Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = StudioBlue)
                    Spacer(modifier = Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(if (statusExpanded) t("Hide Status Options") else t("Show Status Options"), fontWeight = FontWeight.ExtraBold)
                        Text("${settings.activeStatuses.size} " + t("active statuses selected"), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text(if (statusExpanded) "Collapse" else "Expand", color = StudioBlue, fontWeight = FontWeight.ExtraBold)
                }
            }
            if (statusExpanded) {
                statusPool.forEach { status ->
                    SettingSwitch(
                        label = status,
                        checked = settings.activeStatuses.contains(status),
                        onCheckedChange = { checked ->
                            val next = settings.activeStatuses.toMutableSet()
                            if (checked) next.add(status) else next.remove(status)
                            onSave(mapOf("activeStatusesJSON" to stringArrayJson(next.toList())), "Status options saved.")
                        }
                    )
                }
            }
        }
        DetailCard(title = "Production Steps", icon = Icons.Filled.Timeline) {
            EditableNameList(
                title = t("Custom Status Menus"),
                addLabel = "Add Step",
                values = settings.customSteps,
                onChange = { onSave(mapOf("customStepsJSON" to titleArrayJson(it)), "Production steps saved.") }
            )
            HorizontalDivider()
            EditableNameList(
                title = t("Production Toggles (Yes/No)"),
                addLabel = "Add Toggle",
                values = settings.customToggles,
                onChange = { onSave(mapOf("customTogglesJSON" to titleArrayJson(it)), "Production toggles saved.") }
            )
            HorizontalDivider()
            Text(t("Dashboard Highlights"), fontWeight = FontWeight.ExtraBold)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                MenuChip(value = settings.summaryStep1, options = settings.customSteps.ifEmpty { listOf("Design", "Painting") }, modifier = Modifier.weight(1f)) {
                    onSave(mapOf("summaryStep1" to it), "Dashboard highlights saved.")
                }
                MenuChip(value = settings.summaryStep2, options = settings.customSteps.ifEmpty { listOf("Design", "Painting") }, modifier = Modifier.weight(1f)) {
                    onSave(mapOf("summaryStep2" to it), "Dashboard highlights saved.")
                }
            }
            Text(t("Order List Badges"), fontWeight = FontWeight.ExtraBold)
            Text(t("Choose which two production statuses appear on the small order cards."), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                MenuChip(value = settings.orderListStep1, options = settings.customSteps.ifEmpty { listOf("Design", "Painting") }, modifier = Modifier.weight(1f)) {
                    onSave(mapOf("orderListStep1" to it), "Order list badges saved.")
                }
                MenuChip(value = settings.orderListStep2, options = settings.customSteps.ifEmpty { listOf("Design", "Painting") }, modifier = Modifier.weight(1f)) {
                    onSave(mapOf("orderListStep2" to it), "Order list badges saved.")
                }
            }
        }
        DetailCard(title = "Workspace Blocks", icon = Icons.Filled.Settings) {
            TwoColumnSwitches(
                listOf(
                    SwitchSpec("Preview Image", settings.showCardPreview, "showCardPreview"),
                    SwitchSpec("Order Summary", settings.showCardSummary, "showCardSummary"),
                    SwitchSpec("Customer & Design", settings.showCardCustomer, "showCardCustomer"),
                    SwitchSpec("Customer Notes", settings.showCardCustomerNotes, "showCardCustomerNotes"),
                    SwitchSpec("Delivery Date", settings.showCardDelivery, "showCardDelivery"),
                    SwitchSpec("Priority / Risk", settings.showCardPriority, "showCardPriority"),
                    SwitchSpec("Materials & Inventory", settings.showCardMaterials, "showCardMaterials"),
                    SwitchSpec("Communication", settings.showCardCommunication, "showCardCommunication"),
                    SwitchSpec(t("Special Notes"), settings.showCardNotes, "showCardNotes"),
                    SwitchSpec("Client Files", settings.showCardClientFiles, "showCardClientFiles"),
                    SwitchSpec("To Do", settings.showCardTodo, "showCardTodo"),
                    SwitchSpec("Work Time", settings.showCardWorkTime, "showCardWorkTime"),
                    SwitchSpec("Financial Info", settings.showCardFinancial, "showCardFinancial"),
                    SwitchSpec("Production Status", settings.showCardStatus, "showCardStatus"),
                    SwitchSpec("Shipping & Tracking", settings.showCardShipping, "showCardShipping"),
                    SwitchSpec("Schedule & Alerts", settings.showCardSchedule, "showCardSchedule"),
                    SwitchSpec("History / Log", settings.showCardHistoryLog, "showCardHistoryLog")
                ),
                onSave = { key, value -> onSave(mapOf(key to value), "Workspace blocks saved.") }
            )
        }
    }
}

@Composable
private fun PdfExportDetail(state: StudioFlowUiState, onSave: (Map<String, Any?>, String) -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val settings = state.workspaceSettings
    val normalizedRole = state.workspace?.role.orEmpty().lowercase().replace("_", "").replace("-", "").replace(" ", "")
    val isWorkflowOnly = normalizedRole == "workflow" || normalizedRole == "workflowonly"
    DetailColumn {
        DetailCard(title = t("PDF Export Settings"), icon = Icons.Filled.Description) {
            if (isWorkflowOnly) {
                Text(
                    "PDF Export remains available for your workflow. Workspace-wide PDF settings are owner-managed, and payment or financial PDF fields are hidden for this role.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                HorizontalDivider()
                Text(t("Your visible non-financial sections"), fontWeight = FontWeight.ExtraBold)
                TwoColumnSwitches(
                    listOf(
                        SwitchSpec("Customer & Design", settings.pdfShowCustomer, "personalPdfShowCustomer"),
                        SwitchSpec("Contact & Notes", settings.pdfShowContact, "personalPdfShowContact"),
                        SwitchSpec("Preview Image", settings.pdfShowPreview, "personalPdfShowPreview"),
                        SwitchSpec("Materials & Inventory", settings.pdfShowMaterials, "personalPdfShowMaterials"),
                        SwitchSpec("Priority / Risk", settings.pdfShowPriority, "personalPdfShowPriority"),
                        SwitchSpec("Production Status", settings.pdfShowStatus, "personalPdfShowStatus"),
                        SwitchSpec("Shipping & Tracking", settings.pdfShowShipping, "personalPdfShowShipping"),
                        SwitchSpec("Billing Address", settings.pdfShowAddress, "personalPdfShowAddress"),
                        SwitchSpec("Shipping Address", settings.pdfShowShippingAddress, "personalPdfShowShippingAddress")
                    ),
                    onSave = { key, value -> onSave(mapOf(key to value), "Personal PDF preference saved.") }
                )
            } else {
                TwoColumnSwitches(
                    listOf(
                        SwitchSpec("Customer & Design", settings.pdfShowCustomer, "pdfShowCustomer"),
                        SwitchSpec("Contact & Notes", settings.pdfShowContact, "pdfShowContact"),
                        SwitchSpec("Preview Image", settings.pdfShowPreview, "pdfShowPreview"),
                        SwitchSpec("Materials & Inventory", settings.pdfShowMaterials, "pdfShowMaterials"),
                        SwitchSpec("Priority / Risk", settings.pdfShowPriority, "pdfShowPriority"),
                        SwitchSpec("Financials: Paid & Remaining", settings.pdfShowFinCustomer, "pdfShowFinCustomer"),
                        SwitchSpec("Payment Method", settings.pdfShowPaymentMethod, "pdfShowPaymentMethod"),
                        SwitchSpec("Internal Financials", settings.pdfShowFinInternal, "pdfShowFinInternal"),
                        SwitchSpec("Production Status", settings.pdfShowStatus, "pdfShowStatus"),
                        SwitchSpec("Shipping & Tracking", settings.pdfShowShipping, "pdfShowShipping"),
                        SwitchSpec("Billing Address", settings.pdfShowAddress, "pdfShowAddress"),
                        SwitchSpec("Shipping Address", settings.pdfShowShippingAddress, "pdfShowShippingAddress")
                    ),
                    onSave = { key, value -> onSave(mapOf(key to value), "PDF settings saved.") }
                )
                HorizontalDivider()
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(t("Company invoice numbers"), fontWeight = FontWeight.ExtraBold)
                        Text(t("VAT, EORI, company number or any reference you want to show on PDF invoices."), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    TextButton(onClick = {
                        onSave(mapOf("companyNumbersJSON" to companyNumbersJson(settings.companyNumbers + StudioCompanyNumber("New Number", ""))), "Invoice numbers saved.")
                    }) {
                        Icon(Icons.Filled.AddCircle, contentDescription = null)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(t("Add"))
                    }
                }
                settings.companyNumbers.forEachIndexed { index, item ->
                    CompanyNumberRow(
                        item = item,
                        onChange = { nextItem ->
                            val next = settings.companyNumbers.toMutableList().also { it[index] = nextItem }
                            onSave(mapOf("companyNumbersJSON" to companyNumbersJson(next)), "Invoice numbers saved.")
                        },
                        onDelete = {
                            val next = settings.companyNumbers.toMutableList().also { it.removeAt(index) }
                            onSave(mapOf("companyNumbersJSON" to companyNumbersJson(next)), "Invoice numbers saved.")
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun QuickReplySettingsDetail(state: StudioFlowUiState, onSave: (Map<String, Any?>, String) -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val settings = state.workspaceSettings
    val canManageCoreAI = state.workspace?.isOwner == true
    var selectedReplyMode by rememberSaveable(settings.replyMode) { mutableStateOf(settings.replyMode) }
    var apiKey by rememberSaveable { mutableStateOf("") }
    var knowledge by rememberSaveable(settings.aiKnowledgeBase) { mutableStateOf(settings.aiKnowledgeBase) }
    var contributionText by rememberSaveable { mutableStateOf("") }
    var products by remember(settings.quickReplyProducts) { mutableStateOf(settings.quickReplyProducts.ifEmpty { defaultQuickReplyProducts() }) }
    var rules by remember(settings.quickReplyRules) { mutableStateOf(settings.quickReplyRules.ifEmpty { defaultQuickReplyRules() }) }
    val templatesDirty = products != settings.quickReplyProducts || rules != settings.quickReplyRules
    fun saveTemplates(message: String = "Offline template settings saved.") {
        onSave(
            mapOf(
                "customProductsJSON" to quickReplyTemplatesJson(products),
                "customRulesJSON" to quickReplyTemplatesJson(rules)
            ),
            message
        )
    }
    DetailColumn {
        DetailCard(title = t("Quick Reply Settings"), icon = Icons.Outlined.AutoAwesome) {
            if (canManageCoreAI) {
                val menuEnabled = state.workspace?.quickReplyMenuEnabled ?: true
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)
                ) {
                    Text(
                        t("Show \"AI Replies\" in the menu"),
                        modifier = Modifier.weight(1f),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    androidx.compose.material3.Switch(
                        checked = menuEnabled,
                        onCheckedChange = { onSave(mapOf("quickReplyMenuEnabled" to it), "Saved.") }
                    )
                }
            }
            Text(t("Reply Engine"), fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
            SegmentedRow(listOf("On-Device AI", "OpenAI Online", "Offline Template"), engineLabel(selectedReplyMode)) {
                val mode = when (it) {
                    "On-Device AI" -> "Apple"
                    "Offline Template" -> "Offline"
                    else -> "AI"
                }
                selectedReplyMode = mode
                onSave(mapOf("replyMode" to mode), "Reply engine saved.")
            }
            Text(engineDescription(selectedReplyMode), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text(t("Default Reply Style"), fontWeight = FontWeight.ExtraBold)
                    Text(t("Politeness"), color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
                    SegmentedRow(listOf("Direct", "Warm", t("Very Polite")), settings.quickReplyPoliteness) {
                        onSave(mapOf("quickReplyPoliteness" to it), "Reply style saved.")
                    }
                    Text(t("Length"), color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
                    SegmentedRow(listOf("Short", "Balanced", "Detailed"), settings.quickReplyLength) {
                        onSave(mapOf("quickReplyLength" to it), "Reply style saved.")
                    }
                    Text(t("These are your personal Quick Reply settings and sync across your devices. Android on-device AI requires Gemini Nano support; Offline Template works now."), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (canManageCoreAI) {
                OutlinedTextField(
                    value = apiKey,
                    onValueChange = { apiKey = it },
                    label = { Text(t("OpenAI API Key")) },
                    placeholder = { Text(if (settings.hasOpenAIKey) "Key configured - paste to replace" else "sk-proj-...") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation()
                )
                Button(
                    onClick = {
                        onSave(mapOf("openAIKey" to apiKey), "OpenAI key saved securely.")
                        apiKey = ""
                    },
                    enabled = apiKey.isNotBlank()
                ) { Text(t("Save API Key")) }
                Text(t("The API key is stored server-side and is never shared with team members."), color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(
                    value = knowledge,
                    onValueChange = { knowledge = it },
                    label = { Text(t("Company Knowledge Base (For OpenAI)")) },
                    modifier = Modifier.fillMaxWidth().height(180.dp)
                )
                Button(onClick = { onSave(mapOf("aiKnowledgeBase" to knowledge), "Knowledge base saved.") }) {
                    Text(t("Save Knowledge Base"))
                }
            } else {
                Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(t("OpenAI Online"), fontWeight = FontWeight.ExtraBold)
                        Text(
                            if (settings.hasOpenAIKey) "Workspace OpenAI key configured" else "Workspace OpenAI key not configured",
                            color = if (settings.hasOpenAIKey) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                            fontWeight = FontWeight.Bold
                        )
                        Text(t("Only the workspace owner can manage the API key and main Company Knowledge Base. You can use shared AI replies once configured."), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            if (selectedReplyMode == "Apple" || selectedReplyMode == "Local") {
                OutlinedTextField(
                    value = knowledge,
                    onValueChange = {
                        knowledge = it
                        onSave(mapOf("onDeviceKnowledgeBase" to it), "Your on-device knowledge was saved.")
                    },
                    label = { Text(t("My On-Device Knowledge")) },
                    modifier = Modifier.fillMaxWidth().height(140.dp)
                )
                Text(t("Android on-device generation is not active in this build. A Gemini Nano / ML Kit GenAI integration is required before this mode can generate locally."), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            OutlinedTextField(
                value = contributionText,
                onValueChange = { contributionText = it },
                label = { Text(t("Team Contribution")) },
                placeholder = { Text(t("Add a useful fact or customer-answer instruction...")) },
                modifier = Modifier.fillMaxWidth().height(130.dp)
            )
            Button(
                onClick = {
                    onSave(mapOf("quickReplyContributionText" to contributionText), "Contribution added.")
                    contributionText = ""
                },
                enabled = contributionText.isNotBlank()
            ) { Text(t("Add Contribution")) }
            if (selectedReplyMode == "Offline") {
                HorizontalDivider()
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(t("Offline Template"), fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                        Text(
                            "Your personal products, services and custom rules sync across devices and feed the offline reply engine.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Button(
                        onClick = { saveTemplates() },
                        enabled = templatesDirty && !state.settingsSaving,
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text(if (state.settingsSaving) "Saving..." else "Save", fontWeight = FontWeight.ExtraBold)
                    }
                }
                BoxWithConstraints {
                    val wide = maxWidth >= 720.dp
                    if (wide) {
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                            QuickReplyTemplateEditor(
                                title = t("Products / Services"),
                                subtitle = "Reusable products, packages, services and price notes.",
                                addLabel = "Add Product",
                                items = products,
                                onItemsChange = { products = it },
                                modifier = Modifier.weight(1f)
                            )
                            QuickReplyTemplateEditor(
                                title = t("Custom Rules / FAQs"),
                                subtitle = "Delivery, payment, revision, refund or support rules.",
                                addLabel = "Add Rule",
                                items = rules,
                                onItemsChange = { rules = it },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    } else {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            QuickReplyTemplateEditor(
                                title = t("Products / Services"),
                                subtitle = "Reusable products, packages, services and price notes.",
                                addLabel = "Add Product",
                                items = products,
                                onItemsChange = { products = it }
                            )
                            QuickReplyTemplateEditor(
                                title = t("Custom Rules / FAQs"),
                                subtitle = "Delivery, payment, revision, refund or support rules.",
                                addLabel = "Add Rule",
                                items = rules,
                                onItemsChange = { rules = it }
                            )
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    OutlinedButton(
                        onClick = {
                            products = defaultQuickReplyProducts()
                            rules = defaultQuickReplyRules()
                        },
                        enabled = !state.settingsSaving,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text(t("Reset Defaults"), fontWeight = FontWeight.ExtraBold)
                    }
                    Button(
                        onClick = { saveTemplates() },
                        enabled = templatesDirty && !state.settingsSaving,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text(if (state.settingsSaving) "Saving..." else "Save Templates", fontWeight = FontWeight.ExtraBold)
                    }
                }
            }
        }
    }
}

@Composable
private fun QuickReplyTemplateEditor(
    title: String,
    subtitle: String,
    addLabel: String,
    items: List<QuickReplyTemplateItem>,
    onItemsChange: (List<QuickReplyTemplateItem>) -> Unit,
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(title, fontWeight = FontWeight.ExtraBold)
                    Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, lineHeight = 17.sp)
                }
                TextButton(onClick = { onItemsChange(items + newQuickReplyTemplateItem(addLabel)) }) {
                    Icon(Icons.Filled.AddCircle, contentDescription = null)
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(addLabel)
                }
            }
            items.ifEmpty { listOf(newQuickReplyTemplateItem(addLabel)) }.forEachIndexed { index, item ->
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surface,
                    tonalElevation = 1.dp
                ) {
                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = item.title,
                                onValueChange = { next ->
                                    onItemsChange(items.toMutableList().also { list ->
                                        if (index in list.indices) list[index] = item.copy(title = next)
                                    })
                                },
                                label = { Text(t("Title")) },
                                modifier = Modifier.weight(1f),
                                singleLine = true
                            )
                            IconButton(
                                onClick = {
                                    onItemsChange(items.toMutableList().also { list ->
                                        if (index in list.indices) list.removeAt(index)
                                    }.ifEmpty { listOf(newQuickReplyTemplateItem(addLabel)) })
                                },
                                enabled = items.size > 1
                            ) {
                                Icon(
                                    Icons.Filled.Delete,
                                    contentDescription = "Delete",
                                    tint = if (items.size > 1) DangerRed else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                        OutlinedTextField(
                            value = item.desc,
                            onValueChange = { next ->
                                onItemsChange(items.toMutableList().also { list ->
                                    if (index in list.indices) list[index] = item.copy(desc = next)
                                })
                            },
                            label = { Text(t("Description / answer")) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(96.dp)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun FinancialSettingsDetail(
    state: StudioFlowUiState,
    onSave: (Map<String, Any?>, String) -> Unit,
    onRecalculate: (Map<String, Any?>) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val settings = state.workspaceSettings
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val financeCompanyId = state.workspace?.id ?: ""
    var showClearTaxConfirm by remember { mutableStateOf(false) }
    var clearingTax by remember { mutableStateOf(false) }
    // Recalculating rewrites VAT on every past order. It used to fire on one tap
    // with nothing shown first; now the server says what would change.
    var recalcPreview by remember { mutableStateOf<Map<String, Any?>?>(null) }
    var loadingRecalcPreview by remember { mutableStateOf(false) }
    var selectedCurrency by rememberSaveable(settings.selectedCurrency) { mutableStateOf(settings.selectedCurrency) }
    var selectedDecimalSeparator by rememberSaveable(settings.selectedDecimalSeparator) { mutableStateOf(settings.selectedDecimalSeparator) }
    var feePercentage by rememberSaveable(settings.feePercentage) { mutableStateOf(settingsNumberText(settings.feePercentage)) }
    var taxRuleNameRevenue by rememberSaveable(settings.taxRuleNameRevenue) { mutableStateOf(settings.taxRuleNameRevenue) }
    var taxRuleNameProfit by rememberSaveable(settings.taxRuleNameProfit) { mutableStateOf(settings.taxRuleNameProfit) }
    var defaultTaxRate by rememberSaveable(settings.defaultTaxRate) { mutableStateOf(settingsNumberText(settings.defaultTaxRate)) }
    var defaultDeliveryTime by rememberSaveable(settings.defaultDeliveryTime) { mutableStateOf(settingsNumberText(settings.defaultDeliveryTime)) }
    var taxCalculationType by rememberSaveable(settings.taxCalculationType) { mutableStateOf(settings.taxCalculationType) }
    var taxMilestoneEnabled by rememberSaveable(settings.taxMilestoneEnabled) { mutableStateOf(settings.taxMilestoneEnabled) }
    var taxMilestoneDate by rememberSaveable(settings.taxMilestoneDate) { mutableStateOf(settingsDateInput(settings.taxMilestoneDate)) }
    var corporationTaxEnabled by rememberSaveable(settings.corporationTaxEnabled) { mutableStateOf(settings.corporationTaxEnabled) }
    var corporationTaxRate by rememberSaveable(settings.corporationTaxRate) { mutableStateOf(settingsNumberText(settings.corporationTaxRate)) }
    var invoiceFooterNote by rememberSaveable(settings.invoiceFooterNote) { mutableStateOf(settings.invoiceFooterNote) }
    var financialShowBaseCost by rememberSaveable(settings.financialShowBaseCost) { mutableStateOf(settings.financialShowBaseCost) }
    var financialBaseCostLabel by rememberSaveable(settings.financialBaseCostLabel) { mutableStateOf(settings.financialBaseCostLabel) }
    var financialRemainingItems by remember(settings.financialRemainingItems) { mutableStateOf(normalizeHeadingItems(settings.financialRemainingItems)) }
    var financialExpenseItems by remember(settings.financialExpenseItems) { mutableStateOf(normalizeHeadingItems(settings.financialExpenseItems)) }

    fun payload(): Map<String, Any?> {
        return mapOf(
            "seciliParaBirimi" to selectedCurrency.ifBlank { "£" },
            "seciliOndalik" to if (selectedDecimalSeparator == ",") "," else ".",
            "feePercentage" to parseSettingsNumber(feePercentage, settings.feePercentage).coerceIn(0.0, 100.0),
            "taxRuleNameRevenue" to taxRuleNameRevenue.trim().ifBlank { "Standard VAT (Services/New)" },
            "taxRuleNameProfit" to taxRuleNameProfit.trim().ifBlank { "Margin Scheme (2nd Hand)" },
            "defaultTaxRate" to parseSettingsNumber(defaultTaxRate, settings.defaultTaxRate).coerceIn(0.0, 100.0),
            "defaultDeliveryTime" to parseSettingsNumber(defaultDeliveryTime, settings.defaultDeliveryTime).coerceIn(1.0, 730.0),
            "taxCalculationType" to if (taxCalculationType == "Profit") "Profit" else "Revenue",
            "taxMilestoneEnabled" to taxMilestoneEnabled,
            "taxMilestoneDate" to settingsDateSeconds(taxMilestoneDate, settings.taxMilestoneDate),
            "corporationTaxEnabled" to corporationTaxEnabled,
            "corporationTaxRate" to parseSettingsNumber(corporationTaxRate, settings.corporationTaxRate).coerceIn(0.0, 100.0),
            "invoiceFooterNote" to invoiceFooterNote.trim(),
            "financialShowBaseCost" to financialShowBaseCost,
            "financialBaseCostLabel" to financialBaseCostLabel.trim().ifBlank { "Cost (Base)" },
            "financialRemainingItemsJSON" to genericHeadingItemsJson(financialRemainingItems.filter { isUsableFinancialTitle(it.title, t("Pending")) }),
            "financialExpenseItemsJSON" to genericHeadingItemsJson(financialExpenseItems.filter { isUsableFinancialTitle(it.title, "Cost") })
        )
    }

    DetailColumn {
        DetailCard(title = t("Financial Settings"), icon = Icons.Filled.Percent) {
            SettingsSectionTitle(t("General"))
            MenuField(
                label = t("Currency Symbol"),
                value = selectedCurrency.ifBlank { "£" },
                options = listOf("£", "$", "€", "₺", "AED", "CAD", "AUD", "CHF", "¥"),
                onSelect = { selectedCurrency = it }
            )
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(t("Decimal Separator"), color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
                SegmentedRow(
                    modifier = Modifier.fillMaxWidth(),
                    options = listOf("Dot (.)", "Comma (,)"),
                    selected = if (selectedDecimalSeparator == ",") "Comma (,)" else "Dot (.)",
                    onSelect = { selectedDecimalSeparator = if (it.startsWith(t("Comma"))) "," else "." }
                )
                Text(
                    t("Changing the currency symbol only relabels amounts — existing records are never converted between currencies. The decimal separator changes how numbers are shown; CSV exports always use a dot and a separate Currency column."),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall
                )
            }
            PercentTextField(
                label = "Avg. Platform Fee (%)",
                value = feePercentage,
                enabled = !state.settingsSaving,
                onValueChange = { feePercentage = cleanSettingsNumberInput(it) }
            )

            HorizontalDivider()
            SettingsSectionTitle("Tax / VAT Settings")
            OutlinedTextField(
                value = taxRuleNameRevenue,
                onValueChange = { taxRuleNameRevenue = it },
                label = { Text(t("Rule 1 (Revenue)")) },
                enabled = !state.settingsSaving,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )
            OutlinedTextField(
                value = taxRuleNameProfit,
                onValueChange = { taxRuleNameProfit = it },
                label = { Text(t("Rule 2 (Profit)")) },
                enabled = !state.settingsSaving,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )
            PercentTextField(
                label = t("Default VAT Rate (%)"),
                value = defaultTaxRate,
                enabled = !state.settingsSaving,
                onValueChange = { defaultTaxRate = cleanSettingsNumberInput(it) }
            )
            PercentTextField(
                label = t("Default delivery time for new orders (days)"),
                value = defaultDeliveryTime,
                enabled = !state.settingsSaving,
                suffix = t("days"),
                onValueChange = { defaultDeliveryTime = cleanSettingsNumberInput(it) }
            )
            MenuField(
                label = t("Calculate Tax On"),
                value = if (taxCalculationType == "Profit") taxRuleNameProfit.ifBlank { "Profit" } else taxRuleNameRevenue.ifBlank { "Revenue" },
                options = listOf(taxRuleNameRevenue.ifBlank { "Revenue" }, taxRuleNameProfit.ifBlank { "Profit" }),
                onSelect = { selected ->
                    taxCalculationType = if (selected == taxRuleNameProfit.ifBlank { "Profit" }) "Profit" else "Revenue"
                }
            )
            SettingSwitch(t("Use Tax Transition Date"), taxMilestoneEnabled) { taxMilestoneEnabled = it }
            if (taxMilestoneEnabled) {
                OutlinedTextField(
                    value = taxMilestoneDate,
                    onValueChange = { taxMilestoneDate = it.take(10) },
                    label = { Text(t("VAT Registration Date")) },
                    placeholder = { Text("YYYY-MM-DD") },
                    enabled = !state.settingsSaving,
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
            }
            HorizontalDivider()
            SettingsSectionTitle(t("Corporation Tax"))
            SettingSwitch(t("Enable Corporation Tax"), corporationTaxEnabled) { corporationTaxEnabled = it }
            if (corporationTaxEnabled) {
                PercentTextField(
                    label = t("Corporation Tax Rate (%)"),
                    value = corporationTaxRate,
                    enabled = !state.settingsSaving,
                    onValueChange = { corporationTaxRate = cleanSettingsNumberInput(it) }
                )
                OutlinedTextField(
                    value = invoiceFooterNote,
                    onValueChange = { invoiceFooterNote = it },
                    label = { Text(t("Invoice Footer / Payment Terms")) },
                    enabled = !state.settingsSaving,
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                    maxLines = 4
                )
            }
            HorizontalDivider()
            SettingsSectionTitle("Order Detail Finance Card")
            SettingSwitch("Show Base Cost", financialShowBaseCost) { financialShowBaseCost = it }
            OutlinedTextField(
                value = financialBaseCostLabel,
                onValueChange = { financialBaseCostLabel = it },
                label = { Text(t("Base Cost Label")) },
                enabled = !state.settingsSaving,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )
            EditableHeadingItemList(
                title = t("Extra Remaining / Pending Rows"),
                addLabel = "Add Pending",
                values = financialRemainingItems,
                normalizeValues = ::normalizeHeadingItems,
                itemLabel = "Pending row",
                onChange = { financialRemainingItems = normalizeHeadingItems(it).filter { item -> isUsableFinancialTitle(item.title, t("Pending")) } }
            )
            EditableHeadingItemList(
                title = t("Extra Cost Rows"),
                addLabel = "Add Cost",
                values = financialExpenseItems,
                normalizeValues = ::normalizeHeadingItems,
                itemLabel = "Cost row",
                onChange = { financialExpenseItems = normalizeHeadingItems(it).filter { item -> isUsableFinancialTitle(item.title, "Cost") } }
            )
            HorizontalDivider()
            Text(
                "Changing the default calculation model sets the tax rule for new projects. Use recalculation when existing projects should adopt the current VAT rule, default VAT rate and platform fee.",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                Button(
                    onClick = { onSave(payload(), "Financial settings saved.") },
                    enabled = !state.settingsSaving,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text(if (state.settingsSaving) "Saving..." else "Save Financial Settings", fontWeight = FontWeight.ExtraBold)
                }
                Button(
                    onClick = {
                        loadingRecalcPreview = true
                        scope.launch {
                            try {
                                val result = com.google.firebase.functions.FirebaseFunctions.getInstance("europe-west2")
                                    .getHttpsCallable("previewFinancialRecalculationForOrders")
                                    .call(hashMapOf("companyId" to financeCompanyId))
                                    .await()
                                @Suppress("UNCHECKED_CAST")
                                recalcPreview = result.data as? Map<String, Any?>
                            } catch (error: Exception) {
                                Toast.makeText(context, error.message ?: t("Preview could not be loaded."), Toast.LENGTH_SHORT).show()
                            }
                            loadingRecalcPreview = false
                        }
                    },
                    enabled = !state.settingsSaving && !loadingRecalcPreview && financeCompanyId.isNotEmpty(),
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = StudioOrange),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text(t("Recalculate Taxes"), fontWeight = FontWeight.ExtraBold)
                }
            }
            Button(
                onClick = { showClearTaxConfirm = true },
                enabled = !clearingTax && financeCompanyId.isNotEmpty(),
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = DangerRed),
                shape = RoundedCornerShape(10.dp)
            ) {
                Text(if (clearingTax) t("Removing VAT...") else t("Remove VAT from all orders"), fontWeight = FontWeight.ExtraBold)
            }
        }
    }

    recalcPreview?.let { preview ->
        fun count(key: String): Long = (preview[key] as? Number)?.toLong() ?: 0L
        @Suppress("UNCHECKED_CAST")
        val totals = preview["totals"] as? Map<String, Any?> ?: emptyMap()
        fun money(key: String): String {
            val value = (totals[key] as? Number)?.toDouble() ?: 0.0
            return String.format(Locale.UK, "%,.2f", value)
        }
        val wouldChange = count("wouldUpdateCount")
        AlertDialog(
            onDismissRequest = { recalcPreview = null },
            title = {
                Text(
                    if (wouldChange == 0L) t("Nothing would change")
                    else "${t("Recalculate")} $wouldChange / ${count("orderCount")}"
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(t("This preview does not change anything yet."))
                    Text("${t("Projects that would change")}: $wouldChange")
                    Text("${t("Skipped — tax came from your shop")}: ${count("skippedIntegrationCount")}")
                    Text("${t("At 0% — would move to the default rate")}: ${count("zeroRateForcedToDefaultCount")}")
                    Text("${t("VAT total before")}: ${money("taxBefore")}")
                    Text("${t("VAT total after")}: ${money("taxAfter")}")
                }
            },
            confirmButton = {
                if (wouldChange > 0L) {
                    Button(onClick = {
                        recalcPreview = null
                        onRecalculate(payload())
                    }) { Text(t("Apply these changes")) }
                }
            },
            dismissButton = { TextButton(onClick = { recalcPreview = null }) { Text(t("Cancel")) } }
        )
    }

    if (showClearTaxConfirm) {
        AlertDialog(
            onDismissRequest = { showClearTaxConfirm = false },
            title = { Text(t("Remove VAT?")) },
            text = { Text(t("This sets VAT/tax to 0 on all orders. Use this when VAT does not apply (e.g. you export). This cannot be undone.")) },
            confirmButton = {
                Button(
                    onClick = {
                        showClearTaxConfirm = false
                        clearingTax = true
                        scope.launch {
                            try {
                                val result = com.google.firebase.functions.FirebaseFunctions.getInstance("europe-west2")
                                    .getHttpsCallable("clearAllOrdersTax")
                                    .call(hashMapOf("companyId" to financeCompanyId))
                                    .await()
                                @Suppress("UNCHECKED_CAST")
                                val data = result.data as? Map<String, Any?>
                                val message = (data?.get("message") as? String) ?: t("VAT removed from all orders.")
                                Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
                            } catch (error: Exception) {
                                Toast.makeText(context, error.message ?: t("VAT could not be removed."), Toast.LENGTH_SHORT).show()
                            }
                            clearingTax = false
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = DangerRed)
                ) { Text(t("Remove")) }
            },
            dismissButton = { TextButton(onClick = { showClearTaxConfirm = false }) { Text(t("Cancel")) } }
        )
    }
}

@Composable
private fun SettingsSectionTitle(title: String) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(title, fontWeight = FontWeight.ExtraBold)
        HorizontalDivider(modifier = Modifier.weight(1f))
    }
}

@Composable
private fun PercentTextField(label: String, value: String, enabled: Boolean, suffix: String = "%", onValueChange: (String) -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(label, modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            enabled = enabled,
            suffix = { Text(suffix) },
            singleLine = true,
            modifier = Modifier.width(150.dp)
        )
    }
}

private fun settingsNumberText(value: Double): String {
    return if (value % 1.0 == 0.0) {
        value.toInt().toString()
    } else {
        String.format(Locale.UK, "%.2f", value).trimEnd('0').trimEnd('.')
    }
}

private fun cleanSettingsNumberInput(value: String): String {
    val filtered = value.filter { it.isDigit() || it == '.' }
    val firstDot = filtered.indexOf('.')
    return if (firstDot < 0) {
        filtered.take(5)
    } else {
        filtered.take(firstDot + 1) + filtered.drop(firstDot + 1).filter { it != '.' }.take(2)
    }
}

private fun parseSettingsNumber(value: String, fallback: Double): Double {
    return value.toDoubleOrNull() ?: fallback
}

private fun settingsDateInput(seconds: Double): String {
    val timestamp = if (seconds > 0) seconds else System.currentTimeMillis() / 1000.0
    return SimpleDateFormat("yyyy-MM-dd", Locale.UK).format(Date((timestamp * 1000).toLong()))
}

private fun settingsDateSeconds(value: String, fallback: Double): Double {
    return runCatching {
        SimpleDateFormat("yyyy-MM-dd", Locale.UK).parse(value)?.time?.div(1000.0)
    }.getOrNull() ?: fallback.takeIf { it > 0 } ?: (System.currentTimeMillis() / 1000.0)
}

// ===================== CUSTOMER PORTAL DOMAIN (owner only) =====================
// Settings → Customer Portal Domain. Mirrors the web ClientDomainSection: every
// workspace claims a free subdomain (name.nivadesk.app); Pro and Team connect a
// hostname of their own with one CNAME. Backend callables are owner-only.

// Server messages from the clientDomains callables are human-readable sentences
// ("That subdomain is already taken."). Mirror the web cleanup: strip a leading
// "code:" prefix and fall back to a generic line for opaque codes.
private fun clientDomainErrorMessage(failure: Throwable, fallback: String): String {
    val raw = failure.message.orEmpty()
    val cleaned = raw.replace(Regex("^[A-Za-z_-]+:\\s*"), "").trim()
    if (cleaned.isEmpty()) return fallback
    if (cleaned.matches(Regex("(?i)^(internal|unknown|unavailable|not[_-]found)$"))) return fallback
    return cleaned
}

@Composable
private fun ClientDomainDetail(state: StudioFlowUiState) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val workspace = state.workspace
    val isOwner = workspace?.role?.trim()?.lowercase() == "owner"
    if (!isOwner) {
        DetailColumn {
            DetailCard(title = t("Customer Portal Domain"), icon = Icons.Filled.Language) {
                Text(t("The client domain is managed by the workspace owner."), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        return
    }

    val repository = remember { uk.co.eggcraft.studioflow.data.firebase.StudioFlowRepository() }
    val scope = rememberCoroutineScope()
    var loading by remember { mutableStateOf(true) }
    var subdomain by remember { mutableStateOf<StudioFlowRepository.ClientDomainRow?>(null) }
    var customDomains by remember { mutableStateOf<List<StudioFlowRepository.ClientDomainRow>>(emptyList()) }
    var cnameTarget by remember { mutableStateOf("customers.nivadesk.app") }
    var slugDraft by remember { mutableStateOf("") }
    var hostDraft by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var statusText by remember { mutableStateOf("") }
    var errorText by remember { mutableStateOf("") }
    // Result of the last explicit Verify press: host to result. Cleared on reload
    // only when the domain turned active (the row disappears from the pending UI).
    var verifyResult by remember { mutableStateOf<Pair<String, StudioFlowRepository.ClientDomainVerifyResult>?>(null) }
    // Customer page branding: "" = the default accent (#2563eb), matching web.
    var accentColor by remember { mutableStateOf("") }
    var showPoweredBy by remember { mutableStateOf(true) }

    suspend fun reload() {
        val ws = workspace ?: return
        if (ws.id.isEmpty()) return
        loading = true
        try {
            val config = repository.getClientDomainConfig(ws)
            subdomain = config.subdomain
            customDomains = config.customDomains
            if (config.cnameTarget.isNotEmpty()) cnameTarget = config.cnameTarget
            slugDraft = config.subdomain?.host ?: ""
            accentColor = config.branding.accentColor
            showPoweredBy = config.branding.showPoweredBy
        } catch (failure: Exception) {
            errorText = t(clientDomainErrorMessage(failure, "The domain settings could not be loaded."))
        } finally {
            loading = false
        }
    }

    fun runAction(doneText: String, failText: String = "Something went wrong.", action: suspend () -> Unit) {
        if (busy) return
        scope.launch {
            busy = true
            statusText = ""
            errorText = ""
            try {
                action()
                reload()
                statusText = t(doneText)
            } catch (failure: Exception) {
                errorText = t(clientDomainErrorMessage(failure, failText))
            } finally {
                busy = false
            }
        }
    }

    LaunchedEffect(workspace?.id) { reload() }

    DetailColumn {
        Text(
            t("Your customers' links — order tracking, estimates and every future customer page — can carry YOUR name instead of ours."),
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        if (errorText.isNotEmpty()) {
            Text(errorText, color = DangerRed, fontWeight = FontWeight.SemiBold)
        } else if (statusText.isNotEmpty()) {
            Text(statusText, color = StudioGreen, fontWeight = FontWeight.SemiBold)
        } else if (loading && subdomain == null && customDomains.isEmpty()) {
            Text(t("Loading…"), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        // ---- Level 1: the free subdomain -----------------------------------
        DetailCard(title = t("Your NivaDesk subdomain"), icon = Icons.Filled.Language) {
            Text(
                t("Included on every plan. Pick a name and your customer links become name.nivadesk.app."),
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = slugDraft,
                    onValueChange = { if (it.length <= 40) slugDraft = it },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    placeholder = { Text(t("your-studio")) }
                )
                Text(".nivadesk.app", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Button(
                onClick = {
                    val ws = workspace ?: return@Button
                    runAction("Subdomain saved.") { repository.setClientSubdomain(ws, slugDraft.trim()) }
                },
                enabled = !busy && slugDraft.isNotBlank()
            ) { Text(t("Save"), fontWeight = FontWeight.ExtraBold) }
            subdomain?.let { row ->
                Text("✅ ${row.host}.nivadesk.app ${t("is yours.")}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        // ---- Level 2: the custom domain -------------------------------------
        DetailCard(title = t("Your own domain"), icon = Icons.Filled.Link) {
            Text(
                t("Pro and Team: connect a subdomain of your own website — track.yourdomain.com — and customer links carry your brand end to end."),
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            OutlinedTextField(
                value = hostDraft,
                onValueChange = { if (it.length <= 253) hostDraft = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                placeholder = { Text("track.yourdomain.com") }
            )
            Button(
                onClick = {
                    val ws = workspace ?: return@Button
                    runAction("Domain added — now create the DNS record below and verify.") {
                        repository.requestClientDomain(ws, hostDraft.trim())
                        hostDraft = ""
                    }
                },
                enabled = !busy && hostDraft.isNotBlank()
            ) { Text(t("Connect"), fontWeight = FontWeight.ExtraBold) }

            customDomains.forEach { domain ->
                ClientDomainRowCard(
                    domain = domain,
                    cnameTarget = cnameTarget,
                    verifyResult = verifyResult?.takeIf { it.first == domain.host }?.second,
                    busy = busy,
                    t = t,
                    onVerify = {
                        val ws = workspace ?: return@ClientDomainRowCard
                        runAction("Checked.") {
                            val result = repository.verifyClientDomain(ws, domain.host)
                            verifyResult = domain.host to result
                        }
                    },
                    onRemove = {
                        val ws = workspace ?: return@ClientDomainRowCard
                        runAction("Domain removed.") { repository.removeClientDomain(ws, domain.host) }
                    }
                )
            }

            Text(
                t("A verified domain is reserved for your workspace; serving your links on it is being rolled out and older nivadesk.app links keep working."),
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        // ---- Branding for the customer-facing pages --------------------------
        // The web offers a native colour input; the app offers the same range as
        // a row of tappable swatches. "" means "use the default accent" and the
        // preview chip shows the web default #2563eb while nothing custom is set.
        DetailCard(title = t("Customer page branding"), icon = Icons.Filled.Palette) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(t("Accent colour"), fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(RoundedCornerShape(9.dp))
                        .background(
                            clientBrandingHexColor(accentColor.ifEmpty { ClientPortalDefaultAccent })
                                ?: MaterialTheme.colorScheme.surfaceVariant
                        )
                        .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(9.dp))
                )
            }
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                ClientBrandingAccentChoices.forEach { hex ->
                    ClientBrandingSwatch(hex = hex, selected = accentColor == hex, onClick = { accentColor = hex })
                }
            }
            if (accentColor.isNotEmpty()) {
                OutlinedButton(onClick = { accentColor = "" }, enabled = !busy) { Text(t("Use the default colour")) }
            }
            SettingSwitch(t("Show “Powered by NivaDesk” on customer pages"), showPoweredBy) { showPoweredBy = it }
            Button(
                onClick = {
                    val ws = workspace ?: return@Button
                    runAction("Branding saved.", "The branding could not be saved.") {
                        repository.saveClientPortalBranding(ws, accentColor, showPoweredBy)
                    }
                },
                enabled = !busy
            ) { Text(t("Save"), fontWeight = FontWeight.ExtraBold) }
            Text(
                t("The accent colours the order tracking page. Hiding the Powered by line is part of the Pro and Team plans."),
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

// The web's colour input shows this blue while no custom accent is stored.
private const val ClientPortalDefaultAccent = "#2563eb"

// Curated accents for the branding swatch row, all lowercase #rrggbb — the
// server accepts "" or a #rrggbb hex, nothing else.
private val ClientBrandingAccentChoices = listOf(
    "#2563eb", "#0ea5e9", "#0d9488", "#2f6f6d", "#16a34a",
    "#f59e0b", "#ea580c", "#dc2626", "#db2777", "#7c3aed", "#111827",
)

private fun clientBrandingHexColor(hex: String): Color? =
    runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrNull()

// One tappable branding colour, styled after the order-card colour swatches.
@Composable
private fun ClientBrandingSwatch(hex: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(32.dp)
            .clip(RoundedCornerShape(9.dp))
            .background(clientBrandingHexColor(hex) ?: MaterialTheme.colorScheme.surfaceVariant)
            .border(
                width = if (selected) 2.dp else 1.dp,
                color = if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outlineVariant,
                shape = RoundedCornerShape(9.dp)
            )
            .clickable { onClick() },
        contentAlignment = Alignment.Center
    ) {
        if (selected) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(Color.White)
            )
        }
    }
}

// One connected custom domain: host + status pill, Verify / Remove, the CNAME
// instruction while pending, and honest feedback after a failed verify.
@Composable
private fun ClientDomainRowCard(
    domain: StudioFlowRepository.ClientDomainRow,
    cnameTarget: String,
    verifyResult: StudioFlowRepository.ClientDomainVerifyResult?,
    busy: Boolean,
    t: (String) -> String,
    onVerify: () -> Unit,
    onRemove: () -> Unit,
) {
    val isActive = domain.status == "active"
    val pillColor = if (isActive) Color(0xFF16A34A) else Color(0xFFB45309)
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    domain.host,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f)
                )
                Surface(shape = RoundedCornerShape(999.dp), color = pillColor.copy(alpha = 0.14f)) {
                    Text(
                        if (isActive) "🟢 ${t("Domain verified")}" else t("Waiting for DNS"),
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = pillColor,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onVerify, enabled = !busy) { Text(t("Verify")) }
                OutlinedButton(onClick = onRemove, enabled = !busy) { Text(t("Remove")) }
            }
            if (!isActive) {
                Text(
                    t("Add this DNS record at your domain provider:"),
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Surface(shape = RoundedCornerShape(8.dp), color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.8f)) {
                    Text(
                        "CNAME  ${domain.host.substringBefore(".")}  →  $cnameTarget",
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                        fontFamily = FontFamily.Monospace,
                        fontSize = 12.sp
                    )
                }
            }
            if (verifyResult != null && !verifyResult.verified) {
                Text(
                    if (verifyResult.found.isNotEmpty())
                        "${t("Found")}: ${verifyResult.found.joinToString(", ")} — ${t("expected")} $cnameTarget. ${t("DNS changes can take up to an hour to spread.")}"
                    else
                        "${t("No CNAME record found yet.")} ${t("DNS changes can take up to an hour to spread.")}",
                    fontSize = 12.sp,
                    color = Color(0xFFB45309)
                )
            }
        }
    }
}

@Composable
private fun WooCommerceDetail(state: StudioFlowUiState) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val companyId = state.workspace?.id.orEmpty().ifEmpty { "YOUR_COMPANY_ID" }
    val repository = remember { uk.co.eggcraft.studioflow.data.firebase.StudioFlowRepository() }
    var tokenizedDeliveryUrl by remember { mutableStateOf("") }
    var deliveryUrlLoading by remember { mutableStateOf(false) }
    LaunchedEffect(state.workspace?.id) {
        val workspace = state.workspace ?: return@LaunchedEffect
        if (workspace.id.isEmpty()) return@LaunchedEffect
        deliveryUrlLoading = true
        tokenizedDeliveryUrl = runCatching { repository.getWooCommerceWebhookDeliveryUrl(workspace) }.getOrDefault("")
        deliveryUrlLoading = false
    }
    val deliveryUrl = when {
        tokenizedDeliveryUrl.isNotEmpty() -> tokenizedDeliveryUrl
        deliveryUrlLoading -> t("Loading...")
        else -> "—"
    }
    DetailColumn {
        DetailCard(title = t("Connect WooCommerce"), icon = Icons.Filled.ShoppingCart) {
            Text(t("To activate this connection, create one WooCommerce webhook and paste the Delivery URL below. After that, new website orders will appear in this workspace automatically."), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(t("This setup only needs to be done once in WooCommerce."), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        DetailCard(title = t("Copy Setup Details"), icon = Icons.Filled.ContentCopy) {
            CopyableValue(t("Your Company ID"), companyId, "Copy Company ID")
            CopyableValue("Delivery URL with Company ID", deliveryUrl, "Copy Delivery URL", isSecret = true)
        }
        DetailCard(title = t("What you need to do"), icon = Icons.Filled.CheckCircle) {
            StepRow("1", "Open WooCommerce webhooks", "In WordPress, open WooCommerce > Settings > Advanced > Webhooks.")
            StepRow("2", "Create a new webhook", "Create a new webhook for NivaDesk orders.")
            StepRow("3", "Set it active", "Set Status to Active and Topic to Order created.")
            StepRow("4", "Paste the Delivery URL", "Paste the copied Delivery URL, save the webhook, then place a test order.")
        }
        DetailCard(title = t("What happens when it is active"), icon = Icons.Filled.CheckCircle) {
            Text(t("New website orders are added to Orders automatically. They also appear in Schedule and are saved under this Company ID."), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ShopifyDetail(state: StudioFlowUiState) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val companyId = state.workspace?.id.orEmpty().ifEmpty { "YOUR_COMPANY_ID" }
    val repository = remember { uk.co.eggcraft.studioflow.data.firebase.StudioFlowRepository() }
    var tokenizedDeliveryUrl by remember { mutableStateOf("") }
    var deliveryUrlLoading by remember { mutableStateOf(false) }
    LaunchedEffect(state.workspace?.id) {
        val workspace = state.workspace ?: return@LaunchedEffect
        if (workspace.id.isEmpty()) return@LaunchedEffect
        deliveryUrlLoading = true
        tokenizedDeliveryUrl = runCatching { repository.getShopifyWebhookDeliveryUrl(workspace) }.getOrDefault("")
        deliveryUrlLoading = false
    }
    val deliveryUrl = when {
        tokenizedDeliveryUrl.isNotEmpty() -> tokenizedDeliveryUrl
        deliveryUrlLoading -> t("Loading...")
        else -> "—"
    }
    var appStores by remember { mutableStateOf<List<uk.co.eggcraft.studioflow.data.firebase.StudioFlowRepository.ShopifyAppStoreSummary>>(emptyList()) }
    var appStoresLoading by remember { mutableStateOf(false) }
    var appStoreBusyShop by remember { mutableStateOf("") }
    var appStoreReloadKey by remember { mutableStateOf(0) }
    var removeCandidate by remember { mutableStateOf<uk.co.eggcraft.studioflow.data.firebase.StudioFlowRepository.ShopifyAppStoreSummary?>(null) }
    val appStoreScope = rememberCoroutineScope()
    val isOwner = state.workspace?.role?.trim()?.lowercase() == "owner"
    LaunchedEffect(state.workspace?.id, appStoreReloadKey) {
        val workspace = state.workspace ?: return@LaunchedEffect
        if (workspace.id.isEmpty()) return@LaunchedEffect
        appStoresLoading = true
        appStores = runCatching { repository.getShopifyAppStores(workspace) }.getOrDefault(emptyList())
        appStoresLoading = false
    }
    removeCandidate?.let { candidate ->
        AlertDialog(
            onDismissRequest = { removeCandidate = null },
            title = { Text(t("Remove this Shopify connection?")) },
            text = { Text(t("Syncing stops immediately. Orders already imported into NivaDesk stay in this workspace.")) },
            confirmButton = {
                TextButton(onClick = {
                    removeCandidate = null
                    val workspace = state.workspace ?: return@TextButton
                    appStoreScope.launch {
                        appStoreBusyShop = candidate.shop
                        runCatching { repository.setShopifyAppStoreState(workspace, candidate.shop, "unlinked") }
                        appStoreBusyShop = ""
                        appStoreReloadKey += 1
                    }
                }) { Text(t("Remove")) }
            },
            dismissButton = { TextButton(onClick = { removeCandidate = null }) { Text(t("Cancel")) } }
        )
    }
    DetailColumn {
        DetailCard(title = t("Connected Shopify stores"), icon = Icons.Filled.ShoppingBag) {
            Text(
                t("Stores connected through the official NivaDesk app on the Shopify App Store. Orders, customers and status updates sync automatically."),
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (appStoresLoading && appStores.isEmpty()) {
                Text(t("Loading..."), color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else if (appStores.isEmpty()) {
                Text(
                    t("No store is connected yet. Install \"NivaDesk – Custom Order Management\" from the Shopify App Store and press Connect inside the app to link this workspace."),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                appStores.forEach { store ->
                    ShopifyAppStoreRow(
                        store = store,
                        t = t,
                        isOwner = isOwner,
                        isBusy = appStoreBusyShop == store.shop,
                        onPauseResume = {
                            val workspace = state.workspace ?: return@ShopifyAppStoreRow
                            appStoreScope.launch {
                                appStoreBusyShop = store.shop
                                val target = if (store.status == "paused") "active" else "paused"
                                runCatching { repository.setShopifyAppStoreState(workspace, store.shop, target) }
                                appStoreBusyShop = ""
                                appStoreReloadKey += 1
                            }
                        },
                        onRemove = { removeCandidate = store }
                    )
                }
                if (!isOwner) {
                    Text(
                        t("Only the workspace owner can pause or remove a store."),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
        DetailCard(title = t("Connect Shopify (manual webhook)"), icon = Icons.Filled.ShoppingBag) {
            Text(t("To activate this connection, create one Shopify order webhook and paste the Delivery URL below. After that, new Shopify orders will appear in this workspace automatically."), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(t("This setup only needs to be done once in Shopify."), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        DetailCard(title = t("Copy Setup Details"), icon = Icons.Filled.ContentCopy) {
            CopyableValue(t("Your Company ID"), companyId, "Copy Company ID")
            CopyableValue("Delivery URL with Company ID", deliveryUrl, "Copy Delivery URL", isSecret = true)
        }
        DetailCard(title = t("What you need to do"), icon = Icons.Filled.CheckCircle) {
            StepRow("1", "Open Shopify webhooks", "In Shopify admin, open Settings > Notifications > Webhooks (or create a custom app for webhooks).")
            StepRow("2", "Create an order webhook", "Add a webhook with event 'Order payment' (recommended) or 'Order creation', and format JSON.")
            StepRow("3", "Paste the Delivery URL", "Paste the copied Delivery URL as the webhook URL and save it.")
            StepRow("4", "Place a test order", "Place a paid test order in your store; it appears in Orders within seconds.")
        }
        DetailCard(title = t("What happens when it is active"), icon = Icons.Filled.CheckCircle) {
            Text(t("New website orders are added to Orders automatically. They also appear in Schedule and are saved under this Company ID."), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ShopifyAppStoreRow(
    store: uk.co.eggcraft.studioflow.data.firebase.StudioFlowRepository.ShopifyAppStoreSummary,
    t: (String) -> String,
    isOwner: Boolean,
    isBusy: Boolean,
    onPauseResume: () -> Unit,
    onRemove: () -> Unit,
) {
    val uriHandler = LocalUriHandler.current
    val statusLabel = when (store.status) {
        "active" -> t("Active")
        "paused" -> t("Paused")
        "uninstalled" -> t("Uninstalled")
        else -> t("Not connected")
    }
    val statusColor = when (store.status) {
        "active" -> Color(0xFF2E7D32)
        "paused" -> Color(0xFFB26A00)
        "uninstalled" -> Color(0xFFC62828)
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        store.shopName.ifBlank { store.shop },
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        store.shop,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Surface(shape = RoundedCornerShape(999.dp), color = statusColor.copy(alpha = 0.14f)) {
                    Text(
                        statusLabel,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = statusColor,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
            Text(
                "${store.syncedOrders} ${t("orders synced")} · ${store.failedCount} ${t("failed")}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = {
                    val handle = store.shop.removeSuffix(".myshopify.com")
                    if (handle.isNotEmpty()) uriHandler.openUri("https://admin.shopify.com/store/$handle")
                }) { Text(t("Open Shopify admin")) }
                if (isOwner && store.status != "uninstalled") {
                    OutlinedButton(onClick = onPauseResume, enabled = !isBusy) {
                        Text(if (store.status == "paused") t("Resume") else t("Pause"))
                    }
                }
                if (isOwner) {
                    OutlinedButton(onClick = onRemove, enabled = !isBusy) { Text(t("Remove")) }
                }
            }
        }
    }
}

@Composable
private fun InboundDetail(state: StudioFlowUiState) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val companyId = state.workspace?.id.orEmpty().ifEmpty { "YOUR_COMPANY_ID" }
    val repository = remember { uk.co.eggcraft.studioflow.data.firebase.StudioFlowRepository() }
    var tokenizedDeliveryUrl by remember { mutableStateOf("") }
    var deliveryUrlLoading by remember { mutableStateOf(false) }
    LaunchedEffect(state.workspace?.id) {
        val workspace = state.workspace ?: return@LaunchedEffect
        if (workspace.id.isEmpty()) return@LaunchedEffect
        deliveryUrlLoading = true
        tokenizedDeliveryUrl = runCatching { repository.getInboundWebhookDeliveryUrl(workspace) }.getOrDefault("")
        deliveryUrlLoading = false
    }
    val deliveryUrl = when {
        tokenizedDeliveryUrl.isNotEmpty() -> tokenizedDeliveryUrl
        deliveryUrlLoading -> t("Loading...")
        else -> "—"
    }
    DetailColumn {
        DetailCard(title = t("Connect any store with one webhook"), icon = Icons.Filled.Link) {
            Text(t("Use Zapier, Make or your own site to POST each new order to the Delivery URL below. Orders appear in Orders and Schedule automatically."), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(t("Works with Wix, Squarespace, Etsy, BigCommerce, custom sites and more."), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        DetailCard(title = t("Copy Setup Details"), icon = Icons.Filled.ContentCopy) {
            CopyableValue(t("Your Company ID"), companyId, "Copy Company ID")
            CopyableValue("Delivery URL with Company ID", deliveryUrl, "Copy Delivery URL", isSecret = true)
        }
        DetailCard(title = t("What you need to do"), icon = Icons.Filled.CheckCircle) {
            StepRow("1", "Pick a connection method", "Most platforms connect through Zapier or Make (a 'Webhooks > POST' action). Developers can also POST directly from their own site.")
            StepRow("2", "Send the order as JSON", "POST a JSON body to the Delivery URL on each new order. At minimum include orderId. Common fields: orderId, customerName, email, phone, total, currency, products, source.")
            StepRow("3", "Order appears automatically", "Each posted order is added to Orders and Schedule, tagged with the source you send.")
        }
        DetailCard(title = t("Example JSON"), icon = Icons.Filled.Description) {
            Text(
                "{\n  \"orderId\": \"1001\",\n  \"customerName\": \"Jane Doe\",\n  \"email\": \"jane@example.com\",\n  \"total\": 120.50,\n  \"currency\": \"GBP\",\n  \"products\": \"Custom dial x1\",\n  \"source\": \"Wix\"\n}",
                fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun SafetyUploadsDetail(state: StudioFlowUiState, onSave: (Map<String, Any?>, String) -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val settings = state.workspaceSettings
    var deviceAccepted by rememberSaveable { mutableStateOf(true) }
    DetailColumn {
        DetailCard(title = t("Safety & Uploads"), icon = Icons.Filled.Shield) {
            Text(t("Use this section to explain the upload rules to your team and reduce the risk of illegal, unsafe or unsuitable files being stored in your company workspace."), color = MaterialTheme.colorScheme.onSurfaceVariant)
            SettingSwitch("Require upload policy acceptance before upload", settings.uploadSafetyRequirePolicyAcceptance) {
                onSave(
                    mapOf("uploadSafetyRequirePolicyAcceptanceV1" to it, "uploadSafetyRequirePolicyAcceptance" to it),
                    t("Upload safety saved.")
                )
            }
            SettingSwitch(t("This device has accepted the upload policy"), deviceAccepted) { deviceAccepted = it }
            StepperRow(
                label = t("Maximum upload size"),
                value = settings.uploadSafetyMaxFileSizeMB,
                suffix = "MB",
                onMinus = {
                    val next = (settings.uploadSafetyMaxFileSizeMB - 1).coerceAtLeast(1)
                    onSave(mapOf("uploadSafetyMaxFileSizeMBV1" to next, "uploadSafetyMaxFileSizeMB" to next), t("Upload limit saved."))
                },
                onPlus = {
                    val next = (settings.uploadSafetyMaxFileSizeMB + 1).coerceAtMost(50)
                    onSave(mapOf("uploadSafetyMaxFileSizeMBV1" to next, "uploadSafetyMaxFileSizeMB" to next), t("Upload limit saved."))
                }
            )
            Text(t("Order previews, logos and avatars accept image files. Client Files accepts images and PDF documents only."), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Surface(shape = RoundedCornerShape(10.dp), color = StudioGreen.copy(alpha = 0.10f)) {
                Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Security, contentDescription = null, tint = StudioGreen)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(if (deviceAccepted) t("Upload policy is accepted on this device.") else "The first upload will ask the user to accept the upload policy.", color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
                }
            }
        }
        DetailCard(title = "What users must understand", icon = Icons.Filled.Person) {
            StepRow("1", "Only upload suitable files", "Users must only upload legal, safe and work-related files that belong in this workspace.")
            StepRow("2", "No illegal or harmful content", "Illegal, abusive, explicit, stolen, harmful or unrelated files must not be uploaded.")
            StepRow("3", "Client approval and rights", "If a file belongs to a client or third party, the user should have permission to use it for the order.")
            StepRow("4", "Owner can remove files", "Workspace owners should remove unsuitable files and can remove users from the workspace if needed.")
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun DataManagementDetail(
    state: StudioFlowUiState,
    onImportBackup: (String) -> Unit,
    onConfirmImportBackup: (Boolean) -> Unit,
    onCancelImportBackup: () -> Unit,
    onDeleteWorkspaceData: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var confirmDelete by rememberSaveable { mutableStateOf(false) }
    var deleteConfirmText by rememberSaveable { mutableStateOf("") }

    // The picked file is previewed server-side (same parse as the real import,
    // no writes) before anything lands; duplicates are skipped by default.
    val pendingImport = state.pendingBackupImport
    if (pendingImport != null) {
        var skipDuplicates by remember(pendingImport) { mutableStateOf(true) }
        val duplicateCount = pendingImport.preview.likelyDuplicateOrders + pendingImport.preview.likelyDuplicateCustomers
        AlertDialog(
            onDismissRequest = onCancelImportBackup,
            title = { Text(t("Import this backup?")) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("${t("Orders in this file")}: ${pendingImport.preview.fileOrders}")
                    Text("${t("Customers in this file")}: ${pendingImport.preview.fileCustomers}")
                    Text("${t("Already in this workspace")}: ${pendingImport.preview.existingOrders}")
                    Text("${t("Look like they are already here")}: $duplicateCount")
                    Text(t("Import adds records — it never replaces or clears anything. Client Files are not included in a backup."))
                    if (pendingImport.preview.truncated) {
                        Text(
                            t("One import is capped at 500 records. The rest will not be imported."),
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                    if (duplicateCount > 0) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(checked = skipDuplicates, onCheckedChange = { skipDuplicates = it })
                            Text(t("Skip likely duplicates"))
                        }
                        if (!skipDuplicates) {
                            Text(
                                t("Some of these look like records you already have. Importing anyway will create a second copy of each."),
                                color = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { onConfirmImportBackup(duplicateCount > 0 && skipDuplicates) }) { Text(t("Import")) }
            },
            dismissButton = {
                TextButton(onClick = onCancelImportBackup) { Text(t("Cancel")) }
            }
        )
    }
    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val text = context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
            if (text.isNullOrBlank()) {
                Toast.makeText(context, t("Backup file could not be read."), Toast.LENGTH_SHORT).show()
            } else {
                onImportBackup(text)
            }
        }
    }

    val companyId = state.workspace?.id ?: ""
    val canSeeFinance = state.workspace?.memberAccess?.financialInfo ?: true
    val availableReports = ExportReport.values().filter { canSeeFinance || !it.isFinance }
    var showExportDialog by remember { mutableStateOf(false) }
    var exportReport by remember { mutableStateOf(if (canSeeFinance) ExportReport.FINANCE else ExportReport.INVOICES) }
    var exportRange by remember { mutableStateOf(ExportRange.THIS_MONTH) }
    var customFrom by remember { mutableStateOf(LocalDate.now(ZoneOffset.UTC)) }
    var customTo by remember { mutableStateOf(LocalDate.now(ZoneOffset.UTC)) }
    var includeTrash by remember { mutableStateOf(false) }
    var bomEnabled by remember { mutableStateOf(true) }
    var useSemicolon by remember { mutableStateOf(false) }
    var exportBusy by remember { mutableStateOf(false) }
    var exportStatus by remember { mutableStateOf("") }
    var exportError by remember { mutableStateOf("") }
    var pendingCsv by remember { mutableStateOf<ByteArray?>(null) }
    var pendingName by remember { mutableStateOf("export.csv") }
    var showFromPicker by remember { mutableStateOf(false) }
    var showToPicker by remember { mutableStateOf(false) }
    val exportSaveLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        val bytes = pendingCsv
        if (uri != null && bytes != null) {
            try {
                context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                Toast.makeText(context, t("CSV saved."), Toast.LENGTH_SHORT).show()
                showExportDialog = false
            } catch (e: Exception) {
                Toast.makeText(context, t("Could not save the file."), Toast.LENGTH_SHORT).show()
            }
        }
    }

    DetailColumn {
        DetailCard(title = t("Data Management"), icon = Icons.Filled.Storage) {
            Text(t("Create a backup before importing or deleting data."), color = MaterialTheme.colorScheme.onSurfaceVariant)
            ActionButton("Export Backup", Icons.Filled.Backup, StudioBlue) {
                shareText(context, "StudioManager_Backup.json", backupJson(state.orders, state.customers, state.workspaceSettings))
            }
            ActionButton("Export CSV", Icons.Filled.TableChart, StudioBlue) {
                showExportDialog = true
            }
            ActionButton("Import Backup", Icons.Filled.Upload, StudioGreen) {
                importLauncher.launch("application/json")
            }
            Text(t("Import will add the backup into the current workspace. It will not clear existing orders automatically."), color = MaterialTheme.colorScheme.onSurfaceVariant)
            HorizontalDivider()
            ActionButton("Delete Data", Icons.Filled.Delete, DangerRed) { confirmDelete = true }
        }
    }

    if (confirmDelete) {
        val canDeleteData = deleteConfirmText.trim().uppercase() == "DELETE DATA"
        AlertDialog(
            onDismissRequest = { confirmDelete = false; deleteConfirmText = "" },
            title = { Text(t("Delete all data?")) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(t("All orders and customers in this workspace will be permanently deleted. Export a backup first if you are unsure."))
                    OutlinedTextField(
                        value = deleteConfirmText,
                        onValueChange = { deleteConfirmText = it },
                        label = { Text(t("Type DELETE DATA to confirm")) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        confirmDelete = false
                        deleteConfirmText = ""
                        onDeleteWorkspaceData()
                    },
                    enabled = canDeleteData,
                    colors = ButtonDefaults.buttonColors(containerColor = DangerRed)
                ) { Text(t(t("Yes, Delete All"))) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false; deleteConfirmText = "" }) { Text(t("Cancel")) } }
        )
    }

    if (showExportDialog) {
        AlertDialog(
            onDismissRequest = { if (!exportBusy) showExportDialog = false },
            title = { Text(t("Export invoices to CSV")) },
            text = {
                Column(
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.verticalScroll(rememberScrollState())
                ) {
                    ExportSelectorRow(t("Report"), exportReport.label, availableReports.map { it.label }) { i -> exportReport = availableReports[i] }
                    Text(exportReport.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    ExportSelectorRow(t("Date range"), exportRange.label, ExportRange.values().map { it.label }) { i -> exportRange = ExportRange.values()[i] }
                    if (exportRange == ExportRange.CUSTOM) {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            OutlinedButton(onClick = { showFromPicker = true }, modifier = Modifier.weight(1f)) { Text("${t("From")}: $customFrom") }
                            OutlinedButton(onClick = { showToPicker = true }, modifier = Modifier.weight(1f)) { Text("${t("To")}: $customTo") }
                        }
                    }
                    ExportSwitchRow(t("Include trashed invoices"), includeTrash) { includeTrash = it }
                    ExportSwitchRow(t("Excel-friendly (UTF-8 BOM)"), bomEnabled) { bomEnabled = it }
                    ExportSwitchRow(t("Semicolon separator ( ; )"), useSemicolon) { useSemicolon = it }
                    if (exportStatus.isNotEmpty()) Text(exportStatus, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (exportError.isNotEmpty()) Text(exportError, style = MaterialTheme.typography.bodySmall, color = DangerRed)
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        exportBusy = true; exportStatus = ""; exportError = ""
                        val (from, to) = exportRangeDates(exportRange, customFrom, customTo)
                        scope.launch {
                            try {
                                val (bytes, name, rowCount) = performOrderExport(
                                    companyId, exportReport.id, from, to, includeTrash,
                                    if (useSemicolon) ";" else ",", bomEnabled
                                )
                                pendingCsv = bytes
                                pendingName = name
                                exportBusy = false
                                exportStatus = if (rowCount > 0) "$rowCount " + t("rows ready.") else t("No invoices matched this date range.")
                                exportSaveLauncher.launch(name)
                            } catch (e: Exception) {
                                exportBusy = false
                                exportError = e.message ?: t("Export failed.")
                            }
                        }
                    },
                    enabled = !exportBusy && companyId.isNotEmpty()
                ) {
                    if (exportBusy) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                    }
                    Text(if (exportBusy) t("Preparing…") else t("Download CSV"))
                }
            },
            dismissButton = { TextButton(onClick = { showExportDialog = false }) { Text(t("Close")) } }
        )
    }

    if (showFromPicker) {
        val pickerState = rememberDatePickerState(initialSelectedDateMillis = customFrom.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { showFromPicker = false },
            confirmButton = {
                TextButton(onClick = {
                    pickerState.selectedDateMillis?.let { customFrom = java.time.Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate() }
                    showFromPicker = false
                }) { Text(t("OK")) }
            },
            dismissButton = { TextButton(onClick = { showFromPicker = false }) { Text(t("Cancel")) } }
        ) { DatePicker(state = pickerState) }
    }
    if (showToPicker) {
        val pickerState = rememberDatePickerState(initialSelectedDateMillis = customTo.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { showToPicker = false },
            confirmButton = {
                TextButton(onClick = {
                    pickerState.selectedDateMillis?.let { customTo = java.time.Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate() }
                    showToPicker = false
                }) { Text(t("OK")) }
            },
            dismissButton = { TextButton(onClick = { showToPicker = false }) { Text(t("Cancel")) } }
        ) { DatePicker(state = pickerState) }
    }
}

// One server-side generator (exportOrders callable) backs web, Mac and Android.
private enum class ExportReport(val id: String, val label: String, val detail: String, val isFinance: Boolean) {
    INVOICES("orders", "Invoices", "One row per invoice — status, dates, contact and totals.", false),
    LINE_ITEMS("lineItems", "Line items", "One row per product/service line on each invoice.", false),
    PAYMENTS("payments", "Payments", "One row per payment received — the cash ledger.", true),
    FINANCE("finance", "Finance", "One row per invoice with accountant columns (revenue, cost, VAT, net profit).", true)
}

private enum class ExportRange(val label: String) {
    THIS_MONTH("This month"), LAST_MONTH("Last month"), THIS_QUARTER("This quarter"),
    THIS_YEAR("This year"), LAST_YEAR("Last year"), ALL("All time"), CUSTOM("Custom range")
}

// Resolve a preset into inclusive from/to ISO days (UTC, matching the backend).
private fun exportRangeDates(range: ExportRange, customFrom: LocalDate, customTo: LocalDate): Pair<String?, String?> {
    val today = LocalDate.now(ZoneOffset.UTC)
    return when (range) {
        ExportRange.THIS_MONTH -> { val ym = YearMonth.from(today); ym.atDay(1).toString() to ym.atEndOfMonth().toString() }
        ExportRange.LAST_MONTH -> { val ym = YearMonth.from(today).minusMonths(1); ym.atDay(1).toString() to ym.atEndOfMonth().toString() }
        ExportRange.THIS_QUARTER -> {
            val q = (today.monthValue - 1) / 3
            YearMonth.of(today.year, q * 3 + 1).atDay(1).toString() to YearMonth.of(today.year, q * 3 + 3).atEndOfMonth().toString()
        }
        ExportRange.THIS_YEAR -> "${today.year}-01-01" to "${today.year}-12-31"
        ExportRange.LAST_YEAR -> "${today.year - 1}-01-01" to "${today.year - 1}-12-31"
        ExportRange.CUSTOM -> customFrom.toString() to customTo.toString()
        ExportRange.ALL -> null to null
    }
}

private suspend fun performOrderExport(
    companyId: String,
    template: String,
    from: String?,
    to: String?,
    includeTrash: Boolean,
    delimiter: String,
    bom: Boolean
): Triple<ByteArray, String, Int> {
    val payload = hashMapOf<String, Any?>(
        "companyId" to companyId,
        "template" to template,
        "from" to from,
        "to" to to,
        "includeTrash" to includeTrash,
        "delimiter" to delimiter,
        "bom" to bom
    )
    val result = com.google.firebase.functions.FirebaseFunctions.getInstance("europe-west2")
        .getHttpsCallable("exportOrders")
        .call(payload)
        .await()
    @Suppress("UNCHECKED_CAST")
    val data = result.data as? Map<String, Any?> ?: throw Exception("Export failed.")
    val b64 = data["base64"] as? String ?: throw Exception("Export failed.")
    val bytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT)
    val filename = (data["filename"] as? String) ?: "export.csv"
    val rowCount = (data["rowCount"] as? Number)?.toInt() ?: 0
    return Triple(bytes, filename, rowCount)
}

@Composable
private fun ExportSelectorRow(label: String, value: String, options: List<String>, onSelect: (Int) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = MaterialTheme.typography.labelLarge)
        Box(modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) {
                Text(value, modifier = Modifier.weight(1f))
                Text("▾")
            }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                options.forEachIndexed { i, opt ->
                    DropdownMenuItem(text = { Text(opt) }, onClick = { onSelect(i); open = false })
                }
            }
        }
    }
}

@Composable
private fun ExportSwitchRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        Text(label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@Composable
private fun AccountDetail(
    state: StudioFlowUiState,
    requireDeviceUnlock: Boolean,
    onSetRequireDeviceUnlock: (Boolean) -> Unit,
    onUpdateAccountProfile: (String, String) -> Unit,
    onUploadAccountAvatar: (ByteArray, String) -> Unit,
    onRemoveAccountAvatar: () -> Unit,
    onUploadWorkspaceLogo: (ByteArray, String, Boolean) -> Unit,
    onRemoveWorkspaceLogo: () -> Unit,
    onChangeAccountEmail: (String) -> Unit,
    onSendPasswordResetEmail: () -> Unit,
    onSignOut: () -> Unit,
    includeHeader: Boolean = true,
    includeProfile: Boolean = true,
    includeLogo: Boolean = true,
    includeSecurity: Boolean = true,
    includeWorkspaceIdentity: Boolean = true,
    includeWorkspaceIdentityCard: Boolean = false
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val securityPrefs = remember {
        context.getSharedPreferences(
            uk.co.eggcraft.studioflow.features.shell.LocalSecurityPrefs,
            android.content.Context.MODE_PRIVATE
        )
    }
    var autoLockMinutes by rememberSaveable {
        mutableStateOf(securityPrefs.getInt(uk.co.eggcraft.studioflow.features.shell.AutoLockMinutesKey, 1))
    }
    var autoLockMenuOpen by remember { mutableStateOf(false) }
    fun autoLockLabel(minutes: Int): String = when (minutes) {
        1 -> t("After 1 minute")
        5 -> t("After 5 minutes")
        15 -> t("After 15 minutes")
        60 -> t("After 1 hour")
        else -> t("Immediately")
    }
    val workspace = state.workspace
    val user = state.user
    val settings = state.workspaceSettings
    var displayName by rememberSaveable(workspace?.accountDisplayName) { mutableStateOf(workspace?.accountDisplayName.orEmpty()) }
    var companyName by rememberSaveable(workspace?.name) { mutableStateOf(workspace?.name ?: "NivaDesk") }
    var emailDraft by rememberSaveable(user?.email) { mutableStateOf(user?.email.orEmpty()) }
    var pendingLogo by remember { mutableStateOf<PickedUpload?>(null) }
    var logoPolicyAccepted by rememberSaveable(workspace?.id) { mutableStateOf(!settings.uploadSafetyRequirePolicyAcceptance) }
    val avatarLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val upload = readPickedUpload(context, uri)
            if (upload == null) {
                Toast.makeText(context, t("Selected image could not be read."), Toast.LENGTH_SHORT).show()
            } else {
                onUploadAccountAvatar(upload.bytes, upload.contentType)
            }
        }
    }
    val logoLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val upload = readPickedUpload(context, uri)
            if (upload == null) {
                Toast.makeText(context, t("Selected logo could not be read."), Toast.LENGTH_SHORT).show()
            } else if (settings.uploadSafetyRequirePolicyAcceptance && !logoPolicyAccepted) {
                pendingLogo = upload
            } else {
                onUploadWorkspaceLogo(upload.bytes, upload.contentType, logoPolicyAccepted || !settings.uploadSafetyRequirePolicyAcceptance)
            }
        }
    }
    val accountPhotoSet = workspace?.accountPhotoUrl.orEmpty().isNotBlank()
    val logoSet = settings.appLogoUrl.isNotBlank()
    val canEditLogo = workspace?.role in setOf("owner", "admin")

    DetailColumn {
        if (includeHeader) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 1.dp
            ) {
                Row(modifier = Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                    Avatar(initials = initials(displayName.ifBlank { user?.email.orEmpty() }), size = 64)
                    Spacer(modifier = Modifier.width(16.dp))
                    Column {
                        Text(if (includeProfile || includeLogo) "Account" else t("Sign-in & Security"), fontSize = 28.sp, fontWeight = FontWeight.ExtraBold)
                        Text(
                            if (includeProfile || includeLogo) {
                                "Manage your NivaDesk profile, company details and sign-in security."
                            } else {
                                "Manage local device unlock, password reset and sign out."
                            },
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
        if (includeProfile) DetailCard(title = t("Profile & Company"), icon = Icons.Filled.Business) {
            Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Avatar(initials = initials(displayName.ifBlank { user?.email.orEmpty() }), size = 86)
                    Text(t("Profile Photo"), fontWeight = FontWeight.ExtraBold)
                    Text(t("Your profile photo is shown to team members in this workspace."), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(onClick = { avatarLauncher.launch("image/*") }, enabled = !state.settingsSaving) {
                            Icon(Icons.Filled.PhotoLibrary, contentDescription = null)
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(if (accountPhotoSet) t("Change Avatar") else t("Upload Avatar"))
                        }
                        if (accountPhotoSet) {
                            TextButton(onClick = onRemoveAccountAvatar, enabled = !state.settingsSaving) {
                                Icon(Icons.Filled.Delete, contentDescription = null, tint = DangerRed)
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(t("Remove Avatar"), color = DangerRed)
                            }
                        }
                    }
                    Text(if (accountPhotoSet) "Avatar is saved for this workspace account." else "Choose a JPG, PNG, HEIC, HEIF or WEBP image for your account avatar.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Button(onClick = {}, enabled = false) {
                        Icon(Icons.Filled.PhotoLibrary, contentDescription = null)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(t(t("Use Google Photo")))
                    }
                }
            }
            // OAuth-only accounts (Google / Apple, no password provider) can't change
            // their sign-in email — it's owned by the provider.
            val isOAuthOnlyAccount = user != null && user.providerData.none { it.providerId == "password" }
            OutlinedTextField(
                value = if (isOAuthOnlyAccount) user?.email.orEmpty() else emailDraft,
                onValueChange = { emailDraft = it },
                label = { Text(t("Email")) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                enabled = !isOAuthOnlyAccount,
                readOnly = isOAuthOnlyAccount
            )
            if (isOAuthOnlyAccount) {
                Text(t("Your sign-in email is managed by Google or Apple and can't be changed here."), color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                TextButton(onClick = { onChangeAccountEmail(emailDraft) }, enabled = emailDraft.trim().lowercase() != user?.email.orEmpty().trim().lowercase()) {
                    Icon(Icons.Filled.Email, contentDescription = null)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(t("Change Email"))
                }
                Text(t("After changing your sign-in email, you can change it again after 10 days."), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            OutlinedTextField(value = displayName, onValueChange = { displayName = it }, label = { Text(t("Your Name")) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            if (includeWorkspaceIdentity) {
                OutlinedTextField(value = companyName, onValueChange = { companyName = it }, label = { Text(t("Company / Studio Name")) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                CopyableValue("Company ID", workspace?.id.orEmpty(), "Copy")
            }
            CopyableValue(t("User ID"), user?.uid.orEmpty(), "Copy")
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                // Enabled only when something actually changed — an always-live
                // Save reads as "there is something to save" when there is not.
                TextButton(
                    onClick = { onUpdateAccountProfile(displayName, companyName) },
                    enabled = displayName != workspace?.accountDisplayName.orEmpty() || companyName != (workspace?.name ?: "NivaDesk")
                ) {
                    Icon(Icons.Filled.CheckCircle, contentDescription = null)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(t("Save Profile"))
                }
                TextButton(onClick = {
                    displayName = workspace?.accountDisplayName.orEmpty()
                    companyName = workspace?.name ?: "NivaDesk"
                }) { Text(t("Reset")) }
            }
        }
        if (includeWorkspaceIdentityCard) DetailCard(title = t("Workspace"), icon = Icons.Filled.Business) {
            OutlinedTextField(value = companyName, onValueChange = { companyName = it }, label = { Text(t("Company / Studio Name")) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            CopyableValue("Company ID", workspace?.id.orEmpty(), "Copy")
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TextButton(onClick = { onUpdateAccountProfile(displayName, companyName) }) {
                    Icon(Icons.Filled.CheckCircle, contentDescription = null)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(t("Save"))
                }
                TextButton(onClick = { companyName = workspace?.name ?: "NivaDesk" }) { Text(t("Reset")) }
            }
        }
        if (includeLogo) DetailCard(title = t("Workspace Logo"), icon = Icons.Filled.PhotoLibrary) {
            Text(t("Upload or replace the logo used in the app header for this workspace. Manual logo links are disabled so each workspace uses an uploaded logo file."), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                WorkspaceLogoPreview(
                    logoUrl = settings.appLogoUrl,
                    workspaceName = workspace?.name ?: "Workspace",
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(62.dp)
                        .padding(horizontal = 14.dp, vertical = 8.dp)
                )
            }
            Text(t("Workspace Logo"), fontWeight = FontWeight.ExtraBold)
            Text(if (logoSet) "This logo is used in the app header on Mac, iPad, iPhone and Android." else "No logo uploaded yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = { logoLauncher.launch("image/*") }, enabled = !state.settingsSaving && canEditLogo) {
                    Icon(Icons.Filled.Upload, contentDescription = null)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(if (logoSet) t("Replace Logo") else t("Upload Logo"))
                }
                if (logoSet) {
                    TextButton(onClick = onRemoveWorkspaceLogo, enabled = !state.settingsSaving && canEditLogo) {
                        Icon(Icons.Filled.Delete, contentDescription = null, tint = DangerRed)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(t("Remove Logo"), color = DangerRed)
                    }
                }
            }
            if (!canEditLogo) {
                Text(t("Your current workspace role cannot edit Workspace Logo."), color = DangerRed, fontWeight = FontWeight.Bold)
            }
            Text(t("Logo uploads use the same upload safety rules and plan checks as the web and Apple apps."), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (includeSecurity) DetailCard(title = t("Security"), icon = Icons.Filled.Lock) {
            SecurityStatusPanel(requireDeviceUnlock)
            Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    SettingSwitch("Require Face ID / device passcode on app launch", requireDeviceUnlock, onSetRequireDeviceUnlock)
                    Text(t("When enabled, NivaDesk asks for fingerprint, face unlock or your Android screen lock whenever the app opens with an existing session."), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(t("This preference is saved locally on this Android device, matching the Apple app's per-device unlock setting."), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (requireDeviceUnlock) {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(t("Auto-lock"), fontWeight = FontWeight.Bold)
                            Box {
                                OutlinedButton(onClick = { autoLockMenuOpen = true }) {
                                    Text(autoLockLabel(autoLockMinutes))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
                                }
                                DropdownMenu(expanded = autoLockMenuOpen, onDismissRequest = { autoLockMenuOpen = false }) {
                                    listOf(0, 1, 5, 15, 60).forEach { minutes ->
                                        DropdownMenuItem(
                                            text = { Text(autoLockLabel(minutes)) },
                                            onClick = {
                                                autoLockMinutes = minutes
                                                securityPrefs.edit()
                                                    .putInt(uk.co.eggcraft.studioflow.features.shell.AutoLockMinutesKey, minutes)
                                                    .apply()
                                                uk.co.eggcraft.studioflow.features.shell.AppLockGuard.autoLockMinutes = minutes
                                                autoLockMenuOpen = false
                                            }
                                        )
                                    }
                                }
                            }
                            Text(t("Choose how long NivaDesk can stay in the background before it asks to unlock again."), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
            Text(t("Password changes are handled securely by Firebase. We send a reset link to your account email instead of storing or editing your password inside the app."), color = MaterialTheme.colorScheme.onSurfaceVariant)
            BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
                if (maxWidth >= 520.dp) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedButton(onClick = onSendPasswordResetEmail, enabled = !state.settingsSaving, modifier = Modifier.weight(1f)) {
                            Icon(Icons.Filled.Email, contentDescription = null)
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                if (user?.email.isNullOrBlank()) t("Send Password Reset Email") else "${t("Send reset link to")} ${user?.email}",
                                maxLines = 1, overflow = TextOverflow.Ellipsis
                            )
                        }
                        TextButton(onClick = onSignOut, modifier = Modifier.weight(1f)) {
                            Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null)
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(t(t("Sign Out")), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        OutlinedButton(onClick = onSendPasswordResetEmail, enabled = !state.settingsSaving, modifier = Modifier.fillMaxWidth()) {
                            Icon(Icons.Filled.Email, contentDescription = null)
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(if (user?.email.isNullOrBlank()) t("Send Password Reset Email") else "${t("Send reset link to")} ${user?.email}")
                        }
                        TextButton(onClick = onSignOut, modifier = Modifier.fillMaxWidth()) {
                            Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null)
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(t(t("Sign Out")))
                        }
                    }
                }
            }
        }
    }

    if (includeSecurity) {
        DeleteAccountCard(onSignOut = onSignOut)
    }

    if (pendingLogo != null) {
        AlertDialog(
            onDismissRequest = { pendingLogo = null },
            title = { Text(t(t("Upload Policy"))) },
            text = { Text(t("Only upload legal, safe and work-related images that belong in this workspace.")) },
            confirmButton = {
                Button(onClick = {
                    val upload = pendingLogo ?: return@Button
                    pendingLogo = null
                    logoPolicyAccepted = true
                    onUploadWorkspaceLogo(upload.bytes, upload.contentType, true)
                }) { Text(t("I Agree and Upload")) }
            },
            dismissButton = { TextButton(onClick = { pendingLogo = null }) { Text(t("Cancel")) } }
        )
    }
}

@Composable
private fun PlanAccessDetail(
    state: StudioFlowUiState,
    onUpdateWorkspaceBillingPlan: (StudioBillingPlan) -> Unit,
    googlePlanOffers: List<uk.co.eggcraft.studioflow.billing.StudioGooglePlanOffer> = emptyList(),
    googleStorageOffers: List<uk.co.eggcraft.studioflow.billing.StudioGoogleStorageOffer> = emptyList(),
    googleBillingPurchasing: Boolean = false,
    onLoadGooglePlayProducts: () -> Unit = {},
    onPurchaseGooglePlan: (android.app.Activity, uk.co.eggcraft.studioflow.billing.StudioGooglePlanOffer) -> Unit = { _, _ -> },
    onPurchaseGoogleStorageAddon: (android.app.Activity, uk.co.eggcraft.studioflow.billing.StudioGoogleStorageOffer) -> Unit = { _, _ -> },
    onRestoreGooglePlayPurchases: () -> Unit = {}
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val workspace = state.workspace
    val plan = state.workspace?.billingPlan ?: StudioBillingPlan.Demo
    val isOwner = workspace?.isOwner == true
    val activity = LocalContext.current as? android.app.Activity
    LaunchedEffect(Unit) { onLoadGooglePlayProducts() }
    DetailColumn {
        DetailCard(title = t("Plan & Access"), icon = Icons.Filled.CreditCard) {
            Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconBubble(icon = Icons.Filled.People, tint = StudioPurple, container = StudioPurple.copy(alpha = 0.12f), size = 58.dp)
                    Spacer(modifier = Modifier.width(16.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(plan.title, fontSize = 24.sp, fontWeight = FontWeight.ExtraBold)
                        Text(if (plan == StudioBillingPlan.TeamMonthly) "Monthly Subscription" else "Workspace plan", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            MiniPill(planOrderLimitText(plan), Icons.Filled.Backup)
                            MiniPill("Storage: ${workspace?.effectiveStorageLimitText ?: planStorageLimitText(plan).removePrefix("Storage: ")}", Icons.Filled.Storage)
                            MiniPill("Up to ${workspace?.effectiveTeamMemberLimit ?: plan.teamMemberLimit}", Icons.Filled.People)
                        }
                    }
                }
            }
            if (isOwner) {
                Text(t("App Store Purchases"), fontWeight = FontWeight.ExtraBold)
                Text(
                    t("Connect real Google Play products to NivaDesk plans."),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                googlePlanOffers.groupBy { it.plan }.forEach { (offerPlan, offersForPlan) ->
                    Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(offerPlan.title, fontWeight = FontWeight.ExtraBold)
                            offersForPlan.forEach { offer ->
                                val currentInterval = workspace?.billingInterval.orEmpty()
                                val isCurrent = plan == offer.plan &&
                                    (currentInterval.isBlank() || currentInterval == offer.interval)
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        if (offer.interval == "year") t("Yearly") else t("Monthly"),
                                        fontWeight = FontWeight.Bold
                                    )
                                    Spacer(modifier = Modifier.weight(1f))
                                    Text(
                                        offer.formattedPrice ?: t("Product not loaded"),
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                Button(
                                    onClick = { activity?.let { onPurchaseGooglePlan(it, offer) } },
                                    enabled = !googleBillingPurchasing && offer.formattedPrice != null && activity != null && !isCurrent,
                                    modifier = Modifier.fillMaxWidth()
                                ) { Text(if (isCurrent) t("Current plan") else t("Subscribe")) }
                            }
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onLoadGooglePlayProducts, enabled = !googleBillingPurchasing) {
                        Text(t("Load products"))
                    }
                    OutlinedButton(onClick = onRestoreGooglePlayPurchases, enabled = !googleBillingPurchasing) {
                        Text(t("Restore Purchases"))
                    }
                }
                if (googlePlanOffers.isEmpty()) {
                    Text(
                        t("Create this product ID in Google Play Console."),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                SubscriptionLegalFooter()
            }
        }
        if (isOwner && plan.hasClientFiles && googleStorageOffers.isNotEmpty()) {
            DetailCard(title = t("Storage add-ons"), icon = Icons.Filled.Storage) {
                Text(
                    t("Extra Client Files storage on top of your plan. You can switch tier or billing period anytime."),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 14.sp
                )
                googleStorageOffers.groupBy { it.storageGB }.forEach { (gb, offersForTier) ->
                    Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("+$gb GB", fontWeight = FontWeight.ExtraBold)
                            offersForTier.forEach { offer ->
                                val itemKey = "storage_${offer.storageGB}gb" + if (offer.interval == "year") "_yearly" else ""
                                val isCurrent = workspace?.storageAddonKey == itemKey
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        if (offer.interval == "year") t("Yearly") else t("Monthly"),
                                        fontWeight = FontWeight.Bold
                                    )
                                    Spacer(modifier = Modifier.weight(1f))
                                    Text(
                                        offer.formattedPrice ?: t("Product not loaded"),
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                Button(
                                    onClick = { activity?.let { onPurchaseGoogleStorageAddon(it, offer) } },
                                    enabled = !googleBillingPurchasing && offer.formattedPrice != null && activity != null && !isCurrent,
                                    modifier = Modifier.fillMaxWidth()
                                ) { Text(if (isCurrent) t("Current add-on") else t("Subscribe")) }
                            }
                        }
                    }
                }
            }
        }
        DetailCard(title = t("Available now"), icon = Icons.Filled.CheckCircle) {
            Text(t("Current plan access"), fontWeight = FontWeight.ExtraBold)
            PlanFeatureGrid(plan = plan, storageText = workspace?.let { "Storage: ${it.effectiveStorageLimitText}" } ?: planStorageLimitText(plan))
        }
        DetailCard(title = t("Plan Matrix"), icon = Icons.Filled.TableChart) {
            Text(t("Shared app and web plan keys"), color = MaterialTheme.colorScheme.onSurfaceVariant)
            BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
                val columns = if (maxWidth >= 760.dp) 2 else 1
                // Content-sizing grid (no fixed height) so taller plan cards are never clipped.
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    StudioBillingPlan.entries.toList().chunked(columns).forEach { rowPlans ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            rowPlans.forEach { item ->
                                Box(modifier = Modifier.weight(1f)) {
                                    PlanComparisonCard(plan = item, current = item == plan)
                                }
                            }
                            repeat(columns - rowPlans.size) {
                                Spacer(modifier = Modifier.weight(1f))
                            }
                        }
                    }
                }
            }
        }
        DetailCard(title = t("Billing security"), icon = Icons.Filled.Security) {
            Text(t("Plan changes are managed securely through subscription billing."), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (isOwner && plan.hasTeamAccess) {
            val seatUriHandler = LocalUriHandler.current
            DetailCard(title = t("Team seats"), icon = Icons.Filled.People) {
                Text(
                    t("Team includes 5 seats. Add more for £5/month or £50/year each, up to 10 users."),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 14.sp
                )
                val currentSeats = workspace?.effectiveTeamMemberLimit ?: plan.teamMemberLimit
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(t("Current allowance"), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                    Spacer(modifier = Modifier.weight(1f))
                    Text("$currentSeats / 10", fontWeight = FontWeight.ExtraBold)
                }
                OutlinedButton(
                    onClick = { seatUriHandler.openUri("https://nivadesk.app/plan") },
                    modifier = Modifier.fillMaxWidth()
                ) { Text(t("Manage seats on the web")) }
            }
        }
    }
}

@Composable
private fun TeamAccessDetail(
    state: StudioFlowUiState,
    onRequestWorkspaceAccess: (String) -> Unit,
    onSwitchWorkspace: (String) -> Unit,
    onApproveJoinRequest: (StudioJoinRequest, String) -> Unit,
    onDeclineJoinRequest: (StudioJoinRequest) -> Unit,
    onUpdateTeamMemberRole: (StudioTeamMember, String) -> Unit,
    onUpdateTeamMemberAccess: (StudioTeamMember, WorkspaceMemberAccess) -> Unit,
    onRemoveTeamMember: (StudioTeamMember) -> Unit,
    onSaveCustomRole: (String, String, String, WorkspaceMemberAccess) -> Unit,
    onDeleteCustomRole: (StudioCustomRole) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val workspace = state.workspace
    var requestIdentifier by rememberSaveable { mutableStateOf("") }
    var requestRoles by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var editingMemberId by rememberSaveable { mutableStateOf("") }
    var customRoleId by rememberSaveable { mutableStateOf("") }
    var customRoleName by rememberSaveable { mutableStateOf("") }
    var customRoleBase by rememberSaveable { mutableStateOf("member") }
    var customRoleAccess by remember { mutableStateOf(WorkspaceMemberAccess()) }
    val canViewTeamManagement = workspace?.billingPlan?.hasTeamAccess == true && workspace.memberAccess.teamAccess
    val ownerCanManage = workspace?.isOwner == true && canViewTeamManagement
    val roleOptions = remember(state.customRoles) { teamRoleOptions(state.customRoles) }
    DetailColumn {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 1.dp
        ) {
            Row(modifier = Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                IconBubble(icon = Icons.Filled.People, tint = StudioBlue, container = StudioBlue.copy(alpha = 0.12f), size = 64.dp)
                Spacer(modifier = Modifier.width(16.dp))
                Column {
                    Text(t("Team Access"), fontSize = 28.sp, fontWeight = FontWeight.ExtraBold)
                    Text(t("Manage workspace members, roles and join requests."), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
            val useTwoColumns = maxWidth >= 720.dp
            if (useTwoColumns) {
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        DetailCard(title = t("Current Workspace"), icon = Icons.Filled.People) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = StudioOrange)
                                Spacer(modifier = Modifier.width(10.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(workspace?.name ?: "NivaDesk", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Pill(workspace?.roleLabel ?: t("Owner"), StudioOrange)
                                        Text(if (workspace?.isOwner == true) "You own this workspace" else "Shared with you", color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                            }
                            CopyableValue("Company ID", workspace?.id.orEmpty(), "Copy")
                        }
                        DetailCard(title = t("Request Access"), icon = Icons.AutoMirrored.Filled.Send) {
                            Text(t("Enter the owner's email address or Company ID and send a request."), color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                OutlinedTextField(
                                    value = requestIdentifier,
                                    onValueChange = { requestIdentifier = it },
                                    placeholder = { Text(t("Owner email or Company ID")) },
                                    modifier = Modifier.weight(1f),
                                    singleLine = true
                                )
                                TextButton(onClick = {
                                    onRequestWorkspaceAccess(requestIdentifier)
                                    requestIdentifier = ""
                                }) {
                                    Icon(Icons.AutoMirrored.Filled.Send, contentDescription = null)
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text(t("Send"))
                                }
                            }
                        }
                    }
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        DetailCard(title = t("Workspaces"), icon = Icons.Filled.People) {
                            Text(t("Switch to a workspace you own or have joined."), color = MaterialTheme.colorScheme.onSurfaceVariant)
                            state.availableWorkspaces.forEach { option ->
                                Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                                    Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Filled.People, contentDescription = null, tint = StudioOrange)
                                        Spacer(modifier = Modifier.width(10.dp))
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(option.name, fontWeight = FontWeight.ExtraBold)
                                            Text(option.roleLabel, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                        if (option.isCurrent) {
                                            Pill("Current", StudioGreen)
                                        } else {
                                            TextButton(onClick = { onSwitchWorkspace(option.id) }) { Text(t("Switch")) }
                                        }
                                    }
                                }
                            }
                        }
                        DetailCard(title = t("Invite People"), icon = Icons.Filled.ContentCopy) {
                            Text(t("Share your account email or Company ID with the person you want to invite. They will send a request from their Account screen, then you can approve it here."), color = MaterialTheme.colorScheme.onSurfaceVariant)
                            CopyableValue("Company ID", workspace?.id.orEmpty(), "Copy")
                        }
                    }
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxWidth()) {
                    DetailCard(title = t("Current Workspace"), icon = Icons.Filled.People) {
                        Text(workspace?.name ?: "NivaDesk", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Pill(workspace?.roleLabel ?: t("Owner"), StudioOrange)
                            Text(if (workspace?.isOwner == true) "You own this workspace" else "Shared with you", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        CopyableValue("Company ID", workspace?.id.orEmpty(), "Copy")
                    }
                    DetailCard(title = t("Workspaces"), icon = Icons.Filled.People) {
                        Text(t("Switch to a workspace you own or have joined."), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        state.availableWorkspaces.forEach { option ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Filled.People, contentDescription = null, tint = StudioOrange)
                                Spacer(modifier = Modifier.width(10.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(option.name, fontWeight = FontWeight.ExtraBold)
                                    Text(option.roleLabel, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                if (option.isCurrent) {
                                    Pill("Current", StudioGreen)
                                } else {
                                    TextButton(onClick = { onSwitchWorkspace(option.id) }) { Text(t("Switch")) }
                                }
                            }
                        }
                    }
                    DetailCard(title = t("Request Access"), icon = Icons.AutoMirrored.Filled.Send) {
                        Text(t("Enter the owner's email address or Company ID and send a request."), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            OutlinedTextField(
                                value = requestIdentifier,
                                onValueChange = { requestIdentifier = it },
                                placeholder = { Text(t("Owner email or Company ID")) },
                                modifier = Modifier.weight(1f),
                                singleLine = true
                            )
                            TextButton(onClick = {
                                onRequestWorkspaceAccess(requestIdentifier)
                                requestIdentifier = ""
                            }) {
                                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = null)
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(t("Send"))
                            }
                        }
                    }
                    DetailCard(title = t("Invite People"), icon = Icons.Filled.ContentCopy) {
                        Text(t("Share your account email or Company ID with the person you want to invite. They will send a request from their Account screen, then you can approve it here."), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        CopyableValue("Company ID", workspace?.id.orEmpty(), "Copy")
                    }
                }
            }
        }
        if (ownerCanManage) {
            DetailCard(title = t("Join Requests"), icon = Icons.Filled.Person) {
                if (state.joinRequests.isEmpty()) {
                    Text(t("No pending join requests."), color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    state.joinRequests.forEach { request ->
                        Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Avatar(initials(request.label), size = 42)
                                    Spacer(modifier = Modifier.width(10.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(request.label, fontWeight = FontWeight.ExtraBold)
                                        Text(request.requesterEmail.ifBlank { request.requesterUid }, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    Pill(t("Pending"), StudioOrange)
                                }
                                val selectedRole = requestRoles[request.id] ?: "member"
                                RoleDropdown(
                                    label = t("Approve as"),
                                    selectedRole = selectedRole,
                                    options = roleOptions.filter { it.value != "owner" },
                                    onSelect = { role -> requestRoles = requestRoles + (request.id to role) }
                                )
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                                    Button(
                                        onClick = { onApproveJoinRequest(request, selectedRole) },
                                        modifier = Modifier.weight(1f),
                                        shape = RoundedCornerShape(10.dp)
                                    ) {
                                        Text(t("Approve"), fontWeight = FontWeight.ExtraBold)
                                    }
                                    TextButton(
                                        onClick = { onDeclineJoinRequest(request) },
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Text(t("Decline"), color = DangerRed, fontWeight = FontWeight.ExtraBold)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            DetailCard(title = t("Role Profiles"), icon = Icons.Filled.Security) {
                Text(t("Custom Access Roles"), fontWeight = FontWeight.ExtraBold)
                Text(t("Create role presets that use the same permission keys as Mac and web."), color = MaterialTheme.colorScheme.onSurfaceVariant)
                Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedTextField(
                            value = customRoleName,
                            onValueChange = { customRoleName = it },
                            label = { Text(t("Role name")) },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        RoleDropdown(
                            label = t("Base role"),
                            selectedRole = customRoleBase,
                            options = listOf(RoleOption("member", t("Member")), RoleOption("viewer", t("View Only")), RoleOption("workflow", t("Workflow Only"))),
                            onSelect = { customRoleBase = it }
                        )
                        AccessEditor(access = customRoleAccess, onChange = { customRoleAccess = it })
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                            Button(
                                onClick = {
                                    onSaveCustomRole(customRoleId, customRoleName, customRoleBase, customRoleAccess)
                                    customRoleId = ""
                                    customRoleName = ""
                                    customRoleBase = "member"
                                    customRoleAccess = WorkspaceMemberAccess()
                                },
                                enabled = customRoleName.isNotBlank(),
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Text(if (customRoleId.isBlank()) "Save Role" else t("Update Role"), fontWeight = FontWeight.ExtraBold)
                            }
                            TextButton(
                                onClick = {
                                    customRoleId = ""
                                    customRoleName = ""
                                    customRoleBase = "member"
                                    customRoleAccess = WorkspaceMemberAccess()
                                },
                                modifier = Modifier.weight(0.7f)
                            ) {
                                Text(t("Reset"), fontWeight = FontWeight.ExtraBold)
                            }
                        }
                    }
                }
                if (state.customRoles.isEmpty()) {
                    Text(t("No custom roles yet."), color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    state.customRoles.forEach { role ->
                        Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                            Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(role.name, fontWeight = FontWeight.ExtraBold)
                                    Text(roleLabelText(role.baseRole), color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                TextButton(onClick = {
                                    customRoleId = role.id
                                    customRoleName = role.name
                                    customRoleBase = role.baseRole
                                    customRoleAccess = role.access
                                }) {
                                    Text(t("Edit"), fontWeight = FontWeight.ExtraBold)
                                }
                                TextButton(onClick = { onDeleteCustomRole(role) }) {
                                    Text(t("Delete"), color = DangerRed, fontWeight = FontWeight.ExtraBold)
                                }
                            }
                        }
                    }
                }
            }
        }
        if (canViewTeamManagement && state.teamMembers.isNotEmpty()) {
            DetailCard(title = t("Team Members"), icon = Icons.Filled.People) {
                state.teamMembers.forEach { member ->
                    Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Avatar(initials(member.label), size = 42)
                                Spacer(modifier = Modifier.width(10.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(member.label, fontWeight = FontWeight.ExtraBold)
                                    Text(member.email.ifBlank { member.id }, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Pill(if (member.isOwner) t("Owner") else member.roleLabel, if (member.isOwner) StudioOrange else StudioBlue)
                            }
                            if (ownerCanManage && !member.isOwner) {
                                RoleDropdown(
                                    label = t("Role"),
                                    selectedRole = member.role,
                                    options = roleOptions.filter { it.value != "owner" },
                                    onSelect = { onUpdateTeamMemberRole(member, it) }
                                )
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                                    TextButton(
                                        onClick = { editingMemberId = if (editingMemberId == member.id) "" else member.id },
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Text(if (editingMemberId == member.id) "Hide Permissions" else t("Permissions"), fontWeight = FontWeight.ExtraBold)
                                    }
                                    TextButton(
                                        onClick = { onRemoveTeamMember(member) },
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Text(t("Remove"), color = DangerRed, fontWeight = FontWeight.ExtraBold)
                                    }
                                }
                                if (editingMemberId == member.id) {
                                    MemberAccessPanel(member = member, onSave = { access -> onUpdateTeamMemberAccess(member, access) })
                                }
                            }
                        }
                    }
                }
            }
        }
        if (canViewTeamManagement) {
            DetailCard(title = t("Current role mix"), icon = Icons.Filled.People) {
                Text(t("Role counts"), color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
                RoleMix(state)
            }
        } else {
            DetailCard(title = t("Join an existing Team workspace"), icon = Icons.Filled.People) {
                Text(
                    if (workspace?.billingPlan?.hasTeamAccess == true)
                        "Your current role does not include Team Access management. You can still request access to another Team workspace."
                    else
                        "Team management requires NivaDesk Team, but requesting access to an existing Team workspace is available on every plan.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

private data class RoleOption(val value: String, val label: String)

private data class AccessOption(val key: String, val label: String)

private fun teamRoleOptions(customRoles: List<StudioCustomRole>): List<RoleOption> {
    return listOf(
        RoleOption("admin", "Admin"),
        RoleOption("member", "Member"),
        RoleOption("viewer", "View Only"),
        RoleOption("workflow", "Workflow Only")
    ) + customRoles.map { RoleOption(it.id, it.name) }
}

private fun roleLabelText(role: String): String {
    return when (role.trim().lowercase()) {
        "owner" -> "Owner"
        "admin" -> "Admin"
        "viewer" -> "View Only"
        "workflow" -> "Workflow Only"
        else -> if (role.startsWith("custom_")) "Custom role" else "Member"
    }
}

@Composable
private fun RoleDropdown(label: String, selectedRole: String, options: List<RoleOption>, onSelect: (String) -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val selectedLabel = options.firstOrNull { it.value == selectedRole }?.label ?: roleLabelText(selectedRole)
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
        MenuChip(
            value = selectedLabel,
            options = options.map { it.label },
            onSelect = { selectedLabelValue ->
                options.firstOrNull { it.label == selectedLabelValue }?.let { onSelect(it.value) }
            }
        )
    }
}

@Composable
private fun MemberAccessPanel(member: StudioTeamMember, onSave: (WorkspaceMemberAccess) -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var draft by remember(member.id, member.access) { mutableStateOf(member.access) }
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(t("Role Permissions"), fontWeight = FontWeight.ExtraBold)
            AccessEditor(access = draft, onChange = { draft = it })
            Button(onClick = { onSave(draft) }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(10.dp)) {
                Text(t("Save Permissions"), fontWeight = FontWeight.ExtraBold)
            }
        }
    }
}

@Composable
private fun AccessEditor(access: WorkspaceMemberAccess, onChange: (WorkspaceMemberAccess) -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        AccessSectionBlock(
            title = t("Navigation & Menus"),
            note = "Controls main app areas shown in sidebar and settings.",
            options = listOf(
                AccessOption("dashboard", "Dashboard"),
                AccessOption("orders", "Orders"),
                AccessOption("schedule", "Schedule"),
                AccessOption("customers", "Customers"),
                AccessOption("messages", "Messages"),
        AccessOption("teamChat", "Team Chat posting"),
                AccessOption("notes", "Notes"),
                AccessOption("quickReply", t("Quick Reply")),
                AccessOption("settings", "Settings"),
                AccessOption("teamAccess", "Team Access"),
                AccessOption("clientFiles", "Client Files"),
                AccessOption("financialInfo", "Financial Info"),
                AccessOption("exportData", t("Export Data")),
                AccessOption("bankFeed", "Bank Spending")
            ),
            access = access,
            accent = StudioBlue,
            onChange = onChange
        )
        HorizontalDivider()
        AccessSectionBlock(
            title = "Settings Permissions",
            note = "Controls visible Settings menus. Billing, WooCommerce, data deletion, workspace identity and OpenAI key stay protected.",
            options = listOf(
                AccessOption("settingsGeneral", "General / Personal Settings"),
                AccessOption("settingsPdf", "PDF Export Settings"),
                AccessOption("settingsQuickReply", "Quick Reply Settings"),
                AccessOption("settingsMessageSettings", "Message Settings"),
                AccessOption("settingsWorkflow", "Workflow Steps"),
                AccessOption("settingsFinancial", "Financial Settings"),
                AccessOption("settingsSafetyUploads", "Safety & Uploads"),
                AccessOption("settingsData", "Data Management"),
                AccessOption("settingsTeamAccess", "Team Access"),
                AccessOption("settingsPlanAccess", "Plan & Access"),
                AccessOption("settingsSupport", "Support / Tickets")
            ),
            access = access,
            accent = StudioGreen,
            onChange = onChange
        )
        HorizontalDivider()
        AccessSectionBlock(
            title = t("Project Assignment"),
            note = "Controls assigned-project scope and reassignment power.",
            options = listOf(
                AccessOption("assignedProjectsOnly", "Assigned Projects Only"),
                AccessOption("manageProjectAssignments", "Change Project Assignments")
            ),
            access = access,
            accent = StudioPurple,
            onChange = onChange
        )
        HorizontalDivider()
        AccessSectionBlock(
            title = t("Order Detail Cards"),
            note = "Controls which cards are visible inside each project.",
            options = listOf(
                AccessOption("cardPreview", "Preview"),
                AccessOption("cardSummary", "Order Summary"),
                AccessOption("cardCustomer", "Customer & Communication"),
                AccessOption("cardMaterials", "Materials & Inventory"),
                AccessOption("cardPriority", "Priority / Risk"),
                AccessOption("cardDelivery", t("Timeline & Delivery")),
                AccessOption("cardNotes", "Notes"),
                AccessOption("cardClientFiles", "Client Files"),
                AccessOption("cardTodo", "To Do"),
                AccessOption("cardWorkTime", "Work Time"),
                AccessOption("cardFinancial", "Financial Info"),
                AccessOption("cardStatus", "Production Status"),
                AccessOption("cardShipping", "Shipping & Tracking"),
                AccessOption("cardSchedule", "Schedule & Alerts"),
                AccessOption("cardHistoryLog", "History / Log")
            ),
            access = access,
            accent = StudioOrange,
            onChange = onChange
        )
        HorizontalDivider()
        AccessSectionBlock(
            title = t("File Permissions"),
            note = "Controls whether this role can delete client files. Uploading and viewing follow Client Files access above.",
            options = listOf(
                AccessOption("deleteClientFiles", "Delete client files")
            ),
            access = access,
            accent = StudioRed,
            onChange = onChange
        )
    }
}

@Composable
private fun AccessSectionBlock(
    title: String,
    note: String,
    options: List<AccessOption>,
    access: WorkspaceMemberAccess,
    accent: Color,
    onChange: (WorkspaceMemberAccess) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val enabledCount = options.count { access.allows(it.key) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.Top) {
            Column(modifier = Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.ExtraBold)
                Text(note, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 16.sp)
            }
            Text("$enabledCount / ${options.size}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold)
        }
        BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
            val columns = when {
                maxWidth >= 620.dp -> 3
                maxWidth >= 420.dp -> 2
                else -> 1
            }
            val rows = (options.size + columns - 1) / columns
            LazyVerticalGrid(
                columns = GridCells.Fixed(columns),
                modifier = Modifier.height((rows * 66 + (rows - 1) * 8).dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                userScrollEnabled = false
            ) {
                items(options, key = { it.key }) { option ->
                    val enabled = access.allows(option.key)
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = if (enabled) accent.copy(alpha = 0.12f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.72f),
                        tonalElevation = if (enabled) 1.dp else 0.dp,
                        border = androidx.compose.foundation.BorderStroke(1.dp, if (enabled) accent.copy(alpha = 0.32f) else MaterialTheme.colorScheme.outline.copy(alpha = 0.22f)),
                        onClick = { onChange(access.copyWithKey(option.key, !enabled)) }
                    ) {
                        Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = if (enabled) Icons.Filled.CheckCircle else Icons.Filled.RadioButtonUnchecked,
                                contentDescription = null,
                                tint = if (enabled) accent else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(option.label, color = if (enabled) accent else MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                Text(accessOptionDetail(option.key, enabled), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun accessOptionDetail(key: String, enabled: Boolean): String {
    return when {
        key == "assignedProjectsOnly" && enabled -> "Only assigned projects"
        key == "assignedProjectsOnly" -> "All projects"
        key == "manageProjectAssignments" && enabled -> "Can assign projects"
        key == "manageProjectAssignments" -> "Assign hidden"
        key.startsWith("card") && enabled -> "Visible"
        key.startsWith("card") -> "Hidden"
        enabled -> "Allowed"
        else -> "Hidden / locked"
    }
}

private fun WorkspaceMemberAccess.copyWithKey(key: String, value: Boolean): WorkspaceMemberAccess {
    return when (key) {
        "orders" -> copy(orders = value)
        "dashboard" -> copy(dashboard = value)
        "schedule" -> copy(schedule = value)
        "customers" -> copy(customers = value)
        "messages" -> copy(messages = value)
        "teamChat" -> copy(teamChat = value)
        "notes" -> copy(notes = value)
        "quickReply" -> copy(quickReply = value)
        "settings" -> copy(settings = value)
        "teamAccess" -> copy(teamAccess = value)
        "clientFiles" -> copy(clientFiles = value)
        "financialInfo" -> copy(financialInfo = value)
        "exportData" -> copy(exportData = value)
        "settingsGeneral" -> copy(settingsGeneral = value)
        "settingsPdf" -> copy(settingsPdf = value)
        "settingsQuickReply" -> copy(settingsQuickReply = value)
        "settingsMessageSettings" -> copy(settingsMessageSettings = value)
        "settingsWorkflow" -> copy(settingsWorkflow = value)
        "settingsFinancial" -> copy(settingsFinancial = value)
        "settingsSafetyUploads" -> copy(settingsSafetyUploads = value)
        "settingsData" -> copy(settingsData = value)
        "settingsTeamAccess" -> copy(settingsTeamAccess = value)
        "settingsPlanAccess" -> copy(settingsPlanAccess = value)
        "settingsSupport" -> copy(settingsSupport = value)
        "assignedProjectsOnly" -> copy(assignedProjectsOnly = value)
        "manageProjectAssignments" -> copy(manageProjectAssignments = value)
        "cardPreview" -> copy(cardPreview = value)
        "cardSummary" -> copy(cardSummary = value)
        "cardCustomer" -> copy(cardCustomer = value)
        "cardMaterials" -> copy(cardMaterials = value)
        "cardPriority" -> copy(cardPriority = value)
        "cardDelivery" -> copy(cardDelivery = value)
        "cardNotes" -> copy(cardNotes = value)
        "cardClientFiles" -> copy(cardClientFiles = value)
        "cardTodo" -> copy(cardTodo = value)
        "cardWorkTime" -> copy(cardWorkTime = value)
        "cardFinancial" -> copy(cardFinancial = value)
        "cardStatus" -> copy(cardStatus = value)
        "cardShipping" -> copy(cardShipping = value)
        "cardSchedule" -> copy(cardSchedule = value)
        "cardHistoryLog" -> copy(cardHistoryLog = value)
        "deleteClientFiles" -> copy(deleteClientFiles = value)
        else -> this
    }
}


@Composable
private fun SupportTicketsDetail(state: StudioFlowUiState) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val workspace = state.workspace
    if (workspace == null) {
        DetailColumn {
            DetailCard(t("Support / Tickets"), Icons.Filled.Email) {
                Text(t("Sign in and select a workspace to use support tickets."), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        return
    }
    val repository = remember { StudioFlowRepository() }
    val scope = rememberCoroutineScope()
    var selectedType by rememberSaveable { mutableStateOf("workspace") }
    var category by rememberSaveable { mutableStateOf("project") }
    var priority by rememberSaveable { mutableStateOf("normal") }
    var subject by rememberSaveable { mutableStateOf("") }
    var message by rememberSaveable { mutableStateOf("") }
    var tickets by remember { mutableStateOf<List<StudioSupportTicket>>(emptyList()) }
    var canManageTickets by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var sending by remember { mutableStateOf(false) }
    var statusMessage by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf("") }
    var refreshKey by remember { mutableStateOf(0) }
    var openTicketIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var messagesByTicketId by remember { mutableStateOf<Map<String, List<StudioSupportTicketMessage>>>(emptyMap()) }
    var replyTextByTicketId by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var unreadSupportTicketIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var unreadWorkspaceTicketIds by remember { mutableStateOf<Set<String>>(emptySet()) }

    val isWorkspaceMode = selectedType == "workspace"
    // Website chats arrive inside the NivaDesk support list, so each tab shows
    // only its own kind instead of mixing the two queues.
    val isWebsiteMode = selectedType == "website"
    val visibleTickets = if (isWorkspaceMode) tickets else tickets.filter { (it.ticketType == "website") == isWebsiteMode }
    var showsWebsiteTab by remember { mutableStateOf(false) }
    val categoryOptions = if (isWorkspaceMode) {
        listOf("project", "task", "approval", "customer", "internal", "other")
    } else {
        listOf("bug", "question", "billing", "feature", "account", "other")
    }
    val priorityOptions = listOf("low", "normal", "high", "urgent")
    val statusOptions = listOf("open", "inProgress", "waitingForUser", "resolved", "closed")

    LaunchedEffect(selectedType) {
        category = if (isWorkspaceMode) "project" else "bug"
        statusMessage = ""
        errorMessage = ""
        openTicketIds = emptySet()
        messagesByTicketId = emptyMap()
        replyTextByTicketId = emptyMap()
        refreshKey += 1
    }

    fun loadUnreadSummary() {
        scope.launch {
            runCatching { repository.getSupportTicketUnreadSummary(workspace) }
                .onSuccess { summary ->
                    unreadSupportTicketIds = summary.unreadSupportTicketIds
                    unreadWorkspaceTicketIds = summary.unreadWorkspaceTicketIds
                    if (summary.isSupportAdmin) showsWebsiteTab = true
                }
        }
    }

    fun markTicketRead(ticket: StudioSupportTicket) {
        scope.launch {
            runCatching {
                if (ticket.isWorkspaceTicket) {
                    repository.markWorkspaceTicketRead(workspace, ticket.id)
                } else {
                    repository.markSupportTicketRead(workspace, ticket.id)
                }
            }.onSuccess {
                if (ticket.isWorkspaceTicket) {
                    unreadWorkspaceTicketIds = unreadWorkspaceTicketIds - ticket.id
                } else {
                    unreadSupportTicketIds = unreadSupportTicketIds - ticket.id
                }
            }
        }
    }

    fun loadTickets() {
        loading = true
        scope.launch {
            runCatching {
                if (isWorkspaceMode) {
                    repository.listWorkspaceTickets(workspace)
                } else {
                    repository.listSupportTickets(workspace)
                }
            }.onSuccess { result ->
                tickets = result.tickets
                canManageTickets = result.canManage
                if (!isWorkspaceMode && result.canManage) showsWebsiteTab = true
                loading = false
                loadUnreadSummary()
            }.onFailure { error ->
                loading = false
                errorMessage = error.message ?: "Could not load tickets."
            }
        }
    }

    fun loadMessages(ticket: StudioSupportTicket) {
        scope.launch {
            runCatching {
                if (ticket.isWorkspaceTicket) {
                    repository.listWorkspaceTicketMessages(workspace, ticket.id)
                } else {
                    repository.listSupportTicketMessages(workspace, ticket.id)
                }
            }.onSuccess { messages ->
                messagesByTicketId = messagesByTicketId + (ticket.id to messages)
            }.onFailure { error ->
                errorMessage = error.message ?: "Could not load conversation."
            }
        }
    }

    LaunchedEffect(workspace.id, selectedType, refreshKey) {
        loadTickets()
    }

    LaunchedEffect(workspace.id) {
        loadUnreadSummary()
    }

    DetailColumn {
        DetailCard(t("Support / Tickets"), Icons.Filled.Email) {
            BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
                val narrow = maxWidth < 560.dp
                if (narrow) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        SupportTicketTypeCard(
                            title = t("Contact Workspace Owner"),
                            subtitle = "Internal project, task, approval or customer questions.",
                            selected = isWorkspaceMode,
                            onClick = { selectedType = "workspace" }
                        )
                        SupportTicketTypeCard(
                            title = t("Contact NivaDesk Support"),
                            subtitle = "App bugs, sync, billing, account or feature requests.",
                            selected = selectedType == "appSupport",
                            onClick = { selectedType = "appSupport" }
                        )
                        if (showsWebsiteTab) {
                            SupportTicketTypeCard(
                                title = t("Website Chats"),
                                subtitle = "Questions people send from the nivadesk.app chat widget.",
                                selected = isWebsiteMode,
                                onClick = { selectedType = "website" }
                            )
                        }
                    }
                } else {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                        SupportTicketTypeCard(
                            title = t("Contact Workspace Owner"),
                            subtitle = "Internal project, task, approval or customer questions.",
                            selected = isWorkspaceMode,
                            onClick = { selectedType = "workspace" },
                            modifier = Modifier.weight(1f)
                        )
                        SupportTicketTypeCard(
                            title = t("Contact NivaDesk Support"),
                            subtitle = "App bugs, sync, billing, account or feature requests.",
                            selected = selectedType == "appSupport",
                            onClick = { selectedType = "appSupport" },
                            modifier = Modifier.weight(1f)
                        )
                        if (showsWebsiteTab) {
                            SupportTicketTypeCard(
                                title = t("Website Chats"),
                                subtitle = "Questions people send from the nivadesk.app chat widget.",
                                selected = isWebsiteMode,
                                onClick = { selectedType = "website" },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            }

            if (!isWebsiteMode) {
            SupportFormFieldMenus(
                category = category,
                categories = categoryOptions,
                onCategory = { category = it },
                priority = priority,
                priorities = priorityOptions,
                onPriority = { priority = it }
            )

            OutlinedTextField(
                value = subject,
                onValueChange = { subject = it },
                label = { Text(t("Subject")) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                enabled = !sending
            )
            OutlinedTextField(
                value = message,
                onValueChange = { message = it },
                label = { Text(t("Message")) },
                modifier = Modifier.fillMaxWidth(),
                minLines = 4,
                enabled = !sending
            )

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Button(
                    onClick = {
                        val cleanSubject = subject.trim()
                        val cleanMessage = message.trim()
                        if (cleanSubject.isBlank() || cleanMessage.isBlank()) {
                            errorMessage = "Please add a subject and message."
                            return@Button
                        }
                        sending = true
                        errorMessage = ""
                        statusMessage = ""
                        scope.launch {
                            runCatching {
                                if (isWorkspaceMode) {
                                    repository.createWorkspaceTicket(workspace, category, priority, cleanSubject, cleanMessage)
                                } else {
                                    repository.createSupportTicket(workspace, category, priority, cleanSubject, cleanMessage)
                                }
                            }.onSuccess { response ->
                                sending = false
                                subject = ""
                                message = ""
                                statusMessage = response
                                refreshKey += 1
                            }.onFailure { error ->
                                sending = false
                                errorMessage = error.message ?: "Could not send ticket."
                            }
                        }
                    },
                    enabled = !sending,
                    colors = ButtonDefaults.buttonColors(containerColor = StudioBlue),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Icon(Icons.AutoMirrored.Filled.Send, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(if (sending) t("Sending...") else t("Send Ticket"), fontWeight = FontWeight.ExtraBold)
                }
                OutlinedButton(onClick = { refreshKey += 1 }, shape = RoundedCornerShape(10.dp)) {
                    Text(t(t("Refresh")))
                }
            }
            }

            if (statusMessage.isNotBlank()) Pill(statusMessage, StudioGreen)
            if (errorMessage.isNotBlank()) Pill(errorMessage, DangerRed)
        }

        DetailCard(
            title = if (isWorkspaceMode) {
                if (canManageTickets) "Workspace Ticket Inbox" else "My Workspace Tickets"
            } else {
                if (isWebsiteMode) t("Questions from the website")
                else if (canManageTickets) "NivaDesk Support Inbox" else "My NivaDesk Support Tickets"
            },
            icon = Icons.Filled.Info
        ) {
            if (loading) {
                Pill(t("Loading tickets..."), StudioBlue)
            }
            if (tickets.isEmpty() && !loading) {
                Text(t("No tickets yet."), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            visibleTickets.forEach { ticket ->
                val isUnread = if (ticket.isWorkspaceTicket) {
                    unreadWorkspaceTicketIds.contains(ticket.id)
                } else {
                    unreadSupportTicketIds.contains(ticket.id)
                }
                SupportTicketCard(
                    ticket = ticket,
                    isUnread = isUnread,
                    canManage = canManageTickets,
                    statusOptions = statusOptions,
                    isOpen = openTicketIds.contains(ticket.id),
                    messages = messagesByTicketId[ticket.id].orEmpty(),
                    replyText = replyTextByTicketId[ticket.id].orEmpty(),
                    onToggleOpen = {
                        val willOpen = !openTicketIds.contains(ticket.id)
                        openTicketIds = if (willOpen) openTicketIds + ticket.id else openTicketIds - ticket.id
                        if (willOpen) {
                            markTicketRead(ticket)
                        }
                        if (willOpen && !messagesByTicketId.containsKey(ticket.id)) {
                            loadMessages(ticket)
                        }
                    },
                    onStatusChange = { status ->
                        scope.launch {
                            runCatching {
                                if (ticket.isWorkspaceTicket) {
                                    repository.updateWorkspaceTicketStatus(workspace, ticket.id, status)
                                } else {
                                    repository.updateSupportTicketStatus(workspace, ticket.id, status)
                                }
                            }.onSuccess {
                                statusMessage = it
                                refreshKey += 1
                            }.onFailure { error ->
                                errorMessage = error.message ?: "Could not update status."
                            }
                        }
                    },
                    onReplyTextChange = { value ->
                        replyTextByTicketId = replyTextByTicketId + (ticket.id to value)
                    },
                    onSendReply = {
                        val reply = replyTextByTicketId[ticket.id].orEmpty().trim()
                        if (reply.isNotBlank()) {
                            scope.launch {
                                runCatching {
                                    if (ticket.isWorkspaceTicket) {
                                        repository.addWorkspaceTicketReply(workspace, ticket.id, reply)
                                    } else {
                                        repository.addSupportTicketReply(workspace, ticket.id, reply)
                                    }
                                }.onSuccess { response ->
                                    statusMessage = response
                                    replyTextByTicketId = replyTextByTicketId + (ticket.id to "")
                                    loadMessages(ticket)
                                    refreshKey += 1
                                }.onFailure { error ->
                                    errorMessage = error.message ?: "Could not send reply."
                                }
                            }
                        }
                    }
                )
            }
        }
    }
}

@Composable
private fun SupportTicketTypeCard(
    title: String,
    subtitle: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = if (selected) StudioBlue.copy(alpha = 0.10f) else MaterialTheme.colorScheme.surfaceVariant,
        tonalElevation = if (selected) 2.dp else 0.dp,
        onClick = onClick
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    if (selected) Icons.Filled.CheckCircle else Icons.Filled.RadioButtonUnchecked,
                    contentDescription = null,
                    tint = if (selected) StudioBlue else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(title, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
            }
            Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, lineHeight = 18.sp)
        }
    }
}

@Composable
private fun SupportFormFieldMenus(
    category: String,
    categories: List<String>,
    onCategory: (String) -> Unit,
    priority: String,
    priorities: List<String>,
    onPriority: (String) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        val narrow = maxWidth < 560.dp
        if (narrow) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SupportMenuField(t("Category"), supportCategoryLabel(category), categories, onCategory)
                SupportMenuField("Priority", supportPriorityLabel(priority), priorities, onPriority)
            }
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                SupportMenuField(t("Category"), supportCategoryLabel(category), categories, onCategory, Modifier.weight(1f))
                SupportMenuField("Priority", supportPriorityLabel(priority), priorities, onPriority, Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun SupportMenuField(
    label: String,
    value: String,
    options: List<String>,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
        MenuChip(
            value = value,
            options = options,
            modifier = Modifier.fillMaxWidth(),
            onSelect = onSelect
        )
    }
}

@Composable
private fun SupportTicketCard(
    ticket: StudioSupportTicket,
    isUnread: Boolean,
    canManage: Boolean,
    statusOptions: List<String>,
    isOpen: Boolean,
    messages: List<StudioSupportTicketMessage>,
    replyText: String,
    onToggleOpen: () -> Unit,
    onStatusChange: (String) -> Unit,
    onReplyTextChange: (String) -> Unit,
    onSendReply: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text(ticket.title, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp)
                    Text(
                        listOf(ticket.senderLabel, ticket.companyName, supportDateText(ticket.lastMessageAt ?: ticket.createdAt))
                            .filter { it.isNotBlank() }
                            .joinToString(" • "),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (isUnread) {
                        SupportUnreadBadge()
                    }
                    SupportStatusPill(ticket.status)
                }
            }

            if (ticket.lastMessageAt != null) {
                Text(
                    "Last message: ${supportDateText(ticket.lastMessageAt)}",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SupportSmallPill(supportCategoryLabel(ticket.category), StudioBlue)
                SupportSmallPill(supportPriorityLabel(ticket.priority), supportPriorityColor(ticket.priority))
            }

            Text(
                ticket.message,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = if (isOpen) 8 else 2,
                overflow = TextOverflow.Ellipsis
            )

            if (canManage && ticket.isWebsiteTicket) {
                // Web-parity context card: WHO is asking, from WHERE, on WHICH
                // plan — before the first reply is typed (admins only).
                val contextGreen = Color(0xFF107A57)
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    color = contextGreen.copy(alpha = 0.06f),
                    border = androidx.compose.foundation.BorderStroke(1.dp, contextGreen.copy(alpha = 0.22f))
                ) {
                    Column(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        val headline = if (ticket.accountUid.isNotBlank()) {
                            val identity = ticket.accountName.ifBlank { ticket.accountEmail }
                            identity + if (ticket.accountCompanyName.isNotBlank()) " · ${ticket.accountCompanyName}" else ""
                        } else {
                            val visitorName = ticket.createdByName.trim().ifEmpty { t("Website visitor") }
                            visitorName + if (ticket.visitorEmail.isNotBlank()) " · ${ticket.visitorEmail}" else " · ${t("no email left")}"
                        }
                        Text(headline, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp)
                        if (ticket.accountUid.isNotBlank()) {
                            val planPart = if (ticket.accountPlan.isNotBlank()) "${t("Plan")}: ${ticket.accountPlan}" else t("Signed-in user")
                            Text(
                                planPart + if (ticket.accountEmail.isNotBlank()) " · ${ticket.accountEmail}" else "",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontSize = 12.sp
                            )
                        }
                        if (ticket.visitorPage.isNotBlank()) {
                            Text(
                                "${t("Current page")}: ${ticket.visitorPage}",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontSize = 12.sp
                            )
                        }
                        if (ticket.needsHuman) {
                            Text(
                                "👥 ${t("Asked for a person")}",
                                color = Color(0xFFB45309),
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 12.sp
                            )
                        }
                    }
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedButton(onClick = onToggleOpen, shape = RoundedCornerShape(999.dp)) {
                    Text(if (isOpen) t("Hide Conversation") else t("Open Conversation"), fontWeight = FontWeight.Bold)
                }
                if (canManage) {
                    MenuChip(
                        value = supportStatusLabel(ticket.status),
                        options = statusOptions,
                        onSelect = onStatusChange
                    )
                }
            }

            if (isOpen) {
                HorizontalDivider()
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    val conversation = if (messages.isEmpty()) {
                        listOf(
                            StudioSupportTicketMessage(
                                id = "initial",
                                message = ticket.message,
                                createdByUid = ticket.createdByUid,
                                createdByEmail = ticket.createdByEmail,
                                createdByName = ticket.createdByName,
                                senderRole = "user",
                                createdAt = ticket.createdAt
                            )
                        )
                    } else {
                        messages
                    }
                    conversation.forEach { item ->
                        SupportMessageBubble(item)
                    }
                    OutlinedTextField(
                        value = replyText,
                        onValueChange = onReplyTextChange,
                        label = { Text(t("Reply")) },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 3
                    )
                    Button(
                        onClick = onSendReply,
                        enabled = replyText.trim().isNotBlank(),
                        colors = ButtonDefaults.buttonColors(containerColor = StudioBlue),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Send, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(t("Send Reply"), fontWeight = FontWeight.ExtraBold)
                    }
                }
            }
        }
    }
}

@Composable
private fun SupportMessageBubble(message: StudioSupportTicketMessage) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(message.senderLabel, fontWeight = FontWeight.ExtraBold, modifier = Modifier.weight(1f))
                Text(supportDateText(message.createdAt), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            }
            Text(message.message, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun SupportUnreadBadge(count: Int? = null) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(shape = RoundedCornerShape(999.dp), color = DangerRed.copy(alpha = 0.18f)) {
        Text(
            text = count?.coerceAtMost(99)?.toString() ?: t("New"),
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
            color = DangerRed,
            fontWeight = FontWeight.ExtraBold,
            fontSize = 12.sp
        )
    }
}

@Composable
private fun SupportStatusPill(status: String) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    SupportSmallPill(supportStatusLabel(status), supportStatusColor(status))
}

@Composable
private fun SupportSmallPill(label: String, color: Color) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(shape = RoundedCornerShape(999.dp), color = color.copy(alpha = 0.14f)) {
        Text(label, modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp), color = color, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp)
    }
}

private fun supportStatusLabel(value: String): String {
    return when (value) {
        "inProgress" -> "In Progress"
        "waitingForUser" -> "Waiting for User"
        "resolved" -> "Resolved"
        "closed" -> "Closed"
        else -> "Open"
    }
}

private fun supportStatusColor(value: String): Color {
    return when (value) {
        "inProgress" -> StudioBlue
        "waitingForUser" -> StudioOrange
        "resolved" -> StudioGreen
        "closed" -> Color(0xFF7B8494)
        else -> StudioBlue
    }
}

private fun supportPriorityLabel(value: String): String {
    return value.replaceFirstChar { it.uppercaseChar() }
}

private fun supportPriorityColor(value: String): Color {
    return when (value) {
        "low" -> StudioGreen
        "high" -> StudioOrange
        "urgent" -> DangerRed
        else -> Color(0xFF7B8494)
    }
}

private fun supportCategoryLabel(value: String): String {
    return when (value) {
        "bug" -> "Bug"
        "question" -> "Question"
        "billing" -> "Billing"
        "feature" -> "Feature"
        "account" -> "Account"
        "project" -> "Project"
        "task" -> "Task"
        "approval" -> "Approval"
        "customer" -> "Customer"
        "internal" -> "Internal"
        else -> "Other"
    }
}

private fun supportDateText(value: Date?): String {
    if (value == null) return ""
    return SimpleDateFormat("dd MMM yyyy HH:mm", Locale.UK).format(value)
}


@Composable
private fun AboutDetail() {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val uriHandler = LocalUriHandler.current
    DetailColumn {
        DetailCard(title = t("About"), icon = Icons.Filled.Info) {
            NivaDeskLogoLockup(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(72.dp)
            )
            Text(t("Version") + " " + BuildConfig.VERSION_NAME, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(t("An EGGcraft brand for studio workspace management."), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                t("User guide"),
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.SemiBold,
                textDecoration = TextDecoration.Underline,
                modifier = Modifier.clickable { uriHandler.openUri("https://nivadesk.app/guide") }
            )
            Text(
                t("What's new"),
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.SemiBold,
                textDecoration = TextDecoration.Underline,
                modifier = Modifier.clickable { uriHandler.openUri("https://nivadesk.app/changelog") }
            )
            HorizontalDivider()
            Text(t("(c) 2026 All rights reserved."), fontWeight = FontWeight.ExtraBold)
            Text(t("This software and all its components, including its custom logic, layout, and AI integration systems, are the exclusive intellectual property of the developer."), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun NivaDeskLogoLockup(modifier: Modifier = Modifier) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Image(
        painter = painterResource(id = R.drawable.nivadesk_logo_lockup),
        contentDescription = "NivaDesk",
        modifier = modifier,
        alignment = Alignment.CenterStart,
        contentScale = ContentScale.Fit
    )
}

@Composable
private fun WorkspaceLogoPreview(
    logoUrl: String,
    workspaceName: String,
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

    val logoBitmap = bitmap
    if (logoBitmap != null) {
        Image(
            bitmap = logoBitmap.asImageBitmap(),
            contentDescription = "$workspaceName logo",
            modifier = modifier,
            alignment = Alignment.CenterStart,
            contentScale = ContentScale.Fit
        )
    } else {
        WorkspaceLogoNameFallback(
            workspaceName = workspaceName,
            modifier = modifier
        )
    }
}

@Composable
private fun WorkspaceLogoNameFallback(
    workspaceName: String,
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Image(
            painter = painterResource(id = R.drawable.nivadesk_workspace_icon),
            contentDescription = null,
            modifier = Modifier.size(34.dp),
            contentScale = ContentScale.Fit
        )
        Text(
            text = workspaceName.trim().ifBlank { "Workspace" },
            color = MaterialTheme.colorScheme.onSurface,
            fontSize = 22.sp,
            fontWeight = FontWeight.Black,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun DetailColumn(content: @Composable ColumnScope.() -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Column(
        modifier = Modifier.padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
        content = content
    )
}

@Composable
private fun DetailCard(title: String, icon: ImageVector, content: @Composable ColumnScope.() -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp
    ) {
        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(modifier = Modifier.width(10.dp))
                Text(title, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
            }
            content()
        }
    }
}

// Google Play / App Store subscription disclosure + required Terms/Privacy links.
@Composable
private fun SubscriptionLegalFooter() {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val uriHandler = LocalUriHandler.current
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            t("Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period. You can manage or cancel anytime in your Google Play account settings."),
            fontSize = 11.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Text(
                t("Terms of Service"),
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = StudioBlue,
                modifier = Modifier.clickable { uriHandler.openUri("https://nivadesk.app/terms") }
            )
            Text(
                t("Privacy Policy"),
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = StudioBlue,
                modifier = Modifier.clickable { uriHandler.openUri("https://nivadesk.app/privacy") }
            )
        }
    }
}

@Composable
private fun LegalLinksDetail() {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val uriHandler = LocalUriHandler.current
    val links = listOf(
        Triple("Privacy Policy", Icons.Filled.PrivacyTip, "/privacy"),
        Triple("Terms of Service", Icons.Filled.Description, "/terms"),
        Triple("Refund & Cancellation", Icons.Filled.Undo, "/refund-cancellation"),
        Triple("Cookie Policy", Icons.Filled.Cookie, "/cookies"),
        Triple("Acceptable Use", Icons.Filled.VerifiedUser, "/acceptable-use"),
        Triple("Account Deletion", Icons.Filled.DeleteForever, "/account-deletion"),
        Triple("Support & Contact", Icons.Filled.Email, "/contact")
    )
    DetailColumn {
        DetailCard(title = t("Legal"), icon = Icons.Filled.Gavel) {
            links.forEachIndexed { index, (title, icon, path) ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { uriHandler.openUri("https://nivadesk.app$path") }
                        .padding(vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(icon, contentDescription = null, tint = StudioBlue, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(t(title), fontSize = 15.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    Icon(Icons.Filled.OpenInNew, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
                }
                if (index < links.size - 1) {
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
                }
            }
        }
        Text(
            t("NivaDesk is operated by EGGCRAFT LIMITED, a company registered in the United Kingdom."),
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 4.dp)
        )
    }
}

@Composable
private fun SecurityStatusPanel(requireDeviceUnlock: Boolean) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = if (requireDeviceUnlock) Color(0xFFEAF7EF) else Color(0xFFFFF4E8)
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            IconBubble(
                icon = Icons.Filled.Shield,
                tint = if (requireDeviceUnlock) StudioGreen else StudioOrange,
                container = if (requireDeviceUnlock) Color(0xFFDDF5E5) else Color(0xFFFFE8C7),
                size = 44.dp
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    if (requireDeviceUnlock) "Device unlock is active" else "Device unlock is off",
                    fontWeight = FontWeight.ExtraBold
                )
                Text(
                    if (requireDeviceUnlock) {
                        "NivaDesk will lock again after the app leaves the foreground and reopens with this session."
                    } else {
                        "This Android device will keep the current session open until you sign out."
                    },
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    lineHeight = 18.sp
                )
            }
        }
    }
}

@Composable
private fun IconBubble(icon: ImageVector, tint: Color, container: Color, size: androidx.compose.ui.unit.Dp = 50.dp) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Box(
        modifier = Modifier
            .size(size)
            .background(container, RoundedCornerShape(14.dp)),
        contentAlignment = Alignment.Center
    ) {
        Icon(icon, contentDescription = null, tint = tint)
    }
}

@Composable
private fun MenuField(label: String, value: String, options: List<String>, onSelect: (String) -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
        MenuChip(value = value, options = options, onSelect = onSelect)
    }
}

@Composable
private fun MenuChip(value: String, options: List<String>, modifier: Modifier = Modifier, onSelect: (String) -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var open by rememberSaveable { mutableStateOf(false) }
    Box(modifier = modifier) {
        Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.surfaceVariant, onClick = { open = true }) {
            Row(modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(t(value), color = StudioBlue, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(modifier = Modifier.width(4.dp))
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = StudioBlue, modifier = Modifier.size(18.dp))
            }
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(t(option), fontWeight = if (option == value) FontWeight.ExtraBold else FontWeight.Normal) },
                    onClick = {
                        open = false
                        onSelect(option)
                    }
                )
            }
        }
    }
}

@Composable
private fun SettingSwitch(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, modifier = Modifier.weight(1f), fontWeight = FontWeight.Bold)
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun TwoColumnSwitches(specs: List<SwitchSpec>, onSave: (String, Boolean) -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = Modifier.height(((specs.size + 1) / 2 * 74).dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        userScrollEnabled = false
    ) {
        items(specs, key = { it.key }) { spec ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(spec.label, modifier = Modifier.weight(1f), fontWeight = FontWeight.Bold, lineHeight = 18.sp)
                Switch(checked = spec.checked, onCheckedChange = { onSave(spec.key, it) })
            }
        }
    }
}

@Composable
private fun EditableNameList(title: String, addLabel: String, values: List<String>, onChange: (List<String>) -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(title, modifier = Modifier.weight(1f), fontWeight = FontWeight.ExtraBold)
        TextButton(onClick = { onChange(values + newEditableName(addLabel)) }) {
            Icon(Icons.Filled.AddCircle, contentDescription = null)
            Spacer(modifier = Modifier.width(4.dp))
            Text(addLabel)
        }
    }
    values.forEachIndexed { index, value ->
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = value,
                onValueChange = { nextValue ->
                    val next = values.toMutableList().also { it[index] = nextValue }
                    onChange(next)
                },
                modifier = Modifier.weight(1f),
                singleLine = true
            )
            IconButton(onClick = {
                val next = values.toMutableList().also { it.removeAt(index) }
                onChange(next)
            }) {
                Icon(Icons.Filled.Delete, contentDescription = "Delete", tint = DangerRed)
            }
        }
    }
}

@Composable
private fun EditableHeadingItemList(
    title: String,
    addLabel: String,
    values: List<StudioHeadingItem>,
    lockedIds: Set<String> = emptySet(),
    normalizeValues: (List<StudioHeadingItem>) -> List<StudioHeadingItem> = ::normalizeSpecialNoteSections,
    itemLabel: String = "Note section",
    onChange: (List<StudioHeadingItem>) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val normalizedValues = normalizeValues(values)
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(title, modifier = Modifier.weight(1f), fontWeight = FontWeight.ExtraBold)
        TextButton(onClick = { onChange(normalizedValues + newHeadingItem(addLabel)) }) {
            Icon(Icons.Filled.AddCircle, contentDescription = null)
            Spacer(modifier = Modifier.width(4.dp))
            Text(addLabel)
        }
    }
    normalizedValues.forEachIndexed { index, item ->
        val locked = lockedIds.any { it.equals(item.id, ignoreCase = true) }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = item.title,
                onValueChange = { nextTitle ->
                    val next = normalizedValues.toMutableList().also {
                        it[index] = item.copy(title = nextTitle)
                    }
                    onChange(next)
                },
                modifier = Modifier.weight(1f),
                label = { Text(if (locked) "Main note section" else itemLabel) },
                singleLine = true
            )
            if (!locked) {
                IconButton(onClick = {
                    val next = normalizedValues.toMutableList().also { it.removeAt(index) }
                    onChange(next)
                }) {
                    Icon(Icons.Filled.Delete, contentDescription = "Delete", tint = DangerRed)
                }
            } else {
                Spacer(modifier = Modifier.size(48.dp))
            }
        }
    }
}

@Composable
private fun EditableQuickReminderList(
    title: String,
    values: List<StudioQuickReminderTemplate>,
    onChange: (List<StudioQuickReminderTemplate>) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val normalizedValues = normalizeQuickReminderTemplates(values)
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(title, modifier = Modifier.weight(1f), fontWeight = FontWeight.ExtraBold)
        TextButton(onClick = { onChange(normalizedValues + newQuickReminderTemplate()) }) {
            Icon(Icons.Filled.AddCircle, contentDescription = null)
            Spacer(modifier = Modifier.width(4.dp))
            Text(t("Add Reminder"))
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        normalizedValues.forEachIndexed { index, item ->
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = item.title,
                            onValueChange = { titleValue ->
                                onChange(normalizedValues.updated(index, item.copy(title = titleValue)))
                            },
                            modifier = Modifier.weight(1f),
                            label = { Text(t("Button text")) },
                            singleLine = true
                        )
                        IconButton(onClick = { onChange(normalizedValues.toMutableList().also { it.removeAt(index) }) }) {
                            Icon(Icons.Filled.Delete, contentDescription = "Delete", tint = DangerRed)
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = item.days.toString(),
                            onValueChange = { value ->
                                val next = value.filter { it.isDigit() }.take(3).toIntOrNull() ?: 0
                                onChange(normalizedValues.updated(index, item.copy(days = next.coerceIn(0, 365))))
                            },
                            modifier = Modifier.weight(1f),
                            label = { Text(t("Days")) },
                            singleLine = true
                        )
                        OutlinedTextField(
                            value = item.hours.toString(),
                            onValueChange = { value ->
                                val next = value.filter { it.isDigit() }.take(2).toIntOrNull() ?: 0
                                onChange(normalizedValues.updated(index, item.copy(hours = next.coerceIn(0, 23))))
                            },
                            modifier = Modifier.weight(1f),
                            label = { Text(t("Hours")) },
                            singleLine = true
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        MenuChip(
                            value = item.priority,
                            options = listOf("Low", "Normal", "High", t("Urgent")),
                            modifier = Modifier.weight(1f)
                        ) { selected ->
                            onChange(normalizedValues.updated(index, item.copy(priority = selected)))
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                            Text(t("Notify"), modifier = Modifier.weight(1f), fontWeight = FontWeight.Bold)
                            Switch(
                                checked = item.notify,
                                onCheckedChange = { checked ->
                                    onChange(normalizedValues.updated(index, item.copy(notify = checked)))
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun newEditableName(addLabel: String): String {
    return when {
        addLabel.contains("Field", ignoreCase = true) -> "New Field"
        addLabel.contains("Toggle", ignoreCase = true) -> "New Toggle"
        addLabel.contains("Check", ignoreCase = true) -> "New Check"
        addLabel.contains("Note", ignoreCase = true) -> "New Note"
        addLabel.contains("Channel", ignoreCase = true) -> "New Channel"
        else -> "New Step"
    }
}

@Composable
private fun SegmentedRow(options: List<String>, selected: String, modifier: Modifier = Modifier, onSelect: (String) -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(modifier = modifier, shape = RoundedCornerShape(999.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
        Row(modifier = Modifier.padding(3.dp)) {
            options.forEach { option ->
                Surface(
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(999.dp),
                    color = if (option == selected) MaterialTheme.colorScheme.surface else Color.Transparent,
                    onClick = { onSelect(option) }
                ) {
                    Text(
                        option,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 9.dp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        fontWeight = FontWeight.ExtraBold
                    )
                }
            }
        }
    }
}

@Composable
private fun CompanyNumberRow(item: StudioCompanyNumber, onChange: (StudioCompanyNumber) -> Unit, onDelete: () -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
            value = item.title,
            onValueChange = { onChange(item.copy(title = it)) },
            modifier = Modifier.weight(1f),
            singleLine = true
        )
        OutlinedTextField(
            value = item.value,
            onValueChange = { onChange(item.copy(value = it)) },
            placeholder = { Text("Num...") },
            modifier = Modifier.weight(0.72f),
            singleLine = true
        )
        IconButton(onClick = onDelete) {
            Icon(Icons.Filled.Delete, contentDescription = null, tint = DangerRed)
        }
    }
}

@Composable
private fun ActionButton(label: String, icon: ImageVector, color: Color, onClick: () -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Button(onClick = onClick, colors = ButtonDefaults.buttonColors(containerColor = color), shape = RoundedCornerShape(8.dp)) {
        Icon(icon, contentDescription = null)
        Spacer(modifier = Modifier.width(8.dp))
        Text(label, fontWeight = FontWeight.ExtraBold)
    }
}

// A delivery URL carries a token that creates orders. Shown in full it leaks
// through a screen share or a support screenshot, so it is masked unless asked
// for — and copying never needs it revealed.
private fun maskDeliveryUrl(url: String): String {
    val marker = url.indexOf("token=")
    if (marker < 0) return url
    val keepTo = minOf(marker + "token=".length + 4, url.length)
    return url.substring(0, keepTo) + "•".repeat(24)
}

@Composable
private fun CopyableValue(title: String, value: String, buttonTitle: String, isSecret: Boolean = false) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current
    var revealed by remember(value) { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(title, modifier = Modifier.weight(1f), fontWeight = FontWeight.ExtraBold)
            if (isSecret && value.isNotBlank()) {
                TextButton(onClick = { revealed = !revealed }) {
                    Text(if (revealed) t("Hide") else t("Reveal for 30 seconds"))
                }
            }
            TextButton(onClick = {
                clipboard.setText(AnnotatedString(value))
                Toast.makeText(context, "$title copied.", Toast.LENGTH_SHORT).show()
            }) {
                Icon(Icons.Filled.ContentCopy, contentDescription = null)
                Spacer(modifier = Modifier.width(4.dp))
                Text(buttonTitle)
            }
        }
        Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.fillMaxWidth()) {
            Text(
                if (isSecret && !revealed) maskDeliveryUrl(value) else value,
                modifier = Modifier.padding(12.dp),
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@Composable
private fun StepRow(number: String, title: String, detail: String) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp))
            .padding(12.dp),
        verticalAlignment = Alignment.Top
    ) {
        Box(modifier = Modifier.size(36.dp).background(StudioBlue, CircleShape), contentAlignment = Alignment.Center) {
            Text(number, color = Color.White, fontWeight = FontWeight.ExtraBold)
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column {
            Text(title, fontWeight = FontWeight.ExtraBold)
            Text(detail, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun StepperRow(label: String, value: Int, suffix: String, onMinus: () -> Unit, onPlus: () -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, modifier = Modifier.weight(1f), fontWeight = FontWeight.Bold)
        Text("$value $suffix", color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.ExtraBold)
        Spacer(modifier = Modifier.width(10.dp))
        Surface(shape = RoundedCornerShape(999.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onMinus) { Text("-", fontSize = 24.sp, fontWeight = FontWeight.ExtraBold) }
                TextButton(onClick = onPlus) { Text("+", fontSize = 24.sp, fontWeight = FontWeight.ExtraBold) }
            }
        }
    }
}

@Composable
private fun InfoLine(label: String, value: String) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
        Text(value, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.ExtraBold)
    }
}

@Composable
private fun Avatar(initials: String, size: Int) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Box(
        modifier = Modifier
            .size(size.dp)
            .background(StudioBlue.copy(alpha = 0.16f), CircleShape),
        contentAlignment = Alignment.Center
    ) {
        Text(initials, color = StudioBlue, fontSize = (size * 0.34).sp, fontWeight = FontWeight.ExtraBold)
    }
}

@Composable
private fun Pill(label: String, color: Color) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(shape = RoundedCornerShape(999.dp), color = color.copy(alpha = 0.14f)) {
        Text(label, modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp), color = color, fontWeight = FontWeight.ExtraBold)
    }
}

@Composable
private fun MiniPill(label: String, icon: ImageVector) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(shape = RoundedCornerShape(999.dp), color = MaterialTheme.colorScheme.surface) {
        Row(modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(modifier = Modifier.width(4.dp))
            Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun PlanFeatureGrid(plan: StudioBillingPlan, storageText: String = planStorageLimitText(plan)) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val features = listOf(
        planOrderLimitText(plan) to true,
        planCustomerLimitText(plan) to true,
        storageText to plan.hasClientFiles,
        "Up to ${plan.teamMemberLimit} team" to plan.hasTeamAccess,
        "Client Files" to plan.hasClientFiles,
        t("Export Data") to true,
        "Card Customise" to plan.hasCardCustomization,
        "Financial Cards" to true,
        "Advanced Finance" to plan.hasAdvancedFinance,
        "Workspace Logo" to plan.hasWorkspaceLogoUpload,
        "Messages" to plan.hasTeamAccess,
        "Team Access" to plan.hasTeamAccess,
        "Storage Add-ons" to plan.hasStorageAddOns
    )
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        val columns = when {
            maxWidth >= 880.dp -> 3
            maxWidth >= 560.dp -> 2
            else -> 1
        }
        LazyVerticalGrid(
            columns = GridCells.Fixed(columns),
            modifier = Modifier
                .fillMaxWidth()
                .height(46.dp * (features.size / columns + if (features.size % columns == 0) 0 else 1).coerceAtLeast(1)),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            userScrollEnabled = false
        ) {
            items(features) { (title, enabled) ->
                PlanFeaturePill(title = title, enabled = enabled)
            }
        }
    }
}

@Composable
private fun PlanFeaturePill(title: String, enabled: Boolean) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = if (enabled) StudioGreen.copy(alpha = 0.12f) else MaterialTheme.colorScheme.surfaceVariant
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 11.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                if (enabled) Icons.Filled.CheckCircle else Icons.Filled.RadioButtonUnchecked,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = if (enabled) StudioGreen else MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Bold, color = if (enabled) StudioGreen else MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun PlanComparisonCard(plan: StudioBillingPlan, current: Boolean) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = if (current) StudioBlue.copy(alpha = 0.10f) else MaterialTheme.colorScheme.surfaceVariant,
        border = if (current) androidx.compose.foundation.BorderStroke(1.dp, StudioBlue.copy(alpha = 0.28f)) else null
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconBubble(
                    icon = plan.planIcon,
                    tint = plan.planAccent,
                    container = plan.planAccent.copy(alpha = 0.13f),
                    size = 42.dp
                )
                Spacer(modifier = Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(plan.title, fontWeight = FontWeight.ExtraBold)
                    Text(plan.purchaseModel, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
                }
                if (current) Pill("Current", StudioBlue)
            }
            Text(planBestForText(plan), color = MaterialTheme.colorScheme.onSurfaceVariant)
            PlanComparisonRow(planOrderLimitText(plan), true)
            PlanComparisonRow(planCustomerLimitText(plan), true)
            PlanComparisonRow(planStorageLimitText(plan), plan.hasClientFiles)
            PlanComparisonRow("Client Files", plan.hasClientFiles)
            PlanComparisonRow("Card Customise", plan.hasCardCustomization)
            PlanComparisonRow("Messages", plan.hasTeamAccess)
            PlanComparisonRow("Team Access", plan.hasTeamAccess)
        }
    }
}

@Composable
private fun PlanComparisonRow(title: String, enabled: Boolean) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(if (enabled) "Yes" else "No", color = if (enabled) StudioGreen else MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.ExtraBold)
        Spacer(modifier = Modifier.width(6.dp))
        Text(title, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun OwnerTestingPlanButton(
    plan: StudioBillingPlan,
    active: Boolean,
    saving: Boolean,
    onClick: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = if (active) StudioBlue.copy(alpha = 0.12f) else MaterialTheme.colorScheme.surfaceVariant,
        border = androidx.compose.foundation.BorderStroke(1.dp, if (active) StudioBlue.copy(alpha = 0.30f) else MaterialTheme.colorScheme.outlineVariant),
        onClick = onClick,
        enabled = !active && !saving
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            IconBubble(icon = plan.planIcon, tint = plan.planAccent, container = plan.planAccent.copy(alpha = 0.14f), size = 38.dp)
            Spacer(modifier = Modifier.width(10.dp))
            Column {
                Text(plan.title, fontWeight = FontWeight.ExtraBold)
                Text(if (saving && !active) "Saving..." else if (active) "Current plan" else plan.purchaseModel, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun StoreProductCard(title: String, productId: String, button: String) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, fontWeight = FontWeight.ExtraBold)
            Text(t("Product not loaded"), color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
            Text(t("Google Play product ID"), color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
            Text(productId, fontFamily = FontFamily.Monospace, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(t("Create this product ID in Google Play Console."), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Button(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) { Text(button) }
        }
    }
}

private val StudioBillingPlan.purchaseModel: String
    get() = when (this) {
        StudioBillingPlan.Demo -> "Demo"
        StudioBillingPlan.LifetimeLite,
        StudioBillingPlan.ProMonthly,
        StudioBillingPlan.TeamMonthly -> "Monthly or Annual Subscription"
    }

private val StudioBillingPlan.hasClientFiles: Boolean
    get() = this == StudioBillingPlan.ProMonthly || this == StudioBillingPlan.TeamMonthly

private val StudioBillingPlan.hasTeamAccess: Boolean
    get() = this == StudioBillingPlan.TeamMonthly

private val StudioBillingPlan.hasCardCustomization: Boolean
    get() = true

private val StudioBillingPlan.hasAdvancedFinance: Boolean
    get() = this == StudioBillingPlan.ProMonthly || this == StudioBillingPlan.TeamMonthly

private val StudioBillingPlan.hasWorkspaceLogoUpload: Boolean
    get() = this == StudioBillingPlan.ProMonthly || this == StudioBillingPlan.TeamMonthly

private val StudioBillingPlan.hasStorageAddOns: Boolean
    get() = this == StudioBillingPlan.ProMonthly || this == StudioBillingPlan.TeamMonthly

private val StudioBillingPlan.planIcon: ImageVector
    get() = when (this) {
        StudioBillingPlan.Demo -> Icons.Filled.Info
        StudioBillingPlan.LifetimeLite -> Icons.Filled.CheckCircle
        StudioBillingPlan.ProMonthly -> Icons.Filled.Security
        StudioBillingPlan.TeamMonthly -> Icons.Filled.People
    }

private val StudioBillingPlan.planAccent: Color
    get() = when (this) {
        StudioBillingPlan.Demo -> MaterialThemeColorFallback.Gray
        StudioBillingPlan.LifetimeLite -> StudioGreen
        StudioBillingPlan.ProMonthly -> StudioBlue
        StudioBillingPlan.TeamMonthly -> StudioPurple
    }

private object MaterialThemeColorFallback {
    val Gray: Color = Color(0xFF8E8E93)
}

private fun planOrderLimitText(plan: StudioBillingPlan): String {
    return if (plan == StudioBillingPlan.Demo) "10 orders" else "Unlimited orders"
}

private fun planCustomerLimitText(plan: StudioBillingPlan): String {
    return if (plan == StudioBillingPlan.Demo) "10 customers" else "Unlimited customers"
}

private fun planStorageLimitText(plan: StudioBillingPlan): String {
    return if (plan.storageLimitMb >= 1024) {
        "Storage: ${plan.storageLimitMb / 1024} GB"
    } else {
        "Storage: ${plan.storageLimitMb} MB"
    }
}

private fun planBestForText(plan: StudioBillingPlan): String {
    return when (plan) {
        StudioBillingPlan.Demo -> "Best for testing the app with a small sample workspace."
        StudioBillingPlan.LifetimeLite -> "Best for a solo studio that wants unlimited orders without monthly billing."
        StudioBillingPlan.ProMonthly -> "Best for a solo studio that needs uploads, advanced finance and workspace branding."
        StudioBillingPlan.TeamMonthly -> "Best for shared workspaces with roles, team scheduling and live card profile sync."
    }
}

@Composable
private fun RoleMix(state: StudioFlowUiState) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val counts = state.teamMembers.groupingBy { it.role.ifBlank { "member" } }.eachCount()
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        listOf("owner", "member", "viewer", "workflow").forEach { role ->
            Surface(shape = RoundedCornerShape(10.dp), color = StudioBlue.copy(alpha = 0.08f), modifier = Modifier.weight(1f)) {
                Column(modifier = Modifier.padding(10.dp)) {
                    Text(role.replaceFirstChar { it.uppercase() }, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
                    Text("${counts[role] ?: 0}", fontSize = 22.sp, fontWeight = FontWeight.ExtraBold, color = StudioBlue)
                }
            }
        }
    }
}

@Composable
private fun StatusFooter(state: StudioFlowUiState) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    if (state.settingsMessage.isBlank() && state.errorMessage.isBlank() && !state.settingsSaving) return
    Column(modifier = Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (state.settingsSaving) {
            Pill("Saving...", StudioBlue)
        }
        if (state.settingsMessage.isNotBlank()) {
            Pill(state.settingsMessage, StudioGreen)
        }
        if (state.errorMessage.isNotBlank()) {
            Pill(state.errorMessage, DangerRed)
        }
    }
}

private fun shareText(context: android.content.Context, title: String, text: String) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, title)
        putExtra(Intent.EXTRA_TEXT, text)
    }
    context.startActivity(Intent.createChooser(intent, title))
}

// Android backups carried orders and settings but no customers at all, so a
// user treating "Export Backup" as a real backup had none of their customer
// list in it. The key name matches what web and the server already read.
private fun backupJson(
    orders: List<StudioOrder>,
    customers: List<uk.co.eggcraft.studioflow.data.model.StudioCustomer>,
    settings: StudioWorkspaceSettings
): String {
    val root = JSONObject()
    val array = JSONArray()
    orders.forEach { order ->
        array.put(JSONObject().apply {
            put("customerName", order.customerName)
            put("paymentDate", SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).format(order.paymentDate))
            put("paidAmount", order.paidAmount)
            put("remainingAmount", order.remainingAmount)
            put("watchPurchasePrice", order.watchPurchasePrice)
            put("watchRef", order.watchRef)
            put("deliveryTime", order.deliveryTime)
            put("designName", order.designName)
            put("designLink", order.designLink)
            put("emailAddress", order.emailAddress)
            put("instagramUsername", order.instagramUsername)
            put("whatsappNumber", order.whatsappNumber)
            put("notes", order.notes)
            put("designStatus", order.designStatus)
            put("status", order.status)
            put("isDispatched", order.isDispatched)
            put("trackingNumber", order.trackingNumber)
            put("courier", order.courier)
            put("isDelivered", order.isDelivered)
            put("paymentFee", order.paymentFee)
            put("deliveryCost", order.deliveryCost)
            put("paymentMethod", order.paymentMethod)
            put("taxRate", order.taxRate)
            put("taxAmount", order.taxAmount)
            put("taxType", order.taxType)
            put("priority", order.priority)
            put("risk", order.risk)
            put("riskReason", order.riskReason)
            put("invBool1", order.invBool1)
            put("invBool2", order.invBool2)
            put("invBool3", order.invBool3)
            put("invBool4", order.invBool4)
            put("invNotes", order.invNotes)
            put("customFields", stringMapJson(order.customFields))
            put("customToggles", boolMapJson(order.customToggles))
        })
    }
    root.put("version", 2)
    root.put("exportedAt", SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).format(java.util.Date()))
    root.put("siparisler", array)

    val customerArray = JSONArray()
    customers.forEach { customer ->
        customerArray.put(JSONObject().apply {
            put("name", customer.name)
            put("email", customer.email)
            put("phone", customer.phone)
            put("instagram", customer.instagram)
            put("address", customer.address)
            put("streetAddress", customer.streetAddress)
            put("city", customer.city)
            put("postalCode", customer.postalCode)
            put("country", customer.country)
            put("shippingAddress", customer.shippingAddress)
            put("shippingStreetAddress", customer.shippingStreetAddress)
            put("shippingCity", customer.shippingCity)
            put("shippingPostalCode", customer.shippingPostalCode)
            put("shippingCountry", customer.shippingCountry)
            put("shippingPhone", customer.shippingPhone)
            put("notes", customer.notes)
            put("profileImageUrl", customer.profileImageUrl)
        })
    }
    root.put("musteriler", customerArray)

    root.put("settings", JSONObject().apply {
        put("appTheme", settings.appTheme)
        put("seciliDil", settings.selectedLanguage)
        put("businessType", settings.businessType)
        put("businessDescriptionPrompt", settings.businessDescriptionPrompt)
        put("activeStatusesJSON", stringArrayJson(settings.activeStatuses))
        put("customFieldsJSON", titleArrayJson(settings.customFields))
        put("specialNoteSectionsJSON", headingItemsJson(settings.specialNoteSections))
        put("specialNoteSectionsJSONV1", headingItemsJson(settings.specialNoteSections))
        put("communicationShowTelephone", settings.communicationShowTelephone)
        put("communicationShowEmail", settings.communicationShowEmail)
        put("communicationShowAddress", settings.communicationShowAddress)
        put("communicationShowChannel", settings.communicationShowChannel)
        put("communicationShowCustomerNotes", settings.communicationShowCustomerNotes)
        put("communicationChannelLabelsJSON", stringArrayJson(settings.communicationChannelLabels))
        put("customStepsJSON", titleArrayJson(settings.customSteps))
        put("customTogglesJSON", titleArrayJson(settings.customToggles))
        put("materialsDefaultChecksJSON", titleArrayJson(settings.materialsDefaultChecks))
        put("materialsTogglesJSON", titleArrayJson(settings.materialsToggles))
        put("showStatusNotesSupplier", settings.showStatusNotesSupplier)
        put("statusNotesSupplierLabel", settings.statusNotesSupplierLabel)
        put("showMaterialsNotesSupplier", settings.showMaterialsNotesSupplier)
        put("materialsNotesSupplierLabel", settings.materialsNotesSupplierLabel)
        put("financialShowBaseCost", settings.financialShowBaseCost)
        put("financialBaseCostLabel", settings.financialBaseCostLabel)
        put("financialRemainingItemsJSON", genericHeadingItemsJson(settings.financialRemainingItems))
        put("financialExpenseItemsJSON", genericHeadingItemsJson(settings.financialExpenseItems))
        put("scheduleQuickRemindersJSON", quickReminderTemplatesJson(settings.scheduleQuickReminders))
        settings.materialsDefaultChecks.take(4).forEachIndexed { index, label ->
            put("invLabel${index + 1}", label)
        }
        put("summaryStep1", settings.summaryStep1)
        put("summaryStep2", settings.summaryStep2)
        put("orderListStep1", settings.orderListStep1)
        put("orderListStep2", settings.orderListStep2)
        put("appLogoUrl", settings.appLogoUrl)
    })
    return root.toString(2)
}

private fun stringMapJson(values: Map<String, String>): JSONObject {
    return JSONObject().also { json ->
        values.forEach { (key, value) -> json.put(key, value) }
    }
}

private fun boolMapJson(values: Map<String, Boolean>): JSONObject {
    return JSONObject().also { json ->
        values.forEach { (key, value) -> json.put(key, value) }
    }
}

private fun ordersCsv(orders: List<StudioOrder>): String {
    return buildString {
        append("Customer Name,Design Name,Paid Amount,Remaining,Status,Date\n")
        orders.forEach { order ->
            append(csv(order.customerName)).append(',')
            append(csv(order.designName)).append(',')
            append(order.paidAmount).append(',')
            append(order.remainingAmount).append(',')
            append(csv(order.status)).append(',')
            append(csv(SimpleDateFormat("yyyy-MM-dd", Locale.US).format(order.paymentDate))).append('\n')
        }
    }
}

private fun csv(value: String): String {
    val escaped = value.replace("\"", "\"\"")
    return if (escaped.contains(",") || escaped.contains("\n") || escaped.contains("\"")) "\"$escaped\"" else escaped
}

private fun stringArrayJson(values: List<String>): String {
    return JSONArray().also { array -> values.forEach { array.put(it) } }.toString()
}

private fun titleArrayJson(values: List<String>): String {
    return JSONArray().also { array ->
        values.forEach { title ->
            array.put(JSONObject().put("title", title))
        }
    }.toString()
}

private fun headingItemsJson(values: List<StudioHeadingItem>): String {
    return JSONArray().also { array ->
        normalizeSpecialNoteSections(values).forEach { item ->
            array.put(JSONObject().put("id", item.id).put("title", item.title))
        }
    }.toString()
}

private fun genericHeadingItemsJson(values: List<StudioHeadingItem>): String {
    return JSONArray().also { array ->
        normalizeHeadingItems(values).forEach { item ->
            array.put(JSONObject().put("id", item.id).put("title", item.title))
        }
    }.toString()
}

private fun specialNoteSectionUpdates(values: List<StudioHeadingItem>): Map<String, Any?> {
    val json = headingItemsJson(values)
    return mapOf(
        "specialNoteSectionsJSON" to json,
        "specialNoteSectionsJSONV1" to json
    )
}

private fun scheduleQuickReminderUpdates(values: List<StudioQuickReminderTemplate>): Map<String, Any?> {
    return mapOf("scheduleQuickRemindersJSON" to quickReminderTemplatesJson(values))
}

private fun normalizeSpecialNoteSections(values: List<StudioHeadingItem>): List<StudioHeadingItem> {
    val cleaned = mutableListOf<StudioHeadingItem>()
    values.forEach { item ->
        val title = item.title.trim().take(120)
        if (title.isBlank()) return@forEach
        val id = item.id.trim().take(80).ifBlank { UUID.randomUUID().toString().uppercase(Locale.US) }
        if (cleaned.none { existing -> existing.id.equals(id, ignoreCase = true) }) {
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

private fun normalizeHeadingItems(values: List<StudioHeadingItem>): List<StudioHeadingItem> {
    val cleaned = mutableListOf<StudioHeadingItem>()
    values.forEach { item ->
        val title = item.title.trim().take(120)
        if (title.isBlank()) return@forEach
        val id = item.id.trim().take(80).ifBlank { UUID.randomUUID().toString().uppercase(Locale.US) }
        if (cleaned.none { existing -> existing.id.equals(id, ignoreCase = true) }) {
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

private fun newHeadingItem(addLabel: String): StudioHeadingItem {
    return StudioHeadingItem(
        id = UUID.randomUUID().toString().uppercase(Locale.US),
        title = newEditableName(addLabel)
    )
}

private fun quickReminderTemplatesJson(values: List<StudioQuickReminderTemplate>): String {
    return JSONArray().also { array ->
        normalizeQuickReminderTemplates(values).forEach { item ->
            array.put(
                JSONObject()
                    .put("id", item.id)
                    .put("title", item.title)
                    .put("days", item.days)
                    .put("hours", item.hours)
                    .put("priority", item.priority)
                    .put("notify", item.notify)
            )
        }
    }.toString()
}

private fun normalizeQuickReminderTemplates(values: List<StudioQuickReminderTemplate>): List<StudioQuickReminderTemplate> {
    return values
        .map { item ->
            item.copy(
                id = item.id.trim().take(80).ifBlank { UUID.randomUUID().toString().uppercase(Locale.US) },
                title = item.title.trim().take(120),
                days = item.days.coerceIn(0, 365),
                hours = item.hours.coerceIn(0, 23),
                priority = reminderPriority(item.priority)
            )
        }
        .filter { it.title.isNotBlank() }
        .distinctBy { it.title.lowercase(Locale.UK) }
        .take(20)
        .ifEmpty {
            listOf(
                StudioQuickReminderTemplate("default-follow-up", "Follow up customer", 1, 0),
                StudioQuickReminderTemplate("default-update", "Send design update", 1, 0),
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

private fun newQuickReminderTemplate(): StudioQuickReminderTemplate {
    return StudioQuickReminderTemplate(
        id = UUID.randomUUID().toString().uppercase(Locale.US),
        title = "Custom reminder",
        days = 1,
        hours = 0,
        priority = "Normal",
        notify = true
    )
}

private fun List<StudioQuickReminderTemplate>.updated(index: Int, item: StudioQuickReminderTemplate): List<StudioQuickReminderTemplate> {
    return toMutableList().also { it[index] = item }
}

private fun materialDefaultCheckUpdates(values: List<String>): Map<String, Any?> {
    val cleaned = values.map { it.trim() }.filter { it.isNotBlank() }.ifEmpty {
        listOf("Material Check 1")
    }
    val padded = cleaned + listOf("Item", "Item", "Item", "Materials Ready")
    return mapOf(
        "materialsDefaultChecksJSON" to titleArrayJson(cleaned),
        "invLabel1" to padded[0],
        "invLabel2" to padded[1],
        "invLabel3" to padded[2],
        "invLabel4" to padded[3]
    )
}

private fun companyNumbersJson(values: List<StudioCompanyNumber>): String {
    return JSONArray().also { array ->
        values.forEach { item ->
            array.put(JSONObject().put("title", item.title).put("value", item.value))
        }
    }.toString()
}

private fun quickReplyTemplatesJson(values: List<QuickReplyTemplateItem>): String {
    return JSONArray().also { array ->
        values.forEach { item ->
            array.put(
                JSONObject()
                    .put("id", item.id)
                    .put("title", item.title)
                    .put("desc", item.desc)
            )
        }
    }.toString()
}

private fun newQuickReplyTemplateItem(label: String): QuickReplyTemplateItem {
    val cleanLabel = label.removePrefix("Add ").ifBlank { "Template" }
    return QuickReplyTemplateItem(
        id = "android-template-${System.nanoTime()}",
        title = cleanLabel,
        desc = ""
    )
}

private fun defaultQuickReplyProducts(): List<QuickReplyTemplateItem> = listOf(
    QuickReplyTemplateItem("default-product-1", "Service / Product 1", "Price starts at $100.")
)

private fun defaultQuickReplyRules(): List<QuickReplyTemplateItem> = listOf(
    QuickReplyTemplateItem("default-rule-1", "Delivery Rule", "We usually deliver within 3-5 business days.")
)

internal fun smartWorkflowTemplateUpdates(prompt: String, currentBusinessType: String): Map<String, Any?> {
    val text = "$currentBusinessType $prompt".lowercase(Locale.UK)
    val hasShipping = containsWorkflowTerm(text, "ship", "shipping", "delivery", "courier", "dispatch", "kargo", "teslimat")
    val hasMaterials = containsWorkflowTerm(text, "material", "parts", "fabric", "metal", "stone", "paint", "inventory", "stock", "malzeme", "parca", "kumas")
    val hasApproval = containsWorkflowTerm(text, "approval", "approve", "review", "mockup", "concept", "quote", "onay", "taslak", "teklif")
    val hasDeposit = containsWorkflowTerm(text, "deposit", "payment", "paid", "invoice", "quote", "depozito", "odeme", "fatura")
    val promptText = prompt.ifBlank {
        "Describe this business, the information it needs from customers, the workflow steps, approvals, payments, materials and delivery rules."
    }

    return when {
        containsWorkflowTerm(text, "watch", "dial", "paint", "art", "artwork", "miniature", "portrait", "eggcraft", "saat", "kadran", "boya") -> workflowTemplatePayload(
            businessType = "Custom Art Studio",
            businessPrompt = promptText,
            customFields = listOf("Dial Size", "Design Theme"),
            customSteps = listOf("Enquiry", "Concept", "Mockup", "Client Approval", "Painting", "Curing", "Final Review"),
            customToggles = listOf("Deposit Paid?", "Dial Received?", "Mockup Approved?", "Painting Completed?", "Curing Finished?", "Final Photos Sent?"),
            activeStatuses = listOf("New", "Quoted", "Waiting for Deposit", "Deposit Paid", "Waiting for Customer", "Waiting for Approval", "Approved", "In Progress", "Ready for Review", "Ready to Ship", "Shipped", "Done", "Cancelled"),
            summaryStep1 = "Mockup",
            summaryStep2 = "Painting",
            showMaterials = true,
            showShipping = true,
            showPriority = true
        )
        containsWorkflowTerm(text, "repair", "fix", "diagnostic", "warranty", "device", "service", "tamir", "onarim", "ariza", "cihaz") -> workflowTemplatePayload(
            businessType = "Repair Service",
            businessPrompt = promptText,
            customFields = listOf("Item / Device Model", "Serial Number", "Issue Reported", "Warranty Status"),
            customSteps = listOf("Check-in", "Diagnostics", "Quote Approval", "Parts Order", "Repair", "Testing", "Ready for Pickup"),
            customToggles = listOf("Item Received?", "Customer Approved Cost?", "Parts Arrived?", "Repair Completed?", "Quality Tested?", "Warranty Note Added?"),
            activeStatuses = listOf("New", "Waiting for Customer", "Diagnostics", "Quoted", "Waiting for Approval", "Waiting for Material", "In Progress", "Testing", "Ready to Ship", "Done", "Cancelled"),
            summaryStep1 = "Diagnostics",
            summaryStep2 = "Repair",
            showMaterials = true,
            showShipping = hasShipping,
            showPriority = true
        )
        containsWorkflowTerm(text, "tailor", "alteration", "sewing", "garment", "fabric", "dress", "fitting", "terzi", "tadilat", "dikis", "kumas") -> workflowTemplatePayload(
            businessType = "Tailor / Alteration Studio",
            businessPrompt = promptText,
            customFields = listOf("Garment Type", "Measurements", "Fabric", "Fitting Date"),
            customSteps = listOf("Consultation", "Measurements", "Pinning", "Cutting", "Sewing", "Fitting", "Final Press"),
            customToggles = listOf("Measurements Taken?", "Fabric Received?", "Fitting Approved?", "Final Pressed?", "Ready for Collection?"),
            activeStatuses = listOf("New", "Waiting for Customer", "Quoted", "Waiting for Deposit", "Approved", "In Progress", "Ready for Review", "Ready to Ship", "Done", "Cancelled"),
            summaryStep1 = "Sewing",
            summaryStep2 = "Fitting",
            showMaterials = true,
            showShipping = hasShipping,
            showPriority = true
        )
        containsWorkflowTerm(text, "jewellery", "jewelry", "ring", "necklace", "stone", "diamond", "gold", "silver", "mucevher", "taki", "yuzuk") -> workflowTemplatePayload(
            businessType = "Jewellery Studio",
            businessPrompt = promptText,
            customFields = listOf("Metal Type", "Size", "Stone / Setting", "Design Reference"),
            customSteps = listOf("Consultation", "Design", "CAD / Mockup", "Casting", "Stone Setting", "Polishing", "Final Check"),
            customToggles = listOf("Deposit Paid?", "Design Approved?", "Metal Sourced?", "Stones Arrived?", "Hallmarked?", "Box Ready?"),
            activeStatuses = listOf("New", "Quoted", "Waiting for Deposit", "Deposit Paid", "Waiting for Approval", "Approved", "Waiting for Material", "In Progress", "Ready for Review", "Ready to Ship", "Done", "Cancelled"),
            summaryStep1 = "Design",
            summaryStep2 = "Stone Setting",
            showMaterials = true,
            showShipping = true,
            showPriority = true
        )
        containsWorkflowTerm(text, "photo", "photography", "video", "shoot", "wedding", "retouch", "editing", "gallery", "fotograf", "cekim", "dugun") -> workflowTemplatePayload(
            businessType = "Photography Studio",
            businessPrompt = promptText,
            customFields = listOf("Shoot Type", "Location", "Shoot Date", "Package"),
            customSteps = listOf("Enquiry", "Booking", "Pre-shoot", "Shooting", "Selection", "Editing", "Delivery"),
            customToggles = listOf("Contract Signed?", "Deposit Paid?", "Shot List Received?", "Gallery Sent?", "Final Files Delivered?"),
            activeStatuses = listOf("New", "Quoted", "Waiting for Deposit", "Deposit Paid", "Waiting for Customer", "Approved", "In Progress", "Ready for Review", "Delivered", "Done", "Cancelled"),
            summaryStep1 = "Shooting",
            summaryStep2 = "Editing",
            showMaterials = false,
            showShipping = false,
            showPriority = true
        )
        containsWorkflowTerm(text, "agency", "design", "branding", "website", "marketing", "content", "consulting", "ajans", "tasarim", "marka") -> workflowTemplatePayload(
            businessType = "Agency / Creative Studio",
            businessPrompt = promptText,
            customFields = listOf("Project Type", "Brand / Company", "Deliverables", "Deadline"),
            customSteps = listOf("Brief", "Research", "Concept", "Draft", "Revision", "Approval", "Delivery"),
            customToggles = listOf("Brief Received?", "Deposit Paid?", "Assets Received?", "Draft Approved?", "Invoice Sent?"),
            activeStatuses = listOf("New", "Quoted", "Waiting for Deposit", "Deposit Paid", "Waiting for Customer", "Waiting for Approval", "Approved", "In Progress", "Revision Needed", "Done", "Cancelled"),
            summaryStep1 = "Concept",
            summaryStep2 = "Revision",
            showMaterials = false,
            showShipping = false,
            showPriority = true
        )
        containsWorkflowTerm(text, "food", "bakery", "cake", "catering", "restaurant", "allergy", "yemek", "firin", "pasta", "alerji") -> workflowTemplatePayload(
            businessType = "Food / Bakery",
            businessPrompt = promptText,
            customFields = listOf("Event / Order Type", "Event Date", "Servings / Quantity", "Allergies"),
            customSteps = listOf("Enquiry", "Menu Plan", "Quote", "Deposit", "Ingredients", "Preparation", "Delivery / Collection"),
            customToggles = listOf("Deposit Paid?", "Allergies Confirmed?", "Ingredients Ready?", "Customer Confirmed Date?", "Packed?"),
            activeStatuses = listOf("New", "Quoted", "Waiting for Deposit", "Deposit Paid", "Waiting for Customer", "Approved", "In Progress", "Ready to Ship", "Delivered", "Done", "Cancelled"),
            summaryStep1 = "Menu Plan",
            summaryStep2 = "Preparation",
            showMaterials = true,
            showShipping = true,
            showPriority = true
        )
        containsWorkflowTerm(text, "beauty", "clinic", "wellness", "salon", "treatment", "therapy", "appointment", "guzellik", "klinik", "randevu") -> workflowTemplatePayload(
            businessType = "Beauty / Wellness",
            businessPrompt = promptText,
            customFields = listOf("Service Type", "Appointment Date", "Practitioner", "Client Notes"),
            customSteps = listOf("Enquiry", "Booking", "Consultation", "Treatment", "Follow-up"),
            customToggles = listOf("Consent Form Signed?", "Deposit Paid?", "Patch Test Done?", "Aftercare Sent?"),
            activeStatuses = listOf("New", "Waiting for Customer", "Booked", "Approved", "In Progress", "Follow-up", "Done", "Cancelled"),
            summaryStep1 = "Booking",
            summaryStep2 = "Treatment",
            showMaterials = false,
            showShipping = false,
            showPriority = true
        )
        containsWorkflowTerm(text, "handmade", "product", "craft", "maker", "etsy", "shop", "ecommerce", "el yapimi", "urun", "zanaat") -> workflowTemplatePayload(
            businessType = "Handmade / General",
            businessPrompt = promptText,
            customFields = listOf("Item Name", "Variant", "Quantity", "Personalisation"),
            customSteps = listOf("Order Received", "Sourcing", "Making", "Quality Check", "Packing", "Shipped"),
            customToggles = listOf("Payment Cleared?", "Materials Ready?", "Personalisation Checked?", "Packed?", "Tracking Sent?"),
            activeStatuses = listOf("New", "Waiting for Deposit", "Deposit Paid", "Waiting for Material", "In Progress", "Ready to Ship", "Shipped", "Delivered", "Done", "Cancelled"),
            summaryStep1 = "Making",
            summaryStep2 = "Packing",
            showMaterials = true,
            showShipping = true,
            showPriority = true
        )
        else -> {
            val fields = buildList {
                add("Customer Request")
                add("Project / Item Type")
                add("Reference / Notes")
                if (hasShipping) add("Delivery Address")
            }
            val steps = buildList {
                add("Enquiry")
                add("Quote")
                if (hasDeposit) add("Deposit")
                if (hasMaterials) add("Sourcing")
                add("Preparation")
                add("In Progress")
                if (hasApproval) add("Review / Approval")
                add(if (hasShipping) "Delivery / Shipping" else "Completion")
            }
            workflowTemplatePayload(
                businessType = currentBusinessType.ifBlank { "Other / Prompt Based" },
                businessPrompt = promptText,
                customFields = fields,
                customSteps = steps,
                customToggles = buildList {
                    add("Customer Details Confirmed?")
                    if (hasDeposit) add("Deposit Paid?")
                    if (hasMaterials) add("Materials Ready?")
                    if (hasApproval) add("Client Approved?")
                    add("Quality Checked?")
                    add("Invoice Sent?")
                },
                activeStatuses = listOf("New", "Waiting for Customer", "Quoted", "Waiting for Deposit", "Approved", "In Progress", "Ready for Review", "Ready to Ship", "Done", "Cancelled"),
                summaryStep1 = steps.getOrElse(2) { steps.first() },
                summaryStep2 = if (steps.contains("In Progress")) "In Progress" else steps.last(),
                showMaterials = hasMaterials,
                showShipping = hasShipping,
                showPriority = true
            )
        }
    }
}

internal fun standardWorkflowTemplate(businessType: String): Map<String, Any?> {
    return smartWorkflowTemplateUpdates("", businessType).minus("businessDescriptionPrompt")
}

private fun workflowTemplatePayload(
    businessType: String,
    businessPrompt: String,
    customFields: List<String>,
    customSteps: List<String>,
    customToggles: List<String>,
    activeStatuses: List<String>,
    summaryStep1: String,
    summaryStep2: String,
    showMaterials: Boolean,
    showShipping: Boolean,
    showPriority: Boolean
): Map<String, Any?> {
    return mapOf(
        "businessType" to businessType,
        "businessDescriptionPrompt" to businessPrompt,
        "customFieldsJSON" to titleArrayJson(customFields),
        "customStepsJSON" to titleArrayJson(customSteps),
        "customTogglesJSON" to titleArrayJson(customToggles),
        "materialsTogglesJSON" to titleArrayJson(emptyList()),
        "showMaterialsNotesSupplier" to true,
        "materialsNotesSupplierLabel" to "Notes / Supplier",
        "activeStatusesJSON" to stringArrayJson(activeStatuses),
        "summaryStep1" to summaryStep1,
        "summaryStep2" to summaryStep2,
        "orderListStep1" to summaryStep1,
        "orderListStep2" to summaryStep2,
        "showCardMaterials" to showMaterials,
        "showCardShipping" to showShipping,
        "showCardPriority" to showPriority,
        "showCardCustomerNotes" to true
    ) + materialDefaultCheckUpdates(defaultInventoryLabelsForBusiness(businessType, showMaterials))
}

private fun containsWorkflowTerm(text: String, vararg terms: String): Boolean {
    return terms.any { term -> text.contains(term.lowercase(Locale.UK)) }
}

private fun defaultInventoryLabelsForBusiness(businessType: String, showMaterials: Boolean): List<String> {
    if (!showMaterials) return listOf("Information Received", "Assets Ready", "Checklist Ready", "Delivery Ready")
    return when (businessType) {
        "Custom Art Studio" -> listOf("Dial Sourced", "Paints Ready", "Brushes Prepared", "Packaging Ready")
        "Repair Service" -> listOf("Item Received", "Parts Ordered", "Parts Arrived", "Ready for Pickup")
        "Tailor / Alteration Studio" -> listOf("Fabric Sourced", "Threads Ready", "Accessories Ready", "Machine Setup")
        "Jewellery Studio" -> listOf("Metal Sourced", "Moulds Ready", "Stones Arrived", "Box Ready")
        "Photography Studio" -> listOf("Equipment Ready", "Memory Cards Ready", "Backup Drive Ready", "Delivery Folder Ready")
        "Agency / Creative Studio" -> listOf("Assets Received", "Brand Files Ready", "Copy Ready", "Export Folder Ready")
        "Food / Bakery" -> listOf("Ingredients Ordered", "Ingredients Ready", "Packaging Ready", "Delivery Slot Set")
        "Beauty / Wellness" -> listOf("Room Ready", "Products Ready", "Consent Form Ready", "Aftercare Ready")
        "Handmade / General" -> listOf("Main Material", "Components Ready", "Packaging Ready", "Label Ready")
        else -> listOf("Main Material", "Supplier Confirmed", "Tools Ready", "Packaging Ready")
    }
}

private fun engineLabel(value: String): String = when (value) {
    "Apple", "Local" -> "On-Device AI"
    "Offline" -> "Offline Template"
    else -> "OpenAI Online"
}

private fun engineDescription(value: String): String = when (value) {
    "Apple", "Local" -> "Uses Apple Foundation Models on Apple devices. On Android, switch to OpenAI Online or Offline Template."
    "Offline" -> "Uses saved products and rules without an AI model."
    else -> "Uses OpenAI online with your API key."
}

private fun initials(value: String): String {
    val parts = value.trim().split(Regex("[\\s@._-]+")).filter { it.isNotBlank() }
    return parts.take(2).map { it.first().uppercaseChar() }.joinToString("").ifBlank { "?" }
}

private data class SettingsSection(val key: String, val title: String, val subtitle: String, val icon: ImageVector, val group: String = "Workspace")

// Map legacy / deep-link section keys onto the new Account / Workspace structure.
private fun mapLegacySettingsKey(key: String?): String? = when (key) {
    "general", "account", "profile" -> "profileSecurity"
    "theme", "appearance", "language" -> "preferences"
    else -> key
}

private data class SwitchSpec(val label: String, val checked: Boolean, val key: String)

private data class PickedUpload(val bytes: ByteArray, val contentType: String)

private fun readPickedUpload(context: android.content.Context, uri: android.net.Uri): PickedUpload? {
    val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
    val contentType = context.contentResolver.getType(uri).orEmpty().ifBlank { "image/jpeg" }
    return PickedUpload(bytes = bytes, contentType = contentType)
}

@Composable
private fun MessageSettingsDetail(
    state: StudioFlowUiState,
    onSave: (uk.co.eggcraft.studioflow.data.model.StudioMessageWorkspaceSettings) -> Unit,
    onReload: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val canEdit = state.workspace?.isOwner == true || state.workspace?.role == "admin"
    val current = state.messageWorkspaceSettings
    var direct by remember(current) { mutableStateOf(current.directMessagesEnabled) }
    var group by remember(current) { mutableStateOf(current.groupConversationsEnabled) }
    var attachments by remember(current) { mutableStateOf(current.attachmentsEnabled) }
    val dirty = direct != current.directMessagesEnabled ||
        group != current.groupConversationsEnabled ||
        attachments != current.attachmentsEnabled

    androidx.compose.foundation.layout.Column(
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(16.dp)
    ) {
        androidx.compose.material3.Text(
            "Control workspace-wide messaging permissions for the team.",
            fontSize = 12.sp,
            color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant
        )
        androidx.compose.material3.Surface(
            shape = androidx.compose.foundation.shape.RoundedCornerShape(16.dp),
            color = androidx.compose.material3.MaterialTheme.colorScheme.surface,
            tonalElevation = 1.dp
        ) {
            androidx.compose.foundation.layout.Column(
                modifier = androidx.compose.ui.Modifier.padding(16.dp),
                verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(14.dp)
            ) {
                MessageSettingsToggle(
                    title = t("Allow Direct Messages"),
                    description = t("Team members can start one-to-one conversations."),
                    checked = direct,
                    enabled = canEdit && !state.isSavingMessageWorkspaceSettings,
                    onChange = { direct = it }
                )
                MessageSettingsToggle(
                    title = t("Allow Group Conversations"),
                    description = t("Team members can add people and create group chats."),
                    checked = group,
                    enabled = canEdit && !state.isSavingMessageWorkspaceSettings,
                    onChange = { group = it }
                )
                MessageSettingsToggle(
                    title = t("Allow File & Image Sending"),
                    description = t("Team members can send images and files in Messages."),
                    checked = attachments,
                    enabled = canEdit && !state.isSavingMessageWorkspaceSettings,
                    onChange = { attachments = it }
                )
            }
        }
        androidx.compose.foundation.layout.Row(
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
            horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)
        ) {
            androidx.compose.material3.OutlinedButton(
                onClick = onReload,
                enabled = !state.isSavingMessageWorkspaceSettings
            ) { androidx.compose.material3.Text(t("Reload")) }
            androidx.compose.foundation.layout.Spacer(modifier = androidx.compose.ui.Modifier.weight(1f))
            androidx.compose.material3.Button(
                onClick = {
                    onSave(
                        uk.co.eggcraft.studioflow.data.model.StudioMessageWorkspaceSettings(
                            directMessagesEnabled = direct,
                            groupConversationsEnabled = group,
                            attachmentsEnabled = attachments
                        )
                    )
                },
                enabled = canEdit && dirty && !state.isSavingMessageWorkspaceSettings
            ) {
                androidx.compose.material3.Text(
                    if (state.isSavingMessageWorkspaceSettings) "Saving…" else "Save"
                )
            }
        }
        if (!canEdit) {
            androidx.compose.material3.Text(
                "Only workspace owners or admins can change these settings.",
                fontSize = 12.sp,
                color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        if (state.messageWorkspaceSettingsStatus.isNotBlank()) {
            androidx.compose.material3.Text(
                state.messageWorkspaceSettingsStatus,
                fontSize = 12.sp,
                color = if (state.messageWorkspaceSettingsStatus.lowercase().contains("error"))
                    androidx.compose.material3.MaterialTheme.colorScheme.error
                else
                    androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun MessageSettingsToggle(
    title: String,
    description: String,
    checked: Boolean,
    enabled: Boolean,
    onChange: (Boolean) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    androidx.compose.foundation.layout.Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
        androidx.compose.foundation.layout.Column(modifier = androidx.compose.ui.Modifier.weight(1f)) {
            androidx.compose.material3.Text(
                title,
                fontSize = 14.sp,
                fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold
            )
            androidx.compose.material3.Text(
                description,
                fontSize = 11.sp,
                color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        androidx.compose.material3.Switch(checked = checked, onCheckedChange = onChange, enabled = enabled)
    }
}

// --- NivaDesk admin: public site statistics -------------------------------

private fun isNivaDeskAdminAccount(): Boolean {
    val email = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.email
        ?.trim()?.lowercase() ?: return false
    return email == "nivadesk@gmail.com" || email == "eggcraftco@gmail.com" || email == "contact@eggcraft.co.uk"
}

private data class SiteStatsDay(
    val total: Int,
    val sessions: Int,
    val pages: Map<String, Int>,
    val devices: Map<String, Int>,
    val languages: Map<String, Int>,
    val referrers: Map<String, Int>
)

private fun siteStatsInt(value: Any?): Int = when (value) {
    is Number -> value.toInt()
    else -> 0
}

@Suppress("UNCHECKED_CAST")
private fun siteStatsMap(value: Any?): Map<String, Int> =
    (value as? Map<String, Any?>)?.mapValues { siteStatsInt(it.value) } ?: emptyMap()

private fun mergeTopEntries(days: List<SiteStatsDay>, pick: (SiteStatsDay) -> Map<String, Int>, limit: Int = 6): List<Pair<String, Int>> {
    val merged = mutableMapOf<String, Int>()
    days.forEach { day -> pick(day).forEach { (key, value) -> merged[key] = (merged[key] ?: 0) + value } }
    return merged.entries.sortedByDescending { it.value }.take(limit).map { it.key to it.value }
}

@Composable
private fun SiteStatsAdminDetail() {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }

    var range by remember { mutableStateOf(30) }
    var loading by remember { mutableStateOf(true) }
    var errorText by remember { mutableStateOf("") }
    var days by remember { mutableStateOf<List<SiteStatsDay>>(emptyList()) }

    LaunchedEffect(range) {
        loading = true
        errorText = ""
        try {
            val result = com.google.firebase.functions.FirebaseFunctions.getInstance("europe-west2")
                .getHttpsCallable("getSiteStats")
                .call(mapOf("days" to range))
                .await()
            @Suppress("UNCHECKED_CAST")
            val data = result.data as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val rawDays = data?.get("days") as? List<Map<String, Any?>> ?: emptyList()
            days = rawDays.map { day ->
                SiteStatsDay(
                    total = siteStatsInt(day["total"]),
                    sessions = siteStatsInt(day["sessions"]),
                    pages = siteStatsMap(day["pages"]),
                    devices = siteStatsMap(day["devices"]),
                    languages = siteStatsMap(day["languages"]),
                    referrers = siteStatsMap(day["referrers"])
                )
            }
        } catch (error: Exception) {
            errorText = error.message ?: "Could not load site statistics."
        }
        loading = false
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(t("Public website statistics"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text(
            t("Anonymous visitor counts from nivadesk.app. No cookies or personal data are collected."),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(7, 30, 90).forEach { option ->
                FilterChip(
                    selected = range == option,
                    onClick = { range = option },
                    label = { Text("${option}d") }
                )
            }
        }

        when {
            loading -> CircularProgressIndicator(modifier = Modifier.padding(vertical = 12.dp))
            errorText.isNotEmpty() -> Text(errorText, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            else -> {
                val today = days.lastOrNull()
                val last7 = days.takeLast(7)
                val tiles = listOf(
                    t("Today · page views") to (today?.total ?: 0),
                    t("Today · visitors") to (today?.sessions ?: 0),
                    t("Last 7 days · views") to last7.sumOf { it.total },
                    t("Last 7 days · visitors") to last7.sumOf { it.sessions },
                    "${range}d · " + t("views") to days.sumOf { it.total },
                    "${range}d · " + t("visitors") to days.sumOf { it.sessions }
                )
                tiles.chunked(2).forEach { rowTiles ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        rowTiles.forEach { (label, value) ->
                            Surface(
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(12.dp),
                                tonalElevation = 1.dp
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text("$value", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black)
                                }
                            }
                        }
                    }
                }

                listOf(
                    t("Top pages") to mergeTopEntries(days, { it.pages }),
                    t("Devices") to mergeTopEntries(days, { it.devices }, 3),
                    t("Visitor languages") to mergeTopEntries(days, { it.languages }),
                    t("Traffic sources") to mergeTopEntries(days, { it.referrers }, 10)
                ).forEach { (title, entries) ->
                    Surface(shape = RoundedCornerShape(12.dp), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                            if (entries.isEmpty()) {
                                Text(t("No data yet."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            } else {
                                val max = entries.firstOrNull()?.second ?: 1
                                entries.forEach { (key, value) ->
                                    Column {
                                        Row {
                                            Text(key, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), maxLines = 1)
                                            Text("$value", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                                        }
                                        LinearProgressIndicator(
                                            progress = { if (max > 0) value.toFloat() / max.toFloat() else 0f },
                                            modifier = Modifier.fillMaxWidth().height(5.dp).clip(RoundedCornerShape(99.dp))
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// --- NivaDesk admin: Google Search (Search Console) rankings --------------

private data class ScDay(val date: String, val clicks: Int, val impressions: Int, val ctr: Double, val position: Double)
private data class ScQuery(val query: String, val clicks: Int, val impressions: Int, val ctr: Double, val position: Double, val positionDelta: Double?, val isNew: Boolean)
private data class ScPage(val page: String, val clicks: Int, val impressions: Int, val ctr: Double, val position: Double)
private data class ScCountry(val country: String, val impressions: Int)
private data class ScDevice(val device: String, val impressions: Int)

private fun scDouble(value: Any?): Double = (value as? Number)?.toDouble() ?: 0.0
private fun scDoubleOpt(value: Any?): Double? = (value as? Number)?.toDouble()

private val SC_ALPHA3_TO_2 = mapOf(
    "GBR" to "GB", "USA" to "US", "IRL" to "IE", "DEU" to "DE", "FRA" to "FR", "NLD" to "NL", "ESP" to "ES",
    "ITA" to "IT", "CAN" to "CA", "AUS" to "AU", "IND" to "IN", "TUR" to "TR", "BEL" to "BE", "CHE" to "CH",
    "AUT" to "AT", "SWE" to "SE", "NOR" to "NO", "DNK" to "DK", "FIN" to "FI", "POL" to "PL", "PRT" to "PT",
    "GRC" to "GR", "ROU" to "RO", "CZE" to "CZ", "NZL" to "NZ", "ZAF" to "ZA", "BRA" to "BR", "MEX" to "MX",
    "ARE" to "AE", "SAU" to "SA", "JPN" to "JP", "KOR" to "KR", "CHN" to "CN", "RUS" to "RU", "UKR" to "UA",
    "HUN" to "HU", "BGR" to "BG", "HRV" to "HR", "SRB" to "RS", "SVK" to "SK"
)

private fun scFlagEmoji(alpha2: String): String {
    if (alpha2.length != 2) return "🌍"
    val base = 0x1F1E6
    val sb = StringBuilder()
    for (c in alpha2.uppercase()) sb.appendCodePoint(base + (c.code - 'A'.code))
    return sb.toString()
}

private fun scCountryDisplay(alpha3: String): Pair<String, String> {
    val a2 = SC_ALPHA3_TO_2[alpha3] ?: return "🌍" to alpha3
    val name = java.util.Locale("", a2).displayCountry.ifEmpty { a2 }
    return scFlagEmoji(a2) to name
}

private fun scDeltaPercent(current: Double, previous: Double): Double? =
    if (previous > 0) (current - previous) / previous * 100 else null

private fun scPagePathLabel(url: String): String = try {
    val path = java.net.URI(url).path ?: url
    if (path.isEmpty() || path == "/") "Home page" else path
} catch (e: Exception) { url }

@Composable
private fun ScDeltaText(delta: Double?, invertGood: Boolean) {
    if (delta == null) return
    val good = if (invertGood) delta <= 0 else delta >= 0
    val arrow = if (delta >= 0) "▲" else "▼"
    Text(
        "$arrow ${"%.1f".format(kotlin.math.abs(delta))}%",
        color = if (good) Color(0xFF1D8F43) else Color(0xFFD92D20),
        fontWeight = FontWeight.Bold,
        style = MaterialTheme.typography.labelMedium
    )
}

@Composable
private fun ScPositionDelta(delta: Double?, isNew: Boolean) {
    when {
        isNew -> Text("New", color = Color(0xFF1D8F43), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelSmall)
        delta != null && kotlin.math.abs(delta) >= 0.05 -> {
            val improved = delta > 0
            Text(
                "${if (improved) "▲" else "▼"} ${"%.1f".format(kotlin.math.abs(delta))}",
                color = if (improved) Color(0xFF1D8F43) else Color(0xFFD92D20),
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.labelMedium
            )
        }
        else -> Text("–", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun ScTrendCanvas(days: List<ScDay>) {
    val purple = Color(0xFF8A5CF6)
    val blue = Color(0xFF0A84FF)
    androidx.compose.foundation.Canvas(modifier = Modifier.fillMaxWidth().height(150.dp)) {
        val maxImpr = (days.maxOfOrNull { it.impressions } ?: 1).coerceAtLeast(1).toFloat()
        val pad = 10f
        val w = size.width
        val h = size.height
        fun px(i: Int) = pad + (i.toFloat() / (days.size - 1).coerceAtLeast(1)) * (w - pad * 2)
        fun py(v: Int) = h - pad - (v.toFloat() / maxImpr) * (h - pad * 2)
        for (i in 0 until days.size - 1) {
            drawLine(purple, androidx.compose.ui.geometry.Offset(px(i), py(days[i].impressions)), androidx.compose.ui.geometry.Offset(px(i + 1), py(days[i + 1].impressions)), strokeWidth = 4f)
            drawLine(blue, androidx.compose.ui.geometry.Offset(px(i), py(days[i].clicks)), androidx.compose.ui.geometry.Offset(px(i + 1), py(days[i + 1].clicks)), strokeWidth = 4f)
        }
    }
}

@Composable
private fun ScPositionCanvas(days: List<ScDay>) {
    val orange = Color(0xFFFF9F0A)
    val pts = days.filter { it.position > 0 }
    androidx.compose.foundation.Canvas(modifier = Modifier.fillMaxWidth().height(120.dp)) {
        if (pts.size < 2) return@Canvas
        val maxPos = pts.maxOf { it.position }
        val minPos = pts.minOf { it.position }
        val span = (maxPos - minPos).coerceAtLeast(1.0)
        val pad = 10f
        val w = size.width
        val h = size.height
        fun px(i: Int) = pad + (i.toFloat() / (pts.size - 1).coerceAtLeast(1)) * (w - pad * 2)
        // Higher on screen = better (smaller position number).
        fun py(v: Double) = pad + (((v - minPos) / span).toFloat()) * (h - pad * 2)
        for (i in 0 until pts.size - 1) {
            drawLine(orange, androidx.compose.ui.geometry.Offset(px(i), py(pts[i].position)), androidx.compose.ui.geometry.Offset(px(i + 1), py(pts[i + 1].position)), strokeWidth = 4f)
        }
    }
}

@Composable
private fun SearchConsoleAdminDetail() {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }

    var range by remember { mutableStateOf(28) }
    var loading by remember { mutableStateOf(true) }
    var errorText by remember { mutableStateOf("") }
    var ok by remember { mutableStateOf(false) }
    var needsAccess by remember { mutableStateOf(false) }
    var serviceAccountEmail by remember { mutableStateOf("") }
    var property by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var curTotals by remember { mutableStateOf<Map<String, Double>>(emptyMap()) }
    var prevTotals by remember { mutableStateOf<Map<String, Double>>(emptyMap()) }
    var queries by remember { mutableStateOf<List<ScQuery>>(emptyList()) }
    var byDate by remember { mutableStateOf<List<ScDay>>(emptyList()) }
    var pages by remember { mutableStateOf<List<ScPage>>(emptyList()) }
    var countries by remember { mutableStateOf<List<ScCountry>>(emptyList()) }
    var devices by remember { mutableStateOf<List<ScDevice>>(emptyList()) }

    LaunchedEffect(range) {
        loading = true
        errorText = ""
        try {
            val cal = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("Europe/London"))
            cal.add(java.util.Calendar.DAY_OF_YEAR, -3)
            val fmt = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US)
            fmt.timeZone = java.util.TimeZone.getTimeZone("Europe/London")
            val endStr = fmt.format(cal.time)
            cal.add(java.util.Calendar.DAY_OF_YEAR, -(range - 1))
            val startStr = fmt.format(cal.time)
            val result = com.google.firebase.functions.FirebaseFunctions.getInstance("europe-west2")
                .getHttpsCallable("getSearchConsoleStats")
                .call(mapOf("startDate" to startStr, "endDate" to endStr))
                .await()
            @Suppress("UNCHECKED_CAST")
            val data = result.data as? Map<String, Any?> ?: emptyMap()
            ok = data["ok"] as? Boolean ?: false
            needsAccess = data["needsAccess"] as? Boolean ?: false
            serviceAccountEmail = data["serviceAccountEmail"] as? String ?: ""
            property = data["property"] as? String ?: ""
            message = data["message"] as? String ?: ""
            @Suppress("UNCHECKED_CAST")
            val totals = data["totals"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            curTotals = (totals?.get("current") as? Map<String, Any?>)?.mapValues { scDouble(it.value) } ?: emptyMap()
            @Suppress("UNCHECKED_CAST")
            prevTotals = (totals?.get("previous") as? Map<String, Any?>)?.mapValues { scDouble(it.value) } ?: emptyMap()
            @Suppress("UNCHECKED_CAST")
            byDate = (data["byDate"] as? List<Map<String, Any?>> ?: emptyList()).map {
                ScDay(it["date"] as? String ?: "", scDouble(it["clicks"]).toInt(), scDouble(it["impressions"]).toInt(), scDouble(it["ctr"]), scDouble(it["position"]))
            }
            @Suppress("UNCHECKED_CAST")
            queries = (data["queries"] as? List<Map<String, Any?>> ?: emptyList()).map {
                ScQuery(it["query"] as? String ?: "", scDouble(it["clicks"]).toInt(), scDouble(it["impressions"]).toInt(), scDouble(it["ctr"]), scDouble(it["position"]), scDoubleOpt(it["positionDelta"]), it["isNew"] as? Boolean ?: false)
            }
            @Suppress("UNCHECKED_CAST")
            pages = (data["pages"] as? List<Map<String, Any?>> ?: emptyList()).map {
                ScPage(it["page"] as? String ?: "", scDouble(it["clicks"]).toInt(), scDouble(it["impressions"]).toInt(), scDouble(it["ctr"]), scDouble(it["position"]))
            }
            @Suppress("UNCHECKED_CAST")
            countries = (data["countries"] as? List<Map<String, Any?>> ?: emptyList()).map {
                ScCountry(it["country"] as? String ?: "", scDouble(it["impressions"]).toInt())
            }
            @Suppress("UNCHECKED_CAST")
            devices = (data["devices"] as? List<Map<String, Any?>> ?: emptyList()).map {
                ScDevice(it["device"] as? String ?: "", scDouble(it["impressions"]).toInt())
            }
        } catch (error: Exception) {
            errorText = error.message ?: "Could not load search rankings."
        }
        loading = false
    }

    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(t("Google Search rankings"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text(
            t("What people search to find NivaDesk on Google, where we rank, and how positions changed. Data from Google Search Console (≈3-day lag)."),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(7, 28, 90).forEach { option ->
                FilterChip(selected = range == option, onClick = { range = option }, label = { Text("${option}d") })
            }
        }
        if (property.isNotEmpty()) {
            Text("Property: $property", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        when {
            loading -> CircularProgressIndicator(modifier = Modifier.padding(vertical = 12.dp))
            errorText.isNotEmpty() -> Text(errorText, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            !ok && (needsAccess || message.isNotEmpty()) -> {
                Surface(shape = RoundedCornerShape(12.dp), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(t("Connect Google Search Console"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        if (message.isNotEmpty()) Text(message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("1.  " + t("Enable the Google Search Console API in Google Cloud (project eggcraft-studio)."), style = MaterialTheme.typography.bodySmall)
                        Text("2.  " + t("In Search Console → Settings → Users and permissions, add this service account as a Full user:"), style = MaterialTheme.typography.bodySmall)
                        if (serviceAccountEmail.isNotEmpty()) {
                            Surface(shape = RoundedCornerShape(8.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                                Text(serviceAccountEmail, modifier = Modifier.padding(8.dp), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                            }
                        }
                        Text("3.  " + t("Make sure nivadesk.app is verified, then reload."), style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            ok -> {
                val summary = listOf(
                    Triple(t("Total Clicks"), "${(curTotals["clicks"] ?: 0.0).toInt()}", scDeltaPercent(curTotals["clicks"] ?: 0.0, prevTotals["clicks"] ?: 0.0)) to false,
                    Triple(t("Impressions"), "${(curTotals["impressions"] ?: 0.0).toInt()}", scDeltaPercent(curTotals["impressions"] ?: 0.0, prevTotals["impressions"] ?: 0.0)) to false,
                    Triple(t("Avg. CTR"), "%.1f%%".format((curTotals["ctr"] ?: 0.0) * 100), scDeltaPercent(curTotals["ctr"] ?: 0.0, prevTotals["ctr"] ?: 0.0)) to false,
                    Triple(t("Avg. Position"), "%.1f".format(curTotals["position"] ?: 0.0), scDeltaPercent(curTotals["position"] ?: 0.0, prevTotals["position"] ?: 0.0)) to true
                )
                summary.chunked(2).forEach { rowTiles ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        rowTiles.forEach { (triple, invert) ->
                            val (label, value, delta) = triple
                            Surface(modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp), tonalElevation = 1.dp) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black)
                                        ScDeltaText(delta, invert)
                                    }
                                    Text(t("vs previous period"), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }

                Surface(shape = RoundedCornerShape(12.dp), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(t("Clicks & impressions over time"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        if (byDate.size < 2) {
                            Text(t("Not enough days to chart yet."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        } else {
                            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                                    Box(modifier = Modifier.size(9.dp).clip(RoundedCornerShape(2.dp)).background(Color(0xFF8A5CF6)))
                                    Text(t("Impressions"), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                                    Box(modifier = Modifier.size(9.dp).clip(RoundedCornerShape(2.dp)).background(Color(0xFF0A84FF)))
                                    Text(t("Clicks"), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                            ScTrendCanvas(byDate)
                        }
                    }
                }

                Surface(shape = RoundedCornerShape(12.dp), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(t("Average position over time"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        if (byDate.count { it.position > 0 } < 2) {
                            Text(t("Not enough ranked days to chart yet."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        } else {
                            Text(t("Higher line = better rank (closer to #1)."), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            ScPositionCanvas(byDate)
                        }
                    }
                }

                Surface(shape = RoundedCornerShape(12.dp), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(t("Top search queries"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        if (queries.isEmpty()) {
                            Text(t("No search impressions in this period yet."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        } else {
                            queries.forEachIndexed { index, q ->
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Text("${index + 1}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(q.query, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                        Text("${q.impressions} " + t("impr") + " · ${q.clicks} " + t("clicks") + " · " + "%.1f%%".format(q.ctr * 100), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    Column(horizontalAlignment = Alignment.End) {
                                        Text("%.1f".format(q.position), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Black)
                                        ScPositionDelta(q.positionDelta, q.isNew)
                                    }
                                }
                            }
                        }
                    }
                }

                Surface(shape = RoundedCornerShape(12.dp), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(t("Top pages"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        if (pages.isEmpty()) {
                            Text(t("No data yet."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        } else {
                            pages.forEachIndexed { index, p ->
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Text("${index + 1}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(scPagePathLabel(p.page), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                        Text("${p.impressions} " + t("impr") + " · ${p.clicks} " + t("clicks") + " · " + "%.1f%%".format(p.ctr * 100), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    Text("%.1f".format(p.position), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Black)
                                }
                            }
                        }
                    }
                }

                Surface(shape = RoundedCornerShape(12.dp), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(t("Search by country"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        if (countries.isEmpty()) {
                            Text(t("No data yet."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        } else {
                            val maxC = countries.maxOfOrNull { it.impressions } ?: 1
                            countries.take(8).forEach { c ->
                                val (flag, name) = scCountryDisplay(c.country)
                                Column {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text(flag)
                                        Text(name, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), maxLines = 1)
                                        Text("${c.impressions}", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                                    }
                                    LinearProgressIndicator(
                                        progress = { if (maxC > 0) c.impressions.toFloat() / maxC.toFloat() else 0f },
                                        modifier = Modifier.fillMaxWidth().height(5.dp).clip(RoundedCornerShape(99.dp))
                                    )
                                }
                            }
                        }
                    }
                }

                Surface(shape = RoundedCornerShape(12.dp), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(t("Search by device"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        if (devices.isEmpty()) {
                            Text(t("No data yet."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        } else {
                            val deviceLabels = mapOf("DESKTOP" to t("Desktop"), "MOBILE" to t("Mobile"), "TABLET" to t("Tablet"))
                            val maxD = devices.maxOfOrNull { it.impressions } ?: 1
                            devices.forEach { d ->
                                Column {
                                    Row {
                                        Text(deviceLabels[d.device] ?: d.device, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), maxLines = 1)
                                        Text("${d.impressions}", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                                    }
                                    LinearProgressIndicator(
                                        progress = { if (maxD > 0) d.impressions.toFloat() / maxD.toFloat() else 0f },
                                        modifier = Modifier.fillMaxWidth().height(5.dp).clip(RoundedCornerShape(99.dp))
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// --- NivaDesk admin: cross-workspace Admin Insights -----------------------

@Suppress("UNCHECKED_CAST")
private fun insightsMap(value: Any?): Map<String, Any?> = value as? Map<String, Any?> ?: emptyMap()

@Suppress("UNCHECKED_CAST")
private fun insightsList(value: Any?): List<Map<String, Any?>> = value as? List<Map<String, Any?>> ?: emptyList()

private fun insightsInt(root: Map<String, Any?>, vararg path: String): Int {
    var node: Any? = root
    for (key in path) node = insightsMap(node)[key]
    return siteStatsInt(node)
}

@Composable
private fun AdminInsightsDetail() {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }

    var loading by remember { mutableStateOf(true) }
    var errorText by remember { mutableStateOf("") }
    var data by remember { mutableStateOf<Map<String, Any?>>(emptyMap()) }

    LaunchedEffect(Unit) {
        try {
            val result = com.google.firebase.functions.FirebaseFunctions.getInstance("europe-west2")
                .getHttpsCallable("getAdminInsights")
                .call(emptyMap<String, Any>())
                .await()
            @Suppress("UNCHECKED_CAST")
            data = result.data as? Map<String, Any?> ?: emptyMap()
        } catch (error: Exception) {
            errorText = error.message ?: "Could not load admin insights."
        }
        loading = false
    }

    val planLabels = mapOf("demo" to "Free", "lifetime_lite" to "Lite", "pro_monthly" to "Pro", "team_monthly" to "Team")
    val planColors = mapOf(
        "demo" to Color(0xFF8A5CF6),
        "lifetime_lite" to Color(0xFF0A84FF),
        "pro_monthly" to Color(0xFF30D158),
        "team_monthly" to Color(0xFFFF9F0A)
    )

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(t("Admin Insights"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text(
            t("Live overview across all NivaDesk users and workspaces."),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        when {
            loading -> CircularProgressIndicator(modifier = Modifier.padding(vertical = 12.dp))
            errorText.isNotEmpty() -> Text(errorText, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            else -> {
                val tiles = listOf(
                    Triple(t("Total Users"), insightsInt(data, "users", "total"), "+${insightsInt(data, "users", "new30d")} · 30d"),
                    Triple(t("Workspaces"), insightsInt(data, "workspaces", "total"), "+${insightsInt(data, "workspaces", "new30d")} · 30d"),
                    Triple(t("Active Workspaces"), insightsInt(data, "workspaces", "active30d"), t("order in last 30 days")),
                    Triple(t("Paid Subscriptions"), insightsInt(data, "workspaces", "paid"), ""),
                    Triple(t("Est. MRR"), insightsInt(data, "revenue", "mrr"), t("estimate — billing not live")),
                    Triple(t("On Site Now"), insightsInt(data, "site", "liveVisitors"), "${insightsInt(data, "site", "today", "sessions")} " + t("visitors today")),
                    Triple(t("In App Now"), insightsInt(data, "site", "appNow"), t("live app users"))
                )
                tiles.chunked(2).forEach { rowTiles ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        rowTiles.forEach { (label, value, hint) ->
                            Surface(modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp), tonalElevation = 1.dp) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(
                                        if (label == t("Est. MRR")) "£$value" else "$value",
                                        style = MaterialTheme.typography.titleLarge,
                                        fontWeight = FontWeight.Black
                                    )
                                    if (hint.isNotEmpty()) {
                                        Text(hint, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                            }
                        }
                    }
                }

                val sectionsUi: List<Pair<String, List<Triple<String, String, Color?>>>> = listOf(
                    t("Plan Distribution") to insightsMap(insightsMap(data["workspaces"])["planCounts"]).entries
                        .filter { siteStatsInt(it.value) > 0 }
                        .map { Triple(planLabels[it.key] ?: it.key, siteStatsInt(it.value).toString(), planColors[it.key]) },
                    t("Feature Usage") to listOf(
                        Triple(t("Orders (total)"), insightsInt(data, "usage", "ordersTotal").toString(), null),
                        Triple(t("Orders this month"), insightsInt(data, "usage", "ordersThisMonth").toString(), null),
                        Triple(t("Customers"), insightsInt(data, "usage", "customersTotal").toString(), null),
                        Triple(t("Notes"), insightsInt(data, "usage", "notesTotal").toString(), null),
                        Triple(t("Notes with reminders"), insightsInt(data, "usage", "remindersTotal").toString(), null),
                        Triple(t("Messages"), insightsInt(data, "usage", "messagesTotal").toString(), null),
                        Triple(t("Workspace tickets"), insightsInt(data, "usage", "workspaceTicketsTotal").toString(), null)
                    ),
                    t("ChatGPT App Usage") to listOf(
                        Triple(t("Connected workspaces"), insightsInt(data, "chatgpt", "connectedWorkspaces").toString(), null),
                        Triple(t("Active OAuth tokens"), insightsInt(data, "chatgpt", "activeTokens").toString(), null),
                        Triple(t("Tokens issued (30d)"), insightsInt(data, "chatgpt", "tokens30d").toString(), null)
                    ),
                    t("Support Tickets") to listOf(
                        Triple(t("Open"), insightsInt(data, "support", "open").toString(), Color(0xFFFF9F0A)),
                        Triple(t("In progress"), insightsInt(data, "support", "inProgress").toString(), Color(0xFF0A84FF)),
                        Triple(t("All time"), insightsInt(data, "support", "total").toString(), null)
                    ),
                    t("Newest Workspaces") to insightsList(insightsMap(data["workspaces"])["newest"]).map { workspace ->
                        val plan = workspace["plan"] as? String ?: "demo"
                        Triple(workspace["name"] as? String ?: "?", planLabels[plan] ?: plan, planColors[plan])
                    },
                    t("Workspaces Requiring Attention") to insightsList(insightsMap(data["attention"])["inactivePaidWorkspaces"]).map { workspace ->
                        Triple(workspace["name"] as? String ?: "?", t("no orders in 30 days"), Color(0xFFFF9F0A))
                    }
                )

                sectionsUi.forEach { (title, rows) ->
                    Surface(shape = RoundedCornerShape(12.dp), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                            if (rows.isEmpty()) {
                                Text(
                                    if (title == t("Workspaces Requiring Attention")) t("All paid workspaces created an order in the last 30 days.") + " ✓" else t("No data yet."),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = if (title == t("Workspaces Requiring Attention")) Color(0xFF30D158) else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            } else {
                                rows.forEach { (label, value, dot) ->
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        if (dot != null) {
                                            Surface(color = dot, shape = RoundedCornerShape(50), modifier = Modifier.size(8.dp)) {}
                                        }
                                        Text(label, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), maxLines = 1)
                                        Text(value, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// --- NivaDesk admin: top-level Insights hub with left sidebar ---------------

private val aiHubPlanLabels = mapOf("demo" to "Free", "lifetime_lite" to "Lite", "pro_monthly" to "Pro", "team_monthly" to "Team")
private val aiHubPlanColors = mapOf(
    "demo" to Color(0xFF8A5CF6),
    "lifetime_lite" to Color(0xFF0A84FF),
    "pro_monthly" to Color(0xFF30D158),
    "team_monthly" to Color(0xFFFF9F0A)
)

private fun aiHubDate(ms: Int): String {
    if (ms <= 0) return "—"
    return java.text.SimpleDateFormat("d MMM yyyy", java.util.Locale.UK).format(java.util.Date(ms.toLong()))
}

private fun aiHubBytes(bytes: Int): String {
    val value = bytes.toDouble()
    return when {
        value >= 1073741824 -> String.format(java.util.Locale.UK, "%.2f GB", value / 1073741824)
        value >= 1048576 -> String.format(java.util.Locale.UK, "%.1f MB", value / 1048576)
        value >= 1024 -> "${(value / 1024).toInt()} KB"
        else -> "$bytes B"
    }
}

@Composable
private fun AIHubCard(title: String, content: @Composable () -> Unit) {
    Surface(shape = RoundedCornerShape(12.dp), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            content()
        }
    }
}

@Composable
private fun AIHubRow(label: String, value: String, dot: Color? = null) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (dot != null) {
            Surface(color = dot, shape = RoundedCornerShape(50), modifier = Modifier.size(8.dp)) {}
        }
        Text(label, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), maxLines = 1)
        Text(value, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
    }
}

// Two-line person row: name on top, email beneath, plan + date trailing.
@Composable
private fun AIHubUserRow(name: String, email: String, planLabel: String, planColor: Color?, date: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 3.dp)) {
        Surface(color = planColor ?: MaterialTheme.colorScheme.primary, shape = RoundedCornerShape(50), modifier = Modifier.size(8.dp)) {}
        Column(modifier = Modifier.weight(1f)) {
            Text(if (name.isBlank()) email.ifBlank { "—" } else name, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, maxLines = 1)
            if (name.isNotBlank() && email.isNotBlank()) {
                Text(email, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            }
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(planLabel, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Black, color = planColor ?: MaterialTheme.colorScheme.onSurfaceVariant)
            Text(date, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun AIHubTiles(tiles: List<Triple<String, String, String>>) {
    tiles.chunked(2).forEach { rowTiles ->
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            rowTiles.forEach { (label, value, hint) ->
                Surface(modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp), tonalElevation = 1.dp) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black)
                        if (hint.isNotEmpty()) {
                            Text(hint, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
            if (rowTiles.size == 1) Spacer(modifier = Modifier.weight(1f))
        }
        Spacer(modifier = Modifier.height(8.dp))
    }
}

@Composable
private fun AIHubLoader(functionName: String, content: @Composable (Map<String, Any?>) -> Unit) {
    var loading by remember(functionName) { mutableStateOf(true) }
    var errorText by remember(functionName) { mutableStateOf("") }
    var data by remember(functionName) { mutableStateOf<Map<String, Any?>>(emptyMap()) }

    LaunchedEffect(functionName) {
        try {
            val result = com.google.firebase.functions.FirebaseFunctions.getInstance("europe-west2")
                .getHttpsCallable(functionName)
                .call(emptyMap<String, Any>())
                .await()
            @Suppress("UNCHECKED_CAST")
            data = result.data as? Map<String, Any?> ?: emptyMap()
        } catch (error: Exception) {
            errorText = error.message ?: "Could not load."
        }
        loading = false
    }

    when {
        loading -> CircularProgressIndicator(modifier = Modifier.padding(vertical = 16.dp))
        errorText.isNotEmpty() -> Text(errorText, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        else -> content(data)
    }
}

@Composable
fun AdminInsightsHubScreen() {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val pages = listOf("Overview", "Users & Workspaces", "Subscriptions", "Revenue", "Plans", "Feature Usage", "Storage", "User Lookup", "Global Statistics", "Google Search")
    var selection by remember { mutableStateOf("Overview") }

    Column(modifier = Modifier.fillMaxSize()) {
        androidx.compose.foundation.lazy.LazyRow(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp)
        ) {
            items(pages.size) { index ->
                val item = pages[index]
                FilterChip(selected = selection == item, onClick = { selection = item }, label = { Text(t(item)) })
            }
        }
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 4.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            when (selection) {
                "Users & Workspaces" -> AIHubUsersPage(t)
                "Subscriptions" -> AIHubSubscriptionsPage(t)
                "Revenue" -> AIHubRevenuePage(t)
                "Plans" -> AIHubPlansPage(t)
                "Feature Usage" -> AIHubFeaturesPage(t)
                "Storage" -> AIHubStoragePage(t)
                "User Lookup" -> AIHubLookupPage(t)
                "Global Statistics" -> SiteStatsAdminDetail()
                "Google Search" -> SearchConsoleAdminDetail()
                else -> AdminInsightsDetail()
            }
            Spacer(modifier = Modifier.height(20.dp))
        }
    }
}

@Composable
private fun AIHubUsersPage(t: (String) -> String) {
    var recentSort by remember { mutableStateOf("date") }
    var recentPage by remember { mutableStateOf(0) }
    Column(modifier = Modifier.padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(t("Users & Workspaces"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        AIHubLoader("getAdminUsersWorkspacesDetail") { data ->
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                AIHubTiles(listOf(
                    Triple(t("Total Users"), insightsInt(data, "users", "total").toString(), "+${insightsInt(data, "users", "new30d")} · 30d"),
                    Triple(t("Active Users (30d)"), insightsInt(data, "users", "active30d").toString(), ""),
                    Triple(t("Active Workspaces"), insightsInt(data, "workspaces", "active30d").toString(), ""),
                    Triple(t("Inactive Workspaces"), insightsInt(data, "workspaces", "inactive").toString(), "")
                ))
                AIHubCard(t("Quick Stats")) {
                    AIHubRow(t("Users in multiple workspaces"), insightsInt(data, "quick", "usersWithMultipleWorkspaces").toString())
                    AIHubRow(t("New users this week"), insightsInt(data, "users", "new7d").toString())
                    AIHubRow(t("Never logged in"), insightsInt(data, "users", "neverLoggedIn").toString())
                }
                AIHubCard(t("Top Workspaces by Activity")) {
                    insightsList(insightsMap(data)["topWorkspaces"]).forEach { workspace ->
                        val plan = workspace["plan"] as? String ?: "demo"
                        AIHubRow(
                            (workspace["name"] as? String ?: "?") + " · " + (aiHubPlanLabels[plan] ?: plan),
                            "${insightsInt(workspace, "orders30d")} " + t("orders"),
                            aiHubPlanColors[plan]
                        )
                    }
                }

                AIHubCard(t("Recent Signups")) {
                    val all = insightsList(insightsMap(data)["recentUsers"])
                    if (all.isEmpty()) {
                        Text(t("No data yet."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        val sorted = if (recentSort == "name") {
                            all.sortedBy { ((it["displayName"] as? String ?: "").ifBlank { it["email"] as? String ?: "" }).lowercase() }
                        } else {
                            all.sortedByDescending { insightsInt(it, "createdAtMs") }
                        }
                        val pageSize = 20
                        val pageCount = maxOf(1, (sorted.size + pageSize - 1) / pageSize)
                        val page = recentPage.coerceIn(0, pageCount - 1)
                        val slice = sorted.drop(page * pageSize).take(pageSize)

                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            listOf("date" to t("Newest"), "name" to t("Name A–Z")).forEach { (mode, label) ->
                                val selected = recentSort == mode
                                Surface(
                                    color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                                    shape = RoundedCornerShape(8.dp),
                                    modifier = Modifier.clickable { recentSort = mode; recentPage = 0 }
                                ) {
                                    Text(
                                        label,
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.padding(horizontal = 11.dp, vertical = 5.dp)
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.weight(1f))
                            Text("${sorted.size} " + t("users"), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }

                        slice.forEach { user ->
                            val plan = (user["plan"] as? String ?: "demo").ifBlank { "demo" }
                            AIHubUserRow(
                                name = user["displayName"] as? String ?: "",
                                email = user["email"] as? String ?: "",
                                planLabel = aiHubPlanLabels[plan] ?: plan,
                                planColor = aiHubPlanColors[plan],
                                date = aiHubDate(insightsInt(user, "createdAtMs"))
                            )
                        }

                        if (pageCount > 1) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxWidth()) {
                                Spacer(modifier = Modifier.weight(1f))
                                Text(
                                    "‹",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Black,
                                    color = if (page > 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                                    modifier = Modifier.clickable(enabled = page > 0) { recentPage = page - 1 }.padding(horizontal = 6.dp)
                                )
                                Text(t("Page") + " ${page + 1} / $pageCount", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(
                                    "›",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Black,
                                    color = if (page < pageCount - 1) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                                    modifier = Modifier.clickable(enabled = page < pageCount - 1) { recentPage = page + 1 }.padding(horizontal = 6.dp)
                                )
                                Spacer(modifier = Modifier.weight(1f))
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AIHubSubscriptionsPage(t: (String) -> String) {
    Column(modifier = Modifier.padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(t("Subscriptions"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        AIHubLoader("getAdminSubscriptionsDetail") { data ->
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                AIHubTiles(listOf(
                    Triple(t("Active Subscriptions"), insightsInt(data, "subscriptions", "paidTotal").toString(), ""),
                    Triple(t("New Subscriptions (30d)"), insightsInt(data, "subscriptions", "paidNew30d").toString(), ""),
                    Triple(t("Free Plan Workspaces"), insightsInt(data, "subscriptions", "freeDemo").toString(), "")
                ))
                AIHubCard(t("Recent Subscriptions")) {
                    insightsList(insightsMap(data)["recent"]).forEach { item ->
                        val plan = item["plan"] as? String ?: "demo"
                        AIHubRow(
                            (item["name"] as? String ?: "?") + " · " + (aiHubPlanLabels[plan] ?: plan),
                            "£${insightsInt(item, "monthlyGbp")}/mo · " + aiHubDate(insightsInt(item, "createdAtMs")),
                            aiHubPlanColors[plan]
                        )
                    }
                }
                AIHubCard(t("Plan Source Distribution")) {
                    insightsList(insightsMap(data)["sources"]).forEach { item ->
                        AIHubRow(item["source"] as? String ?: "?", insightsInt(item, "count").toString())
                    }
                }
            }
        }
    }
}

@Composable
private fun AIHubRevenuePage(t: (String) -> String) {
    Column(modifier = Modifier.padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(t("Revenue"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        AIHubLoader("getAdminRevenueDetail") { data ->
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                AIHubTiles(listOf(
                    Triple(t("Est. MRR"), "£${insightsInt(data, "revenue", "mrr")}", t("estimate — billing not live")),
                    Triple(t("Est. ARR"), "£${insightsInt(data, "revenue", "arr")}", ""),
                    Triple(t("Paid Workspaces"), insightsInt(data, "revenue", "paidTotal").toString(), ""),
                    Triple(t("Extra Seats"), insightsInt(data, "revenue", "seatCount").toString(), "£${insightsInt(data, "revenue", "seatsMrr")}/mo")
                ))
                AIHubCard(t("Extra Seat Buyers")) {
                    val seatBuyers = insightsList(insightsMap(data["addons"])["seatWorkspaces"])
                    if (seatBuyers.isEmpty()) {
                        Text(t("No workspace has purchased extra seats yet."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        seatBuyers.forEach { item ->
                            AIHubRow(
                                item["name"] as? String ?: "?",
                                "${insightsInt(item, "seats")} " + t("seats") + " · £${insightsInt(item, "monthlyGbp")}/mo",
                                Color(0xFFFF9F0A)
                            )
                        }
                    }
                }
                AIHubCard(t("Storage Add-on Buyers")) {
                    val storageBuyers = insightsList(insightsMap(data["addons"])["storageWorkspaces"])
                    if (storageBuyers.isEmpty()) {
                        Text(t("No workspace has purchased a storage add-on yet."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        storageBuyers.forEach { item ->
                            val gb = insightsInt(item, "addonGB")
                            AIHubRow(
                                item["name"] as? String ?: "?",
                                "+$gb GB · £${insightsInt(item, "monthlyGbp")}/mo",
                                if (gb >= 200) Color(0xFF8A5CF6) else Color(0xFF0A84FF)
                            )
                        }
                    }
                }
                AIHubCard(t("Top Paying Workspaces (Est.)")) {
                    insightsList(insightsMap(data)["topPaying"]).forEach { item ->
                        val plan = item["plan"] as? String ?: "demo"
                        AIHubRow(
                            (item["name"] as? String ?: "?") + " · " + (aiHubPlanLabels[plan] ?: plan),
                            "£${insightsInt(item, "totalGbp")}/mo",
                            aiHubPlanColors[plan]
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AIHubPlansPage(t: (String) -> String) {
    Column(modifier = Modifier.padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(t("Plans"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        AIHubLoader("getAdminPlansDetail") { data ->
            val stats = insightsMap(insightsMap(data)["stats"])
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                AIHubCard(t("Plan Distribution")) {
                    listOf("demo", "lifetime_lite", "pro_monthly", "team_monthly").forEach { plan ->
                        val bucket = insightsMap(stats[plan])
                        AIHubRow(
                            aiHubPlanLabels[plan] ?: plan,
                            "${insightsInt(bucket, "workspaces")} · ${insightsInt(bucket, "active30d")} " + t("active"),
                            aiHubPlanColors[plan]
                        )
                    }
                }
                AIHubCard(t("Plan Comparison")) {
                    insightsList(insightsMap(data)["comparison"]).forEach { plan ->
                        AIHubRow(
                            plan["label"] as? String ?: "?",
                            "${plan["storage"] as? String ?: "?"} · £${insightsInt(plan, "monthly")}/mo",
                            aiHubPlanColors[plan["plan"] as? String ?: ""]
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AIHubFeaturesPage(t: (String) -> String) {
    Column(modifier = Modifier.padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(t("Feature Usage"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        AIHubLoader("getAdminFeatureUsageDetail") { data ->
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                AIHubCard(t("Feature Usage (30d)")) {
                    insightsList(insightsMap(data)["features"]).forEach { feature ->
                        AIHubRow(
                            feature["label"] as? String ?: "?",
                            "${insightsInt(feature, "count30d")} · ${insightsInt(feature, "activeWorkspaces")} ws"
                        )
                    }
                }
                AIHubCard(t("Feature Adoption Funnel")) {
                    AIHubRow(t("Workspaces"), insightsInt(data, "funnel", "workspaces").toString())
                    AIHubRow(t("Added a customer"), insightsInt(data, "funnel", "withCustomer").toString())
                    AIHubRow(t("Created an order"), insightsInt(data, "funnel", "withOrder").toString())
                    AIHubRow(t("Connected ChatGPT App"), insightsInt(data, "funnel", "chatgptConnected").toString())
                }
            }
        }
    }
}

@Composable
private fun AIHubStoragePage(t: (String) -> String) {
    Column(modifier = Modifier.padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(t("Storage"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        AIHubLoader("getAdminStorageDetail") { data ->
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                AIHubTiles(listOf(
                    Triple(t("Total Used"), aiHubBytes(insightsInt(data, "totals", "totalBytes")), ""),
                    Triple(t("Total Files"), insightsInt(data, "totals", "fileCount").toString(), ""),
                    Triple(t("Uploaded (30d)"), aiHubBytes(insightsInt(data, "totals", "uploaded30dBytes")), ""),
                    Triple(t("Near Limit (≥80%)"), insightsInt(data, "totals", "nearLimitCount").toString(), "")
                ))
                AIHubCard(t("Top Workspaces by Storage")) {
                    insightsList(insightsMap(data)["topWorkspaces"]).forEach { workspace ->
                        val plan = workspace["plan"] as? String ?: "demo"
                        AIHubRow(
                            workspace["name"] as? String ?: "?",
                            aiHubBytes(insightsInt(workspace, "bytes")),
                            aiHubPlanColors[plan]
                        )
                    }
                }
                AIHubCard(t("Recent Uploads")) {
                    insightsList(insightsMap(data)["recentUploads"]).forEach { file ->
                        AIHubRow(
                            file["fileName"] as? String ?: "?",
                            aiHubBytes(insightsInt(file, "sizeBytes")) + " · " + aiHubDate(insightsInt(file, "uploadedAtMs"))
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AIHubLookupPage(t: (String) -> String) {
    var query by remember { mutableStateOf("") }
    var searching by remember { mutableStateOf(false) }
    var errorText by remember { mutableStateOf("") }
    var users by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var workspaces by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var detail by remember { mutableStateOf<Map<String, Any?>?>(null) }
    var detailKind by remember { mutableStateOf<String?>(null) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()

    fun call(payload: Map<String, Any>, onDone: (Map<String, Any?>) -> Unit) {
        scope.launch {
            try {
                val result = com.google.firebase.functions.FirebaseFunctions.getInstance("europe-west2")
                    .getHttpsCallable("getAdminLookup")
                    .call(payload)
                    .await()
                @Suppress("UNCHECKED_CAST")
                onDone(result.data as? Map<String, Any?> ?: emptyMap())
            } catch (error: Exception) {
                errorText = error.message ?: "Failed."
            }
            searching = false
        }
    }

    Column(modifier = Modifier.padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(t("User Lookup"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text(t("Email, name or workspace...")) },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
            Button(onClick = {
                if (query.trim().length >= 2) {
                    searching = true
                    errorText = ""
                    detail = null
                    detailKind = null
                    call(mapOf("mode" to "search", "query" to query.trim())) { data ->
                        @Suppress("UNCHECKED_CAST")
                        users = data["users"] as? List<Map<String, Any?>> ?: emptyList()
                        @Suppress("UNCHECKED_CAST")
                        workspaces = data["workspaces"] as? List<Map<String, Any?>> ?: emptyList()
                    }
                }
            }, enabled = !searching) { Text(t("Search")) }
        }
        if (errorText.isNotEmpty()) Text(errorText, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)

        if (detailKind == null) {
            if (users.isNotEmpty()) AIHubCard(t("Users")) {
                users.forEach { user ->
                    TextButton(onClick = {
                        detailKind = "user"
                        call(mapOf("mode" to "user", "uid" to (user["uid"] as? String ?: ""))) { detail = it }
                    }) { Text(user["email"] as? String ?: "?", maxLines = 1) }
                }
            }
            if (workspaces.isNotEmpty()) AIHubCard(t("Workspaces")) {
                workspaces.forEach { workspace ->
                    TextButton(onClick = {
                        detailKind = "workspace"
                        call(mapOf("mode" to "workspace", "companyId" to (workspace["id"] as? String ?: ""))) { detail = it }
                    }) { Text((workspace["name"] as? String ?: "?") + " · " + (aiHubPlanLabels[workspace["plan"] as? String ?: ""] ?: ""), maxLines = 1) }
                }
            }
        } else {
            TextButton(onClick = { detailKind = null; detail = null }) { Text("← " + t("Results")) }
            val current = detail
            if (current == null) {
                CircularProgressIndicator(modifier = Modifier.padding(8.dp))
            } else if (detailKind == "user") {
                val user = insightsMap(current["user"])
                AIHubCard(t("User Statistics")) {
                    AIHubRow(t("Email"), user["email"] as? String ?: "—")
                    AIHubRow(t("Signed up"), aiHubDate(insightsInt(user, "createdAtMs")))
                    AIHubRow(t("Last sign-in"), aiHubDate(insightsInt(user, "lastSignInMs")))
                    AIHubRow(t("Support tickets"), insightsInt(user, "ticketsCreated").toString())
                }
                AIHubCard(t("Workspaces")) {
                    insightsList(current["memberships"]).forEach { membership ->
                        val plan = membership["plan"] as? String ?: "demo"
                        AIHubRow((membership["name"] as? String ?: "?") + " · " + (membership["role"] as? String ?: ""), aiHubPlanLabels[plan] ?: plan, aiHubPlanColors[plan])
                    }
                }
            } else {
                val workspace = insightsMap(current["workspace"])
                AIHubCard(t("Workspace Statistics")) {
                    AIHubRow(t("Workspace"), workspace["name"] as? String ?: "—")
                    AIHubRow(t("Owner"), workspace["ownerEmail"] as? String ?: "—")
                    AIHubRow(t("Plan"), aiHubPlanLabels[workspace["plan"] as? String ?: ""] ?: "—")
                    AIHubRow(t("Members"), insightsInt(workspace, "members").toString())
                    AIHubRow(t("Orders (total)"), insightsInt(workspace, "ordersTotal").toString())
                    AIHubRow(t("Orders (30d)"), insightsInt(workspace, "orders30d").toString())
                    AIHubRow(t("Customers"), insightsInt(workspace, "customersTotal").toString())
                    AIHubRow(t("Storage"), aiHubBytes(insightsInt(workspace, "storageBytes")) + " / ${insightsInt(workspace, "storageLimitMB")} MB")
                }
            }
        }
    }
}


// In-app account deletion (App Store / Play policy compliance).
@Composable
private fun DeleteAccountCard(onSignOut: () -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var confirmText by remember { mutableStateOf("") }
    var deleting by remember { mutableStateOf(false) }
    var errorText by remember { mutableStateOf("") }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val canDelete = confirmText.trim().uppercase() == "DELETE"

    Surface(
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.25f),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.4f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(t("Delete account"), fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error)
            // Two different losses, two separate lines — "your workspace dies"
            // and "you leave other people's workspaces" were one gray sentence.
            Text(
                t("This deletes your account permanently. It cannot be undone."),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.error
            )
            Text(
                "\u2022 " + t("The workspace you own is deleted with all of its data: orders, customers, notes, messages and files."),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                "\u2022 " + t("Your memberships in other teams' workspaces are removed. Their data stays with them."),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            OutlinedTextField(
                value = confirmText,
                onValueChange = { confirmText = it },
                label = { Text(t("Type DELETE to confirm")) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            if (errorText.isNotBlank()) {
                Text(errorText, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            Button(
                onClick = {
                    deleting = true
                    errorText = ""
                    scope.launch {
                        try {
                            com.google.firebase.functions.FirebaseFunctions.getInstance("europe-west2")
                                .getHttpsCallable("deleteMyAccount")
                                .call(mapOf("confirmation" to "DELETE"))
                                .await()
                            onSignOut()
                        } catch (error: Exception) {
                            errorText = error.message ?: "Could not delete the account."
                            deleting = false
                        }
                    }
                },
                enabled = canDelete && !deleting,
                colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                modifier = Modifier.fillMaxWidth().height(46.dp),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text(if (deleting) t("Deleting...") else t("Delete my account"), fontWeight = FontWeight.Bold)
            }
        }
    }
}
