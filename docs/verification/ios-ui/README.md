# iOS UI 검증 기록

2026-11-12, iPhone 18 Pro 및 iPad Pro 13 M5 / iOS 27.0 Simulator. 전체 기록과 남은 수동 확인은 [감사 문서](../../ios-ui-audit.md)에 있다.

## 동일 기기·테마·데이터 비교

라이트 모드, 기본 글자 크기, 예제 계정과 동일한 일시정지 대기열. 아래 이미지는 네이티브 앱의 실제 캡처이며 화면 조작은 임시 fixture가 Router를 호출했다. 실제 사용자 터치나 실계정 재생 검증은 아니다.

| 화면 | 변경 전 | 변경 후 | 확인 |
| --- | --- | --- | --- |
| 보관함 | [보기](iphone-before-library.png) | [보기](iphone-after-library.png) | Native Stack 제목/Toolbar, 정렬 Menu, 아트워크 모서리 |
| 설정 | [보기](iphone-before-settings.png) | [보기](iphone-after-settings.png) | 전체 Glass 제거, 시스템 Form, 본문/강조 색상 분리 |
| 검색 | [보기](iphone-before-search.png) | [보기](iphone-after-search.png) | 네이티브 헤더/검색바, Safe Area, 초기 빈 상태 |
| 플레이어 | [보기](iphone-before-player.png) | [보기](iphone-after-player.png) | 그림자/모서리 축소, 상태 표시줄 대비, 재생 조작 계층 |

[iPad 라이트](ipad-after-library-light.png), [iPad 다크](ipad-after-library-dark.png)에서 기존 사이드바와 콘텐츠/미니 플레이어 배치를 확인했다. iPad의 가로/좁은 창, 실제 회전은 미검증이다.

접근성 글자 크기(`accessibility-extra-large`)와 다크 모드의 [설정](iphone-dark-accessibility-settings.png), [검색](iphone-dark-accessibility-search.png)을 확인했다. Form 내용은 스크롤 영역에 남는다. 앨범 제목/아티스트는 큰 글자에서 두 줄로 늘렸으며, 플레이어는 큰 글자에서 정적인 두 줄 제목과 자연스러운 높이의 스크롤 콘텐츠를 사용한다. [보관함](iphone-dark-accessibility-library.png)과 [플레이어 상단](iphone-dark-accessibility-player.png)의 보정 결과도 기록했다. 임시 fixture에서만 `scrollToEnd`를 호출한 [플레이어 스크롤 끝](iphone-dark-accessibility-player-scrolled.png)에서도 재생/이전/다음/반복 조작이 보이는 것을 확인했다. 이 캡처는 프로그램에 의한 스크롤이며, 손가락 스크롤·키보드·VoiceOver의 실제 조작은 확인하지 못했다.

## 검사 근거

- [기준선 대비 소스/검사 변경 목록](change-manifest.json): 기존 미커밋 작업과 구분한 이번 변경의 SHA-256.
- [35개 회귀 검사 결과](regression-results.json): 상태·액션·취소·실패와 경계 보존 검사. 네이티브 모듈/생체 인증은 mock이다.
- [빌드 결과](build-result.txt), [검증 메타데이터](validation.json): 최종 iOS Release Simulator 빌드, lint, 타입 검사와 양 플랫폼 production export 통과.
- [EAS 소스 검토 목록](eas-source-manifest.json): 659개 파일, 약 10.63MB. 앱 소스·자산·설정·빌드 플러그인·의존성 잠금/패치·스크립트를 포함한다. `.easignore`로 로컬 환경 파일·키·인증서·생성 네이티브 프로젝트·캐시를 제외했다. 검토 후 사용자가 로컬 검증만 선택하여 실제 업로드/클라우드 빌드는 실행하지 않았다.

## 재현

```sh
node scripts/prepare-ios-ui-preview.cjs --output /tmp/yeongdu-ui-preview
```

명령이 준비한 임시 프로젝트에서 `EXPO_ROUTER_APP_ROOT`를 그 프로젝트의 `src/app`으로 지정해 `expo export:embed --platform ios --dev false --entry-file node_modules/expo-router/entry.js --bundle-output <temp>/main.jsbundle --sourcemap-output <temp>/main.jsbundle.map`을 실행한다. 원래 앱과 다른 bundle identifier의 Simulator 복사본에만 설치한다. iOS 네이티브 의존성 빌드는 별도로 필요하다.

```sh
node scripts/check-ios-ui-preview.cjs /tmp/yeongdu-ui-preview /tmp/yeongdu-ui-preview/main.jsbundle.map
```

이 검사는 현재 앱 소스와 소스맵 내용을 전부 비교한다. 검증 fixture별 Metro cacheVersion을 분리해 다른 프로젝트 라우트가 섞이는 것을 방지한다. production export 소스맵에도 같은 검사를 실행해 임시 fixture가 포함되지 않았음을 확인했다.

시작 시 간헐적인 SQLite/FileSystem 네이티브 EXC_BAD_ACCESS가 변경 전·후 임시 앱에서 발생했다. 재실행 후 촬영했으며 해당 오류를 해결했다고 주장하지 않는다. 정확한 스택과 검증 한계는 감사 문서에 기록했다.
