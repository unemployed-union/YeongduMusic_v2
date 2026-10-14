import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { AnimatedSwitch } from '@/components/animated-switch';
import { useColors } from '@/theme/tokens';
import { useLyricsTranslationStore } from '@/stores/lyrics-translation';
import { TRANSLATION_LANGUAGES, type TranslationOptions } from './translation-options';

export function TranslationLanguageControls({ options, disabled, onChange, dark = false }: {
  options: TranslationOptions; disabled: boolean; onChange: (options: TranslationOptions) => void; dark?: boolean;
}) {
  const colors = useColors();
  return <View style={styles.choices}>{(['source', 'target'] as const).map(field => <View key={field} style={styles.group}>
    <Text style={[styles.label, { color: dark ? '#FFFFFFBB' : colors.muted }]}>{field === 'source' ? '원문 언어' : '번역 언어'}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.languages}>
      {TRANSLATION_LANGUAGES.map(language => { const selected = options[field] === language.code, blocked = disabled || field === 'target' && options.source === language.code;
        return <Pressable key={language.code} accessibilityRole="button" hitSlop={{ top: 4, bottom: 4 }} accessibilityLabel={`${field === 'source' ? '원문' : '번역'} 언어 ${language.label}`} accessibilityState={{ selected, disabled: blocked }} disabled={blocked}
          onPress={() => onChange(field === 'source' ? { source: language.code, target: language.code === options.target ? options.source : options.target } : { ...options, target: language.code })}
          style={[styles.language, { backgroundColor: selected ? dark ? '#FFFFFF30' : colors.tint : dark ? '#FFFFFF12' : colors.separator, opacity: blocked ? 0.4 : 1 }]}>
          <Text style={{ color: selected || dark ? 'white' : colors.text, fontSize: 12, fontWeight: '600' }}>{language.label}</Text>
        </Pressable>;
      })}
    </ScrollView>
  </View>)}</View>;
}
export function LyricsTranslationSettings() {
  const colors = useColors(), preferences = useLyricsTranslationStore(), load = preferences.load;
  useEffect(() => { void load(); }, [load]);
  const disabled = !preferences.ready || preferences.loading || preferences.saving || preferences.loadError;
  return <View style={styles.settings}>
    <View style={styles.toggle}><View style={{ flex: 1, gap: 6 }}>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>가사 번역 사용</Text>
      <Text style={[styles.note, { color: colors.muted }]}>끄면 가사 화면의 번역 메뉴와 번역 표시를 숨기고 진행 중인 번역을 중단합니다.</Text>
    </View><AnimatedSwitch accessibilityLabel="가사 번역 사용" value={preferences.enabled} disabled={disabled}
      onValueChange={value => void preferences.setEnabled(value).catch(() => {})} /></View>
    {preferences.enabled && <TranslationLanguageControls options={preferences.options} disabled={disabled}
      onChange={options => void preferences.save(options).catch(() => {})} />}
    <Text style={[styles.note, { color: colors.muted }]}>가사 화면에서 번역을 누르면 MyMemory로 가사 텍스트와 선택한 언어를 전송합니다. 번역은 원문 아래에 표시되며 원문 파일은 변경하지 않습니다. 원문 언어를 정확히 선택해 주세요. 인터넷 연결이 필요하며 무료 서비스는 하루 5,000자까지 사용할 수 있습니다.</Text>
    {preferences.loading && <ActivityIndicator color={colors.tint} />}
    {preferences.error && <Text accessibilityRole="alert" style={{ color: colors.tint }}>{preferences.error}</Text>}
    {preferences.loadError && <Pressable accessibilityRole="button" disabled={preferences.loading} onPress={() => void load(true)} style={styles.retry}><Text style={{ color: colors.tint }}>설정 다시 불러오기</Text></Pressable>}
  </View>;
}
const styles = StyleSheet.create({ settings: { padding: 15, gap: 14 }, choices: { gap: 8 }, group: { gap: 5 }, label: { fontSize: 12, fontWeight: '600' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  languages: { gap: 6 }, language: { minHeight: 36, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 12, lineHeight: 19 }, retry: { minHeight: 44, justifyContent: 'center' } });
