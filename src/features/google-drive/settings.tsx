import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { Text } from '@/components/text';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useGoogleDriveStore } from '@/stores/google-drive';
import { useColors } from '@/theme/tokens';
import { DriveFilePicker } from './file-picker';
import { DriveDocumentSettings } from './document-settings';
import { useDriveDocumentsStore } from '@/stores/drive-documents';
import { useSettingsMenuIconStyle } from '@/features/settings/settings-menu-layout';
export function GoogleDriveSettings() {
  const drive = useGoogleDriveStore(), colors = useColors(), documentsBusy = useDriveDocumentsStore(state => state.busy), apiBusy = drive.busy || drive.loading || drive.fileSaving, busy = apiBusy || documentsBusy;
  const iconStyle = useSettingsMenuIconStyle(colors.tint, null);
  const [filePicker, setFilePicker] = useState(false);
  function connect() {
    Alert.alert('Google Drive 연결', 'Google에서 직접 선택해 허용한 음악 파일만 불러옵니다. 선택한 파일 관리 권한(drive.file)을 요청하며, 앱은 음악과 태그를 읽어 재생하고 기기에 보관합니다. Drive 원본 파일은 수정하거나 삭제하지 않습니다.', [
      { text: '취소', style: 'cancel' }, { text: '연결', onPress: () => { void drive.connect(); } },
    ]);
  }
  return <View style={{ marginTop: 0, gap: 12 }}>
    <DriveDocumentSettings blocked={drive.busy || drive.fileSaving} />
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={iconStyle}><Ionicons name="logo-google" size={24} color={colors.tint} /></View><Text style={{ flex: 1, color: colors.text, fontSize: 17, fontWeight: '700' }}>Google API로 연결</Text>{drive.busy && <ActivityIndicator color={colors.tint} />}</View>
    <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>{drive.account ? drive.account.email : 'Google 계정으로 연결하면 Drive의 음악을 직접 스트리밍합니다.'} NAS 로그인과 독립적으로 사용합니다.</Text>
    {apiBusy && <View style={{ gap: 8 }}><Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 13 }}>{drive.progress ?? (drive.loading ? '음악 목록 불러오는 중' : drive.fileSaving ? '음악 선택 목록 저장 중' : 'Google 연결 준비 중')}</Text><Pressable accessibilityRole="button" onPress={drive.cancelConnection} style={{ paddingVertical: 10 }}><Text style={{ color: colors.tint }}>요청 취소</Text></Pressable></View>}
    {drive.error && <Text accessibilityLiveRegion="polite" style={{ color: colors.tint, fontSize: 13 }}>{drive.error}</Text>}
    {drive.metadataLoading && <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 12 }}>곡 태그·앨범아트 확인 중 · 음악은 바로 재생할 수 있습니다.</Text>}
    {drive.metadataWarning && <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 12 }}>{drive.metadataWarning}</Text>}
    <Pressable accessibilityRole="button" disabled={busy} onPress={connect} style={{ paddingVertical: 12, opacity: busy ? 0.5 : 1 }}><Text style={{ color: busy ? colors.muted : colors.tint, fontWeight: '700' }}>{drive.account ? 'Google 계정 변경' : 'Google Drive 연결'}</Text></Pressable>
    {drive.account && <>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{drive.files.length ? `선택한 음악 ${drive.files.length}개` : 'Google의 파일 선택 화면에서 재생할 음악을 선택해 주세요. 여러 파일을 함께 선택할 수 있습니다.'}</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void drive.pickFiles()} style={{ paddingVertical: 12 }}><Text style={{ color: busy ? colors.muted : colors.tint }}>Google 선택 창으로 음악 파일 추가</Text></Pressable>
      {drive.files.length > 0 && <><Pressable accessibilityRole="button" disabled={busy} onPress={() => setFilePicker(true)} style={{ paddingVertical: 12 }}><Text style={{ color: busy ? colors.muted : colors.tint }}>선택 목록 편집</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={() => void drive.refresh().catch(() => {})} style={{ paddingVertical: 12 }}><Text style={{ color: busy ? colors.muted : colors.tint }}>음악 목록 다시 불러오기</Text></Pressable></>}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => Alert.alert('Google Drive 연결 해제', 'Drive 곡의 재생을 종료하고 기기의 인증 정보를 삭제합니다.', [{ text: '취소', style: 'cancel' }, { text: '해제', style: 'destructive', onPress: () => { void drive.disconnect(); } }])} style={{ paddingVertical: 12 }}><Text style={{ color: busy ? colors.muted : colors.tint }}>연결 해제</Text></Pressable>
    </>}
    {!drive.account && drive.error && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void drive.disconnect()} style={{ paddingVertical: 12 }}><Text style={{ color: busy ? colors.muted : colors.tint }}>연결 정보 삭제 다시 시도</Text></Pressable>}
    <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>MP3·M4A·FLAC의 곡 제목·아티스트·앨범과 내장 앨범아트를 읽어 기기에 캐시합니다. 태그가 없거나 읽을 수 없는 파일은 파일명과 기본 이미지를 사용합니다. 음질 변환은 NAS 곡에만 적용합니다.</Text>
    <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>선택한 파일만 접근하는 drive.file 권한을 사용합니다. 폴더를 선택해 하위 음악을 자동으로 가져오는 방식은 지원하지 않습니다. 추가할 곡은 Google에서 다시 선택해 주세요.</Text>
    {filePicker && drive.account && <DriveFilePicker key={`${drive.account.id}:${drive.generation}`} onClose={() => setFilePicker(false)} />}
  </View>;
}
