import SwiftUI
import UniformTypeIdentifiers
import FirebaseFirestore
import FirebaseAuth
#if canImport(UserNotifications)
import UserNotifications
#endif
#if canImport(FirebaseFunctions)
import FirebaseFunctions
#endif
#if canImport(WebKit)
import WebKit
#endif

#if os(macOS)
import AppKit
typealias PlatformImage = NSImage
#else
import UIKit
import PhotosUI
typealias PlatformImage = UIImage
#endif


private func safeClientFileDisplayName(_ fileName: String) -> String {
    let trimmed = fileName.trimmingCharacters(in: .whitespacesAndNewlines)
    let fallback = trimmed.isEmpty ? "client-file" : trimmed
    let invalidCharacters = CharacterSet(charactersIn: "/\\:\0")
    return fallback.components(separatedBy: invalidCharacters).joined(separator: "-")
}

private func clientFileIsPDF(_ item: ClientFileItem) -> Bool {
    let lowerName = item.fileName.lowercased()
    return item.contentType.lowercased().contains("pdf") || lowerName.hasSuffix(".pdf")
}

private func clientFileIsImage(_ item: ClientFileItem) -> Bool {
    let lowerName = item.fileName.lowercased()
    if item.contentType.lowercased().contains("image") { return true }
    return [".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".gif", ".tiff", ".bmp"].contains { lowerName.hasSuffix($0) }
}

// Rebrands a raw Firebase Storage download URL as a nivadesk.app viewer link.
// Use ONLY for opening/sharing links (so the address bar shows nivadesk.app);
// inline image/PDF loading and direct downloads keep the raw URL.
func maskFileUrl(_ raw: String) -> String {
    guard let comps = URLComponents(string: raw),
          comps.host == "firebasestorage.googleapis.com" else { return raw }
    let fullPath = comps.path // URLComponents returns the percent-decoded path
    guard let range = fullPath.range(of: "/o/") else { return raw }
    let beforeO = String(fullPath[fullPath.startIndex..<range.lowerBound])
    let storagePath = String(fullPath[range.upperBound...])
    guard beforeO.hasPrefix("/v0/b/") else { return raw }
    let bucket = String(beforeO.dropFirst("/v0/b/".count))
    guard !bucket.isEmpty, !storagePath.isEmpty,
          let token = comps.queryItems?.first(where: { $0.name == "token" })?.value else { return raw }
    var allowed = CharacterSet.alphanumerics
    allowed.insert(charactersIn: "-._~")
    let segments = storagePath.split(separator: "/").map { seg in
        String(seg).addingPercentEncoding(withAllowedCharacters: allowed) ?? String(seg)
    }.joined(separator: "/")
    let encBucket = bucket.addingPercentEncoding(withAllowedCharacters: allowed) ?? bucket
    let encToken = token.addingPercentEncoding(withAllowedCharacters: allowed) ?? token
    return "https://nivadesk.app/f/\(segments)?b=\(encBucket)&t=\(encToken)"
}

private func loadClientFilePlatformImage(from url: URL) -> PlatformImage? {
    #if os(macOS)
    return PlatformImage(contentsOf: url)
    #else
    return PlatformImage(contentsOfFile: url.path)
    #endif
}

#if canImport(WebKit)
#if os(macOS)
private struct ClientFileWebView: NSViewRepresentable {
    let url: URL

    func makeNSView(context: Context) -> WKWebView {
        let webView = WKWebView()
        webView.allowsMagnification = true
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        if url.isFileURL {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        } else {
            webView.load(URLRequest(url: url))
        }
    }
}
#else
private struct ClientFileWebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        WKWebView()
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        if url.isFileURL {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        } else {
            webView.load(URLRequest(url: url))
        }
    }
}
#endif
#endif

private struct ClientFilePreviewContentView: View {
    let item: ClientFileItem
    let url: URL?
    let language: String

    private func lt(_ text: String) -> String { siparisDetayText(text, lang: language) }

    var body: some View {
        Group {
            if clientFileIsImage(item), let url {
                if url.isFileURL, let image = loadClientFilePlatformImage(from: url) {
                    Image(platformImage: image)
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .empty:
                            ProgressView()
                        case .success(let image):
                            image
                                .resizable()
                                .scaledToFit()
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                        case .failure:
                            unavailablePreview
                        @unknown default:
                            unavailablePreview
                        }
                    }
                }
            } else if clientFileIsPDF(item), let url {
                #if canImport(WebKit)
                ClientFileWebView(url: url)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                #else
                unavailablePreview
                #endif
            } else {
                unavailablePreview
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.primary.opacity(0.035))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var unavailablePreview: some View {
        VStack(spacing: 12) {
            Image(systemName: clientFileIsPDF(item) ? "doc.richtext.fill" : "doc.fill")
                .font(.system(size: 46, weight: .semibold))
                .foregroundColor(.secondary)
            Text(lt("Preview is not available for this file type."))
                .font(.system(size: 13, weight: .semibold))
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
            Text(lt("Use Download or Open to view this file in another app."))
                .font(.system(size: 11))
                .multilineTextAlignment(.center)
                .foregroundColor(.gray)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(24)
    }
}

struct ClientFilePreviewSheet: View {
    @Environment(\.dismiss) private var dismiss

    let items: [ClientFileItem]
    let language: String
    let isAvailableOffline: (ClientFileItem) -> Bool
    let offlineURLProvider: (ClientFileItem) -> URL?
    let onDownload: (ClientFileItem) -> Void
    let onMakeOffline: (ClientFileItem) -> Void
    let onOpenExternal: (ClientFileItem) -> Void

    @State private var selectedItemID: UUID

    init(
        items: [ClientFileItem],
        initialItemID: UUID,
        language: String,
        isAvailableOffline: @escaping (ClientFileItem) -> Bool,
        offlineURLProvider: @escaping (ClientFileItem) -> URL?,
        onDownload: @escaping (ClientFileItem) -> Void,
        onMakeOffline: @escaping (ClientFileItem) -> Void,
        onOpenExternal: @escaping (ClientFileItem) -> Void
    ) {
        self.items = items
        self.language = language
        self.isAvailableOffline = isAvailableOffline
        self.offlineURLProvider = offlineURLProvider
        self.onDownload = onDownload
        self.onMakeOffline = onMakeOffline
        self.onOpenExternal = onOpenExternal
        _selectedItemID = State(initialValue: initialItemID)
    }

    private func lt(_ text: String) -> String { siparisDetayText(text, lang: language) }

    private var currentIndex: Int {
        items.firstIndex(where: { $0.id == selectedItemID }) ?? 0
    }

    private var currentItem: ClientFileItem? {
        guard !items.isEmpty else { return nil }
        return items[min(max(currentIndex, 0), items.count - 1)]
    }

    private func previewURL(for item: ClientFileItem) -> URL? {
        if item.isPendingUpload,
           !item.localFilePath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return URL(fileURLWithPath: item.localFilePath)
        }
        if let offlineURL = offlineURLProvider(item), FileManager.default.fileExists(atPath: offlineURL.path) {
            return offlineURL
        }
        return URL(string: item.downloadURL)
    }

    private func move(_ delta: Int) {
        guard !items.isEmpty else { return }
        let nextIndex = min(max(currentIndex + delta, 0), items.count - 1)
        selectedItemID = items[nextIndex].id
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(currentItem?.fileName ?? lt("Preview"))
                        .font(.system(size: 17, weight: .bold))
                        .lineLimit(1)
                        .truncationMode(.middle)

                    if let currentItem {
                        Text("\(currentIndex + 1) / \(items.count) • \(currentItem.fileSize >= 1024 * 1024 ? String(format: "%.1f MB", Double(currentItem.fileSize) / 1024.0 / 1024.0) : String(format: "%.0f KB", Double(max(currentItem.fileSize, 1)) / 1024.0))")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.secondary)
                    }
                }

                Spacer(minLength: 0)

                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
            }

            if let currentItem {
                ClientFilePreviewContentView(item: currentItem, url: previewURL(for: currentItem), language: language)
                    .frame(minHeight: 360)

                HStack(spacing: 8) {
                    Button {
                        move(-1)
                    } label: {
                        Label(lt("Previous"), systemImage: "chevron.left")
                    }
                    .buttonStyle(.bordered)
                    .disabled(currentIndex <= 0)

                    Button {
                        move(1)
                    } label: {
                        Label(lt("Next"), systemImage: "chevron.right")
                    }
                    .buttonStyle(.bordered)
                    .disabled(currentIndex >= items.count - 1)

                    Spacer(minLength: 0)

                    if !currentItem.isPendingUpload && !isAvailableOffline(currentItem) {
                        Button {
                            onMakeOffline(currentItem)
                        } label: {
                            Label(lt("Make Offline"), systemImage: "arrow.down.circle")
                        }
                        .buttonStyle(.bordered)
                    }

                    Button {
                        onOpenExternal(currentItem)
                    } label: {
                        Label(lt("Open"), systemImage: "arrow.up.right.square")
                    }
                    .buttonStyle(.bordered)

                    Button {
                        onDownload(currentItem)
                    } label: {
                        Label(lt("Download"), systemImage: "square.and.arrow.down")
                    }
                    .buttonStyle(.borderedProminent)
                }
            } else {
                Spacer()
                Text(lt("No client files yet."))
                    .foregroundColor(.secondary)
                Spacer()
            }
        }
        .padding(18)
        #if os(macOS)
        .frame(minWidth: 760, minHeight: 560)
        #else
        .presentationDetents([.large])
        #endif
    }
}

private struct FittedSheetPresentation: ViewModifier {
    func body(content: Content) -> some View {
        #if os(iOS)
        if #available(iOS 18.0, *) {
            content.presentationSizing(.fitted)
        } else {
            content
        }
        #else
        content
        #endif
    }
}

extension Image {
    init(platformImage: PlatformImage) {
        #if os(macOS)
        self.init(nsImage: platformImage)
        #else
        self.init(uiImage: platformImage)
        #endif
    }
}

struct ShareableFileURL: Identifiable {
    let id = UUID()
    let url: URL
}

#if os(iOS)
struct FileShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

struct ClientFileCameraPicker: UIViewControllerRepresentable {
    let onImageURL: (URL) -> Void
    let onError: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.allowsEditing = false
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
        let parent: ClientFileCameraPicker

        init(parent: ClientFileCameraPicker) {
            self.parent = parent
        }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            defer { parent.dismiss() }

            guard let image = info[.originalImage] as? UIImage,
                  let data = image.jpegData(compressionQuality: 0.92) else {
                parent.onError("Could not read camera photo.")
                return
            }

            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("studioflow-client-camera-\(UUID().uuidString).jpg")

            do {
                try data.write(to: url, options: .atomic)
                parent.onImageURL(url)
            } catch {
                parent.onError(error.localizedDescription)
            }
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}
#endif

enum PlatformCursor {
    static func arrowSet() {
        #if os(macOS)
        NSCursor.arrow.set()
        #endif
    }

    static func closedHandSet() {
        #if os(macOS)
        NSCursor.closedHand.set()
        #endif
    }

    static func openHandSet() {
        #if os(macOS)
        NSCursor.openHand.set()
        #endif
    }

    static func pointingHandPush() {
        #if os(macOS)
        NSCursor.pointingHand.push()
        #endif
    }

    static func resizeLeftRightPush() {
        #if os(macOS)
        NSCursor.resizeLeftRight.push()
        #endif
    }

    static func resizeUpDownPush() {
        #if os(macOS)
        NSCursor.resizeUpDown.push()
        #endif
    }

    static func crosshairPush() {
        #if os(macOS)
        NSCursor.crosshair.push()
        #endif
    }

    static func pop() {
        #if os(macOS)
        NSCursor.pop()
        #endif
    }
}

enum PlatformHaptics {
    static func lightSelection() {
        #if os(iOS)
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.prepare()
        generator.impactOccurred()
        #endif
    }
}

final class CardDragCoordinator {
    static let shared = CardDragCoordinator()

    var sessionID = UUID()
    var reachedDropTarget = false

    private init() {}

    func beginSession() -> UUID {
        let id = UUID()
        sessionID = id
        reachedDropTarget = false
        return id
    }

    func markDropTargetReached() {
        reachedDropTarget = true
    }

    func endSession() {
        sessionID = UUID()
        reachedDropTarget = false
    }
}

func privacyCurrency(_ value: Double, symbol: String, ondalik: String, hideNumbers: Bool) -> String {
    if hideNumbers {
        return "\(symbol)••••"
    }
    return "\(symbol)\(formatFiyat(value, ondalik: ondalik))"
}

func privacyDate(_ date: Date, hideNumbers: Bool) -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = "dd/MM/yy"
    return formatter.string(from: date)
}

func privacyDigits(_ text: String, hideNumbers: Bool) -> String {
    return text
}

struct CustomStepDTO: Codable, Identifiable, Equatable { var id = UUID(); var title: String }

// Intake rows carry stable string ids ("itemType", "hallmark") so a workspace can
// rename the label without orphaning the value already saved against it.
struct RepairIntakeFieldDTO: Codable, Identifiable, Equatable { var id: String; var title: String }

// What a workspace takes in for repair, service or making depends entirely on
// the trade. A jeweller records Metal and Hallmark; a phone shop records IMEI
// and whether the passcode was handed over.
//
// Mirrored verbatim in functions/index.js, studioflow-web/lib/studioflow/
// repairIntakePresets.ts and StudioModels.kt. The field ids are what intake
// values are stored under, so they must never drift between platforms — only
// the titles are the workspace's to rename.
struct RepairIntakePresetDTO: Identifiable, Equatable {
    var id: String
    var label: String
    var fields: [RepairIntakeFieldDTO]
}

enum RepairIntakePresets {
    static let all: [RepairIntakePresetDTO] = [
        RepairIntakePresetDTO(id: "general", label: "General Intake", fields: [
            RepairIntakeFieldDTO(id: "itemType", title: "Item Type"),
            RepairIntakeFieldDTO(id: "brandMaker", title: "Brand / Maker"),
            RepairIntakeFieldDTO(id: "model", title: "Model"),
            RepairIntakeFieldDTO(id: "serialReference", title: "Serial / Reference"),
            RepairIntakeFieldDTO(id: "colour", title: "Colour"),
            RepairIntakeFieldDTO(id: "accessories", title: "Accessories Included")
        ]),
        RepairIntakePresetDTO(id: "jewellery", label: "Jewellery & Goldsmith", fields: [
            RepairIntakeFieldDTO(id: "itemType", title: "Item Type"),
            RepairIntakeFieldDTO(id: "metal", title: "Metal"),
            RepairIntakeFieldDTO(id: "hallmark", title: "Hallmark"),
            RepairIntakeFieldDTO(id: "itemSize", title: "Size"),
            RepairIntakeFieldDTO(id: "stones", title: "Stones"),
            RepairIntakeFieldDTO(id: "weight", title: "Weight"),
            RepairIntakeFieldDTO(id: "serialReference", title: "Serial / Reference")
        ]),
        RepairIntakePresetDTO(id: "watch", label: "Watch & Clock", fields: [
            RepairIntakeFieldDTO(id: "itemType", title: "Item Type"),
            RepairIntakeFieldDTO(id: "brandMaker", title: "Brand"),
            RepairIntakeFieldDTO(id: "model", title: "Model"),
            RepairIntakeFieldDTO(id: "serialReference", title: "Serial / Reference"),
            RepairIntakeFieldDTO(id: "caseSize", title: "Case Size"),
            RepairIntakeFieldDTO(id: "strap", title: "Bracelet / Strap"),
            RepairIntakeFieldDTO(id: "movement", title: "Movement")
        ]),
        RepairIntakePresetDTO(id: "electronics", label: "Electronics & Devices", fields: [
            RepairIntakeFieldDTO(id: "itemType", title: "Device Type"),
            RepairIntakeFieldDTO(id: "brandMaker", title: "Brand"),
            RepairIntakeFieldDTO(id: "model", title: "Model"),
            RepairIntakeFieldDTO(id: "serialReference", title: "Serial / IMEI"),
            RepairIntakeFieldDTO(id: "passcode", title: "Passcode Provided"),
            RepairIntakeFieldDTO(id: "accessories", title: "Accessories Included"),
            RepairIntakeFieldDTO(id: "warranty", title: "Warranty Status")
        ]),
        RepairIntakePresetDTO(id: "tailoring", label: "Tailoring & Alterations", fields: [
            RepairIntakeFieldDTO(id: "itemType", title: "Garment Type"),
            RepairIntakeFieldDTO(id: "fabric", title: "Fabric"),
            RepairIntakeFieldDTO(id: "itemSize", title: "Size"),
            RepairIntakeFieldDTO(id: "colour", title: "Colour"),
            RepairIntakeFieldDTO(id: "measurements", title: "Measurements"),
            RepairIntakeFieldDTO(id: "trim", title: "Trim / Buttons")
        ]),
        RepairIntakePresetDTO(id: "shoeLeather", label: "Shoe & Leather", fields: [
            RepairIntakeFieldDTO(id: "itemType", title: "Item Type"),
            RepairIntakeFieldDTO(id: "brandMaker", title: "Brand"),
            RepairIntakeFieldDTO(id: "material", title: "Material"),
            RepairIntakeFieldDTO(id: "itemSize", title: "Size"),
            RepairIntakeFieldDTO(id: "colour", title: "Colour"),
            RepairIntakeFieldDTO(id: "sole", title: "Sole Type")
        ]),
        RepairIntakePresetDTO(id: "furniture", label: "Furniture & Upholstery", fields: [
            RepairIntakeFieldDTO(id: "itemType", title: "Item Type"),
            RepairIntakeFieldDTO(id: "material", title: "Material"),
            RepairIntakeFieldDTO(id: "dimensions", title: "Dimensions"),
            RepairIntakeFieldDTO(id: "finish", title: "Finish"),
            RepairIntakeFieldDTO(id: "fabric", title: "Fabric"),
            RepairIntakeFieldDTO(id: "age", title: "Age / Period")
        ]),
        RepairIntakePresetDTO(id: "bicycle", label: "Bicycle & E-Bike", fields: [
            RepairIntakeFieldDTO(id: "itemType", title: "Bike Type"),
            RepairIntakeFieldDTO(id: "brandMaker", title: "Brand"),
            RepairIntakeFieldDTO(id: "model", title: "Model"),
            RepairIntakeFieldDTO(id: "frameNumber", title: "Frame Number"),
            RepairIntakeFieldDTO(id: "wheelSize", title: "Wheel Size"),
            RepairIntakeFieldDTO(id: "battery", title: "Battery / Motor")
        ]),
        RepairIntakePresetDTO(id: "automotive", label: "Automotive", fields: [
            RepairIntakeFieldDTO(id: "itemType", title: "Vehicle Type"),
            RepairIntakeFieldDTO(id: "brandMaker", title: "Make"),
            RepairIntakeFieldDTO(id: "model", title: "Model"),
            RepairIntakeFieldDTO(id: "registration", title: "Registration"),
            RepairIntakeFieldDTO(id: "vin", title: "VIN"),
            RepairIntakeFieldDTO(id: "mileage", title: "Mileage")
        ]),
        RepairIntakePresetDTO(id: "instrument", label: "Musical Instruments", fields: [
            RepairIntakeFieldDTO(id: "itemType", title: "Instrument"),
            RepairIntakeFieldDTO(id: "brandMaker", title: "Brand"),
            RepairIntakeFieldDTO(id: "model", title: "Model"),
            RepairIntakeFieldDTO(id: "serialReference", title: "Serial / Reference"),
            RepairIntakeFieldDTO(id: "finish", title: "Finish"),
            RepairIntakeFieldDTO(id: "accessories", title: "Case / Accessories")
        ])
    ]

    // businessType is free text the workspace can edit after onboarding, so the
    // exact onboarding labels are matched first and the rest falls back to a
    // keyword sweep that also covers the Turkish words a user is likely to type.
    private static let byBusinessType: [String: String] = [
        "jewellery studio": "jewellery",
        "tailor / alteration studio": "tailoring",
        "repair service": "general"
    ]

    private static let keywords: [(presetId: String, terms: [String])] = [
        ("jewellery", ["jewel", "goldsmith", "silversmith", "kuyum", "mucevher", "mücevher", "altin", "altın"]),
        ("watch", ["watch", "clock", "horolog", "saat"]),
        ("electronics", ["electronic", "phone", "mobile", "computer", "laptop", "device", "elektronik", "telefon", "bilgisayar"]),
        ("tailoring", ["tailor", "alteration", "garment", "seamstress", "terzi", "dikis", "dikiş"]),
        ("shoeLeather", ["shoe", "cobbler", "leather", "ayakkabi", "ayakkabı", "deri", "saraciye"]),
        ("furniture", ["furniture", "upholster", "carpent", "joinery", "mobilya", "doseme", "döşeme", "marangoz"]),
        ("bicycle", ["bicycle", "bike", "cycle", "bisiklet"]),
        ("automotive", ["automotive", "vehicle", "garage", "motor", "car ", "oto", "araba", "arac", "araç"]),
        ("instrument", ["instrument", "guitar", "piano", "luthier", "muzik", "müzik", "enstruman", "enstrüman"])
    ]

    static func preset(id: String) -> RepairIntakePresetDTO? {
        all.first { $0.id == id.trimmingCharacters(in: .whitespaces) }
    }

    static func presetId(forBusinessType businessType: String) -> String {
        let raw = businessType.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if raw.isEmpty { return "general" }
        if let exact = byBusinessType[raw] { return exact }
        for entry in keywords where entry.terms.contains(where: { raw.contains($0) }) {
            return entry.presetId
        }
        return "general"
    }

    static func fields(forBusinessType businessType: String) -> [RepairIntakeFieldDTO] {
        (preset(id: presetId(forBusinessType: businessType)) ?? all[0]).fields
    }

    // Which preset a stored row set came from, by exact id sequence. A renamed
    // title still counts as that preset, because ids are what identify a row.
    static func matchingPresetId(for fields: [RepairIntakeFieldDTO]) -> String {
        let signature = fields.map(\.id).joined(separator: "|")
        return all.first { $0.fields.map(\.id).joined(separator: "|") == signature }?.id ?? ""
    }
}

private func statusCustomToggleStorageKey(for toggle: CustomStepDTO) -> String {
    "statusToggle::\(toggle.id.uuidString.lowercased())"
}

private func statusCustomToggleValue(from toggles: [String: Bool]?, toggle: CustomStepDTO) -> Bool {
    let storageKey = statusCustomToggleStorageKey(for: toggle)
    let legacyUUIDKey = "statusToggle::\(toggle.id.uuidString)"
    return toggles?[storageKey] ?? toggles?[legacyUUIDKey] ?? toggles?[toggle.title] ?? false
}

private func statusStepStorageKey(for step: CustomStepDTO) -> String {
    "statusStep::\(step.id.uuidString.lowercased())"
}

private func statusStepValue(from statuses: [String: String]?, step: CustomStepDTO) -> String {
    let storageKey = statusStepStorageKey(for: step)
    let legacyUUIDKey = "statusStep::\(step.id.uuidString)"
    return statuses?[storageKey] ?? statuses?[legacyUUIDKey] ?? statuses?[step.title] ?? "Not Yet"
}

private func studioOrderDetailRoleKey(_ role: String, fallback: String = "member") -> String {
    let compact = role
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .lowercased()
        .replacingOccurrences(of: "[\\s_-]+", with: "", options: .regularExpression)

    switch compact {
    case "owner": return "owner"
    case "admin": return "admin"
    case "member": return "member"
    case "viewer", "viewonly", "readonly": return "viewer"
    case "workflow", "workflowonly": return "workflow"
    case "unknown", "": return fallback
    default: return fallback
    }
}

func studioOrderDetailRoleCanEdit(_ role: String) -> Bool {
    ["owner", "admin", "member", "workflow"].contains(studioOrderDetailRoleKey(role))
}

private struct ToDoAssigneeOption: Identifiable, Equatable {
    var uid: String
    var label: String
    var email: String
    var id: String { uid.isEmpty ? "unassigned" : uid }
}

private struct ToDoItemDropDelegate: DropDelegate {
    let item: OrderToDoItem
    @Binding var draggingID: UUID?
    let canEdit: Bool
    let moveAction: (UUID, UUID) -> Void
    let dropAction: (UUID?) -> Void

    func dropUpdated(info: DropInfo) -> DropProposal? {
        DropProposal(operation: .move)
    }

    func dropEntered(info: DropInfo) {
        guard canEdit, let draggingID, draggingID != item.id else { return }
        moveAction(draggingID, item.id)
    }

    func performDrop(info: DropInfo) -> Bool {
        guard canEdit else { return false }
        dropAction(draggingID)
        draggingID = nil
        return true
    }
}

extension Notification.Name {
    static let phoneCardMoveRequested = Notification.Name("phoneCardMoveRequested")
    // "Match column" from the card options menu needs the whole desktop layout
    // (kartYerlesimi), which lives in the parent workspace view — same bridge
    // pattern the phone move menu uses.
    static let cardSizeActionRequested = Notification.Name("cardSizeActionRequested")
}

enum KartTipi: String, Codable, Equatable, Identifiable, CaseIterable {
    case preview = "preview", summary = "summary", customer = "customer"
    case delivery = "delivery", communication = "communication", notes = "notes"
    case financial = "financial", status = "status", shipping = "shipping"
    case schedule = "schedule"
    case historyLog = "historyLog"
    case clientFiles = "clientFiles"
    case workTime = "workTime"
    case todo = "todo"
    case customerNotes = "customerNotes", materials = "materials", priority = "priority"
    case invoiceItems = "invoiceItems"
    case repairIntake = "repairIntake"
    case estimate = "estimate"
    case customerPortal = "customerPortal"
    var id: String { self.rawValue }
}

private struct WorkspaceCardInsertDropTarget: Equatable {
    let columnIndex: Int
    let after: KartTipi
}

struct IcerikBoyuKey: PreferenceKey {
    static var defaultValue: Double = 0
    static func reduce(value: inout Double, nextValue: () -> Double) { value = max(value, nextValue()) }
}

struct CalismaAlaniBoyutuKey: PreferenceKey {
    static var defaultValue: CGSize = .zero
    static func reduce(value: inout CGSize, nextValue: () -> CGSize) { value = nextValue() }
}

struct WorkspaceLayoutSnapshot: Codable {
    var version: Int = 1
    var sutunGenislikleri: [Double]
    var kartYerlesimi: [[KartTipi]]
    var phoneKartSirasi: [KartTipi]?
    var kartYukseklikleri: [String: Double]
    var orderKartYukseklikleri: [String: [String: Double]]?
    var kartRenkleri: [String: String]
    var visibility: [String: Bool]
}

struct WorkspaceProfileDTO: Codable, Identifiable, Equatable {
    var id = UUID()
    var name: String
    var snapshotJSON: String
}

struct WorkspaceUserProfileDTO: Codable, Identifiable, Equatable {
    var id = UUID()
    var userId: String
    var displayName: String
    var email: String
    var role: String
    var snapshotJSON: String
    var updatedAt: Date?
    var savedProfiles: [WorkspaceProfileDTO]

    enum CodingKeys: String, CodingKey {
        case id, userId, displayName, email, role, snapshotJSON, updatedAt, savedProfiles
    }

    init(
        id: UUID = UUID(),
        userId: String,
        displayName: String,
        email: String,
        role: String,
        snapshotJSON: String,
        updatedAt: Date?,
        savedProfiles: [WorkspaceProfileDTO] = []
    ) {
        self.id = id
        self.userId = userId
        self.displayName = displayName
        self.email = email
        self.role = role
        self.snapshotJSON = snapshotJSON
        self.updatedAt = updatedAt
        self.savedProfiles = savedProfiles
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        userId = try container.decodeIfPresent(String.self, forKey: .userId) ?? ""
        displayName = try container.decodeIfPresent(String.self, forKey: .displayName) ?? ""
        email = try container.decodeIfPresent(String.self, forKey: .email) ?? ""
        role = try container.decodeIfPresent(String.self, forKey: .role) ?? "member"
        snapshotJSON = try container.decodeIfPresent(String.self, forKey: .snapshotJSON) ?? ""
        updatedAt = try container.decodeIfPresent(Date.self, forKey: .updatedAt)
        savedProfiles = try container.decodeIfPresent([WorkspaceProfileDTO].self, forKey: .savedProfiles) ?? []
    }
}

private enum NotesTextEditorFocus: Hashable {
    case specialNotes
    case customerNotes
    case specialNote(UUID)
    case scheduleNote
    case todo(UUID)
}

private let primarySpecialNoteID = UUID(uuidString: "00000000-0000-0000-0000-000000000101")!

private func defaultSpecialNoteSections() -> [CustomStepDTO] {
    [CustomStepDTO(id: primarySpecialNoteID, title: "Special Notes")]
}

private func normalizedSpecialNoteSections(_ items: [CustomStepDTO]) -> [CustomStepDTO] {
    var cleanedItems: [CustomStepDTO] = []

    for item in items {
        let title = item.title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { continue }

        if !cleanedItems.contains(where: { $0.id == item.id }) {
            cleanedItems.append(CustomStepDTO(id: item.id, title: title))
        }
    }

    if let primaryIndex = cleanedItems.firstIndex(where: { $0.id == primarySpecialNoteID }) {
        let primary = cleanedItems.remove(at: primaryIndex)
        cleanedItems.insert(CustomStepDTO(id: primarySpecialNoteID, title: primary.title.isEmpty ? "Special Notes" : primary.title), at: 0)
    } else {
        cleanedItems.insert(defaultSpecialNoteSections()[0], at: 0)
    }

    return cleanedItems
}

private func normalizedSpecialNoteSections(from json: String) -> [CustomStepDTO] {
    let trimmedJSON = json.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedJSON.isEmpty,
          let data = trimmedJSON.data(using: .utf8),
          let decoded = try? JSONDecoder().decode([CustomStepDTO].self, from: data) else {
        return defaultSpecialNoteSections()
    }

    return normalizedSpecialNoteSections(decoded)
}

private func specialNoteCustomFieldKey(for id: UUID) -> String {
    "specialNote::\(id.uuidString)"
}

struct SiparisDetayView: View {
    @Binding var siparis: Siparis
    @Binding var seciliMusteri: Musteri?
    @Binding var aktifSekme: String
    var hideFinancialForWorkflow: Bool = false
    @EnvironmentObject var firebaseManager: FirebaseManager
    @EnvironmentObject var authVM: AuthViewModel
    @Environment(\.dismiss) private var dismiss

    @AppStorage("seciliDil") private var seciliDil: String = "English"
    @AppStorage("seciliParaBirimi") private var seciliParaBirimi: String = "£"
    @AppStorage("seciliOndalik") private var seciliOndalik: String = "."
    @AppStorage("hideSensitiveNumbers") private var hideSensitiveNumbers: Bool = false
    @AppStorage("orderDetailHeaderShowDeliveryTime") private var orderDetailHeaderShowDeliveryTime: Bool = true
    @AppStorage("orderDetailHeaderShowUpcomingSchedule") private var orderDetailHeaderShowUpcomingSchedule: Bool = true
    @AppStorage("orderDetailHeaderShowOrderValue") private var orderDetailHeaderShowOrderValue: Bool = true
    @AppStorage("workspaceCardsLockedV1") private var workspaceCardsLocked: Bool = false
    @State private var macFirstProjectGuideCompleted: Bool = false
    @State private var macFirstProjectGuideStep: Int = 0
    @State private var macFirstProjectGuideActive: Bool = false
    @State private var macFirstProjectGuideLoadedScope: String = ""
    @State private var showCardLayoutLockedByPlanAlert: Bool = false

    private func lt(_ text: String) -> String { siparisDetayText(text, lang: seciliDil) }

    private var shouldShowMacFirstProjectGuide: Bool {
        #if os(macOS)
        return macFirstProjectGuideActive && !macFirstProjectGuideCompleted
        #else
        return false
        #endif
    }

    private var macFirstProjectGuideStorageScope: String {
        let userId = (authVM.currentUserId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !userId.isEmpty, !companyId.isEmpty else { return "" }
        return "\(userId)__\(companyId)"
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: ":", with: "_")
            .replacingOccurrences(of: "@", with: "_")
    }

    private func macFirstProjectGuideDefaultsKey(_ suffix: String, scope: String? = nil) -> String {
        let resolvedScope = scope ?? macFirstProjectGuideStorageScope
        return "studioFlowMacFirstProjectGuide_\(resolvedScope)_\(suffix)_V2"
    }

    private func loadMacFirstProjectGuideState(forceReload: Bool = false) {
        #if os(macOS)
        let scope = macFirstProjectGuideStorageScope
        guard !scope.isEmpty else { return }
        guard forceReload || macFirstProjectGuideLoadedScope != scope else { return }
        let defaults = UserDefaults.standard
        macFirstProjectGuideCompleted = defaults.bool(forKey: macFirstProjectGuideDefaultsKey("completed", scope: scope))
        macFirstProjectGuideStep = defaults.integer(forKey: macFirstProjectGuideDefaultsKey("step", scope: scope))
        macFirstProjectGuideActive = defaults.bool(forKey: macFirstProjectGuideDefaultsKey("active", scope: scope))
        macFirstProjectGuideLoadedScope = scope
        #endif
    }

    private func saveMacFirstProjectGuideState() {
        #if os(macOS)
        let scope = macFirstProjectGuideStorageScope
        guard !scope.isEmpty else { return }
        let defaults = UserDefaults.standard
        defaults.set(macFirstProjectGuideCompleted, forKey: macFirstProjectGuideDefaultsKey("completed", scope: scope))
        defaults.set(macFirstProjectGuideStep, forKey: macFirstProjectGuideDefaultsKey("step", scope: scope))
        defaults.set(macFirstProjectGuideActive, forKey: macFirstProjectGuideDefaultsKey("active", scope: scope))
        macFirstProjectGuideLoadedScope = scope
        NotificationCenter.default.post(
            name: Notification.Name("StudioFlowMacFirstProjectGuideStateChanged"),
            object: nil,
            userInfo: ["scope": scope, "step": macFirstProjectGuideStep]
        )
        #endif
    }

    private func completeMacFirstProjectGuide() {
        loadMacFirstProjectGuideState()
        macFirstProjectGuideCompleted = true
        macFirstProjectGuideActive = false
        macFirstProjectGuideStep = 0
        showWidgetMenu = false
        saveMacFirstProjectGuideState()
    }

    private func arrangeMacFirstProjectGuideCustomerCardLayoutIfNeeded() {
        #if os(macOS)
        loadMacFirstProjectGuideState()
        guard shouldShowMacFirstProjectGuide, (macFirstProjectGuideStep == 1 || macFirstProjectGuideStep == 2) else { return }

        while kartYerlesimi.count < 2 { kartYerlesimi.append([]) }

        for index in kartYerlesimi.indices {
            kartYerlesimi[index].removeAll { $0 == .customer }
        }

        kartYerlesimi[0].insert(.customer, at: 0)

        while sutunGenislikleri.count < kartYerlesimi.count { sutunGenislikleri.append(350) }
        if sutunGenislikleri.indices.contains(0), sutunGenislikleri[0] < 350 {
            sutunGenislikleri[0] = 350
        }
        if sutunGenislikleri.indices.contains(1), sutunGenislikleri[1] < 320 {
            sutunGenislikleri[1] = 340
        }
        #endif
    }

    private func enforceMacFirstProjectGuideCustomerOnlyVisibilityIfNeeded(persist: Bool = true) {
        #if os(macOS)
        loadMacFirstProjectGuideState()
        guard shouldShowMacFirstProjectGuide, (macFirstProjectGuideStep == 1 || macFirstProjectGuideStep == 2) else { return }

        let alreadyCustomerOnly = showCardCustomer &&
            !showCardPreview && !showCardSummary && !showCardDelivery && !showCardCommunication &&
            !showCardNotes && !showCardFinancial && !showCardStatus && !showCardShipping &&
            !showCardSchedule && !showCardHistoryLog && !showCardClientFiles && !showCardToDo &&
            !showCardWorkTime && !showCardCustomerNotes && !showCardMaterials && !showCardPriority

        workspaceCardsLocked = false
        arrangeMacFirstProjectGuideCustomerCardLayoutIfNeeded()
        // The guide card only drives visibility/position. Never touch card heights
        // the user resized by hand here; doing so used to break manual bottom-handle
        // resizing.

        guard !alreadyCustomerOnly else {
            yenileCalismaAlaniHitbox(delay: 0.01)
            if persist { persistWorkspaceCustomizationChange() }
            return
        }

        isApplyingWorkspaceLayout = true
        showCardPreview = false
        showCardSummary = false
        showCardCustomer = true
        showCardDelivery = false
        showCardCommunication = false
        showCardNotes = false
        showCardFinancial = false
        showCardStatus = false
        showCardShipping = false
        showCardSchedule = false
        showCardHistoryLog = false
        showCardClientFiles = false
        showCardToDo = false
        showCardWorkTime = false
        showCardCustomerNotes = false
        showCardMaterials = false
        showCardPriority = false
        DispatchQueue.main.async { isApplyingWorkspaceLayout = false }

        yenileCalismaAlaniHitbox(delay: 0.01)
        if persist {
            persistWorkspaceCustomizationChange()
        }
        #endif
    }

    private func arrangeMacFirstProjectGuideFinancialCardLayoutIfNeeded() {
        #if os(macOS)
        loadMacFirstProjectGuideState()
        guard shouldShowMacFirstProjectGuide, macFirstProjectGuideStep == 4 || macFirstProjectGuideStep == 5 || macFirstProjectGuideStep == 6 else { return }

        while kartYerlesimi.count < 2 { kartYerlesimi.append([]) }
        for index in kartYerlesimi.indices {
            kartYerlesimi[index].removeAll { $0 == .financial }
        }
        if !kartYerlesimi[0].contains(.customer) {
            kartYerlesimi[0].insert(.customer, at: 0)
        }
        kartYerlesimi[1].insert(.financial, at: 0)
        while sutunGenislikleri.count < kartYerlesimi.count { sutunGenislikleri.append(350) }
        if sutunGenislikleri.indices.contains(0), sutunGenislikleri[0] < 350 { sutunGenislikleri[0] = 350 }
        if sutunGenislikleri.indices.contains(1), sutunGenislikleri[1] < 350 { sutunGenislikleri[1] = 350 }
        // Leave the Financial Info card's saved height alone. The guide bubble is
        // positioned as an overlay; the card's manual resize value is preserved.
        yenileCalismaAlaniHitbox(delay: 0.01)
        #endif
    }

    private func continueMacFirstProjectGuideFromCustomerCard() {
        loadMacFirstProjectGuideState()
        guard shouldShowMacFirstProjectGuide, macFirstProjectGuideStep == 2 else { return }
        enforceMacFirstProjectGuideCustomerOnlyVisibilityIfNeeded(persist: true)
        withAnimation(.snappy) {
            macFirstProjectGuideStep = 3
        }
        saveMacFirstProjectGuideState()
    }

    private func continueMacFirstProjectGuideAfterFinancialInfoEnabled() {
        loadMacFirstProjectGuideState()
        guard shouldShowMacFirstProjectGuide, macFirstProjectGuideStep == 4 else { return }
        arrangeMacFirstProjectGuideFinancialCardLayoutIfNeeded()
        withAnimation(.snappy) {
            macFirstProjectGuideStep = 5
            showWidgetMenu = false
        }
        saveMacFirstProjectGuideState()
        persistWorkspaceCustomizationChange()
    }

    private func continueMacFirstProjectGuideToFinancialCardActions() {
        loadMacFirstProjectGuideState()
        guard shouldShowMacFirstProjectGuide, macFirstProjectGuideStep == 5 else { return }
        arrangeMacFirstProjectGuideFinancialCardLayoutIfNeeded()
        withAnimation(.snappy) {
            macFirstProjectGuideStep = 6
        }
        saveMacFirstProjectGuideState()
    }

    private func completeMacFirstProjectGuideFromFinancialCardActions() {
        loadMacFirstProjectGuideState()
        guard shouldShowMacFirstProjectGuide, macFirstProjectGuideStep == 6 else { return }
        applyMacFirstProjectGuideFinalThreeColumnLayout()
        withAnimation(.snappy) {
            macFirstProjectGuideCompleted = true
            macFirstProjectGuideActive = false
            macFirstProjectGuideStep = 0
        }
        saveMacFirstProjectGuideState()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            applyMacFirstProjectGuideFinalThreeColumnLayout()
        }
    }

    private func applyMacFirstProjectGuideFinalThreeColumnLayout() {
        #if os(macOS)
        workspaceCardsLocked = false

        isApplyingWorkspaceLayout = true
        showCardPreview = false
        showCardSummary = false
        showCardCustomer = true
        showCardDelivery = false
        showCardCommunication = false
        showCardNotes = false
        showCardFinancial = true
        showCardStatus = false
        showCardShipping = false
        showCardSchedule = false
        showCardHistoryLog = false
        showCardClientFiles = false
        showCardToDo = false
        showCardWorkTime = false
        showCardCustomerNotes = false
        showCardMaterials = false
        showCardPriority = false

        kartYerlesimi = [
            [.customer],
            [.financial],
            []
        ]

        while sutunGenislikleri.count < 3 { sutunGenislikleri.append(350) }
        if sutunGenislikleri.count > 3 {
            sutunGenislikleri = Array(sutunGenislikleri.prefix(3))
        }
        for index in sutunGenislikleri.indices {
            sutunGenislikleri[index] = min(max(sutunGenislikleri[index], 320), 520)
        }

        DispatchQueue.main.async { isApplyingWorkspaceLayout = false }
        kaydetSutunGenislikleri()
        kaydetKartYerlesimi()
        persistWorkspaceCustomizationChange()
        yenileCalismaAlaniHitbox(delay: 0.01)
        #endif
    }

    private func completeMacFirstProjectGuideFromFinancialCard() {
        loadMacFirstProjectGuideState()
        guard shouldShowMacFirstProjectGuide, macFirstProjectGuideStep == 5 else { return }
        // Keep the guided starter workspace minimal. Do not open every card automatically.
        // Users can later enable any other cards from Actions > Customize.
        arrangeMacFirstProjectGuideFinancialCardLayoutIfNeeded()
        compactVisibleWorkspaceCardsIntoFirstThreeColumns()
        withAnimation(.snappy) {
            macFirstProjectGuideCompleted = true
            macFirstProjectGuideActive = false
            macFirstProjectGuideStep = 0
        }
        saveMacFirstProjectGuideState()
        kaydetKartYerlesimi()
        kaydetSutunGenislikleri()
        persistWorkspaceCustomizationChange()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            compactVisibleWorkspaceCardsIntoFirstThreeColumns()
            persistWorkspaceCustomizationChange()
        }
    }

    private func compactVisibleWorkspaceCardsIntoFirstThreeColumns() {
        #if os(macOS)
        let preferredOrder: [KartTipi] = [
            .preview, .summary, .customer, .invoiceItems, .delivery, .materials, .priority,
            .notes, .clientFiles, .todo, .workTime,
            .financial, .status, .shipping, .schedule, .historyLog, .customerNotes
        ]

        let currentlyVisible = Set(allCardsFlatUnique.filter { isCardVisible($0) })
        let orderedVisible = preferredOrder.filter { currentlyVisible.contains($0) }
        guard !orderedVisible.isEmpty else { return }

        var columns: [[KartTipi]] = [[], [], []]
        for (index, card) in orderedVisible.enumerated() {
            columns[index % 3].append(card)
        }

        // Preserve any unknown/future card values, but still keep them inside the first 3 columns.
        let known = Set(orderedVisible)
        let extraVisibleCards = allCardsFlatUnique.filter { currentlyVisible.contains($0) && !known.contains($0) }
        for card in extraVisibleCards {
            let targetIndex = columns.enumerated().min(by: { $0.element.count < $1.element.count })?.offset ?? 0
            columns[targetIndex].append(card)
        }

        isApplyingWorkspaceLayout = true
        kartYerlesimi = columns
        if sutunGenislikleri.count < 3 {
            while sutunGenislikleri.count < 3 { sutunGenislikleri.append(350) }
        } else if sutunGenislikleri.count > 3 {
            sutunGenislikleri = Array(sutunGenislikleri.prefix(3))
        }
        for index in sutunGenislikleri.indices {
            sutunGenislikleri[index] = Swift.min(Swift.max(sutunGenislikleri[index], CGFloat(320)), CGFloat(520))
        }
        DispatchQueue.main.async { isApplyingWorkspaceLayout = false }
        kaydetKartYerlesimi()
        kaydetSutunGenislikleri()
        yenileCalismaAlaniHitbox(delay: 0.01)
        #endif
    }

    private func workspaceAccessAllows(_ key: String) -> Bool {
        authVM.currentWorkspaceAccess[key] ?? true
    }

    private var canAccessFinancialInfo: Bool {
        !hideFinancialForWorkflow && workspaceAccessAllows("financialInfo")
    }

    private var canAccessClientFiles: Bool {
        workspaceAccessAllows("clientFiles")
    }

    private var canEditOrderDetails: Bool {
        (authVM.isCompanyOwner || studioOrderDetailRoleCanEdit(authVM.currentWorkspaceRole)) && workspaceAccessAllows("orders")
    }

    private func cardAccessKey(_ kart: KartTipi) -> String? {
        switch kart {
        case .preview: return "cardPreview"
        case .summary: return "cardSummary"
        case .customer: return "cardCustomer"
        case .delivery: return "cardDelivery"
        case .notes: return "cardNotes"
        case .financial: return "cardFinancial"
        case .status: return "cardStatus"
        case .shipping: return "cardShipping"
        case .schedule: return "cardSchedule"
        case .historyLog: return "cardHistoryLog"
        case .clientFiles: return "cardClientFiles"
        case .todo: return "cardTodo"
        case .workTime: return "cardWorkTime"
        case .materials: return "cardMaterials"
        case .priority: return "cardPriority"
        case .invoiceItems: return "cardCustomer"
        case .repairIntake: return "cardSummary"
        case .estimate: return "cardFinancial"
        case .customerPortal: return "cardCustomer"
        case .communication, .customerNotes: return nil
        }
    }

    private func canAccessCard(_ kart: KartTipi) -> Bool {
        guard let key = cardAccessKey(kart) else { return false }
        return workspaceAccessAllows(key)
    }
    
    @State private var isLinkEditing = false
    @State private var previewLinkBeforeEditing = ""
    @State private var isHoveringLink = false
    @State private var isImagePickerPresented = false
    @State private var pdfShareItem: ShareableFileURL?
    // The authoritative estimate, fetched once per (order, estimate, status,
    // link) rather than from the card body, which SwiftUI re-evaluates freely.
    @State private var estimateRecord: OrderEstimateRecord?
    @State private var estimateRecordKey: String = ""
    @State private var estimateBusy: Bool = false
    @State private var estimateNotice: String = ""
    @State private var portalBusy: Bool = false
    @State private var portalNotice: String = ""
    @State private var isHoveringDrop = false
    @State private var isUploading = false
    @State private var isClientFileImporterPresented = false
    #if os(iOS)
    @State private var showClientFileSourceDialog = false
    @State private var isClientFilePhotoPickerPresented = false
    @State private var selectedClientFilePhotoItem: PhotosPickerItem? = nil
    @State private var isClientFileCameraPresented = false
    #endif
    @State private var isClientFileDropTargeted = false
    @State private var isUploadingClientFile = false
    @State private var isImportingSharedClientFiles = false
    @State private var sharedClientFilesInbox: [SharedClientFileInbox.PendingFile] = []
    @State private var clientFileMessage: String = ""
    @State private var offlineClientFileRefreshToken = UUID()
    @State private var clientFilePreviewItem: ClientFileItem? = nil
    @State private var orderLibraryFiles: [LibraryFile]? = nil
    @AppStorage("uploadSafetyRequirePolicyAcceptanceV1") private var uploadSafetyRequirePolicyAcceptance: Bool = true
    @AppStorage("uploadSafetyPolicyAcceptedV1") private var uploadSafetyPolicyAccepted: Bool = false
    @State private var pendingUploadSafetyURL: URL? = nil
    @State private var pendingUploadSafetySource: String = "order_preview"
    @State private var showUploadSafetyPrompt: Bool = false
    @State private var showUploadSafetyError: Bool = false
    @State private var uploadSafetyErrorMessage: String = ""
    @State private var uiTetikleyici: Bool = false
    @State private var isHoveringTitle = false
    @State private var showWidgetMenu = false
    @State private var headingEditorTarget: KartTipi? = nil
    @State private var showAddPaymentSheet: Bool = false
    @State private var newPaymentAmount: String = ""
    @State private var newPaymentMethod: String = ""
    @State private var newPaymentNote: String = ""
    // Per-entry note editing — works for every ledger entry, including payments
    // that arrived automatically from WooCommerce/Shopify webhooks.
    @State private var editingPaymentEntry: PaymentEntry? = nil
    @State private var editingPaymentNoteText: String = ""
    @State private var paymentsExpanded: Bool = false
    @State private var workspaceStatusMessage: String = ""
    @State private var isApplyingWorkspaceLayout: Bool = false

    @AppStorage("workspaceCustomizationModeV1") private var workspaceCustomizationMode: String = "shared"
    @AppStorage("workspaceProfile1JSONV1") private var workspaceProfile1JSON: String = ""
    @AppStorage("workspaceProfile2JSONV1") private var workspaceProfile2JSON: String = ""
    @AppStorage("workspaceProfile3JSONV1") private var workspaceProfile3JSON: String = ""
    @AppStorage("workspaceProfilesJSONV2") private var workspaceProfilesJSON: String = ""
    @AppStorage("workspaceUserProfilesJSONV1") private var workspaceUserProfilesJSON: String = ""
    @AppStorage("workspaceFollowedTeamProfileUserIdV1") private var workspaceFollowedTeamProfileUserId: String = ""
    @AppStorage("workspaceOwnerCardSyncDismissedV1") private var workspaceOwnerCardSyncDismissed: Bool = false
    @AppStorage("sharedWorkspaceSnapshotJSONV1") private var sharedWorkspaceSnapshotJSON: String = ""
    // Read-only mirror of companySettings.typeWorkspaceSnapshotsJSON — the
    // workspace's per-order-TYPE card layouts (today only "repair"). Written
    // exclusively by the owner via web/server; Swift only reads it to resolve
    // which layout an order shows and must NEVER upload it anywhere.
    @AppStorage("typeWorkspaceSnapshotsJSONV1") private var typeWorkspaceSnapshotsJSON: String = ""
    @State private var workspaceProfiles: [WorkspaceProfileDTO] = []
    @State private var workspaceUserProfiles: [WorkspaceUserProfileDTO] = []
    @State private var followedTeamProfileLastSnapshotJSON: String = ""
    @State private var workspaceProfilesCloudListener: ListenerRegistration?
    @State private var isApplyingWorkspaceProfilesFromCloud: Bool = false
    // Multi-device card-profile sync guards. A freshly-opened device must not
    // push its locally-cached (possibly stale) layout to the cloud before the
    // workspace listener has delivered the latest state at least once — that is
    // what made two Macs flip each other back to an old card profile. The
    // settle-gate enforces "load the current version before you may write it",
    // and the content signature skips no-op/echo re-uploads of unchanged data.
    @State private var hasSyncedWorkspaceCloudOnce: Bool = false
    @State private var lastSyncedOwnProfileContent: String = ""
    @State private var activeWorkspaceLayoutOrderKey: String = ""
    @State private var activeWorkspaceLayoutIsIndependent: Bool = false
    // True while the layout on screen came from the order-TYPE snapshot (e.g.
    // the workspace's "repair" convention). Guards the auto-save path exactly
    // like the independent per-order layout: a type layout must never be
    // re-uploaded into the user's card profile or the shared snapshot.
    @State private var activeWorkspaceLayoutIsTypeManaged: Bool = false
    @State private var iPadWorkspaceZoomScale: CGFloat = 1.0
    @State private var liveTrackingListener: ListenerRegistration?
    @State private var liveTrackingData: [String: String] = [:]
    @State private var isLiveTrackingSyncing: Bool = false
    @State private var trackingAutoSyncWorkItem: DispatchWorkItem?
    @State private var trackingSyncMessage: String = ""
    @FocusState private var focusedNotesTextEditor: NotesTextEditorFocus?

    private let orderWorkspaceLayoutKey = "__workspaceLayoutV1"

    @Environment(\.openURL) var openURL
    @Environment(\.colorScheme) var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    private var isPhoneLayout: Bool { horizontalSizeClass == .compact }

    private var isPadLayout: Bool {
        #if os(iOS)
        return UIDevice.current.userInterfaceIdiom == .pad
        #else
        return false
        #endif
    }

    private var isCompactPhoneLayout: Bool {
        isPhoneLayout && !isPadLayout
    }

    private var shouldKeepStableWorkspaceWidth: Bool {
        #if os(macOS)
        // Keep extra empty columns only while a card is actively being dragged.
        // Once the drag ends, the workspace width should shrink back to the last visible column
        // so the bottom horizontal scrollbar disappears when there is no hidden column to the right.
        return draggedKart != nil || showWorkspaceEmptyDropTargets
        #else
        return false
        #endif
    }
    
    @AppStorage("colWLeftV3") private var savedColLeft: Double = 350
    @AppStorage("colWMidV3") private var savedColMid: Double = 350
    @AppStorage("colWRightV3") private var savedColRight: Double = 350
    @AppStorage("sutunGenislikleriJSONV4") private var sutunGenislikleriJSON: String = ""
    @State private var sutunGenislikleri: [Double] = [350, 350, 350]
    
    // Per-card colour memory
    @AppStorage("kartRenkleriJSONV1") private var kartRenkleriJSON: String = "{}"
    @State private var kartRenkleri: [String: String] = [:]
    
    @AppStorage("kartYerlesimiJSON") private var kartYerlesimiJSON = ""
    @AppStorage("kartYukseklikleriJSON") private var kartYukseklikleriJSON = "{}"
    
    @State private var kartYerlesimi: [[KartTipi]] = [
        [.preview, .repairIntake, .estimate, .customerPortal, .summary, .workTime, .shipping, .schedule, .notes],
        [.customer, .invoiceItems, .materials, .delivery],
        [.financial, .priority, .todo, .status, .historyLog, .clientFiles, .customerNotes]
    ]
    @State private var kartYukseklikleri: [String: Double] = [:]
    @State private var sharedKartYukseklikleri: [String: Double] = [:]
    @State private var orderKartYukseklikleri: [String: [String: Double]] = [:]
    @State private var draggedKart: KartTipi? = nil
    @State private var kartYerlesimiBeforeDrag: [[KartTipi]]? = nil
    @State private var showWorkspaceEmptyDropTargets: Bool = false
    @State private var workspaceCardInsertDropTarget: WorkspaceCardInsertDropTarget? = nil
    // iPhone-only vertical order. This is intentionally separate from the Mac/iPad workspace layout.
    // Mac/iPad column positions continue to use kartYerlesimi/shared workspace sync.
    @AppStorage("phoneKartSirasiJSONV1") private var phoneKartSirasiJSON: String = ""
    @AppStorage("phoneOrderCompactViewV1") private var phoneOrderCompactView: Bool = false
    @State private var phoneKartSirasi: [KartTipi] = []
    @State private var macOSHitboxHack: CGFloat = 0
    @State private var hasHealedOrphanCardsOnce: Bool = false
    @State private var orphanCardRepairAttempts: Int = 0
    @State private var calismaAlaniIcerikBoyutu: CGSize = .zero
    
    @AppStorage("showCardPreview") private var showCardPreview = true; @AppStorage("showCardSummary") private var showCardSummary = true; @AppStorage("showCardCustomer") private var showCardCustomer = true; @AppStorage("showCardDelivery") private var showCardDelivery = true; @AppStorage("showCardCommunication") private var showCardCommunication = true; @AppStorage("showCardNotes") private var showCardNotes = true; @AppStorage("showCardFinancial") private var showCardFinancial = true; @AppStorage("showCardStatus") private var showCardStatus = true; @AppStorage("showCardShipping") private var showCardShipping = true
    @AppStorage("showCardCustomerNotes") private var showCardCustomerNotes = false
    @AppStorage("showCardMaterials") private var showCardMaterials = true
    @AppStorage("showCardPriority") private var showCardPriority = true
    @AppStorage("showCardInvoiceItems") private var showCardInvoiceItems = true
    @AppStorage("showCardRepairIntake") private var showCardRepairIntake = true
    @AppStorage("showCardEstimate") private var showCardEstimate = true
    @AppStorage("showCardCustomerPortal") private var showCardCustomerPortal = true
    @State private var showInvoiceFooterEditor = false
    @AppStorage("showCardSchedule") private var showCardSchedule = true
    @AppStorage("showCardHistoryLog") private var showCardHistoryLog = true
    @AppStorage("showCardClientFiles") private var showCardClientFiles = true
    @AppStorage("showCardToDo") private var showCardToDo = true
    @AppStorage("showCardWorkTime") private var showCardWorkTime = true
    @AppStorage("scheduleQuickRemindersJSONV2") private var scheduleQuickRemindersJSON: String = ""
    @AppStorage("communicationShowTelephoneV1") private var communicationShowTelephone: Bool = true
    @AppStorage("communicationShowEmailV1") private var communicationShowEmail: Bool = true
    @AppStorage("communicationShowAddressV1") private var communicationShowAddress: Bool = true
    @AppStorage("communicationShowChannelV1") private var communicationShowChannel: Bool = true
    @AppStorage("communicationShowCustomerNotesV1") private var communicationShowCustomerNotes: Bool = true
    @AppStorage("communicationChannelLabelsJSONV1") private var communicationChannelLabelsJSON: String = ""
    @AppStorage("specialNoteSectionsJSONV1") private var specialNoteSectionsJSON: String = ""
    @AppStorage("businessType") private var businessType: String = "Custom Art Studio"
    @AppStorage("businessDescriptionPrompt") private var businessDescriptionPrompt: String = ""
    @AppStorage("settingsStartSection") private var settingsStartSection: String = ""
    @State private var showScheduleQuickSettings: Bool = false
    @State private var showScheduleQuickPicker: Bool = false
    @State private var editableQuickReminders: [ScheduleQuickReminderItem] = []

    @State private var newScheduleTitle: String = "Follow up customer"
    @State private var newScheduleNote: String = ""
    @State private var newScheduleDueAt: Date = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
    @State private var newSchedulePriority: String = "Normal"
    @State private var newScheduleNotify: Bool = true
    @State private var scheduleMessage: String = ""
    @State private var calendarMessage: String = ""
    @State private var isUpdatingCalendarEvent: Bool = false
    @State private var newToDoTitle: String = ""
    @State private var newToDoNote: String = ""
    @State private var newToDoAssignedToUid: String = ""
    @State private var newToDoPriority: String = "Normal"
    @State private var newToDoDueAt: Date = Date()
    @State private var newToDoHasDueDate: Bool = false
    @State private var toDoFilter: String = "Open"
    @State private var draggingToDoItemID: UUID? = nil
    @State private var toDoMessage: String = ""
    @State private var newWorkSessionTitle: String = ""
    @State private var workTimeMessage: String = ""
    @State private var orderDetailAutosaveWorkItem: DispatchWorkItem? = nil
    @State private var pendingOrderDetailPreviousSiparis: Siparis? = nil
    
    @AppStorage("feePercentage") private var feePercentage = 3.0
    @AppStorage("defaultTaxRate") private var defaultTaxRate = 20.0
    @AppStorage("taxCalculationType") private var taxCalculationType = "Revenue"
    @AppStorage("corporationTaxEnabled") private var corporationTaxEnabled = false
    @AppStorage("corporationTaxRate") private var corporationTaxRate = 19.0
    @AppStorage("taxMilestoneEnabled") private var taxMilestoneEnabled: Bool = false
    @AppStorage("taxMilestoneDate") private var taxMilestoneDate: Double = Date().timeIntervalSince1970
    @AppStorage("taxRuleNameRevenue") private var taxRuleNameRevenue: String = "Standard Tax (Services/New)"
    @AppStorage("taxRuleNameProfit") private var taxRuleNameProfit: String = "Margin Scheme (2nd Hand)"
    
    @AppStorage("invLabel1") private var invLabel1: String = "Dial Sourced"
    @AppStorage("invLabel2") private var invLabel2: String = "Dial Received"
    @AppStorage("invLabel3") private var invLabel3: String = "Watch Received"
    @AppStorage("invLabel4") private var invLabel4: String = "Materials Ready"
    
    @AppStorage("activeStatusesJSON") private var activeStatusesJSON: String = "[\"New\",\"Not Yet\",\"In Progress\",\"Done\",\"Cancelled\"]"
    @AppStorage("customFieldsJSON") private var customFieldsJSON: String = ""
    @AppStorage("repairIntakeFieldsJSON") private var repairIntakeFieldsJSON: String = ""
    @AppStorage("customTogglesJSON") private var customTogglesJSON: String = ""
    @AppStorage("materialsTogglesJSON") private var materialsTogglesJSON: String = ""
    @AppStorage("materialsDefaultChecksJSON") private var materialsDefaultChecksJSON: String = ""
    @AppStorage("showStatusNotesSupplier") private var showStatusNotesSupplier: Bool = false
    @AppStorage("showMaterialsNotesSupplier") private var showMaterialsNotesSupplier: Bool = true
    @AppStorage("statusNotesSupplierLabel") private var statusNotesSupplierLabel: String = "Notes / Supplier"
    @AppStorage("materialsNotesSupplierLabel") private var materialsNotesSupplierLabel: String = "Notes / Supplier"
    
    @AppStorage("appLogoUrl") private var appLogoUrl: String = ""
    @AppStorage("appSubtitle") private var appSubtitle = "Bespoke Hand-Painted Dials"
    @AppStorage("companyNumbersJSON") private var companyNumbersJSON: String = ""
    @AppStorage("invoiceCounter") private var invoiceCounter: Int = 0
    @AppStorage("invoiceCounterYear") private var invoiceCounterYear: Int = 0
    @AppStorage("invoiceFooterNote") private var invoiceFooterNote: String = ""
    @AppStorage("customStepsJSON") private var customStepsJSON = ""
    @AppStorage("financialExpenseItemsJSON") private var financialExpenseItemsJSON: String = ""
    @AppStorage("financialRemainingItemsJSON") private var financialRemainingItemsJSON: String = ""
    @AppStorage("financialShowBaseCost") private var financialShowBaseCost: Bool = true
    @AppStorage("financialBaseCostLabel") private var financialBaseCostLabel: String = "Cost (Base)"
    @AppStorage("priorityCardLabel") private var priorityCardLabel: String = "Priority"
    @AppStorage("riskCardLabel") private var riskCardLabel: String = "Risk"
    @AppStorage("designNameLabel") private var designNameLabel: String = "Design Name"
    @AppStorage("summaryStep1") private var summaryStep1 = "Design"
    @AppStorage("summaryStep2") private var summaryStep2 = "Painting"
    
        @AppStorage("orderListStep1") private var orderListStep1 = "Design"
    @AppStorage("orderListStep2") private var orderListStep2 = "Painting"
    // Customizable heading for the invoice items block (empty → localized "Design Name").
    @AppStorage("orderItemsHeading") private var orderItemsHeading = ""

@AppStorage("pdfShowCustomer") private var pdfShowCustomer = true; @AppStorage("pdfShowContact") private var pdfShowContact = true; @AppStorage("pdfShowPreview") private var pdfShowPreview = true; @AppStorage("pdfShowFinCustomer") private var pdfShowFinCustomer = true; @AppStorage("pdfShowPaymentMethod") private var pdfShowPaymentMethod = true; @AppStorage("pdfShowFinInternal") private var pdfShowFinInternal = false; @AppStorage("pdfShowStatus") private var pdfShowStatus = true; @AppStorage("pdfShowShipping") private var pdfShowShipping = true; @AppStorage("pdfShowAddress") private var pdfShowAddress = true; @AppStorage("pdfShowShippingAddress") private var pdfShowShippingAddress = true
    @AppStorage("pdfShowMaterials") private var pdfShowMaterials = true
    @AppStorage("pdfShowPriority") private var pdfShowPriority: Bool = true
    
    var decodedSteps: [CustomStepDTO] { if let data = customStepsJSON.data(using: .utf8), let dec = try? JSONDecoder().decode([CustomStepDTO].self, from: data), !dec.isEmpty { return dec }; return [CustomStepDTO(title: "Design"), CustomStepDTO(title: "Painting")] }

    private var activeProductionStepTitles: [String] {
        decodedSteps
            .map { $0.title.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    private func resolvedProductionStepName(_ storedValue: String, fallbackIndex: Int) -> String {
        let cleaned = storedValue.trimmingCharacters(in: .whitespacesAndNewlines)
        let titles = activeProductionStepTitles

        if !cleaned.isEmpty, titles.contains(cleaned) {
            return cleaned
        }

        if titles.indices.contains(fallbackIndex) {
            return titles[fallbackIndex]
        }

        return fallbackIndex == 0 ? "Design" : "Painting"
    }

    private var resolvedSummaryStep1: String {
        resolvedProductionStepName(summaryStep1, fallbackIndex: 0)
    }

    private var resolvedSummaryStep2: String {
        resolvedProductionStepName(summaryStep2, fallbackIndex: 1)
    }
    var userStatuses: [String] { if let data = activeStatusesJSON.data(using: .utf8), let dec = try? JSONDecoder().decode([String].self, from: data), !dec.isEmpty { return dec }; return ["New", "Not Yet", "In Progress", "Done", "Cancelled"] }
    var customFieldsList: [CustomStepDTO] {
        let trimmedJSON = customFieldsJSON.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedJSON.isEmpty else { return [] }
        if let data = trimmedJSON.data(using: .utf8),
           let decoded = try? JSONDecoder().decode([CustomStepDTO].self, from: data) {
            return decoded.filter { !$0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        }
        return []
    }
    // Rows on the Repair Intake card. Ids stay put so saved values survive a
    // rename; titles are the workspace's ("Ring Size" here, "Case Size" there).
    var repairIntakeFieldsList: [RepairIntakeFieldDTO] {
        let trimmed = repairIntakeFieldsJSON.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty,
           let data = trimmed.data(using: .utf8),
           let decoded = try? JSONDecoder().decode([RepairIntakeFieldDTO].self, from: data) {
            let cleaned = decoded.filter { !$0.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !$0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            if !cleaned.isEmpty { return cleaned }
        }
        // Nothing configured yet means the workspace has never touched these rows,
        // so the trade it signed up as picks them — a phone shop should not start
        // on Hallmark and Stones.
        return RepairIntakePresets.fields(forBusinessType: businessType)
    }

    var communicationChannelLabels: [String] { normalizedCommunicationChannelLabels(from: communicationChannelLabelsJSON) }
    private var orderExtraNoteSectionsKey: String { "orderExtraNoteSectionsJSON" }
    private var orderExtraNoteSections: [CustomStepDTO] {
        let raw = (siparis.customFields?[orderExtraNoteSectionsKey] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty,
              let data = raw.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([CustomStepDTO].self, from: data) else { return [] }
        return decoded.filter { $0.id != primarySpecialNoteID && !$0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }
    var specialNoteSections: [CustomStepDTO] {
        let globals = normalizedSpecialNoteSections(from: specialNoteSectionsJSON)
        let globalIDs = Set(globals.map { $0.id })
        return globals + orderExtraNoteSections.filter { !globalIDs.contains($0.id) }
    }
    private func saveOrderExtraNoteSections(_ items: [CustomStepDTO]) {
        var current = siparis.customFields ?? [:]
        let cleaned = items.filter { $0.id != primarySpecialNoteID && !$0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if cleaned.isEmpty {
            current.removeValue(forKey: orderExtraNoteSectionsKey)
        } else if let data = try? JSONEncoder().encode(cleaned),
                  let str = String(data: data, encoding: .utf8) {
            current[orderExtraNoteSectionsKey] = str
        }
        // Update local UI immediately
        siparis.customFields = current
        // Surgical Firestore update — only customFields field, no full doc replace.
        if let sid = siparis.id { firebaseManager.updateSiparisCustomFields(sid, customFields: current) }
    }
    private func addPerOrderNoteSection() {
        let nextIndex = specialNoteSections.count + 1
        let placeholder = t("Special Note", lang: seciliDil) + " \(nextIndex)"
        saveOrderExtraNoteSections(orderExtraNoteSections + [CustomStepDTO(title: placeholder)])
    }
    var customTogglesList: [CustomStepDTO] { if let data = customTogglesJSON.data(using: .utf8), let dec = try? JSONDecoder().decode([CustomStepDTO].self, from: data) { return dec }; return [] }
    var materialsTogglesList: [CustomStepDTO] { if let data = materialsTogglesJSON.data(using: .utf8), let dec = try? JSONDecoder().decode([CustomStepDTO].self, from: data) { return dec }; return [] }
    var materialsDefaultCheckLabels: [String] {
        let trimmed = materialsDefaultChecksJSON.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty,
           let data = trimmed.data(using: .utf8),
           let decoded = try? JSONDecoder().decode([CustomStepDTO].self, from: data) {
            let labels = decoded.map { $0.title.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
            if !labels.isEmpty { return labels }
        }
        return [invLabel1, invLabel2, invLabel3, invLabel4]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }
    var financialExpenseItems: [CustomStepDTO] { if let data = financialExpenseItemsJSON.data(using: .utf8), let dec = try? JSONDecoder().decode([CustomStepDTO].self, from: data) { return dec.filter { isUsableFinancialExpenseTitle($0.title) } }; return [] }
    var financialRemainingItems: [CustomStepDTO] { if let data = financialRemainingItemsJSON.data(using: .utf8), let dec = try? JSONDecoder().decode([CustomStepDTO].self, from: data) { return dec.filter { isUsableFinancialRemainingTitle($0.title) } }; return [] }

    // Spending / Remaining headings are PER-ORDER: each order keeps its own list
    // in customFields, seeded from the workspace template the first time it is
    // edited. The workspace financialExpense/RemainingItemsJSON only seed new or
    // not-yet-customised orders. Amounts stay keyed by title; renaming an item
    // moves its amount key so the value follows the rename (see the editor save).
    var orderExpenseItemsKey: String { "orderExpenseItemsJSON" }
    var orderRemainingItemsKey: String { "orderRemainingItemsJSON" }
    private func decodeOrderFinancialItems(_ raw: String?, usable: (String) -> Bool) -> [CustomStepDTO]? {
        guard let raw = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty,
              let data = raw.data(using: .utf8),
              let dec = try? JSONDecoder().decode([CustomStepDTO].self, from: data) else { return nil }
        return dec.filter { usable($0.title) }
    }
    var orderExpenseItems: [CustomStepDTO] {
        decodeOrderFinancialItems(siparis.customFields?[orderExpenseItemsKey], usable: isUsableFinancialExpenseTitle) ?? financialExpenseItems
    }
    var orderRemainingItems: [CustomStepDTO] {
        decodeOrderFinancialItems(siparis.customFields?[orderRemainingItemsKey], usable: isUsableFinancialRemainingTitle) ?? financialRemainingItems
    }
    // Persist a per-order spending/remaining list edit onto the order. Amounts are
    // keyed by title, so when an item is renamed (same id, new title) its stored
    // amount is moved to the new key — the value follows the rename, per order.
    private func saveOrderFinancialItems(newJSON: String, key: String, amountPrefix: String, workspaceItems: [CustomStepDTO]) {
        var current = siparis.customFields ?? [:]
        let oldItems = decodeOrderFinancialItems(current[key], usable: { _ in true }) ?? workspaceItems
        let newItems = (try? JSONDecoder().decode([CustomStepDTO].self, from: Data(newJSON.utf8))) ?? []
        let oldTitleByID = Dictionary(oldItems.map { ($0.id, $0.title) }, uniquingKeysWith: { first, _ in first })
        for item in newItems {
            guard let oldTitle = oldTitleByID[item.id], oldTitle != item.title else { continue }
            let oldKey = amountPrefix + oldTitle
            let newKey = amountPrefix + item.title
            if let amount = current[oldKey] {
                current[newKey] = amount
                current.removeValue(forKey: oldKey)
            }
        }
        if newJSON.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            current.removeValue(forKey: key)
        } else {
            current[key] = newJSON
        }
        siparis.customFields = current
        if let sid = siparis.id { firebaseManager.updateSiparisCustomFields(sid, customFields: current) }
    }

    // Per-order base-cost-field label (the "default base cost" heading at the top
    // of the editor). Overridden on the order, falling back to the workspace label.
    var orderBaseCostLabelKey: String { "orderBaseCostLabel" }
    var orderBaseCostLabel: String {
        let override = (siparis.customFields?[orderBaseCostLabelKey] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return override.isEmpty ? financialBaseCostLabel : override
    }
    func setOrderBaseCostLabel(_ newValue: String) {
        var current = siparis.customFields ?? [:]
        let cleaned = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.isEmpty || cleaned == financialBaseCostLabel { current.removeValue(forKey: orderBaseCostLabelKey) }
        else { current[orderBaseCostLabelKey] = cleaned }
        siparis.customFields = current
        if let sid = siparis.id { firebaseManager.updateSiparisCustomFields(sid, customFields: current) }
    }

    // Inline rename of one per-order spending/remaining heading from the card.
    func renameOrderFinancialItem(id: UUID, newTitle: String, key: String, amountPrefix: String, workspaceItems: [CustomStepDTO]) {
        let cleaned = newTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return }
        var items = decodeOrderFinancialItems(siparis.customFields?[key], usable: { _ in true }) ?? workspaceItems
        guard let idx = items.firstIndex(where: { $0.id == id }), items[idx].title != cleaned else { return }
        items[idx].title = cleaned
        let json = (try? JSONEncoder().encode(items)).flatMap { String(data: $0, encoding: .utf8) } ?? ""
        saveOrderFinancialItems(newJSON: json, key: key, amountPrefix: amountPrefix, workspaceItems: workspaceItems)
    }

    // Add a new per-order spending/remaining heading from the card's + button.
    // Generates a unique non-placeholder title so it renders and its amount key
    // does not collide; the user renames it inline straight away.
    func addOrderFinancialItem(key: String, workspaceItems: [CustomStepDTO], defaultBase: String) {
        var items = decodeOrderFinancialItems(siparis.customFields?[key], usable: { _ in true }) ?? workspaceItems
        var n = items.count + 1
        var title = "\(defaultBase) \(n)"
        while items.contains(where: { $0.title.caseInsensitiveCompare(title) == .orderedSame }) {
            n += 1
            title = "\(defaultBase) \(n)"
        }
        items.append(CustomStepDTO(title: title))
        let json = (try? JSONEncoder().encode(items)).flatMap { String(data: $0, encoding: .utf8) } ?? ""
        saveOrderFinancialItems(newJSON: json, key: key, amountPrefix: "", workspaceItems: workspaceItems)
    }

    // Remove one per-order spending/remaining heading from the card. Clears its
    // amount and writes the remaining list (even when empty, so the order does not
    // fall back to the workspace template after the user deletes everything).
    func removeOrderFinancialItem(id: UUID, key: String, amountPrefix: String, workspaceItems: [CustomStepDTO]) {
        var items = decodeOrderFinancialItems(siparis.customFields?[key], usable: { _ in true }) ?? workspaceItems
        guard let idx = items.firstIndex(where: { $0.id == id }) else { return }
        let removedTitle = items[idx].title
        items.remove(at: idx)
        var current = siparis.customFields ?? [:]
        current.removeValue(forKey: amountPrefix + removedTitle)
        current[key] = (try? JSONEncoder().encode(items)).flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
        siparis.customFields = current
        if let sid = siparis.id { firebaseManager.updateSiparisCustomFields(sid, customFields: current) }
    }

    @ViewBuilder
    private var orderDetailHeader: some View {
        #if os(iOS)
        orderDetailHeaderContent
            .sheet(isPresented: $showWidgetMenu) {
                GeometryReader { geo in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            HStack {
                                Text(t("Customize", lang: seciliDil))
                                    .font(.system(size: isCompactPhoneLayout ? 18 : 20, weight: .bold))
                                    .foregroundColor(.primary)

                                Spacer()

                                Button(t("Done", lang: seciliDil)) {
                                    showWidgetMenu = false
                                }
                                .buttonStyle(.borderedProminent)
                                .controlSize(isCompactPhoneLayout ? .small : .regular)
                            }
                            .padding(.bottom, 2)

                            customizePopoverContent
                        }
                        .padding(.horizontal, isCompactPhoneLayout ? 14 : 24)
                        .padding(.vertical, isCompactPhoneLayout ? 14 : 22)
                        .frame(
                            maxWidth: isCompactPhoneLayout ? max(0, geo.size.width - 20) : min(540, max(0, geo.size.width - 80)),
                            alignment: .leading
                        )
                        .frame(maxWidth: .infinity, alignment: .center)
                    }
                    .frame(width: geo.size.width, height: geo.size.height)
                    .background(colorScheme == .dark ? Color(white: 0.08) : Color(white: 0.96))
                }
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
            }
        #else
        orderDetailHeaderContent
            .popover(isPresented: $showWidgetMenu, arrowEdge: .bottom) {
                ScrollViewReader { scrollProxy in
                    ZStack(alignment: .topTrailing) {
                        ScrollView(.vertical, showsIndicators: true) {
                            customizePopoverContent
                        }
                        .frame(width: CGFloat(540), height: CGFloat(680), alignment: .topLeading)
                        .onAppear {
                            scrollCustomizePopoverToFinancialIfNeeded(scrollProxy)
                        }

                        if shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 4 {
                            StudioFirstRunGuideBubble(
                                stepText: "5 / 7",
                                title: t("Turn on Financial Info", lang: seciliDil),
                                message: t("Enable the Financial Info card here. It will appear in the project workspace.", lang: seciliDil),
                                primaryTitle: nil,
                                secondaryTitle: t("Skip", lang: seciliDil),
                                onPrimary: nil,
                                onSkip: completeMacFirstProjectGuide
                            )
                            .padding(.top, 16)
                            .padding(.trailing, 16)
                            .zIndex(999)
                        }
                    }
                    .frame(width: CGFloat(540), height: CGFloat(680), alignment: .topLeading)
                    .zIndex(999)
                }
            }
        #endif
    }

    private var orderDetailHeaderContent: some View {
        HStack(spacing: isPhoneLayout ? 8 : 12) {
            orderDetailTitle

            #if os(macOS)
            if !isPhoneLayout {
                orderDetailHeaderMeta
            }
            #endif

            Spacer(minLength: 8)

            if isPhoneLayout {
                phoneCompactToggleButton
            }
            cardLayoutLockButton
            orderDetailActionsMenu
        }
        .overlay(alignment: .topTrailing) {
            if shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 3 {
                StudioFirstRunGuideBubble(
                    stepText: "4 / 7",
                    title: t("Open Actions", lang: seciliDil),
                    message: t("Click Actions in the top-right corner, then choose Customize.", lang: seciliDil),
                    primaryTitle: nil,
                    secondaryTitle: t("Skip", lang: seciliDil),
                    onPrimary: nil,
                    onSkip: completeMacFirstProjectGuide
                )
                .padding(.top, 44)
                .zIndex(999)
            }
        }
        .zIndex(999)
        .padding(.horizontal, isPhoneLayout ? 12 : 20)
        .padding(.vertical, isPhoneLayout ? 7 : 14)
        .background(colorScheme == .dark ? Color(white: 0.08) : Color.white.opacity(0.92))
        #if os(macOS)
        .contextMenu {
            orderDetailHeaderDetailsMenu
        }
        #endif
    }

    private var orderDetailDisplayName: String {
        let cleaned = siparis.customerName.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.isEmpty || cleaned == "New Order" || cleaned == "New Project" || cleaned == "Yeni Sipariş" || cleaned == "Yeni Proje" {
            return t("New Project", lang: seciliDil)
        }
        return cleaned
    }

    private var orderDetailTitle: some View {
        Text(orderDetailDisplayName)
            .font(.system(size: isPhoneLayout ? 16 : 22, weight: .bold))
            .foregroundColor(isHoveringTitle ? .blue : .primary)
            .lineLimit(1)
            .truncationMode(.tail)
            .minimumScaleFactor(isPhoneLayout ? 0.82 : 0.90)
            .contentShape(Rectangle())
            .onHover { hover in
                if !siparis.customerName.isEmpty {
                    isHoveringTitle = hover
                    if hover {
                        PlatformCursor.pointingHandPush()
                    } else {
                        PlatformCursor.pop()
                    }
                }
            }
            .onTapGesture {
                if !siparis.customerName.isEmpty,
                   let m = firebaseManager.musteriler.first(where: { $0.name.lowercased() == siparis.customerName.lowercased() }) {
                    seciliMusteri = m
                    withAnimation { aktifSekme = "Customers" }
                }
            }
            .frame(maxWidth: isPhoneLayout ? .infinity : 420, alignment: .leading)
    }

    private var orderDetailNextScheduleItem: ScheduleAlertItem? {
        let now = Date()
        return activeScheduleItems.sorted { first, second in
            let firstOverdue = first.dueAt < now
            let secondOverdue = second.dueAt < now
            if firstOverdue != secondOverdue { return firstOverdue }
            return first.dueAt < second.dueAt
        }.first
    }

    private var orderDetailHeaderMeta: some View {
        HStack(spacing: 10) {
            if orderDetailHeaderShowUpcomingSchedule, let schedule = orderDetailNextScheduleItem {
                orderDetailHeaderChip(
                    icon: "bell.badge.fill",
                    text: "\(schedule.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? lt("Reminder") : schedule.title) · \(scheduleRelativeText(schedule))",
                    color: scheduleStatusColor(schedule)
                )
            }

            if orderDetailHeaderShowDeliveryTime {
                orderDetailHeaderChip(
                    icon: "calendar.badge.clock",
                    text: privacyDigits(kalanGunMetni(siparis: siparis), hideNumbers: hideSensitiveNumbers),
                    color: kalanGunRengi(siparis: siparis)
                )
            }

            if orderDetailHeaderShowOrderValue && canAccessFinancialInfo {
                orderDetailHeaderChip(
                    icon: "sterlingsign.circle.fill",
                    text: privacyCurrency(siparis.salesTotal, symbol: seciliParaBirimi, ondalik: seciliOndalik, hideNumbers: hideSensitiveNumbers),
                    color: .green
                )
            }
        }
        .lineLimit(1)
        .fixedSize(horizontal: true, vertical: false)
    }

    private func orderDetailHeaderChip(icon: String, text: String, color: Color) -> some View {
        HStack(spacing: 7) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .bold))
            Text(text)
                .font(.system(size: 13.5, weight: .bold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .truncationMode(.tail)
        }
        .foregroundColor(color)
        .padding(.horizontal, 11)
        .padding(.vertical, 7)
        .background(color.opacity(0.16))
        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .stroke(color.opacity(0.28), lineWidth: 1)
        )
        .frame(maxWidth: 230, alignment: .leading)
    }

    @ViewBuilder
    private var orderDetailHeaderDetailsMenu: some View {
        Menu {
            Button { orderDetailHeaderShowDeliveryTime.toggle() } label: {
                Label(t("Delivery Time", lang: seciliDil), systemImage: orderDetailHeaderShowDeliveryTime ? "checkmark.circle.fill" : "circle")
            }
            Button { orderDetailHeaderShowUpcomingSchedule.toggle() } label: {
                Label(t("Upcoming Schedule", lang: seciliDil), systemImage: orderDetailHeaderShowUpcomingSchedule ? "checkmark.circle.fill" : "circle")
            }
            if canAccessFinancialInfo {
                Button { orderDetailHeaderShowOrderValue.toggle() } label: {
                    Label(t("Order Value", lang: seciliDil), systemImage: orderDetailHeaderShowOrderValue ? "checkmark.circle.fill" : "circle")
                }
            }
        } label: {
            Label(t("Order Header Details", lang: seciliDil), systemImage: "rectangle.topthird.inset.filled")
        }
    }

    private var canToggleCardLayoutLock: Bool {
        authVM.currentPlanEntitlements.cardCustomizationEnabled
    }

    private var cardLayoutAppearsLocked: Bool {
        workspaceCardsLocked || !canToggleCardLayoutLock
    }

    private func enforceCardLayoutLockForCurrentPlan() {
        guard !canToggleCardLayoutLock, workspaceCardsLocked == false else { return }
        workspaceCardsLocked = true
        draggedKart = nil
        CardDragCoordinator.shared.endSession()
    }

    private var cardLayoutLockButton: some View {
        Button {
            guard canToggleCardLayoutLock else {
                withAnimation(.snappy) {
                    workspaceCardsLocked = true
                    draggedKart = nil
                }
                CardDragCoordinator.shared.endSession()
                PlatformCursor.arrowSet()
                showCardLayoutLockedByPlanAlert = true
                return
            }

            withAnimation(.snappy) {
                workspaceCardsLocked.toggle()
                draggedKart = nil
            }
            CardDragCoordinator.shared.endSession()
            PlatformCursor.arrowSet()
        } label: {
            if isPhoneLayout {
                Image(systemName: cardLayoutAppearsLocked ? "lock.fill" : "lock.open.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(canToggleCardLayoutLock ? .secondary : .orange)
                    .frame(width: 34, height: 34)
                    .background((canToggleCardLayoutLock ? Color.primary : Color.orange).opacity(canToggleCardLayoutLock ? 0.055 : 0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .stroke((canToggleCardLayoutLock ? Color.primary : Color.orange).opacity(cardLayoutAppearsLocked ? 0.22 : 0.08), lineWidth: 1)
                    )
            } else {
                HStack(spacing: 7) {
                    Image(systemName: cardLayoutAppearsLocked ? "lock.fill" : "lock.open.fill")
                    Text(t(cardLayoutAppearsLocked ? "Cards Locked" : "Cards Unlocked", lang: seciliDil))
                }
                .font(.system(size: 13, weight: .semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background((canToggleCardLayoutLock ? Color.primary : Color.orange).opacity(canToggleCardLayoutLock ? 0.055 : 0.12))
                .foregroundColor(canToggleCardLayoutLock ? .secondary : .orange)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke((canToggleCardLayoutLock ? Color.primary : Color.orange).opacity(cardLayoutAppearsLocked ? 0.22 : 0.08), lineWidth: 1)
                )
            }
        }
        .buttonStyle(.plain)
        .help(t(canToggleCardLayoutLock ? (cardLayoutAppearsLocked ? "Unlock cards" : "Lock cards") : "Card layout customisation is locked on the Free plan.", lang: seciliDil))
        .accessibilityLabel(t(cardLayoutAppearsLocked ? "Cards Locked" : "Cards Unlocked", lang: seciliDil))
    }

    private var orderDetailActionsMenu: some View {
        Menu {
            Button {
                showWidgetMenu = true
                loadMacFirstProjectGuideState()
                if shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 3 {
                    macFirstProjectGuideStep = 4
                    saveMacFirstProjectGuideState()
                }
            } label: {
                Label(t("Customize", lang: seciliDil), systemImage: "slider.horizontal.3")
            }

            Button {
                exportToPDF()
            } label: {
                Label(t("Export PDF", lang: seciliDil), systemImage: "doc.badge.plus")
            }

            Button {
                exportToInvoicePDF()
            } label: {
                Label(t("Invoice PDF", lang: seciliDil), systemImage: "doc.text.fill")
            }

        } label: {
            if isPhoneLayout {
                Image(systemName: "ellipsis.circle.fill")
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundColor(.blue)
                    .frame(width: 34, height: 34)
                    .background(Color.blue.opacity(0.10))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            } else {
                HStack(spacing: 7) {
                    Image(systemName: "ellipsis.circle")
                    Text(t("Actions", lang: seciliDil))
                }
                .font(.system(size: 13, weight: .bold))
                .padding(.horizontal, 13)
                .padding(.vertical, 8)
                .background(Color.blue.opacity(0.1))
                .foregroundColor(.blue)
                .cornerRadius(8)
            }
        }
        .studioFirstRunGuideHighlight(shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 3)
        .menuStyle(.borderlessButton)
    }

    private func previousOrderSnapshot(_ applyOldValue: (inout Siparis) -> Void) -> Siparis {
        var previous = siparis
        applyOldValue(&previous)
        return previous
    }

    private func saveOrderDetailChange(previousSiparis: Siparis) {
        if pendingOrderDetailPreviousSiparis == nil {
            pendingOrderDetailPreviousSiparis = previousSiparis
        }
        orderDetailAutosaveWorkItem?.cancel()

        let orderToSave = siparis
        let previous = pendingOrderDetailPreviousSiparis ?? previousSiparis
        let manager = firebaseManager
        let workItem = DispatchWorkItem {
            manager.updateSiparis(orderToSave, previousSiparis: previous)
            DispatchQueue.main.async {
                pendingOrderDetailPreviousSiparis = nil
                orderDetailAutosaveWorkItem = nil
            }
        }
        orderDetailAutosaveWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.65, execute: workItem)
    }

    private func flushOrderDetailAutosave() {
        orderDetailAutosaveWorkItem?.cancel()
        if let previous = pendingOrderDetailPreviousSiparis {
            firebaseManager.updateSiparis(siparis, previousSiparis: previous)
        }
        pendingOrderDetailPreviousSiparis = nil
        orderDetailAutosaveWorkItem = nil
    }

    private func isCustomerCustomFieldKey(_ key: String) -> Bool {
        if key == "communicationAddress" || key == "Address" || key == "communicationCustomerNotes" {
            return true
        }
        if key.hasPrefix("communicationChannel::") {
            return true
        }
        let customCustomerFields = Set(customFieldsList.map { $0.title.trimmingCharacters(in: .whitespacesAndNewlines) })
        return customCustomerFields.contains(key.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private func isSpecialNoteCustomFieldKey(_ key: String) -> Bool {
        key.trimmingCharacters(in: .whitespacesAndNewlines).lowercased().hasPrefix("specialnote::")
    }

    private func shouldAutosaveInlineCustomFields(previous: [String: String], next: [String: String]) -> Bool {
        let changedKeys = Set(previous.keys).union(Set(next.keys)).filter { previous[$0] != next[$0] }
        // Skip full-doc autosave for per-order note extras — they use a surgical updateData call instead.
        return changedKeys.contains { isCustomerCustomFieldKey($0) || isSpecialNoteCustomFieldKey($0) }
    }

    private var orderDetailAutosaveObservers: some View {
        Color.clear
            .frame(width: 0, height: 0)
            .onChange(of: siparis.customerName) { oldValue, _ in saveOrderDetailChange(previousSiparis: previousOrderSnapshot { $0.customerName = oldValue }) }
            .onChange(of: siparis.designName) { oldValue, _ in saveOrderDetailChange(previousSiparis: previousOrderSnapshot { $0.designName = oldValue }) }
            .onChange(of: siparis.lineItems) { oldValue, _ in saveOrderDetailChange(previousSiparis: previousOrderSnapshot { $0.lineItems = oldValue }) }
            .onChange(of: siparis.invoiceNote) { oldValue, _ in saveOrderDetailChange(previousSiparis: previousOrderSnapshot { $0.invoiceNote = oldValue }) }
            .onChange(of: siparis.emailAddress) { oldValue, _ in saveOrderDetailChange(previousSiparis: previousOrderSnapshot { $0.emailAddress = oldValue }) }
            .onChange(of: siparis.whatsappNumber) { oldValue, _ in saveOrderDetailChange(previousSiparis: previousOrderSnapshot { $0.whatsappNumber = oldValue }) }
            .onChange(of: siparis.instagramUsername) { oldValue, _ in saveOrderDetailChange(previousSiparis: previousOrderSnapshot { $0.instagramUsername = oldValue }) }
            .onChange(of: siparis.communication) { oldValue, _ in saveOrderDetailChange(previousSiparis: previousOrderSnapshot { $0.communication = oldValue }) }
            .onChange(of: siparis.paymentDate) { oldValue, _ in saveOrderDetailChange(previousSiparis: previousOrderSnapshot { $0.paymentDate = oldValue }) }
            .onChange(of: siparis.notes) { oldValue, _ in saveOrderDetailChange(previousSiparis: previousOrderSnapshot { $0.notes = oldValue }) }
            // Repair intake used to persist only via onDisappear: type into it, sit
            // still, and the next snapshot overwrote what was on screen.
            .onChange(of: siparis.orderType) { oldValue, _ in
                saveOrderDetailChange(previousSiparis: previousOrderSnapshot { $0.orderType = oldValue })
                // The order-TYPE layout follows the type live (web parity: the
                // layout subscription re-resolves on orderType). Read-side only.
                loadWorkspaceForCurrentOrderIfNeeded()
            }
            .onChange(of: siparis.repairIntake) { oldValue, _ in saveOrderDetailChange(previousSiparis: previousOrderSnapshot { $0.repairIntake = oldValue }) }
            .onChange(of: siparis.customFields ?? [:]) { oldValue, newValue in
                if shouldAutosaveInlineCustomFields(previous: oldValue, next: newValue) {
                    saveOrderDetailChange(previousSiparis: previousOrderSnapshot { $0.customFields = oldValue })
                }
            }
    }

    private func handleOrderDetailDisappear() {
        liveTrackingListener?.remove()
        liveTrackingListener = nil
        trackingAutoSyncWorkItem?.cancel()
        workspaceProfilesCloudListener?.remove()
        workspaceProfilesCloudListener = nil
        flushOrderDetailAutosave()
        if firebaseManager.siparisler.contains(where: { $0.id == siparis.id }) {
            firebaseManager.updateSiparis(siparis)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            orderDetailHeader
            Divider().background(Color.primary.opacity(0.1))

            ShopifyOrderSourceStrip(
                customFields: siparis.customFields ?? [:],
                isDispatched: siparis.isDispatched,
                language: seciliDil,
                workspaceCurrency: seciliParaBirimi
            )

            if isPhoneLayout {
                phoneCalismaAlani
            } else {
                calismaAlani
            }
        }
        .background(orderDetailAutosaveObservers)
        .onAppear { loadMacFirstProjectGuideState(forceReload: true); yukleSutunGenislikleri(); yukleHafiza(); enforceCardLayoutLockForCurrentPlan(); ensureSharedWorkspaceSnapshot(); loadWorkspaceProfiles(); loadWorkspaceUserProfiles(); migrateSharedWorkspaceProfilesIntoCurrentUserIfNeeded(); startWorkspaceProfilesCloudListener(); startLiveTrackingListener(); loadWorkspaceForCurrentOrderIfNeeded(); refreshSharedClientFilesInbox(); if siparis.taxRate == 0 { siparis.taxRate = defaultTaxRate }; otomatikKesintiHesapla(); enforceMacFirstProjectGuideCustomerOnlyVisibilityIfNeeded(persist: true); arrangeMacFirstProjectGuideFinancialCardLayoutIfNeeded(); scheduleOrphanCardRepairOnce() }
        .onOpenURL { url in
            let scheme = url.scheme?.lowercased() ?? ""
            if scheme == "studioflow" || scheme == "nivadesk" {
                refreshSharedClientFilesInbox()
                if !sharedClientFilesInbox.isEmpty {
                    clientFileMessage = t("Shared file is ready. Open the correct order and tap Add here.", lang: seciliDil)
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("StudioFlowMacFirstProjectGuideStateChanged"))) { _ in
            loadMacFirstProjectGuideState(forceReload: true)
            enforceMacFirstProjectGuideCustomerOnlyVisibilityIfNeeded(persist: false)
            arrangeMacFirstProjectGuideFinancialCardLayoutIfNeeded()
            yenileCalismaAlaniHitbox(delay: 0.01)
        }
        .onReceive(NotificationCenter.default.publisher(for: .cardSizeActionRequested)) { notification in
            handleCardSizeActionRequest(notification)
        }
        .onChange(of: siparis.id) { _, _ in startLiveTrackingListener(); loadWorkspaceForCurrentOrderIfNeeded(); otomatikKesintiHesapla(); enforceCardLayoutLockForCurrentPlan(); loadMacFirstProjectGuideState(forceReload: true); enforceMacFirstProjectGuideCustomerOnlyVisibilityIfNeeded(persist: false); arrangeMacFirstProjectGuideFinancialCardLayoutIfNeeded() }
        .onChange(of: authVM.currentBillingPlan) { _, _ in enforceCardLayoutLockForCurrentPlan() }
        .onChange(of: siparis.customFields?[orderWorkspaceLayoutKey]) { _, _ in loadWorkspaceForCurrentOrderIfNeeded() }
        .onChange(of: siparis.paymentDate) { _, yeniTarih in if taxMilestoneEnabled { let milat = Date(timeIntervalSince1970: taxMilestoneDate); let yeniTip = yeniTarih >= milat ? "Revenue" : "Profit"; if siparis.taxType != yeniTip { siparis.taxType = yeniTip; otomatikKesintiHesapla() } } }
        .onChange(of: siparis.status) { oldValue, newValue in recordOrderChangeAndUpdate(title: t("Order Status", lang: seciliDil), oldValue: oldValue, newValue: newValue) }
        .onChange(of: siparis.designStatus) { oldValue, newValue in recordOrderChangeAndUpdate(title: t("Design Status", lang: seciliDil), oldValue: oldValue, newValue: newValue) }
        .onChange(of: siparis.priority) { oldValue, newValue in recordOrderChangeAndUpdate(title: "Priority", oldValue: oldValue, newValue: newValue) }
        .onChange(of: siparis.risk) { oldValue, newValue in recordOrderChangeAndUpdate(title: "Risk", oldValue: oldValue, newValue: newValue) }
        .onChange(of: siparis.riskReason) { _, _ in firebaseManager.updateSiparis(siparis) }
        .onChange(of: siparis.notes) { oldValue, newValue in if oldValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !newValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { recordOrderHistoryEvent(title: "Note added", value: "Special Notes"); firebaseManager.updateSiparis(siparis) } }
        .onChange(of: sutunGenislikleri) { _, _ in yenileCalismaAlaniHitbox(delay: 0.01) }
        .onDisappear(perform: handleOrderDetailDisappear)
        .alert(t("Upload Policy", lang: seciliDil), isPresented: $showUploadSafetyPrompt) {
            Button(t("Cancel", lang: seciliDil), role: .cancel) {
                pendingUploadSafetyURL = nil
                pendingUploadSafetySource = "order_preview"
            }
            Button(t("I Agree and Upload", lang: seciliDil)) {
                uploadSafetyPolicyAccepted = true
                if let url = pendingUploadSafetyURL {
                    if pendingUploadSafetySource == "client_file" {
                        clientFileBulutaYukle(url: url)
                    } else {
                        goruntuBulutaYukle(url: url)
                    }
                }
                pendingUploadSafetyURL = nil
                pendingUploadSafetySource = "order_preview"
            }
        } message: {
            Text(t("Before uploading, confirm that this file is legal, safe, client-approved when needed, and suitable for this workspace.", lang: seciliDil))
        }
        .alert(t("Upload blocked", lang: seciliDil), isPresented: $showUploadSafetyError) {
            Button(t("OK", lang: seciliDil), role: .cancel) { }
        } message: {
            Text(uploadSafetyErrorMessage)
        }
        .alert(t("Cards are locked", lang: seciliDil), isPresented: $showCardLayoutLockedByPlanAlert) {
            Button(t("OK", lang: seciliDil), role: .cancel) { }
        } message: {
            Text(t("Card layout customisation is locked on the Free plan. You can use the cards, but moving, resizing and colour/layout changes are available from Lite and above.", lang: seciliDil))
        }
        .sheet(item: $pdfShareItem) { item in
            #if os(iOS)
            FileShareSheet(url: item.url)
            #else
            EmptyView()
            #endif
        }
        .sheet(item: $clientFilePreviewItem) { item in
            ClientFilePreviewSheet(
                items: clientFileItems,
                initialItemID: item.id,
                language: seciliDil,
                isAvailableOffline: { firebaseManager.isClientFileAvailableOffline($0) },
                offlineURLProvider: { firebaseManager.offlineClientFileURL(for: $0) },
                onDownload: { downloadClientFileToUserLocation($0) },
                onMakeOffline: { makeClientFileAvailableOffline($0) },
                onOpenExternal: { openClientFileExternally($0) }
            )
        }
        .sheet(item: $headingEditorTarget) { kart in
            BlockHeadingsEditorSheet(
                kartTipi: kart,
                customStepsJSON: $customStepsJSON,
                customFieldsJSON: $customFieldsJSON,
                financialExpenseItemsJSON: $financialExpenseItemsJSON,
                financialRemainingItemsJSON: $financialRemainingItemsJSON,
                financialShowBaseCost: $financialShowBaseCost,
                financialBaseCostLabel: $financialBaseCostLabel,
                summaryStep1: $summaryStep1,
                summaryStep2: $summaryStep2,
                orderListStep1: $orderListStep1,
                orderListStep2: $orderListStep2,
                orderItemsHeading: $orderItemsHeading,
                companyNumbersJSON: $companyNumbersJSON,
                invLabel1: $invLabel1,
                invLabel2: $invLabel2,
                invLabel3: $invLabel3,
                invLabel4: $invLabel4,
                materialsTogglesJSON: $materialsTogglesJSON,
                materialsDefaultChecksJSON: $materialsDefaultChecksJSON,
                communicationShowTelephone: $communicationShowTelephone,
                communicationShowEmail: $communicationShowEmail,
                communicationShowAddress: $communicationShowAddress,
                communicationShowChannel: $communicationShowChannel,
                communicationShowCustomerNotes: $communicationShowCustomerNotes,
                communicationChannelLabelsJSON: $communicationChannelLabelsJSON,
                specialNoteSectionsJSON: $specialNoteSectionsJSON,
                repairIntakeFieldsJSON: $repairIntakeFieldsJSON,
                orderExtraNoteSectionsJSON: Binding(
                    get: { siparis.customFields?[orderExtraNoteSectionsKey] ?? "" },
                    set: { newValue in
                        var current = siparis.customFields ?? [:]
                        if newValue.isEmpty { current.removeValue(forKey: orderExtraNoteSectionsKey) }
                        else { current[orderExtraNoteSectionsKey] = newValue }
                        siparis.customFields = current
                        if let sid = siparis.id { firebaseManager.updateSiparisCustomFields(sid, customFields: current) }
                    }
                ),
                orderFinancialExpenseItemsJSON: Binding(
                    get: { siparis.customFields?[orderExpenseItemsKey] ?? "" },
                    set: { newValue in saveOrderFinancialItems(newJSON: newValue, key: orderExpenseItemsKey, amountPrefix: "financialExpense::", workspaceItems: financialExpenseItems) }
                ),
                orderFinancialRemainingItemsJSON: Binding(
                    get: { siparis.customFields?[orderRemainingItemsKey] ?? "" },
                    set: { newValue in saveOrderFinancialItems(newJSON: newValue, key: orderRemainingItemsKey, amountPrefix: "financialRemaining::", workspaceItems: financialRemainingItems) }
                ),
                orderFinancialBaseCostLabel: Binding(
                    get: { orderBaseCostLabel },
                    set: { newValue in setOrderBaseCostLabel(newValue) }
                )
            )
        }
    }
    

    @ViewBuilder
    private var workspaceLayoutModeButtons: some View {
        if isCurrentOrderIndependent {
            Button {
                saveCurrentLayoutForOrder(showMessage: true)
            } label: {
                Label(t("Save this order", lang: seciliDil), systemImage: "tray.and.arrow.down")
            }

            Button {
                resetCurrentOrderLayoutToShared()
            } label: {
                Label(t("Rejoin shared", lang: seciliDil), systemImage: "arrow.triangle.2.circlepath")
            }
        } else {
            Button {
                detachCurrentOrderFromShared()
            } label: {
                Label(t("Make this order independent", lang: seciliDil), systemImage: "square.on.square.dashed")
            }

            Button {
                saveSharedLayout(showMessage: true)
            } label: {
                Label(t("Save shared", lang: seciliDil), systemImage: "tray.and.arrow.down")
            }
        }
    }

    private func workspaceProfileNameField(index: Int) -> some View {
        TextField(
            t("Profile name", lang: seciliDil),
            text: Binding(
                get: {
                    workspaceProfiles.indices.contains(index) ? workspaceProfiles[index].name : ""
                },
                set: { newName in
                    guard workspaceProfiles.indices.contains(index) else { return }
                    workspaceProfiles[index].name = newName
                    saveWorkspaceProfilesToStorage()
                }
            )
        )
        .textFieldStyle(.roundedBorder)
        .font(.system(size: 12, weight: .semibold))
        .frame(minWidth: isCompactPhoneLayout ? 0 : 120)
    }

    @ViewBuilder
    private func workspaceProfileActionButtons(index: Int) -> some View {
        Button(t("Save", lang: seciliDil)) {
            saveWorkspaceProfile(at: index)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.small)

        Button(t("Load", lang: seciliDil)) {
            loadWorkspaceProfile(at: index)
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .disabled(!workspaceProfiles.indices.contains(index) || workspaceProfiles[index].snapshotJSON.isEmpty)

        Button(role: .destructive) {
            deleteWorkspaceProfile(at: index)
        } label: {
            Image(systemName: "trash")
        }
        .buttonStyle(.borderless)
        .controlSize(.small)
        .disabled(workspaceProfiles.count <= 1)
    }

    @ViewBuilder
    private func workspaceUserProfileRow(index: Int) -> some View {
        if workspaceUserProfiles.indices.contains(index) {
            let profile = workspaceUserProfiles[index]
            let isMine = profile.userId == currentWorkspaceProfileUserId

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) {
                    workspaceUserProfileLabel(profile, isMine: isMine)
                    Spacer(minLength: 4)
                    workspaceUserProfileButtons(index: index, isMine: isMine)
                }

                VStack(alignment: .leading, spacing: 8) {
                    workspaceUserProfileLabel(profile, isMine: isMine)
                    workspaceUserProfileButtons(index: index, isMine: isMine)
                }
            }
            .padding(8)
            .background(isMine ? Color.blue.opacity(0.08) : Color.gray.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
    }

    private func workspaceUserProfileLabel(_ profile: WorkspaceUserProfileDTO, isMine: Bool) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                Text(workspaceUserProfileDisplayName(profile))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.primary)
                    .lineLimit(1)

                if isMine {
                    Text(t("Mine", lang: seciliDil))
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.blue)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.blue.opacity(0.12))
                        .clipShape(Capsule())
                }
            }

            Text(workspaceUserProfileSubtitle(profile))
                .font(.system(size: 10))
                .foregroundColor(.secondary)
                .lineLimit(1)
        }
    }

    private func workspaceUserProfileButtons(index: Int, isMine: Bool) -> some View {
        HStack(spacing: 8) {
            let isFollowingThisProfile = workspaceUserProfiles.indices.contains(index) && workspaceUserProfiles[index].userId == workspaceFollowedTeamProfileUserId

            Button(isMine ? t("Load", lang: seciliDil) : (isFollowingThisProfile ? t("Synced", lang: seciliDil) : t("Sync", lang: seciliDil))) {
                loadWorkspaceUserProfile(at: index)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(!workspaceUserProfiles.indices.contains(index) || workspaceUserProfiles[index].snapshotJSON.isEmpty)
        }
    }

    private func teamWorkspaceUserProfileIndicesForDisplay() -> [Int] {
        workspaceUserProfiles.indices.filter { index in
            workspaceUserProfiles[index].userId != currentWorkspaceProfileUserId
        }
    }

    private func customizePopoverScrollID(for kart: KartTipi) -> String {
        "workspace-block-\(kart.rawValue)"
    }

    private func scrollCustomizePopoverToFinancialIfNeeded(_ proxy: ScrollViewProxy) {
        guard shouldShowMacFirstProjectGuide, macFirstProjectGuideStep == 4 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
            withAnimation(.easeInOut(duration: 0.28)) {
                proxy.scrollTo(customizePopoverScrollID(for: .financial), anchor: .center)
            }
        }
    }

    private var customizePopoverContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text(t("Workspace Customization", lang: seciliDil))
                    .font(.system(size: isCompactPhoneLayout ? 18 : 20, weight: .bold))
                    .foregroundColor(.primary)

                Text(t("Choose which blocks are visible and manage the layout for this order.", lang: seciliDil))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            customizeSectionCard {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 10) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill((isCurrentOrderIndependent ? studioWarningOrange : Color.blue).opacity(0.14))
                                .frame(width: 38, height: 38)

                            Image(systemName: isCurrentOrderIndependent ? "lock.open.fill" : "square.stack.3d.up")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(isCurrentOrderIndependent ? studioWarningOrange : .blue)
                        }

                        VStack(alignment: .leading, spacing: 2) {
                            Text(t("Workspace Customization", lang: seciliDil))
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.primary)

                            Text(isCurrentOrderIndependent
                                 ? t("This order has its own layout", lang: seciliDil)
                                 : t("This order uses the shared layout", lang: seciliDil))
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.primary)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        Spacer(minLength: 0)
                    }

                    Text(isCurrentOrderIndependent
                         ? t("Changes you make here will affect only this order. Other orders continue using the shared layout.", lang: seciliDil)
                         : t("Changes you make here update the shared layout for all normal orders. You can separate only this order whenever needed.", lang: seciliDil))
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 8) {
                            workspaceLayoutModeButtons
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            workspaceLayoutModeButtons
                        }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
            }

            customizeSectionCard {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(t("Layout Profiles", lang: seciliDil))
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.primary)

                            Text(t("Save and load different card layout presets for this order area.", lang: seciliDil))
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        Spacer()

                        Button {
                            addWorkspaceProfile()
                        } label: {
                            Label(t("Add", lang: seciliDil), systemImage: "plus")
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                    }

                    ForEach(workspaceProfiles.indices, id: \.self) { index in
                        ViewThatFits(in: .horizontal) {
                            HStack(spacing: 8) {
                                workspaceProfileNameField(index: index)
                                workspaceProfileActionButtons(index: index)
                            }

                            VStack(alignment: .leading, spacing: 8) {
                                workspaceProfileNameField(index: index)

                                HStack(spacing: 8) {
                                    workspaceProfileActionButtons(index: index)
                                }
                            }
                        }
                        .padding(10)
                        .background(Color.primary.opacity(colorScheme == .dark ? 0.12 : 0.05))
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                }
            }

            if !workspaceStatusMessage.isEmpty {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                    Text(workspaceStatusMessage)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.green)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Color.green.opacity(0.10))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }

            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(t("Workspace Blocks", lang: seciliDil))
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.primary)

                    Text(t("Show or hide the cards you want to see in the order detail workspace.", lang: seciliDil))
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                VStack(spacing: 10) {
                    ForEach(alphabeticalWorkspaceBlockCards) { kart in
                        workspaceBlockToggleRow(kart: kart)
                            .id(customizePopoverScrollID(for: kart))
                    }
                }
            }
        }
        .padding(isCompactPhoneLayout ? 14 : 18)
        .frame(maxWidth: isCompactPhoneLayout ? .infinity : 500, alignment: .leading)
    }

    @ViewBuilder
    private func customizeSectionCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .padding(14)
            .background(Color.primary.opacity(colorScheme == .dark ? 0.10 : 0.045))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(Color.primary.opacity(colorScheme == .dark ? 0.10 : 0.06), lineWidth: 1)
            )
    }

    private var alphabeticalWorkspaceBlockCards: [KartTipi] {
        let cards: [KartTipi] = [
            .preview,
            .summary,
            .customer,
            .invoiceItems,
            .materials,
            .priority,
            .delivery,
            .notes,
            .clientFiles,
            .todo,
            .workTime,
            .financial,
            .status,
            .shipping,
            .schedule,
            .historyLog,
            .repairIntake,
            .estimate,
            .customerPortal
        ]

        return cards
            .filter { kart in
                switch kart {
                case .clientFiles:
                    return canAccessClientFiles
                case .financial:
                    return canAccessFinancialInfo
                case .schedule:
                    return workspaceAccessAllows("schedule")
                default:
                    return true
                }
            }
            .sorted { first, second in
                workspaceBlockTitle(for: first)
                    .localizedCaseInsensitiveCompare(workspaceBlockTitle(for: second)) == .orderedAscending
            }
    }

    private func workspaceBlockTitle(for kart: KartTipi) -> String {
        switch kart {
        case .preview: return t("Preview", lang: seciliDil)
        case .summary: return t("Order Summary", lang: seciliDil)
        case .customer: return t("Customer & Communication", lang: seciliDil)
        case .delivery: return t("Delivery", lang: seciliDil)
        case .communication: return t("Communication", lang: seciliDil)
        case .notes: return t("Notes", lang: seciliDil)
        case .financial: return t("Financial Info", lang: seciliDil)
        case .status: return t("Production Status", lang: seciliDil)
        case .shipping: return t("Shipping & Tracking", lang: seciliDil)
        case .schedule: return lt("Schedule & Alerts")
        case .historyLog: return lt("History / Log")
        case .clientFiles: return t("Client Files", lang: seciliDil)
        case .todo: return t("To Do", lang: seciliDil)
        case .workTime: return t("Work Time", lang: seciliDil)
        case .customerNotes: return t("Customer Notes", lang: seciliDil)
        case .materials: return t("Materials & Inventory", lang: seciliDil)
        case .priority: return t("Priority / Risk", lang: seciliDil)
        case .invoiceItems: return resolvedItemsHeading
        case .repairIntake: return t("Repair Intake & Item", lang: seciliDil)
        case .estimate: return t("Estimate & Approval", lang: seciliDil)
        case .customerPortal: return t("Customer Portal", lang: seciliDil)
        }
    }

    private func cardHeaderIcon(for kart: KartTipi) -> String {
        switch kart {
        case .preview: return "photo"
        case .summary: return "doc.text"
        case .customer: return "person.crop.circle"
        case .delivery: return "calendar.badge.clock"
        case .communication: return "bubble.left.and.bubble.right"
        case .notes: return "note.text"
        case .financial: return getCurrencyIcon()
        case .status: return "paintbrush.pointed"
        case .shipping: return "airplane.departure"
        case .schedule: return "bell.badge.fill"
        case .historyLog: return "clock.arrow.circlepath"
        case .clientFiles: return "folder.badge.person.crop"
        case .todo: return "checklist"
        case .workTime: return "timer"
        case .customerNotes: return "person.text.rectangle"
        case .materials: return "shippingbox.circle.fill"
        case .priority: return "exclamationmark.triangle.fill"
        case .invoiceItems: return "list.bullet.rectangle"
        case .repairIntake: return "shippingbox"
        case .estimate: return "signature"
        case .customerPortal: return "person.crop.circle.badge.checkmark"
        }
    }

    private func workspaceBlockIcon(for kart: KartTipi) -> String {
        cardHeaderIcon(for: kart)
    }

    private func workspaceBlockAccent(for kart: KartTipi) -> Color {
        switch kart {
        case .preview: return .blue
        case .summary: return .indigo
        case .customer: return .teal
        case .delivery: return studioWarningOrange
        case .communication: return .mint
        case .notes: return .purple
        case .financial: return .green
        case .status: return .pink
        case .shipping: return .brown
        case .schedule: return studioWarningOrange
        case .historyLog: return .gray
        case .clientFiles: return .blue
        case .todo: return .purple
        case .workTime: return .blue
        case .customerNotes: return .cyan
        case .materials: return studioWarningOrange
        case .priority: return .red
        case .invoiceItems: return .green
        case .repairIntake: return studioWarningOrange
        case .estimate: return .green
        case .customerPortal: return .blue
        }
    }

    private func requiredPlanForCard(_ kart: KartTipi) -> StudioBillingPlan? {
        switch kart {
        case .materials, .historyLog:
            return .lifetimeLite
        case .clientFiles:
            return .proMonthly
        default:
            return nil
        }
    }

    private func isCardAllowedByPlan(_ kart: KartTipi) -> Bool {
        switch kart {
        case .financial:
            return authVM.currentPlanEntitlements.financialCardsEnabled
        case .materials:
            return authVM.currentPlanEntitlements.materialsInventoryCardsEnabled
        case .historyLog:
            return authVM.currentPlanEntitlements.historyLogEnabled
        case .clientFiles:
            return authVM.currentPlanEntitlements.clientFilesEnabled
        default:
            return true
        }
    }

    private func openPlanAccessFromLockedFeature() {
        settingsStartSection = "Plan & Access"
        withAnimation {
            aktifSekme = "Settings"
        }
    }

    private func requiredPlanLabel(for kart: KartTipi) -> String {
        t(requiredPlanForCard(kart)?.displayName ?? "", lang: seciliDil)
    }

    private func workspaceBlockToggleRow(kart: KartTipi) -> some View {
        HStack(spacing: 12) {
            Image(systemName: cardHeaderIcon(for: kart))
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(.secondary)
                .frame(width: 30, height: 30)

            VStack(alignment: .leading, spacing: 4) {
                Text(workspaceBlockTitle(for: kart))
                    .font(.system(size: isCompactPhoneLayout ? 15 : 16, weight: .semibold))
                    .foregroundColor(.primary)
                    .fixedSize(horizontal: false, vertical: true)

                if !isCardAllowedByPlan(kart), !requiredPlanLabel(for: kart).isEmpty {
                    HStack(spacing: 5) {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 9, weight: .bold))
                        Text(t("Available from", lang: seciliDil) + " " + requiredPlanLabel(for: kart))
                            .font(.system(size: 10, weight: .bold))
                    }
                    .foregroundColor(studioWarningOrange)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(studioWarningOrange.opacity(0.12))
                    .clipShape(Capsule())
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Toggle("", isOn: visibilityBinding(for: kart))
                .labelsHidden()
                .toggleStyle(.switch)
                .tint(.blue)
                .controlSize(.small)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Color.primary.opacity(colorScheme == .dark ? 0.10 : 0.045))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(
                    (shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 4 && kart == .financial)
                    ? Color.blue
                    : Color.primary.opacity(colorScheme == .dark ? 0.08 : 0.05),
                    lineWidth: (shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 4 && kart == .financial) ? 3 : 1
                )
        )
        .shadow(
            color: (shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 4 && kart == .financial) ? Color.blue.opacity(0.32) : .clear,
            radius: (shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 4 && kart == .financial) ? 12 : 0,
            x: 0,
            y: 0
        )
    }

    private var allCardsFlatUnique: [KartTipi] {
        var seen: Set<KartTipi> = []
        var result: [KartTipi] = []

        for column in kartYerlesimi {
            for kart in column where !seen.contains(kart) {
                seen.insert(kart)
                result.append(kart)
            }
        }

        return result
    }

    private var normalizedPhoneKartSirasiValue: [KartTipi] {
        let allCards = allCardsFlatUnique
        var seen: Set<KartTipi> = []
        var result: [KartTipi] = []

        let storedCards = phoneKartSirasi.isEmpty ? decodedPhoneKartSirasi() : phoneKartSirasi

        for kart in storedCards where allCards.contains(kart) && !seen.contains(kart) {
            seen.insert(kart)
            result.append(kart)
        }

        for kart in allCards where !seen.contains(kart) {
            seen.insert(kart)
            result.append(kart)
        }

        return result
    }

    private var visiblePhoneCards: [KartTipi] {
        normalizedPhoneKartSirasiValue.filter { isCardVisible($0) }
    }

    private var phoneCalismaAlani: some View {
        ScrollViewReader { scrollProxy in
        ScrollView(.vertical, showsIndicators: true) {
            LazyVStack(spacing: phoneOrderCompactView ? 8 : 14) {
                if phoneOrderCompactView {
                    ForEach(visiblePhoneCards.filter { phoneCardHasContent($0) }) { kart in
                        phoneCompactCardRow(kart, scrollProxy: scrollProxy)
                    }
                } else {
                    ForEach(visiblePhoneCards) { kart in
                        kartGosterici(icin: kart, colIndex: 0)
                            .frame(maxWidth: .infinity)
                            .id("phoneOrderCard_\(kart.rawValue)")
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .top)
        }
        .background(bgMainForPhone)
        .onAppear {
            normalizePhoneKartSirasi()
            scrollToPendingNotificationCardIfNeeded(scrollProxy)
        }
        .onChange(of: kartYerlesimi) { _, _ in
            normalizePhoneKartSirasi()
        }
        .onChange(of: phoneKartSirasiJSON) { _, _ in
            if let decoded = try? JSONDecoder().decode([KartTipi].self, from: Data(phoneKartSirasiJSON.utf8)) {
                phoneKartSirasi = decoded
                normalizePhoneKartSirasi()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .phoneCardMoveRequested)) { notification in
            handlePhoneCardMoveRequest(notification)
        }
        }
    }

    // Delivery push tapped: bring the requested card (Shipping & Tracking) into
    // view once the phone card list appears.
    private func scrollToPendingNotificationCardIfNeeded(_ scrollProxy: ScrollViewProxy) {
        let defaults = UserDefaults.standard
        let raw = (defaults.string(forKey: "pendingOpenOrderCard") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty, let kart = KartTipi(rawValue: raw) else { return }
        defaults.removeObject(forKey: "pendingOpenOrderCard")
        guard visiblePhoneCards.contains(kart) else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            withAnimation(.easeInOut(duration: 0.55)) {
                scrollProxy.scrollTo("phoneOrderCard_\(kart.rawValue)", anchor: .top)
            }
        }
    }

    // MARK: - Phone compact (one-line) card overview

    private var phoneCompactToggleButton: some View {
        Button {
            withAnimation(.snappy) { phoneOrderCompactView.toggle() }
        } label: {
            Image(systemName: phoneOrderCompactView ? "rectangle.expand.vertical" : "rectangle.compress.vertical")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(phoneOrderCompactView ? .blue : .secondary)
                .frame(width: 34, height: 34)
                .background((phoneOrderCompactView ? Color.blue : Color.primary).opacity(phoneOrderCompactView ? 0.12 : 0.055))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke((phoneOrderCompactView ? Color.blue : Color.primary).opacity(phoneOrderCompactView ? 0.25 : 0.08), lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .help(t(phoneOrderCompactView ? "Full View" : "Compact View", lang: seciliDil))
        .accessibilityLabel(t(phoneOrderCompactView ? "Full View" : "Compact View", lang: seciliDil))
    }

    private func phoneCompactCardRow(_ kart: KartTipi, scrollProxy: ScrollViewProxy) -> some View {
        Button {
            withAnimation(.snappy) { phoneOrderCompactView = false }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                withAnimation(.easeInOut(duration: 0.45)) {
                    scrollProxy.scrollTo("phoneOrderCard_\(kart.rawValue)", anchor: .top)
                }
            }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: cardHeaderIcon(for: kart))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.blue)
                    .frame(width: 22)
                Text(workspaceBlockTitle(for: kart))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.primary)
                    .lineLimit(1)
                    .layoutPriority(1)
                Spacer(minLength: 8)
                Text(phoneCompactSummaryText(for: kart))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 11)
            .background(bgHeaderForPhoneRow)
            .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .stroke(Color.primary.opacity(0.07), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private var bgHeaderForPhoneRow: Color {
        colorScheme == .dark ? Color(white: 0.13) : Color.white
    }

    /// "Used" cards only: hides cards with no real content in compact mode.
    private func phoneCardHasContent(_ kart: KartTipi) -> Bool {
        switch kart {
        case .summary: return true
        case .preview: return !siparis.designLink.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !siparis.designName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .customer: return !siparis.customerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .delivery: return siparis.deliveryTime > 0
        case .communication: return ![siparis.emailAddress, siparis.instagramUsername, siparis.whatsappNumber].allSatisfy { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        case .notes: return !siparis.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .financial: return siparis.paidAmount != 0 || siparis.remainingAmount != 0
        case .status: return !siparis.status.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .shipping: return siparis.isDispatched || siparis.isDelivered || !siparis.trackingNumber.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .schedule: return !scheduleItems.isEmpty
        case .historyLog: return !(siparis.historyLog ?? []).isEmpty
        case .clientFiles: return !(siparis.clientFiles ?? []).isEmpty
        case .todo: return !(siparis.todoItems ?? []).isEmpty
        case .workTime: return !(siparis.workSessions ?? []).isEmpty
        case .customerNotes: return !(seciliMusteri?.notes ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .materials: return siparis.invBool1 || siparis.invBool2 || siparis.invBool3 || siparis.invBool4 || !siparis.invNotes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .priority: return siparis.priority != "Normal" || siparis.risk != "None"
        case .invoiceItems: return siparis.hasLineItems
        case .estimate: return !(siparis.estimates ?? []).isEmpty
        case .customerPortal: return !siparis.portalTokenId.isEmpty
        case .repairIntake:
            let intake = siparis.repairIntake
            return siparis.orderType == "repair"
                || !(intake?.fields.isEmpty ?? true)
                || !(intake?.condition.isEmpty ?? true)
                || !(intake?.requestedWork.isEmpty ?? true)
        }
    }

    private func phoneCompactSummaryText(for kart: KartTipi) -> String {
        switch kart {
        case .summary:
            let design = siparis.designName.trimmingCharacters(in: .whitespacesAndNewlines)
            return design.isEmpty ? t(siparis.status, lang: seciliDil) : "\(design) • \(t(siparis.status, lang: seciliDil))"
        case .customerPortal:
            return siparis.portalTokenId.isEmpty
                ? t("Customer Portal", lang: seciliDil)
                : t("Portal active", lang: seciliDil)
        case .estimate:
            guard let current = currentEstimateSummary else { return t("Estimate & Approval", lang: seciliDil) }
            return "\(current.number) · \(t(estimateStatusLabel(current.status), lang: seciliDil))"
        case .repairIntake:
            let itemType = siparis.repairIntake?.fields["itemType"] ?? ""
            return itemType.isEmpty ? t("Repair Intake & Item", lang: seciliDil) : itemType
        case .preview:
            let design = siparis.designName.trimmingCharacters(in: .whitespacesAndNewlines)
            return design.isEmpty ? t("Preview", lang: seciliDil) : design
        case .customer:
            return siparis.customerName
        case .delivery:
            return "\(siparis.deliveryTime) " + t("days", lang: seciliDil)
        case .communication:
            return [siparis.whatsappNumber, siparis.instagramUsername, siparis.emailAddress]
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
                .joined(separator: " • ")
        case .notes:
            return siparis.notes.split(separator: "\n").first.map(String.init) ?? ""
        case .financial:
            let paid = privacyCurrency(siparis.paidAmount, symbol: seciliParaBirimi, ondalik: seciliOndalik, hideNumbers: hideSensitiveNumbers)
            let remaining = privacyCurrency(siparis.remainingAmount, symbol: seciliParaBirimi, ondalik: seciliOndalik, hideNumbers: hideSensitiveNumbers)
            return t("Paid", lang: seciliDil) + " \(paid) • " + t("Remaining", lang: seciliDil) + " \(remaining)"
        case .status:
            return t(siparis.status, lang: seciliDil)
        case .shipping:
            if siparis.isDelivered { return t("Delivered", lang: seciliDil) }
            let tracking = siparis.trackingNumber.trimmingCharacters(in: .whitespacesAndNewlines)
            if !tracking.isEmpty { return "\(siparis.courier) \(tracking)" }
            return siparis.isDispatched ? t("Dispatched", lang: seciliDil) : t("Not dispatched", lang: seciliDil)
        case .schedule:
            return "\(activeScheduleItems.count) " + t("active", lang: seciliDil)
        case .historyLog:
            return "\((siparis.historyLog ?? []).count)"
        case .clientFiles:
            return "\((siparis.clientFiles ?? []).count) " + t("files", lang: seciliDil)
        case .todo:
            let items = siparis.todoItems ?? []
            return "\(items.filter { $0.isDone }.count)/\(items.count)"
        case .workTime:
            let total = (siparis.workSessions ?? []).reduce(0) { $0 + $1.durationSeconds }
            let hours = total / 3600
            let minutes = (total % 3600) / 60
            return hours > 0 ? "\(hours)h \(minutes)m" : "\(minutes)m"
        case .customerNotes:
            return (seciliMusteri?.notes ?? "").split(separator: "\n").first.map(String.init) ?? ""
        case .materials:
            let checks = [siparis.invBool1, siparis.invBool2, siparis.invBool3, siparis.invBool4]
            return "\(checks.filter { $0 }.count)/4 " + t("ready", lang: seciliDil)
        case .priority:
            return t(siparis.priority, lang: seciliDil) + (siparis.risk == "None" ? "" : " • " + t(siparis.risk, lang: seciliDil))
        case .invoiceItems:
            return privacyCurrency(siparis.lineItemsTotal, symbol: seciliParaBirimi, ondalik: seciliOndalik, hideNumbers: hideSensitiveNumbers)
        }
    }

    private var bgMainForPhone: Color {
        colorScheme == .dark ? Color(white: 0.08) : Color(white: 0.93)
    }

    private func decodedPhoneKartSirasi() -> [KartTipi] {
        guard let data = phoneKartSirasiJSON.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([KartTipi].self, from: data) else {
            return []
        }

        return decoded
    }

    private func normalizePhoneKartSirasi() {
        let normalized = normalizedPhoneKartSirasiValue
        if phoneKartSirasi != normalized {
            phoneKartSirasi = normalized
            savePhoneKartSirasi()
        }
    }

    private func savePhoneKartSirasi() {
        if let data = try? JSONEncoder().encode(phoneKartSirasi),
           let str = String(data: data, encoding: .utf8) {
            phoneKartSirasiJSON = str
        }
    }

    private func handlePhoneCardMoveRequest(_ notification: Notification) {
        guard isPhoneLayout,
              let rawCard = notification.userInfo?["card"] as? String,
              let kart = KartTipi(rawValue: rawCard),
              let action = notification.userInfo?["action"] as? String else { return }

        movePhoneCard(kart, action: action)
    }

    private func movePhoneCard(_ kart: KartTipi, action: String) {
        normalizePhoneKartSirasi()

        let visible = phoneKartSirasi.filter { isCardVisible($0) }
        guard let visibleIndex = visible.firstIndex(of: kart) else { return }

        withAnimation(.interactiveSpring(response: 0.28, dampingFraction: 0.88, blendDuration: 0.08)) {
            switch action {
            case "up":
                guard visibleIndex > 0 else { return }
                movePhoneCard(kart, before: visible[visibleIndex - 1])

            case "down":
                guard visibleIndex < visible.count - 1 else { return }
                movePhoneCard(kart, after: visible[visibleIndex + 1])

            case "top":
                guard let firstVisible = visible.first, firstVisible != kart else { return }
                movePhoneCard(kart, before: firstVisible)

            case "bottom":
                guard let lastVisible = visible.last, lastVisible != kart else { return }
                movePhoneCard(kart, after: lastVisible)

            default:
                return
            }
        }

        savePhoneKartSirasi()
        persistWorkspaceCustomizationChange()
    }

    private func movePhoneCard(_ kart: KartTipi, before target: KartTipi) {
        phoneKartSirasi.removeAll { $0 == kart }

        if let targetIndex = phoneKartSirasi.firstIndex(of: target) {
            phoneKartSirasi.insert(kart, at: targetIndex)
        } else {
            phoneKartSirasi.insert(kart, at: 0)
        }
    }

    private func movePhoneCard(_ kart: KartTipi, after target: KartTipi) {
        phoneKartSirasi.removeAll { $0 == kart }

        if let targetIndex = phoneKartSirasi.firstIndex(of: target) {
            phoneKartSirasi.insert(kart, at: min(targetIndex + 1, phoneKartSirasi.count))
        } else {
            phoneKartSirasi.append(kart)
        }
    }

    private func bitirTelefonSuruklemeyiVeKaydet() {
        showWorkspaceEmptyDropTargets = false
        workspaceCardInsertDropTarget = nil
        CardDragCoordinator.shared.endSession()
        draggedKart = nil
        PlatformCursor.arrowSet()
        normalizePhoneKartSirasi()
        savePhoneKartSirasi()
        persistWorkspaceCustomizationChange()
    }

    private var calismaAlani: some View {
        GeometryReader { geo in
            SoftStyledWorkspaceScrollView(colorScheme: colorScheme, expectedContentSize: calismaAlaniGercekIcerikBoyutu(viewport: geo.size), enablePinchZoom: isPadLayout, zoomScale: $iPadWorkspaceZoomScale) {
                HStack(alignment: .top, spacing: 0) {
                    ForEach(workspaceColumnIndicesForDisplay(), id: \.self) { colIndex in
                        workspaceColumnView(colIndex: colIndex, viewportHeight: geo.size.height)

                        if shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 2 && colIndex == 0 {
                            Spacer()
                                .frame(width: 14)
                            macFirstProjectGuideCustomerInfoColumn(viewportHeight: geo.size.height)
                                .zIndex(50)
                        }

                        if colIndex < workspaceLastVisibleColumnIndexForDisplay() {
                            SutunAyirici(width: getBinding(for: colIndex)) {
                                saveWidths()
                            }
                        }
                    }
                }
                .padding(30)
                .frame(minWidth: geo.size.width, minHeight: geo.size.height, alignment: .topLeading)
                .background(WorkspacePanSurface())
                .background(uiTetikleyici ? Color.clear.opacity(0.001) : Color.clear)
            }
            .padding(.bottom, macOSHitboxHack)
            .onAppear {
                guncelleSutunSayisi(viewport: geo.size)
            }
            .onChange(of: geo.size) { _, yeniBoyut in
                guncelleSutunSayisi(viewport: yeniBoyut)
            }
            .onChange(of: draggedKart) { _, yeniKart in
                if let yeniKart {
                    if kartYerlesimiBeforeDrag == nil {
                        kartYerlesimiBeforeDrag = kartYerlesimi
                    }
                    prepareWorkspaceEmptyDropTargetsForDrag()
                    showWorkspaceEmptyDropTargets = true

                    // If iPad/iPhone/macOS cancels the drop callback after a real reorder,
                    // avoid leaving the right-side empty target flickering open.
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
                        if draggedKart == yeniKart,
                           CardDragCoordinator.shared.reachedDropTarget {
                            showWorkspaceEmptyDropTargets = false
                        }
                    }
                } else {
                    showWorkspaceEmptyDropTargets = false
                    workspaceCardInsertDropTarget = nil
                }
            }
        }
    }

    private func lastColumnWithVisibleCard() -> Int {
        kartYerlesimi.indices.last { index in
            kartYerlesimi[index].contains { isCardVisible($0) }
        } ?? 0
    }

    private func workspaceLastVisibleColumnIndexForDisplay() -> Int {
        guard !kartYerlesimi.isEmpty else { return 0 }

        // Mac: keep the workspace width stable after drag/drop.
        // Without this, hiding the temporary empty columns can make all cards visually slide sideways.
        if shouldKeepStableWorkspaceWidth {
            return max(0, kartYerlesimi.count - 1)
        }

        if showWorkspaceEmptyDropTargets && draggedKart != nil {
            return max(0, kartYerlesimi.count - 1)
        }

        return min(max(0, lastColumnWithVisibleCard()), max(0, kartYerlesimi.count - 1))
    }

    private func workspaceColumnIndicesForDisplay() -> [Int] {
        guard !kartYerlesimi.isEmpty else { return [] }
        return Array(0...workspaceLastVisibleColumnIndexForDisplay())
    }

    private func prepareWorkspaceEmptyDropTargetsForDrag() {
        guard !kartYerlesimi.isEmpty else { return }

        // If all currently available columns are occupied, create one temporary empty column
        // so users can drag from the 4th column into a 5th one.
        let lastFilledIndex = lastColumnWithVisibleCard()
        let neededCount = min(8, max(kartYerlesimi.count, lastFilledIndex + 2))

        while kartYerlesimi.count < neededCount {
            kartYerlesimi.append([])
        }

        while sutunGenislikleri.count < kartYerlesimi.count {
            sutunGenislikleri.append(350)
        }
    }

    private func visibleCards(in colIndex: Int) -> [KartTipi] {
        guard kartYerlesimi.indices.contains(colIndex) else { return [] }
        return kartYerlesimi[colIndex].filter { isCardVisible($0) }
    }

    private func macFirstProjectGuideCustomerInfoColumn(viewportHeight: CGFloat) -> some View {
        let columnHeight = Swift.max(viewportHeight - CGFloat(60), CGFloat(520))

        return VStack(alignment: .leading, spacing: 0) {
            StudioFirstRunGuideBubble(
                stepText: "3 / 7",
                title: t("Customer & Communication", lang: seciliDil),
                message: t("This is where customer name, design name, email, phone and address are kept for the project.", lang: seciliDil),
                primaryTitle: t("Next", lang: seciliDil),
                secondaryTitle: t("Skip", lang: seciliDil),
                onPrimary: continueMacFirstProjectGuideFromCustomerCard,
                onSkip: completeMacFirstProjectGuide
            )
            .frame(maxWidth: .infinity, alignment: .leading)

            Spacer(minLength: 0)
        }
        .padding(.top, 4)
        .frame(width: CGFloat(340), alignment: .topLeading)
        .frame(minHeight: columnHeight, alignment: .topLeading)
    }


    private var macFirstProjectGuideFinancialCardBubble: some View {
        StudioFirstRunGuideBubble(
            stepText: "6 / 7",
            title: t("Financial Info is now open", lang: seciliDil),
            message: t("This card is where paid amount, costs, remaining balance and profit are tracked for the project.", lang: seciliDil),
            primaryTitle: t("Next", lang: seciliDil),
            secondaryTitle: t("Skip", lang: seciliDil),
            onPrimary: continueMacFirstProjectGuideToFinancialCardActions,
            onSkip: completeMacFirstProjectGuide
        )
        .frame(width: CGFloat(300), alignment: .leading)
        // Keep the guide bubble below the plan / availability notice so the
        // user can still understand that Financial Info is a gated card state.
        .padding(.top, 220)
        .padding(.leading, 20)
        .zIndex(999)
        .allowsHitTesting(true)
    }

    @ViewBuilder
    private func workspaceColumnView(colIndex: Int, viewportHeight: CGFloat) -> some View {
        let cards = visibleCards(in: colIndex)
        let isEmptyDropTarget = showWorkspaceEmptyDropTargets && draggedKart != nil && cards.isEmpty
        let minColumnHeight = Swift.max(viewportHeight - 60, CGFloat(520))
        let visibleCardHeights = cards.reduce(CGFloat(0)) { total, kart in
            total + CGFloat(kartYukseklikleri[kart.rawValue] ?? varsayilanKartYuksekligi(for: kart))
        }
        let visibleGapHeights = CGFloat(Swift.max(cards.count - 1, 0)) * 20
        let bottomPanHeight = Swift.max(CGFloat(80), minColumnHeight - visibleCardHeights - visibleGapHeights)

        if draggedKart == nil {
            workspaceColumnContent(cards: cards, colIndex: colIndex, bottomPanHeight: bottomPanHeight)
                .frame(width: getWidth(for: colIndex), alignment: .top)
                .frame(minHeight: minColumnHeight, alignment: .top)
                .background(WorkspacePanSurface())
        } else {
            workspaceColumnContent(cards: cards, colIndex: colIndex, bottomPanHeight: bottomPanHeight)
                .frame(width: getWidth(for: colIndex), alignment: .top)
                .frame(minHeight: minColumnHeight, alignment: .top)
                .contentShape(Rectangle())
                .background(WorkspacePanSurface())
                .overlay {
                    if isEmptyDropTarget {
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .strokeBorder(
                                Color.blue.opacity(0.22),
                                style: StrokeStyle(lineWidth: 1.2, dash: [7, 7])
                            )
                            .background(
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .fill(Color.blue.opacity(0.035))
                            )
                            .allowsHitTesting(false)
                    }
                }
                .onDrop(
                    of: [.plainText, .text],
                    delegate: BosKolonDropDelegate(
                        columnIndex: colIndex,
                        layout: $kartYerlesimi,
                        draggedItem: $draggedKart,
                        onDropEnd: bitirSuruklemeyiVeKaydet
                    )
                )
            }
        }

    private func workspaceColumnContent(cards: [KartTipi], colIndex: Int, bottomPanHeight: CGFloat) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(cards.enumerated()), id: \.element.id) { index, kart in
                kartGosterici(icin: kart, colIndex: colIndex)
                    .onDrop(
                        of: [.plainText, .text],
                        delegate: KartDropDelegate(
                            item: kart,
                            columnIndex: colIndex,
                            layout: $kartYerlesimi,
                            draggedItem: $draggedKart,
                            onDropEnd: bitirSuruklemeyiVeKaydet
                        )
                    )

                if index < cards.count - 1 {
                    workspaceCardInsertGap(after: kart, colIndex: colIndex, height: 20)
                }
            }

            if let lastCard = cards.last, draggedKart != nil {
                workspaceCardInsertGap(after: lastCard, colIndex: colIndex, height: 54)
                workspaceColumnPanGap(height: max(0, bottomPanHeight - 54))
            } else {
                workspaceColumnPanGap(height: bottomPanHeight)
            }
        }
    }

    @ViewBuilder
    private func workspaceCardInsertGap(after kart: KartTipi, colIndex: Int, height: CGFloat) -> some View {
        if draggedKart == nil {
            WorkspacePanSurface()
                .frame(maxWidth: .infinity)
                .frame(height: max(0, height))
        } else {
            let isActive = workspaceCardInsertDropTarget == WorkspaceCardInsertDropTarget(columnIndex: colIndex, after: kart)
            ZStack {
                if isActive {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .strokeBorder(
                            Color.blue.opacity(0.28),
                            style: StrokeStyle(lineWidth: 1.2, dash: [7, 7])
                        )
                        .background(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(Color.blue.opacity(0.045))
                        )

                    Text("Drop card here")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color.blue.opacity(0.76))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.blue.opacity(0.10))
                        .clipShape(Capsule())
                } else {
                    Color.clear
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: isActive ? max(54, height) : max(26, height))
            .contentShape(Rectangle())
            .onDrop(
                of: [.plainText, .text],
                delegate: KartAralikDropDelegate(
                    after: kart,
                    columnIndex: colIndex,
                    layout: $kartYerlesimi,
                    draggedItem: $draggedKart,
                    activeTarget: $workspaceCardInsertDropTarget,
                    onDropEnd: bitirSuruklemeyiVeKaydet
                )
            )
        }
    }

    @ViewBuilder
    private func workspaceColumnPanGap(height: CGFloat) -> some View {
        if draggedKart == nil {
            WorkspacePanSurface()
                .frame(maxWidth: .infinity)
                .frame(height: max(0, height))
        } else {
            Color.clear
                .frame(maxWidth: .infinity)
                .frame(height: max(0, height))
        }
    }

    private func calismaAlaniGercekIcerikBoyutu(viewport: CGSize) -> CGSize {
        let padding: CGFloat = 60
        let ayiriciGenisligi: CGFloat = 14

        let sonDoluKolonIndex = lastColumnWithVisibleCard()

        let hesaplanacakKolonSayisi: Int
        if shouldKeepStableWorkspaceWidth {
            hesaplanacakKolonSayisi = kartYerlesimi.count
        } else if showWorkspaceEmptyDropTargets && draggedKart != nil {
            hesaplanacakKolonSayisi = kartYerlesimi.count
        } else {
            hesaplanacakKolonSayisi = min(kartYerlesimi.count, max(1, sonDoluKolonIndex + 1))
        }

        let aktifKolonIndexleri = Array(0..<hesaplanacakKolonSayisi)

        let toplamKolonGenisligi = aktifKolonIndexleri.reduce(CGFloat(0)) { toplam, index in
            toplam + CGFloat(getWidth(for: index))
        }

        let guideColumnWidth: CGFloat = (shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 2) ? 354 : 0
        let toplamGenislik =
            toplamKolonGenisligi +
            CGFloat(max(0, hesaplanacakKolonSayisi - 1)) * ayiriciGenisligi +
            guideColumnWidth +
            padding

        let kolonYukseklikleri = aktifKolonIndexleri.map { index -> CGFloat in
            let gorunurKartlar = kartYerlesimi[index].filter { isCardVisible($0) }

            let kartToplami = gorunurKartlar.reduce(CGFloat(0)) { toplam, kart in
                toplam + CGFloat(kartYukseklikleri[kart.rawValue] ?? varsayilanKartYuksekligi(for: kart))
            }

            let kartAraliklari = CGFloat(max(0, gorunurKartlar.count - 1)) * 20
            let altBosluk: CGFloat = 80

            return padding + kartToplami + kartAraliklari + altBosluk
        }

        let toplamYukseklik = kolonYukseklikleri.max() ?? viewport.height
        return CGSize(width: toplamGenislik, height: toplamYukseklik)
    }

    private func varsayilanKartYuksekligi(for kart: KartTipi) -> Double {
        switch kart {
        case .preview: return 250
        case .financial: return 430
        case .status: return 260
        case .shipping: return 260
        case .schedule: return 390
        case .clientFiles: return 360
        case .todo: return 360
        case .workTime: return 380
        case .historyLog: return historyLogPreferredCardHeight
        case .notes, .customerNotes: return 220
        case .summary: return 210
        default: return 200
        }
    }

    private func isCardVisible(_ kart: KartTipi) -> Bool {
        guard canAccessCard(kart) else { return false }
        switch kart {
        case .preview: return showCardPreview
        case .summary: return showCardSummary
        case .customer: return showCardCustomer
        case .delivery: return showCardDelivery
        case .communication: return false
        case .notes: return showCardNotes
        case .financial: return canAccessFinancialInfo && showCardFinancial
        case .status: return showCardStatus
        case .shipping: return showCardShipping
        case .schedule: return workspaceAccessAllows("schedule") && showCardSchedule
        case .historyLog: return showCardHistoryLog
        case .clientFiles: return canAccessClientFiles && showCardClientFiles
        case .todo: return showCardToDo
        case .workTime: return showCardWorkTime
        case .customerNotes: return false
        case .materials: return showCardMaterials
        case .priority: return showCardPriority
        case .invoiceItems: return showCardInvoiceItems
        case .repairIntake: return showCardRepairIntake
        case .estimate: return showCardEstimate
        case .customerPortal: return showCardCustomerPortal
        }
    }

    // A card that is switched on but sits in no column would silently stay
    // invisible. That happens after the first-project guide, which rebuilds the
    // layout with only the two cards it teaches, so anything the user turns on
    // afterwards has nowhere to appear.
    private func ensureCardPlacedInWorkspace(_ kart: KartTipi) {
        guard !kartYerlesimi.flatMap({ $0 }).contains(kart) else { return }
        while kartYerlesimi.count < 3 { kartYerlesimi.append([]) }

        let candidateColumns = Array(kartYerlesimi.indices.prefix(3))
        let hedef = candidateColumns.min { kartYerlesimi[$0].count < kartYerlesimi[$1].count } ?? 0
        kartYerlesimi[hedef].append(kart)
        normalizePhoneKartSirasi()
        kaydetKartYerlesimi()
    }

    // Any card that is switched on but sits in no column would stay invisible with
    // no way for the user to bring it back. Runs after every path that can replace
    // the layout or the visibility flags — including a workspace profile arriving
    // from the cloud after the local layout was already loaded.
    private func healOrphanedVisibleCards() {
        for kart in alphabeticalWorkspaceBlockCards where isCardVisible(kart) {
            ensureCardPlacedInWorkspace(kart)
        }
    }

    // The workspace profile arrives from the cloud a moment after the local layout
    // is loaded, so the repair has to wait for it. Deliberately one-shot: repairing
    // from inside the profile-apply path feeds the layout back into the sync and
    // spins the workspace.
    private func scheduleOrphanCardRepairOnce() {
        guard !hasHealedOrphanCardsOnce else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            // Healing before the companySettings listener has spoken is wasted
            // work: the apply that follows replaces the layout wholesale, and the
            // settle gate drops the upload. So re-arm a bounded number of times
            // instead of burning the single shot on a timer that fired too early.
            guard hasSyncedWorkspaceCloudOnce || orphanCardRepairAttempts >= 4 else {
                orphanCardRepairAttempts += 1
                scheduleOrphanCardRepairOnce()
                return
            }
            hasHealedOrphanCardsOnce = true
            healOrphanedVisibleCards()
        }
    }

    private func setCardVisible(_ kart: KartTipi, _ visible: Bool, animated: Bool = true) {
        if visible {
            ensureCardPlacedInWorkspace(kart)
        }
        let update = {
            switch kart {
            case .preview: showCardPreview = visible
            case .summary: showCardSummary = visible
            case .customer: showCardCustomer = visible
            case .delivery: showCardDelivery = visible
            case .communication: showCardCommunication = visible
            case .notes: showCardNotes = visible
            case .financial: showCardFinancial = visible
            case .status: showCardStatus = visible
            case .shipping: showCardShipping = visible
            case .schedule: showCardSchedule = visible
            case .historyLog: showCardHistoryLog = visible
            case .clientFiles: showCardClientFiles = visible
            case .todo: showCardToDo = visible
            case .workTime: showCardWorkTime = visible
            case .customerNotes: showCardCustomerNotes = visible
            case .materials: showCardMaterials = visible
            case .priority: showCardPriority = visible
            case .invoiceItems: showCardInvoiceItems = visible
            case .repairIntake: showCardRepairIntake = visible
            case .estimate: showCardEstimate = visible
            case .customerPortal: showCardCustomerPortal = visible
            }
            yenileCalismaAlaniHitbox(delay: 0.01)
            persistWorkspaceCustomizationChange()
        }

        if animated {
            withAnimation(.snappy) { update() }
        } else {
            update()
        }
    }

    private func setCardVisibleWithUndo(_ kart: KartTipi, _ visible: Bool) {
        let oldValue = isCardVisible(kart)
        guard oldValue != visible else { return }

        setCardVisible(kart, visible)

        firebaseManager.registerUIChange(
            title: visible ? t("Show Block", lang: seciliDil) : "Hide Block",
            undo: { setCardVisible(kart, oldValue) },
            redo: { setCardVisible(kart, visible) }
        )
    }

    private func visibilityBinding(for kart: KartTipi) -> Binding<Bool> {
        Binding(
            get: { isCardVisible(kart) },
            set: { newValue in
                setCardVisible(kart, newValue)
                if kart == .financial && newValue {
                    continueMacFirstProjectGuideAfterFinancialInfoEnabled()
                }
            }
        )
    }

    private var isCurrentOrderIndependent: Bool {
        guard let json = siparis.customFields?[orderWorkspaceLayoutKey] else { return false }
        return !json.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func ensureSharedWorkspaceSnapshot() {
        if sharedWorkspaceSnapshotJSON.isEmpty {
            // Never seed the shared snapshot from a layout the user doesn't
            // own: an independent per-order layout, or the screen currently
            // showing an order-TYPE layout (repair convention). Fall back to
            // the user's own profile in both cases.
            if isCurrentOrderIndependent || activeWorkspaceLayoutIsTypeManaged {
                if let ownProfile = currentWorkspaceUserProfile(),
                   !ownProfile.snapshotJSON.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    sharedWorkspaceSnapshotJSON = ownProfile.snapshotJSON
                }
                return
            }

            sharedWorkspaceSnapshotJSON = encodedWorkspaceSnapshot(captureWorkspaceLayout()) ?? ""
        }
    }

    private var currentOrderCardHeightKey: String? {
        let cleanId = (siparis.id ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return cleanId.isEmpty ? nil : cleanId
    }

    private func activeCardHeights(from snapshot: WorkspaceLayoutSnapshot) -> [String: Double] {
        guard let orderKey = currentOrderCardHeightKey,
              let orderHeights = snapshot.orderKartYukseklikleri?[orderKey],
              !orderHeights.isEmpty else {
            return snapshot.kartYukseklikleri
        }

        return orderHeights
    }

    private func markWorkspaceLayoutApplied(isIndependent: Bool, isTypeManaged: Bool = false) {
        activeWorkspaceLayoutOrderKey = currentOrderCardHeightKey ?? ""
        activeWorkspaceLayoutIsIndependent = isIndependent
        activeWorkspaceLayoutIsTypeManaged = isTypeManaged
    }

    // Resolves the workspace's order-TYPE layout for the open order, if one
    // exists. Mirrors the web client exactly: only orderType == "repair"
    // participates (web sends "repair" or nothing), and the snapshot shape is
    // identical to sharedWorkspaceSnapshotJSON. Read-side only — nothing here
    // is ever written back to the cloud or into a profile.
    private func currentOrderTypeWorkspaceSnapshot() -> WorkspaceLayoutSnapshot? {
        guard siparis.orderType == "repair" else { return nil }
        guard let data = typeWorkspaceSnapshotsJSON.data(using: .utf8),
              let map = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let entry = map["repair"] as? [String: Any],
              JSONSerialization.isValidJSONObject(entry),
              let entryData = try? JSONSerialization.data(withJSONObject: entry),
              let snapshot = try? JSONDecoder().decode(WorkspaceLayoutSnapshot.self, from: entryData) else {
            return nil
        }
        return snapshot
    }

    private func orderCardHeightsForSnapshot() -> [String: [String: Double]]? {
        orderKartYukseklikleri.isEmpty ? nil : orderKartYukseklikleri
    }

    private func saveActiveCardHeightsLocally() {
        if let data = try? JSONEncoder().encode(kartYukseklikleri), let str = String(data: data, encoding: .utf8) {
            kartYukseklikleriJSON = str
        }
    }

    private func rememberCurrentOrderCardHeights() {
        if let orderKey = currentOrderCardHeightKey {
            orderKartYukseklikleri[orderKey] = kartYukseklikleri
        } else {
            sharedKartYukseklikleri = kartYukseklikleri
        }
    }

    private func captureWorkspaceLayout(includeCurrentOrderHeightsAsShared: Bool = false) -> WorkspaceLayoutSnapshot {
        let sharedHeights = includeCurrentOrderHeightsAsShared
            ? kartYukseklikleri
            : (sharedKartYukseklikleri.isEmpty ? kartYukseklikleri : sharedKartYukseklikleri)

        return WorkspaceLayoutSnapshot(
            sutunGenislikleri: sutunGenislikleri,
            kartYerlesimi: kartYerlesimi,
            phoneKartSirasi: normalizedPhoneKartSirasiValue,
            kartYukseklikleri: sharedHeights,
            orderKartYukseklikleri: orderCardHeightsForSnapshot(),
            kartRenkleri: kartRenkleri,
            visibility: [
                KartTipi.preview.rawValue: showCardPreview,
                KartTipi.summary.rawValue: showCardSummary,
                KartTipi.customer.rawValue: showCardCustomer,
                KartTipi.delivery.rawValue: showCardDelivery,
                KartTipi.communication.rawValue: showCardCommunication,
                KartTipi.notes.rawValue: showCardNotes,
                KartTipi.financial.rawValue: showCardFinancial,
                KartTipi.status.rawValue: showCardStatus,
                KartTipi.shipping.rawValue: showCardShipping,
                KartTipi.schedule.rawValue: showCardSchedule,
                KartTipi.historyLog.rawValue: showCardHistoryLog,
                KartTipi.clientFiles.rawValue: showCardClientFiles,
                KartTipi.todo.rawValue: showCardToDo,
                KartTipi.workTime.rawValue: showCardWorkTime,
                KartTipi.customerNotes.rawValue: showCardCustomerNotes,
                KartTipi.materials.rawValue: showCardMaterials,
                KartTipi.priority.rawValue: showCardPriority,
                KartTipi.invoiceItems.rawValue: showCardInvoiceItems,
                KartTipi.repairIntake.rawValue: showCardRepairIntake,
                KartTipi.estimate.rawValue: showCardEstimate,
                KartTipi.customerPortal.rawValue: showCardCustomerPortal
            ]
        )
    }

    private func encodedWorkspaceSnapshot(_ snapshot: WorkspaceLayoutSnapshot) -> String? {
        guard let data = try? JSONEncoder().encode(snapshot) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func decodedWorkspaceSnapshot(_ json: String) -> WorkspaceLayoutSnapshot? {
        guard let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(WorkspaceLayoutSnapshot.self, from: data)
    }

    private func ensureHistoryLogCardInCurrentLayout() {
        while kartYerlesimi.count < 3 { kartYerlesimi.append([]) }

        let allCards = kartYerlesimi.flatMap { $0 }
        guard !allCards.contains(.historyLog) else { return }

        let targetColumn = min(2, kartYerlesimi.count - 1)
        if let scheduleIndex = kartYerlesimi[targetColumn].firstIndex(of: .schedule) {
            kartYerlesimi[targetColumn].insert(.historyLog, at: min(scheduleIndex + 1, kartYerlesimi[targetColumn].count))
        } else {
            kartYerlesimi[targetColumn].append(.historyLog)
        }
    }

    private func ensureClientFilesCardInCurrentLayout() {
        while kartYerlesimi.count < 3 { kartYerlesimi.append([]) }

        let allCards = kartYerlesimi.flatMap { $0 }
        guard !allCards.contains(.clientFiles) else { return }

        let targetColumn = min(1, kartYerlesimi.count - 1)
        if let notesIndex = kartYerlesimi[targetColumn].firstIndex(of: .notes) {
            kartYerlesimi[targetColumn].insert(.clientFiles, at: min(notesIndex + 1, kartYerlesimi[targetColumn].count))
        } else {
            kartYerlesimi[targetColumn].append(.clientFiles)
        }
    }



    private func ensureToDoCardInCurrentLayout() {
        while kartYerlesimi.count < 3 { kartYerlesimi.append([]) }

        let allCards = kartYerlesimi.flatMap { $0 }
        guard !allCards.contains(.todo) else { return }

        let targetColumn = min(2, kartYerlesimi.count - 1)
        if let priorityIndex = kartYerlesimi[targetColumn].firstIndex(of: .priority) {
            kartYerlesimi[targetColumn].insert(.todo, at: min(priorityIndex + 1, kartYerlesimi[targetColumn].count))
        } else if let scheduleIndex = kartYerlesimi[targetColumn].firstIndex(of: .schedule) {
            kartYerlesimi[targetColumn].insert(.todo, at: scheduleIndex)
        } else {
            kartYerlesimi[targetColumn].append(.todo)
        }
    }

    private func ensureWorkTimeCardInCurrentLayout() {
        while kartYerlesimi.count < 3 { kartYerlesimi.append([]) }

        let allCards = kartYerlesimi.flatMap { $0 }
        guard !allCards.contains(.workTime) else { return }

        let targetColumn = min(2, kartYerlesimi.count - 1)
        if let todoIndex = kartYerlesimi[targetColumn].firstIndex(of: .todo) {
            kartYerlesimi[targetColumn].insert(.workTime, at: min(todoIndex + 1, kartYerlesimi[targetColumn].count))
        } else if let priorityIndex = kartYerlesimi[targetColumn].firstIndex(of: .priority) {
            kartYerlesimi[targetColumn].insert(.workTime, at: min(priorityIndex + 1, kartYerlesimi[targetColumn].count))
        } else {
            kartYerlesimi[targetColumn].append(.workTime)
        }
    }

    private func ensureRequiredCardsInCurrentLayout() {
        ensureInvoiceItemsCardInCurrentLayout()
        ensureClientFilesCardInCurrentLayout()
        ensureToDoCardInCurrentLayout()
        ensureWorkTimeCardInCurrentLayout()
        ensureHistoryLogCardInCurrentLayout()

        // The five above are hand-written, one per card, and each was added when
        // that card shipped. The two newest cards were never given one, so a
        // layout saved before they existed came back without them and they had
        // nowhere to render. Generic from here on, so the next card cannot repeat
        // it. No save: applyWorkspaceLayout persists once its state has settled.
        while kartYerlesimi.count < 3 { kartYerlesimi.append([]) }
        let placed = Set(kartYerlesimi.flatMap { $0 })
        for kart in KartTipi.allCases where isCardVisible(kart) && !placed.contains(kart) {
            let candidates = Array(kartYerlesimi.indices.prefix(3))
            let hedef = candidates.min { kartYerlesimi[$0].count < kartYerlesimi[$1].count } ?? 0
            kartYerlesimi[hedef].append(kart)
        }
    }

    private func ensureInvoiceItemsCardInCurrentLayout() {
        while kartYerlesimi.count < 3 { kartYerlesimi.append([]) }

        let allCards = kartYerlesimi.flatMap { $0 }
        guard !allCards.contains(.invoiceItems) else { return }

        if let col = kartYerlesimi.firstIndex(where: { $0.contains(.customer) }),
           let idx = kartYerlesimi[col].firstIndex(of: .customer) {
            kartYerlesimi[col].insert(.invoiceItems, at: min(idx + 1, kartYerlesimi[col].count))
        } else {
            let targetColumn = min(1, kartYerlesimi.count - 1)
            kartYerlesimi[targetColumn].append(.invoiceItems)
        }
    }

    private func applyWorkspaceLayout(_ snapshot: WorkspaceLayoutSnapshot) {
        isApplyingWorkspaceLayout = true

        showCardPreview = snapshot.visibility[KartTipi.preview.rawValue] ?? true
        showCardSummary = snapshot.visibility[KartTipi.summary.rawValue] ?? true
        showCardCustomer = snapshot.visibility[KartTipi.customer.rawValue] ?? true
        showCardDelivery = snapshot.visibility[KartTipi.delivery.rawValue] ?? true
        showCardCommunication = snapshot.visibility[KartTipi.communication.rawValue] ?? true
        showCardNotes = snapshot.visibility[KartTipi.notes.rawValue] ?? true
        showCardFinancial = snapshot.visibility[KartTipi.financial.rawValue] ?? true
        showCardStatus = snapshot.visibility[KartTipi.status.rawValue] ?? true
        showCardShipping = snapshot.visibility[KartTipi.shipping.rawValue] ?? true
        showCardSchedule = snapshot.visibility[KartTipi.schedule.rawValue] ?? true
        showCardHistoryLog = snapshot.visibility[KartTipi.historyLog.rawValue] ?? true
        showCardClientFiles = snapshot.visibility[KartTipi.clientFiles.rawValue] ?? true
        showCardToDo = snapshot.visibility[KartTipi.todo.rawValue] ?? true
        showCardWorkTime = snapshot.visibility[KartTipi.workTime.rawValue] ?? true
        showCardCustomerNotes = snapshot.visibility[KartTipi.customerNotes.rawValue] ?? false
        showCardMaterials = snapshot.visibility[KartTipi.materials.rawValue] ?? true
        showCardPriority = snapshot.visibility[KartTipi.priority.rawValue] ?? true
        showCardInvoiceItems = snapshot.visibility[KartTipi.invoiceItems.rawValue] ?? true
        showCardRepairIntake = snapshot.visibility[KartTipi.repairIntake.rawValue] ?? true
        showCardEstimate = snapshot.visibility[KartTipi.estimate.rawValue] ?? true
        showCardCustomerPortal = snapshot.visibility[KartTipi.customerPortal.rawValue] ?? true

        kartYerlesimi = snapshot.kartYerlesimi.isEmpty ? kartYerlesimi : snapshot.kartYerlesimi
        while kartYerlesimi.count < 3 { kartYerlesimi.append([]) }
        ensureRequiredCardsInCurrentLayout()

        if let phoneOrder = snapshot.phoneKartSirasi, !phoneOrder.isEmpty {
            phoneKartSirasi = phoneOrder
            savePhoneKartSirasi()
        } else {
            normalizePhoneKartSirasi()
        }

        sharedKartYukseklikleri = snapshot.kartYukseklikleri
        orderKartYukseklikleri = snapshot.orderKartYukseklikleri ?? [:]
        kartYukseklikleri = activeCardHeights(from: snapshot)
        normalizeClientFilesCardHeightIfNeeded()
        kartRenkleri = snapshot.kartRenkleri
        sutunGenislikleri = snapshot.sutunGenislikleri.isEmpty ? [350, 350, 350] : snapshot.sutunGenislikleri.map { min(max($0, 260), 800) }
        while sutunGenislikleri.count < kartYerlesimi.count { sutunGenislikleri.append(350) }

        kaydetSutunGenislikleri()
        kaydetKartYerlesimi()
        saveActiveCardHeightsLocally()

        if let data = try? JSONEncoder().encode(kartRenkleri),
           let str = String(data: data, encoding: .utf8) {
            kartRenkleriJSON = str
        }

        if sutunGenislikleri.indices.contains(0) { savedColLeft = sutunGenislikleri[0] }
        if sutunGenislikleri.indices.contains(1) { savedColMid = sutunGenislikleri[1] }
        if sutunGenislikleri.indices.contains(2) { savedColRight = sutunGenislikleri[2] }

        isApplyingWorkspaceLayout = false
        enforceMacFirstProjectGuideCustomerOnlyVisibilityIfNeeded(persist: false)
        yenileCalismaAlaniHitbox(delay: 0.02)
    }

    private func startWorkspaceProfilesCloudListener() {
        workspaceProfilesCloudListener?.remove()
        workspaceProfilesCloudListener = Firestore.firestore()
            .collection("companySettings")
            .document(firebaseManager.currentCompanyId)
            .addSnapshotListener { snapshot, error in
                if let error = error {
                    print("Workspace profiles listener error: \(error)")
                    return
                }

                // We have now heard from the cloud at least once this session, so
                // it is safe to let local edits propagate back up. Until this fires,
                // any auto-save during onAppear is suppressed so a freshly-opened
                // device can't overwrite a newer layout another device just wrote.
                hasSyncedWorkspaceCloudOnce = true

                guard let data = snapshot?.data() else {
                    if !workspaceProfilesJSON.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                        !workspaceUserProfilesJSON.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        saveWorkspaceSettingsToCloud(
                            workspaceProfilesJSON: workspaceProfilesJSON,
                            workspaceUserProfilesJSON: workspaceUserProfilesJSON,
                            sharedWorkspaceSnapshotJSON: sharedWorkspaceSnapshotJSON
                        )
                    }
                    return
                }

                isApplyingWorkspaceProfilesFromCloud = true

                // Order-TYPE layouts: read-only cache refresh. This field is
                // owner/server-written; Swift never writes it back — an empty
                // cloud value simply clears the local cache (the owner removed
                // the type layout), it is never re-uploaded from here.
                let cloudTypeSnapshotsJSON = (data["typeWorkspaceSnapshotsJSON"] as? String) ?? ""
                if cloudTypeSnapshotsJSON != typeWorkspaceSnapshotsJSON {
                    let hadTypeSnapshot = currentOrderTypeWorkspaceSnapshot() != nil
                    typeWorkspaceSnapshotsJSON = cloudTypeSnapshotsJSON
                    let hasTypeSnapshot = currentOrderTypeWorkspaceSnapshot() != nil
                    if !isCurrentOrderIndependent, hadTypeSnapshot || hasTypeSnapshot {
                        loadWorkspaceForCurrentOrderIfNeeded()
                    }
                }

                if let cloudProfilesJSON = data["workspaceProfilesJSON"] as? String,
                   !cloudProfilesJSON.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                   cloudProfilesJSON != workspaceProfilesJSON {
                    workspaceProfilesJSON = cloudProfilesJSON
                    loadWorkspaceProfiles()
                } else if (data["workspaceProfilesJSON"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true,
                          !workspaceProfilesJSON.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    saveWorkspaceSettingsToCloud(workspaceProfilesJSON: workspaceProfilesJSON)
                }

                let previousOwnSnapshotJSON = currentWorkspaceUserProfile()?.snapshotJSON

                if let cloudUserProfilesJSON = data["workspaceUserProfilesJSON"] as? String,
                   !cloudUserProfilesJSON.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                   cloudUserProfilesJSON != workspaceUserProfilesJSON {
                    workspaceUserProfilesJSON = cloudUserProfilesJSON
                    loadWorkspaceUserProfiles()

                    if isCurrentOrderIndependent || currentOrderTypeWorkspaceSnapshot() != nil {
                        // Independent and TYPE-managed orders re-resolve through
                        // the one resolver so a profile update can't clobber the
                        // layout that actually governs this order.
                        loadWorkspaceForCurrentOrderIfNeeded()
                    } else if !workspaceFollowedTeamProfileUserId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        applyFollowedTeamWorkspaceProfileIfNeeded(force: false)
                    } else if startDefaultOwnerCardSyncIfNeeded(applyImmediately: true) {
                        // New team members start by following the owner's card layout live.
                    } else if let ownProfile = currentWorkspaceUserProfile(),
                              ownProfile.snapshotJSON != previousOwnSnapshotJSON,
                              let snapshot = decodedWorkspaceSnapshot(ownProfile.snapshotJSON) {
                        applyWorkspaceLayout(snapshot)
                        workspaceStatusMessage = t("Using your card profile", lang: seciliDil)
                    }
                } else if (data["workspaceUserProfilesJSON"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true,
                          !workspaceUserProfilesJSON.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    saveWorkspaceSettingsToCloud(workspaceUserProfilesJSON: workspaceUserProfilesJSON)
                }

                if let cloudSharedLayoutJSON = data["sharedWorkspaceSnapshotJSON"] as? String,
                   !cloudSharedLayoutJSON.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                   cloudSharedLayoutJSON != sharedWorkspaceSnapshotJSON {
                    sharedWorkspaceSnapshotJSON = cloudSharedLayoutJSON

                    if currentWorkspaceUserProfile() == nil,
                       !isCurrentOrderIndependent,
                       currentOrderTypeWorkspaceSnapshot() == nil,
                       let snapshot = decodedWorkspaceSnapshot(cloudSharedLayoutJSON) {
                        applyWorkspaceLayout(snapshot)
                    }
                } else if (data["sharedWorkspaceSnapshotJSON"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true,
                          !sharedWorkspaceSnapshotJSON.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    saveWorkspaceSettingsToCloud(sharedWorkspaceSnapshotJSON: sharedWorkspaceSnapshotJSON)
                }

                // Record the cloud-synced own-profile content so a later auto-save
                // of the same layout is recognised as a no-op and skipped.
                lastSyncedOwnProfileContent = currentOwnProfileContentSignature()
                isApplyingWorkspaceProfilesFromCloud = false
            }
    }

    private func saveWorkspaceSettingsToCloud(workspaceProfilesJSON profilesJSON: String? = nil, workspaceUserProfilesJSON userProfilesJSON: String? = nil, sharedWorkspaceSnapshotJSON sharedJSON: String? = nil) {
        guard !isApplyingWorkspaceProfilesFromCloud else { return }

        var data: [String: Any] = [:]

        if let profilesJSON {
            data["workspaceProfilesJSON"] = profilesJSON
        }

        if let userProfilesJSON {
            data["workspaceUserProfilesJSON"] = userProfilesJSON
        }

        if let sharedJSON {
            data["sharedWorkspaceSnapshotJSON"] = sharedJSON
        }

        guard !data.isEmpty else { return }

        if userProfilesJSON != nil {
            saveCurrentWorkspaceUserProfileToCloud()

            if profilesJSON == nil && sharedJSON == nil {
                return
            }
        }

        guard canWriteWorkspaceSettingsDirectly else { return }

        writeWorkspaceSettingsDirectlyToCloud(data)
    }

    private var canWriteWorkspaceSettingsDirectly: Bool {
        ["owner", "admin"].contains(studioOrderDetailRoleKey(currentWorkspaceProfileRole, fallback: "unknown"))
    }

    private func writeWorkspaceSettingsDirectlyToCloud(_ data: [String: Any]) {
        // Settle-gate: don't push the shared layout/profiles before this view has
        // loaded the latest cloud state, so a just-opened device can't overwrite a
        // newer layout another device wrote while this one was still loading.
        guard !data.isEmpty, hasSyncedWorkspaceCloudOnce else { return }

        Firestore.firestore()
            .collection("companySettings")
            .document(firebaseManager.currentCompanyId)
            .setData(data, merge: true)
    }

    private func workspaceUserProfilePayload(_ profile: WorkspaceUserProfileDTO) -> [String: Any]? {
        guard let data = try? JSONEncoder().encode(profile),
              let object = try? JSONSerialization.jsonObject(with: data, options: []),
              let payload = object as? [String: Any] else {
            return nil
        }

        return payload
    }

    // Identity of the current user's card profile that actually affects what is
    // shown (the live snapshot + saved profile slots), ignoring volatile fields
    // like updatedAt. Used to detect and skip no-op re-uploads.
    private func currentOwnProfileContentSignature() -> String {
        guard let profile = currentWorkspaceUserProfile() else { return "" }
        let savedJSON = (try? JSONEncoder().encode(profile.savedProfiles))
            .flatMap { String(data: $0, encoding: .utf8) } ?? ""
        return profile.snapshotJSON + "\u{1}" + savedJSON
    }

    private func saveCurrentWorkspaceUserProfileToCloud() {
        #if canImport(FirebaseFunctions)
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !companyId.isEmpty,
              let profile = currentWorkspaceUserProfile(),
              let profilePayload = workspaceUserProfilePayload(profile) else { return }

        // Settle-gate: never push before we have loaded the latest cloud state.
        guard hasSyncedWorkspaceCloudOnce else { return }

        // Content-version arbitration: skip re-uploading a profile we already hold
        // from the cloud (an echo / stale appear-time re-save). A genuine edit
        // changes the snapshot or the saved profiles, so it still goes through.
        let signature = currentOwnProfileContentSignature()
        guard signature != lastSyncedOwnProfileContent else { return }

        let payload: [String: Any] = [
            "companyId": companyId,
            "profile": profilePayload
        ]

        Functions.functions(region: "europe-west2")
            .httpsCallable("saveSwiftWorkspaceCardProfile")
            .call(payload) { _, error in
                if let error {
                    DispatchQueue.main.async {
                        workspaceStatusMessage = t("Card profile could not be saved", lang: seciliDil) + ": " + error.localizedDescription
                    }
                } else {
                    DispatchQueue.main.async {
                        lastSyncedOwnProfileContent = signature
                    }
                }
            }
        #endif
    }

    private func saveOrderWorkspaceLayoutSnapshotToCloud(snapshotJSON: String) {
        #if canImport(FirebaseFunctions)
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !companyId.isEmpty,
              let orderId = siparis.id?.trimmingCharacters(in: .whitespacesAndNewlines),
              !orderId.isEmpty else { return }

        let payload: [String: Any] = [
            "companyId": companyId,
            "orderId": orderId,
            "snapshotJSON": snapshotJSON
        ]

        Functions.functions(region: "europe-west2")
            .httpsCallable("saveSwiftWorkspaceCardProfile")
            .call(payload) { _, error in
                if let error {
                    DispatchQueue.main.async {
                        workspaceStatusMessage = t("This order layout could not be saved", lang: seciliDil) + ": " + error.localizedDescription
                    }
                }
            }
        #endif
    }

    private func resetOrderWorkspaceLayoutOnServer() {
        #if canImport(FirebaseFunctions)
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !companyId.isEmpty,
              let orderId = siparis.id?.trimmingCharacters(in: .whitespacesAndNewlines),
              !orderId.isEmpty else { return }

        let payload: [String: Any] = [
            "companyId": companyId,
            "orderId": orderId
        ]

        Functions.functions(region: "europe-west2")
            .httpsCallable("resetOrderWorkspaceCardLayout")
            .call(payload) { _, error in
                if let error {
                    DispatchQueue.main.async {
                        workspaceStatusMessage = t("This order layout could not rejoin shared layout", lang: seciliDil) + ": " + error.localizedDescription
                    }
                }
            }
        #endif
    }

    private var currentWorkspaceProfileUserId: String {
        let userId = (authVM.currentUserId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !userId.isEmpty { return userId }
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        return companyId.isEmpty ? "local-user" : companyId
    }

    private var currentWorkspaceProfileEmail: String {
        let email = authVM.accountEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        return email.isEmpty ? currentWorkspaceProfileUserId : email
    }

    private var currentWorkspaceProfileDisplayName: String {
        let displayName = authVM.accountDisplayName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !displayName.isEmpty { return displayName }
        return currentWorkspaceProfileEmail
    }

    private var currentWorkspaceProfileRole: String {
        let role = authVM.currentWorkspaceRole.trimmingCharacters(in: .whitespacesAndNewlines)
        return role.isEmpty ? "member" : role
    }

    private func normalizedPersonalCardProfiles(_ profiles: [WorkspaceProfileDTO], fallbackSnapshotJSON: String = "") -> [WorkspaceProfileDTO] {
        var cleaned: [WorkspaceProfileDTO] = []
        var seenIDs: Set<UUID> = []

        for (index, profile) in profiles.enumerated() {
            guard !seenIDs.contains(profile.id) else { continue }
            seenIDs.insert(profile.id)

            let cleanName = profile.name.trimmingCharacters(in: .whitespacesAndNewlines)
            cleaned.append(
                WorkspaceProfileDTO(
                    id: profile.id,
                    name: cleanName.isEmpty ? "Profile \(index + 1)" : cleanName,
                    snapshotJSON: profile.snapshotJSON
                )
            )
        }

        if cleaned.isEmpty,
           !fallbackSnapshotJSON.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            cleaned.append(WorkspaceProfileDTO(name: "Profile 1", snapshotJSON: fallbackSnapshotJSON))
        }

        return cleaned
    }

    private func normalizedWorkspaceUserProfiles(_ profiles: [WorkspaceUserProfileDTO]) -> [WorkspaceUserProfileDTO] {
        var seen: Set<String> = []
        var cleaned: [WorkspaceUserProfileDTO] = []

        for profile in profiles {
            let cleanUserId = profile.userId.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanUserId.isEmpty, !seen.contains(cleanUserId) else { continue }
            seen.insert(cleanUserId)

            cleaned.append(
                WorkspaceUserProfileDTO(
                    id: profile.id,
                    userId: cleanUserId,
                    displayName: profile.displayName.trimmingCharacters(in: .whitespacesAndNewlines),
                    email: profile.email.trimmingCharacters(in: .whitespacesAndNewlines),
                    role: profile.role.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "member" : profile.role,
                    snapshotJSON: profile.snapshotJSON,
                    updatedAt: profile.updatedAt,
                    savedProfiles: normalizedPersonalCardProfiles(profile.savedProfiles, fallbackSnapshotJSON: profile.snapshotJSON)
                )
            )
        }

        return cleaned.sorted { lhs, rhs in
            if lhs.userId == currentWorkspaceProfileUserId { return true }
            if rhs.userId == currentWorkspaceProfileUserId { return false }
            let lhsName = workspaceUserProfileDisplayName(lhs)
            let rhsName = workspaceUserProfileDisplayName(rhs)
            return lhsName.localizedCaseInsensitiveCompare(rhsName) == .orderedAscending
        }
    }

    private func loadWorkspaceUserProfiles() {
        guard let data = workspaceUserProfilesJSON.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([WorkspaceUserProfileDTO].self, from: data) else {
            workspaceUserProfiles = []
            return
        }

        workspaceUserProfiles = normalizedWorkspaceUserProfiles(decoded)
    }

    private func saveWorkspaceUserProfilesToStorage(syncCloud: Bool) {
        workspaceUserProfiles = normalizedWorkspaceUserProfiles(workspaceUserProfiles)

        if let data = try? JSONEncoder().encode(workspaceUserProfiles),
           let str = String(data: data, encoding: .utf8) {
            workspaceUserProfilesJSON = str

            if syncCloud, !isApplyingWorkspaceProfilesFromCloud {
                saveCurrentWorkspaceUserProfileToCloud()
            }
        }
    }

    private func currentWorkspaceUserProfileIndex() -> Int? {
        workspaceUserProfiles.firstIndex { $0.userId == currentWorkspaceProfileUserId }
    }

    private func currentWorkspaceUserProfile() -> WorkspaceUserProfileDTO? {
        guard let index = currentWorkspaceUserProfileIndex(), workspaceUserProfiles.indices.contains(index) else { return nil }
        return workspaceUserProfiles[index]
    }

    private func workspaceUserProfileDisplayName(_ profile: WorkspaceUserProfileDTO) -> String {
        let name = profile.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !name.isEmpty { return name }
        let email = profile.email.trimmingCharacters(in: .whitespacesAndNewlines)
        if !email.isEmpty { return email }
        return profile.userId
    }

    private func workspaceUserProfileSubtitle(_ profile: WorkspaceUserProfileDTO) -> String {
        let email = profile.email.trimmingCharacters(in: .whitespacesAndNewlines)
        let role = profile.role.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "member" : profile.role
        if email.isEmpty { return role.capitalized }
        return "\(email) • \(role.capitalized)"
    }

    private var isCurrentWorkspaceOwnerProfile: Bool {
        currentWorkspaceProfileRole.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "owner"
    }

    private func ownerWorkspaceUserProfileForDefaultSync() -> WorkspaceUserProfileDTO? {
        workspaceUserProfiles.first { profile in
            profile.userId != currentWorkspaceProfileUserId &&
            profile.role.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "owner" &&
            !profile.snapshotJSON.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    @discardableResult
    private func startDefaultOwnerCardSyncIfNeeded(applyImmediately: Bool) -> Bool {
        guard !isCurrentWorkspaceOwnerProfile,
              !workspaceOwnerCardSyncDismissed,
              workspaceFollowedTeamProfileUserId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              currentWorkspaceUserProfile() == nil,
              let ownerProfile = ownerWorkspaceUserProfileForDefaultSync() else { return false }

        workspaceFollowedTeamProfileUserId = ownerProfile.userId
        followedTeamProfileLastSnapshotJSON = ""

        if applyImmediately {
            applyFollowedTeamWorkspaceProfileIfNeeded(force: true)
        } else {
            workspaceStatusMessage = t("Synced with team card profile", lang: seciliDil) + ": " + workspaceUserProfileDisplayName(ownerProfile)
        }

        return true
    }

    private func followedTeamWorkspaceUserProfile() -> WorkspaceUserProfileDTO? {
        let cleanFollowedId = workspaceFollowedTeamProfileUserId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanFollowedId.isEmpty, cleanFollowedId != currentWorkspaceProfileUserId else { return nil }
        return workspaceUserProfiles.first { $0.userId == cleanFollowedId }
    }

    private func clearFollowedTeamCardProfile() {
        workspaceFollowedTeamProfileUserId = ""
        followedTeamProfileLastSnapshotJSON = ""
    }

    private func stopFollowingTeamCardProfile(loadOwnProfile: Bool = false, showMessage: Bool = true) {
        workspaceOwnerCardSyncDismissed = true
        clearFollowedTeamCardProfile()

        if loadOwnProfile {
            if let ownProfile = currentWorkspaceUserProfile(),
               let snapshot = decodedWorkspaceSnapshot(ownProfile.snapshotJSON) {
                applyWorkspaceLayout(snapshot)
            } else {
                saveCurrentUserWorkspaceProfile(showMessage: false)
            }
        }

        if showMessage {
            workspaceStatusMessage = t("Team card sync stopped", lang: seciliDil)
        }
    }

    private func applyFollowedTeamWorkspaceProfileIfNeeded(force: Bool) {
        let cleanFollowedId = workspaceFollowedTeamProfileUserId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanFollowedId.isEmpty else { return }

        guard let profile = followedTeamWorkspaceUserProfile() else {
            clearFollowedTeamCardProfile()
            workspaceStatusMessage = t("Team profile is no longer available", lang: seciliDil)
            return
        }

        let snapshotJSON = profile.snapshotJSON.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !snapshotJSON.isEmpty,
              let snapshot = decodedWorkspaceSnapshot(snapshotJSON) else { return }

        guard force || snapshotJSON != followedTeamProfileLastSnapshotJSON else { return }

        markWorkspaceLayoutApplied(isIndependent: false)
        applyWorkspaceLayout(snapshot)
        followedTeamProfileLastSnapshotJSON = snapshotJSON
        workspaceStatusMessage = t("Synced with team card profile", lang: seciliDil) + ": " + workspaceUserProfileDisplayName(profile)
    }

    private func baseCurrentUserWorkspaceProfile(snapshotJSON: String = "") -> WorkspaceUserProfileDTO {
        WorkspaceUserProfileDTO(
            userId: currentWorkspaceProfileUserId,
            displayName: currentWorkspaceProfileDisplayName,
            email: currentWorkspaceProfileEmail,
            role: currentWorkspaceProfileRole,
            snapshotJSON: snapshotJSON,
            updatedAt: Date(),
            savedProfiles: normalizedPersonalCardProfiles([], fallbackSnapshotJSON: snapshotJSON)
        )
    }

    private func updateCurrentUserWorkspaceProfile(syncCloud: Bool, _ update: (inout WorkspaceUserProfileDTO) -> Void) {
        var profile = currentWorkspaceUserProfile() ?? baseCurrentUserWorkspaceProfile()
        profile.displayName = currentWorkspaceProfileDisplayName
        profile.email = currentWorkspaceProfileEmail
        profile.role = currentWorkspaceProfileRole
        profile.savedProfiles = normalizedPersonalCardProfiles(profile.savedProfiles, fallbackSnapshotJSON: profile.snapshotJSON)
        update(&profile)
        profile.savedProfiles = normalizedPersonalCardProfiles(profile.savedProfiles, fallbackSnapshotJSON: profile.snapshotJSON)
        profile.updatedAt = Date()

        if let index = currentWorkspaceUserProfileIndex(), workspaceUserProfiles.indices.contains(index) {
            workspaceUserProfiles[index] = profile
        } else {
            workspaceUserProfiles.append(profile)
        }

        saveWorkspaceUserProfilesToStorage(syncCloud: syncCloud)
    }

    private func upsertCurrentUserWorkspaceProfile(snapshotJSON: String, syncCloud: Bool) {
        guard !snapshotJSON.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        updateCurrentUserWorkspaceProfile(syncCloud: syncCloud) { profile in
            profile.snapshotJSON = snapshotJSON

            if profile.savedProfiles.isEmpty {
                profile.savedProfiles = [WorkspaceProfileDTO(name: "Profile 1", snapshotJSON: snapshotJSON)]
            }
        }
    }

    private func saveCurrentUserWorkspaceProfile(showMessage: Bool) {
        guard !isApplyingWorkspaceLayout,
              let json = encodedWorkspaceSnapshot(captureWorkspaceLayout()) else { return }

        if isCurrentOrderIndependent {
            saveCurrentLayoutForOrder(showMessage: showMessage)
            return
        }

        let currentKey = currentOrderCardHeightKey ?? ""
        guard activeWorkspaceLayoutOrderKey == currentKey,
              !activeWorkspaceLayoutIsIndependent else { return }

        upsertCurrentUserWorkspaceProfile(snapshotJSON: json, syncCloud: true)

        if showMessage {
            workspaceStatusMessage = t("Your card profile was saved", lang: seciliDil)
        }
    }

    private func loadCurrentUserWorkspaceProfile() {
        workspaceOwnerCardSyncDismissed = true
        guard let ownProfile = currentWorkspaceUserProfile(),
              let snapshot = decodedWorkspaceSnapshot(ownProfile.snapshotJSON) else { return }

        clearFollowedTeamCardProfile()
        applyWorkspaceLayout(snapshot)
        workspaceStatusMessage = t("Using your card profile", lang: seciliDil)
    }

    private func loadWorkspaceUserProfile(at index: Int) {
        guard workspaceUserProfiles.indices.contains(index),
              let snapshot = decodedWorkspaceSnapshot(workspaceUserProfiles[index].snapshotJSON) else { return }

        let profile = workspaceUserProfiles[index]
        applyWorkspaceLayout(snapshot)

        if profile.userId == currentWorkspaceProfileUserId {
            workspaceOwnerCardSyncDismissed = true
            clearFollowedTeamCardProfile()
            workspaceStatusMessage = t("Using your card profile", lang: seciliDil)
        } else {
            workspaceOwnerCardSyncDismissed = false
            workspaceFollowedTeamProfileUserId = profile.userId
            followedTeamProfileLastSnapshotJSON = profile.snapshotJSON.trimmingCharacters(in: .whitespacesAndNewlines)
            workspaceStatusMessage = t("Synced with team card profile", lang: seciliDil) + ": " + workspaceUserProfileDisplayName(profile)
        }
    }

    private func currentUserCardProfilesForDisplay() -> [WorkspaceProfileDTO] {
        currentWorkspaceUserProfile()?.savedProfiles ?? []
    }

    private func currentUserCardProfileName(at index: Int) -> String {
        let profiles = currentUserCardProfilesForDisplay()
        guard profiles.indices.contains(index) else { return "" }
        return profiles[index].name
    }

    private func updateCurrentUserCardProfileName(at index: Int, name: String) {
        updateCurrentUserWorkspaceProfile(syncCloud: true) { profile in
            guard profile.savedProfiles.indices.contains(index) else { return }
            profile.savedProfiles[index].name = name
        }
    }

    private func addCurrentUserCardProfile() {
        workspaceOwnerCardSyncDismissed = true
        clearFollowedTeamCardProfile()
        let json = encodedWorkspaceSnapshot(captureWorkspaceLayout()) ?? ""
        updateCurrentUserWorkspaceProfile(syncCloud: true) { profile in
            let nextNumber = profile.savedProfiles.count + 1
            profile.savedProfiles.append(WorkspaceProfileDTO(name: "Profile \(nextNumber)", snapshotJSON: json))
            if !json.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                profile.snapshotJSON = json
            }
        }
        workspaceStatusMessage = t("Card profile added", lang: seciliDil)
    }

    private func saveCurrentUserCardProfile(at index: Int) {
        workspaceOwnerCardSyncDismissed = true
        clearFollowedTeamCardProfile()
        guard let json = encodedWorkspaceSnapshot(captureWorkspaceLayout()) else { return }

        updateCurrentUserWorkspaceProfile(syncCloud: true) { profile in
            if profile.savedProfiles.isEmpty {
                profile.savedProfiles = [WorkspaceProfileDTO(name: "Profile 1", snapshotJSON: json)]
            }

            guard profile.savedProfiles.indices.contains(index) else { return }

            if profile.savedProfiles[index].name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                profile.savedProfiles[index].name = "Profile \(index + 1)"
            }

            profile.savedProfiles[index].snapshotJSON = json
            profile.snapshotJSON = json
        }

        let profileName = currentUserCardProfileName(at: index).trimmingCharacters(in: .whitespacesAndNewlines)
        workspaceStatusMessage = (profileName.isEmpty ? "Profile \(index + 1)" : profileName) + " " + t("saved", lang: seciliDil)
    }

    private func loadCurrentUserCardProfile(at index: Int) {
        workspaceOwnerCardSyncDismissed = true
        clearFollowedTeamCardProfile()
        let profiles = currentUserCardProfilesForDisplay()
        guard profiles.indices.contains(index),
              let snapshot = decodedWorkspaceSnapshot(profiles[index].snapshotJSON) else { return }

        let profileName = profiles[index].name
        applyWorkspaceLayout(snapshot)

        updateCurrentUserWorkspaceProfile(syncCloud: true) { profile in
            guard profile.savedProfiles.indices.contains(index) else { return }
            profile.snapshotJSON = profile.savedProfiles[index].snapshotJSON
        }

        workspaceStatusMessage = profileName + " " + t("loaded", lang: seciliDil)
    }

    private func deleteCurrentUserCardProfile(at index: Int) {
        workspaceOwnerCardSyncDismissed = true
        clearFollowedTeamCardProfile()
        updateCurrentUserWorkspaceProfile(syncCloud: true) { profile in
            guard profile.savedProfiles.count > 1, profile.savedProfiles.indices.contains(index) else { return }
            let removed = profile.savedProfiles.remove(at: index)

            if profile.snapshotJSON == removed.snapshotJSON {
                profile.snapshotJSON = profile.savedProfiles.first?.snapshotJSON ?? ""
            }
        }
        workspaceStatusMessage = t("Card profile deleted", lang: seciliDil)
    }

    private func currentUserCardProfileNameField(index: Int) -> some View {
        TextField(
            t("Profile name", lang: seciliDil),
            text: Binding(
                get: { currentUserCardProfileName(at: index) },
                set: { updateCurrentUserCardProfileName(at: index, name: $0) }
            )
        )
        .textFieldStyle(.roundedBorder)
        .font(.system(size: 12, weight: .semibold))
        .frame(minWidth: isCompactPhoneLayout ? 0 : 120)
    }

    @ViewBuilder
    private func currentUserCardProfileActionButtons(index: Int) -> some View {
        let profiles = currentUserCardProfilesForDisplay()

        Button(t("Save", lang: seciliDil)) {
            saveCurrentUserCardProfile(at: index)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.small)

        Button(t("Load", lang: seciliDil)) {
            loadCurrentUserCardProfile(at: index)
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .disabled(!profiles.indices.contains(index) || profiles[index].snapshotJSON.isEmpty)

        Button(role: .destructive) {
            deleteCurrentUserCardProfile(at: index)
        } label: {
            Image(systemName: "trash")
        }
        .buttonStyle(.borderless)
        .controlSize(.small)
        .disabled(profiles.count <= 1)
    }

    private func currentUserCardProfileRow(index: Int) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
                currentUserCardProfileNameField(index: index)
                currentUserCardProfileActionButtons(index: index)
            }

            VStack(alignment: .leading, spacing: 8) {
                currentUserCardProfileNameField(index: index)
                HStack(spacing: 8) {
                    currentUserCardProfileActionButtons(index: index)
                }
            }
        }
        .padding(8)
        .background(Color.white.opacity(colorScheme == .dark ? 0.05 : 0.55))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func migrateSharedWorkspaceProfilesIntoCurrentUserIfNeeded() {
        let legacyProfiles = workspaceProfiles.filter { !$0.snapshotJSON.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        guard !legacyProfiles.isEmpty else { return }

        let currentSavedProfiles = currentWorkspaceUserProfile()?.savedProfiles ?? []
        guard currentSavedProfiles.count <= 1 else { return }

        updateCurrentUserWorkspaceProfile(syncCloud: true) { profile in
            var migrated = legacyProfiles

            if !profile.snapshotJSON.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
               !migrated.contains(where: { $0.snapshotJSON == profile.snapshotJSON }) {
                migrated.insert(WorkspaceProfileDTO(name: "Profile 1", snapshotJSON: profile.snapshotJSON), at: 0)
            }

            profile.savedProfiles = normalizedPersonalCardProfiles(migrated, fallbackSnapshotJSON: profile.snapshotJSON)

            if profile.snapshotJSON.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                profile.snapshotJSON = profile.savedProfiles.first?.snapshotJSON ?? ""
            }
        }
    }

    private func loadWorkspaceProfiles() {
        if let data = workspaceProfilesJSON.data(using: .utf8),
           let decoded = try? JSONDecoder().decode([WorkspaceProfileDTO].self, from: data),
           !decoded.isEmpty {
            workspaceProfiles = decoded
            return
        }

        // Soft migration from the old Profile 1/2/3 system to unlimited profiles.
        var migrated: [WorkspaceProfileDTO] = []
        if !workspaceProfile1JSON.isEmpty {
            migrated.append(WorkspaceProfileDTO(name: "Profile 1", snapshotJSON: workspaceProfile1JSON))
        }
        if !workspaceProfile2JSON.isEmpty {
            migrated.append(WorkspaceProfileDTO(name: "Profile 2", snapshotJSON: workspaceProfile2JSON))
        }
        if !workspaceProfile3JSON.isEmpty {
            migrated.append(WorkspaceProfileDTO(name: "Profile 3", snapshotJSON: workspaceProfile3JSON))
        }

        if migrated.isEmpty {
            migrated = [WorkspaceProfileDTO(name: "Profile 1", snapshotJSON: "")]
        }

        workspaceProfiles = migrated
        saveWorkspaceProfilesToStorage()
    }

    private func saveWorkspaceProfilesToStorage() {
        let cleaned = workspaceProfiles.map { profile in
            WorkspaceProfileDTO(
                id: profile.id,
                name: profile.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Profile" : profile.name,
                snapshotJSON: profile.snapshotJSON
            )
        }

        if let data = try? JSONEncoder().encode(cleaned),
           let str = String(data: data, encoding: .utf8) {
            workspaceProfilesJSON = str

            if !isApplyingWorkspaceProfilesFromCloud {
                saveWorkspaceSettingsToCloud(workspaceProfilesJSON: str)
            }
        }
    }

    private func addWorkspaceProfile() {
        let nextNumber = workspaceProfiles.count + 1
        workspaceProfiles.append(WorkspaceProfileDTO(name: "Profile \(nextNumber)", snapshotJSON: ""))
        saveWorkspaceProfilesToStorage()
        workspaceStatusMessage = t("Profile added", lang: seciliDil)
    }

    private func deleteWorkspaceProfile(at index: Int) {
        guard workspaceProfiles.count > 1, workspaceProfiles.indices.contains(index) else { return }
        workspaceProfiles.remove(at: index)
        saveWorkspaceProfilesToStorage()
        workspaceStatusMessage = t("Profile deleted", lang: seciliDil)
    }

    private func saveWorkspaceProfile(at index: Int) {
        guard workspaceProfiles.indices.contains(index),
              let json = encodedWorkspaceSnapshot(captureWorkspaceLayout()) else { return }

        if workspaceProfiles[index].name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            workspaceProfiles[index].name = "Profile \(index + 1)"
        }

        workspaceProfiles[index].snapshotJSON = json
        saveWorkspaceProfilesToStorage()
        persistWorkspaceCustomizationChange()
        workspaceStatusMessage = workspaceProfiles[index].name + " " + t("saved", lang: seciliDil)
    }

    private func loadWorkspaceProfile(at index: Int) {
        guard workspaceProfiles.indices.contains(index),
              let snapshot = decodedWorkspaceSnapshot(workspaceProfiles[index].snapshotJSON) else { return }

        let profileName = workspaceProfiles[index].name
        applyWorkspaceLayout(snapshot)
        persistWorkspaceCustomizationChange()
        workspaceStatusMessage = profileName + " " + t("loaded", lang: seciliDil)
    }

    private func switchWorkspaceMode(to newMode: String) {
        // Kept for compatibility with older saved settings.
        // New behavior is shared-by-default, with optional independent layouts per order.
        workspaceCustomizationMode = "shared"
        if newMode == "perOrder" {
            detachCurrentOrderFromShared()
        } else {
            resetCurrentOrderLayoutToShared()
        }
    }

    private func loadWorkspaceForCurrentOrderIfNeeded() {
        activeWorkspaceLayoutOrderKey = "__loading__\(currentOrderCardHeightKey ?? "")"
        activeWorkspaceLayoutIsIndependent = false
        ensureSharedWorkspaceSnapshot()
        // Cleared only after ensureSharedWorkspaceSnapshot: while the screen
        // still shows the previous order's TYPE layout, the shared snapshot
        // must not be seeded from it.
        activeWorkspaceLayoutIsTypeManaged = false

        if let json = siparis.customFields?[orderWorkspaceLayoutKey],
           let snapshot = decodedWorkspaceSnapshot(json) {
            markWorkspaceLayoutApplied(isIndependent: true)
            applyWorkspaceLayout(snapshot)
            workspaceStatusMessage = t("Loaded this order layout", lang: seciliDil)
            return
        }

        // Order-TYPE layout (server/web parity): a layout saved for an order
        // type (e.g. repair) is the workspace's convention for those orders —
        // it beats personal profiles so a repair order looks like a repair
        // order for everyone. The per-order independent layout still wins
        // above. Display-only: the type-managed flag suppresses every
        // auto-save so this layout can never leak into the user's card
        // profile or the shared snapshot.
        if let typeSnapshot = currentOrderTypeWorkspaceSnapshot() {
            markWorkspaceLayoutApplied(isIndependent: false, isTypeManaged: true)
            applyWorkspaceLayout(typeSnapshot)
            return
        }

        if !workspaceFollowedTeamProfileUserId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           followedTeamWorkspaceUserProfile() != nil {
            markWorkspaceLayoutApplied(isIndependent: false)
            applyFollowedTeamWorkspaceProfileIfNeeded(force: true)
            return
        }

        if startDefaultOwnerCardSyncIfNeeded(applyImmediately: true) {
            return
        }

        if let ownProfile = currentWorkspaceUserProfile(),
           let snapshot = decodedWorkspaceSnapshot(ownProfile.snapshotJSON) {
            markWorkspaceLayoutApplied(isIndependent: false)
            applyWorkspaceLayout(snapshot)
            workspaceStatusMessage = t("Using your card profile", lang: seciliDil)
            return
        }

        if let shared = decodedWorkspaceSnapshot(sharedWorkspaceSnapshotJSON) {
            markWorkspaceLayoutApplied(isIndependent: false)
            applyWorkspaceLayout(shared)

            if isCurrentWorkspaceOwnerProfile || workspaceOwnerCardSyncDismissed {
                saveCurrentUserWorkspaceProfile(showMessage: false)
                workspaceStatusMessage = t("Using your card profile", lang: seciliDil)
            } else {
                workspaceStatusMessage = t("Synced with team card profile", lang: seciliDil)
            }
        }
    }

    private func saveSharedLayout(showMessage: Bool) {
        guard !isApplyingWorkspaceLayout else { return }
        sharedWorkspaceSnapshotJSON = encodedWorkspaceSnapshot(captureWorkspaceLayout()) ?? sharedWorkspaceSnapshotJSON
        workspaceCustomizationMode = "shared"
        saveWorkspaceSettingsToCloud(sharedWorkspaceSnapshotJSON: sharedWorkspaceSnapshotJSON)

        if showMessage {
            workspaceStatusMessage = t("Shared layout saved", lang: seciliDil)
        }
    }

    private func detachCurrentOrderFromShared() {
        ensureSharedWorkspaceSnapshot()
        saveCurrentLayoutForOrder(showMessage: false)
        workspaceStatusMessage = t("This order is now independent", lang: seciliDil)
    }

    private func saveCurrentLayoutForOrder(showMessage: Bool) {
        guard let json = encodedWorkspaceSnapshot(captureWorkspaceLayout(includeCurrentOrderHeightsAsShared: true)) else { return }

        markWorkspaceLayoutApplied(isIndependent: true)
        var fields = siparis.customFields ?? [:]
        fields[orderWorkspaceLayoutKey] = json
        siparis.customFields = fields
        saveOrderWorkspaceLayoutSnapshotToCloud(snapshotJSON: json)

        if showMessage {
            workspaceStatusMessage = t("Saved layout for this order", lang: seciliDil)
        }
    }

    private func resetCurrentOrderLayoutToShared() {
        var fields = siparis.customFields ?? [:]
        fields.removeValue(forKey: orderWorkspaceLayoutKey)
        siparis.customFields = fields
        resetOrderWorkspaceLayoutOnServer()

        if let snapshot = decodedWorkspaceSnapshot(sharedWorkspaceSnapshotJSON) {
            applyWorkspaceLayout(snapshot)
            saveCurrentUserWorkspaceProfile(showMessage: false)
        }
        workspaceStatusMessage = t("This order now uses the shared layout", lang: seciliDil)
    }

    private func persistWorkspaceCustomizationChange() {
        guard !isApplyingWorkspaceLayout else { return }

        let currentKey = currentOrderCardHeightKey ?? ""
        guard activeWorkspaceLayoutOrderKey == currentKey else { return }
        guard !(activeWorkspaceLayoutIsIndependent && !isCurrentOrderIndependent) else { return }
        // The layout on screen is the workspace's order-TYPE convention (e.g.
        // repair). It is read-only on this device: auto-saving here would
        // upload the type layout into the user's card profile / shared
        // snapshot — the exact clobber this file's settle-gate exists to
        // prevent. Same protection the independent per-order layout gets.
        guard !activeWorkspaceLayoutIsTypeManaged else { return }

        if isCurrentOrderIndependent {
            saveCurrentLayoutForOrder(showMessage: false)
            return
        }

        if !workspaceFollowedTeamProfileUserId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            workspaceOwnerCardSyncDismissed = true
            clearFollowedTeamCardProfile()
            workspaceStatusMessage = t("Team card sync stopped", lang: seciliDil)
        }

        saveCurrentUserWorkspaceProfile(showMessage: false)
    }

    private func getWidth(for index: Int) -> Double {
        if sutunGenislikleri.indices.contains(index) {
            return min(max(sutunGenislikleri[index], 260), 800)
        }
        return 350
    }

    private func getBinding(for index: Int) -> Binding<Double> {
        Binding(
            get: { getWidth(for: index) },
            set: { yeniDeger in
                var guncel = sutunGenislikleri
                while guncel.count <= index { guncel.append(350) }
                guncel[index] = min(max(yeniDeger, 260), 800)
                sutunGenislikleri = guncel
            }
        )
    }

    private func saveWidths() {
        while sutunGenislikleri.count < kartYerlesimi.count {
            sutunGenislikleri.append(350)
        }

        if sutunGenislikleri.indices.contains(0) { savedColLeft = sutunGenislikleri[0] }
        if sutunGenislikleri.indices.contains(1) { savedColMid = sutunGenislikleri[1] }
        if sutunGenislikleri.indices.contains(2) { savedColRight = sutunGenislikleri[2] }

        kaydetSutunGenislikleri()
        yenileCalismaAlaniHitbox()
        persistWorkspaceCustomizationChange()
    }

    private func yukleSutunGenislikleri() {
        if let data = sutunGenislikleriJSON.data(using: .utf8),
           let dec = try? JSONDecoder().decode([Double].self, from: data),
           !dec.isEmpty {
            sutunGenislikleri = dec.map { min(max($0, 260), 800) }
        } else {
            sutunGenislikleri = [savedColLeft, savedColMid, savedColRight].map { min(max($0, 260), 800) }
        }

        while sutunGenislikleri.count < 3 {
            sutunGenislikleri.append(350)
        }
    }

    private func kaydetSutunGenislikleri() {
        if let data = try? JSONEncoder().encode(sutunGenislikleri),
           let str = String(data: data, encoding: .utf8) {
            sutunGenislikleriJSON = str
        }
    }

    private func guncelleSutunSayisi(viewport: CGSize) {
        let temelSutunAlani: CGFloat = 390
        let hedef = min(8, max(3, Int((viewport.width + 40) / temelSutunAlani)))
        guard hedef > kartYerlesimi.count else { return }

        while kartYerlesimi.count < hedef {
            kartYerlesimi.append([])
        }

        while sutunGenislikleri.count < hedef {
            sutunGenislikleri.append(350)
        }

        kaydetKartYerlesimi()
        kaydetSutunGenislikleri()
        yenileCalismaAlaniHitbox(delay: 0.05)
    }

    private func bindingYukseklik(for tip: KartTipi) -> Binding<Double?> { Binding(get: { kartYukseklikleri[tip.rawValue] }, set: { kartYukseklikleri[tip.rawValue] = $0 }) }

    private func yukleHafiza() {
        if let data = kartYerlesimiJSON.data(using: .utf8),
           let dec = try? JSONDecoder().decode([[KartTipi]].self, from: data),
           !dec.isEmpty {
            kartYerlesimi = dec
        }
        while kartYerlesimi.count < 3 { kartYerlesimi.append([]) }

        if let data = kartYukseklikleriJSON.data(using: .utf8),
           let dict = try? JSONDecoder().decode([String: Double].self, from: data) {
            kartYukseklikleri = dict
            sharedKartYukseklikleri = dict
        }

        if let historyHeight = kartYukseklikleri[KartTipi.historyLog.rawValue],
           historyHeight > 900 {
            kartYukseklikleri[KartTipi.historyLog.rawValue] = historyLogCompactCardHeight
            sharedKartYukseklikleri[KartTipi.historyLog.rawValue] = historyLogCompactCardHeight
        }
        normalizeClientFilesCardHeightIfNeeded()
        if sharedKartYukseklikleri.isEmpty {
            sharedKartYukseklikleri = kartYukseklikleri
        }
        
        if let data = kartRenkleriJSON.data(using: .utf8),
           let dict = try? JSONDecoder().decode([String: String].self, from: data) {
            kartRenkleri = dict
        }

        let tumKartlar = kartYerlesimi.flatMap { $0 }

        if !tumKartlar.contains(.customerNotes) {
            let hedef = min(1, kartYerlesimi.count - 1)
            kartYerlesimi[hedef].append(.customerNotes)
            kaydetKartYerlesimi()
        }

        if !tumKartlar.contains(.materials) {
            let hedef = min(1, kartYerlesimi.count - 1)
            kartYerlesimi[hedef].append(.materials)
            kaydetKartYerlesimi()
        }

        if !tumKartlar.contains(.invoiceItems) {
            if let col = kartYerlesimi.firstIndex(where: { $0.contains(.customer) }),
               let idx = kartYerlesimi[col].firstIndex(of: .customer) {
                kartYerlesimi[col].insert(.invoiceItems, at: min(idx + 1, kartYerlesimi[col].count))
            } else {
                let hedef = min(1, kartYerlesimi.count - 1)
                kartYerlesimi[hedef].append(.invoiceItems)
            }
            kaydetKartYerlesimi()
        }

        if !tumKartlar.contains(.priority) {
            let hedef = min(2, kartYerlesimi.count - 1)
            kartYerlesimi[hedef].insert(.priority, at: 0)
            kaydetKartYerlesimi()
        }

        if !tumKartlar.contains(.schedule) {
            let hedef = min(2, kartYerlesimi.count - 1)
            if let shippingIndex = kartYerlesimi[hedef].firstIndex(of: .shipping) {
                kartYerlesimi[hedef].insert(.schedule, at: min(shippingIndex + 1, kartYerlesimi[hedef].count))
            } else {
                kartYerlesimi[hedef].append(.schedule)
            }
            kaydetKartYerlesimi()
        }

        if !kartYerlesimi.flatMap({ $0 }).contains(.historyLog) {
            let hedef = min(2, kartYerlesimi.count - 1)
            if let scheduleIndex = kartYerlesimi[hedef].firstIndex(of: .schedule) {
                kartYerlesimi[hedef].insert(.historyLog, at: min(scheduleIndex + 1, kartYerlesimi[hedef].count))
            } else {
                kartYerlesimi[hedef].append(.historyLog)
            }
            kaydetKartYerlesimi()
        }

        healOrphanedVisibleCards()


        if !kartYerlesimi.flatMap({ $0 }).contains(.clientFiles) {
            let hedef = min(1, kartYerlesimi.count - 1)
            if let notesIndex = kartYerlesimi[hedef].firstIndex(of: .notes) {
                kartYerlesimi[hedef].insert(.clientFiles, at: min(notesIndex + 1, kartYerlesimi[hedef].count))
            } else {
                kartYerlesimi[hedef].append(.clientFiles)
            }
            kaydetKartYerlesimi()
        }

        if !kartYerlesimi.flatMap({ $0 }).contains(.workTime) {
            let hedef = min(2, kartYerlesimi.count - 1)
            if let todoIndex = kartYerlesimi[hedef].firstIndex(of: .todo) {
                kartYerlesimi[hedef].insert(.workTime, at: min(todoIndex + 1, kartYerlesimi[hedef].count))
            } else if let priorityIndex = kartYerlesimi[hedef].firstIndex(of: .priority) {
                kartYerlesimi[hedef].insert(.workTime, at: min(priorityIndex + 1, kartYerlesimi[hedef].count))
            } else {
                kartYerlesimi[hedef].append(.workTime)
            }
            kaydetKartYerlesimi()
        }

        while sutunGenislikleri.count < kartYerlesimi.count {
            sutunGenislikleri.append(350)
        }
    }
    
    // 🌟 KART RENK KAYDETME VE OKUMA MOTORU 🌟
    private func setKartColor(kart: KartTipi, color: String) {
        // Dictionary subscript mutation can redraw late on iPad/macOS.
        // Reassigning a fresh dictionary makes SwiftUI refresh the selected block immediately.
        var guncelRenkler = kartRenkleri
        guncelRenkler[kart.rawValue] = color
        kartRenkleri = guncelRenkler

        if let data = try? JSONEncoder().encode(guncelRenkler),
           let str = String(data: data, encoding: .utf8) {
            kartRenkleriJSON = str
        }

        // Save the color into the active workspace layout too.
        // Without this, switching orders reloads the old shared/independent layout and the color disappears.
        persistWorkspaceCustomizationChange()

        // Force a lightweight refresh so the block color does not stay dim/stale until another block changes.
        withAnimation(.snappy) {
            uiTetikleyici.toggle()
        }
        yenileCalismaAlaniHitbox(delay: 0.01)
    }

    private func getKartColor(kart: KartTipi) -> String {
        return kartRenkleri[kart.rawValue] ?? t("Default", lang: seciliDil)
    }

    private func kaydetKartYerlesimi() {
        if let data = try? JSONEncoder().encode(kartYerlesimi),
           let str = String(data: data, encoding: .utf8) {
            kartYerlesimiJSON = str
        }
        persistWorkspaceCustomizationChange()
    }
    private func applyKartYerlesimiForHistory(_ layout: [[KartTipi]]) {
        var cleanedLayout = layout
        while cleanedLayout.count < 3 {
            cleanedLayout.append([])
        }

        kartYerlesimi = cleanedLayout
        ensureRequiredCardsInCurrentLayout()

        while sutunGenislikleri.count < kartYerlesimi.count {
            sutunGenislikleri.append(350)
        }

        kaydetKartYerlesimi()
        yenileCalismaAlaniHitbox(delay: 0.01)
    }

    private func bitirSuruklemeyiVeKaydet() {
        let eskiYerlesim = kartYerlesimiBeforeDrag
        let yeniYerlesim = kartYerlesimi
        kartYerlesimiBeforeDrag = nil

        showWorkspaceEmptyDropTargets = false
        workspaceCardInsertDropTarget = nil
        CardDragCoordinator.shared.endSession()
        draggedKart = nil
        PlatformCursor.arrowSet()
        kaydetKartYerlesimi()

        if let eskiYerlesim, eskiYerlesim != yeniYerlesim {
            firebaseManager.registerUIChange(
                title: "Move Block",
                undo: { applyKartYerlesimiForHistory(eskiYerlesim) },
                redo: { applyKartYerlesimiForHistory(yeniYerlesim) }
            )
        }

        yenileCalismaAlaniHitbox(delay: 0.05)
    }

    private func kaydetKartYukseklikleri() {
        rememberCurrentOrderCardHeights()
        saveActiveCardHeightsLocally()
        yenileCalismaAlaniHitbox()
        persistWorkspaceCustomizationChange()
    }

    // "Match column" from the card options menu: every card in the source
    // card's desktop column (kartYerlesimi) gets the source card's current
    // effective height. Persists through kaydetKartYukseklikleri — the exact
    // pipeline the continuous resize handles use.
    private func handleCardSizeActionRequest(_ notification: Notification) {
        guard let info = notification.userInfo,
              let rawKart = info["card"] as? String,
              let kart = KartTipi(rawValue: rawKart),
              let action = info["action"] as? String else { return }
        guard action == "matchColumn",
              let hedefBoy = info["height"] as? Double, hedefBoy > 0 else { return }
        guard let sutun = kartYerlesimi.first(where: { $0.contains(kart) }), !sutun.isEmpty else { return }

        var guncel = kartYukseklikleri
        for uye in sutun { guncel[uye.rawValue] = hedefBoy }
        withAnimation(.snappy) { kartYukseklikleri = guncel }
        kaydetKartYukseklikleri()
    }

    private func yenileCalismaAlaniHitbox(delay: Double = 0.02) {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            self.macOSHitboxHack = self.macOSHitboxHack == 0 ? 0.1 : 0
            self.uiTetikleyici.toggle()
            #if os(macOS)
            for window in NSApplication.shared.windows {
                if let view = window.contentView {
                    window.invalidateCursorRects(for: view)
                    view.needsLayout = true
                    view.needsDisplay = true
                }
            }
            #endif
        }
    }
    
    @ViewBuilder
    private func kartGosterici(icin kart: KartTipi, colIndex: Int) -> some View {
        if !isCardAllowedByPlan(kart) {
            planLockedKarti(for: kart, colIndex: colIndex)
        } else {
            switch kart {
            case .repairIntake: repairIntakeKarti(colIndex: colIndex)
            case .estimate: estimateKarti(colIndex: colIndex)
            case .customerPortal: customerPortalKarti(colIndex: colIndex)
            case .preview: previewKarti(colIndex: colIndex)
            case .summary: summaryKarti(colIndex: colIndex)
            case .customer:
                customerKarti(colIndex: colIndex)
                    .studioFirstRunGuideHighlight(shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 2)
                    .zIndex((shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 2) ? 70 : 0)
            case .delivery: deliveryKarti(colIndex: colIndex)
            case .communication: communicationKarti(colIndex: colIndex)
            case .notes: notesKarti(colIndex: colIndex)
            case .financial:
                financialKarti(colIndex: colIndex)
                    .overlay(alignment: .topLeading) {
                        if shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 5 {
                            macFirstProjectGuideFinancialCardBubble
                        }
                    }
                    .zIndex((shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 5) ? 80 : 0)
            case .status: statusKarti(colIndex: colIndex)
            case .shipping: shippingKarti(colIndex: colIndex)
            case .schedule: scheduleKarti(colIndex: colIndex)
            case .historyLog: historyLogKarti(colIndex: colIndex)
            case .clientFiles: clientFilesKarti(colIndex: colIndex)
            case .todo: toDoKarti(colIndex: colIndex)
            case .workTime: workTimeKarti(colIndex: colIndex)
            case .customerNotes: customerNotesKarti(colIndex: colIndex)
            case .materials: materialsKarti(colIndex: colIndex)
            case .priority: priorityKarti(colIndex: colIndex)
            case .invoiceItems: invoiceItemsKarti(colIndex: colIndex)
            }
        }
    }

    private func planLockedKarti(for kart: KartTipi, colIndex: Int) -> some View {
        DetayKarti(
            title: workspaceBlockTitle(for: kart),
            iconName: cardHeaderIcon(for: kart),
            kartTipi: kart,
            yukseklik: bindingYukseklik(for: kart),
            sutunGenisligi: getBinding(for: colIndex),
            draggedKart: $draggedKart,
            uiTetikleyici: uiTetikleyici,
            kartRengi: getKartColor(kart: kart),
            minimumHeightOverride: kart == .historyLog
                ? max(isPhoneLayout ? 340 : 280, varsayilanKartYuksekligi(for: kart))
                : max(240, varsayilanKartYuksekligi(for: kart)),
            onHeightChangeEnd: kaydetKartYukseklikleri,
            onWidthChangeEnd: saveWidths,
            onHide: { setCardVisibleWithUndo(kart, false) },
            onColorChange: { setKartColor(kart: kart, color: $0) }
        ) {
            lockedFeatureUpsellCard(
                title: workspaceBlockTitle(for: kart),
                requiredPlan: requiredPlanLabel(for: kart),
                message: t("This card is locked on your current plan.", lang: seciliDil),
                footer: t("You can keep the card visible as a reminder, or hide it from Workspace Blocks.", lang: seciliDil),
                iconName: cardHeaderIcon(for: kart),
                compact: false
            )
        }
        .overlay(alignment: .topLeading) {
            if shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 5 && kart == .financial {
                macFirstProjectGuideFinancialCardBubble
            }
        }
        .zIndex((shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 5 && kart == .financial) ? 80 : 0)
    }

    private func lockedFeatureUpsellCard(
        title: String,
        requiredPlan: String,
        message: String,
        footer: String? = nil,
        iconName: String = "lock.fill",
        compact: Bool = false
    ) -> some View {
        VStack(alignment: .leading, spacing: compact ? 10 : 14) {
            HStack(alignment: .top, spacing: compact ? 10 : 12) {
                ZStack(alignment: .bottomTrailing) {
                    Image(systemName: iconName)
                        .font(.system(size: compact ? 17 : 22, weight: .semibold))
                        .foregroundColor(studioWarningOrange)
                        .frame(width: compact ? 36 : 46, height: compact ? 36 : 46)
                        .background(
                            RoundedRectangle(cornerRadius: compact ? 11 : 14, style: .continuous)
                                .fill(studioWarningOrange.opacity(colorScheme == .dark ? 0.18 : 0.12))
                        )

                    Image(systemName: "lock.fill")
                        .font(.system(size: compact ? 8 : 9, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: compact ? 16 : 18, height: compact ? 16 : 18)
                        .background(Circle().fill(studioWarningOrange))
                        .offset(x: 3, y: 3)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text(title)
                        .font(.system(size: compact ? 13 : 15, weight: .bold))
                        .foregroundColor(.primary)
                        .fixedSize(horizontal: false, vertical: true)

                    Text(message)
                        .font(.system(size: compact ? 11 : 12, weight: .medium))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    if !requiredPlan.isEmpty {
                        HStack(spacing: 6) {
                            Image(systemName: "sparkles")
                                .font(.system(size: 10, weight: .bold))
                            Text(t("Available from", lang: seciliDil) + " " + requiredPlan)
                                .font(.system(size: compact ? 10 : 11, weight: .bold))
                        }
                        .foregroundColor(studioWarningOrange)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Capsule().fill(studioWarningOrange.opacity(colorScheme == .dark ? 0.18 : 0.12)))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            if let footer, !footer.isEmpty {
                Text(footer)
                    .font(.system(size: compact ? 10 : 11))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, compact ? 0 : 2)
            }

            Button {
                openPlanAccessFromLockedFeature()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "rectangle.stack.badge.person.crop")
                        .font(.system(size: 10, weight: .semibold))
                    Text(t("Plan & Access", lang: seciliDil))
                        .font(.system(size: 10, weight: .semibold))
                    Image(systemName: "chevron.right")
                        .font(.system(size: 8, weight: .bold))
                }
                .foregroundColor(.secondary)
                .padding(.horizontal, 9)
                .padding(.vertical, 5)
                .background(
                    Capsule()
                        .fill(Color.primary.opacity(colorScheme == .dark ? 0.10 : 0.06))
                )
            }
            .buttonStyle(.plain)
        }
        .padding(compact ? 12 : 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: compact ? 14 : 18, style: .continuous)
                .fill(studioWarningOrange.opacity(colorScheme == .dark ? 0.10 : 0.07))
        )
        .overlay(
            RoundedRectangle(cornerRadius: compact ? 14 : 18, style: .continuous)
                .stroke(studioWarningOrange.opacity(colorScheme == .dark ? 0.28 : 0.20), lineWidth: 1)
        )
    }
    
    private let historyLogEmptyCardHeight: Double = 210
    private let historyLogCompactCardHeight: Double = 360
    private let historyLogRowHeight: CGFloat = 70
    private let historyLogRowSpacing: CGFloat = 8
    private let historyLogCardChromeHeight: CGFloat = 132
    private let clientFilesVisibleRowLimit = 3
    private let clientFilesRowHeight: CGFloat = 64
    private let clientFilesRowSpacing: CGFloat = 8
    private let clientFilesCardChromeHeight: CGFloat = 256
    private let clientFilesEmptyCardHeight: Double = 360
    private let clientFilesMinimumCardHeightWithFiles: Double = 310
    private let clientFilesMaximumStableCardHeight: Double = 900
    private let workTimeVisibleSessionLimit = 3
    private let workTimeSessionRowHeight: CGFloat = 64
    private let workTimeSessionRowSpacing: CGFloat = 8
    private let workTimeGroupHeaderHeight: CGFloat = 18
    private let workTimeDefaultCardHeight: Double = 380
    private let workTimeCardChromeHeight: CGFloat = 116
    private let workTimeTotalBlockHeight: CGFloat = 64
    private let workTimeActiveBlockHeight: CGFloat = 54
    private let workTimeControlsBlockHeight: CGFloat = 40
    private let workTimeLockedBlockHeight: CGFloat = 50
    private let workTimeMessageBlockHeight: CGFloat = 24
    private let workTimeEmptyBlockHeight: CGFloat = 78
    private let workTimeContentSpacing: CGFloat = 12

    private var historyLogPreferredCardHeight: Double {
        guard !orderHistoryItems.isEmpty else { return historyLogEmptyCardHeight }
        let visibleCount = min(max(orderHistoryItems.count, 1), 3)
        let rowsHeight = historyLogRowsHeightForVisibleCount(visibleCount)
        return max(historyLogEmptyCardHeight, min(historyLogCompactCardHeight, Double(historyLogCardChromeHeight + rowsHeight)))
    }

    private func historyLogRowsHeightForVisibleCount(_ count: Int) -> CGFloat {
        let visibleCount = max(count, 1)
        return CGFloat(visibleCount) * historyLogRowHeight + CGFloat(max(visibleCount - 1, 0)) * historyLogRowSpacing
    }

    private func historyLogRowsHeight(for cardHeight: Double?) -> CGFloat {
        let visibleCount = min(max(orderHistoryItems.count, 1), 3)
        let defaultRowsHeight = historyLogRowsHeightForVisibleCount(visibleCount)
        let effectiveCardHeight = CGFloat(cardHeight ?? historyLogPreferredCardHeight)
        let availableRowsHeight = effectiveCardHeight - historyLogCardChromeHeight
        return max(defaultRowsHeight, availableRowsHeight)
    }

    private var clientFilesPreferredCardHeight: Double {
        guard !clientFileItems.isEmpty else { return clientFilesEmptyCardHeight }
        let rowCount = min(max(clientFileItems.count, 1), clientFilesVisibleRowLimit)
        let rowsHeight = clientFilesRowsHeightForVisibleCount(rowCount)
        return max(clientFilesMinimumCardHeightWithFiles, Double(clientFilesCardChromeHeight + rowsHeight))
    }

    private func clientFilesRowsHeightForVisibleCount(_ count: Int) -> CGFloat {
        let visibleCount = max(count, 1)
        return CGFloat(visibleCount) * clientFilesRowHeight + CGFloat(max(visibleCount - 1, 0)) * clientFilesRowSpacing
    }

    private func clientFilesRowsHeight(for cardHeight: Double?, fileCount: Int) -> CGFloat {
        let visibleCount = min(max(fileCount, 1), clientFilesVisibleRowLimit)
        let defaultRowsHeight = clientFilesRowsHeightForVisibleCount(visibleCount)
        let effectiveCardHeight = CGFloat(cardHeight ?? clientFilesPreferredCardHeight)
        let availableRowsHeight = effectiveCardHeight - clientFilesCardChromeHeight
        return max(defaultRowsHeight, availableRowsHeight)
    }

    private func normalizeClientFilesCardHeightIfNeeded() {
        let key = KartTipi.clientFiles.rawValue
        guard let currentHeight = kartYukseklikleri[key],
              currentHeight > clientFilesMaximumStableCardHeight else { return }
        kartYukseklikleri[key] = varsayilanKartYuksekligi(for: .clientFiles)
        if let orderKey = currentOrderCardHeightKey,
           orderKartYukseklikleri[orderKey] != nil {
            orderKartYukseklikleri[orderKey] = kartYukseklikleri
        } else {
            sharedKartYukseklikleri = kartYukseklikleri
        }
    }

    private func clientFileMergeKey(_ item: ClientFileItem) -> String {
        let storagePath = item.storagePath.trimmingCharacters(in: .whitespacesAndNewlines)
        if !storagePath.isEmpty { return "storage:\(storagePath)" }

        let downloadURL = item.downloadURL.trimmingCharacters(in: .whitespacesAndNewlines)
        if !downloadURL.isEmpty { return "url:\(downloadURL)" }

        let pendingQueueId = item.pendingQueueId.trimmingCharacters(in: .whitespacesAndNewlines)
        if !pendingQueueId.isEmpty { return "pending:\(pendingQueueId)" }

        return "id:\(item.id.uuidString)"
    }

    private func sortedClientFiles(_ files: [ClientFileItem]) -> [ClientFileItem] {
        files.sorted { first, second in
            if first.isPendingUpload != second.isPendingUpload {
                return first.isPendingUpload
            }
            return first.uploadedAt > second.uploadedAt
        }
    }

    private func mergedClientFilesFromCloud(_ cloudFiles: [ClientFileItem]) -> [ClientFileItem] {
        var merged = cloudFiles
        var knownKeys = Set(cloudFiles.map(clientFileMergeKey))

        for localFile in siparis.clientFiles ?? [] {
            let key = clientFileMergeKey(localFile)
            guard !knownKeys.contains(key) else { continue }

            // Keep local pending/current upload rows while the server snapshot is catching up.
            if localFile.isPendingUpload || isUploadingClientFile || isImportingSharedClientFiles {
                merged.append(localFile)
                knownKeys.insert(key)
            }
        }

        return sortedClientFiles(merged)
    }

    private func historyLogMergeKey(_ item: OrderHistoryLogItem) -> String {
        "id:\(item.id.uuidString)"
    }

    private func mergedHistoryLogFromCloud(_ cloudItems: [OrderHistoryLogItem]) -> [OrderHistoryLogItem] {
        var merged = cloudItems
        var knownKeys = Set(cloudItems.map(historyLogMergeKey))

        for localItem in siparis.historyLog ?? [] {
            let key = historyLogMergeKey(localItem)
            guard !knownKeys.contains(key) else { continue }
            merged.append(localItem)
            knownKeys.insert(key)
        }

        return Array(merged.sorted { $0.createdAt > $1.createdAt }.prefix(120))
    }

    private func syncOrderCollectionsFromCloud(_ orders: [Siparis]) {
        guard let orderId = siparis.id,
              let cloudOrder = orders.first(where: { $0.id == orderId }) else { return }

        let nextClientFiles = mergedClientFilesFromCloud(cloudOrder.clientFiles ?? [])
        if sortedClientFiles(siparis.clientFiles ?? []) != nextClientFiles {
            siparis.clientFiles = nextClientFiles
        }

        let nextHistoryLog = mergedHistoryLogFromCloud(cloudOrder.historyLog ?? [])
        if (siparis.historyLog ?? []) != nextHistoryLog {
            siparis.historyLog = nextHistoryLog
        }
    }

    private var orderHistoryItems: [OrderHistoryLogItem] {
        (siparis.historyLog ?? []).sorted { first, second in
            first.createdAt > second.createdAt
        }
    }

    private func orderHistoryDateText(_ date: Date) -> String {
        date.formatted(date: .abbreviated, time: .shortened)
    }

    private func cleanHistoryValue(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "-" : trimmed
    }

    private func amountHistoryValue(_ value: Double) -> String {
        "\(seciliParaBirimi)\(formatFiyat(value, ondalik: seciliOndalik))"
    }

    private func boolHistoryValue(_ value: Bool) -> String {
        lt(value ? "Yes" : "No")
    }

    private func recordOrderHistoryEvent(title: String, value: String = "") {
        let cleanedValue = cleanHistoryValue(value)
        var logs = siparis.historyLog ?? []
        logs.insert(OrderHistoryLogItem(id: UUID(), createdAt: Date(), title: title, oldValue: "-", newValue: cleanedValue), at: 0)
        if logs.count > 120 {
            logs = Array(logs.prefix(120))
        }
        siparis.historyLog = logs
    }

    private func recordSemanticOrderHistoryIfNeeded(title: String, oldValue: String, newValue: String) {
        let cleanedOld = cleanHistoryValue(oldValue)
        let cleanedNew = cleanHistoryValue(newValue)
        guard cleanedOld != cleanedNew else { return }

        let titleLower = title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let newLower = cleanedNew.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let oldWasEmpty = cleanedOld == "-"
        let newHasValue = cleanedNew != "-"

        if titleLower == "tracking number", oldWasEmpty, newHasValue {
            recordOrderHistoryEvent(title: "Tracking number added", value: cleanedNew)
        }

        if titleLower == "design status" || titleLower.contains("design") || titleLower.contains("approval") || titleLower.contains("mockup") {
            if newLower.contains("approved") || newLower.contains("approval") || newLower == "done" || newLower == "complete" || newLower == "completed" {
                recordOrderHistoryEvent(title: "Customer approved design", value: cleanedNew)
            }

            if newLower.contains("mockup") || newLower.contains("sent") || newLower.contains("draft sent") {
                recordOrderHistoryEvent(title: "Design mockup sent", value: cleanedNew)
            }
        }

        if titleLower == "order status" || titleLower.contains("painting") || titleLower.contains("production") {
            if newLower.contains("progress") || newLower.contains("painting") || newLower.contains("production") || newLower.contains("started") {
                recordOrderHistoryEvent(title: "Painting started", value: cleanedNew)
            }

            if newLower == "done" || newLower == "complete" || newLower == "completed" {
                recordOrderHistoryEvent(title: "Order completed", value: cleanedNew)
            }
        }
    }

    private func recordSemanticOrderHistoryForToggle(title: String, newValue: Bool) {
        guard newValue else { return }
        let titleLower = title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        if titleLower.contains("deposit paid") || titleLower.contains("payment received") {
            recordOrderHistoryEvent(title: "Deposit marked as paid", value: lt("Yes"))
        }

        if titleLower.contains("mockup approved") || titleLower.contains("design approved") || titleLower.contains("client approved") || titleLower.contains("customer approved") {
            recordOrderHistoryEvent(title: "Customer approved design", value: lt("Yes"))
        }

        if titleLower.contains("draft sent") || titleLower.contains("mockup sent") || titleLower.contains("final photos sent") {
            recordOrderHistoryEvent(title: "Design mockup sent", value: lt("Yes"))
        }
    }

    private func recordOrderHistoryChange(title: String, oldValue: String, newValue: String) {
        let cleanedOld = cleanHistoryValue(oldValue)
        let cleanedNew = cleanHistoryValue(newValue)
        guard cleanedOld != cleanedNew else { return }

        var logs = siparis.historyLog ?? []
        logs.insert(OrderHistoryLogItem(id: UUID(), createdAt: Date(), title: title, oldValue: cleanedOld, newValue: cleanedNew), at: 0)
        if logs.count > 120 {
            logs = Array(logs.prefix(120))
        }
        siparis.historyLog = logs
    }

    private func recordOrderChangeAndUpdate(title: String, oldValue: String, newValue: String) {
        recordOrderHistoryChange(title: title, oldValue: oldValue, newValue: newValue)
        recordSemanticOrderHistoryIfNeeded(title: title, oldValue: oldValue, newValue: newValue)
        firebaseManager.updateSiparis(siparis)
    }


    private var canEditToDoItems: Bool {
        canEditOrderDetails
    }

    private var canUseToDoAssignment: Bool {
        authVM.currentPlanEntitlements.teamAccessEnabled
    }

    private var toDoFilters: [String] {
        canUseToDoAssignment ? ["Open", "All", "Mine", "Overdue", "Done"] : ["Open", "All", "Overdue", "Done"]
    }

    private var toDoAssigneeOptions: [ToDoAssigneeOption] {
        var options: [ToDoAssigneeOption] = [ToDoAssigneeOption(uid: "", label: t("Unassigned", lang: seciliDil), email: "")]
        var seen: Set<String> = [""]

        let currentUid = (authVM.currentUserId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let currentEmail = authVM.accountEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        let currentName = authVM.accountDisplayName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !currentUid.isEmpty {
            let label = currentName.isEmpty ? (currentEmail.isEmpty ? t("Me", lang: seciliDil) : currentEmail) : currentName
            options.append(ToDoAssigneeOption(uid: currentUid, label: label, email: currentEmail))
            seen.insert(currentUid)
        }

        for member in authVM.teamMembers.sorted(by: { first, second in
            let firstLabel = first.displayName.isEmpty ? first.email : first.displayName
            let secondLabel = second.displayName.isEmpty ? second.email : second.displayName
            return firstLabel.localizedCaseInsensitiveCompare(secondLabel) == .orderedAscending
        }) {
            let uid = member.id.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !uid.isEmpty, !seen.contains(uid) else { continue }
            let label = member.displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? member.email : member.displayName
            options.append(ToDoAssigneeOption(uid: uid, label: label.isEmpty ? member.id : label, email: member.email))
            seen.insert(uid)
        }

        return options
    }

    private var toDoItemsSorted: [OrderToDoItem] {
        // Keep the saved array order so users can manually arrange tasks.
        // Filters below preserve this same order inside each filtered view.
        siparis.todoItems ?? []
    }

    private var toDoFilteredItems: [OrderToDoItem] {
        let currentUid = (authVM.currentUserId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let currentEmail = authVM.accountEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let filter = toDoFilter.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        return toDoItemsSorted.filter { item in
            switch filter {
            case "all":
                return true
            case "done":
                return item.isDone
            case "mine":
                return (!currentUid.isEmpty && item.assignedToUid == currentUid) || (!currentEmail.isEmpty && item.assignedToEmail.lowercased() == currentEmail)
            case "overdue":
                return toDoIsOverdue(item)
            default:
                return !item.isDone
            }
        }
    }

    private var openToDoCount: Int { (siparis.todoItems ?? []).filter { !$0.isDone }.count }
    private var doneToDoCount: Int { (siparis.todoItems ?? []).filter { $0.isDone }.count }
    private var overdueToDoCount: Int { (siparis.todoItems ?? []).filter { toDoIsOverdue($0) }.count }
    private var toDoPlanLimitReached: Bool {
        guard let limit = authVM.currentPlanEntitlements.taskLimitPerOrder else { return false }
        return (siparis.todoItems ?? []).count >= limit
    }

    private var toDoPlanLimitMessage: String {
        guard let limit = authVM.currentPlanEntitlements.taskLimitPerOrder else { return "" }
        return String(format: t("Demo allows up to %d tasks per order. Upgrade to Lite, Pro or Team for unlimited tasks.", lang: seciliDil), limit)
    }

    private func toDoPriorityRank(_ priority: String) -> Int {
        switch priority.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "urgent": return 0
        case "high": return 1
        case "normal": return 2
        case "low": return 3
        default: return 4
        }
    }

    private func toDoPriorityColor(_ priority: String) -> Color {
        switch priority.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "urgent": return .red
        case "high": return studioWarningOrange
        case "low": return .gray
        default: return .blue
        }
    }

    private func toDoIsOverdue(_ item: OrderToDoItem) -> Bool {
        guard !item.isDone, let dueAt = item.dueAt else { return false }
        return dueAt < Calendar.current.startOfDay(for: Date())
    }

    private func toDoDateLabel(_ date: Date?) -> String {
        guard let date else { return t("No due date", lang: seciliDil) }
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter.string(from: date)
    }

    private func toDoAssigneeEmail(for uid: String) -> String {
        guard !uid.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return "" }
        if uid == (authVM.currentUserId ?? "") { return authVM.accountEmail }
        return authVM.teamMembers.first(where: { $0.id == uid })?.email ?? ""
    }

    private func toDoAssigneeLabel(uid: String, email: String) -> String {
        let cleanUid = uid.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)

        if cleanUid.isEmpty && cleanEmail.isEmpty { return t("Unassigned", lang: seciliDil) }
        if cleanUid == (authVM.currentUserId ?? "") {
            let name = authVM.accountDisplayName.trimmingCharacters(in: .whitespacesAndNewlines)
            return name.isEmpty ? (cleanEmail.isEmpty ? t("Me", lang: seciliDil) : cleanEmail) : name
        }
        if let member = authVM.teamMembers.first(where: { $0.id == cleanUid }) {
            let name = member.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
            return name.isEmpty ? (member.email.isEmpty ? cleanUid : member.email) : name
        }
        return cleanEmail.isEmpty ? cleanUid : cleanEmail
    }

    private func saveToDoItems(_ items: [OrderToDoItem], historyTitle: String? = nil, historyValue: String = "") {
        siparis.todoItems = items
        if let historyTitle {
            recordOrderHistoryEvent(title: historyTitle, value: historyValue)
        }
        firebaseManager.updateSiparis(siparis)
    }

    private func addToDoItem() {
        guard canEditToDoItems else { return }
        let title = newToDoTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        if toDoPlanLimitReached {
            toDoMessage = toDoPlanLimitMessage
            return
        }

        let assignedUid = canUseToDoAssignment ? newToDoAssignedToUid : ""
        let email = canUseToDoAssignment ? toDoAssigneeEmail(for: assignedUid) : ""
        var items = siparis.todoItems ?? []
        items.insert(
            OrderToDoItem(
                id: UUID(),
                title: title,
                note: "",
                assignedToUid: assignedUid,
                assignedToEmail: email,
                dueAt: newToDoHasDueDate ? newToDoDueAt : nil,
                priority: newToDoPriority,
                isDone: false,
                createdAt: Date(),
                createdByUid: authVM.currentUserId ?? "",
                createdByEmail: authVM.accountEmail,
                completedAt: nil,
                completedByUid: "",
                completedByEmail: ""
            ),
            at: 0
        )

        newToDoTitle = ""
        newToDoPriority = "Normal"
        newToDoHasDueDate = false
        saveToDoItems(items, historyTitle: "Task added", historyValue: title)
    }

    private func updateToDoItem(_ updatedItem: OrderToDoItem, historyTitle: String? = nil, historyValue: String = "") {
        guard canEditToDoItems else { return }
        var items = siparis.todoItems ?? []
        guard let index = items.firstIndex(where: { $0.id == updatedItem.id }) else { return }
        items[index] = updatedItem
        saveToDoItems(items, historyTitle: historyTitle, historyValue: historyValue)
    }

    private func toggleToDoItem(_ item: OrderToDoItem) {
        guard canEditToDoItems else { return }
        var updated = item
        updated.isDone.toggle()
        if updated.isDone {
            updated.completedAt = Date()
            updated.completedByUid = authVM.currentUserId ?? ""
            updated.completedByEmail = authVM.accountEmail
            updateToDoItem(updated, historyTitle: "Task completed", historyValue: updated.title)
        } else {
            updated.completedAt = nil
            updated.completedByUid = ""
            updated.completedByEmail = ""
            updateToDoItem(updated, historyTitle: "Task reopened", historyValue: updated.title)
        }
    }

    private func deleteToDoItem(_ item: OrderToDoItem) {
        guard canEditToDoItems else { return }
        let items = (siparis.todoItems ?? []).filter { $0.id != item.id }
        saveToDoItems(items, historyTitle: "Task deleted", historyValue: item.title)
    }

    private func moveToDoItem(_ item: OrderToDoItem, direction: Int) {
        guard canEditToDoItems else { return }
        var items = siparis.todoItems ?? []
        guard let currentIndex = items.firstIndex(where: { $0.id == item.id }) else { return }

        let targetIndex = currentIndex + direction
        guard items.indices.contains(targetIndex) else { return }

        withAnimation(.snappy) {
            let movedItem = items.remove(at: currentIndex)
            items.insert(movedItem, at: targetIndex)
        }

        saveToDoItems(items, historyTitle: t("Task order updated", lang: seciliDil), historyValue: item.title)
    }

    private func moveToDoItemToTop(_ item: OrderToDoItem) {
        guard canEditToDoItems else { return }
        var items = siparis.todoItems ?? []
        guard let currentIndex = items.firstIndex(where: { $0.id == item.id }), currentIndex > 0 else { return }

        withAnimation(.snappy) {
            let movedItem = items.remove(at: currentIndex)
            items.insert(movedItem, at: 0)
        }

        saveToDoItems(items, historyTitle: t("Task order updated", lang: seciliDil), historyValue: item.title)
    }

    private func moveToDoItemToBottom(_ item: OrderToDoItem) {
        guard canEditToDoItems else { return }
        var items = siparis.todoItems ?? []
        guard let currentIndex = items.firstIndex(where: { $0.id == item.id }), currentIndex < items.count - 1 else { return }

        withAnimation(.snappy) {
            let movedItem = items.remove(at: currentIndex)
            items.append(movedItem)
        }

        saveToDoItems(items, historyTitle: t("Task order updated", lang: seciliDil), historyValue: item.title)
    }

    private func reorderToDoItem(draggedID: UUID, targetID: UUID) {
        guard canEditToDoItems, draggedID != targetID else { return }
        var items = siparis.todoItems ?? []
        guard let fromIndex = items.firstIndex(where: { $0.id == draggedID }),
              let toIndex = items.firstIndex(where: { $0.id == targetID }) else { return }

        withAnimation(.easeInOut(duration: 0.12)) {
            let movedItem = items.remove(at: fromIndex)
            items.insert(movedItem, at: toIndex)
            siparis.todoItems = items
        }
    }

    private func finishToDoDrag(_ draggedID: UUID?) {
        guard canEditToDoItems else { return }
        let title = (siparis.todoItems ?? []).first(where: { $0.id == draggedID })?.title ?? ""
        recordOrderHistoryEvent(title: t("Task order updated", lang: seciliDil), value: title)
        firebaseManager.updateSiparis(siparis)
        #if os(macOS)
        NSCursor.openHand.set()
        #endif
    }

    private func toDoReminderTitle(for item: OrderToDoItem) -> String {
        let title = item.title.trimmingCharacters(in: .whitespacesAndNewlines)
        return title.isEmpty ? t("To Do", lang: seciliDil) : title
    }

    private func toDoReminderNotes(for item: OrderToDoItem) -> String {
        var lines: [String] = []
        let customer = siparis.customerName.trimmingCharacters(in: .whitespacesAndNewlines)
        let design = siparis.designName.trimmingCharacters(in: .whitespacesAndNewlines)
        let assignee = toDoAssigneeLabel(uid: item.assignedToUid, email: item.assignedToEmail).trimmingCharacters(in: .whitespacesAndNewlines)
        if !customer.isEmpty { lines.append("Customer: \(customer)") }
        if !design.isEmpty { lines.append("Design: \(design)") }
        if !assignee.isEmpty { lines.append("Assigned to: \(assignee)") }
        if !item.priority.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { lines.append("Priority: \(item.priority)") }
        return lines.joined(separator: "\n")
    }

    private func addAppleReminder(for item: OrderToDoItem) {
        guard authVM.currentPlanEntitlements.calendarRemindersEnabled else {
            toDoMessage = t("Apple Calendar and Reminders are available from NivaDesk Lite.", lang: seciliDil)
            return
        }
        #if canImport(EventKit)
        let dueDate = item.dueAt ?? Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
        toDoMessage = t("Adding Apple Reminder...", lang: seciliDil)
        AppleReminderManager.shared.addOrderReminder(
            title: toDoReminderTitle(for: item),
            notes: toDoReminderNotes(for: item),
            dueDate: dueDate,
            useDueDateTime: false
        ) { result in
            switch result {
            case .success:
                self.toDoMessage = t("Apple Reminder added.", lang: self.seciliDil)
                self.recordOrderHistoryEvent(title: t("Task reminder added", lang: seciliDil), value: item.title)
                self.firebaseManager.updateSiparis(self.siparis)
            case .failure(let error):
                let baseMessage: String
                if let reminderError = error as? StudioFlowReminderError {
                    baseMessage = reminderError.errorDescription ?? error.localizedDescription
                } else {
                    baseMessage = error.localizedDescription
                }
                self.toDoMessage = t("Apple Reminder could not be added.", lang: self.seciliDil) + " " + baseMessage
            }
        }
        #else
        toDoMessage = t("Apple Reminders is not available on this device.", lang: seciliDil)
        #endif
    }

    private func setToDoDue(_ item: OrderToDoItem, daysFromToday: Int?) {
        var updated = item
        if let daysFromToday {
            let start = Calendar.current.startOfDay(for: Date())
            updated.dueAt = Calendar.current.date(byAdding: .day, value: daysFromToday, to: start) ?? Date()
        } else {
            updated.dueAt = nil
        }
        updateToDoItem(updated, historyTitle: "Task due date updated", historyValue: updated.title)
    }

    private func setToDoAssignee(_ item: OrderToDoItem, uid: String, email: String) {
        guard canUseToDoAssignment else { return }
        var updated = item
        updated.assignedToUid = uid
        updated.assignedToEmail = email
        updateToDoItem(updated, historyTitle: "Task assigned", historyValue: updated.title)
    }

    private func setToDoPriority(_ item: OrderToDoItem, priority: String) {
        var updated = item
        updated.priority = priority
        updateToDoItem(updated, historyTitle: "Task priority updated", historyValue: updated.title)
    }

    private func toDoFilterButton(_ filter: String) -> some View {
        Button {
            toDoFilter = filter
        } label: {
            Text(t(filter, lang: seciliDil))
                .font(.system(size: 11, weight: .bold))
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(toDoFilter == filter ? Color.blue.opacity(0.18) : Color.primary.opacity(0.06))
                .foregroundColor(toDoFilter == filter ? .blue : .secondary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func toDoKarti(colIndex: Int) -> some View {
        return DetayKarti(
            title: t("To Do", lang: seciliDil),
            iconName: cardHeaderIcon(for: .todo),
            kartTipi: .todo,
            yukseklik: bindingYukseklik(for: .todo),
            sutunGenisligi: getBinding(for: colIndex),
            draggedKart: $draggedKart,
            uiTetikleyici: uiTetikleyici,
            kartRengi: getKartColor(kart: .todo),
            onHeightChangeEnd: kaydetKartYukseklikleri,
            onWidthChangeEnd: saveWidths,
            onHide: { setCardVisibleWithUndo(.todo, false) },
            onColorChange: { setKartColor(kart: .todo, color: $0) },
            onExport: exportToDoPDF
        ) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    toDoSummaryPill(title: t("Open", lang: seciliDil), value: openToDoCount, color: .blue)
                    toDoSummaryPill(title: t("Overdue", lang: seciliDil), value: overdueToDoCount, color: overdueToDoCount > 0 ? .red : .secondary)
                    toDoSummaryPill(title: t("Done", lang: seciliDil), value: doneToDoCount, color: .green)
                }

                if toDoPlanLimitReached {
                    Label(toDoPlanLimitMessage, systemImage: "lock.fill")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(studioWarningOrange)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(studioWarningOrange.opacity(0.10))
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }

                if canEditToDoItems {
                    toDoAddForm
                } else {
                    Text(t("You can view tasks, but your role cannot edit them.", lang: seciliDil))
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.primary.opacity(0.05))
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }

                if !toDoMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text(toDoMessage)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(toDoMessage.localizedCaseInsensitiveContains("could not") ? .red : .green)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.primary.opacity(0.05))
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }

                if !(siparis.todoItems ?? []).isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(toDoFilters, id: \.self) { filter in
                                toDoFilterButton(filter)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }

                if toDoFilteredItems.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "checkmark.circle")
                            .font(.system(size: 24, weight: .semibold))
                            .foregroundColor(.green.opacity(0.75))
                        Text(t("No tasks here", lang: seciliDil))
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                } else {
                    VStack(spacing: 10) {
                        ForEach(toDoFilteredItems) { item in
                            draggableToDoRow(item)
                        }
                    }
                }
            }
        }
    }

    private func toDoSummaryPill(title: String, value: Int, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.secondary)

            Text("\(value)")
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color.primary.opacity(0.05))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(color.opacity(0.18), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    @ViewBuilder
    private var toDoAddForm: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                TextField(t("Add a task...", lang: seciliDil), text: $newToDoTitle, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(2, reservesSpace: true)
                    .onSubmit {
                        addToDoItem()
                    }

                Button {
                    addToDoItem()
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .bold))
                        .frame(width: 34, height: 34)
                }
                .buttonStyle(.borderedProminent)
                .disabled(newToDoTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || toDoPlanLimitReached)
            }

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) {
                    toDoAddOptions
                }

                VStack(alignment: .leading, spacing: 8) {
                    toDoAddOptions
                }
            }

            if newToDoHasDueDate {
                HStack(spacing: 8) {
                    Text(t("Due date", lang: seciliDil))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.secondary)

                    DatePicker("", selection: $newToDoDueAt, displayedComponents: .date)
                        .labelsHidden()
                        .datePickerStyle(.compact)
                        .font(.system(size: 12))
                }
            }
        }
        .padding(12)
        .background(Color.primary.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    @ViewBuilder
    private var toDoAddOptions: some View {
        if canUseToDoAssignment {
            HStack(spacing: 6) {
                Text(t("Assign", lang: seciliDil))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.secondary)

                Picker(t("Assign", lang: seciliDil), selection: $newToDoAssignedToUid) {
                    ForEach(toDoAssigneeOptions) { option in
                        Text(option.label).tag(option.uid)
                    }
                }
                .pickerStyle(.menu)
                .controlSize(.small)
            }
        }

        HStack(spacing: 6) {
            Text(t("Priority", lang: seciliDil))
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)

            Picker(t("Priority", lang: seciliDil), selection: $newToDoPriority) {
                ForEach(["Low", "Normal", "High", "Urgent"], id: \.self) { priority in
                    Text(t(priority, lang: seciliDil)).tag(priority)
                }
            }
            .pickerStyle(.menu)
            .controlSize(.small)
        }

        Toggle(t("Due", lang: seciliDil), isOn: $newToDoHasDueDate)
            .toggleStyle(.switch)
            .controlSize(.small)
            .font(.system(size: 12, weight: .semibold))
    }

    @ViewBuilder
    private func draggableToDoRow(_ item: OrderToDoItem) -> some View {
        if canEditToDoItems {
            toDoRow(item)
                .opacity(draggingToDoItemID == item.id ? 0.55 : 1)
                .onHover { hovering in
                    #if os(macOS)
                    if hovering {
                        NSCursor.openHand.push()
                    } else {
                        NSCursor.pop()
                    }
                    #endif
                }
                .onDrag {
                    draggingToDoItemID = item.id
                    #if os(macOS)
                    NSCursor.closedHand.set()
                    #endif
                    return NSItemProvider(object: item.id.uuidString as NSString)
                }
                .onDrop(
                    of: [UTType.plainText],
                    delegate: ToDoItemDropDelegate(
                        item: item,
                        draggingID: $draggingToDoItemID,
                        canEdit: canEditToDoItems,
                        moveAction: { draggedID, targetID in
                            reorderToDoItem(draggedID: draggedID, targetID: targetID)
                        },
                        dropAction: { draggedID in
                            finishToDoDrag(draggedID)
                        }
                    )
                )
        } else {
            toDoRow(item)
        }
    }

    private func toDoRow(_ item: OrderToDoItem) -> some View {
        let priorityColor = toDoPriorityColor(item.priority)
        let dueColor: Color = toDoIsOverdue(item) ? .red : (item.dueAt == nil ? .secondary : studioWarningOrange)

        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 10) {
                Button {
                    toggleToDoItem(item)
                } label: {
                    Image(systemName: item.isDone ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 21, weight: .semibold))
                        .foregroundColor(item.isDone ? .green : .secondary)
                }
                .buttonStyle(.plain)
                .disabled(!canEditToDoItems)

                Text(item.title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(item.isDone ? .secondary : .primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)

                if canEditToDoItems {
                    Menu {
                        Button {
                            toggleToDoItem(item)
                        } label: {
                            Label(
                                t(item.isDone ? "Reopen" : "Mark Done", lang: seciliDil),
                                systemImage: item.isDone ? "arrow.uturn.left.circle" : "checkmark.circle"
                            )
                        }

                        Button {
                            addAppleReminder(for: item)
                        } label: {
                            Label(t("Add Reminder", lang: seciliDil), systemImage: "bell.badge")
                        }

                        Menu(t("Move", lang: seciliDil)) {
                            Button {
                                moveToDoItem(item, direction: -1)
                            } label: {
                                Label(t("Move Up", lang: seciliDil), systemImage: "arrow.up")
                            }

                            Button {
                                moveToDoItem(item, direction: 1)
                            } label: {
                                Label(t("Move Down", lang: seciliDil), systemImage: "arrow.down")
                            }

                            Divider()

                            Button {
                                moveToDoItemToTop(item)
                            } label: {
                                Label(t("Move to Top", lang: seciliDil), systemImage: "arrow.up.to.line")
                            }

                            Button {
                                moveToDoItemToBottom(item)
                            } label: {
                                Label(t("Move to Bottom", lang: seciliDil), systemImage: "arrow.down.to.line")
                            }
                        }

                        if canUseToDoAssignment {
                            Menu(t("Assign", lang: seciliDil)) {
                                ForEach(toDoAssigneeOptions) { option in
                                    Button(option.label) {
                                        setToDoAssignee(item, uid: option.uid, email: option.email)
                                    }
                                }
                            }
                        }

                        Menu(t("Due date", lang: seciliDil)) {
                            Button(t("No due date", lang: seciliDil)) {
                                setToDoDue(item, daysFromToday: nil)
                            }

                            Button(t("Today", lang: seciliDil)) {
                                setToDoDue(item, daysFromToday: 0)
                            }

                            Button(t("Tomorrow", lang: seciliDil)) {
                                setToDoDue(item, daysFromToday: 1)
                            }

                            Button(t("In 3 days", lang: seciliDil)) {
                                setToDoDue(item, daysFromToday: 3)
                            }

                            Button(t("In 7 days", lang: seciliDil)) {
                                setToDoDue(item, daysFromToday: 7)
                            }
                        }

                        Menu(t("Priority", lang: seciliDil)) {
                            ForEach(["Low", "Normal", "High", "Urgent"], id: \.self) { priority in
                                Button(t(priority, lang: seciliDil)) {
                                    setToDoPriority(item, priority: priority)
                                }
                            }
                        }

                        Divider()

                        Button(role: .destructive) {
                            deleteToDoItem(item)
                        } label: {
                            Label(t("Delete", lang: seciliDil), systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(.secondary)
                    }
                    .menuStyle(.borderlessButton)
                }
            }

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 6) {
                    toDoMetadataRow(item: item, priorityColor: priorityColor, dueColor: dueColor)
                }

                VStack(alignment: .leading, spacing: 6) {
                    toDoMetadataRow(item: item, priorityColor: priorityColor, dueColor: dueColor)
                }
            }
        }
        .padding(12)
        .background(Color.primary.opacity(item.isDone ? 0.03 : 0.05))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(toDoIsOverdue(item) ? Color.red.opacity(0.24) : Color.primary.opacity(0.04), lineWidth: 1)
        )
    }

    @ViewBuilder
    private func toDoMetadataRow(item: OrderToDoItem, priorityColor: Color, dueColor: Color) -> some View {
        if canUseToDoAssignment || !item.assignedToUid.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !item.assignedToEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Label(toDoAssigneeLabel(uid: item.assignedToUid, email: item.assignedToEmail), systemImage: "person.crop.circle")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.secondary)
                .lineLimit(1)
        }

        Label(t(item.priority, lang: seciliDil), systemImage: "flag.fill")
            .font(.system(size: 11, weight: .bold))
            .foregroundColor(priorityColor)
            .padding(.horizontal, 7)
            .padding(.vertical, 4)
            .background(priorityColor.opacity(0.12))
            .clipShape(Capsule())

        Label(toDoDateLabel(item.dueAt), systemImage: "calendar")
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(dueColor)
            .lineLimit(1)
    }

    private var canEditWorkTime: Bool {
        canEditOrderDetails
    }

    private var workSessionItems: [OrderWorkSessionItem] {
        (siparis.workSessions ?? []).sorted { first, second in
            if first.endedAt == nil && second.endedAt != nil { return true }
            if first.endedAt != nil && second.endedAt == nil { return false }
            return first.startedAt > second.startedAt
        }
    }

    private var activeWorkSession: OrderWorkSessionItem? {
        workSessionItems.first { $0.endedAt == nil }
    }

    private func workSessionDurationSeconds(_ item: OrderWorkSessionItem, now: Date = Date()) -> Int {
        if let endedAt = item.endedAt {
            return max(item.durationSeconds, Int(endedAt.timeIntervalSince(item.startedAt)))
        }
        return max(0, Int(now.timeIntervalSince(item.startedAt)))
    }

    private func totalWorkSessionSeconds(now: Date = Date()) -> Int {
        workSessionItems.reduce(0) { total, item in
            total + workSessionDurationSeconds(item, now: now)
        }
    }

    private func formatWorkDuration(_ seconds: Int) -> String {
        let safeSeconds = max(seconds, 0)
        let hours = safeSeconds / 3600
        let minutes = (safeSeconds % 3600) / 60
        let remainder = safeSeconds % 60

        if hours > 0 { return "\(hours)h \(minutes)m" }
        if minutes > 0 { return "\(minutes)m \(remainder)s" }
        return "\(remainder)s"
    }

    private func workSessionDateText(_ date: Date) -> String {
        date.formatted(.dateTime.day().month(.abbreviated).year())
    }

    private func workSessionTimeText(_ date: Date) -> String {
        date.formatted(date: .omitted, time: .shortened)
    }

    private func workSessionGroups() -> [(date: Date, items: [OrderWorkSessionItem])] {
        let calendar = Calendar.current
        let grouped = Dictionary(grouping: workSessionItems) { item in
            calendar.startOfDay(for: item.startedAt)
        }

        return grouped.keys.sorted(by: >).map { date in
            let items = grouped[date]?.sorted { $0.startedAt > $1.startedAt } ?? []
            return (date, items)
        }
    }

    private func workTimeRowsHeightForVisibleGroups(
        _ groups: [(date: Date, items: [OrderWorkSessionItem])],
        limit: Int? = nil
    ) -> CGFloat {
        var remaining = limit ?? Int.max
        var visibleSessionCount = 0
        var visibleGroupCount = 0

        for group in groups where remaining > 0 {
            let itemCount = min(group.items.count, remaining)
            guard itemCount > 0 else { continue }
            visibleGroupCount += 1
            visibleSessionCount += itemCount
            remaining -= itemCount
        }

        guard visibleSessionCount > 0 else {
            return workTimeGroupHeaderHeight + workTimeSessionRowHeight
        }

        return CGFloat(visibleGroupCount) * workTimeGroupHeaderHeight
            + CGFloat(visibleSessionCount) * workTimeSessionRowHeight
            + CGFloat(visibleSessionCount) * workTimeSessionRowSpacing
            + CGFloat(max(visibleGroupCount - 1, 0)) * 10
    }

    private func workTimePreferredCardHeight(
        groups: [(date: Date, items: [OrderWorkSessionItem])],
        hasActiveSession: Bool,
        hasMessage: Bool
    ) -> Double {
        var blockHeights: [CGFloat] = [workTimeTotalBlockHeight]

        if hasActiveSession {
            blockHeights.append(workTimeActiveBlockHeight)
        }

        blockHeights.append(canEditWorkTime ? workTimeControlsBlockHeight : workTimeLockedBlockHeight)

        if hasMessage {
            blockHeights.append(workTimeMessageBlockHeight)
        }

        blockHeights.append(
            groups.isEmpty
                ? workTimeEmptyBlockHeight
                : workTimeRowsHeightForVisibleGroups(groups, limit: workTimeVisibleSessionLimit)
        )

        let spacing = CGFloat(max(blockHeights.count - 1, 0)) * workTimeContentSpacing
        let contentHeight = blockHeights.reduce(0, +) + spacing
        return max(workTimeDefaultCardHeight, Double(contentHeight + workTimeCardChromeHeight))
    }

    private func workTimeRowsHeight(
        for cardHeight: Double?,
        preferredCardHeight: Double,
        groups: [(date: Date, items: [OrderWorkSessionItem])],
        hasActiveSession: Bool,
        hasMessage: Bool
    ) -> CGFloat {
        let effectiveHeight = CGFloat(cardHeight ?? preferredCardHeight)
        let defaultRowsHeight = workTimeRowsHeightForVisibleGroups(groups, limit: workTimeVisibleSessionLimit)
        let extraHeight = max(0, effectiveHeight - CGFloat(preferredCardHeight))
        return max(defaultRowsHeight, defaultRowsHeight + extraHeight)
    }

    private func saveWorkSessions(_ sessions: [OrderWorkSessionItem], historyTitle: String? = nil, historyValue: String = "") {
        siparis.workSessions = sessions.sorted { $0.startedAt > $1.startedAt }
        if let historyTitle {
            recordOrderHistoryEvent(title: historyTitle, value: historyValue)
        }
        firebaseManager.updateSiparis(siparis)
    }

    private func startWorkSession() {
        guard canEditWorkTime else { return }
        guard activeWorkSession == nil else {
            workTimeMessage = t("A work timer is already running.", lang: seciliDil)
            return
        }

        let title = newWorkSessionTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanTitle = title.isEmpty ? t("Work session", lang: seciliDil) : title
        let now = Date()
        var sessions = siparis.workSessions ?? []
        sessions.insert(
            OrderWorkSessionItem(
                id: UUID(),
                title: cleanTitle,
                startedAt: now,
                endedAt: nil,
                durationSeconds: 0,
                createdAt: now,
                createdByUid: authVM.currentUserId ?? "",
                createdByEmail: authVM.accountEmail,
                source: "app"
            ),
            at: 0
        )

        newWorkSessionTitle = ""
        workTimeMessage = t("Work timer started.", lang: seciliDil)
        saveWorkSessions(sessions, historyTitle: "Work timer started", historyValue: cleanTitle)
    }

    private func stopActiveWorkSession() {
        guard canEditWorkTime, let active = activeWorkSession else { return }
        stopWorkSession(active)
    }

    private func stopWorkSession(_ item: OrderWorkSessionItem) {
        guard canEditWorkTime, item.endedAt == nil else { return }
        var sessions = siparis.workSessions ?? []
        guard let index = sessions.firstIndex(where: { $0.id == item.id }) else { return }

        let now = Date()
        var stopped = sessions[index]
        stopped.endedAt = now
        stopped.durationSeconds = workSessionDurationSeconds(stopped, now: now)
        sessions[index] = stopped

        workTimeMessage = t("Work timer stopped.", lang: seciliDil)
        saveWorkSessions(
            sessions,
            historyTitle: "Work timer stopped",
            historyValue: "\(stopped.title) · \(formatWorkDuration(stopped.durationSeconds))"
        )
    }

    private func continueWorkSession(_ item: OrderWorkSessionItem) {
        guard canEditWorkTime else { return }
        guard activeWorkSession == nil else {
            workTimeMessage = t("A work timer is already running.", lang: seciliDil)
            return
        }

        let title = item.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? t("Work session", lang: seciliDil)
            : item.title
        let now = Date()
        var sessions = siparis.workSessions ?? []
        sessions.insert(
            OrderWorkSessionItem(
                id: UUID(),
                title: title,
                startedAt: now,
                endedAt: nil,
                durationSeconds: 0,
                createdAt: now,
                createdByUid: authVM.currentUserId ?? "",
                createdByEmail: authVM.accountEmail,
                source: "app"
            ),
            at: 0
        )

        workTimeMessage = t("Work timer continued.", lang: seciliDil)
        saveWorkSessions(sessions, historyTitle: "Work timer continued", historyValue: title)
    }

    private func deleteWorkSession(_ item: OrderWorkSessionItem) {
        guard canEditWorkTime else { return }
        var sessions = siparis.workSessions ?? []
        let previousCount = sessions.count
        sessions.removeAll { $0.id == item.id }
        guard sessions.count != previousCount else { return }

        workTimeMessage = t("Work session deleted.", lang: seciliDil)
        saveWorkSessions(sessions, historyTitle: "Work timer deleted", historyValue: item.title)
    }

    private func workSessionRow(_ item: OrderWorkSessionItem, now: Date) -> some View {
        let isActive = item.endedAt == nil
        let duration = workSessionDurationSeconds(item, now: now)

        return HStack(alignment: .center, spacing: 10) {
            Image(systemName: isActive ? "play.fill" : "checkmark")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(isActive ? .green : .blue)
                .frame(width: 22, height: 22)
                .background((isActive ? Color.green : Color.blue).opacity(0.12))
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 3) {
                Text(item.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? t("Work session", lang: seciliDil) : item.title)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.primary)
                    .lineLimit(1)

                let endText = item.endedAt.map { workSessionTimeText($0) } ?? t("Running", lang: seciliDil)
                Text("\(workSessionTimeText(item.startedAt)) → \(endText)")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            Text(formatWorkDuration(duration))
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(isActive ? .green : .primary)
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background((isActive ? Color.green : Color.primary).opacity(isActive ? 0.12 : 0.06))
                .clipShape(Capsule())

            if canEditWorkTime {
                if isActive {
                    Button {
                        stopWorkSession(item)
                    } label: {
                        Image(systemName: "stop.fill")
                    }
                    .buttonStyle(.borderless)
                    .foregroundColor(.red)
                    .help(t("Stop", lang: seciliDil))
                } else {
                    Button {
                        continueWorkSession(item)
                    } label: {
                        Image(systemName: "play.fill")
                    }
                    .buttonStyle(.borderless)
                    .foregroundColor(.green)
                    .disabled(activeWorkSession != nil)
                    .help(t("Continue", lang: seciliDil))
                }

                Button(role: .destructive) {
                    deleteWorkSession(item)
                } label: {
                    Image(systemName: "trash")
                }
                .buttonStyle(.borderless)
                .foregroundColor(.red.opacity(0.85))
                .help(t("Delete", lang: seciliDil))
            }
        }
        .padding(10)
        .background(Color.primary.opacity(0.035))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.primary.opacity(0.06), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func workTimeKarti(colIndex: Int) -> some View {
        let workTimeHeightBinding = bindingYukseklik(for: .workTime)
        let hasMessage = !workTimeMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let groups = workSessionGroups()
        let preferredCardHeight = workTimePreferredCardHeight(
            groups: groups,
            hasActiveSession: activeWorkSession != nil,
            hasMessage: hasMessage
        )

        return DetayKarti(
            title: t("Work Time", lang: seciliDil),
            iconName: cardHeaderIcon(for: .workTime),
            kartTipi: .workTime,
            yukseklik: workTimeHeightBinding,
            sutunGenisligi: getBinding(for: colIndex),
            draggedKart: $draggedKart,
            uiTetikleyici: uiTetikleyici,
            kartRengi: getKartColor(kart: .workTime),
            minimumHeightOverride: preferredCardHeight,
            autoAdjustHeightOnContentChange: false,
            onHeightChangeEnd: kaydetKartYukseklikleri,
            onWidthChangeEnd: saveWidths,
            onHide: { setCardVisibleWithUndo(.workTime, false) },
            onColorChange: { setKartColor(kart: .workTime, color: $0) }
        ) {
            TimelineView(.periodic(from: Date(), by: 1)) { context in
                let now = context.date
                let totalSeconds = totalWorkSessionSeconds(now: now)
                let active = activeWorkSession
                let hasMessage = !workTimeMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                let groups = workSessionGroups()
                let preferredCardHeight = workTimePreferredCardHeight(
                    groups: groups,
                    hasActiveSession: active != nil,
                    hasMessage: hasMessage
                )
                let rowsHeight = workTimeRowsHeight(
                    for: workTimeHeightBinding.wrappedValue,
                    preferredCardHeight: preferredCardHeight,
                    groups: groups,
                    hasActiveSession: active != nil,
                    hasMessage: hasMessage
                )
                let canShowAllWorkSessionsWithoutScroll = workSessionItems.count <= workTimeVisibleSessionLimit

                VStack(alignment: .leading, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(t("Total Work Time", lang: seciliDil))
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.secondary)

                        Text(formatWorkDuration(totalSeconds))
                            .font(.system(size: 26, weight: .bold))
                            .foregroundColor(.blue)
                            .lineLimit(1)
                            .monospacedDigit()
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(Color.blue.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

                    if let active {
                        HStack(spacing: 8) {
                            Image(systemName: "timer")
                                .foregroundColor(.green)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(active.title)
                                    .font(.system(size: 12, weight: .bold))
                                    .lineLimit(1)
                                Text("\(t("Started", lang: seciliDil)) \(workSessionTimeText(active.startedAt))")
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            Text(formatWorkDuration(workSessionDurationSeconds(active, now: now)))
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(.green)
                                .monospacedDigit()
                        }
                        .padding(10)
                        .background(Color.green.opacity(0.10))
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }

                    if canEditWorkTime {
                        HStack(spacing: 8) {
                            TextField(t("Work title...", lang: seciliDil), text: $newWorkSessionTitle)
                                .textFieldStyle(.roundedBorder)
                                .disabled(active != nil)
                                .onSubmit {
                                    startWorkSession()
                                }

                            Button {
                                if active == nil {
                                    startWorkSession()
                                } else {
                                    stopActiveWorkSession()
                                }
                            } label: {
                                Label(
                                    active == nil ? t("Start", lang: seciliDil) : t("Stop", lang: seciliDil),
                                    systemImage: active == nil ? "play.fill" : "stop.fill"
                                )
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(active == nil ? .green : .red)
                        }
                    } else {
                        Text(t("You can view work time, but your role cannot edit it.", lang: seciliDil))
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                            .padding(10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.primary.opacity(0.05))
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }

                    if !workTimeMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text(workTimeMessage)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.green)
                            .lineLimit(2)
                    }

                    if groups.isEmpty {
                        VStack(spacing: 8) {
                            Image(systemName: "timer")
                                .font(.system(size: 22, weight: .semibold))
                                .foregroundColor(.secondary)
                            Text(t("No work sessions yet.", lang: seciliDil))
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.secondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Color.primary.opacity(0.035))
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    } else if canShowAllWorkSessionsWithoutScroll {
                        LazyVStack(alignment: .leading, spacing: 10) {
                            ForEach(groups, id: \.date) { group in
                                VStack(alignment: .leading, spacing: 7) {
                                    HStack {
                                        Text(workSessionDateText(group.date))
                                            .font(.system(size: 11, weight: .bold))
                                            .foregroundColor(.secondary)
                                        Spacer()
                                        Text(formatWorkDuration(group.items.reduce(0) { $0 + workSessionDurationSeconds($1, now: now) }))
                                            .font(.system(size: 11, weight: .bold))
                                            .foregroundColor(.blue)
                                    }

                                    ForEach(group.items) { item in
                                        workSessionRow(item, now: now)
                                    }
                                }
                            }
                        }
                        .padding(.trailing, 4)
                        .frame(height: workTimeRowsHeightForVisibleGroups(groups))
                        .clipped()
                    } else {
                        ScrollView(.vertical, showsIndicators: true) {
                            LazyVStack(alignment: .leading, spacing: 10) {
                                ForEach(groups, id: \.date) { group in
                                    VStack(alignment: .leading, spacing: 7) {
                                        HStack {
                                            Text(workSessionDateText(group.date))
                                                .font(.system(size: 11, weight: .bold))
                                                .foregroundColor(.secondary)
                                            Spacer()
                                            Text(formatWorkDuration(group.items.reduce(0) { $0 + workSessionDurationSeconds($1, now: now) }))
                                                .font(.system(size: 11, weight: .bold))
                                                .foregroundColor(.blue)
                                        }

                                        ForEach(group.items) { item in
                                            workSessionRow(item, now: now)
                                        }
                                    }
                                }
                            }
                            .padding(.trailing, 4)
                        }
                        .frame(height: rowsHeight)
                        .clipped()
                    }
                }
            }
        }
    }

    private func historyLogKarti(colIndex: Int) -> some View {
        let historyHeightBinding = bindingYukseklik(for: .historyLog)
        let visibleRowsHeight = historyLogRowsHeight(for: historyHeightBinding.wrappedValue)

        return DetayKarti(
            title: lt("History / Log"),
            iconName: cardHeaderIcon(for: .historyLog),
            kartTipi: .historyLog,
            yukseklik: historyHeightBinding,
            sutunGenisligi: getBinding(for: colIndex),
            draggedKart: $draggedKart,
            uiTetikleyici: uiTetikleyici,
            kartRengi: getKartColor(kart: .historyLog),
            minimumHeightOverride: historyLogPreferredCardHeight,
            onHeightChangeEnd: kaydetKartYukseklikleri,
            onWidthChangeEnd: saveWidths,
            onHide: { setCardVisibleWithUndo(.historyLog, false) },
            onColorChange: { setKartColor(kart: .historyLog, color: $0) },
            onExport: exportHistoryLogPDF
        ) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(lt("Recent important changes"))
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.gray)
                    Spacer()
                    Text("\(orderHistoryItems.count)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.secondary)
                }

                if orderHistoryItems.isEmpty {
                    Text(lt("No history yet. Important changes will appear here."))
                        .font(.system(size: 12))
                        .foregroundColor(.gray)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .background(Color.primary.opacity(0.035))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                } else {
                    ScrollView(.vertical, showsIndicators: true) {
                        LazyVStack(alignment: .leading, spacing: 8) {
                            ForEach(orderHistoryItems) { item in
                                historyLogRow(item)
                            }
                        }
                        .padding(.trailing, 4)
                    }
                    .frame(height: visibleRowsHeight)
                    .clipped()
                }
            }
        }
    }

    private func historyLogRow(_ item: OrderHistoryLogItem) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "clock.fill")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.blue)
                .frame(width: 18, height: 18)
                .background(Color.blue.opacity(0.12))
                .clipShape(Circle())
                .padding(.top, 2)

            VStack(alignment: .leading, spacing: 4) {
                Text(lt(item.title))
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.primary)
                    .lineLimit(1)

                Text(orderHistoryDateText(item.createdAt))
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.secondary)

                HStack(spacing: 6) {
                    Text(cleanHistoryValue(item.oldValue))
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                    Image(systemName: "arrow.right")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(.gray)
                    Text(cleanHistoryValue(item.newValue))
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.primary)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(10)
        .background(Color.blue.opacity(0.06))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.blue.opacity(0.12), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }


    private let scheduleItemsCustomKey = "__scheduleAlertItemsV1"

    private var scheduleItems: [ScheduleAlertItem] {
        decodedScheduleItems().sorted { first, second in
            if first.status != second.status {
                return first.status == "Pending"
            }
            return first.dueAt < second.dueAt
        }
    }

    private var activeScheduleItems: [ScheduleAlertItem] {
        scheduleItems.filter { $0.status != "Done" }
    }

    private var completedScheduleItems: [ScheduleAlertItem] {
        scheduleItems.filter { $0.status == "Done" }
    }

    private func decodedScheduleItems() -> [ScheduleAlertItem] {
        guard let json = siparis.customFields?[scheduleItemsCustomKey],
              let data = json.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([ScheduleAlertItem].self, from: data) else {
            return []
        }
        return decoded
    }

    private func saveScheduleItems(_ items: [ScheduleAlertItem]) {
        var current = siparis.customFields ?? [:]
        if let data = try? JSONEncoder().encode(items),
           let json = String(data: data, encoding: .utf8) {
            current[scheduleItemsCustomKey] = json
            current["language"] = seciliDil
        }
        siparis.customFields = current
        firebaseManager.updateSiparis(siparis)
        scheduleMessage = "Schedule updated."
    }

    private func addScheduleItem() {
        let cleanedTitle = newScheduleTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanedTitle.isEmpty else {
            scheduleMessage = "Please add a reminder title."
            return
        }

        var items = decodedScheduleItems()
        let item = ScheduleAlertItem(
            title: cleanedTitle,
            note: newScheduleNote.trimmingCharacters(in: .whitespacesAndNewlines),
            dueAt: newScheduleDueAt,
            priority: newSchedulePriority,
            notify: newScheduleNotify
        )
        items.append(item)
        saveScheduleItems(items)
        scheduleSystemNotification(for: item)
        if item.notify {
            scheduleMessage = "Reminder saved. Adding Apple Reminder..."
            addAppleReminder(for: item)
        } else {
            scheduleMessage = "Reminder saved."
        }

        newScheduleTitle = "Follow up customer"
        newScheduleNote = ""
        newScheduleDueAt = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
        newSchedulePriority = "Normal"
        newScheduleNotify = true
    }

    private func updateScheduleItem(_ item: ScheduleAlertItem) {
        var items = decodedScheduleItems()
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        items[index] = item
        saveScheduleItems(items)
    }

    private func completeScheduleItem(_ item: ScheduleAlertItem) {
        var updated = item
        updated.status = "Done"
        updated.completedAt = Date()
        updateScheduleItem(updated)
        cancelScheduleNotification(for: item.id)
        scheduleMessage = "Reminder completed."
    }

    private func snoozeScheduleItem(_ item: ScheduleAlertItem, hours: Int) {
        var updated = item
        updated.dueAt = Calendar.current.date(byAdding: .hour, value: hours, to: Date()) ?? Date()
        updated.status = "Pending"
        updateScheduleItem(updated)
        cancelScheduleNotification(for: item.id)
        scheduleSystemNotification(for: updated)
        scheduleMessage = "Reminder snoozed."
    }

    private func deleteScheduleItem(_ item: ScheduleAlertItem) {
        let remaining = decodedScheduleItems().filter { $0.id != item.id }
        saveScheduleItems(remaining)
        cancelScheduleNotification(for: item.id)
        scheduleMessage = "Reminder deleted."
    }

    private func scheduleNotificationIdentifier(_ id: UUID) -> String {
        "eggcraft.schedule.\(siparis.id ?? "draft").\(id.uuidString)"
    }

    private func scheduleSystemNotification(for item: ScheduleAlertItem) {
        guard item.notify, item.dueAt > Date() else { return }
        #if canImport(UserNotifications)
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error {
                DispatchQueue.main.async {
                    self.scheduleMessage = "Notification permission error: \(error.localizedDescription)"
                }
                return
            }

            guard granted else {
                DispatchQueue.main.async {
                    self.scheduleMessage = "Reminder saved, but notification permission was not granted."
                }
                return
            }

            let content = UNMutableNotificationContent()
            content.title = self.lt("NivaDesk reminder")
            let customer = self.siparis.customerName.trimmingCharacters(in: .whitespacesAndNewlines)
            let localizedItemTitle = self.lt(item.title)
            content.body = customer.isEmpty ? localizedItemTitle : "\(customer): \(localizedItemTitle)"
            if !item.note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                content.subtitle = item.note
            }
            content.sound = .default
            content.userInfo = [
                "orderId": self.siparis.id ?? "",
                "scheduleId": item.id.uuidString,
                "title": item.title
            ]

            let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: item.dueAt)
            let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
            let request = UNNotificationRequest(identifier: self.scheduleNotificationIdentifier(item.id), content: content, trigger: trigger)

            center.removePendingNotificationRequests(withIdentifiers: [self.scheduleNotificationIdentifier(item.id)])
            center.add(request) { error in
                if let error {
                    DispatchQueue.main.async {
                        self.scheduleMessage = "Notification schedule error: \(error.localizedDescription)"
                    }
                }
            }
        }
        #endif
    }

    private func appleReminderTitle(for item: ScheduleAlertItem) -> String {
        let customer = siparis.customerName.trimmingCharacters(in: .whitespacesAndNewlines)
        let design = siparis.designName.trimmingCharacters(in: .whitespacesAndNewlines)
        let reminderTitle = lt(item.title).trimmingCharacters(in: .whitespacesAndNewlines)

        var parts: [String] = []
        if !customer.isEmpty { parts.append(customer) }
        if !design.isEmpty { parts.append(design) }
        if !reminderTitle.isEmpty { parts.append(reminderTitle) }

        return parts.isEmpty ? lt("Reminder") : parts.joined(separator: " - ")
    }

    private func appleReminderNotes(for item: ScheduleAlertItem) -> String {
        var lines: [String] = []
        let orderId = siparis.id?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let customer = siparis.customerName.trimmingCharacters(in: .whitespacesAndNewlines)
        let design = siparis.designName.trimmingCharacters(in: .whitespacesAndNewlines)
        let note = item.note.trimmingCharacters(in: .whitespacesAndNewlines)

        if !customer.isEmpty { lines.append("Customer: \(customer)") }
        if !design.isEmpty { lines.append("Design: \(design)") }
        if !orderId.isEmpty { lines.append("Order ID: \(orderId)") }
        if !note.isEmpty { lines.append(note) }

        return lines.joined(separator: "\n")
    }

    private func addAppleReminder(for item: ScheduleAlertItem) {
        guard authVM.currentPlanEntitlements.calendarRemindersEnabled else {
            scheduleMessage = lt("Reminder saved, but Apple Reminder could not be added.") + " " + t("Apple Calendar and Reminders are available from NivaDesk Lite.", lang: seciliDil)
            return
        }
        #if canImport(EventKit)
        AppleReminderManager.shared.addOrderReminder(
            title: appleReminderTitle(for: item),
            notes: appleReminderNotes(for: item),
            dueDate: item.dueAt,
            useDueDateTime: true
        ) { result in
            switch result {
            case .success:
                self.scheduleMessage = "Reminder saved and Apple Reminder added."
            case .failure(let error):
                let baseMessage: String
                if let reminderError = error as? StudioFlowReminderError {
                    baseMessage = reminderError.errorDescription ?? error.localizedDescription
                } else {
                    baseMessage = error.localizedDescription
                }
                self.scheduleMessage = self.lt("Reminder saved, but Apple Reminder could not be added.") + " " + baseMessage + " " + self.lt("Please allow Reminders access in system settings and try again.")
            }
        }
        #else
        scheduleMessage = lt("Reminder saved, but Apple Reminder could not be added.") + " " + lt("Apple Reminders is not available on this device.")
        #endif
    }

    private func cancelScheduleNotification(for id: UUID) {
        #if canImport(UserNotifications)
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [scheduleNotificationIdentifier(id)])
        #endif
    }

    private var quickReminderTemplates: [ScheduleQuickReminderItem] {
        let saved = decodedQuickReminderItems()
        return saved.isEmpty ? businessQuickReminderSuggestions() : saved
    }

    private func decodedQuickReminderItems() -> [ScheduleQuickReminderItem] {
        guard let data = scheduleQuickRemindersJSON.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([ScheduleQuickReminderItem].self, from: data) else {
            return []
        }
        return decoded
    }

    private func saveQuickReminderItems(_ items: [ScheduleQuickReminderItem], message: String = "Quick reminder settings saved.") {
        if let data = try? JSONEncoder().encode(items), let json = String(data: data, encoding: .utf8) {
            scheduleQuickRemindersJSON = json
            scheduleMessage = message
        }
    }

    private func loadEditableQuickReminders() {
        editableQuickReminders = quickReminderTemplates
        if editableQuickReminders.isEmpty {
            editableQuickReminders = businessQuickReminderSuggestions()
        }
    }

    private func addEditableQuickReminder() {
        editableQuickReminders.append(ScheduleQuickReminderItem(title: lt("Custom reminder"), days: 1, hours: 0, priority: "Normal", notify: true))
    }

    private func applyBusinessQuickReminderSuggestions() {
        editableQuickReminders = businessQuickReminderSuggestions()
        saveQuickReminderItems(editableQuickReminders, message: "Business-based quick reminders applied.")
    }

    private func resetQuickReminderDefaults() {
        scheduleQuickRemindersJSON = ""
        editableQuickReminders = businessQuickReminderSuggestions()
        scheduleMessage = "Business-based quick reminders applied."
    }

    private func quickItem(_ title: String, days: Int = 1, hours: Int = 0, priority: String = "Normal", notify: Bool = true) -> ScheduleQuickReminderItem {
        ScheduleQuickReminderItem(title: lt(title), days: days, hours: hours, priority: priority, notify: notify)
    }

    private func businessQuickReminderSuggestions() -> [ScheduleQuickReminderItem] {
        let text = (businessType + " " + businessDescriptionPrompt).lowercased()
        var items: [ScheduleQuickReminderItem]

        if text.contains("photography") || text.contains("photo") || text.contains("foto") || text.contains("shoot") {
            items = [quickItem("Confirm appointment", days: 1), quickItem("Send client update", days: 1), quickItem("Quality check", days: 2), quickItem("Send invoice", days: 2), quickItem("Check payment", days: 3), quickItem("Follow up customer", days: 5)]
        } else if text.contains("repair") || text.contains("service") || text.contains("maintenance") || text.contains("tamir") {
            items = [quickItem("Send client update", days: 1), quickItem("Check materials", days: 2), quickItem("Quality check", days: 3), quickItem("Check payment", days: 3), quickItem("Prepare shipment", days: 4), quickItem("Check delivery status", hours: 12)]
        } else if text.contains("beauty") || text.contains("clinic") || text.contains("wellness") || text.contains("appointment") || text.contains("randevu") {
            items = [quickItem("Confirm appointment", days: 1), quickItem("Send client update", days: 1), quickItem("Check payment", days: 1), quickItem("Follow up customer", days: 3), quickItem("Custom reminder", days: 7)]
        } else if text.contains("food") || text.contains("bakery") || text.contains("catering") || text.contains("cake") || text.contains("pasta") {
            items = [quickItem("Confirm appointment", days: 1), quickItem("Check materials", days: 1), quickItem("Quality check", hours: 12), quickItem("Prepare shipment", hours: 6), quickItem("Check delivery status", hours: 12), quickItem("Follow up customer", days: 2)]
        } else if text.contains("consult") || text.contains("agency") || text.contains("professional") || text.contains("freelancer") || text.contains("designer") {
            items = [quickItem("Follow up customer", days: 1), quickItem("Send client update", days: 2), quickItem("Ask for approval", days: 2), quickItem("Send invoice", days: 3), quickItem("Check payment", days: 5), quickItem("Custom reminder", days: 7)]
        } else {
            items = [quickItem("Follow up customer", days: 1), quickItem("Send design update", days: 1), quickItem("Ask for approval", days: 2), quickItem("Check payment", days: 2), quickItem("Check materials", days: 3), quickItem("Quality check", days: 4), quickItem("Prepare shipment", days: 5), quickItem("Check delivery status", hours: 12)]
        }

        if text.contains("approval") || text.contains("approve") || text.contains("onay") { items.insert(quickItem("Ask for approval", days: 1, priority: "High"), at: 0) }
        if text.contains("deposit") || text.contains("payment") || text.contains("invoice") || text.contains("ödeme") { items.insert(quickItem("Check payment", days: 1, priority: "High"), at: 0) }
        if text.contains("shipping") || text.contains("delivery") || text.contains("shipment") || text.contains("kargo") || text.contains("teslim") { items.append(quickItem("Check delivery status", hours: 12)) }
        if text.contains("material") || text.contains("dial") || text.contains("stock") || text.contains("malzeme") || text.contains("kadran") { items.append(quickItem("Check materials", days: 2)) }
        if text.contains("appointment") || text.contains("booking") || text.contains("randevu") { items.insert(quickItem("Confirm appointment", days: 1, priority: "High"), at: 0) }

        var seen = Set<String>()
        return Array(items.filter { item in
            let key = item.title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            guard !key.isEmpty, !seen.contains(key) else { return false }
            seen.insert(key)
            return true
        }.prefix(8))
    }

    private func quickSchedule(_ item: ScheduleQuickReminderItem) {
        newScheduleTitle = lt(item.title)
    }

    private func quickSchedule(_ title: String, days: Int = 0, hours: Int = 0) {
        quickSchedule(ScheduleQuickReminderItem(title: title, days: days, hours: hours, priority: "Normal", notify: true))
    }

    private func scheduleDateText(_ date: Date) -> String {
        date.formatted(date: .abbreviated, time: .shortened)
    }

    private func scheduleRelativeText(_ item: ScheduleAlertItem) -> String {
        if item.status == "Done" { return lt("Done") }
        let now = Date()
        let seconds = item.dueAt.timeIntervalSince(now)
        if seconds < 0 {
            let hours = Int(abs(seconds) / 3600)
            if hours < 1 { return lt("Due now") }
            if hours < 24 { return "\(lt("Overdue")) \(hours)h" }
            return "\(lt("Overdue")) \(max(1, hours / 24))d"
        }
        let hours = Int(seconds / 3600)
        if hours < 1 { return lt("Due soon") }
        if hours < 24 { return "\(lt("In")) \(hours)h" }
        return "\(lt("In")) \(max(1, hours / 24))d"
    }

    private func scheduleStatusColor(_ item: ScheduleAlertItem) -> Color {
        if item.status == "Done" { return .green }
        if item.dueAt < Date() { return .red }
        let hours = item.dueAt.timeIntervalSinceNow / 3600
        if hours <= 24 { return studioWarningOrange }
        return .blue
    }

    private func schedulePriorityColor(_ priority: String) -> Color {
        switch priority {
        case "Urgent": return .red
        case "High": return studioWarningOrange
        case "Low": return .gray
        default: return .blue
        }
    }

    private func scheduleKarti(colIndex: Int) -> some View {
        DetayKarti(
            title: lt("Schedule & Alerts"),
            iconName: cardHeaderIcon(for: .schedule),
            kartTipi: .schedule,
            yukseklik: bindingYukseklik(for: .schedule),
            sutunGenisligi: getBinding(for: colIndex),
            draggedKart: $draggedKart,
            uiTetikleyici: uiTetikleyici,
            kartRengi: getKartColor(kart: .schedule),
            onHeightChangeEnd: kaydetKartYukseklikleri,
            onWidthChangeEnd: saveWidths,
            onHide: { setCardVisibleWithUndo(.schedule, false) },
            onColorChange: { setKartColor(kart: .schedule, color: $0) },
            onEditHeadings: { headingEditorTarget = .schedule }
        ) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 10) {
                    Text(lt("Quick Reminder"))
                        .font(.system(size: 13))
                        .foregroundColor(.gray)
                        .frame(width: 110, alignment: .leading)

                    Spacer()

                    Menu {
                        ForEach(quickReminderTemplates) { item in
                            Button(lt(item.title)) {
                                quickSchedule(item)
                            }
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Text(lt("Select reminder"))
                                .font(.system(size: 12, weight: .bold))
                            Image(systemName: "chevron.down")
                                .font(.system(size: 9, weight: .bold))
                        }
                        .foregroundColor(.blue)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.blue.opacity(0.12))
                        .cornerRadius(6)
                    }
                    .buttonStyle(.plain)
                }

                VStack(alignment: .leading, spacing: 10) {
                    TextField(lt("Reminder title"), text: $newScheduleTitle)
                        .textFieldStyle(.roundedBorder)

                    DatePicker(lt("Date & Time"), selection: $newScheduleDueAt, displayedComponents: [.date, .hourAndMinute])
                        .font(.system(size: 12))

                    HStack(spacing: 10) {
                        Picker(lt("Priority"), selection: $newSchedulePriority) {
                            Text(lt("Low")).tag("Low")
                            Text(lt("Normal")).tag("Normal")
                            Text(lt("High")).tag("High")
                            Text(lt("Urgent")).tag("Urgent")
                        }
                        .pickerStyle(.menu)

                        Toggle(lt("Notify"), isOn: $newScheduleNotify)
                            .toggleStyle(.switch)
                            .controlSize(.small)
                    }

                    alignedNotesEditor(
                        text: $newScheduleNote,
                        placeholder: lt("Optional note..."),
                        textColor: .primary,
                        placeholderColor: .gray.opacity(0.55),
                        backgroundColor: Color.primary.opacity(0.035),
                        focusTarget: .scheduleNote,
                        minHeight: 58
                    )

                    Button {
                        addScheduleItem()
                    } label: {
                        Label(lt("Add Reminder"), systemImage: "plus.circle.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                }

                if !scheduleMessage.isEmpty {
                    Text(lt(scheduleMessage))
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(scheduleMessage.lowercased().contains("error") ? .red : .green)
                }

                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text(lt("Upcoming"))
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.gray)
                        Spacer()
                        Text("\(activeScheduleItems.count)")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.secondary)
                    }

                    if activeScheduleItems.isEmpty {
                        Text(lt("No active reminders yet."))
                            .font(.system(size: 12))
                            .foregroundColor(.gray)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(10)
                            .background(Color.primary.opacity(0.035))
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    } else {
                        ForEach(activeScheduleItems.prefix(6)) { item in
                            scheduleItemRow(item)
                        }
                    }
                }

                if !completedScheduleItems.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(lt("Recently completed"))
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.gray)

                        ForEach(completedScheduleItems.prefix(3)) { item in
                            HStack(spacing: 8) {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(.green)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(lt(item.title))
                                        .font(.system(size: 12, weight: .semibold))
                                        .strikethrough()
                                    Text(scheduleDateText(item.completedAt ?? item.dueAt))
                                        .font(.system(size: 10))
                                        .foregroundColor(.gray)
                                }
                                Spacer()
                                Button(role: .destructive) { deleteScheduleItem(item) } label: {
                                    Image(systemName: "trash")
                                }
                                .buttonStyle(.plain)
                            }
                            .padding(8)
                            .background(Color.green.opacity(0.06))
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        }
                    }
                }
            }
        }
    }

    private var scheduleQuickReminderSettingsView: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(lt("Quick reminder settings"))
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.gray)
                Spacer()
                Button {
                    resetQuickReminderDefaults()
                    showScheduleQuickSettings = false
                } label: {
                    Image(systemName: "arrow.counterclockwise")
                }
                .buttonStyle(.borderless)
                .help(lt("Reset defaults"))
            }

            VStack(alignment: .leading, spacing: 7) {
                ForEach(editableQuickReminders.indices, id: \.self) { index in
                    HStack(spacing: 8) {
                        TextField(lt("Button text"), text: $editableQuickReminders[index].title)
                            .textFieldStyle(.roundedBorder)
                            .font(.system(size: 12))

                        Button(role: .destructive) {
                            editableQuickReminders.remove(at: index)
                        } label: {
                            Image(systemName: "minus.circle.fill")
                                .foregroundColor(.red)
                        }
                        .buttonStyle(.borderless)
                    }
                }
            }

            HStack(spacing: 8) {
                Button {
                    addEditableQuickReminder()
                } label: {
                    Label(lt("Add quick button"), systemImage: "plus.circle")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)

                Spacer()

                Button {
                    let cleaned = editableQuickReminders
                        .map { item -> ScheduleQuickReminderItem in
                            var updated = item
                            updated.title = item.title.trimmingCharacters(in: .whitespacesAndNewlines)
                            return updated
                        }
                        .filter { !$0.title.isEmpty }
                    saveQuickReminderItems(cleaned)
                    editableQuickReminders = cleaned
                    showScheduleQuickSettings = false
                } label: {
                    Label(lt("Save quick buttons"), systemImage: "checkmark.circle.fill")
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
            }
        }
    }

    private func scheduleItemRow(_ item: ScheduleAlertItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                Circle()
                    .fill(scheduleStatusColor(item))
                    .frame(width: 9, height: 9)
                    .padding(.top, 5)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(lt(item.title))
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.primary)
                            .lineLimit(2)
                        Text(lt(item.priority))
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(schedulePriorityColor(item.priority))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(schedulePriorityColor(item.priority).opacity(0.12))
                            .clipShape(Capsule())
                    }

                    Text("\(scheduleDateText(item.dueAt)) · \(scheduleRelativeText(item))")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(scheduleStatusColor(item))

                    if !item.note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text(item.note)
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                            .lineLimit(3)
                    }
                }

                Spacer(minLength: 0)

                Menu {
                    Button { completeScheduleItem(item) } label: { Label(lt("Mark Done"), systemImage: "checkmark.circle") }
                    Button { snoozeScheduleItem(item, hours: 1) } label: { Label(lt("Snooze 1 hour"), systemImage: "clock.arrow.circlepath") }
                    Button { snoozeScheduleItem(item, hours: 24) } label: { Label(lt("Snooze 1 day"), systemImage: "calendar.badge.clock") }
                    Button(role: .destructive) { deleteScheduleItem(item) } label: { Label(lt("Delete"), systemImage: "trash") }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .foregroundColor(.gray)
                        .padding(4)
                }
                .menuStyle(.borderlessButton)
            }
        }
        .padding(10)
        .background(scheduleStatusColor(item).opacity(0.08))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(scheduleStatusColor(item).opacity(0.16), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    // What the customer was quoted, and — once they have decided — the evidence
    // of it. Read-only here: an estimate is created and decided on the server,
    // never edited in place, because a revision has to leave the old one intact.
    private var currentEstimateSummary: OrderEstimateSummary? {
        let rows = siparis.estimates ?? []
        return rows.first(where: { $0.status != "superseded" }) ?? rows.first
    }

    private var estimateFetchKey: String {
        guard let orderId = siparis.id, let current = currentEstimateSummary else { return "" }
        return "\(orderId)|\(current.id)|\(current.status)|\(current.linkState)"
    }

    // The card shows what the server holds, not the index on the order document:
    // that index is writable by any workspace member, and this is evidence.
    @MainActor private func loadEstimateRecord() {
        let key = estimateFetchKey
        guard !key.isEmpty else {
            estimateRecord = nil
            estimateRecordKey = ""
            return
        }
        guard key != estimateRecordKey else { return }
        estimateRecordKey = key
        // Dropped before the round trip: keeping it rendered the previous
        // revision's items — and its customer's signature — under the new number.
        estimateRecord = nil
        guard let orderId = siparis.id, let current = currentEstimateSummary else { return }

        #if canImport(FirebaseFunctions)
        let payload: [String: Any] = [
            "companyId": siparis.companyId,
            "orderId": orderId,
            "estimateId": current.id
        ]
        Functions.functions(region: "europe-west2").httpsCallable("getOrderEstimateRecord").call(payload) { result, error in
            DispatchQueue.main.async {
                if let error {
                    // Clear the key so the next pass retries. Latching it here left
                    // the card permanently empty after one dropped connection.
                    self.estimateRecordKey = ""
                    self.estimateRecord = nil
                    self.estimateNotice = error.localizedDescription
                    return
                }
                let data = result?.data as? [String: Any]
                guard let record = OrderEstimateRecord(dictionary: data?["record"] as? [String: Any]) else {
                    self.estimateRecordKey = ""
                    self.estimateRecord = nil
                    return
                }
                self.estimateRecord = record
            }
        }
        #else
        estimateRecord = nil
        #endif
    }

    // Three server calls the card offers. None of them decide anything locally:
    // the number, the totals and the status are all the server's to set.
    @MainActor private func createEstimateRevision() {
        guard let orderId = siparis.id, !orderId.isEmpty else { return }
        let lines = (siparis.lineItems ?? []).map { item -> [String: Any] in
            ["name": item.name, "quantity": item.quantity, "unitPrice": item.unitPrice, "lineTotal": item.lineTotal]
        }
        guard !lines.isEmpty else {
            estimateNotice = t("Add invoice items first — the estimate is built from them.", lang: seciliDil)
            return
        }
        let current = currentEstimateSummary
        var payload: [String: Any] = [
            "companyId": siparis.companyId,
            "orderId": orderId,
            "lineItems": lines,
            "taxRate": siparis.taxRate,
            "taxType": siparis.taxType
        ]
        if let current, current.status != "superseded" { payload["supersedesId"] = current.id }

        estimateBusy = true
        estimateNotice = ""
        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2").httpsCallable("createOrderEstimate").call(payload) { _, error in
            DispatchQueue.main.async {
                self.estimateBusy = false
                self.estimateNotice = error == nil
                    ? t("New estimate created from the invoice items.", lang: self.seciliDil)
                    : (error?.localizedDescription ?? "")
            }
        }
        #else
        estimateBusy = false
        #endif
    }

    @MainActor private func sendEstimateLink() {
        guard let orderId = siparis.id, let current = currentEstimateSummary else { return }
        estimateBusy = true
        estimateNotice = ""
        #if canImport(FirebaseFunctions)
        let payload: [String: Any] = ["companyId": siparis.companyId, "orderId": orderId, "estimateId": current.id]
        Functions.functions(region: "europe-west2").httpsCallable("sendOrderEstimate").call(payload) { result, error in
            DispatchQueue.main.async {
                self.estimateBusy = false
                if let error {
                    self.estimateNotice = error.localizedDescription
                    return
                }
                // There is no outbound email to customers, so the link goes on
                // the clipboard and the jeweller sends it themselves.
                let url = (result?.data as? [String: Any])?["url"] as? String ?? ""
                if !url.isEmpty {
                    #if os(macOS)
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(url, forType: .string)
                    #else
                    UIPasteboard.general.string = url
                    #endif
                }
                self.estimateNotice = t("Link copied. Send it to your customer.", lang: self.seciliDil)
            }
        }
        #else
        estimateBusy = false
        #endif
    }

    @MainActor private func revokeEstimateLink() {
        guard let orderId = siparis.id, let current = currentEstimateSummary else { return }
        estimateBusy = true
        #if canImport(FirebaseFunctions)
        let payload: [String: Any] = ["companyId": siparis.companyId, "orderId": orderId, "estimateId": current.id]
        Functions.functions(region: "europe-west2").httpsCallable("revokeOrderEstimateLink").call(payload) { _, error in
            DispatchQueue.main.async {
                self.estimateBusy = false
                self.estimateNotice = error == nil ? t("Link revoked.", lang: self.seciliDil) : (error?.localizedDescription ?? "")
            }
        }
        #else
        estimateBusy = false
        #endif
    }

    private func estimateStatusLabel(_ status: String) -> String {
        switch status {
        case "sent": return "Sent"
        case "viewed": return "Viewed"
        case "approved": return "Approved"
        case "declined": return "Declined"
        case "superseded": return "Superseded"
        default: return "Draft"
        }
    }

    private func estimateStatusColor(_ status: String) -> Color {
        switch status {
        case "approved": return .green
        case "declined": return .red
        case "superseded": return .gray
        default: return .blue
        }
    }

    private func estimateMomentText(_ ms: Double) -> String {
        guard ms > 0 else { return "—" }
        let formatter = DateFormatter()
        formatter.dateFormat = "dd/MM/yy HH:mm"
        return formatter.string(from: Date(timeIntervalSince1970: ms / 1000))
    }

    private func estimateKarti(colIndex: Int) -> some View {
        DetayKarti(
            title: t("Estimate & Approval", lang: seciliDil),
            iconName: cardHeaderIcon(for: .estimate),
            kartTipi: .estimate,
            yukseklik: bindingYukseklik(for: .estimate),
            sutunGenisligi: getBinding(for: colIndex),
            draggedKart: $draggedKart,
            uiTetikleyici: uiTetikleyici,
            kartRengi: getKartColor(kart: .estimate),
            onHeightChangeEnd: kaydetKartYukseklikleri,
            onWidthChangeEnd: saveWidths,
            onHide: { setCardVisibleWithUndo(.estimate, false) },
            onColorChange: { setKartColor(kart: .estimate, color: $0) }
        ) {
            if let current = currentEstimateSummary {
                HStack {
                    Text(current.number.isEmpty ? "#\(current.version)" : current.number)
                        .font(.system(size: 14, weight: .bold))
                    Spacer()
                    Text(t(estimateStatusLabel(current.status), lang: seciliDil))
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(estimateStatusColor(current.status))
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .background(estimateStatusColor(current.status).opacity(0.18))
                        .cornerRadius(6)
                }

                Divider().background(Color.primary.opacity(0.1))

                // Line items come from the record, never from the order document.
                if let lines = estimateRecord?.lineItems, !lines.isEmpty {
                    ForEach(lines) { item in
                        HStack(spacing: 10) {
                            Text(item.name.isEmpty ? "-" : item.name)
                                .font(.system(size: 13))
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer()
                            Text(privacyCurrency(item.lineTotal, symbol: seciliParaBirimi, ondalik: seciliOndalik, hideNumbers: hideSensitiveNumbers))
                                .font(.system(size: 13, weight: .semibold))
                        }
                    }
                    Divider().background(Color.primary.opacity(0.1))
                }

                estimateAmountRow(t("Subtotal", lang: seciliDil), current.subtotal)
                if current.taxType != "Profit" && current.taxRate > 0.0001 {
                    estimateAmountRow("\(t("VAT", lang: seciliDil)) (\(Int(current.taxRate))%)", current.taxAmount)
                }
                estimateAmountRow(t("Total", lang: seciliDil), current.total, bold: true)

                if current.decidedAtMs > 0 {
                    Divider().background(Color.primary.opacity(0.1))
                    estimateDetailRow(
                        t(current.status == "declined" ? "Declined by" : "Approved by", lang: seciliDil),
                        current.decidedBy.isEmpty ? "—" : current.decidedBy
                    )
                    estimateDetailRow(
                        t(current.status == "declined" ? "Declined at" : "Approved at", lang: seciliDil),
                        estimateMomentText(current.decidedAtMs)
                    )
                    estimateDetailRow(t("Approval Method", lang: seciliDil), t("Customer Portal", lang: seciliDil))
                    if let signature = estimateRecord?.approval?.signatureDownloadUrl, !signature.isEmpty {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(t("Customer Signature", lang: seciliDil))
                                .font(.system(size: 13)).foregroundColor(.gray)
                            AsyncImage(url: URL(string: signature)) { image in
                                image.resizable().scaledToFit()
                            } placeholder: {
                                Color.primary.opacity(0.05)
                            }
                            .frame(maxWidth: .infinity, maxHeight: 70, alignment: .leading)
                            .background(Color.white)
                            .cornerRadius(6)
                        }
                    } else if current.hasSignature {
                        estimateDetailRow(t("Customer Signature", lang: seciliDil), t("Signed", lang: seciliDil))
                    }
                }

                let history = (siparis.estimates ?? []).filter { $0.id != current.id }
                if !history.isEmpty {
                    Divider().background(Color.primary.opacity(0.1))
                    Text(t("Estimate History", lang: seciliDil))
                        .font(.system(size: 12)).foregroundColor(.gray)
                    ForEach(history) { row in
                        estimateDetailRow(
                            row.number.isEmpty ? "#\(row.version)" : row.number,
                            "\(privacyCurrency(row.total, symbol: seciliParaBirimi, ondalik: seciliOndalik, hideNumbers: hideSensitiveNumbers)) · \(t(estimateStatusLabel(row.status), lang: seciliDil))"
                        )
                    }
                }
                Divider().background(Color.primary.opacity(0.1))

                // Printing is reading: anyone who can see the card can take a
                // copy. Sending and revising need edit rights.
                estimateActionButton(t("View Estimate PDF", lang: seciliDil), disabled: estimateRecord == nil) {
                    exportToEstimatePDF()
                }

                if canEditOrderDetails {
                    if current.decidedAtMs == 0 && current.status != "superseded" {
                        estimateActionButton(
                            t(current.linkState == "active" ? "Copy link again" : "Send to customer", lang: seciliDil),
                            disabled: estimateBusy
                        ) { sendEstimateLink() }
                    }
                    if current.linkState == "active" && current.decidedAtMs == 0 {
                        estimateActionButton(t("Revoke link", lang: seciliDil), disabled: estimateBusy) {
                            revokeEstimateLink()
                        }
                    }
                    estimateActionButton(t("Create new estimate", lang: seciliDil), disabled: estimateBusy) {
                        createEstimateRevision()
                    }
                }
            } else {
                Text(t("No estimate yet.", lang: seciliDil))
                    .font(.system(size: 12))
                    .foregroundColor(.gray)
                    .fixedSize(horizontal: false, vertical: true)
                if canEditOrderDetails {
                    estimateActionButton(t("Create estimate", lang: seciliDil), disabled: estimateBusy) {
                        createEstimateRevision()
                    }
                }
            }
            // Outside the branch: the notice used to live only in the populated
            // half, so the empty state's refusals and confirmations were mute.
            if !estimateNotice.isEmpty {
                Text(estimateNotice)
                    .font(.system(size: 12)).foregroundColor(.gray)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .task(id: estimateFetchKey) { loadEstimateRecord() }
    }

    @ViewBuilder
    private func estimateActionButton(_ title: String, disabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 7)
                .background(Color.primary.opacity(0.06))
                .cornerRadius(7)
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.5 : 1)
    }

    @ViewBuilder
    private func estimateAmountRow(_ label: String, _ value: Double, bold: Bool = false) -> some View {
        HStack(spacing: 10) {
            Text(label).font(.system(size: 13)).foregroundColor(.gray)
            Spacer()
            Text(privacyCurrency(value, symbol: seciliParaBirimi, ondalik: seciliOndalik, hideNumbers: hideSensitiveNumbers))
                .font(.system(size: bold ? 15 : 13, weight: bold ? .bold : .semibold))
        }
    }

    @ViewBuilder
    private func estimateDetailRow(_ label: String, _ value: String) -> some View {
        HStack(spacing: 10) {
            Text(label).font(.system(size: 13)).foregroundColor(.gray)
            Spacer()
            Text(value).font(.system(size: 13, weight: .semibold))
        }
    }

    // A custom order is something we make; a repair is the customer's own item,
    // left with us. Choosing Repair is what brings the intake card out.
    @ViewBuilder
    private var orderTypeRow: some View {
        HStack(spacing: 10) {
            Text(t("Order Type", lang: seciliDil))
                .font(.system(size: 12)).foregroundColor(.gray)
            Spacer()
            if canEditOrderDetails {
                Menu {
                    Button(t("Custom Order", lang: seciliDil)) { siparis.orderType = "custom" }
                    Button(t("Repair / Service", lang: seciliDil)) { siparis.orderType = "repair" }
                } label: {
                    Text(t(siparis.orderType == "repair" ? "Repair / Service" : "Custom Order", lang: seciliDil))
                        .font(.system(size: 12, weight: .bold))
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(Color.primary.opacity(0.06))
                        .cornerRadius(6)
                }
                .buttonStyle(.plain)
            } else {
                Text(t(siparis.orderType == "repair" ? "Repair / Service" : "Custom Order", lang: seciliDil))
                    .font(.system(size: 12, weight: .bold))
            }
        }
    }

    // The customer's own item, taken in for repair. Never stock: the server stamps
    // customerOwned so nothing downstream can mistake it for inventory.
    // The customer's own page for this order: one link, no login at the far end.
    // What they see is chosen here and enforced on the server.
    private func customerPortalKarti(colIndex: Int) -> some View {
        DetayKarti(
            title: t("Customer Portal", lang: seciliDil),
            iconName: cardHeaderIcon(for: .customerPortal),
            kartTipi: .customerPortal,
            yukseklik: bindingYukseklik(for: .customerPortal),
            sutunGenisligi: getBinding(for: colIndex),
            draggedKart: $draggedKart,
            uiTetikleyici: uiTetikleyici,
            kartRengi: getKartColor(kart: .customerPortal),
            onHeightChangeEnd: kaydetKartYukseklikleri,
            onWidthChangeEnd: saveWidths,
            onHide: { setCardVisibleWithUndo(.customerPortal, false) },
            onColorChange: { setKartColor(kart: .customerPortal, color: $0) }
        ) {
            let active = !siparis.portalTokenId.isEmpty
            let shows = siparis.portalVisibility ?? CustomerPortalVisibility()
            let auto = siparis.portalAutoUpdates ?? CustomerPortalAutoUpdates()

            HStack(spacing: 8) {
                Text(t("Portal Access", lang: seciliDil))
                    .font(.system(size: 12, weight: .bold)).foregroundColor(.gray)
                Spacer()
                Text(t(active ? "Active" : "Off", lang: seciliDil))
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(active ? .green : .gray)
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background((active ? Color.green : Color.gray).opacity(0.15))
                    .cornerRadius(999)
            }

            if active, !portalLinkURL.isEmpty {
                HStack(spacing: 8) {
                    Text(portalLinkURL)
                        .font(.system(size: 11)).foregroundColor(.blue)
                        .lineLimit(1).truncationMode(.middle)
                    Spacer()
                    Button(t("Copy Link", lang: seciliDil)) { copyPortalLink() }
                        .font(.system(size: 11))
                    Button(t("Open Portal", lang: seciliDil)) { openPortalLink() }
                        .font(.system(size: 11))
                }
            } else {
                Text(t("No portal link yet. Create one and send it to your customer — they can open it without signing in.", lang: seciliDil))
                    .font(.system(size: 11)).foregroundColor(.gray)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if canEditOrderDetails {
                HStack(spacing: 8) {
                    Button(t(active ? "Create a fresh link" : "Create portal link", lang: seciliDil)) {
                        createPortalLink()
                    }
                    .font(.system(size: 11))
                    .disabled(portalBusy)
                    if active {
                        Button(t("Turn off", lang: seciliDil)) { revokePortalLink() }
                            .font(.system(size: 11))
                            .disabled(portalBusy)
                    }
                    Spacer()
                }
            }

            if !portalNotice.isEmpty {
                Text(portalNotice).font(.system(size: 11)).foregroundColor(.gray)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Divider().background(Color.primary.opacity(0.1))

            Text(t("Customer Sees", lang: seciliDil))
                .font(.system(size: 12, weight: .bold)).foregroundColor(.gray)
            portalSeesRow(t("Repair status", lang: seciliDil), shows.status) { var next = shows; next.status.toggle(); savePortalPreferences(next, auto) }
            portalSeesRow(t("Estimate & approval", lang: seciliDil), shows.estimate) { var next = shows; next.estimate.toggle(); savePortalPreferences(next, auto) }
            portalSeesRow(t("Payment & invoices", lang: seciliDil), shows.payments) { var next = shows; next.payments.toggle(); savePortalPreferences(next, auto) }
            portalSeesRow(t("Photos & updates", lang: seciliDil), shows.photos) { var next = shows; next.photos.toggle(); savePortalPreferences(next, auto) }
            portalSeesRow(t("Expected completion", lang: seciliDil), shows.expectedDate) { var next = shows; next.expectedDate.toggle(); savePortalPreferences(next, auto) }

            Text(t("Internal notes, costs, supplier and profit are never shown, whatever is switched on here.", lang: seciliDil))
                .font(.system(size: 10)).foregroundColor(.gray)
                .fixedSize(horizontal: false, vertical: true)

            Divider().background(Color.primary.opacity(0.1))

            HStack(spacing: 8) {
                Text(t("Automatic Updates", lang: seciliDil))
                    .font(.system(size: 12, weight: .bold)).foregroundColor(.gray)
                Spacer()
                Toggle("", isOn: Binding(
                    get: { auto.enabled },
                    set: { newValue in var next = auto; next.enabled = newValue; savePortalPreferences(shows, next) }
                ))
                .labelsHidden()
                .disabled(!canEditOrderDetails)
            }
            Text(t("Sent when the order's status moves — estimate ready, work started, ready for collection.", lang: seciliDil))
                .font(.system(size: 10)).foregroundColor(.gray)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 10) {
                Text(t("Email", lang: seciliDil)).font(.system(size: 11)).foregroundColor(.gray)
                Button(t(auto.email ? "ON" : "OFF", lang: seciliDil)) {
                    var next = auto; next.email.toggle(); savePortalPreferences(shows, next)
                }
                .font(.system(size: 10, weight: .bold))
                .disabled(!canEditOrderDetails || !auto.enabled)
                Text(t("SMS", lang: seciliDil)).font(.system(size: 11)).foregroundColor(.gray)
                Text(t("OFF", lang: seciliDil)).font(.system(size: 10, weight: .bold)).foregroundColor(.gray)
                Spacer()
            }
            Text(t("SMS is not connected yet — email only for now.", lang: seciliDil))
                .font(.system(size: 10)).foregroundColor(.gray)
        }
    }

    @ViewBuilder
    private func portalSeesRow(_ title: String, _ isOn: Bool, _ toggle: @escaping () -> Void) -> some View {
        Button(action: { if canEditOrderDetails { toggle() } }) {
            HStack(spacing: 8) {
                Image(systemName: isOn ? "checkmark.circle.fill" : "minus.circle")
                    .foregroundColor(isOn ? .green : .gray)
                    .font(.system(size: 13))
                Text(title).font(.system(size: 12)).foregroundColor(.primary)
                Spacer()
            }
            .opacity(isOn ? 1 : 0.6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!canEditOrderDetails)
    }

    private var portalLinkURL: String {
        siparis.portalToken.isEmpty ? "" : "https://nivadesk.app/track/\(siparis.portalToken)"
    }

    private func copyPortalLink() {
        guard !portalLinkURL.isEmpty else { return }
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(portalLinkURL, forType: .string)
        #else
        UIPasteboard.general.string = portalLinkURL
        #endif
        portalNotice = t("Link copied. Send it to your customer.", lang: seciliDil)
    }

    private func openPortalLink() {
        guard let url = URL(string: portalLinkURL) else { return }
        #if os(macOS)
        NSWorkspace.shared.open(url)
        #else
        UIApplication.shared.open(url)
        #endif
    }

    @MainActor private func createPortalLink() {
        guard let orderId = siparis.id, !orderId.isEmpty else { return }
        portalBusy = true
        portalNotice = ""
        #if canImport(FirebaseFunctions)
        let payload: [String: Any] = ["companyId": siparis.companyId, "orderId": orderId]
        Functions.functions(region: "europe-west2").httpsCallable("createOrderPortalLink").call(payload) { _, error in
            DispatchQueue.main.async {
                self.portalBusy = false
                self.portalNotice = error == nil
                    ? t("Portal link created.", lang: self.seciliDil)
                    : (error?.localizedDescription ?? "")
            }
        }
        #else
        portalBusy = false
        #endif
    }

    @MainActor private func revokePortalLink() {
        guard let orderId = siparis.id, !orderId.isEmpty else { return }
        portalBusy = true
        portalNotice = ""
        #if canImport(FirebaseFunctions)
        let payload: [String: Any] = ["companyId": siparis.companyId, "orderId": orderId]
        Functions.functions(region: "europe-west2").httpsCallable("revokeOrderPortalLink").call(payload) { _, error in
            DispatchQueue.main.async {
                self.portalBusy = false
                self.portalNotice = error == nil
                    ? t("Portal turned off. The customer's link no longer opens.", lang: self.seciliDil)
                    : (error?.localizedDescription ?? "")
            }
        }
        #else
        portalBusy = false
        #endif
    }

    @MainActor private func savePortalPreferences(_ visibility: CustomerPortalVisibility, _ auto: CustomerPortalAutoUpdates) {
        guard let orderId = siparis.id, !orderId.isEmpty, canEditOrderDetails else { return }
        // Optimistic so the row responds at once; the listener confirms it.
        siparis.portalVisibility = visibility
        siparis.portalAutoUpdates = auto
        #if canImport(FirebaseFunctions)
        let payload: [String: Any] = [
            "companyId": siparis.companyId,
            "orderId": orderId,
            "visibility": [
                "status": visibility.status,
                "estimate": visibility.estimate,
                "payments": visibility.payments,
                "photos": visibility.photos,
                "expectedDate": visibility.expectedDate
            ],
            "autoUpdates": ["enabled": auto.enabled, "email": auto.email, "sms": auto.sms]
        ]
        Functions.functions(region: "europe-west2").httpsCallable("saveOrderPortalSettings").call(payload) { _, error in
            if let error {
                DispatchQueue.main.async { self.portalNotice = error.localizedDescription }
            }
        }
        #endif
    }

    private func repairIntakeKarti(colIndex: Int) -> some View {
        DetayKarti(
            title: t("Repair Intake & Item", lang: seciliDil),
            iconName: cardHeaderIcon(for: .repairIntake),
            kartTipi: .repairIntake,
            yukseklik: bindingYukseklik(for: .repairIntake),
            sutunGenisligi: getBinding(for: colIndex),
            draggedKart: $draggedKart,
            uiTetikleyici: uiTetikleyici,
            kartRengi: getKartColor(kart: .repairIntake),
            onHeightChangeEnd: kaydetKartYukseklikleri,
            onWidthChangeEnd: saveWidths,
            onHide: { setCardVisibleWithUndo(.repairIntake, false) },
            onColorChange: { setKartColor(kart: .repairIntake, color: $0) },
            onEditHeadings: { headingEditorTarget = .repairIntake }
        ) {
            // Different trades take in different things. The rows can still be
            // renamed one by one; this just swaps the whole set for a closer start.
            if canEditOrderDetails {
                HStack(spacing: 8) {
                    Text(t("Intake template", lang: seciliDil))
                        .font(.system(size: 12)).foregroundColor(.gray)
                    Menu {
                        ForEach(RepairIntakePresets.all) { preset in
                            Button {
                                applyRepairIntakePreset(preset)
                            } label: {
                                let suggested = preset.id == RepairIntakePresets.presetId(forBusinessType: businessType)
                                Text(t(preset.label, lang: seciliDil) + (suggested ? " ★" : ""))
                            }
                        }
                    } label: {
                        Text(currentRepairIntakePresetLabel)
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .menuStyle(.borderlessButton)
                    .fixedSize()
                    Spacer()
                }
                .padding(.bottom, 2)
            }

            ForEach(repairIntakeFieldsList) { field in
                DetailField(
                    label: t(field.title, lang: seciliDil),
                    value: repairIntakeFieldBinding(field.id),
                    editableLabelRaw: canEditOrderDetails ? field.title : nil,
                    onLabelCommit: canEditOrderDetails ? { renameRepairIntakeField(field.id, to: $0) } : nil
                )
            }

            Divider().background(Color.primary.opacity(0.1))

            repairIntakeListEditor(
                title: t("Condition", lang: seciliDil),
                lines: repairIntakeLinesBinding(\.condition)
            )

            repairIntakeListEditor(
                title: t("Requested Work", lang: seciliDil),
                lines: repairIntakeLinesBinding(\.requestedWork)
            )

            if canAccessClientFiles {
                Divider().background(Color.primary.opacity(0.1))
                repairIntakePhotoStrip
            }

            Divider().background(Color.primary.opacity(0.1))

            HStack(spacing: 10) {
                Text(t("Received", lang: seciliDil))
                    .font(.system(size: 13)).foregroundColor(.gray)
                    .frame(width: 110, alignment: .leading)
                Text(repairIntakeReceivedText)
                    .font(.system(size: 13, weight: .semibold))
                Spacer()
            }

            HStack(spacing: 10) {
                Text(t("Received By", lang: seciliDil))
                    .font(.system(size: 13)).foregroundColor(.gray)
                    .frame(width: 110, alignment: .leading)
                Text(siparis.repairIntake?.receivedByName.isEmpty == false ? siparis.repairIntake!.receivedByName : "—")
                    .font(.system(size: 13, weight: .semibold))
                Spacer()
            }
        }
    }

    // Photos of what the customer actually handed over. They ride on the client
    // files of this order, so each order has its own set and the permission that
    // governs client files governs these too. Kept deliberately small: four
    // thumbnails across, more only as the card widens.
    private var repairIntakePhotos: [ClientFileItem] {
        guard canAccessClientFiles else { return [] }
        return clientFileItems.filter { item in
            guard item.contentType.lowercased().hasPrefix("image") else { return false }
            // The preview card mirrors the design mock-up into client files. That
            // is a picture of what we are making, not of what came in.
            if !siparis.designLink.isEmpty && item.downloadURL == siparis.designLink { return false }
            return true
        }
    }

    @ViewBuilder
    private var repairIntakePhotoStrip: some View {
        let photos = repairIntakePhotos
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(t("Intake Photos", lang: seciliDil))
                    .font(.system(size: 13)).foregroundColor(.gray)
                Spacer()
                if canEditClientFiles {
                    Button { presentClientFilePicker() } label: {
                        Label(t("Add photos", lang: seciliDil), systemImage: "plus.circle")
                            .font(.system(size: 11))
                    }
                    .buttonStyle(.plain)
                }
            }

            if photos.isEmpty {
                Text("—").font(.system(size: 13, weight: .semibold))
            } else {
                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 56, maximum: 76), spacing: 6, alignment: .leading)],
                    alignment: .leading,
                    spacing: 6
                ) {
                    ForEach(photos.prefix(8)) { photo in
                        Button { clientFilePreviewItem = photo } label: {
                            repairIntakePhotoThumb(photo, extra: photo.id == photos.prefix(8).last?.id && photos.count > 8 ? photos.count - 8 : 0)
                        }
                        .buttonStyle(.plain)
                        .help(photo.note.isEmpty ? photo.fileName : photo.note)
                    }
                }
                .frame(maxWidth: 320, alignment: .leading)
            }
        }
    }

    @ViewBuilder
    private func repairIntakePhotoThumb(_ photo: ClientFileItem, extra: Int) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Color.primary.opacity(0.06))
            if let url = URL(string: photo.downloadURL), !photo.downloadURL.isEmpty {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    default:
                        Image(systemName: "photo").font(.system(size: 14)).foregroundColor(.secondary)
                    }
                }
            } else {
                Image(systemName: "photo").font(.system(size: 14)).foregroundColor(.secondary)
            }
            if extra > 0 {
                Color.black.opacity(0.45)
                Text("+\(extra)").font(.system(size: 13, weight: .bold)).foregroundColor(.white)
            }
        }
        .frame(height: 56)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private var repairIntakeReceivedText: String {
        guard let received = siparis.repairIntake?.receivedAt else { return "—" }
        let formatter = DateFormatter()
        formatter.dateFormat = "d MMM yyyy · HH:mm"
        return formatter.string(from: received)
    }

    @ViewBuilder
    private func repairIntakeListEditor(title: String, lines: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.system(size: 13)).foregroundColor(.gray)
            TextEditor(text: lines)
                .font(.system(size: 13))
                .frame(minHeight: 62)
                .padding(6)
                .background(colorSchemeFieldSurface())
                .cornerRadius(6)
                .disabled(!canEditOrderDetails)
        }
    }

    private func ensuredRepairIntake() -> RepairIntake {
        if let existing = siparis.repairIntake { return existing }
        var fresh = RepairIntake()
        fresh.receivedAt = Date()
        fresh.receivedByUid = Auth.auth().currentUser?.uid ?? ""
        fresh.receivedByName = Auth.auth().currentUser?.displayName ?? Auth.auth().currentUser?.email ?? ""
        return fresh
    }

    private func repairIntakeFieldBinding(_ fieldId: String) -> Binding<String> {
        Binding(
            get: { siparis.repairIntake?.fields[fieldId] ?? "" },
            set: { newValue in
                var intake = ensuredRepairIntake()
                let cleaned = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
                if cleaned.isEmpty { intake.fields.removeValue(forKey: fieldId) } else { intake.fields[fieldId] = newValue }
                siparis.repairIntake = intake
            }
        )
    }

    // The two lists a jeweller writes at the counter, edited as plain lines.
    private func repairIntakeLinesBinding(_ keyPath: WritableKeyPath<RepairIntake, [String]>) -> Binding<String> {
        Binding(
            get: { (siparis.repairIntake?[keyPath: keyPath] ?? []).joined(separator: "\n") },
            set: { newValue in
                var intake = ensuredRepairIntake()
                intake[keyPath: keyPath] = newValue
                    .components(separatedBy: "\n")
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
                siparis.repairIntake = intake
            }
        )
    }

    private var currentRepairIntakePresetLabel: String {
        let matched = RepairIntakePresets.matchingPresetId(for: repairIntakeFieldsList)
        guard let preset = RepairIntakePresets.preset(id: matched) else {
            return t("Custom rows", lang: seciliDil)
        }
        return t(preset.label, lang: seciliDil)
    }

    // Ids carry the stored values, so switching template keeps anything already
    // recorded under a row the new set also has.
    private func applyRepairIntakePreset(_ preset: RepairIntakePresetDTO) {
        guard let data = try? JSONEncoder().encode(preset.fields),
              let json = String(data: data, encoding: .utf8) else { return }
        repairIntakeFieldsJSON = json
        syncCardLabel(key: "repairIntakeFieldsJSON", value: json)
    }

    private func renameRepairIntakeField(_ fieldId: String, to newTitle: String) {
        let cleaned = newTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return }
        var rows = repairIntakeFieldsList
        guard let index = rows.firstIndex(where: { $0.id == fieldId }) else { return }
        rows[index] = RepairIntakeFieldDTO(id: fieldId, title: cleaned)
        if let data = try? JSONEncoder().encode(rows), let json = String(data: data, encoding: .utf8) {
            repairIntakeFieldsJSON = json
            syncCardLabel(key: "repairIntakeFieldsJSON", value: json)
        }
    }

    private func priorityKarti(colIndex: Int) -> some View {
        DetayKarti(
            title: t("Priority / Risk", lang: seciliDil),
            iconName: cardHeaderIcon(for: .priority),
            kartTipi: .priority,
            yukseklik: bindingYukseklik(for: .priority),
            sutunGenisligi: getBinding(for: colIndex),
            draggedKart: $draggedKart,
            uiTetikleyici: uiTetikleyici,
            kartRengi: getKartColor(kart: .priority),
            onHeightChangeEnd: kaydetKartYukseklikleri,
            onWidthChangeEnd: saveWidths,
            onHide: { setCardVisibleWithUndo(.priority, false) },
            onColorChange: { setKartColor(kart: .priority, color: $0) }
        ) {
            PriorityMenuField(
                label: t(priorityCardLabel, lang: seciliDil),
                value: $siparis.priority,
                options: ["Low", "Normal", "High", "Urgent"],
                editableLabelRaw: canEditOrderDetails ? priorityCardLabel : nil,
                onLabelCommit: canEditOrderDetails ? { renamePriorityCardLabel(to: $0) } : nil
            )

            StatusMenuField(
                label: t(riskCardLabel, lang: seciliDil),
                value: $siparis.risk,
                options: ["None", "Waiting", "Blocked", "Overdue"],
                editableLabelRaw: canEditOrderDetails ? riskCardLabel : nil,
                onLabelCommit: canEditOrderDetails ? { renameRiskCardLabel(to: $0) } : nil
            )

            if siparis.risk != "None" {
                Divider().background(Color.primary.opacity(0.1))

                PickerField(
                    label: t("Reason", lang: seciliDil),
                    value: $siparis.riskReason,
                    options: ["-", "Waiting for customer", "Waiting for payment", "Waiting for material", "Other"]
                )

                if siparis.riskReason == "Other" {
                    NoteSupplierField(
                        label: t("Other Note", lang: seciliDil),
                        value: Binding(
                            get: { siparis.customFields?["riskOtherNote"] ?? "" },
                            set: { newValue in
                                var current = siparis.customFields ?? [:]
                                current["riskOtherNote"] = newValue
                                siparis.customFields = current
                            }
                        )
                    )
                }
            }
        }
    }
    private func materialDefaultCheckBinding(index: Int, title: String) -> Binding<Bool> {
        switch index {
        case 0:
            return $siparis.invBool1
        case 1:
            return $siparis.invBool2
        case 2:
            return $siparis.invBool3
        case 3:
            return $siparis.invBool4
        default:
            return Binding(
                get: { siparis.customToggles?["materialsDefault::\(title)"] ?? false },
                set: { newValue in
                    var current = siparis.customToggles ?? [:]
                    current["materialsDefault::\(title)"] = newValue
                    siparis.customToggles = current
                }
            )
        }
    }

    private func renameMaterialDefaultCheck(at index: Int, to newName: String) {
        var labels = materialsDefaultCheckLabels
        guard labels.indices.contains(index) else { return }
        let cleaned = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return }
        labels[index] = cleaned
        // Mirror the Edit Block Headings sheet: full list in the JSON + the first
        // four mirrored into invLabel1…4 (used by the invoice / PDF export).
        let padded = labels.padding(to: 4, with: "Item")
        invLabel1 = padded[0]; invLabel2 = padded[1]; invLabel3 = padded[2]; invLabel4 = padded[3]
        if let data = try? JSONEncoder().encode(labels.map { CustomStepDTO(title: $0) }),
           let json = String(data: data, encoding: .utf8) {
            materialsDefaultChecksJSON = json
        }
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !companyId.isEmpty else { return }
        Firestore.firestore().collection("companySettings").document(companyId).setData([
            "materialsDefaultChecksJSON": materialsDefaultChecksJSON,
            "invLabel1": invLabel1,
            "invLabel2": invLabel2,
            "invLabel3": invLabel3,
            "invLabel4": invLabel4
        ], merge: true)
    }

    private func materialsKarti(colIndex: Int) -> some View {
        DetayKarti(title: t("Materials & Inventory", lang: seciliDil), iconName: cardHeaderIcon(for: .materials), kartTipi: .materials, yukseklik: bindingYukseklik(for: .materials), sutunGenisligi: getBinding(for: colIndex), draggedKart: $draggedKart, uiTetikleyici: uiTetikleyici, kartRengi: getKartColor(kart: .materials), onHeightChangeEnd: kaydetKartYukseklikleri, onWidthChangeEnd: saveWidths, onHide: { setCardVisibleWithUndo(.materials, false) }, onColorChange: { setKartColor(kart: .materials, color: $0) }, onEditHeadings: { headingEditorTarget = .materials }) {
            ForEach(Array(materialsDefaultCheckLabels.enumerated()), id: \.offset) { index, label in
                YesNoField(
                    label: t(label, lang: seciliDil),
                    value: materialDefaultCheckBinding(index: index, title: label),
                    editableLabelRaw: canEditOrderDetails ? label : nil,
                    onLabelCommit: canEditOrderDetails ? { renameMaterialDefaultCheck(at: index, to: $0) } : nil
                )
            }
            if !materialsTogglesList.isEmpty {
                Divider().background(Color.primary.opacity(0.1))
                ForEach(materialsTogglesList, id: \.id) { toggle in
                    YesNoField(
                        label: t(toggle.title, lang: seciliDil),
                        value: Binding(
                            get: { siparis.customToggles?["materials::\(toggle.title)"] ?? false },
                            set: { newValue in
                                var current = siparis.customToggles ?? [:]
                                current["materials::\(toggle.title)"] = newValue
                                siparis.customToggles = current
                            }
                        )
                    )
                }
            }
            if showMaterialsNotesSupplier {
                Divider().background(Color.primary.opacity(0.1))
                NoteSupplierField(label: t(materialsNotesSupplierLabel, lang: seciliDil), value: $siparis.invNotes)
            }
            if let orderId = siparis.id, !orderId.isEmpty {
                Divider().background(Color.primary.opacity(0.1))
                OrderStockSection(
                    orderId: orderId,
                    currencySymbol: seciliParaBirimi,
                    lang: seciliDil,
                    canEdit: canEditOrderDetails,
                    onUseAsBaseCost: { total in siparis.watchPurchasePrice = total }
                )
                .environmentObject(firebaseManager)
            }
        }
    }
    private func previewKarti(colIndex: Int) -> some View {
        let mevcutYukseklik = max(kartYukseklikleri[KartTipi.preview.rawValue] ?? 250.0, 220.0)
        let resimYuksekligi = max(120.0, mevcutYukseklik - 85.0)

        return DetayKarti(
            title: t("Preview", lang: seciliDil),
            iconName: cardHeaderIcon(for: .preview),
            kartTipi: .preview,
            yukseklik: bindingYukseklik(for: .preview),
            sutunGenisligi: getBinding(for: colIndex),
            draggedKart: $draggedKart,
            uiTetikleyici: uiTetikleyici,
            kartRengi: getKartColor(kart: .preview),
            onHeightChangeEnd: kaydetKartYukseklikleri,
            onWidthChangeEnd: saveWidths,
            onHide: { setCardVisibleWithUndo(.preview, false) },
            onColorChange: { setKartColor(kart: .preview, color: $0) }
        ) {
            ZStack(alignment: .bottomLeading) {
                Rectangle()
                    .fill(Color.clear)
                    .frame(maxWidth: .infinity)
                    .frame(height: resimYuksekligi)
                    .overlay(
                        Group {
                            if siparis.designLink.isEmpty {
                                VStack(spacing: 8) {
                                    Image(systemName: "photo")
                                        .font(.system(size: 24, weight: .semibold))
                                        .foregroundColor(.secondary.opacity(0.7))
                                    Text(t("No preview image provided.", lang: seciliDil))
                                        .font(.system(size: 12, weight: .semibold))
                                        .foregroundColor(.secondary)
                                }
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                                .background(Color.primary.opacity(isHoveringDrop ? 0.15 : 0.05))
                            } else {
                                AsyncImage(url: URL(string: siparis.designLink)) { image in
                                    image
                                        .resizable()
                                        .scaledToFit()
                                } placeholder: {
                                    ProgressView().controlSize(.regular)
                                }
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                            }
                        }
                    )
                    .overlay(alignment: .bottomLeading) {
                        if isLinkEditing {
                            HStack(spacing: 8) {
                                Image(systemName: "link")
                                    .foregroundColor(.gray)
                                    .font(.system(size: 14))
                                TextField(t("Paste photo link...", lang: seciliDil), text: $siparis.designLink)
                                    .textFieldStyle(.plain)
                                    .foregroundColor(.primary)
                                    .font(.system(size: 12))
                                    .onSubmit { commitPreviewLinkEditing() }
                                Button { commitPreviewLinkEditing() } label: {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundColor(.green)
                                        .font(.system(size: 18))
                                }
                                .buttonStyle(.plain)
                                Button {
                                    siparis.designLink = previewLinkBeforeEditing
                                    withAnimation { isLinkEditing = false }
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundColor(.secondary)
                                        .font(.system(size: 18))
                                }
                                .buttonStyle(.plain)
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 8)
                            .background(colorScheme == .dark ? Color.black.opacity(0.85) : Color.white.opacity(0.95))
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .shadow(color: Color.black.opacity(0.10), radius: 8, x: 0, y: 3)
                            .padding(10)
                        }
                    }
                    .cornerRadius(10)
                    .clipped()
                    .onDrop(of: [.fileURL], isTargeted: $isHoveringDrop) { providers in
                        guard let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) }) else { return false }
                        provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { (item, error) in
                            guard let data = item as? Data, let url = URL(dataRepresentation: data, relativeTo: nil) else { return }
                            DispatchQueue.main.async { requestSafeImageUpload(url: url) }
                        }
                        return true
                    }

                if !isLinkEditing {
                    Menu {
                        Button {
                            isImagePickerPresented = true
                        } label: {
                            Label(t(siparis.designLink.isEmpty ? t("Upload Image", lang: seciliDil) : "Replace Image", lang: seciliDil), systemImage: "square.and.arrow.up")
                        }

                        Button {
                            startPreviewLinkEditing()
                        } label: {
                            Label(t(siparis.designLink.isEmpty ? t("Paste photo link...", lang: seciliDil) : "Edit photo link", lang: seciliDil), systemImage: "link")
                        }

                        if let url = URL(string: siparis.designLink), !siparis.designLink.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            Button {
                                openURL(url)
                            } label: {
                                Label(t("Open", lang: seciliDil), systemImage: "arrow.up.right.square")
                            }

                            Divider()

                            Button(role: .destructive) {
                                removePreviewImage()
                            } label: {
                                Label(t("Remove Preview Image", lang: seciliDil), systemImage: "trash")
                            }
                        }
                    } label: {
                        ZStack {
                            Circle()
                                .fill(colorScheme == .dark ? Color.black.opacity(0.34) : Color.white.opacity(0.42))
                                .frame(width: 36, height: 36)
                                .shadow(color: Color.black.opacity(0.08), radius: 5, x: 0, y: 2)
                            if isUploading {
                                ProgressView().controlSize(.small)
                            } else {
                                // Plain three dots (not ellipsis.circle.fill) so the symbol's own
                                // filled circle doesn't sit inside the translucent Circle backdrop
                                // and read as "nested circles" — just a clean round dot button.
                                Image(systemName: "ellipsis")
                                    .font(.system(size: 17, weight: .bold))
                                    .foregroundColor(.primary.opacity(0.6))
                            }
                        }
                        .contentShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .padding(10)
                }
            }
            .fileImporter(isPresented: $isImagePickerPresented, allowedContentTypes: [.image]) { result in
                switch result {
                case .success(let url):
                    requestSafeImageUpload(url: url)
                case .failure(let error):
                    print("Dosya seçim hatası: \(error)")
                }
            }
        }
    }

    private func startPreviewLinkEditing() {
        previewLinkBeforeEditing = siparis.designLink
        withAnimation { isLinkEditing = true }
    }

    private func commitPreviewLinkEditing() {
        let oldLink = previewLinkBeforeEditing.trimmingCharacters(in: .whitespacesAndNewlines)
        let newLink = siparis.designLink.trimmingCharacters(in: .whitespacesAndNewlines)
        withAnimation { isLinkEditing = false }
        guard oldLink != newLink else { return }

        if oldLink.isEmpty && !newLink.isEmpty {
            recordOrderHistoryEvent(title: "Design mockup sent", value: t("Image link added", lang: seciliDil))
        } else {
            recordOrderHistoryChange(
                title: "Preview Image",
                oldValue: oldLink.isEmpty ? "No image" : "Previous image",
                newValue: newLink.isEmpty ? t("Removed", lang: seciliDil) : "Updated image"
            )
        }
        firebaseManager.updateSiparis(siparis)
    }

    private func removePreviewImage() {
        let oldLink = siparis.designLink.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !oldLink.isEmpty else { return }
        previewLinkBeforeEditing = oldLink
        withAnimation {
            siparis.designLink = ""
            isLinkEditing = false
        }
        recordOrderHistoryChange(title: "Preview Image", oldValue: "Image", newValue: t("Removed", lang: seciliDil))
        firebaseManager.updateSiparis(siparis)
    }

    private func requestSafeImageUpload(url: URL) {
        if uploadSafetyRequirePolicyAcceptance && !uploadSafetyPolicyAccepted {
            pendingUploadSafetyURL = url
            pendingUploadSafetySource = "order_preview"
            showUploadSafetyPrompt = true
            return
        }
        goruntuBulutaYukle(url: url)
    }

    private func goruntuBulutaYukle(url: URL) {
        isUploading = true
        firebaseManager.uploadDesignImage(fileURL: url, orderId: siparis.id, source: "order_preview") { downloadURL in
            DispatchQueue.main.async {
                isUploading = false
                if let downloadURL = downloadURL {
                    let oldLink = siparis.designLink.trimmingCharacters(in: .whitespacesAndNewlines)
                    withAnimation { siparis.designLink = downloadURL }
                    if oldLink.isEmpty {
                        recordOrderHistoryEvent(title: "Design mockup sent", value: "Image uploaded")
                    } else {
                        recordOrderHistoryChange(title: "Design Mockup", oldValue: "Previous image", newValue: "Updated image")
                    }
                    firebaseManager.updateSiparis(siparis)
                    // Also mirror the uploaded preview image into Client Files (gated on
                    // canEditClientFiles, so it is silently skipped when unavailable).
                    requestSafeClientFileUpload(url: url)
                } else {
                    uploadSafetyErrorMessage = firebaseManager.lastUploadSafetyMessage.isEmpty ? t("Upload blocked. Please check Upload Safety settings and try again.", lang: seciliDil) : firebaseManager.lastUploadSafetyMessage
                    showUploadSafetyError = true
                }
            }
        }
    }


    private func refreshSharedClientFilesInbox() {
        sharedClientFilesInbox = SharedClientFileInbox.pendingFiles()
    }

    private func importSharedClientFilesIntoCurrentOrder() {
        guard canEditClientFiles else { return }
        refreshSharedClientFilesInbox()
        let pendingFiles = sharedClientFilesInbox
        guard !pendingFiles.isEmpty else { return }

        if uploadSafetyRequirePolicyAcceptance && !uploadSafetyPolicyAccepted {
            uploadSafetyErrorMessage = t("Please accept the Upload Policy before importing shared files.", lang: seciliDil)
            showUploadSafetyError = true
            return
        }

        isImportingSharedClientFiles = true
        clientFileMessage = t("Importing shared files...", lang: seciliDil)
        importSharedClientFile(at: 0, from: pendingFiles, importedCount: 0)
    }

    private func importSharedClientFile(at index: Int, from pendingFiles: [SharedClientFileInbox.PendingFile], importedCount: Int) {
        guard index < pendingFiles.count else {
            isImportingSharedClientFiles = false
            refreshSharedClientFilesInbox()
            if importedCount > 0 {
                recordOrderHistoryEvent(title: t("Shared client files imported", lang: seciliDil), value: "\(importedCount) file(s)")
                firebaseManager.updateSiparis(siparis)
                clientFileMessage = String(format: t("%d shared file(s) added to this order.", lang: seciliDil), importedCount)
            } else {
                clientFileMessage = t("No shared files were imported.", lang: seciliDil)
            }
            return
        }

        let pending = pendingFiles[index]
        guard let fileURL = SharedClientFileInbox.fileURL(for: pending) else {
            SharedClientFileInbox.remove(pending)
            importSharedClientFile(at: index + 1, from: pendingFiles, importedCount: importedCount)
            return
        }

        firebaseManager.uploadClientFile(fileURL: fileURL, orderId: siparis.id, source: "client_file_share_sheet") { item in
            DispatchQueue.main.async {
                if let item {
                    var files = siparis.clientFiles ?? []
                    files.insert(item, at: 0)
                    siparis.clientFiles = files
                    SharedClientFileInbox.remove(pending)
                    importSharedClientFile(at: index + 1, from: pendingFiles, importedCount: importedCount + 1)
                } else {
                    uploadSafetyErrorMessage = firebaseManager.lastUploadSafetyMessage.isEmpty ? t("Upload blocked. Please check Upload Safety settings and try again.", lang: seciliDil) : firebaseManager.lastUploadSafetyMessage
                    showUploadSafetyError = true
                    importSharedClientFile(at: index + 1, from: pendingFiles, importedCount: importedCount)
                }
            }
        }
    }

    private func discardSharedClientFilesInbox() {
        SharedClientFileInbox.clearAll()
        refreshSharedClientFilesInbox()
        clientFileMessage = t("Shared files cleared.", lang: seciliDil)
    }

    private var clientFileItems: [ClientFileItem] {
        sortedClientFiles(siparis.clientFiles ?? [])
    }

    private var canEditClientFiles: Bool {
        let roleCanEdit = canEditOrderDetails
        return canAccessClientFiles && roleCanEdit && authVM.currentPlanEntitlements.clientFilesEnabled
    }

    private func canDeleteClientFile(_ item: ClientFileItem) -> Bool {
        let currentUid = authVM.currentUserId ?? ""
        let deleteAllowed = authVM.isCompanyOwner || (authVM.currentWorkspaceAccess["deleteClientFiles"] != false)
        return deleteAllowed && canAccessClientFiles && (canEditOrderDetails || item.uploadedByUid == currentUid)
    }

    private var allowedClientFileContentTypes: [UTType] {
        var types: [UTType] = [.pdf, .image, .zip]
        if let psd = UTType(filenameExtension: "psd") { types.append(psd) }
        if let psb = UTType(filenameExtension: "psb") { types.append(psb) }
        // Some systems do not advertise PSD/PSB as a specific UTType.
        // Allow generic file selection here, then enforce the real allow-list in FirebaseManager.
        types.append(.data)
        return types
    }

    private func presentClientFilePicker() {
        guard canEditClientFiles else { return }
        #if os(macOS)
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowedContentTypes = allowedClientFileContentTypes
        panel.message = t("Choose a PDF, image, PSD or PSB file for this order.", lang: seciliDil)
        if panel.runModal() == .OK {
            uploadClientFilesSequentially(panel.urls)
        }
        #else
        showClientFileSourceDialog = true
        #endif
    }

    #if os(iOS)
    private func importClientFilePhotoPickerItem(_ item: PhotosPickerItem?) {
        guard canEditClientFiles, let item else { return }

        clientFileMessage = t("Preparing photo...", lang: seciliDil)
        let preferredType = item.supportedContentTypes.first(where: { $0.conforms(to: .image) }) ?? .jpeg
        let fileExtension = preferredType.preferredFilenameExtension ?? "jpg"

        item.loadTransferable(type: Data.self) { result in
            switch result {
            case .success(let data):
                guard let data else {
                    DispatchQueue.main.async {
                        uploadSafetyErrorMessage = t("Could not read selected photo.", lang: seciliDil)
                        showUploadSafetyError = true
                        clientFileMessage = ""
                        selectedClientFilePhotoItem = nil
                    }
                    return
                }

                let url = FileManager.default.temporaryDirectory
                    .appendingPathComponent("studioflow-client-photo-\(UUID().uuidString).\(fileExtension)")

                do {
                    try data.write(to: url, options: .atomic)
                    DispatchQueue.main.async {
                        selectedClientFilePhotoItem = nil
                        requestSafeClientFileUpload(url: url)
                    }
                } catch {
                    DispatchQueue.main.async {
                        uploadSafetyErrorMessage = error.localizedDescription
                        showUploadSafetyError = true
                        clientFileMessage = ""
                        selectedClientFilePhotoItem = nil
                    }
                }

            case .failure(let error):
                DispatchQueue.main.async {
                    uploadSafetyErrorMessage = error.localizedDescription
                    showUploadSafetyError = true
                    clientFileMessage = ""
                    selectedClientFilePhotoItem = nil
                }
            }
        }
    }
    #endif

    private func uploadClientFilesSequentially(_ urls: [URL], index: Int = 0) {
        guard index < urls.count else { return }
        requestSafeClientFileUpload(url: urls[index]) {
            uploadClientFilesSequentially(urls, index: index + 1)
        }
    }

    private func requestSafeClientFileUpload(url: URL, completion: (() -> Void)? = nil) {
        guard canEditClientFiles else { return }
        if uploadSafetyRequirePolicyAcceptance && !uploadSafetyPolicyAccepted {
            pendingUploadSafetyURL = url
            pendingUploadSafetySource = "client_file"
            showUploadSafetyPrompt = true
            return
        }
        clientFileBulutaYukle(url: url, completion: completion)
    }

    private func clientFileBulutaYukle(url: URL, completion: (() -> Void)? = nil) {
        guard canEditClientFiles else { return }
        isUploadingClientFile = true
        clientFileMessage = ""
        firebaseManager.uploadClientFile(fileURL: url, orderId: siparis.id) { item in
            DispatchQueue.main.async {
                defer { completion?() }
                isUploadingClientFile = false
                if let item {
                    var files = siparis.clientFiles ?? []
                    files.insert(item, at: 0)
                    siparis.clientFiles = files
                    let historyEntry = OrderHistoryLogItem(
                        id: UUID(),
                        createdAt: Date(),
                        title: item.isPendingUpload ? t("Client file queued", lang: seciliDil) : "Client file uploaded",
                        oldValue: "-",
                        newValue: cleanHistoryValue(item.fileName)
                    )
                    var logs = siparis.historyLog ?? []
                    logs.insert(historyEntry, at: 0)
                    siparis.historyLog = Array(logs.prefix(120))
                    firebaseManager.appendClientFile(item, historyEntry: historyEntry, to: siparis)
                    clientFileMessage = item.isPendingUpload
                        ? t("Offline. File saved locally and will upload when online.", lang: seciliDil)
                        : t("File uploaded", lang: seciliDil)
                } else {
                    uploadSafetyErrorMessage = firebaseManager.lastUploadSafetyMessage.isEmpty ? t("Upload blocked. Please check Upload Safety settings and try again.", lang: seciliDil) : firebaseManager.lastUploadSafetyMessage
                    showUploadSafetyError = true
                }
            }
        }
    }

    private func deleteClientFile(_ item: ClientFileItem) {
        guard canDeleteClientFile(item) else { return }

        if item.isPendingUpload {
            firebaseManager.cancelPendingClientFileUpload(pendingQueueId: item.pendingQueueId)
            if !item.localFilePath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                try? FileManager.default.removeItem(atPath: item.localFilePath)
            }
            var files = siparis.clientFiles ?? []
            files.removeAll { $0.id == item.id }
            siparis.clientFiles = files
            recordOrderHistoryEvent(title: "Pending client file removed", value: item.fileName)
            firebaseManager.updateSiparis(siparis)
            clientFileMessage = t("Pending upload removed", lang: seciliDil)
            return
        }

        firebaseManager.deleteUploadedFile(downloadURLString: item.downloadURL, source: "client_file_delete") { success in
            DispatchQueue.main.async {
                if success {
                    var files = siparis.clientFiles ?? []
                    files.removeAll { $0.id == item.id }
                    siparis.clientFiles = files
                    recordOrderHistoryEvent(title: "Client file deleted", value: item.fileName)
                    firebaseManager.updateSiparis(siparis)
                    clientFileMessage = t("File deleted", lang: seciliDil)
                } else {
                    uploadSafetyErrorMessage = firebaseManager.lastUploadSafetyMessage.isEmpty ? t("Delete failed", lang: seciliDil) : firebaseManager.lastUploadSafetyMessage
                    showUploadSafetyError = true
                }
            }
        }
    }

    private func makeClientFileAvailableOffline(_ item: ClientFileItem) {
        guard !item.isPendingUpload else {
            clientFileMessage = t("Pending files are already saved locally until upload completes.", lang: seciliDil)
            return
        }

        clientFileMessage = t("Downloading file for offline use...", lang: seciliDil)
        firebaseManager.downloadClientFileForOffline(item) { success, message in
            offlineClientFileRefreshToken = UUID()
            clientFileMessage = t(message, lang: seciliDil)
            if !success {
                uploadSafetyErrorMessage = t(message, lang: seciliDil)
                showUploadSafetyError = true
            }
        }
    }

    private func makeAllClientFilesAvailableOffline() {
        let downloadableFiles = clientFileItems.filter { !$0.isPendingUpload }
        guard !downloadableFiles.isEmpty else {
            clientFileMessage = t("No uploaded client files to download for offline use.", lang: seciliDil)
            return
        }
        downloadClientFilesForOffline(downloadableFiles, index: 0, completed: 0)
    }

    private func downloadClientFilesForOffline(_ files: [ClientFileItem], index: Int, completed: Int) {
        guard index < files.count else {
            offlineClientFileRefreshToken = UUID()
            clientFileMessage = String(format: t("%d file(s) saved for offline use.", lang: seciliDil), completed)
            return
        }

        let item = files[index]
        clientFileMessage = String(format: t("Downloading %d of %d file(s)...", lang: seciliDil), index + 1, files.count)
        firebaseManager.downloadClientFileForOffline(item) { success, _ in
            offlineClientFileRefreshToken = UUID()
            downloadClientFilesForOffline(files, index: index + 1, completed: completed + (success ? 1 : 0))
        }
    }

    private func openClientFilePreview(_ item: ClientFileItem) {
        clientFilePreviewItem = item
    }

    private func openClientFileExternally(_ item: ClientFileItem) {
        if item.isPendingUpload,
           !item.localFilePath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            openURL(URL(fileURLWithPath: item.localFilePath))
            return
        }
        if let offlineURL = firebaseManager.offlineClientFileURL(for: item),
           FileManager.default.fileExists(atPath: offlineURL.path) {
            openURL(offlineURL)
            return
        }
        let raw = item.downloadURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else {
            uploadSafetyErrorMessage = t("Download failed: file URL is missing.", lang: seciliDil)
            showUploadSafetyError = true
            return
        }
        // Create a short, branded nivadesk.app link (hides company id + token), then
        // open it. Falls back to the path-based masked URL if the call fails.
        Functions.functions(region: "europe-west2").httpsCallable("nvCreateFileLink").call(["url": raw]) { result, _ in
            var target = maskFileUrl(raw)
            if let data = result?.data as? [String: Any], let id = data["id"] as? String, !id.isEmpty {
                let ext = (data["ext"] as? String).flatMap { $0.isEmpty ? nil : ".\($0)" } ?? ""
                target = "https://nivadesk.app/f/\(id)\(ext)"
            }
            DispatchQueue.main.async {
                if let url = URL(string: target) { openURL(url) }
            }
        }
    }

    private func temporaryDownloadCopyURL(from sourceURL: URL, suggestedFileName: String) throws -> URL {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("StudioFlowClientFileDownloads", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let destinationURL = directory.appendingPathComponent(safeClientFileDisplayName(suggestedFileName))
        if FileManager.default.fileExists(atPath: destinationURL.path) {
            try FileManager.default.removeItem(at: destinationURL)
        }
        try FileManager.default.copyItem(at: sourceURL, to: destinationURL)
        return destinationURL
    }

    private func presentClientFileDownload(from sourceURL: URL, suggestedFileName: String) {
        #if os(macOS)
        let panel = NSSavePanel()
        panel.canCreateDirectories = true
        panel.nameFieldStringValue = safeClientFileDisplayName(suggestedFileName)
        let fileExtension = sourceURL.pathExtension.trimmingCharacters(in: .whitespacesAndNewlines)
        if !fileExtension.isEmpty, let type = UTType(filenameExtension: fileExtension) {
            panel.allowedContentTypes = [type]
        }
        if panel.runModal() == .OK, let targetURL = panel.url {
            do {
                if FileManager.default.fileExists(atPath: targetURL.path) {
                    try FileManager.default.removeItem(at: targetURL)
                }
                try FileManager.default.copyItem(at: sourceURL, to: targetURL)
                clientFileMessage = t("File downloaded", lang: seciliDil)
                NSWorkspace.shared.activateFileViewerSelecting([targetURL])
            } catch {
                uploadSafetyErrorMessage = error.localizedDescription
                showUploadSafetyError = true
            }
        }
        #else
        pdfShareItem = ShareableFileURL(url: sourceURL)
        clientFileMessage = t("Use the share sheet to save or send this file.", lang: seciliDil)
        #endif
    }

    private func downloadClientFileToUserLocation(_ item: ClientFileItem) {
        if item.isPendingUpload,
           !item.localFilePath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let localURL = URL(fileURLWithPath: item.localFilePath)
            presentClientFileDownload(from: localURL, suggestedFileName: item.fileName)
            return
        }

        if let offlineURL = firebaseManager.offlineClientFileURL(for: item),
           FileManager.default.fileExists(atPath: offlineURL.path) {
            presentClientFileDownload(from: offlineURL, suggestedFileName: item.fileName)
            return
        }

        guard let remoteURL = URL(string: item.downloadURL) else {
            uploadSafetyErrorMessage = t("Download failed: file URL is missing.", lang: seciliDil)
            showUploadSafetyError = true
            return
        }

        clientFileMessage = t("Preparing download...", lang: seciliDil)
        URLSession.shared.downloadTask(with: remoteURL) { temporaryURL, _, error in
            if let error {
                DispatchQueue.main.async {
                    uploadSafetyErrorMessage = error.localizedDescription
                    showUploadSafetyError = true
                    clientFileMessage = ""
                }
                return
            }

            guard let temporaryURL else {
                DispatchQueue.main.async {
                    uploadSafetyErrorMessage = t("Download failed: temporary file was not created.", lang: seciliDil)
                    showUploadSafetyError = true
                    clientFileMessage = ""
                }
                return
            }

            do {
                let preparedURL = try temporaryDownloadCopyURL(from: temporaryURL, suggestedFileName: item.fileName)
                DispatchQueue.main.async {
                    clientFileMessage = ""
                    presentClientFileDownload(from: preparedURL, suggestedFileName: item.fileName)
                }
            } catch {
                DispatchQueue.main.async {
                    uploadSafetyErrorMessage = error.localizedDescription
                    showUploadSafetyError = true
                    clientFileMessage = ""
                }
            }
        }.resume()
    }


    private var canSetClientFileAsPreview: Bool {
        canEditOrderDetails
    }

    private func canUseClientFileAsPreview(_ item: ClientFileItem) -> Bool {
        let link = item.downloadURL.trimmingCharacters(in: .whitespacesAndNewlines)
        return canSetClientFileAsPreview && clientFileIsImage(item) && !item.isPendingUpload && !link.isEmpty
    }

    private func useClientFileAsPreview(_ item: ClientFileItem) {
        guard canUseClientFileAsPreview(item) else { return }
        let newLink = item.downloadURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let oldLink = siparis.designLink.trimmingCharacters(in: .whitespacesAndNewlines)
        guard oldLink != newLink else { return }

        withAnimation {
            siparis.designLink = newLink
        }
        setCardVisibleWithUndo(.preview, true)
        recordOrderHistoryChange(
            title: "Preview Image",
            oldValue: oldLink.isEmpty ? "-" : "Previous image",
            newValue: safeClientFileDisplayName(item.fileName)
        )
        firebaseManager.updateSiparis(siparis)
    }

    private func clientFileIcon(for item: ClientFileItem) -> String {
        if item.isPendingUpload {
            return "clock.arrow.circlepath"
        }
        let lowerName = item.fileName.lowercased()
        if item.contentType.lowercased().contains("pdf") || lowerName.hasSuffix(".pdf") {
            return "doc.richtext.fill"
        }
        if lowerName.hasSuffix(".psd") || lowerName.hasSuffix(".psb") {
            return "doc.fill"
        }
        return "photo.fill"
    }

    private func clientFileTint(for item: ClientFileItem) -> Color {
        if item.isPendingUpload {
            return studioWarningOrange
        }
        let lowerName = item.fileName.lowercased()
        if item.contentType.lowercased().contains("pdf") || lowerName.hasSuffix(".pdf") {
            return .red
        }
        if lowerName.hasSuffix(".psd") || lowerName.hasSuffix(".psb") {
            return .purple
        }
        return .blue
    }

    private func formatClientFileSize(_ bytes: Int64) -> String {
        let value = Double(max(bytes, 0))
        if value >= 1024.0 * 1024.0 {
            return String(format: "%.1f MB", value / (1024.0 * 1024.0))
        }
        if value >= 1024.0 {
            return String(format: "%.0f KB", value / 1024.0)
        }
        return "\(Int(value)) B"
    }



    private func clientFilesPlanLockedNotice() -> some View {
        Button {
            openPlanAccessFromLockedFeature()
        } label: {
            HStack(spacing: 7) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 9, weight: .bold))

                Text(t("Client Files available on Pro", lang: seciliDil))
                    .font(.system(size: 11, weight: .semibold))
                    .lineLimit(1)

                Spacer(minLength: 6)

                Text(t("Plan & Access", lang: seciliDil))
                    .font(.system(size: 10, weight: .semibold))

                Image(systemName: "chevron.right")
                    .font(.system(size: 8, weight: .bold))
            }
            .foregroundColor(.secondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(Color.primary.opacity(colorScheme == .dark ? 0.05 : 0.035))
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(t("Client Files available on Pro", lang: seciliDil))
    }

    private func clientFileDateText(_ date: Date) -> String {
        date.formatted(date: .abbreviated, time: .shortened)
    }

    private func clientFilesKarti(colIndex: Int) -> some View {
        let clientFilesHeightBinding = bindingYukseklik(for: .clientFiles)
        let visibleRowsHeight = clientFilesRowsHeight(for: clientFilesHeightBinding.wrappedValue, fileCount: clientFileItems.count)
        let canShowAllClientFilesWithoutScroll = clientFileItems.count <= clientFilesVisibleRowLimit

        return DetayKarti(
            title: t("Client Files", lang: seciliDil),
            iconName: cardHeaderIcon(for: .clientFiles),
            kartTipi: .clientFiles,
            yukseklik: clientFilesHeightBinding,
            sutunGenisligi: getBinding(for: colIndex),
            draggedKart: $draggedKart,
            uiTetikleyici: uiTetikleyici,
            kartRengi: getKartColor(kart: .clientFiles),
            minimumHeightOverride: clientFilesPreferredCardHeight,
            autoAdjustHeightOnContentChange: false,
            onHeightChangeEnd: kaydetKartYukseklikleri,
            onWidthChangeEnd: saveWidths,
            onHide: { setCardVisibleWithUndo(.clientFiles, false) },
            onColorChange: { setKartColor(kart: .clientFiles, color: $0) }
        ) {
            VStack(alignment: .leading, spacing: 12) {
                if !authVM.currentPlanEntitlements.clientFilesEnabled {
                    clientFilesPlanLockedNotice()
                }

                clientFilesTopBar

                if !sharedClientFilesInbox.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(alignment: .center, spacing: 10) {
                            Image(systemName: "square.and.arrow.down.on.square.fill")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(.blue)
                                .frame(width: 30, height: 30)
                                .background(Color.blue.opacity(0.12))
                                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))

                            VStack(alignment: .leading, spacing: 2) {
                                Text(String(format: t("%d shared file(s) waiting", lang: seciliDil), sharedClientFilesInbox.count))
                                    .font(.system(size: 12, weight: .bold))
                                Text(t("Add these shared files to this order, or clear them.", lang: seciliDil))
                                    .font(.system(size: 10))
                                    .foregroundColor(.gray)
                                    .fixedSize(horizontal: false, vertical: true)
                            }

                            Spacer(minLength: 0)
                        }

                        HStack(spacing: 8) {
                            Button {
                                importSharedClientFilesIntoCurrentOrder()
                            } label: {
                                if isImportingSharedClientFiles {
                                    ProgressView().controlSize(.small)
                                } else {
                                    Label(t("Add here", lang: seciliDil), systemImage: "plus.circle.fill")
                                }
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.small)
                            .disabled(!canEditClientFiles || isImportingSharedClientFiles || isUploadingClientFile)

                            Button {
                                discardSharedClientFilesInbox()
                            } label: {
                                Label(t("Clear", lang: seciliDil), systemImage: "trash")
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                            .disabled(isImportingSharedClientFiles)

                            Spacer(minLength: 0)
                        }
                    }
                    .padding(10)
                    .background(Color.blue.opacity(0.08))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(Color.blue.opacity(0.14), lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }

                if !clientFileMessage.isEmpty {
                    Text(clientFileMessage)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.green)
                        .lineLimit(1)
                }

                if clientFileItems.isEmpty {
                    clientFilesEmptyState
                } else if canShowAllClientFilesWithoutScroll {
                    LazyVStack(alignment: .leading, spacing: clientFilesRowSpacing) {
                        ForEach(clientFileItems) { item in
                            clientFileRow(item)
                        }
                    }
                    .padding(.trailing, 4)
                    .frame(height: clientFilesRowsHeightForVisibleCount(clientFileItems.count))
                    .clipped()
                } else {
                    ScrollView(.vertical, showsIndicators: true) {
                        LazyVStack(alignment: .leading, spacing: clientFilesRowSpacing) {
                            ForEach(clientFileItems) { item in
                                clientFileRow(item)
                            }
                        }
                        .padding(.trailing, 4)
                    }
                    .frame(height: visibleRowsHeight)
                    .clipped()
                }

                orderLibraryFilesStrip

                Text(t("Allowed: PDF, JPG, PNG, HEIC, HEIF, WEBP, PSD and PSB. The size limit follows Settings > Safety & Uploads.", lang: seciliDil))
                    .font(.system(size: 10))
                    .foregroundColor(.gray)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .onAppear { loadOrderLibraryFilesIfNeeded() }
        }
        .onDrop(of: [.fileURL], isTargeted: $isClientFileDropTargeted) { providers in
            let fileProviders = providers.filter { $0.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) }
            guard canEditClientFiles, !fileProviders.isEmpty else { return false }
            let group = DispatchGroup()
            let lock = NSLock()
            var urls: [URL] = []

            fileProviders.forEach { provider in
                group.enter()
                provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, error in
                    defer { group.leave() }
                    if let url = item as? URL {
                        lock.lock()
                        urls.append(url)
                        lock.unlock()
                        return
                    }
                    guard let data = item as? Data,
                          let url = URL(dataRepresentation: data, relativeTo: nil) else { return }
                    lock.lock()
                    urls.append(url)
                    lock.unlock()
                }
            }
            group.notify(queue: .main) {
                uploadClientFilesSequentially(urls)
            }
            return true
        }
        .fileImporter(isPresented: $isClientFileImporterPresented, allowedContentTypes: allowedClientFileContentTypes, allowsMultipleSelection: true) { result in
            switch result {
            case .success(let urls):
                uploadClientFilesSequentially(urls)
            case .failure(let error):
                uploadSafetyErrorMessage = error.localizedDescription
                showUploadSafetyError = true
            }
        }
        #if os(iOS)
        .confirmationDialog(t("Upload File", lang: seciliDil), isPresented: $showClientFileSourceDialog, titleVisibility: .visible) {
            Button(t("Photo Library", lang: seciliDil)) {
                isClientFilePhotoPickerPresented = true
            }
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                Button(t("Camera", lang: seciliDil)) {
                    isClientFileCameraPresented = true
                }
            }
            Button(t("Files", lang: seciliDil)) {
                isClientFileImporterPresented = true
            }
            Button(t("Cancel", lang: seciliDil), role: .cancel) { }
        } message: {
            Text(t("Choose where to add the client file from.", lang: seciliDil))
        }
        .photosPicker(isPresented: $isClientFilePhotoPickerPresented, selection: $selectedClientFilePhotoItem, matching: .images)
        .onChange(of: selectedClientFilePhotoItem) { _, newItem in
            importClientFilePhotoPickerItem(newItem)
        }
        .sheet(isPresented: $isClientFileCameraPresented) {
            ClientFileCameraPicker { url in
                requestSafeClientFileUpload(url: url)
            } onError: { message in
                uploadSafetyErrorMessage = t(message, lang: seciliDil)
                showUploadSafetyError = true
            }
        }
        #endif
    }

    // Read-only window onto the central Files library: files whose links point
    // at this order. Management lives on the Files screen — nothing here ever
    // touches the order document's save path.
    @ViewBuilder
    private var orderLibraryFilesStrip: some View {
        if let libraryLinked = orderLibraryFiles, !libraryLinked.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text(t("From the Files library", lang: seciliDil))
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)
                ForEach(libraryLinked) { file in
                    Button { openOrderLibraryFile(file) } label: {
                        HStack(spacing: 8) {
                            Text(orderLibraryFileName(file))
                                .font(.system(size: 12, weight: .semibold))
                                .lineLimit(1).truncationMode(.middle)
                            if let badge = orderLibraryAudienceBadge(file) {
                                Text(badge)
                                    .font(.system(size: 9, weight: .bold))
                                    .padding(.horizontal, 6).padding(.vertical, 2)
                                    .background(Capsule().fill(Color.blue.opacity(0.14)))
                                    .foregroundColor(.blue)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "arrow.up.right.square")
                                .font(.system(size: 11)).foregroundColor(.secondary)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func orderLibraryLink(_ file: LibraryFile) -> LibraryFileLink? {
        file.links.first { $0.kind == "order" && $0.id == siparis.id }
    }

    private func orderLibraryFileName(_ file: LibraryFile) -> String {
        if let link = orderLibraryLink(file), !link.displayName.isEmpty { return link.displayName }
        return file.displayName.isEmpty ? file.fileName : file.displayName
    }

    private func orderLibraryAudienceBadge(_ file: LibraryFile) -> String? {
        switch orderLibraryLink(file)?.audience {
        case "portal": return t("Client portal", lang: seciliDil)
        case "internal": return t("Internal only", lang: seciliDil)
        default: return nil
        }
    }

    private func loadOrderLibraryFilesIfNeeded() {
        guard orderLibraryFiles == nil, let orderId = siparis.id, !orderId.isEmpty else { return }
        Task {
            do { orderLibraryFiles = try await firebaseManager.loadLibraryFiles(linkKey: "order:\(orderId)") }
            catch { orderLibraryFiles = [] }
        }
    }

    private func openOrderLibraryFile(_ file: LibraryFile) {
        guard !file.storagePath.isEmpty else { return }
        Task {
            do {
                let url = try await firebaseManager.libraryFileURL(file.storagePath)
                #if os(macOS)
                NSWorkspace.shared.open(url)
                #else
                await UIApplication.shared.open(url)
                #endif
            } catch { }
        }
    }

    private var clientFilesIntroText: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(t("PDF, image, PSD and PSB files for this order.", lang: seciliDil))
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            Text(t("Visible to workspace members who can open this order.", lang: seciliDil))
                .font(.system(size: 11))
                .foregroundColor(.gray)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var clientFilesTopBar: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: 12) {
                clientFilesIntroText
                    .frame(minWidth: 220, maxWidth: .infinity, alignment: .leading)
                    .layoutPriority(1)

                clientFilesActionButtons
                    .fixedSize(horizontal: true, vertical: false)
            }

            VStack(alignment: .leading, spacing: 10) {
                clientFilesIntroText
                    .frame(maxWidth: 300, alignment: .leading)
                clientFilesActionButtons
            }
        }
    }

    private var clientFilesActionButtons: some View {
        HStack(spacing: 8) {
            if canEditClientFiles {
                Button {
                    presentClientFilePicker()
                } label: {
                    if isUploadingClientFile {
                        ProgressView().controlSize(.small)
                    } else {
                        Label(t("Upload File", lang: seciliDil), systemImage: "square.and.arrow.up")
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .disabled(isUploadingClientFile)
            }

            if !clientFileItems.filter({ !$0.isPendingUpload }).isEmpty {
                Button {
                    makeAllClientFilesAvailableOffline()
                } label: {
                    Label(t("Make Offline", lang: seciliDil), systemImage: "arrow.down.circle")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(isUploadingClientFile)
            }
        }
        .lineLimit(1)
    }

    private var clientFilesEmptyState: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: "tray")
                .font(.system(size: 24, weight: .semibold))
                .foregroundColor(.secondary)
            Text(t("No client files yet.", lang: seciliDil))
                .font(.system(size: 12, weight: .bold))
            Text(t("Upload PDFs, images, PSD or PSB files that belong to this client order.", lang: seciliDil))
                .font(.system(size: 11))
                .foregroundColor(.gray)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color.primary.opacity(isClientFileDropTargeted ? 0.09 : 0.035))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func clientFileThumbnailURL(for item: ClientFileItem) -> URL? {
        if item.isPendingUpload,
           !item.localFilePath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return URL(fileURLWithPath: item.localFilePath)
        }

        if let offlineURL = firebaseManager.offlineClientFileURL(for: item),
           FileManager.default.fileExists(atPath: offlineURL.path) {
            return offlineURL
        }

        return URL(string: item.downloadURL)
    }

    @ViewBuilder
    private func clientFileThumbnail(for item: ClientFileItem) -> some View {
        let tint = clientFileTint(for: item)

        if clientFileIsImage(item), let url = clientFileThumbnailURL(for: item) {
            if url.isFileURL, let image = loadClientFilePlatformImage(from: url) {
                Image(platformImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 32, height: 32)
                    .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
            } else {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    default:
                        Image(systemName: clientFileIcon(for: item))
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(tint)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .background(tint.opacity(0.12))
                    }
                }
                .frame(width: 32, height: 32)
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
            }
        } else {
            Image(systemName: clientFileIcon(for: item))
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(tint)
                .frame(width: 32, height: 32)
                .background(tint.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
        }
    }

    private func clientFileRow(_ item: ClientFileItem) -> some View {
        let isAvailableOffline = firebaseManager.isClientFileAvailableOffline(item)

        return HStack(alignment: .center, spacing: 10) {
            clientFileThumbnail(for: item)

            VStack(alignment: .leading, spacing: 3) {
                Text(item.fileName)
                    .font(.system(size: 12, weight: .bold))
                    .lineLimit(1)
                    .truncationMode(.middle)

                Text(item.isPendingUpload
                     ? "\(t("Waiting to upload", lang: seciliDil)) • \(formatClientFileSize(item.fileSize))"
                     : "\(formatClientFileSize(item.fileSize)) • \(clientFileDateText(item.uploadedAt))\(isAvailableOffline ? " • \(t("Available offline", lang: seciliDil))" : "")")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(item.isPendingUpload ? studioWarningOrange : (isAvailableOffline ? .green : .secondary))
                    .lineLimit(1)

                if item.isPendingUpload {
                    Text(t("This file is saved on this device and will upload automatically when online.", lang: seciliDil))
                        .font(.system(size: 10))
                        .foregroundColor(.gray)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if !item.uploadedByEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text(item.uploadedByEmail)
                        .font(.system(size: 10))
                        .foregroundColor(.gray)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
            }

            Spacer(minLength: 0)

            if !item.isPendingUpload {
                Button {
                    makeClientFileAvailableOffline(item)
                } label: {
                    Image(systemName: isAvailableOffline ? "checkmark.circle.fill" : "arrow.down.circle")
                }
                .buttonStyle(.borderless)
                .foregroundColor(isAvailableOffline ? .green : .blue)
                .help(isAvailableOffline ? t("Available offline", lang: seciliDil) : t("Make Offline", lang: seciliDil))
            }

            Button {
                downloadClientFileToUserLocation(item)
            } label: {
                Image(systemName: "square.and.arrow.down")
            }
            .buttonStyle(.borderless)
            .help(t("Download", lang: seciliDil))

            Button {
                openClientFileExternally(item)
            } label: {
                Image(systemName: item.isPendingUpload ? "doc.badge.clock" : "arrow.up.right.square")
            }
            .buttonStyle(.borderless)
            .help(item.isPendingUpload ? t("Open local file", lang: seciliDil) : t("Open", lang: seciliDil))

            if canDeleteClientFile(item) {
                Button(role: .destructive) {
                    deleteClientFile(item)
                } label: {
                    Image(systemName: "trash")
                }
                .buttonStyle(.borderless)
                .help(t("Delete", lang: seciliDil))
            }
        }
        .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .onTapGesture {
            openClientFilePreview(item)
        }
        .contextMenu {
            if canUseClientFileAsPreview(item) {
                Button {
                    useClientFileAsPreview(item)
                } label: {
                    Label(lt("Use in Preview Card"), systemImage: "photo.on.rectangle.angled")
                }
            } else if clientFileIsImage(item) {
                Label(lt("Upload must finish before this image can be used in Preview."), systemImage: "clock.badge.exclamationmark")
            } else {
                Label(lt("Only image files can be used in Preview."), systemImage: "info.circle")
            }
        }
        .id("\(item.id.uuidString)-\(offlineClientFileRefreshToken.uuidString)")
        .padding(10)
        .frame(minHeight: clientFilesRowHeight)
        .background(Color.primary.opacity(0.035))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.primary.opacity(0.06), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func summaryKarti(colIndex: Int) -> some View { DetayKarti(title: t("Order Summary", lang: seciliDil), iconName: cardHeaderIcon(for: .summary), kartTipi: .summary, yukseklik: bindingYukseklik(for: .summary), sutunGenisligi: getBinding(for: colIndex), draggedKart: $draggedKart, uiTetikleyici: uiTetikleyici, kartRengi: getKartColor(kart: .summary), onHeightChangeEnd: kaydetKartYukseklikleri, onWidthChangeEnd: saveWidths, onHide: { setCardVisibleWithUndo(.summary, false) }, onColorChange: { setKartColor(kart: .summary, color: $0) }, onEditHeadings: { headingEditorTarget = .summary }) { VStack(spacing: 20) { HStack { VStack(alignment: .leading, spacing: 8) { Text(t(hideFinancialForWorkflow ? "Customer" : "Order Value", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray); Text(hideFinancialForWorkflow ? (siparis.customerName.isEmpty ? "-" : siparis.customerName) : privacyCurrency(siparis.salesTotal, symbol: seciliParaBirimi, ondalik: seciliOndalik, hideNumbers: hideSensitiveNumbers)).font(.system(size: 15, weight: .bold)).foregroundColor(hideFinancialForWorkflow ? .primary : .green) }.frame(maxWidth: .infinity, alignment: .leading); VStack(alignment: .leading, spacing: 6) { HStack { Text(resolvedSummaryStep1).font(.system(size: 11)).foregroundColor(.gray).frame(width: 70, alignment: .leading); let val1 = getStepValue(for: resolvedSummaryStep1); Text(t(val1, lang: seciliDil)).font(.system(size: 10, weight: .bold)).foregroundColor(dinamikRenk(icin: val1)).padding(.horizontal, 8).padding(.vertical, 3).background(dinamikRenk(icin: val1).opacity(0.2)).cornerRadius(6) }; HStack { Text(resolvedSummaryStep2).font(.system(size: 11)).foregroundColor(.gray).frame(width: 70, alignment: .leading); let val2 = getStepValue(for: resolvedSummaryStep2); Text(t(val2, lang: seciliDil)).font(.system(size: 10, weight: .bold)).foregroundColor(dinamikRenk(icin: val2)).padding(.horizontal, 8).padding(.vertical, 3).background(dinamikRenk(icin: val2).opacity(0.2)).cornerRadius(6) } }.frame(maxWidth: .infinity, alignment: .leading) }; Divider().background(Color.primary.opacity(0.1)); HStack { VStack(alignment: .leading, spacing: 8) { Text(t("Placed On", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray); HStack(spacing: 4) { Image(systemName: "calendar").foregroundColor(.gray); Text(privacyDate(siparis.paymentDate, hideNumbers: hideSensitiveNumbers)) }.font(.system(size: 13)).foregroundColor(.primary) }.frame(maxWidth: .infinity, alignment: .leading); VStack(alignment: .leading, spacing: 8) { Text(t("Delivery In", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray); HStack(spacing: 4) { Image(systemName: "clock").foregroundColor(kalanGunRengi(siparis: siparis)); Text(privacyDigits(kalanGunMetni(siparis: siparis), hideNumbers: hideSensitiveNumbers)) }.font(.system(size: 13, weight: .bold)).foregroundColor(kalanGunRengi(siparis: siparis)) }.frame(maxWidth: .infinity, alignment: .leading) }; Divider().background(Color.primary.opacity(0.1)); orderTypeRow } } }

    private func deliveryKarti(colIndex: Int) -> some View {
        let dueDate = deliveryDueDate(for: siparis)
        let statusColor = kalanGunRengi(siparis: siparis)
        let timelineColumns = [GridItem(.adaptive(minimum: 135), spacing: 10)]

        return DetayKarti(
            title: t("Timeline & Delivery", lang: seciliDil),
            iconName: cardHeaderIcon(for: .delivery),
            kartTipi: .delivery,
            yukseklik: bindingYukseklik(for: .delivery),
            sutunGenisligi: getBinding(for: colIndex),
            draggedKart: $draggedKart,
            uiTetikleyici: uiTetikleyici,
            kartRengi: getKartColor(kart: .delivery),
            onHeightChangeEnd: kaydetKartYukseklikleri,
            onWidthChangeEnd: saveWidths,
            onHide: { setCardVisibleWithUndo(.delivery, false) },
            onColorChange: { setKartColor(kart: .delivery, color: $0) }
        ) {
            VStack(alignment: .leading, spacing: 14) {
                LazyVGrid(columns: timelineColumns, alignment: .leading, spacing: 10) {
                    deliveryTimelineBox(
                        title: t("Created Date", lang: seciliDil),
                        value: privacyDate(siparis.paymentDate, hideNumbers: hideSensitiveNumbers),
                        iconName: "calendar",
                        color: .blue
                    )

                    deliveryTimelineBox(
                        title: t("Delivery Due", lang: seciliDil),
                        value: privacyDate(dueDate, hideNumbers: hideSensitiveNumbers),
                        iconName: "flag.checkered",
                        color: statusColor
                    )
                }

                HStack(spacing: 10) {
                    Image(systemName: "clock.fill")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(statusColor)

                    VStack(alignment: .leading, spacing: 3) {
                        Text(t("Time Remaining", lang: seciliDil))
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.secondary)

                        Text(privacyDigits(kalanGunMetni(siparis: siparis), hideNumbers: hideSensitiveNumbers))
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(statusColor)
                    }

                    Spacer(minLength: 0)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(statusColor.opacity(0.10))
                .cornerRadius(12)

                calendarIntegrationControls(statusColor: statusColor)

                Divider().background(Color.primary.opacity(0.08))

                StepperField(
                    label: t("Delivery Time", lang: seciliDil),
                    value: $siparis.deliveryTime,
                    lblGun: t("days", lang: seciliDil),
                    color: statusColor
                )

                DatePickerField(
                    label: t("Created Date", lang: seciliDil),
                    date: $siparis.paymentDate
                )
            }
        }
    }

    private func deliveryDueDate(for order: Siparis) -> Date {
        Calendar.current.date(byAdding: .day, value: order.deliveryTime, to: order.paymentDate) ?? order.paymentDate
    }

    private let appleCalendarEventIdCustomKey = "__appleCalendarEventIdV1"

    private var appleCalendarEventId: String? {
        let value = siparis.customFields?[appleCalendarEventIdCustomKey]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return value.isEmpty ? nil : value
    }

    private func setAppleCalendarEventId(_ eventId: String?) {
        var current = siparis.customFields ?? [:]
        if let eventId, !eventId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            current[appleCalendarEventIdCustomKey] = eventId
        } else {
            current.removeValue(forKey: appleCalendarEventIdCustomKey)
        }
        current["language"] = seciliDil
        siparis.customFields = current
        firebaseManager.updateSiparis(siparis)
    }

    private func appleCalendarEventTitle() -> String {
        let customer = siparis.customerName.trimmingCharacters(in: .whitespacesAndNewlines)
        let design = siparis.designName.trimmingCharacters(in: .whitespacesAndNewlines)
        var parts: [String] = []
        if !customer.isEmpty { parts.append(customer) }
        if !design.isEmpty { parts.append(design) }
        return parts.isEmpty ? lt("Order") : parts.joined(separator: " - ")
    }

    private func appleCalendarEventNotes() -> String {
        var lines: [String] = []
        let orderId = siparis.id?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let customer = siparis.customerName.trimmingCharacters(in: .whitespacesAndNewlines)
        let design = siparis.designName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !customer.isEmpty { lines.append("Customer: \(customer)") }
        if !design.isEmpty { lines.append("Design: \(design)") }
        if !orderId.isEmpty { lines.append("Order ID: \(orderId)") }
        lines.append("Created: \(privacyDate(siparis.paymentDate, hideNumbers: false))")
        lines.append("Delivery Due: \(privacyDate(deliveryDueDate(for: siparis), hideNumbers: false))")
        return lines.joined(separator: "\n")
    }

    private func saveAppleCalendarEvent() {
        guard authVM.currentPlanEntitlements.calendarRemindersEnabled else {
            calendarMessage = t("Apple Calendar and Reminders are available from NivaDesk Lite.", lang: seciliDil)
            return
        }
        calendarMessage = "Updating Apple Calendar..."
        isUpdatingCalendarEvent = true
        #if canImport(EventKit)
        AppleCalendarManager.shared.saveOrderEvent(
            eventId: appleCalendarEventId,
            title: appleCalendarEventTitle(),
            notes: appleCalendarEventNotes(),
            startDate: siparis.paymentDate,
            dueDate: deliveryDueDate(for: siparis)
        ) { result in
            isUpdatingCalendarEvent = false
            switch result {
            case .success(let eventId):
                setAppleCalendarEventId(eventId)
                calendarMessage = "Calendar event saved."
            case .failure(let error):
                let baseMessage: String
                if let calendarError = error as? StudioFlowCalendarError {
                    baseMessage = calendarError.errorDescription ?? error.localizedDescription
                } else {
                    baseMessage = error.localizedDescription
                }
                calendarMessage = lt("Calendar event could not be saved.") + " " + baseMessage + " " + lt("Please allow Calendar access in system settings and try again.")
            }
        }
        #else
        isUpdatingCalendarEvent = false
        calendarMessage = lt("Apple Calendar is not available on this device.")
        #endif
    }

    private func removeAppleCalendarEvent() {
        guard authVM.currentPlanEntitlements.calendarRemindersEnabled else {
            calendarMessage = t("Apple Calendar and Reminders are available from NivaDesk Lite.", lang: seciliDil)
            return
        }
        guard let eventId = appleCalendarEventId else { return }
        calendarMessage = "Removing Apple Calendar event..."
        isUpdatingCalendarEvent = true
        #if canImport(EventKit)
        AppleCalendarManager.shared.removeOrderEvent(eventId: eventId) { result in
            isUpdatingCalendarEvent = false
            switch result {
            case .success:
                setAppleCalendarEventId(nil)
                calendarMessage = "Calendar event removed."
            case .failure(let error):
                let baseMessage: String
                if let calendarError = error as? StudioFlowCalendarError {
                    baseMessage = calendarError.errorDescription ?? error.localizedDescription
                } else {
                    baseMessage = error.localizedDescription
                }
                calendarMessage = lt("Calendar event could not be removed.") + " " + baseMessage
            }
        }
        #else
        isUpdatingCalendarEvent = false
        calendarMessage = lt("Apple Calendar is not available on this device.")
        #endif
    }

    private func calendarIntegrationControls(statusColor: Color) -> some View {
        let hasCalendarEvent = appleCalendarEventId != nil
        let columns = [GridItem(.adaptive(minimum: 135), spacing: 8)]

        return VStack(alignment: .leading, spacing: 8) {
            if !authVM.currentPlanEntitlements.calendarRemindersEnabled {
                Label(t("Apple Calendar and Reminders are available from NivaDesk Lite.", lang: seciliDil), systemImage: "lock.fill")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(studioWarningOrange)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                LazyVGrid(columns: columns, alignment: .leading, spacing: 8) {
                calendarActionButton(
                    title: hasCalendarEvent ? t("Update Calendar", lang: seciliDil) : t("Add to Calendar", lang: seciliDil),
                    iconName: hasCalendarEvent ? "arrow.triangle.2.circlepath" : "calendar.badge.plus",
                    color: statusColor,
                    isDisabled: isUpdatingCalendarEvent,
                    action: saveAppleCalendarEvent
                )

                if hasCalendarEvent {
                    calendarActionButton(
                        title: t("Remove Calendar", lang: seciliDil),
                        iconName: "calendar.badge.minus",
                        color: .red,
                        isDisabled: isUpdatingCalendarEvent,
                        action: removeAppleCalendarEvent
                    )
                }
                }
            }

            Text(t("Creates an all-day Apple Calendar event from the created date to the delivery due date.", lang: seciliDil))
                .font(.system(size: 10))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if !calendarMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Label(t(calendarMessage, lang: seciliDil), systemImage: "info.circle.fill")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(10)
        .background(Color.primary.opacity(0.035))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func calendarActionButton(title: String, iconName: String, color: Color, isDisabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 7) {
                Image(systemName: iconName)
                    .font(.system(size: 11, weight: .bold))
                Text(title)
                    .font(.system(size: 11, weight: .bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 0)
            }
            .foregroundColor(color)
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(color.opacity(0.10))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .opacity(isDisabled ? 0.55 : 1.0)
    }

    private func deliveryTimelineBox(title: String, value: String, iconName: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: iconName)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(color)
                Text(title)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)
            }

            Text(value)
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.82)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.primary.opacity(0.045))
        .cornerRadius(12)
    }

    // Fixed heading for the Invoice Items card (not user-customizable), like the other cards.
    private var resolvedItemsHeading: String {
        t("Invoice Items", lang: seciliDil)
    }

    // Keep each row's lineTotal = qty × unitPrice, then drive the order total from the items
    // (the user chose "items drive the total"): remaining = total − already paid.
    private func recomputeTotalFromLineItems() {
        guard siparis.hasLineItems else { return }
        var items = siparis.lineItems ?? []
        for i in items.indices {
            items[i].lineTotal = ((items[i].quantity * items[i].unitPrice) * 100).rounded() / 100
        }
        siparis.lineItems = items

        // A row the user has only just added is still blank. Driving the order
        // total from it would wipe the outstanding balance and flip the order to
        // "fully paid" before they have typed a price, so leave the balance alone
        // until at least one row carries a value.
        guard siparis.lineItemsTotal > 0 else { return }

        siparis.remainingAmount = max(0, siparis.lineItemsTotal - siparis.paidAmount)
        // Fees and tax are derived from the order total, so they have to follow the
        // items in the same pass. Without this they keep showing the figures from
        // the previous total until the order is closed and opened again.
        otomatikKesintiHesapla()
    }

    private func addLineItem() {
        var items = siparis.lineItems ?? []
        items.append(LineItem(name: "", quantity: 1, unitPrice: 0, lineTotal: 0))
        siparis.lineItems = items
    }

    private func removeLineItem(at index: Int) {
        var items = siparis.lineItems ?? []
        guard items.indices.contains(index) else { return }
        items.remove(at: index)
        siparis.lineItems = items.isEmpty ? nil : items
        recomputeTotalFromLineItems()
    }

    @ViewBuilder
    private var lineItemsEditor: some View {
        let items = siparis.lineItems ?? []
        VStack(alignment: .leading, spacing: 8) {
            if !items.isEmpty {
                HStack {
                    Text(t("Total", lang: seciliDil))
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                    Spacer()
                    Text(privacyCurrency(siparis.lineItemsTotal, symbol: seciliParaBirimi, ondalik: seciliOndalik, hideNumbers: hideSensitiveNumbers))
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.green)
                }
            }

            ForEach(Array(items.enumerated()), id: \.element.id) { index, _ in
                LineItemRow(
                    item: Binding<LineItem>(
                        get: {
                            let arr = siparis.lineItems ?? []
                            return arr.indices.contains(index) ? arr[index] : LineItem()
                        },
                        set: { newValue in
                            var arr = siparis.lineItems ?? []
                            guard arr.indices.contains(index) else { return }
                            arr[index] = newValue
                            siparis.lineItems = arr
                        }
                    ),
                    currencySymbol: seciliParaBirimi,
                    nameLabel: t("Item", lang: seciliDil),
                    qtyLabel: t("Qty", lang: seciliDil),
                    onChange: { recomputeTotalFromLineItems() },
                    onDelete: { removeLineItem(at: index) }
                )
            }

            Button(action: { addLineItem() }) {
                HStack(spacing: 6) {
                    Image(systemName: "plus.circle.fill")
                    Text(t("Add Item", lang: seciliDil))
                }
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.blue)
            }
            .buttonStyle(.plain)
        }
        .padding(.top, 2)
    }

    // One editable invoice line: name, quantity × unit price, computed line total, delete.
    private struct LineItemRow: View {
        @Binding var item: LineItem
        let currencySymbol: String
        let nameLabel: String
        let qtyLabel: String
        var onChange: () -> Void
        var onDelete: () -> Void

        private var formattedLineTotal: String {
            let total = ((item.quantity * item.unitPrice) * 100).rounded() / 100
            return currencySymbol + String(format: "%.2f", total)
        }

        var body: some View {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    TextField(nameLabel, text: $item.name)
                        .textFieldStyle(.roundedBorder)
                        .onChange(of: item.name) { _, _ in onChange() }
                    Button(action: onDelete) {
                        Image(systemName: "trash")
                            .foregroundColor(.red.opacity(0.8))
                    }
                    .buttonStyle(.plain)
                }
                HStack(spacing: 8) {
                    Text(qtyLabel).font(.system(size: 11)).foregroundColor(.gray)
                    TextField("1", value: $item.quantity, format: .number)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 50)
                        .onChange(of: item.quantity) { _, _ in onChange() }
                    Text("×").foregroundColor(.gray)
                    Text(currencySymbol).font(.system(size: 12)).foregroundColor(.gray)
                    TextField("0", value: $item.unitPrice, format: .number)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 74)
                        .onChange(of: item.unitPrice) { _, _ in onChange() }
                    Spacer()
                    Text(formattedLineTotal)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.green)
                }
            }
            .padding(.vertical, 4)
        }
    }

    private func invoiceItemsKarti(colIndex: Int) -> some View {
        DetayKarti(
            title: resolvedItemsHeading,
            iconName: cardHeaderIcon(for: .invoiceItems),
            kartTipi: .invoiceItems,
            yukseklik: bindingYukseklik(for: .invoiceItems),
            sutunGenisligi: getBinding(for: colIndex),
            draggedKart: $draggedKart,
            uiTetikleyici: uiTetikleyici,
            kartRengi: getKartColor(kart: .invoiceItems),
            onHeightChangeEnd: kaydetKartYukseklikleri,
            onWidthChangeEnd: saveWidths,
            onHide: { setCardVisibleWithUndo(.invoiceItems, false) },
            onColorChange: { setKartColor(kart: .invoiceItems, color: $0) },
            onEditHeadings: { headingEditorTarget = .invoiceItems },
            onExportInvoice: { exportToInvoicePDF() }
        ) {
            VStack(alignment: .leading, spacing: 14) {
                lineItemsEditor
                invoiceFooterEditor
                Button(action: { exportToInvoicePDF() }) {
                    HStack(spacing: 8) {
                        Image(systemName: "doc.text.fill")
                        Text(t("Invoice PDF", lang: seciliDil))
                    }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(Color.blue)
                    .cornerRadius(10)
                }
                .buttonStyle(.plain)
                .padding(.top, 2)
            }
        }
    }

    @ViewBuilder
    private var invoiceFooterEditor: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: { withAnimation { showInvoiceFooterEditor.toggle() } }) {
                HStack(spacing: 8) {
                    Image(systemName: showInvoiceFooterEditor ? "minus.circle.fill" : "plus.circle.fill")
                        .foregroundColor(.blue)
                    Text(t("Invoice Note", lang: seciliDil))
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.secondary)
                    Spacer()
                }
            }
            .buttonStyle(.plain)

            if showInvoiceFooterEditor {
                TextEditor(text: Binding(
                    get: { siparis.invoiceNote ?? "" },
                    set: { siparis.invoiceNote = $0 }
                ))
                .font(.system(size: 12))
                .frame(minHeight: 70)
                .padding(6)
                .background(Color.primary.opacity(0.05))
                .cornerRadius(8)
            }
        }
        .onAppear { if !(siparis.invoiceNote ?? "").isEmpty { showInvoiceFooterEditor = true } }
        // Auto-expand when the note arrives (e.g. synced live from another device) so
        // the user sees it instead of a collapsed "+ Invoice Note" row.
        .onChange(of: siparis.invoiceNote) { _, newValue in
            if !(newValue ?? "").isEmpty { showInvoiceFooterEditor = true }
        }
    }

    private func customerKarti(colIndex: Int) -> some View {
        let matchingMusteri = firebaseManager.musteriler.first(where: { $0.name.lowercased() == siparis.customerName.lowercased() })

        return DetayKarti(
            title: t("Customer & Communication", lang: seciliDil),
            iconName: cardHeaderIcon(for: .customer),
            kartTipi: .customer,
            yukseklik: bindingYukseklik(for: .customer),
            sutunGenisligi: getBinding(for: colIndex),
            draggedKart: $draggedKart,
            uiTetikleyici: uiTetikleyici,
            kartRengi: getKartColor(kart: .customer),
            forceLayoutUnlocked: shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 2,
            guideHighlightActive: shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 2,
            onHeightChangeEnd: kaydetKartYukseklikleri,
            onWidthChangeEnd: saveWidths,
            onHide: { setCardVisibleWithUndo(.customer, false) },
            onColorChange: { setKartColor(kart: .customer, color: $0) },
            onEditHeadings: { headingEditorTarget = .customer }
        ) {
            VStack(alignment: .leading, spacing: 12) {
                CommitDetailField(label: t("Customer Name", lang: seciliDil), value: $siparis.customerName, emptyFallback: "New Project")
                DetailField(label: t(designNameLabel, lang: seciliDil), value: $siparis.designName, editableLabelRaw: canEditOrderDetails ? designNameLabel : nil, onLabelCommit: canEditOrderDetails ? { renameDesignNameLabel(to: $0) } : nil)

                ForEach(customFieldsList, id: \.id) { field in
                    DetailField(
                        label: t(field.title, lang: seciliDil),
                        value: Binding(
                            get: { siparis.customFields?[field.title] ?? "" },
                            set: { newValue in
                                var current = siparis.customFields ?? [:]
                                current[field.title] = newValue
                                siparis.customFields = current
                            }
                        )
                    )
                }

                if communicationShowTelephone || communicationShowEmail || communicationShowAddress || communicationShowChannel || communicationShowCustomerNotes {
                    Divider().background(Color.primary.opacity(0.1))

                    HStack(spacing: 8) {
                        Image(systemName: "bubble.left.and.bubble.right")
                            .foregroundColor(.blue.opacity(0.85))
                        Text(t("Communication", lang: seciliDil))
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.secondary)
                        Spacer()
                    }
                    .padding(.top, 2)
                }

                if communicationShowTelephone {
                    DetailField(label: t("Telephone", lang: seciliDil), value: $siparis.whatsappNumber)
                }

                if communicationShowEmail {
                    DetailField(label: t("Email", lang: seciliDil), value: $siparis.emailAddress)
                }

                if communicationShowAddress {
                    DetailField(label: t("Address", lang: seciliDil), value: communicationAddressBinding)
                }

                if communicationShowChannel {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .center, spacing: isPhoneLayout ? 6 : 10) {
                            Text(t("Channel", lang: seciliDil))
                                .font(.system(size: 13))
                                .foregroundColor(.gray)
                                .frame(width: isPhoneLayout ? 82 : 96, alignment: .leading)

                            HStack(spacing: isPhoneLayout ? 5 : 8) {
                                ForEach(Array(communicationChannelLabels.enumerated()), id: \.offset) { _, channel in
                                    let isSelected = siparis.communication.contains(channel)

                                    Button(action: {
                                        withAnimation(.easeInOut(duration: 0.2)) {
                                            if isSelected {
                                                siparis.communication.removeAll { $0 == channel }
                                            } else {
                                                siparis.communication.append(channel)
                                            }
                                        }
                                    }) {
                                        Text(t(channel, lang: seciliDil))
                                            .font(.system(size: isPhoneLayout ? 10 : 11, weight: .bold))
                                            .foregroundColor(isSelected ? .white : .gray)
                                            .lineLimit(1)
                                            .truncationMode(.tail)
                                            .minimumScaleFactor(0.78)
                                            .allowsTightening(true)
                                            .padding(.horizontal, isPhoneLayout ? 8 : 12)
                                            .padding(.vertical, 6)
                                            .frame(maxWidth: .infinity)
                                            .background(isSelected ? Color.blue : Color.primary.opacity(0.05))
                                            .cornerRadius(15)
                                    }
                                    .buttonStyle(.plain)
                                    .frame(maxWidth: .infinity)
                                    .help(t(channel, lang: seciliDil))
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .trailing)
                        }
                        .padding(.bottom, 2)

                        ForEach(communicationChannelLabels.filter { siparis.communication.contains($0) }, id: \.self) { channel in
                            DetailField(
                                label: t(channel, lang: seciliDil),
                                value: communicationValueBinding(for: channel)
                            )
                            .transition(.opacity.combined(with: .move(edge: .top)))
                        }
                    }
                }

                if communicationShowCustomerNotes {
                    VStack(alignment: .leading, spacing: 8) {
                        notesSectionHeading(t("Customer Notes", lang: seciliDil))

                        if let musteri = matchingMusteri {
                            alignedNotesEditor(
                                text: Binding(
                                    get: { musteri.notes },
                                    set: { newValue in
                                        var updatedCustomer = musteri
                                        updatedCustomer.notes = newValue
                                        firebaseManager.updateMusteri(updatedCustomer)
                                    }
                                ),
                                placeholder: t("Add customer note...", lang: seciliDil),
                                textColor: .primary,
                                placeholderColor: .gray.opacity(0.55),
                                backgroundColor: Color.primary.opacity(0.03),
                                focusTarget: .customerNotes
                            )
                        } else {
                            Text(t("Customer profile not found to show notes.", lang: seciliDil))
                                .font(.system(size: 12))
                                .foregroundColor(.gray)
                                .padding(12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color.primary.opacity(0.03))
                                .cornerRadius(8)
                        }
                    }
                }
            }
        }
    }

    private func communicationKarti(colIndex: Int) -> some View {
        EmptyView()
    }

    private func normalizedChannelName(_ channel: String) -> String {
        channel.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private func communicationCustomFieldKey(for channel: String) -> String {
        "communicationChannel::\(channel.trimmingCharacters(in: .whitespacesAndNewlines))"
    }

    private var communicationAddressBinding: Binding<String> {
        Binding(
            get: { siparis.customFields?["communicationAddress"] ?? siparis.customFields?["Address"] ?? "" },
            set: { newValue in
                var current = siparis.customFields ?? [:]
                current["communicationAddress"] = newValue
                siparis.customFields = current
            }
        )
    }

    private func communicationValueBinding(for channel: String) -> Binding<String> {
        let normalized = normalizedChannelName(channel)

        if normalized == "instagram" || normalized == "instagram username" {
            return $siparis.instagramUsername
        }

        if normalized == "whatsapp" || normalized == "whats app" || normalized == "telephone" || normalized == "phone" {
            return $siparis.whatsappNumber
        }

        if normalized == "email" || normalized == "e-mail" {
            return $siparis.emailAddress
        }

        if normalized == "address" || normalized == "adres" || normalized == "shipping address" {
            return communicationAddressBinding
        }

        let key = communicationCustomFieldKey(for: channel)
        return Binding(
            get: { siparis.customFields?[key] ?? "" },
            set: { newValue in
                var current = siparis.customFields ?? [:]
                current[key] = newValue
                siparis.customFields = current
            }
        )
    }
    private func notesKarti(colIndex: Int) -> some View {
        DetayKarti(
            title: t("Notes", lang: seciliDil),
            iconName: cardHeaderIcon(for: .notes),
            kartTipi: .notes,
            yukseklik: bindingYukseklik(for: .notes),
            sutunGenisligi: getBinding(for: colIndex),
            draggedKart: $draggedKart,
            uiTetikleyici: uiTetikleyici,
            kartRengi: getKartColor(kart: .notes),
            onHeightChangeEnd: kaydetKartYukseklikleri,
            onWidthChangeEnd: saveWidths,
            onHide: { setCardVisibleWithUndo(.notes, false) },
            onColorChange: { setKartColor(kart: .notes, color: $0) },
            onEditHeadings: { headingEditorTarget = .notes },
            onQuickAdd: { addPerOrderNoteSection() },
            quickAddTooltip: t("Add note field to this order only", lang: seciliDil)
        ) {
            VStack(alignment: .leading, spacing: 14) {
                ForEach(specialNoteSections) { section in
                    VStack(alignment: .leading, spacing: 8) {
                        notesSectionHeading(t(section.title, lang: seciliDil))

                        alignedNotesEditor(
                            text: specialNoteBinding(for: section),
                            placeholder: t("Add note here...", lang: seciliDil),
                            textColor: .primary,
                            placeholderColor: .gray,
                            backgroundColor: Color.primary.opacity(0.03),
                            focusTarget: specialNoteFocusTarget(for: section)
                        )
                    }
                }
            }
        }
    }

    private func notesSectionHeading(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 12, weight: .bold))
            .foregroundColor(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func specialNoteFocusTarget(for section: CustomStepDTO) -> NotesTextEditorFocus {
        section.id == primarySpecialNoteID ? .specialNotes : .specialNote(section.id)
    }

    private func specialNoteBinding(for section: CustomStepDTO) -> Binding<String> {
        if section.id == primarySpecialNoteID {
            return $siparis.notes
        }

        let key = specialNoteCustomFieldKey(for: section.id)
        return Binding(
            get: { siparis.customFields?[key] ?? "" },
            set: { newValue in
                var current = siparis.customFields ?? [:]
                current[key] = newValue
                siparis.customFields = current
            }
        )
    }

    private func customerNotesKarti(colIndex: Int) -> some View {
        let matchingMusteri = firebaseManager.musteriler.first(where: { $0.name.lowercased() == siparis.customerName.lowercased() })

        return DetayKarti(
            title: t("Customer Notes", lang: seciliDil),
            iconName: cardHeaderIcon(for: .customerNotes),
            kartTipi: .customerNotes,
            yukseklik: bindingYukseklik(for: .customerNotes),
            sutunGenisligi: getBinding(for: colIndex),
            draggedKart: $draggedKart,
            uiTetikleyici: uiTetikleyici,
            kartRengi: getKartColor(kart: .customerNotes),
            onHeightChangeEnd: kaydetKartYukseklikleri,
            onWidthChangeEnd: saveWidths,
            onHide: { setCardVisibleWithUndo(.customerNotes, false) },
            onColorChange: { setKartColor(kart: .customerNotes, color: $0) }
        ) {
            if let musteri = matchingMusteri {
                alignedNotesEditor(
                    text: Binding(
                        get: { musteri.notes },
                        set: { newValue in
                            var updatedCustomer = musteri
                            updatedCustomer.notes = newValue
                            firebaseManager.updateMusteri(updatedCustomer)
                        }
                    ),
                    placeholder: t("Add customer note...", lang: seciliDil),
                    textColor: .primary,
                    placeholderColor: .gray.opacity(0.55),
                    backgroundColor: Color.primary.opacity(0.03),
                    focusTarget: .customerNotes
                )
            } else {
                Text(t("Customer profile not found to show notes.", lang: seciliDil))
                    .font(.system(size: 12))
                    .foregroundColor(.gray)
                    .padding()
            }
        }
    }

    private func alignedNotesEditor(
        text: Binding<String>,
        placeholder: String,
        textColor: Color,
        placeholderColor: Color,
        backgroundColor: Color,
        focusTarget: NotesTextEditorFocus,
        minHeight: CGFloat = 80
    ) -> some View {
        ZStack(alignment: .topLeading) {
            TextEditor(text: text)
                .font(.system(size: 13))
                .foregroundColor(textColor)
                .frame(minHeight: minHeight, maxHeight: .infinity)
                .padding(8)
                .scrollContentBackground(.hidden)
                .background(backgroundColor)
                .cornerRadius(8)
                .focused($focusedNotesTextEditor, equals: focusTarget)

            if text.wrappedValue.isEmpty && focusedNotesTextEditor != focusTarget {
                Text(placeholder)
                    .foregroundColor(placeholderColor)
                    .font(.system(size: 13))
                    .padding(.top, 16)
                    .padding(.leading, 12)
                    .allowsHitTesting(false)
            }
        }
    }


    private func normalizedCommunicationChannelLabels(from json: String) -> [String] {
        let defaults = ["Instagram", "WhatsApp", "TikTok"]
        let trimmedJSON = json.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedJSON.isEmpty,
              let data = trimmedJSON.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([String].self, from: data) else {
            return defaults
        }

        var labels: [String] = []
        for rawLabel in decoded {
            let value = rawLabel.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !value.isEmpty else { continue }
            if !labels.contains(where: { $0.caseInsensitiveCompare(value) == .orderedSame }) {
                labels.append(value)
            }
        }
        return labels
    }

    private func financialCustomKey(prefix: String, title: String) -> String {
        prefix + title
    }

    private func isAutoFinancialPlaceholder(_ title: String, prefix: String) -> Bool {
        let cleanedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard cleanedTitle.hasPrefix(prefix + " ") else { return false }
        let numberPart = cleanedTitle.dropFirst(prefix.count + 1)
        return !numberPart.isEmpty && numberPart.allSatisfy { $0.isNumber }
    }

    private func isUsableFinancialExpenseTitle(_ title: String) -> Bool {
        let cleanedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        return !cleanedTitle.isEmpty && !isAutoFinancialPlaceholder(cleanedTitle, prefix: "Cost")
    }

    private func isUsableFinancialRemainingTitle(_ title: String) -> Bool {
        let cleanedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        return !cleanedTitle.isEmpty && !isAutoFinancialPlaceholder(cleanedTitle, prefix: "Pending")
    }

    private func customCurrencyValue(prefix: String, title: String) -> Double {
        let key = financialCustomKey(prefix: prefix, title: title)
        let raw = siparis.customFields?[key] ?? ""
        let cleaned = raw
            .replacingOccurrences(of: ",", with: "")
            .replacingOccurrences(of: seciliParaBirimi, with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        return Double(cleaned) ?? 0
    }

    private func customCurrencyBinding(prefix: String, title: String) -> Binding<Double> {
        Binding<Double>(
            get: {
                customCurrencyValue(prefix: prefix, title: title)
            },
            set: { newValue in
                let key = financialCustomKey(prefix: prefix, title: title)
                var current = siparis.customFields ?? [:]
                current[key] = String(newValue)
                siparis.customFields = current
                otomatikKesintiHesapla()
                firebaseManager.updateSiparis(siparis)
            }
        )
    }

    private func customFinancialTotal(prefix: String, items: [CustomStepDTO]) -> Double {
        items.reduce(0) { total, item in
            total + customCurrencyValue(prefix: prefix, title: item.title)
        }
    }

    private var customExpenseTotal: Double {
        customFinancialTotal(prefix: "financialExpense::", items: orderExpenseItems)
    }

    private var customRemainingTotal: Double {
        customFinancialTotal(prefix: "financialRemaining::", items: orderRemainingItems)
    }

    private var outstandingPaymentTotal: Double {
        max(0, siparis.remainingAmount) + max(0, customRemainingTotal)
    }

    private var isFullPaymentReceived: Bool {
        outstandingPaymentTotal <= 0.005
    }

    // MARK: - Payment ledger

    private var paymentEntries: [PaymentEntry] {
        (siparis.payments ?? []).sorted { $0.date > $1.date }
    }

    private var paymentCount: Int { (siparis.payments ?? []).count }

    private var paymentsTotal: Double {
        (siparis.payments ?? []).reduce(0) { $0 + $1.amount }
    }

    // Records a customer payment as a structured ledger entry, then aggregates it
    // into paidAmount and reduces the outstanding balance. paidAmount stays the
    // single source of truth so dashboards/exports are unchanged.
    private func recordPayment(amount: Double, method: String, note: String, markFinal: Bool) {
        let cleanAmount = (amount * 100).rounded() / 100
        guard cleanAmount > 0.005 else { return }

        var updatedOrder = siparis
        let entry = PaymentEntry(
            id: UUID(),
            amount: cleanAmount,
            date: Date(),
            method: method.trimmingCharacters(in: .whitespacesAndNewlines),
            note: note.trimmingCharacters(in: .whitespacesAndNewlines),
            createdByUid: authVM.currentUserId ?? "",
            createdByEmail: authVM.accountEmail
        )
        var ledger = updatedOrder.payments ?? []
        ledger.append(entry)
        if ledger.count > 200 { ledger = Array(ledger.suffix(200)) }
        updatedOrder.payments = ledger

        updatedOrder.paidAmount += cleanAmount
        updatedOrder.remainingAmount = max(0, updatedOrder.remainingAmount - cleanAmount)

        if markFinal {
            updatedOrder.remainingAmount = 0
            var currentFields = updatedOrder.customFields ?? [:]
            for item in orderRemainingItems {
                let key = financialCustomKey(prefix: "financialRemaining::", title: item.title)
                if currentFields[key] != nil { currentFields[key] = "0" }
            }
            updatedOrder.customFields = currentFields
        }

        let ordinal = ledger.count
        let methodSuffix = entry.method.isEmpty ? "" : " · \(entry.method)"
        var logs = updatedOrder.historyLog ?? []
        logs.insert(
            OrderHistoryLogItem(
                id: UUID(),
                createdAt: Date(),
                title: markFinal ? "Full payment received" : "Payment received",
                oldValue: cleanHistoryValue("Payment #\(ordinal)\(methodSuffix)"),
                newValue: cleanHistoryValue(amountHistoryValue(cleanAmount))
            ),
            at: 0
        )
        if logs.count > 120 { logs = Array(logs.prefix(120)) }
        updatedOrder.historyLog = logs

        siparis = updatedOrder
        otomatikKesintiHesapla()
        firebaseManager.updateSiparis(updatedOrder)
    }

    // When the user enters the initial "Paid" amount and there are no ledger
    // entries yet, seed the payment ledger with that amount so it shows up under
    // "Payments" and is written to the history log. paidAmount already holds the
    // entered value, so this only mirrors it into the ledger (no re-aggregation).
    private func seedInitialPaymentFromPaidIfNeeded() {
        guard (siparis.payments ?? []).isEmpty else { return }
        let amount = (siparis.paidAmount * 100).rounded() / 100
        guard amount > 0.005 else { return }

        var updatedOrder = siparis
        let entry = PaymentEntry(
            id: UUID(),
            amount: amount,
            date: Date(),
            method: siparis.paymentMethod.trimmingCharacters(in: .whitespacesAndNewlines),
            note: "",
            createdByUid: authVM.currentUserId ?? "",
            createdByEmail: authVM.accountEmail
        )
        updatedOrder.payments = [entry]

        var logs = updatedOrder.historyLog ?? []
        logs.insert(
            OrderHistoryLogItem(
                id: UUID(),
                createdAt: Date(),
                title: "Payment received",
                oldValue: cleanHistoryValue("Payment #1"),
                newValue: cleanHistoryValue(amountHistoryValue(amount))
            ),
            at: 0
        )
        if logs.count > 120 { logs = Array(logs.prefix(120)) }
        updatedOrder.historyLog = logs

        siparis = updatedOrder
        firebaseManager.updateSiparis(updatedOrder)
    }

    // Logs the initial "Remaining" amount once, the first time it is set to a
    // positive value. A marker in customFields prevents repeat log lines on
    // later edits. Remaining is not a payment, so this only touches the log.
    private func seedInitialRemainingLogIfNeeded() {
        let marker = "initialRemainingLogged"
        guard (siparis.customFields?[marker] ?? "") != "1" else { return }
        let amount = (siparis.remainingAmount * 100).rounded() / 100
        guard amount > 0.005 else { return }

        var updatedOrder = siparis
        var fields = updatedOrder.customFields ?? [:]
        fields[marker] = "1"
        updatedOrder.customFields = fields

        var logs = updatedOrder.historyLog ?? []
        logs.insert(
            OrderHistoryLogItem(
                id: UUID(),
                createdAt: Date(),
                title: "Remaining set",
                oldValue: "-",
                newValue: cleanHistoryValue(amountHistoryValue(amount))
            ),
            at: 0
        )
        if logs.count > 120 { logs = Array(logs.prefix(120)) }
        updatedOrder.historyLog = logs

        siparis = updatedOrder
        firebaseManager.updateSiparis(updatedOrder)
    }

    private func deletePayment(_ entry: PaymentEntry) {
        var updatedOrder = siparis
        var ledger = updatedOrder.payments ?? []
        guard let idx = ledger.firstIndex(where: { $0.id == entry.id }) else { return }
        ledger.remove(at: idx)
        updatedOrder.payments = ledger
        // Return the removed amount to the outstanding balance (paidAmount stays the truth).
        updatedOrder.paidAmount = max(0, updatedOrder.paidAmount - entry.amount)
        updatedOrder.remainingAmount += entry.amount

        var logs = updatedOrder.historyLog ?? []
        logs.insert(
            OrderHistoryLogItem(
                id: UUID(),
                createdAt: Date(),
                title: "Payment removed",
                oldValue: cleanHistoryValue(amountHistoryValue(entry.amount)),
                newValue: "-"
            ),
            at: 0
        )
        if logs.count > 120 { logs = Array(logs.prefix(120)) }
        updatedOrder.historyLog = logs

        siparis = updatedOrder
        otomatikKesintiHesapla()
        firebaseManager.updateSiparis(updatedOrder)
    }

    private func markFullPaymentReceived() {
        let outstandingTotal = outstandingPaymentTotal
        guard outstandingTotal > 0.005 else { return }
        // Record the remaining balance as a final ledger entry so the payment
        // count/history survives the aggregation into paidAmount.
        recordPayment(amount: outstandingTotal, method: "Final", note: "", markFinal: true)
    }

    @ViewBuilder
    private var paymentLedgerSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(t("Payments", lang: seciliDil))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.gray)
                if paymentCount > 0 {
                    Text("\(paymentCount)")
                        .font(.system(size: 11, weight: .bold))
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(Color.green.opacity(0.18))
                        .foregroundColor(.green)
                        .clipShape(Capsule())
                }
                Spacer()
                Button {
                    newPaymentAmount = ""
                    newPaymentMethod = "Deposit"
                    newPaymentNote = ""
                    showAddPaymentSheet = true
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus.circle.fill")
                        Text(t("Add Payment", lang: seciliDil))
                    }
                    .font(.system(size: 12, weight: .semibold))
                }
                .buttonStyle(.plain)
                .foregroundColor(.green)
            }

            if !paymentEntries.isEmpty {
                VStack(spacing: 6) {
                    ForEach(paymentEntries) { entry in
                        HStack(spacing: 8) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 12))
                                .foregroundColor(.green)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(privacyCurrency(entry.amount, symbol: seciliParaBirimi, ondalik: seciliOndalik, hideNumbers: hideSensitiveNumbers))
                                    .font(.system(size: 13, weight: .bold))
                                HStack(spacing: 5) {
                                    Text(privacyDate(entry.date, hideNumbers: hideSensitiveNumbers))
                                        .font(.system(size: 10))
                                        .foregroundColor(.gray)
                                    if !entry.method.isEmpty {
                                        Text("· \(t(entry.method, lang: seciliDil))")
                                            .font(.system(size: 10))
                                            .foregroundColor(.gray)
                                    }
                                }
                                if !entry.note.isEmpty {
                                    Text(entry.note)
                                        .font(.system(size: 10))
                                        .foregroundColor(.gray)
                                }
                            }
                            Spacer()
                            Button {
                                editingPaymentNoteText = entry.note
                                editingPaymentEntry = entry
                            } label: {
                                Image(systemName: "square.and.pencil").font(.system(size: 11))
                            }
                            .buttonStyle(.plain)
                            .foregroundColor(.blue.opacity(0.75))
                            Button { deletePayment(entry) } label: {
                                Image(systemName: "trash").font(.system(size: 11))
                            }
                            .buttonStyle(.plain)
                            .foregroundColor(.red.opacity(0.7))
                        }
                        .padding(8)
                        .background(Color.green.opacity(0.06))
                        .cornerRadius(8)
                    }
                }
            }
        }
        .sheet(isPresented: $showAddPaymentSheet) { addPaymentSheet }
        .sheet(item: $editingPaymentEntry) { entry in editPaymentNoteSheet(entry) }
    }

    // Edit the free-text note on any ledger entry — including payments recorded
    // automatically by the WooCommerce/Shopify webhooks, which previously had
    // no way to be annotated after the fact.
    @ViewBuilder
    private func editPaymentNoteSheet(_ entry: PaymentEntry) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(t("Payment Note", lang: seciliDil))
                .font(.system(size: 18, weight: .bold))

            HStack(spacing: 6) {
                Text(privacyCurrency(entry.amount, symbol: seciliParaBirimi, ondalik: seciliOndalik, hideNumbers: hideSensitiveNumbers))
                    .font(.system(size: 13, weight: .bold))
                Text(privacyDate(entry.date, hideNumbers: hideSensitiveNumbers))
                    .font(.system(size: 11))
                    .foregroundColor(.gray)
                if !entry.method.isEmpty {
                    Text("· \(t(entry.method, lang: seciliDil))")
                        .font(.system(size: 11))
                        .foregroundColor(.gray)
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(t("Note", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray)
                TextField(t("Optional", lang: seciliDil), text: $editingPaymentNoteText)
                    .textFieldStyle(.roundedBorder)
            }

            HStack {
                Button(t("Cancel", lang: seciliDil)) { editingPaymentEntry = nil }
                Spacer()
                Button(t("Save", lang: seciliDil)) {
                    updatePaymentNote(entry, note: editingPaymentNoteText)
                    editingPaymentEntry = nil
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(24)
        .frame(minWidth: 340)
    }

    private func updatePaymentNote(_ entry: PaymentEntry, note: String) {
        var updatedOrder = siparis
        var ledger = updatedOrder.payments ?? []
        guard let idx = ledger.firstIndex(where: { $0.id == entry.id }) else { return }
        let cleanNote = note.trimmingCharacters(in: .whitespacesAndNewlines)
        guard ledger[idx].note != cleanNote else { return }
        ledger[idx].note = cleanNote
        updatedOrder.payments = ledger
        siparis = updatedOrder
        firebaseManager.updateSiparis(updatedOrder)
    }

    @ViewBuilder
    private var addPaymentSheet: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(t("Add Payment", lang: seciliDil))
                .font(.system(size: 18, weight: .bold))

            VStack(alignment: .leading, spacing: 6) {
                Text(t("Amount", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray)
                TextField("0", text: $newPaymentAmount)
                    .textFieldStyle(.roundedBorder)
                    #if os(iOS)
                    .keyboardType(.decimalPad)
                    #endif
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(t("Payment Method", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray)
                Picker("", selection: $newPaymentMethod) {
                    ForEach(["Deposit", "Card", "Apple Pay", "PayPal", "Direct Transfer", "Cash", "Final"], id: \.self) { option in
                        Text(t(option, lang: seciliDil)).tag(option)
                    }
                }
                .labelsHidden()
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(t("Note", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray)
                TextField(t("Optional", lang: seciliDil), text: $newPaymentNote)
                    .textFieldStyle(.roundedBorder)
            }

            HStack {
                Button(t("Cancel", lang: seciliDil)) { showAddPaymentSheet = false }
                Spacer()
                Button(t("Add", lang: seciliDil)) {
                    let normalized = newPaymentAmount
                        .replacingOccurrences(of: ",", with: ".")
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    if let amt = Double(normalized), amt > 0 {
                        recordPayment(amount: amt, method: newPaymentMethod, note: newPaymentNote, markFinal: false)
                    }
                    showAddPaymentSheet = false
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(24)
        .frame(minWidth: 340)
    }

    private var baseCostTotal: Double {
        financialShowBaseCost ? siparis.watchPurchasePrice : 0
    }

    private var financialFinalProfit: Double {
        let salesTotal = siparis.salesTotal
        return salesTotal - baseCostTotal - customExpenseTotal - siparis.deliveryCost - siparis.paymentFee - siparis.taxAmount
    }

    // Estimated Corporation Tax on the profit that remains after VAT and all costs.
    // Rounded to 2 dp at calculation time so every platform shows the same pennies
    // and the displayed rows subtract cleanly.
    private var corporationTaxAmount: Double {
        guard corporationTaxEnabled else { return 0 }
        return (max(0, financialFinalProfit) * corporationTaxRate).rounded() / 100.0
    }

    private var netProfitAfterCorporationTax: Double {
        financialFinalProfit - corporationTaxAmount
    }

    private var isBasicFinancialLimited: Bool {
        !authVM.currentPlanEntitlements.advancedDashboardEnabled
    }

    private var financialAdvancedPlanLabel: String {
        t(StudioBillingPlan.proMonthly.displayName, lang: seciliDil)
    }

    private var financialBasicBalance: Double { siparis.paidAmount - siparis.watchPurchasePrice }

    private var demoFinancialLockedFieldTitles: [String] {
        var titles = [
            "Remaining",
            "Full Payment Received?",
            "Payment Method"
        ]

        titles.append(contentsOf: orderRemainingItems.map { $0.title })
        titles.append(contentsOf: orderExpenseItems.map { $0.title })
        titles.append(contentsOf: [
            "Platform Fee",
            "Shipping Cost",
            "VAT Rule",
            "VAT Rate (%)",
            "VAT Amount",
            "Final Profit"
        ])

        var seen = Set<String>()
        return titles.filter { title in
            let key = title.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !key.isEmpty, !seen.contains(key) else { return false }
            seen.insert(key)
            return true
        }
    }

    private func demoFinancialLockedSummary(_ titles: [String]) -> some View {
        Button {
            openPlanAccessFromLockedFeature()
        } label: {
            HStack(spacing: 7) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 9, weight: .bold))

                Text(t("Advanced finance", lang: seciliDil))
                    .font(.system(size: 11, weight: .semibold))

                Text("Pro")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.blue)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.blue.opacity(0.11))
                    .clipShape(Capsule())

                Spacer(minLength: 6)

                Text(t("Plan & Access", lang: seciliDil))
                    .font(.system(size: 10, weight: .semibold))

                Image(systemName: "chevron.right")
                    .font(.system(size: 8, weight: .bold))
            }
            .foregroundColor(.secondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(Color.primary.opacity(colorScheme == .dark ? 0.05 : 0.035))
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(t("Plan & Access", lang: seciliDil))
    }

    private func financialKarti(colIndex: Int) -> some View {
        DetayKarti(
            title: t("Financial Info", lang: seciliDil),
            iconName: cardHeaderIcon(for: .financial),
            kartTipi: .financial,
            yukseklik: bindingYukseklik(for: .financial),
            sutunGenisligi: getBinding(for: colIndex),
            draggedKart: $draggedKart,
            uiTetikleyici: uiTetikleyici,
            kartRengi: getKartColor(kart: .financial),
            forceLayoutUnlocked: shouldShowMacFirstProjectGuide && (macFirstProjectGuideStep == 5 || macFirstProjectGuideStep == 6),
            guideHighlightActive: shouldShowMacFirstProjectGuide && (macFirstProjectGuideStep == 5 || macFirstProjectGuideStep == 6),
            guideOptionsHighlightActive: shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 6,
            guideOptionsBubbleActive: shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 6,
            onGuideOptionsDone: completeMacFirstProjectGuideFromFinancialCardActions,
            onHeightChangeEnd: kaydetKartYukseklikleri,
            onWidthChangeEnd: saveWidths,
            onHide: { setCardVisibleWithUndo(.financial, false) },
            onColorChange: { setKartColor(kart: .financial, color: $0) },
            onEditHeadings: { headingEditorTarget = .financial }
        ) {
            CurrencyField(label: t("Paid", lang: seciliDil), value: $siparis.paidAmount, sembol: seciliParaBirimi, ondalik: seciliOndalik, onCommit: { seedInitialPaymentFromPaidIfNeeded() })
                .onChange(of: siparis.paidAmount) { _, _ in otomatikKesintiHesapla() }

            if !isBasicFinancialLimited {
                CurrencyField(label: t("Remaining", lang: seciliDil), value: $siparis.remainingAmount, sembol: seciliParaBirimi, ondalik: seciliOndalik, onCommit: { seedInitialRemainingLogIfNeeded() })
                    .onChange(of: siparis.remainingAmount) { _, _ in otomatikKesintiHesapla() }

                if !orderRemainingItems.isEmpty {
                    ForEach(orderRemainingItems, id: \.id) { item in
                        HStack(spacing: 8) {
                            CurrencyField(
                                label: t(item.title, lang: seciliDil),
                                value: customCurrencyBinding(prefix: "financialRemaining::", title: item.title),
                                sembol: seciliParaBirimi,
                                ondalik: seciliOndalik,
                                editableLabelRaw: canEditOrderDetails ? item.title : nil,
                                onLabelCommit: canEditOrderDetails ? { newValue in
                                    renameOrderFinancialItem(id: item.id, newTitle: newValue, key: orderRemainingItemsKey, amountPrefix: "financialRemaining::", workspaceItems: financialRemainingItems)
                                } : nil
                            )
                            if canEditOrderDetails {
                                Button {
                                    removeOrderFinancialItem(id: item.id, key: orderRemainingItemsKey, amountPrefix: "financialRemaining::", workspaceItems: financialRemainingItems)
                                } label: {
                                    Image(systemName: "minus.circle.fill")
                                        .font(.system(size: 15))
                                        .foregroundColor(.red.opacity(0.5))
                                }
                                .buttonStyle(.plain)
                                .help(t("Remove", lang: seciliDil))
                            }
                        }
                    }
                }
                if canEditOrderDetails {
                    Button {
                        addOrderFinancialItem(key: orderRemainingItemsKey, workspaceItems: financialRemainingItems, defaultBase: t("Remaining", lang: seciliDil))
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "plus.circle.fill").font(.system(size: 13))
                            Text(t("Remaining", lang: seciliDil)).font(.system(size: 13, weight: .semibold))
                        }
                        .foregroundColor(.blue)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 2)
                }

                YesNoField(label: t("Full Payment Received?", lang: seciliDil), value: Binding(
                    get: { isFullPaymentReceived },
                    set: { newValue in
                        if newValue {
                            markFullPaymentReceived()
                        }
                    }
                ))

                paymentLedgerSection

                PickerField(label: t("Payment Method", lang: seciliDil), value: Binding(get: { siparis.paymentMethod }, set: { siparis.paymentMethod = $0 }), options: ["Card", "Apple Pay", "PayPal", "Direct Transfer"])
            }

            Divider().background(Color.primary.opacity(0.1))

            if financialShowBaseCost || isBasicFinancialLimited {
                CurrencyField(
                    label: t(orderBaseCostLabel, lang: seciliDil),
                    value: $siparis.watchPurchasePrice,
                    isCost: true,
                    sembol: seciliParaBirimi,
                    ondalik: seciliOndalik,
                    editableLabelRaw: canEditOrderDetails ? orderBaseCostLabel : nil,
                    onLabelCommit: canEditOrderDetails ? { newValue in
                        setOrderBaseCostLabel(newValue)
                    } : nil
                )
                    .onChange(of: siparis.watchPurchasePrice) { _, _ in otomatikKesintiHesapla() }
            }

            if isBasicFinancialLimited {
                HStack {
                    Text(t("Basic Balance", lang: seciliDil))
                        .font(.system(size: 14, weight: .bold))
                    Spacer()
                    Text("\(seciliParaBirimi)\(formatFiyat(financialBasicBalance, ondalik: seciliOndalik))")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.green)
                }
                demoFinancialLockedSummary(demoFinancialLockedFieldTitles)
            } else {
                if !orderExpenseItems.isEmpty {
                    ForEach(orderExpenseItems, id: \.id) { item in
                        HStack(spacing: 8) {
                            CurrencyField(
                                label: t(item.title, lang: seciliDil),
                                value: customCurrencyBinding(prefix: "financialExpense::", title: item.title),
                                isCost: true,
                                sembol: seciliParaBirimi,
                                ondalik: seciliOndalik,
                                editableLabelRaw: canEditOrderDetails ? item.title : nil,
                                onLabelCommit: canEditOrderDetails ? { newValue in
                                    renameOrderFinancialItem(id: item.id, newTitle: newValue, key: orderExpenseItemsKey, amountPrefix: "financialExpense::", workspaceItems: financialExpenseItems)
                                } : nil
                            )
                            if canEditOrderDetails {
                                Button {
                                    removeOrderFinancialItem(id: item.id, key: orderExpenseItemsKey, amountPrefix: "financialExpense::", workspaceItems: financialExpenseItems)
                                } label: {
                                    Image(systemName: "minus.circle.fill")
                                        .font(.system(size: 15))
                                        .foregroundColor(.red.opacity(0.5))
                                }
                                .buttonStyle(.plain)
                                .help(t("Remove", lang: seciliDil))
                            }
                        }
                    }
                }
                if canEditOrderDetails {
                    Button {
                        addOrderFinancialItem(key: orderExpenseItemsKey, workspaceItems: financialExpenseItems, defaultBase: t("Spending", lang: seciliDil))
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "plus.circle.fill").font(.system(size: 13))
                            Text(t("Spending", lang: seciliDil)).font(.system(size: 13, weight: .semibold))
                        }
                        .foregroundColor(.blue)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 2)
                }

                CurrencyField(label: t("Platform Fee", lang: seciliDil), value: $siparis.paymentFee, isCost: true, isReadOnly: true, sembol: seciliParaBirimi, ondalik: seciliOndalik)

                CurrencyField(label: t("Shipping Cost", lang: seciliDil), value: $siparis.deliveryCost, isCost: true, sembol: seciliParaBirimi, ondalik: seciliOndalik)
                    .onChange(of: siparis.deliveryCost) { _, _ in otomatikKesintiHesapla() }

                Divider().background(Color.primary.opacity(0.1))

                HStack(spacing: 10) {
                    Text(t("VAT Rule", lang: seciliDil))
                        .font(.system(size: 13))
                        .foregroundColor(.gray)
                        .frame(width: 110, alignment: .leading)

                    Spacer(minLength: 8)

                    Menu {
                        Button(taxRuleNameRevenue) {
                            siparis.taxType = "Revenue"
                            otomatikKesintiHesapla()
                        }
                        Button(taxRuleNameProfit) {
                            siparis.taxType = "Profit"
                            otomatikKesintiHesapla()
                        }
                    } label: {
                        HStack(spacing: 8) {
                            Text(siparis.taxType == "Revenue" ? taxRuleNameRevenue : taxRuleNameProfit)
                                .font(.system(size: 13, weight: .bold))
                                .foregroundColor(.primary)
                                .lineLimit(1)
                                .truncationMode(.tail)
                                .minimumScaleFactor(0.78)

                            Image(systemName: "chevron.up.chevron.down")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.secondary)
                        }
                        .padding(.vertical, 8)
                        .padding(.horizontal, 10)
                        .frame(maxWidth: 220, alignment: .trailing)
                        .background(colorSchemeFieldSurface())
                        .cornerRadius(8)
                    }
                    .buttonStyle(.plain)
                }

                HStack(spacing: 10) {
                    Text(t("VAT Rate (%)", lang: seciliDil))
                        .font(.system(size: 13))
                        .foregroundColor(.gray)
                        .frame(width: 110, alignment: .leading)

                    TextField("0.0", value: $siparis.taxRate, format: .number)
                        .textFieldStyle(.plain)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.red)
                        .padding(.vertical, 8)
                        .padding(.horizontal, 10)
                        .background(Color.red.opacity(0.05))
                        .cornerRadius(6)
                        .onChange(of: siparis.taxRate) { _, _ in otomatikKesintiHesapla() }
                }

                CurrencyField(label: t("VAT Amount", lang: seciliDil), value: $siparis.taxAmount, isCost: true, isReadOnly: true, sembol: seciliParaBirimi, ondalik: seciliOndalik)

                Divider().background(Color.primary.opacity(0.1))

                HStack {
                    Text(t("Order Value", lang: seciliDil))
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.gray)
                    Spacer()
                    Text(privacyCurrency(siparis.salesTotal, symbol: seciliParaBirimi, ondalik: seciliOndalik, hideNumbers: hideSensitiveNumbers))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.gray)
                }

                if corporationTaxEnabled {
                    HStack {
                        Text(t("Profit before Corporation Tax", lang: seciliDil))
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.primary)
                        Spacer()
                        Text(privacyCurrency(financialFinalProfit, symbol: seciliParaBirimi, ondalik: seciliOndalik, hideNumbers: hideSensitiveNumbers))
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.primary)
                    }
                    HStack {
                        Text("\(t("Corporation Tax", lang: seciliDil)) (\(Int(corporationTaxRate))%, \(t("est.", lang: seciliDil)))")
                            .font(.system(size: 13))
                            .foregroundColor(.gray)
                        Spacer()
                        Text(privacyCurrency(corporationTaxAmount, symbol: seciliParaBirimi, ondalik: seciliOndalik, hideNumbers: hideSensitiveNumbers))
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.red)
                    }
                    HStack {
                        Text(t("Net Profit (after CT)", lang: seciliDil))
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.primary)
                        Spacer()
                        Text(privacyCurrency(netProfitAfterCorporationTax, symbol: seciliParaBirimi, ondalik: seciliOndalik, hideNumbers: hideSensitiveNumbers))
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(Color.green)
                    }
                } else {
                    HStack {
                        Text(t("Final Profit", lang: seciliDil))
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.primary)
                        Spacer()
                        Text(privacyCurrency(financialFinalProfit, symbol: seciliParaBirimi, ondalik: seciliOndalik, hideNumbers: hideSensitiveNumbers))
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(Color.green)
                    }
                }
            }
        }
    }
    private func getCurrencyIcon() -> String { switch seciliParaBirimi { case "£": return "sterlingsign.circle.fill"; case "$", "A$", "C$": return "dollarsign.circle.fill"; case "€": return "eurosign.circle.fill"; case "₺": return "turkishlirasign.circle.fill"; case "¥": return "yensign.circle.fill"; case "CHF": return "francsign.circle.fill"; default: return "banknote.fill" } }
    private func syncCardLabel(key: String, value: String) {
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !companyId.isEmpty else { return }
        Firestore.firestore().collection("companySettings").document(companyId).setData([key: value], merge: true)
    }

    private func renamePriorityCardLabel(to newName: String) {
        let cleaned = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return }
        priorityCardLabel = cleaned
        syncCardLabel(key: "priorityCardLabel", value: cleaned)
    }

    private func renameRiskCardLabel(to newName: String) {
        let cleaned = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return }
        riskCardLabel = cleaned
        syncCardLabel(key: "riskCardLabel", value: cleaned)
    }

    private func renameDesignNameLabel(to newName: String) {
        let cleaned = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return }
        designNameLabel = cleaned
        syncCardLabel(key: "designNameLabel", value: cleaned)
    }

    private func renameStatusStep(at index: Int, to newName: String) {
        var steps = decodedSteps
        guard steps.indices.contains(index) else { return }
        let cleaned = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return }
        // Keep the step's id so per-order status values (keyed by id) survive the rename.
        steps[index] = CustomStepDTO(id: steps[index].id, title: cleaned)
        if let data = try? JSONEncoder().encode(steps), let json = String(data: data, encoding: .utf8) {
            customStepsJSON = json
        }
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !companyId.isEmpty else { return }
        Firestore.firestore().collection("companySettings").document(companyId)
            .setData(["customStepsJSON": customStepsJSON], merge: true)
    }

    private func statusKarti(colIndex: Int) -> some View {
    DetayKarti(title: t("Production Status", lang: seciliDil), iconName: cardHeaderIcon(for: .status), kartTipi: .status, yukseklik: bindingYukseklik(for: .status), sutunGenisligi: getBinding(for: colIndex), draggedKart: $draggedKart, uiTetikleyici: uiTetikleyici, kartRengi: getKartColor(kart: .status), onHeightChangeEnd: kaydetKartYukseklikleri, onWidthChangeEnd: saveWidths, onHide: { setCardVisibleWithUndo(.status, false) }, onColorChange: { setKartColor(kart: .status, color: $0) }, onEditHeadings: { headingEditorTarget = .status }) {
        ForEach(Array(decodedSteps.enumerated()), id: \.element.id) { index, step in
            if index == 0 {
                StatusMenuField(label: step.title, value: $siparis.designStatus, options: userStatuses, editableLabelRaw: canEditOrderDetails ? step.title : nil, onLabelCommit: canEditOrderDetails ? { renameStatusStep(at: index, to: $0) } : nil)
                    .onChange(of: siparis.designStatus) { _, islem in
                        if islem == "Cancelled" { withAnimation { siparis.status = "Cancelled" } }
                    }
            } else if index == 1 {
                StatusMenuField(label: step.title, value: $siparis.status, options: userStatuses, editableLabelRaw: canEditOrderDetails ? step.title : nil, onLabelCommit: canEditOrderDetails ? { renameStatusStep(at: index, to: $0) } : nil)
                    .onChange(of: siparis.status) { _, boyaDurumu in
                        if boyaDurumu == "In Progress" || boyaDurumu == "Done" { withAnimation { siparis.designStatus = "Done" } }
                    }
            } else {
                StatusMenuField(label: step.title, value: Binding(
                    get: { statusStepValue(from: siparis.extraStatuses, step: step) },
                    set: { newValue in
                        var current = siparis.extraStatuses ?? [:]
                        current[statusStepStorageKey(for: step)] = newValue
                        siparis.extraStatuses = current
                    }
                ), options: userStatuses, editableLabelRaw: canEditOrderDetails ? step.title : nil, onLabelCommit: canEditOrderDetails ? { renameStatusStep(at: index, to: $0) } : nil)
            }
        }
        if !customTogglesList.isEmpty {
            Divider().background(Color.primary.opacity(0.1))
            ForEach(customTogglesList, id: \.id) { toggle in
                YesNoField(label: t(toggle.title, lang: seciliDil), value: Binding(
                    get: { statusCustomToggleValue(from: siparis.customToggles, toggle: toggle) },
                    set: { newValue in
                        var current = siparis.customToggles ?? [:]
                        current[statusCustomToggleStorageKey(for: toggle)] = newValue
                        siparis.customToggles = current
                    }
                ))
            }
        }
        if showStatusNotesSupplier {
            Divider().background(Color.primary.opacity(0.1))
            NoteSupplierField(label: t(statusNotesSupplierLabel, lang: seciliDil), value: Binding(
                get: { siparis.customFields?["status::notesSupplier"] ?? "" },
                set: { newValue in
                    var current = siparis.customFields ?? [:]
                    current["status::notesSupplier"] = newValue
                    siparis.customFields = current
                }
            ))
        }
    }
}
    private func trackingCustomKey(_ key: String) -> String {
        "tracking::\(key)"
    }

    private func trackingValue(_ key: String) -> String {
        let currentNumber = cleanedCurrentTrackingNumber

        if key != "trackingNumber" {
            let liveNumber = liveTrackingData["trackingNumber"] ?? ""
            if !liveNumber.isEmpty && liveNumber != currentNumber {
                return ""
            }

            let storedNumber = siparis.customFields?[trackingCustomKey("trackingNumber")] ?? ""
            if !storedNumber.isEmpty && storedNumber != currentNumber {
                return ""
            }
        }

        if let liveValue = liveTrackingData[key],
           !liveValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return liveValue
        }

        return siparis.customFields?[trackingCustomKey(key)] ?? ""
    }

    private func setTrackingCustomValue(_ key: String, _ value: String) {
        var fields = siparis.customFields ?? [:]
        fields[trackingCustomKey(key)] = value
        siparis.customFields = fields
    }

    private var trackingStorageKeys: [String] {
        [
            "trackingNumber",
            "status",
            "statusText",
            "subStatus",
            "carrier",
            "checkpoint",
            "location",
            "eta",
            "lastUpdate",
            "lastCheckedAt",
            "trackingUrl",
            "provider",
            "carrierCode",
            "trackingSupportStatus",
            "supportMessage",
            "supportMessageKey",
            "error"
        ]
    }

    private var cleanedCurrentTrackingNumber: String {
        siparis.trackingNumber
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "\\s+", with: "", options: .regularExpression)
    }

    private func clearTrackingDisplayForCurrentNumber() {
        let number = cleanedCurrentTrackingNumber

        var fields = siparis.customFields ?? [:]

        for key in trackingStorageKeys {
            fields[trackingCustomKey(key)] = ""
        }

        fields[trackingCustomKey("trackingNumber")] = number
        fields[trackingCustomKey("provider")] = "17TRACK"
        fields[trackingCustomKey("status")] = "Not Registered"
        fields[trackingCustomKey("trackingSupportStatus")] = "waiting"
        fields[trackingCustomKey("supportMessage")] = ""
        fields[trackingCustomKey("error")] = ""

        siparis.customFields = fields

        liveTrackingData = [
            "trackingNumber": number,
            "provider": "17TRACK",
            "status": "Not Registered",
            "trackingSupportStatus": "waiting",
            "supportMessage": "",
            "supportMessageKey": "",
            "error": ""
        ]

        trackingSyncMessage = ""
    }

    private func prepareTrackingRequestState(trackingNumber: String) {
        let nowText = Date().formatted(date: .abbreviated, time: .shortened)

        var fields = siparis.customFields ?? [:]

        for key in trackingStorageKeys {
            fields[trackingCustomKey(key)] = ""
        }

        fields[trackingCustomKey("trackingNumber")] = trackingNumber
        fields[trackingCustomKey("provider")] = "17TRACK"
        fields[trackingCustomKey("status")] = "Registering"
        fields[trackingCustomKey("trackingSupportStatus")] = "waiting"
        fields[trackingCustomKey("supportMessage")] = "Checking 17TRACK support for this tracking number."
        fields[trackingCustomKey("supportMessageKey")] = "checking_support"
        fields[trackingCustomKey("lastCheckedAt")] = nowText
        fields[trackingCustomKey("error")] = ""

        siparis.customFields = fields

        liveTrackingData = [
            "trackingNumber": trackingNumber,
            "provider": "17TRACK",
            "status": "Registering",
            "trackingSupportStatus": "waiting",
            "supportMessage": "Checking 17TRACK support for this tracking number.",
            "supportMessageKey": "checking_support",
            "lastCheckedAt": nowText,
            "error": ""
        ]
    }

    private func formattedTrackingTimestamp(_ value: Any?) -> String {
        if let timestamp = value as? Timestamp {
            return timestamp.dateValue().formatted(date: .abbreviated, time: .shortened)
        }

        if let date = value as? Date {
            return date.formatted(date: .abbreviated, time: .shortened)
        }

        if let seconds = value as? TimeInterval, seconds > 0 {
            return Date(timeIntervalSince1970: seconds).formatted(date: .abbreviated, time: .shortened)
        }

        if let string = value as? String {
            return string
        }

        return ""
    }

    private func stringFromTrackingValue(_ value: Any?) -> String {
        if let value = value as? String { return value }
        if let value = value as? NSNumber { return value.stringValue }
        if let value = value as? Bool { return value ? "true" : "false" }
        if value is Timestamp || value is Date { return formattedTrackingTimestamp(value) }
        return ""
    }

    private func startLiveTrackingListener() {
        liveTrackingListener?.remove()
        liveTrackingData = [:]

        guard let orderId = siparis.id, !orderId.isEmpty else { return }

        liveTrackingListener = Firestore.firestore()
            .collection("companies")
            .document(firebaseManager.currentCompanyId)
            .collection("trackingResults")
            .document(orderId)
            .addSnapshotListener { snapshot, error in
                if let error = error {
                    trackingSyncMessage = error.localizedDescription
                    return
                }

                guard let data = snapshot?.data() else { return }

                var incoming: [String: String] = [:]
                for (key, value) in data {
                    incoming[key] = stringFromTrackingValue(value)
                }

                let incomingTrackingNumber = incoming["trackingNumber"] ?? ""
                let currentTrackingNumber = cleanedCurrentTrackingNumber

                if !incomingTrackingNumber.isEmpty && incomingTrackingNumber != currentTrackingNumber {
                    return
                }

                liveTrackingData = incoming

                var fields = siparis.customFields ?? [:]
                for key in trackingStorageKeys {
                    if let value = incoming[key], !value.isEmpty {
                        fields[trackingCustomKey(key)] = value
                    }
                }

                siparis.customFields = fields
            }
    }

    private func scheduleLiveTrackingRegistration() {
        trackingAutoSyncWorkItem?.cancel()

        let trimmed = siparis.trackingNumber.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let workItem = DispatchWorkItem {
            requestLiveTrackingSync(isManual: false)
        }

        trackingAutoSyncWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2, execute: workItem)
    }

    private func requestLiveTrackingSync(isManual: Bool = true) {
        let trackingNumber = cleanedCurrentTrackingNumber
        guard !trackingNumber.isEmpty else { return }

        guard let orderId = siparis.id, !orderId.isEmpty else {
            trackingSyncMessage = lt("save_order_first")
            return
        }

        isLiveTrackingSyncing = true
        trackingSyncMessage = isManual ? lt("checking_tracking") : ""

        prepareTrackingRequestState(trackingNumber: trackingNumber)
        firebaseManager.updateSiparis(siparis)

        #if canImport(FirebaseFunctions)
        let payload: [String: Any] = [
            "companyId": firebaseManager.currentCompanyId,
            "orderId": orderId,
            "trackingNumber": trackingNumber,
            "courier": siparis.courier,
            "language": seciliDil
        ]

        Functions.functions(region: "europe-west2").httpsCallable("registerTracking").call(payload) { result, error in
            DispatchQueue.main.async {
                isLiveTrackingSyncing = false

                if let error = error {
                    setTrackingCustomValue("status", "Error")
                    setTrackingCustomValue("error", error.localizedDescription)
                    setTrackingCustomValue("lastCheckedAt", Date().formatted(date: .abbreviated, time: .shortened))
                    trackingSyncMessage = error.localizedDescription
                    firebaseManager.updateSiparis(siparis)
                    return
                }

                if let dict = result?.data as? [String: Any] {
                    applyLiveTrackingResult(dict)
                    trackingSyncMessage = lt("tracking_updated")
                } else {
                    trackingSyncMessage = lt("tracking_request_sent")
                }
            }
        }
        #else
        isLiveTrackingSyncing = false
        setTrackingCustomValue("status", "Setup Needed")
        setTrackingCustomValue("error", lt("firebase_functions_missing"))
        firebaseManager.updateSiparis(siparis)
        trackingSyncMessage = lt("firebase_functions_missing")
        #endif
    }

    private func applyLiveTrackingResult(_ dict: [String: Any]) {
        var fields = siparis.customFields ?? [:]
        var live: [String: String] = liveTrackingData

        // These keys must also CLEAR when the server returns them empty, otherwise a
        // stale "Checking 17TRACK support…" or an old error stays on a healthy card.
        let alwaysOverwriteKeys: Set<String> = ["supportMessage", "supportMessageKey", "error", "trackingSupportStatus"]

        for key in trackingStorageKeys {
            let value = stringFromTrackingValue(dict[key])
            if !value.isEmpty || (alwaysOverwriteKeys.contains(key) && dict[key] != nil) {
                fields[trackingCustomKey(key)] = value
                live[key] = value
            }
        }

        if live["provider"] == nil {
            live["provider"] = "17TRACK"
            fields[trackingCustomKey("provider")] = "17TRACK"
        }

        siparis.customFields = fields
        liveTrackingData = live

        if let status = live["status"]?.lowercased(), status.contains("delivered") {
            siparis.isDelivered = true
            siparis.isDispatched = true
        }

        firebaseManager.updateSiparis(siparis)
    }

    private func trackingStatusColor(_ status: String) -> Color {
        let lowered = status.lowercased()

        if lowered.contains("delivered") { return .green }
        if lowered.contains("exception") || lowered.contains("failed") || lowered.contains("expired") || lowered.contains("error") { return .red }
        if lowered.contains("out for delivery") || lowered.contains("pickup") { return studioWarningOrange }
        if lowered.contains("transit") || lowered.contains("inforeceived") || lowered.contains("register") { return .blue }
        if lowered.contains("not found") || lowered.contains("pending") { return .gray }

        return .blue
    }

    private func trackingSupportColor(_ supportStatus: String, fallback: Color) -> Color {
        let lowered = supportStatus.lowercased()

        if lowered == "active" { return fallback }
        if lowered == "waiting" { return .blue }
        if lowered == "limited" { return studioWarningOrange }
        if lowered == "carrier_required" { return studioWarningOrange }
        if lowered == "unsupported" { return studioWarningOrange }
        if lowered == "error" { return .red }

        return fallback
    }

    private func formattedTrackingDisplayDate(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }

        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        var parsedDate = isoFormatter.date(from: trimmed)
        if parsedDate == nil {
            isoFormatter.formatOptions = [.withInternetDateTime]
            parsedDate = isoFormatter.date(from: trimmed)
        }

        guard let date = parsedDate else { return trimmed }
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    private var trackingDisplayStatus: String {
        let statusText = trackingValue("statusText")
        if !statusText.isEmpty { return lt(statusText) }

        let status = trackingValue("status")
        return status.isEmpty ? lt("Not Registered") : lt(status)
    }

    private func localizedTrackingSupportStatus(_ value: String) -> String {
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalized.isEmpty else { return "" }
        return lt(normalized)
    }

    private func localizedTrackingSupportMessage(message: String, key: String) -> String {
        if !key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return lt(key)
        }
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }

        let lower = trimmed.lowercased()
        if lower.contains("could not auto-detect") || lower.contains("carrier cannot") || lower.contains("carrier can not") {
            return lt("carrier_required_message")
        }
        if lower.contains("registered - waiting") {
            return lt("registered_waiting")
        }
        if lower.contains("royal mail") && lower.contains("limited") {
            return lt("royal_mail_limited")
        }
        if lower.contains("fedex") && lower.contains("extra") {
            return lt("fedex_limited")
        }
        return trimmed
    }

    private func trackingInfoRow(label: String, value: String, systemImage: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: systemImage)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.secondary)
                .frame(width: 16)

            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.secondary)
                Text(value.isEmpty ? "—" : value)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.primary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
    }

    @ViewBuilder
    private var liveTrackingPanel: some View {
        let status = trackingDisplayStatus
        let baseStatusColor = trackingStatusColor(status)
        let supportStatus = trackingValue("trackingSupportStatus")
        let statusColor = trackingSupportColor(supportStatus, fallback: baseStatusColor)
        let supportMessage = localizedTrackingSupportMessage(message: trackingValue("supportMessage"), key: trackingValue("supportMessageKey"))
        let error = trackingValue("error")
        let rawCarrier = trackingValue("carrier")
        let carrier = rawCarrier.isEmpty || rawCarrier == "Auto Detect" ? "" : rawCarrier
        let checkpoint = trackingValue("checkpoint")
        let location = trackingValue("location")
        let lastUpdate = formattedTrackingDisplayDate(trackingValue("lastUpdate"))
        let lastChecked = trackingValue("lastCheckedAt")
        let eta = trackingValue("eta")

        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Circle()
                    .fill(statusColor)
                    .frame(width: 9, height: 9)

                Text(status)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(statusColor)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)

                Spacer()

                if isLiveTrackingSyncing {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Text("17TRACK")
                        .font(.system(size: 9, weight: .heavy))
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Color.primary.opacity(0.06))
                        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                }
            }

            Divider().background(Color.primary.opacity(0.08))

            if !supportStatus.isEmpty && supportStatus.lowercased() != "active" {
                trackingInfoRow(label: lt("Tracking Support"), value: localizedTrackingSupportStatus(supportStatus), systemImage: "bell.badge")
            }

            trackingInfoRow(label: t("Carrier", lang: seciliDil), value: carrier, systemImage: "shippingbox")
            trackingInfoRow(label: t("Last Update", lang: seciliDil), value: lastUpdate, systemImage: "clock.arrow.circlepath")
            trackingInfoRow(label: t("Estimated Delivery", lang: seciliDil), value: eta, systemImage: "calendar")
            trackingInfoRow(label: t("Latest Checkpoint", lang: seciliDil), value: [checkpoint, location].filter { !$0.isEmpty }.joined(separator: " · "), systemImage: "mappin.and.ellipse")

            if !lastChecked.isEmpty {
                Text("\(t("Last checked by system", lang: seciliDil)): \(lastChecked)")
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
            }

            if !supportMessage.isEmpty {
                Text(supportMessage)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(statusColor)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !error.isEmpty {
                Text(error)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.red)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !trackingSyncMessage.isEmpty {
                Text(trackingSyncMessage)
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
        .background(statusColor.opacity(0.07))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(statusColor.opacity(0.20), lineWidth: 1)
        )
    }

    private func shippingKarti(colIndex: Int) -> some View {
        DetayKarti(
            title: t("Shipping & Tracking", lang: seciliDil),
            iconName: cardHeaderIcon(for: .shipping),
            kartTipi: .shipping,
            yukseklik: bindingYukseklik(for: .shipping),
            sutunGenisligi: getBinding(for: colIndex),
            draggedKart: $draggedKart,
            uiTetikleyici: uiTetikleyici,
            kartRengi: getKartColor(kart: .shipping),
            onHeightChangeEnd: kaydetKartYukseklikleri,
            onWidthChangeEnd: saveWidths,
            onHide: { setCardVisibleWithUndo(.shipping, false) },
            onColorChange: { setKartColor(kart: .shipping, color: $0) }
        ) {
            YesNoField(label: t("Dispatched", lang: seciliDil), value: $siparis.isDispatched)
                .onChange(of: siparis.isDispatched) { _, isDispatched in
                    if isDispatched && siparis.status != "Cancelled" {
                        withAnimation {
                            siparis.designStatus = "Done"
                            siparis.status = "Done"
                        }
                    }
                }

            Divider().background(Color.primary.opacity(0.1))

            PickerField(
                label: t("Courier", lang: seciliDil),
                value: $siparis.courier,
                options: ["Auto Detect", "Royal Mail", "DHL", "FedEx", "UPS"]
            )
            .onChange(of: siparis.courier) { _, _ in
                clearTrackingDisplayForCurrentNumber()
                firebaseManager.updateSiparis(siparis)
                scheduleLiveTrackingRegistration()
            }

            DetailField(label: t("Tracking No.", lang: seciliDil), value: $siparis.trackingNumber)
                .onChange(of: siparis.trackingNumber) { _, _ in
                    clearTrackingDisplayForCurrentNumber()
                    firebaseManager.updateSiparis(siparis)
                    scheduleLiveTrackingRegistration()
                }

            if !siparis.trackingNumber.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                liveTrackingPanel

                HStack(spacing: 10) {
                    Button(action: { requestLiveTrackingSync(isManual: true) }) {
                        HStack(spacing: 6) {
                            Image(systemName: "arrow.triangle.2.circlepath")
                            Text(isLiveTrackingSyncing ? t("Checking...", lang: seciliDil) : t("Refresh Live Status", lang: seciliDil))
                        }
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(isLiveTrackingSyncing ? Color.gray : Color.blue)
                        .cornerRadius(6)
                    }
                    .disabled(isLiveTrackingSyncing)
                    .buttonStyle(.plain)

                    Button(action: {
                        let url = trackingValue("trackingUrl")
                        if !url.isEmpty, let u = URL(string: url) {
                            openURL(u)
                        } else {
                            kargoSayfasiniAc(firma: siparis.courier, kod: siparis.trackingNumber)
                        }
                    }) {
                        Image(systemName: "safari")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.blue)
                            .frame(width: 34, height: 34)
                            .background(Color.blue.opacity(0.10))
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, 2)
            }

            Divider().background(Color.primary.opacity(0.1))

            YesNoField(label: t("Delivered?", lang: seciliDil), value: $siparis.isDelivered)
        }
    }

    private func getStepValue(for stepName: String) -> String {
        if let index = decodedSteps.firstIndex(where: { $0.title == stepName }) {
            if index == 0 { return siparis.designStatus }
            if index == 1 { return siparis.status }
            return statusStepValue(from: siparis.extraStatuses, step: decodedSteps[index])
        }
        return siparis.extraStatuses?[stepName] ?? "Not Yet"
    }

    @MainActor private func exportToPDF() {
        // Pre-load preview + workspace logo asynchronously (a synchronous fetch can
        // fail/return before the image is ready, leaving them missing in the PDF).
        let previewURLString = siparis.designLink.trimmingCharacters(in: .whitespacesAndNewlines)
        let logoURLString = appLogoUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        let group = DispatchGroup()
        var loadedImage: PlatformImage? = nil
        var logoImage: PlatformImage? = nil
        if let u = URL(string: previewURLString), !previewURLString.isEmpty {
            group.enter()
            URLSession.shared.dataTask(with: u) { d, _, _ in loadedImage = d.flatMap { PlatformImage(data: $0) }; group.leave() }.resume()
        }
        if let u = URL(string: logoURLString), !logoURLString.isEmpty {
            group.enter()
            URLSession.shared.dataTask(with: u) { d, _, _ in logoImage = d.flatMap { PlatformImage(data: $0) }; group.leave() }.resume()
        }
        group.notify(queue: .main) {
            self.finishOrderPDFExport(previewImage: loadedImage, logoImage: logoImage)
        }
    }

    @MainActor private func finishOrderPDFExport(previewImage loadedImage: PlatformImage?, logoImage: PlatformImage?) {
        let pdfView = OrderPDFView(
            siparis: siparis,
            previewImage: loadedImage,
            logoImage: logoImage,
            appSubtitle: appSubtitle,
            decodedSteps: decodedSteps,
            sembol: seciliParaBirimi,
            ondalik: seciliOndalik,
            showCustomer: pdfShowCustomer,
            showContact: pdfShowContact,
            showPreview: pdfShowPreview,
            showFinCustomer: pdfShowFinCustomer,
            showFinInternal: pdfShowFinInternal,
            showStatus: pdfShowStatus,
            showShipping: pdfShowShipping,
            showPaymentMethod: pdfShowPaymentMethod,
            showMaterials: pdfShowMaterials,
            showPriority: pdfShowPriority,
            showAddress: pdfShowAddress,
            showShippingAddress: pdfShowShippingAddress,
            seciliDil: seciliDil,
            taxNameRev: taxRuleNameRevenue,
            taxNamePro: taxRuleNameProfit,
            corporationTaxEnabled: corporationTaxEnabled,
            corporationTaxRate: corporationTaxRate,
            invLbl1: invLabel1,
            invLbl2: invLabel2,
            invLbl3: invLabel3,
            invLbl4: invLabel4,
            customFieldsList: customFieldsList,
            customTogglesList: customTogglesList
        )

        let safeName = safePDFFileName("Order_\(siparis.customerName.isEmpty ? siparis.designName : siparis.customerName)")
        let renderer = ImageRenderer(content: pdfView)

        #if os(macOS)
        let savePanel = NSSavePanel()
        savePanel.allowedContentTypes = [.pdf]
        savePanel.canCreateDirectories = true
        savePanel.isExtensionHidden = false
        savePanel.title = t("Save Order PDF", lang: seciliDil)
        savePanel.nameFieldStringValue = safeName

        savePanel.begin { response in
            if response == .OK, let url = savePanel.url {
                renderPDF(renderer: renderer, to: url)
            }
        }
        #else
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(safeName)
            .appendingPathExtension("pdf")

        renderPDF(renderer: renderer, to: url)

        DispatchQueue.main.async {
            self.pdfShareItem = ShareableFileURL(url: url)
        }
        #endif
    }

    @MainActor private func exportToInvoicePDF() {
        // Assign a unique invoice number via the shared server counter (so numbers
        // never collide across devices/platforms), then continue the export.
        if siparis.invoiceNumber.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           let orderId = siparis.id, !orderId.isEmpty {
            Functions.functions(region: "europe-west2").httpsCallable("assignInvoiceNumber")
                .call(["companyId": siparis.companyId, "orderId": orderId]) { result, _ in
                    if let data = result?.data as? [String: Any], let number = data["invoiceNumber"] as? String, !number.isEmpty {
                        DispatchQueue.main.async { self.siparis.invoiceNumber = number }
                    }
                    DispatchQueue.main.async { self.continueInvoiceExportLogo() }
                }
            return
        }
        continueInvoiceExportLogo()
    }

    @MainActor private func continueInvoiceExportLogo() {
        // Pre-load the workspace logo asynchronously (same path AsyncImage uses in the
        // toolbar), THEN render — a synchronous fetch can fail/return before the
        // image is ready, leaving the logo missing.
        let logoURLString = appLogoUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        if let logoURL = URL(string: logoURLString), !logoURLString.isEmpty {
            URLSession.shared.dataTask(with: logoURL) { data, _, _ in
                let image = data.flatMap { PlatformImage(data: $0) }
                DispatchQueue.main.async { self.finishInvoiceExport(logoImage: image) }
            }.resume()
        } else {
            finishInvoiceExport(logoImage: nil)
        }
    }

    @MainActor private func finishInvoiceExport(logoImage: PlatformImage?) {
        let nums = (try? JSONDecoder().decode([CompanyNumberSettingDTO].self, from: Data(companyNumbersJSON.utf8))) ?? []
        let invoiceView = OrderInvoicePDFView(
            siparis: siparis,
            logoImage: logoImage,
            businessName: appSubtitle,
            companyNumbers: nums,
            invoiceNumber: siparis.invoiceNumber,
            sembol: seciliParaBirimi,
            ondalik: seciliOndalik,
            seciliDil: seciliDil,
            footerNote: invoiceFooterNote,
            showAddress: pdfShowAddress,
            showShippingAddress: pdfShowShippingAddress
        )

        let safeName = safePDFFileName("Invoice_\(siparis.invoiceNumber)")
        let renderer = ImageRenderer(content: invoiceView)

        #if os(macOS)
        let savePanel = NSSavePanel()
        savePanel.allowedContentTypes = [.pdf]
        savePanel.canCreateDirectories = true
        savePanel.isExtensionHidden = false
        savePanel.title = t("Save Invoice PDF", lang: seciliDil)
        savePanel.nameFieldStringValue = safeName
        savePanel.begin { response in
            if response == .OK, let url = savePanel.url {
                renderPDF(renderer: renderer, to: url)
            }
        }
        #else
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(safeName)
            .appendingPathExtension("pdf")
        renderPDF(renderer: renderer, to: url)
        DispatchQueue.main.async {
            self.pdfShareItem = ShareableFileURL(url: url)
        }
        #endif
    }

    // The estimate as paper. Deliberately does NOT call assignInvoiceNumber:
    // estimates carry their own counter, and burning a real invoice number on a
    // quote that may never be accepted is exactly what that counter avoids.
    @MainActor private func exportToEstimatePDF() {
        guard let record = estimateRecord else {
            estimateNotice = t("The estimate is still loading.", lang: seciliDil)
            return
        }

        // ImageRenderer cannot fetch remote images, so the logo and the customer's
        // signature both have to be bytes before anything is drawn.
        let group = DispatchGroup()
        var logoImage: PlatformImage?
        var signatureImage: PlatformImage?

        let logoURLString = appLogoUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        if let logoURL = URL(string: logoURLString), !logoURLString.isEmpty {
            group.enter()
            URLSession.shared.dataTask(with: logoURL) { data, _, _ in
                logoImage = data.flatMap { PlatformImage(data: $0) }
                group.leave()
            }.resume()
        }

        let signatureURLString = record.approval?.signatureDownloadUrl ?? ""
        if let signatureURL = URL(string: signatureURLString), !signatureURLString.isEmpty {
            group.enter()
            URLSession.shared.dataTask(with: signatureURL) { data, _, _ in
                signatureImage = data.flatMap { PlatformImage(data: $0) }
                group.leave()
            }.resume()
        }

        group.notify(queue: .main) {
            self.finishEstimateExport(record: record, logoImage: logoImage, signatureImage: signatureImage)
        }
    }

    @MainActor private func finishEstimateExport(record: OrderEstimateRecord, logoImage: PlatformImage?, signatureImage: PlatformImage?) {
        let nums = (try? JSONDecoder().decode([CompanyNumberSettingDTO].self, from: Data(companyNumbersJSON.utf8))) ?? []
        let estimateView = OrderInvoicePDFView(
            siparis: siparis,
            logoImage: logoImage,
            businessName: appSubtitle,
            companyNumbers: nums,
            invoiceNumber: record.number,
            sembol: seciliParaBirimi,
            ondalik: seciliOndalik,
            seciliDil: seciliDil,
            footerNote: invoiceFooterNote,
            showAddress: pdfShowAddress,
            showShippingAddress: pdfShowShippingAddress,
            estimate: record,
            signatureImage: signatureImage
        )

        let safeName = safePDFFileName("Estimate_\(record.number)")
        let renderer = ImageRenderer(content: estimateView)

        #if os(macOS)
        let savePanel = NSSavePanel()
        savePanel.allowedContentTypes = [.pdf]
        savePanel.canCreateDirectories = true
        savePanel.isExtensionHidden = false
        savePanel.title = t("Save Estimate PDF", lang: seciliDil)
        savePanel.nameFieldStringValue = safeName
        savePanel.begin { response in
            if response == .OK, let url = savePanel.url {
                renderPDF(renderer: renderer, to: url)
            }
        }
        #else
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(safeName)
            .appendingPathExtension("pdf")
        renderPDF(renderer: renderer, to: url)
        DispatchQueue.main.async {
            self.pdfShareItem = ShareableFileURL(url: url)
        }
        #endif
    }

    @MainActor private func exportHistoryLogPDF() {
        var logoImage: PlatformImage? = nil
        if !appLogoUrl.isEmpty,
           let lUrl = URL(string: appLogoUrl),
           let lData = try? Data(contentsOf: lUrl) {
            logoImage = PlatformImage(data: lData)
        }

        let displayName = siparis.customerName.isEmpty ? (siparis.designName.isEmpty ? "Order" : siparis.designName) : siparis.customerName
        let safeName = safePDFFileName("History_Log_\(displayName)")
        let logs = orderHistoryItems

        #if os(macOS)
        let savePanel = NSSavePanel()
        savePanel.allowedContentTypes = [.pdf]
        savePanel.canCreateDirectories = true
        savePanel.isExtensionHidden = false
        savePanel.title = t("Save History Log PDF", lang: seciliDil)
        savePanel.nameFieldStringValue = safeName

        savePanel.begin { response in
            if response == .OK, let url = savePanel.url {
                Task { @MainActor in
                    renderHistoryLogPDF(items: logs, logoImage: logoImage, to: url)
                }
            }
        }
        #else
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(safeName)
            .appendingPathExtension("pdf")

        renderHistoryLogPDF(items: logs, logoImage: logoImage, to: url)

        DispatchQueue.main.async {
            self.pdfShareItem = ShareableFileURL(url: url)
        }
        #endif
    }



    @MainActor private func exportToDoPDF() {
        var logoImage: PlatformImage? = nil
        if !appLogoUrl.isEmpty,
           let lUrl = URL(string: appLogoUrl),
           let lData = try? Data(contentsOf: lUrl) {
            logoImage = PlatformImage(data: lData)
        }

        let displayName = siparis.customerName.isEmpty ? (siparis.designName.isEmpty ? "Order" : siparis.designName) : siparis.customerName
        let safeName = safePDFFileName("To_Do_\(displayName)")
        let items = toDoItemsSorted

        #if os(macOS)
        let savePanel = NSSavePanel()
        savePanel.allowedContentTypes = [.pdf]
        savePanel.canCreateDirectories = true
        savePanel.isExtensionHidden = false
        savePanel.title = t("Save To Do PDF", lang: seciliDil)
        savePanel.nameFieldStringValue = safeName

        savePanel.begin { response in
            if response == .OK, let url = savePanel.url {
                Task { @MainActor in
                    renderToDoPDF(items: items, logoImage: logoImage, to: url)
                }
            }
        }
        #else
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(safeName)
            .appendingPathExtension("pdf")

        renderToDoPDF(items: items, logoImage: logoImage, to: url)

        DispatchQueue.main.async {
            self.pdfShareItem = ShareableFileURL(url: url)
        }
        #endif
    }


    private func safePDFFileName(_ raw: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "_-"))
        let cleaned = raw
            .replacingOccurrences(of: " ", with: "_")
            .unicodeScalars
            .map { allowed.contains($0) ? Character($0) : "_" }
        let name = String(cleaned).trimmingCharacters(in: CharacterSet(charactersIn: "_"))
        return name.isEmpty ? "Order_Export" : name
    }

    private func renderPDF<Content: View>(renderer: ImageRenderer<Content>, to url: URL) {
        renderer.render { size, context in
            // The rendered view may be taller than one sheet (a long estimate, a
            // long item list). Draw it as A4 bands rather than cropping it.
            let pageHeight: CGFloat = 842
            let usesSinglePage = size.height <= pageHeight + 0.5
            var box = CGRect(x: 0, y: 0, width: size.width, height: usesSinglePage ? size.height : pageHeight)
            guard let pdfContext = CGContext(url as CFURL, mediaBox: &box, nil) else { return }
            if usesSinglePage {
                pdfContext.beginPDFPage(nil)
                context(pdfContext)
                pdfContext.endPDFPage()
            } else {
                let pageCount = max(1, Int(ceil(size.height / pageHeight)))
                for pageIndex in 0..<pageCount {
                    pdfContext.beginPDFPage(nil)
                    pdfContext.saveGState()
                    // PDF space is bottom-up: shift the document so the band for
                    // this page lands inside the media box.
                    pdfContext.translateBy(x: 0, y: pageHeight - size.height + CGFloat(pageIndex) * pageHeight)
                    context(pdfContext)
                    pdfContext.restoreGState()
                    pdfContext.endPDFPage()
                }
            }
            pdfContext.closePDF()
        }
    }

    @MainActor private func renderHistoryLogPDF(items: [OrderHistoryLogItem], logoImage: PlatformImage?, to url: URL) {
        let pageSize = CGSize(width: 595, height: 842)
        var box = CGRect(origin: .zero, size: pageSize)
        guard let pdfContext = CGContext(url as CFURL, mediaBox: &box, nil) else { return }

        let pageItems: [[OrderHistoryLogItem]] = items.isEmpty ? [[]] : stride(from: 0, to: items.count, by: 15).map { startIndex in
            Array(items[startIndex..<min(startIndex + 15, items.count)])
        }

        for (pageIndex, pageLogs) in pageItems.enumerated() {
            let pdfPage = HistoryLogPDFPageView(
                siparis: siparis,
                items: pageLogs,
                logoImage: logoImage,
                appSubtitle: appSubtitle,
                seciliDil: seciliDil,
                pageNumber: pageIndex + 1,
                totalPages: pageItems.count
            )
            let renderer = ImageRenderer(content: pdfPage)
            renderer.proposedSize = ProposedViewSize(width: pageSize.width, height: pageSize.height)
            renderer.render { _, context in
                pdfContext.beginPDFPage(nil)
                context(pdfContext)
                pdfContext.endPDFPage()
            }
        }

        pdfContext.closePDF()
    }



    @MainActor private func renderToDoPDF(items: [OrderToDoItem], logoImage: PlatformImage?, to url: URL) {
        let pageSize = CGSize(width: 595, height: 842)
        var box = CGRect(origin: .zero, size: pageSize)
        guard let pdfContext = CGContext(url as CFURL, mediaBox: &box, nil) else { return }

        let pageItems: [[OrderToDoItem]] = items.isEmpty ? [[]] : stride(from: 0, to: items.count, by: 12).map { startIndex in
            Array(items[startIndex..<min(startIndex + 12, items.count)])
        }

        for (pageIndex, pageTasks) in pageItems.enumerated() {
            let pdfPage = ToDoPDFPageView(
                siparis: siparis,
                items: pageTasks,
                allItems: items,
                logoImage: logoImage,
                appSubtitle: appSubtitle,
                seciliDil: seciliDil,
                pageNumber: pageIndex + 1,
                totalPages: pageItems.count
            )
            let renderer = ImageRenderer(content: pdfPage)
            renderer.proposedSize = ProposedViewSize(width: pageSize.width, height: pageSize.height)
            renderer.render { _, context in
                pdfContext.beginPDFPage(nil)
                context(pdfContext)
                pdfContext.endPDFPage()
            }
        }

        pdfContext.closePDF()
    }


    private func otomatikKesintiHesapla() {
        if siparis.taxType.isEmpty {
            if taxMilestoneEnabled {
                let milat = Date(timeIntervalSince1970: taxMilestoneDate)
                siparis.taxType = siparis.paymentDate >= milat ? "Revenue" : "Profit"
            } else {
                siparis.taxType = taxCalculationType
            }
        }

        let toplamSatis = siparis.salesTotal

        if toplamSatis >= 0 {
            siparis.paymentFee = (toplamSatis * feePercentage) / 100.0
        }

        if siparis.taxType == "Revenue" {
            siparis.taxAmount = kdvBrutten(siparis.taxRate, toplamSatis)
        } else {
            let brutKar = toplamSatis - baseCostTotal - customExpenseTotal - siparis.deliveryCost - siparis.paymentFee
            siparis.taxAmount = brutKar > 0 ? kdvBrutten(siparis.taxRate, brutKar) : 0
        }
    }
    private func kargoSayfasiniAc(firma: String, kod: String) { let tKod = kod.trimmingCharacters(in: .whitespacesAndNewlines); var url = ""; switch firma { case "DHL": url = "https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id=\(tKod)"; case "Royal Mail": url = "https://www.royalmail.com/track-your-item#/tracking-results/\(tKod)"; case "FedEx": url = "https://www.fedex.com/fedextrack/?trknbr=\(tKod)"; case "UPS": url = "https://www.ups.com/track?tracknum=\(tKod)"; default: url = "https://www.17track.net/en/track-details?nums=\(tKod)" }; if let u = URL(string: url) { openURL(u) } }
    private func kalanGunSayisi(siparis: Siparis) -> Int { let cal = Calendar.current; guard let t = cal.date(byAdding: .day, value: siparis.deliveryTime, to: siparis.paymentDate) else { return 0 }; return cal.dateComponents([.day], from: cal.startOfDay(for: Date()), to: cal.startOfDay(for: t)).day ?? 0 }
    private func kalanGunRengi(siparis: Siparis) -> Color {
        if siparis.status == "Cancelled" || siparis.isDispatched { return .gray }
        let gun = kalanGunSayisi(siparis: siparis)
        if gun <= 7 { return .red }
        if gun <= 14 {
            return colorScheme == .dark
                ? Color(red: 0.96, green: 0.64, blue: 0.18)
                : Color(red: 0.70, green: 0.32, blue: 0.04)
        }
        return .green
    }
    private func kalanGunMetni(siparis: Siparis) -> String { if siparis.status == "Cancelled" { return "❌" }; if siparis.isDispatched { return "✅" }; let gun = kalanGunSayisi(siparis: siparis); return gun > 0 ? "\(gun) \(t("days", lang: seciliDil))" : (gun == 0 ? t("Today", lang: seciliDil) : "\(t("Late", lang: seciliDil)) (\(-gun) \(t("days", lang: seciliDil)))") }
}

struct SutunAyirici: View {
    @Binding var width: Double
    var onDragEnd: () -> Void
    @State private var initialWidth: Double = 0
    @AppStorage("workspaceCardsLockedV1") private var workspaceCardsLocked: Bool = false

    var body: some View {
        if workspaceCardsLocked {
            Rectangle()
                .fill(Color.clear)
                .frame(width: 14)
        } else {
            Rectangle()
                .fill(Color.clear)
                .frame(width: 14)
                .onHover { hover in
                    if hover { PlatformCursor.resizeLeftRightPush() } else { PlatformCursor.pop() }
                }
                .gesture(
                    DragGesture(coordinateSpace: .global)
                        .onChanged { value in
                            if initialWidth == 0 { initialWidth = width }
                            let hedefGenislik = min(max(initialWidth + Double(value.translation.width), 260), 800)
                            withAnimation(.interactiveSpring(response: 0.22, dampingFraction: 0.9, blendDuration: 0.05)) {
                                width = hedefGenislik
                            }
                        }
                        .onEnded { _ in
                            initialWidth = 0
                            onDragEnd()
                        }
                )
        }
    }
}
struct KartDropDelegate: DropDelegate {
    let item: KartTipi
    let columnIndex: Int
    @Binding var layout: [[KartTipi]]
    @Binding var draggedItem: KartTipi?
    var onDropEnd: () -> Void

    func dropEntered(info: DropInfo) {
        guard let draggedItem = draggedItem, draggedItem != item else { return }
        CardDragCoordinator.shared.markDropTargetReached()
        PlatformCursor.closedHandSet()

        var sourceColumn = -1
        var sourceRow = -1

        for column in 0..<layout.count {
            if let row = layout[column].firstIndex(of: draggedItem) {
                sourceColumn = column
                sourceRow = row
                break
            }
        }

        guard sourceColumn != -1 else { return }

        let destinationColumn = columnIndex
        guard let destinationRow = layout[destinationColumn].firstIndex(of: item) else { return }

        withAnimation(.interactiveSpring(response: 0.38, dampingFraction: 0.88, blendDuration: 0.12)) {
            if sourceColumn == destinationColumn {
                layout[sourceColumn].move(
                    fromOffsets: IndexSet(integer: sourceRow),
                    toOffset: destinationRow > sourceRow ? destinationRow + 1 : destinationRow
                )
            } else {
                let removed = layout[sourceColumn].remove(at: sourceRow)
                layout[destinationColumn].insert(removed, at: destinationRow)
            }
        }
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        if draggedItem != nil {
            CardDragCoordinator.shared.markDropTargetReached()
            PlatformCursor.closedHandSet()
        }
        return DropProposal(operation: .move)
    }

    func performDrop(info: DropInfo) -> Bool {
        DispatchQueue.main.async {
            CardDragCoordinator.shared.endSession()
            self.draggedItem = nil
            self.onDropEnd()
            PlatformCursor.arrowSet()
        }
        return true
    }
}

private struct KartAralikDropDelegate: DropDelegate {
    let after: KartTipi
    let columnIndex: Int
    @Binding var layout: [[KartTipi]]
    @Binding var draggedItem: KartTipi?
    @Binding var activeTarget: WorkspaceCardInsertDropTarget?
    var onDropEnd: () -> Void

    private var currentTarget: WorkspaceCardInsertDropTarget {
        WorkspaceCardInsertDropTarget(columnIndex: columnIndex, after: after)
    }

    private func moveDraggedItemAfterTarget() {
        guard let draggedItem,
              draggedItem != after,
              layout.indices.contains(columnIndex) else { return }

        var sourceColumn: Int?
        var sourceRow: Int?

        for column in layout.indices {
            if let row = layout[column].firstIndex(of: draggedItem) {
                sourceColumn = column
                sourceRow = row
                break
            }
        }

        guard let sourceColumn,
              let sourceRow,
              layout.indices.contains(sourceColumn),
              let afterRow = layout[columnIndex].firstIndex(of: after) else { return }

        withAnimation(.interactiveSpring(response: 0.34, dampingFraction: 0.88, blendDuration: 0.10)) {
            let removed = layout[sourceColumn].remove(at: sourceRow)
            var insertIndex = afterRow + 1

            if sourceColumn == columnIndex, sourceRow < insertIndex {
                insertIndex -= 1
            }

            insertIndex = min(max(insertIndex, 0), layout[columnIndex].count)
            layout[columnIndex].insert(removed, at: insertIndex)
        }
    }

    func dropEntered(info: DropInfo) {
        guard draggedItem != nil else { return }
        activeTarget = currentTarget
        CardDragCoordinator.shared.markDropTargetReached()
        PlatformCursor.closedHandSet()
        moveDraggedItemAfterTarget()
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        if draggedItem != nil {
            activeTarget = currentTarget
            CardDragCoordinator.shared.markDropTargetReached()
            PlatformCursor.closedHandSet()
            moveDraggedItemAfterTarget()
        }
        return DropProposal(operation: .move)
    }

    func performDrop(info: DropInfo) -> Bool {
        moveDraggedItemAfterTarget()

        DispatchQueue.main.async {
            self.activeTarget = nil
            CardDragCoordinator.shared.endSession()
            self.draggedItem = nil
            self.onDropEnd()
            PlatformCursor.arrowSet()
        }
        return true
    }
}


#if os(macOS)
private struct WorkspacePanSurface: NSViewRepresentable {
    func makeNSView(context: Context) -> WorkspacePanNSView {
        WorkspacePanNSView()
    }

    func updateNSView(_ nsView: WorkspacePanNSView, context: Context) {}
}

private final class WorkspacePanNSView: NSView {
    private var lastDragPoint: NSPoint?

    override var acceptsFirstResponder: Bool { true }

    override func resetCursorRects() {
        addCursorRect(bounds, cursor: .openHand)
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool {
        true
    }

    override func mouseDown(with event: NSEvent) {
        lastDragPoint = event.locationInWindow
        NSCursor.closedHand.set()
    }

    override func mouseDragged(with event: NSEvent) {
        guard let lastDragPoint else { return }

        let currentPoint = event.locationInWindow
        let deltaX = currentPoint.x - lastDragPoint.x
        let deltaY = currentPoint.y - lastDragPoint.y
        self.lastDragPoint = currentPoint

        let horizontalScrollView = scrollableAncestor(axis: .horizontal)
        let verticalScrollView = scrollableAncestor(axis: .vertical)

        if let horizontalScrollView, horizontalScrollView === verticalScrollView {
            scroll(horizontalScrollView, deltaX: deltaX, deltaY: deltaY, scrollsX: true, scrollsY: true)
        } else {
            if let horizontalScrollView {
                scroll(horizontalScrollView, deltaX: deltaX, deltaY: 0, scrollsX: true, scrollsY: false)
            }
            if let verticalScrollView {
                scroll(verticalScrollView, deltaX: 0, deltaY: deltaY, scrollsX: false, scrollsY: true)
            }
        }
    }

    override func mouseUp(with event: NSEvent) {
        lastDragPoint = nil
        NSCursor.arrow.set()
    }

    override func mouseExited(with event: NSEvent) {
        if lastDragPoint != nil {
            NSCursor.closedHand.set()
        }
    }

    private enum ScrollAxis {
        case horizontal
        case vertical
    }

    private func scrollableAncestor(axis: ScrollAxis) -> NSScrollView? {
        var view: NSView? = self
        while let current = view {
            if let scrollView = current as? NSScrollView, canScroll(scrollView, axis: axis) {
                return scrollView
            }
            view = current.superview
        }
        return nil
    }

    private func canScroll(_ scrollView: NSScrollView, axis: ScrollAxis) -> Bool {
        let clipView = scrollView.contentView
        let documentSize = scrollView.documentView?.bounds.size ?? .zero
        let visibleSize = clipView.bounds.size

        switch axis {
        case .horizontal:
            return documentSize.width > visibleSize.width + 1
        case .vertical:
            return documentSize.height > visibleSize.height + 1
        }
    }

    private func scroll(_ scrollView: NSScrollView, deltaX: CGFloat, deltaY: CGFloat, scrollsX: Bool, scrollsY: Bool) {
        let clipView = scrollView.contentView
        let currentOrigin = clipView.bounds.origin
        let documentSize = scrollView.documentView?.bounds.size ?? .zero
        let visibleSize = clipView.bounds.size

        let maxX = max(0, documentSize.width - visibleSize.width)
        let maxY = max(0, documentSize.height - visibleSize.height)
        let nextX = scrollsX ? min(max(currentOrigin.x - deltaX, 0), maxX) : currentOrigin.x
        let verticalDelta = (scrollView.documentView?.isFlipped ?? true) ? deltaY : -deltaY
        let nextY = scrollsY ? min(max(currentOrigin.y + verticalDelta, 0), maxY) : currentOrigin.y

        guard nextX != currentOrigin.x || nextY != currentOrigin.y else { return }
        clipView.scroll(to: NSPoint(x: nextX, y: nextY))
        scrollView.reflectScrolledClipView(clipView)
    }
}

final class SubtleWorkspaceScroller: NSScroller {
    private var isHovering = false
    private var trackingAreaRef: NSTrackingArea?

    override class func scrollerWidth(for controlSize: NSControl.ControlSize, scrollerStyle: NSScroller.Style) -> CGFloat {
        return 13
    }

    private var isVerticalScroller: Bool {
        bounds.height >= bounds.width
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()

        if let trackingAreaRef {
            removeTrackingArea(trackingAreaRef)
        }

        let options: NSTrackingArea.Options = [
            .mouseEnteredAndExited,
            .activeInKeyWindow,
            .inVisibleRect
        ]

        let area = NSTrackingArea(rect: bounds, options: options, owner: self, userInfo: nil)
        trackingAreaRef = area
        addTrackingArea(area)
    }

    override func mouseEntered(with event: NSEvent) {
        isHovering = true
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.12
            animator().alphaValue = 0.86
        }
        needsDisplay = true
    }

    override func mouseExited(with event: NSEvent) {
        isHovering = false
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.18
            animator().alphaValue = 0.50
        }
        needsDisplay = true
    }

    override func drawKnobSlot(in slotRect: NSRect, highlight flag: Bool) {
        let insetX: CGFloat = isHovering ? (isVerticalScroller ? 2.5 : 2.0) : (isVerticalScroller ? 4.0 : 3.0)
        let insetY: CGFloat = isHovering ? (isVerticalScroller ? 2.0 : 2.5) : (isVerticalScroller ? 3.0 : 4.0)

        let trackRect = slotRect.insetBy(dx: insetX, dy: insetY)
        guard trackRect.width > 0, trackRect.height > 0 else { return }

        NSColor.labelColor.withAlphaComponent(isHovering ? 0.085 : 0.045).setFill()
        NSBezierPath(
            roundedRect: trackRect,
            xRadius: min(trackRect.width, trackRect.height) / 2,
            yRadius: min(trackRect.width, trackRect.height) / 2
        ).fill()
    }

    override func drawKnob() {
        let knobRect = rect(for: .knob)

        let insetX: CGFloat = isHovering ? (isVerticalScroller ? 1.5 : 1.0) : (isVerticalScroller ? 3.0 : 2.0)
        let insetY: CGFloat = isHovering ? (isVerticalScroller ? 1.0 : 1.5) : (isVerticalScroller ? 2.0 : 3.0)

        let visibleKnobRect = knobRect.insetBy(dx: insetX, dy: insetY)
        guard visibleKnobRect.width > 0, visibleKnobRect.height > 0 else { return }

        NSColor.labelColor.withAlphaComponent(isHighlighted || isHovering ? 0.52 : 0.30).setFill()
        NSBezierPath(
            roundedRect: visibleKnobRect,
            xRadius: min(visibleKnobRect.width, visibleKnobRect.height) / 2,
            yRadius: min(visibleKnobRect.width, visibleKnobRect.height) / 2
        ).fill()
    }
}

struct SoftStyledWorkspaceScrollView<Content: View>: NSViewRepresentable {
    let colorScheme: ColorScheme
    let expectedContentSize: CGSize
    let content: Content

    init(
        colorScheme: ColorScheme,
        expectedContentSize: CGSize,
        enablePinchZoom: Bool = false,
        zoomScale: Binding<CGFloat> = .constant(1.0),
        @ViewBuilder content: () -> Content
    ) {
        self.colorScheme = colorScheme
        self.expectedContentSize = expectedContentSize
        self.content = content()
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(rootView: AnyView(content))
    }

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSScrollView()
        scrollView.drawsBackground = false
        scrollView.borderType = .noBorder
        scrollView.autohidesScrollers = false
        scrollView.scrollerStyle = .overlay
        scrollView.usesPredominantAxisScrolling = false
        scrollView.horizontalScrollElasticity = .automatic
        scrollView.verticalScrollElasticity = .automatic

        let horizontalScroller = SubtleWorkspaceScroller()
        horizontalScroller.controlSize = .regular

        let verticalScroller = SubtleWorkspaceScroller()
        verticalScroller.controlSize = .regular

        scrollView.horizontalScroller = horizontalScroller
        scrollView.verticalScroller = verticalScroller
        scrollView.hasHorizontalScroller = false
        scrollView.hasVerticalScroller = false
        horizontalScroller.isHidden = true
        verticalScroller.isHidden = true
        horizontalScroller.alphaValue = 0
        verticalScroller.alphaValue = 0
        scrollView.documentView = context.coordinator.hostingView

        context.coordinator.refresh(in: scrollView, colorScheme: colorScheme, expectedContentSize: expectedContentSize)
        return scrollView
    }

    func updateNSView(_ nsView: NSScrollView, context: Context) {
        context.coordinator.hostingView.rootView = AnyView(content)
        DispatchQueue.main.async {
            context.coordinator.refresh(in: nsView, colorScheme: colorScheme, expectedContentSize: expectedContentSize)
        }
    }

    // AnyView on purpose: the generic NSHostingView<Content> destructor crashed the
    // Swift 6.3 optimizer (EarlyPerfInliner) while emitting the x86_64 slice of
    // Release/archive builds. Type-erasing keeps behaviour identical and sidesteps it.
    final class Coordinator {
        let hostingView: NSHostingView<AnyView>

        init(rootView: AnyView) {
            hostingView = NSHostingView(rootView: rootView)
            hostingView.frame.origin = .zero
        }

        // Explicit unoptimized deinit: the Swift 6.3 EarlyPerfInliner pass crashes
        // while optimizing this class's destructor in Release x86_64 builds.
        @_optimize(none) deinit {}

        func refresh(in scrollView: NSScrollView, colorScheme: ColorScheme, expectedContentSize: CGSize) {
            hostingView.layoutSubtreeIfNeeded()

            let fitting = hostingView.fittingSize
            let clipSize = scrollView.contentView.bounds.size
            let horizontalTolerance: CGFloat = 18
            let verticalTolerance: CGFloat = 24

            let needsHorizontal = expectedContentSize.width > clipSize.width + horizontalTolerance
            let needsVertical = expectedContentSize.height > clipSize.height + verticalTolerance

            scrollView.hasHorizontalScroller = needsHorizontal
            scrollView.hasVerticalScroller = needsVertical

            if !needsHorizontal && scrollView.contentView.bounds.origin.x != 0 {
                scrollView.contentView.scroll(to: NSPoint(x: 0, y: scrollView.contentView.bounds.origin.y))
                scrollView.reflectScrolledClipView(scrollView.contentView)
            }

            let targetSize = NSSize(
                width: max(expectedContentSize.width, fitting.width, clipSize.width),
                height: max(expectedContentSize.height, fitting.height, clipSize.height)
            )

            if hostingView.frame.size != targetSize {
                hostingView.frame = CGRect(origin: .zero, size: targetSize)
            } else {
                hostingView.frame.origin = .zero
            }

            style(scrollView.horizontalScroller, colorScheme: colorScheme, isVisible: needsHorizontal)
            style(scrollView.verticalScroller, colorScheme: colorScheme, isVisible: needsVertical)

            scrollView.reflectScrolledClipView(scrollView.contentView)
            scrollView.needsDisplay = true
            scrollView.horizontalScroller?.needsDisplay = true
            scrollView.verticalScroller?.needsDisplay = true
        }

        private func style(_ scroller: NSScroller?, colorScheme: ColorScheme, isVisible: Bool) {
            guard let scroller else { return }
            scroller.controlSize = .regular
            scroller.knobStyle = colorScheme == .dark ? .light : .dark
            scroller.isHidden = !isVisible
            scroller.alphaValue = isVisible ? 0.50 : 0
            scroller.needsDisplay = true
        }
    }
}


#else
private struct WorkspacePanSurface: View {
    var body: some View {
        Color.clear
            .allowsHitTesting(false)
    }
}

struct SoftStyledWorkspaceScrollView<Content: View>: View {
    let colorScheme: ColorScheme
    let expectedContentSize: CGSize
    let enablePinchZoom: Bool
    let content: Content
    @Binding var zoomScale: CGFloat
    @GestureState private var gestureScale: CGFloat = 1.0

    init(
        colorScheme: ColorScheme,
        expectedContentSize: CGSize,
        enablePinchZoom: Bool = false,
        zoomScale: Binding<CGFloat> = .constant(1.0),
        @ViewBuilder content: () -> Content
    ) {
        self.colorScheme = colorScheme
        self.expectedContentSize = expectedContentSize
        self.enablePinchZoom = enablePinchZoom
        self._zoomScale = zoomScale
        self.content = content()
    }

    var body: some View {
        let effectiveScale = enablePinchZoom ? min(max(zoomScale * gestureScale, 0.65), 1.75) : 1.0
        let zoomedSize = CGSize(
            width: max(expectedContentSize.width * effectiveScale, 1),
            height: max(expectedContentSize.height * effectiveScale, 1)
        )

        ScrollView([.horizontal, .vertical], showsIndicators: true) {
            content
                .frame(
                    minWidth: max(expectedContentSize.width, 1),
                    minHeight: max(expectedContentSize.height, 1),
                    alignment: .topLeading
                )
                .scaleEffect(effectiveScale, anchor: .topLeading)
                .frame(width: zoomedSize.width, height: zoomedSize.height, alignment: .topLeading)
        }
        .simultaneousGesture(
            MagnificationGesture()
                .updating($gestureScale) { value, state, _ in
                    guard enablePinchZoom else { return }
                    state = value
                }
                .onEnded { value in
                    guard enablePinchZoom else { return }
                    zoomScale = min(max(zoomScale * value, 0.65), 1.75)
                }
        )
    }
}
#endif

struct PhoneKartDropDelegate: DropDelegate {
    let item: KartTipi
    @Binding var order: [KartTipi]
    @Binding var draggedItem: KartTipi?
    var allCardsProvider: () -> [KartTipi]
    var onDropEnd: () -> Void

    private func ensureOrderReady() {
        let allCards = allCardsProvider()
        if order.isEmpty {
            order = allCards
            return
        }

        var seen: Set<KartTipi> = []
        var normalized: [KartTipi] = []

        for kart in order where allCards.contains(kart) && !seen.contains(kart) {
            seen.insert(kart)
            normalized.append(kart)
        }

        for kart in allCards where !seen.contains(kart) {
            seen.insert(kart)
            normalized.append(kart)
        }

        if normalized != order {
            order = normalized
        }
    }

    private func moveDraggedItem() {
        guard let draggedItem = draggedItem, draggedItem != item else { return }

        ensureOrderReady()

        guard let fromIndex = order.firstIndex(of: draggedItem),
              let toIndex = order.firstIndex(of: item) else { return }

        withAnimation(.interactiveSpring(response: 0.32, dampingFraction: 0.88, blendDuration: 0.08)) {
            let removed = order.remove(at: fromIndex)
            let adjustedToIndex = toIndex > fromIndex ? toIndex - 1 : toIndex
            order.insert(removed, at: adjustedToIndex)
        }
    }

    func dropEntered(info: DropInfo) {
        CardDragCoordinator.shared.markDropTargetReached()
        PlatformCursor.closedHandSet()
        moveDraggedItem()
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        if draggedItem != nil {
            CardDragCoordinator.shared.markDropTargetReached()
            PlatformCursor.closedHandSet()
            moveDraggedItem()
        }
        return DropProposal(operation: .move)
    }

    func performDrop(info: DropInfo) -> Bool {
        DispatchQueue.main.async {
            CardDragCoordinator.shared.endSession()
            self.onDropEnd()
        }
        return true
    }
}

struct CalismaAlaniDropDelegate: DropDelegate {
    @Binding var draggedItem: KartTipi?
    var onDropEnd: () -> Void

    func dropEntered(info: DropInfo) {
        if draggedItem != nil {
            CardDragCoordinator.shared.markDropTargetReached()
            PlatformCursor.closedHandSet()
        }
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        if draggedItem != nil {
            PlatformCursor.closedHandSet()
        }
        return DropProposal(operation: .move)
    }

    func dropExited(info: DropInfo) {
        if draggedItem != nil {
            PlatformCursor.closedHandSet()
        }
    }

    func performDrop(info: DropInfo) -> Bool {
        DispatchQueue.main.async {
            self.onDropEnd()
            PlatformCursor.arrowSet()
        }
        return true
    }
}

struct BosKolonDropDelegate: DropDelegate {
    let columnIndex: Int
    @Binding var layout: [[KartTipi]]
    @Binding var draggedItem: KartTipi?
    var onDropEnd: () -> Void

    private func moveDraggedItemToColumn() {
        guard let draggedItem = draggedItem,
              layout.indices.contains(columnIndex) else { return }

        var sourceColumn: Int?
        var sourceRow: Int?

        for column in layout.indices {
            if let row = layout[column].firstIndex(of: draggedItem) {
                sourceColumn = column
                sourceRow = row
                break
            }
        }

        guard let sourceColumn,
              let sourceRow,
              layout.indices.contains(sourceColumn) else { return }

        // Skip pointless moves when dropping into the same slot.
        if sourceColumn == columnIndex { return }

        withAnimation(.interactiveSpring(response: 0.38, dampingFraction: 0.88, blendDuration: 0.12)) {
            let removed = layout[sourceColumn].remove(at: sourceRow)
            layout[columnIndex].append(removed)
        }
    }

    func dropEntered(info: DropInfo) {
        if draggedItem != nil {
            CardDragCoordinator.shared.markDropTargetReached()
            PlatformCursor.closedHandSet()
        }
        moveDraggedItemToColumn()
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        if draggedItem != nil {
            CardDragCoordinator.shared.markDropTargetReached()
            PlatformCursor.closedHandSet()
            moveDraggedItemToColumn()
        }
        return DropProposal(operation: .move)
    }

    func performDrop(info: DropInfo) -> Bool {
        moveDraggedItemToColumn()

        DispatchQueue.main.async {
            CardDragCoordinator.shared.endSession()
            self.draggedItem = nil
            self.onDropEnd()
            PlatformCursor.arrowSet()
        }
        return true
    }
}


// Card colour swatches for the card options menu (English keys → SwiftUI colour, localized via t()).
private let cardColorSwatches: [(String, Color)] = [
    ("Default", .gray), ("Red", .red), ("Orange", .orange), ("Yellow", .yellow),
    ("Green", .green), ("Blue", .blue), ("Purple", .purple), ("Pink", .pink)
]

// Fixed meaning per card colour (English keys, localized via t()) — mirrors the web workspace.
private let cardColorMeanings: [(String, String)] = [
    ("Red", "Urgent"), ("Orange", "Waiting on customer"), ("Yellow", "Needs review"),
    ("Green", "Approved"), ("Blue", "In production"), ("Purple", "Finance"), ("Pink", "Special")
]

// Card size presets shared with the web block-customisation panel: S/M/L map to
// the same stored heights on every platform.
private let cardSizePresets: [(String, Double)] = [("S", 220), ("M", 380), ("L", 560)]

// Emoji dot per colour name for the iOS/iPad colour submenu rows.
private func cardColorEmoji(_ name: String) -> String {
    switch name {
    case "Red": return "🔴"
    case "Orange": return "🟠"
    case "Yellow": return "🟡"
    case "Green": return "🟢"
    case "Blue": return "🔵"
    case "Purple": return "🟣"
    case "Pink": return "🩷"
    default: return "⚪️"
    }
}

// S / M / L preset chip for the macOS card options popover.
private struct CardSizePresetChip: View {
    let label: String
    let isSelected: Bool
    let help: String
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(isSelected ? .white : .primary)
                .frame(width: 36, height: 26)
                .background(
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .fill(isSelected ? Color.blue : Color.primary.opacity(hovering ? 0.10 : 0.05))
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .help(help)
    }
}

// "Card size" submenu rows (iOS/iPad card menu + long-press context menu).
// Extracted into its own struct: deep inline nesting inside Menu builders can
// overflow the stack on real iPhones.
private struct CardSizeSubmenu: View {
    let seciliDil: String
    let storedHeight: Double?
    let showMatchColumn: Bool
    let onPreset: (Double) -> Void
    let onFitContent: () -> Void
    let onMatchColumn: () -> Void

    var body: some View {
        Menu {
            ForEach(cardSizePresets, id: \.0) { preset in
                Button {
                    onPreset(preset.1)
                } label: {
                    if storedHeight == preset.1 {
                        Label(preset.0, systemImage: "checkmark")
                    } else {
                        Text(preset.0)
                    }
                }
            }
            Divider()
            Button {
                onFitContent()
            } label: {
                Label(t("Fit content", lang: seciliDil), systemImage: "arrow.down.right.and.arrow.up.left")
            }
            if showMatchColumn {
                Button {
                    onMatchColumn()
                } label: {
                    Label(t("Match column", lang: seciliDil), systemImage: "rectangle.split.3x1")
                }
            }
        } label: {
            Label(t("Card size", lang: seciliDil), systemImage: "arrow.up.and.down")
        }
    }
}

// A clean, native-feeling macOS menu row: icon + label, full-width, subtle hover highlight.
private struct CardMenuRow: View {
    let title: String
    let systemImage: String
    var destructive: Bool = false
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: systemImage)
                    .font(.system(size: 13))
                    .frame(width: 18, alignment: .center)
                Text(title)
                    .font(.system(size: 13))
                Spacer(minLength: 0)
            }
            .foregroundColor(destructive ? .red : .primary)
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(hovering ? Color.primary.opacity(0.08) : Color.clear)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
    }
}

// A colour swatch (real colour dot) with a selection ring; "Default" shows as an empty ring.
private struct CardColorSwatch: View {
    let color: Color
    var isDefault: Bool = false
    let isSelected: Bool
    let help: String
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            ZStack {
                if isDefault {
                    Circle()
                        .stroke(Color.secondary.opacity(0.55), lineWidth: 1.5)
                        .frame(width: 19, height: 19)
                } else {
                    Circle()
                        .fill(color)
                        .frame(width: 19, height: 19)
                        .overlay(Circle().stroke(Color.black.opacity(0.08), lineWidth: 0.5))
                }
                if isSelected {
                    Circle()
                        .stroke(Color.primary.opacity(0.85), lineWidth: 2)
                        .frame(width: 25, height: 25)
                }
            }
            .frame(width: 27, height: 27)
            .scaleEffect(hovering ? 1.12 : 1.0)
            .animation(.spring(response: 0.2, dampingFraction: 0.6), value: hovering)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .help(help)
    }
}

struct DetayKarti<Content: View>: View {
    @Environment(\.colorScheme) var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    private var isPhoneLayout: Bool { horizontalSizeClass == .compact }
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    @AppStorage("workspaceCardsLockedV1") private var workspaceCardsLocked: Bool = false
    @AppStorage("studioFlowBillingPlanV1") private var storedBillingPlan: String = StudioBillingPlan.teamMonthly.rawValue
    // Workspace-shared colour meaning labels: companySettings.cardColorMeaningsJSON,
    // mirrored into UserDefaults by FirebaseManager's companySettings listener.
    @AppStorage("cardColorMeaningsJSON") private var cardColorMeaningsJSON: String = ""

    let title: String
    let iconName: String
    let kartTipi: KartTipi
    @Binding var yukseklik: Double?
    @Binding var sutunGenisligi: Double
    @Binding var draggedKart: KartTipi?
    var uiTetikleyici: Bool
    
    var kartRengi: String // Active card colour
    var minimumHeightOverride: Double? = nil
    var autoAdjustHeightOnContentChange: Bool = true
    var forceLayoutUnlocked: Bool = false
    var guideHighlightActive: Bool = false
    var guideOptionsHighlightActive: Bool = false
    var guideOptionsBubbleActive: Bool = false
    var onGuideOptionsDone: (() -> Void)? = nil
    
    var onHeightChangeEnd: () -> Void
    var onWidthChangeEnd: () -> Void
    var onHide: () -> Void
    var onColorChange: (String) -> Void
    var onEditHeadings: (() -> Void)? = nil
    var onExportInvoice: (() -> Void)? = nil
    var onExport: (() -> Void)? = nil
    var onQuickAdd: (() -> Void)? = nil
    var quickAddTooltip: String? = nil

    let content: Content
    
    @State private var initialHeight: Double = 0
    @State private var initialWidth: Double = 0
    @State private var minimumBoy: Double = 200
    @State private var lastMeasuredMinimumBoy: Double? = nil
    @State private var dragHandleHovering: Bool = false
    @State private var showCardOptionsPopover: Bool = false
    
    private let minKartBoyu: Double = 160
    private let previewMinBoyu: Double = 220
    private let ustBaslikAlani: Double = 54
    private let altTutamacAlani: Double = 16
    private let guvenlikPayi: Double = 18
    
    init(title: String, iconName: String, kartTipi: KartTipi, yukseklik: Binding<Double?>, sutunGenisligi: Binding<Double>, draggedKart: Binding<KartTipi?>, uiTetikleyici: Bool, kartRengi: String, minimumHeightOverride: Double? = nil, autoAdjustHeightOnContentChange: Bool = true, forceLayoutUnlocked: Bool = false, guideHighlightActive: Bool = false, guideOptionsHighlightActive: Bool = false, guideOptionsBubbleActive: Bool = false, onGuideOptionsDone: (() -> Void)? = nil, onHeightChangeEnd: @escaping () -> Void, onWidthChangeEnd: @escaping () -> Void, onHide: @escaping () -> Void, onColorChange: @escaping (String) -> Void, onEditHeadings: (() -> Void)? = nil, onExportInvoice: (() -> Void)? = nil, onExport: (() -> Void)? = nil, onQuickAdd: (() -> Void)? = nil, quickAddTooltip: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.iconName = iconName
        self.kartTipi = kartTipi
        self._yukseklik = yukseklik
        self._sutunGenisligi = sutunGenisligi
        self._draggedKart = draggedKart
        self.uiTetikleyici = uiTetikleyici
        self.kartRengi = kartRengi
        self.minimumHeightOverride = minimumHeightOverride
        self.autoAdjustHeightOnContentChange = autoAdjustHeightOnContentChange
        self.forceLayoutUnlocked = forceLayoutUnlocked
        self.guideHighlightActive = guideHighlightActive
        self.guideOptionsHighlightActive = guideOptionsHighlightActive
        self.guideOptionsBubbleActive = guideOptionsBubbleActive
        self.onGuideOptionsDone = onGuideOptionsDone
        self.onHeightChangeEnd = onHeightChangeEnd
        self.onWidthChangeEnd = onWidthChangeEnd
        self.onHide = onHide
        self.onColorChange = onColorChange
        self.onEditHeadings = onEditHeadings
        self.onExportInvoice = onExportInvoice
        self.onExport = onExport
        self.onQuickAdd = onQuickAdd
        self.quickAddTooltip = quickAddTooltip
        self.content = content()
    }
    
    // Dynamic card theme colour. Slightly more vivid custom tones are used; Pink in
    // particular is pulled towards a cleaner fuchsia so it does not read as dark red.
    private func temaRengi(_ renkAdi: String) -> Color {
        switch renkAdi {
        case t("Red", lang: seciliDil): return Color(red: 1.00, green: 0.24, blue: 0.24)
        case t("Orange", lang: seciliDil): return studioWarningOrange
        case t("Yellow", lang: seciliDil): return Color(red: 1.00, green: 0.82, blue: 0.12)
        case t("Green", lang: seciliDil): return Color(red: 0.18, green: 0.78, blue: 0.38)
        case t("Blue", lang: seciliDil): return Color(red: 0.20, green: 0.52, blue: 1.00)
        case t("Purple", lang: seciliDil): return Color(red: 0.62, green: 0.38, blue: 1.00)
        case t("Pink", lang: seciliDil): return Color(red: 1.00, green: 0.24, blue: 0.62)
        default: return Color.clear
        }
    }

    // Workspace overrides for the colour meanings, keyed by English colour name.
    // A key present with an empty string deliberately hides that colour's label;
    // a missing key falls back to the fixed default meaning (mirrors the web).
    private var sharedColorMeaningOverrides: [String: String] {
        guard let data = cardColorMeaningsJSON.data(using: .utf8),
              let dict = try? JSONDecoder().decode([String: String].self, from: data) else { return [:] }
        return dict
    }

    private func cardColorMeaning(for renk: String) -> String? {
        if let override = sharedColorMeaningOverrides[renk] {
            let temiz = override.trimmingCharacters(in: .whitespacesAndNewlines)
            return temiz.isEmpty ? nil : t(String(temiz.prefix(40)), lang: seciliDil)
        }
        guard let anlam = cardColorMeanings.first(where: { $0.0 == renk })?.1 else { return nil }
        return t(anlam, lang: seciliDil)
    }

    private var kartRengiAnlami: String? {
        guard let ingilizceAd = cardColorMeanings.first(where: { kartRengi == t($0.0, lang: seciliDil) })?.0 else { return nil }
        return cardColorMeaning(for: ingilizceAd)
    }

    // Dynamic card background colour
    private var bgColor: Color {
        if kartRengi == t("Default", lang: seciliDil) {
            return colorScheme == .dark ? Color.white.opacity(0.05) : Color.white
        }
        return temaRengi(kartRengi).opacity(colorScheme == .dark ? 0.18 : 0.14)
    }
    
    // Dynamic card border colour
    private var borderColor: Color {
        if kartRengi == t("Default", lang: seciliDil) { return Color.clear }
        return temaRengi(kartRengi).opacity(colorScheme == .dark ? 0.62 : 0.50)
    }

    // Neutral inner surface that keeps coloured cards readable: a soft panel behind
    // the content so the card colour stays visible while text and fields stand out.
    private var contentPanelFill: Color {
        if kartRengi == t("Default", lang: seciliDil) {
            return colorScheme == .dark ? Color.white.opacity(0.025) : Color.black.opacity(0.018)
        }
        return colorScheme == .dark ? Color.black.opacity(0.18) : Color.white.opacity(0.58)
    }

    private var contentPanelBorder: Color {
        if kartRengi == t("Default", lang: seciliDil) {
            return Color.primary.opacity(colorScheme == .dark ? 0.08 : 0.06)
        }
        return temaRengi(kartRengi).opacity(colorScheme == .dark ? 0.30 : 0.22)
    }

    private var cardHighlightOverlay: some View {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [
                        Color.white.opacity(colorScheme == .dark ? 0.06 : 0.08),
                        Color.clear,
                        Color.black.opacity(colorScheme == .dark ? 0.03 : 0.02)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .allowsHitTesting(false)
    }
    
    private var kartTipiMinimumBoyu: Double {
        switch kartTipi {
        case .repairIntake: return 430
        case .estimate: return 460
        case .customerPortal: return 420
        case .preview: return previewMinBoyu
        case .financial: return 430
        case .schedule: return 390
        case .clientFiles: return 360
        case .todo: return 360
        case .workTime: return 380
        case .status: return 260
        case .shipping: return 260
        case .notes, .customerNotes: return 220
        case .summary: return 210
        case .customer: return 260
        case .delivery: return 240
        case .materials: return 260
        case .priority: return 240
        case .communication: return 220
        case .historyLog: return 240
        case .invoiceItems: return 240
        }
    }

    private var etkiliMinimumBoy: Double {
        if let minimumHeightOverride {
            return Swift.max(minimumHeightOverride, kartTipiMinimumBoyu)
        }
        return Swift.max(minimumBoy, kartTipiMinimumBoyu)
    }
    private var etkiliYukseklik: Double { max(etkiliMinimumBoy, yukseklik ?? etkiliMinimumBoy) }
    private var shouldAutoAdjustHeightForContent: Bool {
        // Cards must not end up shorter than their content on Mac either. This used
        // to return false on macOS, and fixed height + clipping made card content
        // look cut off.
        return autoAdjustHeightOnContentChange
    }
    private func hesaplananMinimumBoy(icerikBoyu: Double) -> Double { if kartTipi == .preview { return previewMinBoyu }; let hesap = icerikBoyu + ustBaslikAlani + altTutamacAlani + guvenlikPayi; return max(minKartBoyu, ceil(hesap)) }
    private func sinirliYukseklik(_ deger: Double) -> Double { max(etkiliMinimumBoy, deger) }
    private func sinirliGenislik(_ deger: Double) -> Double { min(max(deger, 250), 800) }
    private var dragPreviewGenislik: CGFloat { CGFloat(sinirliGenislik(sutunGenisligi)) }
    private var dragPreviewYukseklik: CGFloat { CGFloat(min(max(etkiliYukseklik, 120), 260)) }

    private var silikKartDragPreview: some View {
        let handleHotspotX: CGFloat = 28
        let handleHotspotY: CGFloat = 28
        let cardWidth = dragPreviewGenislik
        let cardHeight = dragPreviewYukseklik
        let leadingSpace = max(cardWidth - (handleHotspotX * 2), 0)
        let topSpace = max(cardHeight - (handleHotspotY * 2), 0)
        let canvasWidth = leadingSpace + cardWidth
        let canvasHeight = topSpace + cardHeight

        return ZStack(alignment: .topLeading) {
            Color.clear
                .frame(width: canvasWidth, height: canvasHeight)

            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 10) {
                    Image(systemName: "line.3.horizontal")
                        .foregroundColor(.gray.opacity(0.55))
                        .font(.system(size: 16, weight: .semibold))
                        .padding(8)
                    Image(systemName: iconName)
                        .foregroundColor(.gray.opacity(0.85))
                    Text(title)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.primary.opacity(0.75))
                        .lineLimit(1)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 12)
                .padding(.top, 12)
                .padding(.bottom, 10)

                VStack(alignment: .leading, spacing: 10) {
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(Color.primary.opacity(colorScheme == .dark ? 0.16 : 0.10))
                        .frame(height: 8)
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(Color.primary.opacity(colorScheme == .dark ? 0.12 : 0.08))
                        .frame(width: cardWidth * 0.62, height: 8)
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(Color.primary.opacity(colorScheme == .dark ? 0.10 : 0.06))
                        .frame(width: cardWidth * 0.42, height: 8)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 14)
            }
            .frame(width: cardWidth, height: cardHeight, alignment: .topLeading)
            .background(bgColor.opacity(colorScheme == .dark ? 0.82 : 0.92))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(borderColor.opacity(0.75), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .shadow(color: Color.black.opacity(0.18), radius: 14, x: 0, y: 8)
            .opacity(0.72)
            .allowsHitTesting(false)
            .offset(x: leadingSpace, y: topSpace)
        }
        .allowsHitTesting(false)
    }

    private var canCustomizeThisCard: Bool {
        let plan = StudioBillingPlan(rawValue: storedBillingPlan) ?? .teamMonthly
        return plan.entitlements.cardCustomizationEnabled
    }

    private var effectiveWorkspaceCardsLocked: Bool {
        workspaceCardsLocked && !forceLayoutUnlocked
    }

    @ViewBuilder
    private var kartContextMenuActions: some View {
        Button(role: .destructive) {
            withAnimation(.snappy) { onHide() }
        } label: {
            Label(t("Hide Block", lang: seciliDil), systemImage: "eye.slash")
        }

        if let onEditHeadings {
            Button {
                onEditHeadings()
            } label: {
                Label(t("Edit Block Headings", lang: seciliDil), systemImage: "textformat")
            }
        }

        if let onExportInvoice {
            Button {
                onExportInvoice()
            } label: {
                Label(t("Invoice PDF", lang: seciliDil), systemImage: "doc.text.fill")
            }
        }

        if let onExport {
            Button {
                onExport()
            } label: {
                Label(t("Export", lang: seciliDil), systemImage: "square.and.arrow.up")
            }
        }

        Divider()

        if canCustomizeThisCard {
            CardSizeSubmenu(
                seciliDil: seciliDil,
                storedHeight: yukseklik,
                showMatchColumn: !isPhoneLayout,
                onPreset: { applyCardSizePreset($0) },
                onFitContent: { applyFitContent() },
                onMatchColumn: { sendMatchColumnRequest() }
            )
            #if os(macOS)
            Button {
                onColorChange(t("Default", lang: seciliDil))
            } label: {
                Label(t("Default", lang: seciliDil), systemImage: "circle")
            }
            ForEach(cardColorMeanings, id: \.0) { renk in
                Button {
                    onColorChange(t(renk.0, lang: seciliDil))
                } label: {
                    Label(t(renk.0, lang: seciliDil), systemImage: "circle.fill")
                    if let anlam = cardColorMeaning(for: renk.0) {
                        Text(anlam)
                    }
                }
            }
            #else
            Menu("🎨 " + t("Color", lang: seciliDil)) {
                Button("⚪️ " + t("Default", lang: seciliDil)) { onColorChange(t("Default", lang: seciliDil)) }
                ForEach(cardColorMeanings, id: \.0) { renk in
                    Button {
                        onColorChange(t(renk.0, lang: seciliDil))
                    } label: {
                        Text(cardColorEmoji(renk.0) + " " + t(renk.0, lang: seciliDil))
                        if let anlam = cardColorMeaning(for: renk.0) {
                            Text(anlam)
                        }
                    }
                }
            }
            #endif
            Button {
                resetCardCustomization()
            } label: {
                Label(t("Reset", lang: seciliDil), systemImage: "arrow.counterclockwise")
            }
        } else {
            Label(t("Card moving, resizing and colours are available from NivaDesk Lite.", lang: seciliDil), systemImage: "lock.fill")
        }
    }

    private var lockedCardHandle: some View {
        Image(systemName: "lock.fill")
            .foregroundColor(.secondary)
            .font(.system(size: 15, weight: .semibold))
            .frame(width: 42, height: 38)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(Color.primary.opacity(0.055))
            )
            .help(t("Layout locked", lang: seciliDil))
            .accessibilityLabel(t("Layout locked", lang: seciliDil))
    }

    @ViewBuilder
    private var phoneMoveMenuHandle: some View {
        Menu {
            Button {
                sendPhoneMoveRequest("top")
            } label: {
                Label(t("Move to top", lang: seciliDil), systemImage: "arrow.up.to.line")
            }

            Button {
                sendPhoneMoveRequest("up")
            } label: {
                Label(t("Move up", lang: seciliDil), systemImage: "arrow.up")
            }

            Button {
                sendPhoneMoveRequest("down")
            } label: {
                Label(t("Move down", lang: seciliDil), systemImage: "arrow.down")
            }

            Button {
                sendPhoneMoveRequest("bottom")
            } label: {
                Label(t("Move to bottom", lang: seciliDil), systemImage: "arrow.down.to.line")
            }
        } label: {
            Image(systemName: "line.3.horizontal")
                .foregroundColor(.blue.opacity(0.85))
                .font(.system(size: 16, weight: .semibold))
                .padding(8)
                .background(Color.blue.opacity(0.10))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .contentShape(Rectangle())
        }
        .menuStyle(.borderlessButton)
        .simultaneousGesture(
            TapGesture().onEnded {
                PlatformHaptics.lightSelection()
            }
        )
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.15).onEnded { _ in
                PlatformHaptics.lightSelection()
            }
        )
    }

    private func sendPhoneMoveRequest(_ action: String) {
        NotificationCenter.default.post(
            name: .phoneCardMoveRequested,
            object: nil,
            userInfo: [
                "card": kartTipi.rawValue,
                "action": action
            ]
        )
    }

    // S / M / L presets write the same stored height the drag-resize handle
    // writes, then persist through onHeightChangeEnd — the exact pipeline the
    // continuous resize uses (kaydetKartYukseklikleri upstream).
    private func applyCardSizePreset(_ boy: Double) {
        withAnimation(.snappy) { yukseklik = boy }
        initialHeight = 0
        onHeightChangeEnd()
    }

    // "Fit content": clear the stored height so the card returns to the
    // measured automatic height (the existing auto-size pass re-measures it).
    private func applyFitContent() {
        withAnimation(.snappy) { yukseklik = nil }
        initialHeight = 0
        onHeightChangeEnd()
    }

    // "Match column": handled by the parent workspace view, which owns the
    // desktop column layout. Hidden on iPhone (single-column ordering).
    private func sendMatchColumnRequest() {
        NotificationCenter.default.post(
            name: .cardSizeActionRequested,
            object: nil,
            userInfo: [
                "card": kartTipi.rawValue,
                "action": "matchColumn",
                "height": etkiliYukseklik
            ]
        )
    }

    // Per-card reset: automatic height + Default colour. Position is left
    // alone — reset must never scatter someone's board (mirrors the web).
    private func resetCardCustomization() {
        withAnimation(.snappy) { yukseklik = nil }
        initialHeight = 0
        onHeightChangeEnd()
        onColorChange(t("Default", lang: seciliDil))
    }
    private func makeCardDragProvider() -> NSItemProvider {
        let sessionID = CardDragCoordinator.shared.beginSession()

        self.draggedKart = kartTipi
        PlatformCursor.closedHandSet()

        // Short auto-cancel windows could clear the drag state before the card was
        // dropped in a large workspace. The drop delegate cleans up successful drops;
        // this is only a long safety cleanup for cancelled drags.
        DispatchQueue.main.asyncAfter(deadline: .now() + 30.0) {
            if CardDragCoordinator.shared.sessionID == sessionID,
               draggedKart == kartTipi {
                withAnimation(.easeOut(duration: 0.16)) {
                    draggedKart = nil
                }
                CardDragCoordinator.shared.endSession()
                PlatformCursor.arrowSet()
            }
        }

        let provider = NSItemProvider(object: kartTipi.rawValue as NSString)
        provider.suggestedName = kartTipi.rawValue
        return provider
    }

    @ViewBuilder
    private var desktopDragHandle: some View {
        #if os(macOS)
        desktopDragHandleContent
            .onDrag {
                makeCardDragProvider()
            }
        #else
        desktopDragHandleContent
            .onDrag {
                makeCardDragProvider()
            } preview: {
                silikKartDragPreview
            }
        #endif
    }

    private var desktopDragHandleContent: some View {
        Image(systemName: "line.3.horizontal")
            .foregroundColor(dragHandleHovering ? Color.blue.opacity(0.95) : Color.gray.opacity(0.58))
            .font(.system(size: 17, weight: .semibold))
            .frame(width: 42, height: 38)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(dragHandleHovering ? Color.blue.opacity(0.12) : Color.primary.opacity(0.001))
            )
            .contentShape(Rectangle())
            .onHover { hover in
                dragHandleHovering = hover
                if hover {
                    if draggedKart != nil {
                        PlatformCursor.closedHandSet()
                    } else {
                        PlatformCursor.openHandSet()
                    }
                } else {
                    if draggedKart != nil {
                        PlatformCursor.closedHandSet()
                    } else {
                        PlatformCursor.arrowSet()
                    }
                }
            }
            .onChange(of: draggedKart) { _, yeniDeger in
                if yeniDeger != nil {
                    PlatformCursor.closedHandSet()
                } else if dragHandleHovering {
                    PlatformCursor.openHandSet()
                } else {
                    PlatformCursor.arrowSet()
                }
            }
    }

    @ViewBuilder
    private var cardOptionsControl: some View {
        #if os(macOS)
        Button {
            showCardOptionsPopover.toggle()
        } label: {
            cardOptionsIcon
        }
        .buttonStyle(.plain)
        .popover(isPresented: $showCardOptionsPopover, arrowEdge: .bottom) {
            macCardOptionsMenu
        }
        #else
        Menu {
            kartContextMenuActions
        } label: {
            cardOptionsIcon
        }
        .menuStyle(.borderlessButton)
        #endif
    }

    #if os(macOS)
    // "Card size" section of the options popover: S/M/L preset chips, fit to
    // content, and column matching (desktop columns only).
    @ViewBuilder
    private var macCardSizeSection: some View {
        Text(t("Card size", lang: seciliDil))
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(.secondary)
            .padding(.horizontal, 10)
            .padding(.bottom, 6)
        HStack(spacing: 6) {
            ForEach(cardSizePresets, id: \.0) { preset in
                CardSizePresetChip(
                    label: preset.0,
                    isSelected: yukseklik == preset.1,
                    help: preset.0 + " — " + String(Int(preset.1))
                ) {
                    showCardOptionsPopover = false
                    applyCardSizePreset(preset.1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 10)
        .padding(.bottom, 2)
        CardMenuRow(title: t("Fit content", lang: seciliDil), systemImage: "arrow.down.right.and.arrow.up.left") {
            showCardOptionsPopover = false
            applyFitContent()
        }
        if !isPhoneLayout {
            CardMenuRow(title: t("Match column", lang: seciliDil), systemImage: "rectangle.split.3x1") {
                showCardOptionsPopover = false
                sendMatchColumnRequest()
            }
        }
    }

    @ViewBuilder
    private var macCardOptionsMenu: some View {
        VStack(alignment: .leading, spacing: 1) {
            CardMenuRow(title: t("Hide Block", lang: seciliDil), systemImage: "eye.slash", destructive: true) {
                showCardOptionsPopover = false
                withAnimation(.snappy) { onHide() }
            }
            if let onEditHeadings {
                CardMenuRow(title: t("Edit Block Headings", lang: seciliDil), systemImage: "textformat") {
                    showCardOptionsPopover = false
                    onEditHeadings()
                }
            }
            if let onExportInvoice {
                CardMenuRow(title: t("Invoice PDF", lang: seciliDil), systemImage: "doc.text") {
                    showCardOptionsPopover = false
                    onExportInvoice()
                }
            }
            if let onExport {
                CardMenuRow(title: t("Export", lang: seciliDil), systemImage: "square.and.arrow.up") {
                    showCardOptionsPopover = false
                    onExport()
                }
            }

            if canCustomizeThisCard {
                Divider().padding(.horizontal, 6).padding(.top, 5).padding(.bottom, 6)
                macCardSizeSection
                Divider().padding(.horizontal, 6).padding(.vertical, 5)
                Text(t("Card Colour", lang: seciliDil))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 10)
                    .padding(.bottom, 6)
                HStack(spacing: 6) {
                    ForEach(cardColorSwatches, id: \.0) { pair in
                        CardColorSwatch(
                            color: pair.1,
                            isDefault: pair.0 == "Default",
                            isSelected: kartRengi == t(pair.0, lang: seciliDil),
                            help: cardColorMeaning(for: pair.0).map { t(pair.0, lang: seciliDil) + " — " + $0 } ?? t(pair.0, lang: seciliDil)
                        ) {
                            onColorChange(t(pair.0, lang: seciliDil))
                            showCardOptionsPopover = false
                        }
                    }
                }
                .padding(.horizontal, 10)
                .padding(.bottom, 4)
                if let kartRengiAnlami {
                    Text(kartRengiAnlami)
                        .font(.system(size: 10.5, weight: .semibold))
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 10)
                        .padding(.top, 4)
                }
                Divider().padding(.horizontal, 6).padding(.vertical, 5)
                CardMenuRow(title: t("Reset", lang: seciliDil), systemImage: "arrow.counterclockwise") {
                    showCardOptionsPopover = false
                    resetCardCustomization()
                }
            } else {
                Divider().padding(.horizontal, 6).padding(.vertical, 6)
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "lock.fill").font(.system(size: 11)).foregroundColor(.secondary)
                    Text(t("Card moving, resizing and colours are available from NivaDesk Lite.", lang: seciliDil))
                        .font(.system(size: 11)).foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 10).padding(.bottom, 8)
            }
        }
        .padding(6)
        .frame(width: 290)
    }
    #endif

    @ViewBuilder
    private var cardOptionsGuideFloatingCallout: some View {
        #if os(macOS)
        if guideOptionsBubbleActive {
            StudioFirstRunGuideBubble(
                stepText: "7 / 7",
                title: t("Card actions", lang: seciliDil),
                message: t("Click the three-dot button to hide this card, edit its block headings, export when available, and change the card colour.", lang: seciliDil),
                primaryTitle: t("Done", lang: seciliDil),
                secondaryTitle: t("Skip", lang: seciliDil),
                onPrimary: {
                    showCardOptionsPopover = false
                    onGuideOptionsDone?()
                },
                onSkip: {
                    showCardOptionsPopover = false
                    onGuideOptionsDone?()
                }
            )
            .frame(width: 330, alignment: .leading)
            .offset(x: -24, y: 64)
            .zIndex(1000)
            .allowsHitTesting(true)
        }
        #endif
    }

    private var cardOptionsIcon: some View {
        Image(systemName: guideOptionsHighlightActive ? "ellipsis.circle.fill" : "ellipsis.circle")
            .font(.system(size: 16, weight: .semibold))
            .foregroundColor(guideOptionsHighlightActive ? .blue : .gray.opacity(0.75))
            .padding(8)
            .background(
                Circle()
                    .fill(guideOptionsHighlightActive ? Color.blue.opacity(0.12) : Color.clear)
            )
            .overlay(
                Circle()
                    .stroke(guideOptionsHighlightActive ? Color.blue : Color.clear, lineWidth: guideOptionsHighlightActive ? 3 : 0)
                    .shadow(color: Color.blue.opacity(guideOptionsHighlightActive ? 0.45 : 0), radius: 10, x: 0, y: 0)
            )
            .contentShape(Rectangle())
    }

    var body: some View {
        let controlledContentHeight = max(90, CGFloat(etkiliYukseklik - ustBaslikAlani - altTutamacAlani - 46))

        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                if effectiveWorkspaceCardsLocked || !canCustomizeThisCard {
                    lockedCardHandle
                } else if isPhoneLayout {
                    phoneMoveMenuHandle
                } else {
                    desktopDragHandle
                }

                // Title area opens the menu; no dragging here.
                HStack(spacing: 10) {
                    Image(systemName: iconName)
                        .foregroundColor(.gray)
                    Text(title)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.primary)
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
                #if !os(macOS)
                .contextMenu {
                    kartContextMenuActions
                }
                #endif

                if let onQuickAdd {
                    Button(action: onQuickAdd) {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.blue)
                    }
                    .buttonStyle(.plain)
                    .help(quickAddTooltip ?? "Add")
                }

                if let kartRengiAnlami {
                    Text(kartRengiAnlami)
                        .font(.system(size: 10, weight: .heavy))
                        .foregroundColor(.white)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 3.5)
                        .background(temaRengi(kartRengi))
                        .clipShape(Capsule())
                }

                // Give iPad a clear menu target instead of long-press.
                cardOptionsControl
            }
            .padding(.horizontal, 12)
            .padding(.top, 12)
            .padding(.bottom, 10)
            
            Group {
                if kartTipi == .preview {
                    VStack(alignment: .leading, spacing: 15) { content }
                        .fixedSize(horizontal: false, vertical: true)
                        .layoutPriority(1)
                        .frame(maxWidth: .infinity, alignment: .top)
                        .padding(.horizontal, 20)
                        .padding(.bottom, 10)
                        .background(WorkspacePanSurface())
                        .background(
                            GeometryReader { geo in
                                Color.clear.preference(key: IcerikBoyuKey.self, value: Double(geo.size.height))
                            }
                        )
                } else if shouldAutoAdjustHeightForContent {
                    VStack(alignment: .leading, spacing: 15) { content }
                        .fixedSize(horizontal: false, vertical: true)
                        .layoutPriority(1)
                        .frame(maxWidth: .infinity, alignment: .top)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 14)
                        .background(WorkspacePanSurface())
                        .background(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(contentPanelFill)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .stroke(contentPanelBorder, lineWidth: 1)
                                )
                        )
                        .padding(.horizontal, 12)
                        .padding(.bottom, 10)
                        .background(
                            GeometryReader { geo in
                                Color.clear.preference(key: IcerikBoyuKey.self, value: Double(geo.size.height))
                            }
                        )
                } else {
                    VStack(alignment: .leading, spacing: 15) { content }
                        .frame(maxWidth: .infinity, maxHeight: controlledContentHeight, alignment: .top)
                        .clipped()
                        .padding(.horizontal, 18)
                        .padding(.vertical, 14)
                        .background(WorkspacePanSurface())
                        .background(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(contentPanelFill)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .stroke(contentPanelBorder, lineWidth: 1)
                                )
                        )
                        .padding(.horizontal, 12)
                        .padding(.bottom, 10)
                        .background(
                            GeometryReader { _ in
                                Color.clear.preference(key: IcerikBoyuKey.self, value: minimumHeightOverride ?? minKartBoyu)
                            }
                        )
                }
            }
            
            Spacer(minLength: 0)
                .frame(maxWidth: .infinity)
                .background(WorkspacePanSurface())
            
            if effectiveWorkspaceCardsLocked || !canCustomizeThisCard {
                Color.clear
                    .frame(height: 8)
            } else {
                ZStack(alignment: .center) {
                    Rectangle().fill(Color.clear).frame(height: 16)
                    Capsule().fill(Color.gray.opacity(0.3)).frame(width: 40, height: 4)
                }
                .frame(maxWidth: .infinity)
                .contentShape(Rectangle())
                .onHover { hover in if hover { PlatformCursor.resizeUpDownPush() } else { PlatformCursor.pop() } }
                .gesture(
                    DragGesture(coordinateSpace: .global)
                        .onChanged { val in
                            if initialHeight == 0 { initialHeight = etkiliYukseklik }
                            let yeniYukseklik = initialHeight + Double(val.translation.height)
                            yukseklik = sinirliYukseklik(yeniYukseklik)
                        }
                        .onEnded { _ in
                            yukseklik = etkiliYukseklik
                            initialHeight = 0
                            onHeightChangeEnd()
                        }
                )
            }
        }
        .onPreferenceChange(IcerikBoyuKey.self) { boy in
            DispatchQueue.main.async {
                // Some cards, such as History / Log, contain an internal ScrollView whose height is
                // intentionally tied to the current card height. Measuring that content again as the
                // card minimum creates a feedback loop where the card keeps growing by itself.
                // For those cards we use the explicit override as the stable minimum and only respect
                // manual resizing above that value.
                if let fixedMinimum = minimumHeightOverride {
                    let oncekiMinimum = lastMeasuredMinimumBoy
                    let mevcutYukseklik = yukseklik ?? fixedMinimum
                    let tolerans = 4.0
                    let minimumDegisti = abs(minimumBoy - fixedMinimum) > 0.5 || (oncekiMinimum.map { abs($0 - fixedMinimum) > 0.5 } ?? true)

                    if minimumDegisti {
                        minimumBoy = fixedMinimum
                        lastMeasuredMinimumBoy = fixedMinimum
                    }

                    if let currentHeight = yukseklik {
                        if currentHeight < fixedMinimum - 0.5 {
                            yukseklik = fixedMinimum
                        } else if (kartTipi == .workTime || kartTipi == .historyLog),
                                  let oncekiMinimum,
                                  fixedMinimum < oncekiMinimum - 0.5,
                                  mevcutYukseklik <= oncekiMinimum + tolerans {
                            withAnimation(.snappy) {
                                yukseklik = fixedMinimum
                            }
                            onHeightChangeEnd()
                        }
                    } else {
                        yukseklik = fixedMinimum
                    }
                    return
                }

                let yeniMinimum = hesaplananMinimumBoy(icerikBoyu: boy)
                let oncekiMinimum = lastMeasuredMinimumBoy
                let mevcutYukseklik = yukseklik ?? minimumBoy
                let tolerans = 4.0
                var hedefYukseklik: Double? = nil
                let minimumDegisti = abs(minimumBoy - yeniMinimum) > 0.5 || (oncekiMinimum.map { abs($0 - yeniMinimum) > 0.5 } ?? true)

                // When content grows, the card always grows to fit it.
                if mevcutYukseklik < yeniMinimum - 0.5 {
                    hedefYukseklik = yeniMinimum
                }

                // When content shrinks, the card auto-shrinks only if it was near the
                // automatic size — so deleting a heading leaves no dead space, while a
                // deliberately enlarged card keeps its size.
                if let oncekiMinimum, yeniMinimum < oncekiMinimum - 0.5 {
                    let kartOtomatikOlcudeydi = mevcutYukseklik <= oncekiMinimum + tolerans
                    if kartOtomatikOlcudeydi {
                        hedefYukseklik = yeniMinimum
                    }
                }

                if !minimumDegisti, hedefYukseklik == nil, yukseklik != nil {
                    return
                }

                if minimumDegisti {
                    minimumBoy = yeniMinimum
                    lastMeasuredMinimumBoy = yeniMinimum
                }

                if let hedefYukseklik, abs((yukseklik ?? -1) - hedefYukseklik) > 0.5 {
                    withAnimation(.snappy) {
                        yukseklik = hedefYukseklik
                    }

                    // Skip the first measurement; only store new heights on real content changes.
                    if oncekiMinimum != nil {
                        onHeightChangeEnd()
                    }
                } else if yukseklik == nil {
                    yukseklik = yeniMinimum
                }
            }
        }
        .frame(height: etkiliYukseklik, alignment: .top)
        .background(WorkspacePanSurface())
        .background(bgColor)
        .background(cardHighlightOverlay)
        .cornerRadius(12)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(borderColor, lineWidth: 1.5))
        .overlay {
            if guideHighlightActive {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.blue, lineWidth: 3)
                    .shadow(color: Color.blue.opacity(0.45), radius: 14, x: 0, y: 0)
                    .padding(-5)
                    .allowsHitTesting(false)
            }
        }
        .shadow(color: colorScheme == .dark ? .clear : Color.black.opacity(0.03), radius: 5, y: 2)
        .opacity(draggedKart == kartTipi ? 0.86 : 1.0)
        .animation(.snappy, value: kartRengi)
        .clipped()
        .overlay(alignment: .topTrailing) {
            cardOptionsGuideFloatingCallout
        }
        .overlay(alignment: .trailing) {
            if !isPhoneLayout && !effectiveWorkspaceCardsLocked {
                Rectangle()
                    .fill(Color.clear)
                    .frame(width: 8)
                    .contentShape(Rectangle())
                    .onHover { hover in if hover { PlatformCursor.resizeLeftRightPush() } else { PlatformCursor.pop() } }
                    .gesture(
                        DragGesture(coordinateSpace: .global)
                            .onChanged { val in
                                if initialWidth == 0 { initialWidth = sutunGenisligi }
                                let hedefGenislik = sinirliGenislik(initialWidth + Double(val.translation.width))
                                withAnimation(.interactiveSpring(response: 0.22, dampingFraction: 0.9, blendDuration: 0.05)) {
                                    sutunGenisligi = hedefGenislik
                                }
                            }
                            .onEnded { _ in
                                initialWidth = 0
                                onWidthChangeEnd()
                            }
                    )
            }
        }
        .overlay(alignment: .bottomTrailing) {
            if !isPhoneLayout && !effectiveWorkspaceCardsLocked {
                Image(systemName: "circle.grid.2x2.fill")
                    .font(.system(size: 11))
                    .foregroundColor(.gray.opacity(0.3))
                    .padding(12)
                    .contentShape(Rectangle())
                    .onHover { hover in if hover { PlatformCursor.crosshairPush() } else { PlatformCursor.pop() } }
                    .gesture(
                        DragGesture(coordinateSpace: .global)
                            .onChanged { val in
                                if initialHeight == 0 { initialHeight = etkiliYukseklik }
                                if initialWidth == 0 { initialWidth = sutunGenisligi }
                                let hedefYukseklik = sinirliYukseklik(initialHeight + Double(val.translation.height))
                                let hedefGenislik = sinirliGenislik(initialWidth + Double(val.translation.width))
                                withAnimation(.interactiveSpring(response: 0.22, dampingFraction: 0.9, blendDuration: 0.05)) {
                                    yukseklik = hedefYukseklik
                                    sutunGenisligi = hedefGenislik
                                }
                            }
                            .onEnded { _ in
                                yukseklik = etkiliYukseklik
                                initialHeight = 0
                                initialWidth = 0
                                onHeightChangeEnd()
                                onWidthChangeEnd()
                            }
                    )
            }
        }
    }
}

// Clean, customer-facing invoice. Shows only VAT (never internal Corporation Tax,
// costs or profit). Margin-scheme orders show a single TOTAL; zero-rated/export
// orders show "VAT (Zero-rated / Export) 0%".
struct OrderInvoicePDFView: View {
    let siparis: Siparis
    var logoImage: PlatformImage?
    var businessName: String
    var companyNumbers: [CompanyNumberSettingDTO]
    var invoiceNumber: String
    var sembol: String
    var ondalik: String
    var seciliDil: String
    var footerNote: String
    var showAddress: Bool = true
    var showShippingAddress: Bool = true
    var itemsHeading: String = ""
    // When set, this prints as an estimate instead of an invoice, using the
    // figures frozen on the record rather than the order's current ones.
    var estimate: OrderEstimateRecord? = nil
    // ImageRenderer cannot fetch a remote image, so the signature arrives
    // already downloaded.
    var signatureImage: PlatformImage? = nil

    private var isEstimate: Bool { estimate != nil }
    private var printedDocumentDate: Date {
        if let estimate, estimate.createdAtMs > 0 { return Date(timeIntervalSince1970: estimate.createdAtMs / 1000) }
        return siparis.paymentDate
    }
    private var printedLineItems: [LineItem] { estimate?.lineItems ?? (siparis.lineItems ?? []) }
    private var hasPrintedLineItems: Bool { isEstimate ? !printedLineItems.isEmpty : siparis.hasLineItems }

    // Column header for the items table — customizable per workspace, else "Description".
    private var resolvedItemsColumnHeading: String {
        let h = itemsHeading.trimmingCharacters(in: .whitespacesAndNewlines)
        return h.isEmpty ? t("Description", lang: seciliDil) : h
    }
    private func qtyText(_ q: Double) -> String {
        q.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(q)) : String(format: "%.2f", q)
    }

    private var billingAddressText: String {
        let a = siparis.customFields?["communicationAddress"] ?? siparis.customFields?["Address"] ?? ""
        return a.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    private var shippingAddressText: String {
        [siparis.shippingStreetAddress, siparis.shippingCity, siparis.shippingPostalCode, siparis.shippingCountry]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: ", ")
    }
    private var shippingRecipient: String {
        let n = siparis.shippingName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return n.isEmpty ? siparis.customerName : n
    }

    // Invoice total: when the user added named line items, the invoice bills
    // exactly those items — the order's paid/remaining figures stay off the
    // invoice entirely. Orders without line items keep the classic order value.
    private var orderValue: Double {
        if let estimate { return estimate.total }
        return siparis.hasLineItems ? siparis.lineItemsTotal : siparis.salesTotal
    }
    private var printedTaxRate: Double { estimate?.taxRate ?? siparis.taxRate }
    private var isMarginScheme: Bool { (estimate?.taxType ?? siparis.taxType) == "Profit" }
    private var isZeroRated: Bool { printedTaxRate <= 0.0001 }
    private var vatAmount: Double {
        // An estimate prints the amount frozen on the record; nothing is
        // recomputed, or the paper drifts from what the customer agreed to.
        if let estimate { return estimate.taxAmount }
        // Line-item invoices recompute VAT on the item total with the order's
        // rate, extracted from the gross the same way the server does;
        // otherwise the stored order-level tax amount is used as before.
        return siparis.hasLineItems ? kdvBrutten(siparis.taxRate, orderValue) : siparis.taxAmount
    }
    private var subtotal: Double {
        if let estimate { return estimate.subtotal }
        return isMarginScheme ? orderValue : orderValue - vatAmount
    }
    // The record freezes its currency: printing today's workspace symbol on an
    // estimate agreed last year would be wrong.
    private func money(_ v: Double) -> String {
        let symbol = (estimate?.currency).flatMap { $0.isEmpty ? nil : $0 } ?? sembol
        return "\(symbol)\(formatFiyat(v, ondalik: ondalik))"
    }

    private func estimateStampText(_ ms: Double) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "dd/MM/yy HH:mm"
        return formatter.string(from: Date(timeIntervalSince1970: ms / 1000))
    }

    @ViewBuilder
    private func estimatePdfRow(_ label: String, _ value: String) -> some View {
        HStack(spacing: 8) {
            Text(label).font(.system(size: 11)).foregroundColor(.gray)
            Spacer()
            Text(value.isEmpty ? "-" : value).font(.system(size: 11, weight: .semibold))
        }
    }

    private func totalRow(_ label: String, _ value: String, bold: Bool = false, color: Color = .primary) -> some View {
        HStack {
            Text(label).font(.system(size: bold ? 14 : 11, weight: bold ? .bold : .regular)).foregroundColor(bold ? .primary : .gray)
            Spacer()
            Text(value).font(.system(size: bold ? 16 : 12, weight: bold ? .bold : .semibold)).foregroundColor(color)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    if let logo = logoImage {
                        Image(platformImage: logo)
                            .resizable()
                            .scaledToFit()
                            .frame(maxWidth: 240, maxHeight: 64, alignment: .leading)
                    }
                    Text(businessName).font(.system(size: 15, weight: .bold))
                    ForEach(companyNumbers) { num in
                        if !num.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            Text("\(num.title): \(num.value)").font(.system(size: 10)).foregroundColor(.gray)
                        }
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 5) {
                    Text(t(isEstimate ? "ESTIMATE" : "INVOICE", lang: seciliDil)).font(.system(size: 32, weight: .heavy)).foregroundColor(.gray.opacity(0.35))
                    Text("\(t(isEstimate ? "Estimate No" : "Invoice No", lang: seciliDil)): \(estimate?.number ?? invoiceNumber)").font(.system(size: 12, weight: .semibold))
                    Text("\(t("Date", lang: seciliDil)): \(printedDocumentDate.formatted(date: .abbreviated, time: .omitted))").font(.system(size: 12)).foregroundColor(.gray)
                    if let estimate, estimate.validUntilMs > 0 {
                        Text("\(t("Valid Until", lang: seciliDil)): \(Date(timeIntervalSince1970: estimate.validUntilMs / 1000).formatted(date: .abbreviated, time: .omitted))")
                            .font(.system(size: 12)).foregroundColor(.gray)
                    }
                }
            }
            Divider()
            HStack(alignment: .top, spacing: 40) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(t("BILL TO", lang: seciliDil).uppercased()).font(.system(size: 10, weight: .bold)).foregroundColor(.gray).tracking(1)
                    Text(siparis.customerName.isEmpty ? "-" : siparis.customerName).font(.system(size: 13, weight: .semibold))
                    if showAddress, !billingAddressText.isEmpty { Text(billingAddressText).font(.system(size: 11)).foregroundColor(.gray).fixedSize(horizontal: false, vertical: true) }
                    if !siparis.emailAddress.isEmpty { Text(siparis.emailAddress).font(.system(size: 11)).foregroundColor(.gray) }
                    if showAddress, !siparis.whatsappNumber.isEmpty { Text(siparis.whatsappNumber).font(.system(size: 11)).foregroundColor(.gray) }
                }
                if showShippingAddress, !shippingAddressText.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(t("SHIP TO", lang: seciliDil).uppercased()).font(.system(size: 10, weight: .bold)).foregroundColor(.gray).tracking(1)
                        Text(shippingRecipient.isEmpty ? "-" : shippingRecipient).font(.system(size: 13, weight: .semibold))
                        Text(shippingAddressText).font(.system(size: 11)).foregroundColor(.gray).fixedSize(horizontal: false, vertical: true)
                        if let sp = siparis.shippingPhone, !sp.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { Text(sp).font(.system(size: 11)).foregroundColor(.gray) }
                    }
                }
                Spacer()
            }
            VStack(spacing: 0) {
                HStack { Text(resolvedItemsColumnHeading).font(.system(size: 11, weight: .bold)); Spacer(); Text(t("Amount", lang: seciliDil)).font(.system(size: 11, weight: .bold)) }
                    .padding(.vertical, 9).padding(.horizontal, 12).background(Color.black.opacity(0.06))
                if hasPrintedLineItems {
                    ForEach(Array(printedLineItems.enumerated()), id: \.element.id) { _, item in
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.name.isEmpty ? "-" : item.name).font(.system(size: 12, weight: .semibold))
                                if item.quantity != 1 {
                                    Text("\(qtyText(item.quantity)) × \(money(item.unitPrice))").font(.system(size: 10)).foregroundColor(.gray)
                                }
                            }
                            Spacer()
                            Text(money(item.lineTotal)).font(.system(size: 12))
                        }.padding(.vertical, 9).padding(.horizontal, 12)
                        Divider()
                    }
                } else {
                    HStack {
                        Text(siparis.designName.isEmpty ? (siparis.customerName.isEmpty ? t("Order", lang: seciliDil) : siparis.customerName) : siparis.designName)
                            .font(.system(size: 12, weight: .semibold))
                        Spacer()
                        Text(money(subtotal)).font(.system(size: 12))
                    }.padding(.vertical, 11).padding(.horizontal, 12)
                    Divider()
                }
            }
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.black.opacity(0.08), lineWidth: 1))
            HStack {
                Spacer()
                VStack(alignment: .trailing, spacing: 7) {
                    totalRow(t("Subtotal", lang: seciliDil), money(subtotal))
                    if isMarginScheme {
                        Text(t("VAT under margin scheme (not shown separately)", lang: seciliDil)).font(.system(size: 9)).foregroundColor(.gray)
                    } else if isZeroRated {
                        totalRow(t("VAT (Zero-rated / Export)", lang: seciliDil), money(0))
                    } else {
                        totalRow("\(t("VAT", lang: seciliDil)) (\(Int(printedTaxRate))%)", money(vatAmount))
                    }
                    Divider().frame(width: 240)
                    totalRow(t("TOTAL", lang: seciliDil), money(orderValue), bold: true)
                }.frame(width: 270)
            }

            // What the customer agreed to, printed with the document it belongs
            // to — the point of the whole feature.
            if let approval = estimate?.approval, approval.decidedAtMs > 0 {
                VStack(alignment: .leading, spacing: 6) {
                    Text(t(approval.decision == "declined" ? "Declined" : "Approved", lang: seciliDil).uppercased())
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.gray)
                    estimatePdfRow(t(approval.decision == "declined" ? "Declined by" : "Approved by", lang: seciliDil), approval.approvedByName)
                    if !approval.approvedByEmail.isEmpty {
                        estimatePdfRow(t("Email", lang: seciliDil), approval.approvedByEmail)
                    }
                    estimatePdfRow(
                        t(approval.decision == "declined" ? "Declined at" : "Approved at", lang: seciliDil),
                        estimateStampText(approval.decidedAtMs)
                    )
                    estimatePdfRow(t("Approval Method", lang: seciliDil), t("Customer Portal", lang: seciliDil))
                    if !approval.declineReason.isEmpty {
                        Text(approval.declineReason).font(.system(size: 11)).fixedSize(horizontal: false, vertical: true)
                    }
                    if let signatureImage {
                        Text(t("Customer Signature", lang: seciliDil)).font(.system(size: 10)).foregroundColor(.gray)
                        Image(platformImage: signatureImage)
                            .resizable().scaledToFit()
                            .frame(maxWidth: 180, maxHeight: 64, alignment: .leading)
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.12), lineWidth: 1))
                .padding(.top, 10)
            }

            if let estimate, !estimate.terms.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(estimate.terms).font(.system(size: 10)).foregroundColor(.gray)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 8)
            }

            Spacer()
            if let note = siparis.invoiceNote, !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !isEstimate {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        Image(systemName: "note.text").font(.system(size: 11))
                        Text(t("Notes", lang: seciliDil)).font(.system(size: 11, weight: .bold))
                    }.foregroundColor(.gray)
                    Text(note).font(.system(size: 11)).foregroundColor(.primary).fixedSize(horizontal: false, vertical: true)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.12), lineWidth: 1))
                .padding(.bottom, 8)
            }
            if !footerNote.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Divider()
                Text(footerNote).font(.system(size: 10)).foregroundColor(.gray).fixedSize(horizontal: false, vertical: true)
            }
            Text(t("Generated with NivaDesk", lang: seciliDil)).font(.system(size: 9)).foregroundColor(.gray.opacity(0.6)).frame(maxWidth: .infinity, alignment: .center)
        }
        // Grows past one sheet when the document needs it; renderPDF slices the
        // result into A4 pages. A fixed height silently cropped long estimates.
        .padding(40).frame(width: 595).frame(minHeight: 842, alignment: .top).background(Color.white)
    }
}

struct OrderPDFView: View { let siparis: Siparis; var previewImage: PlatformImage?; var logoImage: PlatformImage?; var appSubtitle: String; var decodedSteps: [CustomStepDTO]; var sembol: String; var ondalik: String; var showCustomer: Bool; var showContact: Bool; var showPreview: Bool; var showFinCustomer: Bool; var showFinInternal: Bool; var showStatus: Bool; var showShipping: Bool; var showPaymentMethod: Bool; var showMaterials: Bool; var showPriority: Bool; var showAddress: Bool; var showShippingAddress: Bool; var seciliDil: String; var taxNameRev: String; var taxNamePro: String; var corporationTaxEnabled: Bool = false; var corporationTaxRate: Double = 19.0; var invLbl1: String; var invLbl2: String; var invLbl3: String; var invLbl4: String; var customFieldsList: [CustomStepDTO]; var customTogglesList: [CustomStepDTO]; var body: some View { VStack(alignment: .leading, spacing: 20) { HStack(alignment: .center) { VStack(alignment: .leading, spacing: 4) { if let logo = logoImage { Image(platformImage: logo).resizable().scaledToFit().frame(height: 50) }; Text(appSubtitle).font(.system(size: 12)).foregroundColor(.gray) }; Spacer(); Text(t("JOB SHEET", lang: seciliDil)).font(.system(size: 28, weight: .bold)).foregroundColor(.gray.opacity(0.3)) }.padding(.bottom, 10); Divider().padding(.bottom, 10); HStack(alignment: .top, spacing: 30) { VStack(alignment: .leading, spacing: 25) { if showCustomer { VStack(alignment: .leading, spacing: 12) { Text(t("Customer & Design", lang: seciliDil).uppercased()).font(.system(size: 11, weight: .bold)).foregroundColor(.gray).tracking(1); VStack(alignment: .leading, spacing: 10) { pdfRow(title: t("Customer Name", lang: seciliDil) + ":", value: siparis.customerName); pdfRow(title: t("Design Name", lang: seciliDil) + ":", value: siparis.designName.isEmpty ? "-" : siparis.designName); ForEach(Array((siparis.lineItems ?? []).enumerated()), id: \.element.id) { _, item in pdfRow(title: (item.name.isEmpty ? "-" : item.name), value: item.quantity != 1 ? "× " + (item.quantity.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(item.quantity)) : String(format: "%.2f", item.quantity)) : "") }; ForEach(customFieldsList, id: \.id) { field in pdfRow(title: t(field.title, lang: seciliDil) + ":", value: siparis.customFields?[field.title] ?? "-") }; pdfRow(title: t("Placed On", lang: seciliDil) + ":", value: siparis.paymentDate.formatted(date: .abbreviated, time: .omitted)) }.padding(15).background(Color.black.opacity(0.04)).cornerRadius(8) } }; if showPriority { VStack(alignment: .leading, spacing: 12) { Text(t("Priority / Risk", lang: seciliDil).uppercased()).font(.system(size: 11, weight: .bold)).foregroundColor(.gray).tracking(1); VStack(alignment: .leading, spacing: 10) { pdfRow(title: t("Priority", lang: seciliDil) + ":", value: t(siparis.priority, lang: seciliDil)); pdfRow(title: t("Risk", lang: seciliDil) + ":", value: t(siparis.risk, lang: seciliDil)); if siparis.risk != "None" && siparis.riskReason != "-" {
                    pdfRow(title: t("Reason", lang: seciliDil) + ":", value: t(siparis.riskReason, lang: seciliDil))
                    if siparis.riskReason == "Other",
                       let otherNote = siparis.customFields?["riskOtherNote"],
                       !otherNote.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        pdfRow(title: t("Other Note", lang: seciliDil) + ":", value: otherNote)
                    }
                } }.padding(15).frame(maxWidth: .infinity, alignment: .leading).background(Color.black.opacity(0.04)).cornerRadius(8) } }; if showMaterials { VStack(alignment: .leading, spacing: 12) { Text(t("Materials & Inventory", lang: seciliDil).uppercased()).font(.system(size: 11, weight: .bold)).foregroundColor(.gray).tracking(1); VStack(alignment: .leading, spacing: 10) { pdfRow(title: invLbl1 + ":", value: t(siparis.invBool1 ? "Yes" : "No", lang: seciliDil)); pdfRow(title: invLbl2 + ":", value: t(siparis.invBool2 ? "Yes" : "No", lang: seciliDil)); pdfRow(title: invLbl3 + ":", value: t(siparis.invBool3 ? "Yes" : "No", lang: seciliDil)); pdfRow(title: invLbl4 + ":", value: t(siparis.invBool4 ? "Yes" : "No", lang: seciliDil)); if !siparis.invNotes.isEmpty { Divider().padding(.vertical, 4); Text(t("Notes / Supplier", lang: seciliDil) + ":").font(.system(size: 12, weight: .bold)); Text(siparis.invNotes).font(.system(size: 12)).fixedSize(horizontal: false, vertical: true) } }.padding(15).frame(maxWidth: .infinity, alignment: .leading).background(Color.black.opacity(0.04)).cornerRadius(8) } }; if showContact { VStack(alignment: .leading, spacing: 12) { Text(t("Contact & Notes", lang: seciliDil).uppercased()).font(.system(size: 11, weight: .bold)).foregroundColor(.gray).tracking(1); VStack(alignment: .leading, spacing: 10) { pdfRow(title: t("Email", lang: seciliDil) + ":", value: siparis.emailAddress.isEmpty ? "-" : siparis.emailAddress); Divider().padding(.vertical, 4); Text(t("Special Notes", lang: seciliDil) + ":").font(.system(size: 12, weight: .bold)); Text(siparis.notes.isEmpty ? t("No special notes provided.", lang: seciliDil) : siparis.notes).font(.system(size: 12)).fixedSize(horizontal: false, vertical: true) }.padding(15).frame(maxWidth: .infinity, alignment: .leading).background(Color.black.opacity(0.04)).cornerRadius(8) } }; if showAddress { VStack(alignment: .leading, spacing: 12) { Text(t("Billing Address", lang: seciliDil).uppercased()).font(.system(size: 11, weight: .bold)).foregroundColor(.gray).tracking(1); VStack(alignment: .leading, spacing: 10) { pdfRow(title: t("Address", lang: seciliDil) + ":", value: (siparis.customFields?["communicationAddress"].flatMap { $0.isEmpty ? nil : $0 } ?? siparis.customFields?["Address"].flatMap { $0.isEmpty ? nil : $0 }) ?? "-"); pdfRow(title: t("Telephone", lang: seciliDil) + ":", value: siparis.whatsappNumber.isEmpty ? "-" : siparis.whatsappNumber) }.padding(15).frame(maxWidth: .infinity, alignment: .leading).background(Color.black.opacity(0.04)).cornerRadius(8) } }; if showPreview { VStack(alignment: .leading, spacing: 12) { Text(t("Preview", lang: seciliDil).uppercased()).font(.system(size: 11, weight: .bold)).foregroundColor(.gray).tracking(1); if let nsImage = previewImage { Image(platformImage: nsImage).resizable().scaledToFit().frame(maxHeight: 200, alignment: .leading).cornerRadius(8) } else { Text(t("No preview image provided.", lang: seciliDil)).font(.system(size: 12)).padding(15).frame(maxWidth: .infinity, alignment: .leading).background(Color.black.opacity(0.04)).cornerRadius(8) } } } }.frame(maxWidth: .infinity); VStack(alignment: .leading, spacing: 25) { if showFinCustomer || showFinInternal { VStack(alignment: .leading, spacing: 12) { Text(t("Financial Info", lang: seciliDil).uppercased()).font(.system(size: 11, weight: .bold)).foregroundColor(.gray).tracking(1); VStack(alignment: .leading, spacing: 10) { if showFinCustomer { pdfRow(title: t("Paid", lang: seciliDil) + ":", value: "\(sembol)\(formatFiyat(siparis.paidAmount, ondalik: ondalik))", valueColor: .green); pdfRow(title: t("Remaining", lang: seciliDil) + ":", value: "\(sembol)\(formatFiyat(siparis.remainingAmount, ondalik: ondalik))", valueColor: studioWarningOrange); if showPaymentMethod { pdfRow(title: t("Payment Method", lang: seciliDil) + ":", value: t(siparis.paymentMethod, lang: seciliDil)) } }; if showFinCustomer && showFinInternal { Divider().padding(.vertical, 2) }; if showFinInternal { pdfRow(title: t("Platform Fee", lang: seciliDil) + ":", value: "\(sembol)\(formatFiyat(siparis.paymentFee, ondalik: ondalik))", valueColor: .red); pdfRow(title: t("Watch Cost", lang: seciliDil) + ":", value: "\(sembol)\(formatFiyat(siparis.watchPurchasePrice, ondalik: ondalik))", valueColor: .red); pdfRow(title: t("Shipping Cost", lang: seciliDil) + ":", value: "\(sembol)\(formatFiyat(siparis.deliveryCost, ondalik: ondalik))", valueColor: .red); let displayTaxType = siparis.taxType == "Revenue" ? taxNameRev : taxNamePro; pdfRow(title: t("VAT Amount", lang: seciliDil) + " (" + displayTaxType + "):", value: "\(sembol)\(formatFiyat(siparis.taxAmount, ondalik: ondalik))", valueColor: .red); Divider().padding(.vertical, 2); pdfRow(title: t(corporationTaxEnabled ? "Profit before Corporation Tax" : "Final Profit", lang: seciliDil) + ":", value: "\(sembol)\(formatFiyat(siparis.netKar - siparis.taxAmount, ondalik: ondalik))", valueColor: corporationTaxEnabled ? .primary : .green); if corporationTaxEnabled { let profitAfterVat = siparis.netKar - siparis.taxAmount; let ct = (max(0, profitAfterVat) * corporationTaxRate).rounded() / 100.0; pdfRow(title: t("Corporation Tax", lang: seciliDil) + " (\(Int(corporationTaxRate))%):", value: "\(sembol)\(formatFiyat(ct, ondalik: ondalik))", valueColor: .red); pdfRow(title: t("Net Profit (after CT)", lang: seciliDil) + ":", value: "\(sembol)\(formatFiyat(profitAfterVat - ct, ondalik: ondalik))", valueColor: .green) } } }.padding(15).background(Color.black.opacity(0.04)).cornerRadius(8) } }; if showStatus { VStack(alignment: .leading, spacing: 12) { Text(t("Production Status", lang: seciliDil).uppercased()).font(.system(size: 11, weight: .bold)).foregroundColor(.gray).tracking(1); VStack(alignment: .leading, spacing: 10) { pdfRow(title: t("Delivery Time", lang: seciliDil) + ":", value: "\(siparis.deliveryTime) \(t("days", lang: seciliDil))"); ForEach(Array(decodedSteps.enumerated()), id: \.element.id) { index, step in if index == 0 { pdfRow(title: "\(step.title):", value: t(siparis.designStatus, lang: seciliDil)) } else if index == 1 { pdfRow(title: "\(step.title):", value: t(siparis.status, lang: seciliDil)) } else { pdfRow(title: "\(step.title):", value: t(siparis.extraStatuses?[step.title] ?? "Not Yet", lang: seciliDil)) } }; if !customTogglesList.isEmpty { Divider().padding(.vertical, 2); ForEach(customTogglesList, id: \.id) { toggle in pdfRow(title: t(toggle.title, lang: seciliDil) + ":", value: t((siparis.customToggles?[toggle.title] == true) ? "Yes" : "No", lang: seciliDil)) } } }.padding(15).background(Color.black.opacity(0.04)).cornerRadius(8) } }; if showShipping { VStack(alignment: .leading, spacing: 12) { Text(t("Shipping & Tracking", lang: seciliDil).uppercased()).font(.system(size: 11, weight: .bold)).foregroundColor(.gray).tracking(1); VStack(alignment: .leading, spacing: 10) { pdfRow(title: t("Dispatched", lang: seciliDil) + ":", value: t(siparis.isDispatched ? "Yes" : "No", lang: seciliDil)); pdfRow(title: t("Courier", lang: seciliDil) + ":", value: siparis.courier.isEmpty ? "-" : siparis.courier); pdfRow(title: t("Tracking No.", lang: seciliDil) + ":", value: siparis.trackingNumber.isEmpty ? "-" : siparis.trackingNumber) }.padding(15).background(Color.black.opacity(0.04)).cornerRadius(8) } }; if showShippingAddress { VStack(alignment: .leading, spacing: 12) { Text(t("Shipping Address", lang: seciliDil).uppercased()).font(.system(size: 11, weight: .bold)).foregroundColor(.gray).tracking(1); VStack(alignment: .leading, spacing: 10) { pdfRow(title: t("Recipient", lang: seciliDil) + ":", value: (siparis.shippingName?.isEmpty == false) ? siparis.shippingName! : siparis.customerName); pdfRow(title: t("Address", lang: seciliDil) + ":", value: { let s = [siparis.shippingStreetAddress, siparis.shippingCity, siparis.shippingPostalCode, siparis.shippingCountry].compactMap { ($0?.isEmpty == false) ? $0 : nil }.joined(separator: ", "); return s.isEmpty ? "-" : s }()); pdfRow(title: t("Shipping Phone", lang: seciliDil) + ":", value: (siparis.shippingPhone?.isEmpty == false) ? siparis.shippingPhone! : "-") }.padding(15).frame(maxWidth: .infinity, alignment: .leading).background(Color.black.opacity(0.04)).cornerRadius(8) } } }.frame(maxWidth: .infinity) }; Spacer(); Divider(); Text(t("Generated automatically from NivaDesk", lang: seciliDil)).font(.system(size: 10)).foregroundColor(.gray).frame(maxWidth: .infinity, alignment: .center).padding(.top, 5) }.padding(40).frame(width: 595, height: 842).background(Color.white) }
    private func pdfRow(title: String, value: String, valueColor: Color = .primary) -> some View { HStack(alignment: .top, spacing: 5) { Text(title).font(.system(size: 12, weight: .bold)).frame(width: 115, alignment: .leading); Text(value).font(.system(size: 12)).foregroundColor(valueColor).frame(maxWidth: .infinity, alignment: .leading) } }
}



struct ToDoPDFPageView: View {
    let siparis: Siparis
    let items: [OrderToDoItem]
    let allItems: [OrderToDoItem]
    var logoImage: PlatformImage?
    var appSubtitle: String
    var seciliDil: String
    var pageNumber: Int
    var totalPages: Int

    private var orderDisplayName: String {
        if !siparis.customerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return siparis.customerName
        }
        if !siparis.designName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return siparis.designName
        }
        return t("Order", lang: seciliDil)
    }

    private var openCount: Int { allItems.filter { !$0.isDone }.count }
    private var doneCount: Int { allItems.filter { $0.isDone }.count }
    private var overdueCount: Int {
        let today = Calendar.current.startOfDay(for: Date())
        return allItems.filter { item in
            guard !item.isDone, let dueAt = item.dueAt else { return false }
            return dueAt < today
        }.count
    }

    private func dateText(_ date: Date) -> String {
        date.formatted(date: .abbreviated, time: .shortened)
    }

    private func dueDateText(_ date: Date?) -> String {
        guard let date else { return t("No due date", lang: seciliDil) }
        return date.formatted(date: .abbreviated, time: .omitted)
    }

    private func assigneeText(_ item: OrderToDoItem) -> String {
        let email = item.assignedToEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        let uid = item.assignedToUid.trimmingCharacters(in: .whitespacesAndNewlines)
        if !email.isEmpty { return email }
        if !uid.isEmpty { return uid }
        return t("Unassigned", lang: seciliDil)
    }

    private func statusText(_ item: OrderToDoItem) -> String {
        item.isDone ? t("Done", lang: seciliDil) : t("Open", lang: seciliDil)
    }

    private func taskIsOverdue(_ item: OrderToDoItem) -> Bool {
        guard !item.isDone, let dueAt = item.dueAt else { return false }
        return dueAt < Calendar.current.startOfDay(for: Date())
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 5) {
                    if let logoImage {
                        Image(platformImage: logoImage)
                            .resizable()
                            .scaledToFit()
                            .frame(height: 42, alignment: .leading)
                    }
                    Text(appSubtitle)
                        .font(.system(size: 11))
                        .foregroundColor(.gray)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 4) {
                    Text(t("To Do PDF", lang: seciliDil).uppercased())
                        .font(.system(size: 24, weight: .bold))
                        .foregroundColor(.gray.opacity(0.35))
                    Text("\(t("Page", lang: seciliDil)) \(pageNumber) / \(totalPages)")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.gray)
                }
            }

            Divider()

            VStack(alignment: .leading, spacing: 8) {
                Text(orderDisplayName)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.primary)
                HStack(spacing: 14) {
                    Text("\(t("Design Name", lang: seciliDil)): \(siparis.designName.isEmpty ? "-" : siparis.designName)")
                    Text("\(t("Open", lang: seciliDil)): \(openCount)")
                    Text("\(t("Done", lang: seciliDil)): \(doneCount)")
                    Text("\(t("Overdue", lang: seciliDil)): \(overdueCount)")
                }
                .font(.system(size: 10))
                .foregroundColor(.gray)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.black.opacity(0.035))
            .cornerRadius(10)

            if items.isEmpty {
                Text(t("No tasks here", lang: seciliDil))
                    .font(.system(size: 12))
                    .foregroundColor(.gray)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.black.opacity(0.035))
                    .cornerRadius(10)
            } else {
                VStack(alignment: .leading, spacing: 9) {
                    ForEach(items) { item in
                        toDoPDFRow(item)
                    }
                }
            }

            Spacer(minLength: 0)

            Divider()
            Text(t("Generated automatically from NivaDesk", lang: seciliDil))
                .font(.system(size: 10))
                .foregroundColor(.gray)
                .frame(maxWidth: .infinity, alignment: .center)
        }
        .padding(40)
        .frame(width: 595, height: 842, alignment: .topLeading)
        .background(Color.white)
    }

    private func toDoPDFRow(_ item: OrderToDoItem) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: item.isDone ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(item.isDone ? .green : (taskIsOverdue(item) ? .red : .gray))
                .frame(width: 20, alignment: .center)
                .padding(.top, 2)

            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    Text(item.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? t("To Do", lang: seciliDil) : item.title)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.primary)
                        .lineLimit(2)
                    Spacer(minLength: 10)
                    Text(statusText(item))
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(item.isDone ? .green : (taskIsOverdue(item) ? .red : .blue))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background((item.isDone ? Color.green : (taskIsOverdue(item) ? Color.red : Color.blue)).opacity(0.10))
                        .clipShape(Capsule())
                }

                HStack(spacing: 10) {
                    Label(assigneeText(item), systemImage: "person.crop.circle")
                    Label(t(item.priority, lang: seciliDil), systemImage: "flag.fill")
                    Label(dueDateText(item.dueAt), systemImage: "calendar")
                }
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(.gray)
                .lineLimit(1)

                if !item.note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text(item.note)
                        .font(.system(size: 10))
                        .foregroundColor(.gray)
                        .lineLimit(2)
                }

                if let completedAt = item.completedAt, item.isDone {
                    Text("\(t("Done", lang: seciliDil)): \(dateText(completedAt))")
                        .font(.system(size: 9))
                        .foregroundColor(.gray)
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background((item.isDone ? Color.green : (taskIsOverdue(item) ? Color.red : Color.blue)).opacity(0.045))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke((item.isDone ? Color.green : (taskIsOverdue(item) ? Color.red : Color.blue)).opacity(0.11), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
    }
}


struct HistoryLogPDFPageView: View {
    let siparis: Siparis
    let items: [OrderHistoryLogItem]
    var logoImage: PlatformImage?
    var appSubtitle: String
    var seciliDil: String
    var pageNumber: Int
    var totalPages: Int

    private var orderDisplayName: String {
        if !siparis.customerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return siparis.customerName
        }
        if !siparis.designName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return siparis.designName
        }
        return t("Order", lang: seciliDil)
    }

    private func dateText(_ date: Date) -> String {
        date.formatted(date: .abbreviated, time: .shortened)
    }

    private func cleanValue(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "-" : trimmed
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 5) {
                    if let logoImage {
                        Image(platformImage: logoImage)
                            .resizable()
                            .scaledToFit()
                            .frame(height: 42, alignment: .leading)
                    }
                    Text(appSubtitle)
                        .font(.system(size: 11))
                        .foregroundColor(.gray)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 4) {
                    Text(t("History Log PDF", lang: seciliDil).uppercased())
                        .font(.system(size: 24, weight: .bold))
                        .foregroundColor(.gray.opacity(0.35))
                    Text("\(t("Page", lang: seciliDil)) \(pageNumber) / \(totalPages)")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.gray)
                }
            }

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                Text(orderDisplayName)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.primary)
                HStack(spacing: 14) {
                    Text("\(t("Design Name", lang: seciliDil)): \(siparis.designName.isEmpty ? "-" : siparis.designName)")
                    Text("\(t("Placed On", lang: seciliDil)): \(dateText(siparis.paymentDate))")
                    Text("\(t("Total Logs", lang: seciliDil)): \(siparis.historyLog?.count ?? 0)")
                }
                .font(.system(size: 10))
                .foregroundColor(.gray)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.black.opacity(0.035))
            .cornerRadius(10)

            if items.isEmpty {
                Text(t("No history yet. Important changes will appear here.", lang: seciliDil))
                    .font(.system(size: 12))
                    .foregroundColor(.gray)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.black.opacity(0.035))
                    .cornerRadius(10)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(items) { item in
                        historyPDFRow(item)
                    }
                }
            }

            Spacer(minLength: 0)

            Divider()
            Text(t("Generated automatically from NivaDesk", lang: seciliDil))
                .font(.system(size: 10))
                .foregroundColor(.gray)
                .frame(maxWidth: .infinity, alignment: .center)
        }
        .padding(40)
        .frame(width: 595, height: 842, alignment: .topLeading)
        .background(Color.white)
    }

    private func historyPDFRow(_ item: OrderHistoryLogItem) -> some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(spacing: 0) {
                Circle()
                    .fill(Color.blue.opacity(0.20))
                    .frame(width: 16, height: 16)
                    .overlay(Circle().fill(Color.blue).frame(width: 6, height: 6))
                Rectangle()
                    .fill(Color.blue.opacity(0.18))
                    .frame(width: 1, height: 32)
            }
            .frame(width: 18)

            VStack(alignment: .leading, spacing: 5) {
                HStack(alignment: .firstTextBaseline) {
                    Text(t(item.title, lang: seciliDil))
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.primary)
                    Spacer(minLength: 10)
                    Text(dateText(item.createdAt))
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(.gray)
                }

                HStack(alignment: .top, spacing: 7) {
                    Text(cleanValue(item.oldValue))
                        .font(.system(size: 10))
                        .foregroundColor(.gray)
                        .lineLimit(2)
                    Image(systemName: "arrow.right")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundColor(.gray)
                        .padding(.top, 2)
                    Text(cleanValue(item.newValue))
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.primary)
                        .lineLimit(2)
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.blue.opacity(0.045))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(Color.blue.opacity(0.11), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
    }
}


struct BlockHeadingsEditorSheet: View {
    let kartTipi: KartTipi
    @Binding var customStepsJSON: String
    @Binding var customFieldsJSON: String
    @Binding var financialExpenseItemsJSON: String
    @Binding var financialRemainingItemsJSON: String
    @Binding var financialShowBaseCost: Bool
    @Binding var financialBaseCostLabel: String
    @Binding var summaryStep1: String
    @Binding var summaryStep2: String
    @Binding var orderListStep1: String
    @Binding var orderListStep2: String
    @Binding var orderItemsHeading: String
    @Binding var companyNumbersJSON: String
    @Binding var invLabel1: String
    @Binding var invLabel2: String
    @Binding var invLabel3: String
    @Binding var invLabel4: String
    @Binding var materialsTogglesJSON: String
    @Binding var materialsDefaultChecksJSON: String
    @Binding var communicationShowTelephone: Bool
    @Binding var communicationShowEmail: Bool
    @Binding var communicationShowAddress: Bool
    @Binding var communicationShowChannel: Bool
    @Binding var communicationShowCustomerNotes: Bool
    @Binding var communicationChannelLabelsJSON: String
    @Binding var specialNoteSectionsJSON: String
    @Binding var repairIntakeFieldsJSON: String
    var orderExtraNoteSectionsJSON: Binding<String>? = nil
    // When set (the editor is opened from an order), the Spending / Cost and
    // Remaining / Pending heading lists are edited PER-ORDER: loaded from these
    // bindings (seeded from the workspace template when empty) and saved back to
    // them instead of to the shared workspace setting.
    var orderFinancialExpenseItemsJSON: Binding<String>? = nil
    var orderFinancialRemainingItemsJSON: Binding<String>? = nil
    // Per-order base-cost-field label (effective label in; override out).
    var orderFinancialBaseCostLabel: Binding<String>? = nil

    @State private var perOrderOriginIDs: Set<UUID> = []
    @State private var companyNumbersDraft: [CompanyNumberSettingDTO] = []

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @EnvironmentObject var firebaseManager: FirebaseManager
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    @AppStorage("customTogglesJSON") private var customTogglesJSON: String = ""
    @AppStorage("showStatusNotesSupplier") private var showStatusNotesSupplier: Bool = false
    @AppStorage("showMaterialsNotesSupplier") private var showMaterialsNotesSupplier: Bool = true
    @AppStorage("statusNotesSupplierLabel") private var statusNotesSupplierLabel: String = "Notes / Supplier"
    @AppStorage("materialsNotesSupplierLabel") private var materialsNotesSupplierLabel: String = "Notes / Supplier"
    @AppStorage("scheduleQuickRemindersJSONV2") private var scheduleQuickRemindersJSON: String = ""

    @State private var editableItems: [CustomStepDTO] = []
    @State private var editableToggleItems: [CustomStepDTO] = []
    @State private var materialLabels: [String] = []
    @State private var showNotesSupplierDraft: Bool = false
    @State private var notesSupplierLabelDraft: String = "Notes / Supplier"
    @State private var summaryStep1Draft: String = "Design"
    @State private var summaryStep2Draft: String = "Painting"
    @State private var orderListStep1Draft: String = "Design"
    @State private var orderListStep2Draft: String = "Painting"
    @State private var orderItemsHeadingDraft: String = ""
    @State private var financialShowBaseCostDraft: Bool = true
    @State private var financialBaseCostLabelDraft: String = "Cost (Base)"
    // Per-order financial editor only: when ON, Save also promotes the current
    // spending / remaining lists to the workspace template so NEW orders start
    // from them (existing customised orders keep their own).
    @State private var applyFinancialAsWorkspaceDefault: Bool = false
    @State private var communicationShowTelephoneDraft: Bool = true
    @State private var communicationShowEmailDraft: Bool = true
    @State private var communicationShowAddressDraft: Bool = true
    @State private var communicationShowChannelDraft: Bool = true
    @State private var communicationShowCustomerNotesDraft: Bool = true
    @State private var communicationChannelLabelsDraft: [String] = ["Instagram", "WhatsApp", "TikTok"]
    @State private var repairIntakeRowsDraft: [RepairIntakeFieldDTO] = []
    @AppStorage("businessType") private var editorBusinessType: String = "Custom Art Studio"

    private var sheetTitle: String {
        switch kartTipi {
        case .summary: return t("Edit Summary & Order List Badges", lang: seciliDil)
        case .financial: return t("Edit Financial Headings", lang: seciliDil)
        case .status: return t("Edit Production Status Headings", lang: seciliDil)
        case .customer: return t("Edit Customer & Communication Headings", lang: seciliDil)
        case .notes: return t("Edit Notes Headings", lang: seciliDil)
        case .materials: return t("Edit Materials Headings", lang: seciliDil)
        case .schedule: return t("Edit Quick Reminder Headings", lang: seciliDil)
        case .communication: return t("Edit Communication Headings", lang: seciliDil)
        case .repairIntake: return t("Edit Repair Intake Rows", lang: seciliDil)
        default: return t("Edit Block Headings", lang: seciliDil)
        }
    }

    private var sheetSubtitle: String {
        switch kartTipi {
        case .summary:
            return t("Choose which production statuses appear in Order Summary and in the small order cards on the left.", lang: seciliDil)
        case .financial:
            return t("Add custom spending headings and extra remaining / pending headings for the Financial Info block.", lang: seciliDil)
        case .status:
            return t("Edit both the status dropdown headings and the Yes / No headings shown inside the Production Status block.", lang: seciliDil)
        case .customer:
            return t("Edit customer fields, visible contact fields and the channel button names.", lang: seciliDil)
        case .notes:
            return t("Add, remove, or rename the note fields shown inside the Notes block.", lang: seciliDil)
        case .materials:
            return t("Edit the default material headings and add extra Yes / No checks for Materials & Inventory.", lang: seciliDil)
        case .schedule:
            return t("Choose the shortcut titles shown in Schedule & Alerts. Date, priority and note are set in the card.", lang: seciliDil)
        case .communication:
            return t("Choose which communication fields are visible and edit the channel button names.", lang: seciliDil)
        case .repairIntake:
            return t("Start from a trade template, then add, remove or rename the rows recorded when an item comes in.", lang: seciliDil)
        default:
            return t("Edit headings for this block.", lang: seciliDil)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            editorHeader

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if kartTipi == .summary {
                        EditorSectionTitle(title: t("Order Summary", lang: seciliDil), systemImage: "doc.text")
                        summaryBadgeEditor
                    } else if kartTipi == .financial {
                        EditorSectionTitle(title: t("Spending / Cost Headings", lang: seciliDil), systemImage: "minus.circle")
                        financialExpenseEditor
                        Divider().padding(.vertical, 2)
                        EditorSectionTitle(title: t("Remaining / Pending Headings", lang: seciliDil), systemImage: "clock")
                        financialRemainingEditor
                        if orderFinancialExpenseItemsJSON != nil {
                            Divider().padding(.vertical, 2)
                            financialSetAsDefaultEditor
                        }
                    } else if kartTipi == .materials {
                        EditorSectionTitle(title: t("Default Material Checks", lang: seciliDil), systemImage: "shippingbox")
                        materialsEditor
                        Divider().padding(.vertical, 2)
                        EditorSectionTitle(title: t("Extra Yes / No Checks", lang: seciliDil), systemImage: "checkmark.circle")
                        yesNoEditor
                        Divider().padding(.vertical, 2)
                        EditorSectionTitle(title: t("Notes / Supplier Field", lang: seciliDil), systemImage: "note.text")
                        notesSupplierEditor
                    } else if kartTipi == .status {
                        EditorSectionTitle(title: t("Status Dropdown Headings", lang: seciliDil), systemImage: "list.bullet.rectangle")
                        listEditor
                        Divider().padding(.vertical, 2)
                        EditorSectionTitle(title: t("Order Summary / Small Order Badges", lang: seciliDil), systemImage: "doc.text")
                        summaryBadgeEditor
                        Divider().padding(.vertical, 2)
                        EditorSectionTitle(title: t("Extra Yes / No Checks", lang: seciliDil), systemImage: "checkmark.circle")
                        yesNoEditor
                        Divider().padding(.vertical, 2)
                        EditorSectionTitle(title: t("Notes / Supplier Field", lang: seciliDil), systemImage: "note.text")
                        notesSupplierEditor
                    } else if kartTipi == .invoiceItems {
                        EditorSectionTitle(title: t("Company invoice numbers", lang: seciliDil), systemImage: "number")
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(alignment: .top) {
                                Text(t("VAT, EORI, company number or any reference you want to show on PDF invoices.", lang: seciliDil))
                                    .font(.system(size: 11)).foregroundColor(.gray)
                                    .fixedSize(horizontal: false, vertical: true)
                                Spacer()
                                Button(action: { withAnimation { companyNumbersDraft.append(CompanyNumberSettingDTO(title: t("New Number", lang: seciliDil), value: "")) } }) {
                                    HStack(spacing: 6) { Image(systemName: "plus.circle.fill"); Text(t("Add", lang: seciliDil)) }
                                        .font(.system(size: 12, weight: .bold)).foregroundColor(.blue)
                                }.buttonStyle(.plain)
                            }
                            ForEach($companyNumbersDraft) { $item in
                                HStack(spacing: 8) {
                                    TextField(t("Label", lang: seciliDil), text: $item.title)
                                        .textFieldStyle(.roundedBorder)
                                    TextField(t("Number / value", lang: seciliDil), text: $item.value)
                                        .textFieldStyle(.roundedBorder)
                                    Button(action: { withAnimation { companyNumbersDraft.removeAll { $0.id == item.id } } }) {
                                        Image(systemName: "trash.fill").foregroundColor(.red.opacity(0.8))
                                    }.buttonStyle(.plain)
                                }
                            }
                        }
                    } else if kartTipi == .customer {
                        EditorSectionTitle(title: t("Customer & Design Fields", lang: seciliDil), systemImage: "person.text.rectangle")
                        customerDesignFieldsEditor
                        Divider().padding(.vertical, 2)
                        EditorSectionTitle(title: t("Visible Communication Fields", lang: seciliDil), systemImage: "eye")
                        communicationVisibilityEditor
                        Divider().padding(.vertical, 2)
                        EditorSectionTitle(title: t("Channel Button Names", lang: seciliDil), systemImage: "bubble.left.and.bubble.right")
                        communicationChannelEditor
                    } else if kartTipi == .notes {
                        EditorSectionTitle(title: t("Special Note Fields", lang: seciliDil), systemImage: "note.text")
                        specialNoteSectionsEditor
                    } else if kartTipi == .schedule {
                        EditorSectionTitle(title: t("Quick reminders", lang: seciliDil), systemImage: "bolt.fill")
                        listEditor
                    } else if kartTipi == .communication {
                        EditorSectionTitle(title: t("Visible Communication Fields", lang: seciliDil), systemImage: "eye")
                        communicationVisibilityEditor
                        Divider().padding(.vertical, 2)
                        EditorSectionTitle(title: t("Channel Button Names", lang: seciliDil), systemImage: "bubble.left.and.bubble.right")
                        communicationChannelEditor
                    } else if kartTipi == .repairIntake {
                        EditorSectionTitle(title: t("Start from a trade", lang: seciliDil), systemImage: "square.grid.2x2")
                        repairIntakeTemplateEditor
                        Divider().padding(.vertical, 2)
                        EditorSectionTitle(title: t("Repair intake rows", lang: seciliDil), systemImage: "list.bullet")
                        repairIntakeRowsEditor
                    } else {
                        unsupportedEditor
                    }
                }
                .padding(editorInnerPadding)
            }

            Divider()

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 12) {
                    editorAddButtons

                    Spacer()

                    Button(t("Cancel", lang: seciliDil)) { dismiss() }
                        .keyboardShortcut(.cancelAction)

                    Button(t("Save", lang: seciliDil)) {
                        saveChanges()
                        dismiss()
                    }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
                }

                VStack(alignment: .leading, spacing: 10) {
                    editorAddButtons

                    HStack {
                        Spacer()

                        Button(t("Cancel", lang: seciliDil)) { dismiss() }
                            .keyboardShortcut(.cancelAction)

                        Button(t("Save", lang: seciliDil)) {
                            saveChanges()
                            dismiss()
                        }
                        .keyboardShortcut(.defaultAction)
                        .buttonStyle(.borderedProminent)
                    }
                }
            }
            .padding(editorInnerPadding)
        }
        .frame(width: editorWidth, height: editorHeight)
        .background(colorScheme == .dark ? Color(white: 0.10) : Color.white)
        .clipShape(RoundedRectangle(cornerRadius: isCompactEditor ? 0 : 18, style: .continuous))
        .onAppear(perform: loadCurrentValues)
    }

    @ViewBuilder
    private var editorHeader: some View {
        if isCompactEditor {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .center, spacing: 10) {
                    Image(systemName: iconName)
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(.blue)
                        .frame(width: 34, height: 34)
                        .background(Color.blue.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                    Text(sheetTitle)
                        .font(.system(size: 17, weight: .bold))
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)

                    Spacer(minLength: 6)

                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundColor(.secondary.opacity(0.65))
                    }
                    .buttonStyle(.plain)
                }

                Text(sheetSubtitle)
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(editorInnerPadding)
        } else {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: iconName)
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundColor(.blue)
                    .frame(width: 42, height: 42)
                    .background(Color.blue.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text(sheetTitle)
                        .font(.system(size: 20, weight: .bold))
                    Text(sheetSubtitle)
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer()

                Button { dismiss() } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 22))
                        .foregroundColor(.secondary.opacity(0.65))
                }
                .buttonStyle(.plain)
            }
            .padding(editorInnerPadding)
        }
    }

    private var isCompactEditor: Bool {
        horizontalSizeClass == .compact
    }

    private var editorWidth: CGFloat {
        #if os(iOS)
        if isCompactEditor {
            return max(300, UIScreen.main.bounds.width - 16)
        }
        #endif
        return 680
    }

    private var editorInnerPadding: CGFloat {
        isCompactEditor ? 14 : 22
    }

    private var editorHeight: CGFloat {
        let preferredHeight: CGFloat
        switch kartTipi {
        case .status: preferredHeight = 860
        case .materials: preferredHeight = 740
        case .financial: preferredHeight = 680
        case .summary: preferredHeight = 560
        case .schedule: preferredHeight = 560
        case .communication: preferredHeight = 620
        case .repairIntake: preferredHeight = 640
        default: preferredHeight = 560
        }
        #if os(iOS)
        if isCompactEditor {
            return max(520, UIScreen.main.bounds.height - 24)
        }
        #endif
        return preferredHeight
    }

    private var iconName: String {
        switch kartTipi {
        case .summary: return "doc.text"
        case .financial: return "sterlingsign.circle.fill"
        case .status: return "checklist"
        case .customer: return "person.text.rectangle"
        case .materials: return "shippingbox.circle.fill"
        case .schedule: return "bolt.fill"
        case .communication: return "bubble.left.and.bubble.right"
        case .repairIntake: return "shippingbox"
        default: return "textformat"
        }
    }

    @ViewBuilder
    private var editorAddButtons: some View {
        if kartTipi == .status || kartTipi == .schedule {
            Button {
                withAnimation(.snappy) {
                    editableItems.append(CustomStepDTO(title: nextDefaultTitle()))
                }
            } label: {
                Label(t("Add Heading", lang: seciliDil), systemImage: "plus.circle.fill")
            }
            .buttonStyle(.borderless)
        }
    }

    private var financialFooterAddButtons: some View {
        HStack(spacing: 12) {
            financialAddSpendingButton
            financialAddRemainingButton
        }
    }

    private var financialAddSpendingButton: some View {
        Button {
            withAnimation(.snappy) {
                editableItems.append(CustomStepDTO(title: ""))
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "plus.circle.fill")
                Text(t("Spending", lang: seciliDil))
            }
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(.blue)
        }
        .buttonStyle(.borderless)
        .help(t("Add Cost", lang: seciliDil))
    }

    private var financialAddRemainingButton: some View {
        Button {
            withAnimation(.snappy) {
                editableToggleItems.append(CustomStepDTO(title: ""))
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "plus.circle.fill")
                Text(t("Remaining", lang: seciliDil))
            }
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(.blue)
        }
        .buttonStyle(.borderless)
        .help(t("Add Pending", lang: seciliDil))
    }

    private var materialsAddYesNoButton: some View {
        Button {
            withAnimation(.snappy) {
                editableToggleItems.append(CustomStepDTO(title: nextDefaultToggleTitle()))
            }
        } label: {
            Label(t("Add Yes / No", lang: seciliDil), systemImage: "checkmark.circle.fill")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.blue)
        }
        .buttonStyle(.borderless)
    }

    private var materialsAddDefaultCheckButton: some View {
        Button {
            withAnimation(.snappy) {
                materialLabels.append("Material Check \(materialLabels.count + 1)")
            }
        } label: {
            Label(t("Add Heading", lang: seciliDil), systemImage: "plus.circle.fill")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.blue)
        }
        .buttonStyle(.borderless)
    }

    private var financialBaseCostEditor: some View {
        VStack(alignment: .leading, spacing: 10) {
            if financialShowBaseCostDraft {
                HStack(spacing: 10) {
                    TextField(t("Base Cost Label", lang: seciliDil), text: $financialBaseCostLabelDraft)
                        .textFieldStyle(.plain)
                        .font(.system(size: 13, weight: .semibold))
                        .padding(10)
                        .background(Color.primary.opacity(0.06))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                    Button(role: .destructive) {
                        financialShowBaseCostDraft = false
                    } label: {
                        Image(systemName: "trash")
                    }
                    .buttonStyle(.borderless)
                    .help(t("Remove Base Cost", lang: seciliDil))
                }

                Text(t("This is the default base cost field. Extra spending headings can be added below.", lang: seciliDil))
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                HStack(spacing: 10) {
                    Text(t("Base cost field is hidden.", lang: seciliDil))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.secondary)

                    Spacer()

                    Button {
                        financialShowBaseCostDraft = true
                        if financialBaseCostLabelDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            financialBaseCostLabelDraft = "Cost (Base)"
                        }
                    } label: {
                        Label(t("Add Base Cost", lang: seciliDil), systemImage: "plus.circle.fill")
                    }
                    .buttonStyle(.borderless)
                }
                .padding(12)
                .background(Color.gray.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
    }

    private func isAutoFinancialPlaceholder(_ title: String, prefix: String) -> Bool {
        let cleanedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard cleanedTitle.hasPrefix(prefix + " ") else { return false }
        let numberPart = cleanedTitle.dropFirst(prefix.count + 1)
        return !numberPart.isEmpty && numberPart.allSatisfy { $0.isNumber }
    }

    private func isUsableFinancialExpenseTitle(_ title: String) -> Bool {
        let cleanedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        return !cleanedTitle.isEmpty && !isAutoFinancialPlaceholder(cleanedTitle, prefix: "Cost")
    }

    private func isUsableFinancialRemainingTitle(_ title: String) -> Bool {
        let cleanedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        return !cleanedTitle.isEmpty && !isAutoFinancialPlaceholder(cleanedTitle, prefix: "Pending")
    }

    private var financialExpenseEditor: some View {
        VStack(spacing: 10) {
            financialBaseCostEditor

            if editableItems.isEmpty {
                Text(t("No extra spending headings yet. Use + Spending below.", lang: seciliDil))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(Color.gray.opacity(0.06))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            } else {
                ForEach($editableItems) { itemBinding in
                    EditableHeadingRow(
                        item: itemBinding,
                        index: indexForItem(itemBinding.wrappedValue.id),
                        totalCount: editableItems.count,
                        isStatusBlock: false,
                        language: seciliDil,
                        moveUp: { moveItemByID(itemBinding.wrappedValue.id, -1) },
                        moveDown: { moveItemByID(itemBinding.wrappedValue.id, 1) },
                        delete: { deleteItemByID(itemBinding.wrappedValue.id) }
                    )
                }
            }

            financialAddSpendingButton
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 2)
        }
    }

    private var financialRemainingEditor: some View {
        VStack(spacing: 10) {
            if editableToggleItems.isEmpty {
                Text(t("No extra pending headings yet. Use + Remaining below.", lang: seciliDil))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(Color.gray.opacity(0.06))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            } else {
                ForEach($editableToggleItems) { itemBinding in
                    EditableHeadingRow(
                        item: itemBinding,
                        index: indexForToggleItem(itemBinding.wrappedValue.id),
                        totalCount: editableToggleItems.count,
                        isStatusBlock: false,
                        language: seciliDil,
                        moveUp: { moveToggleItemByID(itemBinding.wrappedValue.id, -1) },
                        moveDown: { moveToggleItemByID(itemBinding.wrappedValue.id, 1) },
                        delete: { deleteToggleItemByID(itemBinding.wrappedValue.id) }
                    )
                }
            }

            financialAddRemainingButton
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 2)
        }
    }

    private var financialSetAsDefaultEditor: some View {
        VStack(alignment: .leading, spacing: 6) {
            Toggle(isOn: $applyFinancialAsWorkspaceDefault) {
                Text(t("Set as default for new orders", lang: seciliDil))
                    .font(.system(size: 13, weight: .semibold))
            }
            Text(t("New orders will start with these spending and remaining headings. Existing orders keep their own.", lang: seciliDil))
                .font(.system(size: 11))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .background(Color.blue.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var productionStepOptions: [String] {
        var options: [String] = []
        if let data = customStepsJSON.data(using: .utf8),
           let decoded = try? JSONDecoder().decode([CustomStepDTO].self, from: data) {
            options = decoded.map { cleaned($0.title) }.filter { !$0.isEmpty }
        }

        if options.isEmpty {
            options = ["Design", "Painting"]
        }

        for value in [summaryStep1Draft, summaryStep2Draft, orderListStep1Draft, orderListStep2Draft] {
            let cleanedValue = cleaned(value)
            if !cleanedValue.isEmpty && !options.contains(cleanedValue) {
                options.append(cleanedValue)
            }
        }

        return options
    }

    private var summaryBadgeEditor: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(
                kartTipi == .summary
                ? t("These selections control only the two status rows shown inside the Order Summary card.", lang: seciliDil)
                : t("These selections control the two status rows inside Order Summary and the two compact badges shown on the small order cards.", lang: seciliDil)
            )
            .font(.system(size: 12))
            .foregroundColor(.secondary)
            .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 10) {
                Text(t("Order Summary Status Rows", lang: seciliDil))
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.primary)

                PickerRow(title: t("Summary 1", lang: seciliDil), selection: $summaryStep1Draft, options: productionStepOptions, language: seciliDil)
                PickerRow(title: t("Summary 2", lang: seciliDil), selection: $summaryStep2Draft, options: productionStepOptions, language: seciliDil)
            }
            .padding(12)
            .background(Color.gray.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            if kartTipi != .summary {
                VStack(alignment: .leading, spacing: 10) {
                    Text(t("Small Order Card Badges", lang: seciliDil))
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.primary)

                    PickerRow(title: t("Badge 1", lang: seciliDil), selection: $orderListStep1Draft, options: productionStepOptions, language: seciliDil)
                    PickerRow(title: t("Badge 2", lang: seciliDil), selection: $orderListStep2Draft, options: productionStepOptions, language: seciliDil)

                    Text(t("The title is shortened automatically on the order cards so the small list stays clean.", lang: seciliDil))
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(12)
                .background(Color.blue.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
    }

    private var listEditor: some View {
        VStack(spacing: 10) {
            ForEach($editableItems) { itemBinding in
                EditableHeadingRow(
                    item: itemBinding,
                    index: indexForItem(itemBinding.wrappedValue.id),
                    totalCount: editableItems.count,
                    isStatusBlock: kartTipi == .status,
                    language: seciliDil,
                    moveUp: { moveItemByID(itemBinding.wrappedValue.id, -1) },
                    moveDown: { moveItemByID(itemBinding.wrappedValue.id, 1) },
                    delete: { deleteItemByID(itemBinding.wrappedValue.id) }
                )
            }
        }
    }

    private var customerDesignFieldsEditor: some View {
        VStack(alignment: .leading, spacing: 10) {
            listEditor

            Button {
                withAnimation(.snappy) {
                    editableItems.append(CustomStepDTO(title: nextDefaultTitle()))
                }
            } label: {
                Label(t("Add Heading", lang: seciliDil), systemImage: "plus.circle.fill")
            }
            .buttonStyle(.borderless)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .background(Color.blue.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var yesNoEditor: some View {
        VStack(spacing: 10) {
            if editableToggleItems.isEmpty {
                Text(t("No extra Yes / No headings yet. Use Add Yes / No below.", lang: seciliDil))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(Color.gray.opacity(0.06))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            } else {
                ForEach($editableToggleItems) { itemBinding in
                    EditableHeadingRow(
                        item: itemBinding,
                        index: indexForToggleItem(itemBinding.wrappedValue.id),
                        totalCount: editableToggleItems.count,
                        isStatusBlock: false,
                        language: seciliDil,
                        moveUp: { moveToggleItemByID(itemBinding.wrappedValue.id, -1) },
                        moveDown: { moveToggleItemByID(itemBinding.wrappedValue.id, 1) },
                        delete: { deleteToggleItemByID(itemBinding.wrappedValue.id) }
                    )
                }
            }

            if kartTipi == .materials || kartTipi == .status {
                materialsAddYesNoButton
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 2)
            }
        }
    }

    private var materialsEditor: some View {
        VStack(spacing: 12) {
            ForEach(Array(materialLabels.indices), id: \.self) { index in
                MaterialHeadingRow(
                    label: t("Item", lang: seciliDil) + " \(index + 1)",
                    headingPlaceholder: t("Heading", lang: seciliDil),
                    value: Binding(
                        get: { materialLabels.indices.contains(index) ? materialLabels[index] : "" },
                        set: { newValue in
                            if materialLabels.indices.contains(index) {
                                materialLabels[index] = newValue
                            }
                        }
                    ),
                    canDelete: materialLabels.count > 1,
                    delete: {
                        if materialLabels.indices.contains(index) {
                            _ = withAnimation(.snappy) {
                                materialLabels.remove(at: index)
                            }
                        }
                    }
                )
            }

            materialsAddDefaultCheckButton
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 2)
        }
        .padding(12)
        .background(Color.blue.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
private var notesSupplierEditor: some View {
    VStack(alignment: .leading, spacing: 12) {
        Toggle(isOn: $showNotesSupplierDraft) {
            Text(t("Show Notes / Supplier", lang: seciliDil))
                .font(.system(size: 13, weight: .semibold))
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .toggleStyle(.switch)
        .tint(.blue)
        .controlSize(.small)

        ViewThatFits(in: .horizontal) {
            HStack(spacing: 12) {
                Text(t("Heading", lang: seciliDil))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.secondary)
                    .frame(width: 90, alignment: .leading)

                TextField(t("Notes / Supplier", lang: seciliDil), text: $notesSupplierLabelDraft)
                    .textFieldStyle(.roundedBorder)
                    .frame(maxWidth: .infinity)
                    .disabled(!showNotesSupplierDraft)
                    .opacity(showNotesSupplierDraft ? 1 : 0.45)
            }

            VStack(alignment: .leading, spacing: 7) {
                Text(t("Heading", lang: seciliDil))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.secondary)

                TextField(t("Notes / Supplier", lang: seciliDil), text: $notesSupplierLabelDraft)
                    .textFieldStyle(.roundedBorder)
                    .frame(maxWidth: .infinity)
                    .disabled(!showNotesSupplierDraft)
                    .opacity(showNotesSupplierDraft ? 1 : 0.45)
            }
        }
    }
    .padding(12)
    .background(Color.gray.opacity(0.08))
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
}

    private var communicationVisibilityEditor: some View {
        VStack(alignment: .leading, spacing: 12) {
            Toggle(isOn: $communicationShowTelephoneDraft) {
                Label(t("Telephone", lang: seciliDil), systemImage: "phone")
                    .font(.system(size: 13, weight: .semibold))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .toggleStyle(.switch)
            .tint(.blue)
            .controlSize(.small)

            Toggle(isOn: $communicationShowEmailDraft) {
                Label(t("Email", lang: seciliDil), systemImage: "envelope")
                    .font(.system(size: 13, weight: .semibold))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .toggleStyle(.switch)
            .tint(.blue)
            .controlSize(.small)

            Toggle(isOn: $communicationShowAddressDraft) {
                Label(t("Address", lang: seciliDil), systemImage: "mappin.and.ellipse")
                    .font(.system(size: 13, weight: .semibold))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .toggleStyle(.switch)
            .tint(.blue)
            .controlSize(.small)

            Toggle(isOn: $communicationShowChannelDraft) {
                Label(t("Channel", lang: seciliDil), systemImage: "bubble.left.and.bubble.right")
                    .font(.system(size: 13, weight: .semibold))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .toggleStyle(.switch)
            .tint(.blue)
            .controlSize(.small)

            Toggle(isOn: $communicationShowCustomerNotesDraft) {
                Label(t("Customer Notes", lang: seciliDil), systemImage: "note.text")
                    .font(.system(size: 13, weight: .semibold))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .toggleStyle(.switch)
            .tint(.blue)
            .controlSize(.small)
        }
        .padding(12)
        .background(Color.gray.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var communicationChannelEditor: some View {
        VStack(spacing: 10) {
            if communicationChannelLabelsDraft.isEmpty {
                Text(t("No channel buttons yet. Add one below if you want another platform.", lang: seciliDil))
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 4)
            }

            ForEach(Array(communicationChannelLabelsDraft.indices), id: \.self) { index in
                HStack(spacing: 10) {
                    Text("\(index + 1)")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.secondary)
                        .frame(width: 24, height: 24)
                        .background(Color.primary.opacity(0.06))
                        .clipShape(Circle())

                    TextField(t("Channel", lang: seciliDil), text: Binding(
                        get: {
                            communicationChannelLabelsDraft.indices.contains(index) ? communicationChannelLabelsDraft[index] : ""
                        },
                        set: { newValue in
                            if communicationChannelLabelsDraft.indices.contains(index) {
                                communicationChannelLabelsDraft[index] = newValue
                            }
                        }
                    ))
                    .textFieldStyle(.plain)
                    .font(.system(size: 13, weight: .semibold))
                    .padding(10)
                    .background(Color.primary.opacity(0.06))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                    Button(role: .destructive) {
                        withAnimation(.snappy) {
                            if communicationChannelLabelsDraft.indices.contains(index) {
                                communicationChannelLabelsDraft.remove(at: index)
                            }
                        }
                    } label: {
                        Image(systemName: "minus.circle.fill")
                            .font(.system(size: 16, weight: .semibold))
                    }
                    .buttonStyle(.borderless)
                }
            }

            Button {
                withAnimation(.snappy) {
                    communicationChannelLabelsDraft.append("")
                }
            } label: {
                Label(t("Add Channel", lang: seciliDil), systemImage: "plus.circle.fill")
            }
            .buttonStyle(.borderless)
            .frame(maxWidth: .infinity, alignment: .leading)

            Text(t("Channel button names can be added, removed, or renamed. Telephone, Email and Address stay as their own fields and can be shown or hidden above.", lang: seciliDil))
                .font(.system(size: 11))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .background(Color.blue.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var specialNoteSectionsEditor: some View {
        VStack(spacing: 10) {
            ForEach(Array(editableItems.indices), id: \.self) { index in
                HStack(spacing: 10) {
                    Text("\(index + 1)")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.secondary)
                        .frame(width: 24, height: 24)
                        .background(Color.primary.opacity(0.06))
                        .clipShape(Circle())

                    TextField(t("Note Heading", lang: seciliDil), text: Binding(
                        get: {
                            editableItems.indices.contains(index) ? editableItems[index].title : ""
                        },
                        set: { newValue in
                            if editableItems.indices.contains(index) {
                                editableItems[index].title = newValue
                            }
                        }
                    ))
                    .textFieldStyle(.plain)
                    .font(.system(size: 13, weight: .semibold))
                    .padding(10)
                    .background(Color.primary.opacity(0.06))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                    if editableItems.indices.contains(index), editableItems[index].id == primarySpecialNoteID {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.secondary)
                            .help(t("This is the main Special Notes field and cannot be removed.", lang: seciliDil))
                    } else {
                        Button(role: .destructive) {
                            withAnimation(.snappy) {
                                if editableItems.indices.contains(index) {
                                    editableItems.remove(at: index)
                                }
                            }
                        } label: {
                            Image(systemName: "minus.circle.fill")
                                .font(.system(size: 16, weight: .semibold))
                        }
                        .buttonStyle(.borderless)
                    }
                }
            }

            Button {
                withAnimation(.snappy) {
                    editableItems.append(CustomStepDTO(title: "Special Note \(editableItems.count + 1)"))
                }
            } label: {
                Label(t("Add Note Field", lang: seciliDil), systemImage: "plus.circle.fill")
            }
            .buttonStyle(.borderless)
            .frame(maxWidth: .infinity, alignment: .leading)

            Text(t("Customer Notes always stay inside the Notes block. Use this section to add, remove, or rename separate Special Note fields.", lang: seciliDil))
                .font(.system(size: 11))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .background(Color.blue.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var unsupportedEditor: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(t("This block does not have editable headings yet.", lang: seciliDil))
                .font(.system(size: 14, weight: .semibold))
            Text(t("Use this menu on Production Status, Customer & Communication, Schedule, or Materials & Inventory blocks.", lang: seciliDil))
                .font(.system(size: 12))
                .foregroundColor(.secondary)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(red: 0.5, green: 0.5, blue: 0.5, opacity: 0.08))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    // Ids are what intake values are stored under, so a rename keeps the value
    // and only a delete loses it. New rows get a fresh id derived from the title.
    @ViewBuilder
    private var repairIntakeTemplateEditor: some View {
        let suggested = RepairIntakePresets.presetId(forBusinessType: editorBusinessType)
        let matched = RepairIntakePresets.matchingPresetId(for: repairIntakeRowsDraft)
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Menu {
                    ForEach(RepairIntakePresets.all) { preset in
                        Button {
                            repairIntakeRowsDraft = preset.fields
                        } label: {
                            Text(t(preset.label, lang: seciliDil) + (preset.id == suggested ? " ★" : ""))
                        }
                    }
                } label: {
                    Text(RepairIntakePresets.preset(id: matched).map { t($0.label, lang: seciliDil) }
                        ?? t("Custom rows", lang: seciliDil))
                        .font(.system(size: 13, weight: .semibold))
                }
                .fixedSize()
                Spacer()
            }
            Text(t("★ is the template suggested for your business type.", lang: seciliDil))
                .font(.system(size: 11)).foregroundColor(.secondary)
        }
    }

    @ViewBuilder
    private var repairIntakeRowsEditor: some View {
        VStack(alignment: .leading, spacing: 8) {
            if repairIntakeRowsDraft.isEmpty {
                Text(t("No rows yet.", lang: seciliDil))
                    .font(.system(size: 12)).foregroundColor(.secondary)
            }
            ForEach(Array(repairIntakeRowsDraft.enumerated()), id: \.element.id) { index, row in
                HStack(spacing: 8) {
                    Text("\(index + 1)")
                        .font(.system(size: 11)).foregroundColor(.secondary)
                        .frame(width: 18, alignment: .trailing)
                    TextField("", text: Binding(
                        get: { repairIntakeRowsDraft[index].title },
                        set: { repairIntakeRowsDraft[index].title = $0 }
                    ))
                    .textFieldStyle(.roundedBorder)
                    Button {
                        repairIntakeRowsDraft.remove(at: index)
                    } label: {
                        Image(systemName: "trash").foregroundColor(.red)
                    }
                    .buttonStyle(.plain)
                }
            }
            Button {
                let base = "row\(repairIntakeRowsDraft.count + 1)"
                var candidate = base
                var suffix = 2
                while repairIntakeRowsDraft.contains(where: { $0.id == candidate }) {
                    candidate = base + "-\(suffix)"
                    suffix += 1
                }
                repairIntakeRowsDraft.append(RepairIntakeFieldDTO(id: candidate, title: t("New Row", lang: seciliDil)))
            } label: {
                Label(t("Add Row", lang: seciliDil), systemImage: "plus.circle")
            }
            .buttonStyle(.plain)
        }
    }

    private func loadCurrentValues() {
        repairIntakeRowsDraft = decodedRepairIntakeRows()
        summaryStep1Draft = summaryStep1
        summaryStep2Draft = summaryStep2
        orderItemsHeadingDraft = orderItemsHeading
        companyNumbersDraft = (try? JSONDecoder().decode([CompanyNumberSettingDTO].self, from: Data(companyNumbersJSON.utf8))) ?? []
        orderListStep1Draft = orderListStep1
        orderListStep2Draft = orderListStep2

        if kartTipi == .summary {
            return
        }

        if kartTipi == .communication {
            communicationShowTelephoneDraft = communicationShowTelephone
            communicationShowEmailDraft = communicationShowEmail
            communicationShowAddressDraft = communicationShowAddress
            communicationShowChannelDraft = communicationShowChannel
            communicationShowCustomerNotesDraft = communicationShowCustomerNotes
            communicationChannelLabelsDraft = normalizedCommunicationChannelLabels(from: communicationChannelLabelsJSON)
            return
        }

        if kartTipi == .notes {
            let globals = normalizedSpecialNoteSections(from: specialNoteSectionsJSON)
            let globalIDs = Set(globals.map { $0.id })
            var extras: [CustomStepDTO] = []
            if let raw = orderExtraNoteSectionsJSON?.wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines),
               !raw.isEmpty,
               let data = raw.data(using: .utf8),
               let decoded = try? JSONDecoder().decode([CustomStepDTO].self, from: data) {
                extras = decoded.filter { $0.id != primarySpecialNoteID && !globalIDs.contains($0.id) }
            }
            perOrderOriginIDs = Set(extras.map { $0.id })
            editableItems = globals + extras
            return
        }

        if kartTipi == .schedule {
            if let data = scheduleQuickRemindersJSON.data(using: .utf8),
               let decoded = try? JSONDecoder().decode([ScheduleQuickReminderItem].self, from: data),
               !decoded.isEmpty {
                editableItems = decoded.map { CustomStepDTO(id: $0.id, title: $0.title) }
            } else {
                editableItems = [
                    CustomStepDTO(title: "Follow up customer"),
                    CustomStepDTO(title: "Send design update"),
                    CustomStepDTO(title: "Ask for approval"),
                    CustomStepDTO(title: "Check payment"),
                    CustomStepDTO(title: "Check materials"),
                    CustomStepDTO(title: "Quality check"),
                    CustomStepDTO(title: "Prepare shipment"),
                    CustomStepDTO(title: "Check delivery status")
                ]
            }
            return
        }

        if kartTipi == .financial {

            financialShowBaseCostDraft = financialShowBaseCost
            financialBaseCostLabelDraft = orderFinancialBaseCostLabel?.wrappedValue ?? financialBaseCostLabel

            // Per-order spending / remaining lists when opened from an order: use
            // the order's own list, seeding from the workspace template the first
            // time (so an un-customised order still shows the shared headings).
            let expenseSource = orderFinancialExpenseItemsJSON.map {
                $0.wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? financialExpenseItemsJSON : $0.wrappedValue
            } ?? financialExpenseItemsJSON
            editableItems = decodeItems(from: expenseSource)
                .filter { isUsableFinancialExpenseTitle($0.title) }

            let remainingSource = orderFinancialRemainingItemsJSON.map {
                $0.wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? financialRemainingItemsJSON : $0.wrappedValue
            } ?? financialRemainingItemsJSON
            editableToggleItems = decodeItems(from: remainingSource)
                .filter { isUsableFinancialRemainingTitle($0.title) }

            return
        }

        if kartTipi == .materials {
            let decodedDefaultLabels = decodeItems(from: materialsDefaultChecksJSON)
                .map { cleaned($0.title) }
                .filter { !$0.isEmpty }
            materialLabels = decodedDefaultLabels.isEmpty
                ? [invLabel1, invLabel2, invLabel3, invLabel4].map { cleaned($0) }.filter { !$0.isEmpty }
                : decodedDefaultLabels
            if materialLabels.isEmpty { materialLabels = ["Material Check 1"] }
            editableToggleItems = decodeItems(from: materialsTogglesJSON)
            showNotesSupplierDraft = showMaterialsNotesSupplier
            notesSupplierLabelDraft = materialsNotesSupplierLabel
            return
        }

        if kartTipi == .status {
            showNotesSupplierDraft = showStatusNotesSupplier
            notesSupplierLabelDraft = statusNotesSupplierLabel
        }

        if kartTipi == .customer {
            communicationShowTelephoneDraft = communicationShowTelephone
            communicationShowEmailDraft = communicationShowEmail
            communicationShowAddressDraft = communicationShowAddress
            communicationShowChannelDraft = communicationShowChannel
            communicationShowCustomerNotesDraft = communicationShowCustomerNotes
            communicationChannelLabelsDraft = normalizedCommunicationChannelLabels(from: communicationChannelLabelsJSON)
        }

        let source = kartTipi == .status ? customStepsJSON : customFieldsJSON
        let trimmedSource = source.trimmingCharacters(in: .whitespacesAndNewlines)
        if let data = trimmedSource.data(using: .utf8),
           let decoded = try? JSONDecoder().decode([CustomStepDTO].self, from: data) {
            if kartTipi == .status && decoded.isEmpty {
                editableItems = [CustomStepDTO(title: "Design"), CustomStepDTO(title: "Painting")]
            } else {
                editableItems = decoded
            }
        } else if kartTipi == .status {
            editableItems = [CustomStepDTO(title: "Design"), CustomStepDTO(title: "Painting")]
        } else {
            editableItems = []
        }

        if kartTipi == .status {
            editableToggleItems = decodeItems(from: customTogglesJSON)
        }
    }

    private func decodedRepairIntakeRows() -> [RepairIntakeFieldDTO] {
        let trimmed = repairIntakeFieldsJSON.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty,
           let data = trimmed.data(using: .utf8),
           let decoded = try? JSONDecoder().decode([RepairIntakeFieldDTO].self, from: data) {
            let cleanedRows = decoded.filter { !cleaned($0.id).isEmpty && !cleaned($0.title).isEmpty }
            if !cleanedRows.isEmpty { return cleanedRows }
        }
        return RepairIntakePresets.fields(forBusinessType: editorBusinessType)
    }

    private func saveChanges() {
        if kartTipi == .repairIntake {
            let rows = repairIntakeRowsDraft
                .map { RepairIntakeFieldDTO(id: cleaned($0.id), title: cleaned($0.title)) }
                .filter { !$0.id.isEmpty && !$0.title.isEmpty }
            if let data = try? JSONEncoder().encode(rows), let json = String(data: data, encoding: .utf8) {
                repairIntakeFieldsJSON = json
                syncEditedSettingsToCloud()
            }
            return
        }

        if kartTipi == .summary {
            summaryStep1 = cleaned(summaryStep1Draft).isEmpty ? "Design" : cleaned(summaryStep1Draft)
            summaryStep2 = cleaned(summaryStep2Draft).isEmpty ? "Painting" : cleaned(summaryStep2Draft)
            syncEditedSettingsToCloud()
            return
        }

        if kartTipi == .communication {
            communicationShowTelephone = communicationShowTelephoneDraft
            communicationShowEmail = communicationShowEmailDraft
            communicationShowAddress = communicationShowAddressDraft
            communicationShowChannel = communicationShowChannelDraft
            communicationShowCustomerNotes = communicationShowCustomerNotesDraft

            let cleanedLabels = communicationChannelLabelsDraft
                .map { cleaned($0) }
                .filter { !$0.isEmpty }

            let finalLabels = normalizedCommunicationChannelLabels(from: encodeStringArray(cleanedLabels))

            if let data = try? JSONEncoder().encode(finalLabels),
               let str = String(data: data, encoding: .utf8) {
                communicationChannelLabelsJSON = str
            }

            syncEditedSettingsToCloud()
            return
        }

        if kartTipi == .notes {
            // Split editable items: those that were originally per-order (or new in editor) stay per-order;
            // items that came from globals (and weren't loaded as per-order) write back to global.
            let originalGlobals = normalizedSpecialNoteSections(from: specialNoteSectionsJSON)
            let originalGlobalIDs = Set(originalGlobals.map { $0.id })
            var globalItems: [CustomStepDTO] = []
            var perOrderItems: [CustomStepDTO] = []
            for item in editableItems {
                if perOrderOriginIDs.contains(item.id) {
                    perOrderItems.append(item)
                } else if originalGlobalIDs.contains(item.id) {
                    globalItems.append(item)
                } else {
                    // New item added in editor → keep as per-order (no propagation)
                    perOrderItems.append(item)
                }
            }
            let finalGlobals = normalizedSpecialNoteSections(globalItems)
            if let data = try? JSONEncoder().encode(finalGlobals),
               let str = String(data: data, encoding: .utf8) {
                specialNoteSectionsJSON = str
                syncEditedSettingsToCloud()
            }
            if let binding = orderExtraNoteSectionsJSON {
                let cleaned = perOrderItems.filter { $0.id != primarySpecialNoteID && !$0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
                if cleaned.isEmpty {
                    binding.wrappedValue = ""
                } else if let data = try? JSONEncoder().encode(cleaned),
                          let str = String(data: data, encoding: .utf8) {
                    binding.wrappedValue = str
                }
                perOrderOriginIDs = Set(cleaned.map { $0.id })
            }
            return
        }

        if kartTipi == .schedule {
            let cleanedItems = editableItems
                .map { ScheduleQuickReminderItem(id: $0.id, title: cleaned($0.title), days: 1, hours: 0, priority: "Normal", notify: true) }
                .filter { !$0.title.isEmpty }

            let finalItems = cleanedItems.isEmpty ? [
                ScheduleQuickReminderItem(title: "Follow up customer"),
                ScheduleQuickReminderItem(title: "Send design update"),
                ScheduleQuickReminderItem(title: "Ask for approval"),
                ScheduleQuickReminderItem(title: "Check payment")
            ] : cleanedItems

            if let data = try? JSONEncoder().encode(finalItems),
               let str = String(data: data, encoding: .utf8) {
                scheduleQuickRemindersJSON = str
                syncEditedSettingsToCloud()
            }
            return
        }

        if kartTipi == .financial {

            financialShowBaseCost = financialShowBaseCostDraft
            let cleanedBaseLabelRaw = cleaned(financialBaseCostLabelDraft)
            let cleanedBaseLabel = cleanedBaseLabelRaw.isEmpty ? "Cost (Base)" : cleanedBaseLabelRaw

            if let expenseBinding = orderFinancialExpenseItemsJSON, let remainingBinding = orderFinancialRemainingItemsJSON {
                // Per-order: write the lists + base-cost label onto the order (the
                // binding setters persist them and move amount keys on rename). Only
                // the show-base-cost toggle stays workspace-wide.
                let encodedExpenses = encodeItems(editableItems)
                let encodedRemaining = encodeItems(editableToggleItems)
                expenseBinding.wrappedValue = encodedExpenses
                remainingBinding.wrappedValue = encodedRemaining
                if let baseBinding = orderFinancialBaseCostLabel {
                    baseBinding.wrappedValue = cleanedBaseLabel
                } else {
                    financialBaseCostLabel = cleanedBaseLabel
                }
                var workspacePayload: [String: Any] = ["financialShowBaseCost": financialShowBaseCost]
                if applyFinancialAsWorkspaceDefault {
                    // Promote the current lists to the workspace template so NEW
                    // orders (and existing un-customised ones) start from them.
                    financialExpenseItemsJSON = encodedExpenses
                    financialRemainingItemsJSON = encodedRemaining
                    financialBaseCostLabel = cleanedBaseLabel
                    workspacePayload["financialExpenseItemsJSON"] = encodedExpenses
                    workspacePayload["financialRemainingItemsJSON"] = encodedRemaining
                    workspacePayload["financialBaseCostLabel"] = cleanedBaseLabel
                }
                Firestore.firestore()
                    .collection("companySettings")
                    .document(firebaseManager.currentCompanyId)
                    .setData(workspacePayload, merge: true)
            } else {
                financialBaseCostLabel = cleanedBaseLabel
                financialExpenseItemsJSON = encodeItems(editableItems)
                financialRemainingItemsJSON = encodeItems(editableToggleItems)
                syncEditedSettingsToCloud()
            }
            return
        }

        if kartTipi == .materials {
            var cleanedMaterialLabels = materialLabels.map { cleaned($0) }.filter { !$0.isEmpty }
            if cleanedMaterialLabels.isEmpty { cleanedMaterialLabels = ["Material Check 1"] }
            let padded = cleanedMaterialLabels.padding(to: 4, with: "Item")
            invLabel1 = padded[0]
            invLabel2 = padded[1]
            invLabel3 = padded[2]
            invLabel4 = padded[3]
            materialsDefaultChecksJSON = encodeItems(cleanedMaterialLabels.map { CustomStepDTO(title: $0) })
            materialsTogglesJSON = encodeItems(editableToggleItems)
            showMaterialsNotesSupplier = showNotesSupplierDraft
            let materialNoteLabel = cleaned(notesSupplierLabelDraft)
            materialsNotesSupplierLabel = materialNoteLabel.isEmpty ? "Notes / Supplier" : materialNoteLabel
            syncEditedSettingsToCloud()
            return
        }

        let cleanedItems = editableItems
            .map { CustomStepDTO(id: $0.id, title: cleaned($0.title)) }
            .filter { !$0.title.isEmpty }

        let finalItems: [CustomStepDTO]
        if kartTipi == .status {
            finalItems = cleanedItems.isEmpty ? [CustomStepDTO(title: "Design"), CustomStepDTO(title: "Painting")] : cleanedItems
        } else {
            finalItems = cleanedItems
        }

        if let data = try? JSONEncoder().encode(finalItems), let str = String(data: data, encoding: .utf8) {
            if kartTipi == .status {
                customStepsJSON = str
                customTogglesJSON = encodeItems(editableToggleItems)
                showStatusNotesSupplier = showNotesSupplierDraft
                let statusNoteLabel = cleaned(notesSupplierLabelDraft)
                statusNotesSupplierLabel = statusNoteLabel.isEmpty ? "Notes / Supplier" : statusNoteLabel

                summaryStep1 = cleaned(summaryStep1Draft).isEmpty ? "Design" : cleaned(summaryStep1Draft)
                summaryStep2 = cleaned(summaryStep2Draft).isEmpty ? "Painting" : cleaned(summaryStep2Draft)
                orderListStep1 = cleaned(orderListStep1Draft).isEmpty ? summaryStep1 : cleaned(orderListStep1Draft)
                orderListStep2 = cleaned(orderListStep2Draft).isEmpty ? summaryStep2 : cleaned(orderListStep2Draft)
            } else if kartTipi == .invoiceItems {
                if let data = try? JSONEncoder().encode(companyNumbersDraft), let str = String(data: data, encoding: .utf8) {
                    companyNumbersJSON = str
                }
            } else if kartTipi == .customer {
                customFieldsJSON = str
                communicationShowTelephone = communicationShowTelephoneDraft
                communicationShowEmail = communicationShowEmailDraft
                communicationShowAddress = communicationShowAddressDraft
                communicationShowChannel = communicationShowChannelDraft
                communicationShowCustomerNotes = communicationShowCustomerNotesDraft

                let cleanedLabels = communicationChannelLabelsDraft
                    .map { cleaned($0) }
                    .filter { !$0.isEmpty }
                let finalLabels = normalizedCommunicationChannelLabels(from: encodeStringArray(cleanedLabels))

                if let labelData = try? JSONEncoder().encode(finalLabels),
                   let labelString = String(data: labelData, encoding: .utf8) {
                    communicationChannelLabelsJSON = labelString
                }
            }

            syncEditedSettingsToCloud()
        }
    }

    private func syncEditedSettingsToCloud() {
        Firestore.firestore()
            .collection("companySettings")
            .document(firebaseManager.currentCompanyId)
            .setData([
                "customStepsJSON": customStepsJSON,
                "customFieldsJSON": customFieldsJSON,
                "customTogglesJSON": customTogglesJSON,
                "materialsTogglesJSON": materialsTogglesJSON,
                "materialsDefaultChecksJSON": materialsDefaultChecksJSON,
                "financialExpenseItemsJSON": financialExpenseItemsJSON,
                "financialRemainingItemsJSON": financialRemainingItemsJSON,
                "financialShowBaseCost": financialShowBaseCost,
                "financialBaseCostLabel": financialBaseCostLabel,
                "summaryStep1": summaryStep1,
                "summaryStep2": summaryStep2,
                "orderListStep1": orderListStep1,
                "orderListStep2": orderListStep2,
                "invLabel1": invLabel1,
                "invLabel2": invLabel2,
                "invLabel3": invLabel3,
                "invLabel4": invLabel4,
                "showStatusNotesSupplier": showStatusNotesSupplier,
                "showMaterialsNotesSupplier": showMaterialsNotesSupplier,
                "statusNotesSupplierLabel": statusNotesSupplierLabel,
                "materialsNotesSupplierLabel": materialsNotesSupplierLabel,
                "scheduleQuickRemindersJSON": scheduleQuickRemindersJSON,
                "communicationShowTelephone": communicationShowTelephone,
                "communicationShowEmail": communicationShowEmail,
                "communicationShowAddress": communicationShowAddress,
                "communicationShowChannel": communicationShowChannel,
                "communicationShowCustomerNotes": communicationShowCustomerNotes,
                "communicationChannelLabelsJSON": communicationChannelLabelsJSON,
                "specialNoteSectionsJSON": specialNoteSectionsJSON,
                "workflowSettingsUpdatedAt": FieldValue.serverTimestamp()
            ], merge: true)
    }

    private func normalizedCommunicationChannelLabels(from json: String) -> [String] {
        let defaults = ["Instagram", "WhatsApp", "TikTok"]
        let trimmedJSON = json.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedJSON.isEmpty,
              let data = trimmedJSON.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([String].self, from: data) else {
            return defaults
        }

        var labels: [String] = []
        for rawLabel in decoded {
            let value = cleaned(rawLabel)
            guard !value.isEmpty else { continue }
            if !labels.contains(where: { $0.caseInsensitiveCompare(value) == .orderedSame }) {
                labels.append(value)
            }
        }
        return labels
    }

    private func encodeStringArray(_ values: [String]) -> String {
        guard let data = try? JSONEncoder().encode(values), let str = String(data: data, encoding: .utf8) else { return "" }
        return str
    }

    private func decodeItems(from json: String) -> [CustomStepDTO] {
        guard let data = json.data(using: .utf8), let decoded = try? JSONDecoder().decode([CustomStepDTO].self, from: data) else { return [] }
        return decoded
    }

    private func encodeItems(_ items: [CustomStepDTO]) -> String {
        let cleanedItems = items
            .map { CustomStepDTO(id: $0.id, title: cleaned($0.title)) }
            .filter { !$0.title.isEmpty }
        guard let data = try? JSONEncoder().encode(cleanedItems), let str = String(data: data, encoding: .utf8) else { return "" }
        return str
    }

    private func cleaned(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func nextDefaultTitle() -> String {
        kartTipi == .status ? "Step \(editableItems.count + 1)" : (kartTipi == .schedule ? "Custom reminder" : "Custom Field \(editableItems.count + 1)")
    }

    private func nextDefaultToggleTitle() -> String {
        kartTipi == .materials ? "Material Check \(editableToggleItems.count + 1)" : "Check \(editableToggleItems.count + 1)"
    }

    private func nextDefaultFinancialExpenseTitle() -> String {
        ""
    }

    private func nextDefaultFinancialRemainingTitle() -> String {
        ""
    }

    private func moveItem(_ index: Int, _ offset: Int) {
        let newIndex = index + offset
        guard editableItems.indices.contains(index), editableItems.indices.contains(newIndex) else { return }
        withAnimation(.snappy) {
            let item = editableItems.remove(at: index)
            editableItems.insert(item, at: newIndex)
        }
    }

    private func moveToggleItem(_ index: Int, _ offset: Int) {
        let newIndex = index + offset
        guard editableToggleItems.indices.contains(index), editableToggleItems.indices.contains(newIndex) else { return }
        withAnimation(.snappy) {
            let item = editableToggleItems.remove(at: index)
            editableToggleItems.insert(item, at: newIndex)
        }
    }

    private func indexForItem(_ id: UUID) -> Int {
        editableItems.firstIndex(where: { $0.id == id }) ?? 0
    }

    private func indexForToggleItem(_ id: UUID) -> Int {
        editableToggleItems.firstIndex(where: { $0.id == id }) ?? 0
    }

    private func moveItemByID(_ id: UUID, _ offset: Int) {
        guard let index = editableItems.firstIndex(where: { $0.id == id }) else { return }
        moveItem(index, offset)
    }

    private func moveToggleItemByID(_ id: UUID, _ offset: Int) {
        guard let index = editableToggleItems.firstIndex(where: { $0.id == id }) else { return }
        moveToggleItem(index, offset)
    }

    private func deleteItemByID(_ id: UUID) {
        DispatchQueue.main.async {
            guard let index = editableItems.firstIndex(where: { $0.id == id }) else { return }
            editableItems.remove(at: index)
        }
    }

    private func deleteToggleItemByID(_ id: UUID) {
        DispatchQueue.main.async {
            guard let index = editableToggleItems.firstIndex(where: { $0.id == id }) else { return }
            editableToggleItems.remove(at: index)
        }
    }
}

private struct PickerRow: View {
    let title: String
    @Binding var selection: String
    let options: [String]
    let language: String
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    private var isCompact: Bool {
        horizontalSizeClass == .compact
    }

    var body: some View {
        if isCompact {
            VStack(alignment: .leading, spacing: 7) {
                Text(title)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.secondary)

                Picker(title, selection: $selection) {
                    ForEach(options, id: \.self) { option in
                        Text(t(option, lang: language)).tag(option)
                    }
                }
                .pickerStyle(.menu)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else {
            HStack(spacing: 12) {
                Text(title)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.secondary)
                    .frame(width: 105, alignment: .leading)

                Picker(title, selection: $selection) {
                    ForEach(options, id: \.self) { option in
                        Text(t(option, lang: language)).tag(option)
                    }
                }
                .pickerStyle(.menu)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

private struct EditorSectionTitle: View {
    let title: String
    let systemImage: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .foregroundColor(.blue)
            Text(title)
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.primary)
            Spacer()
        }
    }
}

private struct EditableHeadingRow: View {
    @Binding var item: CustomStepDTO
    let index: Int
    let totalCount: Int
    let isStatusBlock: Bool
    let language: String
    let moveUp: () -> Void
    let moveDown: () -> Void
    let delete: () -> Void
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    private var isCompact: Bool {
        horizontalSizeClass == .compact
    }

    var body: some View {
        Group {
            if isCompact {
                VStack(alignment: .leading, spacing: 9) {
                    HStack(spacing: 8) {
                        rowNumber
                        Spacer()
                        rowButtons
                    }

                    TextField(t("Heading", lang: language), text: $item.title)
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: .infinity)
                }
            } else {
                HStack(spacing: 10) {
                    rowNumber

                    TextField(t("Heading", lang: language), text: $item.title)
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: .infinity)

                    rowButtons
                }
            }
        }
        .padding(10)
        .background(Color.gray.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var rowNumber: some View {
        Text("\(index + 1)")
            .font(.system(size: 12, weight: .bold))
            .foregroundColor(.secondary)
            .frame(width: 28, height: 28)
            .background(Color.gray.opacity(0.10))
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private var rowButtons: some View {
        HStack(spacing: isCompact ? 10 : 8) {
            Button(action: moveUp) {
                Image(systemName: "chevron.up")
            }
            .buttonStyle(.borderless)
            .disabled(index == 0)

            Button(action: moveDown) {
                Image(systemName: "chevron.down")
            }
            .buttonStyle(.borderless)
            .disabled(index >= totalCount - 1)

            Button(role: .destructive, action: delete) {
                Image(systemName: "trash")
            }
            .buttonStyle(.borderless)
            .disabled(isStatusBlock && totalCount <= 1)
        }
    }
}

private struct MaterialHeadingRow: View {
    let label: String
    let headingPlaceholder: String
    @Binding var value: String
    let canDelete: Bool
    let delete: () -> Void
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    private var isCompact: Bool {
        horizontalSizeClass == .compact
    }

    var body: some View {
        Group {
            if isCompact {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        Text(label)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.secondary)

                        Spacer()

                        deleteButton
                    }

                    TextField(headingPlaceholder, text: $value)
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: .infinity)
                }
            } else {
                HStack(spacing: 10) {
                    Text(label)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.secondary)
                        .frame(width: 78, alignment: .leading)

                    TextField(headingPlaceholder, text: $value)
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: .infinity)

                    deleteButton
                }
            }
        }
        .padding(10)
        .background(Color.gray.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var deleteButton: some View {
        Button(role: .destructive, action: delete) {
            Image(systemName: "trash")
        }
        .buttonStyle(.borderless)
        .disabled(!canDelete)
        .opacity(canDelete ? 1 : 0.35)
    }
}

private extension Array where Element == String {
    func padding(to count: Int, with fallback: String) -> [String] {
        var result = self
        while result.count < count { result.append(fallback) }
        if result.count > count { result = Array(result.prefix(count)) }
        return result
    }
}

struct OrderMergeSelectedSheet: View {
    let orders: [Siparis]
    let companyId: String
    let seciliDil: String
    let onMerged: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var primaryId: String? = nil
    @State private var merging = false
    @State private var errorText: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text(t("Merge selected orders", lang: seciliDil))
                    .font(.system(size: 18, weight: .bold))
                Spacer()
                Button(t("Cancel", lang: seciliDil)) { dismiss() }
                    .disabled(merging)
            }

            Text(t("Pick the main order to keep. The other selected orders' payments move into it, then they go to Trash.", lang: seciliDil))
                .font(.system(size: 12))
                .foregroundColor(.gray)
                .fixedSize(horizontal: false, vertical: true)

            if orders.count < 2 {
                Text(t("Select at least two orders to merge.", lang: seciliDil))
                    .font(.system(size: 13))
                    .foregroundColor(.gray)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 24)
            } else {
                ScrollView {
                    VStack(spacing: 6) {
                        ForEach(orders, id: \.id) { order in
                            let isPrimary = primaryId == order.id
                            Button {
                                primaryId = order.id
                            } label: {
                                HStack {
                                    Image(systemName: isPrimary ? "largecircle.fill.circle" : "circle")
                                        .foregroundColor(isPrimary ? .blue : .gray)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(order.customerName)
                                            .font(.system(size: 14, weight: .semibold))
                                            .foregroundColor(.primary)
                                        Text((order.designName.isEmpty ? "-" : order.designName) + " · " + order.paymentDate.formatted(date: .abbreviated, time: .omitted))
                                            .font(.system(size: 12))
                                            .foregroundColor(.gray)
                                    }
                                    Spacer()
                                    if isPrimary {
                                        Text(t("Main", lang: seciliDil))
                                            .font(.system(size: 11, weight: .bold))
                                            .foregroundColor(.blue)
                                    }
                                }
                                .padding(10)
                                .background(isPrimary ? Color.blue.opacity(0.10) : Color.gray.opacity(0.06))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .stroke(isPrimary ? Color.blue : Color.gray.opacity(0.2), lineWidth: isPrimary ? 2 : 1)
                                )
                                .cornerRadius(8)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .frame(maxHeight: 320)
            }

            if let errorText {
                Text(errorText).font(.system(size: 12)).foregroundColor(.red)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack {
                Spacer()
                Button {
                    performMerge()
                } label: {
                    Text(merging ? t("Merging…", lang: seciliDil) : t("Merge", lang: seciliDil))
                        .fontWeight(.bold)
                }
                .buttonStyle(.borderedProminent)
                .disabled(primaryId == nil || merging || orders.count < 2)
            }
        }
        .padding(20)
        .frame(minWidth: 380, minHeight: 360)
        .onAppear {
            if primaryId == nil { primaryId = orders.first?.id }
        }
    }

    private func performMerge() {
        #if canImport(FirebaseFunctions)
        guard let primary = primaryId, !companyId.isEmpty, !primary.isEmpty else { return }
        let sourceIds = orders.compactMap { $0.id }.filter { $0 != primary && !$0.isEmpty }
        guard !sourceIds.isEmpty else { return }
        merging = true
        errorText = nil
        let payload: [String: Any] = [
            "companyId": companyId,
            "primaryOrderId": primary,
            "sourceOrderIds": sourceIds
        ]
        Functions.functions(region: "europe-west2")
            .httpsCallable("mergeOrders")
            .call(payload) { _, error in
                DispatchQueue.main.async {
                    merging = false
                    if let error {
                        errorText = error.localizedDescription
                        return
                    }
                    onMerged()
                }
            }
        #else
        errorText = "Firebase Functions unavailable."
        #endif
    }
}

struct PriorityMenuField: View { let label: String; @Binding var value: String; let options: [String]; var editableLabelRaw: String? = nil; var onLabelCommit: ((String) -> Void)? = nil; @AppStorage("seciliDil") private var seciliDil: String = "English"; @ViewBuilder private var labelView: some View { if let editableLabelRaw, let onLabelCommit { InlineEditableLabel(display: label, rawValue: editableLabelRaw, helpText: t("Rename", lang: seciliDil), onCommit: onLabelCommit).frame(width: 110, alignment: .leading) } else { Text(label).font(.system(size: 13)).foregroundColor(.gray).frame(width: 110, alignment: .leading) } }; var body: some View { HStack { labelView; Spacer(); Menu { ForEach(options, id: \.self) { option in Button(t(option, lang: seciliDil)) { value = option } } } label: { Text(t(value, lang: seciliDil)).font(.system(size: 12, weight: .bold)).foregroundColor(getColor()).padding(.horizontal, 12).padding(.vertical, 6).background(getColor().opacity(0.2)).cornerRadius(6) }.buttonStyle(.plain) } }; private func getColor() -> Color { switch value { case "Urgent": return .red; case "High": return studioWarningOrange; case "Normal": return .green; default: return .gray } } }
struct StatusMenuField: View { let label: String; @Binding var value: String; let options: [String]; var editableLabelRaw: String? = nil; var onLabelCommit: ((String) -> Void)? = nil; @AppStorage("seciliDil") private var seciliDil: String = "English"; @ViewBuilder private var labelView: some View { if let editableLabelRaw, let onLabelCommit { InlineEditableLabel(display: label, rawValue: editableLabelRaw, helpText: t("Rename", lang: seciliDil), onCommit: onLabelCommit).frame(width: 110, alignment: .leading) } else { Text(label).font(.system(size: 13)).foregroundColor(.gray).frame(width: 110, alignment: .leading) } }; var body: some View { HStack { labelView; Spacer(); Menu { ForEach(options, id: \.self) { option in Button(t(option, lang: seciliDil)) { value = option } } } label: { Text(t(value, lang: seciliDil)).font(.system(size: 12, weight: .bold)).foregroundColor(dinamikRenk(icin: value)).padding(.horizontal, 12).padding(.vertical, 6).background(dinamikRenk(icin: value).opacity(0.2)).cornerRadius(6) }.buttonStyle(.plain) } } }
func dinamikRenk(icin value: String) -> Color {
    let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let yesiller: Set<String> = ["none", "done", "completed", "delivered", "approved", "deposit paid", "shipped", "ready to ship"]
    let kirmizilar: Set<String> = ["not yet", "blocked", "overdue", "urgent"]
    let griler: Set<String> = ["cancelled", "refunded", "new", "quoted", "low"]
    if yesiller.contains(normalized) { return .green }
    if kirmizilar.contains(normalized) { return .red }
    if griler.contains(normalized) { return .gray }
    return studioWarningOrange
}
struct YesNoField: View { let label: String; @Binding var value: Bool; var editableLabelRaw: String? = nil; var onLabelCommit: ((String) -> Void)? = nil; @AppStorage("seciliDil") private var seciliDil: String = "English"; @ViewBuilder private var labelView: some View { if let editableLabelRaw, let onLabelCommit { InlineEditableLabel(display: label, rawValue: editableLabelRaw, helpText: t("Rename", lang: seciliDil), onCommit: onLabelCommit).frame(width: 110, alignment: .leading) } else { Text(label).font(.system(size: 13)).foregroundColor(.gray).frame(width: 110, alignment: .leading) } }; var body: some View { HStack { labelView; Spacer(); HStack(spacing: 6) { Button(action: { value = true }) { Text(t("Yes", lang: seciliDil)).font(.system(size: 11, weight: .bold)).foregroundColor(value ? .green : .gray).padding(.horizontal, 14).padding(.vertical, 6).background(value ? Color.green.opacity(0.2) : Color.primary.opacity(0.05)).cornerRadius(6).overlay(RoundedRectangle(cornerRadius: 6).stroke(value ? Color.green.opacity(0.5) : Color.clear, lineWidth: 1)) }; Button(action: { value = false }) { Text(t("No", lang: seciliDil)).font(.system(size: 11, weight: .bold)).foregroundColor(!value ? .red : .gray).padding(.horizontal, 14).padding(.vertical, 6).background(!value ? Color.red.opacity(0.2) : Color.primary.opacity(0.05)).cornerRadius(6).overlay(RoundedRectangle(cornerRadius: 6).stroke(!value ? Color.red.opacity(0.5) : Color.clear, lineWidth: 1)) } }.buttonStyle(.plain) } } }

private func colorSchemeFieldSurface(isReadOnly: Bool = false) -> some View {
    RoundedRectangle(cornerRadius: 8, style: .continuous)
        .fill(Color.primary.opacity(isReadOnly ? 0.015 : 0.06))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Color.primary.opacity(0.05), lineWidth: 1)
        )
}

struct NoteSupplierField: View {
    let label: String
    @Binding var value: String
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.gray)

            ZStack(alignment: .topLeading) {
                TextEditor(text: $value)
                    .font(.system(size: 13))
                    .foregroundColor(.primary)
                    .frame(minHeight: 86)
                    .padding(8)
                    .scrollContentBackground(.hidden)
                    .background(colorSchemeFieldSurface())
                    .cornerRadius(8)
                    .focused($isFocused)

                if value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isFocused {
                    Text(t("Add notes or supplier details...", lang: seciliDil))
                        .font(.system(size: 13))
                        .foregroundColor(.gray.opacity(0.55))
                        .padding(.top, 16)
                        .padding(.leading, 14)
                        .allowsHitTesting(false)
                }
            }
        }
    }
}

struct DetailField: View {
    let label: String
    @Binding var value: String
    var editableLabelRaw: String? = nil
    var onLabelCommit: ((String) -> Void)? = nil
    @AppStorage("seciliDil") private var seciliDil: String = "English"

    @ViewBuilder private var labelView: some View {
        if let editableLabelRaw, let onLabelCommit {
            InlineEditableLabel(display: label, rawValue: editableLabelRaw, helpText: t("Rename", lang: seciliDil), onCommit: onLabelCommit)
                .frame(width: 110, alignment: .leading)
        } else {
            Text(label).font(.system(size: 13)).foregroundColor(.gray).frame(width: 110, alignment: .leading)
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            labelView
            TextField("", text: $value)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .foregroundColor(.primary)
                .padding(.vertical, 8)
                .padding(.horizontal, 10)
                .background(colorSchemeFieldSurface())
                .cornerRadius(6)
        }
    }
}

struct CommitDetailField: View {
    let label: String
    @Binding var value: String
    var emptyFallback: String? = nil
    @State private var draftValue: String = ""
    @FocusState private var isFocused: Bool

    private func commitDraft() {
        let nextValue = draftValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? (emptyFallback ?? draftValue) : draftValue
        if nextValue != value {
            value = nextValue
        }
        if nextValue != draftValue {
            draftValue = nextValue
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            Text(label).font(.system(size: 13)).foregroundColor(.gray).frame(width: 110, alignment: .leading)
            TextField("", text: $draftValue)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .foregroundColor(.primary)
                .padding(.vertical, 8)
                .padding(.horizontal, 10)
                .background(colorSchemeFieldSurface())
                .cornerRadius(6)
                .focused($isFocused)
                .onSubmit {
                    commitDraft()
                }
        }
        .onAppear {
            draftValue = value
        }
        .onChange(of: value) { _, newValue in
            if !isFocused {
                draftValue = newValue
            }
        }
        .onChange(of: isFocused) { _, focused in
            if focused {
                draftValue = value
            } else {
                commitDraft()
            }
        }
        .onDisappear {
            commitDraft()
        }
    }
}
// Inline-rename label: lets a card heading be renamed in place instead of
// opening the Edit Block Headings sheet. macOS reveals a subtle highlight +
// pencil on hover and edits on click; iPhone edits on long-press (with a
// haptic). Return / tapping away commits; Escape cancels (macOS).
private struct InlineEditableLabel: View {
    let display: String
    let rawValue: String
    var helpText: String = ""
    let onCommit: (String) -> Void

    @State private var isEditing = false
    @State private var draft = ""
    @State private var isHovering = false
    @FocusState private var focused: Bool

    var body: some View {
        Group {
            if isEditing {
                editingField
            } else {
                staticLabel
            }
        }
    }

    private var editingField: some View {
        TextField("", text: $draft)
            .textFieldStyle(.plain)
            .font(.system(size: 13))
            .foregroundColor(.primary)
            .focused($focused)
            .onSubmit(commit)
            .onChange(of: focused) { _, nowFocused in
                if !nowFocused { commit() }
            }
            .onAppear { focused = true }
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(Color.primary.opacity(0.06))
                    .overlay(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .strokeBorder(Color.accentColor.opacity(0.7), lineWidth: 1.5)
                    )
                    .padding(EdgeInsets(top: -3, leading: -6, bottom: -3, trailing: -6))
            )
            #if os(macOS)
            .onExitCommand(perform: cancel)
            #endif
    }

    private var staticLabel: some View {
        let labelContent = HStack(spacing: 4) {
            Text(display)
                .font(.system(size: 13))
                .foregroundColor(.gray)
                .lineLimit(1)
            Image(systemName: "pencil")
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(.secondary)
                .opacity(isHovering ? 0.9 : 0)
        }
        .background(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(isHovering ? Color.primary.opacity(0.07) : Color.clear)
                .padding(EdgeInsets(top: -3, leading: -6, bottom: -3, trailing: -6))
        )
        .contentShape(Rectangle())

        #if os(macOS)
        return labelContent
            .onHover { hovering in
                withAnimation(.easeOut(duration: 0.12)) { isHovering = hovering }
            }
            .onTapGesture(perform: beginEditing)
            .help(helpText)
        #else
        return labelContent
            .onLongPressGesture(minimumDuration: 0.4) {
                PlatformHaptics.lightSelection()
                beginEditing()
            }
        #endif
    }

    private func beginEditing() {
        draft = rawValue
        isEditing = true
    }

    private func commit() {
        guard isEditing else { return }
        isEditing = false
        let cleaned = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleaned.isEmpty && cleaned != rawValue { onCommit(cleaned) }
    }

    private func cancel() {
        isEditing = false
    }
}

struct CurrencyField: View {
    let label: String
    @Binding var value: Double
    var isCost: Bool = false
    var isReadOnly: Bool = false
    var sembol: String = "£"
    var ondalik: String = "."
    var onCommit: (() -> Void)? = nil
    // When both are set (macOS), the label becomes an inline-editable heading.
    var editableLabelRaw: String? = nil
    var onLabelCommit: ((String) -> Void)? = nil
    @State private var textValue: String = ""
    @FocusState private var isFocused: Bool
    @AppStorage("hideSensitiveNumbers") private var hideSensitiveNumbers: Bool = false
    @AppStorage("seciliDil") private var seciliDil: String = "English"

    @ViewBuilder private var labelView: some View {
        if let editableLabelRaw, let onLabelCommit {
            InlineEditableLabel(display: label, rawValue: editableLabelRaw, helpText: t("Rename", lang: seciliDil), onCommit: onLabelCommit)
                .frame(width: 110, alignment: .leading)
        } else {
            Text(label).font(.system(size: 13)).foregroundColor(.gray).frame(width: 110, alignment: .leading)
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            labelView
            HStack(spacing: 2) {
                Text(sembol).font(.system(size: 13, weight: .bold)).foregroundColor(isCost ? .red : .green)
                if hideSensitiveNumbers {
                    Text("••••")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(isCost ? .red : .green)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    TextField("0.00", text: $textValue)
                        .focused($isFocused)
                        .textFieldStyle(.plain)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(isCost ? .red : .green)
                }
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 10)
            .background(colorSchemeFieldSurface(isReadOnly: isReadOnly))
            .cornerRadius(6)
            .disabled(isReadOnly || hideSensitiveNumbers)
            .onChange(of: textValue) { _, newValue in
                if isFocused {
                    let temiz = newValue.replacingOccurrences(of: ondalik == "," ? "." : ",", with: "")
                    let formatli = temiz.replacingOccurrences(of: ondalik, with: ".")
                    if let sayi = Double(formatli) { value = sayi } else if newValue.isEmpty { value = 0.0 }
                }
            }
            .onChange(of: isFocused) { _, focused in
                if !focused { textValue = formatFiyat(value, ondalik: ondalik); onCommit?() }
                else {
                    let str = String(format: "%.2f", value).replacingOccurrences(of: ".", with: ondalik)
                    textValue = value == 0.0 ? "" : (value.truncatingRemainder(dividingBy: 1) == 0 ? String(format: "%.0f", value) : str)
                }
            }
            .onAppear { textValue = formatFiyat(value, ondalik: ondalik) }
            .onChange(of: value) { _, newValue in if !isFocused { textValue = formatFiyat(newValue, ondalik: ondalik) } }
        }
    }
}
struct StepperField: View {
    let label: String
    @Binding var value: Int
    let lblGun: String
    var color: Color = .green

    var body: some View {
        HStack {
            Text(label).font(.system(size: 13)).foregroundColor(.gray).frame(width: 110, alignment: .leading)
            Spacer()
            Stepper("\(value) \(lblGun)", value: $value, in: 0...365).labelsHidden()
            Text("\(value) \(lblGun)")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(color)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(color.opacity(0.1))
                .cornerRadius(10)
        }
    }
}
struct DatePickerField: View {
    let label: String
    @Binding var date: Date

    var body: some View {
        HStack {
            Text(label).font(.system(size: 13)).foregroundColor(.gray).frame(width: 110, alignment: .leading)
            Spacer()
            DatePicker("", selection: $date, displayedComponents: .date).labelsHidden()
        }
    }
}
struct PickerField: View {
    let label: String
    @Binding var value: String
    let options: [String]
    @AppStorage("seciliDil") private var seciliDil: String = "English"

    var body: some View {
        HStack(spacing: 10) {
            Text(label)
                .font(.system(size: 13))
                .foregroundColor(.gray)
                .frame(width: 110, alignment: .leading)

            Spacer(minLength: 8)

            Menu {
                ForEach(options, id: \.self) { option in
                    Button(t(option, lang: seciliDil)) {
                        value = option
                    }
                }
            } label: {
                HStack(spacing: 8) {
                    Text(t(value, lang: seciliDil))
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.primary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .minimumScaleFactor(0.78)

                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 8)
                .padding(.horizontal, 10)
                .frame(maxWidth: 220, alignment: .trailing)
                .background(colorSchemeFieldSurface())
                .cornerRadius(8)
            }
            .buttonStyle(.plain)
        }
    }
}

// Green source strip shown when an order came from the official Shopify app
// (customFields.Source == "Shopify"). Mirrors the web ShopifySourceStrip:
// store · order no · payment · original amount on currency mismatch ·
// fulfilment · deep link into the Shopify admin. Separate struct on purpose —
// deeply nested bodies overflow the stack on real iPhones.
struct ShopifyOrderSourceStrip: View {
    let customFields: [String: String]
    let isDispatched: Bool
    let language: String
    let workspaceCurrency: String

    private static let symbolToCode: [String: String] = [
        "£": "GBP", "$": "USD", "€": "EUR", "₺": "TRY", "¥": "JPY",
        "AED": "AED", "CAD": "CAD", "AUD": "AUD", "CHF": "CHF"
    ]
    private static let codeToSymbol: [String: String] = [
        "GBP": "£", "USD": "$", "EUR": "€", "TRY": "₺", "JPY": "¥"
    ]

    private var isShopify: Bool {
        (customFields["Source"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines) == "Shopify"
    }

    private var storeName: String {
        let name = (customFields["Shopify Store"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !name.isEmpty { return name }
        let domain = (customFields["Shopify Domain"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return domain.isEmpty ? "Shopify" : domain
    }

    private var orderNumber: String {
        (customFields["Shopify Order Number"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var paymentStatus: String {
        (customFields["Shopify Status"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // Amounts import as raw numbers (never converted); when the store charged
    // in a different currency than the workspace displays, show the original.
    private var originalAmount: String {
        let code = (customFields["Shopify Currency"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let total = (customFields["Shopify Total"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let workspaceCode = Self.symbolToCode[workspaceCurrency.trimmingCharacters(in: .whitespacesAndNewlines)] ?? ""
        guard !code.isEmpty, !total.isEmpty, !workspaceCode.isEmpty, code != workspaceCode else { return "" }
        return "\(Self.codeToSymbol[code] ?? "")\(total) \(code)"
    }

    private var adminURL: URL? {
        let domain = (customFields["Shopify Domain"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let orderId = (customFields["Shopify Order ID"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let handle = domain.replacingOccurrences(of: ".myshopify.com", with: "")
        guard !handle.isEmpty, !orderId.isEmpty else { return nil }
        return URL(string: "https://admin.shopify.com/store/\(handle)/orders/\(orderId)")
    }

    var body: some View {
        if isShopify {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    Text("Shopify")
                        .font(.system(size: 10.5, weight: .bold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color.green.opacity(0.18))
                        .foregroundColor(.green)
                        .clipShape(Capsule())

                    Text(storeName)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.primary)

                    if !orderNumber.isEmpty {
                        Text("· \(orderNumber)").font(.system(size: 12)).foregroundColor(.secondary)
                    }
                    if !paymentStatus.isEmpty {
                        Text("· \(t("Payment", lang: language)): \(paymentStatus)")
                            .font(.system(size: 12)).foregroundColor(.secondary)
                    }
                    if !originalAmount.isEmpty {
                        Text("· \(originalAmount)").font(.system(size: 12, weight: .semibold)).foregroundColor(.primary)
                    }
                    Text("· \(isDispatched ? t("Fulfilled", lang: language) : t("Unfulfilled", lang: language))")
                        .font(.system(size: 12)).foregroundColor(.secondary)

                    if let url = adminURL {
                        Link(destination: url) {
                            Text("\(t("View in Shopify", lang: language)) ↗")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.green)
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
            }
            .background(Color.green.opacity(0.07))
        }
    }
}
