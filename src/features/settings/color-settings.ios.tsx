import { useArtworkColors } from '@/features/playback/use-artwork-colors';
import { useAppearancePreferences } from '@/stores/appearance-preferences';
import {
  APPEARANCE_FIELDS,
  APPEARANCE_LABELS,
  parseColor,
  type AppearanceField,
} from '@/theme/appearance';
import { useColors } from '@/theme/tokens';
import { useMiniPlayerColors, usePlayerAccent } from '@/theme/use-player-colors';
import { Button, ColorPicker, Group, Text } from '@expo/ui/swift-ui';
import { disabled, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { useEffect, useState } from 'react';
import { COLOR_HINTS, COLOR_PRESETS, defaultColorLabel } from './color-options';
import { SettingsFeedback, SettingsNote, SettingsPicker } from './ios/controls';
import { SettingsPage, SettingsSection } from './settings-ui';

function ColorChoice({ field }: { field: AppearanceField }) {
  const state = useAppearancePreferences();
  const colors = useColors();
  const value = state.preferences[field];
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const blocked = !state.ready || state.loading || state.saving || state.loadError;
  const selection = draft ?? value ?? colors.tint;
  const options: { label: string; value: string }[] = COLOR_PRESETS.map(([label, value]) => ({
    label,
    value,
  }));
  if (!options.some((option) => option.value === selection)) {
    options.push({ label: '사용자 색상', value: selection });
  }
  async function save(color: string | null) {
    if (blocked) {
      return;
    }
    setError(null);
    try {
      await state.setColor(field, color === null ? null : parseColor(color));
      setDraft(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '색상을 저장하지 못했습니다.');
    }
  }
  return (
    <Group>
      <ColorPicker
        label="사용자 색상"
        selection={selection}
        supportsOpacity={false}
        modifiers={[disabled(blocked)]}
        onSelectionChange={(color) => {
          if (!blocked) {
            setDraft(color);
          }
        }}
      />
      <SettingsPicker
        label="기본 팔레트"
        value={selection}
        options={options}
        disabled={blocked}
        onChange={setDraft}
      />
      <Button
        label="색상 적용"
        modifiers={[disabled(blocked || draft === null)]}
        onPress={() => {
          void save(selection);
        }}
      />
      <Button
        label={defaultColorLabel(field)}
        modifiers={[disabled(blocked)]}
        onPress={() => {
          void save(null);
        }}
      />
      <SettingsNote>{value ? `현재 색상: ${value}` : defaultColorLabel(field)}</SettingsNote>
      <SettingsFeedback error={error} />
    </Group>
  );
}

export function ColorSettings() {
  const state = useAppearancePreferences();
  const load = state.load;
  const colors = useColors();
  const mini = useMiniPlayerColors();
  const background = useArtworkColors();
  const player = usePlayerAccent(background);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <SettingsPage>
      <SettingsSection
        title="미리보기"
        nativeContent
        description="색상을 적용하면 앱 화면에 바로 반영됩니다. 강조색의 밝기는 글자가 잘 보이도록 조정합니다."
      >
        <Text modifiers={[foregroundStyle(colors.tint)]}>앱 강조색</Text>
        <Text modifiers={[foregroundStyle(player.accent)]}>재생 화면 강조색</Text>
        <Text modifiers={[foregroundStyle(mini.tint)]}>미니 플레이어 강조색</Text>
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
      </SettingsSection>
      {APPEARANCE_FIELDS.map((field) => (
        <SettingsSection
          key={field}
          title={APPEARANCE_LABELS[field]}
          nativeContent
          description={COLOR_HINTS[field]}
        >
          <ColorChoice field={field} />
        </SettingsSection>
      ))}
    </SettingsPage>
  );
}
