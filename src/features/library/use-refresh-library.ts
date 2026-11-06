import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { captureRefreshContext, refreshMusicLibrary } from './refresh-music-library';
import { subscribeProviders } from '@/services/music-providers/registry';
import { useLocalMusicStore } from '@/stores/local-music';

export function useRefreshLibrary() {
  const queryClient = useQueryClient();
  const running = useRef(false);
  const revision = useRef(0);
  const mounted = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    let context = captureRefreshContext();
    const changed = () => {
      if (!context.isCurrent()) {
        revision.current++;
        context = captureRefreshContext();
        setMessage(null);
        setError(null);
      }
    };
    const stops = [subscribeProviders(changed), useLocalMusicStore.subscribe(changed)];
    return () => {
      mounted.current = false;
      stops.forEach((stop) => stop());
    };
  }, []);
  const refresh = useCallback(async () => {
    if (running.current || !mounted.current) {
      return;
    }
    running.current = true;
    setRefreshing(true);
    setError(null);
    setMessage(null);
    const context = captureRefreshContext();
    const requestRevision = revision.current;
    const isActive = () =>
      mounted.current && revision.current === requestRevision && context.isCurrent();
    try {
      const result = await refreshMusicLibrary(queryClient, context, isActive);
      if (isActive()) {
        setMessage(result);
      }
    } catch (failure) {
      if (isActive()) {
        setError(
          '목록 갱신 실패 · 기존 목록을 유지합니다. ' +
            (failure instanceof Error ? failure.message : '다시 시도해 주세요.'),
        );
      }
    } finally {
      running.current = false;
      if (mounted.current) {
        setRefreshing(false);
      }
    }
  }, [queryClient]);
  return { refreshing, message, error, refresh };
}
