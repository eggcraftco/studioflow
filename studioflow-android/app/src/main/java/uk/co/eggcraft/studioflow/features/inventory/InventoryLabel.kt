package uk.co.eggcraft.studioflow.features.inventory

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import java.net.URLEncoder

/**
 * The Android half of studioflow-web/lib/studioflow/inventory.ts.
 *
 * A bare item number is useless to a phone camera: it offers a web search for
 * a meaningless string. The code has to be a link that lands on the item, so
 * the value is built here once and every surface reads it — on the web the
 * printable label and the on-screen code drifted apart, and the on-screen one
 * silently went back to sending people to Google.
 */
object InventoryLabel {
    const val ORIGIN = "https://nivadesk.app"

    fun qrValue(reference: String): String {
        val clean = reference.trim()
        if (clean.isEmpty()) return "$ORIGIN/inventory"
        // URLEncoder is form encoding: it writes a space as "+" where
        // encodeURIComponent writes %20. Align them so the three platforms
        // print the SAME url.
        val encoded = URLEncoder.encode(clean, "UTF-8")
            .replace("+", "%20")
            .replace("%21", "!").replace("%27", "'")
            .replace("%28", "(").replace("%29", ")")
            .replace("%7E", "~")
        return "$ORIGIN/inventory?item=$encoded"
    }

    fun qrBitmap(value: String, sizePx: Int = 480): Bitmap? = try {
        val matrix = QRCodeWriter().encode(
            value,
            BarcodeFormat.QR_CODE,
            sizePx,
            sizePx,
            mapOf(EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M, EncodeHintType.MARGIN to 0)
        )
        Bitmap.createBitmap(matrix.width, matrix.height, Bitmap.Config.ARGB_8888).apply {
            for (x in 0 until matrix.width) {
                for (y in 0 until matrix.height) {
                    setPixel(x, y, if (matrix[x, y]) Color.BLACK else Color.WHITE)
                }
            }
        }
    } catch (_: Exception) {
        null
    }
}

/**
 * The QR block on an item, matching the web panel's "QR / Barcode" card: the
 * code, the number printed underneath so it survives a dead phone battery, and
 * a line saying what scanning it does.
 */
@Composable
fun InventoryQrCard(reference: String, t: (String) -> String) {
    val bitmap = remember(reference) { InventoryLabel.qrBitmap(InventoryLabel.qrValue(reference)) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f), RoundedCornerShape(12.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            t("QR / Barcode"),
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (bitmap != null) {
                Image(
                    bitmap = bitmap.asImageBitmap(),
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    filterQuality = androidx.compose.ui.graphics.FilterQuality.None,
                    modifier = Modifier.size(96.dp)
                )
            } else {
                Spacer(Modifier.size(96.dp))
            }
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(reference, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                Text(
                    t("Scan to view item"),
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

/**
 * A printable label for one item.
 *
 * Its job is to survive on a drawer: the number big enough to read at arm's
 * length, the QR beside it, and the workshop's name so a stray label can be
 * traced back. A phone has no printer, so this shares the label as an image —
 * Android's print service picks it up from the share sheet.
 */
@Composable
fun InventoryLabelDialog(
    reference: String,
    name: String,
    location: String,
    workspaceName: String,
    t: (String) -> String,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val bitmap = remember(reference) { InventoryLabel.qrBitmap(InventoryLabel.qrValue(reference), 360) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(t("Label"), fontSize = 15.sp, fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(androidx.compose.ui.graphics.Color.White, RoundedCornerShape(8.dp))
                        .padding(12.dp)
                ) {
                    if (bitmap != null) {
                        Image(
                            bitmap = bitmap.asImageBitmap(),
                            contentDescription = null,
                            filterQuality = androidx.compose.ui.graphics.FilterQuality.None,
                            modifier = Modifier.size(84.dp)
                        )
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(
                            reference,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = androidx.compose.ui.graphics.Color.Black
                        )
                        Text(
                            name,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = androidx.compose.ui.graphics.Color.Black
                        )
                        if (location.isNotBlank()) {
                            Text(location, fontSize = 9.sp, color = androidx.compose.ui.graphics.Color.DarkGray)
                        }
                        if (workspaceName.isNotBlank()) {
                            Text(workspaceName, fontSize = 7.sp, color = androidx.compose.ui.graphics.Color.Gray)
                        }
                    }
                }
                Text(
                    t("The number stays readable long after any phone is gone."),
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(
                        Intent.EXTRA_TEXT,
                        "$reference — $name\n" + InventoryLabel.qrValue(reference)
                    )
                }
                context.startActivity(Intent.createChooser(send, t("Label")))
            }) { Text(t("Share")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Close")) } }
    )
}
