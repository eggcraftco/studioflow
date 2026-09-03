import SwiftUI
#if canImport(AppKit)
import AppKit
#endif
#if canImport(UIKit)
import UIKit
#endif

// Settings design system (design handoff, Sept 2026) — the tokens and the shell
// pieces every Settings screen shares on Mac and iPhone, mirroring the web's
// .settings-workspace: canvas #F3F5F9, surface #FFFFFF, text #141827, muted
// #667085, accent #5865E8, success #2F9A55, caution #D97706, danger #D64545;
// outer radius 16, cards 12, 1px borders, 40–44pt controls, 20–24pt gaps and no
// heavy shadows. Dark mode keeps the same roles on a dark ground.
enum NDSettings {
    static let accent = Color(red: 0x58 / 255, green: 0x65 / 255, blue: 0xE8 / 255)
    static let success = Color(red: 0x2F / 255, green: 0x9A / 255, blue: 0x55 / 255)
    static let caution = Color(red: 0xD9 / 255, green: 0x77 / 255, blue: 0x06 / 255)
    static let danger = Color(red: 0xD6 / 255, green: 0x45 / 255, blue: 0x45 / 255)

    static func canvas(_ scheme: ColorScheme) -> Color { scheme == .dark ? Color(white: 0.08) : Color(red: 0xF3 / 255, green: 0xF5 / 255, blue: 0xF9 / 255) }
    static func surface(_ scheme: ColorScheme) -> Color { scheme == .dark ? Color(white: 0.125) : .white }
    static func panel(_ scheme: ColorScheme) -> Color { scheme == .dark ? Color(white: 0.16) : Color(red: 0xF7 / 255, green: 0xF8 / 255, blue: 0xFB / 255) }
    static func border(_ scheme: ColorScheme) -> Color { scheme == .dark ? Color.white.opacity(0.10) : Color(red: 0xE3 / 255, green: 0xE6 / 255, blue: 0xEE / 255) }
    static func text(_ scheme: ColorScheme) -> Color { scheme == .dark ? Color(white: 0.94) : Color(red: 0x14 / 255, green: 0x18 / 255, blue: 0x27 / 255) }
    static func muted(_ scheme: ColorScheme) -> Color { scheme == .dark ? Color(white: 0.64) : Color(red: 0x66 / 255, green: 0x70 / 255, blue: 0x85 / 255) }
    static func rowActive(_ scheme: ColorScheme) -> Color { scheme == .dark ? accent.opacity(0.22) : Color(red: 0xEC / 255, green: 0xEE / 255, blue: 0xFC / 255) }

    static let outerRadius: CGFloat = 16
    static let cardRadius: CGFloat = 12
    static let controlHeight: CGFloat = 40
    static let rowHeight: CGFloat = 44
    static let sectionGap: CGFloat = 20
    static let cardPadding: CGFloat = 20
    static let sidebarWidth: CGFloat = 275
    static let contentMaxWidth: CGFloat = 840
}

enum NDSettingsStatus { case saved, dirty, saving, readonly }

/// The save-state pill in a page header: colour always travels with words.
struct NDStatusPill: View {
    let status: NDSettingsStatus
    let text: String

    private var color: Color {
        switch status {
        case .saved: return NDSettings.success
        case .dirty: return NDSettings.caution
        case .saving: return NDSettings.accent
        case .readonly: return Color.secondary
        }
    }
    private var mark: String {
        switch status {
        case .saved: return "✓"
        case .dirty: return "●"
        case .saving: return "…"
        case .readonly: return "○"
        }
    }

    var body: some View {
        HStack(spacing: 6) {
            Text(mark).font(.system(size: 11, weight: .bold))
            Text(text).font(.system(size: 12, weight: .semibold)).lineLimit(1)
        }
        .foregroundColor(color)
        .padding(.horizontal, 10)
        .frame(height: 28)
        .background(Capsule().fill(color.opacity(0.12)))
        .accessibilityElement(children: .combine)
    }
}

/// Eyebrow + title + one-sentence purpose on the left, the save state and the
/// section's own actions on the right — identical on every screen.
struct NDSettingsPageHeader<Actions: View>: View {
    @Environment(\.colorScheme) private var scheme
    let eyebrow: String
    let title: String
    let subtitle: String
    var status: NDSettingsStatus? = nil
    var statusText: String = ""
    var compact: Bool = false
    @ViewBuilder let actions: Actions

    init(eyebrow: String, title: String, subtitle: String, status: NDSettingsStatus? = nil, statusText: String = "", compact: Bool = false, @ViewBuilder actions: () -> Actions) {
        self.eyebrow = eyebrow
        self.title = title
        self.subtitle = subtitle
        self.status = status
        self.statusText = statusText
        self.compact = compact
        self.actions = actions()
    }

    var body: some View {
        let side = HStack(spacing: 12) {
            if let status { NDStatusPill(status: status, text: statusText) }
            actions
        }
        Group {
            if compact {
                VStack(alignment: .leading, spacing: 12) {
                    info
                    side
                }
            } else {
                HStack(alignment: .center, spacing: 16) {
                    info
                    Spacer(minLength: 12)
                    side
                }
            }
        }
        .padding(EdgeInsets(top: compact ? 14 : 18, leading: compact ? 16 : 22, bottom: compact ? 14 : 18, trailing: compact ? 16 : 22))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: NDSettings.cardRadius, style: .continuous).fill(NDSettings.surface(scheme)))
        .overlay(RoundedRectangle(cornerRadius: NDSettings.cardRadius, style: .continuous).stroke(NDSettings.border(scheme), lineWidth: 1))
    }

    private var info: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(eyebrow.uppercased())
                .font(.system(size: 11, weight: .bold))
                .tracking(0.9)
                .foregroundColor(NDSettings.muted(scheme))
            Text(title)
                .font(.system(size: compact ? 22 : 26, weight: .bold))
                .foregroundColor(NDSettings.text(scheme))
                .lineLimit(2)
            if !subtitle.isEmpty {
                Text(subtitle)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(NDSettings.muted(scheme))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

extension NDSettingsPageHeader where Actions == EmptyView {
    init(eyebrow: String, title: String, subtitle: String, status: NDSettingsStatus? = nil, statusText: String = "", compact: Bool = false) {
        self.init(eyebrow: eyebrow, title: title, subtitle: subtitle, status: status, statusText: statusText, compact: compact) { EmptyView() }
    }
}

/// A card's heading: icon tile, title, one-line purpose, something on the right.
struct NDSettingsCardHead<Aside: View>: View {
    @Environment(\.colorScheme) private var scheme
    let icon: String?
    let title: String
    let subtitle: String
    var tint: Color = NDSettings.accent
    @ViewBuilder let aside: Aside

    init(icon: String? = nil, title: String, subtitle: String = "", tint: Color = NDSettings.accent, @ViewBuilder aside: () -> Aside) {
        self.icon = icon
        self.title = title
        self.subtitle = subtitle
        self.tint = tint
        self.aside = aside()
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            if let icon {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(tint)
                    .frame(width: 32, height: 32)
                    .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(tint.opacity(0.12)))
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(NDSettings.text(scheme))
                if !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.system(size: 13))
                        .foregroundColor(NDSettings.muted(scheme))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            aside
        }
    }
}

extension NDSettingsCardHead where Aside == EmptyView {
    init(icon: String? = nil, title: String, subtitle: String = "", tint: Color = NDSettings.accent) {
        self.init(icon: icon, title: title, subtitle: subtitle, tint: tint) { EmptyView() }
    }
}

/// The card surface: 12pt radius, 1px border, 20pt padding, no shadow.
struct NDSettingsSurface<Content: View>: View {
    @Environment(\.colorScheme) private var scheme
    var padding: CGFloat = NDSettings.cardPadding
    var spacing: CGFloat = 16
    var borderColor: Color? = nil
    @ViewBuilder let content: Content

    init(padding: CGFloat = NDSettings.cardPadding, spacing: CGFloat = 16, borderColor: Color? = nil, @ViewBuilder content: () -> Content) {
        self.padding = padding
        self.spacing = spacing
        self.borderColor = borderColor
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: spacing) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: NDSettings.cardRadius, style: .continuous).fill(NDSettings.surface(scheme)))
            .overlay(RoundedRectangle(cornerRadius: NDSettings.cardRadius, style: .continuous).stroke(borderColor ?? NDSettings.border(scheme), lineWidth: 1))
    }
}

/// The destructive region: a muted red frame, a red eyebrow, calm copy.
struct NDDangerCard<Content: View>: View {
    @Environment(\.colorScheme) private var scheme
    let eyebrow: String
    @ViewBuilder let content: Content

    init(eyebrow: String, @ViewBuilder content: () -> Content) {
        self.eyebrow = eyebrow
        self.content = content()
    }

    var body: some View {
        NDSettingsSurface(borderColor: NDSettings.danger.opacity(0.45)) {
            Text(eyebrow)
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(NDSettings.danger)
            content
        }
    }
}

/// Dirty state + the one save action, always in the same place.
struct NDSaveBar: View {
    @Environment(\.colorScheme) private var scheme
    let dirty: Bool
    var saving: Bool = false
    let dirtyText: String
    let savedText: String
    let saveText: String
    var savingText: String = ""
    let action: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            NDStatusPill(status: saving ? .saving : (dirty ? .dirty : .saved), text: saving ? (savingText.isEmpty ? saveText : savingText) : (dirty ? dirtyText : savedText))
            Spacer(minLength: 8)
            Button(action: action) {
                Text(saveText)
                    .font(.system(size: 13, weight: .semibold))
                    .padding(.horizontal, 16)
                    .frame(height: NDSettings.controlHeight)
                    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(dirty && !saving ? NDSettings.accent : NDSettings.accent.opacity(0.35)))
                    .foregroundColor(.white)
            }
            .buttonStyle(.plain)
            .disabled(!dirty || saving)
        }
        .padding(.top, 4)
    }
}

/// One sidebar row: 44pt, 20pt line icon, the active row on a pale periwinkle
/// fill with a single accent edge.
struct NDSettingsSidebarRow: View {
    @Environment(\.colorScheme) private var scheme
    let title: String
    let icon: String
    let isSelected: Bool
    var badgeCount: Int = 0
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 15, weight: .medium))
                    .frame(width: 20, height: 20)
                    .foregroundColor(isSelected ? NDSettings.accent : NDSettings.muted(scheme))
                Text(title)
                    .font(.system(size: 14, weight: isSelected ? .bold : .semibold))
                    .foregroundColor(isSelected ? NDSettings.accent : NDSettings.text(scheme))
                    .lineLimit(1)
                Spacer(minLength: 0)
                if badgeCount > 0 {
                    Text("\(badgeCount)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 6)
                        .frame(minWidth: 18, minHeight: 18)
                        .background(Capsule().fill(NDSettings.danger))
                        .accessibilityLabel(Text("\(badgeCount) new support tickets"))
                }
            }
            .padding(.leading, 14)
            .padding(.trailing, 12)
            .frame(height: NDSettings.rowHeight)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(isSelected ? NDSettings.rowActive(scheme) : (hovering ? NDSettings.canvas(scheme) : Color.clear)))
            .overlay(alignment: .leading) {
                if isSelected {
                    Capsule().fill(NDSettings.accent).frame(width: 3).padding(.vertical, 10)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
    }
}

/// A collapsible group heading in the sidebar.
struct NDSettingsGroupHeader: View {
    @Environment(\.colorScheme) private var scheme
    let title: String
    let collapsed: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text(title.uppercased())
                    .font(.system(size: 11, weight: .bold))
                    .tracking(0.9)
                    .foregroundColor(NDSettings.muted(scheme))
                    .lineLimit(1)
                Spacer(minLength: 0)
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(NDSettings.muted(scheme))
                    .rotationEffect(.degrees(collapsed ? -90 : 0))
            }
            .padding(.horizontal, 10)
            .frame(height: 32)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(.isHeader)
    }
}

/// The sidebar search: 40pt, canvas fill, 1px border.
struct NDSettingsSearchField: View {
    @Environment(\.colorScheme) private var scheme
    @Binding var text: String
    let placeholder: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(NDSettings.muted(scheme))
            TextField(placeholder, text: $text)
                .textFieldStyle(.plain)
                .font(.system(size: 14))
                .foregroundColor(NDSettings.text(scheme))
            if !text.isEmpty {
                Button { text = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundColor(NDSettings.muted(scheme))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .frame(height: NDSettings.controlHeight)
        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(NDSettings.canvas(scheme)))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(NDSettings.border(scheme), lineWidth: 1))
    }
}

/// A phone list row: the same tokens, a chevron instead of the active edge.
struct NDSettingsListRow: View {
    @Environment(\.colorScheme) private var scheme
    let title: String
    let subtitle: String
    let icon: String
    var badgeCount: Int = 0
    var showsDivider: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    Image(systemName: icon)
                        .font(.system(size: 15, weight: .medium))
                        .frame(width: 20, height: 20)
                        .foregroundColor(NDSettings.accent)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(title)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(NDSettings.text(scheme))
                            .lineLimit(1)
                        if !subtitle.isEmpty {
                            Text(subtitle)
                                .font(.system(size: 12))
                                .foregroundColor(NDSettings.muted(scheme))
                                .lineLimit(2)
                        }
                    }
                    Spacer(minLength: 8)
                    if badgeCount > 0 {
                        Text("\(badgeCount)")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .frame(minWidth: 18, minHeight: 18)
                            .background(Capsule().fill(NDSettings.danger))
                            .accessibilityLabel(Text("\(badgeCount) new support tickets"))
                    }
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(NDSettings.muted(scheme))
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 11)
                .contentShape(Rectangle())
                if showsDivider {
                    Divider().overlay(NDSettings.border(scheme)).padding(.leading, 46)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

/// Puts text on the clipboard on either platform.
func ndCopyToPasteboard(_ text: String) {
    #if os(macOS)
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(text, forType: .string)
    #else
    UIPasteboard.general.string = text
    #endif
}

/// "Mac", "iPad" or "iPhone" for the About screen.
var ndPlatformName: String {
    #if os(macOS)
    return "Mac"
    #else
    return UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone"
    #endif
}

/// A theme choice drawn as the window it would produce: sidebar strip, a few
/// content lines, System split down the middle. Selected = accent frame + check.
struct NDThemePreviewTile: View {
    @Environment(\.colorScheme) private var scheme
    let title: String
    let mode: String
    let selected: Bool
    let action: () -> Void

    private func ground(_ dark: Bool) -> Color { dark ? Color(white: 0.11) : Color(red: 0xF3 / 255, green: 0xF5 / 255, blue: 0xF9 / 255) }
    private func panel(_ dark: Bool) -> Color { dark ? Color(white: 0.18) : .white }
    private func line(_ dark: Bool) -> Color { dark ? Color.white.opacity(0.22) : Color.black.opacity(0.10) }

    private func mock(dark: Bool) -> some View {
        HStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 3).fill(panel(dark)).frame(width: 22)
                .overlay(VStack(spacing: 3) { ForEach(0..<4, id: \.self) { _ in RoundedRectangle(cornerRadius: 1).fill(line(dark)).frame(height: 3) } }.padding(4), alignment: .top)
            VStack(spacing: 4) {
                RoundedRectangle(cornerRadius: 3).fill(panel(dark)).frame(height: 14)
                RoundedRectangle(cornerRadius: 3).fill(panel(dark))
                    .overlay(VStack(alignment: .leading, spacing: 3) { ForEach(0..<3, id: \.self) { i in RoundedRectangle(cornerRadius: 1).fill(line(dark)).frame(width: i == 2 ? 26 : 40, height: 3) } }.padding(5), alignment: .topLeading)
            }
        }
        .padding(6)
        .background(ground(dark))
    }

    var body: some View {
        Button(action: action) {
            VStack(spacing: 10) {
                ZStack {
                    if mode == "System" {
                        HStack(spacing: 0) {
                            mock(dark: false).clipped()
                            mock(dark: true).clipped()
                        }
                    } else {
                        mock(dark: mode == "Dark")
                    }
                }
                .frame(height: 78)
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(NDSettings.border(scheme), lineWidth: 1))
                HStack(spacing: 8) {
                    Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                        .font(.system(size: 14))
                        .foregroundColor(selected ? NDSettings.accent : NDSettings.muted(scheme))
                    Text(title)
                        .font(.system(size: 13, weight: selected ? .bold : .semibold))
                        .foregroundColor(NDSettings.text(scheme))
                    Spacer(minLength: 0)
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(selected ? NDSettings.rowActive(scheme).opacity(0.6) : NDSettings.surface(scheme)))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(selected ? NDSettings.accent : NDSettings.border(scheme), lineWidth: selected ? 2 : 1))
            .overlay(alignment: .topTrailing) {
                if selected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 16))
                        .foregroundColor(NDSettings.accent)
                        .background(Circle().fill(NDSettings.surface(scheme)))
                        .offset(x: 6, y: -6)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

/// A read-only fact in a card: small label, value, optional action on the right.
struct NDFactRow<Trailing: View>: View {
    @Environment(\.colorScheme) private var scheme
    let label: String
    let value: String
    var icon: String? = nil
    @ViewBuilder let trailing: Trailing

    init(label: String, value: String, icon: String? = nil, @ViewBuilder trailing: () -> Trailing) {
        self.label = label
        self.value = value
        self.icon = icon
        self.trailing = trailing()
    }

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            if let icon {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(NDSettings.muted(scheme))
                    .frame(width: 18)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(label.uppercased())
                    .font(.system(size: 10.5, weight: .bold))
                    .tracking(0.6)
                    .foregroundColor(NDSettings.muted(scheme))
                Text(value)
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundColor(NDSettings.text(scheme))
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .textSelection(.enabled)
            }
            Spacer(minLength: 8)
            trailing
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 52)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(NDSettings.panel(scheme)))
        .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).stroke(NDSettings.border(scheme), lineWidth: 1))
    }
}

extension NDFactRow where Trailing == EmptyView {
    init(label: String, value: String, icon: String? = nil) {
        self.init(label: label, value: value, icon: icon) { EmptyView() }
    }
}

/// An outlined secondary button in the handoff's proportions.
struct NDSecondaryButton: View {
    @Environment(\.colorScheme) private var scheme
    let title: String
    var icon: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let icon { Image(systemName: icon).font(.system(size: 12, weight: .semibold)) }
                Text(title).font(.system(size: 13, weight: .semibold))
            }
            .foregroundColor(NDSettings.text(scheme))
            .padding(.horizontal, 14)
            .frame(height: 36)
            .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(NDSettings.surface(scheme)))
            .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).stroke(NDSettings.border(scheme), lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// The handoff card as a modifier for views that build their own body:
/// surface fill, 12pt radius, 1px border, no shadow.
struct NDSettingsCardModifier: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    var padding: CGFloat = NDSettings.cardPadding
    var borderColor: Color? = nil

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: NDSettings.cardRadius, style: .continuous).fill(NDSettings.surface(scheme)))
            .overlay(RoundedRectangle(cornerRadius: NDSettings.cardRadius, style: .continuous).stroke(borderColor ?? NDSettings.border(scheme), lineWidth: 1))
    }
}

extension View {
    func ndSettingsCard(padding: CGFloat = NDSettings.cardPadding, borderColor: Color? = nil) -> some View {
        modifier(NDSettingsCardModifier(padding: padding, borderColor: borderColor))
    }
}
