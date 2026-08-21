package uk.co.eggcraft.studioflow.features.auth

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Public
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.TextButton
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uk.co.eggcraft.studioflow.R

@Composable
fun LoginScreen(
    signingIn: Boolean,
    errorMessage: String,
    onSignIn: (String, String) -> Unit,
    onRegister: (String, String, String, String) -> Unit = { _, _, _, _ -> },
    onGoogleSignIn: () -> Unit,
    onAppleSignIn: () -> Unit = {}
) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var isLoginMode by remember { mutableStateOf(true) }
    var fullName by remember { mutableStateOf("") }
    var studioName by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf("") }
    var showEmailForm by remember { mutableStateOf(false) }
    val passwordsMismatchText = t("Passwords do not match.")

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(20.dp),
        contentAlignment = Alignment.Center
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(22.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 2.dp
        ) {
            Column(
                modifier = Modifier.padding(22.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Image(
                    painter = painterResource(id = R.drawable.nivadesk_logo_lockup),
                    contentDescription = "NivaDesk",
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    alignment = Alignment.Center,
                    contentScale = ContentScale.Fit
                )
                Spacer(modifier = Modifier.height(30.dp))
                LoginFeatureRotator()
                Spacer(modifier = Modifier.height(26.dp))
                Text(
                    text = if (isLoginMode) t("Sign in with the same account you use on iPhone, iPad, Mac or web.") else t("Create a new workspace"),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                    fontWeight = FontWeight.SemiBold
                )
                OutlinedButton(
                    onClick = onGoogleSignIn,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    enabled = !signingIn,
                    shape = RoundedCornerShape(12.dp)
                ) {
                    GoogleGLogo()
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(t("Continue with Google"), fontWeight = FontWeight.Bold)
                }
                Button(
                    onClick = onAppleSignIn,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    enabled = !signingIn,
                    shape = RoundedCornerShape(12.dp),
                    colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                        containerColor = Color.Black,
                        contentColor = Color.White
                    )
                ) {
                    AppleLogo()
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(t("Continue with Apple"), fontWeight = FontWeight.Bold)
                }
                if (!showEmailForm) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Center
                    ) {
                        TextButton(onClick = { showEmailForm = true }) {
                            Text(
                                t("Continue with email"),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                    if (errorMessage.isNotBlank() || localError.isNotBlank()) {
                        Text(
                            text = if (localError.isNotBlank()) localError else errorMessage,
                            color = MaterialTheme.colorScheme.error,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
                if (showEmailForm) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    HorizontalDivider(modifier = Modifier.weight(1f))
                    Text(
                        text = t("or"),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                    HorizontalDivider(modifier = Modifier.weight(1f))
                }
                if (!isLoginMode) {
                    OutlinedTextField(
                        value = fullName,
                        onValueChange = { fullName = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text(t("Full Name")) },
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = studioName,
                        onValueChange = { studioName = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text(t("Studio / Workspace Name")) },
                        singleLine = true
                    )
                }
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text(t("Email")) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text(t("Password")) },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password)
                )
                if (errorMessage.isNotBlank() || localError.isNotBlank()) {
                    Text(
                        text = if (localError.isNotBlank()) localError else errorMessage,
                        color = MaterialTheme.colorScheme.error,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
                if (!isLoginMode) {
                    OutlinedTextField(
                        value = confirmPassword,
                        onValueChange = { confirmPassword = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text(t("Confirm Password")) },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password)
                    )
                }
                Spacer(modifier = Modifier.height(2.dp))
                Button(
                    onClick = {
                        if (isLoginMode) {
                            onSignIn(email, password)
                        } else if (password != confirmPassword) {
                            localError = passwordsMismatchText
                        } else {
                            localError = ""
                            onRegister(fullName, studioName, email, password)
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    enabled = !signingIn,
                    shape = RoundedCornerShape(12.dp)
                ) {
                    if (signingIn) {
                        CircularProgressIndicator(strokeWidth = 2.dp)
                    } else {
                        Text(if (isLoginMode) t("Sign In") else t("Create Account"), fontWeight = FontWeight.Bold)
                    }
                }
                }
                TextButton(
                    onClick = {
                        isLoginMode = !isLoginMode
                        localError = ""
                        if (!isLoginMode) showEmailForm = true
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        if (isLoginMode) t("Don't have an account? Create one") else t("Already have an account? Sign In"),
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}


// Official Google "G" mark (exact brand vector).
@Composable
private fun GoogleGLogo(logoSize: androidx.compose.ui.unit.Dp = 18.dp) {
    Image(
        painter = painterResource(id = uk.co.eggcraft.studioflow.R.drawable.ic_google_g),
        contentDescription = null,
        modifier = Modifier.size(logoSize)
    )
}

// Apple logo mark for the "Continue with Apple" button.
@Composable
private fun AppleLogo(logoSize: androidx.compose.ui.unit.Dp = 18.dp) {
    Image(
        painter = painterResource(id = uk.co.eggcraft.studioflow.R.drawable.ic_apple_logo),
        contentDescription = null,
        modifier = Modifier.size(logoSize)
    )
}

// --- Email verification gate -------------------------------------------------

fun firebaseUserNeedsEmailVerification(): Boolean {
    val user = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser ?: return false
    if (user.isEmailVerified) return false
    if (user.providerData.none { it.providerId == "password" }) return false
    // Industry-standard grace period: new accounts get full access for a few
    // days; only stale unverified accounts hit the hard gate.
    val createdMs = user.metadata?.creationTimestamp ?: return false
    return System.currentTimeMillis() - createdMs > 3L * 86400000L
}

@Composable
fun EmailVerifyScreen(onVerified: () -> Unit, onSignOut: () -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var statusText by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val email = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.email ?: ""
    val notVerifiedText = t("Not verified yet — click the link in the email first.")
    val sentText = t("Verification email sent. Check your inbox.")

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Surface(shape = RoundedCornerShape(22.dp), tonalElevation = 2.dp) {
            Column(
                modifier = Modifier.padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("📬", fontSize = 40.sp)
                Text(t("Verify your email"), fontSize = 21.sp, fontWeight = FontWeight.Black)
                Text(t("We sent a verification link to:"), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                Text(email, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Text(
                    t("Click the link in that email, then come back here."),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp
                )
                if (statusText.isNotBlank()) {
                    Text(statusText, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }
                Button(
                    onClick = {
                        busy = true
                        scope.launch {
                            val user = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser
                            runCatching { user?.reload()?.await() }
                            busy = false
                            if (com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.isEmailVerified == true) {
                                onVerified()
                            } else {
                                statusText = notVerifiedText
                            }
                        }
                    },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(12.dp)
                ) { Text(t("I've verified — continue"), fontWeight = FontWeight.Bold) }
                OutlinedButton(
                    onClick = {
                        busy = true
                        scope.launch {
                            runCatching {
                                com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.sendEmailVerification(
                                    com.google.firebase.auth.ActionCodeSettings.newBuilder()
                                        .setUrl("https://nivadesk.app/login")
                                        .build()
                                )?.await()
                            }
                            busy = false
                            statusText = sentText
                        }
                    },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth().height(46.dp),
                    shape = RoundedCornerShape(12.dp)
                ) { Text(t("Resend email"), fontWeight = FontWeight.SemiBold) }
                TextButton(onClick = onSignOut) { Text(t("Sign Out")) }
            }
        }
    }
}

// True while an email/password account is unverified but still inside the pre-gate
// grace window (before the hard gate at day 3). Drives the reminder banner below.
fun firebaseUserInEmailVerificationGracePeriod(): Boolean {
    val user = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser ?: return false
    if (user.isEmailVerified) return false
    if (user.providerData.none { it.providerId == "password" }) return false
    val createdMs = user.metadata?.creationTimestamp ?: return false
    return System.currentTimeMillis() - createdMs <= 3L * 86400000L
}

// Thin reminder shown at the top of the app during the grace window (days 0-3)
// so a newly signed-up user is nudged to verify before the hard gate. Mirrors
// iOS: the X never fully hides it — it collapses to a one-line strip that
// expands back on tap. Collapsed state is stored per uid so it never bleeds
// into a different account on this device.
@Composable
fun EmailVerifyReminderBanner(onVerified: () -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    var busy by remember { mutableStateOf(false) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val email = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.email ?: ""
    val uid = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.uid ?: ""
    val context = androidx.compose.ui.platform.LocalContext.current
    val prefs = remember(context) {
        context.getSharedPreferences("email_verify_banner", android.content.Context.MODE_PRIVATE)
    }
    var collapsedUid by remember {
        mutableStateOf(prefs.getString("collapsedUid", "") ?: "")
    }
    val setCollapsed: (Boolean) -> Unit = { collapsed ->
        collapsedUid = if (collapsed) uid else ""
        prefs.edit().putString("collapsedUid", collapsedUid).apply()
    }

    if (uid.isNotBlank() && collapsedUid == uid) {
        Surface(color = Color(0xFFFFF7E6), contentColor = Color(0xFF7A5200), modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { setCollapsed(false) }
                    .padding(vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Text("📬", fontSize = 10.sp)
                Spacer(modifier = Modifier.width(5.dp))
                Text(t("Verify email"), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                Spacer(modifier = Modifier.width(4.dp))
                Text("⌄", fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }
        return
    }

    Surface(color = Color(0xFFFFF7E6), contentColor = Color(0xFF7A5200), modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text("📬", fontSize = 16.sp)
            Column(modifier = Modifier.weight(1f)) {
                Text(t("Verify your email to keep your account."), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                if (email.isNotBlank()) Text(email, fontSize = 11.sp)
            }
            TextButton(
                onClick = {
                    busy = true
                    scope.launch {
                        runCatching { com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.reload()?.await() }
                        busy = false
                        if (com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.isEmailVerified == true) onVerified()
                    }
                },
                enabled = !busy
            ) { Text(t("I've verified — continue"), fontWeight = FontWeight.Bold, fontSize = 12.sp) }
            TextButton(
                onClick = {
                    busy = true
                    scope.launch {
                        runCatching {
                            com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.sendEmailVerification(
                                com.google.firebase.auth.ActionCodeSettings.newBuilder().setUrl("https://nivadesk.app/login").build()
                            )?.await()
                        }
                        busy = false
                    }
                },
                enabled = !busy
            ) { Text(t("Resend email"), fontSize = 12.sp) }
            Text(
                "✕",
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .clickable { setCollapsed(true) }
                    .padding(horizontal = 6.dp, vertical = 4.dp)
            )
        }
    }
}

// One-time confirmation shown right after a successful email/password sign-up so
// the brand-new user knows a verification link was sent and why it matters.
@Composable
fun PostSignupVerifyDialog(email: String, onDismiss: () -> Unit) {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = { TextButton(onClick = onDismiss) { Text(t("OK"), fontWeight = FontWeight.Bold) } },
        title = { Text(t("Verify your email"), fontWeight = FontWeight.Bold) },
        text = {
            Text(
                t("We sent a verification link to:") + " " + email + "\n\n" +
                    t("Keep full access by verifying within a few days. Accounts with no data that stay unverified are removed after 30 days.")
            )
        }
    )
}


// Typewriter feature words — letters tick in with a tiny haptic, hold, then
// rewind-delete at 2x speed. Caret is a small rounded square like the app's
// order cards, changing colour/size per word. Mirrors iPhone and web logins.
@Composable
private fun LoginFeatureRotator() {
    val lang = uk.co.eggcraft.studioflow.language.LocalStudioLanguage.current
    val t: (String) -> String = { uk.co.eggcraft.studioflow.language.studioT(it, lang) }
    val words = listOf(
        t("Dashboard"), t("Orders"), t("Schedule"), t("Customers"), t("Files"),
        t("Tasks"), t("Tracking"), t("Notes"), t("Analytics"), t("AI Assistant"), t("Storage")
    )
    val caretColors = listOf(
        Color(0xFF61A6FA), Color(0xFF73CC8C), Color(0xFFFAB866),
        Color(0xFFED8CA6), Color(0xFFA98CF2), Color(0xFF6BC7CC)
    )
    val caretSizes = listOf(14.dp, 17.dp, 15.dp, 18.dp, 14.dp, 16.dp)

    var wordIndex by remember { mutableStateOf(0) }
    var charCount by remember { mutableStateOf(0) }
    var holding by remember { mutableStateOf(false) }
    val view = androidx.compose.ui.platform.LocalView.current

    LaunchedEffect(Unit) {
        var phase = 0 // 0 typing, 1 holding, 2 deleting, 3 pausing
        var ticks = 0
        while (true) {
            kotlinx.coroutines.delay(45)
            val word = words[wordIndex % words.size]
            when (phase) {
                0 -> if (charCount < word.length) {
                    charCount += 1
                    view.performHapticFeedback(android.view.HapticFeedbackConstants.KEYBOARD_TAP)
                } else { phase = 1; ticks = 0; holding = true }
                1 -> { ticks += 1; if (ticks >= 55) { phase = 2; holding = false } }
                2 -> if (charCount > 0) {
                    charCount = maxOf(charCount - 2, 0)
                    view.performHapticFeedback(android.view.HapticFeedbackConstants.CLOCK_TICK)
                } else { phase = 3; ticks = 0 }
                3 -> { ticks += 1; if (ticks >= 20) { phase = 0; wordIndex = (wordIndex + 1) % words.size } }
            }
        }
    }

    val word = words[wordIndex % words.size]
    val typed = word.take(charCount)
    val caretColor = caretColors[wordIndex % caretColors.size]
    val caretSize = caretSizes[wordIndex % caretSizes.size]
    val caretAlpha = if (!holding) 0.9f else 0.5f

    val caret: @Composable (Boolean) -> Unit = { hidden ->
        Box(
            modifier = Modifier
                .size(caretSize)
                .background(caretColor.copy(alpha = if (hidden) 0f else caretAlpha), RoundedCornerShape(4.dp))
        )
    }

    Row(
        modifier = Modifier.fillMaxWidth().height(38.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (typed.isEmpty()) {
            caret(false)
        } else {
            caret(true)
            Spacer(modifier = Modifier.width(5.dp))
            Text(
                typed,
                fontSize = 26.sp,
                fontWeight = FontWeight.Black,
                style = androidx.compose.ui.text.TextStyle(
                    brush = androidx.compose.ui.graphics.Brush.linearGradient(
                        listOf(Color(0xFF0A84FF), Color(0xFF8A5CF6), Color(0xFFD65BD6))
                    )
                ),
                maxLines = 1
            )
            Spacer(modifier = Modifier.width(5.dp))
            caret(false)
        }
    }
}
