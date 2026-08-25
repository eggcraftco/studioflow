import SwiftUI

// Opening stock on Mac and iPhone.
//
// The same idea as everywhere else in this feature: an import you cannot see
// before it happens is worse than typing. Nothing is written until the person
// has looked at exactly what will be created, and every row that will be
// skipped says why. The reading itself — splitting the paste, guessing the
// columns, building the rows — happens on the server, so a list reads the same
// here as it does on the web.

struct OpeningStockSheet: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @Environment(\.dismiss) private var dismiss
    let currencySymbol: String
    let lang: String
    let onImported: (Int) -> Void

    @State private var raw = ""
    @State private var hasHeader = true
    @State private var mapping: [String] = []
    @State private var defaultType: InventoryTrackingType = .quantity
    @State private var typeOverrides: [Int: InventoryTrackingType] = [:]
    @State private var openingDate = ISO8601DateFormatter.openingDay.string(from: Date())
    @State private var read = OpeningStockRead()
    @State private var reading = false
    @State private var saving = false
    @State private var error = ""
    @State private var readToken = 0

    private var willImport: [OpeningStockRow] { Array(read.items.prefix(read.maxRows)) }
    private var overflow: Int { max(0, read.items.count - read.maxRows) }
    private var totalValue: Double { willImport.reduce(0) { $0 + $1.lineValue } }
    private var hasNameColumn: Bool { read.mapping.contains("name") }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(t("Paste straight from a spreadsheet, or choose a CSV file. Nothing is created until you have seen the preview below.", lang: lang))
                        .font(.system(size: 11)).foregroundColor(.secondary)
                    TextEditor(text: $raw)
                        .font(.system(size: 12, design: .monospaced))
                        .frame(minHeight: 110)
                    if reading {
                        Text(t("Reading your list…", lang: lang)).font(.system(size: 11)).foregroundColor(.secondary)
                    }
                    if !read.grid.isEmpty {
                        Toggle(t("The first row is a header, not an item.", lang: lang), isOn: $hasHeader)
                            .font(.system(size: 12))
                    }
                } header: {
                    Text(t("Your list", lang: lang))
                }

                if !read.grid.isEmpty {
                    Section(t("Which column is what", lang: lang)) {
                        ForEach(Array((read.grid.first ?? []).enumerated()), id: \.offset) { index, _ in
                            Picker(columnTitle(index), selection: columnBinding(index)) {
                                Text(t("Ignore this column", lang: lang)).tag("")
                                ForEach(openingStockFields, id: \.key) { field in
                                    Text(t(field.label, lang: lang)).tag(field.key)
                                }
                            }
                            .font(.system(size: 12))
                        }
                        if !hasNameColumn {
                            Text(t("Point one column at Name — an item without a name cannot exist.", lang: lang))
                                .font(.system(size: 11)).foregroundColor(.red)
                        }
                    }
                }

                if hasNameColumn {
                    Section(t("How to treat these", lang: lang)) {
                        Picker(t("Rows without a type column are", lang: lang), selection: $defaultType) {
                            Text(t("Quantity Items", lang: lang)).tag(InventoryTrackingType.quantity)
                            Text(t("Unique Items", lang: lang)).tag(InventoryTrackingType.unique)
                        }
                        TextField(t("Opening date", lang: lang), text: $openingDate)
                        Text(t("The opening date is when this stock is counted as being on the shelf. A row that carries its own purchase date keeps it.", lang: lang))
                            .font(.system(size: 11)).foregroundColor(.secondary)
                    }

                    Section {
                        if willImport.isEmpty {
                            Text(t("Nothing here can be imported yet.", lang: lang))
                                .font(.system(size: 12)).foregroundColor(.secondary)
                        } else {
                            ForEach(willImport.prefix(50)) { row in
                                HStack(alignment: .top, spacing: 10) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(row.name).font(.system(size: 13, weight: .semibold))
                                        Text([t(row.category, lang: lang),
                                              row.trackingType == .quantity
                                                ? "\(formatQuantity(row.onHand))\(row.unit.isEmpty ? "" : " \(row.unit)")"
                                                : "",
                                              row.location]
                                            .filter { !$0.isEmpty }.joined(separator: " · "))
                                            .font(.system(size: 10)).foregroundColor(.secondary)
                                    }
                                    Spacer()
                                    Text(inventoryMoney(currencySymbol, row.lineValue))
                                        .font(.system(size: 12, weight: .semibold))
                                    // Tapping the type corrects one row: a real list is
                                    // mixed, and the default cannot be right for all of it.
                                    Button {
                                        typeOverrides[row.rowIndex] =
                                            row.trackingType == .unique ? .quantity : .unique
                                    } label: {
                                        Text(t(row.trackingType.label, lang: lang))
                                            .font(.system(size: 10, weight: .bold))
                                            .padding(.horizontal, 7).padding(.vertical, 2)
                                            .background(Capsule().stroke(Color.blue.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [3])))
                                            .foregroundColor(.blue)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            if willImport.count > 50 {
                                Text("\(t("Showing the first 50 of", lang: lang)) \(willImport.count).")
                                    .font(.system(size: 11)).foregroundColor(.secondary)
                            }
                        }
                    } header: {
                        HStack {
                            Text(t("What will be created", lang: lang))
                            Spacer()
                            Text("\(willImport.count) \(t("items", lang: lang))"
                                 + (totalValue > 0 ? " · \(inventoryMoney(currencySymbol, totalValue))" : ""))
                                .font(.system(size: 10)).foregroundColor(.secondary)
                        }
                    }

                    if !read.skipped.isEmpty {
                        Section("\(read.skipped.count) \(t("rows will be skipped", lang: lang))") {
                            ForEach(read.skipped.prefix(8)) { row in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(row.name.isEmpty ? t("(no name)", lang: lang) : row.name)
                                        .font(.system(size: 12, weight: .semibold))
                                    Text(t(row.message, lang: lang))
                                        .font(.system(size: 10)).foregroundColor(.secondary)
                                }
                            }
                            if read.skipped.count > 8 {
                                Text("\(t("and", lang: lang)) \(read.skipped.count - 8) \(t("more", lang: lang)).")
                                    .font(.system(size: 11)).foregroundColor(.secondary)
                            }
                        }
                    }

                    if overflow > 0 {
                        Text("\(t("One import carries at most 500 items.", lang: lang)) \(overflow) \(t("rows past that will be left out — import them as a second batch.", lang: lang))")
                            .font(.system(size: 11)).foregroundColor(.red)
                    }
                }

                if !error.isEmpty {
                    Text(error).font(.system(size: 12)).foregroundColor(.red)
                }

                Section {
                    Text(t("Everything arrives as available stock, valued at what you paid.", lang: lang))
                        .font(.system(size: 11)).foregroundColor(.secondary)
                }
            }
            .navigationTitle(t("Import opening stock", lang: lang))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(t("Cancel", lang: lang)) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving
                           ? t("Importing…", lang: lang)
                           : "\(t("Import", lang: lang)) \(willImport.count) \(t("items", lang: lang))") {
                        performImport()
                    }
                    .disabled(saving || willImport.isEmpty)
                }
            }
            // A paste is one deliberate act and a remap is another, so the read
            // is debounced rather than fired on every keystroke.
            .onChange(of: raw) { scheduleRead() }
            .onChange(of: hasHeader) { scheduleRead() }
            .onChange(of: defaultType) { scheduleRead() }
            .onChange(of: typeOverrides) { scheduleRead() }
            .onChange(of: mapping) { scheduleRead() }
        }
    }

    private func columnTitle(_ index: Int) -> String {
        if hasHeader, index < read.headers.count, !read.headers[index].isEmpty {
            return read.headers[index]
        }
        return "\(t("Column", lang: lang)) \(index + 1)"
    }

    private func columnBinding(_ index: Int) -> Binding<String> {
        Binding(
            get: { index < read.mapping.count ? read.mapping[index] : "" },
            set: { newValue in
                var next = read.mapping
                while next.count <= index { next.append("") }
                // One field, one column: taking it from another leaves that one unmapped.
                if !newValue.isEmpty {
                    for position in next.indices where next[position] == newValue && position != index {
                        next[position] = ""
                    }
                }
                next[index] = newValue
                mapping = next
            }
        )
    }

    private func scheduleRead() {
        readToken += 1
        let token = readToken
        let text = raw
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            read = OpeningStockRead()
            return
        }
        reading = true
        Task {
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard token == readToken else { return }
            do {
                let result = try await firebaseManager.readOpeningStock(
                    text: text, hasHeader: hasHeader, mapping: mapping,
                    defaultType: defaultType, typeOverrides: typeOverrides)
                guard token == readToken else { return }
                read = result
                error = ""
            } catch {
                guard token == readToken else { return }
                self.error = error.localizedDescription
            }
            if token == readToken { reading = false }
        }
    }

    private func performImport() {
        saving = true
        error = ""
        Task {
            do {
                let count = try await firebaseManager.importOpeningStock(
                    items: willImport.map(\.payload), openingDate: openingDate)
                onImported(count)
                dismiss()
            } catch {
                self.error = error.localizedDescription
                saving = false
            }
        }
    }
}

extension ISO8601DateFormatter {
    /// Just the day: the opening date is a date, not a moment.
    static let openingDay: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        return formatter
    }()
}
