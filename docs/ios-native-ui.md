# iOS 기본 프레임워크 사용

설정 메뉴와 음악 소스의 기본 표시를 기존 `@expo/ui` 58.0.27의 실제 SwiftUI 컴포넌트로 구현한다. 둥근 사각형·블러·선택 표시를 JavaScript에서 그려 시스템 UI를 흉내 내는 방식을 줄였다. 새 의존성이나 네이티브 패치는 추가하지 않는다.

| 영역             | iOS 구현                                                                     |
| ---------------- | ---------------------------------------------------------------------------- |
| 설정 목록과 구역 | SwiftUI `Form`, 재정렬 화면은 `List`, 공통 `Section`                         |
| 설정 메뉴 행     | SwiftUI `Button`, `Text`, 아이콘 없는 흰색 메뉴 행                           |
| iOS 앱 설정 열기 | SwiftUI 버튼·진행 표시·오류/재시도 행, 기존 동기화 후 `Linking.openSettings` |
| 설정 스위치      | SwiftUI `Toggle`                                                             |
| 옵션·언어 선택   | SwiftUI `Picker`의 시스템 메뉴                                               |
| 메뉴 순서 변경   | SwiftUI `List.ForEach.onMove`, 편집 모드의 기본 드래그 손잡이                |
| 색상 설정        | SwiftUI `ColorPicker`, 적용 버튼을 누를 때 저장                              |
| 연결 정보 입력   | SwiftUI `TextField`, 암호·토큰은 `SecureField`                               |
| 긴 선택 목록     | SwiftUI `DisclosureGroup`, 검색 입력, 선택 토글                              |
| 백업·복구·인증   | SwiftUI 버튼·진행 표시·설명, 기존 공통 동작과 저장소 사용                    |
| 제작자 화면      | UIKit `formSheet` 안의 SwiftUI `NavigationStack`, `Toolbar`, `Form`          |
| 음악 소스 진입   | SwiftUI 버튼과 흰색 레이블                                                   |
| 음악 소스 창     | SwiftUI `BottomSheet`, 중간/전체 높이 detents, 시스템 grabber                |
| 음악 소스 헤더   | SwiftUI `NavigationStack`, `Toolbar`, 시스템 닫기 역할                       |
| 음악 소스 본문   | SwiftUI inset-grouped `List`, `Section`, inline `Picker`, `Button`           |
| 설정 표시        | Expo Router의 UIKit `formSheet`, 중간/전체 높이, 네이티브 X 버튼             |
| 앱 화면 간 이동  | 기존 Expo Router와 UIKit 기반 native stack                                   |

## 책임 경계

- `.ios.tsx`에 SwiftUI import를 한정한다. Android와 웹은 기존 기본 파일을 사용한다. `MusicSourceMenuProps`와 연결 목록은 공통 모델에 두므로 메뉴의 실제 소스·연결·가져오기 동작이 플랫폼에 따라 달라지지 않는다.
- iOS 메뉴/설정 목록은 어두운 시스템 배경과 흰색 글자·버튼을 사용한다. 앱의 저장된 테마 설정은 바꾸지 않는다. 글자 크기·구분선·행 여백·스크롤·접근성은 가능한 범위에서 시스템이 결정한다. iOS 시스템 UI는 Liquid Glass 사용 가능 여부와 독립적으로 유지된다.
- 설정의 기본 컨트롤은 `SettingsNativeContent`를 통해 Form에 직접 들어간다. `RNHostView` 안에 SwiftUI 입력기를 다시 넣지 않는다. 설정 스위치·선택기·입력기의 비활성 상태, 저장 중 중복 호출 방지, 변경 콜백과 햅틱 설정을 유지한다. UIKit 탐색 안에서 사용할 선택기는 별도 SwiftUI 탐색 스택이 필요 없는 `menu` 스타일을 사용한다.
- 재생 동작·가사 번역·보관함 표시·메뉴 순서·색상·연결·백업·숨김 관리의 iOS 편집기를 실제 SwiftUI 컨트롤로 분리한다. 계정 연결, 조회, 취소, 복구, 보호된 설정 인증은 기본 화면과 공통 훅을 사용한다. Android는 기존 편집기와 표시를 유지한다. 파일·폴더 선택기, 권한 창, 시스템 설정 진입 및 Expo Router 탐색도 기존 시스템 경계를 유지한다.
- 선택 목록은 검색과 펼치기를 제공한다. 한 번에 표시하는 검색 결과는 최대 100개(웹 메타데이터 제외 목록은 기존 30개)이며, 화면 밖 항목의 선택도 전체 데이터에 보존한다. 색상은 조절 중 임시 값만 바꾸고 적용 버튼으로 저장한다. 번역 언어가 같아지는 선택은 막고, 출발 언어를 도착 언어로 변경하면 두 언어를 맞바꾼다.
- 버전은 SwiftUI 행으로 표시한다. iOS에서는 버전 제목·값을 합쳐 5번 누르면 제작자 화면을 열고, 그 화면의 `무직노조` 닉네임을 10번 누르면 숨김 메뉴를 전환한다. 버전만 눌러서는 숨김 메뉴를 켤 수 없다. 공통 훅과 저장소가 플랫폼별 횟수·저장·잠금·실패 재시도·닫기/화면 이탈 초기화를 관리하며 Android의 아이콘 15/5번 및 제작자 7번 동작은 유지한다. 제작자 화면도 SwiftUI 툴바·폼·버튼을 사용하며, 제공된 사진을 그대로 표시하는 이미지 뷰만 `RNHostView`로 연결한다.

일반 곡 작업 메뉴도 iOS에서는 장식 아이콘을 표시하지 않고 흰색 글자와 어두운 재질/불투명 배경을 사용한다. Android는 기존 아이콘·라이트/다크 테마를 유지한다.

## 설정 시트

공개 주소를 유지한 채 설정·세부 설정·숨김 관리 경로를 `src/app/(settings)/` 그룹에 넣었다. 루트는 이 그룹 하나만 UIKit `formSheet`로 표시하고, 그룹 안의 Stack은 `card`로 이동한다. 하위 메뉴를 열 때 새 시트를 올리지 않는다. 뒤로가기는 이전 설정 화면으로 이동하고, 네이티브 SF Symbol `xmark` 버튼은 루트 Stack의 설정 그룹 전체를 닫는다. iPad에서도 같은 시트를 사용한다.

지원되는 iOS 26에서는 기존 `GlassBackdrop`의 실제 `GlassView`가 설정 배경을 맡는다. SwiftUI Form의 불투명한 스크롤 배경을 숨기고 구역의 행 바탕을 반투명하게 표시한다. UIKit 상단 바와 X 버튼은 시스템의 Liquid Glass를 사용한다. 앱 효과를 끄거나 투명도 줄이기를 켜면 앱이 그리는 배경을 불투명하게 되돌린다. 지원되지 않는 OS/빌드에서는 Glass API를 호출하지 않는다.

메뉴 행에는 제목과 탐색 표시를 두며 하위 메뉴 이름을 나열하는 부제는 iOS에서 표시하지 않는다. 설명이 필요하면 `SettingsSection.description`의 짧은 문장을 네이티브 구역 footer로 표시한다. Android에서는 기존 행 부제·색상·사이드바·전환을 유지하고 새 footer를 표시하지 않는다. 계정 입력·저장·오류 메시지는 유지한다.

iOS의 SwiftUI `Toggle`과 UIKit `Switch`는 켜진 트랙에 앱 강조색을 사용한다. 기본값은 분홍색이며 저장한 앱 강조색 변경도 따른다. 이 색은 스위치에만 지정하므로 메뉴 글자와 버튼은 흰색을 유지한다. 가사 번역·앨범·상세 화면·웹 메타데이터·메뉴 구성·연결·백업 등의 기능 설명과 검색 표시 한도 안내는 목록 행 대신 구역 footer로 표시한다. 현재 값, 작업 상태, 오류와 빈 목록 안내는 해당 컨트롤 곁에 유지한다.

하단·보관함·재생 화면 메뉴 설정은 iOS에서 ‘메뉴 표시’와 ‘메뉴 순서’ 구역으로 나눈다. 순서 변경 화면의 `SettingsPage reordering`은 Form 대신 inset-grouped `List`를 사용하고 편집 모드를 활성화한다. `List.ForEach`에 안정적인 메뉴 ID와 `onMove`를 연결하므로 시스템이 손잡이·길게 누르기·드래그·스크롤·접근성 이동을 제공한다. 메뉴가 적어 행 재활용은 끈다. 스위치는 표시 구역에만 두고, 숨긴 메뉴도 순서 목록에 유지한다. Android는 기존 스위치와 이동 화살표를 유지한다.

드롭 위치는 SwiftUI의 ‘원본 행을 제거하기 전 인덱스’를 보정해 계산한다. 드롭하면 임시 순서를 즉시 표시하고, 전체 메뉴 ID 순서를 한 번에 저장한다. 저장소는 직렬 큐의 최신 항목과 ID를 대응시켜 표시 여부를 보존하며, 누락·중복·다른 그룹의 ID는 거부한다. 실패하면 기존 순서로 돌아가고 오류를 표시한다.

순서를 놓을 때의 끊김을 줄이기 위해 표시 구역과 순서 구역의 저장소 구독을 분리한다. 표시 스위치는 고정된 항목 순서로 유지하고, 순서 목록은 ID 배열만 `useShallow`로 구독한다. 순서 저장 중에는 스피너 행을 추가하거나 손잡이를 비활성화하지 않는다. 성공 응답이 현재 미리보기와 같으면 같은 데이터 배열을 유지해 다시 행을 교체하지 않는다. 연속 드래그는 저장을 기다리지 않고 즉시 표시하며, 앞선 저장 응답이 최신 미리보기를 덮지 않도록 마지막 응답에서만 확정한다. 실패한 마지막 이동은 마지막 성공 순서로 복원한다.

움직임은 순서 구역의 변경에만 0.22초 `Animation.smooth`를 적용한다. 드래그 미리보기는 시스템 목록의 기본값을 사용한다. 내부 HStack에 별도의 `dragPreview` 모양을 지정하면 행 여백과 손잡이를 제외한 콘텐츠 영역으로 미리보기가 잘려 항목을 집을 때 작아 보일 수 있으므로 적용하지 않는다. 행 높이는 기존 시스템 기본값을 유지하며 전체 설정 시트에 확대·그림자 애니메이션을 겹치지 않는다. 추가 애니메이션은 앱 시작 시 동작 줄이기가 켜져 있으면 적용하지 않는다.

연결 해제 후에는 루트 탐색 상태를 연결 화면으로 재설정해 설정 그룹이 연결 화면을 가리지 않게 한다.

## 음악 소스

메인 화면에는 NAS 로그인 버튼을 표시하지 않는다. iOS의 설정 → 클라우드 연결 → Synology에서는 미연결 상태에 `NAS 로그인` 버튼을 표시한다. 이미 로그인했다면 현재 NAS 주소, 주소 수정·연결 테스트·주소 변경 후 로그인·다시 로그인·연결 해제를 제공한다. 로그인 진입 시 루트 탐색을 재설정해 설정 시트가 로그인 화면을 가리지 않게 한다. 로그인 화면을 여는 것만으로 주소 검사·재생 중단·데이터 삭제를 실행하지 않는다. 기존 데모 상태와 Android의 진입 동작은 유지한다.

시트의 별도 SwiftUI 표시 컨텍스트가 크기와 safe area를 소유한다. 보관함 탭/미니 플레이어 inset을 바깥 여백으로 적용하지 않는다. 중간과 전체 높이에서 시스템 스크롤과 드래그가 협력한다. 앱의 연결 관리 화면은 시트 닫힘이 완료된 다음 Expo Router로 연다. 파일 선택기·권한 창도 `onDismiss` 이후 실행한다.

음악 보관함의 선택기 제목은 숨기고 VoiceOver 이름은 유지한다. 선택 항목과 연결/가져오기 행에는 장식 아이콘을 표시하지 않는다.

iOS 26 이상은 시스템의 `close` 역할 버튼을 사용한다. 구형 iOS에서는 빈 버튼이 생기지 않도록 `cancel` 역할과 `닫기` 레이블을 제공한다. iOS 18 등에서도 기본 SwiftUI 목록과 컨트롤을 사용할 수 있으며 Liquid Glass를 직접 호출하지 않는다.

## NAS 로그인 화면

iOS의 로그인 화면은 큰 로고·그라데이션·소개 문구를 제거하고 SwiftUI NavigationStack·Toolbar·Form·Section으로 구성한다. 서버 주소, 계정·비밀번호, 로그인 동작을 구분하며 앱 강조색과 테마를 따른다. Form이 스크롤·키보드 여백·Dynamic Type을 처리한다. 취소 또는 기기 음악 듣기는 보관함으로 돌아가며 데모 진입도 유지한다.

비밀번호는 SecureField를 사용하고, 계정·비밀번호·인증 코드에 시스템 자동 완성 의미를 지정한다. HTTP 허용은 HTTP 주소일 때, 2단계 인증 코드는 NAS가 요구할 때만 표시한다. 연결 중에는 입력·중복 요청·취소를 막고 진행 상태를 표시한다. 로그인 성공 시 비밀번호·인증 코드를 지우고 보관함으로 이동한다.

`src/app/connect.tsx`는 플랫폼별 `features/connection/connect-screen`으로 연결한다. Android와 웹은 기존 화면을 유지하며, 기존 로그인·연결 테스트 동작은 `use-connect-form.ts`를 공유한다. 인증 저장소·NAS API·오디오 엔진에는 변경이 없다. `check-connect-screen.cjs`는 로그인 폼, HTTP 동의, 2단계 인증, 비밀 입력 지우기, 실패·중복 요청, 취소·데모와 Android 표시 경계를 검사한다. 네이티브 렌더링·키보드·실제 NAS 로그인은 별도의 실기기 확인이 필요하다.

## 보관함 정렬

앨범·노래·아티스트·좋아요 정렬은 iOS 전용 SwiftUI Button과 inline Picker 목록을 사용한다. 음악 소스와 정렬은 `library-sheet.ios.tsx`의 BottomSheet·NavigationStack·Toolbar 표시를 공유하며 중간/전체 높이와 시스템 닫기를 유지한다. 정렬 선택 시 기존 콜백을 호출하고 시트를 닫는다. 탭별 정렬 상태·정렬 알고리즘·재생 대기열 입력은 변경하지 않는다. Android와 웹의 기존 정렬 모달은 유지한다.

보관함의 음악 소스 버튼과 정렬 버튼은 현재 `useColors().tint`를 Host의 seedColor, 네이티브 버튼의 tint와 foregroundStyle에 전달한다. 앱 강조색을 바꾸면 두 버튼의 아이콘·문자·시스템 버튼 색상이 함께 갱신된다. 시트 내부의 기존 흰색 목록과 닫기 버튼은 유지한다. `check-music-source-sheet.cjs`는 두 버튼의 강조색 갱신, 네이티브 시트 공유, 정렬 선택/닫기와 탭별 제목을 검사한다. 실제 기기의 색상·배치·터치는 별도 확인이 필요하다.

## 검증

- `scripts/check-ios-hidden-feature-entry.cjs`: 실제 iOS 버전 행·공통 훅·제작자 대화상자·저장소를 연결해 5번/10번 순서, 기존 경로 비활성화, 메뉴 표시/숨김, 저장·오류 재시도, 닫기/화면 이탈/3초 간격 초기화를 확인한다.
- `scripts/check-native-settings.cjs`: 실제 설정 컴포넌트/공통 동작을 읽어 Form·Section·네이티브 행, 단일 시트와 내부 이동, 루트 X 닫기, 유리/불투명 배경, 구역 설명과 행 부제 제거, 경로 이동, 저장 중/비활성 상태, 기존 편집기 호스팅, UIKit 스위치, 동기화 후 시스템 설정 열기·실패·재시도를 확인한다.
- `scripts/check-music-source-sheet.cjs`: 실제 SwiftUI 시트·툴바·목록·선택기 구성, 높이 단계, 닫기 완료, 연결 가능한 소스만 선택, 가져오기/재시도, 구형 iOS 닫기 버튼을 확인한다.
- `check-library-glass.cjs`: 실제 부모 컨트롤과 메뉴의 소스 선택 및 iOS의 닫힘 후 호출, Android의 즉시 호출을 확인한다.
- `scripts/check-ios-settings-controls.cjs`: 실제 재생/보관함 화면의 Form 통합, 저장소 연결, 번역 언어 교환·같은 언어 차단, 마지막 메뉴 보호·순서 변경, 색상 적용/초기화, 보안 필드 초기화, 연결 중 중복 호출 방지, 보호된 설정 잠금/해제, 제작자 화면 동작을 검사한다.
- `scripts/check-creator-release.cjs`: 실제 Expo production preset과 React Compiler로 제작자 화면을 변환한다. SwiftUI 이미지를 `Symbol`로 가져오면 생성된 `Symbol.for` 캐시 검사가 이미지 컴포넌트로 연결되어 발생하는 오류를 재현하고, `SwiftUIImage` 별칭으로 수정한 화면을 iOS 18/26/27 조건에서 검사한다. 단순 TypeScript 변환만으로는 이 오류를 잡을 수 없다.
- `scripts/check-menu-reordering.cjs`: 위·아래·끝·여러 행 드롭의 인덱스, 세 메뉴 그룹의 저장/재시작, 표시 변경과 재정렬의 동시 저장, 잘못된 ID, 저장 실패와 재시도를 검사한다. iOS 설정 통합 검사는 별도 구역과 기본 List, 중복 드롭 차단, 데이터 배열 유지, 스피너/손잡이 상태 유지, 느린 저장 중 연속 드래그와 오래된 응답 차단, 실패 시 복원 및 동작 줄이기를 확인한다. 실제 Zustand `useShallow`를 테스트용 React 경계와 연결한다.
- 저장·백업·숨김 설정 등 기존 검사를 유지한다. 네이티브 뷰는 모의 경계이므로 UI 렌더링이나 실기기 터치 성공을 의미하지 않는다.

기기에서는 설정의 긴 설명과 확대 글자, 복잡한 편집기의 키보드/스크롤, iPad 크기 변경, 재생 중 소스 시트 열기·높이 변경·닫기, 파일 선택 취소와 설정 화면 전환을 확인한다.

2026-11-11에는 연결된 iPhone 16 Pro(iOS 27.2.1)의 제작자 화면 진입 충돌을 콘솔에서 재현했다. 기존 네이티브 바이너리에 수정한 Release JavaScript와 에셋을 넣고 서명한 별도 검증 앱을 설치했으며, 사용자가 버전 5번 누르기 → 제작자 화면 열기 → 닫기 → 다시 열기의 정상 동작을 확인했다. 확인 후에도 앱 프로세스가 실행 중이었고 수집한 콘솔에는 치명적 예외가 없었다. 이 확인은 제작자 화면 진입·닫기·재진입에 한정한다.

같은 날 메뉴 재정렬 수정본을 검증 앱에 설치했다. 실기기 캡처로 하단 메뉴의 스위치 구역과 기본 드래그 손잡이가 있는 순서 구역을 확인했고, 사용자가 손잡이를 길게 눌러 드래그한 뒤 설정을 다시 열어도 순서가 유지되는 것을 확인했다. 보관함·재생 화면의 동일 컴포넌트 연결과 저장 동작은 모의 검사로 확인했다.

## 공식 API

- [Expo SDK 58 Expo UI](https://docs.expo.dev/versions/v58.0.0/sdk/ui/)
- [Form](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/form/), [Section](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/section/)
- [List 편집과 순서 변경](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/list/#selection-and-edit-mode), [SwiftUI onMove](<https://developer.apple.com/documentation/swiftui/dynamicviewcontent/onmove(perform:)>)
- [BottomSheet](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/bottomsheet/), [Toolbar](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/toolbar/)
- [RNHostView](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/rnhostview/)
- [Toggle](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/toggle/), [Picker](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/picker/)
- [ColorPicker](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/colorpicker/), [TextField](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/textfield/), [SecureField](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/securefield/), [DisclosureGroup](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/disclosuregroup/)
- [Expo Router nested navigators](https://docs.expo.dev/router/advanced/nesting-navigators/), [native header items](https://docs.expo.dev/router/advanced/stack/#header-buttons)
