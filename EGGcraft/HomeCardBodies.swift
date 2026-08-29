import Foundation
import SwiftUI

/// The eleven card bodies. Each one is its own struct — see the note in
/// HomeView.swift about the SwiftUI stack guard on real hardware.
///
/// A size is not a crop. 1×1 answers one question, 2×1 adds the breakdown that
/// makes the number actionable, and 2×2 adds the list you would otherwise open
/// the full screen to read (§2).

struct HomeCardBody: View {
    let id: HomeCardID
    let size: HomeCardSize
    let lang: String
    let currency: String
    let decimal: String
    let stepsJSON: String
    let access: HomeAccess
    @ObservedObject var data: HomeData
    let onNewOrder: () -> Void
    let onOpen: (String) -> Void

    @EnvironmentObject var firebaseManager: FirebaseManager

    var body: some View {
        switch id {
        case .gettingStarted:
            HomeGettingStartedBody(size: size, lang: lang, data: data)
        case .quickActions:
            HomeQuickActionsBody(size: size, lang: lang, access: access, onNewOrder: onNewOrder, onOpen: onOpen)
        case .recentActivity:
            HomeRecentActivityBody(size: size, lang: lang)
        case .money:
            HomeMoneyBody(size: size, lang: lang, currency: currency, decimal: decimal)
        case .banking:
            HomeBankingBody(size: size, lang: lang, currency: currency, decimal: decimal)
        case .inventory:
            HomeInventoryBody(size: size, lang: lang, currency: currency, decimal: decimal, data: data)
        case .customers:
            HomeCustomersBody(size: size, lang: lang)
        case .ordersProduction:
            HomeOrdersProductionBody(size: size, lang: lang, stepsJSON: stepsJSON, data: data)
        case .schedule:
            HomeScheduleBody(size: size, lang: lang)
        case .files:
            HomeFilesBody(size: size, lang: lang)
        case .notes:
            HomeNotesBody(size: size, lang: lang, data: data)
        }
    }
}

// MARK: - Shared helpers

func homeMoney(_ value: Double, currency: String, decimal: String) -> String {
    let formatted = String(format: "%.2f", value)
    let shown = decimal == "," ? formatted.replacingOccurrences(of: ".", with: ",") : formatted
    return "\(currency)\(shown)"
}

/// Due date is the payment date plus the promised lead time — the same rule the
/// Production and Schedule screens use, never a second definition.
func homeDueDate(_ order: Siparis) -> Date? {
    Calendar.current.date(byAdding: .day, value: order.deliveryTime, to: order.paymentDate)
}

func homeLiveOrders(_ orders: [Siparis]) -> [Siparis] {
    orders.filter { !$0.isDeleted && !$0.isDelivered && $0.countsTowardBalance }
}

// MARK: - Getting started

struct HomeGettingStartedBody: View {
    let size: HomeCardSize
    let lang: String
    @ObservedObject var data: HomeData
    @EnvironmentObject var firebaseManager: FirebaseManager

    private var steps: [(String, Bool)] {
        let inventoryCount = (data.inventory?.uniqueCount ?? 0) + (data.inventory?.quantityCount ?? 0)
        let files = firebaseManager.siparisler.contains { !($0.clientFiles ?? []).isEmpty }
        return [
            ("Set up business profile", true),
            ("Add your first customer", !firebaseManager.musteriler.isEmpty),
            ("Create your first order", !firebaseManager.siparisler.isEmpty),
            ("Add an inventory item", inventoryCount > 0),
            ("Connect your bank", !firebaseManager.bankTransactions.isEmpty),
            ("Upload your first file", files),
        ]
    }

    var body: some View {
        let done = steps.filter { $0.1 }.count
        VStack(alignment: .leading, spacing: 8) {
            Text(t("{done} of {total} complete", lang: lang)
                .replacingOccurrences(of: "{done}", with: "\(done)")
                .replacingOccurrences(of: "{total}", with: "\(steps.count)"))
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.secondary)
            ProgressView(value: Double(done), total: Double(steps.count))
                .tint(.blue)
            // Never blocking, never a payment prompt (§15).
            if let next = steps.first(where: { !$0.1 }) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(t("Up next", lang: lang).uppercased())
                        .font(.system(size: 9, weight: .heavy))
                        .foregroundColor(.blue)
                    Text(t(next.0, lang: lang))
                        .font(.system(size: 14, weight: .bold))
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.blue.opacity(0.08))
                .cornerRadius(8)
            } else {
                HomeCardNote(text: t("All set — nice work.", lang: lang))
            }
            if size != .oneByOne {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(Array(steps.prefix(size == .twoByTwo ? 6 : 3).enumerated()), id: \.offset) { _, step in
                        HStack(spacing: 6) {
                            Image(systemName: step.1 ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 10))
                                .foregroundColor(step.1 ? .green : .secondary.opacity(0.5))
                            Text(t(step.0, lang: lang))
                                .font(.system(size: 11))
                                .strikethrough(step.1, color: .secondary)
                                .foregroundColor(step.1 ? .secondary : .primary)
                                .lineLimit(1)
                        }
                    }
                }
            }
            Spacer(minLength: 0)
        }
    }
}

// MARK: - Quick actions

struct HomeQuickActionsBody: View {
    let size: HomeCardSize
    let lang: String
    let access: HomeAccess
    let onNewOrder: () -> Void
    let onOpen: (String) -> Void

    private var actions: [(String, String, Bool)] {
        // (label, destination, primary) — an action the role cannot perform is
        // hidden and the grid closes up behind it (§6).
        var rows: [(String, String, Bool)] = []
        if access.orders { rows.append(("New order", "", true)) }
        if access.customers { rows.append(("Add customer", "Customers", false)) }
        if access.notes { rows.append(("Add note", "Notes", false)) }
        if access.files { rows.append(("Upload file", "Files", false)) }
        if access.orders { rows.append(("Add inventory item", "Inventory", false)) }
        if access.bankFeed { rows.append(("Review spending", "BankSpending", false)) }
        if access.bankFeed { rows.append(("Add receipt", "BankSpending", false)) }
        rows.append(("AI reply", "Messages", false))
        return rows
    }

    var body: some View {
        let limit = size == .oneByOne ? 4 : (size == .twoByOne ? 6 : 8)
        let shown = Array(actions.prefix(limit))
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
            ForEach(Array(shown.enumerated()), id: \.offset) { _, action in
                Button {
                    if action.1.isEmpty { onNewOrder() } else { onOpen(action.1) }
                } label: {
                    Text(t(action.0, lang: lang))
                        .font(.system(size: 11, weight: .bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(action.2 ? Color.blue : Color.primary.opacity(0.06))
                        .foregroundColor(action.2 ? .white : .primary)
                        .cornerRadius(8)
                }
                .buttonStyle(.plain)
            }
        }
        Spacer(minLength: 0)
    }
}

// MARK: - Recent activity

struct HomeRecentActivityBody: View {
    let size: HomeCardSize
    let lang: String
    @EnvironmentObject var firebaseManager: FirebaseManager

    var body: some View {
        // Only what the signed-in user is a recipient of — activity never widens
        // what someone can see (§12).
        let rows = firebaseManager.activityNotifications.prefix(size == .oneByOne ? 3 : (size == .twoByOne ? 4 : 8))
        if rows.isEmpty {
            HomeCardNote(text: t("Nothing here yet.", lang: lang))
        } else {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(rows), id: \.id) { item in
                    VStack(alignment: .leading, spacing: 0) {
                        HomeRow(title: item.title.isEmpty ? t("Update", lang: lang) : item.title,
                                detail: homeRelative(item.createdAt, lang: lang))
                        if size != .oneByOne, !item.message.isEmpty {
                            Text(item.message)
                                .font(.system(size: 10))
                                .foregroundColor(.secondary)
                                .lineLimit(1)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
            }
        }
        Spacer(minLength: 0)
    }
}

func homeRelative(_ date: Date, lang: String) -> String {
    let minutes = max(0, Int(Date().timeIntervalSince(date) / 60))
    if minutes < 60 { return "\(max(1, minutes)) \(t("min ago", lang: lang))" }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: localeIdentifier(forLanguage: lang))
    formatter.dateStyle = .short
    formatter.timeStyle = .none
    return formatter.string(from: date)
}

// MARK: - Money

struct HomeMoneyBody: View {
    let size: HomeCardSize
    let lang: String
    let currency: String
    let decimal: String
    @EnvironmentObject var firebaseManager: FirebaseManager

    var body: some View {
        // The commercial result, never the bank feed's transaction list (§7).
        let orders = firebaseManager.siparisler.filter { !$0.isDeleted && $0.countsTowardBalance }
        if orders.isEmpty {
            HomeCardNote(text: t("Nothing here yet.", lang: lang))
        } else {
            let revenue = orders.reduce(0.0) { $0 + $1.salesTotal }
            let received = orders.reduce(0.0) { $0 + $1.paidAmount }
            let outstanding = orders.reduce(0.0) { $0 + $1.remainingAmount + $1.customRemainingTotal }
            let profit = orders.reduce(0.0) { $0 + $1.netKar }
            let costs = revenue - profit
            VStack(alignment: .leading, spacing: 8) {
                if size == .oneByOne {
                    Text(homeMoney(profit, currency: currency, decimal: decimal))
                        .font(.system(size: 22, weight: .heavy))
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                    Text(t("Net profit", lang: lang))
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.secondary)
                    Text("\(t("Outstanding", lang: lang)): \(homeMoney(outstanding, currency: currency, decimal: decimal))")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(outstanding > 0 ? .orange : .secondary)
                } else {
                    HStack(spacing: 10) {
                        HomeStat(label: t("Revenue", lang: lang), value: homeMoney(revenue, currency: currency, decimal: decimal))
                        HomeStat(label: t("Payments received", lang: lang), value: homeMoney(received, currency: currency, decimal: decimal))
                        HomeStat(label: t("Outstanding", lang: lang), value: homeMoney(outstanding, currency: currency, decimal: decimal), tone: outstanding > 0 ? .orange : .primary)
                        HomeStat(label: t("Net profit", lang: lang), value: homeMoney(profit, currency: currency, decimal: decimal), tone: profit >= 0 ? .green : .red)
                    }
                    if size == .twoByTwo {
                        Divider()
                        Text(t("Cost breakdown", lang: lang))
                            .font(.system(size: 10, weight: .heavy))
                            .foregroundColor(.secondary)
                        HomeRow(title: t("Costs", lang: lang), detail: homeMoney(costs, currency: currency, decimal: decimal))
                        HomeRow(title: t("Platform fees", lang: lang), detail: homeMoney(orders.reduce(0.0) { $0 + $1.paymentFee }, currency: currency, decimal: decimal))
                        HomeRow(title: t("Shipping", lang: lang), detail: homeMoney(orders.reduce(0.0) { $0 + $1.deliveryCost }, currency: currency, decimal: decimal))
                    }
                }
                Spacer(minLength: 0)
            }
        }
    }
}

// MARK: - Banking

struct HomeBankingBody: View {
    let size: HomeCardSize
    let lang: String
    let currency: String
    let decimal: String
    @EnvironmentObject var firebaseManager: FirebaseManager

    var body: some View {
        // How the bank work is going — never a second copy of Money's totals (§7).
        let transactions = firebaseManager.bankTransactions
        if transactions.isEmpty {
            HomeCardNote(text: t("Nothing here yet.", lang: lang))
        } else {
            let toReview = transactions.filter { $0.category.trimmingCharacters(in: .whitespaces).isEmpty }.count
            let missingReceipts = transactions.filter { !$0.hasReceipt && $0.amount < 0 }.count
            VStack(alignment: .leading, spacing: 8) {
                if size == .oneByOne {
                    Text("\(toReview)")
                        .font(.system(size: 26, weight: .heavy))
                        .foregroundColor(toReview > 0 ? .orange : .primary)
                    Text(t("to review", lang: lang))
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.secondary)
                    Text("\(missingReceipts) \(t("missing receipts", lang: lang))")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.secondary)
                } else {
                    HStack(spacing: 10) {
                        HomeStat(label: t("to review", lang: lang), value: "\(toReview)", tone: toReview > 0 ? .orange : .primary)
                        HomeStat(label: t("missing receipts", lang: lang), value: "\(missingReceipts)", tone: missingReceipts > 0 ? .orange : .primary)
                        HomeStat(label: t("Transactions", lang: lang), value: "\(transactions.count)")
                    }
                    if size == .twoByTwo {
                        Divider()
                        ForEach(Array(transactions.prefix(4)), id: \.id) { transaction in
                            HomeRow(title: transaction.counterparty.isEmpty ? transaction.description : transaction.counterparty,
                                    detail: homeMoney(transaction.amount, currency: currency, decimal: decimal),
                                    tone: transaction.amount < 0 ? .red : .green)
                        }
                    }
                }
                Text(t("Read-only bank connection. NivaDesk never moves money.", lang: lang))
                    .font(.system(size: 9))
                    .foregroundColor(.secondary.opacity(0.75))
                Spacer(minLength: 0)
            }
        }
    }
}

// MARK: - Inventory

struct HomeInventoryBody: View {
    let size: HomeCardSize
    let lang: String
    let currency: String
    let decimal: String
    @ObservedObject var data: HomeData

    var body: some View {
        if data.inventoryFailed {
            HomeCardNote(text: t("This could not be loaded.", lang: lang))
        } else if let summary = data.inventory {
            VStack(alignment: .leading, spacing: 8) {
                if size == .oneByOne {
                    Text(homeMoney(summary.totalValue, currency: currency, decimal: decimal))
                        .font(.system(size: 22, weight: .heavy))
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                    Text(t("total value", lang: lang))
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.secondary)
                    HStack(spacing: 10) {
                        Text("\(summary.lowStockCount) \(t("low stock", lang: lang))")
                            .foregroundColor(summary.lowStockCount > 0 ? .orange : .secondary)
                        Text("\(summary.incomingCount) \(t("incoming", lang: lang))")
                            .foregroundColor(.green)
                    }
                    .font(.system(size: 11, weight: .bold))
                } else {
                    HStack(spacing: 10) {
                        HomeStat(label: t("total value", lang: lang), value: homeMoney(summary.totalValue, currency: currency, decimal: decimal))
                        HomeStat(label: t("low stock", lang: lang), value: "\(summary.lowStockCount)", tone: summary.lowStockCount > 0 ? .orange : .primary)
                        HomeStat(label: t("Reserved", lang: lang), value: "\(summary.reservedCount)")
                        HomeStat(label: t("incoming", lang: lang), value: "\(summary.incomingCount)", tone: .green)
                    }
                    if size == .twoByTwo {
                        Divider()
                        // Unique and quantity are different things and stay apart (§8).
                        HomeRow(title: t("Unique items", lang: lang), detail: "\(summary.uniqueCount)")
                        HomeRow(title: t("Quantity stock", lang: lang), detail: "\(summary.quantityCount)")
                        HomeRow(title: t("Customer owned", lang: lang), detail: "\(summary.customerOwnedCount)")
                        HomeRow(title: t("Reserved", lang: lang), detail: homeMoney(summary.reservedValue, currency: currency, decimal: decimal))
                    }
                }
                Spacer(minLength: 0)
            }
        } else {
            HomeCardNote(text: t("Loading…", lang: lang))
        }
    }
}

// MARK: - Customers

struct HomeCustomersBody: View {
    let size: HomeCardSize
    let lang: String
    @EnvironmentObject var firebaseManager: FirebaseManager

    var body: some View {
        let customers = firebaseManager.musteriler
        if customers.isEmpty {
            HomeCardNote(text: t("Nothing here yet.", lang: lang))
        } else {
            let orders = firebaseManager.siparisler.filter { !$0.isDeleted }
            let activeNames = Set(homeLiveOrders(orders).map { $0.customerName.lowercased() })
            let owing = orders
                .filter { $0.countsTowardBalance && ($0.remainingAmount + $0.customRemainingTotal) > 0 }
                .map { $0.customerName.lowercased() }
            VStack(alignment: .leading, spacing: 8) {
                if size == .oneByOne {
                    Text("\(customers.count)")
                        .font(.system(size: 26, weight: .heavy))
                    Text(t("customers", lang: lang))
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.secondary)
                    Text("\(activeNames.count) \(t("active orders", lang: lang))")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.secondary)
                } else {
                    HStack(spacing: 10) {
                        HomeStat(label: t("customers", lang: lang), value: "\(customers.count)")
                        HomeStat(label: t("active orders", lang: lang), value: "\(activeNames.count)")
                        HomeStat(label: t("Outstanding", lang: lang), value: "\(Set(owing).count)", tone: owing.isEmpty ? .primary : .orange)
                    }
                    if size == .twoByTwo {
                        Divider()
                        ForEach(Array(customers.prefix(4)), id: \.id) { customer in
                            HomeRow(title: customer.name,
                                    detail: activeNames.contains(customer.name.lowercased())
                                        ? t("active orders", lang: lang) : "—")
                        }
                    }
                }
                Spacer(minLength: 0)
            }
        }
    }
}

// MARK: - Orders & production

struct HomeOrdersProductionBody: View {
    let size: HomeCardSize
    let lang: String
    let stepsJSON: String
    @ObservedObject var data: HomeData
    @EnvironmentObject var firebaseManager: FirebaseManager

    private var steps: [(id: String, title: String)] {
        guard let raw = stepsJSON.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([CustomStepDTO].self, from: raw) else {
            return [("design", "Design"), ("painting", "Painting")]
        }
        let rows = decoded
            .map { (id: $0.id.uuidString.lowercased(), title: $0.title.trimmingCharacters(in: .whitespaces)) }
            .filter { !$0.title.isEmpty }
        return rows.isEmpty ? [("design", "Design"), ("painting", "Painting")] : rows
    }

    var body: some View {
        let live = homeLiveOrders(firebaseManager.siparisler)
        if live.isEmpty {
            HomeCardNote(text: t("Nothing here yet.", lang: lang))
        } else {
            // The stage is never stored — it is derived from the order's own
            // steps, by the one rule every screen shares.
            let resolved = live.map { order -> (Siparis, ResolvedProductionStage) in
                let blocker = order.productionBlocker.flatMap { ProductionBlocker(reason: $0.reason, note: $0.note ?? "") }
                return (order, resolveProductionStage(
                    order: order,
                    stages: data.stages,
                    steps: steps,
                    overrideId: order.productionStageOverride ?? "",
                    blocker: ProductionBlocker.reasons.contains(blocker?.reason ?? "") ? blocker : nil
                ))
            }
            let blockedIDs = Set(data.stages.filter { $0.kind == .blocked }.map { $0.id })
            let blocked = resolved.filter { blockedIDs.contains($0.1.stageId) }.count
            VStack(alignment: .leading, spacing: 8) {
                if size == .oneByOne {
                    Text("\(live.count)")
                        .font(.system(size: 26, weight: .heavy))
                    Text(t("active orders", lang: lang))
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.secondary)
                    Text("\(blocked) \(t("Blocked", lang: lang))")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(blocked > 0 ? .red : .secondary)
                } else {
                    // The stage distribution is the card — the KPI row above it
                    // must not repeat the same numbers (§9).
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(data.stages.prefix(size == .twoByTwo ? 6 : 3), id: \.id) { stage in
                            let count = resolved.filter { $0.1.stageId == stage.id }.count
                            HomeRow(title: stage.title, detail: "\(count)",
                                    tone: stage.kind == .blocked && count > 0 ? .red : .secondary)
                        }
                    }
                    if size == .twoByTwo {
                        Divider()
                        Text(t("At risk", lang: lang))
                            .font(.system(size: 10, weight: .heavy))
                            .foregroundColor(.secondary)
                        let late = resolved
                            .filter { entry in
                                guard let due = homeDueDate(entry.0) else { return false }
                                return due < Date()
                            }
                            .prefix(3)
                        if late.isEmpty {
                            HomeCardNote(text: t("All set — nice work.", lang: lang))
                        } else {
                            ForEach(Array(late), id: \.0.id) { entry in
                                HomeRow(title: entry.0.customerName, detail: entry.1.currentStep, tone: .red)
                            }
                        }
                    }
                }
                Spacer(minLength: 0)
            }
        }
    }
}

// MARK: - Schedule

struct HomeScheduleBody: View {
    let size: HomeCardSize
    let lang: String
    @EnvironmentObject var firebaseManager: FirebaseManager

    var body: some View {
        // Dates and deadlines only — never a second copy of production status (§10).
        let upcoming = homeLiveOrders(firebaseManager.siparisler)
            .compactMap { order -> (Siparis, Date)? in
                guard let due = homeDueDate(order) else { return nil }
                return (order, due)
            }
            .sorted { $0.1 < $1.1 }
        if upcoming.isEmpty {
            HomeCardNote(text: t("Nothing here yet.", lang: lang))
        } else {
            let limit = size == .oneByOne ? 3 : (size == .twoByOne ? 4 : 7)
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(upcoming.prefix(limit)), id: \.0.id) { entry in
                    HomeRow(title: entry.0.customerName,
                            detail: homeDueLabel(entry.1, lang: lang),
                            tone: entry.1 < Date() ? .red : .secondary)
                }
                Spacer(minLength: 0)
            }
        }
    }
}

func homeDueLabel(_ date: Date, lang: String) -> String {
    let days = Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: Date()),
                                               to: Calendar.current.startOfDay(for: date)).day ?? 0
    if days == 0 { return t("Today", lang: lang) }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: localeIdentifier(forLanguage: lang))
    formatter.dateFormat = "d MMM"
    return formatter.string(from: date)
}

// MARK: - Files

struct HomeFilesBody: View {
    let size: HomeCardSize
    let lang: String
    @EnvironmentObject var firebaseManager: FirebaseManager

    var body: some View {
        // One file, linked to as many records as it belongs to — the card counts
        // files, not copies (§14).
        let files = firebaseManager.siparisler
            .filter { !$0.isDeleted }
            .flatMap { order in (order.clientFiles ?? []).map { (order, $0) } }
        if files.isEmpty {
            HomeCardNote(text: t("Nothing here yet.", lang: lang))
        } else {
            VStack(alignment: .leading, spacing: 8) {
                if size == .oneByOne {
                    Text("\(files.count)")
                        .font(.system(size: 26, weight: .heavy))
                    Text(t("File library", lang: lang))
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.secondary)
                } else {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(files.prefix(size == .twoByTwo ? 7 : 4).enumerated()), id: \.offset) { _, entry in
                            HomeRow(title: entry.1.fileName, detail: entry.0.customerName)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
        }
    }
}

// MARK: - Notes

struct HomeNotesBody: View {
    let size: HomeCardSize
    let lang: String
    @ObservedObject var data: HomeData

    var body: some View {
        // Notes only. Not files, not AI replies (§13). Pinned first.
        let notes = data.notes.sorted { first, second in
            if first.isPinned != second.isPinned { return first.isPinned }
            return first.updatedAt > second.updatedAt
        }
        if notes.isEmpty {
            HomeCardNote(text: t("Nothing here yet.", lang: lang))
        } else {
            let limit = size == .oneByOne ? 3 : (size == .twoByOne ? 4 : 7)
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(notes.prefix(limit)), id: \.id) { note in
                    HomeRow(title: note.title.isEmpty
                                ? String(note.text.prefix(40))
                                : note.title,
                            detail: note.isPinned ? "📌" : (note.linkedOrderLabel.isEmpty ? "" : note.linkedOrderLabel))
                }
                Spacer(minLength: 0)
            }
        }
    }
}
