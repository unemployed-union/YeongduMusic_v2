/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const { create } = require(path.join(root, 'node_modules/zustand'));
function load(file, modules) {
  modules = { ...require('./test-cloud-fixtures.cjs').cloudFixtures({}, modules), ...modules };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => { if (name in modules) return modules[name]; throw Error('Unexpected ' + name); }, mod, mod.exports);
  return mod.exports;
}
const platform = { OS: 'android', Version: 37 };
let level = 1, result = { success: true }, calls = 0, options;
const auth = load('src/services/hidden-music/biometrics.ts', { 'react-native': { Platform: platform }, 'expo-local-authentication': {
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_STRONG: 3 },
  getEnrolledLevelAsync: async () => level,
  hasHardwareAsync: () => { throw Error('Must allow device password without biometrics'); },
  isEnrolledAsync: () => { throw Error('Must allow device password without fingerprint enrollment'); },
  authenticateAsync: async value => { calls++; options = value; return result; },
} });
const rules = load('src/features/hidden-music/rules.ts', {});
const saved = new Map();
const store = load('src/stores/hidden-music.ts', { zustand: { create }, '@/features/hidden-music/rules': rules, '@/services/hidden-music/biometrics': auth,
  '@/services/hidden-music/storage': { readHiddenProfile: async scope => saved.get(scope) ?? rules.emptyProfile(), writeHiddenProfile: async (scope, profile) => { saved.set(scope, profile); } },
}).useHiddenMusicStore;
async function main() {
  await auth.authenticateHiddenSettings();
  assert.equal(options.disableDeviceFallback, false); assert.equal(options.fallbackLabel, '기기 암호 사용'); assert.equal(options.biometricsSecurityLevel, 'strong');
  assert.equal(calls, 1, 'SECRET-only device can authenticate');
  level = 0; await assert.rejects(auth.authenticateHiddenSettings(), /화면 잠금/); assert.equal(calls, 1);
  level = 3; await auth.authenticateHiddenSettings();
  for (const version of [24, 28, 29, 30, 37]) { platform.Version = version; await auth.authenticateHiddenSettings(); assert.equal(options.biometricsSecurityLevel, version < 30 ? 'weak' : 'strong'); assert.equal(options.disableDeviceFallback, false); }
  platform.OS = 'ios'; platform.Version = '18.1'; await auth.authenticateHiddenSettings(); assert.equal(options.biometricsSecurityLevel, 'strong'); platform.OS = 'android'; platform.Version = 37;
  for (const error of ['user_cancel', 'app_cancel', 'system_cancel', 'lockout', 'not_available', 'not_enrolled', 'passcode_not_set', 'authentication_failed']) {
    result = { success: false, error }; await assert.rejects(auth.authenticateHiddenSettings());
  }
  await store.getState().load('account');
  result = { success: true }; level = 1;
  await store.getState().setBiometricLock(true);
  assert.equal(store.getState().profile.biometricLock, true); assert.equal(store.getState().unlocked, true);
  store.getState().lock(); result = { success: false, error: 'user_cancel' };
  await store.getState().unlock(); assert.equal(store.getState().unlocked, false);
  result = { success: true }; await store.getState().unlock(); assert.equal(store.getState().unlocked, true);
  store.getState().lock(); await assert.rejects(store.getState().setBiometricLock(false), /기기 암호/);
  await store.getState().unlock(); await store.getState().setBiometricLock(false); assert.equal(store.getState().profile.biometricLock, false);
  console.log('PASS: PIN/password-only enrollment, no-lock denial, strong biometric plus device fallback options, cancellation/failure/lockout errors, and actual hidden-settings store lock/unlock/disable flow. Native OS authentication is mocked.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
