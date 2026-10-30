import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AnimatedSwitch } from '@/components/animated-switch';
import { Text } from '@/components/text';
import { useMenuPreferences } from '@/stores/menu-preferences';
import { useColors } from '@/theme/tokens';
import { MENU_LABELS, type MenuGroup } from './menu-layout';

export function MenuLayoutSettings({ group }: { group: MenuGroup }) {
  const colors = useColors();
  const preferences = useMenuPreferences();
  const load = preferences.load;
  useEffect(() => {
    void load();
  }, [load]);
  const items = preferences.layout[group];
  const busy = !preferences.ready || preferences.loading || preferences.saving;
  const unavailable = !preferences.ready || preferences.loading;
  const visibleCount = items.filter((item) => item.visible).length;
  return (
    <View>
      <Text style={[styles.hint, { color: colors.muted }]}>
        화살표로 순서를 바꾸고 스위치로 메뉴를 표시하거나 숨길 수 있습니다. 최소 하나의 메뉴는 켜져
        있어야 합니다.
      </Text>
      {items.map((item, index) => {
        let visibilityLabel: string;
        if (item.visible) {
          if (visibleCount === 1) {
            visibilityLabel = '표시 · 마지막 메뉴';
          } else {
            visibilityLabel = '표시';
          }
        } else {
          visibilityLabel = '숨김';
        }
        return (
          <View key={item.id} style={[styles.row, { borderTopColor: colors.separator }]}>
            <View style={styles.copy}>
              <Text style={[styles.title, { color: colors.text }]}>{MENU_LABELS[item.id]}</Text>
              <Text style={[styles.status, { color: colors.muted }]}>{visibilityLabel}</Text>
            </View>
            {([-1, 1] as const).map((direction) => {
              const disabled =
                unavailable || (direction === -1 ? index === 0 : index === items.length - 1);
              return (
                <Pressable
                  key={direction}
                  accessibilityRole="button"
                  accessibilityLabel={`${MENU_LABELS[item.id]} ${direction === -1 ? '앞으로' : '뒤로'} 이동`}
                  accessibilityState={{ disabled: disabled || preferences.saving }}
                  disabled={disabled || preferences.saving}
                  onPress={() => void preferences.move(group, item.id, direction)}
                  style={styles.arrow}
                >
                  <Ionicons
                    name={direction === -1 ? 'chevron-up' : 'chevron-down'}
                    size={22}
                    color={disabled ? colors.separator : colors.tint}
                  />
                </Pressable>
              );
            })}
            <AnimatedSwitch
              accessibilityLabel={`${MENU_LABELS[item.id]} 메뉴 표시`}
              value={item.visible}
              disabled={unavailable || (item.visible && visibleCount === 1)}
              busy={preferences.saving}
              onValueChange={(visible) => void preferences.setVisible(group, item.id, visible)}
              trackColor={{ false: colors.separator, true: colors.tint }}
            />
          </View>
        );
      })}
      {preferences.loading && (
        <ActivityIndicator
          color={colors.tint}
          accessibilityLabel="메뉴 설정 불러오는 중"
          style={styles.feedback}
        />
      )}
      {preferences.error && (
        <View style={styles.feedback}>
          <Text accessibilityRole="alert" style={{ color: colors.tint }}>
            {preferences.error}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void load(true)}
            style={styles.retry}
          >
            <Text style={{ color: colors.tint }}>다시 불러오기</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12, lineHeight: 18, padding: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  copy: { flex: 1, marginRight: 6 },
  title: { fontSize: 16, fontWeight: '600' },
  status: { fontSize: 12, marginTop: 4 },
  arrow: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  feedback: { padding: 15 },
  retry: { minHeight: 44, justifyContent: 'center' },
});
