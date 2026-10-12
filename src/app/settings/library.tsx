import { SettingsPage, SettingsSection } from '@/features/settings/settings-ui';
import { FolderExclusionSettings } from '@/features/library/folder-exclusion-settings';

export default function LibrarySettingsScreen() {
  return <SettingsPage><SettingsSection title="이 기기"><FolderExclusionSettings /></SettingsSection></SettingsPage>;
}
