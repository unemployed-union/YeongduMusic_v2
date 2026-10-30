import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/text';
import { ScreenHeader } from '@/components/screen-header';
import { ContentTitleBar } from '@/components/content-title-bar';
import { ContentTransition } from '@/components/content-transition';
import { SettingsButton } from '@/components/settings-button';
import { LibraryPage, type LibraryTab } from '@/features/library/library-page';
import { LocalMusicControls } from '@/features/library/local-music-controls';
import { LibrarySortControl } from '@/features/library/library-sort-control';
import type { LibrarySortOrder } from '@/features/library/sort-library';
import { useAlbums, useArtists, useSongs } from '@/features/library/queries';
import { useRefreshLibrary } from '@/features/library/use-refresh-library';
import { useColors } from '@/theme/tokens';
import Animated from 'react-native-reanimated';
import { useLibraryControls } from '@/features/library/use-library-controls';
import { useMenuPreferences } from '@/stores/menu-preferences';
import { MENU_LABELS, selectedMenuId, visibleMenuIds } from '@/features/settings/menu-layout';
import { LibraryPager } from '@/features/library/library-pager';
import { LikedSongsScreen } from '@/features/favorites/liked-songs-screen';
import { LibrarySidebar } from '@/features/library/library-sidebar';
import { workspaceLayout } from '@/theme/layout';
import { useLiquidGlass } from '@/theme/liquid-glass';
import { glassControlStyles } from '@/components/glass-controls';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from 'expo-router';
import { LibrarySegments } from '@/features/library/library-segments';

export default function LibraryScreen() {
  const colors = useColors();
  const glass = useLiquidGlass();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  const workspace = workspaceLayout(
    glass.supported ? width - insets.left - insets.right : width,
    height,
    fontScale,
  );
  const pageWidth = workspace.expanded
    ? Math.min(1160, workspace.contentWidth) - 48
    : workspace.contentWidth;
  const library = useMenuPreferences((state) => state.layout.library);
  const tabs = useMemo(() => visibleMenuIds(library), [library]);
  const [selected, setTab] = useState<LibraryTab>(tabs[0]);
  const tab = selectedMenuId(library, selected);
  const [sortOrders, setSortOrders] = useState<Record<LibraryTab, LibrarySortOrder>>({
    albums: 'default',
    songs: 'default',
    artists: 'default',
    favorites: 'default',
  });
  const selectedTab = useRef<LibraryTab>(tab);
  const controls = useLibraryControls(glass.supported);
  const selectPage = controls.selectPage;
  const refreshState = useRefreshLibrary();
  const queries = {
    albums: useAlbums(focused && tab === 'albums' && !refreshState.refreshing),
    songs: useSongs(focused && tab === 'songs' && !refreshState.refreshing),
    artists: useArtists(focused && tab === 'artists' && !refreshState.refreshing),
  };

  useEffect(() => {
    const next = selectedMenuId(library, selectedTab.current);
    selectedTab.current = next;
    setTab(next);
    selectPage(next);
  }, [library, selectPage]);

  const selectTab = useCallback(
    (next: LibraryTab) => {
      selectPage(next);
      selectedTab.current = next;
      setTab(next);
    },
    [selectPage],
  );
  const changePage = useCallback(
    (index: number) => {
      const next = tabs[index];
      if (next) {
        selectTab(next);
      }
    },
    [tabs, selectTab],
  );

  const tools = (
    <LocalMusicControls
      menuLabel={workspace.expanded ? '가져오기·연결' : undefined}
      sortControl={
        <LibrarySortControl
          tab={tab}
          order={sortOrders[tab]}
          onChange={(order) => setSortOrders((current) => ({ ...current, [tab]: order }))}
        />
      }
    />
  );
  let refreshNotice: string | null;
  if (refreshState.refreshing) {
    refreshNotice = '가져오는 중...';
  } else if (refreshState.error) {
    refreshNotice = refreshState.error + ' · 다시 시도';
  } else {
    refreshNotice = refreshState.message;
  }
  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: colors.background },
        glass.supported && { paddingLeft: insets.left, paddingRight: insets.right },
      ]}
    >
      {!workspace.expanded && (
        <ScreenHeader title="보관함" action={<SettingsButton />} bottomSpacing={8} />
      )}
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {workspace.expanded && (
          <LibrarySidebar
            tabs={tabs}
            selected={tab}
            width={workspace.sidebarWidth}
            onSelect={selectTab}
          />
        )}
        <ContentTransition enabled={workspace.expanded}>
          <View style={{ flex: 1, width: pageWidth, alignSelf: 'center' }}>
            {workspace.expanded && <ContentTitleBar title="보관함" action={<SettingsButton />} />}
            {tools}
            {!workspace.expanded && (
              <Animated.View
                style={[{ overflow: 'hidden', flexShrink: 0 }, controls.frameStyle]}
                pointerEvents={controls.hidden ? 'none' : 'auto'}
                accessibilityElementsHidden={controls.hidden}
                importantForAccessibility={controls.hidden ? 'no-hide-descendants' : 'auto'}
              >
                <Animated.View
                  collapsable={false}
                  onLayout={controls.onLayout}
                  style={[
                    { position: 'absolute', top: 0, left: 0, right: 0 },
                    controls.contentStyle,
                  ]}
                >
                  <LibrarySegments
                    tabs={tabs}
                    selected={tab}
                    onSelect={selectTab}
                    fallback={
                      <View
                        style={[
                          styles.segments,
                          tabs.length > 3 && styles.compactSegments,
                          glass.supported && [
                            glassControlStyles.segments,
                            { backgroundColor: colors.surface },
                          ],
                        ]}
                      >
                        {tabs.map((option) => {
                          let tabBackgroundColor: string;
                          if (tab === option) {
                            tabBackgroundColor = colors.tint;
                          } else {
                            tabBackgroundColor = colors.surface;
                          }

                          let tabTextColor = colors.text;
                          if (tab === option) {
                            if (glass.supported) {
                              tabTextColor = colors.tint;
                            } else {
                              tabTextColor = 'white';
                            }
                          }
                          return (
                            <Pressable
                              key={option}
                              accessibilityRole="tab"
                              accessibilityState={{ selected: tab === option }}
                              onPress={() => selectTab(option)}
                              style={[
                                styles.segment,
                                tabs.length > 3 && styles.compactSegment,
                                {
                                  backgroundColor: tabBackgroundColor,
                                  borderColor: tab === option ? colors.tint : colors.separator,
                                },
                                glass.supported && [
                                  glassControlStyles.segment,
                                  {
                                    backgroundColor:
                                      tab === option ? colors.tint + '22' : 'transparent',
                                  },
                                ],
                              ]}
                            >
                              <Text
                                numberOfLines={1}
                                style={{
                                  color: tabTextColor,
                                  fontWeight: '700',
                                }}
                              >
                                {MENU_LABELS[option]}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    }
                  />
                  {(refreshState.refreshing || refreshState.error || refreshState.message) && (
                    <Pressable
                      accessibilityRole="button"
                      disabled={!refreshState.error || refreshState.refreshing}
                      onPress={() => void refreshState.refresh()}
                      style={styles.refreshNotice}
                    >
                      <Text style={{ color: refreshState.error ? colors.tint : colors.muted }}>
                        {refreshNotice}
                      </Text>
                    </Pressable>
                  )}
                </Animated.View>
              </Animated.View>
            )}
            {workspace.expanded &&
              (refreshState.refreshing || refreshState.error || refreshState.message) && (
                <Pressable
                  accessibilityRole="button"
                  disabled={!refreshState.error || refreshState.refreshing}
                  onPress={() => void refreshState.refresh()}
                  style={styles.refreshNotice}
                >
                  <Text style={{ color: refreshState.error ? colors.tint : colors.muted }}>
                    {refreshNotice}
                  </Text>
                </Pressable>
              )}
            <LibraryPager
              width={pageWidth}
              pageCount={tabs.length}
              pageIndex={tabs.indexOf(tab)}
              layoutKey={tabs.join(':')}
              onPageChange={changePage}
              onSwipeStart={controls.show}
              onTouchStart={controls.onTouchStart}
              onTouchMove={controls.onTouchMove}
            >
              {tabs.map((option) => {
                if (option === 'favorites') {
                  return (
                    <LikedSongsScreen
                      key={option}
                      width={pageWidth}
                      spacious={workspace.expanded}
                      active={option === tab}
                      sortOrder={sortOrders.favorites}
                      onListScroll={workspace.expanded ? undefined : controls.onScroll}
                    />
                  );
                }
                const query = queries[option];
                return (
                  <LibraryPage
                    key={option}
                    tab={option}
                    active={option === tab}
                    sortOrder={sortOrders[option]}
                    data={query.data}
                    isPending={query.isPending}
                    isError={query.isError}
                    error={query.error}
                    isRefetchError={query.isRefetchError}
                    width={pageWidth}
                    spacious={workspace.expanded}
                    refreshing={refreshState.refreshing}
                    onRefresh={refreshState.refresh}
                    onListScroll={workspace.expanded ? undefined : controls.onScroll}
                  />
                );
              })}
            </LibraryPager>
          </View>
        </ContentTransition>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  segments: { flexDirection: 'row', gap: 8, paddingHorizontal: 22, marginTop: 5, marginBottom: 16 },
  compactSegments: { gap: 6 },
  segment: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 8 },
  compactSegment: { flex: 1, paddingHorizontal: 2, alignItems: 'center' },
  refreshNotice: { paddingHorizontal: 22, paddingBottom: 4 },
});
