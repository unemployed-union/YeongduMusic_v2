import { MenuLayoutSettings } from '@/features/settings/menu-layout-settings';
import { SettingsPage, SettingsNativeContent } from '@/features/settings/settings-ui';

export default function PlayerMenuSettingsScreen() {
  return (
    <SettingsPage reordering>
      <SettingsNativeContent>
        <MenuLayoutSettings group="player" />
      </SettingsNativeContent>
    </SettingsPage>
  );
}
