import SwiftUI
import UniformTypeIdentifiers

struct StudioMessagesView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @EnvironmentObject var firebaseManager: FirebaseManager
    @Environment(\.colorScheme) private var colorScheme

    @State private var selectedThreadId: String = "team"
    @State private var draftText: String = ""
    @State private var isFileImporterPresented: Bool = false
    @State private var hasConsumedPendingRoute: Bool = false
    @State private var isDirectMemberPickerExpanded: Bool = false
    @State private var isShowingConversationOnPhone: Bool = false

    private var companyId: String {
        let authCompanyId = cleanText(authVM.currentCompanyId ?? "")
        let fallbackCompanyId = cleanText(firebaseManager.currentCompanyId)
        return authCompanyId.isEmpty ? fallbackCompanyId : authCompanyId
    }

    private var currentUserId: String {
        cleanText(authVM.currentUserId ?? "")
    }

    private var currentUserEmail: String {
        cleanText(authVM.accountEmail).lowercased()
    }

    private func cleanText(_ value: String) -> String {
        value.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines)
    }

    private var visibleMessageThreads: [StudioMessageThread] {
        firebaseManager.messageThreads.filter { canCurrentUserSee(thread: $0) }
    }

    private var selectedThread: StudioMessageThread? {
        visibleMessageThreads.first(where: { $0.id == selectedThreadId }) ?? visibleMessageThreads.first(where: { $0.id == "team" }) ?? visibleMessageThreads.first
    }

    private var selectedMessages: [StudioMessageItem] {
        firebaseManager.messageItemsByThreadId[selectedThread?.id ?? selectedThreadId] ?? []
    }

    private var conversationThreads: [StudioMessageThread] {
        var seen = Set<String>()
        return visibleMessageThreads
            .filter { $0.type != "team" }
            .filter { thread in
                guard !seen.contains(thread.id) else { return false }
                seen.insert(thread.id)
                return true
            }
            .sorted { lhs, rhs in
                if lhs.lastMessageAt != rhs.lastMessageAt { return lhs.lastMessageAt > rhs.lastMessageAt }
                return displayTitle(for: lhs).localizedCaseInsensitiveCompare(displayTitle(for: rhs)) == .orderedAscending
            }
    }

    private var unreadConversationCount: Int {
        visibleMessageThreads.filter { $0.isUnread && $0.id != selectedThreadId }.count
    }

    var body: some View {
        GeometryReader { geometry in
            messagesRoot(isCompact: geometry.size.width < 700)
                .frame(width: geometry.size.width, height: geometry.size.height)
        }
        .background(Color.primary.opacity(colorScheme == .dark ? 0.025 : 0.015))
        .onAppear {
            bootstrapMessages()
        }
        .onReceive(NotificationCenter.default.publisher(for: .studioMessageThreadRouteRequested)) { _ in
            consumePendingMessageRoute()
        }
        .fileImporter(
            isPresented: $isFileImporterPresented,
            allowedContentTypes: [.item],
            allowsMultipleSelection: false
        ) { result in
            handleImportedFile(result)
        }
    }

    @ViewBuilder
    private func messagesRoot(isCompact: Bool) -> some View {
        if isCompact {
            ZStack {
                threadListPanel(isCompact: true)
                    .opacity(isShowingConversationOnPhone ? 0 : 1)
                    .allowsHitTesting(!isShowingConversationOnPhone)

                conversationPanel(isCompact: true)
                    .opacity(isShowingConversationOnPhone ? 1 : 0)
                    .allowsHitTesting(isShowingConversationOnPhone)
            }
            .animation(.easeInOut(duration: 0.18), value: isShowingConversationOnPhone)
        } else {
            HStack(spacing: 0) {
                threadListPanel(isCompact: false)
                    .frame(width: 330)
                    .background(Color.primary.opacity(colorScheme == .dark ? 0.055 : 0.035))

                Divider()

                conversationPanel(isCompact: false)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }

    private func threadListPanel(isCompact: Bool) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Messages", systemImage: "message.fill")
                    .font(.system(size: 20, weight: .bold))
                Spacer()
                if unreadConversationCount > 0 {
                    Text("\(unreadConversationCount)")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(Color.red))
                }
            }
            .padding(.horizontal, isCompact ? 18 : 16)
            .padding(.top, isCompact ? 18 : 16)

            Button {
                openTeamChat()
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "person.3.fill")
                        .foregroundColor(.blue)
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(Color.blue.opacity(0.12)))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Team Chat")
                            .font(.system(size: 14, weight: .bold))
                        Text("Everyone in this workspace")
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 14).fill(selectedThreadId == "team" ? Color.blue.opacity(0.12) : Color.clear))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, isCompact ? 14 : 12)

            Divider()

            ScrollView {
                VStack(spacing: 8) {
                    directMessagePicker

                    Divider().padding(.vertical, 6)

                    Text("Conversations")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 6)

                    if conversationThreads.isEmpty {
                        Text("No direct conversations yet.")
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 8)
                    } else {
                        ForEach(conversationThreads) { thread in
                            threadRow(thread)
                        }
                    }
                }
                .padding(.horizontal, 10)
                .padding(.bottom, 16)
            }

            if !firebaseManager.messageStatus.isEmpty {
                Text(firebaseManager.messageStatus)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 16)
                    .padding(.bottom, firebaseManager.messageError.isEmpty ? 8 : 2)
            }

            if !firebaseManager.messageError.isEmpty {
                Text(firebaseManager.messageError)
                    .font(.system(size: 11))
                    .foregroundColor(.red)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 8)
            }
        }
    }

    private var directMessagePicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation(.easeInOut(duration: 0.18)) {
                    isDirectMemberPickerExpanded.toggle()
                }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "person.crop.circle.badge.plus")
                        .foregroundColor(.blue)
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(Color.blue.opacity(0.12)))

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Direct Messages")
                            .font(.system(size: 13, weight: .bold))
                        Text(isDirectMemberPickerExpanded ? "Choose a team member" : "Tap to start a private chat")
                            .font(.system(size: 10.5))
                            .foregroundColor(.secondary)
                    }

                    Spacer()

                    Image(systemName: isDirectMemberPickerExpanded ? "chevron.up" : "chevron.down")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 14).fill(Color.primary.opacity(0.035)))
            }
            .buttonStyle(.plain)

            if isDirectMemberPickerExpanded {
                VStack(spacing: 6) {
                    let members = firebaseManager.messageTeamMembers.filter { $0.id != currentUserId }
                    if members.isEmpty {
                        Text("Team members will appear here.")
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(10)
                    } else {
                        ForEach(members) { member in
                            Button {
                                startDirectMessage(with: member)
                                withAnimation(.easeInOut(duration: 0.18)) {
                                    isDirectMemberPickerExpanded = false
                                }
                            } label: {
                                directMemberRow(member)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(8)
                .background(RoundedRectangle(cornerRadius: 14).fill(Color.primary.opacity(0.025)))
            }
        }
    }


    private func canCurrentUserSee(thread: StudioMessageThread) -> Bool {
        if thread.id == "team" || thread.type == "team" { return true }
        let cleanUid = currentUserId
        let cleanEmail = currentUserEmail
        if !cleanUid.isEmpty && thread.memberUids.contains(cleanUid) { return true }
        if !cleanEmail.isEmpty && thread.memberEmails.map({ cleanText($0).lowercased() }).contains(cleanEmail) { return true }
        return false
    }

    private func displayTitle(for thread: StudioMessageThread) -> String {
        if thread.type == "team" { return "Team Chat" }

        if let member = otherMember(for: thread) {
            let memberName = cleanText(member.name)
            if !memberName.isEmpty { return memberName }
            let memberEmail = cleanText(member.email)
            if !memberEmail.isEmpty { return memberEmail }
        }

        let otherEmail = otherEmail(for: thread)
        if !otherEmail.isEmpty { return otherEmail }

        let fallbackTitle = cleanText(thread.title)
        return fallbackTitle.isEmpty ? "Direct Message" : fallbackTitle
    }

    private func threadAvatarURL(for thread: StudioMessageThread) -> String {
        if thread.type == "team" { return thread.lastMessageByPhotoURL }
        if let member = otherMember(for: thread) {
            let photoURL = cleanText(member.photoURL)
            if !photoURL.isEmpty { return photoURL }
        }
        return thread.lastMessageByPhotoURL
    }

    private func otherMember(for thread: StudioMessageThread) -> StudioMessageTeamMember? {
        let otherUid = thread.memberUids.first { uid in
            let cleanUid = cleanText(uid)
            return !cleanUid.isEmpty && cleanUid != currentUserId
        } ?? ""

        if !otherUid.isEmpty, let member = firebaseManager.messageTeamMembers.first(where: { $0.id == otherUid }) {
            return member
        }

        let email = otherEmail(for: thread)
        guard !email.isEmpty else { return nil }
        return firebaseManager.messageTeamMembers.first { member in
            cleanText(member.email).lowercased() == email
        }
    }

    private func otherEmail(for thread: StudioMessageThread) -> String {
        for email in thread.memberEmails {
            let cleanEmail = cleanText(email).lowercased()
            if !cleanEmail.isEmpty && cleanEmail != currentUserEmail {
                return cleanEmail
            }
        }
        return ""
    }

    private func isUnreadForDisplay(_ thread: StudioMessageThread) -> Bool {
        thread.isUnread && thread.id != selectedThreadId
    }

    private func directMemberRow(_ member: StudioMessageTeamMember) -> some View {
        HStack(spacing: 10) {
            StudioMessageAvatar(urlString: member.photoURL, name: member.name.isEmpty ? member.email : member.name, size: 34)
            VStack(alignment: .leading, spacing: 2) {
                Text(member.name.isEmpty ? member.email : member.name)
                    .font(.system(size: 13, weight: .semibold))
                    .lineLimit(1)
                if !member.email.isEmpty {
                    Text(member.email)
                        .font(.system(size: 10.5))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .padding(8)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color.primary.opacity(0.035)))
    }

    private func threadRow(_ thread: StudioMessageThread) -> some View {
        Button {
            selectThread(thread.id)
        } label: {
            HStack(spacing: 10) {
                StudioMessageAvatar(urlString: threadAvatarURL(for: thread), name: displayTitle(for: thread), size: 36)
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(displayTitle(for: thread))
                            .font(.system(size: 13, weight: isUnreadForDisplay(thread) ? .bold : .semibold))
                            .lineLimit(1)
                        Spacer()
                        if isUnreadForDisplay(thread) {
                            Circle()
                                .fill(Color.red)
                                .frame(width: 8, height: 8)
                        }
                    }
                    Text(thread.lastMessageText.isEmpty ? "No messages yet" : thread.lastMessageText)
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .padding(9)
            .background(RoundedRectangle(cornerRadius: 14).fill(selectedThreadId == thread.id ? Color.blue.opacity(0.12) : Color.clear))
        }
        .buttonStyle(.plain)
    }

    private func conversationPanel(isCompact: Bool) -> some View {
        VStack(spacing: 0) {
            conversationHeader(isCompact: isCompact)
            Divider()
            messageScroll(isCompact: isCompact)
            Divider()
            composer(isCompact: isCompact)
        }
        .background(Color.primary.opacity(colorScheme == .dark ? 0.02 : 0.01))
    }

    private func conversationHeader(isCompact: Bool) -> some View {
        HStack(spacing: isCompact ? 10 : 12) {
            if isCompact {
                Button {
                    isShowingConversationOnPhone = false
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 17, weight: .bold))
                        .frame(width: 34, height: 34)
                }
                .buttonStyle(.plain)
            }

            StudioMessageAvatar(urlString: selectedHeaderAvatarURL, name: selectedHeaderTitle, size: isCompact ? 38 : 42)

            VStack(alignment: .leading, spacing: 2) {
                Text(selectedHeaderTitle)
                    .font(.system(size: isCompact ? 16 : 18, weight: .bold))
                    .lineLimit(1)
                Text(selectedThread?.type == "team" ? "Workspace group conversation" : "Direct message")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            Button {
                refreshCurrentThread()
            } label: {
                Image(systemName: "arrow.clockwise")
            }
            .buttonStyle(.borderless)
        }
        .padding(.horizontal, isCompact ? 10 : 16)
        .padding(.vertical, isCompact ? 10 : 16)
    }

    private var selectedHeaderTitle: String {
        guard let thread = selectedThread else { return "Messages" }
        return displayTitle(for: thread)
    }

    private var selectedHeaderAvatarURL: String {
        guard let thread = selectedThread else { return "" }
        return threadAvatarURL(for: thread)
    }

    private func messageScroll(isCompact: Bool) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 10) {
                    ForEach(selectedMessages) { message in
                        messageBubble(message, isCompact: isCompact)
                            .id(message.id)
                    }

                    if selectedMessages.isEmpty {
                        VStack(spacing: 10) {
                            Image(systemName: "bubble.left.and.bubble.right")
                                .font(.system(size: 38))
                                .foregroundColor(.secondary)
                            Text("No messages yet")
                                .font(.system(size: 16, weight: .semibold))
                            Text("Start the conversation with your workspace team.")
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                        }
                        .padding(.top, 80)
                    }
                }
                .padding(isCompact ? 12 : 18)
            }
            .onChange(of: selectedMessages.count) { _, _ in
                if let last = selectedMessages.last {
                    withAnimation(.snappy) { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
        }
    }

    private func fileAttachmentView(_ message: StudioMessageItem, isCompact: Bool) -> some View {
        let url = URL(string: message.fileURL)
        let imageLike = isImageAttachment(message)
        return Link(destination: url ?? URL(fileURLWithPath: "/")) {
            VStack(alignment: .leading, spacing: 8) {
                if imageLike, let url {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .scaledToFill()
                        case .failure:
                            ZStack {
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .fill(Color.primary.opacity(0.08))
                                Image(systemName: "photo")
                                    .font(.system(size: 28, weight: .semibold))
                                    .foregroundColor(.secondary)
                            }
                        case .empty:
                            ZStack {
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .fill(Color.primary.opacity(0.08))
                                ProgressView()
                                    .scaleEffect(0.85)
                            }
                        @unknown default:
                            EmptyView()
                        }
                    }
                    .frame(width: isCompact ? 180 : 220, height: isCompact ? 120 : 145)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(Color.primary.opacity(0.08), lineWidth: 1)
                    )
                }

                HStack(spacing: 9) {
                    Image(systemName: fileIconName(for: message))
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.blue)
                        .frame(width: 30, height: 30)
                        .background(Circle().fill(Color.blue.opacity(0.12)))

                    VStack(alignment: .leading, spacing: 2) {
                        Text(message.fileName.isEmpty ? "Attachment" : message.fileName)
                            .font(.system(size: 12.5, weight: .semibold))
                            .foregroundColor(.primary)
                            .lineLimit(1)
                        Text(fileMetaText(for: message))
                            .font(.system(size: 10.5))
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }

                    Spacer(minLength: 6)

                    Image(systemName: "arrow.down.circle")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.secondary)
                }
            }
            .padding(imageLike ? 6 : 9)
            .frame(width: attachmentCardWidth(for: message, isCompact: isCompact), alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.primary.opacity(0.055)))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.primary.opacity(0.06), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private func attachmentCardWidth(for message: StudioMessageItem, isCompact: Bool) -> CGFloat {
        if isImageAttachment(message) { return isCompact ? 218 : 252 }
        return isCompact ? 238 : 320
    }

    private func isImageAttachment(_ message: StudioMessageItem) -> Bool {
        let type = message.fileType.lowercased()
        let name = message.fileName.lowercased()
        if message.type.lowercased() == "image" { return true }
        if type.hasPrefix("image/") { return true }
        return [".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"].contains { name.hasSuffix($0) }
    }

    private func fileIconName(for message: StudioMessageItem) -> String {
        let type = message.fileType.lowercased()
        let name = message.fileName.lowercased()
        if isImageAttachment(message) { return "photo" }
        if type.contains("pdf") || name.hasSuffix(".pdf") { return "doc.richtext" }
        if type.contains("zip") || name.hasSuffix(".zip") { return "archivebox" }
        return "paperclip"
    }

    private func fileMetaText(for message: StudioMessageItem) -> String {
        let sizeText = formattedFileSize(message.fileSize)
        let type = message.fileType.trimmingCharacters(in: .whitespacesAndNewlines)
        if !type.isEmpty && !sizeText.isEmpty { return "\(type) • \(sizeText)" }
        if !sizeText.isEmpty { return sizeText }
        if !type.isEmpty { return type }
        return "Tap to open"
    }

    private func formattedFileSize(_ bytes: Int64) -> String {
        guard bytes > 0 else { return "" }
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useKB, .useMB, .useGB]
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }

    private func messageBubble(_ message: StudioMessageItem, isCompact: Bool) -> some View {
        let isMine = message.senderUid == currentUserId
        return HStack(alignment: .bottom, spacing: 8) {
            if isMine { Spacer(minLength: isCompact ? 34 : 60) }
            if !isMine {
                StudioMessageAvatar(urlString: message.senderPhotoURL, name: message.senderName.isEmpty ? message.senderEmail : message.senderName, size: isCompact ? 28 : 32)
            }
            VStack(alignment: isMine ? .trailing : .leading, spacing: 5) {
                if !isMine {
                    Text(message.senderName.isEmpty ? message.senderEmail : message.senderName)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.secondary)
                }
                VStack(alignment: .leading, spacing: 6) {
                    if !message.text.isEmpty {
                        Text(message.text)
                            .font(.system(size: isCompact ? 14 : 13.5))
                            .textSelection(.enabled)
                    }
                    if !message.fileURL.isEmpty {
                        fileAttachmentView(message, isCompact: isCompact)
                    }
                }
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(isMine ? Color.blue.opacity(0.18) : Color.primary.opacity(0.06)))

                Text(message.createdAt, style: .time)
                    .font(.system(size: 9.5))
                    .foregroundColor(.secondary)
            }
            if isMine {
                StudioMessageAvatar(urlString: message.senderPhotoURL, name: message.senderName.isEmpty ? "Me" : message.senderName, size: isCompact ? 24 : 28)
            }
            if !isMine { Spacer(minLength: isCompact ? 34 : 60) }
        }
    }

    private func composer(isCompact: Bool) -> some View {
        HStack(alignment: .bottom, spacing: 10) {
            Button {
                isFileImporterPresented = true
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: firebaseManager.isSendingMessage ? "hourglass" : "paperclip")
                        .font(.system(size: 17, weight: .bold))
                    if !isCompact {
                        Text(firebaseManager.isSendingMessage ? "Uploading" : "Attach")
                            .font(.system(size: 12, weight: .semibold))
                    }
                }
                .frame(minWidth: isCompact ? 38 : 86, minHeight: 36)
                .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(Color.primary.opacity(0.06)))
            }
            .buttonStyle(.plain)
            .disabled(firebaseManager.isSendingMessage)

            TextField("Message", text: $draftText, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...5)
                .submitLabel(.send)
                .onSubmit {
                    sendTextMessage()
                }
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 14).fill(Color.primary.opacity(0.06)))

            Button {
                sendTextMessage()
            } label: {
                if firebaseManager.isSendingMessage {
                    ProgressView().scaleEffect(0.7)
                } else {
                    Image(systemName: "paperplane.fill")
                        .font(.system(size: 16, weight: .bold))
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(firebaseManager.isSendingMessage || draftText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(isCompact ? 10 : 14)
        .overlay(alignment: .topLeading) {
            if firebaseManager.isSendingMessage {
                Text("Sending...")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.secondary)
                    .padding(.leading, isCompact ? 12 : 16)
                    .offset(y: -10)
            }
        }
    }

    private func bootstrapMessages() {
        firebaseManager.loadMessageThreads(companyId: companyId)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            consumePendingMessageRoute()
            if selectedThread == nil {
                openTeamChat()
            } else {
                refreshCurrentThread()
            }
        }
    }

    private func openTeamChat() {
        if let existingTeam = visibleMessageThreads.first(where: { $0.type == "team" }) {
            selectThread(existingTeam.id)
            return
        }

        firebaseManager.createMessageThread(companyId: companyId, type: "team") { threadId in
            let id = threadId ?? "team"
            selectThread(id)
        }
    }

    private func startDirectMessage(with member: StudioMessageTeamMember) {
        if let existingThread = existingDirectThread(for: member) {
            selectThread(existingThread.id)
            return
        }

        firebaseManager.createMessageThread(companyId: companyId, type: "direct", memberUid: member.id) { threadId in
            if let threadId { selectThread(threadId) }
        }
    }

    private func existingDirectThread(for member: StudioMessageTeamMember) -> StudioMessageThread? {
        visibleMessageThreads.first { thread in
            guard thread.type == "direct" else { return false }
            if thread.memberUids.contains(member.id) { return true }
            if !member.email.isEmpty && thread.memberEmails.map({ $0.lowercased() }).contains(member.email.lowercased()) { return true }
            return false
        }
    }

    private func selectThread(_ threadId: String) {
        let cleanThreadId = cleanText(threadId)
        guard !cleanThreadId.isEmpty else { return }
        if cleanThreadId != "team",
           let thread = firebaseManager.messageThreads.first(where: { $0.id == cleanThreadId }),
           !canCurrentUserSee(thread: thread) {
            firebaseManager.messageError = "You do not have access to this conversation."
            return
        }
        selectedThreadId = cleanThreadId
        isShowingConversationOnPhone = true
        firebaseManager.markMessageThreadRead(companyId: companyId, threadId: cleanThreadId)
        firebaseManager.loadThreadMessages(companyId: companyId, threadId: cleanThreadId)
    }

    private func refreshCurrentThread() {
        let threadId = selectedThread?.id ?? "team"
        firebaseManager.loadMessageThreads(companyId: companyId)
        firebaseManager.loadThreadMessages(companyId: companyId, threadId: threadId)
        firebaseManager.markMessageThreadRead(companyId: companyId, threadId: threadId)
    }

    private func sendTextMessage() {
        let text = draftText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        let threadId = selectedThread?.id ?? selectedThreadId
        firebaseManager.sendThreadMessage(
            companyId: companyId,
            threadId: threadId,
            text: text,
            userName: authVM.accountDisplayName,
            userPhotoURL: authVM.accountPhotoURL
        ) { success in
            if success { draftText = "" }
        }
    }

    private func handleImportedFile(_ result: Result<[URL], Error>) {
        guard let url = try? result.get().first else {
            firebaseManager.messageError = "File selection failed."
            return
        }
        let shouldStop = url.startAccessingSecurityScopedResource()
        defer {
            if shouldStop { url.stopAccessingSecurityScopedResource() }
        }

        let threadId = selectedThread?.id ?? selectedThreadId
        firebaseManager.uploadMessageFileAndSend(
            companyId: companyId,
            threadId: threadId,
            localURL: url,
            text: draftText,
            userName: authVM.accountDisplayName,
            userPhotoURL: authVM.accountPhotoURL
        ) { success in
            if success { draftText = "" }
        }
    }

    private func consumePendingMessageRoute() {
        let defaults = UserDefaults.standard
        let threadId = (defaults.string(forKey: "pendingMessageThreadId") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !threadId.isEmpty else { return }
        selectedThreadId = threadId
        isShowingConversationOnPhone = true
        defaults.removeObject(forKey: "pendingMessageThreadId")
        defaults.removeObject(forKey: "pendingMessageId")
        firebaseManager.loadMessageThreads(companyId: companyId)
        firebaseManager.loadThreadMessages(companyId: companyId, threadId: threadId)
        firebaseManager.markMessageThreadRead(companyId: companyId, threadId: threadId)
    }
}

struct StudioMessageAvatar: View {
    let urlString: String
    let name: String
    let size: CGFloat

    private var initials: String {
        let parts = name
            .split(separator: " ")
            .map { String($0.prefix(1)).uppercased() }
        let value = parts.prefix(2).joined()
        return value.isEmpty ? "?" : value
    }

    var body: some View {
        ZStack {
            Circle().fill(Color.blue.opacity(0.16))
            if let url = URL(string: urlString), !urlString.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    default:
                        Text(initials)
                            .font(.system(size: max(10, size * 0.34), weight: .bold))
                            .foregroundColor(.blue)
                    }
                }
            } else {
                Text(initials)
                    .font(.system(size: max(10, size * 0.34), weight: .bold))
                    .foregroundColor(.blue)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(Color.primary.opacity(0.08), lineWidth: 1))
    }
}
