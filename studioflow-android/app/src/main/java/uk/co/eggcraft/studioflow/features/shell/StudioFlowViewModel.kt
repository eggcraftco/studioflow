package uk.co.eggcraft.studioflow.features.shell

import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.SharedPreferences
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import uk.co.eggcraft.studioflow.billing.StudioGooglePlanOffer
import uk.co.eggcraft.studioflow.billing.StudioGoogleStorageOffer
import uk.co.eggcraft.studioflow.billing.StudioGooglePlayBillingManager
import com.google.firebase.auth.FirebaseUser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uk.co.eggcraft.studioflow.data.firebase.StudioFlowRepository
import uk.co.eggcraft.studioflow.data.model.StudioActivityNotification
import uk.co.eggcraft.studioflow.data.model.StudioKeepCollaborationInvite
import uk.co.eggcraft.studioflow.data.model.StudioKeepNote
import uk.co.eggcraft.studioflow.services.StudioMessageRouteHolder
import uk.co.eggcraft.studioflow.data.model.StudioBillingPlan
import uk.co.eggcraft.studioflow.data.model.StudioCustomRole
import uk.co.eggcraft.studioflow.data.model.StudioJoinRequest
import kotlinx.coroutines.delay
import uk.co.eggcraft.studioflow.data.model.StudioMessageItem
import uk.co.eggcraft.studioflow.data.model.StudioMessageTeamMember
import uk.co.eggcraft.studioflow.data.model.StudioMessageThread
import uk.co.eggcraft.studioflow.data.model.StudioMessageTypingUser
import uk.co.eggcraft.studioflow.data.model.StudioMessageWorkspaceSettings
import uk.co.eggcraft.studioflow.data.model.StudioCustomer
import uk.co.eggcraft.studioflow.data.model.StudioCustomerPrefsPatch
import uk.co.eggcraft.studioflow.data.model.StudioOrder
import uk.co.eggcraft.studioflow.data.model.StudioTeamMember
import uk.co.eggcraft.studioflow.data.model.StudioWorkspace
import uk.co.eggcraft.studioflow.data.model.StudioWorkspaceOption
import uk.co.eggcraft.studioflow.data.model.StudioWorkspaceSettings
import uk.co.eggcraft.studioflow.data.model.WorkspaceMemberAccess
import uk.co.eggcraft.studioflow.widgets.WidgetSummaryBridge

sealed class PendingActivityNavigation {
    object Messages : PendingActivityNavigation()
    object Orders : PendingActivityNavigation()
    data class Support(val ticketId: String, val ticketType: String) : PendingActivityNavigation()
}

/** One tick of the bank feed listeners (combine needs a single carrier type). */
private data class BankFeedBundle(
    val transactions: List<uk.co.eggcraft.studioflow.data.model.StudioBankTransaction>,
    val connections: List<uk.co.eggcraft.studioflow.data.model.StudioBankConnection>,
    val rules: List<uk.co.eggcraft.studioflow.data.model.StudioBankRule>,
    val waiting: List<uk.co.eggcraft.studioflow.data.model.StudioBankWaitingReceipt>,
    val categoryTax: Map<String, String>,
    val vendors: List<uk.co.eggcraft.studioflow.data.model.StudioBankVendor> = emptyList(),
    val customCategories: List<uk.co.eggcraft.studioflow.data.model.StudioBankCategory> = emptyList()
)

data class StudioFlowUiState(
    val loading: Boolean = true,
    val signingIn: Boolean = false,
    // One-time post-signup "verify your email" confirmation.
    val showPostSignupVerifyNotice: Boolean = false,
    val creatingOrder: Boolean = false,
    val settingsSaving: Boolean = false,
    val user: FirebaseUser? = null,
    val workspace: StudioWorkspace? = null,
    val availableWorkspaces: List<StudioWorkspaceOption> = emptyList(),
    val workspaceSettings: StudioWorkspaceSettings = StudioWorkspaceSettings(),
    val orders: List<StudioOrder> = emptyList(),
    val deletedOrders: List<StudioOrder> = emptyList(),
    val customers: List<StudioCustomer> = emptyList(),
    val teamMembers: List<StudioTeamMember> = emptyList(),
    val joinRequests: List<StudioJoinRequest> = emptyList(),
    val customRoles: List<StudioCustomRole> = emptyList(),
    val messageThreads: List<StudioMessageThread> = emptyList(),
    val messageTeamMembers: List<StudioMessageTeamMember> = emptyList(),
    val selectedMessageThreadId: String = "",
    val messageItemsByThreadId: Map<String, List<StudioMessageItem>> = emptyMap(),
    val messageUnreadCount: Int = 0,
    val isSendingMessage: Boolean = false,
    val replyingToMessage: StudioMessageItem? = null,
    val typingUsersByThreadId: Map<String, List<StudioMessageTypingUser>> = emptyMap(),
    val messageSearchQuery: String = "",
    val messageAttachmentFilter: String = "all",
    val archivedThreadMarkers: Map<String, Long> = emptyMap(),
    val savedMessageIdsByThreadId: Map<String, Set<String>> = emptyMap(),
    val forwardingMessage: StudioMessageItem? = null,
    val messageWorkspaceSettings: StudioMessageWorkspaceSettings = StudioMessageWorkspaceSettings(),
    val isSavingMessageWorkspaceSettings: Boolean = false,
    val messageWorkspaceSettingsStatus: String = "",
    val messageError: String = "",
    val activityNotifications: List<StudioActivityNotification> = emptyList(),
    val activityNotificationUnreadCount: Int = 0,
    val activityNotificationSearch: String = "",
    val activityNotificationReadFilter: String = "all",
    val activityNotificationTypeFilter: String = "all",
    val dismissedActivityNotificationIds: Set<String> = emptySet(),
    val pendingActivityNavigation: PendingActivityNavigation? = null,
    val keepNotes: List<StudioKeepNote> = emptyList(),
    val bankTransactions: List<uk.co.eggcraft.studioflow.data.model.StudioBankTransaction> = emptyList(),
    val bankConnections: List<uk.co.eggcraft.studioflow.data.model.StudioBankConnection> = emptyList(),
    val bankRules: List<uk.co.eggcraft.studioflow.data.model.StudioBankRule> = emptyList(),
    val bankWaitingReceipts: List<uk.co.eggcraft.studioflow.data.model.StudioBankWaitingReceipt> = emptyList(),
    val bankVendors: List<uk.co.eggcraft.studioflow.data.model.StudioBankVendor> = emptyList(),
    val bankCustomCategories: List<uk.co.eggcraft.studioflow.data.model.StudioBankCategory> = emptyList(),
    val bankCategoryTax: Map<String, String> = uk.co.eggcraft.studioflow.data.model.BANK_DEFAULT_CATEGORY_TAX,
    val keepNotesSearch: String = "",
    val keepNotesSection: String = "notes",
    val keepCollaborationInvites: List<StudioKeepCollaborationInvite> = emptyList(),
    val errorMessage: String = "",
    val settingsMessage: String = "",
    val pendingBackupImport: PendingBackupImport? = null
)

// A picked backup file is previewed before anything is written; the raw text
// waits here alongside what the server said it contains.
data class PendingBackupImport(
    val rawJson: String,
    val preview: uk.co.eggcraft.studioflow.data.firebase.ImportBackupPreview
)

class StudioFlowViewModel @JvmOverloads constructor(
    application: Application,
    private val repository: StudioFlowRepository = StudioFlowRepository()
) : AndroidViewModel(application) {
    // The in-app help assistant needs the same repository; exposing it read-only
    // keeps the sheet from constructing a second one.
    val helpRepository: StudioFlowRepository get() = repository

    private val mutableState = MutableStateFlow(StudioFlowUiState())
    private val draftPrefs: SharedPreferences =
        application.getSharedPreferences("studio_message_drafts", Context.MODE_PRIVATE)
    private val messagePrefs: SharedPreferences =
        application.getSharedPreferences("studio_message_local", Context.MODE_PRIVATE)

    fun loadDraft(workspaceId: String, threadId: String): String {
        if (workspaceId.isBlank() || threadId.isBlank()) return ""
        val uid = mutableState.value.user?.uid.orEmpty()
        return draftPrefs.getString(draftKey(workspaceId, uid, threadId), "").orEmpty()
    }

    fun saveDraft(workspaceId: String, threadId: String, text: String) {
        if (workspaceId.isBlank() || threadId.isBlank()) return
        val uid = mutableState.value.user?.uid.orEmpty()
        val key = draftKey(workspaceId, uid, threadId)
        if (text.isBlank()) draftPrefs.edit().remove(key).apply()
        else draftPrefs.edit().putString(key, text).apply()
    }

    private fun draftKey(workspaceId: String, uid: String, threadId: String): String =
        "draft_${workspaceId}_${uid}_$threadId"

    private fun savedKey(workspaceId: String, uid: String): String =
        "saved_${workspaceId}_$uid"

    private fun archiveKey(workspaceId: String, uid: String): String =
        "archive_${workspaceId}_$uid"

    private fun dismissedNotifKey(workspaceId: String, uid: String): String =
        "dismissed_notifs_${workspaceId}_$uid"

    private fun loadDismissedNotifs(workspaceId: String, uid: String): Set<String> {
        if (workspaceId.isBlank() || uid.isBlank()) return emptySet()
        val raw = messagePrefs.getString(dismissedNotifKey(workspaceId, uid), "").orEmpty()
        if (raw.isBlank()) return emptySet()
        return runCatching {
            val arr = org.json.JSONArray(raw)
            val out = mutableSetOf<String>()
            for (i in 0 until arr.length()) {
                val s = arr.optString(i).trim()
                if (s.isNotEmpty()) out.add(s)
            }
            out.toSet()
        }.getOrDefault(emptySet())
    }

    private fun persistDismissedNotifs(workspaceId: String, uid: String, ids: Set<String>) {
        if (workspaceId.isBlank() || uid.isBlank()) return
        val arr = org.json.JSONArray(ids.take(500).toList())
        messagePrefs.edit().putString(dismissedNotifKey(workspaceId, uid), arr.toString()).apply()
    }

    private fun loadSavedMessages(workspaceId: String, uid: String): Map<String, Set<String>> {
        if (workspaceId.isBlank() || uid.isBlank()) return emptyMap()
        val raw = messagePrefs.getString(savedKey(workspaceId, uid), "").orEmpty()
        if (raw.isBlank()) return emptyMap()
        return runCatching {
            val obj = org.json.JSONObject(raw)
            val out = mutableMapOf<String, Set<String>>()
            obj.keys().forEach { threadId ->
                val arr = obj.optJSONArray(threadId) ?: return@forEach
                val set = mutableSetOf<String>()
                for (i in 0 until arr.length()) {
                    val s = arr.optString(i).trim()
                    if (s.isNotEmpty()) set.add(s)
                }
                if (set.isNotEmpty()) out[threadId] = set
            }
            out.toMap()
        }.getOrDefault(emptyMap())
    }

    private fun persistSavedMessages(workspaceId: String, uid: String, map: Map<String, Set<String>>) {
        if (workspaceId.isBlank() || uid.isBlank()) return
        val obj = org.json.JSONObject()
        map.forEach { (threadId, ids) ->
            obj.put(threadId, org.json.JSONArray(ids))
        }
        messagePrefs.edit().putString(savedKey(workspaceId, uid), obj.toString()).apply()
    }

    private fun loadArchivedMarkers(workspaceId: String, uid: String): Map<String, Long> {
        if (workspaceId.isBlank() || uid.isBlank()) return emptyMap()
        val raw = messagePrefs.getString(archiveKey(workspaceId, uid), "").orEmpty()
        if (raw.isBlank()) return emptyMap()
        return runCatching {
            val obj = org.json.JSONObject(raw)
            val out = mutableMapOf<String, Long>()
            obj.keys().forEach { threadId ->
                val ts = obj.optLong(threadId, 0L)
                if (ts > 0L) out[threadId] = ts
            }
            out.toMap()
        }.getOrDefault(emptyMap())
    }

    private fun persistArchivedMarkers(workspaceId: String, uid: String, map: Map<String, Long>) {
        if (workspaceId.isBlank() || uid.isBlank()) return
        val obj = org.json.JSONObject()
        map.forEach { (threadId, ts) -> obj.put(threadId, ts) }
        messagePrefs.edit().putString(archiveKey(workspaceId, uid), obj.toString()).apply()
    }

    val state: StateFlow<StudioFlowUiState> = mutableState.asStateFlow()
    private var workspaceJob: Job? = null
    private var liveWorkspaceJob: Job? = null
    private var ordersJob: Job? = null
    private var customersJob: Job? = null
    private var teamJob: Job? = null
    private var joinRequestsJob: Job? = null
    private var settingsJob: Job? = null
    private var messageThreadsJob: Job? = null
    private var messageItemsJob: Job? = null
    private var messageTeamMembersJob: Job? = null
    private var messageTypingJob: Job? = null
    private var messagePresenceJob: Job? = null
    private var messageTypingSenderJob: Job? = null
    private var lastTypingSentAt: Long = 0L
    private var activityNotificationsJob: Job? = null
    private var keepNotesJob: Job? = null
    private var bankFeedJob: Job? = null
    private var activeCompanyJob: Job? = null

    init {
        viewModelScope.launch {
            repository.authState().collect { user ->
                workspaceJob?.cancel()
                ordersJob?.cancel()
                customersJob?.cancel()
                liveWorkspaceJob?.cancel()
                teamJob?.cancel()
                joinRequestsJob?.cancel()
                settingsJob?.cancel()
                messageThreadsJob?.cancel()
                messageItemsJob?.cancel()
                messageTeamMembersJob?.cancel()
                messageTypingJob?.cancel()
                messagePresenceJob?.cancel()
                messageTypingSenderJob?.cancel()
                activityNotificationsJob?.cancel()
                keepNotesJob?.cancel()
                activeCompanyJob?.cancel()
                if (user == null) {
                    StudioMessageRouteHolder.clearCurrentCompanyId()
                    mutableState.value = StudioFlowUiState(loading = false)
                } else {
                    mutableState.update { it.copy(loading = true, user = user, errorMessage = "") }
                    loadWorkspace(user)
                    observeActiveCompanyId(user)
                }
            }
        }
    }

    fun register(fullName: String, studioName: String, email: String, password: String) {
        if (fullName.trim().length < 2 || studioName.trim().length < 2) {
            mutableState.update { it.copy(errorMessage = "Please enter your name and studio name.") }
            return
        }
        if (email.isBlank()) {
            mutableState.update { it.copy(errorMessage = "Email is required.") }
            return
        }
        if (password.length < 8 || !password.any { ch -> ch.isLetter() } || !password.any { ch -> ch.isDigit() }) {
            mutableState.update { it.copy(errorMessage = "Password must be at least 8 characters and include a letter and a number.") }
            return
        }
        viewModelScope.launch {
            mutableState.update { it.copy(signingIn = true, errorMessage = "") }
            runCatching { repository.register(fullName, studioName, email, password) }
                .onSuccess {
                    // Brand-new account: surface the one-time verification notice.
                    mutableState.update { it.copy(showPostSignupVerifyNotice = true) }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(signingIn = false, loading = false, errorMessage = error.message ?: "Could not create the account.")
                    }
                }
        }
    }

    fun dismissPostSignupVerifyNotice() {
        mutableState.update { it.copy(showPostSignupVerifyNotice = false) }
    }

    fun signIn(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            mutableState.update { it.copy(errorMessage = "Email and password are required.") }
            return
        }
        viewModelScope.launch {
            mutableState.update { it.copy(signingIn = true, errorMessage = "") }
            runCatching { repository.signIn(email, password) }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(signingIn = false, loading = false, errorMessage = error.message ?: "Could not sign in.")
                    }
                }
        }
    }

    fun beginExternalSignIn() {
        mutableState.update { it.copy(signingIn = true, errorMessage = "") }
    }

    fun failExternalSignIn(message: String) {
        mutableState.update {
            it.copy(
                signingIn = false,
                loading = false,
                errorMessage = message.ifBlank { "Could not sign in with Google." }
            )
        }
    }

    fun signInWithGoogleIdToken(idToken: String) {
        if (idToken.isBlank()) {
            failExternalSignIn("Google Sign-In could not return a valid token.")
            return
        }
        viewModelScope.launch {
            mutableState.update { it.copy(signingIn = true, errorMessage = "") }
            runCatching { repository.signInWithGoogleIdToken(idToken) }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(signingIn = false, loading = false, errorMessage = error.message ?: "Could not sign in with Google.")
                    }
                }
        }
    }

    fun signInWithApple(activity: android.app.Activity) {
        viewModelScope.launch {
            mutableState.update { it.copy(signingIn = true, errorMessage = "") }
            runCatching { repository.signInWithApple(activity) }
                .onFailure { error ->
                    val message = error.message ?: "Could not sign in with Apple."
                    // The user simply closing the Apple web sheet is not an error to surface.
                    val cancelled = message.contains("canceled", ignoreCase = true) ||
                        message.contains("cancelled", ignoreCase = true) ||
                        message.contains("WEB_CONTEXT_CANCELED", ignoreCase = true)
                    mutableState.update {
                        it.copy(
                            signingIn = false,
                            loading = false,
                            errorMessage = if (cancelled) "" else message
                        )
                    }
                }
        }
    }

    private fun clearDeviceLocalWorkspaceCache() {
        val app = getApplication<Application>()
        for (name in listOf("studioflow_order_detail_layout", "studio_customer_pane")) {
            app.getSharedPreferences(name, Context.MODE_PRIVATE).edit().clear().apply()
        }
    }

    fun signOut() {
        // Remove this device's push registration while the session is still
        // authenticated; after signOut() the Firestore rules reject the delete
        // and the device would keep receiving the old workspace's pushes.
        // Device-local card layout/colour state must not leak into the next
        // account on this device (mirrors iOS clearDeviceLocalWorkspaceCardCache).
        clearDeviceLocalWorkspaceCache()
        StudioMessageRouteHolder.unregisterStoredDeviceToken(getApplication()) {
            repository.signOut()
            // Blank the home-screen widgets so business figures don't outlive the session.
            publishWidgetSummary(orders = emptyList())
            publishNotesWidget(emptyList())
        }
    }

    // Push the Keep notes snapshot to the home-screen Notes widget (same data
    // bridge as iOS). Fire-and-forget like publishWidgetSummary below.
    private fun publishNotesWidget(notes: List<StudioKeepNote>) {
        val settings = mutableState.value.workspaceSettings
        viewModelScope.launch(Dispatchers.Default) {
            runCatching { WidgetSummaryBridge.publishNotes(getApplication(), notes, settings) }
        }
    }

    // Recompute the home-screen widget summary (same data bridge as iOS/macOS).
    // Fire-and-forget: a widget refresh failure must never affect app state.
    private fun publishWidgetSummary(orders: List<StudioOrder>? = null) {
        val snapshot = mutableState.value
        val orderList = orders ?: snapshot.orders
        val settings = snapshot.workspaceSettings
        viewModelScope.launch(Dispatchers.Default) {
            runCatching { WidgetSummaryBridge.publish(getApplication(), orderList, settings) }
        }
    }

    fun assignOrder(order: StudioOrder, member: StudioTeamMember?) {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            runCatching { repository.assignOrder(workspace, order, member) }
                .onFailure { error ->
                    mutableState.update { it.copy(errorMessage = error.message ?: "Could not assign project.") }
                }
        }
    }

    fun updateOrderFields(order: StudioOrder, payload: Map<String, Any?>) {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            mutableState.update { it.copy(errorMessage = "", settingsMessage = "") }
            runCatching { repository.updateOrderFields(workspace, order, payload) }
                .onFailure { error ->
                    mutableState.update { it.copy(errorMessage = error.message ?: "Could not update project.") }
                }
        }
    }

    fun restoreOrder(order: StudioOrder) {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            mutableState.update { it.copy(errorMessage = "", settingsMessage = "") }
            runCatching { repository.restoreOrder(workspace, order) }
                .onSuccess { mutableState.update { it.copy(settingsMessage = "Order restored.") } }
                .onFailure { error ->
                    mutableState.update { it.copy(errorMessage = error.message ?: "Could not restore this order.") }
                }
        }
    }

    fun updateCustomer(customer: StudioCustomer) {
        val workspace = mutableState.value.workspace ?: return
        // Autosave — stay quiet on success so per-field edits don't spam status.
        viewModelScope.launch {
            runCatching { repository.updateCustomer(workspace.id, customer) }
                .onFailure { error ->
                    mutableState.update { it.copy(errorMessage = error.message ?: "Could not save the customer.") }
                }
        }
    }

    fun updateCustomerPrefs(customer: StudioCustomer, patch: StudioCustomerPrefsPatch) {
        val workspace = mutableState.value.workspace ?: return
        // Per-field save for segments/contact preferences — quiet on success,
        // like the contact autosave, so single-field edits don't spam status.
        viewModelScope.launch {
            runCatching { repository.updateCustomer(workspace.id, customer, patch) }
                .onFailure { error ->
                    mutableState.update { it.copy(errorMessage = error.message ?: "Could not save the customer.") }
                }
        }
    }

    fun resyncIntegrationCustomer(customer: StudioCustomer) {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            mutableState.update { it.copy(errorMessage = "", settingsMessage = "") }
            runCatching { repository.resyncIntegrationCustomer(workspace.id, customer.id) }
                .onSuccess { applied ->
                    // Same success line the web shows, with the applied-field count.
                    mutableState.update { it.copy(settingsMessage = "Resynced from store data.${if (applied > 0) " ($applied)" else ""}") }
                }
                .onFailure { error ->
                    mutableState.update { it.copy(errorMessage = error.message ?: "The customer could not be resynced.") }
                }
        }
    }

    fun createCustomer(
        name: String,
        email: String,
        phone: String,
        instagram: String,
        streetAddress: String,
        city: String,
        postalCode: String,
        country: String,
        notes: String
    ) {
        val workspace = mutableState.value.workspace ?: return
        if (name.isBlank()) return
        viewModelScope.launch {
            mutableState.update { it.copy(errorMessage = "", settingsMessage = "") }
            runCatching {
                repository.createCustomer(
                    companyId = workspace.id,
                    name = name,
                    email = email,
                    phone = phone,
                    instagram = instagram,
                    streetAddress = streetAddress,
                    city = city,
                    postalCode = postalCode,
                    country = country,
                    notes = notes
                )
            }
                .onSuccess { message -> mutableState.update { it.copy(settingsMessage = message) } }
                .onFailure { error ->
                    mutableState.update { it.copy(errorMessage = error.message ?: "Could not create the customer.") }
                }
        }
    }

    fun uploadCustomerPhoto(customer: StudioCustomer, bytes: ByteArray, contentType: String) {
        val workspace = mutableState.value.workspace ?: return
        val user = mutableState.value.user ?: return
        viewModelScope.launch {
            runCatching { repository.uploadCustomerImage(workspace, user, customer, bytes, contentType) }
                .onFailure { error ->
                    mutableState.update { it.copy(errorMessage = error.message ?: "Could not upload the customer photo.") }
                }
        }
    }

    fun deleteCustomer(customerId: String) {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            mutableState.update { it.copy(errorMessage = "", settingsMessage = "") }
            runCatching { repository.deleteCustomer(workspace.id, customerId) }
                .onSuccess { mutableState.update { it.copy(settingsMessage = "Customer deleted.") } }
                .onFailure { error ->
                    mutableState.update { it.copy(errorMessage = error.message ?: "Could not delete the customer.") }
                }
        }
    }

    fun deleteOrder(order: StudioOrder) {
        val workspace = mutableState.value.workspace ?: return
        val normalizedRole = workspace.role.lowercase().replace("_", "").replace("-", "").replace(" ", "")
        val workflowRequest = normalizedRole == "workflow" || normalizedRole == "workflowonly" || workspace.shouldShowOnlyAssignedProjects
        viewModelScope.launch {
            mutableState.update { it.copy(errorMessage = "", settingsMessage = "") }
            runCatching { repository.deleteOrder(workspace, order) }
                .onSuccess {
                    mutableState.update { it.copy(settingsMessage = if (workflowRequest) "Deletion request sent to workspace owner." else "Order deleted.") }
                }
                .onFailure { error ->
                    mutableState.update { it.copy(errorMessage = error.message ?: "Could not delete this order.") }
                }
        }
    }

    fun reviewWorkflowOrderDeletion(orderId: String, approve: Boolean) {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            mutableState.update { it.copy(errorMessage = "", settingsMessage = "") }
            runCatching { repository.reviewWorkflowOrderDeletion(workspace, orderId, approve) }
                .onSuccess {
                    mutableState.update { it.copy(settingsMessage = if (approve) "Deletion approved and order deleted." else "Deletion request rejected.") }
                }
                .onFailure { error ->
                    mutableState.update { it.copy(errorMessage = error.message ?: "Could not review deletion request.") }
                }
        }
    }

    fun saveOrderCardLayout(order: StudioOrder, snapshotJSON: String) {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            mutableState.update { it.copy(settingsSaving = true, errorMessage = "", settingsMessage = "") }
            runCatching { repository.saveOrderCardLayout(workspace, order, snapshotJSON) }
                .onSuccess { message ->
                    mutableState.update { it.copy(settingsSaving = false, settingsMessage = message) }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(settingsSaving = false, errorMessage = error.message ?: "Could not save this order layout.")
                    }
                }
        }
    }

    fun resetOrderCardLayout(order: StudioOrder) {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            mutableState.update { it.copy(settingsSaving = true, errorMessage = "", settingsMessage = "") }
            runCatching { repository.resetOrderCardLayout(workspace, order) }
                .onSuccess { message ->
                    mutableState.update { it.copy(settingsSaving = false, settingsMessage = message) }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(settingsSaving = false, errorMessage = error.message ?: "Could not rejoin the shared layout.")
                    }
                }
        }
    }

    fun uploadClientFile(order: StudioOrder, bytes: ByteArray, fileName: String, contentType: String) {
        val workspace = mutableState.value.workspace ?: return
        val user = mutableState.value.user ?: return
        val maxMb = mutableState.value.workspaceSettings.uploadSafetyMaxFileSizeMB
        viewModelScope.launch {
            mutableState.update { it.copy(settingsSaving = true, errorMessage = "", settingsMessage = "") }
            runCatching {
                repository.uploadClientFile(
                    workspace = workspace,
                    user = user,
                    order = order,
                    bytes = bytes,
                    fileName = fileName,
                    contentType = contentType,
                    policyAccepted = true,
                    maxSizeMb = maxMb
                )
            }
                .onSuccess { message ->
                    mutableState.update { it.copy(settingsSaving = false, settingsMessage = message) }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(settingsSaving = false, errorMessage = error.message ?: "Could not upload client file.")
                    }
                }
        }
    }

    fun uploadPreviewImage(order: StudioOrder, bytes: ByteArray, fileName: String, contentType: String) {
        val workspace = mutableState.value.workspace ?: return
        val user = mutableState.value.user ?: return
        val maxMb = mutableState.value.workspaceSettings.uploadSafetyMaxFileSizeMB
        viewModelScope.launch {
            mutableState.update { it.copy(settingsSaving = true, errorMessage = "", settingsMessage = "") }
            runCatching {
                repository.uploadPreviewImage(
                    workspace = workspace,
                    user = user,
                    order = order,
                    bytes = bytes,
                    fileName = fileName,
                    contentType = contentType,
                    maxSizeMb = maxMb
                )
            }
                .onSuccess { message ->
                    mutableState.update { it.copy(settingsSaving = false, settingsMessage = message) }
                    // Also mirror the uploaded preview image into Client Files so it's
                    // listed there too (best-effort; silently skipped if unavailable).
                    runCatching {
                        repository.uploadClientFile(
                            workspace = workspace,
                            user = user,
                            order = order,
                            bytes = bytes,
                            fileName = fileName,
                            contentType = contentType,
                            policyAccepted = true,
                            maxSizeMb = maxMb
                        )
                    }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(settingsSaving = false, errorMessage = error.message ?: "Could not upload preview image.")
                    }
                }
        }
    }

    fun refreshLiveTracking(order: StudioOrder) {
        val workspace = mutableState.value.workspace ?: return
        val language = mutableState.value.workspaceSettings.selectedLanguage
        viewModelScope.launch {
            mutableState.update { it.copy(settingsSaving = true, errorMessage = "", settingsMessage = "") }
            runCatching { repository.refreshLiveTracking(workspace, order, language) }
                .onSuccess { message ->
                    mutableState.update {
                        it.copy(settingsSaving = false, settingsMessage = message.ifBlank { "Tracking updated." })
                    }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(settingsSaving = false, errorMessage = error.message ?: "Could not refresh live tracking.")
                    }
                }
        }
    }

    fun renameClientFile(order: StudioOrder, fileId: String, fileName: String) {
        val workspace = mutableState.value.workspace ?: return
        if (fileId.isBlank() || fileName.isBlank()) return
        viewModelScope.launch {
            mutableState.update { it.copy(settingsSaving = true, errorMessage = "", settingsMessage = "") }
            runCatching { repository.renameClientFile(workspace, order, fileId, fileName) }
                .onSuccess { message ->
                    mutableState.update { it.copy(settingsSaving = false, settingsMessage = message) }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(settingsSaving = false, errorMessage = error.message ?: "Could not rename client file.")
                    }
                }
        }
    }

    fun deleteClientFile(order: StudioOrder, fileId: String) {
        val workspace = mutableState.value.workspace ?: return
        if (fileId.isBlank()) return
        viewModelScope.launch {
            mutableState.update { it.copy(settingsSaving = true, errorMessage = "", settingsMessage = "") }
            runCatching { repository.deleteClientFile(workspace, order, fileId) }
                .onSuccess { message ->
                    mutableState.update { it.copy(settingsSaving = false, settingsMessage = message) }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(settingsSaving = false, errorMessage = error.message ?: "Could not delete client file.")
                    }
                }
        }
    }

    fun createOrder() {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            mutableState.update { it.copy(creatingOrder = true, errorMessage = "") }
            runCatching { repository.createOrder(workspace) }
                .onSuccess {
                    mutableState.update { it.copy(creatingOrder = false, errorMessage = "") }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(creatingOrder = false, errorMessage = error.message ?: "Could not create project.")
                    }
                }
        }
    }

    fun updateWorkspaceSettings(updates: Map<String, Any?>, successMessage: String = "Settings saved.") {
        val workspace = mutableState.value.workspace ?: return
        val isPersonalInterfaceUpdate = updates.keys.any { it.startsWith("personal") }
        val previousSettings = mutableState.value.workspaceSettings

        if (isPersonalInterfaceUpdate) {
            mutableState.update { current ->
                var nextSettings = current.workspaceSettings
                updates["personalAppTheme"]?.toString()?.let { nextSettings = nextSettings.copy(appTheme = it) }
                updates["personalSelectedLanguage"]?.toString()?.let { nextSettings = nextSettings.copy(selectedLanguage = it) }
                updates["personalPdfShowCustomer"]?.let { nextSettings = nextSettings.copy(pdfShowCustomer = it as? Boolean ?: nextSettings.pdfShowCustomer) }
                updates["personalPdfShowContact"]?.let { nextSettings = nextSettings.copy(pdfShowContact = it as? Boolean ?: nextSettings.pdfShowContact) }
                updates["personalPdfShowPreview"]?.let { nextSettings = nextSettings.copy(pdfShowPreview = it as? Boolean ?: nextSettings.pdfShowPreview) }
                updates["personalPdfShowMaterials"]?.let { nextSettings = nextSettings.copy(pdfShowMaterials = it as? Boolean ?: nextSettings.pdfShowMaterials) }
                updates["personalPdfShowPriority"]?.let { nextSettings = nextSettings.copy(pdfShowPriority = it as? Boolean ?: nextSettings.pdfShowPriority) }
                updates["personalPdfShowStatus"]?.let { nextSettings = nextSettings.copy(pdfShowStatus = it as? Boolean ?: nextSettings.pdfShowStatus) }
                updates["personalPdfShowShipping"]?.let { nextSettings = nextSettings.copy(pdfShowShipping = it as? Boolean ?: nextSettings.pdfShowShipping) }
                current.copy(workspaceSettings = nextSettings, settingsSaving = true, errorMessage = "", settingsMessage = "")
            }
        }

        viewModelScope.launch {
            if (!isPersonalInterfaceUpdate) {
                mutableState.update { it.copy(settingsSaving = true, errorMessage = "", settingsMessage = "") }
            }
            runCatching { repository.updateWorkspaceSettings(workspace, updates) }
                .onSuccess {
                    mutableState.update { current ->
                        var nextSettings = current.workspaceSettings
                        updates["personalAppTheme"]?.toString()?.let { nextSettings = nextSettings.copy(appTheme = it) }
                        updates["personalSelectedLanguage"]?.toString()?.let { nextSettings = nextSettings.copy(selectedLanguage = it) }
                        updates["personalPdfShowCustomer"]?.let { nextSettings = nextSettings.copy(pdfShowCustomer = it as? Boolean ?: nextSettings.pdfShowCustomer) }
                        updates["personalPdfShowContact"]?.let { nextSettings = nextSettings.copy(pdfShowContact = it as? Boolean ?: nextSettings.pdfShowContact) }
                        updates["personalPdfShowPreview"]?.let { nextSettings = nextSettings.copy(pdfShowPreview = it as? Boolean ?: nextSettings.pdfShowPreview) }
                        updates["personalPdfShowMaterials"]?.let { nextSettings = nextSettings.copy(pdfShowMaterials = it as? Boolean ?: nextSettings.pdfShowMaterials) }
                        updates["personalPdfShowPriority"]?.let { nextSettings = nextSettings.copy(pdfShowPriority = it as? Boolean ?: nextSettings.pdfShowPriority) }
                        updates["personalPdfShowStatus"]?.let { nextSettings = nextSettings.copy(pdfShowStatus = it as? Boolean ?: nextSettings.pdfShowStatus) }
                        updates["personalPdfShowShipping"]?.let { nextSettings = nextSettings.copy(pdfShowShipping = it as? Boolean ?: nextSettings.pdfShowShipping) }
                        current.copy(workspaceSettings = nextSettings, settingsSaving = false, settingsMessage = successMessage)
                    }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(
                            workspaceSettings = if (isPersonalInterfaceUpdate) previousSettings else it.workspaceSettings,
                            settingsSaving = false,
                            errorMessage = error.message ?: "Could not save settings."
                        )
                    }
                }
        }
    }

    fun refreshPersonalInterfaceSettings() {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            runCatching { repository.loadPersonalInterfaceSettings(workspace) }
                .onSuccess { values ->
                    if (values.isEmpty()) return@onSuccess
                    mutableState.update { current ->
                        var nextSettings = current.workspaceSettings
                        values["appTheme"]?.toString()?.let { nextSettings = nextSettings.copy(appTheme = it) }
                        values["selectedLanguage"]?.toString()?.let { nextSettings = nextSettings.copy(selectedLanguage = it) }
                        values["pdfShowCustomer"]?.let { nextSettings = nextSettings.copy(pdfShowCustomer = it as? Boolean ?: nextSettings.pdfShowCustomer) }
                        values["pdfShowContact"]?.let { nextSettings = nextSettings.copy(pdfShowContact = it as? Boolean ?: nextSettings.pdfShowContact) }
                        values["pdfShowPreview"]?.let { nextSettings = nextSettings.copy(pdfShowPreview = it as? Boolean ?: nextSettings.pdfShowPreview) }
                        values["pdfShowMaterials"]?.let { nextSettings = nextSettings.copy(pdfShowMaterials = it as? Boolean ?: nextSettings.pdfShowMaterials) }
                        values["pdfShowPriority"]?.let { nextSettings = nextSettings.copy(pdfShowPriority = it as? Boolean ?: nextSettings.pdfShowPriority) }
                        values["pdfShowStatus"]?.let { nextSettings = nextSettings.copy(pdfShowStatus = it as? Boolean ?: nextSettings.pdfShowStatus) }
                        values["pdfShowShipping"]?.let { nextSettings = nextSettings.copy(pdfShowShipping = it as? Boolean ?: nextSettings.pdfShowShipping) }
                        current.copy(workspaceSettings = nextSettings)
                    }
                }
        }
    }

    // ----- Google Play Billing -------------------------------------------------
    private val billingManager: StudioGooglePlayBillingManager by lazy {
        StudioGooglePlayBillingManager(
            context = getApplication(),
            scope = viewModelScope,
            verifier = { result ->
                val workspace = mutableState.value.workspace
                    ?: error("No active workspace for purchase verification.")
                repository.verifyGooglePlayPurchase(workspace, result.subscriptionId, result.purchaseToken)
            },
            onPlanResolved = { planKey ->
                // Storage add-on verifications return an empty plan key; don't let that
                // downgrade the displayed plan to Demo. The live workspace listener
                // refreshes the add-on storage either way.
                if (planKey.isNotBlank()) {
                    val resolved = StudioBillingPlan.fromRaw(planKey)
                    mutableState.update { it.copy(workspace = it.workspace?.copy(billingPlan = resolved)) }
                }
            },
            onMessage = { message ->
                mutableState.update { it.copy(settingsMessage = message, errorMessage = "") }
            },
            onError = { message ->
                mutableState.update { it.copy(errorMessage = message) }
            }
        )
    }

    val googlePlanOffers: StateFlow<List<StudioGooglePlanOffer>> by lazy { billingManager.offers }
    val googleStorageOffers: StateFlow<List<StudioGoogleStorageOffer>> by lazy { billingManager.storageOffers }
    val googleBillingLoading: StateFlow<Boolean> by lazy { billingManager.isLoading }
    val googleBillingPurchasing: StateFlow<Boolean> by lazy { billingManager.isPurchasing }

    fun loadGooglePlayProducts() {
        billingManager.loadProducts()
    }

    fun purchaseGooglePlan(activity: Activity, offer: StudioGooglePlanOffer) {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            runCatching { repository.prepareGooglePlayPurchase(workspace) }
                .onSuccess { token ->
                    if (token.isEmpty()) {
                        mutableState.update { it.copy(errorMessage = "Could not start Google Play purchase.") }
                    } else {
                        billingManager.purchase(activity, offer.subscriptionId, offer.basePlanId, token)
                    }
                }
                .onFailure { error ->
                    mutableState.update { it.copy(errorMessage = error.message ?: "Could not start Google Play purchase.") }
                }
        }
    }

    fun purchaseGoogleStorageAddon(activity: Activity, offer: StudioGoogleStorageOffer) {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            runCatching { repository.prepareGooglePlayPurchase(workspace) }
                .onSuccess { token ->
                    if (token.isEmpty()) {
                        mutableState.update { it.copy(errorMessage = "Could not start Google Play purchase.") }
                    } else {
                        billingManager.purchase(activity, offer.subscriptionId, offer.basePlanId, token)
                    }
                }
                .onFailure { error ->
                    mutableState.update { it.copy(errorMessage = error.message ?: "Could not start Google Play purchase.") }
                }
        }
    }

    fun restoreGooglePlayPurchases() {
        billingManager.restorePurchases()
    }

    override fun onCleared() {
        super.onCleared()
        billingManager.release()
    }

    fun updateWorkspaceBillingPlan(plan: StudioBillingPlan) {
        val workspace = mutableState.value.workspace ?: return
        if (workspace.billingPlan == plan) return
        viewModelScope.launch {
            mutableState.update { it.copy(settingsSaving = true, errorMessage = "", settingsMessage = "") }
            runCatching { repository.updateWorkspaceBillingPlan(workspace, plan) }
                .onSuccess { message ->
                    mutableState.update { current ->
                        current.copy(
                            workspace = current.workspace?.copy(billingPlan = plan),
                            settingsSaving = false,
                            settingsMessage = message
                        )
                    }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(settingsSaving = false, errorMessage = error.message ?: "Could not change plan.")
                    }
                }
        }
    }

    fun saveAndRecalculateFinancialSettings(updates: Map<String, Any?>) {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            mutableState.update { it.copy(settingsSaving = true, errorMessage = "", settingsMessage = "") }
            runCatching {
                repository.updateWorkspaceSettings(workspace, updates)
                repository.recalculateFinancialSettings(workspace)
            }
                .onSuccess { message ->
                    mutableState.update { it.copy(settingsSaving = false, settingsMessage = message) }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(settingsSaving = false, errorMessage = error.message ?: "Could not recalculate financial settings.")
                    }
                }
        }
    }

    fun updateAccountProfile(displayName: String, companyName: String) {
        val workspace = mutableState.value.workspace ?: return
        val user = mutableState.value.user ?: return
        viewModelScope.launch {
            mutableState.update { it.copy(settingsSaving = true, errorMessage = "", settingsMessage = "") }
            runCatching { repository.updateAccountProfile(workspace, user, displayName, companyName) }
                .onSuccess {
                    mutableState.update { it.copy(settingsSaving = false, settingsMessage = "Profile saved.") }
                    loadWorkspace(user)
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(settingsSaving = false, errorMessage = error.message ?: "Could not save profile.")
                    }
                }
        }
    }

    fun uploadAccountAvatar(bytes: ByteArray, contentType: String) {
        val workspace = mutableState.value.workspace ?: return
        val user = mutableState.value.user ?: return
        viewModelScope.launch {
            mutableState.update { it.copy(settingsSaving = true, errorMessage = "", settingsMessage = "") }
            runCatching { repository.uploadAccountAvatar(workspace, user, bytes, contentType) }
                .onSuccess { message ->
                    mutableState.update { it.copy(settingsSaving = false, settingsMessage = message) }
                    loadWorkspace(user)
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(settingsSaving = false, errorMessage = error.message ?: "Could not upload avatar.")
                    }
                }
        }
    }

    fun removeAccountAvatar() {
        val workspace = mutableState.value.workspace ?: return
        val user = mutableState.value.user ?: return
        viewModelScope.launch {
            mutableState.update { it.copy(settingsSaving = true, errorMessage = "", settingsMessage = "") }
            runCatching { repository.saveAccountAvatar(workspace, "") }
                .onSuccess { message ->
                    mutableState.update { it.copy(settingsSaving = false, settingsMessage = message) }
                    loadWorkspace(user)
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(settingsSaving = false, errorMessage = error.message ?: "Could not remove avatar.")
                    }
                }
        }
    }

    fun uploadWorkspaceLogo(bytes: ByteArray, contentType: String, policyAccepted: Boolean) {
        val workspace = mutableState.value.workspace ?: return
        val user = mutableState.value.user ?: return
        val maxMb = mutableState.value.workspaceSettings.uploadSafetyMaxFileSizeMB
        viewModelScope.launch {
            mutableState.update { it.copy(settingsSaving = true, errorMessage = "", settingsMessage = "") }
            runCatching { repository.uploadWorkspaceLogo(workspace, user, bytes, contentType, policyAccepted, maxMb) }
                .onSuccess { message ->
                    mutableState.update { it.copy(settingsSaving = false, settingsMessage = message) }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(settingsSaving = false, errorMessage = error.message ?: "Could not upload workspace logo.")
                    }
                }
        }
    }

    fun removeWorkspaceLogo() {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            mutableState.update { it.copy(settingsSaving = true, errorMessage = "", settingsMessage = "") }
            runCatching { repository.saveWorkspaceLogo(workspace, "") }
                .onSuccess { message ->
                    mutableState.update { it.copy(settingsSaving = false, settingsMessage = message) }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(settingsSaving = false, errorMessage = error.message ?: "Could not remove workspace logo.")
                    }
                }
        }
    }

    fun changeAccountEmail(email: String) {
        val workspace = mutableState.value.workspace ?: return
        val user = mutableState.value.user ?: return
        viewModelScope.launch {
            mutableState.update { it.copy(settingsSaving = true, errorMessage = "", settingsMessage = "") }
            runCatching { repository.changeAccountEmail(workspace, email) }
                .onSuccess { message ->
                    mutableState.update { it.copy(settingsSaving = false, settingsMessage = message) }
                    loadWorkspace(user)
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(settingsSaving = false, errorMessage = error.message ?: "Could not change email.")
                    }
                }
        }
    }

    fun sendPasswordResetEmail() {
        val email = mutableState.value.user?.email.orEmpty()
        if (email.isBlank()) return
        viewModelScope.launch {
            mutableState.update { it.copy(settingsSaving = true, errorMessage = "", settingsMessage = "") }
            runCatching { repository.sendPasswordResetEmail(email) }
                .onSuccess {
                    mutableState.update { it.copy(settingsSaving = false, settingsMessage = "Password reset email sent.") }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(settingsSaving = false, errorMessage = error.message ?: "Could not send password reset email.")
                    }
                }
        }
    }

    fun switchWorkspace(companyId: String) {
        val user = mutableState.value.user ?: return
        if (companyId.isBlank() || companyId == mutableState.value.workspace?.id) return
        viewModelScope.launch {
            mutableState.update { it.copy(settingsSaving = true, errorMessage = "", settingsMessage = "") }
            runCatching {
                repository.switchActiveWorkspace(user, companyId)
                repository.loadWorkspace(user)
            }.onSuccess { workspace ->
                mutableState.update {
                    it.copy(settingsSaving = false, workspace = workspace, settingsMessage = "Workspace switched.")
                }
                val options = runCatching { repository.loadWorkspaceOptions(user, workspace.id) }.getOrDefault(emptyList())
                mutableState.update { it.copy(availableWorkspaces = options) }
                StudioMessageRouteHolder.setCurrentCompanyId(getApplication(), workspace.id)
                observeWorkspace(workspace, user)
            }.onFailure { error ->
                mutableState.update {
                    it.copy(settingsSaving = false, errorMessage = error.message ?: "Could not switch workspace.")
                }
            }
        }
    }

    fun requestWorkspaceAccess(ownerIdentifier: String) {
        if (ownerIdentifier.isBlank()) return
        viewModelScope.launch {
            mutableState.update { it.copy(settingsSaving = true, errorMessage = "", settingsMessage = "") }
            runCatching { repository.requestWorkspaceAccess(ownerIdentifier) }
                .onSuccess { message ->
                    mutableState.update { it.copy(settingsSaving = false, settingsMessage = message) }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(settingsSaving = false, errorMessage = error.message ?: "Could not request access.")
                    }
                }
        }
    }

    fun approveJoinRequest(request: StudioJoinRequest, role: String) {
        val workspace = mutableState.value.workspace ?: return
        runTeamAction("Could not approve access request.") {
            repository.approveJoinRequest(workspace, request, role)
        }
    }

    fun declineJoinRequest(request: StudioJoinRequest) {
        val workspace = mutableState.value.workspace ?: return
        runTeamAction("Could not decline access request.") {
            repository.declineJoinRequest(workspace, request)
        }
    }

    fun updateTeamMemberRole(member: StudioTeamMember, role: String) {
        val workspace = mutableState.value.workspace ?: return
        runTeamAction("Could not update team role.") {
            repository.updateTeamMemberRole(workspace, member, role)
        }
    }

    fun updateTeamMemberAccess(member: StudioTeamMember, access: WorkspaceMemberAccess) {
        val workspace = mutableState.value.workspace ?: return
        runTeamAction("Could not update team access.") {
            repository.updateTeamMemberAccess(workspace, member, access)
        }
    }

    fun removeTeamMember(member: StudioTeamMember) {
        val workspace = mutableState.value.workspace ?: return
        runTeamAction("Could not remove team member.") {
            repository.removeTeamMember(workspace, member)
        }
    }

    fun saveCustomRole(roleId: String, name: String, baseRole: String, access: WorkspaceMemberAccess) {
        val workspace = mutableState.value.workspace ?: return
        if (name.isBlank()) return
        runTeamAction("Could not save custom role.") {
            repository.saveCustomRole(workspace, roleId, name, baseRole, access)
        }
    }

    fun deleteCustomRole(role: StudioCustomRole) {
        val workspace = mutableState.value.workspace ?: return
        runTeamAction("Could not delete custom role.") {
            repository.deleteCustomRole(workspace, role)
        }
    }

    // Picking a file used to import it on the spot. Import is append-only and
    // mints new records every time, so the second run of the same file silently
    // doubled the workspace. Now the file is previewed and the user confirms.
    fun importBackup(rawJson: String) {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            mutableState.update { it.copy(settingsSaving = true, errorMessage = "", settingsMessage = "") }
            runCatching { repository.previewImportBackup(workspace, rawJson) }
                .onSuccess { preview ->
                    mutableState.update {
                        it.copy(settingsSaving = false, pendingBackupImport = PendingBackupImport(rawJson, preview))
                    }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(settingsSaving = false, errorMessage = error.message ?: "Could not import backup.")
                    }
                }
        }
    }

    fun confirmBackupImport(skipDuplicates: Boolean) {
        val workspace = mutableState.value.workspace ?: return
        val pending = mutableState.value.pendingBackupImport ?: return
        viewModelScope.launch {
            mutableState.update {
                it.copy(settingsSaving = true, pendingBackupImport = null, errorMessage = "", settingsMessage = "")
            }
            runCatching { repository.importBackup(workspace, pending.rawJson, skipDuplicates) }
                .onSuccess { result ->
                    // The old message said "Imported N orders" where N counted
                    // customers too, and never mentioned records the cap dropped.
                    val summary = result.message.ifBlank {
                        "Imported ${result.importedOrders} orders and ${result.importedCustomers} customers."
                    }
                    mutableState.update { it.copy(settingsSaving = false, settingsMessage = summary) }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(settingsSaving = false, errorMessage = error.message ?: "Could not import backup.")
                    }
                }
        }
    }

    fun cancelBackupImport() {
        mutableState.update { it.copy(pendingBackupImport = null) }
    }

    fun deleteWorkspaceData() {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            mutableState.update { it.copy(settingsSaving = true, errorMessage = "", settingsMessage = "") }
            runCatching { repository.deleteWorkspaceData(workspace) }
                .onSuccess { count ->
                    mutableState.update { it.copy(settingsSaving = false, settingsMessage = "Deleted $count records.") }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(settingsSaving = false, errorMessage = error.message ?: "Could not delete data.")
                    }
                }
        }
    }

    private fun runTeamAction(fallbackError: String, action: suspend () -> String) {
        viewModelScope.launch {
            mutableState.update { it.copy(settingsSaving = true, errorMessage = "", settingsMessage = "") }
            runCatching { action() }
                .onSuccess { message ->
                    mutableState.update { it.copy(settingsSaving = false, settingsMessage = message) }
                }
                .onFailure { error ->
                    mutableState.update { it.copy(settingsSaving = false, errorMessage = error.message ?: fallbackError) }
                }
        }
    }

    /// Listens for server-side changes to `users/{uid}.activeCompanyId`. When the
    /// owner approves this user's join request, the Cloud Function points them at
    /// the newly joined workspace and this listener fires — we reload the workspace
    /// so the app instantly switches without requiring a manual Team Access pick.
    private fun observeActiveCompanyId(user: FirebaseUser) {
        activeCompanyJob = viewModelScope.launch {
            repository.activeCompanyIdFlow(user.uid).collect { remoteActive ->
                if (remoteActive.isBlank()) return@collect
                val current = mutableState.value.workspace?.id.orEmpty()
                if (remoteActive == current) return@collect
                loadWorkspace(user)
            }
        }
    }

    private fun loadWorkspace(user: FirebaseUser) {
        workspaceJob = viewModelScope.launch {
            runCatching { repository.loadWorkspace(user) }
                .onSuccess { workspace ->
                    mutableState.update {
                        it.copy(loading = false, workspace = workspace, errorMessage = "")
                    }
                    viewModelScope.launch {
                        runCatching { repository.loadWorkspaceOptions(user, workspace.id) }
                            .onSuccess { options -> mutableState.update { it.copy(availableWorkspaces = options) } }
                    }
                    StudioMessageRouteHolder.setCurrentCompanyId(getApplication(), workspace.id)
                    observeWorkspace(workspace, user)
                    observePendingThreadRoute()
                    startLiveWorkspaceListener(user, workspace.id)
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(loading = false, errorMessage = error.message ?: "Could not load workspace.")
                    }
                    // Offline or flaky network at launch: retry quietly so the app
                    // recovers by itself instead of sitting on a blank screen.
                    viewModelScope.launch {
                        kotlinx.coroutines.delay(8000)
                        val currentUser = mutableState.value.user
                        if (currentUser != null && mutableState.value.workspace == null) {
                            loadWorkspace(currentUser)
                        }
                    }
                }
        }
    }

    // Live-syncs the current member's role / access / plan from the company document
    // so a role change made on another device takes effect without a re-login.
    private fun startLiveWorkspaceListener(user: FirebaseUser, companyId: String) {
        liveWorkspaceJob?.cancel()
        liveWorkspaceJob = viewModelScope.launch {
            repository.workspaceFlow(user, companyId)
                .catch { }
                .collect { updated ->
                    if (updated.id != mutableState.value.workspace?.id && mutableState.value.workspace != null) return@collect
                    val current = mutableState.value.workspace
                    mutableState.update { it.copy(workspace = updated) }
                    val roleRelevantChange = current == null ||
                        current.role != updated.role ||
                        current.memberAccess != updated.memberAccess ||
                        current.billingPlan != updated.billingPlan ||
                        current.shouldShowOnlyAssignedProjects != updated.shouldShowOnlyAssignedProjects
                    if (roleRelevantChange) {
                        observeWorkspace(updated, user)
                    }
                }
        }
    }

    fun selectMessageThread(threadId: String) {
        val clean = threadId.trim()
        if (clean.isBlank()) return
        val workspace = mutableState.value.workspace ?: return
        val user = mutableState.value.user ?: return
        val sameThread = mutableState.value.selectedMessageThreadId == clean
        val hasActiveListener = messageItemsJob != null
        if (sameThread && hasActiveListener) {
            markMessageThreadRead(clean)
            return
        }
        mutableState.update { it.copy(selectedMessageThreadId = clean) }
        startMessageItemsListener(workspace.id, user.uid, clean)
        markMessageThreadRead(clean)
    }

    private fun startMessageItemsListener(workspaceId: String, userUid: String, threadId: String) {
        messageItemsJob?.cancel()
        messageItemsJob = viewModelScope.launch {
            repository.messageItemsFlow(workspaceId, threadId, userUid)
                .catch { error ->
                    mutableState.update { it.copy(messageError = error.message ?: "Could not load messages.") }
                }
                .collect { items ->
                    mutableState.update { current ->
                        current.copy(
                            messageItemsByThreadId = current.messageItemsByThreadId + (threadId to items),
                            messageError = ""
                        )
                    }
                }
        }
        messageTypingJob?.cancel()
        messageTypingJob = viewModelScope.launch {
            repository.messageTypingUsersFlow(workspaceId, threadId, userUid)
                .catch { }
                .collect { users ->
                    mutableState.update { current ->
                        current.copy(typingUsersByThreadId = current.typingUsersByThreadId + (threadId to users))
                    }
                }
        }
        startPresenceHeartbeat(threadId)
    }

    private var pendingRouteJob: Job? = null
    private fun observePendingThreadRoute() {
        pendingRouteJob?.cancel()
        pendingRouteJob = viewModelScope.launch {
            StudioMessageRouteHolder.pendingThreadId.collect { id ->
                if (id.isNotBlank() && mutableState.value.workspace != null) {
                    StudioMessageRouteHolder.consumePendingThreadId()
                    selectMessageThread(id)
                }
            }
        }
    }

    private fun startPresenceHeartbeat(threadId: String) {
        val workspace = mutableState.value.workspace ?: return
        messagePresenceJob?.cancel()
        messagePresenceJob = viewModelScope.launch {
            runCatching { repository.setMessageThreadActive(workspace, threadId, true) }
            while (true) {
                delay(45_000L)
                runCatching { repository.setMessageThreadActive(workspace, threadId, true) }
            }
        }
    }

    fun onComposerTextChanged() {
        val workspace = mutableState.value.workspace ?: return
        val user = mutableState.value.user ?: return
        val threadId = mutableState.value.selectedMessageThreadId
        if (threadId.isBlank()) return
        val now = System.currentTimeMillis()
        if (now - lastTypingSentAt < 4_000L) return
        lastTypingSentAt = now
        messageTypingSenderJob?.cancel()
        messageTypingSenderJob = viewModelScope.launch {
            runCatching { repository.setMessageTypingStatus(workspace, user, threadId, true) }
            delay(6_000L)
            runCatching { repository.setMessageTypingStatus(workspace, user, threadId, false) }
            lastTypingSentAt = 0L
        }
    }

    fun setMessageSearchQuery(query: String) {
        mutableState.update { it.copy(messageSearchQuery = query) }
    }

    fun setMessageAttachmentFilter(filter: String) {
        mutableState.update { it.copy(messageAttachmentFilter = filter) }
    }

    fun toggleThreadArchive(threadId: String) {
        val clean = threadId.trim()
        if (clean.isBlank()) return
        val workspace = mutableState.value.workspace ?: return
        val uid = mutableState.value.user?.uid.orEmpty()
        mutableState.update { current ->
            val markers = current.archivedThreadMarkers.toMutableMap()
            if (markers.containsKey(clean)) markers.remove(clean)
            else markers[clean] = System.currentTimeMillis()
            persistArchivedMarkers(workspace.id, uid, markers)
            current.copy(archivedThreadMarkers = markers)
        }
    }

    fun toggleSavedMessage(threadId: String, messageId: String) {
        val ct = threadId.trim()
        val cm = messageId.trim()
        if (ct.isBlank() || cm.isBlank()) return
        val workspace = mutableState.value.workspace ?: return
        val uid = mutableState.value.user?.uid.orEmpty()
        mutableState.update { current ->
            val map = current.savedMessageIdsByThreadId.toMutableMap()
            val set = (map[ct] ?: emptySet()).toMutableSet()
            if (set.contains(cm)) set.remove(cm) else set.add(cm)
            if (set.isEmpty()) map.remove(ct) else map[ct] = set
            persistSavedMessages(workspace.id, uid, map)
            current.copy(savedMessageIdsByThreadId = map)
        }
    }

    fun setForwardingMessage(message: StudioMessageItem?) {
        mutableState.update { it.copy(forwardingMessage = message) }
    }

    fun forwardMessageToThread(targetThreadId: String) {
        val workspace = mutableState.value.workspace ?: return
        val user = mutableState.value.user ?: return
        val message = mutableState.value.forwardingMessage ?: return
        val clean = targetThreadId.trim()
        if (clean.isBlank()) return
        viewModelScope.launch {
            mutableState.update { it.copy(isSendingMessage = true, messageError = "") }
            runCatching {
                val prefix = "Forwarded from ${message.senderLabel()}\n"
                repository.sendThreadMessage(
                    workspace = workspace,
                    user = user,
                    threadId = clean,
                    text = prefix + message.text,
                    fileURL = message.fileURL,
                    fileName = message.fileName,
                    fileType = message.fileType,
                    fileSize = message.fileSize
                )
            }
                .onSuccess {
                    mutableState.update { it.copy(isSendingMessage = false, forwardingMessage = null) }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(isSendingMessage = false, messageError = error.message ?: "Could not forward message.")
                    }
                }
        }
    }

    fun createDirectMessageThread(memberUid: String) {
        val workspace = mutableState.value.workspace ?: return
        val clean = memberUid.trim()
        if (clean.isBlank()) return
        viewModelScope.launch {
            runCatching { repository.createMessageThread(workspace, type = "direct", memberUid = clean) }
                .onSuccess { newId ->
                    if (newId.isNotBlank()) mutableState.update { it.copy(selectedMessageThreadId = newId) }
                }
                .onFailure { error ->
                    mutableState.update { it.copy(messageError = error.message ?: "Could not create conversation.") }
                }
        }
    }

    fun createGroupMessageThread(memberUids: List<String>, title: String) {
        val workspace = mutableState.value.workspace ?: return
        if (memberUids.isEmpty()) return
        viewModelScope.launch {
            runCatching {
                repository.createMessageThread(workspace, type = "group", memberUids = memberUids, title = title)
            }
                .onSuccess { newId ->
                    if (newId.isNotBlank()) mutableState.update { it.copy(selectedMessageThreadId = newId) }
                }
                .onFailure { error ->
                    mutableState.update { it.copy(messageError = error.message ?: "Could not create group.") }
                }
        }
    }

    fun addMembersToThread(threadId: String, memberUids: List<String>) {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            runCatching { repository.addMembersToMessageThread(workspace, threadId, memberUids) }
                .onFailure { error ->
                    mutableState.update { it.copy(messageError = error.message ?: "Could not add members.") }
                }
        }
    }

    fun renameThread(threadId: String, title: String) {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            runCatching { repository.renameMessageThread(workspace, threadId, title) }
                .onFailure { error ->
                    mutableState.update { it.copy(messageError = error.message ?: "Could not rename group.") }
                }
        }
    }

    fun leaveThread(threadId: String) {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            runCatching { repository.leaveMessageThread(workspace, threadId) }
                .onFailure { error ->
                    mutableState.update { it.copy(messageError = error.message ?: "Could not leave conversation.") }
                }
        }
    }

    fun removeThreadMember(threadId: String, memberUid: String) {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            runCatching { repository.removeMemberFromMessageThread(workspace, threadId, memberUid) }
                .onFailure { error ->
                    mutableState.update { it.copy(messageError = error.message ?: "Could not remove member.") }
                }
        }
    }

    fun setActivityNotificationSearch(query: String) {
        mutableState.update { it.copy(activityNotificationSearch = query) }
    }

    fun setActivityNotificationReadFilter(filter: String) {
        mutableState.update { it.copy(activityNotificationReadFilter = filter) }
    }

    fun setActivityNotificationTypeFilter(filter: String) {
        mutableState.update { it.copy(activityNotificationTypeFilter = filter) }
    }

    fun markActivityNotificationRead(notificationId: String) {
        val workspace = mutableState.value.workspace ?: return
        val user = mutableState.value.user ?: return
        if (notificationId.isBlank()) return
        // Optimistic local update — UI hemen yansisin
        mutableState.update { current ->
            val now = java.util.Date()
            val updated = current.activityNotifications.map { item ->
                if (item.id == notificationId) {
                    val readBy = item.readBy.toMutableMap()
                    readBy[user.uid] = now
                    val email = user.email.orEmpty().lowercase()
                    if (email.isNotEmpty()) readBy[email] = now
                    item.copy(readBy = readBy)
                } else item
            }
            val unread = updated
                .filter { !current.dismissedActivityNotificationIds.contains(it.id) && !it.isDismissed(user.uid, user.email.orEmpty()) }
                .count { it.isUnread(user.uid, user.email.orEmpty()) }
            current.copy(activityNotifications = updated, activityNotificationUnreadCount = unread)
        }
        viewModelScope.launch {
            runCatching { repository.markActivityNotificationRead(workspace, notificationId) }
        }
    }

    fun markAllActivityNotificationsRead() {
        val workspace = mutableState.value.workspace ?: return
        val user = mutableState.value.user ?: return
        // Optimistic local update
        mutableState.update { current ->
            val now = java.util.Date()
            val email = user.email.orEmpty().lowercase()
            val updated = current.activityNotifications.map { item ->
                val readBy = item.readBy.toMutableMap()
                readBy[user.uid] = now
                if (email.isNotEmpty()) readBy[email] = now
                item.copy(readBy = readBy)
            }
            current.copy(activityNotifications = updated, activityNotificationUnreadCount = 0)
        }
        viewModelScope.launch {
            runCatching { repository.markAllActivityNotificationsRead(workspace) }
        }
    }

    fun dismissActivityNotifications(notificationIds: List<String>) {
        val workspace = mutableState.value.workspace ?: return
        val uid = mutableState.value.user?.uid.orEmpty()
        val clean = notificationIds.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
        if (clean.isEmpty()) return
        mutableState.update {
            val next = it.dismissedActivityNotificationIds + clean
            persistDismissedNotifs(workspace.id, uid, next)
            it.copy(dismissedActivityNotificationIds = next)
        }
        viewModelScope.launch {
            runCatching { repository.dismissActivityNotifications(workspace, clean) }
        }
    }

    // — Keep Notes actions —
    fun setKeepNotesSearch(query: String) {
        mutableState.update { it.copy(keepNotesSearch = query) }
    }

    fun setKeepNotesSection(section: String) {
        mutableState.update { it.copy(keepNotesSection = section) }
    }

    fun saveKeepNote(note: StudioKeepNote) {
        val workspace = mutableState.value.workspace ?: return
        val user = mutableState.value.user ?: return
        val finalNote = if (note.ownerUserId.isBlank()) {
            note.copy(
                ownerUserId = user.uid,
                ownerEmail = user.email.orEmpty(),
                ownerName = user.displayName.orEmpty()
            )
        } else note
        viewModelScope.launch {
            val saved = runCatching { repository.saveKeepNote(workspace.id, user.uid, finalNote) }
                .onFailure { e ->
                    // A rejected write used to disappear without a trace — surface it.
                    mutableState.update { it.copy(errorMessage = "The note could not be saved. ${e.message.orEmpty()}".trim()) }
                }
                .isSuccess
            if (!saved) return@launch
            // Visibility is a separate axis from type: "workspace" fans the note
            // out through the existing collaboration invites (each member gets
            // the same record mirrored — one record, not copies). Web parity.
            if (finalNote.visibility == "workspace") {
                runCatching {
                    val alreadyShared = finalNote.sharedWith.toSet()
                    repository.listWorkspaceMemberUids(workspace.id)
                        .filter { uid -> uid.isNotBlank() && uid != user.uid && uid !in alreadyShared }
                        .forEach { targetUid ->
                            // Individual invite failures are non-fatal (mirrors web).
                            runCatching { repository.inviteKeepNoteCollaborator(workspace.id, finalNote, targetUid, "") }
                        }
                }.onFailure { e ->
                    mutableState.update { it.copy(errorMessage = "The note was saved, but sharing with the team failed. ${e.message.orEmpty()}".trim()) }
                }
            }
        }
    }

    fun deleteKeepNote(noteId: String) {
        val workspace = mutableState.value.workspace ?: return
        val uid = mutableState.value.user?.uid ?: return
        viewModelScope.launch {
            runCatching { repository.deleteKeepNote(workspace.id, uid, noteId) }
        }
    }

    fun inviteKeepNoteCollaborator(note: StudioKeepNote, targetUserId: String, targetEmail: String) {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            runCatching { repository.inviteKeepNoteCollaborator(workspace.id, note, targetUserId, targetEmail) }
                .onFailure { e -> mutableState.update { it.copy(errorMessage = e.message ?: "Could not invite collaborator.") } }
        }
    }

    fun removeKeepNoteCollaborator(noteId: String, targetUserId: String, targetEmail: String) {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            runCatching { repository.removeKeepNoteCollaborator(workspace.id, noteId, targetUserId, targetEmail) }
        }
    }

    fun refreshKeepCollaborationInvites() {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            runCatching { repository.listKeepCollaborationInvites(workspace.id) }
                .onSuccess { items -> mutableState.update { it.copy(keepCollaborationInvites = items) } }
        }
    }

    fun acceptKeepCollaborationInvite(inviteId: String) {
        val workspace = mutableState.value.workspace ?: return
        // Optimistic local removal
        mutableState.update { it.copy(keepCollaborationInvites = it.keepCollaborationInvites.filter { i -> i.id != inviteId }) }
        viewModelScope.launch {
            runCatching { repository.acceptKeepCollaborationInvite(workspace.id, inviteId) }
                .onFailure { refreshKeepCollaborationInvites() }
        }
    }

    fun declineKeepCollaborationInvite(inviteId: String) {
        val workspace = mutableState.value.workspace ?: return
        mutableState.update { it.copy(keepCollaborationInvites = it.keepCollaborationInvites.filter { i -> i.id != inviteId }) }
        viewModelScope.launch {
            runCatching { repository.declineKeepCollaborationInvite(workspace.id, inviteId) }
                .onFailure { refreshKeepCollaborationInvites() }
        }
    }

    fun uploadKeepNoteImage(
        note: StudioKeepNote,
        bytes: ByteArray,
        contentType: String,
        fileName: String
    ) {
        val workspace = mutableState.value.workspace ?: return
        val uid = mutableState.value.user?.uid ?: return
        viewModelScope.launch {
            runCatching {
                val url = repository.uploadKeepNoteImage(workspace.id, uid, note.id, bytes, contentType, fileName)
                if (url.isNotBlank()) {
                    repository.saveKeepNote(
                        workspace.id, uid,
                        note.copy(links = note.links + url, updatedAt = java.util.Date())
                    )
                }
            }.onFailure { e ->
                mutableState.update { it.copy(errorMessage = e.message ?: "Could not upload image.") }
            }
        }
    }

    fun openActivityNotification(notification: StudioActivityNotification) {
        markActivityNotificationRead(notification.id)
        val threadId = notification.threadId.trim()
        val ticketId = notification.ticketId.trim()
        val orderId = notification.orderId.trim()
        val route = notification.route.trim().lowercase()
        when {
            route == "messagethread" || threadId.isNotEmpty() -> {
                if (threadId.isNotEmpty()) selectMessageThread(threadId)
                mutableState.update { it.copy(pendingActivityNavigation = PendingActivityNavigation.Messages) }
            }
            route == "supportticket" || ticketId.isNotEmpty() -> {
                mutableState.update {
                    it.copy(
                        pendingActivityNavigation = PendingActivityNavigation.Support(
                            ticketId = ticketId,
                            ticketType = notification.ticketType.ifBlank { "workspace" }
                        )
                    )
                }
            }
            route == "order" || orderId.isNotEmpty() -> {
                mutableState.update { it.copy(pendingActivityNavigation = PendingActivityNavigation.Orders) }
            }
        }
    }

    fun consumePendingActivityNavigation() {
        mutableState.update { it.copy(pendingActivityNavigation = null) }
    }

    fun saveMessageWorkspaceSettings(settings: StudioMessageWorkspaceSettings) {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            mutableState.update {
                it.copy(
                    isSavingMessageWorkspaceSettings = true,
                    messageWorkspaceSettings = settings,
                    messageWorkspaceSettingsStatus = ""
                )
            }
            runCatching { repository.setMessageWorkspaceSettings(workspace, settings) }
                .onSuccess {
                    mutableState.update {
                        it.copy(
                            isSavingMessageWorkspaceSettings = false,
                            messageWorkspaceSettingsStatus = "Message settings saved."
                        )
                    }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(
                            isSavingMessageWorkspaceSettings = false,
                            messageWorkspaceSettingsStatus = "Error: ${error.message ?: "Could not save."}"
                        )
                    }
                }
        }
    }

    fun reloadMessageWorkspaceSettings() {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            runCatching { repository.getMessageWorkspaceSettings(workspace) }
                .onSuccess { settings ->
                    mutableState.update { it.copy(messageWorkspaceSettings = settings, messageWorkspaceSettingsStatus = "") }
                }
        }
    }

    fun setThreadMute(threadId: String, mode: String) {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            runCatching { repository.setMessageThreadMute(workspace, threadId, mode) }
                .onFailure { error ->
                    mutableState.update { it.copy(messageError = error.message ?: "Could not change mute.") }
                }
        }
    }

    fun markMessageThreadRead(threadId: String) {
        val workspace = mutableState.value.workspace ?: return
        val clean = threadId.trim()
        if (clean.isBlank()) return
        viewModelScope.launch {
            runCatching { repository.markMessageThreadRead(workspace, clean) }
        }
    }

    fun setReplyingToMessage(message: StudioMessageItem?) {
        mutableState.update { it.copy(replyingToMessage = message) }
    }

    fun sendMessage(text: String, mentionedUids: List<String> = emptyList()) {
        val workspace = mutableState.value.workspace ?: return
        val user = mutableState.value.user ?: return
        val threadId = mutableState.value.selectedMessageThreadId
        if (threadId.isBlank()) return
        val replyId = mutableState.value.replyingToMessage?.id.orEmpty()
        viewModelScope.launch {
            mutableState.update { it.copy(isSendingMessage = true, messageError = "") }
            runCatching {
                repository.sendThreadMessage(
                    workspace = workspace,
                    user = user,
                    threadId = threadId,
                    text = text,
                    replyToMessageId = replyId,
                    mentionedUids = mentionedUids
                )
            }
                .onSuccess {
                    mutableState.update {
                        it.copy(isSendingMessage = false, replyingToMessage = null, messageError = "")
                    }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(isSendingMessage = false, messageError = error.message ?: "Could not send message.")
                    }
                }
        }
    }

    fun sendMessageWithAttachment(
        bytes: ByteArray,
        fileName: String,
        contentType: String,
        text: String = "",
        mentionedUids: List<String> = emptyList()
    ) {
        val workspace = mutableState.value.workspace ?: return
        val user = mutableState.value.user ?: return
        val threadId = mutableState.value.selectedMessageThreadId
        if (threadId.isBlank()) return
        val replyId = mutableState.value.replyingToMessage?.id.orEmpty()
        viewModelScope.launch {
            mutableState.update { it.copy(isSendingMessage = true, messageError = "") }
            runCatching {
                repository.uploadMessageFileAndSend(
                    workspace = workspace,
                    user = user,
                    threadId = threadId,
                    bytes = bytes,
                    fileName = fileName,
                    contentType = contentType,
                    text = text,
                    replyToMessageId = replyId,
                    mentionedUids = mentionedUids
                )
            }
                .onSuccess {
                    mutableState.update {
                        it.copy(isSendingMessage = false, replyingToMessage = null, messageError = "")
                    }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(isSendingMessage = false, messageError = error.message ?: "Could not send attachment.")
                    }
                }
        }
    }

    fun toggleReaction(messageId: String, emoji: String) {
        val workspace = mutableState.value.workspace ?: return
        val user = mutableState.value.user ?: return
        val threadId = mutableState.value.selectedMessageThreadId
        if (threadId.isBlank() || messageId.isBlank() || emoji.isBlank()) return
        viewModelScope.launch {
            runCatching { repository.toggleMessageReaction(workspace, user, threadId, messageId, emoji) }
                .onFailure { error ->
                    mutableState.update { it.copy(messageError = error.message ?: "Could not react.") }
                }
        }
    }

    fun togglePin(messageId: String, currentlyPinned: Boolean) {
        val workspace = mutableState.value.workspace ?: return
        val threadId = mutableState.value.selectedMessageThreadId
        if (threadId.isBlank() || messageId.isBlank()) return
        viewModelScope.launch {
            runCatching {
                if (currentlyPinned) repository.unpinMessageInThread(workspace, threadId, messageId)
                else repository.pinMessageInThread(workspace, threadId, messageId)
            }
                .onFailure { error ->
                    mutableState.update { it.copy(messageError = error.message ?: "Could not pin message.") }
                }
        }
    }

    fun editMessage(messageId: String, newText: String) {
        val workspace = mutableState.value.workspace ?: return
        val threadId = mutableState.value.selectedMessageThreadId
        if (threadId.isBlank() || messageId.isBlank()) return
        viewModelScope.launch {
            runCatching { repository.editThreadMessage(workspace, threadId, messageId, newText) }
                .onFailure { error ->
                    mutableState.update { it.copy(messageError = error.message ?: "Could not edit message.") }
                }
        }
    }

    fun deleteMessageForMe(messageId: String) {
        val workspace = mutableState.value.workspace ?: return
        val threadId = mutableState.value.selectedMessageThreadId
        if (threadId.isBlank() || messageId.isBlank()) return
        viewModelScope.launch {
            runCatching { repository.deleteMessageForMe(workspace, threadId, messageId) }
                .onFailure { error ->
                    mutableState.update { it.copy(messageError = error.message ?: "Could not delete message.") }
                }
        }
    }

    fun deleteMessageForEveryone(messageId: String) {
        val workspace = mutableState.value.workspace ?: return
        val threadId = mutableState.value.selectedMessageThreadId
        if (threadId.isBlank() || messageId.isBlank()) return
        viewModelScope.launch {
            runCatching { repository.deleteMessageForEveryone(workspace, threadId, messageId) }
                .onFailure { error ->
                    mutableState.update { it.copy(messageError = error.message ?: "Could not delete message.") }
                }
        }
    }

    private fun observeWorkspace(workspace: StudioWorkspace, user: FirebaseUser) {
        ordersJob?.cancel()
        bankFeedJob?.cancel()
        customersJob?.cancel()
        teamJob?.cancel()
        joinRequestsJob?.cancel()
        settingsJob?.cancel()
        messageThreadsJob?.cancel()
        messageItemsJob?.cancel()
        messageTeamMembersJob?.cancel()
        val savedFromPrefs = loadSavedMessages(workspace.id, user.uid)
        val archivedFromPrefs = loadArchivedMarkers(workspace.id, user.uid)
        val dismissedFromPrefs = loadDismissedNotifs(workspace.id, user.uid)
        mutableState.update {
            it.copy(
                messageThreads = emptyList(),
                messageTeamMembers = emptyList(),
                selectedMessageThreadId = "",
                messageItemsByThreadId = emptyMap(),
                messageUnreadCount = 0,
                savedMessageIdsByThreadId = savedFromPrefs,
                archivedThreadMarkers = archivedFromPrefs,
                dismissedActivityNotificationIds = dismissedFromPrefs,
                messageError = ""
            )
        }
        if (workspace.billingPlan == StudioBillingPlan.TeamMonthly) {
            messageThreadsJob = viewModelScope.launch {
                repository.messageThreadsFlow(workspace, user.uid)
                .catch { error ->
                    mutableState.update { it.copy(messageError = error.message ?: "Could not load messages.") }
                }
                .collect { threads ->
                    val previousSelected = mutableState.value.selectedMessageThreadId
                    val nextSelected = when {
                        previousSelected.isNotBlank() && threads.any { it.id == previousSelected } -> previousSelected
                        else -> threads.firstOrNull { it.id == "team" }?.id ?: threads.firstOrNull()?.id.orEmpty()
                    }
                    mutableState.update { current ->
                        current.copy(
                            messageThreads = threads,
                            messageUnreadCount = threads.count { it.isUnread },
                            selectedMessageThreadId = nextSelected
                        )
                    }
                    if (nextSelected.isNotBlank() && (nextSelected != previousSelected || messageItemsJob == null)) {
                        startMessageItemsListener(workspace.id, user.uid, nextSelected)
                        markMessageThreadRead(nextSelected)
                    }
                }
        }
        messageTeamMembersJob = viewModelScope.launch {
            runCatching { repository.loadMessageTeamMembers(workspace) }
                .onSuccess { members ->
                    mutableState.update { it.copy(messageTeamMembers = members) }
                }
        }
            viewModelScope.launch {
                runCatching { repository.getMessageWorkspaceSettings(workspace) }
                    .onSuccess { settings ->
                        mutableState.update { it.copy(messageWorkspaceSettings = settings) }
                    }
            }
        }
        activityNotificationsJob = viewModelScope.launch {
            repository.activityNotificationsFlow(workspace, user.uid, user.email.orEmpty())
                .catch { }
                .collect { items ->
                    val uid = user.uid
                    val email = user.email.orEmpty().lowercase()
                    mutableState.update { current ->
                        // Merge optimistic local readBy entries with server data so a recent
                        // mark-all-read doesn't get reverted by a stale snapshot that arrives
                        // before the Cloud Function has finished writing.
                        val prevById = current.activityNotifications.associateBy { it.id }
                        val merged = items.map { incoming ->
                            val prev = prevById[incoming.id] ?: return@map incoming
                            val mergedRead = incoming.readBy.toMutableMap()
                            prev.readBy[uid]?.let { d -> if (mergedRead[uid] == null) mergedRead[uid] = d }
                            if (email.isNotEmpty()) {
                                prev.readBy[email]?.let { d -> if (mergedRead[email] == null) mergedRead[email] = d }
                            }
                            incoming.copy(readBy = mergedRead)
                        }
                        val visible = merged.filter { !current.dismissedActivityNotificationIds.contains(it.id) }
                        val unread = visible.count { it.isUnread(uid, email) && !it.isDismissed(uid, email) }
                        current.copy(
                            activityNotifications = merged,
                            activityNotificationUnreadCount = unread
                        )
                    }
                }
        }
        keepNotesJob = viewModelScope.launch {
            repository.keepNotesFlow(workspace.id, user.uid)
                .catch { }
                .collect { items ->
                    mutableState.update { it.copy(keepNotes = items) }
                    publishNotesWidget(items)
                }
        }
        viewModelScope.launch {
            while (true) {
                runCatching { repository.listKeepCollaborationInvites(workspace.id) }
                    .onSuccess { items -> mutableState.update { it.copy(keepCollaborationInvites = items) } }
                kotlinx.coroutines.delay(20_000)
            }
        }
        settingsJob = viewModelScope.launch {
            repository.workspaceSettingsFlow(workspace.id, user.uid, workspace.ownerUid, workspace.role)
                .catch { error ->
                    mutableState.update { it.copy(errorMessage = error.message ?: "Could not load workspace settings.") }
                }
                .collect { settings ->
                    mutableState.update { it.copy(workspaceSettings = settings) }
                    // Currency/language/expense-heading changes must reach the widgets too.
                    publishWidgetSummary()
                }
        }
        ordersJob = viewModelScope.launch {
            repository.ordersFlow(workspace, user)
                .catch { error ->
                    mutableState.update {
                        it.copy(errorMessage = error.message ?: "Could not load projects.", orders = emptyList())
                    }
                }
                .collect { orders ->
                    // Split active vs trashed so every consumer of `orders` excludes
                    // soft-deleted orders automatically; the Trash view uses deletedOrders.
                    val active = orders.filter { !it.isDeleted }
                    val deleted = orders.filter { it.isDeleted }.sortedByDescending { it.deletedAt?.time ?: 0L }
                    mutableState.update { it.copy(orders = active, deletedOrders = deleted, errorMessage = "") }
                    publishWidgetSummary()
                }
        }
        customersJob = viewModelScope.launch {
            repository.customersFlow(workspace)
                .catch { /* customer directory is best-effort; ignore listener errors */ }
                .collect { customers ->
                    mutableState.update { it.copy(customers = customers) }
                }
        }
        if (workspace.canViewBankFeed) {
            // Bank feed reads are owner-or-granted at the rules level; subscribe only then.
            bankFeedJob = viewModelScope.launch {
                kotlinx.coroutines.flow.combine(
                    kotlinx.coroutines.flow.combine(
                        repository.bankTransactionsFlow(workspace.id),
                        repository.bankConnectionsFlow(workspace.id),
                        repository.bankRulesFlow(workspace.id),
                        repository.bankWaitingReceiptsFlow(workspace.id),
                        repository.bankCategoryTaxFlow(workspace.id)
                    ) { transactions, connections, rules, waiting, categoryTax ->
                        BankFeedBundle(transactions, connections, rules, waiting, categoryTax)
                    },
                    repository.bankVendorsFlow(workspace.id),
                    repository.bankCategoriesFlow(workspace.id)
                ) { bundle, vendors, customCategories ->
                    bundle.copy(vendors = vendors, customCategories = customCategories)
                }
                    .catch { }
                    .collect { bundle ->
                        mutableState.update {
                            it.copy(
                                bankTransactions = bundle.transactions,
                                bankConnections = bundle.connections,
                                bankRules = bundle.rules,
                                bankWaitingReceipts = bundle.waiting,
                                bankCategoryTax = bundle.categoryTax,
                                bankVendors = bundle.vendors,
                                bankCustomCategories = bundle.customCategories
                            )
                        }
                    }
            }
        } else {
            mutableState.update {
                it.copy(
                    bankTransactions = emptyList(), bankConnections = emptyList(), bankRules = emptyList(),
                    bankWaitingReceipts = emptyList(), bankVendors = emptyList(), bankCustomCategories = emptyList(),
                    bankCategoryTax = uk.co.eggcraft.studioflow.data.model.BANK_DEFAULT_CATEGORY_TAX
                )
            }
        }
        if (workspace.isOwner) {
            teamJob = viewModelScope.launch {
                repository.teamAccessFlow(workspace.id)
                    .catch { error ->
                        mutableState.update { it.copy(errorMessage = error.message ?: "Could not load team members.") }
                    }
                    .collect { snapshot ->
                        mutableState.update { it.copy(teamMembers = snapshot.members, customRoles = snapshot.customRoles) }
                    }
            }
            joinRequestsJob = viewModelScope.launch {
                repository.joinRequestsFlow(workspace)
                    .catch { error ->
                        mutableState.update { it.copy(errorMessage = error.message ?: "Could not load join requests.") }
                    }
                    .collect { requests ->
                        mutableState.update { it.copy(joinRequests = requests) }
                    }
            }
        } else {
            // Members can switch workspaces and use their assigned tools, but Owner-only
            // management collections must not be subscribed to in the background.
            mutableState.update {
                it.copy(teamMembers = emptyList(), customRoles = emptyList(), joinRequests = emptyList())
            }
        }
    }
}
