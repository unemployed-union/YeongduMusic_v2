# Expo SDK 58 마이그레이션 — 2026-11-06

## 변경 버전과 범위

| 항목 | 이전 | 이후 |
| --- | --- | --- |
| Expo | 57.0.31 | 58.0.23 |
| React Native | 0.86.3 | 0.88.1 |
| React / React DOM | 19.2.3 | 19.3.0 |
| expo-router | 57.0.29 | 58.0.30 |
| expo-audio | 57.0.5 | 58.0.11, 정확한 버전으로 고정 |
| expo-file-system | 57.0.7 | 58.0.13 |
| @expo/ui | 57.0.26 | 58.0.27 |
| Gesture Handler | 2.32.0 | 3.3.0 |
| Reanimated / Worklets | 4.5.1 / 0.10.1 | 4.7.1 / 0.13.0 |
| Screens | 4.26.2 | 4.30.1 |
| Safe Area Context | 5.7.0 | 5.11.1 |
| Keyboard Controller | 1.21.9 | 1.22.7 |
| Slider | 5.2.0 | 5.2.1 |

pnpm 12.4.2와 기존 `pnpm-lock.yaml`을 유지했다. Expo 관련 패키지는 `expo install`로 정렬했고 `@types/react`, `eslint-config-expo`도 SDK 호환 버전으로 갱신했다. 새 필수 native peer인 `expo-asset@58.0.20`을 직접 의존성으로 추가했다. Google Sign-In 16.1.5, image-colors 2.6.0, masked-view 0.3.2는 기존 버전을 유지했다. 새 npm 의존성에 prerelease 버전을 선택하지 않았으며 `--force`, `--legacy-peer-deps`를 사용하지 않았다.

Node 24.21.0, JDK 17.0.20, Android SDK 37 / Build Tools 37.0.0, NDK 27.1.12297006, Gradle 9.4.1, AGP 9.2.1로 검증했다. compile SDK는 37, target SDK는 36을 사용하는 SDK 기본값이다.

## 분석과 기존 작업 보존

- 변경 전 Git 작업은 이미 stage된 Provider·Jellyfin·베타 표시 변경을 포함한다. 해당 index와 사용자 작업을 보존했고 commit·reset·앱 삭제를 하지 않았다.
- Android는 `.gitignore`에 포함된 CNG 생성물이며 iOS 디렉터리는 없었다. Android의 Activity/Application, Manifest, Gradle, 서명 파일과 로컬 Drive 선택 모듈을 검토했다. 기존 Android 폴더 전체는 `dist/sdk58-migration/android57-full/`에 보존한 뒤 공식 prebuild로 재생성했다.
- 변경 전 실제 오디오 설치의 배포 파일 193개를 원본 + 등록된 패치와 비교했다. 빌드 출력물을 제외하고 등록되지 않은 수정은 없었다.
- `modules/yeongdu-drive-picker/`, iOS Settings.bundle 플러그인, 기존 SDK 57 오디오 패치 파일을 보존했다. 원래 Gradle의 4GB heap / 1GB metaspace 설정은 `plugins/with-android-build-memory.js`로 옮겨 prebuild 후에도 재현한다.
- 기존 사용자 Babel/Metro 설정 파일은 없었다. Expo 기본 설정을 유지하고 기존 `@react-native/metro-config` override를 0.88.1로 맞췄다. TypeScript strict 설정을 유지했다.

## Breaking Changes 대응

1. RN Strict TypeScript API의 `ViewInstance`, `TextInstance`, `TextInputInstance`로 ref 타입을 변경했다. 색상·FlatList 헤더의 엄격해진 타입도 실제 허용값에 맞췄다. legacy 조건부 타입 해제, `any`, `@ts-ignore`로 우회하지 않았다.
2. masked-view가 제거된 `NativeMethods` 타입을 참조하므로 공개 `ViewInstance`를 사용하는 타입 선언 패치를 pnpm으로 등록했다. 컴포넌트의 런타임·네이티브 구현은 바꾸지 않았다.
3. 비동기가 된 `File.write()`는 완료를 기다린다. 설정 백업의 저장 오류·불완전 파일 정리도 유지한다. 기존 태그 파서와 256KB 단위 파일 편집은 `readBytesSync` / `writeBytesSync`로 옮겨 기존 동기 접근 순서와 주기적인 JS 양보를 유지한다. 기존 `expo-file-system/legacy`의 검증된 다운로드·취소 경로는 유지했다.
4. Router의 뒤로 가기 기준을 `unstable_settings.anchor`로 전환했다. 제거된 navigator `initialRouteName` prop을 없애고 기존 href·숨긴 탭 선택 보호를 유지했다. 효과가 없어진 `freezeOnBlur`는 `activityEnabled={1}`로 옮겼다. 헤더 색상·앨범의 투명 헤더·메뉴 순서·기존 URL 경로는 유지했다.
5. SDK 58 기본 Scene Lifecycle을 사용하며 중복된 `enableSceneSupport` 설정을 제거했다. 설치기가 요구하는 `expo-font`, `expo-status-bar`, `expo-asset` 플러그인을 명시했다.
6. SDK 58 Release 기본 R8과 `proguard-android-optimize.txt`를 유지해 실제 APK를 빌드했다. New Architecture와 SDK 기본 Hermes도 유지했다. 별도 불안정 아키텍처·렌더링 옵션을 켜지 않았다.
7. SDK 58 Metro의 indexed source map을 처리하도록 감사·깨끗한 export 검사를 갱신했다. 오픈소스 고지와 실제 Release 의존성/manifest/lockfile 해시를 다시 생성했다. 아래 Google 인증 패치 반영 후 고지는 331개다. 감사 임시 파일은 Expo CLI 전용 `.expo/` 대신 `dist/legal-audit/`에 둔다.

## 음악 재생과 데이터에 미치는 영향

`patches/expo-audio@58.0.11.patch`의 14개 파일에 기존 Android WakeLock, JS 큐 곡 이동, 오디오 세션 ID, Media3 리스너 전달·삼성 탐색 지원, 최근 앱 화면에서 UI 제거 후 재생 유지 및 iOS 원본 FLAC MIME 힌트를 이식했다. 패키지의 새 `LockScreenPlayable` 구조와 표준 `showNextTrack` / `showPreviousTrack` 옵션을 사용한다. 큐·셔플·반복·인증된 재생 소스 선택은 기존 Playback Controller가 계속 담당한다. 새 네이티브 playlist 엔진으로 교체하지 않았다.

패치는 `node_modules` 안에서 직접 수정하지 않고 별도 편집 폴더와 `pnpm patch-commit`으로 만들었다. 새 오디오 패치와 masked-view 타입 패치는 깨끗한 frozen-lockfile 설치에서도 일치했다. Android는 `buildFromSource: ["expo-audio"]`를 유지하여 패치된 소스를 컴파일한다.

NAS·Google Drive·기기 음악·S3·MYBOX·Jellyfin의 인터페이스, 데이터 모델, 저장 키, 다운로드 파일 위치는 바꾸지 않았다. Bundle Identifier와 Android Package는 `xyz.yeongdu.yeongdumusic`, URL scheme은 `synologymusic`을 유지했다. `app.config.ts`의 Google iOS OAuth scheme 생성과 EAS project ID도 유지했다. Expo 기본 환경변수 로딩을 사용하며 `NODE_ENV`를 임의의 환경 이름으로 사용하는 코드나 별도 dotenv/Metro 우회는 없었다.

기존 debug keystore는 재생성된 파일과 SHA-256이 일치한다. 로컬 Release는 기존처럼 debug 서명으로 검증했으며, EAS의 프로덕션 서명 설정을 변경하지 않았다. 기기에 설치하거나 기존 앱의 데이터를 삭제하지 않았다. `build-version.json`도 변경하지 않았다.

## 검증 결과

| 검사 | 결과 |
| --- | --- |
| `pnpm dlx expo-doctor` | 20/20 통과 |
| `pnpm exec expo install --check` | 통과 |
| `pnpm peers check` | 충돌 없음 |
| `pnpm check-types`, `pnpm lint` | 통과 |
| 기존 `.cjs` 회귀 스크립트 | 77개 모두 통과; 아래 clean export까지 총 78개 스크립트 통과 |
| `node scripts/check-clean-export.cjs --online` | 새 임시 복사본의 frozen-lockfile 설치, Android/iOS Hermes 번들·현재 소스 포함·타입 검사 통과 |
| 새 설치의 패치 대조 | 오디오 14개 파일·masked-view 타입 선언 일치 |
| Android arm64 Debug / Release | 최종 고지 포함 재빌드 모두 통과; Release R8 적용 |
| Drive Picker native unit tests | `:yeongdu-drive-picker:testDebugUnitTest` 6개 테스트 통과 |
| iOS 설정·소스 정적 검사 | background audio, ATS, URL scheme, SceneDelegate 템플릿, 실제 SDK 58 AppDelegate의 Settings.bundle 삽입·중복 방지 확인 |
| iOS 네이티브 검사 | Windows에 Xcode / `xcrun`이 없어 미실행 |

오프라인 clean install은 로컬 저장소에 tarball이 없어 실패했고, `--online`으로 새 복사본에서 다시 실행해 통과했다. 테스트의 파일 API·Media3 모의 객체도 새 계약에 맞췄다. 백업 저장 모의 객체를 비동기 실패로 바꿔 새 파일 쓰기의 오류 처리를 검증한다.

Android APK는 `android/app/build/outputs/apk/debug/app-debug.apk`, `android/app/build/outputs/apk/release/app-release.apk`에 생성한다. 로컬 로그·백업은 `dist/sdk58-migration/`에 있다. iOS용 Hermes 번들 성공은 IPA·Swift 컴파일 성공을 의미하지 않는다.

## Google 인증 R8 경고 후속 점검 — 2026-11-06

`modules/yeongdu-drive-picker/android/build.gradle`의 직접 의존성 한 곳을 `play-services-auth:21.5.0`에서 `21.5.1`로 변경했다. npm Google Sign-In 16.1.5와 인증 구현은 유지했다. 변경 전후 `releaseRuntimeClasspath`의 `dependencyInsight` 결과는 다음과 같다.

```text
yeongdu-drive-picker -> play-services-auth:21.5.0 -> 변경 후 21.5.1
react-native-google-signin_google-signin -> play-services-auth:21.4.0
  -> Gradle 버전 충돌 해소로 변경 전 21.5.0, 변경 후 21.5.1 선택
```

Google의 [2026-02-18 공식 릴리스 노트](https://developers.google.com/android/guides/releases#february_18_2026)는 21.5.1에서 ProGuard 빌드 오류와 잠재적인 런타임 충돌을 수정했다고 명시한다. 공식 설명에 이번 경고의 클래스명이나 정확한 원인은 없다. 다만 기존 로그의 9건은 모두 21.5.0 runtime.jar의 생성자 불일치에 따른 `R8: Invalid stack map table`이었으며, 동일한 R8 설정에서 21.5.1로 교체하고 실제 축소 작업을 다시 실행하자 0건으로 줄었다. 이 결과는 해당 패치와의 연관성을 뒷받침한다.

기능 추가 버전인 21.6.0까지 올릴 필요가 없어 수정 패치만 선택했다. Google Sign-In API를 제거하는 22.0.0은 사용하지 않았다. 전역 버전 강제 지정, 추가 keep 규칙, 경고 숨기기, R8 최적화 해제는 적용하지 않았다. `auth-base:18.0.10`, `auth-api-phone:18.0.2` 등 기존 해석 버전은 유지되며, 21.5.1의 전이 의존성인 `kotlinx-coroutines-play-services`가 기존 코루틴 버전에 맞춰 1.10.2로 추가된다. 실제 AAR의 Kotlin·Protocol Buffers 고지 변경까지 반영해 `assets/legal/notices.json`과 `audit.json`을 재생성했다.

| 이번 후속 검증 | 결과 |
| --- | --- |
| Android arm64 Release, R8 활성화 | 성공; `:app:minifyReleaseWithR8` 실제 재실행, 대상 경고 9 → 0 |
| 고지 파일 갱신 후 Release 번들·APK 재생성 | 성공; JSON 변경을 반영하도록 번들 작업만 `--rerun`으로 재실행 |
| `:yeongdu-drive-picker:testDebugUnitTest` | 6개 통과, 실패·건너뛰기 없음 |
| 기존 `check-*.cjs` 회귀 검사 | 77개 통과; Google Drive·인증 세션·문서 접근·메타데이터 검사 포함 |
| `pnpm check-types`, `pnpm lint` | 통과 |
| 로그인·Picker·토큰 관련 공개 API 대조 | `javap -public`으로 15개 클래스의 21.5.0/21.5.1 공개 선언 일치 확인 |
| 깨끗한 export / iOS 잠금 화면 네이티브 검사 | 이번 Android 의존성 패치에서는 재실행하지 않음; 앞선 마이그레이션 결과와 구분 |

API 대조에는 `GoogleSignIn`, `GoogleSignInClient`, `GoogleSignInOptions.Builder`, `GoogleAuthUtil`, `Identity`, `AuthorizationClient`, `AuthorizationRequest.Builder/Prompt/ResourceParameter`, `AuthorizationResult` 등이 포함된다. 기존 Picker의 `setPrompt`, `addResourceParameter`, `tokenResponseParams` 사용과 토큰 갱신의 `getTokens`·캐시 토큰 제거·네이티브 재인증 경로를 유지했다. 이 검증과 mock/JVM 테스트는 실제 Google 인증 서버 및 Play services와의 상호 작용을 검증하지 않는다.

비교 기준은 `dist/sdk58-migration/android-final-build.log`이며, 의존성 전후 보고서·경고 발췌·API 비교·후속 빌드·개별 테스트 로그는 `dist/google-auth-r8/`에 있다. 실제 Release 앱에서 최초/자동 로그인, 계정 전환·로그아웃, Picker 열기·취소·복수 파일 선택, 토큰 만료/401 이후 갱신과 선택 문서 재접근은 별도로 확인해야 한다. 로컬 Release는 기존 debug 서명을 사용하므로 배포 서명의 OAuth 설정까지 검증한 결과는 아니다.

## 남은 위험과 실기기 확인

- 직접 지정한 npm 의존성은 모두 안정 버전이다. 단, 공식 SDK의 `@expo/ui`가 내부적으로 지정한 Android Material 3 `1.5.0-beta01` 전이 의존성은 그대로 사용한다. 앱에서 새 beta API를 도입하거나 SDK의 내부 버전을 임의로 override하지 않았다.
- Google 인증의 invalid stack map 경고 9건은 위 후속 점검에서 `play-services-auth:21.5.1`로 수정해 해소했다. 기존 Google Sign-In·Drive Picker·토큰 갱신의 실제 Release 동작은 실기기 확인이 필요하다.
- upstream Kotlin/Gradle/CMake의 deprecation 경고가 남아 있다. Gradle 10 호환을 의미하지 않으며 현재 SDK의 Gradle 9.4.1로 검증했다.
- macOS에서 CocoaPods 해석·Swift 컴파일·Debug/Release iOS 빌드가 필요하다. iOS pod의 실제 해석 버전에 맞춰 플랫폼 고지도 재확인해야 한다.
- Android/iOS 실기기에서 NAS 내부 IP·외부 HTTPS·Tunnel, Google OAuth 복귀, Jellyfin 헤더 인증·트랜스코딩 탐색, 다운로드 취소·재시작·오프라인 복원을 확인해야 한다.
- 화면을 끈 상태로 여러 곡 연속 재생, 잠금 화면 탐색·이전/다음, Android 알림·Bluetooth 조작, 최근 앱 제거, 인터럽트 후 복귀·재연결, 삼성 기기의 MediaSession 탐색, 시스템 이퀄라이저를 확인해야 한다. 이번 자동 검사만으로 정상 동작을 단정하지 않는다.
- 같은 서명의 기존 앱 위에 업데이트하여 설정·좋아요·플레이리스트·다운로드 음악이 유지되는지도 실기기에서 확인해야 한다.

## 주요 변경 파일과 공식 자료

- 의존성: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, 새 오디오·masked-view 패치.
- 네이티브 생성 설정: `app.json`, `plugins/with-android-build-memory.js`.
- 호환 코드: Text/TextInput·blur ref 컴포넌트, 탭/보관함 layout, `audio-engine.ts`, 파일 편집·아트·백업 파일 처리.
- 검증·고지: 기존 회귀 스크립트, `scripts/source-map-sources.cjs`, `assets/legal/`.

공식 [업그레이드 절차](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/), [expo-upgrade 스킬](https://github.com/expo/skills/blob/main/plugins/expo/skills/expo-upgrade/SKILL.md), [SDK 58 릴리스 노트](https://expo.dev/changelog/sdk-58), [SDK 58 버전별 문서](https://docs.expo.dev/versions/v58.0.0/), [Router 마이그레이션](https://docs.expo.dev/router/migrate/sdk-57-to-58/), [RN Strict API](https://reactnative.dev/docs/strict-typescript-api)를 참고했다.
