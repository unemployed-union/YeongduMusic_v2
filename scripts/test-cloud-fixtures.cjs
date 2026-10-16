/* Shared native-free dependencies for regressions without device connections. */
/* global __dirname */
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function read(file, globals, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', ...Object.keys(globals), code)(name => { if (name in dependencies) return dependencies[name]; throw Error('Unexpected shared dependency ' + name); }, exports, ...Object.values(globals));
  return exports;
}
exports.cloudFixtures = (globals = {}, dependencies = {}) => {
  const state = { ready: true, busy: false, loading: false, scanned: 0, connection: null, songs: [], error: null, generation: 0,
    bootstrap: async () => {}, refresh: async () => {}, cancel: () => {} };
  const useS3Store = select => select ? select(state) : state;
  useS3Store.getState = () => state; useS3Store.subscribe = () => () => {};
  const metadata = { ready: true, patches: {}, load: async () => {} };
  const useSongMetadataStore = select => select ? select(metadata) : metadata;
  useSongMetadataStore.getState = () => metadata; useSongMetadataStore.subscribe = () => () => {};
  const shared = { '@/stores/s3': { useS3Store }, ...dependencies };
  const appearanceRules = read('src/theme/appearance.ts', globals);
  const appearance = { preferences: { ...appearanceRules.DEFAULT_APPEARANCE }, ready: true, loading: false, saving: false, loadError: false, error: null,
    load: async () => {}, restore: async preferences => { appearance.preferences = appearanceRules.parseAppearance(preferences); } };
  const useAppearancePreferences = select => select ? select(appearance) : appearance;
  useAppearancePreferences.getState = () => appearance;
  const favorites = { songs: {}, ready: true, loading: false, loadError: false, error: null, load: async () => {}, setLiked: async () => {} };
  const useFavoritesStore = select => select ? select(favorites) : favorites;
  useFavoritesStore.getState = () => favorites;
  const blurRules = read('src/features/settings/blur-preferences.ts', globals);
  const blur = { ...blurRules.parseBlurPreferences(true), ready: true, loading: false, saving: false, loadError: false, error: null, load: async () => {},
    setEnabled: async enabled => { blur.enabled = enabled; }, restore: async preferences => Object.assign(blur, blurRules.parseBlurPreferences(preferences)) };
  const useBlurPreferences = select => select ? select(blur) : blur;
  useBlurPreferences.getState = () => blur;
  const artwork = { ready: true, patches: {}, baseUri: 'file:///artwork/', load: async () => {} };
  const theme = { mode: 'auto', ready: true, loading: false, saving: false, error: null, load: async () => {}, setMode: async mode => { theme.mode = mode; } };
  const useThemePreferences = select => select ? select(theme) : theme;
  useThemePreferences.getState = () => theme; useThemePreferences.subscribe = () => () => {};
  const themeRules = read('src/theme/mode.ts', globals);
  const detailRules = read('src/features/library/detail-preferences.ts', globals);
  const hapticRules = read('src/features/haptics/preferences.ts', globals);
  const favoriteDisplayRules = read('src/features/favorites/display-preferences.ts', globals);
  const favoriteDisplay = { preferences: { ...favoriteDisplayRules.DEFAULT_FAVORITE_DISPLAY }, ready: true, loading: false, saving: false, loadError: false, error: null,
    load: async () => {}, restore: async value => { favoriteDisplay.preferences = favoriteDisplayRules.parseFavoriteDisplay(value); } };
  const useFavoriteDisplayPreferences = select => select ? select(favoriteDisplay) : favoriteDisplay;
  useFavoriteDisplayPreferences.getState = () => favoriteDisplay;
  const details = { preferences: { ...detailRules.DEFAULT_DETAIL_PREFERENCES }, ready: true, loading: false, saving: false, loadError: false, error: null,
    load: async () => {}, restore: async value => { details.preferences = detailRules.parseDetailPreferences(value); } };
  const useLibraryDetailPreferences = select => select ? select(details) : details;
  useLibraryDetailPreferences.getState = () => details; useLibraryDetailPreferences.subscribe = () => () => {};
  const useSongArtworkStore = select => select ? select(artwork) : artwork;
  useSongArtworkStore.getState = () => artwork; useSongArtworkStore.subscribe = () => () => {};
  const artworkRules = read('src/features/artwork/rules.ts', globals, {
    '@/features/metadata/rules': read('src/features/metadata/rules.ts', globals), '@/features/library/album-library': read('src/features/library/album-library.ts', globals),
  });
  const resultHelpers = read('src/features/library/library-result.ts', globals);
  return {
    '@/features/playback/use-playback-visibility': { usePlaybackVisibility: () => true },
    './use-playback-visibility': { usePlaybackVisibility: () => true },
    '@/stores/appearance-preferences': { useAppearancePreferences }, '@/theme/appearance': appearanceRules, './appearance': appearanceRules,
    '@/theme/use-player-colors': { useMiniPlayerColors: () => dependencies['@/theme/tokens']?.useColors?.() ?? {}, usePlayerAccent: () => appearanceRules.playerAccent(null, ['#111111']) },
    '@/components/screen-blur-target': { ScreenBlurTargetContext: { Provider: 'ScreenBlurTargetProvider' } },
    '@/stores/favorites': { useFavoritesStore },
    '@/stores/blur-preferences': { useBlurPreferences, useBlurIntensity: area => blurRules.blurIntensity(blur, area) },
    '@/features/settings/blur-preferences': blurRules, './blur-preferences': blurRules,
    '@/features/settings/blur-settings': { BlurSettings: 'BlurSettings' },
    '@/stores/favorite-display-preferences': { useFavoriteDisplayPreferences }, '@/features/favorites/display-preferences': favoriteDisplayRules,
    '@/components/favorite-button': { FavoriteButton: 'FavoriteButton' }, './favorite-button': { FavoriteButton: 'FavoriteButton' },
    '@/features/favorites/liked-songs-screen': { LikedSongsScreen: 'LikedSongsScreen' },
    './prepare-album-colors': { prepareAlbumColors: async () => {} },
    '@/services/haptics': { playHaptic() {}, prepareHaptics() {} },
    '@/features/haptics/preferences': hapticRules,
    '@/components/text-input': { TextInput: dependencies['react-native']?.TextInput ?? 'TextInput' },
    '@/stores/song-metadata': { useSongMetadataStore },
    '@/stores/theme-preferences': { useThemePreferences }, '@/theme/mode': themeRules, './mode': themeRules,
    '@/stores/library-detail-preferences': { useLibraryDetailPreferences }, '@/features/library/detail-preferences': detailRules,
    '@/stores/song-artwork': { useSongArtworkStore }, '@/features/artwork/rules': artworkRules, '../artwork/rules': artworkRules,
    '@/features/metadata/rules': read('src/features/metadata/rules.ts', globals),
    '../metadata/rules': read('src/features/metadata/rules.ts', globals),
    // Older hook fixtures return Query options so they can exercise the real selector.
    // Preserve only those test options; normal Query snapshots use the real result adapter.
    './library-result': { libraryResult: (query, options) => {
      const result = resultHelpers.libraryResult(query, options);
      return 'queryKey' in query ? { ...query, ...result } : result;
    } },
    './sleep-timer': read('src/services/playback/sleep-timer.ts', globals),
    './section-repeat': read('src/services/playback/section-repeat.ts', globals),
    './playback-rate': read('src/services/playback/playback-rate.ts', globals),
    ...('expo-file-system/legacy' in dependencies ? { './file-copy': read('src/services/local-music/file-copy.ts', globals, dependencies) } : {}),
    ...('@/services/playback/persistence' in dependencies && 'react' in dependencies ? {
      '@/features/startup/use-app-bootstrap': read('src/features/startup/use-app-bootstrap.ts', globals, shared),
      '@/features/startup/use-playback-recovery': read('src/features/startup/use-playback-recovery.ts', globals, shared),
    } : {}),
    '@/services/music-source': read('src/services/music-source.ts', globals),
    '@/services/cloud-music/source': read('src/services/cloud-music/source.ts', globals, dependencies),
    '@/services/cloud-music/request': read('src/services/cloud-music/request.ts', globals),
    '@/stores/s3': { useS3Store, s3Source: async () => { throw Error('No S3 fixture connected'); } },
    './s3': { useS3Store },
  };
};
