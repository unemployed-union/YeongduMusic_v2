package expo.modules.yeongdudrivepicker

import android.accounts.Account
import android.app.Activity
import android.content.Intent
import android.net.Uri
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val AUDIO_MIMES = "audio/mpeg,audio/mp4,audio/flac,audio/x-flac,audio/wav,audio/x-wav,audio/aac,audio/ogg,audio/opus,audio/aiff,audio/x-aiff,application/ogg,application/octet-stream"

class YeongduDrivePickerModule : Module() {
  private var pending: Promise? = null
  private var requestCode = 63000

  override fun definition() = ModuleDefinition {
    Name("YeongduDrivePicker")

    AsyncFunction("pick") { email: String, _: String, promise: Promise -> authorize(email, true, promise) }
    AsyncFunction("token") { email: String, promise: Promise -> authorize(email, false, promise) }

    // OPEN_DOCUMENT grants come from the system picker, independently of OAuth.
    AsyncFunction("documentPermissions") {
      val resolver = requireNotNull(appContext.reactContext).contentResolver
      resolver.persistedUriPermissions.filter { it.isReadPermission && isDriveDocument(it.uri) }.map { it.uri.toString() }
    }
    AsyncFunction("persistDocuments") { values: List<String> ->
      val resolver = requireNotNull(appContext.reactContext).contentResolver
      try {
        require(values.size <= 10000 && values.all { isDriveDocument(Uri.parse(it)) })
        retainDocumentGrants(values,
          readGrants = { resolver.persistedUriPermissions.filter { it.isReadPermission }.map { it.uri.toString() }.toSet() },
          take = { resolver.takePersistableUriPermission(Uri.parse(it), Intent.FLAG_GRANT_READ_URI_PERMISSION) },
          release = { resolver.releasePersistableUriPermission(Uri.parse(it), Intent.FLAG_GRANT_READ_URI_PERMISSION) }
        )
      } catch (error: Exception) {
        throw IllegalStateException("Google Drive 파일의 읽기 권한을 유지하지 못했습니다. 파일 앱에서 다시 선택해 주세요.")
      }
    }
    AsyncFunction("releaseDocuments") { values: List<String> ->
      val resolver = requireNotNull(appContext.reactContext).contentResolver
      val granted = resolver.persistedUriPermissions.filter { it.isReadPermission }.map { it.uri }.toSet()
      values.distinct().forEach { value ->
        val uri = Uri.parse(value)
        require(isDriveDocument(uri))
        if (uri in granted) resolver.releasePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
    }

    OnActivityResult { activity, result ->
      if (result.requestCode != requestCode) return@OnActivityResult
      val promise = pending ?: return@OnActivityResult
      if (result.resultCode != Activity.RESULT_OK || result.data == null) {
        pending = null
        promise.resolve(null)
      } else {
        try { finish(Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(result.data), promise) }
        catch (_: Exception) { fail(promise, "Google 파일 선택 결과를 확인하지 못했습니다. 다시 선택해 주세요.") }
      }
    }
    OnActivityDestroys {
      pending?.reject("DRIVE_ACTIVITY_CLOSED", "Google 인증 화면이 종료되었습니다. 다시 시도해 주세요.", null)
      pending = null
    }
  }

  private fun isDriveDocument(uri: Uri): Boolean = uri.scheme == "content" &&
    uri.authority in setOf("com.google.android.apps.docs.storage", "com.google.android.apps.docs.storage.legacy") &&
    uri.path?.startsWith("/document/") == true && uri.path != "/document/" && uri.fragment == null

  private fun authorize(email: String, picker: Boolean, promise: Promise) {
    val activity = appContext.currentActivity
    if (activity == null) { promise.reject("DRIVE_NO_ACTIVITY", "Google 인증 화면을 열 수 없습니다.", null); return }
    activity.runOnUiThread {
      if (pending != null) { promise.reject("DRIVE_IN_PROGRESS", "Google 인증 창을 먼저 닫아 주세요.", null); return@runOnUiThread }
      pending = promise
      requestCode = 63000 + (requestCode - 62999) % 1000
      val builder = AuthorizationRequest.builder()
        .setAccount(Account(email, "com.google"))
        .setRequestedScopes(listOf(Scope(DRIVE_SCOPE)))
        .setOptOutIncludingGrantedScopes(true)
      if (picker) {
        builder.setPrompt(AuthorizationRequest.Prompt.CONSENT)
          .addResourceParameter(AuthorizationRequest.ResourceParameter.PICKER_OAUTH_TRIGGER, "true")
          .addResourceParameter(AuthorizationRequest.ResourceParameter.PICKER_ALLOW_MULTIPLE, "true")
          .addResourceParameter(AuthorizationRequest.ResourceParameter.PICKER_MIMETYPES, AUDIO_MIMES)
      }
      Identity.getAuthorizationClient(activity).authorize(builder.build())
        .addOnSuccessListener { result ->
          if (pending !== promise) return@addOnSuccessListener
          if (result.hasResolution()) {
            if (!picker) { fail(promise, "Google 파일 접근 권한을 다시 승인해 주세요. 설정에서 다시 연결해 주세요."); return@addOnSuccessListener }
            try {
              val intent = result.pendingIntent ?: throw IllegalStateException()
              activity.startIntentSenderForResult(intent.intentSender, requestCode, null, 0, 0, 0)
            } catch (_: Exception) { fail(promise, "Google 음악 파일 선택 화면을 열지 못했습니다.") }
          } else finish(result, promise)
        }
        .addOnFailureListener { fail(promise, "Google 파일 접근을 승인하지 못했습니다. Google Play 서비스와 연결 설정을 확인해 주세요.") }
    }
  }

  private fun finish(result: AuthorizationResult, promise: Promise) {
    if (pending !== promise) return
    val token = result.accessToken
    if (token.isNullOrBlank()) {
      fail(promise, "Google Drive 접근 토큰을 발급받지 못했습니다. 다시 연결해 주세요.")
      return
    }
    if (!hasDriveFileGrant(result.grantedScopes)) {
      fail(promise, "Google Drive의 선택한 파일 권한을 확인할 수 없습니다. 다시 연결해 주세요.")
      return
    }
    pending = null
    val ids = result.tokenResponseParams?.getString("picked_file_ids").orEmpty()
      .split(',').map { it.trim() }.filter { it.isNotEmpty() }.distinct()
    promise.resolve(mapOf("accessToken" to token, "fileIds" to ids, "scopes" to result.grantedScopes))
  }
  private fun fail(promise: Promise, message: String) {
    if (pending !== promise) return
    pending = null
    promise.reject("DRIVE_AUTHORIZATION_FAILED", message, null)
  }
}
