import SwiftUI
import FirebaseFunctions

// Settings → Integrations → eBay, on Mac and iPhone. Models, callables and
// sentences; the screen itself is EbayIntegrationView.swift.
//
// A mirror of studioflow-web/lib/studioflow/ebay.ts — same callables, same
// codes, same sentences. Three rules decide the shape of this file and none of
// them is obvious from the web version:
//
//   * Card state comes from the rows getEbayConnections returns (`status`,
//     `specStatus`), never from a local "I pressed Connect" flag, and the
//     client never re-derives specStatus from an error code. The status table
//     lives once, on the server (functions/commerce/ebay/status.js); the three
//     clients copy its words.
//   * A native app cannot set the browser cookie that binds an OAuth callback
//     to the browser that started it, so it never opens eBay's authorize URL
//     itself. beginEbayConnect(origin: "native") returns a state only; the app
//     opens nivadesk.app/ebay/start, which signs the owner in, claims the
//     state once and sets the cookie there. See docs §5.2.
//   * Nothing here ever sees a token, a credential box, a buyer hash or a
//     nonce hash. The public view a connection comes back as carries none of
//     them, so a screenshot of this screen is not a credential.

// MARK: - Models

struct EbaySyncEventInfo: Identifiable {
    let id = UUID()
    let atMs: Double
    let type: String
    let error: String
    let orderId: String
    let reason: String
}

struct EbayMarketplaceInfo: Identifiable {
    var id: String { marketplace }
    let marketplace: String
    let enabled: Bool
    let currency: String
}

struct EbayConnectionSettingsInfo {
    var autoSync = true
    var includeUnpaid = false
    var includeCancelled = true
}

struct EbayConnectionInfo: Identifiable {
    let id: String
    let environment: String
    let sellerUsername: String
    let sellerUserId: String
    let displayName: String
    let marketplaces: [EbayMarketplaceInfo]
    /// What the server stores. `disconnected` is not a connection.
    let status: String
    /// The spec's word for the same row — the only thing the card may branch on.
    let specStatus: String
    let settings: EbayConnectionSettingsInfo
    let importState: String
    let importCreated: Int
    let importUpdated: Int
    let importHeld: Int
    let importFailed: Int
    /// nil until an import has run. `complete == false` means "press Import again".
    let importComplete: Bool?
    let importFailedCount: Int
    let lastSyncAtMs: Double
    let lastSuccessAtMs: Double
    let lastFullReconciliationAtMs: Double
    let lastErrorCode: String
    /// When the 18-month refresh authorisation should be renewed by. 0 = unknown.
    let reauthorizeByMs: Double
    let needsReconnect: Bool
    let paused: Bool
    let quotaToday: Int
    let quotaShare: Int
    let recentEvents: [EbaySyncEventInfo]

    var title: String {
        if !displayName.isEmpty { return displayName }
        if !sellerUsername.isEmpty { return sellerUsername }
        return sellerUserId
    }
    var isSandbox: Bool { environment == "sandbox" }
    var importDone: Bool { importState == "done" }
    /// The server's word, never re-read from the error code.
    var needsAttention: Bool {
        specStatus == "reauthorization_required" || specStatus == "degraded" || specStatus == "suspended"
    }

    init(_ raw: [String: Any]) {
        id = ebayString(raw["id"])
        environment = ebayString(raw["environment"], fallback: "sandbox")
        sellerUsername = ebayString(raw["sellerUsername"])
        sellerUserId = ebayString(raw["sellerUserId"])
        displayName = ebayString(raw["displayName"])
        marketplaces = (raw["marketplaces"] as? [[String: Any]] ?? []).map {
            EbayMarketplaceInfo(
                marketplace: ebayString($0["marketplace"]),
                enabled: $0["enabled"] as? Bool ?? false,
                currency: ebayString($0["currency"])
            )
        }
        status = ebayString(raw["status"], fallback: "connecting")
        specStatus = ebayString(raw["specStatus"], fallback: "connected_read_only")
        let settingsRaw = raw["settings"] as? [String: Any] ?? [:]
        settings = EbayConnectionSettingsInfo(
            autoSync: settingsRaw["autoSync"] as? Bool ?? true,
            includeUnpaid: settingsRaw["includeUnpaid"] as? Bool ?? false,
            includeCancelled: settingsRaw["includeCancelled"] as? Bool ?? true
        )
        importState = ebayString(raw["importState"], fallback: "none")
        let counters = raw["importCounters"] as? [String: Any] ?? [:]
        importCreated = ebayInt(counters["created"])
        importUpdated = ebayInt(counters["updated"])
        importHeld = ebayInt(counters["held"])
        importFailed = ebayInt(counters["failed"])
        // The cursor is absent until an import has run, and absent is not the
        // same as finished: a missing cursor must never draw "Import paused".
        if let cursor = raw["importCursor"] as? [String: Any] {
            importComplete = cursor["complete"] as? Bool ?? false
            importFailedCount = ebayInt(cursor["failedCount"])
        } else {
            importComplete = nil
            importFailedCount = 0
        }
        lastSyncAtMs = ebayDouble(raw["lastSyncAtMs"])
        lastSuccessAtMs = ebayDouble(raw["lastSuccessAtMs"])
        lastFullReconciliationAtMs = ebayDouble(raw["lastFullReconciliationAtMs"])
        lastErrorCode = ebayString(raw["lastErrorCode"])
        reauthorizeByMs = ebayDouble(raw["reauthorizeByMs"])
        needsReconnect = raw["needsReconnect"] as? Bool ?? false
        paused = raw["paused"] as? Bool ?? false
        let quota = raw["quota"] as? [String: Any] ?? [:]
        quotaToday = ebayInt(quota["today"])
        quotaShare = ebayInt(quota["share"])
        recentEvents = (raw["recentEvents"] as? [[String: Any]] ?? []).prefix(9).map {
            EbaySyncEventInfo(
                atMs: ebayDouble($0["atMs"]),
                type: ebayString($0["type"]),
                error: ebayString($0["error"]),
                orderId: ebayString($0["orderId"]),
                reason: ebayString($0["reason"])
            )
        }
    }
}

struct EbayImportPreviewInfo {
    let sinceDays: Int
    let ordersFound: Int
    let duplicatesPrevented: Int
    let unpaid: Int
    let cancelled: Int
    let marketplaces: [String]
    /// The budget ran out before the window did: the count is a floor, not a total.
    let truncated: Bool

    init(_ raw: [String: Any]) {
        sinceDays = ebayInt(raw["sinceDays"])
        ordersFound = ebayInt(raw["ordersFound"])
        duplicatesPrevented = ebayInt(raw["duplicatesPrevented"])
        unpaid = ebayInt(raw["unpaid"])
        cancelled = ebayInt(raw["cancelled"])
        marketplaces = (raw["marketplaces"] as? [String] ?? []).map { $0 }
        truncated = raw["truncated"] as? Bool ?? false
    }
}

struct EbayOutcomeInfo {
    let created: Int
    let updated: Int
    let held: Int
    let skipped: Int
    let failed: Int

    init(_ raw: [String: Any]?) {
        let outcome = raw ?? [:]
        created = ebayInt(outcome["created"])
        updated = ebayInt(outcome["updated"])
        held = ebayInt(outcome["held"])
        skipped = ebayInt(outcome["skipped"])
        failed = ebayInt(outcome["failed"])
    }
}

struct EbayImportResultInfo {
    let outcome: EbayOutcomeInfo
    /// false means the run stopped on its budget. Nothing is lost; press Import again.
    let complete: Bool

    init(_ raw: [String: Any]) {
        outcome = EbayOutcomeInfo(raw["outcome"] as? [String: Any])
        complete = raw["complete"] as? Bool ?? false
    }
}

struct EbayError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

// A callable answer is NSNumber-boxed JSON, so an Int can arrive where a Double
// is expected and back again. Reading each field through one helper stops a
// count silently becoming 0 because the box held the other kind of number.
private func ebayString(_ value: Any?, fallback: String = "") -> String {
    guard let value = value else { return fallback }
    if let text = value as? String { return text.isEmpty ? fallback : text }
    if value is NSNull { return fallback }
    return String(describing: value)
}

private func ebayDouble(_ value: Any?) -> Double {
    if let number = value as? NSNumber { return number.doubleValue }
    if let double = value as? Double { return double }
    if let int = value as? Int { return Double(int) }
    if let text = value as? String { return Double(text) ?? 0 }
    return 0
}

private func ebayInt(_ value: Any?) -> Int {
    if let number = value as? NSNumber { return number.intValue }
    if let int = value as? Int { return int }
    if let double = value as? Double { return Int(double) }
    if let text = value as? String { return Int(text) ?? 0 }
    return 0
}

// MARK: - Calls

extension FirebaseManager {

    /// Every eBay callable is workspace-scoped and role-checked on the server,
    /// so they all travel through the shared `etsyCall` helper, which injects
    /// companyId and talks to europe-west2. Sending companyId explicitly also
    /// stops the server falling back to users/{uid}.activeCompanyId, which is
    /// not necessarily the workspace this screen is showing.
    func ebayConnections() async throws -> (connections: [EbayConnectionInfo], configured: Bool, environment: String) {
        let data = try await etsyCall("getEbayConnections")
        let rows = (data["connections"] as? [[String: Any]] ?? []).map(EbayConnectionInfo.init)
        // configured:false is "this server has no eBay application wired up",
        // which is a card, not an error. Default true so a server that answers
        // without the field is not reported as switched off.
        return (rows, (data["configured"] as? Bool) ?? true, (data["environment"] as? String) ?? "sandbox")
    }

    /// Owner only, server-side. Returns the page to open in the browser — never
    /// eBay's own authorize URL, which only the browser holding the nonce
    /// cookie may reach (docs §5.2).
    func ebayBeginConnect() async throws -> String {
        let data = try await etsyCall("beginEbayConnect", ["origin": "native"])
        let startUrl = (data["startUrl"] as? String) ?? ""
        if !startUrl.isEmpty { return startUrl }
        let state = (data["state"] as? String) ?? ""
        guard !state.isEmpty else { return "" }
        let escaped = state.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? state
        return "https://nivadesk.app/ebay/start?state=\(escaped)"
    }

    /// Asks eBay, right now, whether this connection still works. Never throws
    /// for a provider failure: an unhealthy connection is an answer.
    func ebayVerify(_ connectionId: String) async throws -> (healthy: Bool, reason: String) {
        let data = try await etsyCall("verifyEbayConnection", ["connectionId": connectionId])
        return ((data["healthy"] as? Bool) ?? false, (data["reason"] as? String) ?? "")
    }

    func ebayUpdateSettings(_ connectionId: String, settings: [String: Any]) async throws {
        _ = try await etsyCall("updateEbayConnectionSettings", ["connectionId": connectionId, "settings": settings])
    }

    func ebaySetMarketplace(_ connectionId: String, marketplace: String, enabled: Bool) async throws {
        _ = try await etsyCall(
            "updateEbayConnectionSettings",
            ["connectionId": connectionId, "marketplaces": [["marketplace": marketplace, "enabled": enabled]]]
        )
    }

    /// A dry run. Writes no orders — it counts what eBay holds for the period
    /// and how much of it is already here.
    func ebayPreviewImport(_ connectionId: String, sinceDays: Int) async throws -> EbayImportPreviewInfo {
        let data = try await etsyCall(
            "previewEbayImport",
            ["connectionId": connectionId, "sinceDays": sinceDays],
            timeout: 300
        )
        return EbayImportPreviewInfo(data)
    }

    /// Resumable: `complete == false` means press Import again, and nothing
    /// between the two runs is lost.
    func ebayRunImport(_ connectionId: String, sinceDays: Int, includeUnpaid: Bool, includeCancelled: Bool) async throws -> EbayImportResultInfo {
        let data = try await etsyCall(
            "runEbayImport",
            ["connectionId": connectionId, "sinceDays": sinceDays, "includeUnpaid": includeUnpaid, "includeCancelled": includeCancelled],
            timeout: 540
        )
        return EbayImportResultInfo(data)
    }

    func ebayRetryImportFailures(_ connectionId: String) async throws -> (remaining: Int, recovered: Int) {
        let data = try await etsyCall("retryEbayImportFailures", ["connectionId": connectionId], timeout: 300)
        return (ebayInt(data["remaining"]), ebayInt(data["recovered"]))
    }

    func ebaySyncNow(_ connectionId: String) async throws -> EbayOutcomeInfo {
        let data = try await etsyCall("syncEbayNow", ["connectionId": connectionId], timeout: 300)
        return EbayOutcomeInfo(data["outcome"] as? [String: Any])
    }

    /// eBay has no revoke endpoint: this destroys our copy of the tokens.
    /// Orders already imported stay in the workspace.
    func ebayDisconnect(_ connectionId: String) async throws {
        _ = try await etsyCall("disconnectEbay", ["connectionId": connectionId])
    }
}

// MARK: - Sentences

/// Codes into words. This is the ONLY place an eBay code becomes a sentence — a
/// technical code must never reach the screen — and every English string below
/// has an entry in the other eleven languages (DilMotoru.swift). Word for word
/// the same as lib/studioflow/ebay.ts.
func ebayErrorText(_ code: String, lang: String) -> String {
    switch code.trimmingCharacters(in: .whitespacesAndNewlines) {
    case "credentials_rejected", "token_unreadable":
        return t("eBay no longer accepts this connection. Reconnect to continue syncing.", lang: lang)
    case "app_credentials_invalid", "token_request_invalid":
        return t("eBay sync is temporarily unavailable. NivaDesk has been notified.", lang: lang)
    case "permission_missing":
        return t("eBay refused a permission. Reconnect and approve every permission.", lang: lang)
    case "rate_limited":
        return t("eBay is rate-limiting this account. Sync resumes automatically.", lang: lang)
    case "partial_pass":
        return t("Some eBay orders could not be imported. See Sync health.", lang: lang)
    case "provider_unavailable":
        return t("eBay could not be reached. Sync retries automatically.", lang: lang)
    case "environment_mismatch":
        return t("This eBay connection belongs to the sandbox. Disconnect it and connect your live account.", lang: lang)
    case "refresh_token_expiring":
        return t("Reconnect eBay to keep syncing.", lang: lang)
    case "disconnected":
        return t("eBay account disconnected.", lang: lang)
    // "", "truncated" and "paused_by_owner" are benign: they are not faults and
    // must not put a red line on a healthy connection.
    default:
        return ""
    }
}

/// Why a connection is not where it should be, whatever the code behind it.
func ebaySpecStatusText(_ specStatus: String, _ lastErrorCode: String, lang: String) -> String {
    if specStatus == "reauthorization_required" {
        let sentence = ebayErrorText(lastErrorCode, lang: lang)
        return sentence.isEmpty ? t("eBay no longer accepts this connection. Reconnect to continue syncing.", lang: lang) : sentence
    }
    if specStatus == "suspended" {
        return lastErrorCode == "environment_mismatch"
            ? t("This eBay connection belongs to the sandbox. Disconnect it and connect your live account.", lang: lang)
            : t("eBay sync is paused on this server.", lang: lang)
    }
    // Degraded with a benign code is the six-hour staleness rule, not an error.
    if specStatus == "degraded" {
        let sentence = ebayErrorText(lastErrorCode, lang: lang)
        return sentence.isEmpty ? t("eBay has not synced for a while. See Sync health.", lang: lang) : sentence
    }
    return ""
}

/// The pill on the header card. Returns the English key; the caller translates it.
func ebayStatusLabel(_ specStatus: String) -> String {
    switch specStatus {
    case "reauthorization_required": return "Reconnect required"
    case "suspended": return "Paused"
    case "degraded": return "Needs attention"
    case "connected_read_only": return "Healthy"
    default: return "Connected"
    }
}

/// The `reason` a callback or a live check comes back with.
func ebayReasonText(_ reason: String, lang: String) -> String {
    switch reason.trimmingCharacters(in: .whitespacesAndNewlines) {
    case "state":
        return t("The eBay sign-in link has expired or was already used. Start again.", lang: lang)
    case "browser":
        return t("Finish connecting eBay in the same browser you started from.", lang: lang)
    case "environment":
        return t("This eBay account belongs to a different environment.", lang: lang)
    case "no_seller":
        return t("eBay did not tell us which seller account this is. Reconnect and approve every permission.", lang: lang)
    case "disabled":
        return t("eBay is not set up on this server yet. Contact support and we will enable it.", lang: lang)
    default:
        let sentence = ebayErrorText(reason, lang: lang)
        return sentence.isEmpty ? t("eBay did not complete the connection. Try again.", lang: lang) : sentence
    }
}

/// One line of Recent activity, in words. The server writes event types —
/// `sync_partial`, `token_refresh_failed` — and a technical code must never
/// reach the screen. Showing the type with its underscores swapped for spaces
/// is still the code; it only looks friendlier.
func ebayEventText(_ type: String, lang: String) -> String {
    switch type.trimmingCharacters(in: .whitespacesAndNewlines) {
    case "connected":                 return t("Connected", lang: lang)
    case "reconnected":               return t("Reconnected", lang: lang)
    case "disconnected":              return t("Disconnected", lang: lang)
    case "sync_completed":            return t("Sync finished", lang: lang)
    case "sync_partial":              return t("Sync finished with something outstanding", lang: lang)
    case "sync_bisected":             return t("A busy window was split and read in parts", lang: lang)
    case "catch_up_completed":        return t("Caught up on what changed while disconnected", lang: lang)
    case "nightly_completed":         return t("Nightly check finished", lang: lang)
    case "import_started":            return t("Import started", lang: lang)
    case "import_resumed":            return t("Import resumed", lang: lang)
    case "import_finished":           return t("Import finished", lang: lang)
    case "import_preview":            return t("Import preview", lang: lang)
    case "order_imported":            return t("Order imported", lang: lang)
    case "order_import_failed":       return t("An order could not be imported", lang: lang)
    case "order_needs_review":        return t("An order needs a look", lang: lang)
    case "rate_limited":              return t("eBay is rate-limiting this account", lang: lang)
    case "reauthorization_required":  return t("eBay asked for the connection to be renewed", lang: lang)
    case "refresh_token_expiring":    return t("The eBay authorisation is close to expiring", lang: lang)
    case "token_refresh_failed":      return t("Renewing the eBay connection failed", lang: lang)
    case "app_credentials_invalid":   return t("eBay refused NivaDesk's application credentials", lang: lang)
    case "environment_mismatch":      return t("This connection belongs to another eBay environment", lang: lang)
    case "verify_failed":             return t("The connection check failed", lang: lang)
    case "buyer_deleted":             return t("A buyer's details were erased at eBay's request", lang: lang)
    default:                          return t("Activity", lang: lang)
    }
}

/// "5 minutes ago" in the seller's language, from a millisecond timestamp.
func ebayRelativeTime(_ atMs: Double, lang: String) -> String {
    guard atMs > 0 else { return t("Never", lang: lang) }
    let seconds = max(0, Date().timeIntervalSince1970 - atMs / 1000)
    let minutes = Int(seconds / 60)
    if minutes < 1 { return t("Just now", lang: lang) }
    if minutes < 60 {
        return "\(minutes) " + (minutes == 1 ? t("minute ago", lang: lang) : t("minutes ago", lang: lang))
    }
    let hours = minutes / 60
    if hours < 24 {
        return "\(hours) " + (hours == 1 ? t("hour ago", lang: lang) : t("hours ago", lang: lang))
    }
    let days = hours / 24
    return "\(days) " + (days == 1 ? t("day ago", lang: lang) : t("days ago", lang: lang))
}
