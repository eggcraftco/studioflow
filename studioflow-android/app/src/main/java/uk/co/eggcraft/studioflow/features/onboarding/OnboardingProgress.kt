package uk.co.eggcraft.studioflow.features.onboarding

/**
 * Where somebody got to in the setup wizard, kept on this device so closing the
 * app does not throw it away.
 *
 * The step and the answers lived in composition state alone. rememberSaveable
 * carries them through a rotation, and through the process being reclaimed
 * behind a bank app, because both restore the same activity from its saved
 * bundle. Nothing carried them through the app being swiped away, or the phone
 * being restarted, or a day passing — and that is the case this file exists
 * for. Four screens of answers, closed at the fifth, used to come back as
 * screen one with every field empty.
 *
 * Everything here is this device's own. No Firestore field, no server call, no
 * new event: a half-finished wizard is a fact about this phone, and the
 * workspace document already says the only thing the server needs to know,
 * which is whether setup finished.
 *
 * The record is a flat string rather than JSON because it is written on every
 * keystroke and read once, and because the wizard already had to flatten these
 * same answers for the saved-instance bundle — that mapping is now here, used
 * by both, so the two cannot drift.
 */

/** Separates the entries of a list inside one field. The unit separator: the
 *  wizard's saved-instance bundle has used it since the wizard was written,
 *  and no enum name can contain it. */
private const val OnboardingListSeparator = "\u001F"

/** Separates the fields of one saved record. The record separator, one level
 *  up from the list one, so a list inside a field cannot end the field. */
private const val OnboardingFieldSeparator = "\u001E"

/**
 * The shape of the saved record. A record written by a build that shaped it
 * differently is dropped rather than half-read: the wizard opens fresh, which
 * is the same thing that happens to somebody who never started it.
 */
private const val OnboardingProgressVersion = "1"

/** Where somebody was, and what they had answered when they left. */
data class OnboardingProgress(
    /** The wizard's step by NAME, not by number: reordering the wizard must not
     *  reopen a saved run on a different question. */
    val stepKey: String,
    val answers: OnboardingAnswers
)

private inline fun <reified T : Enum<T>> onboardingEnum(name: String): T? =
    if (name.isEmpty()) null else enumValues<T>().firstOrNull { it.name == name }

private inline fun <reified T : Enum<T>> onboardingEnums(joined: String): List<T> =
    if (joined.isEmpty()) emptyList()
    else joined.split(OnboardingListSeparator).mapNotNull { onboardingEnum<T>(it) }

/** Two answers are typed rather than chosen, so both separators are taken out
 *  of them: a control character in a free-text field must not be able to cut
 *  the record in half. Neither is reachable from a keyboard. */
private fun onboardingFlatten(text: String): String =
    text.replace(OnboardingFieldSeparator, " ").replace(OnboardingListSeparator, " ")

/**
 * The answers as flat strings — enum names, lists joined on a separator no enum
 * name can contain. Used by the wizard's saved-instance saver and by the
 * on-disk record, so the field order is defined once and the two cannot
 * disagree about which slot holds what.
 */
fun onboardingAnswerFields(answers: OnboardingAnswers): List<String> = listOf(
    answers.country,
    answers.currency,
    answers.language,
    answers.timeZone,
    answers.workKinds.joinToString(OnboardingListSeparator) { it.name },
    answers.workflow.name,
    answers.teamSize.name,
    answers.volume?.name.orEmpty(),
    answers.businessAge?.name.orEmpty(),
    answers.inventoryExperience?.name.orEmpty(),
    onboardingFlatten(answers.heardFrom),
    answers.mainGoal?.name.orEmpty(),
    onboardingFlatten(answers.otherGoal),
    answers.extraGoals.joinToString(OnboardingListSeparator) { it.name },
    answers.start?.name.orEmpty(),
    answers.plan?.name.orEmpty()
)

/**
 * The answers back. Every field is read defensively: a record saved by an older
 * build is shorter, and an enum entry renamed since is simply not found. Both
 * come back as the default rather than as a crash.
 */
fun onboardingAnswersFromFields(values: List<String>): OnboardingAnswers {
    val fallback = OnboardingAnswers()
    fun at(index: Int): String = values.getOrNull(index).orEmpty()
    return OnboardingAnswers(
        country = at(0).ifEmpty { fallback.country },
        currency = at(1).ifEmpty { fallback.currency },
        language = at(2).ifEmpty { fallback.language },
        timeZone = at(3).ifEmpty { fallback.timeZone },
        workKinds = onboardingEnums<OnboardingWorkKind>(at(4)),
        workflow = onboardingEnum<OnboardingWorkflow>(at(5)) ?: fallback.workflow,
        teamSize = onboardingEnum<OnboardingTeamSize>(at(6)) ?: fallback.teamSize,
        volume = onboardingEnum<OnboardingVolume>(at(7)),
        businessAge = onboardingEnum<OnboardingBusinessAge>(at(8)),
        inventoryExperience = onboardingEnum<OnboardingInventoryExperience>(at(9)),
        heardFrom = at(10),
        mainGoal = onboardingEnum<OnboardingGoal>(at(11)),
        otherGoal = at(12),
        extraGoals = onboardingEnums<OnboardingGoal>(at(13)),
        start = onboardingEnum<OnboardingStart>(at(14)),
        plan = onboardingEnum<OnboardingTrialPlan>(at(15))
    )
}

fun encodeOnboardingProgress(progress: OnboardingProgress): String =
    (listOf(OnboardingProgressVersion, onboardingFlatten(progress.stepKey)) +
        onboardingAnswerFields(progress.answers)).joinToString(OnboardingFieldSeparator)

/** null for anything this build cannot read as a whole record: absent, blank,
 *  written in a shape it does not know, or naming no step at all. */
fun decodeOnboardingProgress(raw: String?): OnboardingProgress? {
    val text = raw?.takeIf { it.isNotBlank() } ?: return null
    val parts = text.split(OnboardingFieldSeparator)
    if (parts.firstOrNull() != OnboardingProgressVersion) return null
    val stepKey = parts.getOrNull(1).orEmpty()
    if (stepKey.isBlank()) return null
    return OnboardingProgress(stepKey, onboardingAnswersFromFields(parts.drop(2)))
}

/**
 * The step to reopen at, 1-based.
 *
 * A blank [savedStepKey] is nothing saved at all — nobody started, or the
 * record was unreadable — and that opens the wizard at the beginning. A
 * decoded record always names a step, so the two cases cannot be confused.
 *
 * Past that, two things have to be true of the step, and they are different
 * things. It must be a step that still exists — the saved name is looked up in
 * the wizard as it is TODAY, so a step removed or renamed since resolves to
 * nothing rather than to whatever now sits at that index. And it must be a step
 * the answers actually support: [furthestReachable] is the first question still
 * unanswered, so nobody is dropped onto the plan step with no goal chosen,
 * which is resuming into nothing.
 *
 * A saved step that no longer exists therefore falls back to the furthest
 * question the restored answers reach, not to step one: those questions were
 * answered, and asking them again is the same insult as losing them.
 */
fun onboardingResumeStep(savedStepKey: String, stepKeys: List<String>, furthestReachable: Int): Int {
    if (stepKeys.isEmpty() || savedStepKey.isBlank()) return 1
    val ceiling = furthestReachable.coerceIn(1, stepKeys.size)
    val saved = stepKeys.indexOf(savedStepKey) + 1
    if (saved <= 0) return ceiling
    return minOf(saved, ceiling)
}

/**
 * The device's own store, small enough to fake in a test and to not exist at
 * all. Deliberately not SharedPreferences itself: the scoping and the guards
 * below are the part worth testing, and they should not need a phone.
 */
interface OnboardingProgressStorage {
    fun read(key: String): String?
    fun write(key: String, value: String)
    fun remove(key: String)
}

/**
 * One workspace's half-finished wizard, for one person, on this device.
 *
 * Scoped to both: a phone shared by two people, or one person in two
 * workspaces, must never resume into somebody else's half-finished setup.
 * Without both ids there is no scope, so nothing is stored at all — an unscoped
 * record is worse than no record.
 *
 * Every call is guarded. Storage can be missing, full, locked before first
 * unlock, or cleared underneath us; when it is, the wizard behaves exactly as
 * it did before any of this existed, which is to say it works and forgets.
 */
class OnboardingProgressStore(
    private val storage: OnboardingProgressStorage?,
    userId: String,
    workspaceId: String
) {
    private val key: String? =
        if (userId.isBlank() || workspaceId.isBlank()) null else "progress:$userId:$workspaceId"

    fun load(): OnboardingProgress? {
        val storeKey = key ?: return null
        val store = storage ?: return null
        return runCatching { decodeOnboardingProgress(store.read(storeKey)) }.getOrNull()
    }

    fun save(progress: OnboardingProgress) {
        val storeKey = key ?: return
        val store = storage ?: return
        runCatching { store.write(storeKey, encodeOnboardingProgress(progress)) }
    }

    /** Called when the wizard finishes, when the workspace says setup is over
     *  however it ended, and when setup is reopened from the start. */
    fun clear() {
        val storeKey = key ?: return
        val store = storage ?: return
        runCatching { store.remove(storeKey) }
    }
}
