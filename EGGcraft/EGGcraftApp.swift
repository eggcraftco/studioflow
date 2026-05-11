import SwiftUI
import FirebaseCore

#if canImport(GoogleSignIn)
import GoogleSignIn
#endif


@main
struct StudioManagerApp: App {
    @StateObject var authVM: AuthViewModel
    @StateObject var firebaseManager: FirebaseManager

    init() {
        FirebaseApp.configure()
        _authVM = StateObject(wrappedValue: AuthViewModel())
        _firebaseManager = StateObject(wrappedValue: FirebaseManager())
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if authVM.isLoggedIn {
                    if authVM.isLocalUnlockSatisfied {
                        ContentView()
                            .environmentObject(authVM)
                            .environmentObject(firebaseManager)
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
            }
            .onChange(of: authVM.currentCompanyId) { _ in
                syncFirebaseWorkspace()
            }
            .onChange(of: authVM.isLocalUnlockSatisfied) { _ in
                syncFirebaseWorkspace()
            }
            .onOpenURL { url in
                #if canImport(GoogleSignIn) && os(iOS)
                GIDSignIn.sharedInstance.handle(url)
                #endif
            }
        }
    }

    private func syncFirebaseWorkspace() {
        if authVM.isLoggedIn,
           authVM.isLocalUnlockSatisfied,
           let companyId = authVM.currentCompanyId,
           !companyId.isEmpty {
            firebaseManager.configure(companyId: companyId, workspaceRole: authVM.currentWorkspaceRole)
        } else {
            firebaseManager.resetForLogout()
        }
    }
}


struct LocalUnlockView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @Environment(\.colorScheme) private var colorScheme
    @State private var didRequestUnlock = false

    var body: some View {
        ZStack {
            (colorScheme == .dark ? Color(white: 0.08) : Color(white: 0.94))
                .ignoresSafeArea()

            VStack(spacing: 18) {
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 54))
                    .foregroundColor(.blue)

                Text("Unlock StudioFlow")
                    .font(.system(size: 26, weight: .bold))

                Text("Use Face ID, Touch ID or your device passcode to continue.")
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
                    Label("Unlock", systemImage: "lock.open.fill")
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
