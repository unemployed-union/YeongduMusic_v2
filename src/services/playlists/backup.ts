import { useHiddenFeatureAccess } from '@/stores/hidden-feature-access';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { usePlaylistStore } from '@/stores/playlists';
import {
  mergePlaylistBackup,
  parsePlaylistBackup,
  serializePlaylistBackup,
  type PlaylistBackup,
} from '@/features/playlists/backup-format';
import { playlistStorageScope } from '@/features/playlists/rules';
import { withBackupOperation } from '../backup-operation';

function ready(scope?: string) {
  const playlists = usePlaylistStore.getState();
  const privacy = useHiddenMusicStore.getState();
  if (!playlists.ready || !privacy.ready || playlists.scope !== privacy.scope) {
    throw new Error('플레이리스트를 먼저 불러와 주세요.');
  }
  const storageScope = playlistStorageScope(playlists.scope);
  if (scope && storageScope !== scope) {
    throw new Error(
      '같은 보관함의 백업을 선택해 주세요. 기기 백업은 NAS 미연결 상태에서, NAS 백업은 같은 서버·NAS 계정에서 복구할 수 있습니다.',
    );
  }
  if (playlists.busy || privacy.busy) {
    throw new Error('저장 중입니다. 잠시 후 다시 시도해 주세요.');
  }
  return { playlists, privacy, scope: storageScope };
}

async function authorize(scope: string) {
  if (!ready(scope).playlists.scope) {
    throw new Error('숨긴 플레이리스트는 해당 NAS 계정에서 복구하거나 백업해 주세요.');
  }
  await useHiddenFeatureAccess.getState().load();
  const access = useHiddenFeatureAccess.getState();
  if (!access.ready || !access.enabled || access.busy) {
    throw new Error('숨긴 플레이리스트를 포함하려면 기타 설정을 먼저 활성화해 주세요.');
  }
  const { privacy } = ready(scope);
  if (privacy.profile.biometricLock && !privacy.unlocked) {
    await privacy.unlock();
  }
  const current = ready(scope);
  if (
    !useHiddenFeatureAccess.getState().enabled ||
    (current.privacy.profile.biometricLock && !current.privacy.unlocked)
  ) {
    throw new Error('플레이리스트 숨김 설정을 지문 또는 기기 암호로 먼저 열어 주세요.');
  }
}

export async function createPlaylistBackup(includeHidden = false): Promise<string> {
  return withBackupOperation(async () => {
    try {
      const scope = ready().scope;
      if (includeHidden) {
        await authorize(scope);
      }
      const { playlists, privacy } = ready(scope);
      const hidden = new Set(privacy.profile.hiddenPlaylistIds ?? []);
      const presets = playlists.profile.presets.filter(
        (preset) => includeHidden || !hidden.has(preset.id),
      );
      const backup: PlaylistBackup = {
        format: 'yeongdu-music-playlists',
        version: 1,
        exportedAt: new Date().toISOString(),
        scope,
        playlists: { version: 1, presets },
        hiddenPlaylistIds: includeHidden
          ? presets.filter((preset) => hidden.has(preset.id)).map((preset) => preset.id)
          : [],
      };
      return serializePlaylistBackup(parsePlaylistBackup(serializePlaylistBackup(backup)));
    } finally {
      if (includeHidden) {
        useHiddenMusicStore.getState().lock();
      }
    }
  });
}

export async function restorePlaylistBackup(input: PlaylistBackup): Promise<number> {
  return withBackupOperation(async () => {
    const backup = parsePlaylistBackup(serializePlaylistBackup(input));
    const initial = ready(backup.scope);
    const existingHidden = new Set(initial.privacy.profile.hiddenPlaylistIds ?? []);
    const protectedRestore =
      backup.hiddenPlaylistIds.length > 0 ||
      backup.playlists.presets.some((preset) => existingHidden.has(preset.id));
    let rollbackPrivacy: (() => Promise<void>) | undefined;
    try {
      if (protectedRestore) {
        await authorize(backup.scope);
      }
      const { playlists, privacy } = ready(backup.scope);
      const next = mergePlaylistBackup(playlists.profile, backup.playlists);
      const hiddenIds = [
        ...new Set([...(privacy.profile.hiddenPlaylistIds ?? []), ...backup.hiddenPlaylistIds]),
      ];
      if (hiddenIds.length !== (privacy.profile.hiddenPlaylistIds ?? []).length) {
        const original = privacy.profile;
        // Hide imported IDs before they enter the list, including on a fresh device.
        await privacy.restoreProfile({ ...original, hiddenPlaylistIds: hiddenIds }, backup.scope);
        rollbackPrivacy = () =>
          useHiddenMusicStore.getState().restoreProfile(original, backup.scope);
      }
      ready(backup.scope);
      const current = useHiddenMusicStore.getState();
      if (
        protectedRestore &&
        (!useHiddenFeatureAccess.getState().enabled ||
          (current.profile.biometricLock && !current.unlocked))
      ) {
        throw new Error('설정 화면이 잠겼습니다. 다시 인증해 주세요.');
      }
      await usePlaylistStore.getState().restoreProfile(next, playlists.scope);
      return backup.playlists.presets.length;
    } catch (cause) {
      if (rollbackPrivacy) {
        try {
          await rollbackPrivacy();
        } catch {
          throw new Error(
            (cause instanceof Error ? cause.message : '플레이리스트를 복구하지 못했습니다.') +
              '\n숨김 상태를 되돌리지 못했습니다. 숨김 설정을 확인한 후 다시 복구해 주세요.',
          );
        }
      }
      throw cause;
    } finally {
      if (protectedRestore) {
        useHiddenMusicStore.getState().lock();
      }
    }
  });
}
