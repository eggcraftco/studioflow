package uk.co.eggcraft.studioflow.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

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

@Composable
fun StudioFlowTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkScheme else LightScheme,
        typography = StudioTypography,
        content = content
    )
}
