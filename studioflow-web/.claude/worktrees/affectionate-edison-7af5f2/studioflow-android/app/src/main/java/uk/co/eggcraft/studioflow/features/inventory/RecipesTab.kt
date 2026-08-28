package uk.co.eggcraft.studioflow.features.inventory

// A recipe is a job's parts list, written once: "1 buckle + 20cm leather +
// 2 screws". The order card applies it in one act — the server reserves every
// line in ONE transaction, all or nothing. This tab only writes the lists;
// nothing here moves stock.

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import uk.co.eggcraft.studioflow.data.model.StudioInventoryRecipe
import uk.co.eggcraft.studioflow.data.model.StudioInventoryStatus
import uk.co.eggcraft.studioflow.data.model.StudioTrackingType
import uk.co.eggcraft.studioflow.ui.theme.StudioBlue
import uk.co.eggcraft.studioflow.ui.theme.StudioRed

/** One row of the editor while it is still text: the picked item plus whatever
 *  the person has typed for the quantity, valid or not yet. */
private data class RecipeDraftLine(val itemId: String, val quantity: String)

/** The same readOnly-field-plus-menu pattern as the location parent picker.
 *  [choices] is already filtered by the caller to business stock still in play. */
@Composable
private fun RecipeItemPicker(
    selectedLabel: String,
    choices: List<StudioInventoryItem>,
    onPick: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        OutlinedTextField(
            value = selectedLabel,
            onValueChange = {},
            readOnly = true,
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Box(Modifier.matchParentSize().clickable { open = true })
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            choices.forEach { item ->
                DropdownMenuItem(
                    text = {
                        Text(
                            item.name + if (item.number.isBlank()) "" else " (${item.number})",
                            fontSize = 13.sp
                        )
                    },
                    onClick = { open = false; onPick(item.id) }
                )
            }
        }
    }
}

@Composable
fun RecipesTab(
    workspaceId: String,
    items: List<StudioInventoryItem>,
    canEdit: Boolean,
    t: (String) -> String
) {
    val scope = rememberCoroutineScope()
    val repository = remember { StudioFlowRepository() }

    var recipes by remember { mutableStateOf<List<StudioInventoryRecipe>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }
    var editorOpen by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<StudioInventoryRecipe?>(null) }

    suspend fun reload() {
        try {
            recipes = repository.inventoryRecipes(workspaceId)
        } catch (error: Exception) {
            notice = t(error.message ?: "Recipes could not be loaded.")
        }
        loading = false
    }

    LaunchedEffect(workspaceId) {
        if (workspaceId.isNotBlank()) reload()
    }

    val itemById = remember(items) { items.associateBy { it.id } }

    LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Text(
                t("A job's parts list, written once. Applying it to an order reserves every line in one act — all or nothing."),
                fontSize = 11.sp, color = Color.Gray
            )
        }

        notice?.let { text ->
            item { Text(text, fontSize = 12.sp, color = StudioRed) }
        }

        if (canEdit) {
            item {
                Button(
                    enabled = !busy,
                    onClick = { editing = null; editorOpen = true }
                ) { Text(t("New recipe"), fontSize = 13.sp) }
            }
        }

        if (loading) {
            item { Text(t("Loading…"), fontSize = 12.sp, color = Color.Gray) }
        } else if (recipes.isEmpty()) {
            item {
                Card(colors = inventoryCardColors()) {
                    Column(Modifier.padding(16.dp)) {
                        Text(t("No recipes yet"), fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            t("Write the parts a repeated job takes, and the order card reserves them in one click."),
                            fontSize = 11.sp, color = Color.Gray
                        )
                    }
                }
            }
        } else {
            item {
                Card(colors = inventoryCardColors()) {
                    Column {
                        recipes.forEachIndexed { index, recipe ->
                            if (index > 0) HorizontalDivider()
                            Row(
                                Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(recipe.name, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                                    // "2 pcs × Deri kayış · 1 × Omega 1120" — joined
                                    // against the loaded items; a line whose item was
                                    // deleted says so instead of vanishing.
                                    val summary = recipe.lines.joinToString(" · ") { line ->
                                        val item = itemById[line.itemId]
                                        val unit = if (
                                            item != null &&
                                            item.trackingType == StudioTrackingType.Quantity &&
                                            item.unit.isNotBlank()
                                        ) " ${item.unit}" else ""
                                        inventoryQuantity(line.quantity) + unit + " × " +
                                            (item?.name ?: t("(missing item)"))
                                    } + (if (recipe.notes.isBlank()) "" else " — ${recipe.notes}")
                                    Text(summary, fontSize = 11.sp, color = Color.Gray)
                                }
                                if (canEdit) {
                                    Text(
                                        t("Edit"), fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                                        color = if (busy) Color.Gray else StudioBlue,
                                        modifier = Modifier.clickable(enabled = !busy) {
                                            editing = recipe
                                            editorOpen = true
                                        }
                                    )
                                    Spacer(Modifier.width(14.dp))
                                    Text(
                                        t("Delete"), fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                                        color = if (busy) Color.Gray else StudioRed,
                                        modifier = Modifier.clickable(enabled = !busy) {
                                            busy = true
                                            notice = null
                                            scope.launch {
                                                try {
                                                    repository.inventoryDeleteRecipe(workspaceId, recipe.id)
                                                    reload()
                                                } catch (error: Exception) {
                                                    notice = t(error.message ?: "The recipe could not be deleted.")
                                                }
                                                busy = false
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

    if (editorOpen) {
        RecipeEditorDialog(
            workspaceId = workspaceId,
            existing = editing,
            // Only what a recipe can honestly promise: business stock still in
            // play — nothing sold, used, archived or removed, and never a
            // customer's own property.
            choices = items.filter { item ->
                !item.isCustomerOwned && item.status !in listOf(
                    StudioInventoryStatus.Sold, StudioInventoryStatus.Used,
                    StudioInventoryStatus.Archived, StudioInventoryStatus.Removed
                )
            },
            itemById = itemById,
            t = t,
            onDismiss = { editorOpen = false },
            onSaved = {
                editorOpen = false
                scope.launch { reload() }
            }
        )
    }
}

@Composable
private fun RecipeEditorDialog(
    workspaceId: String,
    existing: StudioInventoryRecipe?,
    choices: List<StudioInventoryItem>,
    itemById: Map<String, StudioInventoryItem>,
    t: (String) -> String,
    onDismiss: () -> Unit,
    onSaved: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val repository = remember { StudioFlowRepository() }
    var name by remember { mutableStateOf(existing?.name ?: "") }
    var notes by remember { mutableStateOf(existing?.notes ?: "") }
    var lines by remember {
        mutableStateOf(
            existing?.lines?.takeIf { it.isNotEmpty() }
                ?.map { RecipeDraftLine(it.itemId, inventoryQuantity(it.quantity)) }
                ?: listOf(RecipeDraftLine("", "1"))
        )
    }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                t(if (existing != null) "Edit recipe" else "New recipe"),
                fontSize = 17.sp, fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()).heightIn(max = 420.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(t("Name"), fontSize = 12.sp) },
                    placeholder = { Text(t("Strap job, full service…"), fontSize = 12.sp) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text(t("Notes"), fontSize = 12.sp) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        t("Parts"), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.Gray,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        "+ " + t("Add line"), fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                        color = StudioBlue,
                        modifier = Modifier.clickable { lines = lines + RecipeDraftLine("", "1") }
                    )
                }
                Spacer(Modifier.height(4.dp))
                lines.forEachIndexed { index, line ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RecipeItemPicker(
                            selectedLabel = when {
                                line.itemId.isBlank() -> t("Choose an item…")
                                else -> itemById[line.itemId]?.name ?: t("(missing item)")
                            },
                            choices = choices,
                            onPick = { picked ->
                                lines = lines.mapIndexed { position, row ->
                                    if (position == index) row.copy(itemId = picked) else row
                                }
                            },
                            modifier = Modifier.weight(1f)
                        )
                        Spacer(Modifier.width(8.dp))
                        OutlinedTextField(
                            value = line.quantity,
                            onValueChange = { typed ->
                                lines = lines.mapIndexed { position, row ->
                                    if (position == index) row.copy(quantity = typed) else row
                                }
                            },
                            singleLine = true,
                            modifier = Modifier.width(78.dp)
                        )
                        if (lines.size > 1) {
                            Spacer(Modifier.width(8.dp))
                            Text(
                                t("Remove"), fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                                color = StudioRed,
                                modifier = Modifier.clickable {
                                    lines = lines.filterIndexed { position, _ -> position != index }
                                }
                            )
                        }
                    }
                }
                error?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, fontSize = 12.sp, color = StudioRed)
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !busy,
                onClick = {
                    val cleaned = lines.mapNotNull { row ->
                        val quantity = inventoryParse(row.quantity)
                        if (row.itemId.isBlank() || quantity <= 0) null
                        else mapOf<String, Any?>("itemId" to row.itemId, "quantity" to quantity)
                    }
                    if (name.trim().isEmpty() || cleaned.isEmpty()) {
                        error = t("A recipe needs a name and at least one line.")
                        return@TextButton
                    }
                    busy = true
                    error = null
                    scope.launch {
                        try {
                            repository.inventorySaveRecipe(
                                workspaceId, name.trim(), notes.trim(), cleaned, existing?.id ?: ""
                            )
                            onSaved()
                        } catch (failure: Exception) {
                            error = t(failure.message ?: "The recipe could not be saved.")
                            busy = false
                        }
                    }
                }
            ) { Text(t(if (busy) "Saving…" else "Save recipe"), fontSize = 13.sp) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Cancel")) } }
    )
}
