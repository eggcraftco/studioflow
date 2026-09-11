import SwiftUI
import Combine
#if canImport(FirebaseFunctions)
import FirebaseFunctions
#endif

/// Feedback v1 on the native apps: the "Send feedback" entry in the account menu and the short
/// form behind it, on the same callables the web uses (functions/feedback.js — getFeedbackPrompt
/// for "is it on for this workspace", submitFeedback for the note). The entry shows only when the
/// server says the feature is on; the form asks one required answer (how it is going), an optional
/// topic and an optional note, and attaches nothing else. There is no first-success invitation
/// here — that stays on the web (§34); this is the manual entry only.
@MainActor
final class FeedbackCenterModel: ObservableObject {
    @Published var enabled = false
    @Published var busy = false
    @Published var errorText = ""
    @Published var sent = false
    @Published var experience = ""
    @Published var kind = ""
    @Published var note = ""

    static let textMax = 2000
    /// One availability ask per workspace per ten minutes — the web keeps the same cadence.
    static let checkInterval: TimeInterval = 10 * 60
    private var lastCheck: [String: Date] = [:]
    private var clientKey = FeedbackCenterModel.newClientKey()

    /// The callable never throws for a disabled feature: it answers enabled:false and the entry stays hidden.
    func refreshAvailability(companyId: String, force: Bool = false) {
        let clean = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { enabled = false; return }
        if !force, let last = lastCheck[clean], Date().timeIntervalSince(last) < Self.checkInterval { return }
        lastCheck[clean] = Date()
        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2")
            .httpsCallable("getFeedbackPrompt")
            .call(["companyId": clean]) { [weak self] result, error in
                let data = result?.data as? [String: Any]
                let isEnabled = error == nil && (data?["enabled"] as? Bool ?? false)
                Task { @MainActor in self?.enabled = isEnabled }
            }
        #endif
    }

    /// After the sheet closes: the thank-you and any error go, the draft stays (a successful send already cleared it).
    func startNew() {
        errorText = ""
        sent = false
        clientKey = Self.newClientKey()
    }

    func send(companyId: String, page: String, language: String) {
        guard !busy else { return }
        let clean = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !experience.isEmpty else { errorText = t("Please choose how it is going before sending.", lang: language); return }
        guard !clean.isEmpty else { errorText = t("You do not have access to this workspace.", lang: language); return }
        busy = true
        errorText = ""
        // The Mac and the iPhone share this file, so the platform is decided at runtime.
        #if os(macOS)
        let platform = "mac"
        #else
        let platform = "ios"
        #endif
        let payload: [String: Any] = [
            "companyId": clean,
            "trigger": "manual",
            "experience": experience,
            "kind": kind,
            "text": String(note.prefix(Self.textMax)),
            "page": String(page.prefix(200)),
            "clientKey": clientKey,
            "language": language,
            "platform": platform
        ]
        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2")
            .httpsCallable("submitFeedback")
            .call(payload) { [weak self] _, error in
                Task { @MainActor in
                    guard let self else { return }
                    self.busy = false
                    if let error {
                        self.errorText = Self.errorText(for: error, language: language)
                        return
                    }
                    self.sent = true
                    self.experience = ""
                    self.kind = ""
                    self.note = ""
                    self.clientKey = Self.newClientKey()
                }
            }
        #else
        busy = false
        errorText = t("Your feedback could not be sent. Please try again.", lang: language)
        #endif
    }

    /// The same sentences the web shows, chosen by the callable's error code.
    static func errorText(for error: Error, language: String) -> String {
        let nsError = error as NSError
        #if canImport(FirebaseFunctions)
        if nsError.domain == FunctionsErrorDomain {
            switch nsError.code {
            case FunctionsErrorCode.resourceExhausted.rawValue:
                return t("Too many messages in a short time. Please try again later.", lang: language)
            case FunctionsErrorCode.failedPrecondition.rawValue:
                return t("Feedback is not available yet.", lang: language)
            case FunctionsErrorCode.permissionDenied.rawValue:
                return t("You do not have access to this workspace.", lang: language)
            case FunctionsErrorCode.invalidArgument.rawValue:
                return t("Please choose how it is going before sending.", lang: language)
            default:
                break
            }
        }
        #endif
        return t("Your feedback could not be sent. Please try again.", lang: language)
    }

    static func newClientKey() -> String {
        UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    }
}

/// The short form: Overall (required), What is it about? (optional), Tell us more (optional), the
/// privacy line, Cancel / Send — then the thank-you. Three cards side by side on the Mac, stacked on the phone.
struct FeedbackCenterSheet: View {
    @Environment(\.colorScheme) private var scheme
    @ObservedObject var model: FeedbackCenterModel
    let companyId: String
    let language: String
    let page: String
    let onClose: () -> Void

    private let experiences: [(String, String)] = [("easy", "Going well"), ("okay", "It's okay"), ("difficult", "Struggling")]
    private let kinds: [(String, String)] = [("problem", "Something isn't working"), ("missing_feature", "Something is missing"), ("suggestion", "A suggestion")]

    var body: some View {
        Group {
            if model.sent {
                thanks
            } else {
                form
            }
        }
        .background(NDSettings.canvas(scheme))
        #if os(macOS)
        .frame(width: 580)
        #endif
    }

    private var thanks: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(t("Thank you", lang: language))
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(NDSettings.text(scheme))
            Text(t("We read every note. If it needs a reply, we will write to the email on your account.", lang: language))
                .font(.system(size: 13.5))
                .foregroundColor(NDSettings.muted(scheme))
                .fixedSize(horizontal: false, vertical: true)
            HStack {
                Spacer()
                Button(t("Close", lang: language)) { onClose() }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
                    .tint(NDSettings.accent)
            }
            .padding(.top, 6)
        }
        .padding(NDSettings.cardPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var form: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: NDSettings.sectionGap) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(t("Send feedback", lang: language))
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(NDSettings.text(scheme))
                    Text(t("Choose an option and send. Add a note if you like.", lang: language))
                        .font(.system(size: 13))
                        .foregroundColor(NDSettings.muted(scheme))
                }
                choiceGroup(title: t("Overall", lang: language), optional: false, options: experiences, selection: $model.experience)
                choiceGroup(title: t("What is it about?", lang: language), optional: true, options: kinds, selection: $model.kind)
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        Text(t("Tell us more", lang: language))
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(NDSettings.text(scheme))
                        Text(t("(optional)", lang: language))
                            .font(.system(size: 12))
                            .foregroundColor(NDSettings.muted(scheme))
                    }
                    ZStack(alignment: .topLeading) {
                        if model.note.isEmpty {
                            Text(t("What happened, or what would help?", lang: language))
                                .font(.system(size: 13))
                                .foregroundColor(NDSettings.muted(scheme).opacity(0.8))
                                .padding(.horizontal, 11)
                                .padding(.vertical, 14)
                                .allowsHitTesting(false)
                        }
                        TextEditor(text: $model.note)
                            .font(.system(size: 13))
                            .scrollContentBackground(.hidden)
                            .frame(minHeight: 96)
                            .padding(6)
                            .onChange(of: model.note) { _, value in
                                if value.count > FeedbackCenterModel.textMax {
                                    model.note = String(value.prefix(FeedbackCenterModel.textMax))
                                }
                            }
                    }
                    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(NDSettings.surface(scheme)))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(NDSettings.border(scheme), lineWidth: 1))
                    if FeedbackCenterModel.textMax - model.note.count < 200 {
                        Text("\(FeedbackCenterModel.textMax - model.note.count)")
                            .font(.system(size: 11))
                            .foregroundColor(NDSettings.muted(scheme))
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    }
                }
                Text(t("We send your feedback with your account and workspace details, current page, language and platform. We don't automatically attach customer, order or bank records.", lang: language))
                    .font(.system(size: 11.5))
                    .foregroundColor(NDSettings.muted(scheme))
                    .fixedSize(horizontal: false, vertical: true)
                if !model.errorText.isEmpty {
                    Text(model.errorText)
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundColor(NDSettings.danger)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 10) {
                    Spacer()
                    Button(t("Cancel", lang: language)) { onClose() }
                        .keyboardShortcut(.cancelAction)
                        .disabled(model.busy)
                    Button {
                        model.send(companyId: companyId, page: page, language: language)
                    } label: {
                        Text(model.busy ? t("Sending…", lang: language) : t("Send", lang: language))
                            .frame(minWidth: 88)
                    }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
                    .tint(NDSettings.accent)
                    .disabled(model.busy || model.experience.isEmpty)
                }
            }
            .padding(NDSettings.cardPadding)
        }
    }

    @ViewBuilder
    private func choiceGroup(title: String, optional: Bool, options: [(String, String)], selection: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(NDSettings.text(scheme))
                if optional {
                    Text(t("(optional)", lang: language))
                        .font(.system(size: 12))
                        .foregroundColor(NDSettings.muted(scheme))
                }
            }
            #if os(macOS)
            HStack(alignment: .top, spacing: 8) {
                choiceCards(options: options, optional: optional, selection: selection)
            }
            #else
            VStack(spacing: 8) {
                choiceCards(options: options, optional: optional, selection: selection)
            }
            #endif
        }
    }

    private func choiceCards(options: [(String, String)], optional: Bool, selection: Binding<String>) -> some View {
        ForEach(options, id: \.0) { option in
            NDChoiceCard(title: t(option.1, lang: language), description: "", selected: selection.wrappedValue == option.0) {
                // An optional answer can be taken back by tapping it again; the required one only changes.
                selection.wrappedValue = (optional && selection.wrappedValue == option.0) ? "" : option.0
            }
        }
    }
}
