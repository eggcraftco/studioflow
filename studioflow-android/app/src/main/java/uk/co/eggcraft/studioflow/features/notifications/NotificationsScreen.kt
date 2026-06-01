package uk.co.eggcraft.studioflow.features.notifications

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Mail
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SupportAgent
import androidx.compose.material.icons.filled.Task
import androidx.compose.material.icons.filled.Update
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
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
    onReviewOrderDeletion: (String, Boolean) -> Unit,
    onOpen: (StudioActivityNotification) -> Unit,
    onClose: (() -> Unit)? = null
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
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
    var expandedGroups by remember(state.workspace?.id) { mutableStateOf(emptySet<String>()) }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).statusBarsPadding().navigationBarsPadding()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            item("permission_banner") { PermissionBanner() }
            item("header_card") {
                HeaderCard(
                    unreadCount = state.activityNotificationUnreadCount,
                    hasVisible = filtered.isNotEmpty(),
                    onMarkAllRead = onMarkAllRead,
                    onDismissAllVisible = { onDismiss(filtered.map { it.id }) },
                    onClose = onClose,
                    query = state.activityNotificationSearch,
                    onQueryChange = onSetSearch,
                    filtersExpanded = filtersExpanded,
                    onToggleExpanded = { filtersExpanded = !filtersExpanded },
                    readFilter = state.activityNotificationReadFilter,
                    typeFilter = state.activityNotificationTypeFilter,
                    allCount = visible.size,
                    unreadVisibleCount = visible.count { it.isUnread(uid, email) },
                    onSetReadFilter = onSetReadFilter,
                    onSetTypeFilter = onSetTypeFilter,
                    typeCount = { key -> visible.count { matchesType(it, key) } }
                )
            }

            if (filtered.isEmpty()) {
                item("empty") {
                    EmptyState(
                        readFilter = state.activityNotificationReadFilter,
                        hasSearch = state.activityNotificationSearch.isNotBlank()
                    )
                }
            } else {
                sections.forEach { section ->
                    item("section_${section.id}") {
                        Text(
                            t(section.title).uppercase(Locale.getDefault()),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF9D9DA3),
                            modifier = Modifier.padding(start = 4.dp, top = 8.dp, bottom = 2.dp)
                        )
                    }
                    val groups = groupBy(section.items)
                    groups.forEach { group ->
                        val groupId = "${section.id}_${group.key}"
                        val isExpanded = expandedGroups.contains(groupId)
                        if (group.items.size <= 1) {
                            val latest = group.items.first()
                            item(key = latest.id) {
                                SingleNotificationCard(
                                    item = latest,
                                    isUnread = latest.isUnread(uid, email),
                                    sectionId = section.id,
                                    onClick = {
                                        onMarkRead(latest.id)
                                        onOpen(latest)
                                    },
                                    onDismiss = { onDismiss(listOf(latest.id)) },
                                    onReviewOrderDeletion = onReviewOrderDeletion
                                )
                            }
                        } else {
                            item(key = "group_$groupId") {
                                StackedNotificationCard(
                                    latest = group.items.first(),
                                    items = group.items,
                                    isExpanded = isExpanded,
                                    isUnread = group.items.any { it.isUnread(uid, email) },
                                    sectionId = section.id,
                                    onToggle = {
                                        expandedGroups =
                                            if (isExpanded) expandedGroups - groupId
                                            else expandedGroups + groupId
                                    },
                                    onDismissAll = { onDismiss(group.items.map { it.id }) }
                                )
                            }
                            if (isExpanded) {
                                items(group.items, key = { "child_${it.id}" }) { child ->
                                    SingleNotificationCard(
                                        item = child,
                                        isUnread = child.isUnread(uid, email),
                                        sectionId = section.id,
                                        indent = true,
                                        onClick = {
                                            onMarkRead(child.id)
                                            onOpen(child)
                                        },
                                        onDismiss = { onDismiss(listOf(child.id)) },
                                        onReviewOrderDeletion = onReviewOrderDeletion
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HeaderCard(
    unreadCount: Int,
    hasVisible: Boolean,
    onMarkAllRead: () -> Unit,
    onDismissAllVisible: () -> Unit,
    onClose: (() -> Unit)?,
    query: String,
    onQueryChange: (String) -> Unit,
    filtersExpanded: Boolean,
    onToggleExpanded: () -> Unit,
    readFilter: String,
    typeFilter: String,
    allCount: Int,
    unreadVisibleCount: Int,
    onSetReadFilter: (String) -> Unit,
    onSetTypeFilter: (String) -> Unit,
    typeCount: (String) -> Int
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(11.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        t("Notification Centre"),
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 20.sp,
                        maxLines = 1
                    )
                    Text(
                        t("Latest activity and workflow updates"),
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1
                    )
                }
                if (unreadCount > 0) {
                    Surface(
                        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.10f),
                        shape = RoundedCornerShape(50),
                        modifier = Modifier.clickable {
                            onMarkAllRead()
                            // Also dismiss visible cards (single combined action — Mac/Web parity)
                            onDismissAllVisible()
                        }
                    ) {
                        Text(
                            t("Mark all read"),
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp)
                        )
                    }
                    Spacer(Modifier.width(6.dp))
                }
                if (onClose != null) {
                    Spacer(Modifier.width(6.dp))
                    CircleIconButton(icon = Icons.AutoMirrored.Filled.KeyboardArrowRight, onClick = onClose)
                }
            }

            OutlinedTextField(
                value = query,
                onValueChange = onQueryChange,
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text(t("Search notifications")) },
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

            FilterRow(
                filtersExpanded = filtersExpanded,
                onToggleExpanded = onToggleExpanded,
                readFilter = readFilter,
                typeFilter = typeFilter,
                allCount = allCount,
                unreadCount = unreadVisibleCount,
                onSetReadFilter = onSetReadFilter,
                onSetTypeFilter = onSetTypeFilter,
                typeCount = typeCount
            )
        }
    }
}

@Composable
private fun CircleIconButton(icon: ImageVector, onClick: () -> Unit) {
    Surface(
        shape = CircleShape,
        color = Color(0x14000000),
        modifier = Modifier
            .size(28.dp)
            .clickable(onClick = onClick)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(14.dp))
        }
    }
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
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            FilterChip(
                selected = filtersExpanded,
                onClick = onToggleExpanded,
                label = { Text(t("Filters")) }
            )
            Spacer(Modifier.width(8.dp))
            val activeSummary = buildString {
                if (readFilter == "unread") append(t("Unread"))
                if (typeFilter != "all") {
                    if (isNotEmpty()) append(" • ")
                    append(t(typeLabel(typeFilter)))
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
                }) { Text(t("Clear")) }
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
                    "all" to t("All types"),
                    "messages" to t("Messages"),
                    "support" to t("Support"),
                    "orders" to t("Orders"),
                    "tasks" to t("Tasks"),
                    "files" to t("Files"),
                    "system" to t("System")
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
private fun SingleNotificationCard(
    item: StudioActivityNotification,
    isUnread: Boolean,
    sectionId: String,
    indent: Boolean = false,
    onClick: () -> Unit,
    onDismiss: () -> Unit,
    onReviewOrderDeletion: (String, Boolean) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var menuOpen by remember { mutableStateOf(false) }

    Surface(
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp,
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = if (indent) 16.dp else 0.dp)
            .clip(RoundedCornerShape(14.dp))
            .combinedClickable(onClick = onClick, onLongClick = { menuOpen = true })
    ) {
        Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 12.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                NotificationAvatar(item = item, showUnreadDot = isUnread)
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            senderLine(item),
                            fontSize = 14.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            modifier = Modifier.weight(1f)
                        )
                        Text(
                            timeTextFor(item.createdAt, sectionId),
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    val body = item.message.ifBlank { item.title }
                    if (body.isNotBlank()) {
                        Spacer(Modifier.height(2.dp))
                        Text(
                            body,
                            fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 3
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                    TypePill(typeKeyFor(item))
                    if (item.type == "order_deletion_request" && item.status == "pending") {
                        Spacer(Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = { onReviewOrderDeletion(item.orderId, true) }) { Text("Approve Delete") }
                            OutlinedButton(onClick = { onReviewOrderDeletion(item.orderId, false) }) { Text("Reject") }
                        }
                    }
                }
            }
        }
        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            DropdownMenuItem(text = { Text(t("Dismiss")) }, onClick = { menuOpen = false; onDismiss() })
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun StackedNotificationCard(
    latest: StudioActivityNotification,
    items: List<StudioActivityNotification>,
    isExpanded: Boolean,
    isUnread: Boolean,
    sectionId: String,
    onToggle: () -> Unit,
    onDismissAll: () -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var menuOpen by remember { mutableStateOf(false) }
    val count = items.size
    val typeKey = typeKeyFor(latest)
    val typeTitle = t(typeLabel(typeKey))

    Surface(
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .combinedClickable(onClick = onToggle, onLongClick = { menuOpen = true })
    ) {
        Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 12.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                NotificationAvatar(item = latest, showUnreadDot = false, useCategoryIcon = true)
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            typeTitle,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Spacer(Modifier.width(6.dp))
                        CountPill(count)
                        Spacer(Modifier.weight(1f))
                        Text(
                            timeTextFor(latest.createdAt, sectionId),
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    val title = latest.title.trim()
                    if (title.isNotBlank()) {
                        Spacer(Modifier.height(4.dp))
                        Text(
                            title,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1
                        )
                    }
                    val preview = latest.message.trim()
                    if (preview.isNotBlank()) {
                        Text(
                            preview,
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 2
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    Surface(
                        color = Color(0x14000000),
                        shape = RoundedCornerShape(50)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                if (isExpanded) "Hide $count notifications" else "Tap to show $count notifications",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(Modifier.width(2.dp))
                            Icon(
                                if (isExpanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(14.dp)
                            )
                        }
                    }
                }
            }
        }
        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            DropdownMenuItem(text = { Text(t("Dismiss all")) }, onClick = { menuOpen = false; onDismissAll() })
        }
    }
}

@Composable
private fun NotificationAvatar(
    item: StudioActivityNotification,
    showUnreadDot: Boolean,
    useCategoryIcon: Boolean = false
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val (icon, tint) = iconAndTintFor(item)
    val photo = item.senderPhotoURL.trim()

    Box(modifier = Modifier.size(40.dp)) {
        if (!useCategoryIcon && photo.isNotEmpty()) {
            AsyncImage(
                model = photo,
                contentDescription = item.senderName.ifBlank { t("Sender") },
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(tint.copy(alpha = 0.15f))
            )
        } else {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(tint.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
            }
        }
        if (showUnreadDot) {
            Box(
                modifier = Modifier
                    .size(11.dp)
                    .align(Alignment.TopEnd)
                    .clip(CircleShape)
                    .background(Color(0xFFEF4444))
                    .border(1.5.dp, MaterialTheme.colorScheme.surface, CircleShape)
            )
        }
    }
}

@Composable
private fun CountPill(count: Int) {
    Surface(
        color = Color(0x1A000000),
        shape = RoundedCornerShape(50)
    ) {
        Text(
            count.toString(),
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 7.dp, vertical = 1.dp)
        )
    }
}

@Composable
private fun TypePill(typeKey: String) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val tint = colorForType(typeKey)
    Surface(
        color = tint.copy(alpha = 0.12f),
        shape = RoundedCornerShape(50)
    ) {
        Text(
            t(typeLabel(typeKey)),
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            color = tint,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
        )
    }
}

@Composable
private fun EmptyState(readFilter: String, hasSearch: Boolean) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth().padding(top = 12.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                if (readFilter == "unread") Icons.Filled.NotificationsNone else Icons.Filled.Notifications,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(40.dp)
            )
            Spacer(Modifier.height(8.dp))
            Text(
                if (readFilter == "unread") t("No unread notifications") else t("No notifications yet"),
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp
            )
            Spacer(Modifier.height(4.dp))
            Text(
                if (hasSearch) t("No notifications match your search.")
                else "Important updates from messages, support tickets, orders and workflow will appear here.",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun PermissionBanner() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val context = LocalContext.current
    val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
        PackageManager.PERMISSION_GRANTED
    if (granted) return
    Surface(
        color = MaterialTheme.colorScheme.errorContainer,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Filled.NotificationsNone,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onErrorContainer,
                modifier = Modifier.size(20.dp)
            )
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    t("Notifications are off"),
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
                Text(
                    t("Turn them on to get push alerts for new messages."),
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
            }
            TextButton(onClick = {
                runCatching {
                    val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                    intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    context.startActivity(intent)
                }.onFailure {
                    runCatching {
                        val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                            .setData(Uri.fromParts("package", context.packageName, null))
                        fallback.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        context.startActivity(fallback)
                    }
                }
            }) {
                Text(t("Open Settings"), fontWeight = FontWeight.Bold)
            }
        }
    }
}

// --- helpers ---

private data class Section(val id: String, val title: String, val items: List<StudioActivityNotification>)
private data class NotificationGroup(val key: String, val items: List<StudioActivityNotification>)

private fun stackKeyFor(item: StudioActivityNotification): String {
    val threadId = item.threadId.trim()
    if (threadId.isNotEmpty()) return "thread:$threadId"
    val orderId = item.orderId.trim()
    if (orderId.isNotEmpty()) return "order:$orderId"
    val ticketId = item.ticketId.trim()
    if (ticketId.isNotEmpty()) return "ticket:$ticketId"
    return "id:${item.id}"
}

private fun groupBy(items: List<StudioActivityNotification>): List<NotificationGroup> {
    if (items.isEmpty()) return emptyList()
    val map = linkedMapOf<String, MutableList<StudioActivityNotification>>()
    items.forEach { item ->
        map.getOrPut(stackKeyFor(item)) { mutableListOf() }.add(item)
    }
    return map.map { (key, list) -> NotificationGroup(key, list) }
}

private fun buildSections(items: List<StudioActivityNotification>): List<Section> {
    if (items.isEmpty()) return emptyList()
    val today = mutableListOf<StudioActivityNotification>()
    val yesterday = mutableListOf<StudioActivityNotification>()
    val earlierWeek = mutableListOf<StudioActivityNotification>()
    val older = mutableListOf<StudioActivityNotification>()
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
    "update" -> "Message"
    else -> "Update"
}

private fun colorForType(key: String): Color = when (key) {
    "messages" -> Color(0xFF16A34A)
    "support" -> Color(0xFF8B5CF6)
    "orders" -> Color(0xFF2563EB)
    "tasks" -> Color(0xFFCA8A04)
    "files" -> Color(0xFF0EA5E9)
    "system" -> Color(0xFF6B7280)
    else -> Color(0xFF16A34A)
}

private fun iconAndTintFor(item: StudioActivityNotification): Pair<ImageVector, Color> {
    val key = typeKeyFor(item)
    val tint = colorForType(key)
    val icon = when (key) {
        "messages" -> Icons.Filled.Mail
        "support" -> Icons.Filled.SupportAgent
        "orders" -> Icons.Filled.CheckCircle
        "tasks" -> Icons.Filled.Task
        "files" -> Icons.Filled.AttachFile
        "system" -> Icons.Filled.Build
        else -> Icons.Filled.Update
    }
    return icon to tint
}

private fun senderLine(item: StudioActivityNotification): String {
    val name = item.senderName.trim()
    val email = item.senderEmail.trim()
    return when {
        name.isNotEmpty() && email.isNotEmpty() -> "$name • $email"
        name.isNotEmpty() -> name
        email.isNotEmpty() -> email
        else -> item.title.ifBlank { "Notification" }
    }
}

private fun timeTextFor(date: Date?, sectionId: String): String {
    if (date == null) return ""
    return when (sectionId) {
        "today" -> SimpleDateFormat("HH:mm", Locale.getDefault()).format(date)
        "yesterday" -> SimpleDateFormat("HH:mm", Locale.getDefault()).format(date)
        else -> SimpleDateFormat("dd MMM yyyy", Locale.getDefault()).format(date)
    }
}
