import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useHiddenFeatureAccess } from '@/stores/hidden-feature-access';
import { createSettingsBackup, restoreSettingsBackup } from '@/services/settings-backup';
import { pickSettingsBackup, saveSettingsBackup } from './backup-files';
import type { SettingsBackup } from './backup-format';

export function useBackupSettings() {
  const access = useHiddenFeatureAccess();
  const loadAccess = access.load;
  useEffect(() => {
    void loadAccess();
  }, [loadAccess]);
  const [includeAccount, setIncludeAccount] = useState(false);
  const [restoreAccount, setRestoreAccount] = useState(false);
  const [selected, setSelected] = useState<{ name: string; backup: SettingsBackup } | null>(null);
  const selectedBlur = selected?.backup.preferences.blur;
  const selectedBlurEnabled = selectedBlur?.enabled ?? selected?.backup.preferences.blurEnabled;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const restoreAccountDisabled = busy || Platform.OS === 'web';
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
    void run(async () => {
      const text = await createSettingsBackup(access.enabled && includeAccount);
      const name = await saveSettingsBackup(text);
      if (name) {
        setMessage(
          Platform.OS === 'web'
            ? '백업 파일 다운로드를 요청했습니다.\n' + name
            : '선택한 폴더에 백업을 저장했습니다.\n' + name,
        );
      }
    });
  }
  function choose() {
    setSelected(null);
    setRestoreAccount(false);
    void run(async () => {
      const result = await pickSettingsBackup();
      if (result) {
        setSelected(result);
      }
    });
  }
  function restore() {
    if (!selected) {
      return;
    }
    void run(async () => {
      await restoreSettingsBackup(selected.backup, restoreAccount);
      setSelected(null);
      setRestoreAccount(false);
      setMessage('설정을 복구했습니다. 변경한 설정이 바로 적용됩니다.');
    });
  }
  let themeModePreview: string = '';
  if (selected) {
    if (selected.backup.preferences.themeMode === undefined) {
      themeModePreview = '현재 설정 유지';
    } else if (selected.backup.preferences.themeMode === 'dark') {
      themeModePreview = '다크';
    } else if (selected.backup.preferences.themeMode === 'light') {
      themeModePreview = '화이트';
    } else {
      themeModePreview = '자동';
    }
  }
  let playOnSeekPreview: string = '';
  if (selected) {
    if (selected.backup.preferences.playOnSeek === undefined) {
      playOnSeekPreview = '현재 설정 유지';
    } else if (selected.backup.preferences.playOnSeek) {
      playOnSeekPreview = '켬';
    } else {
      playOnSeekPreview = '끔';
    }
  }
  let albumGroupingPreview: string = '';
  if (selected) {
    if (selected.backup.preferences.groupAlbumsByTitle === undefined) {
      albumGroupingPreview = '현재 설정 유지';
    } else if (selected.backup.preferences.groupAlbumsByTitle) {
      albumGroupingPreview = '켬';
    } else {
      albumGroupingPreview = '끔';
    }
  }
  let blurPreview: string;
  if (selectedBlurEnabled === undefined) {
    blurPreview = '현재 설정 유지';
  } else if (selectedBlurEnabled) {
    blurPreview = '켬';
  } else {
    blurPreview = '끔';
  }
  return {
    access,
    includeAccount,
    setIncludeAccount,
    restoreAccount,
    setRestoreAccount,
    selected,
    setSelected,
    selectedBlur,
    busy,
    message,
    error,
    restoreAccountDisabled,
    backup,
    choose,
    restore,
    themeModePreview,
    playOnSeekPreview,
    albumGroupingPreview,
    blurPreview,
  };
}
