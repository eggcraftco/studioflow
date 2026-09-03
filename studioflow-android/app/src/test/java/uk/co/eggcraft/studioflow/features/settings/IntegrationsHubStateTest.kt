package uk.co.eggcraft.studioflow.features.settings

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

/**
 * A Shopify store that was uninstalled must not read "Connected".
 *
 * Uninstalling the app does not detach the store from the workspace: the server
 * merges {status:"uninstalled", accessToken:""} and deliberately keeps
 * companyId so a re-install resumes. The store therefore still arrives in this
 * hub's signals, while the reconcile skips it — its orders have stopped. The
 * card only counted "paused" as broken, so it stayed green over a dead store: a
 * silent outage behind the one badge whose job is to say whether orders are
 * coming in.
 *
 * The web mirror of this rule is checked by
 * functions/test/qa/shopify-badge-uninstalled.test.js. Keep the two in step.
 */
class IntegrationsHubStateTest {
    private val shopify = INTEGRATION_PROVIDERS.first { it.id == "shopify" }

    private fun state(vararg stores: Pair<String, String>) =
        shopify.state(IntegrationSignals(shopifyStores = mapOf(*stores)))

    @Test
    fun anUninstalledStoreDoesNotReadConnected() {
        assertNotEquals("Connected", state("eggcraft.myshopify.com" to "uninstalled").label)
        assertEquals(IntegrationState.Attention, state("eggcraft.myshopify.com" to "uninstalled"))
    }

    @Test
    fun oneDeadStoreAmongLiveOnesStillLowersTheCard() {
        // The all-or-nothing rule would keep this green, and the orders from the
        // uninstalled shop have stopped just the same.
        val mixed = state("live.myshopify.com" to "active", "gone.myshopify.com" to "uninstalled")
        assertNotEquals("Connected", mixed.label)
        assertEquals(IntegrationState.Attention, mixed)
    }

    @Test
    fun whatTheCardSaidBeforeIsIntact() {
        assertEquals(IntegrationState.Available, state())
        assertEquals(IntegrationState.Connected, state("eggcraft.myshopify.com" to "active"))
        assertEquals(IntegrationState.Attention, state("a.myshopify.com" to "paused"))
        // Pausing one store of two is a decision, not a fault.
        assertEquals(
            IntegrationState.Connected,
            state("a.myshopify.com" to "paused", "b.myshopify.com" to "active")
        )
    }
}
