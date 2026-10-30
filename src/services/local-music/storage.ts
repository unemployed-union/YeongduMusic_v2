import { writtenSongChanges } from '@/services/metadata/written-song';
import { createSerialQueue } from '@/services/async/serial-queue';
import { isAudioFile } from '@/services/music-source';
import { openLocalDatabase, saveLocalSong } from './database';
import { localMusicDirectory, localSource } from './files';
import { recoverLocalMetadata } from './metadata-recovery';
import type { ImportAsset, ImportKind, ImportResult } from './import-types';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import type { Song, SongMetadata } from '@/types/music';
import { useFolderExclusionStore } from '@/stores/folder-exclusions';
import { folderExcluded, localFolderKey } from './folders';
import { fingerprintFile, withVerifiedCopy } from './file-copy';

export type { ImportAsset, ImportKind, ImportResult } from './import-types';
export { localSource } from './files';
export { isAudioFile } from '@/services/music-source';

let stagingSequence = 0;
const mutationQueue = createSerialQueue();
export async function readLocalSongs(): Promise<Song[]> {
  if (Platform.OS === 'web') {
    return [];
  }
  const db = await openLocalDatabase();
  const rows = await db.getAllAsync<{ value: string }>(
    'SELECT value FROM local_tracks ORDER BY rowid',
  );
  return Promise.all(
    rows.map(async (row) => {
      const song = JSON.parse(row.value) as Song;
      if (
        !song ||
        song.source !== 'local' ||
        typeof song.title !== 'string' ||
        typeof song.artist !== 'string' ||
        typeof song.album !== 'string' ||
        !Number.isFinite(song.duration) ||
        song.duration < 0 ||
        !Number.isFinite(song.local?.size) ||
        song.local.size <= 0 ||
        !/^local:[a-f0-9]{32}:\d+$/.test(song.id) ||
        !/^[a-f0-9]{32}-\d+\.(mp3|m4a|flac|wav|aac|aiff|aif|ogg|opus|alac)$/.test(
          song.local?.fileName ?? '',
        )
      ) {
        throw new Error('저장된 로컬 음악 목록 형식을 확인할 수 없습니다.');
      }
      if (
        song.local.originalFolders !== undefined &&
        (!Array.isArray(song.local.originalFolders) ||
          song.local.originalFolders.some(
            (folder) => typeof folder !== 'string' || !folder || localFolderKey(folder) !== folder,
          ))
      ) {
        throw new Error('저장된 원본 폴더 정보를 확인할 수 없습니다.');
      }
      const recovered = await recoverLocalMetadata(song);
      return { ...recovered, albumSource: recovered.albumSource ?? 'fallback' };
    }),
  );
}
export function replaceLocalMetadataFile(
  id: string,
  input: string,
  fields: SongMetadata | undefined,
  check: () => void,
  artworkUrl?: string,
): Promise<Song> {
  return mutationQueue.run(async () => {
    check();
    const before = (await readLocalSongs()).find((song) => song.id === id);
    if (!before || before.source !== 'local') {
      throw new Error('앱에 보관된 음악 파일을 찾을 수 없습니다.');
    }
    const { uri } = await localSource(before);

    const fingerprint = await fingerprintFile(input, '수정한 음악 파일을 읽지 못했습니다.');
    const after: Song = {
      ...before,
      ...writtenSongChanges(fields, artworkUrl),
      local: { ...before.local, size: fingerprint.size },
    };
    // Keep the song ID and filename stable for playlists and the native player.
    const staged = uri + '.metadata-new';

    const backup = uri + '.metadata-backup';

    const journal = uri + '.metadata-journal';
    await withVerifiedCopy(
      {
        from: input,
        to: staged,
        fingerprint,
        overwrite: true,
        check,
        message: '수정한 음악 파일을 임시 저장하지 못했습니다.',
      },
      async () => {},
    );
    check();
    await FileSystem.writeAsStringAsync(
      journal,
      JSON.stringify({ before, after, digest: fingerprint.digest }),
    );
    try {
      await FileSystem.moveAsync({ from: uri, to: backup });
      await FileSystem.moveAsync({ from: staged, to: uri });
      await saveLocalSong(after);
    } catch (cause) {
      const latest = await (
        await openLocalDatabase()
      ).getFirstAsync<{ value: string }>('SELECT value FROM local_tracks WHERE id = ?', id);
      try {
        await recoverLocalMetadata(latest ? (JSON.parse(latest.value) as Song) : before);
      } catch {
        throw new Error(
          '파일 저장 복구를 완료하지 못했습니다. 원본 백업을 유지했습니다. 앱을 다시 열어 주세요.',
        );
      }
      throw cause;
    }
    // A committed journal can be cleaned at the next load if cleanup itself fails.
    await recoverLocalMetadata(JSON.parse(JSON.stringify(after)) as Song).catch(() => {});
    return after;
  });
}
export async function saveLocalDuration(id: string, duration: number): Promise<void> {
  return mutationQueue.run(() => recordLocalDuration(id, duration));
}
async function recordLocalDuration(id: string, duration: number): Promise<void> {
  if (!Number.isFinite(duration) || duration <= 0) {
    return;
  }
  const db = await openLocalDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM local_tracks WHERE id = ?',
    id,
  );
  if (!row) {
    return;
  }
  const song = JSON.parse(row.value) as Song;
  if (song.source === 'local' && Math.abs(song.duration - duration) > 0.5) {
    await saveLocalSong({ ...song, duration });
  }
}
// Downloads and deletions use the same serialization as device imports.
export function storeDownloadedSong(
  original: Song,
  uri: string,
  extension: string,
  mimeType: string,
  signal?: AbortSignal,
  onCommit?: () => void,
): Promise<{ song: Song; duplicate: boolean }> {
  return mutationQueue.run(async () => {
    const check = () => {
      if (signal?.aborted) {
        throw new Error('음악 보관을 취소했습니다.');
      }
    };
    check();
    if (original.source === 'local' || !isAudioFile('file.' + extension)) {
      throw new Error('보관할 음악 정보가 올바르지 않습니다.');
    }
    const info = await fingerprintFile(uri, '내려받은 음악 파일을 확인할 수 없습니다.');
    const { digest, id } = info;
    const previous = (await readLocalSongs()).find((song) => song.id === id);
    check();
    if (previous) {
      try {
        await localSource(previous);
        return { song: previous, duplicate: true };
      } catch {
        /* Repair a missing copy below. */
      }
    }
    const fileName =
      previous?.source === 'local'
        ? previous.local.fileName
        : digest + '-' + info.size + '.' + extension;
    const folder = localMusicDirectory();

    const destination = folder + fileName;
    await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
    return withVerifiedCopy(
      {
        from: uri,
        to: destination,
        fingerprint: info,
        overwrite: true,
        check,
        message: '음악 저장을 완료하지 못했습니다. 저장 공간을 확인해 주세요.',
      },
      async () => {
        // Explicit fields only: never persist source URLs, tokens, account IDs or NAS paths.
        let downloadedFrom: 'nas' | 'drive' | 's3' | 'mybox' = 'nas';
        if (!previous) {
          if (original.source === 'mybox') {
            downloadedFrom = 'mybox';
          } else if (original.source === 's3') {
            downloadedFrom = 's3';
          } else if (original.source === 'drive') {
            downloadedFrom = 'drive';
          } else {
            downloadedFrom = 'nas';
          }
        }
        const song: Song = previous ?? {
          id,
          source: 'local',
          title: original.title,
          artist: original.artist,
          album: original.album,
          albumSource: original.albumSource ?? 'fallback',
          albumArtist: original.albumArtist,
          discNumber: original.discNumber,
          year: original.year,
          duration: original.duration,
          trackNumber: original.trackNumber,
          palette: original.palette,
          audioCodec: original.audioCodec,
          lossless: original.lossless,
          local: {
            fileName,
            originalName: original.title + '.' + extension,
            size: info.size,
            mimeType,
            downloadedFrom: downloadedFrom,
          },
        };
        // Cancellation remains available through copy/verification, until publication begins.
        check();
        onCommit?.();
        await saveLocalSong(song);
        return { song, duplicate: false };
      },
    );
  });
}
export function deleteLocalSong(id: string): Promise<void> {
  return mutationQueue.run(async () => {
    const song = (await readLocalSongs()).find((song) => song.id === id);
    if (!song || song.source !== 'local') {
      throw new Error('저장된 음악을 찾을 수 없습니다.');
    }
    // Filename validation in readLocalSongs keeps deletion within the app-owned localMusicDirectory.
    await FileSystem.deleteAsync(localMusicDirectory() + song.local.fileName, { idempotent: true });
    await (await openLocalDatabase()).runAsync('DELETE FROM local_tracks WHERE id = ?', id);
  });
}
// Serialize imports: duplicate checks and file/DB publication cannot race.
export function importLocalSongs(
  kind: ImportKind = 'files',
  onProgress?: (processed: number) => void,
): Promise<ImportResult> {
  return mutationQueue.run(async () => {
    const folder = localMusicDirectory();
    await useFolderExclusionStore.getState().load();
    const exclusions = useFolderExclusionStore.getState();
    if (!exclusions.ready) {
      throw new Error(exclusions.error ?? '제외 폴더 설정을 불러오지 못했습니다.');
    }
    const result: ImportResult = { added: 0, duplicates: 0, failures: [], excluded: 0 };
    let assets: AsyncIterable<ImportAsset> | ImportAsset[] | null;
    if (kind === 'files') {
      const selection = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'application/ogg'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (selection.canceled) {
        return { ...result, cancelled: true };
      }
      assets = selection.assets.map((asset) => ({ ...asset, temporary: true }));
    } else {
      const scanner = await import('./scan');
      assets =
        kind === 'device'
          ? scanner.deviceAssets(result.failures)
          : await scanner.folderAssets(result.failures);
      if (!assets) {
        return { ...result, cancelled: true };
      }
    }
    await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
    const known = new Map((await readLocalSongs()).map((song) => [song.id, song]));
    // Old records lack folder metadata. Hash matching names once to associate the exact content, never infer from a name alone.
    const legacyNames = new Set(
      [...known.values()]
        .filter((song) => song.source === 'local' && !song.local.originalFolders?.length)
        .map((song) => (song.source === 'local' ? song.local.originalName : '')),
    );
    let processed = 0;
    try {
      for await (const asset of assets) {
        let temporaryUri: string | null = asset.temporary ? asset.uri : null;
        let inputUri = asset.uri;
        try {
          const originFolder = asset.originFolder ? localFolderKey(asset.originFolder) : undefined;
          if (!originFolder && kind !== 'files' && exclusions.folders.length) {
            throw new Error(
              '원본 폴더를 확인할 수 없어 제외 여부를 판단할 수 없습니다. 폴더 선택으로 다시 가져와 주세요.',
            );
          }
          const excluded = !!originFolder && folderExcluded(originFolder, exclusions.folders);
          if (excluded && !legacyNames.has(asset.name)) {
            result.excluded!++;
            continue;
          }
          const extension = asset.name.split('.').pop()?.toLowerCase();
          if (!extension || !isAudioFile(asset.name)) {
            throw new Error('지원 대상 오디오 확장자가 아닙니다.');
          }
          if (asset.stage) {
            if (!FileSystem.cacheDirectory) {
              throw new Error('임시 저장 공간에 접근할 수 없습니다.');
            }
            temporaryUri =
              FileSystem.cacheDirectory +
              'local-import-' +
              Date.now() +
              '-' +
              ++stagingSequence +
              '.' +
              extension;
            // Stage one file at a time. Hash only the app copy, not a provider stream with unreliable size.
            const { File } = await import('expo-file-system');
            await new File(asset.uri).copy(new File(temporaryUri));
            inputUri = temporaryUri;
          }
          const info = await fingerprintFile(inputUri, '파일을 읽을 수 없거나 비어 있습니다.');
          const { digest, id } = info;
          let previous = known.get(id);
          if (
            previous?.source === 'local' &&
            originFolder &&
            !previous.local.originalFolders?.includes(originFolder)
          ) {
            previous = {
              ...previous,
              local: {
                ...previous.local,
                originalFolders: [...(previous.local.originalFolders ?? []), originFolder],
              },
            };
            await saveLocalSong(previous);
            known.set(id, previous);
          }
          if (excluded) {
            result.excluded!++;
            continue;
          }
          if (previous) {
            try {
              await localSource(previous);
              result.duplicates++;
              continue;
            } catch {
              /* Restore the missing app copy below. */
            }
          }
          const fileName =
            previous?.source === 'local'
              ? previous.local.fileName
              : digest + '-' + info.size + '.' + extension;
          await withVerifiedCopy(
            {
              from: inputUri,
              to: folder + fileName,
              fingerprint: info,
              message: '파일 복사를 완료하지 못했습니다. 저장 공간을 확인해 주세요.',
            },
            async () => {
              const song: Song = previous ?? {
                id,
                source: 'local',
                local: {
                  fileName,
                  originalName: asset.name,
                  size: info.size,
                  mimeType: asset.mimeType,
                  originalFolders: originFolder ? [originFolder] : undefined,
                },
                title: asset.name.replace(/\.[^.]+$/, ''),
                artist: '알 수 없는 아티스트',
                album: '이 기기 음악',
                albumSource: 'fallback',
                albumId: 'local:device',
                duration:
                  Number.isFinite(asset.duration) && (asset.duration ?? 0) > 0
                    ? asset.duration!
                    : 0,
              };
              await saveLocalSong(song);
              known.set(id, song);
              result.added++;
            },
          );
        } catch (error) {
          result.failures.push(
            asset.name + ' · ' + (error instanceof Error ? error.message : '가져오지 못했습니다.'),
          );
        } finally {
          // Delete only the temporary picker copy; never touch the selected original.
          if (FileSystem.cacheDirectory && temporaryUri?.startsWith(FileSystem.cacheDirectory)) {
            await FileSystem.deleteAsync(temporaryUri, { idempotent: true }).catch(() => {});
          }
          onProgress?.(++processed);
        }
      }
    } catch (error) {
      // Retain songs already imported if enumeration later fails.
      if (kind === 'files') {
        throw error;
      }
      result.failures.push(error instanceof Error ? error.message : '음악 목록을 읽지 못했습니다.');
    }
    return result;
  });
}
