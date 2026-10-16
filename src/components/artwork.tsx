import { Image, StyleSheet, View } from 'react-native';
import { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { useDisplayPreferences } from '@/stores/display-preferences';
import type { Album, Song } from '@/types/music';
import { fullArtworkUrl } from '@/services/artwork/image-url';

type Props = { item: Album | Song; size: number; radius?: number; fullResolution?: boolean };
function ArtworkImage({ uri, fullResolution }: { uri: string; fullResolution: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const full = fullResolution ? fullArtworkUrl(uri) : uri;
  const source = failed === full ? uri : full;
  return <Image source={{ uri: source }} style={StyleSheet.absoluteFill} resizeMode="cover"
    onError={source !== uri ? () => setFailed(full) : undefined} />;
}
export function Artwork({ item, size, radius = 10, fullResolution = false }: Props) {
  const hidden = useDisplayPreferences((state) => state.hideArtwork || !state.ready);
  const colors = !hidden && item.palette ? item.palette : ['#77466D', '#25345A'];
  return (
    <View style={[styles.frame, { width: size, height: size, borderRadius: radius }]}>
      <LinearGradient colors={[colors[0], colors[1]]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      <View style={[styles.orbit, { width: size * 0.68, height: size * 0.68, borderRadius: size }]} />
      <View style={[styles.disc, { width: size * 0.38, height: size * 0.38, borderRadius: size }]} />
      {!hidden && !!item.artworkUrl && <ArtworkImage uri={item.artworkUrl} fullResolution={fullResolution} />}
    </View>
  );
}
const styles = StyleSheet.create({
  frame: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#35354D' },
  orbit: { position: 'absolute', borderWidth: 1, borderColor: '#FFFFFF55', transform: [{ translateX: 18 }, { translateY: -14 }] },
  disc: { position: 'absolute', backgroundColor: '#FFFFFF24', transform: [{ translateX: -20 }, { translateY: 17 }] },
});
