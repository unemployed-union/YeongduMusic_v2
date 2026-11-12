import { SettingsFeedback, SettingsNote, SettingsToggle } from '@/features/settings/ios/controls';
import { SettingsField } from '@/features/settings/ios/field';
import { Button, DisclosureGroup, Group } from '@expo/ui/swift-ui';
import { disabled as unavailable } from '@expo/ui/swift-ui/modifiers';
import { metadataKey } from './rules';
import { useWebMetadataSettings } from './use-web-metadata-settings';

export function WebMetadataSettings() {
  const state = useWebMetadataSettings();
  const { preferences, disabled, load } = state;
  return (
    <Group>
      <SettingsToggle
        label="웹 곡 정보 자동 적용"
        value={preferences.enabled}
        disabled={disabled}
        busy={preferences.saving}
        onChange={(value) => {
          void preferences.setEnabled(value).catch(() => {});
        }}
      />
      {preferences.status && <SettingsNote>{preferences.status}</SettingsNote>}
      <SettingsFeedback
        loading={preferences.loading}
        error={preferences.error || preferences.automaticError}
        disabled={preferences.loading || preferences.saving}
        onRetry={
          preferences.loadError
            ? () => {
                void load(true);
              }
            : undefined
        }
      />
      {!preferences.loadError && (
        <Button
          label="자동 검색 다시 확인"
          modifiers={[unavailable(disabled || preferences.saving)]}
          onPress={() => {
            void preferences.retry().catch(() => {});
          }}
        />
      )}
      <DisclosureGroup
        label="곡별 자동 적용 제외"
        isExpanded={state.expanded}
        onIsExpandedChange={state.setExpanded}
      >
        <SettingsField
          label="제목·아티스트·앨범 검색"
          value={state.search}
          onChange={state.setSearch}
        />
        <SettingsFeedback
          loading={state.isPending}
          error={state.error ? '곡 목록을 불러오지 못했습니다. 보관함을 새로고침해 주세요.' : null}
        />
        {state.matching.slice(0, 30).map((song) => {
          const key = metadataKey(song, state.scope);
          return (
            <SettingsToggle
              key={key ?? song.id}
              label={`${song.title} · ${song.artist}`}
              value={!!key && !!preferences.excluded[key]}
              disabled={disabled || !key}
              busy={preferences.saving}
              onChange={(value) => {
                if (key) {
                  void preferences.setExcluded(key, value).catch(() => {});
                }
              }}
            />
          );
        })}
        {!state.isPending && !state.matching.length && !state.error && (
          <SettingsNote>해당하는 곡이 없습니다.</SettingsNote>
        )}
      </DisclosureGroup>
    </Group>
  );
}
