import SwiftUI
import PhotosUI
import ImageIO

// Photos of one inventory item, on Mac and iPhone.
//
// Same contract as the web: the item stores storage paths, this sheet resolves
// them to URLs only to draw, uploads land in storage before the document is
// saved, and removal updates the document before deleting the file — in both
// orders a failure leaves an orphaned file, never a listed path pointing at
// nothing.

/// One item, twelve photos — the same ceiling the web and the server keep.
let inventoryPhotoLimit = 12

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
                            .disabled(busy || paths.count >= inventoryPhotoLimit)
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

// MARK: Photos picked before the item exists
//
// Storage paths are keyed by the item id, which a new item does not have yet.
// So the Add form holds the bytes here and sends them up the moment the save
// hands an id back — instead of making people save, find the row and come back
// through the photo button.

struct StagedInventoryPhoto: Identifiable {
    let id = UUID()
    let data: Data
    let fileName: String
    /// A downscaled copy for the grid. Twelve full-resolution decodes held in
    /// view state is a real memory bill on a phone; the thumbnail is not.
    let preview: PlatformImage?
}

/// A thumbnail bounded by pixels rather than by whatever the camera produced.
func stagedInventoryPhotoPreview(_ data: Data) -> PlatformImage? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
    let options: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: 320
    ]
    guard let thumb = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
        return nil
    }
    #if os(macOS)
    return NSImage(cgImage: thumb, size: NSSize(width: thumb.width, height: thumb.height))
    #else
    return UIImage(cgImage: thumb)
    #endif
}

/// The Photos row of the item form. Owns the picking, not the uploading — the
/// form uploads once it has an item id to file them under.
struct InventoryPhotoStagingSection: View {
    @Binding var staged: [StagedInventoryPhoto]
    let lang: String
    /// Photos the item already carries, when this is an edit. They count
    /// against the ceiling just as the staged ones do.
    let alreadyOnItem: Int
    let isEdit: Bool
    let busy: Bool

    @State private var picking: [PhotosPickerItem] = []
    @State private var loading = false

    private var room: Int { max(0, inventoryPhotoLimit - alreadyOnItem - staged.count) }

    var body: some View {
        Section {
            // The picking watcher rides on this row, not on the Section and not
            // on the picker: the picker disappears the moment the twelfth photo
            // lands, and a load still in flight must not go with it.
            Text(isEdit
                 ? t("New photos are added when you save.", lang: lang)
                 : t("Pick photos now — they upload as soon as the item is created.", lang: lang))
                .font(.system(size: 11)).foregroundColor(.secondary)
                .onChange(of: picking) {
                    let chosen = picking
                    guard !chosen.isEmpty else { return }
                    Task { await stage(chosen) }
                }

            if !staged.isEmpty {
                // Four across, matching the photo manager and the web.
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                    ForEach(staged) { photo in
                        StagedInventoryPhotoThumb(photo: photo, lang: lang) {
                            staged.removeAll { $0.id == photo.id }
                        }
                    }
                }
            }

            if room > 0 {
                PhotosPicker(selection: $picking, maxSelectionCount: room, matching: .images) {
                    Text(loading ? t("Loading…", lang: lang) : t("Add photos", lang: lang))
                }
                .disabled(busy || loading)
            } else {
                Text(t("An item carries at most", lang: lang) + " \(inventoryPhotoLimit) " + t("photos.", lang: lang))
                    .font(.system(size: 11)).foregroundColor(.secondary)
            }
        } header: {
            Text(t("Photos", lang: lang))
        }
    }

    private func stage(_ chosen: [PhotosPickerItem]) async {
        loading = true
        defer { loading = false; picking = [] }
        for item in chosen {
            guard alreadyOnItem + staged.count < inventoryPhotoLimit else { break }
            guard let data = try? await item.loadTransferable(type: Data.self) else { continue }
            staged.append(StagedInventoryPhoto(
                data: data,
                // The same name the photo manager sends; the upload path stamps
                // it with a timestamp, so identical names never collide.
                fileName: "photo.jpg",
                preview: stagedInventoryPhotoPreview(data)))
        }
    }
}

private struct StagedInventoryPhotoThumb: View {
    let photo: StagedInventoryPhoto
    let lang: String
    let onRemove: () -> Void

    var body: some View {
        ZStack(alignment: .topTrailing) {
            ZStack {
                RoundedRectangle(cornerRadius: 10).fill(Color.gray.opacity(0.12))
                if let preview = photo.preview {
                    Image(platformImage: preview).resizable().scaledToFill()
                }
            }
            .frame(height: 76)
            .clipShape(RoundedRectangle(cornerRadius: 10))

            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 15))
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(Color.white, Color.black.opacity(0.55))
            }
            .buttonStyle(.plain)
            .padding(3)
            .accessibilityLabel(t("Remove", lang: lang))
        }
    }
}
