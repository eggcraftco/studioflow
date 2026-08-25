package uk.co.eggcraft.studioflow.features.inventory

// Stocktake and reporting on Android. Same shape as the web and Apple apps:
// a count is a record, not a silent edit, and nothing touches the shelf until
// the whole thing is applied.

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
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
import uk.co.eggcraft.studioflow.data.model.StudioOverPromised
import uk.co.eggcraft.studioflow.data.model.StudioStocktakeLine
import uk.co.eggcraft.studioflow.data.model.StudioStocktakeSummary
import uk.co.eggcraft.studioflow.ui.theme.StudioBlue
import uk.co.eggcraft.studioflow.ui.theme.StudioGreen
import uk.co.eggcraft.studioflow.ui.theme.StudioRed

private fun signedMoney(symbol: String, value: Double, dec: String): String {
    val core = String.format(java.util.Locale.UK, "%,.2f", kotlin.math.abs(value))
    val adjusted = if (dec == ",") core.replace(",", "_").replace(".", ",").replace("_", ".") else core
    return (if (value < 0) "−" else "") + symbol + adjusted
}

@Composable
fun StocktakeTab(
    workspaceId: String,
    symbol: String,
    decimalSeparator: String,
    canEdit: Boolean,
    t: (String) -> String,
    onStockChanged: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val repository = remember { StudioFlowRepository() }

    var summaries by remember { mutableStateOf<List<StudioStocktakeSummary>>(emptyList()) }
    var openId by remember { mutableStateOf("") }
    var lines by remember { mutableStateOf<List<StudioStocktakeLine>>(emptyList()) }
    var counts by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var startLocation by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var outcome by remember { mutableStateOf<Triple<Int, Double, List<StudioOverPromised>>?>(null) }

    suspend fun reload() {
        loading = true
        try {
            summaries = repository.inventoryStocktakes(workspaceId)
            val running = summaries.firstOrNull { it.status == "open" }
            if (running != null) {
                openId = running.id
                lines = repository.inventoryStocktakeLines(workspaceId, running.id)
                counts = lines.filter { it.counted != null }
                    .associate { it.itemId to inventoryQuantity(it.counted!!) }
            } else {
                openId = ""; lines = emptyList(); counts = emptyMap()
            }
            error = null
        } catch (failure: Exception) { error = failure.message }
        loading = false
    }

    LaunchedEffect(workspaceId) { reload() }

    fun countsPayload(): Map<String, Any?> =
        lines.associate { line ->
            val raw = (counts[line.itemId] ?: "").trim()
            line.itemId to if (raw.isEmpty()) null else inventoryParse(raw)
        }

    val countedLines = lines.filter { (counts[it.itemId] ?: "").isNotBlank() }
    val differences = countedLines.filter { inventoryParse(counts[it.itemId] ?: "") != it.expected }
    val valueDelta = differences.sumOf {
        (inventoryParse(counts[it.itemId] ?: "") - it.expected) * it.unitCost
    }

    Column(Modifier.fillMaxWidth()) {
        Text(
            t("Count what is actually on the shelf. The difference is the point — nothing is changed until you apply it."),
            fontSize = 11.sp, color = Color.Gray
        )
        Spacer(Modifier.height(10.dp))

        notice?.let { Text(it, fontSize = 11.sp, color = Color.Gray); Spacer(Modifier.height(6.dp)) }
        error?.let { Text(it, fontSize = 12.sp, color = StudioRed); Spacer(Modifier.height(6.dp)) }

        outcome?.let { (adjusted, delta, over) ->
            Card(colors = inventoryCardColors(), shape = RoundedCornerShape(12.dp)) {
                Column(Modifier.fillMaxWidth().padding(12.dp)) {
                    Row {
                        Text(t("Lines adjusted"), fontSize = 12.sp, modifier = Modifier.weight(1f))
                        Text("$adjusted", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    }
                    Row {
                        Text(t("Change in stock value"), fontSize = 12.sp, modifier = Modifier.weight(1f))
                        Text(signedMoney(symbol, delta, decimalSeparator),
                             fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    }
                    over.forEach { row ->
                        Spacer(Modifier.height(4.dp))
                        Text(row.name, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        Text(
                            "${t("Counted")} ${inventoryQuantity(row.counted)}, ${t("but orders are holding")} ${inventoryQuantity(row.reserved)}",
                            fontSize = 10.sp, color = Color(0xFFB3670F)
                        )
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
        }

        when {
            loading -> Text(t("Loading…"), fontSize = 12.sp, color = Color.Gray)
            openId.isNotBlank() -> {
                Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                    StatCell(t("Counted"), "${countedLines.size} / ${lines.size}")
                    StatCell(t("Differences"), "${differences.size}")
                    StatCell(t("Change in stock value"), signedMoney(symbol, valueDelta, decimalSeparator))
                }
                Spacer(Modifier.height(10.dp))

                LazyColumn(Modifier.weight(1f, fill = false)) {
                    items(lines, key = { it.itemId }) { line ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(line.name, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                                Text(listOf(line.number, line.location).filter { it.isNotBlank() }
                                        .joinToString(" · "),
                                     fontSize = 10.sp, color = Color.Gray)
                            }
                            Text("${inventoryQuantity(line.expected)}${if (line.unit.isBlank()) "" else " ${line.unit}"}",
                                 fontSize = 12.sp, color = Color.Gray)
                            Spacer(Modifier.width(8.dp))
                            OutlinedTextField(
                                value = counts[line.itemId] ?: "",
                                onValueChange = { counts = counts + (line.itemId to it) },
                                enabled = canEdit,
                                singleLine = true,
                                modifier = Modifier.width(78.dp)
                            )
                            Spacer(Modifier.width(8.dp))
                            val raw = (counts[line.itemId] ?: "").trim()
                            if (raw.isEmpty()) {
                                Text(t("Not counted"), fontSize = 10.sp, color = Color.Gray)
                            } else {
                                val diff = inventoryParse(raw) - line.expected
                                Text(
                                    if (diff == 0.0) "—" else (if (diff > 0) "+" else "") + inventoryQuantity(diff),
                                    fontSize = 12.sp,
                                    fontWeight = if (diff == 0.0) FontWeight.Normal else FontWeight.Bold,
                                    color = when { diff == 0.0 -> Color.Gray; diff < 0 -> StudioRed; else -> StudioGreen }
                                )
                            }
                        }
                        HorizontalDivider()
                    }
                }

                if (canEdit) {
                    Spacer(Modifier.height(10.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(t("Abandon this count"), fontSize = 11.sp, color = StudioRed,
                            modifier = Modifier.clickable(enabled = !busy) {
                                scope.launch {
                                    try { repository.inventoryCancelStocktake(workspaceId, openId); reload() }
                                    catch (failure: Exception) { error = failure.message }
                                }
                            })
                        Spacer(Modifier.weight(1f))
                        TextButton(enabled = !busy, onClick = {
                            scope.launch {
                                busy = true
                                try {
                                    repository.inventorySaveStocktakeCounts(workspaceId, openId, countsPayload())
                                    notice = t("Counts saved. Nothing has changed on the shelf yet.")
                                } catch (failure: Exception) { error = failure.message }
                                busy = false
                            }
                        }) { Text(t("Save progress"), fontSize = 12.sp) }
                        Button(enabled = !busy && countedLines.isNotEmpty(), onClick = {
                            scope.launch {
                                busy = true; notice = null
                                try {
                                    // Saved first: what is committed must be what is on screen.
                                    repository.inventorySaveStocktakeCounts(workspaceId, openId, countsPayload())
                                    outcome = repository.inventoryCommitStocktake(workspaceId, openId)
                                    reload()
                                    onStockChanged()
                                } catch (failure: Exception) { error = failure.message }
                                busy = false
                            }
                        }) {
                            Text(if (busy) t("Applying…") else "${t("Apply")} ${differences.size} ${t("differences")}",
                                 fontSize = 12.sp)
                        }
                    }
                }
            }
            else -> {
                Text(t("Start a count"), fontSize = 13.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(4.dp))
                Text(
                    t("Nobody counts a whole workshop at once. Narrow it to a shelf or a category and the expected figures are frozen as you start."),
                    fontSize = 11.sp, color = Color.Gray
                )
                if (canEdit) {
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = startLocation, onValueChange = { startLocation = it },
                        label = { Text(t("Location"), fontSize = 12.sp) },
                        placeholder = { Text(t("Everything"), fontSize = 12.sp) },
                        singleLine = true, modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    Button(enabled = !busy, onClick = {
                        scope.launch {
                            busy = true; outcome = null
                            try {
                                repository.inventoryStartStocktake(workspaceId, startLocation, "")
                                reload()
                            } catch (failure: Exception) { error = failure.message }
                            busy = false
                        }
                    }) { Text(if (busy) t("Starting…") else t("Start a count"), fontSize = 12.sp) }
                }

                Spacer(Modifier.height(14.dp))
                if (summaries.isEmpty()) {
                    Text(t("No counts yet"), fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Text(t("A count tells you what is really there. The first one usually finds something."),
                         fontSize = 11.sp, color = Color.Gray)
                } else {
                    summaries.forEach { row ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(row.number, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                Text(listOf(row.location, row.category, row.startedByEmail)
                                        .filter { it.isNotBlank() }.joinToString(" · "),
                                     fontSize = 10.sp, color = Color.Gray)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text("${row.countedCount} / ${row.lineCount}", fontSize = 12.sp)
                                if (row.status == "committed") {
                                    Text(signedMoney(symbol, row.valueDelta, decimalSeparator),
                                         fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                }
                            }
                            Spacer(Modifier.width(8.dp))
                            InventoryPill(
                                t(when (row.status) {
                                    "committed" -> "Applied"; "open" -> "In progress"; else -> "Abandoned"
                                }),
                                if (row.status == "committed") StudioGreen else StudioBlue
                            )
                        }
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}

@Composable
private fun StatCell(label: String, value: String) {
    Column {
        Text(label, fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Color.Gray)
        Text(value, fontSize = 15.sp, fontWeight = FontWeight.Bold)
    }
}
