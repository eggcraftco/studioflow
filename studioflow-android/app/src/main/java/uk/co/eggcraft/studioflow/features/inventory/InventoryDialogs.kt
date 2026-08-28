package uk.co.eggcraft.studioflow.features.inventory

// The entry forms. The first decision in the item dialog is the one that
// changes everything below it, so it is asked first and the form redraws around
// the answer: a unique object carries identity (serial, condition, year) and a
// counted material carries an amount and a reorder point.

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.InputChip
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
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

/** How many photos one item carries. The same cap the web and the Apple apps
 *  hold, kept in one place so the form and the photo manager cannot drift. */
internal const val INVENTORY_PHOTO_LIMIT = 12

@Composable
private fun InventoryField(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    /** The workspace currency, drawn inside the box. A money field that looks
     *  like every other number field reads as a quantity, not as an amount. */
    currencyPrefix: String = "",
    /** A quiet line under the box, for a field that needs a sentence. */
    hint: String = "",
    onChange: (String) -> Unit
) {
    val money = currencyPrefix.isNotBlank()
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label, fontSize = 12.sp) },
        placeholder = if (placeholder.isBlank()) null else ({ Text(placeholder, fontSize = 12.sp) }),
        prefix = if (!money) null else ({ Text(currencyPrefix, fontSize = 13.sp) }),
        supportingText = if (hint.isBlank()) null else ({ Text(hint, fontSize = 10.sp, color = Color.Gray) }),
        keyboardOptions = if (money) KeyboardOptions(keyboardType = KeyboardType.Decimal)
            else KeyboardOptions.Default,
        singleLine = true,
        modifier = modifier.fillMaxWidth()
    )
}

@Composable
private fun InventoryCategoryPicker(
    category: String,
    options: List<String>,
    t: (String) -> String,
    onPick: (String) -> Unit
) {
    var open by remember { mutableStateOf(false) }
    Box {
        InventoryField(t("Category"), t(category), Modifier) {}
        Box(Modifier.matchParentSize().clickable { open = true })
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            (if (options.isEmpty()) inventoryCategoryList else options).forEach { entry ->
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
 * field — including ones this form has no input for, like description and
 * photos — because the server rebuilds the whole document from the input and
 * blanks whatever is not sent.
 */
@Composable
fun NewInventoryItemDialog(
    symbol: String,
    t: (String) -> String,
    existing: StudioInventoryItem? = null,
    itemId: String = "",
    /** Defined location paths ("Safe A / Drawer 3") offered as tap-to-fill
     *  suggestions. The field stays free text — any location is still legal. */
    locationPaths: List<String> = emptyList(),
    /** The workspace's own category names, so this picker says what the
     *  sidebar and the web say. */
    categoryOptions: List<String> = emptyList(),
    /** The category a brand-new item starts on, when the workspace picked one. */
    defaultCategory: String = "",
    onDismiss: () -> Unit,
    /** The payload, the id to save over ("" for a new item), and the photos
     *  picked here — which the caller uploads once the save hands back an id. */
    onSave: (Map<String, Any?>, String, List<Uri>) -> Unit
) {
    fun numberText(value: Double): String = if (value <= 0.0) "" else inventoryQuantity(value)

    var trackingType by remember { mutableStateOf(existing?.trackingType ?: StudioTrackingType.Unique) }
    var name by remember { mutableStateOf(existing?.name.orEmpty()) }
    var category by remember {
        mutableStateOf(existing?.category ?: defaultCategory.ifEmpty { "Other" })
    }
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
    var currentValueEst by remember { mutableStateOf(numberText(existing?.currentValueEst ?: 0.0)) }
    var extraLabel by remember { mutableStateOf("") }
    var extraAmount by remember { mutableStateOf("") }
    val extras = remember { existing?.additionalCosts.orEmpty().toMutableList().toMutableStateList() }
    var isCustomerOwned by remember { mutableStateOf(existing?.isCustomerOwned ?: false) }
    var notes by remember { mutableStateOf(existing?.notes.orEmpty()) }
    val tags = remember { existing?.tags.orEmpty().toMutableList().toMutableStateList() }
    var tagInput by remember { mutableStateOf("") }

    // Photos picked before the item exists. Storage paths are keyed by the item
    // id, which only exists once the server has assigned one, so the files wait
    // here and go up the moment the save hands that id back. Nobody has to save
    // the item, find it in the list and come back for its photo button.
    val stagedPhotos = remember { mutableStateListOf<Uri>() }
    val photoRoom = INVENTORY_PHOTO_LIMIT - existing?.photos.orEmpty().size - stagedPhotos.size
    val photoPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(INVENTORY_PHOTO_LIMIT)
    ) { picked -> stagedPhotos.addAll(picked.take(photoRoom)) }

    // The same caps the server enforces (20 tags of 30 characters), applied
    // here so nothing typed is silently shortened after the save.
    fun addTag() {
        val value = tagInput.trim().take(30)
        if (value.isNotBlank() && value !in tags && tags.size < 20) tags.add(value)
        tagInput = ""
    }

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
                InventoryCategoryPicker(category, categoryOptions, t) { category = it }
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
                // Tap-to-fill suggestions from the defined location tree; free
                // text keeps working, so these are offers, not a constraint.
                val locationSuggestions = locationPaths.filter { path ->
                    path != location && (location.isBlank() || path.contains(location, ignoreCase = true))
                }.take(6)
                if (locationSuggestions.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        locationSuggestions.forEach { path ->
                            Text(
                                path, fontSize = 11.sp, color = StudioBlue,
                                modifier = Modifier.clickable { location = path }.padding(vertical = 2.dp)
                            )
                        }
                    }
                }

                Spacer(Modifier.height(14.dp))
                HorizontalDivider()
                Spacer(Modifier.height(10.dp))
                Text(t("Cost"), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(6.dp))
                InventoryField(t("Purchase price"), purchasePrice, currencyPrefix = symbol) { purchasePrice = it }
                Spacer(Modifier.height(8.dp))
                // An estimate, not the valuation — the two get confused, so the
                // field says what it is for and the line below says what the
                // item will actually carry.
                InventoryField(
                    t("Current value (est.)"),
                    currentValueEst,
                    currencyPrefix = symbol,
                    hint = t("An estimate for insurance or resale. Inventory value stays at what you paid — purchase price plus the costs below.")
                ) { currentValueEst = it }

                Spacer(Modifier.height(8.dp))
                // The number the item will actually carry in the list and the
                // KPIs, worked out here so nobody has to guess which field
                // moves it.
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        if (trackingType == StudioTrackingType.Unique) t("This item's inventory value")
                        else t("Inventory value per unit"),
                        fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f)
                    )
                    Text(
                        inventoryMoney(symbol, if (isCustomerOwned) 0.0 else internalTotal),
                        fontSize = 13.sp, fontWeight = FontWeight.Bold
                    )
                }
                if (isCustomerOwned) {
                    Text(
                        t("Customer property is held, not owned — it stays at zero."),
                        fontSize = 10.sp, color = Color.Gray
                    )
                }

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
                        prefix = { Text(symbol, fontSize = 12.sp) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true, modifier = Modifier.width(112.dp)
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

                Spacer(Modifier.height(8.dp))
                if (tags.isNotEmpty()) {
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        tags.forEach { tag ->
                            InputChip(
                                selected = false,
                                onClick = { tags.remove(tag) },
                                label = { Text(tag, fontSize = 11.sp) },
                                trailingIcon = { Icon(Icons.Filled.Close, null, modifier = Modifier.size(14.dp)) }
                            )
                        }
                    }
                }
                OutlinedTextField(
                    value = tagInput,
                    onValueChange = { tagInput = it },
                    label = { Text(t("Tags"), fontSize = 12.sp) },
                    placeholder = { Text(t("Add a tag and press Enter"), fontSize = 12.sp) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { addTag() }),
                    modifier = Modifier.fillMaxWidth()
                )

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

                Spacer(Modifier.height(12.dp))
                HorizontalDivider()
                Spacer(Modifier.height(8.dp))
                Text(t("Photos"), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(4.dp))
                Text(
                    if (itemId.isBlank()) t("Pick photos now — they upload as soon as the item is created.")
                    else t("New photos are added when you save."),
                    fontSize = 11.sp, color = Color.Gray
                )
                Spacer(Modifier.height(8.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    stagedPhotos.forEach { uri ->
                        Box {
                            AsyncImage(
                                model = uri,
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.size(64.dp).clip(RoundedCornerShape(10.dp))
                            )
                            Icon(
                                Icons.Filled.Close,
                                contentDescription = t("Remove"),
                                tint = Color.White,
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .size(18.dp)
                                    .clip(CircleShape)
                                    .background(Color(0xAA000000))
                                    .clickable { stagedPhotos.remove(uri) }
                                    .padding(3.dp)
                            )
                        }
                    }
                    if (photoRoom > 0) {
                        Box(
                            Modifier
                                .size(64.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(Color(0x142563EB))
                                .clickable {
                                    photoPicker.launch(
                                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                                    )
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Filled.Add, contentDescription = t("Add photos"), tint = StudioBlue)
                        }
                    }
                }
                if (photoRoom <= 0) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "${t("An item carries at most")} $INVENTORY_PHOTO_LIMIT ${t("photos.")}",
                        fontSize = 11.sp, color = Color.Gray
                    )
                }
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
                            // Always sent (key-present semantics): an empty list
                            // is a deliberate clearing, a missing key is not.
                            "tags" to tags.toList(),
                            "currentValueEst" to inventoryParse(currentValueEst),
                            // Fields the form has no input for, carried through
                            // untouched — the server blanks whatever an edit
                            // does not send.
                            "description" to existing?.description.orEmpty(),
                            "photos" to existing?.photos.orEmpty()
                        ),
                        itemId,
                        stagedPhotos.toList()
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
    /** The workspace's own category names — same list the item form uses. */
    categoryOptions: List<String>,
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
                    InventoryCategoryPicker(line.category, categoryOptions, t) { lines[index] = line.copy(category = it) }
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
    var notes by remember { mutableStateOf(supplier?.notes.orEmpty()) }
    // The paperwork fields: what an invoice or a customs form asks for.
    var code by remember { mutableStateOf(supplier?.code.orEmpty()) }
    var vatNumber by remember { mutableStateOf(supplier?.vatNumber.orEmpty()) }
    var currency by remember { mutableStateOf(supplier?.currency.orEmpty()) }
    var address by remember { mutableStateOf(supplier?.address.orEmpty()) }

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
                InventoryField(t("Supplier code"), code, placeholder = t("Your reference for them")) { code = it }
                Spacer(Modifier.height(8.dp))
                InventoryField(t("VAT number"), vatNumber) { vatNumber = it }
                Spacer(Modifier.height(8.dp))
                InventoryField(t("Currency"), currency, placeholder = "GBP, EUR…") { currency = it }
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = address,
                    onValueChange = { address = it },
                    label = { Text(t("Address"), fontSize = 12.sp) },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth()
                )
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
                            "name" to name, "email" to email, "phone" to phone, "website" to website,
                            "notes" to notes, "code" to code, "address" to address, "vatNumber" to vatNumber,
                            // Uppercased on save, like the web — a currency code
                            // is written GBP, whatever was typed.
                            "currency" to currency.trim().uppercase()
                        ),
                        supplier?.id.orEmpty()
                    )
                }
            ) { Text(t("Save")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Cancel")) } }
    )
}
