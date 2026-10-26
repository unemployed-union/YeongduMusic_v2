package expo.modules.yeongdudrivepicker

internal const val DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"

internal fun hasDriveFileGrant(scopes: Collection<String>): Boolean {
  // Basic account identity scopes are independent of Drive file permissions.
  val driveScopes = scopes.filter { it.startsWith("https://www.googleapis.com/auth/drive") }.toSet()
  return driveScopes == setOf(DRIVE_SCOPE)
}
