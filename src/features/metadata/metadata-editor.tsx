import { PlaylistSheet } from '@/features/playlists/dialogs';
import { MetadataEditorForm } from './metadata-editor-form';
import type { Song } from '@/types/music';

export function MetadataEditor({ song, onClose }: { song: Song; onClose: () => void }) {
  return <PlaylistSheet title="메타데이터 수정" onClose={onClose}><MetadataEditorForm song={song} onSaved={onClose} onCancel={onClose} /></PlaylistSheet>;
}
