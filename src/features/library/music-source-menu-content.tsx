import type { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/text';
import { useColors } from '@/theme/tokens';
import { useLiquidGlass } from '@/theme/liquid-glass';
import {
  musicSourceLabels as labels,
  musicSourceIcons as sourceIcons,
} from '@/services/music-source';
import { SOURCE_CONNECTIONS, type MusicSourceMenuProps } from './music-source-menu-model';

function SourceSection({ title, children }: { title: string; children: ReactNode }) {
  const glass = useLiquidGlass();
  const colors = useColors();
  if (!glass.supported) {
    return <>{children}</>;
  }
  return (
    <View style={{ gap: 8 }}>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.muted,
          fontSize: 12,
          fontWeight: '600',
          paddingHorizontal: 12,
        }}
      >
        {title}
      </Text>
      <View style={[styles.group, { backgroundColor: colors.rowSelected }]}>{children}</View>
    </View>
  );
}

function SourceOption({
  icon,
  label,
  onPress,
  selected,
  disabled,
  legacyIcon = true,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  legacyIcon?: boolean;
}) {
  const glass = useLiquidGlass();
  const colors = useColors();
  const grouped = glass.supported;
  const selectable = selected !== undefined;
  const fontWeight = grouped || selectable ? '600' : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selectable ? { selected } : undefined}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => {
        let optionBackgroundColor: string;
        if (selected) {
          optionBackgroundColor = colors.tint + '22';
        } else if (pressed) {
          optionBackgroundColor = colors.rowPressed;
        } else {
          optionBackgroundColor = 'transparent';
        }
        return [
          styles.option,
          grouped && [
            styles.sourceOption,
            {
              backgroundColor: optionBackgroundColor,
              opacity: disabled ? 0.5 : 1,
            },
          ],
        ];
      }}
    >
      {(grouped || legacyIcon) && (
        <Ionicons
          accessible={false}
          name={icon}
          size={grouped ? 21 : 22}
          color={grouped && !selected ? colors.muted : colors.tint}
          style={grouped && styles.sourceIcon}
        />
      )}
      <Text
        style={{
          flex: grouped || selectable ? 1 : undefined,
          color: grouped && selected ? colors.tint : colors.text,
          fontWeight,
        }}
      >
        {label}
      </Text>
      {selected && <Ionicons accessible={false} name="checkmark" size={22} color={colors.tint} />}
    </Pressable>
  );
}

export function MusicSourceMenuContent({
  sources,
  selected,
  busy,
  error,
  setup,
  onSelect,
  onOpenConnection,
  onImport,
  onReload,
}: MusicSourceMenuProps) {
  const colors = useColors();
  const glass = useLiquidGlass();
  return (
    <ScrollView
      style={glass.supported && styles.scrollBody}
      contentInsetAdjustmentBehavior={glass.supported ? 'never' : undefined}
      contentContainerStyle={[styles.body, glass.supported && { padding: 16, gap: 20 }]}
    >
      <SourceSection title="음악 보관함">
        {sources.map((source) => (
          <SourceOption
            key={source}
            icon={sourceIcons[source]}
            label={labels[source]}
            legacyIcon={false}
            selected={selected === source}
            onPress={() => {
              onSelect(source);
            }}
          />
        ))}
      </SourceSection>
      {!glass.supported && (
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.separator }} />
      )}
      <SourceSection title="연결 관리">
        {SOURCE_CONNECTIONS.map((connection) => (
          <SourceOption
            key={connection.href}
            icon={connection.icon}
            label={connection.title}
            onPress={() => onOpenConnection(connection.href)}
          />
        ))}
      </SourceSection>
      {!glass.supported && <Text style={{ color: colors.muted }}>기기 음악 가져오기</Text>}
      <SourceSection title="기기 음악 가져오기">
        {Platform.OS === 'android' && (
          <SourceOption
            icon="phone-portrait-outline"
            label="기기의 음악 전체 가져오기"
            disabled={busy}
            onPress={() => onImport('device')}
          />
        )}
        {Platform.OS !== 'web' && (
          <SourceOption
            icon="folder-outline"
            label="폴더 선택 · 하위 폴더 포함"
            disabled={busy}
            onPress={() => onImport('folder')}
          />
        )}
        <SourceOption
          icon="document-outline"
          label="파일 선택"
          disabled={busy}
          onPress={() => onImport('files')}
        />
      </SourceSection>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        전체 가져오기는 Android에 등록된 오디오를 조회합니다. 누락된 파일은 폴더 선택으로 가져올 수
        있습니다. 원본은 유지하며 앱 저장 공간에 복사합니다.
      </Text>
      {error && (
        <Text selectable style={{ color: colors.tint }}>
          {error}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => {
          onReload();
        }}
        style={styles.option}
      >
        <Text style={{ color: colors.tint }}>저장된 음악 목록 다시 불러오기</Text>
      </Pressable>
      {setup && (
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenConnection('/connect')}
          style={styles.option}
        >
          <Text style={{ color: colors.tint }}>NAS 연결</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  body: { padding: 22, gap: 10 },
  option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  group: { borderRadius: 22, padding: 8, gap: 2 },
  sourceOption: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
  sourceIcon: { width: 24, textAlign: 'center', flexShrink: 0 },
  scrollBody: { flexShrink: 1, minHeight: 0 },
});
