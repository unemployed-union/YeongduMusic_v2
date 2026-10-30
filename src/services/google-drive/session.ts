import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { googleSignIn } from '@/services/google-drive/auth';
import { DRIVE_SCOPE } from '@/services/google-drive/config';
import { hasDriveFileGrant } from '@/services/google-drive/scopes';
import { driveFileAccessToken } from '@/services/google-drive/picker';
import { loadDriveSelection } from '@/services/google-drive/selection';
import type { DriveFile } from '@/services/google-drive/api';
import type { createConnectionTaskRunner } from '@/services/google-drive/connection-tasks';

export type DriveAccount = { id: string; email: string };
const KEY = 'yeongdu-google-drive-v1';

interface Options {
  step: ReturnType<typeof createConnectionTaskRunner>['step'];
  isCurrent(generation: number): boolean;
  getAccount(): DriveAccount | null;
  onConnected(account: DriveAccount, files: DriveFile[]): void;
  onWarning(message: string): void;
}

export function createDriveSession({
  step,
  isCurrent: current,
  getAccount,
  onConnected,
  onWarning,
}: Options) {
  let cachedToken: {
    accountId: string;
    value: string;
    generation: number;
    savedAt: number;
  } | null = null;
  function saveAuth(generation: number, value: string) {
    return step(generation, '인증 정보 저장', async () => {
      await SecureStore.setItemAsync(KEY, value);
      // A write can complete after timeout/cancel. Cleanup stays inside the
      // barrier so it cannot delete credentials written by a newer connection.
      if (!current(generation)) {
        await SecureStore.deleteItemAsync(KEY);
      }
    });
  }

  return {
    clearToken() {
      cachedToken = null;
    },
    async restore(generation: number) {
      const saved = await step(generation, '저장된 연결 확인', () => SecureStore.getItemAsync(KEY));
      if (!saved || !current(generation)) {
        return;
      }
      const account = JSON.parse(saved) as DriveAccount & { scope?: unknown };
      if (typeof account.id !== 'string' || typeof account.email !== 'string') {
        throw new Error('Google 저장 정보를 확인할 수 없습니다. 다시 로그인해 주세요.');
      }
      if (account.scope !== DRIVE_SCOPE) {
        throw new Error(
          'Google Drive 접근 권한이 변경되었습니다. 다시 연결하고 음악 파일을 선택해 주세요.',
        );
      }
      const files = await step(generation, '선택한 음악 확인', () =>
        loadDriveSelection(account.id),
      );
      const google = await step(generation, '로그인 준비', googleSignIn);

      const response = await step(generation, '로그인 복원', () => google.signInSilently());
      if (!current(generation)) {
        return;
      }
      if (response.type !== 'success' || response.data.user.id !== account.id) {
        throw new Error('Google 연결을 다시 로그인해 주세요.');
      }
      if (!hasDriveFileGrant(response.data.scopes)) {
        throw new Error('Google Drive 선택 파일 권한으로 다시 연결해 주세요.');
      }
      onConnected({ id: account.id, email: account.email }, files);
    },
    async connect(generation: number) {
      if (!current(generation)) {
        return;
      }
      const google = await step(generation, '로그인 준비', googleSignIn);
      await step(generation, 'Google Play 서비스 확인', () =>
        google.hasPlayServices({ showPlayServicesUpdateDialog: true }),
      );
      await step(generation, '이전 로그인 정리', () => google.signOut());
      await step(generation, '기기 연결 정보 정리', () => SecureStore.deleteItemAsync(KEY));
      if (!current(generation)) {
        return;
      }
      let response = await step(generation, '계정 선택 · 권한 승인', () => google.signIn(), 120000);
      if (!current(generation) || response.type !== 'success') {
        return;
      }
      if (!hasDriveFileGrant(response.data.scopes)) {
        // Old full-drive grants must not be silently reused after a scope downgrade.
        await step(generation, '이전 Drive 권한 철회', () => google.revokeAccess());
        await step(generation, '이전 로그인 정리', () => google.signOut());
        response = await step(generation, '선택 파일 권한 승인', () => google.signIn(), 120000);
        if (response.type !== 'success') {
          return;
        }
      }
      if (!hasDriveFileGrant(response.data.scopes)) {
        throw new Error('Google Drive 선택 파일 권한을 승인해 주세요.');
      }
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
      if (!accessToken) {
        throw new Error('Google Drive 접근 토큰을 발급받지 못했습니다. 다시 연결해 주세요.');
      }
      const files = await step(generation, '선택한 음악 확인', () =>
        loadDriveSelection(account.id),
      );
      if (!current(generation)) {
        return;
      }
      await saveAuth(generation, JSON.stringify({ ...account, scope: DRIVE_SCOPE, accessToken }));
      cachedToken = {
        accountId: account.id,
        value: accessToken,
        generation,
        savedAt: Date.now(),
      };
      onConnected(account, files);
    },
    async disconnect(generation: number) {
      if (!current(generation)) {
        return;
      }
      let storageFailed = false;
      try {
        await step(generation, '기기 인증 정보 삭제', () => SecureStore.deleteItemAsync(KEY));
      } catch {
        storageFailed = true;
      }
      if (!current(generation)) {
        return;
      }
      const google = await step(generation, '로그인 준비', googleSignIn);
      try {
        await step(generation, 'Google 권한 철회', () => google.revokeAccess());
      } catch {
        if (current(generation)) {
          onWarning(
            'Google 연결은 기기에서 해제했습니다. 온라인 권한 철회에 실패했으므로 Google 계정의 연결된 앱에서도 권한을 삭제해 주세요.',
          );
        }
      } finally {
        await step(generation, 'Google 로그아웃', () => google.signOut());
      }
      if (storageFailed && current(generation)) {
        onWarning('Google 인증 정보의 기기 삭제에 실패했습니다. 연결 해제를 다시 시도해 주세요.');
      }
    },
    async accessToken(generation: number, accountId: string, rejectedToken?: string) {
      const check = () => {
        if (!current(generation) || getAccount()?.id !== accountId) {
          throw new Error('Google 계정 연결이 변경되었습니다. 다시 곡을 선택해 주세요.');
        }
      };
      check();
      if (
        cachedToken &&
        cachedToken.accountId === accountId &&
        cachedToken.generation === generation &&
        Date.now() - cachedToken.savedAt < 45 * 60_000 &&
        cachedToken.value !== rejectedToken
      ) {
        return cachedToken.value;
      }
      const google = await step(generation, '로그인 준비', googleSignIn);
      if (google.getCurrentUser()?.user.id !== accountId) {
        throw new Error('Google 연결을 다시 로그인해 주세요.');
      }
      if (rejectedToken) {
        await step(generation, '만료된 토큰 정리', () =>
          google.clearCachedAccessToken(rejectedToken),
        );
      }
      const user = google.getCurrentUser();
      if (!user || !hasDriveFileGrant(user.scopes)) {
        throw new Error('Google Drive 선택 파일 권한으로 다시 연결해 주세요.');
      }
      const accessToken =
        Platform.OS === 'android'
          ? await step(generation, 'Drive 접근 토큰 발급', () =>
              driveFileAccessToken(user.user.email),
            )
          : (await step(generation, 'Drive 접근 토큰 발급', () => google.getTokens())).accessToken;
      check();
      if (!accessToken) {
        throw new Error('Google Drive 접근 토큰을 발급받지 못했습니다. 다시 연결해 주세요.');
      }
      await saveAuth(
        generation,
        JSON.stringify({ ...getAccount(), scope: DRIVE_SCOPE, accessToken }),
      );
      cachedToken = { accountId, value: accessToken, generation, savedAt: Date.now() };
      check();
      return accessToken;
    },
  };
}
