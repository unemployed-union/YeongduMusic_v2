/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
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
assert(read('src/app/settings.tsx').indexOf('오픈소스 라이선스') < read('src/app/settings.tsx').lastIndexOf('<VersionSettings />'));
assert(read('src/app/_layout.tsx').includes('name="settings/licenses"'));
for (const name of ['assets/legal/notices.json', 'assets/legal/audit.json']) {
  assert(!/E:\\\\Project|C:\\\\Users|_sid=|EXPO_PUBLIC_NAS_EXTERNAL_URL/.test(read(name)), 'Do not ship local paths or credentials');
}
console.log(`PASS: ${notices.entries.length} notices with complete texts, unique IDs, copyright notices, platform scope, embedded SDK OSS, source retrieval information, menu route, and fresh dependency hashes.`);
