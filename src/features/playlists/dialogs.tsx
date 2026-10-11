import { useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { enqueue } from '@/services/playback/controller';
import { usePlaylistStore } from '@/stores/playlists';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { hiddenMatcher } from '@/features/hidden-music/rules';
import { useColors } from '@/theme/tokens';
import type { Song } from '@/types/music';

export function PlaylistSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const colors = useColors(), insets = useSafeAreaInsets();
  return <Modal transparent animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="닫기" onPress={onClose} />
      <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 16), maxHeight: '85%' }]}>
        <View style={styles.header}><Text style={[styles.heading, { color: colors.text }]}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} style={styles.icon}><Ionicons name="close" size={24} color={colors.muted} /></Pressable></View>
        {children}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
export function PlaylistNameDialog({ title, initialName = '', onSave, onClose }: { title: string; initialName?: string; onSave: (name: string) => Promise<unknown>; onClose: () => void }) {
  const colors = useColors();
  const [name, setName] = useState(initialName), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  async function save() {
    if (busy) return;
    setBusy(true); setError(null);
    try { await onSave(name); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : '저장하지 못했습니다.'); } finally { setBusy(false); }
  }
  return <PlaylistSheet title={title} onClose={onClose}><View style={styles.body}>
    <TextInput autoFocus accessibilityLabel="플레이리스트 이름" placeholder="예: 운동, 드라이브, 잠들기 전" placeholderTextColor={colors.muted} value={name} onChangeText={setName} maxLength={60} editable={!busy} returnKeyType="done" onSubmitEditing={() => void save()} style={[styles.input, { color: colors.text, borderColor: colors.separator }]} />
    {error && <Text accessibilityRole="alert" style={{ color: colors.tint }}>{error}</Text>}
    <Pressable accessibilityRole="button" disabled={busy || !name.trim()} onPress={() => void save()} style={[styles.primary, { backgroundColor: colors.tint, opacity: busy || !name.trim() ? 0.5 : 1 }]}>{busy ? <ActivityIndicator color="white" /> : <Text style={styles.primaryText}>저장</Text>}</Pressable>
  </View></PlaylistSheet>;
}
export function AddToPlaylistDialog({ songs, onClose, allowEnqueue = false }: { songs: Song[]; onClose: () => void; allowEnqueue?: boolean }) {
  const colors = useColors();
  const store = usePlaylistStore();
  const privacy = useHiddenMusicStore();
  const [name, setName] = useState(''), [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null);
  const available = store.ready && store.scope === privacy.scope && privacy.ready;
  const hidden = hiddenMatcher(privacy.profile.presets);
  const eligible = songs.filter((song) => !hidden(song));
  const ids = [...new Set(eligible.map((song) => song.id))];
  async function save(id?: string) {
    if (!available || store.busy || !ids.length) return;
    setError(null); setMessage(null);
    try {
      if (id) {
        const preset = store.profile.presets.find((item) => item.id === id);
        const added = ids.filter((value) => !preset?.songIds.includes(value)).length;
        await store.addSongs(id, ids);
        setMessage(added ? `${preset?.name}에 ${added}곡을 추가했습니다.` : '이미 모두 저장된 곡입니다.');
      } else { await store.createPreset(name, ids); setMessage(`${name.trim()}에 ${ids.length}곡을 저장했습니다.`); setName(''); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '저장하지 못했습니다.'); }
  }
  async function addToQueue() {
    if (!eligible[0]) return;
    try { await enqueue(eligible[0]); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : '추가하지 못했습니다.'); }
  }
  return <PlaylistSheet title="플레이리스트에 추가" onClose={onClose}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
    <Text style={{ color: colors.muted }}>{ids.length}곡 · 여러 목록에 저장할 수 있습니다.</Text>
    {allowEnqueue && <Pressable style={styles.option} onPress={() => void addToQueue()} disabled={!eligible.length}><Ionicons name="list" size={22} color={colors.tint} /><Text style={{ color: colors.text }}>다음 재생 대기열에 추가</Text></Pressable>}
    {!available ? <View><Text style={{ color: colors.muted }}>{store.error ?? '플레이리스트를 불러오는 중입니다.'}</Text>{store.error && <Pressable onPress={() => void store.load(privacy.scope)} style={styles.option}><Text style={{ color: colors.tint }}>다시 불러오기</Text></Pressable>}</View> : <>
      <TextInput accessibilityLabel="새 플레이리스트 이름" placeholder="새 플레이리스트 이름" placeholderTextColor={colors.muted} value={name} onChangeText={setName} maxLength={60} editable={!store.busy} style={[styles.input, { color: colors.text, borderColor: colors.separator }]} />
      <Pressable accessibilityRole="button" disabled={store.busy || !name.trim() || !ids.length} onPress={() => void save()} style={[styles.primary, { backgroundColor: colors.tint, opacity: store.busy || !name.trim() || !ids.length ? 0.5 : 1 }]}><Text style={styles.primaryText}>새 목록으로 저장</Text></Pressable>
      {store.profile.presets.map((preset) => <Pressable key={preset.id} disabled={store.busy || !ids.length} accessibilityRole="button" accessibilityLabel={preset.name + '에 추가'} onPress={() => void save(preset.id)} style={[styles.option, { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}><Ionicons name="musical-notes-outline" size={24} color={colors.tint} /><Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontWeight: '600' }}>{preset.name}</Text><Ionicons name="add-circle-outline" size={24} color={colors.tint} /></Pressable>)}
    </>}
    {store.busy && <ActivityIndicator color={colors.tint} />}
    {(error || message) && <Text accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite" style={{ color: colors.tint }}>{error ?? message}</Text>}
  </ScrollView></PlaylistSheet>;
}
const styles = StyleSheet.create({ overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' }, sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12 }, header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22 }, heading: { flex: 1, fontSize: 20, fontWeight: '800' }, icon: { padding: 10 }, body: { padding: 22, gap: 16 }, input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 }, primary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, primaryText: { color: 'white', fontWeight: '700', fontSize: 15 }, option: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 } });
