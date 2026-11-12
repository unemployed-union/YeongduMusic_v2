import { SettingsFeedback, SettingsToggle } from '@/features/settings/ios/controls';
import { useLibraryPreferences } from '@/stores/library-preferences';
import { Group } from '@expo/ui/swift-ui';

export function AlbumDisplaySettings() {
  const state = useLibraryPreferences();
  const disabled = !state.ready || state.loading;
  return (
    <Group>
      <SettingsToggle
        label="앨범 제목만으로 묶기"
        value={state.groupAlbumsByTitle}
        disabled={disabled}
        busy={state.saving}
        onChange={(value) => {
          void state.setGroupAlbumsByTitle(value);
        }}
      />
      <SettingsToggle
        label="폴더를 앨범으로 표시"
        value={state.includeFolderAlbums}
        disabled={disabled}
        busy={state.saving}
        onChange={(value) => {
          void state.setIncludeFolderAlbums(value);
        }}
      />
      <SettingsFeedback
        loading={state.loading}
        error={state.error}
        disabled={disabled || state.saving}
        onRetry={() => {
          void state.load(true);
        }}
      />
    </Group>
  );
}
