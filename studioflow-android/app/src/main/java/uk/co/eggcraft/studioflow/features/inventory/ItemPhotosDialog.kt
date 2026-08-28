package uk.co.eggcraft.studioflow.features.inventory

// Photos of one inventory item, on Android. Same contract as the web and the
// Apple apps: the item stores storage paths, this dialog resolves them to URLs
// only to draw, uploads land in storage before the document is saved, and
// removal updates the document before deleting the file.

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import uk.co.eggcraft.studioflow.data.firebase.StudioFlowRepository
import uk.co.eggcraft.studioflow.data.model.StudioInventoryItem
import uk.co.eggcraft.studioflow.ui.theme.StudioRed

@Composable
fun ItemPhotosDialog(
    workspaceId: String,
    item: StudioInventoryItem,
    canEdit: Boolean,
    t: (String) -> String,
    onDismiss: () -> Unit,
    onChanged: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val repository = remember { StudioFlowRepository() }

    var paths by remember { mutableStateOf(item.photos) }
    var urls by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var viewing by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(paths) {
        paths.forEach { path ->
            if (urls[path] == null) {
                runCatching { repository.inventoryPhotoUrl(path) }
                    .onSuccess { urls = urls + (path to it) }
            }
        }
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            busy = true; error = null
            try {
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    ?: throw IllegalStateException("empty")
                val path = repository.inventoryUploadPhoto(workspaceId, item.id, bytes)
                val next = paths + path
                repository.inventorySavePhotos(workspaceId, item, next)
                paths = next
                onChanged()
            } catch (failure: Exception) { error = failure.message }
            busy = false
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(item.name, fontSize = 16.sp, fontWeight = FontWeight.Bold) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()).heightIn(max = 440.dp)) {
                val current = viewing
                if (current != null && urls[current] != null) {
                    AsyncImage(
                        model = urls[current], contentDescription = item.name,
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxWidth().heightIn(max = 320.dp)
                    )
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        Text(t("Back to all photos"), fontSize = 12.sp, color = Color(0xFF2563EB),
                            modifier = Modifier.clickable { viewing = null })
                        if (canEdit) {
                            Text(t("Remove this photo"), fontSize = 12.sp, color = StudioRed,
                                modifier = Modifier.clickable(enabled = !busy) {
                                    scope.launch {
                                        busy = true; error = null
                                        try {
                                            // The document first: an orphaned file is
                                            // harmless, a listed path with no file
                                            // behind it is a broken screen.
                                            val next = paths.filter { it != current }
                                            repository.inventorySavePhotos(workspaceId, item, next)
                                            paths = next
                                            viewing = null
                                            onChanged()
                                        } catch (failure: Exception) { error = failure.message }
                                        busy = false
                                    }
                                })
                        }
                    }
                } else {
                    if (paths.isEmpty()) {
                        Text(t("No photos yet. For a unique piece, the photos are half the identity."),
                             fontSize = 12.sp, color = Color.Gray)
                    } else {
                        LazyVerticalGrid(
                            columns = GridCells.Fixed(4),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.heightIn(max = 240.dp)
                        ) {
                            items(paths, key = { it }) { path ->
                                AsyncImage(
                                    model = urls[path], contentDescription = item.name,
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier
                                        .size(76.dp)
                                        .clip(RoundedCornerShape(10.dp))
                                        .clickable { viewing = path }
                                )
                            }
                        }
                    }
                    if (canEdit) {
                        Spacer(Modifier.height(10.dp))
                        Text(
                            if (busy) t("Uploading…") else t("Add photos"),
                            fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF2563EB),
                            modifier = Modifier.clickable(enabled = !busy && paths.size < INVENTORY_PHOTO_LIMIT) {
                                picker.launch("image/*")
                            }
                        )
                    }
                }
                error?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, fontSize = 12.sp, color = StudioRed)
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text(t("Close")) } }
    )
}
