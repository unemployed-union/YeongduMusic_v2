import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PlaylistSheet } from '@/features/playlists/dialogs';
import { useS3Store } from '@/stores/s3';
import { musicSourceLabels } from '@/services/music-source';
import { useGoogleDriveStore } from '@/stores/google-drive';
import { useLocalMusicStore } from '@/stores/local-music';
import { useAuthStore } from '@/stores/auth';
import { useColors } from '@/theme/tokens';
import { DownloadStatus } from '@/features/offline-music/download-status';
import { useOfflineMusicStore } from '@/stores/offline-music';
import type { ImportKind } from '@/services/local-music/storage';

const labels = musicSourceLabels;
export function LocalMusicControls({ sortControl }: { sortControl?: ReactNode }) {
  const colors = useColors();
  const local = useLocalMusicStore();
  const drive = useGoogleDriveStore();
  const s3 = useS3Store();
  const storing = useOfflineMusicStore(state => state.busy);
  const mode = useAuthStore((state) => state.mode);
  const notice = useAuthStore((state) => state.notice);
  const [open, setOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<ImportKind | null>(null);
  // Wait for the native sheet to close before presenting a system permission/file picker on iOS.
  function startImport(kind: ImportKind) { setPendingImport(kind); setOpen(false); if (Platform.OS !== 'ios') { setPendingImport(null); void local.importFiles(kind); } }
  return <View style={styles.container}>
    <View style={styles.controlsRow}>
    <Pressable accessibilityRole="button" accessibilityLabel="음악 소스 및 가져오기 메뉴" onPress={() => setOpen(true)} style={styles.trigger}>
      <Ionicons name={local.source === 'drive' || local.source === 's3' ? 'cloud-outline' : local.source === 'local' ? 'phone-portrait-outline' : local.source === 'nas' ? 'server-outline' : 'musical-notes-outline'} size={18} color={colors.tint} />
      <Text style={{ color: colors.tint, fontWeight: '700' }}>{labels[local.source]}</Text><Ionicons name="chevron-down" size={16} color={colors.tint} />
      {local.busy && <ActivityIndicator color={colors.tint} />}
    </Pressable>
    {sortControl}
    </View>
    {local.busy && !storing && <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 12 }}>음악 가져오는 중 · {local.processed}개 확인</Text>}
    {(local.source === 'local' || local.source === 'all') && !local.songs.length && !local.busy && <Pressable onPress={() => setOpen(true)}><Text style={{ color: colors.muted, fontSize: 12 }}>음악 소스 메뉴에서 기기 음악을 가져오세요.</Text></Pressable>}
    {local.source === 'drive' && <View style={{ gap: 8 }}>{drive.loading && <ActivityIndicator color={colors.tint} />}{(!drive.account || !drive.folders.length) && <Pressable accessibilityRole="button" onPress={() => router.push('/settings/cloud/google-drive')}><Text style={{ color: colors.tint }}>{drive.account ? 'Google Drive 음악 폴더 선택하기' : 'Google Drive 연결하기'}</Text></Pressable>}{drive.error && <Text style={{ color: colors.tint, fontSize: 12 }}>{drive.error}</Text>}</View>}
    {local.source === 's3' && <View style={{ gap: 8 }}>{s3.loading && <ActivityIndicator color={colors.tint} />}{!s3.connection && <Pressable accessibilityRole="button" onPress={() => router.push('/settings/cloud/s3')}><Text style={{ color: colors.tint }}>S3 연결하기</Text></Pressable>}{s3.error && <Pressable accessibilityRole="button" onPress={() => void s3.refresh().catch(() => {})}><Text style={{ color: colors.tint, fontSize: 12 }}>{s3.error} · 다시 시도</Text></Pressable>}</View>}
    <DownloadStatus />
    {notice && <Text style={{ color: colors.tint, fontSize: 12 }}>{notice}</Text>}
    {local.message && <Text style={{ color: colors.muted, fontSize: 12 }}>{local.message}</Text>}
    {local.error && <Pressable accessibilityRole="button" onPress={() => setOpen(true)}><Text numberOfLines={3} style={{ color: colors.tint, fontSize: 12 }}>{local.error} · 메뉴에서 다시 가져오기</Text></Pressable>}
    <PlaylistSheet title="음악 소스" visible={open} onClose={() => setOpen(false)} onDismiss={() => { if (pendingImport) { const kind = pendingImport; setPendingImport(null); void local.importFiles(kind); } }}>
      <ScrollView contentContainerStyle={styles.body}>
        {(['all', 'nas', 'local', 'drive', 's3'] as const).map((source) => <Pressable key={source} accessibilityRole="button" accessibilityState={{ selected: local.source === source }} onPress={() => { local.setSource(source); setOpen(false); }} style={styles.option}><Text style={{ flex: 1, color: colors.text, fontWeight: '600' }}>{labels[source]}</Text>{local.source === source && <Ionicons name="checkmark" size={22} color={colors.tint} />}</Pressable>)}
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.separator }} />
        <Pressable accessibilityRole="button" onPress={() => { setOpen(false); router.push('/settings/cloud/google-drive'); }} style={styles.option}><Ionicons name="cloud-outline" size={22} color={colors.tint} /><Text style={{ color: colors.text }}>Google Drive 연결 관리</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => { setOpen(false); router.push('/settings/cloud/s3'); }} style={styles.option}><Ionicons name="cloud-outline" size={22} color={colors.tint} /><Text style={{ color: colors.text }}>S3 연결 관리</Text></Pressable>
        <Text style={{ color: colors.muted }}>기기 음악 가져오기</Text>
        {Platform.OS === 'android' && <Pressable accessibilityRole="button" disabled={local.busy} onPress={() => startImport('device')} style={styles.option}><Ionicons name="phone-portrait-outline" size={22} color={colors.tint} /><Text style={{ color: colors.text }}>기기의 음악 전체 가져오기</Text></Pressable>}
        {Platform.OS !== 'web' && <Pressable accessibilityRole="button" disabled={local.busy} onPress={() => startImport('folder')} style={styles.option}><Ionicons name="folder-outline" size={22} color={colors.tint} /><Text style={{ color: colors.text }}>폴더 선택 · 하위 폴더 포함</Text></Pressable>}
        <Pressable accessibilityRole="button" disabled={local.busy} onPress={() => startImport('files')} style={styles.option}><Ionicons name="document-outline" size={22} color={colors.tint} /><Text style={{ color: colors.text }}>파일 선택</Text></Pressable>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{Platform.OS === 'ios' ? 'iOS는 전체 음악 자동 조회를 지원하지 않습니다. 파일 앱의 폴더를 선택해 주세요.' : '전체 가져오기는 Android에 등록된 오디오를 조회합니다. 누락된 파일은 폴더 선택으로 가져올 수 있습니다.'} 원본은 유지하며 앱 저장 공간에 복사합니다.</Text>
        {local.error && <Text selectable style={{ color: colors.tint }}>{local.error}</Text>}
        <Pressable accessibilityRole="button" disabled={local.busy} onPress={() => { setOpen(false); void local.load(); }} style={styles.option}><Text style={{ color: colors.tint }}>저장된 음악 목록 다시 불러오기</Text></Pressable>
        {mode === 'setup' && <Pressable accessibilityRole="button" onPress={() => { setOpen(false); router.push('/connect'); }} style={styles.option}><Text style={{ color: colors.tint }}>NAS 연결</Text></Pressable>}
      </ScrollView>
    </PlaylistSheet>
  </View>;
}
const styles = StyleSheet.create({ controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, container: { paddingHorizontal: 22, gap: 8, marginBottom: 8 }, trigger: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, minHeight: 40 }, body: { padding: 22, gap: 10 }, option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 } });
