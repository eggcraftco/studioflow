import Foundation
import FirebaseAuth
import FirebaseFirestore
import FirebaseCore
#if canImport(StoreKit)
import StoreKit
#endif
#if canImport(FirebaseFunctions)
import FirebaseFunctions
#endif
#if canImport(FirebaseAnalytics)
import FirebaseAnalytics
#endif
import SwiftUI
import Combine
import LocalAuthentication

#if canImport(GoogleSignIn)
import GoogleSignIn
#endif

#if os(iOS)
import UIKit
#endif
#if os(macOS)
import AppKit
#endif

private func studioNormalizedTeamRole(_ role: String, fallback: String = "member") -> String {
    let compact = role
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .lowercased()
        .replacingOccurrences(of: "[\\s_-]+", with: "", options: .regularExpression)

    switch compact {
    case "owner": return "owner"
    case "admin": return "admin"
    case "member": return "member"
    case "viewer", "viewonly", "readonly": return "viewer"
    case "workflow", "workflowonly": return "workflow"
    case "unknown", "": return fallback
    default: return fallback
    }
}

private func studioCustomRoleId(_ role: String) -> String? {
    let raw = role.trimmingCharacters(in: .whitespacesAndNewlines)
    guard raw.range(of: "^custom_[A-Za-z0-9_-]{6,64}$", options: .regularExpression) != nil else { return nil }
    return raw
}

let studioNavigationAccessOptions: [(key: String, label: String)] = [
    ("orders", "Orders"),
    ("dashboard", "Dashboard"),
    ("schedule", "Schedule"),
    ("customers", "Customers"),
    ("messages", "Messages"),
    ("teamChat", "Team Chat posting"),
    ("notes", "Notes"),
    ("quickReply", "Quick Reply"),
    ("settings", "Settings"),
    ("teamAccess", "Team Access"),
    ("clientFiles", "Client Files"),
    ("financialInfo", "Financial Info"),
    ("exportData", "Export Data"),
    ("bankFeed", "Bank Spending")
]

let studioSettingsAccessOptions: [(key: String, label: String)] = [
    ("settingsGeneral", "General / Personal Settings"),
    ("settingsPdf", "PDF Export Settings"),
    ("settingsQuickReply", "Quick Reply Settings"),
    ("settingsMessageSettings", "Message Settings"),
    ("settingsWorkflow", "Workflow Steps"),
    ("settingsFinancial", "Financial Settings"),
    ("settingsSafetyUploads", "Safety & Uploads"),
    ("settingsData", "Data Management"),
    ("settingsTeamAccess", "Team Access"),
    ("settingsPlanAccess", "Plan & Access"),
    ("settingsSupport", "Support / Tickets")
]

let studioCardAccessOptions: [(key: String, label: String)] = [
    ("cardPreview", "Preview"),
    ("cardSummary", "Order Summary"),
    ("cardCustomer", "Customer & Communication"),
    ("cardMaterials", "Materials & Inventory"),
    ("cardPriority", "Priority / Risk"),
    ("cardDelivery", "Timeline & Delivery"),
    ("cardNotes", "Notes"),
    ("cardClientFiles", "Client Files"),
    ("cardTodo", "To Do"),
    ("cardWorkTime", "Work Time"),
    ("cardFinancial", "Financial Info"),
    ("cardStatus", "Production Status"),
    ("cardShipping", "Shipping & Tracking"),
    ("cardSchedule", "Schedule & Alerts"),
    ("cardHistoryLog", "History / Log")
]

let studioScopeAccessOptions: [(key: String, label: String)] = [
    ("assignedProjectsOnly", "Assigned Projects Only"),
    ("manageProjectAssignments", "Change Project Assignments")
]

let studioFilePermissionAccessOptions: [(key: String, label: String)] = [
    ("deleteClientFiles", "Delete client files")
]

let studioMemberAccessOptions = studioNavigationAccessOptions + studioSettingsAccessOptions + studioCardAccessOptions + studioScopeAccessOptions + studioFilePermissionAccessOptions

func studioDefaultMemberAccess() -> [String: Bool] {
    Dictionary(uniqueKeysWithValues: studioMemberAccessOptions.map { ($0.key, ["assignedProjectsOnly", "manageProjectAssignments", "bankFeed"].contains($0.key) ? false : true) })
}

private func studioCleanMemberAccess(_ raw: [String: Any]?, forceFullAccess: Bool = false) -> [String: Bool] {
    var access = studioDefaultMemberAccess()
    guard !forceFullAccess, let raw else { return access }
    for option in studioMemberAccessOptions {
        if let boolValue = raw[option.key] as? Bool {
            access[option.key] = boolValue
        }
    }
    return access
}

private func studioCleanMemberAccess(_ raw: [String: Bool], forceFullAccess: Bool = false) -> [String: Bool] {
    studioCleanMemberAccess(Dictionary(uniqueKeysWithValues: raw.map { ($0.key, $0.value as Any) }), forceFullAccess: forceFullAccess)
}

private func studioDefaultAccessForRole(_ role: String) -> [String: Bool] {
    var access = studioDefaultMemberAccess()
    if studioNormalizedTeamRole(role) == "workflow" {
        access["dashboard"] = false
        access["financialInfo"] = false
        access["customers"] = false
        access["teamAccess"] = false
        access["cardFinancial"] = false
        access["assignedProjectsOnly"] = true
        access["manageProjectAssignments"] = false
        access["orders"] = true
        access["schedule"] = true
        access["quickReply"] = true
        access["clientFiles"] = true
        access["cardClientFiles"] = true
    }
    return access
}

struct StudioCustomTeamRole: Identifiable, Equatable {
    let id: String
    var name: String
    var baseRole: String
    var access: [String: Bool]

    var normalizedBaseRole: String {
        studioNormalizedTeamRole(baseRole)
    }

    var roleLabel: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Custom Role" : name
    }
}

struct StudioTeamMember: Identifiable, Equatable {
    let id: String
    var email: String
    var displayName: String
    var photoURL: String
    var role: String
    var effectiveRole: String = ""
    var roleDisplayName: String = ""
    var access: [String: Bool] = studioDefaultMemberAccess()
    var addedAt: Date?

    var normalizedRole: String {
        studioNormalizedTeamRole(effectiveRole.isEmpty ? role : effectiveRole)
    }

    var roleLabel: String {
        let customLabel = roleDisplayName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !customLabel.isEmpty { return customLabel }
        switch normalizedRole {
        case "owner": return "Owner"
        case "admin": return "Admin"
        case "viewer": return "View Only"
        case "workflow": return "Workflow Only"
        default: return "Member"
        }
    }

    var canEditWorkspaceData: Bool {
        ["owner", "admin", "member"].contains(normalizedRole)
    }
}

struct StudioWorkspaceOption: Identifiable, Equatable {
    let id: String
    var name: String
    var ownerEmail: String
    var role: String

    var normalizedRole: String {
        studioNormalizedTeamRole(role)
    }

    var roleLabel: String {
        switch normalizedRole {
        case "owner": return "Owner"
        case "admin": return "Admin"
        case "viewer": return "View Only"
        case "workflow": return "Workflow Only"
        default: return "Member"
        }
    }

    var canEditWorkspaceData: Bool {
        ["owner", "admin", "member"].contains(normalizedRole)
    }
}

struct StudioJoinRequest: Identifiable, Equatable {
    let id: String
    var requesterUid: String
    var requesterEmail: String
    var requesterDisplayName: String
    var requesterPhotoURL: String
    var targetCompanyId: String
    var status: String
    var createdAt: Date?

    var requesterLabel: String {
        if !requesterEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return requesterEmail }
        if !requesterDisplayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return requesterDisplayName }
        return requesterUid
    }
}


enum StudioBillingPlan: String, CaseIterable, Identifiable, Codable, Equatable, Hashable {
    case demo = "demo"
    case lifetimeLite = "lifetime_lite"
    case proMonthly = "pro_monthly"
    case teamMonthly = "team_monthly"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .demo: return "Free"
        case .lifetimeLite: return "NivaDesk Lite"
        case .proMonthly: return "NivaDesk Pro"
        case .teamMonthly: return "NivaDesk Team"
        }
    }

    var purchaseModel: String {
        switch self {
        case .demo: return "Free"
        case .lifetimeLite: return "Monthly or Annual Subscription"
        case .proMonthly, .teamMonthly: return "Monthly or Annual Subscription"
        }
    }

    var systemImage: String {
        switch self {
        case .demo: return "sparkles"
        case .lifetimeLite: return "checkmark.seal.fill"
        case .proMonthly: return "bolt.fill"
        case .teamMonthly: return "person.3.fill"
        }
    }

    var accessLevel: Int {
        switch self {
        case .demo: return 0
        case .lifetimeLite: return 1
        case .proMonthly: return 2
        case .teamMonthly: return 3
        }
    }

    func includes(_ requiredPlan: StudioBillingPlan) -> Bool {
        accessLevel >= requiredPlan.accessLevel
    }

    var entitlements: StudioPlanEntitlements {
        switch self {
        case .demo:
            // Free is a permanent tier, not a trial window, so it has to hold a real
            // week of work. Keep these in step with PLAN_ENTITLEMENTS.demo on the server.
            return StudioPlanEntitlements(
                plan: self,
                orderLimit: 10,
                customerLimit: 10,
                storageLimitMB: 50,
                teamMemberLimit: 1,
                clientFilesEnabled: false,
                shareSheetEnabled: false,
                teamAccessEnabled: false,
                auditLogEnabled: false,
                multiDeviceCloudSyncEnabled: false,
                advancedDashboardEnabled: false,
                calendarRemindersEnabled: false,
                cardProfileSyncEnabled: false,
                workspaceLogoUploadEnabled: false,
                pdfExportEnabled: true,
                financialCardsEnabled: true,
                materialsInventoryCardsEnabled: true,
                historyLogEnabled: true,
                cardCustomizationEnabled: true,
                scheduleAdvancedFiltersEnabled: false,
                scheduleLongRangeEnabled: false,
                scheduleTeamViewEnabled: false,
                taskLimitPerOrder: 5
            )
        case .lifetimeLite:
            return StudioPlanEntitlements(
                plan: self,
                orderLimit: nil,
                customerLimit: nil,
                storageLimitMB: 250,
                teamMemberLimit: 1,
                clientFilesEnabled: false,
                shareSheetEnabled: false,
                teamAccessEnabled: false,
                auditLogEnabled: false,
                multiDeviceCloudSyncEnabled: false,
                advancedDashboardEnabled: false,
                calendarRemindersEnabled: true,
                cardProfileSyncEnabled: false,
                workspaceLogoUploadEnabled: false,
                pdfExportEnabled: true,
                financialCardsEnabled: true,
                materialsInventoryCardsEnabled: true,
                historyLogEnabled: true,
                cardCustomizationEnabled: true,
                scheduleAdvancedFiltersEnabled: false,
                scheduleLongRangeEnabled: false,
                scheduleTeamViewEnabled: false,
                taskLimitPerOrder: nil
            )
        case .proMonthly:
            return StudioPlanEntitlements(
                plan: self,
                orderLimit: nil,
                customerLimit: nil,
                storageLimitMB: 10240,
                teamMemberLimit: 1,
                clientFilesEnabled: true,
                shareSheetEnabled: true,
                teamAccessEnabled: false,
                auditLogEnabled: true,
                multiDeviceCloudSyncEnabled: true,
                advancedDashboardEnabled: true,
                calendarRemindersEnabled: true,
                cardProfileSyncEnabled: false,
                workspaceLogoUploadEnabled: true,
                pdfExportEnabled: true,
                financialCardsEnabled: true,
                materialsInventoryCardsEnabled: true,
                historyLogEnabled: true,
                cardCustomizationEnabled: true,
                scheduleAdvancedFiltersEnabled: true,
                scheduleLongRangeEnabled: true,
                scheduleTeamViewEnabled: false,
                taskLimitPerOrder: nil
            )
        case .teamMonthly:
            return StudioPlanEntitlements(
                plan: self,
                orderLimit: nil,
                customerLimit: nil,
                storageLimitMB: 51200,
                teamMemberLimit: 5,
                clientFilesEnabled: true,
                shareSheetEnabled: true,
                teamAccessEnabled: true,
                auditLogEnabled: true,
                multiDeviceCloudSyncEnabled: true,
                advancedDashboardEnabled: true,
                calendarRemindersEnabled: true,
                cardProfileSyncEnabled: true,
                workspaceLogoUploadEnabled: true,
                pdfExportEnabled: true,
                financialCardsEnabled: true,
                materialsInventoryCardsEnabled: true,
                historyLogEnabled: true,
                cardCustomizationEnabled: true,
                scheduleAdvancedFiltersEnabled: true,
                scheduleLongRangeEnabled: true,
                scheduleTeamViewEnabled: true,
                taskLimitPerOrder: nil
            )
        }
    }
}

struct StudioPlanEntitlements: Equatable {
    var plan: StudioBillingPlan
    var orderLimit: Int?
    var customerLimit: Int?
    var storageLimitMB: Int
    var teamMemberLimit: Int
    var clientFilesEnabled: Bool
    var shareSheetEnabled: Bool
    var teamAccessEnabled: Bool
    var auditLogEnabled: Bool
    var multiDeviceCloudSyncEnabled: Bool
    var advancedDashboardEnabled: Bool
    var calendarRemindersEnabled: Bool
    var cardProfileSyncEnabled: Bool
    var workspaceLogoUploadEnabled: Bool
    var pdfExportEnabled: Bool
    var financialCardsEnabled: Bool
    var materialsInventoryCardsEnabled: Bool
    var historyLogEnabled: Bool
    var cardCustomizationEnabled: Bool
    var scheduleAdvancedFiltersEnabled: Bool
    var scheduleLongRangeEnabled: Bool
    var scheduleTeamViewEnabled: Bool
    var taskLimitPerOrder: Int?

    var storageLimitText: String {
        if storageLimitMB >= 1024 {
            let gb = Double(storageLimitMB) / 1024.0
            return gb.truncatingRemainder(dividingBy: 1) == 0 ? "\(Int(gb)) GB" : String(format: "%.1f GB", gb)
        }
        return "\(storageLimitMB) MB"
    }

    var orderLimitText: String { orderLimit.map { "\($0) orders" } ?? "Unlimited orders" }
    var customerLimitText: String { customerLimit.map { "\($0) customers" } ?? "Unlimited customers" }
    var teamLimitText: String { teamMemberLimit <= 1 ? "1 user" : "Up to \(teamMemberLimit) users" }
    var taskLimitText: String { taskLimitPerOrder.map { "Up to \($0) tasks per order" } ?? "Unlimited tasks" }

    func canCreateOrder(currentCount: Int) -> Bool {
        guard let orderLimit else { return true }
        return currentCount < orderLimit
    }

    func canCreateCustomer(currentCount: Int) -> Bool {
        guard let customerLimit else { return true }
        return currentCount < customerLimit
    }

    func canAddTeamMember(currentMemberCount: Int) -> Bool {
        teamAccessEnabled && currentMemberCount < teamMemberLimit
    }
}


struct StudioStoreProductSummary: Identifiable, Equatable {
    let id: String
    var title: String
    var displayPrice: String
    var detail: String
    // Free-trial wording is taken from the offer configured in App Store Connect
    // rather than hard-coded, so the app can never advertise a trial the store
    // would not actually grant.
    var introductoryOfferText: String? = nil
}

enum StudioStoreBillingInterval: String, CaseIterable, Identifiable, Hashable {
    case monthly = "month"
    case yearly = "year"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .monthly: return "Monthly"
        case .yearly: return "Yearly"
        }
    }
}

struct StudioStoreVerifiedPurchase {
    let plan: StudioBillingPlan
    let interval: StudioStoreBillingInterval
    let productId: String
    let signedTransactionInfo: String
}

struct StudioStorageAddonOption: Identifiable {
    let storageGB: Int
    let interval: StudioStoreBillingInterval
    let productId: String
    let itemKey: String
    var id: String { productId }
}

@MainActor
final class StudioStoreKitManager: ObservableObject {
    static let productIdsByPlan: [StudioBillingPlan: [StudioStoreBillingInterval: String]] = [
        .lifetimeLite: [
            .monthly: "uk.co.eggcraft.studioflow.lite.monthly",
            .yearly: "uk.co.eggcraft.studioflow.lite.yearly"
        ],
        .proMonthly: [
            .monthly: "uk.co.eggcraft.studioflow.pro.monthly",
            .yearly: "uk.co.eggcraft.studioflow.pro.yearly"
        ],
        .teamMonthly: [
            .monthly: "uk.co.eggcraft.studioflow.team.monthly",
            .yearly: "uk.co.eggcraft.studioflow.team.yearly"
        ]
    ]

    // Storage add-on subscriptions (additive Client Files storage, not a plan).
    // itemKey mirrors the backend STRIPE_BILLING_ITEMS / APPLE_PLAN_PRODUCTS keys.
    static let storageAddonOptions: [StudioStorageAddonOption] = [
        StudioStorageAddonOption(storageGB: 100, interval: .monthly, productId: "uk.co.eggcraft.studioflow.storage.100gb.monthly", itemKey: "storage_100gb"),
        StudioStorageAddonOption(storageGB: 100, interval: .yearly, productId: "uk.co.eggcraft.studioflow.storage.100gb.yearly", itemKey: "storage_100gb_yearly"),
        StudioStorageAddonOption(storageGB: 200, interval: .monthly, productId: "uk.co.eggcraft.studioflow.storage.200gb.monthly", itemKey: "storage_200gb"),
        StudioStorageAddonOption(storageGB: 200, interval: .yearly, productId: "uk.co.eggcraft.studioflow.storage.200gb.yearly", itemKey: "storage_200gb_yearly")
    ]

    @Published var products: [StudioStoreProductSummary] = []

    #if canImport(StoreKit)
    // "14 days free, then £19.00" — only when the store really offers a free trial.
    static func freeTrialText(for product: Product) -> String? {
        guard let offer = product.subscription?.introductoryOffer,
              offer.paymentMode == .freeTrial else { return nil }
        let count = offer.period.value
        let unit: String
        switch offer.period.unit {
        case .day: unit = count == 1 ? "day" : "days"
        case .week: unit = count == 1 ? "week" : "weeks"
        case .month: unit = count == 1 ? "month" : "months"
        case .year: unit = count == 1 ? "year" : "years"
        @unknown default: return nil
        }
        return "\(count) \(unit) free, then \(product.displayPrice)"
    }
    #endif
    @Published var isLoadingProducts: Bool = false
    @Published var isPurchasing: Bool = false
    @Published var message: String = ""
    @Published var errorMessage: String = ""

    func storageProductSummary(for productId: String) -> StudioStoreProductSummary? {
        products.first(where: { $0.id == productId })
    }

    static func productId(for plan: StudioBillingPlan, interval: StudioStoreBillingInterval) -> String? {
        productIdsByPlan[plan]?[interval]
    }

    static func purchaseOption(for productId: String) -> (plan: StudioBillingPlan, interval: StudioStoreBillingInterval)? {
        for (plan, intervals) in productIdsByPlan {
            if let interval = intervals.first(where: { $0.value == productId })?.key {
                return (plan, interval)
            }
        }
        return nil
    }

    func productSummary(for plan: StudioBillingPlan, interval: StudioStoreBillingInterval) -> StudioStoreProductSummary? {
        guard let productId = Self.productId(for: plan, interval: interval) else { return nil }
        return products.first(where: { $0.id == productId })
    }

    func configuredProductId(for plan: StudioBillingPlan, interval: StudioStoreBillingInterval) -> String {
        Self.productId(for: plan, interval: interval) ?? ""
    }

    func loadProducts() async {
        message = ""
        errorMessage = ""
        isLoadingProducts = true
        defer { isLoadingProducts = false }

        #if canImport(StoreKit)
        guard #available(iOS 15.0, macOS 12.0, *) else {
            errorMessage = "StoreKit is not available on this device."
            return
        }

        do {
            let ids = Self.productIdsByPlan.values.flatMap { Array($0.values) }
                + Self.storageAddonOptions.map { $0.productId }
            let storeProducts = try await Product.products(for: ids)
            products = storeProducts
                .sorted { $0.id < $1.id }
                .map { product in
                    StudioStoreProductSummary(
                        id: product.id,
                        title: product.displayName,
                        displayPrice: product.displayPrice,
                        detail: product.description,
                        introductoryOfferText: Self.freeTrialText(for: product)
                    )
                }
            if products.isEmpty {
                errorMessage = "No StoreKit products were found."
            } else {
                message = "Products loaded."
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        #else
        errorMessage = "StoreKit is not available on this device."
        #endif
    }

    func purchase(_ plan: StudioBillingPlan, interval: StudioStoreBillingInterval, appAccountToken: UUID) async -> StudioStoreVerifiedPurchase? {
        message = ""
        errorMessage = ""

        guard let productId = Self.productId(for: plan, interval: interval) else {
            errorMessage = "Purchase unavailable."
            return nil
        }

        #if canImport(StoreKit)
        guard #available(iOS 15.0, macOS 12.0, *) else {
            errorMessage = "StoreKit is not available on this device."
            return nil
        }

        isPurchasing = true
        defer { isPurchasing = false }

        do {
            let matches = try await Product.products(for: [productId])
            guard let product = matches.first else {
                errorMessage = "Product not loaded."
                return nil
            }

            let result = try await product.purchase(options: [.appAccountToken(appAccountToken)])
            switch result {
            case .success(let verification):
                let transaction = try checkVerified(verification)
                let purchase = StudioStoreVerifiedPurchase(
                    plan: plan,
                    interval: interval,
                    productId: transaction.productID,
                    signedTransactionInfo: verification.jwsRepresentation
                )
                await transaction.finish()
                message = "Purchase confirmed. Verifying subscription access."
                return purchase
            case .userCancelled:
                message = "Purchase cancelled."
                return nil
            case .pending:
                message = "Purchase pending approval."
                return nil
            @unknown default:
                errorMessage = "Purchase unavailable."
                return nil
            }
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
        #else
        errorMessage = "StoreKit is not available on this device."
        return nil
        #endif
    }

    // Purchases a storage add-on subscription and returns the signed JWS for
    // server verification. Not tied to a plan tier.
    func purchaseStorageAddon(_ productId: String, appAccountToken: UUID) async -> String? {
        message = ""
        errorMessage = ""
        #if canImport(StoreKit)
        guard #available(iOS 15.0, macOS 12.0, *) else {
            errorMessage = "StoreKit is not available on this device."
            return nil
        }
        isPurchasing = true
        defer { isPurchasing = false }
        do {
            let matches = try await Product.products(for: [productId])
            guard let product = matches.first else {
                errorMessage = "Product not loaded."
                return nil
            }
            let result = try await product.purchase(options: [.appAccountToken(appAccountToken)])
            switch result {
            case .success(let verification):
                let transaction = try checkVerified(verification)
                await transaction.finish()
                message = "Purchase confirmed. Verifying storage add-on."
                return verification.jwsRepresentation
            case .userCancelled:
                message = "Purchase cancelled."
                return nil
            case .pending:
                message = "Purchase pending approval."
                return nil
            @unknown default:
                errorMessage = "Purchase unavailable."
                return nil
            }
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
        #else
        errorMessage = "StoreKit is not available on this device."
        return nil
        #endif
    }

    func currentEntitlementPurchase() async -> StudioStoreVerifiedPurchase? {
        #if canImport(StoreKit)
        guard #available(iOS 15.0, macOS 12.0, *) else { return nil }

        var activePurchase: StudioStoreVerifiedPurchase? = nil
        for await result in Transaction.currentEntitlements {
            guard let transaction = try? checkVerified(result),
                  let option = Self.purchaseOption(for: transaction.productID) else { continue }
            let candidate = StudioStoreVerifiedPurchase(
                plan: option.plan,
                interval: option.interval,
                productId: transaction.productID,
                signedTransactionInfo: result.jwsRepresentation
            )
            if activePurchase == nil || option.plan.accessLevel > activePurchase!.plan.accessLevel {
                activePurchase = candidate
            }
        }
        return activePurchase
        #else
        return nil
        #endif
    }

    func restorePurchases() async -> StudioStoreVerifiedPurchase? {
        message = ""
        errorMessage = ""

        #if canImport(StoreKit)
        guard #available(iOS 15.0, macOS 12.0, *) else {
            errorMessage = "StoreKit is not available on this device."
            return nil
        }

        isPurchasing = true
        defer { isPurchasing = false }

        do {
            try await AppStore.sync()
            if let purchase = await currentEntitlementPurchase() {
                message = "Purchase restored. Verifying subscription access."
                return purchase
            }
            message = "No active purchase was found."
            return nil
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
        #else
        errorMessage = "StoreKit is not available on this device."
        return nil
        #endif
    }

    #if canImport(StoreKit)
    @available(iOS 15.0, macOS 12.0, *)
    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified:
            throw NSError(domain: "StudioFlowStoreKit", code: 1, userInfo: [NSLocalizedDescriptionKey: "Purchase verification failed."])
        case .verified(let safe):
            return safe
        }
    }
    #endif
}

@MainActor
class AuthViewModel: ObservableObject {
    @Published var isLoggedIn = false
    @Published var errorMessage = ""
    @Published var isLoading = false
    // One-time "we sent you a verification link" confirmation, shown right after
    // a successful email/password sign-up (there was previously no signup notice).
    @Published var showPostSignupVerifyNotice = false
    @Published private(set) var interfaceSessionId = UUID()
    @Published private(set) var currentUserId: String? = nil
    @Published private(set) var currentCompanyId: String? = nil
    @Published private(set) var isWorkspaceReady: Bool = false
    @Published var currentBillingPlan: StudioBillingPlan = .demo
    // Owner toggle: show/hide the "AI Replies" (Quick Reply) item in the main menu.
    @Published var quickReplyMenuEnabled: Bool = true
    @Published var currentStorageAddonKey: String = ""
    @Published var currentStorageAddonMB: Int = 0
    // Effective team seat allowance (base plan + purchased seats), read from the workspace doc.
    @Published var currentTeamMemberLimitEffective: Int = 0

    // Effective seats including any purchased additional seats; falls back to the plan default.
    var effectiveTeamMemberLimit: Int {
        max(currentTeamMemberLimitEffective, currentPlanEntitlements.teamMemberLimit)
    }
    // Total self-service ceiling for the Team plan.
    var teamSeatSelfServiceMax: Int { 10 }

    // Base plan storage + any active add-on, as a display string (e.g. "110 GB").
    var effectiveStorageLimitText: String {
        let totalMB = currentPlanEntitlements.storageLimitMB + currentStorageAddonMB
        if totalMB >= 1024 {
            let gb = Double(totalMB) / 1024.0
            return gb == gb.rounded() ? "\(Int(gb)) GB" : String(format: "%.1f GB", gb)
        }
        return "\(totalMB) MB"
    }
    @Published var currentBillingInterval: StudioStoreBillingInterval? = nil
    @Published var billingPlanSource: String = "legacy"
    @Published var billingUpdatedAt: Date? = nil

    @Published var accountEmail: String = ""
    @Published var accountDisplayName: String = ""
    @Published var accountPhotoURL: String = ""
    @Published var companyName: String = "My Studio"
    @Published var profileMessage: String = ""
    @Published var profileErrorMessage: String = ""
    @Published var isProfileLoading: Bool = false

    @Published var teamMembers: [StudioTeamMember] = []
    @Published var customTeamRoles: [StudioCustomTeamRole] = []
    @Published var availableWorkspaces: [StudioWorkspaceOption] = []
    @Published var joinRequests: [StudioJoinRequest] = []
    @Published var isCompanyOwner: Bool = false
    @Published var currentWorkspaceRole: String = "owner"
    @Published var currentWorkspaceRoleLabel: String = "Owner"
    @Published var currentWorkspaceAccess: [String: Bool] = studioDefaultMemberAccess()

    @Published var isLocalUnlockSatisfied: Bool = true
    @Published var localUnlockMessage: String = ""

    private let localUnlockDefaultsKey = "studioflow_require_local_unlock"
    private let autoLockMinutesDefaultsKey = "studioflow_auto_lock_minutes"
    private var bypassNextLocalUnlockAfterInteractiveSignIn = false
    private var lastBackgroundedAt: Date?

    var isLocalUnlockEnabled: Bool {
        UserDefaults.standard.object(forKey: localUnlockDefaultsKey) as? Bool ?? true
    }

    // How many minutes NivaDesk may stay in the background before it asks to unlock
    // again on return. 0 == Immediately; default is 1 minute so a brief device lock
    // or app switch does not force re-authentication. A cold launch / session
    // restore always requires unlock regardless of this value.
    var autoLockMinutes: Int {
        UserDefaults.standard.object(forKey: autoLockMinutesDefaultsKey) as? Int ?? 1
    }

    var isGoogleSignInAvailable: Bool {
        #if canImport(GoogleSignIn)
        return true
        #else
        return false
        #endif
    }

    var isGoogleAccount: Bool {
        Auth.auth().currentUser?.providerData.contains(where: { $0.providerID == "google.com" }) ?? false
    }

    var currentPlanEntitlements: StudioPlanEntitlements {
        currentBillingPlan.entitlements
    }

    var currentPlanDisplayName: String {
        currentBillingPlan.displayName
    }


    private func billingPlanDeniedMessage(reason: String, requiredPlan: String = "") -> String {
        switch reason {
        case "feature_not_in_plan":
            if requiredPlan == "team_monthly" { return "This feature is available on the NivaDesk Team monthly plan." }
            return "This feature is available on the NivaDesk Pro or Team monthly plan."
        case "plan_limit_reached":
            return "This plan has reached its team member limit. Upgrade the workspace plan before adding more people."
        case "storage_limit_reached":
            return "This workspace has reached its plan storage limit."
        default:
            return "Action blocked by the current workspace plan."
        }
    }

    private func validateWorkspacePlanAction(action: String, completion: @escaping (Bool, String) -> Void) {
        guard let companyId = currentCompanyId, !companyId.isEmpty else {
            completion(false, "Company ID is not configured.")
            return
        }

        #if canImport(FirebaseFunctions)
        let payload: [String: Any] = [
            "companyId": companyId,
            "action": action
        ]

        Functions.functions(region: "europe-west2")
            .httpsCallable("validateWorkspacePlanAction")
            .call(payload) { [weak self] result, error in
                guard let self else { completion(false, "Plan check failed."); return }
                if let error = error {
                    completion(false, "Plan check failed: \(error.localizedDescription)")
                    return
                }

                guard let data = result?.data as? [String: Any] else {
                    completion(false, "Plan check failed: empty server response.")
                    return
                }

                let allowed = data["allowed"] as? Bool ?? false
                if allowed {
                    completion(true, "")
                } else {
                    let reason = data["reason"] as? String ?? "blocked"
                    let requiredPlan = data["requiredPlan"] as? String ?? "team_monthly"
                    completion(false, self.billingPlanDeniedMessage(reason: reason, requiredPlan: requiredPlan))
                }
            }
        #else
        completion(true, "")
        #endif
    }


    var googleProfilePhotoURL: String {
        Auth.auth().currentUser?.providerData.first(where: { $0.providerID == "google.com" })?.photoURL?.absoluteString ?? ""
    }

    private var authStateHandle: AuthStateDidChangeListenerHandle?
    private var isRepairingAcceptedJoinRequests = false
    private var activeCompanyListener: ListenerRegistration?
    private var activeCompanyListenerCompanyId: String?
    private var userDocListener: ListenerRegistration?
    private var userDocListenerUserId: String?
    private var workspaceAccessListener: ListenerRegistration?
    private var workspaceAccessListenerUserId: String?
    private let db = Firestore.firestore()
    private let billingPlanDefaultsKey = "studioFlowBillingPlanV1"

    init() {
        authStateHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in
                guard let self else { return }

                guard let user else {
                    if self.isLoggedIn || self.currentUserId != nil {
                        self.interfaceSessionId = UUID()
                    }
                    self.stopRealtimeWorkspaceListeners()
                    self.currentUserId = nil
                    self.currentCompanyId = nil
                    self.isWorkspaceReady = false
                    self.isLoggedIn = false
                    self.isLocalUnlockSatisfied = true
                    self.localUnlockMessage = ""
                    self.clearProfileState()
                    return
                }

                let isSameResolvedUser = self.currentUserId == user.uid && self.isWorkspaceReady && self.currentCompanyId != nil
                if self.currentUserId != user.uid {
                    self.interfaceSessionId = UUID()
                    self.currentCompanyId = nil
                    self.isWorkspaceReady = false
                }
                self.currentUserId = user.uid
                self.accountEmail = user.email ?? ""
                self.accountDisplayName = user.displayName ?? ""
                self.accountPhotoURL = user.photoURL?.absoluteString ?? self.googleProfilePhotoURL
                self.isLoggedIn = true

                if self.bypassNextLocalUnlockAfterInteractiveSignIn {
                    self.isLocalUnlockSatisfied = true
                    self.bypassNextLocalUnlockAfterInteractiveSignIn = false
                } else {
                    self.isLocalUnlockSatisfied = !self.isLocalUnlockEnabled
                }

                guard !isSameResolvedUser else { return }

                self.ensureCompanyDocument(for: user) { [weak self] _ in
                    Task { @MainActor in
                        self?.resolveActiveCompany(for: user)
                    }
                }

                // Offline / flaky-network safety net: if the bootstrap above stalls on a
                // hung Firestore read, proceed with cached data after a short delay so the
                // app never sits on "Preparing your workspace..." forever. (Mirrors the
                // self-recovery the Android client already has.)
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 8_000_000_000)
                    self.proceedWithCachedWorkspaceIfStalled(for: user)
                }
            }
        }
    }

    func login(email: String, sifre: String, onSuccess: (() -> Void)? = nil) {
        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanEmail.isEmpty, !sifre.isEmpty else {
            errorMessage = "Please enter your email address and password."
            return
        }

        isLoading = true
        errorMessage = ""
        bypassNextLocalUnlockAfterInteractiveSignIn = true

        Auth.auth().signIn(withEmail: cleanEmail, password: sifre) { [weak self] _, error in
            Task { @MainActor in
                self?.isLoading = false
                if let error = error {
                    self?.bypassNextLocalUnlockAfterInteractiveSignIn = false
                    self?.errorMessage = error.localizedDescription
                } else {
                    onSuccess?()
                }
            }
        }
    }


    /// Records which device class the account was created on (`desktop` vs
    /// `mobile`) in users/{uid}. Written once, only for freshly created accounts;
    /// the first-project info-card guide opens only for desktop signups.
    func recordSignupPlatformIfNewAccount() {
        guard let user = Auth.auth().currentUser else { return }
        guard let created = user.metadata.creationDate, Date().timeIntervalSince(created) < 600 else { return }
        #if os(macOS)
        let platform = "desktop"
        #else
        let platform = "mobile"
        #endif
        let userRef = Firestore.firestore().collection("users").document(user.uid)
        userRef.getDocument { snapshot, _ in
            let existing = (snapshot?.data()?["signupPlatform"] as? String) ?? ""
            guard existing.isEmpty else { return }
            userRef.setData(["signupPlatform": platform], merge: true)
            // First run for a brand-new account: log the sign_up conversion so
            // ad campaigns (Apple Search Ads / Google App campaigns) can
            // optimise past the install.
            #if canImport(FirebaseAnalytics)
            Analytics.logEvent(AnalyticsEventSignUp, parameters: [AnalyticsParameterMethod: platform])
            #endif
        }
    }

    func register(fullName: String = "", studioName: String = "", email: String, sifre: String, onSuccess: (() -> Void)? = nil) {
        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanFullName = fullName.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanStudioName = studioName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanEmail.isEmpty, !sifre.isEmpty else {
            errorMessage = "Please enter your email address and password."
            return
        }
        guard cleanFullName.count >= 2 else {
            errorMessage = "Please enter your full name."
            return
        }
        guard cleanStudioName.count >= 2 else {
            errorMessage = "Please enter your studio or workspace name."
            return
        }
        guard sifre.count >= 8,
              sifre.rangeOfCharacter(from: .letters) != nil,
              sifre.rangeOfCharacter(from: .decimalDigits) != nil else {
            errorMessage = "Password must be at least 8 characters and include a letter and a number."
            return
        }

        isLoading = true
        errorMessage = ""
        bypassNextLocalUnlockAfterInteractiveSignIn = true

        Auth.auth().createUser(withEmail: cleanEmail, password: sifre) { [weak self] result, error in
            Task { @MainActor in
                if let error = error {
                    self?.isLoading = false
                    self?.bypassNextLocalUnlockAfterInteractiveSignIn = false
                    self?.errorMessage = error.localizedDescription
                    return
                }

                guard let user = result?.user else {
                    self?.isLoading = false
                    onSuccess?()
                    return
                }

                // Brand-new account: start from clean device-local defaults so it never
                // inherits a previously-signed-in account's cached card colours/order/visibility.
                self?.clearDeviceLocalWorkspaceCardCache()

                // Account hygiene: profile name + verification email (non-blocking).
                let changeRequest = user.createProfileChangeRequest()
                changeRequest.displayName = cleanFullName
                changeRequest.commitChanges(completion: nil)
                let actionSettings = ActionCodeSettings()
                actionSettings.url = URL(string: "https://nivadesk.app/login")
                user.sendEmailVerification(with: actionSettings, completion: nil)

                // Tell the brand-new user (once) that a verification link was sent
                // and why it matters — there was previously no signup-time notice.
                self?.showPostSignupVerifyNotice = true

                // Seed the new workspace with the chosen studio name and owner
                // details so it never shows up as a bare "My Studio".
                self?.recordSignupPlatformIfNewAccount()
                Firestore.firestore().collection("companies").document(user.uid).setData([
                    "name": cleanStudioName,
                    "companyName": cleanStudioName,
                    "ownerDisplayName": cleanFullName,
                    "ownerEmail": cleanEmail
                ], merge: true) { _ in
                    Task { @MainActor in
                        self?.isLoading = false
                        onSuccess?()
                    }
                }
            }
        }
    }

    func signInWithGoogle() {
        #if canImport(GoogleSignIn)
        guard let clientID = FirebaseApp.app()?.options.clientID, !clientID.isEmpty else {
            errorMessage = "Google Sign-In is not configured yet. Enable Google in Firebase Authentication, download the updated GoogleService-Info.plist, and try again."
            return
        }

        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        isLoading = true
        errorMessage = ""
        bypassNextLocalUnlockAfterInteractiveSignIn = true

        let finishWithResult: (GIDSignInResult?, Error?) -> Void = { [weak self] result, error in
            if let error = error {
                Task { @MainActor in
                    self?.isLoading = false
                    self?.bypassNextLocalUnlockAfterInteractiveSignIn = false
                    self?.errorMessage = error.localizedDescription
                }
                return
            }

            guard let user = result?.user,
                  let idToken = user.idToken?.tokenString else {
                Task { @MainActor in
                    self?.isLoading = false
                    self?.bypassNextLocalUnlockAfterInteractiveSignIn = false
                    self?.errorMessage = "Google Sign-In could not return a valid token."
                }
                return
            }

            let credential = GoogleAuthProvider.credential(
                withIDToken: idToken,
                accessToken: user.accessToken.tokenString
            )

            Auth.auth().signIn(with: credential) { [weak self] _, authError in
                Task { @MainActor in
                    self?.isLoading = false
                    if let authError = authError {
                        self?.bypassNextLocalUnlockAfterInteractiveSignIn = false
                        self?.errorMessage = authError.localizedDescription
                    } else {
                        self?.recordSignupPlatformIfNewAccount()
                    }
                }
            }
        }

        #if os(iOS)
        guard let presentingViewController = Self.currentRootViewController() else {
            isLoading = false
            bypassNextLocalUnlockAfterInteractiveSignIn = false
            errorMessage = "Google Sign-In could not find a window to present from."
            return
        }
        GIDSignIn.sharedInstance.signIn(withPresenting: presentingViewController, completion: finishWithResult)
        #elseif os(macOS)
        guard let presentingWindow = Self.currentKeyWindow() else {
            isLoading = false
            bypassNextLocalUnlockAfterInteractiveSignIn = false
            errorMessage = "Google Sign-In could not find a window to present from."
            return
        }
        GIDSignIn.sharedInstance.signIn(withPresenting: presentingWindow, completion: finishWithResult)
        #else
        isLoading = false
        bypassNextLocalUnlockAfterInteractiveSignIn = false
        errorMessage = "Google Sign-In is not supported on this platform yet."
        #endif
        #else
        errorMessage = "Google Sign-In package is not added yet. Add https://github.com/google/GoogleSignIn-iOS in Xcode first."
        #endif
    }

    func loadAccountProfile() {
        guard let user = Auth.auth().currentUser,
              let companyId = currentCompanyId,
              !companyId.isEmpty else { return }
        profileErrorMessage = ""

        // Read from the server so a stale local cache (for example, a company
        // document fetched before this user was added as a member) cannot make us
        // think access was lost and bounce a valid member to their own workspace.
        db.collection("companies").document(companyId).getDocument(source: .server) { [weak self] snapshot, error in
            Task { @MainActor in
                guard let self else { return }

                if let error = error {
                    // Network failure: keep the current workspace, do not bounce out.
                    self.profileErrorMessage = error.localizedDescription
                    return
                }

                guard let data = snapshot?.data() else {
                    if companyId != user.uid {
                        self.handleActiveWorkspaceAccessLost(for: user, message: "This workspace is no longer available. Switched to your own workspace.")
                    }
                    return
                }

                guard self.accessibleWorkspaceRole(from: data, companyId: companyId, currentUid: user.uid) != nil else {
                    self.handleActiveWorkspaceAccessLost(for: user, message: "Your access to this workspace has been removed. Switched to your own workspace.")
                    return
                }

                self.applyCompanyProfile(data: data, companyId: companyId, user: user, shouldSyncMemberIndex: true)
            }
        }
    }

    func updateAccountProfile(displayName: String, companyName: String) {
        guard let user = Auth.auth().currentUser,
              let companyId = currentCompanyId,
              !companyId.isEmpty else {
            profileErrorMessage = "Please sign in again before updating your profile."
            return
        }

        let cleanDisplayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanCompanyName = companyName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "My Studio" : companyName.trimmingCharacters(in: .whitespacesAndNewlines)

        isProfileLoading = true
        profileMessage = ""
        profileErrorMessage = ""

        let batch = db.batch()
        let userRef = db.collection("users").document(user.uid)
        batch.setData([
            "uid": user.uid,
            "email": user.email ?? "",
            "displayName": cleanDisplayName,
            "activeCompanyId": companyId,
            "updatedAt": FieldValue.serverTimestamp()
        ], forDocument: userRef, merge: true)

        let companyRef = db.collection("companies").document(companyId)
        var companyPayload: [String: Any] = [
            "updatedAt": FieldValue.serverTimestamp(),
            "members": [
                user.uid: [
                    "uid": user.uid,
                    "email": user.email ?? "",
                    "displayName": cleanDisplayName,
                    "updatedAt": FieldValue.serverTimestamp()
                ]
            ]
        ]

        if isCompanyOwner {
            companyPayload["companyId"] = companyId
            companyPayload["ownerUid"] = companyId
            companyPayload["ownerEmail"] = user.email ?? ""
            companyPayload["ownerDisplayName"] = cleanDisplayName
            companyPayload["name"] = cleanCompanyName
            companyPayload["companyName"] = cleanCompanyName
            companyPayload["appName"] = "NivaDesk"
            companyPayload["memberUids"] = FieldValue.arrayUnion([companyId])
            companyPayload["members"] = [
                user.uid: [
                    "uid": user.uid,
                    "email": user.email ?? "",
                    "displayName": cleanDisplayName,
                    "role": "owner",
                    "updatedAt": FieldValue.serverTimestamp()
                ]
            ]
        }

        batch.setData(companyPayload, forDocument: companyRef, merge: true)
        batch.commit { [weak self] databaseError in
            Task { @MainActor in
                guard let self else { return }
                self.isProfileLoading = false
                if let databaseError {
                    self.profileErrorMessage = databaseError.localizedDescription
                    return
                }

                self.accountEmail = user.email ?? ""
                self.accountDisplayName = cleanDisplayName
                if self.isCompanyOwner {
                    self.companyName = cleanCompanyName
                }
                self.profileMessage = self.isCompanyOwner ? "Profile updated." : "Profile updated. Company details can only be changed by the workspace owner."
                self.loadAccountProfile()
            }
        }
    }

    func updateAccountAvatar(photoURL: String) {
        guard let user = Auth.auth().currentUser,
              let companyId = currentCompanyId,
              !companyId.isEmpty else {
            profileErrorMessage = "Please sign in again before updating your profile photo."
            return
        }

        let cleanPhotoURL = photoURL.trimmingCharacters(in: .whitespacesAndNewlines)

        isProfileLoading = true
        profileMessage = ""
        profileErrorMessage = ""

        let batch = db.batch()
        let userRef = db.collection("users").document(user.uid)
        batch.setData([
            "uid": user.uid,
            "email": user.email ?? "",
            "displayName": accountDisplayName,
            "photoURL": cleanPhotoURL,
            "activeCompanyId": companyId,
            "updatedAt": FieldValue.serverTimestamp()
        ], forDocument: userRef, merge: true)

        let companyRef = db.collection("companies").document(companyId)
        var companyPayload: [String: Any] = [
            "members": [
                user.uid: [
                    "uid": user.uid,
                    "email": user.email ?? "",
                    "displayName": accountDisplayName,
                    "photoURL": cleanPhotoURL,
                    "updatedAt": FieldValue.serverTimestamp()
                ]
            ],
            "updatedAt": FieldValue.serverTimestamp()
        ]

        if isCompanyOwner || companyId == user.uid {
            companyPayload["ownerPhotoURL"] = cleanPhotoURL
        }

        batch.setData(companyPayload, forDocument: companyRef, merge: true)
        batch.commit { [weak self] databaseError in
            Task { @MainActor in
                guard let self else { return }
                self.isProfileLoading = false
                if let databaseError {
                    self.profileErrorMessage = databaseError.localizedDescription
                    return
                }

                self.accountPhotoURL = cleanPhotoURL
                self.profileMessage = cleanPhotoURL.isEmpty ? "Avatar removed." : "Avatar updated."
                self.loadAccountProfile()
            }
        }
    }

    func setLocalUnlockEnabled(_ enabled: Bool) {
        UserDefaults.standard.set(enabled, forKey: localUnlockDefaultsKey)
        localUnlockMessage = enabled ? "Face ID / device passcode unlock enabled." : "Face ID / device passcode unlock disabled."
        if !enabled {
            isLocalUnlockSatisfied = true
        }
    }

    func setAutoLockMinutes(_ minutes: Int) {
        UserDefaults.standard.set(minutes, forKey: autoLockMinutesDefaultsKey)
    }

    // Scene lifecycle hooks (called from the app scene). We record when NivaDesk
    // leaves the foreground and, on return, re-lock if it stayed in the background
    // at least `autoLockMinutes` minutes. Cold launch locking is handled separately.
    func appMovedToBackground() {
        guard isLoggedIn, isLocalUnlockEnabled, isLocalUnlockSatisfied else { return }
        if lastBackgroundedAt == nil { lastBackgroundedAt = Date() }
    }

    func appBecameActive() {
        defer { lastBackgroundedAt = nil }
        guard isLoggedIn, isLocalUnlockEnabled, isLocalUnlockSatisfied,
              let since = lastBackgroundedAt else { return }
        let elapsed = Date().timeIntervalSince(since)
        if elapsed >= Double(autoLockMinutes) * 60 {
            isLocalUnlockSatisfied = false
            localUnlockMessage = ""
        }
    }

    func unlockWithDeviceSecurity() {
        let context = LAContext()
        var authError: NSError?
        let reason = "Unlock NivaDesk"

        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &authError) else {
            isLocalUnlockSatisfied = true
            localUnlockMessage = authError?.localizedDescription ?? "Device security is not available. NivaDesk was unlocked."
            return
        }

        localUnlockMessage = ""
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { [weak self] success, error in
            Task { @MainActor in
                guard let self else { return }
                if success {
                    self.isLocalUnlockSatisfied = true
                    self.localUnlockMessage = ""
                } else {
                    self.localUnlockMessage = error?.localizedDescription ?? "Could not unlock NivaDesk."
                }
            }
        }
    }

    func sendPasswordResetEmail() {
        let email = (Auth.auth().currentUser?.email ?? accountEmail).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !email.isEmpty else {
            profileErrorMessage = "No email address found for this account."
            return
        }

        isProfileLoading = true
        profileMessage = ""
        profileErrorMessage = ""

        Auth.auth().sendPasswordReset(withEmail: email) { [weak self] error in
            Task { @MainActor in
                self?.isProfileLoading = false
                if let error = error {
                    self?.profileErrorMessage = error.localizedDescription
                    return
                }
                self?.profileMessage = "Password reset email sent."
            }
        }
    }

    func changeAccountEmail(_ newEmail: String) {
        guard let currentUser = Auth.auth().currentUser else {
            profileErrorMessage = "Please sign in again before changing your email."
            return
        }
        guard let companyId = currentCompanyId, !companyId.isEmpty else {
            profileErrorMessage = "Open a workspace before changing your email."
            return
        }

        let cleanEmail = newEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard cleanEmail.contains("@"), cleanEmail.contains(".") else {
            profileErrorMessage = "Enter a valid email address."
            return
        }

        isProfileLoading = true
        profileMessage = ""
        profileErrorMessage = ""

        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2")
            .httpsCallable("changeAccountEmail")
            .call([
                "companyId": companyId,
                "email": cleanEmail
            ]) { [weak self] result, error in
                Task { @MainActor in
                    guard let self else { return }
                    if let error {
                        self.isProfileLoading = false
                        self.profileErrorMessage = error.localizedDescription
                        return
                    }

                    let data = result?.data as? [String: Any]
                    let profile = data?["profile"] as? [String: Any]
                    self.accountEmail = (profile?["email"] as? String) ?? cleanEmail
                    self.profileMessage = (data?["message"] as? String) ?? "Email updated. You can change it again after 10 days."

                    currentUser.reload { [weak self] _ in
                        Task { @MainActor in
                            guard let self else { return }
                            self.accountEmail = Auth.auth().currentUser?.email ?? self.accountEmail
                            // Send a verification email to the new address so the user
                            // confirms ownership and clears the unverified flag (best-effort).
                            if let user = Auth.auth().currentUser, !user.isEmailVerified {
                                let actionSettings = ActionCodeSettings()
                                actionSettings.url = URL(string: "https://nivadesk.app/login")
                                user.sendEmailVerification(with: actionSettings, completion: nil)
                            }
                            self.isProfileLoading = false
                            self.loadAccountProfile()
                        }
                    }
                }
            }
        #else
        isProfileLoading = false
        profileErrorMessage = "Email change requires Firebase Functions."
        #endif
    }

    func joinCompany(companyId: String) {
        guard let user = Auth.auth().currentUser else {
            profileErrorMessage = "Please sign in again before joining a company."
            return
        }

        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty else {
            profileErrorMessage = "Please enter a Company ID."
            return
        }

        isProfileLoading = true
        profileMessage = ""
        profileErrorMessage = ""

        validateCompanyAccess(companyId: cleanCompanyId, user: user) { [weak self] hasAccess in
            Task { @MainActor in
                guard let self else { return }
                guard hasAccess else {
                    self.isProfileLoading = false
                    self.profileErrorMessage = "Access denied. Ask the workspace owner to add your User ID first, then try again."
                    return
                }

                self.activateCompany(cleanCompanyId, user: user, message: "Workspace connected.")
            }
        }
    }

    func usePersonalCompany() {
        guard let user = Auth.auth().currentUser else { return }
        isProfileLoading = true
        profileMessage = ""
        profileErrorMessage = ""

        ensureCompanyDocument(for: user) { [weak self] error in
            Task { @MainActor in
                guard let self else { return }
                if let error = error {
                    self.isProfileLoading = false
                    self.profileErrorMessage = error.localizedDescription
                    return
                }
                self.activateCompany(user.uid, user: user, message: "Switched to your own workspace.")
            }
        }
    }

    func addTeamMember(uid: String, email: String, displayName: String = "", role: String = "member", access: [String: Bool] = studioDefaultMemberAccess()) {
        guard isCompanyOwner,
              let companyId = currentCompanyId,
              !companyId.isEmpty else {
            profileErrorMessage = "Only the workspace owner can add team members."
            return
        }

        guard currentPlanEntitlements.teamAccessEnabled else {
            profileErrorMessage = "Team access is available on the NivaDesk Team monthly plan."
            return
        }

        guard currentPlanEntitlements.canAddTeamMember(currentMemberCount: teamMembers.count) else {
            profileErrorMessage = "This plan allows \(currentPlanEntitlements.teamLimitText). Upgrade the workspace plan to add more people."
            return
        }

        let cleanUid = uid.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanDisplayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanRole = normalizedTeamRoleForWrite(role)
        let cleanAccess = accessForRoleWrite(cleanRole, fallback: access)
        guard !cleanUid.isEmpty else {
            profileErrorMessage = "Please enter the new user's Firebase UID."
            return
        }

        guard cleanUid != currentUserId else {
            profileErrorMessage = "You are already the owner of this workspace."
            return
        }

        isProfileLoading = true
        profileMessage = ""
        profileErrorMessage = ""

        validateWorkspacePlanAction(action: "add_team_member") { [weak self] allowed, message in
            Task { @MainActor in
                guard let self else { return }
                guard allowed else {
                    self.isProfileLoading = false
                    self.profileErrorMessage = message
                    return
                }

                self.commitAddTeamMember(companyId: companyId, cleanUid: cleanUid, cleanEmail: cleanEmail, cleanDisplayName: cleanDisplayName, cleanRole: cleanRole, cleanAccess: cleanAccess)
            }
        }
    }

    private func commitAddTeamMember(companyId: String, cleanUid: String, cleanEmail: String, cleanDisplayName: String, cleanRole: String, cleanAccess: [String: Bool]) {
        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2")
            .httpsCallable("addWorkspaceTeamMember")
            .call([
                "companyId": companyId,
                "memberUid": cleanUid,
                "email": cleanEmail,
                "displayName": cleanDisplayName,
                "role": cleanRole,
                "access": cleanAccess
            ]) { [weak self] _, error in
                Task { @MainActor in
                    guard let self else { return }
                    if let error {
                        let message = (error as NSError).localizedDescription.lowercased()
                        if message.contains("not found") || message.contains("not-found") || message.contains("function") {
                            self.commitAddTeamMemberDirectly(companyId: companyId, cleanUid: cleanUid, cleanEmail: cleanEmail, cleanDisplayName: cleanDisplayName, cleanRole: cleanRole, cleanAccess: cleanAccess)
                            return
                        }
                        self.isProfileLoading = false
                        self.profileErrorMessage = error.localizedDescription
                        return
                    }

                    self.isProfileLoading = false
                    self.profileMessage = "Team member added. They will now see this workspace in Available Workspaces after refreshing."
                    self.loadAccountProfile()
                }
            }
        #else
        commitAddTeamMemberDirectly(companyId: companyId, cleanUid: cleanUid, cleanEmail: cleanEmail, cleanDisplayName: cleanDisplayName, cleanRole: cleanRole, cleanAccess: cleanAccess)
        #endif
    }

    private func commitAddTeamMemberDirectly(companyId: String, cleanUid: String, cleanEmail: String, cleanDisplayName: String, cleanRole: String, cleanAccess: [String: Bool]) {
        let storedRole = storedBaseTeamRoleForWrite(cleanRole)
        let customRoleId = customTeamRoleIdForWrite(cleanRole)
        var memberPayload: [String: Any] = [
            "uid": cleanUid,
            "email": cleanEmail,
            "displayName": cleanDisplayName,
            "photoURL": "",
            "role": storedRole,
            "access": cleanAccess,
            "addedBy": currentUserId ?? "",
            "addedAt": FieldValue.serverTimestamp()
        ]
        if let customRoleId {
            memberPayload["customRoleId"] = customRoleId
        }

        var accessPayload: [String: Any] = [
            "companyId": companyId,
            "name": companyName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "My Studio" : companyName.trimmingCharacters(in: .whitespacesAndNewlines),
            "ownerUid": currentUserId ?? "",
            "ownerEmail": accountEmail,
            "role": storedRole,
            "access": cleanAccess,
            "memberEmail": cleanEmail,
            "memberDisplayName": cleanDisplayName,
            "memberPhotoURL": "",
            "addedBy": currentUserId ?? "",
            "addedAt": FieldValue.serverTimestamp(),
            "updatedAt": FieldValue.serverTimestamp()
        ]
        if let customRoleId {
            accessPayload["customRoleId"] = customRoleId
        }

        let companyRef = db.collection("companies").document(companyId)
        let accessRef = db.collection("users").document(cleanUid).collection("workspaceAccess").document(companyId)

        let batch = db.batch()
        var companyPayload: [String: Any] = [
            "members": [cleanUid: memberPayload],
            "memberRoles": [cleanUid: storedRole],
            "memberAccess": [cleanUid: cleanAccess],
            "memberUids": FieldValue.arrayUnion([cleanUid]),
            "updatedAt": FieldValue.serverTimestamp()
        ]
        if let customRoleId {
            companyPayload["memberCustomRoles"] = [cleanUid: customRoleId]
        }
        batch.setData(companyPayload, forDocument: companyRef, merge: true)
        batch.setData(accessPayload, forDocument: accessRef, merge: true)

        batch.commit { [weak self] error in
            Task { @MainActor in
                self?.isProfileLoading = false
                if let error = error {
                    self?.profileErrorMessage = error.localizedDescription
                    return
                }

                self?.profileMessage = "Team member added. They will now see this workspace in Available Workspaces after refreshing."
                self?.loadAccountProfile()
            }
        }
    }

    func updateTeamMemberRole(uid: String, role: String) {
        guard isCompanyOwner,
              let companyId = currentCompanyId,
              !companyId.isEmpty else {
            profileErrorMessage = "Only the workspace owner can change team roles."
            return
        }

        let cleanUid = uid.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanRole = normalizedTeamRoleForWrite(role)
        let cleanAccess = accessForRoleWrite(cleanRole)
        guard !cleanUid.isEmpty, cleanUid != currentUserId else { return }

        isProfileLoading = true
        profileMessage = ""
        profileErrorMessage = ""

        let companyRef = db.collection("companies").document(companyId)
        let accessRef = db.collection("users").document(cleanUid).collection("workspaceAccess").document(companyId)
        let storedRole = storedBaseTeamRoleForWrite(cleanRole)
        let customRoleId = customTeamRoleIdForWrite(cleanRole)

        let batch = db.batch()
        var companyUpdate: [String: Any] = [
            "members.\(cleanUid).role": storedRole,
            "members.\(cleanUid).access": cleanAccess,
            "members.\(cleanUid).updatedAt": FieldValue.serverTimestamp(),
            "memberRoles.\(cleanUid)": storedRole,
            "memberAccess.\(cleanUid)": cleanAccess,
            "updatedAt": FieldValue.serverTimestamp()
        ]
        if let customRoleId {
            companyUpdate["members.\(cleanUid).customRoleId"] = customRoleId
            companyUpdate["memberCustomRoles.\(cleanUid)"] = customRoleId
        } else {
            companyUpdate["members.\(cleanUid).customRoleId"] = FieldValue.delete()
            companyUpdate["memberCustomRoles.\(cleanUid)"] = FieldValue.delete()
        }
        batch.updateData(companyUpdate, forDocument: companyRef)
        var accessUpdate: [String: Any] = [
            "role": storedRole,
            "access": cleanAccess,
            "updatedAt": FieldValue.serverTimestamp()
        ]
        if let customRoleId {
            accessUpdate["customRoleId"] = customRoleId
        } else {
            accessUpdate["customRoleId"] = FieldValue.delete()
        }
        batch.setData(accessUpdate, forDocument: accessRef, merge: true)

        batch.commit { [weak self] error in
            Task { @MainActor in
                self?.isProfileLoading = false
                if let error = error {
                    self?.profileErrorMessage = error.localizedDescription
                    return
                }

                self?.profileMessage = "Team role updated."
                self?.loadAccountProfile()
            }
        }
    }

    func saveCustomTeamRole(id: String? = nil, name: String, baseRole: String, access: [String: Bool], completion: ((Bool) -> Void)? = nil) {
        guard isCompanyOwner,
              let companyId = currentCompanyId,
              !companyId.isEmpty else {
            profileErrorMessage = "Only the workspace owner can change role profiles."
            completion?(false)
            return
        }

        guard currentPlanEntitlements.teamAccessEnabled else {
            profileErrorMessage = "Custom roles require NivaDesk Team."
            completion?(false)
            return
        }

        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty else {
            profileErrorMessage = "Role name is required."
            completion?(false)
            return
        }

        let cleanRoleId = id?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let cleanBaseRole = studioNormalizedTeamRole(baseRole, fallback: "member")
        let storedBaseRole = cleanBaseRole == "viewer" || cleanBaseRole == "workflow" ? cleanBaseRole : "member"
        let cleanAccess = studioCleanMemberAccess(access)

        isProfileLoading = true
        profileMessage = ""
        profileErrorMessage = ""

        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2")
            .httpsCallable("saveWorkspaceCustomRole")
            .call([
                "companyId": companyId,
                "roleId": cleanRoleId,
                "name": cleanName,
                "baseRole": storedBaseRole,
                "access": cleanAccess
            ]) { [weak self] _, error in
                Task { @MainActor in
                    guard let self else { return }
                    self.isProfileLoading = false
                    if let error {
                        self.profileErrorMessage = error.localizedDescription
                        completion?(false)
                        return
                    }
                    self.profileMessage = "Role profile saved."
                    self.loadAccountProfile()
                    completion?(true)
                }
            }
        #else
        isProfileLoading = false
        profileErrorMessage = "Firebase Functions is required to save custom roles."
        completion?(false)
        #endif
    }

    func deleteCustomTeamRole(_ role: StudioCustomTeamRole) {
        guard isCompanyOwner,
              let companyId = currentCompanyId,
              !companyId.isEmpty else {
            profileErrorMessage = "Only the workspace owner can delete role profiles."
            return
        }

        isProfileLoading = true
        profileMessage = ""
        profileErrorMessage = ""

        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2")
            .httpsCallable("deleteWorkspaceCustomRole")
            .call([
                "companyId": companyId,
                "roleId": role.id
            ]) { [weak self] _, error in
                Task { @MainActor in
                    guard let self else { return }
                    self.isProfileLoading = false
                    if let error {
                        self.profileErrorMessage = error.localizedDescription
                        return
                    }
                    self.profileMessage = "Role profile deleted."
                    self.loadAccountProfile()
                }
            }
        #else
        isProfileLoading = false
        profileErrorMessage = "Firebase Functions is required to delete custom roles."
        #endif
    }

    func updateTeamMemberAccess(uid: String, access: [String: Bool]) {
        guard isCompanyOwner,
              let companyId = currentCompanyId,
              !companyId.isEmpty else {
            profileErrorMessage = "Only the workspace owner can change team access."
            return
        }

        let cleanUid = uid.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanUid.isEmpty, cleanUid != currentUserId else { return }

        let cleanAccess = studioCleanMemberAccess(access)
        isProfileLoading = true
        profileMessage = ""
        profileErrorMessage = ""

        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2")
            .httpsCallable("updateWorkspaceMemberAccess")
            .call([
                "companyId": companyId,
                "memberUid": cleanUid,
                "access": cleanAccess
            ]) { [weak self] _, error in
                Task { @MainActor in
                    guard let self else { return }
                    self.isProfileLoading = false
                    if let error {
                        self.profileErrorMessage = error.localizedDescription
                        return
                    }
                    self.profileMessage = "Team member access updated."
                    self.loadAccountProfile()
                }
            }
        #else
        let companyRef = db.collection("companies").document(companyId)
        let accessRef = db.collection("users").document(cleanUid).collection("workspaceAccess").document(companyId)
        let batch = db.batch()
        batch.setData([
            "memberAccess": [cleanUid: cleanAccess],
            "members": [
                cleanUid: [
                    "access": cleanAccess,
                    "updatedAt": FieldValue.serverTimestamp()
                ]
            ],
            "updatedAt": FieldValue.serverTimestamp()
        ], forDocument: companyRef, merge: true)
        batch.setData([
            "access": cleanAccess,
            "updatedAt": FieldValue.serverTimestamp()
        ], forDocument: accessRef, merge: true)
        batch.commit { [weak self] error in
            Task { @MainActor in
                self?.isProfileLoading = false
                if let error {
                    self?.profileErrorMessage = error.localizedDescription
                    return
                }
                self?.profileMessage = "Team member access updated."
                self?.loadAccountProfile()
            }
        }
        #endif
    }

    func updateTeamMemberProfile(uid: String, displayName: String, email: String) {
        guard isCompanyOwner,
              let companyId = currentCompanyId,
              !companyId.isEmpty else {
            profileErrorMessage = "Only the workspace owner can change team member profiles."
            return
        }

        let cleanUid = uid.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanDisplayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanUid.isEmpty, cleanUid != currentUserId else { return }

        isProfileLoading = true
        profileMessage = ""
        profileErrorMessage = ""

        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2")
            .httpsCallable("updateWorkspaceMemberProfile")
            .call([
                "companyId": companyId,
                "memberUid": cleanUid,
                "displayName": cleanDisplayName,
                "email": cleanEmail
            ]) { [weak self] _, error in
                Task { @MainActor in
                    guard let self else { return }
                    if let error {
                        let message = (error as NSError).localizedDescription.lowercased()
                        if message.contains("not found") || message.contains("not-found") || message.contains("function") {
                            self.updateTeamMemberProfileDirectly(companyId: companyId, cleanUid: cleanUid, displayName: cleanDisplayName, email: cleanEmail)
                            return
                        }
                        self.isProfileLoading = false
                        self.profileErrorMessage = error.localizedDescription
                        return
                    }
                    self.isProfileLoading = false
                    self.profileMessage = "Team member profile updated."
                    self.loadAccountProfile()
                }
            }
        #else
        updateTeamMemberProfileDirectly(companyId: companyId, cleanUid: cleanUid, displayName: cleanDisplayName, email: cleanEmail)
        #endif
    }

    private func updateTeamMemberProfileDirectly(companyId: String, cleanUid: String, displayName: String, email: String) {
        let companyRef = db.collection("companies").document(companyId)
        let accessRef = db.collection("users").document(cleanUid).collection("workspaceAccess").document(companyId)
        let batch = db.batch()
        batch.setData([
            "members": [
                cleanUid: [
                    "displayName": displayName,
                    "email": email,
                    "updatedAt": FieldValue.serverTimestamp()
                ]
            ],
            "updatedAt": FieldValue.serverTimestamp()
        ], forDocument: companyRef, merge: true)
        batch.setData([
            "memberDisplayName": displayName,
            "memberEmail": email,
            "updatedAt": FieldValue.serverTimestamp()
        ], forDocument: accessRef, merge: true)
        batch.commit { [weak self] error in
            Task { @MainActor in
                guard let self else { return }
                self.isProfileLoading = false
                if let error {
                    self.profileErrorMessage = error.localizedDescription
                    return
                }
                self.profileMessage = "Team member profile updated."
                self.loadAccountProfile()
            }
        }
    }

    func removeTeamMember(uid: String) {
        guard isCompanyOwner,
              let companyId = currentCompanyId,
              !companyId.isEmpty else {
            profileErrorMessage = "Only the workspace owner can remove team members."
            return
        }

        let cleanUid = uid.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanUid.isEmpty, cleanUid != currentUserId else { return }

        isProfileLoading = true
        profileMessage = ""
        profileErrorMessage = ""

        removeTeamMemberOnServer(companyId: companyId, cleanUid: cleanUid)
    }

    private func removeTeamMemberOnServer(companyId: String, cleanUid: String) {
        #if canImport(FirebaseFunctions)
        let payload: [String: Any] = [
            "companyId": companyId,
            "memberUid": cleanUid
        ]

        Functions.functions(region: "europe-west2")
            .httpsCallable("removeWorkspaceTeamMember")
            .call(payload) { [weak self] result, error in
                Task { @MainActor in
                    guard let self else { return }

                    if let error = error {
                        // Older deployments may not have this callable yet. Keep a direct Firestore fallback
                        // so owners can still remove members while the backend patch is being deployed.
                        let nsError = error as NSError
                        let message = nsError.localizedDescription.lowercased()
                        if message.contains("not found") || message.contains("not-found") || message.contains("function") {
                            self.removeTeamMemberDirectly(companyId: companyId, cleanUid: cleanUid)
                            return
                        }

                        self.isProfileLoading = false
                        self.profileErrorMessage = error.localizedDescription
                        return
                    }

                    self.finishTeamMemberRemoval(companyId: companyId, cleanUid: cleanUid)
                }
            }
        #else
        removeTeamMemberDirectly(companyId: companyId, cleanUid: cleanUid)
        #endif
    }

    private func removeTeamMemberDirectly(companyId: String, cleanUid: String) {
        let companyRef = db.collection("companies").document(companyId)
        let accessRef = db.collection("users").document(cleanUid).collection("workspaceAccess").document(companyId)
        let requestRef = db.collection("workspaceJoinRequests").document("\(companyId)_\(cleanUid)")

        let batch = db.batch()
        batch.updateData([
            "members.\(cleanUid)": FieldValue.delete(),
            "memberRoles.\(cleanUid)": FieldValue.delete(),
            "memberCustomRoles.\(cleanUid)": FieldValue.delete(),
            "memberAccess.\(cleanUid)": FieldValue.delete(),
            "memberUids": FieldValue.arrayRemove([cleanUid]),
            "updatedAt": FieldValue.serverTimestamp()
        ], forDocument: companyRef)
        batch.deleteDocument(accessRef)
        batch.setData([
            "targetCompanyId": companyId,
            "requesterUid": cleanUid,
            "status": "removed",
            "removedBy": currentUserId ?? "",
            "removedAt": FieldValue.serverTimestamp(),
            "updatedAt": FieldValue.serverTimestamp()
        ], forDocument: requestRef, merge: true)

        batch.commit { [weak self] error in
            Task { @MainActor in
                guard let self else { return }
                if let error = error {
                    self.isProfileLoading = false
                    self.profileErrorMessage = error.localizedDescription
                    return
                }

                self.finishTeamMemberRemoval(companyId: companyId, cleanUid: cleanUid)
            }
        }
    }

    private func finishTeamMemberRemoval(companyId: String, cleanUid: String) {
        teamMembers.removeAll { $0.id == cleanUid }
        joinRequests.removeAll {
            $0.requesterUid == cleanUid &&
            ["accepted", "approved"].contains($0.status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
        }
        isProfileLoading = false
        profileMessage = "Team member removed."
        reloadCompanyProfileAfterTeamWrite(companyId: companyId, user: Auth.auth().currentUser)
    }


    func requestWorkspaceAccess(ownerIdentifier: String) {
        guard let user = Auth.auth().currentUser else {
            profileErrorMessage = "Please sign in again before sending a request."
            return
        }

        let cleanIdentifier = ownerIdentifier.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanIdentifier.isEmpty else {
            profileErrorMessage = "Please enter the workspace owner's email or Company ID."
            return
        }

        let currentEmail = (user.email ?? accountEmail).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let identifierIsOwnEmail = !currentEmail.isEmpty && cleanIdentifier.lowercased() == currentEmail
        guard cleanIdentifier != user.uid && !identifierIsOwnEmail else {
            profileErrorMessage = "This is already your own workspace."
            return
        }

        isProfileLoading = true
        profileMessage = ""
        profileErrorMessage = ""

        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2")
            .httpsCallable("requestWorkspaceAccess")
            .call([
                "ownerIdentifier": cleanIdentifier,
                "ownerCompanyId": cleanIdentifier,
                "source": "mac"
            ]) { [weak self] _, error in
                Task { @MainActor in
                    self?.isProfileLoading = false
                    if let error {
                        self?.profileErrorMessage = error.localizedDescription
                        return
                    }
                    self?.profileMessage = "Access request sent. The workspace owner can approve it from Team Access."
                }
            }
        #else
        isProfileLoading = false
        profileErrorMessage = "Firebase Functions is required to request workspace access by email."
        #endif
    }

    func acceptJoinRequest(_ request: StudioJoinRequest, role: String = "member") {
        guard isCompanyOwner,
              let companyId = currentCompanyId,
              !companyId.isEmpty,
              request.targetCompanyId == companyId else {
            profileErrorMessage = "Only the workspace owner can approve this request."
            return
        }

        guard currentPlanEntitlements.teamAccessEnabled else {
            profileErrorMessage = "Team access is available on the NivaDesk Team monthly plan."
            return
        }

        guard currentPlanEntitlements.canAddTeamMember(currentMemberCount: teamMembers.count) else {
            profileErrorMessage = "This plan allows \(currentPlanEntitlements.teamLimitText). Upgrade the workspace plan before approving more people."
            return
        }

        let cleanUid = request.requesterUid.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanRole = normalizedTeamRoleForWrite(role)
        guard !cleanUid.isEmpty, cleanUid != currentUserId else { return }

        isProfileLoading = true
        profileMessage = ""
        profileErrorMessage = ""

        validateWorkspacePlanAction(action: "add_team_member") { [weak self] allowed, message in
            Task { @MainActor in
                guard let self else { return }
                guard allowed else {
                    self.isProfileLoading = false
                    self.profileErrorMessage = message
                    return
                }

                self.commitAcceptJoinRequest(request, companyId: companyId, cleanUid: cleanUid, cleanRole: cleanRole)
            }
        }
    }

    private func commitAcceptJoinRequest(_ request: StudioJoinRequest, companyId: String, cleanUid: String, cleanRole: String) {
        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2")
            .httpsCallable("approveWorkspaceJoinRequest")
            .call([
                "companyId": companyId,
                "requestId": request.id,
                "role": cleanRole
            ]) { [weak self] _, error in
                Task { @MainActor in
                    guard let self else { return }
                    self.isProfileLoading = false
                    if let error {
                        self.profileErrorMessage = error.localizedDescription
                        return
                    }

                    self.profileMessage = "Access request approved. The user will now see this workspace in Available Workspaces."
                    self.reloadCompanyProfileAfterTeamWrite(companyId: companyId, user: Auth.auth().currentUser)
                }
            }
        #else
        isProfileLoading = false
        profileErrorMessage = "Firebase Functions is required to approve workspace access."
        #endif
    }

    private func reloadCompanyProfileAfterTeamWrite(companyId: String, user: User?) {
        guard let user else {
            loadAccountProfile()
            return
        }

        db.collection("companies").document(companyId).getDocument(source: .server) { [weak self] snapshot, error in
            Task { @MainActor in
                guard let self else { return }
                if let error = error {
                    if self.profileErrorMessage.isEmpty {
                        self.profileErrorMessage = error.localizedDescription
                    }
                    self.loadAccountProfile()
                    return
                }

                guard let data = snapshot?.data() else {
                    self.loadAccountProfile()
                    return
                }

                self.applyCompanyProfile(data: data, companyId: companyId, user: user, shouldSyncMemberIndex: false)
            }
        }
    }

    private func repairAcceptedJoinRequestsIfNeeded(companyId: String, existingMemberIds: Set<String>) {
        guard isCompanyOwner,
              !isRepairingAcceptedJoinRequests,
              !companyId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        isRepairingAcceptedJoinRequests = true

        db.collection("workspaceJoinRequests")
            .whereField("targetCompanyId", isEqualTo: companyId)
            .getDocuments { [weak self] snapshot, error in
                Task { @MainActor in
                    guard let self else { return }

                    if let error = error {
                        self.isRepairingAcceptedJoinRequests = false
                        if self.profileErrorMessage.isEmpty {
                            self.profileErrorMessage = error.localizedDescription
                        }
                        return
                    }

                    let acceptedRequests = snapshot?.documents.compactMap { document in
                        self.joinRequest(from: document.documentID, data: document.data())
                    }
                    .filter { request in
                        let status = request.status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                        return (status == "accepted" || status == "approved") && !existingMemberIds.contains(request.requesterUid)
                    } ?? []

                    guard !acceptedRequests.isEmpty else {
                        self.isRepairingAcceptedJoinRequests = false
                        return
                    }

                    let companyRef = self.db.collection("companies").document(companyId)
                    let batch = self.db.batch()
                    var companyUpdate: [String: Any] = [
                        "memberUids": FieldValue.arrayUnion(acceptedRequests.map(\.requesterUid)),
                        "updatedAt": FieldValue.serverTimestamp()
                    ]

                    for request in acceptedRequests {
                        let cleanUid = request.requesterUid.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !cleanUid.isEmpty else { continue }

                        let memberPayload: [String: Any] = [
                            "uid": cleanUid,
                            "email": request.requesterEmail,
                            "displayName": request.requesterDisplayName,
                            "photoURL": request.requesterPhotoURL,
                            "role": "member",
                            "addedBy": self.currentUserId ?? "",
                            "addedAt": FieldValue.serverTimestamp(),
                            "updatedAt": FieldValue.serverTimestamp(),
                            "repairedFromJoinRequest": true
                        ]

                        let accessPayload: [String: Any] = [
                            "companyId": companyId,
                            "name": self.companyName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "My Studio" : self.companyName.trimmingCharacters(in: .whitespacesAndNewlines),
                            "ownerUid": self.currentUserId ?? "",
                            "ownerEmail": self.accountEmail,
                            "role": "member",
                            "memberEmail": request.requesterEmail,
                            "memberPhotoURL": request.requesterPhotoURL,
                            "addedBy": self.currentUserId ?? "",
                            "addedAt": FieldValue.serverTimestamp(),
                            "updatedAt": FieldValue.serverTimestamp(),
                            "repairedFromJoinRequest": true
                        ]

                        companyUpdate["members.\(cleanUid)"] = memberPayload
                        companyUpdate["memberRoles.\(cleanUid)"] = "member"
                        let accessRef = self.db.collection("users").document(cleanUid).collection("workspaceAccess").document(companyId)
                        batch.setData(accessPayload, forDocument: accessRef, merge: true)
                    }

                    batch.updateData(companyUpdate, forDocument: companyRef)
                    batch.commit { [weak self] error in
                        Task { @MainActor in
                            guard let self else { return }
                            self.isRepairingAcceptedJoinRequests = false
                            if let error = error {
                                if self.profileErrorMessage.isEmpty {
                                    self.profileErrorMessage = error.localizedDescription
                                }
                                return
                            }
                            self.reloadCompanyProfileAfterTeamWrite(companyId: companyId, user: Auth.auth().currentUser)
                        }
                    }
                }
            }
    }

    func declineJoinRequest(_ request: StudioJoinRequest) {
        guard isCompanyOwner,
              let companyId = currentCompanyId,
              request.targetCompanyId == companyId else {
            profileErrorMessage = "Only the workspace owner can decline this request."
            return
        }

        isProfileLoading = true
        profileMessage = ""
        profileErrorMessage = ""

        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2")
            .httpsCallable("declineWorkspaceJoinRequest")
            .call([
                "companyId": companyId,
                "requestId": request.id
            ]) { [weak self] _, error in
                Task { @MainActor in
                    guard let self else { return }
                    self.isProfileLoading = false
                    if let error {
                        self.profileErrorMessage = error.localizedDescription
                        return
                    }

                    self.profileMessage = "Access request declined."
                    self.loadJoinRequests(for: companyId)
                }
            }
        #else
        isProfileLoading = false
        profileErrorMessage = "Firebase Functions is required to decline workspace access."
        #endif
    }

    func logout() {
        // Remove this device's push registration while the session is still
        // authenticated; after signOut() the Firestore rules reject the delete
        // and the device would keep receiving the old workspace's pushes.
        PushNotificationManager.shared.unregisterStoredDeviceToken { [weak self] in
            self?.finishLogout()
        }
    }

    private func finishLogout() {
        // Blank the home-screen Notes widget so notes don't outlive the session.
        WidgetNotesBridge.clear()
        do {
            stopRealtimeWorkspaceListeners()
            try Auth.auth().signOut()
            interfaceSessionId = UUID()
            currentUserId = nil
            currentCompanyId = nil
            isWorkspaceReady = false
            isLoggedIn = false
            isLocalUnlockSatisfied = true
            localUnlockMessage = ""
            bypassNextLocalUnlockAfterInteractiveSignIn = false
            errorMessage = ""
            clearProfileState()
            clearDeviceLocalWorkspaceCardCache()
        } catch {
            errorMessage = error.localizedDescription
            print("Çıkış yapılamadı: \(error.localizedDescription)")
        }
    }

    /// Card layout, colours, sizes and per-card visibility are stored per-device via
    /// @AppStorage, not per-account. Without clearing them on logout, signing into a
    /// *different* account on the same device inherits the previous account's cached
    /// appearance (colours/order/visibility) — and can even re-upload that stale cache to
    /// the new company's cloud workspace profile. Clearing here makes every account start
    /// from clean code defaults (no colours + default card order); a returning account
    /// restores its own layout from its cloud workspace profile on next login.
    private func clearDeviceLocalWorkspaceCardCache() {
        let defaults = UserDefaults.standard
        let keys: [String] = [
            "sharedWorkspaceSnapshotJSONV1",
            "typeWorkspaceSnapshotsJSONV1",
            "kartRenkleriJSONV1",
            "kartYerlesimiJSON",
            "kartYukseklikleriJSON",
            // Workspace-shared colour meaning labels mirrored from companySettings;
            // without clearing, another account on this device inherits them.
            "cardColorMeaningsJSON",
            "sutunGenislikleriJSONV4",
            "phoneKartSirasiJSONV1",
            "phoneOrderCompactViewV1",
            "workspaceCardsLockedV1",
            "workspaceOwnerCardSyncDismissedV1",
            // per-card visibility
            "showCardPreview", "showCardSummary", "showCardCustomer", "showCardDelivery",
            "showCardCommunication", "showCardNotes", "showCardFinancial", "showCardStatus",
            "showCardShipping", "showCardCustomerNotes", "showCardMaterials", "showCardPriority",
            "showCardInvoiceItems", "showCardSchedule", "showCardHistoryLog", "showCardClientFiles",
            "showCardToDo", "showCardWorkTime"
        ]
        for key in keys { defaults.removeObject(forKey: key) }
    }

    #if os(iOS)
    private static func currentRootViewController() -> UIViewController? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }?
            .rootViewController
    }
    #endif

    #if os(macOS)
    private static func currentKeyWindow() -> NSWindow? {
        NSApplication.shared.keyWindow ?? NSApplication.shared.windows.first { $0.isVisible }
    }
    #endif

    private func clearProfileState() {
        accountEmail = ""
        accountDisplayName = ""
        accountPhotoURL = ""
        companyName = "My Studio"
        profileMessage = ""
        profileErrorMessage = ""
        isProfileLoading = false
        teamMembers = []
        availableWorkspaces = []
        joinRequests = []
        customTeamRoles = []
        isCompanyOwner = false
        currentWorkspaceRole = "owner"
        currentWorkspaceRoleLabel = "Owner"
        currentWorkspaceAccess = studioDefaultMemberAccess()
        currentBillingPlan = .demo
        currentBillingInterval = nil
        billingPlanSource = "secure_default"
        billingUpdatedAt = nil
        UserDefaults.standard.set(currentBillingPlan.rawValue, forKey: billingPlanDefaultsKey)
    }

    func switchToWorkspace(_ workspace: StudioWorkspaceOption) {
        guard let user = Auth.auth().currentUser else {
            profileErrorMessage = "Please sign in again before switching workspace."
            return
        }

        isProfileLoading = true
        profileMessage = ""
        profileErrorMessage = ""

        validateCompanyAccess(companyId: workspace.id, user: user) { [weak self] hasAccess in
            Task { @MainActor in
                guard let self else { return }
                guard hasAccess else {
                    self.isProfileLoading = false
                    self.profileErrorMessage = "Access denied. Ask the workspace owner to add your User ID again."
                    self.loadAvailableWorkspaces(for: user)
                    return
                }

                self.activateCompany(workspace.id, user: user, message: "Switched to \(workspace.name.isEmpty ? "workspace" : workspace.name).")
            }
        }
    }

    func refreshAvailableWorkspaces() {
        guard let user = Auth.auth().currentUser else { return }
        loadAvailableWorkspaces(for: user)
    }

    private func resolveActiveCompany(for user: User) {
        db.collection("users").document(user.uid).getDocument { [weak self] snapshot, _ in
            let activeCompanyId = (snapshot?.data()?["activeCompanyId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            let preferredCompanyId = activeCompanyId?.isEmpty == false ? activeCompanyId! : user.uid

            self?.validateCompanyAccess(companyId: preferredCompanyId, user: user) { [weak self] hasAccess in
                Task { @MainActor in
                    guard let self else { return }
                    let finalCompanyId = hasAccess ? preferredCompanyId : user.uid
                    self.activateCompany(finalCompanyId, user: user, message: nil)
                }
            }
        }
    }

    // Offline safety-net resolver: reads ONLY the local cache (never waits on the
    // network) to find the active workspace, falling back to the personal workspace,
    // then activates it. Runs if the normal bootstrap hasn't completed in time.
    private func proceedWithCachedWorkspaceIfStalled(for user: User) {
        guard isLoggedIn, currentUserId == user.uid, !isWorkspaceReady else { return }
        db.collection("users").document(user.uid).getDocument(source: .cache) { [weak self] snapshot, _ in
            Task { @MainActor in
                guard let self, self.isLoggedIn, self.currentUserId == user.uid, !self.isWorkspaceReady else { return }
                let cachedActive = (snapshot?.data()?["activeCompanyId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
                let companyId = (cachedActive?.isEmpty == false) ? cachedActive! : user.uid
                self.activateCompany(companyId, user: user, message: nil)
            }
        }
    }

    private func activateCompany(_ companyId: String, user: User, message: String?) {
        // Idempotent: the normal bootstrap path and the offline safety-net can both
        // reach here. If we're already activated for this exact user + workspace, skip
        // re-attaching listeners.
        if isWorkspaceReady, currentUserId == user.uid, currentCompanyId == companyId {
            return
        }
        let isChangingWorkspace = currentCompanyId != companyId
        if isChangingWorkspace {
            isWorkspaceReady = false
        }

        currentUserId = user.uid
        currentCompanyId = companyId
        accountEmail = user.email ?? ""
        accountDisplayName = user.displayName ?? ""
        accountPhotoURL = user.photoURL?.absoluteString ?? googleProfilePhotoURL
        isLoggedIn = true

        let payload: [String: Any] = [
            "uid": user.uid,
            "email": user.email ?? "",
            "activeCompanyId": companyId,
            "updatedAt": FieldValue.serverTimestamp()
        ]

        db.collection("users").document(user.uid).setData(payload, merge: true)

        startRealtimeWorkspaceListeners(for: user, companyId: companyId)

        isProfileLoading = false
        isWorkspaceReady = true
        if let message { profileMessage = message }
        loadAccountProfile()
    }

    private func startRealtimeWorkspaceListeners(for user: User, companyId: String) {
        startWorkspaceAccessListener(for: user)
        startActiveCompanyListener(companyId: companyId, user: user)
        startUserDocListener(for: user)
    }

    private func stopRealtimeWorkspaceListeners() {
        activeCompanyListener?.remove()
        activeCompanyListener = nil
        activeCompanyListenerCompanyId = nil

        workspaceAccessListener?.remove()
        workspaceAccessListener = nil
        workspaceAccessListenerUserId = nil

        userDocListener?.remove()
        userDocListener = nil
        userDocListenerUserId = nil
    }

    /// Live listener on `users/{uid}` so a server-side change to `activeCompanyId`
    /// (for example, when the owner approves this user's join request and the
    /// Cloud Function points them at the newly joined workspace) instantly switches
    /// the currently visible workspace without requiring a manual Team Access pick.
    private func startUserDocListener(for user: User) {
        if userDocListenerUserId == user.uid, userDocListener != nil { return }
        userDocListener?.remove()
        userDocListenerUserId = user.uid
        userDocListener = db.collection("users").document(user.uid).addSnapshotListener { [weak self] snapshot, error in
            Task { @MainActor in
                guard let self, error == nil, let data = snapshot?.data() else { return }
                let remoteActive = (data["activeCompanyId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                guard !remoteActive.isEmpty else { return }
                guard remoteActive != (self.currentCompanyId ?? "") else { return }
                // Verify the user still has access before switching — protects against
                // race conditions where the workspaceAccess subcollection hasn't been
                // populated yet on this device.
                self.validateCompanyAccess(companyId: remoteActive, user: user) { [weak self] hasAccess in
                    Task { @MainActor in
                        guard let self, hasAccess else { return }
                        self.activateCompany(remoteActive, user: user, message: nil)
                    }
                }
            }
        }
    }

    private func startActiveCompanyListener(companyId: String, user: User) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty else { return }

        if activeCompanyListenerCompanyId == cleanCompanyId, activeCompanyListener != nil {
            return
        }

        activeCompanyListener?.remove()
        activeCompanyListenerCompanyId = cleanCompanyId

        activeCompanyListener = db.collection("companies").document(cleanCompanyId).addSnapshotListener { [weak self] snapshot, error in
            Task { @MainActor in
                guard let self else { return }
                guard self.currentCompanyId == cleanCompanyId else { return }

                if let error = error {
                    if cleanCompanyId != user.uid {
                        self.handleActiveWorkspaceAccessLost(for: user, message: "Your access to this workspace changed. Switched to your own workspace.")
                    } else if self.profileErrorMessage.isEmpty {
                        self.profileErrorMessage = error.localizedDescription
                    }
                    return
                }

                // Cached snapshots can be stale (for example, fetched before this
                // user was added as a member). Never bounce a member to their own
                // workspace based on cache — only act on confirmed server data.
                let isFromCache = snapshot?.metadata.isFromCache ?? false

                guard let data = snapshot?.data(), snapshot?.exists == true else {
                    if cleanCompanyId != user.uid && !isFromCache {
                        self.handleActiveWorkspaceAccessLost(for: user, message: "This workspace is no longer available. Switched to your own workspace.")
                    }
                    return
                }

                if self.accessibleWorkspaceRole(from: data, companyId: cleanCompanyId, currentUid: user.uid) == nil {
                    if !isFromCache {
                        self.handleActiveWorkspaceAccessLost(for: user, message: "Your access to this workspace has been removed. Switched to your own workspace.")
                    }
                    return
                }

                self.applyCompanyProfile(data: data, companyId: cleanCompanyId, user: user, shouldSyncMemberIndex: false)
            }
        }
    }

    private func startWorkspaceAccessListener(for user: User) {
        if workspaceAccessListenerUserId == user.uid, workspaceAccessListener != nil {
            return
        }

        workspaceAccessListener?.remove()
        workspaceAccessListenerUserId = user.uid

        workspaceAccessListener = db.collection("users")
            .document(user.uid)
            .collection("workspaceAccess")
            .addSnapshotListener { [weak self] snapshot, error in
                Task { @MainActor in
                    guard let self else { return }

                    if let error = error {
                        if self.profileErrorMessage.isEmpty {
                            self.profileErrorMessage = error.localizedDescription
                        }
                        self.availableWorkspaces = self.personalWorkspaceFallback(for: user)
                        return
                    }

                    var workspaces = snapshot?.documents.compactMap { document in
                        self.workspaceOption(from: document.documentID, data: document.data(), currentUserId: user.uid)
                    } ?? []

                    if !workspaces.contains(where: { $0.id == user.uid }) {
                        workspaces.append(contentsOf: self.personalWorkspaceFallback(for: user))
                    }

                    self.availableWorkspaces = self.sortedWorkspaceOptions(workspaces)

                    guard let activeCompanyId = self.currentCompanyId, activeCompanyId != user.uid else {
                        return
                    }

                    if let activeWorkspace = workspaces.first(where: { $0.id == activeCompanyId }) {
                        let newRole = self.normalizedTeamRole(activeWorkspace.role)
                        if self.currentWorkspaceRole != newRole {
                            self.currentWorkspaceRole = newRole
                        }
                    }
                    // NOTE: We intentionally do NOT switch the user to their own
                    // workspace when the active company is missing from the
                    // users/{uid}/workspaceAccess index. That index can be stale or
                    // not yet synced for a freshly added member, which previously
                    // kicked valid members (e.g. Workflow Only) out to an empty
                    // personal workspace. The authoritative access check lives in
                    // startActiveCompanyListener, which reads the company document
                    // directly and handles genuine access removal.
                }
            }
    }

    private func handleActiveWorkspaceAccessLost(for user: User, message: String) {
        guard currentCompanyId != user.uid else { return }
        profileMessage = message
        activateCompany(user.uid, user: user, message: message)
    }

    private func applyCompanyProfile(data: [String: Any], companyId: String, user: User, shouldSyncMemberIndex: Bool) {
        let currentUid = user.uid
        let ownerUid = (data["ownerUid"] as? String) ?? companyId
        let ownerEmail = (data["ownerEmail"] as? String) ?? ""
        let ownerDisplayName = (data["ownerDisplayName"] as? String) ?? ""
        let ownerPhotoURL = (data["ownerPhotoURL"] as? String) ?? ""
        let memberProfile: [String: Any]? = {
            if let members = data["members"] as? [String: Any],
               let raw = members[currentUid] as? [String: Any] {
                return raw
            }
            return nil
        }()
        let memberDisplayName = memberProfile?["displayName"] as? String
        let memberPhotoURL = memberProfile?["photoURL"] as? String

        if let storedName = data["name"] as? String, !storedName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            companyName = storedName
        } else {
            companyName = "My Studio"
        }

        applyBillingPlan(from: data)

        let roleProfiles = parseCustomTeamRoles(from: data)
        let roleProfileMap = Dictionary(uniqueKeysWithValues: roleProfiles.map { ($0.id, $0) })
        let rawCurrentRole = memberRawRole(from: data, companyId: companyId, currentUid: currentUid) ?? "member"
        let resolvedRole = effectiveTeamRole(rawCurrentRole, customRoles: roleProfileMap)
        let memberAccess = data["memberAccess"] as? [String: Any] ?? [:]
        let memberProfileAccess = (memberProfile?["access"] as? [String: Any]) ?? [:]
        let rootAccess = memberAccess[currentUid] as? [String: Any] ?? [:]
        let combinedAccess = memberProfileAccess.merging(rootAccess) { _, rootValue in rootValue }
        isCompanyOwner = resolvedRole == "owner"
        currentWorkspaceRole = resolvedRole
        currentWorkspaceRoleLabel = displayLabelForTeamRole(rawCurrentRole, customRoles: roleProfileMap)
        currentWorkspaceAccess = roleAccess(rawCurrentRole, customRoles: roleProfileMap, fallback: combinedAccess, forceFullAccess: isCompanyOwner)
        customTeamRoles = roleProfiles
        teamMembers = parseTeamMembers(from: data, ownerUid: ownerUid, ownerEmail: ownerEmail, ownerDisplayName: ownerDisplayName, ownerPhotoURL: ownerPhotoURL)

        if isCompanyOwner {
            if shouldSyncMemberIndex {
                syncCompanyMemberIndex(companyId: companyId, members: teamMembers)
            }
            loadJoinRequests(for: companyId)
            repairAcceptedJoinRequestsIfNeeded(companyId: companyId, existingMemberIds: Set(teamMembers.map(\.id)))
        } else {
            joinRequests = []
        }

        accountEmail = user.email ?? ""
        accountDisplayName = (memberDisplayName ?? (currentUid == ownerUid ? ownerDisplayName : "")).trimmingCharacters(in: .whitespacesAndNewlines)
        accountPhotoURL = (memberPhotoURL ?? (currentUid == ownerUid ? ownerPhotoURL : "")).trimmingCharacters(in: .whitespacesAndNewlines)
    }



    private func applyBillingPlan(from data: [String: Any]) {
        let rawPlan = (data["billingPlan"] as? String) ?? ""
        let resolvedPlan = StudioBillingPlan(rawValue: rawPlan) ?? .demo
        currentBillingPlan = resolvedPlan
        quickReplyMenuEnabled = (data["quickReplyMenuEnabled"] as? Bool) ?? true
        let rawInterval = (data["billingInterval"] as? String) ?? ""
        currentBillingInterval = resolvedPlan == .demo ? nil : StudioStoreBillingInterval(rawValue: rawInterval)
        billingPlanSource = (data["billingPlanSource"] as? String) ?? (rawPlan.isEmpty ? "legacy_default" : "manual")
        billingUpdatedAt = (data["billingUpdatedAt"] as? Timestamp)?.dateValue()
        let addonStatus = ((data["billingStorageAddonStatus"] as? String) ?? "").lowercased()
        let addonActive = ["active", "trialing", "past_due"].contains(addonStatus)
        currentStorageAddonKey = addonActive ? ((data["billingStorageAddonKey"] as? String) ?? "") : ""
        currentStorageAddonMB = addonActive ? ((data["billingStorageAddonMB"] as? Int) ?? 0) : 0
        currentTeamMemberLimitEffective = (data["billingTeamMemberLimit"] as? Int)
            ?? (data["billingTeamMemberLimit"] as? NSNumber)?.intValue
            ?? Int((data["billingTeamMemberLimit"] as? Double) ?? 0)
        UserDefaults.standard.set(resolvedPlan.rawValue, forKey: billingPlanDefaultsKey)
    }

    func updateWorkspaceBillingPlan(_ plan: StudioBillingPlan) {
        profileErrorMessage = "Manual plan switching is disabled. Plans are managed through secure billing."
    }

    func prepareAppleSubscriptionPurchaseToken() async throws -> UUID {
        guard let companyId = currentCompanyId, !companyId.isEmpty else {
            throw NSError(domain: "StudioFlowBilling", code: 1, userInfo: [NSLocalizedDescriptionKey: "Company ID is not configured."])
        }

        #if canImport(FirebaseFunctions)
        let result = try await Functions.functions(region: "europe-west2")
            .httpsCallable("prepareAppleSubscriptionPurchase")
            .call(["companyId": companyId])
        guard let data = result.data as? [String: Any],
              let rawToken = data["appAccountToken"] as? String,
              let token = UUID(uuidString: rawToken) else {
            throw NSError(domain: "StudioFlowBilling", code: 2, userInfo: [NSLocalizedDescriptionKey: "Apple purchase account token could not be prepared."])
        }
        return token
        #else
        throw NSError(domain: "StudioFlowBilling", code: 3, userInfo: [NSLocalizedDescriptionKey: "Secure Apple billing is not available in this build."])
        #endif
    }

    func verifyAppleSubscriptionPurchase(_ purchase: StudioStoreVerifiedPurchase) async throws -> StudioBillingPlan {
        guard let companyId = currentCompanyId, !companyId.isEmpty else {
            throw NSError(domain: "StudioFlowBilling", code: 4, userInfo: [NSLocalizedDescriptionKey: "Company ID is not configured."])
        }

        #if canImport(FirebaseFunctions)
        let payload: [String: Any] = [
            "companyId": companyId,
            "signedTransactionInfo": purchase.signedTransactionInfo
        ]
        let result = try await Functions.functions(region: "europe-west2")
            .httpsCallable("verifyAppleSubscriptionPurchase")
            .call(payload)
        guard let data = result.data as? [String: Any],
              let rawPlan = data["plan"] as? String,
              let plan = StudioBillingPlan(rawValue: rawPlan) else {
            throw NSError(domain: "StudioFlowBilling", code: 5, userInfo: [NSLocalizedDescriptionKey: "Verified subscription plan was not returned by the server."])
        }
        profileErrorMessage = ""
        return plan
        #else
        throw NSError(domain: "StudioFlowBilling", code: 6, userInfo: [NSLocalizedDescriptionKey: "Secure Apple billing is not available in this build."])
        #endif
    }

    // Verifies a storage add-on purchase. Same callable as plans, but the server
    // returns an `addon` key (no plan), so the workspace listener applies the new
    // storage limit rather than changing the plan.
    @discardableResult
    func verifyAppleStorageAddonPurchase(signedTransactionInfo: String) async throws -> String {
        guard let companyId = currentCompanyId, !companyId.isEmpty else {
            throw NSError(domain: "StudioFlowBilling", code: 4, userInfo: [NSLocalizedDescriptionKey: "Company ID is not configured."])
        }
        #if canImport(FirebaseFunctions)
        let payload: [String: Any] = [
            "companyId": companyId,
            "signedTransactionInfo": signedTransactionInfo
        ]
        let result = try await Functions.functions(region: "europe-west2")
            .httpsCallable("verifyAppleSubscriptionPurchase")
            .call(payload)
        guard let data = result.data as? [String: Any],
              let addon = data["addon"] as? String, !addon.isEmpty else {
            throw NSError(domain: "StudioFlowBilling", code: 7, userInfo: [NSLocalizedDescriptionKey: "Storage add-on was not confirmed by the server."])
        }
        profileErrorMessage = ""
        return addon
        #else
        throw NSError(domain: "StudioFlowBilling", code: 6, userInfo: [NSLocalizedDescriptionKey: "Secure Apple billing is not available in this build."])
        #endif
    }

    func canCreateMoreOrders(currentCount: Int) -> Bool {
        currentPlanEntitlements.canCreateOrder(currentCount: currentCount)
    }

    func canCreateMoreCustomers(currentCount: Int) -> Bool {
        currentPlanEntitlements.canCreateCustomer(currentCount: currentCount)
    }

    private func parseCustomTeamRoles(from data: [String: Any]) -> [StudioCustomTeamRole] {
        guard let rawRoles = data["customRoles"] as? [String: Any] else { return [] }
        return rawRoles.compactMap { id, value in
            guard let roleId = studioCustomRoleId(id),
                  let raw = value as? [String: Any] else { return nil }
            let storedId = studioCustomRoleId((raw["id"] as? String) ?? roleId) ?? roleId
            return StudioCustomTeamRole(
                id: storedId,
                name: ((raw["name"] as? String) ?? "Custom Role").trimmingCharacters(in: .whitespacesAndNewlines),
                baseRole: studioNormalizedTeamRole((raw["baseRole"] as? String) ?? "member"),
                access: studioCleanMemberAccess(raw["access"] as? [String: Any])
            )
        }
        .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private func customTeamRoleMap(from data: [String: Any]) -> [String: StudioCustomTeamRole] {
        Dictionary(uniqueKeysWithValues: parseCustomTeamRoles(from: data).map { ($0.id, $0) })
    }

    private func effectiveTeamRole(_ rawRole: String, customRoles: [String: StudioCustomTeamRole]) -> String {
        if let customRole = customRoles[rawRole] {
            return studioNormalizedTeamRole(customRole.baseRole)
        }
        return normalizedTeamRole(rawRole)
    }

    private func displayLabelForTeamRole(_ rawRole: String, customRoles: [String: StudioCustomTeamRole]) -> String {
        if let customRole = customRoles[rawRole] {
            return customRole.roleLabel
        }
        switch effectiveTeamRole(rawRole, customRoles: customRoles) {
        case "owner": return "Owner"
        case "admin": return "Admin"
        case "viewer": return "View Only"
        case "workflow": return "Workflow Only"
        default: return "Member"
        }
    }

    private func roleAccess(_ rawRole: String, customRoles: [String: StudioCustomTeamRole], fallback: [String: Any] = [:], forceFullAccess: Bool = false) -> [String: Bool] {
        if forceFullAccess { return studioDefaultMemberAccess() }
        if let customRole = customRoles[rawRole] {
            return studioCleanMemberAccess(customRole.access)
        }
        var base = Dictionary(uniqueKeysWithValues: studioDefaultAccessForRole(rawRole).map { ($0.key, $0.value as Any) })
        fallback.forEach { key, value in base[key] = value }
        var access = studioCleanMemberAccess(base)
        if studioNormalizedTeamRole(rawRole) == "workflow" {
            access["dashboard"] = false
            access["financialInfo"] = false
            access["customers"] = false
            access["teamAccess"] = false
            access["cardFinancial"] = false
            access["assignedProjectsOnly"] = true
            access["manageProjectAssignments"] = false
            access["orders"] = true
            access["schedule"] = true
            access["quickReply"] = true
            access["clientFiles"] = true
            access["cardClientFiles"] = true
        }
        return access
    }

    private func memberRawRole(from data: [String: Any], companyId: String, currentUid: String) -> String? {
        let ownerUid = (data["ownerUid"] as? String) ?? companyId
        if currentUid == ownerUid || currentUid == companyId { return "owner" }

        let customRoles = customTeamRoleMap(from: data)
        if let memberCustomRoles = data["memberCustomRoles"] as? [String: Any],
           let customRoleId = memberCustomRoles[currentUid] as? String,
           customRoles[customRoleId] != nil {
            return customRoleId
        }

        if let members = data["members"] as? [String: Any],
           let raw = members[currentUid] as? [String: Any] {
            if let customRoleId = raw["customRoleId"] as? String,
               customRoles[customRoleId] != nil {
                return customRoleId
            }
            return (raw["role"] as? String) ?? "member"
        }

        if let memberRoles = data["memberRoles"] as? [String: Any],
           let role = memberRoles[currentUid] as? String {
            return role
        }

        return nil
    }

    private func accessibleWorkspaceRole(from data: [String: Any], companyId: String, currentUid: String) -> String? {
        guard let rawRole = memberRawRole(from: data, companyId: companyId, currentUid: currentUid) else { return nil }
        return effectiveTeamRole(rawRole, customRoles: customTeamRoleMap(from: data))
    }

    private func sortedWorkspaceOptions(_ workspaces: [StudioWorkspaceOption]) -> [StudioWorkspaceOption] {
        workspaces.sorted { lhs, rhs in
            if lhs.id == currentCompanyId { return true }
            if rhs.id == currentCompanyId { return false }
            let order = ["owner": 0, "admin": 1, "member": 2, "viewer": 3, "workflow": 4]
            let lhsRank = order[lhs.normalizedRole] ?? 9
            let rhsRank = order[rhs.normalizedRole] ?? 9
            if lhsRank != rhsRank { return lhsRank < rhsRank }
            return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
        }
    }

    private func normalizedTeamRole(_ role: String) -> String {
        studioNormalizedTeamRole(role)
    }

    private func normalizedTeamRoleForWrite(_ role: String) -> String {
        if let customId = studioCustomRoleId(role),
           customTeamRoles.contains(where: { $0.id == customId }) {
            return customId
        }
        return normalizedTeamRole(role)
    }

    private func customTeamRoleIdForWrite(_ role: String) -> String? {
        guard let customId = studioCustomRoleId(role),
              customTeamRoles.contains(where: { $0.id == customId }) else {
            return nil
        }
        return customId
    }

    private func storedBaseTeamRoleForWrite(_ role: String) -> String {
        if let customId = customTeamRoleIdForWrite(role),
           let customRole = customTeamRoles.first(where: { $0.id == customId }) {
            return customRole.normalizedBaseRole
        }
        return normalizedTeamRole(role)
    }

    private func accessForRoleWrite(_ role: String, fallback: [String: Bool] = studioDefaultMemberAccess()) -> [String: Bool] {
        if let customId = studioCustomRoleId(role),
           let customRole = customTeamRoles.first(where: { $0.id == customId }) {
            return studioCleanMemberAccess(customRole.access)
        }
        if studioNormalizedTeamRole(role) == "workflow" {
            return studioDefaultAccessForRole(role)
        }
        return studioCleanMemberAccess(studioDefaultAccessForRole(role).merging(fallback) { _, fallbackValue in fallbackValue })
    }

    private func resolveCurrentWorkspaceRole(from data: [String: Any], companyId: String, ownerUid: String, currentUid: String) -> String {
        if currentUid == ownerUid || currentUid == companyId { return "owner" }
        let customRoles = customTeamRoleMap(from: data)
        if let memberCustomRoles = data["memberCustomRoles"] as? [String: Any],
           let customRoleId = memberCustomRoles[currentUid] as? String,
           customRoles[customRoleId] != nil {
            return effectiveTeamRole(customRoleId, customRoles: customRoles)
        }
        if let members = data["members"] as? [String: Any],
           let raw = members[currentUid] as? [String: Any],
           let role = (raw["customRoleId"] as? String) ?? (raw["role"] as? String) {
            return effectiveTeamRole(role, customRoles: customRoles)
        }
        if let memberRoles = data["memberRoles"] as? [String: Any],
           let role = memberRoles[currentUid] as? String {
            return effectiveTeamRole(role, customRoles: customRoles)
        }
        return "member"
    }

    private func validateCompanyAccess(companyId: String, user: User, completion: @escaping (Bool) -> Void) {
        if companyId == user.uid {
            completion(true)
            return
        }

        db.collection("companies").document(companyId).getDocument { snapshot, error in
            guard error == nil, let data = snapshot?.data() else {
                completion(false)
                return
            }

            let ownerUid = (data["ownerUid"] as? String) ?? companyId
            if ownerUid == user.uid {
                completion(true)
                return
            }

            let customRoles = self.customTeamRoleMap(from: data)
            if let memberCustomRoles = data["memberCustomRoles"] as? [String: Any],
               let customRoleId = memberCustomRoles[user.uid] as? String,
               customRoles[customRoleId] != nil,
               ["owner", "admin", "member", "viewer", "workflow"].contains(self.effectiveTeamRole(customRoleId, customRoles: customRoles)) {
                completion(true)
                return
            }
            if let members = data["members"] as? [String: Any],
               let raw = members[user.uid] as? [String: Any] {
                let role = (raw["customRoleId"] as? String) ?? (raw["role"] as? String) ?? "member"
                if ["owner", "admin", "member", "viewer", "workflow"].contains(self.effectiveTeamRole(role, customRoles: customRoles)) {
                    completion(true)
                    return
                }
            }

            if let memberRoles = data["memberRoles"] as? [String: Any],
               let role = memberRoles[user.uid] as? String,
               ["owner", "admin", "member", "viewer", "workflow"].contains(self.effectiveTeamRole(role, customRoles: customRoles)) {
                completion(true)
                return
            }

            completion(false)
        }
    }

    private func parseTeamMembers(from data: [String: Any], ownerUid: String, ownerEmail: String, ownerDisplayName: String, ownerPhotoURL: String) -> [StudioTeamMember] {
        var result: [StudioTeamMember] = []
        let memberRoles = data["memberRoles"] as? [String: Any] ?? [:]
        let memberCustomRoles = data["memberCustomRoles"] as? [String: Any] ?? [:]
        let memberAccess = data["memberAccess"] as? [String: Any] ?? [:]
        let customRoles = customTeamRoleMap(from: data)

        if let members = data["members"] as? [String: Any] {
            for (uid, rawValue) in members {
                guard let raw = rawValue as? [String: Any] else { continue }
                let email = (raw["email"] as? String) ?? ""
                let displayName = (raw["displayName"] as? String) ?? ""
                let photoURL = (raw["photoURL"] as? String) ?? (uid == ownerUid ? ownerPhotoURL : "")
                let customRoleId = ((raw["customRoleId"] as? String) ?? (memberCustomRoles[uid] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                let rawRole = (customRoles[customRoleId] != nil ? customRoleId : ((raw["role"] as? String) ?? (memberRoles[uid] as? String) ?? (uid == ownerUid ? "owner" : "member"))).trimmingCharacters(in: .whitespacesAndNewlines)
                let effectiveRole = effectiveTeamRole(rawRole, customRoles: customRoles)
                let inlineAccess = raw["access"] as? [String: Any] ?? [:]
                let rootAccess = memberAccess[uid] as? [String: Any] ?? [:]
                let combinedAccess = inlineAccess.merging(rootAccess) { _, rootValue in rootValue }
                let access = roleAccess(rawRole, customRoles: customRoles, fallback: combinedAccess, forceFullAccess: effectiveRole == "owner" || uid == ownerUid)
                let timestamp = raw["addedAt"] as? Timestamp
                result.append(StudioTeamMember(
                    id: uid,
                    email: email,
                    displayName: displayName,
                    photoURL: photoURL,
                    role: rawRole.isEmpty ? effectiveRole : rawRole,
                    effectiveRole: effectiveRole,
                    roleDisplayName: customRoles[rawRole]?.roleLabel ?? "",
                    access: access,
                    addedAt: timestamp?.dateValue()
                ))
            }
        }

        if !result.contains(where: { $0.id == ownerUid }) {
            result.append(StudioTeamMember(id: ownerUid, email: ownerEmail, displayName: ownerDisplayName, photoURL: ownerPhotoURL, role: "owner", access: studioDefaultMemberAccess(), addedAt: nil))
        }

        return result.sorted { lhs, rhs in
            let order = ["owner": 0, "admin": 1, "member": 2, "viewer": 3, "workflow": 4]
            let lhsRank = order[lhs.normalizedRole] ?? 9
            let rhsRank = order[rhs.normalizedRole] ?? 9
            if lhsRank != rhsRank { return lhsRank < rhsRank }
            return lhs.email.lowercased() < rhs.email.lowercased()
        }
    }


    private func loadJoinRequests(for companyId: String) {
        guard isCompanyOwner, !companyId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            joinRequests = []
            return
        }

        db.collection("workspaceJoinRequests")
            .whereField("targetCompanyId", isEqualTo: companyId)
            .getDocuments { [weak self] snapshot, error in
                Task { @MainActor in
                    guard let self else { return }

                    if let error = error {
                        if self.profileErrorMessage.isEmpty {
                            self.profileErrorMessage = error.localizedDescription
                        }
                        self.joinRequests = []
                        return
                    }

                    self.joinRequests = snapshot?.documents.compactMap { document in
                        self.joinRequest(from: document.documentID, data: document.data())
                    }
                    .filter { $0.status.lowercased() == "pending" }
                    .sorted { lhs, rhs in
                        (lhs.createdAt ?? .distantPast) > (rhs.createdAt ?? .distantPast)
                    } ?? []
                }
            }
    }

    private func joinRequest(from documentId: String, data: [String: Any]) -> StudioJoinRequest? {
        let requesterUid = ((data["requesterUid"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 }
        let targetCompanyId = ((data["targetCompanyId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 }

        guard let requesterUid, let targetCompanyId else { return nil }

        return StudioJoinRequest(
            id: documentId,
            requesterUid: requesterUid,
            requesterEmail: (data["requesterEmail"] as? String) ?? "",
            requesterDisplayName: (data["requesterDisplayName"] as? String) ?? "",
            requesterPhotoURL: (data["requesterPhotoURL"] as? String) ?? "",
            targetCompanyId: targetCompanyId,
            status: (data["status"] as? String) ?? "pending",
            createdAt: (data["createdAt"] as? Timestamp)?.dateValue()
        )
    }

    private func loadAvailableWorkspaces(for user: User) {
        db.collection("users")
            .document(user.uid)
            .collection("workspaceAccess")
            .getDocuments { [weak self] snapshot, error in
                Task { @MainActor in
                    guard let self else { return }

                    if let error = error {
                        if self.profileErrorMessage.isEmpty {
                            self.profileErrorMessage = error.localizedDescription
                        }
                        self.availableWorkspaces = self.personalWorkspaceFallback(for: user)
                        return
                    }

                    var workspaces = snapshot?.documents.compactMap { document in
                        self.workspaceOption(from: document.documentID, data: document.data(), currentUserId: user.uid)
                    } ?? []

                    if !workspaces.contains(where: { $0.id == user.uid }) {
                        workspaces.append(contentsOf: self.personalWorkspaceFallback(for: user))
                    }

                    self.availableWorkspaces = self.sortedWorkspaceOptions(workspaces)
                }
            }
    }

    private func personalWorkspaceFallback(for user: User) -> [StudioWorkspaceOption] {
        [
            StudioWorkspaceOption(
                id: user.uid,
                name: currentCompanyId == user.uid ? companyName : "My Studio",
                ownerEmail: user.email ?? "",
                role: "owner"
            )
        ]
    }

    private func workspaceOption(from documentId: String, data: [String: Any], currentUserId: String) -> StudioWorkspaceOption? {
        let storedCompanyId = ((data["companyId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 } ?? documentId
        let name = ((data["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 } ?? "My Studio"
        let ownerUid = (data["ownerUid"] as? String) ?? storedCompanyId
        let ownerEmail = (data["ownerEmail"] as? String) ?? ""
        let role = ((data["role"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 } ?? (ownerUid == currentUserId || storedCompanyId == currentUserId ? "owner" : "member")

        return StudioWorkspaceOption(id: storedCompanyId, name: name, ownerEmail: ownerEmail, role: role)
    }

    private func syncCompanyMemberIndex(companyId: String, members: [StudioTeamMember]) {
        let cleanMembers = members.filter { !$0.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        let memberIds = Array(Set(cleanMembers.map(\.id)))
        guard !memberIds.isEmpty else { return }

        let cleanCompanyName = companyName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "My Studio" : companyName.trimmingCharacters(in: .whitespacesAndNewlines)
        let memberRoleMap = Dictionary(uniqueKeysWithValues: cleanMembers.map { member in
            let role = normalizedTeamRoleForWrite(member.role.isEmpty ? (member.id == companyId ? "owner" : "member") : member.role)
            return (member.id, storedBaseTeamRoleForWrite(role))
        })
        let memberCustomRoleMap = Dictionary(uniqueKeysWithValues: cleanMembers.compactMap { member -> (String, String)? in
            let role = normalizedTeamRoleForWrite(member.role.isEmpty ? (member.id == companyId ? "owner" : "member") : member.role)
            guard let customRoleId = customTeamRoleIdForWrite(role) else { return nil }
            return (member.id, customRoleId)
        })
        let memberAccessMap = Dictionary(uniqueKeysWithValues: cleanMembers.map { member in
            (member.id, studioCleanMemberAccess(member.access, forceFullAccess: member.normalizedRole == "owner" || member.id == companyId))
        })
        let companyRef = db.collection("companies").document(companyId)
        let batch = db.batch()

        var companyUpdate: [String: Any] = [
            "memberUids": FieldValue.arrayUnion(memberIds),
            "memberRoles": memberRoleMap,
            "memberCustomRoles": memberCustomRoleMap,
            "memberAccess": memberAccessMap,
            "updatedAt": FieldValue.serverTimestamp()
        ]

        for member in cleanMembers {
            let role = normalizedTeamRoleForWrite(member.role.isEmpty ? (member.id == companyId ? "owner" : "member") : member.role)
            let storedRole = storedBaseTeamRoleForWrite(role)
            companyUpdate["members.\(member.id).role"] = storedRole
            if let customRoleId = customTeamRoleIdForWrite(role) {
                companyUpdate["members.\(member.id).customRoleId"] = customRoleId
            } else {
                companyUpdate["members.\(member.id).customRoleId"] = FieldValue.delete()
                companyUpdate["memberCustomRoles.\(member.id)"] = FieldValue.delete()
            }
            companyUpdate["members.\(member.id).access"] = studioCleanMemberAccess(member.access, forceFullAccess: member.normalizedRole == "owner" || member.id == companyId)
        }

        batch.updateData(companyUpdate, forDocument: companyRef)

        for member in cleanMembers {
            let role = normalizedTeamRoleForWrite(member.role.isEmpty ? (member.id == companyId ? "owner" : "member") : member.role)
            let storedRole = storedBaseTeamRoleForWrite(role)
            let customRoleId = customTeamRoleIdForWrite(role)
            let accessRef = db.collection("users").document(member.id).collection("workspaceAccess").document(companyId)
            var accessPayload: [String: Any] = [
                "companyId": companyId,
                "name": cleanCompanyName,
                "ownerUid": currentUserId ?? companyId,
                "ownerEmail": accountEmail,
                "role": storedRole,
                "access": studioCleanMemberAccess(member.access, forceFullAccess: member.normalizedRole == "owner" || member.id == companyId),
                "memberEmail": member.email,
                "memberPhotoURL": member.photoURL,
                "updatedAt": FieldValue.serverTimestamp()
            ]
            if let customRoleId {
                accessPayload["customRoleId"] = customRoleId
            } else {
                accessPayload["customRoleId"] = FieldValue.delete()
            }
            batch.setData(accessPayload, forDocument: accessRef, merge: true)
        }

        batch.commit()
    }

    nonisolated private func ensureCompanyDocument(for user: User, completion: @escaping (Error?) -> Void) {
        let companyId = user.uid
        let email = user.email ?? ""
        let displayName = user.displayName ?? ""
        let photoURL = user.photoURL?.absoluteString ?? ""
        let ref = Firestore.firestore().collection("companies").document(companyId)

        ref.getDocument { snapshot, _ in
            if snapshot?.exists == true {
                let data = snapshot?.data() ?? [:]
                var payload: [String: Any] = [
                    "companyId": companyId,
                    "appName": "NivaDesk",
                    "memberUids": FieldValue.arrayUnion([companyId]),
                    "memberRoles": [companyId: "owner"],
                    "updatedAt": FieldValue.serverTimestamp()
                ]

                if ((data["ownerUid"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    payload["ownerUid"] = companyId
                }
                if ((data["ownerEmail"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    payload["ownerEmail"] = email
                }

                let members = data["members"] as? [String: Any]
                if members?[companyId] == nil {
                    payload["members"] = [
                        companyId: [
                            "uid": companyId,
                            "email": email,
                            "displayName": displayName,
                            "photoURL": photoURL,
                            "role": "owner",
                            "updatedAt": FieldValue.serverTimestamp()
                        ]
                    ]
                }

                // Fire-and-forget: Firestore applies this write to the local cache
                // immediately and syncs it when back online. Awaiting the server
                // acknowledgement (via `completion`) blocks app startup forever with no
                // connection — the user is left stuck on "Preparing your workspace...".
                // The Android client already does this; mirror it here.
                ref.setData(payload, merge: true)
                completion(nil)
                return
            }

            var payload: [String: Any] = [
                "companyId": companyId,
                "ownerUid": companyId,
                "ownerEmail": email,
                "ownerDisplayName": displayName,
                "ownerPhotoURL": photoURL,
                "appName": "NivaDesk",
                "memberUids": FieldValue.arrayUnion([companyId]),
                "memberRoles": [companyId: "owner"],
                "updatedAt": FieldValue.serverTimestamp(),
                "members": [
                    companyId: [
                        "uid": companyId,
                        "email": email,
                        "displayName": displayName,
                        "photoURL": photoURL,
                        "role": "owner",
                        "updatedAt": FieldValue.serverTimestamp()
                    ]
                ],
                "name": "My Studio",
                "createdAt": FieldValue.serverTimestamp(),
                "billingPlan": StudioBillingPlan.demo.rawValue,
                "billingPlanName": StudioBillingPlan.demo.displayName,
                "billingPlanSource": "new_workspace_default",
                "billingStorageLimitMB": StudioBillingPlan.demo.entitlements.storageLimitMB,
                "billingTeamMemberLimit": StudioBillingPlan.demo.entitlements.teamMemberLimit
            ]

            // Fire-and-forget (see note above): never block startup on the server ack.
            ref.setData(payload, merge: true)
            completion(nil)
        }
    }
}

// MARK: - Sign in with Apple

import AuthenticationServices
import CryptoKit

private var nvAppleSignInCoordinator: NVAppleSignInCoordinator?

extension AuthViewModel {
    var isAppleSignInAvailable: Bool { true }

    func signInWithApple() {
        let rawNonce = NVAppleSignInCoordinator.randomNonce()
        isLoading = true
        errorMessage = ""
        bypassNextLocalUnlockAfterInteractiveSignIn = true

        let coordinator = NVAppleSignInCoordinator(rawNonce: rawNonce) { [weak self] result in
            Task { @MainActor in
                guard let self else { return }
                switch result {
                case .success(let credential):
                    Auth.auth().signIn(with: credential) { [weak self] _, authError in
                        Task { @MainActor in
                            guard let self else { return }
                            self.isLoading = false
                            if let authError {
                                self.bypassNextLocalUnlockAfterInteractiveSignIn = false
                                self.errorMessage = authError.localizedDescription
                            } else {
                                self.recordSignupPlatformIfNewAccount()
                            }
                            nvAppleSignInCoordinator = nil
                        }
                    }
                case .failure(let error):
                    self.isLoading = false
                    self.bypassNextLocalUnlockAfterInteractiveSignIn = false
                    let nsError = error as NSError
                    // User-cancelled flows stay silent.
                    if nsError.domain != ASAuthorizationError.errorDomain || nsError.code != ASAuthorizationError.canceled.rawValue {
                        self.errorMessage = error.localizedDescription
                    }
                    nvAppleSignInCoordinator = nil
                }
            }
        }
        nvAppleSignInCoordinator = coordinator
        coordinator.start()
    }
}

final class NVAppleSignInCoordinator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private let rawNonce: String
    private let completion: (Result<AuthCredential, Error>) -> Void

    init(rawNonce: String, completion: @escaping (Result<AuthCredential, Error>) -> Void) {
        self.rawNonce = rawNonce
        self.completion = completion
    }

    func start() {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = Self.sha256(rawNonce)
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let appleCredential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = appleCredential.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8) else {
            completion(.failure(NSError(domain: "NivaDesk", code: -1, userInfo: [NSLocalizedDescriptionKey: "Apple Sign-In could not return a valid token."])))
            return
        }
        let credential = OAuthProvider.credential(
            providerID: AuthProviderID.apple,
            idToken: idToken,
            rawNonce: rawNonce
        )
        completion(.success(credential))
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        completion(.failure(error))
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        #if os(macOS)
        return NSApplication.shared.keyWindow ?? NSApplication.shared.windows.first ?? ASPresentationAnchor()
        #else
        let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene
        return scene?.windows.first { $0.isKeyWindow } ?? scene?.windows.first ?? ASPresentationAnchor()
        #endif
    }

    static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remaining = length
        while remaining > 0 {
            var random: UInt8 = 0
            if SecRandomCopyBytes(kSecRandomDefault, 1, &random) == errSecSuccess {
                if random < charset.count {
                    result.append(charset[Int(random)])
                    remaining -= 1
                }
            }
        }
        return result
    }

    static func sha256(_ input: String) -> String {
        let hash = SHA256.hash(data: Data(input.utf8))
        return hash.compactMap { String(format: "%02x", $0) }.joined()
    }
}

// MARK: - Email verification gate

extension AuthViewModel {
    /// Email/password accounts must verify their address before entering the
    /// app. OAuth users (Google, Apple) are already verified by the provider.
    var needsEmailVerification: Bool {
        guard let user = Auth.auth().currentUser else { return false }
        guard !user.isEmailVerified else { return false }
        guard user.providerData.contains(where: { $0.providerID == "password" }) else { return false }
        // Industry-standard grace period: new accounts get full access for a
        // few days; only stale unverified accounts hit the hard gate.
        guard let created = user.metadata.creationDate else { return false }
        return Date().timeIntervalSince(created) > 3 * 86400
    }

    /// True while an email/password account is unverified but still inside the
    /// pre-gate grace window (before `needsEmailVerification` hard-gates at day 3).
    /// Drives the dismissible in-app reminder banner.
    var isInEmailVerificationGracePeriod: Bool {
        guard let user = Auth.auth().currentUser else { return false }
        guard !user.isEmailVerified else { return false }
        guard user.providerData.contains(where: { $0.providerID == "password" }) else { return false }
        guard let created = user.metadata.creationDate else { return false }
        return Date().timeIntervalSince(created) <= 3 * 86400
    }

    /// Email address of the signed-in account, for verification messaging.
    var currentAccountEmail: String { Auth.auth().currentUser?.email ?? "" }

    func resendVerificationEmail(completion: @escaping (String) -> Void) {
        guard let user = Auth.auth().currentUser else { return }
        let actionSettings = ActionCodeSettings()
        actionSettings.url = URL(string: "https://nivadesk.app/login")
        user.sendEmailVerification(with: actionSettings) { error in
            Task { @MainActor in
                completion(error?.localizedDescription ?? "Verification email sent. Check your inbox.")
            }
        }
    }

    func refreshEmailVerification(completion: @escaping (Bool) -> Void) {
        guard let user = Auth.auth().currentUser else { completion(true); return }
        user.reload { _ in
            Task { @MainActor in
                let verified = Auth.auth().currentUser?.isEmailVerified ?? false
                if verified {
                    // Nudge SwiftUI to re-evaluate the gate.
                    self.objectWillChange.send()
                }
                completion(verified)
            }
        }
    }
}
