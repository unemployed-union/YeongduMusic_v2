import { useDisplayPreferences } from '@/stores/display-preferences';
import { useLibraryPreferences } from '@/stores/library-preferences';
import { useStreamingPreferences } from '@/stores/streaming-preferences';
import { useFolderExclusionStore } from '@/stores/folder-exclusions';
import { useHiddenFeatureAccess } from '@/stores/hidden-feature-access';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { usePlaylistStore } from '@/stores/playlists';
import { parseSettingsBackup, serializeSettingsBackup, type SettingsBackup } from '@/features/settings/backup-format';
import { withBackupOperation as exclusive } from './backup-operation';

async function prepare() {
  await Promise.all([useDisplayPreferences.getState().load(true), useLibraryPreferences.getState().load(true),
    useStreamingPreferences.getState().load(), useFolderExclusionStore.getState().load(true), useHiddenFeatureAccess.getState().load(true)]);
  const states = [useDisplayPreferences.getState(), useLibraryPreferences.getState(), useStreamingPreferences.getState(), useFolderExclusionStore.getState()];
  for (const state of states) {
    if (!state.ready || state.error) throw new Error(state.error ?? '설정을 먼저 불러와 주세요.');
    if (state.loading || state.saving) throw new Error('설정을 저장 중입니다. 잠시 후 다시 시도해 주세요.');
  }
}
function accountReady(scope: string) {
  const privacy = useHiddenMusicStore.getState(), playlists = usePlaylistStore.getState(), access = useHiddenFeatureAccess.getState();
  if (!privacy.ready || !playlists.ready || privacy.scope !== scope || playlists.scope !== scope) throw new Error('현재 로그인한 NAS 계정의 백업을 선택해 주세요. 서버 주소와 계정이 같아야 합니다.');
  if (privacy.busy || playlists.busy || access.busy) throw new Error('설정을 저장 중입니다. 잠시 후 다시 시도해 주세요.');
  if (access.error) throw new Error(access.error);
}
async function authorize(scope: string) {
  accountReady(scope);
  const privacy = useHiddenMusicStore.getState();
  if (privacy.profile.biometricLock && !privacy.unlocked) {
    await privacy.unlock();
    accountReady(scope);
    if (!useHiddenMusicStore.getState().unlocked) throw new Error('숨김 설정을 지문 또는 기기 암호로 먼저 열어 주세요.');
  }
}
function snapshot(includeAccount: boolean): SettingsBackup {
  const preferences: SettingsBackup['preferences'] = {
    hideArtwork: useDisplayPreferences.getState().hideArtwork,
    includeFolderAlbums: useLibraryPreferences.getState().includeFolderAlbums,
    quality: useStreamingPreferences.getState().quality,
    excludedFolders: [...useFolderExclusionStore.getState().folders],
  };
  const backup: SettingsBackup = { format: 'yeongdu-music-settings', version: 1, exportedAt: new Date().toISOString(), preferences };
  if (includeAccount) {
    const privacy = useHiddenMusicStore.getState(), access = useHiddenFeatureAccess.getState();
    if (!privacy.scope) throw new Error('프리셋을 백업할 NAS 계정에 먼저 로그인해 주세요.');
    accountReady(privacy.scope);
    backup.account = { scope: privacy.scope, hidden: privacy.profile, playlists: usePlaylistStore.getState().profile,
      access: { enabled: access.enabled, quickHideMode: access.quickHideMode } };
  }
  return parseSettingsBackup(serializeSettingsBackup(backup));
}
export async function createSettingsBackup(includeAccount = false): Promise<string> {
  return exclusive(async () => {
    try {
      await prepare();
      if (includeAccount) {
        if (!useHiddenFeatureAccess.getState().enabled) throw new Error('기타 설정을 먼저 활성화해 주세요.');
        const scope = useHiddenMusicStore.getState().scope;
        if (!scope) throw new Error('NAS 계정에 먼저 로그인해 주세요.');
        await authorize(scope);
        accountReady(scope);
      }
      return serializeSettingsBackup(snapshot(includeAccount));
    } finally { if (includeAccount) useHiddenMusicStore.getState().lock(); }
  });
}
async function checked(operation: () => Promise<void>, error: () => string | null) {
  await operation();
  const message = error();
  if (message) throw new Error(message);
}

/** Validate everything first, then compensate completed writes if a save fails. */
export async function restoreSettingsBackup(input: SettingsBackup, includeAccount: boolean): Promise<void> {
  return exclusive(async () => {
    const backup = parseSettingsBackup(serializeSettingsBackup(input));
    const account = includeAccount ? backup.account : undefined;
    const undo: (() => Promise<void>)[] = [];
    try {
      await prepare();
      if (account) { await authorize(account.scope); accountReady(account.scope); }
      const previous = snapshot(!!account);
      async function apply(operation: () => Promise<void>, rollback: () => Promise<void>) {
        undo.push(rollback);
        await operation();
        if (account) accountReady(account.scope);
      }
      if (account && previous.account) {
        const original = previous.account;
        // Authentication for enabling a new lock happens before the first profile write.
        await apply(() => useHiddenMusicStore.getState().restoreProfile(account.hidden, account.scope), () => useHiddenMusicStore.getState().restoreProfile(original.hidden, original.scope));
        await apply(() => usePlaylistStore.getState().restoreProfile(account.playlists, account.scope), () => usePlaylistStore.getState().restoreProfile(original.playlists, original.scope));
      }
      const display = useDisplayPreferences.getState(), library = useLibraryPreferences.getState(), streaming = useStreamingPreferences.getState(), folders = useFolderExclusionStore.getState();
      const hideArtwork = (value: boolean) => checked(() => display.setHideArtwork(value), () => useDisplayPreferences.getState().error);
      const folderAlbums = (value: boolean) => checked(() => library.setIncludeFolderAlbums(value), () => useLibraryPreferences.getState().error);
      await apply(() => hideArtwork(backup.preferences.hideArtwork), () => hideArtwork(previous.preferences.hideArtwork));
      await apply(() => folderAlbums(backup.preferences.includeFolderAlbums), () => folderAlbums(previous.preferences.includeFolderAlbums));
      await apply(() => streaming.setQuality(backup.preferences.quality), () => streaming.setQuality(previous.preferences.quality));
      await apply(() => folders.setFolders(backup.preferences.excludedFolders), () => folders.setFolders(previous.preferences.excludedFolders));
      if (account && previous.account) {
        const access = useHiddenFeatureAccess.getState(), original = previous.account.access;
        const mode = (value: typeof original.quickHideMode) => checked(() => access.setQuickHideMode(value), () => useHiddenFeatureAccess.getState().error);
        await apply(() => mode(account.access.quickHideMode), () => mode(original.quickHideMode));
        await apply(() => access.restoreEnabled(account.access.enabled), () => access.restoreEnabled(original.enabled));
      }
    } catch (cause) {
      let failed = false;
      for (const rollback of undo.reverse()) { try { await rollback(); } catch { failed = true; } }
      const message = cause instanceof Error ? cause.message : '설정을 복구하지 못했습니다.';
      if (failed) throw new Error(message + '\n일부 설정을 원래대로 되돌리지 못했습니다. 설정을 확인한 후 백업 파일로 다시 복구해 주세요.');
      throw new Error(message + (undo.length ? '\n기존 설정으로 되돌렸습니다.' : ''));
    } finally { if (account) useHiddenMusicStore.getState().lock(); }
  });
}
