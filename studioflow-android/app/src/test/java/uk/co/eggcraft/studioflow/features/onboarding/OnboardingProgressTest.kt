package uk.co.eggcraft.studioflow.features.onboarding

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The setup wizard remembering where somebody got to.
 *
 * Every rule here is a way the remembering can be worse than forgetting:
 * resuming into somebody else's answers, resuming onto a step that no longer
 * exists, resuming onto a step the answers never reached, or refusing to open
 * at all because a preferences file would not.
 */
class OnboardingProgressTest {
    /** The separators the record is written with. The production file keeps
     *  its own private copies; a test that reached into them would be
     *  checking itself rather than the format. */
    private val fieldSeparator = "\u001E"
    private val listSeparator = "\u001F"

    /** The wizard's steps as they are today, by name. */
    private val steps = listOf("BASICS", "BRING_WORK", "GOAL", "WORK", "PLAN")

    private class FakeStorage : OnboardingProgressStorage {
        val values = mutableMapOf<String, String>()
        override fun read(key: String): String? = values[key]
        override fun write(key: String, value: String) { values[key] = value }
        override fun remove(key: String) { values.remove(key) }
    }

    /** Storage that is there and does not work: private browsing's Android
     *  cousin, a full disk, a device-encrypted profile before first unlock. */
    private class BrokenStorage : OnboardingProgressStorage {
        override fun read(key: String): String? = throw IllegalStateException("no storage")
        override fun write(key: String, value: String) = throw IllegalStateException("no storage")
        override fun remove(key: String) = throw IllegalStateException("no storage")
    }

    private val fourScreensIn = OnboardingAnswers(
        country = "TR",
        currency = "TRY",
        language = "Türkçe",
        timeZone = "Europe/Istanbul",
        workKinds = listOf(OnboardingWorkKind.WATCHES_JEWELLERY),
        workflow = OnboardingWorkflow.REPAIRS,
        teamSize = OnboardingTeamSize.TWO_TO_FIVE,
        volume = OnboardingVolume.TEN_TO_THIRTY,
        businessAge = OnboardingBusinessAge.ONE_TO_THREE,
        inventoryExperience = OnboardingInventoryExperience.SOME,
        heardFrom = "A friend in the trade",
        mainGoal = OnboardingGoal.REPAIRS_SERVICE,
        otherGoal = "",
        extraGoals = listOf(OnboardingGoal.INVENTORY),
        start = OnboardingStart.LATER,
        plan = OnboardingTrialPlan.TEAM
    )

    @Test
    fun theAnswersComeBackFieldForField() {
        val store = OnboardingProgressStore(FakeStorage(), "user-1", "company-1")
        store.save(OnboardingProgress("WORK", fourScreensIn))

        val resumed = store.load()
        assertNotNull(resumed)
        assertEquals("WORK", resumed!!.stepKey)
        assertEquals(fourScreensIn, resumed.answers)
    }

    @Test
    fun nothingIsRememberedBeforeTheWizardIsOpened() {
        assertNull(OnboardingProgressStore(FakeStorage(), "user-1", "company-1").load())
    }

    @Test
    fun oneWorkspaceIsNotResumedIntoAnother() {
        val storage = FakeStorage()
        OnboardingProgressStore(storage, "user-1", "company-1")
            .save(OnboardingProgress("GOAL", fourScreensIn))

        assertNull(OnboardingProgressStore(storage, "user-1", "company-2").load())
        assertNull(OnboardingProgressStore(storage, "user-2", "company-1").load())
        assertNotNull(OnboardingProgressStore(storage, "user-1", "company-1").load())
    }

    @Test
    fun withoutBothIdsNothingIsWrittenAtAll() {
        val storage = FakeStorage()
        OnboardingProgressStore(storage, "", "company-1").save(OnboardingProgress("GOAL", fourScreensIn))
        OnboardingProgressStore(storage, "user-1", "").save(OnboardingProgress("GOAL", fourScreensIn))

        assertTrue(storage.values.isEmpty())
        assertNull(OnboardingProgressStore(storage, "", "company-1").load())
    }

    @Test
    fun finishingOrRefusingSetupEmptiesIt() {
        val storage = FakeStorage()
        val store = OnboardingProgressStore(storage, "user-1", "company-1")
        store.save(OnboardingProgress("PLAN", fourScreensIn))
        store.clear()

        assertNull(store.load())
        assertTrue(storage.values.isEmpty())
    }

    @Test
    fun storageThatThrowsIsAWizardThatForgets() {
        val store = OnboardingProgressStore(BrokenStorage(), "user-1", "company-1")
        // None of the three may take the wizard down with them.
        store.save(OnboardingProgress("GOAL", fourScreensIn))
        store.clear()
        assertNull(store.load())
    }

    @Test
    fun noStorageAtAllIsAWizardThatForgets() {
        val store = OnboardingProgressStore(null, "user-1", "company-1")
        store.save(OnboardingProgress("GOAL", fourScreensIn))
        store.clear()
        assertNull(store.load())
    }

    @Test
    fun aRecordThisBuildCannotReadIsNotHalfRead() {
        assertNull(decodeOnboardingProgress(null))
        assertNull(decodeOnboardingProgress(""))
        assertNull(decodeOnboardingProgress("GOAL"))
        // Written by a build that shaped the record differently.
        assertNull(decodeOnboardingProgress("7" + fieldSeparator + "GOAL"))
        // A version this build knows, naming no step.
        assertNull(decodeOnboardingProgress("1" + fieldSeparator + ""))
    }

    @Test
    fun typedAnswersCannotCutTheRecordInHalf() {
        val store = OnboardingProgressStore(FakeStorage(), "user-1", "company-1")
        val awkward = fourScreensIn.copy(
            heardFrom = "a friend" + fieldSeparator + "GOAL" + listSeparator + "and an advert",
            otherGoal = "keep" + listSeparator + "track"
        )
        store.save(OnboardingProgress("WORK", awkward))

        val resumed = store.load()
        assertNotNull(resumed)
        assertEquals("WORK", resumed!!.stepKey)
        assertEquals("a friend GOAL and an advert", resumed.answers.heardFrom)
        assertEquals("keep track", resumed.answers.otherGoal)
        assertEquals(OnboardingGoal.REPAIRS_SERVICE, resumed.answers.mainGoal)
    }

    @Test
    fun anAnswerThisBuildNoLongerHasFallsBackRatherThanCrashing() {
        val record = listOf("1", "GOAL", "GB", "GBP", "English", "Europe/London", "SPACE_TOURISM")
            .joinToString(fieldSeparator)
        val resumed = decodeOnboardingProgress(record)

        assertNotNull(resumed)
        assertEquals(emptyList<OnboardingWorkKind>(), resumed!!.answers.workKinds)
        assertEquals(OnboardingAnswers().workflow, resumed.answers.workflow)
        assertEquals("GB", resumed.answers.country)
    }

    @Test
    fun theStepComesBackAsTheStepTheyLeftOn() {
        assertEquals(4, onboardingResumeStep("WORK", steps, furthestReachable = 5))
    }

    @Test
    fun withNothingSavedTheWizardOpensAtTheBeginning() {
        // Not the same case as a step that has gone. The default answers already
        // "reach" the third question — a country, a currency and a way to start
        // are all pre-filled — so treating an empty record like a resumed one
        // would open a brand-new workspace's wizard on question three and
        // silently skip the two before it.
        assertEquals(1, onboardingResumeStep("", steps, furthestReachable = 3))
    }

    @Test
    fun aStepThatNoLongerExistsFallsBackToWhatTheAnswersReach() {
        // The wizard once had a step that has since been taken out. The answers
        // restored alongside it reach the third question, so that is where it
        // opens — not at step one, which would ask again for what is on screen.
        assertEquals(3, onboardingResumeStep("EXTRA_GOALS", steps, furthestReachable = 3))
    }

    @Test
    fun nobodyIsResumedOntoAStepTheirAnswersNeverReached() {
        // A record naming the plan step with no goal chosen: the goal step is as
        // far as these answers go, and the plan step would be a screen about
        // answers that are not there.
        assertEquals(3, onboardingResumeStep("PLAN", steps, furthestReachable = 3))
    }

    @Test
    fun anEmptyWizardStillOpensSomewhere() {
        assertEquals(1, onboardingResumeStep("GOAL", emptyList(), furthestReachable = 4))
        assertEquals(1, onboardingResumeStep("GOAL", steps, furthestReachable = 0))
        assertEquals(steps.size, onboardingResumeStep("PLAN", steps, furthestReachable = 99))
    }
}
