import Foundation

/// The Apple half of functions/production.js.
///
/// Production status is NOT order status, payment status or delivery status. An
/// order can be paid, undelivered and still sitting in Quality Check. The stage
/// a job is in is DERIVED from the production steps already on the order rather
/// than stored beside them, so the board and the order can never disagree — and
/// because it is derived, this file has to reach exactly the same answer the
/// server and the web reach. The shared regression lives in
/// functions/test/qa/production-stage.test.js.

enum ProductionStageKind: String, CaseIterable {
    case ready, active, blocked, review, shipready, done
}

struct ProductionStage: Identifiable, Equatable {
    let id: String
    var title: String
    var kind: ProductionStageKind
    var wipLimit: Int

    init(id: String, title: String, kind: ProductionStageKind, wipLimit: Int) {
        self.id = id
        self.title = title
        self.kind = kind
        self.wipLimit = wipLimit
    }

    init?(_ raw: [String: Any]) {
        let title = ((raw["title"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return nil }
        self.id = (raw["id"] as? String) ?? ProductionStage.slug(title)
        self.title = title
        self.kind = ProductionStageKind(rawValue: (raw["kind"] as? String) ?? "") ?? .active
        self.wipLimit = max(0, (raw["wipLimit"] as? NSNumber)?.intValue ?? 0)
    }

    static func slug(_ value: String) -> String {
        let lowered = value.lowercased()
        let mapped = lowered.map { character -> Character in
            character.isLetter || character.isNumber ? character : "_"
        }
        let parts = String(mapped).split(separator: "_").map(String.init)
        return parts.isEmpty ? "stage" : parts.joined(separator: "_")
    }
}

/// Why a job stopped. The Blocked lane exists to say why, so a blocker without
/// a reason is not a blocker at all.
struct ProductionBlocker: Equatable {
    var reason: String
    var note: String

    static let reasons = [
        "waiting_for_customer_approval",
        "material_unavailable",
        "supplier_delay",
        "technical_problem",
        "other"
    ]

    static let labels: [String: String] = [
        "waiting_for_customer_approval": "Waiting for customer approval",
        "material_unavailable": "Material unavailable",
        "supplier_delay": "Supplier delay",
        "technical_problem": "Technical problem",
        "other": "Other"
    ]

    init(reason: String, note: String = "") {
        self.reason = reason
        self.note = note
    }

    init?(_ raw: Any?) {
        guard let dict = raw as? [String: Any],
              let reason = dict["reason"] as? String,
              ProductionBlocker.reasons.contains(reason) else { return nil }
        self.reason = reason
        self.note = (dict["note"] as? String) ?? ""
    }

    var label: String { ProductionBlocker.labels[reason] ?? "Blocked" }
}

let defaultProductionStages: [ProductionStage] = [
    ProductionStage(id: "ready", title: "Ready", kind: .ready, wipLimit: 10),
    ProductionStage(id: "in_production", title: "In Production", kind: .active, wipLimit: 10),
    ProductionStage(id: "blocked", title: "Waiting / Blocked", kind: .blocked, wipLimit: 10),
    ProductionStage(id: "quality_check", title: "Quality Check", kind: .review, wipLimit: 10),
    ProductionStage(id: "ready_to_ship", title: "Ready to Ship", kind: .shipready, wipLimit: 10),
    ProductionStage(id: "done", title: "Done", kind: .done, wipLimit: 0)
]

/// Exactly one lane may mean "not started", "stuck" and "finished"; the middle
/// of the board is the workshop's to shape. Never returns an empty board.
func productionStagesFromSettings(_ raw: Any?) -> [ProductionStage] {
    let list = (raw as? [[String: Any]]) ?? []
    var stages: [ProductionStage] = []
    var seen = Set<String>()
    for entry in list {
        guard var stage = ProductionStage(entry) else { continue }
        var id = ProductionStage.slug(stage.id)
        while seen.contains(id) { id = "\(id)_\(stages.count + 1)" }
        seen.insert(id)
        stage = ProductionStage(id: id, title: stage.title, kind: stage.kind, wipLimit: stage.wipLimit)
        stages.append(stage)
    }
    if stages.isEmpty { return defaultProductionStages }

    for kind in [ProductionStageKind.ready, .blocked, .done] {
        if stages.contains(where: { $0.kind == kind }) { continue }
        guard let fallback = defaultProductionStages.first(where: { $0.kind == kind }) else { continue }
        var id = fallback.id
        if seen.contains(id) { id = "\(id)_\(stages.count + 1)" }
        seen.insert(id)
        let repaired = ProductionStage(id: id, title: fallback.title, kind: kind, wipLimit: fallback.wipLimit)
        if kind == .ready { stages.insert(repaired, at: 0) } else { stages.append(repaired) }
    }
    if !stages.contains(where: { $0.kind == .active }) {
        stages.insert(ProductionStage(id: "in_production_1", title: "In Production", kind: .active, wipLimit: 10), at: min(1, stages.count))
    }
    return stages
}

/// What the board shows for one order.
struct ResolvedProductionStage {
    var stageId: String
    /// "auto", "manual", "blocker" or "delivered" — why the card is here.
    var source: String
    var doneCount: Int
    var total: Int
    var blocker: ProductionBlocker?
    /// The step now being worked — the card's "current operation" line.
    var currentStep: String
}

private let productionDoneValues: Set<String> = ["done", "complete", "completed", "finished", "yes", "ready"]
private let productionIdleValues: Set<String> = ["", "not yet", "new", "none", "no", "pending", "todo", "to do", "waiting"]

func productionStepIsDone(_ value: String) -> Bool {
    productionDoneValues.contains(value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
}

private func productionStepIsIdle(_ value: String) -> Bool {
    productionIdleValues.contains(value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
}

/// Step 0 answers in designStatus, step 1 in status, the rest in extraStatuses
/// keyed either by `statusStep::<id>` or by the raw title. Mirrors the client
/// that wrote them.
func productionStepValue(order: Siparis, stepId: String, stepTitle: String, index: Int) -> String {
    let extras = order.extraStatuses ?? [:]
    let rawId = stepId.isEmpty ? stepTitle : stepId
    if let keyed = extras["statusStep::\(rawId.lowercased())"], !keyed.trimmingCharacters(in: .whitespaces).isEmpty {
        return keyed
    }
    if let byTitle = extras[stepTitle], !byTitle.trimmingCharacters(in: .whitespaces).isEmpty {
        return byTitle
    }
    if index == 0 { return order.designStatus }
    if index == 1 { return order.status }
    return ""
}

/// The single rule every platform follows.
func resolveProductionStage(
    order: Siparis,
    stages: [ProductionStage],
    steps: [(id: String, title: String)],
    overrideId: String,
    blocker: ProductionBlocker?
) -> ResolvedProductionStage {
    let blockedStage = stages.first { $0.kind == .blocked }
    let readyStage = stages.first { $0.kind == .ready } ?? stages.first
    let doneStage = stages.first { $0.kind == .done } ?? stages.last
    let shipReady = stages.first { $0.kind == .shipready } ?? stages.first { $0.kind == .review } ?? doneStage
    let firstActive = stages.first { $0.kind == .active } ?? readyStage

    let values = steps.enumerated().map { index, step in
        productionStepValue(order: order, stepId: step.id, stepTitle: step.title, index: index)
    }
    let doneCount = values.filter(productionStepIsDone).count
    let total = steps.count
    let currentIndex = values.firstIndex { !productionStepIsDone($0) }
    let currentStep = currentIndex.map { steps[$0].title } ?? ""

    func result(_ stage: ProductionStage?, _ source: String, _ blocker: ProductionBlocker? = nil) -> ResolvedProductionStage {
        ResolvedProductionStage(
            stageId: stage?.id ?? "",
            source: source,
            doneCount: doneCount,
            total: total,
            blocker: blocker,
            currentStep: currentStep
        )
    }

    // A blocker outranks everything: a stuck job is stuck wherever it stood.
    if let blocker, let blockedStage { return result(blockedStage, "blocker", blocker) }

    // An override is a person's decision; only delivery overrules it, because
    // nothing already with the customer is still on the bench.
    if order.isDelivered, let doneStage { return result(doneStage, "delivered") }
    if !overrideId.isEmpty, let manual = stages.first(where: { $0.id == overrideId }) {
        return result(manual, "manual")
    }

    if total == 0 { return result(readyStage, "auto") }
    if doneCount >= total { return result(shipReady, "auto") }
    if values.allSatisfy(productionStepIsIdle) { return result(readyStage, "auto") }

    // Name binding: when the step being worked shares its name with a lane,
    // that lane is plainly the right one.
    if !currentStep.isEmpty {
        let wanted = currentStep.trimmingCharacters(in: .whitespaces).lowercased()
        if let named = stages.first(where: { $0.kind != .blocked && $0.title.trimmingCharacters(in: .whitespaces).lowercased() == wanted }) {
            return result(named, "auto")
        }
    }
    return result(firstActive, "auto")
}

/// Green well under the WIP limit, amber approaching it, red over.
enum ProductionWipLevel { case none, ok, near, over }

func productionWipLevel(count: Int, limit: Int) -> ProductionWipLevel {
    guard limit > 0 else { return .none }
    if count > limit { return .over }
    if count >= Int((Double(limit) * 0.8).rounded(.up)) { return .near }
    return .ok
}

// MARK: - Server calls
//
// Only two things are ever written to an order: a person's explicit override
// and the blocker. Everything else is derived above, which is why a Mac writing
// a step straight to Firestore still lands in the right lane on every platform.

import FirebaseFirestore
import FirebaseFunctions

struct ProductionMoveResult {
    /// Everything Undo needs to put the card back exactly as it stood.
    var previousOverride: String
    var previousBlocker: ProductionBlocker?
}

extension FirebaseManager {
    /// The workspace's board. Falls back to the default lanes rather than
    /// failing — a board that will not render answers nothing.
    func loadProductionStages() async -> [ProductionStage] {
        guard !currentCompanyId.isEmpty else { return defaultProductionStages }
        do {
            let snap = try await Firestore.firestore()
                .collection("companySettings").document(currentCompanyId).getDocument()
            return productionStagesFromSettings(snap.data()?["productionStages"])
        } catch {
            return defaultProductionStages
        }
    }

    private func productionCall(_ name: String, _ data: [String: Any]) async throws -> [String: Any] {
        guard !currentCompanyId.isEmpty else { throw InventoryError(message: "No workspace selected.") }
        var payload = data
        payload["companyId"] = currentCompanyId
        do {
            let result = try await Functions.functions(region: "europe-west2").httpsCallable(name).call(payload)
            return result.data as? [String: Any] ?? [:]
        } catch {
            throw InventoryError(message: error.localizedDescription)
        }
    }

    /// Moving a card writes the stage, records it in the order's history, tells
    /// the assignee, and hands back what Undo needs. The blocked lane refuses a
    /// move with no reason — server-side, so every client is held to it.
    @discardableResult
    func setOrderProductionStage(orderId: String, stageId: String, blocker: ProductionBlocker?) async throws -> ProductionMoveResult {
        var payload: [String: Any] = ["orderId": orderId, "stageId": stageId]
        if let blocker {
            payload["blocker"] = ["reason": blocker.reason, "note": blocker.note]
        }
        let raw = try await productionCall("setOrderProductionStage", payload)
        let previous = raw["previous"] as? [String: Any] ?? [:]
        return ProductionMoveResult(
            previousOverride: previous["override"] as? String ?? "",
            previousBlocker: ProductionBlocker(previous["blocker"])
        )
    }

    func undoOrderProductionStage(orderId: String, previous: ProductionMoveResult) async throws {
        var blockerPayload: [String: Any]? = nil
        if let blocker = previous.previousBlocker {
            blockerPayload = ["reason": blocker.reason, "note": blocker.note]
        }
        var payloadPrevious: [String: Any] = ["override": previous.previousOverride]
        if let blockerPayload { payloadPrevious["blocker"] = blockerPayload }
        _ = try await productionCall("undoOrderProductionStage", ["orderId": orderId, "previous": payloadPrevious])
    }

    func saveProductionStages(_ stages: [ProductionStage]) async throws -> [ProductionStage] {
        let payload = stages.map { stage -> [String: Any] in
            ["id": stage.id, "title": stage.title, "kind": stage.kind.rawValue, "wipLimit": stage.wipLimit]
        }
        let raw = try await productionCall("saveProductionStages", ["stages": payload])
        return productionStagesFromSettings(raw["stages"])
    }
}
