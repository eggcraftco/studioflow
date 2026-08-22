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

    /// Category + VAT + note in one go (the drawer's Save).
    func bankUpdateTransaction(transactionId: String, category: String, vatCode: String, note: String) async throws {
        try await bankCall("bankUpdateTransaction", ["transactionId": transactionId, "category": category, "vatCode": vatCode, "note": note])
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

    func bankSetCategoryBulk(transactionIds: [String], category: String) async throws {
        try await bankCall("bankSetTransactionCategoryBulk", ["transactionIds": transactionIds, "category": category])
    }

    func bankSync() async throws -> Int {
        let result = try await bankCall("bankSyncTransactions", ["force": true])
        return (result["imported"] as? NSNumber)?.intValue ?? 0
    }

    // MARK: Receipts

    func bankAttachReceipt(transactionId: String, data: Data, fileName: String, contentType: String) async throws {
        let safe = bankSafeFileName(fileName)
        let path = "companies/\(currentCompanyId)/bank_receipts/\(transactionId)/\(Int(Date().timeIntervalSince1970 * 1000))_\(safe)"
        try await bankUpload(path: path, data: data, contentType: contentType)
        try await bankCall("bankSetTransactionReceipt", ["transactionId": transactionId, "storagePath": path, "fileName": fileName])
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

    // MARK: Rules

    func bankSaveRule(keyword: String, category: String) async throws {
        try await bankCall("bankSaveRule", ["keyword": keyword.lowercased(), "category": category])
    }

    func bankDeleteRule(id: String) async throws {
        try await bankCall("bankDeleteRule", ["ruleId": id])
    }
}
