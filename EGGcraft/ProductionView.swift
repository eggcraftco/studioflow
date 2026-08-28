import SwiftUI

/// Production — the operations layer between Orders ("what was ordered") and
/// Schedule ("when is it due"). One question: where is every live job right
/// now, and what has stopped.
///
/// Production status is deliberately kept apart from order, payment and
/// delivery status; the note at the foot of the screen says so out loud,
/// because conflating them is how a workshop loses track of its own work.
struct ProductionView: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @AppStorage("secilenDil") private var seciliDil: String = "English"
    @AppStorage("customStepsJSON") private var customStepsJSON: String = ""
    let canEdit: Bool
    /// Opens the order in the Orders tab — the board never becomes a second
    /// place to edit an order.
    var onOpenOrder: (Siparis) -> Void = { _ in }

    @State private var stages: [ProductionStage] = defaultProductionStages
    @State private var search = ""
    @State private var assigneeFilter = ""
    @State private var showDelivered = false
    @State private var selected: Siparis?
    @State private var busy = false
    @State private var notice = ""
    @State private var blockerFor: (order: Siparis, stageId: String)?
    @State private var lastMove: (orderId: String, result: ProductionMoveResult)?
    @State private var showUndo = false

    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var sizeClass
    private var isNarrow: Bool { sizeClass == .compact }
    #else
    private var isNarrow: Bool { false }
    #endif

    // MARK: - Data

    private var steps: [(id: String, title: String)] {
        guard let data = customStepsJSON.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([CustomStepDTO].self, from: data) else {
            return [("design", "Design"), ("painting", "Painting")]
        }
        let rows = decoded
            .map { (id: $0.id.uuidString.lowercased(), title: $0.title.trimmingCharacters(in: .whitespaces)) }
            .filter { !$0.title.isEmpty }
        return rows.isEmpty ? [("design", "Design"), ("painting", "Painting")] : rows
    }

    private struct Card: Identifiable {
        let id: String
        let order: Siparis
        let resolved: ResolvedProductionStage
        let dueDate: Date?
        let isLate: Bool
        let isAtRisk: Bool
    }

    private var cards: [Card] {
        let today = Calendar.current.startOfDay(for: Date())
        let currentSteps = steps
        return firebaseManager.siparisler.compactMap { order -> Card? in
            if order.isDelivered && !showDelivered { return nil }
            if !search.isEmpty {
                let haystack = "\(order.customerName) \(order.designName) \(order.watchRef)".lowercased()
                if !haystack.contains(search.lowercased()) { return nil }
            }
            if !assigneeFilter.isEmpty && order.assignedToUid != assigneeFilter { return nil }

            let blocker = order.productionBlocker.flatMap {
                ProductionBlocker(reason: $0.reason, note: $0.note ?? "")
            }
            let resolved = resolveProductionStage(
                order: order,
                stages: stages,
                steps: currentSteps,
                overrideId: order.productionStageOverride ?? "",
                blocker: ProductionBlocker.reasons.contains(blocker?.reason ?? "") ? blocker : nil
            )
            let due = Calendar.current.date(byAdding: .day, value: order.deliveryTime, to: order.paymentDate)
            let daysLeft = due.map { Calendar.current.dateComponents([.day], from: today, to: Calendar.current.startOfDay(for: $0)).day ?? 0 }
            let finished = resolved.total > 0 && resolved.doneCount >= resolved.total
            return Card(
                id: order.id ?? UUID().uuidString,
                order: order,
                resolved: resolved,
                dueDate: due,
                isLate: (daysLeft ?? 1) < 0 && !order.isDelivered,
                isAtRisk: (order.risk != "None" && !order.risk.isEmpty && order.risk != "-")
                    || ((daysLeft ?? 99) >= 0 && (daysLeft ?? 99) <= 3 && !finished && !order.isDelivered)
            )
        }
        .sorted { ($0.dueDate ?? .distantFuture) < ($1.dueDate ?? .distantFuture) }
    }

    private var doneStageId: String { stages.first { $0.kind == .done }?.id ?? "" }

    private func cardsIn(_ stage: ProductionStage) -> [Card] {
        cards.filter { $0.resolved.stageId == stage.id }
    }

    // MARK: - Body

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            if !notice.isEmpty {
                Text(notice).font(.footnote).foregroundStyle(.orange)
            }
            kpiRow
            filters
            if isNarrow { narrowBoard } else { wideBoard }
            footnote
        }
        .padding(.horizontal, 14)
        .padding(.top, 10)
        .task { stages = await firebaseManager.loadProductionStages() }
        .sheet(item: $selected) { order in
            ProductionDetailSheet(
                order: order,
                stages: stages,
                steps: steps,
                lang: seciliDil,
                canEdit: canEdit,
                busy: busy,
                onOpenOrder: { onOpenOrder(order) },
                onMove: { stageId in requestMove(order: order, stageId: stageId) }
            )
        }
        .sheet(isPresented: Binding(get: { blockerFor != nil }, set: { if !$0 { blockerFor = nil } })) {
            BlockerReasonSheet(lang: seciliDil, busy: busy) { blocker in
                guard let pending = blockerFor else { return }
                blockerFor = nil
                Task { await move(order: pending.order, stageId: pending.stageId, blocker: blocker) }
            }
        }
        .overlay(alignment: .bottom) { undoBar }
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(t("Production", lang: seciliDil)).font(.system(size: 22, weight: .bold))
                Text(t("See every active order, current production stage and blocker in one place.", lang: seciliDil))
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
        }
    }

    private var kpiRow: some View {
        let live = cards.filter { $0.resolved.stageId != doneStageId }
        let today = Calendar.current.startOfDay(for: Date())
        let blockedIds = Set(stages.filter { $0.kind == .blocked }.map(\.id))
        let shipIds = Set(stages.filter { $0.kind == .shipready }.map(\.id))
        let dueThisWeek = live.filter { card in
            guard let due = card.dueDate else { return false }
            let days = Calendar.current.dateComponents([.day], from: today, to: Calendar.current.startOfDay(for: due)).day ?? 99
            return days >= 0 && days <= 7
        }.count
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                kpi(t("Active", lang: seciliDil), live.count, .blue)
                kpi(t("Due this week", lang: seciliDil), dueThisWeek, .orange)
                kpi(t("Blocked", lang: seciliDil), live.filter { blockedIds.contains($0.resolved.stageId) }.count, .red)
                kpi(t("At risk", lang: seciliDil), live.filter(\.isAtRisk).count, .yellow)
                kpi(t("Ready to ship", lang: seciliDil), live.filter { shipIds.contains($0.resolved.stageId) }.count, .green)
            }
        }
    }

    private func kpi(_ label: String, _ value: Int, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text("\(value)").font(.system(size: 22, weight: .bold)).monospacedDigit()
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .frame(minWidth: 118, alignment: .leading)
        .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
    }

    private var filters: some View {
        HStack(spacing: 8) {
            TextField(t("Search order, customer or item", lang: seciliDil), text: $search)
                .textFieldStyle(.roundedBorder)
                .frame(maxWidth: 300)
            Picker(t("All assignees", lang: seciliDil), selection: $assigneeFilter) {
                Text(t("All assignees", lang: seciliDil)).tag("")
                ForEach(assignees, id: \.uid) { Text($0.name).tag($0.uid) }
            }
            .frame(maxWidth: 220)
            Toggle(t("Show delivered", lang: seciliDil), isOn: $showDelivered)
                .toggleStyle(.switch)
            Spacer()
        }
    }

    private var assignees: [(uid: String, name: String)] {
        var seen = Set<String>()
        var rows: [(uid: String, name: String)] = []
        for order in firebaseManager.siparisler where !order.assignedToUid.isEmpty {
            guard seen.insert(order.assignedToUid).inserted else { continue }
            rows.append((order.assignedToUid, assigneeName(order)))
        }
        return rows.sorted { $0.name < $1.name }
    }

    /// The order carries the assignee's email, which is enough to name a card.
    /// The full member list lives on AuthViewModel and the board does not need
    /// it just to print a name.
    private func assigneeName(_ order: Siparis) -> String {
        if order.assignedToUid.isEmpty || order.assignedToEmail.isEmpty {
            return t("Unassigned", lang: seciliDil)
        }
        return order.assignedToEmail
    }

    /// Mac and iPad: the columns side by side, the way a bench is read.
    private var wideBoard: some View {
        ScrollView(.horizontal, showsIndicators: true) {
            HStack(alignment: .top, spacing: 12) {
                ForEach(stages) { stage in
                    VStack(alignment: .leading, spacing: 8) {
                        columnHeader(stage)
                        ScrollView {
                            LazyVStack(spacing: 8) {
                                ForEach(cardsIn(stage)) { card in
                                    cardView(card)
                                }
                                if cardsIn(stage).isEmpty {
                                    Text(t("Nothing here", lang: seciliDil))
                                        .font(.caption).foregroundStyle(.secondary)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }
                            .padding(.horizontal, 8).padding(.bottom, 10)
                        }
                    }
                    .frame(width: 250)
                    .background(Color.secondary.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
                }
            }
            .padding(.bottom, 4)
        }
    }

    /// iPhone: the same lanes, stacked — a 250pt column has nowhere to go on a
    /// phone, and a bench list reads better one stage at a time.
    private var narrowBoard: some View {
        List {
            ForEach(stages) { stage in
                let rows = cardsIn(stage)
                Section {
                    if rows.isEmpty {
                        Text(t("Nothing here", lang: seciliDil)).font(.caption).foregroundStyle(.secondary)
                    } else {
                        ForEach(rows) { card in cardView(card) }
                    }
                } header: {
                    HStack {
                        Text(t(stage.title, lang: seciliDil))
                        Spacer()
                        Text(wipText(stage, rows.count)).monospacedDigit()
                    }
                }
            }
        }
        .listStyle(.plain)
    }

    private func wipText(_ stage: ProductionStage, _ count: Int) -> String {
        stage.wipLimit > 0 ? "\(count) / \(stage.wipLimit)" : "\(count)"
    }

    private func columnHeader(_ stage: ProductionStage) -> some View {
        let rows = cardsIn(stage)
        let level = productionWipLevel(count: rows.count, limit: stage.wipLimit)
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Circle().fill(stageTint(stage.kind)).frame(width: 8, height: 8)
                Text(t(stage.title, lang: seciliDil))
                    .font(.system(size: 11, weight: .bold))
                    .textCase(.uppercase)
                if level == .over {
                    Image(systemName: "exclamationmark.triangle.fill").font(.caption2).foregroundStyle(.orange)
                }
                Spacer()
            }
            HStack {
                Text("\(rows.count)").font(.system(size: 15, weight: .semibold)).monospacedDigit()
                Spacer()
                if stage.wipLimit > 0 {
                    Text(wipText(stage, rows.count)).font(.caption2).foregroundStyle(.secondary).monospacedDigit()
                }
            }
            // The capacity bar warns; it never blocks. A workshop can always
            // take one more job, and the board should not pretend otherwise.
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.secondary.opacity(0.2))
                    Capsule().fill(wipTint(level))
                        .frame(width: stage.wipLimit > 0
                               ? min(1, Double(rows.count) / Double(stage.wipLimit)) * geometry.size.width
                               : 0)
                }
            }
            .frame(height: 4)
        }
        .padding(.horizontal, 10).padding(.top, 10)
    }

    private func stageTint(_ kind: ProductionStageKind) -> Color {
        switch kind {
        case .ready: return .blue
        case .active: return .blue
        case .blocked: return .red
        case .review: return .purple
        case .shipready: return .green
        case .done: return .gray
        }
    }

    private func wipTint(_ level: ProductionWipLevel) -> Color {
        switch level {
        case .none: return .clear
        case .ok: return .green
        case .near: return .orange
        case .over: return .red
        }
    }

    private func cardView(_ card: Card) -> some View {
        Button { selected = card.order } label: {
            VStack(alignment: .leading, spacing: 6) {
                Text("#\(card.order.watchRef.isEmpty ? String((card.order.id ?? "").prefix(6)) : card.order.watchRef) · \(card.order.customerName)")
                    .font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                Text(card.order.designName).font(.system(size: 13, weight: .semibold)).lineLimit(2)
                if let due = card.dueDate {
                    Text(due.formatted(.dateTime.day().month(.abbreviated)))
                        .font(.caption2)
                        .foregroundStyle(card.isLate ? Color.red : Color.secondary)
                }
                HStack {
                    Text(assigneeName(card.order)).font(.caption2).lineLimit(1)
                    Spacer()
                    Text(t(card.order.priority, lang: seciliDil))
                        .font(.caption2.bold())
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(priorityTint(card.order.priority).opacity(0.16), in: Capsule())
                }
                if card.resolved.total > 0 {
                    Text("\(card.resolved.doneCount) / \(card.resolved.total) \(t("steps", lang: seciliDil))")
                        .font(.caption2).foregroundStyle(.secondary).monospacedDigit()
                }
                if let blocker = card.resolved.blocker {
                    Text(blocker.note.isEmpty ? t(blocker.label, lang: seciliDil) : blocker.note)
                        .font(.caption2.bold())
                        .foregroundStyle(.red)
                        .padding(.horizontal, 7).padding(.vertical, 4)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.red.opacity(0.12), in: RoundedRectangle(cornerRadius: 7))
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 11))
        }
        .buttonStyle(.plain)
    }

    private func priorityTint(_ priority: String) -> Color {
        switch priority.lowercased() {
        case "urgent": return .red
        case "high": return .orange
        case "low": return .green
        default: return .secondary
        }
    }

    private var footnote: some View {
        HStack(spacing: 7) {
            Image(systemName: "info.circle")
            Text(t("Production status is separate from Order, Payment and Delivery status.", lang: seciliDil))
        }
        .font(.caption2).foregroundStyle(.secondary)
        .padding(.vertical, 8).padding(.horizontal, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.blue.opacity(0.08), in: RoundedRectangle(cornerRadius: 9))
    }

    @ViewBuilder
    private var undoBar: some View {
        if showUndo, let move = lastMove {
            HStack(spacing: 12) {
                Text(t("Production stage changed", lang: seciliDil)).font(.footnote)
                Button(t("Undo", lang: seciliDil)) {
                    showUndo = false
                    Task {
                        do {
                            try await firebaseManager.undoOrderProductionStage(orderId: move.orderId, previous: move.result)
                        } catch {
                            notice = error.localizedDescription
                        }
                    }
                }
                .buttonStyle(.borderless)
                Button { showUndo = false } label: { Image(systemName: "xmark") }
                    .buttonStyle(.borderless)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(.thinMaterial, in: Capsule())
            .padding(.bottom, 14)
        }
    }

    // MARK: - Moving work

    private func requestMove(order: Siparis, stageId: String) {
        guard let target = stages.first(where: { $0.id == stageId }) else { return }
        selected = nil
        // The blocked lane is the one place the board asks a question before it
        // accepts a card: a job that goes quiet without a reason is the exact
        // failure this screen exists to prevent.
        if target.kind == .blocked {
            blockerFor = (order, stageId)
            return
        }
        Task { await move(order: order, stageId: stageId, blocker: nil) }
    }

    private func move(order: Siparis, stageId: String, blocker: ProductionBlocker?) async {
        guard let orderId = order.id else { return }
        busy = true
        do {
            let result = try await firebaseManager.setOrderProductionStage(
                orderId: orderId, stageId: stageId, blocker: blocker)
            lastMove = (orderId, result)
            showUndo = true
            notice = ""
        } catch {
            notice = error.localizedDescription
        }
        busy = false
    }
}

/// The steps behind the one-line stage, plus the only two controls the board
/// needs: open the order, or move it.
private struct ProductionDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    let order: Siparis
    let stages: [ProductionStage]
    let steps: [(id: String, title: String)]
    let lang: String
    let canEdit: Bool
    let busy: Bool
    let onOpenOrder: () -> Void
    let onMove: (String) -> Void

    @State private var targetStage = ""

    private var resolved: ResolvedProductionStage {
        let blocker = order.productionBlocker.flatMap { ProductionBlocker(reason: $0.reason, note: $0.note ?? "") }
        return resolveProductionStage(
            order: order,
            stages: stages,
            steps: steps,
            overrideId: order.productionStageOverride ?? "",
            blocker: blocker
        )
    }

    var body: some View {
        let stage = resolved
        let percent = stage.total > 0 ? Int(Double(stage.doneCount) / Double(stage.total) * 100) : 0
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("#\(order.watchRef) · \(order.customerName)")
                            .font(.caption).foregroundStyle(.secondary)
                        Text(order.designName).font(.title3.bold())
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(t("Production progress", lang: lang)).font(.subheadline.weight(.semibold))
                            Spacer()
                            Text("\(percent)%").font(.title3.bold()).monospacedDigit()
                        }
                        ProgressView(value: Double(stage.doneCount), total: Double(max(stage.total, 1)))
                        Text("\(stage.doneCount) / \(stage.total) \(t("steps", lang: lang))")
                            .font(.caption).foregroundStyle(.secondary).monospacedDigit()
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(Array(steps.enumerated()), id: \.offset) { pair in
                            let value = productionStepValue(
                                order: order, stepId: pair.element.id, stepTitle: pair.element.title, index: pair.offset)
                            let done = productionStepIsDone(value)
                            let current = pair.element.title == stage.currentStep && !done
                            HStack(spacing: 10) {
                                Image(systemName: done ? "checkmark.circle.fill" : (current ? "circle.inset.filled" : "circle"))
                                    .foregroundStyle(done ? Color.green : (current ? Color.accentColor : Color.secondary))
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(t(pair.element.title, lang: lang)).font(.subheadline)
                                    if current {
                                        Text(t("In progress", lang: lang)).font(.caption2).foregroundStyle(Color.accentColor)
                                    }
                                }
                                Spacer()
                            }
                            .padding(.vertical, 5).padding(.horizontal, 8)
                            .background(current ? Color.accentColor.opacity(0.10) : .clear,
                                        in: RoundedRectangle(cornerRadius: 8))
                        }
                    }

                    fact(t("Current operation", lang: lang),
                         stage.currentStep.isEmpty ? t("Nothing in progress", lang: lang) : t(stage.currentStep, lang: lang))
                    fact(t("Blocker", lang: lang),
                         stage.blocker.map { $0.note.isEmpty ? t($0.label, lang: lang) : "\(t($0.label, lang: lang)) — \($0.note)" }
                            ?? t("No blocker", lang: lang),
                         tint: stage.blocker == nil ? .secondary : .red)
                    if stage.source == "manual" {
                        fact(t("Stage", lang: lang), t("Set by hand", lang: lang))
                    }

                    if canEdit {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(t("Update status", lang: lang)).font(.caption).foregroundStyle(.secondary)
                            Picker("", selection: $targetStage) {
                                ForEach(stages) { Text(t($0.title, lang: lang)).tag($0.id) }
                            }
                            .labelsHidden()
                            .disabled(busy)
                            .onChange(of: targetStage) { _, newValue in
                                guard !newValue.isEmpty, newValue != stage.stageId else { return }
                                onMove(newValue)
                            }
                        }
                    }

                    Button { onOpenOrder(); dismiss() } label: {
                        Label(t("Open order", lang: lang), systemImage: "arrow.up.right.square")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }
                .padding(18)
            }
            .navigationTitle(t("Production", lang: lang))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(t("Close", lang: lang)) { dismiss() }
                }
            }
        }
        .frame(minWidth: 360, minHeight: 460)
        .onAppear { targetStage = resolved.stageId }
    }

    private func fact(_ label: String, _ value: String, tint: Color = .primary) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.subheadline).foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A blocked job needs a reason. Without one the board cannot be trusted, so
/// the server refuses the move and this is where the answer is collected.
private struct BlockerReasonSheet: View {
    @Environment(\.dismiss) private var dismiss
    let lang: String
    let busy: Bool
    let onConfirm: (ProductionBlocker) -> Void

    @State private var reason = ProductionBlocker.reasons[0]
    @State private var note = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(t("Why is this job waiting?", lang: lang)).font(.title3.bold())
            Text(t("A blocked job needs a reason so the board can be trusted.", lang: lang))
                .font(.footnote).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            Picker("", selection: $reason) {
                ForEach(ProductionBlocker.reasons, id: \.self) { code in
                    Text(t(ProductionBlocker.labels[code] ?? code, lang: lang)).tag(code)
                }
            }
            .pickerStyle(.inline)
            .labelsHidden()
            TextField(t("Note (optional)", lang: lang), text: $note)
                .textFieldStyle(.roundedBorder)
            HStack {
                Spacer()
                Button(t("Cancel", lang: lang)) { dismiss() }
                Button(t("Mark as blocked", lang: lang)) {
                    onConfirm(ProductionBlocker(reason: reason, note: note.trimmingCharacters(in: .whitespaces)))
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
                .disabled(busy)
            }
        }
        .padding(20)
        .frame(minWidth: 380)
    }
}
