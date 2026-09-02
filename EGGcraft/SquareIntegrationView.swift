import SwiftUI
import FirebaseFunctions

// Square as a connector (Square spec §16), on Mac and iPhone. The owner
// presses Connect, approves NivaDesk at Square in the browser, and the
// connection completes server-side through the OAuth callback; when the app
// comes back to the front it simply reloads. Nothing here ever sees a token.
struct SquareLocationInfo: Identifiable {
    let id: String
    let name: String
    let status: String
    let selected: Bool
}

struct SquareConnectionInfo: Identifiable {
    let id: String
    let merchantId: String
    let merchantName: String
    let environment: String
    let status: String
    let locations: [SquareLocationInfo]
    let importPolicy: String
    let importSources: [String]
    let autoSync: Bool
    let lastSuccessAtMs: Double
    let lastErrorCode: String
    let eventsRecovery: Bool
    let apiVersion: String
    let unmatchedPayments: Int
}

struct SquareIntegrationView: View {
    let language: String
    let isOwner: Bool
    @EnvironmentObject var firebaseManager: FirebaseManager
    @Environment(\.scenePhase) private var scenePhase

    @State private var loading = true
    @State private var connections: [SquareConnectionInfo] = []
    @State private var busy = ""
    @State private var errorText = ""
    @State private var notice = ""
    @State private var awaitingReturn = false
    @State private var confirmDisconnect = false
    @State private var days = 90
    @State private var previewText = ""
    @State private var unmatchedText = ""
    @State private var payoutsText = ""
    @State private var auditText = ""

    private static let sources: [(String, String)] = [
        ("SQUARE_POS", "Square Point of Sale"), ("SQUARE_ONLINE", "Square Online"), ("INVOICE", "Square Invoices"),
        ("APPOINTMENTS", "Square Appointments"), ("VIRTUAL_TERMINAL", "Virtual Terminal"), ("API", "API"), ("OTHER", "Other")
    ]
    private static let policies: [(String, String, String)] = [
        ("fulfillment_only", "Sales with a shipment, pickup or delivery", "Recommended. Quick counter sales stay in finance only."),
        ("all", "Every sale", "Every Square sale becomes a NivaDesk order."),
        ("none", "None", "Record sales for finance only; create no orders.")
    ]

    private func tr(_ text: String) -> String { t(text, lang: language) }
    private var companyId: String { firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var connection: SquareConnectionInfo? {
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
            if phase == .active, awaitingReturn, busy.isEmpty { awaitingReturn = false; reload() }
        }
    }

    private var connectCard: some View {
        SettingsCard(title: tr("Connect your Square account"), iconName: "creditcard", footerText: isOwner ? nil : tr("Only the workspace owner can connect a Square account.")) {
            VStack(alignment: .leading, spacing: 12) {
                Text(tr("Sign in to Square once and approve read-only access. Sales from Square Point of Sale, Square Online and Square Invoices, with their payments and refunds, then arrive on their own, and NivaDesk checks Square every fifteen minutes for anything a webhook missed."))
                    .font(.system(size: 13)).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 10) {
                    Button {
                        connect()
                    } label: {
                        if busy == "connect" { HStack(spacing: 6) { ProgressView().controlSize(.small); Text(tr("Opening Square…")) } }
                        else { Text(tr("Connect Square")) }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(!isOwner || busy == "connect")
                    if awaitingReturn {
                        Button(tr("Finish connection")) { awaitingReturn = false; reload() }.buttonStyle(.bordered)
                    }
                }
                if awaitingReturn {
                    Text(tr("Approve NivaDesk at Square in the browser, then come back here; the connection completes on its own."))
                        .font(.system(size: 12)).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    @ViewBuilder
    private func connectedBody(_ live: SquareConnectionInfo) -> some View {
        let healthy = live.status == "connected" && live.lastErrorCode.isEmpty
        SettingsCard(title: live.merchantName.isEmpty ? live.merchantId : live.merchantName, iconName: "creditcard.fill") {
            VStack(alignment: .leading, spacing: 10) {
                Text("\(tr("Square merchant")) · \(live.environment == "sandbox" ? tr("Sandbox") : tr("Production")) · \(tr("Read only")) · Square-Version \(live.apiVersion)")
                    .font(.system(size: 12)).foregroundColor(.secondary)
                HStack(spacing: 8) {
                    pill(live.status == "reconnect_required" ? tr("Reconnect required") : (healthy ? tr("Healthy") : tr("Needs attention")), good: healthy)
                    pill(live.eventsRecovery ? tr("On (Events API, 28 days)") : tr("Off"), good: live.eventsRecovery)
                }
                Text("\(tr("Locations")): \(live.locations.filter { $0.selected }.map { $0.name.isEmpty ? $0.id : $0.name }.joined(separator: ", "))").font(.system(size: 12)).foregroundColor(.secondary)
                Text("\(tr("Last successful sync")): \(ago(live.lastSuccessAtMs))").font(.system(size: 12)).foregroundColor(.secondary)
                if live.unmatchedPayments > 0 {
                    Text("\(tr("Issues")): \(live.unmatchedPayments) \(tr("unmatched payments"))").font(.system(size: 12)).foregroundColor(.orange)
                }
                if live.status == "reconnect_required" {
                    Text(tr("Square has withdrawn NivaDesk's access. Connect again to resume sync.")).font(.system(size: 12)).foregroundColor(.red).fixedSize(horizontal: false, vertical: true)
                }
                if live.lastErrorCode == "location_inactive" {
                    Text(tr("A selected location is no longer active at Square. Past orders are kept; review the locations below.")).font(.system(size: 12)).foregroundColor(.red).fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 10) {
                    if live.status == "reconnect_required" && isOwner {
                        Button(tr("Reconnect Square")) { connect() }.buttonStyle(.borderedProminent).disabled(busy == "connect")
                    }
                    Button(busy == "sync" ? tr("Syncing…") : tr("Sync now")) { syncNow(live) }
                        .buttonStyle(.bordered).disabled(busy == "sync" || live.status != "connected")
                }
                Text(tr("Sync now checks the last 24 hours.")).font(.system(size: 11)).foregroundColor(.secondary)
            }
        }

        CommerceSyncHealthView(companyId: companyId, provider: "square", isOwner: isOwner, language: language)

        if isOwner {
            SettingsCard(title: tr("What comes in"), iconName: "slider.horizontal.3") {
                VStack(alignment: .leading, spacing: 10) {
                    Text(tr("Choose the locations to import and which sales become NivaDesk orders. Every sale is recorded for finance either way."))
                        .font(.system(size: 12)).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
                    Text(tr("Locations")).font(.system(size: 11, weight: .bold)).foregroundColor(.secondary)
                    ForEach(live.locations) { loc in
                        Toggle(isOn: Binding(get: { loc.selected }, set: { on in
                            var next = Set(live.locations.filter { $0.selected }.map { $0.id })
                            if on { next.insert(loc.id) } else { next.remove(loc.id) }
                            if next.isEmpty { errorText = tr("Select at least one location."); return }
                            saveSettings(live, ["selectedLocationIds": Array(next)])
                        })) {
                            HStack(spacing: 6) {
                                Text(loc.name.isEmpty ? loc.id : loc.name).font(.system(size: 12))
                                if loc.status != "ACTIVE" { Text(tr("Inactive")).font(.system(size: 10, weight: .bold)).foregroundColor(.secondary) }
                            }
                        }
                        .disabled(busy == "settings")
                    }
                    Text(tr("Which sales become orders")).font(.system(size: 11, weight: .bold)).foregroundColor(.secondary)
                    Picker("", selection: Binding(get: { live.importPolicy }, set: { saveSettings(live, ["importPolicy": $0]) })) {
                        ForEach(Self.policies, id: \.0) { policy in Text(tr(policy.1)).tag(policy.0) }
                    }
                    #if os(macOS)
                    .pickerStyle(.radioGroup)
                    #else
                    .pickerStyle(.inline)
                    #endif
                    .labelsHidden()
                    .disabled(busy == "settings")
                    if let hint = Self.policies.first(where: { $0.0 == live.importPolicy })?.2 {
                        Text(tr(hint)).font(.system(size: 11)).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                    Text(tr("Square sources")).font(.system(size: 11, weight: .bold)).foregroundColor(.secondary)
                    ForEach(Self.sources, id: \.0) { source in
                        Toggle(isOn: Binding(get: { live.importSources.contains(source.0) }, set: { on in
                            var next = Set(live.importSources)
                            if on { next.insert(source.0) } else { next.remove(source.0) }
                            if next.isEmpty { errorText = tr("Select at least one Square source."); return }
                            saveSettings(live, ["importSources": Array(next)])
                        })) { Text(tr(source.1)).font(.system(size: 12)) }
                        .disabled(busy == "settings")
                    }
                    Toggle(isOn: Binding(get: { live.autoSync }, set: { saveSettings(live, ["autoSync": $0]) })) {
                        Text(tr("Create orders from new sales automatically")).font(.system(size: 12))
                    }
                    .disabled(busy == "settings")
                    Text(tr("Two-way inventory and taking payments through Square are not on yet; this connection reads only."))
                        .font(.system(size: 11)).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }

            SettingsCard(title: tr("Import preview"), iconName: "square.and.arrow.down") {
                VStack(alignment: .leading, spacing: 10) {
                    Text(tr("Preview shows what an import would bring in; nothing is written.") + " " + tr("Import brings in sales from the chosen days under the policy above."))
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
        }

        SettingsCard(title: tr("Unmatched Square payments"), iconName: "questionmark.circle") {
            VStack(alignment: .leading, spacing: 10) {
                Text(tr("Payments and refunds Square reported for sales NivaDesk holds no order for. They are kept for finance and never turned into orders on their own."))
                    .font(.system(size: 12)).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
                Button(tr("Load")) { loadUnmatched() }.buttonStyle(.bordered).disabled(busy == "unmatched")
                if !unmatchedText.isEmpty {
                    Text(unmatchedText).font(.system(size: 12, design: .monospaced)).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }
        }

        SettingsCard(title: tr("Square payouts"), iconName: "building.columns") {
            VStack(alignment: .leading, spacing: 10) {
                Text(tr("What Square sent to your bank, explained: gross sales, refunds, fees and adjustments per payout. A payout is not a payment; the two are kept apart."))
                    .font(.system(size: 12)).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
                Button(tr("Load")) { loadPayouts() }.buttonStyle(.bordered).disabled(busy == "payouts")
                if !payoutsText.isEmpty {
                    Text(payoutsText).font(.system(size: 12, design: .monospaced)).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }
        }

        if isOwner {
            SettingsCard(title: tr("Missing order audit"), iconName: "checklist") {
                VStack(alignment: .leading, spacing: 10) {
                    Text(tr("Compares Square's orders from the chosen days with what NivaDesk holds: as an order, as a finance-only sale, or not at all."))
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

            SettingsCard(title: tr("Disconnect Square"), iconName: "xmark.circle") {
                VStack(alignment: .leading, spacing: 10) {
                    if confirmDisconnect {
                        Text(tr("Disconnect this Square account? NivaDesk's access is revoked at Square and new sales stop arriving. Orders and payments already imported stay in this workspace."))
                            .font(.system(size: 12)).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
                        HStack(spacing: 10) {
                            Button(tr("Disconnect"), role: .destructive) { disconnect(live) }.buttonStyle(.borderedProminent).disabled(busy == "disconnect")
                            Button(tr("Keep connected")) { confirmDisconnect = false }.buttonStyle(.bordered)
                        }
                    } else {
                        Button(tr("Disconnect Square")) { confirmDisconnect = true }.buttonStyle(.bordered)
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

    private func parse(_ row: [String: Any]) -> SquareConnectionInfo {
        let settings = row["settings"] as? [String: Any] ?? [:]
        let locations = (row["locations"] as? [[String: Any]] ?? []).map { loc in
            SquareLocationInfo(id: loc["id"] as? String ?? "", name: loc["name"] as? String ?? "", status: loc["status"] as? String ?? "", selected: loc["selected"] as? Bool ?? false)
        }
        return SquareConnectionInfo(
            id: row["id"] as? String ?? "", merchantId: row["merchantId"] as? String ?? "", merchantName: row["merchantName"] as? String ?? "",
            environment: row["environment"] as? String ?? "production", status: row["status"] as? String ?? "", locations: locations,
            importPolicy: settings["importPolicy"] as? String ?? "fulfillment_only", importSources: settings["importSources"] as? [String] ?? [],
            autoSync: settings["autoSync"] as? Bool ?? true, lastSuccessAtMs: (row["lastSuccessAtMs"] as? NSNumber)?.doubleValue ?? 0,
            lastErrorCode: row["lastErrorCode"] as? String ?? "", eventsRecovery: row["eventsRecovery"] as? Bool ?? false,
            apiVersion: row["apiVersion"] as? String ?? "", unmatchedPayments: (row["unmatchedPayments"] as? NSNumber)?.intValue ?? 0
        )
    }

    private func reload() {
        guard !companyId.isEmpty else { loading = false; return }
        call("getSquareConnections", [:]) { data, error in
            loading = false
            if let error = error { errorText = error.localizedDescription; return }
            connections = ((data?["connections"] as? [[String: Any]]) ?? []).map(parse)
        }
    }

    private func connect() {
        busy = "connect"; errorText = ""; notice = ""
        call("beginSquareConnect", [:]) { data, error in
            busy = ""
            if let error = error { errorText = error.localizedDescription; return }
            guard let urlText = data?["authorizeUrl"] as? String, let url = URL(string: urlText) else { errorText = tr("The Square connection could not be completed. Try connecting again."); return }
            awaitingReturn = true
            openExternal(url)
        }
    }

    private func saveSettings(_ live: SquareConnectionInfo, _ patch: [String: Any]) {
        busy = "settings"; errorText = ""; notice = ""
        var payload = patch
        payload["connectionId"] = live.id
        call("updateSquareConnectionSettings", payload) { _, error in
            busy = ""
            if let error = error { errorText = error.localizedDescription } else { notice = tr("Settings saved."); reload() }
        }
    }

    private func syncNow(_ live: SquareConnectionInfo) {
        busy = "sync"; errorText = ""; notice = ""
        call("syncSquareNow", ["connectionId": live.id]) { _, error in
            busy = ""
            if let error = error { errorText = error.localizedDescription } else { notice = tr("Sync finished."); reload() }
        }
    }

    private func preview(_ live: SquareConnectionInfo) {
        busy = "preview"; errorText = ""; previewText = ""
        call("previewSquareImport", ["connectionId": live.id, "days": days]) { data, error in
            busy = ""
            if let error = error { errorText = error.localizedDescription; return }
            let summary = data?["summary"] as? [String: Any] ?? [:]
            let n = { (key: String) -> Int in (summary[key] as? NSNumber)?.intValue ?? 0 }
            previewText = "\(tr("Sales found")): \(n("total")) · \(tr("Would become orders")): \(n("wouldCreate")) · \(tr("Finance only")): \(n("financeOnly")) · \(tr("Cancelled")): \(n("cancelled")) · \(tr("Already in NivaDesk")): \(n("alreadyHere"))"
        }
    }

    private func runImport(_ live: SquareConnectionInfo) {
        busy = "import"; errorText = ""; notice = ""
        call("runSquareImport", ["connectionId": live.id, "days": days]) { data, error in
            busy = ""
            if let error = error { errorText = error.localizedDescription; return }
            let n = { (key: String) -> Int in (data?[key] as? NSNumber)?.intValue ?? 0 }
            notice = "\(tr("Imported")): \(n("created")) · \(tr("Updated")): \(n("updated")) · \(tr("Skipped")): \(n("skipped"))"
            previewText = ""
            reload()
        }
    }

    private func loadUnmatched() {
        busy = "unmatched"; errorText = ""
        call("listSquareUnmatched", [:]) { data, error in
            busy = ""
            if let error = error { errorText = error.localizedDescription; return }
            let payments = data?["payments"] as? [[String: Any]] ?? []
            let refunds = data?["refunds"] as? [[String: Any]] ?? []
            if payments.isEmpty && refunds.isEmpty { unmatchedText = tr("Nothing to review."); return }
            let lines = payments.map { "\(tr("Payment")) \($0["externalId"] as? String ?? "") · \($0["status"] as? String ?? "") · \($0["total"] as? String ?? $0["amount"] as? String ?? "") \($0["currency"] as? String ?? "")" }
                + refunds.map { "\(tr("Refund")) \($0["externalId"] as? String ?? "") · \($0["status"] as? String ?? "") · \($0["amount"] as? String ?? "") \($0["currency"] as? String ?? "")" }
            unmatchedText = lines.joined(separator: "\n")
        }
    }

    private func loadPayouts() {
        busy = "payouts"; errorText = ""
        call("listSquarePayouts", ["limit": 50]) { data, error in
            busy = ""
            if let error = error { errorText = error.localizedDescription; return }
            let rows = data?["payouts"] as? [[String: Any]] ?? []
            if rows.isEmpty { payoutsText = tr("No payouts yet."); return }
            payoutsText = rows.map { row in
                let totals = row["totals"] as? [String: Any] ?? [:]
                let amount = (row["amount"] as? String) ?? (totals["net"] as? String) ?? "—"
                let matched = ((row["bankMatch"] as? [String: Any])?["transactionId"] as? String ?? "").isEmpty ? tr("Not matched") : tr("Matched")
                let reconciled = (row["reconciled"] as? Bool ?? false) ? "" : " · \(tr("Needs attention"))"
                return "\(row["arrivalDate"] as? String ?? "") · \(row["status"] as? String ?? "") · \(tr("Gross")) \(totals["gross"] as? String ?? "—") · \(tr("Refunds")) \(totals["refunds"] as? String ?? "—") · \(tr("Fees")) \(totals["fee"] as? String ?? "—") · \(tr("Net")) \(amount) \(row["currency"] as? String ?? "") · \(matched)\(reconciled)"
            }.joined(separator: "\n")
        }
    }

    private func runAudit(_ live: SquareConnectionInfo) {
        busy = "audit"; errorText = ""; auditText = ""
        call("auditSquareOrders", ["connectionId": live.id, "days": days]) { data, error in
            busy = ""
            if let error = error { errorText = error.localizedDescription; return }
            let n = { (key: String) -> Int in (data?[key] as? NSNumber)?.intValue ?? 0 }
            var text = "\(tr("At Square")): \(n("atSquare")) · \(tr("As orders")): \(n("asOrders")) · \(tr("Finance only")): \(n("financeOnly")) · \(tr("Missing")): \(n("missing")) · \(tr("Not selected")): \(n("notSelected"))"
            if n("missing") == 0 { text += "\n" + tr("Nothing is missing.") }
            else { text += "\n" + tr("These Square orders are not in NivaDesk. Sync now or Import brings them in.") + "\n" + ((data?["missingIds"] as? [String]) ?? []).joined(separator: ", ") }
            auditText = text
        }
    }

    private func disconnect(_ live: SquareConnectionInfo) {
        busy = "disconnect"; errorText = ""
        call("disconnectSquare", ["connectionId": live.id]) { _, error in
            busy = ""; confirmDisconnect = false
            if let error = error { errorText = error.localizedDescription } else { notice = tr("Square account disconnected."); reload() }
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
