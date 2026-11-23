# 의존성 보안 점검 및 업데이트 — 2026-11-23

Expo SDK 58과 기존 음악·인증·저장 구조를 유지하면서 호환 가능한 패치만 적용했다. 새로운 앱 의존성, 인증 권한, 전역 보안 override는 추가하지 않았다. 기존 React 19.3.0 / React Native 0.88.1 / Reanimated 4.7.1 / Worklets 0.13.0 / Gesture Handler 3.3.0 조합은 그대로다.

## 보안 감사 전후

pnpm 12.4.2, Node 24.21.0에서 npm 보안 공지를 다시 조회했다. 숫자는 중복 설치 경로를 합친 고유 공지 수이며, 운영·개발 결과는 서로 겹치므로 합산하지 않는다.

| 범위 | 변경 전 | 변경 후 |
| --- | --- | --- |
| 전체 | 26: High 9, Moderate 10, Low 7 | 2: Moderate 2 |
| 운영 (`--prod`) | 25: High 8, Moderate 10, Low 7 | 2: Moderate 2 |
| 개발 (`--dev`) | 2: High 1, Moderate 1 | 1: Moderate 1 |

Critical은 전후 모두 0이다. 잔여 공지가 있으므로 최종 `pnpm audit` 종료 코드는 1이다. 감사 예외나 경고 숨김으로 통과시킨 결과가 아니다. Expo CLI가 `expo`의 간접 의존성이므로 `--prod` 결과에도 개발·빌드 도구가 포함된다.

| 의존성 | 변경 | 공지와 실제 사용 경로 |
| --- | --- | --- |
| `fast-xml-parser` (직접) | 5.11.2 → 5.12.1 | Low 1건 해소. S3 응답 파서에서 사용. [공지](https://github.com/NaturalIntelligence/fast-xml-parser/security/advisories/GHSA-474x-hrwr-fgx4)의 발생 조건인 비기본 `stopNodes` 옵션은 사용하지 않는다. 기존 XML 검증·4MiB 제한·DOCTYPE/ENTITY 거부를 유지하고 회귀 검사했다. |
| `node-forge` (간접) | 1.4.0 → 1.4.3 | 21건(High 8 / Moderate 7 / Low 6) 해소. Expo CLI·code-signing-certificates의 인증서 처리 경로. 각 공지의 수정 하한 중 가장 높은 1.4.3을 만족한다. 상위의 기존 `^1.4.0` 등 허용 범위 안에서 해결했다. [공식 변경 기록](https://github.com/digitalbazaar/forge/blob/main/CHANGELOG.md). |
| `zod` (간접) | 3.25.76 → 4.6.7 | [High 공지](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) 해소. ESLint React Hooks 플러그인의 개발 환경 경로다. 플러그인과 `zod-validation-error@4.0.2` 모두 Zod 3/4를 명시적으로 지원한다. 전역 메이저 override 없이 허용 범위에서 갱신했고 실제 린트를 통과했다. |
| `glob` (간접) | 취약한 13.0.6 경로 제거 | [Moderate 공지](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) 해소. Expo SDK 패치에 따른 상위 도구 갱신으로 해결했다. 별도 glob 메이저 override를 추가하지 않았다. |

최신 registry 버전과 무조건 같게 맞추지는 않았다. 예를 들어 조회 당시 `node-forge` 최신은 1.4.4였으나, 현재 상위 의존성·pnpm 설치 정책으로 선택된 1.4.3에서 감사된 21건은 모두 해소됐다.

## 적용한 직접 의존성

Expo 관련 패키지는 설치된 SDK 58의 `bundledNativeModules.json`과 [`v58.0.0` 공식 문서](https://docs.expo.dev/versions/v58.0.0/)를 확인하고 `pnpm exec expo install`로 선택했다.

| 패키지 | 설치 전 → 설치 후 |
| --- | --- |
| `expo` | 58.0.23 → 58.0.26 |
| `@expo/ui` | 58.0.27 → 58.0.29 |
| `expo-audio` | 58.0.11 → 58.0.12, 정확한 버전 고정 |
| `expo-asset` / `expo-constants` | 58.0.20 → 58.0.21 / 58.0.15 → 58.0.16 |
| `expo-blur` / `expo-document-picker` | 58.0.5 → 58.0.6 / 58.0.4 → 58.0.5 |
| `expo-file-system` / `expo-font` | 58.0.13 → 58.0.14 / 58.0.11 → 58.0.12 |
| `expo-haptics` / `expo-linear-gradient` | 58.0.7 → 58.0.8 / 58.0.3 → 58.0.4 |
| `expo-linking` / `expo-local-authentication` | 58.0.16 → 58.0.17 / 58.0.2 → 58.0.3 |
| `expo-media-library` / `expo-router` | 58.0.13 → 58.0.14 / 58.0.30 → 58.0.32 |
| `expo-secure-store` / `expo-splash-screen` | 58.0.2 → 58.0.3 / 58.0.13 → 58.0.14 |
| `expo-sqlite` / `expo-status-bar` | 58.0.15 → 58.0.18 / 58.0.4 → 58.0.5 |
| `@tanstack/react-query` | 5.104.1 → 5.105.3, 정확한 버전 고정 |
| `fast-xml-parser` | 5.11.2 → 5.12.1 |
| `react-native-image-colors` | 2.6.0 → 2.6.1 |

`react-native-web`는 설치 버전 0.21.4를 유지하며 선언 범위만 `~0.21.0`에서 `~0.21.4`로 정렬했다. 다른 Expo 모듈·TypeScript·ESLint 및 React 계열 버전은 유지했다.

Query는 [5.105.3의 완료된 fetch 결과 메모리 보유 수정](https://github.com/TanStack/query/blob/main/packages/query-core/CHANGELOG.md)을 반영했다. 조회 당시 최신 5.108.3은 당일 공개된 버전이어서 채택하지 않았고, 최종 workspace에 릴리스 연령 예외를 남기지 않았다. 캐시 정책과 Query 호출 코드는 바꾸지 않았다.

`image-colors@2.6.1`은 AGP 9에서 Kotlin extension을 중복 등록하지 않도록 하는 작은 Android 빌드 수정만 포함한다. 앱의 팔레트 추출 동작과 JS API는 유지된다.

Expo SQLite 패치는 잠금 오류 이후 연결의 후속 트랜잭션이 계속 실패하는 문제 등을 수정한다. FileSystem 패치는 pipe로 전달되는 Android `content://` 파일의 복사와 크기 정보가 잘못된 업로드 처리를 수정한다. 앱의 스키마, 파일 경로, 토큰 저장 키와 데이터 복구 정책은 바꾸지 않았다.

## 프로젝트 패치 보존

업데이트 전에 두 패키지의 npm 원본에 등록된 패치를 적용해 현재 설치 소스와 비교했다. `expo-audio@58.0.11`의 공개 파일은 줄바꿈을 정규화하면 모두 일치했다. masked-view의 유일한 추가 차이는 자체 `android/build.gradle`이 생성하는 Manifest의 package 제거였고, 별도의 수동 수정이 아니었다.

- `expo-audio@58.0.12`는 `pnpm patch --edit-dir dist/dependency-security/audio-patch`로 준비한 node_modules 밖의 사본에서 기존 패치를 이식하고 `pnpm patch-commit`으로 등록했다. 패치 14개 파일의 목적을 모두 보존했다: Android WakeLock, 미디어 세션 이전·다음 곡, 리스너 전달과 탐색, 최근 앱 제거 후 재생 유지, 오디오 세션 ID, iOS 원본 포맷 힌트와 오래된 앨범 아트 콜백 차단 등.
- upstream 58.0.12의 실질 수정은 iOS `AudioStream` 시작 실패 정리·다채널 입력 처리다. 기존 재생 패치와 충돌하지 않았다. Android 소스 빌드 설정도 유지했다.
- masked-view는 Expo 권장 0.3.2와 기존 엄격한 RN 타입 대응 패치를 유지했다.
- `patches/expo-audio@58.0.12.patch`, workspace 등록 및 lockfile의 패치 해시를 함께 갱신했다. 이전 패치 파일들은 보존했다.
- 기존 설치를 삭제하지 않고 OS 임시 폴더의 소스 복사본에서 `--frozen-lockfile --ignore-scripts --side-effects-cache=false` 설치를 했다. 두 패치가 건드린 총 15개 파일의 실제 내용이 원래 설치와 모두 일치했다. 이 비교를 `check-clean-export.cjs`에 추가했다.

## 잔여 취약점과 보류한 업데이트

1. **`file-type@16.5.4`, Moderate — [GHSA-5v7r-6r5c-r473](https://github.com/advisories/GHSA-5v7r-6r5c-r473).** 비정상 ASF 파일의 크기가 0인 하위 헤더로 인한 루프 문제다. 경로는 `react-native-image-colors → node-vibrant → @vibrant/image-node → Jimp → file-type`이다. 수정 버전은 21.3.1 이상이지만 Jimp의 CommonJS 및 `fromBuffer` 사용을 깨뜨릴 수 있어 16→21 전역 강제를 하지 않았다. image-colors 2.6.1과 현재 Vibrant 버전도 이 간접 경로를 제거하지 않는다. 앱의 Android/iOS 팔레트 구현은 네이티브 `ImageColors` 모듈을 직접 사용하며 image-colors는 타입으로만 참조한다. 두 모바일 프로덕션 소스맵에서 `file-type`·Jimp·`@vibrant/image-node`는 발견되지 않았다. 이후 Node 환경에서 이 패키지를 실행하는 새 기능에는 이 결론을 적용할 수 없다.
2. **`minimatch@10.2.6`, Moderate — [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).** glob 패턴 처리의 서비스 거부 가능성이다. Expo fingerprint의 `^10.2.6`, TypeScript ESLint의 `^10.2.2` 등 개발·빌드 도구 경로에 남는다. 수정은 11.0.1 이상으로 현재 상위 범위를 벗어나므로 강제하지 않았다. 모바일 원격 음악 입력을 이 glob 경로로 전달하지 않는다. 도구에 신뢰할 수 없는 패턴을 입력하는 경우의 위험까지 해소된 것은 아니다.

AWS presigner 3.1149.0 / URL formatter 3.972.49 / Smithy 5.6.2는 유지했다. 최신 AWS 변경 기록은 검토했지만 현재 앱의 서명 URL 경로에 적용할 보안 수정이 감사에서 확인되지 않았다. 안정적인 S3 서명 동작에 불필요한 간접 의존성 변화를 추가하지 않았다.

Zustand 5.0.15도 유지했다. [5.1.0의 변경](https://github.com/pmndrs/zustand/releases/tag/v5.1.0)은 persist의 PromiseLike 처리·DevTools 확장으로 현재 앱에 필수적이지 않으며, 이번에 저장·복구 수명까지 변경할 이유가 없었다.

Google Sign-In 16.1.5를 유지했다. [16.2.0](https://github.com/react-native-google-signin/google-signin/releases/tag/v16.2.0)은 iOS SPM 지원 추가이고, [17.0.0](https://github.com/react-native-google-signin/google-signin/releases/tag/v17.0.0)은 네이티브 iOS SDK 등 breaking changes를 포함한다. 이 작업에서 필요한 보안 해결책이 아니므로 OAuth·Drive Picker·토큰 갱신 경로를 바꾸지 않았다. Android 트리의 `play-services-auth:21.5.1`도 유지했다.

## 검증

- `pnpm audit --json`, `--prod`, `--dev`: 전후 실행. 최종 잔여 2건은 위와 같다.
- `pnpm exec expo install --check`: 통과. `pnpm dlx expo-doctor`: 20/20 통과.
- `pnpm check-types`, `pnpm lint`: 통과. `tsconfig.json`에서 설치·검토 산출물인 `dist/`를 검사 대상에서 제외했다. 앱 소스의 타입 검사는 유지한다.
- 독립 실행 가능한 기존 `.cjs` 회귀 검사 96개: 통과. S3 서명·XML·페이지네이션·오류, NAS/Drive 캐시와 동기화, Provider, 다운로드·로컬 저장·메타데이터 복구, 혼합 큐·재생 복원·백그라운드·탐색·미디어 세션 등을 포함한다. S3에는 XML 선언·미완료 CDATA·4MiB 초과 응답 거부 검증을 추가했다.
- 일부 오래된 UI Mock에 빠진 기존 글꼴·플랫폼·테마·reduced-motion 경계만 보완했다. 앱 UI나 비즈니스 코드를 수정하지 않았고 기존 검증 조건을 삭제하지 않았다.
- `check-open-source-notices.cjs`: 326개 고지 검증 통과. 기존 Pretendard 추가와 upstream 출처 정보를 보존하면서 의존성 버전·해시를 재생성했다. Gradle 캐시에 없던 POM은 정확한 Maven 버전의 공식 메타데이터를 `dist/`로 받아 보완했다.
- `check-clean-export.cjs --online`: 임시 소스 사본의 새 설치, 패치 15개 파일 비교, Android/iOS Hermes 프로덕션 번들 및 타입 검사 통과. 기존 node_modules·사용자 데이터는 삭제하지 않았다.
- 현재 저장소의 `expo export --platform all --source-maps --no-bytecode`도 통과했다. `app.json`의 대상은 Android·iOS이며 웹 번들 검증 결과로 보고하지 않는다.
- Android CNG prebuild 후 JDK 17 / Gradle 9.4.1에서 arm64-v8a Release 빌드 및 R8 통과. 기존 빌드 플러그인·앱 ID·서명 설정을 유지했고 build-version을 올리지 않았다. Kotlin/Gradle 등의 upstream deprecation 경고는 남아 있다.
- `check-ios-lockscreen-artwork.cjs`의 Swift 실행과 iOS 네이티브 빌드는 Windows에서 실행하지 않았다. `check-ios-ui-preview.cjs`는 별도 미리보기 프로젝트·소스맵 인자를 요구하는 도구여서 독립 회귀 검사 수에서 제외했다. 깨끗한 사본의 번들 검사로 Android/iOS 실제 앱 소스 포함 여부를 별도로 확인했다.

실제 Android/iOS의 스트리밍, 백그라운드·잠금 화면 연속 재생, 알림·Bluetooth 이전/다음/탐색, 오디오 세션·곡 전환·복원, NAS/Tunnel 연결, Google OAuth·Drive Picker·토큰 갱신은 실기기 재확인이 필요하다. 점검 시 ADB 목록은 비어 있었고 iOS 기기·macOS 빌드 환경도 없었다. 자동 검사 및 Release 빌드 성공을 이 기능들의 실기기 성공으로 간주하지 않는다.

감사 JSON·빌드·테스트·번들 로그와 변경 전 원본은 무시되는 `dist/dependency-security/`에 보관했다. 기존 작업 트리의 글꼴·설정·컴포넌트 변경, build-version 및 등록된 패치를 보존했다.
