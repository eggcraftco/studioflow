package uk.co.eggcraft.studioflow.data.model

// Inventory on Android. Mirrors functions/inventory.js, the web app and the
// Apple apps: the money rules, the item numbering and the status lifecycle all
// live on the server, so this file carries shapes only. Two screens that each
// do their own arithmetic will eventually disagree, and the one a person is
// looking at will be the wrong one.

enum class StudioTrackingType(val raw: String, val label: String) {
    Unique("unique", "Unique"),
    Quantity("quantity", "Quantity");

    companion object {
        fun from(value: String?): StudioTrackingType =
            entries.firstOrNull { it.raw == value } ?: Unique
    }
}

enum class StudioInventoryStatus(val raw: String, val label: String) {
    // "reserved" means fully promised; "partiallyReserved" is a quantity item
    // with some — not all — of its stock promised to orders. Unique items
    // never get partial. "removed" is where a recorded loss leaves a unique
    // item: gone for a reason, not sold and not archived.
    Available("available", "Available"),
    Reserved("reserved", "Reserved"),
    PartiallyReserved("partiallyReserved", "Partially Reserved"),
    Incoming("incoming", "Incoming"),
    Used("used", "Used"),
    Sold("sold", "Sold"),
    Removed("removed", "Removed"),
    Archived("archived", "Archived");

    companion object {
        fun from(value: String?): StudioInventoryStatus =
            entries.firstOrNull { it.raw == value } ?: Available
    }
}

/** The starting point for a brand-new workspace only. The live list belongs to
 *  the workspace (Inventory → Categories) and arrives with the item page; this
 *  is the fallback for the first paint before that lands. */
val studioInventoryCategories = listOf(
    "Watches", "Dials", "Movements", "Bracelets", "Straps",
    "Parts", "Consumables", "Packaging", "Tools", "Other"
)

/** One of the workspace's own categories. An item stores the TITLE, so a rename
 *  is carried to the items server-side; the id only lets an editor follow a row
 *  across a rename. */
data class StudioInventoryCategory(
    val id: String,
    val title: String,
    val icon: String,
    val archived: Boolean,
    val itemCount: Int
) {
    companion object {
        fun from(raw: Map<*, *>?): StudioInventoryCategory? {
            val title = (raw?.get("title") as? String)?.trim().orEmpty()
            if (title.isEmpty()) return null
            return StudioInventoryCategory(
                id = (raw?.get("id") as? String).orEmpty().ifEmpty { title.lowercase() },
                title = title,
                icon = (raw?.get("icon") as? String).orEmpty(),
                archived = raw?.get("archived") as? Boolean ?: false,
                itemCount = (raw?.get("itemCount") as? Number)?.toInt() ?: 0
            )
        }
    }
}

/** One order holding a piece of this item. Written only by the server's
 *  reserveInventoryForOrder — never assembled client-side. */
data class StudioInventoryReservation(
    val orderId: String,
    val quantity: Double,
    val createdAtMs: Long
) {
    companion object {
        fun from(raw: Map<*, *>): StudioInventoryReservation? {
            val orderId = raw["orderId"] as? String ?: return null
            if (orderId.isBlank()) return null
            return StudioInventoryReservation(
                orderId = orderId,
                quantity = (raw["quantity"] as? Number)?.toDouble() ?: 1.0,
                createdAtMs = (raw["createdAtMs"] as? Number)?.toLong() ?: 0L
            )
        }
    }
}

data class StudioInventoryItem(
    val id: String,
    val number: String,
    val name: String,
    val category: String,
    val trackingType: StudioTrackingType,
    val isCustomerOwned: Boolean,
    val status: StudioInventoryStatus,
    val brand: String,
    val model: String,
    val reference: String,
    val serialNumber: String,
    val year: String,
    val condition: String,
    val description: String,
    val sku: String,
    val location: String,
    val supplierName: String,
    val purchaseDate: String,
    val notes: String,
    val tags: List<String>,
    val onHand: Double,
    val reserved: Double,
    val unit: String,
    val lowStockAt: Double,
    val purchasePrice: Double,
    val additionalCosts: List<Pair<String, Double>>,
    val additionalCostsTotal: Double,
    val internalTotalCost: Double,
    val valuationCost: Double,
    val currentValueEst: Double,
    val photos: List<String>,
    val reservations: List<StudioInventoryReservation>,
    val purchaseId: String,
    val purchaseNumber: String,
    val updatedAtMs: Long
) {
    /** A unique item is one object, whatever a stale record happens to say. */
    val displayOnHand: Double get() = if (trackingType == StudioTrackingType.Unique) 1.0 else onHand

    /** The same rule the server uses for the totals, so a row and the header
     *  can never disagree. */
    val lineValue: Double
        get() = when {
            isCustomerOwned -> 0.0
            trackingType == StudioTrackingType.Unique -> valuationCost
            else -> valuationCost * displayOnHand
        }

    val isLowStock: Boolean
        get() = trackingType == StudioTrackingType.Quantity && lowStockAt > 0 && displayOnHand <= lowStockAt

    /** What can honestly be promised to a new order. Something sold, used up or
     *  archived is out of the story whatever the count says — the server refuses
     *  to reserve it, so offering it would only be a dead end. */
    val freeToReserve: Double
        get() = when {
            status in listOf(StudioInventoryStatus.Sold, StudioInventoryStatus.Used, StudioInventoryStatus.Archived) -> 0.0
            trackingType == StudioTrackingType.Unique ->
                if (status == StudioInventoryStatus.Available) 1.0 else 0.0
            else -> maxOf(0.0, onHand - reserved)
        }

    /**
     * EVERY field the server's saveInventoryItem understands, mirrored from the
     * web's inventoryItemToInput. The server rebuilds the whole document from
     * the input (normalizeItemInput) — reservations, status and number are
     * carried over server-side, but any other field left out is blanked. So an
     * edit, even a location-only one, must start from this map and never from a
     * hand-picked subset.
     */
    fun toInput(): Map<String, Any?> = mapOf(
        "name" to name,
        "category" to category,
        "trackingType" to trackingType.raw,
        "ownership" to if (isCustomerOwned) "customer" else "business",
        "brand" to brand,
        "model" to model,
        "reference" to reference,
        "serialNumber" to serialNumber,
        "year" to year,
        "condition" to condition,
        "description" to description,
        "sku" to sku,
        "location" to location,
        "supplierName" to supplierName,
        "purchaseDate" to purchaseDate,
        "notes" to notes,
        // Tags have key-present semantics on the server: leaving the key out
        // keeps the stored ones, but the full-input path always sends them so
        // an edit round-trips exactly what the form showed.
        "tags" to tags,
        "photos" to photos,
        "onHand" to if (trackingType == StudioTrackingType.Quantity) onHand else 1.0,
        "unit" to if (trackingType == StudioTrackingType.Quantity) unit else "",
        "lowStockAt" to lowStockAt,
        "purchasePrice" to purchasePrice,
        "additionalCosts" to additionalCosts.map { mapOf("label" to it.first, "amount" to it.second) },
        "currentValueEst" to currentValueEst
    )

    companion object {
        fun from(raw: Map<*, *>): StudioInventoryItem? {
            val id = raw["id"] as? String ?: return null
            val quantity = raw["quantity"] as? Map<*, *> ?: emptyMap<String, Any?>()
            return StudioInventoryItem(
                id = id,
                number = raw["number"] as? String ?: "",
                name = raw["name"] as? String ?: "",
                category = raw["category"] as? String ?: "Other",
                trackingType = StudioTrackingType.from(raw["trackingType"] as? String),
                isCustomerOwned = (raw["ownership"] as? String) == "customer",
                status = StudioInventoryStatus.from(raw["status"] as? String),
                brand = raw["brand"] as? String ?: "",
                model = raw["model"] as? String ?: "",
                reference = raw["reference"] as? String ?: "",
                serialNumber = raw["serialNumber"] as? String ?: "",
                year = raw["year"] as? String ?: "",
                condition = raw["condition"] as? String ?: "",
                description = raw["description"] as? String ?: "",
                sku = raw["sku"] as? String ?: "",
                location = raw["location"] as? String ?: "",
                supplierName = raw["supplierName"] as? String ?: "",
                purchaseDate = raw["purchaseDate"] as? String ?: "",
                notes = raw["notes"] as? String ?: "",
                tags = (raw["tags"] as? List<*> ?: emptyList<Any?>()).mapNotNull { it as? String },
                onHand = (quantity["onHand"] as? Number)?.toDouble() ?: 0.0,
                reserved = (quantity["reserved"] as? Number)?.toDouble() ?: 0.0,
                unit = quantity["unit"] as? String ?: "",
                lowStockAt = (raw["lowStockAt"] as? Number)?.toDouble() ?: 0.0,
                purchasePrice = (raw["purchasePrice"] as? Number)?.toDouble() ?: 0.0,
                additionalCosts = (raw["additionalCosts"] as? List<*> ?: emptyList<Any?>()).mapNotNull { row ->
                    (row as? Map<*, *>)?.let {
                        (it["label"] as? String ?: "") to ((it["amount"] as? Number)?.toDouble() ?: 0.0)
                    }
                },
                additionalCostsTotal = (raw["additionalCostsTotal"] as? Number)?.toDouble() ?: 0.0,
                internalTotalCost = (raw["internalTotalCost"] as? Number)?.toDouble() ?: 0.0,
                valuationCost = (raw["valuationCost"] as? Number)?.toDouble() ?: 0.0,
                currentValueEst = (raw["currentValueEst"] as? Number)?.toDouble() ?: 0.0,
                photos = (raw["photos"] as? List<*> ?: emptyList<Any?>()).mapNotNull { it as? String },
                reservations = (raw["reservations"] as? List<*> ?: emptyList<Any?>())
                    .mapNotNull { (it as? Map<*, *>)?.let(StudioInventoryReservation::from) },
                purchaseId = raw["purchaseId"] as? String ?: "",
                purchaseNumber = raw["purchaseNumber"] as? String ?: "",
                updatedAtMs = (raw["updatedAtMs"] as? Number)?.toLong() ?: 0L
            )
        }
    }
}

/** Where the item list stopped. Goes back to listInventoryItems verbatim so
 *  the next page starts exactly where this one ended. */
data class StudioInventoryCursor(val updatedAtMs: Long, val id: String) {
    fun payload(): Map<String, Any?> = mapOf("updatedAtMs" to updatedAtMs, "id" to id)

    companion object {
        fun from(raw: Map<*, *>?): StudioInventoryCursor? {
            val id = raw?.get("id") as? String ?: return null
            val updatedAtMs = (raw["updatedAtMs"] as? Number)?.toLong() ?: return null
            return StudioInventoryCursor(updatedAtMs, id)
        }
    }
}

/** One page of the item list. [cursor] is null when this page is the last —
 *  a workshop past 500 items used to fall silently off the end of the list. */
data class StudioInventoryPage(
    val items: List<StudioInventoryItem> = emptyList(),
    val cursor: StudioInventoryCursor? = null,
    /** The workspace's own categories, served alongside the page so every
     *  picker on the screen shows the same words the web does. */
    val categories: List<StudioInventoryCategory> = emptyList(),
    val defaultCategory: String = ""
)

/** How the shelf value moved over the last 30 days. `available` is the server
 *  saying the figure is honest — the ledger covers the whole window and the
 *  baseline is real — so a screen shows the change only when it is true. */
data class StudioInventoryMonthlyChange(
    val available: Boolean = false,
    val netValue30d: Double = 0.0,
    val pct: Double = 0.0,
    val ledgerStartsMs: Long = 0L
) {
    companion object {
        fun from(raw: Map<*, *>): StudioInventoryMonthlyChange = StudioInventoryMonthlyChange(
            available = raw["available"] == true,
            netValue30d = (raw["netValue30d"] as? Number)?.toDouble() ?: 0.0,
            pct = (raw["pct"] as? Number)?.toDouble() ?: 0.0,
            ledgerStartsMs = (raw["ledgerStartsMs"] as? Number)?.toLong() ?: 0L
        )
    }
}

data class StudioInventorySummary(
    val totalValue: Double = 0.0,
    val uniqueCount: Int = 0,
    val uniqueValue: Double = 0.0,
    val quantityCount: Int = 0,
    val quantityValue: Double = 0.0,
    val reservedValue: Double = 0.0,
    val reservedCount: Int = 0,
    val incomingCount: Int = 0,
    val incomingValue: Double = 0.0,
    val lowStockCount: Int = 0,
    val customerOwnedCount: Int = 0,
    val monthlyChange: StudioInventoryMonthlyChange = StudioInventoryMonthlyChange()
) {
    companion object {
        fun from(raw: Map<*, *>): StudioInventorySummary = StudioInventorySummary(
            monthlyChange = StudioInventoryMonthlyChange.from(
                raw["monthlyChange"] as? Map<*, *> ?: emptyMap<String, Any?>()),
            totalValue = (raw["totalValue"] as? Number)?.toDouble() ?: 0.0,
            uniqueCount = (raw["uniqueCount"] as? Number)?.toInt() ?: 0,
            uniqueValue = (raw["uniqueValue"] as? Number)?.toDouble() ?: 0.0,
            quantityCount = (raw["quantityCount"] as? Number)?.toInt() ?: 0,
            quantityValue = (raw["quantityValue"] as? Number)?.toDouble() ?: 0.0,
            reservedValue = (raw["reservedValue"] as? Number)?.toDouble() ?: 0.0,
            reservedCount = (raw["reservedCount"] as? Number)?.toInt() ?: 0,
            incomingCount = (raw["incomingCount"] as? Number)?.toInt() ?: 0,
            incomingValue = (raw["incomingValue"] as? Number)?.toDouble() ?: 0.0,
            lowStockCount = (raw["lowStockCount"] as? Number)?.toInt() ?: 0,
            customerOwnedCount = (raw["customerOwnedCount"] as? Number)?.toInt() ?: 0
        )
    }
}

data class StudioPurchaseLineDraft(
    val name: String = "",
    val category: String = "Other",
    val trackingType: StudioTrackingType = StudioTrackingType.Unique,
    val quantity: Double = 1.0,
    val unit: String = "",
    val unitPrice: Double = 0.0,
    val reference: String = "",
    val serialNumber: String = "",
    val location: String = ""
) {
    fun payload(): Map<String, Any?> = mapOf(
        "name" to name,
        "category" to category,
        "trackingType" to trackingType.raw,
        "quantity" to if (trackingType == StudioTrackingType.Unique) 1.0 else quantity,
        "unit" to if (trackingType == StudioTrackingType.Unique) "" else unit,
        "unitPrice" to unitPrice,
        "reference" to reference,
        "serialNumber" to serialNumber,
        "location" to location
    )
}

/** One line of a purchase order, as the server stores it. [receivedQuantity]
 *  is how much of it has already landed — absent on old purchases, which means
 *  zero: nothing had partially arrived before the field existed. */
data class StudioPurchaseLine(
    val name: String,
    val trackingType: StudioTrackingType,
    val quantity: Double,
    val unit: String,
    val receivedQuantity: Double
) {
    /** A unique line is always one thing, whatever its quantity field says. */
    val ordered: Double get() = if (trackingType == StudioTrackingType.Unique) 1.0 else quantity
    val outstanding: Double get() = (ordered - receivedQuantity).coerceAtLeast(0.0)

    companion object {
        fun from(raw: Map<*, *>): StudioPurchaseLine = StudioPurchaseLine(
            name = raw["name"] as? String ?: "",
            trackingType = StudioTrackingType.from(raw["trackingType"] as? String),
            quantity = (raw["quantity"] as? Number)?.toDouble() ?: 0.0,
            unit = raw["unit"] as? String ?: "",
            receivedQuantity = (raw["receivedQuantity"] as? Number)?.toDouble() ?: 0.0
        )
    }
}

data class StudioPurchase(
    val id: String,
    val number: String,
    val supplierName: String,
    val purchaseDate: String,
    val reference: String,
    val lines: List<StudioPurchaseLine>,
    val shipping: Double,
    val otherCosts: Double,
    val total: Double,
    val status: String,
    val bankTransactionId: String
) {
    val lineCount: Int get() = lines.size
    val isReceived: Boolean get() = status == "received"
    /** Between ordered and received: some of the delivery is on the shelf, the
     *  rest is still with the courier. */
    val isPartiallyReceived: Boolean get() = status == "partiallyReceived"

    companion object {
        fun from(raw: Map<*, *>): StudioPurchase? {
            val id = raw["id"] as? String ?: return null
            return StudioPurchase(
                id = id,
                number = raw["number"] as? String ?: "",
                supplierName = raw["supplierName"] as? String ?: "",
                purchaseDate = raw["purchaseDate"] as? String ?: "",
                reference = raw["reference"] as? String ?: "",
                lines = (raw["lines"] as? List<*> ?: emptyList<Any?>())
                    .mapNotNull { (it as? Map<*, *>)?.let(StudioPurchaseLine::from) },
                shipping = (raw["shipping"] as? Number)?.toDouble() ?: 0.0,
                otherCosts = (raw["otherCosts"] as? Number)?.toDouble() ?: 0.0,
                total = (raw["total"] as? Number)?.toDouble() ?: 0.0,
                status = raw["status"] as? String ?: "",
                bankTransactionId = raw["bankTransactionId"] as? String ?: ""
            )
        }
    }
}

data class StudioSupplier(
    val id: String,
    val name: String,
    val email: String,
    val phone: String,
    val website: String,
    val notes: String,
    /** The paperwork fields: what an invoice or a customs form asks for. */
    val code: String,
    val address: String,
    val vatNumber: String,
    val currency: String,
    /** True when this supplier exists only because a purchase names it. The
     *  buying is what makes a supplier real; the card is extra detail. */
    val isImplied: Boolean,
    val spent: Double,
    val purchaseCount: Int,
    val lineCount: Int,
    val lastDate: String,
    val matchedCount: Int
) {
    val listKey: String get() = id.ifBlank { "implied-$name" }

    companion object {
        fun from(raw: Map<*, *>): StudioSupplier {
            val stats = raw["stats"] as? Map<*, *> ?: emptyMap<String, Any?>()
            return StudioSupplier(
                id = raw["id"] as? String ?: "",
                name = raw["name"] as? String ?: "",
                email = raw["email"] as? String ?: "",
                phone = raw["phone"] as? String ?: "",
                website = raw["website"] as? String ?: "",
                notes = raw["notes"] as? String ?: "",
                code = raw["code"] as? String ?: "",
                address = raw["address"] as? String ?: "",
                vatNumber = raw["vatNumber"] as? String ?: "",
                currency = raw["currency"] as? String ?: "",
                isImplied = raw["implied"] == true,
                spent = (stats["total"] as? Number)?.toDouble() ?: 0.0,
                purchaseCount = (stats["count"] as? Number)?.toInt() ?: 0,
                lineCount = (stats["lines"] as? Number)?.toInt() ?: 0,
                lastDate = stats["lastDate"] as? String ?: "",
                matchedCount = (stats["matched"] as? Number)?.toInt() ?: 0
            )
        }
    }
}

/** One node of the hierarchical location tree ("Safe A / Drawer 3"). Items
 *  still carry ONE plain location string; the server owns the cascade that
 *  rewrites subtree paths and item strings when a node is renamed or moved. */
data class StudioInventoryLocation(
    val id: String,
    val name: String,
    val parentId: String,
    val path: String,
    val depth: Int
) {
    companion object {
        fun from(raw: Map<*, *>): StudioInventoryLocation? {
            val id = raw["id"] as? String ?: return null
            val name = raw["name"] as? String ?: ""
            return StudioInventoryLocation(
                id = id,
                name = name,
                parentId = raw["parentId"] as? String ?: "",
                path = (raw["path"] as? String).takeUnless { it.isNullOrBlank() } ?: name,
                depth = (raw["depth"] as? Number)?.toInt() ?: 1
            )
        }
    }
}

/** One line of a recipe: this item, this many per job. */
data class StudioInventoryRecipeLine(
    val itemId: String,
    val quantity: Double
) {
    companion object {
        fun from(raw: Map<*, *>): StudioInventoryRecipeLine? {
            val itemId = raw["itemId"] as? String ?: return null
            if (itemId.isBlank()) return null
            return StudioInventoryRecipeLine(
                itemId = itemId,
                quantity = (raw["quantity"] as? Number)?.toDouble() ?: 1.0
            )
        }
    }
}

/** A job's parts list, written once: "1 buckle + 20cm leather + 2 screws".
 *  Applying it to an order reserves every line in ONE server transaction —
 *  all or nothing — so what lives here is only ever the description. */
data class StudioInventoryRecipe(
    val id: String,
    val name: String,
    val notes: String,
    val lines: List<StudioInventoryRecipeLine>
) {
    companion object {
        fun from(raw: Map<*, *>): StudioInventoryRecipe? {
            val id = raw["id"] as? String ?: return null
            return StudioInventoryRecipe(
                id = id,
                name = raw["name"] as? String ?: "",
                notes = raw["notes"] as? String ?: "",
                lines = (raw["lines"] as? List<*> ?: emptyList<Any?>())
                    .mapNotNull { (it as? Map<*, *>)?.let(StudioInventoryRecipeLine::from) }
            )
        }
    }
}

data class StudioOrderStockLine(
    val id: String,
    val number: String,
    val name: String,
    val trackingType: StudioTrackingType,
    val unit: String,
    val quantity: Double,
    /** Total on the shelf, so the card can say "3 of 10" instead of a bare 3.
     *  Zero when an older server response does not carry it. */
    val onHand: Double,
    val location: String,
    val lineCost: Double
) {
    companion object {
        fun from(raw: Map<*, *>): StudioOrderStockLine? {
            val id = raw["id"] as? String ?: return null
            return StudioOrderStockLine(
                id = id,
                number = raw["number"] as? String ?: "",
                name = raw["name"] as? String ?: "",
                trackingType = StudioTrackingType.from(raw["trackingType"] as? String),
                unit = raw["unit"] as? String ?: "",
                quantity = (raw["quantity"] as? Number)?.toDouble() ?: 0.0,
                onHand = (raw["onHand"] as? Number)?.toDouble() ?: 0.0,
                location = raw["location"] as? String ?: "",
                lineCost = (raw["lineCost"] as? Number)?.toDouble() ?: 0.0
            )
        }
    }
}

/** One row of a pasted list, as the server read it. [payload] goes back to the
 *  import untouched, so what the preview shows is what gets written. A row that
 *  matched stock already on the shelf (by serial, or failing that SKU) carries
 *  [existingItemId] and [existingNumber] so the preview can say so. */
data class StudioOpeningStockRow(
    val rowIndex: Int,
    val name: String,
    val category: String,
    val trackingType: StudioTrackingType,
    val onHand: Double,
    val unit: String,
    val purchasePrice: Double,
    val location: String,
    val lineValue: Double,
    val existingItemId: String,
    val existingNumber: String,
    val payload: Map<String, Any?>
) {
    companion object {
        fun from(raw: Map<*, *>): StudioOpeningStockRow? {
            val name = raw["name"] as? String ?: return null
            @Suppress("UNCHECKED_CAST")
            return StudioOpeningStockRow(
                rowIndex = (raw["rowIndex"] as? Number)?.toInt() ?: 0,
                name = name,
                category = raw["category"] as? String ?: "Other",
                trackingType = StudioTrackingType.from(raw["trackingType"] as? String),
                onHand = (raw["onHand"] as? Number)?.toDouble() ?: 0.0,
                unit = raw["unit"] as? String ?: "",
                purchasePrice = (raw["purchasePrice"] as? Number)?.toDouble() ?: 0.0,
                location = raw["location"] as? String ?: "",
                lineValue = (raw["lineValue"] as? Number)?.toDouble() ?: 0.0,
                existingItemId = raw["existingItemId"] as? String ?: "",
                existingNumber = raw["existingNumber"] as? String ?: "",
                payload = raw as Map<String, Any?>
            )
        }
    }
}

/** A row that cannot become an item. The reason is a code — the words belong to
 *  whichever language the app is in. */
data class StudioOpeningStockSkip(val name: String, val reason: String) {
    val message: String
        get() = if (reason == "noName") "No name — this row cannot become an item."
                else "No amount on hand — a counted item needs one."
}

data class StudioOpeningStockRead(
    val grid: List<List<String>> = emptyList(),
    val headers: List<String> = emptyList(),
    val mapping: List<String> = emptyList(),
    val items: List<StudioOpeningStockRow> = emptyList(),
    val skipped: List<StudioOpeningStockSkip> = emptyList(),
    val maxRows: Int = 500
)

/** The fields a pasted column can be pointed at. The aliases that guess this
 *  automatically live on the server; these are only the menu labels. */
val studioOpeningStockFields: List<Pair<String, String>> = listOf(
    "name" to "Name", "trackingType" to "Type", "category" to "Category",
    "brand" to "Brand", "model" to "Model", "reference" to "Reference",
    "serialNumber" to "Serial number", "sku" to "SKU", "onHand" to "On hand",
    "unit" to "Unit", "lowStockAt" to "Reorder at", "purchasePrice" to "Purchase price",
    "location" to "Location", "supplierName" to "Supplier",
    "purchaseDate" to "Purchase date", "notes" to "Notes"
)

/** One line of the movement ledger, as listInventoryMovements returns it. The
 *  kind stays a raw string — the detail sheet maps the ones it knows to words
 *  and shows the rest as-is, so a new server kind never hides a row. */
data class StudioInventoryMovement(
    val id: String,
    val kind: String,
    val delta: Double,
    val valueDelta: Double,
    val at: Long,
    val byEmail: String,
    val note: String
) {
    companion object {
        fun from(raw: Map<*, *>): StudioInventoryMovement? {
            val id = raw["id"] as? String ?: return null
            return StudioInventoryMovement(
                id = id,
                kind = raw["kind"] as? String ?: "",
                delta = (raw["delta"] as? Number)?.toDouble() ?: 0.0,
                valueDelta = (raw["valueDelta"] as? Number)?.toDouble() ?: 0.0,
                at = (raw["at"] as? Number)?.toLong() ?: 0L,
                byEmail = raw["byEmail"] as? String ?: "",
                note = raw["note"] as? String ?: ""
            )
        }
    }
}

/** One row of the Files library, as listLibraryFiles returns it. Only the
 *  fields the screens draw are kept — anything else the server sends is
 *  ignored, so new library fields never break the parse. */
data class StudioLibraryFile(
    val id: String,
    val displayName: String,
    val fileName: String,
    val fileSize: Long,
    val storagePath: String,
    val updatedAtMs: Long,
    val clientPortalVisible: Boolean,
    val trashedAtMs: Long,
    val linkKinds: List<String>,
    val links: List<StudioLibraryFileLink>,
    val activity: List<StudioLibraryFileActivity>
) {
    companion object {
        fun from(raw: Map<*, *>): StudioLibraryFile? {
            val id = raw["id"] as? String ?: return null
            return StudioLibraryFile(
                id = id,
                displayName = raw["displayName"] as? String ?: "",
                fileName = raw["fileName"] as? String ?: "",
                fileSize = (raw["fileSize"] as? Number)?.toLong() ?: 0L,
                storagePath = raw["storagePath"] as? String ?: "",
                updatedAtMs = (raw["updatedAtMs"] as? Number)?.toLong() ?: 0L,
                clientPortalVisible = raw["clientPortalVisible"] as? Boolean ?: false,
                trashedAtMs = (raw["trashedAtMs"] as? Number)?.toLong() ?: 0L,
                linkKinds = (raw["linkKinds"] as? List<*> ?: emptyList<Any?>())
                    .mapNotNull { it as? String },
                links = (raw["links"] as? List<*> ?: emptyList<Any?>())
                    .mapNotNull { (it as? Map<*, *>)?.let(StudioLibraryFileLink::from) },
                activity = (raw["activity"] as? List<*> ?: emptyList<Any?>())
                    .mapNotNull { (it as? Map<*, *>)?.let(StudioLibraryFileActivity::from) }
            )
        }
    }
}

/** One link between a library file and a record ("order", "inventoryItem"…). */
data class StudioLibraryFileLink(
    val kind: String,
    val id: String,
    val label: String,
    val audience: String,
    val displayName: String
) {
    companion object {
        fun from(raw: Map<*, *>): StudioLibraryFileLink? {
            val kind = raw["kind"] as? String ?: return null
            return StudioLibraryFileLink(
                kind = kind,
                id = raw["id"] as? String ?: "",
                label = raw["label"] as? String ?: "",
                audience = raw["audience"] as? String ?: "",
                displayName = raw["displayName"] as? String ?: ""
            )
        }
    }
}

/** One line of a library file's activity trail. */
data class StudioLibraryFileActivity(
    val atMs: Long,
    val byEmail: String,
    val action: String,
    val detail: String
) {
    companion object {
        fun from(raw: Map<*, *>): StudioLibraryFileActivity? {
            val action = raw["action"] as? String ?: return null
            return StudioLibraryFileActivity(
                atMs = (raw["atMs"] as? Number)?.toLong() ?: 0L,
                byEmail = raw["byEmail"] as? String ?: "",
                action = action,
                detail = raw["detail"] as? String ?: ""
            )
        }
    }
}

enum class StudioMovementKind(val raw: String, val label: String) {
    OpeningStock("openingStock", "Opening stock"),
    Purchase("purchase", "Purchases received"),
    Adjustment("adjustment", "Corrected by hand"),
    Stocktake("stocktake", "Stocktake"),
    Used("used", "Used on jobs"),
    Sold("sold", "Sold"),
    Removed("removed", "Removed"),
    // A location change moves nothing in or out — its delta is zero.
    Moved("moved", "Moved"),
    // Losses keep their reason, so "where did that stock go" has an answer.
    Returned("returned", "Returned to supplier"),
    Damaged("damaged", "Damaged"),
    Lost("lost", "Lost"),
    Wastage("wastage", "Wastage");

    companion object {
        fun from(value: String?): StudioMovementKind? = entries.firstOrNull { it.raw == value }
    }
}

data class StudioStocktakeLine(
    val itemId: String,
    val number: String,
    val name: String,
    val category: String,
    val location: String,
    val trackingType: StudioTrackingType,
    val unit: String,
    val expected: Double,
    val unitCost: Double,
    /** null means nobody has counted this yet — which is not "counted as zero". */
    val counted: Double?
) {
    companion object {
        fun from(raw: Map<*, *>): StudioStocktakeLine? {
            val itemId = raw["itemId"] as? String ?: return null
            return StudioStocktakeLine(
                itemId = itemId,
                number = raw["number"] as? String ?: "",
                name = raw["name"] as? String ?: "",
                category = raw["category"] as? String ?: "",
                location = raw["location"] as? String ?: "",
                trackingType = StudioTrackingType.from(raw["trackingType"] as? String),
                unit = raw["unit"] as? String ?: "",
                expected = (raw["expected"] as? Number)?.toDouble() ?: 0.0,
                unitCost = (raw["unitCost"] as? Number)?.toDouble() ?: 0.0,
                counted = (raw["counted"] as? Number)?.toDouble()
            )
        }
    }
}

data class StudioOverPromised(
    val name: String,
    val counted: Double,
    val reserved: Double,
    val orderIds: List<String>
)

data class StudioStocktakeSummary(
    val id: String,
    val number: String,
    val status: String,
    val location: String,
    val category: String,
    val startedAtMs: Long,
    val startedByEmail: String,
    val lineCount: Int,
    val countedCount: Int,
    val adjustedLines: Int,
    val valueDelta: Double
) {
    companion object {
        fun from(raw: Map<*, *>): StudioStocktakeSummary? {
            val id = raw["id"] as? String ?: return null
            return StudioStocktakeSummary(
                id = id,
                number = raw["number"] as? String ?: "",
                status = raw["status"] as? String ?: "open",
                location = raw["location"] as? String ?: "",
                category = raw["category"] as? String ?: "",
                startedAtMs = (raw["startedAtMs"] as? Number)?.toLong() ?: 0L,
                startedByEmail = raw["startedByEmail"] as? String ?: "",
                lineCount = (raw["lineCount"] as? Number)?.toInt() ?: 0,
                countedCount = (raw["countedCount"] as? Number)?.toInt() ?: 0,
                adjustedLines = (raw["adjustedLines"] as? Number)?.toInt() ?: 0,
                valueDelta = (raw["valueDelta"] as? Number)?.toDouble() ?: 0.0
            )
        }
    }
}

data class StudioReportRow(val name: String, val value: Double)
data class StudioReportKind(val kind: StudioMovementKind, val lines: Int, val value: Double)
data class StudioLowStockRow(
    val name: String, val number: String, val onHand: Double,
    val lowStockAt: Double, val unit: String)
data class StudioDeadStockRow(
    val name: String, val number: String, val value: Double, val idleDays: Int)

data class StudioInventoryReport(
    val totalValue: Double = 0.0,
    val onShelfCount: Int = 0,
    val byCategory: List<StudioReportRow> = emptyList(),
    val inValue: Double = 0.0,
    val outValue: Double = 0.0,
    val byKind: List<StudioReportKind> = emptyList(),
    val ledgerStartsMs: Long = 0L,
    val coversWholePeriod: Boolean = true,
    val lowStock: List<StudioLowStockRow> = emptyList(),
    val deadStock: List<StudioDeadStockRow> = emptyList(),
    val deadStockAfterDays: Int = 180
) {
    companion object {
        fun from(raw: Map<*, *>): StudioInventoryReport {
            val valuation = raw["valuation"] as? Map<*, *> ?: emptyMap<String, Any?>()
            val movement = raw["movement"] as? Map<*, *> ?: emptyMap<String, Any?>()
            return StudioInventoryReport(
                totalValue = (valuation["totalValue"] as? Number)?.toDouble() ?: 0.0,
                onShelfCount = (valuation["onShelfCount"] as? Number)?.toInt() ?: 0,
                byCategory = (valuation["byCategory"] as? List<*> ?: emptyList<Any?>()).mapNotNull { row ->
                    (row as? Map<*, *>)?.let {
                        StudioReportRow(it["name"] as? String ?: "",
                                        (it["value"] as? Number)?.toDouble() ?: 0.0)
                    }
                },
                inValue = (movement["inValue"] as? Number)?.toDouble() ?: 0.0,
                outValue = (movement["outValue"] as? Number)?.toDouble() ?: 0.0,
                byKind = (movement["byKind"] as? List<*> ?: emptyList<Any?>()).mapNotNull { row ->
                    val entry = row as? Map<*, *> ?: return@mapNotNull null
                    val kind = StudioMovementKind.from(entry["kind"] as? String) ?: return@mapNotNull null
                    StudioReportKind(kind, (entry["lines"] as? Number)?.toInt() ?: 0,
                                     (entry["value"] as? Number)?.toDouble() ?: 0.0)
                },
                ledgerStartsMs = (movement["ledgerStartsMs"] as? Number)?.toLong() ?: 0L,
                coversWholePeriod = movement["coversWholePeriod"] as? Boolean ?: true,
                lowStock = (raw["lowStock"] as? List<*> ?: emptyList<Any?>()).mapNotNull { row ->
                    (row as? Map<*, *>)?.let {
                        StudioLowStockRow(it["name"] as? String ?: "", it["number"] as? String ?: "",
                            (it["onHand"] as? Number)?.toDouble() ?: 0.0,
                            (it["lowStockAt"] as? Number)?.toDouble() ?: 0.0,
                            it["unit"] as? String ?: "")
                    }
                },
                deadStock = (raw["deadStock"] as? List<*> ?: emptyList<Any?>()).mapNotNull { row ->
                    (row as? Map<*, *>)?.let {
                        StudioDeadStockRow(it["name"] as? String ?: "", it["number"] as? String ?: "",
                            (it["value"] as? Number)?.toDouble() ?: 0.0,
                            (it["idleDays"] as? Number)?.toInt() ?: 0)
                    }
                },
                deadStockAfterDays = (raw["deadStockAfterDays"] as? Number)?.toInt() ?: 180
            )
        }
    }
}
