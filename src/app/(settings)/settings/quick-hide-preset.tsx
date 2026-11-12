import { HiddenSettingsGate } from '@/features/hidden-music/settings-gate';
import { QuickHidePresetSettings } from '@/features/settings/quick-hide-preset-settings';

export default function QuickHidePresetScreen() {
  return (
    <HiddenSettingsGate>
      <QuickHidePresetSettings />
    </HiddenSettingsGate>
  );
}
