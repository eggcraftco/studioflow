package uk.co.eggcraft.studioflow.features.help

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import uk.co.eggcraft.studioflow.data.firebase.AppAssistantAnswer
import uk.co.eggcraft.studioflow.data.firebase.StudioFlowRepository
import uk.co.eggcraft.studioflow.data.model.StudioWorkspace
import androidx.compose.material3.TextButton
import androidx.compose.ui.graphics.Color

/**
 * In-app "How do I…?" helper.
 *
 * Answers come from the NivaDesk user guide only: the assistant cannot read the
 * workspace, so questions about the person's own orders or figures are pointed
 * at the ChatGPT app, and anything the guide does not cover goes to Contact
 * NivaDesk Support. Paid plans only — the server enforces that too.
 */
/** [ticket] is "" not sent, "sending", "sent", or the error to show. */
private data class HelpTurn(
    val question: String,
    val answer: AppAssistantAnswer,
    val ticket: String = ""
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppHelpAssistantSheet(
    repository: StudioFlowRepository,
    workspace: StudioWorkspace?,
    language: String,
    t: (String) -> String,
    onDismiss: () -> Unit
) {
    val companyId = workspace?.id.orEmpty()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    var question by remember { mutableStateOf("") }
    var turns by remember { mutableStateOf<List<HelpTurn>>(emptyList()) }
    var busy by remember { mutableStateOf(false) }
    var errorText by remember { mutableStateOf("") }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(t("NivaDesk help"), fontSize = 17.sp, fontWeight = FontWeight.Bold)
            Text(t("Answers from the user guide."), fontSize = 13.sp)

            if (turns.isEmpty()) {
                Text(
                    t("Ask how something in NivaDesk works — where a button lives, what a card is for, how to set something up. This assistant reads the guide, not your workspace, so it never sees your orders or figures."),
                    fontSize = 13.sp
                )
            }

            turns.forEachIndexed { index, turn ->
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(turn.question, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Text(turn.answer.answer, fontSize = 14.sp)
                    if (turn.answer.sources.isNotEmpty()) {
                        Text("${t("Guide")}: ${turn.answer.sources.joinToString(" · ")}", fontSize = 11.sp)
                    }
                    if (turn.answer.needsChatGPT) {
                        Text(
                            t("Your own orders and figures live in the NivaDesk ChatGPT app, which connects to your workspace with your permission."),
                            fontSize = 12.sp
                        )
                    }
                    // The question the guide could not answer IS the ticket. This
                    // used to be a sentence telling people where to go and retype
                    // it.
                    if (turn.answer.needsSupport) {
                        if (turn.ticket == "sent") {
                            Text(t("Sent to NivaDesk Support."), fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold, color = Color(0xFF15803D))
                        } else {
                            TextButton(
                                onClick = {
                                    val ws = workspace ?: return@TextButton
                                    val at = index
                                    turns = turns.mapIndexed { n, item ->
                                        if (n == at) item.copy(ticket = "sending") else item
                                    }
                                    scope.launch {
                                        val attempted = t("The in-app assistant could not answer this. What it replied:")
                                        val outcome = runCatching {
                                            repository.createSupportTicket(
                                                workspace = ws,
                                                category = "question",
                                                priority = "normal",
                                                title = turn.question.take(120),
                                                message = "${turn.question}\n\n---\n$attempted\n${turn.answer.answer}"
                                            )
                                        }
                                        turns = turns.mapIndexed { n, item ->
                                            if (n != at) item
                                            else item.copy(
                                                ticket = if (outcome.isSuccess) "sent"
                                                else outcome.exceptionOrNull()?.message
                                                    ?: t("The ticket could not be sent.")
                                            )
                                        }
                                    }
                                },
                                enabled = workspace != null && turn.ticket != "sending"
                            ) {
                                Text(
                                    if (turn.ticket == "sending") t("Sending...")
                                    else t("Send this to NivaDesk Support"),
                                    fontSize = 12.sp, fontWeight = FontWeight.Bold
                                )
                            }
                            if (turn.ticket.isNotBlank() && turn.ticket != "sending") {
                                Text(turn.ticket, fontSize = 11.sp, color = Color(0xFFDC2626))
                            }
                        }
                    }
                }
            }

            if (busy) Text(t("Looking it up…"), fontSize = 13.sp)
            if (errorText.isNotBlank()) Text(errorText, fontSize = 12.sp)

            OutlinedTextField(
                value = question,
                onValueChange = { question = it },
                label = { Text(t("How do I add a material to an order?")) },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2
            )

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = {
                        val clean = question.trim()
                        if (clean.isBlank() || busy) return@Button
                        busy = true
                        errorText = ""
                        scope.launch {
                            runCatching { repository.askAppAssistant(companyId, clean, language) }
                                .onSuccess { answer ->
                                    busy = false
                                    turns = turns + HelpTurn(clean, answer)
                                    question = ""
                                }
                                .onFailure { error ->
                                    busy = false
                                    errorText = error.message ?: "The assistant could not answer just now."
                                }
                        }
                    },
                    enabled = !busy
                ) {
                    Text(if (busy) t("Asking...") else t("Ask"))
                }
            }
        }
    }
}

/**
 * Floating "How do I…?" entry point. It asks the server whether this workspace
 * may use the assistant (paid plans only) and stays invisible otherwise.
 */
@Composable
fun AppHelpAssistantLauncher(
    repository: StudioFlowRepository,
    workspace: StudioWorkspace?,
    language: String
) {
    val companyId = workspace?.id.orEmpty()
    var available by remember(companyId) { mutableStateOf(false) }
    var open by remember { mutableStateOf(false) }
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, language) }

    LaunchedEffect(companyId) {
        if (companyId.isBlank()) {
            available = false
            return@LaunchedEffect
        }
        available = runCatching { repository.appAssistantAvailable(companyId) }.getOrDefault(false)
    }

    if (!available) return

    Box(modifier = Modifier.fillMaxSize()) {
        ExtendedFloatingActionButton(
            onClick = { open = true },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 18.dp, bottom = 96.dp)
        ) {
            Icon(Icons.Filled.Info, contentDescription = null)
            Text(t("How do I…?"), modifier = Modifier.padding(start = 8.dp))
        }
    }

    if (open) {
        AppHelpAssistantSheet(
            repository = repository,
            workspace = workspace,
            language = language,
            t = t,
            onDismiss = { open = false }
        )
    }
}
