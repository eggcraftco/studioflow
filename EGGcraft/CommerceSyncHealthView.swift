import SwiftUI
import FirebaseFunctions

// Faz 2 / OBS-003+004 — freshness per data type per connection, the events
// behind it, and a Retry for a dead one (owner only). Reads the common
// engine's health and event records; the same card sits under Shopify and
// Etsy on every platform.
struct CommerceHealthEntity {
    let state: String
    let lastSuccessAtMs: Double
    let lastAttemptAtMs: Double
    let lastWebhookAtMs: Double
    let pendingRetries: Int
    let deadLetters: Int
}

struct CommerceHealthConnection: Identifiable {
    let provider: String
    let connectionId: String
    let health: [String: CommerceHealthEntity]
    var id: String { "\(provider):\(connectionId)" }
}

struct CommerceEventRow: Identifiable {
    let key: String
    let provider: String
    let externalId: String
    let eventType: String
    let status: String
    let message: String
    let startedAtMs: Double
    var id: String { key }
}

struct CommerceSyncHealthView: View {
    let companyId: String
    let provider: String
    let isOwner: Bool
    let language: String

    @State private var connections: [CommerceHealthConnection]? = nil
    @State private var events: [CommerceEventRow] = []
    @State private var errorText = ""
    @State private var notice = ""
    @State private var busyKey = ""

    private func tr(_ key: String) -> String { t(key, lang: language) }
    private let entityLabel = ["orders": "Orders", "products": "Products", "inventory": "Inventory", "finance": "Finance"]
    private let stateLabel = ["fresh": "Fresh", "stale": "Stale", "never": "Never synced", "unsupported": "Not supported"]
    private let statusLabel = ["applied": "Applied", "retrying": "Retrying", "dead": "Dead", "failed": "Dead", "skipped": "Skipped", "duplicate": "Duplicate", "stale": "Stale", "noop": "No change", "held": "Held", "queued": "Queued", "processing": "Processing", "received": "Received"]

    var body: some View {
        SettingsCard(title: tr("Sync health"), iconName: "waveform.path.ecg", footerText: tr("Freshness per data type for this connection, and the events behind it.")) {
            VStack(alignment: .leading, spacing: 10) {
                if !errorText.isEmpty { Text(errorText).font(.system(size: 12)).foregroundColor(.red) }
                if let rows = connections {
                    if rows.isEmpty {
                        Text(tr("No sync activity recorded yet.")).font(.system(size: 12)).foregroundColor(.secondary)
                    } else {
                        ForEach(rows) { row in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(row.connectionId).font(.system(size: 13, weight: .semibold))
                                HStack(spacing: 6) {
                                    ForEach(["orders", "products", "inventory", "finance"], id: \.self) { entity in
                                        let cell = row.health[entity]
                                        pill("\(tr(entityLabel[entity] ?? entity)): \(tr(stateLabel[cell?.state ?? "unsupported"] ?? "Not supported"))", tone: cell?.state ?? "unsupported")
                                    }
                                }
                                let orders = row.health["orders"]
                                Text("\(tr("Last successful sync")): \(ago(orders?.lastSuccessAtMs ?? 0)) · \(tr("Last webhook")): \(ago(orders?.lastWebhookAtMs ?? 0)) · \(tr("Pending retries")): \(orders?.pendingRetries ?? 0) · \(tr("Dead letters")): \(orders?.deadLetters ?? 0)")
                                    .font(.system(size: 12)).foregroundColor(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                    Text(tr("Recent activity")).font(.system(size: 13, weight: .semibold)).padding(.top, 4)
                    if events.isEmpty {
                        Text(tr("No events yet.")).font(.system(size: 12)).foregroundColor(.secondary)
                    } else {
                        ForEach(events) { row in
                            let dead = row.status == "dead" || row.status == "failed"
                            VStack(alignment: .leading, spacing: 3) {
                                HStack(spacing: 8) {
                                    pill(tr(statusLabel[row.status] ?? row.status), tone: dead ? "dead" : (row.status == "applied" ? "fresh" : (row.status == "retrying" ? "stale" : "plain")))
                                    Text("\(row.eventType)\(row.externalId.isEmpty ? "" : " · #\(row.externalId)")").font(.system(size: 12))
                                    Text(ago(row.startedAtMs)).font(.system(size: 11)).foregroundColor(.secondary)
                                    if dead && isOwner {
                                        Button(tr("Retry")) { retry(row.key) }
                                            .buttonStyle(.bordered).controlSize(.small)
                                            .disabled(busyKey == row.key)
                                    }
                                }
                                if !row.message.isEmpty {
                                    Text(row.message).font(.system(size: 11)).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }
                    }
                    if !notice.isEmpty { Text(notice).font(.system(size: 12)).foregroundColor(.green) }
                } else {
                    HStack(spacing: 8) {
                        ProgressView().controlSize(.small)
                        Text(tr("Loading...")).font(.system(size: 12, weight: .semibold)).foregroundColor(.secondary)
                    }
                }
            }
        }
        .onAppear { load() }
    }

    private func pill(_ text: String, tone: String) -> some View {
        let color: Color = tone == "fresh" ? .green : (tone == "stale" ? .orange : (tone == "dead" ? .red : .secondary))
        return Text(text)
            .font(.system(size: 11, weight: .bold))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.12))
            .foregroundColor(color)
            .cornerRadius(999)
    }

    private func ago(_ ms: Double) -> String {
        guard ms > 0 else { return "—" }
        let diff = max(0, Date().timeIntervalSince1970 * 1000 - ms)
        if diff < 90_000 { return tr("Just now") }
        if diff < 90 * 60_000 { return "\(Int(diff / 60_000)) \(tr("minutes ago"))" }
        if diff < 36 * 3_600_000 { return "\(Int(diff / 3_600_000)) \(tr("hours ago"))" }
        return "\(Int(diff / 86_400_000)) \(tr("days ago"))"
    }

    private func load() {
        let companyId = self.companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !companyId.isEmpty else { connections = []; return }
        let functions = Functions.functions(region: "europe-west2")
        functions.httpsCallable("getCommerceHealth").call(["companyId": companyId]) { result, error in
            DispatchQueue.main.async {
                if let error = error { errorText = error.localizedDescription; connections = []; return }
                let raw = ((result?.data as? [String: Any])?["connections"] as? [[String: Any]]) ?? []
                connections = raw.compactMap { entry in
                    guard (entry["provider"] as? String) == provider else { return nil }
                    let healthRaw = entry["health"] as? [String: Any] ?? [:]
                    var health: [String: CommerceHealthEntity] = [:]
                    for (key, value) in healthRaw {
                        guard let cell = value as? [String: Any] else { continue }
                        health[key] = CommerceHealthEntity(
                            state: cell["state"] as? String ?? "unsupported",
                            lastSuccessAtMs: (cell["lastSuccessAtMs"] as? NSNumber)?.doubleValue ?? 0,
                            lastAttemptAtMs: (cell["lastAttemptAtMs"] as? NSNumber)?.doubleValue ?? 0,
                            lastWebhookAtMs: (cell["lastWebhookAtMs"] as? NSNumber)?.doubleValue ?? 0,
                            pendingRetries: (cell["pendingRetries"] as? NSNumber)?.intValue ?? 0,
                            deadLetters: (cell["deadLetters"] as? NSNumber)?.intValue ?? 0
                        )
                    }
                    return CommerceHealthConnection(provider: provider, connectionId: entry["connectionId"] as? String ?? "", health: health)
                }
            }
        }
        functions.httpsCallable("listCommerceEvents").call(["companyId": companyId, "limit": 40]) { result, _ in
            DispatchQueue.main.async {
                let raw = ((result?.data as? [String: Any])?["events"] as? [[String: Any]]) ?? []
                let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                let plain = ISO8601DateFormatter()
                events = raw.compactMap { entry in
                    guard (entry["provider"] as? String) == provider, let key = entry["key"] as? String else { return nil }
                    let started = entry["startedAt"] as? String ?? ""
                    let ms = (formatter.date(from: started) ?? plain.date(from: started))?.timeIntervalSince1970 ?? 0
                    return CommerceEventRow(key: key, provider: provider, externalId: entry["externalId"] as? String ?? "", eventType: entry["eventType"] as? String ?? "", status: entry["status"] as? String ?? "", message: entry["message"] as? String ?? "", startedAtMs: ms * 1000)
                }.prefix(20).map { $0 }
            }
        }
    }

    private func retry(_ key: String) {
        guard busyKey.isEmpty else { return }
        busyKey = key; notice = ""
        Functions.functions(region: "europe-west2").httpsCallable("retryCommerceEvent").call(["companyId": companyId, "eventKey": key]) { _, error in
            DispatchQueue.main.async {
                busyKey = ""
                notice = error == nil ? tr("Retried — see the result in the list.") : (error?.localizedDescription ?? tr("Retry failed."))
                load()
            }
        }
    }
}
