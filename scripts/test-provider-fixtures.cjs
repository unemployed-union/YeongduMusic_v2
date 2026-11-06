/* Actual Provider adapters with explicit, disconnected native/account boundaries. */
const { loadSource } = require('./test-source-loader.cjs');

exports.providerFixtures = (dependencies = {}, globals = {}) => {
  const empty = [];
  const defaults = {
    ready: true,
    busy: false,
    loading: false,
    metadataLoading: false,
    error: null,
    generation: 0,
    songs: empty,
    files: empty,
    documents: empty,
    revision: 0,
    account: null,
    connection: null,
    session: null,
    mode: 'setup',
    bootstrap: async () => {},
    load: async () => {},
  };
  const boundaries = { ...dependencies };
  boundaries['react-native'] ??= { Platform: { OS: 'android' } };
  boundaries['@/stores/streaming-preferences'] ??= {
    useStreamingPreferences: { getState: () => ({ quality: 'original', load: async () => {} }) },
  };
  function store(moduleName, exportName) {
    const provided = dependencies[moduleName]?.[exportName];
    return {
      getState: () => {
        const state = provided?.getState
          ? provided.getState()
          : typeof provided === 'function'
            ? provided((value) => value)
            : {};
        return { ...defaults, ...state };
      },
      subscribe: (listener) => provided?.subscribe?.(listener) ?? (() => {}),
    };
  }
  for (const [name, exported] of Object.entries({
    auth: 'useAuthStore',
    'local-music': 'useLocalMusicStore',
    'google-drive': 'useGoogleDriveStore',
    'drive-documents': 'useDriveDocumentsStore',
    s3: 'useS3Store',
    mybox: 'useMyboxStore',
    jellyfin: 'useJellyfinStore',
  })) {
    const path = '@/stores/' + name;
    boundaries[path] = { ...dependencies[path], [exported]: store(path, exported) };
  }
  boundaries['@/stores/google-drive'].driveSource ??= (song, refresh) => {
    const cloud = dependencies['@/services/cloud-music/source'];
    const resolve = cloud?.resolveCloudPlaybackSource ?? cloud?.resolveCloudDownloadSource;
    return resolve?.(song, { refreshCredentials: refresh });
  };
  boundaries['@/stores/s3'].s3Source ??= (song) =>
    boundaries['@/stores/s3'].useS3Store.getState().source(song);
  boundaries['@/services/local-music/storage'] ??= {
    localSource: async (song) => ({ uri: 'file:///music/' + song.local.fileName }),
  };
  boundaries['@/services/jellyfin/playback'] = {
    jellyfinPlaybackSource: () => {
      throw new Error('No Jellyfin server in this legacy fixture');
    },
  };
  boundaries['@/services/jellyfin/library'] = {};
  boundaries['@/services/synology/api'] ??= loadSource(
    'src/services/synology/api.ts',
    boundaries,
    globals,
  );
  boundaries['@/features/library/mock-repository'] ??= dependencies['./mock-repository'] ?? {
    mockRepository: {},
  };
  boundaries['@/services/synology/cache'] ??= {
    cachePage: async () => {},
    cachedPage: async () => null,
  };
  boundaries['@/services/synology/repository'] =
    dependencies['@/features/library/repository'] ??
    dependencies['./repository'] ??
    loadSource('src/services/synology/repository.ts', boundaries, globals);
  const registry = loadSource('src/services/music-providers/registry.ts', boundaries, globals);
  return {
    '@/services/music-providers/registry': registry,
    './registry': registry,
    '@/services/synology/repository': boundaries['@/services/synology/repository'],
    '@/services/artwork/source': { resolveArtworkUri: async (uri) => uri },
    './source':
      dependencies['./source'] ??
      loadSource(
        'src/services/playback/source.ts',
        { ...boundaries, '@/services/music-providers/registry': registry },
        globals,
      ),
  };
};
