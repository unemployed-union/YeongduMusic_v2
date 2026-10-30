import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useSongs } from '@/features/library/queries';
import { hiddenMatcher, privacyScope } from '@/features/hidden-music/rules';
import { useAuthStore } from '@/stores/auth';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { useWebMetadataStore } from '@/stores/web-metadata';
import { runAutomaticMetadata } from '@/services/metadata/automatic';
import type { Song } from '@/types/music';

export function AutomaticMetadata() {
  const ready = useWebMetadataStore((state) => state.ready);
  const enabled = useWebMetadataStore((state) => state.enabled);
  const saving = useWebMetadataStore((state) => state.saving);
  const retry = useWebMetadataStore((state) => state.retryRevision);
  const excluded = useWebMetadataStore((state) => state.excluded);
  const error = useWebMetadataStore((state) => state.automaticError);
  const load = useWebMetadataStore((state) => state.load);
  useEffect(() => {
    void load();
  }, [load]);
  const mode = useAuthStore((state) => state.mode);
  const session = useAuthStore((state) => state.session);
  const scope = privacyScope(mode, session);
  const privacyReady = useHiddenMusicStore((state) => state.ready);
  const privacyAccount = useHiddenMusicStore((state) => state.scope);
  const songs = useRef<readonly Song[]>([]);
  const controller = useRef<AbortController | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const restart = useRef(false);
  const latestKick = useRef<() => void>(() => {});
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        controller.current?.abort();
      }
      setActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);
  const permitted =
    ready && enabled && active && privacyReady && privacyAccount === scope && mode !== 'mock';
  const { data } = useSongs(permitted);
  useEffect(() => {
    songs.current = permitted ? (data?.items ?? []) : [];
  }, [data?.items, permitted]);
  const kick = useCallback(() => {
    if (!permitted || error || useWebMetadataStore.getState().automaticError) {
      return;
    }
    if (running.current) {
      restart.current = true;
      return;
    }
    const current = new AbortController();
    controller.current = current;
    const task = runAutomaticMetadata(
      () => {
        const auth = useAuthStore.getState();
        const privacy = useHiddenMusicStore.getState();
        if (
          AppState.currentState !== 'active' ||
          privacyScope(auth.mode, auth.session) !== scope ||
          !privacy.ready ||
          privacy.scope !== scope
        ) {
          return [];
        }
        const hidden = hiddenMatcher(privacy.profile.presets);
        return songs.current.filter((song) => !hidden(song));
      },
      scope,
      current.signal,
    );
    running.current = task;
    void task.finally(() => {
      if (running.current === task) {
        running.current = null;
      }
      if (restart.current) {
        restart.current = false;
        latestKick.current();
      }
    });
  }, [permitted, scope, error]);
  useEffect(() => {
    latestKick.current = kick;
    kick();
    return () => {
      latestKick.current = () => {};
      restart.current = false;
      controller.current?.abort();
      useWebMetadataStore.setState({ status: null });
    };
  }, [kick, retry, excluded]);
  useEffect(() => {
    if (!saving) {
      kick();
    }
  }, [data?.items, saving, kick]);
  return null;
}
