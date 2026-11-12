import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/text';
import { GlassBackdrop } from '@/components/glass-backdrop';
import { glassControlStyles } from '@/components/glass-controls';
import { useColors } from '@/theme/tokens';
import { useLiquidGlass } from '@/theme/liquid-glass';
import { musicSourceIcons as sourceIcons } from '@/services/music-source';
import type { MusicSourceFilter } from '@/types/music';
export interface MusicSourceTriggerProps {
  selected: MusicSourceFilter;
  label: string;
  busy: boolean;
  onPress(): void;
}
export function MusicSourceTrigger({ selected, label, busy, onPress }: MusicSourceTriggerProps) {
  const colors = useColors();
  const glass = useLiquidGlass();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="음악 소스 및 가져오기 메뉴"
      onPress={onPress}
      style={[
        styles.trigger,
        glass.supported && [
          glassControlStyles.button,
          { backgroundColor: glass.enabled ? 'transparent' : colors.surface, flexShrink: 1 },
        ],
      ]}
    >
      {glass.enabled && <GlassBackdrop style={{ borderRadius: 22 }} />}
      <Ionicons name={sourceIcons[selected]} size={18} color={colors.tint} />
      <Text
        numberOfLines={glass.supported ? 1 : undefined}
        style={{
          color: colors.tint,
          fontWeight: '700',
          ...(glass.supported && { flexShrink: 1 }),
        }}
      >
        {label}
      </Text>
      <Ionicons name="chevron-down" size={16} color={colors.tint} />
      {busy && <ActivityIndicator color={colors.tint} />}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    minHeight: 40,
  },
});
