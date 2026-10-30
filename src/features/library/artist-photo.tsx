import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { openURL } from 'expo-linking';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/text';
import {
  artistPhotoSource,
  findArtistPhoto,
  searchableArtist,
  type ArtistPhoto as Photo,
} from '@/services/artwork/artist-photo';
import { useColors } from '@/theme/tokens';

type PhotoState = { name: string; photo: Photo | null; loading: boolean; error: string | null };
export function ArtistPhoto({ name, enabled }: { name: string; enabled: boolean }) {
  const colors = useColors();
  const [result, setResult] = useState<PhotoState | null>(null);
  const [retry, setRetry] = useState(0);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [loadedUri, setLoadedUri] = useState<string | null>(null);
  const allowed = enabled && searchableArtist(name);
  useFocusEffect(
    useCallback(() => {
      if (!allowed) {
        return;
      }
      const controller = new AbortController();
      setFailedUri(null);
      setLoadedUri(null);
      setLinkError(null);
      setResult({ name, photo: null, loading: true, error: null });
      void findArtistPhoto(name, controller.signal, retry > 0).then(
        (photo) => {
          if (!controller.signal.aborted) {
            setResult({ name, photo, loading: false, error: null });
          }
        },
        (error) => {
          if (!controller.signal.aborted) {
            setResult({
              name,
              photo: null,
              loading: false,
              error: error instanceof Error ? error.message : '사진을 가져오지 못했습니다.',
            });
          }
        },
      );
      return () => controller.abort();
    }, [allowed, name, retry]),
  );
  const current = allowed && result?.name === name ? result : null;
  const photo = current?.photo && current.photo.uri !== failedUri ? current.photo : null;
  const loading = !!current?.loading || (!!photo && loadedUri !== photo.uri);
  async function source() {
    if (!photo) {
      return;
    }
    try {
      await openURL(photo.sourceUrl);
      setLinkError(null);
    } catch {
      setLinkError('사진 출처를 열지 못했습니다. 다시 시도해 주세요.');
    }
  }
  return (
    <View style={styles.frame}>
      <View
        style={[styles.icon, { backgroundColor: colors.surface, borderRadius: photo ? 16 : 52 }]}
      >
        {photo ? (
          <Image
            key={`${name}:${retry}`}
            source={artistPhotoSource(photo.uri)}
            style={styles.image}
            resizeMode="contain"
            accessibilityLabel={name + ' 사진'}
            onLoad={() => setLoadedUri(photo.uri)}
            onError={() => setFailedUri(photo.uri)}
          />
        ) : (
          !loading && <Ionicons name="person" size={48} color={colors.tint} />
        )}
        {loading && (
          <View pointerEvents="none" style={styles.spinner}>
            <ActivityIndicator color={colors.tint} accessibilityLabel="아티스트 사진 불러오는 중" />
          </View>
        )}
      </View>
      {photo && (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="아티스트 사진 출처 및 라이선스 보기"
          onPress={() => void source()}
          style={styles.credit}
        >
          <Text numberOfLines={2} style={[styles.note, { color: colors.muted }]}>
            {photo.credit} · {photo.license}
          </Text>
          <Text style={[styles.note, { color: colors.tint }]}>
            {photo.provider ?? 'Wikimedia Commons'} · 사진 출처
          </Text>
        </Pressable>
      )}
      {allowed && current && !current.loading && !photo && (
        <View style={styles.feedback}>
          <Text style={[styles.note, { color: colors.muted }]}>
            {current.error ||
              (failedUri ? '사진을 표시하지 못했습니다.' : '일치하는 아티스트 사진이 없습니다.')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRetry((value) => value + 1)}
            style={styles.retry}
          >
            <Text style={{ color: colors.tint, fontSize: 12 }}>사진 다시 불러오기</Text>
          </Pressable>
        </View>
      )}
      {linkError && (
        <Text accessibilityRole="alert" style={[styles.note, { color: colors.tint }]}>
          {linkError}
        </Text>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  frame: { alignItems: 'center', alignSelf: 'stretch' },
  icon: {
    width: 104,
    height: 104,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: 104, height: 104 },
  spinner: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  credit: { alignItems: 'center', paddingTop: 8, paddingBottom: 5 },
  note: { fontSize: 11, lineHeight: 16, textAlign: 'center' },
  feedback: { alignItems: 'center', paddingTop: 8 },
  retry: { minHeight: 44, justifyContent: 'center' },
});
