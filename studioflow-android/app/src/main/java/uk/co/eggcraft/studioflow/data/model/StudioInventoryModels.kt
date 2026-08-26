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
    Available("available", "Available"),
    Reserved("reserved", "Reserved"),
    Incoming("incoming", "Incoming"),
    Used("used", "Used"),
    Sold("sold", "Sold"),
    Archived("archived", "Archived");

    companion object {
        fun from(value: String?): StudioInventoryStatus =
            entries.firstOrNull { it.raw == value } ?: Available
    }
}

val studioInventoryCategories = listOf(
    "Watches", "Dials", "Movements", "Bracelets", "Straps",
    "Parts", "Consumables", "Packaging", "Tools", "Other"
)

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

data class StudioPurchase(
    val id: String,
    val number: String,
    val supplierName: String,
    val purchaseDate: String,
    val reference: String,
    val lineCount: Int,
    val shipping: Double,
    val otherCosts: Double,
    val total: Double,
    val isReceived: Boolean,
    val bankTransactionId: String
) {
    companion object {
        fun from(raw: Map<*, *>): StudioPurchase? {
            val id = raw["id"] as? String ?: return null
            return StudioPurchase(
                id = id,
                number = raw["number"] as? String ?: "",
                supplierName = raw["supplierName"] as? String ?: "",
                purchaseDate = raw["purchaseDate"] as? String ?: "",
                reference = raw["reference"] as? String ?: "",
                lineCount = (raw["lines"] as? List<*>)?.size ?: 0,
                shipping = (raw["shipping"] as? Number)?.toDouble() ?: 0.0,
                otherCosts = (raw["otherCosts"] as? Number)?.toDouble() ?: 0.0,
                total = (raw["total"] as? Number)?.toDouble() ?: 0.0,
                isReceived = (raw["status"] as? String) == "received",
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

data class StudioOrderStockLine(
    val id: String,
    val number: String,
    val name: String,
    val trackingType: StudioTrackingType,
    val unit: String,
    val quantity: Double,
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
                lineCost = (raw["lineCost"] as? Number)?.toDouble() ?: 0.0
            )
        }
    }
}

/** One row of a pasted list, as the server read it. [payload] goes back to the
 *  import untouched, so what the preview shows is what gets written. */
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
 *  fields the detail sheet draws are kept — anything else the server sends is
 *  ignored, so new library fields never break the parse. */
data class StudioLibraryFile(
    val id: String,
    val displayName: String,
    val fileSize: Long,
    val storagePath: String,
    val updatedAtMs: Long
) {
    companion object {
        fun from(raw: Map<*, *>): StudioLibraryFile? {
            val id = raw["id"] as? String ?: return null
            return StudioLibraryFile(
                id = id,
                displayName = raw["displayName"] as? String ?: "",
                fileSize = (raw["fileSize"] as? Number)?.toLong() ?: 0L,
                storagePath = raw["storagePath"] as? String ?: "",
                updatedAtMs = (raw["updatedAtMs"] as? Number)?.toLong() ?: 0L
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
    Removed("removed", "Removed");

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
