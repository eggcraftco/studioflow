package uk.co.eggcraft.studioflow.widgets

import android.content.Context
import androidx.glance.appwidget.updateAll
import org.json.JSONArray
import org.json.JSONObject
import uk.co.eggcraft.studioflow.data.model.StudioOrder
import uk.co.eggcraft.studioflow.data.model.StudioWorkspaceSettings
import uk.co.eggcraft.studioflow.features.dashboard.adjustedDashboardNetProfit
import uk.co.eggcraft.studioflow.language.studioLocale
import uk.co.eggcraft.studioflow.language.studioT
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date

// Android side of the NivaDesk widget data bridge — the exact counterpart of
// EGGcraft/WidgetSummaryBridge.swift on iOS/macOS. The Glance widgets render
// ONLY what is written here (no Firebase, no account context): the app
// recomputes this summary whenever the order list or workspace settings
// change, stores it as JSON in app-private SharedPreferences, then asks
// Glance to refresh every placed widget. The JSON shape mirrors the Apple
// payload so the three platforms stay easy to diff.
object WidgetSummaryBridge {
    const val PREFS_NAME = "nivadesk_widget_summary"
    const val PAYLOAD_KEY = "payloadV1"
    const val NOTES_PAYLOAD_KEY = "notesPayloadV1"

    // Snapshot of the user's Keep notes for the home-screen Notes widget —
    // counterpart of WidgetNotesBridge in EGGcraft/WidgetSummaryBridge.swift.
    // Published whenever the notes flow delivers data; blanked on sign-out.
    suspend fun publishNotes(
        context: Context,
        notes: List<uk.co.eggcraft.studioflow.data.model.StudioKeepNote>,
        settings: StudioWorkspaceSettings
    ) {
        val lang = settings.selectedLanguage.ifBlank { "English" }
        val visible = notes
            .filter { !it.isDeleted && !it.isArchived }
            .sortedWith(
                compareByDescending<uk.co.eggcraft.studioflow.data.model.StudioKeepNote> { it.isPinned }
                    .thenByDescending { it.manualOrder }
                    .thenByDescending { it.updatedAt?.time ?: 0L }
            )
            .take(12)

        val notesJson = JSONArray()
        visible.forEach { note ->
            notesJson.put(
                JSONObject().apply {
                    put("id", note.id)
                    put("title", note.title)
                    put("text", note.text)
                    put("colorName", note.colorName)
                    put("isPinned", note.isPinned)
                }
            )
        }
        val payload = JSONObject().apply {
            put("notes", notesJson)
            put("heading", studioT("Notes", lang))
            put("emptyText", studioT("Notes you add appear here", lang))
        }

        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(NOTES_PAYLOAD_KEY, payload.toString())
            .apply()

        NotesWidget().updateAll(context)
    }

    // StudioFlowMainScreen's header prefs — where the eye toggle persists.
    private const val HEADER_PREFS_NAME = "studioflow_header"
    private const val HIDE_NUMBERS_KEY = "hideSensitiveNumbers"

    suspend fun publish(context: Context, orders: List<StudioOrder>, settings: StudioWorkspaceSettings) {
        val lang = settings.selectedLanguage.ifBlank { "English" }
        val active = orders.filter { !it.isDeleted }
        // Cancelled/refunded orders earn nothing and owe nothing: the money
        // buckets (profit, pending) run on counting orders only, matching the
        // dashboard's aggregates. Delivery counters keep the full active list.
        val counting = active.filter { it.countsTowardBalance }
        val hideNumbers = context.getSharedPreferences(HEADER_PREFS_NAME, Context.MODE_PRIVATE)
            .getBoolean(HIDE_NUMBERS_KEY, false)

        // Same per-order profit the dashboard aggregates — including the base
        // cost gate: hidden base cost is not deducted from Net Profit.
        fun profit(order: StudioOrder): Double =
            adjustedDashboardNetProfit(order, settings.financialExpenseItems, settings.financialShowBaseCost)

        // Same formula as the dashboard's Pending card.
        fun pending(order: StudioOrder): Double =
            order.remainingAmount + order.customRemainingTotal

        // Sum for orders whose paymentDate falls in the same calendar bucket as
        // now shifted back by `offset` periods.
        fun bucketTotal(field: Int, offset: Int, amount: (StudioOrder) -> Double): Double {
            val anchor = Calendar.getInstance().apply { add(field, -offset) }
            val cal = Calendar.getInstance()
            return counting.sumOf { order ->
                cal.time = order.paymentDate
                val match = when (field) {
                    Calendar.WEEK_OF_YEAR ->
                        cal.get(Calendar.YEAR) == anchor.get(Calendar.YEAR) &&
                            cal.get(Calendar.WEEK_OF_YEAR) == anchor.get(Calendar.WEEK_OF_YEAR)
                    Calendar.MONTH ->
                        cal.get(Calendar.YEAR) == anchor.get(Calendar.YEAR) &&
                            cal.get(Calendar.MONTH) == anchor.get(Calendar.MONTH)
                    else -> cal.get(Calendar.YEAR) == anchor.get(Calendar.YEAR)
                }
                if (match) amount(order) else 0.0
            }
        }

        fun periodJson(field: Int, seriesLength: Int): JSONObject = JSONObject().apply {
            put("value", bucketTotal(field, 0, ::profit))
            put("previousValue", bucketTotal(field, 1, ::profit))
            put("series", JSONArray((seriesLength - 1 downTo 0).map { bucketTotal(field, it, ::profit) }))
            put("pending", bucketTotal(field, 0, ::pending))
        }

        // Delivery counters — same rules as the orders-list badge.
        var dueToday = 0
        var late = 0
        var dueThisWeek = 0
        for (order in active) {
            if (order.status == "Done" || order.status == "Cancelled" || order.isDispatched) continue
            val days = order.remainingDays
            if (days < 0) late++
            if (days == 0) dueToday++
            if (days in 0..7) dueThisWeek++
        }

        // Month names in the app's language, aligned with month.series
        // (oldest → newest) for the Monthly Net Profit widget.
        val locale = studioLocale(lang)
        val monthFormatter = SimpleDateFormat("LLLL yyyy", locale)
        val monthLabels = (11 downTo 0).map { offset ->
            val cal = Calendar.getInstance().apply { add(Calendar.MONTH, -offset) }
            monthFormatter.format(cal.time).replaceFirstChar { it.titlecase(locale) }
        }

        val labels = JSONObject().apply {
            put("netProfit", studioT("Net Profit", lang))
            put("week", studioT("This Week", lang))
            put("month", studioT("This Month", lang))
            put("year", studioT("This Year", lang))
            put("pending", studioT("Pending", lang))
            put("dueToday", studioT("Due today", lang))
            put("late", studioT("Late", lang))
            put("thisWeek", studioT("This Week", lang))
            put("deliveries", studioT("Deliveries", lang))
        }

        val payload = JSONObject().apply {
            put("week", periodJson(Calendar.WEEK_OF_YEAR, 8))
            put("month", periodJson(Calendar.MONTH, 12))
            put("year", periodJson(Calendar.YEAR, 5))
            put("monthLabels", JSONArray(monthLabels))
            put("dueTodayCount", dueToday)
            put("lateCount", late)
            put("dueThisWeekCount", dueThisWeek)
            put("currencySymbol", settings.selectedCurrency.ifBlank { "£" })
            put("decimalSeparator", settings.selectedDecimalSeparator.ifBlank { "." })
            put("hideNumbers", hideNumbers)
            put("labels", labels)
            put("updatedAt", Date().time)
        }

        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(PAYLOAD_KEY, payload.toString())
            .apply()

        NetProfitWidget().updateAll(context)
        MonthlyProfitWidget().updateAll(context)
        DeliveriesWidget().updateAll(context)
    }
}
