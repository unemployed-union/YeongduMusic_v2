npx expo prebuild --platform ios

xcodebuild \
  -workspace ios/YeongduMusic.xcworkspace \
  -scheme YeongduMusic \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$PWD/build/ios" \
  CODE_SIGNING_ALLOWED=NO \
  build
# 앱 경로 확인
APP="build/ios/Build/Products/Release-iphoneos/YeongduMusic.app"

# IPA 구조 생성
mkdir -p build/ipa/Payload

# 앱 복사
ditto "$APP" "build/ipa/Payload/YeongduMusic.app"

# IPA 생성
cd build/ipa
zip -qry YeongduMusic.ipa Payload