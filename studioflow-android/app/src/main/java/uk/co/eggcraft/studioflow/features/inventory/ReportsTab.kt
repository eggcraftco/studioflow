package uk.co.eggcraft.studioflow.features.inventory

// Valuation and reporting on Android. "Worth" comes off the shelf; "what
// happened" comes from the movement ledger, and only for the time the ledger
// has existed — which the screen says out loud.

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uk.co.eggcraft.studioflow.data.firebase.StudioFlowRepository
import uk.co.eggcraft.studioflow.data.model.StudioInventoryReport
import uk.co.eggcraft.studioflow.ui.theme.StudioRed
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private fun signed(symbol: String, value: Double, dec: String): String {
    val core = String.format(Locale.UK, "%,.2f", kotlin.math.abs(value))
    val adjusted = if (dec == ",") core.replace(",", "_").replace(".", ",").replace("_", ".") else core
    return (if (value < 0) "−" else "") + symbol + adjusted
}

@Composable
fun ReportsTab(
    workspaceId: String,
    symbol: String,
    decimalSeparator: String,
    t: (String) -> String
) {
    val repository = remember { StudioFlowRepository() }
    var report by remember { mutableStateOf<StudioInventoryReport?>(null) }
    var days by remember { mutableIntStateOf(30) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(workspaceId, days) {
        loading = true
        try {
            val to = System.currentTimeMillis()
            report = repository.inventoryReport(workspaceId, to - days * 86_400_000L, to)
            error = null
        } catch (failure: Exception) { error = failure.message }
        loading = false
    }

    Column(Modifier.fillMaxWidth()) {
        Text(t("What the stock is worth today, and what has moved."), fontSize = 11.sp, color = Color.Gray)
        Spacer(Modifier.height(10.dp))
        error?.let { Text(it, fontSize = 12.sp, color = StudioRed); Spacer(Modifier.height(6.dp)) }

        val current = report
        if (loading && current == null) {
            Text(t("Loading…"), fontSize = 12.sp, color = Color.Gray)
        } else if (current != null) {
            Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                Cell(t("Stock on the shelf"), signed(symbol, current.totalValue, decimalSeparator))
                Cell(t("Came in"), signed(symbol, current.inValue, decimalSeparator))
                Cell(t("Went out"), signed(symbol, current.outValue, decimalSeparator))
            }
            Spacer(Modifier.height(10.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(30 to "Last 30 days", 90 to "Last 90 days", 365 to "Last 12 months").forEach { (d, label) ->
                    FilterChip(selected = days == d, onClick = { days = d },
                               label = { Text(t(label), fontSize = 11.sp) })
                }
            }
            Spacer(Modifier.height(8.dp))

            if (!current.coversWholePeriod) {
                Text(
                    if (current.ledgerStartsMs > 0)
                        "${t("Movements are only recorded from")} ${SimpleDateFormat("d MMM yyyy", Locale.getDefault()).format(Date(current.ledgerStartsMs))}. ${t("Anything before that is not missing — it was never watched.")}"
                    else t("No movements have been recorded yet. They start the first time stock changes."),
                    fontSize = 10.sp, color = Color.Gray
                )
                Spacer(Modifier.height(8.dp))
            }

            Section(t("What it is worth, by category")) {
                if (current.byCategory.isEmpty()) {
                    Text(t("Nothing on the shelf."), fontSize = 11.sp, color = Color.Gray)
                } else current.byCategory.forEach { row ->
                    Row {
                        Text(t(row.name), fontSize = 12.sp, modifier = Modifier.weight(1f))
                        Text(signed(symbol, row.value, decimalSeparator),
                             fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }

            Section(t("What moved")) {
                if (current.byKind.isEmpty()) {
                    Text(t("Nothing moved in this period."), fontSize = 11.sp, color = Color.Gray)
                } else current.byKind.forEach { row ->
                    Row {
                        Text(t(row.kind.label), fontSize = 12.sp, modifier = Modifier.weight(1f))
                        Text("${row.lines} ${t(if (row.lines == 1) "line" else "lines")} · ${signed(symbol, row.value, decimalSeparator)}",
                             fontSize = 11.sp, color = Color.Gray)
                    }
                }
            }

            if (current.lowStock.isNotEmpty()) {
                Section(t("Running low")) {
                    current.lowStock.forEach { row ->
                        Row {
                            Text(row.name, fontSize = 12.sp, modifier = Modifier.weight(1f))
                            Text("${inventoryQuantity(row.onHand)}${if (row.unit.isBlank()) "" else " ${row.unit}"} / ${inventoryQuantity(row.lowStockAt)}",
                                 fontSize = 11.sp, color = Color(0xFFB3670F))
                        }
                    }
                }
            }

            if (current.deadStock.isNotEmpty()) {
                Section(t("Money sitting still")) {
                    Text("${t("Nothing has happened to these for")} ${current.deadStockAfterDays} ${t("days or more.")}",
                         fontSize = 10.sp, color = Color.Gray)
                    current.deadStock.forEach { row ->
                        Row {
                            Text(row.name, fontSize = 12.sp, modifier = Modifier.weight(1f))
                            Text("${row.idleDays} ${t("days")} · ${signed(symbol, row.value, decimalSeparator)}",
                                 fontSize = 11.sp, color = Color.Gray)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Cell(label: String, value: String) {
    Column {
        Text(label, fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Color.Gray)
        Text(value, fontSize = 15.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Text(title, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(4.dp))
        content()
        Spacer(Modifier.height(4.dp))
        HorizontalDivider()
    }
}
