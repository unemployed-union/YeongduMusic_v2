import type { QueryClient } from '@tanstack/react-query';
import { musicProviders } from '@/services/music-providers/registry';
import { useLocalMusicStore } from '@/stores/local-music';
import type { MusicSourceFilter } from '@/types/music';
import { libraryIdentity } from './repository';
import { useAuthStore } from '@/stores/auth';
import { refreshStoredLibrary } from '@/services/music-providers/library-tasks';
import { refreshNasTask } from '@/services/music-providers/nas-library-task';

export function captureRefreshContext(override?: MusicSourceFilter) {
  const preferredSource = useLocalMusicStore.getState().source;
  const source = override ?? preferredSource;
  const providers = musicProviders.map((provider) => {
    const state = provider.getState();
    return { provider, state };
  });
  return {
    source,
    providers,
    isCurrent: () =>
      useLocalMusicStore.getState().source === preferredSource &&
      providers.every(({ provider, state }) => {
        const current = provider.getState();
        return (
          current.scope === state.scope &&
          current.generation === state.generation &&
          current.selection === state.selection &&
          current.documentsRevision === state.documentsRevision
        );
      }),
  };
}

/** Refresh providers independently so one unavailable service cannot hide another. */
export async function refreshMusicLibrary(
  queryClient: QueryClient,
  context: ReturnType<typeof captureRefreshContext>,
  isActive = context.isCurrent,
): Promise<string | null> {
  if (!isActive()) {
    return null;
  }
  const selected = context.providers.filter(
    ({ provider, state }) =>
      (context.source === 'all' || context.source === provider.id) && state.connected,
  );
  const results = await Promise.allSettled(selected.map(({ provider }) => {
    if (provider.id === 'nas') {
      const auth = useAuthStore.getState();
      return refreshNasTask(queryClient, libraryIdentity(auth.mode, auth.session));
    }
    return provider.id === 'local' ? provider.refresh() : refreshStoredLibrary(provider);
  }));
  if (!isActive()) {
    return null;
  }
  // Provider stores and the NAS Query publish their own completed catalogs.
  // No global invalidation: a library refresh must not refetch unrelated playlists/accounts.
  if (!isActive()) {
    return null;
  }
  const failed = selected
    .filter(
      ({ provider, state }, index) =>
        results[index].status === 'rejected' || (!!provider.getState().error && state.connected),
    )
    .map(({ provider }) => provider.name);
  if (failed.length === selected.length && failed.length) {
    throw new Error(failed.join(' · ') + ' 연결을 확인하고 다시 시도해 주세요.');
  }
  return failed.length
    ? '사용 가능한 음악 목록을 갱신했습니다. ' + failed.join(' · ') + '는 다시 시도해 주세요.'
    : '음악 목록을 불러왔습니다.';
}
