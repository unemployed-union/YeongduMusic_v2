/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const auth = { mode: 'setup', session: null }, drive = { account: null, songs: [] }, documents = { songs: [] }, s3 = { connection: null, songs: [] }, mybox = { connection: null, songs: [] };
const dependencies = {
  react: { useMemo: fn => fn() },
  '@/stores/auth': { useAuthStore: select => select(auth) },
  '@/stores/google-drive': { useGoogleDriveStore: select => select(drive) },
  '@/stores/drive-documents': { useDriveDocumentsStore: select => select(documents) },
  '@/stores/s3': { useS3Store: select => select(s3) },
  '@/stores/mybox': { useMyboxStore: select => select(mybox) },
};
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/features/library/use-music-sources.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleExports = {};
new Function('require', 'exports', code)(name => { assert(name in dependencies, name); return dependencies[name]; }, moduleExports);
const sources = moduleExports.useMusicSources;
assert.deepEqual(sources(), ['all', 'local'], 'No unconnected external services');
auth.mode = 'mock';
assert.deepEqual(sources(), ['all', 'local'], 'Demo data does not count as a connected NAS');
auth.mode = 'nas';
assert.deepEqual(sources(), ['all', 'local'], 'NAS requires a session');
auth.session = {};
drive.account = {};
s3.connection = {};
mybox.connection = {};
assert.deepEqual(sources(), ['all', 'nas', 'local', 'drive', 's3', 'mybox'], 'Connected sources remain selectable even with empty libraries');
s3.error = 'offline'; mybox.error = 'offline'; drive.error = 'offline';
assert.equal(sources().length, 6, 'A temporary network error does not remove a saved connection');
drive.account = null;
documents.songs = [{ id: 'drive:saf:file' }];
assert(sources().includes('drive'), 'SAF access works without an API account');
documents.songs = [];
documents.documents = [{ id: 'revoked' }];
drive.songs = [{ id: 'cached' }];
assert(!sources().includes('drive'), 'Revoked SAF files and stale API songs are not connections');
auth.mode = 'setup'; auth.session = null;
s3.connection = null; mybox.connection = null;
s3.songs = [{ id: 'cached' }]; mybox.songs = [{ id: 'cached' }];
assert.deepEqual(sources(), ['all', 'local'], 'Disconnected sources disappear without using cached song counts');
console.log('PASS: connected music sources, NAS session, empty libraries, network errors, SAF access, revoked grants and disconnects. Store subscriptions are mocked.');
