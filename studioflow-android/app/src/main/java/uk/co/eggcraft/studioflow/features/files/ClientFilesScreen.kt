package uk.co.eggcraft.studioflow.features.files

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import uk.co.eggcraft.studioflow.data.model.StudioBillingPlan
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

private fun clientFileDisplayName(context: Context, uri: Uri): String {
    return runCatching {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (index >= 0) cursor.getString(index).orEmpty() else ""
                } else {
                    ""
                }
            }.orEmpty()
    }.getOrDefault("")
        .ifBlank { uri.lastPathSegment.orEmpty().substringAfterLast("/") }
        .ifBlank { "Client file" }
}

@Composable
fun ClientFilesScreen(
    state: StudioFlowUiState,
    onUploadClientFile: (StudioOrder, ByteArray, String, String) -> Unit = { _, _, _, _ -> },
    onRenameClientFile: (StudioOrder, String, String) -> Unit = { _, _, _ -> },
    onDeleteClientFile: (StudioOrder, String) -> Unit,
    onOpenOrder: (StudioOrder) -> Unit = {}
) {
    val lang = LocalStudioLanguage.current
    val t: (String) -> String = { studioT(it, lang) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val workspace = state.workspace
    val access = workspace?.memberAccess
    val canDeleteFiles = access?.allows("deleteClientFiles") != false && access?.allows("clientFiles") != false
    // Upload/rename follow the same gating the order-detail Client Files card uses:
    // an advanced plan (Pro/Team) plus the clientFiles member-access flag.
    val planAllowsClientFiles = workspace?.billingPlan == StudioBillingPlan.ProMonthly ||
        workspace?.billingPlan == StudioBillingPlan.TeamMonthly
    val canManageClientFiles = planAllowsClientFiles && access?.allows("clientFiles") != false

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
    // Upload flow: the user picks a target order, then a file. We stash the chosen
    // order while the system file picker is open so the result can be routed to it.
    var showOrderPicker by remember { mutableStateOf(false) }
    var uploadTargetOrder by remember { mutableStateOf<StudioOrder?>(null) }
    // Rename flow: the order + file currently being renamed (null = dialog closed).
    var renameTarget by remember { mutableStateOf<Pair<StudioOrder, StudioClientFile>?>(null) }

    val uploadLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        val target = uploadTargetOrder
        uploadTargetOrder = null
        if (uri == null || target == null) return@rememberLauncherForActivityResult
        val fileName = clientFileDisplayName(context, uri)
        val contentType = context.contentResolver.getType(uri).orEmpty()
        val bytes = runCatching { context.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()
        if (bytes != null) {
            onUploadClientFile(target, bytes, fileName, contentType)
            statusMessage = t("Uploading…")
        }
    }

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
            verticalArrangement = Arrangement.spacedBy(22.dp)
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
                    if (canManageClientFiles && state.orders.isNotEmpty()) {
                        TextButton(onClick = { showOrderPicker = true }) {
                            Icon(Icons.Filled.UploadFile, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text(t("Upload"))
                        }
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
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .clickable { onOpenOrder(order) }
                        ) {
                            Text(
                                if (order.designName.isBlank()) order.displayCustomerName
                                else "${order.displayCustomerName} · ${order.designName}",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = MaterialTheme.colorScheme.primary,
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

                    // Divider under the project header to clearly separate the
                    // project title from its files (mirrors the Mac hub).
                    HorizontalDivider(
                        thickness = 1.dp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f)
                    )

                    order.clientFiles.forEach { file ->
                        ClientFileHubRow(
                            file = file,
                            canDelete = canDeleteFiles,
                            canRename = canManageClientFiles,
                            onPreview = { previewFile = file },
                            onRename = { renameTarget = order to file },
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

    if (showOrderPicker) {
        val pickableOrders = remember(state.orders) {
            state.orders.sortedBy { it.displayCustomerName.lowercase() }
        }
        AlertDialog(
            onDismissRequest = { showOrderPicker = false },
            title = { Text(t("Upload to project"), fontWeight = FontWeight.ExtraBold) },
            text = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 420.dp)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(t("Select project"), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    pickableOrders.forEach { order ->
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .clickable {
                                    showOrderPicker = false
                                    uploadTargetOrder = order
                                    uk.co.eggcraft.studioflow.features.shell.AppLockGuard.suppressNextLockOnce()
                                    uploadLauncher.launch(arrayOf("*/*"))
                                },
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Text(
                                    if (order.designName.isBlank()) order.displayCustomerName
                                    else "${order.displayCustomerName} · ${order.designName}",
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    "${order.clientFiles.size} ${t("files")}",
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { showOrderPicker = false }) { Text(t("Cancel")) }
            }
        )
    }

    renameTarget?.let { (order, file) ->
        var renameText by remember(file.id) { mutableStateOf(file.fileName) }
        AlertDialog(
            onDismissRequest = { renameTarget = null },
            title = { Text(t("Rename"), fontWeight = FontWeight.ExtraBold) },
            text = {
                OutlinedTextField(
                    value = renameText,
                    onValueChange = { renameText = it },
                    label = { Text(t("File name")) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                TextButton(
                    enabled = renameText.trim().isNotBlank(),
                    onClick = {
                        onRenameClientFile(order, file.id, renameText.trim())
                        renameTarget = null
                    }
                ) { Text(t("Save"), fontWeight = FontWeight.ExtraBold) }
            },
            dismissButton = {
                TextButton(onClick = { renameTarget = null }) { Text(t("Cancel")) }
            }
        )
    }
}

@Composable
private fun ClientFileHubRow(
    file: StudioClientFile,
    canDelete: Boolean,
    canRename: Boolean,
    onPreview: () -> Unit,
    onRename: () -> Unit,
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
        if (canRename) {
            TextButton(onClick = onRename) {
                Icon(Icons.Filled.Edit, contentDescription = t("Rename"), modifier = Modifier.size(18.dp))
            }
        }
        if (canDelete) {
            TextButton(onClick = onDelete) {
                Icon(Icons.Filled.Delete, contentDescription = t("Delete"), tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp))
            }
        }
    }
}
