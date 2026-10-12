import { MarqueeText } from '@/components/marquee-text';
import { PlayerMenu, type PlayerMenuAction } from '@/features/playback/player-menu';
import { ScrollEdgeFade } from '@/components/scroll-edge-fade';
import { useCallback, useRef, useState } from 'react';
import { BlurTargetView } from 'expo-blur';
import { ActivityIndicator, Alert, BackHandler, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
import Slider from '@react-native-community/slider';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Artwork } from '@/components/artwork';
import { openSystemEqualizer } from '@/services/playback/equalizer';
import { next, playQueue, previous, seek, togglePlayback } from '@/services/playback/controller';
import { usePlaybackStore } from '@/stores/playback';
import { AddToPlaylistDialog } from '@/features/playlists/dialogs';
import { LyricsPanel } from '@/features/lyrics/lyrics-panel';
import { useAuthStore } from '@/stores/auth';
import { useOfflineMusicStore } from '@/stores/offline-music';
import { DownloadStatus } from '@/features/offline-music/download-status';
import type { LyricsSource } from '@/types/lyrics';

const SIDE_PADDING = 29;
const SLIDER_INSET = 14;
// Preserve the previous control positions after moving the 44pt action row into the menu.
const PLAYER_FOOTER_SPACE = 44 + 31;

function clock(value: number): string {
  const seconds = Math.max(0, Math.floor(value || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
export default function PlayerScreen() {
  const { queue, index, playing, buffering, position, duration, shuffle, repeat, error, toggleShuffle, cycleRepeat } = usePlaybackStore();
  const song = queue[index];
  const mode = useAuthStore(state => state.mode);
  const artist = song ? artistName(song.artist) : '';
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [panel, setPanel] = useState<'artwork' | 'queue' | 'lyrics'>('artwork');
  const [lyricsSource, setLyricsSource] = useState<LyricsSource>('auto');
  const showQueue = panel === 'queue';
  const [menu, setMenu] = useState<'playback' | 'details' | null>(null);
  const menuOpen = menu !== null;
  const menuBlurTarget = useRef<View | null>(null);
  const [screenHeight, setScreenHeight] = useState(height);
  const [controlsTop, setControlsTop] = useState(0);
  const [saveList, setSaveList] = useState<'song' | 'queue' | null>(null);
  const detailTarget = useRef<Href | null>(null);
  const dismissPlayer = useCallback(() => {
    if (detailTarget.current) router.dismissTo(detailTarget.current);
    else if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/(library)');
  }, []);
  const { gesture, animatedStyle, close, ready, closing } = usePlayerDismiss(height + insets.bottom, dismissPlayer);
  const openDetail = (detail: 'artist' | 'album') => {
    if (!song || closing.get()) return;
    detailTarget.current = detail === 'artist'
      ? { pathname: '/(tabs)/(library)/artist/[id]', params: { id: artist, name: artist } }
      : { pathname: '/(tabs)/(library)/album/[id]', params: { id: albumId(song), title: song.album, artist: song.albumArtist || song.artist, artworkUrl: song.artworkUrl ?? '' } };
    setMenu(null);
    close();
  };
  useFocusEffect(useCallback(() => {
    if (!menuOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setMenu(null);
      return true;
    });
    return () => subscription.remove();
  }, [menuOpen]));
  const selectMenuAction = (action: PlayerMenuAction) => {
    setMenu(null);
    if (action === 'album' || action === 'artist') openDetail(action);
    else if (action === 'lyrics') setPanel(panel === 'lyrics' ? 'artwork' : 'lyrics');
    else if (action === 'download' && song) void useOfflineMusicStore.getState().download(song);
    else if (action === 'delete-local' && song) Alert.alert('기기 음악 삭제', '앱에 저장된 복사본을 삭제합니다. NAS·Drive·휴대전화의 원본은 유지됩니다.', [
      { text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => { void useOfflineMusicStore.getState().remove(song); } },
    ]);
    else if (action === 'equalizer') void openSystemEqualizer();
    else setSaveList(action === 'add-song' ? 'song' : 'queue');
  };
  const artSize = Math.max(150, Math.min(width - 52, height * 0.43, height - insets.top - insets.bottom - 350, 390));
  const changeTrack = useCallback(async (direction: ArtworkSwipeDirection) => {
    try { await (direction === 'next' ? next() : previous(false)); }
    catch (failure) {
      usePlaybackStore.getState().setStatus({ buffering: false, error: failure instanceof Error ? failure.message : '곡을 변경할 수 없습니다.' });
    }
  }, []);
  const artworkSwipe = useArtworkSwipe(artSize, ready, closing, changeTrack);
  const artworkGesture = Gesture.Race(gesture, artworkSwipe.gesture);
  const colors = useArtworkColors();
  return <Animated.View style={[styles.player, animatedStyle]}><BlurTargetView ref={menuBlurTarget} collapsable={false} style={styles.player}><PlayerBackground colors={colors} /><View onLayout={(event) => setScreenHeight(event.nativeEvent.layout.height)} accessibilityElementsHidden={menuOpen} importantForAccessibility={menuOpen ? 'no-hide-descendants' : 'auto'} style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 18 }]}>
    <StatusBar style="light" />
    <View style={styles.top}><Pressable accessibilityLabel="플레이어 닫기" onPress={close} style={styles.topButton}><Ionicons name="chevron-down" size={26} color="white" /></Pressable><Pressable accessibilityLabel="대기열" onPress={() => setPanel(showQueue ? 'artwork' : 'queue')} style={styles.topButton}><Ionicons name={showQueue ? 'albums' : 'list'} size={26} color="white" /></Pressable></View>
    {!song ? <View style={styles.empty}><Text style={styles.emptyText}>재생 중인 음악이 없습니다.</Text></View> : showQueue ? <View style={styles.queue}><Text style={styles.queueHeading}>다음 재생 · {queue.length}곡</Text><ScrollEdgeFade tint="dark"><FlatList contentContainerStyle={styles.queueContent} data={queue} keyExtractor={(item, itemIndex) => `${item.id}-${itemIndex}`} renderItem={({ item, index: row }) => <Pressable onPress={() => void playQueue(queue, row)} style={styles.queueRow}><Artwork item={item} size={42} radius={6} /><View style={{ flex: 1 }}><Text numberOfLines={1} style={[styles.queueTitle, row === index && { color: '#FFE4EB' }]}>{item.title}</Text><Text numberOfLines={1} style={styles.queueArtist}>{item.artist}</Text></View>{row === index && <Ionicons name="volume-high" color="white" size={20} />}</Pressable>} /></ScrollEdgeFade></View> : panel === 'lyrics' ? <LyricsPanel key={song.id} song={song} source={lyricsSource} onSourceChange={setLyricsSource} /> : <GestureDetector gesture={artworkGesture}><View collapsable={false} style={styles.artContainer}><Animated.View style={[styles.artShadow, { width: artSize, height: artSize, backgroundColor: colors[0] }, artworkSwipe.animatedStyle]}><Artwork item={song} size={artSize} radius={17} /></Animated.View></View></GestureDetector>}
    {!!song && <View style={styles.bottom} onLayout={(event) => setControlsTop(event.nativeEvent.layout.y)}>
      <View style={styles.identity}><View style={{ flex: 1 }}><MarqueeText key={song.id + song.title} text={song.title} style={styles.title} /><Pressable accessibilityRole="button" accessibilityLabel={artist + ' 메뉴 열기'} accessibilityState={{ expanded: menu === 'details' }} hitSlop={{ top: 6, bottom: 6 }} onPress={() => setMenu('details')} style={styles.artistButton}><Text numberOfLines={1} style={styles.artist}>{artist}</Text></Pressable></View><Pressable accessibilityRole="button" accessibilityLabel="재생 메뉴 열기" accessibilityState={{ expanded: menu === 'playback' }} onPress={() => setMenu('playback')} style={styles.menuButton}><Ionicons name="ellipsis-horizontal-circle" size={26} color="#FFFFFFBB" /></Pressable></View>
      <DownloadStatus dark />
      {error ? <Pressable onPress={() => void playQueue(queue, index)}><Text style={styles.error}>{error} · 다시 시도</Text></Pressable> : null}
      <Slider style={[styles.slider, { width: width - SIDE_PADDING * 2 + SLIDER_INSET * 2 }]} minimumValue={0} maximumValue={Math.max(duration || song.duration, 1)} value={Math.min(position, duration || song.duration || 1)} minimumTrackTintColor="white" maximumTrackTintColor="#FFFFFF55" thumbTintColor="white" onSlidingComplete={(value) => void seek(value)} />
      <View style={styles.times}><Text style={styles.time}>{clock(position)}</Text><Text style={styles.time}>-{clock(Math.max(0, (duration || song.duration) - position))}</Text></View>
      <View style={styles.controls}><Pressable accessibilityLabel="셔플" onPress={toggleShuffle}><Ionicons name="shuffle" size={24} color={shuffle ? '#FFFFFF' : '#FFFFFF88'} /></Pressable><Pressable accessibilityLabel="이전 곡" onPress={() => void previous()}><Ionicons name="play-skip-back" size={30} color="white" /></Pressable><Pressable accessibilityLabel={playing ? '일시정지' : '재생'} onPress={togglePlayback} style={styles.playControl}>{buffering ? <ActivityIndicator color="#2F2841" /> : <Ionicons name={playing ? 'pause' : 'play'} size={32} color="#2F2841" style={[styles.playIcon, !playing && styles.playIconTriangle]} />}</Pressable><Pressable accessibilityLabel="다음 곡" onPress={() => void next()}><Ionicons name="play-skip-forward" size={30} color="white" /></Pressable><Pressable accessibilityLabel={`반복 ${repeat}`} onPress={cycleRepeat}><Ionicons name={repeat === 'one' ? 'repeat-outline' : 'repeat'} size={24} color={repeat === 'off' ? '#FFFFFF88' : '#FFFFFF'} />{repeat === 'one' && <Text style={styles.repeatOne}>1</Text>}</Pressable></View>
    </View>}
  </View></BlurTargetView>{menuOpen && song && <PlayerMenu key={menu} canDownload={song.source === 'drive' || (song.source !== 'local' && mode === 'nas')} localSong={song.source === 'local'} kind={menu ?? 'playback'} blurTarget={menuBlurTarget} panel={panel} bottom={Math.max(insets.bottom + 18, screenHeight - controlsTop + 8)} maxHeight={Math.max(80, controlsTop - insets.top - 16)} onClose={() => setMenu(null)} onSelect={selectMenuAction} />}{saveList && song && <AddToPlaylistDialog songs={saveList === 'queue' ? queue : [song]} onClose={() => setSaveList(null)} />}</Animated.View>;
}
const styles = StyleSheet.create({ player: { flex: 1 }, artContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' }, screen: { flex: 1, paddingHorizontal: SIDE_PADDING, justifyContent: 'space-between' }, top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, topButton: { width: 36, height: 38, alignItems: 'center', justifyContent: 'center' }, artShadow: { borderRadius: 17, shadowColor: '#070310', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.42, shadowRadius: 24, elevation: 18 }, empty: { flex: 1, justifyContent: 'center', alignItems: 'center' }, emptyText: { color: 'white' }, bottom: { paddingBottom: 15 + PLAYER_FOOTER_SPACE }, identity: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 19 }, title: { fontSize: 23, fontWeight: '800', color: 'white', letterSpacing: -0.6 }, artistButton: { alignSelf: 'flex-start', maxWidth: '100%', marginTop: 3 }, artist: { fontSize: 17, color: '#FFFFFFB0' }, slider: { height: 27, marginLeft: -SLIDER_INSET }, times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 1 }, time: { color: '#FFFFFFA6', fontSize: 12, fontVariant: ['tabular-nums'] }, controls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 30, paddingHorizontal: 4 }, playControl: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center' }, playIcon: { width: 36, height: 36, lineHeight: 36, textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false }, playIconTriangle: { transform: [{ translateX: 2 }] }, repeatOne: { position: 'absolute', right: -3, bottom: -7, color: 'white', fontSize: 11, fontWeight: '900' }, menuButton: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }, error: { color: '#FFE2E7', fontSize: 12, marginBottom: 5 }, queue: { flex: 1, paddingTop: 25 }, queueHeading: { color: 'white', fontSize: 21, fontWeight: '800', marginBottom: 11 }, queueContent: { paddingTop: 28, paddingBottom: 28 }, queueRow: { height: 61, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#FFFFFF33' }, queueTitle: { color: 'white', fontSize: 15, fontWeight: '700' }, queueArtist: { color: '#FFFFFFA8', fontSize: 12, marginTop: 3 } });
