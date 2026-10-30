import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PlaylistSheet } from '@/features/playlists/dialogs';
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
import { useLiquidGlass } from '@/theme/liquid-glass';
import { GlassBackdrop } from '@/components/glass-backdrop';
import { glassControlStyles } from '@/components/glass-controls';
import { useMusicSources } from './use-music-sources';

const labels = musicSourceLabels;
const sourceIcons = {
  all: 'musical-notes-outline',
  nas: 'server-outline',
  local: 'phone-portrait-outline',
  drive: 'logo-google',
  s3: 'file-tray-stacked-outline',
  mybox: 'cloud-outline',
} as const;

function SourceSection({ title, children }: { title: string; children: ReactNode }) {
  const glass = useLiquidGlass();
  const colors = useColors();
  if (!glass.supported) {
    return <>{children}</>;
  }
  return (
    <View style={{ gap: 8 }}>
      <Text
        accessibilityRole="header"
        style={{ color: colors.muted, fontSize: 12, fontWeight: '600', paddingHorizontal: 12 }}
      >
        {title}
      </Text>
      <View style={[styles.group, { backgroundColor: colors.rowSelected }]}>{children}</View>
    </View>
  );
}

function SourceOption({
  icon,
  label,
  onPress,
  selected,
  disabled,
  legacyIcon = true,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  legacyIcon?: boolean;
}) {
  const glass = useLiquidGlass();
  const colors = useColors();
  const selectable = selected !== undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selectable ? { selected } : undefined}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => {
        let optionBackgroundColor: string;
        if (selected) {
          optionBackgroundColor = colors.tint + '22';
        } else if (pressed) {
          optionBackgroundColor = colors.rowPressed;
        } else {
          optionBackgroundColor = 'transparent';
        }
        return [
          styles.option,
          glass.supported && [
            styles.sourceOption,
            {
              backgroundColor: optionBackgroundColor,
              opacity: disabled ? 0.5 : 1,
            },
          ],
        ];
      }}
    >
      {(glass.supported || legacyIcon) && (
        <Ionicons
          accessible={false}
          name={icon}
          size={glass.supported ? 21 : 22}
          color={glass.supported && !selected ? colors.muted : colors.tint}
          style={glass.supported && styles.sourceIcon}
        />
      )}
      <Text
        style={{
          flex: glass.supported || selectable ? 1 : undefined,
          color: glass.supported && selected ? colors.tint : colors.text,
          fontWeight: glass.supported || selectable ? '600' : undefined,
        }}
      >
        {label}
      </Text>
      {selected && <Ionicons accessible={false} name="checkmark" size={22} color={colors.tint} />}
    </Pressable>
  );
}

export function LocalMusicControls({
  sortControl,
  menuLabel,
}: {
  sortControl?: ReactNode;
  menuLabel?: string;
}) {
  const colors = useColors();
  const glass = useLiquidGlass();
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
  const [pendingImport, setPendingImport] = useState<ImportKind | null>(null);
  // Wait for the native sheet to close before presenting a system permission/file picker on iOS.
  function startImport(kind: ImportKind) {
    setPendingImport(kind);
    setOpen(false);
    if (Platform.OS !== 'ios') {
      setPendingImport(null);
      void local.importFiles(kind);
    }
  }
  let selectedSourceIcon: React.ComponentProps<typeof Ionicons>['name'];
  if (local.source === 'drive') {
    selectedSourceIcon = 'logo-google';
  } else if (local.source === 'mybox') {
    selectedSourceIcon = 'cloud-outline';
  } else if (local.source === 's3') {
    selectedSourceIcon = 'file-tray-stacked-outline';
  } else if (local.source === 'local') {
    selectedSourceIcon = 'phone-portrait-outline';
  } else if (local.source === 'nas') {
    selectedSourceIcon = 'server-outline';
  } else {
    selectedSourceIcon = 'musical-notes-outline';
  }
  return (
    <View style={styles.container}>
      <View style={styles.controlsRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="음악 소스 및 가져오기 메뉴"
          onPress={() => setOpen(true)}
          style={[
            styles.trigger,
            glass.supported && [
              glassControlStyles.button,
              { backgroundColor: glass.enabled ? 'transparent' : colors.surface, flexShrink: 1 },
            ],
          ]}
        >
          {glass.enabled && <GlassBackdrop style={{ borderRadius: 22 }} />}
          <Ionicons name={selectedSourceIcon} size={18} color={colors.tint} />
          <Text
            numberOfLines={glass.supported ? 1 : undefined}
            style={{
              color: colors.tint,
              fontWeight: '700',
              ...(glass.supported && { flexShrink: 1 }),
            }}
          >
            {menuLabel ?? labels[local.source]}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.tint} />
          {local.busy && <ActivityIndicator color={colors.tint} />}
        </Pressable>
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
      <PlaylistSheet
        title="음악 소스"
        glassSurface
        visible={open}
        onClose={() => setOpen(false)}
        onDismiss={() => {
          if (pendingImport) {
            const kind = pendingImport;
            setPendingImport(null);
            void local.importFiles(kind);
          }
        }}
      >
        <ScrollView
          style={glass.supported && styles.scrollBody}
          contentInsetAdjustmentBehavior={glass.supported ? 'never' : undefined}
          contentContainerStyle={[styles.body, glass.supported && { padding: 16, gap: 20 }]}
        >
          <SourceSection title="음악 보관함">
            {sources.map((source) => (
              <SourceOption
                key={source}
                icon={sourceIcons[source]}
                label={labels[source]}
                legacyIcon={false}
                selected={local.source === source}
                onPress={() => {
                  local.setSource(source);
                  setOpen(false);
                }}
              />
            ))}
          </SourceSection>
          {!glass.supported && (
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.separator }} />
          )}
          <SourceSection title="연결 관리">
            <SourceOption
              icon="logo-google"
              label="Google Drive 연결 관리"
              onPress={() => {
                setOpen(false);
                router.push('/settings/cloud/google-drive');
              }}
            />
            <SourceOption
              icon="file-tray-stacked-outline"
              label="S3 연결 관리"
              onPress={() => {
                setOpen(false);
                router.push('/settings/cloud/s3');
              }}
            />
            <SourceOption
              icon="cloud-outline"
              label="네이버 MYBOX 연결 관리"
              onPress={() => {
                setOpen(false);
                router.push('/settings/cloud/mybox');
              }}
            />
          </SourceSection>
          {!glass.supported && <Text style={{ color: colors.muted }}>기기 음악 가져오기</Text>}
          <SourceSection title="기기 음악 가져오기">
            {Platform.OS === 'android' && (
              <SourceOption
                icon="phone-portrait-outline"
                label="기기의 음악 전체 가져오기"
                disabled={local.busy}
                onPress={() => startImport('device')}
              />
            )}
            {Platform.OS !== 'web' && (
              <SourceOption
                icon="folder-outline"
                label="폴더 선택 · 하위 폴더 포함"
                disabled={local.busy}
                onPress={() => startImport('folder')}
              />
            )}
            <SourceOption
              icon="document-outline"
              label="파일 선택"
              disabled={local.busy}
              onPress={() => startImport('files')}
            />
          </SourceSection>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {Platform.OS === 'ios'
              ? 'iOS는 전체 음악 자동 조회를 지원하지 않습니다. 파일 앱의 폴더를 선택해 주세요.'
              : '전체 가져오기는 Android에 등록된 오디오를 조회합니다. 누락된 파일은 폴더 선택으로 가져올 수 있습니다.'}{' '}
            원본은 유지하며 앱 저장 공간에 복사합니다.
          </Text>
          {local.error && (
            <Text selectable style={{ color: colors.tint }}>
              {local.error}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={local.busy}
            onPress={() => {
              setOpen(false);
              void local.load();
            }}
            style={styles.option}
          >
            <Text style={{ color: colors.tint }}>저장된 음악 목록 다시 불러오기</Text>
          </Pressable>
          {mode === 'setup' && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setOpen(false);
                router.push('/connect');
              }}
              style={styles.option}
            >
              <Text style={{ color: colors.tint }}>NAS 연결</Text>
            </Pressable>
          )}
        </ScrollView>
      </PlaylistSheet>
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
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    minHeight: 40,
  },
  body: { padding: 22, gap: 10 },
  option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  group: { borderRadius: 22, padding: 8, gap: 2 },
  sourceOption: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
  sourceIcon: { width: 24, textAlign: 'center', flexShrink: 0 },
  scrollBody: { flexShrink: 1, minHeight: 0 },
});
