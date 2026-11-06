# 음악 Provider와 Jellyfin

## 구조와 변경 이유

기존 `MusicRepository`는 NAS 인증과 API에 연결되어 있었고, 다른 소스는 각 Store의 곡 목록을 별도로 합쳤다. 재생 소스 해석, 오류 복구, 재시작 복원, 다운로드, 파일 편집에서도 같은 소스 분기가 반복됐다.

`src/services/music-providers/`는 이 경계를 공통 계약과 Registry로 연결한다.

- `contracts.ts`: 상태 구독, 페이지 조회, 새로고침, 재생 소스, 엔터티 참조와 선택적 기능.
- `registry.ts`: 등록된 Provider 목록과 곡의 Provider 선택. 인증 정보를 보관하지 않는다.
- `synology.ts`, `file-providers.ts`, `jellyfin.ts`: 기존 클라이언트와 Store를 연결하는 어댑터. Provider 사이의 직접 의존성은 없다.
- `library-tasks.ts`: 여러 화면의 목록 요청 공유와 마지막 소비자의 요청 취소.
- `cache.ts`: 계정별 키를 사용하는 메타데이터 캐시. NAS의 기존 import는 호환용 재노출을 유지한다.

NAS의 기존 페이지 조회와 보호된 설정용 조회는 유지한다. 기기·Drive·S3·MYBOX·Jellyfin은 각 Store가 소유한 목록을 공통 보관함에 합친다. 앨범·아티스트·검색은 기존의 곡 메타데이터 처리와 그룹화 설정을 재사용한다.

인증 수명과 저장은 각 Store, 재생 큐와 오디오 엔진은 기존 플레이어, 서비스 선택은 보관함 필터가 담당한다. 필터를 바꿔도 재생은 계속된다. 연결 해제로 현재 곡을 제거해야 하면 재생을 멈추고 다른 서비스의 곡은 일시정지된 큐에 남긴다.

## 선택적 기능

`lyrics`, `download`, `fileWrite`, `libraries`, `playlists` 객체가 있을 때만 해당 기능을 제공한다. 미지원 기능을 빈 메서드로 채우지 않는다. 원본 파일 작업은 UI뿐 아니라 실행 경로에서도 확인한다.

| Provider | 기존 인증·재생 | 서버 가사 | 다운로드 | 원본 태그 쓰기 | 서버 목록 |
| --- | --- | --- | --- | --- | --- |
| Synology | 유지, 데모 포함 | 기존 API | 실제 NAS 연결 시 | 기존 File Station 정책 | 기존 보관함 |
| 기기 음악 | 유지 | 온라인 가사 | 해당 없음 | 앱 복사본 | 해당 없음 |
| Google Drive | OAuth·선택 파일·SAF 유지 | 온라인 가사 | 기존 동작 | 읽기 전용 | 선택 파일 |
| S3 | 기존 서명 방식 유지 | 온라인 가사 | 기존 동작 | 기존 권한 정책 | 기존 경로 |
| MYBOX | 기존 토큰·재생 캐시 유지 | 온라인 가사 | 기존 동작 | 읽기 전용 | 기존 폴더 |
| Jellyfin | 사용자 로그인·헤더 인증 | 온라인 가사 | 미제공 | 읽기 전용 | 라이브러리·플레이리스트 조회 |

좋아요, 앱 표시 메타데이터·앨범 아트 수정, 로컬 플레이리스트는 Jellyfin에서도 앱의 기존 기능을 사용한다. Jellyfin 서버의 즐겨찾기, 재생 시작·진행·종료 보고, 플레이리스트 편집은 구현 범위에 포함하지 않는다.

## Jellyfin 구현

설정 → 클라우드 → Jellyfin에서 서버와 사용자를 연결한다. 음악 라이브러리의 기본값은 접근 가능한 모든 음악 라이브러리이며, 개별 선택도 가능하다. 서버 플레이리스트는 기존 플레이리스트 화면 하단에서 연다.

`src/services/jellyfin/`에 HTTP 클라이언트, 응답 매핑, 목록 처리, 앨범 아트와 스트리밍을 분리했다. 공식 [Jellyfin 12.4 API 소스](https://github.com/jellyfin/jellyfin/tree/v12.4/Jellyfin.Api/Controllers)를 기준으로 작성했다. 구버전 호환과 실서버 동작은 별도 확인이 필요하다. 새 SDK나 네이티브 의존성은 추가하지 않았다.

- 서버 주소의 Base URL 경로를 보존하고 HTTPS를 기본으로 사용한다. HTTP는 설정에서 명시적으로 허용한다.
- 비밀번호는 저장하지 않는다. 토큰은 SecureStore에 보관하고 공개 Store에는 연결 정보만 노출한다. 저장 작업을 직렬화하고 오래된 로그인·인증 만료 요청이 새 연결을 덮어쓰지 못하게 한다.
- 네트워크 실패에서는 저장된 연결을 유지한다. 401 인증 만료, 403 권한 부족, 타임아웃, 잘못된 JSON·HTML 응답을 구분한다.
- `UserViews`와 음악 항목을 페이지 단위로 조회한다. 기본 선택은 모든 음악 라이브러리다. 서비스 전용 설정에서 선택을 바꿀 수 있다.
- 로그인 교체와 라이브러리 선택 저장이 끝난 뒤 목록 조회를 시작한다. 저장된 목록을 사용하는 동안에는 기존 보관함의 캐시 안내를 표시한다.
- 플레이리스트 목록과 항목은 읽기 전용이다. 서버 순서와 중복 곡을 유지하며 공통 플레이어로 재생한다. 앱의 표시 정보 수정도 적용한다.
- 앨범 아트는 토큰 없는 참조로 유지하다가 화면·플레이어에서 필요할 때 인증 헤더로 받아 로컬 캐시로 제공한다. 디스크 캐시 개수를 제한한다.
- `PlaybackInfo`와 플랫폼별 프로필로 원본 재생 또는 MP3 트랜스코딩을 선택한다. 재생 URL의 토큰을 제거하고 헤더를 사용한다. 다른 호스트나 Base URL 밖의 트랜스코딩 주소는 거부한다.
- 서버 탐색이 필요한 스트림은 목표 위치에서 다시 준비한다. 공통 플레이어는 시간 오프셋을 적용하고, 곡 변경·취소·종료 시 이전 인코딩 세션을 정리한다. 네트워크 오류에는 현재 위치에서 한 번 재연결한다.
- 일반 HTTPS 및 Cloudflare Tunnel을 대상으로 한다. Cloudflare Access의 별도 웹 인증은 지원하지 않으며 공유 서비스 토큰이나 우회 처리는 추가하지 않았다.

## ID와 저장 호환성

공통 참조는 `providerId`, `accountScope`, `remoteId`다. 기존 소스의 곡 ID와 좋아요·메타데이터·플레이리스트 저장 키는 유지한다. Jellyfin의 곡·앨범·플레이리스트 ID에는 서버·사용자 범위를 넣는다. NAS가 예약 접두사와 같은 원본 ID를 반환하는 경우 원본 ID를 따로 유지한다.

캐시와 Query 식별자에 인증 토큰을 넣지 않는다. Jellyfin 메타데이터 캐시는 계정과 라이브러리 선택별로 구분한다. 큐 스냅샷에는 재생 URL·인증 헤더를 저장하지 않으며 현재 연결에서 소스를 다시 만든다. 기존 스냅샷도 읽는다. 재시작 시 곡 처음부터 일시정지 상태로 복원하는 정책은 유지한다.

## 검증과 남은 확인

자동 검증은 기존 `.cjs` 방식과 실제 어댑터를 사용하는 Mock 경계로 수행한다.

```text
pnpm check-types
pnpm lint
node scripts/check-jellyfin.cjs
node scripts/check-music-providers.cjs
node scripts/check-source-contracts.cjs
```

기존 보관함·앨범·검색·가사·좋아요·파일 편집·다운로드·인증·큐 복원·구간 반복·미디어 컨트롤 회귀 스크립트도 실행한다. 새 검증은 계정별 ID, URL 처리, 401·403·HTML·JSON 오류, 취소, 오래된 로그인, Direct Play·트랜스코딩, 세션 정리, 중복 플레이리스트 항목, 공유 목록 요청과 시간 오프셋을 포함한다.

2026-11-05 최종 자동 검증 결과:

- `pnpm check-types`, `pnpm lint`: 통과.
- 아래 환경·기존 데이터 제약에 해당하는 3개를 제외한 `scripts/check-*.cjs` 76개: 모두 통과. 새 Jellyfin·Provider 검사와 기존 서비스 회귀 검사를 포함한다.
- `pnpm exec expo export --platform all --output-dir dist/provider-export --max-workers 2`: Android·iOS Hermes 번들 생성 통과.
- `git diff --check`: 통과. 기존 사용자 변경과 의존성 패치를 보존했고 의존성·lockfile·패치 등록을 변경하지 않았다.

번들 생성은 네이티브 APK·IPA 빌드나 실서버·실기기 검증을 대신하지 않는다. 다음 항목은 실제 환경에서 확인해야 한다.

- NAS·Google Drive·Jellyfin 실제 로그인과 서버별 권한.
- iOS·Android의 코덱, 인증 헤더, Range 요청, 재연결과 백그라운드 재생.
- MP3 트랜스코딩 탐색 후 앱·잠금 화면의 시간 표시와 스크러빙, 다음·이전 곡.
- 역방향 프록시의 Base URL과 Cloudflare Tunnel 스트리밍.

현재 환경의 별도 제약도 구분한다.

- `check-clean-export.cjs`: 깨끗한 복사본 설치 검증은 오프라인 pnpm 저장소에 `@babel/plugin-transform-destructuring@7.29.7` tarball이 없어 중단됐다.
- `check-ios-lockscreen-artwork.cjs`: iOS 잠금 화면 네이티브 검증은 Windows에 `xcrun`이 없어 실행할 수 없다.
- `check-open-source-notices.cjs`: 작업 전 HEAD의 manifest·lockfile과도 감사 해시가 맞지 않는다. 이번 작업의 의존성 변경으로 생긴 실패가 아니며, 고지·감사 생성 작업은 별도로 필요하다.

더 큰 라이브러리에서 초기 메타데이터 로딩 비용을 줄이는 서버 검색·점진적 인덱싱은 후속 개선 항목이다. 현재는 기존 전체 곡 메타데이터 방식과 화면 동작을 유지한다.
