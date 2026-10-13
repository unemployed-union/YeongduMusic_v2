import { useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ScrollEdgeFade } from '@/components/scroll-edge-fade';
import { useColors } from '@/theme/tokens';
import notices from '@/assets/legal/notices.json';

export default function LicensesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [term, setTerm] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const entries = useMemo(() => notices.entries.filter(entry => (entry.platform === 'all' || entry.platform === Platform.OS)
    && `${entry.name} ${entry.license}`.toLocaleLowerCase().includes(term.trim().toLocaleLowerCase())), [term]);
  return <View style={[styles.fill, { backgroundColor: colors.background }]}>
    <View style={styles.search}>
      <Text style={[styles.intro, { color: colors.muted }]}>이 앱에 포함된 오픈소스 중 고지가 필요한 항목입니다. 항목을 열어 저작권 고지와 라이선스 전문을 확인할 수 있습니다.</Text>
      <TextInput accessibilityLabel="오픈소스 라이선스 검색" value={term} onChangeText={setTerm} autoCorrect={false}
        placeholder="이름 또는 라이선스 검색" placeholderTextColor={colors.muted}
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.separator, color: colors.text }]} />
    </View>
    <ScrollEdgeFade><FlatList data={entries} extraData={expanded} keyExtractor={entry => entry.id} style={styles.fill}
      contentContainerStyle={[styles.list, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      initialNumToRender={10} windowSize={5}
      ListEmptyComponent={<Text style={[styles.intro, { color: colors.muted }]}>검색 결과가 없습니다.</Text>}
      renderItem={({ item }) => <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${item.name} 라이선스`} accessibilityState={{ expanded: expanded === item.id }}
          onPress={() => setExpanded(current => current === item.id ? null : item.id)} style={styles.row}>
          <View style={styles.copy}><Text style={[styles.title, { color: colors.text }]}>{item.name}</Text>
            <Text style={[styles.meta, { color: colors.muted }]}>{[item.version, item.license].filter(Boolean).join(' · ')}</Text>
          </View><Ionicons name={expanded === item.id ? 'chevron-up' : 'chevron-down'} size={19} color={colors.muted} />
        </Pressable>
        {expanded === item.id && <View style={[styles.details, { borderTopColor: colors.separator }]}>
          {item.url && <Text selectable style={[styles.meta, { color: colors.tint }]}>{item.url}</Text>}
          {item.texts.map(id => <Text key={id} selectable style={[styles.license, { color: colors.text }]}>{notices.texts[id as keyof typeof notices.texts]}</Text>)}
        </View>}
      </View>} /></ScrollEdgeFade>
  </View>;
}
const styles = StyleSheet.create({
  fill: { flex: 1 }, search: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 12, gap: 12 },
  intro: { fontSize: 13, lineHeight: 20 }, input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: 46, fontSize: 14 },
  list: { paddingHorizontal: 22, paddingTop: 16 }, card: { borderWidth: 1, borderRadius: 15, overflow: 'hidden', marginBottom: 12 },
  row: { padding: 15, minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12 }, copy: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600' }, meta: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  details: { borderTopWidth: StyleSheet.hairlineWidth, padding: 15 }, license: { fontSize: 12, lineHeight: 19, marginTop: 14 },
});
