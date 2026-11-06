/* global __dirname */
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const androidDirectory = path.resolve(__dirname, '..', 'android');
const isWindows = process.platform === 'win32';
const gradleCommand = isWindows ? 'gradlew.bat' : './gradlew';

// Refresh JSON assets as well as source files before packaging the release APK.
const result = spawnSync(gradleCommand, [
  ':app:createBundleReleaseJsAndAssets',
  '--rerun',
  ':app:assembleRelease',
  '--max-workers=2',
], {
  cwd: androidDirectory,
  stdio: 'inherit',
  shell: isWindows,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log('APK: ' + path.join(androidDirectory, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'));
