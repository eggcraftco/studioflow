package uk.co.eggcraft.studioflow.features.inventory

// Opening stock on Android.
//
// Same idea as everywhere else in this feature: an import you cannot see before
// it happens is worse than typing. Nothing is written until the person has seen
// exactly what will be created, and every skipped row says why. The reading —
// splitting the paste, guessing the columns, building the rows — happens on the
// server, so a list reads the same here as on the web and the Apple apps.

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import uk.co.eggcraft.studioflow.data.firebase.StudioFlowRepository
import uk.co.eggcraft.studioflow.data.model.StudioOpeningStockRead
import uk.co.eggcraft.studioflow.data.model.StudioTrackingType
import uk.co.eggcraft.studioflow.data.model.studioOpeningStockFields
import uk.co.eggcraft.studioflow.ui.theme.StudioBlue
import uk.co.eggcraft.studioflow.ui.theme.StudioRed
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun OpeningStockDialog(
    workspaceId: String,
    symbol: String,
    t: (String) -> String,
    onDismiss: () -> Unit,
    onImported: (Int) -> Unit
) {
    val scope = rememberCoroutineScope()
    val repository = remember { StudioFlowRepository() }

    var raw by remember { mutableStateOf("") }
    var hasHeader by remember { mutableStateOf(true) }
    var mapping by remember { mutableStateOf<List<String>>(emptyList()) }
    var defaultType by remember { mutableStateOf(StudioTrackingType.Quantity) }
    var typeOverrides by remember { mutableStateOf<Map<Int, StudioTrackingType>>(emptyMap()) }
    var openingDate by remember {
        mutableStateOf(SimpleDateFormat("yyyy-MM-dd", Locale.UK).format(Date()))
    }
    var read by remember { mutableStateOf(StudioOpeningStockRead()) }
    var reading by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    // A paste is one deliberate act and a remap is another, so the read is
    // debounced rather than fired on every keystroke.
    LaunchedEffect(raw, hasHeader, defaultType, typeOverrides, mapping) {
        if (raw.isBlank()) { read = StudioOpeningStockRead(); return@LaunchedEffect }
        reading = true
        delay(400)
        try {
            read = repository.inventoryReadOpeningStock(
                workspaceId, raw, hasHeader, mapping, defaultType, typeOverrides)
            error = null
        } catch (failure: Exception) {
            error = failure.message
        }
        reading = false
    }

    val willImport = read.items.take(read.maxRows)
    val overflow = (read.items.size - read.maxRows).coerceAtLeast(0)
    val totalValue = willImport.sumOf { it.lineValue }
    val hasNameColumn = read.mapping.contains("name")
    // Rows the server matched to stock already on the shelf (serial beats SKU).
    // What happens to them is a choice, and the safe default is to leave them.
    val duplicates = willImport.count { it.existingItemId.isNotBlank() }
    var duplicatePolicy by remember { mutableStateOf("skip") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(t("Import opening stock"), fontSize = 17.sp, fontWeight = FontWeight.Bold) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()).heightIn(max = 460.dp)) {
                Text(
                    t("Paste straight from a spreadsheet, or choose a CSV file. Nothing is created until you have seen the preview below."),
                    fontSize = 11.sp, color = Color.Gray
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = raw,
                    onValueChange = { raw = it; mapping = emptyList(); typeOverrides = emptyMap() },
                    label = { Text(t("Your list"), fontSize = 12.sp) },
                    textStyle = androidx.compose.ui.text.TextStyle(
                        fontFamily = FontFamily.Monospace, fontSize = 12.sp),
                    modifier = Modifier.fillMaxWidth().heightIn(min = 110.dp)
                )
                if (reading) {
                    Spacer(Modifier.height(4.dp))
                    Text(t("Reading your list…"), fontSize = 11.sp, color = Color.Gray)
                }

                if (read.grid.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = hasHeader, onCheckedChange = { hasHeader = it })
                        Text(t("The first row is a header, not an item."), fontSize = 12.sp)
                    }

                    Spacer(Modifier.height(8.dp))
                    HorizontalDivider()
                    Spacer(Modifier.height(8.dp))
                    Text(t("Which column is what"), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(6.dp))
                    (read.grid.firstOrNull() ?: emptyList()).forEachIndexed { index, _ ->
                        val header = read.headers.getOrNull(index).orEmpty()
                        ColumnMapRow(
                            title = if (hasHeader && header.isNotBlank()) header
                                    else "${t("Column")} ${index + 1}",
                            selected = read.mapping.getOrNull(index).orEmpty(),
                            t = t
                        ) { key ->
                            val next = read.mapping.toMutableList()
                            while (next.size <= index) next.add("")
                            // One field, one column: taking it from another leaves that unmapped.
                            if (key.isNotBlank()) {
                                next.indices.forEach { if (next[it] == key && it != index) next[it] = "" }
                            }
                            next[index] = key
                            mapping = next
                        }
                    }
                    if (!hasNameColumn) {
                        Text(
                            t("Point one column at Name — an item without a name cannot exist."),
                            fontSize = 11.sp, color = StudioRed
                        )
                    }
                }

                if (hasNameColumn) {
                    Spacer(Modifier.height(10.dp))
                    HorizontalDivider()
                    Spacer(Modifier.height(8.dp))
                    Text(t("How to treat these"), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(6.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        StudioTrackingType.entries.forEach { entry ->
                            Text(
                                t(if (entry == StudioTrackingType.Unique) "Unique Items" else "Quantity Items"),
                                fontSize = 12.sp,
                                fontWeight = if (defaultType == entry) FontWeight.Bold else FontWeight.Normal,
                                color = if (defaultType == entry) StudioBlue else Color.Gray,
                                modifier = Modifier.clickable { defaultType = entry }
                            )
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = openingDate,
                        onValueChange = { openingDate = it },
                        label = { Text(t("Opening date"), fontSize = 12.sp) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        t("The opening date is when this stock is counted as being on the shelf. A row that carries its own purchase date keeps it."),
                        fontSize = 10.sp, color = Color.Gray
                    )

                    Spacer(Modifier.height(10.dp))
                    HorizontalDivider()
                    Spacer(Modifier.height(8.dp))
                    Row {
                        Text(t("What will be created"), fontSize = 12.sp, fontWeight = FontWeight.Bold,
                             modifier = Modifier.weight(1f))
                        Text(
                            "${willImport.size} ${t("items")}" +
                                if (totalValue > 0) " · ${inventoryMoney(symbol, totalValue)}" else "",
                            fontSize = 11.sp, color = Color.Gray
                        )
                    }
                    Spacer(Modifier.height(6.dp))

                    if (willImport.isEmpty()) {
                        Text(t("Nothing here can be imported yet."), fontSize = 12.sp, color = Color.Gray)
                    } else {
                        willImport.take(50).forEach { row ->
                            Row(Modifier.fillMaxWidth().padding(vertical = 5.dp),
                                verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(row.name, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                                        if (row.existingItemId.isNotBlank()) {
                                            Spacer(Modifier.width(6.dp))
                                            InventoryPill(t("Already in stock"), StudioBlue)
                                        }
                                    }
                                    if (row.existingItemId.isNotBlank()) {
                                        Text(
                                            "${t("Already on the shelf as")} ${row.existingNumber}",
                                            fontSize = 10.sp, color = StudioBlue
                                        )
                                    }
                                    Text(
                                        listOf(
                                            t(row.category),
                                            if (row.trackingType == StudioTrackingType.Quantity)
                                                inventoryQuantity(row.onHand) +
                                                    (if (row.unit.isBlank()) "" else " ${row.unit}")
                                            else "",
                                            row.location
                                        ).filter { it.isNotBlank() }.joinToString(" · "),
                                        fontSize = 10.sp, color = Color.Gray
                                    )
                                }
                                Text(inventoryMoney(symbol, row.lineValue),
                                     fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                Spacer(Modifier.width(10.dp))
                                // Tapping the type corrects one row: a real list is mixed,
                                // and the default cannot be right for all of it.
                                Box(Modifier.clickable {
                                    typeOverrides = typeOverrides + (row.rowIndex to
                                        if (row.trackingType == StudioTrackingType.Unique)
                                            StudioTrackingType.Quantity else StudioTrackingType.Unique)
                                }) {
                                    InventoryPill(t(row.trackingType.label), StudioBlue)
                                }
                            }
                        }
                        if (willImport.size > 50) {
                            Text("${t("Showing the first 50 of")} ${willImport.size}.",
                                 fontSize = 11.sp, color = Color.Gray)
                        }
                    }

                    if (duplicates > 0) {
                        Spacer(Modifier.height(10.dp))
                        HorizontalDivider()
                        Spacer(Modifier.height(8.dp))
                        Text("$duplicates ${t("rows match stock you already have")}",
                             fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            t("Matched by SKU or serial number. Choose what the import should do with them."),
                            fontSize = 11.sp, color = Color.Gray
                        )
                        Spacer(Modifier.height(6.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            listOf(
                                "skip" to "Skip them",
                                "update" to "Update existing",
                                "create" to "Create anyway"
                            ).forEach { (key, label) ->
                                Text(
                                    t(label),
                                    fontSize = 12.sp,
                                    fontWeight = if (duplicatePolicy == key) FontWeight.Bold
                                                 else FontWeight.Normal,
                                    color = if (duplicatePolicy == key) StudioBlue else Color.Gray,
                                    modifier = Modifier.clickable { duplicatePolicy = key }
                                )
                            }
                        }
                        Spacer(Modifier.height(4.dp))
                        Text(
                            t(when (duplicatePolicy) {
                                "update" -> "The sheet becomes the truth about what each item is; its number, status and reservations stay untouched."
                                "create" -> "Every row becomes a new item, even the matched ones."
                                else -> "Matched rows are left out; only new stock is created."
                            }),
                            fontSize = 10.sp, color = Color.Gray
                        )
                    }

                    if (read.skipped.isNotEmpty()) {
                        Spacer(Modifier.height(10.dp))
                        Text("${read.skipped.size} ${t("rows will be skipped")}",
                             fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        read.skipped.take(8).forEach { row ->
                            Spacer(Modifier.height(4.dp))
                            Column {
                                Text(row.name.ifBlank { t("(no name)") },
                                     fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                Text(t(row.message), fontSize = 10.sp, color = Color.Gray)
                            }
                        }
                        if (read.skipped.size > 8) {
                            Text("${t("and")} ${read.skipped.size - 8} ${t("more")}.",
                                 fontSize = 11.sp, color = Color.Gray)
                        }
                    }

                    if (overflow > 0) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "${t("One import carries at most 500 items.")} $overflow " +
                                t("rows past that will be left out — import them as a second batch."),
                            fontSize = 11.sp, color = StudioRed
                        )
                    }
                }

                error?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, fontSize = 12.sp, color = StudioRed)
                }

                Spacer(Modifier.height(10.dp))
                Text(t("Everything arrives as available stock, valued at what you paid."),
                     fontSize = 11.sp, color = Color.Gray)
            }
        },
        confirmButton = {
            TextButton(
                enabled = !saving && willImport.isNotEmpty(),
                onClick = {
                    saving = true
                    error = null
                    scope.launch {
                        try {
                            val count = repository.inventoryImportOpeningStock(
                                workspaceId, willImport.map { it.payload }, openingDate,
                                if (duplicates > 0) duplicatePolicy else null)
                            onImported(count)
                        } catch (failure: Exception) {
                            error = failure.message
                            saving = false
                        }
                    }
                }
            ) {
                Text(if (saving) t("Importing…")
                     else "${t("Import")} ${willImport.size} ${t("items")}")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Cancel")) } }
    )
}

@Composable
private fun ColumnMapRow(
    title: String,
    selected: String,
    t: (String) -> String,
    onPick: (String) -> Unit
) {
    var open by remember { mutableStateOf(false) }
    val label = studioOpeningStockFields.firstOrNull { it.first == selected }?.second
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, fontSize = 12.sp, modifier = Modifier.weight(1f))
        Box {
            Text(
                if (label == null) t("Ignore this column") else t(label),
                fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = StudioBlue,
                modifier = Modifier.clickable { open = true }
            )
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                DropdownMenuItem(
                    text = { Text(t("Ignore this column"), fontSize = 13.sp) },
                    onClick = { open = false; onPick("") }
                )
                studioOpeningStockFields.forEach { (key, fieldLabel) ->
                    DropdownMenuItem(
                        text = { Text(t(fieldLabel), fontSize = 13.sp) },
                        onClick = { open = false; onPick(key) }
                    )
                }
            }
        }
    }
}
