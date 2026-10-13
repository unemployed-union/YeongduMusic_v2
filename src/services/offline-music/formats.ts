import type { Song } from '@/types/music';

const extensions: Record<string, string> = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
  'audio/flac': 'flac', 'audio/x-flac': 'flac', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/vnd.wave': 'wav', 'audio/aac': 'aac', 'audio/x-aac': 'aac',
  'audio/ogg': 'ogg', 'application/ogg': 'ogg', 'audio/opus': 'opus',
  'audio/aiff': 'aiff', 'audio/x-aiff': 'aiff', 'audio/alac': 'm4a',
};
export function audioExtension(song: Song, contentType: string): string {
  const mime = contentType.split(';')[0].trim().toLowerCase();
  const name = song.source === 's3' ? song.s3.key : song.source === 'drive' ? song.title : song.path ?? song.title;
  const suffix = name.match(/\.(mp3|m4a|flac|wav|aac|aiff|aif|ogg|opus|alac)$/i)?.[1].toLowerCase();
  // A 200 login/error page must never become an offline track.
  if (!mime.startsWith('audio/') && mime !== 'application/ogg' && mime !== 'application/octet-stream') {
    throw new Error('음악 대신 오류 응답을 받았습니다. 연결을 확인하고 다시 보관해 주세요.');
  }
  const extension = extensions[mime] ?? suffix;
  if (!extension) throw new Error('음악 파일 형식을 확인할 수 없습니다. 지원되는 오디오 파일인지 확인해 주세요.');
  return extension;
}
