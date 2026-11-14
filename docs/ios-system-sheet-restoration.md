# 설정 시트의 시스템 기본 재질 복원

> 이 문서는 2026-11-14의 복원 기록이다. 이후 List backing만 숨겨 네이티브 전환을 노출한 최소 수정과 실기기 확인은 [2026-11-15 검증](ios-native-sheet-transition.md)에 기록했다.

2026-11-14 · `experiment/ios-settings-truesheet4`

설정 시트가 음악 소스처럼 **시스템 기본 sheet 효과와 SwiftUI insetGrouped List/Section 배경**을 사용하도록 복원했다. 커스텀 효과를 끈 실제 앱의 결과를 먼저 확인한 뒤, 별도 애니메이션을 다시 추가하지 않고 기존 driver와 그룹 Material을 실행 코드에서 제거했다. 음악 소스는 수정하지 않았다.

## 보존 후 변경

작업 시작 당시 미커밋 변경 파일 98개를 [복구 압축 파일](verification/system-sheet-restore/rollback/before-system-restore.tar.gz)에 보존했다. tar 내부의 모든 파일을 [manifest](verification/system-sheet-restore/rollback/manifest.json)의 SHA-256과 대조했다. 기존 tracked diff와 git 상태도 같은 디렉터리에 있다. 자동 커밋이나 기존 작업 초기화는 하지 않았다.

| 변경 위치 | 내용 |
| --- | --- |
| `src/app/(settings)/_layout.tsx` | 기존 SettingsNavigator를 직접 렌더링. 네이티브 배경 anchor를 마운트하지 않음 |
| `src/features/settings/settings-ui.ios.tsx` | custom Section modifier와 List의 scrollContentBackground(hidden) 제거. 기존 행·footer·RN 편집 컴포넌트 유지 |
| `src/features/settings/settings-sheet-background*.tsx` | 사용하지 않는 native 바인딩과 다른 플랫폼 passthrough 제거 |
| `modules/yeongdu-sheet-background/` | 빈 UIVisualEffect 대체, 별도 Glass backdrop, systemThinMaterial 그룹, 불투명 덮개, display-link 관찰, 85%/78%·200ms driver 제거. 원본은 복구본에 보존 |
| `scripts/check-native-settings.cjs`, `check-native-sheet-background.cjs` | 기존 액션/편집 행 보존 및 이전 background driver가 로드되지 않는 경계 확인 |
| `scripts/ios-sheet-qa/SheetUITests.swift` | 시스템 시트의 드래그/탐색과 음악 소스 참조 검사 유지. 폐기한 임계점·baseline·반전 probe 테스트 정리 |

로컬 `pod install`로 생성된 네이티브 연결을 갱신했고, `Removing YeongduSheetBackground` 및 Podfile.lock/Manifest.lock의 모듈 제거를 확인했다. `ios/` 프로젝트나 `node_modules` 파일을 직접 편집하지 않았다. package.json과 pnpm lockfile은 바꾸지 않았다.

## 동일한 기본 배경 생성 방식

두 화면은 설치된 동일한 `@expo/ui`의 SwiftUI List/Section을 사용하고, List 스타일은 insetGrouped다. 이제 설정도 다음 항목을 지정하지 않는다.

- 그룹/행의 listRowBackground 또는 별도 Material.
- scrollContentBackground(hidden), backgroundStyle, presentationBackground.
- sheet/detent의 backgroundEffect 대체, 색상 덮개, Glass tint나 콘텐츠 opacity.

설정은 기존 Router UIKit formSheet와 내부 Native Stack을 유지하며, 음악 소스는 기존 SwiftUI BottomSheet/NavigationStack을 유지한다. **전체 View 계층을 똑같이 바꾼 것이 아니라, 배경을 생성하는 기본 List/Section과 시스템 sheet의 관리 경로를 복원했다.** 표시되는 표면의 세부 합성은 iOS가 결정한다. 내부 기본 재질을 임의의 Blur 스타일로 추정해 복제하지 않았다. [Expo SDK 58 List](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/list/), [BottomSheet](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/bottomsheet/).

사용자 강조색, 텍스트와 아이콘, 행 구성, 설정 저장소·인증·재생 코드는 변경하지 않았다. 설정 presentation의 `[0.5, 1]`, grabber, 스크롤 확장, 닫기/뒤로와 헤더 설정도 유지했다. 다른 플랫폼의 설정 렌더링 소스는 그대로다.

## 먼저 확인한 시스템 기본 동작

모듈 정리 전에 기존 Release 앱의 Simulator 전용 baseline 경로로 시스템 sheet 효과를 유지하고, List/Section override를 끈 상태를 검사했다. 이 비교 경로의 native anchor는 배경색 fixture만 표시하며 시트 효과나 드래그 애니메이션을 대체하지 않는다.

- [색상 배경 위 축소 상태](verification/system-sheet-restore/system-baseline-contrast-09-reopened-half-2.png): 그룹 내부에도 뒤쪽 색상이 반영됨.
- [같은 경로의 확장 상태](verification/system-sheet-restore/system-baseline-contrast-03-expanded.png): 시스템의 불투명 표면으로 전환됨.
- [실제 드래그 녹화](verification/system-sheet-restore/system-baseline-contrast-drag.mp4): 준비 시간을 잘라 압축한 실제 Simulator 녹화. 합성한 애니메이션이 아님.

이 결과를 근거로 custom driver를 정리했다. 85%/78% 임계점이나 200ms를 유지하려는 새 레이어를 넣지 않았다. **전환 시점과 애니메이션은 iOS 기본 동작에 맡긴다.** 손가락 위치와 opacity의 선형 대응이나 Apple 지도와의 정확한 timing 일치를 주장하지 않는다.

## 최종 소스의 실제 앱 검증

네이티브 모듈을 완전히 제거한 최종 소스를 Release 빌드해 별도 `YeongduMusic Sheet QA` Simulator에 설치했다. 비교 앱이나 mock UI가 아니라 실제 YeongduMusic이다. 두 테스트에서 총 4개 XCTest가 통과했다.

| 실행 | 실제 조작 |
| --- | --- |
| 라이트 2개 / 다크 2개 | 천천히 위/아래 드래그와 중간 hold, 확장, 목록 스크롤, 클라우드 연결 진입/뒤로, 빠른 flick, 닫기/3회 재열기 |
| 각 테마의 참조 검사 | 실제 음악 소스 medium/large 열기·닫기 후 설정 half 열기·닫기 |

최종 캡처:

- 라이트: [음악 소스](verification/system-sheet-restore/light-reference-source-half.png) · [설정 half](verification/system-sheet-restore/light-09-reopened-half-2.png) · [설정 expanded](verification/system-sheet-restore/light-03-expanded.png)
- 다크: [음악 소스](verification/system-sheet-restore/dark-reference-source-half.png) · [설정 half](verification/system-sheet-restore/dark-09-reopened-half-2.png) · [설정 expanded](verification/system-sheet-restore/dark-03-expanded.png)
- [최종 앱의 드래그 녹화](verification/system-sheet-restore/final-light-drag.mp4)

정리 전 색상 fixture 검사는 **시스템 기본 경로**의 합성 확인이고, 최종 앱 검사는 fixture/native 모듈 없이 실행한 실제 앱의 검증이다. 둘을 동일한 빌드라고 표시하지 않았다. 최종 두 화면에서도 기본 그룹 표면을 확인했지만, 실제 앨범 아트 위에서 재질 강도가 픽셀 단위로 같은지 검증한 것은 아니다.

추가 검사: Release Simulator build, lint, 타입 검사, 기존 소스 회귀 검사 4종 통과. 소스 회귀 검사에서 native/network/storage 경계는 mock이며 실제 재질의 증거로 사용하지 않았다. 버전·원본 결과·보존 파일 해시·변경 목록은 [results.json](verification/system-sheet-restore/results.json)에 기록했다.

## 검증 범위

- 실제 실행 OS: iPhone 18 Pro Simulator / **iOS 27.0**. 설치된 런타임은 27.0·27.1뿐이며 **iOS 26 런타임과 실제 iPhone은 미검증**이다.
- NAS/클라우드 계정과 앨범 데이터가 없는 별도 QA 환경이다. 기존 Keychain/연결 오류가 화면에 보인다. 이번 변경의 인증·저장 실패로 판정하지 않았으며 실제 로그인/저장/재생 성공을 검증했다고 주장하지 않는다.
- iPad, 실제 앨범 배경, VoiceOver, Reduce Motion/Transparency의 실제 조작은 미검증이다. 시스템이 접근성 효과를 관리하도록 두었지만 이것이 실제 조작 검사를 대신하지는 않는다.
- 실기기 설치·클라우드 업로드·배포·제출은 수행하지 않았다.

다음 실기기 확인에서는 같은 앨범·테마에서 음악 소스 medium과 설정 half를 열어 비교하고, 천천히 확장/축소하면서 시스템 전환을 확인한다. 현재 기본 재질을 우선 유지하며, 문제를 재현한 증거 없이 custom opacity 애니메이션을 다시 추가하지 않는다.

## 복구

`rollback/restore-scope.txt`는 이번 작업으로 변경/제거한 기존 파일만 나열한다. 복구 파일을 우선 별도 디렉터리에 펼쳐 검토할 수 있다.

```sh
mkdir -p /tmp/yeongdu-before-system-restore
tar -xzf docs/verification/system-sheet-restore/rollback/before-system-restore.tar.gz \
  -C /tmp/yeongdu-before-system-restore
```

현재 소스를 작업 시작 상태로 실제 복구할 때는 이후 편집과 충돌 여부를 확인하고 아래 명령을 사용한다. 이 명령은 이번 작업에서 자동 실행하지 않았다.

```sh
tar -xzf docs/verification/system-sheet-restore/rollback/before-system-restore.tar.gz \
  -T docs/verification/system-sheet-restore/rollback/restore-scope.txt
cd ios
pod install
```

그 뒤 iOS 앱을 다시 빌드한다. 새 보고서와 검증 이미지 등은 복구 대상에 포함하지 않으며, 이전의 네이티브 모듈과 JS 바인딩은 함께 복구해야 한다. 참고용 과거 네이티브 비교 재현기는 [동결된 복사본](verification/system-sheet-restore/material-reference-reproducer/)에 보존했다. 이 디렉터리는 앱의 native 모듈 검색 경로에 포함되지 않는다.
