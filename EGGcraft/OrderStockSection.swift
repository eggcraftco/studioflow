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
                            Text([line.number,
                                  line.trackingType == .quantity
                                    ? "\(formatQuantity(line.quantity))\(line.unit.isEmpty ? "" : " \(line.unit)")"
                                    : ""]
                                .filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.system(size: 10)).foregroundColor(.secondary)
                        }
                        Spacer()
                        Text(inventoryMoney(currencySymbol, line.lineCost)).font(.system(size: 12, weight: .semibold))
                        if canEdit {
                            Button(t("Release", lang: lang)) { release(line) }
                                .font(.system(size: 11)).buttonStyle(.plain).foregroundColor(.red)
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
}

struct ReserveStockSheet: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @Environment(\.dismiss) private var dismiss
    let orderId: String
    let currencySymbol: String
    let lang: String
    let alreadyReserved: [String]
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
                                    get: { amounts[item.id] ?? formatQuantity(item.freeToReserve) },
                                    set: { amounts[item.id] = $0 }
                                ))
                                .frame(width: 64).multilineTextAlignment(.trailing)
                                .font(.system(size: 12))
                            } else {
                                Text(inventoryMoney(currencySymbol, item.valuationCost)).font(.system(size: 12, weight: .semibold))
                            }
                            Button(t("Reserve", lang: lang)) { reserve(item) }
                                .font(.system(size: 11, weight: .semibold)).buttonStyle(.bordered).disabled(busy)
                        }
                    }
                }

                if !error.isEmpty {
                    Text(error).font(.system(size: 12)).foregroundColor(.red)
                }
            }
            .navigationTitle(t("Reserve stock", lang: lang))
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

    private func reserve(_ item: InventoryItem) {
        busy = true
        error = ""
        let wanted = item.trackingType == .unique
            ? 1
            : Double((amounts[item.id] ?? formatQuantity(item.freeToReserve)).replacingOccurrences(of: ",", with: ".")) ?? 0
        Task {
            do {
                try await firebaseManager.reserveStock(itemId: item.id, orderId: orderId, quantity: wanted)
                onReserved()
                dismiss()
            } catch {
                self.error = error.localizedDescription
                busy = false
            }
        }
    }
}
