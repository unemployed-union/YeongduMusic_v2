import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { favoriteKey } from '@/features/favorites/rules';
import { privacyScope } from '@/features/hidden-music/rules';
import { useFavoritesStore } from '@/stores/favorites';
import { useFavoriteDisplayPreferences } from '@/stores/favorite-display-preferences';
import type { FavoriteButtonLocation } from '@/features/favorites/display-preferences';
import { useAuthStore } from '@/stores/auth';
import { playHaptic } from '@/services/haptics';
import { useColors } from '@/theme/tokens';
import type { Song } from '@/types/music';

export function FavoriteButton({ song, dark = false, location = 'songs', accentColor }: { song: Song; dark?: boolean; location?: FavoriteButtonLocation; accentColor?: string }) {
  const colors = useColors();
  const visible = useFavoriteDisplayPreferences(state => state.ready && !state.loadError && state.preferences.enabled && state.preferences[location]);
  const mode = useAuthStore(state => state.mode), session = useAuthStore(state => state.session);
  const key = favoriteKey(song, privacyScope(mode, session));
  const liked = useFavoritesStore(state => key !== null && state.songs[key] !== undefined);
  const ready = useFavoritesStore(state => state.ready), loading = useFavoritesStore(state => state.loading);
  const loadError = useFavoritesStore(state => state.loadError);
  const [saving, setSaving] = useState(false);
  const running = useRef(false);
  const color = liked ? accentColor ?? (dark ? '#FF9BAE' : colors.tint) : dark ? '#FFFFFFBB' : colors.muted;

  async function press() {
    if (!key || running.current) return;
    running.current = true; setSaving(true);
    try {
      const store = useFavoritesStore.getState();
      if (store.loadError) {
        await store.load(true);
        const current = useFavoritesStore.getState();
        if (current.loadError) Alert.alert('좋아요 불러오기 실패', current.error ?? '좋아요한 곡을 다시 불러와 주세요.');
        return;
      }
      playHaptic('selection');
      await store.setLiked(key, !liked);
    } catch {
      Alert.alert('좋아요 저장 실패', '좋아요를 저장하지 못했습니다. 다시 시도해 주세요.');
    } finally { running.current = false; setSaving(false); }
  }

  if (!visible) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel={loadError ? '좋아요 다시 불러오기' : `${song.title} 좋아요${liked ? ' 취소' : ''}`}
    accessibilityState={{ selected: liked, disabled: !key || !ready || loading || saving, busy: saving }}
    disabled={!key || !ready || loading || saving} onPress={() => void press()} style={styles.button}>
    {saving ? <ActivityIndicator size="small" color={color} /> : <Ionicons name={liked ? 'heart' : 'heart-outline'} size={23} color={color} />}
  </Pressable>;
}

const styles = StyleSheet.create({ button: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' } });
