package uk.co.eggcraft.studioflow.features.shell

import android.app.Application
import android.content.Context
import android.content.SharedPreferences
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseUser
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uk.co.eggcraft.studioflow.data.firebase.StudioFlowRepository
import uk.co.eggcraft.studioflow.data.model.StudioActivityNotification
import uk.co.eggcraft.studioflow.services.StudioMessageRouteHolder
import uk.co.eggcraft.studioflow.data.model.StudioBillingPlan
import uk.co.eggcraft.studioflow.data.model.StudioCustomRole
import uk.co.eggcraft.studioflow.data.model.StudioJoinRequest
import kotlinx.coroutines.delay
import uk.co.eggcraft.studioflow.data.model.StudioMessageItem
import uk.co.eggcraft.studioflow.data.model.StudioMessageTeamMember
import uk.co.eggcraft.studioflow.data.model.StudioMessageThread
import uk.co.eggcraft.studioflow.data.model.StudioMessageTypingUser
import uk.co.eggcraft.studioflow.data.model.StudioOrder
import uk.co.eggcraft.studioflow.data.model.StudioTeamMember
import uk.co.eggcraft.studioflow.data.model.StudioWorkspace
import uk.co.eggcraft.studioflow.data.model.StudioWorkspaceSettings
import uk.co.eggcraft.studioflow.data.model.WorkspaceMemberAccess

data class StudioFlowUiState(
    val loading: Boolean = true,
    val signingIn: Boolean = false,
    val creatingOrder: Boolean = false,
    val settingsSaving: Boolean = false,
    val user: FirebaseUser? = null,
    val workspace: StudioWorkspace? = null,
    val workspaceSettings: StudioWorkspaceSettings = StudioWorkspaceSettings(),
    val orders: List<StudioOrder> = emptyList(),
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
    val messageError: String = "",
    val activityNotifications: List<StudioActivityNotification> = emptyList(),
    val activityNotificationUnreadCount: Int = 0,
    val activityNotificationSearch: String = "",
    val activityNotificationReadFilter: String = "all",
    val activityNotificationTypeFilter: String = "all",
    val dismissedActivityNotificationIds: Set<String> = emptySet(),
    val errorMessage: String = "",
    val settingsMessage: String = ""
)

class StudioFlowViewModel @JvmOverloads constructor(
    application: Application,
    private val repository: StudioFlowRepository = StudioFlowRepository()
) : AndroidViewModel(application) {
    private val mutableState = MutableStateFlow(StudioFlowUiState())
    private val draftPrefs: SharedPreferences =
        application.getSharedPreferences("studio_message_drafts", Context.MODE_PRIVATE)

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

    val state: StateFlow<StudioFlowUiState> = mutableState.asStateFlow()
    private var workspaceJob: Job? = null
    private var ordersJob: Job? = null
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

    init {
        viewModelScope.launch {
            repository.authState().collect { user ->
                workspaceJob?.cancel()
                ordersJob?.cancel()
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
                if (user == null) {
                    StudioMessageRouteHolder.clearCurrentCompanyId()
                    mutableState.value = StudioFlowUiState(loading = false)
                } else {
                    mutableState.update { it.copy(loading = true, user = user, errorMessage = "") }
                    loadWorkspace(user)
                }
            }
        }
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

    fun signOut() {
        repository.signOut()
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

    fun deleteOrder(order: StudioOrder) {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            mutableState.update { it.copy(errorMessage = "", settingsMessage = "") }
            runCatching { repository.deleteOrder(workspace, order) }
                .onSuccess {
                    mutableState.update { it.copy(settingsMessage = "Order deleted.") }
                }
                .onFailure { error ->
                    mutableState.update { it.copy(errorMessage = error.message ?: "Could not delete this order.") }
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
        viewModelScope.launch {
            mutableState.update { it.copy(settingsSaving = true, errorMessage = "", settingsMessage = "") }
            runCatching { repository.updateWorkspaceSettings(workspace, updates) }
                .onSuccess {
                    mutableState.update { it.copy(settingsSaving = false, settingsMessage = successMessage) }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(settingsSaving = false, errorMessage = error.message ?: "Could not save settings.")
                    }
                }
        }
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

    fun importBackup(rawJson: String) {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            mutableState.update { it.copy(settingsSaving = true, errorMessage = "", settingsMessage = "") }
            runCatching { repository.importBackup(workspace, rawJson) }
                .onSuccess { count ->
                    mutableState.update { it.copy(settingsSaving = false, settingsMessage = "Imported $count orders.") }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(settingsSaving = false, errorMessage = error.message ?: "Could not import backup.")
                    }
                }
        }
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

    private fun loadWorkspace(user: FirebaseUser) {
        workspaceJob = viewModelScope.launch {
            runCatching { repository.loadWorkspace(user) }
                .onSuccess { workspace ->
                    mutableState.update {
                        it.copy(loading = false, workspace = workspace, errorMessage = "")
                    }
                    StudioMessageRouteHolder.setCurrentCompanyId(getApplication(), workspace.id)
                    observeWorkspace(workspace, user)
                    observePendingThreadRoute()
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(loading = false, errorMessage = error.message ?: "Could not load workspace.")
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
        mutableState.update { current ->
            val markers = current.archivedThreadMarkers.toMutableMap()
            if (markers.containsKey(clean)) markers.remove(clean)
            else markers[clean] = System.currentTimeMillis()
            current.copy(archivedThreadMarkers = markers)
        }
    }

    fun toggleSavedMessage(threadId: String, messageId: String) {
        val ct = threadId.trim()
        val cm = messageId.trim()
        if (ct.isBlank() || cm.isBlank()) return
        mutableState.update { current ->
            val map = current.savedMessageIdsByThreadId.toMutableMap()
            val set = (map[ct] ?: emptySet()).toMutableSet()
            if (set.contains(cm)) set.remove(cm) else set.add(cm)
            map[ct] = set
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
        if (notificationId.isBlank()) return
        viewModelScope.launch {
            runCatching { repository.markActivityNotificationRead(workspace, notificationId) }
        }
    }

    fun markAllActivityNotificationsRead() {
        val workspace = mutableState.value.workspace ?: return
        viewModelScope.launch {
            runCatching { repository.markAllActivityNotificationsRead(workspace) }
        }
    }

    fun dismissActivityNotifications(notificationIds: List<String>) {
        val workspace = mutableState.value.workspace ?: return
        val clean = notificationIds.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
        if (clean.isEmpty()) return
        mutableState.update { it.copy(dismissedActivityNotificationIds = it.dismissedActivityNotificationIds + clean) }
        viewModelScope.launch {
            runCatching { repository.dismissActivityNotifications(workspace, clean) }
        }
    }

    fun openActivityNotification(notification: StudioActivityNotification) {
        markActivityNotificationRead(notification.id)
        if (notification.threadId.isNotBlank()) {
            selectMessageThread(notification.threadId)
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
        teamJob?.cancel()
        joinRequestsJob?.cancel()
        settingsJob?.cancel()
        messageThreadsJob?.cancel()
        messageItemsJob?.cancel()
        messageTeamMembersJob?.cancel()
        mutableState.update {
            it.copy(
                messageThreads = emptyList(),
                messageTeamMembers = emptyList(),
                selectedMessageThreadId = "",
                messageItemsByThreadId = emptyMap(),
                messageUnreadCount = 0,
                messageError = ""
            )
        }
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
        activityNotificationsJob = viewModelScope.launch {
            repository.activityNotificationsFlow(workspace, user.uid, user.email.orEmpty())
                .catch { }
                .collect { items ->
                    val uid = user.uid
                    val email = user.email.orEmpty()
                    mutableState.update { current ->
                        val visible = items.filter { !current.dismissedActivityNotificationIds.contains(it.id) }
                        val unread = visible.count { it.isUnread(uid, email) && !it.isDismissed(uid, email) }
                        current.copy(
                            activityNotifications = items,
                            activityNotificationUnreadCount = unread
                        )
                    }
                }
        }
        settingsJob = viewModelScope.launch {
            repository.workspaceSettingsFlow(workspace.id, user.uid, workspace.ownerUid)
                .catch { error ->
                    mutableState.update { it.copy(errorMessage = error.message ?: "Could not load workspace settings.") }
                }
                .collect { settings ->
                    mutableState.update { it.copy(workspaceSettings = settings) }
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
                    mutableState.update { it.copy(orders = orders, errorMessage = "") }
                }
        }
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
    }
}
