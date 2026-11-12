# iOS UI 감사 및 구현 기록

기준: 2026-11-12. Expo 58.0.23 / Router 58.0.30 / @expo/ui 58.0.27 / React Native 0.88.1.

기존 193개 미커밋 변경을 `/tmp/yeongdu-ios-ui-baseline-20261112`에 보존했다. 아래 평가는 코드 감사이며 실제 렌더링 확인은 별도 검증 절에 기록한다.

## 우선순위

- P0: 조작 불가, 화면 초과, 잘림, 상태/데이터 손실.
- P1: 대비, 접근성, 탐색, 설정 그룹과 주요 동작 배치.
- P2: 간격, 아이콘, 장식과 정보 밀도.

## 화면별 감사

| 라우트/영역 | 코드에서 확인한 사항 및 개선 | 우선순위 | 주요 구현 파일 | 검증 |
| --- | --- | --- | --- | --- |
| `src/app/(settings)/_layout.tsx` (내비게이션) | Native Stack/Tabs와 iPad 분리 구조 유지. 중복 헤더와 Safe Area 확인. | P1 | @/features/settings/settings-navigator | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(settings)/hidden-music.tsx` (설정/관리) | SwiftUI Form 기본 시스템 표면, 테마/문구/동작 그룹 통일. 저장·인증 액션 보존. | P1 | @/features/hidden-music/preset-manager, @/features/hidden-music/settings-gate | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(settings)/hidden-playlists.tsx` (설정/관리) | SwiftUI Form 기본 시스템 표면, 테마/문구/동작 그룹 통일. 저장·인증 액션 보존. | P1 | @/features/hidden-music/settings-gate, @/features/playlists/hidden-playlist-manager | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(settings)/settings/backup.tsx` (설정/관리) | SwiftUI Form 기본 시스템 표면, 테마/문구/동작 그룹 통일. 저장·인증 액션 보존. | P1 | @/features/settings/backup-settings | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(settings)/settings/bottom-menu.tsx` (설정/관리) | SwiftUI Form 기본 시스템 표면, 테마/문구/동작 그룹 통일. 저장·인증 액션 보존. | P1 | @/features/settings/menu-layout-settings, @/features/settings/settings-ui | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(settings)/settings/cloud/google-drive.tsx` (설정/관리) | SwiftUI Form 기본 시스템 표면, 테마/문구/동작 그룹 통일. 저장·인증 액션 보존. | P1 | @/features/settings/settings-ui, @/features/google-drive/settings | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(settings)/settings/cloud/jellyfin.tsx` (설정/관리) | SwiftUI Form 기본 시스템 표면, 테마/문구/동작 그룹 통일. 저장·인증 액션 보존. | P1 | @/features/jellyfin/settings | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(settings)/settings/cloud/mybox.tsx` (설정/관리) | SwiftUI Form 기본 시스템 표면, 테마/문구/동작 그룹 통일. 저장·인증 액션 보존. | P1 | @/features/mybox/settings | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(settings)/settings/cloud/s3.tsx` (설정/관리) | SwiftUI Form 기본 시스템 표면, 테마/문구/동작 그룹 통일. 저장·인증 액션 보존. | P1 | @/features/s3/settings | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(settings)/settings/cloud/synology.tsx` (설정/관리) | SwiftUI Form 기본 시스템 표면, 테마/문구/동작 그룹 통일. 저장·인증 액션 보존. | P1 | @/features/settings/settings-ui, @/features/settings/synology-settings | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(settings)/settings/cloud.tsx` (설정/관리) | SwiftUI Form 기본 시스템 표면, 테마/문구/동작 그룹 통일. 저장·인증 액션 보존. | P1 | @/features/settings/settings-ui, @/stores/auth, @/stores/s3 | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(settings)/settings/colors.tsx` (설정/관리) | SwiftUI Form 기본 시스템 표면, 테마/문구/동작 그룹 통일. 저장·인증 액션 보존. | P1 | @/features/settings/color-settings | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(settings)/settings/haptics.tsx` (설정/관리) | SwiftUI Form 기본 시스템 표면, 테마/문구/동작 그룹 통일. 저장·인증 액션 보존. | P1 | @/features/settings/ios-system-settings, @/features/settings/ios-system-settings-link, @/features/settings/settings-ui | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(settings)/settings/index.tsx` (설정/관리) | SwiftUI Form 기본 시스템 표면, 테마/문구/동작 그룹 통일. 저장·인증 액션 보존. | P1 | @/features/settings/ios-system-settings, @/features/settings/ios-system-settings-link, @/features/settings/settings-ui | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(settings)/settings/library.tsx` (설정/관리) | SwiftUI Form 기본 시스템 표면, 테마/문구/동작 그룹 통일. 저장·인증 액션 보존. | P1 | @/features/settings/settings-descriptions, @/features/settings/settings-ui, @/features/library/folder-exclusion-settings | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(settings)/settings/licenses.tsx` (설정/관리) | SwiftUI Form 기본 시스템 표면, 테마/문구/동작 그룹 통일. 저장·인증 액션 보존. | P1 | @/features/settings/licenses-settings | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(settings)/settings/other.tsx` (설정/관리) | SwiftUI Form 기본 시스템 표면, 테마/문구/동작 그룹 통일. 저장·인증 액션 보존. | P1 | @/features/settings/settings-descriptions, @/features/settings/settings-ui, @/stores/hidden-feature-access | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(settings)/settings/playback.tsx` (설정/관리) | SwiftUI Form 기본 시스템 표면, 테마/문구/동작 그룹 통일. 저장·인증 액션 보존. | P1 | @/features/settings/settings-descriptions, @/features/settings/ios-system-settings, @/features/settings/ios-system-settings-link | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(settings)/settings/player-menu.tsx` (설정/관리) | SwiftUI Form 기본 시스템 표면, 테마/문구/동작 그룹 통일. 저장·인증 액션 보존. | P1 | @/features/settings/menu-layout-settings, @/features/settings/settings-ui | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(settings)/settings/playlist-backup.tsx` (설정/관리) | SwiftUI Form 기본 시스템 표면, 테마/문구/동작 그룹 통일. 저장·인증 액션 보존. | P1 | @/features/playlists/backup-settings | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(settings)/settings/quick-hide-preset.tsx` (설정/관리) | SwiftUI Form 기본 시스템 표면, 테마/문구/동작 그룹 통일. 저장·인증 액션 보존. | P1 | @/features/hidden-music/settings-gate, @/features/settings/quick-hide-preset-settings | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(tabs)/(library)/_layout.tsx` (내비게이션) | Native Stack/Tabs와 iPad 분리 구조 유지. 중복 헤더와 Safe Area 확인. | P1 | @/theme/tokens, @/theme/layout, @/components/native-tab-frame | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(tabs)/(library)/album/[id].tsx` (앨범) | 네이티브 상세 헤더 유지. 아트워크, 곡 행, 긴 제목과 가독성 검토. | P2 | @/components/tab-scroll-edge-fade, @/components/text, @/components/artwork | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(tabs)/(library)/artist/[id].tsx` (아티스트) | Native Stack 유지. 가변 행 높이, 보조 텍스트 정렬 개선. | P2 | @/components/tab-scroll-edge-fade, @/components/text, @/components/async-state | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(tabs)/(library)/favorites.tsx` (보관함/진입) | 상태 복원/폴더 탐색/FlatList 유지. iPhone 헤더, 행/아트워크, 로딩·빈·오류 상태 정리. | P1 | @/features/favorites/liked-songs-screen | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(tabs)/(library)/index.tsx` (보관함/진입) | 상태 복원/폴더 탐색/FlatList 유지. iPhone 헤더, 행/아트워크, 로딩·빈·오류 상태 정리. | P1 | @/components/text, @/components/screen-header, @/components/content-title-bar | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(tabs)/(playlists)/_layout.tsx` (내비게이션) | Native Stack/Tabs와 iPad 분리 구조 유지. 중복 헤더와 Safe Area 확인. | P1 | @/theme/tokens, @/theme/layout, @/components/native-tab-frame | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(tabs)/(playlists)/playlists/[id].tsx` (플레이리스트) | 목록/생성/편집/삭제/서버 목록 기능 보존. 행 높이와 위험 작업 구분. | P1 | @/components/tab-scroll-edge-fade, @/components/text, @/components/artwork | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(tabs)/(playlists)/playlists/index.tsx` (플레이리스트) | 목록/생성/편집/삭제/서버 목록 기능 보존. 행 높이와 위험 작업 구분. | P1 | @/components/tab-scroll-edge-fade, @/components/text, @/components/screen-header | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(tabs)/_layout.tsx` (내비게이션) | Native Stack/Tabs와 iPad 분리 구조 유지. 중복 헤더와 Safe Area 확인. | P1 | @/components/platform-tabs, @/components/legacy-tabs | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(tabs)/search/_layout.tsx` (내비게이션) | Native Stack/Tabs와 iPad 분리 구조 유지. 중복 헤더와 Safe Area 확인. | P1 | src/app/(tabs)/search/_layout.tsx | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/(tabs)/search/index.tsx` (검색) | iPhone Native Stack 검색, 350ms debounce 유지. iPad 콘텐츠 검색과 사이드바 보존. | P1 | @/features/library/search-screen | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/_layout.tsx` (내비게이션) | Native Stack/Tabs와 iPad 분리 구조 유지. 중복 헤더와 Safe Area 확인. | P1 | @/components/text, @/features/startup/use-app-bootstrap, @/features/startup/use-playback-recovery | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/connect.tsx` (연결) | 기존 간결한 네이티브 폼 유지. 보안 입력·OTP·취소·HTTP 동의 회귀 검사. | P1 | @/features/connection/connect-screen | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/index.tsx` (보관함/진입) | 상태 복원/폴더 탐색/FlatList 유지. iPhone 헤더, 행/아트워크, 로딩·빈·오류 상태 정리. | P1 | @/stores/menu-preferences, @/features/settings/menu-layout | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/player.tsx` (플레이어) | 기존 제스처/대기열 유지. Reduce Motion, 큰 글자 행 높이와 아트워크 계층 개선. | P1 | @/features/playback/player-screen | 코드 감사 완료 / 실제 화면은 아래 기록 |
| `src/app/server-playlist.tsx` (플레이리스트) | 목록/생성/편집/삭제/서버 목록 기능 보존. 행 높이와 위험 작업 구분. | P1 | @/features/playlists/server-playlists | 코드 감사 완료 / 실제 화면은 아래 기록 |

## 공통 컴포넌트 감사

| 컴포넌트 | 조치 |
| --- | --- |
| `src/components/action-menu.tsx` | 시스템 바에는 효과 중첩 방지. 커스텀 메뉴/표면은 테마와 투명도 줄이기 적용. |
| `src/components/animated-switch.ios.tsx` | 기존 기능 유지. 테마·44pt 조작 영역·Safe Area·가상화 및 접근성 영향 검토. |
| `src/components/animated-switch.tsx` | 기존 기능 유지. 테마·44pt 조작 영역·Safe Area·가상화 및 접근성 영향 검토. |
| `src/components/artwork.tsx` | 기존 기능 유지. 테마·44pt 조작 영역·Safe Area·가상화 및 접근성 영향 검토. |
| `src/components/async-state.tsx` | 시스템 텍스트 역할/큰 글자/대비/가변 행과 상태 표현 검토. |
| `src/components/content-title-bar.tsx` | iPhone 네이티브 헤더와 iPad 기존 제목/사이드바 역할 분리. 중복 상단 inset 방지. |
| `src/components/content-transition.tsx` | 기존 기능 유지. 테마·44pt 조작 영역·Safe Area·가상화 및 접근성 영향 검토. |
| `src/components/favorite-button.tsx` | 기존 기능 유지. 테마·44pt 조작 영역·Safe Area·가상화 및 접근성 영향 검토. |
| `src/components/glass-backdrop.ios.tsx` | 시스템 바에는 효과 중첩 방지. 커스텀 메뉴/표면은 테마와 투명도 줄이기 적용. |
| `src/components/glass-backdrop.tsx` | 시스템 바에는 효과 중첩 방지. 커스텀 메뉴/표면은 테마와 투명도 줄이기 적용. |
| `src/components/legacy-tabs.tsx` | 기존 기능 유지. 테마·44pt 조작 영역·Safe Area·가상화 및 접근성 영향 검토. |
| `src/components/list-loading.tsx` | 시스템 텍스트 역할/큰 글자/대비/가변 행과 상태 표현 검토. |
| `src/components/marquee-text.tsx` | 시스템 텍스트 역할/큰 글자/대비/가변 행과 상태 표현 검토. |
| `src/components/mini-player-content.tsx` | 기존 BottomAccessory 공유 상태, 네이티브 탭, 고정 축소 정책 유지. |
| `src/components/mini-player.tsx` | 기존 BottomAccessory 공유 상태, 네이티브 탭, 고정 축소 정책 유지. |
| `src/components/native-tab-frame.ios.tsx` | 기존 기능 유지. 테마·44pt 조작 영역·Safe Area·가상화 및 접근성 영향 검토. |
| `src/components/native-tab-frame.tsx` | 기존 기능 유지. 테마·44pt 조작 영역·Safe Area·가상화 및 접근성 영향 검토. |
| `src/components/platform-tabs.ios.tsx` | 기존 BottomAccessory 공유 상태, 네이티브 탭, 고정 축소 정책 유지. |
| `src/components/platform-tabs.tsx` | 기존 BottomAccessory 공유 상태, 네이티브 탭, 고정 축소 정책 유지. |
| `src/components/playback-glyph.tsx` | 기존 기능 유지. 테마·44pt 조작 영역·Safe Area·가상화 및 접근성 영향 검토. |
| `src/components/progress-bar.tsx` | 기존 기능 유지. 테마·44pt 조작 영역·Safe Area·가상화 및 접근성 영향 검토. |
| `src/components/screen-header.ios.tsx` | iPhone 네이티브 헤더와 iPad 기존 제목/사이드바 역할 분리. 중복 상단 inset 방지. |
| `src/components/screen-header.tsx` | iPhone 네이티브 헤더와 iPad 기존 제목/사이드바 역할 분리. 중복 상단 inset 방지. |
| `src/components/scroll-edge-child.tsx` | 기존 기능 유지. 테마·44pt 조작 영역·Safe Area·가상화 및 접근성 영향 검토. |
| `src/components/scroll-edge-fade-view.tsx` | 기존 기능 유지. 테마·44pt 조작 영역·Safe Area·가상화 및 접근성 영향 검토. |
| `src/components/scroll-edge-fade.tsx` | 기존 기능 유지. 테마·44pt 조작 영역·Safe Area·가상화 및 접근성 영향 검토. |
| `src/components/scroll-edge-fade.web.tsx` | 기존 기능 유지. 테마·44pt 조작 영역·Safe Area·가상화 및 접근성 영향 검토. |
| `src/components/settings-button.tsx` | 기존 기능 유지. 테마·44pt 조작 영역·Safe Area·가상화 및 접근성 영향 검토. |
| `src/components/sidebar-header.tsx` | iPhone 네이티브 헤더와 iPad 기존 제목/사이드바 역할 분리. 중복 상단 inset 방지. |
| `src/components/song-row.tsx` | 시스템 텍스트 역할/큰 글자/대비/가변 행과 상태 표현 검토. |
| `src/components/tab-scroll-edge-fade.tsx` | 기존 기능 유지. 테마·44pt 조작 영역·Safe Area·가상화 및 접근성 영향 검토. |
| `src/components/tablet-sidebar.tsx` | 기존 기능 유지. 테마·44pt 조작 영역·Safe Area·가상화 및 접근성 영향 검토. |
| `src/components/text-input.tsx` | 시스템 텍스트 역할/큰 글자/대비/가변 행과 상태 표현 검토. |
| `src/components/text.tsx` | 시스템 텍스트 역할/큰 글자/대비/가변 행과 상태 표현 검토. |
| `src/components/toast-notice.tsx` | 기존 기능 유지. 테마·44pt 조작 영역·Safe Area·가상화 및 접근성 영향 검토. |

## 추가 관리 화면

- NAS·Google Drive·Jellyfin·MYBOX·S3 연결: 인증/전송 로직 유지, 공통 Form 표면과 상태/위험 작업 그룹 검토.
- 다운로드·캐시·백업: 동작과 저장 키 보존. 진행/실패/재시도와 삭제 확인 유지.
- 숨김 음악·플레이리스트·프리셋: 최근 개선 유지, 인증 게이트와 헤더 복원 회귀 검사.
- 메타데이터·가사·선택 다이얼로그: 긴 입력·키보드·저장/취소·시트 전환 확인.

## 구현 및 검증 기록

### Phase 1 — 기준선과 감사

- 시작 시점의 193개 미커밋 항목을 기준선으로 보존했다. 이번 작업을 이유로 이전 변경을 되돌리거나 커밋하지 않았다.
- 위 라우트 표는 전체 `src/app` 화면을 포함한다. 검색의 공개 경로 `/search`는 유지하면서 내부 파일을 `search/index.tsx`와 전용 Stack으로 분리했다.
- 변경 전·후 화면은 동일 Simulator, 기본 강조색, 앱의 예제 음악, 재생 일시정지 상태로 비교했다. 실제 NAS 데이터나 사용자 인증 정보를 사용하지 않았다.

### Phase 2 — 공통 표면과 내비게이션

- `tokens.ios.ts`에 iOS 의미 기반 라이트/다크 팔레트를 연결했다. 기존 사용자 강조색·일반 배경·플레이어 배경 계산과 저장 키는 유지한다. Android/web은 원래 테마 구현을 그대로 재수출한다.
- iOS Form/Section의 기본값을 시스템 표면으로 바꿨다. 고정 다크 Host, 흰색 레이블, 설정 화면 전체 Glass를 제거했다. Form의 그룹 간격·모서리·구분선은 SwiftUI가 결정한다.
- 일반 설정 링크의 제목과 보조 아이콘은 본문/보조 색상으로, 실제 동작은 앱 강조색으로 구분했다. 네이티브 Button 안의 `primary`가 강조색으로 해석되는 현상을 실제 화면에서 발견해 명시적인 본문색으로 보정했다.
- iPhone 공통 제목은 Native Stack, 설정 작업은 SF Symbol을 사용하는 Toolbar로 옮겼다. 기존 다섯 번 누르기와 설정 열기 로직은 `useSettingsAction` 하나를 두 표현이 공유한다. iPad 사이드바와 설정 시트 내부 Stack은 유지했다. 스크롤 연동이 검증되지 않은 Large Title은 추가하지 않았다.
- `Text`에 선택적인 Dynamic Type 역할을 추가했다. 기존 호출부 스타일 우선순위와 Android 표현은 유지한다. 오류 재시도는 iOS에서 44pt 이상이며, 실행할 재시도가 없는 오류에 빈 버튼을 표시하지 않는다.

### Phase 3 — 보관함과 검색

- SwiftUI Menu를 사용해 짧은 앨범/곡/아티스트 정렬 작업을 정리했다. 현재 정렬은 체크 표시하며 같은 항목을 선택해도 불필요한 초기화를 하지 않는다. 음악 소스의 긴 연결/가져오기 작업은 기존 시트에 유지한다.
- iOS 곡 행은 평평한 콘텐츠 표면, 일관된 아트워크와 본문/보조 텍스트 정렬을 사용한다. 큰 글자에서는 제목과 보조 정보를 두 줄까지 표시하고 행 높이를 늘린다. 앨범 아트의 과도한 모서리를 줄였다.
- iPhone 검색을 `Stack.SearchBar`에 연결했다. 350ms 지연, 즉시 제출, 취소 시 검색어 초기화, 드래그로 키보드 닫기, 결과 목록/새로고침 흐름은 보존한다. iPad는 사이드바 안의 기존 입력을 유지한다.
- FlatList, 기존 Pager, 정렬/선택/페이지 상태와 스크롤 복원 구조는 유지한다. 전체 행을 SwiftUI Host로 감싸지 않는다. 탭의 `minimizeBehavior="never"`를 보존한다.

### Phase 4 — 플레이어

- 전역 재생 상태와 기존 BottomAccessory 액션은 변경하지 않았다. 재생 엔진, 인증, 숨김 저장소와 프리셋 편집 상태 로직은 기준선과 일치하는지 검사한다.
- 아트워크 그림자·모서리와 대기열 행의 정보 밀도를 정리하고, 플레이어 상세/편집 메뉴 내부의 추가 Glass를 제거했다.
- iOS Reduce Motion에서는 열기/닫기의 큰 이동을 짧은 페이드로 바꾸고 아트워크가 옆으로 크게 움직이지 않게 했다. 곡 변경 임계값·방향·취소·중복 실행 억제·종료 정리는 기존 로직을 유지한다. Android의 이동/시간은 유지한다.
- 큰 글자에서는 정적인 두 줄 제목과 자연스러운 높이의 ScrollView를 사용한다. 임시 fixture의 프로그램 스크롤 끝에서도 재생 조작이 표시되는 것을 확인했다. 기존 네이티브 진행 슬라이더, 탐색 상태/실패 처리와 재생 조작을 보존했다. 새 볼륨 슬라이더는 추가하지 않았다.
- 투명 플레이어 모달의 상태 표시줄은 iOS에서 이전 화면이 소유하므로, 해당 Native Stack에도 현재 화면에 맞는 스타일을 전달한다.

### Phase 5 — 설정과 관리

- 연결·백업·캐시·다운로드·메타데이터·색상·재생 설정은 기존 공통 컴포넌트를 통해 시스템 그룹 표면을 사용한다. 기존 계정 상태/일반 설정/위험 작업 및 저장/취소 분리는 유지한다.
- 음악 숨기기·프리셋 편집의 최근 네이티브 UI는 보존했다. 설정 잠금의 인증 조건, 취소, 이탈 시 잠금, 저장 성공 후 편집 종료, 다중 적용과 저장 형식은 변경하지 않았다.
- 커스텀 ActionMenu/플레이리스트 편집 시트의 내용 표면은 iOS에서 불투명한 테마색을 사용한다. 메뉴 종료 후 편집을 여는 기존 순서는 유지한다. 연결처럼 이미 잘 정리된 네이티브 폼은 재작성하지 않았다.
- 블러 설정에는 콘텐츠 그룹과 시스템 효과의 적용 범위를 설명했다. 기존 키는 보존하며, OS 소유 메뉴/시트/탭 효과에 지원하지 않는 강도나 배경 속성을 강제로 적용하지 않는다.

### Phase 6 — 검증 범위와 증거

검증 완료와 미검증은 아래처럼 구분한다. 화면별 코드 감사가 실제 조작 검증을 의미하지는 않는다.

| 검사 | 결과/범위 |
| --- | --- |
| Expo lint / TypeScript | 통과. 최종 로그는 `docs/verification/ios-ui`에 기록한다. |
| 영향 회귀 검사 | 35개 스크립트 통과. 상태/액션, 검색 지연/취소, 설정/정렬, 메뉴 종료, 빠른 숨김, 잠금 경계, 재생 복구와 버퍼/에너지 정책 등을 검사한다. 네이티브 경계는 mock이다. |
| iOS Release Simulator 빌드 | 현재 네이티브 의존성과 소스로 로컬 Xcode 빌드 성공. 배포/제출하지 않음. |
| iOS/Android production export | 두 플랫폼 번들 생성 성공. 검증 fixture가 production 소스에 들어가지 않는지 별도 소스맵 대조. |
| 실제 네이티브 렌더링 | iPhone 18 Pro / iPad Pro 13 M5, iOS 27.0 Simulator에서 예제 데이터로 캡처. 보관함·검색·설정·플레이어의 상단/그룹/표면/간격 확인. |
| EAS `ui-qa-simulator` | 별도 프로필과 업로드 제외 규칙 준비. 로컬 archive 검토 완료. 사용자가 로컬 검증만 유지하도록 선택. 클라우드 업로드/빌드는 실행하지 않음. |

캡처와 재현 절차는 [검증 기록](verification/ios-ui/README.md), 소스 목록은 [EAS 업로드 검토 목록](verification/ios-ui/eas-source-manifest.json)에 둔다.

#### 검증용 환경의 분리

`scripts/prepare-ios-ui-preview.cjs`는 `/tmp`에만 소스를 복사한다. 예제 계정, 일시정지 대기열, 메모리 SecureStore 어댑터와 자동 화면 전환은 임시 소스에만 삽입한다. 사용자 계정이나 실제 자격 증명은 읽지 않는다. 원래 앱과 다른 bundle identifier로만 설치했다. production에는 QA 라우트/상태 스위치가 없다.

변경 전·후 프로젝트가 공유하는 Metro 캐시에서 이전 라우트가 섞이는 것을 발견해 검증 프로젝트별 cacheVersion을 분리했다. `check-ios-ui-preview.cjs`가 모든 앱 소스맵 내용을 해당 소스 트리와 대조하며, 다른 프로젝트의 라우트가 섞이면 실패한다. 정상 스크린샷의 근거는 이 검사를 통과한 번들로 제한한다.

서명 없는 임시 앱의 초기 실행에서 `SQLiteModule.ensureDatabasePathExists` → `FileSystemManager.ensureDirExists`의 EXC_BAD_ACCESS가 변경 전과 후 각각 발생했다. 재실행 후 렌더링은 가능했다. UI 작업에서 SQLite/파일시스템 모듈이나 DB 경로를 변경하지 않았다. 이 결과를 인증/DB 안정성 검증 성공으로 간주하지 않는다.

#### 남은 실제 조작 검증

- iOS 26 런타임이 설치되어 있지 않아 iOS 26 자체 렌더링은 미검증이다. 현재 캡처의 시스템 Form/Glass 모양은 iOS 27.0 결과다.
- Simulator GUI가 제공되지 않아 실제 터치, VoiceOver 읽기 순서, 키보드 입력/한국어 조합, 시트 드래그, 메뉴 선택과 진행 슬라이더 취소를 조작하지 못했다. Native Stack/SearchBar/Form의 렌더링과 mock 동작 검사는 이 항목들을 대체하지 않는다.
- 소형/대형 iPhone 전체 매트릭스, iPad 회전/좁은 다중 창, 모든 설정 화면의 긴 경로/편집/저장 후 헤더 복원은 실제 확인이 남는다. 잠금/생체 인증의 실제 취소·성공, 실제 NAS/클라우드 연결 오류·오프라인 전환, 백그라운드 재생/복귀와 대규모 목록의 실측 스크롤 성능도 미검증이다.
- 재현: 예제 모드에서 보관함 → 각 콘텐츠 탭/상세 → 검색 → 설정 → 클라우드 연결/Synology → 음악 숨기기/프리셋 생성·편집·취소·저장 순으로 확인한다. 실제 계정 연결 후 같은 흐름에서 네트워크 차단/복귀, 재생 중 화면 전환, 잠금 이탈/재진입을 확인한다. 시스템의 글자 크기·동작 줄이기·투명도 줄이기와 VoiceOver를 켜서 반복한다.

EAS 최초 실행은 자동 승인 검토가 소스/설정의 Expo 서버 업로드에 대한 명시적 승인이 부족하다는 이유로 거절했다. 이후 `.easignore`의 허용 목록으로 로컬 환경·인증서·키·생성 프로젝트·캐시를 제외하고, 로컬 archive의 경로·크기·SHA-256을 검토 가능하게 준비했다. 검토 목록을 제시한 뒤 사용자가 로컬 검증만 유지하도록 선택했으므로 실제 클라우드 빌드는 재시도하지 않았다.

## 공식 기준

- [Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [Apple Layout](https://developer.apple.com/design/human-interface-guidelines/layout)
- [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/)
- [Native Tabs 제한](https://docs.expo.dev/router/advanced/native-tabs/#limitations)
- [Stack Toolbar](https://docs.expo.dev/router/advanced/stack-toolbar/)
- [Simulator 빌드](https://docs.expo.dev/build-reference/simulators/)
