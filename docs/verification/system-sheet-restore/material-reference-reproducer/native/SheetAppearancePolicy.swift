import Foundation

/// Ratios are relative to the resolved maximum content height, not the detent interval.
enum SheetAppearancePolicy {
  static let expandHeightRatio: CGFloat = 0.85
  static let collapseHeightRatio: CGFloat = 0.78
  static let animationDuration: TimeInterval = 0.2

  static func wantsOpaque(current: Bool, heightRatio: CGFloat, reduceTransparency: Bool) -> Bool {
    if reduceTransparency {
      return true
    }
    guard heightRatio.isFinite else {
      return current
    }
    if current {
      return heightRatio >= collapseHeightRatio
    }
    return heightRatio >= expandHeightRatio
  }
}
