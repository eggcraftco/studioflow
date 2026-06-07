package uk.co.eggcraft.studioflow.features.files

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import uk.co.eggcraft.studioflow.data.model.StudioClientFile
import uk.co.eggcraft.studioflow.data.model.StudioOrder
import uk.co.eggcraft.studioflow.features.orders.ClientFilePreviewDialog
import uk.co.eggcraft.studioflow.features.shell.StudioFlowUiState
import uk.co.eggcraft.studioflow.language.LocalStudioLanguage
import uk.co.eggcraft.studioflow.language.studioT
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Locale

private const val ZIP_ENDPOINT =
    "https://europe-west2-eggcraft-studio.cloudfunctions.net/downloadClientFilesZip"

private fun fileSizeLabel(bytes: Long): String = when {
    bytes >= 1024 * 1024 -> String.format(Locale.UK, "%.1f MB", bytes / 1024.0 / 1024.0)
    bytes >= 1024 -> "${bytes / 1024} KB"
    else -> "$bytes B"
}

private fun isClientFileImage(contentType: String, fileName: String): Boolean {
    val cleanType = contentType.lowercase()
    val extension = fileName.substringAfterLast(".", "").lowercase()
    if (extension in setOf("psd", "psb") || extension == "pdf") return false
    return cleanType.startsWith("image/") || extension in setOf("jpg", "jpeg", "png", "webp", "heic", "heif")
}

private fun fileBadge(file: StudioClientFile): String {
    val lower = file.fileName.lowercase()
    if (lower.endsWith(".pdf") || file.contentType.lowercase().contains("pdf")) return "PDF"
    if (isClientFileImage(file.contentType, file.fileName)) return "IMG"
    val ext = file.fileName.substringAfterLast('.', "")
    return if (ext.isBlank()) "FILE" else ext.uppercase().take(4)
}

private fun dateLabel(date: java.util.Date?): String =
    date?.let { SimpleDateFormat("d MMM yyyy", Locale.getDefault()).format(it) } ?: ""

@Composable
fun ClientFilesScreen(
    state: StudioFlowUiState,
    onDeleteClientFile: (StudioOrder, String) -> Unit
) {
    val lang = LocalStudioLanguage.current
    val t: (String) -> String = { studioT(it, lang) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val workspace = state.workspace
    val access = workspace?.memberAccess
    val canDeleteFiles = access?.allows("deleteClientFiles") != false && access?.allows("clientFiles") != false

    val groups = remember(state.orders) {
        state.orders
            .filter { it.clientFiles.isNotEmpty() }
            .sortedBy { it.displayCustomerName.lowercase() }
    }
    val totalCount = groups.sumOf { it.clientFiles.size }
    val totalBytes = groups.sumOf { order -> order.clientFiles.sumOf { it.fileSize } }

    var statusMessage by remember { mutableStateOf("") }
    var downloadingScope by remember { mutableStateOf<String?>(null) }
    var previewFile by remember { mutableStateOf<StudioClientFile?>(null) }
    var pendingDeleteOrder by remember { mutableStateOf<StudioOrder?>(null) }
    var pendingZipBytes by remember { mutableStateOf<ByteArray?>(null) }

    val saveLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/zip")
    ) { uri: Uri? ->
        val bytes = pendingZipBytes
        pendingZipBytes = null
        if (uri == null || bytes == null) return@rememberLauncherForActivityResult
        scope.launch {
            val ok = withContext(Dispatchers.IO) {
                runCatching {
                    context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                }.isSuccess
            }
            statusMessage = if (ok) t("Download started.") else t("Could not download files.")
        }
    }

    fun downloadZip(scopeKey: String, orderId: String?, suggestedName: String) {
        val companyId = workspace?.id ?: return
        if (downloadingScope != null) return
        downloadingScope = orderId ?: "workspace"
        statusMessage = ""
        scope.launch {
            val bytes = withContext(Dispatchers.IO) {
                runCatching {
                    val token = FirebaseAuth.getInstance().currentUser?.getIdToken(false)?.await()?.token
                        ?: return@runCatching null
                    var urlStr = "$ZIP_ENDPOINT?companyId=$companyId&scope=$scopeKey"
                    if (scopeKey == "order" && orderId != null) urlStr += "&orderId=$orderId"
                    val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
                        setRequestProperty("Authorization", "Bearer $token")
                        connectTimeout = 20000
                        readTimeout = 120000
                    }
                    if (conn.responseCode == 200) conn.inputStream.use { it.readBytes() } else null
                }.getOrNull()
            }
            downloadingScope = null
            if (bytes == null || bytes.isEmpty()) {
                statusMessage = t("Could not download files.")
            } else {
                pendingZipBytes = bytes
                uk.co.eggcraft.studioflow.features.shell.AppLockGuard.suppressNextLockOnce()
                saveLauncher.launch(suggestedName)
            }
        }
    }

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(t("Client Files"), fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
                        Text(
                            "$totalCount ${t("files")} • ${fileSizeLabel(totalBytes)}",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    if (groups.isNotEmpty()) {
                        TextButton(
                            onClick = { downloadZip("workspace", null, "workspace-files.zip") },
                            enabled = downloadingScope == null
                        ) {
                            Icon(Icons.Filled.Download, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text(if (downloadingScope == "workspace") t("Preparing…") else t("Download all (ZIP)"))
                        }
                    }
                }
                if (statusMessage.isNotEmpty()) {
                    Text(statusMessage, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }

            if (groups.isEmpty()) {
                item {
                    Text(
                        t("No client files found for this workspace yet."),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 30.dp)
                    )
                }
            }

            items(groups, key = { it.id }) { order ->
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                if (order.designName.isBlank()) order.displayCustomerName
                                else "${order.displayCustomerName} · ${order.designName}",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.ExtraBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Text(
                                "${order.clientFiles.size} ${t("files")}",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        TextButton(
                            onClick = { downloadZip("order", order.id, "order-files.zip") },
                            enabled = downloadingScope == null
                        ) {
                            Icon(Icons.Filled.Download, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text(if (downloadingScope == order.id) t("Preparing…") else "ZIP", fontSize = 12.sp)
                        }
                        if (canDeleteFiles) {
                            TextButton(onClick = { pendingDeleteOrder = order }) {
                                Text(t("Delete all"), color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                            }
                        }
                    }

                    order.clientFiles.forEach { file ->
                        ClientFileHubRow(
                            file = file,
                            canDelete = canDeleteFiles,
                            onPreview = { previewFile = file },
                            onDelete = { onDeleteClientFile(order, file.id) }
                        )
                    }
                }
            }
        }
    }

    previewFile?.let { file ->
        ClientFilePreviewDialog(
            file = file,
            onDismiss = { previewFile = null },
            onOpenExternal = {
                runCatching {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(file.downloadUrl)))
                }
            }
        )
    }

    pendingDeleteOrder?.let { order ->
        AlertDialog(
            onDismissRequest = { pendingDeleteOrder = null },
            title = { Text(t("Delete all")) },
            text = {
                Text(
                    "${t("Delete all")} ${order.clientFiles.size} ${t("files")} • ${order.displayCustomerName}?"
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    order.clientFiles.forEach { onDeleteClientFile(order, it.id) }
                    pendingDeleteOrder = null
                }) { Text(t("Delete all"), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { pendingDeleteOrder = null }) { Text(t("Cancel")) }
            }
        )
    }
}

@Composable
private fun ClientFileHubRow(
    file: StudioClientFile,
    canDelete: Boolean,
    onPreview: () -> Unit,
    onDelete: () -> Unit
) {
    val lang = LocalStudioLanguage.current
    val t: (String) -> String = { studioT(it, lang) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f))
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .clickable { onPreview() },
            contentAlignment = Alignment.Center
        ) {
            if (isClientFileImage(file.contentType, file.fileName) && file.downloadUrl.isNotBlank()) {
                AsyncImage(
                    model = file.downloadUrl,
                    contentDescription = file.fileName,
                    modifier = Modifier.fillMaxSize()
                )
            } else {
                Text(fileBadge(file), fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f).clickable { onPreview() }) {
            Text(file.fileName, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                "${fileSizeLabel(file.fileSize)} · ${dateLabel(file.uploadedAt)}",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (file.uploadedByEmail.isNotBlank()) {
                Text(
                    "${t("Added by")} ${file.uploadedByEmail}",
                    fontSize = 10.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
        if (canDelete) {
            TextButton(onClick = onDelete) {
                Icon(Icons.Filled.Delete, contentDescription = t("Delete"), tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp))
            }
        }
    }
}
