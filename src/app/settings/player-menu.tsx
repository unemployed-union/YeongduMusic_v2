import { MenuLayoutSettings } from '@/features/settings/menu-layout-settings';
import { SettingsPage, SettingsSection } from '@/features/settings/settings-ui';

export default function PlayerMenuSettingsScreen() {
  return (
    <SettingsPage>
      <SettingsSection title="재생 화면 메뉴 순서 및 표시">
        <MenuLayoutSettings group="player" />
      </SettingsSection>
    </SettingsPage>
  );
}
