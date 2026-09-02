import SwiftUI
import FirebaseFunctions
import FirebaseFirestore

/// PayPal as a money feed: the owner pastes the client id and secret of the
/// workspace's own PayPal app (Transaction Search enabled); NivaDesk proves
/// them before writing anything, stores the secret encrypted, and from then
/// on PayPal's payments, fees and refunds sit in Banking beside the bank's
/// rows, with withdrawals matched to the statement so nothing is counted twice.
struct PayPalIntegrationView: View {
    let language: String
    let isOwner: Bool
    @EnvironmentObject var firebaseManager: FirebaseManager

    @State private var busy = ""
    @State private var errorText = ""
    @State private var notice = ""
    @State private var environment = "live"
    @State private var clientId = ""
    @State private var clientSecret = ""
    @State private var showForm = false
    @State private var confirmDisconnect = false
    @State private var payoutRows: [[String: Any]] = []
    @State private var payoutsText = ""
    @State private var settlePayoutId = ""
    @State private var settleHeader = ""
    @State private var settleCandidates: [[String: Any]] = []
    @State private var settleNear: [[String: Any]] = []

    private func tr(_ text: String) -> String { t(text, lang: language) }
    private var companyId: String { firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var connection: StudioBankConnection? {
        firebaseManager.bankConnections.first { $0.provider == "paypal" && $0.isLinked } ?? firebaseManager.bankConnections.first { $0.provider == "paypal" }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if !notice.isEmpty { Text(notice).font(.system(size: 12, weight: .semibold)).foregroundColor(.green).fixedSize(horizontal: false, vertical: true) }
            if !errorText.isEmpty { Text(errorText).font(.system(size: 12, weight: .semibold)).foregroundColor(.red).fixedSize(horizontal: false, vertical: true) }
            if let live = connection, !live.isDisconnected {
                connectedBody(live)
            } else {
                SettingsCard(title: tr("Connect your PayPal account"), iconName: "creditcard", footerText: isOwner ? nil : tr("Only the workspace owner can connect PayPal.")) {
                    if isOwner { PayPalConnectFormView(language: language, isOwner: isOwner, busy: busy == "connect", environment: $environment, clientId: $clientId, clientSecret: $clientSecret, hasConnection: false, onConnect: connect, onCancel: nil) }
                }
            }
        }
    }

    @ViewBuilder
    private func connectedBody(_ live: StudioBankConnection) -> some View {
        SettingsCard(title: live.providerName.isEmpty ? "PayPal" : live.providerName, iconName: "creditcard") {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 6) {
                    Text(tr("Connection")).font(.system(size: 12)).foregroundColor(.secondary)
                    Text(live.syncState == "ok" ? tr("Healthy") : live.syncState == "needs_reconsent" ? tr("Credentials rejected") : tr("Sync error"))
                        .font(.system(size: 12, weight: .semibold)).foregroundColor(live.syncState == "ok" ? .green : .red)
                }
                if let last = live.lastSyncedAt {
                    Text("\(tr("Last sync")) \(last.formatted(date: .abbreviated, time: .shortened))").font(.system(size: 12)).foregroundColor(.secondary)
                }
                HStack(spacing: 10) {
                    Button(busy == "sync" ? tr("Syncing…") : tr("Sync now")) { syncNow() }.buttonStyle(.borderedProminent).disabled(!isOwner || busy == "sync")
                    if isOwner { Button(tr("Enter new credentials")) { showForm.toggle() }.buttonStyle(.bordered) }
                }
                if showForm {
                    PayPalConnectFormView(language: language, isOwner: isOwner, busy: busy == "connect", environment: $environment, clientId: $clientId, clientSecret: $clientSecret, hasConnection: true, onConnect: connect, onCancel: { showForm = false; clientSecret = "" })
                }
            }
        }

        SettingsCard(title: tr("PayPal withdrawals"), iconName: "building.columns") {
            VStack(alignment: .leading, spacing: 10) {
                Text(tr("Money PayPal sent to your bank. Each withdrawal is matched to the bank row it landed in, so the same sales are never counted twice."))
                    .font(.system(size: 12)).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
                Button(tr("Load")) { loadPayouts() }.buttonStyle(.bordered).disabled(busy == "payouts")
                if !payoutsText.isEmpty { Text(payoutsText).font(.system(size: 12)).foregroundColor(.secondary) }
                ForEach(Array(payoutRows.enumerated()), id: \.offset) { _, row in
                    SquarePayoutRowView(row: row, isOwner: isOwner, busy: busy == "settle", tr: tr,
                                        onFind: { findBankRow(payoutId: row["id"] as? String ?? "") },
                                        onUnlink: { unlinkPayout(payoutId: row["id"] as? String ?? "") })
                }
                if !settlePayoutId.isEmpty {
                    SquareSettlementCandidatesView(header: settleHeader, candidates: settleCandidates, near: settleNear, busy: busy == "settle", tr: tr,
                                                   onMatch: { txId in confirmMatch(payoutId: settlePayoutId, transactionId: txId) },
                                                   onClose: { settlePayoutId = ""; settleCandidates = []; settleNear = [] })
                }
            }
        }

        if isOwner {
            SettingsCard(title: tr("Disconnect PayPal"), iconName: "xmark.circle") {
                VStack(alignment: .leading, spacing: 10) {
                    if confirmDisconnect {
                        Text(tr("Disconnect PayPal? The stored credentials are removed and new rows stop arriving. Rows already imported stay in Banking."))
                            .font(.system(size: 12)).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
                        HStack(spacing: 10) {
                            Button(tr("Disconnect")) { disconnect(live) }.buttonStyle(.borderedProminent).tint(.red).disabled(busy == "disconnect")
                            Button(tr("Keep connected")) { confirmDisconnect = false }.buttonStyle(.bordered)
                        }
                    } else {
                        Button(tr("Disconnect PayPal")) { confirmDisconnect = true }.buttonStyle(.bordered)
                    }
                }
            }
        }
    }

    // MARK: - Calls (owner-checked server-side; the companyId travels with every call)

    private func call(_ name: String, _ data: [String: Any], done: @escaping ([String: Any]?, Error?) -> Void) {
        var payload = data
        payload["companyId"] = companyId
        Functions.functions(region: "europe-west2").httpsCallable(name).call(payload) { result, error in
            DispatchQueue.main.async { done(result?.data as? [String: Any], error) }
        }
    }

    private func connect() {
        let id = clientId.trimmingCharacters(in: .whitespacesAndNewlines)
        let secret = clientSecret.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty, !secret.isEmpty else { return }
        busy = "connect"; errorText = ""; notice = ""
        call("paypalConnect", ["clientId": id, "clientSecret": secret, "environment": environment]) { data, error in
            busy = ""
            if let error = error { errorText = error.localizedDescription; return }
            clientSecret = ""; showForm = false
            let reconnected = data?["reconnected"] as? Bool ?? false
            let imported = data?["imported"] as? Int ?? 0
            notice = reconnected ? tr("PayPal credentials refreshed.") : "\(tr("PayPal connected.")) \(tr("Imported")): \(imported)"
        }
    }

    private func syncNow() {
        busy = "sync"; errorText = ""; notice = ""
        call("bankSyncTransactions", ["force": true]) { data, error in
            busy = ""
            if let error = error { errorText = error.localizedDescription; return }
            notice = "\(tr("Sync finished.")) \(tr("Imported")): \(data?["imported"] as? Int ?? 0)"
        }
    }

    private func disconnect(_ live: StudioBankConnection) {
        busy = "disconnect"; errorText = ""
        call("bankDeleteConnection", ["requisitionId": live.id, "mode": "disconnect"]) { _, error in
            busy = ""
            if let error = error { errorText = error.localizedDescription; return }
            confirmDisconnect = false; notice = tr("PayPal disconnected."); payoutRows = []; payoutsText = ""
        }
    }

    private func loadPayouts() {
        busy = "payouts"; errorText = ""
        call("bankListPayouts", ["provider": "paypal", "limit": 50]) { data, error in
            busy = ""
            if let error = error { errorText = error.localizedDescription; return }
            let rows = data?["payouts"] as? [[String: Any]] ?? []
            payoutRows = rows
            payoutsText = rows.isEmpty ? tr("No withdrawals yet.") : ""
        }
    }

    private func findBankRow(payoutId: String) {
        guard !payoutId.isEmpty else { return }
        busy = "settle"; errorText = ""
        call("matchPayoutToBank", ["provider": "paypal", "payoutId": payoutId, "mode": "suggest"]) { data, error in
            busy = ""
            if let error = error { errorText = error.localizedDescription; return }
            let payout = data?["payout"] as? [String: Any] ?? [:]
            var header = "\(tr("Bank row")) · \(payout["amount"] as? String ?? "—") \(payout["currency"] as? String ?? "")"
            if let arrival = payout["arrivalDate"] as? String, !arrival.isEmpty { header += " · \(tr("Arrival")) \(arrival)" }
            settleHeader = header
            settleCandidates = data?["candidates"] as? [[String: Any]] ?? []
            settleNear = data?["near"] as? [[String: Any]] ?? []
            settlePayoutId = payoutId
        }
    }

    private func confirmMatch(payoutId: String, transactionId: String) {
        busy = "settle"; errorText = ""
        call("matchPayoutToBank", ["provider": "paypal", "payoutId": payoutId, "mode": "confirm", "transactionId": transactionId]) { _, error in
            busy = ""
            if let error = error { errorText = error.localizedDescription; return }
            notice = tr("Payout matched to the bank row."); settlePayoutId = ""; settleCandidates = []; settleNear = []
            loadPayouts()
        }
    }

    private func unlinkPayout(payoutId: String) {
        busy = "settle"; errorText = ""
        call("matchPayoutToBank", ["provider": "paypal", "payoutId": payoutId, "mode": "unlink"]) { _, error in
            busy = ""
            if let error = error { errorText = error.localizedDescription; return }
            notice = tr("Payout unlinked."); settlePayoutId = ""; settleCandidates = []; settleNear = []
            loadPayouts()
        }
    }
}

/// The credentials form, its own struct (the real-iPhone rule for nested builders).
struct PayPalConnectFormView: View {
    let language: String
    let isOwner: Bool
    let busy: Bool
    @Binding var environment: String
    @Binding var clientId: String
    @Binding var clientSecret: String
    let hasConnection: Bool
    let onConnect: () -> Void
    let onCancel: (() -> Void)?
    private func tr(_ text: String) -> String { t(text, lang: language) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(tr("In the PayPal Developer dashboard create an app under Live (or Sandbox to try), enable Transaction Search on it, then paste its Client ID and Secret here. NivaDesk stores the secret encrypted and only ever reads."))
                .font(.system(size: 12)).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
            Picker(tr("Live"), selection: $environment) {
                Text(tr("Live")).tag("live")
                Text(tr("Sandbox")).tag("sandbox")
            }
            .pickerStyle(.segmented).frame(maxWidth: 260).disabled(!isOwner || busy)
            TextField(tr("Client ID"), text: $clientId).textFieldStyle(.roundedBorder).disabled(!isOwner || busy)
            SecureField(tr("Secret"), text: $clientSecret).textFieldStyle(.roundedBorder).disabled(!isOwner || busy)
            HStack(spacing: 10) {
                Button {
                    onConnect()
                } label: {
                    if busy { HStack(spacing: 6) { ProgressView().controlSize(.small); Text(tr("Checking with PayPal…")) } }
                    else { Text(hasConnection ? tr("Save new credentials") : tr("Connect PayPal")) }
                }
                .buttonStyle(.borderedProminent)
                .disabled(!isOwner || busy || clientId.trimmingCharacters(in: .whitespaces).isEmpty || clientSecret.isEmpty)
                if let onCancel { Button(tr("Cancel")) { onCancel() }.buttonStyle(.bordered) }
            }
            Text(tr("The first sync takes the last six months; after that PayPal is read with every bank refresh, and withdrawals to your bank are matched to the statement so nothing is counted twice."))
                .font(.system(size: 11)).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
        }
    }
}
