import SwiftUI
import FirebaseCore
import FirebaseAppCheck
import FirebaseAuth
import FirebaseFirestore
import FirebaseFunctions
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

#if os(macOS)
/// Hard-enforces a minimum macOS window size at the AppKit level. SwiftUI's
/// windowResizability(.contentMinSize) did not reliably stop the window from being
/// dragged below the content size (it just centred + clipped the content on both
/// sides). Setting window.contentMinSize prevents the resize outright (App Review
/// Guideline 4 — windows that cut off text).
private struct WindowMinSizeSetter: NSViewRepresentable {
    let width: CGFloat
    let height: CGFloat

    func makeNSView(context: Context) -> NSView {
        let view = NSView(frame: .zero)
        apply(from: view)
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        apply(from: nsView)
    }

    private func apply(from view: NSView) {
        let target = NSSize(width: width, height: height)
        DispatchQueue.main.async {
            guard let window = view.window else { return }
            window.contentMinSize = target
            // If the window is already narrower/shorter than the new minimum, grow it
            // so nothing is left clipped after this takes effect.
            let contentSize = window.contentLayoutRect.size
            if contentSize.width < width || contentSize.height < height {
                let newContent = NSSize(width: max(contentSize.width, width),
                                        height: max(contentSize.height, height))
                window.setContentSize(newContent)
            }
        }
    }
}
#endif

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

        // First launch on this device: default the app language to the device
        // locale (runs before any view reads "seciliDil"; a stored choice wins).
        seedStudioLanguageFromDeviceIfNeeded()

        AppCheck.setAppCheckProviderFactory(StudioAppCheckProviderFactory())
        FirebaseApp.configure()
        #if DEBUG
        Self.connectLocalEmulatorsIfRequested()
        #endif
        #if os(iOS)
        UNUserNotificationCenter.current().delegate = PushNotificationManager.shared
        #endif
        #if os(macOS) && DEBUG
        Self.useMemoryFirestoreCacheForDebugRuns()
        #endif
        _authVM = StateObject(wrappedValue: AuthViewModel())
        _firebaseManager = StateObject(wrappedValue: FirebaseManager())
    }

    #if DEBUG
    /// Points the app at the local Firebase emulators when launched with
    /// NIVADESK_USE_EMULATOR=1, so a test workspace can be exercised on a
    /// simulator without touching live data. Debug builds only, opt-in by
    /// environment variable — a normal run never sees this.
    private static func connectLocalEmulatorsIfRequested() {
        let env = ProcessInfo.processInfo.environment
        guard env["NIVADESK_USE_EMULATOR"] == "1" else { return }
        let host = env["NIVADESK_EMULATOR_HOST"] ?? "127.0.0.1"
        Auth.auth().useEmulator(withHost: host, port: 9099)
        let firestore = Firestore.firestore()
        let settings = firestore.settings
        settings.host = "\(host):8080"
        settings.isSSLEnabled = false
        settings.cacheSettings = MemoryCacheSettings()
        firestore.settings = settings
        Functions.functions(region: "europe-west2").useEmulator(withHost: host, port: 5001)
        print("[NivaDesk] Local Firebase emulators connected at \(host)")

        // A custom token lets a test workspace sign in without a password. Only
        // the emulator accepts these, so this cannot reach a real account.
        if let token = env["NIVADESK_EMULATOR_TOKEN"], !token.isEmpty {
            Auth.auth().signIn(withCustomToken: token) { _, error in
                if let error {
                    print("[NivaDesk] Emulator sign-in failed: \(error.localizedDescription)")
                } else {
                    print("[NivaDesk] Emulator sign-in complete")
                }
            }
        }
    }
    #endif

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
                                // Attached here rather than inside ContentView's
                                // body: that body is already a very deep nested
                                // generic, and adding to it has crashed on device.
                                .modifier(AppHelpAssistantHost(companyId: firebaseManager.currentCompanyId, lang: seciliDil))
                                .safeAreaInset(edge: .top) {
                                    if authVM.isInEmailVerificationGracePeriod {
                                        EmailVerifyReminderBanner(seciliDil: seciliDil)
                                            .environmentObject(authVM)
                                    }
                                }
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
            .alert(t("Verify your email", lang: seciliDil), isPresented: $authVM.showPostSignupVerifyNotice) {
                Button(t("OK", lang: seciliDil), role: .cancel) { }
            } message: {
                Text(
                    t("We sent a verification link to:", lang: seciliDil) + " "
                    + authVM.currentAccountEmail + "\n\n"
                    + t("Keep full access by verifying within a few days. Accounts with no data that stay unverified are removed after 30 days.", lang: seciliDil)
                )
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
            #if os(macOS)
            .background(WindowMinSizeSetter(width: 900, height: 620))
            #endif
        }
        #if os(macOS)
        .defaultSize(width: 1280, height: 820)
        #endif
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
