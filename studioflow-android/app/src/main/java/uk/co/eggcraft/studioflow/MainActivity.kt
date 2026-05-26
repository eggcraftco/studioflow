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
        StudioMessagingService.ensureChannel(this)
        requestNotificationPermissionIfNeeded()
        handleStudioIntent(intent)
        setContent {
            // StudioFlowApp internally wraps its content with StudioFlowTheme,
            // reading appTheme from workspace settings ("System" / "Light" / "Dark").
            StudioFlowApp()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleStudioIntent(intent)
    }

    private fun handleStudioIntent(intent: Intent?) {
        val threadId = intent?.getStringExtra("studio_thread_id").orEmpty()
        if (threadId.isNotBlank()) {
            StudioMessageRouteHolder.setPendingThreadId(threadId)
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
