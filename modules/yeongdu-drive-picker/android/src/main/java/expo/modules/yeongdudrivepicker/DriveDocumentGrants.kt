package expo.modules.yeongdudrivepicker

/** Retain read grants as a batch; failed selections must not revoke older files. */
internal fun retainDocumentGrants(
  values: List<String>,
  readGrants: () -> Set<String>,
  take: (String) -> Unit,
  release: (String) -> Unit
): List<String> {
  val previous = readGrants()
  val added = mutableListOf<String>()
  val requested = values.distinct()
  try {
    requested.forEach { value -> if (value !in previous) { take(value); added.add(value) } }
    check(readGrants().containsAll(requested)) { "선택한 파일의 읽기 권한을 유지하지 못했습니다." }
    return requested
  } catch (error: Exception) {
    added.forEach { value -> runCatching { release(value) } }
    throw error
  }
}
