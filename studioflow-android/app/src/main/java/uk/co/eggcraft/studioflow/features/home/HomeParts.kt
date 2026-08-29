package uk.co.eggcraft.studioflow.features.home

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * The marks every Home card is built from, drawn to match the reference sheet.
 *
 * Colour never carries meaning on its own here: every figure a colour tints is
 * also named in words, so the cards still read with the colour removed (§20).
 */
object HomeTone {
    val accent = Color(0xFF2563EB)
    val green = Color(0xFF15803D)
    val orange = Color(0xFFC2410C)
    val red = Color(0xFFDC2626)
    val purple = Color(0xFF6D28D9)
    val teal = Color(0xFF0F766E)
    val amber = Color(0xFFD97706)
    val slate = Color(0xFF475569)
}

/** Six dots in two columns — a braille glyph renders at a different weight in
 *  every font, which made the same card look different on every platform. */
@Composable
fun HomeGripDots(modifier: Modifier = Modifier) {
    val tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f)
    Column(modifier.width(9.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        repeat(3) {
            Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                repeat(2) { Box(Modifier.size(3.dp).background(tint, CircleShape)) }
            }
        }
    }
}

/** A ringed badge gives every card the same anchor whatever glyph it carries. */
@Composable
fun HomeBadge(icon: ImageVector, tone: Color = HomeTone.accent) {
    Box(
        Modifier.size(38.dp).border(2.dp, tone, CircleShape),
        contentAlignment = Alignment.Center
    ) {
        Icon(icon, contentDescription = null, tint = tone, modifier = Modifier.size(17.dp))
    }
}

@Composable
fun HomeProgressBar(fraction: Float, modifier: Modifier = Modifier) {
    Box(
        modifier
            .fillMaxWidth()
            .height(6.dp)
            .background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.2f), RoundedCornerShape(3.dp))
    ) {
        Box(
            Modifier
                .fillMaxWidth(fraction.coerceIn(0f, 1f))
                .height(6.dp)
                .background(HomeTone.accent, RoundedCornerShape(3.dp))
        )
    }
}

@Composable
fun HomeEyebrow(text: String, strong: Boolean = true) {
    Text(
        text,
        fontSize = if (strong) 12.sp else 11.sp,
        fontWeight = if (strong) FontWeight.Bold else FontWeight.Normal,
        color = if (strong) MaterialTheme.colorScheme.onSurface.copy(alpha = 0.85f)
        else MaterialTheme.colorScheme.onSurfaceVariant,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis
    )
}

@Composable
fun HomeMetricTile(label: String, value: String, tone: Color = HomeTone.accent, sub: String = "", modifier: Modifier = Modifier) {
    Column(
        modifier
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f), RoundedCornerShape(12.dp))
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp)
    ) {
        Box(Modifier.size(20.dp).background(tone.copy(alpha = 0.16f), CircleShape))
        Text(label, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, maxLines = 1,
            overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = tone,
            maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (sub.isNotEmpty()) {
            Text(sub, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
    }
}

/** Two figures side by side, divided — the pattern under every 1x1 headline. */
@Composable
fun HomeSplitPair(
    leftLabel: String, leftValue: String, leftTone: Color = Color.Unspecified,
    rightLabel: String, rightValue: String, rightTone: Color = Color.Unspecified
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        HomeFigure(leftLabel, leftValue, leftTone, Modifier.weight(1f))
        Box(
            Modifier
                .width(1.dp)
                .height(26.dp)
                .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.25f))
        )
        HomeFigure(rightLabel, rightValue, rightTone, Modifier.weight(1f).padding(start = 12.dp))
    }
}

@Composable
fun HomeFigure(label: String, value: String, tone: Color = Color.Unspecified, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(label, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        Text(value, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            color = if (tone == Color.Unspecified) MaterialTheme.colorScheme.onSurface else tone)
    }
}

@Composable
fun HomeChip(text: String, tone: Color = HomeTone.accent) {
    Text(
        text,
        fontSize = 10.sp,
        fontWeight = FontWeight.Bold,
        color = tone,
        maxLines = 1,
        modifier = Modifier
            .background(tone.copy(alpha = 0.12f), RoundedCornerShape(999.dp))
            .padding(horizontal = 8.dp, vertical = 2.dp)
    )
}

@Composable
fun HomePanel(content: @Composable () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f), RoundedCornerShape(12.dp))
            .padding(horizontal = 11.dp, vertical = 9.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp)
    ) { content() }
}

/** A filled tick for done, an arrow for the step you are on, a hollow ring for
 *  the rest — the shape carries the state, not the colour alone (§20). */
@Composable
fun HomeCheckRow(label: String, state: String) {
    Row(
        Modifier
            .fillMaxWidth()
            .then(
                if (state == "current") Modifier
                    .background(HomeTone.accent.copy(alpha = 0.07f), RoundedCornerShape(8.dp))
                    .padding(horizontal = 8.dp)
                else Modifier
            )
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(9.dp)
    ) {
        when (state) {
            "done" -> Icon(Icons.Filled.CheckCircle, null, Modifier.size(15.dp), HomeTone.green)
            "current" -> Icon(Icons.Filled.ArrowForward, null, Modifier.size(15.dp), HomeTone.accent)
            else -> Icon(Icons.Outlined.Circle, null, Modifier.size(15.dp),
                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f))
        }
        Text(
            label,
            fontSize = 12.sp,
            fontWeight = if (state == "current") FontWeight.Bold else FontWeight.Normal,
            color = when (state) {
                "done" -> MaterialTheme.colorScheme.onSurfaceVariant
                "current" -> HomeTone.accent
                else -> MaterialTheme.colorScheme.onSurface
            },
            textDecoration = if (state == "done") TextDecoration.LineThrough else TextDecoration.None,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
fun HomeCostRow(colour: Color, label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(17.dp).background(colour, CircleShape))
        Spacer(Modifier.width(9.dp))
        Text(label, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        Text(value, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

/** One series as a line, and optionally the area under it. */
@Composable
fun HomeSeriesChart(
    series: List<Pair<List<Double>, Color>>,
    fillFirst: Boolean,
    modifier: Modifier = Modifier
) {
    val peak = maxOf(1.0, series.flatMap { it.first }.maxOrNull() ?: 1.0)
    Canvas(modifier.fillMaxWidth().height(56.dp)) {
        series.forEachIndexed { index, (values, colour) ->
            if (values.size < 2) return@forEachIndexed
            val step = size.width / (values.size - 1)
            val path = Path()
            values.forEachIndexed { i, value ->
                val x = step * i
                val y = size.height - (size.height * (value.coerceAtLeast(0.0) / peak)).toFloat()
                if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            if (fillFirst && index == 0) {
                val area = Path()
                area.addPath(path)
                area.lineTo(size.width, size.height)
                area.lineTo(0f, size.height)
                area.close()
                drawPath(area, colour.copy(alpha = 0.14f))
            }
            drawPath(path, colour, style = Stroke(width = 2.2f))
        }
    }
}

/** Two slices, drawn as an arc rather than a component so the ring stays thin. */
@Composable
fun HomeDonut(share: Float, modifier: Modifier = Modifier) {
    Canvas(modifier.size(74.dp)) {
        val stroke = Stroke(width = 11.dp.toPx())
        val inset = stroke.width / 2
        drawArc(
            color = HomeTone.accent.copy(alpha = 0.30f),
            startAngle = 0f, sweepAngle = 360f, useCenter = false,
            topLeft = Offset(inset, inset),
            size = androidx.compose.ui.geometry.Size(size.width - stroke.width, size.height - stroke.width),
            style = stroke
        )
        drawArc(
            color = HomeTone.accent,
            startAngle = -90f, sweepAngle = 360f * share.coerceIn(0f, 1f), useCenter = false,
            topLeft = Offset(inset, inset),
            size = androidx.compose.ui.geometry.Size(size.width - stroke.width, size.height - stroke.width),
            style = stroke
        )
    }
}

/** One bar, three segments, and a key that names each one. */
@Composable
fun HomeMixBar(segments: List<Triple<String, Int, Color>>) {
    val total = maxOf(1, segments.sumOf { it.second })
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            Modifier
                .fillMaxWidth()
                .height(9.dp)
                .background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.16f), RoundedCornerShape(999.dp)),
            horizontalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            segments.forEach { (_, count, colour) ->
                if (count > 0) {
                    Box(
                        Modifier
                            .weight(count.toFloat() / total)
                            .fillMaxSize()
                            .background(colour, RoundedCornerShape(999.dp))
                    )
                }
            }
            Spacer(Modifier.weight(0.0001f))
        }
        Row {
            segments.forEachIndexed { index, (label, count, colour) ->
                if (index > 0) {
                    Box(Modifier.width(1.dp).height(26.dp)
                        .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)))
                }
                Column(Modifier.weight(1f).padding(horizontal = 8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(Modifier.size(9.dp).background(colour, CircleShape))
                        Text(label, fontSize = 10.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text("$count", fontSize = 15.sp, fontWeight = FontWeight.ExtraBold)
                }
            }
        }
    }
}

@Composable
fun HomeDivider() {
    HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
}
