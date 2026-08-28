package uk.co.eggcraft.studioflow.features.customers

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
import uk.co.eggcraft.studioflow.data.model.StudioCustomer
import uk.co.eggcraft.studioflow.data.model.StudioCustomerPrefsPatch
import uk.co.eggcraft.studioflow.data.model.StudioOrder
import uk.co.eggcraft.studioflow.features.shell.SectionHeader
import uk.co.eggcraft.studioflow.features.shell.StudioFlowUiState
import uk.co.eggcraft.studioflow.language.LocalStudioLanguage
import uk.co.eggcraft.studioflow.language.studioT
import uk.co.eggcraft.studioflow.ui.theme.StudioBlue

private val dateFormatter = SimpleDateFormat("d MMM yyyy", Locale.getDefault())
private val dateTimeFormatter = SimpleDateFormat("d MMM yyyy, HH:mm", Locale.getDefault())

private fun moneyText(symbol: String, value: Double): String =
    symbol + String.format(Locale.UK, "%,.2f", value)

private fun customerKey(name: String): String = name.trim().lowercase(Locale.UK)

// Store-source badge labels — mirrors the web CUSTOMER_SOURCE_LABEL map.
private fun customerSourceLabel(source: String): String = when (source) {
    "shopify" -> "Shopify"
    "woocommerce" -> "WooCommerce"
    "inbound" -> "API"
    else -> ""
}

// Same suggestion list the web offers in its segment datalist.
private val SEGMENT_SUGGESTIONS = listOf(
    "VIP", "High value", "Repeat customer", "New customer", "Inactive",
    "Outstanding balance", "Waiting for response", "Marketing subscribed", "Wholesale"
)

// Web palette for the segment/preference accents.
private val SegmentBlue = Color(0xFF2F6DF6)
private val DangerRed = Color(0xFFDC2626)
private val AmberText = Color(0xFFB45309)
private val AmberBorder = Color(0xFFF59E0B)

@Composable
fun CustomersScreen(
    state: StudioFlowUiState,
    focusedCustomerName: String = "",
    onCreateCustomer: (String, String, String, String, String, String, String, String, String) -> Unit = { _, _, _, _, _, _, _, _, _ -> },
    onUpdateCustomer: (StudioCustomer) -> Unit = {},
    onUpdateCustomerPrefs: (StudioCustomer, StudioCustomerPrefsPatch) -> Unit = { _, _ -> },
    onResyncCustomer: (StudioCustomer) -> Unit = {},
    onUploadCustomerPhoto: (StudioCustomer, ByteArray, String) -> Unit = { _, _, _ -> },
    onDeleteCustomer: (String) -> Unit = {},
    onOpenOrder: (StudioOrder) -> Unit = {}
) {
    var selectedCustomerId by rememberSaveable { mutableStateOf<String?>(null) }
    var searchText by rememberSaveable { mutableStateOf("") }
    var sortByOrders by rememberSaveable { mutableStateOf(false) }
    // Single-select segment filter (web parity) — lives here so it survives
    // the wide/narrow layout switch.
    var segmentFilter by rememberSaveable { mutableStateOf<String?>(null) }

    LaunchedEffect(focusedCustomerName) {
        if (focusedCustomerName.isNotBlank()) searchText = focusedCustomerName
    }

    val lang = LocalStudioLanguage.current
    val t: (String) -> String = { studioT(it, lang) }
    val context = LocalContext.current
    val density = LocalDensity.current
    val panePrefs = remember { context.getSharedPreferences("studio_customer_pane", Context.MODE_PRIVATE) }
    // Resizable list-pane width, persisted locally — mirrors the Mac sidebar's drag-to-resize.
    var listPaneWidth by rememberSaveable { mutableStateOf(panePrefs.getFloat("width", 340f)) }

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val isWide = maxWidth >= 900.dp
        val selected = state.customers.firstOrNull { it.id == selectedCustomerId }

        if (isWide) {
            // Master-detail (like the Mac/iPhone wide layout): customer list on the left, the
            // selected customer's detail on the right. Auto-select the first so it's not empty.
            val paneCustomer = selected ?: state.customers.firstOrNull()
            Row(modifier = Modifier.fillMaxSize()) {
                Box(modifier = Modifier.width(listPaneWidth.dp).fillMaxHeight()) {
                    CustomerListView(
                        state = state,
                        searchText = searchText,
                        onSearchChange = { searchText = it },
                        sortByOrders = sortByOrders,
                        onToggleSort = { sortByOrders = it },
                        segmentFilter = segmentFilter,
                        onSetSegmentFilter = { segmentFilter = it },
                        onCreateCustomer = onCreateCustomer,
                        onOpen = { selectedCustomerId = it.id }
                    )
                }
                Box(
                    modifier = Modifier
                        .width(10.dp)
                        .fillMaxHeight()
                        .draggable(
                            orientation = Orientation.Horizontal,
                            state = rememberDraggableState { delta ->
                                val deltaDp = with(density) { delta.toDp().value }
                                listPaneWidth = (listPaneWidth + deltaDp).coerceIn(260f, 520f)
                            },
                            onDragStopped = { panePrefs.edit().putFloat("width", listPaneWidth).apply() }
                        )
                        .pointerInput(Unit) {
                            detectTapGestures(onDoubleTap = {
                                listPaneWidth = 340f
                                panePrefs.edit().putFloat("width", 340f).apply()
                            })
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Box(
                        modifier = Modifier
                            .width(1.dp)
                            .fillMaxHeight()
                            .background(MaterialTheme.colorScheme.outlineVariant)
                    )
                }
                Box(modifier = Modifier.weight(1f).fillMaxHeight()) {
                    if (paneCustomer != null) {
                        CustomerDetail(
                            customer = paneCustomer,
                            orders = state.orders,
                            currencySymbol = state.workspaceSettings.selectedCurrency,
                            onBack = { selectedCustomerId = null },
                            showBack = false,
                            onUpdateCustomer = onUpdateCustomer,
                            onUpdateCustomerPrefs = onUpdateCustomerPrefs,
                            onResyncCustomer = onResyncCustomer,
                            onUploadCustomerPhoto = onUploadCustomerPhoto,
                            onDelete = {
                                onDeleteCustomer(paneCustomer.id)
                                selectedCustomerId = null
                            },
                            onOpenOrder = onOpenOrder
                        )
                    } else {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text(
                                t("Select a customer to view details."),
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        } else if (selected != null) {
            CustomerDetail(
                customer = selected,
                orders = state.orders,
                currencySymbol = state.workspaceSettings.selectedCurrency,
                onBack = { selectedCustomerId = null },
                onUpdateCustomer = onUpdateCustomer,
                onUpdateCustomerPrefs = onUpdateCustomerPrefs,
                onResyncCustomer = onResyncCustomer,
                onUploadCustomerPhoto = onUploadCustomerPhoto,
                onDelete = {
                    onDeleteCustomer(selected.id)
                    selectedCustomerId = null
                },
                onOpenOrder = onOpenOrder
            )
        } else {
            CustomerListView(
                state = state,
                searchText = searchText,
                onSearchChange = { searchText = it },
                sortByOrders = sortByOrders,
                onToggleSort = { sortByOrders = it },
                segmentFilter = segmentFilter,
                onSetSegmentFilter = { segmentFilter = it },
                onCreateCustomer = onCreateCustomer,
                onOpen = { selectedCustomerId = it.id }
            )
        }
    }
}

@Composable
private fun CustomerListView(
    state: StudioFlowUiState,
    searchText: String,
    onSearchChange: (String) -> Unit,
    sortByOrders: Boolean,
    onToggleSort: (Boolean) -> Unit,
    segmentFilter: String? = null,
    onSetSegmentFilter: (String?) -> Unit = {},
    onCreateCustomer: (String, String, String, String, String, String, String, String, String) -> Unit,
    onOpen: (StudioCustomer) -> Unit
) {
    val lang = LocalStudioLanguage.current
    val t: (String) -> String = { studioT(it, lang) }
    var showCreate by remember { mutableStateOf(false) }

    val orderCountByName = remember(state.orders) {
        state.orders.groupingBy { customerKey(it.customerName) }.eachCount()
    }
    val ordersByName = remember(state.orders) {
        state.orders.groupBy { customerKey(it.customerName) }
    }
    // Segments: the union of workspace tags, with counts, for the filter row.
    val allSegments = remember(state.customers) {
        val counts = LinkedHashMap<String, Int>()
        state.customers.forEach { c -> c.tags.forEach { tag -> counts[tag] = (counts[tag] ?: 0) + 1 } }
        counts.entries.sortedByDescending { it.value }.map { it.key to it.value }
    }
    val visible = remember(state.customers, searchText, sortByOrders, segmentFilter, orderCountByName, ordersByName) {
        val query = searchText.trim().lowercase(Locale.UK)
        val bySegment = if (segmentFilter == null) state.customers
        else state.customers.filter { it.tags.contains(segmentFilter) }
        val filtered = if (query.isBlank()) bySegment else bySegment.filter { c ->
            listOf(
                c.name, c.email, c.phone, c.whatsappNumber, c.company, c.instagram,
                c.address, c.streetAddress, c.city, c.postalCode, c.country
            ).any { it.lowercase(Locale.UK).contains(query) } ||
                // Web parity: find a customer by what they ordered (invoice or design).
                ordersByName[customerKey(c.name)].orEmpty().any { order ->
                    order.invoiceNumber.lowercase(Locale.UK).contains(query) ||
                        order.designName.lowercase(Locale.UK).contains(query)
                }
        }
        if (sortByOrders) {
            filtered.sortedByDescending { orderCountByName[customerKey(it.name)] ?: 0 }
        } else {
            filtered.sortedByDescending { it.lastContactDate?.time ?: 0L }
        }
    }
    // Which field actually matched the search — shown on the card so a hit on
    // an invoice number or address doesn't look like a random result (web parity).
    val matchHints = remember(visible, searchText, ordersByName, lang) {
        val term = searchText.trim().lowercase(Locale.UK)
        val map = mutableMapOf<String, String>()
        if (term.isNotEmpty()) {
            for (c in visible) {
                if (c.name.lowercase(Locale.UK).contains(term)) continue
                val customerOrders = ordersByName[customerKey(c.name)].orEmpty()
                val hint = when {
                    c.email.lowercase(Locale.UK).contains(term) -> "${t("Email")}: ${c.email}"
                    c.phone.lowercase(Locale.UK).contains(term) -> "${t("Phone")}: ${c.phone}"
                    c.whatsappNumber.lowercase(Locale.UK).contains(term) -> "WhatsApp: ${c.whatsappNumber}"
                    c.company.lowercase(Locale.UK).contains(term) -> "${t("Company")}: ${c.company}"
                    c.instagram.lowercase(Locale.UK).contains(term) -> "Instagram: ${c.instagram}"
                    else -> {
                        val invoiceOrder = customerOrders.firstOrNull { it.invoiceNumber.lowercase(Locale.UK).contains(term) }
                        val designOrder = if (invoiceOrder == null) {
                            customerOrders.firstOrNull { it.designName.lowercase(Locale.UK).contains(term) }
                        } else null
                        when {
                            invoiceOrder != null -> "${t("Order")} ${invoiceOrder.invoiceNumber}"
                            designOrder != null -> designOrder.designName
                            listOf(c.address, c.streetAddress, c.city, c.postalCode, c.country)
                                .any { it.lowercase(Locale.UK).contains(term) } ->
                                "${t("Address")}: ${listOf(c.streetAddress.ifBlank { c.address }, c.city).filter { it.isNotBlank() }.joinToString(", ")}"
                            else -> ""
                        }
                    }
                }
                if (hint.isNotEmpty()) map[c.id] = hint
            }
        }
        map
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        SectionHeader(
            title = t("Customers"),
            subtitle = "${visible.size} ${t("customers")}",
            trailingIcon = Icons.Filled.People
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            OutlinedTextField(
                value = searchText,
                onValueChange = onSearchChange,
                modifier = Modifier.weight(1f),
                singleLine = true,
                shape = RoundedCornerShape(14.dp),
                placeholder = { Text(t("Search...")) }
            )
            var sortMenuOpen by remember { mutableStateOf(false) }
            Box {
                IconButton(onClick = { sortMenuOpen = true }) {
                    Icon(Icons.AutoMirrored.Filled.Sort, contentDescription = t("Sort"))
                }
                DropdownMenu(expanded = sortMenuOpen, onDismissRequest = { sortMenuOpen = false }) {
                    DropdownMenuItem(
                        text = { Text(t("Recent")) },
                        onClick = { onToggleSort(false); sortMenuOpen = false }
                    )
                    DropdownMenuItem(
                        text = { Text(t("Most Orders")) },
                        onClick = { onToggleSort(true); sortMenuOpen = false }
                    )
                }
            }
            IconButton(onClick = { showCreate = true }) {
                Icon(Icons.Filled.Add, contentDescription = t("Add Customer"), tint = StudioBlue)
            }
        }
        if (allSegments.isNotEmpty()) {
            // Segment filter chips (single-select toggle) — union of workspace
            // tags with counts, mirroring the web row above the list.
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                allSegments.forEach { (tag, count) ->
                    val selected = segmentFilter == tag
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = if (selected) SegmentBlue.copy(alpha = 0.1f) else Color.Transparent,
                        border = BorderStroke(1.dp, if (selected) SegmentBlue else MaterialTheme.colorScheme.outlineVariant),
                        modifier = Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .clickable { onSetSegmentFilter(if (selected) null else tag) }
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 11.dp, vertical = 4.dp),
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                "⬖ $tag",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (selected) SegmentBlue else MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                count.toString(),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = (if (selected) SegmentBlue else MaterialTheme.colorScheme.onSurface).copy(alpha = 0.55f)
                            )
                        }
                    }
                }
                if (segmentFilter != null) {
                    Text(
                        "✕ ${t("Clear")}",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .clickable { onSetSegmentFilter(null) }
                            .padding(horizontal = 6.dp, vertical = 4.dp)
                    )
                }
            }
        }
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .padding(top = 14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(visible, key = { it.id }) { customer ->
                CustomerRow(
                    customer = customer,
                    designs = designTitlesFor(customer, state.orders, t),
                    matchHint = matchHints[customer.id].orEmpty(),
                    onClick = { onOpen(customer) }
                )
            }
            item { Spacer(modifier = Modifier.height(16.dp)) }
        }
    }

    if (showCreate) {
        CreateCustomerDialog(
            onDismiss = { showCreate = false },
            onCreate = { name, email, phone, instagram, street, city, postalCode, country, notes ->
                onCreateCustomer(name, email, phone, instagram, street, city, postalCode, country, notes)
                showCreate = false
            }
        )
    }
}

@Composable
private fun CreateCustomerDialog(
    onDismiss: () -> Unit,
    onCreate: (String, String, String, String, String, String, String, String, String) -> Unit
) {
    val lang = LocalStudioLanguage.current
    val t: (String) -> String = { studioT(it, lang) }

    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var instagram by remember { mutableStateOf("") }
    var street by remember { mutableStateOf("") }
    var city by remember { mutableStateOf("") }
    var postalCode by remember { mutableStateOf("") }
    var country by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }

    val canSave = name.isNotBlank()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(t("New Customer"), fontWeight = FontWeight.ExtraBold) },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 460.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                CustomerField(t("Customer Name"), name) { name = it }
                if (name.isBlank()) {
                    Text(
                        t("Name is required"),
                        color = MaterialTheme.colorScheme.error,
                        fontSize = 12.sp
                    )
                }
                CustomerField(t("Email"), email) { email = it }
                CustomerField(t("WhatsApp"), phone) { phone = it }
                CustomerField(t("Instagram"), instagram) { instagram = it }
                CustomerField(t("Street"), street) { street = it }
                CustomerField(t("City"), city) { city = it }
                CustomerField(t("Postal Code"), postalCode) { postalCode = it }
                CustomerField(t("Country"), country) { country = it }
                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 80.dp),
                    label = { Text(t("Notes")) },
                    placeholder = { Text(t("Add a note...")) }
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = canSave,
                onClick = {
                    onCreate(
                        name.trim(), email.trim(), phone.trim(), instagram.trim(),
                        street.trim(), city.trim(), postalCode.trim(), country.trim(), notes.trim()
                    )
                }
            ) { Text(t("Add"), fontWeight = FontWeight.ExtraBold) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(t("Cancel")) }
        }
    )
}

private fun designTitlesFor(customer: StudioCustomer, orders: List<StudioOrder>, t: (String) -> String): String {
    val key = customerKey(customer.name)
    if (key.isBlank()) return "-"
    val matched = orders.filter { customerKey(it.customerName) == key }
        .sortedByDescending { it.paymentDate }
    val titles = matched.take(3).map { it.designName.ifBlank { t("Untitled design") } }
    val extra = if (matched.size > titles.size) " +${matched.size - titles.size}" else ""
    return if (titles.isEmpty()) "-" else titles.joinToString(" · ") + extra
}

@Composable
private fun CustomerAvatar(customer: StudioCustomer, size: Dp, textSize: TextUnit) {
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(StudioBlue.copy(alpha = 0.16f)),
        contentAlignment = Alignment.Center
    ) {
        if (customer.profileImageUrl.isNotBlank()) {
            AsyncImage(
                model = customer.profileImageUrl,
                contentDescription = customer.name,
                modifier = Modifier.fillMaxSize().clip(CircleShape)
            )
        } else {
            Text(
                text = customer.name.trim().take(1).uppercase(Locale.UK).ifBlank { "?" },
                color = StudioBlue,
                fontSize = textSize,
                fontWeight = FontWeight.ExtraBold
            )
        }
    }
}

@Composable
private fun CustomerRow(customer: StudioCustomer, designs: String, matchHint: String = "", onClick: () -> Unit) {
    val lang = LocalStudioLanguage.current
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .clickable { onClick() },
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            CustomerAvatar(customer, size = 56.dp, textSize = 22.sp)
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = customer.name.ifBlank { "—" },
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold
                )
                Text(
                    text = designs,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Bold
                )
                if (customer.tags.isNotEmpty()) {
                    // Up to 3 segment chips on the card (web parity).
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        customer.tags.take(3).forEach { tag ->
                            Surface(shape = RoundedCornerShape(999.dp), color = SegmentBlue.copy(alpha = 0.1f)) {
                                Text(
                                    "⬖ $tag",
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = SegmentBlue,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 1.dp)
                                )
                            }
                        }
                    }
                }
                Text(
                    text = customer.lastContactDate?.let { dateFormatter.format(it) } ?: "-",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.SemiBold
                )
                if (matchHint.isNotEmpty()) {
                    // Amber "why this result" line — the hit wasn't on the name.
                    Text(
                        text = "⌕ ${studioT("Matched", lang)}: $matchHint",
                        color = Color(0xFFB45309),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CustomerDetail(
    customer: StudioCustomer,
    orders: List<StudioOrder>,
    currencySymbol: String,
    onBack: () -> Unit,
    showBack: Boolean = true,
    onUpdateCustomer: (StudioCustomer) -> Unit,
    onUpdateCustomerPrefs: (StudioCustomer, StudioCustomerPrefsPatch) -> Unit = { _, _ -> },
    onResyncCustomer: (StudioCustomer) -> Unit = {},
    onUploadCustomerPhoto: (StudioCustomer, ByteArray, String) -> Unit,
    onDelete: () -> Unit,
    onOpenOrder: (StudioOrder) -> Unit
) {
    val lang = LocalStudioLanguage.current
    val t: (String) -> String = { studioT(it, lang) }
    val context = LocalContext.current

    var editable by remember(customer.id) { mutableStateOf(customer) }
    var dirty by remember(customer.id) { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var uploadingPhoto by remember(customer.id) { mutableStateOf(false) }
    var showAddSegment by remember(customer.id) { mutableStateOf(false) }
    var showFollowUpPicker by remember(customer.id) { mutableStateOf(false) }

    // When a new photo URL arrives from the cloud (after upload, or a change on another
    // device) reflect it on the avatar without disturbing in-progress text edits.
    LaunchedEffect(customer.profileImageUrl) {
        if (customer.profileImageUrl != editable.profileImageUrl) {
            editable = editable.copy(profileImageUrl = customer.profileImageUrl)
            uploadingPhoto = false
        }
    }

    val pickPhoto = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            val contentType = context.contentResolver.getType(uri) ?: "image/jpeg"
            val bytes = runCatching { context.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()
            if (bytes != null) {
                uploadingPhoto = true
                onUploadCustomerPhoto(editable, bytes, contentType)
            }
        }
    }

    // Debounced autosave (mirrors the Mac/iPhone customer detail autosave).
    LaunchedEffect(editable, dirty) {
        if (!dirty) return@LaunchedEffect
        delay(700)
        onUpdateCustomer(editable)
    }

    val customerOrders = remember(orders, customer.name) {
        val key = customerKey(customer.name)
        orders.filter { customerKey(it.customerName) == key }
            .sortedByDescending { it.paymentDate }
    }
    val totalSpent = customerOrders.sumOf { it.paidAmount + it.remainingAmount }
    // The slice of that total sitting in cancelled/refunded orders — shown as a
    // sub-line so the headline figure does not read as real trade (web parity).
    val totalRefunded = customerOrders
        .filter { !it.countsTowardBalance }
        .sumOf { it.paidAmount + it.remainingAmount }
    val lastOrderDate = customerOrders.firstOrNull()?.paymentDate
    val customerSinceDate = customerOrders.lastOrNull()?.paymentDate
    val customerFiles = remember(customerOrders) {
        customerOrders.flatMap { it.clientFiles }.sortedByDescending { it.uploadedAt?.time ?: 0L }
    }
    val customerActivity = remember(customerOrders) {
        customerOrders.flatMap { order -> order.historyLog.map { order to it } }
            .sortedByDescending { it.second.createdAt?.time ?: 0L }
    }
    val customerOrderNotes = remember(customerOrders) {
        customerOrders.mapNotNull { order -> order.notes.trim().takeIf { it.isNotEmpty() }?.let { order to it } }
    }
    var selectedTab by remember(customer.id) { mutableStateOf("Orders") }
    var isEditingNotes by remember(customer.id) { mutableStateOf(false) }
    val uriHandler = LocalUriHandler.current
    val monthYearFormatter = remember { SimpleDateFormat("MMM yyyy", Locale.getDefault()) }

    // "Resync from store data" in-flight flag: cleared when the cloud write lands
    // (integrationSyncedAt changes on the snapshot) or after a short fallback.
    var resyncing by remember(customer.id) { mutableStateOf(false) }
    LaunchedEffect(customer.integrationSyncedAt) {
        resyncing = false
        // A sync just replayed/refreshed the store payload — reflect the cloud
        // values in the form (the store's values win, matching the web).
        if (customer.integrationSyncedAt != null && customer != editable) {
            editable = customer
            dirty = false
        }
    }
    LaunchedEffect(resyncing) {
        if (resyncing) {
            delay(6000)
            resyncing = false
        }
    }

    @Composable
    fun quickActionsRow() {
        // One-tap ways to reach the customer, built from what the profile already
        // knows — same cleaning rules as the web: phone kept to [0-9+], wa.me digits
        // without the leading + / 00, Instagram handle without the leading @.
        val phone = editable.phone.trim()
        val phoneDigits = phone.filter { it.isDigit() || it == '+' }
        // WhatsApp goes to the customer's OWN WhatsApp number when one is
        // recorded; the store-fed phone is only the fallback (web parity).
        val waSource = editable.whatsappNumber.trim()
            .ifBlank { phone }
            .ifBlank { editable.primaryPhone.trim() }
        val waDigits = waSource.filter { it.isDigit() || it == '+' }
            .removePrefix("+").removePrefix("00")
        val instagram = editable.instagram.trim().removePrefix("@")
        val email = editable.email.trim()
        // "Do not contact" wins over every outreach shortcut — the chips stay
        // visible but inert and dimmed, so the flag is impossible to miss.
        val blocked = customer.doNotContact
        val followUp = customer.nextFollowUpDate
        if (phone.isBlank() && waSource.isBlank() && email.isBlank() && instagram.isBlank() && !blocked && followUp == null) return
        fun open(intent: Intent) {
            runCatching { context.startActivity(intent) }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (phone.isNotBlank()) {
                QuickActionChip("📞 ${t("Call")}", enabled = !blocked, highlighted = customer.preferredChannel == "phone") { open(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phoneDigits"))) }
            }
            if (waDigits.isNotBlank()) {
                QuickActionChip("💬 WhatsApp", enabled = !blocked, highlighted = customer.preferredChannel == "whatsapp") { open(Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$waDigits"))) }
            }
            if (email.isNotBlank()) {
                QuickActionChip("✉️ ${t("Email")}", enabled = !blocked, highlighted = customer.preferredChannel == "email") { open(Intent(Intent.ACTION_VIEW, Uri.parse("mailto:$email"))) }
            }
            if (instagram.isNotBlank()) {
                QuickActionChip("◎ Instagram", enabled = !blocked, highlighted = customer.preferredChannel == "instagram") { open(Intent(Intent.ACTION_VIEW, Uri.parse("https://instagram.com/${Uri.encode(instagram)}"))) }
            }
            if (blocked) {
                StatusPill(
                    "⛔ ${t("Do not contact")}",
                    textColor = DangerRed,
                    borderColor = DangerRed.copy(alpha = 0.4f),
                    background = DangerRed.copy(alpha = 0.06f)
                )
            }
            if (followUp != null) {
                // Amber follow-up reminder pill — red when the date has passed.
                val overdue = followUp.time < System.currentTimeMillis()
                StatusPill(
                    "⏰ ${t("Follow-up")}: ${dateFormatter.format(followUp)}",
                    textColor = if (overdue) DangerRed else AmberText,
                    borderColor = AmberBorder.copy(alpha = 0.4f),
                    background = AmberBorder.copy(alpha = 0.06f)
                )
            }
        }
    }

    @Composable
    fun segmentsRow() {
        // Segments (workspace tags like "VIP") — removable chips + an add
        // control with the same suggestion list the web offers.
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            customer.tags.forEach { tag ->
                Surface(shape = RoundedCornerShape(999.dp), color = SegmentBlue.copy(alpha = 0.1f)) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(5.dp)
                    ) {
                        Text("⬖ $tag", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = SegmentBlue)
                        Text(
                            "✕",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = SegmentBlue.copy(alpha = 0.6f),
                            modifier = Modifier
                                .clip(CircleShape)
                                .clickable {
                                    onUpdateCustomerPrefs(
                                        editable,
                                        StudioCustomerPrefsPatch(tags = customer.tags.filter { it != tag })
                                    )
                                }
                                .padding(horizontal = 3.dp, vertical = 1.dp)
                        )
                    }
                }
            }
            Surface(
                shape = RoundedCornerShape(999.dp),
                color = Color.Transparent,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                modifier = Modifier.clip(RoundedCornerShape(999.dp)).clickable { showAddSegment = true }
            ) {
                Text(
                    "＋ ${t("Add segment")}",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                )
            }
        }
    }

    @Composable
    fun integrationCard() {
        // Store-integration panel (store-sourced customers only) — web parity:
        // connected store, store customer id, last synced, resync + raw payload.
        val sourceLabel = customerSourceLabel(customer.source)
        if (sourceLabel.isEmpty()) return
        var showRawPayload by remember(customer.id) { mutableStateOf(false) }
        val prettyPayload = remember(customer.integrationLastPayload) {
            val raw = customer.integrationLastPayload
            runCatching {
                if (raw.trimStart().startsWith("[")) org.json.JSONArray(raw).toString(2)
                else org.json.JSONObject(raw).toString(2)
            }.getOrDefault(raw)
        }
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 1.dp
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                @Composable
                fun infoLine(label: String, value: String) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("$label:", fontSize = 12.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(value, fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
                    }
                }
                infoLine(t("Connected store"), sourceLabel)
                if (customer.externalCustomerId.isNotBlank()) {
                    infoLine(t("Store customer ID"), customer.externalCustomerId)
                }
                infoLine(t("Last synced"), customer.integrationSyncedAt?.let { dateTimeFormatter.format(it) } ?: "—")
                if (customer.integrationLastPayload.isNotBlank()) {
                    TextButton(
                        enabled = !resyncing,
                        onClick = {
                            resyncing = true
                            onResyncCustomer(customer)
                        }
                    ) {
                        Text(
                            "⟳ ${if (resyncing) t("Resyncing from store data…") else t("Resync from store data")}",
                            color = StudioBlue,
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp
                        )
                    }
                    Text(
                        t("Re-applies what the store last sent — the store's values win."),
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        "${if (showRawPayload) "▾" else "▸"} ${t("View raw store data")}",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.clickable { showRawPayload = !showRawPayload }
                    )
                    if (showRawPayload) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f), RoundedCornerShape(10.dp))
                                .horizontalScroll(rememberScrollState())
                                .padding(10.dp)
                        ) {
                            Text(
                                prettyPayload,
                                fontSize = 11.sp,
                                fontFamily = FontFamily.Monospace,
                                lineHeight = 16.sp
                            )
                        }
                    }
                }
            }
        }
    }

    @Composable
    fun contactCard() {
        DetailCard(title = t("Contact Info")) {
            // Same editable.name the header text field binds — one source of
            // truth, both views reflect each other through the shared state
            // and the debounced autosave (web parity).
            CustomerField(t("Customer Name"), editable.name) { editable = editable.copy(name = it); dirty = true }
            CustomerField(t("Email"), editable.email) { editable = editable.copy(email = it); dirty = true }
            // The customer's own WhatsApp number, kept apart from the store-fed
            // phone — "Phone / WhatsApp" stops being one ambiguous box (web parity).
            CustomerField(t("WhatsApp Number"), editable.whatsappNumber) { editable = editable.copy(whatsappNumber = it); dirty = true }
            // The order's general phone lands here — it is NOT a verified
            // WhatsApp number, so the label stays honest about that.
            CustomerField(t("Phone (from orders)"), editable.phone) { editable = editable.copy(phone = it); dirty = true }
            CustomerField(t("Company"), editable.company) { editable = editable.copy(company = it); dirty = true }
            CustomerField(t("Instagram"), editable.instagram) { editable = editable.copy(instagram = it); dirty = true }
            CustomerField(t("Street"), editable.streetAddress) { editable = editable.copy(streetAddress = it); dirty = true }
            CustomerField(t("City"), editable.city) { editable = editable.copy(city = it); dirty = true }
            CustomerField(t("Postal Code"), editable.postalCode) { editable = editable.copy(postalCode = it); dirty = true }
            CustomerField(t("Country"), editable.country) { editable = editable.copy(country = it); dirty = true }
            Text(
                t("Shipping Address"),
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp)
            )
            CustomerField(t("Street"), editable.shippingStreetAddress) { editable = editable.copy(shippingStreetAddress = it); dirty = true }
            CustomerField(t("City"), editable.shippingCity) { editable = editable.copy(shippingCity = it); dirty = true }
            CustomerField(t("Postal Code"), editable.shippingPostalCode) { editable = editable.copy(shippingPostalCode = it); dirty = true }
            CustomerField(t("Country"), editable.shippingCountry) { editable = editable.copy(shippingCountry = it); dirty = true }
            CustomerField(t("Shipping Phone"), editable.shippingPhone) { editable = editable.copy(shippingPhone = it); dirty = true }

            // Contact preferences (web parity) — each control saves its own
            // field through the callable's key-present patch semantics, so a
            // preference edit can never clobber anything else.
            HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
            PreferenceMenuField(
                label = t("Preferred channel"),
                value = customer.preferredChannel,
                options = listOf(
                    "" to "—",
                    "phone" to t("Call"),
                    "whatsapp" to "WhatsApp",
                    "email" to t("Email"),
                    "instagram" to "Instagram"
                ),
                onSelect = { onUpdateCustomerPrefs(editable, StudioCustomerPrefsPatch(preferredChannel = it)) }
            )
            PreferenceMenuField(
                label = t("Marketing"),
                value = customer.marketingOptIn,
                options = listOf(
                    "" to "—",
                    "subscribed" to t("Subscribed"),
                    "unsubscribed" to t("Unsubscribed")
                ),
                onSelect = { onUpdateCustomerPrefs(editable, StudioCustomerPrefsPatch(marketingOptIn = it)) }
            )
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    t("Next follow-up"),
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.width(104.dp)
                )
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(8.dp))
                        .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f))
                        .clickable { showFollowUpPicker = true }
                        .padding(horizontal = 12.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        customer.nextFollowUpDate?.let { dateFormatter.format(it) } ?: "—",
                        fontSize = 14.sp,
                        modifier = Modifier.weight(1f)
                    )
                    if (customer.nextFollowUpDate != null) {
                        Text(
                            "✕ ${t("Clear")}",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .clip(RoundedCornerShape(999.dp))
                                .clickable {
                                    onUpdateCustomerPrefs(editable, StudioCustomerPrefsPatch(clearNextFollowUp = true))
                                }
                                .padding(horizontal = 4.dp)
                        )
                    }
                }
            }
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = customer.doNotContact,
                    onCheckedChange = { onUpdateCustomerPrefs(editable, StudioCustomerPrefsPatch(doNotContact = it)) }
                )
                Text(
                    t("Do not contact"),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (customer.doNotContact) DangerRed else MaterialTheme.colorScheme.onSurface
                )
            }
        }
    }

    @Composable
    fun statCardsSection() {
        val specs = listOf(
            StatSpec(
                Icons.Filled.ShoppingBag, Color(0xFF34C759), t("Total Spent"),
                moneyText(currencySymbol, totalSpent), Color(0xFF34C759),
                sub = if (totalRefunded > 0.004) {
                    "${t("incl.")} ${moneyText(currencySymbol, totalRefunded)} ${t("cancelled or refunded")}"
                } else null
            ),
            StatSpec(Icons.Filled.Inventory2, StudioBlue, t("Total Orders"), customerOrders.size.toString(), MaterialTheme.colorScheme.onSurface),
            StatSpec(Icons.Filled.CalendarMonth, Color(0xFFAF52DE), t("Last Order"), lastOrderDate?.let { dateFormatter.format(it) } ?: "—", MaterialTheme.colorScheme.onSurface),
            StatSpec(Icons.Filled.Schedule, Color(0xFFFF9500), t("Customer Since"), customerSinceDate?.let { monthYearFormatter.format(it) } ?: "—", MaterialTheme.colorScheme.onSurface)
        )
        BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
            if (maxWidth >= 560.dp) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    specs.forEach { StatCard(Modifier.weight(1f), it) }
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    specs.chunked(2).forEach { rowSpecs ->
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            rowSpecs.forEach { StatCard(Modifier.weight(1f), it) }
                            if (rowSpecs.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }

    @Composable
    fun notesCard() {
        DetailCardAction(
            title = t("Customer Notes"),
            actionLabel = if (isEditingNotes) t("Done") else t("Edit"),
            onAction = { isEditingNotes = !isEditingNotes }
        ) {
            if (isEditingNotes) {
                OutlinedTextField(
                    value = editable.notes,
                    onValueChange = { editable = editable.copy(notes = it); dirty = true },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 90.dp),
                    placeholder = { Text(t("Add a note...")) }
                )
            } else {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    color = Color(0xFFFF9500).copy(alpha = 0.12f)
                ) {
                    Row(modifier = Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Icon(Icons.Filled.Description, contentDescription = null, tint = Color(0xFFFF9500), modifier = Modifier.size(16.dp))
                        Text(
                            editable.notes.trim().ifEmpty { t("No notes yet. Tap Edit to add a note.") },
                            fontSize = 13.sp,
                            color = if (editable.notes.isBlank()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }
        }
    }

    @Composable
    fun orderRow(order: StudioOrder) {
        Surface(
            modifier = Modifier.fillMaxWidth().clickable { onOpenOrder(order) },
            shape = RoundedCornerShape(10.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)
        ) {
            Row(
                modifier = Modifier.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        order.designName.ifBlank { order.watchRef.ifBlank { t("Untitled design") } },
                        fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis
                    )
                    if (order.invoiceNumber.isNotBlank()) {
                        Text("${t("Order")} #${order.invoiceNumber}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                    }
                    Text(dateFormatter.format(order.paymentDate), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(moneyText(currencySymbol, order.paidAmount + order.remainingAmount), fontWeight = FontWeight.ExtraBold, color = StudioBlue)
                    OrderStatusBadge(order)
                }
            }
        }
    }

    @Composable
    fun orderHistoryCard() {
        DetailCardAction(
            title = t("Order History"),
            actionLabel = t("View All Orders"),
            onAction = { customerOrders.firstOrNull()?.let { onOpenOrder(it) } },
            showAction = customerOrders.isNotEmpty()
        ) {
            if (customerOrders.isEmpty()) {
                Text("-", color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                customerOrders.forEach { order -> orderRow(order) }
            }
        }
    }

    @Composable
    fun activityTabsCard() {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 1.dp
        ) {
            Column(modifier = Modifier.padding(top = 12.dp, bottom = 16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(22.dp)
                ) {
                    listOf("Orders", "Files", "Notes", "Activity").forEach { tab ->
                        val sel = selectedTab == tab
                        Column(
                            modifier = Modifier.clickable { selectedTab = tab },
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(t(tab), fontWeight = if (sel) FontWeight.Bold else FontWeight.Medium, color = if (sel) StudioBlue else MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
                            Spacer(Modifier.height(6.dp))
                            Box(modifier = Modifier.fillMaxWidth().height(2.dp).background(if (sel) StudioBlue else Color.Transparent))
                        }
                    }
                }
                HorizontalDivider(modifier = Modifier.padding(top = 10.dp))
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    when (selectedTab) {
                        "Files" -> {
                            if (customerFiles.isEmpty()) emptyTabState(Icons.Filled.Description, t("No files yet."))
                            else customerFiles.forEach { file ->
                                Surface(
                                    modifier = Modifier.fillMaxWidth().clickable { if (file.downloadUrl.isNotBlank()) uriHandler.openUri(file.downloadUrl) },
                                    shape = RoundedCornerShape(10.dp),
                                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)
                                ) {
                                    Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                        Surface(shape = RoundedCornerShape(8.dp), color = StudioBlue.copy(alpha = 0.12f), modifier = Modifier.size(36.dp)) {
                                            Box(contentAlignment = Alignment.Center) { Icon(Icons.Filled.Description, contentDescription = null, tint = StudioBlue, modifier = Modifier.size(16.dp)) }
                                        }
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(file.fileName, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                            Text("${fileSizeText(file.fileSize)} • ${file.uploadedAt?.let { dateFormatter.format(it) } ?: "—"}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                    }
                                }
                            }
                        }
                        "Notes" -> {
                            if (customerOrderNotes.isEmpty()) emptyTabState(Icons.Filled.Description, t("No order notes yet."))
                            else customerOrderNotes.forEach { (order, note) ->
                                Surface(
                                    modifier = Modifier.fillMaxWidth().clickable { onOpenOrder(order) },
                                    shape = RoundedCornerShape(10.dp),
                                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)
                                ) {
                                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                            Text(order.invoiceNumber.ifBlank { order.designName.ifBlank { t("Order") } }, fontWeight = FontWeight.Bold, color = StudioBlue, fontSize = 12.sp)
                                            Text(dateFormatter.format(order.paymentDate), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                        Text(note, fontSize = 13.sp)
                                    }
                                }
                            }
                        }
                        "Activity" -> {
                            if (customerActivity.isEmpty()) emptyTabState(Icons.Filled.Schedule, t("No activity yet."))
                            else customerActivity.forEach { (order, log) ->
                                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Box(modifier = Modifier.padding(top = 5.dp).size(8.dp).background(StudioBlue.copy(alpha = 0.5f), CircleShape))
                                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                        Text(t(log.title), fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                        if (log.oldValue.isNotBlank() || log.newValue.isNotBlank()) {
                                            Text("${log.oldValue.ifBlank { "—" }} → ${log.newValue.ifBlank { "—" }}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                                        }
                                        Text("${order.invoiceNumber.ifBlank { order.designName }} • ${log.createdAt?.let { dateFormatter.format(it) } ?: "—"}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                            }
                        }
                        else -> {
                            if (customerOrders.isEmpty()) emptyTabState(Icons.Filled.Inventory2, t("No orders yet."))
                            else customerOrders.forEach { order -> orderRow(order) }
                        }
                    }
                }
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (showBack) {
                TextButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(t("Customers"), fontWeight = FontWeight.Bold)
                }
            }
            Spacer(Modifier.weight(1f))
            IconButton(onClick = { confirmDelete = true }) {
                Icon(Icons.Filled.Delete, contentDescription = t("Delete"), tint = MaterialTheme.colorScheme.error)
            }
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Box(
                    modifier = Modifier.clickable(enabled = !uploadingPhoto) { pickPhoto.launch("image/*") },
                    contentAlignment = Alignment.BottomEnd
                ) {
                    CustomerAvatar(editable, size = 64.dp, textSize = 26.sp)
                    Surface(
                        shape = CircleShape,
                        color = StudioBlue,
                        modifier = Modifier.size(22.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            if (uploadingPhoto) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(12.dp),
                                    strokeWidth = 2.dp,
                                    color = androidx.compose.ui.graphics.Color.White
                                )
                            } else {
                                Icon(
                                    Icons.Filled.PhotoCamera,
                                    contentDescription = t("Change customer photo"),
                                    tint = androidx.compose.ui.graphics.Color.White,
                                    modifier = Modifier.size(13.dp)
                                )
                            }
                        }
                    }
                }
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    OutlinedTextField(
                        value = editable.name,
                        onValueChange = { editable = editable.copy(name = it); dirty = true },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        textStyle = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.ExtraBold),
                        label = { Text(t("Customer Name")) }
                    )
                    Text(
                        "${customerOrders.size} ${t("Orders")} • ${moneyText(currencySymbol, totalSpent)}",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 13.sp
                    )
                }
            }

            quickActionsRow()

            segmentsRow()

            statCardsSection()

            integrationCard()

            BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
                if (maxWidth >= 700.dp) {
                    // Wide pane: Contact Info on the left, Order History + Customer Notes
                    // on the right — matching the Mac layout.
                    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            contactCard()
                        }
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            orderHistoryCard()
                            notesCard()
                        }
                    }
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        contactCard()
                        orderHistoryCard()
                        notesCard()
                    }
                }
            }

            activityTabsCard()

            Spacer(Modifier.height(20.dp))
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text(t("Delete")) },
            text = { Text("${t("Delete")} ${customer.name}?") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    onDelete()
                }) { Text(t("Delete"), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }) { Text(t("Cancel")) }
            }
        )
    }

    if (showAddSegment) {
        AddSegmentDialog(
            existingTags = customer.tags,
            onDismiss = { showAddSegment = false },
            onAdd = { value ->
                showAddSegment = false
                val trimmed = value.trim()
                if (trimmed.isNotEmpty() && !customer.tags.contains(trimmed)) {
                    onUpdateCustomerPrefs(editable, StudioCustomerPrefsPatch(tags = customer.tags + trimmed))
                }
            }
        )
    }

    if (showFollowUpPicker) {
        // The material picker works in UTC-midnight millis; the web stores the
        // pick as a local noon (new Date(y, m-1, d, 12:00)) so timezone shifts
        // can't move the day — convert both ways accordingly.
        val pickerState = rememberDatePickerState(
            initialSelectedDateMillis = customer.nextFollowUpDate?.let { current ->
                val local = Calendar.getInstance().apply { time = current }
                Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply {
                    clear()
                    set(local.get(Calendar.YEAR), local.get(Calendar.MONTH), local.get(Calendar.DAY_OF_MONTH))
                }.timeInMillis
            } ?: System.currentTimeMillis()
        )
        DatePickerDialog(
            onDismissRequest = { showFollowUpPicker = false },
            confirmButton = {
                TextButton(onClick = {
                    val picked = pickerState.selectedDateMillis
                    showFollowUpPicker = false
                    if (picked != null) {
                        val utc = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply { timeInMillis = picked }
                        val localNoon = Calendar.getInstance().apply {
                            clear()
                            set(utc.get(Calendar.YEAR), utc.get(Calendar.MONTH), utc.get(Calendar.DAY_OF_MONTH), 12, 0, 0)
                        }
                        onUpdateCustomerPrefs(
                            editable,
                            StudioCustomerPrefsPatch(nextFollowUpDateMillis = localNoon.timeInMillis)
                        )
                    }
                }) { Text(t("Done"), fontWeight = FontWeight.Bold) }
            },
            dismissButton = {
                TextButton(onClick = { showFollowUpPicker = false }) { Text(t("Cancel")) }
            }
        ) { DatePicker(state = pickerState) }
    }
}

@Composable
private fun DetailCard(title: String, content: @Composable () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(title, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
            content()
        }
    }
}

private data class StatSpec(
    val icon: ImageVector,
    val tint: Color,
    val label: String,
    val value: String,
    val valueColor: Color,
    /** Optional footnote under the value — e.g. the cancelled/refunded slice. */
    val sub: String? = null
)

@Composable
private fun StatCard(modifier: Modifier, spec: StatSpec) {
    Surface(modifier = modifier, shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surface, tonalElevation = 1.dp) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Surface(shape = RoundedCornerShape(8.dp), color = spec.tint.copy(alpha = 0.15f), modifier = Modifier.size(30.dp)) {
                Box(contentAlignment = Alignment.Center) { Icon(spec.icon, contentDescription = null, tint = spec.tint, modifier = Modifier.size(15.dp)) }
            }
            Text(spec.label, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(spec.value, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, color = spec.valueColor, maxLines = 1, overflow = TextOverflow.Ellipsis)
            spec.sub?.let {
                Text(it, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun DetailCardAction(title: String, actionLabel: String, onAction: () -> Unit, showAction: Boolean = true, content: @Composable () -> Unit) {
    Surface(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, tonalElevation = 1.dp) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, modifier = Modifier.weight(1f))
                if (showAction) {
                    TextButton(onClick = onAction) {
                        Text(actionLabel, color = StudioBlue, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    }
                }
            }
            content()
        }
    }
}

@Composable
private fun OrderStatusBadge(order: StudioOrder) {
    val lang = LocalStudioLanguage.current
    val s = order.status.trim()
    val lowered = s.lowercase()
    val done = order.isDelivered || lowered.contains("complet") || lowered.contains("deliver")
    val color = when {
        done -> Color(0xFF34C759)
        order.isDispatched -> StudioBlue
        else -> Color(0xFFFF9500)
    }
    val label = if (s.isEmpty()) (if (order.isDelivered) studioT("Delivered", lang) else studioT("Pending", lang)) else studioT(s, lang)
    Surface(shape = RoundedCornerShape(20.dp), color = color.copy(alpha = 0.15f)) {
        Text(label, color = color, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp))
    }
}

@Composable
private fun emptyTabState(icon: ImageVector, text: String) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f), modifier = Modifier.size(26.dp))
        Text(text, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private fun fileSizeText(bytes: Long): String {
    if (bytes <= 0) return "0 B"
    val units = arrayOf("B", "KB", "MB", "GB")
    var size = bytes.toDouble()
    var unit = 0
    while (size >= 1024 && unit < units.size - 1) { size /= 1024; unit++ }
    return if (unit == 0) "$bytes B" else String.format(Locale.UK, "%.1f %s", size, units[unit])
}

@Composable
private fun QuickActionChip(
    label: String,
    enabled: Boolean = true,
    highlighted: Boolean = false,
    onClick: () -> Unit
) {
    // Pill-shaped one-tap contact action — mirrors the web quick-action chips.
    // Dimmed and inert when the customer is flagged "Do not contact"; a thicker
    // blue border marks the customer's preferred channel.
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = Color.Transparent,
        border = BorderStroke(
            if (highlighted) 2.dp else 1.dp,
            if (highlighted) StudioBlue.copy(alpha = 0.55f) else MaterialTheme.colorScheme.outlineVariant
        ),
        modifier = Modifier
            .alpha(if (enabled) 1f else 0.35f)
            .clip(RoundedCornerShape(999.dp))
            .clickable(enabled = enabled) { onClick() }
    ) {
        Text(
            label,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
        )
    }
}

@Composable
private fun StatusPill(label: String, textColor: Color, borderColor: Color, background: Color) {
    // Non-interactive status pill (⛔ do-not-contact / ⏰ follow-up), web parity.
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = background,
        border = BorderStroke(1.dp, borderColor)
    ) {
        Text(
            label,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = textColor,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
        )
    }
}

@Composable
private fun PreferenceMenuField(
    label: String,
    value: String,
    options: List<Pair<String, String>>,
    onSelect: (String) -> Unit
) {
    // Label + filled dropdown row, styled like CustomerField so the preferences
    // sit naturally under the contact form (web puts them in the same card).
    var open by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            label,
            fontSize = 13.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(104.dp)
        )
        Box(modifier = Modifier.weight(1f)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f))
                    .clickable { open = true }
                    .padding(horizontal = 12.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    options.firstOrNull { it.first == value }?.second ?: "—",
                    fontSize = 14.sp,
                    modifier = Modifier.weight(1f)
                )
                Text("▾", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                options.forEach { (optionValue, optionLabel) ->
                    DropdownMenuItem(
                        text = { Text(optionLabel) },
                        onClick = {
                            open = false
                            if (optionValue != value) onSelect(optionValue)
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun AddSegmentDialog(
    existingTags: List<String>,
    onDismiss: () -> Unit,
    onAdd: (String) -> Unit
) {
    val lang = LocalStudioLanguage.current
    val t: (String) -> String = { studioT(it, lang) }
    var value by remember { mutableStateOf("") }
    val suggestions = SEGMENT_SUGGESTIONS.filter { it !in existingTags }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(t("Segments"), fontWeight = FontWeight.ExtraBold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = value,
                    onValueChange = { value = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    placeholder = { Text(t("Add segment")) }
                )
                if (suggestions.isNotEmpty()) {
                    // Same suggestion list the web offers in its datalist —
                    // tapping one adds it right away.
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        suggestions.forEach { suggestion ->
                            Surface(
                                shape = RoundedCornerShape(999.dp),
                                color = SegmentBlue.copy(alpha = 0.1f),
                                modifier = Modifier
                                    .clip(RoundedCornerShape(999.dp))
                                    .clickable { onAdd(suggestion) }
                            ) {
                                Text(
                                    "⬖ $suggestion",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = SegmentBlue,
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(enabled = value.trim().isNotEmpty(), onClick = { onAdd(value.trim()) }) {
                Text(t("Add"), fontWeight = FontWeight.ExtraBold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(t("Cancel")) }
        }
    )
}

@Composable
private fun CustomerField(label: String, value: String, onChange: (String) -> Unit) {
    // Label on the left + filled value box, matching the Mac/iPhone customer detail.
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            label,
            fontSize = 13.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(104.dp)
        )
        BasicTextField(
            value = value,
            onValueChange = onChange,
            singleLine = true,
            textStyle = TextStyle(fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurface),
            modifier = Modifier
                .weight(1f)
                .background(
                    MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f),
                    RoundedCornerShape(8.dp)
                )
                .padding(horizontal = 12.dp, vertical = 12.dp)
        )
    }
}

