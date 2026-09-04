package uk.co.eggcraft.studioflow.features.settings

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * What NivaDesk connects to, and how each one is actually reached.
 *
 * A mirror of `studioflow-web/lib/studioflow/integrations.ts` and
 * `EGGcraft/NivaDeskIntegrations.swift` — same ids, same categories, same rules.
 * Keep the three in step: a provider that exists on one platform and not the
 * others is a card a customer can only find on one device.
 *
 * Every live state is resolved from the workspace, never written here. The
 * statuses in the design sheet are sample data; a card that says "Connected"
 * when nothing has ever arrived is worse than no card at all.
 */
enum class IntegrationState(val label: String) {
    Connected("Connected"),
    Attention("Needs attention"),
    Available("Available"),
    Webhook("Via webhook"),
    Planned("Coming soon"),
    // Not "Coming soon": QuickBooks and Xero connect today, on the web. A phone
    // that says they are coming sends somebody away from something they have.
    WebOnly("Set up on the web"),
}

data class IntegrationChannel(
    val lastDeliveryAtMs: Long = 0L,
    val lastDeliveryOk: Boolean = false,
    val lastDeliveryWasTest: Boolean = false,
)

data class IntegrationSignals(
    /** shop domain to status for every installed Shopify store. */
    val shopifyStores: Map<String, String> = emptyMap(),
    val channels: Map<String, IntegrationChannel> = emptyMap(),
    val bankConnections: Int = 0,
    /** Live Etsy shops, and how many are asking for attention. Read from
     *  getEtsyConnections, never from a flag we set ourselves. */
    val etsyShops: Int = 0,
    val etsyShopsNeedingAttention: Int = 0,
    /** Live Square merchants, from getSquareConnections. */
    val squareConnections: Int = 0,
    val squareConnectionsNeedingAttention: Int = 0,
    /** PayPal money feeds (first-party credentials), from the bank connections. */
    val paypalConnections: Int = 0,
    val paypalConnectionsNeedingAttention: Int = 0,
    val paypalSandbox: Boolean = false,
)

data class IntegrationProvider(
    val id: String,
    val displayName: String,
    val category: String,
    /** "native" NivaDesk talks to it; "webhook" it can post to us; "planned" not
     *  built — such a card carries no button that pretends otherwise. */
    val kind: String,
    val blurb: String,
    val capabilities: List<String>,
    /** Which screen a card opens: "shopify", "woo", "inbound", or "" for none. */
    val manage: String,
    /** The initial shown in the tile; we ship no third-party logo files here. */
    val mark: String,
) {
    fun detail(signals: IntegrationSignals): String {
        if (id == "etsy") {
            if (signals.etsyShops == 0) return ""
            return if (signals.etsyShops == 1) "1 shop" else "${signals.etsyShops} shops"
        }
        if (id == "square") {
            if (signals.squareConnections == 0) return ""
            return if (signals.squareConnections == 1) "1 account" else "${signals.squareConnections} accounts"
        }
        if (id == "paypal") return if (signals.paypalConnections == 0) "" else if (signals.paypalSandbox) "Sandbox" else "PayPal"
        if (id != "shopify") return ""
        val live = signals.shopifyStores.filterValues { it != "unlinked" }
        return when {
            live.size == 1 -> live.keys.first()
            live.isEmpty() -> ""
            else -> "${live.size} stores"
        }
    }

    fun state(signals: IntegrationSignals): IntegrationState {
        if (kind == "webOnly") return IntegrationState.WebOnly
        if (kind == "planned") return IntegrationState.Planned
        if (id == "shopify") {
            val live = signals.shopifyStores.filterValues { it != "unlinked" }
            if (live.isEmpty()) return IntegrationState.Available
            // An uninstalled store keeps its companyId — deliberately, so a
            // re-install resumes — so the server still hands it to us here, and
            // the reconcile skips it while its token is blank. Its orders have
            // stopped arriving. Only "paused" counted as broken, so the card
            // stayed green over a dead store: a silent outage behind a badge
            // whose whole job is to say whether orders are coming in. Pausing is
            // somebody's own decision, so it lowers the card only when every
            // store is paused; an uninstall is a break, and one is enough.
            if (live.values.any { it == "uninstalled" }) return IntegrationState.Attention
            return if (live.values.all { it == "paused" }) IntegrationState.Attention
            else IntegrationState.Connected
        }
        if (id == "openbanking") {
            return if (signals.bankConnections > 0) IntegrationState.Connected else IntegrationState.Available
        }
        if (id == "etsy") {
            if (signals.etsyShops == 0) return IntegrationState.Available
            return if (signals.etsyShopsNeedingAttention > 0) IntegrationState.Attention else IntegrationState.Connected
        }
        if (id == "square") {
            if (signals.squareConnections == 0) return IntegrationState.Available
            return if (signals.squareConnectionsNeedingAttention == signals.squareConnections) IntegrationState.Attention else IntegrationState.Connected
        }
        if (id == "paypal") {
            if (signals.paypalConnections == 0) return IntegrationState.Available
            return if (signals.paypalConnectionsNeedingAttention == signals.paypalConnections) IntegrationState.Attention else IntegrationState.Connected
        }
        // Everything else arrives over a webhook channel. A test delivery proves
        // the wiring, not the connection — it does not turn the card green.
        val channel = signals.channels[if (manage == "woo") "woocommerce" else "inbound"]
        if (channel == null || channel.lastDeliveryAtMs <= 0L || channel.lastDeliveryWasTest) {
            return if (manage == "inbound") IntegrationState.Webhook else IntegrationState.Available
        }
        return if (channel.lastDeliveryOk) IntegrationState.Connected else IntegrationState.Attention
    }
}

val INTEGRATION_CATEGORIES = listOf(
    "commerce" to "Commerce & orders",
    "banking" to "Banking & accounting",
    "automation" to "Payments, files & automation",
)

val INTEGRATION_PROVIDERS = listOf(
    IntegrationProvider("shopify", "Shopify", "commerce", "native",
        "Install the NivaDesk app and orders arrive as they are placed.",
        listOf("Orders", "Customers"), "shopify", "S"),
    IntegrationProvider("woocommerce", "WooCommerce", "commerce", "native",
        "Approve NivaDesk at your store once; orders, customers and status changes sync on their own.", listOf("Orders", "Customers"), "woo", "W"),
    IntegrationProvider("square", "Square", "commerce", "native",
        "Connect your Square account once; POS, Online and Invoice sales, payments and refunds arrive on their own.", listOf("Orders", "Payments", "Customers"), "square", "S"),
    IntegrationProvider("etsy", "Etsy", "commerce", "native",
        "Import orders and customers automatically.", listOf("Orders", "Customers"), "etsy", "E"),
    IntegrationProvider("wix", "Wix", "commerce", "webhook",
        "Post orders to NivaDesk from a Wix store.", listOf("Orders"), "inbound", "W"),
    IntegrationProvider("squarespace", "Squarespace", "commerce", "webhook",
        "Post orders to NivaDesk from a Squarespace store.", listOf("Orders"), "inbound", "S"),
    IntegrationProvider("amazon", "Amazon", "commerce", "planned", "", emptyList(), "", "A"),
    // Named beside Amazon because a studio deciding where to list wants to see
    // both, and a marketplace missing from the grid reads as "never coming".
    IntegrationProvider("ebay", "eBay", "commerce", "planned", "", emptyList(), "", "E"),
    // Banking is its own section of the app here, not a settings screen, so this
    // card reports its state and sends nobody anywhere.
    IntegrationProvider("openbanking", "Open Banking", "banking", "native",
        "Read-only bank transaction sync.", listOf("Transactions", "Receipts"), "", "B"),
    IntegrationProvider("pandle", "Pandle", "banking", "planned", "", emptyList(), "", "P"),
    IntegrationProvider("quickbooks", "QuickBooks", "banking", "webOnly", "Connect from nivadesk.app; the phone shows what it reads.", listOf("Accounting"), "", "Q"),
    IntegrationProvider("xero", "Xero", "banking", "webOnly", "Connect from nivadesk.app; the phone shows what it reads.", listOf("Accounting"), "", "X"),
    IntegrationProvider("zapier", "Zapier", "automation", "webhook",
        "Send anything into NivaDesk from a Zap.", listOf("Automation"), "inbound", "Z"),
    IntegrationProvider("make", "Make", "automation", "webhook",
        "Send anything into NivaDesk from a scenario.", listOf("Automation"), "inbound", "M"),
    IntegrationProvider("stripe", "Stripe", "automation", "planned", "", emptyList(), "", "S"),
    IntegrationProvider("paypal", "PayPal", "banking", "native", "Sales, fees and refunds from your PayPal account, beside your bank.", listOf("Payments received and sent", "Fees beside the gross", "Withdrawals matched to your bank"), "paypal", "P"),
    IntegrationProvider("googledrive", "Google Drive", "automation", "planned", "", emptyList(), "", "G"),
    IntegrationProvider("dropbox", "Dropbox", "automation", "planned", "", emptyList(), "", "D"),
)

@Composable
fun IntegrationTile(
    provider: IntegrationProvider,
    state: IntegrationState,
    detail: String,
    t: (String) -> String,
    onManage: () -> Unit,
) {
    val tone = when (state) {
        IntegrationState.Connected -> Color(0xFF15803D)
        IntegrationState.Attention, IntegrationState.Webhook -> Color(0xFFC2410C)
        IntegrationState.Available, IntegrationState.WebOnly -> Color(0xFF475569)
        IntegrationState.Planned -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    Column(
        Modifier
            .fillMaxWidth()
            .alpha(if (state == IntegrationState.Planned) 0.72f else 1f)
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f), RoundedCornerShape(14.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(11.dp)) {
            Box(
                Modifier
                    .size(40.dp)
                    .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f), RoundedCornerShape(11.dp)),
                contentAlignment = Alignment.Center
            ) {
                Text(provider.mark, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold,
                    color = Color(0xFF475569))
            }
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(provider.displayName, fontSize = 14.5.sp, fontWeight = FontWeight.ExtraBold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    t(state.label), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = tone,
                    modifier = Modifier
                        .background(tone.copy(alpha = 0.12f), RoundedCornerShape(999.dp))
                        .padding(horizontal = 9.dp, vertical = 2.dp)
                )
            }
        }
        // A card for something that does not exist yet is the name and the word
        // "Coming soon", once.
        if (state != IntegrationState.Planned) {
            if (detail.isNotEmpty()) {
                Text(detail, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (provider.blurb.isNotEmpty()) {
                Text(t(provider.blurb), fontSize = 12.5.sp, maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (provider.capabilities.isNotEmpty()) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    provider.capabilities.forEach { cap ->
                        Text(
                            t(cap), fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f),
                                    RoundedCornerShape(7.dp))
                                .padding(horizontal = 8.dp, vertical = 2.dp)
                        )
                    }
                }
            }
            if (provider.manage.isNotEmpty()) {
                Spacer(Modifier.height(2.dp))
                OutlinedButton(onClick = onManage, modifier = Modifier.fillMaxWidth()) {
                    Text(t(if (state == IntegrationState.Connected || state == IntegrationState.Attention) "Manage" else "Set up"))
                }
            }
        }
    }
}
