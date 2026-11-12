import { SETTINGS_DESCRIPTIONS } from '@/features/settings/settings-descriptions';
import {
  SettingsPage,
  SettingsSection,
  SettingsNativeContent,
} from '@/features/settings/settings-ui';
import { FolderExclusionSettings } from '@/features/library/folder-exclusion-settings';
import { AlbumDisplaySettings } from '@/features/library/album-display-settings';
import { MenuLayoutSettings } from '@/features/settings/menu-layout-settings';
import { WebMetadataSettings } from '@/features/metadata/web-metadata-settings';
import { DetailDisplaySettings } from '@/features/library/detail-display-settings';
import { FavoriteDisplaySettings } from '@/features/favorites/favorite-display-settings';

export default function LibrarySettingsScreen() {
  return (
    <SettingsPage reordering>
      <SettingsNativeContent>
        <MenuLayoutSettings group="library" />
      </SettingsNativeContent>
      <SettingsSection title="앨범" description={SETTINGS_DESCRIPTIONS.albumDisplay} nativeContent>
        <AlbumDisplaySettings />
      </SettingsSection>
      <SettingsSection
        title="상세 화면"
        description={SETTINGS_DESCRIPTIONS.detailDisplay}
        nativeContent
      >
        <DetailDisplaySettings />
      </SettingsSection>
      <SettingsSection
        title="좋아요 버튼 표시"
        description={SETTINGS_DESCRIPTIONS.favorites}
        nativeContent
      >
        <FavoriteDisplaySettings />
      </SettingsSection>
      <SettingsSection
        title="웹 메타데이터"
        description={SETTINGS_DESCRIPTIONS.webMetadata}
        nativeContent
      >
        <WebMetadataSettings />
      </SettingsSection>
      <SettingsSection
        title="이 기기"
        description={SETTINGS_DESCRIPTIONS.folderExclusions}
        nativeContent
      >
        <FolderExclusionSettings />
      </SettingsSection>
    </SettingsPage>
  );
}
