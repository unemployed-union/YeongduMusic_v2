import ExpoModulesCore
import AuthenticationServices
import CryptoKit
import Security
import UIKit

private final class PickerPresentation: NSObject, ASWebAuthenticationPresentationContextProviding {
  let window: UIWindow
  init(_ window: UIWindow) { self.window = window; super.init() }
  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { window }
}

public class YeongduDrivePickerModule: Module {
  private var session: ASWebAuthenticationSession?
  private var pending: Promise?
  private var exchange: URLSessionDataTask?
  private var anchor: PickerPresentation?
  private let scope = "https://www.googleapis.com/auth/drive.file"

  private func hasDriveFileGrant(_ scopes: [String]) -> Bool {
    let driveScopes = scopes.filter { $0.hasPrefix("https://www.googleapis.com/auth/drive") }
    return Set(driveScopes) == Set([scope])
  }

  public func definition() -> ModuleDefinition {
    Name("YeongduDrivePicker")
    AsyncFunction("pick") { (email: String, clientId: String, promise: Promise) in
      self.pick(email: email, clientId: clientId, promise: promise)
    }.runOnQueue(.main)
    OnDestroy {
      self.session?.cancel()
      self.exchange?.cancel()
      self.pending?.resolve(nil)
      self.pending = nil
    }
  }
  private func fail(_ message: String) {
    pending?.reject("DRIVE_PICKER_FAILED", message)
    pending = nil; session = nil; exchange = nil; anchor = nil
  }
  private func base64url(_ data: Data) -> String {
    data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
  }
  private func pick(email: String, clientId: String, promise: Promise) {
    guard pending == nil else { promise.reject("DRIVE_IN_PROGRESS", "Google 인증 창을 먼저 닫아 주세요."); return }
    guard clientId.hasSuffix(".apps.googleusercontent.com"),
      let window = appContext?.utilities?.currentViewController()?.view.window else {
      promise.reject("DRIVE_PICKER_SETUP", "Google iOS OAuth 클라이언트와 새 네이티브 빌드를 확인해 주세요."); return
    }
    var random = [UInt8](repeating: 0, count: 64)
    guard SecRandomCopyBytes(kSecRandomDefault, random.count, &random) == errSecSuccess else {
      promise.reject("DRIVE_RANDOM_FAILED", "Google 인증 요청을 준비하지 못했습니다."); return
    }
    let verifier = base64url(Data(random)), state = UUID().uuidString
    let challenge = base64url(Data(SHA256.hash(data: Data(verifier.utf8))))
    let scheme = "com.googleusercontent.apps." + clientId.replacingOccurrences(of: ".apps.googleusercontent.com", with: "")
    let redirect = scheme + ":/oauthredirect"
    var url = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
    url.queryItems = [
      URLQueryItem(name: "client_id", value: clientId), URLQueryItem(name: "redirect_uri", value: redirect),
      URLQueryItem(name: "response_type", value: "code"), URLQueryItem(name: "scope", value: scope),
      URLQueryItem(name: "state", value: state), URLQueryItem(name: "code_challenge", value: challenge), URLQueryItem(name: "code_challenge_method", value: "S256"),
      URLQueryItem(name: "prompt", value: "consent"), URLQueryItem(name: "include_granted_scopes", value: "false"),
      URLQueryItem(name: "trigger_onepick", value: "true"), URLQueryItem(name: "allow_multiple", value: "true"),
      URLQueryItem(name: "login_hint", value: email),
      URLQueryItem(name: "mimetypes", value: "audio/mpeg,audio/mp4,audio/flac,audio/x-flac,audio/wav,audio/x-wav,audio/aac,audio/ogg,audio/opus,audio/aiff,audio/x-aiff,application/ogg,application/octet-stream")
    ]
    pending = promise; anchor = PickerPresentation(window)
    let auth = ASWebAuthenticationSession(url: url.url!, callbackURLScheme: scheme) { [weak self] callback, error in
      DispatchQueue.main.async {
        guard let self, self.pending != nil else { return }
        if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
          self.pending?.resolve(nil); self.pending = nil; self.session = nil; self.anchor = nil; return
        }
        guard error == nil, let callback, let parts = URLComponents(url: callback, resolvingAgainstBaseURL: false) else { self.fail("Google 파일 선택을 완료하지 못했습니다."); return }
        let items = parts.queryItems ?? []
        func parameter(_ name: String) -> String? { let matches = items.filter { $0.name == name }; return matches.count == 1 ? matches[0].value : nil }
        guard callback.scheme == scheme, callback.path == "/oauthredirect", parameter("state") == state else { self.fail("Google 인증 응답을 확인할 수 없습니다."); return }
        guard parameter("error") == nil, let code = parameter("code"), !code.isEmpty else { self.fail("Google 파일 접근 승인이 취소되었습니다."); return }
        let ids = (parameter("picked_file_ids") ?? "").split(separator: ",").map(String.init)
        self.exchangeCode(code, verifier: verifier, redirect: redirect, clientId: clientId, ids: ids)
      }
    }
    auth.presentationContextProvider = anchor
    session = auth
    if !auth.start() { fail("Google 파일 선택 화면을 열지 못했습니다.") }
  }
  private func exchangeCode(_ code: String, verifier: String, redirect: String, clientId: String, ids: [String]) {
    var body = URLComponents()
    body.queryItems = [URLQueryItem(name: "code", value: code), URLQueryItem(name: "code_verifier", value: verifier),
      URLQueryItem(name: "redirect_uri", value: redirect), URLQueryItem(name: "client_id", value: clientId), URLQueryItem(name: "grant_type", value: "authorization_code")]
    var request = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
    request.httpMethod = "POST"; request.timeoutInterval = 30
    request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
    request.httpBody = Data((body.percentEncodedQuery ?? "").replacingOccurrences(of: "+", with: "%2B").utf8)
    exchange = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
      DispatchQueue.main.async {
        guard let self, self.pending != nil else { return }
        guard error == nil, (response as? HTTPURLResponse)?.statusCode == 200, let data,
          let result = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let token = result["access_token"] as? String, !token.isEmpty,
          let granted = result["scope"] as? String, self.hasDriveFileGrant(granted.split(separator: " ").map(String.init)) else {
          self.fail("Google 파일 접근 토큰을 발급받지 못했습니다. 다시 선택해 주세요."); return
        }
        self.pending?.resolve(["accessToken": token, "fileIds": ids, "scopes": granted.split(separator: " ").map(String.init)])
        self.pending = nil; self.session = nil; self.exchange = nil; self.anchor = nil
      }
    }
    exchange?.resume()
  }
}
