package uk.co.eggcraft.studioflow.features.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.ui.draw.clip

// Settings design system (design handoff, Sept 2026) — the tokens and shell
// pieces every Settings screen shares on Android, mirroring the web's
// .settings-workspace and the Mac/iPhone NDSettings: canvas #F3F5F9, surface
// #FFFFFF, text #141827, muted #667085, accent #5865E8, success #2F9A55,
// caution #D97706, danger #D64545; cards 12dp with a 1dp border, 40–44dp
// controls, 20–24dp gaps, no heavy shadows. Dark mode keeps the roles.
object NDSettings {
    val accent = Color(0xFF5865E8)
    val success = Color(0xFF2F9A55)
    val caution = Color(0xFFD97706)
    val danger = Color(0xFFD64545)
    val sidebarWidth = 275.dp
    val cardRadius = 12.dp
    val rowHeight = 44.dp
    val controlHeight = 40.dp
    val cardPadding = 20.dp
    val sectionGap = 20.dp

    @Composable fun canvas(): Color = if (isSystemInDarkTheme()) Color(0xFF141414) else Color(0xFFF3F5F9)
    @Composable fun surface(): Color = if (isSystemInDarkTheme()) Color(0xFF202020) else Color(0xFFFFFFFF)
    @Composable fun panel(): Color = if (isSystemInDarkTheme()) Color(0xFF292929) else Color(0xFFF7F8FB)
    @Composable fun border(): Color = if (isSystemInDarkTheme()) Color(0x1AFFFFFF) else Color(0xFFE3E6EE)
    @Composable fun text(): Color = if (isSystemInDarkTheme()) Color(0xFFF0F0F0) else Color(0xFF141827)
    @Composable fun muted(): Color = if (isSystemInDarkTheme()) Color(0xFFA3A3A3) else Color(0xFF667085)
    @Composable fun rowActive(): Color = if (isSystemInDarkTheme()) accent.copy(alpha = 0.22f) else Color(0xFFECEEFC)
}

enum class NDSettingsStatus { Saved, Dirty, Saving, ReadOnly }

/** The save-state pill: colour always travels with words. */
@Composable
fun NDStatusPill(status: NDSettingsStatus, text: String) {
    val color = when (status) {
        NDSettingsStatus.Saved -> NDSettings.success
        NDSettingsStatus.Dirty -> NDSettings.caution
        NDSettingsStatus.Saving -> NDSettings.accent
        NDSettingsStatus.ReadOnly -> NDSettings.muted()
    }
    val mark = when (status) {
        NDSettingsStatus.Saved -> "✓"
        NDSettingsStatus.Dirty -> "●"
        NDSettingsStatus.Saving -> "…"
        NDSettingsStatus.ReadOnly -> "○"
    }
    Surface(shape = RoundedCornerShape(999.dp), color = color.copy(alpha = 0.12f)) {
        Row(modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(mark, color = color, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            Text(text, color = color, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Eyebrow + title + one-sentence purpose, the save state and actions on the right. */
@Composable
fun NDSettingsPageHeader(
    eyebrow: String,
    title: String,
    subtitle: String,
    status: NDSettingsStatus? = null,
    statusText: String = "",
    compact: Boolean = false,
    actions: (@Composable () -> Unit)? = null
) {
    val padding = if (compact) PaddingValues(horizontal = 16.dp, vertical = 14.dp) else PaddingValues(horizontal = 22.dp, vertical = 18.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(NDSettings.surface(), RoundedCornerShape(NDSettings.cardRadius))
            .border(1.dp, NDSettings.border(), RoundedCornerShape(NDSettings.cardRadius))
            .padding(padding),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(eyebrow.uppercase(), fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.9.sp, color = NDSettings.muted())
                Text(title, fontSize = if (compact) 22.sp else 26.sp, fontWeight = FontWeight.Bold, color = NDSettings.text(), maxLines = 2, overflow = TextOverflow.Ellipsis, lineHeight = if (compact) 26.sp else 30.sp)
                if (subtitle.isNotBlank()) Text(subtitle, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = NDSettings.muted(), lineHeight = 20.sp)
            }
            if (!compact && (status != null || actions != null)) {
                Spacer(modifier = Modifier.width(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (status != null) NDStatusPill(status, statusText)
                    actions?.invoke()
                }
            }
        }
        if (compact && (status != null || actions != null)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (status != null) NDStatusPill(status, statusText)
                actions?.invoke()
            }
        }
    }
}

/** A card's heading: icon tile, title, one-line purpose, something on the right. */
@Composable
fun NDSettingsCardHead(icon: ImageVector?, title: String, subtitle: String = "", tint: Color = NDSettings.accent, aside: (@Composable () -> Unit)? = null) {
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        if (icon != null) {
            Box(modifier = Modifier.size(32.dp).background(tint.copy(alpha = 0.12f), RoundedCornerShape(9.dp)), contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(17.dp))
            }
        }
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = NDSettings.text())
            if (subtitle.isNotBlank()) Text(subtitle, fontSize = 13.sp, color = NDSettings.muted(), lineHeight = 18.sp)
        }
        aside?.invoke()
    }
}

/** The card surface: 12dp radius, 1dp border, 20dp padding, no shadow. */
@Composable
fun NDSettingsSurface(
    modifier: Modifier = Modifier,
    padding: PaddingValues = PaddingValues(NDSettings.cardPadding),
    spacing: androidx.compose.ui.unit.Dp = 16.dp,
    borderColor: Color? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(NDSettings.surface(), RoundedCornerShape(NDSettings.cardRadius))
            .border(1.dp, borderColor ?: NDSettings.border(), RoundedCornerShape(NDSettings.cardRadius))
            .padding(padding),
        verticalArrangement = Arrangement.spacedBy(spacing),
        content = content
    )
}

/** The destructive region: a muted red frame, a red eyebrow, calm copy. */
@Composable
fun NDDangerCard(eyebrow: String, content: @Composable ColumnScope.() -> Unit) {
    NDSettingsSurface(borderColor = NDSettings.danger.copy(alpha = 0.45f)) {
        Text(eyebrow, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = NDSettings.danger)
        content()
    }
}

/** A collapsible group heading in the sidebar or the phone list. */
@Composable
fun NDSettingsGroupHeader(title: String, collapsed: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp)
            .height(32.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(title.uppercase(), fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.9.sp, color = NDSettings.muted(), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = NDSettings.muted(), modifier = Modifier.size(16.dp).rotate(if (collapsed) -90f else 0f))
    }
}

/** One sidebar row: 44dp, 20dp line icon, active on a pale periwinkle fill with one accent edge. */
@Composable
fun NDSettingsSidebarRow(title: String, icon: ImageVector, selected: Boolean, badgeCount: Int = 0, onClick: () -> Unit) {
    val text = if (selected) NDSettings.accent else NDSettings.text()
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(NDSettings.rowHeight)
            .background(if (selected) NDSettings.rowActive() else Color.Transparent, RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
    ) {
        if (selected) {
            Box(modifier = Modifier.align(Alignment.CenterStart).padding(vertical = 10.dp).width(3.dp).height(24.dp).background(NDSettings.accent, RoundedCornerShape(999.dp)))
        }
        Row(modifier = Modifier.fillMaxWidth().padding(start = 14.dp, end = 12.dp).height(NDSettings.rowHeight), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(icon, contentDescription = null, tint = if (selected) NDSettings.accent else NDSettings.muted(), modifier = Modifier.size(20.dp))
            Text(title, fontSize = 14.sp, fontWeight = if (selected) FontWeight.Bold else FontWeight.SemiBold, color = text, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            if (badgeCount > 0) NDBadge(badgeCount)
        }
    }
}

@Composable
fun NDBadge(count: Int) {
    Surface(shape = RoundedCornerShape(999.dp), color = NDSettings.danger) {
        Text("$count", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
    }
}

/** A phone list row: the same tokens, a chevron instead of the active edge. */
@Composable
fun NDSettingsListRow(title: String, subtitle: String, icon: ImageVector, badgeCount: Int = 0, showsDivider: Boolean = true, onClick: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(icon, contentDescription = null, tint = NDSettings.accent, modifier = Modifier.size(20.dp))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(title, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = NDSettings.text(), maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (subtitle.isNotBlank()) Text(subtitle, fontSize = 12.sp, color = NDSettings.muted(), maxLines = 2, overflow = TextOverflow.Ellipsis, lineHeight = 16.sp)
            }
            if (badgeCount > 0) NDBadge(badgeCount)
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = NDSettings.muted(), modifier = Modifier.size(18.dp))
        }
        if (showsDivider) Box(modifier = Modifier.fillMaxWidth().padding(start = 46.dp).height(1.dp).background(NDSettings.border()))
    }
}

/** The sidebar search: 40dp, canvas fill, 1dp border. */
@Composable
fun NDSettingsSearchField(value: String, placeholder: String, onValueChange: (String) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(NDSettings.controlHeight)
            .background(NDSettings.canvas(), RoundedCornerShape(10.dp))
            .border(1.dp, NDSettings.border(), RoundedCornerShape(10.dp))
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Icon(Icons.Filled.Search, contentDescription = null, tint = NDSettings.muted(), modifier = Modifier.size(16.dp))
        Box(modifier = Modifier.weight(1f)) {
            if (value.isEmpty()) Text(placeholder, fontSize = 14.sp, color = NDSettings.muted())
            CompositionLocalProvider(LocalContentColor provides NDSettings.text()) {
                BasicTextField(
                    value = value,
                    onValueChange = onValueChange,
                    singleLine = true,
                    textStyle = TextStyle(fontSize = 14.sp, color = NDSettings.text()),
                    cursorBrush = SolidColor(NDSettings.accent),
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
        if (value.isNotEmpty()) {
            Icon(Icons.Filled.Close, contentDescription = null, tint = NDSettings.muted(), modifier = Modifier.size(16.dp).clickable { onValueChange("") })
        }
    }
}

/** A theme choice drawn as the window it would produce; System is split down the middle. */
@Composable
fun NDThemePreviewTile(title: String, mode: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    @Composable
    fun mock(dark: Boolean, modifier: Modifier) {
        val ground = if (dark) Color(0xFF1C1C1C) else Color(0xFFF3F5F9)
        val panel = if (dark) Color(0xFF2E2E2E) else Color.White
        val line = if (dark) Color(0x38FFFFFF) else Color(0x1A000000)
        Row(modifier = modifier.background(ground).padding(6.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Column(modifier = Modifier.width(22.dp).fillMaxHeight().background(panel, RoundedCornerShape(3.dp)).padding(4.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                repeat(4) { Box(modifier = Modifier.fillMaxWidth().height(3.dp).background(line, RoundedCornerShape(1.dp))) }
            }
            Column(modifier = Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Box(modifier = Modifier.fillMaxWidth().height(14.dp).background(panel, RoundedCornerShape(3.dp)))
                Column(modifier = Modifier.fillMaxWidth().weight(1f).background(panel, RoundedCornerShape(3.dp)).padding(5.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Box(modifier = Modifier.width(40.dp).height(3.dp).background(line, RoundedCornerShape(1.dp)))
                    Box(modifier = Modifier.width(40.dp).height(3.dp).background(line, RoundedCornerShape(1.dp)))
                    Box(modifier = Modifier.width(26.dp).height(3.dp).background(line, RoundedCornerShape(1.dp)))
                }
            }
        }
    }
    val frame = if (selected) NDSettings.accent else NDSettings.border()
    Box(modifier = modifier) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(if (selected) NDSettings.rowActive().copy(alpha = 0.6f) else NDSettings.surface(), RoundedCornerShape(10.dp))
                .border(if (selected) 2.dp else 1.dp, frame, RoundedCornerShape(10.dp))
                .clickable(onClick = onClick)
                .padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(modifier = Modifier.fillMaxWidth().height(78.dp).clip(RoundedCornerShape(8.dp)).border(1.dp, NDSettings.border(), RoundedCornerShape(8.dp))) {
                if (mode == "System") {
                    mock(dark = false, modifier = Modifier.weight(1f).fillMaxHeight())
                    mock(dark = true, modifier = Modifier.weight(1f).fillMaxHeight())
                } else {
                    mock(dark = mode == "Dark", modifier = Modifier.weight(1f).fillMaxHeight())
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                RadioButton(selected = selected, onClick = onClick, colors = RadioButtonDefaults.colors(selectedColor = NDSettings.accent, unselectedColor = NDSettings.muted()), modifier = Modifier.size(20.dp))
                Text(title, fontSize = 13.sp, fontWeight = if (selected) FontWeight.Bold else FontWeight.SemiBold, color = NDSettings.text())
            }
        }
        if (selected) {
            Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = NDSettings.accent, modifier = Modifier.align(Alignment.TopEnd).padding(6.dp).size(18.dp).background(NDSettings.surface(), CircleShape))
        }
    }
}

/** A read-only fact in a card: small label, value, optional action on the right. */
@Composable
fun NDFactRow(label: String, value: String, icon: ImageVector? = null, modifier: Modifier = Modifier, trailing: (@Composable () -> Unit)? = null) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .background(NDSettings.panel(), RoundedCornerShape(9.dp))
            .border(1.dp, NDSettings.border(), RoundedCornerShape(9.dp))
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (icon != null) Icon(icon, contentDescription = null, tint = NDSettings.muted(), modifier = Modifier.size(18.dp))
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(label.uppercase(), fontSize = 10.5.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.6.sp, color = NDSettings.muted())
            Text(value, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, color = NDSettings.text(), maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        trailing?.invoke()
    }
}

/** An outlined secondary button in the handoff's proportions. */
@Composable
fun NDSecondaryButton(title: String, icon: ImageVector? = null, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .height(36.dp)
            .background(NDSettings.surface(), RoundedCornerShape(9.dp))
            .border(1.dp, NDSettings.border(), RoundedCornerShape(9.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        if (icon != null) Icon(icon, contentDescription = null, tint = NDSettings.text(), modifier = Modifier.size(14.dp))
        Text(title, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = NDSettings.text())
    }
}
