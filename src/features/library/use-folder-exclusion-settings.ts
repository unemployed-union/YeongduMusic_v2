import { useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { Directory } from 'expo-file-system';
import { buildFolderTree, visibleFolderRows } from '@/features/hidden-music/folder-tree';
import { availableLocalFolders, localFolderKey } from '@/services/local-music/folders';
import { useFolderExclusionStore } from '@/stores/folder-exclusions';
import { useLocalMusicStore } from '@/stores/local-music';

export function useFolderExclusionSettings() {
  const exclusions = useFolderExclusionStore();
  const local = useLocalMusicStore();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pendingPick, setPendingPick] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [term, setTerm] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const folders = useMemo(() => availableLocalFolders(local.allSongs), [local.allSongs]);
  const tree = useMemo(
    () => buildFolderTree(folders, exclusions.folders),
    [folders, exclusions.folders],
  );
  const selected = useMemo(() => new Set(exclusions.folders), [exclusions.folders]);
  const rows = useMemo(
    () => visibleFolderRows(tree, expanded, selected, term),
    [tree, expanded, selected, term],
  );
  const busy = exclusions.loading || exclusions.saving || local.busy || picking;
  const disabled = busy || !exclusions.ready;
  const unknown = useMemo(
    () =>
      local.allSongs.filter(
        (song) => song.source === 'local' && !song.local.originalFolders?.length,
      ).length,
    [local.allSongs],
  );
  async function save(next: string[]) {
    setMessage(null);
    try {
      await exclusions.setFolders(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '제외 폴더를 저장하지 못했습니다.');
    }
  }
  async function pickFolder() {
    setPicking(true);
    setMessage(null);
    try {
      const directory = await Directory.pickDirectoryAsync();
      if (directory) {
        await save([...useFolderExclusionStore.getState().folders, localFolderKey(directory.uri)]);
      }
    } catch (error) {
      const code = (error as { code?: string } | null)?.code ?? '';
      if (!/^ERR_(FILE_PICKING|PICKER)_CANCELLED$/.test(code)) {
        setMessage(error instanceof Error ? error.message : '폴더를 선택하지 못했습니다.');
      }
    } finally {
      setPicking(false);
      setOpen(true);
    }
  }
  function startPick() {
    setOpen(false);
    if (Platform.OS === 'ios') {
      setPendingPick(true);
    } else {
      void pickFolder();
    }
  }
  return {
    exclusions,
    local,
    open,
    setOpen,
    picking,
    pendingPick,
    setPendingPick,
    message,
    term,
    setTerm,
    expanded,
    setExpanded,
    selected,
    rows,
    busy,
    disabled,
    unknown,
    save,
    pickFolder,
    startPick,
  };
}
