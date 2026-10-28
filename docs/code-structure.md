# 코드 구조와 유지보수

## 화면과 재생 제어

`src/app/player.tsx`는 Expo Router 진입점으로 `PlayerScreen`을 내보냅니다. 실제 화면은 `src/features/playback`에 있습니다.

| 파일 | 책임 |
| --- | --- |
| `player-screen.tsx` | 반응형 배치, 패널 선택, 메뉴·화면 이동, 제스처 연결 |
| `player-header.tsx` | 닫기·가사·대기열 버튼과 플랫폼별 배경 |
| `player-song-details.tsx` | 곡명, 아티스트, 좋아요, 메뉴 진입점 |
| `player-queue.tsx` | 가상화한 다음 재생 목록과 선택 콜백 |
| `player-progress.tsx` | 탐색 미리보기, 완료·취소·화면 비활성화 처리, 이전 탐색 결과 무시 |
| `player-transport-controls.tsx` | 재생·이전·다음·셔플·반복 버튼 |
| `player-screen-styles.ts` | 화면과 하위 구성 요소에서 공유하는 배치·스타일 |

`services/playback/controller.ts`가 오디오 엔진, 재생 소스 요청 취소, 곡 전환의 세대를 소유합니다. 구간 반복은 `section-repeat-controller.ts`가 소유하고 필요한 엔진·현재 위치·세대·수면 타이머 판단을 콜백으로 받습니다. 화면 구성 요소가 별도 오디오 엔진을 만들지 않습니다.

대기열 필터는 `services/playback/queue.ts`에서 공유합니다. 같은 곡 ID가 여러 번 들어가도 현재 선택한 **등장 위치**를 유지하므로, 선택 인덱스를 `findIndex(id)`로 대체하지 않습니다. 숨김 곡·소스별 접근 가능 여부의 판단은 기존 도메인에 남깁니다.

## 설정과 저장

`services/preferences/storage.ts`는 기존 비밀 정보가 아닌 설정의 웹 `localStorage`와 네이티브 SQLite KV 접근을 공유합니다. SecureStore를 사용하던 설정과 계정 정보는 기존 저장 방식을 유지합니다.

`createPreferencePersistence`는 색상, 좋아요 표시, 보관함 상세, 햅틱, 블러 설정에서 다음을 공유합니다.

- 중복 불러오기 병합과 강제 재시도
- 불러오기 실패 시 저장 차단
- 마지막으로 저장에 성공한 값을 기준으로 순서대로 변경 적용
- 실패 후 다음 저장 진행, 대기 중인 저장 수에 따른 상태 표시

저장 키, 기본값, 유효성 검사, 오류 문구, 직렬화 형식은 각 저장소가 지정합니다. 햅틱처럼 버전 정보를 감싸는 형식은 `decode`·`encode`로 유지합니다.

원본 저장소의 동작이 다른 경우에는 공통 수명 주기를 강제하지 않습니다. 테마의 네이티브 적용 실패 복구, 앨범아트·자동 메타데이터 저장 중 취소 후 원복, SecureStore 기반 설정의 오류 정책은 각 저장소에 있습니다. 이들도 저장 I/O 또는 `services/async/serial-queue.ts`의 작업 큐를 재사용합니다. `run`은 호출자에게 실패를 전달하고, `settled`는 앞선 작업이 성공하거나 실패한 뒤 완료됩니다.

## Google Drive 연결

`stores/google-drive.ts`는 연결 상태와 사용자 작업을 조정합니다. SDK 초기화·인증 오류 변환은 `services/google-drive/auth.ts`, 허용 범위 판단은 `scopes.ts`, 단계별 진행·시간 제한·취소는 `connection-tasks.ts`에 있습니다.

네이티브 인증 요청은 화면에서 취소하거나 시간 제한을 넘겨도 실제 Promise가 끝나기 전까지 다음 인증 요청을 막습니다. 이 장벽과 저장 직전 세대 검사를 유지해야 합니다. 파일 선택기와 연결 저장소는 같은 `drive.file` 범위 판단을 사용합니다.

## 서식과 검증

변경한 코드는 `.prettierrc.json`을 따릅니다. 프로젝트에 포맷터 의존성을 추가하지 않았으며, 필요한 파일에 다음 명령을 사용할 수 있습니다.

```bash
pnpm dlx prettier@3.6.2 --write <파일 경로>
npx expo lint
npx tsc --noEmit
```

`scripts/check-*.cjs`는 영역별 회귀 검사입니다. 공통 모듈로 코드를 옮겼을 때는 `scripts/test-source-loader.cjs`를 이용해 실제 TypeScript 모듈을 읽고, 네이티브·네트워크·저장소 경계만 명시적으로 대체합니다. 공유 로직 자체를 가짜 구현으로 바꾸지 않습니다.

```bash
node scripts/check-responsive-layout.cjs
node scripts/check-section-repeat.cjs
node scripts/check-sleep-timer.cjs
node scripts/check-google-drive.cjs
node scripts/check-ios-system-settings.cjs
node scripts/check-clean-export.cjs
```

`check-clean-export`는 임시 디렉터리에 현재 소스·잠금 파일·등록된 패치를 복사하고 새로 설치한 다음 프로덕션 번들과 타입을 검사합니다. 기본값은 오프라인 설치이며 패키지 캐시가 없으면 `--online`을 사용합니다. 원본 프로젝트의 의존성을 삭제하거나 재설치하지 않습니다. 네이티브 APK/IPA 컴파일과 실제 기기 렌더링·재생 검증은 별도입니다.

오픈소스 고지 검사는 별도의 의존성 감사를 사용합니다. 잠금 파일 해시가 맞지 않을 때는 [고지 갱신 절차](../assets/legal/README.md)를 따르며 검사만 통과하도록 해시를 바꾸지 않습니다.
