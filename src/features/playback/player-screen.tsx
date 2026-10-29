import { PlayerHeader } from './player-header';
import { PlayerQueue } from './player-queue';
import { PlayerSongDetails } from './player-song-details';
import {
  PlayerMenu,
  PlayerMenuLayer,
  type PlayerMenuAction,
} from '@/features/playback/player-menu';
import { useCallback, useRef, useState } from 'react';
import { BlurTargetView } from 'expo-blur';
import {
  Alert,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { Text } from '@/components/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, type Href } from 'expo-router';
import { albumId } from '@/features/library/album-library';
import { artistName } from '@/features/library/load-song-library';
import { PlayerBackground } from '@/features/playback/player-background';
import { useArtworkColors } from '@/features/playback/use-artwork-colors';
import { StatusBar } from 'expo-status-bar';
import Animated from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { usePlayerDismiss } from '@/features/playback/use-player-dismiss';
import { useArtworkSwipe, type ArtworkSwipeDirection } from '@/features/playback/use-artwork-swipe';
import { Artwork } from '@/components/artwork';
import { openSystemEqualizer } from '@/services/playback/equalizer';
import { cancelSectionRepeat, next, playQueue, previous } from '@/services/playback/controller';
import { sectionClock } from '@/services/playback/section-repeat';
import { usePlaybackStore } from '@/stores/playback';
import { useLibraryPreferences } from '@/stores/library-preferences';
import { usePlayerBackgroundStore } from '@/stores/player-background';
import { AddToPlaylistDialog } from '@/features/playlists/dialogs';
import { LyricsPanel } from '@/features/lyrics/lyrics-panel';
import { useAuthStore } from '@/stores/auth';
import { useOfflineMusicStore } from '@/stores/offline-music';
import { DownloadStatus } from '@/features/offline-music/download-status';
import type { LyricsSource } from '@/types/lyrics';
import type { Song } from '@/types/music';
import { MetadataEditor } from '@/features/metadata/metadata-editor';
import { playHaptic } from '@/services/haptics';
import { usePlayerAccent } from '@/theme/use-player-colors';
import { usePlaybackVisibility } from '@/features/playback/use-playback-visibility';
import { playerLayout } from '@/theme/layout';
import { useLiquidGlass } from '@/theme/liquid-glass';
import { PlayerProgress } from './player-progress';
import { PlayerTransportControls } from './player-transport-controls';
import { playerScreenStyles as styles } from './player-screen-styles';

export function PlayerScreen() {
  const ios = Platform.OS === 'ios';
  const queue = usePlaybackStore((state) => state.queue),
    index = usePlaybackStore((state) => state.index);
  const playing = usePlaybackStore((state) => state.playing),
    buffering = usePlaybackStore((state) => state.buffering);
  const shuffle = usePlaybackStore((state) => state.shuffle),
    repeat = usePlaybackStore((state) => state.repeat);
  const error = usePlaybackStore((state) => state.error);
  const toggleShuffle = usePlaybackStore((state) => state.toggleShuffle),
    cycleRepeat = usePlaybackStore((state) => state.cycleRepeat);
  const visible = usePlaybackVisibility();
  const glass = useLiquidGlass();
  const song = queue[index];
  const section = usePlaybackStore((state) => state.sectionRepeat);
  const mode = useAuthStore((state) => state.mode);
  const artist = song ? artistName(song.artist) : '';
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  const layout = playerLayout(width, height, insets, fontScale);
  const controlsRef = useRef<View | null>(null);
  const [panel, setPanel] = useState<'artwork' | 'queue' | 'lyrics'>('artwork');
  const [lyricsSource, setLyricsSource] = useState<LyricsSource>('auto');
  const showQueue = panel === 'queue';
  const [menu, setMenu] = useState<'playback' | 'details' | null>(null);
  const [previousVisibility, setPreviousVisibility] = useState(visible);
  if (previousVisibility !== visible) {
    setPreviousVisibility(visible);
    if (!visible) setMenu(null);
  }
  const menuOpen = menu !== null;
  const menuBlurTarget = useRef<View | null>(null);
  const [screenHeight, setScreenHeight] = useState(height);
  const [controlsTop, setControlsTop] = useState(0);
  const [saveList, setSaveList] = useState<'song' | 'queue' | null>(null);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const detailTarget = useRef<Href | null>(null);
  const dismissPlayer = useCallback(() => {
    if (detailTarget.current) router.dismissTo(detailTarget.current);
    else if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/(library)');
  }, []);
  const { gesture, animatedStyle, close, ready, closing } = usePlayerDismiss(
    height + insets.bottom,
    dismissPlayer,
    visible,
  );
  const openDetail = (detail: 'artist' | 'album') => {
    if (!song || closing.get()) return;
    detailTarget.current =
      detail === 'artist'
        ? { pathname: '/(tabs)/(library)/artist/[id]', params: { id: artist, name: artist } }
        : {
            pathname: '/(tabs)/(library)/album/[id]',
            params: {
              id: albumId(song, useLibraryPreferences.getState().groupAlbumsByTitle),
              title: song.album,
              artist: song.albumArtist || song.artist,
              artworkUrl: song.artworkUrl ?? '',
            },
          };
    setMenu(null);
    close();
  };
  useFocusEffect(
    useCallback(() => {
      const state = usePlaybackStore.getState(),
        current = state.queue[state.index];
      if (current) usePlayerBackgroundStore.getState().selectArtwork(current, { immediate: true });
    }, []),
  );
  useFocusEffect(
    useCallback(() => {
      if (!menuOpen) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        setMenu(null);
        return true;
      });
      return () => subscription.remove();
    }, [menuOpen]),
  );
  const openMenu = (kind: 'playback' | 'details') => {
    playHaptic('menu');
    controlsRef.current?.measureInWindow((_x, y) => setControlsTop(y));
    setMenu(kind);
  };
  const selectMenuAction = (action: PlayerMenuAction) => {
    setMenu(null);
    if (action === 'album' || action === 'artist') openDetail(action);
    else if (action === 'lyrics')
      setPanel(layout.split ? 'lyrics' : panel === 'lyrics' ? 'artwork' : 'lyrics');
    else if (action === 'download' && song) void useOfflineMusicStore.getState().download(song);
    else if (action === 'edit-metadata' && song) setEditingSong(song);
    else if (action === 'delete-local' && song)
      Alert.alert(
        '기기 음악 삭제',
        '앱에 저장된 복사본을 삭제합니다. NAS·Drive·S3·휴대전화의 원본은 유지됩니다.',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '삭제',
            style: 'destructive',
            onPress: () => {
              void useOfflineMusicStore.getState().remove(song);
            },
          },
        ],
      );
    else if (action === 'equalizer') void openSystemEqualizer();
    else setSaveList(action === 'add-song' ? 'song' : 'queue');
  };
  const artSize = layout.artworkSize;
  const changeTrack = useCallback(async (direction: ArtworkSwipeDirection) => {
    playHaptic('playback');
    try {
      await (direction === 'next' ? next() : previous(false));
    } catch (failure) {
      usePlaybackStore
        .getState()
        .setStatus({
          buffering: false,
          error: failure instanceof Error ? failure.message : '곡을 변경할 수 없습니다.',
        });
    }
  }, []);
  const artworkSwipe = useArtworkSwipe(artSize, ready, closing, changeTrack, visible);
  const artworkGesture = Gesture.Race(gesture, artworkSwipe.gesture);
  const colors = useArtworkColors();
  const controlColors = usePlayerAccent(colors);
  const menuAboveControls = controlsTop - insets.top >= 180;
  const menuBottom = menuAboveControls
    ? Math.max(insets.bottom + 18, screenHeight - controlsTop + 8)
    : insets.bottom + 18;
  const menuMaxHeight = Math.max(
    80,
    menuAboveControls
      ? controlsTop - insets.top - 16
      : screenHeight - insets.top - insets.bottom - 90,
  );
  const artworkPanel = song ? (
    <GestureDetector gesture={artworkGesture}>
      <View
        collapsable={false}
        style={[styles.artContainer, { minHeight: artSize + 24 }, layout.split && { flex: 0 }]}
      >
        <Animated.View
          style={[
            styles.artShadow,
            {
              width: artSize,
              height: artSize,
              backgroundColor: colors[0],
              ...(glass.supported && { borderRadius: 28 }),
            },
            artworkSwipe.animatedStyle,
          ]}
        >
          <Artwork item={song} size={artSize} radius={glass.supported ? 28 : 17} fullResolution />
        </Animated.View>
      </View>
    </GestureDetector>
  ) : null;
  const lyricsPanel = song ? (
    <LyricsPanel
      largeText={layout.split && layout.contentWidth - layout.primaryWidth - layout.gap >= 480}
      accentColor={controlColors.accent}
      highlightColor={controlColors.highlight}
      key={song.id}
      song={song}
      source={lyricsSource}
      onSourceChange={setLyricsSource}
    />
  ) : null;
  const queuePanel = (
    <PlayerQueue
      queue={queue}
      index={index}
      controlColors={controlColors}
      onSelect={(row) => {
        playHaptic('playback');
        void playQueue(queue, row);
      }}
    />
  );
  const playbackControls = song ? (
    <View
      ref={controlsRef}
      style={[
        styles.bottom,
        ios && styles.iosBottom,
        (layout.split || layout.compact) && styles.compactBottom,
      ]}
      onLayout={(event) =>
        setControlsTop(screenHeight - insets.bottom - 18 - event.nativeEvent.layout.height)
      }
    >
      <PlayerSongDetails
        song={song}
        artist={artist}
        highlight={controlColors.highlight}
        menu={menu}
        onOpenMenu={openMenu}
      />
      <DownloadStatus dark />
      {error ? (
        <Pressable onPress={() => void playQueue(queue, index)}>
          <Text style={styles.error}>{error} · 다시 시도</Text>
        </Pressable>
      ) : null}
      <PlayerProgress
        key={song.id}
        active={visible}
        width={layout.primaryWidth}
        fallbackDuration={song.duration}
        accent={controlColors.accent}
      />
      {section?.enabled && section.end !== null && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="구간 반복 해제"
          onPress={cancelSectionRepeat}
          style={{ minHeight: 32, justifyContent: 'center' }}
        >
          <Text style={{ color: controlColors.highlight, fontSize: 12 }}>
            구간 반복 {sectionClock(section.start)}–{sectionClock(section.end)} · 해제
          </Text>
        </Pressable>
      )}
      <PlayerTransportControls
        playing={playing}
        buffering={buffering}
        shuffle={shuffle}
        repeat={repeat}
        colors={controlColors}
        glass={glass}
        onToggleShuffle={toggleShuffle}
        onCycleRepeat={cycleRepeat}
      />
    </View>
  ) : null;
  return (
    <Animated.View style={[styles.player, animatedStyle]}>
      <BlurTargetView ref={menuBlurTarget} collapsable={false} style={styles.player}>
        <PlayerBackground colors={colors} active={visible} />
        <View
          onLayout={(event) => setScreenHeight(event.nativeEvent.layout.height)}
          accessibilityElementsHidden={menuOpen}
          importantForAccessibility={menuOpen ? 'no-hide-descendants' : 'auto'}
          style={[
            styles.screen,
            {
              paddingTop: insets.top + 8,
              paddingBottom: insets.bottom + 18,
              paddingLeft: insets.left + layout.padding,
              paddingRight: insets.right + layout.padding,
            },
          ]}
        >
          <StatusBar style="light" />
          <PlayerHeader
            width={layout.split ? layout.contentWidth : layout.primaryWidth}
            split={layout.split}
            showQueue={showQueue}
            glassSupported={glass.supported}
            glassEnabled={glass.enabled}
            onClose={close}
            onShowLyrics={() => {
              playHaptic('menu');
              setPanel('lyrics');
            }}
            onToggleQueue={() => {
              playHaptic('menu');
              setPanel(showQueue ? 'artwork' : 'queue');
            }}
          />
          <View
            style={[
              styles.body,
              { width: layout.split ? layout.contentWidth : layout.primaryWidth },
              layout.split && { flexDirection: 'row', gap: layout.gap },
            ]}
          >
            {!song ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>재생 중인 음악이 없습니다.</Text>
              </View>
            ) : layout.split ? (
              <>
                <ScrollView
                  style={{ width: layout.primaryWidth, flexGrow: 0, flexShrink: 0 }}
                  contentContainerStyle={[styles.primaryContent, { justifyContent: 'center' }]}
                  showsVerticalScrollIndicator={false}
                >
                  {artworkPanel}
                  {playbackControls}
                </ScrollView>
                <View style={styles.secondary}>{showQueue ? queuePanel : lyricsPanel}</View>
              </>
            ) : layout.compact && panel === 'artwork' ? (
              <ScrollView
                contentContainerStyle={styles.primaryContent}
                showsVerticalScrollIndicator={false}
              >
                {artworkPanel}
                {playbackControls}
              </ScrollView>
            ) : (
              <>
                {showQueue ? queuePanel : panel === 'lyrics' ? lyricsPanel : artworkPanel}
                {playbackControls}
              </>
            )}
          </View>
        </View>
      </BlurTargetView>
      <PlayerMenuLayer active={visible}>
        {menuOpen && song && (
          <PlayerMenu
            key={`${menu}-${song.id}`}
            canDownload={
              song.source === 'mybox' ||
              song.source === 's3' ||
              song.source === 'drive' ||
              (song.source !== 'local' && mode === 'nas')
            }
            localSong={song.source === 'local'}
            kind={menu ?? 'playback'}
            blurTarget={menuBlurTarget}
            panel={layout.split && !showQueue ? 'lyrics' : panel}
            left={
              layout.split
                ? Math.max(
                    insets.left + layout.padding,
                    (width - layout.contentWidth + insets.left - insets.right) / 2 +
                      (menu === 'details' ? 0 : Math.max(0, layout.primaryWidth - 300)),
                  )
                : undefined
            }
            bottom={menuBottom}
            maxHeight={menuMaxHeight}
            onClose={() => setMenu(null)}
            onSelect={selectMenuAction}
          />
        )}
      </PlayerMenuLayer>
      {saveList && song && (
        <AddToPlaylistDialog
          songs={saveList === 'queue' ? queue : [song]}
          onClose={() => setSaveList(null)}
        />
      )}
      {editingSong && <MetadataEditor song={editingSong} onClose={() => setEditingSong(null)} />}
    </Animated.View>
  );
}
