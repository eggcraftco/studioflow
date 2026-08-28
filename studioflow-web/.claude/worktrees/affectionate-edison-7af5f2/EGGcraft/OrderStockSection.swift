import SwiftUI

// Stock committed to one order, shown inside the Materials card.
//
// Reserving is not consuming. A part set aside for a job is still physically in
// the drawer and still an asset; it just cannot be promised to a second order.
// That is why this shows a reserved total rather than deducting anything.


struct OrderStockSection: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    let orderId: String
    let currencySymbol: String
    let lang: String
    let canEdit: Bool
    /// The total is offered to the Financial card, never written into it. A
    /// figure a person typed is a decision, and overwriting it silently would
    /// lose that decision without telling anyone.
    var onUseAsBaseCost: ((Double) -> Void)?

    @State private var lines: [OrderStockLine] = []
    @State private var total: Double = 0
    @State private var loading = true
    @State private var picking = false
    /// The line being swapped for a different item, if any — the picker opens
    /// in swap mode while this is set.
    @State private var swapping: OrderStockLine?
    /// The "Use a recipe" sheet: a whole parts list reserved in one act.
    @State private var applyingRecipe = false
    @State private var error = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(t("Stock reserved for this order", lang: lang))
                    .font(.system(size: 10, weight: .bold)).foregroundColor(.secondary)
                Spacer()
                if canEdit {
                    Button(t("Reserve stock", lang: lang)) { picking = true }
                        .font(.system(size: 11, weight: .semibold)).buttonStyle(.plain).foregroundColor(.blue)
                    Button(t("Use a recipe…", lang: lang)) { applyingRecipe = true }
                        .font(.system(size: 11, weight: .semibold)).buttonStyle(.plain).foregroundColor(.blue)
                }
            }

            if loading && lines.isEmpty {
                Text(t("Loading…", lang: lang)).font(.system(size: 11)).foregroundColor(.secondary)
            } else if lines.isEmpty {
                Text(t("Nothing reserved yet. Reserving puts a part aside for this job so it cannot be promised twice.", lang: lang))
                    .font(.system(size: 11)).foregroundColor(.secondary)
            } else {
                ForEach(lines) { line in
                    HStack(alignment: .top, spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(line.name).font(.system(size: 12, weight: .semibold))
                            Text(subline(line))
                                .font(.system(size: 10)).foregroundColor(.secondary)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 4) {
                            Text(inventoryMoney(currencySymbol, line.lineCost)).font(.system(size: 12, weight: .semibold))
                            if canEdit {
                                // Three exits for a reserved part: it goes into
                                // the job (consume), it becomes a different
                                // part (swap), or the promise is taken back
                                // (release).
                                HStack(spacing: 10) {
                                    Button(t("Use on the job", lang: lang)) { consume(line) }
                                        .font(.system(size: 11)).buttonStyle(.plain).foregroundColor(.blue)
                                    Button(t("Swap…", lang: lang)) { swapping = line }
                                        .font(.system(size: 11)).buttonStyle(.plain).foregroundColor(.blue)
                                    Button(t("Release", lang: lang)) { release(line) }
                                        .font(.system(size: 11)).buttonStyle(.plain).foregroundColor(.red)
                                }
                            }
                        }
                    }
                }

                Divider()
                HStack {
                    Text(t("Committed stock cost", lang: lang)).font(.system(size: 12))
                    Spacer()
                    Text(inventoryMoney(currencySymbol, total)).font(.system(size: 13, weight: .bold))
                }

                if canEdit, let onUseAsBaseCost, total > 0 {
                    Button(t("Use as the base cost on the Financial card", lang: lang)) { onUseAsBaseCost(total) }
                        .font(.system(size: 11, weight: .semibold)).buttonStyle(.plain).foregroundColor(.blue)
                }
            }

            if !error.isEmpty {
                Text(error).font(.system(size: 11)).foregroundColor(.red)
            }
        }
        .task(id: orderId) { await reload() }
        .sheet(isPresented: $picking) {
            ReserveStockSheet(
                orderId: orderId,
                currencySymbol: currencySymbol,
                lang: lang,
                alreadyReserved: lines.map(\.id)
            ) {
                Task { await reload() }
            }
            .environmentObject(firebaseManager)
        }
        .sheet(item: $swapping) { line in
            // Same picker, swap mode: picking an item releases this line and
            // reserves the pick in one server transaction.
            ReserveStockSheet(
                orderId: orderId,
                currencySymbol: currencySymbol,
                lang: lang,
                alreadyReserved: lines.map(\.id),
                swapFrom: line
            ) {
                Task { await reload() }
            }
            .environmentObject(firebaseManager)
        }
        .sheet(isPresented: $applyingRecipe) {
            UseRecipeSheet(orderId: orderId, lang: lang) {
                Task { await reload() }
            }
            .environmentObject(firebaseManager)
        }
    }

    /// "INV-0042 · 5 / 15 pcs · Vault Z" — what this order holds out of what
    /// exists, then where it lives, so a partial reserve doesn't read like the
    /// whole spool. onHand and location arrived with slice I1; a line from an
    /// older cache simply shows what it knows.
    private func subline(_ line: OrderStockLine) -> String {
        var amount = ""
        if line.trackingType == .quantity {
            amount = formatQuantity(line.quantity)
            if let onHand = line.onHand { amount += " / " + formatQuantity(onHand) }
            if !line.unit.isEmpty { amount += " \(line.unit)" }
        }
        return [line.number, amount, line.location]
            .filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private func reload() async {
        guard !orderId.isEmpty else { return }
        loading = true
        do {
            let result = try await firebaseManager.loadOrderStock(orderId: orderId)
            lines = result.lines
            total = result.total
            error = ""
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func release(_ line: OrderStockLine) {
        Task {
            do {
                try await firebaseManager.releaseStock(itemId: line.id, orderId: orderId)
                await reload()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    /// Consuming is the moment the promised part actually goes into the job:
    /// the whole reserved line leaves the shelf and the ledger names this
    /// order. The reload also refreshes the total the Financial card is
    /// offered.
    private func consume(_ line: OrderStockLine) {
        Task {
            do {
                try await firebaseManager.consumeStock(itemId: line.id, orderId: orderId)
                await reload()
            } catch {
                let message = error.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
                self.error = message.isEmpty ? t("The item could not be marked as used.", lang: lang) : message
            }
        }
    }
}

struct ReserveStockSheet: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @Environment(\.dismiss) private var dismiss
    let orderId: String
    let currencySymbol: String
    let lang: String
    let alreadyReserved: [String]
    /// When set, picking an item swaps this line for it instead of adding —
    /// the release and the new reserve happen in one server transaction.
    var swapFrom: OrderStockLine? = nil
    let onReserved: () -> Void

    @State private var items: [InventoryItem] = []
    @State private var search = ""
    @State private var amounts: [String: String] = [:]
    @State private var loading = true
    @State private var busy = false
    @State private var error = ""

    /// Only what can honestly be promised: business-owned, still on the shelf,
    /// and not already spoken for. A customer's own property is never offered.
    private var choices: [InventoryItem] {
        let needle = search.trimmingCharacters(in: .whitespaces).lowercased()
        return items.filter { item in
            guard item.ownership != .customer else { return false }
            guard !alreadyReserved.contains(item.id) else { return false }
            guard item.freeToReserve > 0 else { return false }
            if needle.isEmpty { return true }
            return [item.name, item.brand, item.model, item.reference, item.serialNumber, item.sku, item.number]
                .contains { $0.lowercased().contains(needle) }
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextField(t("Search stock…", lang: lang), text: $search)
                }

                if loading {
                    Text(t("Loading…", lang: lang)).font(.system(size: 12)).foregroundColor(.secondary)
                } else if choices.isEmpty {
                    Text(items.isEmpty
                         ? t("There is nothing in inventory yet.", lang: lang)
                         : t("Nothing available to reserve — everything is either used, sold or already promised.", lang: lang))
                        .font(.system(size: 12)).foregroundColor(.secondary)
                } else {
                    ForEach(choices) { item in
                        HStack(spacing: 10) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.name).font(.system(size: 13, weight: .semibold))
                                Text([item.number, item.category,
                                      "\(formatQuantity(item.freeToReserve))\(item.unit.isEmpty ? "" : " \(item.unit)") " + t("free", lang: lang)]
                                    .filter { !$0.isEmpty }.joined(separator: " · "))
                                    .font(.system(size: 10)).foregroundColor(.secondary)
                            }
                            Spacer()
                            if item.trackingType == .quantity {
                                TextField("0", text: Binding(
                                    get: { amounts[item.id] ?? formatQuantity(defaultAmount(item)) },
                                    set: { amounts[item.id] = $0 }
                                ))
                                .frame(width: 64).multilineTextAlignment(.trailing)
                                .font(.system(size: 12))
                            } else {
                                Text(inventoryMoney(currencySymbol, item.valuationCost)).font(.system(size: 12, weight: .semibold))
                            }
                            Button(t(swapFrom == nil ? "Reserve" : "Swap", lang: lang)) { reserve(item) }
                                .font(.system(size: 11, weight: .semibold)).buttonStyle(.bordered).disabled(busy)
                        }
                    }
                }

                if !error.isEmpty {
                    Text(error).font(.system(size: 12)).foregroundColor(.red)
                }
            }
            .navigationTitle(t(swapFrom == nil ? "Reserve stock" : "Swap to a different item", lang: lang))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(t("Close", lang: lang)) { dismiss() }
                }
            }
            .task {
                do { items = try await firebaseManager.loadInventoryItems() }
                catch { self.error = error.localizedDescription }
                loading = false
            }
        }
    }

    /// Swap mode pre-fills with what the old line held (capped at what is
    /// free): the person is replacing like for like, not re-deciding the
    /// amount.
    private func defaultAmount(_ item: InventoryItem) -> Double {
        if let swapFrom, item.trackingType == .quantity {
            return min(item.freeToReserve, swapFrom.quantity)
        }
        return item.freeToReserve
    }

    private func reserve(_ item: InventoryItem) {
        busy = true
        error = ""
        let wanted = item.trackingType == .unique
            ? 1
            : Double((amounts[item.id] ?? formatQuantity(defaultAmount(item))).replacingOccurrences(of: ",", with: ".")) ?? 0
        Task {
            do {
                if let swapFrom {
                    try await firebaseManager.swapStock(
                        orderId: orderId, fromItemId: swapFrom.id, toItemId: item.id, quantity: wanted)
                } else {
                    try await firebaseManager.reserveStock(itemId: item.id, orderId: orderId, quantity: wanted)
                }
                onReserved()
                dismiss()
            } catch {
                let message = error.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
                self.error = !message.isEmpty ? message
                    : t(swapFrom == nil ? "The item could not be reserved." : "The swap could not be completed.", lang: lang)
                busy = false
            }
        }
    }
}

/// "Use a recipe": pick a written parts list, say how many jobs' worth, and
/// the server reserves EVERY line in one transaction — all or nothing. A
/// refusal names the part that did not fit, and that text is the message.
/// Mirrors the web's ApplyRecipeModal: same words, same guards, same call.
struct UseRecipeSheet: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @Environment(\.dismiss) private var dismiss
    let orderId: String
    let lang: String
    let onApplied: () -> Void

    @State private var recipes: [InventoryRecipe] = []
    @State private var recipeId = ""
    @State private var multiplier = "1"
    @State private var loading = true
    @State private var busy = false
    @State private var error = ""

    var body: some View {
        NavigationStack {
            List {
                if loading {
                    Text(t("Loading…", lang: lang)).font(.system(size: 12)).foregroundColor(.secondary)
                } else if recipes.isEmpty {
                    Text(t("No recipes yet — write one under Inventory → Recipes.", lang: lang))
                        .font(.system(size: 12)).foregroundColor(.secondary)
                } else {
                    Section {
                        Picker(t("Recipe", lang: lang), selection: $recipeId) {
                            Text(t("Choose a recipe…", lang: lang)).tag("")
                            ForEach(recipes) { recipe in
                                Text("\(recipe.name) · \(recipe.lines.count) \(t("lines", lang: lang))")
                                    .tag(recipe.id)
                            }
                        }
                        .pickerStyle(.menu)
                        .font(.system(size: 13))

                        HStack {
                            Text(t("How many jobs' worth", lang: lang)).font(.system(size: 13))
                            Spacer()
                            TextField("1", text: $multiplier)
                                .frame(width: 64).multilineTextAlignment(.trailing)
                                .font(.system(size: 13))
                        }
                    }

                    Section {
                        Button(t(busy ? "Saving…" : "Reserve the parts", lang: lang), action: apply)
                            .font(.system(size: 13, weight: .semibold))
                            .disabled(busy)
                    }
                }

                if !error.isEmpty {
                    Text(error).font(.system(size: 12)).foregroundColor(.red)
                }
            }
            .navigationTitle(t("Use a recipe", lang: lang))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(t("Close", lang: lang)) { dismiss() }
                }
            }
            .task {
                do {
                    recipes = try await firebaseManager.listInventoryRecipes()
                    // One recipe is no choice at all — pre-pick it, like the web.
                    if recipes.count == 1 { recipeId = recipes[0].id }
                } catch {
                    let message = error.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
                    self.error = message.isEmpty ? t("Recipes could not be loaded.", lang: lang) : t(message, lang: lang)
                }
                loading = false
            }
        }
    }

    private func apply() {
        guard !recipeId.isEmpty else {
            error = t("Choose a recipe first.", lang: lang)
            return
        }
        // Same reading as the web's Number(multiplier) || 1: nonsense or zero
        // means one job's worth. The server caps it at 100.
        let parsed = Double(multiplier.replacingOccurrences(of: ",", with: ".")) ?? 0
        let times = parsed > 0 ? parsed : 1
        busy = true
        error = ""
        Task {
            do {
                try await firebaseManager.applyRecipeToOrder(
                    recipeId: recipeId, orderId: orderId, multiplier: times)
                onApplied()
                dismiss()
            } catch {
                let message = error.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
                self.error = message.isEmpty ? t("The recipe could not be applied.", lang: lang) : t(message, lang: lang)
                busy = false
            }
        }
    }
}
