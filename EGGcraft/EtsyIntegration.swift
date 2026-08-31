import SwiftUI
import FirebaseFunctions

// Settings → Integrations → Etsy, on Mac and iPhone.
//
// A mirror of studioflow-web/app/settings/EtsyIntegrationSection.tsx: same
// callables, same order of screens, same sentences. Two things about Etsy
// decide the shape of this file, and neither is obvious from the web version:
//
//   * The OAuth callback ends at https://nivadesk.app/settings. It reads only
//     the query string — no cookie, no session, nothing tied to the browser
//     that started it. So a native app can open any browser, let the seller
//     approve there, and afterwards simply ask the server again. There is no
//     deep link back into this app and none is needed.
//   * Every etsy* collection is denied to clients in firestore.rules, on
//     purpose: those rows hold OAuth tokens for somebody else's shop. So there
//     is no snapshot listener here. Polling a callable is the only way to see
//     status, and that is the correct answer rather than a limitation.
//
// "Healthy" is never read from a stored field. It is a claim about this moment,
// so it is earned by asking Etsy through verifyEtsyConnection — the same rule
// the bank connectors learned the hard way.

// MARK: - Models

struct EtsySyncEventInfo: Identifiable {
    let id = UUID()
    let atMs: Double
    let type: String
    let error: String
    let receiptId: String
}

struct EtsyConnectionInfo: Identifiable {
    let id: String
    let shopId: String
    let shopName: String
    let shopCurrency: String
    let status: String
    let connectedAtMs: Double
    let lastSyncAtMs: Double
    let lastSuccessAtMs: Double
    let lastErrorCode: String
    let needsReconnect: Bool
    let importedOrders: Int
    let recentEvents: [EtsySyncEventInfo]

    /// The stored status only changes when a sync happens to run and fail, so
    /// this is "we know something is wrong", never "everything is fine".
    var needsAttention: Bool { needsReconnect || status == "needs_reconnect" }

    init(_ raw: [String: Any]) {
        id = String(describing: raw["id"] ?? "")
        shopId = String(describing: raw["shopId"] ?? "")
        shopName = String(describing: raw["shopName"] ?? "")
        shopCurrency = String(describing: raw["shopCurrency"] ?? "")
        status = String(describing: raw["status"] ?? "")
        connectedAtMs = raw["connectedAtMs"] as? Double ?? 0
        lastSyncAtMs = raw["lastSyncAtMs"] as? Double ?? 0
        lastSuccessAtMs = raw["lastSuccessAtMs"] as? Double ?? 0
        lastErrorCode = String(describing: raw["lastErrorCode"] ?? "")
        needsReconnect = raw["needsReconnect"] as? Bool ?? false
        importedOrders = raw["importedOrders"] as? Int ?? 0
        recentEvents = (raw["recentEvents"] as? [[String: Any]] ?? []).map {
            EtsySyncEventInfo(
                atMs: $0["atMs"] as? Double ?? 0,
                type: String(describing: $0["type"] ?? ""),
                error: String(describing: $0["error"] ?? ""),
                receiptId: String(describing: $0["receiptId"] ?? "")
            )
        }
    }
}

struct EtsyCustomerCandidateInfo: Identifiable {
    var id: String { customerId }
    let customerId: String
    let name: String
    let score: Double
    let signals: [String]
}

struct EtsyPreviewRowInfo: Identifiable {
    var id: String { receiptId }
    let receiptId: String
    let buyerId: String
    let alreadyImported: Bool
    let outcome: String          // ready | review | unsupported
    let reason: String
    let createdAtMs: Double
    let customerName: String
    let currency: String
    let total: Double
    let itemTitles: [String]
    let personalisation: [String]
    let decision: String         // link | create | review
    let candidates: [EtsyCustomerCandidateInfo]

    init(_ raw: [String: Any]) {
        receiptId = String(describing: raw["receiptId"] ?? "")
        buyerId = String(describing: raw["buyerId"] ?? "")
        alreadyImported = raw["alreadyImported"] as? Bool ?? false
        outcome = String(describing: raw["outcome"] ?? "")
        reason = String(describing: raw["reason"] ?? "")
        createdAtMs = raw["createdAtMs"] as? Double ?? 0
        customerName = String(describing: raw["customerName"] ?? "")
        currency = String(describing: raw["currency"] ?? "")
        total = raw["total"] as? Double ?? 0
        itemTitles = raw["itemTitles"] as? [String] ?? []
        personalisation = raw["personalization"] as? [String] ?? []
        let customer = raw["customer"] as? [String: Any] ?? [:]
        decision = String(describing: customer["decision"] ?? "")
        candidates = (customer["candidates"] as? [[String: Any]] ?? []).map {
            EtsyCustomerCandidateInfo(
                customerId: String(describing: $0["customerId"] ?? ""),
                name: String(describing: $0["name"] ?? ""),
                score: $0["score"] as? Double ?? 0,
                signals: $0["signals"] as? [String] ?? []
            )
        }
    }
}

struct EtsyPreviewInfo {
    let shopName: String
    let truncated: Bool
    let found: Int
    let ready: Int
    let review: Int
    let unsupported: Int
    let alreadyImported: Int
    let rows: [EtsyPreviewRowInfo]

    init(_ raw: [String: Any]) {
        shopName = String(describing: raw["shopName"] ?? "")
        truncated = raw["truncated"] as? Bool ?? false
        let summary = raw["summary"] as? [String: Any] ?? [:]
        found = summary["found"] as? Int ?? 0
        ready = summary["ready"] as? Int ?? 0
        review = summary["review"] as? Int ?? 0
        unsupported = summary["unsupported"] as? Int ?? 0
        alreadyImported = summary["alreadyImported"] as? Int ?? 0
        rows = (raw["rows"] as? [[String: Any]] ?? []).map(EtsyPreviewRowInfo.init)
    }
}

struct EtsyImportRules {
    var sinceDays = 90
    var includeCompleted = false
    var includeCancelled = false
    var includeDigital = false
    var includeUnpaid = false

    var payload: [String: Any] {
        [
            "sinceDays": sinceDays,
            "includeCompleted": includeCompleted,
            "includeCancelled": includeCancelled,
            "includeDigital": includeDigital,
            "includeUnpaid": includeUnpaid
        ]
    }
}

struct EtsyError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

// MARK: - Calls

extension FirebaseManager {

    /// Every Etsy callable is workspace-scoped and role-checked server-side, so
    /// companyId travels with every call. Sending it explicitly also stops the
    /// server falling back to users/{uid}.activeCompanyId, which is not
    /// necessarily the workspace this screen is showing.
    @discardableResult
    func etsyCall(_ name: String, _ data: [String: Any] = [:], timeout: TimeInterval = 70) async throws -> [String: Any] {
        let companyId = currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !companyId.isEmpty else { throw EtsyError(message: "No workspace selected.") }
        var payload = data
        payload["companyId"] = companyId
        let callable = Functions.functions(region: "europe-west2").httpsCallable(name)
        // A preview or an import can run for minutes on the server. The client
        // default is 70 seconds, which would abandon work that then succeeds
        // without anyone seeing the result.
        callable.timeoutInterval = timeout
        do {
            let result = try await callable.call(payload)
            return result.data as? [String: Any] ?? [:]
        } catch {
            throw EtsyError(message: error.localizedDescription)
        }
    }

    func etsyConnections() async throws -> (connections: [EtsyConnectionInfo], configured: Bool) {
        let data = try await etsyCall("getEtsyConnections")
        let rows = (data["connections"] as? [[String: Any]] ?? []).map(EtsyConnectionInfo.init)
        return (rows, (data["configured"] as? Bool) ?? true)
    }

    /// Returns the URL to send the seller to. Owner only, server-side.
    func etsyBeginConnect() async throws -> String {
        let data = try await etsyCall("beginEtsyConnect")
        return String(describing: data["authorizeUrl"] ?? "")
    }

    /// Asks Etsy, right now, whether this connection still works.
    func etsyVerify(_ connectionId: String) async throws -> (healthy: Bool, reason: String) {
        let data = try await etsyCall("verifyEtsyConnection", ["connectionId": connectionId])
        return ((data["healthy"] as? Bool) ?? false, String(describing: data["reason"] ?? ""))
    }

    func etsyDisconnect(_ connectionId: String) async throws {
        _ = try await etsyCall("disconnectEtsyShop", ["connectionId": connectionId])
    }

    /// A dry run. Writes no orders — the seller sees the list before anything.
    func etsyPreview(_ connectionId: String, rules: EtsyImportRules) async throws -> EtsyPreviewInfo {
        let data = try await etsyCall(
            "previewEtsyImport",
            ["connectionId": connectionId, "rules": rules.payload],
            timeout: 300
        )
        return EtsyPreviewInfo(data)
    }

    func etsyImport(_ connectionId: String, rules: EtsyImportRules, receiptIds: [String]) async throws -> (created: Int, updated: Int, failed: Int) {
        var payload: [String: Any] = ["connectionId": connectionId, "rules": rules.payload]
        if !receiptIds.isEmpty { payload["receiptIds"] = receiptIds }
        let data = try await etsyCall("runEtsyImport", payload, timeout: 540)
        let outcome = data["outcome"] as? [String: Any] ?? [:]
        return (
            outcome["created"] as? Int ?? 0,
            outcome["updated"] as? Int ?? 0,
            outcome["failed"] as? Int ?? 0
        )
    }

    func etsySyncNow(_ connectionId: String) async throws -> (created: Int, updated: Int) {
        let data = try await etsyCall("syncEtsyNow", ["connectionId": connectionId], timeout: 300)
        let outcome = data["outcome"] as? [String: Any] ?? [:]
        return (outcome["created"] as? Int ?? 0, outcome["updated"] as? Int ?? 0)
    }

    /// Remembers "this Etsy buyer is this customer" so the next order does not ask.
    func etsyResolveCustomer(_ connectionId: String, buyerId: String, customerId: String) async throws {
        _ = try await etsyCall(
            "resolveEtsyCustomerMatch",
            ["connectionId": connectionId, "buyerId": buyerId, "customerId": customerId]
        )
    }
}

// MARK: - Sentences

/// The seller-facing reason a receipt was not imported, or needs a look. The
/// server sends codes; a technical code must never reach the screen. Word for
/// word the same as lib/studioflow/etsy.ts.
func etsyReviewReasonText(_ code: String, lang: String) -> String {
    switch code {
    case "currency_mismatch":
        return t("This order uses a different currency. NivaDesk kept the original amount and did not convert it.", lang: lang)
    case "cancelled_at_source":
        return t("This order was cancelled on Etsy.", lang: lang)
    case "digital_only":
        return t("This order contains only digital items.", lang: lang)
    case "not_paid":
        return t("This order has not been paid yet.", lang: lang)
    case "no_line_items":
        return t("This order has no items NivaDesk can import.", lang: lang)
    case "no_buyer_id":
        return t("Etsy did not send a buyer for this order.", lang: lang)
    case "customer_review":
        return t("This Etsy buyer may already exist in NivaDesk. Review the details before linking the order.", lang: lang)
    default:
        return t("This order needs a look before it is imported.", lang: lang)
    }
}

/// The same, for a failed connection.
func etsyErrorText(_ code: String, lang: String) -> String {
    switch code {
    case "auth_expired":
        return t("We could not refresh this Etsy connection. Existing NivaDesk orders are safe. Reconnect Etsy to continue receiving updates.", lang: lang)
    case "rate_limited":
        return t("Etsy is temporarily limiting requests. NivaDesk will continue automatically; no action is needed.", lang: lang)
    case "upstream", "network":
        return t("Etsy could not be reached. NivaDesk will try again automatically.", lang: lang)
    case "token_unreadable":
        return t("The stored Etsy access could not be read. Reconnect the shop to continue.", lang: lang)
    default:
        return ""
    }
}

/// "5 minutes ago" in the seller's language, from a millisecond timestamp.
func etsyRelativeTime(_ atMs: Double, lang: String) -> String {
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
