import { TabScrollEdgeFade } from '@/components/tab-scroll-edge-fade';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Text } from '@/components/text';
import { Stack, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Artwork } from '@/components/artwork';
import { AsyncState } from '@/components/async-state';
import { SongRow } from '@/components/song-row';
import { mockAlbums } from '@/features/library/mock-repository';
import { playAndOpenPlayer } from '@/features/playback/play-and-open-player';
import { useAlbumSongs } from '@/features/library/queries';
import { albumArtistLabel, albumTitleFromId } from '@/features/library/album-library';
import { useAppColorScheme, useColors } from '@/theme/tokens';
import type { Album, Song } from '@/types/music';
import { LinearGradient } from 'expo-linear-gradient';
import { useLibraryDetailPreferences } from '@/stores/library-detail-preferences';
import { useDisplayPreferences } from '@/stores/display-preferences';
import { useAlbumColors } from '@/features/library/use-album-colors';
import { AlbumArtworkEditor } from '@/features/artwork/album-artwork-editor';
import { useAlbumHeader } from '@/features/library/use-album-header';
import Animated from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { playHaptic } from '@/services/haptics';
import { libraryGrid, workspaceLayout } from '@/theme/layout';

const EMPTY_SONGS: Song[] = [];

export default function AlbumScreen() {
  const params = useLocalSearchParams<{
    id: string;
    title?: string;
    artist?: string;
    artworkUrl?: string;
  }>();
  const colors = useColors();
  const scheme = useAppColorScheme();
  const focused = useIsFocused();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const width = workspaceLayout(window.width, window.height, window.fontScale).contentWidth;
  const columns = libraryGrid(width, false).columns;
  const wide = width >= 700;
  const detail = useLibraryDetailPreferences();
  const loadDetail = detail.load;
  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);
  const hideArtwork = useDisplayPreferences((state) => state.hideArtwork);
  const album: Album = useMemo(
    () =>
      mockAlbums.find((item) => item.id === params.id) ?? {
        id: params.id,
        title: params.title ?? '앨범',
        artist: params.artist ?? '',
        artworkUrl: params.artworkUrl || undefined,
      },
    [params.id, params.title, params.artist, params.artworkUrl],
  );
  const query = useAlbumSongs(album);
  const songs = query.data?.items ?? EMPTY_SONGS;
  const artist = useMemo(
    () =>
      albumTitleFromId(album.id) !== null && songs.length ? albumArtistLabel(songs) : album.artist,
    [album.id, album.artist, songs],
  );
  const artworkSong =
    songs.find((song) => song.artworkOriginal && song.artworkUrl) ??
    songs.find((song) => song.artworkUrl);
  const artworkAlbum = {
    ...album,
    artworkUrl: artworkSong?.artworkUrl,
    palette: artworkSong ? artworkSong.palette : album.palette,
  };
  const decorated =
    detail.ready &&
    !detail.loadError &&
    detail.preferences.albumColors &&
    !hideArtwork &&
    !!(artworkAlbum.artworkUrl || artworkAlbum.palette);
  const { colors: albumColors, ready: colorsReady } = useAlbumColors(
    artworkAlbum.artworkUrl,
    artworkAlbum.palette,
    decorated,
  );
  const appearanceReady = detail.ready && colorsReady;
  const artworkSize = Math.max(100, Math.min(width - 100, 292));
  const [heroHeight, setHeroHeight] = useState(artworkSize + 170 + headerHeight);
  const header = useAlbumHeader(album.id, heroHeight, headerHeight);
  const lightHeader = appearanceReady && decorated && songs.length > 0 && !header.overSongs;
  const [starting, setStarting] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const [editingArtwork, setEditingArtwork] = useState(false);
  const play = useCallback(
    async (selected = 0) => {
      setStarting(true);
      setPlayError(null);
      try {
        await playAndOpenPlayer(songs, selected);
      } catch (error) {
        setPlayError(error instanceof Error ? error.message : '앨범을 재생할 수 없습니다.');
      } finally {
        setStarting(false);
      }
    },
    [songs],
  );
  const renderSong = useCallback(
    ({ item, index }: { item: Song; index: number }) => (
      <View style={[styles.song, { backgroundColor: colors.background, width: width / columns }]}>
        <SongRow
          song={item}
          index={index}
          favoriteLocation="album"
          onPress={() => void play(index)}
        />
      </View>
    ),
    [colors.background, play, width, columns],
  );
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerTintColor: lightHeader ? '#FFFFFF' : colors.tint,
          headerTitleStyle: { color: lightHeader ? '#FFFFFF' : colors.text },
        }}
      />
      {focused && (
        <StatusBar style={lightHeader || scheme === 'dark' ? 'light' : 'dark'} animated />
      )}
      {appearanceReady && decorated && songs.length > 0 && (
        <LinearGradient
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          colors={albumColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.backdrop, { height: heroHeight }]}
        />
      )}
      <AsyncState
        loading={query.isPending || !appearanceReady}
        error={query.isError && !query.data ? query.error.message : null}
        retry={() => void query.refetch()}
      >
        <TabScrollEdgeFade topEnabled={false}>
          <FlatList
            key={`${album.id}-${columns}`}
            numColumns={columns}
            data={songs}
            keyExtractor={(song) => song.id}
            contentContainerStyle={styles.list}
            alwaysBounceVertical
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustContentInsets={false}
            scrollIndicatorInsets={{ top: headerHeight }}
            onScroll={header.onScroll}
            scrollEventThrottle={16}
            refreshControl={
              <RefreshControl
                refreshing={query.isRefetching}
                onRefresh={() => void query.refetch()}
                progressViewOffset={headerHeight}
                colors={[colors.tint]}
                tintColor={colors.tint}
                progressBackgroundColor={colors.surface}
              />
            }
            ListHeaderComponent={
              songs.length ? (
                <View>
                  <View
                    onLayout={(event) => setHeroHeight(event.nativeEvent.layout.height)}
                    style={[
                      styles.hero,
                      { paddingTop: headerHeight + 27 },
                      wide && { flexDirection: 'row', justifyContent: 'center', gap: 36 },
                      !decorated && { backgroundColor: colors.background },
                    ]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="앨범 이미지 선택"
                      accessibilityHint="길게 누르면 이미지 파일을 선택하거나 웹에서 앨범아트를 검색할 수 있습니다"
                      delayLongPress={400}
                      onLongPress={() => {
                        playHaptic('longPress');
                        setEditingArtwork(true);
                      }}
                      style={[styles.artShadow, { width: artworkSize, height: artworkSize }]}
                    >
                      <Artwork item={artworkAlbum} size={artworkSize} radius={14} />
                    </Pressable>
                    <View
                      style={
                        wide
                          ? { maxWidth: 440, flexShrink: 1, alignItems: 'flex-start' }
                          : { alignItems: 'center' }
                      }
                    >
                      <Text
                        style={[
                          styles.title,
                          wide && { textAlign: 'left', marginTop: 0 },
                          { color: decorated ? '#FFFFFF' : colors.text },
                        ]}
                      >
                        {album.title}
                      </Text>
                      <Text
                        style={[
                          styles.artist,
                          wide && { textAlign: 'left' },
                          { color: decorated ? '#FFFFFF' : colors.tint },
                        ]}
                      >
                        {artist}
                      </Text>
                      <Text style={[styles.count, { color: decorated ? '#E5E5EB' : colors.muted }]}>
                        {query.data?.total ?? 0}곡
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.actions, { backgroundColor: colors.background }]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={album.title + ' 전체 재생'}
                      disabled={starting || !songs.length}
                      onPress={() => void play()}
                      style={[
                        styles.play,
                        {
                          width: '100%',
                          maxWidth: 600,
                          alignSelf: 'center',
                          backgroundColor: colors.tint,
                          opacity: starting || !songs.length ? 0.65 : 1,
                        },
                      ]}
                    >
                      {starting ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <Ionicons name="play" size={21} color="white" />
                      )}
                      <Text style={styles.playText}>전체 재생</Text>
                    </Pressable>
                    {query.data?.stale && (
                      <Text style={[styles.count, { color: colors.muted }]}>
                        오프라인 보관함 · 마지막으로 저장된 목록
                      </Text>
                    )}
                    {query.isRefetchError && (
                      <Pressable onPress={() => void query.refetch()}>
                        <Text style={[styles.count, { color: colors.tint }]}>
                          {query.error.message} · 다시 시도
                        </Text>
                      </Pressable>
                    )}
                    {playError && (
                      <Text style={[styles.count, { color: colors.tint }]}>{playError}</Text>
                    )}
                  </View>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <Text
                style={[
                  styles.empty,
                  {
                    paddingTop: headerHeight + 30,
                    color: colors.muted,
                    backgroundColor: colors.background,
                  },
                ]}
              >
                이 앨범의 곡이 없습니다. 아래로 당겨 다시 확인하세요.
              </Text>
            }
            ListFooterComponent={
              <View
                style={{
                  flex: 1,
                  minHeight: 180 + insets.bottom,
                  backgroundColor: colors.background,
                }}
              />
            }
            ListFooterComponentStyle={styles.footer}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={7}
            renderItem={renderSong}
          />
        </TabScrollEdgeFade>
      </AsyncState>
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.headerGradient, { height: headerHeight + 28 }, header.gradientStyle]}
      >
        <LinearGradient
          colors={[colors.background, colors.background, colors.background + '00']}
          locations={[0, headerHeight / (headerHeight + 28), 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      {editingArtwork && songs.length > 0 && (
        <AlbumArtworkEditor
          key={album.id}
          album={{ ...album, artist }}
          songs={songs}
          onClose={() => setEditingArtwork(false)}
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  artShadow: {
    borderRadius: 14,
    backgroundColor: '#35354D',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  screen: { flex: 1 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0 },
  headerGradient: { position: 'absolute', top: 0, left: 0, right: 0 },
  empty: { padding: 30, textAlign: 'center' },
  list: { flexGrow: 1 },
  hero: { alignItems: 'center', paddingBottom: 23, paddingHorizontal: 22 },
  actions: { alignItems: 'center', paddingHorizontal: 22, paddingTop: 15, paddingBottom: 19 },
  song: { paddingHorizontal: 22 },
  footer: { flexGrow: 1 },
  title: { fontSize: 26, fontWeight: '800', marginTop: 20, textAlign: 'center' },
  artist: { fontSize: 16, fontWeight: '600', marginTop: 5, textAlign: 'center' },
  count: { fontSize: 13, marginTop: 6 },
  play: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
    height: 44,
    borderRadius: 11,
    alignSelf: 'stretch',
  },
  playText: { color: 'white', fontSize: 15, fontWeight: '800' },
});
