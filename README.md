# YeongduMusic

## 저장하는 플레이리스트

보관함의 **내 플레이리스트**에서 운동·드라이브처럼 이름을 붙인 목록을 여러 개 만들 수 있습니다. 목록을 열어 **곡 추가**에서 검색하고 여러 곡을 선택하거나, 보관함·검색·앨범·아티스트의 곡 옆 **⋯** 메뉴에서 새 목록 또는 기존 목록에 추가하세요. 같은 곡을 여러 플레이리스트에 저장할 수 있으며 한 목록 안에서는 중복되지 않습니다.

플레이어의 현재 곡 메뉴에서도 목록에 추가할 수 있고, **목록 저장**은 현재 재생 대기열을 순서대로 저장합니다. 저장한 목록에서는 전체 재생, 곡별 재생, 이름 변경, 곡 편집(위/아래 이동·제거), 목록 삭제를 지원합니다. 목록에서 제거하거나 목록을 삭제해도 NAS의 음악 파일은 변경하지 않습니다.

플레이리스트 프리셋은 `music-playlists.db`에 기기별·NAS 주소/계정별로 저장하고 데모는 별도로 관리합니다. 앱 재시작·로그아웃 후에도 같은 계정으로 돌아오면 복원됩니다. 곡 ID와 목록 이름만 저장하고 재생·커버 URL이나 인증 정보를 저장하지 않습니다. 최신 보관함에서 곡 정보를 찾아 재생하며 숨긴 곡이나 찾을 수 없는 곡은 표시·재생하지 않고, 목록의 ID는 유지하므로 다시 표시 가능해지면 복원됩니다. NAS 플레이리스트 동기화나 다른 기기 공유는 지원하지 않습니다.

`node scripts/check-playlists.cjs`로 실제 SQLite SQL의 저장/복원, 다중 목록, 중복 방지, 순서 변경, 숨김/누락 곡 처리, 계정 전환, 동시 저장, 저장 실패 및 손상된 데이터 처리를 검증합니다. Expo SQLite는 테스트에서 Node SQLite로 연결하며 실제 모바일 UI·NAS 재생은 기기에서 별도로 확인해야 합니다.

Expo SDK 57, React Native, TypeScript로 만든 iOS·Android용 개인 음악 앱입니다. 앱이 Synology NAS의 Audio Station에 직접 연결합니다. 별도 백엔드나 실제 NAS 계정 정보는 저장소에 없습니다.

## 시작하기

```bash
pnpm install
pnpm start
```

첫 화면의 **먼저 데모 둘러보기**를 누르면 NAS 없이 보관함, 검색, 앨범, 대기열, 재생 UI를 사용할 수 있습니다. 데모 곡은 저장소에 포함된 짧은 합성 오디오를 재생합니다. Expo Go에서는 전경 재생만 사용합니다. 백그라운드 재생과 잠금 화면 컨트롤은 아래 명령으로 만든 네이티브 앱에서 확인하세요. 네이티브 모듈 또는 `app.json` 플러그인 설정을 바꾼 뒤에는 앱을 다시 빌드하고 설치해야 합니다. Metro 새로고침만으로는 적용되지 않습니다.

NAS 주소는 연결·설정 화면에서 직접 입력합니다. 환경변수의 주소를 앱 기본값으로 포함하지 않으며, 저장된 세션이 있는 기기는 기존 연결을 복원합니다. 주소를 변경하면 기존 세션을 종료하고 새 주소에서 다시 로그인합니다. `.env.local`은 Git에서 제외되며, `.env.example`의 `NAS_URL`은 선택적인 로컬 진단용입니다. 아래 명령의 `https://nas.example.com`은 예시이므로 실행 시 본인의 NAS 주소로 바꾸세요.

```bash
pnpm exec expo run:android
# macOS + Xcode 환경에서:
pnpm exec expo run:ios
```

Android에서 `Failed to start the expo-audio playback service` 또는 `service binding failed`가 나타나면, Expo Go가 아닌 **YeongduMusic** 앱을 실행 중인지 확인하세요. 이미 개발 빌드를 설치했다면 위 명령으로 현재 `app.json`을 반영한 앱을 다시 빌드하고 설치하세요. 저장소의 `expo-audio` 플러그인은 `enableBackgroundPlayback: true`로 설정되어 있으며, Expo 설정 검사에서 Android `AudioControlsService` 선언과 foreground service 권한을 확인했습니다. 실제 기기의 서비스 동작과 잠금 화면 컨트롤은 별도로 검증해야 합니다.

Android Release 스플래시는 `app.json`의 `expo-splash-screen` 플러그인이 `assets/images/splash-logo.png`를 사용해 생성합니다. 이 PNG는 기존 음파 모양을 유지합니다. 앱 아이콘은 로그인 화면과 같은 그라데이션·음표이며 `node scripts/generate-icon.js`로 기본 PNG와 Android adaptive 레이어를 다시 만들 수 있습니다. `android/`는 생성 파일이라 Git과 EAS 업로드에서 제외됩니다. EAS Build는 업로드된 이미지와 설정으로 Prebuild를 실행합니다. Git 기반 빌드에서는 새 이미지와 설정을 커밋해야 합니다.

입력 화면의 자동 스크롤에는 `react-native-keyboard-controller`를 사용합니다. 네이티브 의존성이 추가되었으므로 개발 빌드를 새로 설치해야 합니다. 키보드가 열리면 탭바와 미니 플레이어가 숨겨지며 재생 상태는 유지됩니다. iOS·Android 실기기에서 작은 화면과 여러 입력창 이동을 확인해야 합니다.

## 실제 NAS 연결 확인

2026-10-10 Windows 로컬 환경에서 확인했습니다. 내부 NAS의 HTTPS `:5001` 포트는 열려 있고, 인증서 검증을 해제한 **진단 요청에서만** API Info JSON이 반환됐습니다. 정상 인증서 검증에서는 신뢰 오류가 나므로 앱에서 내부 HTTPS 접속은 현재 실패합니다. 내부 HTTP `:5000`은 API Info JSON을 반환했지만 암호화되지 않습니다. 외부 NAS 주소(개인 주소 생략)는 유효한 HTTPS로 HTTP 200, `application/json` API Info 응답을 반환했습니다. 두 경로 모두 Auth v1–7, Song/Album v1–3, Artist v1–4, Cover v1–3, Stream v1–2와 동일한 경로를 보고했습니다. Cloudflare HTML 페이지는 이 무인증 조회에서 반환되지 않았습니다.

외부 HTTPS 주소에서 실제 Audio Station 계정으로 인증 요청도 확인했습니다. 비밀번호는 아래 스크립트가 실행 중 터미널에서 안전 입력으로 받으며 화면에 표시하거나 파일에 저장하지 않습니다. 로그인 성공 시 목록의 **필드 이름과 건수만** 출력하고, 커버·스트림은 `Range: bytes=0-1023`으로 요청해 최대 1 KiB만 읽습니다. 스트림이 Range를 무시하면 응답을 끝까지 받지 않고 연결을 닫습니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-nas.ps1 -BaseUrl https://nas.example.com -ApiOnly
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-nas.ps1 -BaseUrl https://nas.example.com
```

두 번째 명령은 계정명과 비밀번호를 로컬 터미널에서 묻습니다. 관리자 권한이 없는 Audio Station 사용 가능 계정을 사용하세요. 이 명령이 출력하는 결과를 공유할 때도 계정명, NAS 내부 IP, 곡 제목 등 개인 정보가 없는지 확인하세요. 로그인 뒤 스크립트는 세션을 로그아웃합니다.

## 구현 범위

- NAS 주소·계정 입력, API 발견, Audio Station API 존재 및 지원 버전 확인, 로그인(OTP 코드 입력 포함), 세션 복원·만료·연결 해제
- 곡·앨범·아티스트 목록, 앨범 상세, 검색, 커버 이미지, 페이지네이션과 `FlatList` 가상화
- `expo-audio` 전역 엔진, 재생·일시정지·탐색·다음/이전·대기열·셔플·반복, 미니/전체 화면 플레이어
- 밝은/어두운 테마, 반투명 하단 탭, SQLite 메타데이터 페이지 캐시, SecureStore 세션 보관

기본 연결은 **HTTPS와 유효한 인증서**를 사용합니다. HTTP 주소를 입력하면 경고를 읽고 **HTTP 연결 허용**을 직접 선택해야 합니다. HTTP에서는 비밀번호와 세션이 네트워크에서 평문으로 전달됩니다. 비밀번호는 로그인 요청에만 사용하고 저장하지 않으며, 세션 ID와 SynoToken만 SecureStore에 저장합니다. 자체 서명 인증서를 자동 신뢰하지 않습니다. HTTP 연결을 위해 네이티브 앱에는 cleartext 허용 설정이 포함되어 있으므로 신뢰할 수 있는 네트워크에서만 HTTP를 사용하세요.

## 구조

| 경로 | 역할 |
| --- | --- |
| `src/app` | Expo Router 화면과 레이아웃 |
| `src/features/library` | 라이브러리 쿼리, Mock 및 실제 Repository 선택 |
| `src/services/synology` | DSM API 발견·인증·응답 변환·SQLite 캐시 |
| `src/services/playback` | `AudioEngine` 인터페이스와 전역 `expo-audio` 구현, 대기열 제어 |
| `src/stores` | Zustand 인증·재생 상태 |
| `src/components`, `src/theme`, `src/types` | 공통 UI, 디자인 토큰, 도메인 모델 |

## 하단 메뉴와 미니 플레이어 블러

기존 iOS 전용 블러 조건을 제거하고 두 영역에 `expo-blur`를 적용했습니다. [SDK 57 공식 사용법](https://docs.expo.dev/versions/v57.0.0/sdk/blur-view/)에 따라 각 탭의 화면 콘텐츠를 `BlurTargetView`로 감싸고, 현재 탭의 대상 ref를 하단 메뉴와 미니 플레이어가 공유합니다. 블러 뷰와 컨트롤은 대상 바깥에 두어 자기 자신을 캡처하지 않으며, 탭의 실제 선택 상태를 사용해 전체 재생 화면을 여닫아도 같은 대상이 유지됩니다.

Android에는 `blurMethod="dimezisBlurView"`를 지정하고 강도 75를 사용합니다. 라이트·다크의 기존 분홍색/자주색 계열을 얇은 색상 레이어로 유지합니다. 미니 플레이어의 모서리·간격, 탭·재생 버튼·위로 스와이프 동작과 키보드 표시 시 숨김 처리는 그대로입니다. 기존 설치된 의존성만 사용하며 네이티브 설정 변경은 없습니다.

실기기에서는 보관함·검색·설정을 스크롤할 때 블러 갱신, 탭 전환과 플레이어 재진입, 미니 플레이어 터치·스와이프 및 다크/라이트 가독성을 확인해야 합니다. Android 11 이하의 블러는 RenderScript를 사용해 성능이 달라질 수 있습니다.

## 아티스트별 노래

보관함의 아티스트를 누르면 해당 아티스트의 곡 목록과 전체 재생 버튼이 열립니다. 곡을 선택하면 그 아티스트의 전체 곡이 재생 대기열에 들어갑니다. 로딩, 빈 목록, 오류와 재시도, 아래로 당겨 새로고침을 지원합니다.

아티스트 필터 매개변수는 실제 NAS에서 검증하지 않았습니다. 검증된 통합 보관함의 `Song.list`와 `song_tag.artist`를 사용해 아티스트 이름이 정확히 일치하는 곡을 표시합니다. 첫 조회는 전체 곡 메타데이터를 페이지 단위로 받아 완료한 뒤 표시하므로 큰 보관함에서는 시간이 걸릴 수 있습니다. 동일 계정의 다른 아티스트 화면도 이 조회 캐시를 공유하며, 계정 전환과 보관함 새로고침 시 분리·갱신합니다. 목록은 FlatList로 가상화합니다. 실제 NAS와 앱에서 아티스트별 결과와 재생을 확인해야 합니다.

## 앨범 목록과 상세

앨범 목록과 소속 곡은 실제 NAS에서 확인한 통합 `Song.list`의 `song_tag`를 사용합니다. 앨범 이름과 앨범 아티스트(`album_artist`, 비어 있으면 곡 아티스트)를 함께 묶어 같은 이름의 다른 앨범을 구분합니다. 대표 곡의 검증된 `getsongcover` URL로 목록과 상세 이미지를 표시하고, 디스크·트랙 순서로 정렬한 같은 곡 목록을 전체 재생에 사용합니다. 합본 앨범은 음악 파일에 공통 앨범 아티스트 태그가 있어야 하나로 묶입니다.

첫 앨범 조회는 전체 곡 메타데이터를 페이지 단위로 받아야 하므로 큰 보관함에서는 시간이 걸립니다. 앨범·아티스트·검색·앨범 상세는 계정별 메타데이터 캐시를 공유하고, 아래로 당겨 갱신할 수 있습니다. 목록은 FlatList로 가상화합니다. NAS의 `Album.list` 응답에 없는 `cover` 필드와 검증되지 않은 이름 전용 앨범 필터는 화면에서 사용하지 않습니다. SQLite에는 인증 URL을 저장하지 않으므로 오프라인 캐시에서는 커버가 없을 수 있습니다. 수정 후 실제 NAS의 앨범 표시·커버 다운로드·앨범 재생은 앱에서 확인해야 합니다.

`node scripts/check-album-library.cjs`는 실제 API 클라이언트와 앨범·조회·재생 선택 코드를 모의 HTTP/오디오로 검사합니다. 같은 제목의 서로 다른 앨범, 합본·다중 디스크, 여러 페이지의 곡 누락, 커버 주소, 공유 캐시·새로고침·계정 분리, 데모·빈 목록·조회 취소를 검증합니다. 이 검사는 실제 NAS 응답이나 기기 재생 검증을 대신하지 않습니다.

## 검색

입력한 검색어를 제목·아티스트·앨범에서 부분 일치로 찾습니다. 대소문자와 유니코드 정규화 차이를 처리하며, 공백으로 나눈 여러 검색어는 모두 일치해야 합니다. 입력은 350ms 후 반영되고 키보드 검색 버튼을 누르면 즉시 반영됩니다. 결과가 없는 경우와 로딩·오류·오프라인 상태를 구분하고, 아래로 당겨 목록을 새로 받을 수 있습니다.

사용자가 기존 NAS 검색에서 검색어와 무관하게 전체 곡이 반환되는 현상을 보고했습니다. 과거 진단은 `Song.search`의 요청 성공만 확인했으므로 `keyword` 필터가 적용된다는 근거가 부족했습니다. 앱은 이 원격 검색 호출을 제거하고, 검증된 통합 `Song.list` 메타데이터를 아티스트 화면과 같은 계정별 캐시로 공유해 검색합니다. 검색어를 바꿀 때마다 NAS 전체 목록을 다시 받지 않습니다. 캐시가 없는 첫 검색은 전체 메타데이터 조회가 완료될 때까지 기다립니다. 실제 NAS·실기기 검색 결과는 별도 확인이 필요합니다.

## Synology API 검증 범위

[Synology DSM Login Web API Guide](https://global.download.synology.com/download/Document/Software/DeveloperGuide/Os/DSM/All/enu/DSM_Login_Web_API_Guide_enu.pdf)에 따라 `/webapi/entry.cgi`의 `SYNO.API.Info` 버전 1 `query`로 NAS가 제공하는 API 경로와 버전을 조회합니다. 인증은 조회한 `SYNO.API.Auth` 경로에서 NAS가 지원하는 범위 내 버전 6을 우선 사용합니다. 공식 문서의 `_sid`, 선택적 `SynoToken`, OTP용 `otp_code` 전달 규칙을 따릅니다. 연결 시 곡·앨범·아티스트의 첫 페이지를 실제로 요청해 목록 응답 형태를 확인합니다.

2026-10-10에 내부 HTTP 주소와 외부 HTTPS 주소 모두에서 다음 API Info 응답을 확인했습니다. 내부 HTTP 주소로는 인증 요청을 실행하지 않았습니다.

| API | NAS가 반환한 경로 | 지원 버전 |
| --- | --- | --- |
| `SYNO.API.Auth` | `entry.cgi` | 1–7 |
| `SYNO.AudioStation.Song` | `AudioStation/song.cgi` | 1–3 |
| `SYNO.AudioStation.Album` | `AudioStation/album.cgi` | 1–3 |
| `SYNO.AudioStation.Artist` | `AudioStation/artist.cgi` | 1–4 |
| `SYNO.AudioStation.Stream` | `AudioStation/stream.cgi` | 1–2 |
| `SYNO.AudioStation.Cover` | `AudioStation/cover.cgi` | 1–3 |

Audio Station의 세부 API 매개변수와 응답 필드에 대한 최신 공식 스키마는 공개 자료에서 확인하지 못했습니다. API 경로·버전은 연결한 NAS의 API Info 응답만 사용합니다. 외부 HTTPS NAS에서 확인한 인증 요청 결과는 다음과 같습니다.

| 동작 | 확인 결과 |
| --- | --- |
| `SYNO.API.Auth.login` | `AudioStation` 세션 로그인 성공. 진단 스크립트는 세션 값을 출력하거나 파일에 저장하지 않음 |
| `Song.list` | `songs`, `total` 응답; 1곡. 기본 필드는 `id,path,title,type` |
| `Song.list`의 `additional=song_tag` | `additional.song_tag`에 `album,album_artist,artist,comment,composer,disc,genre,track,year` 필드 확인 |
| `Album.list`, `Artist.list` | 각 1건; 앨범은 `album_artist,artist,display_artist,name,year`, 아티스트는 `name` 필드 확인 |
| `Song.search` 요청 | 요청 성공만 확인; keyword의 실제 필터 적용은 미검증. 앱 검색에서는 사용하지 않음 |
| `Song.list`의 `album` 필터 | 과거 1건 요청 성공만 확인; 정확한 소속 곡 필터는 미검증. 앱 앨범 화면에서는 사용하지 않음 |
| `Cover.getsongcover`, `Stream.stream` | 각각 JPEG·FLAC, HTTP 206과 `Content-Range` 확인 |
| 로그아웃 후 `Song.list` | `success=false`, 오류 코드 105 확인 |

NAS에는 확인 시점에 곡·앨범·아티스트가 각각 1건이었습니다. `limit=1`과 `limit=2` 요청은 모두 1건을 반환해 여러 페이지 이동은 검증하지 못했습니다. 곡의 `duration` 필드는 기본 응답과 `song_tag` 응답에서 확인되지 않아 보관함에서는 0으로 남고, 재생 시 네이티브 플레이어가 보고하는 길이를 사용합니다. 실제 Android/iOS 앱에서의 로그인·이미지 표시·스트리밍·키보드·잠금 화면 동작은 이 HTTP 진단으로 검증되지 않았습니다. 응답이 예상 형식과 다르면 성공으로 처리하지 않고 오류를 보여줍니다.

Audio Station의 인증 전 오류 응답은 HTTP 200의 `text/plain`이지만 내용은 JSON이었습니다. 클라이언트는 Content-Type만으로 JSON 여부를 단정하지 않고 본문을 파싱하며, Tunnel의 HTML 응답은 별도 오류로 안내합니다.

세션 ID가 들어가는 커버·스트림 URL은 화면과 플레이어에서만 사용하고 SQLite에는 저장하지 않습니다. 이 URL이 외부 로그·공유 기능에 노출되지 않도록 유지해야 합니다.

## 확인 완료

- `pnpm exec tsc --noEmit` 통과
- `pnpm exec expo lint` 통과
- `pnpm exec expo export --platform android --output-dir .expo/export-test` 통과
- `pnpm exec expo export --platform ios --output-dir .expo/export-ios-test` 통과
- `pnpm exec expo export --platform all --output-dir .expo/export-all-test` 통과 (설정된 iOS·Android 두 플랫폼)
- `pnpm exec expo install --check` 및 `pnpm peers check` 통과
- Expo 네이티브 설정 검사에서 iOS `audio` 백그라운드 모드, Android 미디어 재생 foreground service 권한, HTTP 허용 설정을 확인함
- Mock 데이터와 합성 오디오가 Android 번들에 포함됨
- 외부 HTTPS NAS에서 인증·목록·검색·앨범 필터·커버·스트림 Range·로그아웃 후 오류 응답 확인

앱 자체의 정적·번들 검사와 별도의 NAS 진단 스크립트 결과입니다. 실제 기기의 화면 조작이나 앱에서 NAS로 재생한 결과를 뜻하지 않습니다.

## 개인 음악 보관함

보관함은 **공용 music + 로그인한 계정의 개인 home/music**을 통합 조회합니다. 곡·앨범·아티스트·검색·앨범 상세·커버·스트리밍에 같은 `library=all` 범위를 사용합니다. 계정 이름으로 파일 경로를 만들지 않고 인증된 Audio Station 세션이 접근 가능한 목록을 사용합니다. 캐시와 쿼리 키에는 NAS 주소·세션·조회 범위를 구분하므로 이전 공용 전용 목록이 통합 보관함에 재사용되지 않습니다.

[Synology 공식 자료](https://www.synology.com/en-global/dsm/7.4/software_spec/audio_station)에 따르면 개인 보관함을 활성화하면 `home/music`이 색인됩니다. NAS에 개인 음악이 없다면 공용 목록만 표시될 수 있습니다.

범위별 실제 검증은 다음 명령을 **DS audio와 같은 계정**으로 실행합니다. 403/406 응답에는 2단계 인증 코드를 로컬 터미널에서 묻습니다. 계정·비밀번호·인증 코드·세션 값은 공유하지 마세요.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-nas.ps1 -BaseUrl https://nas.example.com -LibraryOnly
```

2026-10-10에 사용자가 로컬 진단 스크립트를 DS audio와 같은 계정으로 실행해 다음 실제 NAS 응답을 확인했습니다. 첫 진단의 다른 계정은 개인 0곡이었고, 같은 계정에서는 개인 음악이 반환됐습니다. 2단계 인증을 거친 로그인과 로그아웃 후 오류 코드 105도 확인했습니다.

| 조회 범위 | 총 곡 수 | 앨범 수 | 아티스트 수 |
| --- | --- | --- | --- |
| 공용 `shared` | 2 | 2 | 1 |
| 개인 `personal` | 1,504 | 77 | 115 |
| 통합 `all` | 1,506 | 77 | 115 |

각 범위의 곡·앨범·아티스트 목록, 검색 요청, 앨범 필터 요청을 확인했습니다. 개인·통합 범위에서 커버 JPEG와 MP3 스트림에 Range HTTP 206 및 `Content-Range`가 반환됐고, 개인 첫 페이지 30개 ID가 통합 첫 페이지에 포함됨을 확인했습니다. 곡 값·계정명·세션·인증 코드는 이 문서에 기록하지 않습니다. 전체 1,504곡의 페이지 이동과 실제 앱의 개인 음악 재생·탐색·잠금 화면은 아직 기기에서 확인해야 합니다.

## 보관함과 재생 화면 조작

- 앨범·노래·아티스트는 탭 버튼이나 좌우 스와이프로 전환합니다. 각 목록의 스크롤 위치는 별도로 유지합니다. 미니 플레이어의 좌우 여백과 탭바 위 간격은 모두 8pt입니다.

- 보관함을 아래로 당기면 Audio Station의 곡·앨범·아티스트 첫 페이지를 모두 새로 요청하고 페이지네이션을 재설정합니다. 수동 새로고침은 오프라인 캐시로 성공을 대신하지 않습니다. 완료 시 서버의 총 곡 수를 표시하고, 실패하면 기존 목록과 재시도 안내를 유지합니다. 앨범 상세·검색 캐시도 무효화해 다음 조회에 갱신합니다. 빈 목록에서도 사용할 수 있으며, 데모 모드에서는 NAS 대신 데모 데이터만 갱신합니다.
- 재생 화면의 앨범 아트를 아래로 끌면 배경·곡 정보·컨트롤을 포함한 전체 플레이어가 손가락을 따라 내려가고 뒤의 화면이 드러납니다. 충분히 끌거나 빠르게 내려놓으면 보관함으로 돌아가고, 짧게 당기면 전체 화면이 원래 위치로 돌아갑니다. 음악은 계속 재생됩니다.
- 앱 표시 이름은 **YeongduMusic**입니다. 기기의 설치된 앱 이름을 변경하려면 네이티브 앱을 다시 빌드하고 설치해야 합니다.
- 실제 기기에서 새 곡 추가 후 새로고침, 빈 목록, 네트워크 오류·재시도, 작은 화면에서 짧은/긴 아트 스와이프와 재생 지속을 확인해야 합니다.

DS audio에는 새 곡이 보이지만 앱에는 보이지 않으면 같은 NAS 주소·계정인지 확인하고, 새로고침 완료 안내의 총 곡 수와 노래 목록의 추가 페이지를 확인하세요. 실제 추가 곡 반영은 NAS 인증과 앱 조작이 필요하므로 정적 검사만으로 검증했다고 표시하지 않습니다. DS audio에도 보이지 않는 경우에는 [Synology의 새 파일 색인 안내](https://kb.synology.com/en-global/DSM/tutorial/Why_can_t_I_see_the_files_I_just_added_on_Photo_Station_Audio_Station_or_iTunes_Server)를 참고하세요.

## Android 잠금 화면·알림창 곡 이동

Android 미디어 컨트롤은 이전 곡·재생/일시정지·다음 곡 버튼을 제공하도록 구성했습니다. 현재 `expo-audio` 57.0.5의 공식 `showSeekBackward`/`showSeekForward`는 10초 탐색이며 곡 이동이 아닙니다. 이 버전의 Android 미디어 세션이 곡 이동 명령을 제외하므로 `patches/expo-audio@57.0.5.patch`에 확장 코드를 보관하고 버전을 고정했습니다. `pnpm install`은 `pnpm-workspace.yaml`과 잠금 파일에 등록된 패치를 자동 적용합니다. SDK 57의 기본 prebuilt 바이너리 대신 수정 소스를 컴파일하도록 `package.json`의 `expo.autolinking.android.buildFromSource`에 `expo-audio`를 지정했습니다. EAS에도 패치 파일·workspace 설정·잠금 파일을 함께 포함해야 합니다. expo-audio를 올릴 때는 패치를 새 버전에 맞춰 확인해야 합니다.

Android 13 이상은 표준 MediaSession 곡 이동 명령과 버튼 슬롯을 사용하고, Android 12 이하는 알림의 명시적 버튼도 제공합니다. 버튼 이벤트는 기존 재생 컨트롤러로 전달하므로 앱 내 버튼과 동일한 대기열·셔플·반복 및 이전 곡 동작을 사용합니다. 재생 위치가 3초를 넘었다면 이전 버튼은 현재 곡의 처음으로 돌아갑니다. 재생을 종료하면 이벤트 구독도 제거합니다. iOS의 잠금 화면 컨트롤은 이 Android 전용 패치 대상이 아닙니다.

**네이티브 패치이므로 새 앱 빌드를 설치해야 합니다.** `pnpm install` 후 `pnpm exec expo run:android`를 실행하거나 기존 EAS 프로필로 APK를 다시 빌드하세요. Metro 새로고침이나 Expo Go로는 적용되지 않습니다. 기존 Android 네이티브 파일을 지울 필요는 없습니다.

삼성 One UI 실기기 확인: 대기열에 2곡 이상을 넣고 재생한 뒤 알림창을 확장하거나 잠금 화면의 음악 컨트롤을 열어 이전·다음 버튼과 실제 곡 이동, 곡 제목·앨범 아트 갱신, 일시정지 후 곡 이동, 빠른 연속 누름, 셔플·반복, NAS 세션 만료 시 오류 처리를 확인하세요. Android/One UI 버전과 잠금 화면 설정에 따른 실제 버튼 배치는 기기에서 확인해야 합니다.

참고: [Expo Audio SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/audio/), [Android MediaSession 컨트롤](https://developer.android.com/media/media3/session/control-playback).

### 삼성 잠금 화면·알림창 진행 바

미디어 컨트롤러가 곡 로딩 중 연결되면 `COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM`이 아직 없을 수 있습니다. 기존 패치는 이 시점의 `session.player.availableCommands`를 연결 권한으로 고정해, 음원의 길이와 탐색 가능 여부가 확인된 뒤에도 진행 바 탐색을 허용하지 않았습니다. 연결 권한은 `DEFAULT_PLAYER_COMMANDS`로 설정하고, Media3가 플레이어의 현재 지원 명령과 교집합을 계산하도록 수정했습니다. 따라서 탐색 가능한 곡은 로딩 후 진행 바를 사용할 수 있고, 라이브·탐색 불가 음원에는 탐색을 강제로 활성화하지 않습니다. 이전·다음 곡 명령은 기존 대기열 패치를 계속 사용합니다. [Media3 컨트롤러 명령 권한](https://developer.android.com/reference/androidx/media3/session/MediaSession.ConnectionResult.AcceptedResultBuilder#setAvailablePlayerCommands(androidx.media3.common.Player.Commands))

패치 파일은 Windows에서도 LF 줄바꿈을 유지하도록 `.gitattributes`에 지정했고, 패치 해시를 잠금 파일에 갱신했습니다. **수정 반영에는 새 Android 앱 빌드 설치가 필요합니다.** 기존 EAS 프로필로 `npx eas-cli@latest build --platform android --profile preview`를 실행해 새 APK를 설치하세요.

실기기 확인: MP3·FLAC를 각각 처음 재생하고 곡 길이가 표시된 뒤 잠금 화면과 확장 알림창에서 진행 바를 앞뒤로 끌어 실제 소리와 앱의 재생 위치가 함께 이동하는지 확인하세요. 일시정지 상태의 탐색, 재개 후 위치, 다음 곡 전환 후 길이·위치 갱신, 이전·다음 버튼도 확인해야 합니다. 패치 설치·린트·타입 검사와 기존 재생 엔진 회귀 검사는 통과했으며, 삼성 One UI 실기기 동작과 새 APK의 네이티브 실행은 별도로 확인해야 합니다.

## 앨범 아트 배경

재생 화면은 앨범 아트의 대표 색상을 추출해 대각선 3단 그라데이션으로 표시합니다. 밝은 이미지도 흰색 컨트롤이 보이도록 배경 밝기를 제한하고, 곡 변경 시 약 0.9초 동안 배경을 교차 전환합니다. 시스템의 모션 줄이기 설정을 존중합니다. 데모는 곡에 지정된 팔레트를 사용합니다. 이미지가 없거나 색상 추출이 실패하면 기본 배경을 사용하며 음악 재생에는 영향을 주지 않습니다. 빠르게 곡을 넘길 때 이전 이미지의 늦은 응답은 무시하고, 색상 추출과 최대 24개의 메모리 캐시는 전역 재생 상태를 따라 관리합니다. 재생 화면을 닫거나 일시정지해도 현재 곡의 색상을 유지하고, 다시 열면 저장된 색상으로 바로 표시합니다. 화면을 닫은 동안 곡이 바뀌어도 색상을 갱신합니다. 같은 이미지의 진행 중 요청은 공유하고, 로그아웃/재생 종료 시 캐시를 지웁니다. 그라데이션 전환은 기존 레이어의 색상·투명도를 초기화하지 않고 새 레이어를 투명한 상태에서 겹쳐 표시하므로 빠르게 곡을 바꿀 때도 이전 배경이 깜빡이지 않습니다. 인증 정보가 포함된 이미지 URL은 파일이나 로그에 기록하지 않습니다.

색상 추출에는 `react-native-image-colors` 네이티브 모듈을 사용합니다. **기존 설치 앱을 다시 빌드해야 실제 앨범 색상이 적용됩니다.** `pnpm exec expo run:android` 또는 기존 EAS 프로필로 새 빌드를 설치하세요. macOS에서는 `pnpm exec expo run:ios`를 사용합니다. Expo Go나 모듈이 없는 이전 빌드에서는 기본/데모 팔레트로 실행됩니다. 기존 Android 네이티브 파일을 삭제하거나 재생성할 필요는 없습니다.

실기기에서 NAS 커버의 색상 추출, 밝은/어두운 이미지, 빠른 다음 곡 전환, 이미지 오류, 모션 줄이기, 플레이어를 아래로 닫는 동작을 확인해야 합니다.

## 실제 NAS 및 기기 확인 목록

1. 실제 앱에서 NAS 로그인, 2단계 인증, 계정 권한 부족 오류를 확인한다.
2. 빈 라이브러리와 큰 라이브러리에서 `total`·`offset`·`limit`, 정렬과 마지막 페이지를 확인한다.
3. 실제 NAS의 같은 이름 앨범·합본 앨범·다중 디스크에서 태그 기반 앨범 구분, 소속 곡과 트랙 순서를 확인한다.
4. 실제 플레이어에서 스트림 재생·seek·인증 유지·커버 표시를 확인한다. Range HTTP 206만 진단 스크립트로 검증했다.
5. 만료된 세션에서 API 요청뿐 아니라 커버·스트림 요청의 오류와 재로그인 경로를 확인한다.
6. iOS와 Android 실기기에서 잠금 화면, 백그라운드 지속 재생, 블루투스/헤드폰 연결 해제, 전화 인터럽트, 미디어 알림과 배터리 최적화 상황을 확인한다. [Expo Audio 문서](https://docs.expo.dev/versions/v57.0.0/sdk/audio/)에 맞춰 `enableBackgroundPlayback`, `shouldPlayInBackground`, `setActiveForLockScreen`을 설정했습니다.
7. HTTP NAS에서는 명시적 허용 후 iOS·Android 실기기 연결을 확인한다. 가능하면 신뢰 가능한 HTTPS를 구성한다. 자체 서명 인증서의 신뢰 처리도 별도로 검증한다.

## 남은 작업

- 다수의 곡·앨범이 있는 NAS로 페이지네이션, 앨범 식별과 곡 길이 필드 확인
- 잠금 화면의 다음/이전 곡 조작과 세션 만료 중 재생 오류 동작 검증
- 큰 라이브러리에서 아트 로딩 및 목록 정렬 성능 측정

## 음악 숨기기와 프리셋

설정 → 음악 숨기기에서 프리셋을 만들고 폴더 또는 곡을 여러 개 선택합니다. 선택한 항목만 보기와 검색으로 목록을 검토할 수 있습니다. 프리셋은 이름을 지정해 저장·편집·삭제하고 여러 개를 동시에 켤 수 있습니다. 활성 프리셋의 합집합으로 곡을 숨깁니다. 선택한 폴더는 하위 폴더와 새로 추가한 곡에도 적용하며, 새 파일은 NAS 색인과 앱 새로고침 후 반영됩니다. 폴더 선택은 검증된 Song.list의 path에서 곡이 있는 폴더를 만들며 새 폴더 탐색 API를 가정하지 않습니다. 곡 선택은 현재 NAS 곡 ID를 사용하므로 NAS에서 파일을 재색인하여 ID가 바뀌면 다시 선택해야 할 수 있습니다.

보관함·검색·앨범·아티스트·상세·새 재생 대기열에 같은 숨김 규칙을 적용합니다. 전부 숨겨진 앨범/아티스트는 목록에서 제외하고 대표 커버와 건수도 보이는 곡으로만 계산합니다. 이미 대기열에 들어간 숨김 곡은 제거하며, 현재 재생 곡을 숨기면 재생을 멈추고 대기열과 잠금 화면 음악 정보를 정리합니다. 표시할 곡은 전체 메타데이터를 페이지 단위로 받은 뒤 FlatList로 가상화합니다. 큰 보관함의 첫 곡·아티스트 조회도 시간이 걸릴 수 있으며 모든 화면이 같은 캐시를 공유합니다.

프리셋과 잠금 상태는 별도 music-privacy.db에 NAS 주소·입력한 로그인 계정별로 저장하며 재로그인과 일반 보관함 캐시 삭제 후에도 유지됩니다. 주소를 다르게 입력하면 별도 설정으로 취급합니다. 로그인 계정명은 기존 SecureStore 세션에 보관하며 비밀번호를 저장하지 않습니다. 이전 버전의 세션에는 계정명이 없어 숨김 설정에서 재로그인을 안내합니다. 데모는 별도 프리셋을 사용합니다. 파일·음악 URL·NAS 권한은 변경하지 않습니다.

생체 인증 잠금을 켜면 프리셋 화면을 열 때 등록된 지문/Touch ID/Face ID로 인증합니다. Android는 strong 생체 인증을 요청하고 PIN 대체를 허용하지 않습니다. 인증 실패·취소·미등록 기기는 성공으로 처리하지 않으며, 잠금 설정은 인증이 성공한 뒤 저장됩니다. 설정 화면을 떠나거나 앱이 백그라운드로 가면 다시 잠깁니다. 잠겨 있어도 활성 숨김 규칙은 유지됩니다. 프로필 읽기·파싱 실패 시 숨김 목록을 빈 값으로 바꿔 노출하지 않고 재시도를 제공합니다. 쓰기 실패 시 기존 프리셋을 유지합니다. 이것은 앱 내 숨김 설정의 접근 잠금이며 NAS 파일이나 SQLite 메타데이터를 암호화하는 기능은 아닙니다.

expo-local-authentication ~57.0.3을 추가했습니다. **기존 앱을 다시 빌드하고 설치해야 생체 인증 모듈과 iOS 사용 설명이 반영됩니다.** pnpm exec expo run:android 또는 기존 EAS 프로필로 새 빌드를 설치하고, iOS는 macOS에서 빌드합니다. Android 네이티브 프로젝트를 삭제하거나 clean prebuild하지 않았습니다. Face ID는 Expo Go에서 검증할 수 없으므로 개발 빌드를 사용합니다. [Expo SDK 57 생체 인증 문서](https://docs.expo.dev/versions/v57.0.0/sdk/local-authentication/)

실기기 확인 항목: 삼성 지문 등록/미등록, 인증 취소·실패·일시 잠금, 화면 이탈·백그라운드 후 재잠금, 프리셋 변경·재시작·재로그인·다른 계정 분리, 폴더 경계와 개인/공용 음악 선택, 새 음악 추가 후 숨김, 기존 대기열과 현재 재생 곡 제거, 네트워크/저장 실패, iOS Face ID/Touch ID 및 키보드·작은 화면입니다. 모의 인증이나 HTTP 테스트를 실제 기기 검증으로 대신하지 않습니다.

숨김 기능 회귀 검사는 `node scripts/check-hidden-music.cjs`로 실행합니다. 모의 SQLite·생체 인증·오디오로 폴더 경계·하위 폴더·새 곡, 활성 프리셋 합집합, 계정/NAS별 보존, 보호된 변경, 실패/취소/늦은 인증과 재잠금, 오래된 계정 조회 무시, 전체 화면의 필터와 raw 캐시 공유, 대기열 정리·현재 곡 중단·오디오 초기화 취소를 확인합니다. 앨범과 배경의 기존 회귀 검사, TypeScript·린트·SDK 의존성 검사, iOS·Android 번들 생성도 통과했습니다. Expo 설정에서 생체 인증 플러그인과 iOS NSFaceIDUsageDescription을 확인했으며 Android 모듈에 USE_BIOMETRIC/USE_FINGERPRINT 권한 선언이 있습니다. 새 네이티브 APK/IPA와 실제 인증 성공·NAS 숨김 동작은 아직 기기에서 검증하지 않았습니다.


## 외부 NAS 스트리밍의 간헐적 끊김

외부 HTTPS 주소에서 잠깐 끊긴 뒤 이어지는 증상이 보고되었습니다. 코드 확인에서 주기적인 플레이어 재생성이나 숨김 설정의 반복 중단 경로는 발견하지 못했습니다. 재버퍼링은 가능한 원인이지만 실제 휴대폰 로그가 없어 NAS 업로드·Cloudflare Tunnel·휴대폰 연결·디코더 중 어느 구간이 원인인지 확정하지 않았습니다. 기존 Range 1KB 응답 성공은 장시간 전송 속도나 실제 재생의 검증이 아닙니다.

Android 플레이어의 preferredForwardBufferDuration을 120초로 지정했습니다. 설치된 expo-audio 57.0.5는 이를 Media3 1.9.0의 최대 선행 버퍼에 적용하며, 기본 상한은 50초입니다. 시작·재버퍼링 후 재개 임계값과 기본 메모리 제한은 유지합니다. 120초를 모두 내려받은 뒤 재생을 시작하는 설정이 아니며, 실제 확보되는 버퍼는 네트워크 속도·파일 비트레이트·네이티브 메모리 제한에 따라 더 짧을 수 있습니다. 메모리 사용과 앞부분 데이터 다운로드가 늘 수 있고, 지속 전송 속도가 음원 비트레이트보다 낮으면 이 설정으로 해결할 수 없습니다. [Expo SDK 57 Audio 설정](https://docs.expo.dev/versions/v57.0.0/sdk/audio/), [Media3 1.9.0 LoadControl 소스](https://github.com/androidx/media/blob/1.9.0/libraries/exoplayer/src/main/java/androidx/media3/exoplayer/DefaultLoadControl.java)

iOS 57.0.5 구현은 생성 시의 AVPlayerItem에만 해당 옵션을 적용합니다. 현재 null로 생성하고 replace()로 곡을 교체하는 전역 엔진에는 같은 옵션이 유지되지 않아 iOS는 시스템 기본 버퍼를 사용합니다. 이번 변경은 Android 버퍼 개선이며 iOS 개선으로 검증하지 않습니다. 추가 네이티브 패치나 기존 잠금 화면 곡 이동 패치 변경은 없습니다. JavaScript 변경이므로 이 수정 자체 때문에 네이티브 프로젝트를 다시 생성할 필요는 없습니다. 배포 APK에는 변경한 JavaScript를 포함한 새 빌드 또는 프로젝트에서 구성한 업데이트가 필요합니다.

개발 빌드의 Metro 로그에는 초기 로딩을 제외하고 재생이 시작된 후 네이티브 isBuffering 상태가 켜질 때 [Playback] Buffering started와 재개 시 Buffering ended가 출력됩니다. 재생 위치(초)와 관측 지속 시간(ms)만 기록하고 NAS 주소·세션·헤더·곡 정보는 기록하지 않습니다. 앱 내 일시정지·탐색·곡 교체·재생 종료는 관측을 초기화합니다. 로그 시간은 이벤트 전달 기준으로, 실제 오디오가 멈춘 시간을 정밀 측정하지 않습니다. 운영 빌드에는 이 개발용 로그가 없습니다.

동일한 곡을 외부 주소와 동일 LAN의 NAS 직접 주소에서 각각 3~5분 재생해 끊김과 위 로그를 비교하세요. 직접 연결 주소에는 기존 인증서/HTTP 연결 정책을 그대로 적용합니다. MP3·FLAC, 화면 켜짐·잠금, Wi-Fi·모바일 데이터를 각각 비교하면 원인을 좁힐 수 있습니다. 외부에서만 재버퍼링되면 NAS 업로드와 터널 경로를 함께 점검해야 합니다. 로그 없이 소리가 끊기는 경우에는 디코더·블루투스·오디오 포커스·기기 절전도 확인해야 합니다.

백그라운드에서 재생이 멈추고 다른 곡을 선택해야 재개되는 증상에 대응해 연결 복구를 추가했습니다. 짧은 버퍼링은 네이티브 플레이어가 처리하며, 재생 오류 또는 20초 이상 로딩·버퍼링이 이어지면 같은 곡의 연결을 다시 준비합니다. Android는 버퍼링 중 주기적인 상태 이벤트를 보내지 않으므로 최초 전환에서 타이머를 시작합니다. 새 음원이 준비된 뒤 마지막 재생 위치로 탐색하고 재개하며, 곡과 대기열은 유지합니다. 재시도 간격은 1·3·6초이고 최대 3번 시도합니다. 잠깐 재개됐다는 이유로 횟수를 초기화하지 않으며, 30초 동안 진행된 뒤 초기화합니다. 실패가 계속되면 오류와 다시 재생할 수 있는 상태를 유지합니다. 앱에서 일시정지하거나 곡을 변경하거나 재생을 종료하면 대기 중 재시도와 늦게 완료된 탐색의 자동 재생을 취소합니다.

회귀 검사: node scripts/check-playback-buffer.cjs. 실제 엔진 소스에 모의 네이티브 플레이어와 가상 타이머를 연결해 짧은 버퍼링에서 연결을 유지하는지, Android/iOS 오류·장기 버퍼링·초기 로딩 실패 시 위치를 복원하는지, 재시도 횟수 제한·오류 유지·수동 재개·중단·곡 변경·늦은 탐색·이전 음원의 상태 이벤트를 처리하는지 검사합니다. 진단의 초기 로딩·탐색·일시정지 구분과 구독 정리도 확인합니다. 모의 상태 이벤트는 실제 NAS·삼성 기기의 끊김 개선을 입증하지 않습니다. JavaScript 타이머에 의존하는 복구는 OS가 프로세스나 JavaScript 실행을 중지한 상황에서는 즉시 실행되지 않을 수 있으므로, 새 버전에서 화면을 끈 채 MP3·FLAC를 장시간 재생하고 잠금 화면 일시정지와 네트워크 단절·복귀를 확인해야 합니다.


## 앱 아이콘과 상세 화면 탐색

앱 아이콘은 로그인 화면의 흰색 Ionicons musical-notes와 분홍·보라·남색 세로 그라데이션을 사용합니다. 1024px 기본 아이콘과 Android adaptive foreground/background, Android 13 이상 단색 음표를 구성했습니다. glyph 윤곽은 설치된 Ionicons 폰트에서 추출해 assets/branding/musical-notes.json에 보관합니다. 음표는 Ionicons의 MIT 라이선스를 따르며 원문을 assets/branding/LICENSE에 포함했습니다. PNG 생성은 추가 의존성 없이 node scripts/generate-icon.js로 재현됩니다. 기존 스플래시는 유지합니다.

앨범·아티스트 상세는 (tabs)/(library)의 Stack에 포함되어 보관함·검색·설정 탭과 미니 플레이어가 유지됩니다. 상세 목록의 끝에 하단 메뉴와 안전 영역 공간을 확보합니다. /album/[id]와 /artist/[id] URL은 유지되며 Android 뒤로가기는 상세에서 보관함으로 돌아갑니다. 곡 선택 또는 전체 재생은 기존 대기열 로직을 거친 뒤 전체 플레이어를 엽니다. 플레이어 내부의 대기열 선택과 알림 곡 이동은 화면을 새로 열지 않습니다.

아이콘은 Metro 새로고침으로 홈 화면에 반영되지 않습니다. 생성된 android 폴더가 있는 로컬 프로젝트에는 Expo의 아이콘 생성 함수로 해당 리소스만 갱신했습니다. clean prebuild는 실행하지 않았습니다. EAS에는 app.json, PNG 세 개, glyph JSON, 생성 스크립트를 포함해 새 빌드를 설치하세요. 런처가 이전 이미지를 캐시하면 앱 재설치 또는 런처 캐시 갱신이 필요할 수 있습니다. [Expo 아이콘 설정](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/)

실기기 확인: 로그인 아이콘과 홈 화면 아이콘, 삼성 adaptive/테마 아이콘, 상세에서 탭 이동 및 뒤로가기, 상세의 마지막 곡 터치, 보관함·검색·앨범·아티스트에서 곡 선택과 전체 플레이어, 플레이어 닫기·미니 플레이어·재생 지속을 확인합니다.

검증: TypeScript·린트, iOS/Android 번들 생성, Android :app:processReleaseResources가 통과했습니다. node scripts/check-navigation.cjs는 실제 파일 경로에서 Expo Router가 만든 보관함 Stack과 상세 경로, 곡 선택·취소·늦은 재생 완료의 화면 전환을 검사합니다. 화면 렌더링과 실제 기기의 조작·재생은 별도 확인이 필요하며 APK 설치나 원격 EAS 빌드는 수행하지 않았습니다.


숨김 폴더 선택은 상위 폴더부터 펼치고 접는 트리로 표시합니다. 화살표는 펼침/접기, 이름·체크박스는 숨김 선택입니다. 접어도 선택이 유지되며 상위 폴더를 선택하면 하위 곡과 새 곡을 숨기는 기존 규칙을 유지합니다. 검색과 선택한 항목만 보기는 해당 폴더의 상위 경로를 자동으로 펼쳐 표시합니다. 현재 목록에 곡이 없어도 저장된 선택 폴더는 0곡으로 표시해 선택을 해제할 수 있습니다. 생체 인증과 프리셋 스위치는 분홍색 활성 트랙·흰색 손잡이·중립색 비활성 트랙을 명시해 Android 기본 초록색 손잡이를 사용하지 않습니다. [React Native Switch 설정](https://reactnative.dev/docs/switch)

폴더 트리 로직은 node scripts/check-folder-tree.cjs로 검사합니다. 상위·하위 경로와 곡 수, 접기 후 선택 보존, 검색/선택 보기의 상위 경로, 상위 선택으로 하위 곡 숨기기, 저장된 빈 폴더, 상대 경로와 많은 폴더를 검사하며 실제 화면 렌더링은 기기 확인이 필요합니다.

## 가사 보기

전체 플레이어 하단의 **가사** 버튼으로 앨범 아트 대신 가사를 표시합니다. 앨범 아트 배경색과 재생 컨트롤은 유지합니다. 소스는 **자동 / NAS / 온라인**으로 선택합니다.

- **NAS**: API Info가 제공하는 경로·버전으로 `SYNO.AudioStation.Lyrics.getlyrics`를 호출합니다. 2026-10-11 사용자의 실제 NAS 진단에서 `AudioStation/lyrics.cgi`, v1–2, `id`·`library=all`, `data.lyrics` 문자열 응답을 확인했습니다. 샘플 5곡 중 1곡은 652자 일반 가사, 4곡은 빈 문자열이었습니다. 실제 NAS의 시간 정보가 있는 응답은 아직 검증하지 않았습니다.
- **온라인**: [LRCLIB 공식 API](https://lrclib.net/docs)의 `/api/get`을 사용합니다. 가사 화면이 열려 있을 때만 곡 제목·아티스트·앨범·길이로 조회하며, NAS 주소·곡 경로·계정·토큰·음원은 전송하지 않습니다. 요청을 직렬화하고 요청 간 간격 및 `Retry-After`를 지킵니다. 안드로이드/iOS에서는 `User-Agent`와 `Lrclib-Client`로 앱을 식별하고, 브라우저에서는 `Lrclib-Client`를 사용합니다. 공개 예시 요청 비교에서 기본 안드로이드 `User-Agent`는 HTTP 520, 앱 식별값은 HTTP 200을 반환하는 것을 확인했습니다.
- **자동**: NAS 동기화 가사 → 온라인 동기화 가사 → NAS 일반 가사 → 온라인 일반 가사 순으로 선택합니다. NAS 인증 만료는 기존 세션 보호 로직으로 처리합니다. 가사 조회 실패가 음악 재생을 중단시키지 않습니다.

LRC의 줄별 시간 정보가 있으면 오디오 엔진의 실제 재생 위치로 현재 줄을 강조하고 자동 스크롤합니다. 가사 줄을 누르면 해당 시점으로 이동합니다. 직접 스크롤하면 자동 추적이 멈추고 **현재 가사로** 버튼으로 복귀합니다. 시간 정보가 없는 일반 가사는 전체 텍스트를 표시하며 타이밍을 임의로 생성하지 않습니다. 줄 단위 동기화이며 단어별 노래방 강조는 지원하지 않습니다.

가사 요청에는 로딩·빈 결과·연주곡·오류·재시도가 있고, 곡/계정/소스별 TanStack Query 캐시와 AbortSignal로 오래된 요청을 분리합니다. 데모 모드에는 합성 음원용 자체 제작 동기화 예시가 있으며 외부 서비스에 조회하지 않습니다. 가사 캐시는 메모리에만 유지합니다.

읽기 전용 NAS 진단(계정·비밀번호·OTP는 로컬 터미널에만 입력):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-nas.ps1 -BaseUrl https://nas.example.com -LyricsOnly
```

예시 주소는 본인의 NAS HTTPS 주소로 바꾸세요. 진단은 API 경로·필드 이름·길이·타임스탬프 개수만 출력하며 가사 내용과 인증 정보는 출력하지 않습니다. 실제 NAS 일반 가사 응답은 사용자 진단으로 확인했습니다. 온라인 API 어댑터·LRC 파서·취소/타임아웃·소스 선택은 `node scripts/check-lyrics.cjs`로 검증합니다. iOS/Android 실기기에서 긴 가사 줄의 자동 스크롤, 줄 선택 seek, 곡 전환, 일시정지/반복/백그라운드 복귀 및 온라인 가사 일치 여부를 확인해야 합니다.

검증 결과(2026-10-11): NAS 응답은 사용자의 로컬 진단으로 확인했고, 실제 LRCLIB 어댑터를 공식 문서의 공개 예시 곡으로 실행해 동기화 가사 47줄을 수신했습니다(가사 본문 출력 없음). 네이티브 가사 화면 렌더링·스크롤·음원별 시간 일치는 아직 실기기에서 확인하지 않았습니다. Windows의 애플리케이션 제어가 `pnpm.exe`를 차단해 `pnpm check-types`/`pnpm lint`는 실행되지 않았으며, 설치된 TypeScript/ESLint CLI를 직접 실행해 검증합니다:

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src scripts/check-lyrics.cjs --no-cache
node scripts/check-lyrics.cjs
```

Expo 라우트 타입은 오프라인 개발 서버로 다시 생성했습니다. 새 타입에 맞춰 로그인·세션 진입·플레이어 닫기의 보관함 목적지를 `/(tabs)/(library)`로 명시했습니다.
