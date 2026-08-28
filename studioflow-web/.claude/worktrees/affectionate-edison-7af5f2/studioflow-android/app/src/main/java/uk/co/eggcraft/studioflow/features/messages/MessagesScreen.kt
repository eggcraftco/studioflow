package uk.co.eggcraft.studioflow.features.messages

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.imePadding
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Image
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
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
import org.json.JSONObject
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import uk.co.eggcraft.studioflow.data.model.StudioMessageItem
import uk.co.eggcraft.studioflow.data.model.StudioMessageTeamMember
import uk.co.eggcraft.studioflow.data.model.StudioMessageThread
import uk.co.eggcraft.studioflow.data.model.StudioMessageTypingUser
import uk.co.eggcraft.studioflow.features.shell.StudioFlowUiState
import uk.co.eggcraft.studioflow.ui.theme.StudioBlue
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
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val workspaceId = state.workspace?.id.orEmpty()
    val workspaceMessageSettings = state.messageWorkspaceSettings
    val currentRole = state.workspace?.role.orEmpty().trim().lowercase()
    val isViewOnlyMember = currentRole == "viewer" || currentRole == "viewonly" || currentRole == "readonly"
    val isWorkflowOnlyMember = currentRole == "workflow" || currentRole == "workflowonly" || currentRole == "workflow_only"
    val canCreateAnyConversation = !isViewOnlyMember &&
        (workspaceMessageSettings.directMessagesEnabled || workspaceMessageSettings.groupConversationsEnabled)
    val canSendMessageAttachments = workspaceMessageSettings.attachmentsEnabled && !isViewOnlyMember
    // Posting into the team-wide thread is its own permission; the server
    // enforces it, this only keeps the composer honest.
    val canPostTeamChat = state.workspace?.isOwner == true || state.workspace?.memberAccess?.teamChat != false
    val currentUid = state.user?.uid.orEmpty()
    val context = LocalContext.current
    val deletedThreadPreferences = remember { context.getSharedPreferences("studio_message_deleted_threads", Context.MODE_PRIVATE) }
    val deletedThreadKey = "deleted_${workspaceId}_${currentUid}"
    var cloudArchivedThreadMarkers by remember(workspaceId, currentUid) {
        mutableStateOf(state.archivedThreadMarkers)
    }
    var deletedThreadMarkers by remember(workspaceId, currentUid) {
        mutableStateOf(loadDeletedThreadMarkers(deletedThreadPreferences, deletedThreadKey))
    }
    val messagePreferenceReference = remember(workspaceId, currentUid) {
        if (workspaceId.isBlank() || currentUid.isBlank()) null
        else FirebaseFirestore.getInstance().collection("companies").document(workspaceId)
            .collection("messageUserPreferences").document(currentUid)
    }

    fun persistConversationListPreferences(nextArchived: Map<String, Long>, nextDeleted: Map<String, Long>) {
        persistDeletedThreadMarkers(deletedThreadPreferences, deletedThreadKey, nextDeleted)
        messagePreferenceReference?.set(
            mapOf(
                "companyId" to workspaceId,
                "userId" to currentUid,
                "archivedThreads" to nextArchived,
                "deletedThreads" to nextDeleted,
                "updatedAt" to FieldValue.serverTimestamp(),
                "updatedByUid" to currentUid
            ),
            SetOptions.merge()
        )
    }

    DisposableEffect(messagePreferenceReference, workspaceId, currentUid) {
        val registration = messagePreferenceReference?.addSnapshotListener { snapshot, _ ->
            if (snapshot != null && snapshot.exists()) {
                cloudArchivedThreadMarkers = firestoreLongMap(snapshot.get("archivedThreads"))
                deletedThreadMarkers = firestoreLongMap(snapshot.get("deletedThreads"))
                persistDeletedThreadMarkers(deletedThreadPreferences, deletedThreadKey, deletedThreadMarkers)
            } else if (messagePreferenceReference != null) {
                persistConversationListPreferences(cloudArchivedThreadMarkers, deletedThreadMarkers)
            }
        }
        onDispose { registration?.remove() }
    }

    fun toggleArchiveAcrossDevices(threadId: String) {
        val cleanThreadId = threadId.trim()
        if (cleanThreadId.isBlank() || cleanThreadId == "team") return
        val next = cloudArchivedThreadMarkers.toMutableMap()
        if (next.containsKey(cleanThreadId)) next.remove(cleanThreadId)
        else next[cleanThreadId] = System.currentTimeMillis()
        cloudArchivedThreadMarkers = next.toMap()
        persistConversationListPreferences(cloudArchivedThreadMarkers, deletedThreadMarkers)
    }

    fun deleteConversationForMe(threadId: String) {
        val cleanThreadId = threadId.trim()
        if (cleanThreadId.isBlank() || cleanThreadId == "team") return
        val nextDeleted = deletedThreadMarkers.toMutableMap().apply { put(cleanThreadId, System.currentTimeMillis()) }.toMap()
        val nextArchived = cloudArchivedThreadMarkers.toMutableMap().apply { remove(cleanThreadId) }.toMap()
        deletedThreadMarkers = nextDeleted
        cloudArchivedThreadMarkers = nextArchived
        persistConversationListPreferences(nextArchived, nextDeleted)
        if (state.selectedMessageThreadId == cleanThreadId) onSelectThread("team")
    }

    fun restoreConversationToMyList(threadId: String) {
        val cleanThreadId = threadId.trim()
        if (cleanThreadId.isBlank() || cleanThreadId == "team") return
        if (!cloudArchivedThreadMarkers.containsKey(cleanThreadId) && !deletedThreadMarkers.containsKey(cleanThreadId)) return
        val nextArchived = cloudArchivedThreadMarkers.toMutableMap().apply { remove(cleanThreadId) }.toMap()
        val nextDeleted = deletedThreadMarkers.toMutableMap().apply { remove(cleanThreadId) }.toMap()
        cloudArchivedThreadMarkers = nextArchived
        deletedThreadMarkers = nextDeleted
        persistConversationListPreferences(nextArchived, nextDeleted)
    }

    fun directThreadIdFor(memberUid: String): String {
        val ids = listOf(currentUid.trim(), memberUid.trim()).filter { it.isNotBlank() }.sorted()
        if (ids.size != 2) return ""
        return ("direct_" + ids.joinToString("_")).replace(Regex("[^A-Za-z0-9_-]"), "_")
    }
    val threads = state.messageThreads
    val selectedId = state.selectedMessageThreadId
    val selectedThread = threads.firstOrNull { it.id == selectedId } ?: threads.firstOrNull()
    val allItems = selectedThread?.let { state.messageItemsByThreadId[it.id].orEmpty() } ?: emptyList()
    val typingUsers = selectedThread?.let { state.typingUsersByThreadId[it.id].orEmpty() } ?: emptyList()
    val savedIds = selectedThread?.let { state.savedMessageIdsByThreadId[it.id].orEmpty() } ?: emptySet()
    val archivedMarkers = cloudArchivedThreadMarkers

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
    var viewerImage by remember { mutableStateOf<StudioMessageItem?>(null) }
    var phoneShowingConversation by rememberSaveable(selectedThread?.id) {
        mutableStateOf(false)
    }
    var scrollToMessageId by remember { mutableStateOf("") }
    var newConversationOpen by remember { mutableStateOf(false) }
    var threadInfoOpen by remember { mutableStateOf(false) }
    var addMembersOpen by remember { mutableStateOf(false) }
    var renameOpen by remember { mutableStateOf(false) }
    var searchVisible by remember(selectedThread?.id) { mutableStateOf(false) }
    var mutePickerOpen by remember { mutableStateOf(false) }

    BoxWithConstraints(modifier = Modifier.fillMaxSize().statusBarsPadding()) {
        val isPhone = maxWidth < 600.dp

        // ---- PHONE LAYOUT (stacked nav: list OR conversation) ----
        if (isPhone) {
            if (phoneShowingConversation && selectedThread != null) {
                BackHandler(enabled = true) { phoneShowingConversation = false }
                ConversationPanel(
                    canPostTeamChat = canPostTeamChat,
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
                        selectedThread.id.let { tid -> onToggleSavedMessage(tid, msg.id) }
                    },
                    onForward = { onSetForwardingMessage(it) },
                    onOpenImage = { viewerImage = it },
                    onToggleSearchVisible = { searchVisible = !searchVisible; if (!searchVisible) onSetMessageSearchQuery("") },
                    onSearchQueryChange = onSetMessageSearchQuery,
                    onAttachmentFilterChange = onSetMessageAttachmentFilter,
                    onToggleSavedFilter = { showSavedOnly = !showSavedOnly },
                    onOpenInfo = { threadInfoOpen = true },
                    onComposerTextChanged = onComposerTextChanged,
                    onOpenMutePicker = { mutePickerOpen = true },
                    onDismissMutePicker = { mutePickerOpen = false },
                    onSetMute = { mode ->
                        selectedThread.id.let { tid -> onSetThreadMute(tid, mode) }
                        mutePickerOpen = false
                    },
                    workspaceId = workspaceId,
                    attachmentsEnabled = canSendMessageAttachments,
                    onLoadDraft = onLoadDraft,
                    onSaveDraft = onSaveDraft,
                    onBack = { phoneShowingConversation = false },
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 16.dp)
                )
            } else {
                Box(modifier = Modifier.fillMaxSize()) {
                    ThreadListPanel(
                        threads = threads,
                        archivedMarkers = archivedMarkers,
                        deletedMarkers = deletedThreadMarkers,
                        selectedId = selectedThread?.id.orEmpty(),
                        currentUid = currentUid,
                        teamMembers = state.messageTeamMembers,
                        unreadCount = state.messageUnreadCount,
                        onSelectThread = { id ->
                            onSelectThread(id)
                            phoneShowingConversation = true
                        },
                        onToggleArchive = ::toggleArchiveAcrossDevices,
                        onDeleteThread = ::deleteConversationForMe
                    )
                    if (canCreateAnyConversation) {
                        FloatingActionButton(
                            onClick = { newConversationOpen = true },
                            modifier = Modifier
                                .align(Alignment.BottomEnd)
                                .padding(16.dp)
                        ) {
                            Icon(Icons.Filled.Add, contentDescription = t("New conversation"))
                        }
                    }
                }
            }
            return@BoxWithConstraints
        }

        // ---- TABLET / DESKTOP LAYOUT (split view) ----
        Row(modifier = Modifier.fillMaxSize()) {
        Box(modifier = Modifier.width(320.dp).fillMaxSize()) {
            ThreadListPanel(
                threads = threads,
                archivedMarkers = archivedMarkers,
                deletedMarkers = deletedThreadMarkers,
                selectedId = selectedThread?.id.orEmpty(),
                currentUid = currentUid,
                teamMembers = state.messageTeamMembers,
                unreadCount = state.messageUnreadCount,
                onSelectThread = onSelectThread,
                onToggleArchive = ::toggleArchiveAcrossDevices,
                onDeleteThread = ::deleteConversationForMe
            )
            if (canCreateAnyConversation) {
                FloatingActionButton(
                    onClick = { newConversationOpen = true },
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(16.dp)
                ) {
                    Icon(Icons.Filled.Add, contentDescription = t("New conversation"))
                }
            }
        }
        Box(
            modifier = Modifier
                .width(1.dp)
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.outlineVariant)
        )
        ConversationPanel(
            canPostTeamChat = canPostTeamChat,
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
            onOpenImage = { viewerImage = it },
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
            attachmentsEnabled = canSendMessageAttachments,
            onLoadDraft = onLoadDraft,
            onSaveDraft = onSaveDraft,
            onBack = null,
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp)
        )
        }
    }

    editingMessage?.let { msg ->
        EditMessageDialog(
            initialText = msg.text,
            onDismiss = { editingMessage = null },
            onConfirm = { newText -> onEditMessage(msg.id, newText); editingMessage = null }
        )
    }

    viewerImage?.let { img ->
        ImageViewerDialog(
            imageUrl = img.fileURL,
            fileName = img.fileName,
            onDismiss = { viewerImage = null }
        )
    }

    if (newConversationOpen) {
        NewConversationDialog(
            teamMembers = state.messageTeamMembers.filter { it.id != currentUid },
            allowDirect = workspaceMessageSettings.directMessagesEnabled,
            allowGroup = workspaceMessageSettings.groupConversationsEnabled,
            onDismiss = { newConversationOpen = false },
            onCreateDirect = { uid ->
                restoreConversationToMyList(directThreadIdFor(uid))
                onCreateDirectMessageThread(uid)
                newConversationOpen = false
            },
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
    deletedMarkers: Map<String, Long>,
    selectedId: String,
    currentUid: String,
    teamMembers: List<StudioMessageTeamMember>,
    unreadCount: Int,
    onSelectThread: (String) -> Unit,
    onToggleArchive: (String) -> Unit,
    onDeleteThread: (String) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val visibleThreads = threads.filter { thread ->
        if (thread.isTeamThread) return@filter true
        val marker = deletedMarkers[thread.id] ?: return@filter true
        val lastTs = thread.lastMessageAt?.time ?: 0L
        lastTs > marker // restore if a new message arrived
    }
    val active = visibleThreads.filter { thread ->
        val marker = archivedMarkers[thread.id] ?: return@filter true
        val lastTs = thread.lastMessageAt?.time ?: 0L
        lastTs > marker // unarchive if new message arrived
    }
    val archived = visibleThreads.filter { thread -> thread !in active }
    var archivedExpanded by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(t("Messages"), fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
            if (unreadCount > 0) Badge { Text(unreadCount.toString()) }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        if (active.isEmpty() && archived.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                Text(t("No conversations yet."), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
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
                        onToggleArchive = { onToggleArchive(thread.id) },
                        onDeleteThread = { onDeleteThread(thread.id) }
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
                                if (archivedExpanded) t("Hide") else t("Show"),
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
                                onToggleArchive = { onToggleArchive(thread.id) },
                        onDeleteThread = { onDeleteThread(thread.id) }
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
    onToggleArchive: () -> Unit,
    onDeleteThread: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
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
                        threadPreview(thread, lang),
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
        DropdownMenu(expanded = menuOpen && !thread.isTeamThread, onDismissRequest = { menuOpen = false }) {
            DropdownMenuItem(
                text = { Text(if (archived) t("Unarchive") else t("Archive")) },
                onClick = { menuOpen = false; onToggleArchive() }
            )
            DropdownMenuItem(
                text = { Text("Delete Conversation", color = MaterialTheme.colorScheme.error) },
                onClick = { menuOpen = false; onDeleteThread() }
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
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
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
    canPostTeamChat: Boolean,
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
    onOpenImage: (StudioMessageItem) -> Unit,
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
    attachmentsEnabled: Boolean,
    onLoadDraft: (String, String) -> String,
    onSaveDraft: (String, String, String) -> Unit,
    onBack: (() -> Unit)?,
    modifier: Modifier = Modifier
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    if (thread == null) {
        Box(modifier = modifier, contentAlignment = Alignment.Center) {
            Text(t("Select a conversation to view messages."), color = MaterialTheme.colorScheme.onSurfaceVariant)
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

    Column(modifier = modifier.navigationBarsPadding().imePadding()) {
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
            onSetMute = onSetMute,
            onBack = onBack
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
                            showSavedOnly -> t("No saved messages.")
                            searchQuery.isNotBlank() || attachmentFilter != "all" -> t("No results.")
                            else -> t("No messages yet.")
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
                            onForward = { onForward(item) },
                            onOpenImage = { onOpenImage(item) }
                        )
                    }
                }
            }
        }
        if (typingUsers.isNotEmpty()) {
            TypingIndicator(typingUsers)
        }
        if (thread.isTeamThread && !canPostTeamChat) {
            Text(
                t("You can read Team Chat, but posting here is not enabled for your workspace account."),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(12.dp)
            )
        } else {
            Composer(
                replyingTo = replyingTo,
                isSending = isSending,
                teamMembers = teamMembers,
                workspaceId = workspaceId,
                threadId = thread.id,
                attachmentsEnabled = attachmentsEnabled,
                onClearReply = onClearReply,
                onSend = onSendMessage,
                onSendAttachment = onSendMessageWithAttachment,
                onTextChanged = onComposerTextChanged,
                onLoadDraft = onLoadDraft,
                onSaveDraft = onSaveDraft
            )
        }
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
    onSetMute: (String) -> Unit,
    onBack: (() -> Unit)? = null
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var moreOpen by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        ThreadAvatar(thread, currentUid, teamMembers)
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                thread.displayTitle(currentUid, teamMembers),
                fontWeight = FontWeight.ExtraBold,
                fontSize = 17.sp,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1
            )
            val subtitle = when {
                thread.isTeamThread -> t("Workspace group conversation")
                thread.isDirectThread -> t("Direct message")
                thread.isGroupThread -> "${thread.memberUids.size} members"
                else -> ""
            }
            if (subtitle.isNotBlank()) {
                Text(
                    subtitle,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp,
                    maxLines = 1
                )
            }
        }
        Box {
            IconButton(onClick = onOpenMutePicker) {
                Icon(Icons.Filled.NotificationsOff, contentDescription = t("Mute"), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            DropdownMenu(expanded = mutePickerOpen, onDismissRequest = onDismissMutePicker) {
                DropdownMenuItem(text = { Text(t("Mute for 1 hour")) }, onClick = { onSetMute("oneHour") })
                DropdownMenuItem(text = { Text(t("Mute for today")) }, onClick = { onSetMute("today") })
                DropdownMenuItem(text = { Text(t("Mute until I unmute")) }, onClick = { onSetMute("forever") })
                DropdownMenuItem(text = { Text(t("Unmute")) }, onClick = { onSetMute("unmute") })
            }
        }
        IconButton(onClick = onToggleSearchVisible) {
            Icon(Icons.Filled.Search, contentDescription = t("Search"), tint = StudioBlue)
        }
        Box {
            IconButton(onClick = { moreOpen = true }) {
                Icon(Icons.Filled.MoreVert, contentDescription = t("More"), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            DropdownMenu(expanded = moreOpen, onDismissRequest = { moreOpen = false }) {
                DropdownMenuItem(
                    text = { Text(if (showSavedOnly) t("Show all") else t("Saved only")) },
                    leadingIcon = { Icon(if (showSavedOnly) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder, contentDescription = null) },
                    onClick = { moreOpen = false; onToggleSavedFilter() }
                )
                DropdownMenuItem(
                    text = { Text(t("Conversation info")) },
                    leadingIcon = { Icon(Icons.Filled.Info, contentDescription = null) },
                    onClick = { moreOpen = false; onOpenInfo() }
                )
            }
        }
    }
}

@Composable
private fun SearchBar(
    query: String,
    filter: String,
    onQueryChange: (String) -> Unit,
    onFilterChange: (String) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        OutlinedTextField(
            value = query,
            onValueChange = onQueryChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text(t("Search messages…")) },
            singleLine = true,
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            trailingIcon = {
                if (query.isNotEmpty()) {
                    IconButton(onClick = { onQueryChange("") }) {
                        Icon(Icons.Filled.Close, contentDescription = t("Clear"))
                    }
                }
            }
        )
        Row(modifier = Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("all" to "All", "media" to t("Media"), "files" to t("Files")).forEach { (key, label) ->
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
    onForward: () -> Unit,
    onOpenImage: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val isDark = androidx.compose.foundation.isSystemInDarkTheme()
    // iPhone-style colors: navy/teal for mine, dark gray for theirs
    val mineBubble = if (isDark) Color(0xFF0D3D5C) else StudioBlue.copy(alpha = 0.18f)
    val theirsBubble = if (isDark) Color(0xFF2A2A2D) else MaterialTheme.colorScheme.surfaceVariant
    val bubbleColor = if (isMine) mineBubble else theirsBubble
    val textColor = if (isMine && isDark) Color.White else MaterialTheme.colorScheme.onSurface
    val clipboardManager: ClipboardManager = LocalClipboardManager.current
    var menuOpen by remember { mutableStateOf(false) }
    var showReactionPicker by remember { mutableStateOf(false) }

    // Row layout: avatar (theirs left / mine right) + content column with sender label, bubble, time below
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        verticalAlignment = Alignment.Top
    ) {
        if (!isMine) {
            BubbleAvatar(item)
            Spacer(Modifier.width(8.dp))
        } else {
            Spacer(Modifier.weight(1f, fill = true))
        }
        Column(
            modifier = Modifier.widthIn(max = 280.dp),
            horizontalAlignment = if (isMine) Alignment.End else Alignment.Start
        ) {
            if (!isMine) {
                Text(
                    item.senderLabel(),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.padding(bottom = 4.dp)
                )
            }
            Box {
                Surface(
                    color = bubbleColor,
                    shape = RoundedCornerShape(18.dp),
                    modifier = Modifier
                        .combinedClickable(
                            onClick = {},
                            onLongClick = { if (!item.isDeleted) menuOpen = true }
                        )
                ) {
                    Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp)) {
                        if (item.replyToMessageId.isNotBlank()) {
                            ReplyQuote(item)
                            Spacer(Modifier.height(4.dp))
                        }
                        if (item.isDeleted) {
                            Text(t("Message deleted"), fontStyle = FontStyle.Italic, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
                        } else {
                            if (item.fileURL.isNotBlank()) {
                                AttachmentCard(item, onImageClick = onOpenImage)
                                if (item.text.isNotBlank()) Spacer(Modifier.height(6.dp))
                            }
                            if (item.text.isNotBlank()) {
                                Text(item.text, fontSize = 15.sp, color = textColor, lineHeight = 20.sp)
                            }
                        }
                    }
                }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                DropdownMenuItem(text = { Text(t("React")) }, onClick = { menuOpen = false; showReactionPicker = true })
                DropdownMenuItem(text = { Text(t("Reply")) }, onClick = { menuOpen = false; onReply() })
                DropdownMenuItem(text = { Text(t("Forward")) }, onClick = { menuOpen = false; onForward() })
                DropdownMenuItem(
                    text = { Text(if (saved) t("Unsave") else t("Save")) },
                    onClick = { menuOpen = false; onToggleSaved() }
                )
                if (item.text.isNotBlank()) {
                    DropdownMenuItem(
                        text = { Text(t("Copy text")) },
                        onClick = {
                            clipboardManager.setText(AnnotatedString(item.text))
                            menuOpen = false
                        }
                    )
                }
                DropdownMenuItem(
                    text = { Text(if (item.pinned) t("Unpin") else "Pin") },
                    onClick = { menuOpen = false; onTogglePin() }
                )
                if (isMine && !item.isDeleted && item.text.isNotBlank() && item.fileURL.isBlank()) {
                    DropdownMenuItem(text = { Text("Edit") }, onClick = { menuOpen = false; onEdit() })
                }
                DropdownMenuItem(text = { Text(t("Delete for me")) }, onClick = { menuOpen = false; onDeleteForMe() })
                if (isMine && !item.isDeleted) {
                    DropdownMenuItem(text = { Text(t("Delete for everyone")) }, onClick = { menuOpen = false; onDeleteForEveryone() })
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
            // Time + edited + pin/save indicators below bubble (iPhone style)
            Row(
                modifier = Modifier.padding(top = 3.dp, start = 4.dp, end = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (saved) {
                    Icon(Icons.Filled.Bookmark, contentDescription = null, tint = StudioBlue, modifier = Modifier.size(11.dp))
                    Spacer(Modifier.width(4.dp))
                }
                if (item.pinned) {
                    Icon(Icons.Filled.PushPin, contentDescription = null, tint = StudioBlue, modifier = Modifier.size(11.dp))
                    Spacer(Modifier.width(4.dp))
                }
                item.createdAt?.let {
                    Text(formatTime(it), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (item.edited && !item.isDeleted) {
                    Spacer(Modifier.width(6.dp))
                    Text("edited", fontSize = 11.sp, fontStyle = FontStyle.Italic, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (isMine) {
            Spacer(Modifier.width(8.dp))
            BubbleAvatar(item)
        } else {
            Spacer(Modifier.weight(1f, fill = true))
        }
    }
}

@Composable
private fun BubbleAvatar(item: StudioMessageItem) {
    val photo = item.senderPhotoURL.trim()
    Box(
        modifier = Modifier
            .size(34.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)),
        contentAlignment = Alignment.Center
    ) {
        if (photo.isNotEmpty()) {
            coil.compose.AsyncImage(
                model = photo,
                contentDescription = item.senderLabel(),
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(34.dp).clip(CircleShape)
            )
        } else {
            Text(
                item.senderLabel().take(1).uppercase(),
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp
            )
        }
    }
}

@Composable
private fun ReactionRow(
    item: StudioMessageItem,
    currentUid: String,
    onToggleReaction: (String) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
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
private fun AttachmentCard(item: StudioMessageItem, onImageClick: () -> Unit = {}) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    if (item.isImageAttachment) {
        Surface(
            shape = RoundedCornerShape(10.dp),
            color = MaterialTheme.colorScheme.surfaceVariant,
            modifier = Modifier.clickable(onClick = onImageClick)
        ) {
            Column {
                AsyncImage(
                    model = item.fileURL,
                    contentDescription = item.fileName.ifBlank { t("Image attachment") },
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .widthIn(max = 240.dp)
                        .heightIn(max = 240.dp)
                        .clip(RoundedCornerShape(10.dp))
                )
                if (item.fileName.isNotBlank()) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            item.fileName,
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            modifier = Modifier.weight(1f)
                        )
                        val size = formatFileSize(item.fileSize)
                        if (size.isNotBlank()) {
                            Text(size, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
        return
    }
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
                Text(item.fileName.ifBlank { t("Attachment") }, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1)
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
    attachmentsEnabled: Boolean,
    onClearReply: () -> Unit,
    onSend: (String, List<String>) -> Unit,
    onSendAttachment: (ByteArray, String, String, String, List<String>) -> Unit,
    onTextChanged: () -> Unit,
    onLoadDraft: (String, String) -> String,
    onSaveDraft: (String, String, String) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var draft by remember(threadId) { mutableStateOf(TextFieldValue(onLoadDraft(workspaceId, threadId))) }
    val pendingMentionUids = remember(threadId) { mutableStateOf<List<String>>(emptyList()) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var attachMenuOpen by remember { mutableStateOf(false) }

    val sendUriAsAttachment: (Uri) -> Unit = { uri ->
        scope.launch {
            runCatching {
                val resolver = context.contentResolver
                try { resolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (_: Throwable) {}
                val name = queryDisplayName(uri, resolver) ?: t("Attachment")
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

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri: Uri? -> if (uri != null) sendUriAsAttachment(uri) }

    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri: Uri? -> if (uri != null) sendUriAsAttachment(uri) }

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
                        Text(replyingTo.text.ifBlank { replyingTo.fileName.ifBlank { t("Attachment") } }, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                    }
                    IconButton(onClick = onClearReply) { Icon(Icons.Filled.Close, contentDescription = t("Cancel reply")) }
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
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp)
        ) {
            if (attachmentsEnabled) {
                Box {
                    Surface(
                        shape = CircleShape,
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier
                            .size(44.dp)
                            .clip(CircleShape)
                            .clickable(enabled = !isSending) { attachMenuOpen = true }
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.Filled.Add,
                                contentDescription = t("Attach"),
                                tint = MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.size(22.dp)
                            )
                        }
                    }
                    DropdownMenu(expanded = attachMenuOpen, onDismissRequest = { attachMenuOpen = false }) {
                        DropdownMenuItem(
                            text = { Text(t("Photo Library")) },
                            leadingIcon = { Icon(Icons.Filled.Image, contentDescription = null) },
                            onClick = {
                                attachMenuOpen = false
                                photoPickerLauncher.launch(
                                    androidx.activity.result.PickVisualMediaRequest(
                                        ActivityResultContracts.PickVisualMedia.ImageOnly
                                    )
                                )
                            }
                        )
                        DropdownMenuItem(
                            text = { Text(t("Files")) },
                            leadingIcon = { Icon(Icons.Filled.AttachFile, contentDescription = null) },
                            onClick = {
                                attachMenuOpen = false
                                filePickerLauncher.launch(arrayOf("*/*"))
                            }
                        )
                    }
                }
            }
            // Pill-shaped text field (iPhone style)
            Surface(
                shape = RoundedCornerShape(22.dp),
                color = MaterialTheme.colorScheme.surfaceVariant,
                modifier = Modifier.weight(1f).heightIn(min = 44.dp)
            ) {
                PillTextField(
                    placeholder = t("Message"),
                    value = draft,
                    onValueChange = {
                        draft = it
                        onSaveDraft(workspaceId, threadId, it.text)
                        if (it.text.isNotBlank()) onTextChanged()
                    }
                )
            }
            val canSend = draft.text.trim().isNotEmpty() && !isSending
            Surface(
                shape = CircleShape,
                color = if (canSend) StudioBlue else MaterialTheme.colorScheme.surfaceVariant,
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .clickable(enabled = canSend) {
                        val text = draft.text.trim()
                        if (text.isNotEmpty() && !isSending) {
                            onSend(text, pendingMentionUids.value)
                            draft = TextFieldValue("")
                            pendingMentionUids.value = emptyList()
                            onSaveDraft(workspaceId, threadId, "")
                        }
                    }
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        Icons.AutoMirrored.Filled.Send,
                        contentDescription = t("Send"),
                        tint = if (canSend) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun PillTextField(
    placeholder: String,
    value: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    androidx.compose.foundation.text.BasicTextField(
        value = value,
        onValueChange = onValueChange,
        textStyle = androidx.compose.ui.text.TextStyle(
            color = MaterialTheme.colorScheme.onSurface,
            fontSize = 15.sp
        ),
        cursorBrush = androidx.compose.ui.graphics.SolidColor(StudioBlue),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        maxLines = 5,
        decorationBox = { inner ->
            Box(contentAlignment = Alignment.CenterStart) {
                if (value.text.isEmpty()) {
                    Text(placeholder, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 15.sp)
                }
                inner()
            }
        }
    )
}

@Composable
private fun NewConversationDialog(
    teamMembers: List<StudioMessageTeamMember>,
    allowDirect: Boolean,
    allowGroup: Boolean,
    onDismiss: () -> Unit,
    onCreateDirect: (String) -> Unit,
    onCreateGroup: (List<String>, String) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var groupMode by remember(allowDirect, allowGroup) { mutableStateOf(!allowDirect && allowGroup) }
    var selectedUids by remember { mutableStateOf<Set<String>>(emptySet()) }
    var groupTitle by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (groupMode) t("New group") else t("New direct message")) },
        text = {
            Column(modifier = Modifier.fillMaxWidth().heightIn(max = 400.dp)) {
                if (allowDirect && allowGroup) {
                    Row(modifier = Modifier.padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        FilterChip(selected = !groupMode, onClick = { groupMode = false; selectedUids = emptySet() }, label = { Text(t("Direct")) })
                        FilterChip(selected = groupMode, onClick = { groupMode = true }, label = { Text(t("Group")) })
                    }
                }
                if (groupMode) {
                    OutlinedTextField(
                        value = groupTitle,
                        onValueChange = { groupTitle = it },
                        placeholder = { Text(t("Group title (optional)")) },
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
                                    if (groupMode) {
                                        selectedUids = if (selectedUids.contains(member.id)) selectedUids - member.id else selectedUids + member.id
                                    } else {
                                        onCreateDirect(member.id)
                                    }
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
            if (groupMode) {
                TextButton(
                    onClick = { onCreateGroup(selectedUids.toList(), groupTitle.trim()) },
                    enabled = selectedUids.size >= 2
                ) { Text(t("Create")) }
            } else {
                Text(t("Select a person to start messaging."), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Cancel")) } }
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
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
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
                    TextButton(onClick = onRename) { Text(t("Rename")) }
                    TextButton(onClick = onAddMembers) { Text("Add") }
                    TextButton(onClick = onLeave) { Text(t("Leave")) }
                }
                TextButton(onClick = onDismiss) { Text(t("Close")) }
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
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var title by remember { mutableStateOf(initialTitle) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(t("Rename group")) },
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
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Cancel")) } }
    )
}

@Composable
private fun AddMembersDialog(
    availableMembers: List<StudioMessageTeamMember>,
    onDismiss: () -> Unit,
    onConfirm: (List<String>) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var selected by remember { mutableStateOf<Set<String>>(emptySet()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(t("Add people")) },
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
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Cancel")) } }
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
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(t("Forward to…")) },
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
        confirmButton = { TextButton(onClick = onDismiss) { Text(t("Cancel")) } }
    )
}

@Composable
private fun EditMessageDialog(
    initialText: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var text by remember { mutableStateOf(initialText) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(t("Edit message")) },
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
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Cancel")) } }
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

private fun threadPreview(thread: StudioMessageThread, lang: String): String {
    val text = thread.lastMessageText.trim()
    if (text.isNotBlank()) return text
    if (thread.isTeamThread) return uk.co.eggcraft.studioflow.language.studioT("Workspace conversation", lang)
    return uk.co.eggcraft.studioflow.language.studioT("Tap to start the conversation", lang)
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


private fun loadDeletedThreadMarkers(preferences: SharedPreferences, key: String): Map<String, Long> {
    val raw = preferences.getString(key, "").orEmpty()
    if (raw.isBlank()) return emptyMap()
    return runCatching {
        val json = JSONObject(raw)
        val markers = mutableMapOf<String, Long>()
        json.keys().forEach { threadId ->
            val value = json.optLong(threadId, 0L)
            if (value > 0L) markers[threadId] = value
        }
        markers.toMap()
    }.getOrDefault(emptyMap())
}

private fun persistDeletedThreadMarkers(preferences: SharedPreferences, key: String, markers: Map<String, Long>) {
    val json = JSONObject()
    markers.forEach { (threadId, value) -> json.put(threadId, value) }
    preferences.edit().putString(key, json.toString()).apply()
}


private fun firestoreLongMap(value: Any?): Map<String, Long> {
    val raw = value as? Map<*, *> ?: return emptyMap()
    return raw.mapNotNull { (key, marker) ->
        val threadId = key?.toString().orEmpty()
        val time = (marker as? Number)?.toLong() ?: return@mapNotNull null
        if (threadId.isBlank() || threadId == "team") null else threadId to time
    }.toMap()
}
