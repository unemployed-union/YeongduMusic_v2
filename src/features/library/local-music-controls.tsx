import { MusicSourceTrigger } from './music-source-trigger';
import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { router, type Href } from 'expo-router';
import { MusicSourceMenuContent } from './music-source-menu-content';
import { MusicSourceSheet } from './music-source-sheet';
import { useS3Store } from '@/stores/s3';
import { useMyboxStore } from '@/stores/mybox';
import { musicSourceLabels } from '@/services/music-source';
import { useGoogleDriveStore } from '@/stores/google-drive';
import { useDriveDocumentsStore } from '@/stores/drive-documents';
import { useLocalMusicStore } from '@/stores/local-music';
import { useAuthStore } from '@/stores/auth';
import { useColors } from '@/theme/tokens';
import { DownloadStatus } from '@/features/offline-music/download-status';
import { useOfflineMusicStore } from '@/stores/offline-music';
import type { ImportKind } from '@/services/local-music/storage';
import { useMusicSources } from './use-music-sources';

const labels = musicSourceLabels;

export function LocalMusicControls({
  sortControl,
  menuLabel,
}: {
  sortControl?: ReactNode;
  menuLabel?: string;
}) {
  const colors = useColors();
  const local = useLocalMusicStore();
  const sources = useMusicSources();
  const drive = useGoogleDriveStore();
  const documents = useDriveDocumentsStore();
  const s3 = useS3Store();
  const mybox = useMyboxStore();
  const storing = useOfflineMusicStore((state) => state.busy);
  const mode = useAuthStore((state) => state.mode);
  const notice = useAuthStore((state) => state.notice);
  const [open, setOpen] = useState(false);
  const pendingAction = useRef<
    { kind: 'route'; href: Href } | { kind: 'import'; source: ImportKind } | null
  >(null);

  function openConnection(href: Href) {
    setOpen(false);
    if (Platform.OS === 'ios') {
      pendingAction.current = { kind: 'route', href };
    } else {
      router.push(href);
    }
  }
  // Wait for the native sheet to close before presenting a system permission/file picker on iOS.
  function startImport(kind: ImportKind) {
    setOpen(false);
    if (Platform.OS === 'ios') {
      pendingAction.current = { kind: 'import', source: kind };
    } else {
      void local.importFiles(kind);
    }
  }
  return (
    <View style={styles.container}>
      <View style={styles.controlsRow}>
        <MusicSourceTrigger
          selected={local.source}
          label={menuLabel ?? labels[local.source]}
          busy={local.busy}
          onPress={() => setOpen(true)}
        />
        {sortControl}
      </View>
      {local.busy && !storing && (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 12 }}>
          음악 가져오는 중 · {local.processed}개 확인
        </Text>
      )}
      {(local.source === 'local' || local.source === 'all') &&
        !local.songs.length &&
        !local.busy && (
          <Pressable onPress={() => setOpen(true)}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              음악 소스 메뉴에서 기기 음악을 가져오세요.
            </Text>
          </Pressable>
        )}
      {local.source === 'drive' && (
        <View style={{ gap: 8 }}>
          {drive.loading && <ActivityIndicator color={colors.tint} />}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/settings/cloud/google-drive')}
          >
            <Text style={{ color: colors.tint }}>Google Drive 음원 선택·관리</Text>
          </Pressable>
          {documents.error && (
            <Text style={{ color: colors.tint, fontSize: 12 }}>{documents.error}</Text>
          )}
          {drive.error && <Text style={{ color: colors.tint, fontSize: 12 }}>{drive.error}</Text>}
        </View>
      )}
      {local.source === 's3' && (
        <View style={{ gap: 8 }}>
          {s3.loading && <ActivityIndicator color={colors.tint} />}
          {!s3.connection && (
            <Pressable accessibilityRole="button" onPress={() => router.push('/settings/cloud/s3')}>
              <Text style={{ color: colors.tint }}>S3 연결하기</Text>
            </Pressable>
          )}
          {s3.error && (
            <Pressable accessibilityRole="button" onPress={() => void s3.refresh().catch(() => {})}>
              <Text style={{ color: colors.tint, fontSize: 12 }}>{s3.error} · 다시 시도</Text>
            </Pressable>
          )}
        </View>
      )}
      <DownloadStatus />
      {local.source === 'mybox' && (
        <View style={{ gap: 8 }}>
          {(mybox.busy || mybox.loading) && <ActivityIndicator color={colors.tint} />}
          {!mybox.connection && (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/settings/cloud/mybox')}
            >
              <Text style={{ color: colors.tint }}>MYBOX 연결하기</Text>
            </Pressable>
          )}
          {mybox.error && (
            <Text accessibilityRole="alert" style={{ color: colors.tint, fontSize: 12 }}>
              {mybox.error}
            </Text>
          )}
        </View>
      )}
      {notice && <Text style={{ color: colors.tint, fontSize: 12 }}>{notice}</Text>}
      {local.message && <Text style={{ color: colors.muted, fontSize: 12 }}>{local.message}</Text>}
      {local.error && (
        <Pressable accessibilityRole="button" onPress={() => setOpen(true)}>
          <Text numberOfLines={3} style={{ color: colors.tint, fontSize: 12 }}>
            {local.error} · 메뉴에서 다시 가져오기
          </Text>
        </Pressable>
      )}
      <MusicSourceSheet
        title="음악 소스"
        glassSurface
        visible={open}
        onClose={() => setOpen(false)}
        onDismiss={() => {
          const action = pendingAction.current;
          pendingAction.current = null;
          if (action?.kind === 'route') {
            router.push(action.href);
          } else if (action?.kind === 'import') {
            void local.importFiles(action.source);
          }
        }}
      >
        <MusicSourceMenuContent
          sources={sources}
          selected={local.source}
          busy={local.busy}
          error={local.error}
          setup={mode === 'setup'}
          onSelect={(source) => {
            local.setSource(source);
            setOpen(false);
          }}
          onOpenConnection={openConnection}
          onImport={startImport}
          onReload={() => {
            setOpen(false);
            void local.load();
          }}
        />
      </MusicSourceSheet>
    </View>
  );
}
const styles = StyleSheet.create({
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  container: { paddingHorizontal: 22, gap: 8, marginBottom: 8 },
});
