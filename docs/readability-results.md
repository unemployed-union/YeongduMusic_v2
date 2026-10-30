# 가독성 개선 작업 기록

## 범위와 기준

`src`의 TypeScript/TSX 323개 파일을 검사하고, 그중 288개 파일의 제어 흐름·선언·표현식·배치를 수정했다. 별도로 ESLint 설정과 폴더 제외 회귀 검사를 수정했다. 기존 모듈 경계, 서비스 인터페이스, 저장 형식, 오류 메시지와 플랫폼별 동작은 유지했다.

여러 동작을 한 줄에 작성하는 패턴을 먼저 조사한 뒤 로컬 음악, 서비스·저장소, 기능 화면·공용 UI 순으로 정리했다. 새로운 운영 코드 모듈이나 래퍼 함수를 추가하지 않았다. 아래 수치는 변경 전 HEAD와 작업 결과를 TypeScript AST로 비교한 값이다. 길이와 줄 수 자체는 품질 기준으로 사용하지 않았다.

| 패턴 | 변경 전 | 변경 후 |
| --- | ---: | ---: |
| 중괄호 없는 if/else/반복문 본문 | 1,465 | 0 |
| 여러 변수를 한 문장에서 선언 | 275 | 0 |
| 참/거짓 분기에 다른 삼항식이 직접 포함된 조건식 노드 | 136 | 0 |
| 연쇄 대입 | 6 | 0 |

## 모듈별 개선과 검증

| 단계 | 대표 파일 | 가독성 개선 | 검증 | 남은 위험 |
| --- | --- | --- | --- | --- |
| 로컬 음악 | `src/services/local-music/folders.ts`, `database.ts`, `files.ts`, `storage.ts`, `file-copy.ts` | URI 종류·공급자·볼륨 분기를 명시. 경로 정규화를 이름 있는 순서로 전개. 파일/부모 폴더의 반복문과 카운트 갱신을 분리. DB 연결·직렬화·질의를 순서대로 표시. 복사 필요 조건과 검증 결과에 이름 부여 | 폴더 제외·로컬 음악·파일 복사·파일 메타데이터 검사 통과. 폴더 차등 검사 4,221개 통과 | 실제 파일 공급자·권한·저장 공간 부족 환경은 미검증 |
| 서비스·저장소 | `src/services/cloud-music/request.ts`, `src/services/metadata/write-song-file.ts`, `src/services/playback/audio-engine.ts`, `src/stores/*` | 다중 선언·한 줄 제어문 해제. 요청 경쟁의 완료 Promise를 명명. 저장 대상과 소스 선택을 if/else로 전개. 재생 상태의 연쇄 대입을 기존 대입 순서대로 분리 | HTTP·각 클라우드·소스 계약·파일 쓰기·영속화 회귀 검사 통과. 마지막 재생 수정 후 관련 검사 9개 재실행 통과 | 실제 원격 서비스와 네이티브 오디오 실행은 미검증 |
| 데이터 변환 | `src/features/metadata/rules.ts`, `src/features/library/queries.ts`, `src/features/settings/backup-format.ts` | 숫자 형식/범위 검사와 변환 결과를 구분. 앨범 변경·그룹 변경·앨범 출처를 명명. 장애 시 보관함 조합/편집/선택 단계를 분리. UTF-8 바이트 수의 분기를 전개 | 곡 메타데이터·백업·보관함 상태/성능 검사 통과. 메타데이터 차등 검사 150개 통과 | 모든 비정상 런타임 입력을 완전 탐색한 것은 아님 |
| 화면·컴포넌트 | `src/features/playback/player-screen.tsx`, `src/features/artwork/*`, `src/features/lyrics/*`, `src/app/(tabs)/(library)/index.tsx`, `src/components/*` | 중첩된 JSX 상태 선택을 이름 있는 콘텐츠·라벨·색상·아이콘 변수로 이동. 기존 콜백 내부에서 분기하여 상태를 위에서 아래로 읽도록 구성. 보관함 새로고침 안내 중복 표현을 한 번 계산 | 플레이어 옵션/제스처·가사·앨범아트·태블릿/반응형 화면 등의 기존 회귀 검사 통과 | 실기기 화면·애니메이션·프레임 시간은 미검증 |
| 재발 방지·회귀 사례 | `eslint.config.js`, `scripts/check-folder-exclusions.cjs` | 앱 소스에 중괄호·단일 변수 선언·중첩 삼항 금지·연쇄 대입 금지·한 줄 다중 문장 금지 규칙 적용. 루트·Unicode·공급자·문서 우선순위·잘못된 URI·희소 배열·부모 중복 집계 사례 추가 | 전체 ESLint 오류/경고 0개. 확장한 폴더 제외 검사 통과 | 린트 규칙은 의미 있는 이름과 적절한 책임 분리까지 자동 판정하지 않음 |

## 동작 보존을 위한 확인

- 폴더의 문서 ID가 트리 ID보다 우선하는 순서와 `undefined` 대체 조건을 유지했다. 경로 정규화 순서, 대소문자 정책, Map/Set 발견 순서와 곡별 중복 집계 방식을 유지했다.
- `some`/`every`는 희소 배열의 기존 동작도 보존하도록 유지했다. 복합식을 읽기 쉽게 풀기 위해 반복문으로 일괄 치환하지 않았다.
- 소스별 API 호출, 구독, 파일 준비와 선택된 JSX 분기는 필요한 조건에서만 평가되도록 했다. 선택 항목이 없으면 접근하지 않던 백업 미리보기 등의 조건도 유지했다.
- 폴더 모듈은 변경 전/후 함수의 반환값 또는 오류 이름·메시지를 4,221개 입력 조합으로 비교했다. 메타데이터는 숫자 경계·잘못된 입력·앨범 그룹 변경·편집 취소·객체 재사용을 150개 사례로 비교했다. 이 차등 검사는 작업 중 별도 실행했으며 HEAD에 의존하는 검사 파일은 남기지 않았다.
- 서비스 메서드명·매개변수·반환 계약은 변경하지 않았다. 여러 서비스에 새 공통 인터페이스를 강제하지 않았다. 설정 저장 형식·패키지 버전·잠금 파일·기존 패치도 변경하지 않았다.

## 최종 검증 결과

- 작업 전: 전체 린트 통과. 일반 회귀 검사 74개 중 73개 통과. 현재 설치본의 타입 검사에는 기존 `AudioSource.mimeType` 선언 오류 1건이 있었다.
- 작업 후: 앱·스크립트·플러그인·설정 전체 ESLint를 `--max-warnings 0`으로 통과했다.
- 일반 회귀 검사 74개를 다시 실행해 73개 통과했다. 실패는 작업 전과 동일한 `check-open-source-notices.cjs`의 잠금 파일 해시 불일치다.
- 마지막 재생 상태 대입 수정 뒤 백그라운드 영속화·무손실·버퍼·전력·복구·구간 반복·탐색 설정·소스 계약·시작 복구 검사 9개를 다시 통과했다.
- `check-clean-export.cjs --online`으로 별도 임시 폴더에 `--frozen-lockfile --ignore-scripts --side-effects-cache=false` 설치 후 타입 검사와 Android/iOS 프로덕션 번들을 통과했다. 소스맵에서 현재 앱 화면 소스가 실제 번들에 포함됨도 확인했다. 마지막 재생 수정까지 포함한 최종 소스로 검증했다.
- 오프라인 설치는 캐시에 `generator-function@2.0.1` 배포 파일이 없어 실패했으며, 온라인 설치로 검증했다. 원래 작업 폴더의 의존성은 교체하거나 직접 수정하지 않았다.
- `git diff --check` 통과. APK/IPA 네이티브 컴파일·실기기·실제 서비스 계정 검증은 실행하지 않았다.

## 남은 기존 문제

1. 현재 작업 폴더의 `node_modules`에는 등록된 오디오 패치의 `AudioSource.mimeType` 선언이 빠져 있어 로컬 타입 검사가 계속 실패한다. 오류를 숨기는 타입 단언을 추가하지 않았다. 잠금 파일과 패치를 새로 적용한 임시 환경에서는 타입 검사가 통과했다.
2. 오픈소스 고지 자료의 잠금 파일 해시 불일치는 별도 감사/고지 갱신이 필요하다. 검사를 통과시키기 위해 감사 해시만 바꾸지 않았다.

## 변경 파일 전체

아래 목록은 문서 자체를 제외한 변경 파일이다. 경로별로 묶어 검토할 수 있도록 정리했다.

### Configuration and regression checks

- [eslint.config.js](<../eslint.config.js>)
- [scripts/check-folder-exclusions.cjs](<../scripts/check-folder-exclusions.cjs>)

### src/app

- [src/app/(tabs)/(library)/_layout.tsx](<../src/app/(tabs)/(library)/_layout.tsx>)
- [src/app/(tabs)/(library)/album/[id].tsx](<../src/app/(tabs)/(library)/album/[id].tsx>)
- [src/app/(tabs)/(library)/artist/[id].tsx](<../src/app/(tabs)/(library)/artist/[id].tsx>)
- [src/app/(tabs)/(library)/index.tsx](<../src/app/(tabs)/(library)/index.tsx>)
- [src/app/(tabs)/(playlists)/_layout.tsx](<../src/app/(tabs)/(playlists)/_layout.tsx>)
- [src/app/(tabs)/(playlists)/playlists/[id].tsx](<../src/app/(tabs)/(playlists)/playlists/[id].tsx>)
- [src/app/(tabs)/(playlists)/playlists/index.tsx](<../src/app/(tabs)/(playlists)/playlists/index.tsx>)
- [src/app/(tabs)/search.tsx](<../src/app/(tabs)/search.tsx>)
- [src/app/_layout.tsx](<../src/app/_layout.tsx>)
- [src/app/connect.tsx](<../src/app/connect.tsx>)
- [src/app/hidden-music.tsx](<../src/app/hidden-music.tsx>)
- [src/app/hidden-playlists.tsx](<../src/app/hidden-playlists.tsx>)
- [src/app/index.tsx](<../src/app/index.tsx>)
- [src/app/settings.tsx](<../src/app/settings.tsx>)
- [src/app/settings/bottom-menu.tsx](<../src/app/settings/bottom-menu.tsx>)
- [src/app/settings/cloud.tsx](<../src/app/settings/cloud.tsx>)
- [src/app/settings/cloud/google-drive.tsx](<../src/app/settings/cloud/google-drive.tsx>)
- [src/app/settings/cloud/synology.tsx](<../src/app/settings/cloud/synology.tsx>)
- [src/app/settings/haptics.tsx](<../src/app/settings/haptics.tsx>)
- [src/app/settings/library.tsx](<../src/app/settings/library.tsx>)
- [src/app/settings/licenses.tsx](<../src/app/settings/licenses.tsx>)
- [src/app/settings/other.tsx](<../src/app/settings/other.tsx>)
- [src/app/settings/playback.tsx](<../src/app/settings/playback.tsx>)
- [src/app/settings/player-menu.tsx](<../src/app/settings/player-menu.tsx>)
- [src/app/settings/quick-hide-preset.tsx](<../src/app/settings/quick-hide-preset.tsx>)

### src/components

- [src/components/action-menu-position.ts](<../src/components/action-menu-position.ts>)
- [src/components/action-menu.tsx](<../src/components/action-menu.tsx>)
- [src/components/animated-switch.tsx](<../src/components/animated-switch.tsx>)
- [src/components/artwork.tsx](<../src/components/artwork.tsx>)
- [src/components/async-state.tsx](<../src/components/async-state.tsx>)
- [src/components/character-wrap.ts](<../src/components/character-wrap.ts>)
- [src/components/content-title-bar.tsx](<../src/components/content-title-bar.tsx>)
- [src/components/content-transition.tsx](<../src/components/content-transition.tsx>)
- [src/components/favorite-button.tsx](<../src/components/favorite-button.tsx>)
- [src/components/glass-backdrop.ios.tsx](<../src/components/glass-backdrop.ios.tsx>)
- [src/components/glass-backdrop.tsx](<../src/components/glass-backdrop.tsx>)
- [src/components/glass-controls.ts](<../src/components/glass-controls.ts>)
- [src/components/legacy-tabs.tsx](<../src/components/legacy-tabs.tsx>)
- [src/components/list-loading.tsx](<../src/components/list-loading.tsx>)
- [src/components/marquee-text.tsx](<../src/components/marquee-text.tsx>)
- [src/components/mini-player.tsx](<../src/components/mini-player.tsx>)
- [src/components/native-tab-frame.ios.tsx](<../src/components/native-tab-frame.ios.tsx>)
- [src/components/native-tab-frame.tsx](<../src/components/native-tab-frame.tsx>)
- [src/components/platform-tabs.ios.tsx](<../src/components/platform-tabs.ios.tsx>)
- [src/components/playback-glyph.tsx](<../src/components/playback-glyph.tsx>)
- [src/components/screen-header.tsx](<../src/components/screen-header.tsx>)
- [src/components/scroll-edge-child.tsx](<../src/components/scroll-edge-child.tsx>)
- [src/components/scroll-edge-fade-view.tsx](<../src/components/scroll-edge-fade-view.tsx>)
- [src/components/settings-button.tsx](<../src/components/settings-button.tsx>)
- [src/components/sidebar-header.tsx](<../src/components/sidebar-header.tsx>)
- [src/components/song-row.tsx](<../src/components/song-row.tsx>)
- [src/components/tab-scroll-edge-fade.tsx](<../src/components/tab-scroll-edge-fade.tsx>)
- [src/components/tablet-sidebar.tsx](<../src/components/tablet-sidebar.tsx>)
- [src/components/text-input.tsx](<../src/components/text-input.tsx>)
- [src/components/text.tsx](<../src/components/text.tsx>)
- [src/components/toast-notice.tsx](<../src/components/toast-notice.tsx>)
- [src/components/use-scroll-edge-transition.ts](<../src/components/use-scroll-edge-transition.ts>)
- [src/components/use-scroll-edges.ts](<../src/components/use-scroll-edges.ts>)

### src/features/artwork

- [src/features/artwork/album-artwork-editor.tsx](<../src/features/artwork/album-artwork-editor.tsx>)
- [src/features/artwork/artwork-editor.tsx](<../src/features/artwork/artwork-editor.tsx>)
- [src/features/artwork/artwork-preview.tsx](<../src/features/artwork/artwork-preview.tsx>)
- [src/features/artwork/rules.ts](<../src/features/artwork/rules.ts>)
- [src/features/artwork/song-artwork-editor.tsx](<../src/features/artwork/song-artwork-editor.tsx>)

### src/features/favorites

- [src/features/favorites/display-preferences.ts](<../src/features/favorites/display-preferences.ts>)
- [src/features/favorites/favorite-display-settings.tsx](<../src/features/favorites/favorite-display-settings.tsx>)
- [src/features/favorites/liked-songs-screen.tsx](<../src/features/favorites/liked-songs-screen.tsx>)
- [src/features/favorites/rules.ts](<../src/features/favorites/rules.ts>)

### src/features/google-drive

- [src/features/google-drive/document-settings.tsx](<../src/features/google-drive/document-settings.tsx>)
- [src/features/google-drive/file-picker.tsx](<../src/features/google-drive/file-picker.tsx>)
- [src/features/google-drive/settings.tsx](<../src/features/google-drive/settings.tsx>)

### src/features/haptics

- [src/features/haptics/haptic-settings.tsx](<../src/features/haptics/haptic-settings.tsx>)
- [src/features/haptics/preferences.ts](<../src/features/haptics/preferences.ts>)

### src/features/hidden-music

- [src/features/hidden-music/folder-tree.ts](<../src/features/hidden-music/folder-tree.ts>)
- [src/features/hidden-music/preset-editor.tsx](<../src/features/hidden-music/preset-editor.tsx>)
- [src/features/hidden-music/preset-manager.tsx](<../src/features/hidden-music/preset-manager.tsx>)
- [src/features/hidden-music/quick-hide.ts](<../src/features/hidden-music/quick-hide.ts>)
- [src/features/hidden-music/rules.ts](<../src/features/hidden-music/rules.ts>)
- [src/features/hidden-music/settings-gate.tsx](<../src/features/hidden-music/settings-gate.tsx>)

### src/features/library

- [src/features/library/album-display-settings.tsx](<../src/features/library/album-display-settings.tsx>)
- [src/features/library/album-library.ts](<../src/features/library/album-library.ts>)
- [src/features/library/album-properties.tsx](<../src/features/library/album-properties.tsx>)
- [src/features/library/artist-photo.tsx](<../src/features/library/artist-photo.tsx>)
- [src/features/library/detail-display-settings.tsx](<../src/features/library/detail-display-settings.tsx>)
- [src/features/library/detail-preferences.ts](<../src/features/library/detail-preferences.ts>)
- [src/features/library/folder-exclusion-settings.tsx](<../src/features/library/folder-exclusion-settings.tsx>)
- [src/features/library/library-page.tsx](<../src/features/library/library-page.tsx>)
- [src/features/library/library-pager.tsx](<../src/features/library/library-pager.tsx>)
- [src/features/library/library-result.ts](<../src/features/library/library-result.ts>)
- [src/features/library/library-segments.ios.tsx](<../src/features/library/library-segments.ios.tsx>)
- [src/features/library/library-sidebar.tsx](<../src/features/library/library-sidebar.tsx>)
- [src/features/library/library-sort-control.tsx](<../src/features/library/library-sort-control.tsx>)
- [src/features/library/load-song-library.ts](<../src/features/library/load-song-library.ts>)
- [src/features/library/local-music-controls.tsx](<../src/features/library/local-music-controls.tsx>)
- [src/features/library/mock-repository.ts](<../src/features/library/mock-repository.ts>)
- [src/features/library/play-album.ts](<../src/features/library/play-album.ts>)
- [src/features/library/prepare-album-colors.ts](<../src/features/library/prepare-album-colors.ts>)
- [src/features/library/queries.ts](<../src/features/library/queries.ts>)
- [src/features/library/refresh-library.ts](<../src/features/library/refresh-library.ts>)
- [src/features/library/refresh-music-library.ts](<../src/features/library/refresh-music-library.ts>)
- [src/features/library/refresh-source-libraries.ts](<../src/features/library/refresh-source-libraries.ts>)
- [src/features/library/repository.ts](<../src/features/library/repository.ts>)
- [src/features/library/search-songs.ts](<../src/features/library/search-songs.ts>)
- [src/features/library/song-library.ts](<../src/features/library/song-library.ts>)
- [src/features/library/song-properties.tsx](<../src/features/library/song-properties.tsx>)
- [src/features/library/sort-library.ts](<../src/features/library/sort-library.ts>)
- [src/features/library/use-album-colors.ts](<../src/features/library/use-album-colors.ts>)
- [src/features/library/use-album-header.ts](<../src/features/library/use-album-header.ts>)
- [src/features/library/use-library-controls.ts](<../src/features/library/use-library-controls.ts>)
- [src/features/library/use-music-sources.ts](<../src/features/library/use-music-sources.ts>)
- [src/features/library/use-refresh-library.ts](<../src/features/library/use-refresh-library.ts>)

### src/features/lyrics

- [src/features/lyrics/load-lyrics.ts](<../src/features/lyrics/load-lyrics.ts>)
- [src/features/lyrics/lyrics-edge-fade.tsx](<../src/features/lyrics/lyrics-edge-fade.tsx>)
- [src/features/lyrics/lyrics-edge-fade.web.tsx](<../src/features/lyrics/lyrics-edge-fade.web.tsx>)
- [src/features/lyrics/lyrics-panel.tsx](<../src/features/lyrics/lyrics-panel.tsx>)
- [src/features/lyrics/lyrics-source-control.tsx](<../src/features/lyrics/lyrics-source-control.tsx>)
- [src/features/lyrics/lyrics-timing-controls.tsx](<../src/features/lyrics/lyrics-timing-controls.tsx>)
- [src/features/lyrics/lyrics-translation-controls.tsx](<../src/features/lyrics/lyrics-translation-controls.tsx>)
- [src/features/lyrics/timing.ts](<../src/features/lyrics/timing.ts>)
- [src/features/lyrics/translation-options.ts](<../src/features/lyrics/translation-options.ts>)
- [src/features/lyrics/translation-settings.tsx](<../src/features/lyrics/translation-settings.tsx>)
- [src/features/lyrics/use-active-lyric-index.ts](<../src/features/lyrics/use-active-lyric-index.ts>)
- [src/features/lyrics/use-lyric-scroll.tsx](<../src/features/lyrics/use-lyric-scroll.tsx>)
- [src/features/lyrics/use-lyric-timing.ts](<../src/features/lyrics/use-lyric-timing.ts>)
- [src/features/lyrics/use-lyrics-translation.ts](<../src/features/lyrics/use-lyrics-translation.ts>)
- [src/features/lyrics/use-lyrics.ts](<../src/features/lyrics/use-lyrics.ts>)

### src/features/metadata

- [src/features/metadata/automatic-metadata.tsx](<../src/features/metadata/automatic-metadata.tsx>)
- [src/features/metadata/file-options.ts](<../src/features/metadata/file-options.ts>)
- [src/features/metadata/metadata-editor-form.tsx](<../src/features/metadata/metadata-editor-form.tsx>)
- [src/features/metadata/metadata-editor.tsx](<../src/features/metadata/metadata-editor.tsx>)
- [src/features/metadata/metadata-web-options.tsx](<../src/features/metadata/metadata-web-options.tsx>)
- [src/features/metadata/rules.ts](<../src/features/metadata/rules.ts>)
- [src/features/metadata/web-metadata-settings.tsx](<../src/features/metadata/web-metadata-settings.tsx>)
- [src/features/metadata/web-rules.ts](<../src/features/metadata/web-rules.ts>)

### src/features/mybox

- [src/features/mybox/settings.tsx](<../src/features/mybox/settings.tsx>)

### src/features/offline-music

- [src/features/offline-music/delete-local-song-dialog.tsx](<../src/features/offline-music/delete-local-song-dialog.tsx>)
- [src/features/offline-music/download-status.tsx](<../src/features/offline-music/download-status.tsx>)

### src/features/playback

- [src/features/playback/artwork-colors.ts](<../src/features/playback/artwork-colors.ts>)
- [src/features/playback/background-layers.ts](<../src/features/playback/background-layers.ts>)
- [src/features/playback/lossless-badge.tsx](<../src/features/playback/lossless-badge.tsx>)
- [src/features/playback/menu-styles.ts](<../src/features/playback/menu-styles.ts>)
- [src/features/playback/play-and-open-player.ts](<../src/features/playback/play-and-open-player.ts>)
- [src/features/playback/playback-options-settings.tsx](<../src/features/playback/playback-options-settings.tsx>)
- [src/features/playback/playback-speed-options.tsx](<../src/features/playback/playback-speed-options.tsx>)
- [src/features/playback/player-background.tsx](<../src/features/playback/player-background.tsx>)
- [src/features/playback/player-menu.tsx](<../src/features/playback/player-menu.tsx>)
- [src/features/playback/player-progress.tsx](<../src/features/playback/player-progress.tsx>)
- [src/features/playback/player-screen.tsx](<../src/features/playback/player-screen.tsx>)
- [src/features/playback/player-transport-controls.tsx](<../src/features/playback/player-transport-controls.tsx>)
- [src/features/playback/section-repeat-options.tsx](<../src/features/playback/section-repeat-options.tsx>)
- [src/features/playback/seek-playback-settings.tsx](<../src/features/playback/seek-playback-settings.tsx>)
- [src/features/playback/sleep-timer-options.tsx](<../src/features/playback/sleep-timer-options.tsx>)
- [src/features/playback/streaming-quality-settings.tsx](<../src/features/playback/streaming-quality-settings.tsx>)
- [src/features/playback/use-artwork-colors.ts](<../src/features/playback/use-artwork-colors.ts>)
- [src/features/playback/use-artwork-swipe.ts](<../src/features/playback/use-artwork-swipe.ts>)
- [src/features/playback/use-playback-visibility.ts](<../src/features/playback/use-playback-visibility.ts>)
- [src/features/playback/use-player-dismiss.ts](<../src/features/playback/use-player-dismiss.ts>)

### src/features/playlists

- [src/features/playlists/backup-format.ts](<../src/features/playlists/backup-format.ts>)
- [src/features/playlists/backup-settings.tsx](<../src/features/playlists/backup-settings.tsx>)
- [src/features/playlists/dialogs.tsx](<../src/features/playlists/dialogs.tsx>)
- [src/features/playlists/hidden-playlist-manager.tsx](<../src/features/playlists/hidden-playlist-manager.tsx>)
- [src/features/playlists/rules.ts](<../src/features/playlists/rules.ts>)
- [src/features/playlists/song-picker.tsx](<../src/features/playlists/song-picker.tsx>)

### src/features/s3

- [src/features/s3/settings.tsx](<../src/features/s3/settings.tsx>)

### src/features/settings

- [src/features/settings/backup-files.ts](<../src/features/settings/backup-files.ts>)
- [src/features/settings/backup-format.ts](<../src/features/settings/backup-format.ts>)
- [src/features/settings/backup-settings.tsx](<../src/features/settings/backup-settings.tsx>)
- [src/features/settings/blur-preferences.ts](<../src/features/settings/blur-preferences.ts>)
- [src/features/settings/blur-settings.tsx](<../src/features/settings/blur-settings.tsx>)
- [src/features/settings/color-settings.tsx](<../src/features/settings/color-settings.tsx>)
- [src/features/settings/creator-dialog.tsx](<../src/features/settings/creator-dialog.tsx>)
- [src/features/settings/ios-system-settings-link.tsx](<../src/features/settings/ios-system-settings-link.tsx>)
- [src/features/settings/ios-system-settings.ios.ts](<../src/features/settings/ios-system-settings.ios.ts>)
- [src/features/settings/ios-system-settings.ts](<../src/features/settings/ios-system-settings.ts>)
- [src/features/settings/menu-layout-settings.tsx](<../src/features/settings/menu-layout-settings.tsx>)
- [src/features/settings/menu-layout.ts](<../src/features/settings/menu-layout.ts>)
- [src/features/settings/quick-hide-preset-settings.tsx](<../src/features/settings/quick-hide-preset-settings.tsx>)
- [src/features/settings/quick-hide-settings.tsx](<../src/features/settings/quick-hide-settings.tsx>)
- [src/features/settings/settings-menu-layout.ts](<../src/features/settings/settings-menu-layout.ts>)
- [src/features/settings/settings-navigation.ts](<../src/features/settings/settings-navigation.ts>)
- [src/features/settings/settings-ui.tsx](<../src/features/settings/settings-ui.tsx>)
- [src/features/settings/settings-workspace.tsx](<../src/features/settings/settings-workspace.tsx>)
- [src/features/settings/synology-settings.tsx](<../src/features/settings/synology-settings.tsx>)
- [src/features/settings/system-settings-sync.ts](<../src/features/settings/system-settings-sync.ts>)
- [src/features/settings/tab-menu-selection.tsx](<../src/features/settings/tab-menu-selection.tsx>)
- [src/features/settings/tablet-tab-navigation.ts](<../src/features/settings/tablet-tab-navigation.ts>)
- [src/features/settings/theme-settings.tsx](<../src/features/settings/theme-settings.tsx>)
- [src/features/settings/version-settings.tsx](<../src/features/settings/version-settings.tsx>)

### src/features/startup

- [src/features/startup/use-app-bootstrap.ts](<../src/features/startup/use-app-bootstrap.ts>)
- [src/features/startup/use-music-source-bootstrap.ts](<../src/features/startup/use-music-source-bootstrap.ts>)
- [src/features/startup/use-playback-recovery.ts](<../src/features/startup/use-playback-recovery.ts>)

### src/services/artwork

- [src/services/artwork/artist-photo.ts](<../src/services/artwork/artist-photo.ts>)
- [src/services/artwork/files.ts](<../src/services/artwork/files.ts>)
- [src/services/artwork/image-url.ts](<../src/services/artwork/image-url.ts>)
- [src/services/artwork/palette.ts](<../src/services/artwork/palette.ts>)
- [src/services/artwork/search.ts](<../src/services/artwork/search.ts>)

### src/services/backup-operation.ts

- [src/services/backup-operation.ts](<../src/services/backup-operation.ts>)

### src/services/cloud-music

- [src/services/cloud-music/request.ts](<../src/services/cloud-music/request.ts>)

### src/services/google-drive

- [src/services/google-drive/api.ts](<../src/services/google-drive/api.ts>)
- [src/services/google-drive/auth.ts](<../src/services/google-drive/auth.ts>)
- [src/services/google-drive/config.ts](<../src/services/google-drive/config.ts>)
- [src/services/google-drive/connection-tasks.ts](<../src/services/google-drive/connection-tasks.ts>)
- [src/services/google-drive/documents.ts](<../src/services/google-drive/documents.ts>)
- [src/services/google-drive/library.ts](<../src/services/google-drive/library.ts>)
- [src/services/google-drive/metadata.ts](<../src/services/google-drive/metadata.ts>)
- [src/services/google-drive/picker.ts](<../src/services/google-drive/picker.ts>)
- [src/services/google-drive/read-tags.ts](<../src/services/google-drive/read-tags.ts>)
- [src/services/google-drive/selection.ts](<../src/services/google-drive/selection.ts>)
- [src/services/google-drive/session.ts](<../src/services/google-drive/session.ts>)

### src/services/haptics.ts

- [src/services/haptics.ts](<../src/services/haptics.ts>)

### src/services/hidden-music

- [src/services/hidden-music/biometrics.ts](<../src/services/hidden-music/biometrics.ts>)
- [src/services/hidden-music/storage.ts](<../src/services/hidden-music/storage.ts>)

### src/services/local-music

- [src/services/local-music/database.ts](<../src/services/local-music/database.ts>)
- [src/services/local-music/file-copy.ts](<../src/services/local-music/file-copy.ts>)
- [src/services/local-music/files.ts](<../src/services/local-music/files.ts>)
- [src/services/local-music/folders.ts](<../src/services/local-music/folders.ts>)
- [src/services/local-music/metadata-recovery.ts](<../src/services/local-music/metadata-recovery.ts>)
- [src/services/local-music/scan.ts](<../src/services/local-music/scan.ts>)
- [src/services/local-music/storage.ts](<../src/services/local-music/storage.ts>)

### src/services/lyrics

- [src/services/lyrics/lrclib.ts](<../src/services/lyrics/lrclib.ts>)
- [src/services/lyrics/parse-lyrics.ts](<../src/services/lyrics/parse-lyrics.ts>)
- [src/services/lyrics/translate-lyrics.ts](<../src/services/lyrics/translate-lyrics.ts>)

### src/services/metadata

- [src/services/metadata/automatic.ts](<../src/services/metadata/automatic.ts>)
- [src/services/metadata/cloud-file.ts](<../src/services/metadata/cloud-file.ts>)
- [src/services/metadata/file-io.ts](<../src/services/metadata/file-io.ts>)
- [src/services/metadata/nas-file.ts](<../src/services/metadata/nas-file.ts>)
- [src/services/metadata/tag-writer.ts](<../src/services/metadata/tag-writer.ts>)
- [src/services/metadata/web-search.ts](<../src/services/metadata/web-search.ts>)
- [src/services/metadata/write-song-file.ts](<../src/services/metadata/write-song-file.ts>)
- [src/services/metadata/written-song.ts](<../src/services/metadata/written-song.ts>)

### src/services/mybox

- [src/services/mybox/api.ts](<../src/services/mybox/api.ts>)
- [src/services/mybox/playback-cache.ts](<../src/services/mybox/playback-cache.ts>)

### src/services/offline-music

- [src/services/offline-music/download.ts](<../src/services/offline-music/download.ts>)
- [src/services/offline-music/formats.ts](<../src/services/offline-music/formats.ts>)

### src/services/playback

- [src/services/playback/audio-engine.ts](<../src/services/playback/audio-engine.ts>)
- [src/services/playback/controller.ts](<../src/services/playback/controller.ts>)
- [src/services/playback/equalizer.ts](<../src/services/playback/equalizer.ts>)
- [src/services/playback/lossless.ts](<../src/services/playback/lossless.ts>)
- [src/services/playback/metadata.ts](<../src/services/playback/metadata.ts>)
- [src/services/playback/persistence.ts](<../src/services/playback/persistence.ts>)
- [src/services/playback/playback-rate.ts](<../src/services/playback/playback-rate.ts>)
- [src/services/playback/section-repeat-controller.ts](<../src/services/playback/section-repeat-controller.ts>)
- [src/services/playback/section-repeat.ts](<../src/services/playback/section-repeat.ts>)
- [src/services/playback/sleep-timer.ts](<../src/services/playback/sleep-timer.ts>)
- [src/services/playback/source.ts](<../src/services/playback/source.ts>)

### src/services/playlists

- [src/services/playlists/backup.ts](<../src/services/playlists/backup.ts>)
- [src/services/playlists/storage.ts](<../src/services/playlists/storage.ts>)

### src/services/preferences

- [src/services/preferences/persistence.ts](<../src/services/preferences/persistence.ts>)

### src/services/s3

- [src/services/s3/api.ts](<../src/services/s3/api.ts>)
- [src/services/s3/connection.ts](<../src/services/s3/connection.ts>)
- [src/services/s3/response.ts](<../src/services/s3/response.ts>)

### src/services/settings-backup.ts

- [src/services/settings-backup.ts](<../src/services/settings-backup.ts>)

### src/services/synology

- [src/services/synology/api.ts](<../src/services/synology/api.ts>)
- [src/services/synology/cache.ts](<../src/services/synology/cache.ts>)

### src/stores

- [src/stores/appearance-preferences.ts](<../src/stores/appearance-preferences.ts>)
- [src/stores/auth.ts](<../src/stores/auth.ts>)
- [src/stores/blur-preferences.ts](<../src/stores/blur-preferences.ts>)
- [src/stores/display-preferences.ts](<../src/stores/display-preferences.ts>)
- [src/stores/drive-documents.ts](<../src/stores/drive-documents.ts>)
- [src/stores/favorites.ts](<../src/stores/favorites.ts>)
- [src/stores/folder-exclusions.ts](<../src/stores/folder-exclusions.ts>)
- [src/stores/google-drive.ts](<../src/stores/google-drive.ts>)
- [src/stores/haptic-preferences.ts](<../src/stores/haptic-preferences.ts>)
- [src/stores/hidden-feature-access.ts](<../src/stores/hidden-feature-access.ts>)
- [src/stores/hidden-music.ts](<../src/stores/hidden-music.ts>)
- [src/stores/library-preferences.ts](<../src/stores/library-preferences.ts>)
- [src/stores/local-music.ts](<../src/stores/local-music.ts>)
- [src/stores/lyrics-timing.ts](<../src/stores/lyrics-timing.ts>)
- [src/stores/lyrics-translation.ts](<../src/stores/lyrics-translation.ts>)
- [src/stores/menu-preferences.ts](<../src/stores/menu-preferences.ts>)
- [src/stores/mybox.ts](<../src/stores/mybox.ts>)
- [src/stores/offline-music.ts](<../src/stores/offline-music.ts>)
- [src/stores/playback-preferences.ts](<../src/stores/playback-preferences.ts>)
- [src/stores/playback.ts](<../src/stores/playback.ts>)
- [src/stores/player-background.ts](<../src/stores/player-background.ts>)
- [src/stores/playlists.ts](<../src/stores/playlists.ts>)
- [src/stores/s3.ts](<../src/stores/s3.ts>)
- [src/stores/song-artwork.ts](<../src/stores/song-artwork.ts>)
- [src/stores/song-metadata.ts](<../src/stores/song-metadata.ts>)
- [src/stores/streaming-preferences.ts](<../src/stores/streaming-preferences.ts>)
- [src/stores/theme-preferences.ts](<../src/stores/theme-preferences.ts>)
- [src/stores/web-metadata.ts](<../src/stores/web-metadata.ts>)

### src/theme

- [src/theme/appearance.ts](<../src/theme/appearance.ts>)
- [src/theme/layout.ts](<../src/theme/layout.ts>)
- [src/theme/liquid-glass.ios.tsx](<../src/theme/liquid-glass.ios.tsx>)
- [src/theme/mode.ts](<../src/theme/mode.ts>)
- [src/theme/tokens.ts](<../src/theme/tokens.ts>)
- [src/theme/use-player-colors.ts](<../src/theme/use-player-colors.ts>)

### src/types

- [src/types/jsmediatags.d.ts](<../src/types/jsmediatags.d.ts>)
