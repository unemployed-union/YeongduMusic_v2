import SwiftUI
import UIKit

// Isolated diagnostic app. No YeongduMusic production source is modified.
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(_ application: UIApplication,
                   configurationForConnecting session: UISceneSession,
                   options: UIScene.ConnectionOptions) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(name: "Probe", sessionRole: session.role)
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?
  func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
             options connectionOptions: UIScene.ConnectionOptions) {
    guard let scene = scene as? UIWindowScene else { return }
    let window = UIWindow(windowScene: scene)
    window.rootViewController = Presenter()
    window.makeKeyAndVisible()
    self.window = window
  }
}

final class Presenter: UIHostingController<ProbeRoot> {
  init() {
    super.init(rootView: ProbeRoot())
    rootView.presentUIKit = { [weak self] mode in self?.showUIKit(mode) }
    view.backgroundColor = .clear
  }
  @MainActor required dynamic init?(coder: NSCoder) { fatalError() }

  private func showUIKit(_ mode: String) {
    let embedded = mode != "UIKit SwiftUI navigation"
    let content = ProbeList(hideBackground: mode == "UIKit custom hidden list")
    let host = UIHostingController(rootView: content)
    host.view.backgroundColor = .clear
    let controller: UIViewController
    if embedded {
      host.title = "Material probe"
      let navigation = UINavigationController(rootViewController: host)
      navigation.view.backgroundColor = .clear
      host.navigationItem.leftBarButtonItem = UIBarButtonItem(
        systemItem: .close, primaryAction: UIAction { [weak navigation] _ in
          navigation?.dismiss(animated: true)
        })
      controller = navigation
    } else {
      let navigationHost = UIHostingController(rootView: ProbeNavigation())
      navigationHost.view.backgroundColor = .clear
      controller = navigationHost
    }
    controller.modalPresentationStyle = .formSheet
    let sheet = controller.sheetPresentationController!
    sheet.detents = [.medium(), .large()]
    sheet.prefersGrabberVisible = true
    if mode.hasPrefix("UIKit custom") || mode == "UIKit empty sheet background" {
      // The same public backgroundEffect suppression used by the current driver.
      let empty = UIVisualEffect()
      sheet.backgroundEffect = empty
      for detent in sheet.detents { detent.backgroundEffect = empty }
      if mode.hasPrefix("UIKit custom") {
      let backdrop = SettingsSheetGlassBackdrop()
      backdrop.frame = controller.view.bounds
      backdrop.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      controller.view.insertSubview(backdrop, at: 0)
      }
    }
    if mode == "UIKit explicit native Glass" {
      let glass = UIGlassEffect(style: .regular)
      sheet.backgroundEffect = glass
      for detent in sheet.detents { detent.backgroundEffect = glass }
    }
    present(controller, animated: true)
  }
}

struct ProbeRoot: View {
  @State private var shown = false
  var presentUIKit: (String) -> Void = { _ in }
  var body: some View {
    ZStack(alignment: .top) {
      // The exact same underlay is used for every probe, not a proposed UI fix.
      HStack(spacing: 0) {
        Color(uiColor: .systemRed)
        Color(uiColor: .systemBlue)
        Color(uiColor: .systemTeal)
        Color(uiColor: .systemYellow)
      }.ignoresSafeArea()
      VStack(spacing: 16) {
        Button("SwiftUI sheet") { shown = true }
        ForEach(["UIKit SwiftUI navigation", "UIKit native navigation", "UIKit custom sheet background", "UIKit custom hidden list", "UIKit empty sheet background", "UIKit explicit native Glass"], id: \.self) { mode in
          Button(mode) { presentUIKit(mode) }
        }
      }.padding().buttonStyle(.borderedProminent)
    }
    .sheet(isPresented: $shown) {
      ProbeNavigation()
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
  }
}

struct ProbeNavigation: View {
  @Environment(\.dismiss) private var dismiss
  var body: some View {
    NavigationStack {
      ProbeList()
        .navigationTitle("Material probe")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(role: .close) { dismiss() }
          }
        }
    }
  }
}

struct ProbeList: View {
  var hideBackground = false
  @Environment(\.backgroundMaterial) private var backgroundMaterial
  var body: some View {
    List {
      Section("First group") {
        ForEach(0..<3) { index in Button("Connection \(index)") {} }
      }
      Section("Second group") {
        ForEach(0..<3) { index in Button("Setting \(index)") {} }
      }
    }
    .listStyle(.insetGrouped)
    .scrollContentBackground(hideBackground ? .hidden : .automatic)
    .background(Diagnostics())
    // No background/style/row material override, exactly as MusicSourceMenuContent.
    .onAppear { print("MaterialProbe backgroundMaterial=\(String(describing: backgroundMaterial))") }
  }
}

struct Diagnostics: UIViewRepresentable {
  func makeUIView(context: Context) -> UIView {
    let anchor = UIView()
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak anchor] in
      guard let anchor else { return }
      var next: UIResponder? = anchor
      var host: UIViewController?
      while let current = next {
        if let controller = current as? UIViewController { host = controller; break }
        next = current.next
      }
      var controller = host
      var sheet: UISheetPresentationController?
      while let candidate = controller {
        if let candidateSheet = candidate.presentationController as? UISheetPresentationController,
          candidateSheet.containerView != nil, candidateSheet.presentedViewController === candidate {
          sheet = candidateSheet
          break
        }
        controller = candidate.parent
      }
      func describe(_ value: Any?) -> String { value.map { String(describing: $0) } ?? "nil" }
      var views: [[String: String]] = []
      func visit(_ view: UIView) {
        if view is UIScrollView || view is UICollectionViewCell || view is UIVisualEffectView {
          var row = ["class": String(describing: type(of: view)),
                     "backgroundColor": describe(view.backgroundColor?.resolvedColor(with: view.traitCollection)),
                     "alpha": String(describing: view.alpha)]
          if let effect = view as? UIVisualEffectView { row["effect"] = describe(effect.effect) }
          if let cell = view as? UICollectionViewCell { row["cellBackground"] = describe(cell.backgroundConfiguration)
            row["cellResolvedColor"] = describe(cell.backgroundConfiguration?.backgroundColor?.resolvedColor(with: cell.traitCollection))
            row["cellVisualEffect"] = describe(cell.backgroundConfiguration?.visualEffect)
            row["resolvedBackgroundColor"] = describe(cell.backgroundConfiguration?.resolvedBackgroundColor(for: cell.tintColor))
            row["hasColorTransformer"] = String(describing: cell.backgroundConfiguration?.backgroundColorTransformer != nil) }
          views.append(row)
        }
        for child in view.subviews { visit(child) }
      }
      if let view = sheet?.presentedViewController.view { visit(view) }
      let mode = ProcessInfo.processInfo.environment["PROBE_MODE"] ?? "unknown"
      let report: [String: Any] = [
        "mode": mode,
        "backgroundEffect": describe(sheet?.backgroundEffect),
        "detentEffects": sheet?.detents.map { describe($0.backgroundEffect) } ?? [],
        "hostTraits": describe(host?.traitCollection),
        "sheetTraits": describe(sheet?.traitCollection),
        "views": views
      ]
      let data = try! JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
      let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      try! data.write(to: directory.appendingPathComponent(mode + ".json"))
    }
    return anchor
  }
  func updateUIView(_ view: UIView, context: Context) {}
}
