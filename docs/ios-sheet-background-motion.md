# 설정 시트의 드래그 연동 배경 전환

> **현재 구현:** [시스템 기본 시트 복원](ios-system-sheet-restoration.md)을 적용했다. 아래 커스텀 driver 설명은 과거 실험 기록이며 현재 실행 코드에서는 제거했다.


> 이전 연속 보간 구현의 기록이다. 현재 코드는 [후속 임계점 기반 전환](ios-sheet-threshold-transition.md)으로 변경했다.

2026-11-14 · `experiment/ios-settings-truesheet4` · 기준 `0d22d49`

기존 Expo Router `formSheet`를 유지하고, 공개 UIKit API를 사용하는 로컬 Expo 모듈로 **실제로 표시 중인 시트 높이**에 배경 opacity를 연결했다. 별도 시트 라이브러리, JS 프레임 이벤트, detent 도착 후 fade는 사용하지 않는다. 아래 결과는 Simulator 검증이며 실기기 확인을 뜻하지 않는다.

## 원인과 레이어 분석

설치 버전: Expo 58.0.23, Router 58.0.30, React Native 0.88.1, react-native-screens 4.30.1, Reanimated 4.7.1, Worklets 0.13.0, Expo UI 58.0.27.

| 영역 | 확인한 구조와 판단 |
| --- | --- |
| 바깥 Stack | 설정만 `formSheet`, `[0.5, 1]`, grabber와 `sheetExpandsWhenScrolledToEdge` 사용. 기존 설정 그대로 유지. |
| Router / ThemeProvider | 설치된 NativeStackView에는 부모 formSheet에서 `nativeContainerStyle`을 생략하는 처리가 이미 있다. 과거 Router 이슈를 원인으로 가정하지 않았다. |
| 내부 Stack | 일반 native stack과 투명 contentStyle. 화면별 push, 뒤로, 루트 닫기 유지. 불투명한 커스텀 전체 헤더 없음. |
| 네이티브 Header | 별도 `headerBlurEffect`나 `headerTransparent`를 추가하지 않았다. 기존 시스템 scroll-edge 동작 유지. 목록 스크롤로 나타나는 헤더 표면과 시트 전체 배경을 구분했다. |
| RN / SwiftUI Host | 기존 flex 컨테이너와 Host는 투명. 추가 anchor는 1×1, 터치·접근성 비활성, 기존 Stack 뒤의 형제이므로 첫 자식 스크롤 탐색 순서 유지. |
| SwiftUI List | `insetGrouped`의 자동 scroll 배경이 시트 뒤 재질을 가릴 수 있다. 네이티브 모듈 사용 가능 시 이 배경만 숨긴다. Section/행의 시스템 표면·구분선은 유지. |
| UIKit 시트 재질 | 기본 Glass→불투명 효과, 고정 blur→불투명 효과를 detent별로 지정한 실험 모두 실제 느린 드래그 중 특정 구간에서 짧게 바뀌었다. detent별 효과 설정만으로 연속 보간을 보장할 수 없었다. UIKit 내부 구현의 비공개 원인까지 확정한 것은 아니다. |

기존 앱에는 매 프레임 setState나 detent 완료 후 fade가 없었다. 설치된 RNScreens의 `onSheetDetentChanged`는 index/isStable을 전달하고 UIKit의 선택 detent delegate를 사용하므로 연속 위치 입력으로 사용할 수 없다. `onTransitionProgress`도 시트 detent 드래그 진행률과 다르다. SwiftUI List는 RN ScrollView가 아니므로 스크롤 offset이나 `onLayout`을 시트 이동으로 대신하지 않았다.

## 최종 구현

- iOS 26.1 이상에서 기존 `UISheetPresentationController`를 responder/controller 체인의 공개 API로 찾는다. delegate나 pan recognizer를 교체하지 않는다.
- 기존 두 detent의 **identifier와 원래 resolver 결과**를 그대로 유지하는 custom detent를 설치한다. resolver 안에서는 높이만 저장하며 sheet 속성을 변경하지 않는다.
- 두 detent와 sheet에 동일한 시스템 blur를 지정해 별도의 높이별 재질 전환을 없앤다. 앱의 기존 라이트/다크 선택을 backdrop에 전달한다.
- 설정 컨트롤러의 내용 뒤에 터치하지 않는 시스템 색상 배경 레이어를 넣는다. 시트 자체의 둥근 모서리·grabber·클리핑은 UIKit이 관리한다. 화면 전체나 버튼·텍스트의 opacity를 바꾸지 않는다.
- `CADisplayLink`를 main run loop의 common mode에서 실행한다. `presentedView.layer.presentation().bounds.height`를 읽으므로 손을 놓은 뒤 시스템 spring도 실제 표시 높이에 따라간다. presentation layer가 없으면 model layer를 사용한다.
- 초기 정착 시 native bounds와 선택 detent의 높이 차이를 안전 영역 보정값으로 저장한다. container 크기가 바뀌면 다시 구한다. 드래그 중 가장자리에 붙었는지를 조건 분기하지 않는다. 그 방식은 UIKit의 카드 scaling 경계에서 작은 불연속을 일으켜 제거했다.
- `opacity = clamp((displayedHeight - inset - lowerHeight) / (upperHeight - lowerHeight), 0, 1)`로 직접 갱신한다. 추가 timing/spring, React 상태 갱신, JS 브리지 프레임 콜백은 없다.
- Reduce Transparency가 켜지면 배경을 불투명하게 유지하도록 처리했다. 알림 변경도 반영한다. 이 설정의 실제 접근성 조작 검증은 아직 하지 않았다.
- window에서 분리되면 display link와 배경을 제거하고 자신이 설치한 native 속성만 복원한다. 기존 dismiss 애니메이션에는 개입하지 않는다.
- iOS 26.1 미만, 모듈 없는 기존 바이너리/Expo Go, Android는 기존 렌더링으로 돌아간다. Android autolink 결과에 이 Apple 전용 모듈은 없다. 네이티브 모듈이므로 실제 적용에는 새 네이티브 빌드가 필요하다.

Reanimated 대신 작은 UIKit 확장을 선택했다. Router가 연속 드래그 값을 공개하지 않는 상황에서 Reanimated를 위해 새 이벤트 브리지를 만들 필요 없이 같은 UI 스레드에서 공개 presentation-layer 값을 사용할 수 있기 때문이다.

**시각적 차이:** Glass 스타일의 네이티브 내비게이션 버튼과 시스템 시트 움직임은 유지한다. 시트 바탕은 고정된 시스템 blur 위의 색상 보간이므로 기본 Liquid Glass 바탕의 굴절·재질 변형 표현과 다르다. Apple 지도 내부의 정확한 곡선·임계점·재질 구현과 동일하다고 주장하지 않는다. 목표 중 위치 연동, 정지 시 유지, 위/아래 방향의 연속 전환은 아래 Simulator 영상에서 확인했다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `modules/yeongdu-sheet-background/` | Apple 전용 로컬 Expo 모듈, native lifecycle·위치 관찰·배경 보간. |
| `src/features/settings/settings-sheet-background.ios.tsx` / `.tsx` | native capability 검사, 앱 테마 전달, iOS anchor와 다른 플랫폼 passthrough. |
| `src/app/(settings)/_layout.tsx` | 기존 SettingsNavigator에 배경 드라이버 연결. 라우트와 액션은 유지. |
| `src/features/settings/settings-ui.ios.tsx` | 드라이버 사용 가능 시 List의 scroll 배경만 숨김. |
| `scripts/check-native-sheet-background.cjs` | fallback, Android passthrough, 테마 전달, 터치·콘텐츠 경계 검사. |
| 기존 설정 검사 2개 | 새로운 native 경계 mock과 List 배경 capability 분기 검사. |
| `scripts/ios-sheet-qa/` | 앱 iOS 프로젝트를 수정하지 않는 독립 XCTest runner 생성기·실제 터치 시나리오·녹화 자르기 도구. |

서버 API, 저장 스키마, 인증·잠금·생체 인증, 재생 로직, Android UI, package.json/lockfile은 변경하지 않았다. 자동 커밋·클라우드 업로드·제출은 하지 않았다. 이전 TrueSheet 기록은 과거 복원 상태로 표시했다.

## 실제 터치 검증과 증거

별도로 만든 빈 데이터 Simulator `YeongduMusic Sheet QA`, iPhone 18 Pro / iOS 27.0을 사용했다. 원래 Simulator 데이터는 바꾸지 않았다. 서명 없는 Simulator의 기존 Keychain/연결 오류가 화면에 보이므로 NAS 정상 연결이나 저장 성공을 검증한 결과는 아니다.

XCTest는 앱의 실제 ‘설정 열기’ 버튼, native grabber, 목록과 뒤로·닫기 버튼을 조작한다. `press(...thenDragTo:withVelocity:thenHoldForDuration:)`로 70pt/s 드래그와 2초 정지를 실행한다. flick은 fast velocity로 즉시 손을 뗀다. 중간 정지는 **손을 뗀 뒤의 스크린샷이 아니라 녹화 중 손을 누르고 있는 구간**으로 확인했다.

- [기존 시트: 동일 색상 배경·다크](verification/sheet-motion/baseline-dark.mp4)
- [최종 수정: 다크 실제 드래그 발췌](verification/sheet-motion/final-dark.mp4)
- [최종 수정: 라이트 실제 드래그 발췌](verification/sheet-motion/final-light.mp4)
- [최종 다크 프레임 모음](verification/sheet-motion/dark-drag-frames.png), [라이트 프레임 모음](verification/sheet-motion/light-drag-frames.png)
- [native 높이·보간 진단 일부](verification/sheet-motion/native-motion-log.txt): 표시 높이에 따라 0~1 사이 값이 변하며, detent 도착 전에도 중간 값이 존재한다. 이는 영상 확인을 보조하며 독립적인 화질·지연 측정은 아니다.
- [검사 결과](verification/sheet-motion/results.json), [소스 수준 회귀 검사](verification/sheet-motion/regressions.json)

색상 배경은 광학 비교를 위한 **Simulator 전용 process 환경 변수 fixture**다. 저장 설정을 변경하지 않고 시트 뒤에만 그린다. iPhone/iPad 기기 빌드에는 fixture·비교 flag·진단 로그가 컴파일되지 않는다. 제품 화면에 실험 버튼이나 라우트를 추가하지 않았다. 일반 메인 화면에서도 동일 XCTest를 따로 실행했다. 동영상은 실제 simctl 녹화의 준비 시간을 잘라 해상도를 낮춘 것이며 프레임이나 움직임을 합성하지 않았다.

| 확인 항목 | 상태 |
| --- | --- |
| 느린 위/아래 드래그 배경 전환 | 최종 다크/라이트 녹화 관찰, detent 중간에서 색상이 점진적으로 변함. |
| 손을 누른 채 2초 정지 | 녹화에서 위치와 배경 유지 확인. 손을 뗀 뒤 native snap은 별도 동작. |
| 위/아래 전환, 빠른 flick | 실제 터치 실행과 native spring 구간 녹화. 역방향 이동 시 opacity도 되돌아감. 프레임 단위 동기 지연의 정량 측정은 하지 않음. |
| 확장 후 목록 스크롤·헤더 | 실제 스크롤과 네이티브 헤더 관찰. 목록 스크롤 때 시트가 접히지 않는 위치 assertion 통과. |
| 내부 화면 진입·뒤로·X 닫기 | 클라우드 연결 진입/뒤로와 닫기 통과. 다른 모든 하위 설정의 기능을 실행한 것은 아님. |
| 반복 열기 | 같은 앱 프로세스에서 3회 닫기/다시 열기, 매번 하단 detent 초기화 assertion 통과. |
| 기존 상태·액션 경계 | 관련 소스 회귀 검사 통과. native 화면·네트워크·저장소 mock 범위는 별도 명시. |
| 실기기 / iOS 26.1 런타임 / iPad·회전·키보드·접근성 옵션 | 미검증. 사용자 요청대로 이번 실제 조작은 Simulator만 진행. |
| 손가락을 떼지 않고 한 제스처 안에서 급격히 방향 반전 | 미검증. 사용한 공개 XCTest 경로는 한 번의 drag와 hold를 제공하므로 연속 다중 구간 터치와 동일하다고 주장하지 않음. |

최종 수정본은 실기기에 설치하지 않았다. 앞서 잠긴 iPhone에 설치된 초기 detent 효과 후보는 최종 코드와 다르며, 실기기에서 최종 결과를 보려면 다시 빌드·설치해야 한다. 전체 녹화와 xcresult 원본의 로컬 위치는 results.json에 남겼다.

## 재현과 남은 확인

`ruby scripts/ios-sheet-qa/create-project.rb /tmp/yeongdu-sheet-ui-tests`로 독립 프로젝트를 만든다. CocoaPods의 xcodeproj gem을 사용하며 앱의 생성된 `ios/`에는 테스트 target을 추가하지 않는다. 새 native app을 원하는 Simulator에 설치한 뒤 아래 명령으로 실제 터치를 실행한다.

```sh
xcodebuild -project /tmp/yeongdu-sheet-ui-tests/SheetUITests.xcodeproj \
  -scheme SheetUITests -destination 'platform=iOS Simulator,id=SIMULATOR_UUID' \
  -derivedDataPath /tmp/yeongdu-sheet-ui-test-build \
  -resultBundlePath /tmp/sheet-motion-new.xcresult \
  test CODE_SIGNING_ALLOWED=NO
```

라이트/다크는 실행 전에 `xcrun simctl ui SIMULATOR_UUID appearance light|dark`로 바꾼다. XCTest는 각 테스트의 process-only baseline/contrast flag를 지정한다. 테스트 경로와 목적은 Swift 소스에 있다. 기존 데이터가 있는 기기를 초기화하지 말고 별도 QA Simulator를 사용한다.

실기기에서는 grabber를 천천히 이동 → 전환 중 멈춤 → 손을 떼지 않고 역방향 이동 → flick → 확장 후 목록 스크롤 → 하위 화면 뒤로 → 닫고 재열기를 두 테마에서 확인해야 한다. iOS 26.1과 iPad의 좁은 창/회전/키보드·Reduce Transparency도 남아 있다. 이 항목들을 완료로 표시하지 않는다.

## 공식 API 근거

- [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/), [Router Stack](https://docs.expo.dev/versions/v58.0.0/sdk/router/stack/), [Expo Modules](https://docs.expo.dev/modules/module-api/)
- [Detent backgroundEffect (iOS 26.1+)](https://developer.apple.com/documentation/uikit/uisheetpresentationcontroller/detent/backgroundeffect), [presentedView](https://developer.apple.com/documentation/uikit/uipresentationcontroller/presentedview)
- [CALayer presentation](https://developer.apple.com/documentation/quartzcore/calayer/presentation()) — Apple는 표시 중 상태의 근사값으로 설명한다. 비공개 UIKit subview, KVC 또는 내부 pan 상태를 사용하지 않는다.
