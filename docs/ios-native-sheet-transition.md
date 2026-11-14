# 설정 시트의 시스템 전환 노출

2026-11-15 · `experiment/ios-settings-truesheet4`

설정 목록의 **스크롤 콘텐츠 배경만 숨겨 시스템 sheet의 재질 전환이 보이도록 했다.** 시트 효과, 기본 Section/Row 재질, 내비게이션과 메뉴는 유지했다. 실제 iPhone의 수정 앱에서 사용자가 **“전환과 기존 동작 모두 정상”**이라고 확인했다. Apple 지도의 내부 구현이나 동일한 애니메이션 곡선을 재현했다고 주장하지 않는다.

## 공식 동작과 기존 구현의 차이

[WWDC25 323, 6:20 이후](https://developer.apple.com/videos/play/wwdc2025/323/)는 부분 높이 sheet의 Liquid Glass가 전체 높이로 확장될 때 불투명해지는 시스템 전환을 설명한다. 커스텀 presentation background를 제거하라는 안내는 [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)에도 있다. [UISheetPresentationController](https://developer.apple.com/documentation/uikit/uisheetpresentationcontroller)는 detent와 presentation을 관리한다. 확인한 공개 문서에는 시스템 내부 재질 전환의 임계점·지속 시간·opacity를 직접 지정하는 설정이 없다.

이전에 보였던 85%/78%·200ms 전환은 앱이 직접 작성한 `UIViewPropertyAnimator`였다. 시스템 재질을 복원하면서 해당 driver를 제거했으므로 그 애니메이션은 사라졌다. 그러나 **커스텀 driver 제거만으로 현재의 표시 문제를 모두 설명할 수는 없었다.** 시스템 sheet와 기본 List의 backing이 합성되는 경로도 비교해야 했다.

현재 설정은 Router/RNScreens의 UIKit formSheet → 중첩 Native Stack → Expo Host → SwiftUI insetGrouped List → Section/Row다. 음악 소스는 기존 SwiftUI BottomSheet/NavigationStack 경로다. 설치된 RNScreens는 숫자 `[0.5, 1]`을 custom detent로 생성하지만, 아래 C 비교에서도 시스템 재질 전환이 관찰되어 이를 원인으로 단정하거나 의존성을 패치하지 않았다.

## 실제 드래그 비교

[재현기](../scripts/ios-native-sheet-probe/README.md)는 앱 외부의 별도 Simulator 프로젝트다. 모든 모드에서 sheet effect 대체, tint, opacity, 커스텀 Material을 사용하지 않았다.

| 비교 | 한정한 차이 | 관찰 및 결정 |
| --- | --- | --- |
| A | 순정 SwiftUI sheet, medium/large, NavigationStack/List | Simulator에서 재질 변화 관찰. 사용자는 iPhone에서 원하는 전환이 없다고 확인 |
| B | UIKit system medium/large + 같은 SwiftUI 콘텐츠 | A와 같은 실기기 피드백 |
| C / D | RNScreens 숫자 resolver / system large 혼합 | Simulator에서 전환 관찰. 숫자 detent가 원인이라는 가설을 채택하지 않음 |
| E | UIKit UINavigationController + 기본 List | F의 대조군 |
| F | **E에서 List의 scrollContentBackground만 hidden** | 사용자가 iPhone에서 “볼만한 애니메이션” 확인. 실제 설정에 같은 최소 변경 적용 후 정상 확인 |
| G | B에서 largestUndimmedDetentIdentifier만 large | 사용자는 개선 없음. 실제 앱에 적용하지 않음 |

실기기의 Apple 지도에서는 원하는 전환이 보인다는 사용자 확인도 받았다. 따라서 A/B의 결과만으로 지도와 기본 sheet가 같은 동작이라고 판단하지 않았다. 실제 앱의 전역 애니메이션은 켜져 있고 window/presenter layer speed는 1이었다. Reduce Motion, Reduce Transparency, Cross-fade, Increase Contrast도 꺼져 있었다. [진단값](verification/native-sheet-transition/device-metadata.json)은 계정·기기 식별자를 포함하지 않는다.

동적 증거는 실제 Simulator 녹화를 잘라 압축한 영상이다. 애니메이션을 합성하지 않았다.

- [순정 SwiftUI A](verification/native-sheet-transition/a-swiftui-system.mp4)
- [순정 UIKit B](verification/native-sheet-transition/b-uikit-system.mp4)
- [List backing만 숨긴 F](verification/native-sheet-transition/f-native-list-backing-hidden.mp4)
- [Apple 지도 참조](verification/native-sheet-transition/maps-reference.mp4)
- [최종 실제 앱의 라이트 드래그](verification/native-sheet-transition/final-app-light-drag.mp4)
- [최종 실제 앱의 다크 드래그](verification/native-sheet-transition/final-app-dark-drag.mp4)

지도 원본 녹화의 처음 두 제스처는 위치 권한 팝업에 가려졌다. 이를 검증 성공으로 계산하지 않았다. 첨부 참조 영상은 팝업이 사라진 뒤 실제 확장·축소가 보이는 구간이다. 테스트 통과와 시각 검증을 구분했다.

## 최소 수정과 원인 범위

`src/features/settings/settings-ui.ios.tsx`에 공식 Expo SDK 58 modifier인 `scrollContentBackground('hidden')`을 추가했다. `systemAppearance` 화면에만 적용하며 기존 강제 다크 옵션은 유지한다. 이 API는 **스크롤 컨테이너 배경의 표시 여부**를 바꾼다. [Apple API](https://developer.apple.com/documentation/swiftui/view/scrollcontentbackground(_:)), [Expo 58 modifier](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/modifiers/).

현재 구성에서는 List의 자동 backing이 남아 있으면 sheet 자체의 재질 변화와 목록 표면 변화가 겹쳐 원하는 전환을 보기 어려웠다. F의 한 변수 비교와 실제 앱 확인을 근거로 그 backing만 제거했다. 내부 UIKit의 비공개 재질 클래스나 지도 구현을 추정해 원인으로 제시하지 않는다.

기본 Section/Row의 배경은 수정하지 않았다. `listRowBackground`, systemThinMaterial, 별도 Glass/Blur, tint, rgba, 불투명 덮개를 넣지 않았고 콘텐츠 opacity도 변경하지 않았다. 시트 효과 자체를 비우는 `UIVisualEffect()`는 복원하지 않았다. 헤더의 scroll-edge 효과와 sheet 전체 재질 전환도 별개로 유지했다.

선택한 방식은 **시스템 기본 전환**이다. Reanimated나 매 프레임 React 상태, detent 완료 후 fade를 추가하지 않았다. 임계점·타이밍과 접근성 효과는 OS가 관리한다. 기존 `[0.5, 1]`, grabber, 모서리, 스크롤 확장, Liquid Glass 버튼, 닫기/뒤로는 변경하지 않았다.

`scripts/check-native-settings.cjs`는 기존 액션·편집·내비게이션 검사를 유지하면서 List backing에 대한 이전 단정을 갱신했다. 음악 소스 파일, 설정 presentation/navigator, Android와 저장/인증/재생 코드는 수정하지 않았다. 보호 파일의 해시는 [최종 결과](verification/native-sheet-transition/results.json)에 있다.

## 검증과 한계

- 실기기: iPhone 16 Pro / **iOS 27.2.1**, SDK 27.2로 빌드·서명·설치. 사용자 직접 조작으로 최종 후보의 전환, 그룹 재질, 뒤로/닫기 정상 확인. 원격 영상으로 정밀한 타이밍을 측정한 검증은 아님.
- Simulator: iPhone 18 Pro / **iOS 27.0**. A–G 라이트 7개, A/B 다크 2개 XCTest 통과. 느린 위/아래 드래그, 중간 hold, 별도 반대 제스처, flick과 닫기를 실제 터치로 실행했다. 한 번의 터치 안에서 방향을 바꾸는 자동화는 하지 않았다.
- 비교 모듈을 제거한 최종 앱의 iPhone/Simulator Release 빌드 통과. iPhone 서명 검사·설치·실행 완료. 동일한 설정 소스의 후보를 사용자가 직접 확인했으며, 정리 후 바이너리를 사용자가 다시 드래그한 별도 확인은 받지 않았다.
- 최종 실제 앱의 라이트 2개/다크 2개 XCTest 통과. 느린 확장·축소와 hold, 내부 목록 스크롤, 클라우드 연결 진입/뒤로, flick, 닫기·3회 재열기, 음악 소스 참조를 검사했다. 두 테마의 실제 드래그 녹화와 캡처도 확인했다.
- [라이트 축소](verification/native-sheet-transition/light-06-lower.png) · [라이트 확장](verification/native-sheet-transition/light-03-expanded.png) · [다크 축소](verification/native-sheet-transition/dark-06-lower.png) · [다크 확장](verification/native-sheet-transition/dark-03-expanded.png)
- lint, 타입 검사, 기존 소스 회귀 검사 3종, diff 검사와 보호 파일 해시 검사 통과. 세부 결과는 [results.json](verification/native-sheet-transition/results.json)에 있다. 소스 회귀 검사의 native/network/storage 경계는 mock이며 실제 화면 검증의 대체물이 아니다.
- QA Simulator는 실제 계정과 앨범이 없는 환경이다. 화면에 기존 연결/설정 읽기 오류가 표시되며, 실제 NAS·Keychain 성공을 검증한 결과로 사용하지 않았다.
- iOS 26 런타임, iPad/회전, VoiceOver, 실제 Reduce Motion/Transparency 토글, NAS 로그인·저장·재생 성공은 이번 검증에 포함하지 않았다. 설치된 Simulator 런타임은 27.0/27.1이다.
- 지도와 같은 방향의 네이티브 재질 변화는 확인했지만, 지도의 정확한 전환 높이·곡선·기간과 동일하다고 보장하지 않는다. 공개 API로 그 내부 값을 지정하지 않았다.

## 보존과 정리

이번 수정 전 파일은 [before](verification/native-sheet-transition/before/README.md)에 SHA-256과 함께 보존했다. `.source` 접미사를 제거해 원래 경로에 복사하면 이 최소 수정을 복구할 수 있다. 이전 커스텀 driver 전체는 [기존 복구 압축](verification/system-sheet-restore/rollback/before-system-restore.tar.gz)에 남아 있다. 자동 커밋이나 기존 변경 초기화는 하지 않았다.

실기기 비교에만 사용한 임시 Expo 모듈은 [압축 보존본](verification/native-sheet-transition/physical-qa-module.tar.gz)으로 옮기고 앱의 `modules/` 및 CocoaPods 연결에서 제거했다. 실행 앱에는 비교 메뉴나 진단 배경을 남기지 않는다. 별도 Simulator 재현기는 앱에 연결되지 않는 검증 도구다. 클라우드 업로드·배포·제출은 하지 않았다.
