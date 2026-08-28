package uk.co.eggcraft.studioflow.features.inventory

// Inventory on Android. Three tabs over one idea: what the workshop owns
// (Items), what it bought (Purchases), and who it bought from (Suppliers).
//
// Everything that decides money or status is a server call. This file draws.

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Locale
import kotlinx.coroutines.launch
import uk.co.eggcraft.studioflow.data.firebase.StudioFlowRepository
import uk.co.eggcraft.studioflow.data.model.StudioInventoryCursor
import uk.co.eggcraft.studioflow.data.model.StudioInventoryItem
import uk.co.eggcraft.studioflow.data.model.StudioInventoryStatus
import uk.co.eggcraft.studioflow.data.model.StudioInventorySummary
import uk.co.eggcraft.studioflow.data.model.StudioPurchase
import uk.co.eggcraft.studioflow.data.model.StudioSupplier
import uk.co.eggcraft.studioflow.data.model.StudioTrackingType
import uk.co.eggcraft.studioflow.data.model.StudioInventoryCategory
import uk.co.eggcraft.studioflow.data.model.studioInventoryCategories
import uk.co.eggcraft.studioflow.features.shell.StudioFlowUiState
import uk.co.eggcraft.studioflow.language.LocalStudioLanguage
import uk.co.eggcraft.studioflow.language.studioT
import uk.co.eggcraft.studioflow.ui.theme.StudioBlue
import uk.co.eggcraft.studioflow.ui.theme.StudioGreen
import uk.co.eggcraft.studioflow.ui.theme.StudioPartialOrange
import uk.co.eggcraft.studioflow.ui.theme.StudioRed
import uk.co.eggcraft.studioflow.ui.theme.StudioWarningOrange

/** The workspace's decimal separator, so every inventory screen formats money
 *  the same way without threading it through each composable's signature. */
internal val LocalInventoryDecimalSeparator = compositionLocalOf { "." }

/** Grouped thousands and the workspace's decimal separator, the same way the
 *  bank and dashboard screens format money. Plain String.format ignored both,
 *  so £6,210.00 came out as "£6210.00". */
@Composable
internal fun inventoryMoney(symbol: String, value: Double): String {
    val formatted = String.format(Locale.UK, "%,.2f", value)
    return symbol + if (LocalInventoryDecimalSeparator.current == ",") {
        formatted.replace(",", "_").replace(".", ",").replace("_", ".")
    } else formatted
}

internal fun inventoryQuantity(value: Double): String =
    if (value == value.toLong().toDouble()) value.toLong().toString() else String.format("%.2f", value)


/** The rest of the app draws cards on the plain surface colour; Material 3's
 *  default is surfaceVariant, which left the inventory screen looking grey and
 *  patchy next to every other screen. */
@Composable
internal fun inventoryCardColors() =
    CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)

private enum class InventoryTab(val label: String) {
    Items("Items"), Purchases("Purchases"), Suppliers("Suppliers"),
    Stocktake("Stocktake"), Locations("Locations"), Recipes("Recipes"), Reports("Reports"),
    Categories("Categories")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InventoryScreen(state: StudioFlowUiState) {
    val lang = LocalStudioLanguage.current
    val t: (String) -> String = { studioT(it, lang) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val repository = remember { StudioFlowRepository() }
    val workspaceId = state.workspace?.id.orEmpty()
    val symbol = state.workspaceSettings.selectedCurrency
    val decimalSeparator = state.workspaceSettings.selectedDecimalSeparator
    // Inventory rides the orders permission: someone who cannot see orders has
    // no reason to see what the workshop owns.
    val canEdit = state.workspace?.isOwner == true ||
        state.workspace?.memberAccess?.allows("orders") == true

    var tab by remember { mutableStateOf(InventoryTab.Items) }
    var items by remember { mutableStateOf<List<StudioInventoryItem>>(emptyList()) }
    var summary by remember { mutableStateOf(StudioInventorySummary()) }
    var purchases by remember { mutableStateOf<List<StudioPurchase>>(emptyList()) }
    var suppliers by remember { mutableStateOf<List<StudioSupplier>>(emptyList()) }
    var search by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    // A workshop past 500 items used to fall silently off the end of the list;
    // the server now hands back a cursor and the screen fetches the next page.
    var listCursor by remember { mutableStateOf<StudioInventoryCursor?>(null) }
    var loadingMore by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }
    // The item form serves three doors: Add (no prefill), Edit (prefill + the
    // item's id) and Duplicate (prefill with identity cleared, blank id so the
    // server assigns a fresh INV number).
    var itemEditor by remember { mutableStateOf<Pair<StudioInventoryItem?, String>?>(null) }
    var detailItemId by remember { mutableStateOf<String?>(null) }
    var showOpeningStock by remember { mutableStateOf(false) }
    var photosFor by remember { mutableStateOf<StudioInventoryItem?>(null) }
    var showNewPurchase by remember { mutableStateOf(false) }
    var showNewSupplier by remember { mutableStateOf(false) }
    var editingSupplier by remember { mutableStateOf<StudioSupplier?>(null) }
    var matchingPurchase by remember { mutableStateOf<StudioPurchase?>(null) }
    var receivingPurchase by remember { mutableStateOf<StudioPurchase?>(null) }
    // Defined location paths ("Safe A / Drawer 3") offered as suggestions on the
    // item form's free-text location field. Best-effort: the field works without
    // them, so a failed fetch stays silent.
    var locationPaths by remember { mutableStateOf<List<String>>(emptyList()) }
    // The workspace's own categories, served with the item page. Every picker
    // on this screen reads categoryOptions, so a rename made on any platform
    // shows up here too.
    var categories by remember { mutableStateOf<List<StudioInventoryCategory>>(emptyList()) }
    var defaultCategory by remember { mutableStateOf("") }

    val categoryOptions = run {
        val live = categories.filter { !it.archived }.map { it.title }
        val base = live.ifEmpty { inventoryCategoryList }
        (base + items.map { it.category }.filter { it.isNotBlank() }).distinct()
    }

    suspend fun reloadLocationPaths() {
        runCatching { repository.inventoryLocations(workspaceId).map { it.path } }
            .onSuccess { locationPaths = it }
    }

    suspend fun reloadItems() {
        try {
            val page = repository.inventoryItemsPage(workspaceId)
            items = page.items
            listCursor = page.cursor
            categories = page.categories
            defaultCategory = page.defaultCategory
            summary = repository.inventorySummary(workspaceId)
            notice = null
        } catch (error: Exception) {
            notice = error.message
        }
        loading = false
    }

    suspend fun loadMoreItems() {
        val cursor = listCursor ?: return
        if (loadingMore) return
        loadingMore = true
        try {
            val page = repository.inventoryItemsPage(workspaceId, cursor)
            // Deduped by id: an item edited between the two fetches can slide
            // across the page boundary and arrive twice.
            val seen = items.map { it.id }.toHashSet()
            items = items + page.items.filter { it.id !in seen }
            listCursor = page.cursor
        } catch (error: Exception) {
            notice = error.message
        }
        loadingMore = false
    }

    suspend fun reloadPurchases() {
        try { purchases = repository.inventoryPurchases(workspaceId) }
        catch (error: Exception) { notice = error.message }
    }

    suspend fun reloadSuppliers() {
        try { suppliers = repository.inventorySuppliers(workspaceId).sortedByDescending { it.spent } }
        catch (error: Exception) { notice = error.message }
    }

    LaunchedEffect(workspaceId) {
        if (workspaceId.isNotBlank()) {
            reloadItems()
            reloadLocationPaths()
        }
    }

    LaunchedEffect(tab, workspaceId) {
        if (workspaceId.isBlank()) return@LaunchedEffect
        when (tab) {
            InventoryTab.Purchases -> { reloadPurchases(); if (suppliers.isEmpty()) reloadSuppliers() }
            InventoryTab.Suppliers -> reloadSuppliers()
            else -> Unit
        }
    }

    val visible = items.filter { item ->
        val needle = search.trim().lowercase()
        needle.isBlank() || listOf(
            item.name, item.brand, item.model, item.reference, item.serialNumber, item.sku, item.number,
            item.tags.joinToString(" ")
        ).any { it.lowercase().contains(needle) }
    }

    CompositionLocalProvider(LocalInventoryDecimalSeparator provides decimalSeparator) {
    Column(Modifier.fillMaxWidth().padding(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(t("Inventory"), fontSize = 21.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            if (canEdit && tab == InventoryTab.Items) {
                Text(
                    t("Import opening stock"),
                    fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = StudioBlue,
                    modifier = Modifier.clickable { showOpeningStock = true }.padding(end = 12.dp)
                )
            }
            if (canEdit && (tab == InventoryTab.Items || tab == InventoryTab.Purchases || tab == InventoryTab.Suppliers)) {
                Button(onClick = {
                    when (tab) {
                        InventoryTab.Items -> itemEditor = null to ""
                        InventoryTab.Purchases -> showNewPurchase = true
                        InventoryTab.Suppliers -> showNewSupplier = true
                        else -> Unit
                    }
                }) {
                    Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(5.dp))
                    Text(
                        when (tab) {
                            InventoryTab.Items -> t("Add Item")
                            InventoryTab.Purchases -> t("New Purchase")
                            InventoryTab.Suppliers -> t("New Supplier")
                            else -> ""
                        },
                        fontSize = 13.sp
                    )
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        TabRow(selectedTabIndex = tab.ordinal) {
            InventoryTab.entries.forEach { entry ->
                Tab(
                    selected = tab == entry,
                    onClick = { tab = entry },
                    text = { Text(t(entry.label), fontSize = 13.sp, fontWeight = FontWeight.Bold) }
                )
            }
        }

        Spacer(Modifier.height(12.dp))

        notice?.let {
            Text(it, fontSize = 12.sp, color = StudioRed)
            Spacer(Modifier.height(8.dp))
        }

        when (tab) {
            InventoryTab.Items -> ItemsTab(
                items = visible,
                allCount = items.size,
                summary = summary,
                symbol = symbol,
                search = search,
                onSearch = { search = it },
                loading = loading,
                hasMore = listCursor != null,
                loadingMore = loadingMore,
                onLoadMore = { scope.launch { loadMoreItems() } },
                canEdit = canEdit,
                t = t,
                onChangeStatus = { item, status ->
                    scope.launch {
                        try {
                            repository.inventorySetStatus(workspaceId, item.id, status)
                            reloadItems()
                        } catch (error: Exception) { notice = error.message }
                    }
                },
                onPhotos = { photosFor = it },
                onOpen = { detailItemId = it.id }
            )

            InventoryTab.Purchases -> PurchasesTab(
                purchases = purchases,
                symbol = symbol,
                canEdit = canEdit,
                t = t,
                onReceive = { purchase ->
                    scope.launch {
                        try {
                            repository.inventoryReceivePurchase(workspaceId, purchase.id)
                            reloadPurchases(); reloadItems()
                        } catch (error: Exception) { notice = error.message }
                    }
                },
                onReceiveLines = { receivingPurchase = it },
                onDelete = { purchase ->
                    scope.launch {
                        try {
                            repository.inventoryDeletePurchase(workspaceId, purchase.id)
                            reloadPurchases(); reloadItems()
                        } catch (error: Exception) { notice = error.message }
                    }
                },
                onMatch = { matchingPurchase = it }
            )

            InventoryTab.Stocktake -> StocktakeTab(
                workspaceId = workspaceId,
                symbol = symbol,
                decimalSeparator = decimalSeparator,
                canEdit = canEdit,
                t = t,
                onStockChanged = { scope.launch { reloadItems() } }
            )

            InventoryTab.Locations -> LocationsTab(
                workspaceId = workspaceId,
                items = items,
                canEdit = canEdit,
                t = t,
                onLocationsChanged = {
                    // A rename cascades into item location strings server-side,
                    // so both the item list and the form suggestions go stale.
                    scope.launch { reloadItems(); reloadLocationPaths() }
                }
            )

            InventoryTab.Recipes -> RecipesTab(
                workspaceId = workspaceId,
                items = items,
                canEdit = canEdit,
                t = t
            )

            InventoryTab.Categories -> CategoriesTab(
                workspaceId = workspaceId,
                canEdit = canEdit,
                t = t,
                // A rename cascades into the items' category strings — reload
                // so every picker on this screen agrees.
                onChanged = { scope.launch { reloadItems() } }
            )

            InventoryTab.Reports -> ReportsTab(
                workspaceId = workspaceId,
                symbol = symbol,
                decimalSeparator = decimalSeparator,
                t = t
            )

            InventoryTab.Suppliers -> SuppliersTab(
                suppliers = suppliers,
                symbol = symbol,
                canEdit = canEdit,
                t = t,
                onEdit = { editingSupplier = it }
            )
        }
    }

    photosFor?.let { item ->
        ItemPhotosDialog(
            workspaceId = workspaceId,
            item = item,
            canEdit = canEdit,
            t = t,
            onDismiss = { photosFor = null },
            onChanged = { scope.launch { reloadItems() } }
        )
    }

    if (showOpeningStock) {
        OpeningStockDialog(
            workspaceId = workspaceId,
            symbol = symbol,
            t = t,
            onDismiss = { showOpeningStock = false },
            onImported = { count ->
                showOpeningStock = false
                notice = "$count " + t("items were imported as opening stock.")
                scope.launch { reloadItems() }
            }
        )
    }

    itemEditor?.let { (prefill, editingItemId) ->
        NewInventoryItemDialog(
            symbol = symbol,
            t = t,
            existing = prefill,
            itemId = editingItemId,
            locationPaths = locationPaths,
            categoryOptions = categoryOptions,
            defaultCategory = defaultCategory,
            onDismiss = { itemEditor = null },
            onSave = { payload, savingItemId, stagedPhotos ->
                scope.launch {
                    try {
                        val savedId = repository.inventorySaveItem(workspaceId, payload, savingItemId)
                        // The item exists now, so the photos picked on the form
                        // finally have somewhere to live: storage paths are keyed
                        // by the item id. A photo that will not upload must not
                        // take the saved item down with it — the item stays, and
                        // the screen says plainly what is missing.
                        var photosFailed = false
                        if (stagedPhotos.isNotEmpty() && savedId.isNotBlank()) {
                            try {
                                val uploaded = stagedPhotos.map { uri ->
                                    val bytes = context.contentResolver.openInputStream(uri)
                                        ?.use { it.readBytes() }
                                        ?: throw IllegalStateException("empty")
                                    repository.inventoryUploadPhoto(workspaceId, savedId, bytes)
                                }
                                val kept = (payload["photos"] as? List<*>).orEmpty().filterIsInstance<String>()
                                repository.inventorySaveItem(
                                    workspaceId, payload + mapOf("photos" to kept + uploaded), savedId
                                )
                            } catch (photoFailure: Exception) {
                                photosFailed = true
                            }
                        }
                        itemEditor = null
                        // After the reload, which clears the notice on success.
                        reloadItems()
                        if (photosFailed) {
                            notice = t("The item was saved, but the photos could not be uploaded. Add them from the item's photo button.")
                        }
                    } catch (error: Exception) { notice = error.message }
                }
            }
        )
    }

    // The detail sheet reads the live row, so a save or a release redraws it
    // without reopening. If the item vanishes from the list, the sheet goes.
    items.firstOrNull { it.id == detailItemId }?.let { detailItem ->
        ItemDetailSheet(
            workspaceId = workspaceId,
            item = detailItem,
            orders = state.orders,
            symbol = symbol,
            canEdit = canEdit,
            t = t,
            onDismiss = { detailItemId = null },
            onChanged = { scope.launch { reloadItems() } },
            onEdit = { prefill, editItemId -> itemEditor = prefill to editItemId },
            onPhotos = { photosFor = it }
        )
    }

    if (showNewPurchase) {
        NewPurchaseDialog(
            symbol = symbol,
            supplierNames = suppliers.map { it.name },
            categoryOptions = categoryOptions,
            t = t,
            onDismiss = { showNewPurchase = false },
            onSave = { payload ->
                scope.launch {
                    try {
                        repository.inventorySavePurchase(workspaceId, payload)
                        showNewPurchase = false
                        reloadPurchases(); reloadItems()
                    } catch (error: Exception) { notice = error.message }
                }
            }
        )
    }

    receivingPurchase?.let { purchase ->
        ReceiveDeliveryDialog(
            workspaceId = workspaceId,
            purchase = purchase,
            t = t,
            onDismiss = { receivingPurchase = null },
            onReceived = {
                receivingPurchase = null
                scope.launch { reloadPurchases(); reloadItems() }
            }
        )
    }

    matchingPurchase?.let { purchase ->
        MatchPaymentDialog(
            purchase = purchase,
            transactions = state.bankTransactions,
            symbol = symbol,
            t = t,
            onDismiss = { matchingPurchase = null },
            onMatch = { transactionId ->
                scope.launch {
                    try {
                        val difference = repository.inventoryMatchPayment(workspaceId, purchase.id, transactionId)
                        matchingPurchase = null
                        reloadPurchases()
                        // Reported, not refused: a deposit or a part payment is
                        // a real thing, and blocking it would push the user back
                        // to a spreadsheet.
                        if (kotlin.math.abs(difference) > 0.009 && transactionId.isNotBlank()) {
                            notice = t("The payment does not match the purchase total. If this was a deposit or a part payment that is fine — otherwise check the purchase.")
                        }
                    } catch (error: Exception) { notice = error.message }
                }
            }
        )
    }

    if (showNewSupplier || editingSupplier != null) {
        SupplierDialog(
            supplier = editingSupplier,
            t = t,
            onDismiss = { showNewSupplier = false; editingSupplier = null },
            onSave = { payload, supplierId ->
                scope.launch {
                    try {
                        repository.inventorySaveSupplier(workspaceId, payload, supplierId)
                        showNewSupplier = false; editingSupplier = null
                        reloadSuppliers()
                    } catch (error: Exception) { notice = error.message }
                }
            }
        )
    }
    }
}

@Composable
private fun ItemsTab(
    items: List<StudioInventoryItem>,
    allCount: Int,
    summary: StudioInventorySummary,
    symbol: String,
    search: String,
    onSearch: (String) -> Unit,
    loading: Boolean,
    hasMore: Boolean,
    loadingMore: Boolean,
    onLoadMore: () -> Unit,
    canEdit: Boolean,
    t: (String) -> String,
    onChangeStatus: (StudioInventoryItem, StudioInventoryStatus) -> Unit,
    onPhotos: (StudioInventoryItem) -> Unit,
    onOpen: (StudioInventoryItem) -> Unit
) {
    // The 30-day change rides under the total only when the server vouches for
    // it — a ledger younger than the window would make the percentage a lie.
    val change = summary.monthlyChange
    val changeSub = if (change.available) {
        val pct = if (change.pct == change.pct.toLong().toDouble())
            change.pct.toLong().toString() else change.pct.toString()
        (if (change.pct > 0) "+" else "") + pct + "% " + t("this month")
    } else ""
    val cards = listOf(
        Triple(t("Total Inventory Value"), inventoryMoney(symbol, summary.totalValue), changeSub),
        Triple(t("Unique Items"), summary.uniqueCount.toString(), inventoryMoney(symbol, summary.uniqueValue)),
        Triple(t("Quantity Items"), summary.quantityCount.toString(), inventoryMoney(symbol, summary.quantityValue)),
        Triple(t("Reserved for Orders"), inventoryMoney(symbol, summary.reservedValue), "${summary.reservedCount} " + t("items")),
        Triple(t("Incoming"), summary.incomingCount.toString(), inventoryMoney(symbol, summary.incomingValue)),
        Triple(t("Low Stock"), summary.lowStockCount.toString(), "")
    )
    Column {
        LazyVerticalGrid(
            columns = GridCells.Adaptive(150.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.heightIn(max = 190.dp)
        ) {
            items(cards.size) { index ->
                val (label, value, sub) = cards[index]
                Card(colors = inventoryCardColors(), shape = RoundedCornerShape(12.dp)) {
                    Column(Modifier.padding(11.dp)) {
                        Text(label, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.Gray)
                        Text(value, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                        if (sub.isNotBlank()) Text(sub, fontSize = 11.sp, color = Color.Gray)
                    }
                }
            }
        }

        if (summary.customerOwnedCount > 0) {
            Spacer(Modifier.height(8.dp))
            Text(
                "${summary.customerOwnedCount} " + t("customer-owned items are held here and deliberately valued at zero — they are the customer's property, not stock."),
                fontSize = 11.sp, color = Color.Gray
            )
        }

        Spacer(Modifier.height(10.dp))

        OutlinedTextField(
            value = search,
            onValueChange = onSearch,
            label = { Text(t("Search items, brand, ref, serial, SKU…"), fontSize = 12.sp) },
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(10.dp))

        when {
            loading && items.isEmpty() -> Text(t("Loading…"), fontSize = 12.sp, color = Color.Gray)
            items.isEmpty() -> Column {
                InventoryEmptyBox(
                    title = if (allCount == 0) t("Nothing in inventory yet") else t("No items match these filters"),
                    body = if (allCount == 0) t("Add your first item, or import your opening stock.") else ""
                )
                // A search can empty the page while later pages still hold
                // matches, so the way to the rest of the stock stays open.
                if (hasMore) {
                    Spacer(Modifier.height(10.dp))
                    InventoryLoadMoreRow(loadingMore, onLoadMore, t)
                }
            }
            else -> LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(bottom = 24.dp)
            ) {
                items(items, key = { it.id }) { item ->
                    InventoryItemRow(item, symbol, canEdit, t, onChangeStatus, onPhotos, onOpen)
                }
                if (hasMore) {
                    item(key = "load-more") {
                        InventoryLoadMoreRow(loadingMore, onLoadMore, t)
                    }
                }
            }
        }
    }
}

/** The end of a page that is not the end of the stock. */
@Composable
private fun InventoryLoadMoreRow(
    loadingMore: Boolean,
    onLoadMore: () -> Unit,
    t: (String) -> String
) {
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(t("There is more stock than one page carries."), fontSize = 11.sp, color = Color.Gray)
        Spacer(Modifier.height(2.dp))
        Text(
            if (loadingMore) t("Loading…") else t("Load the next 500 items"),
            fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = StudioBlue,
            modifier = Modifier.clickable(enabled = !loadingMore) { onLoadMore() }.padding(4.dp)
        )
    }
}

@Composable
private fun InventoryItemRow(
    item: StudioInventoryItem,
    symbol: String,
    canEdit: Boolean,
    t: (String) -> String,
    onChangeStatus: (StudioInventoryItem, StudioInventoryStatus) -> Unit,
    onPhotos: (StudioInventoryItem) -> Unit,
    onOpen: (StudioInventoryItem) -> Unit
) {
    var menuOpen by remember { mutableStateOf(false) }
    Card(
        colors = inventoryCardColors(),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.clickable { onOpen(item) }
    ) {
        Row(Modifier.fillMaxWidth().padding(12.dp)) {
            Column(Modifier.weight(1f)) {
                Text(item.name, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                val meta = listOf(
                    item.number,
                    if (item.reference.isBlank()) "" else "Ref. ${item.reference}",
                    item.serialNumber
                ).filter { it.isNotBlank() }.joinToString(" · ")
                if (meta.isNotBlank()) Text(meta, fontSize = 11.sp, color = Color.Gray)
                Spacer(Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    val low = item.isLowStock && item.status == StudioInventoryStatus.Available
                    InventoryPill(
                        text = if (low) t("Low Stock") else t(item.status.label),
                        colour = when {
                            low -> StudioWarningOrange
                            item.status == StudioInventoryStatus.Available -> StudioGreen
                            item.status == StudioInventoryStatus.Reserved -> StudioWarningOrange
                            item.status == StudioInventoryStatus.PartiallyReserved -> StudioPartialOrange
                            item.status == StudioInventoryStatus.Incoming -> StudioBlue
                            else -> Color.Gray
                        }
                    )
                    InventoryPill(t(item.trackingType.label), StudioBlue)
                    if (item.location.isNotBlank()) {
                        Text(item.location, fontSize = 10.sp, color = Color.Gray)
                    }
                    Text(
                        if (item.photos.isEmpty()) "\uD83D\uDCF7" else "\uD83D\uDCF7 ${item.photos.size}",
                        fontSize = 10.sp,
                        modifier = Modifier.clickable { onPhotos(item) }
                    )
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    if (item.isCustomerOwned) t("Customer's") else inventoryMoney(symbol, item.lineValue),
                    fontSize = 13.sp, fontWeight = FontWeight.Bold
                )
                if (item.trackingType == StudioTrackingType.Quantity) {
                    Text(
                        inventoryQuantity(item.displayOnHand) + if (item.unit.isBlank()) "" else " ${item.unit}",
                        fontSize = 11.sp, color = Color.Gray
                    )
                }
                if (canEdit) {
                    Box {
                        TextButton(onClick = { menuOpen = true }) {
                            Text(t("Move to…"), fontSize = 11.sp)
                        }
                        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                            // Only moves the server will accept — and never
                            // "reserved": reserving must go through
                            // reserveInventoryForOrder (which links an order);
                            // a bare status flip would reserve it for nothing.
                            inventoryStatusNext(item.status).forEach { status ->
                                DropdownMenuItem(
                                    text = { Text(t(status.label), fontSize = 13.sp) },
                                    onClick = { menuOpen = false; onChangeStatus(item, status) }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PurchasesTab(
    purchases: List<StudioPurchase>,
    symbol: String,
    canEdit: Boolean,
    t: (String) -> String,
    onReceive: (StudioPurchase) -> Unit,
    onReceiveLines: (StudioPurchase) -> Unit,
    onDelete: (StudioPurchase) -> Unit,
    onMatch: (StudioPurchase) -> Unit
) {
    Column {
        Text(
            t("What you bought, from whom, and what it cost — the record a bank payment gets matched to."),
            fontSize = 11.sp, color = Color.Gray
        )
        Spacer(Modifier.height(10.dp))

        if (purchases.isEmpty()) {
            InventoryEmptyBox(
                title = t("No purchases yet"),
                body = t("Record what you buy here and the stock is created for you — held as incoming until you mark it received.")
            )
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(bottom = 24.dp)
            ) {
                items(purchases, key = { it.id }) { purchase ->
                    Card(colors = inventoryCardColors(), shape = RoundedCornerShape(12.dp)) {
                        Column(Modifier.fillMaxWidth().padding(12.dp)) {
                            Row {
                                Column(Modifier.weight(1f)) {
                                    Text(purchase.number, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                                    val meta = listOf(purchase.supplierName, purchase.purchaseDate)
                                        .filter { it.isNotBlank() }.joinToString(" · ")
                                    if (meta.isNotBlank()) Text(meta, fontSize = 11.sp, color = Color.Gray)
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    Text(inventoryMoney(symbol, purchase.total), fontSize = 14.sp, fontWeight = FontWeight.Bold)
                                    Text("${purchase.lineCount} " + t("items"), fontSize = 11.sp, color = Color.Gray)
                                }
                            }
                            Spacer(Modifier.height(8.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                // A partial delivery is still awaited, so its
                                // pill stays in the incoming tone, not green.
                                InventoryPill(
                                    text = when {
                                        purchase.isReceived -> t("Received")
                                        purchase.isPartiallyReceived -> t("Partially received")
                                        else -> t("Ordered")
                                    },
                                    colour = if (purchase.isReceived) StudioGreen else StudioBlue
                                )
                                Spacer(Modifier.width(8.dp))
                                if (purchase.bankTransactionId.isBlank()) {
                                    if (canEdit) {
                                        Text(
                                            t("Match payment"),
                                            fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = StudioBlue,
                                            modifier = Modifier.clickable { onMatch(purchase) }
                                        )
                                    }
                                } else {
                                    Text(t("Payment matched"), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = StudioGreen)
                                }
                                Spacer(Modifier.weight(1f))
                            }
                            if (canEdit && !purchase.isReceived) {
                                // On their own row: three receive actions in
                                // eleven languages never fit beside the pill.
                                Spacer(Modifier.height(8.dp))
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        t(if (purchase.isPartiallyReceived) "Receive the rest" else "Mark received"),
                                        fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = StudioBlue,
                                        modifier = Modifier.clickable { onReceive(purchase) }
                                    )
                                    if (purchase.lineCount > 1 || purchase.isPartiallyReceived) {
                                        Spacer(Modifier.width(12.dp))
                                        Text(
                                            t("Receive lines…"),
                                            fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = StudioBlue,
                                            modifier = Modifier.clickable { onReceiveLines(purchase) }
                                        )
                                    }
                                    Spacer(Modifier.weight(1f))
                                    // Once anything has landed the purchase is
                                    // history, not a draft — the server refuses
                                    // the delete, so the door is not shown.
                                    if (purchase.status == "ordered") {
                                        Text(
                                            t("Delete"),
                                            fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = StudioRed,
                                            modifier = Modifier.clickable { onDelete(purchase) }
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

@Composable
private fun SuppliersTab(
    suppliers: List<StudioSupplier>,
    symbol: String,
    canEdit: Boolean,
    t: (String) -> String,
    onEdit: (StudioSupplier) -> Unit
) {
    Column {
        Text(t("Who you buy from, and what you have spent with each of them."), fontSize = 11.sp, color = Color.Gray)
        Spacer(Modifier.height(10.dp))

        if (suppliers.isEmpty()) {
            InventoryEmptyBox(
                title = t("No suppliers yet"),
                body = t("Suppliers appear here as soon as you record a purchase from them.")
            )
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(bottom = 24.dp)
            ) {
                items(suppliers, key = { it.listKey }) { supplier ->
                    Card(colors = inventoryCardColors(), shape = RoundedCornerShape(12.dp)) {
                        Column(Modifier.fillMaxWidth().padding(13.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(supplier.name, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                                Spacer(Modifier.weight(1f))
                                if (canEdit) {
                                    Text(
                                        if (supplier.isImplied) t("Add details") else t("Edit"),
                                        fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = StudioBlue,
                                        modifier = Modifier.clickable { onEdit(supplier) }
                                    )
                                }
                            }
                            val contact = listOf(supplier.email, supplier.phone)
                                .filter { it.isNotBlank() }.joinToString(" · ")
                            if (contact.isNotBlank()) Text(contact, fontSize = 11.sp, color = Color.Gray)
                            // The paperwork line, same shape as the web card:
                            // code · VAT number: X · currency.
                            val paperwork = listOf(
                                supplier.code,
                                if (supplier.vatNumber.isBlank()) "" else t("VAT number") + ": " + supplier.vatNumber,
                                supplier.currency
                            ).filter { it.isNotBlank() }.joinToString(" · ")
                            if (paperwork.isNotBlank()) Text(paperwork, fontSize = 11.sp, color = Color.Gray)
                            Spacer(Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                SupplierStat(t("Spent"), inventoryMoney(symbol, supplier.spent))
                                SupplierStat(t("Purchases"), supplier.purchaseCount.toString())
                                SupplierStat(t("Items"), supplier.lineCount.toString())
                            }
                            if (supplier.purchaseCount > supplier.matchedCount) {
                                Spacer(Modifier.height(6.dp))
                                Text(
                                    "${supplier.purchaseCount - supplier.matchedCount} " + t("purchases with no payment matched"),
                                    fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = StudioWarningOrange
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SupplierStat(label: String, value: String) {
    Column {
        Text(label, fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Color.Gray)
        Text(value, fontSize = 13.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
internal fun InventoryPill(text: String, colour: Color) {
    Box(
        Modifier
            .background(colour.copy(alpha = 0.14f), RoundedCornerShape(999.dp))
            .padding(horizontal = 7.dp, vertical = 2.dp)
    ) {
        Text(text, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = colour)
    }
}

@Composable
private fun InventoryEmptyBox(title: String, body: String) {
    Card(colors = inventoryCardColors(), shape = RoundedCornerShape(13.dp), modifier = Modifier.fillMaxWidth()) {
        Column(
            Modifier.fillMaxWidth().padding(vertical = 32.dp, horizontal = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(title, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            if (body.isNotBlank()) {
                Spacer(Modifier.height(5.dp))
                Text(body, fontSize = 12.sp, color = Color.Gray)
            }
        }
    }
}

internal val inventoryCategoryList = studioInventoryCategories
