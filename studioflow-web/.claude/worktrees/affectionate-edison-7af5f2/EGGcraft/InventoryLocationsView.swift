import SwiftUI

// The places stock lives, as a tree the workshop actually has: Safe A holds
// Drawer 3 holds Tray 1. Renaming a node here renames it on every item
// standing in it (the server owns that cascade); deleting is refused while
// anything — a child location or standing stock — still lives inside.
// Mirrors the web's LocationsPanel: same words, same guards, same calls.

struct LocationsTab: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    let lang: String
    /// The already-loaded item list — per-node standing-item counts come from
    /// here (exact path match), so the tab costs no extra reads.
    let items: [InventoryItem]
    let canEdit: Bool
    /// Renames cascade into item location strings — the list needs a reload.
    let onLocationsChanged: () -> Void

    @State private var locations: [InventoryLocation] = []
    @State private var loading = true
    @State private var notice = ""
    @State private var busy = false
    @State private var editingId = ""

    /// How many items stand at each exact path — counted client-side from the
    /// already-loaded list, so no extra reads (same idea as the web).
    private var countsByPath: [String: Int] {
        var counts: [String: Int] = [:]
        for item in items {
            let value = item.location.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !value.isEmpty else { continue }
            counts[value, default: 0] += 1
        }
        return counts
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(t("The places stock lives — a safe holds a drawer holds a tray. Renaming one renames it on every item standing there.", lang: lang))
                .font(.system(size: 11)).foregroundColor(.secondary)

            if !notice.isEmpty {
                Text(notice).font(.system(size: 12)).foregroundColor(.red)
            }

            if canEdit {
                LocationAddForm(lang: lang, locations: locations, busy: busy) { name, parentId in
                    save(name: name, parentId: parentId, locationId: "")
                }
            }

            if loading {
                Text(t("Loading…", lang: lang)).font(.system(size: 12)).foregroundColor(.secondary)
            } else if locations.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text(t("No locations yet", lang: lang)).font(.system(size: 13, weight: .bold))
                    Text(t("Items can carry any free-typed location; defining them here adds structure and safe renames.", lang: lang))
                        .font(.system(size: 11)).foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 18)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(locations) { location in
                        LocationRowView(
                            lang: lang,
                            location: location,
                            locations: locations,
                            standingCount: countsByPath[location.path] ?? 0,
                            canEdit: canEdit,
                            busy: busy,
                            editing: editingId == location.id,
                            onStartEdit: { editingId = location.id },
                            onCancelEdit: { editingId = "" },
                            onSaveEdit: { name, parentId in
                                save(name: name, parentId: parentId, locationId: location.id)
                            },
                            onDelete: { delete(location) }
                        )
                        if location.id != locations.last?.id { Divider().opacity(0.4) }
                    }
                }
            }
        }
        .task { await reload() }
    }

    private func reload() async {
        loading = true
        do {
            locations = try await firebaseManager.listInventoryLocations()
        } catch {
            let message = error.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
            notice = message.isEmpty ? t("Locations could not be loaded.", lang: lang) : t(message, lang: lang)
        }
        loading = false
    }

    /// One shape for add and rename/move — the server's readable refusals
    /// ("A sibling location already has that name." …) are the message.
    private func save(name: String, parentId: String, locationId: String) {
        run(failText: "The location could not be saved.") {
            try await firebaseManager.saveInventoryLocation(
                name: name, parentId: parentId, locationId: locationId)
            editingId = ""
        }
    }

    private func delete(_ location: InventoryLocation) {
        run(failText: "The location could not be deleted.") {
            try await firebaseManager.deleteInventoryLocation(location.id)
        }
    }

    private func run(failText: String, _ action: @escaping () async throws -> Void) {
        busy = true
        notice = ""
        Task {
            do {
                try await action()
                await reload()
                onLocationsChanged()
            } catch {
                let message = error.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
                notice = message.isEmpty ? t(failText, lang: lang) : t(message, lang: lang)
            }
            busy = false
        }
    }
}

/// The add form: a name, a parent ("Top level" or any node still shallow
/// enough to hold children), and one button. Its own struct — the real-iPhone
/// stack guard punishes forms inlined into a tab body.
private struct LocationAddForm: View {
    let lang: String
    let locations: [InventoryLocation]
    let busy: Bool
    let onAdd: (String, String) -> Void

    @State private var name = ""
    @State private var parentId = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField(t("New location", lang: lang) + " — " + t("Safe A, Drawer 3…", lang: lang), text: $name)
                .textFieldStyle(.roundedBorder)
                .font(.system(size: 12))
                .onSubmit(add)
            HStack(spacing: 8) {
                Text(t("Inside", lang: lang)).font(.system(size: 11, weight: .semibold)).foregroundColor(.secondary)
                LocationParentPicker(lang: lang, options: locations.filter { $0.depth < 4 }, selection: $parentId)
                Spacer()
                Button(t("Add location", lang: lang), action: add)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }

    private func add() {
        let cleaned = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return }
        onAdd(cleaned, parentId)
        name = ""
        parentId = ""
    }
}

/// One node of the tree, indented by depth: the name, how much stands exactly
/// there, and Rename / Move + Delete for people who may edit.
private struct LocationRowView: View {
    let lang: String
    let location: InventoryLocation
    let locations: [InventoryLocation]
    let standingCount: Int
    let canEdit: Bool
    let busy: Bool
    let editing: Bool
    let onStartEdit: () -> Void
    let onCancelEdit: () -> Void
    let onSaveEdit: (String, String) -> Void
    let onDelete: () -> Void

    var body: some View {
        Group {
            if editing {
                LocationEditForm(
                    lang: lang,
                    location: location,
                    locations: locations,
                    busy: busy,
                    onSave: onSaveEdit,
                    onCancel: onCancelEdit
                )
            } else {
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(location.name).font(.system(size: 13, weight: .semibold))
                        Text(standingCount > 0
                             ? "\(standingCount) \(t("items here", lang: lang))"
                             : t("empty", lang: lang))
                            .font(.system(size: 10.5)).foregroundColor(.secondary)
                    }
                    Spacer()
                    if canEdit {
                        Button(t("Rename / Move", lang: lang), action: onStartEdit)
                            .font(.system(size: 11, weight: .semibold))
                            .buttonStyle(.plain).foregroundColor(.blue)
                            .disabled(busy)
                        Button(t("Delete", lang: lang), action: onDelete)
                            .font(.system(size: 11, weight: .semibold))
                            .buttonStyle(.plain).foregroundColor(.red)
                            .disabled(busy)
                    }
                }
            }
        }
        .padding(.vertical, 8)
        .padding(.leading, CGFloat(location.depth - 1) * 22)
    }
}

/// The inline Rename / Move editor. Parent choices exclude the node itself
/// and everything inside it — a location cannot sit inside itself — plus
/// anything already too deep to take children.
private struct LocationEditForm: View {
    let lang: String
    let location: InventoryLocation
    let locations: [InventoryLocation]
    let busy: Bool
    let onSave: (String, String) -> Void
    let onCancel: () -> Void

    @State private var name = ""
    @State private var parentId = ""

    private var parentOptions: [InventoryLocation] {
        let subtreePrefix = location.path + " / "
        return locations.filter {
            $0.id != location.id && !$0.path.hasPrefix(subtreePrefix) && $0.depth < 4
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            TextField(t("New location", lang: lang), text: $name)
                .textFieldStyle(.roundedBorder)
                .font(.system(size: 12))
            HStack(spacing: 8) {
                Text(t("Inside", lang: lang)).font(.system(size: 11, weight: .semibold)).foregroundColor(.secondary)
                LocationParentPicker(lang: lang, options: parentOptions, selection: $parentId)
                Spacer()
                Button(t("Save", lang: lang)) {
                    let cleaned = name.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !cleaned.isEmpty else { return }
                    onSave(cleaned, parentId)
                }
                .font(.system(size: 11, weight: .semibold))
                .buttonStyle(.plain).foregroundColor(.blue)
                .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
                Button(t("Cancel", lang: lang), action: onCancel)
                    .font(.system(size: 11)).buttonStyle(.plain).foregroundColor(.secondary)
            }
        }
        .onAppear {
            name = location.name
            parentId = location.parentId
        }
    }
}

/// "Top level" or one of the given nodes, by full path — the path is the only
/// honest label once names repeat across branches.
private struct LocationParentPicker: View {
    let lang: String
    let options: [InventoryLocation]
    @Binding var selection: String

    var body: some View {
        Picker("", selection: $selection) {
            Text(t("Top level", lang: lang)).tag("")
            ForEach(options) { option in
                Text(option.path).tag(option.id)
            }
        }
        .labelsHidden()
        .pickerStyle(.menu)
        .fixedSize()
    }
}

/// A location field with the defined paths (and every location already in
/// use) one tap away — free text still works, the menu only fills the field.
struct LocationFieldWithSuggestions: View {
    @Binding var location: String
    let lang: String
    let placeholder: String
    let suggestions: [String]
    /// Optional so callers that focus the field programmatically (the detail
    /// sheet's Move action) can — .focused on the container would not reach in.
    var focus: FocusState<Bool>.Binding? = nil

    var body: some View {
        HStack(spacing: 6) {
            if let focus {
                TextField(placeholder, text: $location).focused(focus)
            } else {
                TextField(placeholder, text: $location)
            }
            if !suggestions.isEmpty {
                Menu {
                    ForEach(suggestions, id: \.self) { path in
                        Button(path) { location = path }
                    }
                } label: {
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.secondary)
                }
                .fixedSize()
            }
        }
    }
}
