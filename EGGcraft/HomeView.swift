import Combine
import Foundation
import UniformTypeIdentifiers
import Network
import FirebaseAuth
import FirebaseFirestore
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

    func load(manager: FirebaseManager, companyId: String, wantsInventoryItems: Bool = false) async {
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
        if !nextStages.isEmpty { stages = nextStages }
        loadedAt = Date()
        listenNotes(companyId: companyId)
        listenBankHealth(companyId: companyId)
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
                            wantsInventoryItems: wantsInventoryItems)
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
                                          wantsInventoryItems: wantsInventoryItems) }
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
                }
            )
            .onAppear { measuredUnit = unit }
            .onChange(of: proxy.size.width) { width in
                measuredUnit = (min(width, HomeGridMetrics.maxWidth)
                                - spacing * CGFloat(columnCount - 1)) / CGFloat(columnCount)
            }
        }
        .frame(height: gridHeight)
    }

    private var wantsInventoryItems: Bool {
        visible.contains { $0.id == .inventory && $0.size == .twoByTwo }
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
                subtitle: definition.id == .inventory && placement.size != .oneByOne
                    ? t("Stock overview", lang: seciliDil)
                    : definition.id == .ordersProduction && placement.size == .twoByOne
                    ? t("{count} active", lang: seciliDil)
                        .replacingOccurrences(of: "{count}", with: "\(homeLiveOrders(firebaseManager.siparisler).count)")
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
                onAdd: definition.id == .notes ? {
                    // The same route the app-icon shortcut takes: raise the flag
                    // the Notes tab reads, then go there.
                    UserDefaults.standard.set(true, forKey: "pendingQuickActionNewNote")
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
                        onOpen: onOpen
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
        var placed: [(HomeCardPlacement, Int, Int)] = []
        // occupancy[row] is a bitmask of the columns already taken on that row.
        var occupancy: [Int: Set<Int>] = [:]
        for placement in placements {
            let width = min(placement.size.columns, columnCount)
            let height = rowSpan(placement)
            var row = 0
            var column = 0
            outer: while true {
                for candidate in 0...(max(0, columnCount - width)) {
                    let fits = (0..<height).allSatisfy { rowOffset in
                        (0..<width).allSatisfy { columnOffset in
                            !(occupancy[row + rowOffset] ?? []).contains(candidate + columnOffset)
                        }
                    }
                    if fits { column = candidate; break outer }
                }
                row += 1
            }
            for rowOffset in 0..<height {
                for columnOffset in 0..<width {
                    occupancy[row + rowOffset, default: []].insert(column + columnOffset)
                }
            }
            placed.append((placement, row, column))
        }
        return placed
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
struct HomeGrid<Content: View>: View {
    let placements: [HomeCardPlacement]
    let columnCount: Int
    let unit: CGFloat
    /// One row's height. The phone passes its column width so a 1×1 is square.
    let rowHeight: CGFloat
    let spacing: CGFloat
    @ViewBuilder let content: (HomeCardPlacement, CGFloat, CGFloat) -> Content

    var body: some View {
        ZStack(alignment: .topLeading) {
            ForEach(HomeGridLayout.slots(placements, columnCount: columnCount), id: \.0.id) { entry in
                let (placement, row, column) = entry
                let width = min(placement.size.columns, columnCount)
                let cardWidth = unit * CGFloat(width) + spacing * CGFloat(width - 1)
                let span = placement.size.rows
                let cardHeight = rowHeight * CGFloat(span) + spacing * CGFloat(span - 1)
                content(placement, cardWidth, cardHeight)
                    .offset(x: (unit + spacing) * CGFloat(column),
                            y: (rowHeight + spacing) * CGFloat(row))
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }
}
