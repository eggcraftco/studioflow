import SwiftUI
import FirebaseFunctions

// Settings → Customer SMS, on Mac and iPhone. The screen itself lives in
// CustomerSmsSettingsView.swift; this file is the contract with the server and
// the sentences that describe a status.
//
// Two callables, both workspace-scoped:
//
//   getWorkspaceSmsSettings   — any member of the workspace may read.
//   saveWorkspaceSmsSettings  — owner only, and only on a plan that includes
//                               SMS. Anyone else is refused server-side.
//
// Three things about the deployed contract shape this file, and none of them
// are guessable from the field names:
//
//   * `senderId` is the EFFECTIVE sender — the workspace's own name once the
//     networks have approved it, otherwise the platform name. It is not the
//     name the workspace typed. While a workspace's own sender is still
//     `pending` the server answers with "NivaDesk", so this screen genuinely
//     cannot read back a registration in progress. It says so rather than
//     showing an empty box as if nothing were registered.
//   * `senderStatus` is about the workspace's OWN sender; `platformSenderStatus`
//     is about NivaDesk's. They are separate registrations with the networks.
//   * `sendingLive` is the only field that answers "will a text actually go
//     out". Credentials being configured is not the same thing, which is
//     exactly the mistake the server-side send gate already made once.

/// The four moments a workspace can text a customer about.
///
/// The three milestones are on by default; telling a customer about every
/// internal step is a choice a business makes, not one made for them. Same
/// defaults as cleanSmsTriggers() in functions/index.js — if these two ever
/// disagree, the screen shows a switch that is off while the server texts.
struct WorkspaceSmsTriggers: Equatable {
    var estimateReady = true
    var workStarted = true
    var readyForCollection = true
    var everyStatusChange = false

    init() {}

    init(_ raw: [String: Any]) {
        estimateReady = raw["estimateReady"] as? Bool ?? true
        workStarted = raw["workStarted"] as? Bool ?? true
        readyForCollection = raw["readyForCollection"] as? Bool ?? true
        everyStatusChange = raw["everyStatusChange"] as? Bool ?? false
    }

    var payload: [String: Any] {
        [
            "estimateReady": estimateReady,
            "workStarted": workStarted,
            "readyForCollection": readyForCollection,
            "everyStatusChange": everyStatusChange
        ]
    }
}

/// What this workspace has spent on texts in the current billing month.
/// Every workspace starts here at zero and stays there until the platform
/// sender ID is approved, so zero is the normal case, not an error.
struct WorkspaceSmsUsage: Equatable {
    var month = ""          // "YYYY-MM"
    var messages = 0
    var segments = 0
    var spendUsd: Double = 0

    init() {}

    init(_ raw: [String: Any]) {
        month = String(describing: raw["month"] ?? "")
        messages = (raw["messages"] as? NSNumber)?.intValue ?? 0
        segments = (raw["segments"] as? NSNumber)?.intValue ?? 0
        spendUsd = (raw["spendUsd"] as? NSNumber)?.doubleValue ?? 0
    }

    var isEmpty: Bool { messages == 0 && segments == 0 && spendUsd == 0 }
}

struct WorkspaceSmsSettingsInfo: Equatable {
    /// The sender a customer will actually see. Own name if the networks have
    /// approved it, otherwise the platform name.
    var senderId = ""
    /// The WORKSPACE's own sender: unset | pending | verified.
    var senderStatus = "unset"
    var defaultCallingCode = "44"
    var triggers = WorkspaceSmsTriggers()
    /// The plan includes SMS (Pro and Team).
    var available = false
    /// The text provider's credentials are set on the server.
    var providerConfigured = false
    var platformSenderId = "NivaDesk"
    /// NivaDesk's own registration with the networks: pending | verified.
    var platformSenderStatus = "pending"
    /// The whole question: can a message leave the building right now.
    var sendingLive = false
    var usage = WorkspaceSmsUsage()

    init() {}

    init(_ raw: [String: Any]) {
        senderId = String(describing: raw["senderId"] ?? "")
        senderStatus = String(describing: raw["senderStatus"] ?? "unset")
        defaultCallingCode = String(describing: raw["defaultCallingCode"] ?? "44")
        triggers = WorkspaceSmsTriggers(raw["triggers"] as? [String: Any] ?? [:])
        available = raw["available"] as? Bool ?? false
        providerConfigured = raw["providerConfigured"] as? Bool ?? false
        platformSenderId = String(describing: raw["platformSenderId"] ?? "NivaDesk")
        platformSenderStatus = String(describing: raw["platformSenderStatus"] ?? "pending")
        sendingLive = raw["sendingLive"] as? Bool ?? false
        usage = WorkspaceSmsUsage(raw["usage"] as? [String: Any] ?? [:])
    }
}

/// What the server confirmed after a save. `senderId` here IS the workspace's
/// own name — the save answers with what it stored, not with the effective
/// sender — which is the one moment this screen learns a pending name.
struct WorkspaceSmsSaveOutcome {
    let senderId: String
    let senderStatus: String
    let triggers: WorkspaceSmsTriggers
}

struct WorkspaceSmsError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

// MARK: - Calls

extension FirebaseManager {

    /// Both SMS callables are workspace-scoped and role-checked server-side, so
    /// companyId travels with every call. Sending it explicitly also stops the
    /// server falling back to users/{uid}.activeCompanyId, which is not
    /// necessarily the workspace this screen is showing.
    @discardableResult
    func workspaceSmsCall(_ name: String, _ data: [String: Any] = [:]) async throws -> [String: Any] {
        let companyId = currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !companyId.isEmpty else { throw WorkspaceSmsError(message: "No workspace selected.") }
        var payload = data
        payload["companyId"] = companyId
        do {
            let result = try await Functions.functions(region: "europe-west2").httpsCallable(name).call(payload)
            return result.data as? [String: Any] ?? [:]
        } catch {
            throw WorkspaceSmsError(message: error.localizedDescription)
        }
    }

    func workspaceSmsSettings(companyId: String = "") async throws -> WorkspaceSmsSettingsInfo {
        let chosen = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        var payload: [String: Any] = [:]
        if !chosen.isEmpty { payload["companyId"] = chosen }
        return WorkspaceSmsSettingsInfo(try await workspaceSmsCall("getWorkspaceSmsSettings", payload))
    }

    /// Owner only. A workspace can never mark its own sender verified — the
    /// networks do that — so a changed name always comes back as `pending`.
    func saveWorkspaceSmsSettings(
        senderId: String,
        triggers: WorkspaceSmsTriggers,
        defaultCallingCode: String,
        companyId: String = ""
    ) async throws -> WorkspaceSmsSaveOutcome {
        var payload: [String: Any] = [
            "senderId": senderId,
            "triggers": triggers.payload,
            "defaultCallingCode": defaultCallingCode
        ]
        let chosen = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        if !chosen.isEmpty { payload["companyId"] = chosen }
        let data = try await workspaceSmsCall("saveWorkspaceSmsSettings", payload)
        return WorkspaceSmsSaveOutcome(
            senderId: String(describing: data["senderId"] ?? ""),
            senderStatus: String(describing: data["senderStatus"] ?? "unset"),
            triggers: WorkspaceSmsTriggers(data["triggers"] as? [String: Any] ?? [:])
        )
    }
}

// MARK: - Sentences

/// A sender-ID registration state in words. "Verified" is the networks' word,
/// not ours, and the screen must never imply NivaDesk granted it.
func workspaceSmsSenderStatusText(_ status: String, lang: String) -> String {
    switch status {
    case "verified": return t("Approved", lang: lang)
    case "pending":  return t("Waiting for approval", lang: lang)
    default:         return t("Not set", lang: lang)
    }
}

/// An alphanumeric sender ID is 11 characters, letters, digits and spaces only —
/// the carrier silently rejects anything else, and the server trims it to that
/// shape on the way in. Doing it here too means the box shows what will be
/// saved instead of something that quietly becomes a different name.
func cleanWorkspaceSmsSenderId(_ value: String) -> String {
    let allowed = value.filter { ($0.isASCII && ($0.isLetter || $0.isNumber)) || $0 == " " }
    return String(allowed.prefix(11))
}

/// Digits only, at most four — the server applies exactly this before storing.
func cleanWorkspaceSmsCallingCode(_ value: String) -> String {
    String(value.filter { $0.isNumber && $0.isASCII }.prefix(4))
}
