import SwiftUI

/// What NivaDesk connects to, and how each one is actually reached.
///
/// A mirror of `studioflow-web/lib/studioflow/integrations.ts` — same ids, same
/// categories, same rules. Keep the two in step: a provider that exists on one
/// platform and not the other is a card a customer can only find on a laptop.
///
/// Every live state is resolved from the workspace, never written here. The
/// statuses in the design sheet are sample data; a card that says "Connected"
/// when nothing has ever arrived is worse than no card at all.
enum NivaDeskIntegrationState {
    case connected, attention, available, webhook, planned, webOnly

    var label: String {
        switch self {
        case .connected: return "Connected"
        case .attention: return "Needs attention"
        case .available: return "Available"
        case .webhook: return "Via webhook"
        case .planned: return "Coming soon"
        // Not "Coming soon": QuickBooks and Xero connect today, on the web. A
        // phone that says they are coming sends somebody away from something
        // they already have.
        case .webOnly: return "Set up on the web"
        }
    }

    var tone: Color {
        switch self {
        case .connected: return HomeTone.green
        case .attention, .webhook: return HomeTone.orange
        case .available: return HomeTone.slate
        case .planned: return .secondary
        case .webOnly: return HomeTone.slate
        }
    }
}

struct NivaDeskIntegrationChannel {
    var lastDeliveryAtMs: Double = 0
    var lastDeliveryOk = false
    var lastDeliveryWasTest = false
}

struct NivaDeskIntegrationSignals {
    /// (shop domain, status) for every installed Shopify store.
    var shopifyStores: [(String, String)] = []
    var channels: [String: NivaDeskIntegrationChannel] = [:]
    var bankConnections = 0
    /// Live Etsy shops, and how many of them are asking for attention. Read
    /// from getEtsyConnections, never from a flag we set ourselves.
    var etsyShops = 0
    var etsyShopsNeedingAttention = 0
    /// Live Square merchants, from getSquareConnections.
    var squareConnections = 0
    var squareConnectionsNeedingAttention = 0
    /// Live eBay seller accounts, from getEbayConnections. The attention count
    /// is the server's own specStatus — never an error code read again here.
    var ebayConnections = 0
    var ebayConnectionsNeedingAttention = 0
    var ebayAccount = ""
    var ebaySandbox = false
    /// PayPal money feeds (first-party credentials), from the bank connections.
    var paypalConnections = 0
    var paypalConnectionsNeedingAttention = 0
    var paypalSandbox = false
}

struct NivaDeskIntegration: Identifiable {
    let id: String
    let name: String
    let category: String
    /// "native" NivaDesk talks to it; "webhook" it can post to us; "planned" not
    /// built — such a card carries no button that pretends otherwise.
    let kind: String
    let blurb: String
    let capabilities: [String]
    /// Which screen a card opens: "shopify", "woocommerce", "inbound", "bank".
    let manage: String
    /// Its own brand file where we hold one we are allowed to use.
    let asset: String
    /// The initial shown when we do not — never a drawing of someone's logo.
    let mark: String

    static let categories: [(String, String)] = [
        ("commerce", "Commerce & orders"),
        ("banking", "Banking & accounting"),
        ("automation", "Payments, files & automation"),
    ]

    static let all: [NivaDeskIntegration] = [
        .init(id: "shopify", name: "Shopify", category: "commerce", kind: "native",
              blurb: "Install the NivaDesk app and orders arrive as they are placed.",
              capabilities: ["Orders", "Customers"], manage: "shopify", asset: "IntegrationShopify", mark: "S"),
        .init(id: "woocommerce", name: "WooCommerce", category: "commerce", kind: "native",
              blurb: "Approve NivaDesk at your store once; orders, customers and status changes sync on their own.",
              capabilities: ["Orders", "Customers"], manage: "woocommerce", asset: "IntegrationWooCommerce", mark: "W"),
        .init(id: "square", name: "Square", category: "commerce", kind: "native",
              blurb: "Connect your Square account once; POS, Online and Invoice sales, payments and refunds arrive on their own.",
              capabilities: ["Orders", "Payments", "Customers"], manage: "square", asset: "", mark: "S"),
        .init(id: "etsy", name: "Etsy", category: "commerce", kind: "native",
              blurb: "Import orders and customers automatically.",
              capabilities: ["Orders", "Customers"], manage: "etsy", asset: "", mark: "E"),
        .init(id: "wix", name: "Wix", category: "commerce", kind: "webhook",
              blurb: "Post orders to NivaDesk from a Wix store.",
              capabilities: ["Orders"], manage: "inbound", asset: "", mark: "W"),
        .init(id: "squarespace", name: "Squarespace", category: "commerce", kind: "webhook",
              blurb: "Post orders to NivaDesk from a Squarespace store.",
              capabilities: ["Orders"], manage: "inbound", asset: "", mark: "S"),
        .init(id: "amazon", name: "Amazon", category: "commerce", kind: "planned",
              blurb: "", capabilities: [], manage: "", asset: "", mark: "A"),
        // Named beside Amazon because a studio deciding where to list wants to
        // see both, and a marketplace missing from the grid reads as never coming.
        // No logo file: eBay's mark is theirs and we are not allowed to redraw
        // it, so the card carries the initial like Square and Etsy.
        .init(id: "ebay", name: "eBay", category: "commerce", kind: "native",
              blurb: "Bring eBay orders, listings, inventory, fulfilment, fees and payouts into the same NivaDesk workflow.",
              capabilities: ["Orders", "Listings", "Inventory", "Fulfilment", "Refunds", "Fees", "Payouts", "ChatGPT"],
              manage: "ebay", asset: "", mark: "E"),
        .init(id: "openbanking", name: "Open Banking", category: "banking", kind: "native",
              blurb: "Read-only bank transaction sync.",
              // Banking is its own section of the app here, not a settings screen,
              // so this card reports its state and sends nobody anywhere.
              capabilities: ["Transactions", "Receipts"], manage: "", asset: "", mark: "B"),
        .init(id: "pandle", name: "Pandle", category: "banking", kind: "planned",
              blurb: "", capabilities: [], manage: "", asset: "", mark: "P"),
        .init(id: "quickbooks", name: "QuickBooks", category: "banking", kind: "webOnly",
              blurb: "Connect from nivadesk.app; the phone shows what it reads.",
              capabilities: ["Accounting"], manage: "", asset: "", mark: "Q"),
        .init(id: "xero", name: "Xero", category: "banking", kind: "webOnly",
              blurb: "Connect from nivadesk.app; the phone shows what it reads.",
              capabilities: ["Accounting"], manage: "", asset: "", mark: "X"),
        .init(id: "zapier", name: "Zapier", category: "automation", kind: "webhook",
              blurb: "Send anything into NivaDesk from a Zap.",
              capabilities: ["Automation"], manage: "inbound", asset: "", mark: "Z"),
        .init(id: "make", name: "Make", category: "automation", kind: "webhook",
              blurb: "Send anything into NivaDesk from a scenario.",
              capabilities: ["Automation"], manage: "inbound", asset: "", mark: "M"),
        .init(id: "stripe", name: "Stripe", category: "automation", kind: "planned",
              blurb: "", capabilities: [], manage: "", asset: "", mark: "S"),
        .init(id: "paypal", name: "PayPal", category: "banking", kind: "native",
              blurb: "Sales, fees and refunds from your PayPal account, beside your bank.",
              capabilities: ["Payments received and sent", "Fees beside the gross", "Withdrawals matched to your bank"], manage: "paypal", asset: "", mark: "P"),
        .init(id: "googledrive", name: "Google Drive", category: "automation", kind: "planned",
              blurb: "", capabilities: [], manage: "", asset: "", mark: "G"),
        .init(id: "dropbox", name: "Dropbox", category: "automation", kind: "planned",
              blurb: "", capabilities: [], manage: "", asset: "", mark: "D"),
    ]

    /// The store this card is connected to, when we know it.
    func detail(signals: NivaDeskIntegrationSignals) -> String {
        if id == "etsy" {
            if signals.etsyShops == 0 { return "" }
            return signals.etsyShops == 1 ? "1 shop" : "\(signals.etsyShops) shops"
        }
        if id == "square" {
            if signals.squareConnections == 0 { return "" }
            return signals.squareConnections == 1 ? "1 account" : "\(signals.squareConnections) accounts"
        }
        if id == "ebay" {
            if signals.ebayConnections == 0 { return "" }
            let base = signals.ebayConnections == 1
                ? (signals.ebayAccount.isEmpty ? "1 account" : signals.ebayAccount)
                : "\(signals.ebayConnections) accounts"
            // A sandbox account looks exactly like a live one on a card, and
            // saying so is the difference between "no orders yet" and "these
            // orders are not real".
            return signals.ebaySandbox ? "\(base) · Sandbox" : base
        }
        if id == "paypal" { return signals.paypalConnections == 0 ? "" : (signals.paypalSandbox ? "Sandbox" : "PayPal") }
        guard id == "shopify" else { return "" }
        let live = signals.shopifyStores.filter { $0.1 != "unlinked" }
        if live.count == 1 { return live[0].0 }
        return live.isEmpty ? "" : "\(live.count) stores"
    }

    func state(signals: NivaDeskIntegrationSignals) -> NivaDeskIntegrationState {
        if kind == "webOnly" { return .webOnly }
        if kind == "planned" { return .planned }

        if id == "shopify" {
            let live = signals.shopifyStores.filter { $0.1 != "unlinked" }
            if live.isEmpty { return .available }
            // An uninstalled store keeps its companyId — deliberately, so a
            // re-install resumes — so the server still hands it to us here, and
            // its orders have stopped arriving. Only "paused" counted as broken,
            // so the card stayed green over a dead store: a silent outage behind
            // a badge whose whole job is to say whether orders are coming in.
            //
            // Pausing is somebody's own decision, so it lowers the card only
            // when every store is paused; an uninstall is a break, and one is
            // enough. Same rule as the web and Android hubs — keep the three in
            // step.
            let uninstalled = live.filter { $0.1 == "uninstalled" }.count
            let paused = live.filter { $0.1 == "paused" }.count
            return (uninstalled > 0 || paused == live.count) ? .attention : .connected
        }
        if id == "openbanking" {
            return signals.bankConnections > 0 ? .connected : .available
        }
        if id == "etsy" {
            if signals.etsyShops == 0 { return .available }
            return signals.etsyShopsNeedingAttention > 0 ? .attention : .connected
        }
        if id == "square" {
            if signals.squareConnections == 0 { return .available }
            return signals.squareConnectionsNeedingAttention == signals.squareConnections ? .attention : .connected
        }
        if id == "ebay" {
            // A disconnected row is not a connection, and the card goes amber
            // only when EVERY live account needs a look: one paused sandbox
            // account beside a working live one is not an outage.
            if signals.ebayConnections == 0 { return .available }
            return signals.ebayConnectionsNeedingAttention == signals.ebayConnections ? .attention : .connected
        }
        if id == "paypal" {
            if signals.paypalConnections == 0 { return .available }
            return signals.paypalConnectionsNeedingAttention == signals.paypalConnections ? .attention : .connected
        }

        // Everything else arrives over a webhook channel. A test delivery proves
        // the wiring, not the connection — it does not turn the card green.
        let key = manage == "woocommerce" ? "woocommerce" : "inbound"
        guard let channel = signals.channels[key],
              channel.lastDeliveryAtMs > 0, !channel.lastDeliveryWasTest else {
            return manage == "inbound" ? .webhook : .available
        }
        return channel.lastDeliveryOk ? .connected : .attention
    }
}

struct IntegrationTile: View {
    let provider: NivaDeskIntegration
    let state: NivaDeskIntegrationState
    let lang: String
    let onManage: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 11) {
                ZStack {
                    RoundedRectangle(cornerRadius: 11).fill(Color.white)
                    RoundedRectangle(cornerRadius: 11).stroke(Color.primary.opacity(0.12))
                    if !provider.asset.isEmpty, let image = NSUIImageForAsset(provider.asset) {
                        image.resizable().scaledToFit().padding(6)
                    } else {
                        Text(provider.mark)
                            .font(.system(size: 16, weight: .heavy))
                            .foregroundColor(HomeTone.slate)
                    }
                }
                .frame(width: 40, height: 40)
                VStack(alignment: .leading, spacing: 4) {
                    Text(provider.name).font(.system(size: 14.5, weight: .heavy)).lineLimit(1)
                    Text(t(state.label, lang: lang))
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(state.tone)
                        .padding(.horizontal, 9).padding(.vertical, 2)
                        .background(Capsule().fill(state.tone.opacity(0.12)))
                }
                Spacer(minLength: 0)
            }
            // A card for something that does not exist yet is the name and the
            // word "Coming soon", once.
            if state != .planned {
                Text(provider.blurb.isEmpty ? "" : t(provider.blurb, lang: lang))
                    .font(.system(size: 12.5)).foregroundColor(.secondary).lineLimit(2)
                // The web list wraps (`flex-wrap`), and eBay carries eight
                // chips. In one HStack they squeeze until every label is an
                // ellipsis, so the rows are laid out three at a time — every
                // other card has three or fewer and is unchanged.
                if !provider.capabilities.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(Array(stride(from: 0, to: provider.capabilities.count, by: 3)), id: \.self) { start in
                            HStack(spacing: 6) {
                                ForEach(provider.capabilities[start..<min(start + 3, provider.capabilities.count)], id: \.self) { cap in
                                    Text(t(cap, lang: lang))
                                        .font(.system(size: 11, weight: .semibold))
                                        .padding(.horizontal, 8).padding(.vertical, 2)
                                        .overlay(RoundedRectangle(cornerRadius: 7).stroke(Color.primary.opacity(0.15)))
                                        .foregroundColor(.secondary)
                                }
                            }
                        }
                    }
                }
                Spacer(minLength: 0)
                if !provider.manage.isEmpty {
                    Button(t(state == .connected || state == .attention ? "Manage" : "Set up", lang: lang),
                           action: onManage)
                        .buttonStyle(.bordered)
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 150, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 14).stroke(Color.primary.opacity(0.12)))
        .opacity(state == .planned ? 0.72 : 1)
    }
}

/// The brand files ship as asset-catalog images; a missing one falls back to the
/// provider's initial rather than to a broken tile.
private func NSUIImageForAsset(_ name: String) -> Image? {
    #if os(macOS)
    return NSImage(named: name).map { Image(nsImage: $0) }
    #else
    return UIImage(named: name).map { Image(uiImage: $0) }
    #endif
}
