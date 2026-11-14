#!/bin/zsh
set -eu
probe_device="${1:?Simulator UUID required}"
probe_label="${2:?Unique result label required}"
probe_method="${3:?XCTest method required}"
case "$probe_label" in
  ""|*[!a-zA-Z0-9_-]*)
    print -u2 'Use a unique alphanumeric result label.'
    exit 2
    ;;
esac
probe_output="/tmp/yeongdu-native-sheet-probe/${probe_label}"
mkdir "$probe_output"
xcrun simctl io "$probe_device" recordVideo --codec=h264 "$probe_output/recording.mp4" > "$probe_output/video.log" 2>&1 &
probe_recorder=$!
finish_recording() {
  kill -INT "$probe_recorder" 2>/dev/null || true
  wait "$probe_recorder" 2>/dev/null || true
}
trap finish_recording EXIT
xcodebuild -project /tmp/yeongdu-native-sheet-probe/Probe.xcodeproj \
  -scheme NativeSheetProbe \
  -destination "platform=iOS Simulator,id=${probe_device}" \
  -derivedDataPath /tmp/yeongdu-native-sheet-probe/build \
  -resultBundlePath "$probe_output/tests.xcresult" \
  "-only-testing:ProbeTests/ProbeTests/${probe_method}" \
  test-without-building CODE_SIGNING_ALLOWED=NO > "$probe_output/tests.log" 2>&1
