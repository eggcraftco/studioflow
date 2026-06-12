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
        lastSavedTokenPreview = ""
        hasConfigured = false
        hasAPNSToken = false
        pendingFCMRetryWorkItem?.cancel()
        pendingFCMRetryWorkItem = nil
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
        let documentId = token
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: ":", with: "_")

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
        if #available(iOS 14.0, macOS 11.0, *) {
            completionHandler([.banner, .list, .sound, .badge])
        } else {
            completionHandler([.alert, .sound, .badge])
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        PushNotificationManager.shared.storeRoute(from: response.notification.request.content.userInfo)
        completionHandler()
    }
}

extension PushNotificationManager {

    func storeRoute(from userInfo: [AnyHashable: Any]) {
        let route = stringValue(userInfo["route"]).trimmingCharacters(in: .whitespacesAndNewlines)
        let type = stringValue(userInfo["type"]).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if route == "messageThread" {
            storeMessageThreadRoute(from: userInfo)
        } else if type == "delivery" || type == "tracking" {
            storeOrderDeliveryRoute(from: userInfo)
        } else {
            storeSupportTicketRoute(from: userInfo)
        }
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
#endif
