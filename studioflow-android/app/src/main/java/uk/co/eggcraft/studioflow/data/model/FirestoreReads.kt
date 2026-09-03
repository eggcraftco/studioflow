package uk.co.eggcraft.studioflow.data.model

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentSnapshot
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.util.Date
import kotlin.math.abs

// Tolerant field readers. DocumentSnapshot.getString/getLong/getDate throw when a
// field holds an unexpected type, and one odd document written by another client
// must never take the whole list (or the app) down with it.

/** Epoch millis from a Timestamp, Date, number (millis, or seconds when small), numeric string, ISO-8601 string or a {seconds,nanoseconds} map. */
fun timestampMsFromAny(value: Any?): Long? = when (value) {
    null -> null
    is Timestamp -> value.toDate().time
    is Date -> value.time
    is Number -> normalizeEpochMs(value.toDouble())
    is String -> {
        val text = value.trim()
        if (text.isEmpty()) null else text.toDoubleOrNull()?.let { normalizeEpochMs(it) } ?: parseIsoDateMs(text)
    }
    is Map<*, *> -> {
        val seconds = (value["seconds"] ?: value["_seconds"]) as? Number
        val nanos = ((value["nanoseconds"] ?: value["_nanoseconds"]) as? Number)?.toLong() ?: 0L
        seconds?.let { it.toLong() * 1000L + nanos / 1_000_000L }
    }
    else -> null
}

// Below 10^11 the number is far too small to be milliseconds (that would be
// 1973), so it is read as seconds.
private fun normalizeEpochMs(value: Double): Long? {
    if (value.isNaN() || value.isInfinite()) return null
    return if (abs(value) < 1e11) (value * 1000.0).toLong() else value.toLong()
}

private fun parseIsoDateMs(text: String): Long? {
    runCatching { return OffsetDateTime.parse(text).toInstant().toEpochMilli() }
    runCatching { return Instant.parse(text).toEpochMilli() }
    runCatching { return LocalDateTime.parse(text).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli() }
    runCatching { return LocalDate.parse(text).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli() }
    return null
}

fun longFromAny(value: Any?): Long? = when (value) {
    is Number -> value.toLong()
    is String -> value.trim().let { it.toLongOrNull() ?: it.toDoubleOrNull()?.toLong() }
    is Boolean -> if (value) 1L else 0L
    else -> null
}

fun doubleFromAny(value: Any?): Double? = when (value) {
    is Number -> value.toDouble().takeUnless { it.isNaN() || it.isInfinite() }
    is String -> value.trim().replace(",", "").toDoubleOrNull()
    is Boolean -> if (value) 1.0 else 0.0
    else -> null
}

fun stringFromAny(value: Any?): String? = when (value) {
    null -> null
    is String -> value
    is Number, is Boolean -> value.toString()
    else -> null
}

fun booleanFromAny(value: Any?): Boolean? = when (value) {
    is Boolean -> value
    is Number -> value.toDouble() != 0.0
    is String -> when (value.trim().lowercase()) {
        "true", "yes", "1" -> true
        "false", "no", "0", "" -> false
        else -> null
    }
    else -> null
}

private fun DocumentSnapshot.rawField(field: String): Any? = runCatching { get(field) }.getOrNull()

fun DocumentSnapshot.readTimestampMs(field: String): Long? = timestampMsFromAny(rawField(field))
fun DocumentSnapshot.readDate(field: String): Date? = readTimestampMs(field)?.let { Date(it) }
fun DocumentSnapshot.readLong(field: String): Long? = longFromAny(rawField(field))
fun DocumentSnapshot.readDouble(field: String): Double? = doubleFromAny(rawField(field))
fun DocumentSnapshot.readString(field: String): String? = stringFromAny(rawField(field))
fun DocumentSnapshot.readBoolean(field: String): Boolean? = booleanFromAny(rawField(field))
