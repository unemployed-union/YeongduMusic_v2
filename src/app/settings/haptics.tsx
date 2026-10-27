import { isIosSystemSettingsAvailable } from '@/features/settings/ios-system-settings';
import { IosSystemSettingsLink } from '@/features/settings/ios-system-settings-link';
import { SettingsPage } from '@/features/settings/settings-ui';
import { HapticSettings } from '@/features/haptics/haptic-settings';

export default function HapticsSettingsScreen() {
  return <SettingsPage>{isIosSystemSettingsAvailable ? <IosSystemSettingsLink /> : <HapticSettings />}</SettingsPage>;
}
