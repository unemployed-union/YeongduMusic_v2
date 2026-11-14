# 음악 소스와 설정의 메뉴 그룹 배경 비교

> **현재 구현:** [시스템 기본 시트 복원](ios-system-sheet-restoration.md)을 적용했다. 아래 custom Material 연결 실험은 현재 앱에서 사용하지 않는다.

> **후속 검증:** 아래 수정은 `systemThinMaterial`을 연결한 대체 재질 실험이며, 음악 소스의 기본 시스템 재질과 동일하지 않다. 동일 재질 요구에 대한 현재 결론과 단일 변수 Simulator 실험은 [네이티브 재질 생성 경로 검증](ios-native-material-path.md)을 기준으로 확인한다.

2026-11-14 · 분석 모델: 사용자 지정 `gpt-6.1-sol` / `high` (읽기 전용 분석). 현재 설치된 Expo 58.0.23, Expo UI 58.0.27의 실제 앱·라이브러리 소스를 대조했다.

**설정의 그룹 배경 modifier가 만들어져 있지만 Section에 연결되지 않은 것이 앱 코드에서 확인된 누락이다.** 설정은 List의 scroll 배경만 숨기고 있었고, 그룹/행의 기본 불투명 표면은 남아 있었다. 같은 조건의 실제 Simulator A/B에서 Section의 배경 연결만 추가하자 그룹 안에도 뒤쪽 색상이 나타났다.

## 실제 View 계층

| 음악 소스 | 설정 |
| --- | --- |
| Host → SwiftUI BottomSheet(`.sheet`) → Group → NavigationStack → Toolbar → List → Section → Picker/Button | Expo Router UIKit formSheet → SettingsSheetBackground → Native Stack → RN View → Host/UIHostingController → List → Section → native row 또는 RNHostView |
| `src/features/library/library-sheet.ios.tsx`, `music-source-menu-content.ios.tsx` | `src/features/settings/settings-presentation.tsx`, `settings-navigator.ios.tsx`, `settings-ui.ios.tsx` |

`settings-ui.tsx`의 불투명 RN 화면은 다른 플랫폼용 구현이다. iOS 런타임에서는 `settings-ui.ios.tsx`를 사용하므로 Android용 배경을 수정하지 않았다.

| 확인한 항목 | 음악 소스 | 수정 전 설정 |
| --- | --- | --- |
| List / Form | `List(insetGrouped)`이며 Form 없음 | `List(insetGrouped)`이며 Form 없음 |
| Section / 행 | SwiftUI 기본 Section과 Picker/Button | 기본 Section, HStack Button, RNHostView 편집 행 |
| listRowBackground | 앱에서 지정하지 않음 | 지정하지 않음. 기존 custom modifier가 export만 되고 소비되지 않음 |
| scrollContentBackground | automatic 기본값 | 기존 native backdrop 사용 가능 시 hidden |
| presentationBackground | 앱 경로에서 지정하지 않음 | 앱 경로에서 지정하지 않음 |
| backgroundStyle | 앱 경로와 관련 설치 Expo UI 소스에 호출 없음 | 동일. 이를 원인이나 해결 옵션으로 가정하지 않음 |
| 별도 시트 배경 | SwiftUI sheet의 시스템 표면 | 기존 native Glass backdrop + 불투명 색상 레이어, 기존 높이 전환 driver |
| Host / RN 컨테이너 | 투명 Host; seedColor는 tint | 투명 Host/RN 컨테이너. 컨테이너가 투명해도 List 행 표면은 별개 |

설치된 `@expo/ui`의 `ListView.swift`, `SectionView.swift`, `BottomSheetView.swift`는 각각 SwiftUI List, Section, `.sheet`를 구성한다. `HostView.swift`의 seedColor는 `.tint(seedColor)`를 적용하며, Expo Modules의 SwiftUIHostingView는 UIHostingController 배경을 clear로 만든다. 이것만으로 List 행 배경까지 투명해지지는 않는다.

## 음악 소스에 앨범색이 들어오는 경로

음악 소스 컴포넌트에는 앨범색 추출 hook이나 그룹 배경색·opacity 지정이 없다. `useColors()`도 저장된 앱 색상 설정을 읽으며, `seedColor`는 강조색을 위한 tint다. 따라서 앨범색을 그룹에 직접 칠하는 앱 코드가 원인은 아니다.

사용자가 관찰한 색상 반영은 뒤쪽 화면 → 시스템 sheet/그룹 표면의 합성 경로로 해석하는 것이 타당하다. 음악 소스는 하나의 SwiftUI `.sheet` 안에 NavigationStack과 List가 있지만, 설정은 UIKit formSheet 안에서 별도 SwiftUI Host가 시작된다. **같은 insetGrouped를 지정했다고 같은 presentation/material 환경이라고 할 수 없다.** OS가 선택하는 내부 기본 row material, 배경색 적응과 투과의 비중은 이 공개 소스만으로 확정할 수 없다.

그와 별개로, 설정의 기본 행 표면이 뒤쪽 색을 가린다는 점은 아래 단일 변수 실험으로 확인했다. 이 작업은 Apple의 비공개 기본 재질을 그대로 복제했다고 주장하는 것이 아니라, 설정 그룹에 이미 준비되어 있던 네이티브 반투명 배경을 연결한 최소 수정이다.

## 최소 수정

앱 코드 변경은 `src/features/settings/settings-ui.ios.tsx` 한 파일이다. 기존 `settingsGroupBackgroundModifier`를 import하고, 공통 `SettingsSection`의 Section에 아래 속성만 연결했다.

```tsx
modifiers={settingsGroupBackgroundModifier ? [settingsGroupBackgroundModifier] : undefined}
```

이 modifier는 기존 Swift 코드의 `.listRowBackground(SettingsGroupMaterial())`로 연결된다. 기본 그룹 배경 슬롯을 시스템 thin Material과 기존 불투명 색상 덮개로 대체하며, 내용·터치·행 높이는 감싸거나 변경하지 않는다. 같은 Section 안의 native/RN 행에 적용된다. Section 밖의 별도 행이나 콘텐츠 wrapper에는 새 처리를 추가하지 않았다.

기존 capability 검사와 구형 바이너리 fallback을 그대로 사용한다. 등록된 native modifier가 없는 환경에서는 기본 Section 표면을 유지한다. 새 배경 View, BlurView, 상태 저장소나 JS 프레임 업데이트는 만들지 않았다.

음악 소스의 앱 코드, 설정의 animation/Detent/gesture/header 설정, 기존 Swift 시트 driver·배경·그룹 재질 구현은 **작업 시작 시점과 SHA-256이 동일**하다. [보존 범위와 코드 차이](verification/settings-group-background/results.json)를 기록했다. 기존 미커밋 변경을 초기화하거나 커밋하지 않았다.

## 단일 변수 A/B 및 실제 렌더링

iPhone 18 Pro / iOS 27.0의 별도 `YeongduMusic Sheet QA` Simulator에서 다음을 실행했다.

1. 수정 전 현재 소스를 Release 빌드하고 설치했다.
2. 기존 Simulator 전용 색상 배경 fixture로 설정 시트를 실제 드래그하고 캡처했다.
3. Section의 배경 modifier 연결만 추가해 다시 Release 빌드·설치했다.
4. 같은 기기·테마·빈 데이터·색상 배경·터치 경로로 비교했다. List scroll 배경 옵션이나 native 배경/전환 코드는 바꾸지 않았다.
5. 수정 후 라이트 모드도 확인하고, 두 화면을 일반 앱 배경 위에서 각각 열어 medium/large 및 설정 half 화면을 기록했다.

[수정 전 안정된 half 화면](verification/settings-group-background/before-stable-half.png) · [수정 후](verification/settings-group-background/after-stable-half.png) · [수정 후 라이트](verification/settings-group-background/light-09-reopened-half-2.png)

[수정 전 실제 드래그](verification/settings-group-background/before-dark.mp4) · [수정 후 실제 드래그](verification/settings-group-background/after-dark.mp4)

같은 첫 번째 그룹 내부 여백(y=1810, x=250/620/1010)의 sRGB 표본은 수정 전 모두 `(58,58,60)`이었고, 수정 후 각각 `(97,69,80)`, `(25,91,106)`, `(90,88,25)`로 뒤쪽 위치별 색이 나타났다. [원본 표본](verification/settings-group-background/group-pixels.jsonl)은 실제 캡처에서 읽은 값이다. opacity나 블러 강도를 이 값으로 역산하지 않았다.

일부 최초 XCUIScreenshot에는 헤더/섹션 제목이 합성되지 않은 프레임이 있어 그 캡처만으로 회귀를 판단하지 않았다. 같은 빌드의 녹화와 반복 재열기의 안정된 스크린샷에서는 헤더·제목·버튼이 정상적으로 보였다. 위 대표 비교는 안정된 재열기 화면을 사용한다. 원래 초기 캡처는 xcresult에 남아 있다.

### 음악 소스 참조 화면

[다크 medium](verification/settings-group-background/after-reference-source-half.png) · [다크 large](verification/settings-group-background/after-reference-source-expanded.png) · [라이트 medium](verification/settings-group-background/light-reference-source-half.png)

실제 음악 소스 화면도 수정 전후 두 detent에서 열고 닫았다. 해당 소스는 변경하지 않았다. 다만 이 Simulator에는 실제 앨범 라이브러리/NAS 세션이 없어 **실제 앨범 아트 위에서 두 그룹의 재질 강도가 정확히 같은지는 검증하지 않았다.** 색상 fixture A/B는 설정 그룹의 배경색 투과 여부를 검증한 것이며, 음악 소스의 비공개 기본 재질과 픽셀 단위 일치를 증명하지 않는다.

## 검사 결과와 남은 확인

- 수정 전/후 Release Simulator 빌드 성공.
- lint·타입 검사, 관련 소스 회귀 검사 4종 통과. 소스 검사에서는 native/network/storage 경계가 mock이다.
- XCTest: 수정 전 다크 2개, 수정 후 다크 2개, 수정 후 라이트 2개 시나리오 통과. 실제 sheet drag/flick/expanded list scroll/클라우드 진입·뒤로/닫기·3회 재열기와 음악 소스 열기·medium/large·닫기를 실행했다.
- 녹화와 안정된 화면에서 collapsed 그룹의 반투명 및 기존 expanded 불투명 상태를 확인했다. 기존 전환 알고리즘은 바꾸지 않았다.
- 실기기, 실제 앨범 위 비교, iOS 26.1 런타임, iPad·회전·키보드·VoiceOver/접근성 옵션의 실제 조작은 미검증이다.
- Simulator의 기존 Keychain/연결 오류는 이 검증 데이터 환경의 제약이다. NAS 인증·저장·재생 성공을 검증한 결과가 아니다.
- 실기기 빌드/설치·클라우드 업로드·배포는 수행하지 않았다.

현재 native modifier가 포함된 새 빌드를 실기기에 설치한 뒤 같은 앨범 위치와 테마에서 음악 소스를 medium으로 열어 그룹에 비치는 색을 확인한다. 닫고 같은 화면 위에서 설정을 half로 열어 비교한다. 설정을 확장/축소하며 기존 전환과 그룹 표면이 이어지는지 확인하고, 클라우드 연결 진입·뒤로와 닫기를 실행한다. 두 테마에서 반복한다. 재질 강도 조정이 필요하다면 별도 group material 변수만 조정해야 하며 시트 동작이나 음악 소스 UI를 바꾸지 않아야 한다.

검사 원본 위치와 protected source hashes는 [results.json](verification/settings-group-background/results.json)에 있다. 실제 앱을 촬영한 MP4의 준비 시간을 잘라 압축했으며 장면을 합성하지 않았다. 녹화와 테스트를 함께 시작/종료하는 QA 도구는 `scripts/ios-sheet-qa/run-recorded-tests.sh`다. 같은 label 결과 폴더가 이미 있으면 덮어쓰지 않으므로 재현 시 새 label을 사용한다.

## 공식 API

- [Expo SDK 58 SwiftUI List](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/list/), [Modifiers](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/modifiers/)
- [Expo UI custom modifier 확장](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/extending/)
- [SwiftUI listRowBackground](https://developer.apple.com/documentation/swiftui/view/listrowbackground(_:)), [scrollContentBackground](https://developer.apple.com/documentation/swiftui/view/scrollcontentbackground(_:))
