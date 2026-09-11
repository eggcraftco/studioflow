package uk.co.eggcraft.studioflow.data.firebase

/**
 * The decision behind "which workspace opens after sign-in", kept free of
 * Firebase so it runs under plain JUnit (WorkspaceResolutionTest). Mirror of
 * EGGcraft/WorkspaceResolution.swift.
 *
 * The rule: a read that did not reach the server proves nothing. It must never
 * turn into "switch to the personal workspace" and must never be written back to
 * users/{uid}.activeCompanyId. Only a first sign-in confirmed by the server (no
 * stored workspace at all) or the person's own explicit choice may open the
 * personal workspace on their behalf.
 */
sealed class WorkspaceStoredRead {
    /** The read reached the server; the stored value may be blank on a first sign-in. */
    data class Server(val activeCompanyId: String?) : WorkspaceStoredRead()
    /** The read was answered from the local cache only. */
    data class Cache(val activeCompanyId: String?) : WorkspaceStoredRead()
    /** The read failed. */
    object Failed : WorkspaceStoredRead()
}

enum class WorkspaceAccessOutcome { Granted, Denied, Unavailable }

enum class WorkspaceRetryReason { StoredWorkspaceUnavailable, WorkspaceUnavailable }

sealed class WorkspaceDecision {
    /** Open this workspace; [persist] says whether activeCompanyId may be written (first setup only). */
    data class Activate(val companyId: String, val persist: Boolean) : WorkspaceDecision()
    /** Nothing changes; the person gets a retry. */
    data class Retry(val reason: WorkspaceRetryReason) : WorkspaceDecision()
    /** The server says the stored workspace no longer admits this person; the person decides. */
    data class AccessLost(val companyId: String) : WorkspaceDecision()
}

sealed class WorkspacePreferredStep {
    data class Check(val companyId: String, val persistIfPersonal: Boolean) : WorkspacePreferredStep()
    data class Retry(val reason: WorkspaceRetryReason) : WorkspacePreferredStep()
}

class WorkspaceUnavailableException(val reason: WorkspaceRetryReason) :
    Exception("Could not open your workspace. Check your connection and try again.")

class WorkspaceAccessLostException(val companyId: String) :
    Exception("Your access to this workspace has changed. Try again, or open your own workspace.")

object WorkspaceResolver {
    fun preferred(uid: String, stored: WorkspaceStoredRead): WorkspacePreferredStep = when (stored) {
        is WorkspaceStoredRead.Failed -> WorkspacePreferredStep.Retry(WorkspaceRetryReason.StoredWorkspaceUnavailable)
        is WorkspaceStoredRead.Server -> {
            val clean = stored.activeCompanyId.orEmpty().trim()
            // First setup, confirmed by the server: the personal workspace is the
            // only one this account has, and recording it is correct.
            if (clean.isEmpty()) WorkspacePreferredStep.Check(uid, persistIfPersonal = true)
            else WorkspacePreferredStep.Check(clean, persistIfPersonal = false)
        }
        is WorkspaceStoredRead.Cache -> {
            val clean = stored.activeCompanyId.orEmpty().trim()
            // An empty cache is not proof of a first setup.
            if (clean.isEmpty()) WorkspacePreferredStep.Retry(WorkspaceRetryReason.StoredWorkspaceUnavailable)
            else WorkspacePreferredStep.Check(clean, persistIfPersonal = false)
        }
    }

    fun decide(uid: String, step: WorkspacePreferredStep, access: WorkspaceAccessOutcome): WorkspaceDecision = when (step) {
        is WorkspacePreferredStep.Retry -> WorkspaceDecision.Retry(step.reason)
        is WorkspacePreferredStep.Check -> when {
            step.companyId == uid -> WorkspaceDecision.Activate(uid, persist = step.persistIfPersonal)
            access == WorkspaceAccessOutcome.Granted -> WorkspaceDecision.Activate(step.companyId, persist = false)
            access == WorkspaceAccessOutcome.Denied -> WorkspaceDecision.AccessLost(step.companyId)
            else -> WorkspaceDecision.Retry(WorkspaceRetryReason.WorkspaceUnavailable)
        }
    }

    /**
     * A result may only be applied to the account and bootstrap it was started for.
     * [currentGeneration] increments on every sign-in / sign-out / account change.
     */
    fun resultApplies(startedForUid: String, startedGeneration: Int, currentUid: String?, currentGeneration: Int): Boolean =
        startedForUid == currentUid && startedGeneration == currentGeneration
}
