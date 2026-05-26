package uk.co.eggcraft.studioflow.features.notes

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.ui.draw.clip
import androidx.compose.ui.window.Dialog
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
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
    onUploadImage: (StudioKeepNote, ByteArray, String, String) -> Unit = { _, _, _, _ -> }
) {
    var topTab by rememberSaveable { mutableStateOf("personal") }
    var labelFilter by rememberSaveable { mutableStateOf<String?>(null) }
    val section = state.keepNotesSection.ifBlank { "notes" }
    val allLabels = remember(state.keepNotes) {
        state.keepNotes.flatMap { it.labels }.distinct().sorted()
    }
    val query = state.keepNotesSearch.trim().lowercase()
    val all = state.keepNotes
    val visible = remember(all, section, query) {
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
        }.sortedWith(compareByDescending<StudioKeepNote> { it.isPinned }
            .thenByDescending { it.updatedAt?.time ?: 0L })
    }
    val pinned = visible.filter { it.isPinned }
    val others = visible.filter { !it.isPinned }

    var editingNote by remember { mutableStateOf<StudioKeepNote?>(null) }
    var viewerImageUrl by remember { mutableStateOf<String?>(null) }
    val drawerState = androidx.compose.material3.rememberDrawerState(androidx.compose.material3.DrawerValue.Closed)
    val scope = androidx.compose.runtime.rememberCoroutineScope()

    androidx.compose.material3.ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            androidx.compose.material3.ModalDrawerSheet {
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
                    Text("VIEW", fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(modifier = Modifier.height(6.dp))
                    listOf("personal" to "Personal", "project" to "Project Notes").forEach { (k, label) ->
                        androidx.compose.material3.NavigationDrawerItem(
                            label = { Text(label, fontWeight = FontWeight.Bold) },
                            selected = topTab == k,
                            onClick = {
                                topTab = k
                                scope.launch { drawerState.close() }
                            }
                        )
                    }
                    Spacer(modifier = Modifier.height(14.dp))
                    if (topTab == "personal") {
                        Text("SECTIONS", fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(modifier = Modifier.height(6.dp))
                        listOf("notes" to "All", "reminders" to "Reminders", "archive" to "Archive", "trash" to "Trash").forEach { (k, label) ->
                            androidx.compose.material3.NavigationDrawerItem(
                                label = { Text(label, fontWeight = FontWeight.Bold) },
                                selected = section == k,
                                onClick = {
                                    onSetSection(k)
                                    scope.launch { drawerState.close() }
                                }
                            )
                        }
                        if (allLabels.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(14.dp))
                            Text("LABELS", fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(modifier = Modifier.height(6.dp))
                            androidx.compose.material3.NavigationDrawerItem(
                                label = { Text("All labels", fontWeight = FontWeight.Bold) },
                                selected = labelFilter == null,
                                onClick = {
                                    labelFilter = null
                                    scope.launch { drawerState.close() }
                                }
                            )
                            allLabels.forEach { l ->
                                androidx.compose.material3.NavigationDrawerItem(
                                    label = { Text("#$l") },
                                    selected = labelFilter == l,
                                    onClick = {
                                        labelFilter = l
                                        scope.launch { drawerState.close() }
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }
    ) {
    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        // Compact toolbar: hamburger + title + search
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = { scope.launch { drawerState.open() } }) {
                Icon(Icons.Filled.Menu, contentDescription = "Menu")
            }
            Box(
                modifier = Modifier.size(32.dp).clip(RoundedCornerShape(50)).background(Color(0xFFFFF3B0)),
                contentAlignment = Alignment.Center
            ) { Text("💡", fontSize = 16.sp) }
            Spacer(modifier = Modifier.width(8.dp))
            Text("Notes", fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, modifier = Modifier.weight(1f))
            // Inline mini search
            OutlinedTextField(
                value = state.keepNotesSearch,
                onValueChange = onSetSearch,
                placeholder = { Text("Search", fontSize = 13.sp) },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, modifier = Modifier.size(16.dp)) },
                singleLine = true,
                textStyle = androidx.compose.ui.text.TextStyle(fontSize = 13.sp),
                modifier = Modifier.weight(1.6f).heightIn(min = 40.dp)
            )
        }
        androidx.compose.material3.HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

        // Big section title
        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) {
            val pageTitle = when {
                topTab == "project" -> "Project Notes"
                section == "reminders" -> "Reminders"
                section == "archive" -> "Archive"
                section == "trash" -> "Trash"
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
            return@ModalNavigationDrawer
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
                Icon(Icons.Filled.Add, contentDescription = "New note", tint = StudioBlue)
            }
        }

        // Section actions row (Empty Trash)
        if (section == "trash" && visible.isNotEmpty()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.End
            ) {
                TextButton(onClick = { visible.forEach { onDelete(it.id) } }) {
                    Text("Empty Trash", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.ExtraBold)
                }
            }
        }

        // List
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            contentPadding = PaddingValues(vertical = 8.dp)
        ) {
            if (pinned.isNotEmpty()) {
                item {
                    Text(
                        "PINNED",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(start = 4.dp, top = 4.dp)
                    )
                }
                items(pinned, key = { it.id }) { note ->
                    NoteCard(note, onClick = { editingNote = note }, onTogglePin = {
                        onSave(note.copy(isPinned = !note.isPinned, updatedAt = Date()))
                    }, onArchive = {
                        onSave(note.copy(isArchived = !note.isArchived, updatedAt = Date()))
                    }, onDelete = {
                        if (note.isDeleted) onDelete(note.id)
                        else onSave(note.copy(isDeleted = true, updatedAt = Date()))
                    }, onRestore = {
                        onSave(note.copy(isDeleted = false, updatedAt = Date()))
                    }, onOpenImage = { viewerImageUrl = it })
                }
                item {
                    Text(
                        "OTHERS",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(start = 4.dp, top = 8.dp)
                    )
                }
            }
            items(others, key = { it.id }) { note ->
                NoteCard(note, onClick = { editingNote = note }, onTogglePin = {
                    onSave(note.copy(isPinned = !note.isPinned, updatedAt = Date()))
                }, onArchive = {
                    onSave(note.copy(isArchived = !note.isArchived, updatedAt = Date()))
                }, onDelete = {
                    if (note.isDeleted) onDelete(note.id)
                    else onSave(note.copy(isDeleted = true, updatedAt = Date()))
                }, onRestore = {
                    onSave(note.copy(isDeleted = false, updatedAt = Date()))
                }, onOpenImage = { viewerImageUrl = it })
            }
            if (visible.isEmpty()) {
                item {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(top = 60.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            when (section) {
                                "archive" -> "No archived notes."
                                "trash" -> "Trash is empty."
                                "reminders" -> "No reminders."
                                else -> "Tap + to create your first note."
                            },
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
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
    onOpenImage: (String) -> Unit = {}
) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = colorForNote(note.colorName),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        onClick = onClick,
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
                if (note.isPinned) {
                    Icon(
                        Icons.Filled.PushPin,
                        contentDescription = "Pinned",
                        modifier = Modifier.size(18.dp),
                        tint = StudioBlue
                    )
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
                Text(
                    note.text,
                    fontSize = 14.sp,
                    maxLines = 6,
                    overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.padding(top = if (note.title.isNotBlank()) 4.dp else 0.dp)
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
            if (note.collaboratorEmails.isNotEmpty()) {
                Text(
                    "👥 ${note.collaboratorEmails.size} shared",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 2.dp)
                )
            }
            // Only show inline action row when in trash or archive (otherwise edit dialog covers actions)
            if (note.isDeleted || note.isArchived) {
                Row(modifier = Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Spacer(modifier = Modifier.weight(1f))
                    if (note.isDeleted) {
                        IconButton(onClick = { onRestore() }, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Filled.Restore, contentDescription = "Restore", modifier = Modifier.size(16.dp), tint = StudioBlue)
                        }
                    } else {
                        IconButton(onClick = onArchive, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Filled.Archive, contentDescription = "Unarchive", modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    IconButton(onClick = onDelete, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Filled.Delete, contentDescription = "Delete", modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.error)
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
        title = { Text(if (note.isEmpty) "New Note" else "Edit Note", fontWeight = FontWeight.ExtraBold) },
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
                Text("Color", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
                Text("Reminder", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                var datePickerOpen by remember { mutableStateOf(false) }
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    AssistChip(
                        onClick = { reminderDate = Date(System.currentTimeMillis() + 24L * 60 * 60 * 1000) },
                        label = { Text("Tomorrow") }
                    )
                    AssistChip(
                        onClick = { reminderDate = Date(System.currentTimeMillis() + 7L * 24 * 60 * 60 * 1000) },
                        label = { Text("Next week") }
                    )
                    AssistChip(
                        onClick = { datePickerOpen = true },
                        label = { Text("Pick date") }
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
                        dismissButton = { TextButton(onClick = { datePickerOpen = false }) { Text("Cancel") } }
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
                ) { Text("Add image…") }
                if (note.links.isNotEmpty()) {
                    Text(
                        "${note.links.size} attachment(s)",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))
                Text("Labels", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                var labelInput by rememberSaveable(note.id) { mutableStateOf("") }
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = labelInput,
                        onValueChange = { labelInput = it },
                        placeholder = { Text("Add label") },
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
                Text("Collaborators", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                var collabInput by rememberSaveable(note.id) { mutableStateOf("") }
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = collabInput,
                        onValueChange = { collabInput = it },
                        placeholder = { Text("Email") },
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
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun ProjectNotesList(state: StudioFlowUiState) {
    data class Entry(val orderId: String, val title: String, val customer: String, val noteType: String, val text: String)
    val entries = remember(state.orders) {
        state.orders.flatMap { order ->
            buildList {
                if (order.notes.isNotBlank()) add(Entry(order.id, order.designName, order.customerName, "Note", order.notes))
                if (order.invNotes.isNotBlank()) add(Entry(order.id, order.designName, order.customerName, "Inventory", order.invNotes))
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
                    Text("No project notes yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
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
