package uk.co.eggcraft.studioflow

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory
import uk.co.eggcraft.studioflow.features.shell.StudioFlowApp
import uk.co.eggcraft.studioflow.services.StudioMessageRouteHolder
import uk.co.eggcraft.studioflow.services.StudioMessagingService
import uk.co.eggcraft.studioflow.ui.theme.StudioFlowTheme

class MainActivity : ComponentActivity() {

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* granted or not — we don't need to react further; system remembers the choice */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Firebase App Check (Play Integrity): attaches an attestation token to
        // Firebase requests so bot/scripted traffic can be rejected once
        // enforcement is enabled. Best-effort — never block app startup on it.
        try {
            FirebaseApp.initializeApp(this)
            FirebaseAppCheck.getInstance()
                .installAppCheckProviderFactory(PlayIntegrityAppCheckProviderFactory.getInstance())
        } catch (_: Exception) {
        }
        if (BuildConfig.DEBUG) connectLocalEmulatorsIfRequested()
        StudioMessagingService.ensureChannel(this)
        requestNotificationPermissionIfNeeded()
        handleStudioIntent(intent)
        setContent {
            // StudioFlowApp internally wraps its content with StudioFlowTheme,
            // reading appTheme from workspace settings ("System" / "Light" / "Dark").
            StudioFlowApp()
        }
    }

    /**
     * Points the app at the local Firebase emulators when a marker file is
     * present, so a test workspace can be exercised on an emulator without
     * touching live data. Debug builds only, opt-in — a normal run never sees
     * this. The marker is pushed with `adb push`; an env var would not survive
     * the way Android launches an activity.
     */
    private fun connectLocalEmulatorsIfRequested() {
        val marker = java.io.File(filesDir, "nivadesk-emulator.txt")
        if (!marker.exists()) return
        val lines = runCatching { marker.readLines() }.getOrDefault(emptyList())
        val host = lines.getOrNull(0)?.trim().orEmpty().ifBlank { "10.0.2.2" }
        val token = lines.getOrNull(1)?.trim().orEmpty()
        runCatching {
            com.google.firebase.auth.FirebaseAuth.getInstance().useEmulator(host, 9099)
            com.google.firebase.firestore.FirebaseFirestore.getInstance().useEmulator(host, 8080)
            com.google.firebase.functions.FirebaseFunctions.getInstance("europe-west2").useEmulator(host, 5001)
            android.util.Log.i("NivaDesk", "Local Firebase emulators connected at $host")
            if (token.isNotBlank()) {
                com.google.firebase.auth.FirebaseAuth.getInstance().signInWithCustomToken(token)
                    .addOnCompleteListener { task ->
                        android.util.Log.i("NivaDesk", "Emulator sign-in: ${task.isSuccessful} ${task.exception?.message ?: ""}")
                    }
            }
        }.onFailure { android.util.Log.w("NivaDesk", "Emulator wiring failed: ${it.message}") }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleStudioIntent(intent)
    }

    // Fires only when the user genuinely leaves the app (home / recents / call) — not
    // when we launch an in-app activity like the file picker. Used to decide whether
    // the app-lock screen should appear on return.
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        uk.co.eggcraft.studioflow.features.shell.AppLockGuard.userLeft = true
    }

    private fun handleStudioIntent(intent: Intent?) {
        val threadId = intent?.getStringExtra("studio_thread_id").orEmpty()
        if (threadId.isNotBlank()) {
            StudioMessageRouteHolder.setPendingThreadId(threadId)
        }
        val orderId = intent?.getStringExtra("studio_order_id").orEmpty()
        if (orderId.isNotBlank()) {
            StudioMessageRouteHolder.setPendingOrderRoute(
                orderId,
                intent?.getStringExtra("studio_order_card").orEmpty().ifBlank { "shipping" }
            )
        }
        // Launcher shortcut (long-press app icon → "New note"). The extra arrives
        // as a string on some launchers, so accept both representations.
        val newNote = intent?.getBooleanExtra("studio_new_note", false) == true ||
            intent?.getStringExtra("studio_new_note") == "true"
        if (newNote) {
            StudioMessageRouteHolder.setPendingNewNote()
        }
        // Notes widget tapped: land on the Notes section (no editor).
        if (intent?.getBooleanExtra("studio_open_notes", false) == true) {
            StudioMessageRouteHolder.setPendingOpenNotes()
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}
