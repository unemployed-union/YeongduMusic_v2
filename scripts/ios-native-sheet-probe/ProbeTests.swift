import XCTest

final class ProbeTests: XCTestCase {
  private let app = XCUIApplication(bundleIdentifier: "xyz.yeongdu.native-sheet-probe")

  override func setUpWithError() throws {
    continueAfterFailure = false
  }

  func testASwiftUI() {
    exercise("A SwiftUI system")
  }
  func testBUIKit() {
    exercise("B UIKit system")
  }
  func testCNumeric() {
    exercise("C UIKit numeric")
  }
  func testDSystemLarge() {
    exercise("D UIKit system large")
  }

  func testENativeNav() {
    exercise("E Native nav auto")
  }
  func testFNativeNavHidden() {
    exercise("F Native nav hidden")
  }

  func testGUndimmed() {
    exercise("G UIKit undimmed")
  }

  func testMapsReference() throws {
    let maps = XCUIApplication(bundleIdentifier: "com.apple.Maps")
    maps.launch()
    for label in ["Continue", "계속", "Start Using Maps", "지도 사용 시작", "지금 안 함", "Not Now"] {
      if maps.buttons[label].waitForExistence(timeout: 2) {
        maps.buttons[label].tap()
      }
    }
    print(maps.debugDescription)
    let initial = XCTAttachment(screenshot: maps.screenshot())
    initial.name = "Maps initial"
    initial.lifetime = .keepAlways
    add(initial)
    let grabber = maps.buttons["Card grabber"]
    guard grabber.exists else {
      throw XCTSkip("No accessible Maps sheet grabber; screenshot is reference only")
    }
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    for fraction in [0.12, 0.70, 0.12, 0.70] {
      for label in ["Don’t Allow", "Don't Allow", "허용 안 함"] {
        if springboard.alerts.buttons[label].exists {
          springboard.alerts.buttons[label].tap()
        }
      }
      grabber.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        .press(forDuration: 0.15,
               thenDragTo: maps.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: fraction)),
               withVelocity: XCUIGestureVelocity(rawValue: 95), thenHoldForDuration: 1)
    }
  }

  private func capture(_ name: String) {
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }

  private func point(_ fraction: CGFloat) -> XCUICoordinate {
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: fraction))
  }

  private func handle() -> XCUICoordinate {
    let grabber = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Sheet Grabber'")).firstMatch
    if grabber.exists {
      return grabber.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    }
    let close = app.buttons["Close probe"].frame
    return app.coordinate(withNormalizedOffset: .zero)
      .withOffset(CGVector(dx: app.frame.midX, dy: close.minY - 12))
  }

  private func drag(to fraction: CGFloat, name: String, velocity: CGFloat = 95) {
    XCTContext.runActivity(named: name) { _ in
      handle().press(forDuration: 0.15, thenDragTo: point(fraction),
                     withVelocity: XCUIGestureVelocity(rawValue: velocity), thenHoldForDuration: 1)
    }
    capture(name)
  }

  private func exercise(_ mode: String) {
    app.launch()
    XCTAssertTrue(app.buttons[mode].waitForExistence(timeout: 10))
    app.buttons[mode].tap()
    XCTAssertTrue(app.buttons["Close probe"].waitForExistence(timeout: 10))
    capture(mode + " half")
    drag(to: 0.10, name: mode + " slow up")
    XCTAssertLessThan(app.buttons["Close probe"].frame.minY, app.frame.height * 0.3)
    drag(to: 0.51, name: mode + " slow down")
    XCTAssertGreaterThan(app.buttons["Close probe"].frame.minY, app.frame.height * 0.35)
    drag(to: 0.28, name: mode + " partial up")
    drag(to: 0.51, name: mode + " reverse next gesture")
    drag(to: 0.10, name: mode + " flick up", velocity: 1500)
    drag(to: 0.51, name: mode + " flick down", velocity: 1500)
    app.buttons["Close probe"].tap()
  }
}
