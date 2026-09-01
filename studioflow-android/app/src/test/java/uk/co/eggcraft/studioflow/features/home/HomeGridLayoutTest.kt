package uk.co.eggcraft.studioflow.features.home

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * One ordered list, three platforms, one grid.
 *
 * These eight layouts were packed by the web's TypeScript packer and by the
 * Swift one, and the two agreed character for character; the web's was in turn
 * measured against the browser's own auto-placement and landed every card on
 * the same pixel. These are those strings. If this test fails, a member's
 * layout has started drawing differently on Android than on their Mac.
 */
class HomeGridLayoutTest {
    private fun pack(vararg sizes: String): String {
        // The packer reads only the size; distinct ids just let the grid key on them.
        val cards = sizes.mapIndexed { index, key ->
            HomeCardPlacement(
                id = HomeCardId.entries[index % HomeCardId.entries.size],
                size = HomeCardSize.entries.first { it.key == key }
            )
        }
        val packed = HomeGridLayout.pack(cards, 4)
        val slots = packed.slots.joinToString(";") { "${it.index},${it.row},${it.column},${it.width},${it.height}" }
        val holes = packed.holes.joinToString(";") { "${it.row},${it.column},${it.width},${it.index}" }
        return "S[$slots]H[$holes]"
    }

    @Test
    fun matchesTheWebAndSwiftPackers() {
        assertEquals(
            "S[0,0,0,2,1;1,0,2,1,1;2,0,3,1,1;3,1,0,1,1;4,1,1,1,1;5,1,2,1,1;6,1,3,1,1;7,2,0,2,1;8,2,2,2,1;9,3,0,2,1;10,3,2,2,1]H[]",
            pack("2x1", "1x1", "1x1", "1x1", "1x1", "1x1", "1x1", "2x1", "2x1", "2x1", "2x1")
        )
        assertEquals("S[0,0,0,1,1;1,0,1,2,1;2,1,0,2,1]H[0,3,1,2]", pack("1x1", "2x1", "2x1"))
        // The hole survives a later small card: sparse, so where you dropped a
        // card is where it stays.
        assertEquals("S[0,0,0,1,1;1,0,1,2,1;2,1,0,2,1;3,1,2,1,1]H[0,3,1,2]", pack("1x1", "2x1", "2x1", "1x1"))
        assertEquals("S[0,0,0,2,2;1,0,2,1,1;2,1,2,2,1;3,2,0,1,1]H[0,3,1,2]", pack("2x2", "1x1", "2x1", "1x1"))
        assertEquals("S[0,0,0,2,1;1,0,2,2,2;2,1,0,1,1;3,1,1,1,1;4,2,0,2,1]H[]", pack("2x1", "2x2", "1x1", "1x1", "2x1"))
        assertEquals(
            "S[0,0,0,1,1;1,0,1,1,1;2,0,2,2,2;3,1,0,2,1;4,2,0,1,1;5,2,1,1,1;6,2,2,2,1]H[]",
            pack("1x1", "1x1", "2x2", "2x1", "1x1", "1x1", "2x1")
        )
        assertEquals("S[0,0,0,2,2;1,0,2,2,2;2,2,0,1,1]H[]", pack("2x2", "2x2", "1x1"))
        assertEquals(
            "S[0,0,0,1,1;1,0,1,1,1;2,0,2,1,1;3,1,0,2,2;4,1,2,2,1;5,2,2,1,1]H[0,3,1,3]",
            pack("1x1", "1x1", "1x1", "2x2", "2x1", "1x1")
        )
    }

    /** The empty space at the end of the last row is where the list stops, not a gap in it. */
    @Test
    fun trailingSpaceIsNotAHole() {
        assertEquals("S[0,0,0,1,1]H[]", pack("1x1"))
        assertEquals("S[0,0,0,2,1;1,0,2,1,1]H[]", pack("2x1", "1x1"))
    }
}
