package uk.co.eggcraft.studioflow.widgets

import android.content.Context
import android.os.Build
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalSize
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.background
import androidx.glance.currentState
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.state.GlanceStateDefinition
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import org.json.JSONObject
import uk.co.eggcraft.studioflow.MainActivity
import uk.co.eggcraft.studioflow.R
import uk.co.eggcraft.studioflow.ui.theme.StudioGreen
import uk.co.eggcraft.studioflow.ui.theme.StudioRed
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import kotlin.math.abs

// NivaDesk home-screen widgets (Jetpack Glance) — the Android counterparts of
// the WidgetKit widgets in NivaDeskWidgets/NivaDeskWidgets.swift:
//   • Net Profit   — week/month/year figure with trend and period Pending
//   • Monthly Net Profit — recent months listed newest first
//   • Deliveries   — late / due today / due this week counters
// They render only the pre-computed summary WidgetSummaryBridge stores in
// SharedPreferences; no Firebase runs outside the app process.

// MARK: - Payload (mirrors the Apple WidgetSummaryPayload JSON)

data class WidgetPeriodSummary(
    val value: Double,
    val previousValue: Double,
    val series: List<Double>,
    val pending: Double,
)

data class WidgetSummaryPayload(
    val week: WidgetPeriodSummary,
    val month: WidgetPeriodSummary,
    val year: WidgetPeriodSummary,
    val monthLabels: List<String>,
    val dueTodayCount: Int,
    val lateCount: Int,
    val dueThisWeekCount: Int,
    val currencySymbol: String,
    val decimalSeparator: String,
    val hideNumbers: Boolean,
    val labels: Map<String, String>,
) {
    fun label(key: String, fallback: String): String =
        labels[key]?.takeIf { it.isNotBlank() } ?: fallback

    fun summary(period: String): WidgetPeriodSummary = when (period) {
        "week" -> week
        "year" -> year
        else -> month
    }

    fun periodLabel(period: String): String = when (period) {
        "week" -> label("week", "This Week")
        "year" -> label("year", "This Year")
        else -> label("month", "This Month")
    }

    // Same formatting as the dashboard's money(): currency + %,.2f with the
    // workspace decimal separator; compact "£12.4k" once amounts get long.
    fun money(value: Double, compact: Boolean = false): String {
        if (hideNumbers) return "$currencySymbol••••"
        val formatted = if (compact && abs(value) >= 10_000) {
            val thousands = abs(value) / 1000.0
            val body = if (thousands >= 100) {
                String.format(Locale.UK, "%.0f", thousands)
            } else {
                String.format(Locale.UK, "%.1f", thousands).removeSuffix(".0")
            }
            (if (value < 0) "-" else "") + body + "k"
        } else {
            String.format(Locale.UK, "%,.2f", value)
        }
        val localized = if (decimalSeparator == ",") {
            formatted.replace(",", "_").replace(".", ",").replace("_", ".")
        } else {
            formatted
        }
        return currencySymbol + localized
    }

    companion object {
        fun load(context: Context): WidgetSummaryPayload {
            val raw = context.getSharedPreferences(WidgetSummaryBridge.PREFS_NAME, Context.MODE_PRIVATE)
                .getString(WidgetSummaryBridge.PAYLOAD_KEY, null)
                ?: return placeholder()
            return runCatching { parse(JSONObject(raw)) }.getOrElse { placeholder() }
        }

        private fun parse(json: JSONObject): WidgetSummaryPayload {
            val labelsJson = json.optJSONObject("labels")
            val labels = buildMap {
                labelsJson?.keys()?.forEach { key -> put(key, labelsJson.optString(key)) }
            }
            val monthLabelsJson = json.optJSONArray("monthLabels")
            return WidgetSummaryPayload(
                week = parsePeriod(json.getJSONObject("week")),
                month = parsePeriod(json.getJSONObject("month")),
                year = parsePeriod(json.getJSONObject("year")),
                monthLabels = (0 until (monthLabelsJson?.length() ?: 0)).map { monthLabelsJson!!.optString(it) },
                dueTodayCount = json.optInt("dueTodayCount"),
                lateCount = json.optInt("lateCount"),
                dueThisWeekCount = json.optInt("dueThisWeekCount"),
                currencySymbol = json.optString("currencySymbol", "£"),
                decimalSeparator = json.optString("decimalSeparator", "."),
                hideNumbers = json.optBoolean("hideNumbers", false),
                labels = labels,
            )
        }

        private fun parsePeriod(json: JSONObject): WidgetPeriodSummary {
            val seriesJson = json.optJSONArray("series")
            return WidgetPeriodSummary(
                value = json.optDouble("value", 0.0),
                previousValue = json.optDouble("previousValue", 0.0),
                series = (0 until (seriesJson?.length() ?: 0)).map { seriesJson!!.optDouble(it, 0.0) },
                pending = json.optDouble("pending", 0.0),
            )
        }

        // Sample figures shown in the widget picker and before the app has
        // published a real summary (same spirit as the Apple placeholder).
        private fun placeholder(): WidgetSummaryPayload {
            val locale = Locale.getDefault()
            val formatter = SimpleDateFormat("LLLL yyyy", locale)
            val monthLabels = (11 downTo 0).map { offset ->
                val cal = Calendar.getInstance().apply { add(Calendar.MONTH, -offset) }
                formatter.format(cal.time).replaceFirstChar { it.titlecase(locale) }
            }
            return WidgetSummaryPayload(
                week = WidgetPeriodSummary(1240.0, 980.0, listOf(640.0, 720.0, 810.0, 590.0, 930.0, 1105.0, 980.0, 1240.0), 350.0),
                month = WidgetPeriodSummary(4250.0, 3120.0, listOf(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1650.0, 2210.0, 1890.0, 2840.0, 3120.0, 4250.0), 850.0),
                year = WidgetPeriodSummary(38200.0, 31500.0, listOf(9800.0, 14600.0, 22400.0, 31500.0, 38200.0), 2865.0),
                monthLabels = monthLabels,
                dueTodayCount = 1,
                lateCount = 2,
                dueThisWeekCount = 4,
                currencySymbol = "£",
                decimalSeparator = ".",
                hideNumbers = false,
                labels = emptyMap(),
            )
        }
    }
}

// MARK: - Shared look

private fun dayNight(day: Color, night: Color): ColorProvider =
    androidx.glance.color.ColorProvider(day = day, night = night)

private fun solid(color: Color): ColorProvider =
    androidx.glance.unit.ColorProvider(color)

private val WidgetBackground = dayNight(Color.White, Color(0xFF1B1B1E))
private val TextPrimary = dayNight(Color(0xFF17181C), Color(0xFFF2F2F7))
private val TextSecondary = dayNight(Color(0x8A000000), Color(0x99FFFFFF))
private val ChipBackground = dayNight(Color(0x14000000), Color(0x24FFFFFF))
private val AccentBlue = dayNight(Color(0xFF3B82F6), Color(0xFF60A5FA))
private val ProfitGreen = solid(StudioGreen)
private val LossRed = solid(StudioRed)
private val PendingOrange = solid(Color(0xFFFF9500))

// cornerRadius is only supported from Android 12; earlier launchers just get
// square corners rather than a crash.
private fun GlanceModifier.rounded(radius: Dp): GlanceModifier =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) cornerRadius(radius) else this

@Composable
private fun WidgetShell(content: @Composable () -> Unit) {
    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .appWidgetBackground()
            .background(WidgetBackground)
            .rounded(16.dp)
            .padding(14.dp)
            .clickable(actionStartActivity<MainActivity>())
    ) { content() }
}

// Tiny app-icon chip in the widget corner so it's obvious which app owns it.
@Composable
private fun WidgetLogoBadge() {
    Image(
        provider = ImageProvider(R.drawable.nivadesk_widget_logo),
        contentDescription = null,
        modifier = GlanceModifier.size(14.dp).rounded(4.dp),
    )
}

// MARK: - Net Profit widget (period switchable via the W/M/Y chips)

class NetProfitWidget : GlanceAppWidget() {
    companion object {
        val PeriodKey = stringPreferencesKey("netProfitPeriod")
        private val SMALL = DpSize(180.dp, 110.dp)
        private val WIDE = DpSize(250.dp, 110.dp)
    }

    override val stateDefinition: GlanceStateDefinition<*> = PreferencesGlanceStateDefinition
    override val sizeMode: SizeMode = SizeMode.Responsive(setOf(SMALL, WIDE))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val payload = WidgetSummaryPayload.load(context)
        provideContent {
            val period = currentState<Preferences>()[PeriodKey] ?: "month"
            NetProfitContent(payload, period)
        }
    }
}

@Composable
private fun NetProfitContent(payload: WidgetSummaryPayload, period: String) {
    val summary = payload.summary(period)
    val wide = LocalSize.current.width >= 240.dp
    WidgetShell {
        Column(modifier = GlanceModifier.fillMaxSize()) {
            Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    payload.periodLabel(period),
                    style = TextStyle(color = TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Medium),
                    maxLines = 1,
                )
                Spacer(modifier = GlanceModifier.defaultWeight())
                TrendBadge(summary)
                Spacer(modifier = GlanceModifier.width(5.dp))
                WidgetLogoBadge()
            }
            Spacer(modifier = GlanceModifier.height(2.dp))
            Text(
                payload.money(summary.value, compact = !wide),
                style = TextStyle(color = TextPrimary, fontSize = 26.sp, fontWeight = FontWeight.Bold),
                maxLines = 1,
            )
            Text(
                payload.label("netProfit", "Net Profit"),
                style = TextStyle(color = TextSecondary, fontSize = 11.sp),
                maxLines = 1,
            )
            Spacer(modifier = GlanceModifier.defaultWeight())
            Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                PeriodChip("W", "week", period)
                Spacer(modifier = GlanceModifier.width(4.dp))
                PeriodChip("M", "month", period)
                Spacer(modifier = GlanceModifier.width(4.dp))
                PeriodChip("Y", "year", period)
                if (wide) {
                    Spacer(modifier = GlanceModifier.defaultWeight())
                    Text(
                        "${payload.label("pending", "Pending")} · ${payload.money(summary.pending, compact = true)}",
                        style = TextStyle(color = PendingOrange, fontSize = 11.sp, fontWeight = FontWeight.Medium),
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

@Composable
private fun TrendBadge(summary: WidgetPeriodSummary) {
    val previous = summary.previousValue
    if (previous == 0.0) return
    val percent = (summary.value - previous) / abs(previous) * 100.0
    val up = percent >= 0
    Text(
        (if (up) "▲ " else "▼ ") + String.format(Locale.UK, "%.0f", abs(percent)) + "%",
        style = TextStyle(color = if (up) ProfitGreen else LossRed, fontSize = 11.sp, fontWeight = FontWeight.Bold),
        maxLines = 1,
    )
}

@Composable
private fun PeriodChip(text: String, value: String, current: String) {
    val selected = value == current
    Text(
        text,
        style = TextStyle(
            color = if (selected) solid(Color.White) else TextSecondary,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
        ),
        modifier = GlanceModifier
            .background(if (selected) AccentBlue else ChipBackground)
            .rounded(8.dp)
            .padding(horizontal = 7.dp, vertical = 3.dp)
            .clickable(
                actionRunCallback<SetNetProfitPeriodAction>(
                    actionParametersOf(SetNetProfitPeriodAction.PeriodParam to value)
                )
            ),
    )
}

class SetNetProfitPeriodAction : ActionCallback {
    companion object {
        val PeriodParam = ActionParameters.Key<String>("period")
    }

    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val period = parameters[PeriodParam] ?: "month"
        updateAppWidgetState(context, glanceId) { prefs -> prefs[NetProfitWidget.PeriodKey] = period }
        NetProfitWidget().update(context, glanceId)
    }
}

class NetProfitWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = NetProfitWidget()
}

// MARK: - Monthly Net Profit widget (newest month first)

class MonthlyProfitWidget : GlanceAppWidget() {
    companion object {
        private val MEDIUM = DpSize(250.dp, 110.dp)
        private val TALL = DpSize(250.dp, 250.dp)
    }

    override val sizeMode: SizeMode = SizeMode.Responsive(setOf(MEDIUM, TALL))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val payload = WidgetSummaryPayload.load(context)
        provideContent { MonthlyProfitContent(payload) }
    }
}

@Composable
private fun MonthlyProfitContent(payload: WidgetSummaryPayload) {
    val rows = if (LocalSize.current.height >= 200.dp) 8 else 3
    val entries = payload.monthLabels.zip(payload.month.series).takeLast(rows).reversed()
    WidgetShell {
        Column(modifier = GlanceModifier.fillMaxSize()) {
            Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    payload.label("netProfit", "Net Profit"),
                    style = TextStyle(color = TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Medium),
                    maxLines = 1,
                )
                Spacer(modifier = GlanceModifier.defaultWeight())
                WidgetLogoBadge()
            }
            entries.forEachIndexed { index, (label, value) ->
                Spacer(modifier = GlanceModifier.defaultWeight())
                Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        label,
                        style = TextStyle(
                            color = if (index == 0) TextPrimary else TextSecondary,
                            fontSize = 12.sp,
                            fontWeight = if (index == 0) FontWeight.Bold else FontWeight.Normal,
                        ),
                        maxLines = 1,
                    )
                    Spacer(modifier = GlanceModifier.defaultWeight())
                    Text(
                        payload.money(value, compact = true),
                        style = TextStyle(
                            color = if (value >= 0) ProfitGreen else LossRed,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                        ),
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

class MonthlyProfitWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = MonthlyProfitWidget()
}

// MARK: - Deliveries widget

class DeliveriesWidget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Single

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val payload = WidgetSummaryPayload.load(context)
        provideContent { DeliveriesContent(payload) }
    }
}

@Composable
private fun DeliveriesContent(payload: WidgetSummaryPayload) {
    WidgetShell {
        Column(modifier = GlanceModifier.fillMaxSize()) {
            Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    payload.label("deliveries", "Deliveries"),
                    style = TextStyle(color = TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Medium),
                    maxLines = 1,
                )
                Spacer(modifier = GlanceModifier.defaultWeight())
                WidgetLogoBadge()
            }
            Spacer(modifier = GlanceModifier.defaultWeight())
            DeliveryRow(payload.lateCount, payload.label("late", "Late"), LossRed)
            Spacer(modifier = GlanceModifier.defaultWeight())
            DeliveryRow(payload.dueTodayCount, payload.label("dueToday", "Due today"), PendingOrange)
            Spacer(modifier = GlanceModifier.defaultWeight())
            DeliveryRow(payload.dueThisWeekCount, payload.label("thisWeek", "This Week"), ProfitGreen)
        }
    }
}

@Composable
private fun DeliveryRow(count: Int, label: String, tint: ColorProvider) {
    Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text("●", style = TextStyle(color = tint, fontSize = 9.sp))
        Spacer(modifier = GlanceModifier.width(6.dp))
        Text(label, style = TextStyle(color = TextSecondary, fontSize = 12.sp), maxLines = 1)
        Spacer(modifier = GlanceModifier.defaultWeight())
        Text(count.toString(), style = TextStyle(color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.Bold))
    }
}

class DeliveriesWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = DeliveriesWidget()
}
