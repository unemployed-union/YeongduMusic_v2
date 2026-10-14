/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const notices = JSON.parse(read('assets/legal/notices.json'));
const audit = JSON.parse(read('assets/legal/audit.json'));
const sha = file => crypto.createHash('sha256').update(read(file)).digest('hex');
assert.equal(audit.packageLockSha256, sha('pnpm-lock.yaml'), 'Regenerate notices after lockfile changes');
assert.equal(audit.packageJsonSha256, sha('package.json'), 'Regenerate notices after dependency changes');
assert.equal(new Set(notices.entries.map(item => item.id)).size, notices.entries.length);
assert.deepEqual(notices.entries.map(({ id, name, version, license, platform }) => ({ id, name, version, license, platform })), audit.included);
for (const item of notices.entries) {
  assert(item.name && item.license && item.texts.length, 'Every listed work needs license text');
  assert(['all', 'ios', 'android'].includes(item.platform));
  for (const id of item.texts) {
    const text = notices.texts[id];
    assert(text && text.length > 80, item.name + ': missing full text');
    assert.equal(id, crypto.createHash('sha256').update(text).digest('hex').slice(0, 20));
  }
  assert(!/^(SQLite|Boost|SwiftDraw|eslint|typescript|expo-build-properties)$/.test(item.name), 'No binary notice obligation or build-only work');
}
for (const name of ['react', 'react-native', 'expo-audio', 'jsmediatags', '@tanstack/query-core', '@expo-google-fonts/material-symbols', 'Ionicons · 앱 아이콘 및 로고', 'com.squareup.okhttp3:okhttp', 'Public Suffix List (OkHttp)', 'GoogleSignIn', 'AppCheckCore']) {
  assert(notices.entries.some(item => item.name === name), 'Missing required work: ' + name);
}
assert(notices.entries.some(item => item.name.startsWith('Google Play services / ')), 'Retain SDK third-party OSS notices');
const ionicons = notices.entries.find(item => item.id === 'asset:ionicons');
assert(ionicons.texts.some(id => notices.texts[id].includes('Copyright (c) 2015-present Ionic')));
const mpl = notices.entries.find(item => item.id === 'resource:public-suffix-list');
assert(mpl.url.includes('publicsuffix.org') && mpl.texts.some(id => notices.texts[id].includes('Mozilla Public License')));
const settings = ts.createSourceFile('settings.tsx', read('src/app/settings.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const menuNodes = [];
function collectMenus(node) {
  if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
    const name = node.tagName.getText(settings);
    if (name === 'SettingsLink' || name === 'VersionSettings') {
      const attributes = Object.fromEntries(node.attributes.properties.filter(attribute => ts.isJsxAttribute(attribute) && attribute.initializer && ts.isStringLiteral(attribute.initializer))
        .map(attribute => [attribute.name.getText(settings), attribute.initializer.text]));
      menuNodes.push({ name, position: node.getStart(settings), attributes });
    }
  }
  ts.forEachChild(node, collectMenus);
}
collectMenus(settings);
const licenseMenus = menuNodes.filter(node => node.name === 'SettingsLink' && node.attributes.title === '오픈소스 라이선스');
const versionMenus = menuNodes.filter(node => node.name === 'VersionSettings');
assert.equal(licenseMenus.length, 1, 'Settings must expose one open-source license menu');
assert.equal(versionMenus.length, 1, 'Settings must expose one version row, regardless of its callback props');
assert.equal(licenseMenus[0].attributes.href, '/settings/licenses');
assert(licenseMenus[0].position < versionMenus[0].position, 'The license menu stays above the version row');
assert(read('src/app/_layout.tsx').includes('name="settings/licenses"'));
for (const name of ['assets/legal/notices.json', 'assets/legal/audit.json']) {
  assert(!/E:\\\\Project|C:\\\\Users|_sid=|EXPO_PUBLIC_NAS_EXTERNAL_URL/.test(read(name)), 'Do not ship local paths or credentials');
}
console.log(`PASS: ${notices.entries.length} notices with complete texts, unique IDs, copyright notices, platform scope, embedded SDK OSS, source retrieval information, menu route, and fresh dependency hashes.`);
