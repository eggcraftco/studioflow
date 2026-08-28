import SwiftUI

// Everything one inventory item knows about itself, in one sheet. The list
// answers "what do we have"; this answers "what is THIS — where did it come
// from, what is it promised to, what happened to it". Mirrors the web's
// ItemDetailPanel: same sections, same words, same server calls.


struct ItemDetailSheet: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    let currencySymbol: String
    let lang: String
    let canEdit: Bool
    /// Defined location paths plus every location already in use — offered by
    /// the Move / Change Location editor. Free text still works.
    let locationSuggestions: [String]
    /// The workspace's own category names, passed on to the edit form.
    let categoryOptions: [String]
    let defaultCategory: String
    let onChanged: () -> Void

    @State private var item: InventoryItem
    @State private var movements: [InventoryMovement]?
    @State private var libraryFiles: [LibraryFile]?
    @State private var busy = false
    @State private var error = ""
    @State private var editing = false
    @State private var duplicating: InventoryItem?
    @State private var showPhotos = false
    @State private var showReserve = false
    @State private var recordingLoss = false
    @State private var movingLocation = false
    @State private var locationDraft = ""
    @FocusState private var locationFocused: Bool

    init(item: InventoryItem, currencySymbol: String, lang: String, canEdit: Bool, locationSuggestions: [String] = [], categoryOptions: [String] = [], defaultCategory: String = "", onChanged: @escaping () -> Void) {
        _item = State(initialValue: item)
        _locationDraft = State(initialValue: item.location)
        self.currencySymbol = currencySymbol
        self.lang = lang
        self.canEdit = canEdit
        self.locationSuggestions = locationSuggestions
        self.categoryOptions = categoryOptions
        self.defaultCategory = defaultCategory
        self.onChanged = onChanged
    }

    private var cardBackground: Color { colorScheme == .dark ? Color.white.opacity(0.05) : Color.white }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    header

                    if !error.isEmpty {
                        Text(error).font(.system(size: 12)).foregroundColor(.red)
                    }

                    linkedToCard
                    basicInformationCard
                    purchaseInfoCard
                    inventoryDetailsCard
                    if canEdit { quickActionsCard }
                    historyCard
                    filesCard
                }
                .padding(16)
            }
            .navigationTitle(t("Item details", lang: lang))
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(t("Close", lang: lang)) { dismiss() }
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 480, minHeight: 620)
        #endif
        .task {
            await loadMovements()
            await loadLibraryFiles()
        }
        .sheet(isPresented: $editing) {
            NewInventoryItemSheet(currencySymbol: currencySymbol, lang: lang, existing: item, itemId: item.id, locationSuggestions: locationSuggestions, categoryOptions: categoryOptions, defaultCategory: defaultCategory) {
                Task { await refresh() }
            }
            .environmentObject(firebaseManager)
        }
        .sheet(item: $duplicating) { source in
            NewInventoryItemSheet(currencySymbol: currencySymbol, lang: lang, existing: source, itemId: "", locationSuggestions: locationSuggestions, categoryOptions: categoryOptions, defaultCategory: defaultCategory) {
                Task { await refresh() }
            }
            .environmentObject(firebaseManager)
        }
        .sheet(isPresented: $showPhotos) {
            ItemPhotosSheet(item: item, lang: lang, canEdit: canEdit) {
                Task { await refresh() }
            }
            .environmentObject(firebaseManager)
        }
        .sheet(isPresented: $showReserve) {
            ReserveForOrderSheet(item: item, lang: lang) {
                Task { await refresh() }
            }
            .environmentObject(firebaseManager)
        }
    }

    // MARK: Sections

    private var header: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(item.name).font(.system(size: 18, weight: .bold))
                Text(item.number).font(.system(size: 12)).foregroundColor(.secondary)
            }
            Spacer()
            statusPill
        }
    }

    // Same pill as the list rows, so status reads the same everywhere.
    private var statusPill: some View {
        let low = item.isLowStock && item.status == .available
        let text = low ? t("Low Stock", lang: lang) : t(item.status.label, lang: lang)
        let colour: Color = low ? .orange : {
            switch item.status {
            case .available: return .green
            case .reserved: return .orange
            // Partly promised is a milder fact than fully promised, so the
            // chip is a lighter shade of the same reserved amber.
            case .partiallyReserved: return .orange.opacity(0.7)
            case .incoming: return .blue
            default: return .gray
            }
        }()
        return Text(text)
            .font(.system(size: 10, weight: .bold))
            .padding(.horizontal, 7).padding(.vertical, 2)
            .background(Capsule().fill(colour.opacity(0.14)))
            .foregroundColor(colour)
    }

    private var linkedToCard: some View {
        card(t("Linked To", lang: lang)) {
            if item.reservations.isEmpty {
                Text(t("Not linked to any order", lang: lang))
                    .font(.system(size: 12)).foregroundColor(.secondary)
                if canEdit && item.freeToReserve > 0 {
                    Button(t("Reserve for Order", lang: lang)) { showReserve = true }
                        .font(.system(size: 12, weight: .semibold))
                        .buttonStyle(.plain).foregroundColor(.blue)
                        .disabled(busy)
                }
            } else {
                ForEach(item.reservations, id: \.orderId) { row in
                    HStack(spacing: 8) {
                        Text(reservationLabel(row))
                            .font(.system(size: 12, weight: .semibold))
                        Spacer()
                        if canEdit {
                            Button(t("Release", lang: lang)) { release(row) }
                                .font(.system(size: 11, weight: .semibold))
                                .buttonStyle(.plain).foregroundColor(.red)
                                .disabled(busy)
                        }
                    }
                }
            }
        }
    }

    private var basicInformationCard: some View {
        card(t("Basic Information", lang: lang)) {
            detailRow(t("Category", lang: lang), t(item.category, lang: lang))
            if !item.brand.isEmpty { detailRow(t("Brand", lang: lang), item.brand) }
            if !item.model.isEmpty { detailRow(t("Model", lang: lang), item.model) }
            if !item.reference.isEmpty { detailRow(t("Reference", lang: lang), item.reference) }
            if !item.serialNumber.isEmpty { detailRow(t("Serial Number", lang: lang), item.serialNumber) }
            if !item.sku.isEmpty { detailRow(t("SKU", lang: lang), item.sku) }
            if !item.year.isEmpty { detailRow(t("Year", lang: lang), item.year) }
            if !item.condition.isEmpty { detailRow(t("Condition", lang: lang), item.condition) }
            if !item.tags.isEmpty {
                ItemTagChips(label: t("Tags", lang: lang), tags: item.tags)
            }
            if !item.description.isEmpty {
                Text(item.description).font(.system(size: 11)).foregroundColor(.secondary)
            }
        }
    }

    private var purchaseInfoCard: some View {
        let hasPurchase = !item.supplierName.isEmpty || !item.purchaseDate.isEmpty
            || !item.purchaseNumber.isEmpty || item.purchasePrice > 0
        return card(t("Purchase Info", lang: lang)) {
            if hasPurchase {
                if !item.supplierName.isEmpty { detailRow(t("Supplier", lang: lang), item.supplierName) }
                if !item.purchaseNumber.isEmpty { detailRow(t("Purchase", lang: lang), item.purchaseNumber) }
                if !item.purchaseDate.isEmpty { detailRow(t("Purchase date", lang: lang), item.purchaseDate) }
                detailRow(t("Purchase price", lang: lang), inventoryMoney(currencySymbol, item.purchasePrice))
            } else {
                Text(t("No purchase recorded", lang: lang))
                    .font(.system(size: 12)).foregroundColor(.secondary)
            }
        }
    }

    private var inventoryDetailsCard: some View {
        card(t("Inventory Details", lang: lang)) {
            detailRow(t("Tracking Type", lang: lang),
                      item.trackingType == .unique ? t("Unique Item", lang: lang) : t("Quantity Item", lang: lang))
            detailRow(t("On Hand", lang: lang),
                      formatQuantity(item.displayOnHand)
                      + (item.trackingType == .quantity && !item.unit.isEmpty ? " \(item.unit)" : ""))

            if movingLocation {
                HStack(spacing: 8) {
                    Text(t("Location", lang: lang)).font(.system(size: 11, weight: .semibold)).foregroundColor(.secondary)
                    LocationFieldWithSuggestions(
                        location: $locationDraft,
                        lang: lang,
                        placeholder: t("Safe A, Drawer 3…", lang: lang),
                        suggestions: locationSuggestions,
                        focus: $locationFocused
                    )
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 12))
                    Button(t("Save", lang: lang)) { saveLocation() }
                        .font(.system(size: 11, weight: .semibold))
                        .buttonStyle(.plain).foregroundColor(.blue)
                        .disabled(busy)
                    Button(t("Cancel", lang: lang)) {
                        movingLocation = false
                        locationDraft = item.location
                    }
                    .font(.system(size: 11)).buttonStyle(.plain).foregroundColor(.secondary)
                }
            } else {
                detailRow(t("Location", lang: lang), item.location.isEmpty ? "—" : item.location)
            }

            if !item.purchaseDate.isEmpty {
                detailRow(t("Acquisition Date", lang: lang), item.purchaseDate)
            }
            detailRow(t("Value", lang: lang),
                      item.ownership == .customer
                        ? t("Customer's", lang: lang)
                        : inventoryMoney(currencySymbol, item.lineValue))
            if item.currentValueEst > 0 {
                detailRow(t("Current value (est.)", lang: lang), inventoryMoney(currencySymbol, item.currentValueEst))
            }
            Text(item.notes.isEmpty ? t("No notes yet.", lang: lang) : item.notes)
                .font(.system(size: 11)).foregroundColor(.secondary)
        }
    }

    private var quickActionsCard: some View {
        card(t("Quick Actions", lang: lang)) {
            // Wrapping rows of small bordered buttons — same idea as the web
            // panel's action grid.
            FlowingActionButtons(buttons: quickActions)
            if recordingLoss {
                RecordLossForm(item: item, lang: lang, onRecorded: {
                    recordingLoss = false
                    Task { await refresh() }
                }, onCancel: { recordingLoss = false })
            }
        }
    }

    private var quickActions: [(String, () -> Void)] {
        var actions: [(String, () -> Void)] = [
            (t("Edit Item", lang: lang), { editing = true }),
            (t("Move / Change Location", lang: lang), {
                movingLocation = true
                locationFocused = true
            })
        ]
        // Only the transitions the server will accept (its STATUS_TRANSITIONS
        // map) — a button the callable refuses is a dead end, not a feature.
        if item.allowedNextStatuses.contains(.sold) {
            actions.append((t("Mark as Sold", lang: lang), { setStatus(.sold) }))
        }
        if item.allowedNextStatuses.contains(.used) {
            actions.append((t("Mark as Used", lang: lang), { setStatus(.used) }))
        }
        // A loss can only be recorded for something still in the story —
        // sold, used, removed and archived items are already accounted for.
        if ![.sold, .used, .removed, .archived].contains(item.status) {
            actions.append((t("Record a Loss…", lang: lang), { recordingLoss.toggle() }))
        }
        actions.append((t("Duplicate Item", lang: lang), { duplicating = duplicateSource() }))
        actions.append((t("Manage photos", lang: lang), { showPhotos = true }))
        return actions
    }

    private var historyCard: some View {
        card(t("History", lang: lang)) {
            if let movements {
                if movements.isEmpty {
                    Text(t("No movements recorded for this item yet.", lang: lang))
                        .font(.system(size: 12)).foregroundColor(.secondary)
                } else {
                    ForEach(movements) { row in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(t(row.kindLabel, lang: lang)).font(.system(size: 12, weight: .semibold))
                                Text((row.delta > 0 ? "+" : "") + formatQuantity(row.delta))
                                    .font(.system(size: 12))
                                Spacer()
                                Text(inventoryMoney(currencySymbol, abs(row.valueDelta)))
                                    .font(.system(size: 12, weight: .semibold))
                            }
                            Text([
                                Date(timeIntervalSince1970: row.at / 1000)
                                    .formatted(date: .abbreviated, time: .shortened),
                                row.byEmail,
                                row.note
                            ].filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.system(size: 10)).foregroundColor(.secondary)
                        }
                        if row.id != movements.last?.id { Divider() }
                    }
                }
            } else {
                Text(t("Loading…", lang: lang)).font(.system(size: 12)).foregroundColor(.secondary)
            }
        }
    }

    // Read-only window onto the central Files library — linking and unlinking
    // happen there, this card only shows what already points at this item.
    private var filesCard: some View {
        card(t("Files", lang: lang)) {
            if let libraryFiles {
                if libraryFiles.isEmpty {
                    Text(t("No library files are linked to this item. Certificates, valuations and receipts linked in the Files library appear here.", lang: lang))
                        .font(.system(size: 12)).foregroundColor(.secondary)
                } else {
                    ForEach(libraryFiles) { file in
                        Button { openLibraryFile(file) } label: {
                            HStack(spacing: 8) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(file.displayName).font(.system(size: 12, weight: .semibold))
                                    Text([
                                        fileSizeText(file.fileSize),
                                        Date(timeIntervalSince1970: file.updatedAtMs / 1000)
                                            .formatted(date: .abbreviated, time: .shortened)
                                    ].joined(separator: " · "))
                                        .font(.system(size: 10)).foregroundColor(.secondary)
                                }
                                Spacer()
                                Image(systemName: "arrow.up.right.square")
                                    .font(.system(size: 12)).foregroundColor(.secondary)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if file.id != libraryFiles.last?.id { Divider() }
                    }
                }
            } else {
                Text(t("Loading…", lang: lang)).font(.system(size: 12)).foregroundColor(.secondary)
            }
        }
    }

    // MARK: Building blocks

    private func reservationLabel(_ row: InventoryReservation) -> String {
        var label = t("Order", lang: lang) + " " + String(row.orderId.prefix(8)) + "…"
        if item.trackingType == .quantity {
            label += " · " + formatQuantity(row.quantity)
            if !item.unit.isEmpty { label += " " + item.unit }
        }
        return label
    }

    private func card<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.system(size: 11, weight: .bold)).foregroundColor(.secondary)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12).fill(cardBackground))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.gray.opacity(0.16)))
    }

    private func detailRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(label).font(.system(size: 11, weight: .semibold)).foregroundColor(.secondary)
            Spacer(minLength: 8)
            Text(value).font(.system(size: 12)).multilineTextAlignment(.trailing)
        }
    }

    // MARK: Actions

    private func run(_ action: @escaping () async throws -> Void) {
        busy = true
        error = ""
        Task {
            do {
                try await action()
                await refresh()
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }

    /// Pulls the item fresh after any change, so the sheet never shows a state
    /// the server has already moved past. Tells the list to reload too.
    private func refresh() async {
        do {
            let items = try await firebaseManager.loadInventoryItems()
            if let fresh = items.first(where: { $0.id == item.id }) {
                item = fresh
                if !movingLocation { locationDraft = fresh.location }
            }
        } catch {
            self.error = error.localizedDescription
        }
        await loadMovements()
        onChanged()
    }

    private func loadMovements() async {
        do { movements = try await firebaseManager.loadInventoryMovements(itemId: item.id) }
        catch { movements = [] }
    }

    private func loadLibraryFiles() async {
        do { libraryFiles = try await firebaseManager.loadLibraryFiles(linkKey: "inventoryItem:\(item.id)") }
        catch { libraryFiles = [] }
    }

    private func fileSizeText(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }

    private func openLibraryFile(_ file: LibraryFile) {
        guard !file.storagePath.isEmpty else { return }
        Task {
            do {
                let url = try await firebaseManager.libraryFileURL(file.storagePath)
                #if os(macOS)
                NSWorkspace.shared.open(url)
                #else
                await UIApplication.shared.open(url)
                #endif
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func saveLocation() {
        run {
            // The server rebuilds the WHOLE document from the input — a
            // location-only payload would blank every other field, so the full
            // item travels with just the location swapped.
            var input = item.inventoryItemInput
            input["location"] = locationDraft
            try await firebaseManager.saveInventoryItem(input, itemId: item.id)
            movingLocation = false
        }
    }

    private func setStatus(_ status: InventoryStatus) {
        run { try await firebaseManager.setInventoryItemStatus(item.id, status: status) }
    }

    private func release(_ reservation: InventoryReservation) {
        run { try await firebaseManager.releaseStock(itemId: item.id, orderId: reservation.orderId) }
    }

    /// A fresh identity: the server assigns a new INV number; the serial number,
    /// item number, photos, reservations and purchase link are the things that
    /// must never travel to a second object.
    private func duplicateSource() -> InventoryItem? {
        var raw = item.inventoryItemInput
        raw["id"] = ""
        raw["number"] = ""
        raw["serialNumber"] = ""
        raw["photos"] = [String]()
        raw["status"] = "available"
        raw["quantity"] = [
            "onHand": item.trackingType == .quantity ? item.onHand : 1,
            "unit": item.trackingType == .quantity ? item.unit : ""
        ]
        return InventoryItem(raw)
    }
}

/// Read-only tag chips for the detail card — the same words the item form's
/// editor writes, shown without the ×. Its own struct: deepening view nesting
/// is a known real-iPhone crash class in this codebase.
private struct ItemTagChips: View {
    let label: String
    let tags: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.system(size: 11, weight: .semibold)).foregroundColor(.secondary)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 90), spacing: 6)], alignment: .leading, spacing: 6) {
                ForEach(tags, id: \.self) { tag in
                    Text(tag)
                        .font(.system(size: 11, weight: .semibold))
                        .lineLimit(1)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(Capsule().fill(Color.blue.opacity(0.12)))
                        .foregroundColor(.blue)
                }
            }
        }
    }
}

/// Small bordered action buttons that wrap onto as many rows as they need.
private struct FlowingActionButtons: View {
    let buttons: [(String, () -> Void)]

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 8)], alignment: .leading, spacing: 8) {
            ForEach(Array(buttons.enumerated()), id: \.offset) { entry in
                Button(entry.element.0) { entry.element.1() }
                    .font(.system(size: 12, weight: .semibold))
                    .buttonStyle(.bordered)
            }
        }
    }
}

// The inline "Record a Loss…" form — its own struct, not a nested builder,
// because deepening view nesting is a known real-iPhone crash class in this
// codebase. The reason picker is the point: the ledger line the call writes
// carries the reason as its kind, so "where did that stock go" has an answer
// months later. The server enforces the rules (refuses a reserved unique item,
// refuses a quantity that would cut into reserved stock).
private struct RecordLossForm: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    let item: InventoryItem
    let lang: String
    let onRecorded: () -> Void
    let onCancel: () -> Void

    @State private var kind = "damaged"
    @State private var quantityText = "1"
    @State private var note = ""
    @State private var busy = false
    @State private var error = ""

    private var quantity: Double {
        Double(quantityText.replacingOccurrences(of: ",", with: ".")) ?? 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()
            HStack(spacing: 8) {
                Text(t("Loss reason", lang: lang))
                    .font(.system(size: 11, weight: .semibold)).foregroundColor(.secondary)
                Picker(t("Loss reason", lang: lang), selection: $kind) {
                    Text(t("Damaged", lang: lang)).tag("damaged")
                    Text(t("Lost", lang: lang)).tag("lost")
                    Text(t("Returned to supplier", lang: lang)).tag("returned")
                    Text(t("Wastage", lang: lang)).tag("wastage")
                }
                .pickerStyle(.menu)
                .labelsHidden()
                .font(.system(size: 12))
            }
            if item.trackingType == .quantity {
                HStack(spacing: 8) {
                    Text(t("Quantity lost", lang: lang))
                        .font(.system(size: 11, weight: .semibold)).foregroundColor(.secondary)
                    TextField("1", text: $quantityText)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 12))
                        .frame(maxWidth: 90)
                    if !item.unit.isEmpty {
                        Text(item.unit).font(.system(size: 11)).foregroundColor(.secondary)
                    }
                }
            }
            TextField(t("What happened? (optional)", lang: lang), text: $note)
                .textFieldStyle(.roundedBorder)
                .font(.system(size: 12))
            HStack(spacing: 10) {
                Button(busy ? t("Saving…", lang: lang) : t("Record the loss", lang: lang)) { submit() }
                    .font(.system(size: 12, weight: .semibold))
                    .buttonStyle(.bordered)
                    .disabled(busy || (item.trackingType == .quantity && quantity <= 0))
                Button(t("Cancel", lang: lang)) { onCancel() }
                    .font(.system(size: 11)).buttonStyle(.plain).foregroundColor(.secondary)
                    .disabled(busy)
            }
            if !error.isEmpty {
                Text(error).font(.system(size: 11)).foregroundColor(.red)
            }
        }
    }

    private func submit() {
        busy = true
        error = ""
        Task {
            do {
                try await firebaseManager.recordInventoryLoss(
                    itemId: item.id,
                    kind: kind,
                    quantity: item.trackingType == .quantity ? quantity : nil,
                    note: note
                )
                onRecorded()
            } catch {
                self.error = error.localizedDescription
                busy = false
            }
        }
    }
}

// The inventory-side reserve flow. The one rule that matters: reservations go
// through reserveInventoryForOrder, which writes the reservation arrays — a
// bare status flip to "reserved" links nothing and is invisible to the order.
struct ReserveForOrderSheet: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @Environment(\.dismiss) private var dismiss
    let item: InventoryItem
    let lang: String
    let onReserved: () -> Void

    @State private var orderId = ""
    @State private var quantityText = ""
    @State private var busy = false
    @State private var error = ""

    init(item: InventoryItem, lang: String, onReserved: @escaping () -> Void) {
        self.item = item
        self.lang = lang
        self.onReserved = onReserved
        _quantityText = State(initialValue: formatQuantity(item.freeToReserve))
    }

    private var free: Double { item.freeToReserve }

    private var wanted: Double {
        item.trackingType == .unique
            ? 1
            : Double(quantityText.replacingOccurrences(of: ",", with: ".")) ?? 0
    }

    private var itemLine: String {
        var line = item.name + " · " + item.number
        if item.trackingType == .quantity {
            line += " · " + t("free", lang: lang) + ": " + formatQuantity(free)
            if !item.unit.isEmpty { line += " " + item.unit }
        }
        return line
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(itemLine)
                        .font(.system(size: 12)).foregroundColor(.secondary)
                }

                Section {
                    Picker(t("Order", lang: lang), selection: $orderId) {
                        Text(t("Choose an order…", lang: lang)).tag("")
                        ForEach(firebaseManager.siparisler) { order in
                            Text("\(order.customerName) — \(order.designName)").tag(order.id ?? "")
                        }
                    }
                    if item.trackingType == .quantity {
                        TextField(t("Quantity", lang: lang), text: $quantityText)
                    }
                }

                if !error.isEmpty {
                    Text(error).font(.system(size: 12)).foregroundColor(.red)
                }
            }
            .navigationTitle(t("Reserve for Order", lang: lang))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(t("Cancel", lang: lang)) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? t("Saving…", lang: lang) : t("Reserve", lang: lang)) { submit() }
                        .disabled(busy || orderId.isEmpty || wanted <= 0)
                }
            }
        }
    }

    private func submit() {
        guard !orderId.isEmpty else {
            error = t("Choose an order first.", lang: lang)
            return
        }
        busy = true
        error = ""
        // Capped at what can honestly be promised: on hand minus what other
        // orders already hold.
        let quantity = item.trackingType == .unique ? 1 : min(wanted, free)
        Task {
            do {
                try await firebaseManager.reserveStock(itemId: item.id, orderId: orderId, quantity: quantity)
                onReserved()
                dismiss()
            } catch {
                self.error = error.localizedDescription
                busy = false
            }
        }
    }
}
