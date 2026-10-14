import { SettingsPage, SettingsSection } from '@/features/settings/settings-ui';
import { FolderExclusionSettings } from '@/features/library/folder-exclusion-settings';
import { AlbumDisplaySettings } from '@/features/library/album-display-settings';
import { MenuLayoutSettings } from '@/features/settings/menu-layout-settings';
import { WebMetadataSettings } from '@/features/metadata/web-metadata-settings';

export default function LibrarySettingsScreen() {
  return <SettingsPage>
    <SettingsSection title="보관함 메뉴 순서 및 표시"><MenuLayoutSettings group="library" /></SettingsSection>
    <SettingsSection title="앨범"><AlbumDisplaySettings /></SettingsSection>
    <SettingsSection title="웹 메타데이터"><WebMetadataSettings /></SettingsSection>
    <SettingsSection title="이 기기"><FolderExclusionSettings /></SettingsSection>
  </SettingsPage>;
}
