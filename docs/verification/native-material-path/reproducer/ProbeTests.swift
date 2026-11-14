import XCTest
final class ProbeTests: XCTestCase {
  func testAllPresentations() {
    continueAfterFailure = false
    let app = XCUIApplication(bundleIdentifier: "xyz.yeongdu.material-probe")
    for mode in ["SwiftUI sheet", "UIKit SwiftUI navigation", "UIKit native navigation", "UIKit custom sheet background", "UIKit custom hidden list", "UIKit empty sheet background", "UIKit explicit native Glass"] {
      app.launchEnvironment["PROBE_MODE"] = mode
      app.launch()
      XCTAssertTrue(app.buttons[mode].waitForExistence(timeout: 5))
      app.buttons[mode].tap()
      XCTAssertTrue(app.buttons["Connection 0"].waitForExistence(timeout: 5))
      // Wait for presentation rendering, never used as a material animation input.
      Thread.sleep(forTimeInterval: 3)
      let attachment = XCTAttachment(screenshot: app.screenshot())
      attachment.name = mode
      attachment.lifetime = .keepAlways
      add(attachment)
      app.terminate()
    }
  }
}
