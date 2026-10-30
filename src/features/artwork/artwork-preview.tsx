import { useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/text';
import { useColors } from '@/theme/tokens';

/** Remount with the URI so a new selection starts with its own loading state. */
export function ArtworkPreview({ uri }: { uri?: string }) {
  const colors = useColors();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const loading = !!uri && !loaded && !failed;
  return (
    <View
      style={[styles.frame, { backgroundColor: colors.background, borderColor: colors.separator }]}
    >
      {uri && !failed && (
        <Image
          source={{ uri }}
          resizeMode="contain"
          style={styles.image}
          accessibilityLabel="앨범아트 미리보기"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
      {loading && (
        <View
          pointerEvents="none"
          style={[styles.feedback, { backgroundColor: colors.background }]}
        >
          <ActivityIndicator color={colors.tint} />
          <Text style={[styles.hint, { color: colors.muted }]}>앨범아트 불러오는 중…</Text>
        </View>
      )}
      {(!uri || failed) && (
        <View style={styles.feedback}>
          <Ionicons name="image-outline" size={34} color={colors.muted} />
          <Text style={[styles.title, { color: colors.text }]}>
            {failed ? '표지를 불러오지 못했습니다' : '앨범아트 없음'}
          </Text>
          <Text style={[styles.hint, { color: colors.muted }]}>
            이미지 파일을 선택하거나{'\n'}웹에서 표지를 찾아보세요.
          </Text>
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  frame: {
    width: 160,
    height: 160,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  image: { width: '100%', height: '100%' },
  feedback: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 10,
  },
  title: { fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'center' },
  hint: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
