import SwiftUI

/// Inventory → Categories.
///
/// Categories used to be ten fixed words, which suits a watchmaker and nobody
/// else. This is where a workshop names what it actually keeps. Two rules shape
/// the screen, and they are the server's rules too (functions/inventory.js):
///
///   * one central name — renaming here renames it everywhere, because the
///     server carries the new title to the items that used the old one;
///   * nothing is orphaned — a category holding items is never simply removed,
///     so Remove asks where those items should go instead.
struct InventoryCategoriesTab: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    let lang: String
    let canEdit: Bool
    let onChanged: () -> Void

    @State private var rows: [InventoryCategory] = []
    @State private var defaultCategory = ""
    @State private var orphans: [(title: String, count: Int)] = []
    @State private var loading = true
    @State private var busy = false
    @State private var notice = ""
    @State private var dirty = false
    @State private var removing: InventoryCategory?
    @State private var merging: InventoryCategory?

    private let iconChoices = ["⌚", "◎", "⚙", "⚒", "⚗", "➰", "▧", "✄", "◇", "⬢",
                               "◈", "✦", "❖", "⬡", "◐", "▤", "▦", "✧", "⌘", "▪"]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            if !notice.isEmpty {
                Text(notice).font(.footnote).foregroundStyle(.orange)
            }
            if !orphans.isEmpty {
                orphanNotice
            }
            if loading {
                ProgressView().frame(maxWidth: .infinity, alignment: .center).padding(.top, 24)
            } else {
                categoryList
                Text(footerText).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 4)
        .task { await load() }
        .sheet(item: $removing) { category in
            RemoveCategorySheet(
                category: category,
                others: rows.filter { $0.id != category.id && !$0.archived },
                lang: lang,
                busy: busy
            ) { disposition, moveToId in
                Task { await remove(category, disposition: disposition, moveToId: moveToId) }
            }
        }
        .sheet(item: $merging) { category in
            MergeCategorySheet(
                category: category,
                others: rows.filter { $0.id != category.id },
                lang: lang,
                busy: busy
            ) { intoId in
                Task { await merge(category, into: intoId) }
            }
        }
    }

    private var categoryList: some View {
        // The move handler is spelled out rather than a ternary against nil:
        // the optional-closure inference there is what the type-checker choked
        // on, and drag-to-reorder is a no-op for a read-only member anyway.
        let onMoveRows: ((IndexSet, Int) -> Void)? = canEdit ? { source, destination in
            moveRows(from: source, to: destination)
        } : nil
        return List {
            ForEach(Array(rows.enumerated()), id: \.element.id) { pair in
                categoryRow(index: pair.offset, row: pair.element)
            }
            .onMove(perform: onMoveRows)
        }
    }

    /// Built as plain string concatenation: one long interpolation here used to
    /// push the whole body past what the type-checker will attempt.
    private var footerText: String {
        let visible = rows.filter { !$0.archived }.count
        var filed = 0
        for row in rows { filed += row.itemCount }
        return "\(visible) " + t("visible", lang: lang) + " · \(filed) " + t("items filed", lang: lang)
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 3) {
                Text(t("Categories", lang: lang)).font(.title3.bold())
                Text(t("Name these the way your workshop talks. Renaming one here renames it on every item, filter and report.", lang: lang))
                    .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            if canEdit {
                HStack(spacing: 8) {
                    Button { addRow() } label: { Label(t("Add", lang: lang), systemImage: "plus") }
                        .disabled(busy || rows.count >= 40)
                    Button { Task { await save() } } label: {
                        Text(busy ? t("Saving…", lang: lang) : t("Save changes", lang: lang))
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(busy || !dirty)
                }
            }
        }
    }

    private var orphanNotice: some View {
        Text("\(t("Not on this list:", lang: lang)) " +
             orphans.map { "\($0.title) (\($0.count))" }.joined(separator: ", ") + ". " +
             t("Add the name back, or open the category filter to move those items.", lang: lang))
            .font(.caption)
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
    }

    @ViewBuilder
    private func categoryRow(index: Int, row: InventoryCategory) -> some View {
        HStack(spacing: 10) {
            Picker("", selection: iconBinding(index)) {
                ForEach(iconChoices, id: \.self) { Text($0).tag($0) }
            }
            .labelsHidden()
            .frame(width: 74)
            .disabled(!canEdit)

            TextField(t("Category name", lang: lang), text: titleBinding(index))
                .textFieldStyle(.roundedBorder)
                .disabled(!canEdit)

            Text("\(row.itemCount)")
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
                .frame(width: 34, alignment: .trailing)

            Toggle(isOn: defaultBinding(index)) { Text(t("Default", lang: lang)).font(.caption2) }
                .toggleStyle(.button)
                .disabled(!canEdit || row.title.isEmpty)

            Toggle(isOn: visibleBinding(index)) { Text(t("Visible", lang: lang)).font(.caption2) }
                .toggleStyle(.button)
                .disabled(!canEdit)

            if canEdit {
                Button(t("Merge", lang: lang)) { merging = row }
                    .buttonStyle(.bordered)
                    .disabled(busy || rows.count < 2)
                Button(t("Remove", lang: lang)) { requestRemove(row) }
                    .buttonStyle(.bordered)
                    .tint(.red)
                    .disabled(busy)
            }
        }
        .opacity(row.archived ? 0.55 : 1)
    }

    /// An empty category needs no ceremony; a full one has to say where its
    /// items go, which is what the sheet asks.
    private func requestRemove(_ row: InventoryCategory) {
        if row.itemCount == 0 {
            Task { await remove(row, disposition: "other", moveToId: "") }
        } else {
            removing = row
        }
    }

    private func iconBinding(_ index: Int) -> Binding<String> {
        Binding(
            get: {
                guard rows.indices.contains(index) else { return iconChoices[0] }
                let icon = rows[index].icon
                return iconChoices.contains(icon) ? icon : iconChoices[0]
            },
            set: { value in
                guard rows.indices.contains(index) else { return }
                rows[index].icon = value
                dirty = true
            }
        )
    }

    private func titleBinding(_ index: Int) -> Binding<String> {
        Binding(
            get: { rows.indices.contains(index) ? rows[index].title : "" },
            set: { value in
                guard rows.indices.contains(index) else { return }
                rows[index].title = value
                dirty = true
            }
        )
    }

    private func defaultBinding(_ index: Int) -> Binding<Bool> {
        Binding(
            get: {
                guard rows.indices.contains(index) else { return false }
                let title = rows[index].title
                return !title.isEmpty && defaultCategory == title
            },
            set: { isOn in
                guard isOn, rows.indices.contains(index) else { return }
                defaultCategory = rows[index].title
                dirty = true
            }
        )
    }

    private func visibleBinding(_ index: Int) -> Binding<Bool> {
        Binding(
            get: { rows.indices.contains(index) ? !rows[index].archived : true },
            set: { isOn in
                guard rows.indices.contains(index) else { return }
                rows[index].archived = !isOn
                dirty = true
            }
        )
    }

    private func moveRows(from source: IndexSet, to destination: Int) {
        rows.move(fromOffsets: source, toOffset: destination)
        dirty = true
    }

    private func addRow() {
        guard rows.count < 40 else { return }
        rows.append(InventoryCategory([
            "id": "category_\(Int(Date().timeIntervalSince1970 * 1000))",
            "title": t("New category", lang: lang),
            "icon": "◇"
        ]) ?? rows[0])
        dirty = true
    }

    private func load() async {
        loading = true
        do {
            let result = try await firebaseManager.loadInventoryCategories()
            rows = result.categories
            defaultCategory = result.defaultCategory
            orphans = result.orphans
            dirty = false
            notice = ""
        } catch {
            notice = error.localizedDescription
        }
        loading = false
    }

    private func save() async {
        let cleaned = rows
            .map { row -> InventoryCategory in
                var copy = row
                copy.title = row.title.trimmingCharacters(in: .whitespacesAndNewlines)
                return copy
            }
            .filter { !$0.title.isEmpty }
        guard !cleaned.isEmpty else {
            notice = t("Inventory needs at least one category.", lang: lang)
            return
        }
        busy = true
        do {
            _ = try await firebaseManager.saveInventoryCategories(cleaned, defaultCategory: defaultCategory)
            await load()
            onChanged()
        } catch {
            notice = error.localizedDescription
        }
        busy = false
    }

    private func remove(_ category: InventoryCategory, disposition: String, moveToId: String) async {
        busy = true
        do {
            _ = try await firebaseManager.deleteInventoryCategory(category.id, disposition: disposition, moveToId: moveToId)
            removing = nil
            await load()
            onChanged()
        } catch {
            notice = error.localizedDescription
        }
        busy = false
    }

    private func merge(_ category: InventoryCategory, into intoId: String) async {
        busy = true
        do {
            _ = try await firebaseManager.mergeInventoryCategories(from: category.id, into: intoId)
            merging = nil
            await load()
            onChanged()
        } catch {
            notice = error.localizedDescription
        }
        busy = false
    }
}

/// The question the Blocked-lane dialog asks of production, asked here of
/// stock: where do these items go? Nothing is deleted either way.
private struct RemoveCategorySheet: View {
    @Environment(\.dismiss) private var dismiss
    let category: InventoryCategory
    let others: [InventoryCategory]
    let lang: String
    let busy: Bool
    let onConfirm: (String, String) -> Void

    @State private var disposition = "move"
    @State private var moveToId = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("\(t("Remove", lang: lang)) “\(category.title)”").font(.title3.bold())
            Text("\(category.itemCount) \(t("items are filed here.", lang: lang)) \(t("Choose where they should go — nothing is deleted.", lang: lang))")
                .font(.footnote).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)

            Picker("", selection: $disposition) {
                if !others.isEmpty { Text(t("Move the items to", lang: lang)).tag("move") }
                Text(t("Hide the category and leave the items where they are", lang: lang)).tag("archive")
                Text(t("Move the items to Other", lang: lang)).tag("other")
            }
            .pickerStyle(.inline)
            .labelsHidden()

            if disposition == "move", !others.isEmpty {
                Picker(t("Move the items to", lang: lang), selection: $moveToId) {
                    ForEach(others) { Text("\($0.icon) \($0.title)").tag($0.id) }
                }
            }

            HStack {
                Spacer()
                Button(t("Cancel", lang: lang)) { dismiss() }
                Button(busy ? t("Working…", lang: lang) : t("Confirm", lang: lang)) {
                    onConfirm(disposition, moveToId)
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
                .disabled(busy || (disposition == "move" && moveToId.isEmpty))
            }
        }
        .padding(20)
        .frame(minWidth: 380)
        .onAppear {
            moveToId = others.first?.id ?? ""
            if others.isEmpty { disposition = "other" }
        }
    }
}

private struct MergeCategorySheet: View {
    @Environment(\.dismiss) private var dismiss
    let category: InventoryCategory
    let others: [InventoryCategory]
    let lang: String
    let busy: Bool
    let onConfirm: (String) -> Void

    @State private var intoId = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("\(t("Merge", lang: lang)) “\(category.title)”").font(.title3.bold())
            Text(t("Its items move across and the category disappears. Bracelets into Straps, say.", lang: lang))
                .font(.footnote).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            Picker(t("Merge into", lang: lang), selection: $intoId) {
                ForEach(others) { Text("\($0.icon) \($0.title)").tag($0.id) }
            }
            HStack {
                Spacer()
                Button(t("Cancel", lang: lang)) { dismiss() }
                Button(busy ? t("Working…", lang: lang) : t("Merge", lang: lang)) {
                    onConfirm(intoId)
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
                .disabled(busy || intoId.isEmpty)
            }
        }
        .padding(20)
        .frame(minWidth: 360)
        .onAppear { intoId = others.first?.id ?? "" }
    }
}
