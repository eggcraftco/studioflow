package uk.co.eggcraft.studioflow.features.settings

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
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
    // eBay: the server's per-workspace gate decides whether a workspace with no connection may
    // connect. Off the list, the card reads like a planned integration (no Connect); on the list,
    // Available; with a live connection the gate is irrelevant. Mirrors NivaDeskIntegrations.swift
    // and studioflow-web/lib/studioflow/integrations.ts — keep the three in step.
    private val ebayProvider = INTEGRATION_PROVIDERS.first { it.id == "ebay" }

    @Test
    fun ebayOffTheRolloutListReadsPlannedNotAvailable() {
        assertEquals(IntegrationState.Planned, ebayProvider.state(IntegrationSignals(ebayConnections = 0, ebayAvailability = EbayAvailability.Disabled)))
        assertEquals(IntegrationState.Available, ebayProvider.state(IntegrationSignals(ebayConnections = 0, ebayAvailability = EbayAvailability.Enabled)))
    }

    @Test
    fun ebayBeforeTheServerAnswersIsCheckingAndAFailedReadIsUnverifiedNeverAvailable() {
        // The grid's first frame, before getEbayConnections returns.
        assertEquals(IntegrationState.Checking, ebayProvider.state(IntegrationSignals(ebayConnections = 0)))
        // A rejected or unreachable read.
        assertEquals(IntegrationState.Unverified, ebayProvider.state(IntegrationSignals(ebayConnections = 0, ebayAvailability = EbayAvailability.Failed)))
        assertTrue(IntegrationState.Checking.offersNoAction)
        assertTrue(IntegrationState.Unverified.offersNoAction)
        assertTrue(IntegrationState.Planned.offersNoAction)
        assertFalse(IntegrationState.Available.offersNoAction)
    }

    @Test
    fun ebayWithALiveConnectionIgnoresTheGate() {
        assertEquals(IntegrationState.Connected, ebayProvider.state(IntegrationSignals(ebayConnections = 1, ebayAvailability = EbayAvailability.Disabled)))
        assertEquals(IntegrationState.Attention, ebayProvider.state(IntegrationSignals(ebayConnections = 1, ebayConnectionsNeedingAttention = 1, ebayAvailability = EbayAvailability.Disabled)))
        assertEquals(IntegrationState.Connected, ebayProvider.state(IntegrationSignals(ebayConnections = 1, ebayAvailability = EbayAvailability.Failed)))
    }
}

/**
 * The eBay card: the same rule, on the connector that ships switched off.
 *
 * The card is read from the rows the SERVER returns, and needsAttention is the
 * server's own specStatus (design §10, §11.1) — the count reaching these
 * signals is already that judgement, never an error code re-read on the phone.
 *
 * These claims are the contract, not the code, and they are the ones the web
 * mirror pins in functions/test/qa/shopify-badge-uninstalled.test.js. Keep the
 * two in step.
 */
class EbayIntegrationCardTest {
    private val ebay = INTEGRATION_PROVIDERS.first { it.id == "ebay" }

    private fun signals(live: Int, attention: Int, account: String = "", sandbox: Boolean = false) =
        IntegrationSignals(
            ebayConnections = live,
            ebayConnectionsNeedingAttention = attention,
            ebayAccount = account,
            ebaySandbox = sandbox,
        )

    @Test
    fun aCardWithNoRowsIsAvailableOnlyOnceTheServerSaidSo() {
        // A planned card short-circuits before the eBay branch is ever reached,
        // so the kind is part of the claim.
        assertEquals("native", ebay.kind)
        // The default signals object is the grid's first frame: the server has
        // not answered, so the card reads Checking, not Available. A REJECTED
        // read (the connector switched off, the network gone) reads Unverified.
        // Only the server's own "enabled" makes it Available — and never Connected.
        assertEquals(IntegrationState.Checking, ebay.state(IntegrationSignals()))
        assertEquals(IntegrationState.Unverified, ebay.state(IntegrationSignals(ebayAvailability = EbayAvailability.Failed)))
        assertEquals(IntegrationState.Available, ebay.state(IntegrationSignals(ebayAvailability = EbayAvailability.Enabled)))
        assertEquals("", ebay.detail(IntegrationSignals()))
    }

    @Test
    fun oneHealthyAccountBesideABrokenOneKeepsTheCardGreen() {
        val both = signals(live = 2, attention = 1)
        assertEquals(IntegrationState.Connected, both.let(ebay::state))
        assertEquals("2 accounts", ebay.detail(both))
    }

    @Test
    fun everyLiveAccountNeedingALookLowersTheCard() {
        assertEquals(IntegrationState.Attention, ebay.state(signals(live = 1, attention = 1)))
        assertEquals(IntegrationState.Attention, ebay.state(signals(live = 3, attention = 3)))
    }

    @Test
    fun aSandboxConnectionSaysSoOnTheCard() {
        // A seller looking at a green badge over a sandbox account has no other
        // way to learn that none of it is real.
        val sandbox = signals(live = 1, attention = 0, account = "eggcraft", sandbox = true)
        assertEquals(IntegrationState.Connected, ebay.state(sandbox))
        assertEquals("eggcraft · Sandbox", ebay.detail(sandbox))
        // A live account of the same shape must not carry the word.
        assertEquals("eggcraft", ebay.detail(signals(live = 1, attention = 0, account = "eggcraft")))
    }

    @Test
    fun anAccountWithNoNameStillCountsAsOne() {
        // sellerUsername and displayName can both be absent on a connection
        // eBay never named; the card still has to say there is one.
        assertEquals("1 account", ebay.detail(signals(live = 1, attention = 0)))
    }

}
