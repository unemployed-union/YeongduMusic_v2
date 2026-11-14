import SwiftUI
import UIKit

@main
final class ProbeApp: UIResponder, UIApplicationDelegate {
  func application(_ application: UIApplication, configurationForConnecting session: UISceneSession,
                   options: UIScene.ConnectionOptions) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(name: "Sheet probe", sessionRole: session.role)
    configuration.delegateClass = ProbeScene.self
    return configuration
  }
}

final class ProbeScene: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
             options: UIScene.ConnectionOptions) {
    guard let scene = scene as? UIWindowScene else {
      return
    }
    let window = UIWindow(windowScene: scene)
    window.rootViewController = ProbePresenter()
    window.makeKeyAndVisible()
    self.window = window
  }
}

final class ProbePresenter: UIHostingController<ProbeRoot> {
  init() {
    super.init(rootView: ProbeRoot())
    view.backgroundColor = .clear
    rootView.presentUIKit = { [weak self] mode in
      self?.presentSheet(mode)
    }
  }

  @MainActor required dynamic init?(coder: NSCoder) {
    fatalError("Storyboard initialization is not used")
  }

  private func presentSheet(_ mode: String) {
    let host: UIViewController
    if mode.hasPrefix("E ") || mode.hasPrefix("F ") {
      let listHost = UIHostingController(rootView: ProbeRows(hideScrollBackground: mode.hasPrefix("F ")))
      listHost.view.backgroundColor = .clear
      listHost.title = "Native sheet"
      let navigation = UINavigationController(rootViewController: listHost)
      navigation.view.backgroundColor = .clear
      listHost.navigationItem.leftBarButtonItem = UIBarButtonItem(systemItem: .close,
        primaryAction: UIAction { [weak navigation] _ in
          navigation?.dismiss(animated: true)
        })
      listHost.navigationItem.leftBarButtonItem?.accessibilityLabel = "Close probe"
      host = navigation
    } else {
      let contentHost = UIHostingController(rootView: ProbeContent())
      contentHost.view.backgroundColor = .clear
      host = contentHost
    }
    host.modalPresentationStyle = .formSheet
    guard let sheet = host.sheetPresentationController else {
      return
    }
    if mode == "B UIKit system" || mode.hasPrefix("E ") || mode.hasPrefix("F ") || mode.hasPrefix("G ") {
      sheet.detents = [.medium(), .large()]
    } else if mode == "C UIKit numeric" {
      // Exact resolver and identifier convention used by installed RNScreens.
      sheet.detents = [0.5, 1.0].enumerated().map { index, fraction in
        .custom(identifier: .init(String(index))) { context in
          min(context.maximumDetentValue, context.maximumDetentValue * fraction)
        }
      }
    } else {
      sheet.detents = [
        .custom(identifier: .init("0")) { context in
          context.maximumDetentValue * 0.5
        },
        .large(),
      ]
    }
    if mode == "G UIKit undimmed" {
      sheet.largestUndimmedDetentIdentifier = .large
    }
    sheet.prefersGrabberVisible = true
    sheet.prefersScrollingExpandsWhenScrolledToEdge = true
    // No effect, background, opacity, material, corner or trait override.
    present(host, animated: true)
  }
}

struct ProbeRoot: View {
  @State private var presented = false
  var presentUIKit: (String) -> Void = { _ in }

  var body: some View {
    ZStack(alignment: .top) {
      // Diagnostic underlay only; not an application appearance implementation.
      HStack(spacing: 0) {
        Color(uiColor: .systemRed)
        Color(uiColor: .systemBlue)
        Color(uiColor: .systemTeal)
        Color(uiColor: .systemYellow)
      }
      .ignoresSafeArea()
      VStack(spacing: 16) {
        Button("A SwiftUI system") {
          presented = true
        }
        ForEach(["B UIKit system", "C UIKit numeric", "D UIKit system large", "E Native nav auto", "F Native nav hidden", "G UIKit undimmed"], id: \.self) { mode in
          Button(mode) {
            presentUIKit(mode)
          }
        }
      }
      .padding()
      .buttonStyle(.borderedProminent)
    }
    .sheet(isPresented: $presented) {
      ProbeContent()
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
  }
}

struct ProbeContent: View {
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      ProbeRows()
      .navigationTitle("Native sheet")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          if #available(iOS 26.0, *) {
            Button(role: .close) {
              dismiss()
            }
            .accessibilityLabel("Close probe")
          } else {
            Button("Close probe") {
              dismiss()
            }
          }
        }
      }
    }
  }
}

struct ProbeRows: View {
  var hideScrollBackground = false

  var body: some View {
    List {
        Section("Connections") {
          ForEach(0..<3) { index in
            Button("Connection \(index)") {}
          }
        }
        Section("Preferences") {
          ForEach(0..<8) { index in
            Button("Preference \(index)") {}
          }
        }
      }
      .listStyle(.insetGrouped)
    .scrollContentBackground(hideScrollBackground ? .hidden : .automatic)
  }
}
