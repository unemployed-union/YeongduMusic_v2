import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useHiddenFeatureAccess } from '@/stores/hidden-feature-access';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { usePlaylistStore } from '@/stores/playlists';
import { createPlaylistBackup, restorePlaylistBackup } from '@/services/playlists/backup';
import { pickPlaylistBackup, savePlaylistBackup } from './backup-files';
import { playlistStorageScope } from './rules';
import type { PlaylistBackup } from './backup-format';

export function usePlaylistBackupSettings() {
  const playlists = usePlaylistStore();
  const privacy = useHiddenMusicStore();
  const access = useHiddenFeatureAccess();
  const loadAccess = access.load;
  useEffect(() => {
    void loadAccess();
  }, [loadAccess]);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [selected, setSelected] = useState<{ name: string; backup: PlaylistBackup } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const running = useRef(false);
  const unavailable = !playlists.ready || !privacy.ready || playlists.scope !== privacy.scope;
  const disabled = busy || playlists.busy || privacy.busy || access.busy || unavailable;
  const wrongAccount =
    !!selected && selected.backup.scope !== playlistStorageScope(playlists.scope);
  const protectedRestore =
    !!selected &&
    (selected.backup.hiddenPlaylistIds.length > 0 ||
      selected.backup.playlists.presets.some((preset) =>
        privacy.profile.hiddenPlaylistIds?.includes(preset.id),
      ));
  const restoreDisabled =
    disabled ||
    wrongAccount ||
    (protectedRestore && (!access.ready || !access.enabled || access.busy));
  async function run(operation: () => Promise<void>) {
    if (running.current) {
      return;
    }
    running.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await operation();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : '작업을 완료하지 못했습니다. 다시 시도해 주세요.',
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  function backup() {
    if (disabled) {
      return;
    }
    void run(async () => {
      const text = await createPlaylistBackup(
        !!playlists.scope && access.ready && access.enabled && includeHidden,
      );
      const name = await savePlaylistBackup(text);
      if (name) {
        setMessage(
          (Platform.OS === 'web'
            ? '백업 파일 다운로드를 요청했습니다.'
            : '선택한 폴더에 플레이리스트 백업을 저장했습니다.') +
            '\n' +
            name,
        );
      }
    });
  }
  function choose() {
    if (running.current) {
      return;
    }
    setSelected(null);
    void run(async () => {
      const result = await pickPlaylistBackup();
      if (result) {
        setSelected(result);
      }
    });
  }
  function restore() {
    if (!selected || restoreDisabled) {
      return;
    }
    void run(async () => {
      const count = await restorePlaylistBackup(selected.backup);
      setSelected(null);
      setMessage(`플레이리스트 ${count}개를 복구했습니다.`);
    });
  }
  return {
    playlists,
    privacy,
    access,
    includeHidden,
    setIncludeHidden,
    selected,
    setSelected,
    busy,
    error,
    message,
    unavailable,
    disabled,
    wrongAccount,
    protectedRestore,
    restoreDisabled,
    backup,
    choose,
    restore,
  };
}
