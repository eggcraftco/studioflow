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

    // Persisted so the registration can be removed on sign-out even after a
    // process restart; without cleanup the token stays enabled under the old
    // company and the device keeps receiving that workspace's pushes.
    private const val PUSH_PREFS = "push_token_registration"
    private const val KEY_LAST_TOKEN = "lastSavedToken"
    private const val KEY_LAST_COMPANY = "lastSavedCompanyId"

    fun setCurrentCompanyId(context: Context, companyId: String) {
        val clean = companyId.trim()
        currentCompanyId = clean
        if (clean.isBlank()) return
        val appContext = context.applicationContext
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            if (!token.isNullOrBlank()) saveDeviceToken(clean, token, appContext)
        }
    }

    fun clearCurrentCompanyId() {
        currentCompanyId = ""
    }

    /// Deletes this device's push registration from the company it was last
    /// saved under. Must run BEFORE FirebaseAuth.signOut(): the Firestore rule
    /// for deviceTokens requires the caller to still be a signed-in member of
    /// that company. Always invokes [onDone] (delete success, failure, or a
    /// 3-second timeout) so sign-out is never blocked.
    fun unregisterStoredDeviceToken(context: Context, onDone: () -> Unit) {
        val prefs = context.applicationContext.getSharedPreferences(PUSH_PREFS, Context.MODE_PRIVATE)
        val token = prefs.getString(KEY_LAST_TOKEN, "").orEmpty()
        val companyId = prefs.getString(KEY_LAST_COMPANY, "").orEmpty()
        if (token.isBlank() || companyId.isBlank()) {
            onDone()
            return
        }

        val done = java.util.concurrent.atomic.AtomicBoolean(false)
        val finish = {
            if (done.compareAndSet(false, true)) {
                prefs.edit().remove(KEY_LAST_TOKEN).remove(KEY_LAST_COMPANY).apply()
                onDone()
            }
        }
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({ finish() }, 3000)

        FirebaseFirestore.getInstance()
            .collection("companies").document(companyId)
            .collection("deviceTokens").document(deviceTokenDocumentId(token))
            .delete()
            .addOnCompleteListener { finish() }
    }

    private fun deviceTokenDocumentId(token: String): String =
        token.replace("/", "_").replace("+", "-").replace(":", "_")

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

    // Launcher shortcut routing: long-press app icon → "New note" opens the
    // Notes section with a fresh note editor (mirrors the iOS quick action).
    // Main screen observes the flow to switch sections; NotesScreen consumes it.
    private val _pendingNewNote = MutableStateFlow(false)
    val pendingNewNote: StateFlow<Boolean> = _pendingNewNote.asStateFlow()

    fun setPendingNewNote() {
        _pendingNewNote.value = true
    }

    fun consumePendingNewNote(): Boolean {
        val v = _pendingNewNote.value
        _pendingNewNote.value = false
        return v
    }

    // Notes widget tap: open the Notes section (list only, no editor).
    private val _pendingOpenNotes = MutableStateFlow(false)
    val pendingOpenNotes: StateFlow<Boolean> = _pendingOpenNotes.asStateFlow()

    fun setPendingOpenNotes() {
        _pendingOpenNotes.value = true
    }

    fun consumePendingOpenNotes(): Boolean {
        val v = _pendingOpenNotes.value
        _pendingOpenNotes.value = false
        return v
    }

    // Banking → Inventory link ("View in Inventory" on a purchase-linked bank
    // transaction): open the Inventory section.
    private val _pendingOpenInventory = MutableStateFlow(false)
    val pendingOpenInventory: StateFlow<Boolean> = _pendingOpenInventory.asStateFlow()

    fun setPendingOpenInventory() {
        _pendingOpenInventory.value = true
    }

    fun consumePendingOpenInventory(): Boolean {
        val v = _pendingOpenInventory.value
        _pendingOpenInventory.value = false
        return v
    }

    fun saveDeviceToken(companyId: String, token: String, context: Context? = null) {
        val cleanCompanyId = companyId.trim()
        val cleanToken = token.trim()
        if (cleanCompanyId.isBlank() || cleanToken.isBlank()) return
        val documentId = deviceTokenDocumentId(cleanToken)
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
            .addOnSuccessListener {
                context?.applicationContext
                    ?.getSharedPreferences(PUSH_PREFS, Context.MODE_PRIVATE)
                    ?.edit()
                    ?.putString(KEY_LAST_TOKEN, cleanToken)
                    ?.putString(KEY_LAST_COMPANY, cleanCompanyId)
                    ?.apply()
            }
    }
}
