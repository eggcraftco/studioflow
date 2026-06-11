package uk.co.eggcraft.studioflow.features.auth

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
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
    onGoogleSignIn: () -> Unit
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
                        .height(78.dp),
                    alignment = Alignment.CenterStart,
                    contentScale = ContentScale.Fit
                )
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
                TextButton(
                    onClick = {
                        isLoginMode = !isLoginMode
                        localError = ""
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


// Official-style multicolour Google "G" mark drawn natively.
@Composable
private fun GoogleGLogo(logoSize: androidx.compose.ui.unit.Dp = 18.dp) {
    androidx.compose.foundation.Canvas(modifier = Modifier.size(logoSize)) {
        val stroke = this.size.minDimension * 0.22f
        val inset = stroke / 2
        val arcSize = androidx.compose.ui.geometry.Size(this.size.width - stroke, this.size.height - stroke)
        val topLeft = androidx.compose.ui.geometry.Offset(inset, inset)
        val style = androidx.compose.ui.graphics.drawscope.Stroke(width = stroke)
        val blue = androidx.compose.ui.graphics.Color(0xFF4285F4)
        drawArc(blue, startAngle = -45f, sweepAngle = 90f, useCenter = false, topLeft = topLeft, size = arcSize, style = style)
        drawArc(androidx.compose.ui.graphics.Color(0xFF34A853), startAngle = 45f, sweepAngle = 90f, useCenter = false, topLeft = topLeft, size = arcSize, style = style)
        drawArc(androidx.compose.ui.graphics.Color(0xFFFBBC05), startAngle = 135f, sweepAngle = 90f, useCenter = false, topLeft = topLeft, size = arcSize, style = style)
        drawArc(androidx.compose.ui.graphics.Color(0xFFEA4335), startAngle = 225f, sweepAngle = 90f, useCenter = false, topLeft = topLeft, size = arcSize, style = style)
        // Horizontal blue bar into the centre (the G's crossbar).
        drawRect(
            color = blue,
            topLeft = androidx.compose.ui.geometry.Offset(this.size.width / 2f, this.size.height / 2f - stroke / 2f),
            size = androidx.compose.ui.geometry.Size(this.size.width / 2f, stroke)
        )
    }
}


// --- Email verification gate -------------------------------------------------

fun firebaseUserNeedsEmailVerification(): Boolean {
    val user = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser ?: return false
    if (user.isEmailVerified) return false
    return user.providerData.any { it.providerId == "password" }
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
                                com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.sendEmailVerification()?.await()
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
