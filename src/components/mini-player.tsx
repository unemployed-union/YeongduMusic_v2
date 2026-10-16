import type { RefObject } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Artwork } from './artwork';
import { MarqueeText } from './marquee-text';
import { togglePlayback } from '@/services/playback/controller';
import { usePlaybackStore } from '@/stores/playback';
import { usePlayerBackgroundStore } from '@/stores/player-background';
import { useAppColorScheme } from '@/theme/tokens';
import { useMiniPlayerColors } from '@/theme/use-player-colors';
import { playHaptic } from '@/services/haptics';
import { useBlurIntensity } from '@/stores/blur-preferences';
import { usePlaybackVisibility } from '@/features/playback/use-playback-visibility';

export const MINI_PLAYER_INSET = 8;

function openPlayer() {
  playHaptic('menu');
  const state = usePlaybackStore.getState(), song = state.queue[state.index];
  if (song) usePlayerBackgroundStore.getState().selectArtwork(song, { immediate: true });
  router.push('/player');
}

export function MiniPlayer({ blurTarget }: { blurTarget: RefObject<View | null> }) {
  const song = usePlaybackStore(state => state.queue[state.index]);
  const playing = usePlaybackStore(state => state.playing);
  const visible = usePlaybackVisibility();
  const colors = useMiniPlayerColors();
  const isDark = useAppColorScheme() === 'dark';
  const blurIntensity = useBlurIntensity('miniPlayer'), blurEnabled = blurIntensity > 0;
  const swipeUp = Gesture.Pan()
    .enabled(visible)
    .activeOffsetY(-12)
    .failOffsetY(12)
    .failOffsetX([-24, 24])
    .runOnJS(true)
    .onEnd((event, success) => {
      if (success && (event.translationY <= -40 || (event.translationY < -12 && event.velocityY < -650))) openPlayer();
    });
  if (!song) return null;
  return <GestureDetector gesture={swipeUp}><Animated.View entering={FadeInDown.duration(250)} style={[styles.shell, { borderColor: colors.chromeBorder }]}>
    {blurEnabled && <BlurView pointerEvents="none" blurTarget={blurTarget} blurMethod="dimezisBlurView" intensity={blurIntensity} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />}
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: blurEnabled ? colors.mini : colors.surface }]} />
    <Pressable style={styles.body} onPress={openPlayer} accessibilityHint="누르거나 위로 스와이프하면 전체 재생 화면이 열립니다">
      <Artwork item={song} size={45} radius={7} />
      <View style={styles.text}><MarqueeText key={song.id + song.title} text={song.title} active={visible} style={[styles.title, { color: colors.text }]} /><Text numberOfLines={1} style={[styles.artist, { color: colors.chromeMuted }]}>{song.artist}</Text></View>
      <Pressable accessibilityLabel={playing ? '일시정지' : '재생'} hitSlop={12} onPress={() => { playHaptic('playback'); togglePlayback(); }} style={[styles.control, { backgroundColor: colors.miniControl }]}><Ionicons name={playing ? 'pause' : 'play'} size={21} color={colors.tint} /></Pressable>
    </Pressable>
    <MiniProgress active={visible} borderColor={colors.chromeBorder} accent={colors.tint} />
  </Animated.View></GestureDetector>;
}
function MiniProgress({ active, borderColor, accent }: { active: boolean; borderColor: string; accent: string }) {
  const position = usePlaybackStore(state => active ? state.position : 0);
  const duration = usePlaybackStore(state => state.duration);
  return <View style={[styles.progress, { backgroundColor: borderColor }]}><View style={[styles.progressActive, { backgroundColor: accent, width: `${duration > 0 ? Math.min(100, position / duration * 100) : 0}%` }]} /></View>;
}
const styles = StyleSheet.create({ shell: { position: 'absolute', bottom: 0, left: MINI_PLAYER_INSET, right: MINI_PLAYER_INSET, height: 64, borderRadius: 14, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth }, body: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 10 }, text: { flex: 1, gap: 2 }, title: { fontSize: 14, fontWeight: '700' }, artist: { fontSize: 12 }, control: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }, progress: { height: 2 }, progressActive: { height: 2 } });
