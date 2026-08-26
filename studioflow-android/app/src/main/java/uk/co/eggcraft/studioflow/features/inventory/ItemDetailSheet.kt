package uk.co.eggcraft.studioflow.features.inventory

// The item detail sheet: everything one item knows about itself, in one place.
// The list answers "what do we have"; this answers "what is THIS — where did
// it come from, what is it promised to, what happened to it".
//
// Mirrors the web's ItemDetailPanel section for section, with the same English
// strings so the translation tables line up. Every write goes through the same
// callables the other platforms use; nothing here does its own arithmetic.

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
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
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import java.text.DateFormat
import java.util.Date
import kotlinx.coroutines.launch
import uk.co.eggcraft.studioflow.data.firebase.StudioFlowRepository
import uk.co.eggcraft.studioflow.data.model.StudioInventoryItem
import uk.co.eggcraft.studioflow.data.model.StudioInventoryMovement
import uk.co.eggcraft.studioflow.data.model.StudioInventoryStatus
import uk.co.eggcraft.studioflow.data.model.StudioOrder
import uk.co.eggcraft.studioflow.data.model.StudioTrackingType
import uk.co.eggcraft.studioflow.ui.theme.StudioBlue
import uk.co.eggcraft.studioflow.ui.theme.StudioGreen
import uk.co.eggcraft.studioflow.ui.theme.StudioRed
import uk.co.eggcraft.studioflow.ui.theme.StudioWarningOrange

/**
 * Mirrors the server's STATUS_TRANSITIONS (functions/inventory.js) so no button
 * or menu offers a move the server will refuse. "reserved" is deliberately
 * never a target: reserving goes through reserveInventoryForOrder, which writes
 * the reservation arrays linking the order — a bare status flip to "reserved"
 * would link no order and be invisible everywhere an order is drawn.
 */
internal fun inventoryStatusNext(status: StudioInventoryStatus): List<StudioInventoryStatus> = when (status) {
    StudioInventoryStatus.Available ->
        listOf(StudioInventoryStatus.Used, StudioInventoryStatus.Sold, StudioInventoryStatus.Incoming, StudioInventoryStatus.Archived)
    StudioInventoryStatus.Reserved ->
        listOf(StudioInventoryStatus.Available, StudioInventoryStatus.Used, StudioInventoryStatus.Sold, StudioInventoryStatus.Archived)
    StudioInventoryStatus.Incoming ->
        listOf(StudioInventoryStatus.Available, StudioInventoryStatus.Archived)
    StudioInventoryStatus.Used -> listOf(StudioInventoryStatus.Available, StudioInventoryStatus.Archived)
    StudioInventoryStatus.Sold -> listOf(StudioInventoryStatus.Archived)
    StudioInventoryStatus.Archived -> listOf(StudioInventoryStatus.Available)
}

/** The ledger's words for what happened — the same labels the web panel uses. */
private fun movementKindLabel(kind: String): String = when (kind) {
    "openingStock" -> "Opening stock"
    "purchase" -> "Purchase"
    "adjustment" -> "Adjustment"
    "stocktake" -> "Stocktake"
    "used" -> "Used"
    "sold" -> "Sold"
    "removed" -> "Removed"
    else -> kind
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row(Modifier.padding(vertical = 3.dp)) {
        Text(label, fontSize = 12.sp, color = Color.Gray, modifier = Modifier.width(130.dp))
        Text(value, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun DetailCard(title: String, content: @Composable () -> Unit) {
    Card(colors = inventoryCardColors(), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(12.dp)) {
            Text(title, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(6.dp))
            content()
        }
    }
}

@Composable
fun ItemDetailSheet(
    workspaceId: String,
    item: StudioInventoryItem,
    orders: List<StudioOrder>,
    symbol: String,
    canEdit: Boolean,
    t: (String) -> String,
    onDismiss: () -> Unit,
    onChanged: () -> Unit,
    /** Opens the item form: (prefill, itemId). A blank itemId creates — that is
     *  how Duplicate gets a fresh INV number from the server. */
    onEdit: (StudioInventoryItem, String) -> Unit,
    onPhotos: (StudioInventoryItem) -> Unit
) {
    val scope = rememberCoroutineScope()
    val repository = remember { StudioFlowRepository() }

    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var reserveOpen by remember { mutableStateOf(false) }
    var movingLocation by remember { mutableStateOf(false) }
    var locationDraft by remember(item.id) { mutableStateOf(item.location) }
    var historyOpen by remember(item.id) { mutableStateOf(false) }
    var movements by remember(item.id) { mutableStateOf<List<StudioInventoryMovement>?>(null) }

    fun run(failText: String, action: suspend () -> Unit) {
        scope.launch {
            busy = true; error = null
            try {
                action()
                // Any mutation may have written a ledger line; drop the cached
                // list so an open History section reloads with it.
                movements = null
                onChanged()
            } catch (failure: Exception) {
                error = failure.message ?: t(failText)
            }
            busy = false
        }
    }

    // The ledger loads when the section is first opened, not before.
    LaunchedEffect(historyOpen, item.id) {
        if (!historyOpen || movements != null) return@LaunchedEffect
        movements = try { repository.inventoryMovements(workspaceId, item.id) }
        catch (failure: Exception) { emptyList() }
    }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.background,
            modifier = Modifier.fillMaxSize().padding(10.dp)
        ) {
            Column(Modifier.fillMaxSize().padding(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(item.name, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                        Text(item.number, fontSize = 11.sp, color = Color.Gray)
                    }
                    val low = item.isLowStock && item.status == StudioInventoryStatus.Available
                    InventoryPill(
                        text = if (low) t("Low Stock") else t(item.status.label),
                        colour = when {
                            low -> StudioWarningOrange
                            item.status == StudioInventoryStatus.Available -> StudioGreen
                            item.status == StudioInventoryStatus.Reserved -> StudioWarningOrange
                            item.status == StudioInventoryStatus.Incoming -> StudioBlue
                            else -> Color.Gray
                        }
                    )
                    TextButton(onClick = onDismiss) { Text(t("Close"), fontSize = 12.sp) }
                }

                error?.let {
                    Text(it, fontSize = 12.sp, color = StudioRed)
                    Spacer(Modifier.height(4.dp))
                }

                Column(
                    Modifier.weight(1f).verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    // ---- Linked To ----
                    DetailCard(t("Linked To")) {
                        val reservations = item.reservations.filter { it.orderId.isNotBlank() }
                        if (reservations.isNotEmpty()) {
                            reservations.forEach { row ->
                                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 3.dp)) {
                                    Text(
                                        t("Order") + " " + row.orderId.take(8) + "…" +
                                            if (item.trackingType == StudioTrackingType.Quantity)
                                                " · " + inventoryQuantity(row.quantity) +
                                                    (if (item.unit.isBlank()) "" else " ${item.unit}")
                                            else "",
                                        fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                                        modifier = Modifier.weight(1f)
                                    )
                                    if (canEdit) {
                                        Text(
                                            t("Release"), fontSize = 12.sp,
                                            fontWeight = FontWeight.SemiBold, color = StudioBlue,
                                            modifier = Modifier.clickable(enabled = !busy) {
                                                run("The item could not be released.") {
                                                    repository.inventoryRelease(workspaceId, item.id, row.orderId)
                                                }
                                            }
                                        )
                                    }
                                }
                            }
                        } else {
                            Text(t("Not linked to any order"), fontSize = 12.sp, color = Color.Gray)
                            if (canEdit && item.freeToReserve > 0) {
                                Spacer(Modifier.height(6.dp))
                                OutlinedButton(onClick = { reserveOpen = true }, enabled = !busy) {
                                    Text(t("Reserve for Order"), fontSize = 12.sp)
                                }
                            }
                        }
                    }

                    // ---- Basic Information ----
                    DetailCard(t("Basic Information")) {
                        DetailRow(t("Category"), t(item.category))
                        if (item.brand.isNotBlank()) DetailRow(t("Brand"), item.brand)
                        if (item.model.isNotBlank()) DetailRow(t("Model"), item.model)
                        if (item.reference.isNotBlank()) DetailRow(t("Reference"), item.reference)
                        if (item.serialNumber.isNotBlank()) DetailRow(t("Serial Number"), item.serialNumber)
                        if (item.sku.isNotBlank()) DetailRow(t("SKU"), item.sku)
                        if (item.year.isNotBlank()) DetailRow(t("Year"), item.year)
                        if (item.condition.isNotBlank()) DetailRow(t("Condition"), item.condition)
                        if (item.description.isNotBlank()) {
                            Spacer(Modifier.height(4.dp))
                            Text(item.description, fontSize = 12.sp, color = Color.Gray)
                        }
                    }

                    // ---- Purchase Info ----
                    DetailCard(t("Purchase Info")) {
                        val hasPurchaseTrail = item.purchaseId.isNotBlank() ||
                            item.supplierName.isNotBlank() || item.purchaseDate.isNotBlank()
                        if (hasPurchaseTrail) {
                            if (item.supplierName.isNotBlank()) DetailRow(t("Supplier"), item.supplierName)
                            if (item.purchaseNumber.isNotBlank()) DetailRow(t("Purchase"), item.purchaseNumber)
                            if (item.purchaseDate.isNotBlank()) DetailRow(t("Purchase date"), item.purchaseDate)
                            DetailRow(t("Purchase price"), inventoryMoney(symbol, item.purchasePrice))
                        } else {
                            DetailRow(t("Purchase price"), inventoryMoney(symbol, item.purchasePrice))
                            Text(t("No purchase recorded"), fontSize = 12.sp, color = Color.Gray)
                        }
                    }

                    // ---- Inventory Details ----
                    DetailCard(t("Inventory Details")) {
                        DetailRow(
                            t("Tracking Type"),
                            if (item.trackingType == StudioTrackingType.Unique) t("Unique Item") else t("Quantity Item")
                        )
                        DetailRow(
                            t("On Hand"),
                            inventoryQuantity(item.displayOnHand) +
                                if (item.trackingType == StudioTrackingType.Quantity && item.unit.isNotBlank())
                                    " ${item.unit}" else ""
                        )
                        if (movingLocation) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                OutlinedTextField(
                                    value = locationDraft,
                                    onValueChange = { locationDraft = it },
                                    label = { Text(t("Safe A, Drawer 3…"), fontSize = 11.sp) },
                                    singleLine = true,
                                    modifier = Modifier.weight(1f)
                                )
                            }
                            Spacer(Modifier.height(4.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                Text(
                                    t("Save"), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = StudioBlue,
                                    modifier = Modifier.clickable(enabled = !busy) {
                                        run("The item could not be saved.") {
                                            // The FULL item with only the location
                                            // swapped: the server rebuilds the whole
                                            // document and blanks unsent fields.
                                            repository.inventorySaveItem(
                                                workspaceId,
                                                item.toInput() + mapOf("location" to locationDraft),
                                                item.id
                                            )
                                            movingLocation = false
                                        }
                                    }
                                )
                                Text(
                                    t("Cancel"), fontSize = 12.sp, color = Color.Gray,
                                    modifier = Modifier.clickable { movingLocation = false }
                                )
                            }
                        } else {
                            DetailRow(t("Location"), item.location.ifBlank { "—" })
                        }
                        if (item.purchaseDate.isNotBlank()) DetailRow(t("Acquisition Date"), item.purchaseDate)
                        DetailRow(
                            t("Value"),
                            if (item.isCustomerOwned) t("Customer's") else inventoryMoney(symbol, item.lineValue)
                        )
                        if (item.currentValueEst > 0) {
                            DetailRow(t("Current value (est.)"), inventoryMoney(symbol, item.currentValueEst))
                        }
                        Spacer(Modifier.height(4.dp))
                        Text(item.notes.ifBlank { t("No notes yet.") }, fontSize = 12.sp, color = Color.Gray)
                    }

                    // ---- Quick Actions ----
                    if (canEdit) {
                        DetailCard(t("Quick Actions")) {
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedButton(onClick = { onEdit(item, item.id) }, enabled = !busy, modifier = Modifier.weight(1f)) {
                                        Text(t("Edit Item"), fontSize = 11.sp)
                                    }
                                    OutlinedButton(onClick = { movingLocation = true }, enabled = !busy, modifier = Modifier.weight(1f)) {
                                        Text(t("Move / Change Location"), fontSize = 11.sp)
                                    }
                                }
                                val next = inventoryStatusNext(item.status)
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    if (StudioInventoryStatus.Sold in next) {
                                        OutlinedButton(
                                            onClick = {
                                                run("The item status could not be changed.") {
                                                    repository.inventorySetStatus(workspaceId, item.id, StudioInventoryStatus.Sold)
                                                }
                                            },
                                            enabled = !busy, modifier = Modifier.weight(1f)
                                        ) { Text(t("Mark as Sold"), fontSize = 11.sp) }
                                    }
                                    if (StudioInventoryStatus.Used in next) {
                                        OutlinedButton(
                                            onClick = {
                                                run("The item status could not be changed.") {
                                                    repository.inventorySetStatus(workspaceId, item.id, StudioInventoryStatus.Used)
                                                }
                                            },
                                            enabled = !busy, modifier = Modifier.weight(1f)
                                        ) { Text(t("Mark as Used"), fontSize = 11.sp) }
                                    }
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedButton(
                                        onClick = {
                                            // A fresh identity: the server assigns a
                                            // new INV number; the serial, photos,
                                            // reservations and purchase trail must
                                            // never travel to a second object.
                                            onEdit(
                                                item.copy(
                                                    id = "", number = "", serialNumber = "",
                                                    photos = emptyList(), reservations = emptyList(),
                                                    purchaseId = "", purchaseNumber = "",
                                                    status = StudioInventoryStatus.Available
                                                ),
                                                ""
                                            )
                                        },
                                        enabled = !busy, modifier = Modifier.weight(1f)
                                    ) { Text(t("Duplicate Item"), fontSize = 11.sp) }
                                    OutlinedButton(onClick = { onPhotos(item) }, enabled = !busy, modifier = Modifier.weight(1f)) {
                                        Text(t("Manage photos"), fontSize = 11.sp)
                                    }
                                }
                            }
                        }
                    }

                    // ---- History ----
                    Card(colors = inventoryCardColors(), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.fillMaxWidth().padding(12.dp)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.fillMaxWidth().clickable { historyOpen = !historyOpen }
                            ) {
                                Text(t("History"), fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                                Text(if (historyOpen) "▾" else "▸", fontSize = 12.sp, color = Color.Gray)
                            }
                            if (historyOpen) {
                                Spacer(Modifier.height(6.dp))
                                val rows = movements
                                when {
                                    rows == null -> Text(t("Loading…"), fontSize = 12.sp, color = Color.Gray)
                                    rows.isEmpty() -> Text(
                                        t("No movements recorded for this item yet."),
                                        fontSize = 12.sp, color = Color.Gray
                                    )
                                    else -> rows.forEachIndexed { index, row ->
                                        if (index > 0) HorizontalDivider(Modifier.padding(vertical = 6.dp))
                                        Text(
                                            t(movementKindLabel(row.kind)) + " · " +
                                                (if (row.delta > 0) "+" else "") + inventoryQuantity(row.delta) +
                                                " · " + inventoryMoney(symbol, kotlin.math.abs(row.valueDelta)),
                                            fontSize = 12.sp, fontWeight = FontWeight.SemiBold
                                        )
                                        Text(
                                            listOf(
                                                DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT)
                                                    .format(Date(row.at)),
                                                row.byEmail,
                                                row.note
                                            ).filter { it.isNotBlank() }.joinToString(" · "),
                                            fontSize = 10.sp, color = Color.Gray
                                        )
                                    }
                                }
                            }
                        }
                    }

                    Spacer(Modifier.height(8.dp))
                }
            }
        }
    }

    if (reserveOpen) {
        ReserveForOrderDialog(
            item = item,
            orders = orders,
            t = t,
            onDismiss = { reserveOpen = false },
            onReserve = { orderId, quantity ->
                reserveOpen = false
                run("The item could not be reserved.") {
                    repository.inventoryReserve(workspaceId, item.id, orderId, quantity)
                }
            }
        )
    }
}

// The inventory-side reserve flow. The one rule that matters: reservations go
// through reserveInventoryForOrder, which writes the reservation arrays — a
// bare status flip to "reserved" links nothing and is invisible to the order.
@Composable
private fun ReserveForOrderDialog(
    item: StudioInventoryItem,
    orders: List<StudioOrder>,
    t: (String) -> String,
    onDismiss: () -> Unit,
    onReserve: (String, Double) -> Unit
) {
    // The same list the web's order picker shows: live orders, newest first.
    val options = remember(orders) {
        orders.filter { !it.isDeleted }.sortedByDescending { it.paymentDate.time }
    }
    var orderId by remember { mutableStateOf("") }
    var quantityText by remember { mutableStateOf("1") }
    var menuOpen by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val free = item.freeToReserve
    val chosen = options.firstOrNull { it.id == orderId }
    val quantity = if (item.trackingType == StudioTrackingType.Unique) 1.0 else inventoryParse(quantityText)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(t("Reserve for Order"), fontSize = 17.sp, fontWeight = FontWeight.Bold) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()).heightIn(max = 420.dp)) {
                Text(
                    item.name + " · " + item.number +
                        if (item.trackingType == StudioTrackingType.Quantity)
                            " · " + t("free") + ": " + inventoryQuantity(free) +
                                (if (item.unit.isBlank()) "" else " ${item.unit}")
                        else "",
                    fontSize = 12.sp, color = Color.Gray
                )
                Spacer(Modifier.height(10.dp))
                Box {
                    OutlinedTextField(
                        value = chosen?.let { "${it.displayCustomerName} — ${it.designName.ifBlank { "Untitled design" }}" }
                            ?: "",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text(t("Order"), fontSize = 12.sp) },
                        placeholder = { Text(t("Choose an order…"), fontSize = 12.sp) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Box(Modifier.matchParentSize().clickable { menuOpen = true })
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        options.forEach { order ->
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        "${order.displayCustomerName} — ${order.designName.ifBlank { "Untitled design" }}",
                                        fontSize = 13.sp
                                    )
                                },
                                onClick = { menuOpen = false; orderId = order.id }
                            )
                        }
                    }
                }
                if (item.trackingType == StudioTrackingType.Quantity) {
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = quantityText,
                        onValueChange = { quantityText = it },
                        label = { Text(t("Quantity"), fontSize = 12.sp) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                error?.let {
                    Spacer(Modifier.height(6.dp))
                    Text(it, fontSize = 12.sp, color = StudioRed)
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = orderId.isNotBlank(),
                onClick = {
                    when {
                        orderId.isBlank() -> error = t("Choose an order first.")
                        quantity <= 0.0 || quantity > free ->
                            // Capped at what the shelf can honestly promise:
                            // on hand minus what other orders already hold.
                            error = t("The item could not be reserved.")
                        else -> onReserve(orderId, quantity)
                    }
                }
            ) { Text(t("Reserve")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Cancel")) } }
    )
}
