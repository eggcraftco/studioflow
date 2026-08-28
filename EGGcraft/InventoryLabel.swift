import SwiftUI
import CoreImage
import CoreImage.CIFilterBuiltins
#if os(macOS)
import AppKit
#endif

/// The Apple half of studioflow-web/lib/studioflow/inventory.ts.
///
/// A bare item number is useless to a phone camera: it offers a web search for
/// a meaningless string. The code has to be a link that lands on the item, so
/// the value is built here once and every surface reads it — on the web the
/// printable label and the on-screen code drifted apart, and the on-screen one
/// silently went back to sending people to Google.

enum InventoryLabel {
    static let origin = "https://nivadesk.app"

    static func qrValue(for reference: String) -> String {
        let clean = reference.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return origin + "/inventory" }
        // Matches JavaScript's encodeURIComponent, so the three platforms print
        // the SAME url: `.alphanumerics` alone would turn INV-1042 into
        // INV%2D1042, which still resolves but is not the same label.
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-_.!~*'()")
        let encoded = clean.addingPercentEncoding(withAllowedCharacters: allowed) ?? clean
        return "\(origin)/inventory?item=\(encoded)"
    }

    /// CoreImage rather than a dependency: a QR code is a system feature on
    /// every Apple platform we ship to.
    static func qrImage(for value: String, scale: CGFloat = 10) -> Image? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(value.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: scale, y: scale)),
              let cgImage = CIContext().createCGImage(output, from: output.extent) else { return nil }
        #if os(macOS)
        return Image(nsImage: NSImage(cgImage: cgImage, size: NSSize(width: output.extent.width, height: output.extent.height)))
        #else
        return Image(uiImage: UIImage(cgImage: cgImage))
        #endif
    }
}

/// The QR block on an item, matching the web panel's "QR / Barcode" card: the
/// code, the number printed underneath so it survives a dead phone battery,
/// and a line saying what scanning it does.
struct InventoryQRCard: View {
    let reference: String
    let lang: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(t("QR / Barcode", lang: lang))
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.secondary)
            HStack(spacing: 12) {
                if let image = InventoryLabel.qrImage(for: InventoryLabel.qrValue(for: reference)) {
                    image
                        .interpolation(.none)
                        .resizable()
                        .frame(width: 96, height: 96)
                } else {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color.secondary.opacity(0.12))
                        .frame(width: 96, height: 96)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(reference).font(.system(size: 14, weight: .bold))
                    Text(t("Scan to view item", lang: lang))
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
                Spacer(minLength: 0)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.secondary.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
    }
}

/// A printable label for one item.
///
/// Its job is to survive on a drawer: the number big enough to read at arm's
/// length, the QR beside it, and the workshop's name so a stray label can be
/// traced back. Mac prints it; a phone shares it, because a phone has no
/// printer but usually has one on the network.
struct InventoryLabelSheet: View {
    let reference: String
    let name: String
    let location: String
    let workspaceName: String
    let lang: String
    let onClose: () -> Void

    private var label: some View {
        HStack(alignment: .center, spacing: 12) {
            if let image = InventoryLabel.qrImage(for: InventoryLabel.qrValue(for: reference)) {
                image.interpolation(.none).resizable().frame(width: 84, height: 84)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(reference).font(.system(size: 16, weight: .heavy))
                Text(name).font(.system(size: 10, weight: .semibold)).lineLimit(2)
                if !location.isEmpty {
                    Text(location).font(.system(size: 9)).foregroundColor(.secondary)
                }
                Text(workspaceName).font(.system(size: 7)).foregroundColor(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(width: 260, alignment: .leading)
        .background(Color.white)
        .foregroundColor(.black)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.gray.opacity(0.4), style: StrokeStyle(lineWidth: 1, dash: [4])))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                label
                Text(t("The number stays readable long after any phone is gone.", lang: lang))
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                Spacer()
            }
            .padding(20)
            .navigationTitle(t("Label", lang: lang))
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(t("Close", lang: lang)) { onClose() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    #if os(macOS)
                    Button(t("Print", lang: lang)) { printLabel() }
                    #else
                    ShareLink(item: shareText) { Text(t("Share", lang: lang)) }
                    #endif
                }
            }
        }
    }

    private var shareText: String {
        "\(reference) — \(name)\n\(InventoryLabel.qrValue(for: reference))"
    }

    #if os(macOS)
    private func printLabel() {
        let renderer = ImageRenderer(content: label)
        renderer.scale = 3
        guard let image = renderer.nsImage else { return }
        let view = NSImageView(frame: NSRect(origin: .zero, size: image.size))
        view.image = image
        let info = NSPrintInfo.shared
        info.topMargin = 18; info.bottomMargin = 18
        info.leftMargin = 18; info.rightMargin = 18
        NSPrintOperation(view: view, printInfo: info).run()
    }
    #endif
}
