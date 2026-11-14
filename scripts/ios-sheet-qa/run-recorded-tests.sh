#!/bin/zsh
# Run against an already installed local Simulator app. No device/cloud operations.
set -eu
qa_device="${1:?Simulator UUID required}"
qa_label="${2:?Unique result label required}"
shift 2
case "$qa_label" in
  ""|*[!a-zA-Z0-9_-]*)
    print -u2 'Result label must contain letters, digits, underscores or hyphens only.'
    exit 2
    ;;
esac
qa_output="/tmp/yeongdu-group-${qa_label}"
mkdir "$qa_output"
xcrun simctl io "$qa_device" recordVideo --codec=h264 "$qa_output/recording.mp4" > "$qa_output/video.log" 2>&1 &
qa_recorder_pid=$!
finish_recording() {
  kill -INT "$qa_recorder_pid" 2>/dev/null || true
  wait "$qa_recorder_pid" 2>/dev/null || true
}
trap finish_recording EXIT
qa_filters=()
for qa_method in "$@"; do
  qa_filters+=("-only-testing:SheetUITests/SheetUITests/${qa_method}")
done
xcodebuild -project /tmp/yeongdu-sheet-ui-tests/SheetUITests.xcodeproj \
  -scheme SheetUITests -configuration Debug \
  -destination "platform=iOS Simulator,id=${qa_device}" \
  -derivedDataPath /tmp/yeongdu-sheet-ui-test-build \
  -resultBundlePath "$qa_output/tests.xcresult" \
  "${qa_filters[@]}" test-without-building CODE_SIGNING_ALLOWED=NO > "$qa_output/tests.log" 2>&1
