package uk.co.eggcraft.studioflow.features.inventory

// Stock committed to one order, shown inside the Materials card.
//
// Reserving is not consuming. A part set aside for a job is still physically in
// the drawer and still an asset; it just cannot be promised to a second order.
// That is why this shows a reserved total rather than deducting anything.

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
import uk.co.eggcraft.studioflow.data.model.StudioOrderStockLine
import uk.co.eggcraft.studioflow.data.model.StudioTrackingType
import uk.co.eggcraft.studioflow.language.LocalStudioLanguage
import uk.co.eggcraft.studioflow.language.studioT
import uk.co.eggcraft.studioflow.ui.theme.StudioBlue
import uk.co.eggcraft.studioflow.ui.theme.StudioRed

@Composable
fun OrderStockSection(
    workspaceId: String,
    orderId: String,
    currencySymbol: String,
    canEdit: Boolean,
    /** The total is offered to the Financial card, never written into it. A
     *  figure a person typed is a decision, and overwriting it silently would
     *  lose that decision without telling anyone. */
    onUseAsBaseCost: (Double) -> Unit
) {
    val lang = LocalStudioLanguage.current
    val t: (String) -> String = { studioT(it, lang) }
    val scope = rememberCoroutineScope()
    val repository = remember { StudioFlowRepository() }

    var lines by remember(orderId) { mutableStateOf<List<StudioOrderStockLine>>(emptyList()) }
    var total by remember(orderId) { mutableStateOf(0.0) }
    var loading by remember(orderId) { mutableStateOf(true) }
    var picking by remember { mutableStateOf(false) }
    var applyingRecipe by remember { mutableStateOf(false) }
    var swapFrom by remember { mutableStateOf<StudioOrderStockLine?>(null) }
    var busyId by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun reload() {
        if (workspaceId.isBlank() || orderId.isBlank()) return
        try {
            val result = repository.inventoryOrderStock(workspaceId, orderId)
            lines = result.first
            total = result.second
            error = null
        } catch (failure: Exception) {
            error = failure.message
        }
        loading = false
    }

    LaunchedEffect(workspaceId, orderId) { reload() }

    Column(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                t("Stock reserved for this order"),
                fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.Gray,
                modifier = Modifier.weight(1f)
            )
            if (canEdit) {
                Text(
                    t("Reserve stock"), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = StudioBlue,
                    modifier = Modifier.clickable { picking = true }
                )
                Spacer(Modifier.width(12.dp))
                Text(
                    t("Use a recipe…"), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = StudioBlue,
                    modifier = Modifier.clickable { applyingRecipe = true }
                )
            }
        }

        Spacer(Modifier.height(8.dp))

        when {
            loading && lines.isEmpty() -> Text(t("Loading…"), fontSize = 12.sp, color = Color.Gray)
            lines.isEmpty() -> Text(
                t("Nothing reserved yet. Reserving puts a part aside for this job so it cannot be promised twice."),
                fontSize = 12.sp, color = Color.Gray
            )
            else -> {
                lines.forEach { line ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(line.name, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                            // "3 / 10 ml" — what this order holds out of what
                            // exists, so a partial reserve doesn't read like
                            // the whole spool. Older responses carry no onHand;
                            // then the bare quantity stands alone.
                            val meta = listOf(
                                line.number,
                                if (line.trackingType == StudioTrackingType.Quantity)
                                    inventoryQuantity(line.quantity) +
                                        (if (line.onHand > 0) " / " + inventoryQuantity(line.onHand) else "") +
                                        (if (line.unit.isBlank()) "" else " ${line.unit}")
                                else "",
                                line.location
                            ).filter { it.isNotBlank() }.joinToString(" · ")
                            if (meta.isNotBlank()) Text(meta, fontSize = 11.sp, color = Color.Gray)
                        }
                        Text(inventoryMoney(currencySymbol, line.lineCost), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                    if (canEdit) {
                        // Three fates for a reserved part, on their own row so
                        // the labels survive a phone width in every language.
                        Row(Modifier.fillMaxWidth().padding(bottom = 5.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                            // Consuming is the moment the promised part actually
                            // goes into the job: the whole reserved line leaves
                            // the shelf and the ledger names this order.
                            Text(
                                t("Use on the job"), fontSize = 12.sp, color = StudioBlue,
                                modifier = Modifier.clickable(enabled = busyId == null) {
                                    busyId = line.id
                                    scope.launch {
                                        try {
                                            repository.inventoryConsume(workspaceId, line.id, orderId)
                                            reload()
                                        } catch (failure: Exception) {
                                            error = failure.message ?: t("The item could not be marked as used.")
                                        }
                                        busyId = null
                                    }
                                }
                            )
                            Text(
                                t("Swap…"), fontSize = 12.sp, color = StudioBlue,
                                modifier = Modifier.clickable(enabled = busyId == null) { swapFrom = line }
                            )
                            Text(
                                t("Release"), fontSize = 12.sp, color = StudioRed,
                                modifier = Modifier.clickable(enabled = busyId == null) {
                                    busyId = line.id
                                    scope.launch {
                                        try {
                                            repository.inventoryRelease(workspaceId, line.id, orderId)
                                            reload()
                                        } catch (failure: Exception) { error = failure.message }
                                        busyId = null
                                    }
                                }
                            )
                        }
                    }
                }

                Spacer(Modifier.height(6.dp))
                HorizontalDivider()
                Spacer(Modifier.height(6.dp))
                Row {
                    Text(t("Committed stock cost"), fontSize = 13.sp, modifier = Modifier.weight(1f))
                    Text(inventoryMoney(currencySymbol, total), fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }

                if (canEdit && total > 0) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        t("Use as the base cost on the Financial card"),
                        fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = StudioBlue,
                        modifier = Modifier.clickable { onUseAsBaseCost(total) }
                    )
                }
            }
        }

        error?.let {
            Spacer(Modifier.height(6.dp))
            Text(it, fontSize = 11.sp, color = StudioRed)
        }
    }

    if (applyingRecipe) {
        ApplyRecipeDialog(
            workspaceId = workspaceId,
            orderId = orderId,
            t = t,
            onDismiss = { applyingRecipe = false },
            onApplied = {
                applyingRecipe = false
                scope.launch { reload() }
            }
        )
    }

    if (picking || swapFrom != null) {
        ReserveStockDialog(
            workspaceId = workspaceId,
            orderId = orderId,
            currencySymbol = currencySymbol,
            alreadyReserved = lines.map { it.id },
            swapFrom = swapFrom,
            t = t,
            onDismiss = { picking = false; swapFrom = null },
            onReserved = {
                picking = false
                swapFrom = null
                scope.launch { reload() }
            }
        )
    }
}

@Composable
private fun ReserveStockDialog(
    workspaceId: String,
    orderId: String,
    currencySymbol: String,
    alreadyReserved: List<String>,
    /** When set, picking an item swaps this line for it instead of adding —
     *  the server releases the old reservation and takes the new one in a
     *  single transaction. */
    swapFrom: StudioOrderStockLine? = null,
    t: (String) -> String,
    onDismiss: () -> Unit,
    onReserved: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val repository = remember { StudioFlowRepository() }
    var items by remember { mutableStateOf<List<StudioInventoryItem>>(emptyList()) }
    var search by remember { mutableStateOf("") }
    var amounts by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(workspaceId) {
        try { items = repository.inventoryItems(workspaceId) }
        catch (failure: Exception) { error = failure.message }
        loading = false
    }

    // Only what can honestly be promised: business-owned, still on the shelf,
    // and not already spoken for. A customer's own property is never offered.
    val choices = items.filter { item ->
        !item.isCustomerOwned &&
            item.id !in alreadyReserved &&
            item.freeToReserve > 0 &&
            (search.isBlank() || listOf(
                item.name, item.brand, item.model, item.reference, item.serialNumber, item.sku, item.number
            ).any { it.lowercase().contains(search.trim().lowercase()) })
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                t(if (swapFrom != null) "Swap to a different item" else "Reserve stock"),
                fontSize = 17.sp, fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()).heightIn(max = 420.dp)) {
                OutlinedTextField(
                    value = search,
                    onValueChange = { search = it },
                    label = { Text(t("Search stock…"), fontSize = 12.sp) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(10.dp))

                when {
                    loading -> Text(t("Loading…"), fontSize = 12.sp, color = Color.Gray)
                    choices.isEmpty() -> Text(
                        if (items.isEmpty()) t("There is nothing in inventory yet.")
                        else t("Nothing available to reserve — everything is either used, sold or already promised."),
                        fontSize = 12.sp, color = Color.Gray
                    )
                    else -> choices.forEach { item ->
                        // In swap mode the sensible default is what the old
                        // line held (capped at what the new item can give),
                        // not everything the new item has free.
                        val fallback = if (swapFrom != null && item.trackingType == StudioTrackingType.Quantity)
                            minOf(item.freeToReserve, swapFrom.quantity)
                        else item.freeToReserve
                        Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(item.name, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                                Text(
                                    listOf(
                                        item.number, item.category,
                                        inventoryQuantity(item.freeToReserve) +
                                            (if (item.unit.isBlank()) "" else " ${item.unit}") + " " + t("free")
                                    ).filter { it.isNotBlank() }.joinToString(" · "),
                                    fontSize = 10.sp, color = Color.Gray
                                )
                            }
                            if (item.trackingType == StudioTrackingType.Quantity) {
                                OutlinedTextField(
                                    value = amounts[item.id] ?: inventoryQuantity(fallback),
                                    onValueChange = { amounts = amounts + (item.id to it) },
                                    singleLine = true,
                                    modifier = Modifier.width(78.dp)
                                )
                            } else {
                                Text(
                                    inventoryMoney(currencySymbol, item.valuationCost),
                                    fontSize = 12.sp, fontWeight = FontWeight.SemiBold
                                )
                            }
                            Spacer(Modifier.width(10.dp))
                            TextButton(
                                enabled = !busy,
                                onClick = {
                                    busy = true
                                    error = null
                                    val wanted = if (item.trackingType == StudioTrackingType.Unique) 1.0
                                    else inventoryParse(amounts[item.id] ?: inventoryQuantity(fallback))
                                    scope.launch {
                                        try {
                                            if (swapFrom != null) {
                                                repository.inventorySwap(workspaceId, orderId, swapFrom.id, item.id, wanted)
                                            } else {
                                                repository.inventoryReserve(workspaceId, item.id, orderId, wanted)
                                            }
                                            onReserved()
                                        } catch (failure: Exception) {
                                            error = failure.message
                                                ?: t(if (swapFrom != null) "The swap could not be completed." else "The item could not be reserved.")
                                            busy = false
                                        }
                                    }
                                }
                            ) { Text(t(if (swapFrom != null) "Swap" else "Reserve"), fontSize = 12.sp) }
                        }
                        HorizontalDivider()
                    }
                }

                error?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, fontSize = 12.sp, color = StudioRed)
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text(t("Close")) } }
    )
}

/** One act: pick the recipe, say how many jobs' worth, and the server reserves
 *  every line in a single transaction — or refuses and reserves nothing. The
 *  refusal names the part that did not fit, so it is shown verbatim. */
@Composable
private fun ApplyRecipeDialog(
    workspaceId: String,
    orderId: String,
    t: (String) -> String,
    onDismiss: () -> Unit,
    onApplied: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val repository = remember { StudioFlowRepository() }
    var recipes by remember { mutableStateOf<List<StudioInventoryRecipe>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var recipeId by remember { mutableStateOf("") }
    var multiplier by remember { mutableStateOf("1") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(workspaceId) {
        try {
            recipes = repository.inventoryRecipes(workspaceId)
            // One recipe needs no choosing.
            if (recipes.size == 1) recipeId = recipes.first().id
        } catch (failure: Exception) {
            error = failure.message ?: t("Recipes could not be loaded.")
        }
        loading = false
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(t("Use a recipe"), fontSize = 17.sp, fontWeight = FontWeight.Bold) },
        text = {
            Column {
                when {
                    loading -> Text(t("Loading…"), fontSize = 12.sp, color = Color.Gray)
                    recipes.isEmpty() -> Text(
                        t("No recipes yet — write one under Inventory → Recipes."),
                        fontSize = 12.sp, color = Color.Gray
                    )
                    else -> {
                        var open by remember { mutableStateOf(false) }
                        val selected = recipes.firstOrNull { it.id == recipeId }
                        Box {
                            OutlinedTextField(
                                value = selected?.let { "${it.name} · ${it.lines.size} ${t("lines")}" }
                                    ?: t("Choose a recipe…"),
                                onValueChange = {},
                                readOnly = true,
                                label = { Text(t("Recipe"), fontSize = 12.sp) },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                            Box(Modifier.matchParentSize().clickable { open = true })
                            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                                recipes.forEach { recipe ->
                                    DropdownMenuItem(
                                        text = {
                                            Text(
                                                "${recipe.name} · ${recipe.lines.size} ${t("lines")}",
                                                fontSize = 13.sp
                                            )
                                        },
                                        onClick = { open = false; recipeId = recipe.id }
                                    )
                                }
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        OutlinedTextField(
                            value = multiplier,
                            onValueChange = { multiplier = it },
                            label = { Text(t("How many jobs' worth"), fontSize = 12.sp) },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
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
                enabled = !busy && !loading && recipes.isNotEmpty(),
                onClick = {
                    if (recipeId.isBlank()) {
                        error = t("Choose a recipe first.")
                        return@TextButton
                    }
                    busy = true
                    error = null
                    scope.launch {
                        try {
                            val times = inventoryParse(multiplier).takeIf { it > 0 } ?: 1.0
                            repository.inventoryApplyRecipe(workspaceId, recipeId, orderId, times)
                            onApplied()
                        } catch (failure: Exception) {
                            error = failure.message ?: t("The recipe could not be applied.")
                            busy = false
                        }
                    }
                }
            ) { Text(t("Reserve the parts"), fontSize = 13.sp) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Cancel")) } }
    )
}
