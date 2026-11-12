import { SettingsFeedback, SettingsToggle } from '@/features/settings/ios/controls';
import { SettingsSection } from '@/features/settings/settings-ui';
import { useDisplayPreferences } from '@/stores/display-preferences';

export function PlaybackOptionsSettings() {
  const state = useDisplayPreferences();
  return (
    <SettingsSection
      title="앨범아트"
      nativeContent
      description="앨범아트를 숨기면 앱의 이미지를 기본 그래픽으로 바꾸고 배경 색상을 고정합니다."
    >
      <SettingsToggle
        label="앨범아트 숨기기"
        value={state.hideArtwork}
        disabled={!state.ready || state.loading}
        busy={state.saving}
        onChange={(value) => {
          void state.setHideArtwork(value);
        }}
      />
      <SettingsFeedback
        loading={state.loading}
        error={state.error}
        disabled={state.loading || state.saving}
        onRetry={() => {
          void state.load(true);
        }}
      />
    </SettingsSection>
  );
}
