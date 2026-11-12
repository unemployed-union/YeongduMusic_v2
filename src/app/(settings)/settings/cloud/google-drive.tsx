import { SettingsPage, SettingsNativeContent } from '@/features/settings/settings-ui';
import { GoogleDriveSettings } from '@/features/google-drive/settings';

export default function DriveSettingsScreen() {
  return (
    <SettingsPage>
      <SettingsNativeContent>
        <GoogleDriveSettings />
      </SettingsNativeContent>
    </SettingsPage>
  );
}
