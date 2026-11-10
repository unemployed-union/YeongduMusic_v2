import { useLocalMusicStore } from '@/stores/local-music';
import { useGoogleDriveStore, driveSource } from '@/stores/google-drive';
import { useDriveDocumentsStore } from '@/stores/drive-documents';
import { useS3Store, s3Source } from '@/stores/s3';
import { useMyboxStore } from '@/stores/mybox';
import { localSource } from '@/services/local-music/storage';
import type { Song } from '@/types/music';
import { memoSnapshot, storedPage, type MusicProvider } from './contracts';
import { findStoredSong } from './stored-song-index';
import { reuseLibraryItems } from './library-policy';

export const localProvider: MusicProvider = {
  id: 'local',
  name: '이 기기 음악',
  catalog: 'stored',
  getState: memoSnapshot(() => {
    const state = useLocalMusicStore.getState();
    return {
      ready: state.ready,
      connected: true,
      scope: 'device',
      generation: 0,
      songs: state.songs,
      loading: state.busy,
      error: state.error,
    };
  }),
  subscribe: (listener) => useLocalMusicStore.subscribe(listener),
  bootstrap: () => useLocalMusicStore.getState().load(),
  songs: async (page) => storedPage(useLocalMusicStore.getState().songs, page),
  refresh: () => useLocalMusicStore.getState().load(),
  streamSource: (song) => localSource(song),
  entityRef: (song) => ({ providerId: 'local', accountScope: 'device', remoteId: song.id }),
  restore: (song) =>
    findStoredSong(useLocalMusicStore.getState().songs, song.id) ?? null,
  fileWrite: {
    description:
      '앱에 보관된 음악 복사본의 태그를 변경합니다. 가져온 원본 파일은 변경하지 않습니다.',
  },
};

let driveItems: readonly Song[] | undefined;
let documentItems: readonly Song[] | undefined;
let combinedDrive: Song[] = [];
export const driveProvider: MusicProvider = {
  id: 'drive',
  name: 'Google Drive',
  catalog: 'stored',
  playbackRecovery: 'reload',
  getState: memoSnapshot(() => {
    const state = useGoogleDriveStore.getState();
    const documents = useDriveDocumentsStore.getState();
    if (driveItems !== state.songs || documentItems !== documents.songs) {
      driveItems = state.songs;
      documentItems = documents.songs;
      combinedDrive = documents.songs.length ? [...state.songs, ...documents.songs] : state.songs;
    }
    return {
      ready: state.ready && documents.ready,
      connected: !!state.account || documents.songs.length > 0,
      scope: state.account?.id ?? 'documents',
      generation: state.generation,
      selection: state.files,
      documentsRevision: documents.revision,
      songs: combinedDrive,
      loading: state.loading || state.metadataLoading,
      stale: state.stale,
      validatedAt: state.validatedAt,
      error: [state.error, documents.error].filter(Boolean).join('\n') || null,
    };
  }),
  subscribe: (listener) => {
    const stops = [
      useGoogleDriveStore.subscribe(listener),
      useDriveDocumentsStore.subscribe(listener),
    ];
    return () => stops.forEach((stop) => stop());
  },
  songs: async (page) => storedPage(driveProvider.getState().songs, page),
  cancelLibrary: () => useGoogleDriveStore.getState().cancelLibrary(),
  bootstrap: async () => {
    await Promise.all([
      useGoogleDriveStore.getState().bootstrap(),
      useDriveDocumentsStore.getState().load(),
    ]);
  },
  refresh: async (signal) => {
    await useDriveDocumentsStore.getState().load();
    if (useGoogleDriveStore.getState().account) {
      await useGoogleDriveStore.getState().refresh(signal);
    }
  },
  cache: {
    fail: (error) => useGoogleDriveStore.setState({ error, stale: true }),
    restore: (songs, stale) => {
      const state = useGoogleDriveStore.getState();
      const selected = new Set(state.files.map((file) => file.id));
      const valid = songs.filter((song) => song.source === 'drive' &&
        song.drive.accountId === state.account?.id && selected.has(song.drive.fileId));
      useGoogleDriveStore.setState({ songs: reuseLibraryItems(state.songs, valid), stale });
    },
    metadata: () => {
      const state = useGoogleDriveStore.getState();
      return { cursor: state.syncCursor, changesDisabled: state.changesDisabled, pendingIds: state.pendingMetadataIds };
    },
    restoreMetadata: (metadata) => useGoogleDriveStore.setState({
      syncCursor: metadata?.cursor,
      changesDisabled: metadata?.changesDisabled ?? false,
      pendingMetadataIds: metadata?.pendingIds ?? [],
    }),
  },
  sync: { revalidate: ({ signal }) => useGoogleDriveStore.getState().revalidate(signal) },
  streamSource: (song, options) => driveSource(song, options?.refreshCredentials),
  entityRef: (song) => {
    if (song.source !== 'drive') {
      throw new Error('Google Drive 곡이 아닙니다.');
    }
    return { providerId: 'drive', accountScope: song.drive.accountId, remoteId: song.drive.fileId };
  },
  restore: (song) => {
    if (song.source !== 'drive') {
      return null;
    }
    const state = useGoogleDriveStore.getState();
    const current = findStoredSong(driveProvider.getState().songs, song.id);
    if (song.drive.documentUri) {
      return current?.source === 'drive' && current.drive.documentUri === song.drive.documentUri
        ? current
        : null;
    }
    return state.account?.id === song.drive.accountId &&
      state.files.some((file) => file.id === song.drive.fileId)
      ? { ...song, artworkUrl: current?.artworkUrl, palette: current?.palette ?? song.palette }
      : null;
  },
  download: { source: (song, options) => driveSource(song, options?.refreshCredentials) },
};

export const s3Provider: MusicProvider = {
  id: 's3',
  name: 'S3',
  catalog: 'stored',
  playbackRecovery: 'reload',
  getState: memoSnapshot(() => {
    const state = useS3Store.getState();
    return {
      ready: state.ready,
      connected: !!state.connection,
      scope: state.connection?.id ?? '',
      generation: state.generation,
      selection: state.connection,
      songs: state.songs,
      loading: state.loading,
      stale: state.stale,
      validatedAt: state.validatedAt,
      error: state.error,
    };
  }),
  subscribe: (listener) => useS3Store.subscribe(listener),
  bootstrap: () => useS3Store.getState().bootstrap(),
  songs: async (page) => storedPage(useS3Store.getState().songs, page),
  cancelLibrary: () => useS3Store.getState().cancelLibrary(),
  cache: { restore: (songs, stale) => {
    const connection = useS3Store.getState().connection;
    const valid = songs.filter((song) => song.source === 's3' &&
      song.s3.connectionId === connection?.id && song.s3.key.startsWith(connection.prefix));
    useS3Store.setState({ songs: reuseLibraryItems(useS3Store.getState().songs, valid), stale });
  }, fail: (error) => useS3Store.setState({ error, stale: true }) },
  refresh: () => useS3Store.getState().refresh(),
  streamSource: (song) => s3Source(song),
  entityRef: (song) => {
    if (song.source !== 's3') {
      throw new Error('S3 곡이 아닙니다.');
    }
    return { providerId: 's3', accountScope: song.s3.connectionId, remoteId: song.s3.key };
  },
  restore: (song) => {
    const connection = useS3Store.getState().connection;
    if (
      song.source !== 's3' ||
      connection?.id !== song.s3.connectionId ||
      !song.s3.key.startsWith(connection.prefix)
    ) {
      return null;
    }
    const current = findStoredSong(useS3Store.getState().songs, song.id);
    return { ...song, artworkUrl: current?.artworkUrl, palette: current?.palette ?? song.palette };
  },
  download: { source: (song) => s3Source(song) },
  fileWrite: {
    description: 'S3 원본 객체의 태그도 변경합니다. GetObject·PutObject 권한이 필요합니다.',
  },
};

export const myboxProvider: MusicProvider = {
  id: 'mybox',
  name: '네이버 MYBOX',
  catalog: 'stored',
  playbackRecovery: 'reload',
  getState: memoSnapshot(() => {
    const state = useMyboxStore.getState();
    return {
      ready: state.ready,
      connected: !!state.connection,
      scope: state.connection?.id ?? '',
      generation: state.generation,
      selection: state.connection,
      songs: state.songs,
      loading: state.loading || state.busy,
      stale: state.stale,
      validatedAt: state.validatedAt,
      error: state.error,
    };
  }),
  subscribe: (listener) => useMyboxStore.subscribe(listener),
  bootstrap: () => useMyboxStore.getState().bootstrap(),
  songs: async (page) => storedPage(useMyboxStore.getState().songs, page),
  cancelLibrary: () => useMyboxStore.getState().cancelLibrary(),
  cache: { restore: (songs, stale) => {
    const connection = useMyboxStore.getState().connection;
    const valid = songs.filter((song) => song.source === 'mybox' &&
      song.mybox.connectionId === connection?.id && !!song.path?.startsWith(connection.folder));
    useMyboxStore.setState({ songs: reuseLibraryItems(useMyboxStore.getState().songs, valid), stale });
  }, fail: (error) => useMyboxStore.setState({ error, stale: true }) },
  refresh: () => useMyboxStore.getState().refresh(),
  streamSource: (song, options) => useMyboxStore.getState().playbackSource(song, options?.signal),
  entityRef: (song) => {
    if (song.source !== 'mybox') {
      throw new Error('MYBOX 곡이 아닙니다.');
    }
    return {
      providerId: 'mybox',
      accountScope: song.mybox.connectionId,
      remoteId: song.mybox.fileId,
    };
  },
  restore: (song) => {
    const connection = useMyboxStore.getState().connection;
    if (
      song.source !== 'mybox' ||
      connection?.id !== song.mybox.connectionId ||
      !song.path?.startsWith(connection.folder)
    ) {
      return null;
    }
    const current = findStoredSong(useMyboxStore.getState().songs, song.id);
    return current ?? { ...song, artworkUrl: undefined };
  },
  download: { source: (song, options) => useMyboxStore.getState().source(song, options?.signal) },
};
