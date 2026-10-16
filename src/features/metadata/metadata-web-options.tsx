import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { AnimatedSwitch } from '@/components/animated-switch';
import { Text } from '@/components/text';
import { useColors } from '@/theme/tokens';
import { useWebMetadataStore } from '@/stores/web-metadata';
import { searchWebMetadata } from '@/services/metadata/web-search';
import { candidateDraft, type MetadataCandidate } from './web-rules';
import type { MetadataDraft } from './rules';

export function MetadataWebOptions({ songKey, draft, onChange, disabled, onBusyChange }: {
  songKey: string | null; draft: MetadataDraft; onChange: (draft: MetadataDraft) => void; disabled: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const colors = useColors(), preferences = useWebMetadataStore();
  const [loading, setLoading] = useState(false), [results, setResults] = useState<MetadataCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);
  const controller = useRef<AbortController | null>(null), mounted = useRef(true);
  const load = preferences.load;
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  async function search() {
    if (disabled || controller.current) return;
    const current = new AbortController(); controller.current = current;
    setLoading(true); onBusyChange(true); setResults(null); setError(null); setNotice(null); setVisibleCount(20);
    try {
      const candidates = await searchWebMetadata(draft.title, draft.artist, current.signal);
      if (mounted.current) setResults(candidates);
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : '웹 곡 정보를 찾지 못했습니다.'); }
    finally { controller.current = null; if (mounted.current) { setLoading(false); onBusyChange(false); } }
  }
  return <View style={styles.body}>
    <Text style={[styles.note, { color: colors.muted }]}>MusicBrainz에서 현재 제목·아티스트로 검색합니다. 후보를 선택한 뒤 내용을 확인하고 저장해 주세요. 검색어만 전송하며 음원은 업로드하지 않습니다.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="웹에서 곡 정보 찾기" disabled={disabled || loading || !draft.title.trim()} onPress={() => void search()}
      style={[styles.button, { borderColor: colors.separator, opacity: disabled || loading ? 0.5 : 1 }]}>
      {loading ? <ActivityIndicator color={colors.tint} /> : <Text style={{ color: colors.tint, fontWeight: '600' }}>웹에서 곡 정보 찾기</Text>}
    </Pressable>
    {loading && <Pressable accessibilityRole="button" onPress={() => controller.current?.abort()} style={styles.button}><Text style={{ color: colors.muted }}>검색 취소</Text></Pressable>}
    {results?.length === 0 && <Text style={[styles.note, { color: colors.muted }]}>일치하는 후보가 없습니다. 아래 제목·아티스트를 수정한 뒤 다시 검색해 주세요.</Text>}
    {results?.slice(0, visibleCount).map(candidate => <Pressable key={candidate.id} accessibilityRole="button" disabled={disabled || loading}
      onPress={() => { onChange(candidateDraft(draft, candidate)); setResults(null); setNotice('검색한 정보를 채웠습니다. 내용을 확인하고 저장해 주세요.'); }}
      style={[styles.candidate, { borderColor: colors.separator }]}>
      <Text style={{ color: colors.text, fontWeight: '600' }}>{candidate.fields.title}</Text>
      <Text style={[styles.note, { color: colors.muted }]}>{candidate.fields.artist} · {candidate.fields.album || '앨범 정보 없음'}</Text>
      <Text style={[styles.note, { color: colors.muted }]}>{[candidate.fields.year && `${candidate.fields.year}년`, candidate.fields.trackNumber && `트랙 ${candidate.fields.trackNumber}`, candidate.fields.discNumber && `디스크 ${candidate.fields.discNumber}`, candidate.duration && `${Math.round(candidate.duration)}초`].filter(Boolean).join(' · ')}</Text>
    </Pressable>)}
    {results && results.length > visibleCount && <Pressable accessibilityRole="button" disabled={disabled || loading} onPress={() => setVisibleCount(count => count + 20)} style={styles.button}>
      <Text style={{ color: colors.tint }}>다른 후보 더 보기 ({visibleCount}/{results.length})</Text></Pressable>}
    {notice && <Text accessibilityLiveRegion="polite" style={[styles.note, { color: colors.tint }]}>{notice}</Text>}
    {error && <Text accessibilityRole="alert" style={{ color: colors.tint }}>{error}</Text>}
    <View style={styles.row}><View style={{ flex: 1, gap: 6 }}>
      <Text style={{ color: colors.text, fontWeight: '600' }}>이 곡 자동 적용 제외</Text>
      <Text style={[styles.note, { color: colors.muted }]}>켜면 이 곡은 자동으로 검색하거나 채우지 않습니다. 수동 검색은 계속 사용할 수 있습니다. 선택은 즉시 저장됩니다.</Text>
    </View><AnimatedSwitch accessibilityLabel="이 곡 자동 적용 제외" value={!!songKey && !!preferences.excluded[songKey]}
      disabled={disabled || loading || !songKey || !preferences.ready || preferences.loadError} busy={preferences.saving}
      onValueChange={value => { if (songKey) void preferences.setExcluded(songKey, value).catch(() => {}); }} /></View>
    {preferences.error && <><Text accessibilityRole="alert" style={{ color: colors.tint }}>{preferences.error}</Text>
      {preferences.loadError && <Pressable accessibilityRole="button" disabled={preferences.loading} onPress={() => void preferences.load(true)} style={styles.button}><Text style={{ color: colors.tint }}>웹 곡 정보 설정 다시 불러오기</Text></Pressable>}</>}
  </View>;
}
const styles = StyleSheet.create({ body: { gap: 12 }, note: { fontSize: 13, lineHeight: 20 }, row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  button: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 12 }, candidate: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 } });
