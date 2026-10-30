import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { SettingsLink, SettingsPage, SettingsSection } from '@/features/settings/settings-ui';
import { useHiddenFeatureAccess } from '@/stores/hidden-feature-access';
import { QuickHideSettings } from '@/features/settings/quick-hide-settings';

export default function OtherSettingsScreen() {
  const { ready, enabled, load } = useHiddenFeatureAccess();
  useEffect(() => {
    void load();
  }, [load]);
  if (!ready) {
    return <SettingsPage>{null}</SettingsPage>;
  }
  if (!enabled) {
    return <Redirect href="/settings" />;
  }
  return (
    <SettingsPage>
      <SettingsSection title="기타">
        <SettingsLink
          title="음악 숨기기"
          description="폴더·곡 프리셋과 암호·지문 잠금"
          icon="eye-off-outline"
          href="/hidden-music"
        />
        <SettingsLink
          title="플레이리스트 숨기기"
          description="숨길 목록 선택과 암호·지문 잠금"
          icon="list-outline"
          href="/hidden-playlists"
        />
        <QuickHideSettings />
      </SettingsSection>
    </SettingsPage>
  );
}
