import SwiftUI

// The entry forms. The first decision in the item sheet is the one that changes
// everything below it, so it is asked first and the form redraws around the
// answer: a unique object carries identity (serial, condition, year) and a
// counted material carries an amount and a reorder point.


private func parseAmount(_ text: String) -> Double {
    Double(text.replacingOccurrences(of: ",", with: ".").filter { "0123456789.".contains($0) }) ?? 0
}


// Prefills must round-trip: the server stores up to 4 decimal places, and a
// 2dp display format here would silently rewrite onHand/prices on any edit.
private func editPrecise(_ value: Double) -> String {
    if value == value.rounded() { return String(Int(value)) }
    var text = String(format: "%.4f", value)
    while text.hasSuffix("0") { text.removeLast() }
    if text.hasSuffix(".") { text.removeLast() }
    return text
}

struct NewInventoryItemSheet: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @Environment(\.dismiss) private var dismiss
    let currencySymbol: String
    let lang: String
    /// When set, the form opens prefilled from this item. With a non-empty
    /// `itemId` that is an edit; with an empty one it is a duplicate — the
    /// server assigns a fresh INV number.
    let existing: InventoryItem?
    let itemId: String
    /// Every tag already in use across the shelf, offered as one-tap
    /// suggestions. Empty where the caller has no list at hand.
    let tagSuggestions: [String]
    /// Defined location paths plus every location already in use, offered
    /// beside the Location field. Free text still works.
    let locationSuggestions: [String]
    /// The workspace's own category names, so this picker says what the
    /// sidebar and the web say.
    let categoryOptions: [String]
    /// The category a brand-new item starts on, when the workspace picked one.
    let defaultCategory: String
    let onSaved: () -> Void

    @State private var trackingType: InventoryTrackingType = .unique
    @State private var name = ""
    @State private var category = "Other"
    @State private var brand = ""
    @State private var model = ""
    @State private var reference = ""
    @State private var serialNumber = ""
    @State private var year = ""
    @State private var condition = ""
    @State private var sku = ""
    @State private var onHand = ""
    @State private var unit = ""
    @State private var lowStockAt = ""
    @State private var location = ""
    @State private var supplierName = ""
    @State private var purchaseDate = ""
    @State private var purchasePrice = ""
    /// An insurance/resale figure kept on the item. It deliberately moves
    /// nothing: the inventory value is the cost basis below.
    @State private var currentValueEst = ""
    @State private var extras: [InventoryAdditionalCost] = []
    @State private var isCustomerOwned = false
    @State private var notes = ""
    @State private var tags: [String] = []
    @State private var saving = false
    @State private var error = ""
    /// Photos picked before the item has an id to file them under. They ride
    /// along with Save: the item goes up first, then these land under the id it
    /// comes back with.
    @State private var stagedPhotos: [StagedInventoryPhoto] = []
    /// Set when a create succeeded but its photos did not, so pressing Save
    /// again edits the item that now exists instead of making a second one.
    @State private var createdItemId = ""

    init(
        currencySymbol: String,
        lang: String,
        existing: InventoryItem? = nil,
        itemId: String = "",
        tagSuggestions: [String] = [],
        locationSuggestions: [String] = [],
        categoryOptions: [String] = [],
        defaultCategory: String = "",
        onSaved: @escaping () -> Void
    ) {
        self.currencySymbol = currencySymbol
        self.lang = lang
        self.existing = existing
        self.itemId = itemId
        self.tagSuggestions = tagSuggestions
        self.locationSuggestions = locationSuggestions
        self.categoryOptions = categoryOptions.isEmpty ? inventoryCategories : categoryOptions
        self.defaultCategory = defaultCategory
        self.onSaved = onSaved
        // A new item starts on the workspace's chosen default rather than a
        // category picked for it by us.
        if existing == nil, !defaultCategory.isEmpty {
            _category = State(initialValue: defaultCategory)
        }
        guard let item = existing else { return }
        _trackingType = State(initialValue: item.trackingType)
        _name = State(initialValue: item.name)
        _category = State(initialValue: item.category)
        _brand = State(initialValue: item.brand)
        _model = State(initialValue: item.model)
        _reference = State(initialValue: item.reference)
        _serialNumber = State(initialValue: item.serialNumber)
        _year = State(initialValue: item.year)
        _condition = State(initialValue: item.condition)
        _sku = State(initialValue: item.sku)
        _onHand = State(initialValue: item.trackingType == .quantity ? editPrecise(item.onHand) : "")
        _unit = State(initialValue: item.unit)
        _lowStockAt = State(initialValue: item.lowStockAt > 0 ? editPrecise(item.lowStockAt) : "")
        _location = State(initialValue: item.location)
        _supplierName = State(initialValue: item.supplierName)
        _purchaseDate = State(initialValue: item.purchaseDate)
        _purchasePrice = State(initialValue: item.purchasePrice > 0 ? editPrecise(item.purchasePrice) : "")
        _currentValueEst = State(initialValue: item.currentValueEst > 0 ? editPrecise(item.currentValueEst) : "")
        _extras = State(initialValue: item.additionalCosts)
        _isCustomerOwned = State(initialValue: item.ownership == .customer)
        _notes = State(initialValue: item.notes)
        _tags = State(initialValue: item.tags)
    }

    private var extrasTotal: Double { extras.reduce(0) { $0 + $1.amount } }
    private var internalTotal: Double { parseAmount(purchasePrice) + extrasTotal }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("", selection: $trackingType) {
                        ForEach(InventoryTrackingType.allCases, id: \.self) {
                            Text(t($0.label, lang: lang)).tag($0)
                        }
                    }
                    .pickerStyle(.segmented)
                    Text(trackingType == .unique
                         ? t("One physical object with its own identity — a specific watch, a serialled movement.", lang: lang)
                         : t("Something you count — screws, lacquer, boxes. Tracked as an amount with a reorder point.", lang: lang))
                        .font(.system(size: 11)).foregroundColor(.secondary)
                } header: {
                    Text(t("What kind of thing is this?", lang: lang))
                }

                Section(t("Details", lang: lang)) {
                    TextField(t("Name", lang: lang), text: $name)
                    Picker(t("Category", lang: lang), selection: $category) {
                        ForEach(categoryOptions, id: \.self) { Text(t($0, lang: lang)).tag($0) }
                    }
                    if trackingType == .unique {
                        TextField(t("Brand", lang: lang), text: $brand)
                        TextField(t("Model", lang: lang), text: $model)
                        TextField(t("Reference", lang: lang), text: $reference)
                        TextField(t("Serial number", lang: lang), text: $serialNumber)
                        TextField(t("Year", lang: lang), text: $year)
                        TextField(t("Condition", lang: lang), text: $condition)
                    } else {
                        TextField(t("SKU", lang: lang), text: $sku)
                        TextField(t("Amount on hand", lang: lang), text: $onHand)
                        TextField(t("Unit (pcs, ml, g)", lang: lang), text: $unit)
                        TextField(t("Tell me when it drops to", lang: lang), text: $lowStockAt)
                    }
                    LocationFieldWithSuggestions(
                        location: $location,
                        lang: lang,
                        placeholder: t("Location", lang: lang),
                        suggestions: locationSuggestions
                    )
                }

                Section(t("Tags", lang: lang)) {
                    TagChipEditor(tags: $tags, lang: lang, suggestions: tagSuggestions)
                }

                Section {
                    InventoryPriceField(
                        label: trackingType == .unique
                            ? t("Purchase price", lang: lang)
                            : t("Purchase price (per unit)", lang: lang),
                        symbol: currencySymbol,
                        text: $purchasePrice
                    )
                    InventoryPriceField(
                        label: t("Current value (est.)", lang: lang),
                        symbol: currencySymbol,
                        text: $currentValueEst
                    )
                    Text(t("An estimate for insurance or resale. Inventory value stays at what you paid — purchase price plus the costs below.", lang: lang))
                        .font(.system(size: 11)).foregroundColor(.secondary)
                    // The number the item will actually carry in the list and
                    // the totals, worked out here so nobody has to guess which
                    // field moves it.
                    InventoryValuePreviewRow(
                        lang: lang,
                        symbol: currencySymbol,
                        isUnique: trackingType == .unique,
                        isCustomerOwned: isCustomerOwned,
                        amount: internalTotal
                    )
                    ForEach($extras) { $extra in
                        InventoryExtraCostRow(lang: lang, symbol: currencySymbol, extra: $extra)
                    }
                    Button(t("Add a cost", lang: lang)) {
                        extras.append(InventoryAdditionalCost(label: "", amount: 0))
                    }
                    .font(.system(size: 12))
                    HStack {
                        Text(t("Internal total cost", lang: lang)).font(.system(size: 12, weight: .semibold))
                        Spacer()
                        Text(inventoryMoney(currencySymbol, internalTotal)).font(.system(size: 13, weight: .bold))
                    }
                    TextField(t("Supplier", lang: lang), text: $supplierName)
                    TextField(t("Purchase date (YYYY-MM-DD)", lang: lang), text: $purchaseDate)
                } header: {
                    Text(t("Cost", lang: lang))
                } footer: {
                    // The reason these are two boxes and not one. A blended cost
                    // field would destroy the figure the margin scheme needs.
                    Text(t("Kept apart on purpose. Repairs, parts and shipping do not belong in the purchase price used for the VAT margin scheme, and once they are blended into one number there is no way to get it back.", lang: lang))
                        .font(.system(size: 10))
                }

                InventoryPhotoStagingSection(
                    staged: $stagedPhotos,
                    lang: lang,
                    alreadyOnItem: existing?.photos.count ?? 0,
                    isEdit: !itemId.isEmpty,
                    busy: saving
                )

                Section {
                    Toggle(t("This belongs to a customer", lang: lang), isOn: $isCustomerOwned)
                    if isCustomerOwned {
                        Text(t("Recorded so you can find it, valued at zero, and never counted as your stock.", lang: lang))
                            .font(.system(size: 11)).foregroundColor(.secondary)
                    }
                    TextField(t("Notes", lang: lang), text: $notes, axis: .vertical).lineLimit(2...4)
                }

                if !error.isEmpty {
                    Text(error).font(.system(size: 12)).foregroundColor(.red)
                }
            }
            .navigationTitle(itemId.isEmpty ? t("Add Item", lang: lang) : t("Edit Item", lang: lang))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(t("Cancel", lang: lang)) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? t("Saving…", lang: lang) : t("Save", lang: lang)) { save() }
                        .disabled(saving || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func save() {
        saving = true
        error = ""
        let existingPhotos = existing?.photos ?? []
        // The server rebuilds the WHOLE document from this payload — any field
        // not sent is blanked. Fields the form does not show (description,
        // photos) still have to travel, carried over from the item being
        // edited.
        let payload: [String: Any] = [
            "name": name, "category": category, "trackingType": trackingType.rawValue,
            "ownership": isCustomerOwned ? "customer" : "business",
            "brand": brand, "model": model, "reference": reference, "serialNumber": serialNumber,
            "year": year, "condition": condition, "sku": sku, "location": location,
            "supplierName": supplierName, "purchaseDate": purchaseDate, "notes": notes,
            "onHand": trackingType == .unique ? 1 : parseAmount(onHand),
            "unit": unit, "lowStockAt": parseAmount(lowStockAt),
            "purchasePrice": parseAmount(purchasePrice),
            "additionalCosts": extras.map { ["label": $0.label, "amount": $0.amount] },
            "description": existing?.description ?? "",
            "currentValueEst": parseAmount(currentValueEst),
            "photos": existingPhotos,
            // Always sent (key-present semantics server-side), so edits
            // round-trip and an emptied editor genuinely clears the tags.
            "tags": tags
        ]
        let target = itemId.isEmpty ? createdItemId : itemId
        Task {
            do {
                let savedId = try await firebaseManager.saveInventoryItem(payload, itemId: target)
                if !stagedPhotos.isEmpty && !savedId.isEmpty {
                    // The item is real now, so its photos have somewhere to
                    // live. If they do not make it, the item still stands and
                    // the form says exactly what is missing — losing the whole
                    // entry over a failed upload would be the worse trade.
                    do {
                        var uploaded: [String] = []
                        for photo in stagedPhotos {
                            uploaded.append(try await firebaseManager.uploadInventoryPhoto(
                                itemId: savedId, data: photo.data, fileName: photo.fileName))
                        }
                        var withPhotos = payload
                        withPhotos["photos"] = existingPhotos + uploaded
                        try await firebaseManager.saveInventoryItem(withPhotos, itemId: savedId)
                    } catch {
                        createdItemId = savedId
                        onSaved()
                        self.error = t("The item was saved, but the photos could not be uploaded. Add them from the item's photo button.", lang: lang)
                        saving = false
                        return
                    }
                }
                onSaved()
                dismiss()
            } catch {
                self.error = error.localizedDescription
                saving = false
            }
        }
    }
}

/// A price field that reads as money: the workspace's currency symbol sits
/// ahead of the figure the way it does on a price tag, so a typed 40 is plainly
/// £40 and not a count. Its own struct — the real-iPhone stack guard punishes
/// rows inlined into a sheet body.
struct InventoryPriceField: View {
    let label: String
    let symbol: String
    @Binding var text: String

    var body: some View {
        HStack(spacing: 8) {
            Text(label).font(.system(size: 13))
            Spacer(minLength: 8)
            Text(symbol).font(.system(size: 13, weight: .semibold)).foregroundColor(.secondary)
            TextField("0.00", text: $text)
                .multilineTextAlignment(.trailing)
                .frame(width: 96)
                #if os(iOS)
                .keyboardType(.decimalPad)
                #endif
        }
    }
}

/// One additional-cost row — what it was for, and how much. The symbol leads
/// the amount for the same reason it leads the purchase price.
struct InventoryExtraCostRow: View {
    let lang: String
    let symbol: String
    @Binding var extra: InventoryAdditionalCost

    var body: some View {
        HStack {
            TextField(t("What for", lang: lang), text: $extra.label)
            Spacer()
            Text(symbol).font(.system(size: 13, weight: .semibold)).foregroundColor(.secondary)
            TextField("0.00", value: $extra.amount, format: .number)
                .frame(width: 90).multilineTextAlignment(.trailing)
                #if os(iOS)
                .keyboardType(.decimalPad)
                #endif
        }
    }
}

/// The figure the item will actually carry on the shelf. "Current value (est.)"
/// is an insurance number and moves nothing; the value is the cost basis —
/// purchase price plus the costs — and customer property is held, not owned, so
/// it stays at zero. Saying so in the form is cheaper than a support email.
struct InventoryValuePreviewRow: View {
    let lang: String
    let symbol: String
    let isUnique: Bool
    let isCustomerOwned: Bool
    let amount: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(isUnique
                     ? t("This item's inventory value", lang: lang)
                     : t("Inventory value per unit", lang: lang))
                    .font(.system(size: 12, weight: .semibold))
                Spacer()
                Text(inventoryMoney(symbol, isCustomerOwned ? 0 : amount))
                    .font(.system(size: 13, weight: .bold))
            }
            if isCustomerOwned {
                Text(t("Customer property is held, not owned — it stays at zero.", lang: lang))
                    .font(.system(size: 10)).foregroundColor(.secondary)
            }
        }
    }
}

struct NewPurchaseSheet: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @Environment(\.dismiss) private var dismiss
    let currencySymbol: String
    let lang: String
    let supplierNames: [String]
    /// The workspace's own category names — same list the item form uses.
    let categoryOptions: [String]
    let onSaved: () -> Void

    @State private var supplierName = ""
    @State private var purchaseDate = ""
    @State private var reference = ""
    @State private var shipping = ""
    @State private var otherCosts = ""
    @State private var lines: [PurchaseLine] = [PurchaseLine()]
    @State private var notes = ""
    @State private var saving = false
    @State private var error = ""

    private var goods: Double { lines.reduce(0) { $0 + $1.unitPrice * ($1.trackingType == .unique ? 1 : $1.quantity) } }
    private var extras: Double { parseAmount(shipping) + parseAmount(otherCosts) }

    var body: some View {
        NavigationStack {
            Form {
                Section(t("Supplier", lang: lang)) {
                    TextField(t("Who you bought from", lang: lang), text: $supplierName)
                    if !supplierNames.isEmpty {
                        Menu(t("Pick an existing supplier", lang: lang)) {
                            ForEach(supplierNames, id: \.self) { name in
                                Button(name) { supplierName = name }
                            }
                        }
                        .font(.system(size: 12))
                    }
                    TextField(t("Purchase date (YYYY-MM-DD)", lang: lang), text: $purchaseDate)
                    TextField(t("Invoice / order reference", lang: lang), text: $reference)
                }

                ForEach($lines) { $line in
                    Section(t("Item", lang: lang)) {
                        Picker("", selection: $line.trackingType) {
                            ForEach(InventoryTrackingType.allCases, id: \.self) {
                                Text(t($0.label, lang: lang)).tag($0)
                            }
                        }
                        .pickerStyle(.segmented)
                        TextField(t("Name", lang: lang), text: $line.name)
                        Picker(t("Category", lang: lang), selection: $line.category) {
                            ForEach(categoryOptions, id: \.self) { Text(t($0, lang: lang)).tag($0) }
                        }
                        if line.trackingType == .quantity {
                            TextField(t("Quantity", lang: lang), value: $line.quantity, format: .number)
                            TextField(t("Unit (pcs, ml, g)", lang: lang), text: $line.unit)
                        } else {
                            TextField(t("Reference", lang: lang), text: $line.reference)
                            TextField(t("Serial number", lang: lang), text: $line.serialNumber)
                        }
                        TextField(line.trackingType == .unique ? t("Purchase price", lang: lang) : t("Price per unit", lang: lang),
                                  value: $line.unitPrice, format: .number)
                        TextField(t("Location", lang: lang), text: $line.location)
                    }
                }

                Section {
                    Button(t("Add another item", lang: lang)) { lines.append(PurchaseLine()) }
                        .font(.system(size: 12))
                    if lines.count > 1 {
                        Button(t("Remove the last item", lang: lang), role: .destructive) { lines.removeLast() }
                            .font(.system(size: 12))
                    }
                }

                Section {
                    TextField(t("Shipping", lang: lang), text: $shipping)
                    TextField(t("Other costs", lang: lang), text: $otherCosts)
                    HStack {
                        Text(t("Purchase total", lang: lang)).font(.system(size: 12, weight: .semibold))
                        Spacer()
                        Text(inventoryMoney(currencySymbol, goods + extras)).font(.system(size: 13, weight: .bold))
                    }
                } header: {
                    Text(t("Shipping and fees", lang: lang))
                } footer: {
                    Text(t("Kept out of the item prices on purpose. Each item's purchase price stays exactly what you paid for the goods, and its share of these costs is recorded separately against it.", lang: lang))
                        .font(.system(size: 10))
                }

                Section {
                    TextField(t("Notes", lang: lang), text: $notes, axis: .vertical).lineLimit(2...4)
                    Text(t("The items are created as incoming — they become available stock when you mark the purchase received.", lang: lang))
                        .font(.system(size: 11)).foregroundColor(.secondary)
                }

                if !error.isEmpty {
                    Text(error).font(.system(size: 12)).foregroundColor(.red)
                }
            }
            .navigationTitle(t("New Purchase", lang: lang))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(t("Cancel", lang: lang)) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? t("Saving…", lang: lang) : t("Save", lang: lang)) { save() }
                        .disabled(saving || lines.allSatisfy { $0.name.trimmingCharacters(in: .whitespaces).isEmpty })
                }
            }
        }
    }

    private func save() {
        saving = true
        error = ""
        let usable = lines.filter { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty }
        let payload: [String: Any] = [
            "supplierName": supplierName, "purchaseDate": purchaseDate, "reference": reference,
            "notes": notes, "shipping": parseAmount(shipping), "otherCosts": parseAmount(otherCosts),
            "lines": usable.map(\.payload)
        ]
        Task {
            do {
                try await firebaseManager.savePurchase(payload)
                onSaved()
                dismiss()
            } catch {
                self.error = error.localizedDescription
                saving = false
            }
        }
    }
}

struct MatchPaymentSheet: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @Environment(\.dismiss) private var dismiss
    let purchase: Purchase
    let currencySymbol: String
    let lang: String
    let onMatched: () -> Void

    @State private var busy = false
    @State private var error = ""
    @State private var mismatch: String?

    /// Closest amount first: the row you want is almost always the one that
    /// matches the total, and scrolling a year of statements to find it is the
    /// whole chore.
    private var candidates: [StudioBankTransaction] {
        firebaseManager.bankTransactions
            .filter { $0.amount < 0 && ($0.purchaseId.isEmpty || $0.purchaseId == purchase.id) }
            .sorted { abs(abs($0.amount) - purchase.total) < abs(abs($1.amount) - purchase.total) }
            .prefix(40)
            .map { $0 }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("\(purchase.number) · \(purchase.supplierName) · \(inventoryMoney(currencySymbol, purchase.total))")
                        .font(.system(size: 12)).foregroundColor(.secondary)
                }

                if candidates.isEmpty {
                    Text(t("No unmatched money-out transactions to choose from.", lang: lang))
                        .font(.system(size: 12)).foregroundColor(.secondary)
                } else {
                    ForEach(candidates) { transaction in
                        Button { match(transaction.id) } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(transaction.merchant.isEmpty ? t("Transaction", lang: lang) : transaction.merchant)
                                        .font(.system(size: 13, weight: .semibold))
                                    Text(transaction.bookingDate).font(.system(size: 11)).foregroundColor(.secondary)
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 2) {
                                    Text(inventoryMoney(currencySymbol, abs(transaction.amount)))
                                        .font(.system(size: 13, weight: .bold))
                                    if abs(abs(transaction.amount) - purchase.total) < 0.01 {
                                        Text(t("Exact match", lang: lang)).font(.system(size: 10)).foregroundColor(.green)
                                    }
                                }
                            }
                        }
                        .disabled(busy)
                    }
                }

                if !purchase.bankTransactionId.isEmpty {
                    Section {
                        Button(t("Unlink current payment", lang: lang), role: .destructive) { match("") }
                            .disabled(busy)
                    }
                }

                if !error.isEmpty {
                    Text(error).font(.system(size: 12)).foregroundColor(.red)
                }
            }
            .navigationTitle(t("Match a payment", lang: lang))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(t("Close", lang: lang)) { dismiss() }
                }
            }
            .alert(t("Amounts differ", lang: lang), isPresented: Binding(
                get: { mismatch != nil },
                set: { if !$0 { mismatch = nil; dismiss() } }
            )) {
                Button(t("OK", lang: lang)) { mismatch = nil; dismiss() }
            } message: {
                Text(mismatch ?? "")
            }
        }
    }

    private func match(_ transactionId: String) {
        busy = true
        error = ""
        Task {
            do {
                let difference = try await firebaseManager.matchPurchasePayment(purchase.id, transactionId: transactionId)
                onMatched()
                // Reported, not refused: a deposit or a part payment is a real
                // thing, and blocking it would push the user to a spreadsheet.
                if abs(difference) > 0.009 && !transactionId.isEmpty {
                    mismatch = t("The payment does not match the purchase total. If this was a deposit or a part payment that is fine — otherwise check the purchase.", lang: lang)
                } else {
                    dismiss()
                }
            } catch {
                self.error = error.localizedDescription
                busy = false
            }
        }
    }
}

/// Goods arrive in boxes, not in purchase orders. This sheet receives what the
/// courier actually brought — per line, per quantity — and the rest stays
/// outstanding, with the purchase reading "Partially received" until the last
/// piece lands.
struct ReceiveDeliverySheet: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @Environment(\.dismiss) private var dismiss
    let purchase: Purchase
    let lang: String
    let onReceived: () -> Void

    @State private var amounts: [Int: String] = [:]
    @State private var arrived: [Int: Bool] = [:]
    @State private var busy = false
    @State private var error = ""

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("\(purchase.number) · \(purchase.supplierName.isEmpty ? "—" : purchase.supplierName) — "
                         + t("enter what the courier actually brought; the rest stays outstanding.", lang: lang))
                        .font(.system(size: 11)).foregroundColor(.secondary)
                }

                Section {
                    ForEach(purchase.lines) { line in
                        ReceiveDeliveryRow(
                            line: line,
                            lang: lang,
                            amount: Binding(
                                get: { amounts[line.index] ?? "" },
                                set: { amounts[line.index] = $0 }
                            ),
                            arrived: Binding(
                                get: { arrived[line.index] ?? false },
                                set: { arrived[line.index] = $0 }
                            )
                        )
                    }
                }

                if !error.isEmpty {
                    Text(error).font(.system(size: 12)).foregroundColor(.red)
                }

                Section {
                    Button(t("Receive what arrived", lang: lang)) { submit() }
                        .font(.system(size: 13, weight: .semibold))
                        .disabled(busy)
                }
            }
            .navigationTitle(t("Receive delivery", lang: lang))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(t("Close", lang: lang)) { dismiss() }
                }
            }
        }
    }

    private func submit() {
        // An empty field means "did not arrive", never "zero out the line" —
        // only what the user actually entered travels.
        var payload: [[String: Any]] = []
        for line in purchase.lines {
            guard line.outstanding > 0 else { continue }
            if line.trackingType == .unique {
                if arrived[line.index] == true { payload.append(["index": line.index]) }
                continue
            }
            let text = (amounts[line.index] ?? "")
                .replacingOccurrences(of: ",", with: ".")
                .trimmingCharacters(in: .whitespaces)
            guard !text.isEmpty else { continue }
            let wanted = Double(text) ?? 0
            guard wanted > 0 else { continue }
            if wanted > line.outstanding {
                error = "\"\(line.name)\" — " + t("that is more than is still outstanding.", lang: lang)
                return
            }
            payload.append(["index": line.index, "quantity": wanted])
        }
        if payload.isEmpty {
            error = t("Enter what arrived first.", lang: lang)
            return
        }
        busy = true
        error = ""
        Task {
            do {
                try await firebaseManager.receivePurchase(purchase.id, lines: payload)
                onReceived()
                dismiss()
            } catch {
                self.error = error.localizedDescription
                busy = false
            }
        }
    }
}

/// One delivery line: "received / ordered unit" progress, then either a
/// quantity field (counted stock) or an "Arrived" toggle (a unique piece).
/// Its own struct — the real-iPhone stack guard chokes on rows inlined into
/// a sheet body.
struct ReceiveDeliveryRow: View {
    let line: PurchaseReceiptLine
    let lang: String
    @Binding var amount: String
    @Binding var arrived: Bool

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(line.name).font(.system(size: 13, weight: .semibold))
                Text("\(formatQuantity(line.receivedQuantity)) / \(formatQuantity(line.ordered))"
                     + (line.unit.isEmpty ? "" : " \(line.unit)"))
                    .font(.system(size: 10)).foregroundColor(.secondary)
            }
            Spacer()
            if line.outstanding <= 0 {
                Text(t("Received", lang: lang))
                    .font(.system(size: 10, weight: .bold)).foregroundColor(.green)
            } else if line.trackingType == .unique {
                Toggle(t("Arrived", lang: lang), isOn: $arrived)
                    .font(.system(size: 11))
                    .fixedSize()
            } else {
                TextField(formatQuantity(line.outstanding), text: $amount)
                    .frame(width: 64).multilineTextAlignment(.trailing)
                    .font(.system(size: 12))
            }
        }
    }
}

/// The tag editor: chips with an × to remove, a field that adds on return,
/// and every tag already in use offered as a one-tap suggestion. Its own
/// struct — the real-iPhone stack guard punishes rows inlined into a sheet
/// body. The server's caps (20 tags, 30 characters each) are applied here
/// too, so nothing typed is silently different after the save.
struct TagChipEditor: View {
    @Binding var tags: [String]
    let lang: String
    let suggestions: [String]

    @State private var draft = ""

    private var unusedSuggestions: [String] {
        suggestions.filter { !tags.contains($0) }
    }

    private let columns = [GridItem(.adaptive(minimum: 90), spacing: 6)]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !tags.isEmpty {
                LazyVGrid(columns: columns, alignment: .leading, spacing: 6) {
                    ForEach(tags, id: \.self) { tag in
                        HStack(spacing: 4) {
                            Text(tag).font(.system(size: 11, weight: .semibold)).lineLimit(1)
                            Button {
                                tags.removeAll { $0 == tag }
                            } label: {
                                Image(systemName: "xmark").font(.system(size: 8, weight: .bold))
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(Capsule().fill(Color.blue.opacity(0.12)))
                        .foregroundColor(.blue)
                    }
                }
            }
            TextField(t("Add a tag and press Enter", lang: lang), text: $draft)
                .onSubmit { add(draft) }
            if !unusedSuggestions.isEmpty {
                LazyVGrid(columns: columns, alignment: .leading, spacing: 6) {
                    ForEach(unusedSuggestions, id: \.self) { tag in
                        Button { add(tag) } label: {
                            Text(tag)
                                .font(.system(size: 11))
                                .lineLimit(1)
                                .padding(.horizontal, 8).padding(.vertical, 4)
                                .background(Capsule().fill(Color.gray.opacity(0.12)))
                                .foregroundColor(.secondary)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func add(_ raw: String) {
        let value = String(raw.trimmingCharacters(in: .whitespacesAndNewlines).prefix(30))
        draft = ""
        guard !value.isEmpty, !tags.contains(value), tags.count < 20 else { return }
        tags.append(value)
    }
}

struct SupplierSheet: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @Environment(\.dismiss) private var dismiss
    let supplier: Supplier?
    let lang: String
    let onSaved: () -> Void

    @State private var name = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var website = ""
    @State private var code = ""
    @State private var address = ""
    @State private var vatNumber = ""
    @State private var currency = ""
    @State private var notes = ""
    @State private var saving = false
    @State private var error = ""

    var body: some View {
        NavigationStack {
            Form {
                TextField(t("Name", lang: lang), text: $name)
                TextField(t("Email", lang: lang), text: $email)
                TextField(t("Phone", lang: lang), text: $phone)
                TextField(t("Website", lang: lang), text: $website)
                // The paperwork fields — what an invoice or a customs form
                // asks for. Same set and order as the web form.
                HStack {
                    Text(t("Supplier code", lang: lang))
                    TextField(t("Your reference for them", lang: lang), text: $code)
                        .multilineTextAlignment(.trailing)
                }
                TextField(t("VAT number", lang: lang), text: $vatNumber)
                HStack {
                    Text(t("Currency", lang: lang))
                    TextField("GBP, EUR…", text: $currency)
                        .multilineTextAlignment(.trailing)
                }
                TextField(t("Address", lang: lang), text: $address, axis: .vertical).lineLimit(2...4)
                TextField(t("Notes", lang: lang), text: $notes, axis: .vertical).lineLimit(2...4)
                if !error.isEmpty {
                    Text(error).font(.system(size: 12)).foregroundColor(.red)
                }
            }
            .navigationTitle(supplier == nil ? t("New Supplier", lang: lang) : t("Edit supplier", lang: lang))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(t("Cancel", lang: lang)) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? t("Saving…", lang: lang) : t("Save", lang: lang)) { save() }
                        .disabled(saving || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear {
                guard let supplier else { return }
                name = supplier.name
                email = supplier.email
                phone = supplier.phone
                website = supplier.website
                code = supplier.code
                address = supplier.address
                vatNumber = supplier.vatNumber
                currency = supplier.currency
                // The server rebuilds the whole card from this payload, so
                // notes must travel prefilled or an edit would blank them.
                notes = supplier.notes
            }
        }
    }

    private func save() {
        saving = true
        error = ""
        Task {
            do {
                try await firebaseManager.saveSupplier(
                    [
                        "name": name, "email": email, "phone": phone, "website": website, "notes": notes,
                        "code": code.trimmingCharacters(in: .whitespaces),
                        "address": address,
                        "vatNumber": vatNumber.trimmingCharacters(in: .whitespaces),
                        // Currency codes read as codes: gbp becomes GBP.
                        "currency": currency.trimmingCharacters(in: .whitespaces).uppercased()
                    ],
                    supplierId: supplier?.id ?? ""
                )
                onSaved()
                dismiss()
            } catch {
                self.error = error.localizedDescription
                saving = false
            }
        }
    }
}
