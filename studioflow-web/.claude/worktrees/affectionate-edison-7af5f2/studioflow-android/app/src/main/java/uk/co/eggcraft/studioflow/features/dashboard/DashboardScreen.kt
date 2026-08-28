package uk.co.eggcraft.studioflow.features.dashboard

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.offset
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.luminance
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
import androidx.compose.material.icons.automirrored.filled.CompareArrows
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Done
import androidx.compose.material.icons.automirrored.filled.FormatListBulleted
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Share
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
import uk.co.eggcraft.studioflow.data.model.StudioBillingPlan
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
    val currency = state.workspaceSettings.selectedCurrency.ifBlank { "£" }
    val decimalSeparator = state.workspaceSettings.selectedDecimalSeparator
    val hideSensitiveNumbers = LocalHideSensitiveNumbers.current
    val widgetVisibility = DashboardWidgetVisibility.from(state.workspaceSettings)
    val advancedFinanceEnabled = state.workspace?.billingPlan == StudioBillingPlan.ProMonthly || state.workspace?.billingPlan == StudioBillingPlan.TeamMonthly
    val locale = uk.co.eggcraft.studioflow.language.studioLocale(lang)
    val stats = remember(state.orders, period, advancedFinanceEnabled, locale, state.workspaceSettings.financialExpenseItems, state.workspaceSettings.financialShowBaseCost) {
        DashboardStats.from(state.orders, period, advancedFinanceEnabled, locale, state.workspaceSettings.financialExpenseItems, state.workspaceSettings.financialShowBaseCost)
    }
    val compareEnabled = advancedFinanceEnabled && compareMode != DashboardCompareMode.None && period.supportsYearCompare
    // The tax-rule name the workspace files revenue under — the Revenue card's
    // subtitle on web, demoted from title so the card always reads "Revenue".
    val revenueCardSubtitle = state.workspaceSettings.taxRuleNameRevenue.ifBlank { "Standard VAT (New)" }
    val summaryCards = remember(stats, currency, decimalSeparator, widgetVisibility, hideSensitiveNumbers, advancedFinanceEnabled, state.workspaceSettings.corporationTaxEnabled, state.workspaceSettings.corporationTaxRate, revenueCardSubtitle) {
        dashboardSummaryCards(stats, currency, decimalSeparator, widgetVisibility, hideSensitiveNumbers, advancedFinanceEnabled, state.workspaceSettings.corporationTaxEnabled, state.workspaceSettings.corporationTaxRate, revenueCardSubtitle)
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
                        if (advancedFinanceEnabled) {
                            Box {
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = StudioBlue.copy(alpha = 0.12f),
                                    onClick = { dashboardOptionsOpen = true }
                                ) {
                                    Icon(Icons.Filled.Tune, contentDescription = t("Dashboard controls"), tint = StudioBlue, modifier = Modifier.padding(13.dp))
                                }
                                DashboardOptionsMenu(
                                    expanded = dashboardOptionsOpen,
                                    selectedPeriod = period,
                                    compareMode = compareMode,
                                    widgetVisibility = widgetVisibility,
                                    allowComparison = true,
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
                        if (advancedFinanceEnabled) {
                            FilterChipLike(
                                icon = Icons.AutoMirrored.Filled.CompareArrows,
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
                    }
                    if (!advancedFinanceEnabled) {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Surface(
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(40.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
                                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(Icons.Filled.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(13.dp))
                                    Text("1Y / 3Y Compare", color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                    Spacer(modifier = Modifier.weight(1f))
                                    Surface(shape = RoundedCornerShape(18.dp), color = StudioBlue.copy(alpha = 0.12f)) {
                                        Text("Pro", color = StudioBlue, fontWeight = FontWeight.ExtraBold, fontSize = 11.sp, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
                                    }
                                }
                            }
                            Box {
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = StudioBlue.copy(alpha = 0.12f),
                                    onClick = { dashboardOptionsOpen = true }
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 11.dp),
                                        horizontalArrangement = Arrangement.spacedBy(7.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Icon(Icons.Filled.Tune, contentDescription = null, tint = StudioBlue, modifier = Modifier.size(17.dp))
                                        Text(t("Customize"), color = StudioBlue, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp)
                                    }
                                }
                                DashboardOptionsMenu(
                                    expanded = dashboardOptionsOpen,
                                    selectedPeriod = period,
                                    compareMode = compareMode,
                                    widgetVisibility = widgetVisibility,
                                    allowComparison = false,
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
                    }
                    if (advancedFinanceEnabled && compareMode != DashboardCompareMode.None && !period.supportsYearCompare) {
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
        if (advancedFinanceEnabled) {
            item {
                FinancialBreakdownCard(
                    stats = stats,
                    currency = currency,
                    decimalSeparator = decimalSeparator,
                    hideNumbers = hideSensitiveNumbers,
                    corporationTaxEnabled = state.workspaceSettings.corporationTaxEnabled,
                    corporationTaxRate = state.workspaceSettings.corporationTaxRate,
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
        }
        item {
            Surface(
                modifier = Modifier.padding(horizontal = 16.dp),
                shape = RoundedCornerShape(14.dp),
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 1.dp
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(t(if (advancedFinanceEnabled) "Net Profit Analysis" else "Basic Balance Analysis"), fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                    ProfitLineChart(
                        values = stats.chartValues,
                        labels = stats.chartLabels,
                        axisLabels = stats.chartAxisLabels,
                        comparisonSeries = if (compareEnabled) stats.comparisonSeries(compareMode) else emptyList(),
                        currency = currency,
                        decimalSeparator = decimalSeparator,
                        hideNumbers = hideSensitiveNumbers
                    )
                    if (!advancedFinanceEnabled) {
                        Text(t("Received minus Base Cost only. Detailed profit and year comparisons are available on Pro."), color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                    }
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
                    Text(t(if (advancedFinanceEnabled) "Year-over-Year Summary" else "Yearly Basic Finance"), fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp))
                            .padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(t(if (advancedFinanceEnabled) "This Year" else "This Year Received"), modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
                        Text(money(if (advancedFinanceEnabled) stats.thisYearNetProfit else stats.thisYearReceived, currency, decimalSeparator, hideSensitiveNumbers), fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                    }
                    if (advancedFinanceEnabled) {
                        SummaryRow(t("Last Year"), money(stats.lastYearNetProfit, currency, decimalSeparator, hideSensitiveNumbers))
                        SummaryRow(t("Growth"), growthLabel(stats.thisYearNetProfit, stats.lastYearNetProfit))
                    } else {
                        SummaryRow(t("This Year Base Cost"), money(stats.thisYearBaseCost, currency, decimalSeparator, hideSensitiveNumbers))
                        SummaryRow(t("This Year Basic Balance"), money(stats.thisYearBasicBalance, currency, decimalSeparator, hideSensitiveNumbers))
                    }
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
    allowComparison: Boolean,
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
        if (allowComparison) {
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
                            if (item == compareMode) Icons.Filled.Done else Icons.AutoMirrored.Filled.CompareArrows,
                            contentDescription = null,
                            tint = if (item == compareMode) StudioBlue else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    },
                    onClick = { onCompareSelected(item) }
                )
            }
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
                            icon = card.icon,
                            subtitle = card.subtitle,
                            hint = card.hint?.let { base ->
                                listOfNotNull(base, card.hintExtra).joinToString(" ") { t(it) }
                            }
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
    icon: ImageVector? = null,
    subtitle: String? = null,
    hint: String? = null
) {
    // Web surfaces the hint on hover; there is no hover here, so a tap on the
    // card shows/hides the same sentence in place.
    var showHint by remember { mutableStateOf(false) }
    Surface(modifier = modifier, shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surface, tonalElevation = 1.dp) {
        Column(
            modifier = Modifier
                .then(if (hint != null) Modifier.clickable { showHint = !showHint } else Modifier)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (icon != null) Icon(icon, contentDescription = null, tint = color) else Text(prefix, color = color, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                Column {
                    Text(title, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.ExtraBold)
                    if (subtitle != null) {
                        Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                    }
                }
            }
            Text(value, fontSize = 21.sp, fontWeight = FontWeight.ExtraBold)
            if (showHint && hint != null) {
                Text(hint, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, lineHeight = 15.sp)
            }
        }
    }
}

private fun compactAxisMoney(value: Double, currency: String): String {
    val sign = if (value < 0) "-" else ""
    val abs = kotlin.math.abs(value)
    return when {
        abs >= 1000.0 -> {
            val k = abs / 1000.0
            val text = if (k % 1.0 == 0.0) k.toInt().toString() else String.format(Locale.UK, "%.1f", k).trimEnd('0').trimEnd('.')
            "$sign$currency${text}k"
        }
        else -> "$sign$currency${abs.toInt()}"
    }
}

@Composable
private fun ProfitLineChart(
    values: List<Double>,
    labels: List<String>,
    axisLabels: List<String>,
    comparisonSeries: List<DashboardComparisonSeries>,
    currency: String,
    decimalSeparator: String,
    hideNumbers: Boolean
) {
    val lineColor = StudioGreen
    val allSeries = listOf(values) + comparisonSeries.map { it.values }
    val allValues = allSeries.flatten()
    val maxValue = maxOf(100.0, allValues.maxOrNull() ?: 0.0)
    val minValue = minOf(0.0, allValues.minOrNull() ?: 0.0)
    val valueRange = (maxValue - minValue).takeIf { it > 0.0 } ?: 1.0

    val isDark = MaterialTheme.colorScheme.surface.luminance() < 0.5f
    val gridColor = if (isDark) Color.White.copy(alpha = 0.10f) else Color(0xFFE7E7E7)
    val onVariant = MaterialTheme.colorScheme.onSurfaceVariant

    val density = LocalDensity.current
    val chartHeight = 250.dp
    var selectedIndex by remember { mutableStateOf<Int?>(null) }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxWidth()
                .height(chartHeight)
        ) {
            val widthPx = with(density) { maxWidth.toPx() }
            val heightPx = with(density) { chartHeight.toPx() }
            val axisGutterPx = with(density) { 46.dp.toPx() }
            val left = with(density) { 6.dp.toPx() }
            val right = widthPx - axisGutterPx
            val top = with(density) { 10.dp.toPx() }
            val bottom = heightPx - with(density) { 12.dp.toPx() }
            val plotWidth = right - left
            val plotHeight = bottom - top
            val pointDenominator = (values.size - 1).coerceAtLeast(1).toFloat()

            fun pointFor(index: Int, value: Double): Offset {
                val x = left + plotWidth * (index / pointDenominator)
                val normalized = ((value - minValue) / valueRange).toFloat()
                val y = bottom - (plotHeight * normalized)
                return Offset(x, y)
            }

            val mainPoints = values.mapIndexed { i, v -> pointFor(i, v) }

            fun nearestIndex(px: Float): Int {
                if (values.size <= 1) return 0
                val ratio = ((px - left) / plotWidth).coerceIn(0f, 1f)
                return Math.round(ratio * pointDenominator).coerceIn(0, values.size - 1)
            }

            Canvas(
                modifier = Modifier
                    .fillMaxSize()
                    .pointerInput(values.size, widthPx) {
                        detectTapGestures(onTap = { off -> selectedIndex = nearestIndex(off.x) })
                    }
                    .pointerInput(values.size, widthPx) {
                        detectHorizontalDragGestures(
                            onDragStart = { off -> selectedIndex = nearestIndex(off.x) },
                            onHorizontalDrag = { change, _ -> selectedIndex = nearestIndex(change.position.x) }
                        )
                    }
            ) {
                repeat(5) { index ->
                    val y = top + (plotHeight / 4f) * index
                    drawLine(gridColor, Offset(left, y), Offset(right, y), strokeWidth = 1.2f)
                }
                repeat(5) { index ->
                    val x = left + (plotWidth / 4f) * index
                    drawLine(gridColor, Offset(x, top), Offset(x, bottom), strokeWidth = 1.2f)
                }

                fun drawSeries(points: List<Offset>, color: Color, strokeWidth: Float, pointRadius: Float) {
                    if (points.isEmpty()) return
                    val path = Path()
                    points.forEachIndexed { index, point ->
                        if (index == 0) path.moveTo(point.x, point.y) else path.lineTo(point.x, point.y)
                    }
                    drawPath(path, color, style = Stroke(width = strokeWidth, cap = StrokeCap.Round))
                    points.forEach { point -> drawCircle(color, radius = pointRadius, center = point) }
                }

                comparisonSeries.forEach { series ->
                    drawSeries(series.values.mapIndexed { i, v -> pointFor(i, v) }, series.color, 3f, 5f)
                }
                drawSeries(mainPoints, lineColor, 5f, 8f)

                selectedIndex?.let { idx ->
                    mainPoints.getOrNull(idx)?.let { p ->
                        drawLine(
                            onVariant.copy(alpha = 0.5f),
                            Offset(p.x, top),
                            Offset(p.x, bottom),
                            strokeWidth = 1.4f,
                            pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f))
                        )
                        drawCircle(Color.White, radius = 11f, center = p)
                        drawCircle(lineColor, radius = 8f, center = p)
                    }
                }
            }

            // Right-side Y-axis value labels aligned to gridlines
            repeat(5) { index ->
                val yPx = top + (plotHeight / 4f) * index
                val tickValue = maxValue - valueRange * (index / 4.0)
                Text(
                    if (hideNumbers) privateCurrencyText(currency) else compactAxisMoney(tickValue, currency),
                    color = onVariant,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.offset(
                        x = with(density) { (right + 6f).toDp() },
                        y = with(density) { (yPx - 8f).toDp() }
                    )
                )
            }

            // Hover/tap tooltip
            selectedIndex?.let { idx ->
                val p = mainPoints.getOrNull(idx)
                if (p != null) {
                    val tipWidthPx = with(density) { 150.dp.toPx() }
                    val rawX = p.x + with(density) { 12.dp.toPx() }
                    val clampedX = rawX.coerceAtMost(right - tipWidthPx).coerceAtLeast(left)
                    val tipY = (p.y - with(density) { 30.dp.toPx() }).coerceAtLeast(top)
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = if (isDark) Color(0xFF1C1C1E) else Color.White,
                        tonalElevation = 6.dp,
                        shadowElevation = 8.dp,
                        modifier = Modifier.offset(
                            x = with(density) { clampedX.toDp() },
                            y = with(density) { tipY.toDp() }
                        )
                    ) {
                        Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                            Text(
                                labels.getOrNull(idx) ?: "",
                                color = MaterialTheme.colorScheme.onSurface,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .size(8.dp)
                                        .background(lineColor, RoundedCornerShape(99.dp))
                                )
                                Text(
                                    "Net: ${money(values.getOrNull(idx) ?: 0.0, currency, decimalSeparator, hideNumbers)}",
                                    color = lineColor,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.ExtraBold
                                )
                            }
                            // Compare-year values at the same bucket, like the Mac tooltip.
                            comparisonSeries.forEach { series ->
                                series.values.getOrNull(idx)?.let { compareValue ->
                                    Row(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Box(
                                            modifier = Modifier
                                                .size(6.dp)
                                                .background(series.color, RoundedCornerShape(99.dp))
                                        )
                                        Text(
                                            "${series.label}: ${money(compareValue, currency, decimalSeparator, hideNumbers)}",
                                            color = MaterialTheme.colorScheme.onSurface,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            axisLabels.ifEmpty { labels.take(5) }.forEach {
                Text(it, color = onVariant, fontWeight = FontWeight.SemiBold)
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
    val received: Double,
    val basicBalance: Double,
    val revenue: Double,
    val pending: Double,
    val baseCost: Double,
    // Base cost as the Net Profit formula actually charges it: 0 when the
    // workspace hides the base cost field — web's totals.breakdownBaseCost.
    val breakdownBaseCost: Double,
    val platformFee: Double,
    val shipping: Double,
    val tax: Double,
    val netProfit: Double,
    val perOrderNetProfits: List<Double>,
    val extraSpending: Double,
    // Cancelled/refunded orders in the visible range: excluded from every
    // money figure above, surfaced as their own Financial Breakdown line
    // (count + order value) so the money is visible instead of counted.
    val cancelledCount: Int,
    val cancelledTotal: Double,
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
    val thisYearReceived: Double,
    val thisYearBaseCost: Double,
    val thisYearBasicBalance: Double,
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
        fun from(orders: List<StudioOrder>, period: DashboardPeriod, advancedFinanceEnabled: Boolean, locale: Locale = Locale.UK, expenseTitles: List<StudioHeadingItem> = emptyList(), showBaseCost: Boolean = true): DashboardStats {
            val now = Calendar.getInstance(Locale.UK)
            val currentYear = now.get(Calendar.YEAR)
            val currentMonth = now.get(Calendar.MONTH)
            val bucketCount = period.bucketCount(now)
            // A cancelled or refunded order owes nothing and earned nothing:
            // every money aggregate below (cards, chart, YoY, Corporation Tax)
            // runs on countingOrders only — the same shared rule the customers
            // page applies (StudioOrder.countsTowardBalance, mirroring web's
            // orderCountsTowardBalance). Operational counters (orders in view,
            // late, ready to ship) keep the full selection.
            val countingOrders = orders.filter { it.countsTowardBalance }
            val selectedOrders = orders.filter { order -> period.includes(order, currentYear, currentMonth, 0) }
            val selectedCountingOrders = selectedOrders.filter { it.countsTowardBalance }
            // Money sitting on non-counting orders in the visible range — shown
            // as its own "Cancelled or refunded" line in the Financial
            // Breakdown, so it is visible instead of pretending to be earned.
            val excludedOrders = selectedOrders.filter { !it.countsTowardBalance }
            val chartValues = buildChartValues(countingOrders, period, currentYear, currentMonth, 0, bucketCount, advancedFinanceEnabled, expenseTitles, showBaseCost)
            val previousOne = period.previousOrders(countingOrders, currentYear, currentMonth, 1)
            val previousTwo = period.previousOrders(countingOrders, currentYear, currentMonth, 2)
            val previousThree = period.previousOrders(countingOrders, currentYear, currentMonth, 3)
            val thisYearOrders = countingOrders.filter { order ->
                Calendar.getInstance(Locale.UK).apply { time = order.paymentDate }.get(Calendar.YEAR) == currentYear
            }
            val lastYearOrders = countingOrders.filter { order ->
                Calendar.getInstance(Locale.UK).apply { time = order.paymentDate }.get(Calendar.YEAR) == currentYear - 1
            }
            val selectedReceived = selectedCountingOrders.sumOf { it.paidAmount }
            val selectedBaseCost = selectedCountingOrders.sumOf { it.watchPurchasePrice }
            val yearReceived = thisYearOrders.sumOf { it.paidAmount }
            val yearBaseCost = thisYearOrders.sumOf { it.watchPurchasePrice }
            return DashboardStats(
                received = selectedReceived,
                basicBalance = selectedReceived - selectedBaseCost,
                revenue = selectedCountingOrders.sumOf { it.orderValue },
                // Custom "Remaining" items count as pending too — matches Mac/web.
                pending = selectedCountingOrders.sumOf { it.remainingAmount + it.customRemainingTotal },
                baseCost = selectedCountingOrders.sumOf { it.watchPurchasePrice },
                breakdownBaseCost = if (showBaseCost) selectedCountingOrders.sumOf { it.watchPurchasePrice } else 0.0,
                platformFee = selectedCountingOrders.sumOf { it.paymentFee },
                shipping = selectedCountingOrders.sumOf { it.deliveryCost },
                tax = selectedCountingOrders.sumOf { it.taxAmount },
                netProfit = selectedCountingOrders.sumOf { adjustedDashboardNetProfit(it, expenseTitles, showBaseCost) },
                perOrderNetProfits = selectedCountingOrders.map { adjustedDashboardNetProfit(it, expenseTitles, showBaseCost) },
                extraSpending = selectedCountingOrders.sumOf { dashboardCustomExpenseTotal(it, expenseTitles) },
                // Order value (paid + remaining + custom receivables — web's
                // orderSalesTotal) parked on cancelled/refunded orders in range.
                cancelledCount = excludedOrders.size,
                cancelledTotal = excludedOrders.sumOf { it.orderValue },
                chartValues = chartValues,
                chartLabels = period.chartLabels(now, locale),
                chartAxisLabels = period.chartAxisLabels(now, locale),
                previousOneYearValues = buildChartValues(countingOrders, period, currentYear, currentMonth, 1, bucketCount, true, expenseTitles, showBaseCost),
                previousTwoYearValues = buildChartValues(countingOrders, period, currentYear, currentMonth, 2, bucketCount, true, expenseTitles, showBaseCost),
                previousThreeYearValues = buildChartValues(countingOrders, period, currentYear, currentMonth, 3, bucketCount, true, expenseTitles, showBaseCost),
                previousOneYearNetProfit = previousOne?.sumOf { adjustedDashboardNetProfit(it, expenseTitles, showBaseCost) },
                previousTwoYearNetProfit = previousTwo?.sumOf { adjustedDashboardNetProfit(it, expenseTitles, showBaseCost) },
                previousThreeYearNetProfit = previousThree?.sumOf { adjustedDashboardNetProfit(it, expenseTitles, showBaseCost) },
                thisYearNetProfit = thisYearOrders.sumOf { adjustedDashboardNetProfit(it, expenseTitles, showBaseCost) },
                lastYearNetProfit = lastYearOrders.sumOf { adjustedDashboardNetProfit(it, expenseTitles, showBaseCost) },
                thisYearReceived = yearReceived,
                thisYearBaseCost = yearBaseCost,
                thisYearBasicBalance = yearReceived - yearBaseCost,
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
            bucketCount: Int,
            advancedFinanceEnabled: Boolean,
            expenseTitles: List<StudioHeadingItem> = emptyList(),
            showBaseCost: Boolean = true
        ): List<Double> {
            val values = MutableList(bucketCount) { 0.0 }
            orders.filter { period.includes(it, currentYear, currentMonth, yearBack) }.forEach { order ->
                val bucket = period.bucketIndex(order)
                if (bucket in values.indices) {
                    values[bucket] += if (advancedFinanceEnabled) {
                        adjustedDashboardNetProfit(order, expenseTitles, showBaseCost)
                    } else {
                        order.paidAmount - order.watchPurchasePrice
                    }
                }
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
    val icon: ImageVector?,
    // Small line under the title (shown as-is, e.g. the workspace's tax-rule name).
    val subtitle: String? = null,
    // Plain-words explanation of the figure (web shows it on hover; here a tap
    // on the card toggles it) — pass the English key, translated at render time.
    val hint: String? = null,
    // Optional second sentence appended to the hint. Kept as its own key so
    // each sentence translates on its own, mirroring web's `${t(a)} ${t(b)}`.
    val hintExtra: String? = null
)

private fun dashboardSummaryCards(
    stats: DashboardStats,
    currency: String,
    decimalSeparator: String,
    visibility: DashboardWidgetVisibility,
    hideNumbers: Boolean,
    advancedFinanceEnabled: Boolean,
    corporationTaxEnabled: Boolean = false,
    corporationTaxRate: Double = 19.0,
    revenueSubtitle: String? = null
): List<DashboardSummaryCardSpec> {
    if (!advancedFinanceEnabled) {
        return listOf(
            DashboardSummaryCardSpec("Received", money(stats.received, currency, decimalSeparator, hideNumbers), currency, StudioBlue, null),
            DashboardSummaryCardSpec("Base Cost", money(stats.baseCost, currency, decimalSeparator, hideNumbers), "", StudioRed, Icons.Filled.ShoppingCart),
            DashboardSummaryCardSpec("Basic Balance", money(stats.basicBalance, currency, decimalSeparator, hideNumbers), "", StudioGreen, Icons.Filled.Done)
        )
    }

    // Web's dashboardCostTotal: gated base cost (same gate as Net Profit) PLUS
    // extra spending — custom expenses stay in even when base cost is hidden,
    // because only baseCostTotal() is behind the financialShowBaseCost gate.
    val rolledCost = stats.breakdownBaseCost +
        stats.extraSpending +
        (if (!visibility.dashShowFee) stats.platformFee else 0.0) +
        (if (!visibility.dashShowShipping) stats.shipping else 0.0) +
        (if (!visibility.dashShowTax) stats.tax else 0.0)
    return buildList {
        // Revenue is invoiced order value; Payments Received is the cash that
        // actually arrived — the accrual vs cash split, side by side (web parity).
        if (visibility.dashShowRevenue) {
            add(DashboardSummaryCardSpec(
                "Revenue", money(stats.revenue, currency, decimalSeparator, hideNumbers), currency, StudioBlue, null,
                subtitle = revenueSubtitle,
                hint = "Invoiced order value in this range: paid + still owed (accrual basis).",
                hintExtra = "Cancelled and refunded orders are not counted."
            ))
            add(DashboardSummaryCardSpec(
                "Payments Received", money(stats.received, currency, decimalSeparator, hideNumbers), "", StudioBlue, Icons.Filled.Done,
                hint = "Money actually collected on these orders (cash basis)."
            ))
        }
        if (visibility.dashShowPending) {
            add(DashboardSummaryCardSpec(
                "Outstanding Balance", money(stats.pending, currency, decimalSeparator, hideNumbers), "", StudioWarningOrange, Icons.Filled.Schedule,
                hint = "What customers still owe on orders in this range — cancelled and refunded orders owe nothing."
            ))
        }
        if (visibility.dashShowCost) {
            add(DashboardSummaryCardSpec(
                "Cost", money(rolledCost, currency, decimalSeparator, hideNumbers), "", StudioRed, Icons.Filled.ShoppingCart,
                hint = "Base cost + extra spending, plus any fee/shipping/VAT cards you have hidden."
            ))
        }
        if (visibility.dashShowFee) {
            add(DashboardSummaryCardSpec("Platform Fee", money(stats.platformFee, currency, decimalSeparator, hideNumbers), "", StudioRed, Icons.Filled.Percent))
        }
        if (visibility.dashShowShipping) {
            add(DashboardSummaryCardSpec("Shipping", money(stats.shipping, currency, decimalSeparator, hideNumbers), "", StudioRed, Icons.Filled.LocalShipping))
        }
        if (visibility.dashShowTax) {
            add(DashboardSummaryCardSpec(
                "VAT Amount", money(stats.tax, currency, decimalSeparator, hideNumbers), "", StudioRed, Icons.Filled.AccountBalance,
                hint = "VAT recorded on these orders and set aside — not yet paid to HMRC."
            ))
        }
        if (visibility.dashShowProfit) {
            add(DashboardSummaryCardSpec(
                if (corporationTaxEnabled) "Profit before Corporation Tax" else "Net Profit", money(stats.netProfit, currency, decimalSeparator, hideNumbers), "", StudioGreen, Icons.Filled.Done,
                hint = "Revenue − base cost − extra spending − platform fee − shipping − VAT."
            ))
        }
        if (visibility.dashShowProfit && corporationTaxEnabled) {
            // Per-order CT, each rounded to 2 dp, then summed — matches the Mac and
            // web dashboards so every platform shows the same pennies.
            val corporationTax = stats.perOrderNetProfits.sumOf { kotlin.math.round(maxOf(0.0, it) * corporationTaxRate) / 100.0 }
            add(DashboardSummaryCardSpec("Corporation Tax (${corporationTaxRate.toInt()}%)", money(corporationTax, currency, decimalSeparator, hideNumbers), "", StudioRed, Icons.Filled.AccountBalance))
            add(DashboardSummaryCardSpec("Profit after CT", money(stats.netProfit - corporationTax, currency, decimalSeparator, hideNumbers), "", StudioGreen, Icons.Filled.Done))
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
    // Divide by the magnitude, not the signed value: after a loss year a
    // recovery is growth, and a signed denominator flips the sign.
    val percent = if (previous == 0.0) {
        if (current > 0.0) 100.0 else 0.0
    } else {
        kotlin.math.abs(delta / kotlin.math.abs(previous) * 100.0)
    }
    // Nothing moved is neither up nor down; "-0.0%" was the old reading.
    val sign = if (percent == 0.0) "" else if (delta >= 0) "+" else "-"
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
    Tax("tax", "VAT Amount", StudioRed),
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

    fun chartLabels(now: Calendar, locale: Locale = Locale.UK): List<String> {
        val daySdf = java.text.SimpleDateFormat("EEE", locale)
        val monthSdf = java.text.SimpleDateFormat("LLL", locale)
        return when (this) {
            Week -> (Calendar.MONDAY..Calendar.SATURDAY).toList().plus(Calendar.SUNDAY).map { dow ->
                val c = Calendar.getInstance(locale).apply { firstDayOfWeek = Calendar.MONDAY; set(Calendar.DAY_OF_WEEK, dow) }
                daySdf.format(c.time).replaceFirstChar { it.titlecase(locale) }
            }
            Month -> (1..now.getActualMaximum(Calendar.DAY_OF_MONTH)).map { it.toString() }
            Year, AllTime -> (0..11).map { m ->
                val c = Calendar.getInstance(locale).apply { set(Calendar.MONTH, m); set(Calendar.DAY_OF_MONTH, 1) }
                monthSdf.format(c.time).replaceFirstChar { it.titlecase(locale) }
            }
        }
    }

    fun chartAxisLabels(now: Calendar, locale: Locale = Locale.UK): List<String> {
        val daySdf = java.text.SimpleDateFormat("EEE", locale)
        val monthSdf = java.text.SimpleDateFormat("LLL", locale)
        return when (this) {
            Week -> listOf(Calendar.MONDAY, Calendar.WEDNESDAY, Calendar.FRIDAY, Calendar.SUNDAY).map { dow ->
                val c = Calendar.getInstance(locale).apply { firstDayOfWeek = Calendar.MONDAY; set(Calendar.DAY_OF_WEEK, dow) }
                daySdf.format(c.time).replaceFirstChar { it.titlecase(locale) }
            }
            Month -> {
                val last = now.getActualMaximum(Calendar.DAY_OF_MONTH)
                listOf("1", (last / 3).coerceAtLeast(2).toString(), ((last * 2) / 3).toString(), last.toString())
            }
            Year, AllTime -> listOf(0, 3, 6, 9, 11).map { m ->
                val c = Calendar.getInstance(locale).apply { set(Calendar.MONTH, m); set(Calendar.DAY_OF_MONTH, 1) }
                monthSdf.format(c.time).replaceFirstChar { it.titlecase(locale) }
            }
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

private fun extraSpendingCsv(groups: List<ExtraSpendingGroup>, locale: Locale): String {
    fun esc(value: String): String = "\"" + value.replace("\"", "\"\"") + "\""
    val df = java.text.SimpleDateFormat("yyyy-MM-dd", locale)
    val sb = StringBuilder()
    sb.append("Date,Customer,Design,Reference,Heading,Description,Amount\n")
    for (group in groups) {
        for (entry in group.entries) {
            sb.append(esc(df.format(entry.paymentDate))).append(',')
            sb.append(esc(entry.customerName)).append(',')
            sb.append(esc(entry.designName)).append(',')
            sb.append(esc(entry.watchRef)).append(',')
            sb.append(esc(entry.heading)).append(',')
            sb.append(esc(entry.description)).append(',')
            sb.append(String.format(Locale.UK, "%.2f", entry.amount)).append('\n')
        }
    }
    return sb.toString()
}

private fun shareExtraSpendingCsv(context: android.content.Context, csv: String, title: String) {
    // Share an actual .csv file (via FileProvider) rather than raw text in the message
    // body, matching the Mac/Web "download CSV" behaviour and the order PDF export here.
    runCatching {
        val exportDir = java.io.File(context.cacheDir, "exports").apply { mkdirs() }
        val file = java.io.File(exportDir, "extra_spending_${System.currentTimeMillis()}.csv")
        file.writeText(csv)
        val uri = androidx.core.content.FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
            type = "text/csv"
            putExtra(android.content.Intent.EXTRA_SUBJECT, title)
            putExtra(android.content.Intent.EXTRA_STREAM, uri)
            addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(android.content.Intent.createChooser(intent, title))
    }.onFailure {
        android.widget.Toast.makeText(context, "CSV export failed.", android.widget.Toast.LENGTH_SHORT).show()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FinancialBreakdownRow(label: String, value: String, valueColor: Color, strong: Boolean = false) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            label,
            fontSize = if (strong) 14.sp else 13.sp,
            fontWeight = if (strong) FontWeight.Bold else FontWeight.SemiBold,
            color = if (strong) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f)
        )
        Text(
            value,
            fontSize = if (strong) 16.sp else 13.sp,
            fontWeight = FontWeight.Bold,
            color = valueColor
        )
    }
}

@Composable
private fun FinancialBreakdownCard(
    stats: DashboardStats,
    currency: String,
    decimalSeparator: String,
    hideNumbers: Boolean,
    corporationTaxEnabled: Boolean,
    corporationTaxRate: Double,
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    fun amount(value: Double, negative: Boolean = false): String {
        val text = money(value, currency, decimalSeparator, hideNumbers)
        return if (negative && !hideNumbers) "-$text" else text
    }
    // Same per-order rounded CT rule as the summary cards and the order card.
    val corporationTax = stats.perOrderNetProfits.sumOf { kotlin.math.round(maxOf(0.0, it) * corporationTaxRate) / 100.0 }
    val divider = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(t("Financial Breakdown"), fontSize = 15.sp, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(4.dp))
            FinancialBreakdownRow(t("Revenue"), amount(stats.revenue), MaterialTheme.colorScheme.onSurface)
            // Visibility line, not part of the reconciliation: money sitting on
            // cancelled/refunded orders in this range, already excluded from
            // every figure above and below (web parity).
            if (stats.cancelledCount > 0) {
                HorizontalDivider(color = divider)
                FinancialBreakdownRow(
                    "${t("Cancelled or refunded")} (${stats.cancelledCount})",
                    amount(stats.cancelledTotal),
                    MaterialTheme.colorScheme.onSurface
                )
            }
            HorizontalDivider(color = divider)
            FinancialBreakdownRow(t("Base Cost"), amount(stats.breakdownBaseCost, negative = true), StudioRed)
            HorizontalDivider(color = divider)
            FinancialBreakdownRow(t("Extra Spending"), amount(stats.extraSpending, negative = true), StudioRed)
            HorizontalDivider(color = divider)
            FinancialBreakdownRow(t("Platform Fee"), amount(stats.platformFee, negative = true), StudioRed)
            HorizontalDivider(color = divider)
            FinancialBreakdownRow(t("Shipping"), amount(stats.shipping, negative = true), StudioRed)
            HorizontalDivider(color = divider)
            FinancialBreakdownRow(t("VAT Amount"), amount(stats.tax, negative = true), StudioRed)
            HorizontalDivider(color = divider)
            if (corporationTaxEnabled) {
                FinancialBreakdownRow(t("Profit before Corporation Tax"), amount(stats.netProfit), StudioGreen)
                HorizontalDivider(color = divider)
                FinancialBreakdownRow("${t("Corporation Tax")} (${corporationTaxRate.toInt()}%)", amount(corporationTax, negative = true), StudioRed)
                HorizontalDivider(color = divider)
                FinancialBreakdownRow(t("Net Profit (after CT)"), amount(stats.netProfit - corporationTax), StudioGreen, strong = true)
            } else {
                FinancialBreakdownRow(t("Net Profit"), amount(stats.netProfit), StudioGreen, strong = true)
            }
        }
    }
}

@Composable
private fun ExtraSpendingSummarySection(
    orders: List<StudioOrder>,
    workspaceSettings: StudioWorkspaceSettings,
    currency: String,
    decimalSeparator: String,
    hideNumbers: Boolean,
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val locale = uk.co.eggcraft.studioflow.language.studioLocale(lang)
    val context = androidx.compose.ui.platform.LocalContext.current
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

    val workspaceExpenseTitles: List<StudioHeadingItem> = workspaceSettings.financialExpenseItems

    val groups: List<ExtraSpendingGroup> = remember(orders, rangeStart, rangeEnd, incBase, incShipping, incFee, incTax, workspaceExpenseTitles) {
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
            // Per-order spending headings (fall back to the workspace template).
            for (item in dashboardOrderExpenseTitles(o, workspaceExpenseTitles)) {
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
                        IconButton(
                            onClick = { shareExtraSpendingCsv(context, extraSpendingCsv(groups, locale), t("Export CSV")) },
                            enabled = groups.isNotEmpty()
                        ) {
                            Icon(Icons.Filled.Share, contentDescription = t("Export CSV"))
                        }
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
                                    t("From") + ": " + (customStartMs?.let { formatDateShort(it, locale) } ?: "—"),
                                    modifier = Modifier.padding(10.dp), fontSize = 12.sp, fontWeight = FontWeight.SemiBold
                                )
                            }
                            Surface(
                                modifier = Modifier.weight(1f).clickable { pickingEnd = true },
                                shape = RoundedCornerShape(10.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant
                            ) {
                                Text(
                                    t("To") + ": " + (customEndMs?.let { formatDateShort(it, locale) } ?: "—"),
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
                        ToggleRow(t("Base Cost"), incBase) { incBase = it; page = 0 }
                        ToggleRow(t("Shipping"), incShipping) { incShipping = it; page = 0 }
                        ToggleRow(t("Platform Fee"), incFee) { incFee = it; page = 0 }
                        ToggleRow(t("VAT / Tax"), incTax) { incTax = it; page = 0 }
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
                                            Text("${t(e.heading)} · ${t(e.description)}", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                            Text(formatDateShort(e.paymentDate.time, locale), fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
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

// Per-order spending headings for dashboard aggregation: an order's own list
// (customFields.orderExpenseItemsJSON) if it has one, otherwise the workspace template.
// internal: WidgetSummaryBridge reuses these so the widgets show the exact dashboard figures.
internal fun dashboardCustomExpenseTotal(order: StudioOrder, workspaceTitles: List<StudioHeadingItem>): Double {
    var total = 0.0
    for (item in dashboardOrderExpenseTitles(order, workspaceTitles)) {
        val raw = order.customFields["financialExpense::${item.title}"]
            ?: order.customFields["financialExpense::${item.id}"]
        total += raw?.replace(",", "")?.toDoubleOrNull() ?: 0.0
    }
    return total
}

// Per-order profit with custom spending subtracted — matches the Mac and web
// dashboards, which already deduct per-order spending from net profit.
// When the workspace hides the base cost field (financialShowBaseCost = false),
// the purchase price is not part of that workspace's cost model: add it back,
// mirroring web's baseCostTotal() returning 0 in that case (finance.ts).
internal fun adjustedDashboardNetProfit(
    order: StudioOrder,
    workspaceTitles: List<StudioHeadingItem>,
    showBaseCost: Boolean
): Double =
    order.netProfit +
        (if (showBaseCost) 0.0 else order.watchPurchasePrice) -
        dashboardCustomExpenseTotal(order, workspaceTitles)

private fun dashboardOrderExpenseTitles(order: StudioOrder, workspace: List<StudioHeadingItem>): List<StudioHeadingItem> {
    val raw = order.customFields["orderExpenseItemsJSON"]?.trim().orEmpty()
    if (raw.isEmpty()) return workspace
    return try {
        val arr = org.json.JSONArray(raw)
        (0 until arr.length()).mapNotNull { i ->
            val obj = arr.optJSONObject(i) ?: return@mapNotNull null
            val title = obj.optString("title").trim()
            if (title.isBlank()) null else StudioHeadingItem(obj.optString("id").trim().ifBlank { title }, title)
        }
    } catch (_: Throwable) {
        workspace
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

private fun formatDateShort(ms: Long, locale: Locale = Locale.UK): String {
    val sdf = java.text.SimpleDateFormat("dd MMM yyyy", locale)
    return sdf.format(Date(ms))
}
