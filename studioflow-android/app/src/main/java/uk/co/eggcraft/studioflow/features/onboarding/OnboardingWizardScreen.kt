package uk.co.eggcraft.studioflow.features.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val CardBackground = Color(0xFF1B1B1F)
private val ScreenBackground = Color(0xFF121212)
private val Accent = Color(0xFF4C8DFF)
private val Muted = Color(0xFF9AA0A6)

@Composable
private fun WizardChip(title: String, isOn: Boolean, onClick: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = if (isOn) Accent.copy(alpha = 0.18f) else Color.White.copy(alpha = 0.06f),
        modifier = Modifier.padding(end = 8.dp, bottom = 8.dp)
    ) {
        TextButton(onClick = onClick) {
            Text(
                title,
                fontSize = 13.sp,
                fontWeight = if (isOn) FontWeight.SemiBold else FontWeight.Normal,
                color = if (isOn) Accent else Color.White
            )
        }
    }
}

@Composable
private fun WizardOptionRow(title: String, detail: String, isOn: Boolean, onClick: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = if (isOn) Accent.copy(alpha = 0.10f) else Color.White.copy(alpha = 0.04f),
        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
    ) {
        TextButton(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = if (isOn) Accent else Color.Transparent,
                    border = if (isOn) null else androidx.compose.foundation.BorderStroke(1.dp, Muted),
                    modifier = Modifier.size(16.dp)
                ) {}
                Spacer(Modifier.size(11.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(title, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
                    if (detail.isNotBlank()) {
                        Text(detail, fontSize = 12.sp, color = Muted)
                    }
                }
            }
        }
    }
}

@Composable
private fun WizardPicker(
    label: String,
    selected: String,
    options: List<Pair<String, String>>,
    onSelect: (String) -> Unit
) {
    var open by remember { mutableStateOf(false) }
    Column(modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
        Text(label, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Muted)
        Box {
            OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) {
                Text(options.firstOrNull { it.first == selected }?.second ?: selected, color = Color.White)
            }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                options.forEach { (value, text) ->
                    DropdownMenuItem(text = { Text(text) }, onClick = {
                        onSelect(value)
                        open = false
                    })
                }
            }
        }
    }
}

@Composable
private fun ConnectTile(
    integration: OnboardingIntegration,
    t: (String) -> String,
    saving: Boolean,
    onConnect: () -> Unit
) {
    val brand = Color(integration.colour)
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = Color.White.copy(alpha = 0.04f),
        modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            // The name set in the brand's own colour. No third-party logo files
            // are shipped: their guidelines want the real mark, unmodified, and
            // a hand-traced approximation is both worse and a trademark problem.
            Text(integration.brand, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = brand)
            Text(t(integration.detail), fontSize = 12.sp, color = Muted)
            OutlinedButton(onClick = onConnect, enabled = !saving) {
                Text(t("Connect"), color = brand)
            }
        }
    }
}

@Composable
private fun WizardHeader(step: Int, total: Int, title: String, subtitle: String) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text("$step / $total", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Muted)
        Spacer(Modifier.size(8.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(4.dp)
                .background(Color.White.copy(alpha = 0.12f), RoundedCornerShape(999.dp))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(step.toFloat() / total.toFloat())
                    .height(4.dp)
                    .background(Accent, RoundedCornerShape(999.dp))
            )
        }
        Spacer(Modifier.size(12.dp))
        Text(title, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Color.White)
        Spacer(Modifier.size(4.dp))
        Text(subtitle, fontSize = 13.sp, color = Muted)
    }
}

/**
 * The four-question wizard. There is no Skip button anywhere: the last step
 * offers "Start empty" and "I'll set this up later" as real answers instead, so
 * the workspace still learns what the person chose.
 */
@Composable
fun OnboardingWizardScreen(
    saving: Boolean,
    t: (String) -> String,
    onFinish: (OnboardingAnswers) -> Unit,
    /** Saves what has been answered so far, then opens the integration — the
     *  answers must be on disk before we navigate away, or a person who connects
     *  Shopify comes back to an empty workspace and the wizard again. */
    onConnect: (OnboardingAnswers, OnboardingIntegration) -> Unit
) {
    var step by remember { mutableStateOf(1) }
    var answers by remember { mutableStateOf(OnboardingAnswers()) }
    var showAllGoals by remember { mutableStateOf(false) }
    val scrollState = rememberScrollState()
    val total = 5

    val title = when (step) {
        1 -> t("Workspace basics")
        2 -> t("Tell us about your work")
        3 -> t("What should NivaDesk help with first?")
        4 -> t("Bring your work in")
        else -> t("Your plan")
    }
    val subtitle = when (step) {
        1 -> t("We've suggested these from your location. You can change them now or later in Settings.")
        2 -> t("This sets up your order cards, production stages and labels.")
        3 -> t("Your answer decides what your dashboard and first tasks show.")
        4 -> t("Pick how you'd like to start. You can do any of the others later.")
        else -> t("Your 14 days are free on any of these. Nothing is charged until they end, and you can change plan at any time.")
    }
    val canContinue = when (step) {
        1 -> answers.country.isNotBlank() && answers.currency.isNotBlank()
        2 -> answers.workKinds.isNotEmpty()
        3 -> answers.mainGoal != null
        4 -> answers.start != null
        // The plan step arrives with a recommendation already chosen.
        else -> true
    }

    BoxWithConstraints(
        modifier = Modifier.fillMaxSize().background(ScreenBackground).verticalScroll(scrollState),
        contentAlignment = Alignment.TopCenter
    ) {
        val isCompact = maxWidth < 720.dp
        Surface(
            shape = RoundedCornerShape(18.dp),
            color = CardBackground,
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = if (isCompact) maxWidth else 640.dp)
                .padding(horizontal = if (isCompact) 16.dp else 32.dp, vertical = 28.dp)
        ) {
            Column(modifier = Modifier.padding(22.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                WizardHeader(step, total, title, subtitle)

                when (step) {
                    1 -> Column {
                        WizardPicker(
                            t("Country"),
                            answers.country,
                            onboardingCountries.map { it.code to t(it.label) }
                        ) { code ->
                            // Picking a country is the fastest honest guess at
                            // the other two; both stay editable underneath.
                            val match = onboardingCountries.firstOrNull { it.code == code }
                            answers = answers.copy(
                                country = code,
                                currency = match?.currency ?: answers.currency,
                                timeZone = match?.timeZone ?: answers.timeZone
                            )
                        }
                        WizardPicker(t("Currency"), answers.currency, onboardingCurrencies) { value ->
                            answers = answers.copy(currency = value)
                        }
                        WizardPicker(t("Time zone"), answers.timeZone, onboardingTimeZones.map { it to it }) { value ->
                            answers = answers.copy(timeZone = value)
                        }
                    }

                    2 -> Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Text(t("What kind of work do you do?"), fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
                        Text(t("Pick as many as apply."), fontSize = 12.sp, color = Muted)
                        androidx.compose.foundation.layout.FlowRow(modifier = Modifier.fillMaxWidth()) {
                            OnboardingWorkKind.entries.forEach { kind ->
                                WizardChip(t(kind.label), answers.workKinds.contains(kind)) {
                                    answers = answers.copy(
                                        workKinds = if (answers.workKinds.contains(kind))
                                            answers.workKinds - kind else answers.workKinds + kind
                                    )
                                }
                            }
                        }
                        Text(t("How do you mainly work?"), fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
                        OnboardingWorkflow.entries.forEach { flow ->
                            WizardOptionRow(t(flow.label), t(flow.detail), answers.workflow == flow) {
                                answers = answers.copy(workflow = flow)
                            }
                        }
                        WizardPicker(
                            t("How many people will use NivaDesk?"),
                            answers.teamSize.id,
                            OnboardingTeamSize.entries.map { it.id to t(it.label) }
                        ) { value ->
                            answers = answers.copy(
                                teamSize = OnboardingTeamSize.entries.first { it.id == value }
                            )
                        }
                        WizardPicker(
                            t("Roughly how many orders a month?"),
                            answers.volume?.id ?: "",
                            listOf("" to t("Rather not say")) + OnboardingVolume.entries.map { it.id to t(it.label) }
                        ) { value ->
                            answers = answers.copy(
                                volume = OnboardingVolume.entries.firstOrNull { it.id == value }
                            )
                        }
                        Text(
                            t("This helps us suggest the right setup. It won't affect your trial."),
                            fontSize = 11.sp, color = Muted
                        )
                    }

                    3 -> Column {
                        val visible = if (showAllGoals) OnboardingGoal.entries
                        else OnboardingGoal.entries.filter { it.isPrimary }
                        visible.forEach { goal ->
                            WizardOptionRow(t(goal.label), "", answers.mainGoal == goal) {
                                answers = answers.copy(
                                    mainGoal = goal,
                                    extraGoals = answers.extraGoals - goal
                                )
                            }
                        }
                        if (!showAllGoals) {
                            TextButton(onClick = { showAllGoals = true }) {
                                Text(t("Show more goals"), color = Accent, fontSize = 12.sp)
                            }
                        }
                        if (answers.mainGoal != null) {
                            Spacer(Modifier.size(8.dp))
                            Text(t("Anything else?"), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
                            Text(t("Up to two more. Optional."), fontSize = 11.sp, color = Muted)
                            androidx.compose.foundation.layout.FlowRow(modifier = Modifier.fillMaxWidth()) {
                                OnboardingGoal.entries.filter { it != answers.mainGoal }.forEach { goal ->
                                    WizardChip(t(goal.label), answers.extraGoals.contains(goal)) {
                                        answers = answers.copy(
                                            extraGoals = when {
                                                answers.extraGoals.contains(goal) -> answers.extraGoals - goal
                                                answers.extraGoals.size < 2 -> answers.extraGoals + goal
                                                else -> answers.extraGoals
                                            }
                                        )
                                    }
                                }
                            }
                        }
                    }

                    4 -> Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Text(t("Connect your accounts"), fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
                        Text(
                            t("Optional. Connecting now means your workspace opens with your real work already in it."),
                            fontSize = 12.sp, color = Muted
                        )
                        OnboardingIntegration.entries.forEach { integration ->
                            ConnectTile(integration, t, saving) { onConnect(answers, integration) }
                        }
                        Text(
                            t("Nothing is shared with them until you sign in on their side, and you can disconnect at any time."),
                            fontSize = 11.sp, color = Muted
                        )
                        Text(t("Or start another way"), fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
                        OnboardingStart.entries.forEach { option ->
                            WizardOptionRow(t(option.label), t(option.detail), answers.start == option) {
                                answers = answers.copy(start = option)
                            }
                        }
                    }

                    // Step 5: the plan the answers imply, and the alternatives.
                    // The trial already started at sign-up on Pro — sign-up
                    // cannot know the team size, the questions come after — so
                    // this confirms which plan the fortnight is spent on.
                    // Choosing here never changes when it ends.
                    else -> Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        // Read the language OUTSIDE remember: a composition
                        // local is a @Composable read and cannot happen inside
                        // the calculation lambda.
                        val planLocale = uk.co.eggcraft.studioflow.language.studioLocale(
                            uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
                        )
                        val trialEnds = remember(planLocale) {
                            val cal = java.util.Calendar.getInstance()
                            cal.add(java.util.Calendar.DAY_OF_YEAR, 14)
                            java.text.SimpleDateFormat("d MMMM", planLocale).format(cal.time)
                        }
                        OnboardingTrialPlan.entries.forEach { plan ->
                            WizardOptionRow(
                                t(plan.title) + (if (plan == answers.recommendedPlan) "  •  " + t("Recommended for your answers") else ""),
                                t(plan.summary) + "\n" + t("Free until {date}, then {price}.")
                                    .replace("{date}", trialEnds)
                                    .replace("{price}", plan.price),
                                answers.chosenPlan == plan
                            ) {
                                answers = answers.copy(plan = plan)
                            }
                        }
                        Text(
                            t("We picked this from your answers — you told us how many people work with you and what you need first. Change it here, or later in Settings; nothing is charged today."),
                            fontSize = 11.sp, color = Muted
                        )
                    }
                }

                HorizontalDivider(color = Color.White.copy(alpha = 0.10f))
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        t("You can change all of this later in Settings."),
                        fontSize = 11.sp, color = Muted, modifier = Modifier.weight(1f)
                    )
                    // Back, never Skip: nobody should be able to walk past a
                    // question and leave the workspace guessing.
                    if (step > 1) {
                        OutlinedButton(onClick = { step -= 1 }, enabled = !saving) {
                            Text(t("Back"))
                        }
                        Spacer(Modifier.size(8.dp))
                    }
                    Button(
                        onClick = { if (step < total) step += 1 else onFinish(answers) },
                        enabled = canContinue && !saving
                    ) {
                        Text(
                            when {
                                saving -> t("Setting up…")
                                step == total -> t("Open my workspace")
                                else -> t("Continue")
                            }
                        )
                    }
                }
            }
        }
    }
}

/**
 * Shown once the answers are saved. One translated sentence with placeholders,
 * not English fragments glued together — that word order does not survive
 * Turkish, Japanese or Arabic.
 */
@Composable
fun OnboardingReadyScreen(
    answers: OnboardingAnswers,
    t: (String) -> String,
    onOpen: () -> Unit
) {
    val workflowLabel = t(answers.workflow.label)
    val rawKind = answers.workKinds.firstOrNull()?.label ?: ""
    // A repair shop that picked the repairs workflow would otherwise read
    // "a repairs and servicing workspace for repairs & servicing".
    val overlaps = rawKind.isNotBlank() &&
        rawKind.lowercase().startsWith(answers.workflow.label.lowercase().take(7))
    val summary = if (rawKind.isBlank() || overlaps) {
        t("We've set up your workspace for {workflow}.").replace("{workflow}", workflowLabel)
    } else {
        t("We've set up your workspace for {workflow} - {kind}.")
            .replace("{workflow}", workflowLabel)
            .replace("{kind}", t(rawKind))
    }
    val tasks = (answers.mainGoal ?: OnboardingGoal.ORDERS_CUSTOMERS).startingTasks()

    BoxWithConstraints(
        modifier = Modifier.fillMaxSize().background(ScreenBackground),
        contentAlignment = Alignment.Center
    ) {
        val isCompact = maxWidth < 720.dp
        Surface(
            shape = RoundedCornerShape(18.dp),
            color = CardBackground,
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = if (isCompact) maxWidth else 640.dp)
                .padding(horizontal = if (isCompact) 16.dp else 32.dp)
        ) {
            Column(modifier = Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text(t("Your workspace is ready"), fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Color.White)
                Text(summary, fontSize = 13.sp, color = Muted)
                tasks.forEachIndexed { index, task ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(shape = RoundedCornerShape(999.dp), color = Accent.copy(alpha = 0.16f)) {
                            Text(
                                "${index + 1}",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = Accent,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                            )
                        }
                        Spacer(Modifier.size(10.dp))
                        Text(t(task), fontSize = 13.5.sp, color = Color.White)
                    }
                }
                HorizontalDivider(color = Color.White.copy(alpha = 0.10f))
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        t("You can change all of this later in Settings."),
                        fontSize = 11.sp, color = Muted, modifier = Modifier.weight(1f)
                    )
                    Button(onClick = onOpen) { Text(t("Open my workspace")) }
                }
            }
        }
    }
}
