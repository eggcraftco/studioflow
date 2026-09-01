package uk.co.eggcraft.studioflow.features.home

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Note
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Handyman
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.People
import androidx.compose.ui.graphics.vector.ImageVector
import org.json.JSONArray
import org.json.JSONObject

/**
 * The Home screen's card model, kept identical to the web's homeCards.ts and
 * the Swift HomeCards.swift.
 *
 * Home is a reporting, alerting and quick-action layer — NOT a smaller copy of
 * Orders, Banking, Inventory, Schedule or Files. Every card answers one of the
 * three questions the screen exists for (what needs attention, what is next,
 * where do I go for the detail) and then hands off to the full screen.
 *
 * This file is the single source of truth for what a card is: which sizes it
 * supports, what it defaults to, who may see it and which section its link
 * opens. Rendering lives in HomeScreen; the model does not.
 */

enum class HomeCardId {
    GettingStarted, QuickActions, RecentActivity, Money, Banking,
    Inventory, Customers, OrdersProduction, Schedule, Files, Notes;

    /** The stored key. Stays stable across renames so a saved layout keeps working. */
    val key: String
        get() = when (this) {
            GettingStarted -> "gettingStarted"
            QuickActions -> "quickActions"
            RecentActivity -> "recentActivity"
            Money -> "money"
            Banking -> "banking"
            Inventory -> "inventory"
            Customers -> "customers"
            OrdersProduction -> "ordersProduction"
            Schedule -> "schedule"
            Files -> "files"
            Notes -> "notes"
        }

    companion object {
        fun fromKey(value: String): HomeCardId? = entries.firstOrNull { it.key == value }
    }
}

/** 1x1 is a single square, 2x1 spans two columns, 2x2 spans two by two. */
enum class HomeCardSize(val key: String, val columns: Int, val rows: Int, val label: String) {
    OneByOne("1x1", 1, 1, "1×1"),
    TwoByOne("2x1", 2, 1, "2×1"),
    TwoByTwo("2x2", 2, 2, "2×2");

    companion object {
        fun fromKey(value: String): HomeCardSize? = entries.firstOrNull { it.key == value }
    }
}

/** A card's colour theme. Colour never carries meaning on its own (§20). */
enum class HomeCardTone(val key: String, val label: String) {
    Standard("default", "Default"),
    Blue("blue", "Blue"),
    Green("green", "Green"),
    Amber("amber", "Amber"),
    Purple("purple", "Purple"),
    Rose("rose", "Rose");

    companion object {
        fun fromKey(value: String): HomeCardTone = entries.firstOrNull { it.key == value } ?: Standard
    }
}

/**
 * Which navigation permission a card needs. A member without it never sees the
 * card — §18 says a denied card explains itself or hides, never breaks.
 */
enum class HomeCardAccess { Always, Orders, Dashboard, BankFeed, Customers, Schedule, Files, Notes }

data class HomeCardDefinition(
    val id: HomeCardId,
    /** English title. Runs through studioT() at render, and the owner may rename it. */
    val title: String,
    val icon: ImageVector,
    val sizes: List<HomeCardSize>,
    val defaultSize: HomeCardSize,
    val access: HomeCardAccess,
    /** Owner-only cards: money and banking are workspace finances. */
    val financeOnly: Boolean,
    /** The section this card's single footer link opens. */
    val destination: String,
    val linkLabel: String,
    /** Banking uses the solid badge the reference gives it; everything else the
     *  ring. Last in the list so every positional entry above stays valid. */
    val filledBadge: Boolean = false,
    /** The card reports a total, so its header offers the range that total
     *  covers. Also last, for the same reason. */
    val periods: Boolean = false
)

object HomeCards {
    private val everySize = listOf(HomeCardSize.OneByOne, HomeCardSize.TwoByOne, HomeCardSize.TwoByTwo)

    /**
     * Gallery order, not layout order — the default layout below decides where
     * each card starts.
     */
    val all: List<HomeCardDefinition> = listOf(
        HomeCardDefinition(HomeCardId.GettingStarted, "Getting started", Icons.Filled.Checklist, everySize, HomeCardSize.TwoByOne,
            HomeCardAccess.Always, false, "Settings", "View checklist"),
        HomeCardDefinition(HomeCardId.QuickActions, "Quick actions", Icons.Filled.Bolt, everySize, HomeCardSize.OneByOne,
            HomeCardAccess.Always, false, "Orders", "Open Orders"),
        HomeCardDefinition(HomeCardId.RecentActivity, "Recent activity", Icons.Filled.History, everySize, HomeCardSize.OneByOne,
            HomeCardAccess.Always, false, "Orders", "View all activity"),
        HomeCardDefinition(HomeCardId.Money, "Money", Icons.Filled.Payments, everySize, HomeCardSize.OneByOne,
            HomeCardAccess.Dashboard, true, "Dashboard", "Open Dashboard", periods = true),
        HomeCardDefinition(HomeCardId.Banking, "Banking", Icons.Filled.AccountBalance, filledBadge = true,
            sizes = everySize, defaultSize = HomeCardSize.OneByOne, access = HomeCardAccess.BankFeed,
            financeOnly = true, destination = "BankSpending", linkLabel = "Go to banking"),
        HomeCardDefinition(HomeCardId.Inventory, "Inventory", Icons.Filled.Inventory2, everySize, HomeCardSize.OneByOne,
            HomeCardAccess.Orders, false, "Inventory", "Open Inventory"),
        HomeCardDefinition(HomeCardId.Customers, "Customers", Icons.Filled.People, everySize, HomeCardSize.OneByOne,
            HomeCardAccess.Customers, false, "Customers", "Open Customers"),
        HomeCardDefinition(HomeCardId.OrdersProduction, "Orders & production", Icons.Filled.Handyman, everySize, HomeCardSize.TwoByOne,
            HomeCardAccess.Orders, false, "Production", "View all orders"),
        HomeCardDefinition(HomeCardId.Schedule, "Schedule", Icons.Filled.CalendarMonth, everySize, HomeCardSize.TwoByOne,
            HomeCardAccess.Schedule, false, "Schedule", "Open Schedule"),
        // Not "Files": that key is the navigation item and reads as "choose from
        // files" in several languages. This card is the library itself.
        HomeCardDefinition(HomeCardId.Files, "File library", Icons.Filled.Folder, everySize, HomeCardSize.TwoByOne,
            HomeCardAccess.Files, false, "Files", "View all files"),
        HomeCardDefinition(HomeCardId.Notes, "Notes", Icons.AutoMirrored.Filled.Note, everySize, HomeCardSize.TwoByOne,
            HomeCardAccess.Notes, false, "Notes", "View all notes")
    )

    fun definition(id: HomeCardId): HomeCardDefinition? = all.firstOrNull { it.id == id }
}

/**
 * How far back a card counts. Only the cards that report a total offer it — a
 * figure without its period is not an answer.
 */
enum class HomeCardPeriod(val key: String, val label: String) {
    Month("month", "This month"),
    Year("year", "This year"),
    All("all", "All time");

    companion object {
        fun fromKey(key: String?): HomeCardPeriod = entries.firstOrNull { it.key == key } ?: Month
    }
}

data class HomeCardPlacement(
    val id: HomeCardId,
    val size: HomeCardSize,
    /** Owner's own wording for the heading; empty means the registry title. */
    val heading: String = "",
    val tone: HomeCardTone = HomeCardTone.Standard,
    /** Only meaningful on a card whose definition sets `periods`. Last in the
     *  list so every positional entry above stays valid. */
    val period: HomeCardPeriod = HomeCardPeriod.Month
)

/**
 * Versioned, because a stored layout outlives the code that wrote it. A layout
 * from an older version is migrated rather than thrown away; an unreadable one
 * falls back to the default rather than leaving Home blank.
 *
 * Stored as a JSON string rather than a nested map. Firestore's dotted-key merge
 * semantics have bitten this codebase before, and a layout is an ordered list: a
 * merge that reorders or half-writes it is worse than one that replaces it whole.
 */
data class HomeLayout(
    val cards: List<HomeCardPlacement>,
    val hidden: List<HomeCardId>
) {
    /**
     * Drops what this build cannot render and de-duplicates, so a layout written
     * by a newer version — or a corrupted one — still opens.
     */
    fun normalised(): HomeLayout {
        val seen = LinkedHashSet<HomeCardId>()
        val kept = mutableListOf<HomeCardPlacement>()
        for (card in cards) {
            val definition = HomeCards.definition(card.id) ?: continue
            if (!seen.add(card.id)) continue
            kept += card.copy(
                size = if (card.size in definition.sizes) card.size else definition.defaultSize,
                heading = card.heading.take(40)
            )
        }
        val hiddenIds = hidden.filter { HomeCards.definition(it) != null && it !in seen }
        // A card that is neither placed nor hidden is new to this build: show it
        // rather than silently losing it.
        for (definition in HomeCards.all) {
            if (definition.id !in seen && definition.id !in hiddenIds) {
                kept += HomeCardPlacement(definition.id, definition.defaultSize)
            }
        }
        return HomeLayout(kept, hiddenIds)
    }

    fun encode(): String {
        val cardArray = JSONArray()
        cards.forEach { card ->
            cardArray.put(JSONObject().apply {
                put("id", card.id.key)
                put("size", card.size.key)
                if (card.heading.isNotEmpty()) put("heading", card.heading)
                if (card.tone != HomeCardTone.Standard) put("tone", card.tone.key)
                if (card.period != HomeCardPeriod.Month) put("period", card.period.key)
            })
        }
        val hiddenArray = JSONArray()
        hidden.forEach { hiddenArray.put(it.key) }
        return JSONObject().apply {
            put("version", VERSION)
            put("cards", cardArray)
            put("hidden", hiddenArray)
        }.toString()
    }

    companion object {
        const val VERSION = 1

        /** §3's suggested starting layout, in reading order across the grid. */
        val standard: HomeLayout
            get() = HomeLayout(
                cards = listOf(
                    HomeCardPlacement(HomeCardId.GettingStarted, HomeCardSize.TwoByOne),
                    HomeCardPlacement(HomeCardId.QuickActions, HomeCardSize.OneByOne),
                    HomeCardPlacement(HomeCardId.RecentActivity, HomeCardSize.OneByOne),
                    HomeCardPlacement(HomeCardId.Money, HomeCardSize.OneByOne),
                    HomeCardPlacement(HomeCardId.Banking, HomeCardSize.OneByOne),
                    HomeCardPlacement(HomeCardId.Inventory, HomeCardSize.OneByOne),
                    HomeCardPlacement(HomeCardId.Customers, HomeCardSize.OneByOne),
                    HomeCardPlacement(HomeCardId.OrdersProduction, HomeCardSize.TwoByOne),
                    HomeCardPlacement(HomeCardId.Schedule, HomeCardSize.TwoByOne),
                    HomeCardPlacement(HomeCardId.Files, HomeCardSize.TwoByOne),
                    HomeCardPlacement(HomeCardId.Notes, HomeCardSize.TwoByOne)
                ),
                hidden = emptyList()
            )

        fun decode(json: String): HomeLayout {
            if (json.isBlank()) return standard
            return try {
                val root = JSONObject(json)
                val cards = mutableListOf<HomeCardPlacement>()
                val cardArray = root.optJSONArray("cards") ?: JSONArray()
                for (index in 0 until cardArray.length()) {
                    val entry = cardArray.optJSONObject(index) ?: continue
                    val id = HomeCardId.fromKey(entry.optString("id")) ?: continue
                    cards += HomeCardPlacement(
                        id = id,
                        size = HomeCardSize.fromKey(entry.optString("size"))
                            ?: HomeCards.definition(id)?.defaultSize ?: HomeCardSize.OneByOne,
                        heading = entry.optString("heading", ""),
                        tone = HomeCardTone.fromKey(entry.optString("tone", "default")),
                        period = HomeCardPeriod.fromKey(entry.optString("period", "month"))
                    )
                }
                val hidden = mutableListOf<HomeCardId>()
                val hiddenArray = root.optJSONArray("hidden") ?: JSONArray()
                for (index in 0 until hiddenArray.length()) {
                    HomeCardId.fromKey(hiddenArray.optString(index))?.let { hidden += it }
                }
                HomeLayout(cards, hidden).normalised()
            } catch (_: Exception) {
                // A layout we cannot read is not worth a blank Home screen.
                standard
            }
        }
    }
}

/**
 * Shelf packing: cards keep their order, and one that does not fit the space
 * left on a row starts the next. Compose's LazyVerticalGrid cannot span two
 * rows, and §2 needs 2x2, so the placement is worked out here.
 */
/**
 * Move a card to sit just before another one, or to the end when [beforeId] is
 * null.
 *
 * By id, not by index: the grid draws a FILTERED list — cards this member's
 * role cannot see are not in it — while the layout holds them all, so an index
 * from the grid does not address the same card in the layout.
 */
fun moveCardBefore(layout: HomeLayout, id: HomeCardId, beforeId: HomeCardId?): HomeLayout {
    val cards = layout.cards.toMutableList()
    val from = cards.indexOfFirst { it.id == id }
    if (from < 0 || id == beforeId) return layout
    val moved = cards.removeAt(from)
    val to = if (beforeId == null) cards.size else cards.indexOfFirst { it.id == beforeId }
    cards.add(if (to < 0) cards.size else to, moved)
    return layout.copy(cards = cards)
}

object HomeGridLayout {
    data class Slot(
        val placement: HomeCardPlacement, val row: Int, val column: Int,
        val index: Int = 0, val width: Int = 1, val height: Int = 1
    )

    /** A run of free cells with a card after it, and where a card dropped into it goes. */
    data class Hole(val row: Int, val column: Int, val width: Int, val index: Int)

    data class Packed(val slots: List<Slot>, val holes: List<Hole>, val rows: Int)

    fun slots(
        placements: List<HomeCardPlacement>,
        columnCount: Int,
        rowSpan: (HomeCardPlacement) -> Int = { it.size.rows }
    ): List<Slot> = pack(placements, columnCount, rowSpan).slots

    /**
     * Where the cards land, and where the holes are.
     *
     * The rule is the web grid's own sparse auto-placement, and the one the
     * comment above says this does: a card that does not fit the space left on
     * a row starts the next one, and the cursor never goes backwards. This
     * searched from row 0 for every card instead, which quietly backfilled a
     * hole with a later card — the same layout drew one way here and another in
     * a browser, and a card dragged to the end could land at the top.
     */
    fun pack(
        placements: List<HomeCardPlacement>,
        columnCount: Int,
        rowSpan: (HomeCardPlacement) -> Int = { it.size.rows }
    ): Packed {
        val occupied = HashMap<Int, MutableSet<Int>>()
        val result = mutableListOf<Slot>()
        var cursorRow = 0
        var cursorColumn = 0
        placements.forEachIndexed { index, placement ->
            val width = minOf(placement.size.columns, columnCount)
            val height = rowSpan(placement)
            var row = cursorRow
            var column = cursorColumn
            while (true) {
                if (column + width > columnCount) { row += 1; column = 0; continue }
                val fits = (0 until height).all { rowOffset ->
                    (0 until width).all { columnOffset ->
                        occupied[row + rowOffset]?.contains(column + columnOffset) != true
                    }
                }
                if (fits) break
                column += 1
            }
            for (rowOffset in 0 until height) {
                for (columnOffset in 0 until width) {
                    occupied.getOrPut(row + rowOffset) { mutableSetOf() }.add(column + columnOffset)
                }
            }
            result += Slot(placement, row, column, index, width, height)
            cursorRow = row
            cursorColumn = column + width
        }

        val rows = result.maxOfOrNull { it.row + it.height } ?: 0
        // A free cell is only a hole if something comes after it: the space at
        // the end of the last row is where the list stops, not a gap in it.
        var lastCell = -1
        for (slot in result) {
            val cell = (slot.row + slot.height - 1) * columnCount + slot.column + slot.width - 1
            if (cell > lastCell) lastCell = cell
        }
        val holes = mutableListOf<Hole>()
        for (row in 0 until rows) {
            var column = 0
            while (column < columnCount) {
                val taken = occupied[row]?.contains(column) == true
                if (taken || row * columnCount + column > lastCell) { column += 1; continue }
                var width = 0
                while (column + width < columnCount &&
                    occupied[row]?.contains(column + width) != true &&
                    row * columnCount + column + width <= lastCell
                ) width += 1
                val after = result.firstOrNull { it.row > row || (it.row == row && it.column >= column + width) }
                holes += Hole(row, column, width, after?.index ?: placements.size)
                column += width
            }
        }
        return Packed(result, holes, rows)
    }

    fun rowCount(
        placements: List<HomeCardPlacement>,
        columnCount: Int,
        rowSpan: (HomeCardPlacement) -> Int = { it.size.rows }
    ): Int = slots(placements, columnCount, rowSpan).maxOfOrNull { it.row + rowSpan(it.placement) } ?: 0
}
