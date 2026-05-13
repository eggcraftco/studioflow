package uk.co.eggcraft.studioflow.data.firebase

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
import uk.co.eggcraft.studioflow.data.model.OrderDetailCardId
import uk.co.eggcraft.studioflow.data.model.OrderDetailCardLayout
import uk.co.eggcraft.studioflow.data.model.QuickReplyTemplateItem
import uk.co.eggcraft.studioflow.data.model.STUDIO_PRIMARY_SPECIAL_NOTE_ID
import uk.co.eggcraft.studioflow.data.model.StudioBillingPlan
import uk.co.eggcraft.studioflow.data.model.StudioCompanyNumber
import uk.co.eggcraft.studioflow.data.model.StudioCustomRole
import uk.co.eggcraft.studioflow.data.model.StudioHeadingItem
import uk.co.eggcraft.studioflow.data.model.StudioJoinRequest
import uk.co.eggcraft.studioflow.data.model.StudioOrder
import uk.co.eggcraft.studioflow.data.model.StudioQuickReminderTemplate
import uk.co.eggcraft.studioflow.data.model.StudioTeamMember
import uk.co.eggcraft.studioflow.data.model.StudioTeamAccessSnapshot
import uk.co.eggcraft.studioflow.data.model.StudioWorkspace
import uk.co.eggcraft.studioflow.data.model.StudioWorkspaceSettings
import uk.co.eggcraft.studioflow.data.model.WorkspaceMemberAccess
import java.time.Instant
import java.util.Date
import java.util.Locale
import java.util.UUID

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

    suspend fun signInWithGoogleIdToken(idToken: String) {
        val credential = GoogleAuthProvider.getCredential(idToken, null)
        auth.signInWithCredential(credential).await()
    }

    fun signOut() {
        auth.signOut()
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
        val data = companyDoc.data.orEmpty()
        val userData = userDoc.data.orEmpty()
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
        userRef.set(userPayload, SetOptions.merge()).await()

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
            companyRef.set(payload, SetOptions.merge()).await()
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
        ).await()
    }

    fun workspaceSettingsFlow(
        workspaceId: String,
        userId: String = "",
        ownerUid: String = ""
    ): Flow<StudioWorkspaceSettings> = callbackFlow {
        val registration = db.collection("companySettings").document(workspaceId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                trySend(workspaceSettings(snapshot?.data.orEmpty(), userId, ownerUid))
            }
        awaitClose { registration.remove() }
    }

    fun ordersFlow(workspace: StudioWorkspace, user: FirebaseUser): Flow<List<StudioOrder>> = callbackFlow {
        val registration = db.collection("siparisler")
            .whereEqualTo("companyId", workspace.id)
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
        functions.getHttpsCallable("deleteWebOrder")
            .call(
                mapOf(
                    "companyId" to workspace.id,
                    "orderId" to order.id
                )
            )
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
                        "storagePath" to ref.path,
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

    suspend fun updateWorkspaceSettings(workspace: StudioWorkspace, updates: Map<String, Any?>) {
        val cleanUpdates = updates.toMutableMap()
        cleanUpdates["settingsUpdatedAt"] = FieldValue.serverTimestamp()
        db.collection("companySettings").document(workspace.id)
            .set(cleanUpdates, com.google.firebase.firestore.SetOptions.merge())
            .await()
    }

    suspend fun updateWorkspaceBillingPlan(workspace: StudioWorkspace, plan: StudioBillingPlan): String {
        if (!workspace.isOwner) {
            error("Only the workspace owner can change the plan.")
        }
        db.collection("companies").document(workspace.id)
            .set(
                mapOf(
                    "billingPlan" to plan.raw,
                    "billingPlanName" to plan.title,
                    "billingPlanSource" to "manual_workspace",
                    "billingStorageLimitMB" to plan.storageLimitMb,
                    "billingTeamMemberLimit" to plan.teamMemberLimit,
                    "billingUpdatedAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp()
                ),
                com.google.firebase.firestore.SetOptions.merge()
            )
            .await()
        return "Plan updated to ${plan.title}."
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
        return data?.get("message") as? String ?: "Email updated. You can change it again after 10 days."
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

    suspend fun importBackup(workspace: StudioWorkspace, rawJson: String): Int {
        val root = JSONObject(rawJson)
        val orders = root.optJSONArray("siparisler") ?: root.optJSONArray("orders") ?: JSONArray()
        val customers = root.optJSONArray("musteriler") ?: root.optJSONArray("customers") ?: JSONArray()
        val settings = root.optJSONObject("settings")
        var imported = 0
        var batch = db.batch()
        var batchSize = 0
        for (index in 0 until orders.length()) {
            val item = orders.optJSONObject(index) ?: continue
            val ref = db.collection("siparisler").document()
            batch.set(ref, orderMapFromBackup(workspace.id, item))
            imported += 1
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
        batch = db.batch()
        batchSize = 0
        for (index in 0 until customers.length()) {
            val item = customers.optJSONObject(index) ?: continue
            val ref = db.collection("musteriler").document()
            batch.set(
                ref,
                jsonObjectToMap(item).toMutableMap().apply {
                    put("companyId", workspace.id)
                    put("importedAt", FieldValue.serverTimestamp())
                    put("updatedAt", FieldValue.serverTimestamp())
                }
            )
            imported += 1
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
        if (settings != null) {
            db.collection("companySettings").document(workspace.id)
                .set(
                    jsonObjectToMap(settings).toMutableMap().apply {
                        put("settingsUpdatedAt", FieldValue.serverTimestamp())
                        put("settingsImportedAt", FieldValue.serverTimestamp())
                    },
                    com.google.firebase.firestore.SetOptions.merge()
                )
                .await()
        }
        return imported
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
        return accessFromMap(mergedAccess)
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
        selectedLanguage = stringValue(data["seciliDil"], fallback.selectedLanguage),
        selectedCurrency = stringValue(data["seciliParaBirimi"], fallback.selectedCurrency),
        selectedDecimalSeparator = stringValue(data["seciliOndalik"], fallback.selectedDecimalSeparator),
        feePercentage = doubleValue(data["feePercentage"], fallback.feePercentage).coerceIn(0.0, 100.0),
        defaultTaxRate = doubleValue(data["defaultTaxRate"], fallback.defaultTaxRate).coerceIn(0.0, 100.0),
        taxCalculationType = stringValue(data["taxCalculationType"], fallback.taxCalculationType).let {
            if (it.equals("Profit", ignoreCase = true)) "Profit" else "Revenue"
        },
        taxMilestoneEnabled = boolValue(data["taxMilestoneEnabled"], fallback.taxMilestoneEnabled),
        taxMilestoneDate = doubleValue(data["taxMilestoneDate"], fallback.taxMilestoneDate),
        taxRuleNameRevenue = stringValue(data["taxRuleNameRevenue"], fallback.taxRuleNameRevenue),
        taxRuleNameProfit = stringValue(data["taxRuleNameProfit"], fallback.taxRuleNameProfit),
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
        openAIKey = stringValue(data["openAIKey"], fallback.openAIKey),
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
            "cardFinancial" to false
        )
    } else {
        emptyMap()
    }
}

private fun accessFromMap(value: Map<*, *>, forceFullAccess: Boolean = false): WorkspaceMemberAccess {
    if (forceFullAccess) return WorkspaceMemberAccess()
    return WorkspaceMemberAccess(
        orders = boolValue(value["orders"], true),
        dashboard = boolValue(value["dashboard"], true),
        schedule = boolValue(value["schedule"], true),
        customers = boolValue(value["customers"], true),
        quickReply = boolValue(value["quickReply"], true),
        settings = boolValue(value["settings"], true),
        teamAccess = boolValue(value["teamAccess"], true),
        clientFiles = boolValue(value["clientFiles"], true),
        financialInfo = boolValue(value["financialInfo"], true),
        exportData = boolValue(value["exportData"], true),
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
        cardHistoryLog = boolValue(value["cardHistoryLog"], true)
    )
}

private fun accessToMap(access: WorkspaceMemberAccess): Map<String, Boolean> {
    return mapOf(
        "orders" to access.orders,
        "dashboard" to access.dashboard,
        "schedule" to access.schedule,
        "customers" to access.customers,
        "quickReply" to access.quickReply,
        "settings" to access.settings,
        "teamAccess" to access.teamAccess,
        "clientFiles" to access.clientFiles,
        "financialInfo" to access.financialInfo,
        "exportData" to access.exportData,
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
        extension in setOf("jpg", "jpeg") -> "image/jpeg"
        extension == "png" -> "image/png"
        extension == "webp" -> "image/webp"
        extension == "heic" -> "image/heic"
        extension == "heif" -> "image/heif"
        extension in setOf("psd", "psb") -> "application/octet-stream"
        else -> error("Client Files accepts PDF, JPG, PNG, HEIC, HEIF, WEBP, PSD and PSB.")
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
