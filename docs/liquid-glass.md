# Liquid Glass 적용 결과

2026-11-10 작업. 기존 Glass 구현을 SDK 58의 실제 설치 API와 대조하고, 탭 액세서리의 상태 소유권·접근성·플레이어 보조 컨트롤을 보완했다.

설정·음악 소스는 후속 작업에서 실제 SwiftUI Form·List·Picker·BottomSheet와 UIKit 스위치로 전환했다. 현재 범위와 호환 경계는 [iOS 기본 프레임워크 사용](ios-native-ui.md)에 정리한다.

## 확인한 프로젝트 구조

| 항목 | 현재 구조와 유지 범위 |
| --- | --- |
| 설치 버전 | Expo 58.0.23, React Native 0.88.1, Expo Router 58.0.30, expo-glass-effect 58.0.5, react-native-screens 4.30.1 |
| 패키지 관리 | pnpm, hoisted node_modules, pnpm-lock.yaml 및 등록된 오디오·마스크 패치 유지 |
| 네이티브 환경 | 기존 ios 프로젝트·Pods 있음, Xcode 27.2. android 프로젝트와 Android SDK는 이 환경에 없음 |
| 라우트 | 루트 Stack 안에 (tabs), 별도 player 모달, 설정·연결·숨김 음악 화면. 보관함·플레이리스트는 각각 내부 Stack, 검색은 단일 화면 |
| 탭 | 보관함·플레이리스트·검색. 저장된 순서·숨김 설정 및 숨긴 선택 탭 복구 유지. 넓은 iPad 화면은 기존 사이드바 유지 |
| 음악 탐색 | 보관함 페이지·앨범·아티스트·플레이리스트·검색 결과는 FlatList. 대규모 목록의 가상화·캐시·페이지 상태 유지 |
| 재생 | services/playback/controller.ts가 전역 엔진 하나를 지연 생성하고 상태 이벤트를 연결. stores/playback.ts의 Zustand 상태를 모든 재생 UI가 공유 |
| 복구·백그라운드 | 루트 usePlaybackRecovery 및 기존 audio-engine·persistence·expo-audio 패치가 담당. 이 작업에서 수정하지 않음 |
| Provider·저장소 | Synology, Google Drive, 기타 Provider·오프라인 캐시·인증·저장 스키마 유지 |
| 테마 | useColors/useAppColorScheme, 사용자 색상 설정, 루트 ThemeProvider 유지. 플레이어는 기존 표지 기반 어두운 배경 유지 |
| 화면 여백 | NativeTabFrame의 UIKit 측정 Safe Area와 기존 TabBarInsetContext 사용. 키보드 표시 시 탭·액세서리 숨김 유지 |

## 실제 변경

### 네이티브 하단 탭과 미니 플레이어

- 기존 NativeTabs 채택을 유지하고 SDK 58 정식 진입점인 `expo-router/native-tabs`로 변경했다. SF Symbols·앱 강조색·메뉴 이름·순서·숨김 설정은 유지한다.
- iPhone은 `NativeTabs.BottomAccessory`가 배경과 위치를 소유한다. 별도 GlassView나 BlurView를 겹치지 않는다.
- `NativeMiniPlayer`가 `BottomAccessory.usePlacement()`를 읽는다. Regular는 표지·제목·아티스트·재생/일시정지·다음 곡을 표시한다. Inline은 작은 표지·한 줄 제목·재생/일시정지만 표시한다.
- 두 액세서리 인스턴스에 전달할 곡·재생·버퍼링 상태는 SystemTabs에서 읽는다. 액세서리에는 독립적인 재생 상태, 오디오 엔진, 재생 이벤트 구독, 타이머를 만들지 않는다.
- 네이티브 액세서리는 정적인 한 줄 제목을 사용해 두 인스턴스에서 마키 애니메이션과 AppState 구독이 중복 실행되지 않게 했다. 독립형 미니 플레이어의 기존 마키는 유지한다.
- 재생 버튼을 전체 화면 열기 버튼의 형제 요소로 분리했다. 터치가 재생과 화면 열기를 동시에 실행하지 않게 한다. 위로 스와이프해서 플레이어를 여는 동작도 유지한다.
- 큰 글자에서는 네이티브 액세서리의 아티스트 줄을 생략한다. 고정 높이 안에서 제목 배율은 최대 1.4, 아티스트는 1.3으로 제한하며 VoiceOver는 전체 제목과 아티스트를 읽는다. 전체 플레이어의 글자 설정은 유지한다.
- iOS 목록의 마지막 항목과 스크롤 표시기는 측정된 하단 여백 위에 도달하도록 보완했다. 기존 목록 여백이 더 크면 보존한다. Android 목록에는 이 보정을 적용하지 않는다.

### 전체 화면 플레이어

- iOS 전체 재생 화면의 닫기·가사·대기열·더보기 버튼은 배경 없는 아이콘으로 표시한다. 해당 컨트롤에는 GlassView나 불투명한 원형 바탕을 두지 않으며 44pt 터치 영역과 접근성 상태를 유지한다.
- iOS 더보기는 원 없는 점 세 개 아이콘을 사용한다. Android의 기존 아이콘과 배치는 유지한다.
- 표지·곡 정보·슬라이더·주 재생 버튼에는 유리 카드를 추가하지 않았다. 앨범 아트 색상, 제스처, 셔플·반복·대기열 액션과 재생 애니메이션은 유지했다.
- iOS 보조 재생 버튼에 44pt 터치 영역, VoiceOver 역할·선택 상태·버퍼링 상태와 한국어 반복 모드 안내를 보완했다.

### 검색·메뉴·설정

- 검색 입력창에 명시적인 접근성 이름을 추가했다. 기존 디바운스·Provider 조회·결과 FlatList·지우기 버튼·키보드 처리를 유지한다.
- 네이티브 검색 역할은 검토했지만 적용하지 않았다. `role="search"`는 검색 탭을 별도로 배치하며, 현재 사용자가 지정하는 메뉴 순서를 그대로 유지하기 어렵다. 네이티브 검색 필드 도입에 필요한 검색 Stack 재구성도 이번 변경에 포함하지 않았다.
- 기존 작업 메뉴는 비동기 오류 표시·비활성 작업·편집기 연결을 제공한다. 재생 메뉴는 수면 타이머·배속·구간 반복 등 내부 화면을 포함한다. 이를 단순 시스템 ActionSheet로 바꾸지 않고 기존 메뉴와 선택적인 Glass 배경을 유지했다.
- 설정·연결·편집 화면과 기존 네이티브 Modal/Alert 사용을 유지했다. 서버·계정 입력 및 인증 흐름에는 변경이 없다.
- 효과 설정에 시스템 탭/통합 액세서리와 앱이 직접 그리는 표면의 차이를 안내했다. 저장된 영역별 설정과 강도는 그대로 유지한다.

## 채택하지 않은 동작과 이유

`minimizeBehavior="onScrollDown"` API는 설치된 버전에 존재하지만, [공식 Native Tabs 문서의 FlatList 제약](https://docs.expo.dev/router/advanced/native-tabs/#known-limitations)에 따라 현재 목록에서 축소·탭 재선택 스크롤을 보장할 수 없다. `minimizeBehavior="never"`와 기존 가상화 목록을 유지한다. 스크롤 좌표로 UIKit 축소를 흉내 내거나 목록을 ScrollView로 바꾸지 않았다.

따라서 **Inline UI 구현과 상태 연결은 회귀 검사로 검증했지만, 제품에서는 스크롤에 의한 Regular → Inline 전환을 활성화하지 않았다.** 현재 탐색 구조에서 Apple Music과 동일한 자동 축소 동작은 제공하지 않는다.

iOS 26 이상에서 `backgroundColor`, `blurEffect`, `disableTransparentOnScrollEdge`는 시스템 탭 바 배경을 제어하지 못한다. 무효한 배경색·블러 설정은 제거했다. 시스템 재질은 iOS 손쉬운 사용과 시스템 Liquid Glass 설정이 관리한다. 앱 효과 스위치 때문에 navigator를 교체하지 않으므로 검색 입력과 탐색 상태가 유지된다.

## 플랫폼·접근성·의존성

- iOS 26 이상: 기존 OS 버전, `isGlassEffectAPIAvailable()`, `isLiquidGlassAvailable()` 검사 통과 시 네이티브 탭과 Glass를 사용한다.
- 구형 iOS 또는 미지원 빌드: 기존 JavaScript 탭과 독립형 미니 플레이어를 사용한다. 구형 OS에서는 Glass API 호출을 단락 평가로 건너뛴다.
- Android: 기존 JavaScript 탭·사이드바·독립형 미니 플레이어·블러·색상 유지. 네이티브 Glass와 NativeTabs의 import는 `.ios.tsx`에만 둔다.
- 투명도 줄이기: 기존 전역 접근성 구독이 앱의 유리 효과를 즉시 해제한다. 시스템 탭과 액세서리는 UIKit이 설정에 대응한다.
- 동작 줄이기: 독립형 미니 플레이어의 진입 애니메이션도 생략하도록 보완했다. 기존 마키의 Reduce Motion 처리와 Reanimated의 시스템 설정 대응을 유지한다.
- 유리와 부모의 opacity를 낮추지 않으며, `clear` 재질이나 여러 Blur/Glass 배경을 추가하지 않았다.
- 추가·변경한 의존성은 없다. 작업 시작 전 존재하던 package.json·잠금파일·오디오 패치·아이콘 등의 사용자 변경을 보존했다.
- 이 변경 자체에는 새 네이티브 모듈이나 config plugin이 없다. 현재 SDK 58 모듈이 포함된 개발 빌드에는 JS 변경으로 적용할 수 있다. 이전 SDK/Glass 미포함 앱에는 네이티브 재빌드가 필요하며 OTA만으로 모듈을 추가할 수 없다.

## 주요 파일

- src/components/platform-tabs.ios.tsx: 정식 API 진입점, UIKit 액세서리 배치, 부모 소유 상태.
- src/components/mini-player-content.tsx: 공유 표시 내용과 사용자 조작. 네이티브 배치에는 상태 구독 없음.
- src/components/mini-player.tsx: Android·구형 iOS·넓은 iPad의 기존 독립형 표면과 진입 효과.
- src/components/tab-scroll-edge-fade.tsx: 측정된 하단 여백에 따른 마지막 항목 접근성.
- src/features/playback/player-header.tsx, player-song-details.tsx, player-transport-controls.tsx: 배경 없는 iOS 보조 버튼과 접근성.
- src/features/settings/blur-settings.tsx: 시스템 효과와 앱 효과 설정 안내.
- src/app/(tabs)/search.tsx: 검색 입력 접근성 이름.
- scripts/check-mini-player-content.cjs 및 기존 네이티브 탭·블러·마키·스크롤 검사: 회귀 검사.

## 검증 결과

| 검사 | 결과 |
| --- | --- |
| TypeScript, ESLint | 통과 |
| 기존 및 추가 check-* 스크립트 | 총 87개 중 최초 85개 통과. 오프라인 새 설치 검사를 온라인으로 재실행해 통과했으므로 최종 86개 통과, Android JVM 검사 1개는 실행 환경 부족 |
| UI 회귀 검사 | 두 액세서리의 동일 상태·단일 재생 명령·다음 곡·재생/열기 터치 분리·확대 글자·버퍼링·배경 없는 플레이어 버튼·측정 여백 검사 통과. 네이티브 뷰는 모의 처리 |
| Expo install --check | 온라인 검사 통과, 의존성 최신 호환 상태 |
| Expo Doctor 1.21.6 | 20/20 통과 |
| iOS / Android production bundle | 최종 소스맵과 수정 파일 일치 확인. Android에 앱의 iOS NativeTabs·GlassBackdrop 및 expo-glass-effect의 iOS 구현이 포함되지 않음. Expo Router가 가져오는 안전한 View/false 폴백은 포함됨 |
| 임시 복사본의 fresh install | pnpm install --frozen-lockfile 성공, 양쪽 production bundle와 타입 검사 통과. 패치 대상 15개 파일이 원본 node_modules와 정확히 일치 |
| iOS 네이티브 빌드 | Xcode 27.2, iPhone iOS 27.0 Simulator 대상 최종 Release 빌드·설치·프로세스 실행 성공. 화면별 동작 확인 및 서명·IPA 배포 없음 |
| Android 네이티브 빌드 / JVM 검사 | Android SDK와 Kotlin 2.1.20 컴파일러 캐시 부재로 미실행. Android JS 번들은 통과 |
| 시뮬레이터 화면 / 실기기 | 화면 제어 도구가 Simulator 앱에 연결되지 않고 Xcode 접근도 timeout되어 시각·터치·실제 스트리밍 미검증. 실기기 확인은 아래 항목 필요 |

빌드 로그는 `/tmp/yeongdu-liquid-glass-xcode.log`, 번들·소스맵은 `/tmp/yeongdu-liquid-glass-final`, 개별 검사 출력은 `/tmp/yeongdu-liquid-glass-checks.json`, 온라인 새 설치 검사 로그는 `/tmp/yeongdu-liquid-glass-clean-export.log`에 있다. 임시 경로는 정리될 수 있다. 모의 검사·번들·컴파일 성공을 네이티브 화면이나 실기기 기능 검증으로 해석하지 않는다.

## 실기기에서 확인할 항목

1. iOS 26 이상: 밝고 어두운 표지·긴 제목·확대 글자에서 Regular 액세서리와 플레이어 보조 버튼의 대비·잘림·터치 영역.
2. 음악 재생 중 보관함 → 앨범 → 검색 → 플레이리스트 전환, 미니/전체 재생 상태·다음 곡·슬라이더 동기화.
3. 목록 끝까지 스크롤, 회전, 작은 iPhone·넓은 iPad에서 마지막 곡과 플로팅 UI가 겹치지 않는지 확인.
4. 검색 중 키보드 표시·해제, 검색 내용 유지, 메뉴 순서·숨김 변경 후 적절한 탭 복구.
5. 라이트/다크·사용자 색상, 투명도 줄이기·동작 줄이기·VoiceOver와 큰 글자 설정.
6. 백그라운드·잠금·앱 재진입 후 NAS/Drive 등 실제 스트리밍·오프라인 재생·잠금 화면 조작·네트워크 복구.
7. 지원 범위의 구형 iOS와 Android에서 기존 탭·미니 플레이어·메뉴·Provider 로그인 및 재생.

## 공식 근거

- [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/)
- [Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials): 유리는 콘텐츠보다 기능·탐색 계층에 제한하고 regular를 기본으로 사용.
- [Apple Tab Bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars): 탐색 구조, SF Symbols, 액세서리와 검색 탭.
- [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass): 시스템 컴포넌트 우선·과도한 효과 회피·접근성 검증.
- [Expo SDK 58 GlassEffect](https://docs.expo.dev/versions/v58.0.0/sdk/glass-effect/): 가용성 검사, 플랫폼 폴백, opacity 제약.
- [Expo Native Tabs](https://docs.expo.dev/router/advanced/native-tabs/): SDK 58 정식 import, 두 액세서리 인스턴스와 외부 상태, FlatList 제약, 시스템 배경 제약.
