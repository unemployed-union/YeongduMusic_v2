import { HiddenSettingsGate } from '@/features/hidden-music/settings-gate';
import { HiddenPlaylistManager } from '@/features/playlists/hidden-playlist-manager';

export default function HiddenPlaylistsScreen() {
  return <HiddenSettingsGate><HiddenPlaylistManager /></HiddenSettingsGate>;
}
