import { isIosSystemSettingsAvailable } from '@/features/settings/ios-system-settings';
import { IosSystemSettingsLink } from '@/features/settings/ios-system-settings-link';
import {
  SettingsPage,
  SettingsSection,
  SettingsNativeContent,
} from '@/features/settings/settings-ui';
import { HapticSettings } from '@/features/haptics/haptic-settings';

export default function HapticsSettingsScreen() {
  return (
    <SettingsPage>
      <SettingsNativeContent>
        {isIosSystemSettingsAvailable ? (
          <SettingsSection title="iOS 설정" nativeContent>
            <IosSystemSettingsLink />
          </SettingsSection>
        ) : (
          <HapticSettings />
        )}
      </SettingsNativeContent>
    </SettingsPage>
  );
}
