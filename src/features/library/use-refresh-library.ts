import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { libraryIdentity, musicRepository } from './repository';
import { refreshLibrary } from './refresh-library';

export function useRefreshLibrary() {
  const queryClient = useQueryClient();
  const running = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
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
      const result = await refreshLibrary(queryClient, musicRepository({ allowCachedFallback: false }), identity, isCurrentConnection);
      if (result && isCurrentConnection()) setMessage(mode === 'mock' ? '데모 목록을 새로고침했습니다.' : 'Audio Station에서 총 ' + result.songCount + '곡의 목록을 확인했습니다.');
    } catch (failure) {
      if (isCurrentConnection()) setError('목록 갱신 실패 · 기존 목록을 유지합니다. ' + (failure instanceof Error ? failure.message : '다시 시도해 주세요.'));
    } finally {
      running.current = false;
      setRefreshing(false);
    }
  }

  return { refreshing, message, error, refresh };
}
