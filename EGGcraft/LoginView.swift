import SwiftUI
import FirebaseAuth
import Combine
import Security

private enum LoginCredentialStore {
    private static let service = "uk.co.eggcraft.studioflow.login"

    private static func cleanEmail(_ email: String) -> String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    static func save(email: String, password: String) {
        let account = cleanEmail(email)
        guard !account.isEmpty, !password.isEmpty, let data = password.data(using: .utf8) else { return }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        let update: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]

        let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var addQuery = query
            addQuery[kSecValueData as String] = data
            addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            SecItemAdd(addQuery as CFDictionary, nil)
        }
    }

    static func password(for email: String) -> String? {
        let account = cleanEmail(email)
        guard !account.isEmpty else { return nil }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}



// Animated feature words above the sign-in card — typewriter style with a
// tiny haptic tick per letter on iPhone (mirrors the web login hero).
struct LoginFeatureRotator: View {
    let seciliDil: String

    @State private var wordIndex = 0
    @State private var charCount = 0
    @State private var holdTicks = 0
    @State private var isDeleting = false
    @State private var pauseTicks = 0
    private let timer = Timer.publish(every: 0.045, on: .main, in: .common).autoconnect()
    // Timing knobs (in 45 ms ticks): how long a finished word stays on screen,
    // and the quiet gap after it has been erased before the next one types.
    private let holdAfterTyping = 55   // ~2.5 s
    private let pauseAfterDelete = 20  // ~0.9 s

    private var words: [String] {
        [
            t("Dashboard", lang: seciliDil),
            t("Orders", lang: seciliDil),
            t("Schedule", lang: seciliDil),
            t("Customers", lang: seciliDil),
            t("Files", lang: seciliDil),
            t("Tasks", lang: seciliDil),
            t("Tracking", lang: seciliDil),
            t("Notes", lang: seciliDil),
            t("Analytics", lang: seciliDil),
            t("AI Assistant", lang: seciliDil),
            t("Storage", lang: seciliDil)
        ]
    }

    // Soft order-card palette; one colour per word, cycling.
    private var caretColor: Color {
        let palette: [Color] = [
            Color(red: 0.38, green: 0.65, blue: 0.98),
            Color(red: 0.45, green: 0.80, blue: 0.55),
            Color(red: 0.98, green: 0.72, blue: 0.40),
            Color(red: 0.93, green: 0.55, blue: 0.65),
            Color(red: 0.66, green: 0.55, blue: 0.95),
            Color(red: 0.42, green: 0.78, blue: 0.80)
        ]
        return palette[wordIndex % palette.count]
    }

    private var caretSize: CGFloat {
        let sizes: [CGFloat] = [14, 17, 15, 18, 14.5, 16]
        return sizes[wordIndex % sizes.count]
    }

    // Caret: a tiny rounded square like the colourful order cards in the app.
    // Colour and size shift subtly with each word; solid while typing/erasing,
    // gently blinking while the word is held.
    private func caretView(for word: String) -> some View {
        RoundedRectangle(cornerRadius: 3.5, style: .continuous)
            .fill(caretColor)
            .frame(width: caretSize, height: caretSize)
            .opacity(isDeleting || charCount < word.count ? 0.9 : (holdTicks % 16 < 8 ? 0.7 : 0.15))
            .animation(.easeInOut(duration: 0.3), value: wordIndex)
    }

    private func tickHaptic(intensity: CGFloat = 0.75) {
        #if os(iOS)
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred(intensity: intensity)
        #endif
    }

    var body: some View {
        let word = words[wordIndex % words.count]
        let typed = String(word.prefix(charCount))
        // The invisible twin caret on the left keeps the WORD perfectly
        // centred on screen — the visible caret hangs off to the right
        // without pulling the text sideways. When the word is fully erased,
        // the caret alone takes centre stage.
        Group {
            if typed.isEmpty {
                caretView(for: word)
            } else {
                HStack(spacing: 5) {
                    caretView(for: word).hidden()
                    Text(typed)
                        .font(.system(size: 27, weight: .heavy))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [Color(red: 0.04, green: 0.52, blue: 1.0), Color(red: 0.54, green: 0.36, blue: 0.96), Color(red: 0.84, green: 0.36, blue: 0.84)],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                    caretView(for: word)
                }
            }
        }
        .frame(height: 36)
        .onReceive(timer) { _ in
            let current = words[wordIndex % words.count]
            if isDeleting {
                // Rewind the typing animation, twice as fast as writing.
                if charCount > 0 {
                    charCount = max(charCount - 2, 0)
                    tickHaptic(intensity: 0.45)
                } else if pauseTicks < pauseAfterDelete {
                    pauseTicks += 1
                } else {
                    isDeleting = false
                    holdTicks = 0
                    pauseTicks = 0
                    wordIndex = (wordIndex + 1) % words.count
                }
            } else if charCount < current.count {
                charCount += 1
                tickHaptic()
            } else if holdTicks < holdAfterTyping {
                holdTicks += 1
            } else {
                isDeleting = true
            }
        }
    }
}

// Official Google "G" mark (exact brand asset).
struct GoogleGLogo: View {
    var size: CGFloat = 17

    var body: some View {
        Image("GoogleGLogo")
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
    }
}

struct LoginView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @Environment(\.colorScheme) var colorScheme
    @AppStorage("seciliDil") private var seciliDil: String = "English"

    @State private var email = ""
    @State private var password = ""
    @State private var isLoginMode = true
    @State private var signupFullName = ""
    @State private var signupStudioName = ""
    @State private var lastAutofilledEmail = ""
    @FocusState private var focusedField: LoginField?

    private enum LoginField {
        case email
        case password
    }

    private var canSubmit: Bool {
        !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !password.isEmpty && !authVM.isLoading
    }

    private func submitCredentials() {
        guard canSubmit else { return }
        if isLoginMode {
            let submittedEmail = email
            let submittedPassword = password
            authVM.login(email: submittedEmail, sifre: submittedPassword) {
                LoginCredentialStore.save(email: submittedEmail, password: submittedPassword)
            }
        } else {
            let submittedEmail = email
            let submittedPassword = password
            authVM.register(fullName: signupFullName, studioName: signupStudioName, email: submittedEmail, sifre: submittedPassword) {
                LoginCredentialStore.save(email: submittedEmail, password: submittedPassword)
            }
        }
    }

    private func autofillPasswordIfPossible(for newEmail: String) {
        guard isLoginMode else { return }
        let cleanEmail = newEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !cleanEmail.isEmpty, cleanEmail != lastAutofilledEmail else { return }
        guard password.isEmpty, let savedPassword = LoginCredentialStore.password(for: cleanEmail) else { return }

        password = savedPassword
        lastAutofilledEmail = cleanEmail
    }

    @State private var showEmailForm = false

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                (colorScheme == .dark ? Color(white: 0.08) : Color(white: 0.94))
                    .ignoresSafeArea()

                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 16) {
                        Image("NivaDeskLogo")
                            .resizable()
                            .scaledToFit()
                            .frame(maxWidth: 170, maxHeight: 48)
                            .accessibilityLabel("NivaDesk")

                        LoginFeatureRotator(seciliDil: seciliDil)
                            .padding(.top, 44)
                            .padding(.bottom, 40)

                        Text(isLoginMode ? t("Sign in to your workspace", lang: seciliDil) : t("Create a new workspace", lang: seciliDil))
                            .font(.system(size: 14))
                            .foregroundColor(.gray)
                            .padding(.bottom, 2)

                        Button {
                            authVM.signInWithApple()
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: "apple.logo")
                                    .font(.system(size: 17, weight: .semibold))
                                Text(t("Continue with Apple", lang: seciliDil))
                                    .font(.system(size: 14, weight: .semibold))
                            }
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.black)
                            .cornerRadius(10)
                        }
                        .buttonStyle(.plain)
                        .disabled(authVM.isLoading)

                        Button {
                            authVM.signInWithGoogle()
                        } label: {
                            HStack(spacing: 10) {
                                GoogleGLogo(size: 17)
                                Text(t("Continue with Google", lang: seciliDil))
                                    .font(.system(size: 14, weight: .semibold))
                            }
                            .foregroundColor(.primary)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.primary.opacity(0.06))
                            .overlay(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .stroke(Color.primary.opacity(0.12), lineWidth: 1)
                            )
                            .cornerRadius(10)
                        }
                        .buttonStyle(.plain)
                        .disabled(authVM.isLoading)

                        if !showEmailForm {
                            Button {
                                withAnimation(.snappy) { showEmailForm = true }
                            } label: {
                                HStack(spacing: 7) {
                                    Image(systemName: "envelope")
                                        .font(.system(size: 12, weight: .semibold))
                                    Text(t("Continue with email", lang: seciliDil))
                                        .font(.system(size: 13, weight: .semibold))
                                }
                                .foregroundColor(.secondary)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 9)
                                .background(Color.primary.opacity(0.05))
                                .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)
                            .padding(.top, 6)
                        }

                        if showEmailForm {
                        HStack(spacing: 12) {
                            Rectangle()
                                .fill(Color.primary.opacity(0.12))
                                .frame(height: 1)
                            Text("or")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(.secondary)
                            Rectangle()
                                .fill(Color.primary.opacity(0.12))
                                .frame(height: 1)
                        }

                        VStack(spacing: 12) {
                            if !isLoginMode {
                                TextField(t("Full Name", lang: seciliDil), text: $signupFullName)
                                    .textFieldStyle(.plain)
                                    .padding()
                                    .background(Color.primary.opacity(0.05))
                                    .cornerRadius(8)
                                    .textContentType(.name)
                                    .autocorrectionDisabled(true)
                                TextField(t("Studio / Workspace Name", lang: seciliDil), text: $signupStudioName)
                                    .textFieldStyle(.plain)
                                    .padding()
                                    .background(Color.primary.opacity(0.05))
                                    .cornerRadius(8)
                                    .textContentType(.organizationName)
                                    .autocorrectionDisabled(true)
                            }
                            TextField(t("Email Address", lang: seciliDil), text: $email)
                                .focused($focusedField, equals: .email)
                                .textFieldStyle(.plain)
                                .padding()
                                .background(Color.primary.opacity(0.05))
                                .cornerRadius(8)
                                .textContentType(isLoginMode ? .username : .emailAddress)
                                .autocorrectionDisabled(true)
                                .submitLabel(.next)
                                .onChange(of: email) { _, newValue in
                                    autofillPasswordIfPossible(for: newValue)
                                }
                                .onSubmit {
                                    autofillPasswordIfPossible(for: email)
                                    focusedField = .password
                                }
                                #if os(iOS)
                                .textInputAutocapitalization(.never)
                                .keyboardType(.emailAddress)
                                #endif

                            SecureField(t("Password", lang: seciliDil), text: $password)
                                .focused($focusedField, equals: .password)
                                .textFieldStyle(.plain)
                                .padding()
                                .background(Color.primary.opacity(0.05))
                                .cornerRadius(8)
                                .textContentType(isLoginMode ? .password : .newPassword)
                                .submitLabel(.go)
                                .onSubmit {
                                    submitCredentials()
                                }
                        }
                        .padding(.vertical, 6)

                        if !authVM.errorMessage.isEmpty {
                            Text(authVM.errorMessage)
                                .font(.system(size: 12))
                                .foregroundColor(.red)
                                .multilineTextAlignment(.center)
                        }

                        Button(action: submitCredentials) {
                            HStack {
                                if authVM.isLoading {
                                    ProgressView()
                                        .controlSize(.small)
                                        .tint(.white)
                                } else {
                                    Text(isLoginMode ? t("Sign In", lang: seciliDil) : t("Create Account", lang: seciliDil))
                                }
                            }
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background((email.isEmpty || password.isEmpty || authVM.isLoading) ? Color.gray : Color.blue)
                            .cornerRadius(8)
                        }
                        .buttonStyle(.plain)
                        .disabled(!canSubmit)
                        }

                        Button(action: {
                            withAnimation {
                                isLoginMode.toggle()
                                lastAutofilledEmail = ""
                                authVM.errorMessage = ""
                                if !isLoginMode { showEmailForm = true }
                            }
                        }) {
                            Text(isLoginMode ? t("Don't have an account? Create one", lang: seciliDil) : t("Already have an account? Sign In", lang: seciliDil))
                                .font(.system(size: 13))
                                .foregroundColor(.blue)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(geometry.size.width < 430 ? 22 : 40)
                    .frame(maxWidth: min(400, max(0, geometry.size.width - 32)))
                    .background(colorScheme == .dark ? Color.white.opacity(0.05) : Color.white)
                    .cornerRadius(20)
                    .shadow(color: .black.opacity(0.1), radius: 20, y: 10)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 24)
                    .frame(minHeight: geometry.size.height, alignment: .center)
                }
            }
        }
    }
}

// MARK: - Email verification gate screen

struct EmailVerifyView: View {
    @EnvironmentObject var authVM: AuthViewModel
    let seciliDil: String
    @State private var statusText = ""
    @State private var busy = false

    var body: some View {
        VStack(spacing: 14) {
            Text("📬").font(.system(size: 42))
            Text(t("Verify your email", lang: seciliDil))
                .font(.system(size: 22, weight: .heavy))
            Text(t("We sent a verification link to:", lang: seciliDil))
                .font(.system(size: 13))
                .foregroundColor(.gray)
            Text(Auth.auth().currentUser?.email ?? "")
                .font(.system(size: 14, weight: .bold))
            Text(t("Click the link in that email, then come back here.", lang: seciliDil))
                .font(.system(size: 12))
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)

            if !statusText.isEmpty {
                Text(statusText)
                    .font(.system(size: 12, weight: .semibold))
                    .multilineTextAlignment(.center)
            }

            Button {
                busy = true
                authVM.refreshEmailVerification { verified in
                    busy = false
                    if !verified {
                        statusText = t("Not verified yet — click the link in the email first.", lang: seciliDil)
                    }
                }
            } label: {
                Text(t("I've verified — continue", lang: seciliDil))
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
                    .cornerRadius(10)
            }
            .buttonStyle(.plain)
            .disabled(busy)

            Button {
                busy = true
                authVM.resendVerificationEmail { message in
                    busy = false
                    statusText = message
                }
            } label: {
                Text(t("Resend email", lang: seciliDil))
                    .font(.system(size: 13, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 11)
                    .background(Color.primary.opacity(0.06))
                    .cornerRadius(10)
            }
            .buttonStyle(.plain)
            .disabled(busy)

            Button(t("Sign Out", lang: seciliDil)) {
                authVM.logout()
            }
            .buttonStyle(.plain)
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(.gray)
        }
        .padding(30)
        .frame(maxWidth: 380)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// Thin, dismissible reminder shown at the top of the app during the pre-gate
// grace window (days 0–3) so a newly signed-up user is nudged to verify their
// email before the hard verification gate kicks in.
struct EmailVerifyReminderBanner: View {
    @EnvironmentObject var authVM: AuthViewModel
    let seciliDil: String
    @State private var busy = false
    @State private var statusText = ""
    // X never fully hides the reminder — it collapses to a one-line strip that
    // expands back on tap. Keyed by uid so it never bleeds across accounts.
    @AppStorage("emailVerifyBannerCollapsedUidV1") private var collapsedUid: String = ""

    private var isCollapsed: Bool {
        !currentUid.isEmpty && collapsedUid == currentUid
    }

    private var currentUid: String {
        authVM.currentUserId ?? ""
    }

    var body: some View {
        if isCollapsed {
            collapsedStrip
        } else {
            expandedBanner
        }
    }

    private var collapsedStrip: some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) {
                collapsedUid = ""
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "envelope.badge.fill")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.orange)
                Text(t("Verify email", lang: seciliDil))
                    .font(.system(size: 10.5, weight: .semibold))
                    .foregroundColor(.primary)
                Image(systemName: "chevron.down")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundColor(.secondary)
            }
            .padding(.vertical, 5)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
            .background(.ultraThinMaterial)
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color.orange.opacity(0.28)), alignment: .bottom)
        }
        .buttonStyle(.plain)
    }

    private var expandedBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "envelope.badge.fill")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.orange)
            VStack(alignment: .leading, spacing: 2) {
                Text(t("Verify your email to keep your account.", lang: seciliDil))
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundColor(.primary)
                if !statusText.isEmpty {
                    Text(statusText).font(.system(size: 11)).foregroundColor(.secondary)
                } else if !authVM.currentAccountEmail.isEmpty {
                    Text(authVM.currentAccountEmail).font(.system(size: 11)).foregroundColor(.secondary)
                }
            }
            Spacer(minLength: 8)
            Button {
                busy = true
                authVM.refreshEmailVerification { verified in
                    busy = false
                    if !verified {
                        statusText = t("Not verified yet — click the link in the email first.", lang: seciliDil)
                    }
                }
            } label: {
                Text(t("I've verified — continue", lang: seciliDil))
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(Color.blue).cornerRadius(8)
            }
            .buttonStyle(.plain).disabled(busy)
            Button {
                busy = true
                authVM.resendVerificationEmail { message in busy = false; statusText = message }
            } label: {
                Text(t("Resend email", lang: seciliDil))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.primary)
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(Color.primary.opacity(0.06)).cornerRadius(8)
            }
            .buttonStyle(.plain).disabled(busy)

            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    collapsedUid = currentUid
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)
                    .frame(width: 26, height: 26)
                    .background(Color.primary.opacity(0.06))
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background(.ultraThinMaterial)
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color.orange.opacity(0.28)), alignment: .bottom)
    }
}
