import type { RefObject } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Artwork } from './artwork';
import { togglePlayback } from '@/services/playback/controller';
import { usePlaybackStore } from '@/stores/playback';
import { useColors } from '@/theme/tokens';

export const MINI_PLAYER_INSET = 8;

function openPlayer() {
  router.push('/player');
}

export function MiniPlayer({ blurTarget }: { blurTarget: RefObject<View | null> }) {
  const { queue, index, playing, position, duration } = usePlaybackStore();
  const song = queue[index];
  const colors = useColors();
  const isDark = useColorScheme() === 'dark';
  const swipeUp = Gesture.Pan()
    .activeOffsetY(-12)
    .failOffsetY(12)
    .failOffsetX([-24, 24])
    .runOnJS(true)
    .onEnd((event, success) => {
      if (success && (event.translationY <= -40 || (event.translationY < -12 && event.velocityY < -650))) openPlayer();
    });
  if (!song) return null;
  return <GestureDetector gesture={swipeUp}><Animated.View entering={FadeInDown.duration(250)} style={[styles.shell, { borderColor: colors.chromeBorder }]}>
    <BlurView pointerEvents="none" blurTarget={blurTarget} blurMethod="dimezisBlurView" intensity={75} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.mini }]} />
    <Pressable style={styles.body} onPress={openPlayer} accessibilityHint="누르거나 위로 스와이프하면 전체 재생 화면이 열립니다">
      <Artwork item={song} size={45} radius={7} />
      <View style={styles.text}><Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>{song.title}</Text><Text numberOfLines={1} style={[styles.artist, { color: colors.chromeMuted }]}>{song.artist}</Text></View>
      <Pressable accessibilityLabel={playing ? '일시정지' : '재생'} hitSlop={12} onPress={togglePlayback} style={[styles.control, { backgroundColor: colors.miniControl }]}><Ionicons name={playing ? 'pause' : 'play'} size={21} color={colors.tint} /></Pressable>
    </Pressable>
    <View style={[styles.progress, { backgroundColor: colors.chromeBorder }]}><View style={[styles.progressActive, { backgroundColor: colors.tint, width: `${duration > 0 ? Math.min(100, position / duration * 100) : 0}%` }]} /></View>
  </Animated.View></GestureDetector>;
}
const styles = StyleSheet.create({ shell: { position: 'absolute', bottom: 0, left: MINI_PLAYER_INSET, right: MINI_PLAYER_INSET, height: 64, borderRadius: 14, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth }, body: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 10 }, text: { flex: 1, gap: 2 }, title: { fontSize: 14, fontWeight: '700' }, artist: { fontSize: 12 }, control: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }, progress: { height: 2 }, progressActive: { height: 2 } });
