const assert = require('node:assert/strict');
const { loadSource } = require('./test-source-loader.cjs');

async function main() {
  const calls = [];
  const signal = new AbortController().signal;
  const cloud = loadSource('src/services/cloud-music/source.ts', {
    '@/stores/google-drive': {
      driveSource: async (song, refresh) => {
        calls.push(['drive', song.id, refresh]);
        return { uri: 'https://drive.invalid/audio', headers: { Authorization: 'Bearer fixture' } };
      },
    },
    '@/stores/s3': { s3Source: async (song) => ({ uri: 'https://s3.invalid/' + song.id }) },
    '@/stores/mybox': {
      useMyboxStore: {
        getState: () => ({
          source: async (song, requestSignal) => {
            calls.push(['download', song.id, requestSignal]);
            return { uri: 'https://mybox.invalid/download' };
          },
          playbackSource: async (song, requestSignal) => {
            calls.push(['playback', song.id, requestSignal]);
            return { uri: 'file:///mybox-cache/audio' };
          },
        }),
      },
    },
  });
  const drive = { id: 'drive-track', source: 'drive' };
  const mybox = { id: 'mybox-track', source: 'mybox' };
  const options = { signal, refreshCredentials: true };
  assert.equal(
    (await cloud.resolveCloudPlaybackSource(drive, options)).headers.Authorization,
    'Bearer fixture',
  );
  assert.deepEqual(calls.pop(), ['drive', drive.id, true]);
  assert.equal(
    (await cloud.resolveCloudPlaybackSource(mybox, options)).uri,
    'file:///mybox-cache/audio',
  );
  assert.deepEqual(calls.pop(), ['playback', mybox.id, signal]);
  assert.equal(
    (await cloud.resolveCloudDownloadSource(mybox, options)).uri,
    'https://mybox.invalid/download',
  );
  assert.deepEqual(calls.pop(), ['download', mybox.id, signal]);
  await cloud.cloudStreamSource(mybox, false, { signal, download: true });
  assert.deepEqual(
    calls.pop(),
    ['download', mybox.id, signal],
    'Legacy entry point keeps download semantics',
  );
  assert.equal(
    (await cloud.resolveCloudPlaybackSource({ id: 's3-track', source: 's3' })).uri,
    'https://s3.invalid/s3-track',
  );

  const failure = new Error('provider failure');
  const sources = loadSource('src/services/playback/source.ts', {
    '@/services/cloud-music/source': cloud,
    '@/services/local-music/storage': { localSource: async () => ({ uri: 'file:///local/audio' }) },
    '@/features/library/repository': {
      musicRepository: () => ({
        streamSource: async (song) => {
          if (song.id === 'failed') throw failure;
          return song.id === 'demo' ? { assetId: 42 } : { uri: 'https://nas.invalid/audio' };
        },
      }),
    },
  });
  assert.deepEqual(await sources.resolvePlaybackSource({ source: 'local' }), {
    uri: 'file:///local/audio',
  });
  assert.deepEqual(await sources.resolvePlaybackSource({ id: 'demo' }), { assetId: 42 });
  assert.deepEqual(await sources.resolvePlaybackSource({ source: 'nas' }), {
    uri: 'https://nas.invalid/audio',
  });
  assert.deepEqual(await sources.resolvePlaybackSource({ id: 'legacy-nas' }), {
    uri: 'https://nas.invalid/audio',
  });
  await assert.rejects(
    sources.resolvePlaybackSource({ id: 'failed' }),
    (error) => error === failure,
  );
  console.log(
    'PASS: source dispatch, legacy NAS/demo/local playback, cloud credentials, MYBOX playback/download separation, signal forwarding and original error identity. Native/network boundaries are mocked.',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
