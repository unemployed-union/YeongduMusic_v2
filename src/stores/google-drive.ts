import { createConnectionTaskRunner } from '@/services/google-drive/connection-tasks';
import { createSerialQueue } from '@/services/async/serial-queue';
import { googleConnectionError } from '@/services/google-drive/auth';
import { create } from 'zustand';
import {
  driveJson,
  driveMediaUrl,
  readDriveFile,
  type DriveFile,
} from '@/services/google-drive/api';
import type { Song } from '@/types/music';
import { refreshDriveLibrary } from '@/services/google-drive/library';
import { mergeDriveQueueMetadata } from '@/services/playback/metadata';
import { usePlaybackStore } from '@/stores/playback';
import { useSongMetadataStore } from '@/stores/song-metadata';
import { pickDriveFileIds } from '@/services/google-drive/picker';
import { parseDriveSelection, saveDriveSelection } from '@/services/google-drive/selection';
import { createDriveSession, type DriveAccount } from '@/services/google-drive/session';
type State = {
  ready: boolean;
  busy: boolean;
  loading: boolean;
  progress: string | null;
  account: DriveAccount | null;
  songs: Song[];
  error: string | null;
  generation: number;
  files: DriveFile[];
  fileSaving: boolean;
  metadataLoading: boolean;
  metadataWarning: string | null;
  selectFiles: (files: DriveFile[]) => Promise<void>;
  pickFiles: () => Promise<void>;
  bootstrap: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
  cancelConnection: () => void;
  accessToken: (accountId: string, rejectedToken?: string) => Promise<string>;
};
export const useGoogleDriveStore = create<State>((set, get) => {
  const { run: exclusive } = createSerialQueue();
  let libraryRequest: AbortController | null = null;
  let fileRequest: AbortController | null = null;
  let attempt = new AbortController();
  const { step } = createConnectionTaskRunner({
    isCurrent: current,
    getSignal: () => attempt.signal,
    isBusy: () => get().busy,
    onProgress: (progress) => set({ progress }),
  });
  function current(generation: number) {
    return get().generation === generation;
  }
  function invalidate() {
    attempt.abort();
    attempt = new AbortController();
  }
  function begin() {
    authentication.clearToken();
    invalidate();
    libraryRequest?.abort();
    fileRequest?.abort();
    const generation = get().generation + 1;
    set({
      generation,
      ready: true,
      busy: true,
      loading: false,
      metadataLoading: false,
      metadataWarning: null,
      files: [],
      fileSaving: false,
      progress: '연결 준비',
      account: null,
      songs: [],
      error: null,
    });
    return generation;
  }

  const authentication = createDriveSession({
    step,
    isCurrent: current,
    getAccount: () => get().account,
    onConnected: (account, files) => set({ account, files }),
    onWarning: (error) => set({ error }),
  });
  return {
    ready: false,
    busy: false,
    loading: false,
    files: [],
    fileSaving: false,
    progress: null,
    account: null,
    songs: [],
    error: null,
    generation: 0,
    metadataLoading: false,
    metadataWarning: null,
    cancelConnection: () => {
      if (!get().busy && !get().loading && !get().fileSaving && !get().metadataLoading) {
        return;
      }
      invalidate();
      libraryRequest?.abort();
      fileRequest?.abort();
      set({
        generation: get().generation + 1,
        ready: true,
        busy: false,
        loading: false,
        metadataLoading: false,
        fileSaving: false,
        progress: null,
        error: 'Google 연결 요청을 취소했습니다. Google 인증 창이 열려 있으면 닫아 주세요.',
      });
    },
    bootstrap: async () => {
      if (get().ready || get().busy) {
        return;
      }
      const generation = get().generation;
      set({ busy: true });
      try {
        await exclusive(() => authentication.restore(generation));
      } catch (error) {
        if (current(generation)) {
          invalidate();
          set({
            generation: generation + 1,
            ready: true,
            busy: false,
            progress: null,
            error: googleConnectionError(error),
          });
        }
      } finally {
        if (current(generation)) {
          set({ ready: true, busy: false, progress: null });
        }
      }
      if (current(generation) && get().account) {
        await get()
          .refresh()
          .catch(() => {});
      }
    },
    connect: async () => {
      const generation = begin();
      try {
        await exclusive(() => authentication.connect(generation));
      } catch (error) {
        if (current(generation)) {
          invalidate();
          set({
            generation: generation + 1,
            busy: false,
            progress: null,
            error: googleConnectionError(error),
          });
        }
      } finally {
        if (current(generation)) {
          set({ busy: false, progress: null });
        }
      }
      if (current(generation) && get().account) {
        await get()
          .refresh()
          .catch(() => {});
      }
    },
    disconnect: async () => {
      const generation = begin();
      try {
        await exclusive(() => authentication.disconnect(generation));
      } catch (error) {
        if (current(generation)) {
          invalidate();
          set({
            generation: generation + 1,
            busy: false,
            progress: null,
            error: googleConnectionError(error),
          });
        }
      } finally {
        if (current(generation)) {
          set({ busy: false, progress: null });
        }
      }
    },
    accessToken: async (accountId, rejectedToken) => {
      const generation = get().generation;
      return exclusive(() => authentication.accessToken(generation, accountId, rejectedToken));
    },
    pickFiles: async () => {
      const account = get().account;
      const generation = get().generation;
      if (!account || get().busy || get().fileSaving || get().loading) {
        return;
      }
      set({ busy: true, error: null, progress: 'Google에서 음악 파일 선택' });
      let ids: string[] | null = null;
      try {
        ids = await exclusive(() =>
          step(
            generation,
            'Google에서 음악 파일 선택',
            () => pickDriveFileIds(account.email),
            300000,
          ),
        );
      } catch (error) {
        if (current(generation)) {
          set({ error: googleConnectionError(error) });
        }
      } finally {
        if (current(generation)) {
          set({ busy: false, progress: null });
        }
      }
      if (current(generation) && get().account?.id === account.id && ids?.length) {
        const names = new Map(get().files.map((file) => [file.id, file.name]));
        const files = [...get().files, ...ids.map((id) => ({ id, name: names.get(id) ?? id }))];
        await get()
          .selectFiles(files)
          .catch(() => {});
      }
    },
    selectFiles: async (files) => {
      const account = get().account;
      if (!account) {
        throw new Error('Google Drive를 먼저 연결해 주세요.');
      }
      if (get().busy || get().fileSaving) {
        throw new Error('Google 파일 선택을 변경하고 있습니다. 잠시 후 다시 시도해 주세요.');
      }
      const generation = get().generation;
      const request = new AbortController();
      fileRequest = request;
      set({ fileSaving: true, error: null });
      const isCurrent = () =>
        current(generation) && get().account?.id === account.id && !request.signal.aborted;
      try {
        const token = (rejected?: string) => get().accessToken(account.id, rejected);
        const selected: DriveFile[] = [];
        const input = parseDriveSelection(JSON.stringify({ version: 1, files }));
        const existing = new Map(get().files.map((file) => [file.id, file]));
        for (const file of input) {
          // Removing an unavailable file must not require reading it again.
          const verified =
            existing.get(file.id) ?? (await readDriveFile(file.id, token, request.signal));
          selected.push({ id: verified.id, name: verified.name });
        }
        await exclusive(async () => {
          if (!isCurrent()) {
            return;
          }
          await step(generation, '선택한 음악 저장', () =>
            saveDriveSelection(account.id, selected, isCurrent),
          );
          if (!isCurrent()) {
            return;
          }
          libraryRequest?.abort();
          libraryRequest = null;
          set({
            files: selected,
            songs: [],
            loading: false,
            metadataLoading: false,
            metadataWarning: null,
          });
        });
        if (isCurrent()) {
          await get().refresh();
        }
      } catch (error) {
        if (isCurrent()) {
          set({ error: googleConnectionError(error) });
          throw error;
        }
      } finally {
        if (fileRequest === request) {
          fileRequest = null;
          if (current(generation)) {
            set({ fileSaving: false });
          }
        }
      }
    },
    refresh: async () => {
      const { account, files } = get();
      if (!account) {
        return;
      }
      if (!files.length) {
        set({ songs: [], loading: false, metadataLoading: false, metadataWarning: null });
        return;
      }
      libraryRequest?.abort();
      const request = new AbortController();
      libraryRequest = request;
      const generation = get().generation;
      set({ loading: true, error: null, metadataLoading: false, metadataWarning: null });
      let enriching = false;
      const isCurrent = () =>
        current(generation) && libraryRequest === request && !request.signal.aborted;
      try {
        enriching = await refreshDriveLibrary(
          account.id,
          files,
          (rejected) => get().accessToken(account.id, rejected),
          request.signal,
          {
            isCurrent,
            onSongs: (songs, missing) =>
              set({
                songs,
                loading: false,
                metadataLoading: true,
                error: missing
                  ? `${missing}개 음악 파일이 삭제되었거나 접근할 수 없습니다. 선택 목록을 편집하거나 Google에서 다시 선택해 주세요.`
                  : null,
              }),
            onMetadata: (songs) => {
              set({ songs });
              usePlaybackStore.setState((state) => ({
                queue: mergeDriveQueueMetadata(
                  state.queue,
                  songs,
                  useSongMetadataStore.getState().patches,
                ),
              }));
            },
            onWarning: (metadataWarning) => set({ metadataWarning }),
            onSettled: () => {
              libraryRequest = null;
              set({ metadataLoading: false });
            },
          },
        );
      } catch (error) {
        if (current(generation) && libraryRequest === request && !request.signal.aborted) {
          set({ error: googleConnectionError(error) });
        }
        if (!request.signal.aborted) {
          throw error;
        }
      } finally {
        if (!enriching && current(generation) && libraryRequest === request) {
          libraryRequest = null;
          set({ loading: false });
        }
      }
    },
  };
});
export async function driveSource(song: Song, refreshToken = false) {
  if (song.source !== 'drive') {
    throw new Error('Google Drive 곡이 아닙니다.');
  }
  if (song.drive.documentUri) {
    return (await import('@/stores/drive-documents')).driveDocumentSource(song);
  }
  const { fileId, accountId } = song.drive;
  const selected = () =>
    useGoogleDriveStore.getState().account?.id === accountId &&
    useGoogleDriveStore.getState().files.some((file) => file.id === fileId);
  if (!selected()) {
    throw new Error(
      'Google 계정 또는 선택한 음악 파일이 변경되었습니다. 설정에서 다시 선택해 주세요.',
    );
  }
  const token = (rejected?: string) =>
    useGoogleDriveStore.getState().accessToken(accountId, rejected);
  if (refreshToken) {
    await token(await token());
  }
  const info = await driveJson(
    'https://www.googleapis.com/drive/v3/files/' +
      encodeURIComponent(fileId) +
      '?fields=id,trashed,capabilities(canDownload)',
    token,
  );
  if (!info || typeof info !== 'object' || !('id' in info) || info.id !== fileId) {
    throw new Error('Google Drive 파일 정보를 확인할 수 없습니다.');
  }
  if (
    ('trashed' in info && info.trashed === true) ||
    ('capabilities' in info &&
      info.capabilities &&
      typeof info.capabilities === 'object' &&
      'canDownload' in info.capabilities &&
      info.capabilities.canDownload === false)
  ) {
    throw new Error('Google Drive 파일이 삭제되었거나 다운로드 권한이 없습니다.');
  }
  const accessToken = await token();
  if (!selected()) {
    throw new Error('Google 계정 또는 선택한 음악 파일이 변경되었습니다. 다시 곡을 선택해 주세요.');
  }
  return { uri: driveMediaUrl(fileId), headers: { Authorization: 'Bearer ' + accessToken } };
}
