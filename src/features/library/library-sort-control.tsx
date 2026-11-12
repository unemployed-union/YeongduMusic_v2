import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PlaylistSheet } from '@/features/playlists/dialogs';
import { useColors } from '@/theme/tokens';
import type { LibraryTab } from './library-page';
import type { LibrarySortOrder } from './sort-library';
import { useLiquidGlass } from '@/theme/liquid-glass';
import { GlassBackdrop } from '@/components/glass-backdrop';
import { glassControlStyles } from '@/components/glass-controls';
import {
  SORT_LABELS as labels,
  SORT_TAB_LABELS as tabLabels,
  SORT_ORDERS as orders,
  librarySortFieldLabel,
} from './library-sort-options';

export type LibrarySortControlProps = {
  tab: LibraryTab;
  order: LibrarySortOrder;
  onChange: (order: LibrarySortOrder) => void;
};

export function LibrarySortControl({ tab, order, onChange }: LibrarySortControlProps) {
  const colors = useColors();
  const glass = useLiquidGlass();
  const [open, setOpen] = useState(false);
  const sortFieldLabel = librarySortFieldLabel(tab);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tabLabels[tab] + ' 정렬: ' + labels[order]}
        onPress={() => setOpen(true)}
        style={[
          styles.trigger,
          glass.supported && [
            glassControlStyles.button,
            { backgroundColor: glass.enabled ? 'transparent' : colors.surface },
          ],
        ]}
      >
        {glass.enabled && <GlassBackdrop style={{ borderRadius: 22 }} />}
        <Ionicons name="swap-vertical-outline" size={18} color={colors.tint} />
        <Text style={{ color: colors.tint, fontWeight: '700' }}>{labels[order]}</Text>
      </Pressable>
      <PlaylistSheet title={tabLabels[tab] + ' 정렬'} visible={open} onClose={() => setOpen(false)}>
        <View style={styles.body}>
          <Text style={{ color: colors.muted }}>{sortFieldLabel} 기준으로 정렬합니다.</Text>
          {tab === 'favorites' && (
            <Text style={{ color: colors.muted }}>기본 정렬은 최근 좋아요한 순서입니다.</Text>
          )}
          {orders.map((value) => (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ checked: order === value }}
              onPress={() => {
                onChange(value);
                setOpen(false);
              }}
              style={styles.option}
            >
              <Text style={{ flex: 1, color: colors.text, fontWeight: '600' }}>
                {labels[value]}
              </Text>
              {order === value && <Ionicons name="checkmark" size={22} color={colors.tint} />}
            </Pressable>
          ))}
        </View>
      </PlaylistSheet>
    </>
  );
}
const styles = StyleSheet.create({
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 },
  body: { padding: 22, gap: 10 },
  option: { minHeight: 48, flexDirection: 'row', alignItems: 'center' },
});
