# Native sheet comparison

This standalone SwiftUI/UIKit probe does not replace any YeongduMusic UI.
Generate its Xcode project outside the repository, then build for the selected
Simulator before recording. `create-project.rb` copies the Swift sources, so run
it again after editing them.

```sh
ruby scripts/ios-native-sheet-probe/create-project.rb
xcodebuild -project /tmp/yeongdu-native-sheet-probe/Probe.xcodeproj \
  -scheme NativeSheetProbe -destination 'platform=iOS Simulator,id=SIMULATOR_UUID' \
  -derivedDataPath /tmp/yeongdu-native-sheet-probe/build \
  build-for-testing CODE_SIGNING_ALLOWED=NO
scripts/ios-native-sheet-probe/run-recorded-tests.sh SIMULATOR_UUID UNIQUE_LABEL testFNativeNavHidden
```

Use a dedicated QA Simulator. The recording includes app launch and XCTest
preparation; inspect the actual gesture segment, not just final screenshots.
The four colored bands are diagnostic content behind the system sheet.

| Mode | Difference |
| --- | --- |
| A | SwiftUI sheet, medium/large, NavigationStack, default insetGrouped List |
| B | UIKit system medium/large, hosted NavigationStack, same List |
| C | B with numeric custom detents matching installed RNScreens |
| D | B with custom half detent and system large detent |
| E | B with UINavigationController and a bare hosted List |
| F | E with only `scrollContentBackground(.hidden)` |
| G | B with only `largestUndimmedDetentIdentifier = .large` |

Tests exercise slow up/down with holds, partial movement, a subsequent opposite
gesture, flicks, and dismissal. They do not synthesize a direction reversal
within one continuous held touch. Assertions check sheet position; they do not
prove visual material quality or timing.

`testMapsReference` uses the public accessibility tree to drag Apple Maps.
Inspect permission alerts in its recording: successful XCTest event dispatch
alone does not prove the sheet moved. Earlier reference recordings with blocked
gestures are explicitly excluded from animation verification in the report.

The temporary physical-device diagnostic module is archived in
`docs/verification/native-sheet-transition/physical-qa-module.tar.gz`; it is not
autolinked into the application. Prior app-written background animation remains
in the earlier restoration rollback archive.
