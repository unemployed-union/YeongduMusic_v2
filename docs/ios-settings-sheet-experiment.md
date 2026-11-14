# iOS 설정 시트 실험 및 기본 구현 복원 기록

> 이전 TrueSheet 실험을 종료했을 당시의 기록이다. 이후 요청으로 진행한 네이티브 위치 연동 수정과 XCTest 검증은 [시트 배경 전환 보고서](ios-sheet-background-motion.md)를 기준으로 확인한다.

브랜치: `experiment/ios-settings-truesheet4` · 2026-11-14

## 당시 복원 상태

사용자의 최종 요청인 “그냥 iOS 기본 동작으로 해줘”에 따라 기존 **Expo Router Native Stack의 formSheet + SwiftUI List 기본 표면**으로 복원했다. TrueSheet B나 Reanimated D를 최종 구현으로 사용하지 않는다.

- 설정 시트: 네이티브 `formSheet`, detents `[0.5, 1]`, 시스템 grabber/모서리/드래그/전환 사용.
- 목록: 기존 SwiftUI `insetGrouped` List/Section과 시스템 기본 행·배경·구분선 유지. `scrollContentBackground` 강제 설정과 행 `glassEffect` 없음.
- 내부 화면: 기존 Native Stack, 뒤로/닫기, 설정 잠금·생체 인증·저장/취소 로직 유지.
- 높이에 따른 색상/불투명도 보간, detent 도착 후 fade, 별도 배경 레이어를 추가하지 않았다.
- TrueSheet 패키지와 autolinking 예외, 비교 라우트/진입 버튼/상태/진행선/실험 전용 검사를 제거했다.
- Android와 저장 설정/데이터/백업 형식은 변경하지 않았다.

앱 소스, package.json, pnpm-lock.yaml은 실험 시작 전 커밋 `0d22d49`와 동일하다. 이 문서와 검증 자료만 별도로 남긴다. 기존 미커밋 사용자 변경은 없었던 기준선이다. 자동 커밋·배포·제출·클라우드 소스 업로드는 하지 않았다.

## 실험에서 확인한 내용

Expo 58.0.23 / React Native 0.88.1에서 TrueSheet 4.1.0의 기본 Glass(B), detent 효과(C), 공식 Reanimated API의 연속 보간(D)을 로컬 네이티브 빌드로 비교했다.

사용자는 iPhone 16 Pro / iOS 27.2.1에서 D의 연속 전환과 내부 탐색·스크롤·닫기가 정상이라고 확인했다. 이후 B를 선택했으나 일반 화면에서는 이전 비교 B의 특정 높이 전환이 보이지 않는다고 보고했다. 같은 네이티브 시트에서 List 배경 숨김/기본값을 비교했을 때는 숨김 쪽이 이전 B와 같다고 응답했다. 그러나 일반 화면과의 일치를 최종 확정하지 못했고, 마지막 요청에 따라 시스템 기본 구현으로 복원했다. 불명확한 현상을 해결했다고 주장하지 않는다.

추가했던 행 Glass는 실제 렌더링에서 레이블 근처에만 그려져 그룹 표면에 어울리지 않았고 사용자가 원복을 요청했다. 이 코드도 제거했다.

## 검증과 한계

- TrueSheet 제거 전후 기존 audio/masked-view 등 패치·소스 78개 해시가 동일했다. 실험 전 잠금 파일로 `pnpm install --offline --frozen-lockfile`이 통과했다.
- 최종 복원본의 lint/타입 검사, 기존 회귀 검사 10/10, `git diff --check` 통과. [개별 회귀 결과](verification/settings-sheet/regression-results.json)는 mock 범위를 명시한다.
- Simulator/iPhone Release 네이티브 빌드, iPhone 코드 서명 검증·설치·실행 통과. 초기 공유 캐시 잠금 충돌은 순차 빌드로 해소했다. 일반 메인 화면 위에 시스템 기본 설정 시트가 열리는 것을 직접 관찰했다. [최종 정적 화면](verification/settings-sheet/iphone-native-system-sheet.png)은 연속 드래그 검증을 대신하지 않는다.
- 원격 좌표 터치는 `noWindowsAvailable`로 실패했고, 이 iPhone은 devicectl 화면 녹화 capability를 지원하지 않았다. 사용자의 실기기 응답과 에이전트의 정적 화면 관찰을 구분했다.
- 느린 드래그 동영상, iOS 26.1 런타임, 모든 하위 화면의 실제 입력/잠금/접근성·라이트 모드 회귀는 검증 완료로 표시하지 않는다.
- 과거 B/C 정적 이미지는 실험 당시 기록이며 최종 시스템 기본 구현이나 드래그 연속성의 증거가 아니다.

## 참고한 공식 API

- [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/)
- [Expo Router Native Stack](https://docs.expo.dev/versions/v58.0.0/sdk/router/stack/)
- [Expo UI SwiftUI List](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/list/)
- [TrueSheet 기본 Liquid Glass](https://sheet.lodev09.com/guides/liquid-glass)
- [TrueSheet 배경 효과](https://sheet.lodev09.com/guides/backgrounds)
- [TrueSheet Reanimated](https://sheet.lodev09.com/guides/reanimated)
