import { SettingsFeedback, SettingsToggle } from '@/features/settings/ios/controls';
import { useFavoriteDisplayPreferences } from '@/stores/favorite-display-preferences';
import { Group } from '@expo/ui/swift-ui';
import { useEffect } from 'react';
import { FAVORITE_DISPLAY_OPTIONS } from './display-options';

export function FavoriteDisplaySettings() {
  const state = useFavoriteDisplayPreferences();
  const load = state.load;
  useEffect(() => {
    void load();
  }, [load]);
  const disabled = !state.ready || state.loading || state.loadError;
  return (
    <Group>
      {FAVORITE_DISPLAY_OPTIONS.map((option) => (
        <SettingsToggle
          key={option.key}
          label={option.title}
          value={state.preferences[option.key]}
          disabled={disabled}
          busy={state.saving}
          onChange={(value) => {
            void state.setOption(option.key, value).catch(() => {});
          }}
        />
      ))}
      <SettingsFeedback
        loading={state.loading}
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
