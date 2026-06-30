import SwiftUI
import FirebaseCore
import FirebaseAppCheck
import FirebaseFirestore
import UserNotifications
#if os(iOS)
import UIKit
#endif
#if os(macOS)
import AppKit
#endif

#if canImport(GoogleSignIn)
import GoogleSignIn
#endif


// Firebase App Check: attests that requests come from the genuine app so
// bot/scripted traffic can be rejected once enforcement is enabled. Uses App
// Attest in release; a debug provider during development (prints a token to
// register in the console).
final class StudioAppCheckProviderFactory: NSObject, AppCheckProviderFactory {
    func createProvider(with app: FirebaseApp) -> AppCheckProvider? {
        #if DEBUG
        return AppCheckDebugProvider(app: app)
        #else
        return AppAttestProvider(app: app)
        #endif
    }
}

@main
struct StudioManagerApp: App {
    #if os(iOS)
    @UIApplicationDelegateAdaptor(EGGcraftAppDelegate.self) private var appDelegate
    #endif

    @StateObject var authVM: AuthViewModel
    @StateObject var firebaseManager: FirebaseManager
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    @Environment(\.scenePhase) private var scenePhase

    init() {
        #if os(macOS) && DEBUG
        Self.closeOlderDebugInstancesBeforeFirebaseStarts()
        #endif

        AppCheck.setAppCheckProviderFactory(StudioAppCheckProviderFactory())
        FirebaseApp.configure()
        #if os(iOS)
        UNUserNotificationCenter.current().delegate = PushNotificationManager.shared
        #endif
        #if os(macOS) && DEBUG
        Self.useMemoryFirestoreCacheForDebugRuns()
        #endif
        _authVM = StateObject(wrappedValue: AuthViewModel())
        _firebaseManager = StateObject(wrappedValue: FirebaseManager())
    }

    #if os(macOS) && DEBUG
    private static func useMemoryFirestoreCacheForDebugRuns() {
        let firestore = Firestore.firestore()
        let settings = firestore.settings
        settings.cacheSettings = MemoryCacheSettings()
        firestore.settings = settings
    }

    private static func closeOlderDebugInstancesBeforeFirebaseStarts() {
        guard let bundleIdentifier = Bundle.main.bundleIdentifier else { return }

        let currentProcessId = ProcessInfo.processInfo.processIdentifier
        let olderInstances = NSRunningApplication
            .runningApplications(withBundleIdentifier: bundleIdentifier)
            .filter { $0.processIdentifier != currentProcessId && !$0.isTerminated }

        guard !olderInstances.isEmpty else { return }

        for app in olderInstances {
            app.terminate()
        }

        let gracefulDeadline = Date().addingTimeInterval(1.5)
        while Date() < gracefulDeadline, olderInstances.contains(where: { !$0.isTerminated }) {
            Thread.sleep(forTimeInterval: 0.05)
        }

        for app in olderInstances where !app.isTerminated {
            app.forceTerminate()
        }

        let forceDeadline = Date().addingTimeInterval(1.0)
        while Date() < forceDeadline, olderInstances.contains(where: { !$0.isTerminated }) {
            Thread.sleep(forTimeInterval: 0.05)
        }
    }

    #endif

    var body: some Scene {
        WindowGroup {
            Group {
                if authVM.isLoggedIn {
                    if authVM.needsEmailVerification {
                        EmailVerifyView(seciliDil: seciliDil)
                            .environmentObject(authVM)
                    } else if authVM.isLocalUnlockSatisfied {
                        if authVM.isWorkspaceReady {
                            ContentView()
                                .id(authVM.interfaceSessionId)
                                .environmentObject(authVM)
                                .environmentObject(firebaseManager)
                        } else {
                            WorkspaceLoadingView()
                                .environmentObject(authVM)
                        }
                    } else {
                        LocalUnlockView()
                            .environmentObject(authVM)
                    }
                } else {
                    LoginView()
                        .environmentObject(authVM)
                }
            }
            .onAppear {
                syncFirebaseWorkspace()
                AppPresenceHeartbeat.shared.start()
            }
            .onChange(of: authVM.currentCompanyId) { _, _ in
                syncFirebaseWorkspace()
            }
            .onChange(of: authVM.isLoggedIn) { _, _ in
                syncFirebaseWorkspace()
            }
            .onChange(of: authVM.isLocalUnlockSatisfied) { _, _ in
                syncFirebaseWorkspace()
            }
            .onChange(of: authVM.isWorkspaceReady) { _, _ in
                syncFirebaseWorkspace()
            }
            .onChange(of: authVM.currentWorkspaceRole) { _, _ in
                syncFirebaseWorkspace()
            }
            .onChange(of: authVM.currentWorkspaceAccess) { _, _ in
                syncFirebaseWorkspace()
            }
            .onChange(of: scenePhase) { _, newPhase in
                switch newPhase {
                case .active:
                    authVM.appBecameActive()
                    #if os(iOS)
                    PushNotificationManager.shared.clearAppIconBadge()
                    #endif
                case .background:
                    authVM.appMovedToBackground()
                default:
                    break
                }
            }
            .onOpenURL { url in
                #if canImport(GoogleSignIn)
                GIDSignIn.sharedInstance.handle(url)
                #endif
            }
        }
    }

    private func syncFirebaseWorkspace() {
        if authVM.isLoggedIn,
           authVM.isLocalUnlockSatisfied,
           authVM.isWorkspaceReady,
           let companyId = authVM.currentCompanyId,
           !companyId.isEmpty {
            firebaseManager.configure(
                companyId: companyId,
                workspaceRole: authVM.currentWorkspaceRole,
                assignedProjectsOnly: authVM.currentWorkspaceAccess["assignedProjectsOnly"] == true,
                manageProjectAssignments: authVM.currentWorkspaceAccess["manageProjectAssignments"] == true
            )
            #if os(iOS)
            PushNotificationManager.shared.configure(companyId: companyId)
            #endif
        } else {
            firebaseManager.resetForLogout()
            #if os(iOS)
            PushNotificationManager.shared.resetForLogout()
            #endif
        }
    }
}


struct WorkspaceLoadingView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @Environment(\.colorScheme) private var colorScheme
    @AppStorage("seciliDil") private var seciliDil: String = "English"

    var body: some View {
        ZStack {
            (colorScheme == .dark ? Color(white: 0.08) : Color(white: 0.94))
                .ignoresSafeArea()

            VStack(spacing: 18) {
                ProgressView()
                    .controlSize(.large)

                Text(t("Opening NivaDesk", lang: seciliDil))
                    .font(.system(size: 24, weight: .bold))

                Text(t("Preparing your workspace...", lang: seciliDil))
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)

                Button(role: .destructive) {
                    authVM.logout()
                } label: {
                    Text("Sign Out")
                        .font(.system(size: 13, weight: .semibold))
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
            }
            .padding(32)
            .frame(maxWidth: 360)
            .background(colorScheme == .dark ? Color.white.opacity(0.06) : Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: .black.opacity(colorScheme == .dark ? 0 : 0.12), radius: 20, y: 12)
            .padding()
        }
    }
}


struct LocalUnlockView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @Environment(\.colorScheme) private var colorScheme
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    @State private var didRequestUnlock = false

    var body: some View {
        ZStack {
            (colorScheme == .dark ? Color(white: 0.08) : Color(white: 0.94))
                .ignoresSafeArea()

            VStack(spacing: 18) {
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 54))
                    .foregroundColor(.blue)

                Text(t("Unlock NivaDesk", lang: seciliDil))
                    .font(.system(size: 26, weight: .bold))

                Text(t("Use Face ID, Touch ID or your device passcode to continue.", lang: seciliDil))
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 320)

                if !authVM.localUnlockMessage.isEmpty {
                    Text(authVM.localUnlockMessage)
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 320)
                }

                Button {
                    authVM.unlockWithDeviceSecurity()
                } label: {
                    Label(t("Unlock", lang: seciliDil), systemImage: "lock.open.fill")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.white)
                        .frame(maxWidth: 260)
                        .padding()
                        .background(Color.blue)
                        .cornerRadius(12)
                }
                .buttonStyle(.plain)

                Button(role: .destructive) {
                    authVM.logout()
                } label: {
                    Text("Sign Out")
                        .font(.system(size: 13, weight: .semibold))
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
            }
            .padding(32)
            .background(colorScheme == .dark ? Color.white.opacity(0.06) : Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: .black.opacity(colorScheme == .dark ? 0 : 0.12), radius: 20, y: 12)
            .padding()
        }
        .onAppear {
            guard !didRequestUnlock else { return }
            didRequestUnlock = true
            authVM.unlockWithDeviceSecurity()
        }
    }
}
