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
    val sku: String,
    val location: String,
    val onHand: Double,
    val reserved: Double,
    val unit: String,
    val lowStockAt: Double,
    val purchasePrice: Double,
    val additionalCostsTotal: Double,
    val internalTotalCost: Double,
    val valuationCost: Double
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

    /** What can honestly be promised to a new order. */
    val freeToReserve: Double
        get() = if (trackingType == StudioTrackingType.Unique) {
            if (status == StudioInventoryStatus.Available) 1.0 else 0.0
        } else {
            maxOf(0.0, onHand - reserved)
        }

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
                sku = raw["sku"] as? String ?: "",
                location = raw["location"] as? String ?: "",
                onHand = (quantity["onHand"] as? Number)?.toDouble() ?: 0.0,
                reserved = (quantity["reserved"] as? Number)?.toDouble() ?: 0.0,
                unit = quantity["unit"] as? String ?: "",
                lowStockAt = (raw["lowStockAt"] as? Number)?.toDouble() ?: 0.0,
                purchasePrice = (raw["purchasePrice"] as? Number)?.toDouble() ?: 0.0,
                additionalCostsTotal = (raw["additionalCostsTotal"] as? Number)?.toDouble() ?: 0.0,
                internalTotalCost = (raw["internalTotalCost"] as? Number)?.toDouble() ?: 0.0,
                valuationCost = (raw["valuationCost"] as? Number)?.toDouble() ?: 0.0
            )
        }
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
    val customerOwnedCount: Int = 0
) {
    companion object {
        fun from(raw: Map<*, *>): StudioInventorySummary = StudioInventorySummary(
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
