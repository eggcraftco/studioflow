import SwiftUI

/// §4's card anatomy, identical on every platform: grip, icon, heading, the
/// card's own body, and exactly one footer link. The ⋯ menu carries everything
/// customisation needs so the card face stays about the data.
struct HomeCardShell<CardBody: View>: View {
    let definition: HomeCardDefinition
    let placement: HomeCardPlacement
    let customising: Bool
    let lang: String
    let onOpen: () -> Void
    let onResize: (HomeCardSize) -> Void
    let onTone: (HomeCardTone) -> Void
    let onRename: () -> Void
    let onHide: () -> Void
    let onReset: () -> Void
    let onMove: (Int) -> Void
    @ViewBuilder let content: () -> CardBody

    @Environment(\.colorScheme) private var colorScheme

    private var heading: String {
        placement.heading.isEmpty ? t(definition.title, lang: lang) : placement.heading
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            content()
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(.horizontal, 14)
            footer
        }
        .background(colorScheme == .dark ? Color(white: 0.13) : .white)
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(customising ? Color.blue.opacity(0.45) : Color.primary.opacity(0.08),
                        style: StrokeStyle(lineWidth: 1, dash: customising ? [4, 3] : []))
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .opacity(customising ? 0.94 : 1)
    }

    private var header: some View {
        HStack(spacing: 8) {
            if customising {
                Image(systemName: "line.3.horizontal")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }
            Image(systemName: definition.icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(placement.tone == .standard ? .secondary : placement.tone.accent)
            Text(heading)
                .font(.system(size: 14, weight: .bold))
                .lineLimit(1)
            Spacer()
            menu
        }
        .padding(.horizontal, 14)
        .padding(.top, 12)
        .padding(.bottom, 8)
    }

    private var menu: some View {
        Menu {
            Section(t("Resize", lang: lang)) {
                ForEach(definition.sizes, id: \.self) { size in
                    Button {
                        onResize(size)
                    } label: {
                        if size == placement.size { Label(size.label, systemImage: "checkmark") }
                        else { Text(size.label) }
                    }
                }
            }
            Section(t("Choose colour", lang: lang)) {
                ForEach(HomeCardTone.allCases, id: \.self) { tone in
                    Button(t(toneName(tone), lang: lang)) { onTone(tone) }
                }
            }
            Button(t("Move up", lang: lang)) { onMove(-1) }
            Button(t("Move down", lang: lang)) { onMove(1) }
            Button(t("Edit heading", lang: lang)) { onRename() }
            Button(t("Reset card", lang: lang)) { onReset() }
            Button(t("Hide card", lang: lang), role: .destructive) { onHide() }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.secondary)
                .frame(width: 26, height: 22)
                .contentShape(Rectangle())
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .accessibilityLabel(t("Card options", lang: lang))
    }

    private func toneName(_ tone: HomeCardTone) -> String {
        switch tone {
        case .standard: return "Default"
        case .blue: return "Blue"
        case .green: return "Green"
        case .amber: return "Amber"
        case .purple: return "Purple"
        case .rose: return "Rose"
        }
    }

    private var footer: some View {
        Button(action: onOpen) {
            HStack(spacing: 4) {
                Spacer()
                Text(t(definition.linkLabel, lang: lang))
                Image(systemName: "arrow.right").font(.system(size: 10, weight: .bold))
            }
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(.blue)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(Rectangle().frame(height: 1).foregroundColor(.primary.opacity(0.06)), alignment: .top)
    }
}

/// Empty, error and offline all look the same from the outside — a short line of
/// plain language, never a spinner that never ends (§18).
struct HomeCardNote: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.system(size: 12))
            .foregroundColor(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 4)
    }
}

struct HomeStat: View {
    let label: String
    let value: String
    var tone: Color = .primary
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.secondary)
                .lineLimit(1)
            Text(value)
                .font(.system(size: 16, weight: .heavy))
                .foregroundColor(tone)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct HomeRow: View {
    let title: String
    let detail: String
    var tone: Color = .secondary
    var body: some View {
        HStack(spacing: 8) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .lineLimit(1)
            Spacer(minLength: 6)
            Text(detail)
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(tone)
                .lineLimit(1)
        }
        .padding(.vertical, 3)
    }
}
