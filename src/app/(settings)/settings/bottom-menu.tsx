import { MenuLayoutSettings } from '@/features/settings/menu-layout-settings';
import { SettingsPage, SettingsNativeContent } from '@/features/settings/settings-ui';

export default function BottomMenuSettingsScreen() {
  return (
    <SettingsPage reordering>
      <SettingsNativeContent>
        <MenuLayoutSettings group="bottom" />
      </SettingsNativeContent>
    </SettingsPage>
  );
}
