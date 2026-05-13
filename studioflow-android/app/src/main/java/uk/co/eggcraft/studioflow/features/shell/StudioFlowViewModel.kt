package uk.co.eggcraft.studioflow.features.shell

import androidx.lifecycle.ViewModel
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
import uk.co.eggcraft.studioflow.data.model.StudioBillingPlan
import uk.co.eggcraft.studioflow.data.model.StudioCustomRole
import uk.co.eggcraft.studioflow.data.model.StudioJoinRequest
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
    val errorMessage: String = "",
    val settingsMessage: String = ""
)

class StudioFlowViewModel(
    private val repository: StudioFlowRepository = StudioFlowRepository()
) : ViewModel() {
    private val mutableState = MutableStateFlow(StudioFlowUiState())
    val state: StateFlow<StudioFlowUiState> = mutableState.asStateFlow()
    private var workspaceJob: Job? = null
    private var ordersJob: Job? = null
    private var teamJob: Job? = null
    private var joinRequestsJob: Job? = null
    private var settingsJob: Job? = null

    init {
        viewModelScope.launch {
            repository.authState().collect { user ->
                workspaceJob?.cancel()
                ordersJob?.cancel()
                teamJob?.cancel()
                joinRequestsJob?.cancel()
                settingsJob?.cancel()
                if (user == null) {
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
                    observeWorkspace(workspace, user)
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(loading = false, errorMessage = error.message ?: "Could not load workspace.")
                    }
                }
        }
    }

    private fun observeWorkspace(workspace: StudioWorkspace, user: FirebaseUser) {
        ordersJob?.cancel()
        teamJob?.cancel()
        joinRequestsJob?.cancel()
        settingsJob?.cancel()
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
