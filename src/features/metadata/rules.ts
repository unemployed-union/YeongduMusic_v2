import type { OriginalSongMetadata, Page, Song, SongMetadata } from '@/types/music';

export const METADATA_FIELDS = [
  { key: 'title', label: '제목', numeric: false },
  { key: 'artist', label: '아티스트', numeric: false },
  { key: 'album', label: '앨범', numeric: false },
  { key: 'albumArtist', label: '앨범 아티스트', numeric: false },
  { key: 'year', label: '발매 연도', numeric: true },
  { key: 'trackNumber', label: '트랙 번호', numeric: true },
  { key: 'discNumber', label: '디스크 번호', numeric: true },
] as const;
export type MetadataDraft = Record<(typeof METADATA_FIELDS)[number]['key'], string>;
export type MetadataPatches = Record<string, SongMetadata>;

/** Scope stable source identities, never session IDs, URLs with tokens or filenames. */
export function metadataKey(song: Song, nasScope: string | null): string | null {
  if (song.source === 'local') {
    return JSON.stringify(['local', song.id]);
  }
  if (song.source === 'drive') {
    return JSON.stringify(['drive', song.drive.accountId, song.drive.fileId]);
  }
  if (song.source === 's3') {
    return JSON.stringify(['s3', song.s3.connectionId, song.s3.key]);
  }
  if (song.source === 'mybox') {
    return JSON.stringify(['mybox', song.mybox.connectionId, song.mybox.fileId]);
  }
  return nasScope ? JSON.stringify(['nas', nasScope, song.nasId ?? song.id]) : null;
}

export function validateMetadataKey(key: string): void {
  let value: unknown;
  try {
    value = JSON.parse(key);
  } catch {
    throw new Error('곡의 저장소 정보를 확인할 수 없습니다.');
  }
  if (
    !Array.isArray(value) ||
    !['nas', 'drive', 's3', 'mybox', 'local'].includes(value[0]) ||
    value.length !== (value[0] === 'local' ? 2 : 3) ||
    value.some((part) => typeof part !== 'string' || !part || part.length > 32768)
  ) {
    throw new Error('곡의 저장소 정보를 확인할 수 없습니다.');
  }
}

export function metadataDraft(song: Song): MetadataDraft {
  return Object.fromEntries(
    METADATA_FIELDS.map(({ key }) => [key, String(song[key] ?? '')]),
  ) as MetadataDraft;
}

export function parseMetadata(value: unknown): SongMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('곡 정보 형식이 올바르지 않습니다.');
  }
  const input = value as Record<string, unknown>;
  function text(key: string, required = false): string {
    const field = input[key] ?? '';
    if (typeof field !== 'string' || field.length > 300) {
      throw new Error('곡 정보는 항목마다 300자 이내로 입력해 주세요.');
    }
    const result = field.trim();
    if (required && !result) {
      throw new Error('곡 제목을 입력해 주세요.');
    }
    return result;
  }
  function number(key: string): number | undefined {
    const field = input[key];
    if (field === undefined || field === null || (typeof field === 'string' && !field.trim())) {
      return undefined;
    }
    const hasNumericFormat =
      typeof field === 'number' || (typeof field === 'string' && /^\d{1,4}$/.test(field.trim()));
    if (!hasNumericFormat) {
      throw new Error('연도·트랙·디스크 번호는 1~9999의 정수로 입력하거나 비워 주세요.');
    }

    const parsedNumber = Number(field);
    const isIntegerInRange =
      Number.isInteger(parsedNumber) && parsedNumber >= 1 && parsedNumber <= 9999;
    if (!isIntegerInRange) {
      throw new Error('연도·트랙·디스크 번호는 1~9999의 정수로 입력하거나 비워 주세요.');
    }

    return parsedNumber;
  }
  return {
    title: text('title', true),
    artist: text('artist'),
    album: text('album'),
    albumArtist: text('albumArtist') || undefined,
    year: number('year'),
    trackNumber: number('trackNumber'),
    discNumber: number('discNumber'),
  };
}

export function originalMetadata(song: Song): OriginalSongMetadata {
  const original = song.metadataOriginal ?? song;
  // Explicit optional fields also clear edits after a JSON playback snapshot round-trip.
  return {
    title: original.title,
    artist: original.artist,
    album: original.album,
    albumArtist: original.albumArtist,
    year: original.year,
    trackNumber: original.trackNumber,
    discNumber: original.discNumber,
    albumId: original.albumId,
    albumSource: original.albumSource,
  };
}

export function applyMetadata(song: Song, patch: SongMetadata | undefined): Song {
  if (!patch && !song.metadataOriginal) {
    return song;
  }
  const original = originalMetadata(song);
  let fields: OriginalSongMetadata = original;
  if (patch) {
    const albumChanged = patch.album !== original.album;
    const groupChanged =
      albumChanged ||
      (patch.albumArtist || patch.artist) !== (original.albumArtist || original.artist);
    let albumSource = original.albumSource;
    if (albumChanged) {
      if (patch.album) {
        albumSource = 'tag';
      } else {
        albumSource = 'fallback';
      }
    }
    fields = {
      ...patch,
      artist: patch.artist || '알 수 없는 아티스트',
      album: patch.album || '알 수 없는 앨범',
      albumId: groupChanged ? undefined : original.albumId,
      albumSource,
    };
  }
  const keys = [...METADATA_FIELDS.map((field) => field.key), 'albumId', 'albumSource'] as const;
  if (keys.every((key) => song[key] === fields[key]) && !!patch === !!song.metadataOriginal) {
    return song;
  }
  return { ...song, ...fields, metadataOriginal: patch ? original : undefined };
}

export function applyMetadataLibrary(
  library: Page<Song>,
  patches: MetadataPatches,
  nasScope: string | null,
): Page<Song> {
  let changed = false;
  const items = library.items.map((song) => {
    const key = metadataKey(song, nasScope);
    const updated = applyMetadata(song, key ? patches[key] : undefined);
    changed ||= updated !== song;
    return updated;
  });
  return changed ? { ...library, items } : library;
}

export function parseMetadataStorage(raw: string | null): MetadataPatches {
  if (raw === null) {
    return {};
  }
  const value = JSON.parse(raw) as { version?: unknown; patches?: unknown };
  if (
    value?.version !== 1 ||
    !value.patches ||
    typeof value.patches !== 'object' ||
    Array.isArray(value.patches)
  ) {
    throw new Error('저장된 곡 정보를 읽을 수 없습니다.');
  }
  const entries = Object.entries(value.patches);
  if (entries.length > 10000) {
    throw new Error('수정한 곡 정보가 저장 한도를 초과했습니다.');
  }
  return Object.fromEntries(
    entries.map(([key, patch]) => {
      validateMetadataKey(key);
      return [key, parseMetadata(patch)];
    }),
  );
}
