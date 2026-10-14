import { MenuLayoutSettings } from '@/features/settings/menu-layout-settings';
import { SettingsPage, SettingsSection } from '@/features/settings/settings-ui';

export default function BottomMenuSettingsScreen() {
  return <SettingsPage><SettingsSection title="하단 메뉴 순서 및 표시"><MenuLayoutSettings group="bottom" /></SettingsSection></SettingsPage>;
}
