import type { Song } from '@/types/music';

export const isNasSong = (song: Song): song is Extract<Song, { source?: 'nas' }> => song.source === undefined || song.source === 'nas';
export const isCloudSong = (song: Song): song is Extract<Song, { source: 'drive' | 's3' }> => song.source === 'drive' || song.source === 's3';
export const AUDIO_EXTENSION = /\.(mp3|m4a|flac|wav|aac|ogg|opus|aif|aiff|alac)$/i;
export const musicSourceLabels = { all: '전체 음악', nas: 'NAS 음악', local: '이 기기 음악', drive: 'Google Drive', s3: 'S3' } as const;
