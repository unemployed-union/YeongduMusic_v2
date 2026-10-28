import { createConnectionTaskRunner } from '@/services/google-drive/connection-tasks';
import { createSerialQueue } from '@/services/async/serial-queue';
import { googleSignIn, googleConnectionError } from '@/services/google-drive/auth';
import { hasDriveFileGrant } from '@/services/google-drive/scopes';
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { DRIVE_SCOPE } from '@/services/google-drive/config';
import {
  driveJson,
  driveMediaUrl,
  loadDriveSongs,
  readDriveFile,
  type DriveFile,
} from '@/services/google-drive/api';
import type { Song } from '@/types/music';
import { enrichDriveSongs } from '@/services/google-drive/metadata';
import { usePlaybackStore } from '@/stores/playback';
import { useSongMetadataStore } from '@/stores/song-metadata';
import { applyMetadata, metadataKey } from '@/features/metadata/rules';
import { driveFileAccessToken, pickDriveFileIds } from '@/services/google-drive/picker';
import {
  loadDriveSelection,
  parseDriveSelection,
  saveDriveSelection,
} from '@/services/google-drive/selection';
const KEY = 'yeongdu-google-drive-v1';
type Account = { id: string; email: string };
type State = {
  ready: boolean;
  busy: boolean;
  loading: boolean;
  progress: string | null;
  account: Account | null;
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
  let cachedToken: {
    accountId: string;
    value: string;
    generation: number;
    savedAt: number;
  } | null = null;
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
    cachedToken = null;
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

  function saveAuth(generation: number, value: string) {
    return step(generation, '인증 정보 저장', async () => {
      await SecureStore.setItemAsync(KEY, value);
      // A write can complete after timeout/cancel. Cleanup stays inside the
      // barrier so it cannot delete credentials written by a newer connection.
      if (!current(generation)) await SecureStore.deleteItemAsync(KEY);
    });
  }
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
      if (!get().busy && !get().loading && !get().fileSaving && !get().metadataLoading) return;
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
      if (get().ready || get().busy) return;
      const generation = get().generation;
      set({ busy: true });
      try {
        await exclusive(async () => {
          const saved = await step(generation, '저장된 연결 확인', () =>
            SecureStore.getItemAsync(KEY),
          );
          if (!saved || !current(generation)) return;
          const account = JSON.parse(saved) as Account & { scope?: unknown };
          if (typeof account.id !== 'string' || typeof account.email !== 'string')
            throw new Error('Google 저장 정보를 확인할 수 없습니다. 다시 로그인해 주세요.');
          if (account.scope !== DRIVE_SCOPE)
            throw new Error(
              'Google Drive 접근 권한이 변경되었습니다. 다시 연결하고 음악 파일을 선택해 주세요.',
            );
          const files = await step(generation, '선택한 음악 확인', () =>
            loadDriveSelection(account.id),
          );
          const google = await step(generation, '로그인 준비', googleSignIn),
            response = await step(generation, '로그인 복원', () => google.signInSilently());
          if (!current(generation)) return;
          if (response.type !== 'success' || response.data.user.id !== account.id)
            throw new Error('Google 연결을 다시 로그인해 주세요.');
          if (!hasDriveFileGrant(response.data.scopes))
            throw new Error('Google Drive 선택 파일 권한으로 다시 연결해 주세요.');
          set({ account: { id: account.id, email: account.email }, files });
        });
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
        if (current(generation)) set({ ready: true, busy: false, progress: null });
      }
      if (current(generation) && get().account)
        await get()
          .refresh()
          .catch(() => {});
    },
    connect: async () => {
      const generation = begin();
      try {
        await exclusive(async () => {
          if (!current(generation)) return;
          const google = await step(generation, '로그인 준비', googleSignIn);
          await step(generation, 'Google Play 서비스 확인', () =>
            google.hasPlayServices({ showPlayServicesUpdateDialog: true }),
          );
          await step(generation, '이전 로그인 정리', () => google.signOut());
          await step(generation, '기기 연결 정보 정리', () => SecureStore.deleteItemAsync(KEY));
          if (!current(generation)) return;
          let response = await step(
            generation,
            '계정 선택 · 권한 승인',
            () => google.signIn(),
            120000,
          );
          if (!current(generation) || response.type !== 'success') return;
          if (!hasDriveFileGrant(response.data.scopes)) {
            // Old full-drive grants must not be silently reused after a scope downgrade.
            await step(generation, '이전 Drive 권한 철회', () => google.revokeAccess());
            await step(generation, '이전 로그인 정리', () => google.signOut());
            response = await step(generation, '선택 파일 권한 승인', () => google.signIn(), 120000);
            if (response.type !== 'success') return;
          }
          if (!hasDriveFileGrant(response.data.scopes))
            throw new Error('Google Drive 선택 파일 권한을 승인해 주세요.');
          const account = { id: response.data.user.id, email: response.data.user.email };
          const accessToken =
            Platform.OS === 'android'
              ? await step(
                  generation,
                  'Drive 접근 토큰 발급',
                  () => driveFileAccessToken(account.email),
                  60000,
                )
              : (await step(generation, 'Drive 접근 토큰 발급', () => google.getTokens(), 60000))
                  .accessToken;
          if (!accessToken)
            throw new Error('Google Drive 접근 토큰을 발급받지 못했습니다. 다시 연결해 주세요.');
          const files = await step(generation, '선택한 음악 확인', () =>
            loadDriveSelection(account.id),
          );
          if (!current(generation)) return;
          await saveAuth(
            generation,
            JSON.stringify({ ...account, scope: DRIVE_SCOPE, accessToken }),
          );
          cachedToken = {
            accountId: account.id,
            value: accessToken,
            generation,
            savedAt: Date.now(),
          };
          set({ account, files });
        });
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
        if (current(generation)) set({ busy: false, progress: null });
      }
      if (current(generation) && get().account)
        await get()
          .refresh()
          .catch(() => {});
    },
    disconnect: async () => {
      const generation = begin();
      try {
        await exclusive(async () => {
          if (!current(generation)) return;
          let storageFailed = false;
          try {
            await step(generation, '기기 인증 정보 삭제', () => SecureStore.deleteItemAsync(KEY));
          } catch {
            storageFailed = true;
          }
          if (!current(generation)) return;
          const google = await step(generation, '로그인 준비', googleSignIn);
          try {
            await step(generation, 'Google 권한 철회', () => google.revokeAccess());
          } catch {
            if (current(generation))
              set({
                error:
                  'Google 연결은 기기에서 해제했습니다. 온라인 권한 철회에 실패했으므로 Google 계정의 연결된 앱에서도 권한을 삭제해 주세요.',
              });
          } finally {
            await step(generation, 'Google 로그아웃', () => google.signOut());
          }
          if (storageFailed && current(generation))
            set({
              error: 'Google 인증 정보의 기기 삭제에 실패했습니다. 연결 해제를 다시 시도해 주세요.',
            });
        });
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
        if (current(generation)) set({ busy: false, progress: null });
      }
    },
    accessToken: async (accountId, rejectedToken) => {
      const generation = get().generation;
      return exclusive(async () => {
        const check = () => {
          if (!current(generation) || get().account?.id !== accountId)
            throw new Error('Google 계정 연결이 변경되었습니다. 다시 곡을 선택해 주세요.');
        };
        check();
        if (
          cachedToken &&
          cachedToken.accountId === accountId &&
          cachedToken.generation === generation &&
          Date.now() - cachedToken.savedAt < 45 * 60_000 &&
          cachedToken.value !== rejectedToken
        )
          return cachedToken.value;
        const google = await step(generation, '로그인 준비', googleSignIn);
        if (google.getCurrentUser()?.user.id !== accountId)
          throw new Error('Google 연결을 다시 로그인해 주세요.');
        if (rejectedToken)
          await step(generation, '만료된 토큰 정리', () =>
            google.clearCachedAccessToken(rejectedToken),
          );
        const user = google.getCurrentUser();
        if (!user || !hasDriveFileGrant(user.scopes))
          throw new Error('Google Drive 선택 파일 권한으로 다시 연결해 주세요.');
        const accessToken =
          Platform.OS === 'android'
            ? await step(generation, 'Drive 접근 토큰 발급', () =>
                driveFileAccessToken(user.user.email),
              )
            : (await step(generation, 'Drive 접근 토큰 발급', () => google.getTokens()))
                .accessToken;
        check();
        if (!accessToken)
          throw new Error('Google Drive 접근 토큰을 발급받지 못했습니다. 다시 연결해 주세요.');
        await saveAuth(
          generation,
          JSON.stringify({ ...get().account, scope: DRIVE_SCOPE, accessToken }),
        );
        cachedToken = { accountId, value: accessToken, generation, savedAt: Date.now() };
        check();
        return accessToken;
      });
    },
    pickFiles: async () => {
      const account = get().account,
        generation = get().generation;
      if (!account || get().busy || get().fileSaving || get().loading) return;
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
        if (current(generation)) set({ error: googleConnectionError(error) });
      } finally {
        if (current(generation)) set({ busy: false, progress: null });
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
      if (!account) throw new Error('Google Drive를 먼저 연결해 주세요.');
      if (get().busy || get().fileSaving)
        throw new Error('Google 파일 선택을 변경하고 있습니다. 잠시 후 다시 시도해 주세요.');
      const generation = get().generation,
        request = new AbortController();
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
          if (!isCurrent()) return;
          await step(generation, '선택한 음악 저장', () =>
            saveDriveSelection(account.id, selected, isCurrent),
          );
          if (!isCurrent()) return;
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
        if (isCurrent()) await get().refresh();
      } catch (error) {
        if (isCurrent()) {
          set({ error: googleConnectionError(error) });
          throw error;
        }
      } finally {
        if (fileRequest === request) {
          fileRequest = null;
          if (current(generation)) set({ fileSaving: false });
        }
      }
    },
    refresh: async () => {
      const { account, files } = get();
      if (!account) return;
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
        let missing = 0;
        const songs = await loadDriveSongs(
          account.id,
          files.map((file) => file.id),
          (rejected) => get().accessToken(account.id, rejected),
          request.signal,
          (ids) => {
            missing = ids.length;
          },
        );
        if (isCurrent()) {
          set({
            songs,
            loading: false,
            metadataLoading: true,
            error: missing
              ? `${missing}개 음악 파일이 삭제되었거나 접근할 수 없습니다. 선택 목록을 편집하거나 Google에서 다시 선택해 주세요.`
              : null,
          });
          enriching = true;
          // Publish the file list first. Tag reads must not block browsing or playback.
          void enrichDriveSongs(
            songs,
            (rejected) => get().accessToken(account.id, rejected),
            request.signal,
            (updated) => {
              if (!isCurrent()) return;
              set({ songs: updated });
              const metadata = new Map(updated.map((song) => [song.id, song]));
              // Refresh labels/artwork in the existing queue without reloading audio.
              usePlaybackStore.setState((state) => ({
                queue: state.queue.map((song) => {
                  const latest = metadata.get(song.id);
                  if (!latest || song.source !== 'drive') return song;
                  const key = metadataKey(latest, null);
                  return applyMetadata(
                    { ...latest, duration: latest.duration || song.duration },
                    key ? useSongMetadataStore.getState().patches[key] : undefined,
                  );
                }),
              }));
            },
          )
            .then((failures) => {
              if (isCurrent() && failures)
                set({
                  metadataWarning:
                    '일부 곡의 태그·앨범아트를 읽지 못했습니다. 음악 목록 다시 불러오기로 재시도할 수 있습니다.',
                });
            })
            .catch(() => {
              if (isCurrent())
                set({
                  metadataWarning:
                    '태그·앨범아트를 읽지 못했습니다. 음악 목록 다시 불러오기로 재시도해 주세요.',
                });
            })
            .finally(() => {
              if (isCurrent()) {
                libraryRequest = null;
                set({ metadataLoading: false });
              }
            });
        }
      } catch (error) {
        if (current(generation) && libraryRequest === request && !request.signal.aborted)
          set({ error: googleConnectionError(error) });
        if (!request.signal.aborted) throw error;
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
  if (song.source !== 'drive') throw new Error('Google Drive 곡이 아닙니다.');
  if (song.drive.documentUri)
    return (await import('@/stores/drive-documents')).driveDocumentSource(song);
  const { fileId, accountId } = song.drive;
  const selected = () =>
    useGoogleDriveStore.getState().account?.id === accountId &&
    useGoogleDriveStore.getState().files.some((file) => file.id === fileId);
  if (!selected())
    throw new Error(
      'Google 계정 또는 선택한 음악 파일이 변경되었습니다. 설정에서 다시 선택해 주세요.',
    );
  const token = (rejected?: string) =>
    useGoogleDriveStore.getState().accessToken(accountId, rejected);
  if (refreshToken) await token(await token());
  const info = await driveJson(
    'https://www.googleapis.com/drive/v3/files/' +
      encodeURIComponent(fileId) +
      '?fields=id,trashed,capabilities(canDownload)',
    token,
  );
  if (!info || typeof info !== 'object' || !('id' in info) || info.id !== fileId)
    throw new Error('Google Drive 파일 정보를 확인할 수 없습니다.');
  if (
    ('trashed' in info && info.trashed === true) ||
    ('capabilities' in info &&
      info.capabilities &&
      typeof info.capabilities === 'object' &&
      'canDownload' in info.capabilities &&
      info.capabilities.canDownload === false)
  )
    throw new Error('Google Drive 파일이 삭제되었거나 다운로드 권한이 없습니다.');
  const accessToken = await token();
  if (!selected())
    throw new Error('Google 계정 또는 선택한 음악 파일이 변경되었습니다. 다시 곡을 선택해 주세요.');
  return { uri: driveMediaUrl(fileId), headers: { Authorization: 'Bearer ' + accessToken } };
}
