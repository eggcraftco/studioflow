package uk.co.eggcraft.studioflow.features.shell

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import uk.co.eggcraft.studioflow.language.LocalStudioLanguage
import uk.co.eggcraft.studioflow.language.studioT

/**
 * The brief "Project created · Undo" strip. This module has no Scaffold and no
 * SnackbarHost anywhere, so this is built plainly instead of pretending to one.
 *
 * It must be placed as the LAST child of the shell's Box, after the main screen:
 * the main screen's Column paints an opaque background, so an earlier sibling
 * would be painted over and vanish with no error at all.
 */
@Composable
fun UndoBar(
    shownUntilMs: Long,
    busy: Boolean,
    onUndo: () -> Unit,
    onExpire: () -> Unit,
    modifier: Modifier = Modifier
) {
    val lang = LocalStudioLanguage.current
    val t: (String) -> String = { studioT(it, lang) }

    LaunchedEffect(shownUntilMs, busy) {
        if (busy) return@LaunchedEffect
        val remaining = shownUntilMs - System.currentTimeMillis()
        if (remaining > 0) delay(remaining)
        onExpire()
    }

    Surface(
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.inverseSurface,
        contentColor = MaterialTheme.colorScheme.inverseOnSurface,
        shadowElevation = 6.dp,
        modifier = modifier
            .navigationBarsPadding()
            .padding(horizontal = 16.dp, vertical = 16.dp)
            .fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(start = 16.dp, end = 8.dp, top = 6.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = t("Project created"),
                modifier = Modifier.weight(1f),
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold
            )
            TextButton(onClick = onUndo, enabled = !busy) {
                Text(
                    text = if (busy) t("Undoing...") else t("Undo"),
                    color = MaterialTheme.colorScheme.inversePrimary,
                    fontWeight = FontWeight.ExtraBold
                )
            }
        }
    }
}
