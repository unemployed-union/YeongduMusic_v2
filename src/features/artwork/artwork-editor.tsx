import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/text';
import { AnimatedSwitch } from '@/components/animated-switch';
import { useColors } from '@/theme/tokens';
import { useAuthStore } from '@/stores/auth';
import { useSongArtworkStore } from '@/stores/song-artwork';
import { useHiddenMusicStore } from '@/stores/hidden-music';
import { useSongs } from '@/features/library/queries';
import { useQueryClient } from '@tanstack/react-query';
import { ToastNotice } from '@/components/toast-notice';
import { DRIVE_FILE_READ_ONLY_MESSAGE, fileWriteDescription, fileWriteUnavailable } from '@/features/metadata/file-options';
import { hiddenMatcher, privacyScope } from '@/features/hidden-music/rules';
import { metadataKey } from '@/features/metadata/rules';
import { searchArtwork, type ArtworkCandidate } from '@/services/artwork/search';
import { artworkTargets, artworkUri } from './rules';
import type { Page, Song } from '@/types/music';

export function ArtworkEditor({ song, album, artist, disabled, onBusyChange }: {
  song: Song; album: string; artist: string; disabled: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const colors = useColors(), store = useSongArtworkStore();
  const queryClient = useQueryClient();
  const auth = useAuthStore(), scope = privacyScope(auth.mode, auth.session), key = metadataKey(song, scope);
  const [originalKey] = useState(key), [expanded, setExpanded] = useState(false), [wholeAlbum, setWholeAlbum] = useState(false);
  const [albumQuery, setAlbumQuery] = useState<string | null>(null), [artistQuery, setArtistQuery] = useState<string | null>(null);
  const [selection, setSelection] = useState<string | null>(null), [selectedId, setSelectedId] = useState<string | null>(null);
  const [results, setResults] = useState<ArtworkCandidate[] | null>(null), [failed, setFailed] = useState<string[]>([]);
  const [working, setWorking] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [writeFile, setWriteFile] = useState(false), [progress, setProgress] = useState<string | null>(null), [toast, setToast] = useState<{ message: string } | null>(null);
  const controller = useRef<AbortController | null>(null), mounted = useRef(true);
  const { data, isPending, isFetching } = useSongs(expanded);
  const load = store.load;
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => () => { controller.current?.abort(); }, [key]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 3500); return () => clearTimeout(timer); }, [toast]);
  const currentSong = data?.items.find(item => metadataKey(item, scope) === key) ?? song;
  const albumKeys = useMemo(() => artworkTargets(currentSong, data?.items ?? [], scope, true), [currentSong, data?.items, scope]);
  const keys = wholeAlbum ? albumKeys : key ? [key] : [];
  const targetSongs = [currentSong, ...(data?.items ?? []).filter(item => metadataKey(item, scope) !== key && keys.includes(metadataKey(item, scope) ?? ''))];
  const fileTargets = targetSongs.filter(item => item.source !== 'drive');
  const driveReadOnly = song.source === 'drive';
  const fileUnavailable = driveReadOnly ? DRIVE_FILE_READ_ONLY_MESSAGE : fileTargets.map(item => fileWriteUnavailable(item, auth.mode, Platform.OS)).find(Boolean) ?? null;
  function targetsVisible() {
    const hidden = useHiddenMusicStore.getState();
    if (!hidden.ready || hidden.scope !== scope) return false;
    const matches = hiddenMatcher(hidden.profile.presets);
    return ![song, ...(data?.items ?? []).filter(item => keys.includes(metadataKey(item, scope) ?? ''))].some(matches);
  }
  const unavailable = disabled || !store.ready || store.loading || store.loadError || store.busy || !key || key !== originalKey;
  const preview = selection ? artworkUri(selection, store.baseUri) : selectedId ? results?.find(item => item.id === selectedId)?.uri
    : key && store.patches[key] ? artworkUri(store.patches[key], store.baseUri) : currentSong.artworkUrl;
  async function work(action: (signal: AbortSignal, allowed: () => boolean) => Promise<void>) {
    if (unavailable || controller.current) return;
    const current = new AbortController(); controller.current = current;
    const allowed = () => mounted.current && !current.signal.aborted && metadataKey(song, privacyScope(useAuthStore.getState().mode, useAuthStore.getState().session)) === originalKey;
    const stop = useHiddenMusicStore.subscribe(() => { if (!targetsVisible()) current.abort(); });
    setWorking(true); onBusyChange(true); setError(null); setNotice(null);
    try { await action(current.signal, allowed); }
    catch (cause) { if (mounted.current && !current.signal.aborted) setError(cause instanceof Error ? cause.message : '앨범아트를 수정하지 못했습니다.'); }
    finally { stop(); if (controller.current === current) controller.current = null; if (mounted.current) { setWorking(false); setProgress(null); onBusyChange(false); } }
  }
  const busy = unavailable || working;
  return <View style={[styles.body, { borderColor: colors.separator }]}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={styles.button}>
      <Text style={{ color: colors.tint, fontWeight: '700' }}>앨범아트 수정 {expanded ? '접기' : '열기'}</Text>
    </Pressable>
    {expanded && <>
      {preview ? <Image source={{ uri: preview }} resizeMode="contain" style={styles.preview} accessibilityLabel="앨범아트 미리보기" /> : <View style={[styles.preview, { backgroundColor: colors.separator }]}><Text style={{ color: colors.muted }}>앨범아트 없음</Text></View>}
      <Text style={[styles.note, { color: colors.muted }]}>아래 ‘앨범아트 적용’으로 별도 저장합니다. 기본값은 앱 표시용이며, ‘파일에도 앨범아트 저장’을 켜면 음악 파일의 앞면 표지도 변경합니다. JPEG·PNG·WebP, {Platform.OS === 'web' ? '2' : '8'}MB 이하의 이미지를 사용할 수 있습니다.</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void work(async (signal, allowed) => {
        const { pickArtwork } = await import('@/services/artwork/files');
        const value = await pickArtwork(signal);
        if (value && allowed()) { setSelection(value); setSelectedId(null); setNotice('이미지를 선택했습니다. 앨범아트 적용을 눌러 저장해 주세요.'); }
      })} style={[styles.button, { borderColor: colors.separator }]}><Text style={{ color: colors.tint }}>이미지 파일 선택</Text></Pressable>
      <TextInput accessibilityLabel="앨범아트 검색 앨범명" value={albumQuery ?? album} onChangeText={setAlbumQuery} placeholder="앨범명" placeholderTextColor={colors.muted}
        editable={!busy} maxLength={300} style={[styles.input, { color: colors.text, borderColor: colors.separator }]} />
      <TextInput accessibilityLabel="앨범아트 검색 아티스트" value={artistQuery ?? artist} onChangeText={setArtistQuery} placeholder="아티스트" placeholderTextColor={colors.muted}
        editable={!busy} maxLength={300} style={[styles.input, { color: colors.text, borderColor: colors.separator }]} />
      <Pressable accessibilityRole="button" disabled={busy || !(albumQuery ?? album).trim() || !(artistQuery ?? artist).trim()} onPress={() => void work(async (signal, allowed) => {
        const candidates = await searchArtwork(albumQuery ?? album, artistQuery ?? artist, signal);
        if (allowed()) { setResults(candidates); setFailed([]); setSelectedId(null); }
      })} style={styles.button}><Text style={{ color: colors.tint }}>웹에서 앨범아트 찾기</Text></Pressable>
      <Text style={[styles.note, { color: colors.muted }]}>MusicBrainz·Cover Art Archive에 앨범명·아티스트를 보내 후보를 찾습니다. 이미지를 확인하고 선택해 주세요.</Text>
      {results?.length === 0 && <Text style={[styles.note, { color: colors.muted }]}>후보를 찾지 못했습니다. 검색어를 바꾸거나 이미지 파일을 선택해 주세요.</Text>}
      {results?.map(candidate => <Pressable key={candidate.id} accessibilityRole="button" accessibilityState={{ selected: selectedId === candidate.id }} disabled={busy || failed.includes(candidate.id)}
        onPress={() => { setSelectedId(candidate.id); setSelection(null); setNotice('후보를 선택했습니다. 앨범아트 적용을 눌러 저장해 주세요.'); }}
        style={[styles.candidate, { borderColor: selectedId === candidate.id ? colors.tint : colors.separator, opacity: failed.includes(candidate.id) ? 0.5 : 1 }]}>
        <Image source={{ uri: candidate.uri }} style={styles.thumbnail} resizeMode="cover" onError={() => setFailed(ids => ids.includes(candidate.id) ? ids : [...ids, candidate.id])} />
        <View style={{ flex: 1, gap: 4 }}><Text style={{ color: colors.text }}>{candidate.album}</Text><Text style={[styles.note, { color: colors.muted }]}>{candidate.artist} {candidate.year}</Text>
          {failed.includes(candidate.id) && <Text style={[styles.note, { color: colors.muted }]}>표지를 불러올 수 없습니다</Text>}</View>
      </Pressable>)}
      <View style={styles.row}><View style={{ flex: 1, gap: 5 }}><Text style={{ color: colors.text }}>같은 앨범의 곡에도 적용</Text>
        <Text style={[styles.note, { color: colors.muted }]}>{isPending || isFetching ? '현재 보관함의 앨범 곡 확인 중' : `현재 보관함의 같은 앨범 ${albumKeys.length}곡 · 끄면 이 곡만 변경`}</Text></View>
        <AnimatedSwitch accessibilityLabel="같은 앨범의 곡에도 앨범아트 적용" value={wholeAlbum} disabled={busy || isPending || isFetching || albumKeys.length < 2} onValueChange={setWholeAlbum} />
      </View>
      <View style={styles.row}><View style={{ flex: 1, gap: 5 }}><Text style={{ color: colors.text }}>파일에도 앨범아트 저장</Text>
        <Text style={[styles.note, { color: colors.muted }]}>{fileUnavailable ?? `선택한 표지를 MP3·FLAC 파일에 넣습니다. ${fileWriteDescription(currentSong)}${targetSongs.length !== fileTargets.length ? ` Google Drive ${targetSongs.length - fileTargets.length}곡은 앱 표시용으로만 적용합니다.` : ''}`}</Text></View>
        {driveReadOnly ? <Pressable accessibilityRole="button" accessibilityLabel="Google Drive 앨범아트 파일 직접 수정 안내" style={styles.button} disabled={busy} onPress={() => setToast({ message: DRIVE_FILE_READ_ONLY_MESSAGE })}>
          <View pointerEvents="none"><AnimatedSwitch accessibilityLabel="파일에도 앨범아트 저장" value={false} disabled onValueChange={() => {}} /></View>
        </Pressable> : <AnimatedSwitch accessibilityLabel="파일에도 앨범아트 저장" value={writeFile} disabled={busy || !writeFile && !!fileUnavailable}
          onValueChange={setWriteFile} />}
      </View>
      <Pressable accessibilityRole="button" disabled={busy || !selection && !selectedId && !(writeFile && key && store.patches[key]) || writeFile && !!fileUnavailable || wholeAlbum && (isPending || isFetching)} onPress={() => void work(async (signal, allowed) => {
        const { downloadArtwork } = await import('@/services/artwork/files');
        const image = selection ?? (selectedId ? await downloadArtwork(selectedId, signal) : writeFile && key ? store.patches[key] : null);
        if (!image || !allowed()) return;
        let written = 0;
        const applied = new Set<string>();
        if (writeFile && !driveReadOnly) {
          if (fileUnavailable) throw new Error(fileUnavailable);
          const { writeSongArtworkFile } = await import('@/services/metadata/write-song-file');
          const { libraryIdentity } = await import('@/features/library/repository');
          const identity = libraryIdentity(auth.mode, auth.session);
          try {
            for (const target of fileTargets) {
              if (!allowed() || !targetsVisible()) throw new Error('파일 저장 적용이 취소되었습니다.');
              const position = written + 1;
              const result = await writeSongArtworkFile(target, image, message => { if (mounted.current && controller.current?.signal === signal) setProgress(`${position}/${fileTargets.length}곡 · ${message}`); }, signal, () => allowed() && targetsVisible());
              written++;
              if (!allowed()) throw new Error('파일 저장 적용이 취소되었습니다.');
              if (!target.source || target.source === 'nas') queryClient.setQueryData<Page<Song>>(['song-library', identity], page => page ? {
                ...page, items: page.items.map(item => item.id === result.song.id ? result.song : item),
              } : page);
              // Publish each confirmed file write separately; bulk writes cannot be atomic across storage services.
              const targetKey = metadataKey(target, scope)!;
              await store.save([targetKey], image, () => allowed() && targetsVisible());
              applied.add(targetKey);
            }
          } catch (cause) {
            const message = `${written}곡의 파일에 앨범아트를 저장했습니다. 나머지 적용은 완료하지 못했습니다. ${cause instanceof Error ? cause.message : '연결을 확인해 주세요.'}`;
            if (mounted.current && written) setNotice(message);
            throw new Error(message);
          }
        }
        const remaining = keys.filter(id => !applied.has(id));
        try { if (remaining.length) await store.save(remaining, image, () => allowed() && targetsVisible()); }
        catch (cause) {
          const message = (written ? `${written}곡의 파일 저장은 완료했지만 나머지 앱 표시 저장은 완료하지 못했습니다. ` : '') + (cause instanceof Error ? cause.message : '다시 시도해 주세요.');
          if (mounted.current && written) setNotice(message);
          throw new Error(message);
        }
        if (allowed()) { setSelection(null); setSelectedId(null); setNotice(`${keys.length}곡의 앨범아트를 적용했습니다.${written ? ` 파일 ${written}곡에도 저장했습니다. 파일에 기록한 표지는 앱의 되돌리기로 복원되지 않습니다.` : ''}`); }
      })} style={[styles.button, { backgroundColor: colors.tint }]}><Text style={{ color: 'white', fontWeight: '700' }}>앨범아트 적용</Text></Pressable>
      {keys.some(id => !!store.patches[id]) && <Pressable accessibilityRole="button" disabled={busy || wholeAlbum && (isPending || isFetching)} onPress={() => void work(async (_signal, allowed) => {
        await store.save(keys, undefined, () => allowed() && targetsVisible());
        if (allowed()) { setSelection(null); setSelectedId(null); setNotice('앱의 앨범아트 수정을 지웠습니다. 원래 표지로 돌아갑니다.'); }
      })} style={styles.button}><Text style={{ color: colors.tint }}>원래 앨범아트로 되돌리기</Text></Pressable>}
      {progress && <Text accessibilityLiveRegion="polite" style={[styles.note, { color: colors.tint }]}>{progress}</Text>}
      {writeFile && <Text style={[styles.note, { color: colors.muted }]}>파일에 기록한 표지는 ‘원래 앨범아트로 되돌리기’로 복원되지 않습니다. NAS는 수정 전 백업을 남기며, S3·기기 음악은 해당 파일을 교체합니다.</Text>}
      {working && <><ActivityIndicator color={colors.tint} /><Pressable accessibilityRole="button" onPress={() => controller.current?.abort()} style={styles.button}><Text style={{ color: colors.muted }}>앨범아트 작업 취소</Text></Pressable></>}
      {notice && <Text accessibilityLiveRegion="polite" style={[styles.note, { color: colors.tint }]}>{notice}</Text>}
    </>}
    {(error || store.error || key !== originalKey) && <Text accessibilityRole="alert" style={{ color: colors.tint }}>{key !== originalKey ? '계정이 변경되었습니다. 곡 메뉴에서 다시 열어 주세요.' : error || store.error}</Text>}
    {store.loadError && <Pressable accessibilityRole="button" disabled={store.loading} onPress={() => void load(true)} style={styles.button}><Text style={{ color: colors.tint }}>앨범아트 수정 내용 다시 불러오기</Text></Pressable>}
    {toast && <ToastNotice message={toast.message} />}
  </View>;
}
const styles = StyleSheet.create({ body: { gap: 12, borderTopWidth: 1, paddingTop: 12 }, note: { fontSize: 12, lineHeight: 19 }, button: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  preview: { width: 160, height: 160, borderRadius: 12, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' }, input: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, candidate: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 10 }, thumbnail: { width: 64, height: 64, borderRadius: 8 } });
