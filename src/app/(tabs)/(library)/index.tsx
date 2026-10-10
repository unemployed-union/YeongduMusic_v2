import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ScreenHeader } from '@/components/screen-header';
import { LIBRARY_TABS, LibraryPage, type LibraryTab } from '@/features/library/library-page';
import { useAlbums, useArtists, useSongs } from '@/features/library/queries';
import { useRefreshLibrary } from '@/features/library/use-refresh-library';
import { useAuthStore } from '@/stores/auth';
import { useColors } from '@/theme/tokens';

export default function LibraryScreen() {
  const colors = useColors();
  const width = useWindowDimensions().width;
  const mode = useAuthStore((state) => state.mode);
  const [tab, setTab] = useState<LibraryTab>('albums');
  const pager = useRef<ScrollView>(null);
  const selectedTab = useRef<LibraryTab>('albums');
  const refreshState = useRefreshLibrary();
  const queries = {
    albums: useAlbums(tab === 'albums' && !refreshState.refreshing),
    songs: useSongs(tab === 'songs' && !refreshState.refreshing),
    artists: useArtists(tab === 'artists' && !refreshState.refreshing),
  };

  useEffect(() => {
    pager.current?.scrollTo({ x: LIBRARY_TABS.indexOf(selectedTab.current) * width, animated: false });
  }, [width]);

  function selectTab(next: LibraryTab) {
    selectedTab.current = next;
    setTab(next);
    pager.current?.scrollTo({ x: LIBRARY_TABS.indexOf(next) * width, animated: true });
  }

  return <View style={[styles.screen, { backgroundColor: colors.background }]}>
    <ScreenHeader title="보관함">
      <Text style={[styles.kicker, { color: colors.tint }]}>{mode === 'mock' ? 'DEMO LIBRARY' : 'SYNOLOGY AUDIO STATION'}</Text>
      <Text style={[styles.subheading, { color: colors.muted }]}>{mode === 'mock' ? '좋아하는 음악을 다시 만나는 곳' : '공용 music · 내 home/music'}</Text>
    </ScreenHeader>
    <View style={styles.segments}>{LIBRARY_TABS.map((option) => <Pressable key={option} accessibilityRole="tab" accessibilityState={{ selected: tab === option }} onPress={() => selectTab(option)} style={[styles.segment, { backgroundColor: tab === option ? colors.tint : colors.surface, borderColor: tab === option ? colors.tint : colors.separator }]}><Text style={{ color: tab === option ? 'white' : colors.text, fontWeight: '700' }}>{option === 'albums' ? '앨범' : option === 'songs' ? '노래' : '아티스트'}</Text></Pressable>)}</View>
    {(refreshState.refreshing || refreshState.error || refreshState.message) && <Pressable accessibilityRole="button" disabled={!refreshState.error || refreshState.refreshing} onPress={() => void refreshState.refresh()} style={styles.refreshNotice}><Text style={{ color: refreshState.error ? colors.tint : colors.muted }}>{refreshState.refreshing ? (mode === 'mock' ? '데모 목록 확인 중…' : 'Audio Station 목록을 가져오는 중…') : refreshState.error ? refreshState.error + ' · 다시 시도' : refreshState.message}</Text></Pressable>}
    <ScrollView
      ref={pager}
      style={styles.pager}
      contentContainerStyle={styles.pages}
      horizontal
      pagingEnabled
      directionalLockEnabled
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      bounces={false}
      onMomentumScrollEnd={(event) => {
        const pageIndex = Math.max(0, Math.min(LIBRARY_TABS.length - 1, Math.round(event.nativeEvent.contentOffset.x / width)));
        const next = LIBRARY_TABS[pageIndex];
        if (next) {
          selectedTab.current = next;
          setTab(next);
        }
      }}
    >
      {LIBRARY_TABS.map((option) => <LibraryPage key={option} tab={option} query={queries[option]} width={width} refreshing={refreshState.refreshing} onRefresh={refreshState.refresh} />)}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1.8, marginTop: 8 }, subheading: { fontSize: 14, marginTop: 4 }, segments: { flexDirection: 'row', gap: 8, paddingHorizontal: 22, marginTop: 5, marginBottom: 16 }, segment: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 8 }, refreshNotice: { paddingHorizontal: 22, paddingBottom: 12 }, pager: { flex: 1 }, pages: { alignItems: 'stretch' } });
