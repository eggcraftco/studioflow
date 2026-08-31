import SwiftUI

// The Etsy screen on Mac and iPhone. Data layer and sentences live in
// EtsyIntegration.swift; this file is only what the seller sees.
//
// Deliberately split into small structs rather than one deep body. A view tree
// nested this far renders fine on Mac and in the simulator and blows the stack
// guard on a real iPhone — which is a crash you cannot reproduce anywhere you
// would normally look.

struct EtsyIntegrationView: View {
    let language: String
    let isOwner: Bool
    @EnvironmentObject var firebaseManager: FirebaseManager

    @State private var loading = true
    @State private var configured = true
    @State private var connections: [EtsyConnectionInfo] = []
    @State private var busy = ""
    @State private var errorText = ""
    @State private var notice = ""

    // Healthy is a claim about right now, so it is only ever set by an answer
    // from Etsy. Until then the row says Connected, which is a fact.
    @State private var liveCheck = "unknown"      // unknown | healthy | unhealthy
    @State private var rules = EtsyImportRules()
    @State private var preview: EtsyPreviewInfo?
    @State private var excluded: Set<String> = []
    @State private var confirmDisconnect = false
    // A workspace can connect more than one shop, and the hub card counts them.
    // Showing only the first made every shop after it unreachable: counted on
    // the card, absent from the screen, with no way to sync or disconnect it.
    @State private var selectedId = ""

    private var connection: EtsyConnectionInfo? {
        connections.first { $0.id == selectedId } ?? connections.first
    }
    private func tr(_ text: String) -> String { t(text, lang: language) }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if !notice.isEmpty {
                Text(notice).font(.system(size: 12, weight: .semibold)).foregroundColor(.green)
            }
            if !errorText.isEmpty {
                Text(errorText).font(.system(size: 12, weight: .semibold)).foregroundColor(.red)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if loading {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text(tr("Loading...")).font(.system(size: 12, weight: .semibold)).foregroundColor(.secondary)
                }
            } else if !configured {
                SettingsCard(title: tr("Etsy"), iconName: "cart.fill") {
                    Text(tr("Etsy is not set up on this server yet. Contact support and we will enable it."))
                        .font(.system(size: 13)).foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else if let live = connection {
                connectedBody(live)
            } else {
                EtsyConnectCard(language: language, isOwner: isOwner, busy: busy == "connect", onConnect: connect)
            }
        }
        .task { await reload() }
    }

    @ViewBuilder
    private func connectedBody(_ live: EtsyConnectionInfo) -> some View {
        if connections.count > 1 {
            SettingsCard(title: tr("Connected shops"), iconName: "square.stack") {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(connections) { row in
                        Button(row.shopName.isEmpty ? row.shopId : row.shopName) {
                            selectedId = row.id
                            // Everything below belongs to the shop that was showing.
                            preview = nil
                            excluded = []
                            liveCheck = "unknown"
                            confirmDisconnect = false
                            notice = ""
                            errorText = ""
                        }
                        .buttonStyle(.bordered)
                        .tint(row.id == live.id ? .accentColor : .secondary)
                    }
                }
            }
        }

        EtsyHeaderCard(
            connection: live,
            language: language,
            liveCheck: liveCheck,
            checking: busy == "verify",
            onCheck: { run("verify") { try await check(live) } }
        )

        if live.needsAttention || liveCheck == "unhealthy" {
            EtsyAttentionCard(
                connection: live,
                language: language,
                isOwner: isOwner,
                busy: busy == "connect",
                onReconnect: connect
            )
        }

        EtsyRulesCard(
            rules: $rules,
            language: language,
            busy: busy == "preview",
            onPreview: { run("preview") { preview = try await firebaseManager.etsyPreview(live.id, rules: rules); excluded = [] } }
        )

        if let found = preview {
            EtsyPreviewCard(
                preview: found,
                excluded: $excluded,
                language: language,
                isOwner: isOwner,
                busy: busy == "import",
                onLink: { row, candidate in
                    run("match") {
                        try await firebaseManager.etsyResolveCustomer(live.id, buyerId: row.buyerId, customerId: candidate.customerId)
                        notice = tr("Decision saved. Later orders from this buyer will use it.")
                    }
                },
                onImport: { run("import") { try await importSelected(live, found) } }
            )
        }

        EtsySyncCard(
            connection: live,
            language: language,
            busy: busy == "sync",
            onSync: { run("sync") { try await syncNow(live) } }
        )

        EtsyDisconnectCard(
            language: language,
            isOwner: isOwner,
            confirming: $confirmDisconnect,
            busy: busy == "disconnect",
            onDisconnect: { run("disconnect") { try await disconnect(live) } }
        )
    }

    // MARK: - Actions

    private func reload() async {
        do {
            let result = try await firebaseManager.etsyConnections()
            connections = result.connections
            configured = result.configured
            errorText = ""
        } catch {
            errorText = error.localizedDescription.isEmpty
                ? tr("The Etsy connection could not be loaded.")
                : error.localizedDescription
        }
        loading = false
    }

    /// One place for busy state and error text, so no action can leave either behind.
    private func run(_ key: String, _ work: @escaping () async throws -> Void) {
        busy = key
        errorText = ""
        Task {
            do { try await work() }
            catch { errorText = error.localizedDescription }
            busy = ""
        }
    }

    private func connect() {
        run("connect") {
            let url = try await firebaseManager.etsyBeginConnect()
            guard let target = URL(string: url), !url.isEmpty else {
                throw EtsyError(message: tr("Something went wrong. Try again."))
            }
            // Etsy's approval page has to open in a browser: the callback ends
            // on the NivaDesk website and carries nothing tied to this app.
            // Afterwards the seller comes back here and we simply ask again.
            await MainActor.run { openExternal(target) }
            notice = tr("Approve the connection in your browser, then come back and press Check now.")
        }
    }

    private func check(_ live: EtsyConnectionInfo) async throws {
        let answer = try await firebaseManager.etsyVerify(live.id)
        if answer.healthy {
            liveCheck = "healthy"
            notice = tr("Etsy answered. This connection is working.")
            await reload()
            return
        }
        liveCheck = "unhealthy"
        let sentence = etsyErrorText(answer.reason, lang: language)
        errorText = sentence.isEmpty ? tr("Etsy did not accept this connection. Reconnect the shop to continue.") : sentence
        await reload()
    }

    private func syncNow(_ live: EtsyConnectionInfo) async throws {
        let outcome = try await firebaseManager.etsySyncNow(live.id)
        notice = (outcome.created == 0 && outcome.updated == 0)
            ? tr("Everything is already up to date.")
            : "\(outcome.created) \(tr("orders imported")) · \(outcome.updated) \(tr("updated"))"
        await reload()
    }

    private func importSelected(_ live: EtsyConnectionInfo, _ found: EtsyPreviewInfo) async throws {
        let chosen = found.rows.filter { $0.outcome != "unsupported" && !excluded.contains($0.receiptId) }
        guard !chosen.isEmpty else { throw EtsyError(message: tr("Select at least one order to import.")) }
        let outcome = try await firebaseManager.etsyImport(live.id, rules: rules, receiptIds: chosen.map(\.receiptId))
        notice = "\(outcome.created) \(tr("orders imported")) · \(outcome.updated) \(tr("updated"))"
        preview = nil
        await reload()
    }

    private func disconnect(_ live: EtsyConnectionInfo) async throws {
        try await firebaseManager.etsyDisconnect(live.id)
        confirmDisconnect = false
        preview = nil
        liveCheck = "unknown"
        notice = tr("Etsy disconnected. Your orders and production work are unchanged.")
        await reload()
    }

    private func openExternal(_ url: URL) {
        #if os(macOS)
        NSWorkspace.shared.open(url)
        #else
        UIApplication.shared.open(url)
        #endif
    }
}

// MARK: - Screen 1 · Before connecting

private struct EtsyConnectCard: View {
    let language: String
    let isOwner: Bool
    let busy: Bool
    let onConnect: () -> Void
    private func tr(_ text: String) -> String { t(text, lang: language) }

    var body: some View {
        SettingsCard(
            title: tr("Secure Etsy connection"),
            iconName: "lock.shield",
            footerText: tr("Disconnecting does not delete the orders already in NivaDesk.")
        ) {
            VStack(alignment: .leading, spacing: 12) {
                Text(tr("Your Etsy password is never shared with NivaDesk."))
                    .font(.system(size: 13)).foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                EtsyPermissionRow(text: tr("Read authorised sales data"), allowed: true, label: tr("Included"), language: language)
                EtsyPermissionRow(text: tr("Import line items and variations"), allowed: true, label: tr("Included"), language: language)
                EtsyPermissionRow(text: tr("Edit listings or Etsy checkout"), allowed: false, label: tr("Not allowed"), language: language)

                Text(tr("Privacy summary")).font(.system(size: 11, weight: .bold)).foregroundColor(.secondary)
                Text(tr("NivaDesk stores authorised connection tokens securely, uses data only for the connected workspace, and lets the owner disconnect at any time."))
                    .font(.system(size: 12)).foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                if isOwner {
                    Button {
                        onConnect()
                    } label: {
                        if busy {
                            HStack(spacing: 6) { ProgressView().controlSize(.small); Text(tr("Opening Etsy…")) }
                        } else {
                            Text(tr("Continue to Etsy"))
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(busy)
                } else {
                    Text(tr("Only the workspace owner can connect Etsy."))
                        .font(.system(size: 11, weight: .semibold)).foregroundColor(.secondary)
                }
            }
        }
    }
}

private struct EtsyPermissionRow: View {
    let text: String
    let allowed: Bool
    let label: String
    let language: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: allowed ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundColor(allowed ? .green : .secondary)
                .font(.system(size: 13))
            Text(text).font(.system(size: 12))
            Spacer(minLength: 6)
            Text(label).font(.system(size: 11, weight: .semibold)).foregroundColor(.secondary)
        }
    }
}

// MARK: - Screen 3 · Connected shop

private struct EtsyHeaderCard: View {
    let connection: EtsyConnectionInfo
    let language: String
    let liveCheck: String
    let checking: Bool
    let onCheck: () -> Void
    private func tr(_ text: String) -> String { t(text, lang: language) }

    /// What the server knows, which is what Reconnect exists for. The live
    /// check must never hide the button that can clear its own result.
    private var storedNeedsReconnect: Bool { connection.needsAttention }

    private var label: String {
        if connection.needsAttention || liveCheck == "unhealthy" { return tr("Needs attention") }
        // Connected is a fact: we hold access. Healthy is a claim about this
        // moment, and only a live answer from Etsy earns that word.
        return liveCheck == "healthy" ? tr("Healthy") : tr("Connected")
    }

    var body: some View {
        SettingsCard(title: connection.shopName.isEmpty ? tr("Etsy shop") : connection.shopName, iconName: "cart.fill") {
            VStack(alignment: .leading, spacing: 10) {
                Text("\(tr("Shop ID")) \(connection.shopId)" + (connection.shopCurrency.isEmpty ? "" : " · \(connection.shopCurrency)"))
                    .font(.system(size: 11)).foregroundColor(.secondary)

                HStack {
                    Text(tr("Connection")).font(.system(size: 12))
                    Spacer(minLength: 6)
                    Text(label).font(.system(size: 11, weight: .bold)).foregroundColor(.secondary)
                    if !storedNeedsReconnect {
                        Button(checking ? tr("Checking Etsy…") : tr("Check now"), action: onCheck)
                            .buttonStyle(.bordered).controlSize(.small).disabled(checking)
                    }
                }
                EtsyStatRow(name: tr("Granted scope"), value: tr("Sales read"))
                EtsyStatRow(name: tr("Last successful sync"), value: etsyRelativeTime(connection.lastSuccessAtMs, lang: language))
            }
        }
    }
}

private struct EtsyStatRow: View {
    let name: String
    let value: String
    var body: some View {
        HStack {
            Text(name).font(.system(size: 12))
            Spacer(minLength: 6)
            Text(value).font(.system(size: 11, weight: .semibold)).foregroundColor(.secondary)
        }
    }
}

// MARK: - Screen 7 · Error recovery

private struct EtsyAttentionCard: View {
    let connection: EtsyConnectionInfo
    let language: String
    let isOwner: Bool
    let busy: Bool
    let onReconnect: () -> Void
    private func tr(_ text: String) -> String { t(text, lang: language) }

    var body: some View {
        SettingsCard(title: tr("Connection needs attention"), iconName: "exclamationmark.triangle.fill") {
            VStack(alignment: .leading, spacing: 10) {
                Text(tr("We could not refresh this Etsy connection."))
                    .font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)

                let sentence = etsyErrorText(connection.lastErrorCode, lang: language)
                Text(sentence.isEmpty
                     ? tr("The shop owner may have revoked access, or Etsy may require authorisation again. Existing NivaDesk orders are safe.")
                     : sentence)
                    .font(.system(size: 12)).foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                EtsyStatRow(name: tr("Existing imported records"), value: tr("Safe"))

                if isOwner {
                    Button(tr("Reconnect Etsy"), action: onReconnect)
                        .buttonStyle(.borderedProminent).disabled(busy)
                }
            }
        }
    }
}

// MARK: - Screen 4 · Choose what to import

private struct EtsyRulesCard: View {
    @Binding var rules: EtsyImportRules
    let language: String
    let busy: Bool
    let onPreview: () -> Void
    private func tr(_ text: String) -> String { t(text, lang: language) }

    private let ranges: [(Int, String)] = [(30, "Last 30 days"), (90, "Last 90 days"), (365, "Last 12 months")]

    var body: some View {
        SettingsCard(
            title: tr("Choose what to import"),
            iconName: "slider.horizontal.3",
            footerText: tr("Nothing is imported until the workspace owner confirms this list.")
        ) {
            VStack(alignment: .leading, spacing: 12) {
                Text(tr("Date range")).font(.system(size: 11, weight: .bold)).foregroundColor(.secondary)
                HStack(spacing: 8) {
                    ForEach(ranges, id: \.0) { range in
                        Button(tr(range.1)) { rules.sinceDays = range.0 }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                            .tint(rules.sinceDays == range.0 ? .accentColor : .secondary)
                    }
                }

                Text(tr("Order states")).font(.system(size: 11, weight: .bold)).foregroundColor(.secondary)
                Toggle(tr("Paid and open orders"), isOn: .constant(true)).disabled(true)
                Toggle(tr("Completed orders"), isOn: $rules.includeCompleted)
                Toggle(tr("Orders not paid yet"), isOn: $rules.includeUnpaid)
                Toggle(tr("Cancelled orders"), isOn: $rules.includeCancelled)
                Toggle(tr("Digital-only orders"), isOn: $rules.includeDigital)

                Button {
                    onPreview()
                } label: {
                    if busy {
                        HStack(spacing: 6) { ProgressView().controlSize(.small); Text(tr("Checking Etsy…")) }
                    } else {
                        Text(tr("Review Etsy orders"))
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(busy)
            }
            .font(.system(size: 12))
        }
    }
}

// MARK: - Screen 5 · Preview, the gate

private struct EtsyPreviewCard: View {
    let preview: EtsyPreviewInfo
    @Binding var excluded: Set<String>
    let language: String
    let isOwner: Bool
    let busy: Bool
    let onLink: (EtsyPreviewRowInfo, EtsyCustomerCandidateInfo) -> Void
    let onImport: () -> Void
    private func tr(_ text: String) -> String { t(text, lang: language) }

    private var selectable: [EtsyPreviewRowInfo] { preview.rows.filter { $0.outcome != "unsupported" } }
    private var selectedCount: Int { selectable.filter { !excluded.contains($0.receiptId) }.count }

    var body: some View {
        SettingsCard(title: tr("Review Etsy orders"), iconName: "list.bullet.rectangle") {
            VStack(alignment: .leading, spacing: 12) {
                EtsyStatRow(name: tr("Orders found"), value: "\(preview.found)")
                EtsyStatRow(name: tr("Unsupported records"), value: "\(preview.unsupported)")
                if preview.alreadyImported > 0 {
                    Text("\(preview.alreadyImported) \(tr("of these are already in NivaDesk and will be updated, not duplicated."))")
                        .font(.system(size: 11)).foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if preview.truncated {
                    Text(tr("Only the most recent orders are shown. Import these first, then run the preview again."))
                        .font(.system(size: 11)).foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                ForEach(preview.rows) { row in
                    EtsyPreviewRowView(
                        row: row,
                        language: language,
                        excluded: excluded.contains(row.receiptId),
                        onToggle: {
                            if excluded.contains(row.receiptId) { excluded.remove(row.receiptId) }
                            else { excluded.insert(row.receiptId) }
                        },
                        onLink: { candidate in onLink(row, candidate) }
                    )
                }

                if isOwner {
                    Button {
                        onImport()
                    } label: {
                        if busy {
                            HStack(spacing: 6) { ProgressView().controlSize(.small); Text(tr("Checking Etsy…")) }
                        } else {
                            Text("\(tr("Import")) \(selectedCount) \(tr("selected orders"))")
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(busy || selectedCount == 0)
                } else {
                    Text(tr("Only the workspace owner can import orders."))
                        .font(.system(size: 11, weight: .semibold)).foregroundColor(.secondary)
                }
            }
        }
    }
}

private struct EtsyPreviewRowView: View {
    let row: EtsyPreviewRowInfo
    let language: String
    let excluded: Bool
    let onToggle: () -> Void
    let onLink: (EtsyCustomerCandidateInfo) -> Void
    private func tr(_ text: String) -> String { t(text, lang: language) }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 8) {
                if row.outcome == "unsupported" {
                    Image(systemName: "minus.circle").foregroundColor(.secondary).font(.system(size: 13))
                } else {
                    Button(action: onToggle) {
                        Image(systemName: excluded ? "square" : "checkmark.square.fill")
                            .foregroundColor(excluded ? .secondary : .accentColor)
                    }
                    .buttonStyle(.plain)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(row.customerName.isEmpty ? tr("Etsy buyer") : row.customerName)
                        .font(.system(size: 12, weight: .semibold))
                    if !row.itemTitles.isEmpty {
                        Text(row.itemTitles.joined(separator: ", "))
                            .font(.system(size: 11)).foregroundColor(.secondary)
                            .lineLimit(2)
                    }
                    if !row.personalisation.isEmpty {
                        Text("\(tr("Personalisation")): \(row.personalisation.joined(separator: " · "))")
                            .font(.system(size: 11)).foregroundColor(.secondary)
                            .lineLimit(2)
                    }
                }
                Spacer(minLength: 6)
                Text(row.total > 0 ? "\(row.currency) \(String(format: "%.2f", row.total))" : "")
                    .font(.system(size: 11, weight: .semibold)).foregroundColor(.secondary)
            }

            if row.outcome != "ready" {
                Text(etsyReviewReasonText(row.reason, lang: language))
                    .font(.system(size: 11)).foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if row.decision == "review" && !row.candidates.isEmpty {
                Text(tr("Possible customer match")).font(.system(size: 11, weight: .bold)).foregroundColor(.secondary)
                Text(tr("No automatic merge. The decision is saved for this Etsy buyer identity."))
                    .font(.system(size: 11)).foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                ForEach(row.candidates) { candidate in
                    Button("\(tr("Link to existing")): \(candidate.name)") { onLink(candidate) }
                        .buttonStyle(.bordered).controlSize(.small)
                }
                Text(tr("Matching signals: normalised name + shipping address. Email alone is never enough."))
                    .font(.system(size: 10)).foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 6)
    }
}

// MARK: - Screen 6 · Sync centre

private struct EtsySyncCard: View {
    let connection: EtsyConnectionInfo
    let language: String
    let busy: Bool
    let onSync: () -> Void
    private func tr(_ text: String) -> String { t(text, lang: language) }

    var body: some View {
        SettingsCard(title: tr("Etsy sync"), iconName: "arrow.triangle.2.circlepath") {
            VStack(alignment: .leading, spacing: 10) {
                EtsyStatRow(name: tr("Last checked"), value: etsyRelativeTime(connection.lastSyncAtMs, lang: language))
                EtsyStatRow(name: tr("Existing imported records"), value: "\(connection.importedOrders)")

                if connection.recentEvents.isEmpty {
                    Text(tr("No Etsy activity yet.")).font(.system(size: 11)).foregroundColor(.secondary)
                } else {
                    ForEach(connection.recentEvents) { event in
                        HStack {
                            Text(event.error.isEmpty ? event.type : "\(event.type) · \(event.error)")
                                .font(.system(size: 11)).lineLimit(1)
                            Spacer(minLength: 6)
                            Text(etsyRelativeTime(event.atMs, lang: language))
                                .font(.system(size: 10)).foregroundColor(.secondary)
                        }
                    }
                }

                Button {
                    onSync()
                } label: {
                    if busy {
                        HStack(spacing: 6) { ProgressView().controlSize(.small); Text(tr("Checking Etsy…")) }
                    } else {
                        Text(tr("Sync now"))
                    }
                }
                .buttonStyle(.bordered)
                .disabled(busy)
            }
        }
    }
}

// MARK: - Screen 8 · Disconnect

private struct EtsyDisconnectCard: View {
    let language: String
    let isOwner: Bool
    @Binding var confirming: Bool
    let busy: Bool
    let onDisconnect: () -> Void
    private func tr(_ text: String) -> String { t(text, lang: language) }

    var body: some View {
        SettingsCard(
            title: tr("Disconnect Etsy"),
            iconName: "link.badge.plus",
            footerText: tr("Deleting imported Etsy source data is a separate request and is not available yet. Disconnecting never deletes anything from Etsy.")
        ) {
            VStack(alignment: .leading, spacing: 10) {
                Text(tr("What happens next?")).font(.system(size: 11, weight: .bold)).foregroundColor(.secondary)
                EtsyPermissionRow(text: tr("Stop future Etsy synchronisation"), allowed: false, label: "", language: language)
                EtsyPermissionRow(text: tr("Keep existing orders and production work"), allowed: true, label: "", language: language)
                EtsyPermissionRow(text: tr("Revoke stored access tokens"), allowed: false, label: "", language: language)

                if !isOwner {
                    Text(tr("Only the workspace owner can disconnect Etsy."))
                        .font(.system(size: 11, weight: .semibold)).foregroundColor(.secondary)
                } else if confirming {
                    HStack(spacing: 8) {
                        Button(tr("Disconnect shop"), role: .destructive, action: onDisconnect)
                            .buttonStyle(.borderedProminent).disabled(busy)
                        Button(tr("Keep connected")) { confirming = false }
                            .buttonStyle(.bordered)
                    }
                } else {
                    Button(tr("Disconnect Etsy")) { confirming = true }
                        .buttonStyle(.bordered)
                }
            }
        }
    }
}
