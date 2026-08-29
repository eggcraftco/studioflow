import Combine
import Foundation
import FirebaseAuth
import FirebaseFirestore
import FirebaseFunctions

/// Where a Home layout lives, and why.
///
/// personalInterfaceSettings is already the per-workspace, per-user document —
/// the same place language and theme live. That is exactly the scope §16 asks
/// for: one member rearranging their Home must not move anyone else's.
///
/// Stored as a JSON string rather than a nested map. Firestore's dotted-key
/// merge semantics have bitten this codebase before, and a layout is an ordered
/// list: a merge that reorders or half-writes it is worse than one that replaces
/// it whole.
@MainActor
final class HomeLayoutStore: ObservableObject {
    @Published var layout: HomeLayout = .standard
    @Published var saveFailed = false

    private var listener: ListenerRegistration?
    private var listenerKey = ""
    /// The layout as the server last accepted it, so a failed save can be undone.
    private var lastSaved: HomeLayout = .standard

    func start(companyId: String) {
        guard let uid = Auth.auth().currentUser?.uid, !uid.isEmpty, !companyId.isEmpty else { return }
        let key = "\(companyId)|\(uid)"
        if listenerKey == key, listener != nil { return }
        listener?.remove()
        listenerKey = key
        listener = Firestore.firestore()
            .collection("companies").document(companyId)
            .collection("personalInterfaceSettings").document(uid)
            .addSnapshotListener { [weak self] snapshot, error in
                guard let self, error == nil else { return }
                let stored = snapshot?.data()?["homeLayout"] as? String ?? ""
                let next = stored.isEmpty ? HomeLayout.standard : HomeLayout.decode(stored)
                Task { @MainActor in
                    self.lastSaved = next
                    self.layout = next
                }
            }
    }

    func stop() {
        listener?.remove()
        listener = nil
        listenerKey = ""
    }

    /// Optimistic (§19): the grid moves under the hand immediately and the write
    /// follows. If the write fails the previous layout comes back, because a card
    /// that appears to move and silently does not is worse than one that refuses.
    ///
    /// Saved through the callable, not written straight to Firestore.
    /// personalInterfaceSettings is read-your-own but write-denied to clients on
    /// purpose — the rule routes writes through savePersonalInterfaceSettings so
    /// the server checks membership and validates the payload. A direct write
    /// looks like it works, because the SDK applies it locally first and the next
    /// snapshot then quietly replaces it with the server's unchanged copy.
    func commit(_ next: HomeLayout) {
        let previous = lastSaved
        layout = next
        saveFailed = false
        Task { @MainActor in
            do {
                _ = try await Functions.functions(region: "europe-west2")
                    .httpsCallable("savePersonalInterfaceSettings")
                    .call(["settings": ["homeLayout": next.encoded()]])
                lastSaved = next
            } catch {
                layout = previous
                saveFailed = true
            }
        }
    }

    // MARK: - Layout edits

    func move(from index: Int, to target: Int) {
        var cards = layout.cards
        guard cards.indices.contains(index) else { return }
        let clamped = max(0, min(cards.count - 1, target))
        let moved = cards.remove(at: index)
        cards.insert(moved, at: clamped)
        commit(HomeLayout(cards: cards, hidden: layout.hidden))
    }

    func resize(_ id: HomeCardID, to size: HomeCardSize) {
        guard let definition = HomeCards.definition(id), definition.sizes.contains(size) else { return }
        commit(HomeLayout(cards: layout.cards.map { $0.id == id ? HomeCardPlacement(id: $0.id, size: size, heading: $0.heading, tone: $0.tone, period: $0.period) : $0 },
                          hidden: layout.hidden))
    }

    func setPeriod(_ id: HomeCardID, period: HomeCardPeriod) {
        commit(HomeLayout(cards: layout.cards.map { $0.id == id ? HomeCardPlacement(id: $0.id, size: $0.size, heading: $0.heading, tone: $0.tone, period: period) : $0 },
                          hidden: layout.hidden))
    }

    func setTone(_ id: HomeCardID, tone: HomeCardTone) {
        commit(HomeLayout(cards: layout.cards.map { $0.id == id ? HomeCardPlacement(id: $0.id, size: $0.size, heading: $0.heading, tone: tone, period: $0.period) : $0 },
                          hidden: layout.hidden))
    }

    func setHeading(_ id: HomeCardID, heading: String) {
        let clean = String(heading.trimmingCharacters(in: .whitespacesAndNewlines).prefix(40))
        commit(HomeLayout(cards: layout.cards.map { $0.id == id ? HomeCardPlacement(id: $0.id, size: $0.size, heading: clean, tone: $0.tone, period: $0.period) : $0 },
                          hidden: layout.hidden))
    }

    func hide(_ id: HomeCardID) {
        commit(HomeLayout(cards: layout.cards.filter { $0.id != id }, hidden: layout.hidden + [id]))
    }

    func show(_ id: HomeCardID) {
        guard let definition = HomeCards.definition(id) else { return }
        commit(HomeLayout(cards: layout.cards + [HomeCardPlacement(id: id, size: definition.defaultSize)],
                          hidden: layout.hidden.filter { $0 != id }))
    }

    func reset(_ id: HomeCardID) {
        guard let definition = HomeCards.definition(id) else { return }
        commit(HomeLayout(cards: layout.cards.map { $0.id == id ? HomeCardPlacement(id: id, size: definition.defaultSize) : $0 },
                          hidden: layout.hidden))
    }

    func resetAll() { commit(.standard) }
}
