import { useBlurPreferences } from '@/stores/blur-preferences';
import { useLiquidGlass } from '@/theme/liquid-glass';
import { Group, Slider } from '@expo/ui/swift-ui';
import { accessibilityLabel, disabled as unavailable } from '@expo/ui/swift-ui/modifiers';
import { useEffect, useRef, useState } from 'react';
import { BLUR_AREAS, BLUR_LABELS, type BlurArea } from './blur-preferences';
import { SettingsFeedback, SettingsNote, SettingsToggle } from './ios/controls';

function BlurAreaSettings({ area }: { area: BlurArea }) {
  const state = useBlurPreferences();
  const glass = useLiquidGlass(area);
  const value = state.areas[area];
  const [draft, setDraft] = useState<number | null>(null);
  const latest = useRef(value.intensity);
  const blocked = !state.ready || state.loading || state.loadError || state.saving;
  return (
    <Group>
      <SettingsToggle
        label={BLUR_LABELS[area]}
        value={value.enabled}
        disabled={blocked}
        onChange={(enabled) => {
          void state.setAreaEnabled(area, enabled).catch(() => {});
        }}
      />
      {!glass.supported && (
        <Slider
          value={draft ?? value.intensity}
          min={1}
          max={100}
          step={1}
          modifiers={[accessibilityLabel(`${BLUR_LABELS[area]} 블러 강도`), unavailable(blocked)]}
          onValueChange={(next) => {
            latest.current = next;
            setDraft(next);
          }}
          onEditingChanged={(editing) => {
            if (editing) {
              latest.current = draft ?? value.intensity;
            } else if (!blocked) {
              void state
                .setIntensity(area, Math.round(latest.current))
                .catch(() => {})
                .finally(() => setDraft(null));
            }
          }}
        />
      )}
    </Group>
  );
}

export function BlurSettings() {
  const state = useBlurPreferences();
  const load = state.load;
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Group>
      <SettingsNote>
        일반 음악 목록에는 블러를 적용하지 않습니다. 설정 시트에는 유리 효과가 적용되며 시스템 메뉴와
        탭 바의 효과는 iOS가 관리합니다.
      </SettingsNote>
      <SettingsToggle
        label="블러 효과 전체"
        value={state.enabled}
        disabled={!state.ready || state.loading || state.loadError}
        busy={state.saving}
        onChange={(value) => {
          void state.setEnabled(value).catch(() => {});
        }}
      />
      {BLUR_AREAS.map((area) => (
        <BlurAreaSettings key={area} area={area} />
      ))}
      <SettingsFeedback
        loading={state.loading}
        error={state.error}
        disabled={state.loading || state.saving}
        onRetry={
          state.loadError
            ? () => {
                void load(true);
              }
            : undefined
        }
      />
    </Group>
  );
}
