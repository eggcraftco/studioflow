package uk.co.eggcraft.studioflow

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import uk.co.eggcraft.studioflow.features.shell.StudioFlowApp
import uk.co.eggcraft.studioflow.ui.theme.StudioFlowTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            StudioFlowTheme {
                StudioFlowApp()
            }
        }
    }
}
