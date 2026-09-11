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
import androidx.compose.ui.platform.testTag
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

internal const val LocalSecurityPrefs = "studioflow_android_local_security"
internal const val RequireLocalUnlockKey = "studioflow_require_local_unlock"
// Per-device auto-lock interval in minutes (0 == Immediately). How long NivaDesk may
// stay in the background before it asks to unlock again on return.
internal const val AutoLockMinutesKey = "studioflow_auto_lock_minutes"
// Shown once per install: this device has no PIN/pattern/password, so App Lock
// has nothing to ask for and opens straight through.
internal const val NoDeviceLockNoticeKey = "studioflow_no_device_lock_notice_shown"

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

    // Mirror of the per-device auto-lock setting (minutes; 0 == Immediately) so the
    // lifecycle observer can read the current value without recomposition.
    @Volatile
    var autoLockMinutes: Int = 1

    // elapsedRealtime() captured when the app last genuinely left the foreground, or
    // 0L when there is no pending background timestamp to evaluate.
    @Volatile
    var backgroundedAt: Long = 0L

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
            uk.co.eggcraft.studioflow.language.LocalStudioLanguage provides state.workspaceSettings.selectedLanguage.ifBlank {
                // No explicit choice yet (first launch / pre-login): follow the
                // device locale instead of hard-coding English.
                uk.co.eggcraft.studioflow.language.deviceDefaultStudioLanguage()
            }
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
    val t: (String) -> String = {
        uk.co.eggcraft.studioflow.language.studioT(it, state.workspaceSettings.selectedLanguage)
    }
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

    val keyguardManager = remember(context) { context.getSystemService(KeyguardManager::class.java) }
    // No PIN, pattern, password or fingerprint on the device: there is nothing to
    // authenticate against, so App Lock must not hold the door — otherwise the only
    // way in is to sign out and re-type the password on every launch.
    fun deviceHasSecureLock(): Boolean = keyguardManager?.isDeviceSecure == true
    fun noteDeviceHasNoLockOnce() {
        if (securityPrefs.getBoolean(NoDeviceLockNoticeKey, false)) return
        securityPrefs.edit().putBoolean(NoDeviceLockNoticeKey, true).apply()
        android.widget.Toast.makeText(
            context,
            t("No screen lock is set on this device, so NivaDesk cannot lock itself."),
            android.widget.Toast.LENGTH_LONG
        ).show()
    }

    fun requestLocalUnlock() {
        if (!deviceHasSecureLock()) {
            localUnlockSatisfied = true
            localUnlockMessage = ""
            noteDeviceHasNoLockOnce()
            return
        }
        val activity = context.findActivity() as? androidx.fragment.app.FragmentActivity
        // Below Android 9 androidx.biometric draws its own FingerprintDialogFragment,
        // an AppCompat AlertDialog that throws on this app's Material theme — and it is
        // posted after authenticate() returns, so no runCatching here can catch it.
        // Those releases get the system keyguard screen instead, which is what they used
        // before BiometricPrompt was wired up at all.
        if (activity == null || android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.P) {
            val intent = keyguardManager?.createConfirmDeviceCredentialIntent("Unlock NivaDesk", "Use device screen lock to continue.")
            if (intent != null) {
                unlockLauncher.launch(intent)
            } else {
                localUnlockSatisfied = true
            }
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

    LaunchedEffect(Unit) {
        AppLockGuard.autoLockMinutes = securityPrefs.getInt(AutoLockMinutesKey, 1)
    }

    LaunchedEffect(state.signingIn) {
        if (state.signingIn) {
            signInWasInteractive = true
        }
    }

    // Anonymous in-app presence heartbeat for the admin "In App Now" counter.
    // Random per-launch session id only — no user identifiers.
    LaunchedEffect(Unit) {
        val sessionId = java.util.UUID.randomUUID().toString().lowercase()
        while (true) {
            if (com.google.firebase.auth.FirebaseAuth.getInstance().currentUser != null) {
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                    runCatching {
                        val url = java.net.URL("https://europe-west2-eggcraft-studio.cloudfunctions.net/recordSiteVisit")
                        val connection = url.openConnection() as java.net.HttpURLConnection
                        connection.requestMethod = "POST"
                        connection.setRequestProperty("Content-Type", "application/json")
                        connection.doOutput = true
                        connection.connectTimeout = 8000
                        connection.readTimeout = 8000
                        val body = """{"kind":"heartbeat","scope":"app","platform":"android","sessionId":"$sessionId","path":""}"""
                        connection.outputStream.use { it.write(body.toByteArray()) }
                        connection.inputStream.close()
                        connection.disconnect()
                    }
                }
            }
            kotlinx.coroutines.delay(30000)
        }
    }

    LaunchedEffect(state.workspace?.id, state.workspace?.role) {
        viewModel.refreshPersonalInterfaceSettings()
    }

    // Android 13+ silently drops every push until the app asks for
    // POST_NOTIFICATIONS. The ask happens here — signed in, workspace loaded and
    // past the lock screen — rather than on a cold start where the dialog arrives
    // before there is anything to be notified about, and at most once per install
    // so a refusal is never nagged. Turning it on later stays where it was: the
    // Notifications tab banner with its "Open Settings" button.
    val notificationPermissionLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        contract = androidx.activity.result.contract.ActivityResultContracts.RequestPermission()
    ) { /* Either answer is final: the Notifications tab banner is the way back. */ }

    LaunchedEffect(state.user?.uid, state.workspace?.id, localUnlockSatisfied) {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.TIRAMISU) return@LaunchedEffect
        if (state.user == null || state.workspace == null || !localUnlockSatisfied) return@LaunchedEffect
        val prefs = context.getSharedPreferences("studioflow_notification_prompt", Context.MODE_PRIVATE)
        if (prefs.getBoolean("asked", false)) return@LaunchedEffect
        val granted = androidx.core.content.ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.POST_NOTIFICATIONS
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        if (granted) return@LaunchedEffect
        prefs.edit().putBoolean("asked", true).apply()
        notificationPermissionLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS)
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
            // A device with no screen lock has no credential to prove anything
            // with, so it is never gated — it is told once instead.
            !deviceHasSecureLock() -> {
                localUnlockSatisfied = true
                localUnlockMessage = ""
                noteDeviceHasNoLockOnce()
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
            if (event == Lifecycle.Event.ON_START && state.user != null && requireDeviceUnlock) {
                // Returning to the foreground: re-lock only if we stayed in the
                // background at least the chosen auto-lock interval (0 == Immediately).
                // A cold launch has no pending timestamp and is locked separately.
                val since = AppLockGuard.backgroundedAt
                if (since != 0L) {
                    val elapsed = android.os.SystemClock.elapsedRealtime() - since
                    if (elapsed >= AppLockGuard.autoLockMinutes.toLong() * 60_000L && deviceHasSecureLock()) {
                        localUnlockSatisfied = false
                        localUnlockMessage = ""
                    }
                    AppLockGuard.backgroundedAt = 0L
                }
            }
            if (event == Lifecycle.Event.ON_STOP && state.user != null && requireDeviceUnlock) {
                // Only arm the auto-lock timer when the user actually left the app
                // (home/recents/call) or the screen turned off — NOT when we opened an
                // in-app activity such as the file picker (which would otherwise lock on
                // every file add). The actual re-lock decision happens on ON_START.
                val powerManager = context.getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
                val screenOff = powerManager?.isInteractive == false
                val suppress = AppLockGuard.suppressNextLock
                AppLockGuard.suppressNextLock = false
                if (!suppress && (AppLockGuard.userLeft || screenOff)) {
                    AppLockGuard.backgroundedAt = android.os.SystemClock.elapsedRealtime()
                }
                AppLockGuard.userLeft = false
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    var emailVerifiedOverride by androidx.compose.runtime.remember(state.user?.uid) { androidx.compose.runtime.mutableStateOf(false) }

    when {
        state.loading -> StudioLoadingScreen()
        state.user != null && !emailVerifiedOverride && uk.co.eggcraft.studioflow.features.auth.firebaseUserNeedsEmailVerification() ->
            uk.co.eggcraft.studioflow.features.auth.EmailVerifyScreen(
                onVerified = { emailVerifiedOverride = true },
                onSignOut = viewModel::signOut
            )
        state.user == null -> LoginScreen(
            signingIn = state.signingIn,
            errorMessage = state.errorMessage,
            onSignIn = viewModel::signIn,
            onRegister = viewModel::register,
            onGoogleSignIn = { startGoogleSignIn() },
            onAppleSignIn = {
                val act = context.findActivity()
                if (act != null) viewModel.signInWithApple(act)
                else viewModel.failExternalSignIn("Could not start Apple Sign-In on this device.")
            }
        )
        state.workspace == null -> WorkspaceUnresolvedScreen(
            t = t,
            message = state.errorMessage,
            accessLost = state.workspaceAccessLostCompanyId != null,
            onRetry = viewModel::retryWorkspace,
            onUseOwnWorkspace = viewModel::useOwnWorkspaceAfterAccessLoss,
            onSignOut = viewModel::signOut
        )
        requireDeviceUnlock && !localUnlockSatisfied -> LocalUnlockScreen(
            message = localUnlockMessage,
            onUnlock = { requestLocalUnlock() },
            onSignOut = viewModel::signOut
        )
        else -> Column(Modifier.fillMaxSize()) {
            if (uk.co.eggcraft.studioflow.features.auth.firebaseUserInEmailVerificationGracePeriod() && !emailVerifiedOverride) {
                uk.co.eggcraft.studioflow.features.auth.EmailVerifyReminderBanner(onVerified = { emailVerifiedOverride = true })
            }
            Box(Modifier.weight(1f)) {
                uk.co.eggcraft.studioflow.features.help.AppHelpAssistantLauncher(
                    repository = viewModel.helpRepository,
                    // The whole workspace, not just its id: a question the guide
                    // cannot answer files a support ticket from the sheet itself.
                    workspace = state.workspace,
                    language = state.workspaceSettings.selectedLanguage
                )
                StudioFlowMainScreen(
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
            onRestoreOrder = viewModel::restoreOrder,
            onCreateCustomer = viewModel::createCustomer,
            onUpdateCustomer = viewModel::updateCustomer,
            onUpdateCustomerPrefs = viewModel::updateCustomerPrefs,
            onResyncCustomer = viewModel::resyncIntegrationCustomer,
            onUploadCustomerPhoto = viewModel::uploadCustomerPhoto,
            onDeleteCustomer = viewModel::deleteCustomer,
            onUpdateWorkspaceSettings = viewModel::updateWorkspaceSettings,
            onUpdateWorkspaceBillingPlan = viewModel::updateWorkspaceBillingPlan,
            googlePlanOffers = viewModel.googlePlanOffers.collectAsStateWithLifecycle().value,
            googleStorageOffers = viewModel.googleStorageOffers.collectAsStateWithLifecycle().value,
            googleBillingPurchasing = viewModel.googleBillingPurchasing.collectAsStateWithLifecycle().value,
            onLoadGooglePlayProducts = viewModel::loadGooglePlayProducts,
            onPurchaseGooglePlan = viewModel::purchaseGooglePlan,
            onPurchaseGoogleStorageAddon = viewModel::purchaseGoogleStorageAddon,
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
            onSetTeamMemberSuspended = viewModel::setTeamMemberSuspended,
            onSaveCustomRole = viewModel::saveCustomRole,
            onDeleteCustomRole = viewModel::deleteCustomRole,
            onImportBackup = viewModel::importBackup,
            onConfirmImportBackup = viewModel::confirmBackupImport,
            onCancelImportBackup = viewModel::cancelBackupImport,
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
                // LAST child on purpose: the main screen's Column paints an
                // opaque background, so an earlier sibling would render
                // invisibly and give no hint that it had.
                state.pendingUndo?.let { pending ->
                    UndoBar(
                        shownUntilMs = pending.shownUntilMs,
                        busy = pending.busy,
                        onUndo = viewModel::undoOrderCreate,
                        onExpire = viewModel::dismissPendingUndo,
                        modifier = Modifier.align(Alignment.BottomCenter)
                    )
                }
            }
        }
    }

    if (state.showPostSignupVerifyNotice) {
        uk.co.eggcraft.studioflow.features.auth.PostSignupVerifyDialog(
            email = state.user?.email ?: "",
            onDismiss = viewModel::dismissPostSignupVerifyNotice
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
private fun WorkspaceUnresolvedScreen(
    t: (String) -> String,
    message: String,
    accessLost: Boolean,
    onRetry: () -> Unit,
    onUseOwnWorkspace: () -> Unit,
    onSignOut: () -> Unit
) {
    // The workspace could not be resolved (a read that did not reach the server,
    // or a server-confirmed loss of access). Nothing was switched or written;
    // the person retries, or — only after a confirmed loss — opens their own.
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier.padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            androidx.compose.material3.Text(
                text = t("Workspace not opened"),
                style = MaterialTheme.typography.titleLarge
            )
            Spacer(Modifier.height(8.dp))
            androidx.compose.material3.Text(
                text = message.ifBlank { t("Could not open your workspace. Check your connection and try again.") },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
            )
            Spacer(Modifier.height(20.dp))
            androidx.compose.material3.Button(onClick = onRetry, modifier = Modifier.testTag("workspace-retry")) {
                androidx.compose.material3.Text(t("Retry"))
            }
            if (accessLost) {
                Spacer(Modifier.height(8.dp))
                androidx.compose.material3.TextButton(onClick = onUseOwnWorkspace) {
                    androidx.compose.material3.Text(t("Use my own workspace"))
                }
            }
            Spacer(Modifier.height(8.dp))
            androidx.compose.material3.TextButton(onClick = onSignOut) {
                androidx.compose.material3.Text(t("Sign Out"))
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
