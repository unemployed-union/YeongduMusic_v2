import { LyricsEdgeFade } from './lyrics-edge-fade';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { createAnimatedComponent, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useActiveLyricIndex } from './use-active-lyric-index';
import { useLyrics } from './use-lyrics';
import { usePlaybackStore } from '@/stores/playback';
import { seek } from '@/services/playback/controller';
import type { LyricLine, LyricsSource } from '@/types/lyrics';
import type { Song } from '@/types/music';

const sources: { value: LyricsSource; label: string }[] = [
  { value: 'auto', label: '자동' }, { value: 'nas', label: 'NAS' }, { value: 'online', label: '온라인' },
];
const AnimatedText = createAnimatedComponent(Text);

const LyricRow = memo(function LyricRow({ line, active, past, synced, seekable, onSeek }: {
  line: LyricLine; active: boolean; past: boolean; synced: boolean; seekable: boolean; onSeek: (time: number) => void;
}) {
  const opacity = useSharedValue(synced ? active ? 1 : past ? 0.5 : 0.3 : 0.9);
  useEffect(() => { opacity.set(withTiming(synced ? active ? 1 : past ? 0.5 : 0.3 : 0.9, { duration: active ? 80 : 180 })); }, [active, opacity, past, synced]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Pressable disabled={!seekable} accessibilityRole={seekable ? 'button' : 'text'} accessibilityLabel={line.text || '간주'} accessibilityHint={seekable ? '이 가사가 시작되는 위치로 이동' : undefined} accessibilityState={synced ? { selected: active } : undefined} onPress={() => { if (line.time !== null) onSeek(line.time); }} style={styles.row}>
    <AnimatedText style={[styles.lyric, animatedStyle]}>{line.text || '···'}</AnimatedText>
  </Pressable>;
});

// Own the scrolling state per track/source so returning to the player starts
// at the current engine position, without briefly rendering another track.
function LyricLines({ lines, synced }: { lines: LyricLine[]; synced: boolean }) {
  const duration = usePlaybackStore((state) => state.duration);
  const buffering = usePlaybackStore((state) => state.buffering);
  const active = useActiveLyricIndex(lines, synced);
  const list = useRef<FlatList<LyricLine>>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retries = useRef(0);
  const target = useRef<number | null>(null);
  const [following, setFollowing] = useState(true);
  const [layoutReady, setLayoutReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopRetry = useCallback(() => {
    if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    retryTimer.current = null;
  }, []);
  useEffect(() => {
    stopRetry();
    retries.current = 0;
    target.current = synced && following && layoutReady && active >= 0 ? active : null;
    if (target.current !== null) list.current?.scrollToIndex({ index: target.current, viewPosition: 0.25, animated: true });
    return stopRetry;
  }, [active, following, layoutReady, synced, stopRetry]);
  const seekToLine = useCallback((time: number) => {
    if (buffering || duration <= 0 || time > duration) return;
    setError(null);
    void seek(time).then(() => setFollowing(true)).catch(() => setError('재생 위치를 변경하지 못했습니다. 다시 눌러 주세요.'));
  }, [buffering, duration]);
  return <View style={styles.lines}>
    <LyricsEdgeFade><FlatList ref={list} data={lines} extraData={{ active, duration, buffering }} keyExtractor={(line) => line.id}
      showsVerticalScrollIndicator={false} initialNumToRender={10} windowSize={7} contentContainerStyle={styles.listContent}
      onLayout={() => setLayoutReady(true)}
      onScrollBeginDrag={() => { target.current = null; stopRetry(); setFollowing(false); }}
      onScrollToIndexFailed={({ index, averageItemLength }) => {
        if (target.current !== index || retries.current >= 3) return;
        retries.current++;
        list.current?.scrollToOffset({ offset: Math.max(0, averageItemLength * index), animated: false });
        stopRetry();
        retryTimer.current = setTimeout(() => {
          retryTimer.current = null;
          if (target.current === index) list.current?.scrollToIndex({ index, viewPosition: 0.25, animated: true });
        }, 150);
      }}
      renderItem={({ item, index }) => <LyricRow line={item} active={index === active} past={active >= 0 && index < active} synced={synced} seekable={synced && !buffering && duration > 0 && item.time !== null && item.time <= duration} onSeek={seekToLine} />}
    /></LyricsEdgeFade>
    {synced && !following && <Pressable accessibilityRole="button" onPress={() => setFollowing(true)} style={styles.follow}><Ionicons name="locate-outline" color="white" size={16} /><Text style={styles.followText}>현재 가사로</Text></Pressable>}
    {!!error && <Text style={styles.error}>{error}</Text>}
  </View>;
}

export function LyricsPanel({ song, source, onSourceChange }: { song: Song; source: LyricsSource; onSourceChange: (source: LyricsSource) => void }) {
  const duration = usePlaybackStore((state) => state.duration);
  const [searchOnline, setSearchOnline] = useState(false);
  const lyrics = useLyrics(song, source, duration, searchOnline);
  const findAgain = () => {
    if (lyrics.isFetching) return;
    if (source !== 'nas' && !searchOnline) setSearchOnline(true);
    else void lyrics.refetch();
  };
  const changeSource = (value: LyricsSource) => { setSearchOnline(false); onSourceChange(value); };
  const data = lyrics.data;
  const sourceName = data?.provider === 'nas' ? 'NAS' : data?.provider === 'demo' ? '데모 가사' : 'LRCLIB';
  const lyricsKey = `${song.id}:${source}:${data?.provider}:${data?.kind}`;
  return <View style={styles.panel}>
    <View style={styles.header}><Text style={styles.heading}>가사</Text><Pressable accessibilityRole="button" accessibilityLabel="가사 다시 찾기" disabled={lyrics.isFetching} onPress={findAgain} style={styles.findAgain}>{lyrics.isFetching ? <ActivityIndicator color="white" size="small" /> : <Ionicons name="refresh-outline" size={20} color="white" />}</Pressable><View style={styles.sources}>{sources.map((option) => <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: source === option.value }} onPress={() => changeSource(option.value)} style={[styles.source, source === option.value && styles.selectedSource]}><Text style={[styles.sourceText, source === option.value && styles.selectedText]}>{option.label}</Text></Pressable>)}</View></View>
    {lyrics.isPending || lyrics.isFetching && (!data || data.kind === 'missing' || data.kind === 'instrumental') ? <View style={styles.message}><ActivityIndicator color="white" /><Text style={styles.messageText}>가사를 찾고 있어요</Text></View> : lyrics.isError && (!data || data.kind === 'missing' || data.kind === 'instrumental') ? <View style={styles.message}><Ionicons name="cloud-offline-outline" size={32} color="#FFFFFFAA" /><Text style={styles.messageText}>{lyrics.error instanceof Error ? lyrics.error.message : '가사를 불러오지 못했습니다.'}</Text><Pressable accessibilityRole="button" disabled={lyrics.isFetching} onPress={findAgain} style={styles.retry}><Text style={styles.retryText}>다시 시도</Text></Pressable></View> : data?.kind === 'missing' || data?.kind === 'instrumental' ? <View style={styles.message}><Ionicons name="musical-note-outline" size={34} color="#FFFFFF99" /><Text style={styles.messageText}>{data.kind === 'instrumental' ? '가사가 없는 연주곡입니다' : '이 곡의 가사를 찾지 못했어요'}</Text><Text style={styles.hint}>{source === 'nas' ? 'NAS에 저장된 가사가 있는지 확인하거나 온라인 가사를 선택해 주세요.' : '곡 제목·아티스트·앨범 태그가 정확한지 확인해 주세요.'}</Text><Pressable accessibilityRole="button" disabled={lyrics.isFetching} onPress={findAgain} style={styles.retry}><Text style={styles.retryText}>다시 찾기</Text></Pressable></View> : data ? <LyricLines key={lyricsKey} lines={data.lines} synced={data.kind === 'synced'} /> : null}
    {lyrics.isRefetchError && data && (data.kind === 'plain' || data.kind === 'synced') && <Text accessibilityRole="alert" style={styles.error}>{lyrics.error.message}</Text>}
    {data && data.kind !== 'missing' && <Text style={styles.credit}>{sourceName} · {data.kind === 'synced' ? '재생 시간에 맞춰 표시 · 가사를 눌러 이동' : data.kind === 'plain' ? '시간 정보가 없는 일반 가사' : '연주곡'}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  panel: { flex: 1, paddingTop: 16, paddingBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  findAgain: { marginRight: 'auto', marginLeft: 8, minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  heading: { color: 'white', fontSize: 20, fontWeight: '800' },
  sources: { flexDirection: 'row', borderRadius: 18, padding: 3, backgroundColor: '#FFFFFF14' },
  source: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 15 },
  selectedSource: { backgroundColor: '#FFFFFF24' },
  sourceText: { color: '#FFFFFF99', fontSize: 12, fontWeight: '600' },
  selectedText: { color: 'white' },
  lines: { flex: 1 },
  listContent: { paddingTop: 18, paddingBottom: 120 },
  row: { paddingVertical: 13 },
  lyric: { color: 'white', fontSize: 30, fontWeight: '800', lineHeight: 40, letterSpacing: -0.5 },
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
