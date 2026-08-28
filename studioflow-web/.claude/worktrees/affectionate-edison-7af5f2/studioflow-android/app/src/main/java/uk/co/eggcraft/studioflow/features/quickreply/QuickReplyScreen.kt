package uk.co.eggcraft.studioflow.features.quickreply

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.PersonOutline
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.automirrored.outlined.List
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.Icon
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.net.HttpURLConnection
import java.net.URL
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import uk.co.eggcraft.studioflow.data.model.QuickReplyTemplateItem
import uk.co.eggcraft.studioflow.features.shell.StudioFlowUiState

@Composable
fun QuickReplyScreen(
    state: StudioFlowUiState,
    onUpdateWorkspaceSettings: (Map<String, Any?>, String) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val settings = state.workspaceSettings
    val workspaceName = state.workspace?.name ?: "NivaDesk"
    val replyMode = normalizeReplyMode(settings.replyMode)
    var politeness by rememberSaveable(settings.quickReplyPoliteness) {
        mutableStateOf(normalizePoliteness(settings.quickReplyPoliteness))
    }
    var length by rememberSaveable(settings.quickReplyLength) {
        mutableStateOf(normalizeLength(settings.quickReplyLength))
    }
    var input by rememberSaveable { mutableStateOf("") }
    var output by rememberSaveable { mutableStateOf("") }
    var replyError by rememberSaveable { mutableStateOf("") }
    var generating by rememberSaveable { mutableStateOf(false) }
    val detectedIntent = remember(input) { detectIntent(input) }

    // Customer name + product/topic pickers (iPhone parity)
    var customerName by rememberSaveable { mutableStateOf("") }
    val categories = remember(settings.quickReplyProducts) {
        settings.quickReplyProducts.map { it.title.trim() }.filter { it.isNotEmpty() }
    }
    val topics = remember(settings.quickReplyRules) {
        listOf("Price & Info") + settings.quickReplyRules.map { it.title.trim() }.filter { it.isNotEmpty() }
    }
    var selectedCategory by rememberSaveable(categories.joinToString("|")) {
        mutableStateOf(categories.firstOrNull().orEmpty())
    }
    var selectedTopic by rememberSaveable(topics.joinToString("|")) {
        mutableStateOf(topics.firstOrNull() ?: "Price & Info")
    }
    val clipboard = LocalClipboardManager.current
    val scope = rememberCoroutineScope()

    fun generate() {
        if (input.isBlank() || generating) return
        replyError = ""
        output = ""
        when (replyMode) {
            "Apple" -> {
                replyError = "Android on-device AI is not active in this build yet. Gemini Nano / ML Kit GenAI integration is required. Use OpenAI Online or Offline Template for now."
            }
            "Offline" -> {
                val filteredProducts = if (selectedCategory.isBlank()) settings.quickReplyProducts
                    else settings.quickReplyProducts.filter { it.title.trim().equals(selectedCategory, ignoreCase = true) }
                val filteredRules = if (selectedTopic.isBlank() || selectedTopic == "Price & Info") settings.quickReplyRules
                    else settings.quickReplyRules.filter { it.title.trim().equals(selectedTopic, ignoreCase = true) }
                output = generateOfflineReply(
                    message = input,
                    politeness = politeness,
                    length = length,
                    intent = detectedIntent,
                    studioName = workspaceName,
                    knowledge = settings.aiKnowledgeBase,
                    products = filteredProducts.ifEmpty { settings.quickReplyProducts },
                    rules = filteredRules.ifEmpty { settings.quickReplyRules },
                    customerName = customerName.trim()
                )
            }
            else -> {
                if (!settings.hasOpenAIKey) {
                    replyError = "OpenAI API Key is missing. Ask the workspace owner to configure it in Quick Reply Settings."
                    return
                }
                val workspaceId = state.workspace?.id.orEmpty()
                if (workspaceId.isBlank()) return
                generating = true
                scope.launch {
                    runCatching {
                        val result = FirebaseFunctions.getInstance("europe-west2")
                            .getHttpsCallable("generateQuickReply")
                            .call(mapOf(
                                "companyId" to workspaceId,
                                "mode" to "AI",
                                "customerMessage" to input,
                                "politeness" to politeness,
                                "length" to length
                            ))
                            .await()
                        val data = result.data as? Map<*, *>
                        data?.get("reply")?.toString().orEmpty()
                    }.onSuccess { reply ->
                        output = reply
                    }.onFailure { error ->
                        replyError = error.message ?: t("Could not generate a reply.")
                    }
                    generating = false
                }
            }
        }
    }

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        val wide = maxWidth >= 900.dp
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                QuickReplyHeader(replyMode)
            }
            item {
                ReplyEngineStatusCard(
                    mode = replyMode,
                    apiKeyReady = settings.hasOpenAIKey,
                    knowledgeReady = settings.aiKnowledgeBase.isNotBlank(),
                    productsReady = settings.quickReplyProducts.any { it.title.isNotBlank() || it.desc.isNotBlank() },
                    rulesReady = settings.quickReplyRules.any { it.title.isNotBlank() || it.desc.isNotBlank() }
                )
            }
            item {
                QuickReplyStyleCard(
                    politeness = politeness,
                    length = length,
                    onPoliteness = {
                        politeness = it
                        onUpdateWorkspaceSettings(mapOf("quickReplyPoliteness" to it), "Reply style saved.")
                    },
                    onLength = {
                        length = it
                        onUpdateWorkspaceSettings(mapOf("quickReplyLength" to it), "Reply style saved.")
                    }
                )
            }
            item {
                QuickReplyDetailsCard(
                    customerName = customerName,
                    onCustomerNameChange = { customerName = it },
                    categories = categories,
                    selectedCategory = selectedCategory,
                    onCategoryChange = { selectedCategory = it },
                    topics = topics,
                    selectedTopic = selectedTopic,
                    onTopicChange = { selectedTopic = it }
                )
            }
            if (wide) {
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        verticalAlignment = Alignment.Top
                    ) {
                        QuickReplyInputCard(
                            input = input,
                            onInput = { input = it.take(8000) },
                            detectedIntent = detectedIntent,
                            replyMode = replyMode,
                            generating = generating,
                            onGenerate = ::generate,
                            onClear = {
                                input = ""
                                output = ""
                                replyError = ""
                            },
                            modifier = Modifier.weight(1f),
                            horizontalPadding = 0.dp
                        )
                        QuickReplyOutputCard(
                            output = output,
                            error = replyError,
                            onCopy = { clipboard.setText(AnnotatedString(output)) },
                            modifier = Modifier.weight(1f),
                            horizontalPadding = 0.dp
                        )
                    }
                }
            } else {
                item {
                    QuickReplyInputCard(
                        input = input,
                        onInput = { input = it.take(8000) },
                        detectedIntent = detectedIntent,
                        replyMode = replyMode,
                        generating = generating,
                        onGenerate = ::generate,
                        onClear = {
                            input = ""
                            output = ""
                            replyError = ""
                        }
                    )
                }
                if (output.isNotBlank() || replyError.isNotBlank()) {
                    item {
                        QuickReplyOutputCard(
                            output = output,
                            error = replyError,
                            onCopy = { clipboard.setText(AnnotatedString(output)) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun QuickReplyHeader(replyMode: String) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .background(
                    Brush.linearGradient(listOf(Color(0xFF8B35F6), Color(0xFFE031D9))),
                    RoundedCornerShape(14.dp)
                ),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Outlined.AutoAwesome, contentDescription = null, tint = Color.White, modifier = Modifier.size(28.dp))
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                replyModeTitle(replyMode),
                fontSize = 22.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 2,
                lineHeight = 26.sp
            )
            Text(
                replyModeSubtitle(replyMode),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 13.sp,
                fontWeight = FontWeight.Normal,
                lineHeight = 18.sp,
                modifier = Modifier.padding(top = 2.dp)
            )
        }
    }
}

@Composable
private fun ReplyEngineStatusCard(
    mode: String,
    apiKeyReady: Boolean,
    knowledgeReady: Boolean,
    productsReady: Boolean,
    rulesReady: Boolean
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    QuickReplyCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .background(Color(0xFFEEDCFF), RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(replyModeIcon(mode), contentDescription = null, tint = Color(0xFFA73CFA), modifier = Modifier.size(26.dp))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(replyModeLabel(mode), fontSize = 19.sp, fontWeight = FontWeight.ExtraBold)
                Text(replyModeDescription(mode), color = Color(0xFF8385A8), fontWeight = FontWeight.Bold, lineHeight = 19.sp)
            }
        }
        if (mode == "AI" || mode == "Offline") {
            Spacer(modifier = Modifier.height(12.dp))
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (mode == "AI") {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        StatusPill(
                            label = if (apiKeyReady) t("API key ready") else t("API key missing"),
                            active = apiKeyReady,
                            icon = Icons.Filled.Key
                        )
                        StatusPill(
                            label = if (knowledgeReady) "Knowledge base ready" else "No knowledge base",
                            active = knowledgeReady,
                            icon = Icons.Outlined.AutoAwesome
                        )
                    }
                }
                if (mode == "Offline") {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        StatusPill(
                            label = if (knowledgeReady) "Knowledge ready" else "No knowledge",
                            active = knowledgeReady,
                            icon = Icons.Outlined.AutoAwesome
                        )
                        StatusPill(
                            label = if (productsReady) "Products ready" else "No products",
                            active = productsReady,
                            icon = Icons.AutoMirrored.Outlined.List
                        )
                    }
                    StatusPill(
                        label = if (rulesReady) t("Custom rules ready") else "No custom rules",
                        active = rulesReady,
                        icon = Icons.Filled.CheckCircle
                    )
                }
            }
        }
    }
}

@Composable
private fun StatusPill(label: String, active: Boolean, icon: ImageVector) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = if (active) Color(0xFFE4F9EA) else Color(0xFFFFEFEF)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 11.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(icon, contentDescription = null, tint = if (active) Color(0xFF34C759) else Color(0xFFFF3B30), modifier = Modifier.size(16.dp))
            Text(label, fontWeight = FontWeight.ExtraBold, color = if (active) Color(0xFF34C759) else Color(0xFFFF3B30), fontSize = 12.sp)
        }
    }
}

@Composable
private fun QuickReplyStyleCard(
    politeness: String,
    length: String,
    onPoliteness: (String) -> Unit,
    onLength: (String) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    QuickReplyCard {
        SegmentTitle(Icons.Filled.FavoriteBorder, "Politeness")
        SegmentRow(
            options = listOf(
                SegmentOption(t("Direct"), Icons.AutoMirrored.Outlined.Send),
                SegmentOption("Warm", Icons.Filled.FavoriteBorder),
                SegmentOption("Very Polite", Icons.Filled.StarBorder)
            ),
            selected = politeness,
            onSelect = onPoliteness
        )
        Spacer(modifier = Modifier.height(14.dp))
        SegmentTitle(Icons.Filled.Timer, "Length")
        SegmentRow(
            options = listOf(
                SegmentOption("Short", Icons.AutoMirrored.Outlined.List),
                SegmentOption(t("Balanced"), Icons.Filled.MailOutline),
                SegmentOption(t("Detailed"), Icons.AutoMirrored.Outlined.List)
            ),
            selected = length,
            onSelect = onLength
        )
    }
}

@Composable
private fun QuickReplyDetailsCard(
    customerName: String,
    onCustomerNameChange: (String) -> Unit,
    categories: List<String>,
    selectedCategory: String,
    onCategoryChange: (String) -> Unit,
    topics: List<String>,
    selectedTopic: String,
    onTopicChange: (String) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    QuickReplyCard {
        SegmentTitle(Icons.Filled.PersonOutline, t("Details"))
        OutlinedTextField(
            value = customerName,
            onValueChange = onCustomerNameChange,
            label = { Text(t("Customer name")) },
            placeholder = { Text("e.g. John") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(modifier = Modifier.height(10.dp))
        if (categories.isNotEmpty()) {
            DropdownPicker(
                label = "Product / Service",
                value = selectedCategory.ifBlank { categories.first() },
                options = categories,
                onSelect = onCategoryChange
            )
        } else {
            Text(
                "Add products/services in Settings → Quick Reply Settings to enable picker.",
                color = MaterialTheme.colorScheme.error,
                fontSize = 12.sp
            )
        }
        Spacer(modifier = Modifier.height(10.dp))
        DropdownPicker(
            label = "Topic / Rule",
            value = selectedTopic.ifBlank { topics.firstOrNull() ?: "Price & Info" },
            options = topics,
            onSelect = onTopicChange
        )
    }
}

@Composable
private fun DropdownPicker(
    label: String,
    value: String,
    options: List<String>,
    onSelect: (String) -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var expanded by remember { mutableStateOf(false) }
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(label, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
        Spacer(modifier = Modifier.height(4.dp))
        Box {
            OutlinedTextField(
                value = value,
                onValueChange = {},
                readOnly = true,
                trailingIcon = {
                    androidx.compose.material3.IconButton(onClick = { expanded = true }) {
                        Icon(Icons.Filled.ArrowDropDown, contentDescription = "Open")
                    }
                },
                modifier = Modifier.fillMaxWidth()
            )
            androidx.compose.material3.DropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false }
            ) {
                options.forEach { option ->
                    androidx.compose.material3.DropdownMenuItem(
                        text = { Text(option) },
                        onClick = { onSelect(option); expanded = false }
                    )
                }
            }
        }
    }
}

@Composable
private fun QuickReplyInputCard(
    input: String,
    onInput: (String) -> Unit,
    detectedIntent: String,
    replyMode: String,
    generating: Boolean,
    onGenerate: () -> Unit,
    onClear: () -> Unit,
    modifier: Modifier = Modifier,
    horizontalPadding: Dp = 16.dp
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    QuickReplyCard(modifier = modifier, horizontalPadding = horizontalPadding) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .background(Color(0xFFEEDCFF), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Filled.MailOutline, contentDescription = null, tint = Color(0xFFA73CFA), modifier = Modifier.size(28.dp))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text("Customer's\nEmail / Message", fontSize = 21.sp, fontWeight = FontWeight.ExtraBold, lineHeight = 23.sp)
                Text("Paste the full email or message. The AI will detect the context.", color = Color(0xFF8385A8), fontWeight = FontWeight.Bold)
            }
            Text("${input.length} / 8000", color = Color(0xFF8385A8), fontWeight = FontWeight.ExtraBold)
        }
        Spacer(modifier = Modifier.height(14.dp))
        OutlinedTextField(
            value = input,
            onValueChange = onInput,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 280.dp, max = 430.dp),
            shape = RoundedCornerShape(12.dp),
            placeholder = { Text("Paste the customer's email or message here...") }
        )
        Spacer(modifier = Modifier.height(12.dp))
        Text("Tip: Include as much context as possible for the best reply.", color = Color(0xFF8385A8), fontWeight = FontWeight.Bold)
        if (input.isNotBlank()) {
            Spacer(modifier = Modifier.height(10.dp))
            Surface(shape = RoundedCornerShape(999.dp), color = Color(0xFFF1E3FF)) {
                Text(
                    "Detected: $detectedIntent",
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    color = Color(0xFFA73CFA),
                    fontWeight = FontWeight.ExtraBold
                )
            }
        }
        Spacer(modifier = Modifier.height(12.dp))
        Button(
            onClick = onGenerate,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            enabled = input.isNotBlank() && !generating
        ) {
            if (generating) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
            } else {
                Icon(Icons.Outlined.AutoAwesome, contentDescription = null)
            }
            Spacer(modifier = Modifier.size(8.dp))
            Text(generateButtonLabel(replyMode, generating), fontWeight = FontWeight.ExtraBold)
        }
        if (input.isNotBlank()) {
            TextButton(
                onClick = onClear,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(t("Clear Draft"), fontWeight = FontWeight.ExtraBold)
            }
        }
    }
}

@Composable
private fun QuickReplyOutputCard(
    output: String,
    error: String,
    onCopy: () -> Unit,
    modifier: Modifier = Modifier,
    horizontalPadding: Dp = 16.dp
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    QuickReplyCard(modifier = modifier, horizontalPadding = horizontalPadding) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(
                if (error.isBlank()) Icons.Filled.CheckCircle else Icons.Filled.Warning,
                contentDescription = null,
                tint = if (error.isBlank()) Color(0xFF34C759) else Color(0xFFFF3B30)
            )
            Text(if (error.isBlank()) t("Generated Reply") else "Reply Needs Attention", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
        }
        Spacer(modifier = Modifier.height(10.dp))
        val body = when {
            error.isNotBlank() -> error
            output.isNotBlank() -> output
            else -> "No reply generated yet."
        }
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = if (error.isBlank()) MaterialTheme.colorScheme.surfaceVariant else Color(0xFFFFEFEF)
        ) {
            Text(
                body,
                modifier = Modifier.padding(14.dp).fillMaxWidth().widthIn(min = 0.dp),
                lineHeight = 20.sp,
                fontWeight = FontWeight.SemiBold,
                color = if (error.isBlank()) MaterialTheme.colorScheme.onSurface else Color(0xFFFF3B30)
            )
        }
        if (output.isNotBlank()) {
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedButton(
                onClick = onCopy,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            ) {
                Icon(Icons.Filled.ContentCopy, contentDescription = null)
                Spacer(modifier = Modifier.size(8.dp))
                Text(t("Copy Reply"), fontWeight = FontWeight.ExtraBold)
            }
        }
    }
}

@Composable
private fun QuickReplyCard(
    modifier: Modifier = Modifier,
    horizontalPadding: Dp = 16.dp,
    content: @Composable ColumnScope.() -> Unit
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = horizontalPadding),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp
    ) {
        Column(modifier = Modifier.padding(18.dp), content = content)
    }
}

@Composable
private fun SegmentTitle(icon: ImageVector, title: String) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Icon(icon, contentDescription = null, tint = Color(0xFF8385A8))
        Text(title, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
    }
    Spacer(modifier = Modifier.height(10.dp))
}

@Composable
private fun SegmentRow(options: List<SegmentOption>, selected: String, onSelect: (String) -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, Color(0xFFE6D7F7), RoundedCornerShape(12.dp)),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        options.forEach { option ->
            val active = selected == option.label
            Surface(
                modifier = Modifier
                    .weight(1f)
                    .padding(2.dp),
                shape = RoundedCornerShape(10.dp),
                color = if (active) Color(0xFFF1E3FF) else Color.Transparent,
                onClick = { onSelect(option.label) }
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 11.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(option.icon, contentDescription = null, tint = if (active) Color(0xFFA73CFA) else MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.size(7.dp))
                    Text(option.label, maxLines = 1, overflow = TextOverflow.Ellipsis, color = if (active) Color(0xFFA73CFA) else MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.ExtraBold)
                }
            }
        }
    }
}

private data class SegmentOption(val label: String, val icon: ImageVector)

private fun detectIntent(message: String): String {
    val clean = message.lowercase()
    return when {
        listOf("price", "quote", "cost", "how much", "payment").any { it in clean } -> "Price / payment question"
        listOf("late", "delay", "when", "tracking", "delivery").any { it in clean } -> "Delivery / timing question"
        listOf("change", "revision", "edit", "update").any { it in clean } -> "Design change request"
        listOf("refund", "cancel", "complaint", "problem").any { it in clean } -> "Support issue"
        else -> "General message"
    }
}

private fun normalizeReplyMode(value: String): String = when (value) {
    "Apple", "Local" -> "Apple"
    "Offline" -> "Offline"
    else -> "AI"
}

private fun normalizePoliteness(value: String): String = when (value) {
    "Direct", "Very Polite" -> value
    else -> "Warm"
}

private fun normalizeLength(value: String): String = when (value) {
    "Balanced", "Detailed" -> value
    else -> "Short"
}

private fun replyModeTitle(mode: String): String = when (mode) {
    "Apple" -> "On-Device AI Quick Reply"
    "Offline" -> "Offline Quick Reply"
    else -> "AI Quick Reply Assistant"
}

private fun replyModeSubtitle(mode: String): String = when (mode) {
    "Apple" -> "Apple mode is shared from Mac and iPhone settings."
    "Offline" -> "Create structured replies from saved workspace context."
    else -> "Create professional, context-aware replies in seconds."
}

private fun replyModeLabel(mode: String): String = when (mode) {
    "Apple" -> "On-Device AI"
    "Offline" -> "Offline Template"
    else -> "OpenAI Online"
}

private fun replyModeDescription(mode: String): String = when (mode) {
    "Apple" -> "Uses Apple Foundation Models on Apple devices. Android can show the setting, but generation runs through OpenAI Online or Offline Template."
    "Offline" -> "Uses the saved company knowledge base and message intent without an online AI request."
    else -> "Uses OpenAI online with the shared workspace API key and company knowledge base."
}

private fun replyModeIcon(mode: String): ImageVector = when (mode) {
    "Apple" -> Icons.Filled.Warning
    "Offline" -> Icons.AutoMirrored.Outlined.List
    else -> Icons.Outlined.AutoAwesome
}

private fun generateButtonLabel(mode: String, generating: Boolean): String = when {
    generating -> "Generating..."
    mode == "Apple" -> "Show Android Notice"
    mode == "Offline" -> "Generate Offline Reply"
    else -> "Generate AI Reply"
}

private fun generateOfflineReply(
    message: String,
    politeness: String,
    length: String,
    intent: String,
    studioName: String,
    knowledge: String,
    products: List<QuickReplyTemplateItem>,
    rules: List<QuickReplyTemplateItem>,
    customerName: String = ""
): String {
    val name = customerName.trim()
    val greeting = when (politeness) {
        "Direct" -> if (name.isNotEmpty()) "Hi $name," else "Hi,"
        "Very Polite" -> if (name.isNotEmpty()) "Hello $name, thank you very much for your message." else "Hello, thank you very much for your message."
        else -> if (name.isNotEmpty()) "Hi $name, thanks so much for your message." else "Hi, thanks so much for your message."
    }
    val intentLine = when (intent) {
        "Price / payment question" -> "I will check the project details and confirm the price/payment information clearly."
        "Delivery / timing question" -> "I will check the current schedule and update you with the most accurate timing."
        "Design change request" -> "I will review the requested change and confirm what can be adjusted before we continue."
        "Support issue" -> "I am sorry about the issue. I will review this carefully and come back with the best next step."
        else -> "I have received the details and will review them."
    }
    val knowledgeLine = knowledge
        .trim()
        .replace(Regex("\\s+"), " ")
        .take(260)
        .takeIf { it.isNotBlank() }
    val productLine = bestTemplateMatch(message, products)?.let { template ->
        templateSummary(template)
    }
    val ruleLine = bestTemplateMatch(message, rules)?.let { template ->
        templateSummary(template)
    }
    val body = when (length) {
        "Detailed" -> buildString {
            append(intentLine)
            append(" I will also include the next steps, timing and any questions needed to move this forward.")
            if (knowledgeLine != null) append(" I will keep our workspace notes in mind: $knowledgeLine")
            if (productLine != null) append(" The relevant service note is: $productLine")
            if (ruleLine != null) append(" The relevant workspace rule is: $ruleLine")
        }
        "Balanced" -> buildString {
            append(intentLine)
            append(" I will come back to you with the next steps shortly.")
            if (knowledgeLine != null) append(" I will use our saved workspace notes as the reference.")
            if (productLine != null || ruleLine != null) append(" I will also check the saved service/rule template before confirming.")
        }
        else -> intentLine
    }
    val close = if (message.contains("urgent", ignoreCase = true)) {
        "I will treat this as a priority."
    } else {
        "Kind regards,\n$studioName"
    }
    return "$greeting\n\n$body\n\n$close"
}

private fun bestTemplateMatch(message: String, items: List<QuickReplyTemplateItem>): QuickReplyTemplateItem? {
    val clean = message.lowercase()
    return items
        .filter { it.title.isNotBlank() || it.desc.isNotBlank() }
        .maxByOrNull { item ->
            val words = item.title
                .lowercase()
                .split(Regex("[^a-z0-9]+"))
                .filter { it.length >= 3 }
            words.count { it in clean }
        }
        ?: items.firstOrNull { it.title.isNotBlank() || it.desc.isNotBlank() }
}

private fun templateSummary(item: QuickReplyTemplateItem): String {
    val title = item.title.trim()
    val desc = item.desc.trim().replace(Regex("\\s+"), " ").take(180)
    return when {
        title.isNotBlank() && desc.isNotBlank() -> "$title - $desc"
        title.isNotBlank() -> title
        else -> desc
    }
}

private suspend fun generateOpenAIReply(
    apiKey: String,
    message: String,
    politeness: String,
    length: String,
    intent: String,
    studioName: String,
    knowledge: String,
    products: List<QuickReplyTemplateItem>,
    rules: List<QuickReplyTemplateItem>,
    customerName: String = ""
): String = withContext(Dispatchers.IO) {
    val cleanName = customerName.trim()
    val systemBase = openAiSystemPrompt(studioName, politeness, length, intent, knowledge, products, rules)
    val systemContent = if (cleanName.isNotEmpty()) "$systemBase\n\nAddress the customer by their first name: $cleanName."
        else systemBase
    val payload = JSONObject()
        .put("model", "gpt-4o-mini")
        .put("temperature", 0.2)
        .put(
            "messages",
            JSONArray()
                .put(
                    JSONObject()
                        .put("role", "system")
                        .put("content", systemContent)
                )
                .put(
                    JSONObject()
                        .put("role", "user")
                        .put("content", message)
                )
        )

    val connection = (URL("https://api.openai.com/v1/chat/completions").openConnection() as HttpURLConnection)
    try {
        connection.requestMethod = "POST"
        connection.setRequestProperty("Authorization", "Bearer $apiKey")
        connection.setRequestProperty("Content-Type", "application/json")
        connection.doOutput = true
        connection.outputStream.use { stream ->
            stream.write(payload.toString().toByteArray(Charsets.UTF_8))
        }
        val code = connection.responseCode
        val response = (if (code in 200..299) connection.inputStream else connection.errorStream)
            ?.bufferedReader()
            ?.use { it.readText() }
            .orEmpty()
        if (code !in 200..299) {
            error(parseOpenAIError(response, code))
        }
        val content = JSONObject(response)
            .optJSONArray("choices")
            ?.optJSONObject(0)
            ?.optJSONObject("message")
            ?.optString("content")
            .orEmpty()
            .trim()
        if (content.isBlank()) error("OpenAI returned an empty reply.")
        content
    } finally {
        connection.disconnect()
    }
}

private fun openAiSystemPrompt(
    studioName: String,
    politeness: String,
    length: String,
    intent: String,
    knowledge: String,
    products: List<QuickReplyTemplateItem>,
    rules: List<QuickReplyTemplateItem>
): String {
    val knowledgeBlock = knowledge.trim().ifBlank {
        "No company knowledge base has been added yet. Do not invent prices, deadlines, policies or order facts."
    }
    val productsBlock = templateBlock(products, "No products or services have been added.")
    val rulesBlock = templateBlock(rules, "No custom rules or FAQs have been added.")
    return """
        You are the customer support assistant for $studioName.
        Write one polished customer reply only.
        Tone: $politeness.
        Length: $length.
        Detected intent: $intent.
        Use the company knowledge base below as the source of truth. If the answer is not in the knowledge base or the customer message, say the team will check and confirm.
        Do not invent pricing, delivery promises, refund rules, availability, order status, links or policies.
        Keep the reply professional and ready to send.

        Company knowledge base:
        $knowledgeBlock

        Products / services:
        $productsBlock

        Custom rules / FAQs:
        $rulesBlock
    """.trimIndent()
}

private fun templateBlock(items: List<QuickReplyTemplateItem>, fallback: String): String {
    val lines = items
        .filter { it.title.isNotBlank() || it.desc.isNotBlank() }
        .take(12)
        .map { "- ${templateSummary(it)}" }
    return lines.takeIf { it.isNotEmpty() }?.joinToString("\n") ?: fallback
}

private fun parseOpenAIError(response: String, code: Int): String {
    return runCatching {
        JSONObject(response).optJSONObject("error")?.optString("message").orEmpty()
    }.getOrNull()?.takeIf { it.isNotBlank() } ?: "OpenAI request failed ($code)."
}
