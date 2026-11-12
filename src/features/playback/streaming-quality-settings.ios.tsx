import { SettingsFeedback, SettingsPicker } from '@/features/settings/ios/controls';
import { SettingsSection } from '@/features/settings/settings-ui';
import { useStreamingPreferences } from '@/stores/streaming-preferences';
import { useEffect } from 'react';

export function StreamingQualitySettings() {
  const state = useStreamingPreferences();
  const load = state.load;
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <SettingsSection
      title="스트리밍 음질"
      nativeContent
      description="NAS 음악에 적용됩니다. 원본은 무손실 품질을 유지하며 MP3 변환은 NAS의 기본 음질로 데이터 사용량을 줄입니다. 다음 재생부터 적용됩니다. 기기·Google Drive 등 다른 소스의 음악 파일은 변환하지 않습니다."
    >
      <SettingsPicker
        label="음질"
        value={state.quality}
        options={[
          { value: 'original', label: '원본' },
          { value: 'mp3', label: 'MP3 변환' },
        ]}
        disabled={!state.ready || state.loading || state.saving}
        onChange={(quality) => {
          void state.setQuality(quality).catch(() => {});
        }}
      />
      <SettingsFeedback
        loading={state.loading || state.saving}
        error={state.error}
        disabled={state.loading || state.saving}
        onRetry={() => {
          void load(true);
        }}
      />
    </SettingsSection>
  );
}
