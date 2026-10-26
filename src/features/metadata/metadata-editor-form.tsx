import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { TextInput } from '@/components/text-input';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatedSwitch } from '@/components/animated-switch';
import { Text } from '@/components/text';
import { ToastNotice } from '@/components/toast-notice';
import { ScrollEdgeFade } from '@/components/scroll-edge-fade';
import { useColors } from '@/theme/tokens';
import { useAuthStore } from '@/stores/auth';
import { useSongMetadataStore } from '@/stores/song-metadata';
import { privacyScope } from '@/features/hidden-music/rules';
import { applyMetadata, METADATA_FIELDS, metadataDraft, metadataKey, parseMetadata } from './rules';
import { fileWriteDescription, fileWriteUnavailable } from './file-options';
import { MetadataWebOptions } from './metadata-web-options';
import type { Page, Song } from '@/types/music';

export function MetadataEditorForm({ song, onSaved, onCancel, onBusyChange }: { song: Song; onSaved: () => void; onCancel: () => void; onBusyChange?: (busy: boolean) => void }) {
  const colors = useColors(), store = useSongMetadataStore();
  const queryClient = useQueryClient();
  const auth = useAuthStore(), scope = privacyScope(auth.mode, auth.session);
  const key = metadataKey(song, scope);
  const [originalKey] = useState(key);
  const [draft, setDraft] = useState(() => metadataDraft(applyMetadata(song, key ? store.patches[key] : undefined)));
  const [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null);
  const [writeFile, setWriteFile] = useState(false), [progress, setProgress] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const running = useRef(false), mounted = useRef(true), load = store.load;
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  const unavailable = !store.ready || store.loading || store.loadError || !key || key !== originalKey;
  const busy = saving || store.busy || searching;
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  const fileUnavailable = fileWriteUnavailable(song, auth.mode, Platform.OS);
  const cloudFileWriteBlocked = song.source === 'drive' || song.source === 'mybox';
  const showDriveNotice = () => setToast({ message: fileWriteDescription(song) });
  const fileOption = <><View style={{ flex: 1, gap: 6 }}><Text style={{ color: colors.text, fontWeight: '600' }}>파일에도 메타데이터 저장</Text>
    <Text style={[styles.note, { color: colors.muted }]}>{fileUnavailable ?? fileWriteDescription(song)}</Text></View>
    <View pointerEvents={cloudFileWriteBlocked ? 'none' : 'auto'}><AnimatedSwitch accessibilityLabel="파일에도 메타데이터 저장" value={writeFile && !fileUnavailable}
      disabled={busy || unavailable || !!fileUnavailable} onValueChange={value => { if (cloudFileWriteBlocked) showDriveNotice(); else setWriteFile(value); }} /></View></>;
  async function save(reset = false) {
    if (running.current || busy || unavailable || !originalKey) return;
    running.current = true; setSaving(true); setError(null); setProgress(null);
    let fileMessage: string | null = null;
    try {
      if (metadataKey(song, privacyScope(useAuthStore.getState().mode, useAuthStore.getState().session)) !== originalKey) throw new Error('계정이 변경되었습니다. 곡 메뉴에서 다시 열어 주세요.');
      if (reset) await store.reset(originalKey);
      else {
        const fields = parseMetadata(draft);
        if (writeFile && !cloudFileWriteBlocked) {
          if (fileUnavailable) throw new Error(fileUnavailable);
          const { writeSongFile } = await import('@/services/metadata/write-song-file');
          const { libraryIdentity } = await import('@/features/library/repository');
          const latestSong = !song.source || song.source === 'nas' ? queryClient.getQueryData<Page<Song>>(['song-library', libraryIdentity(auth.mode, auth.session)])?.items.find(item => item.id === song.id) ?? song : song;
          const result = await writeSongFile(latestSong, fields, value => { if (mounted.current) setProgress(value); });
          fileMessage = result.message;
          const latestAuth = useAuthStore.getState();
          if (metadataKey(song, privacyScope(latestAuth.mode, latestAuth.session)) !== originalKey) throw new Error('계정이 변경되어 현재 화면의 앱 정보는 저장하지 않았습니다.');
          if (!song.source || song.source === 'nas') {
            queryClient.setQueryData<Page<Song>>(['song-library', libraryIdentity(latestAuth.mode, latestAuth.session)], page => page ? {
              ...page, items: page.items.map(item => item.id === result.song.id ? result.song : item),
            } : page);
          }
        }
        await store.save(originalKey, fields);
      }
      if (fileMessage && mounted.current) Alert.alert('파일 저장 완료', fileMessage);
      if (mounted.current) onSaved();
    } catch (cause) { if (mounted.current) setError((fileMessage ? fileMessage + '\n앱 정보 저장은 완료하지 못했습니다. ' : '') + (cause instanceof Error ? cause.message : '곡 정보를 저장하지 못했습니다.')); }
    finally { running.current = false; if (mounted.current) { setSaving(false); setProgress(null); } }
  }
  return <><ScrollEdgeFade fill={false} backgroundColor={colors.surface}><ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.body}>
    <Text style={[styles.note, { color: colors.muted }]}>{cloudFileWriteBlocked ? `${song.source === 'mybox' ? 'MYBOX' : 'Google Drive'} 원본은 유지하고, 이 기기의 앱에 표시되는 곡 정보만 수정합니다.` : '곡 정보를 이 기기의 앱에 저장합니다. 아래 옵션을 켜면 음악 파일의 태그에도 기록합니다.'}</Text>
    <MetadataWebOptions songKey={key} draft={draft} onChange={setDraft} disabled={saving || store.busy || unavailable} onBusyChange={setSearching} />
    {METADATA_FIELDS.map(field => <View key={field.key} style={styles.field}>
      <Text style={{ color: colors.text, fontWeight: '600' }}>{field.label}{field.key === 'title' ? ' · 필수' : ''}</Text>
      <TextInput accessibilityLabel={field.label} value={draft[field.key]} onChangeText={value => setDraft(current => ({ ...current, [field.key]: value }))}
        editable={!busy && !unavailable} keyboardType={field.numeric ? 'number-pad' : 'default'} maxLength={field.numeric ? 4 : 300} autoCorrect={false}
        placeholder={field.key === 'albumArtist' ? '비우면 곡의 아티스트로 분류' : field.numeric ? '선택 사항' : ''} placeholderTextColor={colors.muted}
        style={[styles.input, { color: colors.text, borderColor: colors.separator }]} />
    </View>)}
    {cloudFileWriteBlocked ? <Pressable accessibilityRole="button" accessibilityLabel={`${song.source === 'mybox' ? 'MYBOX' : 'Google Drive'} 파일 직접 수정 안내`} disabled={busy || unavailable} onPress={showDriveNotice} style={styles.fileOption}>{fileOption}</Pressable> : <View style={styles.fileOption}>{fileOption}</View>}
    {progress && <Text accessibilityLiveRegion="polite" style={{ color: colors.tint }}>{progress}</Text>}
    {saving && writeFile && !cloudFileWriteBlocked && <Text style={[styles.note, { color: colors.muted }]}>이 화면을 닫아도 진행 중인 파일 저장은 계속됩니다.</Text>}
    {(error || store.error || key !== originalKey) && <Text accessibilityRole="alert" style={{ color: colors.tint }}>{key !== originalKey ? '계정이 변경되었습니다. 곡 메뉴에서 다시 열어 주세요.' : error || store.error}</Text>}
    {store.loadError && <Pressable accessibilityRole="button" disabled={store.loading || busy} onPress={() => void load(true)} style={styles.secondary}><Text style={{ color: colors.tint }}>다시 불러오기</Text></Pressable>}
    <Pressable accessibilityRole="button" disabled={busy || unavailable || !draft.title.trim()} onPress={() => void save()} style={[styles.primary, { backgroundColor: colors.tint, opacity: busy || unavailable || !draft.title.trim() ? 0.5 : 1 }]}>{saving ? <ActivityIndicator color="white" /> : <Text style={styles.primaryText}>저장</Text>}</Pressable>
    {!!originalKey && !!store.patches[originalKey] && <><Pressable accessibilityRole="button" disabled={busy || unavailable} onPress={() => void save(true)} style={styles.secondary}><Text style={{ color: colors.tint }}>앱의 수정 내용 지우기</Text></Pressable><Text style={[styles.note, { color: colors.muted }]}>{cloudFileWriteBlocked ? `앱의 수정 내용만 지우고 ${song.source === 'mybox' ? 'MYBOX' : 'Drive'}에서 읽은 곡 정보로 돌아갑니다.` : '앱의 수정 내용만 지웁니다. 파일에 기록한 태그는 되돌리지 않습니다.'}</Text></>}
    <Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} style={styles.secondary}><Text style={{ color: colors.muted }}>취소</Text></Pressable>
  </ScrollView></ScrollEdgeFade>{toast && <ToastNotice message={toast.message} />}</>;
}
const styles = StyleSheet.create({ body: { padding: 22, gap: 16, paddingBottom: 28 }, note: { fontSize: 13, lineHeight: 20 }, field: { gap: 7 },
  fileOption: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 }, primary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  primaryText: { color: 'white', fontWeight: '700', fontSize: 15 }, secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' } });
