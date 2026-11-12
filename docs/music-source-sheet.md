# iOS 음악 소스 시트

음악 소스는 기존 `@expo/ui`의 실제 SwiftUI `BottomSheet`·`NavigationStack`·`Toolbar`·`List`·`Picker`로 표시한다. 시스템이 높이 변경, safe area, 스크롤과 아래로 밀어 닫기를 처리한다. 중간과 전체 높이를 지원하고 시스템 grabber를 표시한다. Android와 웹은 기존 `PlaylistSheet`와 React Native 목록을 유지한다.

## 배치와 동작

iOS 목록과 닫기 버튼은 흰색으로 표시한다. 목록의 장식 아이콘과 보관함 선택기의 중복 `음악 소스` 제목은 표시하지 않으며 소스 항목·선택 표시·VoiceOver 설명은 유지한다.

보관함의 하단 inset에는 네이티브 탭과 재생 중인 미니 플레이어의 공간이 포함될 수 있다. 이 값을 시트의 바깥 여백으로 사용하지 않는다. SwiftUI 시트가 자체 표시 컨텍스트에서 크기를 결정하며, 보관함에 놓인 0 크기 Host는 배치 공간을 추가하지 않는다.

- 소스 선택은 native inline Picker로 표시한다. 연결된 계정의 소스만 제공하며 현재 선택과 동일하거나 목록에 없는 선택은 무시한다.
- 연결 관리·가져오기·다시 불러오기는 아이콘 없는 SwiftUI 버튼을 사용한다.
- 파일/권한 창과 연결 화면 이동은 시트가 완전히 닫힌 `onDismiss` 이후 한 번만 실행한다.
- iOS 26 이상은 시스템 닫기 역할을, 구형 iOS는 `닫기` 레이블의 취소 버튼을 사용한다.
- 어두운 시스템 배경에 흰색 글자와 버튼을 사용하고, 행 높이·글자 크기·재질·회전과 접근성 표현은 시스템에 맡긴다.

## 구조와 검증

`local-music-controls.tsx`가 기존 저장소의 값과 동작을 연결하고, `music-source-menu-model.ts`가 공통 인터페이스와 연결 항목을 정의한다. 플랫폼별 표시 파일에는 계정/재생 엔진 상태를 새로 만들지 않는다.

`check-music-source-sheet.cjs`와 `check-library-glass.cjs`는 실제 컴포넌트와 콜백의 연결을 검사한다. 네이티브 뷰는 모의 구현이므로 실제 기기의 배치·터치 검증과 구분한다. 추가 설명은 [iOS 기본 프레임워크 사용](ios-native-ui.md)에 있다.

시트의 네이티브 표시는 `library-sheet.ios.tsx`로 공유하며 iOS 보관함 정렬 창도 같은 표시 구성을 사용한다. 음악 소스 진입 버튼은 정렬 버튼과 동일한 SwiftUI bordered 스타일이며 앱 강조색을 따른다. 시트 내부의 흰색 목록·닫기 버튼과 파일 선택기 표시 순서는 유지한다.

## 근거

- [Apple Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)
- [Expo SDK 58 BottomSheet](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/bottomsheet/)
- [Expo SDK 58 Toolbar](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/toolbar/)
