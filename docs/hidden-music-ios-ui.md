# 음악 숨기기 / 프리셋 편집 iOS UI 개선

## 분석과 변경 이유

기존 화면은 이미 설정 시트 내부의 Native Stack 헤더와 SwiftUI Form을 사용했다. 커스텀 헤더를 새로 만들지 않고 기존 내비게이션을 유지했다.

| 확인한 문제 | 반영한 변경 |
| --- | --- |
| 편집 중에도 헤더가 ‘음악 숨기기’, 완료 동작이 긴 본문 아래에 위치 | ‘새 프리셋’ / ‘프리셋 편집’ 제목과 네이티브 `Stack.Toolbar` 취소·저장. 저장만 완료 동작으로 강조 |
| 잠금·목록 상태·만들기·검색의 역할 혼합 | 개인정보 보호, 숨김 프리셋, 새 프리셋, 필요할 때만 상태 그룹으로 분리 |
| 모든 설정이 고정 다크 색상과 반투명 그룹 사용 | 두 화면만 공통 설정 컴포넌트의 `systemAppearance` 옵션 사용. SwiftUI Form/Section 기본 배경·모서리·구분선 및 앱의 라이트/다크 모드 반영 |
| 빈 목록에서도 검색 노출 | 빈 화면 안내와 만들기 동작 표시, 목록이 있을 때만 검색 표시 |
| SDK 58 DisclosureGroup이 기본으로 모두 펼쳐져 목록이 지나치게 길어짐 | 펼침 상태를 명시적으로 관리, 처음에는 접기. 적용 중 상태를 제목에 표시 |
| 이름 레이블/플레이스홀더 중복 | 그룹 제목은 ‘프리셋 이름’, 입력 예시는 ‘예: 개인 음악’. 접근성 레이블은 유지 |
| 폴더/곡 선택, 검색, 결과, 저장이 한 그룹에 혼합 | 이름, 선택 대상, 목록 필터, 결과, 선택 요약으로 분리. 폴더/곡은 네이티브 segmented Picker |
| 항목 선택용 Switch와 하위 폴더 동작의 구분이 약함 | 선택은 체크 표시, 펼치기는 별도 44pt 이상 버튼. 각각 독립 동작 유지 |
| 전체 경로를 단일 레이블로 표시 | 이름과 경로를 분리하고 들여쓰기 및 `›` 경로 표시. 긴 텍스트는 줄바꿈, 전체 경로와 선택/상위 폴더 포함 상태는 접근성 레이블로 제공 |

일반 그룹에는 Glass 효과, 임의의 모서리 반경·행 높이·그림자를 추가하지 않았다. 내비게이션과 저장은 OS의 네이티브 컨트롤을 사용한다. 행의 최소 44pt는 터치 영역을 위한 값이며, 텍스트가 커지면 행은 늘어난다. 글꼴은 SwiftUI의 body/caption/footnote 등 의미 기반 스타일을 사용한다.

## 기능 보존

`usePresetManager`, `usePresetEditor`, 폴더 트리/숨김 규칙, 저장소, 생체 인증 및 화면 이탈 시 잠금 로직은 변경하지 않았다. 저장 성공 후에만 편집을 닫는 기존 흐름과 취소 시 초안을 버리는 기존 동작을 유지했다. 프리셋 다중 적용·검색·삭제, 폴더 전체/개별 곡 선택, 상위 폴더에 의한 숨김, 검색 중 계층 표시, 100개 표시 제한도 유지한다.

Android 화면의 렌더링과 동작은 변경하지 않았다. 공통 설정 UI와 잠금 게이트의 `.tsx` 파일에는 iOS에서 사용할 선택적 prop 타입만 추가했으며, Android 렌더링은 기존 구현 그대로다. 음악 숨기기의 인증 대기 화면에도 같은 시스템 색상 옵션을 전달하되 인증 조건과 동작은 유지했다. 기존 다른 설정 화면의 `systemAppearance` 기본값은 false여서 기존 디자인을 유지한다.

## 검증 결과

- `pnpm exec expo lint`, `pnpm exec tsc --noEmit` 통과.
- iOS/Android 프로덕션 번들 export 통과 (`/tmp/yeongdu-hidden-ui-final-export`).
- `check-hidden-music-ios-ui.cjs`: 네이티브 헤더/저장, 빈 목록/검색, 펼침과 선택의 독립성, 검색/선택 필터, 긴 경로, 저장 payload와 초안 불변성, 취소, busy 상태 통과.
- `check-native-settings.cjs`, `check-ios-settings-controls.cjs`: 공통 Form/Section의 기존 기본값, 새 시스템 그룹 옵션, 기존 컨트롤 및 잠금 화면 연결 검사 통과.
- `check-hidden-music.cjs`, `check-folder-tree.cjs`, `check-hidden-feature-access.cjs`, `check-hidden-playlists.cjs`, `check-quick-hide.cjs` 통과. 생체 인증/저장소 네이티브 경계는 mock 기반 검사다.
- 기존 로그인과 숨김 기능 진입 회귀 검사 `check-connect-screen.cjs`, `check-ios-hidden-feature-entry.cjs`도 통과.

### 실제 렌더링 확인

설치된 iPhone 18 Pro / iOS 27.0 Simulator에서 실제 SwiftUI 및 Native Stack 컴포넌트를 렌더링했다. iOS 26 런타임은 설치되어 있지 않았다. SDK 58의 기존 Simulator 바이너리에 현재 UI 번들을 넣은 별도 식별자의 미리보기 앱을 사용했다. NAS/사용자 데이터 대신 예제 프리셋과 130개 곡을 사용했고, 긴 경로 확인을 위해 미리보기에서만 폴더를 펼쳤다. 원본 앱의 인증 게이트를 우회하거나 사용자 데이터를 변경하지 않았다. 새 네이티브 Xcode 빌드 및 실제 NAS 연결 전체 흐름을 검증한 것은 아니다.

라이트/다크의 그룹 여백·구분선·Switch 정렬·입력 가독성·긴 경로·선택 표시를 확인했다. 접근성 글자 크기 `accessibility-extra-large`에서 본문·설명·토글 레이블이 늘어나고 줄바꿈되는 것을 확인했다. 검증 중 보이지 않는 펼침 아이콘과 다크 모드 취소 버튼의 대비 문제를 발견하여 수정했다.

최종 화면 캡처:

- [편집 — 라이트](verification/hidden-music-ios/editor-light.png)
- [편집 — 다크](verification/hidden-music-ios/editor-dark.png)
- [빈 프리셋](verification/hidden-music-ios/empty.png)

큰 글자 확인 원본은 `/tmp/yeongdu-hidden-ui-preview/large-stable.png`에 있다. 최종 아이콘/취소 색상 수정 전의 캡처여서 최종 디자인 이미지에는 포함하지 않았다.

### 남은 실제 기기 확인

Simulator 앱 GUI가 설치되어 있지 않아 직접 터치/VoiceOver 조작을 할 수 없었다. 키보드 포커스와 첫 사용 안내창은 확인했으나 안내창이 소프트 키보드를 가려 키보드 열린 상태의 스크롤/저장 터치 전체 흐름은 검증하지 못했다. 실제 iOS 26 기기에서 설정 시트 내 뒤로 가기·닫기·스와이프, 저장/취소 후 헤더 복원, 키보드와 Safe Area, 긴 목록 스크롤, VoiceOver 읽기 순서 및 실제 생체 인증을 추가 확인해야 한다. 미리보기의 예제 데이터와 인증/저장 mock 검사는 이 확인을 대체하지 않는다.

## 확인한 공식 문서

- [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/)
- [Expo Router Stack / Toolbar](https://docs.expo.dev/router/advanced/stack/)
- [Expo UI Button](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/button/)
- [Expo UI Picker](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/picker/)
- [Apple HIG Settings](https://developer.apple.com/design/human-interface-guidelines/settings)
