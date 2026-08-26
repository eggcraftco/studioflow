import Foundation
import FirebaseFunctions
import FirebaseStorage

// Owner actions on the bank feed. Every write goes through the same Cloud
// Functions the web app calls (owner-checked server-side); the only direct
// client work is putting receipt bytes into Storage under the paths the
// storage rules allow.

struct BankReceiptCandidate: Identifiable, Equatable {
    var id: String { transactionId }
    let transactionId: String
    let score: Int
    let amount: Double
    let currency: String
    let bookingDate: String
    let counterparty: String
    let description: String
    let hasReceipt: Bool

    init?(_ raw: [String: Any]) {
        guard let transactionId = raw["transactionId"] as? String else { return nil }
        self.transactionId = transactionId
        score = (raw["score"] as? NSNumber)?.intValue ?? 0
        amount = (raw["amount"] as? NSNumber)?.doubleValue ?? 0
        currency = (raw["currency"] as? String) ?? "GBP"
        bookingDate = (raw["bookingDate"] as? String) ?? ""
        counterparty = (raw["counterparty"] as? String) ?? ""
        description = (raw["description"] as? String) ?? ""
        hasReceipt = (raw["hasReceipt"] as? Bool) ?? false
    }
}

struct BankReceiptMatchResult {
    let amount: Double
    let date: String
    let candidates: [BankReceiptCandidate]
}

/// One payment already recorded on an order, offered as a match for an
/// incoming bank transaction (bankMatchIncomingToOrder mode "suggest").
struct BankPaymentCandidate: Identifiable, Equatable {
    let id: String
    let amount: Double
    let method: String
    let note: String
    let dateMs: Double

    init?(_ raw: [String: Any]) {
        guard let id = raw["id"] as? String else { return nil }
        self.id = id
        amount = (raw["amount"] as? NSNumber)?.doubleValue ?? 0
        method = (raw["method"] as? String) ?? ""
        note = (raw["note"] as? String) ?? ""
        dateMs = (raw["dateMs"] as? NSNumber)?.doubleValue ?? 0
    }
}

/// What bankMatchIncomingToOrder answered — either a candidate list to choose
/// from, or which terminal action actually happened.
struct BankIncomingMatchResult {
    let orderLabel: String
    let candidates: [BankPaymentCandidate]
    let needsChoice: Bool
    let linked: Bool
    let created: Bool
    let unlinked: Bool
}

/// One line of the connection trail (companies/{id}/bankAuditLog): every sync
/// (success with its import count or failure with its classified error),
/// every connect, disconnect and purge. Server-written, owner-only read.
struct BankAuditEntry: Identifiable, Equatable {
    let id: String
    let atMs: Double
    let kind: String       // "sync" | "connected" | "disconnected" | "purged"
    let ok: Bool
    let bank: String
    let imported: Int
    let error: String

    init?(_ raw: [String: Any]) {
        guard let id = raw["id"] as? String, !id.isEmpty else { return nil }
        self.id = id
        atMs = (raw["atMs"] as? NSNumber)?.doubleValue ?? 0
        kind = (raw["kind"] as? String) ?? ""
        ok = (raw["ok"] as? Bool) ?? true
        bank = (raw["bank"] as? String) ?? ""
        imported = (raw["imported"] as? NSNumber)?.intValue ?? 0
        error = (raw["error"] as? String) ?? ""
    }
}

struct BankFeedError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

extension FirebaseManager {

    // MARK: Plumbing

    /// Every bank callable is workspace-scoped and owner-checked server-side, so
    /// the active companyId travels with every call (same contract as the web app).
    @discardableResult
    func bankCall(_ name: String, _ data: [String: Any] = [:]) async throws -> [String: Any] {
        var payload = data
        payload["companyId"] = currentCompanyId
        guard !currentCompanyId.isEmpty else { throw BankFeedError(message: "No workspace selected.") }
        do {
            let result = try await Functions.functions(region: "europe-west2").httpsCallable(name).call(payload)
            return result.data as? [String: Any] ?? [:]
        } catch {
            throw BankFeedError(message: error.localizedDescription)
        }
    }

    private func bankSafeFileName(_ name: String) -> String {
        let cleaned = name.unicodeScalars.map { scalar -> Character in
            CharacterSet.alphanumerics.contains(scalar) || "._-".unicodeScalars.contains(scalar) ? Character(scalar) : "_"
        }
        let joined = String(cleaned).prefix(120)
        return joined.isEmpty ? "receipt" : String(joined)
    }

    private func bankUpload(path: String, data: Data, contentType: String) async throws {
        let metadata = StorageMetadata()
        metadata.contentType = contentType
        do {
            _ = try await Storage.storage().reference().child(path).putDataAsync(data, metadata: metadata)
        } catch {
            throw BankFeedError(message: error.localizedDescription)
        }
    }

    // MARK: Transactions

    func bankSetCategory(transactionId: String, category: String) async throws {
        try await bankCall("bankSetTransactionCategory", ["transactionId": transactionId, "category": category])
    }

    /// Category + VAT + note + review status in one go (the drawer's Save).
    func bankUpdateTransaction(transactionId: String, category: String, vatCode: String, note: String, reviewStatus: String) async throws {
        try await bankCall("bankUpdateTransaction", ["transactionId": transactionId, "category": category, "vatCode": vatCode, "note": note, "reviewStatus": reviewStatus])
    }

    func bankSetReceiptNotNeeded(transactionId: String, value: Bool) async throws {
        try await bankCall("bankUpdateTransaction", ["transactionId": transactionId, "receiptNotNeeded": value])
    }

    /// Links when `orderId` is given, unlinks when the transaction is already linked and `orderId` is empty.
    func bankLinkOrder(transactionId: String, orderId: String) async throws {
        var payload: [String: Any] = ["transactionId": transactionId]
        if !orderId.isEmpty { payload["orderId"] = orderId }
        try await bankCall("bankLinkTransactionToOrder", payload)
    }

    /// Splits one spending payment into several category/order lines. The
    /// server enforces 2–12 lines summing exactly to the amount; an empty
    /// array clears the split (same contract as the web drawer).
    func bankSetSplits(transactionId: String, splits: [[String: Any]]) async throws {
        try await bankCall("bankSetTransactionSplits", ["transactionId": transactionId, "splits": splits])
    }

    /// Classifies an incoming payment ("" clears). transfer/owner_contribution/
    /// loan drop out of the Incoming total — money in, but not revenue.
    func bankSetIncomingKind(transactionId: String, kind: String) async throws {
        try await bankCall("bankUpdateTransaction", ["transactionId": transactionId, "incomingKind": kind])
    }

    /// One call, four modes: "suggest" lists the order's same-amount payments
    /// not yet bank-linked, "link" stamps one of them, "create" appends a NEW
    /// payment (idempotent per bank transaction), "unlink" clears the link but
    /// keeps the payment on the order.
    func bankMatchIncoming(transactionId: String, mode: String, orderId: String, paymentId: String? = nil) async throws -> BankIncomingMatchResult {
        var payload: [String: Any] = ["transactionId": transactionId, "mode": mode]
        if mode != "unlink", !orderId.isEmpty { payload["orderId"] = orderId }
        if let paymentId, !paymentId.isEmpty { payload["paymentId"] = paymentId }
        let raw = try await bankCall("bankMatchIncomingToOrder", payload)
        return BankIncomingMatchResult(
            orderLabel: (raw["orderLabel"] as? String) ?? "",
            candidates: (raw["candidates"] as? [[String: Any]] ?? []).compactMap(BankPaymentCandidate.init),
            needsChoice: (raw["needsChoice"] as? Bool) ?? false,
            linked: (raw["linked"] as? Bool) ?? false,
            created: (raw["created"] as? Bool) ?? false,
            unlinked: (raw["unlinked"] as? Bool) ?? false
        )
    }

    func bankSetCategoryBulk(transactionIds: [String], category: String) async throws {
        try await bankCall("bankSetTransactionCategoryBulk", ["transactionIds": transactionIds, "category": category])
    }

    func bankSetReviewStatusBulk(transactionIds: [String], reviewStatus: String) async throws {
        try await bankCall("bankSetReviewStatusBulk", ["transactionIds": transactionIds, "reviewStatus": reviewStatus])
    }

    func bankSync() async throws -> Int {
        let result = try await bankCall("bankSyncTransactions", ["force": true])
        return (result["imported"] as? NSNumber)?.intValue ?? 0
    }

    // MARK: Connections

    /// Two very different decisions, kept apart on purpose (same contract as
    /// the web): mode "disconnect" only revokes the bank consent and KEEPS
    /// every imported transaction (the connection stays as "disconnected");
    /// mode "purge" deletes the connection AND all its imported transactions.
    func bankDeleteConnection(connectionId: String, mode: String) async throws {
        try await bankCall("bankDeleteConnection", ["requisitionId": connectionId, "mode": mode])
    }

    /// The connection trail, newest first — owner-only server-side, served by
    /// a callable so no client rule exists.
    func bankListAuditLog(limit: Int = 15) async throws -> [BankAuditEntry] {
        let raw = try await bankCall("bankListAuditLog", ["limit": limit])
        return (raw["entries"] as? [[String: Any]] ?? []).compactMap(BankAuditEntry.init)
    }

    // MARK: Receipts

    func bankAttachReceipt(transactionId: String, data: Data, fileName: String, contentType: String) async throws {
        let safe = bankSafeFileName(fileName)
        let path = "companies/\(currentCompanyId)/bank_receipts/\(transactionId)/\(Int(Date().timeIntervalSince1970 * 1000))_\(safe)"
        try await bankUpload(path: path, data: data, contentType: contentType)
        try await bankCall("bankSetTransactionReceipt", ["transactionId": transactionId, "storagePath": path, "fileName": fileName])
    }

    /// Attaches a central Files-library file as the receipt by REFERENCE —
    /// no bytes are copied, the transaction just points at the fileRecord.
    func bankAttachLibraryReceipt(transactionId: String, fileRecordId: String) async throws {
        try await bankCall("bankSetTransactionReceipt", ["transactionId": transactionId, "fileRecordId": fileRecordId])
    }

    func bankRemoveReceipt(transactionId: String) async throws {
        try await bankCall("bankSetTransactionReceipt", ["transactionId": transactionId, "storagePath": "", "fileName": ""])
    }

    func bankReceiptURL(path: String) async throws -> URL {
        do { return try await Storage.storage().reference(withPath: path).downloadURL() }
        catch { throw BankFeedError(message: error.localizedDescription) }
    }

    /// Uploads a receipt to the OCR inbox and asks the server which transactions it could belong to.
    func bankMatchReceipt(data: Data, fileName: String, contentType: String) async throws -> (inboxPath: String, result: BankReceiptMatchResult) {
        let safe = bankSafeFileName(fileName)
        let path = "companies/\(currentCompanyId)/bank_receipts/_inbox/\(Int(Date().timeIntervalSince1970 * 1000))_\(safe)"
        try await bankUpload(path: path, data: data, contentType: contentType)
        let raw = try await bankCall("bankMatchReceipt", ["storagePath": path])
        let parsed = raw["parsed"] as? [String: Any] ?? [:]
        let candidates = (raw["candidates"] as? [[String: Any]] ?? []).compactMap(BankReceiptCandidate.init)
        return (path, BankReceiptMatchResult(amount: (parsed["amount"] as? NSNumber)?.doubleValue ?? 0, date: (parsed["date"] as? String) ?? "", candidates: candidates))
    }

    func bankAssignInboxReceipt(inboxPath: String, transactionId: String, fileName: String) async throws {
        try await bankCall("bankAssignInboxReceipt", ["storagePath": inboxPath, "transactionId": transactionId, "fileName": fileName])
    }

    func bankQueueInboxReceipt(inboxPath: String, fileName: String, amount: Double, date: String) async throws {
        try await bankCall("bankQueueInboxReceipt", ["storagePath": inboxPath, "fileName": fileName, "amount": amount, "date": date])
    }

    func bankDiscardInboxUpload(inboxPath: String) async {
        try? await Storage.storage().reference(withPath: inboxPath).delete()
    }

    func bankDeleteWaitingReceipt(id: String) async throws {
        try await bankCall("bankDeleteInboxReceipt", ["id": id])
    }

    func bankMatchWaitingReceipts() async throws -> Int {
        let result = try await bankCall("bankMatchWaitingReceipts")
        return (result["matched"] as? NSNumber)?.intValue ?? 0
    }

    // MARK: Vendors

    /// Marks a payee as recurring, or merges this merchant key into an existing vendor.
    func bankSaveVendor(vendorId: String, name: String, key: String, cadence: String) async throws {
        try await bankCall("bankSaveVendor", ["vendorId": vendorId, "name": name, "keys": [key], "cadence": cadence])
    }

    /// Drops one merchant key from a vendor, or the whole vendor when it was the last one.
    func bankDeleteVendor(vendorId: String, key: String) async throws {
        try await bankCall("bankDeleteVendor", ["vendorId": vendorId, "key": key])
    }

    // MARK: Rules

    func bankSaveRule(keyword: String, category: String) async throws {
        try await bankCall("bankSaveRule", ["keyword": keyword.lowercased(), "category": category])
    }

    func bankDeleteRule(id: String) async throws {
        try await bankCall("bankDeleteRule", ["ruleId": id])
    }
}
