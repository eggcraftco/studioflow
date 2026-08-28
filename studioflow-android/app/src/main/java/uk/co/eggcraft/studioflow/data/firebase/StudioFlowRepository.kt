package uk.co.eggcraft.studioflow.data.firebase

import android.os.Build
import com.google.firebase.Firebase
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.analytics.analytics
import com.google.firebase.analytics.logEvent
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.storage.FirebaseStorage
import com.google.firebase.storage.StorageMetadata
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import org.json.JSONArray
import org.json.JSONObject
import uk.co.eggcraft.studioflow.data.model.BANK_DEFAULT_CATEGORY_TAX
import uk.co.eggcraft.studioflow.data.model.StudioBankRule
import uk.co.eggcraft.studioflow.data.model.StudioBankWaitingReceipt
import uk.co.eggcraft.studioflow.data.model.bankRuleFromDocument
import uk.co.eggcraft.studioflow.data.model.bankWaitingReceiptFromDocument
import uk.co.eggcraft.studioflow.data.model.OrderDetailCardId
import uk.co.eggcraft.studioflow.data.model.OrderDetailCardLayout
import uk.co.eggcraft.studioflow.data.model.QuickReplyTemplateItem
import uk.co.eggcraft.studioflow.data.model.STUDIO_PRIMARY_SPECIAL_NOTE_ID
import uk.co.eggcraft.studioflow.data.model.StudioBillingPlan
import uk.co.eggcraft.studioflow.data.model.StudioCompanyNumber
import uk.co.eggcraft.studioflow.data.model.StudioCustomer
import uk.co.eggcraft.studioflow.data.model.StudioCustomerPrefsPatch
import uk.co.eggcraft.studioflow.data.model.StudioCustomRole
import uk.co.eggcraft.studioflow.data.model.StudioHeadingItem
import uk.co.eggcraft.studioflow.data.model.StudioJoinRequest
import uk.co.eggcraft.studioflow.data.model.StudioOrder
import uk.co.eggcraft.studioflow.data.model.StudioQuickReminderTemplate
import com.google.firebase.firestore.Query
import uk.co.eggcraft.studioflow.data.model.StudioActivityNotification
import uk.co.eggcraft.studioflow.data.model.StudioBankConnection
import uk.co.eggcraft.studioflow.data.model.StudioBankTransaction
import uk.co.eggcraft.studioflow.data.model.bankConnectionFromDocument
import uk.co.eggcraft.studioflow.data.model.bankTransactionFromDocument
import uk.co.eggcraft.studioflow.data.model.StudioKeepCollaborationInvite
import uk.co.eggcraft.studioflow.data.model.StudioKeepNote
import uk.co.eggcraft.studioflow.data.model.StudioMessageItem
import uk.co.eggcraft.studioflow.data.model.StudioMessageTeamMember
import uk.co.eggcraft.studioflow.data.model.StudioMessageThread
import uk.co.eggcraft.studioflow.data.model.StudioMessageWorkspaceSettings
import uk.co.eggcraft.studioflow.data.model.StudioMessageTypingUser
import uk.co.eggcraft.studioflow.data.model.StudioSupportTicketMessage
import uk.co.eggcraft.studioflow.data.model.StudioSupportTicketListResult
import uk.co.eggcraft.studioflow.data.model.StudioSupportTicket
import uk.co.eggcraft.studioflow.data.model.StudioTeamMember
import uk.co.eggcraft.studioflow.data.model.StudioBankAuditEntry
import uk.co.eggcraft.studioflow.data.model.StudioInventoryCategory
import uk.co.eggcraft.studioflow.features.production.ProductionBlocker
import uk.co.eggcraft.studioflow.features.production.ProductionStage
import uk.co.eggcraft.studioflow.features.production.defaultProductionStages
import uk.co.eggcraft.studioflow.features.production.productionStagesFrom
import uk.co.eggcraft.studioflow.data.model.StudioInventoryCursor
import uk.co.eggcraft.studioflow.data.model.StudioInventoryItem
import uk.co.eggcraft.studioflow.data.model.StudioInventoryLocation
import uk.co.eggcraft.studioflow.data.model.StudioInventoryMovement
import uk.co.eggcraft.studioflow.data.model.StudioInventoryPage
import uk.co.eggcraft.studioflow.data.model.StudioInventoryRecipe
import uk.co.eggcraft.studioflow.data.model.StudioInventoryStatus
import uk.co.eggcraft.studioflow.data.model.StudioLibraryFile
import uk.co.eggcraft.studioflow.data.model.StudioInventorySummary
import uk.co.eggcraft.studioflow.data.model.StudioOrderStockLine
import uk.co.eggcraft.studioflow.data.model.StudioOpeningStockRead
import uk.co.eggcraft.studioflow.data.model.StudioOpeningStockRow
import uk.co.eggcraft.studioflow.data.model.StudioOpeningStockSkip
import uk.co.eggcraft.studioflow.data.model.StudioTrackingType
import uk.co.eggcraft.studioflow.data.model.StudioStocktakeSummary
import uk.co.eggcraft.studioflow.data.model.StudioStocktakeLine
import uk.co.eggcraft.studioflow.data.model.StudioOverPromised
import uk.co.eggcraft.studioflow.data.model.StudioInventoryReport
import uk.co.eggcraft.studioflow.data.model.StudioPurchase
import uk.co.eggcraft.studioflow.data.model.StudioSupplier
import uk.co.eggcraft.studioflow.data.model.StudioTeamAccessSnapshot
import uk.co.eggcraft.studioflow.data.model.StudioWorkspace
import uk.co.eggcraft.studioflow.data.model.StudioWorkspaceOption
import uk.co.eggcraft.studioflow.data.model.StudioWorkspaceSettings
import uk.co.eggcraft.studioflow.data.model.WorkspaceMemberAccess
import java.time.Instant
import java.util.Date
import java.util.Locale
import java.util.UUID

data class AppAssistantAnswer(
    val answer: String = "",
    val needsChatGPT: Boolean = false,
    val needsSupport: Boolean = false,
    val sources: List<String> = emptyList()
)

data class SupportTicketUnreadSummary(
    val totalUnread: Int = 0,
    val supportUnread: Int = 0,
    val workspaceUnread: Int = 0,
    val unreadSupportTicketIds: Set<String> = emptySet(),
    val unreadWorkspaceTicketIds: Set<String> = emptySet(),
    // Reported here (not only by the ticket list) so the Website Chats tab can
    // appear before the NivaDesk support tab has ever been opened.
    val isSupportAdmin: Boolean = false
)

data class StudioMessageThreadsBundle(
    val threads: List<StudioMessageThread> = emptyList(),
    val teamMembers: List<StudioMessageTeamMember> = emptyList()
)

/** Result of an OCR receipt upload: what was read and which transactions could match. */
data class BankOcrCandidate(
    val transactionId: String,
    val score: Int,
    val amount: Double,
    val currency: String,
    val bookingDate: String,
    val merchant: String
)

data class BankOcrResult(
    val inboxPath: String,
    val fileName: String,
    val amount: Double,
    val date: String,
    val candidates: List<BankOcrCandidate>
)

/** One order-payment candidate from bankMatchIncomingToOrder (suggest / needsChoice). */
data class BankPaymentCandidate(
    val id: String,
    val amount: Double,
    val method: String,
    val note: String,
    val dateMs: Long
)

/** What bankMatchIncomingToOrder came back with — candidates to pick from, or what was done. */
data class BankIncomingMatchResult(
    val orderLabel: String = "",
    val candidates: List<BankPaymentCandidate> = emptyList(),
    val needsChoice: Boolean = false,
    val linked: Boolean = false,
    val created: Boolean = false,
    val unlinked: Boolean = false,
    val already: Boolean = false
)

class StudioFlowRepository(
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
    private val functions: FirebaseFunctions = FirebaseFunctions.getInstance("europe-west2"),
    private val storage: FirebaseStorage = FirebaseStorage.getInstance()
) {
    fun authState(): Flow<FirebaseUser?> = callbackFlow {
        val listener = FirebaseAuth.AuthStateListener { firebaseAuth ->
            trySend(firebaseAuth.currentUser)
        }
        auth.addAuthStateListener(listener)
        awaitClose { auth.removeAuthStateListener(listener) }
    }

    suspend fun signIn(email: String, password: String) {
        auth.signInWithEmailAndPassword(email.trim(), password).await()
    }

    suspend fun register(fullName: String, studioName: String, email: String, password: String) {
        val result = auth.createUserWithEmailAndPassword(email.trim(), password).await()
        val user = result.user ?: return
        // Account hygiene: profile name + verification email (non-blocking).
        runCatching {
            user.updateProfile(
                com.google.firebase.auth.UserProfileChangeRequest.Builder()
                    .setDisplayName(fullName.trim())
                    .build()
            ).await()
        }
        runCatching {
            val settings = com.google.firebase.auth.ActionCodeSettings.newBuilder()
                .setUrl("https://nivadesk.app/login")
                .build()
            user.sendEmailVerification(settings).await()
        }
        // Seed the new workspace with the chosen studio name and owner details.
        runCatching {
            db.collection("companies").document(user.uid).set(
                mapOf(
                    "name" to studioName.trim(),
                    "companyName" to studioName.trim(),
                    "ownerDisplayName" to fullName.trim(),
                    "ownerEmail" to email.trim()
                ),
                com.google.firebase.firestore.SetOptions.merge()
            ).await()
        }
        recordSignupPlatformIfNewAccount()
    }

    suspend fun signInWithGoogleIdToken(idToken: String) {
        val credential = GoogleAuthProvider.getCredential(idToken, null)
        auth.signInWithCredential(credential).await()
        recordSignupPlatformIfNewAccount()
    }

    // Sign in with Apple via Firebase's OAuth web flow (apple.com provider). Lets
    // users who created their account with Apple on iPhone / web sign in on Android.
    suspend fun signInWithApple(activity: android.app.Activity) {
        val provider = com.google.firebase.auth.OAuthProvider.newBuilder("apple.com")
            .setScopes(listOf("email", "name"))
            .build()
        // If the flow was already started (e.g. activity recreated), finish that one.
        val pending = auth.pendingAuthResult
        if (pending != null) {
            pending.await()
        } else {
            auth.startActivityForSignInWithProvider(activity, provider).await()
        }
        recordSignupPlatformIfNewAccount()
    }

    /// Marks freshly created accounts as mobile signups so the desktop-only
    /// first-project info-card guide never opens for them, even on a computer.
    private suspend fun recordSignupPlatformIfNewAccount() {
        val user = auth.currentUser ?: return
        val createdAt = user.metadata?.creationTimestamp ?: return
        if (System.currentTimeMillis() - createdAt > 600_000L) return
        runCatching {
            val ref = db.collection("users").document(user.uid)
            val existing = ref.get().await().getString("signupPlatform").orEmpty()
            if (existing.isEmpty()) {
                ref.set(mapOf("signupPlatform" to "mobile"), com.google.firebase.firestore.SetOptions.merge()).await()
                // First run for a brand-new account: log the sign_up conversion
                // so Google App campaigns can optimise past the install.
                Firebase.analytics.logEvent(FirebaseAnalytics.Event.SIGN_UP) {
                    param(FirebaseAnalytics.Param.METHOD, "mobile")
                }
            }
        }
    }

    fun signOut() {
        auth.signOut()
    }

    /// Live flow of the signed-in user's `activeCompanyId` field. Emits the cleaned
    /// string (empty when missing). Used to switch workspaces live when the owner
    /// approves a join request and the Cloud Function points the approved user at
    /// the newly joined workspace.
    fun activeCompanyIdFlow(uid: String): Flow<String> = callbackFlow {
        val registration = db.collection("users").document(uid)
            .addSnapshotListener { snapshot, error ->
                if (error != null) return@addSnapshotListener
                val value = snapshot?.getString("activeCompanyId").orEmpty().trim()
                trySend(value)
            }
        awaitClose { registration.remove() }
    }

    suspend fun loadWorkspace(user: FirebaseUser): StudioWorkspace {
        ensureWorkspaceForUser(user)
        val userDoc = db.collection("users").document(user.uid).get().await()
        var companyId = userDoc.getString("activeCompanyId").orEmpty().ifEmpty { user.uid }
        var companyDoc = db.collection("companies").document(companyId).get().await()
        if (!companyDoc.exists() && companyId != user.uid) {
            companyId = user.uid
            companyDoc = db.collection("companies").document(companyId).get().await()
        }
        val userData = userDoc.data.orEmpty()
        return buildWorkspace(companyId, companyDoc.data.orEmpty(), userData, user)
    }

    private fun buildWorkspace(
        companyId: String,
        data: Map<String, Any>,
        userData: Map<String, Any>,
        user: FirebaseUser
    ): StudioWorkspace {
        val ownerUid = stringValue(data["ownerUid"], companyId)
        val ownerEmail = stringValue(data["ownerEmail"], user.email.orEmpty())
        val customRoles = customRoles(data)
        val member = (data["members"] as? Map<*, *>)?.get(user.uid) as? Map<*, *>
        val rawRole = if (user.uid == ownerUid || user.uid == companyId) {
            "owner"
        } else {
            memberRoleValue(data, user.uid, customRoles)
        }
        val role = effectiveMemberRole(rawRole, customRoles)
        val plan = StudioBillingPlan.fromRaw(data["billingPlan"] as? String)
        return StudioWorkspace(
            id = companyId,
            name = stringValue(data["name"], stringValue(data["companyName"], "My Studio")),
            ownerUid = ownerUid,
            role = role,
            roleLabel = customRoles.firstOrNull { it.id == rawRole }?.name ?: roleLabel(role),
            billingPlan = plan,
            billingInterval = stringValue(data["billingInterval"], ""),
            storageAddonKey = run {
                val status = stringValue(data["billingStorageAddonStatus"], "").lowercase()
                if (status in setOf("active", "trialing", "past_due")) stringValue(data["billingStorageAddonKey"], "") else ""
            },
            storageAddonMB = run {
                val status = stringValue(data["billingStorageAddonStatus"], "").lowercase()
                if (status in setOf("active", "trialing", "past_due")) (data["billingStorageAddonMB"] as? Number)?.toLong() ?: 0L else 0L
            },
            teamMemberLimitEffective = (data["billingTeamMemberLimit"] as? Number)?.toInt() ?: 0,
            quickReplyMenuEnabled = (data["quickReplyMenuEnabled"] as? Boolean) ?: true,
            memberAccess = memberAccess(data, user.uid, role == "owner", rawRole, customRoles),
            accountDisplayName = stringValue(
                member?.get("displayName"),
                stringValue(userData["displayName"], stringValue(data["ownerDisplayName"], user.displayName.orEmpty()))
            ),
            accountPhotoUrl = stringValue(
                member?.get("photoURL"),
                stringValue(userData["photoURL"], stringValue(data["ownerPhotoURL"], user.photoUrl?.toString().orEmpty()))
            ),
            ownerEmail = ownerEmail
        )
    }

    /**
     * Live workspace stream for a fixed company: re-emits the resolved StudioWorkspace
     * whenever the company document changes (role, access, plan, custom roles), so a
     * role change made on another device syncs without a re-login.
     */
    fun workspaceFlow(user: FirebaseUser, companyId: String): kotlinx.coroutines.flow.Flow<StudioWorkspace> =
        kotlinx.coroutines.flow.callbackFlow {
            val userData = runCatching { db.collection("users").document(user.uid).get().await().data }
                .getOrNull().orEmpty()
            val registration = db.collection("companies").document(companyId)
                .addSnapshotListener { snapshot, error ->
                    if (error != null) return@addSnapshotListener
                    val data = snapshot?.data ?: return@addSnapshotListener
                    trySend(buildWorkspace(companyId, data, userData, user))
                }
            awaitClose { registration.remove() }
        }

    suspend fun loadWorkspaceOptions(user: FirebaseUser, currentCompanyId: String): List<StudioWorkspaceOption> {
        val accessDocs = db.collection("users").document(user.uid).collection("workspaceAccess").get().await()
        val ids = linkedSetOf(user.uid)
        accessDocs.documents.forEach { ids.add(it.id) }

        return ids.mapNotNull { companyId ->
            val companyDoc = db.collection("companies").document(companyId).get().await()
            if (!companyDoc.exists()) return@mapNotNull null
            if (companyId != user.uid && accessDocs.documents.none { it.id == companyId }) return@mapNotNull null

            val data = companyDoc.data.orEmpty()
            val ownerUid = stringValue(data["ownerUid"], companyId)
            val customRoles = customRoles(data)
            val rawRole = if (companyId == user.uid || ownerUid == user.uid) "owner" else memberRoleValue(data, user.uid, customRoles)
            val role = effectiveMemberRole(rawRole, customRoles)
            StudioWorkspaceOption(
                id = companyId,
                name = stringValue(data["name"], stringValue(data["companyName"], "My Studio")),
                role = role,
                roleLabel = customRoles.firstOrNull { it.id == rawRole }?.name ?: roleLabel(role),
                isCurrent = companyId == currentCompanyId
            )
        }.sortedWith(compareByDescending<StudioWorkspaceOption> { it.isCurrent }.thenByDescending { it.role == "owner" }.thenBy { it.name })
    }

    suspend fun switchActiveWorkspace(user: FirebaseUser, companyId: String) {
        val cleanCompanyId = companyId.trim()
        require(cleanCompanyId.isNotBlank()) { "Workspace could not be selected." }

        if (cleanCompanyId != user.uid) {
            val accessDoc = db.collection("users").document(user.uid).collection("workspaceAccess").document(cleanCompanyId).get().await()
            require(accessDoc.exists()) { "Your access to this workspace is no longer available." }
        }

        val companyDoc = db.collection("companies").document(cleanCompanyId).get().await()
        require(companyDoc.exists()) { "This workspace is no longer available." }

        db.collection("users").document(user.uid)
            .set(mapOf("activeCompanyId" to cleanCompanyId, "updatedAt" to FieldValue.serverTimestamp()), SetOptions.merge())
            .await()
    }

    private suspend fun ensureWorkspaceForUser(user: FirebaseUser) {
        val uid = user.uid
        val email = user.email.orEmpty()
        val displayName = user.displayName.orEmpty()
        val photoUrl = user.photoUrl?.toString().orEmpty()
        val userRef = db.collection("users").document(uid)
        val companyRef = db.collection("companies").document(uid)

        val userDoc = userRef.get().await()
        val userPayload = mutableMapOf<String, Any>(
            "uid" to uid,
            "email" to email,
            "displayName" to displayName,
            "photoURL" to photoUrl,
            "updatedAt" to FieldValue.serverTimestamp()
        )
        if (userDoc.getString("activeCompanyId").isNullOrBlank()) {
            userPayload["activeCompanyId"] = uid
        }
        // Fire-and-forget: Firestore queues this write while offline; awaiting it
        // would block app startup forever without a connection.
        userRef.set(userPayload, SetOptions.merge())

        val companyDoc = companyRef.get().await()
        val ownerMember = mapOf(
            "uid" to uid,
            "email" to email,
            "displayName" to displayName,
            "photoURL" to photoUrl,
            "role" to "owner",
            "updatedAt" to FieldValue.serverTimestamp()
        )

        if (companyDoc.exists()) {
            val data = companyDoc.data.orEmpty()
            val payload = mutableMapOf<String, Any>(
                "companyId" to uid,
                "appName" to "NivaDesk",
                "memberUids" to FieldValue.arrayUnion(uid),
                "memberRoles" to mapOf(uid to "owner"),
                "updatedAt" to FieldValue.serverTimestamp()
            )
            if (stringValue(data["ownerUid"], "").isBlank()) payload["ownerUid"] = uid
            if (stringValue(data["ownerEmail"], "").isBlank()) payload["ownerEmail"] = email
            if (stringValue(data["ownerDisplayName"], "").isBlank()) payload["ownerDisplayName"] = displayName
            if (stringValue(data["ownerPhotoURL"], "").isBlank()) payload["ownerPhotoURL"] = photoUrl
            val members = data["members"] as? Map<*, *>
            if (members?.get(uid) == null) payload["members"] = mapOf(uid to ownerMember)
            companyRef.set(payload, SetOptions.merge())
            return
        }

        companyRef.set(
            mapOf(
                "companyId" to uid,
                "ownerUid" to uid,
                "ownerEmail" to email,
                "ownerDisplayName" to displayName,
                "ownerPhotoURL" to photoUrl,
                "appName" to "NivaDesk",
                "memberUids" to FieldValue.arrayUnion(uid),
                "memberRoles" to mapOf(uid to "owner"),
                "members" to mapOf(uid to ownerMember),
                "name" to "My Studio",
                "companyName" to "My Studio",
                "createdAt" to FieldValue.serverTimestamp(),
                "updatedAt" to FieldValue.serverTimestamp(),
                "billingPlan" to StudioBillingPlan.Demo.raw,
                "billingPlanName" to StudioBillingPlan.Demo.title,
                "billingPlanSource" to "new_workspace_default",
                "billingStorageLimitMB" to StudioBillingPlan.Demo.storageLimitMb,
                "billingTeamMemberLimit" to StudioBillingPlan.Demo.teamMemberLimit
            ),
            SetOptions.merge()
        )
    }

    fun workspaceSettingsFlow(
        workspaceId: String,
        userId: String = "",
        ownerUid: String = "",
        role: String = ""
    ): Flow<StudioWorkspaceSettings> = callbackFlow {
        // Cached state — updated by either listener, merged together for the emitted settings.
        var sharedData: Map<String, Any> = emptyMap()
        var personalInterface: Map<String, Any?> = emptyMap()
        val personalInterfaceKeys = listOf(
            "appTheme", "selectedLanguage",
            "pdfShowCustomer", "pdfShowContact", "pdfShowPreview",
            "pdfShowMaterials", "pdfShowPriority", "pdfShowStatus", "pdfShowShipping", "pdfShowAddress", "pdfShowShippingAddress"
        )

        fun emit() {
            val merged = HashMap<String, Any>()
            sharedData.forEach { (k, v) -> if (v != null) merged[k] = v }
            // Language + theme are STRICTLY per-user. Drop any workspace-wide values
            // so a member never inherits the owner's language/theme — only the user's
            // own personalInterfaceSettings doc applies (defaults to English/System).
            merged.remove("seciliDil")
            merged.remove("selectedLanguage")
            merged.remove("appTheme")
            // Personal interface OVERRIDES — changes made by the signed-in user on any
            // device (Mac/Android/Web) sync live everywhere for that user only.
            personalInterfaceKeys.forEach { key -> personalInterface[key]?.let { merged[key] = it } }
            trySend(workspaceSettings(merged, userId, ownerUid))
        }

        // Workspace-wide listener.
        val registration = db.collection("companySettings").document(workspaceId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                sharedData = snapshot?.data.orEmpty()
                // Refresh quick-reply personal once per workspace change (still callable-based for now).
                functions.getHttpsCallable("getQuickReplyPersonalSettings")
                    .call(mapOf("companyId" to workspaceId))
                    .addOnSuccessListener { result ->
                        val payload = result.data as? Map<*, *>
                        val personal = payload?.get("settings") as? Map<*, *>
                        val merged = sharedData.toMutableMap()
                        if (personal != null) {
                            personal["replyMode"]?.let { merged["replyMode"] = it }
                            personal["quickReplyPoliteness"]?.let { merged["quickReplyPoliteness"] = it }
                            personal["quickReplyLength"]?.let { merged["quickReplyLength"] = it }
                            personal["onDeviceKnowledgeBase"]?.let { merged["aiKnowledgeBase"] = it }
                            personal["offlineProductsJSON"]?.let { merged["customProductsJSON"] = it }
                            personal["offlineRulesJSON"]?.let { merged["customRulesJSON"] = it }
                        }
                        sharedData = merged
                        emit()
                    }
                    .addOnFailureListener { emit() }
            }

        // Per-user personal interface settings live listener.
        // Doc path: companies/{workspaceId}/personalInterfaceSettings/{userId}
        // Changes here (theme / language / pdf flags) sync instantly across the user's devices.
        val personalRegistration = if (userId.isNotBlank()) {
            db.collection("companies").document(workspaceId)
                .collection("personalInterfaceSettings").document(userId)
                .addSnapshotListener { snap, err ->
                    if (err != null) return@addSnapshotListener
                    @Suppress("UNCHECKED_CAST")
                    personalInterface = (snap?.data as? Map<String, Any?>).orEmpty()
                    emit()
                }
        } else null

        awaitClose {
            registration.remove()
            personalRegistration?.remove()
        }
    }

    fun ordersFlow(workspace: StudioWorkspace, user: FirebaseUser): Flow<List<StudioOrder>> = callbackFlow {
        // Only strict Workflow Only role uses the finance-free /workflowOrders subcollection.
        // Custom-role members with "Assigned Projects Only" toggled ON query /siparisler
        // directly (filtered to their own assignedToUid) — Firestore rules grant them full
        // member-tier access to their OWN assigned orders, including financial fields.
        val strictWorkflow = normalizeRole(workspace.role) == "workflow"
        val assignedOnlyCustom = workspace.shouldShowOnlyAssignedProjects && !strictWorkflow
        val orderQuery: Query = when {
            strictWorkflow -> {
                functions.getHttpsCallable("ensureWorkflowAssignedOrderViews")
                    .call(mapOf("companyId" to workspace.id))
                    .addOnFailureListener { error -> close(error) }
                db.collection("companies").document(workspace.id).collection("workflowOrders")
                    .whereEqualTo("assignedToUid", user.uid)
            }
            assignedOnlyCustom -> {
                db.collection("siparisler")
                    .whereEqualTo("companyId", workspace.id)
                    .whereEqualTo("assignedToUid", user.uid)
            }
            else -> db.collection("siparisler").whereEqualTo("companyId", workspace.id)
        }
        val registration = orderQuery
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                val orders = snapshot?.documents
                    ?.map { StudioOrder.fromDocument(it) }
                    ?.filter { order ->
                        !workspace.shouldShowOnlyAssignedProjects || orderIsAssignedToUser(order, user)
                    }
                    ?.sortedWith(compareBy<StudioOrder> { it.isClosed }.thenBy { it.remainingDays }.thenBy { it.paymentDate })
                    .orEmpty()
                trySend(orders)
            }
        awaitClose { registration.remove() }
    }

    // Customers live in the top-level `musteriler` collection (same as Mac/iPhone
    // and web), scoped by companyId.
    fun customersFlow(workspace: StudioWorkspace): Flow<List<StudioCustomer>> = callbackFlow {
        val registration = db.collection("musteriler")
            .whereEqualTo("companyId", workspace.id)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                val customers = snapshot?.documents
                    ?.map { StudioCustomer.fromDocument(it) }
                    .orEmpty()
                trySend(customers)
            }
        awaitClose { registration.remove() }
    }

    private fun customerCallablePayload(companyId: String, customer: StudioCustomer): Map<String, Any?> = mapOf(
        "companyId" to companyId,
        "customerId" to customer.id,
        "name" to customer.name,
        "email" to customer.email,
        "phone" to customer.phone,
        // The callable rebuilds these on every write (no key-present semantics),
        // so they ride along on EVERY save path or an Android edit would wipe
        // what the web stored.
        "primaryPhone" to customer.primaryPhone,
        "whatsappNumber" to customer.whatsappNumber,
        "company" to customer.company,
        "instagram" to customer.instagram,
        "address" to customer.address,
        "streetAddress" to customer.streetAddress,
        "city" to customer.city,
        "postalCode" to customer.postalCode,
        "country" to customer.country,
        "shippingAddress" to customer.shippingAddress,
        "shippingStreetAddress" to customer.shippingStreetAddress,
        "shippingCity" to customer.shippingCity,
        "shippingPostalCode" to customer.shippingPostalCode,
        "shippingCountry" to customer.shippingCountry,
        "shippingPhone" to customer.shippingPhone,
        "notes" to customer.notes
    )

    suspend fun updateCustomer(
        companyId: String,
        customer: StudioCustomer,
        prefsPatch: StudioCustomerPrefsPatch? = null
    ) {
        // Note: the profile photo is intentionally omitted here so contact-field autosave
        // never overwrites an avatar set on another device (the backend merges the doc).
        // Segments/preferences ride along only when a patch carries them — the callable
        // treats missing keys as "leave unchanged" (web parity), so the plain autosave
        // (prefsPatch = null) can never wipe them.
        functions.getHttpsCallable("updateWebCustomer")
            .call(customerCallablePayload(companyId, customer) + prefsPatchPayload(prefsPatch))
            .await()
    }

    private fun prefsPatchPayload(patch: StudioCustomerPrefsPatch?): Map<String, Any?> {
        if (patch == null) return emptyMap()
        val extras = mutableMapOf<String, Any?>()
        patch.tags?.let { tags ->
            // Same cleaning the web applies before sending: trim, drop blanks,
            // dedupe, cap at 20 (the server re-validates anyway).
            extras["tags"] = tags.map { it.trim() }.filter { it.isNotEmpty() }.distinct().take(20)
        }
        patch.preferredChannel?.let { extras["preferredChannel"] = it }
        patch.doNotContact?.let { extras["doNotContact"] = it }
        patch.marketingOptIn?.let { extras["marketingOptIn"] = it }
        if (patch.clearNextFollowUp) {
            extras["nextFollowUpDateMillis"] = null
        } else {
            patch.nextFollowUpDateMillis?.let { extras["nextFollowUpDateMillis"] = it }
        }
        return extras
    }

    // Replays the payload the store last sent for this customer — the store's
    // values win (web parity). Returns how many fields the server applied.
    // The callable fails with failed-precondition when nothing is stored yet.
    suspend fun resyncIntegrationCustomer(companyId: String, customerId: String): Int {
        val result = functions.getHttpsCallable("resyncIntegrationCustomer")
            .call(mapOf("companyId" to companyId, "customerId" to customerId))
            .await()
        val data = result.data as? Map<*, *>
        return (data?.get("applied") as? Number)?.toInt() ?: 0
    }

    // Creates a brand-new customer via the same callable the web uses. The customerId
    // key is omitted (no id yet — Firestore mints one); the payload otherwise mirrors
    // the contact fields the update callable sends.
    suspend fun createCustomer(
        companyId: String,
        name: String,
        email: String,
        phone: String,
        instagram: String,
        streetAddress: String,
        city: String,
        postalCode: String,
        country: String,
        notes: String
    ): String {
        val result = functions.getHttpsCallable("createWebCustomer")
            .call(
                mapOf(
                    "companyId" to companyId,
                    "name" to name,
                    "email" to email,
                    "phone" to phone,
                    "instagram" to instagram,
                    "address" to "",
                    "streetAddress" to streetAddress,
                    "city" to city,
                    "postalCode" to postalCode,
                    "country" to country,
                    "notes" to notes
                )
            )
            .await()
        val data = result.data as? Map<*, *>
        return data?.get("message") as? String ?: "Customer created."
    }

    // Uploads a new customer photo and persists it via the same callable, sending the
    // full contact fields alongside profileImageUrl so the merge keeps everything else.
    suspend fun uploadCustomerImage(
        workspace: StudioWorkspace,
        user: FirebaseUser,
        customer: StudioCustomer,
        bytes: ByteArray,
        contentType: String
    ): String {
        requireImageBytes(bytes, 10, "Choose a customer photo under 10 MB.")
        val cleanType = cleanImageContentType(contentType)
        val extension = extensionForImageContentType(cleanType)
        val uploadedAt = java.time.Instant.now().toString()
        val ref = storage.reference.child("companies/${workspace.id}/design_images/android_customer_${System.currentTimeMillis()}.$extension")
        val metadata = StorageMetadata.Builder()
            .setContentType(cleanType)
            .setCustomMetadata("companyId", workspace.id)
            .setCustomMetadata("uploadedByUid", user.uid)
            .setCustomMetadata("uploadedByEmail", user.email.orEmpty().ifBlank { "unknown" })
            .setCustomMetadata("source", "customer_photo")
            .setCustomMetadata("orderId", "")
            .setCustomMetadata("uploadedAt", uploadedAt)
            .setCustomMetadata("fileType", cleanType)
            .setCustomMetadata("fileSize", bytes.size.toString())
            .build()
        ref.putBytes(bytes, metadata).await()
        val url = ref.downloadUrl.await().toString()
        functions.getHttpsCallable("updateWebCustomer")
            .call(customerCallablePayload(workspace.id, customer) + mapOf("profileImageUrl" to url))
            .await()
        return url
    }

    suspend fun deleteCustomer(companyId: String, customerId: String) {
        functions.getHttpsCallable("deleteWebCustomer")
            .call(mapOf("companyId" to companyId, "customerId" to customerId))
            .await()
    }

    fun teamAccessFlow(workspaceId: String): Flow<StudioTeamAccessSnapshot> = callbackFlow {
        val registration = db.collection("companies").document(workspaceId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                val data = snapshot?.data.orEmpty()
                val ownerUid = stringValue(data["ownerUid"], workspaceId)
                val customRoles = customRoles(data)
                val members = data["members"] as? Map<*, *> ?: emptyMap<Any, Any>()
                val memberRoles = data["memberRoles"] as? Map<*, *> ?: emptyMap<Any, Any>()
                val memberCustomRoles = data["memberCustomRoles"] as? Map<*, *> ?: emptyMap<Any, Any>()
                val memberAccess = data["memberAccess"] as? Map<*, *> ?: emptyMap<Any, Any>()
                val output = members.mapNotNull { (uid, value) ->
                    val uidText = uid.toString()
                    val raw = value as? Map<*, *> ?: return@mapNotNull null
                    val rawCustomRole = stringValue(raw["customRoleId"], stringValue(memberCustomRoles[uidText], ""))
                    val role = if (customRoles.any { it.id == rawCustomRole }) {
                        rawCustomRole
                    } else {
                        normalizeRoleForTeamAccess(stringValue(raw["role"], stringValue(memberRoles[uidText], if (uidText == ownerUid) "owner" else "member")))
                    }
                    val effectiveRole = customRoles.firstOrNull { it.id == role }?.baseRole ?: normalizeRoleForTeamAccess(role)
                    val accessRaw = (raw["access"] as? Map<*, *>) ?: (memberAccess[uidText] as? Map<*, *>) ?: emptyMap<Any, Any>()
                    StudioTeamMember(
                        id = uidText,
                        email = stringValue(raw["email"], ""),
                        displayName = stringValue(raw["displayName"], ""),
                        photoUrl = stringValue(raw["photoURL"], ""),
                        role = role,
                        roleLabel = customRoles.firstOrNull { it.id == role }?.name ?: roleLabel(effectiveRole),
                        access = accessFromMap(accessRaw, forceFullAccess = uidText == ownerUid || effectiveRole == "owner"),
                        isOwner = uidText == ownerUid || effectiveRole == "owner"
                    )
                }.sortedWith(compareByDescending<StudioTeamMember> { it.isOwner }.thenBy { it.roleLabel }.thenBy { it.label })
                trySend(StudioTeamAccessSnapshot(members = output, customRoles = customRoles.sortedBy { it.name.lowercase() }))
            }
        awaitClose { registration.remove() }
    }

    fun joinRequestsFlow(workspace: StudioWorkspace): Flow<List<StudioJoinRequest>> = callbackFlow {
        if (!workspace.isOwner) {
            trySend(emptyList())
            awaitClose {}
            return@callbackFlow
        }
        val registration = db.collection("workspaceJoinRequests")
            .whereEqualTo("targetCompanyId", workspace.id)
            .whereEqualTo("status", "pending")
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                val requests = snapshot?.documents
                    ?.mapNotNull { document ->
                        val data = document.data.orEmpty()
                        val requesterUid = stringValue(data["requesterUid"], "")
                        if (requesterUid.isBlank()) return@mapNotNull null
                        StudioJoinRequest(
                            id = document.id,
                            requesterUid = requesterUid,
                            requesterEmail = stringValue(data["requesterEmail"], ""),
                            requesterDisplayName = stringValue(data["requesterDisplayName"], ""),
                            requesterPhotoUrl = stringValue(data["requesterPhotoURL"], ""),
                            status = stringValue(data["status"], "pending"),
                            createdAt = dateFromAny(data["createdAt"])
                        )
                    }
                    ?.sortedByDescending { it.createdAt?.time ?: 0L }
                    .orEmpty()
                trySend(requests)
            }
        awaitClose { registration.remove() }
    }

    suspend fun assignOrder(workspace: StudioWorkspace, order: StudioOrder, member: StudioTeamMember?) {
        functions.getHttpsCallable("updateWebOrder")
            .call(
                mapOf(
                    "companyId" to workspace.id,
                    "orderId" to order.id,
                    "details" to mapOf(
                        "assignedToUid" to (member?.id ?: ""),
                        "assignedToEmail" to (member?.email ?: "")
                    )
                )
            )
            .await()
    }

    suspend fun updateOrderFields(workspace: StudioWorkspace, order: StudioOrder, payload: Map<String, Any?>) {
        functions.getHttpsCallable("updateWebOrder")
            .call(
                mutableMapOf<String, Any?>(
                    "companyId" to workspace.id,
                    "orderId" to order.id
                ).apply {
                    putAll(payload)
                }
            )
            .await()
    }

    suspend fun deleteOrder(workspace: StudioWorkspace, order: StudioOrder) {
        // Only strict Workflow Only members need owner approval to delete. Custom-role
        // members with "Assigned Projects Only" can delete THEIR own orders directly.
        val normalizedRole = workspace.role.lowercase().replace("_", "").replace("-", "").replace(" ", "")
        val requiresOwnerApproval = normalizedRole == "workflow" || normalizedRole == "workflowonly"
        val callable = if (requiresOwnerApproval) "requestWorkflowOrderDeletion" else "deleteWebOrder"
        functions.getHttpsCallable(callable)
            .call(mapOf("companyId" to workspace.id, "orderId" to order.id))
            .await()
    }

    suspend fun restoreOrder(workspace: StudioWorkspace, order: StudioOrder) {
        functions.getHttpsCallable("restoreWebOrder")
            .call(mapOf("companyId" to workspace.id, "orderId" to order.id))
            .await()
    }

    suspend fun reviewWorkflowOrderDeletion(workspace: StudioWorkspace, orderId: String, approve: Boolean) {
        val callable = if (approve) "approveWorkflowOrderDeletion" else "rejectWorkflowOrderDeletion"
        functions.getHttpsCallable(callable)
            .call(mapOf("companyId" to workspace.id, "orderId" to orderId))
            .await()
    }

    suspend fun saveOrderCardLayout(workspace: StudioWorkspace, order: StudioOrder, snapshotJSON: String): String {
        val result = functions.getHttpsCallable("saveSwiftWorkspaceCardProfile")
            .call(
                mapOf(
                    "companyId" to workspace.id,
                    "orderId" to order.id,
                    "snapshotJSON" to snapshotJSON
                )
            )
            .await()
        val data = result.data as? Map<*, *>
        return data?.get("message") as? String ?: "This order layout was saved."
    }

    // Returns this workspace's signed WooCommerce Delivery URL (with the per-workspace
    // webhook token), minting the token on first use. Owner-only on the backend.
    suspend fun getWooCommerceWebhookDeliveryUrl(workspace: StudioWorkspace): String {
        val result = functions.getHttpsCallable("getWooCommerceWebhookToken")
            .call(mapOf("companyId" to workspace.id))
            .await()
        val data = result.data as? Map<*, *>
        return data?.get("deliveryUrl") as? String ?: ""
    }

    suspend fun getShopifyWebhookDeliveryUrl(workspace: StudioWorkspace): String {
        val result = functions.getHttpsCallable("getShopifyWebhookToken")
            .call(mapOf("companyId" to workspace.id))
            .await()
        val data = result.data as? Map<*, *>
        return data?.get("deliveryUrl") as? String ?: ""
    }

    // Stores connected through the official Shopify App Store app (member read).
    data class ShopifyAppStoreSummary(
        val shop: String,
        val shopName: String,
        val status: String,
        val syncedOrders: Int,
        val failedCount: Int,
    )

    suspend fun getShopifyAppStores(workspace: StudioWorkspace): List<ShopifyAppStoreSummary> {
        val result = functions.getHttpsCallable("getShopifyIntegrationsForWorkspace")
            .call(mapOf("companyId" to workspace.id))
            .await()
        val data = result.data as? Map<*, *>
        val stores = data?.get("stores") as? List<*> ?: return emptyList()
        return stores.mapNotNull { raw ->
            val entry = raw as? Map<*, *> ?: return@mapNotNull null
            val shop = (entry["shop"] as? String).orEmpty().trim()
            if (shop.isEmpty()) return@mapNotNull null
            val stats = entry["stats"] as? Map<*, *> ?: emptyMap<Any, Any>()
            ShopifyAppStoreSummary(
                shop = shop,
                shopName = (entry["shopName"] as? String).orEmpty(),
                status = (entry["status"] as? String).orEmpty().lowercase(),
                syncedOrders = (stats["syncedOrders"] as? Number)?.toInt() ?: 0,
                failedCount = (stats["failedCount"] as? Number)?.toInt() ?: 0,
            )
        }
    }

    // Owner-only pause / resume / unlink; state must be active, paused or unlinked.
    suspend fun setShopifyAppStoreState(workspace: StudioWorkspace, shop: String, state: String) {
        functions.getHttpsCallable("setShopifyIntegrationState")
            .call(mapOf("companyId" to workspace.id, "shop" to shop, "state" to state))
            .await()
    }

    suspend fun getInboundWebhookDeliveryUrl(workspace: StudioWorkspace): String {
        val result = functions.getHttpsCallable("getInboundWebhookToken")
            .call(mapOf("companyId" to workspace.id))
            .await()
        val data = result.data as? Map<*, *>
        return data?.get("deliveryUrl") as? String ?: ""
    }

    // ===================== CUSTOMER PORTAL DOMAIN (owner only) =====================
    // The workspace's client-facing domain layer: a subdomain slug for everyone,
    // a custom hostname for Pro/Team. Mirrors functions/clientDomains.js and the
    // web lib/studioflow/clientDomain.ts.

    data class ClientDomainRow(
        val host: String,
        val kind: String,   // "subdomain" | "custom"
        val status: String, // "active" | "pending"
    )

    // Branding for the customer-facing pages: "" means "use the default accent".
    data class ClientPortalBranding(
        val accentColor: String,    // "" | "#rrggbb"
        val showPoweredBy: Boolean,
    )

    data class ClientDomainConfig(
        val subdomain: ClientDomainRow?,
        val customDomains: List<ClientDomainRow>,
        val cnameTarget: String,
        val branding: ClientPortalBranding,
    )

    data class ClientDomainVerifyResult(
        val verified: Boolean,
        val found: List<String>,
        val expected: String,
        val error: String,
    )

    private fun clientDomainRow(raw: Any?): ClientDomainRow? {
        val entry = raw as? Map<*, *> ?: return null
        val host = (entry["host"] as? String).orEmpty().trim()
        if (host.isEmpty()) return null
        return ClientDomainRow(
            host = host,
            kind = (entry["kind"] as? String).orEmpty().lowercase(),
            status = (entry["status"] as? String).orEmpty().lowercase(),
        )
    }

    suspend fun getClientDomainConfig(workspace: StudioWorkspace): ClientDomainConfig {
        val result = functions.getHttpsCallable("getClientDomainConfig")
            .call(mapOf("companyId" to workspace.id))
            .await()
        val data = result.data as? Map<*, *>
        val brandingRaw = data?.get("branding") as? Map<*, *>
        return ClientDomainConfig(
            subdomain = clientDomainRow(data?.get("subdomain")),
            customDomains = (data?.get("customDomains") as? List<*>)?.mapNotNull { clientDomainRow(it) } ?: emptyList(),
            cnameTarget = ((data?.get("cnameTarget") as? String).orEmpty().trim()).ifEmpty { "customers.nivadesk.app" },
            branding = ClientPortalBranding(
                accentColor = (brandingRaw?.get("accentColor") as? String).orEmpty().trim().lowercase(),
                showPoweredBy = brandingRaw?.get("showPoweredBy") != false,
            ),
        )
    }

    suspend fun saveClientPortalBranding(workspace: StudioWorkspace, accentColor: String, showPoweredBy: Boolean) {
        functions.getHttpsCallable("saveClientPortalBranding")
            .call(mapOf("companyId" to workspace.id, "accentColor" to accentColor, "showPoweredBy" to showPoweredBy))
            .await()
    }

    suspend fun setClientSubdomain(workspace: StudioWorkspace, slug: String) {
        functions.getHttpsCallable("setClientSubdomain")
            .call(mapOf("companyId" to workspace.id, "slug" to slug))
            .await()
    }

    suspend fun requestClientDomain(workspace: StudioWorkspace, host: String) {
        functions.getHttpsCallable("requestClientDomain")
            .call(mapOf("companyId" to workspace.id, "host" to host))
            .await()
    }

    suspend fun verifyClientDomain(workspace: StudioWorkspace, host: String): ClientDomainVerifyResult {
        val result = functions.getHttpsCallable("verifyClientDomain")
            .call(mapOf("companyId" to workspace.id, "host" to host))
            .await()
        val data = result.data as? Map<*, *>
        return ClientDomainVerifyResult(
            verified = data?.get("verified") == true,
            found = (data?.get("found") as? List<*>)?.mapNotNull { it as? String } ?: emptyList(),
            expected = (data?.get("expected") as? String).orEmpty(),
            error = (data?.get("error") as? String).orEmpty(),
        )
    }

    suspend fun removeClientDomain(workspace: StudioWorkspace, host: String) {
        functions.getHttpsCallable("removeClientDomain")
            .call(mapOf("companyId" to workspace.id, "host" to host))
            .await()
    }

    // Mints (or reuses) the workspace-linked obfuscated account token used as the
    // Google Play obfuscatedAccountId. Mirrors prepareAppleSubscriptionPurchase.
    suspend fun prepareGooglePlayPurchase(workspace: StudioWorkspace): String {
        val result = functions.getHttpsCallable("prepareGooglePlayPurchase")
            .call(mapOf("companyId" to workspace.id))
            .await()
        val data = result.data as? Map<*, *>
        return data?.get("obfuscatedAccountId") as? String ?: ""
    }

    // Sends a Google Play purchase token to the backend for server-side verification.
    // The backend verifies via the Play Developer API and updates the entitlement.
    suspend fun verifyGooglePlayPurchase(workspace: StudioWorkspace, productId: String, purchaseToken: String): String {
        val result = functions.getHttpsCallable("verifyGooglePlayPurchase")
            .call(
                mapOf(
                    "companyId" to workspace.id,
                    "productId" to productId,
                    "purchaseToken" to purchaseToken
                )
            )
            .await()
        val data = result.data as? Map<*, *>
        return data?.get("plan") as? String ?: ""
    }

    suspend fun resetOrderCardLayout(workspace: StudioWorkspace, order: StudioOrder): String {
        val result = functions.getHttpsCallable("resetOrderWorkspaceCardLayout")
            .call(
                mapOf(
                    "companyId" to workspace.id,
                    "orderId" to order.id
                )
            )
            .await()
        val data = result.data as? Map<*, *>
        return data?.get("message") as? String ?: "This order now uses the shared card layout."
    }

    suspend fun uploadClientFile(
        workspace: StudioWorkspace,
        user: FirebaseUser,
        order: StudioOrder,
        bytes: ByteArray,
        fileName: String,
        contentType: String,
        policyAccepted: Boolean,
        maxSizeMb: Int
    ): String {
        val maxMb = maxSizeMb.coerceIn(1, 50)
        requireClientFileBytes(bytes, maxMb)
        validateWorkspacePlanAction(workspace, "upload_client_file", bytes.size)
        val cleanName = cleanClientFileName(fileName)
        val cleanType = cleanClientFileContentType(cleanName, contentType)
        val extension = extensionForClientFile(cleanName, cleanType)
        val fileId = UUID.randomUUID().toString()
        val safeOrderId = safeStorageSegment(order.id)
        val uploadedAt = Instant.now().toString()
        val ref = storage.reference.child("companies/${workspace.id}/client_files/$safeOrderId/$fileId.$extension")
        val uploadedByEmail = user.email.orEmpty()
        val uploadedBy = uploadedByEmail.ifBlank { user.displayName.orEmpty().ifBlank { user.uid } }
        val metadata = StorageMetadata.Builder()
            .setContentType(cleanType)
            .setCustomMetadata("companyId", workspace.id)
            .setCustomMetadata("uploadedByUid", user.uid)
            .setCustomMetadata("uploadedByEmail", uploadedByEmail.ifBlank { "unknown" })
            .setCustomMetadata("uploadedBy", uploadedBy)
            .setCustomMetadata("originalFileName", cleanName)
            .setCustomMetadata("source", "android")
            .setCustomMetadata("orderId", order.id)
            .setCustomMetadata("uploadedAt", uploadedAt)
            .setCustomMetadata("fileType", cleanType)
            .setCustomMetadata("fileSize", bytes.size.toString())
            .setCustomMetadata("storagePath", ref.path)
            .setCustomMetadata("policyAccepted", policyAccepted.toString())
            .setCustomMetadata("maxSizeMB", maxMb.toString())
            .setCustomMetadata("uploadPolicyAccepted", policyAccepted.toString())
            .setCustomMetadata("uploadMaxSizeMB", maxMb.toString())
            .build()
        ref.putBytes(bytes, metadata).await()
        val downloadUrl = ref.downloadUrl.await().toString()
        val result = functions.getHttpsCallable("appendClientFile")
            .call(
                mapOf(
                    "companyId" to workspace.id,
                    "orderId" to order.id,
                    "fileId" to fileId,
                    "fileSizeBytes" to bytes.size,
                    "clientFile" to mapOf(
                        "id" to fileId,
                        "fileName" to cleanName,
                        "downloadURL" to downloadUrl,
                        "storagePath" to ref.path.trimStart('/'),
                        "contentType" to cleanType,
                        "fileSize" to bytes.size,
                        "uploadedByUid" to user.uid,
                        "uploadedByEmail" to uploadedByEmail,
                        "uploadedBy" to uploadedBy,
                        "uploadedAt" to uploadedAt,
                        "source" to "android",
                        "note" to "",
                        "isPendingUpload" to false,
                        "localFilePath" to "",
                        "pendingQueueId" to ""
                    )
                )
            )
            .await()
        val data = result.data as? Map<*, *>
        return data?.get("message") as? String ?: "File uploaded."
    }

    suspend fun uploadPreviewImage(
        workspace: StudioWorkspace,
        user: FirebaseUser,
        order: StudioOrder,
        bytes: ByteArray,
        fileName: String,
        contentType: String,
        maxSizeMb: Int
    ): String {
        val maxMb = maxSizeMb.coerceIn(1, 50)
        requireImageBytes(bytes, maxMb, "Choose a preview image under $maxMb MB.")
        validateWorkspacePlanAction(workspace, "upload_preview_image", bytes.size)
        val cleanType = cleanImageContentType(contentType)
        val extension = extensionForImageContentType(cleanType)
        val cleanName = cleanClientFileName(fileName).ifBlank { "Preview image" }
        val safeOrderId = safeStorageSegment(order.id)
        val uploadedAt = Instant.now().toString()
        val ref = storage.reference.child("companies/${workspace.id}/design_images/$safeOrderId/android_preview_${System.currentTimeMillis()}.$extension")
        val uploadedByEmail = user.email.orEmpty()
        val uploadedBy = uploadedByEmail.ifBlank { user.displayName.orEmpty().ifBlank { user.uid } }
        val metadata = StorageMetadata.Builder()
            .setContentType(cleanType)
            .setCustomMetadata("companyId", workspace.id)
            .setCustomMetadata("uploadedByUid", user.uid)
            .setCustomMetadata("uploadedByEmail", uploadedByEmail.ifBlank { "unknown" })
            .setCustomMetadata("uploadedBy", uploadedBy)
            .setCustomMetadata("originalFileName", cleanName)
            .setCustomMetadata("source", "android_preview")
            .setCustomMetadata("orderId", order.id)
            .setCustomMetadata("uploadedAt", uploadedAt)
            .setCustomMetadata("fileType", cleanType)
            .setCustomMetadata("fileSize", bytes.size.toString())
            .setCustomMetadata("storagePath", ref.path)
            .build()
        ref.putBytes(bytes, metadata).await()
        val downloadUrl = ref.downloadUrl.await().toString()
        updateOrderFields(workspace, order, mapOf("details" to mapOf("designLink" to downloadUrl)))
        return "Preview image updated."
    }

    suspend fun refreshLiveTracking(workspace: StudioWorkspace, order: StudioOrder, language: String): String {
        val trackingNumber = order.trackingNumber.trim()
        require(trackingNumber.isNotBlank()) { "Add a tracking number first." }
        val result = functions.getHttpsCallable("registerTracking")
            .call(
                mapOf(
                    "companyId" to workspace.id,
                    "orderId" to order.id,
                    "trackingNumber" to trackingNumber,
                    "courier" to order.courier.ifBlank { "Auto Detect" },
                    "language" to language.ifBlank { "English" }
                )
            )
            .await()
        val data = result.data as? Map<*, *> ?: emptyMap<Any, Any>()
        return stringValue(
            data["statusText"],
            stringValue(data["status"], "Tracking request sent.")
        )
    }

    suspend fun renameClientFile(workspace: StudioWorkspace, order: StudioOrder, fileId: String, fileName: String): String {
        val result = functions.getHttpsCallable("renameClientFile")
            .call(
                mapOf(
                    "companyId" to workspace.id,
                    "orderId" to order.id,
                    "fileId" to fileId,
                    "fileName" to cleanClientFileName(fileName)
                )
            )
            .await()
        val data = result.data as? Map<*, *>
        return data?.get("message") as? String ?: "File renamed."
    }

    suspend fun assignInvoiceNumber(workspace: StudioWorkspace, order: StudioOrder): String {
        if (order.invoiceNumber.isNotBlank()) return order.invoiceNumber
        val result = functions.getHttpsCallable("assignInvoiceNumber")
            .call(mapOf("companyId" to workspace.id, "orderId" to order.id))
            .await()
        val data = result.getData() as? Map<*, *>
        return (data?.get("invoiceNumber") as? String).orEmpty()
    }

    suspend fun deleteClientFile(workspace: StudioWorkspace, order: StudioOrder, fileId: String): String {
        val result = functions.getHttpsCallable("deleteClientFile")
            .call(
                mapOf(
                    "companyId" to workspace.id,
                    "orderId" to order.id,
                    "fileId" to fileId
                )
            )
            .await()
        val data = result.data as? Map<*, *>
        return data?.get("message") as? String ?: "File deleted."
    }

    suspend fun createOrder(workspace: StudioWorkspace): String {
        val result = functions.getHttpsCallable("createWebOrder")
            .call(
                mapOf(
                    "companyId" to workspace.id,
                    "customerName" to "New Project",
                    "designName" to "",
                    "orderValue" to 0,
                    "paidAmount" to 0,
                    "watchRef" to "",
                    "notes" to ""
                )
            )
            .await()
        val data = result.data as? Map<*, *> ?: return ""
        return data["orderId"] as? String ?: ""
    }

    suspend fun loadPersonalInterfaceSettings(workspace: StudioWorkspace): Map<String, Any?> {
        val result = functions.getHttpsCallable("getPersonalInterfaceSettings")
            .call(mapOf("companyId" to workspace.id))
            .await()
        val payload = result.data as? Map<*, *> ?: return emptyMap()
        val values = payload["settings"] as? Map<*, *> ?: return emptyMap()
        return listOf(
            "appTheme", "selectedLanguage",
            "pdfShowCustomer", "pdfShowContact", "pdfShowPreview",
            "pdfShowMaterials", "pdfShowPriority", "pdfShowStatus", "pdfShowShipping", "pdfShowAddress", "pdfShowShippingAddress"
        ).mapNotNull { key ->
            values[key]?.let { key to it }
        }.toMap()
    }

    suspend fun updateWorkspaceSettings(workspace: StudioWorkspace, updates: Map<String, Any?>) {
        // The "AI Replies" menu toggle lives on the companies doc (read by the nav).
        if (updates.containsKey("quickReplyMenuEnabled")) {
            db.collection("companies").document(workspace.id)
                .set(mapOf("quickReplyMenuEnabled" to (updates["quickReplyMenuEnabled"] as? Boolean ?: true)), com.google.firebase.firestore.SetOptions.merge())
                .await()
            return
        }
        val contributionText = updates["quickReplyContributionText"]?.toString()?.trim().orEmpty()
        if (contributionText.isNotBlank()) {
            functions.getHttpsCallable("saveQuickReplyContribution")
                .call(mapOf("companyId" to workspace.id, "text" to contributionText))
                .await()
            return
        }
        val ownerOnlyQuickReplyKeys = setOf("openAIKey", "aiKnowledgeBase")
        if (updates.keys.any { it in ownerOnlyQuickReplyKeys }) {
            functions.getHttpsCallable("saveQuickReplySettings")
                .call(mapOf("companyId" to workspace.id, "settings" to updates))
                .await()
            return
        }
        val personalQuickReplyKeys = setOf("replyMode", "quickReplyPoliteness", "quickReplyLength", "onDeviceKnowledgeBase", "customProductsJSON", "customRulesJSON")
        if (updates.keys.any { it in personalQuickReplyKeys }) {
            functions.getHttpsCallable("saveQuickReplyPersonalSettings")
                .call(mapOf("companyId" to workspace.id, "settings" to updates))
                .await()
            return
        }
        val personalInterfaceKeys = setOf("personalAppTheme", "personalSelectedLanguage", "personalPdfShowCustomer", "personalPdfShowContact", "personalPdfShowPreview", "personalPdfShowMaterials", "personalPdfShowPriority", "personalPdfShowStatus", "personalPdfShowShipping", "personalPdfShowAddress", "personalPdfShowShippingAddress")
        if (updates.keys.any { it in personalInterfaceKeys }) {
            val mapped = updates.mapKeys { (key, _) -> when (key) {
                "personalAppTheme" -> "appTheme"; "personalSelectedLanguage" -> "selectedLanguage"
                "personalPdfShowCustomer" -> "pdfShowCustomer"; "personalPdfShowContact" -> "pdfShowContact"; "personalPdfShowPreview" -> "pdfShowPreview"
                "personalPdfShowMaterials" -> "pdfShowMaterials"; "personalPdfShowPriority" -> "pdfShowPriority"; "personalPdfShowStatus" -> "pdfShowStatus"; "personalPdfShowShipping" -> "pdfShowShipping"; "personalPdfShowAddress" -> "pdfShowAddress"; "personalPdfShowShippingAddress" -> "pdfShowShippingAddress"
                else -> key
            } }
            functions.getHttpsCallable("savePersonalInterfaceSettings").call(mapOf("companyId" to workspace.id, "settings" to mapped)).await()
            return
        }
        val cleanUpdates = updates.toMutableMap()
        cleanUpdates["settingsUpdatedAt"] = FieldValue.serverTimestamp()
        db.collection("companySettings").document(workspace.id)
            .set(cleanUpdates, com.google.firebase.firestore.SetOptions.merge())
            .await()
    }

    suspend fun updateWorkspaceBillingPlan(_workspace: StudioWorkspace, _plan: StudioBillingPlan): String {
        error("Manual plan switching is disabled. Plans are managed through secure billing.")
    }

    suspend fun recalculateFinancialSettings(workspace: StudioWorkspace): String {
        val result = functions.getHttpsCallable("recalculateFinancialSettingsForOrders")
            .call(mapOf("companyId" to workspace.id))
            .await()
        val data = result.data as? Map<*, *>
        return data?.get("message") as? String ?: "Existing projects recalculated."
    }

    suspend fun updateAccountProfile(workspace: StudioWorkspace, user: FirebaseUser, displayName: String, companyName: String) {
        val cleanDisplayName = displayName.trim()
        val cleanCompanyName = companyName.trim().ifEmpty { "My Studio" }
        val batch = db.batch()
        val userRef = db.collection("users").document(user.uid)
        batch.set(
            userRef,
            mapOf(
                "uid" to user.uid,
                "email" to user.email.orEmpty(),
                "displayName" to cleanDisplayName,
                "activeCompanyId" to workspace.id,
                "updatedAt" to FieldValue.serverTimestamp()
            ),
            com.google.firebase.firestore.SetOptions.merge()
        )

        val companyPayload = mutableMapOf<String, Any>(
            "updatedAt" to FieldValue.serverTimestamp(),
            "members.${user.uid}.uid" to user.uid,
            "members.${user.uid}.email" to user.email.orEmpty(),
            "members.${user.uid}.displayName" to cleanDisplayName,
            "members.${user.uid}.updatedAt" to FieldValue.serverTimestamp()
        )
        if (workspace.isOwner) {
            companyPayload["companyId"] = workspace.id
            companyPayload["ownerUid"] = workspace.ownerUid.ifBlank { workspace.id }
            companyPayload["ownerEmail"] = user.email.orEmpty()
            companyPayload["ownerDisplayName"] = cleanDisplayName
            companyPayload["name"] = cleanCompanyName
            companyPayload["companyName"] = cleanCompanyName
            companyPayload["members.${user.uid}.role"] = "owner"
            companyPayload["memberUids"] = FieldValue.arrayUnion(user.uid)
        }
        batch.set(
            db.collection("companies").document(workspace.id),
            companyPayload,
            com.google.firebase.firestore.SetOptions.merge()
        )
        batch.commit().await()
    }

    suspend fun uploadAccountAvatar(workspace: StudioWorkspace, user: FirebaseUser, bytes: ByteArray, contentType: String): String {
        requireImageBytes(bytes, 10, "Choose an avatar image under 10 MB.")
        val cleanType = cleanImageContentType(contentType)
        val extension = extensionForImageContentType(cleanType)
        val uploadedAt = java.time.Instant.now().toString()
        val ref = storage.reference.child("companies/${workspace.id}/design_images/android_account_avatar_${user.uid}_${System.currentTimeMillis()}.$extension")
        val metadata = StorageMetadata.Builder()
            .setContentType(cleanType)
            .setCustomMetadata("companyId", workspace.id)
            .setCustomMetadata("uploadedByUid", user.uid)
            .setCustomMetadata("uploadedByEmail", user.email.orEmpty().ifBlank { "unknown" })
            .setCustomMetadata("source", "account_avatar")
            .setCustomMetadata("orderId", "")
            .setCustomMetadata("uploadedAt", uploadedAt)
            .setCustomMetadata("fileType", cleanType)
            .setCustomMetadata("fileSize", bytes.size.toString())
            .build()
        ref.putBytes(bytes, metadata).await()
        val url = ref.downloadUrl.await().toString()
        return saveAccountAvatar(workspace, url)
    }

    suspend fun saveAccountAvatar(workspace: StudioWorkspace, photoUrl: String): String {
        val result = functions.getHttpsCallable("saveAccountAvatar")
            .call(mapOf("companyId" to workspace.id, "photoURL" to photoUrl.trim()))
            .await()
        val data = result.data as? Map<*, *>
        return data?.get("message") as? String ?: if (photoUrl.isBlank()) "Avatar removed." else "Avatar updated."
    }

    suspend fun uploadWorkspaceLogo(
        workspace: StudioWorkspace,
        user: FirebaseUser,
        bytes: ByteArray,
        contentType: String,
        policyAccepted: Boolean,
        maxSizeMb: Int
    ): String {
        val maxMb = maxSizeMb.coerceIn(1, 50)
        requireImageBytes(bytes, maxMb, "Choose a workspace logo image under $maxMb MB.")
        validateWorkspacePlanAction(workspace, "upload_workspace_logo", bytes.size)
        val cleanType = cleanImageContentType(contentType)
        val extension = extensionForImageContentType(cleanType)
        val uploadedAt = java.time.Instant.now().toString()
        val ref = storage.reference.child("companies/${workspace.id}/design_images/android_workspace_logo_${System.currentTimeMillis()}.$extension")
        val metadata = StorageMetadata.Builder()
            .setContentType(cleanType)
            .setCustomMetadata("companyId", workspace.id)
            .setCustomMetadata("uploadedByUid", user.uid)
            .setCustomMetadata("uploadedByEmail", user.email.orEmpty().ifBlank { "unknown" })
            .setCustomMetadata("uploadedBy", user.email.orEmpty().ifBlank { user.displayName.orEmpty().ifBlank { user.uid } })
            .setCustomMetadata("source", "app_logo")
            .setCustomMetadata("orderId", "")
            .setCustomMetadata("uploadedAt", uploadedAt)
            .setCustomMetadata("fileType", cleanType)
            .setCustomMetadata("fileSize", bytes.size.toString())
            .setCustomMetadata("policyAccepted", if (policyAccepted) "true" else "false")
            .setCustomMetadata("maxSizeMB", maxMb.toString())
            .build()
        ref.putBytes(bytes, metadata).await()
        val url = ref.downloadUrl.await().toString()
        return saveWorkspaceLogo(workspace, url)
    }

    suspend fun saveWorkspaceLogo(workspace: StudioWorkspace, appLogoUrl: String): String {
        val result = functions.getHttpsCallable("saveWorkspaceLogo")
            .call(mapOf("companyId" to workspace.id, "appLogoUrl" to appLogoUrl.trim()))
            .await()
        val data = result.data as? Map<*, *>
        return data?.get("message") as? String ?: if (appLogoUrl.isBlank()) "Workspace logo removed." else "Workspace logo saved."
    }

    suspend fun changeAccountEmail(workspace: StudioWorkspace, email: String): String {
        val result = functions.getHttpsCallable("changeAccountEmail")
            .call(mapOf("companyId" to workspace.id, "email" to email.trim().lowercase()))
            .await()
        val data = result.data as? Map<*, *>
        // Send a verification email to the new address so the user confirms ownership
        // and clears the unverified flag set by the email change (best-effort).
        runCatching {
            auth.currentUser?.reload()?.await()
            val user = auth.currentUser
            if (user != null && !user.isEmailVerified) {
                val settings = com.google.firebase.auth.ActionCodeSettings.newBuilder()
                    .setUrl("https://nivadesk.app/login")
                    .build()
                user.sendEmailVerification(settings).await()
            }
        }
        return data?.get("message") as? String ?: "Email updated. Check your new inbox to verify it. You can change it again after 10 days."
    }

    suspend fun sendPasswordResetEmail(email: String) {
        auth.sendPasswordResetEmail(email.trim()).await()
    }

    suspend fun requestWorkspaceAccess(ownerIdentifier: String): String {
        val result = functions.getHttpsCallable("requestWorkspaceAccess")
            .call(mapOf("ownerIdentifier" to ownerIdentifier.trim(), "source" to "android"))
            .await()
        val data = result.data as? Map<*, *>
        return data?.get("message") as? String ?: "Access request sent."
    }

    suspend fun approveJoinRequest(workspace: StudioWorkspace, request: StudioJoinRequest, role: String): String {
        val result = functions.getHttpsCallable("approveWorkspaceJoinRequest")
            .call(mapOf("companyId" to workspace.id, "requestId" to request.id, "role" to normalizeRoleForTeamAccess(role)))
            .await()
        val data = result.data as? Map<*, *>
        return data?.get("message") as? String ?: "Access request approved."
    }

    suspend fun declineJoinRequest(workspace: StudioWorkspace, request: StudioJoinRequest): String {
        val result = functions.getHttpsCallable("declineWorkspaceJoinRequest")
            .call(mapOf("companyId" to workspace.id, "requestId" to request.id))
            .await()
        val data = result.data as? Map<*, *>
        return data?.get("message") as? String ?: "Access request declined."
    }

    suspend fun updateTeamMemberRole(workspace: StudioWorkspace, member: StudioTeamMember, role: String): String {
        val result = functions.getHttpsCallable("updateWorkspaceMemberRole")
            .call(mapOf("companyId" to workspace.id, "memberUid" to member.id, "role" to normalizeRoleForTeamAccess(role)))
            .await()
        val data = result.data as? Map<*, *>
        return data?.get("message") as? String ?: "Team role updated."
    }

    suspend fun updateTeamMemberAccess(workspace: StudioWorkspace, member: StudioTeamMember, access: WorkspaceMemberAccess): String {
        val result = functions.getHttpsCallable("updateWorkspaceMemberAccess")
            .call(mapOf("companyId" to workspace.id, "memberUid" to member.id, "access" to accessToMap(access)))
            .await()
        val data = result.data as? Map<*, *>
        return data?.get("message") as? String ?: "Team member access updated."
    }

    suspend fun removeTeamMember(workspace: StudioWorkspace, member: StudioTeamMember): String {
        val result = functions.getHttpsCallable("removeWorkspaceTeamMember")
            .call(mapOf("companyId" to workspace.id, "memberUid" to member.id))
            .await()
        val data = result.data as? Map<*, *>
        return data?.get("message") as? String ?: "Team member removed."
    }

    suspend fun saveCustomRole(workspace: StudioWorkspace, roleId: String, name: String, baseRole: String, access: WorkspaceMemberAccess): String {
        val result = functions.getHttpsCallable("saveWorkspaceCustomRole")
            .call(
                mapOf(
                    "companyId" to workspace.id,
                    "roleId" to roleId,
                    "name" to name.trim(),
                    "baseRole" to normalizeRole(baseRole),
                    "access" to accessToMap(access)
                )
            )
            .await()
        val data = result.data as? Map<*, *>
        return data?.get("message") as? String ?: "Custom role saved."
    }

    suspend fun deleteCustomRole(workspace: StudioWorkspace, role: StudioCustomRole): String {
        val result = functions.getHttpsCallable("deleteWorkspaceCustomRole")
            .call(mapOf("companyId" to workspace.id, "roleId" to role.id))
            .await()
        val data = result.data as? Map<*, *>
        return data?.get("message") as? String ?: "Custom role deleted."
    }

    // This used to write straight to Firestore from the phone, which skipped
    // every guard the server applies: the 500-record cap, the plan's order and
    // customer limits, and the field allowlist that sanitises what a backup may
    // set. It also wrote the settings envelope raw, so importing a Mac or web
    // backup on Android planted three literal maps named strings/bools/doubles
    // instead of applying any setting. The callable does all of that correctly
    // and is the same one web and iOS already use.
    suspend fun importBackup(workspace: StudioWorkspace, rawJson: String, skipDuplicates: Boolean = false): ImportBackupResult {
        val root = JSONObject(rawJson)
        val result = functions.getHttpsCallable("importWorkspaceBackup")
            .call(mapOf("companyId" to workspace.id, "backup" to jsonObjectToMap(root), "skipDuplicates" to skipDuplicates))
            .await()
        val data = result.data as? Map<*, *>
        fun count(key: String): Int = (data?.get(key) as? Number)?.toInt() ?: 0
        return ImportBackupResult(
            importedOrders = count("importedOrders"),
            importedCustomers = count("importedCustomers"),
            skippedDuplicateOrders = count("skippedDuplicateOrders"),
            skippedDuplicateCustomers = count("skippedDuplicateCustomers"),
            droppedOrders = count("droppedOrders"),
            droppedCustomers = count("droppedCustomers"),
            message = (data?.get("message") as? String).orEmpty()
        )
    }

    // Same callable, dryRun=true: same parse, same duplicate keys, no writes.
    // Web has had this preview since the QA round; the phone imported blind.
    suspend fun previewImportBackup(workspace: StudioWorkspace, rawJson: String): ImportBackupPreview {
        val root = JSONObject(rawJson)
        val result = functions.getHttpsCallable("importWorkspaceBackup")
            .call(mapOf("companyId" to workspace.id, "backup" to jsonObjectToMap(root), "dryRun" to true))
            .await()
        val data = result.data as? Map<*, *>
        fun count(key: String): Int = (data?.get(key) as? Number)?.toInt() ?: 0
        return ImportBackupPreview(
            fileOrders = count("fileOrders"),
            fileCustomers = count("fileCustomers"),
            existingOrders = count("existingOrders"),
            likelyDuplicateOrders = count("likelyDuplicateOrders"),
            likelyDuplicateCustomers = count("likelyDuplicateCustomers"),
            droppedOrders = count("droppedOrders"),
            droppedCustomers = count("droppedCustomers"),
            truncated = (data?.get("truncated") as? Boolean) == true
        )
    }

    suspend fun deleteWorkspaceData(workspace: StudioWorkspace): Int {
        var deleted = 0
        for (collection in listOf("siparisler", "musteriler")) {
            val snapshot = db.collection(collection).whereEqualTo("companyId", workspace.id).get().await()
            var batch = db.batch()
            var batchSize = 0
            snapshot.documents.forEach { document ->
                batch.delete(document.reference)
                deleted += 1
                batchSize += 1
                if (batchSize >= 400) {
                    batch.commit().await()
                    batch = db.batch()
                    batchSize = 0
                }
            }
            if (batchSize > 0) {
                batch.commit().await()
            }
        }
        return deleted
    }


    suspend fun createSupportTicket(
        workspace: StudioWorkspace,
        category: String,
        priority: String,
        title: String,
        message: String
    ): String {
        val result = functions.getHttpsCallable("createSupportTicket")
            .call(
                supportTicketPayload(
                    workspace = workspace,
                    category = category,
                    priority = priority,
                    title = title,
                    message = message
                )
            )
            .await()
        val data = result.data as? Map<*, *> ?: emptyMap<Any, Any>()
        return stringValue(data["message"], "Ticket sent.")
    }

    suspend fun createWorkspaceTicket(
        workspace: StudioWorkspace,
        category: String,
        priority: String,
        title: String,
        message: String
    ): String {
        val result = functions.getHttpsCallable("createWorkspaceTicket")
            .call(
                supportTicketPayload(
                    workspace = workspace,
                    category = category,
                    priority = priority,
                    title = title,
                    message = message
                )
            )
            .await()
        val data = result.data as? Map<*, *> ?: emptyMap<Any, Any>()
        return stringValue(data["message"], "Workspace ticket sent.")
    }

    suspend fun listSupportTickets(workspace: StudioWorkspace): StudioSupportTicketListResult {
        val result = functions.getHttpsCallable("listMySupportTickets")
            .call(mapOf("companyId" to workspace.id))
            .await()
        val data = result.data as? Map<*, *> ?: emptyMap<Any, Any>()
        return StudioSupportTicketListResult(
            tickets = supportTicketList(data["tickets"], "appSupport"),
            canManage = data["isSupportAdmin"] as? Boolean ?: false
        )
    }

    suspend fun listWorkspaceTickets(workspace: StudioWorkspace): StudioSupportTicketListResult {
        val result = functions.getHttpsCallable("listWorkspaceTickets")
            .call(mapOf("companyId" to workspace.id))
            .await()
        val data = result.data as? Map<*, *> ?: emptyMap<Any, Any>()
        return StudioSupportTicketListResult(
            tickets = supportTicketList(data["tickets"], "workspace"),
            canManage = data["canSeeWorkspaceQueue"] as? Boolean ?: false
        )
    }

    suspend fun updateSupportTicketStatus(workspace: StudioWorkspace, ticketId: String, status: String): String {
        val result = functions.getHttpsCallable("updateSupportTicketStatus")
            .call(
                mapOf(
                    "companyId" to workspace.id,
                    "ticketId" to ticketId,
                    "status" to status
                )
            )
            .await()
        val data = result.data as? Map<*, *> ?: emptyMap<Any, Any>()
        return stringValue(data["message"], "Ticket status updated.")
    }

    suspend fun updateWorkspaceTicketStatus(workspace: StudioWorkspace, ticketId: String, status: String): String {
        val result = functions.getHttpsCallable("updateWorkspaceTicketStatus")
            .call(
                mapOf(
                    "companyId" to workspace.id,
                    "ticketId" to ticketId,
                    "status" to status
                )
            )
            .await()
        val data = result.data as? Map<*, *> ?: emptyMap<Any, Any>()
        return stringValue(data["message"], "Workspace ticket status updated.")
    }

    suspend fun listSupportTicketMessages(workspace: StudioWorkspace, ticketId: String): List<StudioSupportTicketMessage> {
        val result = functions.getHttpsCallable("listSupportTicketMessages")
            .call(
                mapOf(
                    "companyId" to workspace.id,
                    "ticketId" to ticketId
                )
            )
            .await()
        val data = result.data as? Map<*, *> ?: emptyMap<Any, Any>()
        return supportTicketMessageList(data["messages"])
    }

    suspend fun listWorkspaceTicketMessages(workspace: StudioWorkspace, ticketId: String): List<StudioSupportTicketMessage> {
        val result = functions.getHttpsCallable("listWorkspaceTicketMessages")
            .call(
                mapOf(
                    "companyId" to workspace.id,
                    "ticketId" to ticketId
                )
            )
            .await()
        val data = result.data as? Map<*, *> ?: emptyMap<Any, Any>()
        return supportTicketMessageList(data["messages"])
    }

    suspend fun addSupportTicketReply(workspace: StudioWorkspace, ticketId: String, message: String): String {
        val result = functions.getHttpsCallable("addSupportTicketReply")
            .call(
                mapOf(
                    "companyId" to workspace.id,
                    "ticketId" to ticketId,
                    "message" to message.trim()
                )
            )
            .await()
        val data = result.data as? Map<*, *> ?: emptyMap<Any, Any>()
        return stringValue(data["message"], "Reply sent.")
    }

    suspend fun addWorkspaceTicketReply(workspace: StudioWorkspace, ticketId: String, message: String): String {
        val result = functions.getHttpsCallable("addWorkspaceTicketReply")
            .call(
                mapOf(
                    "companyId" to workspace.id,
                    "ticketId" to ticketId,
                    "message" to message.trim()
                )
            )
            .await()
        val data = result.data as? Map<*, *> ?: emptyMap<Any, Any>()
        return stringValue(data["message"], "Reply sent.")
    }

    suspend fun markSupportTicketRead(workspace: StudioWorkspace, ticketId: String) {
        functions.getHttpsCallable("markSupportTicketRead")
            .call(
                mapOf(
                    "companyId" to workspace.id,
                    "ticketId" to ticketId
                )
            )
            .await()
    }

    suspend fun markWorkspaceTicketRead(workspace: StudioWorkspace, ticketId: String) {
        functions.getHttpsCallable("markWorkspaceTicketRead")
            .call(
                mapOf(
                    "companyId" to workspace.id,
                    "ticketId" to ticketId
                )
            )
            .await()
    }

    suspend fun appAssistantAvailable(companyId: String): Boolean {
        val result = functions.getHttpsCallable("getAppAssistantAvailability")
            .call(mapOf("companyId" to companyId))
            .await()
        val data = result.data as? Map<*, *> ?: return false
        return data["available"] as? Boolean ?: false
    }

    suspend fun askAppAssistant(companyId: String, question: String, language: String): AppAssistantAnswer {
        val result = functions.getHttpsCallable("askAppAssistant")
            .call(mapOf("companyId" to companyId, "question" to question, "language" to language))
            .await()
        val data = result.data as? Map<*, *> ?: emptyMap<Any, Any>()
        val sources = (data["sources"] as? List<*>).orEmpty().mapNotNull {
            (it as? Map<*, *>)?.get("path") as? String
        }
        return AppAssistantAnswer(
            answer = data["answer"] as? String ?: "",
            needsChatGPT = data["needsChatGPT"] as? Boolean ?: false,
            needsSupport = data["needsSupport"] as? Boolean ?: false,
            sources = sources
        )
    }

    suspend fun getSupportTicketUnreadSummary(workspace: StudioWorkspace): SupportTicketUnreadSummary {
        val result = functions.getHttpsCallable("getSupportTicketUnreadSummary")
            .call(mapOf("companyId" to workspace.id))
            .await()
        val data = result.data as? Map<*, *> ?: emptyMap<Any, Any>()
        val supportIds = stringSetValue(
            data["unreadSupportTicketIds"] ?: data["supportUnreadTicketIds"] ?: data["supportTicketIds"]
        )
        val workspaceIds = stringSetValue(
            data["unreadWorkspaceTicketIds"] ?: data["workspaceUnreadTicketIds"] ?: data["workspaceTicketIds"]
        )
        val supportUnread = intValue(data["supportUnread"] ?: data["supportUnreadCount"], supportIds.size)
        val workspaceUnread = intValue(data["workspaceUnread"] ?: data["workspaceUnreadCount"], workspaceIds.size)
        val totalUnread = intValue(data["totalUnread"] ?: data["unreadCount"], supportUnread + workspaceUnread)
        return SupportTicketUnreadSummary(
            totalUnread = totalUnread,
            supportUnread = supportUnread,
            workspaceUnread = workspaceUnread,
            unreadSupportTicketIds = supportIds,
            unreadWorkspaceTicketIds = workspaceIds,
            isSupportAdmin = data["isSupportAdmin"] as? Boolean ?: false
        )
    }

    private fun supportTicketPayload(
        workspace: StudioWorkspace,
        category: String,
        priority: String,
        title: String,
        message: String
    ): Map<String, Any?> {
        return mapOf(
            "companyId" to workspace.id,
            "companyName" to workspace.name,
            "category" to category,
            "priority" to priority,
            "title" to title.trim(),
            "message" to message.trim(),
            "platform" to "android",
            "appVersion" to "Android",
            "deviceInfo" to androidDeviceInfo(),
            "language" to Locale.getDefault().displayLanguage.ifBlank { "English" }
        )
    }

    private fun androidDeviceInfo(): String {
        val manufacturer = Build.MANUFACTURER.orEmpty().replaceFirstChar { it.uppercaseChar() }
        val model = Build.MODEL.orEmpty()
        val version = Build.VERSION.RELEASE.orEmpty()
        return listOf(manufacturer, model, "Android $version").filter { it.isNotBlank() }.joinToString(" ")
    }

    private fun supportTicketList(value: Any?, fallbackType: String): List<StudioSupportTicket> {
        val items = value as? List<*> ?: return emptyList()
        return items.mapNotNull { item ->
            val data = item as? Map<*, *> ?: return@mapNotNull null
            StudioSupportTicket(
                id = stringValue(data["id"], ""),
                ticketType = stringValue(data["ticketType"], fallbackType),
                companyId = stringValue(data["companyId"], ""),
                companyName = stringValue(data["companyName"], ""),
                createdByUid = stringValue(data["createdByUid"], ""),
                createdByEmail = stringValue(data["createdByEmail"], ""),
                createdByName = stringValue(data["createdByName"], ""),
                title = stringValue(data["title"], "Ticket"),
                message = stringValue(data["message"], ""),
                category = stringValue(data["category"], "other"),
                priority = stringValue(data["priority"], "normal"),
                status = stringValue(data["status"], "open"),
                platform = stringValue(data["platform"], "android"),
                appVersion = stringValue(data["appVersion"], ""),
                deviceInfo = stringValue(data["deviceInfo"], ""),
                language = stringValue(data["language"], "English"),
                createdAt = dateFromAny(data["createdAtMillis"]),
                updatedAt = dateFromAny(data["updatedAtMillis"]),
                lastMessageAt = dateFromAny(data["lastMessageAtMillis"]),
                visitorEmail = stringValue(data["visitorEmail"], ""),
                visitorPage = stringValue(data["visitorPage"], ""),
                needsHuman = boolValue(data["needsHuman"], false),
                accountUid = stringValue(data["accountUid"], ""),
                accountEmail = stringValue(data["accountEmail"], ""),
                accountName = stringValue(data["accountName"], ""),
                accountCompanyName = stringValue(data["accountCompanyName"], ""),
                accountPlan = stringValue(data["accountPlan"], "")
            )
        }.sortedByDescending { it.lastMessageAt?.time ?: it.createdAt?.time ?: 0L }
    }

    private fun supportTicketMessageList(value: Any?): List<StudioSupportTicketMessage> {
        val items = value as? List<*> ?: return emptyList()
        return items.mapNotNull { item ->
            val data = item as? Map<*, *> ?: return@mapNotNull null
            StudioSupportTicketMessage(
                id = stringValue(data["id"], ""),
                message = stringValue(data["message"], ""),
                createdByUid = stringValue(data["createdByUid"] ?: data["authorUid"], ""),
                createdByEmail = stringValue(data["createdByEmail"] ?: data["authorEmail"], ""),
                createdByName = stringValue(data["createdByName"] ?: data["authorName"], ""),
                senderRole = stringValue(data["senderRole"] ?: data["authorRole"], "user"),
                createdAt = dateFromAny(data["createdAtMillis"])
            )
        }.sortedBy { it.createdAt?.time ?: 0L }
    }

    private suspend fun validateWorkspacePlanAction(workspace: StudioWorkspace, action: String, fileSizeBytes: Int) {
        val result = functions.getHttpsCallable("validateWorkspacePlanAction")
            .call(mapOf("companyId" to workspace.id, "action" to action, "fileSizeBytes" to fileSizeBytes))
            .await()
        val data = result.data as? Map<*, *> ?: emptyMap<Any, Any>()
        if (data["allowed"] != true) {
            val message = when (data["reason"] as? String) {
                "feature_not_in_plan" -> if (action == "upload_client_file") {
                    "Client Files upload is available on Pro Monthly and Team Monthly plans."
                } else {
                    "Workspace logo upload is available on Monthly Pro and Team plans."
                }
                "storage_limit_reached" -> "Storage limit reached for this workspace plan."
                else -> "This workspace plan does not allow that action."
            }
            error(message)
        }
    }

    private fun orderIsAssignedToUser(order: StudioOrder, user: FirebaseUser): Boolean {
        val email = user.email.orEmpty().trim().lowercase()
        return order.assignedToUid == user.uid ||
            (email.isNotEmpty() && order.assignedToEmail.trim().lowercase() == email)
    }

    private fun memberRoleValue(
        data: Map<String, Any>,
        uid: String,
        customRoles: List<StudioCustomRole>
    ): String {
        val members = data["members"] as? Map<*, *> ?: emptyMap<Any, Any>()
        val member = members[uid] as? Map<*, *>
        val memberCustomRoles = data["memberCustomRoles"] as? Map<*, *> ?: emptyMap<Any, Any>()
        val rawCustomRole = stringValue(member?.get("customRoleId"), stringValue(memberCustomRoles[uid], ""))
        if (customRoles.any { it.id == rawCustomRole }) return rawCustomRole

        val memberRoles = data["memberRoles"] as? Map<*, *> ?: emptyMap<Any, Any>()
        return normalizeRoleForTeamAccess(stringValue(member?.get("role"), stringValue(memberRoles[uid], "member")))
    }

    private fun effectiveMemberRole(rawRole: String, customRoles: List<StudioCustomRole>): String {
        return customRoles.firstOrNull { it.id == rawRole }?.baseRole ?: normalizeRole(rawRole)
    }

    fun messageThreadsFlow(workspace: StudioWorkspace, currentUid: String): Flow<List<StudioMessageThread>> = callbackFlow {
        val uid = currentUid.trim()
        if (workspace.id.isBlank() || uid.isBlank()) {
            trySend(emptyList())
            awaitClose {}
            return@callbackFlow
        }
        var registration: com.google.firebase.firestore.ListenerRegistration? = null
        fun startRealtimeListener() {
            if (registration != null) return
            registration = db.collection("companies").document(workspace.id).collection("messageThreads")
                .whereArrayContains("memberUids", uid)
                .addSnapshotListener { snapshot, error ->
                    if (error != null) { close(error); return@addSnapshotListener }
                    val threads = snapshot?.documents
                        ?.map { document -> messageThreadFromDocument(document.id, document.data.orEmpty(), workspace.id, uid) }
                        ?.filter { it.id == "team" || it.memberUids.contains(uid) } ?: emptyList()
                    trySend(sortedMessageThreadsForDisplay(threads))
                }
        }
        functions.getHttpsCallable("listMessageThreads").call(mapOf("companyId" to workspace.id))
            .addOnSuccessListener { result ->
                val data = result.data as? Map<*, *>
                val initial = (data?.get("threads") as? List<*>)?.mapNotNull { item ->
                    val raw = item as? Map<*, *> ?: return@mapNotNull null
                    val values = raw.entries.associate { entry -> entry.key.toString() to entry.value }
                    val id = stringValue(values["id"], "")
                    if (id.isBlank()) return@mapNotNull null
                    messageThreadFromDocument(id, values, workspace.id, uid)
                }?.filter { it.id == "team" || it.memberUids.contains(uid) } ?: emptyList()
                trySend(sortedMessageThreadsForDisplay(initial))
                startRealtimeListener()
            }.addOnFailureListener { error -> close(error) }
        awaitClose { registration?.remove() }
    }

    fun messageItemsFlow(workspaceId: String, threadId: String, currentUid: String): Flow<List<StudioMessageItem>> = callbackFlow {
        if (workspaceId.isBlank() || threadId.isBlank()) {
            trySend(emptyList())
            awaitClose {}
            return@callbackFlow
        }
        val uid = currentUid.trim()
        val registration = db.collection("companies")
            .document(workspaceId)
            .collection("messageThreads")
            .document(threadId)
            .collection("messages")
            .orderBy("createdAt")
            .limit(300)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                val items = snapshot?.documents
                    ?.mapNotNull { document -> messageItemFromDocument(document.id, document.data.orEmpty(), threadId, uid) }
                    ?: emptyList()
                trySend(items)
            }
        awaitClose { registration.remove() }
    }

    suspend fun loadMessageTeamMembers(workspace: StudioWorkspace): List<StudioMessageTeamMember> {
        if (workspace.id.isBlank()) return emptyList()
        val result = functions.getHttpsCallable("listMessageThreads")
            .call(mapOf("companyId" to workspace.id))
            .await()
        val data = result.data as? Map<*, *> ?: return emptyList()
        val members = data["teamMembers"] as? List<*> ?: return emptyList()
        return members.mapNotNull { item ->
            val raw = item as? Map<*, *> ?: return@mapNotNull null
            val uid = stringValue(raw["uid"] ?: raw["id"], "")
            if (uid.isBlank()) return@mapNotNull null
            StudioMessageTeamMember(
                id = uid,
                email = stringValue(raw["email"], ""),
                name = stringValue(raw["name"] ?: raw["displayName"], stringValue(raw["email"], "")),
                photoURL = stringValue(raw["photoURL"], "")
            )
        }
    }

    suspend fun sendThreadMessage(
        workspace: StudioWorkspace,
        user: FirebaseUser,
        threadId: String,
        text: String,
        replyToMessageId: String = "",
        mentionedUids: List<String> = emptyList(),
        fileURL: String = "",
        fileName: String = "",
        fileType: String = "",
        fileSize: Long = 0L
    ) {
        if (workspace.id.isBlank() || threadId.isBlank()) error("Conversation is not ready.")
        val cleanText = text.trim()
        val cleanFileUrl = fileURL.trim()
        if (cleanText.isEmpty() && cleanFileUrl.isEmpty()) error("Please write a message or attach a file.")
        val payload = mutableMapOf<String, Any>(
            "companyId" to workspace.id,
            "threadId" to threadId,
            "text" to cleanText,
            "userName" to user.displayName.orEmpty().trim(),
            "userPhotoURL" to (user.photoUrl?.toString().orEmpty()).trim()
        )
        if (cleanFileUrl.isNotEmpty()) {
            payload["fileURL"] = cleanFileUrl
            payload["fileName"] = fileName.trim()
            payload["fileType"] = fileType.trim()
            payload["fileSize"] = fileSize
        }
        val cleanReplyId = replyToMessageId.trim()
        if (cleanReplyId.isNotEmpty()) payload["replyToMessageId"] = cleanReplyId
        val cleanMentions = mentionedUids.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
        if (cleanMentions.isNotEmpty()) payload["mentionedUids"] = cleanMentions
        functions.getHttpsCallable("sendThreadMessage").call(payload).await()
    }

    suspend fun editThreadMessage(
        workspace: StudioWorkspace,
        threadId: String,
        messageId: String,
        text: String
    ) {
        if (workspace.id.isBlank() || threadId.isBlank() || messageId.isBlank()) error("Message is not ready.")
        functions.getHttpsCallable("editThreadMessage")
            .call(
                mapOf(
                    "companyId" to workspace.id,
                    "threadId" to threadId,
                    "messageId" to messageId,
                    "text" to text.trim()
                )
            )
            .await()
    }

    suspend fun deleteMessageForMe(workspace: StudioWorkspace, threadId: String, messageId: String) {
        if (workspace.id.isBlank() || threadId.isBlank() || messageId.isBlank()) return
        functions.getHttpsCallable("deleteMessageForMe")
            .call(mapOf("companyId" to workspace.id, "threadId" to threadId, "messageId" to messageId))
            .await()
    }

    suspend fun deleteMessageForEveryone(workspace: StudioWorkspace, threadId: String, messageId: String) {
        if (workspace.id.isBlank() || threadId.isBlank() || messageId.isBlank()) return
        functions.getHttpsCallable("deleteMessageForEveryone")
            .call(mapOf("companyId" to workspace.id, "threadId" to threadId, "messageId" to messageId))
            .await()
    }

    suspend fun uploadMessageFileAndSend(
        workspace: StudioWorkspace,
        user: FirebaseUser,
        threadId: String,
        bytes: ByteArray,
        fileName: String,
        contentType: String,
        text: String = "",
        replyToMessageId: String = "",
        mentionedUids: List<String> = emptyList()
    ) {
        if (workspace.id.isBlank() || threadId.isBlank()) error("Conversation is not ready.")
        if (bytes.isEmpty()) error("Selected file could not be read.")
        val cleanName = fileName.trim()
            .substringAfterLast("/")
            .substringAfterLast("\\")
            .ifBlank { "Attachment" }
        val cleanType = contentType.trim().ifBlank { "application/octet-stream" }
        val storagePath = "companies/${workspace.id}/message_files/$threadId/${UUID.randomUUID()}_$cleanName"
        val ref = storage.reference.child(storagePath)
        val metadata = StorageMetadata.Builder()
            .setContentType(cleanType)
            .setCustomMetadata("companyId", workspace.id)
            .setCustomMetadata("threadId", threadId)
            .setCustomMetadata("uploadedByUid", user.uid)
            .setCustomMetadata("uploadedByEmail", user.email.orEmpty().ifBlank { "unknown" })
            .setCustomMetadata("originalFileName", cleanName)
            .setCustomMetadata("source", "android_message")
            .build()
        ref.putBytes(bytes, metadata).await()
        val downloadUrl = ref.downloadUrl.await().toString()
        sendThreadMessage(
            workspace = workspace,
            user = user,
            threadId = threadId,
            text = text,
            replyToMessageId = replyToMessageId,
            mentionedUids = mentionedUids,
            fileURL = downloadUrl,
            fileName = cleanName,
            fileType = cleanType,
            fileSize = bytes.size.toLong()
        )
    }

    suspend fun toggleMessageReaction(
        workspace: StudioWorkspace,
        user: FirebaseUser,
        threadId: String,
        messageId: String,
        emoji: String
    ) {
        val cleanEmoji = emoji.trim()
        if (workspace.id.isBlank() || threadId.isBlank() || messageId.isBlank() || cleanEmoji.isBlank()) return
        functions.getHttpsCallable("toggleMessageReaction")
            .call(
                mapOf(
                    "companyId" to workspace.id,
                    "threadId" to threadId,
                    "messageId" to messageId,
                    "emoji" to cleanEmoji,
                    "userName" to user.displayName.orEmpty().trim()
                )
            )
            .await()
    }

    suspend fun pinMessageInThread(workspace: StudioWorkspace, threadId: String, messageId: String) {
        if (workspace.id.isBlank() || threadId.isBlank() || messageId.isBlank()) return
        functions.getHttpsCallable("pinMessageInThread")
            .call(mapOf("companyId" to workspace.id, "threadId" to threadId, "messageId" to messageId))
            .await()
    }

    suspend fun unpinMessageInThread(workspace: StudioWorkspace, threadId: String, messageId: String) {
        if (workspace.id.isBlank() || threadId.isBlank() || messageId.isBlank()) return
        functions.getHttpsCallable("unpinMessageInThread")
            .call(mapOf("companyId" to workspace.id, "threadId" to threadId, "messageId" to messageId))
            .await()
    }

    fun messageTypingUsersFlow(workspaceId: String, threadId: String, currentUid: String): Flow<List<StudioMessageTypingUser>> = callbackFlow {
        if (workspaceId.isBlank() || threadId.isBlank()) {
            trySend(emptyList())
            awaitClose {}
            return@callbackFlow
        }
        val registration = db.collection("companies")
            .document(workspaceId)
            .collection("messageThreads")
            .document(threadId)
            .collection("typing")
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                val now = System.currentTimeMillis()
                val users = snapshot?.documents
                    ?.mapNotNull { doc ->
                        val data = doc.data.orEmpty()
                        val uid = stringValue(data["uid"] ?: doc.id, "")
                        if (uid.isBlank() || uid == currentUid) return@mapNotNull null
                        val isTyping = (data["isTyping"] as? Boolean) ?: true
                        if (!isTyping) return@mapNotNull null
                        val updatedAt = messageDateFromAny(data["updatedAt"]) ?: messageDateFromAny(data["typingUntil"])
                        if (updatedAt != null && now - updatedAt.time > 8_000L) return@mapNotNull null
                        StudioMessageTypingUser(
                            id = uid,
                            name = stringValue(data["name"] ?: data["userName"], stringValue(data["email"], "")),
                            email = stringValue(data["email"], ""),
                            photoURL = stringValue(data["photoURL"] ?: data["userPhotoURL"], ""),
                            updatedAt = updatedAt
                        )
                    }
                    ?: emptyList()
                trySend(users)
            }
        awaitClose { registration.remove() }
    }

    suspend fun createMessageThread(
        workspace: StudioWorkspace,
        type: String,
        memberUid: String = "",
        memberUids: List<String> = emptyList(),
        title: String = ""
    ): String {
        if (workspace.id.isBlank()) return ""
        val payload = mutableMapOf<String, Any>(
            "companyId" to workspace.id,
            "type" to type
        )
        val cleanMemberUid = memberUid.trim()
        if (cleanMemberUid.isNotEmpty()) payload["memberUid"] = cleanMemberUid
        val cleanMembers = memberUids.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
        if (cleanMembers.isNotEmpty()) payload["memberUids"] = cleanMembers
        val cleanTitle = title.trim()
        if (cleanTitle.isNotEmpty()) payload["title"] = cleanTitle
        val result = functions.getHttpsCallable("createMessageThread").call(payload).await()
        val data = result.data as? Map<*, *> ?: return ""
        return stringValue(data["threadId"], "")
    }

    suspend fun addMembersToMessageThread(workspace: StudioWorkspace, threadId: String, memberUids: List<String>) {
        if (workspace.id.isBlank() || threadId.isBlank()) return
        val cleanMembers = memberUids.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
        if (cleanMembers.isEmpty()) return
        functions.getHttpsCallable("addMembersToMessageThread")
            .call(mapOf("companyId" to workspace.id, "threadId" to threadId, "memberUids" to cleanMembers))
            .await()
    }

    suspend fun renameMessageThread(workspace: StudioWorkspace, threadId: String, title: String) {
        val cleanTitle = title.trim()
        if (workspace.id.isBlank() || threadId.isBlank() || cleanTitle.isEmpty()) return
        functions.getHttpsCallable("renameMessageThread")
            .call(mapOf("companyId" to workspace.id, "threadId" to threadId, "title" to cleanTitle))
            .await()
    }

    suspend fun leaveMessageThread(workspace: StudioWorkspace, threadId: String) {
        if (workspace.id.isBlank() || threadId.isBlank()) return
        functions.getHttpsCallable("leaveMessageThread")
            .call(mapOf("companyId" to workspace.id, "threadId" to threadId))
            .await()
    }

    suspend fun removeMemberFromMessageThread(workspace: StudioWorkspace, threadId: String, memberUid: String) {
        val cleanUid = memberUid.trim()
        if (workspace.id.isBlank() || threadId.isBlank() || cleanUid.isEmpty()) return
        functions.getHttpsCallable("removeMemberFromMessageThread")
            .call(mapOf("companyId" to workspace.id, "threadId" to threadId, "memberUid" to cleanUid))
            .await()
    }

    suspend fun setMessageThreadMute(workspace: StudioWorkspace, threadId: String, mode: String) {
        if (workspace.id.isBlank() || threadId.isBlank()) return
        functions.getHttpsCallable("setMessageThreadMute")
            .call(mapOf("companyId" to workspace.id, "threadId" to threadId, "mode" to mode.trim()))
            .await()
    }

    suspend fun setMessageTypingStatus(
        workspace: StudioWorkspace,
        user: FirebaseUser,
        threadId: String,
        isTyping: Boolean
    ) {
        if (workspace.id.isBlank() || threadId.isBlank()) return
        val functionName = if (isTyping) "setMessageTypingStatus" else "clearMessageTypingStatus"
        functions.getHttpsCallable(functionName)
            .call(
                mapOf(
                    "companyId" to workspace.id,
                    "threadId" to threadId,
                    "isTyping" to isTyping,
                    "userName" to user.displayName.orEmpty().trim(),
                    "userPhotoURL" to (user.photoUrl?.toString().orEmpty()).trim()
                )
            )
            .await()
    }

    suspend fun setMessageThreadActive(workspace: StudioWorkspace, threadId: String, isActive: Boolean) {
        if (workspace.id.isBlank() || threadId.isBlank()) return
        functions.getHttpsCallable("setMessageThreadActive")
            .call(mapOf("companyId" to workspace.id, "threadId" to threadId, "isActive" to isActive))
            .await()
    }

    fun activityNotificationsFlow(workspace: StudioWorkspace, currentUid: String, currentEmail: String): Flow<List<StudioActivityNotification>> = callbackFlow {
        if (workspace.id.isBlank()) {
            trySend(emptyList())
            awaitClose {}
            return@callbackFlow
        }
        val registration = db.collection("companies")
            .document(workspace.id)
            .collection("notifications")
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(100)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                val items = snapshot?.documents
                    ?.map { document -> activityNotificationFromDocument(document.id, document.data.orEmpty()) }
                    ?.filter { it.isVisible(currentUid, currentEmail) }
                    ?.sortedByDescending { it.createdAt?.time ?: 0L }
                    ?: emptyList()
                trySend(items)
            }
        awaitClose { registration.remove() }
    }

    // — Keep Notes (personal per-user notes) —
    fun keepNotesFlow(workspaceId: String, userId: String): Flow<List<StudioKeepNote>> = callbackFlow {
        if (workspaceId.isBlank() || userId.isBlank()) {
            trySend(emptyList())
            awaitClose {}
            return@callbackFlow
        }
        val registration = db.collection("companies")
            .document(workspaceId)
            .collection("personal_notes")
            .document(userId)
            .collection("notes")
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                val items = snapshot?.documents
                    ?.map { document -> keepNoteFromDocument(document.id, document.data.orEmpty()) }
                    ?: emptyList()
                trySend(items)
            }
        awaitClose { registration.remove() }
    }

    suspend fun saveKeepNote(workspaceId: String, userId: String, note: StudioKeepNote) {
        if (workspaceId.isBlank() || userId.isBlank() || note.id.isBlank()) return
        val now = java.util.Date()
        val data = mapOf(
            "title" to note.title,
            "text" to note.text,
            "colorName" to note.colorName,
            "ownerUserId" to note.ownerUserId,
            "ownerEmail" to note.ownerEmail,
            "ownerName" to note.ownerName,
            "sharedWith" to note.sharedWith,
            "collaboratorEmails" to note.collaboratorEmails,
            "activeEditorUserId" to note.activeEditorUserId,
            "activeEditorEmail" to note.activeEditorEmail,
            "activeEditorUpdatedAt" to note.activeEditorUpdatedAt,
            "isPinned" to note.isPinned,
            "isArchived" to note.isArchived,
            "isDeleted" to note.isDeleted,
            "labels" to note.labels,
            "links" to note.links,
            "reminderDate" to note.reminderDate,
            "manualOrder" to note.manualOrder,
            "noteType" to note.noteType,
            "linkedOrderId" to note.linkedOrderId,
            "linkedOrderLabel" to note.linkedOrderLabel,
            "linkedCustomerName" to note.linkedCustomerName,
            "visibility" to note.visibility,
            "createdAt" to (note.createdAt ?: now),
            "updatedAt" to now
        )
        db.collection("companies")
            .document(workspaceId)
            .collection("personal_notes")
            .document(userId)
            .collection("notes")
            .document(note.id)
            .set(data)
            .await()
    }

    suspend fun uploadKeepNoteImage(
        workspaceId: String,
        userId: String,
        noteId: String,
        bytes: ByteArray,
        contentType: String,
        fileName: String
    ): String {
        if (workspaceId.isBlank() || userId.isBlank() || noteId.isBlank() || bytes.isEmpty()) return ""
        val ext = fileName.substringAfterLast('.', "jpg")
        val key = "${System.currentTimeMillis()}_${UUID.randomUUID()}.$ext"
        val ref = storage.reference.child("companies/$workspaceId/personal_notes/$userId/note_images/$noteId/$key")
        val metadata = StorageMetadata.Builder().setContentType(contentType.ifBlank { "image/jpeg" }).build()
        ref.putBytes(bytes, metadata).await()
        return ref.downloadUrl.await().toString()
    }

    // — Keep Note collaboration (Cloud Functions, mirror Mac) —
    suspend fun inviteKeepNoteCollaborator(
        workspaceId: String,
        note: StudioKeepNote,
        targetUserId: String,
        targetEmail: String
    ) {
        if (workspaceId.isBlank() || note.id.isBlank() || (targetUserId.isBlank() && targetEmail.isBlank())) return
        val notePayload = mapOf(
            "title" to note.title,
            "text" to note.text,
            "colorName" to note.colorName,
            "ownerUserId" to note.ownerUserId,
            "companyId" to workspaceId,
            "sharedWith" to note.sharedWith,
            "collaboratorEmails" to note.collaboratorEmails,
            "isPinned" to note.isPinned,
            "isArchived" to note.isArchived,
            "isDeleted" to note.isDeleted,
            "labels" to note.labels,
            "links" to note.links,
            "manualOrder" to note.manualOrder,
            "reminderDateMillis" to note.reminderDate?.time,
            "noteType" to note.noteType,
            "linkedOrderId" to note.linkedOrderId,
            "linkedOrderLabel" to note.linkedOrderLabel,
            "linkedCustomerName" to note.linkedCustomerName,
            "visibility" to note.visibility
        )
        functions.getHttpsCallable("createPersonalNoteCollaborationInvite")
            .call(mapOf(
                "companyId" to workspaceId,
                "noteId" to note.id,
                "targetUserId" to targetUserId,
                "targetEmail" to targetEmail,
                "note" to notePayload
            )).await()
    }

    suspend fun removeKeepNoteCollaborator(
        workspaceId: String,
        noteId: String,
        targetUserId: String,
        targetEmail: String
    ) {
        if (workspaceId.isBlank() || noteId.isBlank()) return
        functions.getHttpsCallable("removeSharedPersonalNoteFromWorkspaceMember")
            .call(mapOf(
                "companyId" to workspaceId,
                "noteId" to noteId,
                "targetUserId" to targetUserId,
                "targetEmail" to targetEmail
            )).await()
    }

    suspend fun listKeepCollaborationInvites(workspaceId: String): List<StudioKeepCollaborationInvite> {
        if (workspaceId.isBlank()) return emptyList()
        val result = functions.getHttpsCallable("listPersonalNoteCollaborationInvites")
            .call(mapOf("companyId" to workspaceId))
            .await()
        val data = result.data as? Map<*, *> ?: return emptyList()
        val raw = data["invites"] as? List<*> ?: return emptyList()
        return raw.mapNotNull { item ->
            val m = item as? Map<*, *> ?: return@mapNotNull null
            val inviteId = (m["inviteId"] as? String ?: m["id"] as? String).orEmpty()
            if (inviteId.isBlank()) return@mapNotNull null
            val preview = m["notePreview"] as? Map<*, *> ?: emptyMap<Any, Any>()
            StudioKeepCollaborationInvite(
                id = inviteId,
                inviteId = inviteId,
                companyId = (m["companyId"] as? String).orEmpty().ifBlank { workspaceId },
                noteId = (m["noteId"] as? String).orEmpty(),
                sourceUserId = (m["sourceUserId"] as? String).orEmpty(),
                sourceEmail = (m["sourceEmail"] as? String).orEmpty(),
                title = (preview["title"] as? String).orEmpty(),
                text = (preview["text"] as? String).orEmpty(),
                createdAtMillis = (m["createdAtMillis"] as? Number)?.toLong()
            )
        }
    }

    suspend fun acceptKeepCollaborationInvite(workspaceId: String, inviteId: String) {
        if (workspaceId.isBlank() || inviteId.isBlank()) return
        functions.getHttpsCallable("acceptPersonalNoteCollaborationInvite")
            .call(mapOf("companyId" to workspaceId, "inviteId" to inviteId))
            .await()
    }

    suspend fun declineKeepCollaborationInvite(workspaceId: String, inviteId: String) {
        if (workspaceId.isBlank() || inviteId.isBlank()) return
        functions.getHttpsCallable("declinePersonalNoteCollaborationInvite")
            .call(mapOf("companyId" to workspaceId, "inviteId" to inviteId))
            .await()
    }

    suspend fun deleteKeepNote(workspaceId: String, userId: String, noteId: String) {
        if (workspaceId.isBlank() || userId.isBlank() || noteId.isBlank()) return
        db.collection("companies")
            .document(workspaceId)
            .collection("personal_notes")
            .document(userId)
            .collection("notes")
            .document(noteId)
            .delete()
            .await()
    }

    private fun keepNoteFromDocument(id: String, data: Map<String, Any?>): StudioKeepNote {
        return StudioKeepNote(
            id = id,
            title = stringValue(data["title"], ""),
            text = stringValue(data["text"], ""),
            colorName = stringValue(data["colorName"], "default"),
            ownerUserId = stringValue(data["ownerUserId"], ""),
            ownerEmail = stringValue(data["ownerEmail"], ""),
            ownerName = stringValue(data["ownerName"], ""),
            sharedWith = (data["sharedWith"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList(),
            collaboratorEmails = (data["collaboratorEmails"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList(),
            activeEditorUserId = stringValue(data["activeEditorUserId"], ""),
            activeEditorEmail = stringValue(data["activeEditorEmail"], ""),
            activeEditorUpdatedAt = messageDateFromAny(data["activeEditorUpdatedAt"]),
            isPinned = (data["isPinned"] as? Boolean) ?: false,
            isArchived = (data["isArchived"] as? Boolean) ?: false,
            isDeleted = (data["isDeleted"] as? Boolean) ?: false,
            labels = (data["labels"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList(),
            links = (data["links"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList(),
            reminderDate = messageDateFromAny(data["reminderDate"]),
            manualOrder = (data["manualOrder"] as? Number)?.toDouble() ?: 0.0,
            createdAt = messageDateFromAny(data["createdAt"]),
            updatedAt = messageDateFromAny(data["updatedAt"]),
            noteType = stringValue(data["noteType"], "personal").let {
                if (it in listOf("personal", "order", "customer", "team")) it else "personal"
            },
            linkedOrderId = stringValue(data["linkedOrderId"], ""),
            linkedOrderLabel = stringValue(data["linkedOrderLabel"], ""),
            linkedCustomerName = stringValue(data["linkedCustomerName"], ""),
            visibility = if (stringValue(data["visibility"], "") == "workspace") "workspace" else "only_me"
        )
    }

    /** Member uids from the company doc `members` map (web parity: the
     *  workspace-visibility fan-out targets every member except the caller). */
    suspend fun listWorkspaceMemberUids(workspaceId: String): List<String> {
        if (workspaceId.isBlank()) return emptyList()
        val snapshot = db.collection("companies").document(workspaceId).get().await()
        val members = snapshot.data?.get("members") as? Map<*, *> ?: return emptyList()
        return members.keys.mapNotNull { (it as? String)?.trim() }.filter { it.isNotEmpty() }
    }

    suspend fun markActivityNotificationRead(workspace: StudioWorkspace, notificationId: String) {
        if (workspace.id.isBlank() || notificationId.isBlank()) return
        functions.getHttpsCallable("markActivityNotificationRead")
            .call(mapOf("companyId" to workspace.id, "notificationId" to notificationId))
            .await()
    }

    suspend fun markAllActivityNotificationsRead(workspace: StudioWorkspace) {
        if (workspace.id.isBlank()) return
        functions.getHttpsCallable("markAllActivityNotificationsRead")
            .call(mapOf("companyId" to workspace.id))
            .await()
    }

    suspend fun dismissActivityNotifications(workspace: StudioWorkspace, notificationIds: List<String>) {
        val cleanIds = notificationIds.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
        if (workspace.id.isBlank() || cleanIds.isEmpty()) return
        functions.getHttpsCallable("dismissActivityNotifications")
            .call(mapOf("companyId" to workspace.id, "notificationIds" to cleanIds))
            .await()
    }

    suspend fun getMessageWorkspaceSettings(workspace: StudioWorkspace): StudioMessageWorkspaceSettings {
        if (workspace.id.isBlank()) return StudioMessageWorkspaceSettings()
        val result = functions.getHttpsCallable("getMessageWorkspaceSettings")
            .call(mapOf("companyId" to workspace.id))
            .await()
        val data = result.data as? Map<*, *> ?: return StudioMessageWorkspaceSettings()
        val settings = (data["settings"] as? Map<*, *>) ?: data
        return StudioMessageWorkspaceSettings(
            directMessagesEnabled = settings["directMessagesEnabled"] as? Boolean ?: true,
            groupConversationsEnabled = settings["groupConversationsEnabled"] as? Boolean ?: true,
            attachmentsEnabled = settings["attachmentsEnabled"] as? Boolean ?: true
        )
    }

    suspend fun setMessageWorkspaceSettings(workspace: StudioWorkspace, settings: StudioMessageWorkspaceSettings) {
        if (workspace.id.isBlank()) return
        functions.getHttpsCallable("setMessageWorkspaceSettings")
            .call(
                mapOf(
                    "companyId" to workspace.id,
                    "directMessagesEnabled" to settings.directMessagesEnabled,
                    "groupConversationsEnabled" to settings.groupConversationsEnabled,
                    "attachmentsEnabled" to settings.attachmentsEnabled
                )
            )
            .await()
    }

    suspend fun markMessageThreadRead(workspace: StudioWorkspace, threadId: String) {
        if (workspace.id.isBlank() || threadId.isBlank()) return
        functions.getHttpsCallable("markMessageThreadRead")
            .call(mapOf("companyId" to workspace.id, "threadId" to threadId))
            .await()
    }

    private fun memberAccess(
        data: Map<String, Any>,
        uid: String,
        owner: Boolean,
        rawRole: String,
        customRoles: List<StudioCustomRole>
    ): WorkspaceMemberAccess {
        if (owner) return WorkspaceMemberAccess()
        customRoles.firstOrNull { it.id == rawRole }?.let { return it.access }

        val members = data["members"] as? Map<*, *> ?: emptyMap<Any, Any>()
        val member = members[uid] as? Map<*, *>
        val rootAccess = (data["memberAccess"] as? Map<*, *>)?.get(uid) as? Map<*, *> ?: emptyMap<Any, Any>()
        val inlineAccess = member?.get("access") as? Map<*, *> ?: emptyMap<Any, Any>()
        val mergedAccess = defaultAccessMapForRole(rawRole).toMutableMap()
        inlineAccess.forEach { (key, value) -> mergedAccess[key.toString()] = value }
        rootAccess.forEach { (key, value) -> mergedAccess[key.toString()] = value }
        val resolvedAccess = accessFromMap(mergedAccess)
        if (effectiveMemberRole(rawRole, customRoles) == "workflow") {
            // Workflow Only is an enforced production role. Stored or legacy custom
            // access settings must never reopen finance, customer-list or team control access.
            return resolvedAccess.copy(
                dashboard = false,
                financialInfo = false,
                customers = false,
                teamAccess = false,
                cardFinancial = false,
                assignedProjectsOnly = true,
                manageProjectAssignments = false,
                orders = true,
                schedule = true,
                quickReply = true,
                clientFiles = true,
                cardClientFiles = true
            )
        }
        return resolvedAccess
    }
    // ---- Bank feed (read-only; Firestore rules restrict reads to the owner) ----

    fun bankTransactionsFlow(workspaceId: String): Flow<List<StudioBankTransaction>> = callbackFlow {
        if (workspaceId.isBlank()) { trySend(emptyList()); awaitClose {}; return@callbackFlow }
        val registration = db.collection("companies").document(workspaceId)
            .collection("bankTransactions")
            .orderBy("bookingDate", com.google.firebase.firestore.Query.Direction.DESCENDING)
            .limit(3000)
            .addSnapshotListener { snapshot, error ->
                if (error != null) { close(error); return@addSnapshotListener }
                trySend(snapshot?.documents?.map { bankTransactionFromDocument(it.id, it.data.orEmpty()) } ?: emptyList())
            }
        awaitClose { registration.remove() }
    }

    fun bankRulesFlow(workspaceId: String): Flow<List<StudioBankRule>> = callbackFlow {
        if (workspaceId.isBlank()) { trySend(emptyList()); awaitClose {}; return@callbackFlow }
        val registration = db.collection("companies").document(workspaceId)
            .collection("bankRules")
            .addSnapshotListener { snapshot, error ->
                if (error != null) { trySend(emptyList()); return@addSnapshotListener }
                trySend(snapshot?.documents?.map { bankRuleFromDocument(it.id, it.data.orEmpty()) } ?: emptyList())
            }
        awaitClose { registration.remove() }
    }

    /** Payees the owner grouped/marked as recurring by hand. */
    fun bankVendorsFlow(workspaceId: String): Flow<List<uk.co.eggcraft.studioflow.data.model.StudioBankVendor>> = callbackFlow {
        if (workspaceId.isBlank()) { trySend(emptyList()); awaitClose {}; return@callbackFlow }
        val registration = db.collection("companies").document(workspaceId)
            .collection("bankVendors")
            .addSnapshotListener { snapshot, error ->
                if (error != null) { trySend(emptyList()); return@addSnapshotListener }
                trySend(snapshot?.documents?.map {
                    uk.co.eggcraft.studioflow.data.model.bankVendorFromDocument(it.id, it.data.orEmpty())
                }?.filter { it.keys.isNotEmpty() } ?: emptyList())
            }
        awaitClose { registration.remove() }
    }

    /** Receipts uploaded before their payment reached the feed (server attaches them later). */
    fun bankWaitingReceiptsFlow(workspaceId: String): Flow<List<StudioBankWaitingReceipt>> = callbackFlow {
        if (workspaceId.isBlank()) { trySend(emptyList()); awaitClose {}; return@callbackFlow }
        val registration = db.collection("companies").document(workspaceId)
            .collection("bankReceiptInbox")
            .addSnapshotListener { snapshot, error ->
                if (error != null) { trySend(emptyList()); return@addSnapshotListener }
                val items = snapshot?.documents?.map { bankWaitingReceiptFromDocument(it.id, it.data.orEmpty()) }
                    ?.filter { it.storagePath.isNotBlank() }
                    ?.sortedByDescending { it.createdAtMillis ?: 0L } ?: emptyList()
                trySend(items)
            }
        awaitClose { registration.remove() }
    }

    /** Workspace-defined category records (rename/deactivate/default VAT).
     *  Active custom names merge into the pickers; active=false hides a
     *  matching built-in name. Server-written, owner-readable. */
    fun bankCategoriesFlow(workspaceId: String): Flow<List<uk.co.eggcraft.studioflow.data.model.StudioBankCategory>> = callbackFlow {
        if (workspaceId.isBlank()) { trySend(emptyList()); awaitClose {}; return@callbackFlow }
        val registration = db.collection("companies").document(workspaceId)
            .collection("bankCategories")
            .addSnapshotListener { snapshot, error ->
                if (error != null) { trySend(emptyList()); return@addSnapshotListener }
                trySend(snapshot?.documents?.map {
                    uk.co.eggcraft.studioflow.data.model.bankCategoryFromDocument(it.id, it.data.orEmpty())
                }?.filter { it.name.isNotBlank() }?.sortedBy { it.name } ?: emptyList())
            }
        awaitClose { registration.remove() }
    }

    /** Category → default VAT code (Pandle mapping when saved, else the built-in defaults). */
    fun bankCategoryTaxFlow(workspaceId: String): Flow<Map<String, String>> = callbackFlow {
        if (workspaceId.isBlank()) { trySend(BANK_DEFAULT_CATEGORY_TAX); awaitClose {}; return@callbackFlow }
        val registration = db.collection("companies").document(workspaceId)
            .collection("pandleConnection").document("main")
            .addSnapshotListener { snapshot, error ->
                if (error != null) { trySend(BANK_DEFAULT_CATEGORY_TAX); return@addSnapshotListener }
                val mappings = snapshot?.get("mappings") as? List<*>
                val map = mappings?.mapNotNull { entry ->
                    val row = entry as? Map<*, *> ?: return@mapNotNull null
                    val category = row["category"] as? String ?: return@mapNotNull null
                    val tax = row["taxCode"] as? String ?: return@mapNotNull null
                    category to tax
                }?.toMap()
                trySend(if (map.isNullOrEmpty()) BANK_DEFAULT_CATEGORY_TAX else map)
            }
        awaitClose { registration.remove() }
    }

    // ---- Inventory (workspace-scoped, role-checked server-side) ----
    //
    // Every write goes through the same Cloud Functions the web and Apple apps
    // call. The money rules, the item numbering and the status lifecycle are
    // decided in one place so no two screens can disagree about what a thing
    // cost or where it is.

    private suspend fun inventoryCall(name: String, workspaceId: String, data: Map<String, Any?> = emptyMap()): Map<*, *> {
        val payload = data.toMutableMap()
        payload["companyId"] = workspaceId
        val result = functions.getHttpsCallable(name).call(payload).await()
        return result.data as? Map<*, *> ?: emptyMap<String, Any?>()
    }

    // Production. Only two things are ever written to an order: a person's
    // explicit override and the blocker; the stage is derived everywhere else.

    /** The workspace's board. Falls back to the default lanes rather than
     *  failing — a board that will not render answers nothing. */
    suspend fun productionStages(workspaceId: String): List<ProductionStage> = runCatching {
        val snap = db.collection("companySettings").document(workspaceId).get().await()
        productionStagesFrom(snap.get("productionStages"))
    }.getOrElse { defaultProductionStages }

    /** Moving a card writes the stage, records it in the order's history, tells
     *  the assignee, and hands back what Undo needs. The blocked lane refuses a
     *  move with no reason — server-side, so every client is held to it. */
    suspend fun setOrderProductionStage(
        workspaceId: String, orderId: String, stageId: String, blocker: ProductionBlocker?
    ): Pair<String, ProductionBlocker?> {
        val payload = mutableMapOf<String, Any?>("orderId" to orderId, "stageId" to stageId)
        if (blocker != null) {
            payload["blocker"] = mapOf("reason" to blocker.reason, "note" to blocker.note)
        }
        val raw = inventoryCall("setOrderProductionStage", workspaceId, payload)
        val previous = raw["previous"] as? Map<*, *> ?: emptyMap<String, Any?>()
        val previousBlockerMap = previous["blocker"] as? Map<*, *>
        val previousReason = (previousBlockerMap?.get("reason") as? String).orEmpty()
        return (previous["override"] as? String).orEmpty() to
            if (previousReason in ProductionBlocker.reasons) {
                ProductionBlocker(previousReason, (previousBlockerMap?.get("note") as? String).orEmpty())
            } else null
    }

    suspend fun undoOrderProductionStage(
        workspaceId: String, orderId: String, previousOverride: String, previousBlocker: ProductionBlocker?
    ) {
        val previous = mutableMapOf<String, Any?>("override" to previousOverride)
        if (previousBlocker != null) {
            previous["blocker"] = mapOf("reason" to previousBlocker.reason, "note" to previousBlocker.note)
        }
        inventoryCall("undoOrderProductionStage", workspaceId, mapOf("orderId" to orderId, "previous" to previous))
    }

    /** One page of items — 500 at a time. Pass the previous page's cursor to
     *  get the next one; the returned cursor is null once everything has been
     *  handed over. Screens that only need "the stock" take the first page. */
    suspend fun inventoryItemsPage(
        workspaceId: String, cursor: StudioInventoryCursor? = null
    ): StudioInventoryPage {
        val payload = mutableMapOf<String, Any?>("limit" to 500)
        if (cursor != null) payload["cursor"] = cursor.payload()
        val raw = inventoryCall("listInventoryItems", workspaceId, payload)
        val hasMore = raw["hasMore"] as? Boolean ?: false
        return StudioInventoryPage(
            items = (raw["items"] as? List<*> ?: emptyList<Any?>())
                .mapNotNull { (it as? Map<*, *>)?.let(StudioInventoryItem::from) },
            cursor = if (hasMore) StudioInventoryCursor.from(raw["cursor"] as? Map<*, *>) else null,
            categories = (raw["categoryDetails"] as? List<*> ?: emptyList<Any?>())
                .mapNotNull { (it as? Map<*, *>)?.let(StudioInventoryCategory::from) },
            defaultCategory = (raw["defaultCategory"] as? String).orEmpty()
        )
    }

    suspend fun inventoryItems(workspaceId: String): List<StudioInventoryItem> =
        inventoryItemsPage(workspaceId).items

    // Categories. A workshop names what it keeps; renaming one here renames it
    // on every item, because the server carries the new title across.

    suspend fun inventoryCategories(workspaceId: String): Triple<List<StudioInventoryCategory>, String, List<Pair<String, Int>>> {
        val raw = inventoryCall("listInventoryCategories", workspaceId)
        val rows = (raw["categories"] as? List<*> ?: emptyList<Any?>())
            .mapNotNull { (it as? Map<*, *>)?.let(StudioInventoryCategory::from) }
        val orphans = (raw["orphans"] as? List<*> ?: emptyList<Any?>()).mapNotNull { entry ->
            val map = entry as? Map<*, *> ?: return@mapNotNull null
            val title = (map["title"] as? String).orEmpty()
            if (title.isEmpty()) null else title to ((map["itemCount"] as? Number)?.toInt() ?: 0)
        }
        return Triple(rows, (raw["defaultCategory"] as? String).orEmpty(), orphans)
    }

    suspend fun saveInventoryCategories(
        workspaceId: String,
        categories: List<StudioInventoryCategory>,
        defaultCategory: String
    ): List<StudioInventoryCategory> {
        val payload = mapOf(
            "categories" to categories.map {
                mapOf("id" to it.id, "title" to it.title, "icon" to it.icon, "archived" to it.archived)
            },
            "defaultCategory" to defaultCategory
        )
        val raw = inventoryCall("saveInventoryCategories", workspaceId, payload)
        return (raw["categories"] as? List<*> ?: emptyList<Any?>())
            .mapNotNull { (it as? Map<*, *>)?.let(StudioInventoryCategory::from) }
    }

    /** [disposition] is "move" (with [moveToId]), "archive" or "other". Without
     *  one the server refuses to remove a category that still holds items. */
    suspend fun deleteInventoryCategory(
        workspaceId: String, categoryId: String, disposition: String, moveToId: String = ""
    ): Int {
        val payload = mutableMapOf<String, Any?>("categoryId" to categoryId, "disposition" to disposition)
        if (disposition == "move") payload["moveToId"] = moveToId
        val raw = inventoryCall("deleteInventoryCategory", workspaceId, payload)
        return (raw["itemsMoved"] as? Number)?.toInt() ?: 0
    }

    suspend fun mergeInventoryCategories(workspaceId: String, fromId: String, intoId: String): Int {
        val raw = inventoryCall("mergeInventoryCategories", workspaceId, mapOf("fromId" to fromId, "intoId" to intoId))
        return (raw["itemsMoved"] as? Number)?.toInt() ?: 0
    }

    suspend fun inventorySummary(workspaceId: String): StudioInventorySummary {
        val raw = inventoryCall("getInventorySummary", workspaceId)
        return StudioInventorySummary.from(raw["summary"] as? Map<*, *> ?: emptyMap<String, Any?>())
    }

    /** Returns the saved item's id — for a new item the one the server has just
     *  assigned. Photo storage paths are keyed by that id, so a form that picked
     *  photos before the item existed needs it back to upload them. */
    suspend fun inventorySaveItem(workspaceId: String, item: Map<String, Any?>, itemId: String = ""): String {
        val raw = inventoryCall("saveInventoryItem", workspaceId, mapOf("itemId" to itemId, "item" to item))
        return raw["itemId"] as? String ?: itemId
    }

    suspend fun inventorySetStatus(workspaceId: String, itemId: String, status: StudioInventoryStatus) {
        inventoryCall("setInventoryItemStatus", workspaceId, mapOf("itemId" to itemId, "status" to status.raw))
    }

    suspend fun inventoryPurchases(workspaceId: String): List<StudioPurchase> {
        val raw = inventoryCall("listPurchases", workspaceId)
        return (raw["purchases"] as? List<*> ?: emptyList<Any?>())
            .mapNotNull { (it as? Map<*, *>)?.let(StudioPurchase::from) }
    }

    suspend fun inventorySavePurchase(workspaceId: String, purchase: Map<String, Any?>) {
        inventoryCall("savePurchase", workspaceId, mapOf("purchase" to purchase))
    }

    /** Without [lines] this receives everything still outstanding — the old
     *  one-click receive. With them it receives only what the courier actually
     *  brought: each entry is {index, quantity?} into the purchase's lines
     *  (unique lines just {index}), and the purchase stays partially received
     *  until the last piece lands. */
    suspend fun inventoryReceivePurchase(
        workspaceId: String, purchaseId: String, lines: List<Map<String, Any?>>? = null
    ) {
        val payload = mutableMapOf<String, Any?>("purchaseId" to purchaseId)
        if (lines != null) payload["lines"] = lines
        inventoryCall("receivePurchase", workspaceId, payload)
    }

    suspend fun inventoryDeletePurchase(workspaceId: String, purchaseId: String) {
        inventoryCall("deletePurchase", workspaceId, mapOf("purchaseId" to purchaseId))
    }

    /** Returns how far the payment is from the purchase total. A deposit or a
     *  part payment is a real thing, so the gap is reported, not refused. */
    suspend fun inventoryMatchPayment(workspaceId: String, purchaseId: String, transactionId: String): Double {
        val raw = inventoryCall(
            "linkPurchaseToBankTransaction",
            workspaceId,
            mapOf("purchaseId" to purchaseId, "transactionId" to transactionId)
        )
        return (raw["difference"] as? Number)?.toDouble() ?: 0.0
    }

    suspend fun inventorySuppliers(workspaceId: String): List<StudioSupplier> {
        val raw = inventoryCall("listSuppliers", workspaceId)
        return (raw["suppliers"] as? List<*> ?: emptyList<Any?>())
            .mapNotNull { (it as? Map<*, *>)?.let(StudioSupplier::from) }
    }

    suspend fun inventorySaveSupplier(workspaceId: String, supplier: Map<String, Any?>, supplierId: String = "") {
        inventoryCall("saveSupplier", workspaceId, mapOf("supplierId" to supplierId, "supplier" to supplier))
    }

    /** The location tree, sorted by path server-side ("Safe A" before
     *  "Safe A / Drawer 3"), so the screen can indent by depth and read down. */
    suspend fun inventoryLocations(workspaceId: String): List<StudioInventoryLocation> {
        val raw = inventoryCall("listInventoryLocations", workspaceId)
        return (raw["locations"] as? List<*> ?: emptyList<Any?>())
            .mapNotNull { (it as? Map<*, *>)?.let(StudioInventoryLocation::from) }
    }

    /** Creates ([locationId] blank) or renames/moves a location. The server
     *  owns the whole cascade: sibling-name and cycle checks, the ≤4-level
     *  depth cap, and rewriting subtree paths plus item location strings. */
    suspend fun inventorySaveLocation(workspaceId: String, name: String, parentId: String, locationId: String = "") {
        inventoryCall(
            "saveInventoryLocation", workspaceId,
            mapOf("locationId" to locationId, "name" to name, "parentId" to parentId)
        )
    }

    /** Refused server-side while child locations or standing stock remain —
     *  the HttpsError message says which, and the screen shows it verbatim. */
    suspend fun inventoryDeleteLocation(workspaceId: String, locationId: String) {
        inventoryCall("deleteInventoryLocation", workspaceId, mapOf("locationId" to locationId))
    }

    /** The job parts lists (BOM), name-sorted server-side. */
    suspend fun inventoryRecipes(workspaceId: String): List<StudioInventoryRecipe> {
        val raw = inventoryCall("listInventoryRecipes", workspaceId)
        return (raw["recipes"] as? List<*> ?: emptyList<Any?>())
            .mapNotNull { (it as? Map<*, *>)?.let(StudioInventoryRecipe::from) }
    }

    /** Creates ([recipeId] blank) or rewrites a recipe. The server owns the
     *  limits: at most 30 lines, every line a real item id with quantity > 0. */
    suspend fun inventorySaveRecipe(
        workspaceId: String, name: String, notes: String,
        lines: List<Map<String, Any?>>, recipeId: String = ""
    ) {
        inventoryCall(
            "saveInventoryRecipe", workspaceId,
            mapOf(
                "recipeId" to recipeId,
                "recipe" to mapOf("name" to name, "notes" to notes, "lines" to lines)
            )
        )
    }

    suspend fun inventoryDeleteRecipe(workspaceId: String, recipeId: String) {
        inventoryCall("deleteInventoryRecipe", workspaceId, mapOf("recipeId" to recipeId))
    }

    /** All-or-nothing on the server: either every line of the recipe gets
     *  reserved for the order or nothing does, and the failure message names
     *  the part that did not fit — the screen shows it verbatim. */
    suspend fun inventoryApplyRecipe(workspaceId: String, recipeId: String, orderId: String, multiplier: Double) {
        val payload = mutableMapOf<String, Any?>("recipeId" to recipeId, "orderId" to orderId)
        if (multiplier != 1.0) payload["multiplier"] = multiplier
        inventoryCall("applyRecipeToOrder", workspaceId, payload)
    }

    /** Asks the server what a pasted list would become. The preview and the
     *  import come out of the same call, so the screen cannot promise one thing
     *  and the write do another. */
    suspend fun inventoryReadOpeningStock(
        workspaceId: String,
        text: String,
        hasHeader: Boolean,
        mapping: List<String>,
        defaultType: StudioTrackingType,
        typeOverrides: Map<Int, StudioTrackingType>
    ): StudioOpeningStockRead {
        val payload = mutableMapOf<String, Any?>(
            "text" to text, "hasHeader" to hasHeader, "defaultType" to defaultType.raw
        )
        if (mapping.isNotEmpty()) payload["mapping"] = mapping
        if (typeOverrides.isNotEmpty()) {
            payload["typeOverrides"] = typeOverrides.entries.associate { it.key.toString() to it.value.raw }
        }
        val raw = inventoryCall("parseOpeningStock", workspaceId, payload)
        return StudioOpeningStockRead(
            grid = (raw["grid"] as? List<*> ?: emptyList<Any?>())
                .map { row -> (row as? List<*> ?: emptyList<Any?>()).map { it as? String ?: "" } },
            headers = (raw["headers"] as? List<*> ?: emptyList<Any?>()).map { it as? String ?: "" },
            mapping = (raw["mapping"] as? List<*> ?: emptyList<Any?>()).map { it as? String ?: "" },
            items = (raw["items"] as? List<*> ?: emptyList<Any?>())
                .mapNotNull { (it as? Map<*, *>)?.let(StudioOpeningStockRow::from) },
            skipped = (raw["skipped"] as? List<*> ?: emptyList<Any?>()).mapNotNull { entry ->
                (entry as? Map<*, *>)?.let {
                    StudioOpeningStockSkip(it["name"] as? String ?: "", it["reason"] as? String ?: "")
                }
            },
            maxRows = (raw["maxRows"] as? Number)?.toInt() ?: 500
        )
    }

    /** [duplicatePolicy] — "skip", "update" or "create" — says what to do with
     *  rows the preview matched to stock already on the shelf; null leaves the
     *  server's default. The count is created plus updated: everything the
     *  sheet actually changed. */
    suspend fun inventoryImportOpeningStock(
        workspaceId: String,
        items: List<Map<String, Any?>>,
        openingDate: String,
        duplicatePolicy: String? = null
    ): Int {
        val payload = mutableMapOf<String, Any?>("items" to items, "openingDate" to openingDate)
        if (duplicatePolicy != null) payload["duplicatePolicy"] = duplicatePolicy
        val raw = inventoryCall("importOpeningStock", workspaceId, payload)
        return ((raw["imported"] as? Number)?.toInt() ?: 0) +
            ((raw["updated"] as? Number)?.toInt() ?: 0)
    }

    // ---- Item photos ----
    //
    // Stored as storage paths, not URLs — a path is permanent where a download
    // URL expires. Screens resolve paths only when they draw.

    suspend fun inventoryPhotoUrl(path: String): String =
        FirebaseStorage.getInstance().reference.child(path).downloadUrl.await().toString()

    /** Uploads one photo and returns the storage path to put in `photos`. */
    suspend fun inventoryUploadPhoto(workspaceId: String, itemId: String, bytes: ByteArray): String {
        val path = "companies/$workspaceId/inventory_photos/$itemId/${System.currentTimeMillis()}-photo.jpg"
        val ref = FirebaseStorage.getInstance().reference.child(path)
        val metadata = StorageMetadata.Builder().setContentType("image/jpeg").build()
        ref.putBytes(bytes, metadata).await()
        return path
    }

    /** Saves the photo list by sending the WHOLE item with only the photos
     *  swapped. The server rebuilds the document from the input and blanks any
     *  field the form does not send (except reservations/status/number), so a
     *  partial map here would quietly wipe brand, serial, notes and the rest. */
    suspend fun inventorySavePhotos(workspaceId: String, item: StudioInventoryItem, photos: List<String>) {
        inventoryCall("saveInventoryItem", workspaceId, mapOf(
            "itemId" to item.id,
            "item" to item.toInput() + mapOf("photos" to photos)
        ))
    }

    /** The movement ledger for one item — what happened to it, when, by whom. */
    suspend fun inventoryMovements(workspaceId: String, itemId: String): List<StudioInventoryMovement> {
        val raw = inventoryCall("listInventoryMovements", workspaceId, mapOf("itemId" to itemId))
        return (raw["movements"] as? List<*> ?: emptyList<Any?>())
            .mapNotNull { (it as? Map<*, *>)?.let(StudioInventoryMovement::from) }
    }

    /** The Files library entries linked to one record, e.g. "inventoryItem:<id>". */
    suspend fun libraryFiles(workspaceId: String, linkKey: String): List<StudioLibraryFile> {
        val raw = inventoryCall("listLibraryFiles", workspaceId, mapOf("linkKey" to linkKey))
        return (raw["files"] as? List<*> ?: emptyList<Any?>())
            .mapNotNull { (it as? Map<*, *>)?.let(StudioLibraryFile::from) }
    }

    suspend fun libraryFileUrl(path: String): String =
        storage.reference.child(path).downloadUrl.await().toString()

    /** The whole library in one call; trashed=true returns ONLY trashed records. */
    suspend fun libraryAllFiles(workspaceId: String, trashed: Boolean = false): List<StudioLibraryFile> {
        val raw = inventoryCall(
            "listLibraryFiles", workspaceId,
            if (trashed) mapOf("trashed" to true) else emptyMap()
        )
        return (raw["files"] as? List<*> ?: emptyList<Any?>())
            .mapNotNull { (it as? Map<*, *>)?.let(StudioLibraryFile::from) }
    }

    suspend fun libraryRenameFile(workspaceId: String, fileId: String, displayName: String) {
        inventoryCall("renameLibraryFile", workspaceId,
            mapOf("fileId" to fileId, "displayName" to displayName))
    }

    /** Shares by linking — the server never copies the file. */
    suspend fun libraryShareFileWithOrder(
        workspaceId: String, fileId: String, orderId: String, visibility: String, displayName: String
    ) {
        val payload = mutableMapOf<String, Any?>(
            "fileId" to fileId, "orderId" to orderId, "visibility" to visibility)
        if (displayName.isNotBlank()) payload["displayName"] = displayName
        inventoryCall("shareLibraryFileWithOrder", workspaceId, payload)
    }

    suspend fun libraryTrashFile(workspaceId: String, fileId: String) {
        inventoryCall("trashLibraryFile", workspaceId, mapOf("fileId" to fileId))
    }

    suspend fun libraryRestoreFile(workspaceId: String, fileId: String) {
        inventoryCall("restoreLibraryFile", workspaceId, mapOf("fileId" to fileId))
    }

    // ---- Stocktake and reporting ----

    suspend fun inventoryStartStocktake(workspaceId: String, location: String, category: String): String {
        val raw = inventoryCall("startStocktake", workspaceId,
            mapOf("location" to location, "category" to category))
        return raw["stocktakeId"] as? String ?: ""
    }

    suspend fun inventoryStocktakes(workspaceId: String): List<StudioStocktakeSummary> {
        val raw = inventoryCall("listStocktakes", workspaceId)
        return (raw["stocktakes"] as? List<*> ?: emptyList<Any?>())
            .mapNotNull { (it as? Map<*, *>)?.let(StudioStocktakeSummary::from) }
    }

    suspend fun inventoryStocktakeLines(workspaceId: String, stocktakeId: String): List<StudioStocktakeLine> {
        val raw = inventoryCall("getStocktake", workspaceId, mapOf("stocktakeId" to stocktakeId))
        val stocktake = raw["stocktake"] as? Map<*, *> ?: emptyMap<String, Any?>()
        return (stocktake["lines"] as? List<*> ?: emptyList<Any?>())
            .mapNotNull { (it as? Map<*, *>)?.let(StudioStocktakeLine::from) }
    }

    suspend fun inventorySaveStocktakeCounts(
        workspaceId: String, stocktakeId: String, counts: Map<String, Any?>
    ) {
        inventoryCall("saveStocktakeCounts", workspaceId,
            mapOf("stocktakeId" to stocktakeId, "counts" to counts))
    }

    /** Returns how many lines were adjusted, what that did to the value, and any
     *  items now promising more than the shelf holds. */
    suspend fun inventoryCommitStocktake(
        workspaceId: String, stocktakeId: String
    ): Triple<Int, Double, List<StudioOverPromised>> {
        val raw = inventoryCall("commitStocktake", workspaceId, mapOf("stocktakeId" to stocktakeId))
        val over = (raw["overPromised"] as? List<*> ?: emptyList<Any?>()).mapNotNull { row ->
            (row as? Map<*, *>)?.let {
                StudioOverPromised(
                    it["name"] as? String ?: "",
                    (it["counted"] as? Number)?.toDouble() ?: 0.0,
                    (it["reserved"] as? Number)?.toDouble() ?: 0.0,
                    (it["orderIds"] as? List<*> ?: emptyList<Any?>()).map { id -> id as? String ?: "" }
                )
            }
        }
        return Triple(
            (raw["adjusted"] as? Number)?.toInt() ?: 0,
            (raw["valueDelta"] as? Number)?.toDouble() ?: 0.0,
            over
        )
    }

    suspend fun inventoryCancelStocktake(workspaceId: String, stocktakeId: String) {
        inventoryCall("cancelStocktake", workspaceId, mapOf("stocktakeId" to stocktakeId))
    }

    suspend fun inventoryReport(workspaceId: String, fromMs: Long, toMs: Long): StudioInventoryReport {
        val raw = inventoryCall("getInventoryReport", workspaceId,
            mapOf("fromMs" to fromMs, "toMs" to toMs))
        return StudioInventoryReport.from(raw)
    }

    suspend fun inventoryOrderStock(workspaceId: String, orderId: String): Pair<List<StudioOrderStockLine>, Double> {
        val raw = inventoryCall("getOrderInventory", workspaceId, mapOf("orderId" to orderId))
        val lines = (raw["items"] as? List<*> ?: emptyList<Any?>())
            .mapNotNull { (it as? Map<*, *>)?.let(StudioOrderStockLine::from) }
        return lines to ((raw["totalCost"] as? Number)?.toDouble() ?: 0.0)
    }

    suspend fun inventoryReserve(workspaceId: String, itemId: String, orderId: String, quantity: Double) {
        inventoryCall(
            "reserveInventoryForOrder",
            workspaceId,
            mapOf("itemId" to itemId, "orderId" to orderId, "quantity" to quantity)
        )
    }

    suspend fun inventoryRelease(workspaceId: String, itemId: String, orderId: String) {
        inventoryCall("releaseInventoryFromOrder", workspaceId, mapOf("itemId" to itemId, "orderId" to orderId))
    }

    /** Consuming is the moment the promised part actually goes into the job:
     *  this order's whole reservation leaves the shelf and the ledger names
     *  the order. Unique items go to "used"; counted items lose the amount. */
    suspend fun inventoryConsume(workspaceId: String, itemId: String, orderId: String) {
        inventoryCall("consumeInventoryForOrder", workspaceId, mapOf("itemId" to itemId, "orderId" to orderId))
    }

    /** Releases the old item and reserves the new one in one server
     *  transaction, so the order is never left holding neither. */
    suspend fun inventorySwap(
        workspaceId: String, orderId: String, fromItemId: String, toItemId: String, quantity: Double
    ) {
        inventoryCall(
            "swapInventoryForOrder",
            workspaceId,
            mapOf("orderId" to orderId, "fromItemId" to fromItemId, "toItemId" to toItemId, "quantity" to quantity)
        )
    }

    /** Stock leaving for a reason that is not a sale or a job — returned,
     *  damaged, lost or wastage. The reason lands in the ledger, so "where did
     *  300ml of lacquer go" has an answer. Quantity only counts for counted
     *  items; the server moves a unique item to "removed" instead. */
    suspend fun inventoryRecordLoss(
        workspaceId: String, itemId: String, kind: String, quantity: Double? = null, note: String = ""
    ) {
        val payload = mutableMapOf<String, Any?>("itemId" to itemId, "kind" to kind)
        if (quantity != null) payload["quantity"] = quantity
        if (note.isNotBlank()) payload["note"] = note
        inventoryCall("recordInventoryLoss", workspaceId, payload)
    }

    // ---- Bank owner actions (all owner-checked server-side) ----

    private suspend fun bankCall(name: String, workspaceId: String, data: Map<String, Any?> = emptyMap()): Map<*, *> {
        val payload = data.toMutableMap()
        payload["companyId"] = workspaceId
        val result = functions.getHttpsCallable(name).call(payload).await()
        return result.data as? Map<*, *> ?: emptyMap<String, Any?>()
    }

    private fun bankSafeFileName(name: String): String =
        name.map { if (it.isLetterOrDigit() || it in "._-") it else '_' }.joinToString("").take(120).ifBlank { "receipt" }

    suspend fun bankUpdateTransaction(workspaceId: String, transactionId: String, category: String, vatCode: String, note: String, reviewStatus: String? = null) {
        val payload = mutableMapOf<String, Any?>("transactionId" to transactionId, "category" to category, "vatCode" to vatCode, "note" to note)
        if (reviewStatus != null) payload["reviewStatus"] = reviewStatus
        bankCall("bankUpdateTransaction", workspaceId, payload)
    }

    /** Sets one review status on many transactions at once. Returns how many rows the server updated. */
    suspend fun bankSetReviewStatusBulk(workspaceId: String, transactionIds: List<String>, reviewStatus: String): Int =
        ((bankCall("bankSetReviewStatusBulk", workspaceId, mapOf("transactionIds" to transactionIds, "reviewStatus" to reviewStatus))["updated"] as? Number)?.toInt()) ?: 0

    suspend fun bankSetReceiptNotNeeded(workspaceId: String, transactionId: String, value: Boolean) {
        bankCall("bankUpdateTransaction", workspaceId, mapOf("transactionId" to transactionId, "receiptNotNeeded" to value))
    }

    /** Classifies an incoming payment ("order_payment", "transfer"…; "" clears). */
    suspend fun bankSetIncomingKind(workspaceId: String, transactionId: String, kind: String) {
        bankCall("bankUpdateTransaction", workspaceId, mapOf("transactionId" to transactionId, "incomingKind" to kind))
    }

    /** Splits one payment across categories/orders. The server requires 2–12
     *  lines summing exactly (±0.005) to the amount; an empty list clears. */
    suspend fun bankSetTransactionSplits(workspaceId: String, transactionId: String, splits: List<Map<String, Any?>>) {
        bankCall("bankSetTransactionSplits", workspaceId, mapOf("transactionId" to transactionId, "splits" to splits))
    }

    /**
     * Matches an incoming bank payment to an order payment. Modes: "suggest"
     * (returns candidates), "link" (stamps one payment; needs paymentId unless
     * exactly one candidate — may come back needsChoice), "create" (appends a
     * NEW payment on the order, idempotent per bank tx) and "unlink".
     */
    suspend fun bankMatchIncomingToOrder(
        workspaceId: String, transactionId: String, mode: String, orderId: String = "", paymentId: String = ""
    ): BankIncomingMatchResult {
        val payload = mutableMapOf<String, Any?>("transactionId" to transactionId, "mode" to mode)
        if (mode != "unlink" && orderId.isNotBlank()) payload["orderId"] = orderId
        if (paymentId.isNotBlank()) payload["paymentId"] = paymentId
        val raw = bankCall("bankMatchIncomingToOrder", workspaceId, payload)
        val candidates = (raw["candidates"] as? List<*>).orEmpty().mapNotNull { entry ->
            val row = entry as? Map<*, *> ?: return@mapNotNull null
            BankPaymentCandidate(
                id = (row["id"] as? String) ?: return@mapNotNull null,
                amount = (row["amount"] as? Number)?.toDouble() ?: 0.0,
                method = (row["method"] as? String) ?: "",
                note = (row["note"] as? String) ?: "",
                dateMs = (row["dateMs"] as? Number)?.toLong() ?: 0L
            )
        }
        return BankIncomingMatchResult(
            orderLabel = (raw["orderLabel"] as? String) ?: "",
            candidates = candidates,
            needsChoice = (raw["needsChoice"] as? Boolean) == true,
            linked = (raw["linked"] as? Boolean) == true,
            created = (raw["created"] as? Boolean) == true,
            unlinked = (raw["unlinked"] as? Boolean) == true,
            already = (raw["already"] as? Boolean) == true
        )
    }

    /** Attaches a central Files-library record as the receipt — the file is
     *  referenced, never copied or re-uploaded. */
    suspend fun bankAttachReceiptFromLibrary(workspaceId: String, transactionId: String, fileRecordId: String) {
        bankCall("bankSetTransactionReceipt", workspaceId, mapOf("transactionId" to transactionId, "fileRecordId" to fileRecordId))
    }

    suspend fun bankLinkOrder(workspaceId: String, transactionId: String, orderId: String) {
        val payload = mutableMapOf<String, Any?>("transactionId" to transactionId)
        if (orderId.isNotBlank()) payload["orderId"] = orderId
        bankCall("bankLinkTransactionToOrder", workspaceId, payload)
    }

    suspend fun bankSync(workspaceId: String): Int =
        ((bankCall("bankSyncTransactions", workspaceId, mapOf("force" to true))["imported"] as? Number)?.toInt()) ?: 0

    suspend fun bankSaveRule(workspaceId: String, keyword: String, category: String) {
        bankCall("bankSaveRule", workspaceId, mapOf("keyword" to keyword.lowercase(), "category" to category))
    }

    /** Marks a payee as recurring, or merges this merchant key into an existing vendor. */
    suspend fun bankSaveVendor(workspaceId: String, vendorId: String, name: String, key: String, cadence: String) {
        bankCall("bankSaveVendor", workspaceId, mapOf("vendorId" to vendorId, "name" to name, "keys" to listOf(key), "cadence" to cadence))
    }

    /** Drops one merchant key from a vendor, or the whole vendor when it was the last one. */
    suspend fun bankDeleteVendor(workspaceId: String, vendorId: String, key: String) {
        bankCall("bankDeleteVendor", workspaceId, mapOf("vendorId" to vendorId, "key" to key))
    }

    suspend fun bankDeleteRule(workspaceId: String, ruleId: String) {
        bankCall("bankDeleteRule", workspaceId, mapOf("ruleId" to ruleId))
    }

    suspend fun bankAttachReceipt(workspaceId: String, transactionId: String, bytes: ByteArray, fileName: String, contentType: String) {
        val path = "companies/$workspaceId/bank_receipts/$transactionId/${System.currentTimeMillis()}_${bankSafeFileName(fileName)}"
        val metadata = StorageMetadata.Builder().setContentType(contentType).build()
        storage.reference.child(path).putBytes(bytes, metadata).await()
        bankCall("bankSetTransactionReceipt", workspaceId, mapOf("transactionId" to transactionId, "storagePath" to path, "fileName" to fileName))
    }

    suspend fun bankRemoveReceipt(workspaceId: String, transactionId: String) {
        bankCall("bankSetTransactionReceipt", workspaceId, mapOf("transactionId" to transactionId, "storagePath" to "", "fileName" to ""))
    }

    suspend fun bankReceiptUrl(path: String): String = storage.reference.child(path).downloadUrl.await().toString()

    /** Uploads to the OCR inbox and returns the parsed total/date plus scored candidates. */
    suspend fun bankMatchReceipt(workspaceId: String, bytes: ByteArray, fileName: String, contentType: String): BankOcrResult {
        val path = "companies/$workspaceId/bank_receipts/_inbox/${System.currentTimeMillis()}_${bankSafeFileName(fileName)}"
        val metadata = StorageMetadata.Builder().setContentType(contentType).build()
        storage.reference.child(path).putBytes(bytes, metadata).await()
        val raw = bankCall("bankMatchReceipt", workspaceId, mapOf("storagePath" to path))
        val parsed = raw["parsed"] as? Map<*, *>
        val candidates = (raw["candidates"] as? List<*>).orEmpty().mapNotNull { entry ->
            val row = entry as? Map<*, *> ?: return@mapNotNull null
            val id = row["transactionId"] as? String ?: return@mapNotNull null
            BankOcrCandidate(
                transactionId = id,
                score = (row["score"] as? Number)?.toInt() ?: 0,
                amount = (row["amount"] as? Number)?.toDouble() ?: 0.0,
                currency = (row["currency"] as? String) ?: "GBP",
                bookingDate = (row["bookingDate"] as? String) ?: "",
                merchant = ((row["counterparty"] as? String).orEmpty().ifBlank { (row["description"] as? String).orEmpty() })
            )
        }
        return BankOcrResult(
            inboxPath = path,
            fileName = fileName,
            amount = (parsed?.get("amount") as? Number)?.toDouble() ?: 0.0,
            date = (parsed?.get("date") as? String) ?: "",
            candidates = candidates
        )
    }

    suspend fun bankAssignInboxReceipt(workspaceId: String, inboxPath: String, transactionId: String, fileName: String) {
        bankCall("bankAssignInboxReceipt", workspaceId, mapOf("storagePath" to inboxPath, "transactionId" to transactionId, "fileName" to fileName))
    }

    suspend fun bankQueueInboxReceipt(workspaceId: String, inboxPath: String, fileName: String, amount: Double, date: String) {
        bankCall("bankQueueInboxReceipt", workspaceId, mapOf("storagePath" to inboxPath, "fileName" to fileName, "amount" to amount, "date" to date))
    }

    suspend fun bankDiscardInboxUpload(inboxPath: String) {
        runCatching { storage.reference.child(inboxPath).delete().await() }
    }

    suspend fun bankDeleteWaitingReceipt(workspaceId: String, id: String) {
        bankCall("bankDeleteInboxReceipt", workspaceId, mapOf("id" to id))
    }

    suspend fun bankMatchWaitingReceipts(workspaceId: String): Int =
        ((bankCall("bankMatchWaitingReceipts", workspaceId)["matched"] as? Number)?.toInt()) ?: 0

    /** The connection audit trail (owner-only server-side): newest first,
     *  every sync/connect/disconnect/purge the server recorded. */
    suspend fun bankAuditLog(workspaceId: String, limit: Int = 15): List<StudioBankAuditEntry> {
        val raw = bankCall("bankListAuditLog", workspaceId, mapOf("limit" to limit))
        return (raw["entries"] as? List<*> ?: emptyList<Any?>())
            .mapNotNull { (it as? Map<*, *>)?.let(StudioBankAuditEntry::from) }
    }

    fun bankConnectionsFlow(workspaceId: String): Flow<List<StudioBankConnection>> = callbackFlow {
        if (workspaceId.isBlank()) { trySend(emptyList()); awaitClose {}; return@callbackFlow }
        val registration = db.collection("companies").document(workspaceId)
            .collection("bankConnections")
            .addSnapshotListener { snapshot, error ->
                if (error != null) { close(error); return@addSnapshotListener }
                trySend(snapshot?.documents?.map { bankConnectionFromDocument(it.id, it.data.orEmpty()) } ?: emptyList())
            }
        awaitClose { registration.remove() }
    }

}

private fun workspaceSettings(
    data: Map<String, Any>,
    userId: String = "",
    ownerUid: String = ""
): StudioWorkspaceSettings {
    val fallback = StudioWorkspaceSettings()
    val workspaceUserProfilesJSON = stringValue(data["workspaceUserProfilesJSON"], fallback.workspaceUserProfilesJSON)
    val sharedWorkspaceSnapshotJSON = stringValue(data["sharedWorkspaceSnapshotJSON"], fallback.sharedWorkspaceSnapshotJSON)
    val typeWorkspaceSnapshotsJSON = stringValue(data["typeWorkspaceSnapshotsJSON"], fallback.typeWorkspaceSnapshotsJSON)
    val dashboardWidgetVisibility = stringBoolMap(data["dashboardWidgetVisibility"])
    val materialCheckFallback = listOf(
        stringValue(data["invLabel1"], fallback.materialsDefaultChecks.getOrElse(0) { "Dial Sourced" }),
        stringValue(data["invLabel2"], fallback.materialsDefaultChecks.getOrElse(1) { "Dial Received" }),
        stringValue(data["invLabel3"], fallback.materialsDefaultChecks.getOrElse(2) { "Watch Received" }),
        stringValue(data["invLabel4"], fallback.materialsDefaultChecks.getOrElse(3) { "Materials Ready" })
    ).map { it.trim() }.filter { it.isNotBlank() }
    return StudioWorkspaceSettings(
        appTheme = stringValue(data["appTheme"], fallback.appTheme),
        appSubtitle = stringValue(data["appSubtitle"], fallback.appSubtitle),
        appLogoUrl = stringValue(data["appLogoUrl"], fallback.appLogoUrl),
        selectedLanguage = stringValue(data["selectedLanguage"], stringValue(data["seciliDil"], fallback.selectedLanguage)),
        selectedCurrency = stringValue(data["seciliParaBirimi"], fallback.selectedCurrency),
        selectedDecimalSeparator = stringValue(data["seciliOndalik"], fallback.selectedDecimalSeparator),
        feePercentage = doubleValue(data["feePercentage"], fallback.feePercentage).coerceIn(0.0, 100.0),
        defaultTaxRate = doubleValue(data["defaultTaxRate"], fallback.defaultTaxRate).coerceIn(0.0, 100.0),
        defaultDeliveryTime = doubleValue(data["defaultDeliveryTime"], fallback.defaultDeliveryTime).coerceIn(1.0, 730.0),
        taxCalculationType = stringValue(data["taxCalculationType"], fallback.taxCalculationType).let {
            if (it.equals("Profit", ignoreCase = true)) "Profit" else "Revenue"
        },
        taxMilestoneEnabled = boolValue(data["taxMilestoneEnabled"], fallback.taxMilestoneEnabled),
        taxMilestoneDate = doubleValue(data["taxMilestoneDate"], fallback.taxMilestoneDate),
        taxRuleNameRevenue = stringValue(data["taxRuleNameRevenue"], fallback.taxRuleNameRevenue),
        taxRuleNameProfit = stringValue(data["taxRuleNameProfit"], fallback.taxRuleNameProfit),
        corporationTaxEnabled = boolValue(data["corporationTaxEnabled"], fallback.corporationTaxEnabled),
        corporationTaxRate = doubleValue(data["corporationTaxRate"], fallback.corporationTaxRate),
        invoiceFooterNote = stringValue(data["invoiceFooterNote"], fallback.invoiceFooterNote),
        dashShowRevenue = dashboardWidgetVisibility["revenue"] ?: boolValue(data["dashShowRevenue"], fallback.dashShowRevenue),
        dashShowPending = dashboardWidgetVisibility["pending"] ?: boolValue(data["dashShowPending"], fallback.dashShowPending),
        dashShowCost = dashboardWidgetVisibility["cost"] ?: boolValue(data["dashShowCost"], fallback.dashShowCost),
        dashShowFee = dashboardWidgetVisibility["fee"] ?: boolValue(data["dashShowFee"], fallback.dashShowFee),
        dashShowShipping = dashboardWidgetVisibility["shipping"] ?: boolValue(data["dashShowShipping"], fallback.dashShowShipping),
        dashShowTax = dashboardWidgetVisibility["tax"] ?: boolValue(data["dashShowTax"], fallback.dashShowTax),
        dashShowProfit = dashboardWidgetVisibility["profit"] ?: boolValue(data["dashShowProfit"], fallback.dashShowProfit),
        replyMode = stringValue(data["replyMode"], fallback.replyMode).let { if (it == "Local") "Apple" else it },
        quickReplyPoliteness = stringValue(data["quickReplyPoliteness"], fallback.quickReplyPoliteness),
        quickReplyLength = stringValue(data["quickReplyLength"], fallback.quickReplyLength),
        hasOpenAIKey = boolValue(data["hasOpenAIKey"], fallback.hasOpenAIKey),
        aiKnowledgeBase = stringValue(data["aiKnowledgeBase"], fallback.aiKnowledgeBase),
        quickReplyProducts = jsonQuickReplyTemplateItems(data["customProductsJSON"], fallback.quickReplyProducts),
        quickReplyRules = jsonQuickReplyTemplateItems(data["customRulesJSON"], fallback.quickReplyRules),
        businessType = stringValue(data["businessType"], fallback.businessType),
        businessDescriptionPrompt = stringValue(data["businessDescriptionPrompt"], fallback.businessDescriptionPrompt),
        businessOnboardingCompleted = data.containsKey("businessOnboardingCompletedAt") ||
            boolValue(data["businessOnboardingCompleted"], fallback.businessOnboardingCompleted),
        activeStatuses = jsonStringList(data["activeStatusesJSON"], fallback.activeStatuses),
        customSteps = jsonTitleList(data["customStepsJSON"], fallback.customSteps),
        customToggles = jsonTitleList(data["customTogglesJSON"], fallback.customToggles),
        customFields = jsonTitleList(data["customFieldsJSON"], fallback.customFields),
        communicationShowTelephone = boolValue(data["communicationShowTelephone"], fallback.communicationShowTelephone),
        communicationShowEmail = boolValue(data["communicationShowEmail"], fallback.communicationShowEmail),
        communicationShowAddress = boolValue(data["communicationShowAddress"], fallback.communicationShowAddress),
        communicationShowChannel = boolValue(data["communicationShowChannel"], fallback.communicationShowChannel),
        communicationShowCustomerNotes = boolValue(data["communicationShowCustomerNotes"], fallback.communicationShowCustomerNotes),
        communicationChannelLabels = jsonStringList(data["communicationChannelLabelsJSON"], fallback.communicationChannelLabels),
        specialNoteSections = jsonHeadingItems(
            data["specialNoteSectionsJSON"] ?: data["specialNoteSectionsJSONV1"],
            fallback.specialNoteSections
        ),
        repairIntakeFields = jsonGenericHeadingItems(
            data["repairIntakeFieldsJSON"],
            fallback.repairIntakeFields
        ).ifEmpty { fallback.repairIntakeFields },
        financialExpenseItems = jsonGenericHeadingItems(
            data["financialExpenseItemsJSON"],
            fallback.financialExpenseItems
        ).filter { isUsableFinancialTitle(it.title, "Cost") },
        financialRemainingItems = jsonGenericHeadingItems(
            data["financialRemainingItemsJSON"],
            fallback.financialRemainingItems
        ).filter { isUsableFinancialTitle(it.title, "Pending") },
        financialShowBaseCost = boolValue(data["financialShowBaseCost"], fallback.financialShowBaseCost),
        financialBaseCostLabel = stringValue(data["financialBaseCostLabel"], fallback.financialBaseCostLabel),
        cardColorMeaningsJSON = stringValue(data["cardColorMeaningsJSON"], fallback.cardColorMeaningsJSON),
        designNameLabel = stringValue(data["designNameLabel"], fallback.designNameLabel),
        priorityCardLabel = stringValue(data["priorityCardLabel"], fallback.priorityCardLabel),
        riskCardLabel = stringValue(data["riskCardLabel"], fallback.riskCardLabel),
        materialsDefaultChecks = jsonTitleList(data["materialsDefaultChecksJSON"], materialCheckFallback.ifEmpty { fallback.materialsDefaultChecks }),
        materialsToggles = jsonTitleList(data["materialsTogglesJSON"], fallback.materialsToggles),
        showStatusNotesSupplier = boolValue(data["showStatusNotesSupplier"], fallback.showStatusNotesSupplier),
        statusNotesSupplierLabel = stringValue(data["statusNotesSupplierLabel"], fallback.statusNotesSupplierLabel),
        showMaterialsNotesSupplier = boolValue(data["showMaterialsNotesSupplier"], fallback.showMaterialsNotesSupplier),
        materialsNotesSupplierLabel = stringValue(data["materialsNotesSupplierLabel"], fallback.materialsNotesSupplierLabel),
        scheduleQuickReminders = jsonQuickReminderTemplates(data["scheduleQuickRemindersJSON"], fallback.scheduleQuickReminders),
        summaryStep1 = stringValue(data["summaryStep1"], fallback.summaryStep1),
        summaryStep2 = stringValue(data["summaryStep2"], fallback.summaryStep2),
        orderListStep1 = stringValue(data["orderListStep1"], fallback.orderListStep1),
        orderListStep2 = stringValue(data["orderListStep2"], fallback.orderListStep2),
        orderItemsHeading = stringValue(data["orderItemsHeading"], fallback.orderItemsHeading),
        pdfShowCustomer = boolValue(data["pdfShowCustomer"], fallback.pdfShowCustomer),
        pdfShowContact = boolValue(data["pdfShowContact"], fallback.pdfShowContact),
        pdfShowPreview = boolValue(data["pdfShowPreview"], fallback.pdfShowPreview),
        pdfShowMaterials = boolValue(data["pdfShowMaterials"], fallback.pdfShowMaterials),
        pdfShowPriority = boolValue(data["pdfShowPriority"], fallback.pdfShowPriority),
        pdfShowFinCustomer = boolValue(data["pdfShowFinCustomer"], fallback.pdfShowFinCustomer),
        pdfShowPaymentMethod = boolValue(data["pdfShowPaymentMethod"], fallback.pdfShowPaymentMethod),
        pdfShowFinInternal = boolValue(data["pdfShowFinInternal"], fallback.pdfShowFinInternal),
        pdfShowStatus = boolValue(data["pdfShowStatus"], fallback.pdfShowStatus),
        pdfShowShipping = boolValue(data["pdfShowShipping"], fallback.pdfShowShipping),
        pdfShowAddress = boolValue(data["pdfShowAddress"], fallback.pdfShowAddress),
        pdfShowShippingAddress = boolValue(data["pdfShowShippingAddress"], fallback.pdfShowShippingAddress),
        companyNumbers = jsonCompanyNumbers(data["companyNumbersJSON"], fallback.companyNumbers),
        showCardPreview = boolValue(data["showCardPreview"], fallback.showCardPreview),
        showCardSummary = boolValue(data["showCardSummary"], fallback.showCardSummary),
        showCardCustomer = boolValue(data["showCardCustomer"], fallback.showCardCustomer),
        showCardCustomerNotes = boolValue(data["showCardCustomerNotes"], fallback.showCardCustomerNotes),
        showCardDelivery = boolValue(data["showCardDelivery"], fallback.showCardDelivery),
        showCardPriority = boolValue(data["showCardPriority"], fallback.showCardPriority),
        showCardMaterials = boolValue(data["showCardMaterials"], fallback.showCardMaterials),
        showCardCommunication = boolValue(data["showCardCommunication"], fallback.showCardCommunication),
        showCardNotes = boolValue(data["showCardNotes"], fallback.showCardNotes),
        showCardClientFiles = boolValue(data["showCardClientFiles"], fallback.showCardClientFiles),
        showCardTodo = boolValue(data["showCardTodo"], fallback.showCardTodo),
        showCardWorkTime = boolValue(data["showCardWorkTime"], fallback.showCardWorkTime),
        showCardFinancial = boolValue(data["showCardFinancial"], fallback.showCardFinancial),
        showCardStatus = boolValue(data["showCardStatus"], fallback.showCardStatus),
        showCardShipping = boolValue(data["showCardShipping"], fallback.showCardShipping),
        showCardSchedule = boolValue(data["showCardSchedule"], fallback.showCardSchedule),
        showCardHistoryLog = boolValue(data["showCardHistoryLog"], fallback.showCardHistoryLog),
        uploadSafetyRequirePolicyAcceptance = boolValue(
            data["uploadSafetyRequirePolicyAcceptanceV1"] ?: data["uploadSafetyRequirePolicyAcceptance"],
            fallback.uploadSafetyRequirePolicyAcceptance
        ),
        uploadSafetyMaxFileSizeMB = intValue(
            data["uploadSafetyMaxFileSizeMBV1"] ?: data["uploadSafetyMaxFileSizeMB"],
            fallback.uploadSafetyMaxFileSizeMB
        ).coerceIn(1, 50),
        orderCardShowPreviewImage = boolValue(data["orderCardShowPreviewImage"], fallback.orderCardShowPreviewImage),
        orderCardShowDeliveryTime = boolValue(data["orderCardShowDeliveryTime"], fallback.orderCardShowDeliveryTime),
        orderCardShowDesignName = boolValue(data["orderCardShowDesignName"], fallback.orderCardShowDesignName),
        orderCardShowOrderValue = boolValue(data["orderCardShowOrderValue"], fallback.orderCardShowOrderValue),
        orderCardShowUpcomingSchedule = boolValue(data["orderCardShowUpcomingSchedule"], fallback.orderCardShowUpcomingSchedule),
        orderCardShowStatusBadges = boolValue(data["orderCardShowStatusBadges"], fallback.orderCardShowStatusBadges),
        ordersSidebarWidth = doubleValue(data["ordersSidebarWidth"], fallback.ordersSidebarWidth).coerceIn(260.0, 760.0),
        ordersSidebarVisible = boolValue(data["ordersSidebarVisible"], fallback.ordersSidebarVisible),
        workspaceUserProfilesJSON = workspaceUserProfilesJSON,
        sharedWorkspaceSnapshotJSON = sharedWorkspaceSnapshotJSON,
        typeWorkspaceSnapshotsJSON = typeWorkspaceSnapshotsJSON,
        orderCardLayout = orderCardLayoutFromWorkspaceSettings(data, userId, ownerUid)
    )
}

private fun orderCardLayoutFromWorkspaceSettings(
    data: Map<String, Any>,
    userId: String,
    ownerUid: String
): OrderDetailCardLayout {
    val profileSnapshot = workspaceProfileSnapshot(data["workspaceUserProfilesJSON"], userId, ownerUid)
    val sharedSnapshot = jsonObjectValue(data["sharedWorkspaceSnapshotJSON"])
    val directSnapshot = jsonObjectValue(data["workspaceLayoutJSON"])
    return listOfNotNull(profileSnapshot, sharedSnapshot, directSnapshot)
        .firstOrNull()
        ?.let { layoutFromWorkspaceSnapshot(it) }
        ?: OrderDetailCardLayout()
}

private fun workspaceProfileSnapshot(value: Any?, userId: String, ownerUid: String): JSONObject? {
    val profiles = jsonArrayValue(value) ?: return null
    val allProfiles = List(profiles.length()) { index -> profiles.optJSONObject(index) }.filterNotNull()
    val candidates = allProfiles.filter { it.optString("snapshotJSON").isNotBlank() }
    val ownProfile = allProfiles.firstOrNull { userId.isNotBlank() && it.optString("userId") == userId }
    val ownSnapshotProfile = candidates.firstOrNull { userId.isNotBlank() && it.optString("userId") == userId }
    val syncSourceId = ownProfile?.optString("syncSourceUserId")?.trim().orEmpty()
    val syncedProfile = candidates.firstOrNull { syncSourceId.isNotBlank() && it.optString("userId") == syncSourceId }
    val ownerProfile = candidates.firstOrNull { ownerUid.isNotBlank() && it.optString("userId") == ownerUid }
    return jsonObjectValue((syncedProfile ?: ownSnapshotProfile ?: ownerProfile)?.optString("snapshotJSON"))
}

private fun layoutFromWorkspaceSnapshot(snapshot: JSONObject): OrderDetailCardLayout {
    val columns = cardColumns(snapshot.opt("kartYerlesimi")) ?: cardColumns(snapshot.opt("columns"))
    val fallbackOrder = cardOrder(snapshot.opt("cardOrder")) ?: columns?.flatten()
    val mobileOrder = cardOrder(snapshot.opt("phoneKartSirasi"))
        ?: cardOrder(snapshot.opt("mobileCardOrder"))
        ?: cardOrder(snapshot.opt("phoneCardOrder"))
        ?: fallbackOrder
    val normalizedColumns = columns ?: fallbackOrder?.let { columnsFromCardOrder(it) }
    val colors = cardStringMap(snapshot.opt("kartRenkleri")) + cardStringMap(snapshot.opt("cardColors"))
    val heights = cardIntMap(snapshot.opt("kartYukseklikleri")) + cardIntMap(snapshot.opt("cardHeights"))
    val orderHeights = orderCardIntMap(snapshot.opt("orderKartYukseklikleri")) +
        orderCardIntMap(snapshot.opt("orderCardHeights"))

    return OrderDetailCardLayout.normalized(
        columns = normalizedColumns,
        phoneOrder = mobileOrder,
        columnWidths = intList(snapshot.opt("sutunGenislikleri")) ?: intList(snapshot.opt("columnWidths")) ?: emptyList(),
        cardColors = colors,
        cardHeights = heights,
        orderCardHeights = orderHeights,
        visibility = cardBoolMap(snapshot.opt("visibility"))
    )
}

private fun columnsFromCardOrder(cardOrder: List<OrderDetailCardId>): List<List<OrderDetailCardId>> {
    return listOf(
        cardOrder.take(2),
        cardOrder.drop(2).take(5),
        cardOrder.drop(7)
    )
}

private fun cardOrder(value: Any?): List<OrderDetailCardId>? {
    val array = jsonArrayValue(value) ?: return null
    val seen = linkedSetOf<OrderDetailCardId>()
    val cards = mutableListOf<OrderDetailCardId>()
    for (index in 0 until array.length()) {
        val card = OrderDetailCardId.fromRaw(array.optString(index))
        if (card != null && seen.add(card)) cards.add(card)
    }
    return cards.ifEmpty { null }
}

private fun cardColumns(value: Any?): List<List<OrderDetailCardId>>? {
    val array = jsonArrayValue(value) ?: return null
    val columns = mutableListOf<List<OrderDetailCardId>>()
    val seen = linkedSetOf<OrderDetailCardId>()
    for (columnIndex in 0 until array.length()) {
        val rawColumn = jsonArrayValue(array.opt(columnIndex))
        val column = mutableListOf<OrderDetailCardId>()
        if (rawColumn != null) {
            for (cardIndex in 0 until rawColumn.length()) {
                val card = OrderDetailCardId.fromRaw(rawColumn.optString(cardIndex))
                if (card != null && seen.add(card)) column.add(card)
            }
        }
        columns.add(column)
    }
    return columns.takeIf { it.isNotEmpty() }
}

private fun intList(value: Any?): List<Int>? {
    val array = jsonArrayValue(value) ?: return null
    val values = mutableListOf<Int>()
    for (index in 0 until array.length()) {
        val raw = array.opt(index)
        val number = when (raw) {
            is Number -> raw.toInt()
            is String -> raw.toDoubleOrNull()?.toInt()
            else -> null
        }
        if (number != null) values.add(number)
    }
    return values.ifEmpty { null }
}

private fun cardBoolMap(value: Any?): Map<OrderDetailCardId, Boolean> {
    val output = mutableMapOf<OrderDetailCardId, Boolean>()
    forEachObjectEntry(value) { key, raw ->
        val card = OrderDetailCardId.fromRaw(key) ?: return@forEachObjectEntry
        val visible = when (raw) {
            is Boolean -> raw
            is Number -> raw.toInt() != 0
            is String -> raw.equals("true", ignoreCase = true)
            else -> null
        }
        if (visible != null) output[card] = visible
    }
    return output
}

private fun cardStringMap(value: Any?): Map<OrderDetailCardId, String> {
    val output = mutableMapOf<OrderDetailCardId, String>()
    forEachObjectEntry(value) { key, raw ->
        val card = OrderDetailCardId.fromRaw(key) ?: return@forEachObjectEntry
        val text = raw?.toString()?.trim().orEmpty()
        if (text.isNotBlank()) output[card] = text
    }
    return output
}

private fun stringBoolMap(value: Any?): Map<String, Boolean> {
    val output = mutableMapOf<String, Boolean>()
    forEachObjectEntry(value) { key, raw ->
        val cleanKey = key.trim()
        val value = when (raw) {
            is Boolean -> raw
            is Number -> raw.toInt() != 0
            is String -> raw.equals("true", ignoreCase = true)
            else -> null
        }
        if (cleanKey.isNotBlank() && value != null) output[cleanKey] = value
    }
    return output
}

private fun cardIntMap(value: Any?): Map<OrderDetailCardId, Int> {
    val output = mutableMapOf<OrderDetailCardId, Int>()
    forEachObjectEntry(value) { key, raw ->
        val card = OrderDetailCardId.fromRaw(key) ?: return@forEachObjectEntry
        val height = when (raw) {
            is Number -> raw.toInt()
            is String -> raw.toDoubleOrNull()?.toInt()
            else -> null
        }
        if (height != null && height > 0) output[card] = height
    }
    return output
}

private fun orderCardIntMap(value: Any?): Map<String, Map<OrderDetailCardId, Int>> {
    val output = mutableMapOf<String, Map<OrderDetailCardId, Int>>()
    forEachObjectEntry(value) { key, raw ->
        val orderKey = key.trim()
        val heights = cardIntMap(raw)
        if (orderKey.isNotBlank() && heights.isNotEmpty()) output[orderKey] = heights
    }
    return output
}

private fun jsonObjectValue(value: Any?): JSONObject? {
    return runCatching {
        when (value) {
            null, JSONObject.NULL -> null
            is JSONObject -> value
            is Map<*, *> -> JSONObject(value)
            is String -> value.trim().takeIf { it.isNotEmpty() }?.let { JSONObject(it) }
            else -> null
        }
    }.getOrNull()
}

private fun jsonArrayValue(value: Any?): JSONArray? {
    return runCatching {
        when (value) {
            null, JSONObject.NULL -> null
            is JSONArray -> value
            is List<*> -> JSONArray(value)
            is String -> value.trim().takeIf { it.isNotEmpty() }?.let { JSONArray(it) }
            else -> null
        }
    }.getOrNull()
}

private fun forEachObjectEntry(value: Any?, block: (String, Any?) -> Unit) {
    when (value) {
        is JSONObject -> {
            val keys = value.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                block(key, value.opt(key))
            }
        }
        is Map<*, *> -> {
            value.forEach { (key, raw) -> block(key?.toString().orEmpty(), raw) }
        }
        is String -> jsonObjectValue(value)?.let { forEachObjectEntry(it, block) }
    }
}

private fun jsonStringList(value: Any?, fallback: List<String>): List<String> {
    val raw = value as? String ?: return fallback
    return runCatching {
        val array = JSONArray(raw)
        List(array.length()) { index -> array.optString(index) }
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .ifEmpty { fallback }
    }.getOrDefault(fallback)
}

private fun jsonTitleList(value: Any?, fallback: List<String>): List<String> {
    val raw = value as? String ?: return fallback
    return runCatching {
        val array = JSONArray(raw)
        List(array.length()) { index ->
            val item = array.opt(index)
            when (item) {
                is JSONObject -> item.optString("title")
                else -> item?.toString().orEmpty()
            }
        }.map { it.trim() }.filter { it.isNotEmpty() }.ifEmpty { fallback }
    }.getOrDefault(fallback)
}

private fun jsonHeadingItems(value: Any?, fallback: List<StudioHeadingItem>): List<StudioHeadingItem> {
    val array = jsonArrayValue(value) ?: return normalizeSpecialNoteSections(fallback)
    return runCatching {
        val parsed = List(array.length()) { index ->
            val item = array.opt(index)
            when (item) {
                is JSONObject -> StudioHeadingItem(
                    id = item.optString("id").trim().ifBlank { generatedHeadingId(index, item.optString("title")) },
                    title = item.optString("title").trim()
                )
                else -> {
                    val title = item?.toString().orEmpty().trim()
                    StudioHeadingItem(generatedHeadingId(index, title), title)
                }
            }
        }
        normalizeSpecialNoteSections(parsed.ifEmpty { fallback })
    }.getOrDefault(normalizeSpecialNoteSections(fallback))
}

private fun jsonGenericHeadingItems(value: Any?, fallback: List<StudioHeadingItem>): List<StudioHeadingItem> {
    val array = jsonArrayValue(value) ?: return normalizeHeadingItems(fallback)
    return runCatching {
        val parsed = List(array.length()) { index ->
            val item = array.opt(index)
            when (item) {
                is JSONObject -> StudioHeadingItem(
                    id = item.optString("id").trim().ifBlank { generatedHeadingId(index, item.optString("title")) },
                    title = item.optString("title").trim()
                )
                else -> {
                    val title = item?.toString().orEmpty().trim()
                    StudioHeadingItem(generatedHeadingId(index, title), title)
                }
            }
        }
        normalizeHeadingItems(parsed.ifEmpty { fallback })
    }.getOrDefault(normalizeHeadingItems(fallback))
}

private fun normalizeHeadingItems(items: List<StudioHeadingItem>): List<StudioHeadingItem> {
    val cleaned = mutableListOf<StudioHeadingItem>()
    items.forEachIndexed { index, item ->
        val title = item.title.trim().take(120)
        if (title.isBlank()) return@forEachIndexed
        val id = item.id.trim().take(80).ifBlank { generatedHeadingId(index, title) }
        if (cleaned.none { existing -> existing.id.equals(id, ignoreCase = true) }) {
            cleaned.add(StudioHeadingItem(id, title))
        }
    }
    return cleaned.take(40)
}

private fun isUsableFinancialTitle(title: String, autoPrefix: String): Boolean {
    val cleaned = title.trim()
    if (cleaned.isBlank()) return false
    val marker = "$autoPrefix "
    if (!cleaned.startsWith(marker)) return true
    return cleaned.removePrefix(marker).any { !it.isDigit() }
}

private fun normalizeSpecialNoteSections(items: List<StudioHeadingItem>): List<StudioHeadingItem> {
    val cleaned = mutableListOf<StudioHeadingItem>()
    items.forEach { item ->
        val title = item.title.trim().take(120)
        if (title.isBlank()) return@forEach
        val id = item.id.trim().take(80).ifBlank { generatedHeadingId(cleaned.size, title) }
        if (cleaned.none { existing -> existing.id.equals(id, ignoreCase = true) }) {
            cleaned.add(StudioHeadingItem(id, title))
        }
    }

    val primaryIndex = cleaned.indexOfFirst { it.id.equals(STUDIO_PRIMARY_SPECIAL_NOTE_ID, ignoreCase = true) }
    val primary = if (primaryIndex >= 0) {
        cleaned.removeAt(primaryIndex).let { it.copy(id = STUDIO_PRIMARY_SPECIAL_NOTE_ID, title = it.title.ifBlank { "Special Notes" }) }
    } else {
        StudioHeadingItem(STUDIO_PRIMARY_SPECIAL_NOTE_ID, "Special Notes")
    }
    cleaned.add(0, primary)
    return cleaned.take(40)
}

private fun generatedHeadingId(index: Int, title: String): String {
    val slug = title
        .lowercase(Locale.UK)
        .replace(Regex("[^a-z0-9]+"), "-")
        .trim('-')
        .ifBlank { "note" }
    return "android-note-$index-$slug".take(80)
}

private fun jsonCompanyNumbers(value: Any?, fallback: List<StudioCompanyNumber>): List<StudioCompanyNumber> {
    val raw = value as? String ?: return fallback
    return runCatching {
        val array = JSONArray(raw)
        List(array.length()) { index ->
            val item = array.optJSONObject(index) ?: JSONObject()
            StudioCompanyNumber(
                title = item.optString("title").trim().ifEmpty { "Number" },
                value = item.optString("value").trim()
            )
        }.ifEmpty { fallback }
    }.getOrDefault(fallback)
}

private fun jsonQuickReplyTemplateItems(value: Any?, fallback: List<QuickReplyTemplateItem>): List<QuickReplyTemplateItem> {
    val raw = value as? String ?: return fallback
    return runCatching {
        val array = JSONArray(raw)
        List(array.length()) { index ->
            val item = array.optJSONObject(index) ?: JSONObject()
            QuickReplyTemplateItem(
                id = item.optString("id").trim().ifEmpty { "quick-reply-template-$index" },
                title = item.optString("title").trim(),
                desc = item.optString("desc").trim()
            )
        }.filter { it.title.isNotBlank() || it.desc.isNotBlank() }.ifEmpty { fallback }
    }.getOrDefault(fallback)
}

private fun jsonQuickReminderTemplates(value: Any?, fallback: List<StudioQuickReminderTemplate>): List<StudioQuickReminderTemplate> {
    val array = jsonArrayValue(value) ?: return fallback
    return runCatching {
        val parsed = List(array.length()) { index ->
            val item = array.opt(index)
            when (item) {
                is JSONObject -> StudioQuickReminderTemplate(
                    id = item.optString("id").trim().ifBlank { "quick-reminder-$index" },
                    title = item.optString("title").trim(),
                    days = item.optInt("days", 1).coerceIn(0, 365),
                    hours = item.optInt("hours", 0).coerceIn(0, 23),
                    priority = reminderPriority(item.optString("priority")),
                    notify = item.opt("notify")?.let { raw ->
                        when (raw) {
                            is Boolean -> raw
                            is String -> raw.equals("true", ignoreCase = true)
                            else -> true
                        }
                    } ?: true
                )
                else -> {
                    val title = item?.toString().orEmpty().trim()
                    StudioQuickReminderTemplate("quick-reminder-$index", title)
                }
            }
        }
        parsed
            .filter { it.title.isNotBlank() }
            .distinctBy { it.title.trim().lowercase(Locale.UK) }
            .take(20)
            .ifEmpty { fallback }
    }.getOrDefault(fallback)
}

private fun reminderPriority(value: String): String {
    return when (value.trim().lowercase(Locale.UK)) {
        "low" -> "Low"
        "high" -> "High"
        "urgent" -> "Urgent"
        else -> "Normal"
    }
}

private fun orderMapFromBackup(companyId: String, item: JSONObject): Map<String, Any> {
    val date = parseDate(item.optString("paymentDate"))
    return mapOf(
        "companyId" to companyId,
        "customerName" to item.optString("customerName", "Imported Project"),
        "designName" to item.optString("designName", ""),
        "designLink" to item.optString("designLink", ""),
        "watchRef" to item.optString("watchRef", ""),
        "paymentDate" to date,
        "deliveryTime" to item.optInt("deliveryTime", 1),
        "paidAmount" to item.optDouble("paidAmount", 0.0),
        "remainingAmount" to item.optDouble("remainingAmount", 0.0),
        "watchPurchasePrice" to item.optDouble("watchPurchasePrice", 0.0),
        "paymentFee" to item.optDouble("paymentFee", 0.0),
        "deliveryCost" to item.optDouble("deliveryCost", 0.0),
        "taxRate" to item.optDouble("taxRate", 0.0),
        "taxAmount" to item.optDouble("taxAmount", 0.0),
        "taxType" to item.optString("taxType", ""),
        "paymentMethod" to item.optString("paymentMethod", "Card"),
        "status" to item.optString("status", "Not Yet"),
        "designStatus" to item.optString("designStatus", "Not Yet"),
        "priority" to item.optString("priority", "Normal"),
        "risk" to item.optString("risk", "None"),
        "riskReason" to item.optString("riskReason", "-"),
        "invBool1" to item.optBoolean("invBool1", false),
        "invBool2" to item.optBoolean("invBool2", false),
        "invBool3" to item.optBoolean("invBool3", false),
        "invBool4" to item.optBoolean("invBool4", false),
        "invNotes" to item.optString("invNotes", ""),
        "emailAddress" to item.optString("emailAddress", ""),
        "instagramUsername" to item.optString("instagramUsername", ""),
        "whatsappNumber" to item.optString("whatsappNumber", ""),
        "notes" to item.optString("notes", ""),
        "trackingNumber" to item.optString("trackingNumber", ""),
        "courier" to item.optString("courier", "Auto Detect"),
        "isDispatched" to item.optBoolean("isDispatched", false),
        "isDelivered" to item.optBoolean("isDelivered", false),
        "customFields" to (item.optJSONObject("customFields")?.let { jsonObjectToMap(it) } ?: emptyMap<String, Any>()),
        "customToggles" to (item.optJSONObject("customToggles")?.let { jsonObjectToMap(it) } ?: emptyMap<String, Any>()),
        "createdAt" to FieldValue.serverTimestamp(),
        "updatedAt" to FieldValue.serverTimestamp()
    )
}

data class ImportBackupResult(
    val importedOrders: Int,
    val importedCustomers: Int,
    val skippedDuplicateOrders: Int,
    val skippedDuplicateCustomers: Int,
    val droppedOrders: Int,
    val droppedCustomers: Int,
    val message: String
)

data class ImportBackupPreview(
    val fileOrders: Int,
    val fileCustomers: Int,
    val existingOrders: Int,
    val likelyDuplicateOrders: Int,
    val likelyDuplicateCustomers: Int,
    val droppedOrders: Int,
    val droppedCustomers: Int,
    val truncated: Boolean
)

private fun jsonObjectToMap(value: JSONObject): Map<String, Any> {
    val output = mutableMapOf<String, Any>()
    val keys = value.keys()
    while (keys.hasNext()) {
        val key = keys.next()
        val mapped = jsonValueToFirestore(value.opt(key)) ?: continue
        output[key] = mapped
    }
    return output
}

private fun jsonValueToFirestore(value: Any?): Any? {
    return when (value) {
        null, JSONObject.NULL -> null
        is JSONObject -> jsonObjectToMap(value)
        is JSONArray -> List(value.length()) { index -> jsonValueToFirestore(value.opt(index)) }.filterNotNull()
        is String, is Boolean, is Int, is Long, is Double, is Float -> value
        else -> value.toString()
    }
}

private fun parseDate(raw: String): Date {
    return runCatching { Date.from(Instant.parse(raw)) }.getOrDefault(Date())
}

private fun normalizeRole(value: String): String {
    return when (value.trim().lowercase().replace("_", "").replace("-", "").replace(" ", "")) {
        "owner" -> "owner"
        "admin" -> "admin"
        "viewer", "viewonly", "readonly" -> "viewer"
        "workflow", "workflowonly" -> "workflow"
        else -> "member"
    }
}

private fun roleLabel(role: String): String {
    return when (normalizeRole(role)) {
        "owner" -> "Owner"
        "admin" -> "Admin"
        "viewer" -> "View Only"
        "workflow" -> "Workflow Only"
        else -> "Member"
    }
}

private fun stringValue(value: Any?, fallback: String): String {
    return (value as? String)?.trim().orEmpty().ifEmpty { fallback }
}

private fun boolValue(value: Any?, fallback: Boolean): Boolean {
    return value as? Boolean ?: fallback
}

private fun doubleValue(value: Any?, fallback: Double): Double {
    return when (value) {
        is Number -> value.toDouble()
        is String -> value.toDoubleOrNull() ?: fallback
        else -> fallback
    }
}

private fun dateFromAny(value: Any?): Date? {
    return when (value) {
        is com.google.firebase.Timestamp -> value.toDate()
        is Date -> value
        is Number -> Date(value.toLong())
        is String -> runCatching { Date.from(Instant.parse(value)) }.getOrNull()
        else -> null
    }
}

private fun normalizeRoleForTeamAccess(value: String): String {
    val clean = value.trim()
    if (Regex("^custom_[A-Za-z0-9_-]{6,64}$").matches(clean)) return clean
    return normalizeRole(clean)
}

private fun customRoles(data: Map<String, Any>): List<StudioCustomRole> {
    val rawRoles = data["customRoles"] as? Map<*, *> ?: return emptyList()
    return rawRoles.mapNotNull { (id, value) ->
        val roleId = id.toString().trim()
        val raw = value as? Map<*, *> ?: return@mapNotNull null
        if (!Regex("^custom_[A-Za-z0-9_-]{6,64}$").matches(roleId)) return@mapNotNull null
        StudioCustomRole(
            id = roleId,
            name = stringValue(raw["name"], "Custom Role"),
            baseRole = normalizeRole(stringValue(raw["baseRole"], "member")),
            access = accessFromMap(raw["access"] as? Map<*, *> ?: emptyMap<Any, Any>())
        )
    }
}

private fun defaultAccessMapForRole(roleValue: String): Map<String, Any?> {
    return if (normalizeRole(roleValue) == "workflow") {
        mapOf(
            "dashboard" to false,
            "financialInfo" to false,
            "teamAccess" to false,
            "cardFinancial" to false,
            "assignedProjectsOnly" to true,
            "manageProjectAssignments" to false,
            "orders" to true,
            "schedule" to true,
            "quickReply" to true,
            "clientFiles" to true,
            "cardClientFiles" to true
        )
    } else {
        emptyMap()
    }
}

private fun accessFromMap(value: Map<*, *>, forceFullAccess: Boolean = false): WorkspaceMemberAccess {
    if (forceFullAccess) return WorkspaceMemberAccess(bankFeed = true)
    return WorkspaceMemberAccess(
        orders = boolValue(value["orders"], true),
        dashboard = boolValue(value["dashboard"], true),
        schedule = boolValue(value["schedule"], true),
        customers = boolValue(value["customers"], true),
        messages = boolValue(value["messages"], true),
        teamChat = boolValue(value["teamChat"], true),
        notes = boolValue(value["notes"], true),
        quickReply = boolValue(value["quickReply"], true),
        settings = boolValue(value["settings"], true),
        teamAccess = boolValue(value["teamAccess"], true),
        clientFiles = boolValue(value["clientFiles"], true),
        financialInfo = boolValue(value["financialInfo"], true),
        bankFeed = boolValue(value["bankFeed"], false),
        exportData = boolValue(value["exportData"], true),
        settingsGeneral = boolValue(value["settingsGeneral"], true),
        settingsPdf = boolValue(value["settingsPdf"], true),
        settingsQuickReply = boolValue(value["settingsQuickReply"], true),
        settingsMessageSettings = boolValue(value["settingsMessageSettings"], true),
        settingsWorkflow = boolValue(value["settingsWorkflow"], true),
        settingsFinancial = boolValue(value["settingsFinancial"], true),
        settingsSafetyUploads = boolValue(value["settingsSafetyUploads"], true),
        settingsData = boolValue(value["settingsData"], true),
        settingsTeamAccess = boolValue(value["settingsTeamAccess"], true),
        settingsPlanAccess = boolValue(value["settingsPlanAccess"], true),
        settingsSupport = boolValue(value["settingsSupport"], true),
        assignedProjectsOnly = boolValue(value["assignedProjectsOnly"], false),
        manageProjectAssignments = boolValue(value["manageProjectAssignments"], false),
        cardPreview = boolValue(value["cardPreview"], true),
        cardSummary = boolValue(value["cardSummary"], true),
        cardCustomer = boolValue(value["cardCustomer"], true),
        cardMaterials = boolValue(value["cardMaterials"], true),
        cardPriority = boolValue(value["cardPriority"], true),
        cardDelivery = boolValue(value["cardDelivery"], true),
        cardNotes = boolValue(value["cardNotes"], true),
        cardClientFiles = boolValue(value["cardClientFiles"], true),
        cardTodo = boolValue(value["cardTodo"], true),
        cardWorkTime = boolValue(value["cardWorkTime"], true),
        cardFinancial = boolValue(value["cardFinancial"], true),
        cardStatus = boolValue(value["cardStatus"], true),
        cardShipping = boolValue(value["cardShipping"], true),
        cardSchedule = boolValue(value["cardSchedule"], true),
        cardHistoryLog = boolValue(value["cardHistoryLog"], true),
        deleteClientFiles = boolValue(value["deleteClientFiles"], true)
    )
}

private fun accessToMap(access: WorkspaceMemberAccess): Map<String, Boolean> {
    return mapOf(
        "orders" to access.orders,
        "dashboard" to access.dashboard,
        "schedule" to access.schedule,
        "customers" to access.customers,
        "messages" to access.messages,
        "teamChat" to access.teamChat,
        "notes" to access.notes,
        "quickReply" to access.quickReply,
        "settings" to access.settings,
        "teamAccess" to access.teamAccess,
        "clientFiles" to access.clientFiles,
        "financialInfo" to access.financialInfo,
        "bankFeed" to access.bankFeed,
        "exportData" to access.exportData,
        "settingsGeneral" to access.settingsGeneral,
        "settingsPdf" to access.settingsPdf,
        "settingsQuickReply" to access.settingsQuickReply,
        "settingsMessageSettings" to access.settingsMessageSettings,
        "settingsWorkflow" to access.settingsWorkflow,
        "settingsFinancial" to access.settingsFinancial,
        "settingsSafetyUploads" to access.settingsSafetyUploads,
        "settingsData" to access.settingsData,
        "settingsTeamAccess" to access.settingsTeamAccess,
        "settingsPlanAccess" to access.settingsPlanAccess,
        "settingsSupport" to access.settingsSupport,
        "assignedProjectsOnly" to access.assignedProjectsOnly,
        "manageProjectAssignments" to access.manageProjectAssignments,
        "cardPreview" to access.cardPreview,
        "cardSummary" to access.cardSummary,
        "cardCustomer" to access.cardCustomer,
        "cardMaterials" to access.cardMaterials,
        "cardPriority" to access.cardPriority,
        "cardDelivery" to access.cardDelivery,
        "cardNotes" to access.cardNotes,
        "cardClientFiles" to access.cardClientFiles,
        "cardTodo" to access.cardTodo,
        "cardWorkTime" to access.cardWorkTime,
        "cardFinancial" to access.cardFinancial,
        "cardStatus" to access.cardStatus,
        "cardShipping" to access.cardShipping,
        "cardSchedule" to access.cardSchedule,
        "cardHistoryLog" to access.cardHistoryLog
    )
}

private fun intValue(value: Any?, fallback: Int): Int {
    return when (value) {
        is Number -> value.toInt()
        is String -> value.toIntOrNull() ?: fallback
        else -> fallback
    }
}

private fun stringSetValue(value: Any?): Set<String> {
    val items = value as? List<*> ?: return emptySet()
    return items.mapNotNull { item -> stringValue(item, "").takeIf { it.isNotBlank() } }.toSet()
}

private fun requireImageBytes(bytes: ByteArray, maxMb: Int, message: String) {
    if (bytes.isEmpty()) error("Selected image could not be read.")
    if (bytes.size > maxMb * 1024 * 1024) error(message)
}

private fun requireClientFileBytes(bytes: ByteArray, maxMb: Int) {
    if (bytes.isEmpty()) error("Selected file could not be read.")
    if (bytes.size > maxMb * 1024 * 1024) error("Choose a Client Files item under $maxMb MB.")
}

private fun cleanClientFileName(value: String): String {
    return value.trim()
        .substringAfterLast("/")
        .substringAfterLast("\\")
        .replace(Regex("[\\r\\n]"), " ")
        .take(180)
        .ifBlank { "Client file" }
}

private fun cleanClientFileContentType(fileName: String, value: String): String {
    val extension = fileName.substringAfterLast(".", "").lowercase()
    val clean = value.trim().lowercase()
    return when {
        clean in setOf("application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif") ->
            if (clean == "image/jpg") "image/jpeg" else clean
        extension == "pdf" -> "application/pdf"
        extension == "zip" -> "application/zip"
        extension in setOf("jpg", "jpeg") -> "image/jpeg"
        extension == "png" -> "image/png"
        extension == "webp" -> "image/webp"
        extension == "heic" -> "image/heic"
        extension == "heif" -> "image/heif"
        extension in setOf("psd", "psb") -> "application/octet-stream"
        else -> error("Client Files accepts PDF, JPG, PNG, HEIC, HEIF, WEBP, PSD, PSB and ZIP.")
    }
}

private fun extensionForClientFile(fileName: String, contentType: String): String {
    val extension = fileName.substringAfterLast(".", "").lowercase()
    if (extension in setOf("pdf", "jpg", "jpeg", "png", "webp", "heic", "heif", "psd", "psb")) {
        return if (extension == "jpeg") "jpg" else extension
    }
    return when (contentType) {
        "application/pdf" -> "pdf"
        "image/png" -> "png"
        "image/webp" -> "webp"
        "image/heic" -> "heic"
        "image/heif" -> "heif"
        else -> "jpg"
    }
}

private fun safeStorageSegment(value: String): String {
    return value.trim().replace(Regex("[^A-Za-z0-9_-]"), "_").ifBlank { UUID.randomUUID().toString() }
}

private fun cleanImageContentType(value: String): String {
    val clean = value.trim().lowercase()
    return when (clean) {
        "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif" -> if (clean == "image/jpg") "image/jpeg" else clean
        else -> "image/jpeg"
    }
}

private fun extensionForImageContentType(contentType: String): String {
    return when (contentType) {
        "image/png" -> "png"
        "image/webp" -> "webp"
        "image/heic" -> "heic"
        "image/heif" -> "heif"
        else -> "jpg"
    }
}

private fun messageThreadFromDocument(
    id: String,
    data: Map<String, Any?>,
    fallbackCompanyId: String,
    currentUid: String
): StudioMessageThread {
    val memberUids = (data["memberUids"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList()
    val memberEmails = (data["memberEmails"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList()
    val pinnedIds = (data["pinnedMessageIds"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList()
    val readBy = messageDateMap(data["readBy"])
    val mutedUntilBy = messageDateMap(data["mutedUntilBy"])
    val lastMessageAt = messageDateFromAny(data["lastMessageAt"])
    val type = stringValue(data["type"], if (id == "team") "team" else "direct")
    val lastMessageByUid = stringValue(data["lastMessageByUid"], "")
    val isUnread = if (currentUid.isNotBlank() && lastMessageAt != null && lastMessageByUid != currentUid) {
        val lastReadAt = readBy[currentUid]?.time ?: 0L
        lastMessageAt.time > lastReadAt
    } else {
        false
    }
    return StudioMessageThread(
        id = id,
        companyId = stringValue(data["companyId"], fallbackCompanyId),
        type = type,
        title = stringValue(data["title"], if (type == "team") "Team Chat" else ""),
        memberUids = memberUids,
        memberEmails = memberEmails,
        lastMessageText = stringValue(data["lastMessageText"] ?: data["lastMessagePreview"], ""),
        lastMessageAt = lastMessageAt,
        lastMessageByUid = lastMessageByUid,
        lastMessageByName = stringValue(data["lastMessageByName"], ""),
        lastMessageByPhotoURL = stringValue(data["lastMessageByPhotoURL"], ""),
        readBy = readBy,
        mutedUntilBy = mutedUntilBy,
        pinnedMessageIds = pinnedIds,
        isUnread = isUnread
    )
}

private fun messageItemFromDocument(
    id: String,
    data: Map<String, Any?>,
    threadId: String,
    currentUid: String
): StudioMessageItem? {
    val hiddenForUids = (data["hiddenForUids"] as? List<*>)?.mapNotNull { it as? String }
        ?: (data["deletedForUids"] as? List<*>)?.mapNotNull { it as? String }
        ?: (data["hiddenFor"] as? List<*>)?.mapNotNull { it as? String }
        ?: emptyList()
    if (currentUid.isNotBlank() && hiddenForUids.contains(currentUid)) return null

    val deletedForEveryone = (data["deletedForEveryone"] as? Boolean) ?: (data["isDeleted"] as? Boolean) ?: false
    val rawType = stringValue(data["type"], "text")
    val type = if (deletedForEveryone) "deleted" else rawType
    val text = if (deletedForEveryone) "" else stringValue(data["text"] ?: data["message"], "")
    val fileName = if (deletedForEveryone) "" else stringValue(data["fileName"], "")
    val fileURL = if (deletedForEveryone) "" else stringValue(data["fileURL"], "")
    val fileType = if (deletedForEveryone) "" else stringValue(data["fileType"], "")
    val fileSize = if (deletedForEveryone) 0L else longFromAny(data["fileSize"], 0L)

    return StudioMessageItem(
        id = id,
        threadId = stringValue(data["threadId"], threadId),
        text = text,
        senderUid = stringValue(data["senderUid"], ""),
        senderEmail = stringValue(data["senderEmail"], ""),
        senderName = stringValue(data["senderName"], stringValue(data["senderEmail"], "")),
        senderPhotoURL = stringValue(data["senderPhotoURL"] ?: data["senderAvatarURL"], ""),
        createdAt = messageDateFromAny(data["createdAt"]) ?: Date(),
        type = type,
        fileName = fileName,
        fileURL = fileURL,
        fileType = fileType,
        fileSize = fileSize,
        deletedForEveryone = deletedForEveryone,
        deletedByUid = stringValue(data["deletedByUid"], ""),
        deletedAt = messageDateFromAny(data["deletedAt"]),
        pinned = (data["pinned"] as? Boolean) ?: false,
        pinnedByUid = stringValue(data["pinnedByUid"], ""),
        pinnedByName = stringValue(data["pinnedByName"], ""),
        pinnedAt = messageDateFromAny(data["pinnedAt"]),
        replyToMessageId = stringValue(data["replyToMessageId"], ""),
        replyToText = stringValue(data["replyToText"], ""),
        replyToSenderName = stringValue(data["replyToSenderName"], ""),
        replyToSenderUid = stringValue(data["replyToSenderUid"], ""),
        replyToFileName = stringValue(data["replyToFileName"], ""),
        replyToType = stringValue(data["replyToType"], ""),
        reactions = messageReactionMap(data["reactions"]),
        mentionedUids = (data["mentionedUids"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList(),
        edited = (data["edited"] as? Boolean) ?: false,
        editedAt = messageDateFromAny(data["editedAt"]),
        editedByUid = stringValue(data["editedByUid"], "")
    )
}

private fun sortedMessageThreadsForDisplay(threads: List<StudioMessageThread>): List<StudioMessageThread> {
    val team = threads.filter { it.id == "team" }.sortedBy { it.id }
    val others = threads.filter { it.id != "team" }.sortedWith(
        compareByDescending<StudioMessageThread> { it.lastMessageAt?.time ?: 0L }.thenBy { it.id }
    )
    return team + others
}

private fun messageDateFromAny(value: Any?): Date? {
    return when (value) {
        null -> null
        is com.google.firebase.Timestamp -> value.toDate()
        is Date -> value
        is Number -> {
            val raw = value.toLong()
            if (raw <= 0L) null else if (raw > 1_000_000_000_000L) Date(raw) else Date(raw * 1000L)
        }
        is Map<*, *> -> {
            val seconds = (value["seconds"] ?: value["_seconds"]) as? Number
            seconds?.let { Date(it.toLong() * 1000L) }
        }
        is String -> {
            // Tolerate ISO strings AND stringified epoch numbers (seconds or
            // millis) — reminderDate has arrived in both shapes historically.
            val trimmed = value.trim()
            runCatching { Date.from(Instant.parse(trimmed)) }.getOrNull()
                ?: trimmed.toDoubleOrNull()?.let { raw ->
                    val millis = if (raw > 1_000_000_000_000.0) raw.toLong() else (raw * 1000.0).toLong()
                    if (millis <= 0L) null else Date(millis)
                }
        }
        else -> null
    }
}

private fun messageDateMap(value: Any?): Map<String, Date> {
    val raw = value as? Map<*, *> ?: return emptyMap()
    val output = mutableMapOf<String, Date>()
    raw.forEach { (key, rawValue) ->
        val uid = key as? String ?: return@forEach
        val date = messageDateFromAny(rawValue) ?: return@forEach
        output[uid] = date
    }
    return output
}

private fun messageReactionMap(value: Any?): Map<String, Map<String, String>> {
    val raw = value as? Map<*, *> ?: return emptyMap()
    val output = mutableMapOf<String, Map<String, String>>()
    raw.forEach { (emojiKey, emojiValue) ->
        val emoji = (emojiKey as? String)?.trim() ?: return@forEach
        if (emoji.isEmpty()) return@forEach
        val users = emojiValue as? Map<*, *> ?: return@forEach
        val parsed = mutableMapOf<String, String>()
        users.forEach { (uidKey, nameValue) ->
            val uid = (uidKey as? String)?.trim() ?: return@forEach
            if (uid.isEmpty()) return@forEach
            val name = when (nameValue) {
                is String -> nameValue
                is Map<*, *> -> (nameValue["name"] as? String) ?: (nameValue["email"] as? String) ?: uid
                else -> uid
            }
            parsed[uid] = name
        }
        if (parsed.isNotEmpty()) output[emoji] = parsed
    }
    return output
}

private fun activityNotificationFromDocument(id: String, data: Map<String, Any?>): StudioActivityNotification {
    return StudioActivityNotification(
        id = id,
        companyId = stringValue(data["companyId"], ""),
        type = stringValue(data["type"], "update"),
        title = stringValue(data["title"], "Notification"),
        message = stringValue(data["message"] ?: data["body"], ""),
        route = stringValue(data["route"], ""),
        orderId = stringValue(data["orderId"], ""),
        ticketId = stringValue(data["ticketId"], ""),
        ticketType = stringValue(data["ticketType"], ""),
        threadId = stringValue(data["threadId"], ""),
        messageId = stringValue(data["messageId"], ""),
        senderUid = stringValue(data["senderUid"], ""),
        senderName = stringValue(data["senderName"], ""),
        senderEmail = stringValue(data["senderEmail"], ""),
        senderPhotoURL = stringValue(data["senderPhotoURL"] ?: data["imageUrl"], ""),
        priority = stringValue(data["priority"], ""),
        status = stringValue(data["status"], ""),
        source = stringValue(data["source"], ""),
        recipientUids = (data["recipientUids"] as? List<*>)?.mapNotNull { it as? String }
            ?: (data["recipients"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList(),
        recipientEmails = (data["recipientEmails"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList(),
        readBy = messageDateMap(data["readBy"]),
        dismissedBy = messageDateMap(data["dismissedBy"]),
        createdAt = messageDateFromAny(data["createdAt"])
    )
}

private fun longFromAny(value: Any?, fallback: Long): Long {
    return when (value) {
        is Long -> value
        is Int -> value.toLong()
        is Double -> value.toLong()
        is Float -> value.toLong()
        is String -> value.toLongOrNull() ?: fallback
        else -> fallback
    }
}
