import UIKit
import SwiftUI

/// Weakly keyed by the actual controller, so separate sheet presentations never share state.
final class SettingsSheetSurfaces {
  private static let states = NSMapTable<UISheetPresentationController, SettingsSheetSurfaces>(
    keyOptions: .weakMemory, valueOptions: .strongMemory
  )

  static func forSheet(_ sheet: UISheetPresentationController) -> SettingsSheetSurfaces {
    if let state = states.object(forKey: sheet) {
      return state
    }
    let state = SettingsSheetSurfaces()
    states.setObject(state, forKey: sheet)
    return state
  }

  private let surfaces = NSHashTable<UIView>.weakObjects()
  private var animator: UIViewPropertyAnimator?
  private(set) var isOpaque = false

  func register(_ surface: UIView) {
    guard !surfaces.contains(surface) else {
      return
    }
    let visibleAlpha = surfaces.allObjects.first.map { view in
      CGFloat(view.layer.presentation()?.opacity ?? Float(view.alpha))
    } ?? (isOpaque ? 1 : 0)
    surfaces.add(surface)
    surface.alpha = visibleAlpha
    if let animator, animator.state == .active {
      let target: CGFloat = isOpaque ? 1 : 0
      animator.addAnimations { [weak surface] in
        surface?.alpha = target
      }
    } else {
      surface.alpha = isOpaque ? 1 : 0
    }
  }

  func unregister(_ surface: UIView) {
    surfaces.remove(surface)
    if surfaces.allObjects.isEmpty {
      animator?.stopAnimation(true)
      animator = nil
      isOpaque = false
    }
  }

  func setOpaque(_ opaque: Bool, animated: Bool) {
    guard isOpaque != opaque || (!animated && animator?.state == .active) else {
      return
    }
    // Finish at the currently displayed values before reversing; never jump to an endpoint.
    if let animator, animator.state == .active {
      animator.stopAnimation(false)
      animator.finishAnimation(at: .current)
    }
    animator = nil
    isOpaque = opaque
    let layers = surfaces.allObjects
    let target: CGFloat = opaque ? 1 : 0
    guard animated else {
      UIView.performWithoutAnimation {
        for layer in layers {
          layer.alpha = target
        }
      }
      return
    }
    let animation = UIViewPropertyAnimator(duration: SheetAppearancePolicy.animationDuration, curve: .easeInOut) {
      for layer in layers {
        layer.alpha = target
      }
    }
    animator = animation
    animation.addCompletion { [weak self, weak animation] _ in
      if self?.animator === animation {
        self?.animator = nil
      }
    }
    #if targetEnvironment(simulator)
    if ProcessInfo.processInfo.environment["YEONGDU_SHEET_QA_CONTRAST"] == "1" {
      animation.addCompletion { position in
        NSLog("[SheetThresholdQA] finished position=%ld target=%@", position.rawValue,
              opaque ? "opaque" : "translucent")
      }
    }
    #endif
    animation.startAnimation()
    #if targetEnvironment(simulator)
    if ProcessInfo.processInfo.environment["YEONGDU_SHEET_QA_CONTRAST"] == "1" {
      NSLog("[SheetThresholdQA] opaque=%@ duration=%.3f surfaces=%ld", opaque ? "true" : "false",
            SheetAppearancePolicy.animationDuration, layers.count)
    }
    #endif
  }

  #if targetEnvironment(simulator)
  private(set) var probingReversal = false
  private var didProbeReversal = false

  /// A renderer probe, explicitly separate from actual sheet gestures. No device build code.
  func probeReversalIfRequested(on surface: UIView) {
    guard !didProbeReversal,
      ProcessInfo.processInfo.environment["YEONGDU_SHEET_QA_REVERSAL"] == "1" else {
      return
    }
    didProbeReversal = true
    probingReversal = true
    setOpaque(true, animated: true)
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) { [weak self, weak surface] in
      guard let self, let surface else {
        return
      }
      let before = surface.layer.presentation()?.opacity
      self.setOpaque(false, animated: true)
      let after = surface.layer.presentation()?.opacity
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.025) { [weak surface] in
        NSLog("[SheetReversalQA] nextFrame=%.4f", surface?.layer.presentation()?.opacity ?? -1)
      }
      NSLog("[SheetReversalQA] before=%.4f after=%.4f available=%@",
            before ?? -1, after ?? -1, before != nil && after != nil ? "true" : "false")
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self, weak surface] in
        NSLog("[SheetReversalQA] settled=%.4f", surface?.alpha ?? -1)
        self?.probingReversal = false
      }
    }
  }
  #endif
}

/// Uses only public responder/controller APIs, never SwiftUI's private UIKit hierarchy.
func enclosingSettingsSheet(from start: UIResponder?) -> UISheetPresentationController? {
  var responder = start
  while let current = responder {
    if let controller = current as? UIViewController {
      var ancestor: UIViewController? = controller
      while let candidate = ancestor {
        if let sheet = candidate.presentationController as? UISheetPresentationController,
          sheet.containerView != nil, sheet.presentedViewController === candidate {
          return sheet
        }
        ancestor = candidate.parent
      }
    }
    responder = current.next
  }
  return nil
}

/// The modifier replaces the List's *background slot*, leaving row content and clipping intact.
struct SettingsGroupBackgroundModifier: ViewModifier {
  func body(content: Content) -> some View {
    content.listRowBackground(SettingsGroupMaterial())
  }
}

private struct SettingsGroupMaterial: UIViewRepresentable {
  func makeUIView(context: Context) -> SettingsGroupMaterialView {
    SettingsGroupMaterialView()
  }

  func updateUIView(_ view: SettingsGroupMaterialView, context: Context) {
    view.setColorScheme(context.environment.colorScheme == .dark ? .dark : .light)
  }
}

private final class SettingsGroupMaterialView: UIView {
  private let material = UIVisualEffectView(effect: UIBlurEffect(style: .systemThinMaterial))
  private let opaqueSurface = UIView()
  private var surfaces: SettingsSheetSurfaces?

  init() {
    super.init(frame: .zero)
    isUserInteractionEnabled = false
    isAccessibilityElement = false
    backgroundColor = .clear
    opaqueSurface.backgroundColor = .secondarySystemGroupedBackground
    opaqueSurface.alpha = 0
    for background in [material, opaqueSurface] {
      background.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      addSubview(background)
    }
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func setColorScheme(_ scheme: UIUserInterfaceStyle) {
    overrideUserInterfaceStyle = scheme
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    material.frame = bounds
    opaqueSurface.frame = bounds
    attach()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      surfaces?.unregister(opaqueSurface)
      surfaces = nil
    } else {
      attach()
      DispatchQueue.main.async { [weak self] in
        self?.attach()
      }
    }
  }

  private func attach() {
    guard window != nil, surfaces == nil,
      let sheet = enclosingSettingsSheet(from: next) else {
      return
    }
    let state = SettingsSheetSurfaces.forSheet(sheet)
    surfaces = state
    state.register(opaqueSurface)
  }
}

/// The sheet owns clipping/corners. Only this background view contains Glass, never content.
final class SettingsSheetGlassBackdrop: UIView {
  let opaqueSurface = UIView()
  private let glass = UIVisualEffectView()
  private var installed = false

  init() {
    super.init(frame: .zero)
    backgroundColor = .clear
    isUserInteractionEnabled = false
    isAccessibilityElement = false
    opaqueSurface.backgroundColor = .systemGroupedBackground
    opaqueSurface.alpha = 0
    addSubview(glass)
    addSubview(opaqueSurface)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    glass.frame = bounds
    opaqueSurface.frame = bounds
    // Like Expo GlassView, create the effect during a visible layout pass.
    if #available(iOS 26.0, *), window != nil, !installed {
      var ancestor: UIView? = self
      var visibleAlpha: CGFloat = 1
      while let view = ancestor {
        if view.isHidden {
          return
        }
        visibleAlpha *= view.alpha
        ancestor = view.superview
      }
      guard visibleAlpha > 0.02 else {
        return
      }
      let effect = UIGlassEffect(style: .regular)
      effect.isInteractive = false
      glass.effect = effect
      installed = true
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      glass.effect = UIVisualEffect()
      installed = false
    } else {
      setNeedsLayout()
    }
  }

  /// Retrying visible layout does not animate or update React.
  func prepareVisibleMaterial() {
    if !installed {
      setNeedsLayout()
    }
  }
}
