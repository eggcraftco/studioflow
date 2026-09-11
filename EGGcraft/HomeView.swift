import Combine
import Foundation
import UniformTypeIdentifiers
import Network
import FirebaseAuth
import FirebaseFirestore
import FirebaseFunctions
import SwiftUI

/// Home: the screen that answers what needs attention, what is next, and where
/// to go for the detail. It reports and hands off; it never becomes a second,
/// smaller copy of Orders, Banking, Inventory, Schedule or Files.
///
/// Every card body below is its own `struct` on purpose. Deeply nested inline
/// views in this app have overflowed the SwiftUI stack guard on real hardware
/// while behaving perfectly in the simulator, and a grid of eleven cards each
/// with three size variants is exactly the shape that trips it.

struct HomeAccess {
    var orders = true
    var dashboard = true
    var bankFeed = true
    var customers = true
    var schedule = true
    var files = true
    var notes = true
    var isOwner = true

    /// The finance-only cards need no extra test here: `dashboard` and `bankFeed`
    /// already fold in the workspace's financial-data permission at the source,
    /// the same way the Dashboard and Banking tabs decide whether to appear.
    func allows(_ card: HomeCardDefinition) -> Bool {
        switch card.access {
        case .always: return true
        case .orders: return orders
        case .dashboard: return dashboard
        case .bankFeed: return bankFeed
        case .customers: return customers
        case .schedule: return schedule
        case .files: return files
        case .notes: return notes
        }
    }
}

// MARK: - The workspace's real setup checklist

/// One step of the setup checklist, exactly as the server built it.
///
/// The list is deliberately NOT computed here. `getSetupChecklist`
/// (functions/lifecycle/checklist.js) builds it from the SAME requirements
/// table activation is measured against, so a client that drew its own list
/// would drift from the measurement the moment either side changed — and a
/// jeweller who came to manage bespoke commissions would keep being told to
/// connect an online shop. Spec §114.
struct HomeSetupChecklistStep: Decodable {
    let key: String
    let title: String
    let detail: String
    /// What the step asks for, in the server's vocabulary — mapped to a tab by
    /// `homeSetupDestination(forAction:)`, never used as a tab name directly.
    let action: String
    let done: Bool
}

struct HomeSetupChecklist: Decodable {
    let path: String
    /// §115: activation reached. The card stops being a list.
    let complete: Bool
    let steps: [HomeSetupChecklistStep]
    let doneCount: Int
    let headline: String
}

/// Where each server-named step sends somebody, in Home's own tab vocabulary.
///
/// An action with no tab of its own returns "" and the step is drawn without a
/// way in, rather than sent somewhere approximate — the same rule the web card
/// follows (a step with no href is disabled).
///
/// `assistant` used to be one of those, on the grounds that the assistant is a
/// popover here rather than a tab. But AI Replies IS a tab (`AutoReplyView`),
/// it is where the assistant is given the workspace's data, and it is the same
/// screen Android's `assistant` step opens. Left out, it made an entire
/// checklist inert: the server's `ai` path builds a list whose steps are ALL
/// `assistant`, so that workspace got a card of rows that went nowhere.
func homeSetupDestination(forAction action: String) -> String {
    switch action {
    case "integrations": return "Settings"
    case "new_order": return "Orders"
    // The way back to a started-but-empty first order (the server's
    // "Complete your first project" step). The list for now; opening the exact
    // order needs the step's target plumbed through the model.
    case "open_order": return "Orders"
    case "new_customer": return "Customers"
    case "bank": return "BankSpending"
    case "inventory": return "Inventory"
    case "assistant": return "QuickReply"
    default: return ""
    }
}

// MARK: - Shared data

/// One read for the whole screen, sliced per card. Orders alone feed Money,
/// Orders & production, Schedule, Recent activity and Notes — five queries for
/// one collection would be five times the cost for exactly the same rows.
@MainActor
final class HomeData: ObservableObject {
    @Published var inventory: InventorySummary?
    @Published var inventoryFailed = false
    /// Only the 2×2 stock card names individual items, and the list behind it is
    /// a 500-row callable — so nobody else pays for it.
    @Published var inventoryItems: [InventoryItem] = []
    @Published var notes: [StudioKeepNote] = []
    @Published var stages: [ProductionStage] = defaultProductionStages
    @Published var loadedAt: Date?

    /// §18 wants an offline label rather than a card that silently shows old
    /// numbers as if they were current. The Firestore listeners keep serving
    /// their cache; the screen just says so.
    @Published var offline = false
    /// The newest lastSyncedAt across the workspace's bank connections. This is
    /// the real signal — a live snapshot only says the listener fired, not that
    /// the bank handed anything over.
    @Published var bankLastSync: Date?
    @Published var bankNeedsAttention = false
    /// What the workspace pays every month on repeat, by the same rule the
    /// Banking screen uses.
    @Published var bankMonthlyFixed: Double = 0

    /// The workspace's real setup checklist, from `getSetupChecklist`. `nil`
    /// means the server has not answered (or could not) and the Getting started
    /// card falls back to its own generic list.
    @Published var setupChecklist: HomeSetupChecklist?
    /// Whether the workspace has been through business setup — read from the
    /// one field the server checklist is itself built from, so the fallback list
    /// stops claiming the step is done for a workspace that never did it.
    @Published var setupProfileDone = false

    private var notesListener: ListenerRegistration?
    private var notesKey = ""
    private var bankListener: ListenerRegistration?
    private let pathMonitor = NWPathMonitor()
    private var monitoring = false

    func startMonitoring() {
        guard !monitoring else { return }
        monitoring = true
        pathMonitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in self?.offline = path.status != .satisfied }
        }
        pathMonitor.start(queue: DispatchQueue(label: "home.path"))
    }

    func load(manager: FirebaseManager, companyId: String,
              wantsInventoryItems: Bool = false, wantsSetupChecklist: Bool = false) async {
        async let summary = try? manager.loadInventorySummary()
        async let loadedStages = manager.loadProductionStages()
        let (nextSummary, nextStages) = await (summary, loadedStages)
        inventory = nextSummary
        inventoryFailed = nextSummary == nil
        // A failure here must not take the summary with it: the card keeps its
        // figures and simply lists nothing.
        if wantsInventoryItems {
            inventoryItems = (try? await manager.loadInventoryItems()) ?? []
        }
        // Only when the card that shows it is actually on this member's Home —
        // a callable nobody can see the answer to is a round trip for nothing.
        if wantsSetupChecklist {
            await loadSetupChecklist(companyId: companyId)
        }
        if !nextStages.isEmpty { stages = nextStages }
        loadedAt = Date()
        listenNotes(companyId: companyId)
        listenBankHealth(companyId: companyId)
    }

    /// The checklist, and the one field the fallback list needs to stop lying.
    ///
    /// Silent on failure, deliberately: somebody whose checklist will not load
    /// should get the Home screen they opened, and the generic list is a better
    /// answer than an error about a card.
    private func loadSetupChecklist(companyId: String) async {
        do {
            // The workspace is named, never left to the server to guess: every
            // other callable in this app passes `companyId`, and the fallback
            // (`activeCompanyIdForUid`) reads a users/ document that lags a
            // workspace switch — which would answer this card with the previous
            // workspace's checklist.
            let result = try await Functions.functions(region: "europe-west2")
                .httpsCallable("getSetupChecklist").call(["companyId": companyId])
            if let payload = result.data as? [String: Any],
               JSONSerialization.isValidJSONObject(payload),
               let encoded = try? JSONSerialization.data(withJSONObject: payload),
               let parsed = try? JSONDecoder().decode(HomeSetupChecklist.self, from: encoded) {
                setupChecklist = parsed
            }
        } catch {
            // Left as it was; the card falls back.
        }

        // Workspace-scoped on purpose: this object is rebuilt whenever the
        // company id changes, so a value read for one workspace can never be
        // shown against another the way a UserDefaults mirror could.
        guard !companyId.isEmpty else { return }
        let settings = try? await Firestore.firestore()
            .collection("companySettings").document(companyId).getDocument()
        let fields = settings?.data() ?? [:]
        // The same two facts the server's own `onboarding` step is built from
        // (functions/lifecycle/checklist.js), so the fallback answers this
        // question the way the real list does. Deliberately NOT the completion
        // TIMESTAMP: that is written when somebody skips as well, and skipping
        // is not completing.
        let goal = (fields["onboardingMainGoal"] as? String ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        setupProfileDone = (fields["businessOnboardingCompleted"] as? Bool) == true || !goal.isEmpty
    }

    private func listenNotes(companyId: String) {
        guard let uid = Auth.auth().currentUser?.uid, !uid.isEmpty, !companyId.isEmpty else { return }
        let key = "\(companyId)|\(uid)"
        if notesKey == key, notesListener != nil { return }
        notesListener?.remove()
        notesKey = key
        notesListener = Firestore.firestore()
            .collection("companies").document(companyId)
            .collection("personal_notes").document(uid)
            .collection("notes")
            .addSnapshotListener { [weak self] snapshot, error in
                guard let self, error == nil, let documents = snapshot?.documents else { return }
                let parsed = documents.map { StudioKeepNote(document: $0) }
                    .filter { !$0.isDeleted && !$0.isArchived }
                Task { @MainActor in self.notes = parsed }
            }
    }

    private func listenBankHealth(companyId: String) {
        guard !companyId.isEmpty, bankListener == nil else { return }
        bankListener = Firestore.firestore()
            .collection("companies").document(companyId)
            .collection("bankConnections")
            .addSnapshotListener { [weak self] snapshot, error in
                guard let self, error == nil, let documents = snapshot?.documents else { return }
                var newest: Date?
                var unhealthy = false
                for document in documents {
                    let data = document.data()
                    if let stamp = (data["lastSyncedAt"] as? Timestamp)?.dateValue() {
                        if newest == nil || stamp > newest! { newest = stamp }
                    }
                    if (data["status"] as? String) == "linked",
                       (data["syncState"] as? String ?? "ok") != "ok" { unhealthy = true }
                }
                Task { @MainActor in
                    self.bankLastSync = newest
                    self.bankNeedsAttention = unhealthy
                }
            }
    }

    func stop() {
        bankListener?.remove()
        bankListener = nil
        notesListener?.remove()
        notesListener = nil
        notesKey = ""
        if monitoring {
            pathMonitor.cancel()
            monitoring = false
        }
    }
}

// MARK: - Screen

struct HomeView: View {
    let access: HomeAccess
    /// Opening a card's detail is the host's job — Home only says where to go.
    let onOpen: (String) -> Void
    let onNewOrder: () -> Void

    @EnvironmentObject var firebaseManager: FirebaseManager
    @StateObject private var store = HomeLayoutStore()
    @StateObject private var data = HomeData()
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    @AppStorage("seciliParaBirimi") private var seciliParaBirimi: String = "£"
    @AppStorage("seciliOndalik") private var seciliOndalik: String = "."
    @AppStorage("customStepsJSON") private var customStepsJSON: String = ""
    @Environment(\.colorScheme) private var colorScheme

    @State private var customising = false
    /// The card currently under the pointer, so a drop knows where it landed.
    @State private var draggingID: HomeCardID?
    @State private var dropTargetID: HomeCardID?
    /// The gap the card is over, if it is over one.
    @State private var dropHole: HomeGridLayout.Hole?
    @State private var renaming: HomeCardID?
    @State private var renameText = ""
    /// The grid's own column width once it has laid out. Squares come from this.
    @State private var measuredUnit: CGFloat = 0

    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var sizeClass
    private var isCompact: Bool { sizeClass == .compact }
    // Two columns on a phone, so a pair of 1×1 cards sits side by side instead
    // of each one eating a whole screen. A 2×1 or 2×2 still fills the width —
    // it is drawn for two columns and there are exactly two.
    private var columnCount: Int { sizeClass == .compact ? 2 : 4 }
    #else
    private var columnCount: Int { 4 }
    private var isCompact: Bool { false }
    #endif

    /// The square row, from the screen width rather than the grid's — the grid
    /// has not measured itself yet when the ScrollView asks for a height. Once
    /// it has, `measuredUnit` takes over.
    private var rowEstimate: CGFloat {
        #if os(iOS)
        let width = min(UIScreen.main.bounds.width - 44, HomeGridMetrics.maxWidth)
        #else
        // No AppKit here: the grid measures itself a frame later anyway, and
        // this only has to keep the ScrollView from clipping until it does.
        let width: CGFloat = HomeGridMetrics.maxWidth
        #endif
        let columns = CGFloat(columnCount)
        return max(160, (width - HomeGridMetrics.gap * (columns - 1)) / columns)
    }

    private var visible: [HomeCardPlacement] {
        store.layout.cards.filter { placement in
            guard let definition = HomeCards.definition(placement.id) else { return false }
            return access.allows(definition)
        }
    }

    private var gallery: [HomeCardDefinition] {
        let placed = Set(store.layout.cards.map { $0.id })
        return HomeCards.all.filter { !placed.contains($0.id) && access.allows($0) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                if store.saveFailed { saveErrorBanner }
                if customising { customiseBar }
                grid
                if customising && !gallery.isEmpty { galleryRow }
            }
            .padding(22)
            // The grid is capped at 1000pt but the column filled the window and
            // pinned everything to its leading edge, so on a wide Mac the cards
            // sat against the left with all the empty space on the right. The
            // heading travels with them, or the two end up out of line — this is
            // the same rule the web screen uses (max-width + margin-inline auto).
            .frame(maxWidth: HomeGridMetrics.maxWidth + 44)
            .frame(maxWidth: .infinity)
        }
        .background(colorScheme == .dark ? Color(white: 0.08) : Color(white: 0.97))
        // Keyed on the workspace id, not run once on appear: on a cold launch this
        // view can render before the id is known, and a one-shot .task would then
        // leave Home permanently empty with nothing to retry it.
        .task(id: firebaseManager.currentCompanyId) {
            data.startMonitoring()
            let companyId = firebaseManager.currentCompanyId
            guard !companyId.isEmpty else { return }
            store.start(companyId: companyId)
            // The bank feed was only ever started by the Banking screen, so the
            // Banking card sat empty until the user had opened Banking at least
            // once. Home asks for it too; the call returns early when the same
            // listener is already running, so opening both costs nothing.
            if access.bankFeed {
                firebaseManager.startBankFeedRealtime(companyId: companyId, isOwner: true)
            }
            await data.load(manager: firebaseManager, companyId: companyId,
                            wantsInventoryItems: wantsInventoryItems,
                            wantsSetupChecklist: wantsSetupChecklist)
        }
        .onDisappear { data.stop() }
        .alert(t("Edit heading", lang: seciliDil), isPresented: Binding(
            get: { renaming != nil },
            set: { if !$0 { renaming = nil } }
        )) {
            TextField(t("Card heading", lang: seciliDil), text: $renameText)
            Button(t("Save", lang: seciliDil)) {
                if let id = renaming { store.setHeading(id, heading: renameText) }
                renaming = nil
            }
            Button(t("Cancel", lang: seciliDil), role: .cancel) { renaming = nil }
        }
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(t("Home", lang: seciliDil))
                    .font(.system(size: 30, weight: .heavy))
                Text(greeting)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.secondary)
                Text(t("Here's what needs your attention today.", lang: seciliDil))
                    .font(.system(size: 13))
                    .foregroundColor(.secondary.opacity(0.8))
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 8) {
                Button {
                    Task { await data.load(manager: firebaseManager, companyId: firebaseManager.currentCompanyId,
                                          wantsInventoryItems: wantsInventoryItems,
                                          wantsSetupChecklist: wantsSetupChecklist) }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.clockwise").font(.system(size: 9, weight: .bold))
                        Text(syncLabel).font(.system(size: 11))
                    }
                    .foregroundColor(.secondary)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help(t("Try again", lang: seciliDil))
                Button(customising ? t("Done", lang: seciliDil) : t("Customise", lang: seciliDil)) {
                    customising.toggle()
                    draggingID = nil; dropTargetID = nil; dropHole = nil
                }
                .buttonStyle(.bordered)
            }
        }
    }

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        let key = hour < 12 ? "Good morning" : (hour < 18 ? "Good afternoon" : "Good evening")
        let name = (Auth.auth().currentUser?.displayName ?? "")
            .split(separator: " ").first.map(String.init) ?? ""
        return name.isEmpty ? t(key, lang: seciliDil) : "\(t(key, lang: seciliDil)), \(name)"
    }

    private var syncLabel: String {
        if data.offline { return t("Offline — showing the last data this device had.", lang: seciliDil) }
        guard let loaded = data.loadedAt else { return t("Loading…", lang: seciliDil) }
        let minutes = max(1, Int(Date().timeIntervalSince(loaded) / 60))
        return "\(t("Updated", lang: seciliDil)) \(minutes) \(t("min ago", lang: seciliDil))"
    }

    private var saveErrorBanner: some View {
        Text(t("That change could not be saved. Your previous layout is back.", lang: seciliDil))
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(.red)
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.red.opacity(0.08))
            .cornerRadius(10)
    }

    private var customiseBar: some View {
        HStack {
            Text(t("Drag cards to rearrange. Use a card's menu to resize, recolour, rename or hide it.", lang: seciliDil))
                .font(.system(size: 12))
                .foregroundColor(.secondary)
            Spacer()
            Button(t("Reset layout", lang: seciliDil)) { store.resetAll() }
                .buttonStyle(.borderless)
        }
        .padding(12)
        .background(Color.blue.opacity(0.07))
        .cornerRadius(10)
    }

    private var grid: some View {
        GeometryReader { proxy in
            let spacing = HomeGridMetrics.gap
            let available = min(proxy.size.width, HomeGridMetrics.maxWidth)
            let unit = (available - spacing * CGFloat(columnCount - 1)) / CGFloat(columnCount)
            // The row IS the column width at every size, so a 1×1 is a square,
            // a 2×1 is two squares wide and a 2×2 is four squares merged — §2.
            // A fixed row against a much wider column is what made the desktop
            // cards read as squat letterboxes.
            let row = unit
            HomeGrid(
                placements: visible,
                columnCount: columnCount,
                unit: unit,
                rowHeight: row,
                spacing: spacing,
                content: { placement, width, height in
                    cardView(placement)
                        .frame(width: width, height: height)
                        // Clip at the cell, not inside the shell. .frame() fixes the
                        // layout size but a shell whose content is taller still DRAWS
                        // at its natural height — which is how a card ended up painted
                        // over the one below it with no gap between them.
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .opacity(draggingID == placement.id ? 0.5 : 1)
                        .overlay(
                            RoundedRectangle(cornerRadius: 14)
                                .stroke(Color.blue, lineWidth: dropTargetID == placement.id && draggingID != placement.id ? 3 : 0)
                        )
                        // Dragging is offered only in Customise mode: outside it a
                        // long press on a card should still scroll the page.
                        .onDrag(if: customising) {
                            draggingID = placement.id
                            return NSItemProvider(object: placement.id.rawValue as NSString)
                        }
                        .onDrop(of: [.text], isTargeted: Binding(
                            get: { dropTargetID == placement.id },
                            set: { targeted in
                                if targeted { dropTargetID = placement.id }
                                else if dropTargetID == placement.id { dropTargetID = nil }
                            }
                        )) { _ in
                            defer { draggingID = nil; dropTargetID = nil }
                            guard customising,
                                  let moving = draggingID, moving != placement.id,
                                  let from = store.layout.cards.firstIndex(where: { $0.id == moving }),
                                  let to = store.layout.cards.firstIndex(where: { $0.id == placement.id })
                            else { return false }
                            store.move(from: from, to: to)
                            return true
                        }
                },
                gap: { hole, _, _ in
                    HomeGapTarget(hole: hole,
                                  accepts: gapAccepts(hole),
                                  over: dropHole == hole,
                                  isTargeted: Binding(
                                    get: { dropHole == hole },
                                    set: { targeted in
                                        if targeted { dropHole = hole; dropTargetID = nil }
                                        else if dropHole == hole { dropHole = nil }
                                    }),
                                  onDrop: { dropInto(hole) })
                }
            )
            // A drop that lands on neither a card nor a gap still ends the drag,
            // and .onDrag has no completion — so without this the flag stayed
            // set and the card it belonged to stayed at half opacity for good.
            // That is the card that "stays faded after you move it".
            .onDrop(of: [.text], isTargeted: nil) { _ in
                draggingID = nil; dropTargetID = nil; dropHole = nil
                return false
            }
            .onAppear { measuredUnit = unit }
            .onChange(of: proxy.size.width) { width in
                measuredUnit = (min(width, HomeGridMetrics.maxWidth)
                                - spacing * CGFloat(columnCount - 1)) / CGFloat(columnCount)
            }
        }
        .frame(height: gridHeight)
    }

    /// A gap is offered only for a card that actually fits it: showing a 2-wide
    /// card a 1-wide gap is a promise the grid cannot keep.
    private func gapAccepts(_ hole: HomeGridLayout.Hole) -> Bool {
        guard customising, let moving = draggingID,
              let card = store.layout.cards.first(where: { $0.id == moving }) else { return false }
        return min(card.size.columns, columnCount) <= hole.width
    }

    /// The gap sits in front of a card; a card dropped into it takes that place
    /// and pushes the rest along.
    private func dropInto(_ hole: HomeGridLayout.Hole) -> Bool {
        defer { draggingID = nil; dropTargetID = nil; dropHole = nil }
        guard gapAccepts(hole), let moving = draggingID,
              let from = store.layout.cards.firstIndex(where: { $0.id == moving }) else { return false }
        let to = min(hole.index, store.layout.cards.count - 1)
        store.move(from: from, to: to)
        return true
    }

    private var wantsInventoryItems: Bool {
        visible.contains { $0.id == .inventory && $0.size == .twoByTwo }
    }

    private var wantsSetupChecklist: Bool {
        visible.contains { $0.id == .gettingStarted }
    }

    /// The grid lives inside a ScrollView, so it has to state its own height.
    private var gridHeight: CGFloat {
        let rows = HomeGridLayout.rowCount(visible, columnCount: columnCount)
        // Only the phone's row is derived from the width; the reader sees the
        // real height once the grid lays out, and this keeps the ScrollView from
        // clipping in the meantime.
        let row = measuredUnit > 0 ? measuredUnit : rowEstimate
        return CGFloat(rows) * row + CGFloat(max(0, rows - 1)) * HomeGridMetrics.gap
    }

    @ViewBuilder
    private func cardView(_ placement: HomeCardPlacement) -> some View {
        if let definition = HomeCards.definition(placement.id) {
            HomeCardShell(
                definition: definition,
                placement: placement,
                customising: customising,
                compact: isCompact,
                lang: seciliDil,
                // The sheet names the load beside the title on the wide card, and
                // under it on the phone, which has no width to spare for a second
                // thing on that line.
                // The wide stock card names what it is a view of, as the sheet
                // does — the figures alone do not say.
                // How many files there are belongs beside the heading, as the
                // sheet reads it.
                subtitle: definition.id == .files && placement.size != .oneByOne
                    ? "\(firebaseManager.siparisler.flatMap { $0.clientFiles ?? [] }.count) " + t("files", lang: seciliDil)
                    : definition.id == .inventory && placement.size != .oneByOne
                    ? t("Stock overview", lang: seciliDil)
                    : definition.id == .ordersProduction && placement.size == .twoByOne
                    ? t("{count} active", lang: seciliDil)
                        .replacingOccurrences(of: "{count}", with: "\(homeLiveOrders(firebaseManager.siparisler).count)")
                    // The wide schedule card draws a week; the sheet names which
                    // week beside the heading.
                    : definition.id == .schedule && placement.size != .oneByOne
                    ? homeWeekRangeLabel(lang: seciliDil)
                    : "",
                subtitleInline: !isCompact,
                headerPill: definition.id == .banking && !firebaseManager.bankTransactions.isEmpty
                    ? t("Read-only", lang: seciliDil) : "",
                // The sheet puts the feed's freshness on the right of the header
                // for the wide phone card, where the body has no row to spare.
                headerNote: definition.id == .banking && isCompact && placement.size == .twoByOne
                    && !firebaseManager.bankTransactions.isEmpty
                    ? homeSyncLabel(data.bankLastSync, lang: seciliDil) : "",
                onOpen: { onOpen(definition.destination) },
                onOpenSecondary: definition.secondaryDestination.isEmpty
                    ? nil : { onOpen(definition.secondaryDestination) },
                onAdd: definition.id == .files ? { onOpen("Files") }
                    // Not on the square: that size now opens with the composer,
                    // and a + in the header beside it would be a second control
                    // for the one action.
                    : definition.id == .notes && placement.size != .oneByOne ? {
                    // The same route the app-icon shortcut takes: raise the flag
                    // the Notes tab reads, then go there.
                    UserDefaults.standard.set(true, forKey: "pendingQuickActionNewNote")
                    onOpen("Notes")
                }
                    : nil,
                addLabel: definition.id == .notes ? t("New note", lang: seciliDil) : "",
                // Only where there is room to spare. It goes to the Notes
                // screen's own search box with the caret already in it — the
                // card has nowhere to put a results list, and a second search
                // that finds different things would be worse than none.
                onSearch: definition.id == .notes && placement.size == .twoByTwo ? {
                    UserDefaults.standard.set(true, forKey: "pendingQuickActionSearchNotes")
                    onOpen("Notes")
                } : nil,
                onResize: { store.resize(placement.id, to: $0) },
                onPeriod: { store.setPeriod(placement.id, period: $0) },
                onTone: { store.setTone(placement.id, tone: $0) },
                onRename: { renameText = placement.heading; renaming = placement.id },
                onHide: { store.hide(placement.id) },
                onReset: { store.reset(placement.id) },
                onMove: { direction in
                    if let index = store.layout.cards.firstIndex(where: { $0.id == placement.id }) {
                        store.move(from: index, to: index + direction)
                    }
                },
                content: {
                    HomeCardBody(
                        id: placement.id,
                        size: placement.size,
                        lang: seciliDil,
                        currency: seciliParaBirimi,
                        decimal: seciliOndalik,
                        stepsJSON: customStepsJSON,
                        compact: isCompact,
                        period: placement.period,
                        access: access,
                        data: data,
                        onNewOrder: onNewOrder,
                        onOpen: onOpen,
                        setupSkipped: store.setupSkipped,
                        onSkipSetupStep: { store.skipSetupStep($0) },
                        onRestoreSetupSkipped: { store.restoreSkippedSetupSteps() }
                    )
                    .environmentObject(firebaseManager)
                }
            )
        }
    }

    private var galleryRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(t("Add a card", lang: seciliDil))
                .font(.system(size: 14, weight: .bold))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(gallery, id: \.id) { definition in
                        Button("+ \(t(definition.title, lang: seciliDil))") { store.show(definition.id) }
                            .buttonStyle(.bordered)
                    }
                }
            }
        }
    }
}


private extension View {
    /// `.onDrag` has no "sometimes" — attaching it unconditionally would make a
    /// long press on any card start a drag even when the user is only reading.
    @ViewBuilder
    func onDrag(if enabled: Bool, _ provider: @escaping () -> NSItemProvider) -> some View {
        if enabled { self.onDrag(provider) } else { self }
    }
}


/// One row's height and the gutter between cards.
///
/// The grid places cards at fixed offsets, so the row height has to be the one
/// the tallest card actually needs — a row shorter than its content does not
/// shrink the card, it lets the card paint over its neighbour.
/// A gap in the grid, offered only while a card that fits it is in the air.
/// Dashed rather than filled: it is a place to put something, not a card.
struct HomeGapTarget: View {
    let hole: HomeGridLayout.Hole
    let accepts: Bool
    let over: Bool
    let isTargeted: Binding<Bool>
    let onDrop: () -> Bool

    var body: some View {
        RoundedRectangle(cornerRadius: 16)
            .strokeBorder(over ? Color.blue : Color.primary.opacity(0.18),
                          style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
            .background(RoundedRectangle(cornerRadius: 16)
                .fill(over ? Color.blue.opacity(0.08) : Color.clear))
            .opacity(accepts ? 1 : 0)
            .allowsHitTesting(accepts)
            .onDrop(of: [.text], isTargeted: isTargeted) { _ in onDrop() }
    }
}

enum HomeGridMetrics {
    static let rowHeight: CGFloat = 236
    static let gap: CGFloat = 16
    /// The row is the column width, so the only way to keep a 1×1 a *small*
    /// square is to stop the column growing with the window. Four columns in
    /// 1000pt is a 238pt square — the height the cards always had, now with a
    /// width to match instead of a letterbox twice as wide.
    static let maxWidth: CGFloat = 1000
}

// MARK: - Grid


/// Shelf packing for the Home grid.
enum HomeGridLayout {
    /// Placement is arithmetic, not rendering, so it lives outside the generic
    /// view — a static member of HomeGrid<Content> cannot be called without
    /// naming a Content the caller does not have.
    static func slots(_ placements: [HomeCardPlacement], columnCount: Int,
                      rowSpan: (HomeCardPlacement) -> Int = { $0.size.rows }) -> [(HomeCardPlacement, Int, Int)] {
        packed(placements, columnCount: columnCount, rowSpan: rowSpan).slots
            .map { ($0.placement, $0.row, $0.column) }
    }

    struct Slot { let placement: HomeCardPlacement; let index: Int; let row: Int; let column: Int
                  let width: Int; let height: Int }
    /// A run of free cells with a card after it, and where a card dropped into
    /// it goes in the list.
    struct Hole: Hashable { let row: Int; let column: Int; let width: Int; let index: Int }

    /// Where the cards land, and where the holes are.
    ///
    /// The rule is the web grid's own sparse auto-placement, and the one the
    /// comment above HomeGrid has always described: a card that does not fit
    /// the space left on a row starts the next one, and the cursor never goes
    /// backwards. This searched from row 0 for every card instead, which
    /// quietly backfilled a hole with a later card — the same layout drew one
    /// way here and another in a browser, and a card dragged to the end could
    /// land at the top.
    static func packed(_ placements: [HomeCardPlacement], columnCount: Int,
                       rowSpan: (HomeCardPlacement) -> Int = { $0.size.rows })
        -> (slots: [Slot], holes: [Hole], rows: Int) {
        var occupancy: [Int: Set<Int>] = [:]
        var slots: [Slot] = []
        var cursorRow = 0
        var cursorColumn = 0
        for (index, placement) in placements.enumerated() {
            let width = min(placement.size.columns, columnCount)
            let height = rowSpan(placement)
            var row = cursorRow
            var column = cursorColumn
            while true {
                if column + width > columnCount { row += 1; column = 0; continue }
                let fits = (0..<height).allSatisfy { rowOffset in
                    (0..<width).allSatisfy { columnOffset in
                        !(occupancy[row + rowOffset] ?? []).contains(column + columnOffset)
                    }
                }
                if fits { break }
                column += 1
            }
            for rowOffset in 0..<height {
                for columnOffset in 0..<width {
                    occupancy[row + rowOffset, default: []].insert(column + columnOffset)
                }
            }
            slots.append(Slot(placement: placement, index: index, row: row, column: column,
                              width: width, height: height))
            cursorRow = row
            cursorColumn = column + width
        }

        let rows = slots.map { $0.row + $0.height }.max() ?? 0
        // A free cell is only a hole if something comes after it: the space at
        // the end of the last row is where the list stops, not a gap in it.
        // Broken up on purpose: as one expression the type-checker gives up.
        var lastCell = -1
        for slot in slots {
            let bottomRow: Int = slot.row + slot.height - 1
            let rightColumn: Int = slot.column + slot.width - 1
            let cell: Int = bottomRow * columnCount + rightColumn
            if cell > lastCell { lastCell = cell }
        }
        var holes: [Hole] = []
        for row in 0..<max(0, rows) {
            var column = 0
            while column < columnCount {
                let taken = (occupancy[row] ?? []).contains(column)
                if taken || row * columnCount + column > lastCell { column += 1; continue }
                var width = 0
                while column + width < columnCount
                        && !(occupancy[row] ?? []).contains(column + width)
                        && row * columnCount + column + width <= lastCell {
                    width += 1
                }
                let after = slots.first { $0.row > row || ($0.row == row && $0.column >= column + width) }
                holes.append(Hole(row: row, column: column, width: width,
                                  index: after?.index ?? placements.count))
                column += width
            }
        }
        return (slots, holes, rows)
    }

    static func rowCount(_ placements: [HomeCardPlacement], columnCount: Int,
                         rowSpan: @escaping (HomeCardPlacement) -> Int = { $0.size.rows }) -> Int {
        slots(placements, columnCount: columnCount, rowSpan: rowSpan)
            .map { $0.1 + rowSpan($0.0) }
            .max() ?? 0
    }

}

/// A shelf-packing grid: cards keep their order and a 2-wide card that does not
/// fit the remaining space starts the next row. SwiftUI's LazyVGrid cannot span
/// two rows, and §2 needs 2×2, so the placement is done here.
struct HomeGrid<Content: View, Gap: View>: View {
    let placements: [HomeCardPlacement]
    let columnCount: Int
    let unit: CGFloat
    /// One row's height. The phone passes its column width so a 1×1 is square.
    let rowHeight: CGFloat
    let spacing: CGFloat
    @ViewBuilder let content: (HomeCardPlacement, CGFloat, CGFloat) -> Content
    /// What to draw in a gap. Until this existed the only thing a card could be
    /// dropped on was another card, so a hole in the grid just sat there.
    @ViewBuilder let gap: (HomeGridLayout.Hole, CGFloat, CGFloat) -> Gap

    var body: some View {
        let packed = HomeGridLayout.packed(placements, columnCount: columnCount)
        ZStack(alignment: .topLeading) {
            ForEach(packed.holes, id: \.self) { hole in
                let gapWidth = unit * CGFloat(hole.width) + spacing * CGFloat(hole.width - 1)
                gap(hole, gapWidth, rowHeight)
                    .frame(width: gapWidth, height: rowHeight)
                    .offset(x: (unit + spacing) * CGFloat(hole.column),
                            y: (rowHeight + spacing) * CGFloat(hole.row))
            }
            ForEach(packed.slots, id: \.placement.id) { slot in
                let cardWidth = unit * CGFloat(slot.width) + spacing * CGFloat(slot.width - 1)
                let cardHeight = rowHeight * CGFloat(slot.height) + spacing * CGFloat(slot.height - 1)
                content(slot.placement, cardWidth, cardHeight)
                    .offset(x: (unit + spacing) * CGFloat(slot.column),
                            y: (rowHeight + spacing) * CGFloat(slot.row))
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }
}
