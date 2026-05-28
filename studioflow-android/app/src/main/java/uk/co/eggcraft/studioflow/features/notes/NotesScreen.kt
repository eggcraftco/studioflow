package uk.co.eggcraft.studioflow.features.notes

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.foundation.gestures.awaitFirstDown
import kotlinx.coroutines.withTimeout
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.zIndex
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.automirrored.filled.ViewList
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DragIndicator
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.foundation.layout.offset
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Unarchive
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Palette
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.ui.draw.clip
import androidx.compose.ui.window.Dialog
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.staggeredgrid.items as staggeredItems
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Menu
import kotlinx.coroutines.launch
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uk.co.eggcraft.studioflow.data.model.StudioKeepNote
import uk.co.eggcraft.studioflow.features.shell.StudioFlowUiState
import uk.co.eggcraft.studioflow.ui.theme.StudioBlue
import java.util.Date
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotesScreen(
    state: StudioFlowUiState,
    onSetSearch: (String) -> Unit,
    onSetSection: (String) -> Unit,
    onSave: (StudioKeepNote) -> Unit,
    onDelete: (String) -> Unit,
    onUploadImage: (StudioKeepNote, ByteArray, String, String) -> Unit = { _, _, _, _ -> },
    onInviteCollab: (StudioKeepNote, String, String) -> Unit = { _, _, _ -> },
    onRemoveCollab: (String, String, String) -> Unit = { _, _, _ -> },
    onAcceptInvite: (String) -> Unit = {},
    onDeclineInvite: (String) -> Unit = {},
    onRefreshInvites: () -> Unit = {}
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var topTab by rememberSaveable { mutableStateOf("personal") }
    var labelFilter by rememberSaveable { mutableStateOf<String?>(null) }
    var sortMode by rememberSaveable { mutableStateOf("manual") }
    val section = state.keepNotesSection.ifBlank { "notes" }
    val allLabels = remember(state.keepNotes) {
        state.keepNotes.flatMap { it.labels }.distinct().sorted()
    }
    val query = state.keepNotesSearch.trim().lowercase()
    val all = state.keepNotes
    val visible = remember(all, section, query, sortMode, labelFilter) {
        all.filter { note ->
            when (section) {
                "archive" -> !note.isDeleted && note.isArchived
                "trash" -> note.isDeleted
                "reminders" -> !note.isDeleted && !note.isArchived && note.reminderDate != null
                else -> !note.isDeleted && !note.isArchived
            }
        }.filter { note ->
            if (query.isEmpty()) true
            else note.title.lowercase().contains(query) || note.text.lowercase().contains(query)
        }.filter { note ->
            labelFilter?.let { note.labels.contains(it) } ?: true
        }.sortedWith(
            compareByDescending<StudioKeepNote> { it.isPinned }
                .then(
                    when {
                        sortMode == "title" -> compareBy { it.title.lowercase() }
                        sortMode == "date" -> compareByDescending<StudioKeepNote> { it.updatedAt?.time ?: 0L }
                        section == "notes" -> compareBy { it.manualOrder.takeIf { v -> v != 0.0 } ?: (it.updatedAt?.time?.toDouble() ?: 0.0) }
                        else -> compareByDescending<StudioKeepNote> { it.updatedAt?.time ?: 0L }
                    }
                )
        )
    }
    val pinned = visible.filter { it.isPinned }
    val others = visible.filter { !it.isPinned }

    var editingNote by remember { mutableStateOf<StudioKeepNote?>(null) }
    var viewerImageUrl by remember { mutableStateOf<String?>(null) }
    var gridMode by rememberSaveable { mutableStateOf(true) }
    var dateForNote by remember { mutableStateOf<StudioKeepNote?>(null) }
    var collabForNote by remember { mutableStateOf<StudioKeepNote?>(null) }
    val clipboard = androidx.compose.ui.platform.LocalClipboardManager.current

    fun duplicateNote(note: StudioKeepNote) {
        val copy = note.copy(
            id = java.util.UUID.randomUUID().toString(),
            createdAt = Date(),
            updatedAt = Date(),
            manualOrder = System.currentTimeMillis().toDouble(),
            isPinned = false
        )
        onSave(copy)
    }
    fun copyText(note: StudioKeepNote) {
        val text = listOf(note.title, note.text).filter { it.isNotBlank() }.joinToString("\n")
        if (text.isNotEmpty()) clipboard.setText(androidx.compose.ui.text.AnnotatedString(text))
    }
    fun toggleLabelOnNote(note: StudioKeepNote, label: String) {
        val has = note.labels.contains(label)
        val next = if (has) note.labels - label else note.labels + label
        onSave(note.copy(labels = next, updatedAt = Date()))
    }

    // Multi-select state (Mac/Web parity)
    var selectedIds by remember { mutableStateOf(setOf<String>()) }
    val selectionActive = selectedIds.isNotEmpty()
    fun toggleSelect(id: String) {
        selectedIds = if (selectedIds.contains(id)) selectedIds - id else selectedIds + id
    }
    fun clearSelection() { selectedIds = emptySet() }
    fun bulkApply(transform: (StudioKeepNote) -> StudioKeepNote) {
        state.keepNotes.filter { selectedIds.contains(it.id) }.forEach { onSave(transform(it)) }
        clearSelection()
    }
    fun bulkDeleteForever() {
        selectedIds.forEach { onDelete(it) }
        clearSelection()
    }

    // Drag-and-drop reorder state (long-press + drag)
    val cardBounds = remember { mutableStateMapOf<String, androidx.compose.ui.geometry.Rect>() }
    var draggingNoteId by remember { mutableStateOf<String?>(null) }
    var dragOffset by remember { mutableStateOf(androidx.compose.ui.geometry.Offset.Zero) }
    var dragStartCenter by remember { mutableStateOf(androidx.compose.ui.geometry.Offset.Zero) }

    fun reorderTo(draggedId: String, targetId: String) {
        if (draggedId == targetId) return
        if (section != "notes") return
        val active = state.keepNotes
            .filter { !it.isDeleted && !it.isArchived && !it.isPinned }
            .sortedBy { it.manualOrder.takeIf { v -> v != 0.0 } ?: (it.updatedAt?.time?.toDouble() ?: 0.0) }
            .toMutableList()
        val from = active.indexOfFirst { it.id == draggedId }
        val to = active.indexOfFirst { it.id == targetId }
        if (from < 0 || to < 0) return
        val moved = active.removeAt(from)
        active.add(to, moved)
        val ts = System.currentTimeMillis().toDouble()
        active.forEachIndexed { idx, n -> onSave(n.copy(manualOrder = ts + idx, updatedAt = Date())) }
    }

    // Reorder helper — moves note up/down in active list and rewrites manualOrder
    // for every active note so Mac/Web/Android stay in sync.
    fun moveCard(note: StudioKeepNote, direction: Int) {
        if (section != "notes") return
        val active = state.keepNotes
            .filter { !it.isDeleted && !it.isArchived && !it.isPinned }
            .sortedBy { it.manualOrder.takeIf { v -> v != 0.0 } ?: (it.updatedAt?.time?.toDouble() ?: 0.0) }
            .toMutableList()
        val from = active.indexOfFirst { it.id == note.id }
        if (from < 0) return
        val to = (from + direction).coerceIn(0, active.lastIndex)
        if (to == from) return
        val moved = active.removeAt(from)
        active.add(to, moved)
        val ts = System.currentTimeMillis().toDouble()
        active.forEachIndexed { idx, n ->
            onSave(n.copy(manualOrder = ts + idx, updatedAt = Date()))
        }
    }
    val drawerState = androidx.compose.material3.rememberDrawerState(androidx.compose.material3.DrawerValue.Closed)
    val scope = androidx.compose.runtime.rememberCoroutineScope()

    // Counts for sidebar badges (Mac/web parity)
    val counts = remember(state.keepNotes) {
        var noteN = 0; var rem = 0; var arc = 0; var trsh = 0
        val labelMap = mutableMapOf<String, Int>()
        state.keepNotes.forEach { n ->
            when {
                n.isDeleted -> trsh++
                n.isArchived -> arc++
                else -> {
                    noteN++
                    if (n.reminderDate != null) rem++
                    n.labels.forEach { l -> labelMap[l] = (labelMap[l] ?: 0) + 1 }
                }
            }
        }
        mapOf("notes" to noteN, "reminders" to rem, "archive" to arc, "trash" to trsh) to labelMap
    }
    val (sectionCounts, labelCounts) = counts

    @Composable
    fun SidebarItem(
        label: String,
        count: Int = 0,
        selected: Boolean,
        onClick: () -> Unit
    ) {
        androidx.compose.material3.NavigationDrawerItem(
            label = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(label, fontWeight = if (selected) FontWeight.ExtraBold else FontWeight.Bold, modifier = Modifier.weight(1f))
                    if (count > 0) {
                        Text(
                            count.toString(),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            },
            selected = selected,
            onClick = onClick
        )
    }

    @Composable
    fun SidebarContent(closeDrawer: () -> Unit) {
        Column(modifier = Modifier.padding(16.dp).fillMaxSize()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier.size(36.dp).clip(RoundedCornerShape(50)).background(Color(0xFFFFF3B0)),
                    contentAlignment = Alignment.Center
                ) { Text("💡", fontSize = 18.sp) }
                Spacer(modifier = Modifier.width(10.dp))
                Text("Notes", fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
            }
            Spacer(modifier = Modifier.height(20.dp))

            SidebarItem("Notes", sectionCounts["notes"] ?: 0, topTab == "personal" && section == "notes" && labelFilter == null) {
                topTab = "personal"; onSetSection("notes"); labelFilter = null; closeDrawer()
            }
            SidebarItem(t("Reminders"), sectionCounts["reminders"] ?: 0, topTab == "personal" && section == "reminders") {
                topTab = "personal"; onSetSection("reminders"); labelFilter = null; closeDrawer()
            }
            SidebarItem(t("Project Notes"), 0, topTab == "project") {
                topTab = "project"; closeDrawer()
            }
            if (allLabels.isNotEmpty()) {
                Spacer(modifier = Modifier.height(10.dp))
                Text(t("LABELS"), fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 14.dp))
                Spacer(modifier = Modifier.height(4.dp))
                allLabels.forEach { l ->
                    SidebarItem("#$l", labelCounts[l] ?: 0, labelFilter == l) {
                        topTab = "personal"; onSetSection("notes"); labelFilter = l; closeDrawer()
                    }
                }
            }
            Spacer(modifier = Modifier.height(10.dp))
            SidebarItem(t("Archive"), sectionCounts["archive"] ?: 0, topTab == "personal" && section == "archive") {
                topTab = "personal"; onSetSection("archive"); labelFilter = null; closeDrawer()
            }
            SidebarItem(t("Trash"), sectionCounts["trash"] ?: 0, topTab == "personal" && section == "trash") {
                topTab = "personal"; onSetSection("trash"); labelFilter = null; closeDrawer()
            }
        }
    }

    val mainColumn: @Composable (showHamburger: Boolean) -> Unit = { showHamburger ->
    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        // Compact toolbar: hamburger + title + search
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (showHamburger) {
                IconButton(onClick = { scope.launch { drawerState.open() } }) {
                    Icon(Icons.Filled.Menu, contentDescription = "Menu")
                }
            }
            Box(
                modifier = Modifier.size(32.dp).clip(RoundedCornerShape(50)).background(Color(0xFFFFF3B0)),
                contentAlignment = Alignment.Center
            ) { Text("💡", fontSize = 16.sp) }
            Spacer(modifier = Modifier.width(8.dp))
            Text("Notes", fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, modifier = Modifier.weight(1f))
            // Inline compact search (iPhone-style pill)
            Surface(
                shape = RoundedCornerShape(50),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                modifier = Modifier.weight(1f).heightIn(min = 34.dp)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Filled.Search,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    androidx.compose.foundation.text.BasicTextField(
                        value = state.keepNotesSearch,
                        onValueChange = onSetSearch,
                        singleLine = true,
                        textStyle = androidx.compose.ui.text.TextStyle(
                            fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.onSurface
                        ),
                        cursorBrush = androidx.compose.ui.graphics.SolidColor(StudioBlue),
                        modifier = Modifier.weight(1f).heightIn(min = 28.dp),
                        decorationBox = { inner ->
                            if (state.keepNotesSearch.isEmpty()) {
                                Text("Search", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            inner()
                        }
                    )
                }
            }
            // Refresh button (re-fetches collaboration invites)
            IconButton(onClick = { onRefreshInvites() }) {
                Icon(Icons.Filled.Refresh, contentDescription = t("Refresh"))
            }
            // Grid / List toggle (Mac parity)
            IconButton(onClick = { gridMode = !gridMode }) {
                Icon(
                    if (gridMode) Icons.AutoMirrored.Filled.ViewList else Icons.Filled.GridView,
                    contentDescription = if (gridMode) t("List view") else t("Grid view")
                )
            }
            // Sort menu
            var sortMenuOpen by remember { mutableStateOf(false) }
            Box {
                IconButton(onClick = { sortMenuOpen = true }) {
                    Icon(Icons.AutoMirrored.Filled.Sort, contentDescription = "Sort")
                }
                androidx.compose.material3.DropdownMenu(expanded = sortMenuOpen, onDismissRequest = { sortMenuOpen = false }) {
                    listOf("manual" to t("Manual order"), "date" to t("Recently updated"), "title" to t("Title (A–Z)")).forEach { (key, label) ->
                        androidx.compose.material3.DropdownMenuItem(
                            text = { Text("${if (sortMode == key) "✓ " else ""}$label", fontWeight = if (sortMode == key) FontWeight.Bold else FontWeight.Normal) },
                            onClick = { sortMode = key; sortMenuOpen = false }
                        )
                    }
                }
            }
        }
        androidx.compose.material3.HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

        // Bulk action bar (Mac/Web parity)
        if (selectionActive) {
            Surface(
                color = Color(0xFFFEF3C7),
                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFFDE68A)),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)
            ) {
                Row(modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { clearSelection() }) {
                        Icon(Icons.Filled.Close, contentDescription = t("Cancel selection"))
                    }
                    Text("${selectedIds.size} selected", fontWeight = FontWeight.Bold, color = Color(0xFF374151))
                    Spacer(modifier = Modifier.weight(1f))
                    if (section == "trash") {
                        TextButton(onClick = { bulkApply { it.copy(isDeleted = false, isArchived = false, updatedAt = Date()) } }) {
                            Text(t("Restore to Notes"), fontWeight = FontWeight.Bold)
                        }
                        TextButton(onClick = { bulkDeleteForever() }) {
                            Text(t("Delete forever"), fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error)
                        }
                    } else if (section == "archive") {
                        TextButton(onClick = { bulkApply { it.copy(isArchived = false, updatedAt = Date()) } }) {
                            Text(t("Unarchive"), fontWeight = FontWeight.Bold)
                        }
                        TextButton(onClick = { bulkApply { it.copy(isDeleted = true, updatedAt = Date()) } }) {
                            Text(t("Move to trash"), fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error)
                        }
                    } else {
                        TextButton(onClick = { bulkApply { it.copy(isArchived = true, updatedAt = Date()) } }) {
                            Text(t("Archive"), fontWeight = FontWeight.Bold)
                        }
                        TextButton(onClick = { bulkApply { it.copy(isDeleted = true, updatedAt = Date()) } }) {
                            Text(t("Move to trash"), fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }

        // Big section title
        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) {
            val pageTitle = when {
                topTab == "project" -> t("Project Notes")
                section == "reminders" -> t("Reminders")
                section == "archive" -> t("Archive")
                section == "trash" -> t("Trash")
                labelFilter != null -> "#$labelFilter"
                else -> "Notes"
            }
            Text(pageTitle, fontSize = 28.sp, fontWeight = FontWeight.ExtraBold)
            Text(
                "${if (topTab == "project") "—" else "${visible.size} note${if (visible.size == 1) "" else "s"}"}",
                fontSize = 13.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        if (topTab == "project") {
            ProjectNotesList(state)
            return@Column
        }

        // Collaboration invitations (Mac parity)
        if (state.keepCollaborationInvites.isNotEmpty() && topTab == "personal") {
            Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(t("COLLABORATION INVITATIONS"), fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 4.dp))
                state.keepCollaborationInvites.forEach { invite ->
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = MaterialTheme.colorScheme.surface,
                        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.Top) {
                            Box(
                                modifier = Modifier.size(36.dp).clip(androidx.compose.foundation.shape.CircleShape).background(StudioBlue.copy(alpha = 0.12f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(Icons.Filled.PersonAdd, contentDescription = null, tint = StudioBlue, modifier = Modifier.size(18.dp))
                            }
                            Spacer(modifier = Modifier.width(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(invite.title.ifBlank { t("Untitled note") }, fontWeight = FontWeight.ExtraBold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text("${invite.sourceEmail} invited you to collaborate on this note.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                if (invite.text.isNotBlank()) {
                                    Text(invite.text, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                }
                            }
                            Spacer(modifier = Modifier.width(8.dp))
                            TextButton(onClick = { onDeclineInvite(invite.id) }) { Text(t("Decline"), fontWeight = FontWeight.Bold) }
                            TextButton(onClick = { onAcceptInvite(invite.id) }) { Text(t("Accept"), fontWeight = FontWeight.Bold, color = StudioBlue) }
                        }
                    }
                }
            }
        }

        // Quick "Take a note..." input
        Surface(
            shape = RoundedCornerShape(14.dp),
            color = MaterialTheme.colorScheme.surface,
            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            onClick = {
                editingNote = StudioKeepNote(
                    id = UUID.randomUUID().toString(),
                    createdAt = Date(),
                    updatedAt = Date(),
                    manualOrder = System.currentTimeMillis().toDouble()
                )
            },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Take a note…",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 15.sp,
                    modifier = Modifier.weight(1f)
                )
                Icon(Icons.Filled.Add, contentDescription = t("New Note"), tint = StudioBlue)
            }
        }

        // Section actions row (Empty Trash)
        if (section == "trash" && visible.isNotEmpty()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.End
            ) {
                TextButton(onClick = { visible.forEach { onDelete(it.id) } }) {
                    Text(t("Empty Trash"), color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.ExtraBold)
                }
            }
        }

        // Helper to build a NoteCard with all wired callbacks + drag-reorder
        @Composable
        fun renderCard(note: StudioKeepNote) {
            val isDragging = draggingNoteId == note.id
            val canDrag = section == "notes" && !note.isPinned && !note.isDeleted && !note.isArchived
            val openEditor: () -> Unit = { editingNote = note }
            val onClick = openEditor
            val dragHandle: Modifier = if (canDrag) {
                Modifier.pointerInput(note.id) {
                    awaitPointerEventScope {
                        while (true) {
                            val down = awaitFirstDown(requireUnconsumed = false)
                            down.consume()
                            val b = cardBounds[note.id]
                            dragStartCenter = if (b != null)
                                androidx.compose.ui.geometry.Offset((b.left + b.right) / 2f, (b.top + b.bottom) / 2f)
                            else androidx.compose.ui.geometry.Offset.Zero
                            dragOffset = androidx.compose.ui.geometry.Offset.Zero
                            draggingNoteId = note.id
                            var dragging = true
                            while (dragging) {
                                val ev = awaitPointerEvent()
                                val change = ev.changes.firstOrNull { it.id == down.id }
                                if (change == null || !change.pressed) { dragging = false; break }
                                dragOffset += change.positionChange()
                                change.consume()
                            }
                            val finger = dragStartCenter + dragOffset
                            val target = cardBounds.entries.firstOrNull { (id, rect) -> id != note.id && rect.contains(finger) }?.key
                            if (target != null) reorderTo(note.id, target)
                            draggingNoteId = null
                            dragOffset = androidx.compose.ui.geometry.Offset.Zero
                        }
                    }
                }
            } else Modifier
            Box(
                modifier = Modifier
                    .onGloballyPositioned { coords ->
                        val pos = coords.positionInRoot()
                        val size = coords.size
                        cardBounds[note.id] = androidx.compose.ui.geometry.Rect(
                            pos.x, pos.y, pos.x + size.width, pos.y + size.height
                        )
                    }
                    .graphicsLayer {
                        if (isDragging) {
                            translationX = dragOffset.x
                            translationY = dragOffset.y
                            scaleX = 1.03f
                            scaleY = 1.03f
                            alpha = 0.92f
                            shadowElevation = 16f
                        }
                    }
                    .zIndex(if (isDragging) 10f else 0f)
            ) {
                NoteCard(note, onClick = { editingNote = note }, onTogglePin = {
                    onSave(note.copy(isPinned = !note.isPinned, updatedAt = Date()))
                }, onArchive = {
                    onSave(note.copy(isArchived = !note.isArchived, updatedAt = Date()))
                }, onDelete = {
                    if (note.isDeleted) onDelete(note.id)
                    else onSave(note.copy(isDeleted = true, updatedAt = Date()))
                }, onRestore = {
                    onSave(note.copy(isDeleted = false, updatedAt = Date()))
                }, onOpenImage = { viewerImageUrl = it },
                onChangeColor = { c -> onSave(note.copy(colorName = c, updatedAt = Date())) },
                showFullActionRow = !showHamburger,
                onMoveUp = { moveCard(note, -1) },
                onMoveDown = { moveCard(note, +1) },
                canReorder = canDrag,
                dragHandleModifier = dragHandle,
                isSelected = selectedIds.contains(note.id),
                selectionActive = selectionActive,
                onToggleSelect = { toggleSelect(note.id) },
                onSetReminder = { d -> onSave(note.copy(reminderDate = d, updatedAt = Date())) },
                onPickDate = { dateForNote = note },
                onToggleLabel = { l -> toggleLabelOnNote(note, l) },
                onDuplicate = { duplicateNote(note) },
                onCopy = { copyText(note) },
                onOpenCollaborators = { collabForNote = note },
                allLabelsList = allLabels,
                teamMembers = state.messageTeamMembers)

                // Multi-select checkmark overlay (top-left), visible when hovered/selected/in selection mode
                if ((selectedIds.contains(note.id) || selectionActive) && !isDragging) {
                    androidx.compose.material3.FilledIconButton(
                        onClick = { toggleSelect(note.id) },
                        colors = androidx.compose.material3.IconButtonDefaults.filledIconButtonColors(
                            containerColor = if (selectedIds.contains(note.id)) StudioBlue else Color(0xFF111827)
                        ),
                        modifier = Modifier.align(Alignment.TopStart).offset(x = (-6).dp, y = (-6).dp).size(24.dp)
                    ) {
                        Icon(Icons.Filled.Check, contentDescription = t("Select"), tint = Color.White, modifier = Modifier.size(14.dp))
                    }
                }
            }
        }

        if (gridMode) {
            // GRID — Reorderable staggered grid (long-press on card body → drag)
            androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid(
                columns = androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells.Adaptive(minSize = 160.dp),
                modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp),
                verticalItemSpacing = 10.dp,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                contentPadding = PaddingValues(vertical = 8.dp)
            ) {
                if (pinned.isNotEmpty()) {
                    item(key = "__pinned_header", span = androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan.FullLine) {
                        Text(t("PINNED"), fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 4.dp, top = 4.dp))
                    }
                    staggeredItems(pinned, key = { it.id }) { renderCard(it) }
                    item(key = "__others_header", span = androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan.FullLine) {
                        Text(t("OTHERS"), fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 4.dp, top = 8.dp))
                    }
                }
                staggeredItems(others, key = { it.id }) { renderCard(it) }
                if (visible.isEmpty()) {
                    item(key = "__empty", span = androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan.FullLine) {
                        Box(modifier = Modifier.fillMaxWidth().padding(top = 60.dp), contentAlignment = Alignment.Center) {
                            Text(when (section) { "archive" -> t("No archived notes."); "trash" -> t("Trash is empty."); "reminders" -> t("No reminders."); else -> t("Tap + to create your first note.") }, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
            return@Column
        }

        // LIST — one card per row
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            contentPadding = PaddingValues(vertical = 8.dp)
        ) {
            if (pinned.isNotEmpty()) {
                item {
                    Text(
                        t("PINNED"),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(start = 4.dp, top = 4.dp)
                    )
                }
                items(pinned, key = { it.id }) { note -> renderCard(note) }
                item {
                    Text(
                        t("OTHERS"),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(start = 4.dp, top = 8.dp)
                    )
                }
            }
            items(others, key = { it.id }) { note -> renderCard(note) }
            if (visible.isEmpty()) {
                item {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(top = 60.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            when (section) {
                                "archive" -> t("No archived notes.")
                                "trash" -> t("Trash is empty.")
                                "reminders" -> t("No reminders.")
                                else -> t("Tap + to create your first note.")
                            },
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
    }

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val isWide = maxWidth >= 600.dp
        if (isWide) {
            Row(modifier = Modifier.fillMaxSize()) {
                androidx.compose.material3.PermanentDrawerSheet(modifier = Modifier.width(240.dp)) {
                    SidebarContent(closeDrawer = {})
                }
                androidx.compose.material3.VerticalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Box(modifier = Modifier.weight(1f).fillMaxHeight()) {
                    mainColumn(false)
                }
            }
        } else {
            androidx.compose.material3.ModalNavigationDrawer(
                drawerState = drawerState,
                drawerContent = {
                    androidx.compose.material3.ModalDrawerSheet {
                        SidebarContent(closeDrawer = { scope.launch { drawerState.close() } })
                    }
                }
            ) {
                mainColumn(true)
            }
        }
    }

    viewerImageUrl?.let { url ->
        Dialog(onDismissRequest = { viewerImageUrl = null }) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.92f))
                    .clickable { viewerImageUrl = null },
                contentAlignment = Alignment.Center
            ) {
                coil.compose.AsyncImage(
                    model = url,
                    contentDescription = null,
                    modifier = Modifier.fillMaxWidth(),
                    contentScale = androidx.compose.ui.layout.ContentScale.Fit
                )
            }
        }
    }

    dateForNote?.let { note ->
        val pickerState = androidx.compose.material3.rememberDatePickerState(initialSelectedDateMillis = note.reminderDate?.time ?: System.currentTimeMillis())
        androidx.compose.material3.DatePickerDialog(
            onDismissRequest = { dateForNote = null },
            confirmButton = {
                TextButton(onClick = {
                    pickerState.selectedDateMillis?.let { onSave(note.copy(reminderDate = Date(it), updatedAt = Date())) }
                    dateForNote = null
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { dateForNote = null }) { Text(t("Cancel")) } }
        ) { androidx.compose.material3.DatePicker(state = pickerState) }
    }

    collabForNote?.let { note ->
        var emailInput by remember(note.id) { mutableStateOf("") }
        var collabs by remember(note.id) { mutableStateOf(note.collaboratorEmails) }
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { collabForNote = null },
            title = { Text(t("Collaborators"), fontWeight = FontWeight.ExtraBold) },
            text = {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = emailInput,
                            onValueChange = { emailInput = it },
                            placeholder = { Text(t("Email")) },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        TextButton(onClick = {
                            val e = emailInput.trim().lowercase()
                            if (e.isNotEmpty() && "@" in e && !collabs.contains(e)) {
                                collabs = collabs + e
                                emailInput = ""
                            }
                        }) { Text("Add") }
                    }
                    if (collabs.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            collabs.forEach { e ->
                                InputChip(
                                    selected = false,
                                    onClick = { collabs = collabs - e },
                                    label = { Text(e, fontSize = 11.sp) },
                                    trailingIcon = { Icon(Icons.Filled.Close, null, modifier = Modifier.size(14.dp)) }
                                )
                            }
                        }
                    } else {
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(t("No collaborators yet."), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val previous = note.collaboratorEmails.toSet()
                    val nextSet = collabs.toSet()
                    val added = nextSet - previous
                    val removed = previous - nextSet
                    onSave(note.copy(collaboratorEmails = collabs, updatedAt = Date()))
                    added.forEach { email ->
                        val member = state.messageTeamMembers.firstOrNull { it.email.equals(email, ignoreCase = true) }
                        onInviteCollab(note, member?.id.orEmpty(), email)
                    }
                    removed.forEach { email ->
                        val member = state.messageTeamMembers.firstOrNull { it.email.equals(email, ignoreCase = true) }
                        onRemoveCollab(note.id, member?.id.orEmpty(), email)
                    }
                    collabForNote = null
                }) { Text("Save", fontWeight = FontWeight.ExtraBold) }
            },
            dismissButton = { TextButton(onClick = { collabForNote = null }) { Text(t("Cancel")) } }
        )
    }

    editingNote?.let { note ->
        NoteEditorDialog(
            note = note,
            onDismiss = { editingNote = null },
            onSave = { updated ->
                onSave(updated.copy(updatedAt = Date()))
                editingNote = null
            },
            onPickImage = { bytes, mime, name -> onUploadImage(note, bytes, mime, name) }
        )
    }
}

@Composable
private fun NoteCard(
    note: StudioKeepNote,
    onClick: () -> Unit,
    onTogglePin: () -> Unit,
    onArchive: () -> Unit,
    onDelete: () -> Unit,
    onRestore: () -> Unit = {},
    onOpenImage: (String) -> Unit = {},
    onChangeColor: (String) -> Unit = {},
    onSetReminder: (Date?) -> Unit = {},
    onPickDate: () -> Unit = {},
    onToggleLabel: (String) -> Unit = {},
    onDuplicate: () -> Unit = {},
    onCopy: () -> Unit = {},
    onOpenCollaborators: () -> Unit = {},
    allLabelsList: List<String> = emptyList(),
    showFullActionRow: Boolean = false,
    onMoveUp: () -> Unit = {},
    onMoveDown: () -> Unit = {},
    canReorder: Boolean = false,
    dragHandleModifier: Modifier = Modifier,
    isSelected: Boolean = false,
    selectionActive: Boolean = false,
    onToggleSelect: () -> Unit = {},
    teamMembers: List<uk.co.eggcraft.studioflow.data.model.StudioMessageTeamMember> = emptyList()
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = colorForNote(note.colorName),
        border = androidx.compose.foundation.BorderStroke(if (isSelected) 2.dp else 1.dp, if (isSelected) StudioBlue else MaterialTheme.colorScheme.outlineVariant),
        onClick = { if (selectionActive) onToggleSelect() else onClick() },
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (note.title.isNotBlank()) {
                    Text(
                        note.title,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 17.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                } else Spacer(modifier = Modifier.weight(1f))
                if (showFullActionRow || note.isPinned) {
                    IconButton(onClick = onTogglePin, modifier = Modifier.size(32.dp)) {
                        Icon(
                            if (note.isPinned) Icons.Filled.PushPin else Icons.Outlined.PushPin,
                            contentDescription = if (note.isPinned) t("Unpin") else "Pin",
                            modifier = Modifier.size(18.dp),
                            tint = if (note.isPinned) StudioBlue else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
            val firstImageUrl = note.links.firstOrNull { url ->
                url.contains("/note_images/") || url.lowercase().let {
                    it.endsWith(".jpg") || it.endsWith(".jpeg") || it.endsWith(".png") || it.endsWith(".webp") || it.endsWith(".heic") || it.endsWith(".heif") || it.contains("?")
                }
            }
            if (firstImageUrl != null) {
                coil.compose.AsyncImage(
                    model = firstImageUrl,
                    contentDescription = null,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 100.dp, max = 220.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .clickable { onOpenImage(firstImageUrl) },
                    contentScale = androidx.compose.ui.layout.ContentScale.Crop
                )
                Spacer(modifier = Modifier.height(6.dp))
            }
            if (note.text.isNotBlank()) {
                val uriHandler = androidx.compose.ui.platform.LocalUriHandler.current
                val annotated = remember(note.text) { buildLinkifiedText(note.text) }
                androidx.compose.foundation.text.ClickableText(
                    text = annotated,
                    style = androidx.compose.ui.text.TextStyle(
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onSurface
                    ),
                    maxLines = 6,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = if (note.title.isNotBlank()) 4.dp else 0.dp),
                    onClick = { offset ->
                        annotated.getStringAnnotations("URL", offset, offset).firstOrNull()?.let {
                            runCatching { uriHandler.openUri(if (it.item.startsWith("http")) it.item else "https://${it.item}") }
                        } ?: onClick()
                    }
                )
            }
            if (note.labels.isNotEmpty()) {
                androidx.compose.foundation.layout.FlowRow(
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    note.labels.forEach { l ->
                        Surface(shape = RoundedCornerShape(50), color = MaterialTheme.colorScheme.surfaceVariant) {
                            Text(l, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp))
                        }
                    }
                }
            }
            note.reminderDate?.let { d ->
                val isPast = d.before(Date())
                Text(
                    "⏰ ${java.text.DateFormat.getDateInstance().format(d)}",
                    fontSize = 11.sp,
                    fontWeight = if (isPast) FontWeight.ExtraBold else FontWeight.Normal,
                    color = if (isPast) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
            // Collaborator avatar stack (Mac/Web parity) — uses workspace member photos
            if (note.collaboratorEmails.isNotEmpty()) {
                Row(modifier = Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy((-6).dp), verticalAlignment = Alignment.CenterVertically) {
                    note.collaboratorEmails.take(4).forEachIndexed { idx, email ->
                        val member = teamMembers.firstOrNull { it.email.equals(email, ignoreCase = true) }
                        val photoUrl = member?.photoURL?.takeIf { it.isNotBlank() }
                        val initial = (member?.label?.firstOrNull() ?: email.firstOrNull())?.uppercaseChar()?.toString() ?: "?"
                        val hue = ((email.hashCode() and 0x7fffffff) % 360).toFloat()
                        val bg = androidx.compose.ui.graphics.Color.hsv(hue, 0.5f, 0.85f)
                        Box(
                            modifier = Modifier
                                .size(24.dp)
                                .clip(androidx.compose.foundation.shape.CircleShape)
                                .background(bg)
                                .border(1.5.dp, MaterialTheme.colorScheme.surface, androidx.compose.foundation.shape.CircleShape)
                                .zIndex((10 - idx).toFloat()),
                            contentAlignment = Alignment.Center
                        ) {
                            if (photoUrl != null) {
                                coil.compose.AsyncImage(
                                    model = photoUrl,
                                    contentDescription = email,
                                    modifier = Modifier.fillMaxSize().clip(androidx.compose.foundation.shape.CircleShape),
                                    contentScale = androidx.compose.ui.layout.ContentScale.Crop
                                )
                            } else {
                                Text(initial, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = Color.White)
                            }
                        }
                    }
                    if (note.collaboratorEmails.size > 4) {
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("+${note.collaboratorEmails.size - 4}", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            // Active editor indicator (someone else editing now, within 60s)
            val activeEditorEmail = note.activeEditorEmail
            val activeEditorUpdated = note.activeEditorUpdatedAt
            if (activeEditorEmail.isNotBlank() && activeEditorUpdated != null && System.currentTimeMillis() - activeEditorUpdated.time < 60_000) {
                Surface(
                    shape = RoundedCornerShape(50),
                    color = StudioBlue.copy(alpha = 0.12f),
                    modifier = Modifier.padding(top = 4.dp)
                ) {
                    Text(
                        "✎ ${activeEditorEmail} is editing",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = StudioBlue,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                    )
                }
            }
            // Action row: Mac-style on tablet/desktop; minimal in compact for trash/archive only
            if (showFullActionRow) {
                Row(modifier = Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    // Color picker dropdown
                    var colorMenuOpen by remember { mutableStateOf(false) }
                    Box {
                        IconButton(onClick = { colorMenuOpen = true }, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Outlined.Palette, contentDescription = t("Color"), modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        androidx.compose.material3.DropdownMenu(expanded = colorMenuOpen, onDismissRequest = { colorMenuOpen = false }) {
                            Row(modifier = Modifier.padding(8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                listOf("default", "red", "orange", "yellow", "green", "blue", "purple", "pink").forEach { c ->
                                    Box(
                                        modifier = Modifier
                                            .size(24.dp)
                                            .clip(androidx.compose.foundation.shape.CircleShape)
                                            .background(colorForName(c))
                                            .border(if (note.colorName == c) 2.dp else 1.dp, if (note.colorName == c) StudioBlue else MaterialTheme.colorScheme.outlineVariant, androidx.compose.foundation.shape.CircleShape)
                                            .clickable { onChangeColor(c); colorMenuOpen = false }
                                    )
                                }
                            }
                        }
                    }
                    // Reminder picker dropdown
                    var reminderMenuOpen by remember { mutableStateOf(false) }
                    Box {
                        IconButton(onClick = { reminderMenuOpen = true }, modifier = Modifier.size(32.dp)) {
                            Icon(
                                if (note.reminderDate != null) Icons.Filled.Notifications else Icons.Outlined.Notifications,
                                contentDescription = t("Reminder"),
                                modifier = Modifier.size(18.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        androidx.compose.material3.DropdownMenu(expanded = reminderMenuOpen, onDismissRequest = { reminderMenuOpen = false }) {
                            androidx.compose.material3.DropdownMenuItem(text = { Text(t("Tomorrow")) }, onClick = { reminderMenuOpen = false; onSetReminder(Date(System.currentTimeMillis() + 24L * 60 * 60 * 1000)) })
                            androidx.compose.material3.DropdownMenuItem(text = { Text(t("Next week")) }, onClick = { reminderMenuOpen = false; onSetReminder(Date(System.currentTimeMillis() + 7L * 24 * 60 * 60 * 1000)) })
                            androidx.compose.material3.DropdownMenuItem(text = { Text("Pick date…") }, onClick = { reminderMenuOpen = false; onPickDate() })
                            if (note.reminderDate != null) {
                                androidx.compose.material3.DropdownMenuItem(text = { Text(t("Remove reminder"), color = MaterialTheme.colorScheme.error) }, onClick = { reminderMenuOpen = false; onSetReminder(null) })
                            }
                        }
                    }
                    // Collaborators → open inline collaborators dialog
                    IconButton(onClick = onOpenCollaborators, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Filled.PersonAdd, contentDescription = t("Collaborators"), modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    // Archive / Unarchive
                    if (!note.isDeleted) {
                        IconButton(onClick = onArchive, modifier = Modifier.size(32.dp)) {
                            Icon(
                                if (note.isArchived) Icons.Filled.Unarchive else Icons.Filled.Archive,
                                contentDescription = if (note.isArchived) t("Unarchive") else t("Archive"),
                                modifier = Modifier.size(18.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    } else {
                        IconButton(onClick = onRestore, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Filled.Restore, contentDescription = t("Restore"), modifier = Modifier.size(18.dp), tint = StudioBlue)
                        }
                    }
                    // Drag handle — wide area for easy grab
                    if (canReorder) {
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .heightIn(min = 32.dp)
                                .then(dragHandleModifier),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Filled.DragIndicator, contentDescription = t("Drag to reorder"), modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f))
                        }
                    } else {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                    // Overflow menu
                    var moreOpen by remember { mutableStateOf(false) }
                    Box {
                        IconButton(onClick = { moreOpen = true }, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Filled.MoreHoriz, contentDescription = "More", modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        androidx.compose.material3.DropdownMenu(expanded = moreOpen, onDismissRequest = { moreOpen = false }) {
                            androidx.compose.material3.DropdownMenuItem(text = { Text("Edit") }, onClick = { moreOpen = false; onClick() })
                            androidx.compose.material3.DropdownMenuItem(text = { Text(t("Duplicate")) }, onClick = { moreOpen = false; onDuplicate() })
                            androidx.compose.material3.DropdownMenuItem(text = { Text(t("Copy text")) }, onClick = { moreOpen = false; onCopy() })
                            if (allLabelsList.isNotEmpty()) {
                                androidx.compose.material3.HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                                Text(t("LABELS"), fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
                                allLabelsList.forEach { l ->
                                    val on = note.labels.contains(l)
                                    androidx.compose.material3.DropdownMenuItem(
                                        text = { Text("${if (on) "✓ " else ""}$l", fontWeight = if (on) FontWeight.Bold else FontWeight.Normal) },
                                        onClick = { onToggleLabel(l) }
                                    )
                                }
                            }
                            if (canReorder) {
                                androidx.compose.material3.HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                                androidx.compose.material3.DropdownMenuItem(text = { Text(t("Move up")) }, onClick = { moreOpen = false; onMoveUp() })
                                androidx.compose.material3.DropdownMenuItem(text = { Text(t("Move down")) }, onClick = { moreOpen = false; onMoveDown() })
                            }
                            androidx.compose.material3.HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                            if (note.isDeleted) {
                                androidx.compose.material3.DropdownMenuItem(
                                    text = { Text(t("Delete forever"), color = MaterialTheme.colorScheme.error) },
                                    onClick = { moreOpen = false; onDelete() }
                                )
                            } else {
                                androidx.compose.material3.DropdownMenuItem(
                                    text = { Text(t("Move to trash"), color = MaterialTheme.colorScheme.error) },
                                    onClick = { moreOpen = false; onDelete() }
                                )
                            }
                        }
                    }
                }
            } else if (note.isDeleted || note.isArchived) {
                // Compact action row: only when in trash/archive sections (otherwise card stays clean — iPhone parity)
                Row(modifier = Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Spacer(modifier = Modifier.weight(1f))
                    if (note.isDeleted) {
                        IconButton(onClick = { onRestore() }, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Filled.Restore, contentDescription = t("Restore"), modifier = Modifier.size(16.dp), tint = StudioBlue)
                        }
                    } else if (note.isArchived) {
                        IconButton(onClick = onArchive, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Filled.Archive, contentDescription = t("Unarchive"), modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    if (canReorder) {
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .heightIn(min = 32.dp)
                                .then(dragHandleModifier),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Filled.DragIndicator, contentDescription = t("Drag to reorder"), modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f))
                        }
                    }
                    var compactMoreOpen by remember { mutableStateOf(false) }
                    Box {
                        IconButton(onClick = { compactMoreOpen = true }, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Filled.MoreHoriz, contentDescription = "More", modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        androidx.compose.material3.DropdownMenu(expanded = compactMoreOpen, onDismissRequest = { compactMoreOpen = false }) {
                            androidx.compose.material3.DropdownMenuItem(text = { Text("Edit") }, onClick = { compactMoreOpen = false; onClick() })
                            androidx.compose.material3.DropdownMenuItem(text = { Text(t("Duplicate")) }, onClick = { compactMoreOpen = false; onDuplicate() })
                            androidx.compose.material3.DropdownMenuItem(text = { Text(t("Copy text")) }, onClick = { compactMoreOpen = false; onCopy() })
                            if (allLabelsList.isNotEmpty()) {
                                androidx.compose.material3.HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                                Text(t("LABELS"), fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
                                allLabelsList.forEach { l ->
                                    val on = note.labels.contains(l)
                                    androidx.compose.material3.DropdownMenuItem(text = { Text("${if (on) "✓ " else ""}$l", fontWeight = if (on) FontWeight.Bold else FontWeight.Normal) }, onClick = { onToggleLabel(l) })
                                }
                            }
                            if (canReorder) {
                                androidx.compose.material3.HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                                androidx.compose.material3.DropdownMenuItem(text = { Text(t("Move up")) }, onClick = { compactMoreOpen = false; onMoveUp() })
                                androidx.compose.material3.DropdownMenuItem(text = { Text(t("Move down")) }, onClick = { compactMoreOpen = false; onMoveDown() })
                            }
                            androidx.compose.material3.HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                            if (note.isDeleted) {
                                androidx.compose.material3.DropdownMenuItem(text = { Text(t("Delete forever"), color = MaterialTheme.colorScheme.error) }, onClick = { compactMoreOpen = false; onDelete() })
                            } else {
                                androidx.compose.material3.DropdownMenuItem(text = { Text(t("Move to trash"), color = MaterialTheme.colorScheme.error) }, onClick = { compactMoreOpen = false; onDelete() })
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NoteEditorDialog(
    note: StudioKeepNote,
    onDismiss: () -> Unit,
    onSave: (StudioKeepNote) -> Unit,
    onPickImage: (ByteArray, String, String) -> Unit = { _, _, _ -> }
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val context = androidx.compose.ui.platform.LocalContext.current
    val imagePicker = androidx.activity.compose.rememberLauncherForActivityResult(
        contract = androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        if (uri != null) {
            val bytes = runCatching { context.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()
            val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
            val name = uri.lastPathSegment ?: "note_image.jpg"
            if (bytes != null) onPickImage(bytes, mime, name)
        }
    }
    var title by rememberSaveable(note.id) { mutableStateOf(note.title) }
    var text by rememberSaveable(note.id) { mutableStateOf(note.text) }
    var colorName by rememberSaveable(note.id) { mutableStateOf(note.colorName) }
    var reminderDate by remember(note.id) { mutableStateOf(note.reminderDate) }
    var labels by remember(note.id) { mutableStateOf(note.labels) }
    var collabs by remember(note.id) { mutableStateOf(note.collaboratorEmails) }
    val labelsForSave = labels
    val collabsForSave = collabs
    val colors = listOf("default", "red", "orange", "yellow", "green", "blue", "purple", "pink")
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (note.isEmpty) t("New Note") else t("Edit Note"), fontWeight = FontWeight.ExtraBold) },
        text = {
            Column {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("Title") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = text,
                    onValueChange = { text = it },
                    label = { Text("Note") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 120.dp, max = 220.dp)
                )
                Spacer(modifier = Modifier.height(10.dp))
                Text(t("Color"), fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    colors.forEach { c ->
                        Surface(
                            shape = RoundedCornerShape(50),
                            color = colorForName(c),
                            border = androidx.compose.foundation.BorderStroke(
                                if (colorName == c) 2.dp else 1.dp,
                                if (colorName == c) StudioBlue else MaterialTheme.colorScheme.outlineVariant
                            ),
                            onClick = { colorName = c },
                            modifier = Modifier.size(28.dp)
                        ) {}
                    }
                }
                Spacer(modifier = Modifier.height(10.dp))
                Text(t("Reminder"), fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                var datePickerOpen by remember { mutableStateOf(false) }
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    AssistChip(
                        onClick = { reminderDate = Date(System.currentTimeMillis() + 24L * 60 * 60 * 1000) },
                        label = { Text(t("Tomorrow")) }
                    )
                    AssistChip(
                        onClick = { reminderDate = Date(System.currentTimeMillis() + 7L * 24 * 60 * 60 * 1000) },
                        label = { Text(t("Next week")) }
                    )
                    AssistChip(
                        onClick = { datePickerOpen = true },
                        label = { Text(t("Pick date")) }
                    )
                    if (reminderDate != null) {
                        AssistChip(
                            onClick = { reminderDate = null },
                            label = { Text("Clear") }
                        )
                    }
                }
                reminderDate?.let {
                    Text(
                        "Set: ${java.text.DateFormat.getDateInstance().format(it)}",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
                if (datePickerOpen) {
                    val pickerState = rememberDatePickerState(initialSelectedDateMillis = reminderDate?.time ?: System.currentTimeMillis())
                    DatePickerDialog(
                        onDismissRequest = { datePickerOpen = false },
                        confirmButton = {
                            TextButton(onClick = {
                                pickerState.selectedDateMillis?.let { reminderDate = Date(it) }
                                datePickerOpen = false
                            }) { Text("OK") }
                        },
                        dismissButton = { TextButton(onClick = { datePickerOpen = false }) { Text(t("Cancel")) } }
                    ) { DatePicker(state = pickerState) }
                }

                // Labels
                Spacer(modifier = Modifier.height(10.dp))
                Text("Image", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedButton(
                    onClick = {
                        imagePicker.launch(
                            androidx.activity.result.PickVisualMediaRequest(
                                androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia.ImageOnly
                            )
                        )
                    },
                    modifier = Modifier.padding(top = 4.dp)
                ) { Text(t("Add image…")) }
                if (note.links.isNotEmpty()) {
                    Text(
                        "${note.links.size} attachment(s)",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))
                Text(t("Labels"), fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                var labelInput by rememberSaveable(note.id) { mutableStateOf("") }
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = labelInput,
                        onValueChange = { labelInput = it },
                        placeholder = { Text(t("Add label")) },
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                    TextButton(onClick = {
                        val trimmed = labelInput.trim()
                        if (trimmed.isNotEmpty() && !labels.contains(trimmed)) {
                            labels = labels + trimmed
                            labelInput = ""
                        }
                    }) { Text("Add") }
                }
                if (labels.isNotEmpty()) {
                    androidx.compose.foundation.layout.FlowRow(
                        modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        labels.forEach { l ->
                            InputChip(
                                selected = false,
                                onClick = { labels = labels - l },
                                label = { Text(l) },
                                trailingIcon = { Icon(Icons.Filled.Close, null, modifier = Modifier.size(14.dp)) }
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))
                Text(t("Collaborators"), fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                var collabInput by rememberSaveable(note.id) { mutableStateOf("") }
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = collabInput,
                        onValueChange = { collabInput = it },
                        placeholder = { Text(t("Email")) },
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                    TextButton(onClick = {
                        val e = collabInput.trim().lowercase()
                        if (e.isNotEmpty() && "@" in e && !collabs.contains(e)) {
                            collabs = collabs + e
                            collabInput = ""
                        }
                    }) { Text("Add") }
                }
                if (collabs.isNotEmpty()) {
                    androidx.compose.foundation.layout.FlowRow(
                        modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        collabs.forEach { e ->
                            InputChip(
                                selected = false,
                                onClick = { collabs = collabs - e },
                                label = { Text(e, fontSize = 11.sp) },
                                trailingIcon = { Icon(Icons.Filled.Close, null, modifier = Modifier.size(14.dp)) }
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                onSave(note.copy(
                    title = title.trim(),
                    text = text.trim(),
                    colorName = colorName,
                    reminderDate = reminderDate,
                    labels = labelsForSave,
                    collaboratorEmails = collabsForSave
                ))
            }) {
                Text("Save", fontWeight = FontWeight.ExtraBold)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Cancel")) } }
    )
}

@Composable
private fun ProjectNotesList(state: StudioFlowUiState) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    data class Entry(val orderId: String, val title: String, val customer: String, val noteType: String, val text: String)
    val entries = remember(state.orders) {
        state.orders.flatMap { order ->
            buildList {
                if (order.notes.isNotBlank()) add(Entry(order.id, order.designName, order.customerName, "Note", order.notes))
                if (order.invNotes.isNotBlank()) add(Entry(order.id, order.designName, order.customerName, t("Inventory"), order.invNotes))
            }
        }
    }
    val grouped = entries.groupBy { it.orderId }.toList().sortedByDescending {
        state.orders.firstOrNull { o -> o.id == it.first }?.paymentDate?.time ?: 0L
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        if (grouped.isEmpty()) {
            item {
                Box(modifier = Modifier.fillMaxWidth().padding(top = 60.dp), contentAlignment = Alignment.Center) {
                    Text(t("No project notes yet."), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        grouped.forEach { (_, items) ->
            val first = items.first()
            item {
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = MaterialTheme.colorScheme.surface,
                    border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            first.title.ifBlank { first.customer.ifBlank { "Project" } },
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 17.sp
                        )
                        if (first.customer.isNotBlank()) {
                            Text(first.customer, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        items.forEach { entry ->
                            Column(modifier = Modifier.padding(top = 4.dp)) {
                                Text(entry.noteType.uppercase(), fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, color = StudioBlue)
                                Text(entry.text, fontSize = 14.sp, maxLines = 5, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
            }
        }
    }
}

private val URL_REGEX = Regex("(https?://[\\w\\-._~:/?#\\[\\]@!$&'()*+,;=%]+|www\\.[\\w\\-._~:/?#\\[\\]@!$&'()*+,;=%]+)")

private fun buildLinkifiedText(text: String): androidx.compose.ui.text.AnnotatedString {
    return androidx.compose.ui.text.buildAnnotatedString {
        var lastEnd = 0
        URL_REGEX.findAll(text).forEach { m ->
            append(text.substring(lastEnd, m.range.first))
            pushStringAnnotation(tag = "URL", annotation = m.value)
            pushStyle(androidx.compose.ui.text.SpanStyle(color = androidx.compose.ui.graphics.Color(0xFF2563EB), textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline))
            append(m.value)
            pop()
            pop()
            lastEnd = m.range.last + 1
        }
        if (lastEnd < text.length) append(text.substring(lastEnd))
    }
}

@Composable
private fun colorForNote(name: String): Color = colorForName(name)

@Composable
private fun colorForName(name: String): Color {
    return when (name.lowercase()) {
        "red" -> Color(0xFFFFE0E0)
        "orange" -> Color(0xFFFFEFD0)
        "yellow" -> Color(0xFFFFF7CC)
        "green" -> Color(0xFFD8F5D8)
        "blue" -> Color(0xFFD8E9FF)
        "purple" -> Color(0xFFE6DAFF)
        "pink" -> Color(0xFFFFD9F0)
        else -> MaterialTheme.colorScheme.surface
    }
}
