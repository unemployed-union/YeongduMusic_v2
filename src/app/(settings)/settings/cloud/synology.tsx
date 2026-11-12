import { SettingsPage, SettingsNativeContent } from '@/features/settings/settings-ui';
import { SynologySettings } from '@/features/settings/synology-settings';

export default function SynologySettingsScreen() {
  return (
    <SettingsPage>
      <SettingsNativeContent>
        <SynologySettings />
      </SettingsNativeContent>
    </SettingsPage>
  );
}
