import { useAuthStore } from '@/stores/auth';
import { SynologyClient, SessionExpiredError, SynologyError } from '@/services/synology/api';
import { musicRepository } from '@/services/synology/repository';
import { privacyScope } from '@/features/hidden-music/rules';
import { demoLyrics, parseLyrics } from '@/services/lyrics/parse-lyrics';
import { memoSnapshot, type MusicProvider } from './contracts';
import type { Song } from '@/types/music';

const emptySongs = [] as const;
export const synologyProvider: MusicProvider = {
  id: 'nas',
  name: 'NAS 음악',
  catalog: 'remote',
  playbackRecovery: 'check',
  getState: memoSnapshot(() => {
    const state = useAuthStore.getState();
    return {
      ready: state.ready,
      connected: state.mode !== 'setup',
      selectable: state.mode === 'nas' && !!state.session,
      scope: privacyScope(state.mode, state.session) ?? '',
      generation: state.generation,
      songs: emptySongs,
      loading: false,
      error: null,
    };
  }),
  subscribe: (listener) => useAuthStore.subscribe(listener),
  bootstrap: () => useAuthStore.getState().bootstrap(),
  songs: (page) => musicRepository().songs(page),
  refresh: async (signal) => {
    await musicRepository({ allowCachedFallback: false }).songs({ offset: 0, limit: 1, signal });
  },
  streamSource: (song) => musicRepository().streamSource(song),
  entityRef: (song) => ({
    providerId: 'nas',
    accountScope: synologyProvider.getState().scope,
    remoteId: ('nasId' in song && song.nasId) || song.id,
  }),
  restore: (song) => {
    const { mode, session } = useAuthStore.getState();
    if (mode === 'mock') {
      return song;
    }
    return session
      ? {
          ...song,
          artworkUrl: new SynologyClient(session).coverUrl(
            ('nasId' in song && song.nasId) || song.id,
          ),
        }
      : null;
  },
  checkSession: async () => {
    const { mode, session, generation, expire } = useAuthStore.getState();
    if (mode !== 'nas' || !session) {
      return;
    }
    try {
      await new SynologyClient(session).checkSession();
    } catch (error) {
      if (
        error instanceof SessionExpiredError ||
        (error instanceof SynologyError && error.code === 105)
      ) {
        await expire(session, generation);
      }
      throw error;
    }
  },
  lyrics: {
    read: async (song, signal) => {
      const { mode, session, generation } = useAuthStore.getState();
      if (mode === 'mock') {
        return demoLyrics();
      }
      if (!session?.apis['SYNO.AudioStation.Lyrics']) {
        throw new Error('이 서버에서 가사를 사용할 수 없습니다. 온라인 가사를 선택해 주세요.');
      }
      try {
        const raw = await new SynologyClient(session).lyrics(
          ('nasId' in song && song.nasId) || song.id,
          signal,
        );
        if (raw.length > 1_000_000) {
          throw new Error('가사 응답이 너무 큽니다.');
        }
        return parseLyrics(raw, 'nas');
      } catch (error) {
        if (
          error instanceof SessionExpiredError ||
          (error instanceof SynologyError && error.code === 105)
        ) {
          await useAuthStore.getState().expire(session, generation);
          Object.assign(error, { authenticationExpired: true });
        }
        throw error;
      }
    },
  },
  get download() {
    if (useAuthStore.getState().mode !== 'nas') {
      return undefined;
    }
    return {
      source: async (song: Song) => {
        const { session } = useAuthStore.getState();
        if (!session) {
          throw new Error('NAS 연결이 필요합니다.');
        }
        return new SynologyClient(session).streamSource(song, 'original');
      },
    };
  },
  fileWrite: {
    description:
      'NAS 원본의 태그도 변경합니다. File Station 읽기·쓰기 권한이 필요하며 수정 전 파일을 백업합니다.',
  },
};
