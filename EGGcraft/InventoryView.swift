import Combine
import SwiftUI

// Inventory on Mac and iPhone. Three tabs over one idea: what the workshop
// owns (Items), what it bought (Purchases), and who it bought from (Suppliers).
//
// Everything that decides money or status is a server call. This file draws.


enum InventoryTab: String, CaseIterable {
    case items, purchases, suppliers, stocktake, reports

    var label: String {
        switch self {
        case .items: return "Items"
        case .purchases: return "Purchases"
        case .suppliers: return "Suppliers"
        case .stocktake: return "Stocktake"
        case .reports: return "Reports"
        }
    }
}

@MainActor
final class InventoryScreenModel: ObservableObject {
    @Published var items: [InventoryItem] = []
    @Published var summary = InventorySummary([:])
    @Published var purchases: [Purchase] = []
    @Published var suppliers: [Supplier] = []
    @Published var loading = false
    @Published var notice = ""

    func loadItems(_ manager: FirebaseManager) async {
        loading = true
        do {
            async let list = manager.loadInventoryItems()
            async let totals = manager.loadInventorySummary()
            items = try await list
            summary = try await totals
            notice = ""
        } catch {
            notice = error.localizedDescription
        }
        loading = false
    }

    func loadPurchases(_ manager: FirebaseManager) async {
        do { purchases = try await manager.loadPurchases() }
        catch { notice = error.localizedDescription }
    }

    func loadSuppliers(_ manager: FirebaseManager) async {
        do { suppliers = try await manager.loadSuppliers().sorted { $0.spent > $1.spent } }
        catch { notice = error.localizedDescription }
    }
}

struct InventoryView: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @EnvironmentObject var authVM: AuthViewModel
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    @AppStorage("seciliParaBirimi") private var seciliParaBirimi: String = "£"

    @StateObject private var model = InventoryScreenModel()
    @State private var tab: InventoryTab = .items
    @State private var search = ""
    @State private var categoryFilter = ""
    @State private var typeFilter: InventoryTrackingType?
    @State private var statusFilter: InventoryStatus?
    @State private var showNewItem = false
    @State private var showOpeningStock = false
    @State private var photosFor: InventoryItem?
    @State private var detailItem: InventoryItem?
    @State private var showNewPurchase = false
    @State private var editingSupplier: Supplier?
    @State private var showNewSupplier = false
    @State private var matchingPurchase: Purchase?

    private var isPhone: Bool { horizontalSizeClass == .compact }
    private var cardBackground: Color { colorScheme == .dark ? Color.white.opacity(0.05) : Color.white }
    // Inventory rides the orders permission: someone who cannot see orders has
    // no reason to see what the workshop owns.
    private var canEdit: Bool { authVM.isCompanyOwner || (authVM.currentWorkspaceAccess["orders"] ?? false) }

    private var visibleItems: [InventoryItem] {
        let needle = search.trimmingCharacters(in: .whitespaces).lowercased()
        return model.items.filter { item in
            if !categoryFilter.isEmpty && item.category != categoryFilter { return false }
            if let typeFilter, item.trackingType != typeFilter { return false }
            if let statusFilter, item.status != statusFilter { return false }
            if needle.isEmpty { return true }
            return [item.name, item.brand, item.model, item.reference, item.serialNumber, item.sku, item.number]
                .contains { $0.lowercased().contains(needle) }
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                tabBar

                if !model.notice.isEmpty {
                    Text(model.notice).font(.system(size: 12)).foregroundColor(.red)
                }

                switch tab {
                case .items: itemsTab
                case .purchases: purchasesTab
                case .suppliers: suppliersTab
                case .stocktake:
                    StocktakeTab(currencySymbol: seciliParaBirimi, lang: seciliDil, canEdit: canEdit) {
                        Task { await model.loadItems(firebaseManager) }
                    }
                    .environmentObject(firebaseManager)
                case .reports:
                    ReportsTab(currencySymbol: seciliParaBirimi, lang: seciliDil)
                        .environmentObject(firebaseManager)
                }
            }
            .padding(isPhone ? 14 : 22)
        }
        .task { await model.loadItems(firebaseManager) }
        .sheet(item: $detailItem) { item in
            ItemDetailSheet(
                item: item,
                currencySymbol: seciliParaBirimi,
                lang: seciliDil,
                canEdit: canEdit
            ) {
                Task { await model.loadItems(firebaseManager) }
            }
            .environmentObject(firebaseManager)
        }
        .sheet(item: $photosFor) { item in
            ItemPhotosSheet(item: item, lang: seciliDil, canEdit: canEdit) {
                Task { await model.loadItems(firebaseManager) }
            }
            .environmentObject(firebaseManager)
        }
        .sheet(isPresented: $showOpeningStock) {
            OpeningStockSheet(currencySymbol: seciliParaBirimi, lang: seciliDil) { count in
                model.notice = "\(count) " + t("items were imported as opening stock.", lang: seciliDil)
                Task { await model.loadItems(firebaseManager) }
            }
            .environmentObject(firebaseManager)
        }
        .sheet(isPresented: $showNewItem) {
            NewInventoryItemSheet(currencySymbol: seciliParaBirimi, lang: seciliDil) {
                Task { await model.loadItems(firebaseManager) }
            }
            .environmentObject(firebaseManager)
        }
        .sheet(isPresented: $showNewPurchase) {
            NewPurchaseSheet(
                currencySymbol: seciliParaBirimi,
                lang: seciliDil,
                supplierNames: model.suppliers.map(\.name)
            ) {
                Task {
                    await model.loadPurchases(firebaseManager)
                    await model.loadItems(firebaseManager)
                }
            }
            .environmentObject(firebaseManager)
        }
        .sheet(item: $matchingPurchase) { purchase in
            MatchPaymentSheet(purchase: purchase, currencySymbol: seciliParaBirimi, lang: seciliDil) {
                Task { await model.loadPurchases(firebaseManager) }
            }
            .environmentObject(firebaseManager)
        }
        .sheet(isPresented: $showNewSupplier) {
            SupplierSheet(supplier: nil, lang: seciliDil) {
                Task { await model.loadSuppliers(firebaseManager) }
            }
            .environmentObject(firebaseManager)
        }
        .sheet(item: $editingSupplier) { supplier in
            SupplierSheet(supplier: supplier, lang: seciliDil) {
                Task { await model.loadSuppliers(firebaseManager) }
            }
            .environmentObject(firebaseManager)
        }
    }

    private var header: some View {
        HStack {
            Text(t("Inventory", lang: seciliDil)).font(.system(size: 22, weight: .bold))
            Spacer()
            if canEdit {
                switch tab {
                case .items:
                    if !isPhone {
                        Button { showOpeningStock = true } label: {
                            Text(t("Import opening stock", lang: seciliDil))
                        }
                        .buttonStyle(.bordered)
                    }
                    Button { showNewItem = true } label: { Label(t("Add Item", lang: seciliDil), systemImage: "plus") }
                        .buttonStyle(.borderedProminent)
                case .purchases:
                    Button { showNewPurchase = true } label: { Label(t("New Purchase", lang: seciliDil), systemImage: "plus") }
                        .buttonStyle(.borderedProminent)
                case .suppliers:
                    Button { showNewSupplier = true } label: { Label(t("New Supplier", lang: seciliDil), systemImage: "plus") }
                        .buttonStyle(.borderedProminent)
                case .stocktake, .reports:
                    EmptyView()
                }
            }
        }
    }

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 4) {
            ForEach(InventoryTab.allCases, id: \.self) { entry in
                Button {
                    tab = entry
                    Task {
                        switch entry {
                        case .items: if model.items.isEmpty { await model.loadItems(firebaseManager) }
                        case .purchases:
                            await model.loadPurchases(firebaseManager)
                            if model.suppliers.isEmpty { await model.loadSuppliers(firebaseManager) }
                        case .suppliers: await model.loadSuppliers(firebaseManager)
                        case .stocktake, .reports: break
                        }
                    }
                } label: {
                    Text(t(entry.label, lang: seciliDil))
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(tab == entry ? .blue : .secondary)
                        .padding(.horizontal, 13).padding(.vertical, 8)
                        .overlay(alignment: .bottom) {
                            Rectangle().fill(tab == entry ? Color.blue : .clear).frame(height: 2)
                        }
                }
                .buttonStyle(.plain)
                .fixedSize()
            }
            Spacer()
        }
        }
        .overlay(alignment: .bottom) { Divider() }
    }

    // MARK: Items

    private var itemsTab: some View {
        VStack(alignment: .leading, spacing: 14) {
            if isPhone && canEdit {
                Button(t("Import opening stock", lang: seciliDil)) { showOpeningStock = true }
                    .font(.system(size: 12, weight: .semibold))
                    .buttonStyle(.plain).foregroundColor(.blue)
            }
            statsGrid
            if model.summary.customerOwnedCount > 0 {
                Text(customerOwnedNote)
                    .font(.system(size: 11)).foregroundColor(.secondary)
            }
            filters

            if model.loading && model.items.isEmpty {
                Text(t("Loading…", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.secondary)
            } else if visibleItems.isEmpty {
                VStack(spacing: 8) {
                    emptyBox(
                        title: model.items.isEmpty ? t("Nothing in inventory yet", lang: seciliDil) : t("No items match these filters", lang: seciliDil),
                        body: model.items.isEmpty ? t("Add your first item, or import your opening stock.", lang: seciliDil) : ""
                    )
                    if model.items.isEmpty && canEdit {
                        Button(t("Import your opening stock", lang: seciliDil)) { showOpeningStock = true }
                            .font(.system(size: 12, weight: .semibold))
                            .buttonStyle(.plain).foregroundColor(.blue)
                    }
                }
            } else {
                LazyVStack(spacing: 8) {
                    ForEach(visibleItems) { item in itemRow(item) }
                }
            }
        }
    }

    private var customerOwnedNote: String {
        let count = model.summary.customerOwnedCount
        return "\(count) " + t("customer-owned items are held here and deliberately valued at zero — they are the customer's property, not stock.", lang: seciliDil)
    }

    /// "+2.3% this month" — only when the ledger covers the whole window, same
    /// rule as the web. A percentage over a period the ledger does not cover
    /// would be an invented number, so it is simply not shown.
    private var monthlyChangeLine: String {
        let change = model.summary.monthlyChange
        guard change.available else { return "" }
        let pct = change.pct == change.pct.rounded() ? String(Int(change.pct)) : String(change.pct)
        return (change.pct > 0 ? "+" : "") + pct + "% " + t("this month", lang: seciliDil)
    }

    private var statsGrid: some View {
        let cards: [(String, String, String)] = [
            (t("Total Inventory Value", lang: seciliDil), inventoryMoney(seciliParaBirimi, model.summary.totalValue), monthlyChangeLine),
            (t("Unique Items", lang: seciliDil), "\(model.summary.uniqueCount)", inventoryMoney(seciliParaBirimi, model.summary.uniqueValue)),
            (t("Quantity Items", lang: seciliDil), "\(model.summary.quantityCount)", inventoryMoney(seciliParaBirimi, model.summary.quantityValue)),
            (t("Reserved for Orders", lang: seciliDil), inventoryMoney(seciliParaBirimi, model.summary.reservedValue), "\(model.summary.reservedCount) " + t("items", lang: seciliDil)),
            (t("Incoming", lang: seciliDil), "\(model.summary.incomingCount)", inventoryMoney(seciliParaBirimi, model.summary.incomingValue)),
            (t("Low Stock", lang: seciliDil), "\(model.summary.lowStockCount)", "")
        ]
        return LazyVGrid(columns: [GridItem(.adaptive(minimum: isPhone ? 145 : 165), spacing: 10)], spacing: 10) {
            ForEach(cards, id: \.0) { card in
                VStack(alignment: .leading, spacing: 3) {
                    Text(card.0).font(.system(size: 10, weight: .bold)).foregroundColor(.secondary)
                    Text(card.1).font(.system(size: 18, weight: .bold))
                    if !card.2.isEmpty {
                        Text(card.2).font(.system(size: 11)).foregroundColor(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 12).fill(cardBackground))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.gray.opacity(0.18)))
            }
        }
    }

    private var filters: some View {
        VStack(spacing: 8) {
            TextField(t("Search items, brand, ref, serial, SKU…", lang: seciliDil), text: $search)
                .textFieldStyle(.roundedBorder)
            ScrollView(.horizontal, showsIndicators: false) {
              HStack(spacing: 8) {
                Picker(t("Category", lang: seciliDil), selection: $categoryFilter) {
                    Text(t("All Categories", lang: seciliDil)).tag("")
                    ForEach(inventoryCategories, id: \.self) { Text(t($0, lang: seciliDil)).tag($0) }
                }
                Picker(t("Type", lang: seciliDil), selection: $typeFilter) {
                    Text(t("All Types", lang: seciliDil)).tag(InventoryTrackingType?.none)
                    ForEach(InventoryTrackingType.allCases, id: \.self) {
                        Text(t($0.label, lang: seciliDil)).tag(InventoryTrackingType?.some($0))
                    }
                }
                Picker(t("Status", lang: seciliDil), selection: $statusFilter) {
                    Text(t("All Status", lang: seciliDil)).tag(InventoryStatus?.none)
                    ForEach(InventoryStatus.allCases, id: \.self) {
                        Text(t($0.label, lang: seciliDil)).tag(InventoryStatus?.some($0))
                    }
                }
              }
              .pickerStyle(.menu)
              .font(.system(size: 12))
              .fixedSize()
              .padding(.trailing, 2)
            }
        }
    }

    private func itemRow(_ item: InventoryItem) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(item.name).font(.system(size: 14, weight: .semibold))
                Text([item.number, item.reference.isEmpty ? "" : "Ref. \(item.reference)", item.serialNumber]
                    .filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.system(size: 11)).foregroundColor(.secondary)
                HStack(spacing: 6) {
                    statusPill(item)
                    Text(t(item.trackingType.label, lang: seciliDil))
                        .font(.system(size: 10, weight: .bold))
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(Capsule().fill(Color.blue.opacity(0.12)))
                        .foregroundColor(.blue)
                    if !item.location.isEmpty {
                        Text(item.location).font(.system(size: 10)).foregroundColor(.secondary)
                    }
                    Button {
                        photosFor = item
                    } label: {
                        Text(item.photos.isEmpty ? "📷" : "📷 \(item.photos.count)")
                            .font(.system(size: 10))
                    }
                    .buttonStyle(.plain)
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 3) {
                Text(item.ownership == .customer
                     ? t("Customer's", lang: seciliDil)
                     : inventoryMoney(seciliParaBirimi, item.lineValue))
                    .font(.system(size: 13, weight: .bold))
                Text(item.trackingType == .quantity
                     ? "\(formatQuantity(item.displayOnHand))\(item.unit.isEmpty ? "" : " \(item.unit)")"
                     : "")
                    .font(.system(size: 11)).foregroundColor(.secondary)
                if canEdit {
                    // Only the transitions the server's map accepts — and never
                    // "reserved": reserving must go through the Reserve for
                    // Order flow (reserveInventoryForOrder), which links an
                    // order; a bare status flip would promise the item to
                    // nobody and the order screens would never see it.
                    Menu(t("Move to…", lang: seciliDil)) {
                        ForEach(item.allowedNextStatuses, id: \.self) { status in
                            Button(t(status.label, lang: seciliDil)) {
                                Task {
                                    do {
                                        try await firebaseManager.setInventoryItemStatus(item.id, status: status)
                                        await model.loadItems(firebaseManager)
                                    } catch { model.notice = error.localizedDescription }
                                }
                            }
                        }
                    }
                    .font(.system(size: 11))
                }
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12).fill(cardBackground))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.gray.opacity(0.16)))
        // The whole row opens the item; the photo button and the status menu
        // inside it keep their own taps — SwiftUI gives controls priority over
        // the container gesture.
        .contentShape(Rectangle())
        .onTapGesture { detailItem = item }
    }

    private func statusPill(_ item: InventoryItem) -> some View {
        let low = item.isLowStock && item.status == .available
        let text = low ? t("Low Stock", lang: seciliDil) : t(item.status.label, lang: seciliDil)
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

    // MARK: Purchases

    private var purchasesTab: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(t("What you bought, from whom, and what it cost — the record a bank payment gets matched to.", lang: seciliDil))
                .font(.system(size: 11)).foregroundColor(.secondary)

            if model.purchases.isEmpty {
                emptyBox(
                    title: t("No purchases yet", lang: seciliDil),
                    body: t("Record what you buy here and the stock is created for you — held as incoming until you mark it received.", lang: seciliDil)
                )
            } else {
                LazyVStack(spacing: 8) {
                    ForEach(model.purchases) { purchase in purchaseRow(purchase) }
                }
            }
        }
    }

    private func purchaseRow(_ purchase: Purchase) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(purchase.number).font(.system(size: 14, weight: .bold))
                    Text([purchase.supplierName, purchase.purchaseDate].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.system(size: 11)).foregroundColor(.secondary)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 3) {
                    Text(inventoryMoney(seciliParaBirimi, purchase.total)).font(.system(size: 14, weight: .bold))
                    Text("\(purchase.lineCount) " + t("items", lang: seciliDil))
                        .font(.system(size: 11)).foregroundColor(.secondary)
                }
            }
            HStack(spacing: 8) {
                Text(purchase.isReceived ? t("Received", lang: seciliDil) : t("Ordered", lang: seciliDil))
                    .font(.system(size: 10, weight: .bold))
                    .padding(.horizontal, 7).padding(.vertical, 2)
                    .background(Capsule().fill((purchase.isReceived ? Color.green : Color.blue).opacity(0.14)))
                    .foregroundColor(purchase.isReceived ? .green : .blue)

                if purchase.bankTransactionId.isEmpty {
                    if canEdit {
                        Button(t("Match payment", lang: seciliDil)) { matchingPurchase = purchase }
                            .font(.system(size: 11, weight: .semibold)).buttonStyle(.plain).foregroundColor(.blue)
                    }
                } else {
                    Text(t("Payment matched", lang: seciliDil)).font(.system(size: 10, weight: .bold)).foregroundColor(.green)
                }

                Spacer()

                if canEdit && !purchase.isReceived {
                    Button(t("Mark received", lang: seciliDil)) {
                        Task {
                            do {
                                try await firebaseManager.receivePurchase(purchase.id)
                                await model.loadPurchases(firebaseManager)
                                await model.loadItems(firebaseManager)
                            } catch { model.notice = error.localizedDescription }
                        }
                    }
                    .font(.system(size: 11, weight: .semibold)).buttonStyle(.plain).foregroundColor(.blue)

                    Button(t("Delete", lang: seciliDil)) {
                        Task {
                            do {
                                try await firebaseManager.deletePurchase(purchase.id)
                                await model.loadPurchases(firebaseManager)
                                await model.loadItems(firebaseManager)
                            } catch { model.notice = error.localizedDescription }
                        }
                    }
                    .font(.system(size: 11, weight: .semibold)).buttonStyle(.plain).foregroundColor(.red)
                }
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12).fill(cardBackground))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.gray.opacity(0.16)))
    }

    // MARK: Suppliers

    private var suppliersTab: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(t("Who you buy from, and what you have spent with each of them.", lang: seciliDil))
                .font(.system(size: 11)).foregroundColor(.secondary)

            if model.suppliers.isEmpty {
                emptyBox(
                    title: t("No suppliers yet", lang: seciliDil),
                    body: t("Suppliers appear here as soon as you record a purchase from them.", lang: seciliDil)
                )
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: isPhone ? 260 : 250), spacing: 10)], spacing: 10) {
                    ForEach(model.suppliers, id: \.listKey) { supplier in supplierCard(supplier) }
                }
            }
        }
    }

    private func supplierCard(_ supplier: Supplier) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(supplier.name).font(.system(size: 14, weight: .bold))
                Spacer()
                if canEdit {
                    Button(supplier.isImplied ? t("Add details", lang: seciliDil) : t("Edit", lang: seciliDil)) {
                        editingSupplier = supplier
                    }
                    .font(.system(size: 11, weight: .semibold)).buttonStyle(.plain).foregroundColor(.blue)
                }
            }
            if !supplier.email.isEmpty || !supplier.phone.isEmpty {
                Text([supplier.email, supplier.phone].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.system(size: 11)).foregroundColor(.secondary)
            }
            HStack(spacing: 14) {
                supplierStat(t("Spent", lang: seciliDil), inventoryMoney(seciliParaBirimi, supplier.spent))
                supplierStat(t("Purchases", lang: seciliDil), "\(supplier.purchaseCount)")
                supplierStat(t("Items", lang: seciliDil), "\(supplier.lineCount)")
            }
            if supplier.purchaseCount > supplier.matchedCount {
                Text("\(supplier.purchaseCount - supplier.matchedCount) " + t("purchases with no payment matched", lang: seciliDil))
                    .font(.system(size: 10, weight: .semibold)).foregroundColor(.orange)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(13)
        .background(RoundedRectangle(cornerRadius: 13).fill(cardBackground))
        .overlay(RoundedRectangle(cornerRadius: 13).stroke(Color.gray.opacity(0.16)))
    }

    private func supplierStat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label).font(.system(size: 9, weight: .bold)).foregroundColor(.secondary)
            Text(value).font(.system(size: 13, weight: .bold))
        }
    }

    private func emptyBox(title: String, body: String) -> some View {
        VStack(spacing: 6) {
            Text(title).font(.system(size: 14, weight: .bold))
            if !body.isEmpty {
                Text(body).font(.system(size: 12)).foregroundColor(.secondary).multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 34).padding(.horizontal, 16)
        .background(RoundedRectangle(cornerRadius: 13).fill(cardBackground))
        .overlay(RoundedRectangle(cornerRadius: 13).stroke(Color.gray.opacity(0.16)))
    }
}

func formatQuantity(_ value: Double) -> String {
    value == value.rounded() ? String(Int(value)) : String(format: "%.2f", value)
}
