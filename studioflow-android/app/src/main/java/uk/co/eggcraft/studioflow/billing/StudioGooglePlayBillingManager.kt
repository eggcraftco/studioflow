package uk.co.eggcraft.studioflow.billing

import android.app.Activity
import android.content.Context
import android.util.Log
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.android.billingclient.api.acknowledgePurchase
import com.android.billingclient.api.queryProductDetails
import com.android.billingclient.api.queryPurchasesAsync
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import uk.co.eggcraft.studioflow.data.model.StudioBillingPlan
import uk.co.eggcraft.studioflow.util.friendlyErrorMessage

/** One purchasable plan/interval row, mirroring the iOS StoreKit product summary. */
data class StudioGooglePlanOffer(
    val plan: StudioBillingPlan,
    val interval: String,
    val subscriptionId: String,
    val basePlanId: String,
    val formattedPrice: String?
)

/** Result of a purchase that needs server verification. */
data class StudioGooglePurchaseResult(
    val subscriptionId: String,
    val purchaseToken: String
)

/** A storage add-on offer (additive Client Files storage, does not change the plan). */
data class StudioGoogleStorageOffer(
    val storageGB: Int,
    val interval: String,
    val subscriptionId: String,
    val basePlanId: String,
    val formattedPrice: String?
)

/**
 * Wraps Google Play Billing for NivaDesk subscriptions. The actual entitlement is
 * always resolved by the backend after verification — this class never grants a plan
 * locally. Mirrors the iOS StudioStoreKitManager.
 */
class StudioGooglePlayBillingManager(
    context: Context,
    private val scope: CoroutineScope,
    // Server verification callback: returns the resolved plan key, or throws on failure.
    private val verifier: suspend (StudioGooglePurchaseResult) -> String,
    private val onPlanResolved: (String) -> Unit = {},
    private val onMessage: (String) -> Unit = {},
    private val onError: (String) -> Unit = {},
    /** Translates a sentence for the person reading it; the manager itself speaks English. */
    private val translate: (String) -> String = { it }
) {
    companion object {
        // Mirror of the backend GOOGLE_PLAY_PRODUCTS map. The annual base plans are
        // "-annual", not "-yearly": the original "-yearly" plans were created with a
        // monthly billing period by mistake and are now deactivated in Play Console.
        val PLAN_OFFERS: List<Triple<StudioBillingPlan, String, Pair<String, String>>> = listOf(
            Triple(StudioBillingPlan.LifetimeLite, "month", "nivadesk_lite" to "lite-monthly"),
            Triple(StudioBillingPlan.LifetimeLite, "year", "nivadesk_lite" to "lite-annual"),
            Triple(StudioBillingPlan.ProMonthly, "month", "nivadesk_pro" to "pro-monthly"),
            Triple(StudioBillingPlan.ProMonthly, "year", "nivadesk_pro" to "pro-annual"),
            Triple(StudioBillingPlan.TeamMonthly, "month", "nivadesk_team" to "team-monthly"),
            Triple(StudioBillingPlan.TeamMonthly, "year", "nivadesk_team" to "team-annual")
        )

        // Storage add-on subscriptions. Mirror of the backend GOOGLE_PLAY_PRODUCTS
        // storage entries: Triple<storageGB, interval, subscriptionId to basePlanId>.
        val STORAGE_OFFERS: List<Triple<Int, String, Pair<String, String>>> = listOf(
            Triple(100, "month", "nivadesk_storage_100gb" to "storage-100gb-monthly"),
            Triple(100, "year", "nivadesk_storage_100gb" to "storage-100gb-annual"),
            Triple(200, "month", "nivadesk_storage_200gb" to "storage-200gb-monthly"),
            Triple(200, "year", "nivadesk_storage_200gb" to "storage-200gb-annual")
        )

        private val PLAN_SUBSCRIPTION_IDS: List<String> = PLAN_OFFERS.map { it.third.first }.distinct()
        private val STORAGE_SUBSCRIPTION_IDS: List<String> = STORAGE_OFFERS.map { it.third.first }.distinct()
        private val SUBSCRIPTION_IDS: List<String> = (PLAN_SUBSCRIPTION_IDS + STORAGE_SUBSCRIPTION_IDS).distinct()

        private const val TAG = "NivaDeskBilling"
    }

    private val purchasesListener = PurchasesUpdatedListener { result, purchases ->
        when (result.responseCode) {
            BillingClient.BillingResponseCode.OK -> {
                if (purchases.isNullOrEmpty()) _isPurchasing.value = false
                else purchases.forEach { handlePurchase(it) }
            }
            BillingClient.BillingResponseCode.USER_CANCELED -> {
                _isPurchasing.value = false
                onMessage(translate("Purchase cancelled."))
            }
            BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> {
                // Google already holds a purchase for this; make sure the server knows about it.
                _isPurchasing.value = false
                onMessage(translate("You already own this subscription."))
                reconcilePurchases()
            }
            else -> {
                _isPurchasing.value = false
                onError(billingSentence(result.responseCode))
            }
        }
    }

    private val billingClient: BillingClient = BillingClient.newBuilder(context.applicationContext)
        .setListener(purchasesListener)
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
        )
        .build()

    private var productDetailsById: Map<String, ProductDetails> = emptyMap()

    private val _offers = MutableStateFlow<List<StudioGooglePlanOffer>>(emptyList())
    val offers: StateFlow<List<StudioGooglePlanOffer>> = _offers.asStateFlow()

    private val _storageOffers = MutableStateFlow<List<StudioGoogleStorageOffer>>(emptyList())
    val storageOffers: StateFlow<List<StudioGoogleStorageOffer>> = _storageOffers.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _isPurchasing = MutableStateFlow(false)
    val isPurchasing: StateFlow<Boolean> = _isPurchasing.asStateFlow()

    // One reconcile per connection: purchases Google granted (or completed from
    // pending) while the app was away get verified the moment billing is back.
    private var reconciledThisConnection = false
    @Volatile private var reconciling = false

    /** A plain sentence for a Play response code, never the SDK's debug text. */
    private fun billingSentence(code: Int): String = translate(
        when (code) {
            BillingClient.BillingResponseCode.USER_CANCELED -> "Purchase cancelled."
            BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> "You already own this subscription."
            BillingClient.BillingResponseCode.ITEM_UNAVAILABLE -> "This plan is not available for purchase yet."
            BillingClient.BillingResponseCode.NETWORK_ERROR,
            BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE -> "Please check your internet connection and try again."
            BillingClient.BillingResponseCode.BILLING_UNAVAILABLE,
            BillingClient.BillingResponseCode.FEATURE_NOT_SUPPORTED,
            BillingClient.BillingResponseCode.SERVICE_DISCONNECTED -> "Google Play is not available on this device."
            else -> "Google Play could not complete the purchase. Please try again."
        }
    )

    private fun ensureConnected(quiet: Boolean = false, onFailed: () -> Unit = {}, onReady: () -> Unit) {
        if (billingClient.isReady) {
            onReady()
            return
        }
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    onReady()
                    if (!reconciledThisConnection) {
                        reconciledThisConnection = true
                        reconcilePurchases()
                    }
                } else {
                    onFailed()
                    if (!quiet) onError(billingSentence(result.responseCode))
                }
            }

            override fun onBillingServiceDisconnected() {
                // Reconnection is attempted lazily on the next call.
                reconciledThisConnection = false
            }
        })
    }

    fun loadProducts() {
        _isLoading.value = true
        ensureConnected(onFailed = { _isLoading.value = false }) {
            scope.launch {
                try {
                    val products = SUBSCRIPTION_IDS.map { id ->
                        QueryProductDetailsParams.Product.newBuilder()
                            .setProductId(id)
                            .setProductType(BillingClient.ProductType.SUBS)
                            .build()
                    }
                    val params = QueryProductDetailsParams.newBuilder()
                        .setProductList(products)
                        .build()
                    val result = billingClient.queryProductDetails(params)
                    if (result.billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                        val list = result.productDetailsList ?: emptyList()
                        productDetailsById = list.associateBy { it.productId }
                        rebuildOffers()
                    } else {
                        onError(billingSentence(result.billingResult.responseCode))
                    }
                } catch (error: Exception) {
                    onError(friendlyErrorMessage(error, "Could not load Google Play products.", translate))
                } finally {
                    _isLoading.value = false
                }
            }
        }
    }

    private fun rebuildOffers() {
        _offers.value = PLAN_OFFERS.map { (plan, interval, ids) ->
            val (subscriptionId, basePlanId) = ids
            val price = offerToken(subscriptionId, basePlanId)?.second
            StudioGooglePlanOffer(
                plan = plan,
                interval = interval,
                subscriptionId = subscriptionId,
                basePlanId = basePlanId,
                formattedPrice = price
            )
        }
        _storageOffers.value = STORAGE_OFFERS.map { (gb, interval, ids) ->
            val (subscriptionId, basePlanId) = ids
            val price = offerToken(subscriptionId, basePlanId)?.second
            StudioGoogleStorageOffer(
                storageGB = gb,
                interval = interval,
                subscriptionId = subscriptionId,
                basePlanId = basePlanId,
                formattedPrice = price
            )
        }
    }

    // Returns the offerToken and formatted price for a base plan, if available.
    private fun offerToken(subscriptionId: String, basePlanId: String): Pair<String, String?>? {
        val details = productDetailsById[subscriptionId] ?: return null
        val offer = details.subscriptionOfferDetails?.firstOrNull { it.basePlanId == basePlanId } ?: return null
        val price = offer.pricingPhases.pricingPhaseList.firstOrNull()?.formattedPrice
        return offer.offerToken to price
    }

    private suspend fun currentSubscriptionPurchases(): List<Purchase> {
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS)
            .build()
        val result = billingClient.queryPurchasesAsync(params)
        return if (result.billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
            result.purchasesList
        } else {
            emptyList()
        }
    }

    fun purchase(activity: Activity, subscriptionId: String, basePlanId: String, obfuscatedAccountId: String) {
        val details = productDetailsById[subscriptionId]
        val token = offerToken(subscriptionId, basePlanId)?.first
        if (details == null || token == null) {
            onError(translate("This plan is not available for purchase yet."))
            return
        }
        _isPurchasing.value = true
        ensureConnected(onFailed = { _isPurchasing.value = false }) {
            scope.launch {
                // A plan replaces the plan subscription already held (Starter → Pro,
                // monthly → annual); a storage tier replaces the storage tier. Without
                // the old token Play answers ITEM_ALREADY_OWNED, or bills twice.
                val family = if (subscriptionId in PLAN_SUBSCRIPTION_IDS) PLAN_SUBSCRIPTION_IDS else STORAGE_SUBSCRIPTION_IDS
                val existing = runCatching { currentSubscriptionPurchases() }.getOrDefault(emptyList())
                    .firstOrNull { purchase ->
                        purchase.purchaseState == Purchase.PurchaseState.PURCHASED &&
                            purchase.purchaseToken.isNotBlank() &&
                            purchase.products.any { it in family }
                    }
                val productParams = BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(details)
                    .setOfferToken(token)
                    .build()
                val flowParams = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(listOf(productParams))
                    .setObfuscatedAccountId(obfuscatedAccountId)
                    .apply {
                        if (existing != null) {
                            // WITH_TIME_PRORATION, not CHARGE_PRORATED_PRICE: Play only
                            // accepts the prorated charge for an upgrade that keeps the
                            // billing period, and refuses it for the two changes this
                            // app's Settings screen actually offers — monthly → annual
                            // and any downgrade. A Purchase carries no base plan id, so
                            // the old period cannot be read back here to pick a mode per
                            // case; WITH_TIME_PRORATION is accepted for upgrades,
                            // downgrades and period changes alike, switching the plan
                            // immediately and paying for it in adjusted time.
                            setSubscriptionUpdateParams(
                                BillingFlowParams.SubscriptionUpdateParams.newBuilder()
                                    .setOldPurchaseToken(existing.purchaseToken)
                                    .setSubscriptionReplacementMode(
                                        BillingFlowParams.SubscriptionUpdateParams.ReplacementMode.WITH_TIME_PRORATION
                                    )
                                    .build()
                            )
                        }
                    }
                    .build()
                val result = billingClient.launchBillingFlow(activity, flowParams)
                if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                    _isPurchasing.value = false
                    onError(billingSentence(result.responseCode))
                }
            }
        }
    }

    fun restorePurchases() {
        _isPurchasing.value = true
        ensureConnected(onFailed = { _isPurchasing.value = false }) {
            scope.launch {
                try {
                    val purchases = currentSubscriptionPurchases()
                    val active = purchases.filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }
                    if (active.isEmpty()) {
                        val pending = purchases.any { it.purchaseState == Purchase.PurchaseState.PENDING }
                        onMessage(
                            if (pending) translate("Your purchase is pending approval. It will activate automatically once Google confirms it.")
                            else translate("No active purchase was found.")
                        )
                        return@launch
                    }
                    // Every purchase, not only the first: a plan and a storage add-on
                    // are two subscriptions, and both need the server to know.
                    var verified = 0
                    var lastError: Throwable? = null
                    for (purchase in active) {
                        runCatching { verifyAndAcknowledge(purchase, announce = false) }
                            .onSuccess { verified += 1 }
                            .onFailure { lastError = it }
                    }
                    if (verified > 0) {
                        onMessage(translate("Purchase restored. Your workspace plan is active."))
                    } else {
                        val failure = lastError
                        onError(
                            if (failure != null) friendlyErrorMessage(failure, "Could not restore purchases.", translate)
                            else translate("Could not restore purchases.")
                        )
                    }
                } catch (error: Exception) {
                    onError(friendlyErrorMessage(error, "Could not restore purchases.", translate))
                } finally {
                    _isPurchasing.value = false
                }
            }
        }
    }

    /**
     * Anything Google has granted that the server has not confirmed yet — a
     * pending purchase that completed while the app was closed, or a purchase
     * whose verification failed on the way. Called on every billing connection
     * and when the app returns to the foreground. Quiet: nothing to say when
     * there is nothing to do.
     */
    fun reconcilePurchases() {
        if (reconciling) return
        reconciling = true
        ensureConnected(quiet = true, onFailed = { reconciling = false }) {
            scope.launch {
                try {
                    val purchases = currentSubscriptionPurchases()
                    for (purchase in purchases) {
                        if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED && !purchase.isAcknowledged) {
                            runCatching { verifyAndAcknowledge(purchase, announce = true) }
                                .onFailure { Log.w(TAG, "Could not verify a held purchase: ${it.message}") }
                        }
                    }
                } catch (error: Exception) {
                    Log.w(TAG, "Purchase reconcile failed: ${error.message}")
                } finally {
                    reconciling = false
                }
            }
        }
    }

    private fun handlePurchase(purchase: Purchase) {
        when (purchase.purchaseState) {
            Purchase.PurchaseState.PURCHASED -> scope.launch {
                try {
                    verifyAndAcknowledge(purchase, announce = true)
                } catch (error: Exception) {
                    onError(friendlyErrorMessage(error, "Could not verify purchase.", translate))
                } finally {
                    _isPurchasing.value = false
                }
            }
            // Cash at a kiosk, a card that needs approval: Google will finish it
            // later and the next reconcile picks it up. Not a failure.
            Purchase.PurchaseState.PENDING -> {
                _isPurchasing.value = false
                onMessage(translate("Your purchase is pending approval. It will activate automatically once Google confirms it."))
            }
            else -> _isPurchasing.value = false
        }
    }

    private suspend fun verifyAndAcknowledge(purchase: Purchase, announce: Boolean) {
        val subscriptionId = purchase.products.firstOrNull().orEmpty()
        val resolvedPlan = verifier(
            StudioGooglePurchaseResult(
                subscriptionId = subscriptionId,
                purchaseToken = purchase.purchaseToken
            )
        )
        // Acknowledge only after the backend confirmed the entitlement.
        if (!purchase.isAcknowledged) {
            val ackParams = AcknowledgePurchaseParams.newBuilder()
                .setPurchaseToken(purchase.purchaseToken)
                .build()
            billingClient.acknowledgePurchase(ackParams)
        }
        if (resolvedPlan.isNotEmpty()) {
            onPlanResolved(resolvedPlan)
        }
        if (announce) onMessage(translate("Purchase verified. Your workspace plan is active."))
    }

    fun release() {
        if (billingClient.isReady) {
            billingClient.endConnection()
        }
    }
}
