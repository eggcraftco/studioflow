package uk.co.eggcraft.studioflow.billing

import android.app.Activity
import android.content.Context
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
    private val onError: (String) -> Unit = {}
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

        private val SUBSCRIPTION_IDS: List<String> =
            (PLAN_OFFERS.map { it.third.first } + STORAGE_OFFERS.map { it.third.first }).distinct()
    }

    private val purchasesListener = PurchasesUpdatedListener { result, purchases ->
        if (result.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
            purchases.forEach { handlePurchase(it) }
        } else if (result.responseCode == BillingClient.BillingResponseCode.USER_CANCELED) {
            onMessage("Purchase cancelled.")
        } else {
            onError("Purchase failed. ${result.debugMessage}".trim())
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

    private fun ensureConnected(onReady: () -> Unit) {
        if (billingClient.isReady) {
            onReady()
            return
        }
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    onReady()
                } else {
                    onError("Google Play billing is unavailable. ${result.debugMessage}".trim())
                }
            }

            override fun onBillingServiceDisconnected() {
                // Reconnection is attempted lazily on the next call.
            }
        })
    }

    fun loadProducts() {
        _isLoading.value = true
        ensureConnected {
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
                        onError("Could not load products. ${result.billingResult.debugMessage}".trim())
                    }
                } catch (error: Exception) {
                    onError(error.message ?: "Could not load Google Play products.")
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

    fun purchase(activity: Activity, subscriptionId: String, basePlanId: String, obfuscatedAccountId: String) {
        val details = productDetailsById[subscriptionId]
        val token = offerToken(subscriptionId, basePlanId)?.first
        if (details == null || token == null) {
            onError("This plan is not available for purchase yet.")
            return
        }
        val productParams = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(details)
            .setOfferToken(token)
            .build()
        val flowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(productParams))
            .setObfuscatedAccountId(obfuscatedAccountId)
            .build()
        _isPurchasing.value = true
        ensureConnected {
            val result = billingClient.launchBillingFlow(activity, flowParams)
            if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                _isPurchasing.value = false
                onError("Could not start purchase. ${result.debugMessage}".trim())
            }
        }
    }

    fun restorePurchases() {
        _isPurchasing.value = true
        ensureConnected {
            scope.launch {
                try {
                    val params = QueryPurchasesParams.newBuilder()
                        .setProductType(BillingClient.ProductType.SUBS)
                        .build()
                    val result = billingClient.queryPurchasesAsync(params)
                    val active = result.purchasesList.firstOrNull {
                        it.purchaseState == Purchase.PurchaseState.PURCHASED
                    }
                    if (active != null) {
                        verifyAndAcknowledge(active)
                        onMessage("Purchase restored. Your workspace plan is active.")
                    } else {
                        onMessage("No active purchase was found.")
                    }
                } catch (error: Exception) {
                    onError(error.message ?: "Could not restore purchases.")
                } finally {
                    _isPurchasing.value = false
                }
            }
        }
    }

    private fun handlePurchase(purchase: Purchase) {
        if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) {
            _isPurchasing.value = false
            return
        }
        scope.launch {
            try {
                verifyAndAcknowledge(purchase)
            } catch (error: Exception) {
                onError(error.message ?: "Could not verify purchase.")
            } finally {
                _isPurchasing.value = false
            }
        }
    }

    private suspend fun verifyAndAcknowledge(purchase: Purchase) {
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
        onMessage("Purchase verified. Your workspace plan is active.")
    }

    fun release() {
        if (billingClient.isReady) {
            billingClient.endConnection()
        }
    }
}
