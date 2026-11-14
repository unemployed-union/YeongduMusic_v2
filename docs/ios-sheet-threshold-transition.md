# iOS 설정 시트: 임계점 기반 재질 전환

> **현재 구현:** [시스템 기본 시트 복원](ios-system-sheet-restoration.md)을 적용했다. 아래 커스텀 driver 설명은 과거 실험 기록이며 현재 실행 코드에서는 제거했다.


> 그룹 배경의 현재 연결 상태와 음악 소스 비교는 [후속 그룹 배경 분석](ios-settings-group-background.md)을 기준으로 확인한다. 후속 수정은 공통 Section의 배경 연결만 적용하며 이 문서의 시트 전환 코드는 변경하지 않는다.

2026-11-14 · `experiment/ios-settings-truesheet4`

이전의 높이 비례 opacity 보간을 제거하고, 실제 표시 높이가 최대 content detent의 **85% 이상이면 불투명**, **78% 미만이면 반투명**으로 전환하도록 변경했다. 78~85% 구간에서는 이전 상태를 유지한다. 상태가 바뀔 때만 200ms UIKit 애니메이션을 실행한다. 수치는 `modules/yeongdu-sheet-background/ios/SheetAppearancePolicy.swift`에 모았다.

## 재질과 콘텐츠 분리

- 기존 Expo Router formSheet / `[0.5, 1]` / 네이티브 모서리·grabber·제스처·내부 Stack·헤더 버튼을 유지한다. 새로운 Bottom Sheet 라이브러리는 없다.
- 설치된 Expo 58.0.23, Router 58.0.30, RN 0.88.1, RNScreens 4.30.1, Expo UI 58.0.27, expo-glass-effect 58.0.5를 기준으로 구현했다.
- 바깥/안쪽 Stack의 contentStyle과 RN 래퍼는 투명하다. 헤더는 기존 시스템 scroll-edge 동작을 유지하며, 별도 header blur를 중첩하지 않는다.
- List의 scroll 배경을 숨기는 것만으로는 Section/행의 기본 불투명 표면이 남았다. 공개 Expo UI `ViewModifierRegistry` / `createModifier`로 **SwiftUI listRowBackground 슬롯만** 교체한다. Section, RN 편집 행의 Group, native 콘텐츠 Group에 같은 modifier를 사용한다. 텍스트·입력·아이콘·액션·선택 상태는 그대로다.
- 그룹에는 `UIVisualEffectView`의 시스템 thin Material을 사용한다. 모든 행에 GlassView를 추가하지 않는다. 기존 insetGrouped List가 모서리와 구분선을 계속 관리한다. 불투명 상태에는 `secondarySystemGroupedBackground` 색상 레이어가 덮인다.
- 시트 바탕에는 명시적인 `UIVisualEffectView`와 `UIGlassEffect(.regular)`를 사용한다. 기기 빌드에서도 Glass view의 alpha는 1이며 내용이 들어가지 않는다. 그 위의 `systemGroupedBackground` 색상 레이어만 애니메이션한다. Glass 스타일 none만으로 불투명해진다고 가정하지 않는다.
- `sheet.backgroundEffect = UIGlassEffect`를 직접 지정한 초기 후보는 실제 녹화에서 시트 바탕이 거의 투명하게 나와 채택하지 않았다. 최종 구현은 기본 재질의 독립적인 높이별 전환을 빈 effect로 억제하고, 컨트롤러 내부의 명시적인 Glass 배경을 사용한다. UIView 전체나 Glass view를 opacity 0으로 만들지 않는다.
- Light/Dark는 기존 앱 테마를 전달한다. Sheet overrideTraitCollection은 이 설정 시트에만 적용하고 소유한 설정을 해제할 때 복원한다. 기존 어두운/밝은 시스템 grouped 색상 역할을 유지한다.

## 실제 위치 관찰과 애니메이션

Router의 detent 완료 이벤트를 중간 드래그 위치로 사용하지 않는다. 기존 로컬 Expo 모듈이 UIKit의 공개 `presentedView.layer.presentation().bounds.height`를 CADisplayLink에서 관찰한다. 원래 detent resolver와 identifier는 보존한다. UIKit이 드래그·snap·dismiss와 스크롤을 계속 소유한다.

비율은 `(실제 표시 높이 - 고정 Safe Area 보정) / 원래 최대 detent 높이`다. 전체 detent 구간을 0~1로 보간한 값이 아니다. 초기 model bounds가 하단 detent 높이와 같아질 때까지 기다리는 방식은 첫 드래그를 놓칠 수 있어 제거했다. 표시 프레임과 공개 Safe Area로 attachment를 한 번 구하고, container 크기가 바뀌면 다시 구한다. 이동 중 가장자리 판정으로 보정값을 바꾸지 않는다. iPad/회전의 실제 렌더링은 별도 확인이 필요하다.

같은 sheet controller에 속한 시트·그룹 색상 레이어를 weak registry로 모아 하나의 `UIViewPropertyAnimator`가 함께 전환한다. 임계점 진입 시만 상태가 바뀌며 React 렌더/JS 업데이트는 없다. 반대 상태 요청이 오면 현재 animator를 `stopAnimation(false)` / `finishAnimation(at: .current)`로 현재 표시 값에 정착한 뒤 반대 방향의 200ms 애니메이션을 시작한다. 나중에 나타나는 가상화 행도 현재 상태에 합류한다. 마지막 배경이 분리되면 상태와 animator를 정리한다.

Reduce Transparency는 처음 표시할 때부터 불투명하게 처리하고 애니메이션을 생략한다. Reduce Motion도 색상 전환을 즉시 완료한다. 실제 OS 접근성 설정 조작은 미검증이며, 정책 검사와 코드 경로 확인을 구분한다.

## 호환성과 변경 범위

새 native capability `supportsThresholdSurfaces`가 있는 iOS 26.1+ 바이너리에서만 활성화한다. 예전 연속 보간 모듈이 들어 있는 바이너리, Expo Go, 낮은 iOS 버전에서는 새 modifier를 요구하지 않고 기존 기본 화면으로 돌아간다. Android는 기존 passthrough를 유지한다. ExpoUI는 이미 설치된 패키지이며 로컬 podspec에 공개 의존성만 추가했다. node_modules나 생성된 iOS 소스를 직접 수정하지 않았다.

수정 범위는 로컬 sheet 모듈, settings-sheet-background 바인딩, 공통 SettingsPage/Section/Row 배경과 관련 검사다. 라우팅·데이터 형식·인증·보안·저장·재생 기능과 package.json/lockfile은 변경하지 않는다. 새 native 빌드가 필요하며 EAS 업로드·배포·제출은 하지 않았다.

## 검증 자료

최종 검사 상태와 영상은 [검증 결과](verification/sheet-threshold/results.json)를 기준으로 확인한다. 이전 [연속 보간 보고서](ios-sheet-background-motion.md)와 그 영상은 이전 구현의 기록이다.

- [다크 실제 드래그 영상](verification/sheet-threshold/dark.mp4) · [라이트 실제 드래그 영상](verification/sheet-threshold/light.mp4)
- [200ms 전환 세부 프레임](verification/sheet-threshold/transition-frames-30fps.png) · [다크 전체 흐름](verification/sheet-threshold/dark-frames.png) · [라이트/그룹 재질](verification/sheet-threshold/light-frames.png)
- [최종 native 전환·반전 로그](verification/sheet-threshold/native-transitions.log) · [소스 회귀 결과](verification/sheet-threshold/regressions.json)

최종 Release Simulator 빌드, lint와 타입 검사, 소스 회귀 11/11, Swift 임계점 정책 검사가 통과했다. iPhone 18 Pro / iOS 27.0의 별도 QA Simulator에서 다크 4개·라이트 2개 XCTest 시나리오가 실패 없이 끝났다. 실제 녹화에서 그룹과 시트 배경이 함께 짧게 전환되는 것을 확인했다. 전환 세부 프레임은 약 33ms 간격으로 원본 영상에서 추출했다. 공유용 MP4는 실제 녹화의 준비 시간을 잘라 압축했으며 움직임을 합성하지 않았다.

native 로그에는 0.81 부근의 반투명 유지와 0.83 부근의 불투명 유지가 각각 기록됐다. 반전 renderer probe는 `before=0.3530 → after=0.3530 → nextFrame=0.3505 → settled=0`을 기록했다. 이 값과 임계점 상태를 검증 결과 생성 시 assertion으로 확인했다. 단, 실제 손가락이 전환 중 되돌아가는 동작은 여전히 실기기 확인 대상으로 구분한다.


- XCTest는 별도 QA Simulator의 실제 앱 버튼과 grabber를 조작한다. 첫 드래그로 직접 확장, 임계점 아래/위의 느린 드래그와 2초 정지, 히스테리시스 구간, flick, 확장 후 스크롤, 클라우드 연결 진입/뒤로, X 닫기와 3회 재열기를 확인한다.
- 광학 비교용 색상 배경은 Simulator process 환경 변수로만 켜진다. 실제 앱의 시트·목록이며 데이터는 빈 별도 QA Simulator다. 기기 빌드에는 fixture와 진단/probe가 들어가지 않는다.
- 전환 반전 probe는 실제 앱 창의 UIViewPropertyAnimator를 시작한 뒤 80ms에 반대 상태를 요청해 현재/다음 프레임 alpha를 기록하는 별도의 renderer 검사다. 실제 손가락의 한 제스처 안 방향 반전과 동일한 검증으로 간주하지 않는다. 손을 떼지 않은 방향 반전은 실기기 확인이 남는다.
- 처음 시도한 독립 XCTest runner의 UIKit 검사는 표시 창이 없어 presentation layer를 읽지 못했다. 해당 검사는 제거했고 성공으로 집계하지 않았다. probe의 XCTest 버튼 assertion과 실제 native 로그 검증도 구분한다.
- Simulator의 기존 Keychain/연결 오류가 화면에 보인다. NAS 연결·저장·음악 재생 성공을 검증했다는 뜻은 아니다.

실기기에서는 임계점 직전 멈춤 → 위로 넘어 200ms 전환 → 78~85% 구간에서 유지 → 78% 아래로 복귀 → 애니메이션 도중 손가락 방향 반전 → flick과 목록 스크롤을 확인해야 한다. 두 테마, Reduce Motion/Transparency, iOS 26.1 및 iPad·회전·키보드도 남은 확인 항목이다. 최종 수정본은 실기기에 설치하지 않았다.

## 공식 API

- [Expo SDK 58 GlassEffect](https://docs.expo.dev/versions/v58.0.0/sdk/glass-effect/) — clear/regular/none과 animate/animationDuration을 검토했다. 기존 UIKit 시트와 SwiftUI List를 유지하기 위해 JS GlassView 대신 같은 native effect를 사용한다.
- [Expo UI 공개 custom modifier 확장](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/extending/)
- [UIViewPropertyAnimator](https://developer.apple.com/documentation/uikit/uiviewpropertyanimator), [현재 위치에서 animation 완료](https://developer.apple.com/documentation/uikit/uiviewanimating/finishanimation(at:))
- [CALayer presentation](https://developer.apple.com/documentation/quartzcore/calayer/presentation()) — 표시 중 상태의 근사값이라는 공개 API의 한계를 그대로 따른다. UIKit 비공개 subview/gesture API나 임의의 scroll offset·타이머로 높이를 추측하지 않는다.
