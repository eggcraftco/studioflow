import SwiftUI

// The eBay screen on Mac and iPhone. Data layer and sentences live in
// EbayIntegration.swift; this file is only what the seller sees.
//
// A mirror of studioflow-web/app/settings/EbayIntegrationSection.tsx: same
// cards, same order, same sentences. Two things shape it:
//
//   * Connect opens nivadesk.app in the system browser, not eBay. A native app
//     cannot set the first-party cookie that binds the callback to the browser
//     that started the flow, so the start page does that half (docs §5.2).
//     There is no deep link back into this app and none is needed: when the
//     app comes to the front it simply asks the server again.
//   * Every card branches on `specStatus`, the server's own word for the row.
//     Reading `lastErrorCode` and deciding for ourselves is how three clients
//     end up with three different ideas of "healthy".
//
// Deliberately split into small structs rather than one deep body. A view tree
// nested this far renders fine on Mac and in the simulator and blows the stack
// guard on a real iPhone — a crash you cannot reproduce anywhere you would
// normally look.

struct EbayIntegrationView: View {
    let language: String
    let isOwner: Bool
    @EnvironmentObject var firebaseManager: FirebaseManager
    @Environment(\.scenePhase) private var scenePhase

    @State private var loading = true
    @State private var configured = true
    @State private var workspaceEnabled = true
    @State private var environment = "sandbox"
    @State private var connections: [EbayConnectionInfo] = []
    @State private var busy = ""
    @State private var errorText = ""
    @State private var notice = ""
    /// The seller has left for the browser. Coming back to the front is the
    /// only signal we get that the flow may have finished.
    @State private var awaitingReturn = false
    @State private var confirmDisconnect = false
    @State private var sinceDays = 90
    @State private var includeUnpaid = false
    @State private var includeCancelled = true
    @State private var preview: EbayImportPreviewInfo?
    @State private var imported: EbayImportResultInfo?

    /// A disconnected row is not a connection, so it is never the one on screen.
    private var connection: EbayConnectionInfo? {
        connections.first { $0.status == "connected" } ?? connections.first { $0.status != "disconnected" }
    }
    private func tr(_ text: String) -> String { t(text, lang: language) }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if !notice.isEmpty {
                Text(notice).font(.system(size: 12, weight: .semibold)).foregroundColor(.green)
                    .fixedSize(horizontal: false, vertical: true)
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
                // Not a fault: this server has no eBay application wired up.
                SettingsCard(title: "eBay", iconName: "cart.fill") {
                    Text(tr("eBay is not set up on this server yet. Contact support and we will enable it."))
                        .font(.system(size: 13)).foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else if let live = connection {
                connectedBody(live)
            } else if !workspaceEnabled {
                // The server has eBay, but this workspace is not on its rollout list yet:
                // say so rather than show a Connect the server would refuse.
                SettingsCard(title: "eBay", iconName: "cart.fill") {
                    Text(tr("eBay is not available for this workspace yet."))
                        .font(.system(size: 13)).foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                EbayConnectCard(
                    language: language,
                    isOwner: isOwner,
                    sandbox: environment == "sandbox",
                    busy: busy == "connect",
                    awaitingReturn: awaitingReturn,
                    onConnect: connect,
                    onFinish: { awaitingReturn = false; Task { await reload() } }
                )
            }
        }
        .task { await reload() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, awaitingReturn, busy.isEmpty {
                awaitingReturn = false
                Task { await reload() }
            }
        }
    }

    @ViewBuilder
    private func connectedBody(_ live: EbayConnectionInfo) -> some View {
        EbayHeaderCard(
            connection: live,
            language: language,
            isOwner: isOwner,
            busy: busy,
            onReconnect: connect,
            onCheck: { run("verify") { try await check(live) } },
            onSync: { run("sync") { try await syncNow(live) } }
        )

        if isOwner && !live.importDone {
            EbayImportCard(
                connection: live,
                language: language,
                sinceDays: $sinceDays,
                includeUnpaid: $includeUnpaid,
                includeCancelled: $includeCancelled,
                preview: preview,
                imported: imported,
                busy: busy,
                onPreview: { run("preview") { imported = nil; preview = try await firebaseManager.ebayPreviewImport(live.id, sinceDays: sinceDays) } },
                onImport: { run("import") { try await runImport(live) } },
                onRetry: { run("retry") { try await retryFailures(live) } }
            )
        }

        if isOwner {
            EbaySettingsCard(
                connection: live,
                language: language,
                busy: busy == "settings",
                onSettings: { patch in run("settings") { try await saveSettings(live, patch) } },
                onMarketplace: { marketplace, enabled in
                    run("settings") { try await saveMarketplace(live, marketplace: marketplace, enabled: enabled) }
                }
            )
        }

        CommerceSyncHealthView(companyId: firebaseManager.currentCompanyId, provider: "ebay", isOwner: isOwner, language: language)

        EbayActivityCard(connection: live, language: language)

        if isOwner {
            EbayDisconnectCard(
                language: language,
                confirming: $confirmDisconnect,
                busy: busy == "disconnect",
                onDisconnect: { run("disconnect") { try await disconnect(live) } }
            )
        }
    }

    // MARK: - Actions

    /// keepError: a reload is not evidence that whatever just failed is fine
    /// now. The live check sets a message and then reloads; clearing
    /// unconditionally deleted it a moment after it appeared.
    private func reload(keepError: Bool = false) async {
        do {
            let result = try await firebaseManager.ebayConnections()
            connections = result.connections
            configured = result.configured
            workspaceEnabled = result.workspaceEnabled
            environment = result.environment
            if !keepError { errorText = "" }
        } catch {
            errorText = error.localizedDescription.isEmpty ? tr("Could not load.") : error.localizedDescription
        }
        loading = false
    }

    /// One place for busy state and messages, so no action can leave either behind.
    private func run(_ key: String, _ work: @escaping () async throws -> Void) {
        busy = key
        errorText = ""
        // The last action's green line has nothing to say about this one, and
        // leaving it puts a success message above the error that contradicts it.
        notice = ""
        Task {
            do { try await work() }
            catch { errorText = error.localizedDescription }
            busy = ""
        }
    }

    private func connect() {
        run("connect") {
            let url = try await firebaseManager.ebayBeginConnect()
            guard !url.isEmpty, let target = URL(string: url) else {
                throw EbayError(message: tr("eBay did not complete the connection. Try again."))
            }
            // nivadesk.app, never eBay's authorize URL: the start page signs the
            // owner in, claims the state once and sets the browser-binding
            // cookie this app cannot set (docs §5.2).
            await MainActor.run {
                openExternal(target)
                awaitingReturn = true
            }
            notice = tr("The button opens nivadesk.app in your browser. Sign in if asked, approve on eBay, then come back here.")
        }
    }

    private func check(_ live: EbayConnectionInfo) async throws {
        let answer = try await firebaseManager.ebayVerify(live.id)
        if answer.healthy {
            notice = tr("The eBay connection is working.")
            await reload()
            return
        }
        errorText = ebayReasonText(answer.reason, lang: language)
        await reload(keepError: true)
    }

    private func syncNow(_ live: EbayConnectionInfo) async throws {
        let outcome = try await firebaseManager.ebaySyncNow(live.id)
        // held and failed are part of what happened. Reading only created and
        // updated is how a pass where every order failed gets reported as a
        // success.
        notice = tr("Synced: {created} new, {updated} updated, {held} held, {failed} failed")
            .replacingOccurrences(of: "{created}", with: "\(outcome.created)")
            .replacingOccurrences(of: "{updated}", with: "\(outcome.updated)")
            .replacingOccurrences(of: "{held}", with: "\(outcome.held)")
            .replacingOccurrences(of: "{failed}", with: "\(outcome.failed)")
        await reload(keepError: true)
    }

    private func runImport(_ live: EbayConnectionInfo) async throws {
        preview = nil
        imported = try await firebaseManager.ebayRunImport(
            live.id, sinceDays: sinceDays, includeUnpaid: includeUnpaid, includeCancelled: includeCancelled
        )
        await reload(keepError: true)
    }

    private func retryFailures(_ live: EbayConnectionInfo) async throws {
        let result = try await firebaseManager.ebayRetryImportFailures(live.id)
        notice = tr("{count} orders were brought in on the retry.")
            .replacingOccurrences(of: "{count}", with: "\(result.recovered)")
        await reload(keepError: true)
    }

    private func saveSettings(_ live: EbayConnectionInfo, _ patch: [String: Any]) async throws {
        try await firebaseManager.ebayUpdateSettings(live.id, settings: patch)
        notice = tr("Settings saved.")
        await reload(keepError: true)
    }

    private func saveMarketplace(_ live: EbayConnectionInfo, marketplace: String, enabled: Bool) async throws {
        try await firebaseManager.ebaySetMarketplace(live.id, marketplace: marketplace, enabled: enabled)
        notice = tr("Settings saved.")
        await reload(keepError: true)
    }

    private func disconnect(_ live: EbayConnectionInfo) async throws {
        try await firebaseManager.ebayDisconnect(live.id)
        confirmDisconnect = false
        preview = nil
        imported = nil
        notice = tr("eBay account disconnected. Your orders stay in NivaDesk.")
        await reload(keepError: true)
    }

    private func openExternal(_ url: URL) {
        #if os(macOS)
        NSWorkspace.shared.open(url)
        #else
        UIApplication.shared.open(url)
        #endif
    }
}

// MARK: - Before connecting

private struct EbayConnectCard: View {
    let language: String
    let isOwner: Bool
    let sandbox: Bool
    let busy: Bool
    let awaitingReturn: Bool
    let onConnect: () -> Void
    let onFinish: () -> Void
    private func tr(_ text: String) -> String { t(text, lang: language) }

    var body: some View {
        SettingsCard(title: tr("Connect your eBay account"), iconName: "lock.shield") {
            VStack(alignment: .leading, spacing: 12) {
                Text(tr("Connect your eBay seller account once; orders, payments and refunds arrive on their own."))
                    .font(.system(size: 13)).foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                // True of the scopes this half asks for, and only those.
                Text(tr("NivaDesk will read your orders. It will not change listings, prices or stock."))
                    .font(.system(size: 12)).foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                if sandbox {
                    Text(tr("Sandbox — test orders only"))
                        .font(.system(size: 11, weight: .bold)).foregroundColor(.secondary)
                }

                if isOwner {
                    HStack(spacing: 10) {
                        Button {
                            onConnect()
                        } label: {
                            if busy {
                                HStack(spacing: 6) { ProgressView().controlSize(.small); Text(tr("Opening eBay…")) }
                            } else {
                                Text(tr("Connect eBay"))
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(busy)
                        if awaitingReturn {
                            Button(tr("Finish connection"), action: onFinish).buttonStyle(.bordered)
                        }
                    }
                    Text(tr("The button opens nivadesk.app in your browser. Sign in if asked, approve on eBay, then come back here."))
                        .font(.system(size: 11)).foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    Text(tr("Only the workspace owner can connect or disconnect an eBay account."))
                        .font(.system(size: 11, weight: .semibold)).foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

// MARK: - The connected account

private struct EbayHeaderCard: View {
    let connection: EbayConnectionInfo
    let language: String
    let isOwner: Bool
    let busy: String
    let onReconnect: () -> Void
    let onCheck: () -> Void
    let onSync: () -> Void
    private func tr(_ text: String) -> String { t(text, lang: language) }

    private var sites: String {
        let enabled = connection.marketplaces.filter { $0.enabled }.map { $0.marketplace }
        return enabled.isEmpty ? "—" : enabled.joined(separator: ", ")
    }

    var body: some View {
        SettingsCard(title: connection.title.isEmpty ? "eBay" : connection.title, iconName: "cart.fill") {
            VStack(alignment: .leading, spacing: 10) {
                Text("\(tr("eBay seller")) · \(connection.isSandbox ? tr("Sandbox") : tr("Production")) · \(tr("Read only"))")
                    .font(.system(size: 12)).foregroundColor(.secondary)

                EbayStatRow(name: tr("Connection"), value: tr(ebayStatusLabel(connection.specStatus)))
                EbayStatRow(name: tr("eBay sites"), value: sites)
                EbayStatRow(name: tr("Last successful sync"), value: ebayRelativeTime(connection.lastSuccessAtMs, lang: language))
                EbayStatRow(name: tr("Last full check"), value: ebayRelativeTime(connection.lastFullReconciliationAtMs, lang: language))
                EbayStatRow(name: tr("Calls used today"), value: "\(connection.quotaToday) / \(connection.quotaShare)")

                let sentence = ebaySpecStatusText(connection.specStatus, connection.lastErrorCode, lang: language)
                if !sentence.isEmpty {
                    Text(sentence).font(.system(size: 12)).foregroundColor(.red)
                        .fixedSize(horizontal: false, vertical: true)
                }
                // The 18-month refresh authorisation is running out. A date is
                // the only useful form of that warning.
                if connection.reauthorizeByMs > 0 && connection.lastErrorCode == "refresh_token_expiring" {
                    Text(tr("Reconnect eBay before {date} to keep syncing.")
                        .replacingOccurrences(of: "{date}", with: EbayHeaderCard.dateText(connection.reauthorizeByMs, language: language)))
                        .font(.system(size: 12)).foregroundColor(.red)
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: 10) {
                    if connection.needsReconnect && isOwner {
                        Button(busy == "connect" ? tr("Opening eBay…") : tr("Reconnect eBay"), action: onReconnect)
                            .buttonStyle(.borderedProminent).disabled(busy == "connect")
                    }
                    Button(busy == "verify" ? tr("Checking…") : tr("Check now"), action: onCheck)
                        .buttonStyle(.bordered).controlSize(.small).disabled(busy == "verify")
                    Button(busy == "sync" ? tr("Syncing…") : tr("Sync now"), action: onSync)
                        .buttonStyle(.bordered).controlSize(.small)
                        .disabled(busy == "sync" || connection.status != "connected")
                }
                Text(tr("Sync now checks the last 24 hours."))
                    .font(.system(size: 11)).foregroundColor(.secondary)
                // No listing or stock write exists in this half, and the screen
                // says so rather than leaving the seller to find out.
                Text(tr("Listings and stock stay managed on eBay."))
                    .font(.system(size: 11)).foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    static func dateText(_ atMs: Double, language: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: localeIdentifier(forLanguage: language))
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter.string(from: Date(timeIntervalSince1970: atMs / 1000))
    }
}

private struct EbayStatRow: View {
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

// MARK: - Choose what to import

private struct EbayImportCard: View {
    let connection: EbayConnectionInfo
    let language: String
    @Binding var sinceDays: Int
    @Binding var includeUnpaid: Bool
    @Binding var includeCancelled: Bool
    let preview: EbayImportPreviewInfo?
    let imported: EbayImportResultInfo?
    let busy: String
    let onPreview: () -> Void
    let onImport: () -> Void
    let onRetry: () -> Void
    private func tr(_ text: String) -> String { t(text, lang: language) }

    private static let ranges = [7, 30, 90]

    var body: some View {
        SettingsCard(title: tr("Choose what to import"), iconName: "slider.horizontal.3") {
            VStack(alignment: .leading, spacing: 12) {
                Text(tr("Preview writes nothing. It counts the orders eBay has in the period and how many are already here."))
                    .font(.system(size: 12)).foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                Text(tr("How far back")).font(.system(size: 11, weight: .bold)).foregroundColor(.secondary)
                HStack(spacing: 8) {
                    ForEach(Self.ranges, id: \.self) { days in
                        Button(tr("{count} days").replacingOccurrences(of: "{count}", with: "\(days)")) { sinceDays = days }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                            .tint(sinceDays == days ? .accentColor : .secondary)
                    }
                }

                Toggle(tr("Include orders that are not paid yet"), isOn: $includeUnpaid)
                Toggle(tr("Include cancelled orders"), isOn: $includeCancelled)

                HStack(spacing: 10) {
                    Button(busy == "preview" ? tr("Checking…") : tr("Preview"), action: onPreview)
                        .buttonStyle(.bordered).disabled(busy == "preview" || connection.status != "connected")
                    Button(busy == "import" ? tr("Importing…") : tr("Import"), action: onImport)
                        .buttonStyle(.borderedProminent).disabled(busy == "import" || connection.status != "connected")
                }

                if let found = preview { previewLines(found) }
                if let done = imported { importedLine(done) }

                // The cursor is only "paused" once a run has actually stopped
                // short; no cursor at all means no import has run yet.
                if connection.importComplete == false {
                    Text(tr("Import paused — press Import again to continue."))
                        .font(.system(size: 11)).foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if connection.importFailedCount > 0 {
                    HStack(spacing: 10) {
                        Text(tr("{count} orders could not be imported.")
                            .replacingOccurrences(of: "{count}", with: "\(connection.importFailedCount)"))
                            .font(.system(size: 11)).foregroundColor(.red)
                            .fixedSize(horizontal: false, vertical: true)
                        Button(tr("Retry"), action: onRetry)
                            .buttonStyle(.bordered).controlSize(.small).disabled(busy == "retry")
                    }
                }
            }
            .font(.system(size: 12))
        }
    }

    @ViewBuilder
    private func previewLines(_ found: EbayImportPreviewInfo) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            EbayStatRow(
                name: tr("Orders found"),
                // Truncated means the budget ran out before the window did, so
                // the number is a floor. Printing it plain reads as a total.
                value: found.truncated
                    ? tr("estimate — more than {count} orders").replacingOccurrences(of: "{count}", with: "\(found.ordersFound)")
                    : "\(found.ordersFound)"
            )
            EbayStatRow(name: tr("Duplicate orders prevented"), value: "\(found.duplicatesPrevented)")
            EbayStatRow(name: tr("Not paid yet"), value: "\(found.unpaid)")
            EbayStatRow(name: tr("Cancelled"), value: "\(found.cancelled)")
            if !found.marketplaces.isEmpty {
                EbayStatRow(name: tr("eBay sites"), value: found.marketplaces.joined(separator: ", "))
            }
        }
    }

    @ViewBuilder
    private func importedLine(_ done: EbayImportResultInfo) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            EbayStatRow(name: tr("Imported"), value: "\(done.outcome.created)")
            EbayStatRow(name: tr("Updated"), value: "\(done.outcome.updated)")
            if done.outcome.held > 0 { EbayStatRow(name: tr("Held"), value: "\(done.outcome.held)") }
            if done.outcome.failed > 0 { EbayStatRow(name: tr("Failed"), value: "\(done.outcome.failed)") }
        }
    }
}

// MARK: - What comes in

private struct EbaySettingsCard: View {
    let connection: EbayConnectionInfo
    let language: String
    let busy: Bool
    let onSettings: ([String: Any]) -> Void
    let onMarketplace: (String, Bool) -> Void
    private func tr(_ text: String) -> String { t(text, lang: language) }

    var body: some View {
        SettingsCard(title: tr("What comes in"), iconName: "arrow.triangle.2.circlepath") {
            VStack(alignment: .leading, spacing: 10) {
                Toggle(tr("Check eBay for new and changed orders automatically"), isOn: Binding(
                    get: { connection.settings.autoSync },
                    set: { onSettings(["autoSync": $0]) }
                )).disabled(busy)
                Toggle(tr("Include orders that are not paid yet"), isOn: Binding(
                    get: { connection.settings.includeUnpaid },
                    set: { onSettings(["includeUnpaid": $0]) }
                )).disabled(busy)
                Toggle(tr("Include cancelled orders"), isOn: Binding(
                    get: { connection.settings.includeCancelled },
                    set: { onSettings(["includeCancelled": $0]) }
                )).disabled(busy)

                Text(tr("eBay sites")).font(.system(size: 11, weight: .bold)).foregroundColor(.secondary)
                // Only the sites this account has actually sold on are offered:
                // a list of every eBay marketplace would be a guess about the
                // seller, and a guess with a switch beside it.
                if connection.marketplaces.isEmpty {
                    Text(tr("The eBay sites you sell on appear here after the first orders arrive."))
                        .font(.system(size: 11)).foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    ForEach(connection.marketplaces) { row in
                        Toggle(isOn: Binding(
                            get: { row.enabled },
                            set: { onMarketplace(row.marketplace, $0) }
                        )) {
                            Text(row.currency.isEmpty ? row.marketplace : "\(row.marketplace) · \(row.currency)")
                                .font(.system(size: 12))
                        }
                        .disabled(busy)
                    }
                }
            }
            .font(.system(size: 12))
        }
    }
}

// MARK: - Recent activity

private struct EbayActivityCard: View {
    let connection: EbayConnectionInfo
    let language: String
    private func tr(_ text: String) -> String { t(text, lang: language) }

    var body: some View {
        SettingsCard(title: tr("Recent activity"), iconName: "list.bullet.rectangle") {
            VStack(alignment: .leading, spacing: 8) {
                EbayStatRow(name: tr("Last checked"), value: ebayRelativeTime(connection.lastSyncAtMs, lang: language))
                if connection.recentEvents.isEmpty {
                    Text(tr("Nothing has happened on this connection yet."))
                        .font(.system(size: 11)).foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    ForEach(connection.recentEvents) { event in
                        HStack {
                            Text(ebayEventText(event.type, lang: language))
                                .font(.system(size: 11)).lineLimit(1)
                            Spacer(minLength: 6)
                            Text(ebayRelativeTime(event.atMs, lang: language))
                                .font(.system(size: 10)).foregroundColor(.secondary)
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Disconnect

private struct EbayDisconnectCard: View {
    let language: String
    @Binding var confirming: Bool
    let busy: Bool
    let onDisconnect: () -> Void
    private func tr(_ text: String) -> String { t(text, lang: language) }

    var body: some View {
        SettingsCard(title: tr("Disconnect eBay"), iconName: "link.badge.plus") {
            VStack(alignment: .leading, spacing: 10) {
                if confirming {
                    Text(tr("Disconnect this eBay account? Syncing stops and the stored eBay access is destroyed. The orders already imported stay in this workspace."))
                        .font(.system(size: 12)).foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 8) {
                        Button(tr("Disconnect"), role: .destructive, action: onDisconnect)
                            .buttonStyle(.borderedProminent).disabled(busy)
                        Button(tr("Keep connected")) { confirming = false }
                            .buttonStyle(.bordered)
                    }
                } else {
                    Button(tr("Disconnect eBay")) { confirming = true }
                        .buttonStyle(.bordered)
                }
            }
        }
    }
}
