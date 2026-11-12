import { SettingsFeedback, SettingsPicker, SettingsToggle } from '@/features/settings/ios/controls';
import { SettingsSection } from '@/features/settings/settings-ui';
import { playHaptic } from '@/services/haptics';
import { useHapticPreferences } from '@/stores/haptic-preferences';
import { Button, Group } from '@expo/ui/swift-ui';
import { disabled as unavailable } from '@expo/ui/swift-ui/modifiers';
import { useEffect } from 'react';
import { HAPTIC_EVENTS, HAPTIC_STRENGTHS } from './preferences';

export function HapticSettings() {
  const state = useHapticPreferences();
  const load = state.load;
  useEffect(() => {
    void load();
  }, [load]);
  const disabled = !state.ready || state.loading || state.loadError;
  return (
    <Group>
      <SettingsSection
        title="햅틱 피드백"
        nativeContent
        description="전체를 꺼도 동작별 설정은 유지됩니다. 실제 진동은 기기와 시스템 설정에 따라 달라질 수 있습니다."
      >
        <SettingsToggle
          label="햅틱 피드백 사용"
          value={state.preferences.enabled}
          disabled={disabled}
          busy={state.saving}
          haptics={false}
          onChange={(value) => {
            void state.setEnabled(value).catch(() => {});
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
      </SettingsSection>
      {HAPTIC_EVENTS.map((event) => {
        const preference = state.preferences.events[event.id];
        const blocked = disabled || !state.preferences.enabled;
        const strengthDisabled = blocked || state.saving || !preference.enabled;
        return (
          <SettingsSection
            key={event.id}
            title={event.title}
            nativeContent
            description={event.description}
          >
            <SettingsToggle
              label={`${event.title} 햅틱 사용`}
              value={preference.enabled}
              disabled={blocked}
              busy={state.saving}
              haptics={false}
              onChange={(enabled) => {
                void state.setEvent(event.id, { enabled }).catch(() => {});
              }}
            />
            <SettingsPicker
              label="강도"
              value={preference.strength}
              disabled={strengthDisabled}
              haptics={false}
              options={HAPTIC_STRENGTHS.map((strength) => ({
                value: strength.id,
                label: strength.label,
              }))}
              onChange={(strength) => {
                void state.setEvent(event.id, { strength }).catch(() => {});
              }}
            />
            <Button
              label="테스트"
              modifiers={[unavailable(strengthDisabled)]}
              onPress={() => {
                if (!strengthDisabled) {
                  playHaptic(event.id);
                }
              }}
            />
          </SettingsSection>
        );
      })}
    </Group>
  );
}
