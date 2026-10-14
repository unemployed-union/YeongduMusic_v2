import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { TranslationLanguageControls } from './translation-settings';
import { translationLanguageName } from './translation-options';
import type { useLyricsTranslation } from './use-lyrics-translation';

export function LyricsTranslationControls({ translation }: { translation: ReturnType<typeof useLyricsTranslation> }) {
  const [expanded, setExpanded] = useState(false);
  const { preferences } = translation;
  const disabled = !preferences.ready || preferences.loading || preferences.saving || preferences.loadError;
  return <View style={styles.body}>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" hitSlop={{ top: 4, bottom: 4 }} accessibilityLabel={translation.loading ? '가사 번역 취소' : translation.lines ? translation.shown ? '번역 숨기기' : '번역 표시' : '가사 번역'} disabled={disabled && !translation.loading && !translation.lines}
        onPress={() => { if (translation.loading) translation.cancel(); else if (translation.lines) translation.setShown(!translation.shown); else void translation.start(); }} style={styles.button}>
        {translation.loading && <ActivityIndicator color="white" size="small" />}
        <Text style={styles.buttonText}>{translation.loading ? '번역 취소' : translation.lines ? translation.shown ? '원문만 보기' : '번역 표시' : translation.error ? '번역 다시 시도' : '번역'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" hitSlop={{ top: 4, bottom: 4 }} accessibilityLabel="가사 번역 언어 선택" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={styles.button}>
        <Text style={styles.buttonText}>{translationLanguageName(preferences.options.source)}{'  →  '}{translationLanguageName(preferences.options.target)}{'  '}{expanded ? '⌃' : '⌄'}</Text>
      </Pressable>
    </View>
    {expanded && <TranslationLanguageControls dark options={preferences.options} disabled={disabled}
      onChange={options => void preferences.save(options).catch(() => {})} />}
    {!translation.lines && !translation.loading && <Text style={styles.notice}>번역을 누르면 가사 텍스트가 MyMemory로 전송됩니다.</Text>}
    {translation.loading && <Text accessibilityLiveRegion="polite" style={styles.notice}>{translation.progress || '가사를 번역하고 있어요'}</Text>}
    {(translation.error || preferences.error) && <Text accessibilityRole="alert" style={styles.error}>{translation.error || preferences.error}</Text>}
    {preferences.loadError && <Pressable accessibilityRole="button" hitSlop={{ top: 4, bottom: 4 }} disabled={preferences.loading} onPress={() => void preferences.load(true)} style={styles.button}><Text style={styles.buttonText}>번역 설정 다시 불러오기</Text></Pressable>}
    {translation.shown && <Text style={styles.notice}>MyMemory 번역</Text>}
  </View>;
}
const styles = StyleSheet.create({ body: { gap: 5, marginBottom: 7 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  button: { minHeight: 36, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FFFFFF18' },
  buttonText: { color: 'white', fontSize: 12, fontWeight: '600' }, notice: { color: '#FFFFFF99', fontSize: 11, lineHeight: 16 }, error: { color: '#FFE2E7', fontSize: 12, lineHeight: 18 } });
