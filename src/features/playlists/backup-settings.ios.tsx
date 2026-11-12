import { SettingsFeedback, SettingsNote, SettingsToggle } from '@/features/settings/ios/controls';
import { SettingsPage, SettingsSection } from '@/features/settings/settings-ui';
import { Button, Text } from '@expo/ui/swift-ui';
import { disabled as unavailable } from '@expo/ui/swift-ui/modifiers';
import { usePlaylistBackupSettings } from './use-playlist-backup-settings';

export function PlaylistBackupSettings() {
  const state = usePlaylistBackupSettings();
  const { selected, disabled, busy } = state;
  return (
    <SettingsPage>
      <SettingsSection
        title="백업"
        nativeContent
        description="현재 보관함의 플레이리스트 이름과 곡 순서를 저장합니다. 음악 파일과 로그인 정보는 포함하지 않습니다. 숨긴 목록을 포함할 때 잠금이 설정되어 있으면 기기 인증이 필요합니다. NAS 백업은 같은 서버·계정에서 복구할 수 있습니다."
      >
        {!!state.playlists.scope && state.access.ready && state.access.enabled && (
          <SettingsToggle
            label="숨긴 플레이리스트 포함"
            value={state.includeHidden}
            disabled={disabled || state.access.busy}
            onChange={state.setIncludeHidden}
          />
        )}
        <Button
          label="플레이리스트 백업하기"
          modifiers={[unavailable(disabled)]}
          onPress={state.backup}
        />
        {state.unavailable && (
          <SettingsFeedback
            loading={!state.playlists.error && !state.privacy.error}
            error={state.playlists.error ?? state.privacy.error}
            disabled={busy || state.playlists.busy}
            onRetry={
              state.playlists.error
                ? () => {
                    void state.playlists.load(state.playlists.scope);
                  }
                : undefined
            }
          />
        )}
      </SettingsSection>
      <SettingsSection title="복구" nativeContent>
        <Button
          label="플레이리스트 백업 파일 선택"
          modifiers={[unavailable(busy)]}
          onPress={state.choose}
        />
      </SettingsSection>
      {selected && (
        <SettingsSection
          title={selected.name}
          nativeContent
          description="기존 목록은 유지하며 같은 목록의 이름과 곡 순서를 갱신합니다. 새로운 목록은 추가하고 이름이 겹치면 복구 번호를 붙입니다. 현재 숨김 상태와 백업에서 숨긴 목록은 유지합니다. 음악 파일은 다시 가져오거나 원래 보관함에 연결해야 표시됩니다."
        >
          <Text>{`백업 날짜: ${new Date(selected.backup.exportedAt).toLocaleString()}`}</Text>
          <Text>{`플레이리스트 ${selected.backup.playlists.presets.length}개 · 수록곡 ${selected.backup.playlists.presets.reduce((count, preset) => count + preset.songIds.length, 0)}곡`}</Text>
          {state.wrongAccount && (
            <SettingsNote>
              백업과 같은 보관함에서 복구해 주세요. 기기 백업은 NAS 미연결 상태에서, NAS 백업은 같은
              서버·계정에서 복구할 수 있습니다.
            </SettingsNote>
          )}
          {state.protectedRestore && (
            <SettingsNote>
              숨긴 플레이리스트가 포함되어 있습니다. 기타 설정을 활성화해야 하며 잠겨 있으면 기기
              인증이 필요합니다.
            </SettingsNote>
          )}
          <Button
            label="플레이리스트 복구하기"
            modifiers={[unavailable(state.restoreDisabled)]}
            onPress={state.restore}
          />
          <Button
            label="취소"
            modifiers={[unavailable(busy)]}
            onPress={() => {
              if (!busy) {
                state.setSelected(null);
              }
            }}
          />
        </SettingsSection>
      )}
      {(busy || state.error || state.message) && (
        <SettingsSection title="작업 상태" nativeContent>
          <SettingsFeedback loading={busy} error={state.error} />
          {state.message && <SettingsNote>{state.message}</SettingsNote>}
        </SettingsSection>
      )}
    </SettingsPage>
  );
}
