# 성능 및 리소스 최적화 — 2026-11-08

기존 동작을 유지하며 목록 계산, 검색, 저장된 큐 복원의 세 부분을 개선했다. 의존성·Provider 계약·오디오 엔진·화면 디자인은 변경하지 않았다. 작업 시작 전에 있던 `build-version.json` 변경은 보존했고 빌드 번호를 증가시키거나 기기에 앱을 설치하지 않았다.

## 1. 구조와 병목 조사

| 영역 | 확인한 구현과 판단 |
| --- | --- |
| 실행 환경 | Expo 58.0.23, React Native 0.88.1, React 19.3.0. 생성된 Android 설정의 `hermesEnabled=true`, `newArchEnabled=true` 확인. pnpm과 기존 패치 유지. |
| 상태·요청 | Zustand의 선택 구독, TanStack Query의 목록 캐시, Provider Registry 사용. `library-tasks.ts`가 화면 간 요청을 공유하고 마지막 소비자 해제 시 취소한다. SQLite 메타데이터 캐시는 기존 계정 경계를 유지한다. |
| 대량 목록 | `library-page.tsx`는 FlatList, `windowSize=7`, 제한된 초기/배치 렌더, 정렬 useMemo와 renderItem useCallback을 이미 사용한다. 앨범/아티스트 상세도 메타데이터를 공유한다. 목록 컴포넌트 교체보다 불필요한 상위 데이터 재계산을 먼저 줄였다. |
| 검색 | 화면 입력에는 이미 350ms 지연이 있다. 그러나 검색 selector의 함수 참조가 매번 바뀌고, `search-songs.ts`는 검색마다 모든 곡의 세 문자열을 다시 정규화한다. |
| 초기화 | 설정 복원과 Provider bootstrap은 대부분 독립 effect/Promise.all로 시작한다. 숨김 프로필·계정·설정 복원 후 재생을 복원하는 순서는 보존했다. 복원 중 각 곡에 대한 카탈로그 Array.find가 반복되는 비용을 확인했다. |
| 재생 | expo-audio 엔진의 상태 이벤트는 1초 간격. 진행률 UI는 위치를 따로 구독하고, MiniPlayer·전체 플레이어는 주로 곡/재생 상태만 구독한다. 지속 저장도 경과 시간마다 전체 큐를 저장하지 않는다. 기존 엔진·타이머·미디어 제어를 유지했다. |
| 이미지 | expo-image를 사용하지 않고 React Native Image를 사용한다. NAS 목록 커버는 서버의 320px 이미지를 쓰며 보이는 플레이어만 큰 이미지를 요청한다. Jellyfin은 계정 범위가 포함된 참조를 해시하고 인증 헤더로 내려받아 로컬 URI로 표시하며, 중복 요청을 공유하고 디스크 캐시를 제한한다. 컬러 추출에도 메모리 캐시와 진행 중 요청 공유가 있다. 이번에는 변경하지 않았다. |
| 번들·의존성 | 시작 시 AutomaticMetadata는 설정·전경·계정 조건을 확인한다. 기존 라이브러리의 중복 설치/불필요 여부를 단정할 근거는 찾지 못해 제거하지 않았다. 큰 정적 자산은 주로 브랜딩 이미지·고지·데모 오디오이며 기존 기능에 사용된다. 플랫폼별 파일과 Jellyfin 아트의 지연 import를 유지했다. |

### 변경 전 후보 우선순위

| 우선순위 | 후보 | 근거·영향 | 회귀 위험 / 결정 |
| --- | --- | --- | --- |
| 1 | Provider 요청 상태와 목록 데이터의 변경 구분 | `states` 참조만 바뀌어도 새 libraries 객체가 만들어져 전체 편집·숨김 필터·그룹화·Query 결과 비교를 다시 실행 | 낮음~중간. 실제 곡 배열·소스·계정 변경과 오류 안내를 구분해 적용 |
| 2 | 검색 정규화와 selector 재사용 | 동일 입력의 재렌더 및 검색어마다 전체 문자열 NFKC/소문자 변환 반복 | 낮음. 검색 순서·단어 매칭·Unicode·수정 반영을 검증 후 적용 |
| 3 | 저장 곡 복원 조회 인덱스 | N곡 큐를 N곡 카탈로그에서 각각 Array.find: 로컬 전체 큐 복원은 이차 비용 | 낮음~중간. 배열 교체·중복 ID·삭제·계정 확인을 검증 후 적용 |
| 보류 | FlashList v2, 이미지 로더 교체, 초기화 순서 변경 | 기기에서 입증된 렌더/디코딩/시작 구간 자료가 없음 | 셀 상태 재활용, 인증 이미지, 복원 순서 위험이 있어 적용하지 않음 |

## 2. 적용한 변경과 검증 범위

### 목록 입력 참조 유지

- `src/features/library/source-library-selection.ts`: 각 hook 인스턴스가 직전 선택 결과만 보관한다. 선택된 Provider의 곡 배열·연결·계정 범위·세대·소스가 같으면 같은 libraries 객체를 돌려준다. 선택하지 않은 소스의 곡은 결합 입력에서 제외한다.
- `src/features/library/use-source-libraries.ts`: 해당 선택 함수를 사용한다. 요청 로딩·오류·stale·pending 안내와 구독/취소 effect는 기존 경로로 계속 계산한다. stale 변경은 Query selector의 별도 의존성으로 재계산된다.
- **확인한 효과:** 로딩만 바뀐 12회 갱신과 선택하지 않은 소스의 갱신에서 전체 목록을 다시 그룹화하지 않는다. 계정 교체, 연결 해제, 소스 전환, stale 변경은 필요한 결과를 다시 만든다.
- **예상 효과:** FlatList에 전달되는 데이터가 불필요하게 바뀌거나 깊은 결과 비교를 실행하는 횟수가 줄어든다. 실제 React commit 수·스크롤 FPS는 측정하지 않았다.

### 검색 반복 작업 감소

- `src/features/library/queries.ts`: 검색 selector를 검색어와 숨김 프리셋을 기준으로 useCallback 처리했다.
- `src/features/library/search-songs.ts`: Song 객체를 키로 하는 WeakMap에서 제목·가수·앨범의 정규화 결과를 재사용한다. 원본 세 문자열을 대조하므로 같은 객체의 표시 정보가 바뀌어도 다시 계산한다.
- **확인한 효과:** 같은 검색어의 12회 렌더에서 추가 전체 필터 작업이 없다. 1만 곡에서 서로 다른 검색어 10개를 실행한 정규화 호출은 300,010회에서 30,010회로 줄었다.
- 검색 결과 순서·중복·필드 간 단어 매칭·NFKC·빈 입력·숨김 및 표시 정보 변경을 보존했다. 같은 ID라도 다른 계정의 Song 객체는 캐시를 공유하지 않는다.
- **자원 비용:** 검색한 곡에 정규화 문자열 세 개와 조회 정보를 추가로 보관한다. 첫 검색에는 정규화와 캐시 생성 비용이 있다. 객체가 수거되면 해당 WeakMap 항목도 수거될 수 있으며 디스크 저장이나 URL/토큰 캐시 키를 추가하지 않았다. 실기기 힙 변화는 측정하지 않았다.

### 복원 카탈로그 인덱스

- `src/services/music-providers/stored-song-index.ts`: 카탈로그 배열별로 ID→Song Map을 한 번 만든다. WeakMap으로 보관하고 같은 ID가 중복되면 기존 Array.find처럼 첫 곡을 반환한다.
- `src/services/music-providers/file-providers.ts`: 기기 음악·Drive·S3·MYBOX 복원의 곡 조회에 적용했다. 기존 계정·접두사·문서 URI·선택 파일 검사는 유지했다.
- **확인한 효과:** 로컬 1만 곡 카탈로그에서 전체 1만 곡을 복원할 때 ID 조회가 50,005,000회에서 20,000회로 줄었다. 배열 교체 후 수정/삭제된 곡과 계정 교체는 이전 인덱스 결과를 반환하지 않는다.
- **자원 비용:** 조회한 카탈로그에 ID Map 메모리가 추가된다. 새 배열에서는 다시 만들며 이전 배열의 수명이 끝나면 이전 항목도 수거될 수 있다. 단일 곡만 조회하는 첫 호출은 선형 탐색보다 Map 생성 비용이 클 수 있다.
- 이 측정은 카탈로그 곡 조회 구간이다. Google Drive의 선택 파일 권한 검사(`files.some`), 파일 I/O·인증·복원 전체 시간까지 일정 시간 조회로 바꿨다는 의미는 아니다.

## 3. 실행 측정과 회귀 검증

`scripts/check-resource-performance.cjs`는 실제 소스 함수를 실행하며 네이티브 경계와 React hook의 의존성 비교를 모의한다. QueryObserver는 설치된 TanStack Query 구현을 사용한다. 별도 기기 프로파일러나 실제 React 렌더러 측정은 아니다.

작업 직전 파일을 `dist/performance-20261108/before/`에 `.ts.txt`로 보존해 동일 스크립트로 비교했다. Node 24.21.0/V8, Windows, 1만 곡 데이터, 전후 순서를 번갈아 5회 실행한 중앙값이다. 서버 요청을 포함하지 않는다.

| 시나리오 | 변경 전 | 변경 후 |
| --- | --- | --- |
| 검색어 10개, 첫 정규화 포함 | 72.97ms / 300,010회 정규화 | 25.72ms / 30,010회 정규화 |
| 기기 카탈로그에서 큐 1만 곡 복원 조회 | 321.26ms / 50,005,000회 ID 조회 | 1.99ms / 20,000회 ID 조회 |
| 요청 상태만 12회 갱신 | 70.07ms / 앨범 선택 계산 12회 추가 | 0.46ms / 추가 계산 0회 |
| 동일 검색어 12회 렌더 | 전체 숨김 필터 12회 추가 | 추가 필터 0회 |

시간 측정은 계측 환경에 따라 달라진다. ID getter를 통한 조회 횟수 계측은 시간 측정과 별도로 수행한다. 위 수치는 휴대폰의 시작 시간·네이티브 FPS·메모리·배터리 개선율로 환산할 수 없다. 정확한 연산 횟수 감소와 해당 처리 구간의 Node 실행 시간 개선을 확인한 결과다.

| 검증 | 결과 |
| --- | --- |
| 기존 회귀 + 새 성능 회귀 스크립트 | 78개 통과, 실패 없음 |
| `pnpm check-types`, `pnpm lint` | 통과 |
| Android arm64 `:app:assembleRelease` | 성공, 새 JS/Hermes 번들과 APK 생성; R8 설정 유지, 네이티브 축소 작업은 UP-TO-DATE |
| `:yeongdu-drive-picker:testDebugUnitTest` | 빌드 대상에 포함; 이전 6개 성공 결과가 UP-TO-DATE로 재사용됨 |
| `pnpm exec expo export --platform ios` | iOS Hermes 번들 생성 성공, 약 8MB. 전후 번들 크기 감소를 측정한 것은 아님 |
| clean export 재설치 검사 | 미실행. 의존성·lockfile·네이티브 설정 변경이 없어 재설치 검증은 반복하지 않음 |
| iOS 잠금 화면 Swift/native 검사 및 Xcode 빌드 | Windows 환경이므로 미실행. iOS 번들 성공은 Swift/IPA 검증을 의미하지 않음 |
| 실기기 cold start·프레임·힙·CPU·배터리 | ADB 연결 기기 없음. 측정하지 않았으며 정상 동작/향상 수치를 단정하지 않음 |

전체 검사에는 목록 상태·취소/계정 전환·숨김/메타데이터·Google Drive/S3/MYBOX/Jellyfin·오프라인·재생 복원·백그라운드 지속 저장·큐/셔플/반복/탐색 검사가 포함된다. 네트워크와 네이티브 경계의 모의 검증이며 실제 서버/미디어 세션 검증을 대체하지 않는다.

재현 명령:

```powershell
node scripts/check-resource-performance.cjs
node scripts/check-resource-performance.cjs dist/performance-20261108/before
```

원시 로그, 전후 5회 측정 데이터와 중앙값은 `dist/performance-20261108/`의 `comparison.json`, `regression-summary.txt`, `types.log`, `lint.log`, `android-release.log`, `ios-export.log`에 있다. `before`와 로그는 로컬 비교용이며 Git에 포함하지 않는다. APK는 `android/app/build/outputs/apk/release/app-release.apk`에 있다.

## 4. 추가 개선 후보와 기기 확인

| 후보 | 예상 효과 | 위험도 / 다음 순서 |
| --- | --- | --- |
| Release 기기 프로파일 | 1만 곡 로드/검색/앨범 전환 중 JS·UI 프레임, 최초 검색 비용과 WeakMap의 힙 비용 확인 | 다음 작업 최우선. 동일 데이터·계정·네트워크에서 전후 빌드를 반복 비교 |
| Jellyfin의 목록 전용 작은 아트 | 현재 최대 1024px 요청을 작은 셀에서는 줄여 다운로드·디코딩 비용 감소 가능 | 중간. 이미지 크기별 URI/디스크 키, 계정 분리, 전체 플레이어/잠금 화면 원본 품질과 캐시 제거를 함께 검증해야 함 |
| Drive 선택 파일 조회 인덱스 | 대형 Drive 큐 복원에서 남아 있는 권한 목록 순회 감소 가능 | 중간. 권한 해제·선택 변경·연결 교체·문서 URI 시나리오를 별도로 검증 후 적용 |
| NAS 대형 페이지 조회·그룹화 | 큰 목록의 실제 네트워크/변환 시간을 추가로 줄일 가능성 | 중간~높음. 서버 응답 지연과 JS 비용을 먼저 구분하고, 페이지 변경 중 누락/중복 및 취소 동작을 검증 |
| FlashList/이미지 로더 교체 | 기기 프로파일에서 렌더/디코딩이 병목일 때 검토 | 근거 확보 후. 행의 메뉴/눌림/좋아요 상태, 이미지 교체, 다중 열·동적 글꼴·스크롤 위치·접근성 회귀 위험이 있음 |

Android/iOS Release 실기기에서는 같은 대형 라이브러리로 cold start부터 목록 조작 가능 시점, 빠른 스크롤, 검색 입력/삭제·새로고침, 소스 전환과 계정 연결 해제를 비교한다. 수정 후 검색·숨김·앨범 아트가 갱신되는지도 확인한다. 음악을 재생하며 백그라운드·잠금 화면·이어폰 다음/이전·셔플/반복·탐색·앱 복귀를 확인하고, NAS 내부망/외부 HTTPS/Tunnel 및 다른 Provider에서 재연결·오프라인 사용을 점검한다.

공식 [SDK 58 문서](https://docs.expo.dev/versions/v58.0.0/), [FlatList 최적화 지침](https://reactnative.dev/docs/optimizing-flatlist-configuration), [React useMemo의 의존성과 한계](https://react.dev/reference/react/useMemo), [SDK 58 Audio](https://docs.expo.dev/versions/v58.0.0/sdk/audio/)를 참고했다.
