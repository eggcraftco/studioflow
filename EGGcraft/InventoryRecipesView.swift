import SwiftUI

// A recipe is a job's parts list, written once: "1 buckle + 20cm leather +
// 2 screws". The order card applies it in one act — the server reserves every
// line in one transaction, all or nothing. This tab only writes the lists.
// Mirrors the web's RecipesPanel: same words, same guards, same calls.

struct RecipesTab: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    let lang: String
    /// The already-loaded item list — line summaries and the part picker join
    /// against it, so the tab costs no extra item reads.
    let items: [InventoryItem]
    let canEdit: Bool

    @State private var recipes: [InventoryRecipe] = []
    @State private var loading = true
    @State private var notice = ""
    @State private var busy = false
    @State private var showNew = false
    @State private var editing: InventoryRecipe?

    private var itemById: [String: InventoryItem] {
        Dictionary(items.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 10) {
                Text(t("A job's parts list, written once. Applying it to an order reserves every line in one act — all or nothing.", lang: lang))
                    .font(.system(size: 11)).foregroundColor(.secondary)
                Spacer()
                if canEdit {
                    Button("+ " + t("New recipe", lang: lang)) { showNew = true }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                        .disabled(busy)
                }
            }

            if !notice.isEmpty {
                Text(notice).font(.system(size: 12)).foregroundColor(.red)
            }

            if loading {
                Text(t("Loading…", lang: lang)).font(.system(size: 12)).foregroundColor(.secondary)
            } else if recipes.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text(t("No recipes yet", lang: lang)).font(.system(size: 13, weight: .bold))
                    Text(t("Write the parts a repeated job takes, and the order card reserves them in one click.", lang: lang))
                        .font(.system(size: 11)).foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 18)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(recipes) { recipe in
                        RecipeRowView(
                            lang: lang,
                            recipe: recipe,
                            summary: summary(recipe),
                            canEdit: canEdit,
                            busy: busy,
                            onEdit: { editing = recipe },
                            onDelete: { delete(recipe) }
                        )
                        if recipe.id != recipes.last?.id { Divider().opacity(0.4) }
                    }
                }
            }
        }
        .task { await reload() }
        .sheet(isPresented: $showNew) {
            RecipeFormSheet(lang: lang, items: items, recipe: nil) {
                Task { await reload() }
            }
            .environmentObject(firebaseManager)
        }
        .sheet(item: $editing) { recipe in
            RecipeFormSheet(lang: lang, items: items, recipe: recipe) {
                Task { await reload() }
            }
            .environmentObject(firebaseManager)
        }
    }

    /// "2 pcs × Deri kayış 18mm · 1 × Omega…" — quantity (with the live item's
    /// unit) times the live item's name, so a renamed part reads right and a
    /// deleted one confesses instead of vanishing.
    private func lineLabel(_ line: InventoryRecipeLine) -> String {
        let item = itemById[line.itemId]
        var amount = formatQuantity(line.quantity)
        if let item, item.trackingType == .quantity, !item.unit.isEmpty {
            amount += " \(item.unit)"
        }
        return amount + " × " + (item?.name ?? t("(missing item)", lang: lang))
    }

    private func summary(_ recipe: InventoryRecipe) -> String {
        var text = recipe.lines.map(lineLabel).joined(separator: " · ")
        if !recipe.notes.isEmpty { text += " — " + recipe.notes }
        return text
    }

    private func reload() async {
        loading = true
        do {
            recipes = try await firebaseManager.listInventoryRecipes()
        } catch {
            let message = error.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
            notice = message.isEmpty ? t("Recipes could not be loaded.", lang: lang) : t(message, lang: lang)
        }
        loading = false
    }

    private func delete(_ recipe: InventoryRecipe) {
        busy = true
        notice = ""
        Task {
            do {
                try await firebaseManager.deleteInventoryRecipe(recipe.id)
                await reload()
            } catch {
                let message = error.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
                notice = message.isEmpty ? t("The recipe could not be deleted.", lang: lang) : t(message, lang: lang)
            }
            busy = false
        }
    }
}

/// One recipe of the list: the name, the joined line summary, and Edit /
/// Delete for people who may write. Its own struct — the real-iPhone stack
/// guard punishes rows inlined into a tab body.
private struct RecipeRowView: View {
    let lang: String
    let recipe: InventoryRecipe
    let summary: String
    let canEdit: Bool
    let busy: Bool
    let onEdit: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text(recipe.name).font(.system(size: 13, weight: .semibold))
                Text(summary).font(.system(size: 10.5)).foregroundColor(.secondary)
            }
            Spacer()
            if canEdit {
                Button(t("Edit", lang: lang), action: onEdit)
                    .font(.system(size: 11, weight: .semibold))
                    .buttonStyle(.plain).foregroundColor(.blue)
                    .disabled(busy)
                Button(t("Delete", lang: lang), action: onDelete)
                    .font(.system(size: 11, weight: .semibold))
                    .buttonStyle(.plain).foregroundColor(.red)
                    .disabled(busy)
            }
        }
        .padding(.vertical, 8)
    }
}

/// One editable row of the form's draft. Identity is its own UUID, not the
/// item id — two rows may point at the same part while a person is choosing.
private struct RecipeDraftLine: Identifiable {
    let id = UUID()
    var itemId = ""
    var quantity = "1"
}

/// The write side of one recipe: a name, notes, and dynamic part lines. The
/// server owns the real guards (≤30 lines, quantities above zero); this form
/// only refuses the obviously empty.
struct RecipeFormSheet: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @Environment(\.dismiss) private var dismiss
    let lang: String
    let items: [InventoryItem]
    /// nil writes a fresh recipe; otherwise this one is rewritten in place.
    var recipe: InventoryRecipe? = nil
    let onSaved: () -> Void

    @State private var name = ""
    @State private var notes = ""
    @State private var lines: [RecipeDraftLine] = [RecipeDraftLine()]
    @State private var busy = false
    @State private var error = ""

    /// Only what a recipe can honestly promise: business stock still in play.
    /// Same filter as the web's componentChoices.
    private var componentChoices: [InventoryItem] {
        items.filter { item in
            item.ownership != .customer
                && ![.sold, .used, .archived, .removed].contains(item.status)
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextField(t("Name", lang: lang) + " — " + t("Strap job, full service…", lang: lang), text: $name)
                        .font(.system(size: 13))
                    TextField(t("Notes", lang: lang), text: $notes)
                        .font(.system(size: 13))
                }

                Section(t("Parts", lang: lang)) {
                    ForEach($lines) { $line in
                        RecipeLineRow(
                            lang: lang,
                            allItems: items,
                            choices: componentChoices,
                            itemId: $line.itemId,
                            quantity: $line.quantity,
                            removable: lines.count > 1,
                            onRemove: { lines.removeAll { $0.id == line.id } }
                        )
                    }
                    Button("+ " + t("Add line", lang: lang)) { lines.append(RecipeDraftLine()) }
                        .font(.system(size: 12, weight: .semibold))
                        .buttonStyle(.plain).foregroundColor(.blue)
                }

                if !error.isEmpty {
                    Text(error).font(.system(size: 12)).foregroundColor(.red)
                }
            }
            .navigationTitle(t(recipe == nil ? "New recipe" : "Edit recipe", lang: lang))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(t("Cancel", lang: lang)) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(t(busy ? "Saving…" : "Save recipe", lang: lang), action: save)
                        .disabled(busy)
                }
            }
            .onAppear(perform: seed)
        }
    }

    private func seed() {
        guard let recipe else { return }
        name = recipe.name
        notes = recipe.notes
        lines = recipe.lines.isEmpty
            ? [RecipeDraftLine()]
            : recipe.lines.map { RecipeDraftLine(itemId: $0.itemId, quantity: formatQuantity($0.quantity)) }
    }

    private func save() {
        let cleanedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleaned: [InventoryRecipeLine] = lines.compactMap { line in
            let quantity = Double(line.quantity.replacingOccurrences(of: ",", with: ".")) ?? 0
            guard !line.itemId.isEmpty, quantity > 0 else { return nil }
            return InventoryRecipeLine(itemId: line.itemId, quantity: quantity)
        }
        guard !cleanedName.isEmpty, !cleaned.isEmpty else {
            error = t("A recipe needs a name and at least one line.", lang: lang)
            return
        }
        busy = true
        error = ""
        Task {
            do {
                try await firebaseManager.saveInventoryRecipe(
                    name: cleanedName,
                    notes: notes.trimmingCharacters(in: .whitespacesAndNewlines),
                    lines: cleaned,
                    recipeId: recipe?.id ?? "")
                onSaved()
                dismiss()
            } catch {
                let message = error.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
                self.error = message.isEmpty ? t("The recipe could not be saved.", lang: lang) : t(message, lang: lang)
                busy = false
            }
        }
    }
}

/// One part line: an item picker over what can honestly be promised, and a
/// quantity. A line pointing at stock that has since sold or vanished keeps
/// its selection visible — honest, and saving it back is the server's call.
private struct RecipeLineRow: View {
    let lang: String
    let allItems: [InventoryItem]
    let choices: [InventoryItem]
    @Binding var itemId: String
    @Binding var quantity: String
    let removable: Bool
    let onRemove: () -> Void

    /// The offered stock, plus the current selection when it has dropped out
    /// of play — a Picker with a tagless selection would silently blank it.
    private var options: [InventoryItem] {
        if itemId.isEmpty || choices.contains(where: { $0.id == itemId }) { return choices }
        if let current = allItems.first(where: { $0.id == itemId }) { return choices + [current] }
        return choices
    }

    var body: some View {
        HStack(spacing: 8) {
            Picker("", selection: $itemId) {
                Text(t("Choose an item…", lang: lang)).tag("")
                ForEach(options) { item in
                    Text(item.name + (item.number.isEmpty ? "" : " (\(item.number))")).tag(item.id)
                }
                // The item is gone entirely — name the hole rather than let
                // the Picker point at nothing.
                if !itemId.isEmpty && !options.contains(where: { $0.id == itemId }) {
                    Text(t("(missing item)", lang: lang)).tag(itemId)
                }
            }
            .labelsHidden()
            .pickerStyle(.menu)
            Spacer(minLength: 4)
            TextField("0", text: $quantity)
                .frame(width: 64).multilineTextAlignment(.trailing)
                .font(.system(size: 12))
            if removable {
                Button(t("Remove", lang: lang), action: onRemove)
                    .font(.system(size: 11)).buttonStyle(.plain).foregroundColor(.red)
            }
        }
    }
}
