package expo.modules.yeongdudrivepicker

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DriveScopesTest {
  private val identityScopes = listOf(
    "openid", "email", "profile",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile"
  )

  @Test fun acceptsFileGrantAlongsideSignInScopes() {
    assertTrue(hasDriveFileGrant(listOf(DRIVE_SCOPE)))
    assertTrue(hasDriveFileGrant(identityScopes + DRIVE_SCOPE))
    assertTrue(hasDriveFileGrant(listOf(DRIVE_SCOPE, DRIVE_SCOPE)))
  }

  @Test fun rejectsMissingFileGrant() {
    assertFalse(hasDriveFileGrant(emptyList()))
    assertFalse(hasDriveFileGrant(identityScopes))
  }

  @Test fun rejectsAdditionalDriveGrants() {
    val fullDrive = "https://www.googleapis.com/auth/drive"
    assertFalse(hasDriveFileGrant(listOf(fullDrive)))
    assertFalse(hasDriveFileGrant(identityScopes + listOf(DRIVE_SCOPE, fullDrive)))
    assertFalse(hasDriveFileGrant(listOf(DRIVE_SCOPE, "https://www.googleapis.com/auth/drive.metadata")))
  }
}
