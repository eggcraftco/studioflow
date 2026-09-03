package uk.co.eggcraft.studioflow.features.orders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * The day the person tapped has to be the day the project is due, in Istanbul
 * and in London alike.
 *
 * A due date that is a day out is the kind of defect nobody notices in the zone
 * they wrote the code in. So these cases run the same conversion from zones on
 * both sides of Greenwich, and from the two hours of the day when the local
 * date and the UTC date disagree — the small hours in the east, the late
 * evening in the west. A conversion that reads the picker's millis in the
 * device's own zone, or one that quietly takes a day off to compensate for
 * something downstream, fails here rather than in a workshop.
 */
class QuickCreateDatesTest {

    private val istanbul = ZoneId.of("Europe/Istanbul")        // UTC+3, always ahead of UTC
    private val london = ZoneId.of("Europe/London")            // UTC+0 / +1
    private val losAngeles = ZoneId.of("America/Los_Angeles")  // UTC-8 / -7, always behind UTC
    private val zones = listOf(istanbul, london, losAngeles)

    /** Accepting the day the picker preselects writes that same day, not the next one. */
    @Test
    fun `the day the picker offers is the day the field keeps`() {
        val today = LocalDate.of(2026, 9, 3)
        assertEquals(
            "2026-09-03",
            QuickCreateDates.isoFromPickerMillis(QuickCreateDates.pickerMillis(today))
        )
    }

    /**
     * The form starts from the person's own today, not UTC's. At half past
     * midnight in Istanbul the two are different days and UTC's would be
     * yesterday; at half past ten at night in Los Angeles they are different
     * days the other way and UTC's would be tomorrow.
     */
    @Test
    fun `today is the person's own today rather than UTC's`() {
        // 2026-09-02T22:30Z: already the 3rd in Istanbul, still the 2nd in London.
        val smallHoursInTheEast = Instant.parse("2026-09-02T22:30:00Z")
        assertEquals(
            LocalDate.of(2026, 9, 3),
            QuickCreateDates.today(Clock.fixed(smallHoursInTheEast, istanbul))
        )
        assertEquals(
            LocalDate.of(2026, 9, 2),
            QuickCreateDates.today(Clock.fixed(smallHoursInTheEast, london))
        )

        // 2026-09-04T05:30Z: still the 3rd in Los Angeles, already the 4th in UTC.
        val lateEveningInTheWest = Instant.parse("2026-09-04T05:30:00Z")
        assertEquals(
            LocalDate.of(2026, 9, 3),
            QuickCreateDates.today(Clock.fixed(lateEveningInTheWest, losAngeles))
        )
    }

    /**
     * The whole of a year, from three zones, survives the trip out to the
     * picker and back — including the summer-time boundaries, where a
     * conversion that mixes a local zone into the picker's UTC unit slips.
     */
    @Test
    fun `every day of a year round trips unchanged from every zone`() {
        for (zone in zones) {
            var day = LocalDate.of(2026, 1, 1)
            val end = LocalDate.of(2027, 1, 1)
            while (day.isBefore(end)) {
                // Standing in that zone at midday, this is the day on offer.
                val offered = QuickCreateDates.today(
                    Clock.fixed(day.atTime(12, 0).atZone(zone).toInstant(), zone)
                )
                assertEquals("today in $zone", day, offered)

                val written = QuickCreateDates.isoFromPickerMillis(QuickCreateDates.pickerMillis(offered))
                assertEquals("round trip of $day in $zone", QuickCreateDates.iso(day), written)
                assertEquals(day, QuickCreateDates.parse(written))
                day = day.plusDays(1)
            }
        }
    }

    /** What the typed field takes, and what it refuses. */
    @Test
    fun `the field reads a plain calendar day and nothing else`() {
        assertEquals(LocalDate.of(2026, 9, 30), QuickCreateDates.parse("2026-09-30"))
        assertEquals(LocalDate.of(2026, 9, 30), QuickCreateDates.parse("  2026-09-30 "))
        assertNull(QuickCreateDates.parse(""))
        assertNull(QuickCreateDates.parse("30/09/2026"))
        assertNull(QuickCreateDates.parse("2026-13-01"))
    }
}
