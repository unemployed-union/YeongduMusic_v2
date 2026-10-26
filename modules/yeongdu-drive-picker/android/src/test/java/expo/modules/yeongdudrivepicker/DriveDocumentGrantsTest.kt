package expo.modules.yeongdudrivepicker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class DriveDocumentGrantsTest {
  @Test fun retainsReadGrantsAndDeduplicatesSelections() {
    val granted = mutableSetOf("old")
    val taken = mutableListOf<String>()
    val result = retainDocumentGrants(listOf("old", "new", "new"), { granted.toSet() },
      { taken.add(it); granted.add(it) }, { granted.remove(it) })
    assertEquals(listOf("old", "new"), result)
    assertEquals(listOf("new"), taken)
    assertEquals(setOf("old", "new"), granted)
  }

  @Test fun failedBatchOnlyReleasesNewPermissions() {
    val granted = mutableSetOf("old")
    assertThrows(SecurityException::class.java) {
      retainDocumentGrants(listOf("old", "first", "denied"), { granted.toSet() },
        { if (it == "denied") throw SecurityException(); granted.add(it) }, { granted.remove(it) })
    }
    assertEquals(setOf("old"), granted)
  }

  @Test fun refusesPermissionsThatWereNotActuallyPersisted() {
    val released = mutableListOf<String>()
    assertThrows(IllegalStateException::class.java) {
      retainDocumentGrants(listOf("new"), { setOf("old") }, {}, { released.add(it) })
    }
    assertEquals(listOf("new"), released)
  }
}
