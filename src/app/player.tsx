import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
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
import { next, playQueue, previous, seek, togglePlayback } from '@/services/playback/controller';
import { usePlaybackStore } from '@/stores/playback';

const SIDE_PADDING = 29;
const SLIDER_INSET = 14;

function clock(value: number): string {
  const seconds = Math.max(0, Math.floor(value || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
export default function PlayerScreen() {
  const { queue, index, playing, buffering, position, duration, shuffle, repeat, error, toggleShuffle, cycleRepeat } = usePlaybackStore();
  const song = queue[index];
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [showQueue, setShowQueue] = useState(false);
  const dismissToLibrary = useCallback(() => router.dismissTo('/(tabs)'), []);
  const { gesture, animatedStyle, close, ready, closing } = usePlayerDismiss(height + insets.bottom, dismissToLibrary);
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
  return <Animated.View style={[styles.player, animatedStyle]}><PlayerBackground colors={colors} /><View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 18 }]}>
    <StatusBar style="light" />
    <View style={styles.top}><Pressable accessibilityLabel="플레이어 닫기" onPress={close} style={styles.topButton}><Ionicons name="chevron-down" size={27} color="white" /></Pressable><Text style={styles.topLabel}>지금 재생 중</Text><Pressable accessibilityLabel="대기열" onPress={() => setShowQueue(!showQueue)} style={styles.topButton}><Ionicons name={showQueue ? 'albums' : 'list'} size={24} color="white" /></Pressable></View>
    {!song ? <View style={styles.empty}><Text style={styles.emptyText}>재생 중인 음악이 없습니다.</Text></View> : showQueue ? <View style={styles.queue}><Text style={styles.queueHeading}>다음 재생</Text><FlatList data={queue} keyExtractor={(item, itemIndex) => `${item.id}-${itemIndex}`} renderItem={({ item, index: row }) => <Pressable onPress={() => void playQueue(queue, row)} style={styles.queueRow}><Artwork item={item} size={42} radius={6} /><View style={{ flex: 1 }}><Text numberOfLines={1} style={[styles.queueTitle, row === index && { color: '#FFE4EB' }]}>{item.title}</Text><Text numberOfLines={1} style={styles.queueArtist}>{item.artist}</Text></View>{row === index && <Ionicons name="volume-high" color="white" size={20} />}</Pressable>} /></View> : <GestureDetector gesture={artworkGesture}><View collapsable={false} style={styles.artContainer}><Animated.View style={[styles.artShadow, { width: artSize, height: artSize, backgroundColor: colors[0] }, artworkSwipe.animatedStyle]}><Artwork item={song} size={artSize} radius={17} /></Animated.View></View></GestureDetector>}
    {!!song && <View style={styles.bottom}>
      <View style={styles.identity}><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.title}>{song.title}</Text><Text numberOfLines={1} style={styles.artist}>{song.artist}</Text></View><Ionicons name="ellipsis-horizontal-circle" size={26} color="#FFFFFFBB" /></View>
      {error ? <Pressable onPress={() => void playQueue(queue, index)}><Text style={styles.error}>{error} · 다시 시도</Text></Pressable> : null}
      <Slider style={[styles.slider, { width: width - SIDE_PADDING * 2 + SLIDER_INSET * 2 }]} minimumValue={0} maximumValue={Math.max(duration || song.duration, 1)} value={Math.min(position, duration || song.duration || 1)} minimumTrackTintColor="white" maximumTrackTintColor="#FFFFFF55" thumbTintColor="white" onSlidingComplete={(value) => void seek(value)} />
      <View style={styles.times}><Text style={styles.time}>{clock(position)}</Text><Text style={styles.time}>-{clock(Math.max(0, (duration || song.duration) - position))}</Text></View>
      <View style={styles.controls}><Pressable accessibilityLabel="셔플" onPress={toggleShuffle}><Ionicons name="shuffle" size={24} color={shuffle ? '#FFFFFF' : '#FFFFFF88'} /></Pressable><Pressable accessibilityLabel="이전 곡" onPress={() => void previous()}><Ionicons name="play-skip-back" size={30} color="white" /></Pressable><Pressable accessibilityLabel={playing ? '일시정지' : '재생'} onPress={togglePlayback} style={styles.playControl}>{buffering ? <ActivityIndicator color="#2F2841" /> : <Ionicons name={playing ? 'pause' : 'play'} size={32} color="#2F2841" style={[styles.playIcon, !playing && styles.playIconTriangle]} />}</Pressable><Pressable accessibilityLabel="다음 곡" onPress={() => void next()}><Ionicons name="play-skip-forward" size={30} color="white" /></Pressable><Pressable accessibilityLabel={`반복 ${repeat}`} onPress={cycleRepeat}><Ionicons name={repeat === 'one' ? 'repeat-outline' : 'repeat'} size={24} color={repeat === 'off' ? '#FFFFFF88' : '#FFFFFF'} />{repeat === 'one' && <Text style={styles.repeatOne}>1</Text>}</Pressable></View>
      <View style={styles.bottomLine}><Pressable onPress={() => setShowQueue(!showQueue)} style={styles.queueToggle}><Ionicons name="list" size={18} color="#FFFFFFCC" /><Text style={styles.queueToggleText}>{showQueue ? '앨범 아트' : `대기열 · ${queue.length}곡`}</Text></Pressable></View>
    </View>}
  </View></Animated.View>;
}
const styles = StyleSheet.create({ player: { flex: 1 }, artContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' }, screen: { flex: 1, paddingHorizontal: SIDE_PADDING, justifyContent: 'space-between' }, top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, topButton: { width: 36, height: 38, justifyContent: 'center' }, topLabel: { color: '#FFFFFFCC', fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }, artShadow: { borderRadius: 17, shadowColor: '#070310', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.42, shadowRadius: 24, elevation: 18 }, empty: { flex: 1, justifyContent: 'center', alignItems: 'center' }, emptyText: { color: 'white' }, bottom: { paddingBottom: 15 }, identity: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 19 }, title: { fontSize: 23, fontWeight: '800', color: 'white', letterSpacing: -0.6 }, artist: { fontSize: 17, color: '#FFFFFFB0', marginTop: 3 }, slider: { height: 27, marginLeft: -SLIDER_INSET }, times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 1 }, time: { color: '#FFFFFFA6', fontSize: 12, fontVariant: ['tabular-nums'] }, controls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 30, paddingHorizontal: 4 }, playControl: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center' }, playIcon: { width: 36, height: 36, lineHeight: 36, textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false }, playIconTriangle: { transform: [{ translateX: 2 }] }, repeatOne: { position: 'absolute', right: -3, bottom: -7, color: 'white', fontSize: 11, fontWeight: '900' }, bottomLine: { marginTop: 31, alignItems: 'center' }, queueToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 }, queueToggleText: { color: '#FFFFFFCC', fontSize: 13, fontWeight: '600' }, error: { color: '#FFE2E7', fontSize: 12, marginBottom: 5 }, queue: { flex: 1, paddingTop: 25 }, queueHeading: { color: 'white', fontSize: 21, fontWeight: '800', marginBottom: 11 }, queueRow: { height: 61, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#FFFFFF33' }, queueTitle: { color: 'white', fontSize: 15, fontWeight: '700' }, queueArtist: { color: '#FFFFFFA8', fontSize: 12, marginTop: 3 } });
