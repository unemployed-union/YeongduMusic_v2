import { LyricsEdgeFade } from './lyrics-edge-fade';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View, type ListRenderItem } from 'react-native';
import { Text } from '@/components/text';
import { createAnimatedComponent, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useActiveLyricIndex } from './use-active-lyric-index';
import { useLyricScroll } from './use-lyric-scroll';
import { useLyrics } from './use-lyrics';
import { useLyricsTranslation } from './use-lyrics-translation';
import { LyricsTranslationControls } from './lyrics-translation-controls';
import { LyricsTimingControls } from './lyrics-timing-controls';
import { useLyricTiming } from './use-lyric-timing';
import { lyricPlaybackTime } from './timing';
import { playHaptic } from '@/services/haptics';
import type { TranslatedLyrics } from '@/services/lyrics/translate-lyrics';
import { usePlaybackStore } from '@/stores/playback';
import { seek } from '@/services/playback/controller';
import type { LyricLine, LyricsSource } from '@/types/lyrics';
import type { Song } from '@/types/music';

const sources: { value: LyricsSource; label: string }[] = [
  { value: 'auto', label: '자동' }, { value: 'nas', label: 'NAS' }, { value: 'online', label: '온라인' },
];
const AnimatedRow = createAnimatedComponent(View);
const lyricKey = (line: LyricLine) => line.id;
// Wrap the native list directly to retain its measured CellRendererComponent.
const AnimatedLyricList = createAnimatedComponent(FlatList<LyricLine>);

const LyricRow = memo(function LyricRow({ line, active, past, synced, seekable, onSeek, translation }: {
  line: LyricLine; active: boolean; past: boolean; synced: boolean; seekable: boolean; onSeek: (time: number) => void; translation?: string;
}) {
  const level = synced ? active ? 1 : past ? 0.5 : 0.3 : 0.9;
  const opacity = useSharedValue(level), lastLevel = useRef(level);
  useEffect(() => {
    if (lastLevel.current === level) return;
    lastLevel.current = level;
    opacity.set(withTiming(level, { duration: 280, easing: Easing.inOut(Easing.quad) }));
  }, [level, opacity]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Pressable disabled={!seekable} accessibilityRole={seekable ? 'button' : 'text'} accessibilityLabel={translation ? `${line.text}\n${translation}` : line.text || '간주'} accessibilityHint={seekable ? '이 가사가 시작되는 위치로 이동' : undefined} accessibilityState={synced ? { selected: active } : undefined} onPress={() => { if (line.time !== null) onSeek(line.time); }} style={styles.row}>
    <AnimatedRow style={animatedStyle}>
      <Text style={styles.lyric}>{line.text || '···'}</Text>
      {!!translation && <Text style={styles.translation}>{translation}</Text>}
    </AnimatedRow>
  </Pressable>;
});

// Own the scrolling state per track/source so returning to the player starts
// at the current engine position, without briefly rendering another track.
const LyricLines = memo(function LyricLines({ lines, synced, translations, offsetMs = 0 }: { lines: LyricLine[]; synced: boolean; translations?: TranslatedLyrics; offsetMs?: number }) {
  const duration = usePlaybackStore((state) => state.duration);
  const buffering = usePlaybackStore((state) => state.buffering);
  const active = useActiveLyricIndex(lines, synced, offsetMs);
  const { listRef, following, resume, CellRenderer, onScroll, onLayout, onContentSizeChange, onScrollBeginDrag, onScrollToIndexFailed } = useLyricScroll(active, synced, translations);
  const [error, setError] = useState<string | null>(null);
  const seekToLine = useCallback((time: number) => {
    const target = lyricPlaybackTime(time, offsetMs);
    if (buffering || duration <= 0 || target > duration) return;
    playHaptic('seek');
    setError(null);
    void seek(target).then(resume).catch(() => setError('재생 위치를 변경하지 못했습니다. 다시 눌러 주세요.'));
  }, [buffering, duration, offsetMs, resume]);
  const extraData = useMemo(() => ({ active, duration, buffering, translations, offsetMs }), [active, duration, buffering, translations, offsetMs]);
  const renderItem = useCallback<ListRenderItem<LyricLine>>(({ item, index }) => <LyricRow line={item} translation={translations?.[item.id]} active={index === active} past={active >= 0 && index < active} synced={synced} seekable={synced && !buffering && duration > 0 && item.time !== null && lyricPlaybackTime(item.time, offsetMs) <= duration} onSeek={seekToLine} />,
    [active, buffering, duration, offsetMs, seekToLine, synced, translations]);
  return <View style={styles.lines}>
    <LyricsEdgeFade><AnimatedLyricList ref={listRef} data={lines} extraData={extraData} keyExtractor={lyricKey}
      showsVerticalScrollIndicator={false} initialNumToRender={10} windowSize={7} contentContainerStyle={styles.listContent}
      CellRendererComponent={CellRenderer} onScroll={onScroll} scrollEventThrottle={16}
      onLayout={onLayout} onContentSizeChange={onContentSizeChange}
      onScrollBeginDrag={onScrollBeginDrag} onScrollToIndexFailed={onScrollToIndexFailed}
      renderItem={renderItem}
    /></LyricsEdgeFade>
    {synced && !following && <Pressable accessibilityRole="button" onPress={resume} style={styles.follow}><Ionicons name="locate-outline" color="white" size={16} /><Text style={styles.followText}>현재 가사로</Text></Pressable>}
    {!!error && <Text style={styles.error}>{error}</Text>}
  </View>;
});

export function LyricsPanel({ song, source, onSourceChange }: { song: Song; source: LyricsSource; onSourceChange: (source: LyricsSource) => void }) {
  const duration = usePlaybackStore((state) => state.duration);
  const [searchOnline, setSearchOnline] = useState(false);
  const lyrics = useLyrics(song, source, duration, searchOnline);
  const findAgain = () => {
    if (lyrics.isFetching) return;
    if (source !== 'nas' && !searchOnline) setSearchOnline(true);
    else void lyrics.refetch();
  };
  const changeSource = (value: LyricsSource) => { if (value !== source) playHaptic('selection'); setSearchOnline(false); onSourceChange(value); };
  const data = lyrics.data;
  const timing = useLyricTiming(song, data?.kind === 'synced' ? data.provider : undefined);
  const translation = useLyricsTranslation(data, `${song.id}:${source}`);
  const sourceName = data?.provider === 'nas' ? 'NAS' : data?.provider === 'demo' ? '데모 가사' : 'LRCLIB';
  const lyricsKey = `${song.id}:${source}:${data?.provider}:${data?.kind}`;
  return <View style={styles.panel}>
    <View style={styles.header}><Text style={styles.heading}>가사</Text><Pressable accessibilityRole="button" accessibilityLabel="가사 다시 찾기" disabled={lyrics.isFetching} onPress={findAgain} style={styles.findAgain}>{lyrics.isFetching ? <ActivityIndicator color="white" size="small" /> : <Ionicons name="refresh-outline" size={20} color="white" />}</Pressable><View style={styles.sources}>{sources.map((option) => <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: source === option.value }} onPress={() => changeSource(option.value)} style={[styles.source, source === option.value && styles.selectedSource]}><Text style={[styles.sourceText, source === option.value && styles.selectedText]}>{option.label}</Text></Pressable>)}</View></View>
    {translation.enabled && data && (data.kind === 'synced' || data.kind === 'plain') && <LyricsTranslationControls translation={translation} />}
    {data?.kind === 'synced' && <LyricsTimingControls key={timing.key} timing={timing} />}
    {lyrics.isPending || lyrics.isFetching && (!data || data.kind === 'missing' || data.kind === 'instrumental') ? <View style={styles.message}><ActivityIndicator color="white" /><Text style={styles.messageText}>가사를 찾고 있어요</Text></View> : lyrics.isError && (!data || data.kind === 'missing' || data.kind === 'instrumental') ? <View style={styles.message}><Ionicons name="cloud-offline-outline" size={32} color="#FFFFFFAA" /><Text style={styles.messageText}>{lyrics.error instanceof Error ? lyrics.error.message : '가사를 불러오지 못했습니다.'}</Text><Pressable accessibilityRole="button" disabled={lyrics.isFetching} onPress={findAgain} style={styles.retry}><Text style={styles.retryText}>다시 시도</Text></Pressable></View> : data?.kind === 'missing' || data?.kind === 'instrumental' ? <View style={styles.message}><Ionicons name="musical-note-outline" size={34} color="#FFFFFF99" /><Text style={styles.messageText}>{data.kind === 'instrumental' ? '가사가 없는 연주곡입니다' : '이 곡의 가사를 찾지 못했어요'}</Text><Text style={styles.hint}>{source === 'nas' ? 'NAS에 저장된 가사가 있는지 확인하거나 온라인 가사를 선택해 주세요.' : '곡 제목·아티스트·앨범 태그가 정확한지 확인해 주세요.'}</Text><Pressable accessibilityRole="button" disabled={lyrics.isFetching} onPress={findAgain} style={styles.retry}><Text style={styles.retryText}>다시 찾기</Text></Pressable></View> : data ? <LyricLines key={lyricsKey} lines={data.lines} synced={data.kind === 'synced'} offsetMs={timing.offsetMs} translations={translation.shown ? translation.lines : undefined} /> : null}
    {lyrics.isRefetchError && data && (data.kind === 'plain' || data.kind === 'synced') && <Text accessibilityRole="alert" style={styles.error}>{lyrics.error.message}</Text>}
    {data && data.kind !== 'missing' && <Text style={styles.credit}>{sourceName} · {data.kind === 'synced' ? '재생 시간에 맞춰 표시 · 가사를 눌러 이동' : data.kind === 'plain' ? '시간 정보가 없는 일반 가사' : '연주곡'}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  panel: { flex: 1, paddingTop: 16, paddingBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  findAgain: { marginRight: 'auto', marginLeft: 8, minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  heading: { color: 'white', fontSize: 20, fontWeight: '800' },
  sources: { flexDirection: 'row', gap: 7 },
  source: { minHeight: 36, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF18' },
  selectedSource: { backgroundColor: '#FFFFFF30' },
  sourceText: { color: '#FFFFFF99', fontSize: 12, fontWeight: '600' },
  selectedText: { color: 'white' },
  lines: { flex: 1 },
  listContent: { paddingTop: 18, paddingBottom: 120 },
  row: { paddingVertical: 13 },
  lyric: { color: 'white', fontSize: 30, fontWeight: '800', lineHeight: 40, letterSpacing: -0.5 },
  translation: { color: '#FFE4EB', fontSize: 18, fontWeight: '500', lineHeight: 27, marginTop: 7 },
  message: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 15 },
  messageText: { color: '#FFFFFFD9', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  hint: { color: '#FFFFFF88', fontSize: 12, lineHeight: 19, textAlign: 'center' },
  retry: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: '#FFFFFF20' },
  retryText: { color: 'white', fontSize: 13, fontWeight: '700' },
  follow: { position: 'absolute', bottom: 8, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#242030E8', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 20 },
  followText: { color: 'white', fontSize: 12, fontWeight: '700' },
  credit: { color: '#FFFFFF88', fontSize: 11, marginTop: 7 },
  error: { color: '#FFE2E7', fontSize: 12, textAlign: 'center', marginTop: 5 },
});
