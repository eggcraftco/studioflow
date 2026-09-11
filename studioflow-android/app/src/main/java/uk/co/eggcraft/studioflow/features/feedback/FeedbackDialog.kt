package uk.co.eggcraft.studioflow.features.feedback

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.firebase.functions.FirebaseFunctionsException
import kotlinx.coroutines.launch
import uk.co.eggcraft.studioflow.data.firebase.StudioFlowRepository
import uk.co.eggcraft.studioflow.features.settings.NDChoiceCard
import uk.co.eggcraft.studioflow.features.settings.NDSettings
import uk.co.eggcraft.studioflow.language.LocalStudioLanguage
import uk.co.eggcraft.studioflow.language.studioT
import java.util.UUID

/**
 * Feedback v1 on Android: the "Send feedback" entry in the account menu and the short form
 * behind it, on the same callables the web uses (functions/feedback.js — getFeedbackPrompt for
 * "is it on for this workspace", submitFeedback for the note). The entry shows only when the
 * server says the feature is on; the form asks one required answer (how it is going), an
 * optional topic and an optional note, and attaches nothing else. There is no first-success
 * invitation here — that stays on the web (§34); this is the manual entry only.
 */
object FeedbackAvailability {
    /** One availability ask per workspace per ten minutes — the web keeps the same cadence. */
    private const val INTERVAL_MS = 10L * 60L * 1000L
    private val lastAsked = HashMap<String, Long>()
    private val lastAnswer = HashMap<String, Boolean>()

    /** The callable never throws for a disabled feature: it answers enabled:false and the entry stays hidden. */
    suspend fun enabled(repository: StudioFlowRepository, workspaceId: String, force: Boolean = false): Boolean {
        if (workspaceId.isBlank()) return false
        val now = System.currentTimeMillis()
        val asked = lastAsked[workspaceId]
        if (!force && asked != null && now - asked < INTERVAL_MS) return lastAnswer[workspaceId] ?: false
        lastAsked[workspaceId] = now
        val answer = runCatching { repository.feedbackAvailable(workspaceId) }.getOrDefault(false)
        lastAnswer[workspaceId] = answer
        return answer
    }
}

private val EXPERIENCES = listOf("easy" to "Going well", "okay" to "It's okay", "difficult" to "Struggling")
private val KINDS = listOf("problem" to "Something isn't working", "missing_feature" to "Something is missing", "suggestion" to "A suggestion")
private const val TEXT_MAX = 2000

private fun newClientKey(): String = UUID.randomUUID().toString().replace("-", "")

@Composable
fun FeedbackDialog(workspaceId: String, page: String, repository: StudioFlowRepository, onDismiss: () -> Unit) {
    val lang = LocalStudioLanguage.current
    val t: (String) -> String = { studioT(it, lang) }
    val scope = rememberCoroutineScope()
    var experience by rememberSaveable { mutableStateOf("") }
    var kind by rememberSaveable { mutableStateOf("") }
    var note by rememberSaveable { mutableStateOf("") }
    var clientKey by rememberSaveable { mutableStateOf(newClientKey()) }
    var sending by remember { mutableStateOf(false) }
    var sent by rememberSaveable { mutableStateOf(false) }
    var errorText by remember { mutableStateOf("") }

    AlertDialog(
        // Cancel keeps the draft, like the web; only a successful send clears it.
        onDismissRequest = { if (!sending) onDismiss() },
        title = { Text(if (sent) t("Thank you") else t("Send feedback"), fontWeight = FontWeight.ExtraBold) },
        text = {
            if (sent) {
                Text(
                    t("We read every note. If it needs a reply, we will write to the email on your account."),
                    fontSize = 13.5.sp,
                    color = NDSettings.muted()
                )
            } else {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 520.dp)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(t("Choose an option and send. Add a note if you like."), color = NDSettings.muted(), fontSize = 12.sp)
                    ChoiceGroup(title = t("Overall"), optional = false, options = EXPERIENCES, selection = experience, t = t) { experience = it }
                    // An optional answer can be taken back by tapping it again; the required one only changes.
                    ChoiceGroup(title = t("What is it about?"), optional = true, options = KINDS, selection = kind, t = t) { kind = if (kind == it) "" else it }
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        OutlinedTextField(
                            value = note,
                            onValueChange = { note = it.take(TEXT_MAX) },
                            modifier = Modifier.fillMaxWidth(),
                            minLines = 3,
                            label = { Text(t("Tell us more") + " " + t("(optional)")) },
                            placeholder = { Text(t("What happened, or what would help?")) }
                        )
                        if (TEXT_MAX - note.length < 200) {
                            Text("${TEXT_MAX - note.length}", fontSize = 11.sp, color = NDSettings.muted(), modifier = Modifier.align(Alignment.End))
                        }
                    }
                    Text(
                        t("We send your feedback with your account and workspace details, current page, language and platform. We don't automatically attach customer, order or bank records."),
                        fontSize = 11.5.sp,
                        color = NDSettings.muted()
                    )
                    if (errorText.isNotBlank()) {
                        Text(errorText, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, color = NDSettings.danger)
                    }
                }
            }
        },
        confirmButton = {
            if (sent) {
                Button(onClick = onDismiss, colors = ButtonDefaults.buttonColors(containerColor = NDSettings.accent)) { Text(t("Close")) }
            } else {
                Button(
                    onClick = {
                        if (experience.isBlank()) {
                            errorText = t("Please choose how it is going before sending.")
                            return@Button
                        }
                        sending = true
                        errorText = ""
                        scope.launch {
                            runCatching { repository.submitFeedback(workspaceId, experience, kind, note, page, clientKey, lang) }
                                .onSuccess {
                                    sent = true
                                    experience = ""
                                    kind = ""
                                    note = ""
                                    clientKey = newClientKey()
                                }
                                .onFailure { errorText = feedbackErrorText(it, t) }
                            sending = false
                        }
                    },
                    enabled = !sending && experience.isNotBlank(),
                    colors = ButtonDefaults.buttonColors(containerColor = NDSettings.accent)
                ) { Text(if (sending) t("Sending…") else t("Send")) }
            }
        },
        dismissButton = {
            if (!sent) TextButton(onClick = onDismiss, enabled = !sending) { Text(t("Cancel")) }
        }
    )
}

@Composable
private fun ChoiceGroup(
    title: String,
    optional: Boolean,
    options: List<Pair<String, String>>,
    selection: String,
    t: (String) -> String,
    onSelect: (String) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(title, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = NDSettings.text())
            if (optional) Text(t("(optional)"), fontSize = 12.sp, color = NDSettings.muted())
        }
        options.forEach { (value, label) ->
            NDChoiceCard(title = t(label), description = "", selected = selection == value) { onSelect(value) }
        }
    }
}

/** The same sentences the web shows, chosen by the callable's error code. */
fun feedbackErrorText(error: Throwable, t: (String) -> String): String = when ((error as? FirebaseFunctionsException)?.code) {
    FirebaseFunctionsException.Code.RESOURCE_EXHAUSTED -> t("Too many messages in a short time. Please try again later.")
    FirebaseFunctionsException.Code.FAILED_PRECONDITION -> t("Feedback is not available yet.")
    FirebaseFunctionsException.Code.PERMISSION_DENIED -> t("You do not have access to this workspace.")
    FirebaseFunctionsException.Code.INVALID_ARGUMENT -> t("Please choose how it is going before sending.")
    else -> t("Your feedback could not be sent. Please try again.")
}
