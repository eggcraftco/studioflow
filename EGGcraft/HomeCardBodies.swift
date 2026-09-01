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
    /// Getting started only: the steps this member has waved off, and the way
    /// to wave one off.
    var setupSkipped: [String] = []
    var onSkipSetupStep: ((String) -> Void)? = nil
    var onRestoreSetupSkipped: (() -> Void)? = nil

    @EnvironmentObject var firebaseManager: FirebaseManager

    var body: some View {
        switch id {
        case .gettingStarted:
            HomeGettingStartedBody(size: size, lang: lang, data: data, compact: compact,
                                   skipped: setupSkipped, onSkip: onSkipSetupStep,
                                   onRestoreSkipped: onRestoreSetupSkipped)
        case .quickActions:
            HomeQuickActionsBody(size: size, lang: lang, access: access, onNewOrder: onNewOrder, onOpen: onOpen)
        case .recentActivity:
            HomeRecentActivityBody(size: size, lang: lang)
        case .money:
            HomeMoneyBody(size: size, lang: lang, currency: currency, decimal: decimal,
                          compact: compact, period: period)
        case .banking:
            HomeBankingBody(size: size, lang: lang, currency: currency, decimal: decimal, compact: compact, period: period, onOpen: onOpen, data: data)
        case .inventory:
            HomeInventoryBody(size: size, lang: lang, currency: currency, decimal: decimal, compact: compact, data: data)
        case .customers:
            HomeCustomersBody(size: size, lang: lang, compact: compact)
        case .ordersProduction:
            HomeOrdersProductionBody(size: size, lang: lang, stepsJSON: stepsJSON, compact: compact, data: data)
        case .schedule:
            HomeScheduleBody(size: size, lang: lang, compact: compact)
        case .files:
            HomeFilesBody(size: size, lang: lang, currency: currency, decimal: decimal, compact: compact)
        case .notes:
            HomeNotesBody(size: size, lang: lang, compact: compact,
                          onNewNote: {
                              UserDefaults.standard.set(true, forKey: "pendingQuickActionNewNote")
                              onOpen("Notes")
                          },
                          data: data)
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

/// The chip answers "when", never "how far along" — production status stays out
/// of this card (§10). A start still ahead of us beats the deadline, because
/// nothing is late on an order that has not begun yet. A weekday on its own only
/// reads unambiguously inside the coming week; past that it takes a date.
func homeDueChip(_ order: Siparis, due: Date, lang: String) -> (label: String, tone: Color) {
    let today = homeStartOfToday()
    let calendar = Calendar.current
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: localeIdentifier(forLanguage: lang))

    let startsIn = calendar.dateComponents([.day], from: today,
                                           to: calendar.startOfDay(for: order.paymentDate)).day ?? 0
    if startsIn > 0 && startsIn < 7 {
        formatter.dateFormat = "EEE"
        return (t("Starts {day}", lang: lang)
            .replacingOccurrences(of: "{day}", with: formatter.string(from: order.paymentDate)),
                HomeTone.purple)
    }

    let days = calendar.dateComponents([.day], from: today, to: calendar.startOfDay(for: due)).day ?? 0
    if days < 0 { return (t("Overdue", lang: lang), HomeTone.red) }
    if days == 0 { return (t("Due today", lang: lang), HomeTone.red) }
    if days == 1 { return (t("Tomorrow", lang: lang), HomeTone.orange) }
    formatter.dateFormat = "d MMM"
    return (formatter.string(from: due), HomeTone.accent)
}

/// The sheet names the row after the order. A workspace that never gave the
/// order a reference has only the customer, and then that is the name. On a
/// phone the word "Order" costs a third of the row, and the "#1094" beside it
/// says the same thing on a card already headed Schedule.
func homeOrderReference(_ order: Siparis, name: String, lang: String, compact: Bool) -> String {
    let raw = order.watchRef.trimmingCharacters(in: .whitespaces)
    if raw.isEmpty { return name }
    let hash = raw.hasPrefix("#") ? raw : "#" + raw
    return compact ? hash : "\(t("Order", lang: lang)) \(hash)"
}

/// A phone 1×1 is a 174pt square with a header on top: the sheet's one-line row
/// — reference, customer and chip side by side — fits two of the three, so the
/// customer drops to a second line rather than pushing the chip off the card.
struct HomeDueRow: View {
    let reference: String
    let name: String
    let chip: String
    let tone: Color
    var compact: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 8) {
                Text(reference)
                    .font(.system(size: compact ? 12 : 12.5, weight: .bold))
                    .lineLimit(1)
                Spacer(minLength: 6)
                HomeChip(text: chip, tone: tone)
            }
            if !name.isEmpty {
                Text(name)
                    .font(.system(size: compact ? 10 : 11.5))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, compact ? 4 : 6)
    }
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
    /// Phone layout: the wide card's two columns get less room than a desktop's.
    var compact: Bool = false
    /// Steps this member has waved off, and the way to wave one off.
    var skipped: [String] = []
    var onSkip: ((String) -> Void)? = nil
    /// "Skip for now" is only true if a skipped step can come back.
    var onRestoreSkipped: (() -> Void)? = nil
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
                          blurb: "Import orders automatically from Shopify or WooCommerce.",
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
        let all = steps.filter { !skipped.contains($0.id) }
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
                    // The square spends itself on the one thing to do next and
                    // the way past it, not on a list of what is still open —
                    // that list is the wall §15 says never to put here.
                    HomeNextPanel(step: step, lang: lang, style: .compact)
                    if let onSkip {
                        HomeSkipButton(label: t("Skip for now", lang: lang)) { onSkip(step.id) }
                    }
                } else {
                    HomeAllSetNote(skipped: skipped, onRestore: onRestoreSkipped, lang: lang)
                }
                Spacer(minLength: 0)
            } else if size == .twoByOne {
                // The one thing to do next on the left, what is left after it on
                // the right. The Completed list that used to hold the left column
                // is gone: a card whose job is to move you forward spent half
                // itself on work already finished.
                HStack(alignment: .top, spacing: compact ? 10 : 16) {
                    VStack(alignment: .leading, spacing: 4) {
                        if let step = next {
                            HomeNextPanel(step: step, lang: lang, style: .inline, compact: compact)
                            if let onSkip {
                                HomeSkipButton(label: t("Skip for now", lang: lang)) { onSkip(step.id) }
                            }
                        } else {
                            HomeAllSetNote(skipped: skipped, onRestore: onRestoreSkipped, lang: lang)
                        }
                        Spacer(minLength: 0)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Rectangle().fill(Color.primary.opacity(0.12)).frame(width: 1)
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(todo.prefix(3), id: \.id) { step in
                            HomeCheckRow(label: t(step.label, lang: lang), state: .todo)
                        }
                        Spacer(minLength: 0)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } else {
                // One column, not two: side by side the list had about half the
                // width and every label was cut to "Set up business pro…" — a
                // checklist you cannot read is not a checklist. The heading goes
                // on a phone, where six readable rows matter more; the card is
                // already titled "Getting started".
                if !compact {
                    HomeEyebrow(text: t("Your checklist", lang: lang))
                }
                VStack(alignment: .leading, spacing: compact ? 2 : 3) {
                    ForEach(all, id: \.id) { step in
                        HomeCheckRow(
                            label: t(step.label, lang: lang),
                            state: step.done ? .done : (step.id == next?.id ? .current : .todo),
                            boxed: true
                        )
                    }
                }
                if let step = next {
                    HomeNextPanel(step: step, lang: lang, style: .large, compact: compact)
                    if let onSkip {
                        HomeSkipButton(label: t("Skip for now", lang: lang)) { onSkip(step.id) }
                            .frame(maxWidth: .infinity)
                    }
                } else {
                    HomePanel { HomeAllSetNote(skipped: skipped, onRestore: onRestoreSkipped, lang: lang) }
                }
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
    /// The big card draws each step as its own bordered row, as the sheet does:
    /// six lines divided by hairlines read as one block, and the current step
    /// has nothing to stand out against.
    var boxed: Bool = false

    var body: some View {
        HStack(spacing: 9) {
            mark
            Text(label)
                .font(.system(size: 12, weight: state == .current ? .bold : .regular))
                .foregroundColor(state == .done ? .secondary : (state == .current ? HomeTone.accent : .primary))
                // Six struck-through lines read as a list of mistakes rather
                // than a list of things done.
                .lineLimit(1)
            Spacer(minLength: 0)
        }
        .padding(.vertical, boxed ? 3 : 4)
        .padding(.horizontal, boxed ? 10 : (state == .current ? 8 : 0))
        .background(
            RoundedRectangle(cornerRadius: boxed ? 9 : 8)
                .fill(state == .current ? HomeTone.accent.opacity(0.07) : .clear)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 9)
                .stroke(state == .current ? HomeTone.accent.opacity(0.45) : Color.primary.opacity(0.12))
                .opacity(boxed ? 1 : 0)
        )
        .opacity(state == .done ? 0.65 : 1)
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
/// The way past a step that is not for this workshop.
struct HomeSkipButton: View {
    let label: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 11.5, weight: .semibold))
                .foregroundColor(HomeTone.accent)
        }
        .buttonStyle(.plain)
    }
}

/// The end of the checklist, and the way back into it. "Skip for now" has to be
/// true: without a way to bring a skipped step back, "now" is a promise the card
/// does not keep, and there is nothing left to do here.
struct HomeAllSetNote: View {
    let skipped: [String]
    let onRestore: (() -> Void)?
    let lang: String
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HomeCardNote(text: t("All set — nice work.", lang: lang))
            if !skipped.isEmpty, let onRestore {
                HomeSkipButton(label: t("{count} skipped", lang: lang)
                    .replacingOccurrences(of: "{count}", with: "\(skipped.count)"),
                               action: onRestore)
            }
        }
    }
}

struct HomeNextPanel: View {
    enum Style { case compact, inline, large }
    let step: HomeSetupStep
    let lang: String
    let style: Style
    var compact: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: style == .compact ? 5 : 7) {
            // No heading here: the big card's list above already names this step
            // and colours it blue, so the panel repeating it was the same words
            // twice.
            // The wide card's "Up next" label goes: a single tinted panel under a
            // progress bar does not need to be told it is what comes next, and
            // the line that says why earns the space instead.
            body(vertical: true)
        }
        .padding(.horizontal, style == .compact ? 10 : 12)
        .padding(.vertical, style == .compact ? 7 : 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(HomeTone.accent.opacity(0.07)))
    }

    private func eyebrow(_ text: String) -> some View {
        Text(text).font(.system(size: 11, weight: .bold)).foregroundColor(HomeTone.accent)
    }

    @ViewBuilder private func body(vertical: Bool) -> some View {
        VStack(alignment: .leading, spacing: style == .compact ? 5 : 7) {
            title
            button
        }
    }

    private var title: some View {
        VStack(alignment: .leading, spacing: 3) {
            if style != .large {
                Text(t(step.label, lang: lang))
                    .font(.system(size: style == .compact ? 12.5 : 14, weight: .heavy))
                    .lineLimit(2)
            }
            // The square gives up the line that explains why: measured, the
            // step's own name plus its blurb runs past the bottom of a 174pt
            // card in German. The page the button opens explains itself.
            if style != .compact {
                // Two lines and no more: a third in German pushes the button off
                // the bottom of a card whose height is fixed.
                Text(t(step.blurb, lang: lang))
                    .font(.system(size: compact ? 10.5 : 11.5))
                    .foregroundColor(.secondary).lineLimit(2)
            }
        }
    }

    private var button: some View {
        // The square has no width for "Connect your shop" twice — the panel's
        // heading already named the step, so the button just moves.
        Text(t(style == .large ? step.cta : "Continue", lang: lang))
            .font(.system(size: style == .compact ? 11 : 12, weight: .bold))
            .foregroundColor(.white)
            .padding(.horizontal, style == .compact ? 11 : 16)
            .padding(.vertical, style == .compact ? 4 : 7)
            .frame(maxWidth: style == .compact ? nil : .infinity)
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
            // Three across, two down — the reference's layout, and the one that
            // fits: two columns meant three rows, and the third row was landing
            // under the card's own footer.
            let shown = Array(rows.prefix(6))
            VStack(spacing: 8) {
                ForEach(0..<2, id: \.self) { row in
                    HStack(spacing: 8) {
                        ForEach(0..<3, id: \.self) { column in
                            let index = row * 3 + column
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
                // The glyph sits in a disc of its own tint, as the sheet draws
                // it: a bare icon on a tinted tile reads as a smudge, and the
                // disc gives it an edge. The primary inverts — white disc,
                // coloured glyph.
                ZStack {
                    Circle().fill(action.primary ? Color.white : action.tone.opacity(0.14))
                    Image(systemName: action.symbol).font(.system(size: 14))
                        .foregroundColor(action.primary ? HomeTone.accent : action.tone)
                }
                .frame(width: 30, height: 30)
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
                    .fill(action.primary ? HomeTone.accent : action.tone.opacity(0.07))
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
// What an activity row looks like, decided from the notification type the
// SERVER writes — and it writes eighteen of them.
//
// This was a chain of substring guesses ending in a grey disc, and the types
// that fell off the end were not obscure: estimate_decision, both bank_ ones,
// shared_note, the ticket ones, team. A real workspace's card was three blank
// grey circles for two estimate approvals and a bank connection.
//
// Kept in the same order as the web table in
// studioflow-web/components/home/HomeCardBodies.tsx, and checked against the
// server's list by functions/test/qa/home-activity-looks.test.js. Money first,
// so woocommerce_payment is not read as an order.
private let homeActivityLooks: [(match: [String], tone: Color, glyph: String)] = [
    (["payment", "refund", "invoice_paid"], HomeTone.green, "creditcard.fill"),
    (["bank_"], HomeTone.teal, "building.columns"),
    (["estimate"], HomeTone.purple, "checkmark.seal.fill"),
    (["delivery", "dispatch", "shipped"], HomeTone.accent, "shippingbox.fill"),
    (["production", "status", "stage"], HomeTone.accent, "gearshape.fill"),
    (["deletion", "deleted"], HomeTone.slate, "bubble.left.and.bubble.right.fill"),
    (["order"], HomeTone.purple, "cart.fill"),
    (["note"], HomeTone.amber, "note.text"),
    (["ticket", "support", "direct", "message", "reply"], HomeTone.slate, "bubble.left.and.bubble.right.fill"),
    (["team", "member", "invite"], HomeTone.teal, "person.2.fill"),
    (["file", "upload", "document"], HomeTone.amber, "doc.fill"),
    (["inventory", "stock"], HomeTone.orange, "shippingbox.fill"),
    (["customer"], HomeTone.teal, "person.fill"),
    (["schedule", "reminder"], HomeTone.accent, "calendar")
]

private func homeActivityLook(_ type: String) -> (tone: Color, glyph: String) {
    let key = type.lowercased()
    for row in homeActivityLooks where row.match.contains(where: { key.contains($0) }) {
        return (row.tone, row.glyph)
    }
    return (HomeTone.slate, "clock.fill")
}

func homeActivityTone(_ type: String) -> Color {
    homeActivityLook(type).tone
}

/// The glyph inside the disc, decided from the same key as the tone above so a
/// green disc can never end up carrying a cart. Every name here is a symbol
/// that ships with macOS 14 — an invented name draws nothing at all and the
/// disc silently goes back to being an empty circle.
func homeActivityGlyph(_ type: String) -> String {
    homeActivityLook(type).glyph
}

struct HomeRecentActivityBody: View {
    let size: HomeCardSize
    let lang: String
    @EnvironmentObject var firebaseManager: FirebaseManager

    var body: some View {
        // Only what the signed-in user is a recipient of — activity never widens
        // what someone can see (§12).
        // Six on a wide card, not five: it is two columns of three now, and an
        // odd number left the second column short by one so the card looked
        // like it had run out of events.
        let limit = size == .oneByOne ? 3 : (size == .twoByOne ? 6 : 8)
        let rows = Array(firebaseManager.activityNotifications.prefix(limit))
        if rows.isEmpty {
            HomeCardNote(text: t("Nothing here yet.", lang: lang))
        } else if size == .twoByTwo {
            let today = rows.filter { $0.createdAt >= homeStartOfToday() }
            let earlier = rows.filter { $0.createdAt < homeStartOfToday() }
            VStack(alignment: .leading, spacing: 6) {
                if !today.isEmpty {
                    HomeEyebrow(text: t("Today", lang: lang))
                    ForEach(today, id: \.id) { HomeActivityRow(item: $0, lang: lang, showActor: true, size: size) }
                }
                if !earlier.isEmpty {
                    HomeEyebrow(text: t("Earlier", lang: lang))
                    ForEach(earlier, id: \.id) { HomeActivityRow(item: $0, lang: lang, showActor: true, size: size) }
                }
                Text(t("Only activity you have permission to view is shown", lang: lang))
                    .font(.system(size: 11)).foregroundColor(.secondary)
                Spacer(minLength: 0)
            }
        } else if size == .twoByOne {
            // Two columns, as the reference sheet draws the wide card. Split
            // rather than stretched: each row keeps its full width for the
            // title, which is what a one-column wide card was spending on
            // whitespace.
            let half = Int(ceil(Double(rows.count) / 2.0))
            HStack(alignment: .top, spacing: 22) {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(rows.prefix(half)), id: \.id) { HomeActivityRow(item: $0, lang: lang, showActor: false, size: size) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(rows.dropFirst(half)), id: \.id) { HomeActivityRow(item: $0, lang: lang, showActor: false, size: size) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            Spacer(minLength: 0)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(rows, id: \.id) { HomeActivityRow(item: $0, lang: lang, showActor: false, size: size) }
                Spacer(minLength: 0)
            }
        }
    }
}

struct HomeActivityRow: View {
    let item: StudioActivityNotification
    let lang: String
    let showActor: Bool
    /// Only the square needs to know: it is the one with no room for a title
    /// and a timestamp side by side.
    var size: HomeCardSize = .twoByOne

    private var disc: some View {
        // The reference draws the two sizes differently on purpose: a square
        // fills the disc and puts a white glyph in it, a wide card tints the
        // disc and keeps the glyph in the colour. Same hue either way, so the
        // two treatments cannot drift into different palettes.
        let tone = homeActivityTone(item.type)
        // Solid on the square AND on the wide-open card; tinted only on 2x1.
        // The sheet is not being inconsistent — it gives the densest layouts
        // the strongest marks, and 2x2 is the densest of the three.
        let solid = size != .twoByOne
        return ZStack {
            Circle().fill(solid ? tone : tone.opacity(0.13))
            if !solid { Circle().strokeBorder(tone.opacity(0.32), lineWidth: 1.5) }
            Image(systemName: homeActivityGlyph(item.type))
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(solid ? .white : tone)
        }
        .frame(width: 28, height: 28)
    }

    private var title: some View {
        Text(item.title.isEmpty ? t("Update", lang: lang) : item.title)
            .font(.system(size: 12.5, weight: .semibold)).lineLimit(1)
    }

    private var detail: some View {
        Group {
            if !item.message.isEmpty {
                Text(item.message).font(.system(size: 11)).foregroundColor(.secondary).lineLimit(1)
            }
        }
    }

    private var when: some View {
        Text(homeRelative(item.createdAt, lang: lang, compact: size == .oneByOne))
            .font(.system(size: 11)).foregroundColor(.secondary).lineLimit(1)
    }

    var body: some View {
#if os(macOS)
        if size == .oneByOne {
            // A square column leaves the title about 120pt beside a timestamp,
            // which turned "Order #10234 created" into "Order #…". Two rows:
            // the title takes the full width, the detail and the time share
            // the line under it.
            HStack(alignment: .center, spacing: 10) {
                disc
                VStack(alignment: .leading, spacing: 1) {
                    title
                    HStack(spacing: 6) {
                        detail
                        Spacer(minLength: 4)
                        when
                    }
                }
            }
            .padding(.vertical, 6)
        } else {
            wideRow
        }
#else
        wideRow
#endif
    }

    private var wideRow: some View {
        HStack(spacing: 10) {
            disc
            VStack(alignment: .leading, spacing: 1) {
                title
                detail
            }
            Spacer(minLength: 6)
            if showActor, !item.senderName.isEmpty {
                HomeChip(text: item.senderName, tone: HomeTone.slate)
            }
            when
        }
        .padding(.vertical, 6)
    }
}

func homeRelative(_ date: Date, lang: String, compact: Bool = false) -> String {
    let minutes = max(1, Int(Date().timeIntervalSince(date) / 60))
    // A square drops "ago" — there is no width for it beside a title.
    if minutes < 60 { return compact ? "\(minutes) \(t("min", lang: lang))" : "\(minutes) \(t("min ago", lang: lang))" }
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
    @AppStorage("financialExpenseItemsJSON") private var financialExpenseItemsJSON: String = ""
    @AppStorage("financialShowBaseCost") private var financialShowBaseCost: Bool = true
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
            // The Dashboard's rule, not `netKar`: that one stops after the fee
            // and the shipping and knows nothing about extra spending or VAT.
            let costs = orders.reduce(0.0) {
                $0 + OrderProfit.baseCostTotal(for: $1, showBaseCost: financialShowBaseCost)
                   + OrderProfit.customExpenseTotal(for: $1, expenseItemsJSON: financialExpenseItemsJSON, currency: currency)
            }
            let fees = orders.reduce(0.0) { $0 + $1.paymentFee }
            let shipping = orders.reduce(0.0) { $0 + $1.deliveryCost }
            let vat = orders.reduce(0.0) { $0 + $1.taxAmount }
            let profit = orders.reduce(0.0) {
                $0 + OrderProfit.adjustedNetProfit(for: $1, showBaseCost: financialShowBaseCost,
                                                   expenseItemsJSON: financialExpenseItemsJSON,
                                                   currency: currency)
            }
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
                cell(entry.0, money(entry.1), .primary, minus: true)
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
    /// See `HomeMetricTile.valueTone`: the disc keeps the category colour, the
    /// number reads as ordinary text when it carries no verdict.
    var valueTone: Color? = nil
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
                Text(value).font(.system(size: 12.5, weight: .heavy)).foregroundColor(valueTone ?? tone)
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
    var period: HomeCardPeriod = .month
    /// The receipts strip offers to take you to the feed, so it has to be able
    /// to — it was accent-blue text with an arrow and no gesture behind it.
    var onOpen: (String) -> Void = { _ in }
    @ObservedObject var data: HomeData
    @EnvironmentObject var firebaseManager: FirebaseManager

    var body: some View {
        // How the bank work is going — never a second copy of Money's totals (§7).
        let transactions = firebaseManager.bankTransactions
        if transactions.isEmpty {
            HomeCardNote(text: t("Nothing here yet.", lang: lang))
        } else {
            let money = { (value: Double) in homeMoney(value, currency: currency, decimal: decimal) }
            // The header offers a range, so the totals have to cover it. Booking
            // dates are ISO strings, and an ISO date compares as a string in the
            // same order it compares as a date, so the window converts rather
            // than every row parsing.
            let window = period.range
            let from = homeISODate(window.start), to = homeISODate(window.end)
            let inRange = transactions.filter { $0.bookingDate >= from && $0.bookingDate <= to }
            let incoming = inRange.filter { $0.amount > 0 }.reduce(0.0) { $0 + $1.amount }
            let spent = inRange.filter { $0.amount < 0 }.reduce(0.0) { $0 + abs($1.amount) }
            // "Incoming this month" beside a header reading "This year" is just
            // wrong, and at All time there is no window to name at all.
            let incomingLabel = period == .month ? "Incoming this month"
                : period == .year ? "Incoming this year" : "Incoming"
            let spentLabel = period == .month ? "Spent this month"
                : period == .year ? "Spent this year" : "Spent"
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
                    Text(t(spentLabel, lang: lang))
                        .font(.system(size: 11)).foregroundColor(.secondary)
                    Text(money(spent))
                        .font(.system(size: 27, weight: .heavy))
                        .foregroundColor(.primary)
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
                    Text(t(spentLabel, lang: lang)).font(.system(size: compact ? 11 : 13)).foregroundColor(.secondary)
                    Text(money(spent))
                        .font(.system(size: compact ? 25 : 33, weight: .heavy))
                        .foregroundColor(.primary)
                        .lineLimit(1).minimumScaleFactor(0.5)
                    Spacer(minLength: 0)
                    HomeSplitPair {
                        HomeFigure(label: t("Incoming", lang: lang), value: "+" + money(incoming), tone: HomeTone.green)
                    } right: {
                        HomeFigure(label: t("Missing receipts", lang: lang), value: "\(missing)",
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
                        HomeBankFigure(label: t(incomingLabel, lang: lang), value: "+" + money(incoming), tone: HomeTone.green)
                        Divider().frame(height: 34)
                        HomeBankFigure(label: t(spentLabel, lang: lang), value: money(spent), tone: .primary)
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
                                .foregroundColor(top.amount < 0 ? .primary : HomeTone.green)
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
                            .font(.system(size: 10.5, weight: .bold)).foregroundColor(.primary)
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
                        HomeBankFigure(label: t(incomingLabel, lang: lang), value: "+" + money(incoming),
                                       tone: HomeTone.green, centred: true)
                            .frame(maxWidth: .infinity)
                        Divider().frame(height: 32)
                        HomeBankFigure(label: t(spentLabel, lang: lang), value: money(spent),
                                       tone: .primary, centred: true)
                            .frame(maxWidth: .infinity)
                        Divider().frame(height: 32)
                        HomeBankFigure(label: t("Missing receipts", lang: lang), value: "\(missing)",
                                       tone: missing > 0 ? HomeTone.orange : .primary, centred: true)
                            .frame(maxWidth: .infinity)
                    }
                    Divider()
                    HStack(alignment: .top, spacing: 14) {
                        VStack(alignment: .leading, spacing: 2) {
                            HomeEyebrow(text: t("Recent transactions", lang: lang))
                            ForEach(Array(transactions.prefix(3).enumerated()), id: \.element.id) { index, tx in
                                if index > 0 { Divider() }
                                HStack(spacing: 8) {
                                    Text(String((tx.counterparty.isEmpty ? tx.description : tx.counterparty).prefix(1)).uppercased())
                                        .font(.system(size: 10, weight: .heavy))
                                        .foregroundColor(HomeTone.accent)
                                        .frame(width: 20, height: 20)
                                        .background(Circle().fill(HomeTone.accent.opacity(0.14)))
                                    Text(tx.counterparty.isEmpty ? tx.description : tx.counterparty)
                                        .font(.system(size: 12, weight: .semibold)).lineLimit(1)
                                    Spacer(minLength: 6)
                                    Text((tx.amount < 0 ? "−" : "+") + money(abs(tx.amount)))
                                        .font(.system(size: 11, weight: .bold))
                                        .foregroundColor(tx.amount < 0 ? .primary : HomeTone.green)
                                        .lineLimit(1).minimumScaleFactor(0.7)
                                }
                                .padding(.vertical, 3)
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
                            HomeSlimTile(label: t(incomingLabel, lang: lang), value: "+" + money(incoming),
                                         tone: HomeTone.green, symbol: "arrow.down")
                            HomeSlimTile(label: t(spentLabel, lang: lang), value: money(spent),
                                         tone: HomeTone.slate, valueTone: .primary, symbol: "arrow.up")
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
                            HomeMetricTile(label: t(incomingLabel, lang: lang), value: "+" + money(incoming),
                                           tone: HomeTone.green, symbol: "arrow.down")
                            HomeMetricTile(label: t(spentLabel, lang: lang), value: money(spent),
                                           tone: HomeTone.slate, valueTone: .primary, symbol: "arrow.up")
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
                                        .font(.system(size: 10, weight: .heavy))
                                        .foregroundColor(HomeTone.accent)
                                        .frame(width: 20, height: 20)
                                        .background(Circle().fill(HomeTone.accent.opacity(0.14)))
                                    Text(tx.counterparty.isEmpty ? tx.description : tx.counterparty)
                                        .font(.system(size: 11.5)).lineLimit(1)
                                    Spacer(minLength: 6)
                                    Text((tx.amount < 0 ? "−" : "+") + money(abs(tx.amount)))
                                        .font(.system(size: 11.5, weight: .bold))
                                        .foregroundColor(tx.amount < 0 ? .primary : HomeTone.green)
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
                                    .font(.system(size: 10, weight: .bold)).foregroundColor(.primary)
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
                                            .foregroundColor(tx.amount < 0 ? .primary : HomeTone.green)
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
                                Button { onOpen("BankSpending") } label: {
                                    Text(t("Go to banking", lang: lang) + "  →")
                                        .font(.system(size: 12, weight: .bold))
                                        .foregroundColor(HomeTone.accent)
                                }
                                .buttonStyle(.plain)
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
    /// Three figures on a phone square give each label about 45pt, so there the
    /// name wraps rather than truncates and the box is tighter all round.
    var compact: Bool = false
    /// A quieter second figure under the value — what those items are worth.
    var sub: String = ""
    /// The 2x1 sheet centres each figure in its third rather than ranging them
    /// left against their dividers.
    var centred: Bool = false
    var body: some View {
        VStack(alignment: centred ? .center : .leading, spacing: 2) {
            Text(label)
                .font(.system(size: compact ? 9.5 : 11.5)).foregroundColor(.secondary)
                .lineLimit(compact ? 2 : 1)
                .fixedSize(horizontal: false, vertical: true)
                .frame(height: compact ? 22 : nil, alignment: .top)
            Text(value).font(.system(size: compact ? 15 : 19, weight: .heavy)).foregroundColor(tone)
                .lineLimit(1).minimumScaleFactor(0.55)
            if !sub.isEmpty {
                Text(sub).font(.system(size: compact ? 9 : 10.5)).foregroundColor(.secondary)
                    .lineLimit(1).minimumScaleFactor(0.6)
            }
        }
        .padding(.horizontal, compact ? 6 : 12)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// One of the two stock holdings that are not free shelf: what it is, how many
/// items, and what they are worth. The name stays dark and only the figures
/// take the tone — a whole row in one colour reads as an alert.
struct HomeHolding: View {
    let symbol: String
    let label: String
    let count: Int
    let value: String
    let tone: Color
    let lang: String
    var compact: Bool = false
    var body: some View {
        HStack(spacing: compact ? 7 : 10) {
            Image(systemName: symbol)
                .font(.system(size: compact ? 12 : 14, weight: .semibold))
                .foregroundColor(tone)
                .frame(width: compact ? 26 : 30, height: compact ? 26 : 30)
                .background(Circle().fill(tone.opacity(0.15)))
            VStack(alignment: .leading, spacing: 1) {
                Text(label).font(.system(size: compact ? 11 : 12.5, weight: .semibold)).lineLimit(1)
                Text("\(count) \(t("items", lang: lang))")
                    .font(.system(size: compact ? 9.5 : 11)).foregroundColor(tone).lineLimit(1)
            }
            Spacer(minLength: 4)
            Text(value)
                .font(.system(size: compact ? 11.5 : 13, weight: .heavy)).foregroundColor(tone)
                .lineLimit(1).minimumScaleFactor(0.6)
        }
        .padding(.horizontal, compact ? 8 : 14)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension String {
    /// The sheet capitalises this card's label. Done here rather than as a
    /// second dictionary entry beside "total value" — a no-op in the scripts
    /// that have no case, correct in the ones that do.
    var homeCapitalisedFirst: String {
        guard let first = first else { return self }
        return String(first).uppercased() + dropFirst()
    }
}

/// The stock mix as one bar — no legend, because the three figures above it are
/// the legend.
struct HomeStockBar: View {
    let segments: [(Int, Color)]
    var height: CGFloat = 7
    var body: some View {
        let total = max(1, segments.reduce(0) { $0 + $1.0 })
        GeometryReader { proxy in
            HStack(spacing: 2) {
                ForEach(Array(segments.enumerated()), id: \.offset) { _, entry in
                    Capsule().fill(entry.1)
                        .frame(width: max(0, proxy.size.width * CGFloat(entry.0) / CGFloat(total)))
                }
                Spacer(minLength: 0)
            }
        }
        .frame(height: height)
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
                // The sheet reads: what the stock is worth, then the three counts
                // that say whether it needs attention, then the mix as one bar.
                // Reserved is the third — stock that is spoken for is not stock
                // you can sell.
                let items = summary.uniqueCount + summary.quantityCount
                let healthy = max(0, items - summary.lowStockCount - summary.incomingCount - summary.reservedCount)
                VStack(alignment: .leading, spacing: compact ? 2 : 8) {
                    Text(t("total value", lang: lang).homeCapitalisedFirst)
                        .font(.system(size: compact ? 10.5 : 13)).foregroundColor(.secondary)
                    Text(money(summary.totalValue))
                        .font(.system(size: compact ? 20 : 33, weight: .heavy))
                        .foregroundColor(HomeTone.indigo)
                        .lineLimit(1).minimumScaleFactor(0.5)
                    Spacer(minLength: 0)
                    Divider()
                    HStack(spacing: 0) {
                        HomeBankFigure(label: t("low stock", lang: lang), value: "\(summary.lowStockCount)",
                                       tone: summary.lowStockCount > 0 ? HomeTone.red : .primary, compact: compact)
                        Divider().frame(height: compact ? 30 : 34)
                        HomeBankFigure(label: t("incoming", lang: lang), value: "\(summary.incomingCount)",
                                       tone: summary.incomingCount > 0 ? HomeTone.orange : .primary, compact: compact)
                        Divider().frame(height: compact ? 30 : 34)
                        HomeBankFigure(label: t("Reserved", lang: lang), value: "\(summary.reservedCount)",
                                       tone: summary.reservedCount > 0 ? HomeTone.orange : .primary, compact: compact)
                    }
                    if items > 0 {
                        HomeStockBar(segments: [
                            (healthy, HomeTone.green),
                            (summary.incomingCount, HomeTone.orange),
                            (summary.lowStockCount, HomeTone.red),
                            (summary.reservedCount, HomeTone.slate)
                        ], height: compact ? 6 : 9)
                    }
                }
            } else if size == .twoByOne {
                // The sheet's wide card: what the stock is worth and how it
                // splits, ruled apart, then the two holdings that are not free
                // stock — reserved against orders, and what is still on its way.
                // Both carry their count AND their value; a bare amount does not
                // say how much of the shelf it is.
                VStack(alignment: .leading, spacing: compact ? 6 : 10) {
                    HStack(spacing: 0) {
                        HomeBankFigure(label: t("total value", lang: lang),
                                       value: money(summary.totalValue),
                                       tone: HomeTone.indigo, compact: compact)
                            .layoutPriority(1.4)
                        Divider().frame(height: compact ? 34 : 40)
                        HomeBankFigure(label: t("Unique items", lang: lang), value: "\(summary.uniqueCount)",
                                       compact: compact, sub: money(summary.uniqueValue))
                        Divider().frame(height: compact ? 34 : 40)
                        HomeBankFigure(label: t("Quantity stock", lang: lang), value: "\(summary.quantityCount)",
                                       compact: compact, sub: money(summary.quantityValue))
                        Divider().frame(height: compact ? 34 : 40)
                        HomeBankFigure(label: t("low stock", lang: lang), value: "\(summary.lowStockCount)",
                                       tone: summary.lowStockCount > 0 ? HomeTone.red : .primary, compact: compact)
                            .layoutPriority(0.7)
                    }
                    Spacer(minLength: 0)
                    Divider()
                    HStack(spacing: 0) {
                        HomeHolding(symbol: "cart", label: t("Reserved", lang: lang),
                                    count: summary.reservedCount, value: money(summary.reservedValue),
                                    tone: HomeTone.orange, lang: lang, compact: compact)
                        Divider().frame(height: compact ? 26 : 32)
                        HomeHolding(symbol: "shippingbox", label: t("incoming", lang: lang),
                                    count: summary.incomingCount, value: money(summary.incomingValue),
                                    tone: HomeTone.green, lang: lang, compact: compact)
                    }
                }
            } else {
                // The sheet's big card: the four figures, then how the value
                // splits, then what actually needs a decision — worst first,
                // because a card that only counts problems cannot be acted on.
                let total = summary.uniqueValue + summary.quantityValue
                let share = total > 0 ? summary.uniqueValue / total : 0
                VStack(alignment: .leading, spacing: compact ? 6 : 10) {
                    HStack(spacing: compact ? 5 : 10) {
                        HomeStockTile(label: t("total value", lang: lang), value: money(summary.totalValue),
                                      tone: HomeTone.indigo, compact: compact)
                        HomeStockTile(label: t("Unique items", lang: lang), value: "\(summary.uniqueCount)",
                                      tone: HomeTone.accent, compact: compact, sub: money(summary.uniqueValue))
                        HomeStockTile(label: t("Quantity stock", lang: lang), value: "\(summary.quantityCount)",
                                      tone: HomeTone.accent, compact: compact, sub: money(summary.quantityValue))
                        HomeStockTile(label: t("low stock", lang: lang), value: "\(summary.lowStockCount)",
                                      tone: summary.lowStockCount > 0 ? HomeTone.red : HomeTone.accent,
                                      compact: compact)
                    }
                    HomePanel(compact: compact) {
                        HStack(spacing: compact ? 10 : 16) {
                            HomeDonut(share: share)
                                .frame(width: compact ? 46 : 74, height: compact ? 46 : 74)
                            HomeBankFigure(label: t("Unique items", lang: lang),
                                           value: money(summary.uniqueValue), compact: compact)
                            Divider().frame(height: compact ? 26 : 32)
                            HomeBankFigure(label: t("Quantity stock", lang: lang),
                                           value: money(summary.quantityValue), compact: compact)
                        }
                    }
                    HomePanel(compact: compact) {
                        HomeEyebrow(text: t("Needs attention", lang: lang))
                        let attention = homeStockAttention(data.inventoryItems)
                        if attention.isEmpty {
                            HomeCardNote(text: t("Nothing here yet.", lang: lang))
                        } else {
                            ForEach(attention, id: \.item.id) { entry in
                                HomeAttentionRow(item: entry.item, kind: entry.kind,
                                                 lang: lang, compact: compact)
                                if entry.item.id != attention.last?.item.id { Divider() }
                            }
                        }
                    }
                    Spacer(minLength: 0)
                }
            }
        } else {
            HomeCardNote(text: t("Loading…", lang: lang))
        }
    }
}

/// One of the four figures across the top of the stock card: the name above the
/// number, because side by side in a phone tile the name collapses to "t…".
struct HomeStockTile: View {
    let label: String
    let value: String
    var tone: Color = .primary
    var compact: Bool = false
    var sub: String = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.system(size: compact ? 8.5 : 11)).foregroundColor(.secondary)
                .lineLimit(2).fixedSize(horizontal: false, vertical: true)
                .frame(height: compact ? 20 : nil, alignment: .top)
            Text(value)
                .font(.system(size: compact ? 12 : 17, weight: .heavy)).foregroundColor(tone)
                .lineLimit(1).minimumScaleFactor(0.5)
            if !sub.isEmpty && !compact {
                Text(sub).font(.system(size: 10.5)).foregroundColor(.secondary).lineLimit(1)
            }
        }
        .padding(.horizontal, compact ? 5 : 10).padding(.vertical, compact ? 6 : 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(RoundedRectangle(cornerRadius: compact ? 9 : 12).stroke(Color.primary.opacity(0.08), lineWidth: 1))
    }
}

/// Worst first: nothing on the shelf, then spoken for, then still on its way.
enum HomeStockAttention {
    case low, reserved, incoming
    var label: String {
        switch self {
        case .low: return "Low stock"
        case .reserved: return "Reserved"
        case .incoming: return "Incoming"
        }
    }
    var tone: Color { self == .low ? HomeTone.red : HomeTone.orange }
    var rank: Int {
        switch self {
        case .low: return 0
        case .reserved: return 1
        case .incoming: return 2
        }
    }
}

/// What actually needs a decision: the thing, what is wrong with it, and where
/// it is. The counts above say how many; this says which.
func homeStockAttention(_ items: [InventoryItem]) -> [(item: InventoryItem, kind: HomeStockAttention)] {
    items.compactMap { item -> (item: InventoryItem, kind: HomeStockAttention)? in
        if item.lowStockAt > 0 && item.onHand <= item.lowStockAt { return (item, .low) }
        if item.reserved > 0 { return (item, .reserved) }
        if item.incoming > 0 { return (item, .incoming) }
        return nil
    }
    .sorted { $0.kind.rank < $1.kind.rank }
    .prefix(3)
    .map { $0 }
}

struct HomeAttentionRow: View {
    let item: InventoryItem
    let kind: HomeStockAttention
    let lang: String
    var compact: Bool = false
    var body: some View {
        HStack(spacing: compact ? 7 : 10) {
            HomeOrderThumb(link: item.photos.first ?? "", initial: item.name)
                .frame(width: compact ? 22 : 28, height: compact ? 22 : 28)
            Text(item.name)
                .font(.system(size: compact ? 11 : 12.5, weight: .semibold)).lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            HomeChip(text: t(kind.label, lang: lang), tone: kind.tone)
            Text(item.location.isEmpty ? "—" : item.location)
                .font(.system(size: compact ? 10 : 11.5)).foregroundColor(.secondary)
                .lineLimit(1).frame(maxWidth: compact ? 58 : 84, alignment: .trailing)
        }
        .padding(.vertical, compact ? 2 : 5)
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
    var compact: Bool = false
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
                let rows = Array(upcoming.prefix(3))
                ForEach(Array(rows.enumerated()), id: \.element.0.id) { index, entry in
                    let chip = homeDueChip(entry.0, due: entry.1, lang: lang)
                    let name = entry.0.customerName.isEmpty ? entry.0.designName : entry.0.customerName
                    HomeDueRow(reference: homeOrderReference(entry.0, name: name, lang: lang, compact: compact),
                               name: entry.0.watchRef.trimmingCharacters(in: .whitespaces).isEmpty ? "" : name,
                               chip: chip.label, tone: chip.tone, compact: compact)
                    if index < rows.count - 1 { Divider().opacity(0.5) }
                }
                Spacer(minLength: 0)
            }
        } else {
            let week = homeWeekDays()
            let today = homeStartOfToday()
            if size == .twoByOne {
                HomeWeekTimeline(days: week, entries: Array(upcoming.prefix(3)), lang: lang, compact: compact)
            } else {
                // "Upcoming" is what is still ahead. The timeline above already
                // carries the late ones, and repeating them here would spend the
                // section on old news.
                HomeWeekTimeline(days: week, entries: Array(upcoming.prefix(4)),
                                 ahead: Array(upcoming.filter { $0.1 >= today }.prefix(2)),
                                 lang: lang, compact: compact, large: true)
            }
        }
    }
}

/// The sheet's wide schedule card is a week, not a list: every order gets a bar
/// on the days it occupies, read against today's column. SwiftUI has no grid
/// that spans columns, so the track measures itself and the bars are placed by
/// day width — the same arithmetic the web grid does for free.
struct HomeWeekTimeline: View {
    let days: [Date]
    let entries: [(Siparis, Date)]
    /// The deadlines still ahead, spelled out under the week. Empty on the wide
    /// card, which has no room for a second section.
    var ahead: [(Siparis, Date)] = []
    let lang: String
    var compact: Bool = false
    /// The big card has room for the day it is read against, a fourth bar and
    /// the dates underneath.
    var large: Bool = false

    var body: some View {
        let today = homeStartOfToday()
        let todayIndex = days.firstIndex { Calendar.current.isDate($0, inSameDayAs: today) }
        let nameWidth: CGFloat = compact ? 96 : 140
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: localeIdentifier(forLanguage: lang))
        formatter.dateFormat = "EEE"

        return GeometryReader { geo in
            let cell = max(0, geo.size.width - nameWidth) / 7
            VStack(spacing: 0) {
                HStack(spacing: 0) {
                    // Not Color.clear: it is greedy in both axes and would make
                    // the day strip as tall as the whole card.
                    Spacer(minLength: 0).frame(width: nameWidth)
                    ForEach(Array(days.enumerated()), id: \.element) { index, day in
                        let isToday = index == todayIndex
                        VStack(spacing: 0) {
                            VStack(spacing: 0) {
                                Text(formatter.string(from: day))
                                    .font(.system(size: large ? 10.5 : 9.5,
                                                  weight: isToday ? .bold : .regular))
                                    .opacity(isToday ? 1 : 0.6)
                                Text("\(Calendar.current.component(.day, from: day))")
                                    .font(.system(size: large ? 13 : 11.5, weight: .bold))
                            }
                            // The big card marks today the way the sheet does —
                            // solid, with the word under it. The wide card has
                            // no height for either and tints the column instead.
                            .foregroundColor(isToday ? (large ? .white : HomeTone.accent) : .primary)
                            .padding(.horizontal, large && isToday ? 9 : 0)
                            .padding(.vertical, large && isToday ? 3 : 0)
                            .background(
                                RoundedRectangle(cornerRadius: 9)
                                    .fill(large && isToday ? HomeTone.accent : .clear)
                            )
                            // A day column is about 34pt wide and the mark needs
                            // more than that: let it take its own width and sit
                            // over its neighbours rather than wrap to four lines.
                            .fixedSize()
                            if large && isToday {
                                Text(t("Today", lang: lang))
                                    .font(.system(size: 9.5))
                                    .foregroundColor(HomeTone.accent)
                                    .padding(.top, 2)
                            }
                        }
                        .frame(width: cell)
                    }
                }
                .padding(.bottom, large ? 8 : 4)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(Color.primary.opacity(0.12))
                        .frame(height: 1)
                        .padding(.leading, large ? 0 : nameWidth)
                }

                if large {
                    HomeEyebrow(text: t("Weekly timeline", lang: lang))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 6)
                }

                ZStack(alignment: .topLeading) {
                    if large {
                        // A line at the head of every day column, so a bar can be
                        // read back to the day it starts on.
                        HStack(spacing: 0) {
                            Color.clear.frame(width: nameWidth)
                            ForEach(0..<7, id: \.self) { _ in
                                Rectangle().fill(Color.primary.opacity(0.08))
                                    .frame(width: 1)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    } else if let todayIndex {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(HomeTone.accent.opacity(0.07))
                            .frame(width: cell)
                            .offset(x: nameWidth + cell * CGFloat(todayIndex))
                    }
                    VStack(spacing: 2) {
                        ForEach(Array(entries.enumerated()), id: \.element.0.id) { _, entry in
                            let chip = homeDueChip(entry.0, due: entry.1, lang: lang)
                            let name = entry.0.customerName.isEmpty ? entry.0.designName : entry.0.customerName
                            let ref = entry.0.watchRef.trimmingCharacters(in: .whitespaces)
                            let placed = homeWeekBarColumns(order: entry.0, due: entry.1, days: days)
                            // The section below spells out the dates, so up here
                            // only the bars that need doing something about carry
                            // a word.
                            let urgent = placed.offWeek
                                || (Calendar.current.dateComponents([.day], from: today,
                                                                    to: Calendar.current.startOfDay(for: entry.1)).day ?? 0) <= 1
                            HStack(spacing: 0) {
                                Text(ref.isEmpty ? name : "\(ref.hasPrefix("#") ? ref : "#" + ref) \(name)")
                                    .font(.system(size: compact ? 10.5 : 11.5))
                                    .foregroundColor(.primary.opacity(0.75))
                                    .lineLimit(1)
                                    .frame(width: nameWidth - 8, alignment: .leading)
                                    .padding(.trailing, 8)
                                ZStack(alignment: .leading) {
                                    Color.clear
                                    HomeWeekBar(label: large && !urgent ? "" : chip.label,
                                                tone: chip.tone, dashed: placed.offWeek)
                                        // A bar narrower than its own chip grows
                                        // to fit the word, and grows leftward at
                                        // the last column so it stays on the card.
                                        .frame(width: large && !urgent
                                               ? max(cell, cell * CGFloat(placed.end - placed.start + 1))
                                               : max(54, cell * CGFloat(placed.end - placed.start + 1)))
                                        .offset(x: cell * CGFloat(placed.start))
                                }
                            }
                            .frame(maxHeight: .infinity)
                            .overlay(alignment: .bottom) {
                                if large {
                                    Rectangle().fill(Color.primary.opacity(0.08))
                                        .frame(height: 1).padding(.leading, nameWidth)
                                }
                            }
                        }
                    }
                }

                if large && !ahead.isEmpty {
                    Rectangle().fill(Color.primary.opacity(0.12))
                        .frame(height: 1).padding(.top, 6)
                    HomeEyebrow(text: t("Upcoming", lang: lang))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 6)
                    HomeUpcomingRow(entries: ahead, lang: lang)
                }
            }
        }
    }
}

/// The next deadlines, spelled out: the timeline says when in the week, this
/// says which day and whose order.
struct HomeUpcomingRow: View {
    let entries: [(Siparis, Date)]
    let lang: String
    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(entries.enumerated()), id: \.element.0.id) { index, entry in
                let chip = homeDueChip(entry.0, due: entry.1, lang: lang)
                let name = entry.0.customerName.isEmpty ? entry.0.designName : entry.0.customerName
                let ref = entry.0.watchRef.trimmingCharacters(in: .whitespaces)
                HStack(spacing: 9) {
                    Image(systemName: "calendar")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(chip.tone)
                        .frame(width: 30, height: 30)
                        .background(Circle().fill(chip.tone.opacity(0.12)))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(chip.label)
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(chip.tone)
                            .lineLimit(1)
                        Text(ref.isEmpty ? name : "\(ref.hasPrefix("#") ? ref : "#" + ref) \(name)")
                            .font(.system(size: 11.5))
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.leading, index == 0 ? 0 : 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .leading) {
                    if index > 0 {
                        Rectangle().fill(Color.primary.opacity(0.12)).frame(width: 1)
                    }
                }
            }
        }
    }
}

/// Which columns a bar covers, and whether the deadline fell before this week —
/// then there is no span to draw and the chip stands on its own.
func homeWeekBarColumns(order: Siparis, due: Date, days: [Date]) -> (start: Int, end: Int, offWeek: Bool) {
    let calendar = Calendar.current
    let weekStart = days.first ?? homeStartOfToday()
    let column = { (date: Date) -> Int in
        calendar.dateComponents([.day], from: weekStart, to: calendar.startOfDay(for: date)).day ?? 0
    }
    let from = max(0, column(order.paymentDate))
    let to = column(due)
    let end = min(max(to, from), 6)
    let start = end == 6 ? min(from, 5) : min(from, 6)
    return (start, end, to < 0)
}

struct HomeWeekBar: View {
    let label: String
    let tone: Color
    var dashed: Bool = false
    var body: some View {
        HStack(spacing: 0) {
            Spacer(minLength: 0)
            Text(label)
                .font(.system(size: 9.5, weight: .bold))
                .foregroundColor(tone)
                .lineLimit(1)
        }
        .padding(.horizontal, 6)
        .frame(height: 18)
        .background(
            RoundedRectangle(cornerRadius: 7)
                .fill(dashed ? Color.clear : tone.opacity(0.10))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 7)
                .strokeBorder(tone.opacity(0.5),
                              style: StrokeStyle(lineWidth: 1, dash: dashed ? [3, 2] : []))
        )
    }
}

/// "24–30 Aug", or "28 Aug – 3 Sep" when the visible week straddles two months.
func homeWeekRangeLabel(lang: String) -> String {
    let week = homeWeekDays()
    guard let start = week.first, let end = week.last else { return "" }
    let calendar = Calendar.current
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: localeIdentifier(forLanguage: lang))
    formatter.dateFormat = "d MMM"
    let sameMonth = calendar.component(.month, from: start) == calendar.component(.month, from: end)
    if sameMonth {
        return "\(calendar.component(.day, from: start))–\(formatter.string(from: end))"
    }
    return "\(formatter.string(from: start)) – \(formatter.string(from: end))"
}

/// The visible week, Monday first, so the strip and the timeline agree.
func homeWeekDays() -> [Date] {
    let today = homeStartOfToday()
    let weekday = Calendar.current.component(.weekday, from: today)
    let offset = -((weekday + 5) % 7)
    let start = Calendar.current.date(byAdding: .day, value: offset, to: today) ?? today
    return (0..<7).compactMap { Calendar.current.date(byAdding: .day, value: $0, to: start) }
}

// MARK: - Files

struct HomeFilesBody: View {
    let size: HomeCardSize
    let lang: String
    let currency: String
    let decimal: String
    var compact: Bool = false
    @EnvironmentObject var firebaseManager: FirebaseManager
    /// The plan's storage ceiling — a size with no ceiling is not an answer.
    @EnvironmentObject var auth: AuthViewModel

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
                    // The square asks the same question as the wide card — how
                    // full is this workspace, and what landed recently. "File
                    // library" was the file count again under a second name.
                    let limitBytes = Double(auth.effectiveStorageLimitMB) * 1024 * 1024
                    let pct = limitBytes > 0 ? min(100, Int((used / limitBytes) * 100)) : 0
                    if limitBytes > 0 {
                        VStack(alignment: .leading, spacing: compact ? 3 : 5) {
                            HStack {
                                Text("\(homeFileSize(used)) \(t("of", lang: lang)) \(homeFileSize(limitBytes))")
                                    .font(.system(size: compact ? 10.5 : 12.5)).foregroundColor(.secondary)
                                    .lineLimit(1).minimumScaleFactor(0.7)
                                Spacer(minLength: 4)
                                Text("\(pct)%")
                                    .font(.system(size: compact ? 10.5 : 12.5, weight: .heavy))
                                    .foregroundColor(pct >= 90 ? HomeTone.red : HomeTone.accent)
                            }
                            HomeProgressBar(fraction: Double(pct) / 100, tint: pct >= 90 ? HomeTone.red : HomeTone.accent)
                        }
                    }
                    if !compact { HomeEyebrow(text: t("Recent files", lang: lang)) }
                    ForEach(Array(files.prefix(2).enumerated()), id: \.offset) { _, entry in
                        HomeFileRow(file: entry.1, order: entry.0, lang: lang,
                                    compact: compact, stacked: true)
                    }
                    Spacer(minLength: 0)
                }
            } else if size == .twoByOne {
                // The sheet leads with how full the workspace is, not how many
                // bytes it holds: a size on its own says nothing without the
                // plan's ceiling.
                let limitBytes = Double(auth.effectiveStorageLimitMB) * 1024 * 1024
                let pct = limitBytes > 0 ? min(100, Int((used / limitBytes) * 100)) : 0
                VStack(alignment: .leading, spacing: compact ? 5 : 9) {
                    if limitBytes > 0 {
                        // The figures, the percentage and the bar on one line,
                        // the way the sheet lays them out. Two lines here was a
                        // whole file row's worth of height on a card that shows
                        // three of them.
                        HStack(spacing: 10) {
                            Text("\(homeFileSize(used)) \(t("of", lang: lang)) \(homeFileSize(limitBytes))")
                                .font(.system(size: compact ? 10.5 : 12.5)).foregroundColor(.secondary)
                                .lineLimit(1).fixedSize()
                            Text("\(pct)%")
                                .font(.system(size: compact ? 10.5 : 12.5, weight: .heavy))
                                .foregroundColor(pct >= 90 ? HomeTone.red : HomeTone.accent)
                                .fixedSize()
                            HomeProgressBar(fraction: Double(pct) / 100, tint: pct >= 90 ? HomeTone.red : HomeTone.accent)
                        }
                    }
                    // The eyebrow goes first on a phone — the card is called
                    // Files and the rows are plainly the recent ones, so it was
                    // the line carrying the least.
                    if !compact { HomeEyebrow(text: t("Recent files", lang: lang)) }
                    ForEach(Array(files.prefix(3).enumerated()), id: \.offset) { _, entry in
                        HomeFileRow(file: entry.1, order: entry.0, lang: lang, compact: compact)
                    }
                    Spacer(minLength: 0)
                }
            } else {
                // The sheet's three figures: how many, how full, and how many
                // are floating free. The last is the only one that asks for
                // anything to be done, so it gets the banner and the way to do
                // it.
                let limitBytes = Double(auth.effectiveStorageLimitMB) * 1024 * 1024
                let pct = limitBytes > 0 ? min(100, Int((used / limitBytes) * 100)) : 0
                // Every file here comes FROM an order, so none are unlinked —
                // an order with a blank customer name is not an unlinked file.
                // The figure stays honest at zero rather than counting the
                // wrong thing; web reads a list that can carry loose files.
                let unlinked = files.filter { $0.0.id?.isEmpty ?? true }
                VStack(alignment: .leading, spacing: compact ? 6 : 10) {
                    HStack(spacing: compact ? 5 : 10) {
                        HomeStockTile(label: t("files", lang: lang), value: "\(files.count)",
                                      tone: HomeTone.accent, compact: compact)
                        HomeStockTile(label: t("Storage", lang: lang),
                                      value: limitBytes > 0 ? "\(pct)%" : homeFileSize(used),
                                      tone: pct >= 90 ? HomeTone.red : HomeTone.green, compact: compact,
                                      sub: limitBytes > 0
                                        ? "\(homeFileSize(used)) \(t("of", lang: lang)) \(homeFileSize(limitBytes))"
                                        : "")
                        HomeStockTile(label: t("Unlinked", lang: lang), value: "\(unlinked.count)",
                                      tone: unlinked.isEmpty ? HomeTone.accent : HomeTone.orange,
                                      compact: compact)
                    }
                    HomePanel(compact: compact) {
                        HomeEyebrow(text: t("Recent files", lang: lang))
                        ForEach(Array(files.prefix(4).enumerated()), id: \.offset) { _, entry in
                            HomeFileRow(file: entry.1, order: entry.0, lang: lang, compact: compact)
                        }
                    }
                    if !unlinked.isEmpty {
                        HStack(spacing: compact ? 7 : 9) {
                            Image(systemName: "link")
                                .font(.system(size: compact ? 11 : 13)).foregroundColor(HomeTone.orange)
                            Text(t("{count} files are not linked to a record.", lang: lang)
                                    .replacingOccurrences(of: "{count}", with: "\(unlinked.count)"))
                                .font(.system(size: compact ? 10.5 : 12, weight: .semibold))
                                .foregroundColor(HomeTone.orange).lineLimit(1)
                            Spacer(minLength: 4)
                            Text(t("Review", lang: lang))
                                .font(.system(size: compact ? 10 : 11.5, weight: .heavy))
                                .foregroundColor(HomeTone.orange)
                                .padding(.horizontal, 9).padding(.vertical, 2)
                                .overlay(Capsule().stroke(HomeTone.orange.opacity(0.5), lineWidth: 1))
                        }
                        .padding(.horizontal, compact ? 9 : 12).padding(.vertical, compact ? 6 : 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: 11).fill(HomeTone.orange.opacity(0.12)))
                        .overlay(RoundedRectangle(cornerRadius: 11).stroke(HomeTone.orange.opacity(0.28), lineWidth: 1))
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
    var compact: Bool = false
    /// Opens the Notes tab with the composer up — the same route the + in the
    /// header and the app-icon shortcut take.
    var onNewNote: () -> Void = {}
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
                VStack(alignment: .leading, spacing: compact ? 5 : 8) {
                    // The sheet opens this card with somewhere to start typing.
                    // A button, not a field: the composer lives on the Notes
                    // screen and two places to draft the same note is one too
                    // many.
                    Button(action: onNewNote) {
                        Text(t("Take a note…", lang: lang))
                            .font(.system(size: compact ? 11 : 12.5)).foregroundColor(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, compact ? 10 : 12).padding(.vertical, compact ? 6 : 9)
                            .overlay(RoundedRectangle(cornerRadius: compact ? 9 : 11)
                                .stroke(Color.primary.opacity(0.12), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    if !pinned.isEmpty {
                        HomeEyebrow(text: t("Pinned", lang: lang))
                        HomeNoteGrid(notes: Array(pinned.prefix(2)), lang: lang, columns: 2, compact: compact)
                    }
                    HomeEyebrow(text: t("Recent", lang: lang))
                    // Tiles here too, which is what the sheet draws. The rows
                    // were chosen when this card showed a title and one fact
                    // beside it; the tile has since learned to carry the note's
                    // colour, its chip and its reminder, and those are the three
                    // things that tell you which note this is. Two columns fit
                    // four of them in the space three rows took.
                    HomeNoteGrid(notes: Array(recent.prefix(pinned.isEmpty ? 6 : 4)),
                                 lang: lang, columns: 2, compact: compact)
                    Spacer(minLength: 0)
                }
            } else if size == .oneByOne {
                // The square opens where you would start typing, as the sheet
                // draws it, and the + that used to sit in the header comes with
                // it — two controls for one action do not fit a card this size.
                // Still a button rather than a field, for the reason the 2x2
                // gives above.
                VStack(alignment: .leading, spacing: 5) {
                    Button(action: onNewNote) {
                        HStack(spacing: 6) {
                            Text(t("Take a note…", lang: lang))
                                .font(.system(size: 12)).foregroundColor(.secondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Text("+")
                                .font(.system(size: 14, weight: .heavy)).foregroundColor(.white)
                                .frame(width: 22, height: 22)
                                .background(RoundedRectangle(cornerRadius: 7).fill(HomeTone.accent))
                        }
                        .padding(.leading, 10).padding(.trailing, 3)
                        .padding(.vertical, 3)
                        .overlay(RoundedRectangle(cornerRadius: 9)
                            .stroke(Color.primary.opacity(0.12), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    HomeNoteGrid(notes: Array((pinned + recent).prefix(2)), lang: lang,
                                 columns: 1, compact: compact)
                    Spacer(minLength: 0)
                }
            } else {
                // The wide card opens with the field too, as the sheet draws
                // it. Its + is the named button in the header, so the field
                // here carries none.
                VStack(alignment: .leading, spacing: compact ? 5 : 8) {
                    Button(action: onNewNote) {
                        Text(t("Take a note…", lang: lang))
                            .font(.system(size: compact ? 11 : 12)).foregroundColor(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, compact ? 10 : 11).padding(.vertical, compact ? 5 : 7)
                            .overlay(RoundedRectangle(cornerRadius: 9)
                                .stroke(Color.primary.opacity(0.12), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    HomeNoteGrid(notes: Array((pinned + recent).prefix(3)), lang: lang,
                                 columns: 3, compact: compact)
                    Spacer(minLength: 0)
                }
            }
        }
    }
}

struct HomeNoteGrid: View {
    let notes: [StudioKeepNote]
    let lang: String
    let columns: Int
    var compact: Bool = false
    var body: some View {
        let spacing: CGFloat = compact ? 5 : 9
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: spacing), count: columns), spacing: spacing) {
            ForEach(notes, id: \.id) { note in
                HomeNoteTile(note: note, lang: lang, compact: compact)
            }
        }
    }
}

/// The sheet's file row: what kind it is, its name, what it is attached to, and
/// when it arrived — the last is what a person actually asks about an upload.
struct HomeFileRow: View {
    let file: ClientFileItem
    let order: Siparis
    let lang: String
    var compact: Bool = false
    /// On a square the name and the chip cannot share a line — 162pt leaves the
    /// name about 55pt beside a chip, which is not a filename any more.
    var stacked: Bool = false
    var body: some View {
        let tone = homeFileTone(file.fileName)
        let ext = String((file.fileName.split(separator: ".").last ?? "").prefix(4)).uppercased()
        HStack(spacing: compact ? 7 : 10) {
            Text(ext)
                .font(.system(size: compact ? 6.5 : 8, weight: .heavy)).foregroundColor(tone)
                .frame(width: compact ? 20 : 28, height: compact ? 20 : 28)
                .background(RoundedRectangle(cornerRadius: compact ? 5 : 7).fill(tone.opacity(0.14)))
            if stacked {
                VStack(alignment: .leading, spacing: 1) {
                    Text(file.fileName)
                        .font(.system(size: compact ? 9.5 : 12, weight: .semibold)).lineLimit(1)
                    if !order.customerName.isEmpty || !order.designName.isEmpty {
                        HomeChip(text: order.designName.isEmpty ? order.customerName : order.designName,
                                 tone: HomeTone.accent)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Text(file.fileName)
                    .font(.system(size: compact ? 10.5 : 12.5, weight: .semibold)).lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if !order.customerName.isEmpty || !order.designName.isEmpty {
                    HomeChip(text: order.designName.isEmpty ? order.customerName : order.designName,
                             tone: HomeTone.accent)
                }
                Text(homeAgoLabel(file.uploadedAt, lang: lang))
                    .font(.system(size: compact ? 9.5 : 11.5)).foregroundColor(.secondary).lineLimit(1)
            }
        }
        .padding(.vertical, compact ? 2 : 5)
    }
}

/// "Just now" / "5 min ago" / "Today" / "Yesterday" / the date.
func homeAgoLabel(_ when: Date, lang: String) -> String {
    let mins = Int(Date().timeIntervalSince(when) / 60)
    if mins < 1 { return t("Just now", lang: lang) }
    if mins < 60 { return "\(mins) " + t("min ago", lang: lang) }
    let days = Calendar.current.dateComponents([.day], from: when, to: homeStartOfToday()).day ?? 0
    if days <= 0 { return t("Today", lang: lang) }
    if days == 1 { return t("Yesterday", lang: lang) }
    return when.formatted(date: .abbreviated, time: .omitted)
}

/// A note keeps its own colour — that is the note's, not the card's.
struct HomeNoteTile: View {
    let note: StudioKeepNote
    let lang: String
    /// Two notes in a 162pt square leave about 46pt each, so the body drops to
    /// one line and the type comes down.
    var compact: Bool = false
    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 1 : 4) {
            Text(note.title.isEmpty ? t("Untitled note", lang: lang) : note.title)
                .font(.system(size: compact ? 11 : 12.5, weight: .heavy)).lineLimit(1)
                // Only a pinned note pays for the pin's corner: reserving it on
                // every note would cost the unpinned ones a word for nothing.
                .padding(.trailing, note.isPinned ? 14 : 0)
            if !note.text.isEmpty {
                Text(note.text)
                    .font(.system(size: compact ? 9 : 11.5)).foregroundColor(.secondary)
                    .lineLimit(compact ? 1 : 2)
            }
            Spacer(minLength: 0)
            HStack(spacing: 6) {
                if !note.linkedOrderLabel.isEmpty {
                    HomeChip(text: note.linkedOrderLabel, tone: homeNoteAccent(note.colorName))
                } else if !note.linkedCustomerName.isEmpty {
                    HomeChip(text: note.linkedCustomerName, tone: homeNoteAccent(note.colorName))
                }
                if let reminder = note.reminderDate {
                    Text(homeDayLabel(reminder, lang: lang))
                        .font(.system(size: 10.5, weight: .bold))
                        .foregroundColor(reminder < homeStartOfToday() ? HomeTone.red : HomeTone.green)
                }
            }
        }
        .padding(.horizontal, compact ? 8 : 11).padding(.vertical, compact ? 4 : 9)
        .frame(maxWidth: .infinity, minHeight: compact ? 0 : 66, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 12).fill(homeNoteColour(note.colorName)))
        // Top right, out of the title's way — the sheet marks the corner rather
        // than pushing the heading along.
        .overlay(alignment: .topTrailing) {
            if note.isPinned {
                Image(systemName: "pin.fill")
                    .font(.system(size: compact ? 8.5 : 10))
                    .foregroundColor(homeNoteAccent(note.colorName))
                    .padding(.top, compact ? 5 : 8).padding(.trailing, compact ? 6 : 9)
            }
        }
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

/// What a note is about, and the one fact worth showing beside it: when it is
/// due, or what it is attached to. Derived from the note — never invented.
func homeNoteAccent(_ name: String) -> Color {
    switch name.lowercased() {
    case "yellow": return Color(red: 0.541, green: 0.380, blue: 0.000)
    case "blue": return Color(red: 0.114, green: 0.306, blue: 0.847)
    case "green": return Color(red: 0.082, green: 0.502, blue: 0.239)
    case "red": return Color(red: 0.725, green: 0.110, blue: 0.110)
    case "purple": return Color(red: 0.427, green: 0.157, blue: 0.851)
    case "orange": return Color(red: 0.604, green: 0.204, blue: 0.071)
    default: return HomeTone.slate
    }
}
