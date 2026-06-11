import SwiftUI
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


// Official-style multicolour Google "G" mark drawn natively.
struct GoogleGLogo: View {
    var size: CGFloat = 17

    var body: some View {
        let lineWidth = size * 0.22
        ZStack {
            Circle().trim(from: 0.00, to: 0.25).stroke(Color(red: 0.26, green: 0.52, blue: 0.96), style: StrokeStyle(lineWidth: lineWidth))
            Circle().trim(from: 0.25, to: 0.50).stroke(Color(red: 0.20, green: 0.66, blue: 0.33), style: StrokeStyle(lineWidth: lineWidth))
            Circle().trim(from: 0.50, to: 0.75).stroke(Color(red: 0.98, green: 0.74, blue: 0.02), style: StrokeStyle(lineWidth: lineWidth))
            Circle().trim(from: 0.75, to: 1.00).stroke(Color(red: 0.92, green: 0.26, blue: 0.21), style: StrokeStyle(lineWidth: lineWidth))
            Rectangle()
                .fill(Color(red: 0.26, green: 0.52, blue: 0.96))
                .frame(width: size * 0.5 + lineWidth / 2, height: lineWidth)
                .offset(x: size * 0.25 + lineWidth / 4)
        }
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

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                (colorScheme == .dark ? Color(white: 0.08) : Color(white: 0.94))
                    .ignoresSafeArea()

                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 25) {
                        Image("NivaDeskLogo")
                            .resizable()
                            .scaledToFit()
                            .frame(maxWidth: 280, maxHeight: 78)
                            .padding(.bottom, 8)
                            .accessibilityLabel("NivaDesk")

                        Text(isLoginMode ? t("Sign in to your workspace", lang: seciliDil) : t("Create a new workspace", lang: seciliDil))
                            .font(.system(size: 14))
                            .foregroundColor(.gray)

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

                        VStack(spacing: 15) {
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
                        .padding(.vertical, 10)

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

                        Button(action: {
                            withAnimation {
                                isLoginMode.toggle()
                                lastAutofilledEmail = ""
                                authVM.errorMessage = ""
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
