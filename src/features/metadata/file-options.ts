import type { Song } from '@/types/music';

export const DRIVE_FILE_WRITE_BLOCKED_MESSAGE =
  'Google Drive 파일은 직접 수정할 수 없습니다. 앱에 표시되는 정보만 변경할 수 있습니다.';
export const MYBOX_FILE_READ_ONLY_MESSAGE =
  'MYBOX 파일은 직접 수정할 수 없습니다. 앱에 표시되는 정보만 변경할 수 있습니다.';

export function fileTagFormat(name: string): 'mp3' | 'flac' | null {
  const extension = name.split('.').pop()?.toLowerCase();
  return extension === 'mp3' || extension === 'flac' ? extension : null;
}
export function fileWriteUnavailable(song: Song, mode: string, platform: string): string | null {
  if (song.source === 'drive') {
    return DRIVE_FILE_WRITE_BLOCKED_MESSAGE;
  }
  if (song.source === 'mybox') {
    return MYBOX_FILE_READ_ONLY_MESSAGE;
  }
  if (platform === 'web') {
    return '파일 저장은 Android·iOS 앱에서 사용할 수 있습니다.';
  }
  let name: string | undefined;
  if (song.source === 'local') {
    name = song.local.fileName;
  } else if (song.source === 's3') {
    name = song.s3.key;
  } else {
    name = song.path;
  }

  if (!song.source || song.source === 'nas') {
    if (mode !== 'nas') {
      return '데모 음악에는 원본 파일을 저장할 수 없습니다.';
    }
    if (!name) {
      return 'NAS 원본 파일의 경로가 없습니다.';
    }
  }
  return name && fileTagFormat(name)
    ? null
    : '파일 저장은 MP3·FLAC 형식을 지원합니다. 다른 형식은 앱 표시 정보만 저장할 수 있습니다.';
}
export function fileWriteDescription(song: Song): string {
  if (song.source === 'mybox') {
    return MYBOX_FILE_READ_ONLY_MESSAGE;
  }
  if (song.source === 'local') {
    return '앱에 보관된 음악 복사본의 태그도 변경합니다. 휴대전화에서 가져온 원본은 변경하지 않습니다.';
  }
  if (song.source === 'drive') {
    return DRIVE_FILE_WRITE_BLOCKED_MESSAGE;
  }
  if (song.source === 's3') {
    return 'S3 원본 객체의 태그도 변경합니다. 현재 연결 키에 GetObject·PutObject 권한이 필요합니다.';
  }
  return 'NAS 원본의 태그도 변경합니다. File Station의 읽기·쓰기 권한이 필요하며, 수정 전 파일은 같은 폴더에 .yeongdu-backup 파일로 보관합니다.';
}
