import SwiftUI

/// What the bar has to say, and whether the act behind it can still be taken
/// back. Carried by the screen that created the project, not by the sheet —
/// the sheet is gone by the time this is read.
struct StudioUndoBarNotice: Identifiable, Equatable {
    let id: UUID
    /// The line the person reads. Already translated by the caller.
    var message: String
    /// The document the undo would remove. Empty when there is nothing to undo.
    var orderId: String
    /// Whether this create is what made the customer record. The server only
    /// removes a customer when it was, so the answer has to travel from here.
    var customerCreated: Bool
    /// False for a create that is still sitting in the offline queue: there is
    /// no server document yet, so there is nothing for an undo to delete.
    var canUndo: Bool

    init(
        message: String,
        orderId: String = "",
        customerCreated: Bool = false,
        canUndo: Bool = true
    ) {
        self.id = UUID()
        self.message = message
        self.orderId = orderId
        self.customerCreated = customerCreated
        self.canUndo = canUndo && !orderId.isEmpty
    }
}

/// A brief line along the bottom of the window — "Project created · Undo".
///
/// Deliberately NOT a dialog. The milestone notice next door goes through
/// `presentPlanAccessAlert`, which puts an OK button in front of the person and
/// stops the app; the whole point of a quick create is that it does not, and an
/// undo the person has to dismiss is a worse interruption than the thing it
/// undoes. It fades itself out; a tap on Undo asks the server.
struct StudioUndoBar: View {
    let notice: StudioUndoBarNotice?
    let lang: String
    /// Seconds the bar stays up before it fades on its own. The server's undo
    /// window is five minutes, so nothing is lost by the bar going early.
    var visibleSeconds: Double = 9
    let onUndo: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        Group {
            if let notice {
                StudioUndoBarBody(notice: notice, lang: lang, onUndo: onUndo, onDismiss: onDismiss)
                    .id(notice.id)
                    .task(id: notice.id) {
                        // Cancelled and restarted whenever a new notice arrives,
                        // so a second create does not inherit the first timer.
                        try? await Task.sleep(nanoseconds: UInt64(visibleSeconds * 1_000_000_000))
                        guard !Task.isCancelled else { return }
                        onDismiss()
                    }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy, value: notice?.id)
    }
}

/// The bar itself, as its own struct. Real iPhones run out of stack on deeply
/// nested inline SwiftUI, so every piece of this stays shallow and named.
private struct StudioUndoBarBody: View {
    let notice: StudioUndoBarNotice
    let lang: String
    let onUndo: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(.green)

            Text(notice.message)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.primary)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 8)

            if notice.canUndo {
                StudioUndoBarActionButton(title: t("Undo", lang: lang), action: onUndo)
            }

            StudioUndoBarCloseButton(label: t("Dismiss", lang: lang), action: onDismiss)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: 520)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.primary.opacity(0.10), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.18), radius: 14, x: 0, y: 6)
        .padding(.horizontal, 18)
        .padding(.bottom, 20)
    }
}

private struct StudioUndoBarActionButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.blue)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color.blue.opacity(0.12))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

private struct StudioUndoBarCloseButton: View {
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "xmark")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.secondary)
                .frame(width: 22, height: 22)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
