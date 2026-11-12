/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const workspace = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const source = path.resolve(option('--source', workspace));
const output = path.resolve(option('--output', path.join(os.tmpdir(), 'yeongdu-ios-ui-preview')));
const scenes = option('--scenes', 'library,settings,search,playlists,player,connect').split(',');
const interval = Number(option('--interval', '18000'));
if (
  output === source ||
  output.startsWith(source + path.sep) ||
  source.startsWith(output + path.sep)
)
  throw new Error('Preview output and source must be separate trees.');
if (
  !(output.startsWith('/tmp/') || output.startsWith('/private/tmp/')) ||
  !Number.isFinite(interval) ||
  interval < 1000
) {
  throw new Error(
    'Preview output must be a temporary directory and interval must be at least 1000 ms.',
  );
}
fs.mkdirSync(output, { recursive: true });
for (const directory of ['src', 'plugins', 'modules']) {
  if (fs.existsSync(path.join(source, directory))) {
    fs.rmSync(path.join(output, directory), { recursive: true, force: true });
    fs.cpSync(path.join(source, directory), path.join(output, directory), { recursive: true });
  }
}
for (const name of [
  'package.json',
  'app.json',
  'tsconfig.json',
  'build-version.json',
  'pnpm-workspace.yaml',
]) {
  const candidate = fs.existsSync(path.join(source, name))
    ? path.join(source, name)
    : path.join(workspace, name);
  if (fs.existsSync(candidate)) fs.copyFileSync(candidate, path.join(output, name));
}
for (const [name, destination] of [
  ['node_modules', path.join(workspace, 'node_modules')],
  ['assets', fs.realpathSync(path.join(source, 'assets'))],
]) {
  if (!fs.existsSync(path.join(output, name)))
    fs.symlinkSync(destination, path.join(output, name), 'dir');
}
const qa = path.join(output, 'src/qa');
fs.mkdirSync(qa, { recursive: true });
// This adapter belongs to the temporary visual fixture only. It never accesses credentials.
fs.writeFileSync(
  path.join(qa, 'secure-store.ts'),
  `const values = new Map<string, string>();
export const AFTER_FIRST_UNLOCK = 0;
export const WHEN_UNLOCKED = 1;
export async function getItemAsync(key: string) { return values.get(key) ?? null; }
export async function setItemAsync(key: string, value: string) { values.set(key, value); }
export async function deleteItemAsync(key: string) { values.delete(key); }
export async function isAvailableAsync() { return true; }
`,
);
fs.writeFileSync(
  path.join(output, 'metro.config.cjs'),
  `const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.cacheVersion = 'ui-qa-' + path.basename(__dirname);
config.resolver.resolveRequest = (context, name, platform) => {
  const target = name === 'expo-secure-store' ? path.join(__dirname, 'src/qa/secure-store.ts') : name;
  return context.resolveRequest(context, target, platform);
};
module.exports = config;
`,
);

fs.writeFileSync(
  path.join(qa, 'ui-qa-route.tsx'),
  `import { useEffect } from 'react';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { usePlaybackStore } from '@/stores/playback';
import { useHiddenFeatureAccess } from '@/stores/hidden-feature-access';
import { mockSongs } from '@/features/library/mock-repository';
// Isolated preview only: no real server session, audio commands or production code switch.
useAuthStore.setState({ ready: true, mode: 'mock', session: null });
const scenes = ${JSON.stringify(scenes)};
const targets: Record<string, string> = { library: '/(tabs)/(library)', settings: '/settings', search: '/(tabs)/search', playlists: '/(tabs)/(playlists)/playlists', player: '/player', connect: '/connect', hidden: '/hidden-music', album: '/(tabs)/(library)/album/mock-album-0' };
export function UiQaRoute() {
  useEffect(() => {
    useHiddenFeatureAccess.setState({ ready: true, enabled: true });
    usePlaybackStore.setState({ queue: mockSongs.slice(0, 5), index: 0, playing: false, duration: mockSongs[0].duration });
    let index = 0;
    function show() {
      const scene = scenes[index];
      router.replace('/(tabs)/(library)');
      if (scene !== 'library') setTimeout(() => router.push(targets[scene] as never), 400);
      console.log('UI_QA_SCENE', scene);
      index = (index + 1) % scenes.length;
    }
    const first = setTimeout(show, 1500);
    const timer = setInterval(show, ${interval});
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);
  return null;
}
`,
);
const layoutPath = path.join(output, 'src/app/_layout.tsx');
let layout = fs.readFileSync(layoutPath, 'utf8');
layout = "import { UiQaRoute } from '@/qa/ui-qa-route';\n" + layout;
layout = layout.replace(
  '<ThemeProvider value={navigationTheme}>',
  '<ThemeProvider value={navigationTheme}>\n      <UiQaRoute />',
);
fs.writeFileSync(layoutPath, layout);
fs.writeFileSync(
  path.join(output, 'preview-metadata.json'),
  JSON.stringify(
    {
      source,
      scenes,
      interval,
      fixture:
        'demo data; playback paused; in-memory SecureStore adapter; isolated bundle identifier required',
      preparedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log('Prepared isolated UI preview: ' + output);
console.log(
  'Run expo export:embed in that directory. Install only with a distinct preview bundle identifier.',
);
