import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useGoogleDriveStore } from '@/stores/google-drive';
import { useColors } from '@/theme/tokens';
import { DriveFolderPicker } from './folder-picker';
export function GoogleDriveSettings() {
  const drive = useGoogleDriveStore(), colors = useColors(), busy = drive.busy || drive.loading || drive.folderSaving;
  const [folderPicker, setFolderPicker] = useState(false);
  function connect() {
    Alert.alert('Google Drive 연결', '음악 목록 조회와 스트리밍을 위해 Drive 파일의 읽기·다운로드 권한을 요청합니다. 권한은 Drive 전체에 적용되지만 앱은 연결 후 선택한 음악 폴더만 조회합니다. 파일을 수정하거나 업로드하지 않습니다.', [
      { text: '취소', style: 'cancel' }, { text: '연결', onPress: () => { void drive.connect(); } },
    ]);
  }
  return <View style={{ marginTop: 28, gap: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Ionicons name="cloud-outline" size={24} color={colors.tint} /><Text style={{ flex: 1, color: colors.text, fontSize: 17, fontWeight: '700' }}>Google Drive</Text>{busy && <ActivityIndicator color={colors.tint} />}</View>
    <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>{drive.account ? drive.account.email : 'Google 계정으로 연결하면 Drive의 음악을 직접 스트리밍합니다.'} NAS 로그인과 독립적으로 사용합니다.</Text>
    {busy && <View style={{ gap: 8 }}><Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 13 }}>{drive.progress ?? (drive.loading ? '음악 목록 불러오는 중' : drive.folderSaving ? '음악 폴더 저장 중' : 'Google 연결 준비 중')}</Text><Pressable accessibilityRole="button" onPress={drive.cancelConnection} style={{ paddingVertical: 10 }}><Text style={{ color: colors.tint }}>요청 취소</Text></Pressable></View>}
    {drive.error && <Text accessibilityLiveRegion="polite" style={{ color: colors.tint, fontSize: 13 }}>{drive.error}</Text>}
    {drive.metadataLoading && <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 12 }}>곡 태그·앨범아트 확인 중 · 음악은 바로 재생할 수 있습니다.</Text>}
    {drive.metadataWarning && <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 12 }}>{drive.metadataWarning}</Text>}
    <Pressable accessibilityRole="button" disabled={busy} onPress={connect} style={{ paddingVertical: 12, opacity: busy ? 0.5 : 1 }}><Text style={{ color: colors.tint, fontWeight: '700' }}>{drive.account ? 'Google 계정 변경' : 'Google Drive 연결'}</Text></Pressable>
    {drive.account && <>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{drive.folder ? `음악 폴더: ${drive.folder.name} · 하위 폴더 포함` : '음악 폴더를 선택하면 해당 폴더의 음악만 불러옵니다.'}</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => setFolderPicker(true)} style={{ paddingVertical: 12 }}><Text style={{ color: colors.tint }}>{drive.folder ? '음악 폴더 변경' : '음악 폴더 선택'}</Text></Pressable>
      {drive.folder && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void drive.refresh().catch(() => {})} style={{ paddingVertical: 12 }}><Text style={{ color: colors.tint }}>음악 목록 다시 불러오기</Text></Pressable>}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => Alert.alert('Google Drive 연결 해제', 'Drive 곡의 재생을 종료하고 기기의 인증 정보를 삭제합니다.', [{ text: '취소', style: 'cancel' }, { text: '해제', style: 'destructive', onPress: () => { void drive.disconnect(); } }])} style={{ paddingVertical: 12 }}><Text style={{ color: colors.tint }}>연결 해제</Text></Pressable>
    </>}
    {!drive.account && drive.error && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void drive.disconnect()} style={{ paddingVertical: 12 }}><Text style={{ color: colors.tint }}>연결 정보 삭제 다시 시도</Text></Pressable>}
    <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>MP3·M4A·FLAC의 곡 제목·아티스트·앨범과 내장 앨범아트를 읽어 기기에 캐시합니다. 태그가 없거나 읽을 수 없는 파일은 파일명과 기본 이미지를 사용합니다. 음질 변환은 NAS 곡에만 적용합니다.</Text>
    <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>앱은 선택한 음악 폴더만 조회하지만 Google 읽기 권한 자체는 Drive 전체에 적용됩니다. 폴더 바로가기는 따라가지 않습니다.</Text>
    {folderPicker && drive.account && <DriveFolderPicker key={`${drive.account.id}:${drive.generation}`} onClose={() => setFolderPicker(false)} />}
  </View>;
}
