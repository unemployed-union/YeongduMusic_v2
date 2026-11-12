import { useMemo, useState } from 'react';
import { foldersForSongs, normalizeFolder } from './rules';
import { buildFolderTree, visibleFolderRows, type FolderTreeRow } from './folder-tree';
import type { HiddenPreset } from '@/types/hidden-music';
import type { Song } from '@/types/music';

type Choice = ({ kind: 'folder' } & FolderTreeRow) | { kind: 'song'; song: Song };
export type PresetEditorProps = {
  preset: HiddenPreset;
  songs: Song[];
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (preset: HiddenPreset) => void;
  libraryLoading?: boolean;
  libraryError?: string | null;
  libraryStale?: boolean;
  onRetryLibrary?: () => void;
};

export function usePresetEditor(preset: HiddenPreset, songs: Song[]) {
  const [name, setName] = useState(preset.name);
  const [songIds, setSongIds] = useState(preset.songIds);
  const [folders, setFolders] = useState(() => preset.folders.map(normalizeFolder));
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [tab, setTab] = useState<'folder' | 'song'>('folder');
  const [term, setTerm] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const selectedSongs = useMemo(() => new Set(songIds), [songIds]);
  const selectedFolders = useMemo(() => new Set(folders), [folders]);
  const folderList = useMemo(() => foldersForSongs(songs), [songs]);
  const tree = useMemo(() => buildFolderTree(folderList, folders), [folderList, folders]);
  const filtering = !!term.trim() || selectedOnly;
  const choices = useMemo<Choice[]>(() => {
    if (tab === 'folder') {
      return visibleFolderRows(tree, expanded, selectedFolders, term, selectedOnly).map(
        (folder) => ({ kind: 'folder', ...folder }),
      );
    }
    const match = term.trim().normalize('NFKC').toLocaleLowerCase();
    return songs
      .filter(
        (song) =>
          (!selectedOnly || selectedSongs.has(song.id)) &&
          [song.title, song.artist, song.album, song.path ?? '']
            .join(' ')
            .normalize('NFKC')
            .toLocaleLowerCase()
            .includes(match),
      )
      .map((song) => ({ kind: 'song', song }));
  }, [tree, expanded, songs, tab, term, selectedOnly, selectedFolders, selectedSongs]);
  function toggle(choice: Choice) {
    if (choice.kind === 'folder') {
      setFolders((current) =>
        current.includes(choice.path)
          ? current.filter((item) => item !== choice.path)
          : [...current, choice.path],
      );
    } else {
      setSongIds((current) =>
        current.includes(choice.song.id)
          ? current.filter((item) => item !== choice.song.id)
          : [...current, choice.song.id],
      );
    }
  }
  function toggleExpanded(path: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }
  return {
    name,
    setName,
    songIds,
    folders,
    tab,
    setTab,
    term,
    setTerm,
    selectedOnly,
    setSelectedOnly,
    selectedSongs,
    selectedFolders,
    choices,
    tree,
    filtering,
    toggle,
    toggleExpanded,
  };
}
