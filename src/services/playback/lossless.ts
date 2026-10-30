import type { Song } from '@/types/music';

const losslessCodecs = new Set([
  'flac',
  'alac',
  'apple lossless',
  'apple_lossless',
  'ape',
  'wavpack',
  'wv',
  'tta',
  'truehd',
  'mlp',
]);
export function isLosslessSong(song: Song): boolean {
  if (typeof song.lossless === 'boolean') {
    return song.lossless;
  }
  if (song.audioCodec) {
    const codec = song.audioCodec.trim().toLowerCase();
    return (
      losslessCodecs.has(codec) ||
      codec === 'lpcm' ||
      /^pcm_(?:[su](?:8|16|24|32|64)|f(?:32|64))(?:le|be)?$/.test(codec)
    );
  }
  // WAV/AIFF/M4A are containers: their extension alone cannot establish losslessness.
  let name: string;
  if (song.source === 'local') {
    name = song.local.fileName;
  } else if (song.source === 's3') {
    name = song.s3.key;
  } else {
    name = song.path ?? song.title;
  }

  if (/\.(flac|alac|ape|wv|tta)$/i.test(name)) {
    return true;
  }
  let mime: string | undefined;
  if (song.source === 'local') {
    mime = song.local.mimeType;
  } else if (song.source === 'drive') {
    mime = song.drive.mimeType;
  } else {
    mime = undefined;
  }

  return /^(audio\/(x-)?flac|audio\/(x-)?alac)$/i.test(mime ?? '');
}

/** Judge the loaded stream, never a setting that can change after loading it. */
export function isLosslessPlayback(
  song: Song,
  source: { uri?: string; assetId?: number },
): boolean {
  if (!source.uri || source.assetId !== undefined) {
    return false;
  }
  if (song.source === undefined || song.source === 'nas') {
    try {
      const url = new URL(source.uri);
      if (
        url.searchParams.get('api') !== 'SYNO.AudioStation.Stream' ||
        url.searchParams.get('method') !== 'stream'
      ) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return isLosslessSong(song);
}
