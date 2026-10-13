import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { useS3Store } from '@/stores/s3';
import { useGoogleDriveStore } from '@/stores/google-drive';
import { useLocalMusicStore } from '@/stores/local-music';
import { captureRefreshContext, refreshMusicLibrary } from './refresh-music-library';

export function useRefreshLibrary() {
  const queryClient = useQueryClient();
  const running = useRef(false);
  const revision = useRef(0);
  const mounted = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    revision.current++;
    mounted.current = true;
    const changed = () => { revision.current++; setMessage(null); setError(null); };
    const stops = [
      useLocalMusicStore.subscribe((state, previous) => { if (state.source !== previous.source) changed(); }),
      useAuthStore.subscribe((state, previous) => { if (state.generation !== previous.generation) changed(); }),
      useGoogleDriveStore.subscribe((state, previous) => { if (state.generation !== previous.generation || state.account?.id !== previous.account?.id || state.folders !== previous.folders) changed(); }),
      useS3Store.subscribe((state, previous) => { if (state.generation !== previous.generation || state.connection !== previous.connection) changed(); }),
    ];
    return () => { mounted.current = false; stops.forEach(stop => stop()); };
  }, []);

  const refresh = useCallback(async () => {
    if (running.current || !mounted.current) return;
    running.current = true;
    setRefreshing(true); setError(null); setMessage(null);
    const context = captureRefreshContext(), requestRevision = revision.current;
    const isActive = () => mounted.current && revision.current === requestRevision && context.isCurrent();
    try {
      const result = await refreshMusicLibrary(queryClient, context, isActive);
      if (isActive()) setMessage(result);
    } catch (failure) {
      if (isActive()) setError('목록 갱신 실패 · 기존 목록을 유지합니다. ' + (failure instanceof Error ? failure.message : '다시 시도해 주세요.'));
    } finally {
      running.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }, [queryClient]);
  return { refreshing, message, error, refresh };
}
