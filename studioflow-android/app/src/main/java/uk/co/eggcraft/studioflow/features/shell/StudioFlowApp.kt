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

@Composable
fun StudioFlowApp(
    viewModel: StudioFlowViewModel = viewModel()
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
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
        val keyguardManager = context.getSystemService(KeyguardManager::class.java)
        if (keyguardManager?.isDeviceSecure == true) {
            val intent = keyguardManager.createConfirmDeviceCredentialIntent(
                "Unlock NivaDesk",
                "Use fingerprint, face unlock, PIN, pattern or password to continue."
            )
            if (intent != null) {
                unlockLauncher.launch(intent)
            } else {
                localUnlockSatisfied = true
                localUnlockMessage = "Device security is not available. NivaDesk was unlocked."
            }
        } else {
            localUnlockSatisfied = true
            localUnlockMessage = "Device screen lock is not set on this Android device. NivaDesk was unlocked."
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
            if (event == Lifecycle.Event.ON_STOP && state.user != null && requireDeviceUnlock) {
                localUnlockSatisfied = false
                localUnlockMessage = ""
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
            onRecalculateFinancialSettings = viewModel::saveAndRecalculateFinancialSettings,
            onUpdateAccountProfile = viewModel::updateAccountProfile,
            onUploadAccountAvatar = viewModel::uploadAccountAvatar,
            onRemoveAccountAvatar = viewModel::removeAccountAvatar,
            onUploadWorkspaceLogo = viewModel::uploadWorkspaceLogo,
            onRemoveWorkspaceLogo = viewModel::removeWorkspaceLogo,
            onChangeAccountEmail = viewModel::changeAccountEmail,
            onSendPasswordResetEmail = viewModel::sendPasswordResetEmail,
            onRequestWorkspaceAccess = viewModel::requestWorkspaceAccess,
            onApproveJoinRequest = viewModel::approveJoinRequest,
            onDeclineJoinRequest = viewModel::declineJoinRequest,
            onUpdateTeamMemberRole = viewModel::updateTeamMemberRole,
            onUpdateTeamMemberAccess = viewModel::updateTeamMemberAccess,
            onRemoveTeamMember = viewModel::removeTeamMember,
            onSaveCustomRole = viewModel::saveCustomRole,
            onDeleteCustomRole = viewModel::deleteCustomRole,
            onImportBackup = viewModel::importBackup,
            onDeleteWorkspaceData = viewModel::deleteWorkspaceData
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
