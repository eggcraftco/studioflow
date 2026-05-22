package uk.co.eggcraft.studioflow.features.messages

import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.automirrored.filled.Forward
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Unarchive
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ClipboardManager
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uk.co.eggcraft.studioflow.data.model.StudioMessageItem
import uk.co.eggcraft.studioflow.data.model.StudioMessageTeamMember
import uk.co.eggcraft.studioflow.data.model.StudioMessageThread
import uk.co.eggcraft.studioflow.data.model.StudioMessageTypingUser
import uk.co.eggcraft.studioflow.features.shell.StudioFlowUiState
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val QuickReactions = listOf("👍", "❤️", "😂", "✅", "👀", "🙏")

@Composable
fun MessagesScreen(
    state: StudioFlowUiState,
    onSelectThread: (String) -> Unit,
    onMarkThreadRead: (String) -> Unit,
    onSendMessage: (String, List<String>) -> Unit,
    onSendMessageWithAttachment: (ByteArray, String, String, String, List<String>) -> Unit,
    onEditMessage: (String, String) -> Unit,
    onDeleteMessageForMe: (String) -> Unit,
    onDeleteMessageForEveryone: (String) -> Unit,
    onToggleReaction: (String, String) -> Unit,
    onTogglePin: (String, Boolean) -> Unit,
    onSetReplyingToMessage: (StudioMessageItem?) -> Unit,
    onComposerTextChanged: () -> Unit,
    onSetMessageSearchQuery: (String) -> Unit,
    onSetMessageAttachmentFilter: (String) -> Unit,
    onToggleThreadArchive: (String) -> Unit,
    onToggleSavedMessage: (String, String) -> Unit,
    onSetForwardingMessage: (StudioMessageItem?) -> Unit,
    onForwardMessageToThread: (String) -> Unit,
    onCreateDirectMessageThread: (String) -> Unit,
    onCreateGroupMessageThread: (List<String>, String) -> Unit,
    onAddMembersToThread: (String, List<String>) -> Unit,
    onRenameThread: (String, String) -> Unit,
    onLeaveThread: (String) -> Unit,
    onSetThreadMute: (String, String) -> Unit,
    onLoadDraft: (String, String) -> String,
    onSaveDraft: (String, String, String) -> Unit
) {
    val workspaceId = state.workspace?.id.orEmpty()
    val currentUid = state.user?.uid.orEmpty()
    val threads = state.messageThreads
    val selectedId = state.selectedMessageThreadId
    val selectedThread = threads.firstOrNull { it.id == selectedId } ?: threads.firstOrNull()
    val allItems = selectedThread?.let { state.messageItemsByThreadId[it.id].orEmpty() } ?: emptyList()
    val typingUsers = selectedThread?.let { state.typingUsersByThreadId[it.id].orEmpty() } ?: emptyList()
    val savedIds = selectedThread?.let { state.savedMessageIdsByThreadId[it.id].orEmpty() } ?: emptySet()
    val archivedMarkers = state.archivedThreadMarkers

    // Apply search + attachment filter + saved-only filter
    var showSavedOnly by remember(selectedThread?.id) { mutableStateOf(false) }
    val searchQuery = state.messageSearchQuery.trim().lowercase()
    val filter = state.messageAttachmentFilter
    val displayedItems = allItems.filter { item ->
        if (showSavedOnly && !savedIds.contains(item.id)) return@filter false
        when (filter) {
            "media" -> if (!item.isImageAttachment) return@filter false
            "files" -> if (!item.isFileAttachment) return@filter false
        }
        if (searchQuery.isEmpty()) true
        else listOf(item.text, item.fileName, item.fileType, item.senderName, item.senderEmail)
            .any { it.lowercase().contains(searchQuery) }
    }

    var editingMessage by remember { mutableStateOf<StudioMessageItem?>(null) }
    var scrollToMessageId by remember { mutableStateOf("") }
    var newConversationOpen by remember { mutableStateOf(false) }
    var threadInfoOpen by remember { mutableStateOf(false) }
    var addMembersOpen by remember { mutableStateOf(false) }
    var renameOpen by remember { mutableStateOf(false) }
    var searchVisible by remember(selectedThread?.id) { mutableStateOf(false) }
    var mutePickerOpen by remember { mutableStateOf(false) }

    Row(modifier = Modifier.fillMaxSize()) {
        Box(modifier = Modifier.width(320.dp).fillMaxSize()) {
            ThreadListPanel(
                threads = threads,
                archivedMarkers = archivedMarkers,
                selectedId = selectedThread?.id.orEmpty(),
                currentUid = currentUid,
                teamMembers = state.messageTeamMembers,
                unreadCount = state.messageUnreadCount,
                onSelectThread = onSelectThread,
                onToggleArchive = onToggleThreadArchive
            )
            FloatingActionButton(
                onClick = { newConversationOpen = true },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(16.dp)
            ) {
                Icon(Icons.Filled.Add, contentDescription = "New conversation")
            }
        }
        Box(
            modifier = Modifier
                .width(1.dp)
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.outlineVariant)
        )
        ConversationPanel(
            thread = selectedThread,
            allItems = allItems,
            displayedItems = displayedItems,
            savedIds = savedIds,
            currentUid = currentUid,
            teamMembers = state.messageTeamMembers,
            typingUsers = typingUsers,
            errorMessage = state.messageError,
            replyingTo = state.replyingToMessage,
            isSending = state.isSendingMessage,
            scrollToMessageId = scrollToMessageId,
            searchVisible = searchVisible,
            searchQuery = state.messageSearchQuery,
            attachmentFilter = state.messageAttachmentFilter,
            showSavedOnly = showSavedOnly,
            mutePickerOpen = mutePickerOpen,
            onScrollHandled = { scrollToMessageId = "" },
            onSendMessage = onSendMessage,
            onSendMessageWithAttachment = onSendMessageWithAttachment,
            onClearReply = { onSetReplyingToMessage(null) },
            onReply = { onSetReplyingToMessage(it) },
            onEdit = { editingMessage = it },
            onDeleteForMe = { onDeleteMessageForMe(it.id) },
            onDeleteForEveryone = { onDeleteMessageForEveryone(it.id) },
            onToggleReaction = onToggleReaction,
            onTogglePin = onTogglePin,
            onJumpToMessage = { scrollToMessageId = it },
            onToggleSaved = { msg ->
                selectedThread?.id?.let { tid -> onToggleSavedMessage(tid, msg.id) }
            },
            onForward = { onSetForwardingMessage(it) },
            onToggleSearchVisible = { searchVisible = !searchVisible; if (!searchVisible) onSetMessageSearchQuery("") },
            onSearchQueryChange = onSetMessageSearchQuery,
            onAttachmentFilterChange = onSetMessageAttachmentFilter,
            onToggleSavedFilter = { showSavedOnly = !showSavedOnly },
            onOpenInfo = { threadInfoOpen = true },
            onComposerTextChanged = onComposerTextChanged,
            onOpenMutePicker = { mutePickerOpen = true },
            onDismissMutePicker = { mutePickerOpen = false },
            onSetMute = { mode ->
                selectedThread?.id?.let { tid -> onSetThreadMute(tid, mode) }
                mutePickerOpen = false
            },
            workspaceId = workspaceId,
            onLoadDraft = onLoadDraft,
            onSaveDraft = onSaveDraft,
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp)
        )
    }

    editingMessage?.let { msg ->
        EditMessageDialog(
            initialText = msg.text,
            onDismiss = { editingMessage = null },
            onConfirm = { newText -> onEditMessage(msg.id, newText); editingMessage = null }
        )
    }

    if (newConversationOpen) {
        NewConversationDialog(
            teamMembers = state.messageTeamMembers.filter { it.id != currentUid },
            onDismiss = { newConversationOpen = false },
            onCreateDirect = { uid -> onCreateDirectMessageThread(uid); newConversationOpen = false },
            onCreateGroup = { uids, title -> onCreateGroupMessageThread(uids, title); newConversationOpen = false }
        )
    }

    if (threadInfoOpen && selectedThread != null) {
        ThreadInfoDialog(
            thread = selectedThread,
            currentUid = currentUid,
            teamMembers = state.messageTeamMembers,
            onDismiss = { threadInfoOpen = false },
            onRename = { renameOpen = true; threadInfoOpen = false },
            onAddMembers = { addMembersOpen = true; threadInfoOpen = false },
            onLeave = { onLeaveThread(selectedThread.id); threadInfoOpen = false }
        )
    }

    if (renameOpen && selectedThread != null) {
        RenameThreadDialog(
            initialTitle = selectedThread.title,
            onDismiss = { renameOpen = false },
            onConfirm = { onRenameThread(selectedThread.id, it); renameOpen = false }
        )
    }

    if (addMembersOpen && selectedThread != null) {
        AddMembersDialog(
            availableMembers = state.messageTeamMembers.filter {
                it.id != currentUid && !selectedThread.memberUids.contains(it.id)
            },
            onDismiss = { addMembersOpen = false },
            onConfirm = { onAddMembersToThread(selectedThread.id, it); addMembersOpen = false }
        )
    }

    state.forwardingMessage?.let { _ ->
        ForwardMessageDialog(
            threads = threads.filter { it.id != selectedThread?.id },
            currentUid = currentUid,
            teamMembers = state.messageTeamMembers,
            onDismiss = { onSetForwardingMessage(null) },
            onForward = { onForwardMessageToThread(it) }
        )
    }
}

@Composable
private fun ThreadListPanel(
    threads: List<StudioMessageThread>,
    archivedMarkers: Map<String, Long>,
    selectedId: String,
    currentUid: String,
    teamMembers: List<StudioMessageTeamMember>,
    unreadCount: Int,
    onSelectThread: (String) -> Unit,
    onToggleArchive: (String) -> Unit
) {
    val active = threads.filter { thread ->
        val marker = archivedMarkers[thread.id] ?: return@filter true
        val lastTs = thread.lastMessageAt?.time ?: 0L
        lastTs > marker // unarchive if new message arrived
    }
    val archived = threads.filter { thread -> thread !in active }
    var archivedExpanded by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("Messages", fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
            if (unreadCount > 0) Badge { Text(unreadCount.toString()) }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        if (active.isEmpty() && archived.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                Text("No conversations yet.", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
            }
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                items(active, key = { it.id }) { thread ->
                    ThreadRow(
                        thread = thread,
                        selected = thread.id == selectedId,
                        archived = false,
                        currentUid = currentUid,
                        teamMembers = teamMembers,
                        onClick = { onSelectThread(thread.id) },
                        onToggleArchive = { onToggleArchive(thread.id) }
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
                }
                if (archived.isNotEmpty()) {
                    item("__archived_header") {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { archivedExpanded = !archivedExpanded }
                                .padding(horizontal = 14.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Filled.Archive,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                "Archived (${archived.size})",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(Modifier.weight(1f))
                            Text(
                                if (archivedExpanded) "Hide" else "Show",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
                    }
                    if (archivedExpanded) {
                        items(archived, key = { "arch_${it.id}" }) { thread ->
                            ThreadRow(
                                thread = thread,
                                selected = thread.id == selectedId,
                                archived = true,
                                currentUid = currentUid,
                                teamMembers = teamMembers,
                                onClick = { onSelectThread(thread.id) },
                                onToggleArchive = { onToggleArchive(thread.id) }
                            )
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ThreadRow(
    thread: StudioMessageThread,
    selected: Boolean,
    archived: Boolean,
    currentUid: String,
    teamMembers: List<StudioMessageTeamMember>,
    onClick: () -> Unit,
    onToggleArchive: () -> Unit
) {
    var menuOpen by remember { mutableStateOf(false) }
    val background = if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.08f) else Color.Transparent
    Box {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(background)
                .combinedClickable(onClick = onClick, onLongClick = { menuOpen = true })
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ThreadAvatar(thread, currentUid, teamMembers)
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        thread.displayTitle(currentUid, teamMembers),
                        fontWeight = if (thread.isUnread) FontWeight.ExtraBold else FontWeight.SemiBold,
                        fontSize = 15.sp,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.weight(1f)
                    )
                    if (thread.isMutedFor(currentUid)) {
                        Icon(
                            Icons.Filled.NotificationsOff,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(12.dp)
                        )
                        Spacer(Modifier.width(4.dp))
                    }
                    thread.lastMessageAt?.let {
                        Text(relativeTime(it), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                Spacer(Modifier.height(2.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        threadPreview(thread),
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        fontWeight = if (thread.isUnread) FontWeight.Bold else FontWeight.Normal,
                        modifier = Modifier.weight(1f)
                    )
                    if (thread.isUnread && !thread.isMutedFor(currentUid)) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.primary)
                        )
                    }
                }
            }
        }
        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            DropdownMenuItem(
                text = { Text(if (archived) "Unarchive" else "Archive") },
                onClick = { menuOpen = false; onToggleArchive() }
            )
        }
    }
}

@Composable
private fun ThreadAvatar(
    thread: StudioMessageThread,
    currentUid: String,
    teamMembers: List<StudioMessageTeamMember>
) {
    val initials = when {
        thread.isTeamThread -> "T"
        thread.isDirectThread -> {
            val otherUid = thread.memberUids.firstOrNull { it != currentUid && it.isNotBlank() }
            val member = teamMembers.firstOrNull { it.id == otherUid }
            (member?.label ?: thread.displayTitle(currentUid, teamMembers)).take(1).uppercase()
        }
        else -> thread.displayTitle(currentUid, teamMembers).take(1).uppercase()
    }
    Box(
        modifier = Modifier
            .size(40.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)),
        contentAlignment = Alignment.Center
    ) {
        Text(initials, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
    }
}

@Composable
private fun ConversationPanel(
    thread: StudioMessageThread?,
    allItems: List<StudioMessageItem>,
    displayedItems: List<StudioMessageItem>,
    savedIds: Set<String>,
    currentUid: String,
    teamMembers: List<StudioMessageTeamMember>,
    typingUsers: List<StudioMessageTypingUser>,
    errorMessage: String,
    replyingTo: StudioMessageItem?,
    isSending: Boolean,
    scrollToMessageId: String,
    searchVisible: Boolean,
    searchQuery: String,
    attachmentFilter: String,
    showSavedOnly: Boolean,
    mutePickerOpen: Boolean,
    onScrollHandled: () -> Unit,
    onSendMessage: (String, List<String>) -> Unit,
    onSendMessageWithAttachment: (ByteArray, String, String, String, List<String>) -> Unit,
    onClearReply: () -> Unit,
    onReply: (StudioMessageItem) -> Unit,
    onEdit: (StudioMessageItem) -> Unit,
    onDeleteForMe: (StudioMessageItem) -> Unit,
    onDeleteForEveryone: (StudioMessageItem) -> Unit,
    onToggleReaction: (String, String) -> Unit,
    onTogglePin: (String, Boolean) -> Unit,
    onJumpToMessage: (String) -> Unit,
    onToggleSaved: (StudioMessageItem) -> Unit,
    onForward: (StudioMessageItem) -> Unit,
    onToggleSearchVisible: () -> Unit,
    onSearchQueryChange: (String) -> Unit,
    onAttachmentFilterChange: (String) -> Unit,
    onToggleSavedFilter: () -> Unit,
    onOpenInfo: () -> Unit,
    onComposerTextChanged: () -> Unit,
    onOpenMutePicker: () -> Unit,
    onDismissMutePicker: () -> Unit,
    onSetMute: (String) -> Unit,
    workspaceId: String,
    onLoadDraft: (String, String) -> String,
    onSaveDraft: (String, String, String) -> Unit,
    modifier: Modifier = Modifier
) {
    if (thread == null) {
        Box(modifier = modifier, contentAlignment = Alignment.Center) {
            Text("Select a conversation to view messages.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        return
    }
    val listState = rememberLazyListState()
    LaunchedEffect(thread.id, displayedItems.size) {
        if (displayedItems.isNotEmpty() && scrollToMessageId.isBlank() && searchQuery.isBlank()) {
            listState.animateScrollToItem(displayedItems.lastIndex)
        }
    }
    LaunchedEffect(scrollToMessageId) {
        if (scrollToMessageId.isNotBlank()) {
            val idx = displayedItems.indexOfFirst { it.id == scrollToMessageId }
            if (idx >= 0) listState.animateScrollToItem(idx)
            onScrollHandled()
        }
    }

    val pinnedItems = allItems.filter { it.pinned && !it.isDeleted }

    Column(modifier = modifier) {
        ConversationHeader(
            thread = thread,
            currentUid = currentUid,
            teamMembers = teamMembers,
            showSavedOnly = showSavedOnly,
            onToggleSearchVisible = onToggleSearchVisible,
            onToggleSavedFilter = onToggleSavedFilter,
            onOpenInfo = onOpenInfo,
            onOpenMutePicker = onOpenMutePicker,
            mutePickerOpen = mutePickerOpen,
            onDismissMutePicker = onDismissMutePicker,
            onSetMute = onSetMute
        )
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        if (searchVisible) {
            SearchBar(
                query = searchQuery,
                filter = attachmentFilter,
                onQueryChange = onSearchQueryChange,
                onFilterChange = onAttachmentFilterChange
            )
        }
        if (pinnedItems.isNotEmpty()) {
            PinnedBar(pinnedItems = pinnedItems, onJump = onJumpToMessage)
        }
        if (errorMessage.isNotBlank()) {
            Text(errorMessage, color = MaterialTheme.colorScheme.error, fontSize = 12.sp, modifier = Modifier.padding(vertical = 8.dp))
        }
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            if (displayedItems.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        when {
                            showSavedOnly -> "No saved messages."
                            searchQuery.isNotBlank() || attachmentFilter != "all" -> "No results."
                            else -> "No messages yet."
                        },
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(displayedItems, key = { it.id }) { item ->
                        MessageBubble(
                            item = item,
                            isMine = item.senderUid == currentUid,
                            currentUid = currentUid,
                            saved = savedIds.contains(item.id),
                            onReply = { onReply(item) },
                            onEdit = { onEdit(item) },
                            onDeleteForMe = { onDeleteForMe(item) },
                            onDeleteForEveryone = { onDeleteForEveryone(item) },
                            onToggleReaction = { emoji -> onToggleReaction(item.id, emoji) },
                            onTogglePin = { onTogglePin(item.id, item.pinned) },
                            onToggleSaved = { onToggleSaved(item) },
                            onForward = { onForward(item) }
                        )
                    }
                }
            }
        }
        if (typingUsers.isNotEmpty()) {
            TypingIndicator(typingUsers)
        }
        Composer(
            replyingTo = replyingTo,
            isSending = isSending,
            teamMembers = teamMembers,
            workspaceId = workspaceId,
            threadId = thread.id,
            onClearReply = onClearReply,
            onSend = onSendMessage,
            onSendAttachment = onSendMessageWithAttachment,
            onTextChanged = onComposerTextChanged,
            onLoadDraft = onLoadDraft,
            onSaveDraft = onSaveDraft
        )
    }
}

@Composable
private fun ConversationHeader(
    thread: StudioMessageThread,
    currentUid: String,
    teamMembers: List<StudioMessageTeamMember>,
    showSavedOnly: Boolean,
    onToggleSearchVisible: () -> Unit,
    onToggleSavedFilter: () -> Unit,
    onOpenInfo: () -> Unit,
    onOpenMutePicker: () -> Unit,
    mutePickerOpen: Boolean,
    onDismissMutePicker: () -> Unit,
    onSetMute: (String) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        ThreadAvatar(thread, currentUid, teamMembers)
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(thread.displayTitle(currentUid, teamMembers), fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
            val subtitle = when {
                thread.isTeamThread -> "Workspace broadcast channel"
                thread.isDirectThread -> "Direct message"
                thread.isGroupThread -> "${thread.memberUids.size} members"
                else -> ""
            }
            if (subtitle.isNotBlank()) {
                Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            }
        }
        IconButton(onClick = onToggleSavedFilter) {
            Icon(
                if (showSavedOnly) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder,
                contentDescription = "Saved messages"
            )
        }
        IconButton(onClick = onToggleSearchVisible) { Icon(Icons.Filled.Search, contentDescription = "Search") }
        Box {
            IconButton(onClick = onOpenMutePicker) {
                Icon(Icons.Filled.NotificationsOff, contentDescription = "Mute")
            }
            DropdownMenu(expanded = mutePickerOpen, onDismissRequest = onDismissMutePicker) {
                DropdownMenuItem(text = { Text("Mute for 1 hour") }, onClick = { onSetMute("oneHour") })
                DropdownMenuItem(text = { Text("Mute for today") }, onClick = { onSetMute("today") })
                DropdownMenuItem(text = { Text("Mute until I unmute") }, onClick = { onSetMute("forever") })
                DropdownMenuItem(text = { Text("Unmute") }, onClick = { onSetMute("unmute") })
            }
        }
        IconButton(onClick = onOpenInfo) { Icon(Icons.Filled.Info, contentDescription = "Info") }
    }
}

@Composable
private fun SearchBar(
    query: String,
    filter: String,
    onQueryChange: (String) -> Unit,
    onFilterChange: (String) -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        OutlinedTextField(
            value = query,
            onValueChange = onQueryChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Search messages…") },
            singleLine = true,
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            trailingIcon = {
                if (query.isNotEmpty()) {
                    IconButton(onClick = { onQueryChange("") }) {
                        Icon(Icons.Filled.Close, contentDescription = "Clear")
                    }
                }
            }
        )
        Row(modifier = Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("all" to "All", "media" to "Media", "files" to "Files").forEach { (key, label) ->
                FilterChip(
                    selected = filter == key,
                    onClick = { onFilterChange(key) },
                    label = { Text(label) }
                )
            }
        }
    }
}

@Composable
private fun TypingIndicator(users: List<StudioMessageTypingUser>) {
    val text = when (users.size) {
        0 -> ""
        1 -> "${users.first().name.ifBlank { "Someone" }} is typing…"
        2 -> "${users[0].name} and ${users[1].name} are typing…"
        else -> "${users.size} people are typing…"
    }
    if (text.isNotBlank()) {
        Text(
            text,
            fontSize = 11.sp,
            fontStyle = FontStyle.Italic,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )
    }
}

@Composable
private fun PinnedBar(pinnedItems: List<StudioMessageItem>, onJump: (String) -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.06f),
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
    ) {
        Column(modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.PushPin,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(14.dp)
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    "${pinnedItems.size} pinned",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.primary
                )
            }
            LazyRow(
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                items(pinnedItems.take(5), key = { it.id }) { pinned ->
                    Surface(
                        color = MaterialTheme.colorScheme.surface,
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.clickable { onJump(pinned.id) }
                    ) {
                        Column(modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)) {
                            Text(
                                pinned.senderLabel(),
                                fontSize = 10.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Text(
                                pinned.text.ifBlank { pinned.fileName.ifBlank { "Attachment" } },
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurface,
                                maxLines = 1
                            )
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MessageBubble(
    item: StudioMessageItem,
    isMine: Boolean,
    currentUid: String,
    saved: Boolean,
    onReply: () -> Unit,
    onEdit: () -> Unit,
    onDeleteForMe: () -> Unit,
    onDeleteForEveryone: () -> Unit,
    onToggleReaction: (String) -> Unit,
    onTogglePin: () -> Unit,
    onToggleSaved: () -> Unit,
    onForward: () -> Unit
) {
    val alignment = if (isMine) Alignment.End else Alignment.Start
    val bubbleColor = if (isMine) MaterialTheme.colorScheme.primary.copy(alpha = 0.12f) else MaterialTheme.colorScheme.surfaceVariant
    val clipboardManager: ClipboardManager = LocalClipboardManager.current
    var menuOpen by remember { mutableStateOf(false) }
    var showReactionPicker by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = alignment) {
        if (!isMine) {
            Text(
                item.senderLabel(),
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 4.dp, bottom = 2.dp)
            )
        }
        Box {
            Surface(
                color = bubbleColor,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .padding(horizontal = 4.dp)
                    .combinedClickable(
                        onClick = {},
                        onLongClick = { if (!item.isDeleted) menuOpen = true }
                    )
            ) {
                Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                    if (item.replyToMessageId.isNotBlank()) {
                        ReplyQuote(item)
                        Spacer(Modifier.height(4.dp))
                    }
                    if (item.isDeleted) {
                        Text("Message deleted", fontStyle = FontStyle.Italic, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                    } else {
                        if (item.fileURL.isNotBlank()) {
                            AttachmentCard(item)
                            if (item.text.isNotBlank()) Spacer(Modifier.height(6.dp))
                        }
                        if (item.text.isNotBlank()) {
                            Text(item.text, fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurface)
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (saved) {
                            Icon(Icons.Filled.Bookmark, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(11.dp))
                            Spacer(Modifier.width(4.dp))
                        }
                        if (item.pinned) {
                            Icon(Icons.Filled.PushPin, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(11.dp))
                            Spacer(Modifier.width(4.dp))
                        }
                        item.createdAt?.let {
                            Text(formatTime(it), fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (item.edited && !item.isDeleted) {
                            Spacer(Modifier.width(6.dp))
                            Text("edited", fontSize = 10.sp, fontStyle = FontStyle.Italic, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                DropdownMenuItem(text = { Text("React") }, onClick = { menuOpen = false; showReactionPicker = true })
                DropdownMenuItem(text = { Text("Reply") }, onClick = { menuOpen = false; onReply() })
                DropdownMenuItem(text = { Text("Forward") }, onClick = { menuOpen = false; onForward() })
                DropdownMenuItem(
                    text = { Text(if (saved) "Unsave" else "Save") },
                    onClick = { menuOpen = false; onToggleSaved() }
                )
                if (item.text.isNotBlank()) {
                    DropdownMenuItem(
                        text = { Text("Copy text") },
                        onClick = {
                            clipboardManager.setText(AnnotatedString(item.text))
                            menuOpen = false
                        }
                    )
                }
                DropdownMenuItem(
                    text = { Text(if (item.pinned) "Unpin" else "Pin") },
                    onClick = { menuOpen = false; onTogglePin() }
                )
                if (isMine && !item.isDeleted && item.text.isNotBlank() && item.fileURL.isBlank()) {
                    DropdownMenuItem(text = { Text("Edit") }, onClick = { menuOpen = false; onEdit() })
                }
                DropdownMenuItem(text = { Text("Delete for me") }, onClick = { menuOpen = false; onDeleteForMe() })
                if (isMine && !item.isDeleted) {
                    DropdownMenuItem(text = { Text("Delete for everyone") }, onClick = { menuOpen = false; onDeleteForEveryone() })
                }
            }
            DropdownMenu(expanded = showReactionPicker, onDismissRequest = { showReactionPicker = false }) {
                Row(modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)) {
                    QuickReactions.forEach { emoji ->
                        Text(
                            emoji,
                            fontSize = 22.sp,
                            modifier = Modifier
                                .padding(4.dp)
                                .clickable {
                                    onToggleReaction(emoji)
                                    showReactionPicker = false
                                }
                        )
                    }
                }
            }
        }
        if (item.reactions.isNotEmpty()) {
            ReactionRow(item = item, currentUid = currentUid, onToggleReaction = onToggleReaction)
        }
    }
}

@Composable
private fun ReactionRow(
    item: StudioMessageItem,
    currentUid: String,
    onToggleReaction: (String) -> Unit
) {
    Row(
        modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        item.reactions.forEach { (emoji, users) ->
            val mine = users.containsKey(currentUid)
            Surface(
                color = if (mine) MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
                else MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier
                    .clickable { onToggleReaction(emoji) }
                    .border(
                        width = if (mine) 1.dp else 0.dp,
                        color = if (mine) MaterialTheme.colorScheme.primary else Color.Transparent,
                        shape = RoundedCornerShape(10.dp)
                    )
            ) {
                Row(modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(emoji, fontSize = 13.sp)
                    Spacer(Modifier.width(4.dp))
                    Text(users.size.toString(), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface)
                }
            }
        }
    }
}

@Composable
private fun AttachmentCard(item: StudioMessageItem) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(8.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Filled.AttachFile, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(6.dp))
            Column {
                Text(item.fileName.ifBlank { "Attachment" }, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1)
                val size = formatFileSize(item.fileSize)
                if (size.isNotBlank()) {
                    Text(size, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun ReplyQuote(item: StudioMessageItem) {
    val sender = item.replyToSenderName.ifBlank { "Someone" }
    val preview = item.replyToText.ifBlank { item.replyToFileName.ifBlank { "Attachment" } }
    Surface(color = MaterialTheme.colorScheme.surface.copy(alpha = 0.6f), shape = RoundedCornerShape(6.dp)) {
        Column(modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)) {
            Text(sender, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
            Text(preview, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
    }
}

@Composable
private fun Composer(
    replyingTo: StudioMessageItem?,
    isSending: Boolean,
    teamMembers: List<StudioMessageTeamMember>,
    workspaceId: String,
    threadId: String,
    onClearReply: () -> Unit,
    onSend: (String, List<String>) -> Unit,
    onSendAttachment: (ByteArray, String, String, String, List<String>) -> Unit,
    onTextChanged: () -> Unit,
    onLoadDraft: (String, String) -> String,
    onSaveDraft: (String, String, String) -> Unit
) {
    var draft by remember(threadId) { mutableStateOf(TextFieldValue(onLoadDraft(workspaceId, threadId))) }
    val pendingMentionUids = remember(threadId) { mutableStateOf<List<String>>(emptyList()) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val pickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri != null) {
            scope.launch {
                runCatching {
                    val resolver = context.contentResolver
                    try { resolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (_: Throwable) {}
                    val name = queryDisplayName(uri, resolver) ?: "Attachment"
                    val type = resolver.getType(uri) ?: "application/octet-stream"
                    val bytes = withContext(Dispatchers.IO) {
                        resolver.openInputStream(uri)?.use { it.readBytes() }
                    } ?: return@runCatching
                    if (bytes.isEmpty()) return@runCatching
                    onSendAttachment(bytes, name, type, draft.text.trim(), pendingMentionUids.value)
                    draft = TextFieldValue("")
                    pendingMentionUids.value = emptyList()
                    onSaveDraft(workspaceId, threadId, "")
                }
            }
        }
    }

    val mentionQuery = remember(draft.text, draft.selection) {
        val cursor = draft.selection.end.coerceAtMost(draft.text.length)
        val upTo = draft.text.take(cursor)
        val atIndex = upTo.lastIndexOf('@')
        if (atIndex < 0) null
        else {
            val before = if (atIndex == 0) ' ' else upTo[atIndex - 1]
            if (!before.isWhitespace() && atIndex != 0) null
            else {
                val token = upTo.substring(atIndex + 1)
                if (token.contains(' ') || token.contains('\n')) null else token
            }
        }
    }

    val mentionSuggestions = remember(mentionQuery, teamMembers) {
        if (mentionQuery == null) emptyList()
        else {
            val q = mentionQuery.lowercase()
            teamMembers.filter {
                q.isEmpty() || it.label.lowercase().contains(q) || it.email.lowercase().contains(q)
            }.take(6)
        }
    }

    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        if (replyingTo != null) {
            Surface(
                color = MaterialTheme.colorScheme.primary.copy(alpha = 0.08f),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp)
            ) {
                Row(modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Replying to ${replyingTo.senderLabel()}", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
                        Text(replyingTo.text.ifBlank { replyingTo.fileName.ifBlank { "Attachment" } }, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                    }
                    IconButton(onClick = onClearReply) { Icon(Icons.Filled.Close, contentDescription = "Cancel reply") }
                }
            }
        }
        if (mentionSuggestions.isNotEmpty()) {
            Surface(
                color = MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp)
            ) {
                Column {
                    mentionSuggestions.forEach { member ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    val cursor = draft.selection.end.coerceAtMost(draft.text.length)
                                    val upTo = draft.text.take(cursor)
                                    val atIndex = upTo.lastIndexOf('@')
                                    if (atIndex >= 0) {
                                        val before = draft.text.take(atIndex)
                                        val after = draft.text.drop(cursor)
                                        val insertion = "@${member.label} "
                                        val newText = before + insertion + after
                                        val newCursor = (before.length + insertion.length).coerceAtMost(newText.length)
                                        draft = TextFieldValue(text = newText, selection = androidx.compose.ui.text.TextRange(newCursor))
                                        pendingMentionUids.value = (pendingMentionUids.value + member.id).distinct()
                                    }
                                }
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(24.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(member.label.take(1).uppercase(), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                            }
                            Spacer(Modifier.width(8.dp))
                            Text(member.label, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.width(6.dp))
                            Text(member.email, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { pickerLauncher.launch(arrayOf("*/*")) }, enabled = !isSending) {
                Icon(Icons.Filled.AttachFile, contentDescription = "Attach file")
            }
            OutlinedTextField(
                value = draft,
                onValueChange = {
                    draft = it
                    onSaveDraft(workspaceId, threadId, it.text)
                    if (it.text.isNotBlank()) onTextChanged()
                },
                modifier = Modifier.weight(1f),
                placeholder = { Text("Write a message…") },
                singleLine = false,
                maxLines = 5,
                keyboardOptions = KeyboardOptions.Default
            )
            Spacer(Modifier.width(8.dp))
            IconButton(
                onClick = {
                    val text = draft.text.trim()
                    if (text.isNotEmpty() && !isSending) {
                        onSend(text, pendingMentionUids.value)
                        draft = TextFieldValue("")
                        pendingMentionUids.value = emptyList()
                        onSaveDraft(workspaceId, threadId, "")
                    }
                },
                enabled = draft.text.trim().isNotEmpty() && !isSending
            ) {
                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send")
            }
        }
    }
}

@Composable
private fun NewConversationDialog(
    teamMembers: List<StudioMessageTeamMember>,
    onDismiss: () -> Unit,
    onCreateDirect: (String) -> Unit,
    onCreateGroup: (List<String>, String) -> Unit
) {
    var groupMode by remember { mutableStateOf(false) }
    var selectedUids by remember { mutableStateOf<Set<String>>(emptySet()) }
    var groupTitle by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (groupMode) "New group" else "New direct message") },
        text = {
            Column(modifier = Modifier.fillMaxWidth().heightIn(max = 400.dp)) {
                Row(modifier = Modifier.padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(selected = !groupMode, onClick = { groupMode = false; selectedUids = emptySet() }, label = { Text("Direct") })
                    FilterChip(selected = groupMode, onClick = { groupMode = true }, label = { Text("Group") })
                }
                if (groupMode) {
                    OutlinedTextField(
                        value = groupTitle,
                        onValueChange = { groupTitle = it },
                        placeholder = { Text("Group title (optional)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
                    )
                }
                LazyColumn(modifier = Modifier.fillMaxWidth()) {
                    items(teamMembers, key = { it.id }) { member ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    selectedUids = if (groupMode) {
                                        if (selectedUids.contains(member.id)) selectedUids - member.id else selectedUids + member.id
                                    } else setOf(member.id)
                                }
                                .padding(vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            if (groupMode) {
                                Checkbox(checked = selectedUids.contains(member.id), onCheckedChange = null)
                                Spacer(Modifier.width(8.dp))
                            }
                            Box(
                                modifier = Modifier.size(28.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(member.label.take(1).uppercase(), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                            }
                            Spacer(Modifier.width(10.dp))
                            Column {
                                Text(member.label, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                                if (member.email.isNotBlank()) {
                                    Text(member.email, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                            if (!groupMode && selectedUids.contains(member.id)) {
                                Spacer(Modifier.weight(1f))
                                Text("✓", color = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    if (groupMode) onCreateGroup(selectedUids.toList(), groupTitle.trim())
                    else selectedUids.firstOrNull()?.let { onCreateDirect(it) }
                },
                enabled = if (groupMode) selectedUids.size >= 2 else selectedUids.size == 1
            ) { Text("Create") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun ThreadInfoDialog(
    thread: StudioMessageThread,
    currentUid: String,
    teamMembers: List<StudioMessageTeamMember>,
    onDismiss: () -> Unit,
    onRename: () -> Unit,
    onAddMembers: () -> Unit,
    onLeave: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(thread.displayTitle(currentUid, teamMembers)) },
        text = {
            Column {
                Text("${thread.memberUids.size} members", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(8.dp))
                LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 240.dp)) {
                    items(thread.memberUids, key = { it }) { uid ->
                        val member = teamMembers.firstOrNull { it.id == uid }
                        Text(
                            member?.label ?: uid,
                            fontSize = 13.sp,
                            modifier = Modifier.padding(vertical = 4.dp)
                        )
                    }
                }
            }
        },
        confirmButton = {
            Row {
                if (!thread.isTeamThread && !thread.isDirectThread) {
                    TextButton(onClick = onRename) { Text("Rename") }
                    TextButton(onClick = onAddMembers) { Text("Add") }
                    TextButton(onClick = onLeave) { Text("Leave") }
                }
                TextButton(onClick = onDismiss) { Text("Close") }
            }
        }
    )
}

@Composable
private fun RenameThreadDialog(
    initialTitle: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    var title by remember { mutableStateOf(initialTitle) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Rename group") },
        text = {
            OutlinedTextField(
                value = title,
                onValueChange = { title = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(title.trim()) }, enabled = title.trim().isNotEmpty()) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun AddMembersDialog(
    availableMembers: List<StudioMessageTeamMember>,
    onDismiss: () -> Unit,
    onConfirm: (List<String>) -> Unit
) {
    var selected by remember { mutableStateOf<Set<String>>(emptySet()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add people") },
        text = {
            LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 320.dp)) {
                items(availableMembers, key = { it.id }) { m ->
                    Row(
                        modifier = Modifier.fillMaxWidth().clickable {
                            selected = if (selected.contains(m.id)) selected - m.id else selected + m.id
                        }.padding(vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Checkbox(checked = selected.contains(m.id), onCheckedChange = null)
                        Spacer(Modifier.width(8.dp))
                        Text(m.label, fontSize = 14.sp)
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(selected.toList()) }, enabled = selected.isNotEmpty()) { Text("Add") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun ForwardMessageDialog(
    threads: List<StudioMessageThread>,
    currentUid: String,
    teamMembers: List<StudioMessageTeamMember>,
    onDismiss: () -> Unit,
    onForward: (String) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Forward to…") },
        text = {
            LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 320.dp)) {
                items(threads, key = { it.id }) { thread ->
                    Row(
                        modifier = Modifier.fillMaxWidth().clickable { onForward(thread.id) }.padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Forward, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(thread.displayTitle(currentUid, teamMembers), fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun EditMessageDialog(
    initialText: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    var text by remember { mutableStateOf(initialText) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit message") },
        text = {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = false,
                maxLines = 6
            )
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(text.trim()) },
                enabled = text.trim().isNotEmpty() && text.trim() != initialText.trim()
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

private fun queryDisplayName(uri: Uri, resolver: android.content.ContentResolver): String? {
    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
            val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (idx >= 0) return cursor.getString(idx)
        }
    }
    return uri.lastPathSegment
}

private fun formatFileSize(bytes: Long): String {
    if (bytes <= 0L) return ""
    val kb = bytes / 1024.0
    if (kb < 1024.0) return "%.1f KB".format(kb)
    val mb = kb / 1024.0
    return "%.1f MB".format(mb)
}

private fun threadPreview(thread: StudioMessageThread): String {
    val text = thread.lastMessageText.trim()
    if (text.isNotBlank()) return text
    if (thread.isTeamThread) return "Workspace conversation"
    return "Tap to start the conversation"
}

private fun formatTime(date: Date): String {
    return SimpleDateFormat("HH:mm", Locale.getDefault()).format(date)
}

private fun relativeTime(date: Date): String {
    val now = System.currentTimeMillis()
    val diff = now - date.time
    val minute = 60_000L
    val hour = 60 * minute
    val day = 24 * hour
    return when {
        diff < minute -> "now"
        diff < hour -> "${diff / minute}m"
        diff < day -> "${diff / hour}h"
        diff < 7 * day -> "${diff / day}d"
        else -> SimpleDateFormat("dd MMM", Locale.getDefault()).format(date)
    }
}
