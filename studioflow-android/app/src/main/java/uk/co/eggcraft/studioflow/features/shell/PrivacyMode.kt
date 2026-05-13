package uk.co.eggcraft.studioflow.features.shell

import androidx.compose.runtime.compositionLocalOf

val LocalHideSensitiveNumbers = compositionLocalOf { false }

fun privateCurrencyText(currency: String): String {
    return currency.ifBlank { "£" } + "••••"
}
