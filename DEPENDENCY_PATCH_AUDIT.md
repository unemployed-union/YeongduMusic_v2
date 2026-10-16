# 의존성 수정 점검 — 2026-10-12

2026-10-16 추가: 화면 꺼짐 상태의 곡 전환을 위해 기존 pnpm 절차로 `TrackTransitionWakeLock.kt`를 추가하고 `AudioPlayer.kt`, `AudioModule.kt` 및 소스·배포 타입을 갱신했다. 아래 12개 파일과 해시는 10월 12일 점검 당시 기록이다. 현재 패치는 13개 파일이며 원래의 잠금 화면 곡 이동·탐색·오디오 세션 패치를 유지한다. `pnpm patch --edit-dir .expo/audio-handoff-patch`의 복사본만 편집하고 `pnpm patch-commit`으로 패치와 잠금 파일을 함께 갱신했다. workspace 등록은 기존 경로를 그대로 사용한다. 기존 설치를 삭제하지 않고 별도 `.expo/audio-handoff-install`에서 `--frozen-lockfile --ignore-scripts --side-effects-cache=false --offline` 새 설치를 실행했다. 패치 13개 파일이 설치 간 바이트 단위로 일치하고 현재 SHA-256과 잠금 파일도 일치함을 확인했다. 새 잠금 클래스는 실제 Android SDK API로 컴파일했고 가상 Android 시계로 만료·조기 해제·재사용을 검증했다. 전체 Gradle 컴파일은 로컬 NDK 미설치로 실행되지 않았다. 실기기 재생 검사는 사용자 요청에 따라 생략했다.

## 결론

현재 실행 코드가 의존하는 라이브러리 수정은 `expo-audio@57.0.5`의 12개 파일이며, 모두 기존 `patches/expo-audio@57.0.5.patch`에 포함되어 있다. 임시 폴더에 새로 설치한 의존성에서도 12개 파일이 기존 설치와 바이트 단위로 동일했다. 패치에 기록되지 않은 실행 코드 수정은 발견하지 못했다.

이번 점검에서는 애플리케이션 코드, 패치 내용, 패키지 버전, 네이티브 설정을 변경하지 않았다. 변경 파일은 직접 수정 금지 규칙을 추가한 `AGENTS.md`와 이 문서다. 기존 작업 트리와 설치 디렉터리는 보존했다.

## 조사 범위와 방법

- 의존성 삭제·재설치 전에 기존 설치를 먼저 조사했다.
- pnpm 12.4.2의 실제 설치 메타데이터 및 잠금 파일을 확인했다.
- pnpm 저장소의 원본 패키지 파일 목록·SHA-512 해시를 기준으로 설치된 892개 패키지의 배포 파일 45,889개를 대조했다. 원본 기록을 찾지 못한 패키지와 누락된 배포 파일은 없었다.
- 추가 파일도 조사했다. Gradle 캐시, Android/iOS 빌드 출력, Gradle 플러그인 빌드 출력은 생성 파일로 구분했다. 생성 파일 외 추가 소스는 아래 오디오 패치의 두 파일뿐이었다.
- 기존 `.pnpm_patches/expo-audio@57.0.5`는 pnpm의 편집용 복사본이다. 실행 패키지와 소스 내용은 같으며 `build/AudioModule.types.d.ts`의 마지막 개행만 달랐다. 앱이나 빌드는 이 편집 폴더를 참조하지 않는다. 향후 편집 폴더는 `node_modules` 밖으로 지정한다.
- Google 로그인 SDK 16.1.5의 배포 파일 124개는 원본과 같았다. 최근 OAuth 및 로그인 대기 시간 수정은 프로젝트 소스에 있다.

이 조사는 현재 파일과 패키지 원본을 비교한 결과다. 과거 파일 쓰기 이력 전체를 복원하는 감사 로그는 아니므로, 변경 주체와 시점은 현재 파일 차이만으로 단정하지 않는다.

## 오디오 패치의 전체 파일 목록

아래 위치는 모두 `node_modules/expo-audio/`를 기준으로 한다. Android 소스 8개(수정 6개, 추가 2개)와 TypeScript 선언 4개다.

| 파일 | 변경 목적 | 패치를 제거했을 때 문제 | 소스·설정으로 대체 가능 여부 |
| --- | --- | --- | --- |
| `android/src/main/java/expo/modules/audio/AudioModule.kt` | 기존 ExoPlayer의 `audioSessionId`를 JS에 노출 | 시스템 이퀄라이저를 현재 플레이어의 오디오 세션에 연결할 수 없음 | 일반 소리 설정을 여는 대안은 있지만 현재 세션 연결에는 네이티브 속성이 필요 |
| `android/src/main/java/expo/modules/audio/AudioPlayer.kt` | `requestTrackNavigation`으로 `remoteTrackChange` 이벤트 전달 | 알림·잠금화면 곡 이동이 앱의 인증 URL 처리 및 공통 대기열로 전달되지 않음 | JS 대기열은 이미 앱 소스에 있으며 네이티브 명령 전달 부분만 패치 필요 |
| `android/src/main/java/expo/modules/audio/AudioRecords.kt` | Android 잠금화면 옵션에 `showSkipNext`·`showSkipPrevious` 추가 | JS가 전달한 곡 이동 옵션을 네이티브에서 처리하지 못함 | 원본의 `showSeek*`는 곡 이동이 아닌 시간 탐색이므로 같은 기능을 대체하지 못함 |
| `android/src/main/java/expo/modules/audio/service/AudioControlsService.kt` | 곡 이동 알림 액션·MediaSession 버튼 연결, 재생 중 `onTaskRemoved` 처리 | 곡 이동 버튼 누락 또는 동작 실패; 최근 앱에서 제거할 때 재생 중단 가능 | `enableBackgroundPlayback` 설정은 이미 적용됨. 서비스 내부의 버튼 및 작업 제거 처리는 이 설정으로 바뀌지 않음 |
| `android/src/main/java/expo/modules/audio/service/AudioMediaSessionCallback.kt` | MediaSession의 곡 이동 명령 차단 제거 및 명령 권한 유지 | 플레이어가 준비되어도 컨트롤러의 탐색·곡 이동 명령이 제한될 수 있음 | MediaSession 컨트롤러 권한은 JS 공개 설정으로 수정할 수 없음 |
| `android/src/main/java/expo/modules/audio/service/ForwardingPlayerListener.java` **추가** | Java 기본 메서드를 포함한 Media3 리스너 콜백을 명시적으로 전달 | Kotlin 인터페이스 위임이 기본 콜백을 전달하지 않아 길이·타임라인·명령 변경이 세션에 반영되지 않음 | 앱의 재생 상태 업데이트로 네이티브 리스너 위임 오류를 수정할 수 없음 |
| `android/src/main/java/expo/modules/audio/service/MetadataInjectingPlayer.kt` | 메타데이터 래퍼가 위 명시적 리스너를 사용하도록 변경 | 메타데이터 래퍼에서 필요한 세션 업데이트가 누락되어 삼성 탐색 바 문제가 재발할 수 있음 | 라이브러리 내부 래퍼 교체 필요 |
| `android/src/main/java/expo/modules/audio/service/TrackNavigationPlayer.kt` **추가** | JS 대기열용 곡 이동 명령 및 길이가 확인된 비실시간 음원의 탐색 명령 제공, 명령 변경 통지 | 단일 음원 ExoPlayer가 곡 이동을 제공하지 않으며 NAS 음원에서 시스템 탐색 바 손잡이가 비활성화될 수 있음 | 앱 안의 `seekTo`는 동작하지만 시스템 MediaSession 명령은 네이티브 처리 필요 |
| `src/AudioConstants.ts` | 곡 이동 옵션 타입 선언 | TypeScript 소스 타입이 실제 Android 확장과 불일치 | 네이티브 패치와 함께 유지 |
| `build/AudioConstants.d.ts` | 배포된 곡 이동 옵션 타입 선언 | 패키지 공개 타입에서 확장 옵션을 사용하지 못함 | 패키지의 실제 타입 진입점도 함께 패치해야 함 |
| `src/AudioModule.types.ts` | `audioSessionId` 및 `remoteTrackChange` 타입 선언 | 소스 타입과 실제 확장 API가 불일치 | 네이티브 패치와 함께 유지 |
| `build/AudioModule.types.d.ts` | 배포된 세션 속성·이벤트 타입 선언 | 프로젝트 타입 검사에서 확장 속성·이벤트를 인식하지 못함 | 프로젝트의 강제 타입 변환만으로는 실제 네이티브 기능이 생기지 않음 |

패치 사용 지점은 `src/services/playback/audio-engine.ts`의 `setup`, `load`, `getAudioSessionId`다. 이전/다음 곡 선택과 인증된 음원 해결은 기존 Playback Controller가 계속 담당한다. 단순히 설치 파일만 수정하거나 프로젝트에 타입 선언만 추가하는 방식으로 대체하지 않는다.

## 별도로 발견된 Manifest 차이

`node_modules/@react-native-masked-view/masked-view/android/src/main/AndroidManifest.xml`에서는 원본의 `package="org.reactnative.maskedview"` 속성이 제거되어 있었다.

이 패키지의 **배포 원본 `android/build.gradle`** 자체가 AGP 버전에 따라 해당 속성을 제거하거나 추가하고 Manifest에 다시 쓴다. 현재 차이는 그 코드가 생성하는 결과와 일치한다. 새로운 설치에서는 Manifest와 나머지 배포 파일 20개가 원본과 같았으며, Android 빌드가 필요한 변환을 다시 수행한다. 따라서 이 차이를 별도의 앱 패치로 보존할 필요가 없다. 앱 코드도 변환된 Manifest에 의존하지 않는다.

AGP 8부터 namespace는 모듈 빌드 설정에 지정한다. 관련 공식 자료: [Android Gradle Plugin namespace 변경](https://developer.android.com/build/releases/agp-8-0-0-release-notes#namespace-dsl).

## 재설치 후 유지되는 구조

다음 설정은 점검 전부터 이미 존재했고, 내용이 올바르므로 유지했다.

1. `package.json`: `expo-audio`를 `57.0.5`로 고정.
2. `pnpm-workspace.yaml`: `patchedDependencies`에 `patches/expo-audio@57.0.5.patch` 등록.
3. `pnpm-lock.yaml`: 동일 패치 해시를 사용하는 해결 결과 기록.
4. `package.json`: `expo.autolinking.android.buildFromSource`에 `expo-audio`를 지정하여 수정된 네이티브 소스를 컴파일.

패치의 SHA-256은 `81836ef79b584246c85210df8ece6dd77b8d6bc0db834241170c738ee6a126dc`이며 잠금 파일과 일치한다. 패치 파일·workspace 설정·잠금 파일은 Git 추적 대상이고 ignore되지 않는다. EAS에 동일한 파일을 포함해야 한다. 이번에 원격 EAS 빌드를 실행하지는 않았다.

라이브러리를 변경할 때는 [pnpm 공식 patch 절차](https://pnpm.io/cli/patch)에 따라 외부 임시 편집 폴더를 사용하고, [patch-commit](https://pnpm.io/cli/patch-commit)으로 변경을 보존한다.

```powershell
pnpm patch expo-audio@57.0.5 --edit-dir <node_modules 밖의 빈 임시 폴더>
# 임시 복사본에서만 필요한 내용을 수정
pnpm patch-commit <임시 폴더>
pnpm install --frozen-lockfile
```

이번에는 필요한 수정이 이미 패치에 모두 들어 있어 패치를 재생성하지 않았다. `pnpm patch --ignore-existing --edit-dir ...`로 원본 복사본을 준비하고 기존 패치가 적용되는지 별도로 확인했다. Git 적용 과정의 CRLF 변환은 정규화하여 비교했고, 실제 pnpm 설치 결과는 개행을 정규화하지 않고 바이트 단위로 검증했다.

## 실행한 검증

- 기존 설치 전체의 원본 파일 해시 대조: 완료.
- 원본 오디오 패키지에 `git apply --check` 및 기존 패치 적용: 성공. 12개 파일의 소스 내용 일치.
- 빈 임시 프로젝트에 `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, 패치만 복사하여 새 설치: 성공. 환경변수 파일이나 NAS 정보는 복사하지 않음.
- 새 설치 명령: `pnpm install --frozen-lockfile --ignore-scripts --side-effects-cache=false --store-dir <기존 pnpm 저장소>`.
- 처음 오프라인 설치는 설치 스냅샷 부족으로 실패했고, 이후 일반 설치가 성공함. 892개 패키지 설치. 수정 결과 캐시를 사용하지 않았으며 패치 12개 파일이 기존 설치와 바이트 단위로 동일함.
- 설치 입력 4개 파일 모두 변경되지 않음.
- 새 설치의 오디오 배포 파일 190개: 예상된 수정 파일 10개만 원본과 다름. 추가 소스 2개는 등록된 패치로 재현됨.
- 새 설치의 Google 로그인 SDK 124개 및 masked-view 20개 배포 파일: 모두 원본과 같음.
- `pnpm check-types`: 통과.
- `pnpm lint`: 통과.
- `node scripts/check-playback-buffer.cjs`: 통과.
- `node scripts/check-playback-recovery.cjs`: 통과.
- `node scripts/check-google-drive.cjs`: 통과.
- `node scripts/check-player-options.cjs`: 통과. 이퀄라이저 세션 연결 및 대체 설정 화면 동작은 Mock으로 검증.
- `node scripts/check-android-media-session.cjs <새 설치 임시 프로젝트>`: 통과. **새로 설치된 실제 패치 소스**의 37개 리스너 콜백 전달, 뒤늦게 길이가 확인된 음원의 탐색 활성화, 실시간/광고/길이 미확인 제한, 곡 이동 및 리스너 정리 검증. Media3 객체는 Mock.
- `:expo-audio:compileReleaseKotlin` 및 `:expo-audio:compileReleaseJavaWithJavac` (`--offline`): 성공. 기존 Android 프로젝트에서 실행한 증분 컴파일 작업이며 전체 APK 재빌드는 아님. Gradle 캐시 경로 권한 오류 후 실제 사용자 캐시로 재실행함. 기존 라이브러리의 deprecation 경고는 남아 있음.
- `git diff --check -- AGENTS.md` 및 신규 문서 공백 검사: 통과. 기존 패치는 일반 diff 문맥의 공백을 포함하므로 이번 점검에서 불필요하게 재작성하지 않음.

설치 검증은 패키지 및 패치 재현성 검사이므로 install lifecycle 스크립트는 실행하지 않았다. 실제 기기 재생, Google 계정 인증, NAS 연결, iOS 및 원격 EAS 빌드는 이번 점검에서 다시 실행하지 않았다. 라이브러리 버전 업그레이드 시에는 네이티브 패치 적용·컴파일·잠금화면 탐색·곡 이동·최근 앱 제거 후 재생 유지·이퀄라이저 연결을 다시 검증해야 한다.
