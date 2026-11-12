import { useThemePreferences } from '@/stores/theme-preferences';
import { Group } from '@expo/ui/swift-ui';
import { useEffect } from 'react';
import { SettingsFeedback, SettingsPicker } from './ios/controls';

export function ThemeSettings() {
  const state = useThemePreferences();
  const load = state.load;
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Group>
      <SettingsPicker
        label="화면 모드"
        value={state.mode}
        disabled={!state.ready || state.loading || state.saving || state.loadError}
        options={[
          { value: 'auto', label: '시스템 설정' },
          { value: 'light', label: '라이트' },
          { value: 'dark', label: '다크' },
        ]}
        onChange={(mode) => {
          void state.setMode(mode).catch(() => {});
        }}
      />
      <SettingsFeedback
        loading={state.loading || state.saving}
        error={state.error}
        disabled={state.loading || state.saving}
        onRetry={
          state.loadError
            ? () => {
                void load(true);
              }
            : undefined
        }
      />
    </Group>
  );
}
