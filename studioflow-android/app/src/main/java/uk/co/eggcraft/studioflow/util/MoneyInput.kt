package uk.co.eggcraft.studioflow.util

import java.text.DecimalFormatSymbols
import java.util.Locale

/**
 * Parses an amount the way a person typed it, in either decimal convention.
 *
 * Whitespace, currency symbols and letters are ignored. When both ',' and '.'
 * occur, the LAST separator is the decimal point and the other is a grouping
 * mark. With a single kind of separator: once, followed by one or two digits
 * → decimal; once, followed by exactly three digits → grouping if that is the
 * locale's grouping separator, otherwise decimal; more than once → grouping.
 * Returns null when there is nothing numeric to parse.
 */
fun parseLocalizedAmount(raw: String, locale: Locale): Double? {
    val kept = raw.filter { it.isDigit() || it == '-' || it == ',' || it == '.' }
    if (kept.none { it.isDigit() }) return null
    val negative = kept.startsWith("-")
    val body = kept.replace("-", "")
    val hasComma = body.indexOf(',') >= 0
    val hasDot = body.indexOf('.') >= 0
    val normalized = when {
        hasComma && hasDot -> {
            if (body.lastIndexOf(',') > body.lastIndexOf('.')) {
                body.replace(".", "").replace(',', '.')
            } else {
                body.replace(",", "")
            }
        }
        hasComma || hasDot -> {
            val separator = if (hasComma) ',' else '.'
            val occurrences = body.count { it == separator }
            val tail = body.substringAfterLast(separator)
            val grouping = when {
                occurrences > 1 -> true
                tail.length in 1..2 -> false
                tail.length == 3 -> DecimalFormatSymbols.getInstance(locale).groupingSeparator == separator
                else -> false
            }
            if (grouping) body.replace(separator.toString(), "") else body.replace(separator, '.')
        }
        else -> body
    }
    val value = normalized.toDoubleOrNull() ?: return null
    if (value.isNaN() || value.isInfinite()) return null
    return if (negative) -value else value
}

/**
 * What a money text field is allowed to hold while someone types: digits, one
 * leading minus, and either separator — so a comma can be typed and read back
 * by [parseLocalizedAmount].
 */
fun cleanAmountInput(raw: String): String {
    val negative = raw.trimStart().startsWith("-")
    val body = raw.filter { it.isDigit() || it == ',' || it == '.' }
    return if (negative) "-$body" else body
}

/**
 * Amounts the server stored are canonical dot-decimal strings; read those
 * exactly, and fall back to the typed-form rules for anything else (older
 * values written straight from a text field).
 */
fun parseStoredAmount(raw: String?, locale: Locale = Locale.getDefault()): Double? {
    val text = raw?.trim().orEmpty()
    if (text.isEmpty()) return null
    return text.toDoubleOrNull() ?: parseLocalizedAmount(text, locale)
}
