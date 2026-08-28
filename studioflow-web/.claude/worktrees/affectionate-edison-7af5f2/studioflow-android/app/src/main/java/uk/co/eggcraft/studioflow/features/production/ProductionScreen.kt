package uk.co.eggcraft.studioflow.features.production

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import uk.co.eggcraft.studioflow.data.firebase.StudioFlowRepository
import uk.co.eggcraft.studioflow.data.model.StudioOrder
import uk.co.eggcraft.studioflow.features.shell.StudioFlowUiState
import uk.co.eggcraft.studioflow.language.LocalStudioLanguage
import uk.co.eggcraft.studioflow.language.studioT
import java.util.Calendar
import java.util.Date
import java.util.concurrent.TimeUnit

/**
 * Production — the operations layer between Orders ("what was ordered") and
 * Schedule ("when is it due"). One question: where is every live job right now,
 * and what has stopped.
 *
 * Production status is deliberately kept apart from order, payment and delivery
 * status; the note at the foot of the screen says so out loud, because
 * conflating them is how a workshop loses track of its own work.
 */
@Composable
fun ProductionScreen(state: StudioFlowUiState, onOpenOrder: (StudioOrder) -> Unit = {}) {
    val lang = LocalStudioLanguage.current
    val t: (String) -> String = { studioT(it, lang) }
    val scope = rememberCoroutineScope()
    val repository = remember { StudioFlowRepository() }
    val workspaceId = state.workspace?.id.orEmpty()
    val canEdit = state.workspace?.isOwner == true ||
        state.workspace?.memberAccess?.allows("orders") == true

    var stages by remember { mutableStateOf(defaultProductionStages) }
    var search by remember { mutableStateOf("") }
    var showDelivered by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<StudioOrder?>(null) }
    var blockerFor by remember { mutableStateOf<Pair<StudioOrder, String>?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var lastMove by remember { mutableStateOf<Triple<String, String, ProductionBlocker?>?>(null) }

    LaunchedEffect(workspaceId) {
        if (workspaceId.isNotEmpty()) stages = repository.productionStages(workspaceId)
    }

    val steps = state.workspaceSettings.customSteps
        .map { it.trim() }
        .filter { it.isNotEmpty() }
        .map { it.lowercase() to it }
        .ifEmpty { listOf("design" to "Design", "painting" to "Painting") }

    data class Card(
        val order: StudioOrder,
        val resolved: ResolvedProductionStage,
        val dueDate: Date?,
        val isLate: Boolean,
        val isAtRisk: Boolean
    )

    val today = Calendar.getInstance().apply {
        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }.time

    val cards = state.orders
        .filter { !it.isDeleted }
        .filter { showDelivered || !it.isDelivered }
        .filter {
            search.isBlank() ||
                "${it.customerName} ${it.designName} ${it.watchRef}".lowercase().contains(search.lowercase())
        }
        .map { order ->
            val resolved = resolveProductionStage(order, stages, steps)
            val due = Calendar.getInstance().apply {
                time = order.paymentDate
                add(Calendar.DAY_OF_YEAR, order.deliveryTime)
            }.time
            val daysLeft = TimeUnit.MILLISECONDS.toDays(due.time - today.time)
            val finished = resolved.total > 0 && resolved.doneCount >= resolved.total
            Card(
                order = order,
                resolved = resolved,
                dueDate = due,
                isLate = daysLeft < 0 && !order.isDelivered,
                isAtRisk = (order.risk.isNotBlank() && order.risk != "None" && order.risk != "-") ||
                    (daysLeft in 0..3 && !finished && !order.isDelivered)
            )
        }
        .sortedBy { it.dueDate?.time ?: Long.MAX_VALUE }

    val doneStageId = stages.firstOrNull { it.kind == ProductionStageKind.Done }?.id.orEmpty()
    val live = cards.filter { it.resolved.stageId != doneStageId }
    val blockedIds = stages.filter { it.kind == ProductionStageKind.Blocked }.map { it.id }.toSet()
    val shipIds = stages.filter { it.kind == ProductionStageKind.ShipReady }.map { it.id }.toSet()

    suspend fun move(order: StudioOrder, stageId: String, blocker: ProductionBlocker?) {
        busy = true
        try {
            val (previousOverride, previousBlocker) =
                repository.setOrderProductionStage(workspaceId, order.id, stageId, blocker)
            lastMove = Triple(order.id, previousOverride, previousBlocker)
            notice = null
        } catch (error: Exception) {
            notice = error.message
        }
        busy = false
    }

    fun requestMove(order: StudioOrder, stageId: String) {
        val target = stages.firstOrNull { it.id == stageId } ?: return
        selected = null
        // The blocked lane is the one place the board asks a question before it
        // accepts a card: a job that goes quiet without a reason is the exact
        // failure this screen exists to prevent.
        if (target.kind == ProductionStageKind.Blocked) {
            blockerFor = order to stageId
            return
        }
        scope.launch { move(order, stageId, null) }
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(t("Production"), fontSize = 20.sp, fontWeight = FontWeight.Bold)
        Text(
            t("See every active order, current production stage and blocker in one place."),
            fontSize = 12.sp, color = Color.Gray
        )
        notice?.let { Text(it, fontSize = 12.sp, color = MaterialTheme.colorScheme.error) }

        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Kpi(t("Active"), live.size)
            Kpi(t("Due this week"), live.count {
                val due = it.dueDate ?: return@count false
                TimeUnit.MILLISECONDS.toDays(due.time - today.time) in 0..7
            })
            Kpi(t("Blocked"), live.count { it.resolved.stageId in blockedIds })
            Kpi(t("At risk"), live.count { it.isAtRisk })
            Kpi(t("Ready to ship"), live.count { it.resolved.stageId in shipIds })
        }

        OutlinedTextField(
            value = search,
            onValueChange = { search = it },
            singleLine = true,
            placeholder = { Text(t("Search order, customer or item"), fontSize = 13.sp) },
            modifier = Modifier.fillMaxWidth()
        )

        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = { showDelivered = !showDelivered }) {
                Text(
                    (if (showDelivered) "☑ " else "☐ ") + t("Show delivered"),
                    fontSize = 12.sp
                )
            }
            lastMove?.let { (orderId, previousOverride, previousBlocker) ->
                TextButton(onClick = {
                    lastMove = null
                    scope.launch {
                        try {
                            repository.undoOrderProductionStage(workspaceId, orderId, previousOverride, previousBlocker)
                        } catch (error: Exception) {
                            notice = error.message
                        }
                    }
                }) { Text(t("Undo"), fontSize = 12.sp) }
            }
        }

        // A phone has nowhere to put a 250dp lane, so the same lanes are
        // stacked and each carries its own count and capacity.
        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            stages.forEach { stage ->
                val rows = cards.filter { it.resolved.stageId == stage.id }
                item(key = "head-${stage.id}") {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(
                                t(stage.title).uppercase(),
                                fontSize = 11.sp, fontWeight = FontWeight.Bold,
                                color = stageTint(stage.kind)
                            )
                            Text(
                                if (stage.wipLimit > 0) "${rows.size} / ${stage.wipLimit}" else "${rows.size}",
                                fontSize = 11.sp, color = Color.Gray
                            )
                        }
                        if (stage.wipLimit > 0) {
                            // The capacity bar warns; it never blocks.
                            LinearProgressIndicator(
                                progress = { (rows.size.toFloat() / stage.wipLimit).coerceIn(0f, 1f) },
                                color = wipTint(productionWipLevel(rows.size, stage.wipLimit)),
                                modifier = Modifier.fillMaxWidth().height(3.dp).clip(RoundedCornerShape(2.dp))
                            )
                        }
                    }
                }
                if (rows.isEmpty()) {
                    item(key = "empty-${stage.id}") {
                        Text(t("Nothing here"), fontSize = 12.sp, color = Color.Gray)
                    }
                } else {
                    rows.forEach { card ->
                        item(key = "${stage.id}-${card.order.id}") {
                            Card(
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(
                                    Modifier.padding(10.dp).fillMaxWidth(),
                                    verticalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Text(
                                        "#${card.order.watchRef.ifEmpty { card.order.id.take(6) }} · ${card.order.displayCustomerName}",
                                        fontSize = 11.sp, color = Color.Gray
                                    )
                                    Text(card.order.designName, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                                    if (card.resolved.total > 0) {
                                        Text(
                                            "${card.resolved.doneCount} / ${card.resolved.total} ${t("steps")}",
                                            fontSize = 11.sp, color = Color.Gray
                                        )
                                    }
                                    card.resolved.blocker?.let { blocker ->
                                        Text(
                                            blocker.note.ifEmpty { t(blocker.label) },
                                            fontSize = 11.sp,
                                            color = MaterialTheme.colorScheme.error,
                                            fontWeight = FontWeight.SemiBold
                                        )
                                    }
                                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        TextButton(onClick = { selected = card.order }) {
                                            Text(t("Details"), fontSize = 12.sp)
                                        }
                                        TextButton(onClick = { onOpenOrder(card.order) }) {
                                            Text(t("Open order"), fontSize = 12.sp)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            item(key = "footnote") {
                Text(
                    "ⓘ " + t("Production status is separate from Order, Payment and Delivery status."),
                    fontSize = 11.sp, color = Color.Gray, modifier = Modifier.padding(vertical = 10.dp)
                )
            }
        }
    }

    selected?.let { order ->
        ProductionDetailDialog(
            order = order,
            stages = stages,
            steps = steps,
            canEdit = canEdit,
            busy = busy,
            t = t,
            onDismiss = { selected = null },
            onMove = { stageId -> requestMove(order, stageId) }
        )
    }

    blockerFor?.let { (order, stageId) ->
        BlockerReasonDialog(
            busy = busy,
            t = t,
            onDismiss = { blockerFor = null },
            onConfirm = { blocker ->
                blockerFor = null
                scope.launch { move(order, stageId, blocker) }
            }
        )
    }
}

@Composable
private fun Kpi(label: String, value: Int) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.width(126.dp)
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(label, fontSize = 11.sp, color = Color.Gray)
            Text("$value", fontSize = 20.sp, fontWeight = FontWeight.Bold)
        }
    }
}

private fun stageTint(kind: ProductionStageKind): Color = when (kind) {
    ProductionStageKind.Blocked -> Color(0xFFEF4444)
    ProductionStageKind.Review -> Color(0xFF8B5CF6)
    ProductionStageKind.ShipReady -> Color(0xFF16A34A)
    ProductionStageKind.Done -> Color(0xFF9CA3AF)
    else -> Color(0xFF2563EB)
}

private fun wipTint(level: ProductionWipLevel): Color = when (level) {
    ProductionWipLevel.Over -> Color(0xFFEF4444)
    ProductionWipLevel.Near -> Color(0xFFF59E0B)
    ProductionWipLevel.Ok -> Color(0xFF16A34A)
    ProductionWipLevel.None -> Color.Transparent
}

/** The steps behind the one-line stage, plus the one control the board needs. */
@Composable
private fun ProductionDetailDialog(
    order: StudioOrder,
    stages: List<ProductionStage>,
    steps: List<Pair<String, String>>,
    canEdit: Boolean,
    busy: Boolean,
    t: (String) -> String,
    onDismiss: () -> Unit,
    onMove: (String) -> Unit
) {
    val resolved = resolveProductionStage(order, stages, steps)
    var stagePickerOpen by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(order.designName) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                val percent = if (resolved.total > 0) resolved.doneCount * 100 / resolved.total else 0
                Text("${t("Production progress")}: $percent%", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                LinearProgressIndicator(
                    progress = { if (resolved.total > 0) resolved.doneCount.toFloat() / resolved.total else 0f },
                    modifier = Modifier.fillMaxWidth()
                )
                steps.forEachIndexed { index, step ->
                    val value = productionStepValue(order, step.first, step.second, index)
                    val done = productionStepIsDone(value)
                    val current = step.second == resolved.currentStep && !done
                    Text(
                        (if (done) "✓ " else if (current) "● " else "○ ") + t(step.second) +
                            (if (current) " — ${t("In progress")}" else ""),
                        fontSize = 13.sp,
                        color = if (done) Color(0xFF16A34A) else if (current) MaterialTheme.colorScheme.primary else Color.Gray
                    )
                }
                Text(
                    "${t("Current operation")}: " +
                        (if (resolved.currentStep.isEmpty()) t("Nothing in progress") else t(resolved.currentStep)),
                    fontSize = 12.sp
                )
                Text(
                    "${t("Blocker")}: " + (resolved.blocker?.let {
                        if (it.note.isEmpty()) t(it.label) else "${t(it.label)} — ${it.note}"
                    } ?: t("No blocker")),
                    fontSize = 12.sp,
                    color = if (resolved.blocker == null) Color.Gray else MaterialTheme.colorScheme.error
                )
                if (resolved.source == "manual") {
                    Text("${t("Stage")}: ${t("Set by hand")}", fontSize = 12.sp, color = Color.Gray)
                }
                if (canEdit) {
                    Box {
                        TextButton(enabled = !busy, onClick = { stagePickerOpen = true }) {
                            Text(
                                "${t("Update status")}: " +
                                    t(stages.firstOrNull { it.id == resolved.stageId }?.title.orEmpty()),
                                fontSize = 13.sp
                            )
                        }
                        DropdownMenu(expanded = stagePickerOpen, onDismissRequest = { stagePickerOpen = false }) {
                            stages.forEach { stage ->
                                DropdownMenuItem(
                                    text = { Text(t(stage.title), fontSize = 13.sp) },
                                    onClick = { stagePickerOpen = false; onMove(stage.id) }
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text(t("Close")) } }
    )
}

/** A blocked job needs a reason. Without one the board cannot be trusted, so
 *  the server refuses the move and this is where the answer is collected. */
@Composable
private fun BlockerReasonDialog(
    busy: Boolean,
    t: (String) -> String,
    onDismiss: () -> Unit,
    onConfirm: (ProductionBlocker) -> Unit
) {
    var reason by remember { mutableStateOf(ProductionBlocker.reasons.first()) }
    var note by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(t("Why is this job waiting?")) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(t("A blocked job needs a reason so the board can be trusted."), fontSize = 12.sp, color = Color.Gray)
                ProductionBlocker.reasons.forEach { code ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = reason == code, onClick = { reason = code })
                        Text(t(ProductionBlocker.labels[code] ?: code), fontSize = 13.sp)
                    }
                }
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    singleLine = true,
                    placeholder = { Text(t("Note (optional)"), fontSize = 13.sp) },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            TextButton(enabled = !busy, onClick = { onConfirm(ProductionBlocker(reason, note.trim())) }) {
                Text(t("Mark as blocked"))
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Cancel")) } }
    )
}
