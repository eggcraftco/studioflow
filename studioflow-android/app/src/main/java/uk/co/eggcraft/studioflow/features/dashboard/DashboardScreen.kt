package uk.co.eggcraft.studioflow.features.dashboard

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CompareArrows
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Done
import androidx.compose.material.icons.automirrored.filled.FormatListBulleted
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Percent
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.Divider
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import uk.co.eggcraft.studioflow.data.model.StudioHeadingItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Calendar
import java.util.Date
import java.util.Locale
import uk.co.eggcraft.studioflow.data.model.StudioOrder
import uk.co.eggcraft.studioflow.data.model.StudioWorkspaceSettings
import uk.co.eggcraft.studioflow.features.shell.LocalHideSensitiveNumbers
import uk.co.eggcraft.studioflow.features.shell.StudioFlowUiState
import uk.co.eggcraft.studioflow.features.shell.privateCurrencyText
import uk.co.eggcraft.studioflow.ui.theme.StudioBlue
import uk.co.eggcraft.studioflow.ui.theme.StudioGreen
import uk.co.eggcraft.studioflow.ui.theme.StudioRed
import uk.co.eggcraft.studioflow.ui.theme.StudioWarningOrange

@Composable
fun DashboardScreen(
    state: StudioFlowUiState,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit = { _, _ -> }
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var period by rememberSaveable { mutableStateOf(DashboardPeriod.Year) }
    var compareMode by rememberSaveable { mutableStateOf(DashboardCompareMode.None) }
    var periodMenuOpen by rememberSaveable { mutableStateOf(false) }
    var dashboardOptionsOpen by rememberSaveable { mutableStateOf(false) }
    val stats = remember(state.orders, period) { DashboardStats.from(state.orders, period) }
    val currency = state.workspaceSettings.selectedCurrency.ifBlank { "£" }
    val decimalSeparator = state.workspaceSettings.selectedDecimalSeparator
    val hideSensitiveNumbers = LocalHideSensitiveNumbers.current
    val widgetVisibility = DashboardWidgetVisibility.from(state.workspaceSettings)
    val compareEnabled = compareMode != DashboardCompareMode.None && period.supportsYearCompare
    val summaryCards = remember(stats, currency, decimalSeparator, widgetVisibility, hideSensitiveNumbers) {
        dashboardSummaryCards(stats, currency, decimalSeparator, widgetVisibility, hideSensitiveNumbers)
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Surface(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                shape = RoundedCornerShape(14.dp),
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 1.dp
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(t("Dashboard"), fontSize = 24.sp, fontWeight = FontWeight.ExtraBold)
                            Text(period.label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
                        }
                        Box {
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = StudioBlue.copy(alpha = 0.12f),
                                onClick = { dashboardOptionsOpen = true }
                            ) {
                                Icon(Icons.Filled.Tune, contentDescription = "Dashboard controls", tint = StudioBlue, modifier = Modifier.padding(13.dp))
                            }
                            DashboardOptionsMenu(
                                expanded = dashboardOptionsOpen,
                                selectedPeriod = period,
                                compareMode = compareMode,
                                widgetVisibility = widgetVisibility,
                                onDismiss = { dashboardOptionsOpen = false },
                                onPeriodSelected = {
                                    period = it
                                    dashboardOptionsOpen = false
                                },
                                onCompareSelected = {
                                    compareMode = it
                                    dashboardOptionsOpen = false
                                },
                                onToggleWidget = { widget ->
                                    val next = widgetVisibility.toggled(widget)
                                    onUpdateWorkspaceSettings(next.toPayload(), "${widget.label} visibility saved.")
                                }
                            )
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(modifier = Modifier.weight(1f)) {
                            FilterChipLike(
                                icon = Icons.Filled.DateRange,
                                label = period.label,
                                modifier = Modifier.fillMaxWidth(),
                                trailingIcon = Icons.Filled.KeyboardArrowDown,
                                onClick = { periodMenuOpen = true }
                            )
                            DashboardPeriodMenu(
                                expanded = periodMenuOpen,
                                selectedPeriod = period,
                                onDismiss = { periodMenuOpen = false },
                                onPeriodSelected = {
                                    period = it
                                    periodMenuOpen = false
                                }
                            )
                        }
                        FilterChipLike(
                            icon = Icons.Filled.CompareArrows,
                            label = compareMode.label,
                            modifier = Modifier.weight(1f),
                            onClick = {
                                compareMode = when (compareMode) {
                                    DashboardCompareMode.None -> DashboardCompareMode.OneYear
                                    DashboardCompareMode.OneYear -> DashboardCompareMode.ThreeYears
                                    DashboardCompareMode.ThreeYears -> DashboardCompareMode.None
                                }
                            }
                        )
                    }
                    if (compareMode != DashboardCompareMode.None && !period.supportsYearCompare) {
                        Text(
                            "1Y / 3Y compare is available for Month and Year views.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 12.sp
                        )
                    }
                    Text(
                        text = "${stats.orderCount} orders in view · ${stats.lateCount} late · ${stats.readyToShipCount} ready to ship",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 13.sp
                    )
                }
            }
        }
        item {
            SummaryTileGrid(
                cards = summaryCards,
                modifier = Modifier.padding(horizontal = 16.dp)
            )
        }
        item {
            ExtraSpendingSummarySection(
                orders = state.orders,
                workspaceSettings = state.workspaceSettings,
                currency = currency,
                decimalSeparator = decimalSeparator,
                hideNumbers = hideSensitiveNumbers,
                modifier = Modifier.padding(horizontal = 16.dp)
            )
        }
        item {
            Surface(
                modifier = Modifier.padding(horizontal = 16.dp),
                shape = RoundedCornerShape(14.dp),
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 1.dp
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(t("Net Profit Analysis"), fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                    ProfitLineChart(
                        values = stats.chartValues,
                        labels = stats.chartLabels,
                        axisLabels = stats.chartAxisLabels,
                        comparisonSeries = if (compareEnabled) stats.comparisonSeries(compareMode) else emptyList()
                    )
                }
            }
        }
        item {
            Surface(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                shape = RoundedCornerShape(14.dp),
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 1.dp
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(t("Year-over-Year Summary"), fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp))
                            .padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(t("This Year"), modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
                        Text(money(stats.thisYearNetProfit, currency, decimalSeparator, hideSensitiveNumbers), fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                    }
                    SummaryRow(t("Last Year"), money(stats.lastYearNetProfit, currency, decimalSeparator, hideSensitiveNumbers))
                    SummaryRow(t("Growth"), growthLabel(stats.thisYearNetProfit, stats.lastYearNetProfit))
                    if (compareEnabled) {
                        stats.comparisonSeries(compareMode).forEach { series ->
                            SummaryRow(series.label, money(series.total, currency, decimalSeparator, hideSensitiveNumbers))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DashboardPeriodMenu(
    expanded: Boolean,
    selectedPeriod: DashboardPeriod,
    onDismiss: () -> Unit,
    onPeriodSelected: (DashboardPeriod) -> Unit
) {
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        DashboardPeriod.values().forEach { item ->
            DropdownMenuItem(
                text = { Text(item.label, fontWeight = FontWeight.Bold) },
                leadingIcon = {
                    if (item == selectedPeriod) {
                        Icon(Icons.Filled.Done, contentDescription = null, tint = StudioBlue)
                    }
                },
                onClick = { onPeriodSelected(item) }
            )
        }
    }
}

@Composable
private fun DashboardOptionsMenu(
    expanded: Boolean,
    selectedPeriod: DashboardPeriod,
    compareMode: DashboardCompareMode,
    widgetVisibility: DashboardWidgetVisibility,
    onDismiss: () -> Unit,
    onPeriodSelected: (DashboardPeriod) -> Unit,
    onCompareSelected: (DashboardCompareMode) -> Unit,
    onToggleWidget: (DashboardWidget) -> Unit
) {
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        DropdownMenuItem(
            text = { Text("Time range", color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold) },
            enabled = false,
            onClick = {}
        )
        DashboardPeriod.values().forEach { item ->
            DropdownMenuItem(
                text = { Text(item.label, fontWeight = FontWeight.Bold) },
                leadingIcon = {
                    Icon(
                        if (item == selectedPeriod) Icons.Filled.Done else Icons.Filled.DateRange,
                        contentDescription = null,
                        tint = if (item == selectedPeriod) StudioBlue else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                },
                onClick = { onPeriodSelected(item) }
            )
        }
        DropdownMenuItem(
            text = { Text("Compare", color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold) },
            enabled = false,
            onClick = {}
        )
        DashboardCompareMode.values().forEach { item ->
            DropdownMenuItem(
                text = { Text(item.label, fontWeight = FontWeight.Bold) },
                leadingIcon = {
                    Icon(
                        if (item == compareMode) Icons.Filled.Done else Icons.Filled.CompareArrows,
                        contentDescription = null,
                        tint = if (item == compareMode) StudioBlue else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                },
                onClick = { onCompareSelected(item) }
            )
        }
        DropdownMenuItem(
            text = { Text("Dashboard cards", color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold) },
            enabled = false,
            onClick = {}
        )
        DashboardWidget.values().forEach { widget ->
            val visible = widgetVisibility.isVisible(widget)
            DropdownMenuItem(
                text = { Text(widget.label, fontWeight = FontWeight.Bold) },
                leadingIcon = {
                    Icon(
                        if (visible) Icons.Filled.Done else Icons.Filled.RadioButtonUnchecked,
                        contentDescription = null,
                        tint = if (visible) widget.color else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                },
                onClick = { onToggleWidget(widget) }
            )
        }
    }
}

@Composable
private fun FilterChipLike(
    icon: ImageVector,
    label: String,
    modifier: Modifier = Modifier,
    trailingIcon: ImageVector? = null,
    onClick: () -> Unit
) {
    Surface(modifier = modifier, shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.surfaceVariant, onClick = onClick) {
        Row(modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface)
            Spacer(modifier = Modifier.width(10.dp))
            Text(label, modifier = Modifier.weight(1f), fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
            if (trailingIcon != null) {
                Icon(trailingIcon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun SummaryRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp))
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
        Text(value, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
    }
}

@Composable
private fun SummaryTileGrid(cards: List<DashboardSummaryCardSpec>, modifier: Modifier = Modifier) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    BoxWithConstraints(modifier = modifier.fillMaxWidth()) {
        val columnCount = when {
            maxWidth >= 1120.dp -> 4
            maxWidth >= 740.dp -> 3
            else -> 2
        }
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            cards.chunked(columnCount).forEach { rowCards ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    rowCards.forEach { card ->
                        SummaryTile(
                            title = t(card.title),
                            value = card.value,
                            prefix = card.prefix,
                            color = card.color,
                            modifier = Modifier.weight(1f),
                            icon = card.icon
                        )
                    }
                    repeat(columnCount - rowCards.size) {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun SummaryTile(
    title: String,
    value: String,
    prefix: String,
    color: Color,
    modifier: Modifier,
    icon: ImageVector? = null
) {
    Surface(modifier = modifier, shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surface, tonalElevation = 1.dp) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (icon != null) Icon(icon, contentDescription = null, tint = color) else Text(prefix, color = color, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                Text(title, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.ExtraBold)
            }
            Text(value, fontSize = 21.sp, fontWeight = FontWeight.ExtraBold)
        }
    }
}

@Composable
private fun ProfitLineChart(
    values: List<Double>,
    labels: List<String>,
    axisLabels: List<String>,
    comparisonSeries: List<DashboardComparisonSeries>
) {
    val lineColor = StudioGreen
    val allSeries = listOf(values) + comparisonSeries.map { it.values }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(250.dp)
        ) {
            val allValues = allSeries.flatten()
            val maxValue = maxOf(100.0, allValues.maxOrNull() ?: 0.0)
            val minValue = minOf(0.0, allValues.minOrNull() ?: 0.0)
            val valueRange = (maxValue - minValue).takeIf { it > 0.0 } ?: 1.0
            val left = 22f
            val right = size.width - 16f
            val top = 10f
            val bottom = size.height - 28f
            val width = right - left
            val height = bottom - top
            val pointDenominator = (values.size - 1).coerceAtLeast(1).toFloat()

            repeat(4) { index ->
                val y = top + (height / 3f) * index
                drawLine(Color(0xFFE7E7E7), Offset(left, y), Offset(right, y), strokeWidth = 1.2f)
            }
            repeat(5) { index ->
                val x = left + (width / 4f) * index
                drawLine(Color(0xFFEDEDED), Offset(x, top), Offset(x, bottom), strokeWidth = 1.2f)
            }

            fun drawSeries(seriesValues: List<Double>, color: Color, strokeWidth: Float, pointRadius: Float) {
                if (seriesValues.isEmpty()) return
                val points = seriesValues.mapIndexed { index, value ->
                    val x = left + width * (index / pointDenominator)
                    val normalized = ((value - minValue) / valueRange).toFloat()
                    val y = bottom - (height * normalized)
                    Offset(x, y)
                }
                val path = Path()
                points.forEachIndexed { index, point ->
                    if (index == 0) path.moveTo(point.x, point.y) else path.lineTo(point.x, point.y)
                }
                drawPath(path, color, style = Stroke(width = strokeWidth, cap = StrokeCap.Round))
                points.forEach { point -> drawCircle(color, radius = pointRadius, center = point) }
            }

            comparisonSeries.forEach { series -> drawSeries(series.values, series.color, 3f, 5f) }
            drawSeries(values, lineColor, 5f, 8f)
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            axisLabels.ifEmpty { labels.take(5) }.forEach {
                Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            ChartLegendDot("Current", StudioGreen)
            comparisonSeries.forEach { ChartLegendDot(it.label, it.color) }
        }
    }
}

@Composable
private fun ChartLegendDot(label: String, color: Color) {
    Row(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .width(9.dp)
                .height(9.dp)
                .background(color, RoundedCornerShape(99.dp))
        )
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

private data class DashboardStats(
    val revenue: Double,
    val pending: Double,
    val baseCost: Double,
    val platformFee: Double,
    val shipping: Double,
    val tax: Double,
    val netProfit: Double,
    val chartValues: List<Double>,
    val chartLabels: List<String>,
    val chartAxisLabels: List<String>,
    val previousOneYearValues: List<Double>,
    val previousTwoYearValues: List<Double>,
    val previousThreeYearValues: List<Double>,
    val previousOneYearNetProfit: Double?,
    val previousTwoYearNetProfit: Double?,
    val previousThreeYearNetProfit: Double?,
    val thisYearNetProfit: Double,
    val lastYearNetProfit: Double,
    val orderCount: Int,
    val lateCount: Int,
    val readyToShipCount: Int
) {
    fun comparisonSeries(compareMode: DashboardCompareMode): List<DashboardComparisonSeries> {
        if (compareMode == DashboardCompareMode.None) return emptyList()
        val oneYear = previousOneYearNetProfit?.let {
            DashboardComparisonSeries("-1 Yr", StudioWarningOrange, previousOneYearValues, it)
        }
        if (compareMode == DashboardCompareMode.OneYear) return listOfNotNull(oneYear)
        return listOfNotNull(
            oneYear,
            previousTwoYearNetProfit?.let { DashboardComparisonSeries("-2 Yrs", Color(0xFF8E5CFF), previousTwoYearValues, it) },
            previousThreeYearNetProfit?.let { DashboardComparisonSeries("-3 Yrs", Color(0xFF8A8F98), previousThreeYearValues, it) }
        )
    }

    companion object {
        fun from(orders: List<StudioOrder>, period: DashboardPeriod): DashboardStats {
            val now = Calendar.getInstance(Locale.UK)
            val currentYear = now.get(Calendar.YEAR)
            val currentMonth = now.get(Calendar.MONTH)
            val bucketCount = period.bucketCount(now)
            val selectedOrders = orders.filter { order -> period.includes(order, currentYear, currentMonth, 0) }
            val chartValues = buildChartValues(orders, period, currentYear, currentMonth, 0, bucketCount)
            val previousOne = period.previousOrders(orders, currentYear, currentMonth, 1)
            val previousTwo = period.previousOrders(orders, currentYear, currentMonth, 2)
            val previousThree = period.previousOrders(orders, currentYear, currentMonth, 3)
            val thisYearOrders = orders.filter { order ->
                Calendar.getInstance(Locale.UK).apply { time = order.paymentDate }.get(Calendar.YEAR) == currentYear
            }
            val lastYearOrders = orders.filter { order ->
                Calendar.getInstance(Locale.UK).apply { time = order.paymentDate }.get(Calendar.YEAR) == currentYear - 1
            }
            return DashboardStats(
                revenue = selectedOrders.sumOf { it.orderValue },
                pending = selectedOrders.sumOf { it.remainingAmount },
                baseCost = selectedOrders.sumOf { it.watchPurchasePrice },
                platformFee = selectedOrders.sumOf { it.paymentFee },
                shipping = selectedOrders.sumOf { it.deliveryCost },
                tax = selectedOrders.sumOf { it.taxAmount },
                netProfit = selectedOrders.sumOf { it.netProfit },
                chartValues = chartValues,
                chartLabels = period.chartLabels(now),
                chartAxisLabels = period.chartAxisLabels(now),
                previousOneYearValues = buildChartValues(orders, period, currentYear, currentMonth, 1, bucketCount),
                previousTwoYearValues = buildChartValues(orders, period, currentYear, currentMonth, 2, bucketCount),
                previousThreeYearValues = buildChartValues(orders, period, currentYear, currentMonth, 3, bucketCount),
                previousOneYearNetProfit = previousOne?.sumOf { it.netProfit },
                previousTwoYearNetProfit = previousTwo?.sumOf { it.netProfit },
                previousThreeYearNetProfit = previousThree?.sumOf { it.netProfit },
                thisYearNetProfit = thisYearOrders.sumOf { it.netProfit },
                lastYearNetProfit = lastYearOrders.sumOf { it.netProfit },
                orderCount = selectedOrders.size,
                lateCount = selectedOrders.count { it.remainingDays < 0 && !it.isClosed },
                readyToShipCount = selectedOrders.count { it.status.equals("Done", ignoreCase = true) && !it.isDispatched }
            )
        }

        private fun buildChartValues(
            orders: List<StudioOrder>,
            period: DashboardPeriod,
            currentYear: Int,
            currentMonth: Int,
            yearBack: Int,
            bucketCount: Int
        ): List<Double> {
            val values = MutableList(bucketCount) { 0.0 }
            orders.filter { period.includes(it, currentYear, currentMonth, yearBack) }.forEach { order ->
                val bucket = period.bucketIndex(order)
                if (bucket in values.indices) values[bucket] += order.netProfit
            }
            return values
        }
    }
}

private data class DashboardComparisonSeries(
    val label: String,
    val color: Color,
    val values: List<Double>,
    val total: Double
)

private data class DashboardSummaryCardSpec(
    val title: String,
    val value: String,
    val prefix: String,
    val color: Color,
    val icon: ImageVector?
)

private fun dashboardSummaryCards(
    stats: DashboardStats,
    currency: String,
    decimalSeparator: String,
    visibility: DashboardWidgetVisibility,
    hideNumbers: Boolean
): List<DashboardSummaryCardSpec> {
    val rolledCost = stats.baseCost +
        (if (!visibility.dashShowFee) stats.platformFee else 0.0) +
        (if (!visibility.dashShowShipping) stats.shipping else 0.0) +
        (if (!visibility.dashShowTax) stats.tax else 0.0)
    return buildList {
        if (visibility.dashShowRevenue) {
            add(DashboardSummaryCardSpec("Revenue", money(stats.revenue, currency, decimalSeparator, hideNumbers), currency, StudioBlue, null))
        }
        if (visibility.dashShowPending) {
            add(DashboardSummaryCardSpec("Pending", money(stats.pending, currency, decimalSeparator, hideNumbers), "", StudioWarningOrange, Icons.Filled.Schedule))
        }
        if (visibility.dashShowCost) {
            add(DashboardSummaryCardSpec("Cost", money(rolledCost, currency, decimalSeparator, hideNumbers), "", StudioRed, Icons.Filled.ShoppingCart))
        }
        if (visibility.dashShowFee) {
            add(DashboardSummaryCardSpec("Platform Fee", money(stats.platformFee, currency, decimalSeparator, hideNumbers), "", StudioRed, Icons.Filled.Percent))
        }
        if (visibility.dashShowShipping) {
            add(DashboardSummaryCardSpec("Shipping", money(stats.shipping, currency, decimalSeparator, hideNumbers), "", StudioRed, Icons.Filled.LocalShipping))
        }
        if (visibility.dashShowTax) {
            add(DashboardSummaryCardSpec("Tax Amount", money(stats.tax, currency, decimalSeparator, hideNumbers), "", StudioRed, Icons.Filled.AccountBalance))
        }
        if (visibility.dashShowProfit) {
            add(DashboardSummaryCardSpec("Net Profit", money(stats.netProfit, currency, decimalSeparator, hideNumbers), "", StudioGreen, Icons.Filled.Done))
        }
    }
}

private fun money(value: Double, currency: String, decimalSeparator: String, hideNumbers: Boolean): String {
    if (hideNumbers) return privateCurrencyText(currency)
    val formatted = String.format(Locale.UK, "%,.2f", value)
    return currency + if (decimalSeparator == ",") {
        formatted.replace(",", "_").replace(".", ",").replace("_", ".")
    } else {
        formatted
    }
}

private fun growthLabel(current: Double, previous: Double): String {
    val delta = current - previous
    val sign = if (delta >= 0) "+" else "-"
    val percent = if (previous == 0.0) {
        if (current > 0.0) 100.0 else 0.0
    } else {
        kotlin.math.abs(delta / previous * 100.0)
    }
    return "$sign${String.format(Locale.UK, "%.1f", percent)}%"
}

private enum class DashboardCompareMode(val label: String) {
    None("Compare"),
    OneYear("1 Yr Compare"),
    ThreeYears("3 Yrs Compare")
}

private enum class DashboardWidget(val key: String, val label: String, val color: Color) {
    Revenue("revenue", "Revenue", StudioBlue),
    Pending("pending", "Pending", StudioWarningOrange),
    Cost("cost", "Cost", StudioRed),
    Fee("fee", "Platform Fee", StudioRed),
    Shipping("shipping", "Shipping", StudioRed),
    Tax("tax", "Tax Amount", StudioRed),
    Profit("profit", "Net Profit", StudioGreen)
}

private data class DashboardWidgetVisibility(
    val dashShowRevenue: Boolean,
    val dashShowPending: Boolean,
    val dashShowCost: Boolean,
    val dashShowFee: Boolean,
    val dashShowShipping: Boolean,
    val dashShowTax: Boolean,
    val dashShowProfit: Boolean
) {
    fun isVisible(widget: DashboardWidget): Boolean {
        return when (widget) {
            DashboardWidget.Revenue -> dashShowRevenue
            DashboardWidget.Pending -> dashShowPending
            DashboardWidget.Cost -> dashShowCost
            DashboardWidget.Fee -> dashShowFee
            DashboardWidget.Shipping -> dashShowShipping
            DashboardWidget.Tax -> dashShowTax
            DashboardWidget.Profit -> dashShowProfit
        }
    }

    fun toggled(widget: DashboardWidget): DashboardWidgetVisibility {
        return when (widget) {
            DashboardWidget.Revenue -> copy(dashShowRevenue = !dashShowRevenue)
            DashboardWidget.Pending -> copy(dashShowPending = !dashShowPending)
            DashboardWidget.Cost -> copy(dashShowCost = !dashShowCost)
            DashboardWidget.Fee -> copy(dashShowFee = !dashShowFee)
            DashboardWidget.Shipping -> copy(dashShowShipping = !dashShowShipping)
            DashboardWidget.Tax -> copy(dashShowTax = !dashShowTax)
            DashboardWidget.Profit -> copy(dashShowProfit = !dashShowProfit)
        }
    }

    fun toPayload(): Map<String, Any?> {
        val visibility = mapOf(
            "revenue" to dashShowRevenue,
            "pending" to dashShowPending,
            "cost" to dashShowCost,
            "fee" to dashShowFee,
            "shipping" to dashShowShipping,
            "tax" to dashShowTax,
            "profit" to dashShowProfit
        )
        return mapOf(
            "dashboardWidgetVisibility" to visibility,
            "dashShowRevenue" to dashShowRevenue,
            "dashShowPending" to dashShowPending,
            "dashShowCost" to dashShowCost,
            "dashShowFee" to dashShowFee,
            "dashShowShipping" to dashShowShipping,
            "dashShowTax" to dashShowTax,
            "dashShowProfit" to dashShowProfit
        )
    }

    companion object {
        fun from(settings: StudioWorkspaceSettings): DashboardWidgetVisibility {
            return DashboardWidgetVisibility(
                dashShowRevenue = settings.dashShowRevenue,
                dashShowPending = settings.dashShowPending,
                dashShowCost = settings.dashShowCost,
                dashShowFee = settings.dashShowFee,
                dashShowShipping = settings.dashShowShipping,
                dashShowTax = settings.dashShowTax,
                dashShowProfit = settings.dashShowProfit
            )
        }
    }
}

private enum class DashboardPeriod(val label: String) {
    Week("Week"),
    Month("Month"),
    Year("Year"),
    AllTime("All Time");

    val supportsYearCompare: Boolean
        get() = this == Month || this == Year

    fun includes(order: StudioOrder, currentYear: Int, currentMonth: Int, yearBack: Int): Boolean {
        if (yearBack > 0 && !supportsYearCompare) return false
        val calendar = Calendar.getInstance(Locale.UK).apply { time = order.paymentDate }
        val targetYear = currentYear - yearBack
        return when (this) {
            Week -> sameWeek(calendar, Calendar.getInstance(Locale.UK))
            Month -> calendar.get(Calendar.YEAR) == targetYear && calendar.get(Calendar.MONTH) == currentMonth
            Year -> calendar.get(Calendar.YEAR) == targetYear
            AllTime -> yearBack == 0
        }
    }

    fun previousOrders(orders: List<StudioOrder>, currentYear: Int, currentMonth: Int, yearBack: Int): List<StudioOrder>? {
        if (!supportsYearCompare) return null
        return orders.filter { order -> includes(order, currentYear, currentMonth, yearBack) }
    }

    fun bucketCount(now: Calendar): Int {
        return when (this) {
            Week -> 7
            Month -> now.getActualMaximum(Calendar.DAY_OF_MONTH)
            Year, AllTime -> 12
        }
    }

    fun bucketIndex(order: StudioOrder): Int {
        val calendar = Calendar.getInstance(Locale.UK).apply { time = order.paymentDate }
        return when (this) {
            Week -> {
                val day = calendar.get(Calendar.DAY_OF_WEEK)
                if (day == Calendar.SUNDAY) 6 else day - Calendar.MONDAY
            }
            Month -> calendar.get(Calendar.DAY_OF_MONTH) - 1
            Year, AllTime -> calendar.get(Calendar.MONTH)
        }
    }

    fun chartLabels(now: Calendar): List<String> {
        return when (this) {
            Week -> listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
            Month -> (1..now.getActualMaximum(Calendar.DAY_OF_MONTH)).map { it.toString() }
            Year, AllTime -> listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
        }
    }

    fun chartAxisLabels(now: Calendar): List<String> {
        return when (this) {
            Week -> listOf("Mon", "Wed", "Fri", "Sun")
            Month -> {
                val last = now.getActualMaximum(Calendar.DAY_OF_MONTH)
                listOf("1", (last / 3).coerceAtLeast(2).toString(), ((last * 2) / 3).toString(), last.toString())
            }
            Year, AllTime -> listOf("Jan", "Apr", "Jul", "Oct", "Dec")
        }
    }
}

private fun sameWeek(first: Calendar, second: Calendar): Boolean {
    first.firstDayOfWeek = Calendar.MONDAY
    second.firstDayOfWeek = Calendar.MONDAY
    return first.get(Calendar.YEAR) == second.get(Calendar.YEAR) &&
        first.get(Calendar.WEEK_OF_YEAR) == second.get(Calendar.WEEK_OF_YEAR)
}

private enum class SpendingScope(val label: String) {
    ThisMonth("This Month"),
    ThisYear("This Year"),
    CustomRange("Custom Range"),
    AllTime("All Time")
}

private data class ExtraSpendingEntry(
    val orderId: String,
    val customerName: String,
    val designName: String,
    val watchRef: String,
    val heading: String,
    val description: String,
    val amount: Double,
    val paymentDate: Date
)

private data class ExtraSpendingGroup(
    val orderId: String,
    val title: String,
    val subtitle: String,
    val entries: List<ExtraSpendingEntry>,
    val total: Double
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ExtraSpendingSummarySection(
    orders: List<StudioOrder>,
    workspaceSettings: StudioWorkspaceSettings,
    currency: String,
    decimalSeparator: String,
    hideNumbers: Boolean,
    modifier: Modifier = Modifier
) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    var scope by rememberSaveable { mutableStateOf(SpendingScope.ThisMonth) }
    var customStartMs by rememberSaveable { mutableStateOf<Long?>(null) }
    var customEndMs by rememberSaveable { mutableStateOf<Long?>(null) }
    var incBase by rememberSaveable { mutableStateOf(true) }
    var incShipping by rememberSaveable { mutableStateOf(true) }
    var incFee by rememberSaveable { mutableStateOf(true) }
    var incTax by rememberSaveable { mutableStateOf(true) }
    var page by rememberSaveable { mutableStateOf(0) }
    val pageSize = 20

    val now = remember { Calendar.getInstance(Locale.UK) }
    val (rangeStart, rangeEnd) = remember(scope, customStartMs, customEndMs) {
        spendingDateRange(scope, customStartMs, customEndMs)
    }

    val customTitles: List<StudioHeadingItem> = workspaceSettings.financialExpenseItems

    val groups: List<ExtraSpendingGroup> = remember(orders, rangeStart, rangeEnd, incBase, incShipping, incFee, incTax, customTitles) {
        val list = mutableListOf<ExtraSpendingGroup>()
        for (o in orders) {
            val pd = o.paymentDate
            if (pd.time < rangeStart || pd.time > rangeEnd) continue
            val entries = mutableListOf<ExtraSpendingEntry>()
            fun add(heading: String, desc: String, amount: Double) {
                if (amount > 0) entries.add(ExtraSpendingEntry(o.id, o.customerName, o.designName, o.watchRef, heading, desc, amount, pd))
            }
            if (incBase) add("Base Cost", "Purchase price", o.watchPurchasePrice)
            if (incShipping) add("Shipping", "Delivery cost", o.deliveryCost)
            if (incFee) add("Platform Fee", "Payment fee", o.paymentFee)
            if (incTax) add("Tax", "VAT / Tax", o.taxAmount)
            for (item in customTitles) {
                val raw = o.customFields["financialExpense::${item.title}"]
                    ?: o.customFields["financialExpense::${item.id}"]
                val amount = raw?.replace(",", "")?.toDoubleOrNull() ?: 0.0
                if (amount > 0) add(item.title, "Custom expense", amount)
            }
            if (entries.isNotEmpty()) {
                val total = entries.sumOf { it.amount }
                val subtitle = listOf(o.designName, o.watchRef).filter { it.isNotBlank() }.joinToString(" · ")
                list.add(ExtraSpendingGroup(o.id, o.customerName.ifBlank { "#${o.id.take(6)}" }, subtitle, entries, total))
            }
        }
        list.sortedByDescending { it.total }
    }

    val totalAmount = groups.sumOf { it.total }
    val entryCount = groups.sumOf { it.entries.size }
    val totalPages = ((groups.size + pageSize - 1) / pageSize).coerceAtLeast(1)
    val currentPage = page.coerceAtMost(totalPages - 1)
    val pageGroups = groups.drop(currentPage * pageSize).take(pageSize)

    Surface(
        modifier = modifier.fillMaxWidth().clickable { expanded = true },
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .background(StudioRed.copy(alpha = 0.12f), RoundedCornerShape(11.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.AutoMirrored.Filled.FormatListBulleted, contentDescription = null, tint = StudioRed)
            }
            Column(modifier = Modifier.weight(1f)) {
                Text("Extra Spending Summary", fontSize = 15.sp, fontWeight = FontWeight.ExtraBold)
                Text(
                    "Open a detailed page for monthly, yearly and order-based extra spending with descriptions.",
                    fontSize = 12.sp, fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(money(totalAmount, currency, decimalSeparator, hideNumbers), fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, color = StudioRed)
                Text("$entryCount entries", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }

    if (expanded) {
        var pickingStart by remember { mutableStateOf(false) }
        var pickingEnd by remember { mutableStateOf(false) }
        Dialog(onDismissRequest = { expanded = false }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth(0.96f)
                    .heightIn(max = 640.dp),
                shape = RoundedCornerShape(18.dp),
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 4.dp
            ) {
                Column(modifier = Modifier.padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Extra Spending Summary", modifier = Modifier.weight(1f), fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                        IconButton(onClick = { expanded = false }) { Icon(Icons.Filled.Close, contentDescription = "Close") }
                    }

                    // Scope picker
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                        SpendingScope.values().forEach { s ->
                            val selected = scope == s
                            Surface(
                                modifier = Modifier.weight(1f).clickable { scope = s; page = 0 },
                                shape = RoundedCornerShape(10.dp),
                                color = if (selected) StudioBlue.copy(alpha = 0.15f) else MaterialTheme.colorScheme.surfaceVariant
                            ) {
                                Text(
                                    s.label,
                                    modifier = Modifier.padding(vertical = 8.dp),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = if (selected) StudioBlue else MaterialTheme.colorScheme.onSurface,
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                                )
                            }
                        }
                    }

                    if (scope == SpendingScope.CustomRange) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Surface(
                                modifier = Modifier.weight(1f).clickable { pickingStart = true },
                                shape = RoundedCornerShape(10.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant
                            ) {
                                Text(
                                    "From: " + (customStartMs?.let { formatDateShort(it) } ?: "—"),
                                    modifier = Modifier.padding(10.dp), fontSize = 12.sp, fontWeight = FontWeight.SemiBold
                                )
                            }
                            Surface(
                                modifier = Modifier.weight(1f).clickable { pickingEnd = true },
                                shape = RoundedCornerShape(10.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant
                            ) {
                                Text(
                                    "To: " + (customEndMs?.let { formatDateShort(it) } ?: "—"),
                                    modifier = Modifier.padding(10.dp), fontSize = 12.sp, fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    }

                    // Toggles (wrap horizontally)
                    androidx.compose.foundation.layout.FlowRow(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        ToggleRow("Base Cost", incBase) { incBase = it; page = 0 }
                        ToggleRow("Shipping", incShipping) { incShipping = it; page = 0 }
                        ToggleRow("Platform Fee", incFee) { incFee = it; page = 0 }
                        ToggleRow("VAT / Tax", incTax) { incTax = it; page = 0 }
                    }

                    // Metrics
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        MetricBox("Total", money(totalAmount, currency, decimalSeparator, hideNumbers), Modifier.weight(1f))
                        MetricBox("Orders", groups.size.toString(), Modifier.weight(1f))
                        MetricBox("Entries", entryCount.toString(), Modifier.weight(1f))
                    }

                    HorizontalDivider()

                    if (groups.isEmpty()) {
                        Text(
                            "No extra spending in this period.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(vertical = 24.dp).fillMaxWidth(),
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    } else {
                        pageGroups.forEach { g ->
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp))
                                    .padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Row {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(g.title, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                        if (g.subtitle.isNotBlank()) {
                                            Text(g.subtitle, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                    }
                                    Text(money(g.total, currency, decimalSeparator, hideNumbers), fontWeight = FontWeight.ExtraBold, color = StudioRed)
                                }
                                g.entries.forEach { e ->
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text("${e.heading} · ${e.description}", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                            Text(formatDateShort(e.paymentDate.time), fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                        Text(money(e.amount, currency, decimalSeparator, hideNumbers), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                    }
                                }
                            }
                        }

                        if (totalPages > 1) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center, modifier = Modifier.fillMaxWidth()) {
                                TextButton(onClick = { page = (page - 1).coerceAtLeast(0) }, enabled = currentPage > 0) { Text("Previous") }
                                Text("${currentPage + 1} / $totalPages", modifier = Modifier.padding(horizontal = 8.dp), fontWeight = FontWeight.SemiBold)
                                TextButton(onClick = { page = (page + 1).coerceAtMost(totalPages - 1) }, enabled = currentPage < totalPages - 1) { Text("Next") }
                            }
                        }
                    }
                }
            }
        }

        if (pickingStart) {
            val ds = rememberDatePickerState(initialSelectedDateMillis = customStartMs)
            DatePickerDialog(
                onDismissRequest = { pickingStart = false },
                confirmButton = {
                    TextButton(onClick = { customStartMs = ds.selectedDateMillis; pickingStart = false; page = 0 }) { Text("OK") }
                },
                dismissButton = { TextButton(onClick = { pickingStart = false }) { Text("Cancel") } }
            ) { DatePicker(state = ds) }
        }
        if (pickingEnd) {
            val ds = rememberDatePickerState(initialSelectedDateMillis = customEndMs)
            DatePickerDialog(
                onDismissRequest = { pickingEnd = false },
                confirmButton = {
                    TextButton(onClick = { customEndMs = ds.selectedDateMillis; pickingEnd = false; page = 0 }) { Text("OK") }
                },
                dismissButton = { TextButton(onClick = { pickingEnd = false }) { Text("Cancel") } }
            ) { DatePicker(state = ds) }
        }
    }
}

@Composable
private fun ToggleRow(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable { onCheckedChange(!checked) }) {
        Checkbox(checked = checked, onCheckedChange = onCheckedChange)
        Text(label, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun MetricBox(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp))
            .padding(12.dp)
    ) {
        Text(label, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
        Text(value, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold)
    }
}

private fun spendingDateRange(scope: SpendingScope, customStart: Long?, customEnd: Long?): Pair<Long, Long> {
    val now = Calendar.getInstance(Locale.UK)
    return when (scope) {
        SpendingScope.ThisMonth -> {
            val start = Calendar.getInstance(Locale.UK).apply {
                set(Calendar.DAY_OF_MONTH, 1); set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
            }
            start.timeInMillis to now.timeInMillis
        }
        SpendingScope.ThisYear -> {
            val start = Calendar.getInstance(Locale.UK).apply {
                set(Calendar.DAY_OF_YEAR, 1); set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
            }
            start.timeInMillis to now.timeInMillis
        }
        SpendingScope.CustomRange -> {
            val s = customStart ?: 0L
            val e = customEnd ?: now.timeInMillis
            s to e
        }
        SpendingScope.AllTime -> 0L to now.timeInMillis
    }
}

private fun formatDateShort(ms: Long): String {
    val sdf = java.text.SimpleDateFormat("dd MMM yyyy", Locale.UK)
    return sdf.format(Date(ms))
}
