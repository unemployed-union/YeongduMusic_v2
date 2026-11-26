import XCTest

final class SearchUITests: XCTestCase {
  private let app = XCUIApplication(bundleIdentifier: "xyz.yeongdu.yeongdumusic")

  override func setUpWithError() throws {
    continueAfterFailure = false
  }

  private func capture(_ name: String) {
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }

  func testSearchKeyboardClearCancelAndSettings() {
    app.launch()
    let libraryTab = app.buttons["native-tab-library"]
    XCTAssertTrue(libraryTab.waitForExistence(timeout: 20), app.debugDescription)
    libraryTab.tap()
    let libraryHeader = app.navigationBars["보관함"]
    XCTAssertTrue(libraryHeader.waitForExistence(timeout: 10), app.debugDescription)
    XCTAssertTrue(libraryHeader.buttons["설정 열기"].exists)
    capture("00-library")

    let playlistsTab = app.buttons["native-tab-playlists"]
    XCTAssertTrue(playlistsTab.waitForExistence(timeout: 5))
    playlistsTab.tap()
    let playlistsHeader = app.navigationBars["플레이리스트"]
    XCTAssertTrue(playlistsHeader.waitForExistence(timeout: 10), app.debugDescription)
    XCTAssertTrue(playlistsHeader.buttons["설정 열기"].exists)
    capture("00b-playlists")

    let searchTab = app.buttons["native-tab-search"]
    XCTAssertTrue(searchTab.waitForExistence(timeout: 20), app.debugDescription)
    searchTab.tap()

    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 10), app.debugDescription)
    XCTAssertEqual(app.searchFields.count, 1)
    let prompt = app.staticTexts.matching(identifier: "듣고 싶은 음악을 찾아보세요.").firstMatch
    XCTAssertTrue(prompt.waitForExistence(timeout: 5))
    XCTAssertGreaterThan(prompt.frame.minY, field.frame.maxY)
    capture("01-search-idle")

    let initialFieldY = field.frame.minY
    let initialPromptY = prompt.frame.minY
    app.swipeUp(velocity: .slow)
    XCTAssertEqual(field.frame.minY, initialFieldY, accuracy: 1)
    XCTAssertEqual(prompt.frame.minY, initialPromptY, accuracy: 1)
    capture("01b-search-idle-after-swipe")

    field.tap()
    field.typeText("Yeongdu music")
    XCTAssertEqual(field.value as? String, "Yeongdu music")
    XCTAssertTrue(app.keyboards.firstMatch.exists)
    XCTAssertLessThan(field.frame.minY, initialFieldY, "Editing reclaims the title space")
    capture("02-search-keyboard")

    let clear = field.buttons.matching(NSPredicate(
      format: "label CONTAINS[c] 'clear' OR label CONTAINS '지우기' OR label CONTAINS '삭제'"
    )).firstMatch
    XCTAssertTrue(clear.waitForExistence(timeout: 5), app.debugDescription)
    clear.tap()
    XCTAssertTrue(prompt.waitForExistence(timeout: 5))
    XCTAssertTrue(app.keyboards.firstMatch.exists)
    capture("03-search-cleared")

    field.typeText("Yeongdu\n")
    let keyboardDismissed = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "exists == false"), object: app.keyboards.firstMatch
    )
    XCTAssertEqual(XCTWaiter.wait(for: [keyboardDismissed], timeout: 5), .completed)
    XCTAssertEqual(field.value as? String, "Yeongdu")
    capture("04-search-submitted")
    let empty = app.staticTexts.matching(identifier: "“Yeongdu”에 대한 검색 결과가 없습니다.").firstMatch
    XCTAssertTrue(empty.waitForExistence(timeout: 5))
    let emptyY = empty.frame.minY
    app.swipeUp(velocity: .slow)
    XCTAssertEqual(empty.frame.minY, emptyY, accuracy: 1)

    field.tap()
    let cancel = app.buttons.matching(NSPredicate(
      format: "label == '취소' OR label == 'Cancel' OR label == 'Close' OR label == '닫기'"
    )).firstMatch
    XCTAssertTrue(cancel.waitForExistence(timeout: 5), app.debugDescription)
    cancel.tap()
    XCTAssertTrue(prompt.waitForExistence(timeout: 5))
    capture("05-search-cancelled")

    let settings = app.buttons["설정 열기"]
    XCTAssertTrue(settings.waitForExistence(timeout: 5))
    settings.tap()
    let close = app.buttons["설정 닫기"]
    XCTAssertTrue(close.waitForExistence(timeout: 5), app.debugDescription)
    close.tap()
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    capture("06-return-from-settings")
  }
}
