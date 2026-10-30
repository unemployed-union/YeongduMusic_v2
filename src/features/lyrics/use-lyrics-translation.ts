import { useEffect, useMemo, useRef, useState } from 'react';
import { useLyricsTranslationStore } from '@/stores/lyrics-translation';
import { translateLyrics, type TranslatedLyrics } from '@/services/lyrics/translate-lyrics';
import type { LyricsDocument } from '@/types/lyrics';

type Result = {
  key: string;
  lines?: TranslatedLyrics;
  shown: boolean;
  loading: boolean;
  progress: string | null;
  error: string | null;
};
const empty = (key: string): Result => ({
  key,
  shown: false,
  loading: false,
  progress: null,
  error: null,
});
export function useLyricsTranslation(document: LyricsDocument | undefined, identity: string) {
  const preferences = useLyricsTranslationStore();
  const load = preferences.load;
  useEffect(() => {
    void load();
  }, [load]);
  const enabled = preferences.ready && !preferences.loadError && preferences.enabled;
  const key = useMemo(
    () =>
      JSON.stringify([
        identity,
        document?.provider,
        document?.kind,
        document?.lines,
        preferences.options,
        enabled,
      ]),
    [identity, document?.provider, document?.kind, document?.lines, preferences.options, enabled],
  );
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [result, setResult] = useState<Result>(() => empty(key));
  // Reset track/language state during render so another document is never shown,
  // including a quick A → B → A change before a cancelled request settles.
  if (result.key !== key) {
    setResult(empty(key));
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    controller.current?.abort();
    controller.current = null;
    return () => {
      controller.current?.abort();
    };
  }, [key]);
  async function start() {
    const live = useLyricsTranslationStore.getState();
    if (
      !document ||
      controller.current ||
      !enabled ||
      !live.enabled ||
      live.loadError ||
      live.saving
    ) {
      return;
    }
    const current = new AbortController();
    controller.current = current;
    const allowed = () =>
      mounted.current &&
      !current.signal.aborted &&
      useLyricsTranslationStore.getState().enabled &&
      !useLyricsTranslationStore.getState().loadError;
    setResult({ key, shown: true, loading: true, progress: null, error: null });
    try {
      const lines = await translateLyrics(
        document,
        preferences.options,
        current.signal,
        (done, total) => {
          if (allowed()) {
            setResult({
              key,
              shown: true,
              loading: true,
              progress: `${done}/${total} 구절 번역 중`,
              error: null,
            });
          } else {
            current.abort();
          }
        },
      );
      if (allowed()) {
        setResult({ key, shown: true, lines, loading: false, progress: null, error: null });
      }
    } catch (cause) {
      if (allowed()) {
        setResult({
          key,
          shown: false,
          loading: false,
          progress: null,
          error: cause instanceof Error ? cause.message : '가사를 번역하지 못했습니다.',
        });
      }
    } finally {
      if (controller.current === current) {
        controller.current = null;
      }
    }
  }
  function cancel() {
    controller.current?.abort();
    controller.current = null;
    setResult(empty(key));
  }
  const current = result.key === key ? result : empty(key);
  const setShown = (shown: boolean) =>
    setResult((value) => (value.key === key ? { ...value, shown } : value));
  return {
    preferences,
    enabled,
    start,
    cancel,
    shown: enabled && current.shown && !!current.lines,
    setShown,
    loading: enabled && current.loading,
    progress: current.progress,
    error: current.error,
    lines: current.lines,
  };
}
