import Foundation
import FirebaseAuth

/// Turns a Firebase sign-in failure into a sentence a person can act on, in the
/// language the app is running in.
///
/// Every sign-in error used to reach the screen as `error.localizedDescription`
/// — "The supplied auth credential is malformed or has expired." — which is
/// English whatever the workspace language is, and says nothing about what to
/// do next.
func nvAuthErrorText(_ error: Error?, fallback: String = "Something went wrong. Please try again.") -> String {
    let language = UserDefaults.standard.string(forKey: "seciliDil") ?? "English"
    func tr(_ text: String) -> String { t(text, lang: language) }

    guard let error else { return tr(fallback) }
    let code = AuthErrorCode(rawValue: (error as NSError).code)

    switch code {
    case .wrongPassword, .invalidCredential:
        return tr("That email and password do not match. Check them and try again.")
    case .userNotFound:
        return tr("There is no account with that email address.")
    case .invalidEmail:
        return tr("That does not look like an email address.")
    case .emailAlreadyInUse:
        return tr("There is already an account with that email address.")
    case .weakPassword:
        return tr("Choose a longer password — at least six characters.")
    case .tooManyRequests:
        return tr("Too many attempts. Wait a few minutes and try again.")
    case .networkError:
        return tr("No connection. Check your internet and try again.")
    case .userDisabled:
        return tr("This account has been disabled. Contact support.")
    case .requiresRecentLogin:
        return tr("Please sign in again to confirm this change.")
    case .operationNotAllowed:
        return tr("This sign-in method is not enabled for NivaDesk.")
    default:
        return tr(fallback)
    }
}
