import XCTest

final class SheetUITests: XCTestCase {
  private let app = XCUIApplication(bundleIdentifier: "xyz.yeongdu.yeongdumusic")

  override func setUpWithError() throws {
    continueAfterFailure = false
  }

  private var close: XCUIElement { app.buttons["설정 닫기"] }

  private func grabber() -> XCUICoordinate {
    let handle = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Sheet Grabber'")).firstMatch
    if handle.exists {
      return handle.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    }
    let frame = close.frame
    return app.coordinate(withNormalizedOffset: .zero)
      .withOffset(CGVector(dx: app.frame.midX, dy: frame.minY - 12))
  }

  private func point(_ fraction: CGFloat) -> XCUICoordinate {
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: fraction))
  }

  private func capture(_ name: String) {
    XCTContext.runActivity(named: name) { activity in
      let image = XCTAttachment(screenshot: app.screenshot())
      image.name = name
      image.lifetime = .keepAlways
      activity.add(image)
    }
  }

  private func openSettings() {
    let settings = app.buttons["설정 열기"]
    XCTAssertTrue(settings.waitForExistence(timeout: 20), app.debugDescription)
    settings.tap()
    XCTAssertTrue(close.waitForExistence(timeout: 10), app.debugDescription)
  }

  func testNativeSheetGesturesAndNavigation() throws {
    try runGestures()
  }

  func testMusicSourceAndSettingsReference() {
    app.launch()
    let source = app.buttons["음악 소스 및 가져오기 메뉴"]
    XCTAssertTrue(source.waitForExistence(timeout: 20))
    source.tap()
    let sourceClose = app.buttons["음악 소스 닫기"]
    XCTAssertTrue(sourceClose.waitForExistence(timeout: 10), app.debugDescription)
    capture("reference-source-half")
    grabber().press(forDuration: 0.15, thenDragTo: point(0.12),
                    withVelocity: XCUIGestureVelocity(rawValue: 70), thenHoldForDuration: 1)
    capture("reference-source-expanded")
    sourceClose.tap()
    openSettings()
    capture("reference-settings-half")
    close.tap()
  }

  private func runGestures() throws {
    app.launch()
    openSettings()
    capture("01-half")

    XCTContext.runActivity(named: "Slow up and hold midway for two seconds") { _ in
      grabber().press(forDuration: 0.15, thenDragTo: point(0.31),
                      withVelocity: XCUIGestureVelocity(rawValue: 70), thenHoldForDuration: 2)
    }
    capture("02-after-midpoint-hold")

    XCTContext.runActivity(named: "Slow expand to the upper detent") { _ in
      grabber().press(forDuration: 0.15, thenDragTo: point(0.12),
                      withVelocity: XCUIGestureVelocity(rawValue: 70), thenHoldForDuration: 1)
    }
    capture("03-expanded")
    let expandedY = close.frame.minY
    XCTAssertLessThan(expandedY, app.frame.height * 0.3)

    app.swipeUp(velocity: .slow)
    capture("04-expanded-list-scroll")
    XCTAssertTrue(close.exists)
    XCTAssertEqual(close.frame.minY, expandedY, accuracy: 20, "List scrolling must not collapse the sheet")
    app.swipeDown(velocity: .slow)

    let cloud = app.buttons["클라우드 연결"]
    XCTAssertTrue(cloud.waitForExistence(timeout: 5))
    cloud.tap()
    XCTAssertTrue(app.navigationBars["클라우드 연결"].waitForExistence(timeout: 5))
    app.navigationBars.buttons.firstMatch.tap()
    XCTAssertTrue(close.waitForExistence(timeout: 5))

    XCTContext.runActivity(named: "Slow down and hold midway") { _ in
      grabber().press(forDuration: 0.15, thenDragTo: point(0.31),
                      withVelocity: XCUIGestureVelocity(rawValue: 70), thenHoldForDuration: 2)
    }
    capture("05-after-down-hold")
    XCTContext.runActivity(named: "Return to lower detent") { _ in
      grabber().press(forDuration: 0.15, thenDragTo: point(0.51),
                      withVelocity: XCUIGestureVelocity(rawValue: 70), thenHoldForDuration: 1)
    }
    capture("06-lower")
    XCTAssertGreaterThan(close.frame.minY, app.frame.height * 0.35)

    grabber().press(forDuration: 0.05, thenDragTo: point(0.12),
                    withVelocity: .fast, thenHoldForDuration: 0)
    capture("07-flick-up")
    XCTAssertLessThan(close.frame.minY, app.frame.height * 0.3)
    grabber().press(forDuration: 0.05, thenDragTo: point(0.51),
                    withVelocity: .fast, thenHoldForDuration: 0)
    capture("08-flick-down")

    for cycle in 0..<3 {
      if close.exists {
        close.tap()
      }
      openSettings()
      capture("09-reopened-half-\(cycle)")
      XCTAssertGreaterThan(close.frame.minY, app.frame.height * 0.35)
    }
    close.tap()
  }
}
