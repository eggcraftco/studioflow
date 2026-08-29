import Foundation
import SwiftUI

/// The eleven card bodies, drawn from the reference sheet.
///
/// Each one is its own struct — deeply nested inline views in this app have
/// overflowed the SwiftUI stack guard on real hardware while behaving perfectly
/// in the simulator, and eleven cards with three variants each is that shape.
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
    /// Phone layout: the wide cards stack their figures instead of lining them up.
    var compact: Bool = false
    /// The range the card's totals cover; only the money cards read it.
    var period: HomeCardPeriod = .month
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
            HomeMoneyBody(size: size, lang: lang, currency: currency, decimal: decimal,
                          compact: compact, period: period)
        case .banking:
            HomeBankingBody(size: size, lang: lang, currency: currency, decimal: decimal, compact: compact, data: data)
        case .inventory:
            HomeInventoryBody(size: size, lang: lang, currency: currency, decimal: decimal, compact: compact, data: data)
        case .customers:
            HomeCustomersBody(size: size, lang: lang, compact: compact)
        case .ordersProduction:
            HomeOrdersProductionBody(size: size, lang: lang, stepsJSON: stepsJSON, compact: compact, data: data)
        case .schedule:
            HomeScheduleBody(size: size, lang: lang)
        case .files:
            HomeFilesBody(size: size, lang: lang, currency: currency, decimal: decimal, compact: compact)
        case .notes:
            HomeNotesBody(size: size, lang: lang, data: data)
        }
    }
}

// MARK: - Shared helpers

func homeMoney(_ value: Double, currency: String, decimal: String) -> String {
    "\(currency)\(formatFiyat(value, ondalik: decimal))"
}

/// Due date is the payment date plus the promised lead time — the same rule the
/// Production and Schedule screens use, never a second definition.
func homeDueDate(_ order: Siparis) -> Date? {
    Calendar.current.date(byAdding: .day, value: order.deliveryTime, to: order.paymentDate)
}

func homeLiveOrders(_ orders: [Siparis]) -> [Siparis] {
    orders.filter { !$0.isDeleted && !$0.isDelivered && $0.countsTowardBalance }
}

func homeStartOfToday() -> Date { Calendar.current.startOfDay(for: Date()) }

func homeDayLabel(_ date: Date, lang: String) -> String {
    let days = Calendar.current.dateComponents([.day], from: homeStartOfToday(),
                                               to: Calendar.current.startOfDay(for: date)).day ?? 0
    if days == 0 { return t("Today", lang: lang) }
    if days == 1 { return t("Tomorrow", lang: lang) }
    if days < 0 { return t("Overdue", lang: lang) }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: localeIdentifier(forLanguage: lang))
    formatter.dateFormat = "d MMM"
    return formatter.string(from: date)
}

// MARK: - Getting started

struct HomeSetupStep {
    let id: String
    let label: String
    let blurb: String
    let destination: String
    let cta: String
    let done: Bool
}

struct HomeGettingStartedBody: View {
    let size: HomeCardSize
    let lang: String
    @ObservedObject var data: HomeData
    @EnvironmentObject var firebaseManager: FirebaseManager

    private var steps: [HomeSetupStep] {
        let inventoryCount = (data.inventory?.uniqueCount ?? 0) + (data.inventory?.quantityCount ?? 0)
        let hasFiles = firebaseManager.siparisler.contains { !($0.clientFiles ?? []).isEmpty }
        let fromStore = firebaseManager.siparisler.contains {
            !(($0.customFields?["Shopify Status"] ?? "").isEmpty) || !(($0.customFields?["WooCommerce Status"] ?? "").isEmpty)
        }
        return [
            HomeSetupStep(id: "profile", label: "Set up business profile",
                          blurb: "Name, currency and tax so every document reads right.",
                          destination: "Settings", cta: "Open settings", done: true),
            HomeSetupStep(id: "customer", label: "Add your first customer",
                          blurb: "Orders, notes and files all hang off a customer.",
                          destination: "Customers", cta: "Add customer", done: !firebaseManager.musteriler.isEmpty),
            HomeSetupStep(id: "order", label: "Create your first order",
                          blurb: "The record everything else in NivaDesk attaches to.",
                          destination: "Orders", cta: "Create order", done: !firebaseManager.siparisler.isEmpty),
            HomeSetupStep(id: "shop", label: "Connect your shop",
                          blurb: "Bring Shopify or WooCommerce orders in automatically.",
                          destination: "Settings", cta: "Connect shop", done: fromStore),
            HomeSetupStep(id: "inventory", label: "Add an inventory item",
                          blurb: "Track what you own, what is reserved and what is low.",
                          destination: "Inventory", cta: "Add item", done: inventoryCount > 0),
            HomeSetupStep(id: "bank", label: "Connect your bank",
                          blurb: "Read-only. Spending arrives and you categorise it.",
                          destination: "BankSpending", cta: "Connect bank", done: hasFiles || !firebaseManager.bankTransactions.isEmpty),
        ]
    }

    var body: some View {
        let all = steps
        let done = all.filter { $0.done }
        let next = all.first { !$0.done }
        let todo = all.filter { !$0.done && $0.id != next?.id }

        VStack(alignment: .leading, spacing: 9) {
            // The count belongs at every size: the bar alone says "some" and the
            // sheet always pairs it with how many of how many.
            Text(t("{done} of {total} complete", lang: lang)
                .replacingOccurrences(of: "{done}", with: "\(done.count)")
                .replacingOccurrences(of: "{total}", with: "\(all.count)"))
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.secondary)
            HomeProgressBar(fraction: Double(done.count) / Double(all.count))

            if size == .oneByOne {
                if let step = next {
                    HomeEyebrow(text: t("Next step", lang: lang), strong: false)
                    HomeNextPanel(step: step, lang: lang, style: .compact)
                } else {
                    HomeCardNote(text: t("All set — nice work.", lang: lang))
                }
                // One remaining item at 1x1: the panel above it is the point, and a
                // second row pushed the footer link out of the card.
                ForEach(todo.prefix(1), id: \.id) { step in
                    HomeCheckRow(label: t(step.label, lang: lang), state: .todo)
                }
            } else if size == .twoByOne {
                HStack(alignment: .top, spacing: 16) {
                    VStack(alignment: .leading, spacing: 2) {
                        HomeEyebrow(text: t("Completed", lang: lang))
                        ForEach(done.prefix(3), id: \.id) { step in
                            HomeCheckRow(label: t(step.label, lang: lang), state: .done)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    VStack(alignment: .leading, spacing: 4) {
                        if let step = next {
                            HomeNextPanel(step: step, lang: lang, style: .inline)
                        } else {
                            HomeCardNote(text: t("All set — nice work.", lang: lang))
                        }
                        ForEach(todo.prefix(2), id: \.id) { step in
                            HomeCheckRow(label: t(step.label, lang: lang), state: .todo)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } else {
                HStack(alignment: .top, spacing: 12) {
                    HomePanel {
                        HomeEyebrow(text: t("Your checklist", lang: lang))
                        ForEach(all, id: \.id) { step in
                            HomeCheckRow(
                                label: t(step.label, lang: lang),
                                state: step.done ? .done : (step.id == next?.id ? .current : .todo)
                            )
                        }
                    }
                    if let step = next {
                        HomeNextPanel(step: step, lang: lang, style: .large)
                    } else {
                        HomePanel { HomeCardNote(text: t("All set — nice work.", lang: lang)) }
                    }
                }
                HStack(spacing: 10) {
                    Image(systemName: "lightbulb.fill")
                        .foregroundColor(HomeTone.accent)
                        .frame(width: 30, height: 30)
                        .background(Circle().fill(HomeTone.accent.opacity(0.10)))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(t("Your setup adapts to you", lang: lang)).font(.system(size: 12.5, weight: .bold))
                        Text(t("Steps change with your plan, permissions and workflow.", lang: lang))
                            .font(.system(size: 11)).foregroundColor(.secondary).lineLimit(1)
                    }
                    Spacer()
                }
                .padding(.horizontal, 12).padding(.vertical, 9)
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.primary.opacity(0.08), lineWidth: 1))
            }
            Spacer(minLength: 0)
        }
    }
}

/// A filled green tick for done, a blue arrow for the step you are on, a hollow
/// ring for the rest — the shape carries the state, not the colour alone (§20).
struct HomeCheckRow: View {
    enum State { case done, current, todo }
    let label: String
    let state: State

    var body: some View {
        HStack(spacing: 9) {
            mark
            Text(label)
                .font(.system(size: 12, weight: state == .current ? .bold : .regular))
                .foregroundColor(state == .done ? .secondary : (state == .current ? HomeTone.accent : .primary))
                .strikethrough(state == .done, color: .secondary)
                .lineLimit(1)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
        .padding(.horizontal, state == .current ? 8 : 0)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(state == .current ? HomeTone.accent.opacity(0.07) : .clear)
        )
    }

    @ViewBuilder private var mark: some View {
        switch state {
        case .done:
            Image(systemName: "checkmark.circle.fill").font(.system(size: 15)).foregroundColor(HomeTone.green)
        case .current:
            Image(systemName: "arrow.right.circle").font(.system(size: 15)).foregroundColor(HomeTone.accent)
        case .todo:
            Image(systemName: "circle").font(.system(size: 15)).foregroundColor(.secondary.opacity(0.5))
        }
    }
}

/// The recommendation. Blue enough to be the obvious next thing, calm enough
/// that it is not a payment prompt (§15).
struct HomeNextPanel: View {
    enum Style { case compact, inline, large }
    let step: HomeSetupStep
    let lang: String
    let style: Style

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if style == .large { eyebrow(t("Recommended next", lang: lang)) }
            if style == .inline { eyebrow(t("Up next", lang: lang)) }
            if style == .large {
                body(vertical: true)
            } else {
                body(vertical: style == .compact)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(HomeTone.accent.opacity(0.07)))
    }

    private func eyebrow(_ text: String) -> some View {
        Text(text).font(.system(size: 11, weight: .bold)).foregroundColor(HomeTone.accent)
    }

    @ViewBuilder private func body(vertical: Bool) -> some View {
        if vertical {
            VStack(alignment: .leading, spacing: 8) {
                title
                button
            }
        } else {
            HStack(alignment: .top, spacing: 10) {
                title
                Spacer(minLength: 4)
                button
            }
        }
    }

    private var title: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(t(step.label, lang: lang)).font(.system(size: 14, weight: .heavy)).lineLimit(1)
            Text(t(step.blurb, lang: lang)).font(.system(size: 11.5)).foregroundColor(.secondary).lineLimit(2)
        }
    }

    private var button: some View {
        Text(t(style == .inline ? "Continue" : step.cta, lang: lang))
            .font(.system(size: 12, weight: .bold))
            .foregroundColor(.white)
            .padding(.horizontal, 16).padding(.vertical, 8)
            .frame(maxWidth: style == .large ? .infinity : nil)
            .background(RoundedRectangle(cornerRadius: 9).fill(HomeTone.accent))
    }
}

// MARK: - Quick actions

struct HomeQuickAction {
    let label: String
    let destination: String
    let symbol: String
    let tone: Color
    let group: String
    let primary: Bool
}

struct HomeQuickActionsBody: View {
    let size: HomeCardSize
    let lang: String
    let access: HomeAccess
    let onNewOrder: () -> Void
    let onOpen: (String) -> Void

    /// An action the role cannot perform is hidden and the grid closes up behind
    /// it (§6).
    private var actions: [HomeQuickAction] {
        var rows: [HomeQuickAction] = []
        if access.orders { rows.append(HomeQuickAction(label: "New order", destination: "", symbol: "cart.badge.plus", tone: HomeTone.accent, group: "Create", primary: true)) }
        if access.customers { rows.append(HomeQuickAction(label: "Add customer", destination: "Customers", symbol: "person.badge.plus", tone: HomeTone.teal, group: "Create", primary: false)) }
        if access.notes { rows.append(HomeQuickAction(label: "Add note", destination: "Notes", symbol: "square.and.pencil", tone: HomeTone.amber, group: "Create", primary: false)) }
        if access.files { rows.append(HomeQuickAction(label: "Upload file", destination: "Files", symbol: "arrow.up.doc", tone: HomeTone.purple, group: "Capture", primary: false)) }
        if access.orders { rows.append(HomeQuickAction(label: "Add inventory item", destination: "Inventory", symbol: "shippingbox", tone: HomeTone.purple, group: "Create", primary: false)) }
        if access.bankFeed { rows.append(HomeQuickAction(label: "Scan receipt", destination: "BankSpending", symbol: "doc.viewfinder", tone: HomeTone.orange, group: "Capture", primary: false)) }
        // NivaDesk has no manual expense form: spending arrives from the read-only
        // bank feed and becomes an expense when it is categorised. Until one
        // exists this lands on the review queue, where that actually happens.
        if access.bankFeed { rows.append(HomeQuickAction(label: "Add expense", destination: "BankSpending", symbol: "creditcard", tone: HomeTone.accent, group: "Finance & communication", primary: false)) }
        rows.append(HomeQuickAction(label: "Generate AI reply", destination: "Messages", symbol: "sparkles", tone: HomeTone.green, group: "Finance & communication", primary: false))
        return rows
    }

    var body: some View {
        let rows = actions
        if size == .oneByOne {
            let shown = Array(rows.prefix(4))
            VStack(spacing: 8) {
                ForEach(0..<2, id: \.self) { row in
                    HStack(spacing: 8) {
                        ForEach(0..<2, id: \.self) { column in
                            let index = row * 2 + column
                            if index < shown.count {
                                HomeActionTile(action: shown[index], lang: lang) { fire(shown[index]) }
                            } else {
                                Color.clear
                            }
                        }
                    }
                }
            }
        } else if size == .twoByOne {
            let shown = Array(rows.prefix(6))
            VStack(spacing: 8) {
                ForEach(0..<3, id: \.self) { row in
                    HStack(spacing: 8) {
                        ForEach(0..<2, id: \.self) { column in
                            let index = row * 2 + column
                            if index < shown.count {
                                HomeActionRow(action: shown[index], lang: lang) { fire(shown[index]) }
                            } else {
                                Color.clear
                            }
                        }
                    }
                }
                Spacer(minLength: 0)
            }
        } else {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(["Create", "Capture", "Finance & communication"], id: \.self) { group in
                    let inGroup = rows.filter { $0.group == group }
                    if !inGroup.isEmpty {
                        HomeEyebrow(text: t(group, lang: lang))
                        ForEach(Array(stride(from: 0, to: inGroup.count, by: 2)), id: \.self) { start in
                            HStack(spacing: 8) {
                                HomeActionRow(action: inGroup[start], lang: lang) { fire(inGroup[start]) }
                                if start + 1 < inGroup.count {
                                    HomeActionRow(action: inGroup[start + 1], lang: lang) { fire(inGroup[start + 1]) }
                                } else {
                                    Color.clear
                                }
                            }
                        }
                    }
                }
                HStack(spacing: 6) {
                    Image(systemName: "info.circle").font(.system(size: 11))
                    Text(t("Actions follow your permissions", lang: lang)).font(.system(size: 11))
                }
                .foregroundColor(.secondary)
                Spacer(minLength: 0)
            }
        }
    }

    private func fire(_ action: HomeQuickAction) {
        if action.destination.isEmpty { onNewOrder() } else { onOpen(action.destination) }
    }
}

struct HomeActionTile: View {
    let action: HomeQuickAction
    let lang: String
    let tap: () -> Void
    var body: some View {
        Button(action: tap) {
            VStack(spacing: 7) {
                Image(systemName: action.symbol).font(.system(size: 25, weight: .regular))
                Text(t(action.label, lang: lang))
                    .font(.system(size: 11.5, weight: .bold))
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
            .foregroundColor(action.primary ? .white : action.tone)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(RoundedRectangle(cornerRadius: 12)
                .fill(action.primary ? HomeTone.accent : action.tone.opacity(0.11)))
        }
        .buttonStyle(.plain)
    }
}

struct HomeActionRow: View {
    let action: HomeQuickAction
    let lang: String
    let tap: () -> Void
    var body: some View {
        Button(action: tap) {
            HStack(spacing: 9) {
                Image(systemName: action.symbol).font(.system(size: 15))
                    .foregroundColor(action.primary ? .white : action.tone)
                Text(t(action.label, lang: lang))
                    .font(.system(size: 11.5, weight: .bold))
                    .foregroundColor(action.primary ? .white : .primary)
                    .lineLimit(1).minimumScaleFactor(0.75)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 11).padding(.vertical, 10)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(action.primary ? HomeTone.accent : Color.clear)
                    .overlay(RoundedRectangle(cornerRadius: 12)
                        .stroke(action.primary ? Color.clear : Color.primary.opacity(0.10), lineWidth: 1))
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Recent activity

/// Event type to colour. The title always names the event, so colour only
/// speeds up scanning — it never carries the meaning on its own (§20).
func homeActivityTone(_ type: String) -> Color {
    let key = type.lowercased()
    if key.contains("payment") { return HomeTone.green }
    if key.contains("order") { return HomeTone.purple }
    if key.contains("production") || key.contains("status") { return HomeTone.accent }
    if key.contains("file") { return HomeTone.amber }
    if key.contains("inventory") { return HomeTone.orange }
    if key.contains("customer") { return HomeTone.teal }
    if key.contains("schedule") { return HomeTone.accent }
    return HomeTone.slate
}

struct HomeRecentActivityBody: View {
    let size: HomeCardSize
    let lang: String
    @EnvironmentObject var firebaseManager: FirebaseManager

    var body: some View {
        // Only what the signed-in user is a recipient of — activity never widens
        // what someone can see (§12).
        let limit = size == .oneByOne ? 3 : (size == .twoByOne ? 5 : 8)
        let rows = Array(firebaseManager.activityNotifications.prefix(limit))
        if rows.isEmpty {
            HomeCardNote(text: t("Nothing here yet.", lang: lang))
        } else if size == .twoByTwo {
            let today = rows.filter { $0.createdAt >= homeStartOfToday() }
            let earlier = rows.filter { $0.createdAt < homeStartOfToday() }
            VStack(alignment: .leading, spacing: 6) {
                if !today.isEmpty {
                    HomeEyebrow(text: t("Today", lang: lang))
                    ForEach(today, id: \.id) { HomeActivityRow(item: $0, lang: lang, showActor: true) }
                }
                if !earlier.isEmpty {
                    HomeEyebrow(text: t("Earlier", lang: lang))
                    ForEach(earlier, id: \.id) { HomeActivityRow(item: $0, lang: lang, showActor: true) }
                }
                Text(t("Only activity you have permission to view is shown", lang: lang))
                    .font(.system(size: 11)).foregroundColor(.secondary)
                Spacer(minLength: 0)
            }
        } else {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(rows, id: \.id) { HomeActivityRow(item: $0, lang: lang, showActor: false) }
                Spacer(minLength: 0)
            }
        }
    }
}

struct HomeActivityRow: View {
    let item: StudioActivityNotification
    let lang: String
    let showActor: Bool

    var body: some View {
        HStack(spacing: 10) {
            Circle().fill(homeActivityTone(item.type)).frame(width: 24, height: 24)
            VStack(alignment: .leading, spacing: 1) {
                Text(item.title.isEmpty ? t("Update", lang: lang) : item.title)
                    .font(.system(size: 12, weight: .semibold)).lineLimit(1)
                if !item.message.isEmpty {
                    Text(item.message).font(.system(size: 11)).foregroundColor(.secondary).lineLimit(1)
                }
            }
            Spacer(minLength: 6)
            if showActor, !item.senderName.isEmpty {
                HomeChip(text: item.senderName, tone: HomeTone.slate)
            }
            Text(homeRelative(item.createdAt, lang: lang))
                .font(.system(size: 11)).foregroundColor(.secondary).lineLimit(1)
        }
        .padding(.vertical, 6)
    }
}

func homeRelative(_ date: Date, lang: String) -> String {
    let minutes = max(1, Int(Date().timeIntervalSince(date) / 60))
    if minutes < 60 { return "\(minutes) \(t("min ago", lang: lang))" }
    if date >= homeStartOfToday() { return "\(minutes / 60)h" }
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
    var compact: Bool = false
    var period: HomeCardPeriod = .month
    @EnvironmentObject var firebaseManager: FirebaseManager

    var body: some View {
        // The commercial result, never the bank feed's transaction list (§7).
        // The header says which window these totals cover, so they have to
        // actually cover it — same rule the Dashboard applies, against the
        // payment date.
        let window = period.range
        let orders = firebaseManager.siparisler.filter {
            !$0.isDeleted && $0.countsTowardBalance
                && $0.paymentDate >= window.start && $0.paymentDate <= window.end
        }
        if orders.isEmpty {
            HomeCardNote(text: t("Nothing here yet.", lang: lang))
        } else {
            let revenue = orders.reduce(0.0) { $0 + $1.salesTotal }
            let received = orders.reduce(0.0) { $0 + $1.paidAmount }
            let outstanding = orders.reduce(0.0) { $0 + $1.remainingAmount + $1.customRemainingTotal }
            let costs = orders.reduce(0.0) { $0 + $1.watchPurchasePrice }
            let fees = orders.reduce(0.0) { $0 + $1.paymentFee }
            let shipping = orders.reduce(0.0) { $0 + $1.deliveryCost }
            let vat = orders.reduce(0.0) { $0 + $1.taxAmount }
            let profit = orders.reduce(0.0) { $0 + $1.netKar }
            let money = { (value: Double) in homeMoney(value, currency: currency, decimal: decimal) }

            if size == .oneByOne {
                VStack(alignment: .leading, spacing: compact ? 8 : 12) {
                    Text(t("Net profit", lang: lang)).font(.system(size: compact ? 11 : 13)).foregroundColor(.secondary)
                    Text(money(profit))
                        .font(.system(size: compact ? 25 : 33, weight: .heavy))
                        .foregroundColor(profit >= 0 ? HomeTone.green : HomeTone.red)
                        .lineLimit(1).minimumScaleFactor(0.5)
                    Spacer(minLength: 0)
                    HomeSplitPair {
                        HomeFigure(label: t("Revenue", lang: lang), value: money(revenue), tone: HomeTone.green)
                    } right: {
                        HomeFigure(label: t("Outstanding", lang: lang), value: money(outstanding), tone: HomeTone.accent)
                    }
                    HomeRatioBar(revenue: revenue, costs: costs, lang: lang, money: money)
                }
            } else if size == .twoByOne && compact {
                // Four tiles across a phone leaves every label and every figure
                // truncated. The sheet stacks them two by two instead, and ends
                // with what share of revenue survives as profit.
                let margin = revenue > 0 ? max(0, min(1, profit / revenue)) : 0
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 0) {
                        HomeBankFigure(label: t("Revenue", lang: lang), value: money(revenue), tone: HomeTone.green)
                        Divider().frame(height: 34)
                        HomeBankFigure(label: t("Payments received", lang: lang), value: money(received), tone: HomeTone.green)
                    }
                    Divider().padding(.vertical, 9)
                    HStack(spacing: 0) {
                        HomeBankFigure(label: t("Outstanding", lang: lang), value: money(outstanding), tone: HomeTone.accent)
                        Divider().frame(height: 34)
                        HomeBankFigure(label: t("Net profit", lang: lang), value: money(profit),
                                       tone: profit >= 0 ? HomeTone.green : HomeTone.red)
                    }
                    Spacer(minLength: 8)
                    HStack(spacing: 10) {
                        Text("\(Int(margin * 100))%")
                            .font(.system(size: 12, weight: .semibold)).foregroundColor(.secondary)
                        HomeProgressBar(fraction: margin, tint: HomeTone.green)
                        Text(t("Profit of revenue", lang: lang))
                            .font(.system(size: 11.5)).foregroundColor(.secondary).lineLimit(1)
                    }
                }
            } else if size == .twoByOne {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 10) {
                        HomeMetricTile(label: t("Revenue", lang: lang), value: money(revenue), tone: HomeTone.green)
                        HomeMetricTile(label: t("Payments received", lang: lang), value: money(received), tone: HomeTone.green)
                        HomeMetricTile(label: t("Outstanding", lang: lang), value: money(outstanding), tone: HomeTone.accent)
                        HomeMetricTile(label: t("Net profit", lang: lang), value: money(profit), tone: profit >= 0 ? HomeTone.green : HomeTone.red)
                    }
                    HomeWaterfall(revenue: revenue, profit: profit,
                                  deductions: [(t("Costs", lang: lang), costs), (t("Platform fees", lang: lang), fees), (t("Shipping", lang: lang), shipping)],
                                  lang: lang, money: money)
                    Spacer(minLength: 0)
                }
            } else if compact {
                // On a phone the two panels cannot sit side by side — half a phone
                // turns the chart into a spike and truncates every cost. They each
                // take the full width, and the tiles pair up so their figures read.
                // The card is a square, so the content fits the square: the fixed
                // pieces are slim and the chart is the flexible one, absorbing
                // whatever height is left instead of pushing the rest out.
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        HomeSlimTile(label: t("Revenue", lang: lang), value: money(revenue),
                                     tone: HomeTone.green, symbol: "chart.line.uptrend.xyaxis")
                        HomeSlimTile(label: t("Received", lang: lang), value: money(received),
                                     tone: HomeTone.green, symbol: "checkmark.circle")
                    }
                    HStack(spacing: 8) {
                        HomeSlimTile(label: t("Outstanding", lang: lang), value: money(outstanding),
                                     tone: HomeTone.accent, symbol: "clock")
                        HomeSlimTile(label: t("Net profit", lang: lang), value: money(profit),
                                     tone: HomeTone.green, symbol: "chart.pie")
                    }
                    VStack(alignment: .leading, spacing: 3) {
                        HomeEyebrow(text: t("Revenue & profit", lang: lang))
                        HomeRevenueChart(orders: orders, lang: lang, compact: true)
                    }
                    .padding(.horizontal, 10).padding(.vertical, 7)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .overlay(RoundedRectangle(cornerRadius: 11).stroke(Color.primary.opacity(0.08), lineWidth: 1))
                    HStack(spacing: 0) {
                        HomeCostCell(colour: HomeTone.orange, symbol: "bag.fill",
                                     label: t("Costs", lang: lang), value: money(costs))
                        Divider().frame(height: 24)
                        HomeCostCell(colour: HomeTone.purple, symbol: "percent",
                                     label: t("Fees", lang: lang), value: money(fees))
                        Divider().frame(height: 24)
                        HomeCostCell(colour: HomeTone.amber, symbol: "function",
                                     label: t("VAT", lang: lang), value: money(vat))
                        Divider().frame(height: 24)
                        HomeCostCell(colour: HomeTone.accent, symbol: "shippingbox.fill",
                                     label: t("Shipping", lang: lang), value: money(shipping))
                    }
                    .padding(.horizontal, 4).padding(.vertical, 6)
                    .overlay(RoundedRectangle(cornerRadius: 11).stroke(Color.primary.opacity(0.08), lineWidth: 1))
                }
            } else {
                let margin = revenue > 0 ? max(0, min(1, profit / revenue)) : 0
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 10) {
                        HomeMetricTile(label: t("Revenue", lang: lang), value: money(revenue), tone: HomeTone.green)
                        HomeMetricTile(label: t("Payments received", lang: lang), value: money(received), tone: HomeTone.green)
                        HomeMetricTile(label: t("Outstanding", lang: lang), value: money(outstanding), tone: HomeTone.accent)
                        HomeMetricTile(label: t("Net profit", lang: lang), value: money(profit), tone: HomeTone.green)
                    }
                    HStack(alignment: .top, spacing: 12) {
                        HomePanel {
                            HomeEyebrow(text: t("Revenue & profit", lang: lang))
                            HomeRevenueChart(orders: orders, lang: lang)
                        }
                        HomePanel {
                            HomeEyebrow(text: t("Cost breakdown", lang: lang))
                            HomeCostRow(colour: HomeTone.orange, label: t("Costs", lang: lang), value: money(costs))
                            HomeCostRow(colour: HomeTone.purple, label: t("Platform fees", lang: lang), value: money(fees))
                            HomeCostRow(colour: HomeTone.accent, label: t("Shipping", lang: lang), value: money(shipping))
                        }
                    }
                    HStack(spacing: 12) {
                        HomeEyebrow(text: t("Margin", lang: lang))
                            .fixedSize()
                        HomeProgressBar(fraction: margin)
                        Text("\(Int(margin * 100))%").font(.system(size: 12, weight: .heavy))
                    }
                    .padding(.horizontal, 12).padding(.vertical, 9)
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.primary.opacity(0.08), lineWidth: 1))
                    Spacer(minLength: 0)
                }
            }
        }
    }
}

struct HomeRatioBar: View {
    let revenue: Double
    let costs: Double
    let lang: String
    let money: (Double) -> String
    var body: some View {
        let share = revenue > 0 ? max(0, min(1, costs / revenue)) : 0
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(t("Revenue", lang: lang)).font(.system(size: 11)).foregroundColor(.secondary)
                Spacer()
                Text(t("Costs", lang: lang)).font(.system(size: 11)).foregroundColor(.secondary)
            }
            GeometryReader { proxy in
                HStack(spacing: 0) {
                    Rectangle().fill(HomeTone.accent).frame(width: proxy.size.width * (1 - share))
                    Rectangle().fill(HomeTone.orange)
                }
                .clipShape(Capsule())
            }
            .frame(height: 7)
            HStack {
                Text(money(revenue)).font(.system(size: 11, weight: .bold)).foregroundColor(HomeTone.green)
                Spacer()
                Text(money(costs)).font(.system(size: 11, weight: .bold)).foregroundColor(HomeTone.orange)
            }
        }
    }
}

/// Revenue, minus what it costs, ending in profit — the same arithmetic the
/// Dashboard shows, laid out so you can read where the money went.
struct HomeWaterfall: View {
    let revenue: Double
    let profit: Double
    let deductions: [(String, Double)]
    let lang: String
    let money: (Double) -> String

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            cell(t("Revenue", lang: lang), money(revenue), HomeTone.green, minus: false)
            ForEach(Array(deductions.enumerated()), id: \.offset) { _, entry in
                Divider().frame(height: 30)
                cell(entry.0, money(entry.1), HomeTone.orange, minus: true)
            }
            Divider().frame(height: 30)
            cell(t("Net profit", lang: lang), money(profit), HomeTone.green, minus: false)
        }
        .padding(.top, 8)
        .overlay(Rectangle().frame(height: 1).foregroundColor(.primary.opacity(0.08)), alignment: .top)
    }

    private func cell(_ label: String, _ value: String, _ tone: Color, minus: Bool) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                if minus {
                    Text("−").font(.system(size: 10, weight: .bold)).foregroundColor(HomeTone.orange)
                        .frame(width: 13, height: 13)
                        .overlay(Circle().stroke(HomeTone.orange, lineWidth: 1.2))
                }
                Text(label).font(.system(size: 11)).foregroundColor(.secondary).lineLimit(1)
            }
            Text(value).font(.system(size: 12.5, weight: .bold)).foregroundColor(tone)
                .lineLimit(1).minimumScaleFactor(0.6)
        }
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A tile sized for a square phone card: one line of label over one of figure,
/// with a small mark beside them. The desktop tile is twice this tall.
/// The orders that need a decision, as the sheet draws them: the order's own
/// preview, who it is for, what it is, how late it is and where it stands.
struct HomeOrderRows: View {
    let orders: [Siparis]
    let stages: [ProductionStage]
    let resolved: [(Siparis, ResolvedProductionStage)]
    let lang: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Divider()
            ForEach(orders, id: \.id) { order in
                let entry = resolved.first { $0.0.id == order.id }
                let stage = stages.first { $0.id == entry?.1.stageId }
                let due = homeDueDate(order)
                let overdue = (due ?? .distantFuture) < Date()
                HStack(spacing: 12) {
                    HomeOrderThumb(link: order.designLink,
                                   initial: order.customerName.isEmpty ? order.designName : order.customerName)
                    Text(order.customerName.isEmpty ? order.designName : order.customerName)
                        .font(.system(size: 13.5, weight: .semibold)).lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(order.designName)
                        .font(.system(size: 13)).foregroundColor(.secondary).lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if overdue, let due {
                        let days = Calendar.current.dateComponents([.day], from: due, to: Date()).day ?? 0
                        HomeChip(text: days > 0
                            ? t("{days}d late", lang: lang).replacingOccurrences(of: "{days}", with: "\(days)")
                            : t("Overdue", lang: lang), tone: HomeTone.red)
                    }
                    if let stage {
                        HomeChip(text: t(stage.title, lang: lang), tone: homeStageTone(stage.kind))
                    }
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.secondary.opacity(0.5))
                }
                .padding(.vertical, 5)
                if order.id != orders.last?.id { Divider() }
            }
            Spacer(minLength: 0)
        }
    }
}

/// One production stage as a figure: a coloured dot, the workspace's own name
/// for the stage, and the count under it. Two lines' worth of name whether it
/// needs them or not, so every figure's number sits on the same line.
struct HomeLaneFigure: View {
    let title: String
    let count: Int
    let tone: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .top, spacing: 7) {
                Circle().fill(tone).frame(width: 8, height: 8).padding(.top, 4)
                Text(title)
                    .font(.system(size: 12.5)).foregroundColor(.secondary)
                    .lineLimit(2).fixedSize(horizontal: false, vertical: true)
            }
            .frame(height: 32, alignment: .top)
            Text("\(count)")
                .font(.system(size: 25, weight: .heavy)).foregroundColor(tone)
                .lineLimit(1).minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
    }
}

/// The order's own preview if it has one, its initial if it does not — a blank
/// square beside a name reads as a failed image rather than "no picture yet".
struct HomeOrderThumb: View {
    let link: String
    let initial: String
    var body: some View {
        RoundedRectangle(cornerRadius: 9)
            .fill(Color.primary.opacity(0.07))
            .frame(width: 40, height: 40)
            .overlay(
                Group {
                    if let url = URL(string: link), !link.isEmpty {
                        AsyncImage(url: url) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            Color.clear
                        }
                    } else {
                        Text(initial.prefix(1).uppercased())
                            .font(.system(size: 15, weight: .heavy))
                            .foregroundColor(.secondary.opacity(0.6))
                    }
                }
            )
            .clipShape(RoundedRectangle(cornerRadius: 9))
    }
}

struct HomeSlimTile: View {
    let label: String
    let value: String
    let tone: Color
    let symbol: String
    var body: some View {
        HStack(spacing: 7) {
            Image(systemName: symbol)
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(tone)
                .frame(width: 20, height: 20)
                .background(Circle().fill(tone.opacity(0.14)))
            VStack(alignment: .leading, spacing: 0) {
                Text(label).font(.system(size: 9.5)).foregroundColor(.secondary).lineLimit(1)
                Text(value).font(.system(size: 12.5, weight: .heavy)).foregroundColor(tone)
                    .lineLimit(1).minimumScaleFactor(0.6)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8).padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(RoundedRectangle(cornerRadius: 11).stroke(Color.primary.opacity(0.08), lineWidth: 1))
    }
}

/// One of the four costs across the bottom of the phone 2×2: a filled disc with
/// its mark, the label above the figure.
struct HomeCostCell: View {
    let colour: Color
    let symbol: String
    let label: String
    let value: String
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: symbol)
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 21, height: 21)
                .background(Circle().fill(colour))
            VStack(alignment: .leading, spacing: 0) {
                Text(label).font(.system(size: 9)).foregroundColor(.secondary).lineLimit(1)
                Text(value).font(.system(size: 10.5, weight: .bold))
                    .lineLimit(1).minimumScaleFactor(0.55)
            }
        }
        .padding(.horizontal, 5)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct HomeCostRow: View {
    let colour: Color
    let label: String
    let value: String
    var body: some View {
        HStack(spacing: 9) {
            Circle().fill(colour).frame(width: 18, height: 18)
            Text(label).font(.system(size: 12)).lineLimit(1)
            Spacer(minLength: 6)
            Text(value).font(.system(size: 12, weight: .bold)).lineLimit(1)
        }
        .padding(.vertical, 5)
    }
}

/// Revenue and profit over the last twelve weeks, drawn from the orders.
struct HomeRevenueChart: View {
    let orders: [Siparis]
    let lang: String
    /// On a square phone card the chart is the piece that yields.
    var compact: Bool = false

    var body: some View {
        let weeks = 12
        var revenue = Array(repeating: 0.0, count: weeks)
        var profit = Array(repeating: 0.0, count: weeks)
        let now = Date()
        for order in orders {
            let ago = Int(now.timeIntervalSince(order.paymentDate) / (7 * 24 * 3600))
            guard ago >= 0, ago < weeks else { continue }
            revenue[weeks - 1 - ago] += order.salesTotal
            profit[weeks - 1 - ago] += order.netKar
        }
        let peak = max(1, revenue.max() ?? 1, profit.max() ?? 1)

        return Group {
            if revenue.allSatisfy({ $0 == 0 }) {
                HomeCardNote(text: t("Not enough history yet.", lang: lang))
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 14) {
                        key(HomeTone.accent, t("Revenue", lang: lang))
                        key(HomeTone.green, t("Net profit", lang: lang))
                    }
                    GeometryReader { proxy in
                        ZStack {
                            area(revenue, peak: peak, size: proxy.size).fill(HomeTone.accent.opacity(0.12))
                            area(profit, peak: peak, size: proxy.size).fill(HomeTone.green.opacity(0.14))
                            line(revenue, peak: peak, size: proxy.size).stroke(HomeTone.accent, lineWidth: 1.6)
                            line(profit, peak: peak, size: proxy.size).stroke(HomeTone.green, lineWidth: 1.6)
                        }
                    }
                    .frame(minHeight: compact ? 30 : 54)
                }
            }
        }
    }

    private func key(_ colour: Color, _ label: String) -> some View {
        HStack(spacing: 5) {
            Capsule().fill(colour).frame(width: 14, height: 2.5)
            Text(label).font(.system(size: 11)).foregroundColor(.secondary)
        }
    }

    private func points(_ values: [Double], peak: Double, size: CGSize) -> [CGPoint] {
        values.enumerated().map { index, value in
            CGPoint(x: size.width * CGFloat(index) / CGFloat(max(1, values.count - 1)),
                    y: size.height - size.height * CGFloat(max(0, value) / peak))
        }
    }

    private func line(_ values: [Double], peak: Double, size: CGSize) -> Path {
        var path = Path()
        let pts = points(values, peak: peak, size: size)
        guard let first = pts.first else { return path }
        path.move(to: first)
        pts.dropFirst().forEach { path.addLine(to: $0) }
        return path
    }

    private func area(_ values: [Double], peak: Double, size: CGSize) -> Path {
        var path = line(values, peak: peak, size: size)
        path.addLine(to: CGPoint(x: size.width, y: size.height))
        path.addLine(to: CGPoint(x: 0, y: size.height))
        path.closeSubpath()
        return path
    }
}

// MARK: - Banking

struct HomeBankingBody: View {
    let size: HomeCardSize
    let lang: String
    let currency: String
    let decimal: String
    var compact: Bool = false
    @ObservedObject var data: HomeData
    @EnvironmentObject var firebaseManager: FirebaseManager

    var body: some View {
        // How the bank work is going — never a second copy of Money's totals (§7).
        let transactions = firebaseManager.bankTransactions
        if transactions.isEmpty {
            HomeCardNote(text: t("Nothing here yet.", lang: lang))
        } else {
            let money = { (value: Double) in homeMoney(value, currency: currency, decimal: decimal) }
            let monthPrefix = String(homeISODate(Date()).prefix(7))
            let thisMonth = transactions.filter { $0.bookingDate.hasPrefix(monthPrefix) }
            let incoming = thisMonth.filter { $0.amount > 0 }.reduce(0.0) { $0 + $1.amount }
            let spent = thisMonth.filter { $0.amount < 0 }.reduce(0.0) { $0 + abs($1.amount) }
            let toReview = transactions.filter { $0.category.trimmingCharacters(in: .whitespaces).isEmpty }.count
            let missing = transactions.filter { $0.amount < 0 && !$0.hasReceipt }.count

            if size == .oneByOne && compact {
                // The phone square: what left the account, ruled off above and
                // below, with what came in against the receipts still owed. No
                // sync line here — the header already carries the promise, and a
                // square has no row to spare.
                VStack(alignment: .leading, spacing: 0) {
                    Divider()
                    Spacer(minLength: 8)
                    Text(t("Spent this month", lang: lang))
                        .font(.system(size: 11)).foregroundColor(.secondary)
                    Text("−" + money(spent))
                        .font(.system(size: 27, weight: .heavy))
                        .foregroundColor(HomeTone.red)
                        .lineLimit(1).minimumScaleFactor(0.45)
                    Spacer(minLength: 8)
                    Divider()
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(t("Incoming", lang: lang)).font(.system(size: 10.5)).foregroundColor(.secondary)
                            Text("+" + money(incoming))
                                .font(.system(size: 14, weight: .heavy))
                                .foregroundColor(HomeTone.green)
                                .lineLimit(1).minimumScaleFactor(0.5)
                        }
                        if missing > 0 {
                            Divider().frame(height: 30)
                            HStack(spacing: 5) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .font(.system(size: 10)).foregroundColor(HomeTone.orange)
                                Text(homeReceiptWarning(missing, lang: lang))
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundColor(HomeTone.orange)
                                    .lineLimit(1).minimumScaleFactor(0.7)
                            }
                            .padding(.horizontal, 7).padding(.vertical, 5)
                            .background(Capsule().fill(HomeTone.orange.opacity(0.14)))
                        }
                    }
                    .padding(.top, 9)
                }
            } else if size == .oneByOne {
                VStack(alignment: .leading, spacing: 8) {
                    HomeSyncLine(lastSync: data.bankLastSync, unhealthy: data.bankNeedsAttention, lang: lang)
                    Text(t("Spent this month", lang: lang)).font(.system(size: compact ? 11 : 13)).foregroundColor(.secondary)
                    Text("−" + money(spent))
                        .font(.system(size: compact ? 25 : 33, weight: .heavy))
                        .foregroundColor(HomeTone.red)
                        .lineLimit(1).minimumScaleFactor(0.5)
                    Spacer(minLength: 0)
                    HomeSplitPair {
                        HomeFigure(label: t("Incoming", lang: lang), value: "+" + money(incoming), tone: HomeTone.green)
                    } right: {
                        HomeFigure(label: t("missing receipts", lang: lang), value: "\(missing)",
                                   tone: missing > 0 ? HomeTone.red : .primary)
                    }
                }
            } else if size == .twoByOne && compact {
                // The phone wide card: three figures ruled apart, one recent
                // counterparty across the full width, and the repeat cost against
                // the year to date. No side column — half a phone truncates both.
                let fixed = bankMonthlyFixedTotal(firebaseManager)
                let totals = homeYearTotals(transactions)
                let yearIn = totals.received
                let yearOut = totals.spent
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 0) {
                        HomeBankFigure(label: t("Incoming this month", lang: lang), value: "+" + money(incoming), tone: HomeTone.green)
                        Divider().frame(height: 34)
                        HomeBankFigure(label: t("Spent this month", lang: lang), value: "−" + money(spent), tone: HomeTone.red)
                        Divider().frame(height: 34)
                        HomeBankFigure(label: t("Missing receipts", lang: lang), value: "\(missing)",
                                       tone: missing > 0 ? HomeTone.orange : .primary)
                    }
                    Divider().padding(.vertical, 8)
                    if let top = transactions.first {
                        HStack(spacing: 9) {
                            Text(String((top.counterparty.isEmpty ? top.description : top.counterparty).prefix(1)).uppercased())
                                .font(.system(size: 11, weight: .heavy)).foregroundColor(.white)
                                .frame(width: 24, height: 24)
                                .background(Circle().fill(HomeTone.accent))
                            Text(top.counterparty.isEmpty ? top.description : top.counterparty)
                                .font(.system(size: 12.5)).lineLimit(1)
                            Spacer(minLength: 6)
                            Text((top.amount < 0 ? "−" : "+") + money(abs(top.amount)))
                                .font(.system(size: 12.5, weight: .bold))
                                .foregroundColor(top.amount < 0 ? HomeTone.red : HomeTone.green)
                                .lineLimit(1)
                        }
                        Divider().padding(.vertical, 8)
                    }
                    HStack(spacing: 8) {
                        if fixed > 0 {
                            Text("£").font(.system(size: 10, weight: .heavy)).foregroundColor(HomeTone.accent)
                                .frame(width: 20, height: 20)
                                .background(Circle().fill(HomeTone.accent.opacity(0.12)))
                            Text(t("Fixed ≈ {amount}/month", lang: lang)
                                .replacingOccurrences(of: "{amount}", with: money(fixed)))
                                .font(.system(size: 11)).lineLimit(1).minimumScaleFactor(0.7)
                        }
                        Spacer(minLength: 6)
                        Text(t("This year", lang: lang)).font(.system(size: 10.5)).foregroundColor(.secondary)
                        Text(t("In", lang: lang) + " " + money(yearIn))
                            .font(.system(size: 10.5, weight: .bold)).foregroundColor(HomeTone.green)
                            .lineLimit(1).minimumScaleFactor(0.6)
                        Text(t("Out", lang: lang) + " " + money(yearOut))
                            .font(.system(size: 10.5, weight: .bold)).foregroundColor(HomeTone.red)
                            .lineLimit(1).minimumScaleFactor(0.6)
                    }
                    Spacer(minLength: 0)
                }
            } else if size == .twoByOne {
                // As the sheet draws it: three figures across the top, then the
                // last few counterparties beside what is paid on repeat.
                let fixed = bankMonthlyFixedTotal(firebaseManager)
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 0) {
                        HomeBankFigure(label: t("Incoming this month", lang: lang), value: "+" + money(incoming), tone: HomeTone.green)
                        Divider().frame(height: 32)
                        HomeBankFigure(label: t("Spent this month", lang: lang), value: "−" + money(spent), tone: HomeTone.red)
                        Divider().frame(height: 32)
                        HomeBankFigure(label: t("missing receipts", lang: lang), value: "\(missing)",
                                       tone: missing > 0 ? HomeTone.orange : .primary)
                    }
                    Divider()
                    HStack(alignment: .top, spacing: 14) {
                        VStack(alignment: .leading, spacing: 2) {
                            HomeEyebrow(text: t("Recent transactions", lang: lang))
                            ForEach(transactions.prefix(3), id: \.id) { tx in
                                HomeRow(title: tx.counterparty.isEmpty ? tx.description : tx.counterparty,
                                        detail: (tx.amount < 0 ? "−" : "+") + money(abs(tx.amount)),
                                        tone: tx.amount < 0 ? HomeTone.red : HomeTone.green)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Divider()
                        VStack(alignment: .leading, spacing: 9) {
                            if fixed > 0 {
                                HStack(spacing: 8) {
                                    Text("£").font(.system(size: 11, weight: .heavy))
                                        .foregroundColor(HomeTone.accent)
                                        .frame(width: 22, height: 22)
                                        .background(Circle().fill(HomeTone.accent.opacity(0.12)))
                                    Text(t("Fixed ≈ {amount}/month", lang: lang)
                                        .replacingOccurrences(of: "{amount}", with: money(fixed)))
                                        .font(.system(size: 11.5)).lineLimit(1)
                                }
                            }
                            HomeSyncLine(lastSync: data.bankLastSync, unhealthy: data.bankNeedsAttention, lang: lang)
                            Spacer(minLength: 0)
                        }
                        .frame(width: 190, alignment: .leading)
                    }
                    Spacer(minLength: 0)
                }
            } else {
                // The fourth tile is what the workspace pays on repeat, as the
                // sheet has it — the review queue is already the card's link.
                let fixed = bankMonthlyFixedTotal(firebaseManager)
                VStack(alignment: .leading, spacing: compact ? 7 : 10) {
                    HomeSyncLine(lastSync: data.bankLastSync, unhealthy: data.bankNeedsAttention, lang: lang)
                    if compact {
                        // Four across a phone truncates every label and every
                        // figure. Two by two gives each one half the width.
                        HStack(spacing: 7) {
                            HomeSlimTile(label: t("Incoming this month", lang: lang), value: "+" + money(incoming),
                                         tone: HomeTone.green, symbol: "arrow.down")
                            HomeSlimTile(label: t("Spent this month", lang: lang), value: "−" + money(spent),
                                         tone: HomeTone.orange, symbol: "arrow.up")
                        }
                        HStack(spacing: 7) {
                            HomeSlimTile(label: t("Missing receipts", lang: lang), value: "\(missing)",
                                         tone: missing > 0 ? HomeTone.red : HomeTone.accent,
                                         symbol: "doc.text.magnifyingglass")
                            HomeSlimTile(label: t("Fixed", lang: lang),
                                         value: fixed > 0 ? "≈ " + money(fixed) : "—",
                                         tone: HomeTone.accent, symbol: "calendar")
                        }
                    } else {
                        HStack(spacing: 10) {
                            HomeMetricTile(label: t("Incoming this month", lang: lang), value: "+" + money(incoming),
                                           tone: HomeTone.green, symbol: "arrow.down")
                            HomeMetricTile(label: t("Spent this month", lang: lang), value: "−" + money(spent),
                                           tone: HomeTone.orange, symbol: "arrow.up")
                            HomeMetricTile(label: t("Missing receipts", lang: lang), value: "\(missing)",
                                           tone: missing > 0 ? HomeTone.red : HomeTone.accent, symbol: "doc.text.magnifyingglass")
                            HomeMetricTile(label: t("Fixed", lang: lang),
                                           value: fixed > 0 ? "≈ " + money(fixed) : "—",
                                           tone: HomeTone.accent, symbol: "calendar")
                        }
                    }
                    if size == .twoByTwo && compact {
                        // The phone square: both panels take the full width and
                        // stack, and the chart is the flexible one. Side by side
                        // each got half a phone and truncated everything in it.
                        VStack(alignment: .leading, spacing: 3) {
                            HomeEyebrow(text: t("Bank activity", lang: lang))
                            HomeBankChart(transactions: transactions, lang: lang, compact: true)
                        }
                        .padding(.horizontal, 10).padding(.vertical, 7)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                        .overlay(RoundedRectangle(cornerRadius: 11).stroke(Color.primary.opacity(0.08), lineWidth: 1))
                        VStack(alignment: .leading, spacing: 2) {
                            HomeEyebrow(text: t("Recent transactions", lang: lang))
                            ForEach(transactions.prefix(2), id: \.id) { tx in
                                HStack(spacing: 8) {
                                    Text(String((tx.counterparty.isEmpty ? tx.description : tx.counterparty).prefix(1)).uppercased())
                                        .font(.system(size: 10, weight: .heavy)).foregroundColor(.white)
                                        .frame(width: 20, height: 20)
                                        .background(Circle().fill(HomeTone.accent))
                                    Text(tx.counterparty.isEmpty ? tx.description : tx.counterparty)
                                        .font(.system(size: 11.5)).lineLimit(1)
                                    Spacer(minLength: 6)
                                    Text((tx.amount < 0 ? "−" : "+") + money(abs(tx.amount)))
                                        .font(.system(size: 11.5, weight: .bold))
                                        .foregroundColor(tx.amount < 0 ? HomeTone.red : HomeTone.green)
                                        .lineLimit(1).minimumScaleFactor(0.7)
                                }
                                .padding(.vertical, 3)
                            }
                            Divider().padding(.top, 3)
                            HStack(spacing: 6) {
                                Text(t("This year", lang: lang) + ":")
                                    .font(.system(size: 10)).foregroundColor(.secondary)
                                Text(t("In", lang: lang) + " " + money(homeYearTotals(transactions).received))
                                    .font(.system(size: 10, weight: .bold)).foregroundColor(HomeTone.green)
                                    .lineLimit(1).minimumScaleFactor(0.6)
                                Text("·").foregroundColor(.secondary)
                                Text(t("Out", lang: lang) + " " + money(homeYearTotals(transactions).spent))
                                    .font(.system(size: 10, weight: .bold)).foregroundColor(HomeTone.red)
                                    .lineLimit(1).minimumScaleFactor(0.6)
                                Spacer(minLength: 0)
                            }
                            .padding(.top, 4)
                        }
                        .padding(.horizontal, 10).padding(.vertical, 7)
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                        .overlay(RoundedRectangle(cornerRadius: 11).stroke(Color.primary.opacity(0.08), lineWidth: 1))
                    } else if size == .twoByTwo {
                        HStack(alignment: .top, spacing: 12) {
                            HomePanel {
                                HomeEyebrow(text: t("Bank activity", lang: lang))
                                HomeBankChart(transactions: transactions, lang: lang)
                            }
                            HomePanel {
                                HomeEyebrow(text: t("Recent transactions", lang: lang))
                                ForEach(transactions.prefix(3), id: \.id) { tx in
                                    HStack(spacing: 9) {
                                        Text(String((tx.counterparty.isEmpty ? tx.description : tx.counterparty).prefix(1)).uppercased())
                                            .font(.system(size: 11, weight: .heavy))
                                            .foregroundColor(HomeTone.accent)
                                            .frame(width: 22, height: 22)
                                            .background(Circle().fill(HomeTone.accent.opacity(0.14)))
                                        Text(tx.counterparty.isEmpty ? tx.description : tx.counterparty)
                                            .font(.system(size: 12)).lineLimit(1)
                                        Spacer(minLength: 6)
                                        Text((tx.amount < 0 ? "−" : "+") + money(abs(tx.amount)))
                                            .font(.system(size: 12, weight: .bold))
                                            .foregroundColor(tx.amount < 0 ? HomeTone.orange : HomeTone.green)
                                            .lineLimit(1)
                                    }
                                    .padding(.vertical, 5)
                                }
                            }
                        }
                        if missing > 0 {
                            HStack(spacing: 11) {
                                Text("!").font(.system(size: 15, weight: .black)).foregroundColor(.white)
                                    .frame(width: 26, height: 26)
                                    .background(Circle().fill(HomeTone.orange))
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(t("{count} transactions need a receipt", lang: lang)
                                        .replacingOccurrences(of: "{count}", with: "\(missing)"))
                                        .font(.system(size: 12.5, weight: .bold))
                                    Text(t("We couldn't find a receipt for {count} transactions.", lang: lang)
                                        .replacingOccurrences(of: "{count}", with: "\(missing)"))
                                        .font(.system(size: 11)).foregroundColor(.secondary).lineLimit(1)
                                }
                                Spacer()
                                Text(t("Go to banking", lang: lang) + "  →")
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundColor(HomeTone.accent)
                            }
                            .padding(.horizontal, 12).padding(.vertical, 9)
                            .background(RoundedRectangle(cornerRadius: 12).fill(HomeTone.orange.opacity(0.09)))
                        }
                    } else {
                        HomeReadOnlyNote(lang: lang, short: false)
                    }
                    Spacer(minLength: 0)
                }
            }
        }
    }
}

/// One of the three figures across the top of the 2×1 Banking card.
struct HomeBankFigure: View {
    let label: String
    let value: String
    var tone: Color = .primary
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.system(size: 11.5)).foregroundColor(.secondary).lineLimit(1)
            Text(value).font(.system(size: 19, weight: .heavy)).foregroundColor(tone)
                .lineLimit(1).minimumScaleFactor(0.55)
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// What the workspace pays every month on repeat, by the same rule the Banking
/// screen uses — detected from the feed plus the owner's own vendors.
func bankMonthlyFixedTotal(_ manager: FirebaseManager) -> Double {
    bankDetectRecurring(manager.bankTransactions, vendors: manager.bankVendors)
        .filter { $0.active }
        .reduce(0) { $0 + $1.monthlyEquivalent }
}

/// "1 receipt missing" reads wrong in the plural and the other way round in
/// every language that inflects, so the two are separate strings.
func homeReceiptWarning(_ count: Int, lang: String) -> String {
    let key = count == 1 ? "{count} receipt missing" : "{count} receipts missing"
    return t(key, lang: lang).replacingOccurrences(of: "{count}", with: "\(count)")
}

/// How fresh the feed is. The real signal is the connection's own lastSyncedAt —
/// a live snapshot only says the listener fired, not that the bank handed
/// anything over, which is what made "Connected" misleading in the first place.
/// Money in and out since 1 January. A ViewBuilder cannot hold the statements a
/// DateFormatter needs, so the arithmetic lives here.
func homeYearTotals(_ transactions: [StudioBankTransaction]) -> (received: Double, spent: Double) {
    let year = Calendar.current.component(.year, from: Date())
    let prefix = String(format: "%04d-", year)
    let rows = transactions.filter { $0.bookingDate.hasPrefix(prefix) }
    return (
        rows.filter { $0.amount > 0 }.reduce(0) { $0 + $1.amount },
        rows.filter { $0.amount < 0 }.reduce(0) { $0 + abs($1.amount) }
    )
}

func homeSyncLabel(_ lastSync: Date?, lang: String) -> String {
    guard let lastSync else { return t("Never synced", lang: lang) }
    let seconds = Date().timeIntervalSince(lastSync)
    let days = Int(seconds / 86400)
    let hours = Int(seconds / 3600)
    if days >= 1 { return t("Last synced {n} days ago", lang: lang).replacingOccurrences(of: "{n}", with: "\(days)") }
    if hours >= 1 { return t("Last synced {n}h ago", lang: lang).replacingOccurrences(of: "{n}", with: "\(hours)") }
    return t("Last synced just now", lang: lang)
}

struct HomeSyncLine: View {
    let lastSync: Date?
    let unhealthy: Bool
    let lang: String

    var body: some View {
        let seconds = lastSync.map { Date().timeIntervalSince($0) } ?? -1
        let days = Int(seconds / 86400)
        let stale = lastSync == nil || days >= 2 || unhealthy
        let label = homeSyncLabel(lastSync, lang: lang)
        return HStack(spacing: 6) {
            Image(systemName: stale ? "exclamationmark.triangle.fill" : "arrow.triangle.2.circlepath")
                .font(.system(size: 11))
            Text(label).font(.system(size: 11.5))
        }
        .foregroundColor(stale ? HomeTone.orange : .secondary)
    }
}

/// The read-only promise is part of the card, not a footnote: this feed can
/// never move money and the card should keep saying so (§7).
struct HomeReadOnlyNote: View {
    let lang: String
    let short: Bool
    var body: some View {
        HStack(spacing: 7) {
            Text(t("Read-only", lang: lang))
                .font(.system(size: 10, weight: .heavy))
                .foregroundColor(HomeTone.orange)
                .padding(.horizontal, 8).padding(.vertical, 2)
                .overlay(Capsule().stroke(HomeTone.orange, lineWidth: 1))
            Text(t(short ? "NivaDesk never moves money." : "Read-only bank connection. NivaDesk never moves money.", lang: lang))
                .font(.system(size: 10.5)).foregroundColor(.secondary).lineLimit(1)
        }
    }
}

func homeISODate(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: date)
}

struct HomeBankChart: View {
    let transactions: [StudioBankTransaction]
    let lang: String
    /// On a square phone card the chart is the piece that yields, so its floor
    /// has to be low enough to let the panels below it keep their rows.
    var compact: Bool = false

    var body: some View {
        let weeks = 12
        var incoming = Array(repeating: 0.0, count: weeks)
        var spent = Array(repeating: 0.0, count: weeks)
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        let now = Date()
        for tx in transactions {
            guard let date = formatter.date(from: tx.bookingDate) else { continue }
            let ago = Int(now.timeIntervalSince(date) / (7 * 24 * 3600))
            guard ago >= 0, ago < weeks else { continue }
            if tx.amount >= 0 { incoming[weeks - 1 - ago] += tx.amount }
            else { spent[weeks - 1 - ago] += abs(tx.amount) }
        }
        let peak = max(1, incoming.max() ?? 1, spent.max() ?? 1)

        return Group {
            if incoming.allSatisfy({ $0 == 0 }) && spent.allSatisfy({ $0 == 0 }) {
                HomeCardNote(text: t("Not enough history yet.", lang: lang))
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 14) {
                        HStack(spacing: 5) {
                            Capsule().fill(HomeTone.green).frame(width: 14, height: 2.5)
                            Text(t("Incoming", lang: lang)).font(.system(size: 11)).foregroundColor(.secondary)
                        }
                        HStack(spacing: 5) {
                            Capsule().fill(HomeTone.orange).frame(width: 14, height: 2.5)
                            Text(t("Spent", lang: lang)).font(.system(size: 11)).foregroundColor(.secondary)
                        }
                    }
                    GeometryReader { proxy in
                        ZStack {
                            HomeSeries(values: incoming, peak: peak, size: proxy.size, filled: true)
                                .fill(HomeTone.green.opacity(0.14))
                            HomeSeries(values: incoming, peak: peak, size: proxy.size, filled: false)
                                .stroke(HomeTone.green, lineWidth: 1.6)
                            HomeSeries(values: spent, peak: peak, size: proxy.size, filled: false)
                                .stroke(HomeTone.orange, lineWidth: 1.6)
                        }
                    }
                    .frame(minHeight: compact ? 30 : 54)
                }
            }
        }
    }
}

/// One series, as a line or as a filled area under it.
struct HomeSeries: Shape {
    let values: [Double]
    let peak: Double
    let size: CGSize
    let filled: Bool

    func path(in rect: CGRect) -> Path {
        var path = Path()
        guard values.count > 1 else { return path }
        let points = values.enumerated().map { index, value in
            CGPoint(x: rect.width * CGFloat(index) / CGFloat(values.count - 1),
                    y: rect.height - rect.height * CGFloat(max(0, value) / peak))
        }
        path.move(to: points[0])
        points.dropFirst().forEach { path.addLine(to: $0) }
        if filled {
            path.addLine(to: CGPoint(x: rect.width, y: rect.height))
            path.addLine(to: CGPoint(x: 0, y: rect.height))
            path.closeSubpath()
        }
        return path
    }
}

// MARK: - Inventory

struct HomeInventoryBody: View {
    let size: HomeCardSize
    let lang: String
    let currency: String
    let decimal: String
    let compact: Bool
    @ObservedObject var data: HomeData

    var body: some View {
        if data.inventoryFailed {
            HomeCardNote(text: t("This could not be loaded.", lang: lang))
        } else if let summary = data.inventory {
            let money = { (value: Double) in homeMoney(value, currency: currency, decimal: decimal) }
            if size == .oneByOne {
                VStack(alignment: .leading, spacing: 8) {
                    Text(t("total value", lang: lang)).font(.system(size: compact ? 11 : 13)).foregroundColor(.secondary)
                    Text(money(summary.totalValue))
                        .font(.system(size: compact ? 25 : 33, weight: .heavy))
                        .lineLimit(1).minimumScaleFactor(0.5)
                    Spacer(minLength: 0)
                    HomeSplitPair {
                        HomeFigure(label: t("low stock", lang: lang), value: "\(summary.lowStockCount)",
                                   tone: summary.lowStockCount > 0 ? HomeTone.orange : .primary)
                    } right: {
                        HomeFigure(label: t("incoming", lang: lang), value: "\(summary.incomingCount)", tone: HomeTone.green)
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: compact ? 7 : 10) {
                    HStack(spacing: compact ? 6 : 10) {
                        if compact {
                            // Four tall tiles do not fit a phone row: the card
                            // grew past its own height and lost its heading off
                            // the top and a cost row off the bottom.
                            HomeSlimTile(label: t("total value", lang: lang), value: money(summary.totalValue),
                                         tone: HomeTone.accent, symbol: "shippingbox")
                            HomeSlimTile(label: t("Unique items", lang: lang), value: "\(summary.uniqueCount)",
                                         tone: HomeTone.accent, symbol: "square.stack.3d.up")
                            HomeSlimTile(label: t("low stock", lang: lang), value: "\(summary.lowStockCount)",
                                         tone: summary.lowStockCount > 0 ? HomeTone.orange : HomeTone.accent,
                                         symbol: "exclamationmark.triangle")
                        } else {
                            HomeMetricTile(label: t("total value", lang: lang), value: money(summary.totalValue), tone: HomeTone.accent)
                            HomeMetricTile(label: t("Unique items", lang: lang), value: "\(summary.uniqueCount)", tone: HomeTone.accent, sub: money(summary.uniqueValue))
                            HomeMetricTile(label: t("Quantity stock", lang: lang), value: "\(summary.quantityCount)", tone: HomeTone.accent, sub: money(summary.quantityValue))
                            HomeMetricTile(label: t("low stock", lang: lang), value: "\(summary.lowStockCount)",
                                           tone: summary.lowStockCount > 0 ? HomeTone.orange : HomeTone.accent)
                        }
                    }
                    if size == .twoByTwo {
                        // Unique and quantity are different things and the split is
                        // the point (§8).
                        let total = summary.uniqueValue + summary.quantityValue
                        let share = total > 0 ? summary.uniqueValue / total : 0
                        HStack(alignment: .top, spacing: 12) {
                            HomePanel {
                                HomeEyebrow(text: t("Inventory value", lang: lang))
                                HStack(spacing: 14) {
                                    HomeDonut(share: share)
                                    VStack(alignment: .leading, spacing: 6) {
                                        HomeDonutKey(colour: HomeTone.accent, label: t("Unique items", lang: lang),
                                                     value: money(summary.uniqueValue), percent: share)
                                        HomeDonutKey(colour: HomeTone.accent.opacity(0.35), label: t("Quantity stock", lang: lang),
                                                     value: money(summary.quantityValue), percent: 1 - share)
                                    }
                                }
                            }
                            HomePanel {
                                HomeEyebrow(text: t("Stock status", lang: lang))
                                HomeCostRow(colour: HomeTone.orange, label: t("Reserved", lang: lang), value: money(summary.reservedValue))
                                HomeCostRow(colour: HomeTone.accent, label: t("incoming", lang: lang), value: money(summary.incomingValue))
                                HomeCostRow(colour: HomeTone.red, label: t("low stock", lang: lang), value: "\(summary.lowStockCount)")
                            }
                        }
                    } else {
                        HomeCostRow(colour: HomeTone.orange, label: t("Reserved", lang: lang), value: money(summary.reservedValue))
                        HomeCostRow(colour: HomeTone.accent, label: t("incoming", lang: lang), value: money(summary.incomingValue))
                    }
                    Spacer(minLength: 0)
                }
            }
        } else {
            HomeCardNote(text: t("Loading…", lang: lang))
        }
    }
}

/// Two slices. Drawn with a trimmed stroke rather than Canvas — Canvas would
/// not render this reliably on macOS here.
struct HomeDonut: View {
    let share: Double
    var body: some View {
        ZStack {
            Circle().stroke(HomeTone.accent.opacity(0.30), lineWidth: 11)
            Circle().trim(from: 0, to: max(0.001, min(1, share)))
                .stroke(HomeTone.accent, style: StrokeStyle(lineWidth: 11, lineCap: .butt))
                .rotationEffect(.degrees(-90))
        }
        .frame(width: 74, height: 74)
    }
}

struct HomeDonutKey: View {
    let colour: Color
    let label: String
    let value: String
    let percent: Double
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 7) {
                Circle().fill(colour).frame(width: 9, height: 9)
                Text(label).font(.system(size: 11.5)).lineLimit(1)
                Spacer(minLength: 4)
                Text(value).font(.system(size: 11.5, weight: .bold)).lineLimit(1)
            }
            Text(String(format: "%.1f%%", percent * 100))
                .font(.system(size: 10.5)).foregroundColor(.secondary)
                .padding(.leading, 16)
        }
    }
}

// MARK: - Customers

struct HomeCustomersBody: View {
    let size: HomeCardSize
    let lang: String
    var compact: Bool = false
    @EnvironmentObject var firebaseManager: FirebaseManager

    var body: some View {
        let customers = firebaseManager.musteriler
        if customers.isEmpty {
            HomeCardNote(text: t("Nothing here yet.", lang: lang))
        } else {
            let live = homeLiveOrders(firebaseManager.siparisler)
            let activeNames = Set(live.map { $0.customerName.lowercased() })
            let withActive = customers.filter { activeNames.contains($0.name.lowercased()) }.count
            let monthStart = Calendar.current.date(from: Calendar.current.dateComponents([.year, .month], from: Date())) ?? Date()
            let orderCounts = Dictionary(grouping: firebaseManager.siparisler.filter { !$0.isDeleted },
                                         by: { $0.customerName.lowercased() }).mapValues { $0.count }
            let returning = customers.filter { (orderCounts[$0.name.lowercased()] ?? 0) > 1 }.count
            let newThisMonth = firebaseManager.siparisler
                .filter { !$0.isDeleted && $0.paymentDate >= monthStart }
                .map { $0.customerName.lowercased() }
                .reduce(into: Set<String>()) { $0.insert($1) }
                .filter { (orderCounts[$0] ?? 0) <= 1 }.count
            let existing = max(0, customers.count - newThisMonth - returning)

            if size == .oneByOne {
                VStack(alignment: .leading, spacing: 8) {
                    Text(t("customers", lang: lang)).font(.system(size: compact ? 11 : 13)).foregroundColor(.secondary)
                    Text("\(customers.count)").font(.system(size: compact ? 28 : 36, weight: .heavy))
                    Spacer(minLength: 0)
                    HomeSplitPair {
                        HomeFigure(label: t("active orders", lang: lang), value: "\(withActive)", tone: HomeTone.green)
                    } right: {
                        HomeFigure(label: t("Latest", lang: lang), value: customers.first?.name ?? "—")
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 10) {
                        HomeMetricTile(label: t("Total customers", lang: lang), value: "\(customers.count)", tone: HomeTone.accent)
                        HomeMetricTile(label: t("New this month", lang: lang), value: "\(newThisMonth)", tone: HomeTone.green)
                        HomeMetricTile(label: t("Returning customers", lang: lang), value: "\(returning)", tone: HomeTone.purple)
                        HomeMetricTile(label: t("Customers with active orders", lang: lang), value: "\(withActive)", tone: HomeTone.teal)
                    }
                    HomeMixBar(segments: [
                        (t("New this month", lang: lang), newThisMonth, HomeTone.green),
                        (t("Returning", lang: lang), returning, HomeTone.purple),
                        (t("Existing", lang: lang), existing, HomeTone.teal),
                    ])
                    if size == .twoByTwo {
                        HomePanel {
                            HomeEyebrow(text: t("Recent customers", lang: lang))
                            ForEach(customers.prefix(3), id: \.id) { customer in
                                HStack(spacing: 9) {
                                    Text(String(customer.name.prefix(1)).uppercased())
                                        .font(.system(size: 11, weight: .heavy))
                                        .foregroundColor(HomeTone.accent)
                                        .frame(width: 22, height: 22)
                                        .background(Circle().fill(HomeTone.accent.opacity(0.14)))
                                    Text(customer.name).font(.system(size: 12, weight: .semibold)).lineLimit(1)
                                    Spacer(minLength: 6)
                                    HomeChip(
                                        text: activeNames.contains(customer.name.lowercased())
                                            ? t("Active customer", lang: lang) : t("No open orders", lang: lang),
                                        tone: activeNames.contains(customer.name.lowercased()) ? HomeTone.green : HomeTone.slate
                                    )
                                }
                                .padding(.vertical, 5)
                            }
                        }
                        // §11 and §19: a member sees only the customers their role
                        // allows, and the card says so rather than looking like the
                        // whole directory.
                        Text(t("Only customers you have permission to view are shown", lang: lang))
                            .font(.system(size: 11)).foregroundColor(.secondary)
                    }
                    Spacer(minLength: 0)
                }
            }
        }
    }
}

/// One bar, three segments, and a key that names each one — the proportions are
/// never carried by colour alone (§20).
struct HomeMixBar: View {
    let segments: [(String, Int, Color)]
    var body: some View {
        let total = max(1, segments.reduce(0) { $0 + $1.1 })
        VStack(alignment: .leading, spacing: 8) {
            GeometryReader { proxy in
                HStack(spacing: 2) {
                    ForEach(Array(segments.enumerated()), id: \.offset) { _, entry in
                        Capsule().fill(entry.2)
                            .frame(width: max(0, proxy.size.width * CGFloat(entry.1) / CGFloat(total)))
                    }
                    Spacer(minLength: 0)
                }
            }
            .frame(height: 9)
            HStack(spacing: 0) {
                ForEach(Array(segments.enumerated()), id: \.offset) { index, entry in
                    if index > 0 { Divider().frame(height: 26) }
                    VStack(alignment: .leading, spacing: 1) {
                        HStack(spacing: 6) {
                            Circle().fill(entry.2).frame(width: 9, height: 9)
                            Text(entry.0).font(.system(size: 11)).foregroundColor(.secondary).lineLimit(1)
                        }
                        Text("\(entry.1)").font(.system(size: 15, weight: .heavy))
                    }
                    .padding(.horizontal, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }
}

// MARK: - Orders & production

/// A stage's colour follows its kind, not its position — a workspace may define
/// any number of lanes and an index-keyed palette runs out.
/// The mark for each lane. Finished work is not a bottleneck, so the flow leaves
/// the Done lane out — the card is about what still needs a decision.
func homeStageSymbol(_ kind: ProductionStageKind) -> String {
    switch kind {
    case .ready: return "checkmark.circle"
    case .active: return "hammer"
    case .blocked: return "clock"
    case .review: return "magnifyingglass"
    case .shipready: return "shippingbox"
    case .done: return "checkmark.seal"
    }
}

func homeStageTone(_ kind: ProductionStageKind) -> Color {
    switch kind {
    case .ready: return HomeTone.green
    case .active: return HomeTone.accent
    case .blocked: return HomeTone.red
    case .review: return HomeTone.purple
    case .shipready: return HomeTone.green
    case .done: return HomeTone.slate
    }
}

struct HomeOrdersProductionBody: View {
    let size: HomeCardSize
    let lang: String
    let stepsJSON: String
    var compact: Bool = false
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
            // The stage is never stored — it is derived from the order's own steps,
            // by the one rule every screen shares.
            let resolved = live.map { order -> (Siparis, ResolvedProductionStage) in
                let blocker = order.productionBlocker.flatMap { ProductionBlocker(reason: $0.reason, note: $0.note ?? "") }
                return (order, resolveProductionStage(
                    order: order, stages: data.stages, steps: steps,
                    overrideId: order.productionStageOverride ?? "",
                    blocker: ProductionBlocker.reasons.contains(blocker?.reason ?? "") ? blocker : nil
                ))
            }
            let late = live.filter { order in
                guard let due = homeDueDate(order) else { return false }
                return due < Date()
            }
            let shipReadyIDs = Set(data.stages.filter { $0.kind == .shipready }.map { $0.id })

            if size == .oneByOne {
                // The sheet reads top to bottom: how many are live, then how they
                // are split, then the split as one bar. The desktop square has
                // room for each count's name; on a phone the label would not
                // survive the width, so the mark carries it instead.
                let readyIDs = Set(data.stages.filter { $0.kind == .ready }.map { $0.id })
                let activeIDs = Set(data.stages.filter { $0.kind == .active }.map { $0.id })
                let counts: [(String, Int, Color, String)] = [
                    (t("Ready", lang: lang), resolved.filter { readyIDs.contains($0.1.stageId) }.count,
                     HomeTone.green, "checkmark.circle"),
                    (t("In production", lang: lang), resolved.filter { activeIDs.contains($0.1.stageId) }.count,
                     HomeTone.accent, "wrench.adjustable"),
                    (t("Ready to ship", lang: lang), resolved.filter { shipReadyIDs.contains($0.1.stageId) }.count,
                     HomeTone.green, "shippingbox"),
                    (t("Overdue", lang: lang), late.count,
                     late.isEmpty ? HomeTone.slate : HomeTone.red, "clock"),
                ]
                VStack(alignment: .leading, spacing: compact ? 9 : 14) {
                    HStack(alignment: .firstTextBaseline, spacing: 7) {
                        Text("\(live.count)")
                            .font(.system(size: compact ? 32 : 42, weight: .heavy))
                            .lineLimit(1).minimumScaleFactor(0.5)
                        Text(t("active orders", lang: lang))
                            .font(.system(size: compact ? 12 : 15)).foregroundColor(.secondary)
                            .lineLimit(1).minimumScaleFactor(0.7)
                    }
                    Spacer(minLength: 0)
                    HStack(spacing: compact ? 5 : 8) {
                        ForEach(Array(counts.enumerated()), id: \.offset) { _, entry in
                            VStack(spacing: compact ? 3 : 6) {
                                if !compact {
                                    Text(entry.0)
                                        .font(.system(size: 11.5)).foregroundColor(.secondary)
                                        .lineLimit(1).minimumScaleFactor(0.6)
                                }
                                Text("\(entry.1)")
                                    .font(.system(size: compact ? 15 : 26, weight: .heavy)).foregroundColor(entry.2)
                                    .lineLimit(1).minimumScaleFactor(0.6)
                                Image(systemName: entry.3)
                                    .font(.system(size: compact ? 11 : 15)).foregroundColor(entry.2)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, compact ? 6 : 11)
                            .padding(.horizontal, 4)
                            .overlay(RoundedRectangle(cornerRadius: compact ? 9 : 11).stroke(Color.primary.opacity(0.08), lineWidth: 1))
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("\(entry.0): \(entry.1)")
                        }
                    }
                    Spacer(minLength: 0)
                    HomeStageBar(stages: data.stages, resolved: resolved)
                }
            } else if size == .twoByOne && compact {
                // The sheet gives the wide phone card four counts and then the
                // orders that need a decision. Six stage circles with their names
                // underneath truncated every name on a phone.
                let readyIDs = Set(data.stages.filter { $0.kind == .ready }.map { $0.id })
                let activeIDs = Set(data.stages.filter { $0.kind == .active }.map { $0.id })
                let priority = (late + live.filter { order in !late.contains { $0.id == order.id } }).prefix(2)
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 0) {
                        HomeBankFigure(label: t("Ready", lang: lang),
                                       value: "\(resolved.filter { readyIDs.contains($0.1.stageId) }.count)",
                                       tone: HomeTone.green)
                        Divider().frame(height: 32)
                        HomeBankFigure(label: t("In production", lang: lang),
                                       value: "\(resolved.filter { activeIDs.contains($0.1.stageId) }.count)",
                                       tone: HomeTone.accent)
                        Divider().frame(height: 32)
                        HomeBankFigure(label: t("Ready to ship", lang: lang),
                                       value: "\(resolved.filter { shipReadyIDs.contains($0.1.stageId) }.count)",
                                       tone: HomeTone.green)
                        Divider().frame(height: 32)
                        HomeBankFigure(label: t("Overdue", lang: lang), value: "\(late.count)",
                                       tone: late.isEmpty ? .primary : HomeTone.red)
                    }
                    Divider().padding(.vertical, 8)
                    ForEach(Array(priority), id: \.id) { order in
                        let entry = resolved.first { $0.0.id == order.id }
                        let stage = data.stages.first { $0.id == entry?.1.stageId }
                        let due = homeDueDate(order)
                        let overdue = (due ?? .distantFuture) < Date()
                        HStack(spacing: 8) {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(order.customerName.isEmpty ? order.designName : order.customerName)
                                    .font(.system(size: 12.5, weight: .bold)).lineLimit(1)
                                if !order.designName.isEmpty {
                                    Text(order.designName)
                                        .font(.system(size: 11)).foregroundColor(.secondary).lineLimit(1)
                                }
                            }
                            Spacer(minLength: 6)
                            if overdue, let due {
                                let days = Calendar.current.dateComponents([.day], from: due, to: Date()).day ?? 0
                                HomeChip(text: days > 0
                                    ? t("{days}d late", lang: lang).replacingOccurrences(of: "{days}", with: "\(days)")
                                    : t("Overdue", lang: lang), tone: HomeTone.red)
                            }
                            if let stage {
                                HomeChip(text: t(stage.title, lang: lang), tone: homeStageTone(stage.kind))
                            }
                        }
                        .padding(.vertical, 6)
                    }
                    Spacer(minLength: 0)
                }
            } else if size == .twoByOne {
                // The sheet's wide card: the stages as figures ruled apart, then
                // the orders that actually need a decision. Done is left out —
                // finished work is not a bottleneck, and its lane only narrowed
                // the five that are.
                let lanes = data.stages.filter { $0.kind != .done }
                let priority = (late + live.filter { o in !late.contains { $0.id == o.id } }).prefix(3)
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .top, spacing: 0) {
                        ForEach(Array(lanes.enumerated()), id: \.offset) { index, stage in
                            if index > 0 { Divider().frame(height: 46) }
                            HomeLaneFigure(
                                title: t(stage.title, lang: lang),
                                count: resolved.filter { $0.1.stageId == stage.id }.count,
                                tone: homeStageTone(stage.kind)
                            )
                        }
                    }
                    // How many orders fit is the card's business, not a guess: a
                    // 2×1 is two squares wide by ONE tall, and that one square is
                    // as short as 185pt in a half-width window. The lanes are the
                    // card's job; the list gives up rows until it fits.
                    ViewThatFits(in: .vertical) {
                        HomeOrderRows(orders: Array(priority), stages: data.stages,
                                      resolved: resolved, lang: lang)
                        HomeOrderRows(orders: Array(priority.prefix(2)), stages: data.stages,
                                      resolved: resolved, lang: lang)
                        HomeOrderRows(orders: Array(priority.prefix(1)), stages: data.stages,
                                      resolved: resolved, lang: lang)
                        Spacer(minLength: 0)
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: compact ? 7 : 10) {
                    if size == .twoByTwo {
                        HStack(spacing: compact ? 7 : 10) {
                            if compact {
                                // The square has no room for the tall tile; the slim
                                // one carries the same two figures in half the height.
                                HomeSlimTile(label: t("Active orders", lang: lang), value: "\(live.count)",
                                             tone: HomeTone.accent, symbol: "doc.text")
                                HomeSlimTile(label: t("Overdue", lang: lang), value: "\(late.count)",
                                             tone: late.isEmpty ? HomeTone.accent : HomeTone.red, symbol: "clock")
                            } else {
                                HomeMetricTile(label: t("Active orders", lang: lang), value: "\(live.count)",
                                               tone: HomeTone.accent, symbol: "doc.text")
                                HomeMetricTile(label: t("Overdue", lang: lang), value: "\(late.count)",
                                               tone: late.isEmpty ? HomeTone.accent : HomeTone.red, symbol: "clock")
                            }
                        }
                    }
                    HomeEyebrow(text: t("Production flow", lang: lang))
                    HomeStageFlow(stages: data.stages, resolved: resolved, lang: lang, compact: compact)
                    if size == .twoByTwo {
                        // The panel is the flexible piece here: the flow above it is
                        // a fixed height and the tiles are, so this is what gives
                        // when the square runs short.
                        HomePanel(compact: compact) {
                            HomeEyebrow(text: t("Priority orders", lang: lang))
                            ForEach(Array((late + live.filter { o in !late.contains(where: { $0.id == o.id }) }).prefix(compact ? 2 : 3)), id: \.id) { order in
                                let entry = resolved.first { $0.0.id == order.id }
                                let stage = data.stages.first { $0.id == entry?.1.stageId }
                                HStack(spacing: 7) {
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(order.customerName.isEmpty ? order.designName : order.customerName)
                                            .font(.system(size: compact ? 11.5 : 12, weight: .bold)).lineLimit(1)
                                        // One line on the square: the second was
                                        // what tipped the content past the card.
                                        if !compact, !order.designName.isEmpty {
                                            Text(order.designName)
                                                .font(.system(size: 10.5)).foregroundColor(.secondary).lineLimit(1)
                                        }
                                    }
                                    Spacer(minLength: 6)
                                    if let stage {
                                        HomeChip(text: t(stage.title, lang: lang), tone: homeStageTone(stage.kind))
                                    }
                                    if let due = homeDueDate(order), due < Date() {
                                        let days = Calendar.current.dateComponents([.day], from: due, to: Date()).day ?? 0
                                        HomeChip(text: days > 0
                                            ? t("{days}d late", lang: lang).replacingOccurrences(of: "{days}", with: "\(days)")
                                            : t("Overdue", lang: lang), tone: HomeTone.red)
                                    }
                                }
                                .padding(.vertical, compact ? 3 : 5)
                            }
                        }
                    }
                    Spacer(minLength: 0)
                }
            }
        }
    }
}

/// The whole board as one bar: a segment per stage, sized by how many sit in it.
/// The counts above name every stage, so the bar is the shape of the work rather
/// than the only place the split is stated (§20).
struct HomeStageBar: View {
    let stages: [ProductionStage]
    let resolved: [(Siparis, ResolvedProductionStage)]

    var body: some View {
        let counts = stages.map { stage in
            (stage, resolved.filter { $0.1.stageId == stage.id }.count)
        }.filter { $0.1 > 0 }
        let total = max(1, counts.reduce(0) { $0 + $1.1 })
        return GeometryReader { proxy in
            HStack(spacing: 2) {
                ForEach(Array(counts.enumerated()), id: \.offset) { _, entry in
                    Capsule().fill(homeStageTone(entry.0.kind))
                        .frame(width: max(3, proxy.size.width * CGFloat(entry.1) / CGFloat(total)))
                }
                Spacer(minLength: 0)
            }
        }
        .frame(height: 7)
    }
}

/// A node per stage with a rule between them, so it reads as a sequence rather
/// than a row of unrelated counters.
struct HomeStageFlow: View {
    let stages: [ProductionStage]
    let resolved: [(Siparis, ResolvedProductionStage)]
    let lang: String
    var compact: Bool = false

    var body: some View {
        // Done is left out: finished work is not a bottleneck, and on a phone the
        // sixth lane was what pushed every name into an ellipsis.
        let lanes = stages.filter { $0.kind != .done }
        HStack(alignment: .top, spacing: 0) {
            ForEach(Array(lanes.enumerated()), id: \.element.id) { index, stage in
                let count = resolved.filter { $0.1.stageId == stage.id }.count
                let tone = homeStageTone(stage.kind)
                VStack(spacing: 3) {
                    ZStack {
                        if index > 0 {
                            Rectangle().fill(Color.primary.opacity(0.10)).frame(height: 1)
                                .offset(x: -22)
                        }
                        Circle().fill(tone.opacity(0.16)).frame(width: compact ? 24 : 28, height: compact ? 24 : 28)
                        Image(systemName: homeStageSymbol(stage.kind))
                            .font(.system(size: compact ? 11 : 13, weight: .semibold))
                            .foregroundColor(tone)
                    }
                    Text(t(stage.title, lang: lang))
                        .font(.system(size: compact ? 9 : 10.5)).foregroundColor(.secondary)
                        .lineLimit(1).minimumScaleFactor(0.6)
                    Text("\(count)").font(.system(size: compact ? 14 : 16, weight: .heavy)).foregroundColor(tone)
                }
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 1)
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
        } else if size == .oneByOne {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(upcoming.prefix(3)), id: \.0.id) { entry in
                    HomeRow(title: entry.0.customerName.isEmpty ? entry.0.designName : entry.0.customerName,
                            detail: homeDayLabel(entry.1, lang: lang),
                            tone: entry.1 < homeStartOfToday() ? HomeTone.red : .secondary)
                }
                Spacer(minLength: 0)
            }
        } else {
            let week = homeWeekDays()
            VStack(alignment: .leading, spacing: 10) {
                if size == .twoByOne {
                    HomeWeekStrip(days: week, dues: upcoming.map { $0.1 }, lang: lang)
                } else {
                    HomeEyebrow(text: t("Weekly timeline", lang: lang))
                    HomeTimeline(week: week, entries: Array(upcoming.prefix(5)), lang: lang)
                    HomeEyebrow(text: t("Upcoming deadlines", lang: lang))
                }
                HomeDeadlineRow(entries: Array(upcoming.prefix(3)), lang: lang)
                Spacer(minLength: 0)
            }
        }
    }
}

/// The visible week, Monday first, so the strip and the timeline agree.
func homeWeekDays() -> [Date] {
    let today = homeStartOfToday()
    let weekday = Calendar.current.component(.weekday, from: today)
    let offset = -((weekday + 5) % 7)
    let start = Calendar.current.date(byAdding: .day, value: offset, to: today) ?? today
    return (0..<7).compactMap { Calendar.current.date(byAdding: .day, value: $0, to: start) }
}

struct HomeWeekStrip: View {
    let days: [Date]
    let dues: [Date]
    let lang: String
    var body: some View {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: localeIdentifier(forLanguage: lang))
        return HStack(spacing: 0) {
            ForEach(days, id: \.self) { day in
                let count = dues.filter { Calendar.current.isDate($0, inSameDayAs: day) }.count
                let isToday = Calendar.current.isDateInToday(day)
                VStack(spacing: 1) {
                    Text(formatter.shortWeekdaySymbols[Calendar.current.component(.weekday, from: day) - 1])
                        .font(.system(size: 10)).foregroundColor(.secondary)
                    Text("\(Calendar.current.component(.day, from: day))")
                        .font(.system(size: 14, weight: .bold))
                    Text(count > 0 ? "\(count)" : " ")
                        .font(.system(size: 10.5, weight: count > 0 ? .heavy : .regular))
                        .foregroundColor(count > 0 ? HomeTone.accent : .clear)
                }
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity)
                .background(RoundedRectangle(cornerRadius: 9)
                    .fill(isToday ? HomeTone.accent.opacity(0.09) : .clear))
            }
        }
    }
}

/// A read-only bar per order across the week. Read-only on purpose: dragging a
/// date here would fight the gesture that moves the card itself (§10).
struct HomeTimeline: View {
    let week: [Date]
    let entries: [(Siparis, Date)]
    let lang: String

    private let palette: [Color] = [HomeTone.accent, HomeTone.green, HomeTone.purple, HomeTone.amber, HomeTone.teal]

    var body: some View {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: localeIdentifier(forLanguage: lang))
        formatter.dateFormat = "EEE d"
        let start = week.first ?? Date()
        let end = Calendar.current.date(byAdding: .day, value: 1, to: week.last ?? Date()) ?? Date()
        let span = end.timeIntervalSince(start)

        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 0) {
                Color.clear.frame(width: 86)
                ForEach(week, id: \.self) { day in
                    Text(formatter.string(from: day))
                        .font(.system(size: 9.5))
                        .foregroundColor(Calendar.current.isDateInToday(day) ? HomeTone.accent : .secondary)
                        .frame(maxWidth: .infinity)
                }
            }
            ForEach(Array(entries.enumerated()), id: \.element.0.id) { index, entry in
                HStack(spacing: 8) {
                    Text(entry.0.customerName.isEmpty ? entry.0.designName : entry.0.customerName)
                        .font(.system(size: 11)).lineLimit(1)
                        .frame(width: 86, alignment: .leading)
                    GeometryReader { proxy in
                        let from = max(0, min(1, entry.0.paymentDate.timeIntervalSince(start) / span))
                        let to = max(0, min(1, entry.1.timeIntervalSince(start) / span))
                        let overdue = entry.1 < homeStartOfToday()
                        let tone = overdue ? HomeTone.red : palette[index % palette.count]
                        RoundedRectangle(cornerRadius: 6)
                            .fill(tone.opacity(0.18))
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(tone, lineWidth: 1))
                            .frame(width: max(8, proxy.size.width * CGFloat(abs(to - from))))
                            .offset(x: proxy.size.width * CGFloat(min(from, to)))
                    }
                    .frame(height: 16)
                }
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.primary.opacity(0.08), lineWidth: 1))
    }
}

struct HomeDeadlineRow: View {
    let entries: [(Siparis, Date)]
    let lang: String
    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(entries.enumerated()), id: \.element.0.id) { index, entry in
                if index > 0 { Divider().frame(height: 30) }
                let overdue = entry.1 < homeStartOfToday()
                let soon = Calendar.current.isDateInTomorrow(entry.1)
                let tone = overdue ? HomeTone.red : (soon ? HomeTone.accent : HomeTone.green)
                HStack(spacing: 8) {
                    Circle().fill(tone.opacity(0.16)).frame(width: 24, height: 24)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(homeDayLabel(entry.1, lang: lang))
                            .font(.system(size: 11.5, weight: .bold)).foregroundColor(tone)
                        Text(entry.0.customerName.isEmpty ? entry.0.designName : entry.0.customerName)
                            .font(.system(size: 11)).foregroundColor(.secondary).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.top, 8)
        .overlay(Rectangle().frame(height: 1).foregroundColor(.primary.opacity(0.08)), alignment: .top)
    }
}

// MARK: - Files

struct HomeFilesBody: View {
    let size: HomeCardSize
    let lang: String
    let currency: String
    let decimal: String
    var compact: Bool = false
    @EnvironmentObject var firebaseManager: FirebaseManager

    var body: some View {
        // One file, linked to as many records as it belongs to — the card counts
        // files, never copies (§14).
        let files = firebaseManager.siparisler
            .filter { !$0.isDeleted }
            .flatMap { order in (order.clientFiles ?? []).map { (order, $0) } }
        if files.isEmpty {
            HomeCardNote(text: t("Nothing here yet.", lang: lang))
        } else {
            let used = files.reduce(0.0) { $0 + Double($1.1.fileSize) }
            if size == .oneByOne {
                VStack(alignment: .leading, spacing: 8) {
                    Text(t("Total files", lang: lang)).font(.system(size: compact ? 11 : 13)).foregroundColor(.secondary)
                    Text("\(files.count)").font(.system(size: compact ? 28 : 36, weight: .heavy)).foregroundColor(HomeTone.accent)
                    Spacer(minLength: 0)
                    HomeSplitPair {
                        HomeFigure(label: t("Storage", lang: lang), value: homeFileSize(used))
                    } right: {
                        HomeFigure(label: t("File library", lang: lang), value: "\(files.count)")
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 10) {
                        HomeMetricTile(label: t("Total files", lang: lang), value: "\(files.count)", tone: HomeTone.accent)
                        HomeMetricTile(label: t("Storage", lang: lang), value: homeFileSize(used), tone: HomeTone.green)
                    }
                    HomePanel {
                        HomeEyebrow(text: t("Recent files", lang: lang))
                        ForEach(Array(files.prefix(size == .twoByTwo ? 5 : 3).enumerated()), id: \.offset) { _, entry in
                            HStack(spacing: 9) {
                                RoundedRectangle(cornerRadius: 3)
                                    .fill(homeFileTone(entry.1.fileName).opacity(0.16))
                                    .overlay(RoundedRectangle(cornerRadius: 3).stroke(homeFileTone(entry.1.fileName).opacity(0.5), lineWidth: 1))
                                    .frame(width: 17, height: 21)
                                Text(entry.1.fileName).font(.system(size: 12)).lineLimit(1)
                                Spacer(minLength: 6)
                                HomeChip(text: entry.0.customerName.isEmpty ? t("Order", lang: lang) : entry.0.customerName)
                            }
                            .padding(.vertical, 5)
                        }
                    }
                    if size == .twoByTwo {
                        Text(t("One file, multiple links — no duplicates.", lang: lang))
                            .font(.system(size: 11)).foregroundColor(.secondary)
                    }
                    Spacer(minLength: 0)
                }
            }
        }
    }
}

func homeFileSize(_ bytes: Double) -> String {
    if bytes >= 1e9 { return String(format: "%.1f GB", bytes / 1e9) }
    if bytes >= 1e6 { return String(format: "%.1f MB", bytes / 1e6) }
    if bytes >= 1e3 { return "\(Int(bytes / 1e3)) KB" }
    return "\(Int(bytes)) B"
}

func homeFileTone(_ name: String) -> Color {
    let lower = name.lowercased()
    if lower.hasSuffix(".pdf") { return HomeTone.red }
    if lower.hasSuffix(".png") || lower.hasSuffix(".jpg") || lower.hasSuffix(".jpeg") || lower.hasSuffix(".heic") { return HomeTone.green }
    return HomeTone.slate
}

// MARK: - Notes

struct HomeNotesBody: View {
    let size: HomeCardSize
    let lang: String
    @ObservedObject var data: HomeData

    var body: some View {
        // Notes only. Not files, not AI replies (§13). Pinned first.
        let live = data.notes.filter { !$0.isDeleted && !$0.isArchived }
        if live.isEmpty {
            HomeCardNote(text: t("Nothing here yet.", lang: lang))
        } else {
            let pinned = live.filter { $0.isPinned }
            let recent = live.filter { !$0.isPinned }.sorted { $0.updatedAt > $1.updatedAt }
            if size == .twoByTwo {
                VStack(alignment: .leading, spacing: 8) {
                    if !pinned.isEmpty {
                        HomeEyebrow(text: t("Pinned", lang: lang))
                        HomeNoteGrid(notes: Array(pinned.prefix(2)), lang: lang, columns: 2)
                    }
                    HomeEyebrow(text: t("Recent", lang: lang))
                    HomeNoteGrid(notes: Array(recent.prefix(pinned.isEmpty ? 6 : 4)), lang: lang, columns: 2)
                    Spacer(minLength: 0)
                }
            } else {
                let shown = Array((pinned + recent).prefix(size == .oneByOne ? 2 : 3))
                HomeNoteGrid(notes: shown, lang: lang, columns: size == .oneByOne ? 1 : 3)
            }
        }
    }
}

struct HomeNoteGrid: View {
    let notes: [StudioKeepNote]
    let lang: String
    let columns: Int
    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 9), count: columns), spacing: 9) {
            ForEach(notes, id: \.id) { note in
                HomeNoteTile(note: note, lang: lang)
            }
        }
    }
}

/// A note keeps its own colour — that is the note's, not the card's.
struct HomeNoteTile: View {
    let note: StudioKeepNote
    let lang: String
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(note.title.isEmpty ? t("Untitled note", lang: lang) : note.title)
                .font(.system(size: 12.5, weight: .heavy)).lineLimit(1)
            if !note.text.isEmpty {
                Text(note.text).font(.system(size: 11.5)).foregroundColor(.secondary).lineLimit(2)
            }
            Spacer(minLength: 0)
            HStack(spacing: 6) {
                if !note.linkedOrderLabel.isEmpty {
                    HomeChip(text: note.linkedOrderLabel, tone: HomeTone.slate)
                } else if !note.linkedCustomerName.isEmpty {
                    HomeChip(text: note.linkedCustomerName, tone: HomeTone.slate)
                }
                if let reminder = note.reminderDate {
                    Text(homeDayLabel(reminder, lang: lang))
                        .font(.system(size: 10.5, weight: .bold))
                        .foregroundColor(reminder < homeStartOfToday() ? HomeTone.red : HomeTone.green)
                }
            }
        }
        .padding(.horizontal, 11).padding(.vertical, 9)
        .frame(maxWidth: .infinity, minHeight: 66, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 12).fill(homeNoteColour(note.colorName)))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.primary.opacity(0.08), lineWidth: 1))
    }
}

func homeNoteColour(_ name: String) -> Color {
    switch name.lowercased() {
    case "yellow": return Color(red: 0.996, green: 0.969, blue: 0.878)
    case "blue": return Color(red: 0.898, green: 0.941, blue: 0.992)
    case "green": return Color(red: 0.906, green: 0.965, blue: 0.925)
    case "red": return Color(red: 0.992, green: 0.918, blue: 0.918)
    case "purple": return Color(red: 0.945, green: 0.925, blue: 0.992)
    case "orange": return Color(red: 0.992, green: 0.933, blue: 0.878)
    default: return Color.primary.opacity(0.03)
    }
}
