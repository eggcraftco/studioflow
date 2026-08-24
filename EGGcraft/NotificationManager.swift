import Foundation
import Combine
import UserNotifications
import FirebaseFirestore

#if canImport(FirebaseAuth)
import FirebaseAuth
#endif

#if canImport(FirebaseMessaging)
import FirebaseMessaging
#endif

#if os(iOS)
import UIKit
#endif

final class PushNotificationManager: NSObject, ObservableObject {
    static let shared = PushNotificationManager()

    @Published private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    @Published private(set) var lastSavedTokenPreview: String = ""

    private var companyId: String = ""
    private var hasConfigured = false
    private var lastSavedToken: String = ""
    private var lastSavedCompanyId: String = ""
    private var hasAPNSToken = false
    private var pendingFCMRetryWorkItem: DispatchWorkItem?

    // Persisted so the registration can be removed on logout even after an app
    // restart (the in-memory lastSaved* values start empty on every launch).
    private static let persistedTokenKey = "pushDeviceTokenLastSavedV1"
    private static let persistedCompanyKey = "pushDeviceTokenCompanyLastSavedV1"

    private override init() {
        super.init()
    }

    func configure(companyId: String) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty else {
            resetForLogout()
            return
        }

        let companyChanged = self.companyId != cleanCompanyId
        self.companyId = cleanCompanyId

        UNUserNotificationCenter.current().delegate = self

        #if canImport(FirebaseMessaging)
        Messaging.messaging().delegate = self
        #endif

        refreshAuthorizationStatus()
        requestNotificationPermission()

        if companyChanged || !hasConfigured {
            refreshCurrentFCMToken()
        }

        hasConfigured = true
    }

    func resetForLogout() {
        companyId = ""
        lastSavedToken = ""
        lastSavedCompanyId = ""
        lastSavedTokenPreview = ""
        hasConfigured = false
        hasAPNSToken = false
        pendingFCMRetryWorkItem?.cancel()
        pendingFCMRetryWorkItem = nil
    }

    /// Deletes this device's push registration from the company it was last saved
    /// under. Must run BEFORE Auth.signOut(): the Firestore rule for deviceTokens
    /// requires the caller to still be a signed-in member of that company. Without
    /// this, the token stays enabled under the old company and the device keeps
    /// receiving that workspace's pushes after switching accounts.
    func unregisterStoredDeviceToken(completion: @escaping () -> Void) {
        let defaults = UserDefaults.standard
        let token = lastSavedToken.isEmpty
            ? (defaults.string(forKey: Self.persistedTokenKey) ?? "")
            : lastSavedToken
        let savedCompanyId = lastSavedCompanyId.isEmpty
            ? (defaults.string(forKey: Self.persistedCompanyKey) ?? "")
            : lastSavedCompanyId

        guard !token.isEmpty, !savedCompanyId.isEmpty else {
            completion()
            return
        }

        var didComplete = false
        let finish = {
            DispatchQueue.main.async {
                guard !didComplete else { return }
                didComplete = true
                defaults.removeObject(forKey: Self.persistedTokenKey)
                defaults.removeObject(forKey: Self.persistedCompanyKey)
                completion()
            }
        }

        // Don't let a slow/offline delete block logout indefinitely.
        DispatchQueue.main.asyncAfter(deadline: .now() + 3, execute: finish)

        Firestore.firestore()
            .collection("companies")
            .document(savedCompanyId)
            .collection("deviceTokens")
            .document(Self.deviceTokenDocumentId(for: token))
            .delete { error in
                if let error = error {
                    print("FCM token unregister error: \(error.localizedDescription)")
                }
                finish()
            }
    }

    private static func deviceTokenDocumentId(for token: String) -> String {
        token
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: ":", with: "_")
    }

    func requestNotificationPermission() {
        UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
            DispatchQueue.main.async {
                self?.authorizationStatus = settings.authorizationStatus
            }

            switch settings.authorizationStatus {
            case .notDetermined:
                UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { [weak self] granted, error in
                    if let error = error {
                        print("Notification permission error: \(error.localizedDescription)")
                    }

                    DispatchQueue.main.async {
                        self?.refreshAuthorizationStatus()
                    }

                    if granted {
                        self?.registerForRemoteNotificationsIfPossible()
                        self?.refreshCurrentFCMToken()
                    }
                }

            case .authorized, .provisional:
                self?.registerForRemoteNotificationsIfPossible()
                self?.refreshCurrentFCMToken()

            case .denied:
                break

            default:
                self?.registerForRemoteNotificationsIfPossible()
                self?.refreshCurrentFCMToken()
            }
        }
    }

    func refreshAuthorizationStatus() {
        UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
            DispatchQueue.main.async {
                self?.authorizationStatus = settings.authorizationStatus
            }
        }
    }

    func refreshCurrentFCMToken() {
        #if canImport(FirebaseMessaging)
        guard hasAPNSToken else {
            writePushDebug(event: "waitingForAPNSToken", status: "waitingForAPNSToken", error: "APNs token has not been received yet. FCM token request will retry after APNs registration.", hasToken: false)
            scheduleFCMTokenRetry()
            return
        }

        Messaging.messaging().token { [weak self] token, error in
            if let error = error {
                self?.writePushDebug(event: "fcmTokenResult", status: "fcmTokenError", error: error.localizedDescription, hasToken: false)
                print("FCM token error: \(error.localizedDescription)")
                self?.scheduleFCMTokenRetry()
                return
            }

            guard let token = token, !token.isEmpty else {
                self?.writePushDebug(event: "fcmTokenResult", status: "emptyFCMToken", error: "Firebase Messaging returned an empty token.", hasToken: false)
                self?.scheduleFCMTokenRetry()
                return
            }
            self?.writePushDebug(event: "fcmTokenResult", status: "fcmTokenReceived", error: "", hasToken: true)
            self?.saveDeviceToken(token)
        }
        #else
        writePushDebug(event: "fcmUnavailable", status: "firebaseMessagingNotLinked", error: "FirebaseMessaging is not linked to this target, so FCM token cannot be created.", hasToken: false)
        #endif
    }

    private func scheduleFCMTokenRetry() {
        pendingFCMRetryWorkItem?.cancel()
        let workItem = DispatchWorkItem { [weak self] in
            self?.refreshCurrentFCMToken()
        }
        pendingFCMRetryWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 4, execute: workItem)
    }

    func handleAPNSToken(_ deviceToken: Data) {
        hasAPNSToken = true
        let tokenPreview = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        writePushDebug(event: "apnsRegistered", status: "apnsTokenReceived", error: "", hasToken: false, apnsTokenPreview: String(tokenPreview.prefix(8)) + "..." + String(tokenPreview.suffix(6)))
        #if canImport(FirebaseMessaging)
        Messaging.messaging().apnsToken = deviceToken
        #endif
        refreshCurrentFCMToken()
    }

    func handleAPNSRegistrationError(_ error: Error) {
        hasAPNSToken = false
        writePushDebug(event: "apnsRegistrationFailed", status: "apnsRegistrationFailed", error: error.localizedDescription, hasToken: false)
    }

    private func registerForRemoteNotificationsIfPossible() {
        #if os(iOS)
        DispatchQueue.main.async {
            UIApplication.shared.registerForRemoteNotifications()
        }
        #endif
    }

    private func saveDeviceToken(_ token: String) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty else { return }

        if token == lastSavedToken, cleanCompanyId == lastSavedCompanyId, !lastSavedTokenPreview.isEmpty {
            return
        }

        let language = UserDefaults.standard.string(forKey: "seciliDil") ?? Locale.preferredLanguages.first ?? "English"
        let documentId = Self.deviceTokenDocumentId(for: token)

        var payload: [String: Any] = [
            "token": token,
            "companyId": cleanCompanyId,
            "platform": platformName,
            "language": language,
            "enabled": true,
            "appName": "NivaDesk",
            "updatedAt": FieldValue.serverTimestamp()
        ]

        #if canImport(FirebaseAuth)
        if let user = Auth.auth().currentUser {
            payload["userId"] = user.uid
            if let email = user.email {
                payload["email"] = email
            }
        }
        #endif

        Firestore.firestore()
            .collection("companies")
            .document(cleanCompanyId)
            .collection("deviceTokens")
            .document(documentId)
            .setData(payload, merge: true) { [weak self] error in
                if let error = error {
                    print("FCM token save error: \(error.localizedDescription)")
                    return
                }

                let prefix = String(token.prefix(6))
                let suffix = String(token.suffix(5))
                DispatchQueue.main.async {
                    self?.lastSavedToken = token
                    self?.lastSavedCompanyId = cleanCompanyId
                    self?.lastSavedTokenPreview = "\(prefix)...\(suffix)"
                    let defaults = UserDefaults.standard
                    defaults.set(token, forKey: Self.persistedTokenKey)
                    defaults.set(cleanCompanyId, forKey: Self.persistedCompanyKey)
                }
                self?.writePushDebug(event: "deviceTokenSaved", status: "tokenSaved", error: "", hasToken: true)
                print("FCM token saved for company \(cleanCompanyId)")
            }
    }

    private func writePushDebug(event: String, status: String, error: String, hasToken: Bool, apnsTokenPreview: String = "") {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty else { return }

        var payload: [String: Any] = [
            "companyId": cleanCompanyId,
            "appName": "NivaDesk",
            "platform": platformName,
            "event": event,
            "status": status,
            "error": error,
            "hasToken": hasToken,
            "apnsTokenPreview": apnsTokenPreview,
            "configured": hasConfigured,
            "firebaseMessagingLinked": firebaseMessagingLinked,
            "updatedAt": FieldValue.serverTimestamp()
        ]

        #if canImport(FirebaseAuth)
        if let user = Auth.auth().currentUser {
            payload["authUserFound"] = true
            payload["userId"] = user.uid
            payload["email"] = user.email ?? ""
        } else {
            payload["authUserFound"] = false
        }
        #endif

        UNUserNotificationCenter.current().getNotificationSettings { settings in
            payload["authorizationStatus"] = settings.authorizationStatus.rawValue
            payload["granted"] = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
            Firestore.firestore()
                .collection("companies")
                .document(cleanCompanyId)
                .collection("pushDebug")
                .document("latest")
                .setData(payload, merge: true)
        }
    }

    private var firebaseMessagingLinked: Bool {
        #if canImport(FirebaseMessaging)
        return true
        #else
        return false
        #endif
    }

    private var platformName: String {
        #if os(iOS)
        return "iOS"
        #elseif os(macOS)
        return "macOS"
        #else
        return "Apple"
        #endif
    }
}

extension PushNotificationManager: UNUserNotificationCenterDelegate {
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Intentionally omit `.badge`: when a push arrives while the app is in the
        // foreground the user is already looking at it, so there is no reason to put
        // a red dot on the home-screen icon. (The server sends a fixed badge:1 on
        // every push; see clearAppIconBadge() for why we also reset it on activate.)
        if #available(iOS 14.0, macOS 11.0, *) {
            completionHandler([.banner, .list, .sound])
        } else {
            completionHandler([.alert, .sound])
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        PushNotificationManager.shared.storeRoute(from: response.notification.request.content.userInfo)
        PushNotificationManager.shared.clearAppIconBadge()
        completionHandler()
    }
}

extension PushNotificationManager {

    /// Resets the home-screen app icon badge to zero. The push server attaches a
    /// fixed `badge: 1` to every notification, and iOS keeps that red "1" on the
    /// icon until the app explicitly clears it. Called when the app becomes active
    /// and when a notification is opened, so the icon badge follows the in-app
    /// state (the real source of truth) instead of sticking forever.
    func clearAppIconBadge() {
        UNUserNotificationCenter.current().setBadgeCount(0) { _ in }
    }

    func storeRoute(from userInfo: [AnyHashable: Any]) {
        let route = stringValue(userInfo["route"]).trimmingCharacters(in: .whitespacesAndNewlines)
        let type = stringValue(userInfo["type"]).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if route == "messageThread" {
            storeMessageThreadRoute(from: userInfo)
        } else if type == "delivery" || type == "tracking" {
            storeOrderDeliveryRoute(from: userInfo)
        } else if type == "estimate_decision" {
            storeOrderCardRoute(from: userInfo, card: "estimate")
        } else {
            storeSupportTicketRoute(from: userInfo)
        }
    }

    /// A customer has approved or declined an estimate: open that order and land
    /// on the card carrying the decision. Without this the push fell through to
    /// the support-ticket branch and tapping it did nothing.
    func storeOrderCardRoute(from userInfo: [AnyHashable: Any], card: String) {
        let orderId = stringValue(userInfo["orderId"]).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !orderId.isEmpty else { return }

        let defaults = UserDefaults.standard
        defaults.set(orderId, forKey: "pendingOpenOrderId")
        defaults.set(card, forKey: "pendingOpenOrderCard")
        defaults.set(Date().timeIntervalSince1970, forKey: "pendingOpenOrderRequestedAt")
        defaults.set("Orders", forKey: "studioRequestedStartTab")
        defaults.synchronize()

        NotificationCenter.default.post(name: .studioOrderRouteRequested, object: nil)
    }

    /// Delivery/tracking push tapped: open that order and land on its
    /// Shipping & Tracking card.
    func storeOrderDeliveryRoute(from userInfo: [AnyHashable: Any]) {
        let orderId = stringValue(userInfo["orderId"]).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !orderId.isEmpty else { return }

        let defaults = UserDefaults.standard
        defaults.set(orderId, forKey: "pendingOpenOrderId")
        defaults.set("shipping", forKey: "pendingOpenOrderCard")
        defaults.set(Date().timeIntervalSince1970, forKey: "pendingOpenOrderRequestedAt")
        defaults.set("Orders", forKey: "studioRequestedStartTab")
        defaults.synchronize()

        NotificationCenter.default.post(name: .studioOrderRouteRequested, object: nil)
    }

    func storeMessageThreadRoute(from userInfo: [AnyHashable: Any]) {
        let route = stringValue(userInfo["route"]).trimmingCharacters(in: .whitespacesAndNewlines)
        let threadId = stringValue(userInfo["threadId"]).trimmingCharacters(in: .whitespacesAndNewlines)
        let messageId = stringValue(userInfo["messageId"]).trimmingCharacters(in: .whitespacesAndNewlines)
        guard route == "messageThread", !threadId.isEmpty else { return }

        let defaults = UserDefaults.standard
        defaults.set(threadId, forKey: "pendingMessageThreadId")
        defaults.set(messageId, forKey: "pendingMessageId")
        defaults.set(Date().timeIntervalSince1970, forKey: "pendingMessageThreadOpenRequestedAt")
        defaults.set("Messages", forKey: "studioRequestedStartTab")
        defaults.synchronize()

        NotificationCenter.default.post(name: .studioMessageThreadRouteRequested, object: nil)
    }

    func storeSupportTicketRoute(from userInfo: [AnyHashable: Any]) {
        let route = stringValue(userInfo["route"]).trimmingCharacters(in: .whitespacesAndNewlines)
        let ticketId = stringValue(userInfo["ticketId"]).trimmingCharacters(in: .whitespacesAndNewlines)
        let ticketType = stringValue(userInfo["ticketType"]).trimmingCharacters(in: .whitespacesAndNewlines)

        guard route == "supportTicket", !ticketId.isEmpty else { return }

        let defaults = UserDefaults.standard
        defaults.set(ticketId, forKey: "pendingSupportTicketId")
        defaults.set(ticketType.isEmpty ? "workspace" : ticketType, forKey: "pendingSupportTicketType")
        defaults.set(Date().timeIntervalSince1970, forKey: "pendingSupportTicketOpenRequestedAt")
        defaults.set("Support", forKey: "settingsStartSection")
        defaults.set("Settings", forKey: "studioRequestedStartTab")
        defaults.synchronize()

        NotificationCenter.default.post(name: .studioSupportTicketRouteRequested, object: nil)
    }

    private func stringValue(_ value: Any?) -> String {
        if let value = value as? String { return value }
        if let value { return String(describing: value) }
        return ""
    }
}

extension Notification.Name {
    static let studioSupportTicketRouteRequested = Notification.Name("studioSupportTicketRouteRequested")
    static let studioMessageThreadRouteRequested = Notification.Name("studioMessageThreadRouteRequested")
    static let studioOrderRouteRequested = Notification.Name("studioOrderRouteRequested")
}

#if canImport(FirebaseMessaging)
extension PushNotificationManager: MessagingDelegate {
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken = fcmToken, !fcmToken.isEmpty else { return }
        saveDeviceToken(fcmToken)
    }
}
#endif

#if os(iOS)
final class EGGcraftAppDelegate: NSObject, UIApplicationDelegate {
    // Home-screen quick action (long-press the app icon): "New note" jumps
    // straight into the Notes tab with the composer open.
    static let newNoteShortcutType = "uk.co.eggcraft.studioflow.newNote"

    @discardableResult
    static func handleQuickAction(_ item: UIApplicationShortcutItem) -> Bool {
        guard item.type == newNoteShortcutType else { return false }
        let defaults = UserDefaults.standard
        defaults.set("Notes", forKey: "studioRequestedStartTab")
        defaults.set(true, forKey: "pendingQuickActionNewNote")
        return true
    }

    static func installQuickActions() {
        let language = UserDefaults.standard.string(forKey: "seciliDil") ?? "English"
        UIApplication.shared.shortcutItems = [
            UIApplicationShortcutItem(
                type: newNoteShortcutType,
                localizedTitle: t("New note", lang: language),
                localizedSubtitle: nil,
                icon: UIApplicationShortcutIcon(systemImageName: "square.and.pencil"),
                userInfo: nil
            )
        ]
    }

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        Self.installQuickActions()
        return true
    }

    // SwiftUI lifecycle: quick actions arrive through the window-scene delegate,
    // so route scene connections through our own delegate class. A cold launch
    // from the shortcut delivers the item in the connection options instead.
    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        if let shortcutItem = options.shortcutItem {
            Self.handleQuickAction(shortcutItem)
        }
        let config = UISceneConfiguration(name: connectingSceneSession.configuration.name, sessionRole: connectingSceneSession.role)
        config.delegateClass = StudioQuickActionSceneDelegate.self
        return config
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        PushNotificationManager.shared.handleAPNSToken(deviceToken)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        PushNotificationManager.shared.handleAPNSRegistrationError(error)
        print("Remote notification registration failed: \(error.localizedDescription)")
    }
}

final class StudioQuickActionSceneDelegate: UIResponder, UIWindowSceneDelegate {
    func windowScene(
        _ windowScene: UIWindowScene,
        performActionFor shortcutItem: UIApplicationShortcutItem,
        completionHandler: @escaping (Bool) -> Void
    ) {
        completionHandler(EGGcraftAppDelegate.handleQuickAction(shortcutItem))
    }
}
#endif
