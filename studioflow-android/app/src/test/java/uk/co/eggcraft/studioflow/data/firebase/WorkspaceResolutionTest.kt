package uk.co.eggcraft.studioflow.data.firebase

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Deterministic checks for the workspace decision taken after sign-in: a read
 * that did not reach the server never becomes "switch to the personal workspace"
 * and is never written back. Mirror of scripts/workspace-resolution/main.swift.
 */
class WorkspaceResolutionTest {
    private val uid = "user-1"
    private val team = "team-9"

    @Test
    fun aFailedStoredReadChangesNothing() {
        val step = WorkspaceResolver.preferred(uid, WorkspaceStoredRead.Failed)
        assertEquals(WorkspacePreferredStep.Retry(WorkspaceRetryReason.StoredWorkspaceUnavailable), step)
        assertEquals(
            WorkspaceDecision.Retry(WorkspaceRetryReason.StoredWorkspaceUnavailable),
            WorkspaceResolver.decide(uid, step, WorkspaceAccessOutcome.Unavailable)
        )
    }

    @Test
    fun anUnavailableWorkspaceReadIsARetryNeverThePersonalWorkspace() {
        val decision = WorkspaceResolver.decide(uid, WorkspacePreferredStep.Check(team, false), WorkspaceAccessOutcome.Unavailable)
        assertEquals(WorkspaceDecision.Retry(WorkspaceRetryReason.WorkspaceUnavailable), decision)
    }

    @Test
    fun anEmptyCacheIsNotAFirstSetup() {
        assertEquals(
            WorkspacePreferredStep.Retry(WorkspaceRetryReason.StoredWorkspaceUnavailable),
            WorkspaceResolver.preferred(uid, WorkspaceStoredRead.Cache(""))
        )
    }

    @Test
    fun aRetryWithAGoodReadOpensTheStoredWorkspaceWithoutWriting() {
        val step = WorkspaceResolver.preferred(uid, WorkspaceStoredRead.Server(team))
        val decision = WorkspaceResolver.decide(uid, step, WorkspaceAccessOutcome.Granted)
        assertEquals(WorkspaceDecision.Activate(team, persist = false), decision)
    }

    @Test
    fun aCachedStoredIdOpensWithoutWriting() {
        val step = WorkspaceResolver.preferred(uid, WorkspaceStoredRead.Cache(team))
        assertEquals(WorkspacePreferredStep.Check(team, false), step)
        assertEquals(WorkspaceDecision.Activate(team, persist = false), WorkspaceResolver.decide(uid, step, WorkspaceAccessOutcome.Granted))
    }

    @Test
    fun firstSetupConfirmedByTheServerOpensThePersonalWorkspaceAndRecordsIt() {
        val step = WorkspaceResolver.preferred(uid, WorkspaceStoredRead.Server(null))
        assertEquals(WorkspaceDecision.Activate(uid, persist = true), WorkspaceResolver.decide(uid, step, WorkspaceAccessOutcome.Unavailable))
        // A stored personal id is reopened, not re-written.
        val stored = WorkspaceResolver.preferred(uid, WorkspaceStoredRead.Server(uid))
        assertEquals(WorkspaceDecision.Activate(uid, persist = false), WorkspaceResolver.decide(uid, stored, WorkspaceAccessOutcome.Unavailable))
    }

    @Test
    fun serverConfirmedLossOfAccessIsShownNotActedOn() {
        assertEquals(
            WorkspaceDecision.AccessLost(team),
            WorkspaceResolver.decide(uid, WorkspacePreferredStep.Check(team, false), WorkspaceAccessOutcome.Denied)
        )
    }

    @Test
    fun aLateResultFromAnotherAccountOrBootstrapIsNotApplied() {
        assertTrue(WorkspaceResolver.resultApplies(uid, 3, uid, 3))
        assertFalse(WorkspaceResolver.resultApplies(uid, 3, "user-2", 4))
        assertFalse(WorkspaceResolver.resultApplies(uid, 3, null, 4))
        assertFalse(WorkspaceResolver.resultApplies(uid, 3, uid, 4))
    }
}
