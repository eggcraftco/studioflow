package uk.co.eggcraft.studioflow.util

import com.google.firebase.FirebaseNetworkException
import com.google.firebase.FirebaseTooManyRequestsException
import com.google.firebase.auth.FirebaseAuthException
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.functions.FirebaseFunctionsException
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

/** A sentence a person can act on, instead of an SDK error code. */
fun friendlyErrorMessage(error: Throwable, t: (String) -> String): String =
    friendlyErrorMessage(error, "Something went wrong. Please try again.", t)

/**
 * Same, with the caller's own fallback ("Could not save the customer.") used
 * whenever the error carries nothing the person could act on.
 */
fun friendlyErrorMessage(error: Throwable, fallback: String, t: (String) -> String): String {
    var current: Throwable? = error
    var depth = 0
    while (current != null && depth < 6) {
        mapKnownError(current, fallback, t)?.let { return it }
        current = current.cause
        depth++
    }
    // Messages raised on purpose by the app's own checks (require/error) are
    // already written for the person reading them.
    val own = error.message?.trim().orEmpty()
    if ((error is IllegalArgumentException || error is IllegalStateException) && own.isNotEmpty()) return t(own)
    return t(fallback)
}

private fun serverMessageOr(error: Throwable, fallback: String, t: (String) -> String): String {
    val message = error.message?.trim().orEmpty()
    if (message.isEmpty() || message.uppercase() == message) return t(fallback)
    return message
}

private fun mapKnownError(error: Throwable, fallback: String, t: (String) -> String): String? = when (error) {
    is FirebaseAuthException -> when (error.errorCode) {
        "ERROR_WRONG_PASSWORD", "ERROR_INVALID_CREDENTIAL", "ERROR_INVALID_LOGIN_CREDENTIALS" -> t("The email or password is incorrect.")
        "ERROR_USER_NOT_FOUND" -> t("No account was found for that email.")
        "ERROR_INVALID_EMAIL" -> t("That email address doesn't look right.")
        "ERROR_EMAIL_ALREADY_IN_USE" -> t("An account already exists for that email.")
        "ERROR_WEAK_PASSWORD" -> t("Please choose a stronger password.")
        "ERROR_TOO_MANY_REQUESTS" -> t("Too many attempts. Please wait a moment and try again.")
        "ERROR_NETWORK_REQUEST_FAILED" -> t("No internet connection.")
        "ERROR_USER_DISABLED" -> t("This account has been disabled.")
        "ERROR_REQUIRES_RECENT_LOGIN" -> t("Please sign in again to continue.")
        else -> null
    }
    is FirebaseFunctionsException -> when (error.code) {
        FirebaseFunctionsException.Code.PERMISSION_DENIED -> t("You don't have permission for this.")
        // The server's precondition text explains plan limits; keep it when there is one.
        FirebaseFunctionsException.Code.FAILED_PRECONDITION -> serverMessageOr(error, fallback, t)
        FirebaseFunctionsException.Code.RESOURCE_EXHAUSTED,
        FirebaseFunctionsException.Code.UNAVAILABLE,
        FirebaseFunctionsException.Code.DEADLINE_EXCEEDED -> t("The server is busy. Please try again.")
        FirebaseFunctionsException.Code.UNAUTHENTICATED -> t("Please sign in again.")
        // These carry a message written for the caller (what was wrong with the input, what was missing).
        FirebaseFunctionsException.Code.INVALID_ARGUMENT,
        FirebaseFunctionsException.Code.NOT_FOUND,
        FirebaseFunctionsException.Code.ALREADY_EXISTS,
        FirebaseFunctionsException.Code.ABORTED,
        FirebaseFunctionsException.Code.OUT_OF_RANGE -> serverMessageOr(error, fallback, t)
        else -> t(fallback)
    }
    is FirebaseFirestoreException -> when (error.code) {
        FirebaseFirestoreException.Code.PERMISSION_DENIED -> t("You don't have permission for this.")
        FirebaseFirestoreException.Code.UNAVAILABLE,
        FirebaseFirestoreException.Code.DEADLINE_EXCEEDED,
        FirebaseFirestoreException.Code.RESOURCE_EXHAUSTED -> t("The server is busy. Please try again.")
        FirebaseFirestoreException.Code.UNAUTHENTICATED -> t("Please sign in again.")
        else -> null
    }
    is FirebaseTooManyRequestsException -> t("Too many attempts. Please wait a moment and try again.")
    is FirebaseNetworkException, is UnknownHostException, is SocketTimeoutException -> t("No internet connection.")
    is IOException -> t("No internet connection.")
    else -> null
}
