import SwiftUI
import FirebaseFirestore
import FirebaseFunctions

#if canImport(FoundationModels)
import FoundationModels
#endif

#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
#endif

struct OpenAIRequest: Codable { let model: String; let messages: [OpenAIMessage]; let temperature: Double }
struct OpenAIMessage: Codable { let role: String; let content: String }
struct OpenAIResponse: Codable { let choices: [OpenAIChoice]? }
struct OpenAIChoice: Codable { let message: OpenAIMessage? }
struct OpenAIErrorResponse: Codable { let error: OpenAIErrorDetail? }
struct OpenAIErrorDetail: Codable { let message: String?; let type: String? }

struct OllamaOptions: Codable { let temperature: Double }
struct OllamaRequest: Codable { let model: String; let messages: [OpenAIMessage]; let stream: Bool; let options: OllamaOptions }
struct OllamaResponse: Codable { let message: OpenAIMessage?; let error: String? }

struct AutoReplyView: View {
    @Environment(\.colorScheme) var colorScheme
    @EnvironmentObject var firebaseManager: FirebaseManager
    
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    @AppStorage("replyMode") private var replyMode: String = "AI"
    
    @State private var customerMessage: String = ""
    @State private var customerName: String = ""
    @State private var selectedCategory: String = ""
    @State private var selectedTopic: String = "Price & Info"
    @State private var generatedText: String = ""
    @State private var isCopied: Bool = false
    @State private var isLoading: Bool = false

    private enum QuickReplyFocusedEditor: Hashable {
        case customerMessage
        case generatedText
    }

    @FocusState private var focusedEditor: QuickReplyFocusedEditor?
    
    @AppStorage("localAIURL") private var localAIURL: String = "http://localhost:11434"
    @AppStorage("localAIModel") private var localAIModel: String = "llama3.1:latest"
    @AppStorage("aiKnowledgeBase") private var aiKnowledgeBase: String = ""
    @AppStorage("quickReplyPoliteness") private var quickReplyPoliteness: String = "Warm"
    @AppStorage("quickReplyLength") private var quickReplyLength: String = "Short"
    @State private var knowledgeBaseCloudListener: ListenerRegistration?
    @State private var isApplyingCloudKnowledgeBase: Bool = false
    @State private var knowledgeBaseSaveWorkItem: DispatchWorkItem?
    
    @AppStorage("customProductsJSON") private var customProductsJSON: String = ""
    @AppStorage("customRulesJSON") private var customRulesJSON: String = ""
    
    // Reads the AI models defined in Settings
    var decodedCustomProducts: [CustomProduct] {
        guard let data = customProductsJSON.data(using: .utf8), let products = try? JSONDecoder().decode([CustomProduct].self, from: data) else { return [] }
        return products
    }
    
    var decodedCustomRules: [CustomRule] {
        guard let data = customRulesJSON.data(using: .utf8), let rules = try? JSONDecoder().decode([CustomRule].self, from: data) else { return [] }
        return rules
    }
    
    var categories: [String] { decodedCustomProducts.filter { !$0.title.trimmingCharacters(in: .whitespaces).isEmpty }.map { $0.title } }
    var topics: [String] {
        var list = ["Price & Info"]
        let validRules = decodedCustomRules.filter { !$0.title.trimmingCharacters(in: .whitespaces).isEmpty }
        list.append(contentsOf: validRules.map { $0.title })
        return list
    }
    
    var bgMain: Color { colorScheme == .dark ? Color(white: 0.08) : Color(white: 0.94) }

    private var quickReplyAccent: Color { Color(red: 0.58, green: 0.20, blue: 0.92) }
    private var quickReplyAccentTwo: Color { Color(red: 0.83, green: 0.23, blue: 0.93) }
    private var quickReplyCardBackground: Color { colorScheme == .dark ? Color.white.opacity(0.06) : Color.white.opacity(0.96) }
    private var quickReplySoftBackground: Color { colorScheme == .dark ? Color.white.opacity(0.05) : Color(red: 0.985, green: 0.98, blue: 1.0) }
    private var quickReplyFieldBackground: Color { colorScheme == .dark ? Color.white.opacity(0.055) : Color(red: 0.992, green: 0.99, blue: 1.0) }
    private var quickReplyBorder: Color { colorScheme == .dark ? Color.white.opacity(0.10) : Color.purple.opacity(0.16) }
    private var quickReplyMutedText: Color { colorScheme == .dark ? Color.white.opacity(0.58) : Color(red: 0.49, green: 0.50, blue: 0.62) }

    private var isAIEngine: Bool {
        replyMode == "Apple" || replyMode == "AI" || replyMode == "Local"
    }

    private var quickReplyTitle: String {
        if replyMode == "Apple" || replyMode == "Local" { return "Apple On-Device AI Quick Reply" }
        if replyMode == "AI" { return "AI Quick Reply Assistant" }
        return "Offline Smart Templates"
    }

    private var quickReplySubtitle: String {
        if replyMode == "Apple" || replyMode == "Local" { return "Create professional, on-device replies in seconds." }
        if replyMode == "AI" { return "Create professional, context-aware replies in seconds." }
        return "Create fast replies from your saved products and rules."
    }

    private var inputCardTitle: String {
        if replyMode == "Apple" || replyMode == "Local" { return "Customer's Email / Message for Apple AI" }
        return "Customer's Email / Message"
    }

    private var generateButtonTitle: String {
        if replyMode == "Apple" || replyMode == "Local" { return "Generate Apple AI Reply" }
        return "Generate AI Reply"
    }

    private var loadingTitle: String {
        if replyMode == "Apple" || replyMode == "Local" { return "Apple On-Device AI is writing..." }
        return "AI is reading the Knowledge Base..."
    }

    private func quickReplyStyleControls(isPhone: Bool) -> some View {
        quickReplyPanel {
            let content = Group {
                quickReplyOptionGroup(
                    title: t("Politeness", lang: seciliDil),
                    iconName: "heart",
                    options: [
                        ("Direct", "paperplane"),
                        ("Warm", "heart"),
                        ("Very Polite", "star")
                    ],
                    selection: quickReplyPoliteness,
                    action: { quickReplyPoliteness = $0 }
                )

                if !isPhone {
                    Divider()
                        .frame(height: 56)
                }

                quickReplyOptionGroup(
                    title: t("Length", lang: seciliDil),
                    iconName: "clock",
                    options: [
                        ("Short", "list.bullet"),
                        ("Balanced", "scalemass"),
                        ("Detailed", "text.alignleft")
                    ],
                    selection: quickReplyLength,
                    action: { quickReplyLength = $0 }
                )
            }

            if isPhone {
                VStack(alignment: .leading, spacing: 14) {
                    content
                }
            } else {
                HStack(alignment: .top, spacing: 26) {
                    content
                }
            }
        }
    }

    private var replyStyleInstruction: String {
        "\(politenessInstruction)\n\(lengthInstruction)"
    }

    private var politenessInstruction: String {
        switch quickReplyPoliteness {
        case "Direct":
            return "Tone: polite but direct, minimal extra warmth."
        case "Very Polite":
            return "Tone: very polite, warm, appreciative and careful without sounding overly salesy."
        default:
            return "Tone: warm, polite and professional."
        }
    }

    private var lengthInstruction: String {
        switch quickReplyLength {
        case "Balanced":
            return "Length: balanced, around 2 to 4 short paragraphs."
        case "Detailed":
            return "Length: detailed when useful, but still clear and easy to read."
        default:
            return "Length: short and concise, usually 1 to 2 short paragraphs."
        }
    }

    private func quickReplyTextEditor(
        text: Binding<String>,
        placeholder: String,
        minHeight: CGFloat,
        fontSize: CGFloat,
        focus: QuickReplyFocusedEditor,
        bordered: Bool = false
    ) -> some View {
        ZStack(alignment: .topLeading) {
            TextEditor(text: text)
                .font(.system(size: fontSize))
                .foregroundColor(.primary)
                .focused($focusedEditor, equals: focus)
                .padding(.horizontal, 10)
                .padding(.vertical, 9)
                .frame(minHeight: minHeight, alignment: .topLeading)
                .scrollContentBackground(.hidden)
                .background(Color.clear)

            if text.wrappedValue.isEmpty {
                Text(placeholder)
                    .foregroundColor(.gray)
                    .font(.system(size: fontSize))
                    .lineLimit(4)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 15)
                    .padding(.vertical, 17)
                    .allowsHitTesting(false)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            focusedEditor = focus
        }
        .background(quickReplyFieldBackground)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(bordered ? quickReplyAccent.opacity(focusedEditor == focus ? 0.44 : 0.24) : Color.primary.opacity(0.04), lineWidth: 1)
        )
    }

    private func shouldUseVerticalQuickReplyLayout(width: CGFloat) -> Bool {
        // Quick Reply is intentionally vertical on Mac, iPad, and iPhone.
        // This keeps the writing flow consistent across all platforms.
        return true
    }

    var body: some View {
        GeometryReader { geo in
            let isPhone = geo.size.width < 650
            ScrollView {
                VStack(alignment: .leading, spacing: isPhone ? 14 : 18) {
                    quickReplyHeroHeader(isPhone: isPhone)
                    quickReplyStyleControls(isPhone: isPhone)
                    inputColumn
                    outputColumn
                    quickReplySecurityFooter
                }
                .padding(isPhone ? 14 : 24)
                .frame(
                    maxWidth: isPhone ? .infinity : 1040,
                    alignment: .center
                )
                .frame(width: geo.size.width, alignment: .center)
            }
            .background(bgMain)
        }
        .onAppear {
            if selectedCategory.isEmpty && !categories.isEmpty { selectedCategory = categories[0] }
            startKnowledgeBaseCloudListener()
        }
        .onDisappear {
            stopKnowledgeBaseCloudListener()
        }
        .onChange(of: aiKnowledgeBase) { _, _ in
            scheduleKnowledgeBaseCloudSave()
        }
        .onChange(of: quickReplyPoliteness) { _, _ in
            scheduleKnowledgeBaseCloudSave()
        }
        .onChange(of: quickReplyLength) { _, _ in
            scheduleKnowledgeBaseCloudSave()
        }
        .onChange(of: replyMode) { _, _ in
            generatedText = ""
            customerMessage = ""
            focusedEditor = nil
        }
    }

    private func quickReplyHeroHeader(isPhone: Bool) -> some View {
        HStack(alignment: .center, spacing: isPhone ? 12 : 14) {
            ZStack {
                LinearGradient(colors: [quickReplyAccent, quickReplyAccentTwo], startPoint: .topLeading, endPoint: .bottomTrailing)
                Image(systemName: "sparkles")
                    .font(.system(size: isPhone ? 20 : 22, weight: .bold))
                    .foregroundColor(.white)
            }
            .frame(width: isPhone ? 48 : 56, height: isPhone ? 48 : 56)
            .clipShape(RoundedRectangle(cornerRadius: isPhone ? 14 : 16, style: .continuous))
            .shadow(color: quickReplyAccent.opacity(colorScheme == .dark ? 0.22 : 0.28), radius: 14, y: 7)

            VStack(alignment: .leading, spacing: 4) {
                Text(quickReplyTitle)
                    .font(.system(size: isPhone ? 23 : 28, weight: .bold))
                    .foregroundColor(.primary)
                    .lineLimit(2)
                    .minimumScaleFactor(0.78)
                Text(quickReplySubtitle)
                    .font(.system(size: isPhone ? 13 : 15, weight: .medium))
                    .foregroundColor(quickReplyMutedText)
                    .lineLimit(2)
            }
        }
        .padding(.bottom, isPhone ? 4 : 8)
    }

    private func quickReplyPanel<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .padding(18)
            .background(quickReplyCardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(colorScheme == .dark ? Color.white.opacity(0.08) : Color.black.opacity(0.06), lineWidth: 1)
            )
            .shadow(color: colorScheme == .dark ? .clear : Color.black.opacity(0.06), radius: 18, y: 10)
    }

    private func quickReplyOptionGroup(
        title: String,
        iconName: String,
        options: [(String, String)],
        selection: String,
        action: @escaping (String) -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: iconName)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(quickReplyMutedText)
                Text(title)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.primary)
            }

            HStack(spacing: 0) {
                ForEach(options, id: \.0) { option in
                    quickReplyChoiceButton(
                        title: t(option.0, lang: seciliDil),
                        iconName: option.1,
                        isSelected: selection == option.0,
                        action: { action(option.0) }
                    )
                }
            }
            .background(colorScheme == .dark ? Color.white.opacity(0.04) : Color.white.opacity(0.76))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(colorScheme == .dark ? Color.white.opacity(0.10) : Color.black.opacity(0.10), lineWidth: 1)
            )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func quickReplyChoiceButton(title: String, iconName: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: {
            withAnimation(.easeInOut(duration: 0.16)) {
                action()
            }
        }) {
            HStack(spacing: 7) {
                Image(systemName: iconName)
                    .font(.system(size: 13, weight: .semibold))
                Text(title)
                    .lineLimit(1)
                    .minimumScaleFactor(0.76)
            }
            .font(.system(size: 13, weight: .semibold))
            .foregroundColor(isSelected ? quickReplyAccent : .primary.opacity(0.78))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)
            .padding(.horizontal, 8)
            .background(isSelected ? quickReplyAccent.opacity(colorScheme == .dark ? 0.20 : 0.10) : Color.clear)
            .overlay(
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .stroke(isSelected ? quickReplyAccent.opacity(0.42) : Color.clear, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func quickReplyCardHeader(iconName: String, title: String, subtitle: String? = nil, trailing: String? = nil) -> some View {
        HStack(alignment: .center, spacing: 14) {
            ZStack {
                quickReplyAccent.opacity(colorScheme == .dark ? 0.22 : 0.12)
                Image(systemName: iconName)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(quickReplyAccent)
            }
            .frame(width: 44, height: 44)
            .clipShape(Circle())

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.primary)
                    .lineLimit(2)
                    .minimumScaleFactor(0.82)
                if let subtitle {
                    Text(subtitle)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(quickReplyMutedText)
                        .lineLimit(2)
                }
            }

            Spacer(minLength: 8)

            if let trailing {
                Text(trailing)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(quickReplyMutedText)
            }
        }
    }

    private var quickReplySecurityFooter: some View {
        HStack(spacing: 8) {
            Image(systemName: "lock")
            Text("AI replies are generated securely and are not stored.")
        }
        .font(.system(size: 12, weight: .medium))
        .foregroundColor(quickReplyMutedText)
        .frame(maxWidth: .infinity)
        .padding(.top, 2)
    }

    @ViewBuilder
    private var inputColumn: some View {
        VStack(spacing: 20) {
            if isAIEngine {
                quickReplyPanel {
                    VStack(spacing: 14) {
                        quickReplyCardHeader(
                            iconName: "envelope",
                            title: inputCardTitle,
                            subtitle: "Paste the full email or message. The AI will detect the customer's name automatically.",
                            trailing: "\(customerMessage.count) / 8000"
                        )

                        quickReplyTextEditor(
                            text: $customerMessage,
                            placeholder: t("Paste the customer's email or message here...", lang: seciliDil),
                            minHeight: 300,
                            fontSize: 15,
                            focus: .customerMessage,
                            bordered: true
                        )

                        HStack(spacing: 8) {
                            Image(systemName: "sparkles")
                                .foregroundColor(quickReplyAccent)
                            Text("Tip: Include as much context as possible for the best reply.")
                                .foregroundColor(quickReplyMutedText)
                            Spacer(minLength: 0)
                        }
                        .font(.system(size: 12, weight: .medium))
                        .padding(.horizontal, 2)

                        Button(action: { Task { await generateAIReply() } }) {
                            HStack {
                                if isLoading {
                                    ProgressView().controlSize(.small).tint(.white)
                                    Text(loadingTitle)
                                } else {
                                    Image(systemName: "sparkles")
                                    Text(generateButtonTitle)
                                }
                            }
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(
                                LinearGradient(
                                    colors: isLoading ? [quickReplyAccent.opacity(0.45), quickReplyAccentTwo.opacity(0.45)] : [quickReplyAccent, quickReplyAccentTwo],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .disabled(customerMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isLoading)
                    }
                }
            } else {
                quickReplyPanel {
                    quickReplyCardHeader(iconName: "person.fill", title: t("Customer Info", lang: seciliDil), subtitle: t("Build a saved-template reply from customer details.", lang: seciliDil))
                    VStack(spacing: 12) {
                    HStack {
                        Text("Customer Name")
                            .font(.system(size: 13))
                            .foregroundColor(.gray)
                            .frame(width: 110, alignment: .leading)

                        TextField("e.g. John", text: $customerName)
                            .textFieldStyle(.plain)
                            .font(.system(size: 13))
                            .foregroundColor(.primary)
                            .padding(.vertical, 8)
                            .padding(.horizontal, 10)
                            .background(Color.primary.opacity(0.05))
                            .cornerRadius(6)
                    }
                    }
                }

                quickReplyPanel {
                    VStack(spacing: 15) {
                        quickReplyCardHeader(iconName: "list.bullet", title: t("Select Details", lang: seciliDil), subtitle: t("Choose the product and rule for this reply.", lang: seciliDil))

                        if !categories.isEmpty {
                            HStack {
                                Text("Product/Service")
                                    .font(.system(size: 13))
                                    .foregroundColor(.gray)
                                    .frame(width: 110, alignment: .leading)

                                Picker("", selection: $selectedCategory) {
                                    ForEach(categories, id: \.self) { Text($0) }
                                }
                                .pickerStyle(.menu)
                                .labelsHidden()

                                Spacer()
                            }
                        } else {
                            Text("Please add Products/Services in Settings.")
                                .font(.system(size: 12))
                                .foregroundColor(.red)
                        }

                        HStack {
                            Text("Topic/Rule")
                                .font(.system(size: 13))
                                .foregroundColor(.gray)
                                .frame(width: 110, alignment: .leading)

                            Picker("", selection: $selectedTopic) {
                                ForEach(topics, id: \.self) { Text($0) }
                            }
                            .pickerStyle(.menu)
                            .labelsHidden()

                            Spacer()
                        }

                        Button(action: generateOfflineReply) {
                            HStack {
                                Image(systemName: "text.quote")
                                Text("Generate Template")
                            }
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Color.blue)
                            .cornerRadius(8)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var outputColumn: some View {
        VStack(spacing: 20) {
            quickReplyPanel {
                VStack(spacing: 15) {
                    quickReplyCardHeader(
                        iconName: "doc.text",
                        title: t("Generated Email", lang: seciliDil),
                        subtitle: t("Your AI-generated reply will appear here. Review and copy with one click.", lang: seciliDil)
                    )

                    quickReplyTextEditor(
                        text: $generatedText,
                        placeholder: t("Your AI-generated reply will appear here...", lang: seciliDil),
                        minHeight: 260,
                        fontSize: 15,
                        focus: .generatedText,
                        bordered: true
                    )

                    Button(action: copyToClipboard) {
                        HStack {
                            Image(systemName: isCopied ? "checkmark.circle.fill" : "doc.on.doc.fill")
                            Text(isCopied ? t("Copied to Clipboard!", lang: seciliDil) : t("Copy Reply", lang: seciliDil))
                        }
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(generatedText.isEmpty ? quickReplyMutedText.opacity(0.45) : (isCopied ? Color.green : quickReplyAccent))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(generatedText.isEmpty ? Color.primary.opacity(0.04) : quickReplyAccent.opacity(colorScheme == .dark ? 0.14 : 0.06))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .stroke(generatedText.isEmpty ? Color.primary.opacity(0.08) : quickReplyAccent.opacity(0.22), lineWidth: 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(generatedText.isEmpty)
                    .opacity(generatedText.isEmpty ? 0.5 : 1.0)
                }
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func startKnowledgeBaseCloudListener() {
        knowledgeBaseCloudListener?.remove()
        knowledgeBaseCloudListener = Firestore.firestore()
            .collection("companySettings")
            .document(firebaseManager.currentCompanyId)
            .addSnapshotListener { snapshot, error in
                if let error = error {
                    print("Quick Reply cloud listener error: \(error)")
                    return
                }

                guard let data = snapshot?.data() else { return }
                let role = firebaseManager.currentWorkspaceRole.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                if role != "owner" { return }

                var changedFromCloud = false

                if let cloudReplyMode = data["replyMode"] as? String {
                    let normalizedReplyMode = cloudReplyMode == "Local" ? "Apple" : cloudReplyMode
                    if normalizedReplyMode != replyMode {
                        changedFromCloud = true
                        replyMode = normalizedReplyMode
                    }
                }

                if let cloudKnowledgeBase = data["aiKnowledgeBase"] as? String,
                   cloudKnowledgeBase != aiKnowledgeBase {
                    changedFromCloud = true
                    aiKnowledgeBase = cloudKnowledgeBase
                }

                if let cloudPoliteness = data["quickReplyPoliteness"] as? String,
                   cloudPoliteness != quickReplyPoliteness {
                    changedFromCloud = true
                    quickReplyPoliteness = cloudPoliteness
                }

                if let cloudLength = data["quickReplyLength"] as? String,
                   cloudLength != quickReplyLength {
                    changedFromCloud = true
                    quickReplyLength = cloudLength
                }

                if let cloudProductsJSON = data["customProductsJSON"] as? String,
                   cloudProductsJSON != customProductsJSON {
                    changedFromCloud = true
                    customProductsJSON = cloudProductsJSON
                }

                if let cloudRulesJSON = data["customRulesJSON"] as? String,
                   cloudRulesJSON != customRulesJSON {
                    changedFromCloud = true
                    customRulesJSON = cloudRulesJSON
                }

                if changedFromCloud {
                    isApplyingCloudKnowledgeBase = true
                    DispatchQueue.main.async {
                        isApplyingCloudKnowledgeBase = false
                    }
                }
            }
        loadPersonalQuickReplySettings()
    }

    private func loadPersonalQuickReplySettings() {
        guard !firebaseManager.currentCompanyId.isEmpty else { return }
        Functions.functions(region: "europe-west2").httpsCallable("getQuickReplyPersonalSettings").call([
            "companyId": firebaseManager.currentCompanyId
        ]) { result, _ in
            guard let payload = result?.data as? [String: Any],
                  let settings = payload["settings"] as? [String: Any] else { return }
            DispatchQueue.main.async {
                isApplyingCloudKnowledgeBase = true
                if let mode = settings["replyMode"] as? String { replyMode = mode == "Local" ? "Apple" : mode }
                if let style = settings["quickReplyPoliteness"] as? String { quickReplyPoliteness = style }
                if let length = settings["quickReplyLength"] as? String { quickReplyLength = length }
                if let knowledge = settings["onDeviceKnowledgeBase"] as? String { aiKnowledgeBase = knowledge }
                if let json = settings["offlineProductsJSON"] as? String { customProductsJSON = json }
                if let json = settings["offlineRulesJSON"] as? String { customRulesJSON = json }
                isApplyingCloudKnowledgeBase = false
            }
        }
    }

    private func stopKnowledgeBaseCloudListener() {
        knowledgeBaseCloudListener?.remove()
        knowledgeBaseCloudListener = nil
        knowledgeBaseSaveWorkItem?.cancel()
        knowledgeBaseSaveWorkItem = nil
    }

    private func scheduleKnowledgeBaseCloudSave() {
        guard !isApplyingCloudKnowledgeBase else { return }

        knowledgeBaseSaveWorkItem?.cancel()
        let latestText = aiKnowledgeBase
        let latestPoliteness = quickReplyPoliteness
        let latestLength = quickReplyLength
        let latestMode = replyMode == "Local" ? "Apple" : replyMode

        let workItem = DispatchWorkItem {
            Functions.functions(region: "europe-west2").httpsCallable("saveQuickReplyPersonalSettings").call([
                "companyId": firebaseManager.currentCompanyId,
                "settings": [
                    "replyMode": latestMode,
                    "quickReplyPoliteness": latestPoliteness,
                    "quickReplyLength": latestLength,
                    "onDeviceKnowledgeBase": latestText,
                    "products": decodedCustomProducts.map { ["id": $0.id.uuidString, "title": $0.title, "desc": $0.desc] },
                    "rules": decodedCustomRules.map { ["id": $0.id.uuidString, "title": $0.title, "desc": $0.desc] }
                ]
            ]) { _, _ in }
        }

        knowledgeBaseSaveWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8, execute: workItem)
    }

    private func generateOfflineReply() {
        let trimmedName = customerName.trimmingCharacters(in: .whitespaces)
        let nameGreeting: String

        if trimmedName.isEmpty {
            nameGreeting = quickReplyPoliteness == t("Direct", lang: seciliDil) ? "Hi," : "Hi there,"
        } else {
            nameGreeting = quickReplyPoliteness == t("Very Polite", lang: seciliDil) ? "Dear \(trimmedName)," : "Hi \(trimmedName),"
        }

        var bodyText = ""

        if selectedTopic == "Price & Info" {
            if quickReplyPoliteness == t("Direct", lang: seciliDil) {
                bodyText = ""
            } else {
                bodyText = "Thank you for your interest!\n\n"
            }

            if let matchedProduct = decodedCustomProducts.first(where: { $0.title == selectedCategory }) {
                bodyText += matchedProduct.desc
            }

            if quickReplyLength != "Short" {
                bodyText += "\n\nPlease let me know if you have any other questions."
            }
        } else if let matchedRule = decodedCustomRules.first(where: { $0.title == selectedTopic }) {
            bodyText = matchedRule.desc
        } else {
            bodyText = t("Thank you for your message. We will get back to you shortly.", lang: seciliDil)
        }

        if quickReplyLength == t("Detailed", lang: seciliDil) {
            bodyText += "\n\nIf helpful, please send any additional details and we will guide you through the next step."
        }

        let signOff = quickReplyPoliteness == t("Very Polite", lang: seciliDil) ? "Kind regards," : "Best regards,"
        generatedText = "\(nameGreeting)\n\n\(bodyText.trimmingCharacters(in: .whitespacesAndNewlines))\n\n\(signOff)\nThe Team"
        isCopied = false
    }
    
    private func generateAIReply() async {
        if replyMode == "Apple" || replyMode == "Local" {
            await fetchAppleFoundationResponse()
        } else {
            await fetchAIResponse()
        }
    }

    private func aiSystemPrompt(knowledge: String) -> String {
        return "You are the official Customer Support AI for this company.\nSTYLE INSTRUCTIONS:\n\(replyStyleInstruction)\n\nCRITICAL INSTRUCTION:\nYour ONLY source of truth is the 'COMPANY KNOWLEDGE BASE' provided below.\nYou MUST base your entire response strictly on this knowledge base.\nDo NOT use any outside knowledge. Do NOT guess, invent, or hallucinate prices, timelines, or rules.\nIf the answer to the customer's question is NOT in the knowledge base, politely state that you will check with the team and get back to them.\n\n--- COMPANY KNOWLEDGE BASE START ---\n\(knowledge.isEmpty ? "No specific rules provided. Just be polite and say we will contact them soon." : knowledge)\n--- COMPANY KNOWLEDGE BASE END ---\n\nINSTRUCTIONS FOR REPLY:\n1. Extract the customer's name from their message and greet them personally. If no name is found, use a polite greeting like 'Hi there,'.\n2. Answer specifically what they asked using ONLY facts from the Knowledge Base.\n3. Be warm and highly professional in your tone.\n4. Sign off as 'The Team'."
    }

    private func appleSystemPrompt(knowledge: String) -> String {
        return """
        You are the official Customer Support AI for this company.

        Style Instructions:
        \(replyStyleInstruction)

        Rules:
        - Use ONLY the Company Knowledge below.
        - Do not invent prices, timelines, policies, or facts.
        - If the answer is not in the Company Knowledge, say we will check with the team and get back to them.
        - Be warm, concise, professional, and clear.
        - Start with the customer's name if visible, otherwise use "Hi there,".
        - Sign off as "The Team".

        Company Knowledge:
        \(knowledge.isEmpty ? "No specific rules provided. Be polite and say we will contact them soon." : knowledge)
        """
    }

    private func limitedText(_ text: String, maxCharacters: Int) -> String {
        guard text.count > maxCharacters else { return text }
        return String(text.prefix(maxCharacters))
    }

    private func appleKnowledgeBaseFor(message: String, maxCharacters: Int = 3200) -> String {
        let fullKnowledge = aiKnowledgeBase.trimmingCharacters(in: .whitespacesAndNewlines)
        guard fullKnowledge.count > maxCharacters else { return fullKnowledge }

        let queryWords = Set(
            message
                .lowercased()
                .components(separatedBy: CharacterSet.alphanumerics.inverted)
                .filter { $0.count >= 3 }
        )

        let paragraphChunks = fullKnowledge
            .components(separatedBy: "\n\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        let chunks: [String]
        if paragraphChunks.count > 1 {
            chunks = paragraphChunks
        } else {
            chunks = fullKnowledge
                .components(separatedBy: .newlines)
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
        }

        struct ScoredKnowledgeChunk {
            let text: String
            let score: Int
            let index: Int
        }

        let scoredChunks = chunks.enumerated().map { index, chunk -> ScoredKnowledgeChunk in
            let words = Set(
                chunk
                    .lowercased()
                    .components(separatedBy: CharacterSet.alphanumerics.inverted)
                    .filter { $0.count >= 3 }
            )

            let score = words.intersection(queryWords).count
            return ScoredKnowledgeChunk(text: chunk, score: score, index: index)
        }
        .sorted {
            if $0.score == $1.score {
                return $0.index < $1.index
            }
            return $0.score > $1.score
        }

        var selected: [String] = []
        var currentCount = 0

        for chunk in scoredChunks {
            let nextLength = chunk.text.count + 2
            if currentCount + nextLength <= maxCharacters {
                selected.append(chunk.text)
                currentCount += nextLength
            }

            if currentCount >= maxCharacters { break }
        }

        if selected.isEmpty {
            return limitedText(fullKnowledge, maxCharacters: maxCharacters)
        }

        let compactKnowledge = selected.joined(separator: "\n\n")
        return limitedText(compactKnowledge, maxCharacters: maxCharacters)
    }

    private func fetchAppleFoundationResponse() async {
        let message = customerMessage.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !message.isEmpty else {
            generatedText = "⚠️ Error: Customer message is empty. Please paste a message."
            return
        }

        let knowledge = appleKnowledgeBaseFor(message: message, maxCharacters: 3200)
        let compactMessage = limitedText(message, maxCharacters: 2500)

        #if canImport(FoundationModels)
        if #available(iOS 26.0, macOS 26.0, *) {
            let model = SystemLanguageModel.default

            guard model.isAvailable else {
                generatedText = """
                ⚠️ Apple On-Device AI is not available on this device.

                Please check:
                • The device supports Apple Intelligence
                • Apple Intelligence is enabled in Settings
                • The on-device model has finished downloading
                • The device is not in a restricted state

                You can still use OpenAI Online or Offline Template mode.
                """
                return
            }

            isLoading = true

            do {
                let session = LanguageModelSession {
                    appleSystemPrompt(knowledge: knowledge)
                }

                let response = try await session.respond(to: "Customer Message: \"\(compactMessage)\"")

                DispatchQueue.main.async {
                    self.generatedText = response.content.trimmingCharacters(in: .whitespacesAndNewlines)
                    self.isLoading = false
                }
            } catch {
                DispatchQueue.main.async {
                    self.generatedText = "⚠️ Apple On-Device AI Error:\n\(error.localizedDescription)\n\nI now send Apple AI a shorter, relevant part of the Knowledge Base. If this still appears, reduce very long pasted customer messages or use OpenAI Online for very large context."
                    self.isLoading = false
                }
            }
        } else {
            generatedText = """
            ⚠️ Apple On-Device AI requires iOS/iPadOS/macOS 26 or newer with Apple Intelligence support.

            You can still use OpenAI Online or Offline Template mode.
            """
        }
        #else
        generatedText = """
        ⚠️ Apple Foundation Models framework is not available in this build.

        Please build with an Xcode/SDK version that includes FoundationModels.
        """
        #endif
    }

    private func fetchLocalAIResponse() async {
        let baseURL = localAIURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let model = localAIModel.trimmingCharacters(in: .whitespacesAndNewlines)
        let message = customerMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        let knowledge = aiKnowledgeBase.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !baseURL.isEmpty else {
            generatedText = "⚠️ Local AI Error: Local AI URL is missing.\n\nPlease go to Settings -> Quick Reply Settings and enter your Ollama URL."
            return
        }

        guard !model.isEmpty else {
            generatedText = "⚠️ Local AI Error: Model name is missing.\n\nExample: llama3.1:latest, qwen2.5:latest, deepseek-r1:latest, or any custom Ollama model tag"
            return
        }

        guard !message.isEmpty else {
            generatedText = "⚠️ Error: Customer message is empty. Please paste a message."
            return
        }

        let cleanBaseURL = baseURL.replacingOccurrences(of: "/+$", with: "", options: .regularExpression)
        guard let url = URL(string: cleanBaseURL + "/api/chat") else {
            generatedText = "⚠️ Local AI Error: Invalid Ollama URL."
            return
        }

        isLoading = true

        let requestBody = OllamaRequest(
            model: model,
            messages: [
                OpenAIMessage(role: "system", content: aiSystemPrompt(knowledge: knowledge)),
                OpenAIMessage(role: "user", content: "Customer Message: \"\(message)\"")
            ],
            stream: false,
            options: OllamaOptions(temperature: 0.2)
        )

        guard let jsonData = try? JSONEncoder().encode(requestBody) else {
            isLoading = false
            generatedText = "⚠️ Local AI Error: Could not prepare the request."
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = jsonData
        request.timeoutInterval = 120

        do {
            let (data, response) = try await URLSession.shared.data(for: request)

            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode != 200 {
                if let decodedError = try? JSONDecoder().decode(OllamaResponse.self, from: data),
                   let errorMessage = decodedError.error {
                    DispatchQueue.main.async {
                        self.generatedText = "⚠️ Local AI Error (\(httpResponse.statusCode)):\n\(errorMessage)"
                        self.isLoading = false
                    }
                } else {
                    let raw = String(data: data, encoding: .utf8) ?? "Unknown local AI error."
                    DispatchQueue.main.async {
                        self.generatedText = "⚠️ Local AI Error (\(httpResponse.statusCode)):\n\(raw)"
                        self.isLoading = false
                    }
                }
                return
            }

            let decodedResponse = try JSONDecoder().decode(OllamaResponse.self, from: data)
            if let reply = decodedResponse.message?.content {
                DispatchQueue.main.async {
                    self.generatedText = reply.trimmingCharacters(in: .whitespacesAndNewlines)
                    self.isLoading = false
                }
            } else {
                DispatchQueue.main.async {
                    self.generatedText = "⚠️ Local AI Error: No response text was returned by the local model."
                    self.isLoading = false
                }
            }
        } catch {
            DispatchQueue.main.async {
                self.generatedText = "⚠️ Local AI Network Error:\n\(error.localizedDescription)\n\nMake sure Ollama is running and the model name is correct."
                self.isLoading = false
            }
        }
    }

    private func fetchAIResponse() async {
        let message = customerMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty else {
            generatedText = "⚠️ Error: Customer message is empty. Please paste a message."
            return
        }
        isLoading = true
        let payload: [String: Any] = [
            "companyId": firebaseManager.currentCompanyId,
            "mode": "AI",
            "customerMessage": message,
            "politeness": quickReplyPoliteness,
            "length": quickReplyLength
        ]
        do {
            let result = try await Functions.functions(region: "europe-west2").httpsCallable("generateQuickReply").call(payload)
            let data = result.data as? [String: Any]
            let reply = (data?["reply"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            await MainActor.run {
                generatedText = reply.isEmpty ? "⚠️ OpenAI returned no response text." : reply
                isLoading = false
            }
        } catch {
            await MainActor.run {
                generatedText = "⚠️ Quick Reply Error:\n\(error.localizedDescription)"
                isLoading = false
            }
        }
    }

    private func copyToClipboard() {
        #if os(macOS)
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(generatedText, forType: .string)
        #elseif os(iOS)
        UIPasteboard.general.string = generatedText
        #endif

        withAnimation { isCopied = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            withAnimation { isCopied = false }
        }
    }
}

struct Card<Content: View>: View {
    @Environment(\.colorScheme) var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    private var isPhoneLayout: Bool { horizontalSizeClass == .compact }

    let title: String
    let iconName: String
    let content: Content
    
    init(title: String, iconName: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.iconName = iconName
        self.content = content()
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 15) {
            HStack(spacing: 8) {
                Image(systemName: iconName).foregroundColor(.gray)
                Text(title)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)
            }
            .padding(.bottom, 5)
            content
        }
        .padding(isPhoneLayout ? 14 : 20)
        .background(colorScheme == .dark ? Color.white.opacity(0.05) : Color.white)
        .cornerRadius(12)
        .shadow(color: colorScheme == .dark ? .clear : Color.black.opacity(0.03), radius: 5, y: 2)
    }
}
