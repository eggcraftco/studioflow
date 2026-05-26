package uk.co.eggcraft.studioflow.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import android.app.Activity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val LightScheme: ColorScheme = lightColorScheme(
    primary = StudioBlue,
    secondary = StudioWarningOrange,
    tertiary = StudioGreen,
    error = StudioRed,
    background = StudioLightBackground,
    surface = StudioLightSurface,
    onPrimary = Color.White,
    onSecondary = Color.White,
    onTertiary = Color.White,
    onError = Color.White,
    onBackground = StudioLightText,
    onSurface = StudioLightText,
    surfaceVariant = StudioLightField,
    onSurfaceVariant = StudioLightMuted
)

private val DarkScheme: ColorScheme = darkColorScheme(
    primary = StudioBlue,
    secondary = StudioWarningOrange,
    tertiary = StudioGreen,
    error = StudioRed,
    background = StudioDarkBackground,
    surface = StudioDarkSurface,
    onPrimary = Color.White,
    onSecondary = Color.White,
    onTertiary = Color.White,
    onError = Color.White,
    onBackground = StudioDarkText,
    onSurface = StudioDarkText,
    surfaceVariant = StudioDarkField,
    onSurfaceVariant = StudioDarkMuted
)

/**
 * Resolves the user's `appTheme` preference ("System" | "Light" | "Dark")
 * into an actual Boolean for Material3.
 */
@Composable
fun resolveAppDarkMode(appTheme: String?): Boolean {
    return when (appTheme?.trim()) {
        "Light" -> false
        "Dark" -> true
        else -> isSystemInDarkTheme()
    }
}

@Composable
fun StudioFlowTheme(
    appTheme: String? = null,
    content: @Composable () -> Unit
) {
    val dark = resolveAppDarkMode(appTheme)
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window ?: return@SideEffect
            val controller = WindowCompat.getInsetsController(window, view)
            controller.isAppearanceLightStatusBars = !dark
            controller.isAppearanceLightNavigationBars = !dark
        }
    }
    MaterialTheme(
        colorScheme = if (dark) DarkScheme else LightScheme,
        typography = StudioTypography,
        content = content
    )
}
