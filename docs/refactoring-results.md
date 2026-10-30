# 유지보수 리팩토링 작업 기록

## 보존한 계약

- 기존 화면·라우팅·저장소 메서드, 곡 ID, 계정 scope, SQLite 구조, 저장 키와 JSON·백업 버전을 유지했다.
- NAS의 원본/MP3 품질 선택, Google의 선택 파일 권한과 토큰 재발급, MYBOX의 재생 캐시와 원본 다운로드 차이를 유지했다.
- 인증 요청 세대와 네이티브 Promise 장벽, 오래된 저장 작업의 정리·원복, 직렬 쓰기, 파일 교체 저널과 부분 성공 처리를 유지했다.
- 기존 오디오 패치·패키지 버전·잠금 파일을 변경하지 않았다. 기존 `AGENTS.md` 수정도 보존했다.
- 새 프레임워크와 프로젝트 의존성을 추가하지 않았다. 서식 도구는 프로젝트 밖 임시 캐시에서 실행했다.

## 단계별 변경과 검증

각 단계에서 관련 회귀 검사와 앱 lint·타입 검사를 수행했다. 현재 설치본의 타입 검사는 작업 전부터 있던 오디오 선언 불일치로 실패했으며, 최종적으로 잠금 파일과 등록 패치를 새로 설치한 별도 작업 공간에서는 전체 타입 검사가 통과했다.

| 단계 | 주요 변경 파일 | 구조·중복·인터페이스 | 검증 | 남은 위험 |
| --- | --- | --- | --- | --- |
| 검증 기반 | `scripts/check-s3.cjs`, `scripts/check-favorites.cjs` | S3 영속화 검사가 현재 즉시 저장 계약을 기다리도록 수정. 누락된 좋아요 표시 설정 저장 검사를 연결 | 두 검사 통과 | 네이티브 저장소 자체는 모의 구현 |
| Drive | `src/stores/google-drive.ts`, `src/services/google-drive/session.ts`, `library.ts`, `src/services/playback/metadata.ts` | 인증·토큰과 목록·보강 작업 분리. 저장소의 사용자 작업·상태·공유 큐 유지. 대기열 병합을 재생 모듈로 이동 | Google Drive·Drive 메타데이터·문서 검사 통과 | 실제 OAuth 창·파일 공급자·기기 재생 미검증 |
| 보관함 | `src/features/library/queries.ts`, `song-library.ts`, `use-source-libraries.ts`, `refresh-source-libraries.ts`, `refresh-music-library.ts`, `library-page.tsx` | 구독·순수 목록 조합·새로고침 실행 분리. 정상/장애 경로의 편집 적용 중복 제거. UI 상태 타입의 조회 Hook 의존 제거 | 앨범·보관함 상태·10,000곡 성능·S3·MYBOX 검사 통과 | 실제 기기 프레임 시간 미측정 |
| 소스·재생 계약 | `src/services/playback/source.ts`, `controller.ts`, `audio-engine.ts`, `section-repeat-controller.ts`, `src/services/cloud-music/source.ts`, `src/services/offline-music/download.ts`, `src/types/music.ts` | 재생 소스 선택을 한곳으로 이동. 클라우드 재생/다운로드에 명시적인 옵션 객체 제공. 공통 엔진 계약에 실제 사용하는 메타데이터·세션 메서드 명시. 기존 공개 함수 유지 | 새 소스 계약 검사와 재생 복구·무손실·구간 반복·다운로드 검사 통과 | iOS/Android 네이티브 디코딩·잠금화면·백그라운드 재생 미검증 |
| 초기화·직렬화 | `src/features/startup/use-app-bootstrap.ts`, `use-music-source-bootstrap.ts`, `src/stores/auth.ts`, `s3.ts`, `mybox.ts`, `drive-documents.ts` | 소스 초기화·가시성 갱신을 분리. 저장소별 반복 Promise 큐를 기존 `createSerialQueue`로 통합. 각 저장소의 실패 정책은 유지 | 시작 복구·백그라운드 영속화·인증 경쟁·소스별 저장 검사 통과 | 실제 Activity 재생성·기기 인증 미검증 |
| 로컬 음악 | `src/services/local-music/storage.ts`, `database.ts`, `files.ts`, `metadata-recovery.ts`, `import-types.ts`, `scan.ts`, `src/services/music-source.ts` | DB·파일 접근·저널 복구 분리. 스캔의 저장 모듈 역참조와 확장자 판정 중복 제거. 변경 큐는 하나로 유지 | 로컬·기기 음악·폴더 제외·파일 복사·파일 메타데이터 검사 통과 | 실제 저장 공간 부족·OS 종료·권한 환경 미검증 |
| 편집·복구 | `src/services/metadata/written-song.ts`, `write-song-file.ts`, `tag-writer.ts`, `src/features/artwork/artwork-editor.tsx`, `src/services/settings-backup.ts` | 파일 쓰기 후 곡 변경 계산 중복 제거. 대기열 반영 분리. 앨범아트의 긴 JSX 작업을 명명된 함수로 이동. ID3 읽기/작성과 일반 설정/계정 복구 책임 구분 | 파일 메타데이터·앨범아트·설정 백업·플레이리스트 백업 검사 통과 | 실제 원격 파일 교체·기기 I/O 미검증 |
| 검사 코드 품질 | `eslint.config.js`, `scripts/test-cloud-fixtures.cjs`, `check-library-state.cjs`와 중복 mock이 있던 회귀 스크립트 | 실제 추출 모듈을 공통 로더로 읽도록 연결. 동일한 리터럴 mock 속성 28개 제거. Node 전역과 모의 Hook 검사 환경을 스크립트 범위에만 설정. 앱의 Hook 규칙 유지 | 앱·스크립트·플러그인·설정 파일 전체 ESLint를 `--max-warnings 0`으로 통과. 영향받은 검사 10개 재실행 통과 | 전체 네이티브 테스트 환경은 별도 |

변경한 소스는 기존 Prettier 설정을 적용했다. 파일 길이 감소를 목표로 삼지 않아 압축된 JSX와 조건식은 여러 줄로 풀었다. 검사 로더는 공통 소스 로더로 실제 추출 모듈을 읽고, 네이티브·네트워크·저장소 경계만 대체한다.

## 최종 검증 결과

- 변경 전: 앱 소스 lint 통과, 타입 검사 실패 1건, 일반 회귀 검사 73개 중 71개 통과. 기존 설치본에서 Android/iOS 프로덕션 번들 생성 성공.
- 변경 후: 일반 회귀 검사 74개 중 73개 통과. 새 `check-source-contracts.cjs`에서 NAS·데모·로컬·클라우드 선택, MYBOX 재생/다운로드 분리, 기존 오류 객체 보존을 검증했다.
- 앱·스크립트·플러그인·설정 파일 전체 lint 통과. 오류·경고 0개. `git diff --check` 통과.
- `check-clean-export.cjs --online` 통과. 원본 설치본을 보존하고 별도 임시 폴더에 `--frozen-lockfile --ignore-scripts --side-effects-cache=false`로 설치했다. 타입 검사와 Android/iOS 프로덕션 번들·소스맵의 실제 화면 포함 검사가 통과했다.
- 오프라인 새 설치는 로컬 저장소에 `structured-headers@0.4.1` 배포 파일이 없어 실패했고, 온라인 설치로 검증했다.
- APK/IPA 전체 컴파일·실기기·실제 서비스 계정 검증은 실행하지 않았다.

## 미해결 항목과 의도적으로 보류한 변경

1. **현재 설치본의 오디오 선언:** 등록 패치에는 `AudioSource.mimeType`이 있지만 현재 `node_modules` 선언에는 없어 로컬 타입 검사가 실패한다. 소스에 타입 단언을 추가하거나 의존성 파일을 직접 고치지 않았다. 별도 새 설치에서는 패치 적용과 타입 검사가 통과했다.
2. **오픈소스 고지:** `check-open-source-notices.cjs`는 기존 감사 자료의 잠금 파일 해시 불일치로 실패한다. 이 작업은 의존성·잠금 파일을 변경하지 않았으며, 검사를 통과시키기 위해 감사 해시만 바꾸지 않았다. 기존 고지 갱신 절차에 따른 별도 감사가 필요하다.
3. **동작 계약 변경 후보:** 기존 NAS 새로고침의 세 API 호출·캐시 기록, 소스별 오류 클래스, 저장 JSON의 수용 범위, `source`가 생략된 NAS 곡 호환성을 유지했다. 이들을 제거하거나 엄격하게 만드는 변경은 이번 구조 개선에 섞지 않았다.
4. **추가 구조 후보:** 루트 레이아웃의 설정 초기화 전체 이동과 보관함의 완전한 탭별 판별 props는 후속 후보다. 현재는 소스 초기화 책임과 조회 Hook에 종속된 UI 타입까지 정리했다.

실기기 검증이 필요한 단계는 코드·모의 회귀 검사와 구분해야 하며, 이 기록은 네이티브 환경까지 검증 완료했다는 의미가 아니다.
