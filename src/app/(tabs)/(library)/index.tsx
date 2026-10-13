import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/text';
import { ScreenHeader } from '@/components/screen-header';
import { SettingsButton } from '@/components/settings-button';
import { LIBRARY_TABS, LibraryPage, type LibraryTab } from '@/features/library/library-page';
import { LocalMusicControls } from '@/features/library/local-music-controls';
import { LibrarySortControl } from '@/features/library/library-sort-control';
import type { LibrarySortOrder } from '@/features/library/sort-library';
import { useAlbums, useArtists, useSongs } from '@/features/library/queries';
import { useRefreshLibrary } from '@/features/library/use-refresh-library';
import { useColors } from '@/theme/tokens';
import Animated from 'react-native-reanimated';
import { useLibraryControls } from '@/features/library/use-library-controls';

export default function LibraryScreen() {
  const colors = useColors();
  const width = useWindowDimensions().width;
  const [tab, setTab] = useState<LibraryTab>('albums');
  const [sortOrders, setSortOrders] = useState<Record<LibraryTab, LibrarySortOrder>>({ albums: 'default', songs: 'default', artists: 'default' });
  const pager = useRef<ScrollView>(null);
  const selectedTab = useRef<LibraryTab>('albums');
  const controls = useLibraryControls();
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
    controls.selectPage(next);
    selectedTab.current = next;
    setTab(next);
    pager.current?.scrollTo({ x: LIBRARY_TABS.indexOf(next) * width, animated: true });
  }

  return <View style={[styles.screen, { backgroundColor: colors.background }]}>
    <ScreenHeader title="보관함" action={<SettingsButton />} bottomSpacing={8} />
    <LocalMusicControls sortControl={<LibrarySortControl tab={tab} order={sortOrders[tab]} onChange={(order) => setSortOrders((current) => ({ ...current, [tab]: order }))} />} />
    <Animated.View style={[{ overflow: 'hidden', flexShrink: 0 }, controls.frameStyle]} pointerEvents={controls.hidden ? 'none' : 'auto'} accessibilityElementsHidden={controls.hidden} importantForAccessibility={controls.hidden ? 'no-hide-descendants' : 'auto'}>
    <Animated.View collapsable={false} onLayout={controls.onLayout} style={[{ position: 'absolute', top: 0, left: 0, right: 0 }, controls.contentStyle]}>
    <View style={styles.segments}>{LIBRARY_TABS.map((option) => <Pressable key={option} accessibilityRole="tab" accessibilityState={{ selected: tab === option }} onPress={() => selectTab(option)} style={[styles.segment, { backgroundColor: tab === option ? colors.tint : colors.surface, borderColor: tab === option ? colors.tint : colors.separator }]}><Text style={{ color: tab === option ? 'white' : colors.text, fontWeight: '700' }}>{option === 'albums' ? '앨범' : option === 'songs' ? '노래' : '아티스트'}</Text></Pressable>)}</View>
    {(refreshState.refreshing || refreshState.error || refreshState.message) && <Pressable accessibilityRole="button" disabled={!refreshState.error || refreshState.refreshing} onPress={() => void refreshState.refresh()} style={styles.refreshNotice}><Text style={{ color: refreshState.error ? colors.tint : colors.muted }}>{refreshState.refreshing ? '음악 목록을 가져오는 중…' : refreshState.error ? refreshState.error + ' · 다시 시도' : refreshState.message}</Text></Pressable>}
    </Animated.View>
    </Animated.View>
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
      onTouchStart={controls.onTouchStart}
      onTouchMove={controls.onTouchMove}
      onScrollBeginDrag={controls.show}
      scrollEventThrottle={16}
      onScroll={(event) => {
        const alignedOffset = LIBRARY_TABS.indexOf(selectedTab.current) * width;
        if (Math.abs(event.nativeEvent.contentOffset.x - alignedOffset) > 4) controls.show();
      }}
      onMomentumScrollEnd={(event) => {
        const pageIndex = Math.max(0, Math.min(LIBRARY_TABS.length - 1, Math.round(event.nativeEvent.contentOffset.x / width)));
        const next = LIBRARY_TABS[pageIndex];
        if (next) {
          if (next !== selectedTab.current) controls.selectPage(next);
          selectedTab.current = next;
          setTab(next);
        }
      }}
    >
      {LIBRARY_TABS.map((option) => {
        const query = queries[option];
        return <LibraryPage key={option} tab={option} sortOrder={sortOrders[option]} data={query.data} isPending={query.isPending} isError={query.isError} error={query.error} isRefetchError={query.isRefetchError} width={width} refreshing={refreshState.refreshing} onRefresh={refreshState.refresh} onListScroll={controls.onScroll} />;
      })}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, segments: { flexDirection: 'row', gap: 8, paddingHorizontal: 22, marginTop: 5, marginBottom: 16 }, segment: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 8 }, refreshNotice: { paddingHorizontal: 22, paddingBottom: 4 }, pager: { flex: 1 }, pages: { alignItems: 'stretch' } });
