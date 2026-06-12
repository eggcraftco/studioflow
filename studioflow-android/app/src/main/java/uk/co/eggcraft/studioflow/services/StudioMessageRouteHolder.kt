package uk.co.eggcraft.studioflow.services

import android.content.Context
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

object StudioMessageRouteHolder {
    @Volatile private var currentCompanyId: String = ""
    private val _pendingThreadId = MutableStateFlow("")
    val pendingThreadId: StateFlow<String> = _pendingThreadId.asStateFlow()

    fun setCurrentCompanyId(context: Context, companyId: String) {
        val clean = companyId.trim()
        currentCompanyId = clean
        if (clean.isBlank()) return
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            if (!token.isNullOrBlank()) saveDeviceToken(clean, token)
        }
    }

    fun clearCurrentCompanyId() {
        currentCompanyId = ""
    }

    fun currentCompanyId(): String = currentCompanyId

    fun setPendingThreadId(threadId: String) {
        _pendingThreadId.value = threadId.trim()
    }

    fun consumePendingThreadId(): String {
        val v = _pendingThreadId.value
        _pendingThreadId.value = ""
        return v
    }

    // Delivery push routing: open this order and land on its Shipping card.
    private val _pendingOrderId = MutableStateFlow("")
    val pendingOrderId: StateFlow<String> = _pendingOrderId.asStateFlow()
    @Volatile private var pendingOrderCard: String = ""

    fun setPendingOrderRoute(orderId: String, card: String = "shipping") {
        val clean = orderId.trim()
        if (clean.isEmpty()) return
        pendingOrderCard = card
        _pendingOrderId.value = clean
    }

    fun consumePendingOrderId(): String {
        val v = _pendingOrderId.value
        _pendingOrderId.value = ""
        return v
    }

    fun consumePendingOrderCard(): String {
        val v = pendingOrderCard
        pendingOrderCard = ""
        return v
    }

    fun saveDeviceToken(companyId: String, token: String) {
        val cleanCompanyId = companyId.trim()
        val cleanToken = token.trim()
        if (cleanCompanyId.isBlank() || cleanToken.isBlank()) return
        val documentId = cleanToken.replace("/", "_").replace("+", "-").replace(":", "_")
        val user = FirebaseAuth.getInstance().currentUser
        val payload = mutableMapOf<String, Any>(
            "token" to cleanToken,
            "companyId" to cleanCompanyId,
            "platform" to "Android",
            "language" to "English",
            "enabled" to true,
            "appName" to "NivaDesk",
            "updatedAt" to com.google.firebase.firestore.FieldValue.serverTimestamp()
        )
        if (user != null) {
            payload["userId"] = user.uid
            user.email?.let { payload["email"] = it }
        }
        FirebaseFirestore.getInstance()
            .collection("companies").document(cleanCompanyId)
            .collection("deviceTokens").document(documentId)
            .set(payload, com.google.firebase.firestore.SetOptions.merge())
    }
}
