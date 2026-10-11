import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { useLocalMusicStore } from '@/stores/local-music';
import { libraryIdentity, musicRepository } from './repository';
import { refreshLibrary } from './refresh-library';

export function useRefreshLibrary() {
  const queryClient = useQueryClient();
  const running = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setRefreshing(true);
    setError(null);
    setMessage(null);
    const { mode, session } = useAuthStore.getState();
    const identity = libraryIdentity(mode, session);
    const isCurrentConnection = () => {
      const current = useAuthStore.getState();
      return current.mode === mode && current.session?.sid === session?.sid && current.session?.baseUrl === session?.baseUrl;
    };
    try {
      await useLocalMusicStore.getState().load();
      if (useLocalMusicStore.getState().source === 'local' || mode === 'setup') {
        await queryClient.invalidateQueries({ queryKey: ['local-library'] });
        setMessage('이 기기 음악 목록을 불러왔습니다.');
        return;
      }
      const result = await refreshLibrary(queryClient, musicRepository({ allowCachedFallback: false }), identity, isCurrentConnection);
      if (result && isCurrentConnection()) setMessage(mode === 'mock' ? '데모 목록을 새로고침했습니다.' : 'Audio Station에서 음악 목록을 불러왔습니다.');
    } catch (failure) {
      if (isCurrentConnection()) setError('목록 갱신 실패 · 기존 목록을 유지합니다. ' + (failure instanceof Error ? failure.message : '다시 시도해 주세요.'));
    } finally {
      running.current = false;
      setRefreshing(false);
    }
  }, [queryClient]);

  return { refreshing, message, error, refresh };
}
