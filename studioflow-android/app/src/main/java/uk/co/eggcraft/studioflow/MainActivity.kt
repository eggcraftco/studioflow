package uk.co.eggcraft.studioflow

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import uk.co.eggcraft.studioflow.features.shell.StudioFlowApp
import uk.co.eggcraft.studioflow.services.StudioMessageRouteHolder
import uk.co.eggcraft.studioflow.services.StudioMessagingService
import uk.co.eggcraft.studioflow.ui.theme.StudioFlowTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        StudioMessagingService.ensureChannel(this)
        handleStudioIntent(intent)
        setContent {
            StudioFlowTheme {
                StudioFlowApp()
            }
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
}
