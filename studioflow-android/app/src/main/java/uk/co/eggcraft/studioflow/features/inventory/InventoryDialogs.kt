package uk.co.eggcraft.studioflow.features.inventory

// The entry forms. The first decision in the item dialog is the one that
// changes everything below it, so it is asked first and the form redraws around
// the answer: a unique object carries identity (serial, condition, year) and a
// counted material carries an amount and a reorder point.

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
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import uk.co.eggcraft.studioflow.data.firebase.StudioFlowRepository
import uk.co.eggcraft.studioflow.data.model.StudioBankTransaction
import uk.co.eggcraft.studioflow.data.model.StudioInventoryItem
import uk.co.eggcraft.studioflow.data.model.StudioPurchase
import uk.co.eggcraft.studioflow.data.model.StudioPurchaseLineDraft
import uk.co.eggcraft.studioflow.data.model.StudioSupplier
import uk.co.eggcraft.studioflow.data.model.StudioTrackingType
import uk.co.eggcraft.studioflow.ui.theme.StudioBlue
import uk.co.eggcraft.studioflow.ui.theme.StudioGreen
import uk.co.eggcraft.studioflow.ui.theme.StudioRed

internal fun inventoryParse(text: String): Double =
    text.replace(',', '.').filter { it.isDigit() || it == '.' }.toDoubleOrNull() ?: 0.0

@Composable
private fun InventoryField(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    onChange: (String) -> Unit
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label, fontSize = 12.sp) },
        singleLine = true,
        modifier = modifier.fillMaxWidth()
    )
}

@Composable
private fun InventoryCategoryPicker(category: String, t: (String) -> String, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        InventoryField(t("Category"), t(category), Modifier) {}
        Box(Modifier.matchParentSize().clickable { open = true })
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            inventoryCategoryList.forEach { entry ->
                DropdownMenuItem(
                    text = { Text(t(entry), fontSize = 13.sp) },
                    onClick = { open = false; onPick(entry) }
                )
            }
        }
    }
}

@Composable
private fun TrackingTypeChips(selected: StudioTrackingType, t: (String) -> String, onPick: (StudioTrackingType) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        StudioTrackingType.entries.forEach { entry ->
            FilterChip(
                selected = selected == entry,
                onClick = { onPick(entry) },
                label = { Text(t(entry.label), fontSize = 12.sp) }
            )
        }
    }
}

/**
 * Create AND edit form. Pass [existing] to prefill (with [itemId] blank this is
 * a duplicate: the server assigns a fresh INV number); pass [itemId] to save
 * over an existing item. When editing, the payload deliberately carries EVERY
 * field — including ones this form has no input for, like description, photos
 * and the estimated current value — because the server rebuilds the whole
 * document from the input and blanks whatever is not sent.
 */
@Composable
fun NewInventoryItemDialog(
    symbol: String,
    t: (String) -> String,
    existing: StudioInventoryItem? = null,
    itemId: String = "",
    onDismiss: () -> Unit,
    onSave: (Map<String, Any?>, String) -> Unit
) {
    fun numberText(value: Double): String = if (value <= 0.0) "" else inventoryQuantity(value)

    var trackingType by remember { mutableStateOf(existing?.trackingType ?: StudioTrackingType.Unique) }
    var name by remember { mutableStateOf(existing?.name.orEmpty()) }
    var category by remember { mutableStateOf(existing?.category ?: "Other") }
    var brand by remember { mutableStateOf(existing?.brand.orEmpty()) }
    var model by remember { mutableStateOf(existing?.model.orEmpty()) }
    var reference by remember { mutableStateOf(existing?.reference.orEmpty()) }
    var serialNumber by remember { mutableStateOf(existing?.serialNumber.orEmpty()) }
    var year by remember { mutableStateOf(existing?.year.orEmpty()) }
    var condition by remember { mutableStateOf(existing?.condition.orEmpty()) }
    var sku by remember { mutableStateOf(existing?.sku.orEmpty()) }
    var onHand by remember { mutableStateOf(numberText(existing?.onHand ?: 0.0)) }
    var unit by remember { mutableStateOf(existing?.unit.orEmpty()) }
    var lowStockAt by remember { mutableStateOf(numberText(existing?.lowStockAt ?: 0.0)) }
    var location by remember { mutableStateOf(existing?.location.orEmpty()) }
    var supplierName by remember { mutableStateOf(existing?.supplierName.orEmpty()) }
    var purchaseDate by remember { mutableStateOf(existing?.purchaseDate.orEmpty()) }
    var purchasePrice by remember { mutableStateOf(numberText(existing?.purchasePrice ?: 0.0)) }
    var extraLabel by remember { mutableStateOf("") }
    var extraAmount by remember { mutableStateOf("") }
    val extras = remember { existing?.additionalCosts.orEmpty().toMutableList().toMutableStateList() }
    var isCustomerOwned by remember { mutableStateOf(existing?.isCustomerOwned ?: false) }
    var notes by remember { mutableStateOf(existing?.notes.orEmpty()) }

    val extrasTotal = extras.sumOf { it.second }
    val internalTotal = inventoryParse(purchasePrice) + extrasTotal

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                if (itemId.isBlank()) t("Add Item") else t("Edit Item"),
                fontSize = 17.sp, fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()).heightIn(max = 460.dp)) {
                Text(t("What kind of thing is this?"), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.Gray)
                Spacer(Modifier.height(6.dp))
                TrackingTypeChips(trackingType, t) { trackingType = it }
                Spacer(Modifier.height(4.dp))
                Text(
                    if (trackingType == StudioTrackingType.Unique)
                        t("One physical object with its own identity — a specific watch, a serialled movement.")
                    else
                        t("Something you count — screws, lacquer, boxes. Tracked as an amount with a reorder point."),
                    fontSize = 11.sp, color = Color.Gray
                )

                Spacer(Modifier.height(12.dp))
                InventoryField(t("Name"), name) { name = it }
                Spacer(Modifier.height(8.dp))
                InventoryCategoryPicker(category, t) { category = it }
                Spacer(Modifier.height(8.dp))

                if (trackingType == StudioTrackingType.Unique) {
                    InventoryField(t("Brand"), brand) { brand = it }
                    Spacer(Modifier.height(8.dp))
                    InventoryField(t("Model"), model) { model = it }
                    Spacer(Modifier.height(8.dp))
                    InventoryField(t("Reference"), reference) { reference = it }
                    Spacer(Modifier.height(8.dp))
                    InventoryField(t("Serial number"), serialNumber) { serialNumber = it }
                    Spacer(Modifier.height(8.dp))
                    InventoryField(t("Year"), year) { year = it }
                    Spacer(Modifier.height(8.dp))
                    InventoryField(t("Condition"), condition) { condition = it }
                } else {
                    InventoryField(t("SKU"), sku) { sku = it }
                    Spacer(Modifier.height(8.dp))
                    InventoryField(t("Amount on hand"), onHand) { onHand = it }
                    Spacer(Modifier.height(8.dp))
                    InventoryField(t("Unit (pcs, ml, g)"), unit) { unit = it }
                    Spacer(Modifier.height(8.dp))
                    InventoryField(t("Tell me when it drops to"), lowStockAt) { lowStockAt = it }
                }

                Spacer(Modifier.height(8.dp))
                InventoryField(t("Location"), location) { location = it }

                Spacer(Modifier.height(14.dp))
                HorizontalDivider()
                Spacer(Modifier.height(10.dp))
                Text(t("Cost"), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(6.dp))
                InventoryField(t("Purchase price"), purchasePrice) { purchasePrice = it }

                extras.forEachIndexed { index, extra ->
                    Spacer(Modifier.height(6.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("${extra.first}: ${inventoryMoney(symbol, extra.second)}", fontSize = 12.sp, modifier = Modifier.weight(1f))
                        Text(t("Remove"), fontSize = 11.sp, color = StudioRed,
                            modifier = Modifier.clickable { extras.removeAt(index) })
                    }
                }

                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = extraLabel, onValueChange = { extraLabel = it },
                        label = { Text(t("What for"), fontSize = 11.sp) },
                        singleLine = true, modifier = Modifier.weight(1f)
                    )
                    OutlinedTextField(
                        value = extraAmount, onValueChange = { extraAmount = it },
                        label = { Text("0.00", fontSize = 11.sp) },
                        singleLine = true, modifier = Modifier.width(96.dp)
                    )
                }
                Spacer(Modifier.height(4.dp))
                Text(t("Add a cost"), fontSize = 12.sp, color = StudioBlue, modifier = Modifier.clickable {
                    if (extraLabel.isNotBlank() || inventoryParse(extraAmount) > 0) {
                        extras.add(extraLabel to inventoryParse(extraAmount))
                        extraLabel = ""; extraAmount = ""
                    }
                })

                Spacer(Modifier.height(8.dp))
                Row {
                    Text(t("Internal total cost"), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    Text(inventoryMoney(symbol, internalTotal), fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(6.dp))
                // The reason these are two boxes and not one. A blended cost
                // field would destroy the figure the margin scheme needs.
                Text(
                    t("Kept apart on purpose. Repairs, parts and shipping do not belong in the purchase price used for the VAT margin scheme, and once they are blended into one number there is no way to get it back."),
                    fontSize = 10.sp, color = Color.Gray
                )

                Spacer(Modifier.height(10.dp))
                InventoryField(t("Supplier"), supplierName) { supplierName = it }
                Spacer(Modifier.height(8.dp))
                InventoryField(t("Purchase date (YYYY-MM-DD)"), purchaseDate) { purchaseDate = it }

                Spacer(Modifier.height(12.dp))
                HorizontalDivider()
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = isCustomerOwned, onCheckedChange = { isCustomerOwned = it })
                    Text(t("This belongs to a customer"), fontSize = 12.sp)
                }
                if (isCustomerOwned) {
                    Text(
                        t("Recorded so you can find it, valued at zero, and never counted as your stock."),
                        fontSize = 11.sp, color = Color.Gray
                    )
                }
                Spacer(Modifier.height(8.dp))
                InventoryField(t("Notes"), notes) { notes = it }
            }
        },
        confirmButton = {
            TextButton(
                enabled = name.isNotBlank(),
                onClick = {
                    onSave(
                        mapOf(
                            "name" to name, "category" to category, "trackingType" to trackingType.raw,
                            "ownership" to if (isCustomerOwned) "customer" else "business",
                            "brand" to brand, "model" to model, "reference" to reference,
                            "serialNumber" to serialNumber, "year" to year, "condition" to condition,
                            "sku" to sku, "location" to location, "supplierName" to supplierName,
                            "purchaseDate" to purchaseDate, "notes" to notes,
                            "onHand" to if (trackingType == StudioTrackingType.Unique) 1.0 else inventoryParse(onHand),
                            "unit" to unit, "lowStockAt" to inventoryParse(lowStockAt),
                            "purchasePrice" to inventoryParse(purchasePrice),
                            "additionalCosts" to extras.map { mapOf("label" to it.first, "amount" to it.second) },
                            // Fields the form has no input for, carried through
                            // untouched — the server blanks whatever an edit
                            // does not send.
                            "description" to existing?.description.orEmpty(),
                            "photos" to existing?.photos.orEmpty(),
                            "currentValueEst" to (existing?.currentValueEst ?: 0.0)
                        ),
                        itemId
                    )
                }
            ) { Text(t("Save")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Cancel")) } }
    )
}

@Composable
fun NewPurchaseDialog(
    symbol: String,
    supplierNames: List<String>,
    t: (String) -> String,
    onDismiss: () -> Unit,
    onSave: (Map<String, Any?>) -> Unit
) {
    var supplierName by remember { mutableStateOf("") }
    var purchaseDate by remember { mutableStateOf("") }
    var reference by remember { mutableStateOf("") }
    var shipping by remember { mutableStateOf("") }
    var otherCosts by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    val lines = remember { mutableListOf(StudioPurchaseLineDraft()).toMutableStateList() }
    var supplierMenuOpen by remember { mutableStateOf(false) }

    val goods = lines.sumOf {
        it.unitPrice * (if (it.trackingType == StudioTrackingType.Unique) 1.0 else it.quantity)
    }
    val extras = inventoryParse(shipping) + inventoryParse(otherCosts)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(t("New Purchase"), fontSize = 17.sp, fontWeight = FontWeight.Bold) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()).heightIn(max = 460.dp)) {
                InventoryField(t("Who you bought from"), supplierName) { supplierName = it }
                if (supplierNames.isNotEmpty()) {
                    Box {
                        Text(
                            t("Pick an existing supplier"), fontSize = 12.sp, color = StudioBlue,
                            modifier = Modifier.padding(top = 4.dp).clickable { supplierMenuOpen = true }
                        )
                        DropdownMenu(expanded = supplierMenuOpen, onDismissRequest = { supplierMenuOpen = false }) {
                            supplierNames.forEach { entry ->
                                DropdownMenuItem(
                                    text = { Text(entry, fontSize = 13.sp) },
                                    onClick = { supplierMenuOpen = false; supplierName = entry }
                                )
                            }
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                InventoryField(t("Purchase date (YYYY-MM-DD)"), purchaseDate) { purchaseDate = it }
                Spacer(Modifier.height(8.dp))
                InventoryField(t("Invoice / order reference"), reference) { reference = it }

                lines.forEachIndexed { index, line ->
                    Spacer(Modifier.height(12.dp))
                    HorizontalDivider()
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("${index + 1}", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = StudioBlue)
                        Spacer(Modifier.width(10.dp))
                        TrackingTypeChips(line.trackingType, t) { lines[index] = line.copy(trackingType = it) }
                    }
                    Spacer(Modifier.height(8.dp))
                    InventoryField(t("Name"), line.name) { lines[index] = line.copy(name = it) }
                    Spacer(Modifier.height(8.dp))
                    InventoryCategoryPicker(line.category, t) { lines[index] = line.copy(category = it) }
                    Spacer(Modifier.height(8.dp))
                    if (line.trackingType == StudioTrackingType.Quantity) {
                        InventoryField(t("Quantity"), inventoryQuantity(line.quantity)) {
                            lines[index] = line.copy(quantity = inventoryParse(it))
                        }
                        Spacer(Modifier.height(8.dp))
                        InventoryField(t("Unit (pcs, ml, g)"), line.unit) { lines[index] = line.copy(unit = it) }
                    } else {
                        InventoryField(t("Reference"), line.reference) { lines[index] = line.copy(reference = it) }
                        Spacer(Modifier.height(8.dp))
                        InventoryField(t("Serial number"), line.serialNumber) { lines[index] = line.copy(serialNumber = it) }
                    }
                    Spacer(Modifier.height(8.dp))
                    InventoryField(
                        if (line.trackingType == StudioTrackingType.Unique) t("Purchase price") else t("Price per unit"),
                        if (line.unitPrice == 0.0) "" else inventoryQuantity(line.unitPrice)
                    ) { lines[index] = line.copy(unitPrice = inventoryParse(it)) }
                    Spacer(Modifier.height(8.dp))
                    InventoryField(t("Location"), line.location) { lines[index] = line.copy(location = it) }
                }

                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text(t("Add another item"), fontSize = 12.sp, color = StudioBlue,
                        modifier = Modifier.clickable { lines.add(StudioPurchaseLineDraft()) })
                    if (lines.size > 1) {
                        Text(t("Remove the last item"), fontSize = 12.sp, color = StudioRed,
                            modifier = Modifier.clickable { lines.removeAt(lines.lastIndex) })
                    }
                }

                Spacer(Modifier.height(12.dp))
                HorizontalDivider()
                Spacer(Modifier.height(8.dp))
                Text(t("Shipping and fees"), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(6.dp))
                InventoryField(t("Shipping"), shipping) { shipping = it }
                Spacer(Modifier.height(8.dp))
                InventoryField(t("Other costs"), otherCosts) { otherCosts = it }
                Spacer(Modifier.height(6.dp))
                Text(
                    t("Kept out of the item prices on purpose. Each item's purchase price stays exactly what you paid for the goods, and its share of these costs is recorded separately against it."),
                    fontSize = 10.sp, color = Color.Gray
                )

                Spacer(Modifier.height(10.dp))
                Row {
                    Text(t("Purchase total"), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    Text(inventoryMoney(symbol, goods + extras), fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }

                Spacer(Modifier.height(10.dp))
                InventoryField(t("Notes"), notes) { notes = it }
                Spacer(Modifier.height(6.dp))
                Text(
                    t("The items are created as incoming — they become available stock when you mark the purchase received."),
                    fontSize = 11.sp, color = Color.Gray
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = lines.any { it.name.isNotBlank() },
                onClick = {
                    onSave(
                        mapOf(
                            "supplierName" to supplierName, "purchaseDate" to purchaseDate,
                            "reference" to reference, "notes" to notes,
                            "shipping" to inventoryParse(shipping),
                            "otherCosts" to inventoryParse(otherCosts),
                            "lines" to lines.filter { it.name.isNotBlank() }.map { it.payload() }
                        )
                    )
                }
            ) { Text(t("Save")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Cancel")) } }
    )
}

/**
 * Goods arrive in boxes, not in purchase orders. This dialog receives what the
 * courier actually brought — per line, per quantity. The rest stays outstanding
 * and the purchase says "Partially received" until the last piece lands.
 * Counted lines take an amount (empty means "not in this box"); a unique line
 * either arrived or it did not.
 */
@Composable
fun ReceiveDeliveryDialog(
    workspaceId: String,
    purchase: StudioPurchase,
    t: (String) -> String,
    onDismiss: () -> Unit,
    onReceived: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val repository = remember { StudioFlowRepository() }
    var amounts by remember { mutableStateOf<Map<Int, String>>(emptyMap()) }
    var checked by remember { mutableStateOf<Map<Int, Boolean>>(emptyMap()) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun submit() {
        val payload = mutableListOf<Map<String, Any?>>()
        for ((index, line) in purchase.lines.withIndex()) {
            if (line.outstanding <= 0) continue
            if (line.trackingType == StudioTrackingType.Unique) {
                if (checked[index] == true) payload.add(mapOf("index" to index))
                continue
            }
            val wanted = inventoryParse(amounts[index].orEmpty())
            if (wanted <= 0) continue
            if (wanted > line.outstanding + 0.000001) {
                error = "\"${line.name}\" — " + t("that is more than is still outstanding.")
                return
            }
            payload.add(mapOf("index" to index, "quantity" to wanted))
        }
        if (payload.isEmpty()) {
            error = t("Enter what arrived first.")
            return
        }
        saving = true
        error = null
        scope.launch {
            try {
                repository.inventoryReceivePurchase(workspaceId, purchase.id, payload)
                onReceived()
            } catch (failure: Exception) {
                error = failure.message
                saving = false
            }
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(t("Receive delivery"), fontSize = 17.sp, fontWeight = FontWeight.Bold) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()).heightIn(max = 420.dp)) {
                Text(
                    "${purchase.number} · ${purchase.supplierName.ifBlank { "—" }} — " +
                        t("enter what the courier actually brought; the rest stays outstanding."),
                    fontSize = 12.sp, color = Color.Gray
                )
                Spacer(Modifier.height(10.dp))

                purchase.lines.forEachIndexed { index, line ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(line.name, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                            // "2 / 10 pcs" — how much of this line has landed so
                            // far, so the box being unpacked has its context.
                            Text(
                                inventoryQuantity(line.receivedQuantity) + " / " + inventoryQuantity(line.ordered) +
                                    (if (line.unit.isBlank()) "" else " ${line.unit}"),
                                fontSize = 11.sp, color = Color.Gray
                            )
                        }
                        when {
                            line.outstanding <= 0 -> Text(
                                t("Received"), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = StudioGreen
                            )
                            line.trackingType == StudioTrackingType.Unique -> Row(verticalAlignment = Alignment.CenterVertically) {
                                Checkbox(
                                    checked = checked[index] ?: false,
                                    onCheckedChange = { checked = checked + (index to it) }
                                )
                                Text(t("Arrived"), fontSize = 12.sp)
                            }
                            else -> OutlinedTextField(
                                value = amounts[index] ?: "",
                                onValueChange = { amounts = amounts + (index to it) },
                                placeholder = { Text(inventoryQuantity(line.outstanding), fontSize = 12.sp) },
                                singleLine = true,
                                modifier = Modifier.width(78.dp)
                            )
                        }
                    }
                    HorizontalDivider()
                }

                error?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, fontSize = 12.sp, color = StudioRed)
                }
            }
        },
        confirmButton = {
            TextButton(enabled = !saving, onClick = { submit() }) {
                Text(if (saving) t("Saving…") else t("Receive what arrived"))
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Cancel")) } }
    )
}

@Composable
fun MatchPaymentDialog(
    purchase: StudioPurchase,
    transactions: List<StudioBankTransaction>,
    symbol: String,
    t: (String) -> String,
    onDismiss: () -> Unit,
    onMatch: (String) -> Unit
) {
    // Closest amount first: the row you want is almost always the one that
    // matches the total, and scrolling a year of statements to find it is the
    // whole chore.
    val candidates = transactions
        .filter { it.amount < 0 }
        .sortedBy { kotlin.math.abs(kotlin.math.abs(it.amount) - purchase.total) }
        .take(40)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(t("Match a payment"), fontSize = 17.sp, fontWeight = FontWeight.Bold) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()).heightIn(max = 420.dp)) {
                Text(
                    "${purchase.number} · ${purchase.supplierName} · ${inventoryMoney(symbol, purchase.total)}",
                    fontSize = 12.sp, color = Color.Gray
                )
                Spacer(Modifier.height(10.dp))

                if (candidates.isEmpty()) {
                    Text(t("No unmatched money-out transactions to choose from."), fontSize = 12.sp, color = Color.Gray)
                } else {
                    candidates.forEach { transaction ->
                        val paid = kotlin.math.abs(transaction.amount)
                        val exact = kotlin.math.abs(paid - purchase.total) < 0.01
                        Row(
                            Modifier.fillMaxWidth().clickable { onMatch(transaction.id) }.padding(vertical = 9.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    transaction.merchant.ifBlank { t("Transaction") },
                                    fontSize = 13.sp, fontWeight = FontWeight.SemiBold
                                )
                                Text(transaction.bookingDate, fontSize = 11.sp, color = Color.Gray)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text(inventoryMoney(symbol, paid), fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                if (exact) Text(t("Exact match"), fontSize = 10.sp, color = StudioGreen)
                            }
                        }
                        HorizontalDivider()
                    }
                }

                if (purchase.bankTransactionId.isNotBlank()) {
                    Spacer(Modifier.height(10.dp))
                    Text(t("Unlink current payment"), fontSize = 12.sp, color = StudioRed,
                        modifier = Modifier.clickable { onMatch("") })
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text(t("Close")) } }
    )
}

@Composable
fun SupplierDialog(
    supplier: StudioSupplier?,
    t: (String) -> String,
    onDismiss: () -> Unit,
    onSave: (Map<String, Any?>, String) -> Unit
) {
    var name by remember { mutableStateOf(supplier?.name.orEmpty()) }
    var email by remember { mutableStateOf(supplier?.email.orEmpty()) }
    var phone by remember { mutableStateOf(supplier?.phone.orEmpty()) }
    var website by remember { mutableStateOf(supplier?.website.orEmpty()) }
    var notes by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                if (supplier != null && !supplier.isImplied) t("Edit supplier") else t("New Supplier"),
                fontSize = 17.sp, fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()).heightIn(max = 380.dp)) {
                InventoryField(t("Name"), name) { name = it }
                Spacer(Modifier.height(8.dp))
                InventoryField(t("Email"), email) { email = it }
                Spacer(Modifier.height(8.dp))
                InventoryField(t("Phone"), phone) { phone = it }
                Spacer(Modifier.height(8.dp))
                InventoryField(t("Website"), website) { website = it }
                Spacer(Modifier.height(8.dp))
                InventoryField(t("Notes"), notes) { notes = it }
            }
        },
        confirmButton = {
            TextButton(
                enabled = name.isNotBlank(),
                onClick = {
                    onSave(
                        mapOf("name" to name, "email" to email, "phone" to phone, "website" to website, "notes" to notes),
                        supplier?.id.orEmpty()
                    )
                }
            ) { Text(t("Save")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Cancel")) } }
    )
}
