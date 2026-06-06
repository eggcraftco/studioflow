package uk.co.eggcraft.studioflow.features.shell

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.launch
import uk.co.eggcraft.studioflow.R
import uk.co.eggcraft.studioflow.features.auth.LoginScreen
import uk.co.eggcraft.studioflow.ui.theme.StudioBlue

private const val LocalSecurityPrefs = "studioflow_android_local_security"
private const val RequireLocalUnlockKey = "studioflow_require_local_unlock"

// Set by MainActivity.onUserLeaveHint() when the user genuinely leaves the app
// (home / recents / call). It is NOT set when we launch an in-app activity such as
// the file picker, so returning from a picker no longer triggers the lock screen.
object AppLockGuard {
    @Volatile
    var userLeft: Boolean = false

    // Set to true right before we intentionally launch an in-app activity (file
    // picker, image picker, external open, etc.). The very next background event
    // will be skipped so returning from that activity does not show the lock.
    @Volatile
    var suppressNextLock: Boolean = false

    fun suppressNextLockOnce() {
        suppressNextLock = true
    }
}

@Composable
fun StudioFlowApp(
    viewModel: StudioFlowViewModel = viewModel()
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    uk.co.eggcraft.studioflow.ui.theme.StudioFlowTheme(appTheme = state.workspaceSettings.appTheme) {
        androidx.compose.runtime.CompositionLocalProvider(
            uk.co.eggcraft.studioflow.language.LocalStudioLanguage provides state.workspaceSettings.selectedLanguage.ifBlank { "English" }
        ) {
            StudioFlowAppContent(viewModel = viewModel, state = state)
        }
    }
}

@Composable
private fun StudioFlowAppContent(
    viewModel: StudioFlowViewModel,
    state: uk.co.eggcraft.studioflow.features.shell.StudioFlowUiState
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val coroutineScope = rememberCoroutineScope()
    val credentialManager = remember(context) { CredentialManager.create(context) }
    val securityPrefs = remember(context) {
        context.getSharedPreferences(LocalSecurityPrefs, Context.MODE_PRIVATE)
    }
    var requireDeviceUnlock by rememberSaveable {
        mutableStateOf(securityPrefs.getBoolean(RequireLocalUnlockKey, true))
    }
    var localUnlockSatisfied by rememberSaveable { mutableStateOf(true) }
    var localUnlockMessage by rememberSaveable { mutableStateOf("") }
    var signInWasInteractive by rememberSaveable { mutableStateOf(false) }
    val unlockLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            localUnlockSatisfied = true
            localUnlockMessage = ""
        } else {
            localUnlockMessage = "Could not unlock NivaDesk. Use your device screen lock to continue."
        }
    }

    fun requestLocalUnlock() {
        val activity = context.findActivity() as? androidx.fragment.app.FragmentActivity
        if (activity == null) {
            // Fallback to legacy keyguard if not a FragmentActivity (shouldn't happen — MainActivity should be one).
            val keyguardManager = context.getSystemService(KeyguardManager::class.java)
            if (keyguardManager?.isDeviceSecure == true) {
                val intent = keyguardManager.createConfirmDeviceCredentialIntent("Unlock NivaDesk", "Use device screen lock to continue.")
                if (intent != null) {
                    unlockLauncher.launch(intent)
                    return
                }
            }
            localUnlockSatisfied = true
            return
        }

        val biometricManager = androidx.biometric.BiometricManager.from(context)
        // Try the strongest combination first: STRONG + WEAK + DEVICE_CREDENTIAL (covers face, fingerprint, PIN).
        val allowedAll = androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG or
            androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK or
            androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
        val allowedBiometric = androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG or
            androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK

        val (authenticators, allowDeviceCredentialSeparately) = when {
            biometricManager.canAuthenticate(allowedAll) == androidx.biometric.BiometricManager.BIOMETRIC_SUCCESS -> allowedAll to false
            biometricManager.canAuthenticate(allowedBiometric) == androidx.biometric.BiometricManager.BIOMETRIC_SUCCESS -> allowedBiometric to true
            else -> androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL to false
        }

        val executor = androidx.core.content.ContextCompat.getMainExecutor(context)
        val prompt = androidx.biometric.BiometricPrompt(
            activity, executor,
            object : androidx.biometric.BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: androidx.biometric.BiometricPrompt.AuthenticationResult) {
                    localUnlockSatisfied = true
                    localUnlockMessage = ""
                }
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    if (errorCode == androidx.biometric.BiometricPrompt.ERROR_NEGATIVE_BUTTON ||
                        errorCode == androidx.biometric.BiometricPrompt.ERROR_USER_CANCELED ||
                        errorCode == androidx.biometric.BiometricPrompt.ERROR_CANCELED) {
                        localUnlockMessage = "Unlock cancelled."
                    } else {
                        localUnlockMessage = errString.toString()
                    }
                }
            }
        )

        val builder = androidx.biometric.BiometricPrompt.PromptInfo.Builder()
            .setTitle("Unlock NivaDesk")
            .setSubtitle("Use fingerprint, face unlock or your device screen lock to continue.")
            .setAllowedAuthenticators(authenticators)
        if (allowDeviceCredentialSeparately) {
            builder.setNegativeButtonText("Use screen lock")
        }
        runCatching { prompt.authenticate(builder.build()) }
            .onFailure {
                localUnlockMessage = it.message ?: "Could not start biometric prompt."
            }
    }

    fun startGoogleSignIn() {
        coroutineScope.launch {
            viewModel.beginExternalSignIn()
            val tokenResult = runCatching {
                requestGoogleIdToken(context, credentialManager, filterAuthorizedAccounts = true)
            }.recoverCatching { error ->
                if (error.isNoCredentialFailure()) {
                    requestGoogleIdToken(context, credentialManager, filterAuthorizedAccounts = false)
                } else {
                    throw error
                }
            }.recoverCatching { error ->
                if (error.isNoCredentialFailure()) {
                    requestSignInWithGoogleIdToken(context, credentialManager)
                } else {
                    throw error
                }
            }

            tokenResult
                .onSuccess { idToken -> viewModel.signInWithGoogleIdToken(idToken) }
                .onFailure { error ->
                    val message = when (error) {
                        is GetCredentialCancellationException -> "Google Sign-In was cancelled."
                        is NoCredentialException -> "No Google account is available on this Android device. Add a Google account in Android Settings, then try again."
                        else -> error.message ?: "Could not sign in with Google."
                    }
                    viewModel.failExternalSignIn(message)
                }
        }
    }

    LaunchedEffect(state.signingIn) {
        if (state.signingIn) {
            signInWasInteractive = true
        }
    }

    LaunchedEffect(state.workspace?.id, state.workspace?.role) {
        viewModel.refreshPersonalInterfaceSettings()
    }

    LaunchedEffect(state.user?.uid, requireDeviceUnlock) {
        when {
            state.user == null -> {
                localUnlockSatisfied = true
                localUnlockMessage = ""
                signInWasInteractive = false
            }
            !requireDeviceUnlock -> {
                localUnlockSatisfied = true
                localUnlockMessage = ""
            }
            signInWasInteractive -> {
                localUnlockSatisfied = true
                localUnlockMessage = ""
                signInWasInteractive = false
            }
            else -> {
                localUnlockSatisfied = false
                localUnlockMessage = ""
            }
        }
    }

    DisposableEffect(lifecycleOwner, state.user?.uid, requireDeviceUnlock) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                viewModel.refreshPersonalInterfaceSettings()
            }
            if (event == Lifecycle.Event.ON_STOP && state.user != null && requireDeviceUnlock) {
                // Only re-lock when the user actually left the app (home/recents/call)
                // or the screen turned off — NOT when we opened an in-app activity such
                // as the file picker (which would otherwise lock on every file add).
                val powerManager = context.getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
                val screenOff = powerManager?.isInteractive == false
                val suppress = AppLockGuard.suppressNextLock
                AppLockGuard.suppressNextLock = false
                if (!suppress && (AppLockGuard.userLeft || screenOff)) {
                    localUnlockSatisfied = false
                    localUnlockMessage = ""
                }
                AppLockGuard.userLeft = false
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    when {
        state.loading -> StudioLoadingScreen()
        state.user == null -> LoginScreen(
            signingIn = state.signingIn,
            errorMessage = state.errorMessage,
            onSignIn = viewModel::signIn,
            onGoogleSignIn = { startGoogleSignIn() }
        )
        requireDeviceUnlock && !localUnlockSatisfied -> LocalUnlockScreen(
            message = localUnlockMessage,
            onUnlock = { requestLocalUnlock() },
            onSignOut = viewModel::signOut
        )
        else -> StudioFlowMainScreen(
            state = state,
            requireDeviceUnlock = requireDeviceUnlock,
            onSetRequireDeviceUnlock = { enabled ->
                requireDeviceUnlock = enabled
                securityPrefs.edit().putBoolean(RequireLocalUnlockKey, enabled).apply()
                if (!enabled) {
                    localUnlockSatisfied = true
                }
            },
            onSignOut = viewModel::signOut,
            onCreateOrder = viewModel::createOrder,
            onAssignOrder = viewModel::assignOrder,
            onUpdateOrderFields = viewModel::updateOrderFields,
            onSaveOrderCardLayout = viewModel::saveOrderCardLayout,
            onResetOrderCardLayout = viewModel::resetOrderCardLayout,
            onUploadClientFile = viewModel::uploadClientFile,
            onUploadPreviewImage = viewModel::uploadPreviewImage,
            onRefreshLiveTracking = viewModel::refreshLiveTracking,
            onRenameClientFile = viewModel::renameClientFile,
            onDeleteClientFile = viewModel::deleteClientFile,
            onDeleteOrder = viewModel::deleteOrder,
            onUpdateWorkspaceSettings = viewModel::updateWorkspaceSettings,
            onUpdateWorkspaceBillingPlan = viewModel::updateWorkspaceBillingPlan,
            googlePlanOffers = viewModel.googlePlanOffers.collectAsStateWithLifecycle().value,
            googleBillingPurchasing = viewModel.googleBillingPurchasing.collectAsStateWithLifecycle().value,
            onLoadGooglePlayProducts = viewModel::loadGooglePlayProducts,
            onPurchaseGooglePlan = viewModel::purchaseGooglePlan,
            onRestoreGooglePlayPurchases = viewModel::restoreGooglePlayPurchases,
            onRecalculateFinancialSettings = viewModel::saveAndRecalculateFinancialSettings,
            onUpdateAccountProfile = viewModel::updateAccountProfile,
            onUploadAccountAvatar = viewModel::uploadAccountAvatar,
            onRemoveAccountAvatar = viewModel::removeAccountAvatar,
            onUploadWorkspaceLogo = viewModel::uploadWorkspaceLogo,
            onRemoveWorkspaceLogo = viewModel::removeWorkspaceLogo,
            onChangeAccountEmail = viewModel::changeAccountEmail,
            onSendPasswordResetEmail = viewModel::sendPasswordResetEmail,
            onRequestWorkspaceAccess = viewModel::requestWorkspaceAccess,
            onSwitchWorkspace = viewModel::switchWorkspace,
            onApproveJoinRequest = viewModel::approveJoinRequest,
            onDeclineJoinRequest = viewModel::declineJoinRequest,
            onUpdateTeamMemberRole = viewModel::updateTeamMemberRole,
            onUpdateTeamMemberAccess = viewModel::updateTeamMemberAccess,
            onRemoveTeamMember = viewModel::removeTeamMember,
            onSaveCustomRole = viewModel::saveCustomRole,
            onDeleteCustomRole = viewModel::deleteCustomRole,
            onImportBackup = viewModel::importBackup,
            onDeleteWorkspaceData = viewModel::deleteWorkspaceData,
            onSelectMessageThread = viewModel::selectMessageThread,
            onMarkMessageThreadRead = viewModel::markMessageThreadRead,
            onSendMessage = viewModel::sendMessage,
            onSendMessageWithAttachment = viewModel::sendMessageWithAttachment,
            onEditMessage = viewModel::editMessage,
            onDeleteMessageForMe = viewModel::deleteMessageForMe,
            onDeleteMessageForEveryone = viewModel::deleteMessageForEveryone,
            onToggleReaction = viewModel::toggleReaction,
            onTogglePin = viewModel::togglePin,
            onSetReplyingToMessage = viewModel::setReplyingToMessage,
            onComposerTextChanged = viewModel::onComposerTextChanged,
            onSetMessageSearchQuery = viewModel::setMessageSearchQuery,
            onSetMessageAttachmentFilter = viewModel::setMessageAttachmentFilter,
            onToggleThreadArchive = viewModel::toggleThreadArchive,
            onToggleSavedMessage = viewModel::toggleSavedMessage,
            onSetForwardingMessage = viewModel::setForwardingMessage,
            onForwardMessageToThread = viewModel::forwardMessageToThread,
            onCreateDirectMessageThread = viewModel::createDirectMessageThread,
            onCreateGroupMessageThread = viewModel::createGroupMessageThread,
            onAddMembersToThread = viewModel::addMembersToThread,
            onRenameThread = viewModel::renameThread,
            onLeaveThread = viewModel::leaveThread,
            onSetThreadMute = viewModel::setThreadMute,
            onLoadDraft = viewModel::loadDraft,
            onSaveDraft = viewModel::saveDraft,
            onSetActivityNotificationSearch = viewModel::setActivityNotificationSearch,
            onSetActivityNotificationReadFilter = viewModel::setActivityNotificationReadFilter,
            onSetActivityNotificationTypeFilter = viewModel::setActivityNotificationTypeFilter,
            onMarkActivityNotificationRead = viewModel::markActivityNotificationRead,
            onMarkAllActivityNotificationsRead = viewModel::markAllActivityNotificationsRead,
            onDismissActivityNotifications = viewModel::dismissActivityNotifications,
            onReviewOrderDeletion = viewModel::reviewWorkflowOrderDeletion,
            onOpenActivityNotification = viewModel::openActivityNotification,
            onSetKeepNotesSearch = viewModel::setKeepNotesSearch,
            onSetKeepNotesSection = viewModel::setKeepNotesSection,
            onSaveKeepNote = viewModel::saveKeepNote,
            onDeleteKeepNote = viewModel::deleteKeepNote,
            onUploadKeepNoteImage = viewModel::uploadKeepNoteImage,
            onInviteKeepCollab = viewModel::inviteKeepNoteCollaborator,
            onRemoveKeepCollab = viewModel::removeKeepNoteCollaborator,
            onAcceptKeepInvite = viewModel::acceptKeepCollaborationInvite,
            onDeclineKeepInvite = viewModel::declineKeepCollaborationInvite,
            onRefreshKeepInvites = viewModel::refreshKeepCollaborationInvites,
            onSaveMessageWorkspaceSettings = viewModel::saveMessageWorkspaceSettings,
            onReloadMessageWorkspaceSettings = viewModel::reloadMessageWorkspaceSettings,
            onConsumePendingActivityNavigation = viewModel::consumePendingActivityNavigation
        )
    }
}

@Composable
private fun LocalUnlockScreen(
    message: String,
    onUnlock: () -> Unit,
    onSignOut: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(28.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                imageVector = Icons.Filled.Lock,
                contentDescription = null,
                tint = StudioBlue,
                modifier = Modifier.size(58.dp)
            )
            Spacer(modifier = Modifier.height(18.dp))
            Text("Unlock NivaDesk", fontSize = 28.sp, fontWeight = FontWeight.ExtraBold)
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                "Use fingerprint, face unlock or your Android screen lock to continue.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                lineHeight = 20.sp
            )
            if (message.isNotBlank()) {
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    message,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    lineHeight = 18.sp
                )
            }
            Spacer(modifier = Modifier.height(22.dp))
            Button(onClick = onUnlock) {
                Icon(Icons.Filled.LockOpen, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Unlock")
            }
            TextButton(onClick = onSignOut) {
                Text("Sign Out")
            }
        }
    }
}

@Composable
private fun StudioLoadingScreen() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center
    ) {
        CircularProgressIndicator()
    }
}

private suspend fun requestGoogleIdToken(
    context: Context,
    credentialManager: CredentialManager,
    filterAuthorizedAccounts: Boolean
): String {
    val activityContext = context.findActivity() ?: context
    val serverClientId = context.getString(R.string.default_web_client_id)
    require(serverClientId.isNotBlank()) { "Google Sign-In is not configured for this Android build." }

    val googleIdOption = GetGoogleIdOption.Builder()
        .setFilterByAuthorizedAccounts(filterAuthorizedAccounts)
        .setServerClientId(serverClientId)
        .setAutoSelectEnabled(filterAuthorizedAccounts)
        .build()
    val request = GetCredentialRequest.Builder()
        .addCredentialOption(googleIdOption)
        .build()
    return extractGoogleIdToken(credentialManager.getCredential(activityContext, request).credential)
}

private suspend fun requestSignInWithGoogleIdToken(
    context: Context,
    credentialManager: CredentialManager
): String {
    val activityContext = context.findActivity() ?: context
    val serverClientId = context.getString(R.string.default_web_client_id)
    require(serverClientId.isNotBlank()) { "Google Sign-In is not configured for this Android build." }

    val googleSignInOption = GetSignInWithGoogleOption.Builder(serverClientId).build()
    val request = GetCredentialRequest.Builder()
        .addCredentialOption(googleSignInOption)
        .build()

    return extractGoogleIdToken(credentialManager.getCredential(activityContext, request).credential)
}

private fun extractGoogleIdToken(credential: androidx.credentials.Credential): String {
    if (credential is CustomCredential &&
        credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
    ) {
        return GoogleIdTokenCredential.createFrom(credential.data).idToken
    }

    error("Google Sign-In returned an unsupported credential.")
}

private fun Throwable.isNoCredentialFailure(): Boolean {
    return this is NoCredentialException || message?.contains("No credentials", ignoreCase = true) == true
}

private tailrec fun Context.findActivity(): Activity? {
    return when (this) {
        is Activity -> this
        is ContextWrapper -> baseContext.findActivity()
        else -> null
    }
}
