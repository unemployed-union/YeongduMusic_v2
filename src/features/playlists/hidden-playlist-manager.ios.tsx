import { SettingsFeedback, SettingsNote, SettingsToggle } from '@/features/settings/ios/controls';
import { SettingsField } from '@/features/settings/ios/field';
import { SettingsPage, SettingsSection } from '@/features/settings/settings-ui';
import { useState } from 'react';
import { useHiddenPlaylistManager } from './use-hidden-playlist-manager';

export function HiddenPlaylistManager() {
  const { privacy, store, error, run } = useHiddenPlaylistManager();
  const [search, setSearch] = useState('');
  const ready = store.ready && store.scope === privacy.scope;
  const matching = ready
    ? store.profile.presets.filter((item) =>
        item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
      )
    : [];
  return (
    <SettingsPage>
      <SettingsSection
        title="설정 잠금"
        nativeContent
        description="음악 숨기기와 잠금 설정을 공유합니다. 화면을 나가거나 앱을 백그라운드로 보내면 다시 잠깁니다."
      >
        <SettingsToggle
          label="지문 · 기기 암호로 설정 잠금"
          value={privacy.profile.biometricLock}
          disabled={privacy.busy}
          onChange={(value) => {
            void run(() => privacy.setBiometricLock(value));
          }}
        />
        <SettingsFeedback error={error || privacy.error} />
      </SettingsSection>
      <SettingsSection
        title="플레이리스트 숨기기"
        nativeContent
        description="선택한 목록은 플레이리스트 탭과 선택 메뉴에서 숨깁니다. 목록에 포함된 곡과 현재 재생은 유지됩니다. 목록은 한 번에 최대 100개까지 표시하며 이름으로 검색해 다른 항목을 찾을 수 있습니다."
      >
        <SettingsField label="플레이리스트 검색" value={search} onChange={setSearch} />
        {!ready ? (
          <SettingsFeedback
            loading={!store.error}
            error={store.error}
            onRetry={() => {
              void store.load(privacy.scope);
            }}
          />
        ) : (
          matching.slice(0, 100).map((item) => (
            <SettingsToggle
              key={item.id}
              label={item.name}
              value={privacy.profile.hiddenPlaylistIds?.includes(item.id) ?? false}
              disabled={privacy.busy}
              onChange={(value) => {
                void run(() => privacy.setPlaylistHidden(item.id, value));
              }}
            />
          ))
        )}
        {ready && !matching.length && <SettingsNote>표시할 플레이리스트가 없습니다.</SettingsNote>}
      </SettingsSection>
    </SettingsPage>
  );
}
