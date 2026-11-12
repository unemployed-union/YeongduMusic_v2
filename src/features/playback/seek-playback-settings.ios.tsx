import { SettingsFeedback, SettingsToggle } from '@/features/settings/ios/controls';
import { usePlaybackPreferences } from '@/stores/playback-preferences';
import { Group } from '@expo/ui/swift-ui';
import { useEffect } from 'react';

export function SeekPlaybackSettings() {
  const state = usePlaybackPreferences();
  const load = state.load;
  useEffect(() => {
    void load();
  }, [load]);
  const disabled = !state.ready || state.loading || state.loadError;
  return (
    <Group>
      <SettingsToggle
        label="탐색 후 자동 재생"
        value={state.playOnSeek}
        disabled={disabled}
        busy={state.saving}
        onChange={(value) => {
          void state.setPlayOnSeek(value).catch(() => {});
        }}
      />
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
