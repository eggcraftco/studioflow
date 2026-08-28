package uk.co.eggcraft.studioflow.features.inventory

// The places stock lives, as a tree the workshop actually has: Safe A holds
// Drawer 3 holds Tray 1. Renaming a node here renames it on every item
// standing in it (the server owns that cascade); deleting is refused while
// anything — a child location or standing stock — still lives inside.
//
// Items still carry ONE plain location string, so every free-text location
// keeps working; this tab only adds structure and safe renames on top.

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
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
import uk.co.eggcraft.studioflow.data.model.StudioInventoryItem
import uk.co.eggcraft.studioflow.data.model.StudioInventoryLocation
import uk.co.eggcraft.studioflow.ui.theme.StudioBlue
import uk.co.eggcraft.studioflow.ui.theme.StudioRed

/** "Top level" or a parent's full path — the same picker for add and edit.
 *  [options] is already filtered by the caller (depth cap, no self/descendants). */
@Composable
private fun LocationParentPicker(
    label: String,
    selectedId: String,
    options: List<StudioInventoryLocation>,
    t: (String) -> String,
    onPick: (String) -> Unit
) {
    var open by remember { mutableStateOf(false) }
    val selectedText = options.firstOrNull { it.id == selectedId }?.path ?: t("Top level")
    Box {
        OutlinedTextField(
            value = selectedText,
            onValueChange = {},
            readOnly = true,
            label = { Text(label, fontSize = 12.sp) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Box(Modifier.matchParentSize().clickable { open = true })
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(
                text = { Text(t("Top level"), fontSize = 13.sp) },
                onClick = { open = false; onPick("") }
            )
            options.forEach { row ->
                DropdownMenuItem(
                    text = { Text(row.path, fontSize = 13.sp) },
                    onClick = { open = false; onPick(row.id) }
                )
            }
        }
    }
}

@Composable
fun LocationsTab(
    workspaceId: String,
    items: List<StudioInventoryItem>,
    canEdit: Boolean,
    t: (String) -> String,
    /** Renames cascade into item location strings — the item list needs a reload. */
    onLocationsChanged: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val repository = remember { StudioFlowRepository() }

    var locations by remember { mutableStateOf<List<StudioInventoryLocation>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }
    var newName by remember { mutableStateOf("") }
    var newParentId by remember { mutableStateOf("") }
    var editingId by remember { mutableStateOf("") }
    var editName by remember { mutableStateOf("") }
    var editParentId by remember { mutableStateOf("") }

    suspend fun reload() {
        try {
            locations = repository.inventoryLocations(workspaceId)
        } catch (error: Exception) {
            notice = t(error.message ?: "Locations could not be loaded.")
        }
        loading = false
    }

    LaunchedEffect(workspaceId) {
        if (workspaceId.isNotBlank()) reload()
    }

    // How many items stand at each exact path — counted client-side from the
    // already-loaded list, so no extra reads.
    val countsByPath = remember(items) {
        items.mapNotNull { it.location.trim().takeIf(String::isNotEmpty) }
            .groupingBy { it }.eachCount()
    }

    /** Runs a write, surfacing the server's refusal text verbatim (translated
     *  when it is one of the known messages), then reloads both sides. */
    fun run(failText: String, action: suspend () -> Unit) {
        if (busy) return
        busy = true
        notice = null
        scope.launch {
            try {
                action()
                reload()
                onLocationsChanged()
            } catch (error: Exception) {
                notice = t(error.message ?: failText)
            }
            busy = false
        }
    }

    LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Text(
                t("The places stock lives — a safe holds a drawer holds a tray. Renaming one renames it on every item standing there."),
                fontSize = 11.sp, color = Color.Gray
            )
        }

        notice?.let { text ->
            item { Text(text, fontSize = 12.sp, color = StudioRed) }
        }

        if (canEdit) {
            item {
                Card(colors = inventoryCardColors()) {
                    Column(Modifier.padding(12.dp)) {
                        OutlinedTextField(
                            value = newName,
                            onValueChange = { newName = it },
                            label = { Text(t("New location"), fontSize = 12.sp) },
                            placeholder = { Text("Safe A, Drawer 3…", fontSize = 12.sp) },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(Modifier.height(8.dp))
                        LocationParentPicker(
                            label = t("Inside"),
                            selectedId = newParentId,
                            options = locations.filter { it.depth < 4 },
                            t = t,
                            onPick = { newParentId = it }
                        )
                        Spacer(Modifier.height(8.dp))
                        Button(
                            enabled = !busy && newName.isNotBlank(),
                            onClick = {
                                val name = newName.trim()
                                if (name.isEmpty()) return@Button
                                run("The location could not be saved.") {
                                    repository.inventorySaveLocation(workspaceId, name, newParentId)
                                    newName = ""
                                    newParentId = ""
                                }
                            }
                        ) { Text(t("Add location"), fontSize = 13.sp) }
                    }
                }
            }
        }

        if (loading) {
            item { Text(t("Loading…"), fontSize = 12.sp, color = Color.Gray) }
        } else if (locations.isEmpty()) {
            item {
                Card(colors = inventoryCardColors()) {
                    Column(Modifier.padding(16.dp)) {
                        Text(t("No locations yet"), fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            t("Items can carry any free-typed location; defining them here adds structure and safe renames."),
                            fontSize = 11.sp, color = Color.Gray
                        )
                    }
                }
            }
        } else {
            item {
                Card(colors = inventoryCardColors()) {
                    Column {
                        locations.forEachIndexed { index, location ->
                            if (index > 0) HorizontalDivider()
                            val count = countsByPath[location.path] ?: 0
                            if (editingId == location.id) {
                                Column(Modifier.padding(12.dp)) {
                                    OutlinedTextField(
                                        value = editName,
                                        onValueChange = { editName = it },
                                        singleLine = true,
                                        modifier = Modifier.fillMaxWidth()
                                    )
                                    Spacer(Modifier.height(8.dp))
                                    LocationParentPicker(
                                        label = t("Inside"),
                                        selectedId = editParentId,
                                        // A location cannot move under itself or its own
                                        // descendants (the server re-checks anyway).
                                        options = locations.filter { row ->
                                            row.id != location.id &&
                                                !row.path.startsWith("${location.path} / ") &&
                                                row.depth < 4
                                        },
                                        t = t,
                                        onPick = { editParentId = it }
                                    )
                                    Spacer(Modifier.height(8.dp))
                                    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                        Text(
                                            t("Save"), fontSize = 12.sp, fontWeight = FontWeight.Bold,
                                            color = if (busy || editName.isBlank()) Color.Gray else StudioBlue,
                                            modifier = Modifier.clickable(enabled = !busy && editName.isNotBlank()) {
                                                val name = editName.trim()
                                                run("The location could not be saved.") {
                                                    repository.inventorySaveLocation(workspaceId, name, editParentId, location.id)
                                                    editingId = ""
                                                }
                                            }
                                        )
                                        Text(
                                            t("Cancel"), fontSize = 12.sp, fontWeight = FontWeight.Bold,
                                            color = Color.Gray,
                                            modifier = Modifier.clickable { editingId = "" }
                                        )
                                    }
                                }
                            } else {
                                Row(
                                    Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Spacer(Modifier.width(((location.depth - 1) * 18).dp))
                                    Column(Modifier.weight(1f)) {
                                        Text(location.name, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                                        Text(
                                            if (count > 0) "$count ${t("items here")}" else t("empty"),
                                            fontSize = 11.sp, color = Color.Gray
                                        )
                                    }
                                    if (canEdit) {
                                        Text(
                                            t("Rename / Move"), fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                                            color = if (busy) Color.Gray else StudioBlue,
                                            modifier = Modifier.clickable(enabled = !busy) {
                                                editingId = location.id
                                                editName = location.name
                                                editParentId = location.parentId
                                            }
                                        )
                                        Spacer(Modifier.width(14.dp))
                                        Text(
                                            t("Delete"), fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                                            color = if (busy) Color.Gray else StudioRed,
                                            modifier = Modifier.clickable(enabled = !busy) {
                                                run("The location could not be deleted.") {
                                                    repository.inventoryDeleteLocation(workspaceId, location.id)
                                                }
                                            }
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
