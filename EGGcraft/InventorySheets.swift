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
    @State private var extras: [InventoryAdditionalCost] = []
    @State private var isCustomerOwned = false
    @State private var notes = ""
    @State private var saving = false
    @State private var error = ""

    init(
        currencySymbol: String,
        lang: String,
        existing: InventoryItem? = nil,
        itemId: String = "",
        onSaved: @escaping () -> Void
    ) {
        self.currencySymbol = currencySymbol
        self.lang = lang
        self.existing = existing
        self.itemId = itemId
        self.onSaved = onSaved
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
        _extras = State(initialValue: item.additionalCosts)
        _isCustomerOwned = State(initialValue: item.ownership == .customer)
        _notes = State(initialValue: item.notes)
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
                        ForEach(inventoryCategories, id: \.self) { Text(t($0, lang: lang)).tag($0) }
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
                    TextField(t("Location", lang: lang), text: $location)
                }

                Section {
                    TextField(t("Purchase price", lang: lang), text: $purchasePrice)
                    ForEach($extras) { $extra in
                        HStack {
                            TextField(t("What for", lang: lang), text: $extra.label)
                            Spacer()
                            TextField("0.00", value: $extra.amount, format: .number)
                                .frame(width: 90).multilineTextAlignment(.trailing)
                        }
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
        // The server rebuilds the WHOLE document from this payload — any field
        // not sent is blanked. Fields the form does not show (description,
        // current value estimate, photos) still have to travel, carried over
        // from the item being edited.
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
            "currentValueEst": existing?.currentValueEst ?? 0,
            "photos": existing?.photos ?? []
        ]
        Task {
            do {
                try await firebaseManager.saveInventoryItem(payload, itemId: itemId)
                onSaved()
                dismiss()
            } catch {
                self.error = error.localizedDescription
                saving = false
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
                            ForEach(inventoryCategories, id: \.self) { Text(t($0, lang: lang)).tag($0) }
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
            }
        }
    }

    private func save() {
        saving = true
        error = ""
        Task {
            do {
                try await firebaseManager.saveSupplier(
                    ["name": name, "email": email, "phone": phone, "website": website, "notes": notes],
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
