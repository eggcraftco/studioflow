package uk.co.eggcraft.studioflow.features.onboarding

import android.content.Context
import android.content.SharedPreferences

/**
 * The half-finished wizard on disk. SharedPreferences is Android's own answer
 * to the web's localStorage and Apple's @AppStorage, which is what the other
 * two surfaces use for this — device-local, survives the app being closed, and
 * never leaves the phone.
 *
 * One file, one key per user and workspace inside it (see
 * [OnboardingProgressStore]), rather than a file per pair as the orders list
 * does: a wizard is answered once, and a file that is deleted the moment setup
 * finishes is not worth a file of its own.
 */
const val OnboardingProgressPrefsName = "studioflow_onboarding_progress"

private class SharedPreferencesOnboardingStorage(
    private val prefs: SharedPreferences
) : OnboardingProgressStorage {
    override fun read(key: String): String? = prefs.getString(key, null)

    override fun write(key: String, value: String) {
        prefs.edit().putString(key, value).apply()
    }

    override fun remove(key: String) {
        prefs.edit().remove(key).apply()
    }
}

/**
 * A store for this person in this workspace. Opening the file is itself
 * guarded: a device-encrypted context before first unlock throws rather than
 * returning nothing, and a wizard that will not open because a preferences file
 * would not is a far worse bug than a wizard that forgets.
 */
fun onboardingProgressStore(
    context: Context,
    userId: String,
    workspaceId: String
): OnboardingProgressStore {
    val storage = runCatching {
        SharedPreferencesOnboardingStorage(
            context.getSharedPreferences(OnboardingProgressPrefsName, Context.MODE_PRIVATE)
        )
    }.getOrNull()
    return OnboardingProgressStore(storage, userId, workspaceId)
}
