import SwiftUI

// Stocktake and reporting on Mac and iPhone.
//
// The system says 200 spring bars; you count 187. The thirteen are the point —
// breakage, a part used without being logged, a miscount last year. Typing 187
// over the number answers the question and destroys it, so a count is kept as a
// record and nothing touches the shelf until it is applied.

private func signedMoney(_ symbol: String, _ value: Double) -> String {
    (value < 0 ? "−" : "") + inventoryMoney(symbol, abs(value))
}

struct StocktakeTab: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    let currencySymbol: String
    let lang: String
    let canEdit: Bool
    /// The workspace's own category names, for the count filter.
    let categoryOptions: [String]
    let onStockChanged: () -> Void

    @State private var summaries: [StocktakeSummary] = []
    @State private var openId = ""
    @State private var lines: [StocktakeLine] = []
    @State private var counts: [String: String] = [:]
    @State private var startLocation = ""
    @State private var startCategory = ""
    @State private var loading = true
    @State private var busy = false
    @State private var notice = ""
    @State private var error = ""
    @State private var outcome: (adjusted: Int, valueDelta: Double, overPromised: [OverPromisedItem])?

    private var countedLines: [StocktakeLine] {
        lines.filter { !(counts[$0.itemId] ?? "").trimmingCharacters(in: .whitespaces).isEmpty }
    }
    private var differences: [StocktakeLine] {
        countedLines.filter { line in
            (Double(counts[line.itemId] ?? "") ?? line.expected) != line.expected
        }
    }
    private var valueDelta: Double {
        differences.reduce(0) { sum, line in
            sum + ((Double(counts[line.itemId] ?? "") ?? line.expected) - line.expected) * line.unitCost
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(t("Count what is actually on the shelf. The difference is the point — nothing is changed until you apply it.", lang: lang))
                .font(.system(size: 11)).foregroundColor(.secondary)

            if !notice.isEmpty {
                Text(notice).font(.system(size: 11)).foregroundColor(.secondary)
            }
            if !error.isEmpty {
                Text(error).font(.system(size: 12)).foregroundColor(.red)
            }

            if let outcome {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(t("Lines adjusted", lang: lang)).font(.system(size: 12))
                        Spacer()
                        Text("\(outcome.adjusted)").font(.system(size: 13, weight: .bold))
                    }
                    HStack {
                        Text(t("Change in stock value", lang: lang)).font(.system(size: 12))
                        Spacer()
                        Text(signedMoney(currencySymbol, outcome.valueDelta))
                            .font(.system(size: 13, weight: .bold))
                    }
                    ForEach(outcome.overPromised) { row in
                        VStack(alignment: .leading, spacing: 1) {
                            Text(row.name).font(.system(size: 12, weight: .semibold))
                            Text("\(t("Counted", lang: lang)) \(formatQuantity(row.counted)), \(t("but orders are holding", lang: lang)) \(formatQuantity(row.reserved))")
                                .font(.system(size: 10)).foregroundColor(.orange)
                        }
                    }
                }
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 12).fill(Color.blue.opacity(0.06)))
            }

            if loading {
                Text(t("Loading…", lang: lang)).font(.system(size: 12)).foregroundColor(.secondary)
            } else if !openId.isEmpty {
                countingList
            } else {
                startBlock
                historyList
            }
        }
        .task { await reload() }
    }

    private var countingList: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 14) {
                stat(t("Counted", lang: lang), "\(countedLines.count) / \(lines.count)")
                stat(t("Differences", lang: lang), "\(differences.count)")
                stat(t("Change in stock value", lang: lang), signedMoney(currencySymbol, valueDelta))
            }

            ForEach(lines) { line in
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(line.name).font(.system(size: 13, weight: .semibold))
                        Text([line.number, line.location].filter { !$0.isEmpty }.joined(separator: " · "))
                            .font(.system(size: 10)).foregroundColor(.secondary)
                    }
                    Spacer()
                    Text("\(formatQuantity(line.expected))\(line.unit.isEmpty ? "" : " \(line.unit)")")
                        .font(.system(size: 12)).foregroundColor(.secondary)
                    TextField("—", text: Binding(
                        get: { counts[line.itemId] ?? "" },
                        set: { counts[line.itemId] = $0 }
                    ))
                    .frame(width: 64).multilineTextAlignment(.trailing)
                    .font(.system(size: 12))
                    .disabled(!canEdit)
                    differenceLabel(line)
                }
                Divider()
            }

            if canEdit {
                HStack {
                    Button(t("Abandon this count", lang: lang)) { Task { await abandon() } }
                        .font(.system(size: 11)).buttonStyle(.plain).foregroundColor(.red)
                    Spacer()
                    Button(t("Save progress", lang: lang)) { Task { await saveProgress() } }
                        .buttonStyle(.bordered).disabled(busy)
                    Button(busy
                           ? t("Applying…", lang: lang)
                           : "\(t("Apply", lang: lang)) \(differences.count) \(t("differences", lang: lang))") {
                        Task { await apply() }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(busy || countedLines.isEmpty)
                }
            }
        }
    }

    @ViewBuilder
    private func differenceLabel(_ line: StocktakeLine) -> some View {
        let raw = (counts[line.itemId] ?? "").trimmingCharacters(in: .whitespaces)
        if raw.isEmpty {
            Text(t("Not counted", lang: lang))
                .font(.system(size: 10)).foregroundColor(.secondary).frame(width: 74, alignment: .trailing)
        } else {
            let diff = (Double(raw) ?? line.expected) - line.expected
            Text(diff == 0 ? "—" : "\(diff > 0 ? "+" : "")\(formatQuantity(diff))")
                .font(.system(size: 12, weight: diff == 0 ? .regular : .bold))
                .foregroundColor(diff == 0 ? .secondary : (diff < 0 ? .red : .green))
                .frame(width: 74, alignment: .trailing)
        }
    }

    private var startBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(t("Start a count", lang: lang)).font(.system(size: 13, weight: .bold))
            Text(t("Nobody counts a whole workshop at once. Narrow it to a shelf or a category and the expected figures are frozen as you start.", lang: lang))
                .font(.system(size: 11)).foregroundColor(.secondary)
            if canEdit {
                TextField(t("Everything", lang: lang), text: $startLocation)
                    .textFieldStyle(.roundedBorder)
                Picker(t("Category", lang: lang), selection: $startCategory) {
                    Text(t("All Categories", lang: lang)).tag("")
                    ForEach(categoryOptions, id: \.self) { Text(t($0, lang: lang)).tag($0) }
                }
                .pickerStyle(.menu).font(.system(size: 12))
                Button(busy ? t("Starting…", lang: lang) : t("Start a count", lang: lang)) {
                    Task { await begin() }
                }
                .buttonStyle(.borderedProminent).disabled(busy)
            }
        }
    }

    private var historyList: some View {
        VStack(alignment: .leading, spacing: 8) {
            if summaries.isEmpty {
                Text(t("No counts yet", lang: lang)).font(.system(size: 13, weight: .bold))
                Text(t("A count tells you what is really there. The first one usually finds something.", lang: lang))
                    .font(.system(size: 11)).foregroundColor(.secondary)
            } else {
                ForEach(summaries) { row in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.number).font(.system(size: 13, weight: .bold))
                            Text([row.location, row.category, row.startedByEmail]
                                .filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.system(size: 10)).foregroundColor(.secondary)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("\(row.countedCount) / \(row.lineCount)").font(.system(size: 12))
                            if row.status == "committed" {
                                Text(signedMoney(currencySymbol, row.valueDelta))
                                    .font(.system(size: 11, weight: .semibold))
                            }
                        }
                        Text(t(row.status == "committed" ? "Applied"
                               : row.status == "open" ? "In progress" : "Abandoned", lang: lang))
                            .font(.system(size: 10, weight: .bold))
                            .padding(.horizontal, 7).padding(.vertical, 2)
                            .background(Capsule().fill(Color.blue.opacity(0.12)))
                            .foregroundColor(.blue)
                    }
                    Divider()
                }
            }
        }
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label).font(.system(size: 9, weight: .bold)).foregroundColor(.secondary)
            Text(value).font(.system(size: 15, weight: .bold))
        }
    }

    private func reload() async {
        loading = true
        do {
            summaries = try await firebaseManager.loadStocktakes()
            if let running = summaries.first(where: { $0.status == "open" }) {
                openId = running.id
                lines = try await firebaseManager.loadStocktakeLines(running.id)
                counts = Dictionary(uniqueKeysWithValues: lines.compactMap { line in
                    line.counted.map { (line.itemId, formatQuantity($0)) }
                })
            } else {
                openId = ""; lines = []; counts = [:]
            }
            error = ""
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func countsPayload() -> [String: Any] {
        var payload: [String: Any] = [:]
        for line in lines {
            let raw = (counts[line.itemId] ?? "").trimmingCharacters(in: .whitespaces)
            payload[line.itemId] = raw.isEmpty ? NSNull() : (Double(raw) ?? 0)
        }
        return payload
    }

    private func begin() async {
        busy = true; error = ""; outcome = nil
        do {
            _ = try await firebaseManager.startStocktake(location: startLocation, category: startCategory)
            await reload()
        } catch { self.error = error.localizedDescription }
        busy = false
    }

    private func saveProgress() async {
        busy = true; error = ""
        do {
            try await firebaseManager.saveStocktakeCounts(openId, counts: countsPayload())
            notice = t("Counts saved. Nothing has changed on the shelf yet.", lang: lang)
        } catch { self.error = error.localizedDescription }
        busy = false
    }

    private func apply() async {
        busy = true; error = ""; notice = ""
        do {
            // Saved first: what is committed must be what is on screen.
            try await firebaseManager.saveStocktakeCounts(openId, counts: countsPayload())
            outcome = try await firebaseManager.commitStocktake(openId)
            await reload()
            onStockChanged()
        } catch { self.error = error.localizedDescription }
        busy = false
    }

    private func abandon() async {
        busy = true
        do {
            try await firebaseManager.cancelStocktake(openId)
            await reload()
        } catch { self.error = error.localizedDescription }
        busy = false
    }
}

struct ReportsTab: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    let currencySymbol: String
    let lang: String

    @State private var report: InventoryReport?
    @State private var days: Int = 30
    @State private var loading = true
    @State private var error = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(t("What the stock is worth today, and what has moved.", lang: lang))
                .font(.system(size: 11)).foregroundColor(.secondary)

            if !error.isEmpty {
                Text(error).font(.system(size: 12)).foregroundColor(.red)
            }

            if loading && report == nil {
                Text(t("Loading…", lang: lang)).font(.system(size: 12)).foregroundColor(.secondary)
            } else if let report {
                HStack(spacing: 14) {
                    stat(t("Stock on the shelf", lang: lang), inventoryMoney(currencySymbol, report.totalValue))
                    stat(t("Came in", lang: lang), signedMoney(currencySymbol, report.inValue))
                    stat(t("Went out", lang: lang), signedMoney(currencySymbol, report.outValue))
                }

                Picker("", selection: $days) {
                    Text(t("Last 30 days", lang: lang)).tag(30)
                    Text(t("Last 90 days", lang: lang)).tag(90)
                    Text(t("Last 12 months", lang: lang)).tag(365)
                }
                .pickerStyle(.segmented)
                .onChange(of: days) { Task { await load() } }

                if !report.coversWholePeriod {
                    // The difference between "nothing moved" and "we were not
                    // watching yet" is the whole point of saying this.
                    Text(report.ledgerStartsMs > 0
                         ? "\(t("Movements are only recorded from", lang: lang)) \(dayText(report.ledgerStartsMs)). \(t("Anything before that is not missing — it was never watched.", lang: lang))"
                         : t("No movements have been recorded yet. They start the first time stock changes.", lang: lang))
                        .font(.system(size: 10)).foregroundColor(.secondary)
                }

                section(t("What it is worth, by category", lang: lang)) {
                    ForEach(report.byCategory, id: \.name) { row in
                        HStack {
                            Text(t(row.name, lang: lang)).font(.system(size: 12))
                            Spacer()
                            Text(inventoryMoney(currencySymbol, row.value))
                                .font(.system(size: 12, weight: .semibold))
                        }
                    }
                }

                section(t("What moved", lang: lang)) {
                    if report.byKind.isEmpty {
                        Text(t("Nothing moved in this period.", lang: lang))
                            .font(.system(size: 11)).foregroundColor(.secondary)
                    } else {
                        ForEach(report.byKind, id: \.kind) { row in
                            HStack {
                                Text(t(row.kind.label, lang: lang)).font(.system(size: 12))
                                Spacer()
                                Text("\(row.lines) \(t(row.lines == 1 ? "line" : "lines", lang: lang)) · \(signedMoney(currencySymbol, row.value))")
                                    .font(.system(size: 11)).foregroundColor(.secondary)
                            }
                        }
                    }
                }

                if !report.lowStock.isEmpty {
                    section(t("Running low", lang: lang)) {
                        ForEach(report.lowStock, id: \.number) { row in
                            HStack {
                                Text(row.name).font(.system(size: 12))
                                Spacer()
                                Text("\(formatQuantity(row.onHand))\(row.unit.isEmpty ? "" : " \(row.unit)") / \(formatQuantity(row.lowStockAt))")
                                    .font(.system(size: 11)).foregroundColor(.orange)
                            }
                        }
                    }
                }

                if !report.deadStock.isEmpty {
                    section(t("Money sitting still", lang: lang)) {
                        Text("\(t("Nothing has happened to these for", lang: lang)) \(report.deadStockAfterDays) \(t("days or more.", lang: lang))")
                            .font(.system(size: 10)).foregroundColor(.secondary)
                        ForEach(report.deadStock, id: \.number) { row in
                            HStack {
                                Text(row.name).font(.system(size: 12))
                                Spacer()
                                Text("\(row.idleDays) \(t("days", lang: lang)) · \(inventoryMoney(currencySymbol, row.value))")
                                    .font(.system(size: 11)).foregroundColor(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .task { await load() }
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label).font(.system(size: 9, weight: .bold)).foregroundColor(.secondary)
            Text(value).font(.system(size: 15, weight: .bold))
        }
    }

    @ViewBuilder
    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.system(size: 12, weight: .bold))
            content()
        }
        .padding(.top, 4)
    }

    private func dayText(_ ms: Double) -> String {
        let date = Date(timeIntervalSince1970: ms / 1000)
        return DateFormatter.localizedString(from: date, dateStyle: .medium, timeStyle: .none)
    }

    private func load() async {
        loading = true
        do {
            let to = Date().timeIntervalSince1970 * 1000
            report = try await firebaseManager.loadInventoryReport(
                fromMs: to - Double(days) * 86_400_000, toMs: to)
            error = ""
        } catch { self.error = error.localizedDescription }
        loading = false
    }
}
