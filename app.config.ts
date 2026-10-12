import type { ConfigContext, ExpoConfig } from 'expo/config';
import buildVersion from './build-version.json';
// A=1, Z=26, AA=27. Read only: config evaluation must not increment a build.
function buildLetters(build: number): string {
  let result = '';
  for (let value = build; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + (value - 1) % 26) + result;
  return result;
}
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config, name: config.name ?? 'YeongduMusic', slug: config.slug ?? 'synology-music-client',
  extra: { ...config.extra, buildVersion: buildVersion.date + buildLetters(buildVersion.build) },
  // Android uses package name + signing certificate; this plugin adds the iOS URL scheme.
  plugins: [...(config.plugins ?? []), ...(GOOGLE_IOS_CLIENT_ID ? [[
    '@react-native-google-signin/google-signin',
    { iosUrlScheme: 'com.googleusercontent.apps.' + GOOGLE_IOS_CLIENT_ID.replace(/\.apps\.googleusercontent\.com$/, '') },
  ] as [string, Record<string, string>]] : [])],
});
