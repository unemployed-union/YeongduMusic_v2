import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/text';
import { TextInput } from '@/components/text-input';
import { useAppearancePreferences } from '@/stores/appearance-preferences';
import {
  APPEARANCE_FIELDS,
  APPEARANCE_LABELS,
  foregroundColor,
  parseColor,
  type AppearanceField,
} from '@/theme/appearance';
import { useColors } from '@/theme/tokens';
import { useMiniPlayerColors, usePlayerAccent } from '@/theme/use-player-colors';
import { useArtworkColors } from '@/features/playback/use-artwork-colors';
import { SettingsPage, SettingsSection } from './settings-ui';

const presets = [
  ['로즈', '#E85D75'],
  ['오렌지', '#F29B4B'],
  ['골드', '#D9BC55'],
  ['그린', '#2AA58C'],
  ['블루', '#498FE7'],
  ['퍼플', '#9273D9'],
  ['슬레이트', '#64748B'],
  ['그레이', '#D3D6DE'],
] as const;
const hints: Record<AppearanceField, string> = {
  accent: '버튼·스위치·선택 표시와 재생 화면의 강조색에 적용합니다.',
  background: '보관함·설정 등의 배경을 선택한 색조로 꾸밉니다. 밝기는 다크·화이트 모드에 맞춥니다.',
  playerBackground: '앨범아트 색상 대신 선택한 색조의 어두운 그라데이션을 사용합니다.',
  miniAccent: '미니 플레이어의 재생 버튼과 진행 표시 색상을 따로 지정합니다.',
  miniBackground: '미니 플레이어의 배경을 별도 색조로 꾸밉니다. 블러 설정도 함께 적용됩니다.',
};
function ColorChoice({ field }: { field: AppearanceField }) {
  const colors = useColors();
  const state = useAppearancePreferences();
  const value = state.preferences[field];
  const disabled = !state.ready || state.loading || state.loadError;
  const blocked = disabled || state.saving;
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  let defaultLabel: string;
  if (field === 'playerBackground') {
    defaultLabel = '앨범아트 색상 사용';
  } else if (field.startsWith('mini')) {
    defaultLabel = '앱 색상 따르기';
  } else {
    defaultLabel = '기본 색상';
  }

  async function select(color: string | null) {
    if (blocked) {
      return;
    }
    setError(null);
    try {
      await state.setColor(field, color);
      setDraft('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '색상을 저장하지 못했습니다.');
    }
  }
  function apply() {
    try {
      void select(parseColor(draft));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '색상 코드를 확인해 주세요.');
    }
  }
  return (
    <View style={styles.choice}>
      <Text style={[styles.hint, { color: colors.muted }]}>{hints[field]}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${APPEARANCE_LABELS[field]} ${defaultLabel}`}
        accessibilityState={{ selected: value === null, disabled: blocked }}
        disabled={blocked}
        onPress={() => void select(null)}
        style={styles.reset}
      >
        <Ionicons
          name={value === null ? 'checkmark-circle' : 'refresh-outline'}
          size={20}
          color={colors.tint}
        />
        <Text style={{ color: colors.tint }}>{defaultLabel}</Text>
      </Pressable>
      <View style={styles.presets}>
        {presets.map(([label, color]) => (
          <Pressable
            key={color}
            accessibilityRole="button"
            accessibilityLabel={`${APPEARANCE_LABELS[field]} ${label}`}
            accessibilityState={{ selected: value === color, disabled: blocked }}
            disabled={blocked}
            onPress={() => void select(color)}
            style={styles.preset}
          >
            <View
              style={[
                styles.swatch,
                {
                  backgroundColor: color,
                  borderColor: value === color ? colors.text : colors.separator,
                },
              ]}
            >
              {value === color && (
                <Ionicons name="checkmark" size={20} color={foregroundColor(color)} />
              )}
            </View>
            <Text style={[styles.hint, { color: colors.text }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[styles.hint, { color: colors.muted }]}>
        {value ? `선택한 색상 ${value}` : defaultLabel}
      </Text>
      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel={`${APPEARANCE_LABELS[field]} 직접 입력`}
          placeholder="#RRGGBB"
          placeholderTextColor={colors.muted}
          value={draft}
          onChangeText={setDraft}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          editable={!blocked}
          onSubmitEditing={apply}
          style={[styles.input, { color: colors.text, borderColor: colors.separator }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${APPEARANCE_LABELS[field]} 코드 적용`}
          disabled={blocked || !draft.trim()}
          onPress={apply}
          style={styles.apply}
        >
          <Text style={{ color: colors.tint, fontWeight: '600' }}>적용</Text>
        </Pressable>
      </View>
      {error && (
        <Text accessibilityRole="alert" style={[styles.hint, { color: colors.tint }]}>
          {error}
        </Text>
      )}
    </View>
  );
}
export function ColorSettings() {
  const colors = useColors();
  const mini = useMiniPlayerColors();
  const background = useArtworkColors();
  const player = usePlayerAccent(background);
  const state = useAppearancePreferences();
  const load = state.load;
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <SettingsPage>
      <SettingsSection title="미리보기">
        <View style={[styles.preview, { backgroundColor: colors.background }]}>
          <View style={styles.previewRow}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>앱 화면</Text>
            <View style={[styles.badge, { backgroundColor: colors.tint }]}>
              <Text style={{ color: foregroundColor(colors.tint) }}>선택된 항목</Text>
            </View>
          </View>
          <LinearGradient colors={background} style={styles.playerPreview}>
            <Text style={styles.playerTitle}>재생 화면</Text>
            <View style={[styles.play, { backgroundColor: player.accent }]}>
              <Ionicons name="play" size={20} color={player.onAccent} />
            </View>
            <View style={[styles.track, { backgroundColor: player.accent }]} />
          </LinearGradient>
          <View
            style={[
              styles.miniPreview,
              { backgroundColor: mini.surface, borderColor: mini.chromeBorder },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: mini.text, fontWeight: '600' }}>미니 플레이어</Text>
              <Text style={[styles.hint, { color: mini.chromeMuted }]}>재생 버튼 · 진행 표시</Text>
            </View>
            <View style={[styles.play, { backgroundColor: mini.miniControl }]}>
              <Ionicons name="play" size={20} color={mini.tint} />
            </View>
          </View>
          <Text style={[styles.hint, { color: colors.muted }]}>
            강조색의 밝기는 글자가 잘 보이도록 조정합니다.
          </Text>
          {state.loading && <ActivityIndicator color={colors.tint} />}
          {state.loadError && (
            <View>
              <Text accessibilityRole="alert" style={{ color: colors.tint }}>
                {state.error}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void load(true)}
                style={styles.reset}
              >
                <Text style={{ color: colors.tint }}>색상 설정 다시 불러오기</Text>
              </Pressable>
            </View>
          )}
        </View>
      </SettingsSection>
      {APPEARANCE_FIELDS.map((field) => (
        <SettingsSection key={field} title={APPEARANCE_LABELS[field]}>
          <ColorChoice field={field} />
        </SettingsSection>
      ))}
    </SettingsPage>
  );
}
const styles = StyleSheet.create({
  choice: { padding: 16, gap: 12 },
  hint: { fontSize: 12, lineHeight: 18 },
  reset: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  preset: { minWidth: 54, minHeight: 64, alignItems: 'center', gap: 5 },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  apply: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  preview: { padding: 16, gap: 14 },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  badge: { padding: 9, borderRadius: 10 },
  playerPreview: { minHeight: 96, borderRadius: 12, padding: 14, gap: 10 },
  playerTitle: { color: '#FFFFFF', fontWeight: '600' },
  play: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  track: { width: '55%', height: 3, borderRadius: 2 },
  miniPreview: {
    minHeight: 68,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
