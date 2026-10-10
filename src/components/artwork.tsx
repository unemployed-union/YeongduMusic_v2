import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { Album, Song } from '@/types/music';

type Props = { item: Album | Song; size: number; radius?: number };
export function Artwork({ item, size, radius = 10 }: Props) {
  const colors = item.palette ?? ['#77466D', '#25345A'];
  return (
    <View style={[styles.frame, { width: size, height: size, borderRadius: radius }]}>
      <LinearGradient colors={[colors[0], colors[1]]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      <View style={[styles.orbit, { width: size * 0.68, height: size * 0.68, borderRadius: size }]} />
      <View style={[styles.disc, { width: size * 0.38, height: size * 0.38, borderRadius: size }]} />
      <Text style={[styles.letter, { fontSize: size * 0.18 }]}>{item.title.slice(0, 1).toUpperCase()}</Text>
      {!!item.artworkUrl && <Image source={{ uri: item.artworkUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
    </View>
  );
}
const styles = StyleSheet.create({
  frame: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#35354D' },
  orbit: { position: 'absolute', borderWidth: 1, borderColor: '#FFFFFF55', transform: [{ translateX: 18 }, { translateY: -14 }] },
  disc: { position: 'absolute', backgroundColor: '#FFFFFF24', transform: [{ translateX: -20 }, { translateY: 17 }] },
  letter: { color: '#FFFFFFD9', fontWeight: '700', textShadowColor: '#0003', textShadowRadius: 12 },
});
