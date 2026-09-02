import SwiftUI
import FirebaseFunctions

// Faz 4 — WooCommerce as a full connector, on Mac and iPhone. The owner types
// the store's address, approves NivaDesk at the store in the browser, comes
// back and presses Finish connection (or the app finishes it on return).
// Nothing here ever sees a key: the store posts them to the server.
struct WooConnectionInfo: Identifiable {
    let id: String
    let siteUrl: String
    let host: String
    let storeName: String
    let status: String
    let permissions: String
    let lastSuccessAtMs: Double
    let webhooksHealthy: Bool
    let importState: String
}

struct WooCommerceIntegrationView: View {
    let language: String
    let isOwner: Bool
    @EnvironmentObject var firebaseManager: FirebaseManager
    @Environment(\.scenePhase) private var scenePhase

    @State private var loading = true
    @State private var connections: [WooConnectionInfo] = []
    @State private var siteUrl = ""
    @State private var busy = ""
    @State private var errorText = ""
    @State private var notice = ""
    @State private var pendingState = ""
    @State private var confirmDisconnect = false
    @State private var days = 30
    @State private var previewText = ""
    @State private var auditText = ""

    private func tr(_ text: String) -> String { t(text, lang: language) }
    private var companyId: String { firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var connection: WooConnectionInfo? {
        connections.first { $0.status == "connected" } ?? connections.first { $0.status != "disconnected" }
    }
    private var functions: Functions { Functions.functions(region: "europe-west2") }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if !notice.isEmpty { Text(notice).font(.system(size: 12, weight: .semibold)).foregroundColor(.green).fixedSize(horizontal: false, vertical: true) }
            if !errorText.isEmpty { Text(errorText).font(.system(size: 12, weight: .semibold)).foregroundColor(.red).fixedSize(horizontal: false, vertical: true) }
            if loading {
                HStack(spacing: 8) { ProgressView().controlSize(.small); Text(tr("Loading...")).font(.system(size: 12, weight: .semibold)).foregroundColor(.secondary) }
            } else if let live = connection {
                connectedBody(live)
            } else {
                connectCard
            }
        }
        .onAppear { reload() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, !pendingState.isEmpty, busy.isEmpty { finish() }
        }
    }

    private var connectCard: some View {
        SettingsCard(title: tr("Connect your store"), iconName: "cart", footerText: isOwner ? nil : tr("Only the workspace owner can connect a store.")) {
            VStack(alignment: .leading, spacing: 12) {
                Text(tr("Enter your store's address and approve NivaDesk at your WooCommerce site. Orders, customers and status changes then sync automatically, and NivaDesk checks the store every fifteen minutes for anything a webhook missed."))
                    .font(.system(size: 13)).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
                Text(tr("Store address")).font(.system(size: 11, weight: .bold)).foregroundColor(.secondary)
                TextField("https://your-store.com", text: $siteUrl)
                    .textFieldStyle(.roundedBorder)
                    .disabled(!isOwner || busy == "connect")
                HStack(spacing: 10) {
                    Button {
                        connect()
                    } label: {
                        if busy == "connect" { HStack(spacing: 6) { ProgressView().controlSize(.small); Text(tr("Opening your store…")) } }
                        else { Text(tr("Connect WooCommerce")) }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(!isOwner || busy == "connect" || siteUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    if !pendingState.isEmpty {
                        Button(tr("Finish connection")) { finish() }
                            .buttonStyle(.bordered)
                            .disabled(busy == "finish")
                    }
                }
                if !pendingState.isEmpty {
                    Text(tr("Approve NivaDesk at your store in the browser, then come back here and press Finish connection."))
                        .font(.system(size: 12)).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    @ViewBuilder
    private func connectedBody(_ live: WooConnectionInfo) -> some View {
        let healthy = live.status == "connected" && live.webhooksHealthy
        SettingsCard(title: live.storeName.isEmpty ? live.host : live.storeName, iconName: "cart.fill") {
            VStack(alignment: .leading, spacing: 10) {
                Text(live.siteUrl + (live.permissions.isEmpty ? "" : " · \(tr("Permissions")): \(live.permissions)"))
                    .font(.system(size: 12)).foregroundColor(.secondary)
                HStack(spacing: 8) {
                    pill(healthy ? tr("Healthy") : (live.status == "connected" ? tr("Needs attention") : tr("Connected")), good: healthy)
                    pill(live.webhooksHealthy ? tr("Webhooks are healthy") : tr("Needs attention"), good: live.webhooksHealthy)
                }
                Text("\(tr("Last successful sync")): \(ago(live.lastSuccessAtMs))").font(.system(size: 12)).foregroundColor(.secondary)
                if !live.webhooksHealthy {
                    Text(tr("A webhook was switched off by WooCommerce. Recreate them to resume live sync."))
                        .font(.system(size: 12)).foregroundColor(.red).fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 10) {
                    Button(busy == "sync" ? tr("Syncing…") : tr("Sync now")) { syncNow(live) }
                        .buttonStyle(.bordered).disabled(busy == "sync" || live.status != "connected")
                    if !live.webhooksHealthy && isOwner {
                        Button(tr("Recreate webhooks")) { recreate(live) }.buttonStyle(.bordered).disabled(busy == "recreate")
                    }
                }
                Text(tr("Sync now checks the last 24 hours.")).font(.system(size: 11)).foregroundColor(.secondary)
            }
        }

        CommerceSyncHealthView(companyId: companyId, provider: "woocommerce", isOwner: isOwner, language: language)

        if isOwner {
            SettingsCard(title: tr("Import preview"), iconName: "square.and.arrow.down") {
                VStack(alignment: .leading, spacing: 10) {
                    Text(tr("Preview shows what an import would bring in; nothing is written.") + " " + tr("Import brings in paid orders from the chosen days; a buyer's second payment joins their open order."))
                        .font(.system(size: 12)).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 10) {
                        Stepper("\(tr("Days")): \(days)", value: $days, in: 1...365, step: 1).fixedSize()
                        Button(tr("Preview")) { preview(live) }.buttonStyle(.bordered).disabled(busy == "preview" || live.status != "connected")
                        Button(busy == "import" ? tr("Importing…") : tr("Import")) { runImport(live) }.buttonStyle(.borderedProminent).disabled(busy == "import" || live.status != "connected")
                    }
                    if !previewText.isEmpty {
                        Text(previewText).font(.system(size: 12)).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }

            SettingsCard(title: tr("Missing order audit"), iconName: "checklist") {
                VStack(alignment: .leading, spacing: 10) {
                    Text(tr("Compares the store's orders from the chosen days with what NivaDesk holds: as an order, joined to an order as a payment, skipped as unpaid, or missing."))
                        .font(.system(size: 12)).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 10) {
                        Button(busy == "audit" ? tr("Checking…") : tr("Run audit")) { runAudit(live) }.buttonStyle(.bordered).disabled(busy == "audit" || live.status != "connected")
                        Text("\(tr("Days")): \(days)").font(.system(size: 12)).foregroundColor(.secondary)
                    }
                    if !auditText.isEmpty {
                        Text(auditText).font(.system(size: 12)).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }

            SettingsCard(title: tr("Disconnect WooCommerce"), iconName: "xmark.circle") {
                VStack(alignment: .leading, spacing: 10) {
                    if confirmDisconnect {
                        Text(tr("Disconnect this store? New orders stop arriving. Orders already imported stay in this workspace."))
                            .font(.system(size: 12)).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
                        HStack(spacing: 10) {
                            Button(tr("Disconnect"), role: .destructive) { disconnect(live) }.buttonStyle(.borderedProminent).disabled(busy == "disconnect")
                            Button(tr("Keep connected")) { confirmDisconnect = false }.buttonStyle(.bordered)
                        }
                    } else {
                        Button(tr("Disconnect WooCommerce")) { confirmDisconnect = true }.buttonStyle(.bordered)
                    }
                }
            }
        }
    }

    private func pill(_ text: String, good: Bool) -> some View {
        Text(text).font(.system(size: 11, weight: .bold)).padding(.horizontal, 8).padding(.vertical, 3)
            .background((good ? Color.green : Color.orange).opacity(0.12)).foregroundColor(good ? .green : .orange).cornerRadius(999)
    }

    private func ago(_ ms: Double) -> String {
        guard ms > 0 else { return "—" }
        let diff = max(0, Date().timeIntervalSince1970 * 1000 - ms)
        if diff < 90_000 { return tr("Just now") }
        if diff < 90 * 60_000 { return "\(Int(diff / 60_000)) \(tr("minutes ago"))" }
        if diff < 36 * 3_600_000 { return "\(Int(diff / 3_600_000)) \(tr("hours ago"))" }
        return "\(Int(diff / 86_400_000)) \(tr("days ago"))"
    }

    // MARK: - calls

    private func call(_ name: String, _ data: [String: Any], done: @escaping ([String: Any]?, Error?) -> Void) {
        var payload = data
        payload["companyId"] = companyId
        functions.httpsCallable(name).call(payload) { result, error in
            DispatchQueue.main.async { done(result?.data as? [String: Any], error) }
        }
    }

    private func reload() {
        guard !companyId.isEmpty else { loading = false; return }
        call("getWooConnections", [:]) { data, error in
            loading = false
            if let error = error { errorText = error.localizedDescription; return }
            let raw = (data?["connections"] as? [[String: Any]]) ?? []
            connections = raw.map { row in
                WooConnectionInfo(
                    id: row["id"] as? String ?? "", siteUrl: row["siteUrl"] as? String ?? "", host: row["host"] as? String ?? "",
                    storeName: row["storeName"] as? String ?? "", status: row["status"] as? String ?? "", permissions: row["permissions"] as? String ?? "",
                    lastSuccessAtMs: (row["lastSuccessAtMs"] as? NSNumber)?.doubleValue ?? 0,
                    webhooksHealthy: (row["webhooksHealthy"] as? Bool) ?? true, importState: row["importState"] as? String ?? "none"
                )
            }
        }
    }

    private func connect() {
        busy = "connect"; errorText = ""; notice = ""
        call("beginWooConnect", ["siteUrl": siteUrl.trimmingCharacters(in: .whitespacesAndNewlines)]) { data, error in
            busy = ""
            if let error = error { errorText = error.localizedDescription; return }
            guard let urlText = data?["authorizeUrl"] as? String, let url = URL(string: urlText) else { errorText = tr("The WooCommerce connection could not be completed. Try connecting again."); return }
            pendingState = data?["state"] as? String ?? ""
            openExternal(url)
        }
    }

    private func finish() {
        guard !pendingState.isEmpty else { return }
        busy = "finish"; errorText = ""
        call("finishWooConnect", ["state": pendingState]) { data, error in
            busy = ""
            if let error = error { errorText = error.localizedDescription; return }
            if (data?["status"] as? String) == "connected" {
                pendingState = ""; notice = tr("WooCommerce store connected."); reload()
            } else {
                errorText = data?["message"] as? String ?? tr("The store has not sent its keys yet. If you cancelled at the store, start again.")
            }
        }
    }

    private func syncNow(_ live: WooConnectionInfo) {
        busy = "sync"; errorText = ""; notice = ""
        call("syncWooNow", ["connectionId": live.id]) { _, error in
            busy = ""
            if let error = error { errorText = error.localizedDescription } else { notice = tr("Sync finished."); reload() }
        }
    }

    private func recreate(_ live: WooConnectionInfo) {
        busy = "recreate"; errorText = ""; notice = ""
        call("recreateWooWebhooks", ["connectionId": live.id]) { _, error in
            busy = ""
            if let error = error { errorText = error.localizedDescription } else { notice = tr("Webhooks recreated."); reload() }
        }
    }

    private func preview(_ live: WooConnectionInfo) {
        busy = "preview"; errorText = ""; previewText = ""
        call("previewWooImport", ["connectionId": live.id, "days": days]) { data, error in
            busy = ""
            if let error = error { errorText = error.localizedDescription; return }
            let summary = data?["summary"] as? [String: Any] ?? [:]
            let n = { (key: String) -> Int in (summary[key] as? NSNumber)?.intValue ?? 0 }
            previewText = "\(tr("Orders found")): \(n("total")) · \(tr("Paid")): \(n("paid")) · \(tr("Unpaid")): \(n("unpaid")) · \(tr("Cancelled")): \(n("cancelled")) · \(tr("Already in NivaDesk")): \(n("alreadyHere"))"
        }
    }

    private func runImport(_ live: WooConnectionInfo) {
        busy = "import"; errorText = ""; notice = ""
        call("runWooImport", ["connectionId": live.id, "days": days]) { data, error in
            busy = ""
            if let error = error { errorText = error.localizedDescription; return }
            let n = { (key: String) -> Int in (data?[key] as? NSNumber)?.intValue ?? 0 }
            notice = "\(tr("Imported")): \(n("created")) · \(tr("Updated")): \(n("updated")) · \(tr("Skipped")): \(n("skipped"))"
            previewText = ""
            reload()
        }
    }

    private func runAudit(_ live: WooConnectionInfo) {
        busy = "audit"; errorText = ""; auditText = ""
        call("auditWooOrders", ["connectionId": live.id, "days": days]) { data, error in
            busy = ""
            if let error = error { errorText = error.localizedDescription; return }
            let n = { (key: String) -> Int in (data?[key] as? NSNumber)?.intValue ?? 0 }
            var text = "\(tr("At the store")): \(n("atStore")) · \(tr("As orders")): \(n("asOrders")) · \(tr("Payments")): \(n("mergedAsPayments")) · \(tr("Unpaid")): \(n("unpaidSkipped")) · \(tr("Cancelled")): \(n("cancelled")) · \(tr("Missing")): \(n("missing"))"
            if n("missing") == 0 { text += "\n" + tr("Nothing is missing.") }
            else { text += "\n" + tr("These store orders are not in NivaDesk. Sync now or Import brings them in.") + "\n" + ((data?["missingIds"] as? [String]) ?? []).joined(separator: ", ") }
            auditText = text
        }
    }

    private func disconnect(_ live: WooConnectionInfo) {
        busy = "disconnect"; errorText = ""
        call("disconnectWooShop", ["connectionId": live.id]) { _, error in
            busy = ""; confirmDisconnect = false
            if let error = error { errorText = error.localizedDescription } else { notice = tr("Store disconnected."); reload() }
        }
    }

    private func openExternal(_ url: URL) {
        #if os(macOS)
        NSWorkspace.shared.open(url)
        #else
        UIApplication.shared.open(url)
        #endif
    }
}
