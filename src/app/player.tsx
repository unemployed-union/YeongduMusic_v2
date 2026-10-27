import { MarqueeText } from '@/components/marquee-text';
import { PlayerMenu, PlayerMenuLayer, type PlayerMenuAction } from '@/features/playback/player-menu';
import { ScrollEdgeFade } from '@/components/scroll-edge-fade';
import { useCallback, useRef, useState } from 'react';
import { BlurTargetView } from 'expo-blur';
import { ActivityIndicator, Alert, BackHandler, FlatList, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
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
import Slider from '@react-native-community/slider';
import MaskedView from '@react-native-masked-view/masked-view';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Artwork } from '@/components/artwork';
import { PlaybackGlyph } from '@/components/playback-glyph';
import { openSystemEqualizer } from '@/services/playback/equalizer';
import { cancelSectionRepeat, next, playQueue, previous, seek, togglePlayback } from '@/services/playback/controller';
import { sectionClock } from '@/services/playback/section-repeat';
import { usePlaybackStore } from '@/stores/playback';
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
import { FavoriteButton } from '@/components/favorite-button';
import { usePlayerAccent } from '@/theme/use-player-colors';
import { usePlaybackVisibility } from '@/features/playback/use-playback-visibility';
import { LosslessBadge } from '@/features/playback/lossless-badge';
import { playerLayout } from '@/theme/layout';
import { useLiquidGlass } from '@/theme/liquid-glass';
import { GlassBackdrop } from '@/components/glass-backdrop';

const SIDE_PADDING = 29;
const SLIDER_INSET = 14;
// Preserve the previous control positions after moving the 44pt action row into the menu.
const PLAYER_FOOTER_SPACE = 44 + 31;

function clock(value: number): string {
  const seconds = Math.max(0, Math.floor(value || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
function PlayerProgress({ active, width, fallbackDuration, accent }: { active: boolean; width: number; fallbackDuration: number; accent: string }) {
  const position = usePlaybackStore(state => active ? state.position : 0);
  const duration = usePlaybackStore(state => state.duration) || fallbackDuration;
  const ios = Platform.OS === 'ios';
  const [touching, setTouching] = useState(false);
  const [draft, setDraft] = useState<number | null>(null);
  const [previousActive, setPreviousActive] = useState(active);
  const seekRequest = useRef(0);
  if (previousActive !== active) {
    setPreviousActive(active);
    setTouching(false);
    setDraft(null);
  }
  const displayedPosition = ios && draft !== null ? draft : position;
  const slider = <Slider accessibilityLabel="재생 위치" style={[styles.slider, { width: ios ? width : width + SLIDER_INSET * 2 }, ios && styles.iosSlider]}
      minimumValue={0} maximumValue={Math.max(duration, 1)} value={Math.min(displayedPosition, duration || 1)}
      minimumTrackTintColor={accent} maximumTrackTintColor="#FFFFFF55" thumbTintColor={ios && !touching ? 'transparent' : accent}
      tapToSeek={ios}
      onTouchStart={ios ? () => setTouching(true) : undefined}
      onTouchEnd={ios ? () => setTouching(false) : undefined}
      onTouchCancel={ios ? () => { setTouching(false); setDraft(null); } : undefined}
      onSlidingStart={ios ? value => { seekRequest.current++; setTouching(true); setDraft(value); } : undefined}
      onValueChange={ios ? value => setDraft(value) : undefined}
      onSlidingComplete={value => {
        playHaptic('seek');
        if (!ios) { void seek(value); return; }
        setTouching(false); setDraft(value);
        const request = ++seekRequest.current;
        const finish = () => { if (request === seekRequest.current) setDraft(null); };
        void seek(value).then(finish, finish);
      }} />;
  return <>
    {ios ? <View style={{ width, height: 44 }}>
      {/* A transparent thumb tint can leave UIKit's shadow/lens visible. Mask its
          entire rendering while idle, retaining the native 44pt touch target. */}
      {!touching && <View pointerEvents="none" accessible={false} style={{ position: 'absolute', left: 0, right: 0, top: 19, height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: '#FFFFFF55' }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: accent, width: `${duration > 0 ? Math.max(0, Math.min(1, displayedPosition / duration)) * 100 : 0}%` }} />
      </View>}
      <MaskedView style={{ width, height: 44 }} maskElement={<View style={{ flex: 1, backgroundColor: touching ? '#FFFFFF' : 'transparent' }} />}>
        {slider}
      </MaskedView>
    </View> : slider}
    <View style={styles.times}><Text style={styles.time}>{clock(displayedPosition)}</Text><Text style={styles.time}>-{clock(Math.max(0, duration - displayedPosition))}</Text></View>
  </>;
}

export default function PlayerScreen() {
  const ios = Platform.OS === 'ios';
  const queue = usePlaybackStore(state => state.queue), index = usePlaybackStore(state => state.index);
  const playing = usePlaybackStore(state => state.playing), buffering = usePlaybackStore(state => state.buffering);
  const shuffle = usePlaybackStore(state => state.shuffle), repeat = usePlaybackStore(state => state.repeat);
  const error = usePlaybackStore(state => state.error);
  const toggleShuffle = usePlaybackStore(state => state.toggleShuffle), cycleRepeat = usePlaybackStore(state => state.cycleRepeat);
  const visible = usePlaybackVisibility();
  const glass = useLiquidGlass();
  const song = queue[index];
  const section = usePlaybackStore(state => state.sectionRepeat);
  const mode = useAuthStore(state => state.mode);
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
  const { gesture, animatedStyle, close, ready, closing } = usePlayerDismiss(height + insets.bottom, dismissPlayer, visible);
  const openDetail = (detail: 'artist' | 'album') => {
    if (!song || closing.get()) return;
    detailTarget.current = detail === 'artist'
      ? { pathname: '/(tabs)/(library)/artist/[id]', params: { id: artist, name: artist } }
      : { pathname: '/(tabs)/(library)/album/[id]', params: { id: albumId(song), title: song.album, artist: song.albumArtist || song.artist, artworkUrl: song.artworkUrl ?? '' } };
    setMenu(null);
    close();
  };
  useFocusEffect(useCallback(() => {
    const state = usePlaybackStore.getState(), current = state.queue[state.index];
    if (current) usePlayerBackgroundStore.getState().selectArtwork(current, { immediate: true });
  }, []));
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
    else if (action === 'lyrics') setPanel(layout.split ? 'lyrics' : panel === 'lyrics' ? 'artwork' : 'lyrics');
    else if (action === 'download' && song) void useOfflineMusicStore.getState().download(song);
    else if (action === 'edit-metadata' && song) setEditingSong(song);
    else if (action === 'delete-local' && song) Alert.alert('기기 음악 삭제', '앱에 저장된 복사본을 삭제합니다. NAS·Drive·S3·휴대전화의 원본은 유지됩니다.', [
      { text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => { void useOfflineMusicStore.getState().remove(song); } },
    ]);
    else if (action === 'equalizer') void openSystemEqualizer();
    else setSaveList(action === 'add-song' ? 'song' : 'queue');
  };
  const artSize = layout.artworkSize;
  const changeTrack = useCallback(async (direction: ArtworkSwipeDirection) => {
    playHaptic('playback');
    try { await (direction === 'next' ? next() : previous(false)); }
    catch (failure) {
      usePlaybackStore.getState().setStatus({ buffering: false, error: failure instanceof Error ? failure.message : '곡을 변경할 수 없습니다.' });
    }
  }, []);
  const artworkSwipe = useArtworkSwipe(artSize, ready, closing, changeTrack, visible);
  const artworkGesture = Gesture.Race(gesture, artworkSwipe.gesture);
  const colors = useArtworkColors();
  const controlColors = usePlayerAccent(colors);
  const menuAboveControls = controlsTop - insets.top >= 180;
  const menuBottom = menuAboveControls ? Math.max(insets.bottom + 18, screenHeight - controlsTop + 8) : insets.bottom + 18;
  const menuMaxHeight = Math.max(80, menuAboveControls ? controlsTop - insets.top - 16 : screenHeight - insets.top - insets.bottom - 90);
  const artworkPanel = song ? <GestureDetector gesture={artworkGesture}><View collapsable={false} style={[styles.artContainer, { minHeight: artSize + 24 }, layout.split && { flex: 0 }]}><Animated.View style={[styles.artShadow, { width: artSize, height: artSize, backgroundColor: colors[0], ...(glass.supported && { borderRadius: 28 }) }, artworkSwipe.animatedStyle]}><Artwork item={song} size={artSize} radius={glass.supported ? 28 : 17} fullResolution /></Animated.View></View></GestureDetector> : null;
  const lyricsPanel = song ? <LyricsPanel largeText={layout.split && layout.contentWidth - layout.primaryWidth - layout.gap >= 480} accentColor={controlColors.accent} highlightColor={controlColors.highlight} key={song.id} song={song} source={lyricsSource} onSourceChange={setLyricsSource} /> : null;
  const queuePanel = <View style={styles.queue}><Text style={styles.queueHeading}>다음 재생 · {queue.length}곡</Text><ScrollEdgeFade tint="dark"><FlatList contentContainerStyle={styles.queueContent} data={queue} keyExtractor={(item, itemIndex) => `${item.id}-${itemIndex}`} renderItem={({ item, index: row }) => <Pressable onPress={() => { playHaptic('playback'); void playQueue(queue, row); }} style={styles.queueRow}><Artwork item={item} size={42} radius={6} /><View style={{ flex: 1 }}><Text numberOfLines={1} style={[styles.queueTitle, row === index && { color: controlColors.selected }]}>{item.title}</Text><Text numberOfLines={1} style={styles.queueArtist}>{item.artist}</Text></View>{row === index && <Ionicons name="volume-high" color={controlColors.accent} size={20} />}</Pressable>} /></ScrollEdgeFade></View>;
  const playbackControls = song ? <View ref={controlsRef} style={[styles.bottom, ios && styles.iosBottom, (layout.split || layout.compact) && styles.compactBottom]} onLayout={(event) => setControlsTop(screenHeight - insets.bottom - 18 - event.nativeEvent.layout.height)}>
      <View style={{ paddingTop: 14, marginBottom: 5 }}>
        <View style={[styles.identity, { marginBottom: 0 }]}>
          <View style={{ flex: 1 }}>
            <MarqueeText key={song.id + song.title} text={song.title} style={styles.title} fadeEdges />
            <Pressable accessibilityRole="button" accessibilityLabel={artist + ' 메뉴 열기'} accessibilityState={{ expanded: menu === 'details' }} hitSlop={{ top: 6, bottom: 6 }} onPress={() => { playHaptic('menu'); controlsRef.current?.measureInWindow((_x, y) => setControlsTop(y)); setMenu('details'); }} style={styles.artistButton}><Text numberOfLines={1} style={styles.artist}>{artist}</Text></Pressable>
          </View>
          <FavoriteButton key={song.id} song={song} location="player" accentColor={controlColors.highlight} dark />
          <Pressable accessibilityRole="button" accessibilityLabel="재생 메뉴 열기" accessibilityState={{ expanded: menu === 'playback' }} onPress={() => { playHaptic('menu'); controlsRef.current?.measureInWindow((_x, y) => setControlsTop(y)); setMenu('playback'); }} style={styles.menuButton}><Ionicons name="ellipsis-horizontal-circle" size={26} color="#FFFFFFBB" /></Pressable>
        </View>
        <LosslessBadge color={styles.title.color} />
      </View>
      <DownloadStatus dark />
      {error ? <Pressable onPress={() => void playQueue(queue, index)}><Text style={styles.error}>{error} · 다시 시도</Text></Pressable> : null}
      <PlayerProgress key={song.id} active={visible} width={layout.primaryWidth} fallbackDuration={song.duration} accent={controlColors.accent} />
      {section?.enabled && section.end !== null && <Pressable accessibilityRole="button" accessibilityLabel="구간 반복 해제" onPress={cancelSectionRepeat} style={{ minHeight: 32, justifyContent: 'center' }}><Text style={{ color: controlColors.highlight, fontSize: 12 }}>구간 반복 {sectionClock(section.start)}–{sectionClock(section.end)} · 해제</Text></Pressable>}
      <View style={styles.controls}><Pressable accessibilityLabel="셔플" onPress={() => { playHaptic('selection'); toggleShuffle(); }}><Ionicons name="shuffle" size={24} color={shuffle ? controlColors.accent : '#FFFFFF88'} /></Pressable><Pressable accessibilityLabel="이전 곡" onPress={() => { playHaptic('playback'); void previous(); }}><Ionicons name="play-skip-back" size={30} color="white" /></Pressable><Pressable accessibilityLabel={playing ? '일시정지' : '재생'} onPress={() => { playHaptic('playback'); togglePlayback(); }} style={[styles.playControl, { backgroundColor: ios || glass.enabled ? 'transparent' : controlColors.accent }]}>{!ios && glass.enabled && <GlassBackdrop dark interactive tintColor={controlColors.accent + '38'} style={{ borderRadius: 34 }} />}{buffering ? <ActivityIndicator color={ios || glass.enabled ? 'white' : controlColors.onAccent} /> : ios ? <PlaybackGlyph playing={playing} color="white" size={40} /> : <Ionicons name={playing ? 'pause' : 'play'} size={32} color={glass.enabled ? 'white' : controlColors.onAccent} style={[styles.playIcon, !playing && styles.playIconTriangle]} />}</Pressable><Pressable accessibilityLabel="다음 곡" onPress={() => { playHaptic('playback'); void next(); }}><Ionicons name="play-skip-forward" size={30} color="white" /></Pressable><Pressable accessibilityLabel={`반복 ${repeat}`} onPress={() => { playHaptic('selection'); cycleRepeat(); }}><Ionicons name={repeat === 'one' ? 'repeat-outline' : 'repeat'} size={24} color={repeat === 'off' ? '#FFFFFF88' : controlColors.accent} />{repeat === 'one' && <Text style={[styles.repeatOne, { color: controlColors.accent }]}>1</Text>}</Pressable></View>
    </View> : null;
  return <Animated.View style={[styles.player, animatedStyle]}><BlurTargetView ref={menuBlurTarget} collapsable={false} style={styles.player}><PlayerBackground colors={colors} active={visible} /><View onLayout={(event) => setScreenHeight(event.nativeEvent.layout.height)} accessibilityElementsHidden={menuOpen} importantForAccessibility={menuOpen ? 'no-hide-descendants' : 'auto'} style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 18, paddingLeft: insets.left + layout.padding, paddingRight: insets.right + layout.padding }]}>
    <StatusBar style="light" />
    <View style={[styles.top, { width: layout.split ? layout.contentWidth : layout.primaryWidth, alignSelf: 'center' }]}><Pressable accessibilityLabel="플레이어 닫기" onPress={close} style={[styles.topButton, glass.supported && glassTopButton, ios && { backgroundColor: 'transparent' }]}>{!ios && glass.enabled && <GlassBackdrop dark interactive style={{ borderRadius: 22 }} />}<Ionicons name="chevron-down" size={26} color="white" /></Pressable>{layout.split && <Pressable accessibilityRole="button" accessibilityLabel="가사 보기" accessibilityState={{ selected: !showQueue }} onPress={() => { playHaptic('menu'); setPanel('lyrics'); }} style={[styles.topButton, glass.supported && glassTopButton, { marginLeft: 'auto', marginRight: 12 }]}>{glass.enabled && <GlassBackdrop dark interactive style={{ borderRadius: 22 }} />}<Ionicons name="chatbox-ellipses-outline" size={24} color={showQueue ? '#FFFFFF88' : 'white'} /></Pressable>}<Pressable accessibilityLabel="대기열" onPress={() => { playHaptic('menu'); setPanel(showQueue ? 'artwork' : 'queue'); }} style={[styles.topButton, glass.supported && glassTopButton, ios && { backgroundColor: 'transparent' }]}>{!ios && glass.enabled && <GlassBackdrop dark interactive style={{ borderRadius: 22 }} />}<Ionicons name={showQueue ? 'albums' : 'list'} size={26} color="white" /></Pressable></View>
    <View style={[styles.body, { width: layout.split ? layout.contentWidth : layout.primaryWidth }, layout.split && { flexDirection: 'row', gap: layout.gap }]}>
      {!song ? <View style={styles.empty}><Text style={styles.emptyText}>재생 중인 음악이 없습니다.</Text></View> : layout.split ? <>
        <ScrollView style={{ width: layout.primaryWidth, flexGrow: 0, flexShrink: 0 }} contentContainerStyle={[styles.primaryContent, { justifyContent: 'center' }]} showsVerticalScrollIndicator={false}>
          {artworkPanel}{playbackControls}
        </ScrollView>
        <View style={styles.secondary}>{showQueue ? queuePanel : lyricsPanel}</View>
      </> : layout.compact && panel === 'artwork' ? <ScrollView contentContainerStyle={styles.primaryContent} showsVerticalScrollIndicator={false}>{artworkPanel}{playbackControls}</ScrollView> : <>
        {showQueue ? queuePanel : panel === 'lyrics' ? lyricsPanel : artworkPanel}{playbackControls}
      </>}
    </View>
  </View></BlurTargetView><PlayerMenuLayer active={visible}>{menuOpen && song && <PlayerMenu key={`${menu}-${song.id}`} canDownload={song.source === 'mybox' || song.source === 's3' || song.source === 'drive' || (song.source !== 'local' && mode === 'nas')} localSong={song.source === 'local'} kind={menu ?? 'playback'} blurTarget={menuBlurTarget} panel={layout.split && !showQueue ? 'lyrics' : panel} left={layout.split ? Math.max(insets.left + layout.padding, (width - layout.contentWidth + insets.left - insets.right) / 2 + (menu === 'details' ? 0 : Math.max(0, layout.primaryWidth - 300))) : undefined} bottom={menuBottom} maxHeight={menuMaxHeight} onClose={() => setMenu(null)} onSelect={selectMenuAction} />}</PlayerMenuLayer>{saveList && song && <AddToPlaylistDialog songs={saveList === 'queue' ? queue : [song]} onClose={() => setSaveList(null)} />}{editingSong && <MetadataEditor song={editingSong} onClose={() => setEditingSong(null)} />}</Animated.View>;
}
const glassTopButton = { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF12' };
const styles = StyleSheet.create({ player: { flex: 1 }, body: { flex: 1, minHeight: 0, alignSelf: 'center' }, primaryContent: { flexGrow: 1 }, secondary: { flex: 1, minWidth: 0 }, compactBottom: { paddingBottom: 8 }, artContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' }, screen: { flex: 1, paddingHorizontal: SIDE_PADDING, justifyContent: 'space-between' }, top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, topButton: { width: 36, height: 38, alignItems: 'center', justifyContent: 'center' }, artShadow: { borderRadius: 17, shadowColor: '#070310', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.42, shadowRadius: 24, elevation: 18 }, empty: { flex: 1, justifyContent: 'center', alignItems: 'center' }, emptyText: { color: 'white' }, bottom: { paddingBottom: 15 + PLAYER_FOOTER_SPACE }, iosBottom: { paddingBottom: 56 }, identity: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 19 }, title: { fontSize: 23, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.6 }, artistButton: { alignSelf: 'flex-start', maxWidth: '100%', marginTop: 3 }, artist: { fontSize: 17, color: '#FFFFFFB0' }, slider: { height: 27, marginLeft: -SLIDER_INSET }, iosSlider: { height: 44, marginLeft: 0, transform: [{ scaleY: 1.5 }] }, times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 1 }, time: { color: '#FFFFFFA6', fontSize: 12, fontVariant: ['tabular-nums'] }, controls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 30, paddingHorizontal: 4 }, playControl: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center' }, playIcon: { width: 36, height: 36, lineHeight: 36, textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false }, playIconTriangle: { transform: [{ translateX: 2 }] }, repeatOne: { position: 'absolute', right: -3, bottom: -7, color: 'white', fontSize: 11, fontWeight: '900' }, menuButton: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }, error: { color: '#FFE2E7', fontSize: 12, marginBottom: 5 }, queue: { flex: 1, paddingTop: 25 }, queueHeading: { color: 'white', fontSize: 21, fontWeight: '800', marginBottom: 11 }, queueContent: { paddingTop: 28, paddingBottom: 28 }, queueRow: { height: 61, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#FFFFFF33' }, queueTitle: { color: 'white', fontSize: 15, fontWeight: '700' }, queueArtist: { color: '#FFFFFFA8', fontSize: 12, marginTop: 3 } });
