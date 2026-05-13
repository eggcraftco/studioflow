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
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.CompareArrows
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Done
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Percent
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
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
                            Text("Dashboard", fontSize = 24.sp, fontWeight = FontWeight.ExtraBold)
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
            Surface(
                modifier = Modifier.padding(horizontal = 16.dp),
                shape = RoundedCornerShape(14.dp),
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 1.dp
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Net Profit Analysis", fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
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
                    Text("Year-over-Year Summary", fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp))
                            .padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("This Year", modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
                        Text(money(stats.thisYearNetProfit, currency, decimalSeparator, hideSensitiveNumbers), fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                    }
                    SummaryRow("Last Year", money(stats.lastYearNetProfit, currency, decimalSeparator, hideSensitiveNumbers))
                    SummaryRow("Growth", growthLabel(stats.thisYearNetProfit, stats.lastYearNetProfit))
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
                            title = card.title,
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
