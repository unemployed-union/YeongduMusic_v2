/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), digest = 'a'.repeat(32);
const files = new Map(), copies = [], removed = [];
let corruptCopy = false;
const native = {
  getInfoAsync: async uri => files.get(uri) ?? { exists: false },
  copyAsync: async ({ from, to }) => { copies.push(to); files.set(to, { ...files.get(from), md5: corruptCopy ? 'b'.repeat(32) : files.get(from).md5 }); },
  deleteAsync: async uri => { removed.push(uri); files.delete(uri); },
};
const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/services/local-music/file-copy.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const helpers = {};
new Function('require', 'exports', code)(name => { assert.equal(name, 'expo-file-system/legacy'); return native; }, helpers);
async function main() {
  files.set('source', { exists: true, isDirectory: false, size: 12, md5: digest.toUpperCase() });
  const fingerprint = await helpers.fingerprintFile('source', 'unreadable');
  assert.deepEqual(fingerprint, { size: 12, digest, id: 'local:' + digest + ':12' });
  files.set('source', { ...files.get('source'), md5: digest });
  for (const info of [{ exists: false }, { exists: true, isDirectory: true }, { exists: true, size: 0, md5: digest }, { exists: true, size: 12, md5: 'invalid' }]) {
    files.set('bad', info); await assert.rejects(helpers.fingerprintFile('bad', 'unreadable'), /unreadable/);
  }
  const options = to => ({ from: 'source', to, fingerprint, message: 'copy verification failed' });
  let published = 0;
  assert.equal(await helpers.withVerifiedCopy(options('good'), async () => { published++; return 'saved'; }), 'saved');
  const count = copies.length;
  await helpers.withVerifiedCopy(options('good'), async () => {});
  assert.equal(copies.length, count, 'Imports reuse a matching existing copy after verification');
  await helpers.withVerifiedCopy({ ...options('good'), overwrite: true }, async () => {});
  assert.equal(copies.length, count + 1, 'Downloads retain their overwrite policy');
  corruptCopy = true;
  await assert.rejects(helpers.withVerifiedCopy(options('corrupt'), async () => { published++; }), /verification/);
  assert.equal(published, 1); assert.ok(removed.includes('corrupt')); corruptCopy = false;
  await assert.rejects(helpers.withVerifiedCopy(options('unpublished'), async () => { throw Error('DB failure'); }), /DB failure/);
  assert.ok(removed.includes('unpublished'));
  await assert.rejects(helpers.withVerifiedCopy(options('good'), async () => { throw Error('DB failure'); }), /DB failure/);
  assert.ok(files.has('good')); assert.ok(!removed.includes('good'), 'Rollback never removes a pre-existing app copy');
  let checks = 0;
  await assert.rejects(helpers.withVerifiedCopy({ ...options('cancelled'), check: () => { if (++checks === 2) throw Error('cancelled'); } }, async () => { published++; }), /cancelled/);
  assert.ok(removed.includes('cancelled')); assert.equal(published, 1);
  assert.ok(files.has('source')); assert.ok(!removed.includes('source'));
  console.log('PASS: file fingerprints, invalid input, copy policies, hash verification, metadata/cancellation rollback and preservation of originals/existing copies.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
