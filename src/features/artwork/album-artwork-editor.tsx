import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text } from '@/components/text';
import { ScrollEdgeFade } from '@/components/scroll-edge-fade';
import { AsyncState } from '@/components/async-state';
import { PlaylistSheet } from '@/features/playlists/dialogs';
import { useColors } from '@/theme/tokens';
import { ArtworkEditor } from './artwork-editor';
import type { Album, Song } from '@/types/music';

export function AlbumArtworkEditor({
  album,
  songs,
  onClose,
  title = '앨범 이미지 선택',
  loading = false,
  error,
  onRetry,
}: {
  album: Album;
  songs: readonly Song[];
  onClose: () => void;
  title?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const colors = useColors();
  const working = useRef(false);
  const [busy, setBusy] = useState(false);
  // A mixed album can write supported sources while leaving read-only originals intact.
  const song = songs.find((item) => item.source !== 'drive' && item.source !== 'mybox') ?? songs[0];
  const close = () => {
    if (!working.current) {
      onClose();
    }
  };
  return (
    <PlaylistSheet title={title} onClose={close}>
      <ScrollEdgeFade fill={false} backgroundColor={colors.surface}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.body}
        >
          <Text style={[styles.title, { color: colors.text }]}>{album.title}</Text>
          <AsyncState loading={loading} error={error} retry={onRetry}>
            {song ? (
              <ArtworkEditor
                song={song}
                album={album.title}
                artist={album.artist}
                albumSongs={songs}
                albumGroupId={album.id}
                disabled={false}
                onBusyChange={(value) => {
                  working.current = value;
                  setBusy(value);
                }}
              />
            ) : (
              <Text style={{ color: colors.muted }}>현재 보관함에 표시할 앨범 곡이 없습니다.</Text>
            )}
          </AsyncState>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={close}
            style={styles.close}
          >
            <Text style={{ color: colors.muted }}>닫기</Text>
          </Pressable>
        </ScrollView>
      </ScrollEdgeFade>
    </PlaylistSheet>
  );
}
const styles = StyleSheet.create({
  body: { padding: 22, gap: 16, paddingBottom: 28 },
  title: { fontSize: 16, fontWeight: '700' },
  close: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
