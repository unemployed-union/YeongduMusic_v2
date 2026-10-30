import { writtenSongChanges, mergeWrittenSong } from './written-song';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { useAuthStore } from '@/stores/auth';
import { useS3Store } from '@/stores/s3';
import { useLocalMusicStore } from '@/stores/local-music';
import { usePlaybackStore } from '@/stores/playback';
import { localSource, replaceLocalMetadataFile } from '@/services/local-music/storage';
import { fingerprintFile } from '@/services/local-music/file-copy';
import {
  DRIVE_FILE_WRITE_BLOCKED_MESSAGE,
  fileTagFormat,
  fileWriteUnavailable,
} from '@/features/metadata/file-options';
import { parseMetadata } from '@/features/metadata/rules';
import { prepareS3File } from './cloud-file';
import { prepareNasFile } from './nas-file';
import { checkCancelled, rewriteTags, type FileProgress } from './file-io';
import { artworkUri } from '@/features/artwork/rules';
import type { Song, SongMetadata } from '@/types/music';

let writing = false;
export async function writeSongFile(
  song: Song,
  metadata: SongMetadata,
  progress: FileProgress,
): Promise<{ song: Song; message: string }> {
  if (song.source === 'drive') throw new Error(DRIVE_FILE_WRITE_BLOCKED_MESSAGE);
  return writeFile(song, parseMetadata(metadata), progress);
}
export async function writeSongArtworkFile(
  song: Song,
  image: string,
  progress: FileProgress,
  signal?: AbortSignal,
  allowed?: () => boolean,
): Promise<{ song: Song; message: string }> {
  return writeFile(song, undefined, progress, { image, signal, allowed });
}
async function writeFile(
  inputSong: Song,
  fields: SongMetadata | undefined,
  progress: FileProgress,
  artwork?: { image: string; signal?: AbortSignal; allowed?: () => boolean },
): Promise<{ song: Song; message: string }> {
  // Artwork and text can be saved separately in the same editor. Use the latest
  // stored size after an earlier file write without changing the stable song ID.
  const song =
    inputSong.source === 'local'
      ? (useLocalMusicStore.getState().songs.find((item) => item.id === inputSong.id) ?? inputSong)
      : inputSong.source === 's3'
        ? (useS3Store.getState().songs.find((item) => item.id === inputSong.id) ?? inputSong)
        : inputSong;
  if (song.source === 'drive') throw new Error(DRIVE_FILE_WRITE_BLOCKED_MESSAGE);
  if (writing) throw new Error('다른 음악 파일을 저장하고 있습니다. 완료 후 다시 시도해 주세요.');
  const auth = useAuthStore.getState(),
    s3 = useS3Store.getState();
  const unavailable = fileWriteUnavailable(song, auth.mode, Platform.OS);
  if (unavailable) throw new Error(unavailable);
  const local = song.source === 'local';
  if (local && useLocalMusicStore.getState().busy)
    throw new Error('기기 음악 작업이 진행 중입니다. 완료 후 다시 저장해 주세요.');
  writing = true;
  const request = new AbortController(),
    signal = request.signal;
  const abort = () => request.abort();
  artwork?.signal?.addEventListener('abort', abort, { once: true });
  if (artwork?.signal?.aborted) abort();
  const check = () => {
    if (artwork?.allowed && !artwork.allowed()) request.abort();
    checkCancelled(signal);
  };
  const stops = local
    ? []
    : song.source === 's3'
      ? [
          useS3Store.subscribe((state) => {
            if (state.generation !== s3.generation || state.connection?.id !== song.s3.connectionId)
              request.abort();
          }),
        ]
      : [
          useAuthStore.subscribe((state) => {
            if (state.generation !== auth.generation || state.session !== auth.session)
              request.abort();
          }),
        ];
  const timer = setTimeout(() => request.abort(), 10 * 60_000);
  let folder: Directory | null = null;
  if (local) useLocalMusicStore.setState({ busy: true });
  try {
    check();
    const artworkFiles = artwork ? await import('@/services/artwork/files') : null;
    const picture =
      artwork && artworkFiles
        ? await artworkFiles.readArtworkForTags(artwork.image, signal)
        : undefined;
    const artworkUrl =
      artwork && artworkFiles
        ? artworkUri(artwork.image, artworkFiles.artworkBaseUri())
        : undefined;
    check();
    progress('원본 파일과 쓰기 권한 확인 중');
    const target =
      song.source === 's3'
        ? await prepareS3File(song, signal)
        : local
          ? null
          : auth.mode === 'nas' && auth.session && song.path
            ? await prepareNasFile(auth.session, song.path, signal)
            : null;
    if (!local && !target) throw new Error('원본 파일을 찾을 수 없습니다.');
    const name = target?.name ?? (song.source === 'local' ? song.local.fileName : ''),
      format = fileTagFormat(name);
    if (!format) throw new Error('원본 파일 저장은 MP3·FLAC 형식을 지원합니다.');
    // Do not use a remote filename as a local path.
    if (!name || /[\/\\\0]/.test(name) || name === '.' || name === '..')
      throw new Error('원본 파일 이름을 확인할 수 없습니다.');
    const expectedSize = target?.size ?? (song.source === 'local' ? song.local.size : 0);
    if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0)
      throw new Error('원본 파일 크기를 확인할 수 없습니다.');
    if (Paths.availableDiskSpace < expectedSize * 3 + 32 * 1024 * 1024)
      throw new Error('원본과 수정본을 임시 저장할 기기 공간이 부족합니다.');
    folder = new Directory(
      Paths.cache,
      'metadata-write-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10),
    );
    folder.create();
    const input = new File(folder, 'source-original'),
      output = new File(folder, name);
    progress('원본 음악 파일 읽는 중');
    if (local) {
      const source = await localSource(song);
      await new File(source.uri).copy(input);
    } else if (target) {
      try {
        await File.downloadFileAsync(target.download.uri, input, {
          headers: target.download.headers,
          signal,
          onProgress: ({ bytesWritten, totalBytes }) =>
            progress(
              totalBytes > 0
                ? `원본 다운로드 중 · ${Math.min(100, Math.floor((bytesWritten / totalBytes) * 100))}%`
                : '원본 다운로드 중',
            ),
        });
      } catch {
        throw new Error(
          '원본 파일을 내려받지 못했습니다. 연결·권한을 확인해 주세요. 원본은 변경하지 않았습니다.',
        );
      }
    }
    check();
    const original = await fingerprintFile(input.uri, '내려받은 원본 파일을 확인할 수 없습니다.');
    if (
      original.size !== expectedSize ||
      (target?.md5 && original.digest !== target.md5.toLowerCase())
    )
      throw new Error('다운로드한 파일이 원본과 일치하지 않습니다. 원본은 변경하지 않았습니다.');
    if (target) await target.unchanged();
    check();
    progress('음악 태그 작성 중');
    await rewriteTags(input, output, format, fields, signal, picture);
    check();
    let updated: Song, message: string;
    if (local) {
      updated = await replaceLocalMetadataFile(song.id, output.uri, fields, check, artworkUrl);
      message = '앱에 보관된 음악 파일에 저장했습니다.';
    } else {
      if (!target) throw new Error('원본 저장소 연결이 없습니다.');
      message = await target.commit(output, progress);
      updated = { ...song, ...writtenSongChanges(fields, artworkUrl) };
      if (updated.source === 's3')
        updated = { ...updated, s3: { ...updated.s3, size: output.size, modifiedTime: undefined } };
    }
    // A source snapshot now represents the written tags, so removing a display edit
    // must not resurrect pre-write values in the current queue.
    if (!signal.aborted) {
      if (updated.source === 's3') useS3Store.getState().recordWrittenSong(updated);
      usePlaybackStore.setState((state) => ({
        queue: mergeWrittenSong(state.queue, updated, artworkUrl),
      }));
    }
    return { song: updated, message };
  } finally {
    artwork?.signal?.removeEventListener('abort', abort);
    clearTimeout(timer);
    stops.forEach((stop) => stop());
    try {
      try {
        if (folder?.exists) folder.delete();
      } catch {
        /* The OS can clear leftover cache files later. */
      }
      if (local) {
        useLocalMusicStore.setState({ busy: false });
        await useLocalMusicStore.getState().load();
      }
    } finally {
      writing = false;
    }
  }
}
