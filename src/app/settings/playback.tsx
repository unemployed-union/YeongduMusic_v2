import { SettingsPage } from '@/features/settings/settings-ui';
import { StreamingQualitySettings } from '@/features/playback/streaming-quality-settings';
import { PlaybackOptionsSettings } from '@/features/playback/playback-options-settings';

export default function PlaybackSettingsScreen() {
  return <SettingsPage><StreamingQualitySettings /><PlaybackOptionsSettings /></SettingsPage>;
}
