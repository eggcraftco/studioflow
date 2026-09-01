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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import uk.co.eggcraft.studioflow.language.STUDIO_SUPPORTED_LANGUAGES

// The sign-up wizard is always light, on every platform. Whoever is answering
// has not chosen a theme yet — the account is created on light and Settings can
// change it afterwards — and the first screen anyone sees should not be dark.
// These were 0xFF1B1B1F / 0xFF121212, which made this screen dark even for a
// workspace running the light theme.
private val CardBackground = Color(0xFFFFFFFF)
private val ScreenBackground = Color(0xFFF6F7F9)
private val Accent = Color(0xFF2563EB)
private val Muted = Color(0xFF6B7280)
/** Primary text on the light wizard. Named rather than Color.Black so the
 *  contrast choice is visible in one place. */
private val InkStrong = Color(0xFF17181C)

/**
 * The order the five steps are asked in.
 *
 * They were numbers, and `step == 4` had to be got right in four places that
 * never sat together — the title, the lede, the can-continue test and the body.
 * The step is named now and the order lives in one list: to reorder the wizard,
 * reorder this list.
 */
private enum class WizardStep { BASICS, BRING_WORK, GOAL, WORK, PLAN }

private val wizardSteps = listOf(
    WizardStep.BASICS, WizardStep.BRING_WORK, WizardStep.GOAL, WizardStep.WORK, WizardStep.PLAN
)

@Composable
private fun WizardOptionRow(
    title: String,
    detail: String,
    isOn: Boolean,
    /** Grows inside the row while it is the chosen one — the "Something else"
     *  goal takes their own words here, so nothing new appears below the row.
     *  Outside the TextButton on purpose: a field within a button spends every
     *  tap on the button. */
    inside: (@Composable () -> Unit)? = null,
    onClick: () -> Unit
) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = if (isOn) Accent.copy(alpha = 0.10f) else InkStrong.copy(alpha = 0.04f),
        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
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
                        Text(title, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, color = InkStrong)
                        if (detail.isNotBlank()) {
                            Text(detail, fontSize = 12.sp, color = Muted)
                        }
                    }
                }
            }
            inside?.invoke()
        }
    }
}

@Composable
private fun WizardPicker(
    label: String,
    selected: String,
    options: List<Pair<String, String>>,
    /** The question itself, standing in the control until it is answered. The
     *  label above stays short so every row of the grid is the same height. */
    placeholder: String = "",
    onSelect: (String) -> Unit
) {
    var open by remember { mutableStateOf(false) }
    val unanswered = placeholder.isNotBlank() && selected.isBlank()
    Column(modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
        Text(label, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Muted)
        Box {
            OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) {
                Text(
                    if (unanswered) placeholder
                    else options.firstOrNull { it.first == selected }?.second ?: selected,
                    color = if (unanswered) Muted else InkStrong
                )
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

/**
 * A question answered in their own words. The wizard is always light (see the
 * palette above), so the field is given its colours rather than taking them
 * from a workspace running the dark theme.
 */
@Composable
private fun WizardTextField(
    label: String,
    value: String,
    placeholder: String,
    modifier: Modifier = Modifier,
    onValueChange: (String) -> Unit
) {
    Column(modifier = modifier.fillMaxWidth().padding(bottom = 12.dp)) {
        if (label.isNotBlank()) {
            Text(label, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Muted)
        }
        OutlinedTextField(
            value = value,
            // Cut where the save cuts it, so nobody types a paragraph we will
            // silently drop.
            onValueChange = { onValueChange(it.take(200)) },
            placeholder = { Text(placeholder, fontSize = 13.sp, color = Muted) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = InkStrong,
                unfocusedTextColor = InkStrong,
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent,
                cursorColor = Accent,
                focusedBorderColor = Accent,
                unfocusedBorderColor = Muted.copy(alpha = 0.5f)
            )
        )
    }
}

/**
 * Two controls side by side where there is room for two. On a phone there never
 * is: half-width dropdowns would cut their own question in half.
 */
@Composable
private fun WizardFieldPair(
    isCompact: Boolean,
    first: @Composable () -> Unit,
    second: @Composable () -> Unit
) {
    if (isCompact) {
        Column(modifier = Modifier.fillMaxWidth()) {
            first()
            second()
        }
    } else {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(modifier = Modifier.weight(1f)) { first() }
            Box(modifier = Modifier.weight(1f)) { second() }
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
        color = InkStrong.copy(alpha = 0.04f),
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
                .background(InkStrong.copy(alpha = 0.14f), RoundedCornerShape(999.dp))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(step.toFloat() / total.toFloat())
                    .height(4.dp)
                    .background(Accent, RoundedCornerShape(999.dp))
            )
        }
        Spacer(Modifier.size(12.dp))
        Text(title, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = InkStrong)
        Spacer(Modifier.size(4.dp))
        Text(subtitle, fontSize = 13.sp, color = Muted)
    }
}

/**
 * The five-step wizard. There is no Skip button anywhere: "I'll set this up
 * later" is a real answer on the step that offers the connections, so the
 * workspace still learns what the person chose.
 */
@Composable
fun OnboardingWizardScreen(
    saving: Boolean,
    t: (String) -> String,
    onFinish: (OnboardingAnswers) -> Unit,
    /** Saves what has been answered so far, then opens the integration — the
     *  answers must be on disk before we navigate away, or a person who connects
     *  Shopify comes back to an empty workspace and the wizard again. */
    onConnect: (OnboardingAnswers, OnboardingIntegration) -> Unit,
    /** Applied the moment it changes, so the wizard itself switches over. */
    onLanguageChange: (String) -> Unit = {}
) {
    var step by remember { mutableStateOf(1) }
    var answers by remember { mutableStateOf(OnboardingAnswers()) }
    val scrollState = rememberScrollState()
    val total = wizardSteps.size
    val stepKey = wizardSteps[step - 1]

    val title = when (stepKey) {
        WizardStep.BASICS -> t("Workspace basics")
        WizardStep.BRING_WORK -> t("Bring your work in")
        WizardStep.GOAL -> t("What should NivaDesk help with first?")
        WizardStep.WORK -> t("Tell us about your work")
        WizardStep.PLAN -> t("Your plan")
    }
    val subtitle = when (stepKey) {
        WizardStep.BASICS -> t("We've suggested these from your location. You can change them now or later in Settings.")
        WizardStep.BRING_WORK -> t("Pick how you'd like to start. You can do any of the others later.")
        WizardStep.GOAL -> t("Your answer decides what your dashboard and first tasks show.")
        WizardStep.WORK -> t("This sets up your order cards, production stages and labels.")
        WizardStep.PLAN -> t("Your 14 days are free on any of these. Nothing is charged until they end, and you can change plan at any time.")
    }
    val canContinue = when (stepKey) {
        WizardStep.BASICS -> answers.country.isNotBlank() && answers.currency.isNotBlank() && answers.language.isNotBlank()
        WizardStep.BRING_WORK -> answers.start != null
        WizardStep.GOAL -> answers.mainGoal != null
        WizardStep.WORK -> answers.workKinds.isNotEmpty()
        // The plan step arrives with a recommendation already chosen.
        WizardStep.PLAN -> true
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

                when (stepKey) {
                    WizardStep.BASICS -> Column {
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
                        // Applied the moment it changes, so the rest of the
                        // setup already reads in the language just chosen.
                        WizardPicker(t("Language"), answers.language,
                            STUDIO_SUPPORTED_LANGUAGES.map { it to it }) { value ->
                            answers = answers.copy(language = value)
                            onLanguageChange(value)
                        }
                        WizardPicker(t("Time zone"), answers.timeZone, onboardingTimeZones.map { it to it }) { value ->
                            answers = answers.copy(timeZone = value)
                        }
                    }

                    // A short grey label above, the question itself inside the
                    // control. With the whole question as the label the rows
                    // came out at different heights — "How well do you track
                    // it?" wraps where "Team size" does not — and a grid of
                    // controls that do not line up reads as untidy however
                    // carefully it is spaced.
                    WizardStep.WORK -> Column(modifier = Modifier.fillMaxWidth()) {
                        WizardFieldPair(
                            isCompact,
                            first = {
                                WizardPicker(
                                    t("What you make"),
                                    answers.workKinds.firstOrNull()?.id ?: "",
                                    listOf("" to t("What do you mostly make?")) +
                                        OnboardingWorkKind.entries.map { it.id to t(it.label) },
                                    placeholder = t("What do you mostly make?")
                                ) { value ->
                                    // One choice, still saved as a list: the preset
                                    // engine reads the first entry, and the shape of
                                    // the saved field must not change under it.
                                    answers = answers.copy(
                                        workKinds = OnboardingWorkKind.entries.filter { it.id == value }
                                    )
                                }
                            },
                            second = {
                                WizardPicker(
                                    t("How you work"),
                                    answers.workflow.id,
                                    OnboardingWorkflow.entries.map { it.id to t(it.label) }
                                ) { value ->
                                    answers = answers.copy(
                                        workflow = OnboardingWorkflow.entries.first { it.id == value }
                                    )
                                }
                            }
                        )
                        WizardFieldPair(
                            isCompact,
                            first = {
                                WizardPicker(
                                    t("Team size"),
                                    answers.teamSize.id,
                                    OnboardingTeamSize.entries.map { it.id to t(it.label) }
                                ) { value ->
                                    answers = answers.copy(
                                        teamSize = OnboardingTeamSize.entries.first { it.id == value }
                                    )
                                }
                            },
                            second = {
                                WizardPicker(
                                    t("Monthly orders"),
                                    answers.volume?.id ?: "",
                                    listOf("" to t("How many a month?")) +
                                        OnboardingVolume.entries.map { it.id to t(it.label) },
                                    placeholder = t("How many a month?")
                                ) { value ->
                                    answers = answers.copy(
                                        volume = OnboardingVolume.entries.firstOrNull { it.id == value }
                                    )
                                }
                            }
                        )
                        WizardFieldPair(
                            isCompact,
                            first = {
                                WizardPicker(
                                    t("Business age"),
                                    answers.businessAge?.id ?: "",
                                    listOf("" to t("How long in business?")) +
                                        OnboardingBusinessAge.entries.map { it.id to t(it.label) },
                                    placeholder = t("How long in business?")
                                ) { value ->
                                    answers = answers.copy(
                                        businessAge = OnboardingBusinessAge.entries.firstOrNull { it.id == value }
                                    )
                                }
                            },
                            second = {
                                WizardPicker(
                                    t("Stock tracking"),
                                    answers.inventoryExperience?.id ?: "",
                                    listOf("" to t("How well do you track it?")) +
                                        OnboardingInventoryExperience.entries.map { it.id to t(it.label) },
                                    placeholder = t("How well do you track it?")
                                ) { value ->
                                    answers = answers.copy(
                                        inventoryExperience =
                                            OnboardingInventoryExperience.entries.firstOrNull { it.id == value }
                                    )
                                }
                            }
                        )
                        // Typed, not chosen: a list of the channels we thought
                        // of first only ever collects the channels we thought
                        // of first.
                        WizardTextField(
                            t("How did you find us?"),
                            answers.heardFrom,
                            t("A search, a friend, an advert…")
                        ) { value ->
                            answers = answers.copy(heardFrom = value)
                        }
                        Text(
                            t("This helps us suggest the right setup. It won't affect your trial."),
                            fontSize = 11.sp, color = Muted
                        )
                    }

                    // One question, one list, one answer. Picking a goal used
                    // to open a second question underneath it — "Anything
                    // else?", with a row of chips — so the screen grew a new
                    // section the moment you touched it, and what that section
                    // collected was never what the preset engine read. All ten
                    // are listed, and the last one takes their own words.
                    WizardStep.GOAL -> Column {
                        OnboardingGoal.entries.forEach { goal ->
                            val isOwnWords = goal == OnboardingGoal.OTHER && answers.mainGoal == goal
                            WizardOptionRow(
                                t(goal.label),
                                "",
                                answers.mainGoal == goal,
                                inside = if (isOwnWords) {
                                    {
                                        WizardTextField(
                                            "",
                                            answers.otherGoal,
                                            t("In your own words"),
                                            // Lined up with the row's title,
                                            // past the radio and its gap.
                                            modifier = Modifier.padding(start = 39.dp, end = 12.dp)
                                        ) { value ->
                                            answers = answers.copy(otherGoal = value)
                                        }
                                    }
                                } else null
                            ) {
                                answers = answers.copy(mainGoal = goal)
                            }
                        }
                    }

                    WizardStep.BRING_WORK -> Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Text(t("Connect your accounts"), fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = InkStrong)
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
                        Text(t("Or start another way"), fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = InkStrong)
                        OnboardingStart.offered.forEach { option ->
                            WizardOptionRow(t(option.label), t(option.detail), answers.start == option) {
                                answers = answers.copy(start = option)
                            }
                        }
                    }

                    // The plan the answers imply, and the alternatives. The
                    // trial already started at sign-up on Pro — sign-up cannot
                    // know the team size, the questions come after — so this
                    // confirms which plan the fortnight is spent on. Choosing
                    // here never changes when it ends.
                    WizardStep.PLAN -> Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
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
                                    .replace("{price}", plan.amount + " / " + t("month")),
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

                HorizontalDivider(color = InkStrong.copy(alpha = 0.10f))
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
                Text(t("Your workspace is ready"), fontSize = 24.sp, fontWeight = FontWeight.Bold, color = InkStrong)
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
                        Text(t(task), fontSize = 13.5.sp, color = InkStrong)
                    }
                }
                HorizontalDivider(color = InkStrong.copy(alpha = 0.10f))
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
