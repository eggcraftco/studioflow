import SwiftUI
import Combine
import UniformTypeIdentifiers
#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
import PhotosUI
#endif
import FirebaseFirestore
import FirebaseFunctions

private enum StudioMessageAttachmentFilter: String, CaseIterable, Identifiable {
    case all = "All"
    case media = "Media"
    case files = "Files"

    var id: String { rawValue }
}


private struct StudioMessageWorkspaceSettings {
    var directMessagesEnabled: Bool = true
    var groupConversationsEnabled: Bool = true
    var attachmentsEnabled: Bool = true

    static let defaults = StudioMessageWorkspaceSettings()
}

struct StudioMessagesView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @EnvironmentObject var firebaseManager: FirebaseManager
    @Environment(\.colorScheme) private var colorScheme
    @AppStorage("seciliDil") private var seciliDil: String = "English"

    @State private var selectedThreadId: String = "team"
    @State private var draftText: String = ""
    @State private var isFileImporterPresented: Bool = false
#if os(iOS)
    @State private var isAttachmentOptionsPresented: Bool = false
    @State private var isPhotoPickerPresented: Bool = false
    @State private var selectedPhotoPickerItem: PhotosPickerItem?
#endif
    @State private var hasConsumedPendingRoute: Bool = false
    @State private var isDirectMemberPickerExpanded: Bool = false
    @State private var isNewConversationSheetPresented: Bool = false
    @State private var newConversationMode: String = "direct"
    @State private var selectedNewGroupMemberUids: Set<String> = []
    @State private var newGroupTitleDraft: String = ""
    @State private var isShowingConversationOnPhone: Bool = false
    @State private var previewAttachmentMessage: StudioMessageItem?
    @State private var locallyHiddenMessageIds: Set<String> = []
    @State private var typingClearWorkItem: DispatchWorkItem?
    @State private var lastTypingSentAt: Date = .distantPast
    @State private var isAddPeopleSheetPresented: Bool = false
    @State private var selectedAddPeopleUids: Set<String> = []
    @State private var isGroupInfoSheetPresented: Bool = false
    @State private var groupTitleDraft: String = ""
    @State private var isSearchBarVisible: Bool = false
    @State private var messageSearchText: String = ""
    @State private var attachmentFilter: StudioMessageAttachmentFilter = .all
    @State private var replyingToMessage: StudioMessageItem? = nil
    @State private var uiPinnedMessageIdsByThreadId: [String: Set<String>] = [:]
    @State private var mentionQuery: String = ""
    @State private var isMentionPickerVisible: Bool = false
    @State private var highlightedMessageId: String = ""
    @State private var scrollTargetMessageId: String = ""
    @State private var selectedSearchResultIndex: Int = 0
    @State private var archivedThreadMarkers: [String: TimeInterval] = [:]
    @State private var deletedThreadMarkers: [String: TimeInterval] = [:]
    @State private var isArchivedConversationsExpanded: Bool = false
    @State private var savedMessageIdsByThreadId: [String: Set<String>] = [:]
    @State private var forwardingMessage: StudioMessageItem?
    @State private var isForwardingMessage: Bool = false
    @State private var draftLoadedThreadId: String = ""
    @State private var messagePreferencesListener: ListenerRegistration?
    @State private var messageWorkspaceSettings: StudioMessageWorkspaceSettings = .defaults
    @State private var isMessageWorkspaceSettingsPresented: Bool = false
    @State private var isSavingMessageWorkspaceSettings: Bool = false
    private let activeThreadHeartbeat = Timer.publish(every: 45, on: .main, in: .common).autoconnect()
    @FocusState private var isDraftFieldFocused: Bool
#if os(macOS)
    @State private var isEmojiPickerPresented: Bool = false
#endif

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

    private var currentMessageWorkspaceRole: String {
        let compact = authVM.currentWorkspaceRole
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "_", with: "")
            .replacingOccurrences(of: "-", with: "")
            .replacingOccurrences(of: " ", with: "")
        if compact == "viewer" || compact == "viewonly" || compact == "readonly" { return "viewer" }
        if compact == "workflow" || compact == "workflowonly" { return "workflow" }
        if compact == "owner" || compact == "admin" || compact == "member" { return compact }
        return "member"
    }

    private var canManageMessageConversations: Bool {
        ["owner", "admin", "member"].contains(currentMessageWorkspaceRole)
    }

    private var canStartMessageConversations: Bool {
        canManageMessageConversations || currentMessageWorkspaceRole == "workflow"
    }

    private var canSendMessageAttachments: Bool {
        canStartMessageConversations
    }

    // Posting into the team-wide thread is its own permission. The server
    // enforces it in sendThreadMessage; this keeps the composer honest.
    private var canPostTeamChat: Bool {
        authVM.currentWorkspaceAccess["teamChat"] ?? true
    }

    private var selectedThreadIsTeam: Bool {
        guard let thread = selectedThread else { return false }
        return thread.id == "team" || thread.type == "team"
    }

    private func cleanText(_ value: String) -> String {
        value.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines)
    }

    private var quickReactionEmojis: [String] { ["👍", "❤️", "😂", "✅", "👀", "🙏"] }

    private var mentionableMembersForSelectedThread: [StudioMessageTeamMember] {
        guard let thread = selectedThread else { return [] }
        let memberSet = Set(thread.memberUids.map { cleanText($0) }.filter { !$0.isEmpty })
        return firebaseManager.messageTeamMembers
            .filter { member in
                let uid = cleanText(member.id)
                guard !uid.isEmpty, uid != currentUserId, memberSet.contains(uid) else { return false }
                return true
            }
            .sorted { displayName(for: $0).localizedCaseInsensitiveCompare(displayName(for: $1)) == .orderedAscending }
    }

    private var filteredMentionMembers: [StudioMessageTeamMember] {
        let query = cleanText(mentionQuery).lowercased()
        let members = mentionableMembersForSelectedThread
        guard !query.isEmpty else { return Array(members.prefix(6)) }
        return Array(members.filter { member in
            displayName(for: member).lowercased().contains(query) || member.email.lowercased().contains(query)
        }.prefix(6))
    }

    private var visibleMessageThreads: [StudioMessageThread] {
        firebaseManager.messageThreads.filter { canCurrentUserSee(thread: $0) }
    }

    private var selectedThread: StudioMessageThread? {
        visibleMessageThreads.first(where: { $0.id == selectedThreadId }) ?? visibleMessageThreads.first(where: { $0.id == "team" }) ?? visibleMessageThreads.first
    }

    private var selectedMessages: [StudioMessageItem] {
        let items = firebaseManager.messageItemsByThreadId[selectedThread?.id ?? selectedThreadId] ?? []
        return items.filter { !locallyHiddenMessageIds.contains($0.id) }
    }

    private var displayedMessages: [StudioMessageItem] {
        let search = cleanText(messageSearchText).lowercased()
        return selectedMessages.filter { message in
            switch attachmentFilter {
            case .all:
                break
            case .media:
                if !isImageAttachment(message) { return false }
            case .files:
                if !isFileAttachment(message) { return false }
            }

            guard !search.isEmpty else { return true }
            let searchable = [
                message.text,
                message.fileName,
                message.fileType,
                message.senderName,
                message.senderEmail,
                message.mentionedUids.joined(separator: " ")
            ].joined(separator: " ").lowercased()
            return searchable.contains(search)
        }
    }

    private var isSearchActive: Bool {
        !cleanText(messageSearchText).isEmpty || attachmentFilter != .all
    }

    private var searchResultMessageIds: [String] {
        guard isSearchActive else { return [] }
        return displayedMessages.map { cleanText($0.id) }.filter { !$0.isEmpty }
    }

    private var searchResultSummary: String {
        let count = searchResultMessageIds.count
        if count == 0 { return "No results" }
        let current = min(max(selectedSearchResultIndex, 0), max(count - 1, 0)) + 1
        return "\(current) of \(count)"
    }

    private var effectivePinnedMessageIdsForSelectedThread: [String] {
        let threadId = selectedThread?.id ?? selectedThreadId
        let serverIds = selectedThread?.pinnedMessageIds
            .map { cleanText($0) }
            .filter { !$0.isEmpty } ?? []
        let localIds = Array(uiPinnedMessageIdsByThreadId[threadId] ?? [])
            .map { cleanText($0) }
            .filter { !$0.isEmpty }
        let messagePinnedIds = selectedMessages
            .filter { $0.pinned && !$0.deletedForEveryone }
            .map { cleanText($0.id) }
            .filter { !$0.isEmpty }

        var ordered: [String] = []
        for id in serverIds + localIds + messagePinnedIds {
            if !ordered.contains(id) { ordered.append(id) }
        }
        return ordered
    }

    private var pinnedMessages: [StudioMessageItem] {
        let pinnedIds = effectivePinnedMessageIdsForSelectedThread

        if pinnedIds.isEmpty {
            return selectedMessages
                .filter { $0.pinned && !$0.deletedForEveryone }
                .sorted { lhs, rhs in
                    (lhs.pinnedAt ?? lhs.createdAt) > (rhs.pinnedAt ?? rhs.createdAt)
                }
        }

        let messagesById = Dictionary(uniqueKeysWithValues: selectedMessages.map { (cleanText($0.id), $0) })

        return pinnedIds.compactMap { id in
            guard var message = messagesById[cleanText(id)], !message.deletedForEveryone else { return nil }
            message.pinned = true
            message.pinnedAt = message.pinnedAt ?? message.createdAt
            return message
        }
    }

    private func isMessagePinned(_ message: StudioMessageItem) -> Bool {
        let cleanId = cleanText(message.id)
        guard !cleanId.isEmpty else { return message.pinned }
        return message.pinned || effectivePinnedMessageIdsForSelectedThread.contains(cleanId)
    }

    private func rememberUIPinState(threadId: String, messageId: String, pinned: Bool) {
        let cleanThreadId = cleanText(threadId)
        let cleanMessageId = cleanText(messageId)
        guard !cleanThreadId.isEmpty, !cleanMessageId.isEmpty else { return }

        var ids = uiPinnedMessageIdsByThreadId[cleanThreadId] ?? []
        if pinned {
            ids.insert(cleanMessageId)
        } else {
            ids.remove(cleanMessageId)
        }
        uiPinnedMessageIdsByThreadId[cleanThreadId] = ids
    }

    private var savedMessages: [StudioMessageItem] {
        let threadId = cleanText(selectedThread?.id ?? selectedThreadId)
        guard !threadId.isEmpty else { return [] }
        let savedIds = savedMessageIdsByThreadId[threadId] ?? []
        guard !savedIds.isEmpty else { return [] }
        return selectedMessages
            .filter { savedIds.contains($0.id) && !$0.deletedForEveryone && !locallyHiddenMessageIds.contains($0.id) }
            .sorted { lhs, rhs in
                let lhsIndex = Array(savedIds).firstIndex(of: lhs.id) ?? 0
                let rhsIndex = Array(savedIds).firstIndex(of: rhs.id) ?? 0
                if lhsIndex != rhsIndex { return lhsIndex > rhsIndex }
                return lhs.createdAt > rhs.createdAt
            }
    }

    private func isMessageSaved(_ message: StudioMessageItem) -> Bool {
        let threadId = cleanText(selectedThread?.id ?? selectedThreadId)
        let messageId = cleanText(message.id)
        guard !threadId.isEmpty, !messageId.isEmpty else { return false }
        return savedMessageIdsByThreadId[threadId]?.contains(messageId) == true
    }

    private func toggleSavedMessage(_ message: StudioMessageItem) {
        let threadId = cleanText(selectedThread?.id ?? selectedThreadId)
        let messageId = cleanText(message.id)
        guard !threadId.isEmpty, !messageId.isEmpty else { return }
        var ids = savedMessageIdsByThreadId[threadId] ?? []
        if ids.contains(messageId) {
            ids.remove(messageId)
        } else {
            ids.insert(messageId)
        }
        savedMessageIdsByThreadId[threadId] = ids
        persistMessageUserPreferences()
    }

    private var sharedMediaMessages: [StudioMessageItem] {
        selectedMessages.filter { isImageAttachment($0) }
    }

    private var sharedFileMessages: [StudioMessageItem] {
        selectedMessages.filter { isFileAttachment($0) }
    }

    private var allDirectAndGroupThreads: [StudioMessageThread] {
        var seen = Set<String>()
        return visibleMessageThreads
            .filter { $0.type != "team" }
            .filter { !isThreadDeletedForMe($0) }
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

    private var conversationThreads: [StudioMessageThread] {
        allDirectAndGroupThreads.filter { !isThreadArchived($0) }
    }

    private var archivedConversationThreads: [StudioMessageThread] {
        allDirectAndGroupThreads.filter { isThreadArchived($0) }
    }

    private var unreadConversationCount: Int {
        visibleMessageThreads.filter { $0.isUnread && $0.id != selectedThreadId }.count
    }

    private var selectedTypingUsers: [StudioMessageTypingUser] {
        firebaseManager.messageTypingUsersByThreadId[selectedThread?.id ?? selectedThreadId] ?? []
    }

    private var typingStatusText: String {
        let users = selectedTypingUsers
        guard !users.isEmpty else { return "" }
        if users.count == 1 {
            let user = users[0]
            let name = cleanText(user.name).isEmpty ? cleanText(user.email) : cleanText(user.name)
            return selectedThread?.type == "team" ? "\(name.isEmpty ? "Someone" : name) is typing..." : "typing..."
        }
        return "Several people are typing..."
    }

    var body: some View {
        GeometryReader { geometry in
            messagesRoot(isCompact: geometry.size.width < 700)
                .frame(width: geometry.size.width, height: geometry.size.height)
        }
        .background(Color.primary.opacity(colorScheme == .dark ? 0.025 : 0.015))
        .onAppear {
            loadArchivedThreadMarkers()
            loadDeletedThreadMarkers()
            loadSavedMessageMarkers()
            startMessageUserPreferencesSync()
            loadMessageWorkspaceSettings()
            bootstrapMessages()
        }
        .onReceive(NotificationCenter.default.publisher(for: .studioMessageThreadRouteRequested)) { _ in
            consumePendingMessageRoute()
        }
        .onReceive(activeThreadHeartbeat) { _ in
            refreshActiveThreadPresenceIfNeeded()
        }
        .fileImporter(
            isPresented: $isFileImporterPresented,
            allowedContentTypes: [.item],
            allowsMultipleSelection: false
        ) { result in
            handleImportedFile(result)
        }
#if os(iOS)
        .confirmationDialog(t("Add attachment", lang: seciliDil), isPresented: $isAttachmentOptionsPresented, titleVisibility: .visible) {
            Button("Photo Library") {
                isPhotoPickerPresented = true
            }
            Button("Files") {
                isFileImporterPresented = true
            }
            Button(t("Cancel", lang: seciliDil), role: .cancel) { }
        }
        .photosPicker(isPresented: $isPhotoPickerPresented, selection: $selectedPhotoPickerItem, matching: .images)
        .onChange(of: selectedPhotoPickerItem) { item in
            guard let item else { return }
            Task {
                await handleSelectedPhotoPickerItem(item)
            }
        }
#endif
        .sheet(item: $previewAttachmentMessage) { message in
            attachmentPreviewSheet(message)
        }
        .sheet(isPresented: $isNewConversationSheetPresented) {
            newConversationSheet
        }
        .sheet(item: $forwardingMessage) { message in
            forwardMessageSheet(message)
        }
        .sheet(isPresented: $isAddPeopleSheetPresented) {
            addPeopleSheet
        }
        .sheet(isPresented: $isGroupInfoSheetPresented) {
            groupInfoSheet
        }
        .sheet(isPresented: $isMessageWorkspaceSettingsPresented) {
            messageWorkspaceSettingsSheet
        }
        .onDisappear {
            saveDraftText(draftText, for: selectedThread?.id ?? selectedThreadId)
            clearTypingStatusNow()
            setActiveThreadPresence(isActive: false)
            stopMessageUserPreferencesSync()
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
                if canStartMessageConversations {
                    Button {
                        selectedNewGroupMemberUids.removeAll()
                        newGroupTitleDraft = ""
                        newConversationMode = "direct"
                        isNewConversationSheetPresented = true
                    } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 14, weight: .bold))
                            .frame(width: 30, height: 30)
                            .background(Circle().fill(Color.blue.opacity(0.12)))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("New conversation")
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
                    Text("Conversations")
                        .font(.system(size: isCompact ? 12 : 11, weight: .bold))
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 6)

                    if conversationThreads.isEmpty {
                        Text(archivedConversationThreads.isEmpty ? t("No direct conversations yet.", lang: seciliDil) : t("No active conversations.", lang: seciliDil))
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

                    if !archivedConversationThreads.isEmpty {
                        Divider().padding(.vertical, 6)

                        Button {
                            withAnimation(.easeInOut(duration: 0.18)) {
                                isArchivedConversationsExpanded.toggle()
                            }
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: "archivebox")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundColor(.secondary)
                                Text("Archived")
                                    .font(.system(size: isCompact ? 12 : 11, weight: .bold))
                                    .foregroundColor(.secondary)
                                Text("\(archivedConversationThreads.count)")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(.secondary)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(Capsule().fill(Color.primary.opacity(0.06)))
                                Spacer()
                                Image(systemName: isArchivedConversationsExpanded ? "chevron.up" : "chevron.down")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                            .padding(.horizontal, 6)
                            .padding(.vertical, 4)
                        }
                        .buttonStyle(.plain)

                        if isArchivedConversationsExpanded {
                            ForEach(archivedConversationThreads) { thread in
                                threadRow(thread)
                            }
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



    private func canCurrentUserSee(thread: StudioMessageThread) -> Bool {
        if thread.id == "team" || thread.type == "team" { return true }
        let cleanUid = currentUserId
        let cleanEmail = currentUserEmail
        if !cleanUid.isEmpty && thread.memberUids.contains(cleanUid) { return true }
        if !cleanEmail.isEmpty && thread.memberEmails.map({ cleanText($0).lowercased() }).contains(cleanEmail) { return true }
        return false
    }

    private func displayTitle(for thread: StudioMessageThread) -> String {
        if thread.type == "team" { return t("Team Chat", lang: seciliDil) }
        if isGroupThread(thread) {
            let savedTitle = cleanText(thread.title)
            if !savedTitle.isEmpty && savedTitle != "Group chat" && savedTitle != "Direct message" {
                return savedTitle
            }
            let names = otherMembers(for: thread).map { member in
                let name = cleanText(member.name)
                return name.isEmpty ? cleanText(member.email) : name
            }.filter { !$0.isEmpty }
            if !names.isEmpty { return names.prefix(3).joined(separator: ", ") + (names.count > 3 ? " +\(names.count - 3)" : "") }
            return savedTitle.isEmpty ? "Group chat" : savedTitle
        }

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

    private func isGroupThread(_ thread: StudioMessageThread) -> Bool {
        thread.type == "group" || thread.memberUids.count > 2 || thread.memberEmails.count > 2
    }

    private func threadSubtitle(for thread: StudioMessageThread) -> String {
        if thread.type == "team" { return "Workspace group conversation" }
        return isGroupThread(thread) ? "Group conversation" : "Direct message"
    }

    private func muteUntilDate(for thread: StudioMessageThread) -> Date? {
        let uid = currentUserId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !uid.isEmpty, let date = thread.mutedUntilBy[uid], date > Date() else { return nil }
        return date
    }

    private func isMutedForDisplay(_ thread: StudioMessageThread) -> Bool {
        muteUntilDate(for: thread) != nil
    }

    private func muteStatusText(for thread: StudioMessageThread) -> String {
        guard let date = muteUntilDate(for: thread) else { return "" }
        if date.timeIntervalSinceNow > 3000 * 24 * 60 * 60 {
            return "Muted"
        }
        return "Muted until " + date.formatted(date: .omitted, time: .shortened)
    }

    private func selectedHeaderSubtitleText(for thread: StudioMessageThread) -> String {
        let muteText = muteStatusText(for: thread)
        if !muteText.isEmpty { return muteText }
        return threadSubtitle(for: thread)
    }

    private func setMuteForSelectedThread(_ mode: String) {
        guard let thread = selectedThread else { return }
        firebaseManager.setMessageThreadMute(companyId: companyId, threadId: thread.id, mode: mode) { _ in }
    }

    private func threadAvatarURL(for thread: StudioMessageThread) -> String {
        if thread.type == "team" { return thread.lastMessageByPhotoURL }
        if isGroupThread(thread) { return thread.lastMessageByPhotoURL }
        if let member = otherMember(for: thread) {
            let photoURL = cleanText(member.photoURL)
            if !photoURL.isEmpty { return photoURL }
        }
        return thread.lastMessageByPhotoURL
    }

    private func otherMembers(for thread: StudioMessageThread) -> [StudioMessageTeamMember] {
        let uidMatches = thread.memberUids.filter { cleanText($0) != currentUserId }
        var output: [StudioMessageTeamMember] = []
        for uid in uidMatches {
            if let member = firebaseManager.messageTeamMembers.first(where: { $0.id == uid }) {
                output.append(member)
            }
        }
        for email in thread.memberEmails {
            let cleanEmail = cleanText(email).lowercased()
            guard !cleanEmail.isEmpty, cleanEmail != currentUserEmail else { continue }
            if output.contains(where: { cleanText($0.email).lowercased() == cleanEmail }) { continue }
            if let member = firebaseManager.messageTeamMembers.first(where: { cleanText($0.email).lowercased() == cleanEmail }) {
                output.append(member)
            }
        }
        return output
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

    private var archivedThreadsStorageKey: String {
        let company = cleanText(companyId).isEmpty ? "unknownCompany" : cleanText(companyId)
        let user = cleanText(currentUserId).isEmpty ? "unknownUser" : cleanText(currentUserId)
        return "StudioMessagesArchivedThreads_\(company)_\(user)"
    }

    private var deletedThreadsStorageKey: String {
        let company = cleanText(companyId).isEmpty ? "unknownCompany" : cleanText(companyId)
        let user = cleanText(currentUserId).isEmpty ? "unknownUser" : cleanText(currentUserId)
        return "StudioMessagesDeletedThreads_\(company)_\(user)"
    }

    private var savedMessagesStorageKey: String {
        let company = cleanText(companyId).isEmpty ? "unknownCompany" : cleanText(companyId)
        let user = cleanText(currentUserId).isEmpty ? "unknownUser" : cleanText(currentUserId)
        return "StudioMessagesSavedMessages_\(company)_\(user)"
    }

    private func loadSavedMessageMarkers() {
        guard let data = UserDefaults.standard.data(forKey: savedMessagesStorageKey),
              let decoded = try? JSONDecoder().decode([String: [String]].self, from: data) else {
            savedMessageIdsByThreadId = [:]
            return
        }
        savedMessageIdsByThreadId = decoded.mapValues { Set($0) }
    }

    private func saveSavedMessageMarkers() {
        let encodable = savedMessageIdsByThreadId.mapValues { Array($0) }
        if let data = try? JSONEncoder().encode(encodable) {
            UserDefaults.standard.set(data, forKey: savedMessagesStorageKey)
        }
    }

    private func loadArchivedThreadMarkers() {
        guard let data = UserDefaults.standard.data(forKey: archivedThreadsStorageKey),
              let decoded = try? JSONDecoder().decode([String: TimeInterval].self, from: data) else {
            archivedThreadMarkers = [:]
            return
        }
        archivedThreadMarkers = decoded
    }

    private func saveArchivedThreadMarkers() {
        if let data = try? JSONEncoder().encode(archivedThreadMarkers) {
            UserDefaults.standard.set(data, forKey: archivedThreadsStorageKey)
        }
    }

    private func loadDeletedThreadMarkers() {
        guard let data = UserDefaults.standard.data(forKey: deletedThreadsStorageKey),
              let decoded = try? JSONDecoder().decode([String: TimeInterval].self, from: data) else {
            deletedThreadMarkers = [:]
            return
        }
        deletedThreadMarkers = decoded
    }

    private func saveDeletedThreadMarkers() {
        if let data = try? JSONEncoder().encode(deletedThreadMarkers) {
            UserDefaults.standard.set(data, forKey: deletedThreadsStorageKey)
        }
    }

    private func messageUserPreferencesRef() -> DocumentReference? {
        let company = cleanText(companyId)
        let user = cleanText(currentUserId)
        guard !company.isEmpty, !user.isEmpty else { return nil }
        return Firestore.firestore()
            .collection("companies")
            .document(company)
            .collection("messageUserPreferences")
            .document(user)
    }

    private func startMessageUserPreferencesSync() {
        stopMessageUserPreferencesSync()
        loadMessageUserPreferencesFromCloud()
        guard let ref = messageUserPreferencesRef() else { return }
        messagePreferencesListener = ref.addSnapshotListener { snapshot, error in
            if error != nil {
                loadMessageUserPreferencesFromCloud()
                return
            }
            guard let snapshot else { return }
            guard snapshot.exists, let data = snapshot.data() else {
                persistMessageUserPreferencesToCloud()
                return
            }
            applyMessageUserPreferencesPayload(data)
        }
    }

    private func stopMessageUserPreferencesSync() {
        messagePreferencesListener?.remove()
        messagePreferencesListener = nil
    }

    private func persistMessageUserPreferences() {
        saveArchivedThreadMarkers()
        saveDeletedThreadMarkers()
        saveSavedMessageMarkers()
        persistMessageUserPreferencesToCloud()
    }

    private func applyMessageUserPreferencesPayload(_ data: [String: Any]) {
        if let archived = data["archivedThreads"] as? [String: Any] {
            var decodedArchived: [String: TimeInterval] = [:]
            for (threadId, value) in archived {
                if let number = value as? NSNumber {
                    decodedArchived[threadId] = number.doubleValue
                } else if let doubleValue = value as? Double {
                    decodedArchived[threadId] = doubleValue
                }
            }
            archivedThreadMarkers = decodedArchived
            saveArchivedThreadMarkers()
        }

        if let deleted = data["deletedThreads"] as? [String: Any] {
            var decodedDeleted: [String: TimeInterval] = [:]
            for (threadId, value) in deleted {
                if let number = value as? NSNumber { decodedDeleted[threadId] = number.doubleValue }
                else if let doubleValue = value as? Double { decodedDeleted[threadId] = doubleValue }
            }
            deletedThreadMarkers = decodedDeleted
            saveDeletedThreadMarkers()
        }

        if let saved = data["savedMessages"] as? [String: Any] {
            var decodedSaved: [String: Set<String>] = [:]
            for (threadId, value) in saved {
                if let ids = value as? [String] {
                    decodedSaved[threadId] = Set(ids.map { cleanText($0) }.filter { !$0.isEmpty })
                } else if let ids = value as? [Any] {
                    decodedSaved[threadId] = Set(ids.compactMap { $0 as? String }.map { cleanText($0) }.filter { !$0.isEmpty })
                }
            }
            savedMessageIdsByThreadId = decodedSaved
            saveSavedMessageMarkers()
        }
    }

    private func loadMessageUserPreferencesFromCloud() {
        guard let ref = messageUserPreferencesRef() else { return }
        ref.getDocument { snapshot, _ in
            guard let data = snapshot?.data() else { return }
            DispatchQueue.main.async {
                applyMessageUserPreferencesPayload(data)
            }
        }
    }

    private func persistMessageUserPreferencesToCloud() {
        guard let ref = messageUserPreferencesRef() else { return }
        let company = cleanText(companyId)
        let user = cleanText(currentUserId)
        let saved = savedMessageIdsByThreadId.mapValues { Array($0).sorted() }
        ref.setData([
            "companyId": company,
            "userId": user,
            "archivedThreads": archivedThreadMarkers,
            "deletedThreads": deletedThreadMarkers,
            "savedMessages": saved,
            "updatedAt": FieldValue.serverTimestamp(),
            "updatedByUid": user
        ], merge: true) { error in
            if let error {
                DispatchQueue.main.async {
                    firebaseManager.messageError = error.localizedDescription
                }
            }
        }
    }

    private func isThreadArchived(_ thread: StudioMessageThread) -> Bool {
        let threadId = cleanText(thread.id)
        guard !threadId.isEmpty, let archivedAt = archivedThreadMarkers[threadId] else { return false }
        let lastMessageTime = thread.lastMessageAt.timeIntervalSince1970
        if lastMessageTime > archivedAt + 1 { return false }
        return true
    }

    private func isThreadDeletedForMe(_ thread: StudioMessageThread) -> Bool {
        let threadId = cleanText(thread.id)
        guard !threadId.isEmpty, let deletedAt = deletedThreadMarkers[threadId] else { return false }
        return thread.lastMessageAt.timeIntervalSince1970 <= deletedAt + 1
    }

    private func restoreThreadToMyConversationList(_ threadIdValue: String) {
        let threadId = cleanText(threadIdValue)
        guard !threadId.isEmpty, threadId != "team" else { return }
        let hadArchiveMarker = archivedThreadMarkers.removeValue(forKey: threadId) != nil
        let hadDeletedMarker = deletedThreadMarkers.removeValue(forKey: threadId) != nil
        if hadArchiveMarker || hadDeletedMarker {
            persistMessageUserPreferences()
        }
    }

    private func deleteThreadForMe(_ thread: StudioMessageThread) {
        let threadId = cleanText(thread.id)
        guard !threadId.isEmpty, thread.type != "team" else { return }
        deletedThreadMarkers[threadId] = max(Date().timeIntervalSince1970, thread.lastMessageAt.timeIntervalSince1970)
        archivedThreadMarkers.removeValue(forKey: threadId)
        persistMessageUserPreferences()
        if selectedThreadId == threadId {
            selectThread("team")
            isShowingConversationOnPhone = false
        }
    }

    private func archiveThread(_ thread: StudioMessageThread) {
        let threadId = cleanText(thread.id)
        guard !threadId.isEmpty, thread.type != "team" else { return }
        archivedThreadMarkers[threadId] = max(Date().timeIntervalSince1970, thread.lastMessageAt.timeIntervalSince1970)
        persistMessageUserPreferences()
        if selectedThreadId == threadId {
            selectThread("team")
            isShowingConversationOnPhone = false
        }
    }

    private func unarchiveThread(_ thread: StudioMessageThread) {
        let threadId = cleanText(thread.id)
        guard !threadId.isEmpty else { return }
        archivedThreadMarkers.removeValue(forKey: threadId)
        persistMessageUserPreferences()
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
                        if isMutedForDisplay(thread) {
                            Image(systemName: "bell.slash.fill")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(.orange)
                        }
                        if isUnreadForDisplay(thread) {
                            Circle()
                                .fill(Color.red)
                                .frame(width: 8, height: 8)
                        }
                    }
                    Text(thread.lastMessageText.isEmpty ? t("No messages yet", lang: seciliDil) : thread.lastMessageText)
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
        .contextMenu {
            if thread.type != "team" {
                if isThreadArchived(thread) {
                    Button { unarchiveThread(thread) } label: {
                        Label(t("Unarchive Conversation", lang: seciliDil), systemImage: "archivebox.fill")
                    }
                } else {
                    Button { archiveThread(thread) } label: {
                        Label(t("Archive Conversation", lang: seciliDil), systemImage: "archivebox")
                    }
                }
                Divider()
                Button(role: .destructive) { deleteThreadForMe(thread) } label: {
                    Label("Delete Conversation", systemImage: "trash")
                }
            }
        }
    }

    private func conversationPanel(isCompact: Bool) -> some View {
        VStack(spacing: 0) {
            conversationHeader(isCompact: isCompact)
            if isSearchBarVisible {
                conversationSearchBar(isCompact: isCompact)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
            if !pinnedMessages.isEmpty {
                pinnedMessagesBar(isCompact: isCompact)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
            if !savedMessages.isEmpty {
                savedMessagesBar(isCompact: isCompact)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
            Divider()
            messageScroll(isCompact: isCompact)
            if !selectedTypingUsers.isEmpty {
                visibleTypingIndicatorBar(isCompact: isCompact)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
            if let replyingToMessage {
                replyComposerPreview(replyingToMessage, isCompact: isCompact)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
            Divider()
            if isMentionPickerVisible && !filteredMentionMembers.isEmpty {
                mentionSuggestionsView(isCompact: isCompact)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
            composer(isCompact: isCompact)
        }
        .background(Color.primary.opacity(colorScheme == .dark ? 0.02 : 0.01))
    }

    private func conversationHeader(isCompact: Bool) -> some View {
        HStack(spacing: isCompact ? 10 : 12) {
            if isCompact {
                Button {
                    setActiveThreadPresence(isActive: false)
                    isShowingConversationOnPhone = false
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 17, weight: .bold))
                        .frame(width: 34, height: 34)
                }
                .buttonStyle(.plain)
            }

            HStack(spacing: 10) {
                StudioMessageAvatar(urlString: selectedHeaderAvatarURL, name: selectedHeaderTitle, size: isCompact ? 38 : 42)

                VStack(alignment: .leading, spacing: 2) {
                    Text(selectedHeaderTitle)
                        .font(.system(size: isCompact ? 16 : 18, weight: .bold))
                        .lineLimit(1)
                    let subtitleThread = selectedThread ?? StudioMessageThread()
                    let muteText = muteStatusText(for: subtitleThread)
                    Text(typingStatusText.isEmpty ? selectedHeaderSubtitleText(for: subtitleThread) : typingStatusText)
                        .font(.system(size: 12, weight: typingStatusText.isEmpty ? (muteText.isEmpty ? .regular : .semibold) : .semibold))
                        .foregroundColor(typingStatusText.isEmpty ? (muteText.isEmpty ? .secondary : .orange) : .blue)
                        .lineLimit(1)
                }
            }
            .contentShape(Rectangle())
            .onTapGesture {
                guard canManageSelectedGroup else { return }
                groupTitleDraft = selectedHeaderTitle
                isGroupInfoSheetPresented = true
            }
            .help(canManageSelectedGroup ? "Conversation info" : selectedHeaderTitle)

            Spacer()
            if canAddPeopleToSelectedThread && messageWorkspaceSettings.groupConversationsEnabled {
                Button {
                    selectedAddPeopleUids.removeAll()
                    isAddPeopleSheetPresented = true
                } label: {
                    Image(systemName: "person.badge.plus")
                }
                .buttonStyle(.borderless)
                .help("Add people")
            }

            if let thread = selectedThread {
                Menu {
                    if isMutedForDisplay(thread) {
                        Button {
                            setMuteForSelectedThread("unmute")
                        } label: {
                            Label("Unmute", systemImage: "bell.fill")
                        }
                        Divider()
                    }
                    Button {
                        setMuteForSelectedThread("oneHour")
                    } label: {
                        Label(t("Mute for 1 hour", lang: seciliDil), systemImage: "bell.slash")
                    }
                    Button {
                        setMuteForSelectedThread("today")
                    } label: {
                        Label(t("Mute for today", lang: seciliDil), systemImage: "bell.slash")
                    }
                    Button {
                        setMuteForSelectedThread("forever")
                    } label: {
                        Label(t("Mute until I turn it back on", lang: seciliDil), systemImage: "bell.slash.fill")
                    }
                } label: {
                    Image(systemName: isMutedForDisplay(thread) ? "bell.slash.fill" : "bell")
                        .foregroundColor(isMutedForDisplay(thread) ? .orange : .primary)
                }
                .menuStyle(.borderlessButton)
                .help(isMutedForDisplay(thread) ? "Conversation muted" : "Mute conversation")
            }

            Button {
                withAnimation(.snappy) {
                    isSearchBarVisible.toggle()
                    if !isSearchBarVisible {
                        messageSearchText = ""
                        attachmentFilter = .all
                    }
                }
            } label: {
                Image(systemName: isSearchBarVisible ? "magnifyingglass.circle.fill" : "magnifyingglass")
            }
            .buttonStyle(.borderless)
            .help("Search messages")


        }
        .padding(.horizontal, isCompact ? 10 : 16)
        .padding(.vertical, isCompact ? 10 : 16)
    }


    private func pinnedMessagesBar(isCompact: Bool) -> some View {
        VStack(alignment: .leading, spacing: isCompact ? 7 : 6) {
            HStack(spacing: 7) {
                Image(systemName: "pin.fill")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.orange)
                Text(pinnedMessages.count == 1 ? t("Pinned message", lang: seciliDil) : t("Pinned messages", lang: seciliDil))
                    .font(.system(size: 12, weight: .bold))
                Spacer()
                Text("\(pinnedMessages.count)")
                    .font(.caption2.weight(.bold))
                    .foregroundColor(.secondary)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(pinnedMessages.prefix(5)) { message in
                        pinnedMessageChip(message, isCompact: isCompact)
                    }
                }
                .padding(.vertical, 1)
            }
        }
        .padding(.horizontal, isCompact ? 10 : 16)
        .padding(.vertical, 8)
        .background(Color.orange.opacity(0.08))
    }

    private func pinnedMessageChip(_ message: StudioMessageItem, isCompact: Bool) -> some View {
        Button {
            focusMessage(message.id)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: isImageAttachment(message) ? "photo" : (message.fileURL.isEmpty ? "text.quote" : "doc"))
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.orange)
                VStack(alignment: .leading, spacing: 1) {
                    Text(message.senderName.isEmpty ? message.senderEmail : message.senderName)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                    Text(pinnedPreviewText(message))
                        .font(.system(size: isCompact ? 11 : 12, weight: .semibold))
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, 9)
            .padding(.vertical, 7)
            .background(Capsule().fill(Color.orange.opacity(0.12)))
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button { unpinMessage(message) } label: {
                Label(t("Unpin Message", lang: seciliDil), systemImage: "pin.slash")
            }
        }
    }

    private func pinnedPreviewText(_ message: StudioMessageItem) -> String {
        let text = cleanText(message.text)
        if !text.isEmpty { return text }
        if !message.fileName.isEmpty { return message.fileName }
        if !message.fileURL.isEmpty { return "Attachment" }
        return t("Pinned message", lang: seciliDil)
    }

    private func conversationSearchBar(isCompact: Bool) -> some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.secondary)
                TextField(t("Search messages or files", lang: seciliDil), text: $messageSearchText)
                    .textFieldStyle(.plain)
                    .onChange(of: messageSearchText) { _, _ in
                        selectedSearchResultIndex = 0
                    }
                if !messageSearchText.isEmpty {
                    Button {
                        messageSearchText = ""
                        selectedSearchResultIndex = 0
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.secondary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.primary.opacity(0.06)))

            HStack(spacing: 8) {
                Picker(t("Filter", lang: seciliDil), selection: $attachmentFilter) {
                    ForEach(StudioMessageAttachmentFilter.allCases) { filter in
                        Text(filter.rawValue).tag(filter)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: attachmentFilter) { _, _ in
                    selectedSearchResultIndex = 0
                }

                if isSearchActive {
                    Text(searchResultSummary)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                        .frame(minWidth: isCompact ? 56 : 70, alignment: .trailing)

                    Button { moveToPreviousSearchResult() } label: {
                        Image(systemName: "chevron.up")
                            .font(.system(size: 11, weight: .bold))
                            .frame(width: 24, height: 24)
                    }
                    .buttonStyle(.plain)
                    .disabled(searchResultMessageIds.isEmpty)

                    Button { moveToNextSearchResult() } label: {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 11, weight: .bold))
                            .frame(width: 24, height: 24)
                    }
                    .buttonStyle(.plain)
                    .disabled(searchResultMessageIds.isEmpty)
                }
            }
        }
        .padding(.horizontal, isCompact ? 10 : 16)
        .padding(.bottom, 10)
        .background(Color.primary.opacity(colorScheme == .dark ? 0.02 : 0.01))
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
                LazyVStack(spacing: isCompact ? 12 : 10) {
                    ForEach(displayedMessages) { message in
                        messageBubble(message, isCompact: isCompact)
                            .id(message.id)
                            .background(
                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                    .fill(highlightedMessageId == message.id ? Color.yellow.opacity(0.22) : Color.clear)
                            )
                            .animation(.snappy, value: highlightedMessageId)
                    }

                    if displayedMessages.isEmpty {
                        VStack(spacing: 10) {
                            Image(systemName: "bubble.left.and.bubble.right")
                                .font(.system(size: 38))
                                .foregroundColor(.secondary)
                            Text(searchEmptyTitle)
                                .font(.system(size: 16, weight: .semibold))
                            Text(searchEmptySubtitle)
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                        }
                        .padding(.top, 80)
                    }
                }
                .padding(.horizontal, isCompact ? 10 : 18)
                .padding(.vertical, isCompact ? 12 : 18)
            }
            .contentShape(Rectangle())
            .onTapGesture {
                hideConversationKeyboard()
            }
            .onChange(of: displayedMessages.count) { _, _ in
                if !isSearchActive, let last = displayedMessages.last {
                    withAnimation(.snappy) { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
            .onChange(of: scrollTargetMessageId) { _, newValue in
                let cleanId = cleanText(newValue)
                guard !cleanId.isEmpty else { return }
                withAnimation(.snappy) { proxy.scrollTo(cleanId, anchor: .center) }
                highlightedMessageId = cleanId
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
                    if highlightedMessageId == cleanId { highlightedMessageId = "" }
                }
            }
            .onChange(of: searchResultMessageIds) { _, ids in
                guard isSearchActive, !ids.isEmpty else { return }
                selectedSearchResultIndex = min(max(selectedSearchResultIndex, 0), max(ids.count - 1, 0))
                focusMessage(ids[selectedSearchResultIndex])
            }
        }
    }

    private var searchEmptyTitle: String {
        if !cleanText(messageSearchText).isEmpty || attachmentFilter != .all { return "No matching messages" }
        return t("No messages yet", lang: seciliDil)
    }

    private var searchEmptySubtitle: String {
        if !cleanText(messageSearchText).isEmpty || attachmentFilter != .all { return "Try another search or filter." }
        return "Start the conversation with your workspace team."
    }

    private func typingIndicatorView(isCompact: Bool) -> some View {
        HStack(alignment: .bottom, spacing: 8) {
            let firstUser = selectedTypingUsers.first
            StudioMessageAvatar(
                urlString: firstUser?.photoURL ?? "",
                name: firstUser?.name.isEmpty == false ? firstUser?.name ?? "" : firstUser?.email ?? "",
                size: isCompact ? 28 : 32
            )
            HStack(spacing: 5) {
                ForEach(0..<3, id: \.self) { index in
                    Circle()
                        .fill(Color.secondary.opacity(0.75))
                        .frame(width: 5, height: 5)
                        .opacity(index == 1 ? 0.7 : 1)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.primary.opacity(0.06)))
            Spacer(minLength: isCompact ? 34 : 60)
        }
        .transition(.opacity.combined(with: .move(edge: .bottom)))
    }

    private func visibleTypingIndicatorBar(isCompact: Bool) -> some View {
        VStack(spacing: 0) {
            Divider()
            typingIndicatorView(isCompact: isCompact)
                .padding(.horizontal, isCompact ? 12 : 18)
                .padding(.vertical, 7)
                .background(.regularMaterial)
        }
    }

    private func fileAttachmentView(_ message: StudioMessageItem, isCompact: Bool) -> some View {
        let imageLike = isImageAttachment(message)
        return Button {
            if imageLike {
                previewAttachmentMessage = message
            } else {
                openAttachment(message)
            }
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                if imageLike, let url = URL(string: message.fileURL) {
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
                    .frame(width: isCompact ? 205 : 220, height: isCompact ? 136 : 145)
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
                        Text(imageLike ? t("Tap to preview", lang: seciliDil) : fileMetaText(for: message))
                            .font(.system(size: 10.5))
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }

                    Spacer(minLength: 6)

                    Image(systemName: imageLike ? "arrow.up.left.and.arrow.down.right" : "arrow.down.circle")
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
        if isImageAttachment(message) { return isCompact ? 238 : 252 }
        return isCompact ? 260 : 320
    }

    private struct StudioMessageLinkPreview: Identifiable {
        let id: String
        let url: URL
        let host: String
        let displayURL: String
        let title: String
    }

    private func firstLinkPreview(in text: String) -> StudioMessageLinkPreview? {
        let source = cleanText(text)
        guard !source.isEmpty else { return nil }
        let pattern = #"https?://[^\s<>()]+"#
        guard let range = source.range(of: pattern, options: .regularExpression) else { return nil }

        var urlString = String(source[range])
        urlString = urlString.trimmingCharacters(in: CharacterSet(charactersIn: ".,!?;:)]}"))
        guard let url = URL(string: urlString), let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme) else { return nil }

        let host = cleanText(url.host ?? "")
        let displayHost = host.replacingOccurrences(of: "www.", with: "")
        let title = displayHost.isEmpty ? "Open link" : displayHost
        return StudioMessageLinkPreview(
            id: url.absoluteString,
            url: url,
            host: displayHost.isEmpty ? host : displayHost,
            displayURL: url.absoluteString,
            title: title
        )
    }

    private func linkPreviewView(_ preview: StudioMessageLinkPreview, isCompact: Bool) -> some View {
        Button {
            openExternalURL(preview.url)
        } label: {
            HStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Color.blue.opacity(0.13))
                    Image(systemName: "link")
                        .font(.system(size: isCompact ? 16 : 15, weight: .semibold))
                        .foregroundColor(.blue)
                }
                .frame(width: isCompact ? 38 : 34, height: isCompact ? 38 : 34)

                VStack(alignment: .leading, spacing: 2) {
                    Text(preview.title)
                        .font(.system(size: isCompact ? 13.5 : 12.5, weight: .semibold))
                        .foregroundColor(.primary)
                        .lineLimit(1)
                    Text(preview.displayURL)
                        .font(.system(size: isCompact ? 11.5 : 10.5))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }

                Spacer(minLength: 4)
                Image(systemName: "arrow.up.forward")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 9)
            .padding(.vertical, 8)
            .frame(width: isCompact ? 260 : 320, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.primary.opacity(0.045)))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.primary.opacity(0.06), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private func isImageAttachment(_ message: StudioMessageItem) -> Bool {
        let type = message.fileType.lowercased()
        let name = message.fileName.lowercased()
        if message.type.lowercased() == "image" { return true }
        if type.hasPrefix("image/") { return true }
        return [".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"].contains { name.hasSuffix($0) }
    }

    private func isFileAttachment(_ message: StudioMessageItem) -> Bool {
        let url = cleanText(message.fileURL)
        guard !url.isEmpty else { return false }
        return !isImageAttachment(message)
    }

    private func isAnyAttachment(_ message: StudioMessageItem) -> Bool {
        !cleanText(message.fileURL).isEmpty || isImageAttachment(message) || isFileAttachment(message)
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
        if message.type == "system" {
            return AnyView(systemMessageBubble(message, isCompact: isCompact))
        }
        let isMine = message.senderUid == currentUserId
        return AnyView(HStack(alignment: .bottom, spacing: isCompact ? 7 : 8) {
            if isMine { Spacer(minLength: isCompact ? 26 : 60) }
            if !isMine {
                StudioMessageAvatar(urlString: message.senderPhotoURL, name: message.senderName.isEmpty ? message.senderEmail : message.senderName, size: isCompact ? 30 : 32)
            }
            VStack(alignment: isMine ? .trailing : .leading, spacing: 5) {
                if !isMine {
                    Text(message.senderName.isEmpty ? message.senderEmail : message.senderName)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.secondary)
                }
                VStack(alignment: .leading, spacing: 6) {
                    if message.deletedForEveryone {
                        HStack(spacing: 6) {
                            Image(systemName: "nosign")
                                .font(.system(size: 12, weight: .semibold))
                            Text("This message was deleted")
                                .font(.system(size: isCompact ? 14.5 : 12.5))
                                .italic()
                        }
                        .foregroundColor(.secondary)
                    } else {
                        if !message.replyToMessageId.isEmpty {
                            replySnippetView(message, isCompact: isCompact)
                        }
                        if !message.text.isEmpty {
                            Text(mentionAttributedText(message.text))
                                .font(.system(size: isCompact ? 15.5 : 13.5))
                                .fixedSize(horizontal: false, vertical: true)
                                .textSelection(.enabled)

                            if let linkPreview = firstLinkPreview(in: message.text) {
                                linkPreviewView(linkPreview, isCompact: isCompact)
                            }
                        }
                        if !message.fileURL.isEmpty {
                            fileAttachmentView(message, isCompact: isCompact)
                        }
                    }
                }
                .padding(.horizontal, isCompact ? 12 : 10)
                .padding(.vertical, isCompact ? 10 : 10)
                .fixedSize(horizontal: false, vertical: true)
                .background(RoundedRectangle(cornerRadius: isCompact ? 18 : 16, style: .continuous).fill(message.deletedForEveryone ? Color.primary.opacity(0.035) : (isMine ? Color.blue.opacity(0.18) : Color.primary.opacity(0.06))))
                .frame(maxWidth: isCompact ? 315 : 440, alignment: isMine ? .trailing : .leading)
                .contentShape(RoundedRectangle(cornerRadius: isCompact ? 18 : 16, style: .continuous))
                .contextMenu {
                    messageActionMenu(for: message)
                }

                if !message.deletedForEveryone && !message.reactions.isEmpty {
                    reactionBar(for: message, isMine: isMine)
                }

                Text(message.createdAt, style: .time)
                    .font(.system(size: isCompact ? 10.5 : 9.5))
                    .foregroundColor(.secondary)
            }
            if isMine {
                StudioMessageAvatar(urlString: message.senderPhotoURL, name: message.senderName.isEmpty ? "Me" : message.senderName, size: isCompact ? 26 : 28)
            }
            if !isMine { Spacer(minLength: isCompact ? 26 : 60) }
        }
        .contentShape(Rectangle())
        .contextMenu {
            messageActionMenu(for: message)
        })
    }

    private func systemMessageBubble(_ message: StudioMessageItem, isCompact: Bool) -> some View {
        HStack {
            Spacer(minLength: 12)
            Text(message.text.isEmpty ? t("Conversation updated", lang: seciliDil) : message.text)
                .font(.system(size: isCompact ? 12.5 : 11.5, weight: .semibold))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(Capsule().fill(Color.primary.opacity(0.055)))
            Spacer(minLength: 12)
        }
    }

    @ViewBuilder
    private func messageActionMenu(for message: StudioMessageItem) -> some View {
        if !message.deletedForEveryone {
            Button { startReply(to: message) } label: {
                Label(t("Reply", lang: seciliDil), systemImage: "arrowshape.turn.up.left")
            }

            Button { startForwarding(message) } label: {
                Label(t("Forward Message", lang: seciliDil), systemImage: "arrowshape.turn.up.right")
            }

            Menu {
                ForEach(quickReactionEmojis, id: \.self) { emoji in
                    Button { toggleReaction(emoji, for: message) } label: {
                        Text(reactionMenuTitle(emoji, for: message))
                    }
                }
            } label: {
                Label(t("React", lang: seciliDil), systemImage: "face.smiling")
            }

            if !message.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Button { copyMessageText(message) } label: {
                    Label(t("Copy Message", lang: seciliDil), systemImage: "doc.on.doc")
                }
            }

            if !message.fileURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                if isImageAttachment(message) {
                    Button { previewAttachmentMessage = message } label: {
                        Label(t("Preview Attachment", lang: seciliDil), systemImage: "photo")
                    }
                }
                Button { openAttachment(message) } label: {
                    Label(t("Open Attachment", lang: seciliDil), systemImage: "arrow.up.right.square")
                }
                Button { copyAttachmentLink(message) } label: {
                    Label(t("Copy Attachment Link", lang: seciliDil), systemImage: "link")
                }
            }

            Button { toggleSavedMessage(message) } label: {
                Label(isMessageSaved(message) ? t("Unsave Message", lang: seciliDil) : "Save Message", systemImage: isMessageSaved(message) ? "star.fill" : "star")
            }

            if isMessagePinned(message) {
                Button { unpinMessage(message) } label: {
                    Label(t("Unpin Message", lang: seciliDil), systemImage: "pin.slash")
                }
            } else {
                Button { pinMessage(message) } label: {
                    Label(t("Pin Message", lang: seciliDil), systemImage: "pin")
                }
            }

            if message.senderUid == currentUserId {
                Button(role: .destructive) {
                    deleteMessageForEveryone(message)
                } label: {
                    Label(t("Delete for Everyone", lang: seciliDil), systemImage: "trash.slash")
                }
            }
        }

        Button(role: .destructive) {
            deleteMessageForMe(message)
        } label: {
            Label(t("Delete for Me", lang: seciliDil), systemImage: "trash")
        }
    }


    private func sortedReactionEntries(for message: StudioMessageItem) -> [(emoji: String, users: [String: String])] {
        quickReactionEmojis.compactMap { emoji in
            guard let users = message.reactions[emoji], !users.isEmpty else { return nil }
            return (emoji, users)
        } + message.reactions.keys
            .filter { !quickReactionEmojis.contains($0) }
            .sorted()
            .compactMap { emoji in
                guard let users = message.reactions[emoji], !users.isEmpty else { return nil }
                return (emoji, users)
            }
    }

    private func currentUserReacted(_ emoji: String, to message: StudioMessageItem) -> Bool {
        guard !currentUserId.isEmpty else { return false }
        return message.reactions[emoji]?[currentUserId] != nil
    }

    private func reactionMenuTitle(_ emoji: String, for message: StudioMessageItem) -> String {
        currentUserReacted(emoji, to: message) ? "Remove \(emoji)" : emoji
    }

    private func reactionAccessibilityText(_ users: [String: String]) -> String {
        let names = users.values.map { cleanText($0) }.filter { !$0.isEmpty }
        if names.isEmpty { return "Reaction" }
        if names.count <= 3 { return names.joined(separator: ", ") }
        return names.prefix(3).joined(separator: ", ") + " +\(names.count - 3) more"
    }

    private func reactionBar(for message: StudioMessageItem, isMine: Bool) -> some View {
        HStack(spacing: 5) {
            ForEach(sortedReactionEntries(for: message), id: \.emoji) { entry in
                Button {
                    toggleReaction(entry.emoji, for: message)
                } label: {
                    HStack(spacing: 3) {
                        Text(entry.emoji)
                            .font(.system(size: 13))
                        if entry.users.count > 1 {
                            Text("\(entry.users.count)")
                                .font(.system(size: 11, weight: .bold))
                        }
                    }
                    .padding(.horizontal, mobileReactionHorizontalPadding())
                    .padding(.vertical, 4.5)
                    .background(
                        Capsule().fill(currentUserReacted(entry.emoji, to: message) ? Color.blue.opacity(0.16) : Color.primary.opacity(0.055))
                    )
                    .overlay(
                        Capsule().stroke(currentUserReacted(entry.emoji, to: message) ? Color.blue.opacity(0.35) : Color.primary.opacity(0.07), lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
                .help(reactionAccessibilityText(entry.users))
            }
        }
        .frame(maxWidth: .infinity, alignment: isMine ? .trailing : .leading)
    }

    private func mobileReactionHorizontalPadding() -> CGFloat {
        #if os(iOS)
        return UIDevice.current.userInterfaceIdiom == .phone ? 8 : 7
        #else
        return 7
        #endif
    }

    private func toggleReaction(_ emoji: String, for message: StudioMessageItem) {
        guard let thread = selectedThread else { return }
        firebaseManager.toggleMessageReaction(
            companyId: companyId,
            threadId: thread.id,
            messageId: message.id,
            emoji: emoji,
            userName: authVM.accountDisplayName.isEmpty ? currentUserEmail : authVM.accountDisplayName
        )
    }


    private func replyPreviewText(_ message: StudioMessageItem) -> String {
        if message.deletedForEveryone { return "Original message was deleted" }
        let text = cleanText(message.text)
        if !text.isEmpty { return text }
        if !message.fileName.isEmpty { return message.fileName }
        if !message.fileURL.isEmpty { return "Attachment" }
        return t("Message", lang: seciliDil)
    }

    private func replySenderText(_ message: StudioMessageItem) -> String {
        let name = cleanText(message.senderName)
        if !name.isEmpty { return name }
        let email = cleanText(message.senderEmail)
        return email.isEmpty ? "Someone" : email
    }

    private func replySnippetView(_ message: StudioMessageItem, isCompact: Bool) -> some View {
        let originalName = cleanText(message.replyToSenderName).isEmpty ? "Original message" : cleanText(message.replyToSenderName)
        let preview = cleanText(message.replyToText).isEmpty ? (cleanText(message.replyToFileName).isEmpty ? "Attachment" : cleanText(message.replyToFileName)) : cleanText(message.replyToText)
        return HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 2)
                .fill(Color.blue.opacity(0.65))
                .frame(width: 3)
            VStack(alignment: .leading, spacing: 2) {
                Text(originalName)
                    .font(.system(size: isCompact ? 12 : 10.5, weight: .bold))
                    .foregroundColor(.blue)
                    .lineLimit(1)
                Text(preview)
                    .font(.system(size: isCompact ? 13 : 11.5))
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            let originalId = cleanText(message.replyToMessageId)
            if !originalId.isEmpty { focusMessage(originalId) }
        }
        .padding(isCompact ? 8 : 7)
        .fixedSize(horizontal: false, vertical: true)
        .background(RoundedRectangle(cornerRadius: isCompact ? 12 : 10, style: .continuous).fill(Color.primary.opacity(0.055)))
    }

    private func replyComposerPreview(_ message: StudioMessageItem, isCompact: Bool) -> some View {
        HStack(spacing: 9) {
            RoundedRectangle(cornerRadius: 2)
                .fill(Color.blue.opacity(0.75))
                .frame(width: 3)
            VStack(alignment: .leading, spacing: 2) {
                Text("Replying to \(replySenderText(message))")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.blue)
                    .lineLimit(1)
                Text(replyPreviewText(message))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            Button {
                replyingToMessage = nil
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundColor(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, isCompact ? 12 : 14)
        .padding(.vertical, 8)
        .frame(maxWidth: isCompact ? .infinity : 560, alignment: .leading)
        .frame(minHeight: 44, maxHeight: 58)
        .fixedSize(horizontal: false, vertical: true)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.blue.opacity(0.055))
        )
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, isCompact ? 10 : 14)
        .padding(.top, 6)
        .padding(.bottom, 5)
    }

    private func displayName(for member: StudioMessageTeamMember) -> String {
        let name = cleanText(member.name)
        if !name.isEmpty { return name }
        let email = cleanText(member.email)
        if !email.isEmpty { return email }
        return "Team member"
    }

    private func mentionToken(for member: StudioMessageTeamMember) -> String {
        let raw = displayName(for: member)
        let compact = raw
            .replacingOccurrences(of: "@", with: "")
            .replacingOccurrences(of: "\n", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return compact.isEmpty ? "Team member" : compact
    }

    private func updateMentionPicker(for value: String) {
        guard let atIndex = value.lastIndex(of: "@") else {
            isMentionPickerVisible = false
            mentionQuery = ""
            return
        }
        let afterAt = String(value[value.index(after: atIndex)...])
        if afterAt.contains("\n") || afterAt.contains("  ") || afterAt.count > 40 {
            isMentionPickerVisible = false
            mentionQuery = ""
            return
        }
        if afterAt.contains(where: { [",", ".", ":", ";", "!", "?", "(", ")", "[", "]"].contains($0) }) {
            isMentionPickerVisible = false
            mentionQuery = ""
            return
        }
        mentionQuery = afterAt.trimmingCharacters(in: .whitespacesAndNewlines)
        isMentionPickerVisible = true
    }

    private func insertMention(_ member: StudioMessageTeamMember) {
        guard let atIndex = draftText.lastIndex(of: "@") else { return }
        let replacement = "@\(mentionToken(for: member)) "
        draftText = String(draftText[..<atIndex]) + replacement
        isMentionPickerVisible = false
        mentionQuery = ""
        handleDraftTextChanged(draftText)
    }

    private func mentionedUids(in text: String) -> [String] {
        let lowerText = text.lowercased()
        var ids: [String] = []
        for member in mentionableMembersForSelectedThread {
            let token = "@\(mentionToken(for: member))".lowercased()
            let emailToken = "@\(member.email)".lowercased()
            if lowerText.contains(token) || (!member.email.isEmpty && lowerText.contains(emailToken)) {
                let uid = cleanText(member.id)
                if !uid.isEmpty && !ids.contains(uid) { ids.append(uid) }
            }
        }
        return ids
    }

    private func mentionAttributedText(_ value: String) -> AttributedString {
        var attributed = AttributedString(value)
        var tokens = Set<String>()

        let punctuation = CharacterSet(charactersIn: ".,:;!?()[]{}<>\"'")
        for rawPart in value.split(whereSeparator: { $0.isWhitespace }) {
            let token = String(rawPart).trimmingCharacters(in: punctuation)
            if token.hasPrefix("@"), token.count > 1 {
                tokens.insert(token)
            }
        }

        for member in firebaseManager.messageTeamMembers {
            let memberId = cleanText(member.id)
            guard let thread = selectedThread, thread.memberUids.contains(where: { cleanText($0) == memberId }) else { continue }
            tokens.insert("@\(mentionToken(for: member))")
            let email = cleanText(member.email)
            if !email.isEmpty { tokens.insert("@\(email)") }
        }

        for token in tokens.sorted(by: { $0.count > $1.count }) {
            var searchRange = attributed.startIndex..<attributed.endIndex
            while let range = attributed[searchRange].range(of: token, options: [.caseInsensitive]) {
                attributed[range].foregroundColor = .blue
                attributed[range].font = .system(size: 13.5, weight: .semibold)
                searchRange = range.upperBound..<attributed.endIndex
            }
        }
        return attributed
    }

    private func mentionSuggestionsView(isCompact: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Mention")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.secondary)
            ForEach(filteredMentionMembers) { member in
                Button {
                    insertMention(member)
                } label: {
                    HStack(spacing: 8) {
                        StudioMessageAvatar(urlString: member.photoURL, name: displayName(for: member), size: 26)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(displayName(for: member))
                                .font(.system(size: 12.5, weight: .semibold))
                                .lineLimit(1)
                            if !member.email.isEmpty {
                                Text(member.email)
                                    .font(.system(size: 10.5))
                                    .foregroundColor(.secondary)
                                    .lineLimit(1)
                            }
                        }
                        Spacer()
                        Text("@")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.blue)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(10)
        .frame(maxWidth: isCompact ? .infinity : 420, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.primary.opacity(0.055)))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.primary.opacity(0.07), lineWidth: 1))
        .padding(.horizontal, isCompact ? 10 : 14)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func hideConversationKeyboard() {
        isDraftFieldFocused = false
#if os(iOS)
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
#endif
    }


    private func attachmentPlusLabel(isCompact: Bool) -> some View {
        Image(systemName: firebaseManager.isSendingMessage ? "hourglass" : "plus")
            .font(.system(size: isCompact ? 25 : 24, weight: .light))
            .frame(width: isCompact ? 42 : 44, height: isCompact ? 42 : 40)
            .background(RoundedRectangle(cornerRadius: isCompact ? 21 : 14, style: .continuous).fill(Color.primary.opacity(0.06)))
            .overlay(RoundedRectangle(cornerRadius: isCompact ? 21 : 14, style: .continuous).stroke(Color.primary.opacity(0.08), lineWidth: 1))
    }

    @ViewBuilder
    private func composer(isCompact: Bool) -> some View {
        if selectedThreadIsTeam && !canPostTeamChat {
            Text(t("You can read Team Chat, but posting here is not enabled for your workspace account.", lang: seciliDil))
                .font(.system(size: 12))
                .foregroundColor(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
        } else {
            composerBody(isCompact: isCompact)
        }
    }

    private func composerBody(isCompact: Bool) -> some View {
        HStack(alignment: .bottom, spacing: 10) {
            if canSendMessageAttachments {
#if os(iOS)
                Menu {
                    Button {
                        isPhotoPickerPresented = true
                    } label: {
                        Label("Photo Library", systemImage: "photo")
                    }
                    Button {
                        isFileImporterPresented = true
                    } label: {
                        Label("Files", systemImage: "folder")
                    }
                } label: {
                    attachmentPlusLabel(isCompact: isCompact)
                }
                .menuStyle(.button)
                .buttonStyle(.plain)
                .disabled(firebaseManager.isSendingMessage || !messageWorkspaceSettings.attachmentsEnabled)
                .help(!messageWorkspaceSettings.attachmentsEnabled ? "File sharing is disabled for this workspace" : (firebaseManager.isSendingMessage ? "Uploading" : t("Add attachment", lang: seciliDil)))
#else
                Button {
                    isFileImporterPresented = true
                } label: {
                    attachmentPlusLabel(isCompact: isCompact)
                }
                .buttonStyle(.plain)
                .disabled(firebaseManager.isSendingMessage || !messageWorkspaceSettings.attachmentsEnabled)
                .help(!messageWorkspaceSettings.attachmentsEnabled ? "File sharing is disabled for this workspace" : (firebaseManager.isSendingMessage ? "Uploading" : t("Add attachment", lang: seciliDil)))
#endif
            }

#if os(macOS)
            Button {
                isEmojiPickerPresented.toggle()
            } label: {
                Image(systemName: "face.smiling")
                    .font(.system(size: 17, weight: .bold))
                    .frame(width: 38, height: 36)
                    .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(Color.primary.opacity(0.06)))
            }
            .buttonStyle(.plain)
            .help("Add emoji")
            .popover(isPresented: $isEmojiPickerPresented, arrowEdge: .bottom) {
                macEmojiPicker
            }
#endif

            TextField(t("Message", lang: seciliDil), text: $draftText, axis: .vertical)
                .focused($isDraftFieldFocused)
                .textFieldStyle(.plain)
                .lineLimit(1...5)
                .submitLabel(.send)
                .onSubmit {
                    sendTextMessage()
                }
                .onChange(of: draftText) { _, newValue in
                    handleDraftTextChanged(newValue)
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

#if os(macOS)
    private var macEmojiOptions: [String] {
        [
            "😀", "😄", "😁", "😊", "🙂", "😉", "😍",
            "😂", "🤣", "😅", "😎", "🤩", "🥳", "😇",
            "👍", "👎", "👏", "🙌", "🙏", "🤝", "💪",
            "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤",
            "🔥", "✨", "⭐️", "✅", "☑️", "🎉", "🚀",
            "👀", "💬", "📎", "📷", "📄", "⏰", "📌"
        ]
    }

    private var macEmojiPicker: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Emoji")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.secondary)

            LazyVGrid(columns: Array(repeating: GridItem(.fixed(34), spacing: 6), count: 7), spacing: 6) {
                ForEach(macEmojiOptions, id: \.self) { emoji in
                    Button {
                        draftText += emoji
                        handleDraftTextChanged(draftText)
                        isEmojiPickerPresented = false
                    } label: {
                        Text(emoji)
                            .font(.system(size: 22))
                            .frame(width: 34, height: 34)
                            .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Color.primary.opacity(0.055)))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(12)
        .frame(width: 292)
    }
#endif


    private var canAddPeopleToSelectedThread: Bool {
        guard let thread = selectedThread else { return false }
        return thread.id != "team" && thread.type != "team"
    }

    private var canManageSelectedGroup: Bool {
        guard canManageMessageConversations, let thread = selectedThread else { return false }
        return thread.id != "team" && thread.type != "team" && isGroupThread(thread)
    }

    private var selectedThreadMembers: [StudioMessageTeamMember] {
        guard let thread = selectedThread else { return [] }
        var output: [StudioMessageTeamMember] = []
        for uid in thread.memberUids {
            let cleanUid = cleanText(uid)
            guard !cleanUid.isEmpty else { continue }
            if let member = firebaseManager.messageTeamMembers.first(where: { $0.id == cleanUid }) {
                output.append(member)
            } else {
                output.append(StudioMessageTeamMember(id: cleanUid, email: "", name: cleanUid, photoURL: ""))
            }
        }
        return output
    }

    private var addableTeamMembers: [StudioMessageTeamMember] {
        guard let thread = selectedThread else { return [] }
        let existingUids = Set(thread.memberUids.map { cleanText($0) })
        let existingEmails = Set(thread.memberEmails.map { cleanText($0).lowercased() })
        return firebaseManager.messageTeamMembers.filter { member in
            let uid = cleanText(member.id)
            let email = cleanText(member.email).lowercased()
            if uid.isEmpty || uid == currentUserId { return false }
            if existingUids.contains(uid) { return false }
            if !email.isEmpty && existingEmails.contains(email) { return false }
            return true
        }
    }

    private var newConversationSheet: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Picker("Conversation Type", selection: $newConversationMode) {
                    Text("Direct Message").tag("direct")
                    Text("Private Group").tag("group")
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.top, 8)

                if newConversationMode == "group" {
                    TextField("Group name", text: $newGroupTitleDraft)
                        .textFieldStyle(.roundedBorder)
                        .padding(.horizontal)
                }

                let members = firebaseManager.messageTeamMembers.filter { $0.id != currentUserId }
                if members.isEmpty {
                    Text("Team members will appear here.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                } else {
                    List(members) { member in
                        Button {
                            if newConversationMode == "direct" {
                                startDirectMessage(with: member)
                            } else {
                                if selectedNewGroupMemberUids.contains(member.id) {
                                    selectedNewGroupMemberUids.remove(member.id)
                                } else {
                                    selectedNewGroupMemberUids.insert(member.id)
                                }
                            }
                        } label: {
                            HStack(spacing: 10) {
                                StudioMessageAvatar(urlString: member.photoURL, name: member.name.isEmpty ? member.email : member.name, size: 34)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(member.name.isEmpty ? member.email : member.name)
                                        .font(.system(size: 13, weight: .semibold))
                                    if !member.email.isEmpty {
                                        Text(member.email)
                                            .font(.system(size: 11))
                                            .foregroundColor(.secondary)
                                    }
                                }
                                Spacer()
                                if newConversationMode == "group" {
                                    Image(systemName: selectedNewGroupMemberUids.contains(member.id) ? "checkmark.circle.fill" : "circle")
                                        .foregroundColor(selectedNewGroupMemberUids.contains(member.id) ? .blue : .secondary)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .navigationTitle("New Conversation")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(t("Cancel", lang: seciliDil)) {
                        isNewConversationSheetPresented = false
                    }
                }
                if newConversationMode == "group" {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Create") {
                            createPrivateGroupConversation()
                        }
                        .disabled(selectedNewGroupMemberUids.isEmpty)
                    }
                }
            }
        }
        .frame(minWidth: 360, minHeight: 460)
    }

    private var addPeopleSheet: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text("Add workspace members to this conversation. They will be able to see the previous messages in this conversation.")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .padding(.horizontal)
                    .padding(.top, 8)

                if addableTeamMembers.isEmpty {
                    VStack(spacing: 10) {
                        Image(systemName: "person.2.slash")
                            .font(.system(size: 30, weight: .semibold))
                            .foregroundColor(.secondary)
                        Text("No more team members to add.")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(addableTeamMembers) { member in
                        Button {
                            toggleAddPeopleSelection(member.id)
                        } label: {
                            HStack(spacing: 10) {
                                StudioMessageAvatar(urlString: member.photoURL, name: member.name.isEmpty ? member.email : member.name, size: 34)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(member.name.isEmpty ? member.email : member.name)
                                        .font(.system(size: 13, weight: .semibold))
                                    if !member.email.isEmpty {
                                        Text(member.email)
                                            .font(.system(size: 11))
                                            .foregroundColor(.secondary)
                                    }
                                }
                                Spacer()
                                Image(systemName: selectedAddPeopleUids.contains(member.id) ? "checkmark.circle.fill" : "circle")
                                    .foregroundColor(selectedAddPeopleUids.contains(member.id) ? .blue : .secondary)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .navigationTitle(t("Add People", lang: seciliDil))
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(t("Cancel", lang: seciliDil)) { isAddPeopleSheetPresented = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(t("Add", lang: seciliDil)) { addSelectedPeopleToCurrentThread() }
                        .disabled(selectedAddPeopleUids.isEmpty)
                }
            }
        }
        .frame(minWidth: 360, minHeight: 420)
    }



    private var pinnedMessagesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Pinned Messages")
                    .font(.system(size: 13, weight: .bold))
                Spacer()
                Text("\(pinnedMessages.count)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            if pinnedMessages.isEmpty {
                Text("No pinned messages yet.")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 6)
            } else {
                VStack(spacing: 7) {
                    ForEach(pinnedMessages.prefix(6)) { message in
                        HStack(spacing: 8) {
                            Image(systemName: "pin.fill")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.orange)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(pinnedPreviewText(message))
                                    .font(.system(size: 12, weight: .semibold))
                                    .lineLimit(1)
                                Text(message.senderName.isEmpty ? message.senderEmail : message.senderName)
                                    .font(.system(size: 10))
                                    .foregroundColor(.secondary)
                                    .lineLimit(1)
                            }
                            Spacer()
                            Button { unpinMessage(message) } label: {
                                Image(systemName: "pin.slash")
                            }
                            .buttonStyle(.borderless)
                        }
                        .padding(8)
                        .background(RoundedRectangle(cornerRadius: 10).fill(Color.orange.opacity(0.08)))
                    }
                }
            }
        }
        .padding(.horizontal)
    }

    private var sharedMediaAndFilesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Shared Files & Media")
                    .font(.system(size: 13, weight: .bold))
                Spacer()
                Text("\(sharedMediaMessages.count) media • \(sharedFileMessages.count) files")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            if sharedMediaMessages.isEmpty && sharedFileMessages.isEmpty {
                Text("No shared attachments yet.")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 6)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Array(sharedMediaMessages.prefix(8))) { message in
                            sharedAttachmentChip(message)
                        }
                        ForEach(Array(sharedFileMessages.prefix(8))) { message in
                            sharedAttachmentChip(message)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
        .padding(.horizontal)
    }

    private func sharedAttachmentChip(_ message: StudioMessageItem) -> some View {
        Button {
            if isImageAttachment(message) {
                previewAttachmentMessage = message
            } else {
                openAttachment(message)
            }
        } label: {
            HStack(spacing: 7) {
                Image(systemName: fileIconName(for: message))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.blue)
                Text(message.fileName.isEmpty ? "Attachment" : message.fileName)
                    .font(.system(size: 11, weight: .semibold))
                    .lineLimit(1)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .frame(maxWidth: 190, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.primary.opacity(0.06)))
        }
        .buttonStyle(.plain)
    }

    private func savedMessagesBar(isCompact: Bool) -> some View {
        VStack(alignment: .leading, spacing: isCompact ? 7 : 6) {
            HStack(spacing: 7) {
                Image(systemName: "star.fill")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.yellow)
                Text(savedMessages.count == 1 ? t("Saved message", lang: seciliDil) : t("Saved messages", lang: seciliDil))
                    .font(.system(size: 12, weight: .bold))
                Spacer()
                Text("\(savedMessages.count)")
                    .font(.caption2.weight(.bold))
                    .foregroundColor(.secondary)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(savedMessages.prefix(5)) { message in
                        savedMessageChip(message, isCompact: isCompact)
                    }
                }
                .padding(.vertical, 1)
            }
        }
        .padding(.horizontal, isCompact ? 10 : 16)
        .padding(.vertical, 8)
        .background(Color.yellow.opacity(0.08))
    }

    private func savedMessageChip(_ message: StudioMessageItem, isCompact: Bool) -> some View {
        Button {
            focusMessage(message.id)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: isImageAttachment(message) ? "photo" : (message.fileURL.isEmpty ? "text.quote" : "doc"))
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.yellow)
                VStack(alignment: .leading, spacing: 1) {
                    Text(message.senderName.isEmpty ? message.senderEmail : message.senderName)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                    Text(pinnedPreviewText(message))
                        .font(.system(size: isCompact ? 11 : 12, weight: .semibold))
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, 9)
            .padding(.vertical, 7)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.primary.opacity(0.055)))
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button { toggleSavedMessage(message) } label: {
                Label(t("Unsave Message", lang: seciliDil), systemImage: "star.slash")
            }
        }
    }

    private var savedMessagesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Saved Messages")
                    .font(.system(size: 13, weight: .bold))
                Spacer()
                Text("\(savedMessages.count)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            if savedMessages.isEmpty {
                Text("No saved messages yet. Use Save Message from any message menu.")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 6)
            } else {
                VStack(spacing: 7) {
                    ForEach(savedMessages.prefix(8)) { message in
                        HStack(spacing: 8) {
                            Image(systemName: "star.fill")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.yellow)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(pinnedPreviewText(message))
                                    .font(.system(size: 12, weight: .semibold))
                                    .lineLimit(1)
                                Text(message.senderName.isEmpty ? message.senderEmail : message.senderName)
                                    .font(.system(size: 10))
                                    .foregroundColor(.secondary)
                                    .lineLimit(1)
                            }
                            Spacer()
                            Button { toggleSavedMessage(message) } label: {
                                Image(systemName: "star.slash")
                            }
                            .buttonStyle(.borderless)
                        }
                        .padding(8)
                        .background(RoundedRectangle(cornerRadius: 10).fill(Color.yellow.opacity(0.08)))
                        .contentShape(Rectangle())
                        .onTapGesture { focusMessage(message.id) }
                    }
                }
            }
        }
        .padding(.horizontal)
    }

    private var groupInfoSheet: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                if let thread = selectedThread {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Group name")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.secondary)
                        HStack(spacing: 8) {
                            TextField(t("Group name", lang: seciliDil), text: $groupTitleDraft)
                                .textFieldStyle(.roundedBorder)
                            Button(t("Save", lang: seciliDil)) { renameSelectedGroup() }
                                .disabled(cleanText(groupTitleDraft).isEmpty || cleanText(groupTitleDraft) == displayTitle(for: thread))
                        }
                    }
                    .padding(.horizontal)
                    .padding(.top, 8)

                    Divider()

                    sharedMediaAndFilesSection

                    Divider()

                    savedMessagesSection

                    Divider()

                    HStack {
                        Text("Members")
                            .font(.system(size: 13, weight: .bold))
                        Spacer()
                        Text("\(selectedThreadMembers.count)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal)

                    List(selectedThreadMembers) { member in
                        HStack(spacing: 10) {
                            StudioMessageAvatar(urlString: member.photoURL, name: member.name.isEmpty ? member.email : member.name, size: 34)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(member.name.isEmpty ? (member.email.isEmpty ? member.id : member.email) : member.name)
                                    .font(.system(size: 13, weight: .semibold))
                                if !member.email.isEmpty {
                                    Text(member.email)
                                        .font(.system(size: 11))
                                        .foregroundColor(.secondary)
                                }
                            }
                            Spacer()
                            if member.id == currentUserId {
                                Text("You")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            } else {
                                Button(t("Remove", lang: seciliDil)) { removeMemberFromSelectedGroup(member) }
                                    .font(.caption)
                                    .foregroundColor(.red)
                            }
                        }
                        .contentShape(Rectangle())
                    }

                    Button(role: .destructive) {
                        leaveSelectedGroup()
                    } label: {
                        Label(t("Leave Group", lang: seciliDil), systemImage: "rectangle.portrait.and.arrow.right")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .padding(.horizontal)
                    .padding(.bottom, 10)
                }
            }
            .navigationTitle(t("Group Info", lang: seciliDil))
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { isGroupInfoSheetPresented = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        selectedAddPeopleUids.removeAll()
                        isGroupInfoSheetPresented = false
                        isAddPeopleSheetPresented = true
                    } label: {
                        Label(t("Add People", lang: seciliDil), systemImage: "person.badge.plus")
                    }
                }
            }
        }
        .frame(minWidth: 380, minHeight: 500)
    }

    private func toggleAddPeopleSelection(_ uid: String) {
        let cleanUid = cleanText(uid)
        guard !cleanUid.isEmpty else { return }
        if selectedAddPeopleUids.contains(cleanUid) {
            selectedAddPeopleUids.remove(cleanUid)
        } else {
            selectedAddPeopleUids.insert(cleanUid)
        }
    }

    private func addSelectedPeopleToCurrentThread() {
        guard let thread = selectedThread else { return }
        let uids = Array(selectedAddPeopleUids)
        firebaseManager.addMembersToMessageThread(companyId: companyId, threadId: thread.id, memberUids: uids) { success in
            if success {
                selectedAddPeopleUids.removeAll()
                isAddPeopleSheetPresented = false
                refreshCurrentThread()
            }
        }
    }


    private func renameSelectedGroup() {
        guard let thread = selectedThread else { return }
        let title = cleanText(groupTitleDraft)
        guard !title.isEmpty else { return }
        firebaseManager.renameMessageThread(companyId: companyId, threadId: thread.id, title: title) { success in
            if success { refreshCurrentThread() }
        }
    }

    private func leaveSelectedGroup() {
        guard let thread = selectedThread else { return }
        firebaseManager.leaveMessageThread(companyId: companyId, threadId: thread.id) { success in
            if success {
                isGroupInfoSheetPresented = false
                selectedThreadId = "team"
                isShowingConversationOnPhone = false
                openTeamChat()
            }
        }
    }

    private func removeMemberFromSelectedGroup(_ member: StudioMessageTeamMember) {
        guard let thread = selectedThread else { return }
        firebaseManager.removeMemberFromMessageThread(companyId: companyId, threadId: thread.id, memberUid: member.id) { success in
            if success { refreshCurrentThread() }
        }
    }

    private var previewGalleryMessages: [StudioMessageItem] {
        _ = cleanText(selectedThreadId)
        return selectedMessages
            .filter { isImageAttachment($0) && !cleanText($0.fileURL).isEmpty }
            .sorted(by: { (lhs: StudioMessageItem, rhs: StudioMessageItem) in
                lhs.createdAt < rhs.createdAt
            })
    }

    private func previewGalleryIndex(for message: StudioMessageItem) -> Int? {
        previewGalleryMessages.firstIndex { $0.id == message.id }
    }

    private func canMovePreview(from message: StudioMessageItem, offset: Int) -> Bool {
        guard let index = previewGalleryIndex(for: message) else { return false }
        let nextIndex = index + offset
        return nextIndex >= 0 && nextIndex < previewGalleryMessages.count
    }

    private func movePreview(from message: StudioMessageItem, offset: Int) {
        guard let index = previewGalleryIndex(for: message) else { return }
        let nextIndex = index + offset
        guard nextIndex >= 0 && nextIndex < previewGalleryMessages.count else { return }
        previewAttachmentMessage = previewGalleryMessages[nextIndex]
    }

    private func attachmentPreviewSheet(_ message: StudioMessageItem) -> some View {
        let imageLike = isImageAttachment(message)
        let galleryCount = previewGalleryMessages.count
        let currentIndex = previewGalleryIndex(for: message)

        return VStack(spacing: 0) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(message.fileName.isEmpty ? "Attachment" : message.fileName)
                        .font(.headline)
                        .lineLimit(1)
                    HStack(spacing: 8) {
                        Text(fileMetaText(for: message))
                        if imageLike, let currentIndex, galleryCount > 1 {
                            Text("•")
                            Text("\(currentIndex + 1) of \(galleryCount)")
                        }
                    }
                    .font(.caption)
                    .foregroundColor(.secondary)
                }

                Spacer()

                if imageLike, galleryCount > 1 {
                    HStack(spacing: 6) {
                        Button {
                            movePreview(from: message, offset: -1)
                        } label: {
                            Image(systemName: "chevron.left")
                        }
                        .disabled(!canMovePreview(from: message, offset: -1))

                        Button {
                            movePreview(from: message, offset: 1)
                        } label: {
                            Image(systemName: "chevron.right")
                        }
                        .disabled(!canMovePreview(from: message, offset: 1))
                    }
                    .buttonStyle(.bordered)
                }

                Button(t("Open", lang: seciliDil)) { openAttachment(message) }
                    .buttonStyle(.borderedProminent)

                Button {
                    previewAttachmentMessage = nil
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .semibold))
                }
                .buttonStyle(.bordered)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .background(.regularMaterial)

            Divider()

            if let url = URL(string: message.fileURL), imageLike {
                ZStack {
                    Color.black.opacity(colorScheme == .dark ? 0.35 : 0.08)
                        .ignoresSafeArea()

                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .scaledToFit()
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                                .padding(12)
                        case .failure:
                            VStack(spacing: 10) {
                                Image(systemName: "exclamationmark.triangle")
                                    .font(.system(size: 34, weight: .semibold))
                                Text("Preview could not be loaded.")
                                    .font(.subheadline)
                            }
                            .foregroundColor(.secondary)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                        case .empty:
                            ProgressView("Loading preview...")
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                        @unknown default:
                            EmptyView()
                        }
                    }
                }
            } else {
                VStack(spacing: 12) {
                    Image(systemName: fileIconName(for: message))
                        .font(.system(size: 48, weight: .semibold))
                        .foregroundColor(.blue)
                    Text(message.fileName.isEmpty ? "Attachment" : message.fileName)
                        .font(.headline)
                        .multilineTextAlignment(.center)
                    Text(fileMetaText(for: message))
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Button(t("Open Attachment", lang: seciliDil)) { openAttachment(message) }
                        .buttonStyle(.borderedProminent)
                }
                .padding(24)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .frame(minWidth: 340, minHeight: 420)
    }

    private func openAttachment(_ message: StudioMessageItem) {
        guard let url = URL(string: message.fileURL) else { return }
        openExternalURL(url)
    }

    private func openExternalURL(_ url: URL) {
        #if os(macOS)
        NSWorkspace.shared.open(url)
        #elseif os(iOS)
        UIApplication.shared.open(url)
        #endif
    }

    private func copyMessageText(_ message: StudioMessageItem) {
        copyToPasteboard(message.text)
    }

    private func copyAttachmentLink(_ message: StudioMessageItem) {
        copyToPasteboard(message.fileURL)
    }


    private func focusMessage(_ messageId: String) {
        let cleanId = cleanText(messageId)
        guard !cleanId.isEmpty else { return }
        if scrollTargetMessageId == cleanId {
            scrollTargetMessageId = ""
            DispatchQueue.main.async { scrollTargetMessageId = cleanId }
        } else {
            scrollTargetMessageId = cleanId
        }
    }

    private func moveToPreviousSearchResult() {
        let ids = searchResultMessageIds
        guard !ids.isEmpty else { return }
        let nextIndex = selectedSearchResultIndex <= 0 ? ids.count - 1 : selectedSearchResultIndex - 1
        selectedSearchResultIndex = nextIndex
        focusMessage(ids[nextIndex])
    }

    private func moveToNextSearchResult() {
        let ids = searchResultMessageIds
        guard !ids.isEmpty else { return }
        let nextIndex = selectedSearchResultIndex >= ids.count - 1 ? 0 : selectedSearchResultIndex + 1
        selectedSearchResultIndex = nextIndex
        focusMessage(ids[nextIndex])
    }

    private var forwardTargetThreads: [StudioMessageThread] {
        var seen = Set<String>()
        return visibleMessageThreads
            .filter { canCurrentUserSee(thread: $0) }
            .filter { thread in
                let id = cleanText(thread.id)
                guard !id.isEmpty, !seen.contains(id) else { return false }
                seen.insert(id)
                return true
            }
            .sorted { lhs, rhs in
                if lhs.type == "team" && rhs.type != "team" { return true }
                if rhs.type == "team" && lhs.type != "team" { return false }
                if lhs.lastMessageAt != rhs.lastMessageAt { return lhs.lastMessageAt > rhs.lastMessageAt }
                return displayTitle(for: lhs).localizedCaseInsensitiveCompare(displayTitle(for: rhs)) == .orderedAscending
            }
    }

    private func startForwarding(_ message: StudioMessageItem) {
        guard !message.deletedForEveryone else { return }
        forwardingMessage = message
    }

    private func forwardMessagePreviewText(_ message: StudioMessageItem) -> String {
        let text = cleanText(message.text)
        if !text.isEmpty { return text }
        let fileName = cleanText(message.fileName)
        if !fileName.isEmpty { return fileName }
        if isImageAttachment(message) { return "Image message" }
        if isFileAttachment(message) { return "File message" }
        return t("Message", lang: seciliDil)
    }

    private func forwardedTextPayload(for message: StudioMessageItem) -> String {
        let text = cleanText(message.text)
        if !text.isEmpty { return "↪ Forwarded\n\(text)" }
        let fileName = cleanText(message.fileName)
        if !fileName.isEmpty { return "↪ Forwarded" }
        return "↪ Forwarded message"
    }

    @ViewBuilder
    private func forwardMessageSheet(_ message: StudioMessageItem) -> some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Forward message")
                        .font(.headline)
                    Text(forwardMessagePreviewText(message))
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .lineLimit(3)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: 12).fill(Color.primary.opacity(0.055)))
                }
                .padding(.horizontal)
                .padding(.top)

                if forwardTargetThreads.isEmpty {
                    Spacer()
                    Text("No conversations available")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity)
                    Spacer()
                } else {
                    List(forwardTargetThreads) { thread in
                        Button {
                            forwardMessage(message, to: thread)
                        } label: {
                            HStack(spacing: 10) {
                                StudioMessageAvatar(urlString: threadAvatarURL(for: thread), name: displayTitle(for: thread), size: 34)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(displayTitle(for: thread))
                                        .font(.system(size: 14, weight: .semibold))
                                    Text(thread.type == "team" ? t("Team Chat", lang: seciliDil) : (isGroupThread(thread) ? "Group conversation" : "Direct message"))
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                                Spacer()
                                if isForwardingMessage {
                                    ProgressView()
                                        .controlSize(.small)
                                } else {
                                    Image(systemName: "paperplane")
                                        .foregroundColor(.secondary)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(isForwardingMessage)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle(t("Forward", lang: seciliDil))
#if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
#endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(t("Cancel", lang: seciliDil)) {
                        forwardingMessage = nil
                    }
                }
            }
        }
        .frame(minWidth: 360, minHeight: 420)
    }

    private func forwardMessage(_ message: StudioMessageItem, to thread: StudioMessageThread) {
        let targetThreadId = cleanText(thread.id)
        guard !companyId.isEmpty, !targetThreadId.isEmpty else { return }
        isForwardingMessage = true

        var payload: [String: Any] = [
            "companyId": companyId,
            "threadId": targetThreadId,
            "text": forwardedTextPayload(for: message),
            "userName": authVM.accountDisplayName,
            "userPhotoURL": authVM.accountPhotoURL
        ]

        let fileURL = cleanText(message.fileURL)
        if !fileURL.isEmpty {
            payload["fileURL"] = fileURL
            payload["fileName"] = cleanText(message.fileName)
            payload["fileType"] = cleanText(message.fileType)
            payload["fileSize"] = message.fileSize
        }

        Functions.functions(region: "europe-west2").httpsCallable("sendThreadMessage").call(payload) { _, error in
            DispatchQueue.main.async {
                isForwardingMessage = false
                if let error {
                    firebaseManager.messageError = error.localizedDescription
                    return
                }
                forwardingMessage = nil
            }
        }
    }

    private func startReply(to message: StudioMessageItem) {
        guard !message.deletedForEveryone else { return }
        replyingToMessage = message
    }

    private func pinMessage(_ message: StudioMessageItem) {
        guard let thread = selectedThread else { return }
        rememberUIPinState(threadId: thread.id, messageId: message.id, pinned: true)
        firebaseManager.pinMessageInThread(companyId: companyId, threadId: thread.id, messageId: message.id) { success in
            if !success {
                rememberUIPinState(threadId: thread.id, messageId: message.id, pinned: false)
            }
        }
    }

    private func unpinMessage(_ message: StudioMessageItem) {
        guard let thread = selectedThread else { return }
        rememberUIPinState(threadId: thread.id, messageId: message.id, pinned: false)
        firebaseManager.unpinMessageInThread(companyId: companyId, threadId: thread.id, messageId: message.id) { success in
            if !success {
                rememberUIPinState(threadId: thread.id, messageId: message.id, pinned: true)
            }
        }
    }

    private func deleteMessageForMe(_ message: StudioMessageItem) {
        locallyHiddenMessageIds.insert(message.id)
        firebaseManager.deleteMessageForMe(companyId: companyId, threadId: message.threadId.isEmpty ? selectedThreadId : message.threadId, messageId: message.id) { success in
            if !success { locallyHiddenMessageIds.remove(message.id) }
        }
    }

    private func deleteMessageForEveryone(_ message: StudioMessageItem) {
        firebaseManager.deleteMessageForEveryone(companyId: companyId, threadId: message.threadId.isEmpty ? selectedThreadId : message.threadId, messageId: message.id) { _ in }
    }

    private func copyToPasteboard(_ value: String) {
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(value, forType: .string)
        #elseif os(iOS)
        UIPasteboard.general.string = value
        #endif
    }

    private func messageDraftKey(for threadId: String) -> String {
        let workspace = cleanText(companyId).isEmpty ? "workspace" : cleanText(companyId)
        let user = cleanText(currentUserId).isEmpty ? "user" : cleanText(currentUserId)
        let thread = cleanText(threadId).isEmpty ? "team" : cleanText(threadId)
        return "studioMessageDraft.\(workspace).\(user).\(thread)"
    }

    private func savedDraftText(for threadId: String) -> String {
        UserDefaults.standard.string(forKey: messageDraftKey(for: threadId)) ?? ""
    }

    private func saveDraftText(_ value: String, for threadId: String) {
        let cleanThreadId = cleanText(threadId)
        guard !cleanThreadId.isEmpty else { return }

        let key = messageDraftKey(for: cleanThreadId)
        let trimmedForStorage = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmedForStorage.isEmpty {
            UserDefaults.standard.removeObject(forKey: key)
        } else {
            UserDefaults.standard.set(value, forKey: key)
        }
    }

    private func clearDraftText(for threadId: String) {
        let cleanThreadId = cleanText(threadId)
        guard !cleanThreadId.isEmpty else { return }
        UserDefaults.standard.removeObject(forKey: messageDraftKey(for: cleanThreadId))
    }

    private func loadDraftText(for threadId: String) {
        let cleanThreadId = cleanText(threadId)
        guard !cleanThreadId.isEmpty else { return }
        let storedDraft = savedDraftText(for: cleanThreadId)
        if draftText != storedDraft {
            draftText = storedDraft
        }
        draftLoadedThreadId = cleanThreadId
    }

    private func loadMessageWorkspaceSettings() {
        guard !companyId.isEmpty else { return }
        let payload: [String: Any] = ["companyId": companyId]
        Functions.functions(region: "europe-west2").httpsCallable("getMessageWorkspaceSettings").call(payload) { result, error in
            DispatchQueue.main.async {
                if let error {
                    firebaseManager.messageError = error.localizedDescription
                    return
                }
                guard let data = result?.data as? [String: Any] else { return }
                let settingsData = data["settings"] as? [String: Any] ?? data
                messageWorkspaceSettings = StudioMessageWorkspaceSettings(
                    directMessagesEnabled: settingsData["directMessagesEnabled"] as? Bool ?? true,
                    groupConversationsEnabled: settingsData["groupConversationsEnabled"] as? Bool ?? true,
                    attachmentsEnabled: settingsData["attachmentsEnabled"] as? Bool ?? true
                )
            }
        }
    }

    private func saveMessageWorkspaceSettings() {
        guard !companyId.isEmpty else { return }
        isSavingMessageWorkspaceSettings = true
        let payload: [String: Any] = [
            "companyId": companyId,
            "directMessagesEnabled": messageWorkspaceSettings.directMessagesEnabled,
            "groupConversationsEnabled": messageWorkspaceSettings.groupConversationsEnabled,
            "attachmentsEnabled": messageWorkspaceSettings.attachmentsEnabled
        ]
        Functions.functions(region: "europe-west2").httpsCallable("setMessageWorkspaceSettings").call(payload) { _, error in
            DispatchQueue.main.async {
                isSavingMessageWorkspaceSettings = false
                if let error {
                    firebaseManager.messageError = error.localizedDescription
                    return
                }
                isMessageWorkspaceSettingsPresented = false
            }
        }
    }

    private var messageWorkspaceSettingsSheet: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle(t("Allow Direct Messages", lang: seciliDil), isOn: Binding(
                        get: { messageWorkspaceSettings.directMessagesEnabled },
                        set: { messageWorkspaceSettings.directMessagesEnabled = $0 }
                    ))
                    Toggle(t("Allow Group Conversations", lang: seciliDil), isOn: Binding(
                        get: { messageWorkspaceSettings.groupConversationsEnabled },
                        set: { messageWorkspaceSettings.groupConversationsEnabled = $0 }
                    ))
                    Toggle(t("Allow File & Image Sending", lang: seciliDil), isOn: Binding(
                        get: { messageWorkspaceSettings.attachmentsEnabled },
                        set: { messageWorkspaceSettings.attachmentsEnabled = $0 }
                    ))
                } header: {
                    Text("Workspace Messages")
                } footer: {
                    Text("These settings apply to the workspace. Saving is restricted by the backend to the workspace owner or admins.")
                }
            }
            .navigationTitle(t("Message Settings", lang: seciliDil))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(t("Cancel", lang: seciliDil)) {
                        isMessageWorkspaceSettingsPresented = false
                        loadMessageWorkspaceSettings()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSavingMessageWorkspaceSettings ? t("Saving...", lang: seciliDil) : t("Save", lang: seciliDil)) {
                        saveMessageWorkspaceSettings()
                    }
                    .disabled(isSavingMessageWorkspaceSettings)
                }
            }
        }
        .frame(minWidth: 360, minHeight: 320)
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
        guard canStartMessageConversations else {
            firebaseManager.messageError = "View Only members can reply in existing conversations but cannot start new conversations."
            return
        }
        guard messageWorkspaceSettings.directMessagesEnabled else {
            firebaseManager.messageError = t("Direct messages are disabled for this workspace.", lang: seciliDil)
            return
        }
        if let existingThread = existingDirectThread(for: member) {
            restoreThreadToMyConversationList(existingThread.id)
            selectThread(existingThread.id)
            isNewConversationSheetPresented = false
            return
        }

        firebaseManager.createMessageThread(companyId: companyId, type: "direct", memberUid: member.id) { threadId in
            guard let threadId else { return }
            restoreThreadToMyConversationList(threadId)
            firebaseManager.loadMessageThreads(companyId: companyId)
            selectThread(threadId)
            isNewConversationSheetPresented = false

            // A newly created Firestore thread can reach the listener just after
            // the callable returns. Refresh once more so the sidebar title appears
            // even on the first Mac open.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                firebaseManager.loadMessageThreads(companyId: companyId)
                selectThread(threadId)
            }
        }
    }

    private func createPrivateGroupConversation() {
        guard canStartMessageConversations else { return }
        guard messageWorkspaceSettings.groupConversationsEnabled else {
            firebaseManager.messageError = t("Group conversations are disabled for this workspace.", lang: seciliDil)
            return
        }
        let memberUids = Array(selectedNewGroupMemberUids)
        guard !memberUids.isEmpty else { return }
        firebaseManager.createMessageThread(
            companyId: companyId,
            type: "group",
            memberUids: memberUids,
            title: cleanText(newGroupTitleDraft)
        ) { threadId in
            if let threadId {
                restoreThreadToMyConversationList(threadId)
                firebaseManager.loadMessageThreads(companyId: companyId)
                selectThread(threadId)
                isNewConversationSheetPresented = false
                selectedNewGroupMemberUids.removeAll()
                newGroupTitleDraft = ""
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                    firebaseManager.loadMessageThreads(companyId: companyId)
                    selectThread(threadId)
                }
            }
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
        let previousThreadId = selectedThread?.id ?? selectedThreadId
        if cleanText(previousThreadId) != cleanThreadId {
            setActiveThreadPresence(threadId: previousThreadId, isActive: false)
        }
        if cleanThreadId != "team",
           let thread = firebaseManager.messageThreads.first(where: { $0.id == cleanThreadId }),
           !canCurrentUserSee(thread: thread) {
            firebaseManager.messageError = "You do not have access to this conversation."
            return
        }
        clearTypingStatusNow()
        saveDraftText(draftText, for: previousThreadId)
        replyingToMessage = nil
        selectedThreadId = cleanThreadId
        loadDraftText(for: cleanThreadId)
        isShowingConversationOnPhone = true
        firebaseManager.markMessageThreadRead(companyId: companyId, threadId: cleanThreadId)
        firebaseManager.startMessageTypingRealtime(companyId: companyId, threadId: cleanThreadId)
        firebaseManager.loadThreadMessages(companyId: companyId, threadId: cleanThreadId)
        setActiveThreadPresence(threadId: cleanThreadId, isActive: true)
    }

    private func refreshActiveThreadPresenceIfNeeded() {
        let threadId = selectedThread?.id ?? selectedThreadId
        guard !cleanText(threadId).isEmpty else { return }
        #if os(iOS)
        guard isShowingConversationOnPhone else { return }
        #endif
        setActiveThreadPresence(threadId: threadId, isActive: true)
    }

    private func setActiveThreadPresence(threadId explicitThreadId: String? = nil, isActive: Bool) {
        let threadId = cleanText(explicitThreadId ?? selectedThread?.id ?? selectedThreadId)
        guard !companyId.isEmpty, !threadId.isEmpty else { return }
        firebaseManager.setMessageThreadActive(companyId: companyId, threadId: threadId, isActive: isActive)
    }

    private func refreshCurrentThread() {
        let threadId = selectedThread?.id ?? "team"
        firebaseManager.loadMessageThreads(companyId: companyId)
        firebaseManager.startMessageTypingRealtime(companyId: companyId, threadId: threadId)
        firebaseManager.loadThreadMessages(companyId: companyId, threadId: threadId)
        firebaseManager.markMessageThreadRead(companyId: companyId, threadId: threadId)
        setActiveThreadPresence(threadId: threadId, isActive: true)
    }

    private func sendTextMessage() {
        let text = draftText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        if selectedThreadIsTeam && !canPostTeamChat { return }
        let threadId = selectedThread?.id ?? selectedThreadId
        setActiveThreadPresence(threadId: threadId, isActive: true)
        clearTypingStatusNow(threadId: threadId)
        firebaseManager.sendThreadMessage(
            companyId: companyId,
            threadId: threadId,
            text: text,
            userName: authVM.accountDisplayName,
            userPhotoURL: authVM.accountPhotoURL,
            replyTo: replyingToMessage,
            mentionedUids: mentionedUids(in: text)
        ) { success in
            if success {
                clearDraftText(for: threadId)
                draftText = ""
                replyingToMessage = nil
                isMentionPickerVisible = false
                mentionQuery = ""
            }
        }
    }

    private func handleImportedFile(_ result: Result<[URL], Error>) {
        guard canSendMessageAttachments else {
            firebaseManager.messageError = "View Only members can send text messages but cannot upload message attachments."
            return
        }
        guard messageWorkspaceSettings.attachmentsEnabled else {
            firebaseManager.messageError = "File sharing is disabled for this workspace."
            return
        }
        guard let url = try? result.get().first else {
            firebaseManager.messageError = "File selection failed."
            return
        }
        let shouldStop = url.startAccessingSecurityScopedResource()
        defer {
            if shouldStop { url.stopAccessingSecurityScopedResource() }
        }

        let threadId = selectedThread?.id ?? selectedThreadId
        setActiveThreadPresence(threadId: threadId, isActive: true)
        firebaseManager.uploadMessageFileAndSend(
            companyId: companyId,
            threadId: threadId,
            localURL: url,
            text: draftText,
            userName: authVM.accountDisplayName,
            userPhotoURL: authVM.accountPhotoURL,
            replyTo: replyingToMessage,
            mentionedUids: mentionedUids(in: draftText)
        ) { success in
            if success {
                clearDraftText(for: threadId)
                draftText = ""
                replyingToMessage = nil
                isMentionPickerVisible = false
                mentionQuery = ""
            }
        }
    }

#if os(iOS)
    @MainActor
    private func handleSelectedPhotoPickerItem(_ item: PhotosPickerItem) async {
        defer { selectedPhotoPickerItem = nil }
        guard canSendMessageAttachments else {
            firebaseManager.messageError = "View Only members can send text messages but cannot upload message attachments."
            return
        }
        guard messageWorkspaceSettings.attachmentsEnabled else {
            firebaseManager.messageError = "File sharing is disabled for this workspace."
            return
        }

        do {
            guard let data = try await item.loadTransferable(type: Data.self) else {
                firebaseManager.messageError = "Image selection failed."
                return
            }

            let preferredType = item.supportedContentTypes.first(where: { $0.conforms(to: .image) })
            let fileExtension = preferredType?.preferredFilenameExtension ?? "jpg"
            let tempURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("message-image-\(UUID().uuidString)")
                .appendingPathExtension(fileExtension)

            try data.write(to: tempURL, options: [.atomic])

            let threadId = selectedThread?.id ?? selectedThreadId
            setActiveThreadPresence(threadId: threadId, isActive: true)
            firebaseManager.uploadMessageFileAndSend(
                companyId: companyId,
                threadId: threadId,
                localURL: tempURL,
                text: draftText,
                userName: authVM.accountDisplayName,
                userPhotoURL: authVM.accountPhotoURL,
                replyTo: replyingToMessage,
                mentionedUids: mentionedUids(in: draftText)
            ) { success in
                if success {
                    clearDraftText(for: threadId)
                    draftText = ""
                    replyingToMessage = nil
                    isMentionPickerVisible = false
                    mentionQuery = ""
                }
            }
        } catch {
            firebaseManager.messageError = "Image selection failed."
        }
    }

#endif

    private func handleDraftTextChanged(_ value: String) {
        updateMentionPicker(for: value)
        let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
        let threadId = selectedThread?.id ?? selectedThreadId
        guard !companyId.isEmpty, !threadId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        saveDraftText(value, for: threadId)
        draftLoadedThreadId = threadId

        typingClearWorkItem?.cancel()

        if text.isEmpty {
            clearTypingStatusNow(threadId: threadId)
            return
        }

        let now = Date()
        if now.timeIntervalSince(lastTypingSentAt) > 2.0 {
            lastTypingSentAt = now
            firebaseManager.setMessageTypingStatus(
                companyId: companyId,
                threadId: threadId,
                isTyping: true,
                userName: authVM.accountDisplayName,
                userPhotoURL: authVM.accountPhotoURL
            )
        }

        let workItem = DispatchWorkItem { [companyId, threadId] in
            firebaseManager.setMessageTypingStatus(companyId: companyId, threadId: threadId, isTyping: false)
        }
        typingClearWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.5, execute: workItem)
    }

    private func clearTypingStatusNow(threadId explicitThreadId: String? = nil) {
        typingClearWorkItem?.cancel()
        typingClearWorkItem = nil
        lastTypingSentAt = .distantPast
        let threadId = explicitThreadId ?? selectedThread?.id ?? selectedThreadId
        guard !companyId.isEmpty, !threadId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        firebaseManager.setMessageTypingStatus(companyId: companyId, threadId: threadId, isTyping: false)
    }

    private func consumePendingMessageRoute() {
        let defaults = UserDefaults.standard
        let threadId = (defaults.string(forKey: "pendingMessageThreadId") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !threadId.isEmpty else { return }
        saveDraftText(draftText, for: selectedThreadId)
        selectedThreadId = threadId
        loadDraftText(for: threadId)
        isShowingConversationOnPhone = true
        defaults.removeObject(forKey: "pendingMessageThreadId")
        defaults.removeObject(forKey: "pendingMessageId")
        firebaseManager.loadMessageThreads(companyId: companyId)
        firebaseManager.loadThreadMessages(companyId: companyId, threadId: threadId)
        firebaseManager.markMessageThreadRead(companyId: companyId, threadId: threadId)
        setActiveThreadPresence(threadId: threadId, isActive: true)
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
