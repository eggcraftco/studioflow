package uk.co.eggcraft.studioflow.features.orders

import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/**
 * The one place the Quick Create due date crosses between a calendar day and a
 * number, kept out of the composable so it can be held to account by a test.
 *
 * A due date is a *day*, not a moment: the day the person tapped is the day the
 * project is due, whether they tapped it in Istanbul or in London. Two rules
 * keep that true, and they are not interchangeable.
 *
 * The day the form starts from is the person's own today, read in the device's
 * zone — [today]. A jeweller in Istanbul opening the form at half past midnight
 * is on the 3rd; UTC is still on the 2nd, and offering them the 2nd would be
 * offering yesterday.
 *
 * The number Material 3's date picker exchanges is, by its own contract,
 * midnight UTC of the selected day. So [pickerMillis] and [isoFromPickerMillis]
 * both speak UTC — not because the due date is a UTC instant, but because that
 * is the picker's unit. Reading those millis back in the device's zone is the
 * classic way this goes wrong: west of Greenwich it lands on the previous day.
 * The pair is an exact round trip, and the day out is always the day in — which
 * is what the test asserts, from three zones at once.
 *
 * Nothing here nudges the day by one to compensate for anything downstream. If
 * a due date arrives back a day late, the arithmetic that moved it is the day
 * count the order is stored as, not this conversion.
 */
object QuickCreateDates {

    private val ISO_DATE: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE

    /** The typed field, or null when it is not a date yet. */
    fun parse(text: String): LocalDate? =
        runCatching { LocalDate.parse(text.trim(), ISO_DATE) }.getOrNull()

    /**
     * The person's own today, in the zone their device is keeping. The clock is
     * a parameter only so a test can stand at half past midnight in Istanbul,
     * which is the moment where a UTC "today" would offer yesterday.
     */
    fun today(clock: Clock = Clock.systemDefaultZone()): LocalDate = LocalDate.now(clock)

    /** A calendar day in the picker's unit: midnight UTC of that day. */
    fun pickerMillis(date: LocalDate): Long =
        date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

    /** The day the picker handed back, written the way the field reads it. */
    fun isoFromPickerMillis(millis: Long): String =
        Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().format(ISO_DATE)

    /** The way a day is written into the field and sent to the server. */
    fun iso(date: LocalDate): String = date.format(ISO_DATE)
}
