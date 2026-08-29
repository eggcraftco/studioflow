import SwiftUI

/// §4's card anatomy, drawn to match the reference sheet: a real 2×3 dot grip,
/// a ringed badge that gives every card the same anchor whatever glyph it
/// carries, an optional line under the title, the card's own body, and exactly
/// one footer link.
struct HomeCardShell<CardBody: View>: View {
    let definition: HomeCardDefinition
    let placement: HomeCardPlacement
    let customising: Bool
    /// Phone layout: tighter header, no footer link on a 1×1, and the whole card
    /// is the tap target instead.
    var compact: Bool = false
    let lang: String
    /// A short line under the title — "3 of 6 complete", a date range.
    var subtitle: String = ""
    /// Beside the title rather than under it — "10 active" on the wide card,
    /// which has the width for one line where the phone does not.
    var subtitleInline: Bool = false
    /// A small mark beside the title — Banking's read-only promise.
    var headerPill: String = ""
    /// A quiet line on the right of the header — how fresh the feed is.
    var headerNote: String = ""
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
    private var surface: Color { colorScheme == .dark ? Color(white: 0.13) : .white }
    /// A square phone card has no room for a footer link, and it does not need
    /// one: the card itself opens the screen it summarises.
    /// No footer link on a phone at any size: the sheet draws a chevron in the
    /// header instead, and the card already opens the screen it summarises.
    private var hidesFooter: Bool { compact }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            content()
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(.horizontal, compact ? 13 : 16)
                .padding(.top, 4)
                .padding(.bottom, hidesFooter ? 12 : 0)
            if !hidesFooter { footer }
        }
        .background(surface)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(customising ? HomeTone.accent.opacity(0.45) : Color.primary.opacity(0.08),
                        style: StrokeStyle(lineWidth: 1, dash: customising ? [4, 3] : []))
        )
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .opacity(customising ? 0.94 : 1)
        .contentShape(Rectangle())
        .onTapGesture { if hidesFooter && !customising { onOpen() } }
    }

    private var header: some View {
        HStack(spacing: 11) {
            if customising { HomeGripDots() }
            // A 1×1 is a small square now, so it gets the small badge too — the
            // desktop one ate the width the title needed.
            HomeBadge(symbol: definition.icon, tone: placement.tone,
                      filled: definition.filledBadge,
                      size: (compact || placement.size == .oneByOne) ? 30 : 38)
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 7) {
                Text(heading)
                    .font(.system(size: compact ? 14 : 15.5, weight: .heavy))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                    // Above the pill: a card whose title reads "Ba…" has stopped
                    // saying which card it is, and the pill is the smaller loss.
                    .layoutPriority(2)
                // While customising, a phone header carries the grip and the ⋯ as
                // well; the pill is a label you read, not something you move, so
                // it stands down and gives the title its width back.
                if subtitleInline && !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                        .layoutPriority(1)
                }
                if !headerPill.isEmpty && !(compact && customising) {
                    // fixedSize, or a narrow card wraps the pill one letter per
                    // line — which is exactly what it did on a phone.
                    // lineLimit(1) is what stops the one-letter-per-line wrap a
                    // narrow card used to produce; fixedSize also refused to give
                    // the title any width back, so it is gone.
                    Text(headerPill)
                        .font(.system(size: 10, weight: .heavy))
                        .foregroundColor(HomeTone.orange)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .padding(.horizontal, compact ? 6 : 8).padding(.vertical, 2)
                        .background(Capsule().fill(HomeTone.orange.opacity(0.16)))
                        .layoutPriority(0)
                }
                }
                if !subtitle.isEmpty && !subtitleInline {
                    Text(subtitle)
                        .font(.system(size: 11.5))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            if !headerNote.isEmpty && !(compact && customising) {
                Text(headerNote)
                    .font(.system(size: 10.5))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            // On a phone the ⋯ costs a quarter of the card's width. It appears
            // while customising, which is when it is wanted; the rest of the time
            // the card is a tap target.
            if !compact || customising { menu }
        }
        .padding(.horizontal, compact ? 13 : 16)
        .padding(.top, compact ? 12 : 14)
        .padding(.bottom, 6)
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
                    Button(t(tone.label, lang: lang)) { onTone(tone) }
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
                // §17 asks for at least 44pt of touch target; the glyph stays small.
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .accessibilityLabel("\(heading) — \(t("Card options", lang: lang))")
    }

    private var footer: some View {
        Button(action: onOpen) {
            HStack(spacing: 5) {
                Spacer()
                Text(t(definition.linkLabel, lang: lang))
                Image(systemName: "arrow.right").font(.system(size: 10, weight: .bold))
            }
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(HomeTone.accent)
            .padding(.horizontal, 16)
            .padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(Rectangle().frame(height: 1).foregroundColor(.primary.opacity(0.06)), alignment: .top)
    }
}

// MARK: - Shared marks

/// The palette the reference uses. Colour never carries meaning on its own —
/// every figure it tints is also named in words (§20).
enum HomeTone {
    static let accent = Color(red: 0.15, green: 0.39, blue: 0.92)
    static let green = Color(red: 0.08, green: 0.50, blue: 0.24)
    static let orange = Color(red: 0.76, green: 0.25, blue: 0.05)
    static let red = Color(red: 0.86, green: 0.15, blue: 0.15)
    static let purple = Color(red: 0.43, green: 0.16, blue: 0.85)
    static let teal = Color(red: 0.08, green: 0.72, blue: 0.65)
    static let amber = Color(red: 0.96, green: 0.62, blue: 0.04)
    static let slate = Color(red: 0.39, green: 0.45, blue: 0.55)
}

/// Six dots in two columns, as the sheet draws it. A braille glyph renders at a
/// different weight in every font, which made the same card look different on
/// every platform.
struct HomeGripDots: View {
    var body: some View {
        VStack(spacing: 3) {
            ForEach(0..<3, id: \.self) { _ in
                HStack(spacing: 3) {
                    ForEach(0..<2, id: \.self) { _ in
                        Circle().frame(width: 3, height: 3)
                    }
                }
            }
        }
        .foregroundColor(.secondary.opacity(0.75))
        .frame(width: 9)
    }
}

struct HomeBadge: View {
    let symbol: String
    var tone: HomeCardTone = .standard
    var filled: Bool = false
    var size: CGFloat = 38
    private var colour: Color { tone == .standard ? HomeTone.accent : tone.accent }
    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: size * 0.42, weight: .semibold))
            .foregroundColor(filled ? .white : colour)
            .frame(width: size, height: size)
            .background(Circle().fill(filled ? colour : .clear))
            .overlay(Circle().stroke(colour, lineWidth: filled ? 0 : 2))
    }
}

struct HomeProgressBar: View {
    let fraction: Double
    var tint: Color = HomeTone.accent
    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.secondary.opacity(0.2))
                Capsule().fill(tint)
                    .frame(width: max(0, min(1, fraction)) * proxy.size.width)
            }
        }
        .frame(height: 6)
    }
}

/// A tinted tile: a soft dot, the label, the figure, and an optional second line.
struct HomeMetricTile: View {
    let label: String
    let value: String
    var tone: Color = HomeTone.accent
    var sub: String = ""
    /// The mark inside the tinted disc, tinted by the tile's own colour.
    var symbol: String = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            ZStack {
                Circle().fill(tone.opacity(0.16)).frame(width: 22, height: 22)
                if !symbol.isEmpty {
                    Image(systemName: symbol).font(.system(size: 10, weight: .semibold)).foregroundColor(tone)
                }
            }
            Text(label)
                .font(.system(size: 10.5, weight: .semibold))
                .foregroundColor(.secondary)
                .lineLimit(1).minimumScaleFactor(0.8)
            Text(value)
                .font(.system(size: 15, weight: .heavy))
                .foregroundColor(tone)
                .lineLimit(1).minimumScaleFactor(0.6)
            if !sub.isEmpty {
                Text(sub).font(.system(size: 10)).foregroundColor(.secondary).lineLimit(1)
            }
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.primary.opacity(0.08), lineWidth: 1))
    }
}

/// Two figures side by side, divided — the pattern under every 1×1 headline.
struct HomeSplitPair<Left: View, Right: View>: View {
    @ViewBuilder let left: () -> Left
    @ViewBuilder let right: () -> Right
    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 1) { left() }
                .frame(maxWidth: .infinity, alignment: .leading)
            Rectangle().fill(Color.primary.opacity(0.08)).frame(width: 1, height: 26)
            VStack(alignment: .leading, spacing: 1) { right() }
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct HomeFigure: View {
    let label: String
    let value: String
    var tone: Color = .primary
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label).font(.system(size: 11)).foregroundColor(.secondary).lineLimit(1)
            Text(value).font(.system(size: 14, weight: .bold)).foregroundColor(tone)
                .lineLimit(1).minimumScaleFactor(0.65)
        }
    }
}

struct HomeChip: View {
    let text: String
    var tone: Color = HomeTone.accent
    var body: some View {
        Text(text)
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(tone)
            .padding(.horizontal, 8).padding(.vertical, 2.5)
            .background(Capsule().fill(tone.opacity(0.12)))
            .lineLimit(1)
    }
}

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

/// A section label — "Completed", "Production flow", "Pinned".
struct HomeEyebrow: View {
    let text: String
    var strong: Bool = true
    var body: some View {
        Text(text)
            .font(.system(size: strong ? 12.5 : 11.5, weight: strong ? .bold : .regular))
            .foregroundColor(strong ? .primary.opacity(0.85) : .secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct HomePanel<Content: View>: View {
    /// A phone square cannot spare 20pt of panel padding on top of everything
    /// else it carries.
    var compact: Bool = false
    @ViewBuilder let content: () -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 3 : 6) { content() }
            .padding(.horizontal, compact ? 10 : 12).padding(.vertical, compact ? 7 : 10)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.primary.opacity(0.08), lineWidth: 1))
    }
}

/// One row of a list: a name that can grow, and a value that cannot shrink.
struct HomeRow: View {
    let title: String
    let detail: String
    var tone: Color = .secondary
    var body: some View {
        HStack(spacing: 8) {
            Text(title).font(.system(size: 12, weight: .semibold)).lineLimit(1)
            Spacer(minLength: 6)
            Text(detail).font(.system(size: 11, weight: .bold)).foregroundColor(tone).lineLimit(1)
        }
        .padding(.vertical, 4)
    }
}
