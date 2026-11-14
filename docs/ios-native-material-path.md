# 설정 그룹과 음악 소스의 네이티브 재질 생성 경로

> **현재 구현:** 보존 제약을 해제한 후 [시스템 기본 시트 복원](ios-system-sheet-restoration.md)을 적용했다. 아래는 복원 전의 분석·제약·비교 기록이다. 당시 모듈 원본은 복구 압축 파일에 보존했다.

2026-11-14 · Expo 58.0.23 / Expo Router 58.0.30 / Expo UI 58.0.27 / RN 0.88.1

**동일 재질 적용은 미완료다.** 음악 소스는 시스템 sheet 안의 기본 insetGrouped List 표면을 사용한다. 현재 설정 그룹은 앱이 지정한 `systemThinMaterial`과 별도 불투명 덮개를 사용한다. 두 구현은 다르며, 이전의 색상 비침 검사는 동일 재질을 증명하지 않았다.

이번에는 프로덕션 코드를 바꾸지 않고, 실제 소스 추적과 독립 네이티브 비교 앱으로 차이가 생기는 조건을 분리했다. 그룹만 수정하고 현재 시트 재질 제어를 그대로 유지하는 공개 API 해결책은 확인하지 못했다. 다른 Material이나 색상으로 대체해 완료 처리하지 않았다.

## 실제 앱 코드

| 항목 | 음악 소스 | 현재 설정 |
| --- | --- | --- |
| 최상위 경로 | RN → Host → SwiftUI BottomSheet `.sheet` → Group → NavigationStack → Toolbar → List | Router UIKit formSheet → SettingsSheetBackground → Native Stack → RN View → Host → List |
| 목록 | SwiftUI `List`, `.listStyle(.insetGrouped)` | 같은 SwiftUI List 스타일. Form은 아님 |
| 그룹과 행 | Section → inline Picker/Text 또는 Button | Section → Button/HStack 또는 RNHostView 안의 기존 편집 컴포넌트 |
| `listRowBackground` | 지정하지 않음. 시스템이 생성 | 공통 SettingsSection의 custom modifier → `SettingsGroupMaterial()` |
| `scrollContentBackground` | 지정하지 않음: automatic | native driver 사용 시 hidden |
| `background` / `backgroundStyle` | 목록/그룹에 재질 지정 없음 | 목록/Section에 SwiftUI backgroundStyle 없음. RN 편집 행 wrapper는 transparent |
| `presentationBackground` | slot 미제공. Expo BottomSheet는 `.presentationBackground`를 호출하지 않음 | SwiftUI presentationBackground 호출 없음. UIKit sheet 효과는 아래처럼 직접 대체 |
| 그룹의 별도 배경 | 앱에서 추가하지 않음 | `UIVisualEffectView(UIBlurEffect(style: .systemThinMaterial))` + `secondarySystemGroupedBackground` 덮개 |
| 시트 배경 | 시스템 관리 | native `sheet.backgroundEffect` 및 각 detent 효과를 빈 `UIVisualEffect()`로 지정. 대신 별도 `SettingsSheetGlassBackdrop` 추가 |
| 그룹 전환 | 시스템 presentation 환경에 따름 | 그룹 덮개가 기존 SettingsSheetSurfaces의 시트 임계점 애니메이터에 등록됨 |

앱 근거:

- `src/features/library/library-sheet.ios.tsx`: Host, BottomSheet, NavigationStack, Toolbar, medium/large.
- `src/features/library/music-source-menu-content.ios.tsx`: List/Section/Picker/Button. 그룹 배경 override 없음.
- `src/features/settings/settings-ui.ios.tsx`: List scroll 배경 숨김, Section custom modifier 연결.
- `modules/yeongdu-sheet-background/ios/SettingsGroupBackground.swift`: 별도 thin Material과 그룹 덮개.
- `modules/yeongdu-sheet-background/ios/YeongduSheetBackgroundModule.swift`의 `applyMaterial`: 시스템 sheet/detent 효과를 빈 효과로 대체.

설치된 Expo UI의 `ListView.swift`와 `SectionView.swift`는 SwiftUI List/Section을 구성한다. `BottomSheetView.swift`는 `.sheet`를 사용하며 presentationBackground slot이 있을 때만 사용자 배경을 지정한다. Host의 seedColor는 `.tint`에 연결된다. 음악 소스는 앨범색을 추출하거나 그룹에 칠하지 않는다.

**음악 소스 그룹에 앱이 선택한 이름 있는 `Material.thin` 또는 `UIBlurEffect.Style`이 있는 것은 아니다.** 기본 List 그룹과 시스템 sheet의 합성 결과를 사용한다. 기본 구현을 특정 Blur 스타일로 치환하면 같은 경로가 아니다. [Expo List](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/list/), [BottomSheet](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/bottomsheet/).

## 한 변수씩 바꾼 네이티브 실험

별도 bundle ID `xyz.yeongdu.material-probe`, iPhone 18 Pro / iOS 27.0 Simulator. 앱에 실험 화면이나 옵션을 추가하지 않았다. 모든 경우 같은 네이티브 List/Section/Button과 같은 네 색상 배경을 사용했다. 색상 배경은 합성 차이를 관찰하기 위한 fixture이며 앱 수정안이 아니다.

| 경우 | 변경한 조건 | 라이트 모드 관찰 |
| --- | --- | --- |
| 1 | SwiftUI `.sheet` → NavigationStack → 기본 List | 그룹 안에 뒤쪽 색이 반영됨 |
| 2 | 1의 presentation만 UIKit formSheet로 변경 | 그룹 안에 뒤쪽 색이 반영됨. 색/효과 강도의 완전한 일치는 주장하지 않음 |
| 3 | 2의 내비게이션만 UINavigationController + 투명 UIHostingController로 변경 | 그룹 안에 뒤쪽 색이 반영됨 |
| 6 | **3에서 sheet/detent `backgroundEffect`만 빈 `UIVisualEffect()`로 지정** | 기본 scroll 배경과 그룹이 불투명해짐 |
| 4 | 6에 현재 앱의 SettingsSheetGlassBackdrop 추가 | 기본 scroll/그룹 표면이 별도 Glass를 가림 |
| 5 | 4의 `scrollContentBackground`만 hidden으로 변경 | 별도 Glass는 보이지만 그룹은 불투명하게 남음 |
| 7 | 진단용으로 sheet/detent 효과에 명시적 UIGlassEffect(.regular) 지정 | 다크 캡처에서 그룹이 불투명. 원본 기본 재질과 동일하다는 근거 없음. 대안으로 채택하지 않음 |

대표 원본 캡처:

- [SwiftUI 기본 시트 / 라이트](verification/native-material-path/light-swiftui-default.png), [다크](verification/native-material-path/dark-swiftui-default.png)
- [UIKit 기본 시트 + native navigation / 라이트](verification/native-material-path/light-uikit-native-navigation.png)
- [빈 효과만 지정 / 라이트](verification/native-material-path/light-empty-sheet-effect.png), [다크](verification/native-material-path/dark-empty-sheet-effect.png)
- [별도 Glass + 목록 배경 숨김 / 라이트](verification/native-material-path/light-custom-sheet-hidden-list.png), [다크](verification/native-material-path/dark-custom-sheet-hidden-list.png)

라이트 3→6은 동일한 목록·그룹·행·컨트롤러·배경에서 시트 효과 설정만 달라진다. UIKit이나 RN Host를 사용한다는 사실만으로 반투명 그룹이 불가능한 것은 아니다. **현재의 시스템 sheet 효과 대체가 기본 그룹의 합성 동작을 바꾸는 조건**으로 재현됐다. SwiftUI NavigationStack으로 감싸거나 List 배경만 맞추는 것으로 해결됐다고 판단할 수 없다.

다크에서도 SwiftUI 기본 시트의 색상 반영과 빈 효과/커스텀 배경 환경의 불투명 그룹을 관찰했다. 일부 XCTest 캡처는 시트 콘텐츠가 빠진 프레임이었다. 다크 경우 3, 라이트 경우 7 등 해당 프레임은 시각적 결론에 사용하지 않았다. 모든 원본 캡처와 manifest는 보존했다. 테스트 통과는 행 접근성 요소가 존재하고 촬영·종료됐다는 의미이며 모든 이미지의 합성이 정상이라는 자동 판정이 아니다.

## 공개 API로 확인한 값과 한계

진단은 UIView/UIViewController의 공개 계층, `UISheetPresentationController.backgroundEffect`, detent.backgroundEffect, UICollectionViewCell.backgroundConfiguration, traitCollection만 읽었다. 사설 selector/KVC/SwiftUI 내부 환경 설정은 사용하지 않았다. 로그에 나온 내부 클래스명과 시스템 색상 이름은 관찰값일 뿐 구현에 사용하는 식별자가 아니다.

- 기본 SwiftUI/UIKit 시트의 backgroundEffect와 detent 효과는 `nil`이었다. 이는 시스템 관리 기본값이며, 내부 렌더러가 쓰는 구체적인 UIGlassEffect 인스턴스를 반환한 것이 아니다.
- 빈 효과 비교에서는 실제 표시 중인 sheet와 두 detent 모두 UIVisualEffect 인스턴스가 기록됐다.
- 기본 List cell에는 시스템 기본 UIBackgroundConfiguration과 `tableCellGroupedBackgroundColor`가 보였다. visualEffect는 nil, color transformer는 없었다. 일반적인 resolvedColor 값만으로 실제 시스템 sheet 합성 결과를 복원할 수 없었다.
- 따라서 이 값들을 읽었다고 음악 소스의 실제 기본 표면을 독립적인 Material 값으로 추출했다고 할 수 없다. `EnvironmentValues.backgroundMaterial` 역시 시스템 sheet의 실제 렌더링 재질을 추출하는 API로 간주하지 않았다. [Apple backgroundMaterial](https://developer.apple.com/documentation/swiftui/environmentvalues/backgroundmaterial).

원본 값은 [라이트](verification/native-material-path/light-values/), [다크](verification/native-material-path/dark-values/)에 있다. 같은 기본 행 설정으로도 sheet 효과 설정에 따라 실제 합성이 달라졌다는 점이 중요하다.

## 적용하지 않은 이유와 구조적 해결 범위

그룹의 custom modifier를 제거하면 List의 기본 행 생성으로 돌아갈 수 있다. 하지만 현재의 빈 sheet 효과를 그대로 두면 경우 5처럼 불투명 그룹으로 돌아간다. 이것을 해결이라고 적용하지 않았다.

현재 설치된 공개 API에서 **다른 sheet의 시스템 기본 합성 환경만 그룹에 전달하면서 현재 sheet의 효과 대체를 그대로 유지하는 방법은 확인하지 못했다.** 내부 상태를 추측하거나, 비공개 trait를 설정하거나, 캡처한 시스템 색을 고정값으로 재사용하지 않았다. 전면적인 기술적 불가능성을 증명한 것은 아니지만, 현재 제약을 충족하는 구현 근거가 없다.

근거 있는 다음 구조 실험은 기존 Router/formSheet와 내비게이션을 유지한 채 시스템 sheet 기본 재질을 복원하고, 그룹 override를 제거하는 것이다. 경우 3은 이 방향에서 기본 그룹 합성이 작동할 수 있음을 보여준다. 다만 현재 driver는 시스템의 독립적인 detent 재질 전환을 막으려고 효과를 비우고 있다. 이를 복원하면 시스템 전환과 앱의 85%/78%·200ms 전환이 다시 겹칠 수 있다. **배경 소유권과 전환 레이어를 함께 조정·검증해야 하므로 “그룹만 변경” 범위를 넘는다.** 이 구조안을 완료된 수정으로 제시하지 않는다.

음악 소스와 같은 SwiftUI `.sheet` 전체로 이전하는 방안은 presentation·내부 내비게이션 변경 범위가 더 크며, 현재 금지 조건에 맞지 않아 적용하지 않았다. 별도 Material, Tint, alpha 조절, 오버레이나 GlassView로 그룹을 모방하는 새 수정도 하지 않았다.

## 보존·검사·재현

검사 결과, 원본 xcresult 위치 및 파일 해시는 [results.json](verification/native-material-path/results.json)에 기록했다.

- 프로덕션 앱 코드 수정 없음. 기존 thin Material 구현도 이번에 다른 대체재로 바꾸지 않았다. 현재 앱이 동일 재질 요구를 충족했다는 뜻은 아니다.
- 음악 소스, native driver/정책/그룹 구현, 설정 presentation/내비게이션 등 기존 기록의 14개 파일 SHA-256 동일. 임계점·지속 시간·Detent·헤더·제스처 그대로 유지.
- 앱 lint, 타입 검사, 관련 기존 소스 회귀 검사 4종 통과. 이 소스 검사들은 native rendering을 mock하므로 재질의 증거로 사용하지 않았다.
- 현재 YeongduMusic 소스의 Release Simulator 빌드 성공. 빌드 로그: `/tmp/yeongdu-truesheet-simulator-build.log`. 실제 iPhone 빌드·설치나 클라우드 업로드는 수행하지 않았다.
- 최종 비교 XCTest는 라이트 1개, 다크 1개 통과. 각 테스트가 7개 presentation 변형을 실행했다. 독립 비교 앱의 실제 Simulator 실행이며 YeongduMusic 앱 전체 흐름 회귀 테스트나 실기기 검증은 아니다.
- 실기기 및 실제 앨범 위 두 화면 비교, iOS 26.1 런타임은 미검증. 이 결과의 OS 범위는 iOS 27.0이다.
- 초기 독립 앱은 Scene 생명주기 미설정으로 실행 실패했다. 이를 수정한 뒤 최종 테스트를 실행했다. 초기 실패는 YeongduMusic의 실패가 아니며 성공 집계에 포함하지 않는다.

실행한 비교 앱 원본은 [reproducer](verification/native-material-path/reproducer/)에 있다. `create.rb`는 현재 checkout의 기존 배경 Swift 파일을 참조한다. 복제본을 `/tmp`의 새 디렉터리에 놓고 그곳에서 `ruby create.rb`를 실행하면 별도 Xcode 프로젝트를 생성한다. 프로젝트에는 앱 라우트나 실제 데이터가 포함되지 않는다.

```sh
xcodebuild -project /tmp/yeongdu-native-material-probe/Probe.xcodeproj \
  -scheme MaterialProbe \
  -destination 'platform=iOS Simulator,id=04674652-9292-47C8-AD25-97A6CDF48FB5' \
  -derivedDataPath /tmp/yeongdu-native-material-probe/build \
  -resultBundlePath /tmp/yeongdu-native-material-probe/new-result.xcresult \
  CODE_SIGNING_ALLOWED=NO test
```

실제 iPhone 비교는 현재 상태의 완성을 확인하는 절차가 아니라, 다음 구조 수정이 승인·구현됐을 때 수행할 남은 검증이다. 같은 앨범과 테마에서 음악 소스 medium과 설정 half를 비교하고, 시트를 확장·축소하며 시스템 재질과 기존 임계점 전환의 충돌 여부까지 확인해야 한다.
