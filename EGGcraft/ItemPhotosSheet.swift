import SwiftUI
import PhotosUI

// Photos of one inventory item, on Mac and iPhone.
//
// Same contract as the web: the item stores storage paths, this sheet resolves
// them to URLs only to draw, uploads land in storage before the document is
// saved, and removal updates the document before deleting the file — in both
// orders a failure leaves an orphaned file, never a listed path pointing at
// nothing.

struct ItemPhotosSheet: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @Environment(\.dismiss) private var dismiss
    let item: InventoryItem
    let lang: String
    let canEdit: Bool
    let onChanged: () -> Void

    @State private var paths: [String]
    @State private var urls: [String: URL] = [:]
    @State private var viewing: String?
    @State private var pickerItem: PhotosPickerItem?
    @State private var busy = false
    @State private var error = ""

    init(item: InventoryItem, lang: String, canEdit: Bool, onChanged: @escaping () -> Void) {
        self.item = item
        self.lang = lang
        self.canEdit = canEdit
        self.onChanged = onChanged
        _paths = State(initialValue: item.photos)
    }

    var body: some View {
        NavigationStack {
            Group {
                if let viewing, let url = urls[viewing] {
                    VStack(spacing: 12) {
                        AsyncImage(url: url) { image in
                            image.resizable().scaledToFit()
                        } placeholder: { ProgressView() }
                        .frame(maxHeight: 420)
                        HStack {
                            Button(t("Back to all photos", lang: lang)) { self.viewing = nil }
                                .buttonStyle(.bordered)
                            if canEdit {
                                Button(t("Remove this photo", lang: lang), role: .destructive) {
                                    Task { await remove(viewing) }
                                }
                                .buttonStyle(.bordered)
                                .disabled(busy)
                            }
                        }
                    }
                    .padding()
                } else {
                    List {
                        if paths.isEmpty {
                            Text(t("No photos yet. For a unique piece, the photos are half the identity.", lang: lang))
                                .font(.system(size: 12)).foregroundColor(.secondary)
                        } else {
                            // Four across, matching the web and the repair card.
                            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                                ForEach(paths, id: \.self) { path in
                                    Button { viewing = path } label: {
                                        ZStack {
                                            RoundedRectangle(cornerRadius: 10).fill(Color.gray.opacity(0.12))
                                            if let url = urls[path] {
                                                AsyncImage(url: url) { image in
                                                    image.resizable().scaledToFill()
                                                } placeholder: { ProgressView() }
                                            }
                                        }
                                        .frame(height: 76)
                                        .clipShape(RoundedRectangle(cornerRadius: 10))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }

                        if canEdit {
                            PhotosPicker(selection: $pickerItem, matching: .images) {
                                Text(busy ? t("Uploading…", lang: lang) : t("Add photos", lang: lang))
                            }
                            .disabled(busy || paths.count >= 12)
                        }

                        if !error.isEmpty {
                            Text(error).font(.system(size: 12)).foregroundColor(.red)
                        }
                    }
                }
            }
            .navigationTitle(item.name)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(t("Close", lang: lang)) { dismiss() }
                }
            }
            .task { await resolveURLs() }
            .onChange(of: pickerItem) {
                guard let pickerItem else { return }
                Task { await upload(pickerItem) }
            }
        }
    }

    private func resolveURLs() async {
        for path in paths where urls[path] == nil {
            if let url = try? await firebaseManager.inventoryPhotoURL(path) {
                urls[path] = url
            }
        }
    }

    private func upload(_ selected: PhotosPickerItem) async {
        busy = true
        error = ""
        defer { busy = false; pickerItem = nil }
        do {
            guard let data = try await selected.loadTransferable(type: Data.self) else { return }
            let path = try await firebaseManager.uploadInventoryPhoto(
                itemId: item.id, data: data, fileName: "photo.jpg")
            let next = paths + [path]
            try await firebaseManager.saveInventoryPhotos(item: item, photos: next)
            paths = next
            await resolveURLs()
            onChanged()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func remove(_ path: String) async {
        busy = true
        error = ""
        defer { busy = false }
        do {
            let next = paths.filter { $0 != path }
            // The document first: an orphaned file is harmless, a listed path
            // with no file behind it is a broken screen.
            try await firebaseManager.saveInventoryPhotos(item: item, photos: next)
            paths = next
            viewing = nil
            onChanged()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
