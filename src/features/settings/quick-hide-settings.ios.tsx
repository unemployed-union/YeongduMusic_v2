import { useHiddenFeatureAccess } from '@/stores/hidden-feature-access';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { Group } from '@expo/ui/swift-ui';
import { SettingsFeedback, SettingsNote, SettingsToggle } from './ios/controls';
import { SettingsLink } from './settings-ui';

export function QuickHideSettings() {
  const access = useHiddenFeatureAccess();
  const privacy = useHiddenMusicStore();
  const selected = privacy.profile.presets.find(
    (preset) => preset.id === privacy.profile.quickHidePresetId,
  );
  const allDisabled = !access.ready || access.quickHideMode === 'preset';
  const presetDisabled =
    !access.ready ||
    !privacy.ready ||
    access.quickHideMode === 'all' ||
    (!selected && access.quickHideMode !== 'preset');
  return (
    <Group>
      <SettingsToggle
        label="5번 눌러 전체 프리셋 숨기기"
        value={access.quickHideMode === 'all'}
        disabled={allDisabled}
        busy={access.busy}
        onChange={(value) => {
          void access.setQuickHideEnabled(value);
        }}
      />
      <SettingsToggle
        label="5번 눌러 특정 프리셋 숨기기"
        value={access.quickHideMode === 'preset'}
        disabled={presetDisabled}
        busy={access.busy || privacy.busy}
        onChange={(value) => {
          void access.setQuickHideMode(value ? 'preset' : 'off');
        }}
      />
      <SettingsLink
        title="빠른 숨기기 대상 선택"
        icon="options-outline"
        href="/settings/quick-hide-preset"
        disabled={!privacy.ready || !privacy.scope}
        busy={privacy.busy || access.busy}
      />
      {selected && <SettingsNote>{`선택한 음악 프리셋: ${selected.name}`}</SettingsNote>}
      <SettingsFeedback error={access.error} />
    </Group>
  );
}
