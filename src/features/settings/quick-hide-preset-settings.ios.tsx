import { Button } from '@expo/ui/swift-ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { SettingsFeedback, SettingsNote, SettingsPicker, SettingsToggle } from './ios/controls';
import { SettingsField } from './ios/field';
import { SettingsPage, SettingsSection } from './settings-ui';
import { useQuickHidePresetSettings } from './use-quick-hide-preset-settings';

export function QuickHidePresetSettings() {
  const state = useQuickHidePresetSettings();
  const { privacy, playlists } = state;
  const [search, setSearch] = useState('');
  const matching = state.playlistsReady
    ? playlists.profile.presets.filter((item) =>
        item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
      )
    : [];
  return (
    <SettingsPage>
      <SettingsSection
        title="음악 숨김 프리셋"
        nativeContent
        description="특정 프리셋 숨기기에서 사용할 대상을 선택합니다. 선택만으로 음악을 숨기지는 않습니다."
      >
        <SettingsPicker
          label="선택한 프리셋"
          value={privacy.profile.quickHidePresetId ?? 'none'}
          options={[
            { value: 'none', label: '프리셋 선택', disabled: true },
            ...privacy.profile.presets.map((preset) => ({ value: preset.id, label: preset.name })),
          ]}
          disabled={privacy.busy || !privacy.profile.presets.length}
          onChange={(id) => {
            if (id !== 'none') {
              void state.select(id);
            }
          }}
        />
        {!privacy.profile.presets.length && (
          <Button label="음악 숨기기 열기" onPress={() => router.push('/hidden-music')} />
        )}
        <SettingsFeedback loading={privacy.busy} error={privacy.error} />
      </SettingsSection>
      <SettingsSection
        title="함께 숨길 플레이리스트"
        nativeContent
        description="전체·특정 프리셋 숨기기 모두에서 함께 숨길 목록을 선택합니다. 목록에 포함된 곡을 별도로 숨기지는 않습니다. 목록은 한 번에 최대 100개까지 표시하며 이름으로 검색해 다른 항목을 찾을 수 있습니다."
      >
        <SettingsField label="플레이리스트 검색" value={search} onChange={setSearch} />
        {state.playlistsReady &&
          matching.slice(0, 100).map((playlist) => (
            <SettingsToggle
              key={playlist.id}
              label={playlist.name}
              value={!!privacy.profile.quickHidePlaylistIds?.includes(playlist.id)}
              disabled={privacy.busy || playlists.busy}
              onChange={() => {
                void state.selectPlaylist(playlist.id);
              }}
            />
          ))}
        {state.playlistsReady && !matching.length && (
          <SettingsNote>
            표시할 플레이리스트가 없습니다. 플레이리스트 탭에서 목록을 만들 수 있습니다.
          </SettingsNote>
        )}
        {!state.playlistsReady && (
          <SettingsFeedback
            loading={!playlists.error}
            error={playlists.error}
            onRetry={() => {
              void playlists.load(privacy.scope);
            }}
          />
        )}
      </SettingsSection>
    </SettingsPage>
  );
}
