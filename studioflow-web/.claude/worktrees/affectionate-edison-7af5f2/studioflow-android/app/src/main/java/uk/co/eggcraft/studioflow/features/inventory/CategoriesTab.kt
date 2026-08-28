package uk.co.eggcraft.studioflow.features.inventory

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import uk.co.eggcraft.studioflow.data.firebase.StudioFlowRepository
import uk.co.eggcraft.studioflow.data.model.StudioInventoryCategory

/**
 * Inventory → Categories.
 *
 * Categories used to be ten fixed words, which suits a watchmaker and nobody
 * else. This is where a workshop names what it actually keeps. Two rules shape
 * the screen, and they are the server's rules too (functions/inventory.js):
 *
 *  * one central name — renaming here renames it everywhere, because the server
 *    carries the new title to the items that used the old one;
 *  * nothing is orphaned — a category holding items is never simply removed, so
 *    Remove asks where those items should go instead.
 */
private val iconChoices = listOf(
    "⌚", "◎", "⚙", "⚒", "⚗", "➰", "▧", "✄", "◇", "⬢",
    "◈", "✦", "❖", "⬡", "◐", "▤", "▦", "✧", "⌘", "▪"
)

@Composable
fun CategoriesTab(
    workspaceId: String,
    canEdit: Boolean,
    t: (String) -> String,
    onChanged: () -> Unit
) {
    val repository = remember { StudioFlowRepository() }
    val scope = rememberCoroutineScope()

    val rows = remember { mutableStateListOf<StudioInventoryCategory>() }
    var defaultCategory by remember { mutableStateOf("") }
    var orphans by remember { mutableStateOf<List<Pair<String, Int>>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }
    var dirty by remember { mutableStateOf(false) }
    var removing by remember { mutableStateOf<StudioInventoryCategory?>(null) }
    var merging by remember { mutableStateOf<StudioInventoryCategory?>(null) }

    suspend fun reload() {
        try {
            val (list, chosen, gaps) = repository.inventoryCategories(workspaceId)
            rows.clear()
            rows.addAll(list)
            defaultCategory = chosen
            orphans = gaps
            dirty = false
            notice = null
        } catch (error: Exception) {
            notice = error.message
        }
        loading = false
    }

    LaunchedEffect(workspaceId) { reload() }

    Column(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(t("Categories"), fontSize = 17.sp, fontWeight = FontWeight.Bold)
        Text(
            t("Name these the way your workshop talks. Renaming one here renames it on every item, filter and report."),
            fontSize = 12.sp, color = Color.Gray
        )
        notice?.let { Text(it, fontSize = 12.sp, color = MaterialTheme.colorScheme.error) }

        if (orphans.isNotEmpty()) {
            Card(colors = inventoryCardColors()) {
                Text(
                    t("Not on this list:") + " " +
                        orphans.joinToString(", ") { "${it.first} (${it.second})" } + ". " +
                        t("Add the name back, or open the category filter to move those items."),
                    fontSize = 12.sp,
                    modifier = Modifier.padding(10.dp)
                )
            }
        }

        if (canEdit) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(
                    enabled = !busy && rows.size < 40,
                    onClick = {
                        rows.add(
                            StudioInventoryCategory(
                                id = "category_${System.currentTimeMillis()}",
                                title = "",
                                icon = "◇",
                                archived = false,
                                itemCount = 0
                            )
                        )
                        dirty = true
                    }
                ) { Text("＋ " + t("Add category")) }

                TextButton(
                    enabled = !busy && dirty,
                    onClick = {
                        val cleaned = rows.map { it.copy(title = it.title.trim()) }.filter { it.title.isNotEmpty() }
                        if (cleaned.isEmpty()) {
                            notice = t("Inventory needs at least one category.")
                            return@TextButton
                        }
                        busy = true
                        scope.launch {
                            try {
                                repository.saveInventoryCategories(workspaceId, cleaned, defaultCategory)
                                reload()
                                onChanged()
                            } catch (error: Exception) {
                                notice = error.message
                            }
                            busy = false
                        }
                    }
                ) { Text(if (busy) t("Saving…") else t("Save changes")) }
            }
        }

        if (loading) {
            Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(rows, key = { it.id }) { row ->
                    val index = rows.indexOfFirst { it.id == row.id }
                    CategoryRow(
                        row = row,
                        isDefault = defaultCategory == row.title && row.title.isNotEmpty(),
                        canEdit = canEdit,
                        busy = busy,
                        canMerge = rows.size > 1,
                        t = t,
                        onIcon = { if (index >= 0) { rows[index] = rows[index].copy(icon = it); dirty = true } },
                        onTitle = { if (index >= 0) { rows[index] = rows[index].copy(title = it); dirty = true } },
                        onDefault = { defaultCategory = row.title; dirty = true },
                        onVisible = { if (index >= 0) { rows[index] = rows[index].copy(archived = !it); dirty = true } },
                        onMerge = { merging = row },
                        onRemove = {
                            // An empty category needs no ceremony; a full one does.
                            if (row.itemCount == 0) {
                                busy = true
                                scope.launch {
                                    try {
                                        repository.deleteInventoryCategory(workspaceId, row.id, "other")
                                        reload(); onChanged()
                                    } catch (error: Exception) { notice = error.message }
                                    busy = false
                                }
                            } else {
                                removing = row
                            }
                        }
                    )
                }
            }
            Text(
                "${rows.count { !it.archived }} ${t("visible")} · ${rows.sumOf { it.itemCount }} ${t("items filed")}",
                fontSize = 11.sp, color = Color.Gray
            )
        }
    }

    removing?.let { category ->
        RemoveCategoryDialog(
            category = category,
            others = rows.filter { it.id != category.id && !it.archived },
            busy = busy,
            t = t,
            onDismiss = { removing = null },
            onConfirm = { disposition, moveToId ->
                removing = null
                busy = true
                scope.launch {
                    try {
                        repository.deleteInventoryCategory(workspaceId, category.id, disposition, moveToId)
                        reload(); onChanged()
                    } catch (error: Exception) { notice = error.message }
                    busy = false
                }
            }
        )
    }

    merging?.let { category ->
        MergeCategoryDialog(
            category = category,
            others = rows.filter { it.id != category.id },
            busy = busy,
            t = t,
            onDismiss = { merging = null },
            onConfirm = { intoId ->
                merging = null
                busy = true
                scope.launch {
                    try {
                        repository.mergeInventoryCategories(workspaceId, category.id, intoId)
                        reload(); onChanged()
                    } catch (error: Exception) { notice = error.message }
                    busy = false
                }
            }
        )
    }
}

@Composable
private fun CategoryRow(
    row: StudioInventoryCategory,
    isDefault: Boolean,
    canEdit: Boolean,
    busy: Boolean,
    canMerge: Boolean,
    t: (String) -> String,
    onIcon: (String) -> Unit,
    onTitle: (String) -> Unit,
    onDefault: () -> Unit,
    onVisible: (Boolean) -> Unit,
    onMerge: () -> Unit,
    onRemove: () -> Unit
) {
    var iconOpen by remember { mutableStateOf(false) }
    Card(colors = inventoryCardColors()) {
        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box {
                    TextButton(enabled = canEdit, onClick = { iconOpen = true }) {
                        Text(row.icon.ifEmpty { "◇" }, fontSize = 16.sp)
                    }
                    DropdownMenu(expanded = iconOpen, onDismissRequest = { iconOpen = false }) {
                        iconChoices.forEach { icon ->
                            DropdownMenuItem(
                                text = { Text(icon, fontSize = 16.sp) },
                                onClick = { iconOpen = false; onIcon(icon) }
                            )
                        }
                    }
                }
                OutlinedTextField(
                    value = row.title,
                    onValueChange = onTitle,
                    enabled = canEdit,
                    singleLine = true,
                    placeholder = { Text(t("Category name"), fontSize = 13.sp) },
                    modifier = Modifier.weight(1f)
                )
                Text("${row.itemCount}", fontSize = 12.sp, color = Color.Gray, modifier = Modifier.width(34.dp))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                FilterChip(
                    selected = isDefault,
                    onClick = { if (canEdit && row.title.isNotEmpty()) onDefault() },
                    label = { Text(t("Default"), fontSize = 11.sp) },
                    enabled = canEdit && row.title.isNotEmpty()
                )
                FilterChip(
                    selected = !row.archived,
                    onClick = { if (canEdit) onVisible(row.archived) },
                    label = { Text(t("Visible"), fontSize = 11.sp) },
                    enabled = canEdit
                )
                if (canEdit) {
                    TextButton(enabled = !busy && canMerge, onClick = onMerge) { Text(t("Merge"), fontSize = 12.sp) }
                    TextButton(enabled = !busy, onClick = onRemove) {
                        Text(t("Remove"), fontSize = 12.sp, color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }
    }
}

@Composable
private fun RemoveCategoryDialog(
    category: StudioInventoryCategory,
    others: List<StudioInventoryCategory>,
    busy: Boolean,
    t: (String) -> String,
    onDismiss: () -> Unit,
    onConfirm: (String, String) -> Unit
) {
    var disposition by remember { mutableStateOf(if (others.isNotEmpty()) "move" else "other") }
    var moveToId by remember { mutableStateOf(others.firstOrNull()?.id.orEmpty()) }
    var pickerOpen by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("${t("Remove")} “${category.title}”") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    "${category.itemCount} ${t("items are filed here.")} ${t("Choose where they should go — nothing is deleted.")}",
                    fontSize = 13.sp
                )
                if (others.isNotEmpty()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = disposition == "move", onClick = { disposition = "move" })
                        Text(t("Move the items to"), fontSize = 13.sp)
                        Box {
                            TextButton(onClick = { pickerOpen = true }) {
                                Text(others.firstOrNull { it.id == moveToId }?.title.orEmpty(), fontSize = 13.sp)
                            }
                            DropdownMenu(expanded = pickerOpen, onDismissRequest = { pickerOpen = false }) {
                                others.forEach { option ->
                                    DropdownMenuItem(
                                        text = { Text("${option.icon} ${option.title}", fontSize = 13.sp) },
                                        onClick = { pickerOpen = false; moveToId = option.id; disposition = "move" }
                                    )
                                }
                            }
                        }
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(selected = disposition == "archive", onClick = { disposition = "archive" })
                    Text(t("Hide the category and leave the items where they are"), fontSize = 13.sp)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(selected = disposition == "other", onClick = { disposition = "other" })
                    Text(t("Move the items to Other"), fontSize = 13.sp)
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !busy && (disposition != "move" || moveToId.isNotEmpty()),
                onClick = { onConfirm(disposition, moveToId) }
            ) { Text(if (busy) t("Working…") else t("Confirm")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Cancel")) } }
    )
}

@Composable
private fun MergeCategoryDialog(
    category: StudioInventoryCategory,
    others: List<StudioInventoryCategory>,
    busy: Boolean,
    t: (String) -> String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    var intoId by remember { mutableStateOf(others.firstOrNull()?.id.orEmpty()) }
    var open by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("${t("Merge")} “${category.title}”") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(t("Its items move across and the category disappears. Bracelets into Straps, say."), fontSize = 13.sp)
                Box {
                    TextButton(onClick = { open = true }) {
                        Text(
                            t("Merge into") + ": " + others.firstOrNull { it.id == intoId }?.title.orEmpty(),
                            fontSize = 13.sp
                        )
                    }
                    DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                        others.forEach { option ->
                            DropdownMenuItem(
                                text = { Text("${option.icon} ${option.title}", fontSize = 13.sp) },
                                onClick = { open = false; intoId = option.id }
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(enabled = !busy && intoId.isNotEmpty(), onClick = { onConfirm(intoId) }) {
                Text(if (busy) t("Working…") else t("Merge"))
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Cancel")) } }
    )
}
