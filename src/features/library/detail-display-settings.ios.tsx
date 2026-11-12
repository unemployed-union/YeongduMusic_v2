import { SettingsFeedback, SettingsToggle } from '@/features/settings/ios/controls';
import { useLibraryDetailPreferences } from '@/stores/library-detail-preferences';
import { Group } from '@expo/ui/swift-ui';
import { useEffect } from 'react';

export function DetailDisplaySettings() {
  const state = useLibraryDetailPreferences();
  const load = state.load;
  useEffect(() => {
    void load();
  }, [load]);
  const disabled = !state.ready || state.loading || state.loadError;
  return (
    <Group>
      <SettingsToggle
        label="아티스트 사진 가져오기"
        value={state.preferences.artistPhotos}
        disabled={disabled}
        busy={state.saving}
        onChange={(value) => {
          void state.setOption('artistPhotos', value).catch(() => {});
        }}
      />
      <SettingsToggle
        label="앨범아트 색상으로 상단 꾸미기"
        value={state.preferences.albumColors}
        disabled={disabled}
        busy={state.saving}
        onChange={(value) => {
          void state.setOption('albumColors', value).catch(() => {});
        }}
      />
      <SettingsFeedback
        loading={state.loading}
        error={state.error}
        disabled={state.loading || state.saving}
        onRetry={() => {
          void load(true);
        }}
      />
    </Group>
  );
}
