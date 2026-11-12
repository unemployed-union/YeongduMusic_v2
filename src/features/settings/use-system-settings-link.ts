import { useState } from 'react';
import { Linking } from 'react-native';
import { playHaptic } from '@/services/haptics';
import { refreshIosSystemSettings, useIosSystemSettingsStatus } from './ios-system-settings';

export function useSystemSettingsLink() {
  const status = useIosSystemSettingsStatus();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openSettings() {
    if (busy) {
      return;
    }
    playHaptic('menu');
    setBusy(true);
    setError(null);
    void refreshIosSystemSettings()
      .then(() => Linking.openSettings())
      .catch(() =>
        setError('iOS 설정을 열지 못했습니다. 설정 앱에서 YeongduMusic을 선택해 주세요.'),
      )
      .finally(() => setBusy(false));
  }

  return {
    busy,
    error: error || status.error,
    syncError: !!status.error,
    openSettings,
    retry: () => void refreshIosSystemSettings(),
  };
}
