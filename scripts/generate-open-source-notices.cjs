/* global __dirname */
// Inputs are release source maps and notices extracted from releaseRuntimeClasspath.
// Run the export/dependency audit described in assets/legal/README.md first.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Buffer } = require('node:buffer');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.resolve(root, file), 'utf8').replace(/^\uFEFF/, '');
const json = file => JSON.parse(read(file));
const inventory = json('.expo/license-inventory.json');
const nativeNotices = json('.expo/native-notices.json');
const upstream = json('assets/legal/upstream.json');
const supplemental = new Map(upstream.map(item => [item.id, item]));
const texts = {}, entries = [], excluded = [];
function intern(text) {
  const value = text.replace(/\r\n/g, '\n').trim();
  if (!value) throw Error('Empty license');
  const id = crypto.createHash('sha256').update(value).digest('hex').slice(0, 20);
  texts[id] = value; return id;
}
function add({ id, name, version = '', license, platform = 'all', url = '', content }) {
  if (!content?.length || !license) throw Error('Incomplete notice: ' + name);
  entries.push({ id, name, version, license, platform, url, texts: [...new Set(content.map(intern))] });
}
const upstreamText = id => read(supplemental.get(id).file);
const apache = upstreamText('apache-2');
const project = json('package.json');
const sha = file => crypto.createHash('sha256').update(read(file).replace(/\r\n/g, '\n')).digest('hex');
if (inventory.packageLockSha256 !== sha('pnpm-lock.yaml') || inventory.packageJsonSha256 !== sha('package.json')) {
  throw Error('Dependency audit is stale. Repeat the release audit before generating notices.');
}
const packages = new Map(inventory.packages.map(pkg => [pkg.name + '@' + pkg.version, pkg]));
// Native modules are shipped by autolinking even when their JS is not imported.
for (const name of [...Object.keys(project.dependencies), 'expo-keep-awake']) {
  const dir = path.join(root, 'node_modules', name);
  if (!fs.existsSync(path.join(dir, 'package.json'))) throw Error('Missing installed package: ' + name);
  if (!fs.existsSync(path.join(dir, 'expo-module.config.json')) && !fs.existsSync(path.join(dir, 'react-native.config.js'))) continue;
  const pkg = json(path.join(dir, 'package.json'));
  packages.set(pkg.name + '@' + pkg.version, { ...pkg, dir, files: fs.readdirSync(dir).filter(file => /^(license|licence|notice|copying)([.-]|$)/i.test(file)) });
}
const npmFallback = { 'expo-router': 'expo', '@expo/ui': 'expo', 'standard-navigation': 'standard-navigation', '@react-native-community/slider': 'slider' };
for (const pkg of packages.values()) {
  const license = typeof pkg.license === 'object' ? pkg.license.type : pkg.license;
  if (/^(Unlicense|CC0-1.0|0BSD|Zlib|BSL-1.0)$/i.test(license)) { excluded.push({ name: pkg.name, license, reason: 'No binary attribution obligation' }); continue; }
  let content = pkg.files.filter(file => fs.statSync(path.join(pkg.dir, file)).isFile()).map(file => read(path.join(pkg.dir, file)));
  if (!content.length) {
    if (pkg.name.startsWith('@react-native/')) content = [read('node_modules/react-native/LICENSE')];
    else if (npmFallback[pkg.name]) content = [upstreamText(npmFallback[pkg.name])];
    else throw Error('No license text for ' + pkg.name);
  }
  const repo = json(path.join(pkg.dir, 'package.json')).repository;
  const url = (typeof repo === 'string' ? repo : repo?.url) ?? '';
  add({ id: 'npm:' + pkg.name + '@' + pkg.version, name: pkg.name, version: pkg.version, license,
    url: url.replace(/^git\+/, '').replace(/\.git$/, ''), content });
}
add({ id: 'asset:ionicons', name: 'Ionicons · 앱 아이콘 및 로고', license: 'MIT',
  url: 'https://github.com/ionic-team/ionicons', content: [read('assets/branding/LICENSE')] });
add({ id: 'vendor:vector-icons', name: 'react-native-vector-icons (Expo에 포함)', license: 'MIT',
  url: 'https://github.com/oblador/react-native-vector-icons', content: [read('node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/LICENSE')] });
add({ id: 'vendor:react-navigation', name: 'React Navigation (Expo Router에 포함)', license: 'MIT',
  url: 'https://github.com/react-navigation/react-navigation', content: [upstreamText('react-navigation')] });

for (const native of inventory.natives) {
  const archive = nativeNotices.find(item => item.name === native.name && item.version === native.version);
  const notices = archive?.notices ?? [];
  if (native.name.startsWith('com.google.android.gms:')) {
    // The SDK is proprietary; its embedded open-source notices are separate works.
    const index = notices.find(item => item.file.endsWith('third_party_licenses.json'));
    const blob = notices.find(item => item.file.endsWith('third_party_licenses.txt'));
    if (!index || !blob) throw Error('Missing Google third-party notices: ' + native.name);
    const bytes = Buffer.from(blob.text, 'utf8');
    for (const [name, span] of Object.entries(JSON.parse(index.text))) {
      const content = bytes.subarray(span.start, span.start + span.length).toString('utf8');
      if (/Boost Software License|CC0 1\.0|This is free and unencumbered software/i.test(content)
        && !/Apache License|Permission is hereby granted|Redistribution and use/i.test(content)) {
        excluded.push({ name: 'Google Play services / ' + name, reason: 'No binary attribution obligation' }); continue;
      }
      const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 20);
      const id = 'google-third-party:' + name + ':' + hash;
      if (entries.some(item => item.id === id)) continue;
      const license = /Apache License/.test(content) ? 'Apache-2.0 및 원문에 기재된 조건'
        : /The MIT License|Permission is hereby granted/.test(content) ? 'MIT 및 원문에 기재된 조건'
          : /Redistribution/.test(content) ? 'BSD 및 원문에 기재된 조건' : '원문 참조';
      add({ id, name: 'Google Play services / ' + name, license, platform: 'android', content: [content] });
    }
    excluded.push({ name: native.name, reason: 'Proprietary SDK; embedded OSS notices included separately' }); continue;
  }
  if (native.name === 'com.google.guava:listenablefuture' && native.version.startsWith('9999.0-empty')) {
    excluded.push({ name: native.name, reason: 'Empty conflict-avoidance artifact' }); continue;
  }
  const mit = native.name.startsWith('com.facebook.fresco:') ? 'fresco'
    : native.name.startsWith('com.facebook.infer.') ? 'infer'
      : native.name.startsWith('com.facebook.yoga:') ? 'yoga'
        : native.name.startsWith('com.facebook.hermes:') ? 'hermes'
          : native.name.startsWith('com.parse.bolts:') ? 'bolts'
            : native.name.startsWith('io.github.lukmccall.pika:') ? 'pika'
              : native.name === 'org.brotli:dec' ? 'brotli' : null;
  const content = notices.filter(item => !item.file.endsWith('.json')).map(item => item.text);
  let license;
  if (native.name.startsWith('com.facebook.react:')) { license = 'MIT'; content.push(read('node_modules/react-native/LICENSE')); }
  else if (mit) { license = supplemental.get(mit).license; content.push(upstreamText(mit)); }
  else if (/apache/i.test(native.license ?? '') || /^(com.google.(guava|code.gson):|commons-)/.test(native.name)) {
    license = 'Apache-2.0'; content.push(apache);
  } else throw Error('Unreviewed native license: ' + native.name + ' ' + native.license);
  add({ id: 'maven:' + native.name + '@' + native.version, name: native.name, version: native.version, license, platform: 'android',
    url: native.name.startsWith('com.squareup.okhttp3:') ? 'https://github.com/square/okhttp' : '', content });
}
const supplementalEntries = ['hermes', 'double-conversion', 'glog', 'fmt', 'fast-float', 'folly', 'llvh', 'llvh-support', 'hermes-regex', 'icu',
  'google-signin', 'appauth', 'gtmappauth', 'gtmsessionfetcher', 'appcheck', 'google-utilities', 'promises'];
for (const id of supplementalEntries) {
  const item = supplemental.get(id);
  add({ ...item, id: 'native-source:' + id, platform: ['google-signin', 'appauth', 'gtmappauth', 'gtmsessionfetcher', 'appcheck', 'google-utilities', 'promises'].includes(id) ? 'ios' : 'all',
    content: id === 'llvh-support' ? [read(item.file), upstreamText('llvh')] : [read(item.file)] });
}
// The OkHttp public-suffix resource retains its MPL notice. Publish the license
// and source location alongside the notice so users can obtain the covered data.
add({ id: 'resource:public-suffix-list', name: 'Public Suffix List (OkHttp)', license: 'MPL-2.0', platform: 'android',
  url: 'https://publicsuffix.org/list/public_suffix_list.dat', content: [upstreamText('mpl-2'), 'Source: https://github.com/square/okhttp/tree/parent-4.12.0/okhttp/src/main/resources/okhttp3/internal/publicsuffix\nThe covered public suffix data is used without modifications.'] });
excluded.push({ name: 'Boost', license: 'BSL-1.0', reason: 'Compiled binary exception' }, { name: 'SQLite', license: 'Public domain', reason: 'No notice obligation' }, { name: 'SwiftDraw', license: 'Zlib', reason: 'No binary notice obligation; source is not distributed' });
entries.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
fs.writeFileSync(path.join(root, 'assets/legal/notices.json'), JSON.stringify({ entries, texts }, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'assets/legal/audit.json'), JSON.stringify({
  packageLockSha256: sha('pnpm-lock.yaml'),
  packageJsonSha256: sha('package.json'),
  nativeCoordinates: inventory.natives.map(item => item.name + ':' + item.version).sort(),
  included: entries.map(({ id, name, version, license, platform }) => ({ id, name, version, license, platform })), excluded,
}, null, 2) + '\n');
console.log(`Generated ${entries.length} notices, ${Object.keys(texts).length} unique texts (${fs.statSync(path.join(root, 'assets/legal/notices.json')).size} bytes).`);
