import { parseLyrics, demoLyrics } from '@/services/lyrics/parse-lyrics';
import { onlineLyrics, checkLyricsCancelled, LyricsRequestError } from '@/services/lyrics/lrclib';
import { SessionExpiredError, SynologyClient, SynologyError, SynologyRequestError, type Session } from '@/services/synology/api';
import { useAuthStore } from '@/stores/auth';
import type { LyricsDocument, LyricsSource } from '@/types/lyrics';
import type { Song } from '@/types/music';

type LyricsRequest = { song: Song; source: LyricsSource; mode: string; session: Session | null; generation: number; duration: number; signal?: AbortSignal; searchOnline?: boolean };

export async function loadLyrics({ song, source, mode, session, generation, duration, signal, searchOnline = false }: LyricsRequest): Promise<LyricsDocument> {
  checkLyricsCancelled(signal);
  if (song.source === 'local') {
    if (source === 'nas') throw new Error('이 기기 음악은 NAS 가사를 사용할 수 없습니다. 자동 또는 온라인을 선택해 주세요.');
    return onlineLyrics(song, duration, signal, searchOnline);
  }
  if (mode === 'mock') return demoLyrics();
  if (source === 'online') return onlineLyrics(song, duration, signal, searchOnline);
  let nas: LyricsDocument | null = null;
  let nasError: unknown;
  if (session?.apis['SYNO.AudioStation.Lyrics']) {
    try {
      const raw = await new SynologyClient(session).lyrics(song.nasId ?? song.id, signal);
      checkLyricsCancelled(signal);
      if (raw.length > 1000000) throw new Error('NAS 가사 응답이 너무 큽니다.');
      nas = parseLyrics(raw, 'nas');
    } catch (error) {
      if (error instanceof SynologyRequestError && (error.kind === 'cancelled' || (error.kind === 'timeout' && signal?.aborted))) throw error;
      checkLyricsCancelled(signal);
      if (error instanceof SessionExpiredError || (error instanceof SynologyError && error.code === 105)) {
        await useAuthStore.getState().expire(session, generation);
        throw error;
      }
      nasError = error;
    }
  } else nasError = new Error('이 NAS에서 가사 API를 찾을 수 없습니다. 온라인 가사를 선택해 주세요.');
  if (source === 'nas') {
    if (nasError) throw nasError;
    return nas!;
  }
  if (nas?.kind === 'synced') return nas;
  try {
    const online = await onlineLyrics(song, duration, signal, searchOnline);
    checkLyricsCancelled(signal);
    if (online.kind === 'synced') return online;
    if (nas?.kind === 'plain') return nas;
    if (online.kind === 'missing' && nasError) throw nasError;
    return online;
  } catch (error) {
    if (error instanceof LyricsRequestError && (error.kind === 'cancelled' || (error.kind === 'timeout' && signal?.aborted))) throw error;
    checkLyricsCancelled(signal);
    if (nas?.kind === 'plain') return nas;
    throw error;
  }
}
