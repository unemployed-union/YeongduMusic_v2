import { SettingsPage, SettingsSection } from '@/features/settings/settings-ui';
import { FolderExclusionSettings } from '@/features/library/folder-exclusion-settings';
import { AlbumDisplaySettings } from '@/features/library/album-display-settings';

export default function LibrarySettingsScreen() {
  return <SettingsPage>
    <SettingsSection title="앨범"><AlbumDisplaySettings /></SettingsSection>
    <SettingsSection title="이 기기"><FolderExclusionSettings /></SettingsSection>
  </SettingsPage>;
}
