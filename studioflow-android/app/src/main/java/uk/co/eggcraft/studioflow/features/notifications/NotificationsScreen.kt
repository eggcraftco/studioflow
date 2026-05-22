package uk.co.eggcraft.studioflow.features.notifications

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Mail
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SupportAgent
import androidx.compose.material.icons.filled.Task
import androidx.compose.material.icons.filled.Update
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uk.co.eggcraft.studioflow.data.model.StudioActivityNotification
import uk.co.eggcraft.studioflow.features.shell.StudioFlowUiState
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

@Composable
fun NotificationsScreen(
    state: StudioFlowUiState,
    onSetSearch: (String) -> Unit,
    onSetReadFilter: (String) -> Unit,
    onSetTypeFilter: (String) -> Unit,
    onMarkRead: (String) -> Unit,
    onMarkAllRead: () -> Unit,
    onDismiss: (List<String>) -> Unit,
    onOpen: (StudioActivityNotification) -> Unit
) {
    val uid = state.user?.uid.orEmpty()
    val email = state.user?.email.orEmpty()
    val all = state.activityNotifications

    val visible = all.filter { item ->
        !state.dismissedActivityNotificationIds.contains(item.id) && !item.isDismissed(uid, email)
    }

    val filtered = visible.filter { item ->
        val readMatch = state.activityNotificationReadFilter != "unread" || item.isUnread(uid, email)
        val typeMatch = matchesType(item, state.activityNotificationTypeFilter)
        val searchMatch = matchesSearch(item, state.activityNotificationSearch)
        readMatch && typeMatch && searchMatch
    }

    val sections = buildSections(filtered)
    var filtersExpanded by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 16.dp)
    ) {
        Header(
            unreadCount = state.activityNotificationUnreadCount,
            hasVisible = filtered.isNotEmpty(),
            onMarkAllRead = onMarkAllRead,
            onDismissAllVisible = { onDismiss(filtered.map { it.id }) }
        )
        SearchField(
            query = state.activityNotificationSearch,
            onQueryChange = onSetSearch
        )
        FilterRow(
            filtersExpanded = filtersExpanded,
            onToggleExpanded = { filtersExpanded = !filtersExpanded },
            readFilter = state.activityNotificationReadFilter,
            typeFilter = state.activityNotificationTypeFilter,
            allCount = visible.size,
            unreadCount = visible.count { it.isUnread(uid, email) },
            onSetReadFilter = onSetReadFilter,
            onSetTypeFilter = onSetTypeFilter,
            typeCount = { key -> visible.count { matchesType(it, key) } }
        )

        Box(modifier = Modifier.fillMaxSize().padding(top = 8.dp)) {
            if (filtered.isEmpty()) {
                EmptyState(
                    readFilter = state.activityNotificationReadFilter,
                    hasSearch = state.activityNotificationSearch.isNotBlank()
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    sections.forEach { section ->
                        item(key = "section_${section.id}") {
                            Text(
                                section.title.uppercase(Locale.getDefault()),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 6.dp, bottom = 4.dp)
                            )
                        }
                        items(section.items, key = { it.id }) { item ->
                            NotificationRow(
                                item = item,
                                isUnread = item.isUnread(uid, email),
                                onClick = {
                                    onMarkRead(item.id)
                                    onOpen(item)
                                },
                                onDismiss = { onDismiss(listOf(item.id)) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Header(
    unreadCount: Int,
    hasVisible: Boolean,
    onMarkAllRead: () -> Unit,
    onDismissAllVisible: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text("Notification Centre", fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
            Text(
                "Latest activity and workflow updates",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        if (unreadCount > 0) {
            Surface(
                color = MaterialTheme.colorScheme.primary.copy(alpha = 0.10f),
                shape = RoundedCornerShape(50),
                modifier = Modifier.clickable(onClick = onMarkAllRead)
            ) {
                Text(
                    "Mark all read",
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold,
                    fontSize = 11.sp,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp)
                )
            }
            Spacer(Modifier.width(6.dp))
        }
        if (hasVisible) {
            IconButton(onClick = onDismissAllVisible) {
                Icon(Icons.Filled.Close, contentDescription = "Clear visible")
            }
        }
    }
}

@Composable
private fun SearchField(query: String, onQueryChange: (String) -> Unit) {
    OutlinedTextField(
        value = query,
        onValueChange = onQueryChange,
        modifier = Modifier.fillMaxWidth(),
        placeholder = { Text("Search notifications") },
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
}

@Composable
private fun FilterRow(
    filtersExpanded: Boolean,
    onToggleExpanded: () -> Unit,
    readFilter: String,
    typeFilter: String,
    allCount: Int,
    unreadCount: Int,
    onSetReadFilter: (String) -> Unit,
    onSetTypeFilter: (String) -> Unit,
    typeCount: (String) -> Int
) {
    Column(modifier = Modifier.fillMaxWidth().padding(top = 10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            FilterChip(
                selected = filtersExpanded,
                onClick = onToggleExpanded,
                label = { Text("Filters") }
            )
            Spacer(Modifier.width(8.dp))
            val activeSummary = buildString {
                if (readFilter == "unread") append("Unread")
                if (typeFilter != "all") {
                    if (isNotEmpty()) append(" • ")
                    append(typeLabel(typeFilter))
                }
            }
            if (activeSummary.isNotBlank()) {
                Text(
                    activeSummary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.weight(1f))
                TextButton(onClick = {
                    onSetReadFilter("all"); onSetTypeFilter("all")
                }) { Text("Clear") }
            }
        }
        if (filtersExpanded) {
            Row(modifier = Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(
                    selected = readFilter == "all",
                    onClick = { onSetReadFilter("all") },
                    label = { Text("All ($allCount)") }
                )
                FilterChip(
                    selected = readFilter == "unread",
                    onClick = { onSetReadFilter("unread") },
                    label = { Text("Unread ($unreadCount)") }
                )
            }
            LazyRow(
                modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                val types = listOf(
                    "all" to "All types",
                    "messages" to "Messages",
                    "support" to "Support",
                    "orders" to "Orders",
                    "tasks" to "Tasks",
                    "files" to "Files",
                    "system" to "System"
                )
                items(types) { (key, label) ->
                    FilterChip(
                        selected = typeFilter == key,
                        onClick = { onSetTypeFilter(key) },
                        label = { Text("$label (${typeCount(key)})") }
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun NotificationRow(
    item: StudioActivityNotification,
    isUnread: Boolean,
    onClick: () -> Unit,
    onDismiss: () -> Unit
) {
    var menuOpen by remember { mutableStateOf(false) }
    val background = if (isUnread) MaterialTheme.colorScheme.primary.copy(alpha = 0.06f) else Color.Transparent

    Box {
        Surface(
            color = background,
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier
                .fillMaxWidth()
                .combinedClickable(onClick = onClick, onLongClick = { menuOpen = true })
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.Top
            ) {
                NotificationIcon(item)
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.10f),
                            shape = RoundedCornerShape(50)
                        ) {
                            Text(
                                typeLabel(item.type.ifBlank { typeKeyFor(item) }),
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp)
                            )
                        }
                        Spacer(Modifier.weight(1f))
                        Text(
                            notificationTimeText(item.createdAt),
                            fontSize = 10.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        if (isUnread) {
                            Spacer(Modifier.width(6.dp))
                            Box(
                                modifier = Modifier
                                    .size(7.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.primary)
                            )
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(
                        item.title,
                        fontSize = 14.sp,
                        fontWeight = if (isUnread) FontWeight.ExtraBold else FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    if (item.message.isNotBlank()) {
                        Text(
                            item.message,
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 3
                        )
                    }
                    val sender = item.senderName.trim().ifBlank { item.senderEmail.trim() }
                    if (sender.isNotBlank()) {
                        Text(
                            "from $sender",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                }
            }
        }
        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            DropdownMenuItem(text = { Text("Dismiss") }, onClick = { menuOpen = false; onDismiss() })
        }
    }
}

@Composable
private fun NotificationIcon(item: StudioActivityNotification) {
    val (icon, tint) = iconAndTintFor(item)
    Box(
        modifier = Modifier
            .size(32.dp)
            .clip(CircleShape)
            .background(tint.copy(alpha = 0.15f)),
        contentAlignment = Alignment.Center
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
    }
}

@Composable
private fun EmptyState(readFilter: String, hasSearch: Boolean) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                if (readFilter == "unread") Icons.Filled.NotificationsNone else Icons.Filled.Notifications,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(40.dp)
            )
            Spacer(Modifier.height(8.dp))
            Text(
                if (readFilter == "unread") "No unread notifications" else "No notifications yet",
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp
            )
            Spacer(Modifier.height(4.dp))
            Text(
                if (hasSearch) "No notifications match your search."
                else "Important updates from messages, support tickets, orders and workflow will appear here.",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

// --- helpers ---

private data class Section(val id: String, val title: String, val items: List<StudioActivityNotification>)

private fun buildSections(items: List<StudioActivityNotification>): List<Section> {
    if (items.isEmpty()) return emptyList()
    val today = mutableListOf<StudioActivityNotification>()
    val yesterday = mutableListOf<StudioActivityNotification>()
    val earlierWeek = mutableListOf<StudioActivityNotification>()
    val older = mutableListOf<StudioActivityNotification>()
    val cal = Calendar.getInstance()
    val now = Calendar.getInstance()
    val startOfToday = Calendar.getInstance().apply {
        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }.time
    val startOfYesterday = Calendar.getInstance().apply {
        time = startOfToday
        add(Calendar.DAY_OF_YEAR, -1)
    }.time
    val startOfWeek = Calendar.getInstance().apply {
        time = startOfToday
        add(Calendar.DAY_OF_YEAR, -7)
    }.time

    items.forEach { item ->
        val date = item.createdAt ?: return@forEach
        when {
            date >= startOfToday -> today.add(item)
            date >= startOfYesterday -> yesterday.add(item)
            date >= startOfWeek -> earlierWeek.add(item)
            else -> older.add(item)
        }
    }

    val sections = mutableListOf<Section>()
    if (today.isNotEmpty()) sections.add(Section("today", "Today", today))
    if (yesterday.isNotEmpty()) sections.add(Section("yesterday", "Yesterday", yesterday))
    if (earlierWeek.isNotEmpty()) sections.add(Section("week", "Earlier this week", earlierWeek))
    if (older.isNotEmpty()) sections.add(Section("older", "Older", older))
    return sections
}

private fun matchesSearch(item: StudioActivityNotification, query: String): Boolean {
    val q = query.trim().lowercase()
    if (q.isEmpty()) return true
    return listOf(item.title, item.message, item.type, item.route, item.senderName, item.senderEmail, item.priority, item.status)
        .joinToString(" ").lowercase().contains(q)
}

private fun matchesType(item: StudioActivityNotification, key: String): Boolean {
    if (key == "all") return true
    val type = item.type.lowercase()
    val route = item.route.lowercase()
    return when (key) {
        "messages" -> route.contains("message") || type.contains("message")
        "support" -> route.contains("support") || type.contains("ticket") || type.contains("support")
        "orders" -> route.contains("order") || type.contains("order") || type.contains("delivery") || type.contains("tracking")
        "tasks" -> type.contains("task") || route.contains("task") || type.contains("reminder")
        "files" -> type.contains("file") || type.contains("attachment") || route.contains("file")
        "system" -> type.contains("system") || type.contains("plan") || type.contains("workspace")
        else -> true
    }
}

private fun typeKeyFor(item: StudioActivityNotification): String {
    if (matchesType(item, "messages")) return "messages"
    if (matchesType(item, "support")) return "support"
    if (matchesType(item, "orders")) return "orders"
    if (matchesType(item, "tasks")) return "tasks"
    if (matchesType(item, "files")) return "files"
    if (matchesType(item, "system")) return "system"
    return "update"
}

private fun typeLabel(key: String): String = when (key) {
    "messages" -> "Messages"
    "support" -> "Support"
    "orders" -> "Orders"
    "tasks" -> "Tasks"
    "files" -> "Files"
    "system" -> "System"
    "unread" -> "Unread"
    else -> "Update"
}

private fun iconAndTintFor(item: StudioActivityNotification): Pair<ImageVector, Color> {
    val key = typeKeyFor(item)
    return when (key) {
        "messages" -> Icons.Filled.Mail to Color(0xFF2563EB)
        "support" -> Icons.Filled.SupportAgent to Color(0xFFDC2626)
        "orders" -> Icons.Filled.CheckCircle to Color(0xFF16A34A)
        "tasks" -> Icons.Filled.Task to Color(0xFFCA8A04)
        "files" -> Icons.Filled.AttachFile to Color(0xFF7C3AED)
        "system" -> Icons.Filled.Build to Color(0xFF6B7280)
        else -> Icons.Filled.Update to Color(0xFF2563EB)
    }
}

private fun notificationTimeText(date: Date?): String {
    if (date == null) return ""
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
