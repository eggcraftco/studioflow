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
                    AppHelpTurnRow(turn: turn, lang: lang)
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

            if turn.needsSupport {
                Text(t("Not covered by the guide — send it from Settings ▸ Support / Tickets ▸ Contact NivaDesk Support.", lang: lang))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
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
