/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const project = fs.mkdtempSync(path.join(os.tmpdir(), 'yeongdu-clean-export-'));
const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root }).toString('utf8').split('\0').filter(Boolean);
for (const file of new Set(files)) {
  assert(!file.startsWith('.expo/'), 'Generated Expo files must not be tracked');
  const source = path.join(root, file), destination = path.resolve(project, file);
  assert(destination.startsWith(project + path.sep), 'Source file must stay within the clean project');
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) continue;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}
assert(!fs.existsSync(path.join(project, '.expo')), 'The clean export must start without .expo');
assert(!fs.existsSync(path.join(project, 'expo-env.d.ts')), 'The clean export must not copy generated declarations');
console.log('Clean source copy (no .expo, native projects, or local environment files): ' + project);
const temp = path.join(project, 'temp');
fs.mkdirSync(temp);
const env = { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1', TEMP: temp, TMP: temp };
// Install into the copy: linking node_modules across Windows drives can make
// Expo Router silently export an empty route context instead of application code.
const network = process.argv.includes('--online') ? '' : '--offline ';
const install = spawnSync('pnpm install ' + network + '--frozen-lockfile --ignore-scripts --side-effects-cache=false', { cwd: project, env, stdio: 'inherit', shell: true });
if (install.error) throw install.error;
if (install.status !== 0) process.exit(install.status ?? 1);
function run(entry, args) {
  const result = spawnSync(process.execPath, [entry, ...args], { cwd: project, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const resolveLocal = name => require.resolve(name, { paths: [project] });
const expoCli = path.join(path.dirname(resolveLocal('expo/package.json')), 'bin/cli');
run(expoCli, ['export', '--platform', 'all', '--source-maps', '--output-dir', 'dist', '--clear', '--max-workers', '2']);
run(resolveLocal('typescript/bin/tsc'), ['--noEmit']);
const metadata = JSON.parse(fs.readFileSync(path.join(project, 'dist/metadata.json'), 'utf8'));
for (const platform of ['android', 'ios']) {
  const map = JSON.parse(fs.readFileSync(path.join(project, 'dist', metadata.fileMetadata[platform].bundle + '.map'), 'utf8'));
  for (const file of ['src/app/_layout.tsx', 'src/app/player.tsx', 'src/features/playback/player-screen.tsx', 'src/components/text.tsx']) {
    const index = map.sources.findIndex(source => source.replaceAll('\\', '/').endsWith(file));
    assert(index >= 0, platform + ' bundle must include the actual app screen: ' + file);
    const original = fs.readFileSync(path.join(project, file), 'utf8');
    assert.equal(map.sourcesContent[index].replace(/\r\n/g, '\n'), original.replace(/\r\n/g, '\n'), platform + ' bundle must use the current source: ' + file);
  }
}
console.log('PASS: Android/iOS production bundles contain the current application screens, with a clean lockfile install and typecheck, without pre-existing .expo files. Native APK/IPA compilation was not run.');
