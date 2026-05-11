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

    private var companyId: String = "test_studio_123"
    private var hasConfigured = false

    private override init() {
        super.init()
    }

    func configure(companyId: String) {
        self.companyId = companyId.isEmpty ? "test_studio_123" : companyId

        UNUserNotificationCenter.current().delegate = self
        refreshAuthorizationStatus()
        requestNotificationPermission()

        #if canImport(FirebaseMessaging)
        Messaging.messaging().delegate = self
        Messaging.messaging().token { [weak self] token, error in
            if let error = error {
                print("FCM token error: \(error.localizedDescription)")
                return
            }

            guard let token = token, !token.isEmpty else { return }
            self?.saveDeviceToken(token)
        }
        #endif

        #if os(iOS)
        DispatchQueue.main.async {
            UIApplication.shared.registerForRemoteNotifications()
        }
        #endif

        hasConfigured = true
    }

    func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { [weak self] granted, error in
            if let error = error {
                print("Notification permission error: \(error.localizedDescription)")
            }

            DispatchQueue.main.async {
                self?.refreshAuthorizationStatus()
            }

            if granted {
                #if os(iOS)
                DispatchQueue.main.async {
                    UIApplication.shared.registerForRemoteNotifications()
                }
                #endif
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

    private func saveDeviceToken(_ token: String) {
        let language = UserDefaults.standard.string(forKey: "seciliDil") ?? Locale.preferredLanguages.first ?? "English"
        let documentId = token
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: ":", with: "_")

        var payload: [String: Any] = [
            "token": token,
            "companyId": companyId,
            "platform": platformName,
            "language": language,
            "enabled": true,
            "appName": "EGGcraft Studio Manager",
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
            .document(companyId)
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
                    self?.lastSavedTokenPreview = "\(prefix)...\(suffix)"
                }
                print("FCM token saved for company \(self?.companyId ?? "unknown")")
            }
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
        completionHandler()
    }
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
        #if canImport(FirebaseMessaging)
        Messaging.messaging().apnsToken = deviceToken
        #endif
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("Remote notification registration failed: \(error.localizedDescription)")
    }
}
#endif
