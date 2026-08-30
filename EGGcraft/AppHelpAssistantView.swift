import SwiftUI
import Combine
#if canImport(FirebaseFunctions)
import FirebaseFunctions
#endif

// In-app "How do I…?" helper for Mac, iPad and iPhone.
//
// It answers from the NivaDesk user guide only. It cannot read the workspace,
// so questions about the user's own orders or figures are handed to the
// ChatGPT app, and anything the guide does not cover goes to Contact NivaDesk
// Support. Paid plans only — the server checks this as well.
//
// Kept as its own small view struct on purpose: deeply nested SwiftUI
// generics in one file have crashed on real devices before.

struct AppHelpTurn: Identifiable {
    let id = UUID()
    let question: String
    let answer: String
    let needsChatGPT: Bool
    let needsSupport: Bool
    let sources: [String]
    /// "" not sent, "sending", "sent", or the error to show.
    var ticket: String = ""
}

@MainActor
final class AppHelpAssistantModel: ObservableObject {
    @Published var available = false
    @Published var turns: [AppHelpTurn] = []
    @Published var busy = false
    @Published var errorText = ""
    @Published var draft = ""

    func refreshAvailability() {
        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2")
            .httpsCallable("getAppAssistantAvailability")
            .call([:]) { [weak self] result, _ in
                let data = result?.data as? [String: Any]
                let isAvailable = data?["available"] as? Bool ?? false
                Task { @MainActor in self?.available = isAvailable }
            }
        #endif
    }

    /// One press files the ticket, with the answer the assistant gave attached so
    /// support can see what it already tried. It used to be a sentence telling
    /// people to go to Settings and type their question a second time.
    func sendToSupport(_ turnId: UUID, companyId: String, companyName: String,
                       userId: String, userEmail: String, userName: String,
                       language: String, firebaseManager: FirebaseManager) {
        guard let index = turns.firstIndex(where: { $0.id == turnId }) else { return }
        let turn = turns[index]
        guard turn.ticket.isEmpty else { return }
        turns[index].ticket = "sending"

        let attempted = t("The in-app assistant could not answer this. What it replied:", lang: language)
        firebaseManager.submitSupportTicketReturningId(
            companyId: companyId,
            companyName: companyName,
            userId: userId,
            userEmail: userEmail,
            userName: userName,
            title: String(turn.question.prefix(120)),
            message: "\(turn.question)\n\n---\n\(attempted)\n\(turn.answer)",
            category: "question",
            priority: "normal",
            language: language
        ) { [weak self] ok, _ in
            guard let self, let at = self.turns.firstIndex(where: { $0.id == turnId }) else { return }
            if ok {
                self.turns[at].ticket = "sent"
            } else {
                self.turns[at].ticket = firebaseManager.supportTicketError.isEmpty
                    ? t("The ticket could not be sent.", lang: language)
                    : firebaseManager.supportTicketError
            }
        }
    }

    func askDraft(companyId: String, language: String) {
        ask(draft, companyId: companyId, language: language)
    }

    func ask(_ question: String, companyId: String, language: String) {
        let clean = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, !busy else { return }
        busy = true
        errorText = ""
        draft = ""

        #if canImport(FirebaseFunctions)
        let payload: [String: Any] = [
            "question": clean,
            "companyId": companyId,
            "language": language
        ]
        Functions.functions(region: "europe-west2")
            .httpsCallable("askAppAssistant")
            .call(payload) { [weak self] result, error in
                Task { @MainActor in
                    guard let self else { return }
                    self.busy = false
                    if let error {
                        self.errorText = error.localizedDescription
                        return
                    }
                    let data = result?.data as? [String: Any] ?? [:]
                    let sources = (data["sources"] as? [[String: Any]] ?? []).compactMap { $0["path"] as? String }
                    self.turns.append(AppHelpTurn(
                        question: clean,
                        answer: data["answer"] as? String ?? "",
                        needsChatGPT: data["needsChatGPT"] as? Bool ?? false,
                        needsSupport: data["needsSupport"] as? Bool ?? false,
                        sources: sources
                    ))
                }
            }
        #else
        busy = false
        errorText = "Firebase Functions is not available."
        #endif
    }
}

struct AppHelpAssistantView: View {
    let companyId: String
    let lang: String
    @Binding var isPresented: Bool
    @ObservedObject var model: AppHelpAssistantModel
    @EnvironmentObject var authVM: AuthViewModel
    @EnvironmentObject var firebaseManager: FirebaseManager

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider()
            thread
            Divider()
            composer
        }
        .frame(minWidth: 340, maxWidth: 520, minHeight: 380)
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(t("NivaDesk help", lang: lang))
                    .font(.system(size: 15, weight: .bold))
                Text(t("Answers from the user guide.", lang: lang))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }
            Spacer()
            Button {
                isPresented = false
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(16)
    }

    private var thread: some View {
        ScrollViewReader { proxy in
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if model.turns.isEmpty {
                    Text(t("Ask how something in NivaDesk works — where a button lives, what a card is for, how to set something up. This assistant reads the guide, not your workspace, so it never sees your orders or figures.", lang: lang))
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                ForEach(model.turns) { turn in
                    AppHelpTurnRow(turn: turn, lang: lang) {
                        model.sendToSupport(
                            turn.id,
                            companyId: companyId,
                            companyName: authVM.companyName,
                            userId: authVM.currentUserId ?? "",
                            userEmail: authVM.accountEmail,
                            userName: authVM.accountDisplayName,
                            language: lang,
                            firebaseManager: firebaseManager
                        )
                    }
                }

                if model.busy {
                    Text(t("Looking it up…", lang: lang))
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                }

                // Anchor for the newest answer: without this the panel keeps
                // showing the top of the conversation and the reply you just
                // asked for sits below the fold.
                Color.clear
                    .frame(height: 1)
                    .id("threadBottom")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
        }
        .onChange(of: model.turns.count) {
            withAnimation { proxy.scrollTo("threadBottom", anchor: .bottom) }
        }
        .onChange(of: model.busy) {
            withAnimation { proxy.scrollTo("threadBottom", anchor: .bottom) }
        }
        }
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField(t("How do I add a material to an order?", lang: lang), text: $model.draft)
                .textFieldStyle(.roundedBorder)
                .onSubmit { model.askDraft(companyId: companyId, language: lang) }

            if !model.errorText.isEmpty {
                Text(model.errorText)
                    .font(.system(size: 12))
                    .foregroundColor(.red)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Button {
                model.askDraft(companyId: companyId, language: lang)
            } label: {
                Text(model.busy ? t("Asking...", lang: lang) : t("Ask", lang: lang))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .keyboardShortcut(.return, modifiers: [])
            .disabled(model.busy || model.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(16)
    }
}

private struct AppHelpTurnRow: View {
    let turn: AppHelpTurn
    let lang: String
    var onSendToSupport: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(turn.question)
                .font(.system(size: 13, weight: .semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: 12).fill(Color.accentColor.opacity(0.12)))
                .frame(maxWidth: .infinity, alignment: .trailing)

            Text(turn.answer)
                .font(.system(size: 13))
                .fixedSize(horizontal: false, vertical: true)

            if !turn.sources.isEmpty {
                Text("\(t("Guide", lang: lang)): \(turn.sources.joined(separator: " · "))")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if turn.needsChatGPT {
                Text(t("Your own orders and figures live in the NivaDesk ChatGPT app, which connects to your workspace with your permission.", lang: lang))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            // The question the guide could not answer IS the ticket. This used
            // to be a sentence telling people where to go and retype it.
            if turn.needsSupport {
                if turn.ticket == "sent" {
                    Text(t("Sent to NivaDesk Support.", lang: lang))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(HomeTone.green)
                } else {
                    Button {
                        onSendToSupport()
                    } label: {
                        Text(turn.ticket == "sending"
                             ? t("Sending...", lang: lang)
                             : t("Send this to NivaDesk Support", lang: lang))
                            .font(.system(size: 12, weight: .bold))
                    }
                    .buttonStyle(.plain)
                    .foregroundColor(.accentColor)
                    .disabled(turn.ticket == "sending")
                    if !turn.ticket.isEmpty && turn.ticket != "sending" {
                        Text(turn.ticket).font(.system(size: 11)).foregroundColor(.red)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// Floating "How do I…?" button plus its sheet, applied as one modifier so the
// host view's type does not grow.
struct AppHelpAssistantHost: ViewModifier {
    let companyId: String
    let lang: String
    @StateObject private var model = AppHelpAssistantModel()
    @State private var isPresented = false

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottomTrailing) {
                if model.available {
                    Button {
                        isPresented = true
                    } label: {
                        HStack(spacing: 7) {
                            Image(systemName: "questionmark.circle.fill")
                            Text(t("How do I…?", lang: lang))
                                .font(.system(size: 13, weight: .bold))
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 9)
                        .background(Capsule().fill(Color.accentColor.opacity(0.16)))
                    }
                    .buttonStyle(.plain)
                    .padding(18)
                    .popover(isPresented: $isPresented, arrowEdge: .top) {
                        AppHelpAssistantView(
                            companyId: companyId,
                            lang: lang,
                            isPresented: $isPresented,
                            model: model
                        )
                    }
                }
            }
            .task(id: companyId) {
                model.refreshAvailability()
            }
    }
}
